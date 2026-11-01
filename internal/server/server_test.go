package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/ordercraft-hq/terminal/internal/storage"
)

func TestDrawingTemplatesAPI(t *testing.T) {
	tmpDB := "test_api_templates.db"
	defer os.Remove(tmpDB)

	st, err := storage.NewStorage(tmpDB)
	if err != nil {
		t.Fatalf("Failed to init storage: %v", err)
	}
	defer st.Close()

	srv := NewServer(st)

	// 1. Initially GET should return empty array []
	req := httptest.NewRequest(http.MethodGet, "/api/templates/drawings", nil)
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", w.Code)
	}
	var tmpls []storage.DrawingTemplate
	if err := json.Unmarshal(w.Body.Bytes(), &tmpls); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	if len(tmpls) != 0 {
		t.Fatalf("Expected 0 templates, got %d", len(tmpls))
	}

	// 2. POST create a template
	payload := map[string]interface{}{
		"id":        "tmpl_1",
		"name":      "EQX",
		"tool_type": "trendline",
		"settings":  `{"color":"#2962ff","lineWidth":1,"lineStyle":"dashed"}`,
	}
	bodyBytes, _ := json.Marshal(payload)
	req = httptest.NewRequest(http.MethodPost, "/api/templates/drawings", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 on POST, got %d: %s", w.Code, w.Body.String())
	}
	var created storage.DrawingTemplate
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatalf("Failed to decode created template: %v", err)
	}
	if created.ID != "tmpl_1" || created.Name != "EQX" {
		t.Fatalf("Unexpected created template: %+v", created)
	}

	// 3. GET with tool_type filter
	req = httptest.NewRequest(http.MethodGet, "/api/templates/drawings?tool_type=trendline", nil)
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", w.Code)
	}
	tmpls = nil
	if err := json.Unmarshal(w.Body.Bytes(), &tmpls); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	if len(tmpls) != 1 || tmpls[0].Name != "EQX" {
		t.Fatalf("Expected 1 template named EQX, got: %+v", tmpls)
	}

	// 4. DELETE template
	req = httptest.NewRequest(http.MethodDelete, "/api/templates/drawings?id=tmpl_1", nil)
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("Expected 204 on DELETE, got %d", w.Code)
	}

	// 5. Verify deleted
	req = httptest.NewRequest(http.MethodGet, "/api/templates/drawings?tool_type=trendline", nil)
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	tmpls = nil
	json.Unmarshal(w.Body.Bytes(), &tmpls)
	if len(tmpls) != 0 {
		t.Fatalf("Expected 0 templates after delete, got %d", len(tmpls))
	}
}

func TestChartTemplatesAPI(t *testing.T) {
	tmpDB := "test_api_chart_templates.db"
	defer os.Remove(tmpDB)

	st, err := storage.NewStorage(tmpDB)
	if err != nil {
		t.Fatalf("Failed to init storage: %v", err)
	}
	defer st.Close()

	srv := NewServer(st)

	// 1. Initially GET should return empty array []
	req := httptest.NewRequest(http.MethodGet, "/api/templates/charts", nil)
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", w.Code)
	}
	var tmpls []storage.ChartTemplate
	if err := json.Unmarshal(w.Body.Bytes(), &tmpls); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	if len(tmpls) != 0 {
		t.Fatalf("Expected 0 chart templates, got %d", len(tmpls))
	}

	// 2. POST create a chart template
	payload := map[string]interface{}{
		"id":       "ctmpl_1",
		"name":     "Midnight Blue",
		"settings": `{"candleBodyUpColor":"#00f0ff","canvasBgColor":"#0d1117"}`,
	}
	bodyBytes, _ := json.Marshal(payload)
	req = httptest.NewRequest(http.MethodPost, "/api/templates/charts", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 on POST, got %d: %s", w.Code, w.Body.String())
	}
	var created storage.ChartTemplate
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatalf("Failed to decode created chart template: %v", err)
	}
	if created.ID != "ctmpl_1" || created.Name != "Midnight Blue" {
		t.Fatalf("Unexpected created chart template: %+v", created)
	}

	// 3. GET all chart templates
	req = httptest.NewRequest(http.MethodGet, "/api/templates/charts", nil)
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", w.Code)
	}
	tmpls = nil
	if err := json.Unmarshal(w.Body.Bytes(), &tmpls); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	if len(tmpls) != 1 || tmpls[0].Name != "Midnight Blue" {
		t.Fatalf("Expected 1 template named Midnight Blue, got: %+v", tmpls)
	}

	// 4. DELETE chart template
	req = httptest.NewRequest(http.MethodDelete, "/api/templates/charts?id=ctmpl_1", nil)
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("Expected 204 on DELETE, got %d", w.Code)
	}

	// 5. Verify deleted
	req = httptest.NewRequest(http.MethodGet, "/api/templates/charts", nil)
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	tmpls = nil
	json.Unmarshal(w.Body.Bytes(), &tmpls)
	if len(tmpls) != 0 {
		t.Fatalf("Expected 0 templates after delete, got %d", len(tmpls))
	}
}


func TestMaskKeyString(t *testing.T) {
	if got := maskKeyString(""); got != "" {
		t.Fatalf("Expected empty string, got %q", got)
	}
	if got := maskKeyString("12345"); got != "•••••" {
		t.Fatalf("Expected '•••••', got %q", got)
	}
	if got := maskKeyString("1234567890"); got != "12••••••90" {
		t.Fatalf("Expected '12••••••90', got %q", got)
	}
	alpacaKey := "PKOHUQTCJXLCRVTOMYXL66VIA7"
	expectedAlpaca := "PKOH••••••••VIA7"
	if got := maskKeyString(alpacaKey); got != expectedAlpaca {
		t.Fatalf("Expected %q, got %q", expectedAlpaca, got)
	}
}

func TestProviderConfigureAndMasking(t *testing.T) {
	tmpDB := "test_api_creds.db"
	defer os.Remove(tmpDB)

	st, err := storage.NewStorage(tmpDB)
	if err != nil {
		t.Fatalf("Failed to init storage: %v", err)
	}
	defer st.Close()

	srv := NewServer(st)

	// 1. Initial status: Alpaca should be in availableIntegrations
	req := httptest.NewRequest(http.MethodGet, "/api/providers/status", nil)
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", w.Code)
	}
	var status struct {
		Providers             []map[string]interface{} `json:"providers"`
		AvailableIntegrations []map[string]interface{} `json:"availableIntegrations"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &status); err != nil {
		t.Fatalf("Failed to decode status: %v", err)
	}
	foundInAvail := false
	for _, a := range status.AvailableIntegrations {
		if a["id"] == "ALPACA" {
			foundInAvail = true
			break
		}
	}
	if !foundInAvail {
		t.Fatalf("Expected ALPACA to start in availableIntegrations")
	}

	// 2. Configure Alpaca
	configPayload := map[string]interface{}{
		"provider":  "ALPACA",
		"accountId": "PA123456",
		"apiKey":    "PKOHUQTCJXLCRVTOMYXL66VIA7",
		"apiSecret": "SECRETKEY_99999999999999999",
	}
	b, _ := json.Marshal(configPayload)
	req = httptest.NewRequest(http.MethodPost, "/api/providers/configure", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// 3. GET /api/providers/status: Alpaca should now be in providers, with maskedApiKey, hasSecret: true, NO raw secret!
	req = httptest.NewRequest(http.MethodGet, "/api/providers/status", nil)
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	status = struct {
		Providers             []map[string]interface{} `json:"providers"`
		AvailableIntegrations []map[string]interface{} `json:"availableIntegrations"`
	}{}
	_ = json.Unmarshal(w.Body.Bytes(), &status)

	var alpacaProv map[string]interface{}
	for _, p := range status.Providers {
		if p["id"] == "ALPACA" {
			alpacaProv = p
			break
		}
	}
	if alpacaProv == nil {
		t.Fatalf("Expected ALPACA in connected providers after configure")
	}
	if alpacaProv["accountId"] != "PA123456" {
		t.Fatalf("Expected accountId 'PA123456', got %v", alpacaProv["accountId"])
	}
	if alpacaProv["maskedApiKey"] != "PKOH••••••••VIA7" {
		t.Fatalf("Expected maskedApiKey 'PKOH••••••••VIA7', got %v", alpacaProv["maskedApiKey"])
	}
	if alpacaProv["hasSecret"] != true {
		t.Fatalf("Expected hasSecret true")
	}
	// Verify raw secret is NEVER leaked
	bodyStr := w.Body.String()
	if bytes.Contains([]byte(bodyStr), []byte("SECRETKEY_99999999999999999")) {
		t.Fatalf("CRITICAL SECURITY ERROR: raw secret found in /api/providers/status output!")
	}

	// 4. Update with masked key and blank secret (e.g. only modifying account ID)
	updatePayload := map[string]interface{}{
		"provider":  "ALPACA",
		"accountId": "PA777777",
		"apiKey":    "PKOH••••••••VIA7",
		"apiSecret": "",
	}
	b, _ = json.Marshal(updatePayload)
	req = httptest.NewRequest(http.MethodPost, "/api/providers/configure", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 on update, got %d", w.Code)
	}

	// Check that Alpaca is still configured and still has the real keys intact in SQLite
	rawKey, err := st.GetAPIKey(req.Context(), "ALPACA")
	if err != nil || rawKey == "" {
		t.Fatalf("Failed to load Alpaca credentials from SQLite: %v", err)
	}
	var storedCreds struct {
		AccountID string `json:"accountId"`
		APIKey    string `json:"apiKey"`
		APISecret string `json:"apiSecret"`
	}
	_ = json.Unmarshal([]byte(rawKey), &storedCreds)
	if storedCreds.AccountID != "PA777777" {
		t.Fatalf("Expected updated accountId PA777777, got %q", storedCreds.AccountID)
	}
	if storedCreds.APIKey != "PKOHUQTCJXLCRVTOMYXL66VIA7" {
		t.Fatalf("Expected original API key preserved, got %q", storedCreds.APIKey)
	}
	if storedCreds.APISecret != "SECRETKEY_99999999999999999" {
		t.Fatalf("Expected original API secret preserved, got %q", storedCreds.APISecret)
	}

	// 5. DELETE Alpaca
	req = httptest.NewRequest(http.MethodDelete, "/api/providers/configure?provider=ALPACA", nil)
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 on DELETE, got %d", w.Code)
	}

	// Verify Alpaca is no longer connected
	req = httptest.NewRequest(http.MethodGet, "/api/providers/status", nil)
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	status = struct {
		Providers             []map[string]interface{} `json:"providers"`
		AvailableIntegrations []map[string]interface{} `json:"availableIntegrations"`
	}{}
	_ = json.Unmarshal(w.Body.Bytes(), &status)
	for _, p := range status.Providers {
		if p["id"] == "ALPACA" {
			t.Fatalf("Expected ALPACA to not be connected after delete")
		}
	}
}
