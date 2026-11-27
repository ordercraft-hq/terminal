package providers

import (
	"context"
	"testing"
	"time"

	"github.com/ordercraft-hq/terminal/internal/datafeed"
)

func TestOandaGranularityNormalization(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"1s", "S5"},
		{"5s", "S5"},
		{"10s", "S10"},
		{"15s", "S15"},
		{"30s", "S30"},
		{"1m", "M1"},
		{"2m", "M2"},
		{"4m", "M4"},
		{"5m", "M5"},
		{"10m", "M10"},
		{"15m", "M15"},
		{"30m", "M30"},
		{"1h", "H1"},
		{"2h", "H2"},
		{"3h", "H3"},
		{"4h", "H4"},
		{"6h", "H6"},
		{"8h", "H8"},
		{"12h", "H12"},
		{"1D", "D"},
		{"1d", "D"},
		{"1W", "W"},
		{"1w", "W"},
		{"1M", "M"},
		{"1MO", "M"},
	}

	for _, tt := range tests {
		actual := normalizeOandaGranularity(tt.input)
		if actual != tt.expected {
			t.Errorf("normalizeOandaGranularity(%q) = %q; want %q", tt.input, actual, tt.expected)
		}
	}
}

func TestOandaSupportedResolutions(t *testing.T) {
	p := NewOandaProvider()
	defer p.Close()

	res := p.SupportedResolutions()
	if len(res) != 21 {
		t.Fatalf("Expected 21 OANDA supported resolutions, got %d: %v", len(res), res)
	}

	expected := []string{
		"5s", "10s", "15s", "30s",
		"1m", "2m", "4m", "5m", "10m", "15m", "30m",
		"1h", "2h", "3h", "4h", "6h", "8h", "12h",
		"1d", "1w", "1M",
	}

	for i, exp := range expected {
		if res[i] != exp {
			t.Errorf("res[%d] = %q; want %q", i, res[i], exp)
		}
	}
}

func TestOandaSearch(t *testing.T) {
	p := NewOandaProvider()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// 1. When unconfigured, search must return 0 results (unconnected provider symbols are never shown)
	results, err := p.Search(ctx, "EUR")
	if err != nil {
		t.Fatalf("Search failed: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("Expected 0 results for unconfigured OANDA, got %d", len(results))
	}

	// 2. When configured with instruments, search returns matching results
	p.SetCredentials("mock-account", "mock-token", "practice")
	p.symbolsMu.Lock()
	p.cachedSymbols = []datafeed.SymbolInfo{
		{Symbol: "EUR_USD", FullSymbol: "OANDA:EUR_USD", Description: "Euro / US Dollar", Exchange: "OANDA", Type: "forex", PriceScale: 100000},
	}
	p.symbolsMu.Unlock()

	results, err = p.Search(ctx, "EUR")
	if err != nil {
		t.Fatalf("Search after config failed: %v", err)
	}
	if len(results) == 0 {
		t.Fatalf("Expected results for 'EUR' after configuration, got 0")
	}
	if results[0].Symbol != "EUR_USD" {
		t.Errorf("Expected EUR_USD, got %s", results[0].Symbol)
	}
}

func TestOandaLivePricingStream(t *testing.T) {
	p := NewOandaProvider()
	defer p.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	received := make(chan datafeed.Candle, 20)
	err := p.Subscribe(ctx, "NAS100_USD", "15m", func(c datafeed.Candle) {
		received <- c
	})
	if err != nil {
		t.Fatalf("Subscribe failed: %v", err)
	}

	count := 0
	deadline := time.After(6 * time.Second)
	for {
		select {
		case c := <-received:
			count++
			t.Logf("OANDA live tick #%d: time=%d, O=%f, H=%f, L=%f, C=%f, V=%f",
				count, c.Time, c.Open, c.High, c.Low, c.Close, c.Volume)
			if count >= 3 {
				_ = p.Unsubscribe("NAS100_USD", "15m")
				return
			}
		case <-deadline:
			if count == 0 {
				t.Logf("No live stream ticks received within 6s (acceptable if markets closed or network offline)")
			} else {
				t.Logf("Received %d ticks before deadline", count)
			}
			return
		}
	}
}

func TestOandaStreamClientPooledAndNoRedundantTeardown(t *testing.T) {
	p := NewOandaProvider()
	defer p.Close()

	if p.streamClient == nil || p.streamClient.Transport == nil {
		t.Fatal("expected reusable pooled streamClient on OandaProvider")
	}
	if p.httpClient == nil || p.httpClient.Transport != datafeed.SharedHTTPTransport {
		t.Fatal("expected httpClient to use SharedHTTPTransport")
	}

	// Simulate an active stream on EUR_USD and ensure subscribing another timeframe
	// for EUR_USD does not cancel the existing multiplexed stream.
	cancelled := false
	p.streamMu.Lock()
	p.currentStreamSymbols["EUR_USD"] = true
	p.activeStreamSymbols["EUR_USD"] = true
	p.streamCancel = func() { cancelled = true }
	p.streamMu.Unlock()

	if err := p.Subscribe(context.Background(), "OANDA:EUR_USD", "5m", func(c datafeed.Candle) {}); err != nil {
		t.Fatalf("Subscribe failed: %v", err)
	}
	time.Sleep(100 * time.Millisecond)
	if cancelled {
		t.Fatal("expected Subscribe on already-streaming symbol not to tear down multiplexed stream")
	}
}

func TestOandaRolloverPreservesNaturalGap(t *testing.T) {
	// Even on immediate next-bar rollover, opening price comes naturally from the live quote
	// rather than artificially clamping Open to the prior bar Close.
	next := openStreamBar(1700000100, 25660)
	if next.Open != 25660 || next.High != 25660 || next.Low != 25660 || next.Close != 25660 {
		t.Fatalf("unexpected natural rollover bar: %+v", next)
	}

	gapped := openStreamBar(1700000340, 25750)
	if gapped.Open != 25750 {
		t.Fatalf("gapped rollover Open = %v; want 25750", gapped.Open)
	}
}

func TestOandaReconcileActiveBar(t *testing.T) {
	streamBar := &datafeed.Candle{
		Time:   1700000060,
		Open:   25660,
		High:   25665,
		Low:    25655,
		Close:  25659,
		Volume: 12,
	}
	restBar := datafeed.Candle{
		Time:   1700000060,
		Open:   25673,
		High:   25674,
		Low:    25655,
		Close:  25657,
		Volume: 48,
	}

	// Fresh live ticks keep live Close while adopting authoritative REST Open/High/Low/Volume.
	mergedFresh := reconcileActiveBar(streamBar, restBar, true)
	if mergedFresh.Open != 25673 || streamBar.Open != 25673 {
		t.Fatalf("expected authoritative REST Open 25673, got merged=%v stored=%v", mergedFresh.Open, streamBar.Open)
	}
	if mergedFresh.High != 25674 {
		t.Fatalf("expected merged High 25674, got %v", mergedFresh.High)
	}
	if mergedFresh.Close != 25659 {
		t.Fatalf("expected fresh tick Close 25659 preserved, got %v", mergedFresh.Close)
	}
	if mergedFresh.Volume != 48 {
		t.Fatalf("expected merged Volume 48, got %v", mergedFresh.Volume)
	}

	// Quiet/stale ticks adopt REST Close too.
	mergedQuiet := reconcileActiveBar(streamBar, restBar, false)
	if mergedQuiet.Close != 25657 || streamBar.Close != 25657 {
		t.Fatalf("expected quiet session Close 25657 from REST, got merged=%v stored=%v", mergedQuiet.Close, streamBar.Close)
	}
}
