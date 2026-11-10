package wickra

import (
	"context"
	"testing"
)

func TestEMA_DefaultSettingsAndOffset(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	desc, ok := engine.GetDescriptor("wickra.ema")
	if !ok {
		t.Fatalf("EMA descriptor not found")
	}

	if desc.Name != "Exponential Moving Average" {
		t.Errorf("Expected Name 'Exponential Moving Average', got %q", desc.Name)
	}
	if desc.ShortName != "EMA" {
		t.Errorf("Expected ShortName 'EMA', got %q", desc.ShortName)
	}

	// Verify inputs
	var hasLength, hasSource, hasOffset bool
	for _, inp := range desc.Inputs {
		switch inp.ID {
		case "period":
			hasLength = true
			if inp.Name != "Length" {
				t.Errorf("Expected input name 'Length', got %q", inp.Name)
			}
			if inp.Default != 9 {
				t.Errorf("Expected default length 9, got %v", inp.Default)
			}
		case "source":
			hasSource = true
			if inp.Default != "close" {
				t.Errorf("Expected default source 'close', got %v", inp.Default)
			}
		case "offset":
			hasOffset = true
			if inp.Default != 0 {
				t.Errorf("Expected default offset 0, got %v", inp.Default)
			}
		}
	}
	if !hasLength || !hasSource || !hasOffset {
		t.Errorf("Missing inputs: length=%v, source=%v, offset=%v", hasLength, hasSource, hasOffset)
	}

	// Generate 30 bars
	candles := make([]CandleData, 30)
	for i := 0; i < 30; i++ {
		candles[i] = CandleData{
			Time:   1700000000 + int64(i*60),
			Open:   100.0 + float64(i),
			High:   105.0 + float64(i),
			Low:    99.0 + float64(i),
			Close:  102.0 + float64(i),
			Volume: 1000,
		}
	}

	// 1. Evaluate with offset = 0
	results, err := engine.Evaluate(ctx, candles, []EvalIndicatorInstance{
		{
			InstanceID:  "ema_0",
			IndicatorID: "wickra.ema",
			Inputs: map[string]interface{}{
				"period": 9,
				"source": "close",
				"offset": 0,
			},
		},
		{
			InstanceID:  "ema_shift3",
			IndicatorID: "wickra.ema",
			Inputs: map[string]interface{}{
				"period": 9,
				"source": "close",
				"offset": 3,
			},
		},
	})
	if err != nil {
		t.Fatalf("Evaluate failed: %v", err)
	}

	if len(results) != 2 {
		t.Fatalf("Expected 2 results, got %d", len(results))
	}

	pts0 := results[0].Plots["plot"]
	pts3 := results[1].Plots["plot"]

	if len(pts0) == 0 || len(pts3) == 0 {
		t.Fatalf("Expected non-empty plots: pts0=%d, pts3=%d", len(pts0), len(pts3))
	}

	last0 := pts0[len(pts0)-1]
	last3 := pts3[len(pts3)-1]

	expectedShift := int64(3 * 60)
	if last3.Time != last0.Time+expectedShift {
		t.Errorf("Expected shifted time %d, got %d (delta: %d)", last0.Time+expectedShift, last3.Time, last3.Time-last0.Time)
	}
	if last0.Value <= 0 || last3.Value <= 0 {
		t.Errorf("Expected positive values, got last0=%f, last3=%f", last0.Value, last3.Value)
	}
}

func TestFRAMA_Validation(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	desc, ok := engine.GetDescriptor("wickra.frama")
	if !ok {
		t.Fatalf("FRAMA descriptor not found")
	}

	if desc.Name != "Fractal Adaptive Moving Average" {
		t.Errorf("Expected Name 'Fractal Adaptive Moving Average', got %q", desc.Name)
	}
	if desc.ShortName != "FRAMA" {
		t.Errorf("Expected ShortName 'FRAMA', got %q", desc.ShortName)
	}
	if len(desc.Plots) != 1 || desc.Plots[0].Color != "#FFD600" {
		t.Errorf("Expected Yellow plot color #FFD600, got: %+v", desc.Plots)
	}

	// Verify inputs: Period, Source, Fast, Slow
	inputIDs := make(map[string]bool)
	for _, inp := range desc.Inputs {
		inputIDs[inp.ID] = true
	}
	for _, required := range []string{"period", "source", "fast", "slow"} {
		if !inputIDs[required] {
			t.Errorf("Missing expected input %q in FRAMA", required)
		}
	}
}

func TestEVWMA_VolumeWeightedMath(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	desc, ok := engine.GetDescriptor("wickra.evwma")
	if !ok {
		t.Fatalf("EVWMA descriptor not found")
	}

	if desc.Name != "Elastic Volume-Weighted Moving Average" {
		t.Errorf("Expected Name 'Elastic Volume-Weighted Moving Average', got %q", desc.Name)
	}
	if desc.ShortName != "EVWMA" {
		t.Errorf("Expected ShortName 'EVWMA', got %q", desc.ShortName)
	}

	// Generate 30 bars with volume
	candles := make([]CandleData, 30)
	for i := 0; i < 30; i++ {
		candles[i] = CandleData{
			Time:   1700000000 + int64(i*60),
			Open:   100.0 + float64(i),
			High:   105.0 + float64(i),
			Low:    99.0 + float64(i),
			Close:  102.0 + float64(i),
			Volume: 1000 + float64(i*50),
		}
	}

	results, err := engine.Evaluate(ctx, candles, []EvalIndicatorInstance{
		{
			InstanceID:  "evwma_1",
			IndicatorID: "wickra.evwma",
			Inputs: map[string]interface{}{
				"period": 14,
				"source": "close",
			},
		},
	})
	if err != nil {
		t.Fatalf("Evaluate failed: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("Expected 1 result, got %d", len(results))
	}
	pts := results[0].Plots["plot"]
	if len(pts) == 0 {
		t.Fatalf("Expected non-empty EVWMA plot points")
	}
	lastPt := pts[len(pts)-1]
	if lastPt.Value <= 0 {
		t.Errorf("Expected positive EVWMA value, got %f", lastPt.Value)
	}
}
