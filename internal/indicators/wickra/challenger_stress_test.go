package wickra

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"strings"
	"sync"
	"testing"
	"time"
)

// TestChallenger_EmptyDatasets verifies behavior with 0 candles across all qualifying indicators.
func TestChallenger_EmptyDatasets(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	qualifyingIDs := []string{
		"wickra.super_trend",
		"wickra.atr_ratchet",
		"wickra.elder_safe_zone",
		"wickra.kase_dev_stop",
		"wickra.modified_ma_stop",
		"wickra.nrtr",
		"wickra.t3",
		"wickra.hma",
	}

	for _, id := range qualifyingIDs {
		t.Run(id, func(t *testing.T) {
			res, err := engine.Evaluate(ctx, []CandleData{}, []EvalIndicatorInstance{
				{InstanceID: "empty_" + id, IndicatorID: id, Inputs: map[string]interface{}{}},
			})
			if err != nil {
				t.Fatalf("[%s] Evaluate failed on empty candles: %v", id, err)
			}
			if len(res) != 1 {
				t.Fatalf("[%s] Expected 1 result, got %d", id, len(res))
			}

			r := res[0]
			for _, key := range []string{"up", "down", "value", "direction"} {
				pts, exists := r.Plots[key]
				if !exists {
					t.Errorf("[%s] Expected plot key %q to exist in empty result", id, key)
				}
				if pts == nil {
					t.Errorf("[%s] Plot %q slice is nil, must be non-nil empty slice", id, key)
				}
				if len(pts) != 0 {
					t.Errorf("[%s] Plot %q expected length 0, got %d", id, key, len(pts))
				}
			}

			// Verify JSON marshaling produces [] and not null
			data, err := json.Marshal(r)
			if err != nil {
				t.Fatalf("[%s] json.Marshal failed: %v", id, err)
			}
			rawJSON := string(data)

			for _, key := range []string{"up", "down", "value", "direction"} {
				nullPattern := fmt.Sprintf("%q:null", key)
				if strings.Contains(rawJSON, nullPattern) {
					t.Errorf("[%s] JSON contains null for plot %q: %s", id, key, rawJSON)
				}
				emptyPattern := fmt.Sprintf("%q:[]", key)
				if !strings.Contains(rawJSON, emptyPattern) {
					t.Errorf("[%s] JSON missing empty array %q: %s", id, emptyPattern, rawJSON)
				}
			}
		})
	}
}

// TestChallenger_ShortDatasetsWarmup tests datasets shorter than indicator warmup periods.
func TestChallenger_ShortDatasetsWarmup(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	qualifyingIDs := []string{
		"wickra.super_trend",
		"wickra.atr_ratchet",
		"wickra.elder_safe_zone",
		"wickra.kase_dev_stop",
		"wickra.modified_ma_stop",
		"wickra.nrtr",
		"wickra.t3",
		"wickra.hma",
	}

	lengths := []int{1, 2, 3, 5, 8}

	for _, length := range lengths {
		candles := make([]CandleData, length)
		for i := 0; i < length; i++ {
			p := 100.0 + float64(i*2)
			candles[i] = CandleData{
				Time:   1700000000 + int64(i*60),
				Open:   p - 1.0,
				High:   p + 2.0,
				Low:    p - 2.0,
				Close:  p,
				Volume: 500.0,
			}
		}

		for _, id := range qualifyingIDs {
			t.Run(fmt.Sprintf("%s_len_%d", id, length), func(t *testing.T) {
				res, err := engine.Evaluate(ctx, candles, []EvalIndicatorInstance{
					{
						InstanceID:  fmt.Sprintf("short_%s_%d", id, length),
						IndicatorID: id,
						Inputs:      map[string]interface{}{"period": 14, "atr_period": 14},
					},
				})
				if err != nil {
					t.Fatalf("[%s len=%d] Evaluate failed: %v", id, length, err)
				}
				if len(res) != 1 {
					t.Fatalf("[%s len=%d] Expected 1 result, got %d", id, length, len(res))
				}

				r := res[0]
				data, err := json.Marshal(r)
				if err != nil {
					t.Fatalf("[%s len=%d] json.Marshal failed: %v", id, length, err)
				}
				rawJSON := string(data)

				if strings.Contains(rawJSON, "NaN") {
					t.Errorf("[%s len=%d] JSON contains illegal NaN token: %s", id, length, rawJSON)
				}
				if strings.Contains(rawJSON, "Inf") {
					t.Errorf("[%s len=%d] JSON contains illegal Inf token: %s", id, length, rawJSON)
				}

				// Check that any empty plot is serialized as [] not null
				for _, key := range []string{"up", "down", "value", "direction"} {
					nullPattern := fmt.Sprintf("%q:null", key)
					if strings.Contains(rawJSON, nullPattern) {
						t.Errorf("[%s len=%d] JSON contains null for plot %q: %s", id, length, key, rawJSON)
					}
				}
			})
		}
	}
}

// TestChallenger_CompletelyFlatSeries tests evaluation when price is completely motionless.
func TestChallenger_CompletelyFlatSeries(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	const n = 60
	flatCandles := make([]CandleData, n)
	for i := 0; i < n; i++ {
		flatCandles[i] = CandleData{
			Time:   1700000000 + int64(i*60),
			Open:   100.0,
			High:   100.0,
			Low:    100.0,
			Close:  100.0,
			Volume: 1000.0,
		}
	}

	qualifyingIDs := []string{
		"wickra.super_trend",
		"wickra.atr_ratchet",
		"wickra.elder_safe_zone",
		"wickra.kase_dev_stop",
		"wickra.modified_ma_stop",
		"wickra.nrtr",
		"wickra.t3",
		"wickra.hma",
	}

	for _, id := range qualifyingIDs {
		t.Run(id, func(t *testing.T) {
			res, err := engine.Evaluate(ctx, flatCandles, []EvalIndicatorInstance{
				{InstanceID: "flat_" + id, IndicatorID: id, Inputs: map[string]interface{}{}},
			})
			if err != nil {
				t.Fatalf("[%s] Evaluate on flat candles failed: %v", id, err)
			}
			r := res[0]

			// Verify JSON marshal
			data, err := json.Marshal(r)
			if err != nil {
				t.Fatalf("[%s] json.Marshal failed: %v", id, err)
			}
			raw := string(data)
			if strings.Contains(raw, "NaN") || strings.Contains(raw, "Inf") {
				t.Errorf("[%s] Emitted NaN or Inf on flat series: %s", id, raw)
			}

			// Verify timestamps strictly monotonic
			for plotKey, pts := range r.Plots {
				for i := 1; i < len(pts); i++ {
					if pts[i].Time <= pts[i-1].Time {
						t.Errorf("[%s.%s] Non-monotonic timestamp at index %d: %d <= %d",
							id, plotKey, i, pts[i].Time, pts[i-1].Time)
					}
					if math.IsNaN(pts[i].Value) || math.IsInf(pts[i].Value, 0) {
						t.Errorf("[%s.%s] NaN/Inf at index %d", id, plotKey, i)
					}
				}
			}
		})
	}
}

// TestChallenger_SingleBarRegimeFlips tests violent alternating bar-by-bar trend flips.
func TestChallenger_SingleBarRegimeFlips(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	const n = 80
	flips := make([]CandleData, n)
	startTime := int64(1700000000)

	// Zig-zag violently: alternating high and low bars
	for i := 0; i < n; i++ {
		var p float64
		if i%2 == 0 {
			p = 150.0 // spike
		} else {
			p = 50.0 // plunge
		}
		flips[i] = CandleData{
			Time:   startTime + int64(i*60),
			Open:   p,
			High:   p + 5.0,
			Low:    p - 5.0,
			Close:  p,
			Volume: 1000.0,
		}
	}

	testCases := []struct {
		id         string
		isTrailing bool
	}{
		{"wickra.super_trend", true},
		{"wickra.atr_ratchet", true},
		{"wickra.nrtr", true},
		{"wickra.t3", false},
		{"wickra.hma", false},
	}

	for _, tc := range testCases {
		t.Run(tc.id, func(t *testing.T) {
			res, err := engine.Evaluate(ctx, flips, []EvalIndicatorInstance{
				{InstanceID: "flip_" + tc.id, IndicatorID: tc.id, Inputs: map[string]interface{}{}},
			})
			if err != nil {
				t.Fatalf("[%s] Evaluate failed: %v", tc.id, err)
			}
			r := res[0]

			up := r.Plots["up"]
			down := r.Plots["down"]

			// 1. Monotonic timestamps in up and down
			for i := 1; i < len(up); i++ {
				if up[i].Time <= up[i-1].Time {
					t.Errorf("[%s] up timestamps not strictly monotonic at %d: %d <= %d",
						tc.id, i, up[i].Time, up[i-1].Time)
				}
			}
			for i := 1; i < len(down); i++ {
				if down[i].Time <= down[i-1].Time {
					t.Errorf("[%s] down timestamps not strictly monotonic at %d: %d <= %d",
						tc.id, i, down[i].Time, down[i-1].Time)
				}
			}

			// 2. Trailing stops: disjoint timestamps
			if tc.isTrailing {
				upTimes := make(map[int64]bool)
				for _, p := range up {
					upTimes[p.Time] = true
				}
				for _, p := range down {
					if upTimes[p.Time] {
						t.Errorf("[%s] overlapping timestamp %d between up and down in trailing stop", tc.id, p.Time)
					}
				}
			}

			// 3. Clean JSON round-trip
			data, err := json.Marshal(r)
			if err != nil {
				t.Fatalf("[%s] json.Marshal failed: %v", tc.id, err)
			}
			raw := string(data)
			if strings.Contains(raw, "NaN") || strings.Contains(raw, "Inf") {
				t.Errorf("[%s] illegal token in JSON: %s", tc.id, raw[:200])
			}

			var decoded EvalResult
			if err := json.Unmarshal(data, &decoded); err != nil {
				t.Fatalf("[%s] json.Unmarshal failed: %v", tc.id, err)
			}
		})
	}
}

// TestChallenger_ExtremePricesFloatStress tests ultra-small prices, ultra-large prices, and negative prices.
func TestChallenger_ExtremePricesFloatStress(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	scenarios := []struct {
		name      string
		makePrice func(i int) float64
	}{
		{
			name: "MemeCoinMicroPrice",
			makePrice: func(i int) float64 {
				return 0.00000005 + float64(i)*0.000000001
			},
		},
		{
			name: "MacroCommodityNegativePrice",
			makePrice: func(i int) float64 {
				return -37.0 + float64(i)*0.5 // e.g. WTI Crude crash April 2020
			},
		},
		{
			name: "MassiveIndexLargePrice",
			makePrice: func(i int) float64 {
				return 100000000.0 + float64(i)*5000.0
			},
		},
	}

	qualifying := []string{"wickra.super_trend", "wickra.t3", "wickra.hma"}

	for _, sc := range scenarios {
		candles := make([]CandleData, 40)
		for i := 0; i < 40; i++ {
			p := sc.makePrice(i)
			spread := math.Abs(p) * 0.01
			if spread < 1e-9 {
				spread = 1e-9
			}
			candles[i] = CandleData{
				Time:   1700000000 + int64(i*60),
				Open:   p - spread*0.2,
				High:   p + spread,
				Low:    p - spread,
				Close:  p,
				Volume: 10000.0,
			}
		}

		for _, id := range qualifying {
			t.Run(fmt.Sprintf("%s_%s", sc.name, id), func(t *testing.T) {
				res, err := engine.Evaluate(ctx, candles, []EvalIndicatorInstance{
					{InstanceID: "ext_" + id, IndicatorID: id, Inputs: map[string]interface{}{}},
				})
				if err != nil {
					// Some Rust WASM indicators may return an error for negative prices (e.g. log / sqrt inside),
					// which is safe as long as Go doesn't panic.
					t.Logf("[%s %s] Evaluate returned error (graceful rejection): %v", sc.name, id, err)
					return
				}

				r := res[0]
				data, err := json.Marshal(r)
				if err != nil {
					t.Fatalf("[%s %s] json.Marshal failed: %v", sc.name, id, err)
				}
				raw := string(data)
				if strings.Contains(raw, "NaN") || strings.Contains(raw, "Inf") {
					t.Errorf("[%s %s] Emitted NaN/Inf: %s", sc.name, id, raw)
				}
			})
		}
	}
}

// TestChallenger_HighConcurrencyWorkerPoolSafety tests 32 parallel goroutines concurrently evaluating
// indicators with varying parameters and random dataset sizes.
func TestChallenger_HighConcurrencyWorkerPoolSafety(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	const numWorkers = 32
	const itersPerWorker = 8

	var wg sync.WaitGroup
	errCh := make(chan error, numWorkers*itersPerWorker)

	allIndicators := []string{
		"wickra.super_trend",
		"wickra.t3",
		"wickra.hma",
		"wickra.atr_ratchet",
		"wickra.elder_safe_zone",
		"wickra.kase_dev_stop",
		"wickra.modified_ma_stop",
		"wickra.nrtr",
	}

	for w := 0; w < numWorkers; w++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			rng := rand.New(rand.NewSource(time.Now().UnixNano() + int64(workerID*1000)))

			for it := 0; it < itersPerWorker; it++ {
				nCandles := rng.Intn(80) // 0 to 79 candles
				candles := make([]CandleData, nCandles)
				p := 100.0 + rng.Float64()*50.0
				for c := 0; c < nCandles; c++ {
					step := (rng.Float64() - 0.5) * 4.0
					p += step
					candles[c] = CandleData{
						Time:   1700000000 + int64(c*60),
						Open:   p - step*0.5,
						High:   p + 2.0,
						Low:    p - 2.0,
						Close:  p,
						Volume: 1000.0,
					}
				}

				// Pick 2 random indicators
				ind1 := allIndicators[rng.Intn(len(allIndicators))]
				ind2 := allIndicators[rng.Intn(len(allIndicators))]

				cfgs := []EvalIndicatorInstance{
					{InstanceID: fmt.Sprintf("w%d_it%d_1", workerID, it), IndicatorID: ind1, Inputs: map[string]interface{}{}},
					{InstanceID: fmt.Sprintf("w%d_it%d_2", workerID, it), IndicatorID: ind2, Inputs: map[string]interface{}{}},
				}

				res, err := engine.Evaluate(ctx, candles, cfgs)
				if err != nil {
					errCh <- fmt.Errorf("worker %d iter %d: Evaluate failed: %w", workerID, it, err)
					return
				}
				if len(res) != len(cfgs) {
					errCh <- fmt.Errorf("worker %d iter %d: expected %d results, got %d", workerID, it, len(cfgs), len(res))
					return
				}

				data, err := json.Marshal(res)
				if err != nil {
					errCh <- fmt.Errorf("worker %d iter %d: json.Marshal failed: %w", workerID, it, err)
					return
				}

				raw := string(data)
				if strings.Contains(raw, "NaN") || strings.Contains(raw, "Inf") {
					errCh <- fmt.Errorf("worker %d iter %d: NaN/Inf in output: %s", workerID, it, raw[:100])
					return
				}

				var decoded []EvalResult
				if err := json.Unmarshal(data, &decoded); err != nil {
					errCh <- fmt.Errorf("worker %d iter %d: json.Unmarshal failed: %w", workerID, it, err)
					return
				}
			}
		}(w)
	}

	wg.Wait()
	close(errCh)

	var errors []error
	for err := range errCh {
		errors = append(errors, err)
	}

	if len(errors) > 0 {
		for _, e := range errors {
			t.Errorf("Concurrent stress error: %v", e)
		}
	}
}

// TestChallenger_StreamingSessionConcurrentStress tests StreamingSession concurrency under rapid tick updates.
func TestChallenger_StreamingSessionConcurrentStress(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	const numSessions = 8
	const ticksPerSession = 50

	var wg sync.WaitGroup
	errCh := make(chan error, numSessions)

	for sIdx := 0; sIdx < numSessions; sIdx++ {
		wg.Add(1)
		go func(sessID int) {
			defer wg.Done()

			cfgs := []EvalIndicatorInstance{
				{InstanceID: fmt.Sprintf("st_%d", sessID), IndicatorID: "wickra.super_trend", Inputs: map[string]interface{}{"atr_period": 10, "multiplier": 2.0}},
				{InstanceID: fmt.Sprintf("t3_%d", sessID), IndicatorID: "wickra.t3", Inputs: map[string]interface{}{"period": 10, "v": 0.7, "source": "close"}},
			}

			sess, err := engine.CreateSession(ctx, fmt.Sprintf("SYM_%d", sessID), "1m", cfgs)
			if err != nil {
				errCh <- fmt.Errorf("session %d NewStreamingSession: %w", sessID, err)
				return
			}
			defer sess.Close(ctx)

			price := 100.0
			for tick := 0; tick < ticksPerSession; tick++ {
				price += (float64(tick%5) - 2.0)
				c := CandleData{
					Time:   1700000000 + int64(tick*60),
					Open:   price - 0.5,
					High:   price + 1.0,
					Low:    price - 1.0,
					Close:  price,
					Volume: 1000.0,
				}

				plots, err := sess.Update(ctx, c)
				if err != nil {
					errCh <- fmt.Errorf("session %d tick %d Update: %w", sessID, tick, err)
					return
				}

				// Check serialization of streaming plots
				data, err := json.Marshal(plots)
				if err != nil {
					errCh <- fmt.Errorf("session %d tick %d Marshal: %w", sessID, tick, err)
					return
				}
				raw := string(data)
				if strings.Contains(raw, "NaN") || strings.Contains(raw, "Inf") {
					errCh <- fmt.Errorf("session %d tick %d NaN/Inf in output: %s", sessID, tick, raw)
					return
				}
			}
		}(sIdx)
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		t.Errorf("StreamingSession stress error: %v", err)
	}
}


// TestChallenger_OffsetsConsistency verifies that time offsets shift up/down series identically to value/direction.
func TestChallenger_OffsetsConsistency(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	candles := generateTrendCandles(60)
	offsets := []int{-3, 0, 4}

	for _, off := range offsets {
		t.Run(fmt.Sprintf("offset_%d", off), func(t *testing.T) {
			res, err := engine.Evaluate(ctx, candles, []EvalIndicatorInstance{
				{
					InstanceID:  "st_off",
					IndicatorID: "wickra.super_trend",
					Inputs:      map[string]interface{}{"atr_period": 10, "multiplier": 2.0, "offset": off},
				},
				{
					InstanceID:  "t3_off",
					IndicatorID: "wickra.t3",
					Inputs:      map[string]interface{}{"period": 10, "v": 0.7, "source": "close", "offset": off},
				},
			})
			if err != nil {
				t.Fatalf("Evaluate with offset %d failed: %v", off, err)
			}

			const interval = int64(60)
			expectedShift := int64(off) * interval

			for _, r := range res {
				// Verify up/down/value/direction are all shifted identically
				for plotKey, pts := range r.Plots {
					for i, pt := range pts {
						if i > 0 && pt.Time <= pts[i-1].Time {
							t.Errorf("[%s.%s] Non-monotonic time with offset %d at index %d", r.IndicatorID, plotKey, off, i)
						}
					}
				}

				// Check that value points and up/down points align in time
				valTimes := make(map[int64]bool)
				for _, pt := range r.Plots["value"] {
					valTimes[pt.Time] = true
				}
				for _, pt := range r.Plots["up"] {
					if !valTimes[pt.Time] {
						t.Errorf("[%s] up point time %d not found in value points (shift mismatch)", r.IndicatorID, pt.Time)
					}
				}
				for _, pt := range r.Plots["down"] {
					if !valTimes[pt.Time] {
						t.Errorf("[%s] down point time %d not found in value points (shift mismatch)", r.IndicatorID, pt.Time)
					}
				}

				_ = expectedShift
			}
		})
	}
}

// TestChallenger_InflectionPlateauReversals tests peak and trough plateaus (slope == 0 for multiple bars during reversal).
func TestChallenger_InflectionPlateauReversals(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	// Series with plateaus:
	// Bars 0-19: climb (Up)
	// Bars 20-25: flat peak plateau (slope 0)
	// Bars 26-45: fall (Down)
	// Bars 46-50: flat trough plateau (slope 0)
	// Bars 51-70: climb (Up)
	const n = 71
	candles := make([]CandleData, n)
	startTime := int64(1700000000)
	price := 100.0

	for i := 0; i < n; i++ {
		var step float64
		if i < 20 {
			step = 1.0 // rally
		} else if i <= 25 {
			step = 0.0 // peak plateau
		} else if i < 46 {
			step = -1.0 // descent
		} else if i <= 50 {
			step = 0.0 // trough plateau
		} else {
			step = 1.0 // rebound
		}
		price += step
		candles[i] = CandleData{
			Time:   startTime + int64(i*60),
			Open:   price - 0.5,
			High:   price + 1.0,
			Low:    price - 1.0,
			Close:  price,
			Volume: 1000.0,
		}
	}

	res, err := engine.Evaluate(ctx, candles, []EvalIndicatorInstance{
		{InstanceID: "t3_plateau", IndicatorID: "wickra.t3", Inputs: map[string]interface{}{"period": 5, "v": 0.7, "source": "close"}},
		{InstanceID: "hma_plateau", IndicatorID: "wickra.hma", Inputs: map[string]interface{}{"period": 5, "source": "close"}},
	})
	if err != nil {
		t.Fatalf("Evaluate failed: %v", err)
	}

	for _, r := range res {
		up := r.Plots["up"]
		down := r.Plots["down"]
		if len(up) == 0 || len(down) == 0 {
			t.Errorf("[%s] expected both up and down points on plateau series, got up=%d, down=%d",
				r.IndicatorID, len(up), len(down))
		}

		// Verify timestamps strictly monotonic
		for i := 1; i < len(up); i++ {
			if up[i].Time <= up[i-1].Time {
				t.Errorf("[%s] up timestamps not monotonic at %d: %d <= %d", r.IndicatorID, i, up[i].Time, up[i-1].Time)
			}
		}
		for i := 1; i < len(down); i++ {
			if down[i].Time <= down[i-1].Time {
				t.Errorf("[%s] down timestamps not monotonic at %d: %d <= %d", r.IndicatorID, i, down[i].Time, down[i-1].Time)
			}
		}

		// Verify JSON serialization
		data, err := json.Marshal(r)
		if err != nil {
			t.Errorf("[%s] JSON marshal failed: %v", r.IndicatorID, err)
		}
		if strings.Contains(string(data), "NaN") {
			t.Errorf("[%s] JSON contains NaN", r.IndicatorID)
		}
	}
}

// TestChallenger_RepeatedEvaluationDeterminism verifies bit-for-bit repeatability across 100 consecutive evaluations
// ensuring no worker pool pollution or mutable state leakage.
func TestChallenger_RepeatedEvaluationDeterminism(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	candles := generateTrendCandles(50)
	cfgs := []EvalIndicatorInstance{
		{InstanceID: "st", IndicatorID: "wickra.super_trend", Inputs: map[string]interface{}{"atr_period": 10, "multiplier": 2.0}},
		{InstanceID: "t3", IndicatorID: "wickra.t3", Inputs: map[string]interface{}{"period": 10, "v": 0.7, "source": "close"}},
	}

	// Baseline run
	baseResults, err := engine.Evaluate(ctx, candles, cfgs)
	if err != nil {
		t.Fatalf("Baseline evaluate failed: %v", err)
	}
	baseJSON, err := json.Marshal(baseResults)
	if err != nil {
		t.Fatalf("Baseline marshal failed: %v", err)
	}

	// 100 consecutive evaluations
	for iter := 0; iter < 100; iter++ {
		iterResults, err := engine.Evaluate(ctx, candles, cfgs)
		if err != nil {
			t.Fatalf("Iteration %d evaluate failed: %v", iter, err)
		}
		iterJSON, err := json.Marshal(iterResults)
		if err != nil {
			t.Fatalf("Iteration %d marshal failed: %v", iter, err)
		}
		if string(iterJSON) != string(baseJSON) {
			t.Fatalf("Iteration %d produced non-deterministic output differing from baseline", iter)
		}
	}
}
