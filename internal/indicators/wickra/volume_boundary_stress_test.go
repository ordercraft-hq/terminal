package wickra

import (
	"context"
	"math"
	"testing"
)

// TestVolumeBoundaryStress_ADL_ZeroDivision tests ADL behavior when High == Low (flat candle).
// Formula: MFM = ((C - L) - (H - C)) / (H - L).
// When H == L, denominator is 0. Indicator must handle this cleanly without NaN or Inf.
func TestVolumeBoundaryStress_ADL_ZeroDivision(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	const tol = 1e-6

	// Bar 0: Normal candle (H=12, L=9, C=11, V=1000)
	//   MFM = ((11-9)-(12-11))/(12-9) = (2-1)/3 = 1/3
	//   MFV = 1000 / 3
	//   ADL_0 = 1000 / 3 = 333.333333
	// Bar 1: Flat candle (H=10, L=10, C=10, V=1500) -> High == Low! Zero division test.
	//   MFM should be 0 (or handled gracefully), MFV = 0
	//   ADL_1 should equal ADL_0 = 1000 / 3
	// Bar 2: Another flat candle with zero volume (H=10, L=10, C=10, V=0)
	//   ADL_2 should equal ADL_1 = 1000 / 3
	// Bar 3: Normal candle (H=14, L=11, C=11, V=2000)
	//   MFM = ((11-11)-(14-11))/(14-11) = -3/3 = -1
	//   MFV = -2000
	//   ADL_3 = 1000/3 - 2000 = -5000/3 = -1666.666667
	candles := []CandleData{
		{Time: 1700000000, Open: 10.0, High: 12.0, Low: 9.0, Close: 11.0, Volume: 1000.0},
		{Time: 1700000060, Open: 10.0, High: 10.0, Low: 10.0, Close: 10.0, Volume: 1500.0},
		{Time: 1700000120, Open: 10.0, High: 10.0, Low: 10.0, Close: 10.0, Volume: 0.0},
		{Time: 1700000180, Open: 12.0, High: 14.0, Low: 11.0, Close: 11.0, Volume: 2000.0},
	}

	configs := []EvalIndicatorInstance{
		{InstanceID: "adl_stress", IndicatorID: "wickra.adl", Inputs: map[string]interface{}{}},
	}

	results, err := engine.Evaluate(ctx, candles, configs)
	if err != nil {
		t.Fatalf("ADL Evaluate error on flat candles: %v", err)
	}

	pts := results[0].Plots["plot"]
	t.Logf("ADL Output points: %d (candles: %d)", len(pts), len(candles))
	for i, pt := range pts {
		t.Logf("Point %d: Time=%d, Value=%f", i, pt.Time, pt.Value)
		if math.IsNaN(pt.Value) {
			t.Errorf("Point %d at Time %d is NaN", i, pt.Time)
		}
		if math.IsInf(pt.Value, 0) {
			t.Errorf("Point %d at Time %d is Inf", i, pt.Time)
		}
	}

	// Bar 0 verification
	if len(pts) > 0 {
		exp0 := 1000.0 / 3.0
		if math.Abs(pts[0].Value-exp0) > tol {
			t.Errorf("Bar 0: expected %f, got %f", exp0, pts[0].Value)
		}
	}

	// Bar 1 verification: Flat candle should not blow up or drift
	if len(pts) > 1 {
		exp1 := 1000.0 / 3.0
		if math.Abs(pts[1].Value-exp1) > tol {
			t.Errorf("Bar 1 (flat candle H==L): expected unchanged ADL %f, got %f", exp1, pts[1].Value)
		}
	}

	// Bar 2 verification: Flat candle with zero volume
	if len(pts) > 2 {
		exp2 := 1000.0 / 3.0
		if math.Abs(pts[2].Value-exp2) > tol {
			t.Errorf("Bar 2 (flat candle H==L, V=0): expected unchanged ADL %f, got %f", exp2, pts[2].Value)
		}
	}

	// Bar 3 verification: Resume normal calculation
	if len(pts) > 3 {
		exp3 := (1000.0 / 3.0) - 2000.0
		if math.Abs(pts[3].Value-exp3) > tol {
			t.Errorf("Bar 3: expected %f, got %f", exp3, pts[3].Value)
		}
	}
}

// TestVolumeBoundaryStress_VWAP_ZeroVolume tests VWAP behavior with:
// 1. Initial bars with 0 volume (cumulative volume = 0).
// 2. Mid-stream bars with 0 volume.
// 3. All bars with 0 volume.
func TestVolumeBoundaryStress_VWAP_ZeroVolume(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	const tol = 1e-6

	t.Run("InitialZeroVolumeBars", func(t *testing.T) {
		// Bar 0: V = 0
		// Bar 1: V = 0
		// Bar 2: V = 1000 (H=12, L=9, C=11 -> TP = 32/3 = 10.666667)
		// Bar 3: V = 0    (H=13, L=10, C=12 -> mid-stream zero volume)
		candles := []CandleData{
			{Time: 1700000000, Open: 10.0, High: 11.0, Low: 9.0, Close: 10.0, Volume: 0.0},
			{Time: 1700000060, Open: 10.0, High: 11.0, Low: 9.0, Close: 10.0, Volume: 0.0},
			{Time: 1700000120, Open: 10.0, High: 12.0, Low: 9.0, Close: 11.0, Volume: 1000.0},
			{Time: 1700000180, Open: 11.0, High: 13.0, Low: 10.0, Close: 12.0, Volume: 0.0},
		}

		configs := []EvalIndicatorInstance{
			{InstanceID: "vwap_zero_vol", IndicatorID: "wickra.vwap", Inputs: map[string]interface{}{}},
		}

		results, err := engine.Evaluate(ctx, candles, configs)
		if err != nil {
			t.Fatalf("VWAP Evaluate error: %v", err)
		}

		pts := results[0].Plots["plot"]
		t.Logf("InitialZeroVolumeBars points count: %d", len(pts))
		for i, pt := range pts {
			t.Logf("Point %d: Time=%d, Value=%f", i, pt.Time, pt.Value)
			if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
				t.Errorf("Invalid point value %f at time %d", pt.Value, pt.Time)
			}
		}

		// When volume arrives at Bar 2:
		var bar2Pt *SeriesPoint
		var bar3Pt *SeriesPoint
		for i := range pts {
			if pts[i].Time == 1700000120 {
				bar2Pt = &pts[i]
			}
			if pts[i].Time == 1700000180 {
				bar3Pt = &pts[i]
			}
		}

		if bar2Pt != nil {
			exp2 := 32.0 / 3.0
			if math.Abs(bar2Pt.Value-exp2) > tol {
				t.Errorf("Bar 2 VWAP expected %f, got %f", exp2, bar2Pt.Value)
			}
		}

		// At Bar 3, Volume=0, so cumulative TPV is unchanged and cumulative Vol is unchanged (1000).
		// Therefore VWAP must remain identical to Bar 2!
		if bar3Pt != nil && bar2Pt != nil {
			if math.Abs(bar3Pt.Value-bar2Pt.Value) > tol {
				t.Errorf("Bar 3 (V=0) VWAP changed! Expected %f, got %f", bar2Pt.Value, bar3Pt.Value)
			}
		}
	})

	t.Run("AllZeroVolumeBars", func(t *testing.T) {
		candles := []CandleData{
			{Time: 1700000000, Open: 10.0, High: 11.0, Low: 9.0, Close: 10.0, Volume: 0.0},
			{Time: 1700000060, Open: 10.0, High: 11.0, Low: 9.0, Close: 10.0, Volume: 0.0},
			{Time: 1700000120, Open: 10.0, High: 11.0, Low: 9.0, Close: 10.0, Volume: 0.0},
		}

		configs := []EvalIndicatorInstance{
			{InstanceID: "vwap_all_zero", IndicatorID: "wickra.vwap", Inputs: map[string]interface{}{}},
		}

		results, err := engine.Evaluate(ctx, candles, configs)
		if err != nil {
			t.Fatalf("VWAP with all zero volume produced error: %v", err)
		}

		pts := results[0].Plots["plot"]
		t.Logf("AllZeroVolumeBars returned %d points", len(pts))
		for _, pt := range pts {
			if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
				t.Errorf("AllZeroVolumeBars produced NaN/Inf: %f", pt.Value)
			}
		}
	})
}

// TestVolumeBoundaryStress_OBV_FlatClose tests OBV behavior when Close[i] == Close[i-1].
// In standard OBV, when close is unchanged, OBV maintains its prior value without drift.
func TestVolumeBoundaryStress_OBV_FlatClose(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	const tol = 1e-6

	// Bar 0: Close 100.0, Vol 1000 -> OBV = 0
	// Bar 1: Close 105.0, Vol 500  -> Close > Close[0] => OBV = 0 + 500 = 500
	// Bar 2: Close 105.0, Vol 2000 -> Close == Close[1] => OBV should stay 500!
	// Bar 3: Close 105.0, Vol 3500 -> Close == Close[2] => OBV should stay 500!
	// Bar 4: Close 102.0, Vol 800  -> Close < Close[3] => OBV = 500 - 800 = -300
	// Bar 5: Close 102.0, Vol 1200 -> Close == Close[4] => OBV should stay -300!
	candles := []CandleData{
		{Time: 1700000000, Open: 100.0, High: 101.0, Low: 99.0, Close: 100.0, Volume: 1000.0},
		{Time: 1700000060, Open: 100.0, High: 106.0, Low: 100.0, Close: 105.0, Volume: 500.0},
		{Time: 1700000120, Open: 105.0, High: 107.0, Low: 104.0, Close: 105.0, Volume: 2000.0},
		{Time: 1700000180, Open: 105.0, High: 108.0, Low: 103.0, Close: 105.0, Volume: 3500.0},
		{Time: 1700000240, Open: 105.0, High: 105.0, Low: 101.0, Close: 102.0, Volume: 800.0},
		{Time: 1700000300, Open: 102.0, High: 103.0, Low: 101.0, Close: 102.0, Volume: 1200.0},
	}

	configs := []EvalIndicatorInstance{
		{InstanceID: "obv_flat", IndicatorID: "wickra.obv", Inputs: map[string]interface{}{}},
	}

	results, err := engine.Evaluate(ctx, candles, configs)
	if err != nil {
		t.Fatalf("OBV Evaluate error: %v", err)
	}

	pts := results[0].Plots["plot"]
	if len(pts) != len(candles) {
		t.Fatalf("Expected %d points, got %d", len(candles), len(pts))
	}

	expected := []float64{0.0, 500.0, 500.0, 500.0, -300.0, -300.0}
	for i, exp := range expected {
		t.Logf("Bar %d: Time=%d, OBV=%f (expected=%f)", i, pts[i].Time, pts[i].Value, exp)
		if math.Abs(pts[i].Value-exp) > tol {
			t.Errorf("Bar %d: expected OBV %f, got %f (drift detected!)", i, exp, pts[i].Value)
		}
	}
}

// TestVolumeBoundaryStress_AnchoredVWAP_CumulativeWeighting verifies cumulative volume weighting
// from initial bar and precision within 1e-6.
func TestVolumeBoundaryStress_AnchoredVWAP_CumulativeWeighting(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	const tol = 1e-6

	// Bar 0: H=10, L=8, C=9, V=100
	//   TP = (10+8+9)/3 = 9. TPV = 900. CumTPV = 900. CumV = 100. AVWAP = 9.0
	// Bar 1: H=12, L=10, C=11, V=200
	//   TP = (12+10+11)/3 = 11. TPV = 2200. CumTPV = 3100. CumV = 300. AVWAP = 3100/300 = 10.333333333333334
	// Bar 2: H=15, L=11, C=13, V=300
	//   TP = (15+11+13)/3 = 13. TPV = 3900. CumTPV = 7000. CumV = 600. AVWAP = 7000/600 = 11.666666666666666
	// Bar 3: H=16, L=12, C=14, V=400
	//   TP = (16+12+14)/3 = 14. TPV = 5600. CumTPV = 12600. CumV = 1000. AVWAP = 12600/1000 = 12.6
	candles := []CandleData{
		{Time: 1700000000, Open: 9.0, High: 10.0, Low: 8.0, Close: 9.0, Volume: 100.0},
		{Time: 1700000060, Open: 9.0, High: 12.0, Low: 10.0, Close: 11.0, Volume: 200.0},
		{Time: 1700000120, Open: 11.0, High: 15.0, Low: 11.0, Close: 13.0, Volume: 300.0},
		{Time: 1700000180, Open: 13.0, High: 16.0, Low: 12.0, Close: 14.0, Volume: 400.0},
	}

	configs := []EvalIndicatorInstance{
		{InstanceID: "avwap_weighting", IndicatorID: "wickra.anchored_vwap", Inputs: map[string]interface{}{}},
	}

	results, err := engine.Evaluate(ctx, candles, configs)
	if err != nil {
		t.Fatalf("AnchoredVWAP Evaluate error: %v", err)
	}

	pts := results[0].Plots["plot"]
	if len(pts) != len(candles) {
		t.Fatalf("Expected %d points, got %d", len(candles), len(pts))
	}

	expected := []float64{
		9.0,
		3100.0 / 300.0,
		7000.0 / 600.0,
		12600.0 / 1000.0,
	}

	for i, exp := range expected {
		t.Logf("Bar %d: Time=%d, AVWAP=%f (expected=%f)", i, pts[i].Time, pts[i].Value, exp)
		diff := math.Abs(pts[i].Value - exp)
		if diff > tol {
			t.Errorf("Bar %d: expected AVWAP %f, got %f (diff %e > tol %e)", i, exp, pts[i].Value, diff, tol)
		}
	}
}

// TestVolumeBoundaryStress_StrictlyMonotonicTimestamps verifies that for all volume-family indicators,
// output series timestamps are strictly monotonically increasing, as required by lightweight-charts.
func TestVolumeBoundaryStress_StrictlyMonotonicTimestamps(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	// Test with irregular intervals and weekend gaps
	candles := []CandleData{
		{Time: 1700000000, Open: 10.0, High: 12.0, Low: 9.0, Close: 11.0, Volume: 1000.0},
		{Time: 1700000060, Open: 11.0, High: 13.0, Low: 10.0, Close: 12.0, Volume: 1500.0},
		{Time: 1700000300, Open: 12.0, High: 14.0, Low: 11.0, Close: 11.0, Volume: 2000.0}, // 240s gap
		{Time: 1700000360, Open: 11.0, High: 15.0, Low: 10.5, Close: 14.0, Volume: 2500.0},
		{Time: 1700086400, Open: 14.0, High: 16.0, Low: 13.0, Close: 13.5, Volume: 1800.0}, // 1 day gap
		{Time: 1700086460, Open: 13.5, High: 15.0, Low: 12.0, Close: 12.5, Volume: 2200.0},
	}

	volumeIndicators := []struct {
		id     string
		inputs map[string]interface{}
	}{
		{id: "wickra.vwap", inputs: map[string]interface{}{}},
		{id: "wickra.anchored_vwap", inputs: map[string]interface{}{}},
		{id: "wickra.rolling_vwap", inputs: map[string]interface{}{"period": 3}},
		{id: "wickra.obv", inputs: map[string]interface{}{}},
		{id: "wickra.adl", inputs: map[string]interface{}{}},
		{id: "wickra.chaikin_money_flow", inputs: map[string]interface{}{"period": 3}},
		{id: "wickra.ease_of_movement", inputs: map[string]interface{}{"period": 3}},
		{id: "wickra.volume_oscillator", inputs: map[string]interface{}{"fast": 2, "slow": 4}},
	}

	for _, ind := range volumeIndicators {
		t.Run(ind.id, func(t *testing.T) {
			configs := []EvalIndicatorInstance{
				{InstanceID: "test_" + ind.id, IndicatorID: ind.id, Inputs: ind.inputs},
			}

			results, err := engine.Evaluate(ctx, candles, configs)
			if err != nil {
				t.Fatalf("Evaluate %s error: %v", ind.id, err)
			}

			for plotName, pts := range results[0].Plots {
				t.Logf("%s plot %q has %d points", ind.id, plotName, len(pts))
				for i := 1; i < len(pts); i++ {
					if pts[i].Time <= pts[i-1].Time {
						t.Errorf("%s plot %q: non-monotonic timestamps at index %d: %d <= %d",
							ind.id, plotName, i, pts[i].Time, pts[i-1].Time)
					}
				}
			}
		})
	}
}

// TestVolumeBoundaryStress_PrecisionTolerance verifies that all indicators respect 1e-6 tolerance.
func TestVolumeBoundaryStress_PrecisionTolerance(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	const tol = 1e-6

	// Precision test with fractional prices and volumes
	candles := []CandleData{
		{Time: 1700000000, Open: 100.123456, High: 105.654321, Low: 98.234567, Close: 103.456789, Volume: 12345.678},
		{Time: 1700000060, Open: 103.456789, High: 108.987654, Low: 101.112233, Close: 106.789012, Volume: 23456.789},
	}

	// Verify VWAP:
	// Bar 0: TP = (105.654321 + 98.234567 + 103.456789)/3 = 307.345677 / 3 = 102.448559
	// CumTPV = 102.448559 * 12345.678 = 1264797.430036662
	// CumV = 12345.678
	// VWAP_0 = 102.448559
	// Bar 1: TP = (108.987654 + 101.112233 + 106.789012)/3 = 316.888899 / 3 = 105.629633
	// TPV_1 = 105.629633 * 23456.789 = 2477731.579469437
	// CumTPV = 1264797.430036662 + 2477731.579469437 = 3742529.009506099
	// CumV = 12345.678 + 23456.789 = 35802.467
	// VWAP_1 = 3742529.009506099 / 35802.467 = 104.532712959
	tp0 := (105.654321 + 98.234567 + 103.456789) / 3.0
	tp1 := (108.987654 + 101.112233 + 106.789012) / 3.0
	cumTPV1 := (tp0 * 12345.678) + (tp1 * 23456.789)
	cumV1 := 12345.678 + 23456.789
	expVWAP1 := cumTPV1 / cumV1

	configs := []EvalIndicatorInstance{
		{InstanceID: "vwap_prec", IndicatorID: "wickra.vwap", Inputs: map[string]interface{}{}},
	}

	results, err := engine.Evaluate(ctx, candles, configs)
	if err != nil {
		t.Fatalf("Precision test Evaluate error: %v", err)
	}

	pts := results[0].Plots["plot"]
	if len(pts) != 2 {
		t.Fatalf("Expected 2 points, got %d", len(pts))
	}

	diff0 := math.Abs(pts[0].Value - tp0)
	if diff0 > tol {
		t.Errorf("Bar 0 VWAP precision diff %e > tol %e (got %f, expected %f)", diff0, tol, pts[0].Value, tp0)
	}

	diff1 := math.Abs(pts[1].Value - expVWAP1)
	if diff1 > tol {
		t.Errorf("Bar 1 VWAP precision diff %e > tol %e (got %f, expected %f)", diff1, tol, pts[1].Value, expVWAP1)
	}
}

// TestVolumeBoundaryStress_ExtremeConditions tests indicators under extreme market conditions:
// - Negative prices (WTI crude style)
// - Giant volume magnitudes (crypto micro-cap/meme tokens, e.g., 1e12)
// - Sub-satoshi micro prices (e.g., 0.00001234)
// - Single candle input
// - Empty candle array
func TestVolumeBoundaryStress_ExtremeConditions(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	const tol = 1e-6

	t.Run("NegativePrices_WTIStyle", func(t *testing.T) {
		candles := []CandleData{
			{Time: 1700000000, Open: -35.0, High: -30.0, Low: -40.0, Close: -37.0, Volume: 50000.0},
			{Time: 1700000060, Open: -37.0, High: -25.0, Low: -38.0, Close: -28.0, Volume: 75000.0},
		}

		configs := []EvalIndicatorInstance{
			{InstanceID: "vwap_neg", IndicatorID: "wickra.vwap", Inputs: map[string]interface{}{}},
			{InstanceID: "adl_neg", IndicatorID: "wickra.adl", Inputs: map[string]interface{}{}},
			{InstanceID: "obv_neg", IndicatorID: "wickra.obv", Inputs: map[string]interface{}{}},
		}

		results, err := engine.Evaluate(ctx, candles, configs)
		if err != nil {
			t.Fatalf("Negative prices evaluate error: %v", err)
		}

		for _, res := range results {
			pts := res.Plots["plot"]
			t.Logf("Negative prices %s has %d points", res.IndicatorID, len(pts))
			for _, pt := range pts {
				if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
					t.Errorf("%s produced NaN or Inf on negative prices: %f", res.IndicatorID, pt.Value)
				}
			}
		}

		// VWAP calculation for Bar 0:
		// TP = (-30 + -40 + -37)/3 = -107/3 = -35.666666666666664
		expVWAP0 := -107.0 / 3.0
		vwapPts := results[0].Plots["plot"]
		if len(vwapPts) > 0 && math.Abs(vwapPts[0].Value-expVWAP0) > tol {
			t.Errorf("Negative price VWAP expected %f, got %f", expVWAP0, vwapPts[0].Value)
		}
	})

	t.Run("GiantVolumeMagnitudes", func(t *testing.T) {
		// Trillions in volume
		candles := []CandleData{
			{Time: 1700000000, Open: 0.00001, High: 0.000012, Low: 0.000009, Close: 0.000011, Volume: 5e12},
			{Time: 1700000060, Open: 0.000011, High: 0.000015, Low: 0.000010, Close: 0.000014, Volume: 8e12},
		}

		configs := []EvalIndicatorInstance{
			{InstanceID: "vwap_giant", IndicatorID: "wickra.vwap", Inputs: map[string]interface{}{}},
			{InstanceID: "obv_giant", IndicatorID: "wickra.obv", Inputs: map[string]interface{}{}},
			{InstanceID: "adl_giant", IndicatorID: "wickra.adl", Inputs: map[string]interface{}{}},
		}

		results, err := engine.Evaluate(ctx, candles, configs)
		if err != nil {
			t.Fatalf("Giant volume evaluate error: %v", err)
		}

		for _, res := range results {
			pts := res.Plots["plot"]
			t.Logf("Giant volume %s has %d points", res.IndicatorID, len(pts))
			for _, pt := range pts {
				if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
					t.Errorf("%s produced NaN or Inf on giant volume: %f", res.IndicatorID, pt.Value)
				}
			}
		}
	})

	t.Run("SingleCandleInput", func(t *testing.T) {
		candles := []CandleData{
			{Time: 1700000000, Open: 10.0, High: 12.0, Low: 9.0, Close: 11.0, Volume: 1000.0},
		}

		configs := []EvalIndicatorInstance{
			{InstanceID: "vwap_single", IndicatorID: "wickra.vwap", Inputs: map[string]interface{}{}},
			{InstanceID: "obv_single", IndicatorID: "wickra.obv", Inputs: map[string]interface{}{}},
			{InstanceID: "adl_single", IndicatorID: "wickra.adl", Inputs: map[string]interface{}{}},
		}

		results, err := engine.Evaluate(ctx, candles, configs)
		if err != nil {
			t.Fatalf("Single candle evaluate error: %v", err)
		}

		for _, res := range results {
			pts := res.Plots["plot"]
			t.Logf("Single candle %s returned %d points", res.IndicatorID, len(pts))
			for _, pt := range pts {
				if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
					t.Errorf("%s produced NaN or Inf on single candle: %f", res.IndicatorID, pt.Value)
				}
			}
		}
	})

	t.Run("EmptyCandleArray", func(t *testing.T) {
		var candles []CandleData

		configs := []EvalIndicatorInstance{
			{InstanceID: "vwap_empty", IndicatorID: "wickra.vwap", Inputs: map[string]interface{}{}},
		}

		results, err := engine.Evaluate(ctx, candles, configs)
		if err != nil {
			t.Fatalf("Empty candle evaluate error: %v", err)
		}

		if len(results) != 1 {
			t.Fatalf("Expected 1 result for empty candles, got %d", len(results))
		}
		pts := results[0].Plots["plot"]
		if len(pts) != 0 {
			t.Errorf("Expected 0 points for empty candles, got %d", len(pts))
		}
	})
}
