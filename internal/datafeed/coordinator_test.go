package datafeed

import (
	"context"
	"strings"
	"testing"
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
