package wickra

import (
	"context"
	"math"
	"testing"
	"time"
)

func TestVWAP_SessionResetAndBands(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	const tol = 1e-6

	// Day 1: 2026-01-01 (epoch ~1767225600)
	// Day 2: 2026-01-02 (epoch ~1767312000)
	t1 := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC).Unix()
	t2 := time.Date(2026, 1, 1, 11, 0, 0, 0, time.UTC).Unix()
	t3 := time.Date(2026, 1, 2, 9, 30, 0, 0, time.UTC).Unix() // Day 2 session start (should reset!)
	t4 := time.Date(2026, 1, 2, 10, 0, 0, 0, time.UTC).Unix()

	candles := []CandleData{
		// Day 1
		// Bar 0: H=12, L=9, C=11 (HLC3 = 32/3 = 10.666667), V=1000
		{Time: t1, Open: 10, High: 12, Low: 9, Close: 11, Volume: 1000},
		// Bar 1: H=13, L=10, C=12 (HLC3 = 35/3 = 11.666667), V=1500
		{Time: t2, Open: 11, High: 13, Low: 10, Close: 12, Volume: 1500},

		// Day 2 (Session Reset!)
		// Bar 2: H=22, L=18, C=20 (HLC3 = 20.0), V=2000
		{Time: t3, Open: 19, High: 22, Low: 18, Close: 20, Volume: 2000},
		// Bar 3: H=25, L=21, C=23 (HLC3 = 23.0), V=3000
		{Time: t4, Open: 20, High: 25, Low: 21, Close: 23, Volume: 3000},
	}

	configs := []EvalIndicatorInstance{
		{
			InstanceID:  "vwap_test",
			IndicatorID: "wickra.vwap",
			Inputs: map[string]interface{}{
				"anchor_period":      "session",
				"source":             "hlc3",
				"bands_multiplier_1": 1.0,
				"bands_multiplier_2": 2.0,
			},
		},
	}

	results, err := engine.Evaluate(ctx, candles, configs)
	if err != nil {
		t.Fatalf("Evaluate failed: %v", err)
	}

	if len(results) != 1 {
		t.Fatalf("Expected 1 result, got %d", len(results))
	}

	res := results[0]
	vwapPts := res.Plots["plot"]
	u1Pts := res.Plots["upper_1"]
	l1Pts := res.Plots["lower_1"]
	u2Pts := res.Plots["upper_2"]
	l2Pts := res.Plots["lower_2"]

	if len(vwapPts) != 4 {
		t.Fatalf("Expected 4 points, got %d", len(vwapPts))
	}

	// Bar 0:
	// P0 = 32/3. V0 = 1000.
	// VWAP = 32/3 = 10.666666666666666.
	// sigma = 0.
	expVWAP0 := 32.0 / 3.0
	if math.Abs(vwapPts[0].Value-expVWAP0) > tol {
		t.Errorf("Bar 0 VWAP: expected %f, got %f", expVWAP0, vwapPts[0].Value)
	}
	if math.Abs(u1Pts[0].Value-expVWAP0) > tol || math.Abs(l1Pts[0].Value-expVWAP0) > tol {
		t.Errorf("Bar 0 bands should equal VWAP (sigma=0), got u1=%f, l1=%f", u1Pts[0].Value, l1Pts[0].Value)
	}

	// Bar 1:
	// P1 = 35/3. V1 = 1500.
	// CumV = 2500. CumPV = 1000*(32/3) + 1500*(35/3) = 84500/3.
	// VWAP = 84500 / 7500 = 169/15 = 11.266666666666667.
	// CumP2V = 1000*(32/3)^2 + 1500*(35/3)^2 = 1000*(1024/9) + 1500*(1225/9) = 2861500/9.
	// Var = (2861500/9)/2500 - (169/15)^2 = 2861500/22500 - 28561/225 = (28615 - 28561)/225 = 54/225 = 0.24.
	// sigma = sqrt(0.24) = 0.4898979485566356.
	expVWAP1 := 169.0 / 15.0
	expSigma1 := math.Sqrt(0.24)
	if math.Abs(vwapPts[1].Value-expVWAP1) > tol {
		t.Errorf("Bar 1 VWAP: expected %f, got %f", expVWAP1, vwapPts[1].Value)
	}
	if math.Abs(u1Pts[1].Value-(expVWAP1+expSigma1)) > tol {
		t.Errorf("Bar 1 Upper #1: expected %f, got %f", expVWAP1+expSigma1, u1Pts[1].Value)
	}
	if math.Abs(l1Pts[1].Value-(expVWAP1-expSigma1)) > tol {
		t.Errorf("Bar 1 Lower #1: expected %f, got %f", expVWAP1-expSigma1, l1Pts[1].Value)
	}
	if math.Abs(u2Pts[1].Value-(expVWAP1+2*expSigma1)) > tol {
		t.Errorf("Bar 1 Upper #2: expected %f, got %f", expVWAP1+2*expSigma1, u2Pts[1].Value)
	}
	if math.Abs(l2Pts[1].Value-(expVWAP1-2*expSigma1)) > tol {
		t.Errorf("Bar 1 Lower #2: expected %f, got %f", expVWAP1-2*expSigma1, l2Pts[1].Value)
	}

	// Bar 2: DAY 2 SESSION RESET!
	// P2 = 20.0. V2 = 2000.
	// Reset: Day 1 data discarded!
	// VWAP = 20.0.
	// sigma = 0.
	expVWAP2 := 20.0
	if math.Abs(vwapPts[2].Value-expVWAP2) > tol {
		t.Errorf("Bar 2 (Day 2 reset) VWAP: expected %f, got %f", expVWAP2, vwapPts[2].Value)
	}
	if math.Abs(u1Pts[2].Value-expVWAP2) > tol || math.Abs(l1Pts[2].Value-expVWAP2) > tol {
		t.Errorf("Bar 2 bands should equal VWAP (sigma=0), got u1=%f, l1=%f", u1Pts[2].Value, l1Pts[2].Value)
	}

	// Bar 3:
	// P3 = 23.0. V3 = 3000.
	// CumV = 2000 + 3000 = 5000.
	// CumPV = 2000*20 + 3000*23 = 40000 + 69000 = 109000.
	// VWAP = 109000 / 5000 = 21.8.
	// CumP2V = 2000*400 + 3000*529 = 800000 + 1587000 = 2387000.
	// Var = 2387000 / 5000 - 21.8^2 = 477.4 - 475.24 = 2.16.
	// sigma = sqrt(2.16) = 1.469693845669907.
	expVWAP3 := 21.8
	expSigma3 := math.Sqrt(2.16)
	if math.Abs(vwapPts[3].Value-expVWAP3) > tol {
		t.Errorf("Bar 3 VWAP: expected %f, got %f", expVWAP3, vwapPts[3].Value)
	}
	if math.Abs(u1Pts[3].Value-(expVWAP3+expSigma3)) > tol {
		t.Errorf("Bar 3 Upper #1: expected %f, got %f", expVWAP3+expSigma3, u1Pts[3].Value)
	}
	if math.Abs(l1Pts[3].Value-(expVWAP3-expSigma3)) > tol {
		t.Errorf("Bar 3 Lower #1: expected %f, got %f", expVWAP3-expSigma3, l1Pts[3].Value)
	}
}

func TestVWAP_WeeklyAndMonthlyReset(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	// Week 1: 2026-01-05 (Monday)
	// Week 2: 2026-01-12 (Monday next week)
	tW1 := time.Date(2026, 1, 5, 10, 0, 0, 0, time.UTC).Unix()
	tW2 := time.Date(2026, 1, 12, 10, 0, 0, 0, time.UTC).Unix()

	candles := []CandleData{
		{Time: tW1, Open: 100, High: 105, Low: 95, Close: 100, Volume: 1000},
		{Time: tW2, Open: 200, High: 205, Low: 195, Close: 200, Volume: 1000},
	}

	configs := []EvalIndicatorInstance{
		{
			InstanceID:  "vwap_week",
			IndicatorID: "wickra.vwap",
			Inputs: map[string]interface{}{
				"anchor_period": "week",
			},
		},
	}

	results, err := engine.Evaluate(ctx, candles, configs)
	if err != nil {
		t.Fatalf("Evaluate failed: %v", err)
	}

	vwapPts := results[0].Plots["plot"]
	if len(vwapPts) != 2 {
		t.Fatalf("Expected 2 points, got %d", len(vwapPts))
	}

	if math.Abs(vwapPts[0].Value-100.0) > 1e-6 {
		t.Errorf("Week 1 VWAP: expected 100, got %f", vwapPts[0].Value)
	}
	// Week 2 should reset and be 200, not (100+200)/2 = 150
	if math.Abs(vwapPts[1].Value-200.0) > 1e-6 {
		t.Errorf("Week 2 VWAP (after weekly reset): expected 200, got %f", vwapPts[1].Value)
	}
}

func TestVWAP_BackwardCompatAliasing(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	candles := []CandleData{
		{Time: 1700000000, Open: 50, High: 52, Low: 48, Close: 50, Volume: 1000},
	}

	// Request old standalone ID "wickra.vwap_std_dev_bands"
	configs := []EvalIndicatorInstance{
		{
			InstanceID:  "old_id_test",
			IndicatorID: "wickra.vwap_std_dev_bands",
			Inputs:      map[string]interface{}{},
		},
	}

	results, err := engine.Evaluate(ctx, candles, configs)
	if err != nil {
		t.Fatalf("Evaluate with old ID failed: %v", err)
	}

	if len(results) != 1 {
		t.Fatalf("Expected 1 result for aliased ID, got %d", len(results))
	}

	res := results[0]
	if len(res.Plots["plot"]) == 0 {
		t.Errorf("Expected plot to be populated for aliased ID")
	}
}

func TestVWAP_PercentageBands(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	candles := []CandleData{
		{Time: 1700000000, Open: 100, High: 100, Low: 100, Close: 100, Volume: 1000},
	}

	configs := []EvalIndicatorInstance{
		{
			InstanceID:  "vwap_pct",
			IndicatorID: "wickra.vwap",
			Inputs: map[string]interface{}{
				"bands_calculation_mode": "percentage",
				"bands_multiplier_1":     2.0, // 2%
				"bands_multiplier_2":     5.0, // 5%
			},
		},
	}

	results, err := engine.Evaluate(ctx, candles, configs)
	if err != nil {
		t.Fatalf("Evaluate failed: %v", err)
	}

	res := results[0]
	vwap := res.Plots["plot"][0].Value
	u1 := res.Plots["upper_1"][0].Value
	l1 := res.Plots["lower_1"][0].Value
	u2 := res.Plots["upper_2"][0].Value
	l2 := res.Plots["lower_2"][0].Value

	if math.Abs(vwap-100.0) > 1e-6 {
		t.Errorf("Expected VWAP 100, got %f", vwap)
	}
	// 2% bands: 100 * 1.02 = 102, 100 * 0.98 = 98
	if math.Abs(u1-102.0) > 1e-6 {
		t.Errorf("Expected Upper #1 (2%%) 102.0, got %f", u1)
	}
	if math.Abs(l1-98.0) > 1e-6 {
		t.Errorf("Expected Lower #1 (2%%) 98.0, got %f", l1)
	}
	// 5% bands: 100 * 1.05 = 105, 100 * 0.95 = 95
	if math.Abs(u2-105.0) > 1e-6 {
		t.Errorf("Expected Upper #2 (5%%) 105.0, got %f", u2)
	}
	if math.Abs(l2-95.0) > 1e-6 {
		t.Errorf("Expected Lower #2 (5%%) 95.0, got %f", l2)
	}
}

func TestVWAP_DecadeAndCenturyReset(t *testing.T) {
	calcDecade := NewVWAPCalculator(map[string]any{"anchor_period": "decade"})
	d1 := time.Date(2019, 12, 31, 23, 59, 0, 0, time.UTC)
	d2 := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	if !isNewVWAPPeriod(calcDecade.AnchorPeriod, d1, d2) {
		t.Errorf("Expected decade reset between 2019 and 2020")
	}
	d3 := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	if isNewVWAPPeriod(calcDecade.AnchorPeriod, d2, d3) {
		t.Errorf("Expected NO decade reset within 2020s")
	}

	calcCentury := NewVWAPCalculator(map[string]any{"anchor_period": "century"})
	c1 := time.Date(1999, 12, 31, 23, 59, 0, 0, time.UTC)
	c2 := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
	if !isNewVWAPPeriod(calcCentury.AnchorPeriod, c1, c2) {
		t.Errorf("Expected century reset between 1999 and 2000")
	}
}
