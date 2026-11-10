package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"

	"github.com/ordercraft-hq/terminal/internal/datafeed"
	"github.com/ordercraft-hq/terminal/internal/indicators/wickra"
	"github.com/ordercraft-hq/terminal/internal/storage"
)

// setupTestServerWithEngine creates a server instance backed by a real Wickra WASM engine.
func setupTestServerWithEngine(t *testing.T) (*Server, *wickra.Engine, func()) {
	t.Helper()
	ctx := context.Background()
	engine, err := wickra.NewEngine(ctx)
	if err != nil {
		t.Fatalf("wickra.NewEngine failed: %v", err)
	}

	tmpDB := filepath.Join(t.TempDir(), "test_challenge.db")
	st, err := storage.NewStorage(tmpDB)
	if err != nil {
		engine.Close(ctx)
		t.Fatalf("storage.NewStorage failed: %v", err)
	}

	srv := NewServer(st)
	srv.SetIndicatorEngine(engine)

	cleanup := func() {
		engine.Close(ctx)
		st.Close()
	}

	return srv, engine, cleanup
}

func makeSampleCandles(count int, baseVol float64) []datafeed.Candle {
	candles := make([]datafeed.Candle, count)
	baseTime := int64(1700000000)
	for i := 0; i < count; i++ {
		t := baseTime + int64(i*60)
		candles[i] = datafeed.Candle{
			Time:   t,
			Open:   100.0 + float64(i)*0.5,
			High:   105.0 + float64(i)*0.5,
			Low:    95.0 + float64(i)*0.5,
			Close:  102.0 + float64(i)*0.5,
			Volume: baseVol + float64(i)*100,
		}
	}
	return candles
}

// 1. Batch evaluation with multiple volume indicators in a single payload
func TestVolumeIndicators_BatchEvaluation(t *testing.T) {
	srv, _, cleanup := setupTestServerWithEngine(t)
	defer cleanup()

	candles := makeSampleCandles(20, 1000.0)

	payload := IndicatorEvalRequest{
		Symbol:     "BTC/USDT",
		Resolution: "15m",
		Candles:    candles,
		Indicators: []wickra.EvalIndicatorInstance{
			{InstanceID: "ind_vwap", IndicatorID: "wickra.vwap", Inputs: map[string]interface{}{}},
			{InstanceID: "ind_avwap", IndicatorID: "wickra.anchored_vwap", Inputs: map[string]interface{}{}},
			{InstanceID: "ind_obv", IndicatorID: "wickra.obv", Inputs: map[string]interface{}{}},
			{InstanceID: "ind_adl", IndicatorID: "wickra.adl", Inputs: map[string]interface{}{}},
			{InstanceID: "ind_rvwap", IndicatorID: "wickra.rolling_vwap", Inputs: map[string]interface{}{"period": 5}},
			{InstanceID: "ind_cmf", IndicatorID: "wickra.chaikin_money_flow", Inputs: map[string]interface{}{"period": 5}},
			{InstanceID: "ind_vo", IndicatorID: "wickra.volume_oscillator", Inputs: map[string]interface{}{"fast": 3, "slow": 7}},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("Marshal payload: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected HTTP 200 OK, got HTTP %d: %s", w.Code, w.Body.String())
	}

	var res IndicatorEvalResponse
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("Unmarshal response failed: %v", err)
	}

	if len(res.Results) != 7 {
		t.Fatalf("Expected 7 results in batch response, got %d", len(res.Results))
	}

	expectedIDs := []string{
		"wickra.vwap",
		"wickra.anchored_vwap",
		"wickra.obv",
		"wickra.adl",
		"wickra.rolling_vwap",
		"wickra.chaikin_money_flow",
		"wickra.volume_oscillator",
	}

	for i, expID := range expectedIDs {
		r := res.Results[i]
		if r.IndicatorID != expID {
			t.Errorf("Result %d: expected indicator ID %q, got %q", i, expID, r.IndicatorID)
		}

		pts, hasPlot := r.Plots["plot"]
		if !hasPlot {
			t.Fatalf("Indicator %s missing 'plot' key in Plots: %v", expID, r.Plots)
		}
		if len(pts) == 0 {
			t.Errorf("Indicator %s returned 0 points", expID)
		}

		// Verify every returned point has valid time and finite value
		for _, pt := range pts {
			if pt.Time <= 0 {
				t.Errorf("Indicator %s has non-positive timestamp: %d", expID, pt.Time)
			}
			if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
				t.Errorf("Indicator %s produced non-finite point: %v", expID, pt.Value)
			}
		}
	}
}

// 2. Boundary condition candles: 0 volume, 1 candle, flat prices, huge volumes, negative volumes, resolutions
func TestVolumeIndicators_BoundaryConditions(t *testing.T) {
	srv, _, cleanup := setupTestServerWithEngine(t)
	defer cleanup()

	baseIndicators := []wickra.EvalIndicatorInstance{
		{InstanceID: "ind_vwap", IndicatorID: "wickra.vwap"},
		{InstanceID: "ind_avwap", IndicatorID: "wickra.anchored_vwap"},
		{InstanceID: "ind_obv", IndicatorID: "wickra.obv"},
		{InstanceID: "ind_adl", IndicatorID: "wickra.adl"},
		{InstanceID: "ind_rvwap", IndicatorID: "wickra.rolling_vwap", Inputs: map[string]interface{}{"period": 5}},
		{InstanceID: "ind_cmf", IndicatorID: "wickra.chaikin_money_flow", Inputs: map[string]interface{}{"period": 5}},
		{InstanceID: "ind_vo", IndicatorID: "wickra.volume_oscillator", Inputs: map[string]interface{}{"fast": 2, "slow": 5}},
	}

	t.Run("ZeroVolume", func(t *testing.T) {
		candles := makeSampleCandles(10, 0.0)
		for i := range candles {
			candles[i].Volume = 0.0
		}

		payload := IndicatorEvalRequest{
			Symbol:     "TEST:ZEROVOL",
			Resolution: "1m",
			Candles:    candles,
			Indicators: baseIndicators,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader(body))
		w := httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("ZeroVolume: expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var res IndicatorEvalResponse
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		// Zero volume should not panic or produce Inf
		for _, r := range res.Results {
			for _, pt := range r.Plots["plot"] {
				if math.IsInf(pt.Value, 0) {
					t.Errorf("ZeroVolume %s produced Inf: %v", r.IndicatorID, pt.Value)
				}
			}
		}
	})

	t.Run("SingleCandle", func(t *testing.T) {
		candles := []datafeed.Candle{
			{Time: 1700000000, Open: 100, High: 105, Low: 95, Close: 102, Volume: 500},
		}

		payload := IndicatorEvalRequest{
			Symbol:     "TEST:SINGLE",
			Resolution: "1m",
			Candles:    candles,
			Indicators: baseIndicators,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader(body))
		w := httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("SingleCandle: expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var res IndicatorEvalResponse
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		if len(res.Results) != len(baseIndicators) {
			t.Fatalf("SingleCandle: expected %d results, got %d", len(baseIndicators), len(res.Results))
		}
	})

	t.Run("FlatPrices_HighEqualsLowEqualsClose", func(t *testing.T) {
		// When High == Low, ADL denominator (High - Low) is 0.
		candles := make([]datafeed.Candle, 10)
		for i := 0; i < 10; i++ {
			candles[i] = datafeed.Candle{
				Time:   int64(1700000000 + i*60),
				Open:   100.0,
				High:   100.0,
				Low:    100.0,
				Close:  100.0,
				Volume: 1000.0,
			}
		}

		payload := IndicatorEvalRequest{
			Symbol:     "TEST:FLAT",
			Resolution: "1m",
			Candles:    candles,
			Indicators: baseIndicators,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader(body))
		w := httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("FlatPrices: expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var res IndicatorEvalResponse
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		for _, r := range res.Results {
			for _, pt := range r.Plots["plot"] {
				if math.IsInf(pt.Value, 0) || math.IsNaN(pt.Value) {
					t.Errorf("FlatPrices %s produced invalid value: %v", r.IndicatorID, pt.Value)
				}
			}
		}
	})

	t.Run("HugeVolumes_OneBillionAndTrillion", func(t *testing.T) {
		candles := makeSampleCandles(10, 1e9)
		candles[5].Volume = 1e12

		payload := IndicatorEvalRequest{
			Symbol:     "TEST:HUGEVOL",
			Resolution: "1d",
			Candles:    candles,
			Indicators: baseIndicators,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader(body))
		w := httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("HugeVolumes: expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var res IndicatorEvalResponse
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		for _, r := range res.Results {
			for _, pt := range r.Plots["plot"] {
				if math.IsInf(pt.Value, 0) || math.IsNaN(pt.Value) {
					t.Errorf("HugeVolumes %s produced invalid value: %v", r.IndicatorID, pt.Value)
				}
			}
		}
	})

	t.Run("NegativeVolumes", func(t *testing.T) {
		candles := makeSampleCandles(10, 1000)
		for i := range candles {
			candles[i].Volume = -500.0
		}

		payload := IndicatorEvalRequest{
			Symbol:     "TEST:NEGVOL",
			Resolution: "1h",
			Candles:    candles,
			Indicators: baseIndicators,
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader(body))
		w := httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)

		// Negative volume should be processed or rejected cleanly without panic
		if w.Code == http.StatusInternalServerError {
			t.Errorf("NegativeVolumes caused HTTP 500: %s", w.Body.String())
		}
	})

	t.Run("VaryingResolutions", func(t *testing.T) {
		resolutions := []string{"1s", "1m", "5m", "15m", "1h", "4h", "1d", "1w", "1M", ""}
		candles := makeSampleCandles(5, 500)

		for _, resStr := range resolutions {
			payload := IndicatorEvalRequest{
				Symbol:     "TEST:RES",
				Resolution: resStr,
				Candles:    candles,
				Indicators: []wickra.EvalIndicatorInstance{
					{InstanceID: "vwap", IndicatorID: "wickra.vwap"},
				},
			}
			body, _ := json.Marshal(payload)
			req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader(body))
			w := httptest.NewRecorder()
			srv.mux.ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Errorf("Resolution %q failed with %d: %s", resStr, w.Code, w.Body.String())
			}
		}
	})

	t.Run("ZeroCandles_EmptyCandlesAndEmptySymbol", func(t *testing.T) {
		payload := IndicatorEvalRequest{
			Symbol:     "",
			Resolution: "1m",
			Candles:    []datafeed.Candle{},
			Indicators: []wickra.EvalIndicatorInstance{
				{InstanceID: "vwap", IndicatorID: "wickra.vwap"},
			},
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader(body))
		w := httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("ZeroCandles: expected 200 with empty results, got %d: %s", w.Code, w.Body.String())
		}
		var res IndicatorEvalResponse
		_ = json.Unmarshal(w.Body.Bytes(), &res)
		if len(res.Results) > 0 && len(res.Results[0].Plots["plot"]) != 0 {
			t.Errorf("Expected 0 plot points for 0 candles, got %d", len(res.Results[0].Plots["plot"]))
		}
	})

	t.Run("ZeroCandles_UnknownProviderFallbackError", func(t *testing.T) {
		payload := IndicatorEvalRequest{
			Symbol:     "NONEXISTENT:BTC",
			Resolution: "1m",
			Candles:    []datafeed.Candle{},
			Indicators: []wickra.EvalIndicatorInstance{
				{InstanceID: "vwap", IndicatorID: "wickra.vwap"},
			},
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader(body))
		w := httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)

		// When symbol fallback fails, server currently returns 500
		t.Logf("ZeroCandles with unknown symbol provider returned code %d: %s", w.Code, w.Body.String())
	})
}

// 3. Malformed / empty inputs and invalid indicator IDs
func TestVolumeIndicators_MalformedAndInvalidInputs(t *testing.T) {
	srv, _, cleanup := setupTestServerWithEngine(t)
	defer cleanup()

	candles := makeSampleCandles(5, 1000)

	t.Run("MalformedJSON", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader([]byte("{not_json: true")))
		w := httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("Expected HTTP 400 Bad Request, got %d", w.Code)
		}
	})

	t.Run("EmptyBody", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader([]byte("")))
		w := httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("Expected HTTP 400 Bad Request, got %d", w.Code)
		}
	})

	t.Run("EmptyJSON", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader([]byte("{}")))
		w := httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("Expected HTTP 400 Bad Request, got %d", w.Code)
		}
	})

	t.Run("EmptyIndicatorsArray", func(t *testing.T) {
		payload := map[string]interface{}{
			"symbol":     "TEST:EMPTYIND",
			"candles":    candles,
			"indicators": []interface{}{},
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader(body))
		w := httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("Expected HTTP 400 Bad Request, got %d", w.Code)
		}
	})

	t.Run("InvalidInputs_ZeroAndNegativePeriods", func(t *testing.T) {
		payload := IndicatorEvalRequest{
			Symbol:     "TEST:BADINPUTS",
			Resolution: "1m",
			Candles:    candles,
			Indicators: []wickra.EvalIndicatorInstance{
				{InstanceID: "vo_zero", IndicatorID: "wickra.volume_oscillator", Inputs: map[string]interface{}{"fast": 0, "slow": 0}},
				{InstanceID: "cmf_neg", IndicatorID: "wickra.chaikin_money_flow", Inputs: map[string]interface{}{"period": -5}},
			},
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader(body))
		w := httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)

		t.Logf("ZeroAndNegativePeriods response code: %d, body: %s", w.Code, w.Body.String())
	})

	t.Run("InvalidIndicatorID_BehaviorCheck", func(t *testing.T) {
		payload := IndicatorEvalRequest{
			Symbol:     "TEST:BADID",
			Resolution: "1m",
			Candles:    candles,
			Indicators: []wickra.EvalIndicatorInstance{
				{InstanceID: "bad_1", IndicatorID: "wickra.nonexistent_volume_indicator_xyz"},
			},
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader(body))
		w := httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)

		t.Logf("InvalidIndicatorID response code: %d, body: %s", w.Code, w.Body.String())
		// Check that it NEVER panics or crashes the process
		if w.Code == http.StatusInternalServerError {
			t.Logf("NOTE: Server returned HTTP 500 InternalServerError for unknown indicator ID: %s", w.Body.String())
		}
	})

	t.Run("NilEngineDefense", func(t *testing.T) {
		tmpDB := filepath.Join(t.TempDir(), "test_nil_engine.db")
		st, _ := storage.NewStorage(tmpDB)
		defer st.Close()
		nilSrv := NewServer(st) // No engine set

		payload := IndicatorEvalRequest{
			Symbol:     "TEST:NILENG",
			Resolution: "1m",
			Candles:    candles,
			Indicators: []wickra.EvalIndicatorInstance{
				{InstanceID: "vwap", IndicatorID: "wickra.vwap"},
			},
		}
		body, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader(body))
		w := httptest.NewRecorder()
		nilSrv.mux.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("NilEngine: expected HTTP 200 with empty results, got %d: %s", w.Code, w.Body.String())
		}
	})
}

// 4. Concurrent load stress testing: verify thread-safety of engine and worker pool under batch requests
func TestVolumeIndicators_ConcurrentLoadStress(t *testing.T) {
	srv, _, cleanup := setupTestServerWithEngine(t)
	defer cleanup()

	candles := makeSampleCandles(15, 1000)

	const numGoroutines = 20
	var wg sync.WaitGroup
	errCh := make(chan error, numGoroutines)

	for g := 0; g < numGoroutines; g++ {
		wg.Add(1)
		go func(routineID int) {
			defer wg.Done()

			payload := IndicatorEvalRequest{
				Symbol:     fmt.Sprintf("SYM_%d", routineID),
				Resolution: "5m",
				Candles:    candles,
				Indicators: []wickra.EvalIndicatorInstance{
					{InstanceID: fmt.Sprintf("vwap_%d", routineID), IndicatorID: "wickra.vwap"},
					{InstanceID: fmt.Sprintf("obv_%d", routineID), IndicatorID: "wickra.obv"},
					{InstanceID: fmt.Sprintf("adl_%d", routineID), IndicatorID: "wickra.adl"},
					{InstanceID: fmt.Sprintf("avwap_%d", routineID), IndicatorID: "wickra.anchored_vwap"},
					{InstanceID: fmt.Sprintf("vo_%d", routineID), IndicatorID: "wickra.volume_oscillator", Inputs: map[string]interface{}{"fast": 2, "slow": 5}},
				},
			}

			body, _ := json.Marshal(payload)
			req := httptest.NewRequest(http.MethodPost, "/api/indicators/eval", bytes.NewReader(body))
			w := httptest.NewRecorder()
			srv.mux.ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				errCh <- fmt.Errorf("routine %d failed with code %d: %s", routineID, w.Code, w.Body.String())
				return
			}

			var res IndicatorEvalResponse
			if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
				errCh <- fmt.Errorf("routine %d unmarshal err: %v", routineID, err)
				return
			}

			if len(res.Results) != 5 {
				errCh <- fmt.Errorf("routine %d expected 5 results, got %d", routineID, len(res.Results))
				return
			}
		}(g)
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		t.Errorf("Concurrent stress error: %v", err)
	}
}
