package datafeed

import (
	"context"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// mockProvider implements DataProvider for testing the Coordinator.
type mockProvider struct {
	name    string
	candles []Candle
}

func (m *mockProvider) Name() string {
	return m.name
}

func (m *mockProvider) SupportedResolutions() []string {
	return []string{"1m", "5m", "15m", "1h", "1d"}
}

func (m *mockProvider) GetHistory(ctx context.Context, symbol, resolution string, from, to int64, count int) ([]Candle, error) {
	var result []Candle
	for _, c := range m.candles {
		if (from == 0 || c.Time >= from) && (to == 0 || c.Time <= to) {
			result = append(result, c)
		}
	}
	if len(result) > count {
		result = result[len(result)-count:]
	}
	return result, nil
}

func (m *mockProvider) Search(ctx context.Context, query string) ([]SymbolInfo, error) {
	return []SymbolInfo{
		{
			Symbol:      "TEST",
			FullSymbol:  m.name + ":TEST",
			Description: "Test Symbol",
			Exchange:    m.name,
			Type:        "crypto",
			PriceScale:  100,
		},
	}, nil
}

func (m *mockProvider) Subscribe(ctx context.Context, symbol, resolution string, onCandle func(c Candle)) error {
	return nil
}

func (m *mockProvider) Unsubscribe(symbol, resolution string) error {
	return nil
}

func TestCoordinatorResolutionAndRouting(t *testing.T) {
	coord := NewCoordinator()
	p1 := &mockProvider{name: "BINANCE"}
	p2 := &mockProvider{name: "OANDA"}
	coord.RegisterProvider(p1)
	coord.RegisterProvider(p2)

	// Test prefix routing
	prov, sym, err := coord.ResolveProvider("OANDA:EUR_USD")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if prov.Name() != "OANDA" || sym != "EUR_USD" {
		t.Fatalf("expected OANDA and EUR_USD, got %s and %s", prov.Name(), sym)
	}

	// Test default fallback without prefix
	prov, sym, err = coord.ResolveProvider("BTCUSDT")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if prov.Name() != "BINANCE" || sym != "BTCUSDT" {
		t.Fatalf("expected BINANCE and BTCUSDT, got %s and %s", prov.Name(), sym)
	}

	// Test explicit unconfigured provider prefix must fail, never silently fallback to Binance
	_, _, err = coord.ResolveProvider("TWELVEDATA:AAPL")
	if err == nil {
		t.Fatalf("expected error for unconfigured provider TWELVEDATA:AAPL, but got nil")
	}
	if !strings.Contains(err.Error(), `provider "TWELVEDATA" is not configured or supported`) {
		t.Fatalf("unexpected error message: %v", err)
	}
}

func TestCoordinatorAggregation(t *testing.T) {
	coord := NewCoordinator()

	// 10 consecutive 1m bars from 0 to 540 (9 mins)
	baseBars := make([]Candle, 10)
	for i := 0; i < 10; i++ {
		baseBars[i] = Candle{
			Time:   int64(i * 60),
			Open:   100.0 + float64(i),
			High:   105.0 + float64(i),
			Low:    95.0 + float64(i),
			Close:  102.0 + float64(i),
			Volume: 10,
		}
	}

	prov := &mockProvider{
		name:    "MOCK",
		candles: baseBars,
	}
	coord.RegisterProvider(prov)

	// Request 3m timeframe ("3m" is not in standard native list in isNativeResolution or requires aggregation)
	candles, err := coord.GetCandles(context.Background(), "MOCK:TEST", "3m", 0, 0, 10)
	if err != nil {
		t.Fatalf("GetCandles failed: %v", err)
	}

	// 10 minutes (0 to 9m) aggregated into 3m buckets -> buckets: 0..179, 180..359, 360..539, 540..
	if len(candles) != 4 {
		t.Fatalf("expected 4 aggregated candles, got %d", len(candles))
	}
	if candles[0].Time != 0 {
		t.Fatalf("expected bucket time 0, got %d", candles[0].Time)
	}
	if candles[0].Open != 100.0 {
		t.Fatalf("expected open 100.0, got %f", candles[0].Open)
	}
	if candles[0].Volume != 30.0 {
		t.Fatalf("expected volume 30.0, got %f", candles[0].Volume)
	}
}

type configurableMockProvider struct {
	mockProvider
	configured bool
}

func (c *configurableMockProvider) IsConfigured() bool {
	return c.configured
}

func TestCoordinatorSearchUnconfiguredProviderSkipped(t *testing.T) {
	coord := NewCoordinator()
	p := &configurableMockProvider{
		mockProvider: mockProvider{name: "UNCONFIGURED"},
		configured:   false,
	}
	coord.RegisterProvider(p)

	// Search when unconfigured: symbols must NOT appear
	results, err := coord.SearchSymbols(context.Background(), "TEST")
	if err != nil {
		t.Fatalf("SearchSymbols failed: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("Expected 0 results for unconfigured provider, got %d", len(results))
	}

	// Search after configured: symbols now appear
	p.configured = true
	results, err = coord.SearchSymbols(context.Background(), "TEST")
	if err != nil {
		t.Fatalf("SearchSymbols failed: %v", err)
	}
	if len(results) == 0 {
		t.Fatalf("Expected results after provider configured, got 0")
	}
	if results[0].Symbol != "TEST" {
		t.Errorf("Expected symbol TEST, got %s", results[0].Symbol)
	}
}

type slowHistoryMockProvider struct {
	mockProvider
	calls atomic.Int32
	delay time.Duration
}

func (s *slowHistoryMockProvider) GetHistory(ctx context.Context, symbol, resolution string, from, to int64, count int) ([]Candle, error) {
	s.calls.Add(1)
	select {
	case <-time.After(s.delay):
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	return s.mockProvider.GetHistory(ctx, symbol, resolution, from, to, count)
}

func (s *slowHistoryMockProvider) Search(ctx context.Context, query string) ([]SymbolInfo, error) {
	select {
	case <-time.After(s.delay):
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	return s.mockProvider.Search(ctx, query)
}

func TestCoordinatorGetCandlesSingleFlight(t *testing.T) {
	coord := NewCoordinator()
	prov := &slowHistoryMockProvider{
		mockProvider: mockProvider{
			name: "SLOW",
			candles: []Candle{
				{Time: 100, Open: 10, High: 12, Low: 9, Close: 11, Volume: 5},
				{Time: 160, Open: 11, High: 13, Low: 10, Close: 12, Volume: 6},
			},
		},
		delay: 40 * time.Millisecond,
	}
	coord.RegisterProvider(prov)

	const goroutines = 12
	var wg sync.WaitGroup
	errs := make(chan error, goroutines)
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			bars, err := coord.GetCandles(context.Background(), "SLOW:TEST", "1m", 0, 0, 2)
			if err != nil {
				errs <- err
				return
			}
			if len(bars) != 2 {
				errs <- context.DeadlineExceeded
			}
		}()
	}
	wg.Wait()
	close(errs)

	for err := range errs {
		t.Fatalf("concurrent GetCandles failed: %v", err)
	}
	if got := prov.calls.Load(); got != 1 {
		t.Fatalf("expected 1 coalesced GetHistory call via singleflight, got %d", got)
	}
}

func TestCoordinatorSearchColdRemoteNotDropped(t *testing.T) {
	coord := NewCoordinator()
	prov := &slowHistoryMockProvider{
		mockProvider: mockProvider{name: "REMOTE"},
		delay:        300 * time.Millisecond,
	}
	coord.RegisterProvider(prov)

	results, err := coord.SearchSymbols(context.Background(), "TEST")
	if err != nil {
		t.Fatalf("SearchSymbols failed: %v", err)
	}
	if len(results) != 1 || results[0].FullSymbol != "REMOTE:TEST" {
		t.Fatalf("expected remote result despite 300ms cold delay, got %+v", results)
	}
}

func TestCoordinatorLiveCacheTTLIsShort(t *testing.T) {
	coord := NewCoordinator()
	prov := &slowHistoryMockProvider{
		mockProvider: mockProvider{
			name:    "LIVE",
			candles: []Candle{{Time: 100, Open: 1, High: 2, Low: 1, Close: 2, Volume: 1}},
		},
	}
	coord.RegisterProvider(prov)

	// Live query (to == 0) should be cached briefly (~1.5s) and not serve 10s-stale data
	if _, err := coord.GetCandles(context.Background(), "LIVE:TEST", "1m", 0, 0, 1); err != nil {
		t.Fatalf("first live GetCandles failed: %v", err)
	}
	if _, err := coord.GetCandles(context.Background(), "LIVE:TEST", "1m", 0, 0, 1); err != nil {
		t.Fatalf("second live GetCandles failed: %v", err)
	}
	if got := prov.calls.Load(); got != 1 {
		t.Fatalf("expected immediate repeat live query to hit short cache, calls=%d", got)
	}

	time.Sleep(1600 * time.Millisecond)

	if _, err := coord.GetCandles(context.Background(), "LIVE:TEST", "1m", 0, 0, 1); err != nil {
		t.Fatalf("post-expiry live GetCandles failed: %v", err)
	}
	if got := prov.calls.Load(); got != 2 {
		t.Fatalf("expected live cache entry to expire within ~1.5s, calls=%d", got)
	}
}

func TestDeduplicateAndSort(t *testing.T) {
	sorted := []Candle{{Time: 10, Close: 1}, {Time: 20, Close: 2}, {Time: 30, Close: 3}}
	gotSorted := deduplicateAndSort(sorted)
	if len(gotSorted) != 3 || gotSorted[0].Time != 10 || gotSorted[2].Time != 30 {
		t.Fatalf("unexpected sorted result: %+v", gotSorted)
	}

	unsortedDup := []Candle{{Time: 30, Close: 3}, {Time: 10, Close: 1}, {Time: 20, Close: 2}, {Time: 20, Close: 22}}
	got := deduplicateAndSort(unsortedDup)
	if len(got) != 3 || got[0].Time != 10 || got[1].Time != 20 || got[2].Time != 30 {
		t.Fatalf("unexpected deduplicateAndSort result: %+v", got)
	}
}
