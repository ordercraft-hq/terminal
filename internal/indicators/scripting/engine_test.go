package scripting

import (
	"context"
	"math"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/ordercraft-hq/terminal/internal/indicators/wickra"
)

func createTestCandles(n int) []wickra.CandleData {
	candles := make([]wickra.CandleData, n)
	baseTime := int64(1700000000)
	basePrice := 100.0

	for i := 0; i < n; i++ {
		trend := float64(i) * 0.5
		sinVal := math.Sin(float64(i)*0.2) * 2.0
		closePrice := basePrice + trend + sinVal

		candles[i] = wickra.CandleData{
			Time:   baseTime + int64(i*60),
			Open:   closePrice - 0.5,
			High:   closePrice + 1.0,
			Low:    closePrice - 1.0,
			Close:  closePrice,
			Volume: 100.0 + float64(i%10)*10.0,
		}
	}
	return candles
}

func TestEngineBasicEval(t *testing.T) {
	candles := createTestCandles(50)
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)

	script := `
def main(ctx):
    fast = ta.sma(ctx.close, 10)
    slow = ta.ema(ctx.close, 20)
    print("Computed fast and slow moving averages")
    return [
        plot.line(fast, color="#2962FF", title="SMA 10"),
        plot.line(slow, color="#FF9800", title="EMA 20"),
    ]
`
	engine := NewEngine(nil)
	res, err := engine.Eval(context.Background(), script, sCtx, nil)
	if err != nil {
		t.Fatalf("Eval failed: %v", err)
	}

	if len(res.Directives) != 2 {
		t.Fatalf("expected 2 directives, got %d", len(res.Directives))
	}

	if len(res.Plots["plot_0"]) == 0 || len(res.Plots["plot_1"]) == 0 {
		t.Fatalf("expected non-empty plots, got %d and %d", len(res.Plots["plot_0"]), len(res.Plots["plot_1"]))
	}

	if len(res.Logs) != 1 || !strings.Contains(res.Logs[0], "Computed fast and slow") {
		t.Errorf("expected print log, got %v", res.Logs)
	}
}

func TestEngineOrderflowAndBands(t *testing.T) {
	candles := createTestCandles(60)
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "5m", candles)

	script := `
def main(ctx):
    delta = ctx.orderflow.delta
    cvd = ctx.orderflow.cum_delta
    bb = ta.bollinger(ctx.close, 20, 2.0)
    return [
        plot.band(bb.upper, bb.lower, fill_color="rgba(41, 98, 255, 0.2)", title="BB Band"),
        plot.histogram(delta, color="#089981", color_down="#F23645", title="Delta"),
        plot.line(cvd, color="#FFD700", title="CVD")
    ]
`
	engine := NewEngine(nil)
	res, err := engine.Eval(context.Background(), script, sCtx, nil)
	if err != nil {
		t.Fatalf("Eval failed: %v", err)
	}

	if len(res.Bands) != 1 {
		t.Fatalf("expected 1 band directive, got %d", len(res.Bands))
	}
	if len(res.Plots["plot_0_upper"]) == 0 || len(res.Plots["plot_0_lower"]) == 0 {
		t.Errorf("band plots empty")
	}
}

func TestEngineTimeoutEnforcement(t *testing.T) {
	candles := createTestCandles(20)
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)

	// Infinite / expensive loop
	script := `
def main(ctx):
    x = 0
    for i in range(10000000):
        x += i
    return []
`
	engine := NewEngine(nil)
	start := time.Now()
	_, err := engine.Eval(context.Background(), script, sCtx, nil)
	elapsed := time.Since(start)

	if err == nil {
		t.Fatalf("expected timeout error, got nil")
	}
	// Must terminate within ~300ms including context cancel and step limits
	if elapsed > 1*time.Second {
		t.Errorf("timeout took too long: %v", elapsed)
	}
}

func TestEngineScriptSizeLimit(t *testing.T) {
	candles := createTestCandles(5)
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)

	// Script over 64KB
	hugeScript := "def main(ctx):\n    x = 1\n" + strings.Repeat("# padding line comment here\n", 3000)

	engine := NewEngine(nil)
	_, err := engine.Eval(context.Background(), hugeScript, sCtx, nil)
	if err == nil || !strings.Contains(err.Error(), "exceeds 64KB limit") {
		t.Fatalf("expected script size limit error, got %v", err)
	}
}

func TestEngineHermeticImportsBlocked(t *testing.T) {
	candles := createTestCandles(5)
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)

	script := `
load("os", "system")
def main(ctx):
    return []
`
	engine := NewEngine(nil)
	_, err := engine.Eval(context.Background(), script, sCtx, nil)
	if err == nil {
		t.Fatalf("expected error loading external module, got nil")
	}
}

func TestEngineHttpCapabilityGating(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"price": 50000.0}`))
	}))
	defer ts.Close()

	u, _ := url.Parse(ts.URL)
	token := "network:" + u.Host

	candles := createTestCandles(10)
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)

	script := `
def main(ctx):
    data = ctx.http.get("` + ts.URL + `")
    print("Fetched price:", data["price"])
    return []
`
	engine := NewEngine(nil)

	// Without permission, must fail
	_, err := engine.Eval(context.Background(), script, sCtx, []string{})
	if err == nil || !strings.Contains(err.Error(), "permission denied") {
		t.Fatalf("expected permission denied without token, got %v", err)
	}

	// With token, must succeed
	res, err := engine.Eval(context.Background(), script, sCtx, []string{token})
	if err != nil {
		t.Fatalf("expected success with token, got %v", err)
	}
	if len(res.Logs) == 0 || !strings.Contains(res.Logs[0], "50000") {
		t.Errorf("expected log with price, got %v", res.Logs)
	}
}

func TestTAMathFunctions(t *testing.T) {
	data := []float64{10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20}

	// SMA(5) on index 4: (10+11+12+13+14)/5 = 12.0
	sma := MathSMA(data, 5)
	if math.Abs(sma[4]-12.0) > 1e-6 {
		t.Errorf("expected SMA 12.0, got %f", sma[4])
	}

	// RSI
	rsiData := make([]float64, 30)
	for i := range rsiData {
		rsiData[i] = 100.0 + float64(i)*2.0
	}
	rsi := MathRSI(rsiData, 14)
	if len(rsi) != 30 {
		t.Errorf("unexpected RSI length: %d", len(rsi))
	}
	// Pure uptrend RSI should be 100.0
	if math.Abs(rsi[25]-100.0) > 1e-4 {
		t.Errorf("expected RSI near 100 for continuous uptrend, got %f", rsi[25])
	}

	// Crossover
	a := []float64{1, 2, 5, 6}
	b := []float64{3, 3, 3, 3}
	// index 2: a[1]=2 <= b[1]=3 and a[2]=5 > b[2]=3 -> crossover = 1.0
	co := make([]float64, 4)
	for i := 1; i < 4; i++ {
		if a[i-1] <= b[i-1] && a[i] > b[i] {
			co[i] = 1.0
		}
	}
	if co[2] != 1.0 || co[3] != 0.0 {
		t.Errorf("unexpected crossover result: %v", co)
	}
}

// -----------------------------------------------------------------------------
// Tests for Stochastic and Chained Technical Indicators (Milestone 4 Iteration 2)
// -----------------------------------------------------------------------------

func TestMathStochNonEmpty(t *testing.T) {
	n := 30
	candles := make([]wickra.CandleData, n)
	baseTime := int64(1700000000)
	for i := 0; i < n; i++ {
		candles[i] = wickra.CandleData{
			Time:   baseTime + int64(i*60),
			Open:   92.0 + float64(i),
			High:   100.0 + float64(i),
			Low:    90.0 + float64(i),
			Close:  95.0 + float64(i),
			Volume: 1000.0,
		}
	}
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)

	script := `
def main(ctx):
    stoch = ta.stoch(ctx.high, ctx.low, ctx.close, 14, 3, 3)
    return [
        plot.line(stoch.k, title="Stoch K"),
        plot.line(stoch.d, title="Stoch D")
    ]
`
	engine := NewEngine(nil)
	res, err := engine.Eval(context.Background(), script, sCtx, nil)
	if err != nil {
		t.Fatalf("Eval failed: %v", err)
	}

	// Warmup geometry:
	// periodK=14 -> kRaw valid at index 13 (warmup bars 0..12)
	// smooth=3   -> k (%K) valid at index 13 + 3 - 1 = 15 (warmup bars 0..14) -> 30 - 15 = 15 points
	// periodD=3  -> d (%D) valid at index 15 + 3 - 1 = 17 (warmup bars 0..16) -> 30 - 17 = 13 points
	kPlots := res.Plots["plot_0"]
	dPlots := res.Plots["plot_1"]

	if len(kPlots) != 15 {
		t.Fatalf("expected 15 non-empty %%K points after 15 warmup bars, got %d", len(kPlots))
	}
	if len(dPlots) != 13 {
		t.Fatalf("expected 13 non-empty %%D points after 17 warmup bars, got %d", len(dPlots))
	}

	// Analytical verification:
	// For each 14-bar window ending at i (i >= 13):
	// High max = 100 + i, Low min = 90 + i - 13 = 77 + i -> Range = 23.0
	// Close = 95 + i -> Close - Low min = 18.0
	// kRaw = (18 / 23) * 100 = 1800 / 23 = 78.2608695652...
	// Constant kRaw leads to constant k and d = 1800.0 / 23.0
	expectedStoch := 1800.0 / 23.0

	for i, pt := range kPlots {
		if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
			t.Errorf("%%K point %d contains invalid float: %f", i, pt.Value)
		}
		if math.Abs(pt.Value-expectedStoch) > 1e-6 {
			t.Errorf("%%K point %d: expected %f, got %f (diff: %e)", i, expectedStoch, pt.Value, math.Abs(pt.Value-expectedStoch))
		}
		expectedTime := baseTime + int64((i+15)*60)
		if pt.Time != expectedTime {
			t.Errorf("%%K point %d: expected time %d, got %d", i, expectedTime, pt.Time)
		}
	}

	for i, pt := range dPlots {
		if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
			t.Errorf("%%D point %d contains invalid float: %f", i, pt.Value)
		}
		if math.Abs(pt.Value-expectedStoch) > 1e-6 {
			t.Errorf("%%D point %d: expected %f, got %f (diff: %e)", i, expectedStoch, pt.Value, math.Abs(pt.Value-expectedStoch))
		}
		expectedTime := baseTime + int64((i+17)*60)
		if pt.Time != expectedTime {
			t.Errorf("%%D point %d: expected time %d, got %d", i, expectedTime, pt.Time)
		}
	}

	// Direct vector-level verification on MathStoch
	high := make([]float64, n)
	low := make([]float64, n)
	closePrice := make([]float64, n)
	for i := 0; i < n; i++ {
		high[i] = candles[i].High
		low[i] = candles[i].Low
		closePrice[i] = candles[i].Close
	}
	kRaw, dRaw := MathStoch(high, low, closePrice, 14, 3, 3)
	for i := 0; i < 15; i++ {
		if !math.IsNaN(kRaw[i]) {
			t.Errorf("expected NaN in kRaw at warmup index %d, got %f", i, kRaw[i])
		}
	}
	for i := 15; i < n; i++ {
		if math.Abs(kRaw[i]-expectedStoch) > 1e-6 {
			t.Errorf("kRaw[%d]: expected %f, got %f", i, expectedStoch, kRaw[i])
		}
	}
	for i := 0; i < 17; i++ {
		if !math.IsNaN(dRaw[i]) {
			t.Errorf("expected NaN in dRaw at warmup index %d, got %f", i, dRaw[i])
		}
	}
	for i := 17; i < n; i++ {
		if math.Abs(dRaw[i]-expectedStoch) > 1e-6 {
			t.Errorf("dRaw[%d]: expected %f, got %f", i, expectedStoch, dRaw[i])
		}
	}
}

func TestChainedMovingAverages(t *testing.T) {
	n := 25
	candles := make([]wickra.CandleData, n)
	baseTime := int64(1700000000)
	for i := 0; i < n; i++ {
		candles[i] = wickra.CandleData{
			Time:  baseTime + int64(i*60),
			Close: 100.0 + float64(i),
			Open:  100.0 + float64(i),
			High:  101.0 + float64(i),
			Low:   99.0 + float64(i),
		}
	}
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)

	script := `
def main(ctx):
    mma = ta.sma(ta.sma(ctx.close, 5), 5)
    return [
        plot.line(mma, title="SMA of SMA")
    ]
`
	engine := NewEngine(nil)
	res, err := engine.Eval(context.Background(), script, sCtx, nil)
	if err != nil {
		t.Fatalf("Eval failed: %v", err)
	}

	plots := res.Plots["plot_0"]
	// Warmup analysis:
	// First SMA(5): 4 warmup bars (indices 0..3)
	// Second SMA(5): requires 5 valid entries from first SMA -> index 4 + 5 - 1 = 8
	// Exactly 8 warmup bars (indices 0..7). Total valid points: 25 - 8 = 17 points
	if len(plots) != 17 {
		t.Fatalf("expected 17 points after 8 warmup bars, got %d", len(plots))
	}

	// Analytical verification:
	// For linear series c[i] = 100 + i:
	// SMA(c, 5)[i] = c[i-2] = 100 + i - 2 (for i >= 4)
	// SMA(SMA(c, 5), 5)[i] = SMA(c, 5)[i-2] = 100 + i - 4 (for i >= 8)
	for j, pt := range plots {
		i := j + 8
		expected := 100.0 + float64(i-4)
		if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
			t.Errorf("point %d contains NaN/Inf", j)
		}
		if math.Abs(pt.Value-expected) > 1e-6 {
			t.Errorf("point %d (bar %d): expected %f, got %f (diff %e)", j, i, expected, pt.Value, math.Abs(pt.Value-expected))
		}
		expectedTime := baseTime + int64(i*60)
		if pt.Time != expectedTime {
			t.Errorf("point %d: expected time %d, got %d", j, expectedTime, pt.Time)
		}
	}

	// Vector-level verification on MathSMA
	closeSlice := make([]float64, n)
	for i := 0; i < n; i++ {
		closeSlice[i] = candles[i].Close
	}
	sma1 := MathSMA(closeSlice, 5)
	sma2 := MathSMA(sma1, 5)
	for i := 0; i < 8; i++ {
		if !math.IsNaN(sma2[i]) {
			t.Errorf("expected NaN in sma2 at warmup bar %d, got %f", i, sma2[i])
		}
	}
	for i := 8; i < n; i++ {
		expected := 100.0 + float64(i-4)
		if math.Abs(sma2[i]-expected) > 1e-6 {
			t.Errorf("sma2[%d]: expected %f, got %f", i, expected, sma2[i])
		}
	}
}

func TestChainedEmaRsi(t *testing.T) {
	// 1. Constant uptrend dataset: RSI is 100.0 and EMA(RSI) is 100.0
	n := 40
	candles := make([]wickra.CandleData, n)
	baseTime := int64(1700000000)
	for i := 0; i < n; i++ {
		candles[i] = wickra.CandleData{
			Time:  baseTime + int64(i*60),
			Close: 50.0 + float64(i)*2.0,
			Open:  49.0 + float64(i)*2.0,
			High:  51.0 + float64(i)*2.0,
			Low:   48.0 + float64(i)*2.0,
		}
	}
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)

	script := `
def main(ctx):
    smooth_rsi = ta.ema(ta.rsi(ctx.close, 14), 9)
    return [
        plot.line(smooth_rsi, title="EMA of RSI")
    ]
`
	engine := NewEngine(nil)
	res, err := engine.Eval(context.Background(), script, sCtx, nil)
	if err != nil {
		t.Fatalf("Eval failed: %v", err)
	}

	plots := res.Plots["plot_0"]
	// RSI(14) has first valid at index 14
	// EMA(9) over RSI starts warmup at index 14, requiring 9 bars -> first valid at 14 + 9 - 1 = 22
	// For n=40: 40 - 22 = 18 points
	if len(plots) != 18 {
		t.Fatalf("expected 18 points, got %d", len(plots))
	}

	for j, pt := range plots {
		i := j + 22
		if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
			t.Errorf("point %d (bar %d) contains invalid float: %f", j, i, pt.Value)
		}
		if math.Abs(pt.Value-100.0) > 1e-6 {
			t.Errorf("point %d (bar %d): expected 100.0, got %f (diff %e)", j, i, pt.Value, math.Abs(pt.Value-100.0))
		}
		expectedTime := baseTime + int64(i*60)
		if pt.Time != expectedTime {
			t.Errorf("point %d: expected time %d, got %d", j, expectedTime, pt.Time)
		}
	}

	// 2. Dynamic dataset: verify exact step-by-step recurrence within 1e-6
	dynCandles := createTestCandles(60)
	closeSlice := make([]float64, 60)
	for i := 0; i < 60; i++ {
		closeSlice[i] = dynCandles[i].Close
	}
	rsi := MathRSI(closeSlice, 14)
	emaRsi := MathEMA(rsi, 9)

	// Verify warmup NaN boundaries
	for i := 0; i < 22; i++ {
		if !math.IsNaN(emaRsi[i]) {
			t.Errorf("expected NaN in emaRsi at warmup index %d, got %f", i, emaRsi[i])
		}
	}

	// Verify initial SMA warmup at index 22
	var sum float64
	for i := 14; i <= 22; i++ {
		sum += rsi[i]
	}
	expectedWarmup := sum / 9.0
	if math.Abs(emaRsi[22]-expectedWarmup) > 1e-6 {
		t.Errorf("emaRsi[22] warmup mismatch: expected %f, got %f", expectedWarmup, emaRsi[22])
	}

	// Verify subsequent exponential smoothing recurrence
	alpha := 2.0 / (9.0 + 1.0)
	prev := expectedWarmup
	for i := 23; i < 60; i++ {
		expectedVal := alpha*rsi[i] + (1.0-alpha)*prev
		if math.Abs(emaRsi[i]-expectedVal) > 1e-6 {
			t.Errorf("emaRsi[%d] recurrence mismatch: expected %f, got %f", i, expectedVal, emaRsi[i])
		}
		prev = expectedVal
	}
}

func TestEngineLoopbackPortStrictness(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"data": 123}`))
	}))
	defer ts.Close()

	u, err := url.Parse(ts.URL)
	if err != nil {
		t.Fatalf("failed to parse url: %v", err)
	}

	script := `
def main(ctx):
    resp = ctx.http.get("` + ts.URL + `")
    return []
`
	candles := createTestCandles(5)
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	engine := NewEngine(nil)

	// Portless loopback token rejected
	_, err = engine.Eval(context.Background(), script, sCtx, []string{"network:127.0.0.1"})
	if err == nil || !strings.Contains(err.Error(), "permission denied") {
		t.Fatalf("expected permission denied for portless loopback token, got: %v", err)
	}

	// Loopback token with exact port accepted
	_, err = engine.Eval(context.Background(), script, sCtx, []string{"network:" + u.Host})
	if err != nil {
		t.Fatalf("expected success with exact port token, got: %v", err)
	}
}

func naiveWMARef(data []float64, period int) []float64 {
	n := len(data)
	res := make([]float64, n)
	for i := range res {
		res[i] = math.NaN()
	}
	if period <= 0 || n < period {
		return res
	}
	denom := float64(period * (period + 1) / 2)
	for i := period - 1; i < n; i++ {
		var s float64
		for j := 0; j < period; j++ {
			s += data[i-period+1+j] * float64(j+1)
		}
		res[i] = s / denom
	}
	return res
}

func naiveBollingerRef(data []float64, period int, stddev float64) ([]float64, []float64, []float64) {
	n := len(data)
	mid := MathSMA(data, period)
	upper := make([]float64, n)
	lower := make([]float64, n)
	for i := range upper {
		upper[i] = math.NaN()
		lower[i] = math.NaN()
	}
	for i := period - 1; i < n; i++ {
		m := mid[i]
		var variance float64
		for j := 0; j < period; j++ {
			d := data[i-period+1+j] - m
			variance += d * d
		}
		sd := math.Sqrt(variance / float64(period))
		upper[i] = m + stddev*sd
		lower[i] = m - stddev*sd
	}
	return upper, mid, lower
}

func TestOptimizedTAAlgorithmsAccuracy(t *testing.T) {
	rng := rand.New(rand.NewSource(42))
	n := 800
	data := make([]float64, n)
	// Include large price offset to stress catastrophic cancellation resistance in Bollinger
	for i := 0; i < n; i++ {
		data[i] = 100000.0 + math.Sin(float64(i)*0.1)*50.0 + (rng.Float64()-0.5)*10.0
	}

	assertSliceClose := func(name string, got, want []float64) {
		t.Helper()
		if len(got) != len(want) {
			t.Fatalf("%s length mismatch: got %d, want %d", name, len(got), len(want))
		}
		for i := range want {
			if math.IsNaN(want[i]) {
				if !math.IsNaN(got[i]) {
					t.Fatalf("%s[%d] expected NaN, got %f", name, i, got[i])
				}
				continue
			}
			if math.IsNaN(got[i]) || math.Abs(got[i]-want[i]) > 1e-6 {
				t.Fatalf("%s[%d] mismatch: got %f, want %f (diff %e)", name, i, got[i], want[i], math.Abs(got[i]-want[i]))
			}
		}
	}

	for _, period := range []int{1, 5, 14, 50} {
		assertSliceClose("WMA", MathWMA(data, period), naiveWMARef(data, period))

		uGot, mGot, lGot := MathBollinger(data, period, 2.0)
		uWant, mWant, lWant := naiveBollingerRef(data, period, 2.0)
		assertSliceClose("BB.upper", uGot, uWant)
		assertSliceClose("BB.mid", mGot, mWant)
		assertSliceClose("BB.lower", lGot, lWant)

		// Highest / Lowest against naive O(N*period)
		hGot := MathHighest(data, period)
		lExtremeGot := MathLowest(data, period)
		for i := period - 1; i < n; i++ {
			hWant, lWantVal := data[i], data[i]
			for j := 1; j < period; j++ {
				if data[i-j] > hWant {
					hWant = data[i-j]
				}
				if data[i-j] < lWantVal {
					lWantVal = data[i-j]
				}
			}
			if math.Abs(hGot[i]-hWant) > 1e-9 {
				t.Fatalf("Highest[%d] mismatch: got %f, want %f", i, hGot[i], hWant)
			}
			if math.Abs(lExtremeGot[i]-lWantVal) > 1e-9 {
				t.Fatalf("Lowest[%d] mismatch: got %f, want %f", i, lExtremeGot[i], lWantVal)
			}
		}
	}

	// Verify HMA accuracy against naive WMA composition
	hmaGot := MathHMA(data, 16)
	wmaHalf := naiveWMARef(data, 8)
	wmaFull := naiveWMARef(data, 16)
	diff := make([]float64, n)
	for i := range diff {
		if math.IsNaN(wmaHalf[i]) || math.IsNaN(wmaFull[i]) {
			diff[i] = math.NaN()
		} else {
			diff[i] = 2*wmaHalf[i] - wmaFull[i]
		}
	}
	// Naive WMA(diff, 4) skipping NaN prefix
	hmaWant := make([]float64, n)
	for i := range hmaWant {
		hmaWant[i] = math.NaN()
	}
	for i := 15 + 4 - 1; i < n; i++ {
		var s float64
		for j := 0; j < 4; j++ {
			s += diff[i-4+1+j] * float64(j+1)
		}
		hmaWant[i] = s / 10.0
	}
	assertSliceClose("HMA(16)", hmaGot, hmaWant)
}

func TestScriptContextIncrementalUpdateAndProgramCache(t *testing.T) {
	candles := createTestCandles(10)
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles[:5])

	// Incremental appends + in-progress tip update
	for i := 5; i < 10; i++ {
		inProgress := candles[i]
		inProgress.Close -= 1.5
		sCtx.UpdateCandle(inProgress, 8)
		sCtx.UpdateCandle(candles[i], 8) // Same timestamp replaces tip
	}

	refCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles[2:]) // Last 8 bars
	if len(sCtx.Close) != 8 || len(refCtx.Close) != 8 {
		t.Fatalf("expected length 8 after maxHistory trim, got %d", len(sCtx.Close))
	}
	for i := range refCtx.Close {
		if math.Abs(sCtx.Close[i]-refCtx.Close[i]) > 1e-9 {
			t.Fatalf("Close[%d] mismatch: got %f, want %f", i, sCtx.Close[i], refCtx.Close[i])
		}
		if math.Abs(sCtx.Delta[i]-refCtx.Delta[i]) > 1e-9 {
			t.Fatalf("Delta[%d] mismatch: got %f, want %f", i, sCtx.Delta[i], refCtx.Delta[i])
		}
	}

	script := `
def main(ctx):
    bb = ta.bollinger(ctx.close, 3, 2.0)
    hi = ta.highest(ctx.high, 3)
    lo = ta.lowest(ctx.low, 3)
    return [plot.line(bb.upper), plot.line(hi), plot.line(lo)]
`
	engine := NewEngine(nil)
	prog, err := engine.Compile(script)
	if err != nil {
		t.Fatalf("Compile failed: %v", err)
	}
	resInc, err := engine.EvalProgram(context.Background(), prog, sCtx, nil)
	if err != nil {
		t.Fatalf("EvalProgram incremental failed: %v", err)
	}
	resRef, err := engine.Eval(context.Background(), script, refCtx, nil)
	if err != nil {
		t.Fatalf("Eval reference failed: %v", err)
	}
	for plotID, ptsRef := range resRef.Plots {
		ptsInc := resInc.Plots[plotID]
		if len(ptsInc) != len(ptsRef) {
			t.Fatalf("plot %s length mismatch: got %d, want %d", plotID, len(ptsInc), len(ptsRef))
		}
		for i := range ptsRef {
			if math.Abs(ptsInc[i].Value-ptsRef[i].Value) > 1e-6 {
				t.Fatalf("plot %s[%d] mismatch: got %f, want %f", plotID, i, ptsInc[i].Value, ptsRef[i].Value)
			}
		}
	}
}

func TestSecurity_CancellationLogsAndPanicBounds(t *testing.T) {
	candles := []wickra.CandleData{
		{Time: 1000, Open: 10, High: 12, Low: 9, Close: 11, Volume: 100},
		{Time: 1060, Open: 11, High: 13, Low: 10, Close: 12, Volume: 100},
	}
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	engine := NewEngine(nil)

	// 1. Pre-canceled parent context must immediately cancel EvalProgram
	ctxCanceled, cancel := context.WithCancel(context.Background())
	cancel()
	loopScript := `
def main(ctx):
    x = 0
    for i in range(100000):
        x = x + 1
    return [plot.line(ctx.close)]
`
	if _, err := engine.Eval(ctxCanceled, loopScript, sCtx, nil); err == nil {
		t.Fatalf("Expected canceled context to abort script execution")
	}

	// 2. Negative length in ta.change must return an error, not panic
	negChange := `
def main(ctx):
    return [plot.line(ta.change(ctx.close, -1))]
`
	if _, err := engine.Eval(context.Background(), negChange, sCtx, nil); err == nil {
		t.Fatalf("Expected error for negative ta.change length")
	}

	// 3. Mismatched slices in MathATR / MathStoch must not panic
	_ = MathATR([]float64{1, 2, 3}, []float64{1}, []float64{1}, 2)
	_, _ = MathStoch([]float64{1}, []float64{1}, []float64{1, 2, 3}, 2, 1, 1)

	// 4. Print logs must be capped cleanly at MaxLogLines + truncation notice
	logScript := `
def main(ctx):
    for i in range(1000):
        print("line")
    return [plot.line(ctx.close)]
`
	res, err := engine.Eval(context.Background(), logScript, sCtx, nil)
	if err != nil {
		t.Fatalf("Expected capped log script to succeed, got %v", err)
	}
	if len(res.Logs) != MaxLogLines+1 {
		t.Fatalf("Expected %d log lines (including truncation marker), got %d", MaxLogLines+1, len(res.Logs))
	}
}
