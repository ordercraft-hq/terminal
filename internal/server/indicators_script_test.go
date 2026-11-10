package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/ordercraft-hq/terminal/internal/datafeed"
	"github.com/ordercraft-hq/terminal/internal/indicators/scripting"
	"github.com/ordercraft-hq/terminal/internal/indicators/wickra"
	"github.com/ordercraft-hq/terminal/internal/storage"
)

func TestIndicatorScriptEvalAPI(t *testing.T) {
	tmpDB := "test_server_script.db"
	defer os.Remove(tmpDB)

	st, err := storage.NewStorage(tmpDB)
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer st.Close()

	srv := NewServer(st)
	srv.SetScriptingEngine(scripting.NewEngine(nil))

	candles := []datafeed.Candle{
		{Time: 1700000000, Open: 100, High: 105, Low: 99, Close: 104, Volume: 50},
		{Time: 1700000060, Open: 104, High: 108, Low: 103, Close: 107, Volume: 60},
		{Time: 1700000120, Open: 107, High: 110, Low: 106, Close: 109, Volume: 70},
	}

	reqBody := ScriptEvalRequest{
		Code: `
def main(ctx):
    s = ta.sma(ctx.close, 2)
    return [
        plot.line(s, color="#2962FF", title="SMA 2")
    ]
`,
		Symbol:     "BINANCE:BTCUSDT",
		Resolution: "1m",
		Candles:    candles,
	}

	bodyBytes, _ := json.Marshal(reqBody)
	req := httptest.NewRequest(http.MethodPost, "/api/indicators/script/eval", bytes.NewReader(bodyBytes))
	rec := httptest.NewRecorder()

	srv.mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d (body: %s)", rec.Code, rec.Body.String())
	}

	var resp ScriptEvalResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if !resp.Success {
		t.Fatalf("expected success true, got false (err: %s)", resp.Error)
	}

	if len(resp.Directives) != 1 || resp.Directives[0].Title != "SMA 2" {
		t.Errorf("unexpected directives: %+v", resp.Directives)
	}
}

func TestUserIndicatorsCRUD_API(t *testing.T) {
	tmpDB := "test_user_ind_api.db"
	defer os.Remove(tmpDB)

	st, err := storage.NewStorage(tmpDB)
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer st.Close()

	srv := NewServer(st)

	// 1. POST create
	newInd := storage.UserIndicator{
		ID:          "script_cvd_div",
		Name:        "CVD Divergence",
		Description: "Orderflow divergence detector",
		Code:        "def main(ctx): return []",
		Permissions: []string{"network:api.binance.com"},
	}
	bodyBytes, _ := json.Marshal(newInd)
	req := httptest.NewRequest(http.MethodPost, "/api/indicators/user", bytes.NewReader(bodyBytes))
	rec := httptest.NewRecorder()
	srv.mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 on create, got %d: %s", rec.Code, rec.Body.String())
	}

	// 2. GET list
	reqList := httptest.NewRequest(http.MethodGet, "/api/indicators/user", nil)
	recList := httptest.NewRecorder()
	srv.mux.ServeHTTP(recList, reqList)

	if recList.Code != http.StatusOK {
		t.Fatalf("expected 200 on list, got %d", recList.Code)
	}
	var list []storage.UserIndicator
	_ = json.NewDecoder(recList.Body).Decode(&list)
	if len(list) != 1 || list[0].Name != "CVD Divergence" {
		t.Errorf("unexpected list response: %+v", list)
	}

	// 3. GET single
	reqSingle := httptest.NewRequest(http.MethodGet, "/api/indicators/user/script_cvd_div", nil)
	recSingle := httptest.NewRecorder()
	srv.mux.ServeHTTP(recSingle, reqSingle)

	if recSingle.Code != http.StatusOK {
		t.Fatalf("expected 200 on get single, got %d", recSingle.Code)
	}

	// 4. DELETE
	reqDel := httptest.NewRequest(http.MethodDelete, "/api/indicators/user/script_cvd_div", nil)
	recDel := httptest.NewRecorder()
	srv.mux.ServeHTTP(recDel, reqDel)

	if recDel.Code != http.StatusOK {
		t.Fatalf("expected 200 on delete, got %d", recDel.Code)
	}

	// Verify not found after delete
	reqAfter := httptest.NewRequest(http.MethodGet, "/api/indicators/user/script_cvd_div", nil)
	recAfter := httptest.NewRecorder()
	srv.mux.ServeHTTP(recAfter, reqAfter)

	if recAfter.Code != http.StatusNotFound {
		t.Fatalf("expected 404 after delete, got %d", recAfter.Code)
	}
}

func TestScriptIndicator_EvalAPI_WithStoredScript(t *testing.T) {
	tmpDB := "test_server_script_stored.db"
	defer os.Remove(tmpDB)

	st, err := storage.NewStorage(tmpDB)
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer st.Close()

	srv := NewServer(st)
	srv.SetScriptingEngine(scripting.NewEngine(nil))

	scriptID := "script.fast_hma_test"
	code := `
def main(ctx):
    fast = ta.hma(ctx.close, 14)
    return [plot.line(fast, color="#2962FF", title="Fast HMA 14")]
`
	_ = st.SaveUserIndicator(context.Background(), &storage.UserIndicator{
		ID:          scriptID,
		Name:        "Fast HMA Test",
		Description: "Fast HMA Test",
		Code:        code,
	})

	candles := []datafeed.Candle{
		{Time: 1700000000, Open: 100, High: 105, Low: 99, Close: 104, Volume: 50},
		{Time: 1700000060, Open: 104, High: 108, Low: 103, Close: 107, Volume: 60},
	}

	evalReq := IndicatorEvalRequest{
		Symbol:     "BINANCE:BTCUSDT",
		Resolution: "1m",
		Candles:    candles,
		Indicators: []wickra.EvalIndicatorInstance{
			{
				InstanceID:  "ind_stored_1",
				IndicatorID: scriptID,
				Inputs:      map[string]interface{}{},
			},
		},
	}

	bodyBytes, _ := json.Marshal(evalReq)
	req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader(bodyBytes))
	rec := httptest.NewRecorder()
	srv.mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestScriptIndicator_EvalAPI_WithCodeInInputs(t *testing.T) {
	tmpDB := "test_server_script_inline.db"
	defer os.Remove(tmpDB)

	st, err := storage.NewStorage(tmpDB)
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer st.Close()

	srv := NewServer(st)
	srv.SetScriptingEngine(scripting.NewEngine(nil))

	candles := []datafeed.Candle{
		{Time: 1700000000, Open: 100, High: 105, Low: 99, Close: 104, Volume: 50},
		{Time: 1700000060, Open: 104, High: 108, Low: 103, Close: 107, Volume: 60},
	}

	evalReq := IndicatorEvalRequest{
		Symbol:     "BINANCE:BTCUSDT",
		Resolution: "1m",
		Candles:    candles,
		Indicators: []wickra.EvalIndicatorInstance{
			{
				InstanceID:  "ind_inline_1",
				IndicatorID: "script.inline_test",
				Inputs: map[string]interface{}{
					"code": `
def main(ctx):
    return [plot.line(ctx.close, color="#00FF00", title="Green Close")]
`,
				},
			},
		},
	}

	bodyBytes, _ := json.Marshal(evalReq)
	req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader(bodyBytes))
	rec := httptest.NewRecorder()
	srv.mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
	}
}
