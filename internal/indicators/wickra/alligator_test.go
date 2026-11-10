package wickra

import (
	"context"
	"testing"
)

func TestAlligator_ThreeLinesAndOffsets(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("Failed to initialize engine: %v", err)
	}
	defer engine.Close(ctx)

	desc, ok := engine.GetDescriptor("wickra.alligator")
	if !ok {
		t.Fatalf("Alligator descriptor not found")
	}

	if desc.ShortName != "Alligator" {
		t.Errorf("Expected ShortName Alligator, got %s", desc.ShortName)
	}
	if len(desc.Plots) != 3 {
		t.Fatalf("Expected 3 plots, got %d", len(desc.Plots))
	}
	if desc.Plots[0].Title != "Jaw" || desc.Plots[1].Title != "Teeth" || desc.Plots[2].Title != "Lips" {
		t.Errorf("Unexpected plot titles: %+v", desc.Plots)
	}
	if desc.Plots[1].Color != "#F23645" || desc.Plots[2].Color != "#089981" {
		t.Errorf("Expected distinct colors for Teeth (#F23645) and Lips (#089981), got: %+v", desc.Plots)
	}

	// Generate 50 bars
	candles := make([]CandleData, 50)
	for i := 0; i < 50; i++ {
		candles[i] = CandleData{
			Time:   1700000000 + int64(i*60),
			Open:   100.0 + float64(i),
			High:   105.0 + float64(i),
			Low:    99.0 + float64(i),
			Close:  102.0 + float64(i),
			Volume: 1000,
		}
	}

	results, err := engine.Evaluate(ctx, candles, []EvalIndicatorInstance{
		{
			InstanceID:  "alligator-1",
			IndicatorID: "wickra.alligator",
			Inputs: map[string]interface{}{
				"jaw":         13,
				"teeth":       8,
				"lips":        5,
				"jawOffset":   8,
				"teethOffset": 5,
				"lipsOffset":  3,
			},
		},
	})
	if err != nil {
		t.Fatalf("Evaluate failed: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("Expected 1 result, got %d", len(results))
	}

	res := results[0]
	if len(res.Plots["jaw"]) == 0 || len(res.Plots["teeth"]) == 0 || len(res.Plots["lips"]) == 0 {
		t.Fatalf("Expected all 3 plots (jaw, teeth, lips) to have points, got: jaw=%d, teeth=%d, lips=%d",
			len(res.Plots["jaw"]), len(res.Plots["teeth"]), len(res.Plots["lips"]))
	}

	lastJaw := res.Plots["jaw"][len(res.Plots["jaw"])-1]
	lastTeeth := res.Plots["teeth"][len(res.Plots["teeth"])-1]
	lastLips := res.Plots["lips"][len(res.Plots["lips"])-1]

	t.Logf("Last points: Jaw=%+v, Teeth=%+v, Lips=%+v", lastJaw, lastTeeth, lastLips)

	// Verify offset shift: Jaw offset 8 (8*60 = 480s), Teeth offset 5 (300s), Lips offset 3 (180s)
	lastCandleTime := candles[len(candles)-1].Time
	expectedJawTime := lastCandleTime + 8*60
	expectedTeethTime := lastCandleTime + 5*60
	expectedLipsTime := lastCandleTime + 3*60

	if lastJaw.Time != expectedJawTime {
		t.Errorf("Expected last Jaw time %d, got %d", expectedJawTime, lastJaw.Time)
	}
	if lastTeeth.Time != expectedTeethTime {
		t.Errorf("Expected last Teeth time %d, got %d", expectedTeethTime, lastTeeth.Time)
	}
	if lastLips.Time != expectedLipsTime {
		t.Errorf("Expected last Lips time %d, got %d", expectedLipsTime, lastLips.Time)
	}
}
