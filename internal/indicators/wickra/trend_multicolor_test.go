package wickra

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"sync"
	"testing"
)

// generateTrendCandles generates n candles with distinct bullish and bearish regimes
// ensuring clear trend flips for trailing stops and slope reversals for moving averages.
func generateTrendCandles(n int) []CandleData {
	candles := make([]CandleData, n)
	startTime := int64(1700000000)
	price := 100.0

	// Phase 1 (0 to n/3): Strong upward rally
	// Phase 2 (n/3 to 2n/3): Sharp bearish crash (forces flip to short)
	// Phase 3 (2n/3 to n): Strong rebound (forces flip to long)
	phase1 := n / 3
	phase2 := (2 * n) / 3

	for i := 0; i < n; i++ {
		var step float64
		if i < phase1 {
			step = 1.5 // Climbing
		} else if i < phase2 {
			step = -2.0 // Falling sharply
		} else {
			step = 1.8 // Rebounding
		}
		price += step
		candles[i] = CandleData{
			Time:   startTime + int64(i*60),
			Open:   price - step*0.5,
			High:   price + 2.0,
			Low:    price - 2.0,
			Close:  price,
			Volume: 1000.0 + float64(i*10),
		}
	}
	return candles
}

// generateOscillatingCandles generates n candles tracing a smooth periodic oscillation.
func generateOscillatingCandles(n int) []CandleData {
	candles := make([]CandleData, n)
	startTime := int64(1700000000)
	for i := 0; i < n; i++ {
		angle := float64(i) * 2.0 * math.Pi / 30.0
		center := 100.0
		val := center + 20.0*math.Sin(angle)
		candles[i] = CandleData{
			Time:   startTime + int64(i*60),
			Open:   val,
			High:   val + 1.5,
			Low:    val - 1.5,
			Close:  val + math.Cos(angle),
			Volume: 1000.0,
		}
	}
	return candles
}

// TestTrendMultiColor_CatalogDescriptors verifies catalog declarations for all 8 qualifying indicators.
func TestTrendMultiColor_CatalogDescriptors(t *testing.T) {
	cat := DefaultCatalog()

	testCases := []struct {
		indicatorID string
		name        string
		isTrailing  bool
	}{
		{"wickra.super_trend", "SuperTrend", true},
		{"wickra.atr_ratchet", "ATR Ratchet", true},
		{"wickra.elder_safe_zone", "Elder SafeZone Stop", true},
		{"wickra.kase_dev_stop", "Kase DevStop", true},
		{"wickra.modified_ma_stop", "Modified Ma Stop", true},
		{"wickra.nrtr", "Nick Rypock Trailing Reverse", true},
		{"wickra.t3", "Tillson T3", false},
		{"wickra.hma", "Hull Moving Average", false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			desc, ok := cat.GetByID(tc.indicatorID)
			if !ok {
				t.Fatalf("[%s] indicator not found in catalog", tc.indicatorID)
			}

			// Verify 'up' plot
			var upPlot, downPlot *PlotDirective
			var valuePlot, dirPlot, mainPlot *PlotDirective

			for i := range desc.Plots {
				p := &desc.Plots[i]
				switch p.ID {
				case "up":
					upPlot = p
				case "down":
					downPlot = p
				case "value":
					valuePlot = p
				case "direction":
					dirPlot = p
				case "plot":
					mainPlot = p
				}
			}

			if upPlot == nil {
				t.Fatalf("[%s] missing 'up' plot directive in catalog", tc.indicatorID)
			}
			if upPlot.Type != PlotTypeLine || upPlot.Title != "Up Trend" || upPlot.Color != "#089981" || upPlot.LineWidth != 2 || !upPlot.Visible {
				t.Errorf("[%s] 'up' plot directive invalid: %+v", tc.indicatorID, upPlot)
			}

			if downPlot == nil {
				t.Fatalf("[%s] missing 'down' plot directive in catalog", tc.indicatorID)
			}
			if downPlot.Type != PlotTypeLine || downPlot.Title != "Down Trend" || downPlot.Color != "#F23645" || downPlot.LineWidth != 2 || !downPlot.Visible {
				t.Errorf("[%s] 'down' plot directive invalid: %+v", tc.indicatorID, downPlot)
			}

			// Verify backward compatibility
			if tc.isTrailing {
				if valuePlot == nil || dirPlot == nil {
					t.Errorf("[%s] trailing stop must retain 'value' and 'direction' plots for backward compatibility", tc.indicatorID)
				} else if valuePlot.Visible || dirPlot.Visible {
					t.Errorf("[%s] backward-compatible plots must default to visible=false, got value=%v, dir=%v",
						tc.indicatorID, valuePlot.Visible, dirPlot.Visible)
				}
			} else {
				if mainPlot == nil && valuePlot == nil {
					t.Errorf("[%s] moving average must retain 'plot' or 'value' for backward compatibility", tc.indicatorID)
				}
			}
		})
	}
}

// TestTrendMultiColor_NumericalPrecisionAndTransitions tests 1e-6 precision and regime splitting across all 8 indicators.
func TestTrendMultiColor_NumericalPrecisionAndTransitions(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	candles := generateTrendCandles(90)

	testCases := []struct {
		indicatorID string
		name        string
		isTrailing  bool
		inputs      map[string]interface{}
	}{
		{
			indicatorID: "wickra.super_trend",
			name:        "SuperTrend",
			isTrailing:  true,
			inputs:      map[string]interface{}{"atr_period": 10, "multiplier": 2.0},
		},
		{
			indicatorID: "wickra.atr_ratchet",
			name:        "ATR Ratchet",
			isTrailing:  true,
			inputs:      map[string]interface{}{"atr_period": 10, "start_mult": 2.0, "increment": 0.5},
		},
		{
			indicatorID: "wickra.elder_safe_zone",
			name:        "Elder SafeZone Stop",
			isTrailing:  true,
			inputs:      map[string]interface{}{"period": 10, "coeff": 1.5},
		},
		{
			indicatorID: "wickra.kase_dev_stop",
			name:        "Kase DevStop",
			isTrailing:  true,
			inputs:      map[string]interface{}{"period": 10, "dev": 1.0},
		},
		{
			indicatorID: "wickra.modified_ma_stop",
			name:        "Modified Ma Stop",
			isTrailing:  true,
			inputs:      map[string]interface{}{"period": 10},
		},
		{
			indicatorID: "wickra.nrtr",
			name:        "Nick Rypock Trailing Reverse",
			isTrailing:  true,
			inputs:      map[string]interface{}{"pct": 2.0},
		},
		{
			indicatorID: "wickra.t3",
			name:        "Tillson T3",
			isTrailing:  false,
			inputs:      map[string]interface{}{"period": 10, "v": 0.7, "source": "close"},
		},
		{
			indicatorID: "wickra.hma",
			name:        "Hull Moving Average",
			isTrailing:  false,
			inputs:      map[string]interface{}{"period": 10, "source": "close"},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			results, err := engine.Evaluate(ctx, candles, []EvalIndicatorInstance{
				{
					InstanceID:  "test_" + tc.indicatorID,
					IndicatorID: tc.indicatorID,
					Inputs:      tc.inputs,
				},
			})
			if err != nil {
				t.Fatalf("[%s] Evaluate failed: %v", tc.name, err)
			}
			if len(results) != 1 {
				t.Fatalf("[%s] Expected 1 result, got %d", tc.name, len(results))
			}

			res := results[0]
			up := res.Plots["up"]
			down := res.Plots["down"]

			if len(up) == 0 {
				t.Errorf("[%s] Expected non-empty 'up' plot points, got 0", tc.name)
			}
			if len(down) == 0 {
				t.Errorf("[%s] Expected non-empty 'down' plot points, got 0", tc.name)
			}

			// Map underlying reference values
			valMap := make(map[int64]float64)
			dirMap := make(map[int64]float64)

			if tc.isTrailing {
				for _, pt := range res.Plots["value"] {
					valMap[pt.Time] = pt.Value
				}
				for _, pt := range res.Plots["direction"] {
					dirMap[pt.Time] = pt.Value
				}
			} else {
				var pts []SeriesPoint
				if p, ok := res.Plots["plot"]; ok && len(p) > 0 {
					pts = p
				} else if p, ok := res.Plots["value"]; ok && len(p) > 0 {
					pts = p
				}
				for _, pt := range pts {
					valMap[pt.Time] = pt.Value
				}
			}

			if len(valMap) == 0 {
				t.Fatalf("[%s] No underlying reference points available", tc.name)
			}

			// Verify 1e-6 precision for all up points
			for _, pt := range up {
				expectedVal, ok := valMap[pt.Time]
				if !ok {
					t.Errorf("[%s] up point time %d not found in underlying values", tc.name, pt.Time)
					continue
				}
				if math.Abs(pt.Value-expectedVal) > 1e-6 {
					t.Errorf("[%s] up point time %d drift: got %f, expected %f (diff: %e)",
						tc.name, pt.Time, pt.Value, expectedVal, math.Abs(pt.Value-expectedVal))
				}
				if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
					t.Errorf("[%s] up point time %d has NaN or Inf value", tc.name, pt.Time)
				}
				if tc.isTrailing {
					if dir, ok := dirMap[pt.Time]; ok && dir <= 0 {
						t.Errorf("[%s] up point time %d has non-positive direction %f", tc.name, pt.Time, dir)
					}
				}
			}

			// Verify 1e-6 precision for all down points
			for _, pt := range down {
				expectedVal, ok := valMap[pt.Time]
				if !ok {
					t.Errorf("[%s] down point time %d not found in underlying values", tc.name, pt.Time)
					continue
				}
				if math.Abs(pt.Value-expectedVal) > 1e-6 {
					t.Errorf("[%s] down point time %d drift: got %f, expected %f (diff: %e)",
						tc.name, pt.Time, pt.Value, expectedVal, math.Abs(pt.Value-expectedVal))
				}
				if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
					t.Errorf("[%s] down point time %d has NaN or Inf value", tc.name, pt.Time)
				}
				if tc.isTrailing {
					if dir, ok := dirMap[pt.Time]; ok && dir >= 0 {
						t.Errorf("[%s] down point time %d has non-negative direction %f", tc.name, pt.Time, dir)
					}
				}
			}

			// Verify disjoint partitions for trailing stops (bridge elimination invariant)
			if tc.isTrailing {
				upTimes := make(map[int64]bool)
				for _, pt := range up {
					upTimes[pt.Time] = true
				}
				for _, pt := range down {
					if upTimes[pt.Time] {
						t.Errorf("[%s] timestamp %d present in both up and down plots (trailing stop flip must be disjoint)", tc.name, pt.Time)
					}
				}
				if len(up)+len(down) != len(valMap) {
					t.Errorf("[%s] split point count mismatch: up(%d) + down(%d) = %d, expected total %d",
						tc.name, len(up), len(down), len(up)+len(down), len(valMap))
				}
			}
		})
	}
}

// TestTrendMultiColor_SlopeAnchorContinuity verifies that slope indicators share transition anchors at inflection bars.
func TestTrendMultiColor_SlopeAnchorContinuity(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	candles := generateOscillatingCandles(75)

	indicators := []struct {
		id     string
		name   string
		inputs map[string]interface{}
	}{
		{id: "wickra.t3", name: "Tillson T3", inputs: map[string]interface{}{"period": 8, "v": 0.7, "source": "close"}},
		{id: "wickra.hma", name: "Hull Moving Average", inputs: map[string]interface{}{"period": 8, "source": "close"}},
	}

	for _, ind := range indicators {
		t.Run(ind.name, func(t *testing.T) {
			results, err := engine.Evaluate(ctx, candles, []EvalIndicatorInstance{
				{
					InstanceID:  "test_" + ind.id,
					IndicatorID: ind.id,
					Inputs:      ind.inputs,
				},
			})
			if err != nil {
				t.Fatalf("[%s] Evaluate failed: %v", ind.name, err)
			}
			res := results[0]
			up := res.Plots["up"]
			down := res.Plots["down"]

			if len(up) == 0 || len(down) == 0 {
				t.Fatalf("[%s] Expected both up and down points, got up=%d, down=%d", ind.name, len(up), len(down))
			}

			// Find reference continuous points
			var pts []SeriesPoint
			if p, ok := res.Plots["plot"]; ok && len(p) > 0 {
				pts = p
			} else if p, ok := res.Plots["value"]; ok && len(p) > 0 {
				pts = p
			}

			if len(pts) < 3 {
				t.Fatalf("[%s] Not enough underlying points to test inflection", ind.name)
			}

			upMap := make(map[int64]float64)
			for _, p := range up {
				upMap[p.Time] = p.Value
			}
			downMap := make(map[int64]float64)
			for _, p := range down {
				downMap[p.Time] = p.Value
			}

			inflectionCount := 0
			for i := 1; i < len(pts)-1; i++ {
				prevSlope := pts[i].Value - pts[i-1].Value
				nextSlope := pts[i+1].Value - pts[i].Value

				isPeak := prevSlope > 1e-6 && nextSlope < -1e-6
				isTrough := prevSlope < -1e-6 && nextSlope > 1e-6

				if isPeak || isTrough {
					inflectionCount++
					inflectionTime := pts[i].Time
					upVal, hasUp := upMap[inflectionTime]
					downVal, hasDown := downMap[inflectionTime]

					if !hasUp || !hasDown {
						t.Errorf("[%s] inflection bar at time %d (peak=%v trough=%v) must be in BOTH up and down series. hasUp=%v, hasDown=%v",
							ind.name, inflectionTime, isPeak, isTrough, hasUp, hasDown)
					} else if math.Abs(upVal-downVal) > 1e-6 {
						t.Errorf("[%s] inflection bar at time %d value mismatch: up=%f, down=%f",
							ind.name, inflectionTime, upVal, downVal)
					}
				}
			}

			if inflectionCount == 0 {
				t.Errorf("[%s] no inflection points detected in test series", ind.name)
			}
		})
	}
}

// TestTrendMultiColor_JSONSerializationRoundTrip verifies clean JSON serialization without NaN or Inf errors.
func TestTrendMultiColor_JSONSerializationRoundTrip(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	candles := generateTrendCandles(60)

	allConfigs := []EvalIndicatorInstance{
		{InstanceID: "st", IndicatorID: "wickra.super_trend", Inputs: map[string]interface{}{"atr_period": 10, "multiplier": 2.0}},
		{InstanceID: "ar", IndicatorID: "wickra.atr_ratchet", Inputs: map[string]interface{}{"atr_period": 10, "start_mult": 2.0, "increment": 0.5}},
		{InstanceID: "esz", IndicatorID: "wickra.elder_safe_zone", Inputs: map[string]interface{}{"period": 10, "coeff": 1.5}},
		{InstanceID: "kds", IndicatorID: "wickra.kase_dev_stop", Inputs: map[string]interface{}{"period": 10, "dev": 1.0}},
		{InstanceID: "mms", IndicatorID: "wickra.modified_ma_stop", Inputs: map[string]interface{}{"period": 10}},
		{InstanceID: "nrtr", IndicatorID: "wickra.nrtr", Inputs: map[string]interface{}{"pct": 2.0}},
		{InstanceID: "t3", IndicatorID: "wickra.t3", Inputs: map[string]interface{}{"period": 10, "v": 0.7, "source": "close"}},
		{InstanceID: "hma", IndicatorID: "wickra.hma", Inputs: map[string]interface{}{"period": 10, "source": "close"}},
	}

	results, err := engine.Evaluate(ctx, candles, allConfigs)
	if err != nil {
		t.Fatalf("Evaluate all indicators failed: %v", err)
	}
	if len(results) != len(allConfigs) {
		t.Fatalf("Expected %d results, got %d", len(allConfigs), len(results))
	}

	resp := EvalResponse{Results: results}

	// 1. Marshal to JSON
	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v (likely NaN or Inf in output)", err)
	}

	jsonStr := string(data)

	// 2. Assert zero NaN or Inf strings in JSON output
	if strings.Contains(jsonStr, "NaN") {
		t.Errorf("JSON output contains illegal 'NaN' token: %s", jsonStr[:int(math.Min(float64(len(jsonStr)), 200))])
	}
	if strings.Contains(jsonStr, "+Inf") || strings.Contains(jsonStr, "-Inf") || strings.Contains(jsonStr, "Infinity") {
		t.Errorf("JSON output contains illegal Infinity token")
	}

	// 3. Round-trip unmarshal
	var decodedResp EvalResponse
	if err := json.Unmarshal(data, &decodedResp); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if len(decodedResp.Results) != len(resp.Results) {
		t.Fatalf("Decoded results count mismatch: got %d, expected %d", len(decodedResp.Results), len(resp.Results))
	}

	// Verify exact preservation across all plots
	for i, origRes := range resp.Results {
		decRes := decodedResp.Results[i]
		if decRes.InstanceID != origRes.InstanceID {
			t.Errorf("InstanceID mismatch at %d: got %s, expected %s", i, decRes.InstanceID, origRes.InstanceID)
		}

		for plotKey, origPoints := range origRes.Plots {
			decPoints, ok := decRes.Plots[plotKey]
			if !ok {
				t.Errorf("[%s] missing plot %s in decoded response", origRes.InstanceID, plotKey)
				continue
			}
			if len(decPoints) != len(origPoints) {
				t.Errorf("[%s] plot %s length mismatch: decoded=%d, original=%d", origRes.InstanceID, plotKey, len(decPoints), len(origPoints))
				continue
			}
			for pIdx, pt := range origPoints {
				decPt := decPoints[pIdx]
				if decPt.Time != pt.Time {
					t.Errorf("[%s.%s][%d] Time mismatch: decoded=%d, original=%d", origRes.InstanceID, plotKey, pIdx, decPt.Time, pt.Time)
				}
				if math.Abs(decPt.Value-pt.Value) > 1e-6 {
					t.Errorf("[%s.%s][%d] Value mismatch: decoded=%f, original=%f", origRes.InstanceID, plotKey, pIdx, decPt.Value, pt.Value)
				}
			}
		}
	}
}

// TestTrendMultiColor_ConcurrentRaceSafety tests evaluation thread-safety under Go's race detector.
func TestTrendMultiColor_ConcurrentRaceSafety(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	const concurrency = 16
	var wg sync.WaitGroup
	errCh := make(chan error, concurrency)

	for workerID := 0; workerID < concurrency; workerID++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			candles := generateTrendCandles(60 + (id % 15))

			var cfgs []EvalIndicatorInstance
			if id%2 == 0 {
				cfgs = []EvalIndicatorInstance{
					{InstanceID: fmt.Sprintf("st_%d", id), IndicatorID: "wickra.super_trend", Inputs: map[string]interface{}{"atr_period": 10, "multiplier": 2.0}},
					{InstanceID: fmt.Sprintf("t3_%d", id), IndicatorID: "wickra.t3", Inputs: map[string]interface{}{"period": 10, "v": 0.7, "source": "close"}},
				}
			} else {
				cfgs = []EvalIndicatorInstance{
					{InstanceID: fmt.Sprintf("ar_%d", id), IndicatorID: "wickra.atr_ratchet", Inputs: map[string]interface{}{"atr_period": 10, "start_mult": 2.0, "increment": 0.5}},
					{InstanceID: fmt.Sprintf("hma_%d", id), IndicatorID: "wickra.hma", Inputs: map[string]interface{}{"period": 10, "source": "close"}},
				}
			}

			res, err := engine.Evaluate(ctx, candles, cfgs)
			if err != nil {
				errCh <- fmt.Errorf("worker %d: Evaluate failed: %w", id, err)
				return
			}
			if len(res) != len(cfgs) {
				errCh <- fmt.Errorf("worker %d: expected %d results, got %d", id, len(cfgs), len(res))
				return
			}

			if _, err := json.Marshal(res); err != nil {
				errCh <- fmt.Errorf("worker %d: json.Marshal failed: %w", id, err)
				return
			}
		}(workerID)
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		t.Errorf("Concurrency race error: %v", err)
	}
}

// TestTrendMultiColor_EdgeCases tests flat market dynamics, warmup-only datasets, and extreme price bounds.
func TestTrendMultiColor_EdgeCases(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	// Case 1: Flat market zero volatility
	t.Run("FlatMarketZeroVolatility", func(t *testing.T) {
		flatCandles := make([]CandleData, 40)
		for i := 0; i < 40; i++ {
			flatCandles[i] = CandleData{
				Time:   1700000000 + int64(i*60),
				Open:   100.0,
				High:   100.0,
				Low:    100.0,
				Close:  100.0,
				Volume: 1000.0,
			}
		}

		res, err := engine.Evaluate(ctx, flatCandles, []EvalIndicatorInstance{
			{InstanceID: "st_flat", IndicatorID: "wickra.super_trend", Inputs: map[string]interface{}{"atr_period": 10, "multiplier": 2.0}},
			{InstanceID: "t3_flat", IndicatorID: "wickra.t3", Inputs: map[string]interface{}{"period": 10, "v": 0.7, "source": "close"}},
			{InstanceID: "hma_flat", IndicatorID: "wickra.hma", Inputs: map[string]interface{}{"period": 10, "source": "close"}},
		})
		if err != nil {
			t.Fatalf("Evaluate on flat candles failed: %v", err)
		}

		for _, r := range res {
			bytes, err := json.Marshal(r)
			if err != nil {
				t.Errorf("[%s] json.Marshal failed on flat market: %v", r.InstanceID, err)
			}
			if strings.Contains(string(bytes), "NaN") {
				t.Errorf("[%s] Flat market emitted NaN in JSON: %s", r.InstanceID, string(bytes))
			}
		}
	})

	// Case 2: Insufficient candles (warmup-only)
	t.Run("InsufficientCandlesWarmup", func(t *testing.T) {
		shortCandles := make([]CandleData, 3)
		for i := 0; i < 3; i++ {
			shortCandles[i] = CandleData{
				Time:   1700000000 + int64(i*60),
				Open:   100.0 + float64(i),
				High:   105.0 + float64(i),
				Low:    95.0 + float64(i),
				Close:  102.0 + float64(i),
				Volume: 1000.0,
			}
		}

		res, err := engine.Evaluate(ctx, shortCandles, []EvalIndicatorInstance{
			{InstanceID: "st_short", IndicatorID: "wickra.super_trend", Inputs: map[string]interface{}{"atr_period": 14, "multiplier": 2.0}},
			{InstanceID: "t3_short", IndicatorID: "wickra.t3", Inputs: map[string]interface{}{"period": 14, "v": 0.7, "source": "close"}},
		})
		if err != nil {
			t.Fatalf("Evaluate on short candles failed: %v", err)
		}

		for _, r := range res {
			if len(r.Plots["up"]) > 0 || len(r.Plots["down"]) > 0 {
				t.Errorf("[%s] Expected empty up/down plots for warmup-only candles, got up=%d, down=%d",
					r.InstanceID, len(r.Plots["up"]), len(r.Plots["down"]))
			}
			if _, err := json.Marshal(r); err != nil {
				t.Errorf("[%s] json.Marshal failed on empty plots: %v", r.InstanceID, err)
			}
		}
	})

	// Case 3: Extreme price magnitude
	t.Run("ExtremePriceMagnitude", func(t *testing.T) {
		highPriceCandles := make([]CandleData, 40)
		for i := 0; i < 40; i++ {
			p := 50000000.0 + float64(i*1000)
			highPriceCandles[i] = CandleData{
				Time:   1700000000 + int64(i*60),
				Open:   p,
				High:   p + 500.0,
				Low:    p - 500.0,
				Close:  p + 200.0,
				Volume: 1000000.0,
			}
		}

		res, err := engine.Evaluate(ctx, highPriceCandles, []EvalIndicatorInstance{
			{InstanceID: "st_extreme", IndicatorID: "wickra.super_trend", Inputs: map[string]interface{}{"atr_period": 10, "multiplier": 2.0}},
			{InstanceID: "hma_extreme", IndicatorID: "wickra.hma", Inputs: map[string]interface{}{"period": 10, "source": "close"}},
		})
		if err != nil {
			t.Fatalf("Evaluate on extreme price candles failed: %v", err)
		}

		for _, r := range res {
			data, err := json.Marshal(r)
			if err != nil {
				t.Errorf("[%s] json.Marshal failed on extreme price: %v", r.InstanceID, err)
			}
			if strings.Contains(string(data), "NaN") {
				t.Errorf("[%s] Extreme price emitted NaN in JSON", r.InstanceID)
			}
		}
	})
}
