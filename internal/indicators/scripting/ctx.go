package scripting

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/ordercraft-hq/terminal/internal/indicators/wickra"
	"github.com/ordercraft-hq/terminal/internal/security"
	"go.starlark.net/starlark"
	"go.starlark.net/starlarkstruct"
)

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

		// Estimate synthetic orderflow delta
		rng := c.High - c.Low
		var delta float64
		if rng > 1e-9 {
			delta = c.Volume * (c.Close - c.Open) / rng
		} else {
			if c.Close >= c.Open {
				delta = c.Volume * 0.5
			} else {
				delta = -c.Volume * 0.5
			}
		}

		ask := (c.Volume + delta) * 0.5
		bid := (c.Volume - delta) * 0.5
		if ask < 0 {
			ask = 0
		}
		if bid < 0 {
			bid = 0
		}

		runningCumDelta += delta
		sc.Delta[i] = delta
		sc.BidVolume[i] = bid
		sc.AskVolume[i] = ask
		sc.CumDelta[i] = runningCumDelta
	}

	return sc
}

func floatSliceToStarlarkList(vals []float64) *starlark.List {
	items := make([]starlark.Value, len(vals))
	for i, v := range vals {
		items[i] = starlark.Float(v)
	}
	return starlark.NewList(items)
}

func int64SliceToStarlarkList(vals []int64) *starlark.List {
	items := make([]starlark.Value, len(vals))
	for i, v := range vals {
		items[i] = starlark.MakeInt64(v)
	}
	return starlark.NewList(items)
}

// ToStarlark translates the ScriptContext into a Starlark struct accessible via ctx.* in scripts.
func (sc *ScriptContext) ToStarlark(grantedPerms []string, client *security.SafeHttpClient) *starlarkstruct.Struct {
	orderflowDict := starlark.StringDict{
		"delta":      floatSliceToStarlarkList(sc.Delta),
		"cum_delta":  floatSliceToStarlarkList(sc.CumDelta),
		"bid_volume": floatSliceToStarlarkList(sc.BidVolume),
		"ask_volume": floatSliceToStarlarkList(sc.AskVolume),
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

			reqCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
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
		"time":       int64SliceToStarlarkList(sc.Time),
		"open":       floatSliceToStarlarkList(sc.Open),
		"high":       floatSliceToStarlarkList(sc.High),
		"low":        floatSliceToStarlarkList(sc.Low),
		"close":      floatSliceToStarlarkList(sc.Close),
		"volume":     floatSliceToStarlarkList(sc.Volume),
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
