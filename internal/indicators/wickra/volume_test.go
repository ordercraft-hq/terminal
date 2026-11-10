package wickra

import (
	"context"
	"math"
	"testing"
)

func TestVolumeIndicators_NumericalVerification(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	const tol = 1e-6

	candles := []CandleData{
		{Time: 1700000000, Open: 10.0, High: 12.0, Low: 9.0, Close: 11.0, Volume: 1000.0},
		{Time: 1700000060, Open: 11.0, High: 13.0, Low: 10.0, Close: 12.0, Volume: 1500.0},
		{Time: 1700000120, Open: 12.0, High: 14.0, Low: 11.0, Close: 11.0, Volume: 2000.0},
		{Time: 1700000180, Open: 11.0, High: 15.0, Low: 10.5, Close: 14.0, Volume: 2500.0},
		{Time: 1700000240, Open: 14.0, High: 16.0, Low: 13.0, Close: 13.5, Volume: 1800.0},
		{Time: 1700000300, Open: 13.5, High: 15.0, Low: 12.0, Close: 12.5, Volume: 2200.0},
	}

	t.Run("VWAP_MathematicalVerification", func(t *testing.T) {
		configs := []EvalIndicatorInstance{
			{InstanceID: "vwap", IndicatorID: "wickra.vwap", Inputs: map[string]interface{}{}},
		}
		results, err := engine.Evaluate(ctx, candles, configs)
		if err != nil {
			t.Fatalf("VWAP Evaluate error: %v", err)
		}
		pts := results[0].Plots["plot"]
		if len(pts) != len(candles) {
			t.Fatalf("Expected %d points, got %d", len(candles), len(pts))
		}

		// Manual calculation:
		// Bar 0: TP = (12+9+11)/3 = 32/3. CumTPV = 32000/3. CumV = 1000. VWAP = 32/3 = 10.666666666666666
		// Bar 1: TP = (13+10+12)/3 = 35/3. CumTPV = 32000/3 + 52500/3 = 84500/3. CumV = 2500. VWAP = 169/15 = 11.266666666666667
		// Bar 2: TP = (14+11+11)/3 = 12. CumTPV = 84500/3 + 72000/3 = 156500/3. CumV = 4500. VWAP = 313/27 = 11.592592592592593
		// Bar 3: TP = (15+10.5+14)/3 = 39.5/3. CumTPV = 156500/3 + 98750/3 = 255250/3. CumV = 7000. VWAP = 1021/84 = 12.154761904761905
		expected := []float64{
			32.0 / 3.0,
			169.0 / 15.0,
			313.0 / 27.0,
			1021.0 / 84.0,
		}

		for i, exp := range expected {
			if math.Abs(pts[i].Value-exp) > tol {
				t.Errorf("Bar %d: expected VWAP %f, got %f", i, exp, pts[i].Value)
			}
		}
	})

	t.Run("AnchoredVWAP_MathematicalVerification", func(t *testing.T) {
		configs := []EvalIndicatorInstance{
			{InstanceID: "avwap", IndicatorID: "wickra.anchored_vwap", Inputs: map[string]interface{}{}},
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
			32.0 / 3.0,
			169.0 / 15.0,
			313.0 / 27.0,
			1021.0 / 84.0,
		}

		for i, exp := range expected {
			if math.Abs(pts[i].Value-exp) > tol {
				t.Errorf("Bar %d: expected AnchoredVWAP %f, got %f", i, exp, pts[i].Value)
			}
		}
	})

	t.Run("OBV_MathematicalVerification", func(t *testing.T) {
		configs := []EvalIndicatorInstance{
			{InstanceID: "obv", IndicatorID: "wickra.obv", Inputs: map[string]interface{}{}},
		}
		results, err := engine.Evaluate(ctx, candles, configs)
		if err != nil {
			t.Fatalf("OBV Evaluate error: %v", err)
		}
		pts := results[0].Plots["plot"]
		if len(pts) != len(candles) {
			t.Fatalf("Expected %d points, got %d", len(candles), len(pts))
		}

		// Close prices: 11.0, 12.0, 11.0, 14.0, 13.5, 12.5
		// Volumes:      1000, 1500, 2000, 2500, 1800, 2200
		// Bar 0: initial volume baseline = 0.0
		// Bar 1: Close 12 > 11 => OBV = 0 + 1500 = 1500
		// Bar 2: Close 11 < 12 => OBV = 1500 - 2000 = -500
		// Bar 3: Close 14 > 11 => OBV = -500 + 2500 = 2000
		// Bar 4: Close 13.5 < 14 => OBV = 2000 - 1800 = 200
		// Bar 5: Close 12.5 < 13.5 => OBV = 200 - 2200 = -2000
		expected := []float64{0.0, 1500.0, -500.0, 2000.0, 200.0, -2000.0}

		for i, exp := range expected {
			if math.Abs(pts[i].Value-exp) > tol {
				t.Errorf("Bar %d: expected OBV %f, got %f", i, exp, pts[i].Value)
			}
		}
	})

	t.Run("ADL_MathematicalVerification", func(t *testing.T) {
		configs := []EvalIndicatorInstance{
			{InstanceID: "adl", IndicatorID: "wickra.adl", Inputs: map[string]interface{}{}},
		}
		results, err := engine.Evaluate(ctx, candles, configs)
		if err != nil {
			t.Fatalf("ADL Evaluate error: %v", err)
		}
		pts := results[0].Plots["plot"]
		if len(pts) != len(candles) {
			t.Fatalf("Expected %d points, got %d", len(candles), len(pts))
		}

		// Bar 0: MFM = ((11-9)-(12-11))/(12-9) = 1/3. MFV = 1000/3. ADL = 1000/3
		// Bar 1: MFM = ((12-10)-(13-12))/(13-10) = 1/3. MFV = 1500/3 = 500. ADL = 1000/3 + 500 = 2500/3
		// Bar 2: MFM = ((11-11)-(14-11))/(14-11) = -1. MFV = -2000. ADL = 2500/3 - 2000 = -3500/3
		// Bar 3: MFM = ((14-10.5)-(15-14))/(15-10.5) = 2.5/4.5 = 5/9. MFV = 12500/9. ADL = -3500/3 + 12500/9 = 2000/9
		expected := []float64{
			1000.0 / 3.0,
			2500.0 / 3.0,
			-3500.0 / 3.0,
			2000.0 / 9.0,
		}

		for i, exp := range expected {
			if math.Abs(pts[i].Value-exp) > tol {
				t.Errorf("Bar %d: expected ADL %f, got %f", i, exp, pts[i].Value)
			}
		}
	})

	t.Run("RollingVWAP_MathematicalVerification", func(t *testing.T) {
		configs := []EvalIndicatorInstance{
			{InstanceID: "rvwap", IndicatorID: "wickra.rolling_vwap", Inputs: map[string]interface{}{"period": 3}},
		}
		results, err := engine.Evaluate(ctx, candles, configs)
		if err != nil {
			t.Fatalf("RollingVWAP Evaluate error: %v", err)
		}
		pts := results[0].Plots["plot"]
		if len(pts) == 0 {
			t.Fatalf("Expected points for RollingVWAP")
		}

		// Period = 3
		// At Bar 2 (index 2): window [0, 1, 2]
		// sum(TP*V) = 32000/3 + 52500/3 + 72000/3 = 156500/3
		// sum(V) = 1000 + 1500 + 2000 = 4500
		// RVWAP = 156500 / 13500 = 313/27 = 11.592592592592593
		// At Bar 3 (index 3): window [1, 2, 3]
		// sum(TP*V) = 52500/3 + 72000/3 + 98750/3 = 223250/3
		// sum(V) = 1500 + 2000 + 2500 = 6000
		// RVWAP = 223250 / 18000 = 893/72 = 12.402777777777779
		foundBar2 := false
		foundBar3 := false
		for _, pt := range pts {
			if pt.Time == 1700000120 {
				foundBar2 = true
				exp := 313.0 / 27.0
				if math.Abs(pt.Value-exp) > tol {
					t.Errorf("Bar 2 RollingVWAP expected %f, got %f", exp, pt.Value)
				}
			}
			if pt.Time == 1700000180 {
				foundBar3 = true
				exp := 893.0 / 72.0
				if math.Abs(pt.Value-exp) > tol {
					t.Errorf("Bar 3 RollingVWAP expected %f, got %f", exp, pt.Value)
				}
			}
		}
		if !foundBar2 || !foundBar3 {
			t.Errorf("RollingVWAP missing expected points for bar 2 (%v) or bar 3 (%v)", foundBar2, foundBar3)
		}
	})

	t.Run("ChaikinMoneyFlow_MathematicalVerification", func(t *testing.T) {
		configs := []EvalIndicatorInstance{
			{InstanceID: "cmf", IndicatorID: "wickra.chaikin_money_flow", Inputs: map[string]interface{}{"period": 3}},
		}
		results, err := engine.Evaluate(ctx, candles, configs)
		if err != nil {
			t.Fatalf("CMF Evaluate error: %v", err)
		}
		pts := results[0].Plots["plot"]
		if len(pts) == 0 {
			t.Fatalf("Expected points for CMF")
		}

		// At Bar 2 (index 2): window [0, 1, 2]
		// MFV sum = 1000/3 + 500 - 2000 = -3500/3
		// Volume sum = 4500
		// CMF = (-3500/3) / 4500 = -3500 / 13500 = -7/27 = -0.25925925925925924
		for _, pt := range pts {
			if pt.Time == 1700000120 {
				exp := -7.0 / 27.0
				if math.Abs(pt.Value-exp) > tol {
					t.Errorf("Bar 2 CMF expected %f, got %f", exp, pt.Value)
				}
			}
		}
	})

	t.Run("EaseOfMovement_Verification", func(t *testing.T) {
		configs := []EvalIndicatorInstance{
			{InstanceID: "eom", IndicatorID: "wickra.ease_of_movement", Inputs: map[string]interface{}{"period": 3, "divisor": 10000.0}},
		}
		results, err := engine.Evaluate(ctx, candles, configs)
		if err != nil {
			t.Fatalf("EaseOfMovement Evaluate error: %v", err)
		}
		pts := results[0].Plots["plot"]
		if len(pts) == 0 {
			t.Fatalf("Expected points for EaseOfMovement")
		}
		for _, pt := range pts {
			if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
				t.Errorf("Invalid EOM value: %f at time %d", pt.Value, pt.Time)
			}
		}
	})

	t.Run("VolumeOscillator_Verification", func(t *testing.T) {
		configs := []EvalIndicatorInstance{
			{InstanceID: "vo", IndicatorID: "wickra.volume_oscillator", Inputs: map[string]interface{}{"fast": 2, "slow": 4}},
		}
		results, err := engine.Evaluate(ctx, candles, configs)
		if err != nil {
			t.Fatalf("VolumeOscillator Evaluate error: %v", err)
		}
		pts := results[0].Plots["plot"]
		if len(pts) == 0 {
			t.Fatalf("Expected points for VolumeOscillator")
		}

		// At Bar 3 (index 3):
		// fast SMA(2) = (2000+2500)/2 = 2250
		// slow SMA(4) = (1000+1500+2000+2500)/4 = 1750
		// VO = 100 * (2250 - 1750) / 1750 = 200/7 = 28.571428571428573
		for _, pt := range pts {
			if pt.Time == 1700000180 {
				exp := 200.0 / 7.0
				if math.Abs(pt.Value-exp) > tol {
					t.Errorf("Bar 3 VolumeOscillator expected %f, got %f", exp, pt.Value)
				}
			}
			if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
				t.Errorf("Invalid VolumeOscillator value: %f at time %d", pt.Value, pt.Time)
			}
		}
	})
}
