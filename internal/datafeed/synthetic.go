package datafeed

import (
	"math"
)

// SpreadOp defines the arithmetic operator applied between series.
type SpreadOp string

const (
	SpreadOpSub SpreadOp = "-" // A - B (Difference / Arbitrage basis)
	SpreadOpDiv SpreadOp = "/" // A / B (Ratio / Relative strength)
	SpreadOpAdd SpreadOp = "+" // A + B (Sum)
	SpreadOpMul SpreadOp = "*" // A * B (Product / Cross rate)
)

// AlignmentMode determines how timestamp discrepancies are handled.
type AlignmentMode string

const (
	AlignIntersection AlignmentMode = "inner" // Only timestamps present in both series
	AlignForwardFill  AlignmentMode = "outer" // All timestamps; carry forward prior close
)

// SpreadSub performs contiguous vector subtraction a[i] - b[i].
func SpreadSub(a, b []float64) []float64 {
	n := min(len(a), len(b))
	out := make([]float64, n)
	for i := 0; i < n; i++ {
		out[i] = a[i] - b[i]
	}
	return out
}

// SpreadAdd performs contiguous vector addition a[i] + b[i].
func SpreadAdd(a, b []float64) []float64 {
	n := min(len(a), len(b))
	out := make([]float64, n)
	for i := 0; i < n; i++ {
		out[i] = a[i] + b[i]
	}
	return out
}

// SpreadDiv performs contiguous vector division a[i] / b[i] with zero-division safety.
func SpreadDiv(a, b []float64) []float64 {
	n := min(len(a), len(b))
	out := make([]float64, n)
	for i := 0; i < n; i++ {
		if b[i] == 0 || math.IsNaN(b[i]) {
			out[i] = math.NaN()
		} else {
			out[i] = a[i] / b[i]
		}
	}
	return out
}

// SpreadMul performs contiguous vector multiplication a[i] * b[i].
func SpreadMul(a, b []float64) []float64 {
	n := min(len(a), len(b))
	out := make([]float64, n)
	for i := 0; i < n; i++ {
		out[i] = a[i] * b[i]
	}
	return out
}

// LinearCombination computes sum(w[k] * series[k][i]) across multiple time-series vectors.
func LinearCombination(series [][]float64, weights []float64) []float64 {
	if len(series) == 0 || len(series) != len(weights) {
		return nil
	}
	minLen := len(series[0])
	for _, s := range series[1:] {
		if len(s) < minLen {
			minLen = len(s)
		}
	}

	out := make([]float64, minLen)
	for i := 0; i < minLen; i++ {
		var sum float64
		for k := range series {
			sum += weights[k] * series[k][i]
		}
		out[i] = sum
	}
	return out
}

func isSortedUniqueCandles(candles []Candle) bool {
	for i := 1; i < len(candles); i++ {
		if candles[i].Time <= candles[i-1].Time {
			return false
		}
	}
	return true
}

func computeSpreadCandle(t int64, ca, cb Candle, op SpreadOp) (Candle, bool) {
	synth := Candle{Time: t}

	switch op {
	case SpreadOpSub:
		synth.Open = ca.Open - cb.Open
		synth.Close = ca.Close - cb.Close
		hDiff := ca.High - cb.Low
		lDiff := ca.Low - cb.High
		synth.High = math.Max(synth.Open, math.Max(synth.Close, hDiff))
		synth.Low = math.Min(synth.Open, math.Min(synth.Close, lDiff))
		synth.Volume = ca.Volume + cb.Volume

	case SpreadOpDiv:
		if cb.Open == 0 || cb.Close == 0 || cb.Low == 0 || cb.High == 0 || (cb.Low <= 0 && cb.High >= 0) {
			return Candle{}, false
		}
		synth.Open = ca.Open / cb.Open
		synth.Close = ca.Close / cb.Close
		r1 := ca.High / cb.High
		r2 := ca.High / cb.Low
		r3 := ca.Low / cb.High
		r4 := ca.Low / cb.Low
		maxR := math.Max(r1, math.Max(r2, math.Max(r3, r4)))
		minR := math.Min(r1, math.Min(r2, math.Min(r3, r4)))
		synth.High = math.Max(synth.Open, math.Max(synth.Close, maxR))
		synth.Low = math.Min(synth.Open, math.Min(synth.Close, minR))
		synth.Volume = ca.Volume

	case SpreadOpAdd:
		synth.Open = ca.Open + cb.Open
		synth.Close = ca.Close + cb.Close
		synth.High = math.Max(synth.Open, math.Max(synth.Close, ca.High+cb.High))
		synth.Low = math.Min(synth.Open, math.Min(synth.Close, ca.Low+cb.Low))
		synth.Volume = ca.Volume + cb.Volume

	case SpreadOpMul:
		synth.Open = ca.Open * cb.Open
		synth.Close = ca.Close * cb.Close
		p1 := ca.High * cb.High
		p2 := ca.High * cb.Low
		p3 := ca.Low * cb.High
		p4 := ca.Low * cb.Low
		maxP := math.Max(p1, math.Max(p2, math.Max(p3, p4)))
		minP := math.Min(p1, math.Min(p2, math.Min(p3, p4)))
		synth.High = math.Max(synth.Open, math.Max(synth.Close, maxP))
		synth.Low = math.Min(synth.Open, math.Min(synth.Close, minP))
		synth.Volume = ca.Volume
	}

	// Enforce candle geometric invariant: High >= Low, High >= max(Open, Close), Low <= min(Open, Close)
	if synth.High < synth.Low {
		synth.High, synth.Low = synth.Low, synth.High
	}

	if math.IsNaN(synth.Open) || math.IsNaN(synth.High) || math.IsNaN(synth.Low) || math.IsNaN(synth.Close) ||
		math.IsInf(synth.Open, 0) || math.IsInf(synth.High, 0) || math.IsInf(synth.Low, 0) || math.IsInf(synth.Close, 0) {
		return Candle{}, false
	}

	return synth, true
}

// SynthesizeSpreadCandles combines two candle series into synthetic OHLCV bars
// using a linear two-pointer merge over sorted candle slices.
func SynthesizeSpreadCandles(a, b []Candle, op SpreadOp, mode AlignmentMode) []Candle {
	if len(a) == 0 || len(b) == 0 {
		return nil
	}

	if !isSortedUniqueCandles(a) {
		a = deduplicateAndSort(a)
	}
	if !isSortedUniqueCandles(b) {
		b = deduplicateAndSort(b)
	}

	if mode == AlignIntersection {
		out := make([]Candle, 0, min(len(a), len(b)))
		i, j := 0, 0
		for i < len(a) && j < len(b) {
			if a[i].Time < b[j].Time {
				i++
				continue
			}
			if b[j].Time < a[i].Time {
				j++
				continue
			}
			if synth, ok := computeSpreadCandle(a[i].Time, a[i], b[j], op); ok {
				out = append(out, synth)
			}
			i++
			j++
		}
		return out
	}

	// AlignForwardFill: linear merge over union of timestamps
	out := make([]Candle, 0, max(len(a), len(b)))
	i, j := 0, 0
	var hasLastA, hasLastB bool
	var lastAClose, lastBClose float64

	for i < len(a) || j < len(b) {
		var t int64
		var ca, cb Candle
		var hasA, hasB bool

		if i < len(a) && (j >= len(b) || a[i].Time < b[j].Time) {
			ca = a[i]
			t = ca.Time
			lastAClose = ca.Close
			hasLastA = true
			hasA = true
			i++
			if hasLastB {
				cb = Candle{Time: t, Open: lastBClose, High: lastBClose, Low: lastBClose, Close: lastBClose, Volume: 0}
				hasB = true
			}
		} else if j < len(b) && (i >= len(a) || b[j].Time < a[i].Time) {
			cb = b[j]
			t = cb.Time
			lastBClose = cb.Close
			hasLastB = true
			hasB = true
			j++
			if hasLastA {
				ca = Candle{Time: t, Open: lastAClose, High: lastAClose, Low: lastAClose, Close: lastAClose, Volume: 0}
				hasA = true
			}
		} else {
			ca = a[i]
			cb = b[j]
			t = ca.Time
			lastAClose = ca.Close
			lastBClose = cb.Close
			hasLastA = true
			hasLastB = true
			hasA = true
			hasB = true
			i++
			j++
		}

		if !hasA || !hasB {
			continue
		}
		if synth, ok := computeSpreadCandle(t, ca, cb, op); ok {
			out = append(out, synth)
		}
	}

	return out
}
