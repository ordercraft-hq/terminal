package wickra

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"sync"
	"testing"
	"time"
)

// TestAdversarial_HighConcurrencyBatch evaluates indicators across multiple goroutines
// to stress-test worker pool allocation, module isolation, and race conditions.
func TestAdversarial_HighConcurrencyBatch(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	const numGoroutines = 20
	const iterationsPerGoroutine = 10
	const barCount = 200

	// Pre-generate deterministic test bars
	candles := make([]CandleData, barCount)
	price := 100.0
	for i := 0; i < barCount; i++ {
		delta := math.Sin(float64(i)*0.1) * 2.0
		price += delta
		candles[i] = CandleData{
			Time:   int64(1700000000 + i*60),
			Open:   price,
			High:   price + 1.5,
			Low:    price - 1.5,
			Close:  price + delta*0.5,
			Volume: 100 + float64(i%10)*5,
		}
	}

	configsList := [][]EvalIndicatorInstance{
		{
			{InstanceID: "sma_10", IndicatorID: "wickra.sma", Inputs: map[string]interface{}{"period": 10}},
			{InstanceID: "ema_20", IndicatorID: "wickra.ema", Inputs: map[string]interface{}{"period": 20}},
		},
		{
			{InstanceID: "rsi_14", IndicatorID: "wickra.rsi", Inputs: map[string]interface{}{"period": 14}},
			{InstanceID: "bb_20", IndicatorID: "wickra.bollinger_bands", Inputs: map[string]interface{}{"period": 20, "multiplier": 2.0}},
		},
		{
			{InstanceID: "macd_std", IndicatorID: "wickra.macd", Inputs: map[string]interface{}{"fast": 12, "slow": 26, "signal": 9}},
		},
	}

	var wg sync.WaitGroup
	errCh := make(chan error, numGoroutines*iterationsPerGoroutine)

	start := time.Now()
	for g := 0; g < numGoroutines; g++ {
		wg.Add(1)
		go func(gid int) {
			defer wg.Done()
			for iter := 0; iter < iterationsPerGoroutine; iter++ {
				cfgs := configsList[(gid+iter)%len(configsList)]
				results, err := engine.Evaluate(ctx, candles, cfgs)
				if err != nil {
					errCh <- fmt.Errorf("goroutine %d iter %d eval failed: %w", gid, iter, err)
					return
				}
				if len(results) != len(cfgs) {
					errCh <- fmt.Errorf("goroutine %d iter %d expected %d results, got %d", gid, iter, len(cfgs), len(results))
					return
				}
				for _, res := range results {
					if len(res.Plots) == 0 {
						errCh <- fmt.Errorf("goroutine %d iter %d empty plots for %s", gid, iter, res.IndicatorID)
						return
					}
				}
			}
		}(g)
	}

	wg.Wait()
	close(errCh)

	elapsed := time.Since(start)
	t.Logf("Completed %d concurrent batch evaluations (%d total calls) across %d goroutines in %v",
		numGoroutines*iterationsPerGoroutine, numGoroutines*iterationsPerGoroutine, numGoroutines, elapsed)

	for err := range errCh {
		t.Errorf("Concurrency failure: %v", err)
	}
}

// TestAdversarial_ExtremeBarDynamics tests streaming sessions against extreme price dynamics:
// flatlines, flash crashes, zero volume, negative prices, and sub-atomic decimals.
func TestAdversarial_ExtremeBarDynamics(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	type scenario struct {
		name    string
		candles []CandleData
	}

	const n = 500
	scenarios := []scenario{
		{
			name: "Flatline_ZeroVariance",
			candles: func() []CandleData {
				bars := make([]CandleData, n)
				for i := 0; i < n; i++ {
					bars[i] = CandleData{
						Time:   int64(1000 + i*60),
						Open:   100.0,
						High:   100.0,
						Low:    100.0,
						Close:  100.0,
						Volume: 50.0,
					}
				}
				return bars
			}(),
		},
		{
			name: "FlashCrash_AndRebound",
			candles: func() []CandleData {
				bars := make([]CandleData, n)
				for i := 0; i < n; i++ {
					p := 100.0
					if i == 50 {
						p = 0.00001 // flash crash
					} else if i == 51 {
						p = 10000.0 // instant super rebound
					}
					bars[i] = CandleData{
						Time:   int64(1000 + i*60),
						Open:   p,
						High:   p * 1.05,
						Low:    p * 0.95,
						Close:  p,
						Volume: 100.0,
					}
				}
				return bars
			}(),
		},
		{
			name: "NegativePrices_WTIStyle",
			candles: func() []CandleData {
				bars := make([]CandleData, n)
				for i := 0; i < n; i++ {
					p := -37.0 + math.Sin(float64(i)*0.05)*10.0
					bars[i] = CandleData{
						Time:   int64(1000 + i*60),
						Open:   p,
						High:   p + 1.0,
						Low:    p - 1.0,
						Close:  p + 0.2,
						Volume: 100.0,
					}
				}
				return bars
			}(),
		},
		{
			name: "MicroDecimals_SubSatoshi",
			candles: func() []CandleData {
				bars := make([]CandleData, n)
				for i := 0; i < n; i++ {
					p := 1e-8 + float64(i%10)*1e-9
					bars[i] = CandleData{
						Time:   int64(1000 + i*60),
						Open:   p,
						High:   p * 1.1,
						Low:    p * 0.9,
						Close:  p,
						Volume: 1e6,
					}
				}
				return bars
			}(),
		},
		{
			name: "ZeroVolume_Illiquid",
			candles: func() []CandleData {
				bars := make([]CandleData, n)
				for i := 0; i < n; i++ {
					p := 50.0 + float64(i)*0.1
					bars[i] = CandleData{
						Time:   int64(1000 + i*60),
						Open:   p,
						High:   p + 0.5,
						Low:    p - 0.5,
						Close:  p,
						Volume: 0.0,
					}
				}
				return bars
			}(),
		},
	}

	configs := []EvalIndicatorInstance{
		{InstanceID: "sma", IndicatorID: "wickra.sma", Inputs: map[string]interface{}{"period": 14}},
		{InstanceID: "rsi", IndicatorID: "wickra.rsi", Inputs: map[string]interface{}{"period": 14}},
		{InstanceID: "bb", IndicatorID: "wickra.bollinger_bands", Inputs: map[string]interface{}{"period": 14, "multiplier": 2.0}},
		{InstanceID: "macd", IndicatorID: "wickra.macd", Inputs: map[string]interface{}{"fast": 12, "slow": 26, "signal": 9}},
	}

	for _, sc := range scenarios {
		t.Run(sc.name, func(t *testing.T) {
			session, err := engine.CreateSession(ctx, "TEST", "1m", configs)
			if err != nil {
				t.Fatalf("CreateSession failed on %s: %v", sc.name, err)
			}
			defer session.Close(ctx)

			for i, bar := range sc.candles {
				plots, err := session.Update(ctx, bar)
				if err != nil {
					t.Fatalf("Update failed on %s bar %d: %v", sc.name, i, err)
				}

				if i >= 35 { // Beyond MACD warmup (slow 26 + signal 9)
					if sc.name == "Flatline_ZeroVariance" {
						if bb, ok := plots["bb"]; ok {
							if math.IsNaN(bb["stddev"]) || bb["stddev"] != 0.0 {
								t.Errorf("Bar %d Flatline BB stddev expected 0, got %f", i, bb["stddev"])
							}
							if !almostEqual(bb["upper"], 100.0, 1e-4) || !almostEqual(bb["lower"], 100.0, 1e-4) {
								t.Errorf("Bar %d Flatline BB upper/lower should be 100, got upper=%f, lower=%f", i, bb["upper"], bb["lower"])
							}
						}
					}
				}
				_ = plots
			}
		})
	}
}

// TestAdversarial_NumericalDrift5000Bars compares streaming Update(bar) step-by-step
// against batch Evaluate() across 5,000 bars to detect any numerical drift, precision loss, or divergence.
func TestAdversarial_NumericalDrift5000Bars(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	const barCount = 5000
	candles := make([]CandleData, barCount)

	// Deterministic pseudo-random walk
	r := rand.New(rand.NewSource(42))
	price := 1000.0
	for i := 0; i < barCount; i++ {
		ret := (r.Float64() - 0.499) * 0.02
		price *= (1.0 + ret)
		h := price * (1.0 + r.Float64()*0.005)
		l := price * (1.0 - r.Float64()*0.005)
		candles[i] = CandleData{
			Time:   int64(1600000000 + i*60),
			Open:   price,
			High:   h,
			Low:    l,
			Close:  price * (1.0 + (r.Float64()-0.5)*0.002),
			Volume: 500 + r.Float64()*1000,
		}
	}

	configs := []EvalIndicatorInstance{
		{InstanceID: "sma_20", IndicatorID: "wickra.sma", Inputs: map[string]interface{}{"period": 20}},
		{InstanceID: "ema_20", IndicatorID: "wickra.ema", Inputs: map[string]interface{}{"period": 20}},
		{InstanceID: "rsi_14", IndicatorID: "wickra.rsi", Inputs: map[string]interface{}{"period": 14}},
		{InstanceID: "bb_20", IndicatorID: "wickra.bollinger_bands", Inputs: map[string]interface{}{"period": 20, "multiplier": 2.0}},
		{InstanceID: "macd", IndicatorID: "wickra.macd", Inputs: map[string]interface{}{"fast": 12, "slow": 26, "signal": 9}},
	}

	// 1. Batch evaluation
	batchStart := time.Now()
	batchResults, err := engine.Evaluate(ctx, candles, configs)
	if err != nil {
		t.Fatalf("Batch evaluate failed: %v", err)
	}
	batchDuration := time.Since(batchStart)
	t.Logf("Batch evaluation of 5,000 bars for 5 indicators completed in %v", batchDuration)

	// Map batch results by instanceID -> time -> plotID -> value
	batchMap := make(map[string]map[int64]map[string]float64)
	for _, res := range batchResults {
		if batchMap[res.InstanceID] == nil {
			batchMap[res.InstanceID] = make(map[int64]map[string]float64)
		}
		for plotID, points := range res.Plots {
			for _, pt := range points {
				if batchMap[res.InstanceID][pt.Time] == nil {
					batchMap[res.InstanceID][pt.Time] = make(map[string]float64)
				}
				batchMap[res.InstanceID][pt.Time][plotID] = pt.Value
			}
		}
	}

	// 2. Streaming evaluation step-by-step
	streamSession, err := engine.CreateSession(ctx, "BTCUSDT", "1m", configs)
	if err != nil {
		t.Fatalf("CreateSession failed: %v", err)
	}
	defer streamSession.Close(ctx)

	maxDrift := make(map[string]float64)
	streamStart := time.Now()

	for i, bar := range candles {
		plots, err := streamSession.Update(ctx, bar)
		if err != nil {
			t.Fatalf("Stream Update failed at bar %d: %v", i, err)
		}

		// Compare streaming plots against batch plots for this timestamp
		for instID, pMap := range plots {
			bPlots, hasB := batchMap[instID][bar.Time]
			if !hasB {
				// Batch did not emit this timestamp?
				t.Fatalf("Bar %d (time %d): Stream emitted plots for %s but Batch did not", i, bar.Time, instID)
			}
			for plotKey, streamVal := range pMap {
				batchVal, hasVal := bPlots[plotKey]
				if !hasVal {
					t.Fatalf("Bar %d (time %d): Stream emitted %s.%s but Batch did not", i, bar.Time, instID, plotKey)
				}
				diff := math.Abs(streamVal - batchVal)
				if diff > maxDrift[instID+"."+plotKey] {
					maxDrift[instID+"."+plotKey] = diff
				}
				// Tolerance: 1e-9 (strict floating point equivalence)
				if diff > 1e-9 {
					t.Fatalf("Numerical drift detected at bar %d (time %d) for %s.%s: stream=%v, batch=%v, diff=%v",
						i, bar.Time, instID, plotKey, streamVal, batchVal, diff)
				}
			}
		}
	}
	streamDuration := time.Since(streamStart)
	rate := float64(barCount*len(configs)) / streamDuration.Seconds()
	t.Logf("Streaming evaluation of 5,000 bars for 5 indicators completed in %v (~%.0f updates/sec)", streamDuration, rate)

	t.Logf("--- Maximum Observed Drift (5,000 Bars: Streaming vs Batch) ---")
	for k, v := range maxDrift {
		t.Logf("  %s: %e", k, v)
	}
}

// TestAdversarial_HeapObjectLeakAnalysis investigates whether SessionHostContext.objects
// leaks entries during multi-output indicator evaluations or rapid-fire streaming.
func TestAdversarial_HeapObjectLeakAnalysis(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	// Access worker directly to inspect SessionHostContext internals
	worker := engine.workerPool.Get().(*Worker)
	defer engine.workerPool.Put(worker)

	bbDesc, _ := engine.GetDescriptor("wickra.bollinger_bands")
	bbInst, err := worker.NewIndicator(ctx, &bbDesc, map[string]interface{}{"period": 5, "multiplier": 2.0})
	if err != nil {
		t.Fatalf("NewIndicator failed: %v", err)
	}
	defer bbInst.Free(ctx)

	initialObjCount := len(worker.Session.objects)
	t.Logf("Initial objects count in SessionHostContext: %d", initialObjCount)

	const steps = 1000
	for i := 0; i < steps; i++ {
		candle := CandleData{
			Time:  int64(1000 + i*60),
			Open:  10.0 + float64(i%5),
			High:  12.0 + float64(i%5),
			Low:   9.0 + float64(i%5),
			Close: 11.0 + float64(i%5),
		}
		_, _, _, err := bbInst.Update(ctx, candle)
		if err != nil {
			t.Fatalf("Update step %d failed: %v", i, err)
		}
	}

	finalObjCount := len(worker.Session.objects)
	t.Logf("Objects count in SessionHostContext after %d multi-output updates: %d (Delta: +%d)",
		steps, finalObjCount, finalObjCount-initialObjCount)

	// Sample the leaked objects
	sampleCount := 0
	for h, obj := range worker.Session.objects {
		if sampleCount < 10 {
			t.Logf("  Sample heap handle %d: type=%T val=%+v", h, obj, obj)
			sampleCount++
		}
	}

	if finalObjCount > initialObjCount+10 {
		t.Errorf("MEMORY LEAK DETECTED: SessionHostContext.objects grew from %d to %d (+%d objects) over %d steps!",
			initialObjCount, finalObjCount, finalObjCount-initialObjCount, steps)
	}
}

// TestAdversarial_InvalidInputsAndConstructorParameters tests handling of invalid inputs
// (negative periods, 0 periods, unknown indicator IDs, malformed inputs).
func TestAdversarial_InvalidInputsAndConstructorParameters(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	candles := []CandleData{
		{Time: 1000, Open: 10, High: 11, Low: 9, Close: 10, Volume: 100},
	}

	// 1. Unknown indicator ID
	unknownCfg := []EvalIndicatorInstance{
		{InstanceID: "unknown", IndicatorID: "wickra.non_existent_indicator"},
	}
	_, err = engine.Evaluate(ctx, candles, unknownCfg)
	if err == nil {
		t.Errorf("Expected error for non-existent indicator, got nil")
	}

	// 2. Zero period SMA
	zeroCfg := []EvalIndicatorInstance{
		{InstanceID: "zero_sma", IndicatorID: "wickra.sma", Inputs: map[string]interface{}{"period": 0}},
	}
	_, err = engine.Evaluate(ctx, candles, zeroCfg)
	t.Logf("Zero period result: err = %v", err)

	// 3. Negative period SMA
	negCfg := []EvalIndicatorInstance{
		{InstanceID: "neg_sma", IndicatorID: "wickra.sma", Inputs: map[string]interface{}{"period": -10}},
	}
	_, err = engine.Evaluate(ctx, candles, negCfg)
	t.Logf("Negative period result: err = %v", err)
}
