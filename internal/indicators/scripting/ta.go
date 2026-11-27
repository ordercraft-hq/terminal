package scripting

import (
	"context"
	"fmt"
	"math"
	"sort"

	"github.com/ordercraft-hq/terminal/internal/indicators/wickra"
	"go.starlark.net/starlark"
	"go.starlark.net/starlarkstruct"
)

// createTAModule builds the `ta` namespace struct containing vectorized math functions and the catalog bridge.
func (e *Engine) createTAModule(evalCtx context.Context, sCtx *ScriptContext) *starlarkstruct.Struct {
	dict := starlark.StringDict{
		"sma":        starlark.NewBuiltin("ta.sma", builtinSMA),
		"ema":        starlark.NewBuiltin("ta.ema", builtinEMA),
		"hma":        starlark.NewBuiltin("ta.hma", builtinHMA),
		"wma":        starlark.NewBuiltin("ta.wma", builtinWMA),
		"rma":        starlark.NewBuiltin("ta.rma", builtinRMA),
		"rsi":        starlark.NewBuiltin("ta.rsi", builtinRSI),
		"macd":       starlark.NewBuiltin("ta.macd", builtinMACD),
		"atr":        starlark.NewBuiltin("ta.atr", makeBuiltinATR(sCtx)),
		"bollinger":  starlark.NewBuiltin("ta.bollinger", builtinBollinger),
		"stoch":      starlark.NewBuiltin("ta.stoch", builtinStoch),
		"cumsum":     starlark.NewBuiltin("ta.cumsum", builtinCumSum),
		"diff":       starlark.NewBuiltin("ta.diff", builtinDiff),
		"change":     starlark.NewBuiltin("ta.change", builtinChange),
		"highest":    starlark.NewBuiltin("ta.highest", builtinHighest),
		"lowest":     starlark.NewBuiltin("ta.lowest", builtinLowest),
		"crossover":  starlark.NewBuiltin("ta.crossover", builtinCrossover),
		"crossunder": starlark.NewBuiltin("ta.crossunder", builtinCrossunder),
		"call":       starlark.NewBuiltin("ta.call", e.makeBuiltinCatalogCall(evalCtx, sCtx)),
	}

	return starlarkstruct.FromStringDict(starlark.String("ta"), dict)
}

// Vectorized Math Functions

func MathSMA(data []float64, period int) []float64 {
	n := len(data)
	res := make([]float64, n)
	for i := range res {
		res[i] = math.NaN()
	}
	if period <= 0 || n < period {
		return res
	}

	firstValid := -1
	for i := 0; i < n; i++ {
		if !math.IsNaN(data[i]) {
			firstValid = i
			break
		}
	}
	if firstValid == -1 || n-firstValid < period {
		return res
	}

	var sum float64
	for i := firstValid; i < firstValid+period; i++ {
		sum += data[i]
	}
	res[firstValid+period-1] = sum / float64(period)

	for i := firstValid + period; i < n; i++ {
		sum += data[i] - data[i-period]
		res[i] = sum / float64(period)
	}
	return res
}

func MathEMA(data []float64, period int) []float64 {
	n := len(data)
	res := make([]float64, n)
	for i := range res {
		res[i] = math.NaN()
	}
	if period <= 0 || n < period {
		return res
	}

	firstValid := -1
	for i := 0; i < n; i++ {
		if !math.IsNaN(data[i]) {
			firstValid = i
			break
		}
	}
	if firstValid == -1 || n-firstValid < period {
		return res
	}

	alpha := 2.0 / float64(period+1)

	// Warmup using SMA
	var sum float64
	for i := firstValid; i < firstValid+period; i++ {
		sum += data[i]
	}
	prev := sum / float64(period)
	res[firstValid+period-1] = prev

	for i := firstValid + period; i < n; i++ {
		val := alpha*data[i] + (1.0-alpha)*prev
		res[i] = val
		prev = val
	}
	return res
}

func MathWMA(data []float64, period int) []float64 {
	n := len(data)
	res := make([]float64, n)
	for i := range res {
		res[i] = math.NaN()
	}
	if period <= 0 || n < period {
		return res
	}

	denom := float64(period * (period + 1) / 2)
	if period == 1 {
		for i := 0; i < n; i++ {
			res[i] = data[i]
		}
		return res
	}

	nanCount := 0
	for i := 0; i < period-1; i++ {
		if math.IsNaN(data[i]) {
			nanCount++
		}
	}

	var plainSum, weightedSum float64
	hasClean := false
	sinceAnchor := 0
	const anchorInterval = 4096

	for i := period - 1; i < n; i++ {
		if math.IsNaN(data[i]) {
			nanCount++
		}
		if i >= period && math.IsNaN(data[i-period]) {
			nanCount--
		}

		if nanCount > 0 {
			hasClean = false
			continue
		}

		if !hasClean || sinceAnchor >= anchorInterval {
			plainSum = 0
			weightedSum = 0
			base := i - period + 1
			for j := 0; j < period; j++ {
				v := data[base+j]
				plainSum += v
				weightedSum += v * float64(j+1)
			}
			hasClean = true
			sinceAnchor = 0
		} else {
			xOut := data[i-period]
			xIn := data[i]
			weightedSum = weightedSum - plainSum + float64(period)*xIn
			plainSum = plainSum - xOut + xIn
			sinceAnchor++
		}
		res[i] = weightedSum / denom
	}
	return res
}

func MathHMA(data []float64, period int) []float64 {
	n := len(data)
	res := make([]float64, n)
	for i := range res {
		res[i] = math.NaN()
	}
	if period <= 1 || n < period {
		return res
	}

	halfPeriod := period / 2
	if halfPeriod < 1 {
		halfPeriod = 1
	}
	sqrtPeriod := int(math.Sqrt(float64(period)))
	if sqrtPeriod < 1 {
		sqrtPeriod = 1
	}

	wmaHalf := MathWMA(data, halfPeriod)
	wmaFull := MathWMA(data, period)

	diffSeries := make([]float64, n)
	for i := 0; i < n; i++ {
		if math.IsNaN(wmaHalf[i]) || math.IsNaN(wmaFull[i]) {
			diffSeries[i] = math.NaN()
		} else {
			diffSeries[i] = 2.0*wmaHalf[i] - wmaFull[i]
		}
	}

	return MathWMA(diffSeries, sqrtPeriod)
}

func MathRMA(data []float64, period int) []float64 {
	n := len(data)
	res := make([]float64, n)
	for i := range res {
		res[i] = math.NaN()
	}
	if period <= 0 || n < period {
		return res
	}

	firstValid := -1
	for i := 0; i < n; i++ {
		if !math.IsNaN(data[i]) {
			firstValid = i
			break
		}
	}
	if firstValid == -1 || n-firstValid < period {
		return res
	}

	alpha := 1.0 / float64(period)

	var sum float64
	for i := firstValid; i < firstValid+period; i++ {
		sum += data[i]
	}
	prev := sum / float64(period)
	res[firstValid+period-1] = prev

	for i := firstValid + period; i < n; i++ {
		prev = alpha*data[i] + (1.0-alpha)*prev
		res[i] = prev
	}
	return res
}

func MathRSI(data []float64, period int) []float64 {
	n := len(data)
	res := make([]float64, n)
	for i := range res {
		res[i] = math.NaN()
	}
	if period <= 0 || n <= period {
		return res
	}

	gains := make([]float64, n)
	losses := make([]float64, n)
	for i := 1; i < n; i++ {
		if math.IsNaN(data[i]) || math.IsNaN(data[i-1]) {
			gains[i] = math.NaN()
			losses[i] = math.NaN()
			continue
		}
		diff := data[i] - data[i-1]
		if diff > 0 {
			gains[i] = diff
			losses[i] = 0.0
		} else {
			gains[i] = 0.0
			losses[i] = -diff
		}
	}

	avgGain := MathRMA(gains[1:], period)
	avgLoss := MathRMA(losses[1:], period)

	for i := period; i < n; i++ {
		g := avgGain[i-1]
		l := avgLoss[i-1]
		if math.IsNaN(g) || math.IsNaN(l) {
			continue
		}
		if l == 0 {
			res[i] = 100.0
		} else if g == 0 {
			res[i] = 0.0
		} else {
			rs := g / l
			res[i] = 100.0 - (100.0 / (1.0 + rs))
		}
	}
	return res
}

func MathMACD(data []float64, fast, slow, signal int) ([]float64, []float64, []float64) {
	fastEma := MathEMA(data, fast)
	slowEma := MathEMA(data, slow)

	n := len(data)
	macdLine := make([]float64, n)
	for i := 0; i < n; i++ {
		if math.IsNaN(fastEma[i]) || math.IsNaN(slowEma[i]) {
			macdLine[i] = math.NaN()
		} else {
			macdLine[i] = fastEma[i] - slowEma[i]
		}
	}

	// Filter NaN prefix for signal EMA
	firstValid := -1
	for i := 0; i < n; i++ {
		if !math.IsNaN(macdLine[i]) {
			firstValid = i
			break
		}
	}

	signalLine := make([]float64, n)
	hist := make([]float64, n)
	for i := range signalLine {
		signalLine[i] = math.NaN()
		hist[i] = math.NaN()
	}

	if firstValid != -1 && n-firstValid >= signal {
		subSignal := MathEMA(macdLine[firstValid:], signal)
		for i, v := range subSignal {
			idx := firstValid + i
			signalLine[idx] = v
			if !math.IsNaN(v) && !math.IsNaN(macdLine[idx]) {
				hist[idx] = macdLine[idx] - v
			}
		}
	}

	return macdLine, signalLine, hist
}

func MathATR(high, low, close []float64, period int) []float64 {
	n := len(high)
	res := make([]float64, n)
	for i := range res {
		res[i] = math.NaN()
	}
	if period <= 0 || n < period || len(low) < n || len(close) < n {
		return res
	}

	tr := make([]float64, n)
	tr[0] = high[0] - low[0]
	for i := 1; i < n; i++ {
		hL := high[i] - low[i]
		hC := math.Abs(high[i] - close[i-1])
		lC := math.Abs(low[i] - close[i-1])
		tr[i] = math.Max(hL, math.Max(hC, lC))
	}

	return MathRMA(tr, period)
}

func MathBollinger(data []float64, period int, stddev float64) ([]float64, []float64, []float64) {
	n := len(data)
	mid := MathSMA(data, period)
	upper := make([]float64, n)
	lower := make([]float64, n)

	for i := range upper {
		upper[i] = math.NaN()
		lower[i] = math.NaN()
	}
	if period <= 0 || n < period {
		return upper, mid, lower
	}

	nanCount := 0
	for i := 0; i < period-1; i++ {
		if math.IsNaN(data[i]) {
			nanCount++
		}
	}

	anchorInterval := period
	if anchorInterval < 256 {
		anchorInterval = 256
	}

	var m2 float64
	hasClean := false
	sinceAnchor := 0
	pFloat := float64(period)

	for i := period - 1; i < n; i++ {
		if math.IsNaN(data[i]) {
			nanCount++
		}
		if i >= period && math.IsNaN(data[i-period]) {
			nanCount--
		}

		m := mid[i]
		if nanCount > 0 || math.IsNaN(m) {
			hasClean = false
			continue
		}

		if !hasClean || sinceAnchor >= anchorInterval {
			m2 = 0
			base := i - period + 1
			for j := 0; j < period; j++ {
				d := data[base+j] - m
				m2 += d * d
			}
			hasClean = true
			sinceAnchor = 0
		} else {
			xOld := data[i-period]
			xNew := data[i]
			mOld := mid[i-1]
			m2 += (xNew - xOld) * ((xNew - m) + (xOld - mOld))
			if m2 < 0 {
				m2 = 0
			}
			sinceAnchor++
		}

		sd := math.Sqrt(m2 / pFloat)
		upper[i] = m + stddev*sd
		lower[i] = m - stddev*sd
	}

	return upper, mid, lower
}

func mathRollingExtreme(data []float64, period int, isMax bool) []float64 {
	n := len(data)
	res := make([]float64, n)
	for i := range res {
		res[i] = math.NaN()
	}
	if period <= 0 || n < period {
		return res
	}

	// Ring-buffer monotonic deque storing indices into data.
	capDQ := period + 1
	dq := make([]int, capDQ)
	head, tail := 0, 0

	for i := 0; i < n; i++ {
		// Evict indices outside [i-period+1 .. i]
		minIdx := i - period + 1
		if head != tail && dq[head] < minIdx {
			head = (head + 1) % capDQ
		}

		val := data[i]
		if !math.IsNaN(val) {
			for head != tail {
				backIdx := (tail - 1 + capDQ) % capDQ
				backVal := data[dq[backIdx]]
				if isMax {
					if backVal > val {
						break
					}
				} else {
					if backVal < val {
						break
					}
				}
				tail = backIdx
			}
			dq[tail] = i
			tail = (tail + 1) % capDQ
		}

		if i >= period-1 {
			if math.IsNaN(val) || head == tail {
				res[i] = math.NaN()
			} else {
				res[i] = data[dq[head]]
			}
		}
	}
	return res
}

func MathHighest(data []float64, period int) []float64 {
	return mathRollingExtreme(data, period, true)
}

func MathLowest(data []float64, period int) []float64 {
	return mathRollingExtreme(data, period, false)
}

func MathStoch(high, low, close []float64, periodK, periodD, smooth int) ([]float64, []float64) {
	n := len(close)
	kRaw := make([]float64, n)
	for i := range kRaw {
		kRaw[i] = math.NaN()
	}
	if periodK <= 0 || n < periodK || len(high) < n || len(low) < n {
		k := MathSMA(kRaw, smooth)
		d := MathSMA(k, periodD)
		return k, d
	}

	highest := MathHighest(high, periodK)
	lowest := MathLowest(low, periodK)
	if len(highest) < n || len(lowest) < n {
		k := MathSMA(kRaw, smooth)
		d := MathSMA(k, periodD)
		return k, d
	}

	for i := periodK - 1; i < n; i++ {
		h := highest[i]
		l := lowest[i]
		rng := h - l
		if rng > 1e-12 {
			kRaw[i] = ((close[i] - l) / rng) * 100.0
		} else {
			kRaw[i] = 50.0
		}
	}

	k := MathSMA(kRaw, smooth)
	d := MathSMA(k, periodD)
	return k, d
}

// Builtin Adapters

func builtinSMA(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		seriesVal starlark.Value
		period    int
	)
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "series", &seriesVal, "period", &period); err != nil {
		return nil, err
	}
	data, err := extractFloatSlice(seriesVal)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", fn.Name(), err)
	}
	res := MathSMA(data, period)
	return floatSliceToStarlarkList(res), nil
}

func builtinEMA(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		seriesVal starlark.Value
		period    int
	)
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "series", &seriesVal, "period", &period); err != nil {
		return nil, err
	}
	data, err := extractFloatSlice(seriesVal)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", fn.Name(), err)
	}
	res := MathEMA(data, period)
	return floatSliceToStarlarkList(res), nil
}

func builtinHMA(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		seriesVal starlark.Value
		period    int
	)
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "series", &seriesVal, "period", &period); err != nil {
		return nil, err
	}
	data, err := extractFloatSlice(seriesVal)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", fn.Name(), err)
	}
	res := MathHMA(data, period)
	return floatSliceToStarlarkList(res), nil
}

func builtinWMA(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		seriesVal starlark.Value
		period    int
	)
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "series", &seriesVal, "period", &period); err != nil {
		return nil, err
	}
	data, err := extractFloatSlice(seriesVal)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", fn.Name(), err)
	}
	res := MathWMA(data, period)
	return floatSliceToStarlarkList(res), nil
}

func builtinRMA(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		seriesVal starlark.Value
		period    int
	)
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "series", &seriesVal, "period", &period); err != nil {
		return nil, err
	}
	data, err := extractFloatSlice(seriesVal)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", fn.Name(), err)
	}
	res := MathRMA(data, period)
	return floatSliceToStarlarkList(res), nil
}

func builtinRSI(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		seriesVal starlark.Value
		period    int
	)
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "series", &seriesVal, "period", &period); err != nil {
		return nil, err
	}
	data, err := extractFloatSlice(seriesVal)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", fn.Name(), err)
	}
	res := MathRSI(data, period)
	return floatSliceToStarlarkList(res), nil
}

func builtinMACD(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		seriesVal starlark.Value
		fast      int = 12
		slow      int = 26
		signal    int = 9
	)
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "series", &seriesVal, "fast?", &fast, "slow?", &slow, "signal?", &signal); err != nil {
		return nil, err
	}
	data, err := extractFloatSlice(seriesVal)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", fn.Name(), err)
	}
	macd, sig, hist := MathMACD(data, fast, slow, signal)

	dict := starlark.StringDict{
		"macd":      floatSliceToStarlarkList(macd),
		"signal":    floatSliceToStarlarkList(sig),
		"histogram": floatSliceToStarlarkList(hist),
	}
	return starlarkstruct.FromStringDict(starlark.String("MacdResult"), dict), nil
}

func makeBuiltinATR(sCtx *ScriptContext) func(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	return func(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
		var (
			period   int
			highVal  starlark.Value
			lowVal   starlark.Value
			closeVal starlark.Value
		)

		if len(args) == 1 {
			// ta.atr(period) using sCtx
			if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "period", &period); err != nil {
				return nil, err
			}
			res := MathATR(sCtx.High, sCtx.Low, sCtx.Close, period)
			return floatSliceToStarlarkList(res), nil
		}

		if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "high", &highVal, "low", &lowVal, "close", &closeVal, "period", &period); err != nil {
			return nil, err
		}
		high, err := extractFloatSlice(highVal)
		if err != nil {
			return nil, err
		}
		low, err := extractFloatSlice(lowVal)
		if err != nil {
			return nil, err
		}
		close, err := extractFloatSlice(closeVal)
		if err != nil {
			return nil, err
		}

		res := MathATR(high, low, close, period)
		return floatSliceToStarlarkList(res), nil
	}
}

func builtinBollinger(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		seriesVal starlark.Value
		period    int     = 20
		stddev    float64 = 2.0
	)
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "series", &seriesVal, "period?", &period, "stddev?", &stddev); err != nil {
		return nil, err
	}
	data, err := extractFloatSlice(seriesVal)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", fn.Name(), err)
	}
	upper, mid, lower := MathBollinger(data, period, stddev)

	dict := starlark.StringDict{
		"upper":  floatSliceToStarlarkList(upper),
		"middle": floatSliceToStarlarkList(mid),
		"lower":  floatSliceToStarlarkList(lower),
	}
	return starlarkstruct.FromStringDict(starlark.String("BollingerResult"), dict), nil
}

func builtinStoch(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		highVal  starlark.Value
		lowVal   starlark.Value
		closeVal starlark.Value
		periodK  int = 14
		periodD  int = 3
		smooth   int = 3
	)
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "high", &highVal, "low", &lowVal, "close", &closeVal, "period_k?", &periodK, "period_d?", &periodD, "smooth?", &smooth); err != nil {
		return nil, err
	}
	high, err := extractFloatSlice(highVal)
	if err != nil {
		return nil, err
	}
	low, err := extractFloatSlice(lowVal)
	if err != nil {
		return nil, err
	}
	close, err := extractFloatSlice(closeVal)
	if err != nil {
		return nil, err
	}

	k, d := MathStoch(high, low, close, periodK, periodD, smooth)
	dict := starlark.StringDict{
		"k": floatSliceToStarlarkList(k),
		"d": floatSliceToStarlarkList(d),
	}
	return starlarkstruct.FromStringDict(starlark.String("StochResult"), dict), nil
}

func builtinCumSum(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var seriesVal starlark.Value
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "series", &seriesVal); err != nil {
		return nil, err
	}
	data, err := extractFloatSlice(seriesVal)
	if err != nil {
		return nil, err
	}

	res := make([]float64, len(data))
	var cum float64
	for i, v := range data {
		if !math.IsNaN(v) {
			cum += v
		}
		res[i] = cum
	}
	return floatSliceToStarlarkList(res), nil
}

func builtinDiff(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var seriesVal starlark.Value
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "series", &seriesVal); err != nil {
		return nil, err
	}
	data, err := extractFloatSlice(seriesVal)
	if err != nil {
		return nil, err
	}

	res := make([]float64, len(data))
	if len(data) > 0 {
		res[0] = math.NaN()
		for i := 1; i < len(data); i++ {
			res[i] = data[i] - data[i-1]
		}
	}
	return floatSliceToStarlarkList(res), nil
}

func builtinChange(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		seriesVal starlark.Value
		length    int = 1
	)
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "series", &seriesVal, "length?", &length); err != nil {
		return nil, err
	}
	if length < 0 {
		return nil, fmt.Errorf("ta.change length must be non-negative, got %d", length)
	}
	data, err := extractFloatSlice(seriesVal)
	if err != nil {
		return nil, err
	}

	res := make([]float64, len(data))
	for i := range res {
		if i < length {
			res[i] = math.NaN()
		} else {
			res[i] = data[i] - data[i-length]
		}
	}
	return floatSliceToStarlarkList(res), nil
}

func builtinHighest(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		seriesVal starlark.Value
		period    int
	)
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "series", &seriesVal, "period", &period); err != nil {
		return nil, err
	}
	data, err := extractFloatSlice(seriesVal)
	if err != nil {
		return nil, err
	}

	return floatSliceToStarlarkList(MathHighest(data, period)), nil
}

func builtinLowest(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		seriesVal starlark.Value
		period    int
	)
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "series", &seriesVal, "period", &period); err != nil {
		return nil, err
	}
	data, err := extractFloatSlice(seriesVal)
	if err != nil {
		return nil, err
	}

	return floatSliceToStarlarkList(MathLowest(data, period)), nil
}

func builtinCrossover(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		aVal starlark.Value
		bVal starlark.Value
	)
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "a", &aVal, "b", &bVal); err != nil {
		return nil, err
	}
	a, err := extractFloatSlice(aVal)
	if err != nil {
		return nil, err
	}
	b, err := extractFloatSlice(bVal)
	if err != nil {
		return nil, err
	}

	n := len(a)
	if len(b) < n {
		n = len(b)
	}
	res := make([]float64, n)
	for i := 1; i < n; i++ {
		if a[i-1] <= b[i-1] && a[i] > b[i] {
			res[i] = 1.0
		} else {
			res[i] = 0.0
		}
	}
	return floatSliceToStarlarkList(res), nil
}

func builtinCrossunder(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	var (
		aVal starlark.Value
		bVal starlark.Value
	)
	if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "a", &aVal, "b", &bVal); err != nil {
		return nil, err
	}
	a, err := extractFloatSlice(aVal)
	if err != nil {
		return nil, err
	}
	b, err := extractFloatSlice(bVal)
	if err != nil {
		return nil, err
	}

	n := len(a)
	if len(b) < n {
		n = len(b)
	}
	res := make([]float64, n)
	for i := 1; i < n; i++ {
		if a[i-1] >= b[i-1] && a[i] < b[i] {
			res[i] = 1.0
		} else {
			res[i] = 0.0
		}
	}
	return floatSliceToStarlarkList(res), nil
}

func mapSeriesPointsToTimestamps(timestamps []int64, pts []wickra.SeriesPoint) []float64 {
	n := len(timestamps)
	vals := make([]float64, n)
	for i := range vals {
		vals[i] = math.NaN()
	}
	if n == 0 || len(pts) == 0 {
		return vals
	}

	// Fast zero-alloc scan when timestamps are sorted ascending (standard time-series order).
	ti := 0
	for _, p := range pts {
		for ti < n && timestamps[ti] < p.Time {
			ti++
		}
		if ti < n && timestamps[ti] == p.Time {
			vals[ti] = p.Value
			ti++
			continue
		}
		// Out-of-order or negative offset: binary search sorted timestamps.
		idx := sort.Search(n, func(i int) bool { return timestamps[i] >= p.Time })
		if idx < n && timestamps[idx] == p.Time {
			vals[idx] = p.Value
			ti = idx + 1
		}
	}
	return vals
}

// makeBuiltinCatalogCall creates the `ta.call(name, inputs)` bridge to Wickra WebAssembly runtime.
func (e *Engine) makeBuiltinCatalogCall(evalCtx context.Context, sCtx *ScriptContext) func(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
	if evalCtx == nil {
		evalCtx = context.Background()
	}
	return func(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
		var (
			indName   string
			inputsVal starlark.Value
		)
		if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "name", &indName, "inputs?", &inputsVal); err != nil {
			return nil, err
		}

		if e.wickraEngine == nil {
			return nil, fmt.Errorf("wickra wasm engine is not configured")
		}

		var inputs map[string]interface{}
		if inputsVal != nil {
			if d, ok := inputsVal.(*starlark.Dict); ok && d.Len() > 0 {
				inputs = make(map[string]interface{}, d.Len())
				for _, item := range d.Items() {
					k, _ := item[0].(starlark.String)
					switch v := item[1].(type) {
					case starlark.Float:
						inputs[string(k)] = float64(v)
					case starlark.Int:
						n, _ := v.Int64()
						inputs[string(k)] = int(n)
					case starlark.String:
						inputs[string(k)] = string(v)
					case starlark.Bool:
						inputs[string(k)] = bool(v)
					}
				}
			}
		}

		candles := sCtx.Candles()

		evalInstance := wickra.EvalIndicatorInstance{
			InstanceID:  "ta_call",
			IndicatorID: indName,
			Inputs:      inputs,
		}

		res, err := e.wickraEngine.Evaluate(evalCtx, candles, []wickra.EvalIndicatorInstance{evalInstance})
		if err != nil {
			return nil, fmt.Errorf("ta.call(%s) failed: %w", indName, err)
		}

		if len(res) == 0 {
			return starlark.None, nil
		}

		plots := res[0].Plots
		if len(plots) == 1 {
			for _, pts := range plots {
				return floatSliceToStarlarkList(mapSeriesPointsToTimestamps(sCtx.Time, pts)), nil
			}
		}

		// Multi-plot result
		outDict := make(starlark.StringDict, len(plots))
		for plotID, pts := range plots {
			outDict[plotID] = floatSliceToStarlarkList(mapSeriesPointsToTimestamps(sCtx.Time, pts))
		}
		return starlarkstruct.FromStringDict(starlark.String("TaCallResult"), outDict), nil
	}
}
