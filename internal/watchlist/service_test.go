package watchlist

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestNormalizeToYahooTicker(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"AAPL", "AAPL"},
		{"msft", "MSFT"},
		{"OANDA:NAS100_USD", "^NDX"},
		{"OANDA:SPX500_USD", "^GSPC"},
		{"OANDA:EUR_USD", "EURUSD=X"},
		{"BINANCE:BTCUSDT", "BTC-USD"},
		{"BINANCE:ETHUSDT", "ETH-USD"},
		{"WTICO_USD", "CL=F"},
	}

	for _, tt := range tests {
		got := NormalizeToYahooTicker(tt.input)
		if got != tt.expected {
			t.Errorf("NormalizeToYahooTicker(%q) = %q; want %q", tt.input, got, tt.expected)
		}
	}
}

func TestWatchlistQuotesAndSearch(t *testing.T) {
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/v7/finance/quote" {
			w.Write([]byte(`{
				"quoteResponse": {
					"result": [
						{
							"symbol": "AAPL",
							"shortName": "Apple Inc.",
							"regularMarketPrice": 220.50,
							"regularMarketChange": 3.25,
							"regularMarketChangePercent": 1.5,
							"regularMarketVolume": 50000000,
							"currency": "USD",
							"exchange": "NASDAQ"
						}
					]
				}
			}`))
			return
		}
		if r.URL.Path == "/v1/finance/search" {
			w.Write([]byte(`{
				"quotes": [
					{
						"symbol": "AAPL",
						"shortname": "Apple Inc.",
						"quoteType": "EQUITY",
						"exchDisp": "NASDAQ"
					}
				]
			}`))
			return
		}
		if r.URL.Path == "/v1/test/getcrumb" {
			w.Write([]byte("mock_crumb_123"))
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer mockServer.Close()

	svc := NewService()
	svc.SetEndpoints(
		mockServer.URL+"/v7/finance/quote",
		mockServer.URL+"/v1/test/getcrumb",
		mockServer.URL+"/v1/finance/search",
	)

	quotes, err := svc.GetQuotes(context.Background(), []string{"AAPL"})
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	if len(quotes) != 1 {
		t.Fatalf("expected 1 quote, got: %d", len(quotes))
	}
	if quotes[0].Price != 220.50 {
		t.Errorf("expected price 220.50, got: %f", quotes[0].Price)
	}

	searchRes, err := svc.Search(context.Background(), "Apple")
	if err != nil {
		t.Fatalf("expected no search error, got: %v", err)
	}
	if len(searchRes) != 1 || searchRes[0].Symbol != "AAPL" {
		t.Errorf("expected 1 result with AAPL, got: %+v", searchRes)
	}
}

func TestWatchlistSingleFlightAndCacheBound(t *testing.T) {
	var quoteCalls atomic.Int32
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/v1/test/getcrumb" {
			w.Write([]byte("crumb_1"))
			return
		}
		if r.URL.Path == "/v7/finance/quote" {
			quoteCalls.Add(1)
			time.Sleep(30 * time.Millisecond)
			sym := r.URL.Query().Get("symbols")
			fmt.Fprintf(w, `{"quoteResponse":{"result":[{"symbol":%q,"regularMarketPrice":100.0}]}}`, sym)
			return
		}
	}))
	defer mockServer.Close()

	svc := NewService()
	svc.maxCacheEntries = 2
	svc.SetEndpoints(
		mockServer.URL+"/v7/finance/quote",
		mockServer.URL+"/v1/test/getcrumb",
		mockServer.URL+"/v1/finance/search",
	)

	// 1. Concurrent identical requests coalesce into 1 HTTP quote call
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			q, err := svc.GetQuotes(context.Background(), []string{"AAPL"})
			if err != nil || len(q) != 1 {
				t.Errorf("unexpected quote result: %v, %+v", err, q)
			}
		}()
	}
	wg.Wait()
	if got := quoteCalls.Load(); got != 1 {
		t.Fatalf("expected 1 coalesced quote request, got %d", got)
	}

	// 2. Cache stays bounded at maxCacheEntries (2)
	_, _ = svc.GetQuotes(context.Background(), []string{"MSFT"})
	_, _ = svc.GetQuotes(context.Background(), []string{"NVDA"})
	svc.mu.RLock()
	cacheLen := len(svc.quotesCache)
	svc.mu.RUnlock()
	if cacheLen > 2 {
		t.Fatalf("expected quotesCache bounded at <= 2 entries, got %d", cacheLen)
	}
}

