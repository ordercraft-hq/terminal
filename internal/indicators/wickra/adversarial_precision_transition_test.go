package wickra

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"testing"
)

// generateWhipsawCandles creates candles that oscillate rapidly to force frequent trend flips.
func generateWhipsawCandles(n int) []CandleData {
	candles := make([]CandleData, n)
	startTime := int64(1700000000)
	base := 100.0

	for i := 0; i < n; i++ {
		// Alternate large swings every 2 bars
		swing := 5.0
		if (i/2)%2 == 1 {
			swing = -5.0
		}
		price := base + swing + float64(i%3)*0.5
		candles[i] = CandleData{
			Time:   startTime + int64(i*60),
			Open:   price - 1.0,
			High:   price + 3.0,
			Low:    price - 3.0,
			Close:  price,
			Volume: 1000.0,
		}
	}
	return candles
}

// generateMicroPriceCandles creates candles with crypto/micro-penny pricing (e.g. 0.00001234).
func generateMicroPriceCandles(n int) []CandleData {
	candles := make([]CandleData, n)
	startTime := int64(1700000000)
	price := 0.00005000

	for i := 0; i < n; i++ {
		var step float64
		if i < n/2 {
			step = 0.00000150
		} else {
			step = -0.00000180
		}
		price += step
		candles[i] = CandleData{
			Time:   startTime + int64(i*60),
			Open:   price - step*0.5,
			High:   price + 0.00000100,
			Low:    price - 0.00000100,
			Close:  price,
			Volume: 1000000.0,
		}
	}
	return candles
}

// generateMegaPriceCandles creates candles with Berkshire/index-scale pricing ($10,000,000).
func generateMegaPriceCandles(n int) []CandleData {
	candles := make([]CandleData, n)
	startTime := int64(1700000000)
	price := 10000000.0

	for i := 0; i < n; i++ {
		var step float64
		if i < n/2 {
			step = 5000.0
		} else {
			step = -6000.0
		}
		price += step
		candles[i] = CandleData{
			Time:   startTime + int64(i*60),
			Open:   price - step*0.5,
			High:   price + 2000.0,
			Low:    price - 2000.0,
			Close:  price,
			Volume: 50.0,
		}
	}
	return candles
}

// generatePlateauCandles creates candles with sharp trends separated by long flat zero-derivative plateaus.
func generatePlateauCandles() []CandleData {
	n := 100
	candles := make([]CandleData, n)
	startTime := int64(1700000000)
	price := 100.0

	for i := 0; i < n; i++ {
		if i < 20 {
			price += 2.0 // Rally
		} else if i < 40 {
			// Flat plateau 1 (slope == 0)
			price = 140.0
		} else if i < 60 {
			price -= 3.0 // Crash
		} else if i < 80 {
			// Flat plateau 2 (slope == 0)
			price = 80.0
		} else {
			price += 2.5 // Rebound
		}
		candles[i] = CandleData{
			Time:   startTime + int64(i*60),
			Open:   price,
			High:   price + 0.5,
			Low:    price - 0.5,
			Close:  price,
			Volume: 1000.0,
		}
	}
	return candles
}

// TestAdversarial_TrailingStops_StrictDisjointFlips stress-tests trailing stops under violent whipsaws
// to prove that Tup ∩ Tdown = ∅ is NEVER violated under any market conditions.
func TestAdversarial_TrailingStops_StrictDisjointFlips(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	// Test multiple distinct scenarios
	scenarios := []struct {
		name    string
		candles []CandleData
	}{
		{"Whipsaw_RapidFlips", generateWhipsawCandles(120)},
		{"MicroPrice_Pennies", generateMicroPriceCandles(100)},
		{"MegaPrice_Millions", generateMegaPriceCandles(100)},
		{"Plateau_ZeroSlope", generatePlateauCandles()},
		{"Trend_StandardRally", generateTrendCandles(100)},
	}

	trailingStops := []struct {
		id     string
		name   string
		inputs map[string]interface{}
	}{
		{"wickra.super_trend", "SuperTrend", map[string]interface{}{"atr_period": 7, "multiplier": 1.5}},
		{"wickra.atr_ratchet", "ATR Ratchet", map[string]interface{}{"atr_period": 7, "start_mult": 1.5, "increment": 0.5}},
		{"wickra.elder_safe_zone", "Elder SafeZone", map[string]interface{}{"period": 7, "coeff": 1.5}},
		{"wickra.kase_dev_stop", "Kase DevStop", map[string]interface{}{"period": 7, "dev": 1.0}},
		{"wickra.modified_ma_stop", "Modified MA Stop", map[string]interface{}{"period": 7}},
		{"wickra.nrtr", "NRTR", map[string]interface{}{"pct": 1.5}},
	}

	for _, sc := range scenarios {
		t.Run(sc.name, func(t *testing.T) {
			for _, ts := range trailingStops {
				t.Run(ts.name, func(t *testing.T) {
					results, err := engine.Evaluate(ctx, sc.candles, []EvalIndicatorInstance{
						{
							InstanceID:  "adv_" + ts.id,
							IndicatorID: ts.id,
							Inputs:      ts.inputs,
						},
					})
					if err != nil {
						t.Fatalf("Evaluate failed for %s: %v", ts.name, err)
					}
					if len(results) != 1 {
						t.Fatalf("Expected 1 result, got %d", len(results))
					}

					res := results[0]
					up := res.Plots["up"]
					down := res.Plots["down"]
					values := res.Plots["value"]
					directions := res.Plots["direction"]

					if len(values) == 0 {
						t.Fatalf("No value points generated for %s", ts.name)
					}

					// Build maps of timestamps
					upTimestamps := make(map[int64]float64)
					downTimestamps := make(map[int64]float64)

					// 1. Verify strict monotonicity and check for internal duplicates in up
					var prevUpTime int64 = 0
					for _, pt := range up {
						if prevUpTime != 0 && pt.Time <= prevUpTime {
							t.Fatalf("[%s][%s] Non-monotonic or duplicate timestamp in 'up': prev=%d, curr=%d",
								sc.name, ts.name, prevUpTime, pt.Time)
						}
						prevUpTime = pt.Time
						upTimestamps[pt.Time] = pt.Value
					}

					// 2. Verify strict monotonicity and check for internal duplicates in down
					var prevDownTime int64 = 0
					for _, pt := range down {
						if prevDownTime != 0 && pt.Time <= prevDownTime {
							t.Fatalf("[%s][%s] Non-monotonic or duplicate timestamp in 'down': prev=%d, curr=%d",
								sc.name, ts.name, prevDownTime, pt.Time)
						}
						prevDownTime = pt.Time
						downTimestamps[pt.Time] = pt.Value
					}

					// 3. ADVERSARIAL DISJOINT TEST: Tup ∩ Tdown = ∅
					intersectionCount := 0
					for tUp := range upTimestamps {
						if _, inDown := downTimestamps[tUp]; inDown {
							intersectionCount++
							t.Errorf("[%s][%s] FATAL VIOLATION: Timestamp %d exists in BOTH 'up' and 'down'! (Diagonal jump hazard)",
								sc.name, ts.name, tUp)
						}
					}
					if intersectionCount > 0 {
						t.Fatalf("[%s][%s] Total intersecting flip points: %d (Expected strictly 0)",
							sc.name, ts.name, intersectionCount)
					}

					// 4. VERIFY COMPLETENESS: Tup ∪ Tdown == Tvalid (no valid points lost)
					dirMap := make(map[int64]float64)
					for _, d := range directions {
						dirMap[d.Time] = d.Value
					}

					for _, v := range values {
						dir := dirMap[v.Time]
						_, inUp := upTimestamps[v.Time]
						_, inDown := downTimestamps[v.Time]

						if dir > 0 {
							if !inUp {
								t.Errorf("[%s][%s] Bar %d has dir=%f > 0 but is MISSING from 'up'", sc.name, ts.name, v.Time, dir)
							}
							if inDown {
								t.Errorf("[%s][%s] Bar %d has dir=%f > 0 but is PRESENT in 'down'", sc.name, ts.name, v.Time, dir)
							}
						} else if dir < 0 {
							if !inDown {
								t.Errorf("[%s][%s] Bar %d has dir=%f < 0 but is MISSING from 'down'", sc.name, ts.name, v.Time, dir)
							}
							if inUp {
								t.Errorf("[%s][%s] Bar %d has dir=%f < 0 but is PRESENT in 'up'", sc.name, ts.name, v.Time, dir)
							}
						}
					}

					// 5. NUMERICAL PRECISION: 1e-6 check against raw value
					valMap := make(map[int64]float64)
					for _, v := range values {
						valMap[v.Time] = v.Value
					}

					for _, pt := range up {
						expected := valMap[pt.Time]
						diff := math.Abs(pt.Value - expected)
						if diff > 1e-6 {
							t.Errorf("[%s][%s] up drift at %d: got %f, expected %f (diff %e > 1e-6)",
								sc.name, ts.name, pt.Time, pt.Value, expected, diff)
						}
					}

					for _, pt := range down {
						expected := valMap[pt.Time]
						diff := math.Abs(pt.Value - expected)
						if diff > 1e-6 {
							t.Errorf("[%s][%s] down drift at %d: got %f, expected %f (diff %e > 1e-6)",
								sc.name, ts.name, pt.Time, pt.Value, expected, diff)
						}
					}
				})
			}
		})
	}
}

// TestAdversarial_SlopeIndicators_InflectionAnchorSharing stress-tests Tillson T3 and Hull MA
// under sharp oscillations and flat plateaus to verify exact anchor sharing at inflection bars.
func TestAdversarial_SlopeIndicators_InflectionAnchorSharing(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	scenarios := []struct {
		name    string
		candles []CandleData
	}{
		{"Oscillating_SineWave", generateOscillatingCandles(80)},
		{"Whipsaw_RapidSlopes", generateWhipsawCandles(80)},
		{"Plateau_ZeroSlope", generatePlateauCandles()},
		{"MicroPrice_Pennies", generateMicroPriceCandles(80)},
		{"MegaPrice_Millions", generateMegaPriceCandles(80)},
	}

	slopeIndicators := []struct {
		id     string
		name   string
		inputs map[string]interface{}
	}{
		{"wickra.t3", "Tillson T3", map[string]interface{}{"period": 8, "v": 0.7, "source": "close"}},
		{"wickra.hma", "Hull Moving Average", map[string]interface{}{"period": 8, "source": "close"}},
	}

	for _, sc := range scenarios {
		t.Run(sc.name, func(t *testing.T) {
			for _, si := range slopeIndicators {
				t.Run(si.name, func(t *testing.T) {
					results, err := engine.Evaluate(ctx, sc.candles, []EvalIndicatorInstance{
						{
							InstanceID:  "adv_" + si.id,
							IndicatorID: si.id,
							Inputs:      si.inputs,
						},
					})
					if err != nil {
						t.Fatalf("Evaluate failed for %s: %v", si.name, err)
					}
					if len(results) != 1 {
						t.Fatalf("Expected 1 result, got %d", len(results))
					}

					res := results[0]
					up := res.Plots["up"]
					down := res.Plots["down"]
					plot := res.Plots["plot"]

					if len(plot) == 0 {
						t.Fatalf("No underlying plot points for %s", si.name)
					}

					// 1. Strict monotonicity within up
					var prevUpTime int64 = 0
					for _, pt := range up {
						if prevUpTime != 0 && pt.Time <= prevUpTime {
							t.Fatalf("[%s][%s] Non-monotonic or duplicate timestamp in 'up': prev=%d, curr=%d",
								sc.name, si.name, prevUpTime, pt.Time)
						}
						prevUpTime = pt.Time
					}

					// 2. Strict monotonicity within down
					var prevDownTime int64 = 0
					for _, pt := range down {
						if prevDownTime != 0 && pt.Time <= prevDownTime {
							t.Fatalf("[%s][%s] Non-monotonic or duplicate timestamp in 'down': prev=%d, curr=%d",
								sc.name, si.name, prevDownTime, pt.Time)
						}
						prevDownTime = pt.Time
					}

					// Map points for fast lookup
					upMap := make(map[int64]float64)
					for _, p := range up {
						upMap[p.Time] = p.Value
					}
					downMap := make(map[int64]float64)
					for _, p := range down {
						downMap[p.Time] = p.Value
					}
					rawMap := make(map[int64]float64)
					for _, p := range plot {
						rawMap[p.Time] = p.Value
					}

					// 3. Numerical precision <= 1e-6 against raw singleVal
					for _, p := range up {
						rawVal, ok := rawMap[p.Time]
						if !ok {
							t.Errorf("[%s][%s] up point %d not in raw plot", sc.name, si.name, p.Time)
							continue
						}
						diff := math.Abs(p.Value - rawVal)
						if diff > 1e-6 {
							t.Errorf("[%s][%s] up drift at %d: got %f, raw %f (diff %e)", sc.name, si.name, p.Time, p.Value, rawVal, diff)
						}
					}
					for _, p := range down {
						rawVal, ok := rawMap[p.Time]
						if !ok {
							t.Errorf("[%s][%s] down point %d not in raw plot", sc.name, si.name, p.Time)
							continue
						}
						diff := math.Abs(p.Value - rawVal)
						if diff > 1e-6 {
							t.Errorf("[%s][%s] down drift at %d: got %f, raw %f (diff %e)", sc.name, si.name, p.Time, p.Value, rawVal, diff)
						}
					}

					// 4. Detect slope regime transitions and verify inflection sharing
					var currentRegime int = 0
					inflectionCount := 0

					for i := 1; i < len(plot); i++ {
						slope := plot[i].Value - plot[i-1].Value
						var stepRegime int
						if slope > 0 {
							stepRegime = 1
						} else if slope < 0 {
							stepRegime = -1
						} else {
							// slope == 0, maintains current
							stepRegime = currentRegime
							if stepRegime == 0 {
								stepRegime = 1
							}
						}

						if currentRegime != 0 && stepRegime != currentRegime {
							// Inflection detected at plot[i-1] (the pivot anchor)
							inflectionCount++
							inflectionTime := plot[i-1].Time

							valUp, hasUp := upMap[inflectionTime]
							valDown, hasDown := downMap[inflectionTime]

							if !hasUp {
								t.Errorf("[%s][%s] Inflection anchor at time %d MISSING from 'up'!", sc.name, si.name, inflectionTime)
							}
							if !hasDown {
								t.Errorf("[%s][%s] Inflection anchor at time %d MISSING from 'down'!", sc.name, si.name, inflectionTime)
							}
							if hasUp && hasDown {
								valDiff := math.Abs(valUp - valDown)
								if valDiff > 1e-6 {
									t.Errorf("[%s][%s] Inflection anchor value mismatch at %d: up=%f, down=%f (diff %e)",
										sc.name, si.name, inflectionTime, valUp, valDown, valDiff)
								}
							}
						}
						currentRegime = stepRegime
					}

					t.Logf("[%s][%s] Successfully verified %d inflection points with perfect anchor sharing",
						sc.name, si.name, inflectionCount)
				})
			}
		})
	}
}

// TestAdversarial_StreamingVsEvaluateConsistency verifies that the real-time StreamingSession
// produces identical values and regime classification to batch Evaluate.
func TestAdversarial_StreamingVsEvaluateConsistency(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	candles := generateTrendCandles(70)

	testConfigs := []EvalIndicatorInstance{
		{InstanceID: "st_live", IndicatorID: "wickra.super_trend", Inputs: map[string]interface{}{"atr_period": 10, "multiplier": 2.0}},
		{InstanceID: "ar_live", IndicatorID: "wickra.atr_ratchet", Inputs: map[string]interface{}{"atr_period": 10, "start_mult": 2.0, "increment": 0.5}},
		{InstanceID: "t3_live", IndicatorID: "wickra.t3", Inputs: map[string]interface{}{"period": 10, "v": 0.7, "source": "close"}},
		{InstanceID: "hma_live", IndicatorID: "wickra.hma", Inputs: map[string]interface{}{"period": 10, "source": "close"}},
	}

	// 1. Run batch Evaluate
	batchResults, err := engine.Evaluate(ctx, candles, testConfigs)
	if err != nil {
		t.Fatalf("Batch Evaluate failed: %v", err)
	}

	batchMap := make(map[string]map[string]map[int64]float64)
	for _, res := range batchResults {
		batchMap[res.InstanceID] = make(map[string]map[int64]float64)
		for plotId, pts := range res.Plots {
			batchMap[res.InstanceID][plotId] = make(map[int64]float64)
			for _, pt := range pts {
				batchMap[res.InstanceID][plotId][pt.Time] = pt.Value
			}
		}
	}

	// 2. Run streaming session candle by candle
	session, err := engine.CreateSession(ctx, "BTC/USD", "1m", testConfigs)
	if err != nil {
		t.Fatalf("CreateSession failed: %v", err)
	}
	defer session.Close(ctx)

	for _, c := range candles {
		livePlots, err := session.Update(ctx, c)
		if err != nil {
			t.Fatalf("StreamingSession.Update at time %d failed: %v", c.Time, err)
		}

		for instanceId, plotVals := range livePlots {
			bInst, ok := batchMap[instanceId]
			if !ok {
				t.Fatalf("Instance %s not found in batch results", instanceId)
			}

			for plotId, liveVal := range plotVals {
				bPlot, ok := bInst[plotId]
				if !ok {
					continue
				}
				batchVal, hasBatch := bPlot[c.Time]
				if !hasBatch {
					// In slope indicators, the anchor point from the previous bar is appended in batch mode
					// but live mode emits current bar only. Current bar must match!
					continue
				}
				diff := math.Abs(liveVal - batchVal)
				if diff > 1e-6 {
					t.Errorf("[%s.%s] Streaming vs Batch mismatch at time %d: live=%f, batch=%f (diff %e)",
						instanceId, plotId, c.Time, liveVal, batchVal, diff)
				}
			}
		}
	}
}

// TestAdversarial_RandomFuzz_NoNaNsNoCrashes fuzzes engine with random candle parameters
// to ensure zero crashes, zero NaNs in JSON output, and strict precision.
func TestAdversarial_RandomFuzz_NoNaNsNoCrashes(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	r := rand.New(rand.NewSource(42))

	const iterations = 10
	allIndicators := []string{
		"wickra.super_trend",
		"wickra.atr_ratchet",
		"wickra.elder_safe_zone",
		"wickra.kase_dev_stop",
		"wickra.modified_ma_stop",
		"wickra.nrtr",
		"wickra.t3",
		"wickra.hma",
	}

	for it := 0; it < iterations; it++ {
		numCandles := 40 + r.Intn(60)
		candles := make([]CandleData, numCandles)
		startTime := int64(1700000000)
		currPrice := 50.0 + r.Float64()*500.0

		for c := 0; c < numCandles; c++ {
			delta := (r.Float64() - 0.48) * 10.0
			currPrice = math.Max(0.01, currPrice+delta)
			candles[c] = CandleData{
				Time:   startTime + int64(c*60),
				Open:   currPrice,
				High:   currPrice + r.Float64()*2.0,
				Low:    math.Max(0.001, currPrice-r.Float64()*2.0),
				Close:  currPrice + (r.Float64()-0.5)*1.5,
				Volume: 100.0 + r.Float64()*10000.0,
			}
		}

		var cfgs []EvalIndicatorInstance
		for idx, ind := range allIndicators {
			cfgs = append(cfgs, EvalIndicatorInstance{
				InstanceID:  fmt.Sprintf("fuzz_%d_%d", it, idx),
				IndicatorID: ind,
				Inputs:      map[string]interface{}{"period": 5 + r.Intn(10)},
			})
		}

		results, err := engine.Evaluate(ctx, candles, cfgs)
		if err != nil {
			t.Fatalf("Fuzz iteration %d Evaluate failed: %v", it, err)
		}

		for _, res := range results {
			// Verify JSON marshaling never produces illegal NaN
			data, err := json.Marshal(res)
			if err != nil {
				t.Fatalf("json.Marshal failed in fuzz %d: %v", it, err)
			}
			jsonText := string(data)
			if jsonText == "" {
				t.Fatalf("Empty JSON output in fuzz %d", it)
			}

			// Validate all points in up and down are finite
			for _, pt := range res.Plots["up"] {
				if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
					t.Fatalf("[%s] NaN/Inf in 'up' plot point: %+v", res.InstanceID, pt)
				}
			}
			for _, pt := range res.Plots["down"] {
				if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
					t.Fatalf("[%s] NaN/Inf in 'down' plot point: %+v", res.InstanceID, pt)
				}
			}
		}
	}
}


// TestAdversarial_UltraLongSeries_10kBars executes a 10,000 bar continuous simulation
// to measure maximum numerical drift and verify that transition invariants hold indefinitely.
func TestAdversarial_UltraLongSeries_10kBars(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	const n = 10000
	candles := make([]CandleData, n)
	startTime := int64(1700000000)
	price := 1000.0

	for i := 0; i < n; i++ {
		// Multi-frequency wave to produce organic, realistic trend cycles and transitions
		wave := math.Sin(float64(i)*2*math.Pi/50.0)*15.0 +
			math.Sin(float64(i)*2*math.Pi/200.0)*35.0 +
			math.Cos(float64(i)*2*math.Pi/13.0)*5.0
		p := price + wave + float64(i)*0.02
		candles[i] = CandleData{
			Time:   startTime + int64(i*60),
			Open:   p - 1.0,
			High:   p + 3.0,
			Low:    p - 3.0,
			Close:  p,
			Volume: 1000.0 + float64(i%50)*10.0,
		}
	}

	allConfigs := []EvalIndicatorInstance{
		{InstanceID: "st_10k", IndicatorID: "wickra.super_trend", Inputs: map[string]interface{}{"atr_period": 10, "multiplier": 2.0}},
		{InstanceID: "ar_10k", IndicatorID: "wickra.atr_ratchet", Inputs: map[string]interface{}{"atr_period": 10, "start_mult": 2.0, "increment": 0.5}},
		{InstanceID: "esz_10k", IndicatorID: "wickra.elder_safe_zone", Inputs: map[string]interface{}{"period": 10, "coeff": 1.5}},
		{InstanceID: "kds_10k", IndicatorID: "wickra.kase_dev_stop", Inputs: map[string]interface{}{"period": 10, "dev": 1.0}},
		{InstanceID: "mms_10k", IndicatorID: "wickra.modified_ma_stop", Inputs: map[string]interface{}{"period": 10}},
		{InstanceID: "nrtr_10k", IndicatorID: "wickra.nrtr", Inputs: map[string]interface{}{"pct": 2.0}},
		{InstanceID: "t3_10k", IndicatorID: "wickra.t3", Inputs: map[string]interface{}{"period": 10, "v": 0.7, "source": "close"}},
		{InstanceID: "hma_10k", IndicatorID: "wickra.hma", Inputs: map[string]interface{}{"period": 10, "source": "close"}},
	}

	results, err := engine.Evaluate(ctx, candles, allConfigs)
	if err != nil {
		t.Fatalf("10k bar evaluation failed: %v", err)
	}
	if len(results) != len(allConfigs) {
		t.Fatalf("Expected %d results, got %d", len(allConfigs), len(results))
	}

	var maxObservedDrift float64 = 0.0

	for _, res := range results {
		up := res.Plots["up"]
		down := res.Plots["down"]

		isTrailing := isDirectionalStopIndicator(res.IndicatorID)
		isSlope := isSlopeIndicator(res.IndicatorID)

		// Reference points
		refMap := make(map[int64]float64)
		if isTrailing {
			for _, p := range res.Plots["value"] {
				refMap[p.Time] = p.Value
			}
		} else if isSlope {
			for _, p := range res.Plots["plot"] {
				refMap[p.Time] = p.Value
			}
		}

		// 1. Numerical drift across all 10k points
		for _, p := range up {
			ref, ok := refMap[p.Time]
			if ok {
				d := math.Abs(p.Value - ref)
				if d > maxObservedDrift {
					maxObservedDrift = d
				}
				if d > 1e-6 {
					t.Fatalf("[%s] Drift violation in up: got %f, expected %f (diff %e)", res.IndicatorID, p.Value, ref, d)
				}
			}
		}
		for _, p := range down {
			ref, ok := refMap[p.Time]
			if ok {
				d := math.Abs(p.Value - ref)
				if d > maxObservedDrift {
					maxObservedDrift = d
				}
				if d > 1e-6 {
					t.Fatalf("[%s] Drift violation in down: got %f, expected %f (diff %e)", res.IndicatorID, p.Value, ref, d)
				}
			}
		}

		// 2. Trailing stop disjointness
		if isTrailing {
			upTimes := make(map[int64]bool, len(up))
			for _, p := range up {
				upTimes[p.Time] = true
			}
			for _, p := range down {
				if upTimes[p.Time] {
					t.Fatalf("[%s] FATAL: Disjointness violated at time %d in 10k bars!", res.IndicatorID, p.Time)
				}
			}
			t.Logf("[%s] 10k bars verified: up points = %d, down points = %d, disjoint = 100%%", res.IndicatorID, len(up), len(down))
		}

		// 3. Slope inflection anchor sharing
		if isSlope {
			plot := res.Plots["plot"]
			upMap := make(map[int64]float64, len(up))
			for _, p := range up {
				upMap[p.Time] = p.Value
			}
			downMap := make(map[int64]float64, len(down))
			for _, p := range down {
				downMap[p.Time] = p.Value
			}

			inflections := 0
			var currentRegime int = 0
			for i := 1; i < len(plot); i++ {
				slope := plot[i].Value - plot[i-1].Value
				var stepRegime int
				if slope > 0 {
					stepRegime = 1
				} else if slope < 0 {
					stepRegime = -1
				} else {
					stepRegime = currentRegime
					if stepRegime == 0 {
						stepRegime = 1
					}
				}

				if currentRegime != 0 && stepRegime != currentRegime {
					inflections++
					anchorTime := plot[i-1].Time
					vu, hasU := upMap[anchorTime]
					vd, hasD := downMap[anchorTime]
					if !hasU || !hasD {
						t.Fatalf("[%s] Inflection anchor at time %d missing in up (%v) or down (%v)", res.IndicatorID, anchorTime, hasU, hasD)
					}
					if math.Abs(vu-vd) > 1e-6 {
						t.Fatalf("[%s] Anchor mismatch at %d: up=%f, down=%f", res.IndicatorID, anchorTime, vu, vd)
					}
				}
				currentRegime = stepRegime
			}
			t.Logf("[%s] 10k bars verified: %d inflections verified with 100%% seamless anchor sharing", res.IndicatorID, inflections)
		}
	}

	t.Logf("Maximum observed numerical drift across 10,000 bars and all 8 indicators: %e (Strictly <= 1e-6)", maxObservedDrift)
}

// TestAdversarial_ExtremeInputParameters tests indicators with extreme parameter values.
func TestAdversarial_ExtremeInputParameters(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	candles := generateTrendCandles(60)

	extremeConfigs := []EvalIndicatorInstance{
		{InstanceID: "st_min", IndicatorID: "wickra.super_trend", Inputs: map[string]interface{}{"atr_period": 1, "multiplier": 0.1}},
		{InstanceID: "st_max", IndicatorID: "wickra.super_trend", Inputs: map[string]interface{}{"atr_period": 50, "multiplier": 10.0}},
		{InstanceID: "t3_v0", IndicatorID: "wickra.t3", Inputs: map[string]interface{}{"period": 3, "v": 0.0, "source": "close"}},
		{InstanceID: "t3_v1", IndicatorID: "wickra.t3", Inputs: map[string]interface{}{"period": 3, "v": 1.0, "source": "close"}},
		{InstanceID: "hma_min", IndicatorID: "wickra.hma", Inputs: map[string]interface{}{"period": 2, "source": "close"}},
		{InstanceID: "hma_large", IndicatorID: "wickra.hma", Inputs: map[string]interface{}{"period": 40, "source": "close"}},
		{InstanceID: "nrtr_min", IndicatorID: "wickra.nrtr", Inputs: map[string]interface{}{"pct": 0.01}},
		{InstanceID: "nrtr_max", IndicatorID: "wickra.nrtr", Inputs: map[string]interface{}{"pct": 50.0}},
		{InstanceID: "kds_extreme", IndicatorID: "wickra.kase_dev_stop", Inputs: map[string]interface{}{"period": 3, "dev": 5.0}},
		{InstanceID: "ar_extreme", IndicatorID: "wickra.atr_ratchet", Inputs: map[string]interface{}{"atr_period": 3, "start_mult": 0.1, "increment": 0.01}},
	}

	results, err := engine.Evaluate(ctx, candles, extremeConfigs)
	if err != nil {
		t.Fatalf("Evaluate on extreme parameters failed: %v", err)
	}

	for _, res := range results {
		// Verify no NaNs or Infs in plots
		for plotId, pts := range res.Plots {
			for _, pt := range pts {
				if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
					t.Fatalf("[%s.%s] NaN or Inf emitted on extreme inputs: %+v", res.InstanceID, plotId, pt)
				}
			}
		}

		// Trailing stops: verify disjointness
		if isDirectionalStopIndicator(res.IndicatorID) {
			upTimes := make(map[int64]bool)
			for _, p := range res.Plots["up"] {
				upTimes[p.Time] = true
			}
			for _, p := range res.Plots["down"] {
				if upTimes[p.Time] {
					t.Fatalf("[%s] Disjointness failed on extreme input at %d", res.InstanceID, p.Time)
				}
			}
		}
	}
}

// TestAdversarial_IrregularTimestamps tests candles with large weekend gaps and irregular intervals.
func TestAdversarial_IrregularTimestamps(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	// Create 50 candles with non-uniform time jumps (simulating weekends, market halts, holidays)
	candles := make([]CandleData, 50)
	var currTime int64 = 1700000000
	var price float64 = 100.0

	for i := 0; i < 50; i++ {
		step := 1.0
		if i > 25 {
			step = -1.5
		}
		price += step

		var jump int64 = 60 // 1 minute
		if i == 15 {
			jump = 172800 // 48-hour weekend gap
		} else if i == 30 {
			jump = 3600 // 1-hour maintenance halt
		}
		currTime += jump

		candles[i] = CandleData{
			Time:   currTime,
			Open:   price - 0.5,
			High:   price + 1.0,
			Low:    price - 1.0,
			Close:  price,
			Volume: 1000.0,
		}
	}

	cfgs := []EvalIndicatorInstance{
		{InstanceID: "st_gap", IndicatorID: "wickra.super_trend", Inputs: map[string]interface{}{"atr_period": 7, "multiplier": 2.0}},
		{InstanceID: "t3_gap", IndicatorID: "wickra.t3", Inputs: map[string]interface{}{"period": 7, "v": 0.7, "source": "close"}},
	}

	results, err := engine.Evaluate(ctx, candles, cfgs)
	if err != nil {
		t.Fatalf("Evaluate on irregular timestamps failed: %v", err)
	}

	for _, res := range results {
		// Verify timestamps in up and down match exactly candles' timestamps
		candleTimeSet := make(map[int64]bool)
		for _, c := range candles {
			candleTimeSet[c.Time] = true
		}

		for _, pt := range res.Plots["up"] {
			if !candleTimeSet[pt.Time] {
				t.Fatalf("[%s] Point time %d not in candle times", res.InstanceID, pt.Time)
			}
		}
		for _, pt := range res.Plots["down"] {
			if !candleTimeSet[pt.Time] {
				t.Fatalf("[%s] Point time %d not in candle times", res.InstanceID, pt.Time)
			}
		}
	}
}
