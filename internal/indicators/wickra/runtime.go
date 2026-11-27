package wickra

import (
	"context"
	_ "embed"
	"encoding/binary"
	"fmt"
	"math"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
)

//go:embed wickra.wasm
var wickraWasmBytecode []byte

type sessionContextKey struct{}

// SessionHostContext captures dynamic return values and heap objects from wasm-bindgen host callbacks.
type SessionHostContext struct {
	objects    map[uint32]any
	nextHandle uint32
	LastMap    map[string]float64
	BatchOut   []float64
	LastError  error
}

func NewSessionHostContext() *SessionHostContext {
	return &SessionHostContext{
		objects:    make(map[uint32]any),
		nextHandle: 1000,
	}
}

func (s *SessionHostContext) addHeapObject(obj any) uint32 {
	s.nextHandle++
	if s.nextHandle < 1000 {
		s.nextHandle = 1000
	}
	for s.objects[s.nextHandle] != nil {
		s.nextHandle++
		if s.nextHandle < 1000 {
			s.nextHandle = 1000
		}
	}
	s.objects[s.nextHandle] = obj
	return s.nextHandle
}

func (s *SessionHostContext) getHeapObject(handle uint32) any {
	return s.objects[handle]
}

func (s *SessionHostContext) dropHeapObject(handle uint32) {
	delete(s.objects, handle)
}

func (s *SessionHostContext) Reset() {
	// Preserve static schema descriptors (*[]string and string handles cached by Rust in WASM linear memory).
	// Purge dynamic return objects (such as map[string]float64) or unexpected transient state.
	for h, obj := range s.objects {
		switch obj.(type) {
		case *[]string, string:
			// Static wasm-bindgen schema cache: must persist across worker reuse
			continue
		default:
			delete(s.objects, h)
		}
	}
	s.LastMap = nil
	s.BatchOut = s.BatchOut[:0]
	s.LastError = nil
}

func WithSessionHost(ctx context.Context, s *SessionHostContext) context.Context {
	return context.WithValue(ctx, sessionContextKey{}, s)
}

func GetSessionHost(ctx context.Context) *SessionHostContext {
	if s, ok := ctx.Value(sessionContextKey{}).(*SessionHostContext); ok {
		return s
	}
	return nil
}

// RegisterHostModule registers all 26 required wasm-bindgen intrinsics under "./wickra_wasm_bg.js".
func RegisterHostModule(ctx context.Context, r wazero.Runtime) error {
	builder := r.NewHostModuleBuilder("./wickra_wasm_bg.js")

	// 1. Array creation: new Array()
	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module) uint32 {
			if s := GetSessionHost(ctx); s != nil {
				arr := make([]string, 0, 8)
				return s.addHeapObject(&arr)
			}
			return 1001
		}).Export("__wbg_new_ffa92086ea89f79c")

	// 2. String decoding intrinsic: ptr, len -> string handle
	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, ptr, length uint32) uint32 {
			if s := GetSessionHost(ctx); s != nil {
				if ptr == 0 {
					// Cast intrinsic: return heap object cached at handle 'length'
					obj := s.getHeapObject(length)
					return s.addHeapObject(obj)
				}
				bytes, ok := m.Memory().Read(ptr, length)
				if ok {
					return s.addHeapObject(string(bytes))
				}
			}
			return 1002
		}).Export("__wbindgen_generic_0000000000000002")

	// 3. Array push: push(arr, item)
	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, arrHandle, itemHandle uint32) uint32 {
			if s := GetSessionHost(ctx); s != nil {
				if arrPtr, ok := s.getHeapObject(arrHandle).(*[]string); ok {
					if str, ok := s.getHeapObject(itemHandle).(string); ok {
						*arrPtr = append(*arrPtr, str)
						return uint32(len(*arrPtr))
					}
				}
			}
			return 0
		}).Export("__wbg_push_bfdf956ba476f65b")

	// 4. Object drop ref
	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, handle uint32) {
			if s := GetSessionHost(ctx); s != nil {
				s.dropHeapObject(handle)
			}
		}).Export("__wbindgen_object_drop_ref")

	// 5. Multi-value constructors (obj2 through obj9)
	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, arrHandle uint32, v0, v1 float64) uint32 {
			if s := GetSessionHost(ctx); s != nil {
				res := make(map[string]float64, 2)
				if arrPtr, ok := s.getHeapObject(arrHandle).(*[]string); ok && len(*arrPtr) >= 2 {
					res[(*arrPtr)[0]] = v0
					res[(*arrPtr)[1]] = v1
				} else {
					res["0"] = v0
					res["1"] = v1
				}
				s.LastMap = res
				return s.addHeapObject(res)
			}
			return 2002
		}).Export("__wbg_obj2_61d8faab81f9b008")

	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, arrHandle uint32, v0, v1, v2 float64) uint32 {
			if s := GetSessionHost(ctx); s != nil {
				res := make(map[string]float64, 3)
				if arrPtr, ok := s.getHeapObject(arrHandle).(*[]string); ok && len(*arrPtr) >= 3 {
					res[(*arrPtr)[0]] = v0
					res[(*arrPtr)[1]] = v1
					res[(*arrPtr)[2]] = v2
				} else {
					res["0"] = v0
					res["1"] = v1
					res["2"] = v2
				}
				s.LastMap = res
				return s.addHeapObject(res)
			}
			return 2003
		}).Export("__wbg_obj3_f7e4af894286ca96")

	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, arrHandle uint32, v0, v1, v2, v3 float64) uint32 {
			if s := GetSessionHost(ctx); s != nil {
				res := make(map[string]float64, 4)
				if arrPtr, ok := s.getHeapObject(arrHandle).(*[]string); ok && len(*arrPtr) >= 4 {
					res[(*arrPtr)[0]] = v0
					res[(*arrPtr)[1]] = v1
					res[(*arrPtr)[2]] = v2
					res[(*arrPtr)[3]] = v3
				} else {
					res["0"] = v0
					res["1"] = v1
					res["2"] = v2
					res["3"] = v3
				}
				s.LastMap = res
				return s.addHeapObject(res)
			}
			return 2004
		}).Export("__wbg_obj4_fac0b53de01704ca")

	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, arrHandle uint32, v0, v1, v2, v3, v4 float64) uint32 {
			if s := GetSessionHost(ctx); s != nil {
				res := make(map[string]float64, 5)
				if arrPtr, ok := s.getHeapObject(arrHandle).(*[]string); ok && len(*arrPtr) >= 5 {
					res[(*arrPtr)[0]] = v0
					res[(*arrPtr)[1]] = v1
					res[(*arrPtr)[2]] = v2
					res[(*arrPtr)[3]] = v3
					res[(*arrPtr)[4]] = v4
				} else {
					res["0"] = v0
					res["1"] = v1
					res["2"] = v2
					res["3"] = v3
					res["4"] = v4
				}
				s.LastMap = res
				return s.addHeapObject(res)
			}
			return 2005
		}).Export("__wbg_obj5_717719cc479361f2")

	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, arrHandle uint32, v0, v1, v2, v3, v4, v5 float64) uint32 {
			if s := GetSessionHost(ctx); s != nil {
				res := make(map[string]float64, 6)
				if arrPtr, ok := s.getHeapObject(arrHandle).(*[]string); ok && len(*arrPtr) >= 6 {
					res[(*arrPtr)[0]] = v0
					res[(*arrPtr)[1]] = v1
					res[(*arrPtr)[2]] = v2
					res[(*arrPtr)[3]] = v3
					res[(*arrPtr)[4]] = v4
					res[(*arrPtr)[5]] = v5
				} else {
					res["0"] = v0
					res["1"] = v1
					res["2"] = v2
					res["3"] = v3
					res["4"] = v4
					res["5"] = v5
				}
				s.LastMap = res
				return s.addHeapObject(res)
			}
			return 2006
		}).Export("__wbg_obj6_24b1e09158632040")

	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, arrHandle uint32, v0, v1, v2, v3, v4, v5, v6 float64) uint32 {
			if s := GetSessionHost(ctx); s != nil {
				res := make(map[string]float64, 7)
				if arrPtr, ok := s.getHeapObject(arrHandle).(*[]string); ok && len(*arrPtr) >= 7 {
					res[(*arrPtr)[0]] = v0
					res[(*arrPtr)[1]] = v1
					res[(*arrPtr)[2]] = v2
					res[(*arrPtr)[3]] = v3
					res[(*arrPtr)[4]] = v4
					res[(*arrPtr)[5]] = v5
					res[(*arrPtr)[6]] = v6
				} else {
					res["0"] = v0
					res["1"] = v1
					res["2"] = v2
					res["3"] = v3
					res["4"] = v4
					res["5"] = v5
					res["6"] = v6
				}
				s.LastMap = res
				return s.addHeapObject(res)
			}
			return 2007
		}).Export("__wbg_obj7_0496b5e935972ea4")

	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, arrHandle uint32, v0, v1, v2, v3, v4, v5, v6, v7, v8 float64) uint32 {
			if s := GetSessionHost(ctx); s != nil {
				res := make(map[string]float64, 9)
				if arrPtr, ok := s.getHeapObject(arrHandle).(*[]string); ok && len(*arrPtr) >= 9 {
					res[(*arrPtr)[0]] = v0
					res[(*arrPtr)[1]] = v1
					res[(*arrPtr)[2]] = v2
					res[(*arrPtr)[3]] = v3
					res[(*arrPtr)[4]] = v4
					res[(*arrPtr)[5]] = v5
					res[(*arrPtr)[6]] = v6
					res[(*arrPtr)[7]] = v7
					res[(*arrPtr)[8]] = v8
				} else {
					res["0"] = v0
					res["1"] = v1
					res["2"] = v2
					res["3"] = v3
					res["4"] = v4
					res["5"] = v5
					res["6"] = v6
					res["7"] = v7
					res["8"] = v8
				}
				s.LastMap = res
				return s.addHeapObject(res)
			}
			return 2009
		}).Export("__wbg_obj9_61e2b26f6c3f82f6")

	// 6. Batch output slice capture: new Float64Array(ptr, len)
	// Read linear memory synchronously inside the callback before Rust drops its Vec<f64>.
	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, ptr, length uint32) uint32 {
			if s := GetSessionHost(ctx); s != nil {
				if length == 0 {
					s.BatchOut = s.BatchOut[:0]
					return 3001
				}
				if length <= (1<<28) && ptr != 0 {
					if raw, ok := m.Memory().Read(ptr, length*8); ok {
						n := int(length)
						if cap(s.BatchOut) < n {
							s.BatchOut = make([]float64, n)
						} else {
							s.BatchOut = s.BatchOut[:n]
						}
						for i := 0; i < n; i++ {
							s.BatchOut[i] = math.Float64frombits(binary.LittleEndian.Uint64(raw[i*8 : (i+1)*8]))
						}
					}
				}
			}
			return 3001
		}).Export("__wbg_new_from_slice_3b4c7f1456059f80")

	// 7. Error handlers & intrinsics
	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, ptr, length uint32) {
			bytes, _ := m.Memory().Read(ptr, length)
			if s := GetSessionHost(ctx); s != nil {
				s.LastError = fmt.Errorf("wasm throw: %s", string(bytes))
			}
		}).Export("__wbg___wbindgen_throw_5d9e815e6fdf150f")

	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, ptr, length uint32) uint32 {
			bytes, _ := m.Memory().Read(ptr, length)
			if s := GetSessionHost(ctx); s != nil {
				s.LastError = fmt.Errorf("wasm error: %s", string(bytes))
			}
			return 4001
		}).Export("__wbg_Error_67e7344beaa85059")

	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, ptr, length uint32) {}).
		Export("__wbg_error_757e9472f8410341")

	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module) uint32 { return 4002 }).
		Export("__wbg_new_227d7c05414eb861")

	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, a, b uint32) {}).
		Export("__wbg_stack_3b0d974bbf31e44f")

	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, a uint32) uint32 { return 0 }).
		Export("__wbg_length_4e1adc0d42e23620")

	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, a uint32) uint32 { return 0 }).
		Export("__wbg_length_598aff98d0c65a59")

	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, a, b uint32) uint32 { return 0 }).
		Export("__wbg_get_unchecked_363572bdd397d473")

	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, a uint32) uint32 { return a }).
		Export("__wbg_from_a39669ce566077da")

	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, a, b, c uint32) {}).
		Export("__wbg_prototypesetcall_5c62be9626638df9")

	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, a, b, c uint32) uint32 { return 1 }).
		Export("__wbg_set_a377297433dfea63")

	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, a uint32) uint32 { return 1 }).
		Export("__wbg___wbindgen_boolean_get_7a12af2b3f899c5a")

	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, a, b, c uint32) {}).
		Export("__wbg___wbindgen_copy_to_typed_array_cccd104be8cf0b8d")

	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, v float64) uint32 { return 5001 }).
		Export("__wbindgen_generic_0000000000000001")

	_, err := builder.Instantiate(ctx)
	return err
}

const maxPooledWorkers = 32

// Engine wraps the WebAssembly runtime, compiled module, worker pool, and catalog.
type Engine struct {
	runtime     wazero.Runtime
	compiledMod wazero.CompiledModule
	idleWorkers chan *Worker
	closed      atomic.Bool
	sessionSeq  uint64
	catalog     *Catalog
}

// Worker wraps an instantiated WebAssembly module with linear memory access and functions.
type Worker struct {
	Mod            api.Module
	Session        *SessionHostContext
	Malloc         api.Function
	Free           api.Function
	AddSP          api.Function
	batchScratchIn []byte
	Tainted        bool
}

// NewEngine compiles wickra.wasm and initializes the worker pool.
func NewEngine(ctx context.Context) (*Engine, error) {
	config := wazero.NewRuntimeConfigCompiler().
		WithMemoryLimitPages(2048). // 128 MB max sandbox
		WithCloseOnContextDone(true)

	r := wazero.NewRuntimeWithConfig(ctx, config)
	if err := RegisterHostModule(ctx, r); err != nil {
		r.Close(ctx)
		return nil, fmt.Errorf("register host module: %w", err)
	}

	compiled, err := r.CompileModule(ctx, wickraWasmBytecode)
	if err != nil {
		r.Close(ctx)
		return nil, fmt.Errorf("compile wasm: %w", err)
	}

	cat := DefaultCatalog()
	engine := &Engine{
		runtime:     r,
		compiledMod: compiled,
		idleWorkers: make(chan *Worker, maxPooledWorkers),
		catalog:     cat,
	}

	return engine, nil
}

func (e *Engine) spawnWorker(ctx context.Context) (*Worker, error) {
	name := fmt.Sprintf("worker_%d", atomic.AddUint64(&e.sessionSeq, 1))
	config := wazero.NewModuleConfig().WithName(name)
	mod, err := e.runtime.InstantiateModule(ctx, e.compiledMod, config)
	if err != nil {
		return nil, err
	}

	return &Worker{
		Mod:     mod,
		Session: NewSessionHostContext(),
		Malloc:  mod.ExportedFunction("__wbindgen_export3"),
		Free:    mod.ExportedFunction("__wbindgen_export"),
		AddSP:   mod.ExportedFunction("__wbindgen_add_to_stack_pointer"),
	}, nil
}

func (e *Engine) acquireWorker() *Worker {
	for {
		select {
		case w := <-e.idleWorkers:
			if w != nil && w.Mod != nil && !w.Mod.IsClosed() && !w.Tainted {
				return w
			}
		default:
			w, err := e.spawnWorker(context.Background())
			if err != nil {
				panic(fmt.Sprintf("failed to spawn wasm worker: %v", err))
			}
			return w
		}
	}
}

func (e *Engine) releaseWorker(w *Worker) {
	if w == nil || w.Mod == nil || w.Mod.IsClosed() {
		return
	}
	if w.Tainted || e.closed.Load() {
		// Discard modules that trapped, leaked guest allocations, errored, or outlived the engine.
		_ = w.Mod.Close(context.Background())
		return
	}
	w.Session.Reset()
	select {
	case e.idleWorkers <- w:
	default:
		_ = w.Mod.Close(context.Background())
	}
}

// Close closes the underlying Wazero runtime.
func (e *Engine) Close(ctx context.Context) error {
	e.closed.Store(true)
	for {
		select {
		case w := <-e.idleWorkers:
			if w != nil && w.Mod != nil {
				_ = w.Mod.Close(ctx)
			}
		default:
			return e.runtime.Close(ctx)
		}
	}
}

// Catalog returns the 515 indicator catalog.
func (e *Engine) Catalog() *Catalog {
	return e.catalog
}

// GetCatalog returns descriptors filtered by category or search query.
func (e *Engine) GetCatalog(category, query string) []IndicatorDescriptor {
	return e.catalog.Filter(category, query)
}

// GetDescriptor looks up an indicator descriptor by catalog ID or WASM class name.
func (e *Engine) GetDescriptor(id string) (IndicatorDescriptor, bool) {
	if d, ok := e.catalog.GetByID(id); ok {
		return *d, true
	}
	if d, ok := e.catalog.GetByWasmClass(id); ok {
		return *d, true
	}
	return IndicatorDescriptor{}, false
}

// isDirectionalStopIndicator returns true for trailing stop indicators whose WASM output
// contains "value" and "direction" and should be partitioned into "up" and "down" plots.
func isDirectionalStopIndicator(id string) bool {
	switch id {
	case "wickra.super_trend",
		"wickra.atr_ratchet",
		"wickra.elder_safe_zone",
		"wickra.kase_dev_stop",
		"wickra.modified_ma_stop",
		"wickra.nrtr":
		return true
	default:
		return false
	}
}

// isSlopeIndicator returns true for moving average indicators whose WASM output
// is a single float64 and should be partitioned into "up" and "down" plots based on slope.
func isSlopeIndicator(id string) bool {
	switch id {
	case "wickra.t3",
		"wickra.hma":
		return true
	default:
		return false
	}
}

type sourceKind uint8

const (
	sourceClose sourceKind = iota
	sourceOpen
	sourceHigh
	sourceLow
	sourceHL2
	sourceHLC3
	sourceOHLC4
)

func parseSourceKind(source string) sourceKind {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case "open":
		return sourceOpen
	case "high":
		return sourceHigh
	case "low":
		return sourceLow
	case "hl2":
		return sourceHL2
	case "hlc3":
		return sourceHLC3
	case "ohlc4":
		return sourceOHLC4
	default:
		return sourceClose
	}
}

func extractSourceValue(kind sourceKind, c CandleData) float64 {
	switch kind {
	case sourceOpen:
		return c.Open
	case sourceHigh:
		return c.High
	case sourceLow:
		return c.Low
	case sourceHL2:
		return (c.High + c.Low) / 2.0
	case sourceHLC3:
		return (c.High + c.Low + c.Close) / 3.0
	case sourceOHLC4:
		return (c.Open + c.High + c.Low + c.Close) / 4.0
	default:
		return c.Close
	}
}

type inputLayoutKind uint8

const (
	layoutSource1 inputLayoutKind = iota
	layoutVolume1
	layoutSourceVolume2
	layoutHighLow2
	layoutHighLowVolume3
	layoutHighLowClose3
	layoutHighLowCloseVolume4
	layoutOHLC4
	layoutOHLCV5
)

func resolveInputLayout(desc *IndicatorDescriptor, numInputs int) inputLayoutKind {
	if desc != nil {
		switch desc.WasmClass {
		case "VolumeOscillator":
			if numInputs == 1 {
				return layoutVolume1
			}
		case "OBV", "ForceIndex", "TSV", "TradeVolumeIndex", "VZO", "VolumePriceTrend",
			"VolumeRsi", "VolumeWeightedMacd", "EVWMA", "VWMA", "NVI", "PVI":
			if numInputs == 2 {
				return layoutSourceVolume2
			}
		case "EaseOfMovement", "MarketFacilitationIndex", "VolumeWeightedSr":
			if numInputs == 3 {
				return layoutHighLowVolume3
			}
		case "VWAP", "AnchoredVWAP", "RollingVWAP", "ADL", "ChaikinMoneyFlow",
			"ChaikinOscillator", "DemandIndex", "IntradayIntensity", "TwiggsMoneyFlow":
			if numInputs == 4 {
				return layoutHighLowCloseVolume4
			}
		}
	}

	switch numInputs {
	case 1:
		return layoutSource1
	case 2:
		return layoutHighLow2
	case 3:
		return layoutHighLowClose3
	case 4:
		return layoutOHLC4
	case 5:
		return layoutOHLCV5
	default:
		return layoutSource1
	}
}

// IndicatorInstance wraps an allocated Rust indicator struct in WASM linear memory.
type IndicatorInstance struct {
	worker       *Worker
	ptr          uint32
	isMulti      bool
	hasRetptr    bool
	isDirStop    bool
	isSlope      bool
	numInputs    int
	source       string
	sourceKind   sourceKind
	layoutKind   inputLayoutKind
	updateFn     api.Function
	batchFn      api.Function
	freeFn       api.Function
	warmupPeriod uint32
	desc         *IndicatorDescriptor
	prevSlopeVal float64
	hasPrevSlope bool
	slopeRegime  int
	inputBuf     [5]float64
	callArgsBuf  [7]uint64
	customUpdate func(ctx context.Context, candle CandleData) (float64, map[string]float64, bool, error)
	customFree   func(ctx context.Context)
}

const stackAlloc16 uint64 = 0xFFFFFFF0 // -16 in 32-bit two's complement
const stackAlloc64 uint64 = 0xFFFFFFC0 // -64 in 32-bit two's complement

func toInt(v any) int32 {
	switch n := v.(type) {
	case int:
		return int32(n)
	case int32:
		return n
	case int64:
		return int32(n)
	case float64:
		return int32(n)
	case float32:
		return int32(n)
	default:
		return 0
	}
}

func toFloat(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int32:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return 0
	}
}

func (w *Worker) NewIndicator(ctx context.Context, desc *IndicatorDescriptor, inputs map[string]interface{}) (*IndicatorInstance, error) {
	if desc.ID == "wickra.vwap" || desc.ID == "wickra.vwap_std_dev_bands" || desc.WasmClass == "VWAP" || desc.WasmClass == "VwapStdDevBands" {
		return NewVWAPIndicatorInstance(desc, inputs), nil
	}

	ctx = WithSessionHost(ctx, w.Session)
	w.Session.LastError = nil

	prefix := strings.ToLower(desc.WasmClass)
	newFn := w.Mod.ExportedFunction(prefix + "_new")
	if newFn == nil {
		return nil, fmt.Errorf("indicator %q constructor %s_new not found", desc.ID, prefix)
	}

	// Identify constructor parameters (all non-source inputs)
	var constructorInputs []InputSchema
	for _, inp := range desc.Inputs {
		if inp.Type != InputTypeSource {
			constructorInputs = append(constructorInputs, inp)
		}
	}

	paramTypes := newFn.Definition().ParamTypes()
	isDirectReturn := len(newFn.Definition().ResultTypes()) > 0
	var instPtr uint32

	if isDirectReturn {
		callArgs := make([]uint64, 0, len(paramTypes))
		for i := 0; i < len(paramTypes); i++ {
			targetType := paramTypes[i]
			inpIdx := i
			var val any = 0
			if inpIdx < len(constructorInputs) {
				schema := constructorInputs[inpIdx]
				if v, ok := inputs[schema.ID]; ok && v != nil {
					val = v
				} else if schema.ID == "period" && inputs["length"] != nil {
					val = inputs["length"]
				} else if schema.ID == "length" && inputs["period"] != nil {
					val = inputs["period"]
				} else {
					val = schema.Default
				}
				val = clampSchemaInput(schema, val)
			}

			if targetType == api.ValueTypeI32 {
				callArgs = append(callArgs, uint64(uint32(toInt(val))))
			} else if targetType == api.ValueTypeF64 {
				callArgs = append(callArgs, api.EncodeF64(toFloat(val)))
			} else if targetType == api.ValueTypeI64 {
				callArgs = append(callArgs, uint64(int64(toInt(val))))
			} else if targetType == api.ValueTypeF32 {
				callArgs = append(callArgs, uint64(api.EncodeF32(float32(toFloat(val)))))
			} else {
				callArgs = append(callArgs, 0)
			}
		}

		res, err := newFn.Call(ctx, callArgs...)
		if err != nil {
			w.Tainted = true
			return nil, fmt.Errorf("constructor call error for %q: %w", desc.ID, err)
		}
		if len(res) == 0 || res[0] == 0 || w.Session.LastError != nil {
			w.Tainted = true
			return nil, fmt.Errorf("constructor failed for %q (lastErr=%v)", desc.ID, w.Session.LastError)
		}
		instPtr = uint32(res[0])
	} else {
		// Allocate stack frame for constructor return pointer (16 bytes)
		spRes, err := w.AddSP.Call(ctx, stackAlloc16)
		if err != nil {
			w.Tainted = true
			return nil, err
		}
		retptr := uint32(spRes[0])
		defer w.AddSP.Call(ctx, uint64(int32(16)))

		callArgs := []uint64{uint64(retptr)}

		for i := 1; i < len(paramTypes); i++ {
			targetType := paramTypes[i]
			inpIdx := i - 1
			var val any = 0
			if inpIdx < len(constructorInputs) {
				schema := constructorInputs[inpIdx]
				if v, ok := inputs[schema.ID]; ok && v != nil {
					val = v
				} else if schema.ID == "period" && inputs["length"] != nil {
					val = inputs["length"]
				} else if schema.ID == "length" && inputs["period"] != nil {
					val = inputs["period"]
				} else {
					val = schema.Default
				}
				val = clampSchemaInput(schema, val)
			}

			if targetType == api.ValueTypeI32 {
				callArgs = append(callArgs, uint64(uint32(toInt(val))))
			} else if targetType == api.ValueTypeF64 {
				callArgs = append(callArgs, api.EncodeF64(toFloat(val)))
			} else if targetType == api.ValueTypeI64 {
				callArgs = append(callArgs, uint64(int64(toInt(val))))
			} else if targetType == api.ValueTypeF32 {
				callArgs = append(callArgs, uint64(api.EncodeF32(float32(toFloat(val)))))
			} else {
				callArgs = append(callArgs, 0)
			}
		}

		if _, err := newFn.Call(ctx, callArgs...); err != nil {
			w.Tainted = true
			return nil, fmt.Errorf("constructor call error for %q: %w", desc.ID, err)
		}

		instPtr, _ = w.Mod.Memory().ReadUint32Le(retptr)
		errFlag, _ := w.Mod.Memory().ReadUint32Le(retptr + 8)
		if errFlag != 0 || instPtr == 0 || w.Session.LastError != nil {
			w.Tainted = true
			return nil, fmt.Errorf("constructor failed for %q (errFlag=%d, lastErr=%v)", desc.ID, errFlag, w.Session.LastError)
		}
	}

	updateFn := w.Mod.ExportedFunction(prefix + "_update")
	if updateFn == nil {
		return nil, fmt.Errorf("indicator %q update function %s_update not found", desc.ID, prefix)
	}
	freeFn := w.Mod.ExportedFunction("__wbg_" + prefix + "_free")

	hasRetptr := len(updateFn.Definition().ResultTypes()) == 0
	isSlope := isSlopeIndicator(desc.ID)
	isDirStop := isDirectionalStopIndicator(desc.ID)
	// Prevent slope-dependent single-output indicators from being flagged as multi-output
	// when catalog.go declares additional plot directives for "up" and "down".
	isMulti := (len(desc.Plots) > 1 || !hasRetptr) && !isSlope
	var numInputs int
	if hasRetptr {
		numInputs = len(updateFn.Definition().ParamTypes()) - 2
	} else {
		numInputs = len(updateFn.Definition().ParamTypes()) - 1
	}
	if numInputs < 1 {
		numInputs = 1
	}

	var batchFn api.Function
	if !isMulti && numInputs == 1 {
		if bf := w.Mod.ExportedFunction(prefix + "_batch"); bf != nil {
			def := bf.Definition()
			pt := def.ParamTypes()
			rt := def.ResultTypes()
			if len(pt) == 3 && len(rt) == 1 && pt[0] == api.ValueTypeI32 && pt[1] == api.ValueTypeI32 && pt[2] == api.ValueTypeI32 && rt[0] == api.ValueTypeI32 {
				batchFn = bf
			}
		}
	}

	var warmup uint32
	if wpFn := w.Mod.ExportedFunction(prefix + "_warmupPeriod"); wpFn != nil {
		if wpRes, err := wpFn.Call(ctx, uint64(instPtr)); err == nil && len(wpRes) > 0 {
			warmup = uint32(wpRes[0])
		}
	}

	sourceField := "close"
	if s, ok := inputs["source"].(string); ok && s != "" {
		sourceField = s
	}

	return &IndicatorInstance{
		worker:       w,
		ptr:          instPtr,
		isMulti:      isMulti,
		hasRetptr:    hasRetptr,
		isDirStop:    isDirStop,
		isSlope:      isSlope,
		numInputs:    numInputs,
		source:       sourceField,
		sourceKind:   parseSourceKind(sourceField),
		layoutKind:   resolveInputLayout(desc, numInputs),
		updateFn:     updateFn,
		batchFn:      batchFn,
		freeFn:       freeFn,
		warmupPeriod: warmup,
		desc:         desc,
	}, nil
}

func (inst *IndicatorInstance) fillInputs(c CandleData) []float64 {
	switch inst.layoutKind {
	case layoutVolume1:
		inst.inputBuf[0] = c.Volume
		return inst.inputBuf[:1]
	case layoutSourceVolume2:
		inst.inputBuf[0] = extractSourceValue(inst.sourceKind, c)
		inst.inputBuf[1] = c.Volume
		return inst.inputBuf[:2]
	case layoutHighLow2:
		inst.inputBuf[0] = c.High
		inst.inputBuf[1] = c.Low
		return inst.inputBuf[:2]
	case layoutHighLowVolume3:
		inst.inputBuf[0] = c.High
		inst.inputBuf[1] = c.Low
		inst.inputBuf[2] = c.Volume
		return inst.inputBuf[:3]
	case layoutHighLowClose3:
		inst.inputBuf[0] = c.High
		inst.inputBuf[1] = c.Low
		inst.inputBuf[2] = c.Close
		return inst.inputBuf[:3]
	case layoutHighLowCloseVolume4:
		inst.inputBuf[0] = c.High
		inst.inputBuf[1] = c.Low
		inst.inputBuf[2] = c.Close
		inst.inputBuf[3] = c.Volume
		return inst.inputBuf[:4]
	case layoutOHLC4:
		inst.inputBuf[0] = c.Open
		inst.inputBuf[1] = c.High
		inst.inputBuf[2] = c.Low
		inst.inputBuf[3] = c.Close
		return inst.inputBuf[:4]
	case layoutOHLCV5:
		inst.inputBuf[0] = c.Open
		inst.inputBuf[1] = c.High
		inst.inputBuf[2] = c.Low
		inst.inputBuf[3] = c.Close
		inst.inputBuf[4] = c.Volume
		return inst.inputBuf[:5]
	default:
		inst.inputBuf[0] = extractSourceValue(inst.sourceKind, c)
		return inst.inputBuf[:1]
	}
}

func ensureSessionHost(ctx context.Context, session *SessionHostContext) context.Context {
	if GetSessionHost(ctx) == session {
		return ctx
	}
	return WithSessionHost(ctx, session)
}

// Update performs an O(1) streaming step. Returns (singleVal, multiVal, isReady, error).
func (inst *IndicatorInstance) Update(ctx context.Context, candle CandleData) (float64, map[string]float64, bool, error) {
	if inst.customUpdate != nil {
		return inst.customUpdate(ctx, candle)
	}
	ctx = ensureSessionHost(ctx, inst.worker.Session)
	return inst.updateWithRetptr(ctx, candle, 0)
}

// updateWithRetptr executes a single bar step, optionally reusing a caller-allocated WASM stack retptr.
func (inst *IndicatorInstance) updateWithRetptr(ctx context.Context, candle CandleData, sharedRetptr uint32) (float64, map[string]float64, bool, error) {
	if inst.customUpdate != nil {
		return inst.customUpdate(ctx, candle)
	}

	w := inst.worker
	inputVals := inst.fillInputs(candle)

	if inst.isMulti {
		if inst.hasRetptr {
			retptr := sharedRetptr
			var allocatedStack bool
			if retptr == 0 {
				spRes, err := w.AddSP.Call(ctx, stackAlloc64)
				if err != nil {
					return 0, nil, false, err
				}
				retptr = uint32(spRes[0])
				allocatedStack = true
			}

			inst.callArgsBuf[0] = uint64(retptr)
			inst.callArgsBuf[1] = uint64(inst.ptr)
			for i, v := range inputVals {
				inst.callArgsBuf[2+i] = api.EncodeF64(v)
			}
			callArgs := inst.callArgsBuf[:2+len(inputVals)]

			_, err := inst.updateFn.Call(ctx, callArgs...)
			if err != nil {
				if allocatedStack {
					_, _ = w.AddSP.Call(ctx, uint64(int32(64)))
				}
				return 0, nil, false, err
			}

			status, _ := w.Mod.Memory().ReadUint32Le(retptr)
			if allocatedStack {
				_, _ = w.AddSP.Call(ctx, uint64(int32(64)))
			}
			if status == 0 {
				return math.NaN(), nil, false, nil // Warming up
			}

			// Take ownership of the freshly allocated LastMap instead of copying it.
			outMap := w.Session.LastMap
			w.Session.dropHeapObject(status)
			w.Session.LastMap = nil

			return 0, outMap, true, nil
		}

		inst.callArgsBuf[0] = uint64(inst.ptr)
		for i, v := range inputVals {
			inst.callArgsBuf[1+i] = api.EncodeF64(v)
		}
		callArgs := inst.callArgsBuf[:1+len(inputVals)]

		res, err := inst.updateFn.Call(ctx, callArgs...)
		if err != nil {
			return 0, nil, false, err
		}
		if res[0] == 0 {
			return math.NaN(), nil, false, nil // Warming up
		}

		// Take ownership of the freshly allocated LastMap instead of copying it.
		outMap := w.Session.LastMap
		w.Session.dropHeapObject(uint32(res[0]))
		w.Session.LastMap = nil

		return 0, outMap, true, nil
	}

	// Single output
	retptr := sharedRetptr
	var allocatedStack bool
	if retptr == 0 {
		spRes, err := w.AddSP.Call(ctx, stackAlloc16)
		if err != nil {
			return 0, nil, false, err
		}
		retptr = uint32(spRes[0])
		allocatedStack = true
	}

	inst.callArgsBuf[0] = uint64(retptr)
	inst.callArgsBuf[1] = uint64(inst.ptr)
	for i, v := range inputVals {
		inst.callArgsBuf[2+i] = api.EncodeF64(v)
	}
	callArgs := inst.callArgsBuf[:2+len(inputVals)]

	_, err := inst.updateFn.Call(ctx, callArgs...)
	if err != nil {
		if allocatedStack {
			_, _ = w.AddSP.Call(ctx, uint64(int32(16)))
		}
		return 0, nil, false, err
	}

	status, _ := w.Mod.Memory().ReadUint32Le(retptr)
	var valBits uint64
	if status != 0 {
		valBits, _ = w.Mod.Memory().ReadUint64Le(retptr + 8)
	}
	if allocatedStack {
		_, _ = w.AddSP.Call(ctx, uint64(int32(16)))
	}
	if status == 0 {
		return math.NaN(), nil, false, nil // Warming up
	}

	return api.DecodeF64(valBits), nil, true, nil
}

// clampSchemaInput enforces catalog Min/Max bounds and rejects NaN/Inf for numeric constructor inputs.
func clampSchemaInput(schema InputSchema, raw any) any {
	switch schema.Type {
	case InputTypeInteger:
		v := toInt(raw)
		if schema.Min != nil && float64(v) < *schema.Min {
			v = int32(*schema.Min)
		}
		if schema.Max != nil && float64(v) > *schema.Max {
			v = int32(*schema.Max)
		}
		return v
	case InputTypeFloat:
		v := toFloat(raw)
		if math.IsNaN(v) || math.IsInf(v, 0) {
			v = toFloat(schema.Default)
		}
		if schema.Min != nil && v < *schema.Min {
			v = *schema.Min
		}
		if schema.Max != nil && v > *schema.Max {
			v = *schema.Max
		}
		return v
	default:
		return raw
	}
}

// evalBatchSingleOutput runs `<prefix>_batch` using WASM linear memory and the `__wbg_new_from_slice` intrinsic.
func (inst *IndicatorInstance) evalBatchSingleOutput(ctx context.Context, candles []CandleData) ([]float64, bool, error) {
	if inst.batchFn == nil || inst.worker.Malloc == nil || inst.worker.Free == nil || len(candles) == 0 {
		return nil, false, nil
	}
	w := inst.worker
	n := len(candles)
	if n > (1 << 27) {
		return nil, false, fmt.Errorf("batch candle length %d exceeds linear memory limit", n)
	}
	byteLen := uint32(n * 8)

	if cap(w.batchScratchIn) < int(byteLen) {
		w.batchScratchIn = make([]byte, byteLen)
	}
	buf := w.batchScratchIn[:byteLen]
	for i, c := range candles {
		v := extractSourceValue(inst.sourceKind, c)
		binary.LittleEndian.PutUint64(buf[i*8:(i+1)*8], math.Float64bits(v))
	}

	mallocRes, err := w.Malloc.Call(ctx, uint64(byteLen), 8)
	if err != nil || len(mallocRes) == 0 || mallocRes[0] == 0 {
		if err != nil {
			w.Tainted = true
		}
		return nil, false, nil
	}
	inPtr := uint32(mallocRes[0])
	if !w.Mod.Memory().Write(inPtr, buf) {
		_, _ = w.Free.Call(ctx, uint64(inPtr), uint64(byteLen), 8)
		return nil, false, nil
	}

	w.Session.BatchOut = w.Session.BatchOut[:0]
	w.Session.LastError = nil

	// wasm-bindgen takes ownership of inPtr via FromWasmAbi and drops the output Vec<f64>
	// after invoking __wbg_new_from_slice; do not call w.Free again after batchFn returns.
	res, err := inst.batchFn.Call(ctx, uint64(inst.ptr), uint64(inPtr), uint64(n))
	if err != nil || w.Session.LastError != nil || len(w.Session.BatchOut) == 0 {
		if err != nil || w.Session.LastError != nil {
			w.Tainted = true
		}
		if len(res) > 0 && res[0] != 0 {
			w.Session.dropHeapObject(uint32(res[0]))
		}
		w.Session.BatchOut = w.Session.BatchOut[:0]
		return nil, false, err
	}

	if len(res) > 0 && res[0] != 0 {
		w.Session.dropHeapObject(uint32(res[0]))
	}
	return w.Session.BatchOut, true, nil
}

// Free cleans up the allocated Rust indicator in WASM linear memory.
func (inst *IndicatorInstance) Free(ctx context.Context) {
	if inst.customFree != nil {
		inst.customFree(ctx)
		inst.customFree = nil
	}
	if inst.freeFn != nil && inst.ptr != 0 {
		if inst.worker != nil && inst.worker.Mod != nil && !inst.worker.Mod.IsClosed() {
			_, _ = inst.freeFn.Call(ctx, uint64(inst.ptr), 0)
		}
		inst.ptr = 0
	}
}

func appendSingleEvalPoint(
	res *EvalResult,
	desc *IndicatorDescriptor,
	offsets map[string]int64,
	interval int64,
	candleTime int64,
	singleVal float64,
	isSlope bool,
	prevSlopePoint *SeriesPoint,
	hasPrevSlopePoint *bool,
	prevRegime *int,
) {
	if math.IsNaN(singleVal) || math.IsInf(singleVal, 0) {
		return
	}

	if isSlope {
		ptTime := candleTime
		if off, ok := offsets["plot"]; ok && off != 0 {
			ptTime += off * interval
		} else if off, ok := offsets["value"]; ok && off != 0 {
			ptTime += off * interval
		} else if off, ok := offsets["up"]; ok && off != 0 {
			ptTime += off * interval
		}

		currPt := SeriesPoint{Time: ptTime, Value: singleVal}

		// Retain continuous lines
		res.Plots["plot"] = append(res.Plots["plot"], currPt)
		res.Plots["value"] = append(res.Plots["value"], currPt)

		if !*hasPrevSlopePoint {
			*prevSlopePoint = currPt
			*hasPrevSlopePoint = true
		} else {
			slope := currPt.Value - prevSlopePoint.Value
			if slope > 0 {
				if *prevRegime != 1 {
					// Inflection from Down to Up: include transition anchor bar in Up
					res.Plots["up"] = append(res.Plots["up"], *prevSlopePoint)
					*prevRegime = 1
				}
				res.Plots["up"] = append(res.Plots["up"], currPt)
			} else if slope < 0 {
				if *prevRegime != -1 {
					// Inflection from Up to Down: include transition anchor bar in Down
					res.Plots["down"] = append(res.Plots["down"], *prevSlopePoint)
					*prevRegime = -1
				}
				res.Plots["down"] = append(res.Plots["down"], currPt)
			} else {
				// Flat slope: persist current regime (default to Up if unset)
				if *prevRegime == -1 {
					res.Plots["down"] = append(res.Plots["down"], currPt)
				} else {
					if *prevRegime == 0 {
						res.Plots["up"] = append(res.Plots["up"], *prevSlopePoint)
						*prevRegime = 1
					}
					res.Plots["up"] = append(res.Plots["up"], currPt)
				}
			}
			*prevSlopePoint = currPt
		}
		var dirVal float64 = 1.0
		if *prevRegime == -1 {
			dirVal = -1.0
		}
		res.Plots["direction"] = append(res.Plots["direction"], SeriesPoint{Time: ptTime, Value: dirVal})
		return
	}

	plotID := "plot"
	if len(desc.Plots) > 0 {
		plotID = desc.Plots[0].ID
	}
	ptTime := candleTime
	if off, ok := offsets[plotID]; ok && off != 0 {
		ptTime += off * interval
	}
	res.Plots[plotID] = append(res.Plots[plotID], SeriesPoint{
		Time:  ptTime,
		Value: singleVal,
	})
}

// Evaluate computes historical indicator plots for a batch of candles across multiple indicators.
func (e *Engine) Evaluate(ctx context.Context, candles []CandleData, configs []EvalIndicatorInstance) ([]EvalResult, error) {
	if len(configs) == 0 {
		return []EvalResult{}, nil
	}

	worker := e.acquireWorker()
	defer e.releaseWorker(worker)

	hostCtx := ensureSessionHost(ctx, worker.Session)
	results := make([]EvalResult, 0, len(configs))

	var interval int64 = 60
	if len(candles) >= 2 {
		interval = candles[len(candles)-1].Time - candles[len(candles)-2].Time
		if interval <= 0 {
			interval = 60
		}
	}

	for _, cfg := range configs {
		if err := ctx.Err(); err != nil {
			worker.Tainted = true
			return nil, err
		}
		indID := cfg.IndicatorID
		if indID == "wickra.vwap_std_dev_bands" || indID == "VwapStdDevBands" {
			indID = "wickra.vwap"
		}
		desc, ok := e.catalog.GetByID(indID)
		if !ok {
			desc, ok = e.catalog.GetByWasmClass(indID)
			if !ok {
				return nil, fmt.Errorf("indicator %q not found in catalog", cfg.IndicatorID)
			}
		}

		inst, err := worker.NewIndicator(hostCtx, desc, cfg.Inputs)
		if err != nil {
			return nil, fmt.Errorf("instantiate indicator %q: %w", cfg.IndicatorID, err)
		}

		res := EvalResult{
			InstanceID:  cfg.InstanceID,
			IndicatorID: desc.ID,
			Plots:       make(map[string][]SeriesPoint),
		}

		// Ensure split plot slices are initialized to non-nil empty slices
		// to guarantee JSON serialization emits "[]" instead of "null".
		if inst.isDirStop {
			res.Plots["up"] = make([]SeriesPoint, 0, len(candles))
			res.Plots["down"] = make([]SeriesPoint, 0, len(candles))
			res.Plots["value"] = make([]SeriesPoint, 0, len(candles))
			res.Plots["direction"] = make([]SeriesPoint, 0, len(candles))
		} else if inst.isSlope {
			res.Plots["up"] = make([]SeriesPoint, 0, len(candles))
			res.Plots["down"] = make([]SeriesPoint, 0, len(candles))
			res.Plots["plot"] = make([]SeriesPoint, 0, len(candles))
			res.Plots["value"] = make([]SeriesPoint, 0, len(candles))
			res.Plots["direction"] = make([]SeriesPoint, 0, len(candles))
		} else if !inst.isMulti && len(candles) > 0 {
			plotID := "plot"
			if len(desc.Plots) > 0 {
				plotID = desc.Plots[0].ID
			}
			res.Plots[plotID] = make([]SeriesPoint, 0, len(candles))
		}

		// Check for plot offsets in cfg.Inputs (e.g. jawOffset, teethOffset, lipsOffset, or general offset)
		var offsets map[string]int64
		for k, v := range cfg.Inputs {
			lk := strings.ToLower(k)
			if lk == "offset" {
				if offsets == nil {
					offsets = make(map[string]int64)
				}
				val := int64(toInt(v))
				for _, p := range desc.Plots {
					offsets[p.ID] = val
				}
				offsets["plot"] = val
				offsets["up"] = val
				offsets["down"] = val
				offsets["value"] = val
				offsets["direction"] = val
			} else if strings.HasSuffix(lk, "offset") {
				plotPrefix := strings.TrimSuffix(lk, "offset")
				for _, p := range desc.Plots {
					if strings.EqualFold(p.ID, plotPrefix) {
						if offsets == nil {
							offsets = make(map[string]int64)
						}
						offsets[p.ID] = int64(toInt(v))
					}
				}
			}
		}

		var prevSlopePoint SeriesPoint
		var hasPrevSlopePoint bool
		var prevRegime int // +1 for Up, -1 for Down, 0 for Unset

		// Fast WASM batch path for single-input, single-output indicators
		if len(candles) >= 32 && inst.batchFn != nil && !inst.isMulti && inst.numInputs == 1 && inst.customUpdate == nil {
			batchVals, usedBatch, batchErr := inst.evalBatchSingleOutput(hostCtx, candles)
			if batchErr != nil {
				worker.Tainted = true
				inst.Free(hostCtx)
				return nil, fmt.Errorf("batch eval error on %q: %w", desc.ID, batchErr)
			}
			if usedBatch && len(batchVals) == len(candles) {
				for i, v := range batchVals {
					appendSingleEvalPoint(&res, desc, offsets, interval, candles[i].Time, v, inst.isSlope, &prevSlopePoint, &hasPrevSlopePoint, &prevRegime)
				}
				inst.Free(hostCtx)
				results = append(results, res)
				continue
			}
		}

		// Allocate a single reusable WASM stack retptr across the entire bar loop.
		var sharedRetptr uint32
		if inst.customUpdate == nil && (inst.hasRetptr || !inst.isMulti) {
			if spRes, spErr := worker.AddSP.Call(hostCtx, stackAlloc64); spErr == nil && len(spRes) > 0 {
				sharedRetptr = uint32(spRes[0])
			}
		}

		for _, c := range candles {
			if err := ctx.Err(); err != nil {
				worker.Tainted = true
				if sharedRetptr != 0 {
					_, _ = worker.AddSP.Call(context.Background(), uint64(int32(64)))
				}
				inst.Free(context.Background())
				return nil, err
			}
			singleVal, multiVal, isReady, err := inst.updateWithRetptr(hostCtx, c, sharedRetptr)
			if err != nil {
				worker.Tainted = true
				if sharedRetptr != 0 {
					_, _ = worker.AddSP.Call(hostCtx, uint64(int32(64)))
				}
				inst.Free(hostCtx)
				return nil, fmt.Errorf("eval error on %q: %w", desc.ID, err)
			}
			if !isReady {
				continue // Skip warmup bars
			}

			if inst.isMulti {
				if inst.isDirStop {
					val, valOk := multiVal["value"]
					dir, dirOk := multiVal["direction"]
					if !valOk || math.IsNaN(val) || math.IsInf(val, 0) {
						continue
					}
					if !dirOk || math.IsNaN(dir) || math.IsInf(dir, 0) {
						continue
					}

					ptTime := c.Time
					if off, ok := offsets["value"]; ok && off != 0 {
						ptTime += off * interval
					} else if off, ok := offsets["up"]; ok && off != 0 {
						ptTime += off * interval
					} else if off, ok := offsets["plot"]; ok && off != 0 {
						ptTime += off * interval
					}

					pt := SeriesPoint{Time: ptTime, Value: val}
					res.Plots["value"] = append(res.Plots["value"], pt)
					res.Plots["direction"] = append(res.Plots["direction"], SeriesPoint{Time: ptTime, Value: dir})

					if dir > 0 {
						res.Plots["up"] = append(res.Plots["up"], pt)
					} else if dir < 0 {
						res.Plots["down"] = append(res.Plots["down"], pt)
					}
				} else {
					for plotKey, val := range multiVal {
						if math.IsNaN(val) || math.IsInf(val, 0) {
							continue
						}
						ptTime := c.Time
						if off, ok := offsets[plotKey]; ok && off != 0 {
							ptTime += off * interval
						}
						res.Plots[plotKey] = append(res.Plots[plotKey], SeriesPoint{
							Time:  ptTime,
							Value: val,
						})
					}
				}
			} else {
				appendSingleEvalPoint(&res, desc, offsets, interval, c.Time, singleVal, inst.isSlope, &prevSlopePoint, &hasPrevSlopePoint, &prevRegime)
			}
		}

		if sharedRetptr != 0 {
			_, _ = worker.AddSP.Call(hostCtx, uint64(int32(64)))
		}
		inst.Free(hostCtx)
		results = append(results, res)
	}

	return results, nil
}

// StreamingSession maintains dedicated state for real-time WebSocket streaming updates.
type StreamingSession struct {
	engine     *Engine
	worker     *Worker
	instances  []*IndicatorInstance
	configs    []EvalIndicatorInstance
	symbol     string
	resolution string
	mu         sync.Mutex
	closed     bool
}

// CreateSession creates a streaming session for the given symbol, resolution, and indicator configs,
// reusing pooled Wazero worker instances.
func (e *Engine) CreateSession(ctx context.Context, symbol, resolution string, configs []EvalIndicatorInstance) (IndicatorSession, error) {
	worker := e.acquireWorker()
	hostCtx := ensureSessionHost(ctx, worker.Session)

	instances := make([]*IndicatorInstance, 0, len(configs))
	for _, cfg := range configs {
		if err := ctx.Err(); err != nil {
			worker.Tainted = true
			return nil, err
		}
		indID := cfg.IndicatorID
		if indID == "wickra.vwap_std_dev_bands" || indID == "VwapStdDevBands" {
			indID = "wickra.vwap"
		}
		desc, ok := e.catalog.GetByID(indID)
		if !ok {
			desc, ok = e.catalog.GetByWasmClass(indID)
			if !ok {
				for _, prev := range instances {
					prev.Free(hostCtx)
				}
				e.releaseWorker(worker)
				return nil, fmt.Errorf("indicator %q not found", cfg.IndicatorID)
			}
		}

		inst, err := worker.NewIndicator(hostCtx, desc, cfg.Inputs)
		if err != nil {
			for _, prev := range instances {
				prev.Free(hostCtx)
			}
			e.releaseWorker(worker)
			return nil, fmt.Errorf("instantiate %q: %w", cfg.IndicatorID, err)
		}
		instances = append(instances, inst)
	}

	return &StreamingSession{
		engine:     e,
		worker:     worker,
		instances:  instances,
		configs:    configs,
		symbol:     symbol,
		resolution: resolution,
	}, nil
}

// Seed warms up the streaming session with historical candles without building intermediate plot maps.
func (s *StreamingSession) Seed(ctx context.Context, candles []CandleData) error {
	if len(candles) == 0 {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return fmt.Errorf("session is closed")
	}

	hostCtx := ensureSessionHost(ctx, s.worker.Session)
	var sharedRetptr uint32
	if spRes, err := s.worker.AddSP.Call(hostCtx, stackAlloc64); err == nil && len(spRes) > 0 {
		sharedRetptr = uint32(spRes[0])
		defer s.worker.AddSP.Call(hostCtx, uint64(int32(64)))
	}

	for _, c := range candles {
		for _, inst := range s.instances {
			singleVal, _, isReady, err := inst.updateWithRetptr(hostCtx, c, sharedRetptr)
			if err != nil {
				s.worker.Tainted = true
				return err
			}
			if !isReady || inst.isMulti || !inst.isSlope || math.IsNaN(singleVal) || math.IsInf(singleVal, 0) {
				continue
			}
			if !inst.hasPrevSlope {
				inst.prevSlopeVal = singleVal
				inst.hasPrevSlope = true
			} else {
				slope := singleVal - inst.prevSlopeVal
				if slope > 0 {
					inst.slopeRegime = 1
				} else if slope < 0 {
					inst.slopeRegime = -1
				}
				inst.prevSlopeVal = singleVal
			}
		}
	}
	return nil
}

// Update processes a new candle and returns the updated plot values keyed by instanceId -> plotId -> value.
func (s *StreamingSession) Update(ctx context.Context, c CandleData) (map[string]map[string]float64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return nil, fmt.Errorf("session is closed")
	}

	hostCtx := ensureSessionHost(ctx, s.worker.Session)
	plots := make(map[string]map[string]float64, len(s.instances))

	var sharedRetptr uint32
	if len(s.instances) > 0 {
		if spRes, err := s.worker.AddSP.Call(hostCtx, stackAlloc64); err == nil && len(spRes) > 0 {
			sharedRetptr = uint32(spRes[0])
			defer s.worker.AddSP.Call(hostCtx, uint64(int32(64)))
		}
	}

	for i, inst := range s.instances {
		cfg := s.configs[i]
		singleVal, multiVal, isReady, err := inst.updateWithRetptr(hostCtx, c, sharedRetptr)
		if err != nil {
			s.worker.Tainted = true
			return nil, err
		}
		if !isReady {
			continue
		}

		if inst.isMulti {
			for k, v := range multiVal {
				if math.IsNaN(v) || math.IsInf(v, 0) {
					delete(multiVal, k)
				}
			}
			if inst.isDirStop {
				val, valOk := multiVal["value"]
				dir, dirOk := multiVal["direction"]
				if valOk && dirOk {
					if dir > 0 {
						multiVal["up"] = val
					} else if dir < 0 {
						multiVal["down"] = val
					}
				}
			}
			if len(multiVal) > 0 {
				plots[cfg.InstanceID] = multiVal
			}
		} else {
			if !math.IsNaN(singleVal) && !math.IsInf(singleVal, 0) {
				var cleanMap map[string]float64
				if inst.isSlope {
					cleanMap = make(map[string]float64, 4)
					cleanMap["plot"] = singleVal
					cleanMap["value"] = singleVal
					if !inst.hasPrevSlope {
						inst.prevSlopeVal = singleVal
						inst.hasPrevSlope = true
						cleanMap["up"] = singleVal
						cleanMap["direction"] = 1.0
					} else {
						slope := singleVal - inst.prevSlopeVal
						if slope > 0 {
							cleanMap["up"] = singleVal
							cleanMap["direction"] = 1.0
							inst.slopeRegime = 1
						} else if slope < 0 {
							cleanMap["down"] = singleVal
							cleanMap["direction"] = -1.0
							inst.slopeRegime = -1
						} else {
							if inst.slopeRegime == -1 {
								cleanMap["down"] = singleVal
								cleanMap["direction"] = -1.0
							} else {
								cleanMap["up"] = singleVal
								cleanMap["direction"] = 1.0
							}
						}
						inst.prevSlopeVal = singleVal
					}
				} else {
					plotID := "plot"
					if len(inst.desc.Plots) > 0 {
						plotID = inst.desc.Plots[0].ID
					}
					cleanMap = map[string]float64{plotID: singleVal}
				}
				plots[cfg.InstanceID] = cleanMap
			}
		}
	}

	return plots, nil
}

// Close releases all indicator instances and returns the pooled worker module to Engine.
func (s *StreamingSession) Close(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return nil
	}
	s.closed = true

	if s.worker != nil {
		hostCtx := ensureSessionHost(ctx, s.worker.Session)
		for _, inst := range s.instances {
			inst.Free(hostCtx)
		}
	}
	s.instances = nil

	if s.engine != nil && s.worker != nil {
		s.engine.releaseWorker(s.worker)
		s.worker = nil
	} else if s.worker != nil && s.worker.Mod != nil && !s.worker.Mod.IsClosed() {
		err := s.worker.Mod.Close(ctx)
		s.worker = nil
		return err
	}
	return nil
}
