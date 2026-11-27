package scripting

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/ordercraft-hq/terminal/internal/indicators/wickra"
	"github.com/ordercraft-hq/terminal/internal/security"
	"go.starlark.net/starlark"
	"go.starlark.net/starlarkstruct"
)

type cachedStarlarkLists struct {
	time      *starlark.List
	open      *starlark.List
	high      *starlark.List
	low       *starlark.List
	close     *starlark.List
	volume    *starlark.List
	delta     *starlark.List
	cumDelta  *starlark.List
	bidVolume *starlark.List
	askVolume *starlark.List
}

// ScriptContext holds market series and execution environment passed to OrderScript main(ctx).
type ScriptContext struct {
	Time       []int64
	Open       []float64
	High       []float64
	Low        []float64
	Close      []float64
	Volume     []float64
	Symbol     string
	Resolution string
	Delta      []float64
	BidVolume  []float64
	AskVolume  []float64
	CumDelta   []float64

	slMu         sync.Mutex
	slTime       []starlark.Value
	slOpen       []starlark.Value
	slHigh       []starlark.Value
	slLow        []starlark.Value
	slClose      []starlark.Value
	slVolume     []starlark.Value
	slDelta      []starlark.Value
	slBidVolume  []starlark.Value
	slAskVolume  []starlark.Value
	slCumDelta   []starlark.Value
	cachedLists  *cachedStarlarkLists
	listsDirty   bool
	candlesCache []wickra.CandleData
	candlesDirty bool
}

func computeSyntheticDelta(c wickra.CandleData) (delta, bid, ask float64) {
	rng := c.High - c.Low
	if rng > 1e-9 {
		delta = c.Volume * (c.Close - c.Open) / rng
	} else if c.Close >= c.Open {
		delta = c.Volume * 0.5
	} else {
		delta = -c.Volume * 0.5
	}

	ask = (c.Volume + delta) * 0.5
	bid = (c.Volume - delta) * 0.5
	if ask < 0 {
		ask = 0
	}
	if bid < 0 {
		bid = 0
	}
	return delta, bid, ask
}

// NewScriptContextFromCandles builds a ScriptContext from candles and computes synthetic orderflow delta if needed.
func NewScriptContextFromCandles(symbol, resolution string, candles []wickra.CandleData) *ScriptContext {
	n := len(candles)
	sc := &ScriptContext{
		Time:       make([]int64, n),
		Open:       make([]float64, n),
		High:       make([]float64, n),
		Low:        make([]float64, n),
		Close:      make([]float64, n),
		Volume:     make([]float64, n),
		Symbol:     symbol,
		Resolution: resolution,
		Delta:      make([]float64, n),
		BidVolume:  make([]float64, n),
		AskVolume:  make([]float64, n),
		CumDelta:   make([]float64, n),
	}

	var runningCumDelta float64
	for i, c := range candles {
		sc.Time[i] = c.Time
		sc.Open[i] = c.Open
		sc.High[i] = c.High
		sc.Low[i] = c.Low
		sc.Close[i] = c.Close
		sc.Volume[i] = c.Volume

		delta, bid, ask := computeSyntheticDelta(c)
		runningCumDelta += delta
		sc.Delta[i] = delta
		sc.BidVolume[i] = bid
		sc.AskVolume[i] = ask
		sc.CumDelta[i] = runningCumDelta
	}

	return sc
}

// UpdateCandle incrementally updates the tip bar (if matching Time) or appends a new bar,
// updating cached Starlark value slices in O(1) instead of rebuilding all 10 lists per tick.
func (sc *ScriptContext) UpdateCandle(c wickra.CandleData, maxHistory int) {
	sc.slMu.Lock()
	defer sc.slMu.Unlock()

	delta, bid, ask := computeSyntheticDelta(c)
	n := len(sc.Time)

	if n > 0 && sc.Time[n-1] == c.Time {
		last := n - 1
		var prevCum float64
		if last > 0 {
			prevCum = sc.CumDelta[last-1]
		}
		cumDelta := prevCum + delta

		sc.Time[last] = c.Time
		sc.Open[last] = c.Open
		sc.High[last] = c.High
		sc.Low[last] = c.Low
		sc.Close[last] = c.Close
		sc.Volume[last] = c.Volume
		sc.Delta[last] = delta
		sc.BidVolume[last] = bid
		sc.AskVolume[last] = ask
		sc.CumDelta[last] = cumDelta

		if len(sc.slTime) == n {
			sc.slTime[last] = starlark.MakeInt64(c.Time)
			sc.slOpen[last] = starlark.Float(c.Open)
			sc.slHigh[last] = starlark.Float(c.High)
			sc.slLow[last] = starlark.Float(c.Low)
			sc.slClose[last] = starlark.Float(c.Close)
			sc.slVolume[last] = starlark.Float(c.Volume)
			sc.slDelta[last] = starlark.Float(delta)
			sc.slBidVolume[last] = starlark.Float(bid)
			sc.slAskVolume[last] = starlark.Float(ask)
			sc.slCumDelta[last] = starlark.Float(cumDelta)
		} else {
			sc.slTime = nil
		}

		if len(sc.candlesCache) == n && !sc.candlesDirty {
			sc.candlesCache[last] = c
		} else {
			sc.candlesDirty = true
		}
		sc.listsDirty = true
		return
	}

	var prevCum float64
	if n > 0 {
		prevCum = sc.CumDelta[n-1]
	}
	cumDelta := prevCum + delta

	sc.Time = append(sc.Time, c.Time)
	sc.Open = append(sc.Open, c.Open)
	sc.High = append(sc.High, c.High)
	sc.Low = append(sc.Low, c.Low)
	sc.Close = append(sc.Close, c.Close)
	sc.Volume = append(sc.Volume, c.Volume)
	sc.Delta = append(sc.Delta, delta)
	sc.BidVolume = append(sc.BidVolume, bid)
	sc.AskVolume = append(sc.AskVolume, ask)
	sc.CumDelta = append(sc.CumDelta, cumDelta)

	if len(sc.slTime) == n {
		sc.slTime = append(sc.slTime, starlark.MakeInt64(c.Time))
		sc.slOpen = append(sc.slOpen, starlark.Float(c.Open))
		sc.slHigh = append(sc.slHigh, starlark.Float(c.High))
		sc.slLow = append(sc.slLow, starlark.Float(c.Low))
		sc.slClose = append(sc.slClose, starlark.Float(c.Close))
		sc.slVolume = append(sc.slVolume, starlark.Float(c.Volume))
		sc.slDelta = append(sc.slDelta, starlark.Float(delta))
		sc.slBidVolume = append(sc.slBidVolume, starlark.Float(bid))
		sc.slAskVolume = append(sc.slAskVolume, starlark.Float(ask))
		sc.slCumDelta = append(sc.slCumDelta, starlark.Float(cumDelta))
	} else {
		sc.slTime = nil
	}

	if len(sc.candlesCache) == n && !sc.candlesDirty {
		sc.candlesCache = append(sc.candlesCache, c)
	} else {
		sc.candlesDirty = true
	}

	if maxHistory > 0 && len(sc.Time) > maxHistory {
		trim := len(sc.Time) - maxHistory
		sc.Time = trimInt64Front(sc.Time, trim, maxHistory)
		sc.Open = trimFloat64Front(sc.Open, trim, maxHistory)
		sc.High = trimFloat64Front(sc.High, trim, maxHistory)
		sc.Low = trimFloat64Front(sc.Low, trim, maxHistory)
		sc.Close = trimFloat64Front(sc.Close, trim, maxHistory)
		sc.Volume = trimFloat64Front(sc.Volume, trim, maxHistory)
		sc.Delta = trimFloat64Front(sc.Delta, trim, maxHistory)
		sc.BidVolume = trimFloat64Front(sc.BidVolume, trim, maxHistory)
		sc.AskVolume = trimFloat64Front(sc.AskVolume, trim, maxHistory)
		sc.CumDelta = trimFloat64Front(sc.CumDelta, trim, maxHistory)

		if len(sc.slTime) == maxHistory+trim {
			sc.slTime = trimStarlarkFront(sc.slTime, trim, maxHistory)
			sc.slOpen = trimStarlarkFront(sc.slOpen, trim, maxHistory)
			sc.slHigh = trimStarlarkFront(sc.slHigh, trim, maxHistory)
			sc.slLow = trimStarlarkFront(sc.slLow, trim, maxHistory)
			sc.slClose = trimStarlarkFront(sc.slClose, trim, maxHistory)
			sc.slVolume = trimStarlarkFront(sc.slVolume, trim, maxHistory)
			sc.slDelta = trimStarlarkFront(sc.slDelta, trim, maxHistory)
			sc.slBidVolume = trimStarlarkFront(sc.slBidVolume, trim, maxHistory)
			sc.slAskVolume = trimStarlarkFront(sc.slAskVolume, trim, maxHistory)
			sc.slCumDelta = trimStarlarkFront(sc.slCumDelta, trim, maxHistory)
		}
		if len(sc.candlesCache) == maxHistory+trim && !sc.candlesDirty {
			copy(sc.candlesCache, sc.candlesCache[trim:])
			sc.candlesCache = sc.candlesCache[:maxHistory]
		}
	}

	sc.listsDirty = true
}

func trimInt64Front(s []int64, trim, maxHistory int) []int64 {
	copy(s, s[trim:])
	return s[:maxHistory]
}

func trimFloat64Front(s []float64, trim, maxHistory int) []float64 {
	copy(s, s[trim:])
	return s[:maxHistory]
}

func trimStarlarkFront(s []starlark.Value, trim, maxHistory int) []starlark.Value {
	copy(s, s[trim:])
	clear(s[maxHistory:])
	return s[:maxHistory]
}

// Candles returns a cached []wickra.CandleData slice for ta.call invocations.
func (sc *ScriptContext) Candles() []wickra.CandleData {
	sc.slMu.Lock()
	defer sc.slMu.Unlock()

	n := len(sc.Time)
	if !sc.candlesDirty && len(sc.candlesCache) == n {
		return sc.candlesCache
	}
	candles := make([]wickra.CandleData, n)
	for i := 0; i < n; i++ {
		candles[i] = wickra.CandleData{
			Time:   sc.Time[i],
			Open:   sc.Open[i],
			High:   sc.High[i],
			Low:    sc.Low[i],
			Close:  sc.Close[i],
			Volume: sc.Volume[i],
		}
	}
	sc.candlesCache = candles
	sc.candlesDirty = false
	return candles
}

func floatSliceToStarlarkValues(vals []float64) []starlark.Value {
	items := make([]starlark.Value, len(vals))
	for i, v := range vals {
		items[i] = starlark.Float(v)
	}
	return items
}

func int64SliceToStarlarkValues(vals []int64) []starlark.Value {
	items := make([]starlark.Value, len(vals))
	for i, v := range vals {
		items[i] = starlark.MakeInt64(v)
	}
	return items
}

func frozenListFromValues(vals []starlark.Value) *starlark.List {
	cp := make([]starlark.Value, len(vals))
	copy(cp, vals)
	l := starlark.NewList(cp)
	l.Freeze()
	return l
}

func floatSliceToStarlarkList(vals []float64) *starlark.List {
	return starlark.NewList(floatSliceToStarlarkValues(vals))
}

func int64SliceToStarlarkList(vals []int64) *starlark.List {
	return starlark.NewList(int64SliceToStarlarkValues(vals))
}

func (sc *ScriptContext) ensureCachedStarlarkLists() *cachedStarlarkLists {
	sc.slMu.Lock()
	defer sc.slMu.Unlock()

	n := len(sc.Time)
	if sc.cachedLists != nil && !sc.listsDirty && len(sc.slTime) == n {
		return sc.cachedLists
	}

	if len(sc.slTime) != n {
		sc.slTime = int64SliceToStarlarkValues(sc.Time)
		sc.slOpen = floatSliceToStarlarkValues(sc.Open)
		sc.slHigh = floatSliceToStarlarkValues(sc.High)
		sc.slLow = floatSliceToStarlarkValues(sc.Low)
		sc.slClose = floatSliceToStarlarkValues(sc.Close)
		sc.slVolume = floatSliceToStarlarkValues(sc.Volume)
		sc.slDelta = floatSliceToStarlarkValues(sc.Delta)
		sc.slBidVolume = floatSliceToStarlarkValues(sc.BidVolume)
		sc.slAskVolume = floatSliceToStarlarkValues(sc.AskVolume)
		sc.slCumDelta = floatSliceToStarlarkValues(sc.CumDelta)
	}

	sc.cachedLists = &cachedStarlarkLists{
		time:      frozenListFromValues(sc.slTime),
		open:      frozenListFromValues(sc.slOpen),
		high:      frozenListFromValues(sc.slHigh),
		low:       frozenListFromValues(sc.slLow),
		close:     frozenListFromValues(sc.slClose),
		volume:    frozenListFromValues(sc.slVolume),
		delta:     frozenListFromValues(sc.slDelta),
		cumDelta:  frozenListFromValues(sc.slCumDelta),
		bidVolume: frozenListFromValues(sc.slBidVolume),
		askVolume: frozenListFromValues(sc.slAskVolume),
	}
	sc.listsDirty = false
	return sc.cachedLists
}

// ToStarlark translates the ScriptContext into a Starlark struct accessible via ctx.* in scripts.
func (sc *ScriptContext) ToStarlark(evalCtx context.Context, grantedPerms []string, client *security.SafeHttpClient) *starlarkstruct.Struct {
	if evalCtx == nil {
		evalCtx = context.Background()
	}
	lists := sc.ensureCachedStarlarkLists()
	orderflowDict := starlark.StringDict{
		"delta":      lists.delta,
		"cum_delta":  lists.cumDelta,
		"bid_volume": lists.bidVolume,
		"ask_volume": lists.askVolume,
	}
	orderflowStruct := starlarkstruct.FromStringDict(starlark.String("orderflow"), orderflowDict)

	// ctx.http wrapper
	httpDict := starlark.StringDict{
		"get": starlark.NewBuiltin("ctx.http.get", func(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
			var (
				urlStr     string
				headersVal starlark.Value
			)
			if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "url", &urlStr, "headers?", &headersVal); err != nil {
				return nil, err
			}

			headers := make(map[string]string)
			if headersVal != nil {
				if d, ok := headersVal.(*starlark.Dict); ok {
					for _, item := range d.Items() {
						k, _ := item[0].(starlark.String)
						v, _ := item[1].(starlark.String)
						if k != "" && v != "" {
							headers[string(k)] = string(v)
						}
					}
				}
			}

			if client == nil {
				return nil, fmt.Errorf("http client is not configured")
			}

			reqCtx, cancel := context.WithTimeout(evalCtx, 5*time.Second)
			defer cancel()

			body, statusCode, err := client.Get(reqCtx, urlStr, headers, grantedPerms)
			if err != nil {
				return nil, fmt.Errorf("http error: %w", err)
			}

			// Try parsing as JSON or return raw text
			var jsonVal interface{}
			if err := json.Unmarshal(body, &jsonVal); err == nil {
				starVal, err := goValueToStarlark(jsonVal)
				if err == nil {
					return starVal, nil
				}
			}

			return starlarkstruct.FromStringDict(starlark.String("HttpResponse"), starlark.StringDict{
				"status": starlark.MakeInt(statusCode),
				"body":   starlark.String(string(body)),
			}), nil
		}),
	}
	httpStruct := starlarkstruct.FromStringDict(starlark.String("http"), httpDict)

	// ctx.ipc wrapper
	ipcDict := starlark.StringDict{
		"call": starlark.NewBuiltin("ctx.ipc.call", func(thread *starlark.Thread, fn *starlark.Builtin, args starlark.Tuple, kwargs []starlark.Tuple) (starlark.Value, error) {
			var (
				service string
				payload starlark.Value
			)
			if err := starlark.UnpackArgs(fn.Name(), args, kwargs, "service", &service, "payload?", &payload); err != nil {
				return nil, err
			}

			if err := security.CheckIPCAllowed(service, grantedPerms); err != nil {
				return nil, err
			}

			// IPC simulated stub for quant local services
			return starlark.String(fmt.Sprintf(`{"service":"%s","status":"ok"}`, service)), nil
		}),
	}
	ipcStruct := starlarkstruct.FromStringDict(starlark.String("ipc"), ipcDict)

	ctxDict := starlark.StringDict{
		"time":       lists.time,
		"open":       lists.open,
		"high":       lists.high,
		"low":        lists.low,
		"close":      lists.close,
		"volume":     lists.volume,
		"symbol":     starlark.String(sc.Symbol),
		"resolution": starlark.String(sc.Resolution),
		"orderflow":  orderflowStruct,
		"http":       httpStruct,
		"ipc":        ipcStruct,
	}

	return starlarkstruct.FromStringDict(starlark.String("ctx"), ctxDict)
}

func goValueToStarlark(v interface{}) (starlark.Value, error) {
	switch val := v.(type) {
	case nil:
		return starlark.None, nil
	case bool:
		return starlark.Bool(val), nil
	case string:
		return starlark.String(val), nil
	case float64:
		return starlark.Float(val), nil
	case int:
		return starlark.MakeInt(val), nil
	case int64:
		return starlark.MakeInt64(val), nil
	case []interface{}:
		elems := make([]starlark.Value, len(val))
		for i, el := range val {
			sEl, err := goValueToStarlark(el)
			if err != nil {
				return nil, err
			}
			elems[i] = sEl
		}
		return starlark.NewList(elems), nil
	case map[string]interface{}:
		dict := starlark.NewDict(len(val))
		for k, el := range val {
			sEl, err := goValueToStarlark(el)
			if err != nil {
				return nil, err
			}
			if err := dict.SetKey(starlark.String(k), sEl); err != nil {
				return nil, err
			}
		}
		return dict, nil
	default:
		return starlark.String(fmt.Sprintf("%v", val)), nil
	}
}
