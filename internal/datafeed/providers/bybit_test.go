package providers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestBybitProvider_Basics(t *testing.T) {
	bp := NewBybitProvider()
	if bp.Name() != "BYBIT" {
		t.Fatalf("expected Name() = 'BYBIT', got '%s'", bp.Name())
	}

	resolutions := bp.SupportedResolutions()
	if len(resolutions) == 0 {
		t.Fatalf("expected supported resolutions, got empty")
	}

	expectedIntervals := map[string]bool{
		"1m": true, "3m": true, "5m": true, "15m": true, "30m": true,
		"1h": true, "2h": true, "4h": true, "6h": true, "12h": true,
		"1d": true, "1w": true, "1M": true,
	}
	for _, r := range resolutions {
		delete(expectedIntervals, r)
	}
	if len(expectedIntervals) > 0 {
		t.Fatalf("missing expected intervals: %v", expectedIntervals)
	}
}

func TestBybitProvider_IntervalNormalization(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"1m", "1"},
		{"3m", "3"},
		{"5m", "5"},
		{"15m", "15"},
		{"30m", "30"},
		{"1h", "60"},
		{"2h", "120"},
		{"4h", "240"},
		{"6h", "360"},
		{"12h", "720"},
		{"1d", "D"},
		{"1w", "W"},
		{"1M", "M"},
		{"1MTH", "M"},
		{"unknown", "15"},
	}

	for _, tc := range tests {
		actual := normalizeBybitInterval(tc.input)
		if actual != tc.expected {
			t.Errorf("normalizeBybitInterval(%q) = %q, expected %q", tc.input, actual, tc.expected)
		}
	}
}

func TestBybitProvider_GetHistory_Mock(t *testing.T) {
	mockResponse := `{
		"retCode": 0,
		"retMsg": "OK",
		"result": {
			"category": "linear",
			"symbol": "BTCUSDT",
			"list": [
				["1670608860000", "17060.0", "17080.0", "17050.0", "17075.0", "12.5", "213437.5"],
				["1670608800000", "17050.0", "17065.0", "17040.0", "17060.0", "10.0", "170600.0"]
			]
		}
	}`

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v5/market/instruments-info" {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"retCode": 0, "result": {"list": []}}`))
			return
		}
		if r.URL.Path != "/v5/market/kline" {
			t.Errorf("unexpected path: %s", r.URL.Path)
			return
		}
		q := r.URL.Query()
		if q.Get("symbol") != "BTCUSDT" {
			t.Errorf("expected symbol BTCUSDT, got %s", q.Get("symbol"))
		}
		if q.Get("category") != "linear" {
			t.Errorf("expected category linear, got %s", q.Get("category"))
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(mockResponse))
	}))
	defer server.Close()

	bp := NewBybitProvider()
	bp.SetBaseURL(server.URL)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	candles, err := bp.GetHistory(ctx, "BYBIT:BTCUSDT", "1m", 0, 0, 100)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}

	if len(candles) != 2 {
		t.Fatalf("expected 2 candles, got %d", len(candles))
	}

	// Verify chronological ordering (oldest first)
	if candles[0].Time != 1670608800 {
		t.Errorf("expected candles[0].Time = 1670608800, got %d", candles[0].Time)
	}
	if candles[1].Time != 1670608860 {
		t.Errorf("expected candles[1].Time = 1670608860, got %d", candles[1].Time)
	}

	if candles[0].Open != 17050.0 || candles[0].Close != 17060.0 || candles[0].Volume != 10.0 {
		t.Errorf("unexpected candle values: %+v", candles[0])
	}
}

func TestBybitProvider_Search(t *testing.T) {
	bp := NewBybitProvider()
	ctx := context.Background()

	results, err := bp.Search(ctx, "BTC")
	if err != nil {
		t.Fatalf("Search failed: %v", err)
	}

	if len(results) == 0 {
		t.Fatalf("expected to find BTC in seeded symbols")
	}

	found := false
	for _, r := range results {
		if r.Symbol == "BTCUSDT" && r.Exchange == "BYBIT" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("expected BTCUSDT in search results, got %v", results)
	}
}
