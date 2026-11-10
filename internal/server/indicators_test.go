package server

import (
	"bytes"
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/ordercraft-hq/terminal/internal/datafeed"
	"github.com/ordercraft-hq/terminal/internal/indicators/wickra"
	"github.com/ordercraft-hq/terminal/internal/storage"
	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

// MockIndicatorEngine implements IndicatorEngine for fast, deterministic unit tests.
type MockIndicatorEngine struct {
	catalog []wickra.IndicatorDescriptor
}

func NewMockIndicatorEngine() *MockIndicatorEngine {
	return &MockIndicatorEngine{
		catalog: []wickra.IndicatorDescriptor{
			{
				ID:        "wickra.sma",
				Name:      "Simple Moving Average",
				ShortName: "SMA",
				Category:  "Moving Averages",
				Overlay:   true,
				Inputs: []wickra.InputSchema{
					{ID: "period", Name: "Period", Type: "integer", Default: 5},
				},
				Plots: []wickra.PlotDirective{
					{ID: "plot", Type: "line", Title: "SMA", Color: "#2962FF"},
				},
			},
			{
				ID:        "wickra.rsi",
				Name:      "Relative Strength Index",
				ShortName: "RSI",
				Category:  "Oscillators",
				Overlay:   false,
				Inputs: []wickra.InputSchema{
					{ID: "period", Name: "Period", Type: "integer", Default: 14},
				},
				Plots: []wickra.PlotDirective{
					{ID: "plot", Type: "line", Title: "RSI", Color: "#7E57C2"},
				},
			},
			{
				ID:        "wickra.bollinger",
				Name:      "Bollinger Bands",
				ShortName: "BB",
				Category:  "Bands",
				Overlay:   true,
				Inputs: []wickra.InputSchema{
					{ID: "period", Name: "Period", Type: "integer", Default: 20},
				},
				Plots: []wickra.PlotDirective{
					{ID: "upper", Type: "line", Title: "Upper", Color: "#26A69A"},
					{ID: "middle", Type: "line", Title: "Basis", Color: "#FF6D00"},
					{ID: "lower", Type: "line", Title: "Lower", Color: "#EF5350"},
				},
			},
		},
	}
}

func (m *MockIndicatorEngine) GetCatalog(category, query string) []wickra.IndicatorDescriptor {
	var out []wickra.IndicatorDescriptor
	catLower := strings.ToLower(strings.TrimSpace(category))
	qLower := strings.ToLower(strings.TrimSpace(query))

	for _, ind := range m.catalog {
		if catLower != "" && strings.ToLower(ind.Category) != catLower {
			continue
		}
		if qLower != "" {
			match := strings.Contains(strings.ToLower(ind.ID), qLower) ||
				strings.Contains(strings.ToLower(ind.Name), qLower) ||
				strings.Contains(strings.ToLower(ind.ShortName), qLower)
			if !match {
				continue
			}
		}
		out = append(out, ind)
	}
	return out
}

func (m *MockIndicatorEngine) GetDescriptor(id string) (wickra.IndicatorDescriptor, bool) {
	for _, ind := range m.catalog {
		if ind.ID == id {
			return ind, true
		}
	}
	return wickra.IndicatorDescriptor{}, false
}

func (m *MockIndicatorEngine) Evaluate(ctx context.Context, candles []wickra.CandleData, configs []wickra.EvalIndicatorInstance) ([]wickra.EvalResult, error) {
	var results []wickra.EvalResult

	for _, cfg := range configs {
		res := wickra.EvalResult{
			InstanceID:  cfg.InstanceID,
			IndicatorID: cfg.IndicatorID,
			Plots:       make(map[string][]wickra.SeriesPoint),
		}

		if cfg.IndicatorID == "wickra.sma" {
			period := 5
			if p, ok := cfg.Inputs["period"].(float64); ok && int(p) > 0 {
				period = int(p)
			}
			var points []wickra.SeriesPoint
			var sum float64
			for i, c := range candles {
				sum += c.Close
				if i >= period {
					sum -= candles[i-period].Close
				}
				if i >= period-1 {
					points = append(points, wickra.SeriesPoint{
						Time:  c.Time,
						Value: sum / float64(period),
					})
				}
			}
			res.Plots["plot"] = points
		} else if cfg.IndicatorID == "wickra.bollinger" {
			res.Plots["upper"] = []wickra.SeriesPoint{}
			res.Plots["middle"] = []wickra.SeriesPoint{}
			res.Plots["lower"] = []wickra.SeriesPoint{}
		}

		results = append(results, res)
	}
	return results, nil
}

type MockIndicatorSession struct {
	configs []wickra.EvalIndicatorInstance
	history []float64
}

func (m *MockIndicatorEngine) CreateSession(ctx context.Context, symbol, resolution string, configs []wickra.EvalIndicatorInstance) (wickra.IndicatorSession, error) {
	return &MockIndicatorSession{configs: configs}, nil
}

func (s *MockIndicatorSession) Update(ctx context.Context, c wickra.CandleData) (map[string]map[string]float64, error) {
	s.history = append(s.history, c.Close)
	out := make(map[string]map[string]float64)

	for _, cfg := range s.configs {
		if cfg.IndicatorID == "wickra.sma" {
			period := 3
			if len(s.history) >= period {
				var sum float64
				for _, v := range s.history[len(s.history)-period:] {
					sum += v
				}
				out[cfg.InstanceID] = map[string]float64{
					"plot": sum / float64(period),
				}
			}
		}
	}
	return out, nil
}

func (s *MockIndicatorSession) Close(ctx context.Context) error {
	return nil
}

func TestIndicatorsCatalogAPI(t *testing.T) {
	tmpDB := "test_cat.db"
	defer os.Remove(tmpDB)
	st, _ := storage.NewStorage(tmpDB)
	defer st.Close()

	srv := NewServer(st)
	srv.SetIndicatorEngine(NewMockIndicatorEngine())

	// 1. Full catalog
	req := httptest.NewRequest(http.MethodGet, "/api/indicators/catalog", nil)
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", w.Code)
	}
	var resp struct {
		Count      int                         `json:"count"`
		Indicators []wickra.IndicatorDescriptor `json:"indicators"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Unmarshal error: %v", err)
	}
	if resp.Count != 3 || len(resp.Indicators) != 3 {
		t.Fatalf("Expected 3 indicators, got %d", resp.Count)
	}

	// 2. Filter by category
	req = httptest.NewRequest(http.MethodGet, "/api/indicators/catalog?category=Oscillators", nil)
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	resp.Indicators = nil
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if len(resp.Indicators) != 1 || resp.Indicators[0].ID != "wickra.rsi" {
		t.Fatalf("Expected RSI, got: %+v", resp.Indicators)
	}

	// 3. Search query
	req = httptest.NewRequest(http.MethodGet, "/api/indicators/catalog?q=boll", nil)
	w = httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	resp.Indicators = nil
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	if len(resp.Indicators) != 1 || resp.Indicators[0].ID != "wickra.bollinger" {
		t.Fatalf("Expected Bollinger, got: %+v", resp.Indicators)
	}
}

func TestIndicatorsEvalAPI(t *testing.T) {
	tmpDB := "test_eval.db"
	defer os.Remove(tmpDB)
	st, _ := storage.NewStorage(tmpDB)
	defer st.Close()

	srv := NewServer(st)
	srv.SetIndicatorEngine(NewMockIndicatorEngine())

	candles := []datafeed.Candle{
		{Time: 100, Close: 10},
		{Time: 101, Close: 11},
		{Time: 102, Close: 12},
		{Time: 103, Close: 13},
		{Time: 104, Close: 14}, // Period 5 ends here: mean = 12.0
		{Time: 105, Close: 15}, // mean = 13.0
	}

	payload := IndicatorEvalRequest{
		Symbol:     "TEST:BTC",
		Resolution: "1m",
		Candles:    candles,
		Indicators: []wickra.EvalIndicatorInstance{
			{InstanceID: "ind_sma", IndicatorID: "wickra.sma", Inputs: map[string]interface{}{"period": 5.0}},
		},
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var res IndicatorEvalResponse
	_ = json.Unmarshal(w.Body.Bytes(), &res)
	if len(res.Results) != 1 {
		t.Fatalf("Expected 1 result, got %d", len(res.Results))
	}
	pts := res.Results[0].Plots["plot"]
	if len(pts) != 2 {
		t.Fatalf("Expected 2 points after warmup, got %d", len(pts))
	}
	if pts[0].Value != 12.0 || pts[1].Value != 13.0 {
		t.Fatalf("Expected [12.0, 13.0], got [%f, %f]", pts[0].Value, pts[1].Value)
	}
}

func TestIndicatorsWebSocketStreaming(t *testing.T) {
	tmpDB := "test_ws.db"
	defer os.Remove(tmpDB)
	st, _ := storage.NewStorage(tmpDB)
	defer st.Close()

	srv := NewServer(st)
	srv.SetIndicatorEngine(NewMockIndicatorEngine())

	httpSrv := httptest.NewServer(srv.mux)
	defer httpSrv.Close()

	wsURL := "ws" + strings.TrimPrefix(httpSrv.URL, "http") + "/ws/indicators"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("WebSocket dial failed: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "done")

	// Subscribe to indicators
	subMsg := map[string]interface{}{
		"action":     "subscribe",
		"symbol":     "TEST:BTC",
		"resolution": "1m",
		"indicators": []map[string]interface{}{
			{"instanceId": "ind_live", "indicatorId": "wickra.sma", "inputs": map[string]interface{}{"period": 3}},
		},
	}
	if err := wsjson.Write(ctx, conn, subMsg); err != nil {
		t.Fatalf("Write subscribe failed: %v", err)
	}

	time.Sleep(50 * time.Millisecond)

	// Broadcast 3 candles to satisfy period 3
	srv.streamHub.Broadcast("TEST:BTC", "1m", datafeed.Candle{Time: 1000, Close: 10})
	srv.streamHub.Broadcast("TEST:BTC", "1m", datafeed.Candle{Time: 1060, Close: 20})
	srv.streamHub.Broadcast("TEST:BTC", "1m", datafeed.Candle{Time: 1120, Close: 30}) // Mean = 20.0

	// Read broadcasted messages until we find indicator_update
	var foundIndUpdate bool
	readDeadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(readDeadline) {
		var raw map[string]interface{}
		readCtx, readCancel := context.WithTimeout(ctx, 500*time.Millisecond)
		err := wsjson.Read(readCtx, conn, &raw)
		readCancel()
		if err == nil {
			if raw["type"] == "indicator_update" {
				foundIndUpdate = true
				plots := raw["plots"].(map[string]interface{})
				indLive := plots["ind_live"].(map[string]interface{})
				if indLive["plot"].(float64) != 20.0 {
					t.Fatalf("Expected SMA 20.0, got %v", indLive["plot"])
				}
				break
			}
		}
	}

	if !foundIndUpdate {
		t.Fatalf("Did not receive indicator_update message within deadline")
	}
}

func TestIndicatorsEvalAPI_VolumeIndicators(t *testing.T) {
	ctx := context.Background()
	engine, err := wickra.NewEngine(ctx)
	if err != nil {
		t.Fatalf("wickra.NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	tmpDB := "test_eval_volume.db"
	defer os.Remove(tmpDB)
	st, _ := storage.NewStorage(tmpDB)
	defer st.Close()

	srv := NewServer(st)
	srv.SetIndicatorEngine(engine)

	candles := []datafeed.Candle{
		{Time: 1700000000, Open: 10.0, High: 12.0, Low: 9.0, Close: 11.0, Volume: 1000.0},
		{Time: 1700000060, Open: 11.0, High: 13.0, Low: 10.0, Close: 12.0, Volume: 1500.0},
		{Time: 1700000120, Open: 12.0, High: 14.0, Low: 11.0, Close: 13.0, Volume: 2000.0},
	}

	payload := IndicatorEvalRequest{
		Symbol:     "TEST:BTC",
		Resolution: "1m",
		Candles:    candles,
		Indicators: []wickra.EvalIndicatorInstance{
			{InstanceID: "ind_vwap", IndicatorID: "wickra.vwap", Inputs: map[string]interface{}{}},
			{InstanceID: "ind_avwap", IndicatorID: "wickra.anchored_vwap", Inputs: map[string]interface{}{}},
			{InstanceID: "ind_obv", IndicatorID: "wickra.obv", Inputs: map[string]interface{}{}},
			{InstanceID: "ind_adl", IndicatorID: "wickra.adl", Inputs: map[string]interface{}{}},
		},
	}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var res IndicatorEvalResponse
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("Unmarshal error: %v", err)
	}

	if len(res.Results) != 4 {
		t.Fatalf("Expected 4 results, got %d", len(res.Results))
	}

	for _, r := range res.Results {
		pts, ok := r.Plots["plot"]
		if !ok || len(pts) == 0 {
			t.Fatalf("Expected non-empty plot for %s", r.IndicatorID)
		}
		if len(pts) != len(candles) {
			t.Fatalf("Expected %d points for %s, got %d", len(candles), r.IndicatorID, len(pts))
		}
		for _, pt := range pts {
			if pt.Time == 0 {
				t.Errorf("Point time is 0 for %s", r.IndicatorID)
			}
			if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
				t.Errorf("Invalid numerical value %f for %s", pt.Value, r.IndicatorID)
			}
		}
	}
}
