package providers

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/ordercraft-hq/terminal/internal/datafeed"
)

func TestAlpacaProviderNameAndResolutions(t *testing.T) {
	ap := NewAlpacaProvider()
	if ap.Name() != "ALPACA" {
		t.Fatalf("Expected ALPACA, got %s", ap.Name())
	}

	res := ap.SupportedResolutions()
	if len(res) < 6 {
		t.Fatalf("Expected at least 6 resolutions, got %d", len(res))
	}
}

func TestNormalizeAlpacaSymbol(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"AAPL", "AAPL"},
		{"aapl", "AAPL"},
		{"ALPACA:AAPL", "AAPL"},
		{"alpaca:tsla", "TSLA"},
		{"ALPACA:BTC/USD", "BTC/USD"},
		{"BTC/USD", "BTC/USD"},
	}

	for _, tt := range tests {
		got := normalizeAlpacaSymbol(tt.input)
		if got != tt.expected {
			t.Errorf("normalizeAlpacaSymbol(%q) = %q, expected %q", tt.input, got, tt.expected)
		}
	}
}

func TestNormalizeAlpacaTimeframe(t *testing.T) {
	tests := []struct {
		res       string
		expectedT string
		needAgg   bool
	}{
		{"1m", "1Min", false},
		{"1", "1Min", false},
		{"5m", "5Min", false},
		{"15m", "15Min", false},
		{"30m", "30Min", false},
		{"1h", "1Hour", false},
		{"60", "1Hour", false},
		{"1d", "1Day", false},
		{"1w", "1Week", false},
		{"1M", "1Month", false},
		{"2h", "1Hour", true},
		{"4h", "1Hour", true},
	}

	for _, tt := range tests {
		tf, needAgg, _ := normalizeAlpacaTimeframe(tt.res)
		if tf != tt.expectedT || needAgg != tt.needAgg {
			t.Errorf("normalizeAlpacaTimeframe(%q) = (%q, %v), expected (%q, %v)",
				tt.res, tf, needAgg, tt.expectedT, tt.needAgg)
		}
	}
}

func TestAlpacaGetHistoryMock(t *testing.T) {
	mockBody := `{
		"bars": [
			{
				"t": "2026-10-30T14:30:00Z",
				"o": 150.0,
				"h": 151.5,
				"l": 149.8,
				"c": 151.2,
				"v": 10500,
				"n": 120,
				"vw": 150.8
			},
			{
				"t": "2026-10-30T14:31:00Z",
				"o": 151.2,
				"h": 152.0,
				"l": 151.0,
				"c": 151.9,
				"v": 8200,
				"n": 95,
				"vw": 151.6
			}
		],
		"symbol": "AAPL"
	}`

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("APCA-API-KEY-ID") == "" || r.Header.Get("APCA-API-SECRET-KEY") == "" {
			t.Errorf("Expected APCA auth headers, got missing")
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, mockBody)
	}))
	defer ts.Close()

	ap := NewAlpacaProvider()
	ap.dataURL = ts.URL
	ap.apiKey = "test-key"
	ap.apiSecret = "test-secret"

	candles, err := ap.GetHistory(context.Background(), "AAPL", "1m", 1700000000, 1700001000, 10)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}

	if len(candles) != 2 {
		t.Fatalf("Expected 2 candles, got %d", len(candles))
	}

	expectedT1, _ := time.Parse(time.RFC3339, "2026-10-30T14:30:00Z")
	if candles[0].Time != expectedT1.Unix() {
		t.Errorf("Expected first candle time %d, got %d", expectedT1.Unix(), candles[0].Time)
	}
	if candles[0].Open != 150.0 {
		t.Errorf("Expected open 150.0, got %f", candles[0].Open)
	}
	if candles[0].Close != 151.2 {
		t.Errorf("Expected close 151.2, got %f", candles[0].Close)
	}
	if candles[0].Volume != 10500 {
		t.Errorf("Expected volume 10500, got %f", candles[0].Volume)
	}

	expectedT2, _ := time.Parse(time.RFC3339, "2026-10-30T14:31:00Z")
	if candles[1].Time != expectedT2.Unix() {
		t.Errorf("Expected second candle time %d, got %d", expectedT2.Unix(), candles[1].Time)
	}
}

func TestAlpacaSearch(t *testing.T) {
	ap := NewAlpacaProvider()

	// 1. When unconfigured, search must return 0 results (unconnected provider symbols are never shown)
	results, err := ap.Search(context.Background(), "AAPL")
	if err != nil {
		t.Fatalf("Search failed: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("Expected 0 results for unconfigured Alpaca, got %d", len(results))
	}

	// 2. When configured with instruments, search returns matching results
	ap.SetCredentials("mock_key", "mock_secret")
	ap.symbolsMu.Lock()
	ap.cachedSymbols = []datafeed.SymbolInfo{
		{Symbol: "AAPL", FullSymbol: "ALPACA:AAPL", Description: "Apple Inc.", Exchange: "ALPACA", Type: "stock", PriceScale: 100},
		{Symbol: "BTC/USD", FullSymbol: "ALPACA:BTC/USD", Description: "Bitcoin / USD", Exchange: "ALPACA", Type: "crypto", PriceScale: 100},
	}
	ap.symbolsMu.Unlock()

	results, err = ap.Search(context.Background(), "AAPL")
	if err != nil {
		t.Fatalf("Search failed: %v", err)
	}
	if len(results) == 0 {
		t.Fatalf("Expected search results for AAPL, got 0")
	}
	if results[0].Symbol != "AAPL" {
		t.Errorf("Expected first result to be AAPL, got %s", results[0].Symbol)
	}
	if results[0].Exchange != "ALPACA" {
		t.Errorf("Expected exchange ALPACA, got %s", results[0].Exchange)
	}

	// Search for crypto pair
	cResults, err := ap.Search(context.Background(), "BTC")
	if err != nil {
		t.Fatalf("Search failed for BTC: %v", err)
	}
	if len(cResults) == 0 {
		t.Fatalf("Expected results for BTC, got 0")
	}
}

func TestAlpacaLiveGetHistory(t *testing.T) {
	ap := NewAlpacaProvider()
	if ap.apiKey == "" || ap.apiSecret == "" {
		t.Skip("Alpaca credentials not configured, skipping live test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Query AAPL 15m historical candles
	candles, err := ap.GetHistory(ctx, "AAPL", "15m", 0, 0, 20)
	if err != nil {
		t.Fatalf("Live GetHistory for AAPL failed: %v", err)
	}

	if len(candles) == 0 {
		t.Fatalf("Expected at least 1 candle from live Alpaca API, got 0")
	}

	t.Logf("Successfully fetched %d candles for AAPL from Alpaca. Latest Close: %f, Time: %s",
		len(candles), candles[len(candles)-1].Close, time.Unix(candles[len(candles)-1].Time, 0).UTC().Format(time.RFC3339))

	// Query AAPL Daily (1d) candles
	dailyCandles, err := ap.GetHistory(ctx, "AAPL", "1d", 0, 0, 10)
	if err != nil {
		t.Fatalf("Live GetHistory for AAPL 1d failed: %v", err)
	}
	if len(dailyCandles) == 0 {
		t.Fatalf("Expected at least 1 daily candle for AAPL, got 0")
	}
	t.Logf("Successfully fetched %d daily candles for AAPL. Latest Close: %f, Time: %s",
		len(dailyCandles), dailyCandles[len(dailyCandles)-1].Close, time.Unix(dailyCandles[len(dailyCandles)-1].Time, 0).UTC().Format(time.RFC3339))

	// Query BTC/USD crypto candles
	cryptoCandles, err := ap.GetHistory(ctx, "BTC/USD", "15m", 0, 0, 10)
	if err != nil {
		t.Fatalf("Live GetHistory for BTC/USD failed: %v", err)
	}
	if len(cryptoCandles) == 0 {
		t.Fatalf("Expected at least 1 crypto candle for BTC/USD, got 0")
	}
	t.Logf("Successfully fetched %d crypto candles for BTC/USD. Latest Close: %f",
		len(cryptoCandles), cryptoCandles[len(cryptoCandles)-1].Close)
}

func TestAlpacaWebSocketAuthAndSubscription(t *testing.T) {
	ap := NewAlpacaProvider()
	if ap.apiKey == "" || ap.apiSecret == "" {
		t.Skip("Alpaca credentials not configured, skipping WebSocket test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	received := make(chan bool, 1)
	err := ap.Subscribe(ctx, "AAPL", "1m", func(c datafeed.Candle) {
		select {
		case received <- true:
		default:
		}
	})
	if err != nil {
		t.Fatalf("Subscribe failed: %v", err)
	}

	// Give it a moment to connect and authenticate
	time.Sleep(1500 * time.Millisecond)

	// Unsubscribe cleanly
	err = ap.Unsubscribe("AAPL", "1m")
	if err != nil {
		t.Fatalf("Unsubscribe failed: %v", err)
	}
}
