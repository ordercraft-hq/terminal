package scripting

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/ordercraft-hq/terminal/internal/indicators/wickra"
)

// ============================================================================
// CHALLENGE SUITE 1: MathStoch Comprehensive Stress Testing
// Verifies: Linear, Sine Wave, Flat Market, Random Walk
// Invariants: Zero NaN after warmup, Non-empty plots, Exact 1e-6 match against oracle
// ============================================================================

func TestChallenger_MathStoch_LinearSequence(t *testing.T) {
	n := 60
	candles := make([]wickra.CandleData, n)
	baseTime := int64(1700000000)

	// Linear sequence: C_i = 100 + i, H_i = 102 + i, L_i = 98 + i
	for i := 0; i < n; i++ {
		candles[i] = wickra.CandleData{
			Time:  baseTime + int64(i*60),
			Close: 100.0 + float64(i),
			Open:  100.0 + float64(i),
			High:  102.0 + float64(i),
			Low:   98.0 + float64(i),
		}
	}

	// Analytical formula derivation:
	// Window size = 14 (periodK). For any window [i-13 .. i] (i >= 13):
	// Max High = 102 + i
	// Min Low = 98 + (i - 13) = 85 + i
	// Range = (102 + i) - (85 + i) = 17.0
	// Close[i] - Min Low = (100 + i) - (85 + i) = 15.0
	// kRaw = (15 / 17) * 100 = 1500 / 17 ≈ 88.2352941176...
	//
	// Smooth (%K) = SMA(kRaw, 3):
	// First valid kRaw is at index 13.
	// SMA(3) warmup needs 3 valid values (indices 13, 14, 15).
	// Therefore, first valid %K is at index 13 + 3 - 1 = 15.
	// For all i >= 15, %K = 1500 / 17.
	//
	// %D = SMA(%K, 3):
	// First valid %K is at index 15.
	// SMA(3) warmup needs 3 valid values (indices 15, 16, 17).
	// Therefore, first valid %D is at index 15 + 3 - 1 = 17.
	// For all i >= 17, %D = 1500 / 17.
	expectedVal := 1500.0 / 17.0

	// 1. Test via Starlark Engine
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	script := `
def main(ctx):
    stoch = ta.stoch(ctx.high, ctx.low, ctx.close, 14, 3, 3)
    return [
        plot.line(stoch.k, title="K"),
        plot.line(stoch.d, title="D")
    ]
`
	engine := NewEngine(nil)
	res, err := engine.Eval(context.Background(), script, sCtx, nil)
	if err != nil {
		t.Fatalf("Engine.Eval failed: %v", err)
	}

	kPlots := res.Plots["plot_0"]
	dPlots := res.Plots["plot_1"]

	if len(kPlots) != n-15 {
		t.Fatalf("expected %d points for K plot, got %d", n-15, len(kPlots))
	}
	if len(dPlots) != n-17 {
		t.Fatalf("expected %d points for D plot, got %d", n-17, len(dPlots))
	}

	for idx, pt := range kPlots {
		bar := idx + 15
		if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
			t.Fatalf("K plot contains NaN/Inf at bar %d", bar)
		}
		if math.Abs(pt.Value-expectedVal) > 1e-6 {
			t.Errorf("K bar %d: expected %f, got %f", bar, expectedVal, pt.Value)
		}
	}

	for idx, pt := range dPlots {
		bar := idx + 17
		if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
			t.Fatalf("D plot contains NaN/Inf at bar %d", bar)
		}
		if math.Abs(pt.Value-expectedVal) > 1e-6 {
			t.Errorf("D bar %d: expected %f, got %f", bar, expectedVal, pt.Value)
		}
	}

	// 2. Direct Vector Verification
	highs := make([]float64, n)
	lows := make([]float64, n)
	closes := make([]float64, n)
	for i := 0; i < n; i++ {
		highs[i] = candles[i].High
		lows[i] = candles[i].Low
		closes[i] = candles[i].Close
	}

	kVec, dVec := MathStoch(highs, lows, closes, 14, 3, 3)

	// Verify warmup NaN boundaries strictly
	for i := 0; i < 15; i++ {
		if !math.IsNaN(kVec[i]) {
			t.Errorf("kVec[%d] must be NaN, got %f", i, kVec[i])
		}
	}
	for i := 15; i < n; i++ {
		if math.IsNaN(kVec[i]) {
			t.Fatalf("kVec[%d] must NOT be NaN after warmup", i)
		}
		if math.Abs(kVec[i]-expectedVal) > 1e-6 {
			t.Errorf("kVec[%d]: expected %f, got %f", i, expectedVal, kVec[i])
		}
	}

	for i := 0; i < 17; i++ {
		if !math.IsNaN(dVec[i]) {
			t.Errorf("dVec[%d] must be NaN, got %f", i, dVec[i])
		}
	}
	for i := 17; i < n; i++ {
		if math.IsNaN(dVec[i]) {
			t.Fatalf("dVec[%d] must NOT be NaN after warmup", i)
		}
		if math.Abs(dVec[i]-expectedVal) > 1e-6 {
			t.Errorf("dVec[%d]: expected %f, got %f", i, expectedVal, dVec[i])
		}
	}
}

func TestChallenger_MathStoch_SineWaveSequence(t *testing.T) {
	n := 100
	candles := make([]wickra.CandleData, n)
	highs := make([]float64, n)
	lows := make([]float64, n)
	closes := make([]float64, n)
	baseTime := int64(1700000000)

	// Sine wave oscillation
	for i := 0; i < n; i++ {
		c := 100.0 + 10.0*math.Sin(2.0*math.Pi*float64(i)/20.0)
		h := c + 2.0
		l := c - 2.0
		candles[i] = wickra.CandleData{
			Time:  baseTime + int64(i*60),
			Close: c,
			Open:  c,
			High:  h,
			Low:   l,
		}
		highs[i] = h
		lows[i] = l
		closes[i] = c
	}

	// Build analytical independent oracle:
	periodK, periodD, smooth := 14, 3, 3
	oracleKRaw := make([]float64, n)
	for i := range oracleKRaw {
		oracleKRaw[i] = math.NaN()
	}
	for i := periodK - 1; i < n; i++ {
		h := highs[i]
		l := lows[i]
		for j := 1; j < periodK; j++ {
			if highs[i-j] > h {
				h = highs[i-j]
			}
			if lows[i-j] < l {
				l = lows[i-j]
			}
		}
		rng := h - l
		if rng > 1e-12 {
			oracleKRaw[i] = ((closes[i] - l) / rng) * 100.0
		} else {
			oracleKRaw[i] = 50.0
		}
	}

	// Oracle smoothed %K
	oracleK := make([]float64, n)
	for i := range oracleK {
		oracleK[i] = math.NaN()
	}
	// First valid kRaw is at periodK - 1 (13)
	// smooth 3 needs indices 13, 14, 15
	for i := periodK - 1 + smooth - 1; i < n; i++ {
		var sum float64
		for j := 0; j < smooth; j++ {
			sum += oracleKRaw[i-j]
		}
		oracleK[i] = sum / float64(smooth)
	}

	// Oracle %D
	oracleD := make([]float64, n)
	for i := range oracleD {
		oracleD[i] = math.NaN()
	}
	// First valid %K is at 15. periodD 3 needs indices 15, 16, 17
	for i := periodK - 1 + smooth - 1 + periodD - 1; i < n; i++ {
		var sum float64
		for j := 0; j < periodD; j++ {
			sum += oracleK[i-j]
		}
		oracleD[i] = sum / float64(periodD)
	}

	kVec, dVec := MathStoch(highs, lows, closes, periodK, periodD, smooth)

	// Verify exact match against analytical oracle within 1e-6
	for i := 0; i < n; i++ {
		if math.IsNaN(oracleK[i]) {
			if !math.IsNaN(kVec[i]) {
				t.Fatalf("kVec[%d] expected NaN, got %f", i, kVec[i])
			}
		} else {
			if math.IsNaN(kVec[i]) {
				t.Fatalf("kVec[%d] unexpected NaN after warmup", i)
			}
			if math.Abs(kVec[i]-oracleK[i]) > 1e-6 {
				t.Errorf("kVec[%d]: oracle %f, got %f", i, oracleK[i], kVec[i])
			}
		}

		if math.IsNaN(oracleD[i]) {
			if !math.IsNaN(dVec[i]) {
				t.Fatalf("dVec[%d] expected NaN, got %f", i, dVec[i])
			}
		} else {
			if math.IsNaN(dVec[i]) {
				t.Fatalf("dVec[%d] unexpected NaN after warmup", i)
			}
			if math.Abs(dVec[i]-oracleD[i]) > 1e-6 {
				t.Errorf("dVec[%d]: oracle %f, got %f", i, oracleD[i], dVec[i])
			}
		}
	}

	// Starlark Engine test on Sine Wave
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	script := `
def main(ctx):
    stoch = ta.stoch(ctx.high, ctx.low, ctx.close, 14, 3, 3)
    return [
        plot.line(stoch.k, title="K"),
        plot.line(stoch.d, title="D")
    ]
`
	engine := NewEngine(nil)
	res, err := engine.Eval(context.Background(), script, sCtx, nil)
	if err != nil {
		t.Fatalf("Engine.Eval failed: %v", err)
	}
	if len(res.Plots["plot_0"]) != n-15 {
		t.Errorf("expected %d K points, got %d", n-15, len(res.Plots["plot_0"]))
	}
	if len(res.Plots["plot_1"]) != n-17 {
		t.Errorf("expected %d D points, got %d", n-17, len(res.Plots["plot_1"]))
	}
}

func TestChallenger_MathStoch_FlatMarketSequence(t *testing.T) {
	n := 40
	candles := make([]wickra.CandleData, n)
	highs := make([]float64, n)
	lows := make([]float64, n)
	closes := make([]float64, n)
	baseTime := int64(1700000000)

	// Completely flat market: High == Low == Close
	for i := 0; i < n; i++ {
		candles[i] = wickra.CandleData{
			Time:  baseTime + int64(i*60),
			Close: 50000.0,
			Open:  50000.0,
			High:  50000.0,
			Low:   50000.0,
		}
		highs[i] = 50000.0
		lows[i] = 50000.0
		closes[i] = 50000.0
	}

	kVec, dVec := MathStoch(highs, lows, closes, 14, 3, 3)

	// In flat market, rng = 0.0 <= 1e-12, kRaw = 50.0 fallback
	// Warmup: indices 0..14 for K are NaN, 0..16 for D are NaN
	for i := 0; i < 15; i++ {
		if !math.IsNaN(kVec[i]) {
			t.Errorf("kVec[%d] expected NaN, got %f", i, kVec[i])
		}
	}
	for i := 15; i < n; i++ {
		if math.IsNaN(kVec[i]) {
			t.Fatalf("kVec[%d] unexpected NaN in flat market", i)
		}
		if math.Abs(kVec[i]-50.0) > 1e-6 {
			t.Errorf("kVec[%d]: expected 50.0, got %f", i, kVec[i])
		}
	}

	for i := 0; i < 17; i++ {
		if !math.IsNaN(dVec[i]) {
			t.Errorf("dVec[%d] expected NaN, got %f", i, dVec[i])
		}
	}
	for i := 17; i < n; i++ {
		if math.IsNaN(dVec[i]) {
			t.Fatalf("dVec[%d] unexpected NaN in flat market", i)
		}
		if math.Abs(dVec[i]-50.0) > 1e-6 {
			t.Errorf("dVec[%d]: expected 50.0, got %f", i, dVec[i])
		}
	}

	// Verify Starlark evaluation produces non-empty plots
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	script := `
def main(ctx):
    stoch = ta.stoch(ctx.high, ctx.low, ctx.close, 14, 3, 3)
    return [
        plot.line(stoch.k, title="K"),
        plot.line(stoch.d, title="D")
    ]
`
	engine := NewEngine(nil)
	res, err := engine.Eval(context.Background(), script, sCtx, nil)
	if err != nil {
		t.Fatalf("Eval failed: %v", err)
	}
	if len(res.Plots["plot_0"]) != n-15 {
		t.Errorf("expected %d K points in flat market, got %d", n-15, len(res.Plots["plot_0"]))
	}
	if len(res.Plots["plot_1"]) != n-17 {
		t.Errorf("expected %d D points in flat market, got %d", n-17, len(res.Plots["plot_1"]))
	}
}

func TestChallenger_MathStoch_RandomWalkSequence(t *testing.T) {
	n := 200
	candles := make([]wickra.CandleData, n)
	highs := make([]float64, n)
	lows := make([]float64, n)
	closes := make([]float64, n)
	baseTime := int64(1700000000)

	rnd := rand.New(rand.NewSource(1337))
	price := 1000.0

	for i := 0; i < n; i++ {
		delta := (rnd.Float64() - 0.49) * 10.0
		price += delta
		spread := rnd.Float64()*5.0 + 0.1
		h := price + spread
		l := price - spread
		candles[i] = wickra.CandleData{
			Time:  baseTime + int64(i*60),
			Close: price,
			Open:  price - delta*0.5,
			High:  h,
			Low:   l,
		}
		highs[i] = h
		lows[i] = l
		closes[i] = price
	}

	kVec, dVec := MathStoch(highs, lows, closes, 14, 3, 3)

	// Verifications:
	// 1. Exact warmup boundaries
	for i := 0; i < 15; i++ {
		if !math.IsNaN(kVec[i]) {
			t.Errorf("kVec[%d] expected NaN, got %f", i, kVec[i])
		}
	}
	for i := 0; i < 17; i++ {
		if !math.IsNaN(dVec[i]) {
			t.Errorf("dVec[%d] expected NaN, got %f", i, dVec[i])
		}
	}

	// 2. Zero NaNs and value range [0, 100]
	for i := 15; i < n; i++ {
		if math.IsNaN(kVec[i]) {
			t.Fatalf("kVec[%d] contains NaN in random walk", i)
		}
		if kVec[i] < -1e-6 || kVec[i] > 100.0+1e-6 {
			t.Errorf("kVec[%d] out of bounds [0, 100]: %f", i, kVec[i])
		}
	}
	for i := 17; i < n; i++ {
		if math.IsNaN(dVec[i]) {
			t.Fatalf("dVec[%d] contains NaN in random walk", i)
		}
		if dVec[i] < -1e-6 || dVec[i] > 100.0+1e-6 {
			t.Errorf("dVec[%d] out of bounds [0, 100]: %f", i, dVec[i])
		}
	}

	// 3. Starlark evaluation
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	script := `
def main(ctx):
    stoch = ta.stoch(ctx.high, ctx.low, ctx.close, 14, 3, 3)
    return [
        plot.line(stoch.k, title="K"),
        plot.line(stoch.d, title="D")
    ]
`
	engine := NewEngine(nil)
	res, err := engine.Eval(context.Background(), script, sCtx, nil)
	if err != nil {
		t.Fatalf("Eval failed: %v", err)
	}
	if len(res.Plots["plot_0"]) != n-15 {
		t.Errorf("expected %d K points in random walk, got %d", n-15, len(res.Plots["plot_0"]))
	}
	if len(res.Plots["plot_1"]) != n-17 {
		t.Errorf("expected %d D points in random walk, got %d", n-17, len(res.Plots["plot_1"]))
	}
}

// ============================================================================
// CHALLENGE SUITE 2: Chained Indicator Stress Testing
// Verifies:
// 1. ta.sma(ta.sma(data, 5), 5) -> exact 8 warmup bars
// 2. ta.ema(ta.rsi(data, 14), 9) -> valid after warmup without NaN poisoning
// 3. Triple chained: ta.sma(ta.sma(ta.sma(data, 3), 3), 3) -> zero NaN poisoning
// ============================================================================

func TestChallenger_ChainedIndicators_SmaOfSma(t *testing.T) {
	n := 30
	candles := make([]wickra.CandleData, n)
	closes := make([]float64, n)
	baseTime := int64(1700000000)

	for i := 0; i < n; i++ {
		c := 200.0 + float64(i)*3.0
		candles[i] = wickra.CandleData{
			Time:  baseTime + int64(i*60),
			Close: c,
			Open:  c,
			High:  c + 1.0,
			Low:   c - 1.0,
		}
		closes[i] = c
	}

	// First SMA(5): Needs 5 elements [0..4] -> first valid at index 4 (4 warmup bars)
	// Second SMA(5): First valid element in input is at index 4.
	// Needs 5 valid elements [4..8] -> first valid at index 4 + 5 - 1 = 8 (8 warmup bars: 0..7)
	//
	// Analytical formula for linear series C[i] = 200 + 3*i:
	// SMA(C, 5)[i] = C[i-2] = 200 + 3*(i - 2)
	// SMA(SMA(C, 5), 5)[i] = SMA(C, 5)[i-2] = 200 + 3*(i - 4) = 200 + 3*i - 12
	sma1 := MathSMA(closes, 5)
	sma2 := MathSMA(sma1, 5)

	// Strict verification of warmup bars
	for i := 0; i < 8; i++ {
		if !math.IsNaN(sma2[i]) {
			t.Fatalf("sma2[%d] must be NaN during warmup, got %f", i, sma2[i])
		}
	}

	for i := 8; i < n; i++ {
		if math.IsNaN(sma2[i]) {
			t.Fatalf("sma2[%d] unexpected NaN after warmup", i)
		}
		expected := 200.0 + 3.0*float64(i-4)
		if math.Abs(sma2[i]-expected) > 1e-6 {
			t.Errorf("sma2[%d]: expected %f, got %f", i, expected, sma2[i])
		}
	}

	// Verify in Starlark runtime
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	script := `
def main(ctx):
    mma = ta.sma(ta.sma(ctx.close, 5), 5)
    return [plot.line(mma, title="SMA of SMA")]
`
	engine := NewEngine(nil)
	res, err := engine.Eval(context.Background(), script, sCtx, nil)
	if err != nil {
		t.Fatalf("Eval failed: %v", err)
	}
	plots := res.Plots["plot_0"]
	if len(plots) != n-8 {
		t.Fatalf("expected exactly %d points after 8 warmup bars, got %d", n-8, len(plots))
	}
	for idx, pt := range plots {
		i := idx + 8
		expected := 200.0 + 3.0*float64(i-4)
		if math.Abs(pt.Value-expected) > 1e-6 {
			t.Errorf("plot point %d (bar %d): expected %f, got %f", idx, i, expected, pt.Value)
		}
	}
}

func TestChallenger_ChainedIndicators_EmaOfRsi(t *testing.T) {
	n := 50
	candles := make([]wickra.CandleData, n)
	closes := make([]float64, n)
	baseTime := int64(1700000000)

	// Alternating upward pattern:
	for i := 0; i < n; i++ {
		c := 100.0 + float64(i)*1.5 + float64(i%3)*0.5
		candles[i] = wickra.CandleData{
			Time:  baseTime + int64(i*60),
			Close: c,
			Open:  c,
			High:  c + 2.0,
			Low:   c - 2.0,
		}
		closes[i] = c
	}

	rsi := MathRSI(closes, 14)
	emaRsi := MathEMA(rsi, 9)

	// Warmup proof:
	// MathRSI(14): index 0..13 are NaN, first valid is at index 14.
	// MathEMA(9): receives slice with firstValid = 14.
	// Initial warmup SMA over [14 .. 14+9-1] = [14 .. 22].
	// First valid EMA output is at index 22.
	// Indices 0..21 are NaN.
	for i := 0; i < 22; i++ {
		if !math.IsNaN(emaRsi[i]) {
			t.Fatalf("emaRsi[%d] must be NaN during warmup, got %f", i, emaRsi[i])
		}
	}

	// Zero NaN poisoning after warmup
	for i := 22; i < n; i++ {
		if math.IsNaN(emaRsi[i]) {
			t.Fatalf("emaRsi[%d] unexpected NaN after warmup", i)
		}
		if emaRsi[i] < 0.0 || emaRsi[i] > 100.0 {
			t.Errorf("emaRsi[%d] out of bounds [0, 100]: %f", i, emaRsi[i])
		}
	}

	// Verify step-by-step recurrence match within 1e-6
	var sum float64
	for i := 14; i <= 22; i++ {
		sum += rsi[i]
	}
	expectedWarmup := sum / 9.0
	if math.Abs(emaRsi[22]-expectedWarmup) > 1e-6 {
		t.Errorf("emaRsi[22] warmup SMA mismatch: expected %f, got %f", expectedWarmup, emaRsi[22])
	}

	alpha := 2.0 / (9.0 + 1.0)
	prev := expectedWarmup
	for i := 23; i < n; i++ {
		expected := alpha*rsi[i] + (1.0-alpha)*prev
		if math.Abs(emaRsi[i]-expected) > 1e-6 {
			t.Errorf("emaRsi[%d] recurrence mismatch: expected %f, got %f", i, expected, emaRsi[i])
		}
		prev = expected
	}

	// Starlark Engine verification
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	script := `
def main(ctx):
    ind = ta.ema(ta.rsi(ctx.close, 14), 9)
    return [plot.line(ind, title="EMA of RSI")]
`
	engine := NewEngine(nil)
	res, err := engine.Eval(context.Background(), script, sCtx, nil)
	if err != nil {
		t.Fatalf("Eval failed: %v", err)
	}
	plots := res.Plots["plot_0"]
	if len(plots) != n-22 {
		t.Fatalf("expected %d points, got %d", n-22, len(plots))
	}
	for idx, pt := range plots {
		i := idx + 22
		if math.Abs(pt.Value-emaRsi[i]) > 1e-6 {
			t.Errorf("plot[%d] value mismatch with vector: %f vs %f", idx, pt.Value, emaRsi[i])
		}
	}
}

func TestChallenger_ChainedIndicators_TripleSma(t *testing.T) {
	n := 35
	candles := make([]wickra.CandleData, n)
	closes := make([]float64, n)
	baseTime := int64(1700000000)

	// Linear series C[i] = 10 + i
	for i := 0; i < n; i++ {
		c := 10.0 + float64(i)
		candles[i] = wickra.CandleData{
			Time:  baseTime + int64(i*60),
			Close: c,
			Open:  c,
			High:  c + 0.5,
			Low:   c - 0.5,
		}
		closes[i] = c
	}

	// Chaining analysis:
	// SMA1(C, 3):
	//   firstValid = 0. Warmup = 3 - 1 = 2 bars.
	//   Indices 0..1 are NaN. Valid from index 2.
	//   SMA1[i] = C[i-1] = 10 + i - 1 for i >= 2.
	//
	// SMA2(SMA1, 3):
	//   firstValid = 2. Warmup = 2 + 3 - 1 = 4 bars.
	//   Indices 0..3 are NaN. Valid from index 4.
	//   SMA2[i] = SMA1[i-1] = 10 + i - 2 for i >= 4.
	//
	// SMA3(SMA2, 3):
	//   firstValid = 4. Warmup = 4 + 3 - 1 = 6 bars.
	//   Indices 0..5 are NaN. Valid from index 6.
	//   SMA3[i] = SMA2[i-1] = 10 + i - 3 for i >= 6.
	// Total warmup bars: exactly 6. Total valid points: 35 - 6 = 29.
	sma1 := MathSMA(closes, 3)
	sma2 := MathSMA(sma1, 3)
	sma3 := MathSMA(sma2, 3)

	for i := 0; i < 6; i++ {
		if !math.IsNaN(sma3[i]) {
			t.Fatalf("sma3[%d] must be NaN during warmup, got %f", i, sma3[i])
		}
	}

	for i := 6; i < n; i++ {
		if math.IsNaN(sma3[i]) {
			t.Fatalf("sma3[%d] unexpected NaN after warmup", i)
		}
		expected := 10.0 + float64(i-3)
		if math.Abs(sma3[i]-expected) > 1e-6 {
			t.Errorf("sma3[%d]: expected %f, got %f", i, expected, sma3[i])
		}
	}

	// Verify in Starlark Runtime
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	script := `
def main(ctx):
    triple = ta.sma(ta.sma(ta.sma(ctx.close, 3), 3), 3)
    return [plot.line(triple, title="Triple SMA")]
`
	engine := NewEngine(nil)
	res, err := engine.Eval(context.Background(), script, sCtx, nil)
	if err != nil {
		t.Fatalf("Eval failed: %v", err)
	}
	plots := res.Plots["plot_0"]
	if len(plots) != n-6 {
		t.Fatalf("expected %d points after 6 warmup bars, got %d", n-6, len(plots))
	}
	for idx, pt := range plots {
		i := idx + 6
		expected := 10.0 + float64(i-3)
		if math.Abs(pt.Value-expected) > 1e-6 {
			t.Errorf("plot point %d (bar %d): expected %f, got %f", idx, i, expected, pt.Value)
		}
	}
}

// ============================================================================
// CHALLENGE SUITE 3: Loopback Security Stress Testing
// Verifies:
// 1. Portless token network:127.0.0.1 is rejected
// 2. Portless token network:localhost is rejected
// 3. Exact matching port token network:127.0.0.1:<port> succeeds
// 4. Mismatched port token network:127.0.0.1:<wrong_port> is rejected
// ============================================================================

func TestChallenger_LoopbackSecurity_EngineHttpGating(t *testing.T) {
	// Start a local HTTP test server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","secret":"challenger_verified"}`))
	}))
	defer ts.Close()

	u, err := url.Parse(ts.URL)
	if err != nil {
		t.Fatalf("failed to parse test server url: %v", err)
	}
	port := u.Port()

	candles := createTestCandles(5)
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	engine := NewEngine(nil)

	script := fmt.Sprintf(`
def main(ctx):
    resp = ctx.http.get("%s")
    return []
`, ts.URL)

	// Challenge 1: Portless token network:127.0.0.1 MUST BE REJECTED
	_, err = engine.Eval(context.Background(), script, sCtx, []string{"network:127.0.0.1"})
	if err == nil {
		t.Fatalf("VULNERABILITY: HTTP GET with portless token network:127.0.0.1 was permitted")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission denied") {
		t.Errorf("expected permission denied error, got: %v", err)
	}

	// Challenge 2: Portless token network:localhost MUST BE REJECTED
	_, err = engine.Eval(context.Background(), script, sCtx, []string{"network:localhost"})
	if err == nil {
		t.Fatalf("VULNERABILITY: HTTP GET with portless token network:localhost was permitted")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission denied") {
		t.Errorf("expected permission denied error, got: %v", err)
	}

	// Challenge 3: Mismatched port token network:127.0.0.1:9999 MUST BE REJECTED
	_, err = engine.Eval(context.Background(), script, sCtx, []string{"network:127.0.0.1:9999"})
	if err == nil {
		t.Fatalf("VULNERABILITY: HTTP GET with mismatched port token was permitted")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission denied") {
		t.Errorf("expected permission denied error, got: %v", err)
	}

	// Challenge 4: Matching port token network:127.0.0.1:<port> MUST SUCCEED
	matchingToken := fmt.Sprintf("network:127.0.0.1:%s", port)
	res, err := engine.Eval(context.Background(), script, sCtx, []string{matchingToken})
	if err != nil {
		t.Fatalf("expected success with matching port token %s, got error: %v", matchingToken, err)
	}
	if res == nil {
		t.Fatalf("expected non-nil result from successful script evaluation")
	}

	// Challenge 5: Wildcard token "*" MUST SUCCEED
	res, err = engine.Eval(context.Background(), script, sCtx, []string{"*"})
	if err != nil {
		t.Fatalf("expected success with wildcard token, got error: %v", err)
	}
	if res == nil {
		t.Fatalf("expected non-nil result from wildcard script evaluation")
	}
}


// ============================================================================
// CHALLENGE SUITE 4: Adversarial Boundary & Stress Cases
// ============================================================================

func TestChallenger_MathStoch_BoundaryAndEdgeCases(t *testing.T) {
	// Case 1: Empty input
	k, d := MathStoch([]float64{}, []float64{}, []float64{}, 14, 3, 3)
	if len(k) != 0 || len(d) != 0 {
		t.Errorf("expected empty return for empty input, got %d, %d", len(k), len(d))
	}

	// Case 2: Short sequence (10 bars < periodK 14)
	shortH := make([]float64, 10)
	shortL := make([]float64, 10)
	shortC := make([]float64, 10)
	for i := 0; i < 10; i++ {
		shortH[i] = 100 + float64(i)
		shortL[i] = 90 + float64(i)
		shortC[i] = 95 + float64(i)
	}
	kShort, dShort := MathStoch(shortH, shortL, shortC, 14, 3, 3)
	for i := 0; i < 10; i++ {
		if !math.IsNaN(kShort[i]) {
			t.Errorf("kShort[%d] should be NaN, got %f", i, kShort[i])
		}
		if !math.IsNaN(dShort[i]) {
			t.Errorf("dShort[%d] should be NaN, got %f", i, dShort[i])
		}
	}

	// Case 3: smooth = 1, periodD = 1 (Fast raw stochastic)
	n := 20
	linH := make([]float64, n)
	linL := make([]float64, n)
	linC := make([]float64, n)
	for i := 0; i < n; i++ {
		linH[i] = 100 + float64(i)
		linL[i] = 90 + float64(i)
		linC[i] = 95 + float64(i)
	}
	kFast, dFast := MathStoch(linH, linL, linC, 14, 1, 1)
	// For periodK=14, first valid raw is index 13. With smooth=1, periodD=1, valid from index 13!
	for i := 0; i < 13; i++ {
		if !math.IsNaN(kFast[i]) || !math.IsNaN(dFast[i]) {
			t.Errorf("bar %d should be NaN for fast stoch", i)
		}
	}
	for i := 13; i < n; i++ {
		if math.IsNaN(kFast[i]) || math.IsNaN(dFast[i]) {
			t.Fatalf("bar %d should NOT be NaN for fast stoch", i)
		}
	}
}

func TestChallenger_VectorMAs_AllNaNAndEmptyInputs(t *testing.T) {
	// 1. Empty slices
	if len(MathSMA([]float64{}, 5)) != 0 {
		t.Errorf("MathSMA empty failed")
	}
	if len(MathEMA([]float64{}, 5)) != 0 {
		t.Errorf("MathEMA empty failed")
	}
	if len(MathRMA([]float64{}, 5)) != 0 {
		t.Errorf("MathRMA empty failed")
	}
	if len(MathRSI([]float64{}, 14)) != 0 {
		t.Errorf("MathRSI empty failed")
	}

	// 2. All-NaN slices
	allNaN := []float64{math.NaN(), math.NaN(), math.NaN(), math.NaN(), math.NaN()}
	smaNaN := MathSMA(allNaN, 3)
	for i, v := range smaNaN {
		if !math.IsNaN(v) {
			t.Errorf("smaNaN[%d] expected NaN, got %f", i, v)
		}
	}
	emaNaN := MathEMA(allNaN, 3)
	for i, v := range emaNaN {
		if !math.IsNaN(v) {
			t.Errorf("emaNaN[%d] expected NaN, got %f", i, v)
		}
	}
	rmaNaN := MathRMA(allNaN, 3)
	for i, v := range rmaNaN {
		if !math.IsNaN(v) {
			t.Errorf("rmaNaN[%d] expected NaN, got %f", i, v)
		}
	}
	rsiNaN := MathRSI(allNaN, 3)
	for i, v := range rsiNaN {
		if !math.IsNaN(v) {
			t.Errorf("rsiNaN[%d] expected NaN, got %f", i, v)
		}
	}

	// 3. Constant downward series for RSI -> must be 0.0
	n := 30
	downSeries := make([]float64, n)
	for i := 0; i < n; i++ {
		downSeries[i] = 1000.0 - float64(i)*10.0
	}
	rsiDown := MathRSI(downSeries, 14)
	for i := 0; i < 14; i++ {
		if !math.IsNaN(rsiDown[i]) {
			t.Errorf("rsiDown[%d] expected NaN during warmup, got %f", i, rsiDown[i])
		}
	}
	for i := 14; i < n; i++ {
		if math.IsNaN(rsiDown[i]) {
			t.Fatalf("rsiDown[%d] unexpected NaN after warmup", i)
		}
		if math.Abs(rsiDown[i]-0.0) > 1e-6 {
			t.Errorf("rsiDown[%d] expected 0.0, got %f", i, rsiDown[i])
		}
	}
}
