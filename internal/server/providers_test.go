package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/ordercraft-hq/terminal/internal/storage"
)

func TestProvidersStatusAPI(t *testing.T) {
	tmpDB := "test_api_providers.db"
	defer os.Remove(tmpDB)

	st, err := storage.NewStorage(tmpDB)
	if err != nil {
		t.Fatalf("Failed to init storage: %v", err)
	}
	defer st.Close()

	srv := NewServer(st)

	req := httptest.NewRequest(http.MethodGet, "/api/providers/status", nil)
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", w.Code)
	}

	var resp struct {
		Count                 int                      `json:"count"`
		Providers             []map[string]interface{} `json:"providers"`
		AvailableIntegrations []map[string]interface{} `json:"availableIntegrations"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	// 1. In unconfigured default state, only free crypto providers (3) are connected
	if resp.Count < 3 {
		t.Fatalf("Expected at least 3 default free providers, got %d: %+v", resp.Count, resp.Providers)
	}

	foundBybit := false
	foundCoinbase := false
	for _, p := range resp.Providers {
		if p["id"] == "BYBIT" {
			foundBybit = true
			if p["name"] != "Bybit v5 Public & Derivatives" {
				t.Errorf("Unexpected Bybit name: %v", p["name"])
			}
			intervals, ok := p["supportedIntervals"].([]interface{})
			if !ok || len(intervals) < 10 {
				t.Errorf("Unexpected Bybit intervals: %v", intervals)
			}
		}
		if p["id"] == "COINBASE" {
			foundCoinbase = true
			if p["name"] != "Coinbase Advanced (Spot & Perpetuals)" {
				t.Errorf("Unexpected Coinbase name: %v", p["name"])
			}
			intervals, ok := p["supportedIntervals"].([]interface{})
			if !ok || len(intervals) < 6 {
				t.Errorf("Unexpected Coinbase intervals: %v", intervals)
			}
		}
	}

	if !foundBybit {
		t.Errorf("BYBIT not found in providers status: %+v", resp.Providers)
	}
	if !foundCoinbase {
		t.Errorf("COINBASE not found in providers status: %+v", resp.Providers)
	}

	// 2. Unconfigured Alpaca and OANDA must be in availableIntegrations
	foundAlpacaAvail := false
	foundOandaAvail := false
	for _, integ := range resp.AvailableIntegrations {
		if integ["id"] == "ALPACA" {
			foundAlpacaAvail = true
		}
		if integ["id"] == "OANDA" {
			foundOandaAvail = true
		}
	}
	if !foundAlpacaAvail {
		t.Errorf("ALPACA should be in availableIntegrations when unconfigured: %+v", resp.AvailableIntegrations)
	}
	if !foundOandaAvail {
		t.Errorf("OANDA should be in availableIntegrations when unconfigured: %+v", resp.AvailableIntegrations)
	}

	// 3. Test configuring Alpaca via POST /api/providers/configure
	cfgPayload := `{"provider":"ALPACA","apiKey":"test_key","apiSecret":"test_secret"}`
	cfgReq := httptest.NewRequest(http.MethodPost, "/api/providers/configure", strings.NewReader(cfgPayload))
	cfgW := httptest.NewRecorder()
	srv.mux.ServeHTTP(cfgW, cfgReq)
	if cfgW.Code != http.StatusOK {
		t.Fatalf("Expected 200 from configure endpoint, got %d", cfgW.Code)
	}

	// 4. Verify Alpaca is now in Providers
	req2 := httptest.NewRequest(http.MethodGet, "/api/providers/status", nil)
	w2 := httptest.NewRecorder()
	srv.mux.ServeHTTP(w2, req2)
	var resp2 struct {
		Count     int                      `json:"count"`
		Providers []map[string]interface{} `json:"providers"`
	}
	_ = json.Unmarshal(w2.Body.Bytes(), &resp2)
	foundAlpacaConnected := false
	for _, p := range resp2.Providers {
		if p["id"] == "ALPACA" {
			foundAlpacaConnected = true
			if p["name"] != "Alpaca Markets (US Equities & Crypto)" {
				t.Errorf("Unexpected Alpaca name: %v", p["name"])
			}
		}
	}
	if !foundAlpacaConnected {
		t.Errorf("ALPACA should be in connected providers after configuring: %+v", resp2.Providers)
	}
}
