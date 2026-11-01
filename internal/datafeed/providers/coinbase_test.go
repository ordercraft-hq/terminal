package providers

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCoinbaseProviderNameAndResolutions(t *testing.T) {
	cp := NewCoinbaseProvider()
	if cp.Name() != "COINBASE" {
		t.Fatalf("Expected COINBASE, got %s", cp.Name())
	}

	res := cp.SupportedResolutions()
	if len(res) < 6 {
		t.Fatalf("Expected at least 6 resolutions, got %d", len(res))
	}
}

func TestNormalizeCoinbaseProduct(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"BTC-USD", "BTC-USD"},
		{"btc-usd", "BTC-USD"},
		{"COINBASE:BTC-USD", "BTC-USD"},
		{"COINBASE:BTCUSD", "BTC-USD"},
		{"BTCUSD", "BTC-USD"},
		{"ETHUSDT", "ETH-USDT"},
		{"SOLUSDC", "SOL-USDC"},
		{"BTCEUR", "BTC-EUR"},
		{"ETHBTC", "ETH-BTC"},
	}

	for _, tt := range tests {
		got := normalizeCoinbaseProduct(tt.input)
		if got != tt.expected {
			t.Errorf("normalizeCoinbaseProduct(%q) = %q, expected %q", tt.input, got, tt.expected)
		}
	}
}

func TestCoinbaseGetHistoryMock(t *testing.T) {
	// Mock Coinbase candles JSON: [[time, low, high, open, close, volume], ...]
	// Note: newest first
	mockBody := `[
		[1700000900, 35100.0, 35300.0, 35150.0, 35250.0, 15.5],
		[1700000000, 35000.0, 35200.0, 35050.0, 35150.0, 12.0]
	]`

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/products" {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`[]`))
			return
		}
		if r.Header.Get("User-Agent") == "" {
			t.Errorf("Expected User-Agent header, got empty")
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, mockBody)
	}))
	defer ts.Close()

	cp := NewCoinbaseProvider()
	cp.SetBaseURL(ts.URL)

	candles, err := cp.GetHistory(context.Background(), "BTC-USD", "15m", 1699990000, 1700001000, 100)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}

	if len(candles) != 2 {
		t.Fatalf("Expected 2 candles, got %d", len(candles))
	}

	// Must be in chronological order (oldest first)
	if candles[0].Time != 1700000000 {
		t.Errorf("Expected first candle time 1700000000, got %d", candles[0].Time)
	}
	if candles[0].Open != 35050.0 {
		t.Errorf("Expected open 35050.0, got %f", candles[0].Open)
	}
	if candles[0].Close != 35150.0 {
		t.Errorf("Expected close 35150.0, got %f", candles[0].Close)
	}
	if candles[1].Time != 1700000900 {
		t.Errorf("Expected second candle time 1700000900, got %d", candles[1].Time)
	}
}

func TestCoinbaseSearch(t *testing.T) {
	cp := NewCoinbaseProvider()

	// Immediate seeded search should find BTC
	results, err := cp.Search(context.Background(), "BTC")
	if err != nil {
		t.Fatalf("Search failed: %v", err)
	}
	if len(results) == 0 {
		t.Fatalf("Expected to find BTC in seeded symbols")
	}

	found := false
	for _, s := range results {
		if s.Symbol == "BTC-USD" && s.Exchange == "COINBASE" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("Expected to find COINBASE:BTC-USD")
	}
}
