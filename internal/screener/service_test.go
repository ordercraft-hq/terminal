package screener

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMoversService(t *testing.T) {
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{
			"finance": {
				"result": [{
					"title": "Day Gainers",
					"quotes": [
						{"symbol":"NVDA","shortName":"NVIDIA","regularMarketPrice":214.0,"regularMarketChange":12.5,"regularMarketChangePercent":6.2,"regularMarketVolume":45000000},
						{"symbol":"AAPL","shortName":"Apple","regularMarketPrice":349.0,"regularMarketChange":5.3,"regularMarketChangePercent":1.5,"regularMarketVolume":14000000},
						{"symbol":"GOOGL","shortName":"Google","regularMarketPrice":286.0,"regularMarketChange":-38.0,"regularMarketChangePercent":-11.7,"regularMarketVolume":72000000}
					]
				}]
			}
		}`))
	}))
	defer mockServer.Close()

	svc := NewService()
	svc.SetEndpointURL(mockServer.URL)

	movers, err := svc.GetMovers(context.Background())
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	if len(movers.Gainers) != 3 {
		t.Fatalf("expected 3 gainers, got: %d", len(movers.Gainers))
	}
	if movers.Gainers[0].Symbol != "NVDA" {
		t.Errorf("expected NVDA to lead, got %s", movers.Gainers[0].Symbol)
	}

	// Test category option
	techMovers, err := svc.GetMoversWithOpts(context.Background(), "growth_technology_stocks", true)
	if err != nil {
		t.Fatalf("expected no error on category, got: %v", err)
	}
	if len(techMovers.Gainers) != 3 {
		t.Fatalf("expected 3 items, got: %d", len(techMovers.Gainers))
	}
	if techMovers.Gainers[0].Symbol != "NVDA" {
		t.Errorf("expected NVDA to be top gainer, got %s", techMovers.Gainers[0].Symbol)
	}
}
