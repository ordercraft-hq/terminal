package datafeed

import (
	"math"
	"math/rand"
	"testing"
)

// TestSynthetic_GeometricInvariantsUnderRandomizedInputs tests 10,000 random candle pairs
// across all 4 spread operations to strictly verify if candlestick geometry invariants hold:
// 1. High >= Low
// 2. High >= max(Open, Close)
// 3. Low <= min(Open, Close)
func TestSynthetic_GeometricInvariantsUnderRandomizedInputs(t *testing.T) {
	r := rand.New(rand.NewSource(1337))
	const n = 1000

	generateCandles := func(minP, maxP float64) []Candle {
		bars := make([]Candle, n)
		for i := 0; i < n; i++ {
			p1 := minP + r.Float64()*(maxP-minP)
			p2 := minP + r.Float64()*(maxP-minP)
			o := p1
			c := p2
			h := math.Max(o, c) + r.Float64()*10.0
			l := math.Min(o, c) - r.Float64()*10.0
			bars[i] = Candle{
				Time:   int64(1000 + i*60),
				Open:   o,
				High:   h,
				Low:    l,
				Close:  c,
				Volume: 10 + r.Float64()*100,
			}
		}
		return bars
	}

	testCases := []struct {
		name string
		aMin float64
		aMax float64
		bMin float64
		bMax float64
		ops  []SpreadOp
	}{
		{
			name: "StandardPositiveRange",
			aMin: 50, aMax: 150,
			bMin: 20, bMax: 80,
			ops: []SpreadOp{SpreadOpSub, SpreadOpAdd, SpreadOpMul, SpreadOpDiv},
		},
		{
			name: "BothNegativeRange",
			aMin: -100, aMax: -20,
			bMin: -80, bMax: -10,
			ops: []SpreadOp{SpreadOpSub, SpreadOpAdd, SpreadOpMul, SpreadOpDiv},
		},
		{
			name: "MixedPositiveAndNegative",
			aMin: -50, aMax: 50,
			bMin: -40, bMax: 60,
			ops: []SpreadOp{SpreadOpSub, SpreadOpAdd, SpreadOpMul, SpreadOpDiv},
		},
	}

	for _, tc := range testCases {
		aBars := generateCandles(tc.aMin, tc.aMax)
		bBars := generateCandles(tc.bMin, tc.bMax)

		for _, op := range tc.ops {
			t.Run(tc.name+"_"+string(op), func(t *testing.T) {
				res := SynthesizeSpreadCandles(aBars, bBars, op, AlignIntersection)
				for i, bar := range res {
					if bar.High < bar.Low {
						t.Errorf("Bar %d (%s): High (%f) < Low (%f)", i, op, bar.High, bar.Low)
					}
					maxOC := math.Max(bar.Open, bar.Close)
					minOC := math.Min(bar.Open, bar.Close)
					if bar.High < maxOC-1e-9 {
						t.Errorf("Bar %d (%s): High (%f) < max(Open, Close) (%f)", i, op, bar.High, maxOC)
					}
					if bar.Low > minOC+1e-9 {
						t.Errorf("Bar %d (%s): Low (%f) > min(Open, Close) (%f)", i, op, bar.Low, minOC)
					}
				}
			})
		}
	}
}

// TestSynthetic_SpreadOpMulNegativeAnomaly empirically verifies whether SpreadOpMul
// produces valid High and Low bounds when both input series have negative prices.
func TestSynthetic_SpreadOpMulNegativeAnomaly(t *testing.T) {
	// Let ca be in range [-15, -5] and cb be in range [-15, -5]
	// ca: Open=-10, High=-5, Low=-15, Close=-8
	// cb: Open=-10, High=-5, Low=-15, Close=-8
	// Product Open = (-10)*(-10) = 100
	// Product Close = (-8)*(-8) = 64
	// Extremum 1: ca.High * cb.High = (-5)*(-5) = 25
	// Extremum 2: ca.Low * cb.Low = (-15)*(-15) = 225
	// The TRUE high of the bar should be at least 225 (since trades at low * low yield 225)!
	ca := []Candle{
		{Time: 100, Open: -10, High: -5, Low: -15, Close: -8, Volume: 10},
	}
	cb := []Candle{
		{Time: 100, Open: -10, High: -5, Low: -15, Close: -8, Volume: 10},
	}

	res := SynthesizeSpreadCandles(ca, cb, SpreadOpMul, AlignIntersection)
	if len(res) != 1 {
		t.Fatalf("Expected 1 result candle, got %d", len(res))
	}
	synth := res[0]
	t.Logf("Negative SpreadOpMul result: Open=%f, High=%f, Low=%f, Close=%f",
		synth.Open, synth.High, synth.Low, synth.Close)

	// In reality: the product of [-15, -5] * [-15, -5] ranges from +25 to +225!
	// But let's see what SynthesizeSpreadCandles calculated:
	if synth.High < 225.0 {
		t.Errorf("ANOMALY: SpreadOpMul with negative prices: True high can reach 225.0, but calculated High is %f!", synth.High)
	}
	if synth.Low > 25.0 {
		t.Errorf("ANOMALY: SpreadOpMul with negative prices: True low can reach 25.0, but calculated Low is %f!", synth.Low)
	}
}

// TestSynthetic_ZeroAndNearZeroDivision tests behavior when denominator approaches or equals zero.
func TestSynthetic_ZeroAndNearZeroDivision(t *testing.T) {
	ca := []Candle{
		{Time: 100, Open: 100, High: 110, Low: 90, Close: 105, Volume: 10},
		{Time: 200, Open: 100, High: 110, Low: 90, Close: 105, Volume: 10},
		{Time: 300, Open: 100, High: 110, Low: 90, Close: 105, Volume: 10},
	}
	cb := []Candle{
		{Time: 100, Open: 0, High: 10, Low: 0, Close: 5, Volume: 5},       // Exact zero Open & Low
		{Time: 200, Open: -5, High: 5, Low: -10, Close: 2, Volume: 5},    // Crosses zero (Low < 0 < High)
		{Time: 300, Open: 1e-12, High: 1e-11, Low: 1e-13, Close: 1e-12}, // Near-zero
	}

	res := SynthesizeSpreadCandles(ca, cb, SpreadOpDiv, AlignIntersection)
	// Bar 100 should be skipped due to cb.Open == 0 || cb.Low == 0
	for _, bar := range res {
		if bar.Time == 100 {
			t.Errorf("Expected bar 100 with zero denominator to be skipped, but got: %+v", bar)
		}
		if math.IsNaN(bar.Open) || math.IsNaN(bar.High) || math.IsNaN(bar.Low) || math.IsNaN(bar.Close) {
			t.Errorf("Bar %d produced NaN values: %+v", bar.Time, bar)
		}
		if math.IsInf(bar.Open, 0) || math.IsInf(bar.High, 0) || math.IsInf(bar.Low, 0) || math.IsInf(bar.Close, 0) {
			t.Errorf("Bar %d produced Infinite values: %+v", bar.Time, bar)
		}
	}
}

// TestSynthetic_MissingAndMisalignedTimestamps tests both AlignIntersection and AlignForwardFill
// when series timestamps are staggered, interleaved, or disjoint.
func TestSynthetic_MissingAndMisalignedTimestamps(t *testing.T) {
	// A: [100, 300, 500]
	// B: [200, 400, 600]
	a := []Candle{
		{Time: 100, Open: 10, High: 12, Low: 9, Close: 11, Volume: 100},
		{Time: 300, Open: 11, High: 13, Low: 10, Close: 12, Volume: 110},
		{Time: 500, Open: 12, High: 14, Low: 11, Close: 13, Volume: 120},
	}
	b := []Candle{
		{Time: 200, Open: 20, High: 22, Low: 19, Close: 21, Volume: 200},
		{Time: 400, Open: 21, High: 23, Low: 20, Close: 22, Volume: 210},
		{Time: 600, Open: 22, High: 24, Low: 21, Close: 23, Volume: 220},
	}

	// 1. Intersection of completely disjoint timestamps should be empty
	intersect := SynthesizeSpreadCandles(a, b, SpreadOpSub, AlignIntersection)
	if len(intersect) != 0 {
		t.Errorf("Expected 0 candles for disjoint intersection, got %d", len(intersect))
	}

	// 2. ForwardFill should produce bars once BOTH series have initialized
	// T=100: A ready, B not ready -> skipped
	// T=200: A forward filled from T=100 (close=11), B ready (close=21) -> emitted
	// T=300: A ready (close=12), B forward filled from T=200 (close=21) -> emitted
	// T=400: A forward filled (close=12), B ready (close=22) -> emitted
	// T=500: A ready (close=13), B forward filled (close=22) -> emitted
	// T=600: A forward filled (close=13), B ready (close=23) -> emitted
	ff := SynthesizeSpreadCandles(a, b, SpreadOpSub, AlignForwardFill)
	if len(ff) != 5 {
		t.Fatalf("Expected 5 forward-filled candles (200..600), got %d", len(ff))
	}

	if ff[0].Time != 200 {
		t.Errorf("First candle should be at Time=200, got %d", ff[0].Time)
	}
	// At T=200: A is forward-filled from A[100].Close = 11. B has Open=20, Close=21.
	// SpreadSub: Open = 11 - 20 = -9. Close = 11 - 21 = -10.
	if ff[0].Open != -9 || ff[0].Close != -10 {
		t.Errorf("T=200 expected Open=-9, Close=-10, got Open=%f, Close=%f", ff[0].Open, ff[0].Close)
	}

	// Verify all candles satisfy geometric invariant
	for i, c := range ff {
		if c.High < math.Max(c.Open, c.Close) || c.Low > math.Min(c.Open, c.Close) {
			t.Errorf("Bar %d (Time %d) violated geometry: %+v", i, c.Time, c)
		}
	}
}

// TestSynthetic_NaNValuesHandling tests behavior when input candles contain NaNs.
func TestSynthetic_NaNValuesHandling(t *testing.T) {
	a := []Candle{
		{Time: 100, Open: math.NaN(), High: 10, Low: 5, Close: 8, Volume: 10},
		{Time: 200, Open: 10, High: math.NaN(), Low: 5, Close: 8, Volume: 10},
	}
	b := []Candle{
		{Time: 100, Open: 5, High: 7, Low: 4, Close: 6, Volume: 5},
		{Time: 200, Open: 5, High: 7, Low: 4, Close: 6, Volume: 5},
	}

	res := SynthesizeSpreadCandles(a, b, SpreadOpSub, AlignIntersection)
	t.Logf("NaN input candles produced %d synthetic candles", len(res))
	for i, bar := range res {
		t.Logf("  Bar %d: Open=%v, High=%v, Low=%v, Close=%v", i, bar.Open, bar.High, bar.Low, bar.Close)
	}
}
