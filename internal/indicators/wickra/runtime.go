package wickra

import (
	"context"
	_ "embed"
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
	objects     map[uint32]any
	nextHandle  uint32
	LastMap     map[string]float64
	BatchOutPtr uint32
	BatchOutLen uint32
	LastError   error
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
	s.BatchOutPtr = 0
	s.BatchOutLen = 0
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
	builder.NewFunctionBuilder().
		WithFunc(func(ctx context.Context, m api.Module, ptr, length uint32) uint32 {
			if s := GetSessionHost(ctx); s != nil {
				s.BatchOutPtr = ptr
				s.BatchOutLen = length
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

// Engine wraps the WebAssembly runtime, compiled module, worker pool, and catalog.
type Engine struct {
	runtime     wazero.Runtime
	compiledMod wazero.CompiledModule
	workerPool  sync.Pool
	sessionSeq  uint64
	catalog     *Catalog
}

// Worker wraps an instantiated WebAssembly module with linear memory access and functions.
type Worker struct {
	Mod     api.Module
	Session *SessionHostContext
	Malloc  api.Function
	Free    api.Function
	AddSP   api.Function
}

// NewEngine compiles wickra.wasm and initializes the worker pool.
func NewEngine(ctx context.Context) (*Engine, error) {
	config := wazero.NewRuntimeConfigCompiler().
		WithMemoryLimitPages(2048) // 128 MB max sandbox

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
		catalog:     cat,
	}

	engine.workerPool.New = func() any {
		w, err := engine.spawnWorker(context.Background())
		if err != nil {
			panic(fmt.Sprintf("failed to spawn wasm worker: %v", err))
		}
		return w
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

// Close closes the underlying Wazero runtime.
func (e *Engine) Close(ctx context.Context) error {
	return e.runtime.Close(ctx)
}

// Catalog returns the 515 indicator catalog.
func (e *Engine) Catalog() *Catalog {
	return e.catalog
}

// GetCatalog returns descriptors filtered by category or search query.
func (e *Engine) GetCatalog(category, query string) []IndicatorDescriptor {
	all := e.catalog.GetAll()
	catLower := strings.ToLower(strings.TrimSpace(category))
	qLower := strings.ToLower(strings.TrimSpace(query))

	var filtered []IndicatorDescriptor
	for _, d := range all {
		if d.ID == "wickra.vwap_std_dev_bands" {
			continue // Exclude deprecated standalone indicator consolidated into canonical wickra.vwap
		}
		if catLower != "" && strings.ToLower(d.Category) != catLower && strings.ToLower(d.Family) != catLower {
			continue
		}
		if qLower != "" {
			match := strings.Contains(strings.ToLower(d.ID), qLower) ||
				strings.Contains(strings.ToLower(d.Name), qLower) ||
				strings.Contains(strings.ToLower(d.ShortName), qLower) ||
				strings.Contains(strings.ToLower(d.WasmClass), qLower)
			if !match {
				continue
			}
		}
		filtered = append(filtered, d)
	}
	return filtered
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

// IndicatorInstance wraps an allocated Rust indicator struct in WASM linear memory.
type IndicatorInstance struct {
	worker       *Worker
	ptr          uint32
	isMulti      bool
	hasRetptr    bool
	numInputs    int
	source       string
	updateFn     api.Function
	freeFn       api.Function
	warmupPeriod uint32
	desc         *IndicatorDescriptor
	prevSlopeVal float64
	hasPrevSlope bool
	slopeRegime  int
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
			return nil, fmt.Errorf("constructor call error for %q: %w", desc.ID, err)
		}
		if len(res) == 0 || res[0] == 0 || w.Session.LastError != nil {
			return nil, fmt.Errorf("constructor failed for %q (lastErr=%v)", desc.ID, w.Session.LastError)
		}
		instPtr = uint32(res[0])
	} else {
		// Allocate stack frame for constructor return pointer (16 bytes)
		spRes, err := w.AddSP.Call(ctx, stackAlloc16)
		if err != nil {
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
			return nil, fmt.Errorf("constructor call error for %q: %w", desc.ID, err)
		}

		instPtr, _ = w.Mod.Memory().ReadUint32Le(retptr)
		errFlag, _ := w.Mod.Memory().ReadUint32Le(retptr + 8)
		if errFlag != 0 || instPtr == 0 || w.Session.LastError != nil {
			return nil, fmt.Errorf("constructor failed for %q (errFlag=%d, lastErr=%v)", desc.ID, errFlag, w.Session.LastError)
		}
	}

	updateFn := w.Mod.ExportedFunction(prefix + "_update")
	if updateFn == nil {
		return nil, fmt.Errorf("indicator %q update function %s_update not found", desc.ID, prefix)
	}
	freeFn := w.Mod.ExportedFunction("__wbg_" + prefix + "_free")

	hasRetptr := len(updateFn.Definition().ResultTypes()) == 0
	// Prevent slope-dependent single-output indicators from being flagged as multi-output
	// when catalog.go declares additional plot directives for "up" and "down".
	isMulti := (len(desc.Plots) > 1 || !hasRetptr) && !isSlopeIndicator(desc.ID)
	var numInputs int
	if hasRetptr {
		numInputs = len(updateFn.Definition().ParamTypes()) - 2
	} else {
		numInputs = len(updateFn.Definition().ParamTypes()) - 1
	}
	if numInputs < 1 {
		numInputs = 1
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
		numInputs:    numInputs,
		source:       sourceField,
		updateFn:     updateFn,
		freeFn:       freeFn,
		warmupPeriod: warmup,
		desc:         desc,
	}, nil
}

func extractInputs(desc *IndicatorDescriptor, c CandleData, source string, numInputs int) []float64 {
	var srcVal float64
	switch strings.ToLower(source) {
	case "open":
		srcVal = c.Open
	case "high":
		srcVal = c.High
	case "low":
		srcVal = c.Low
	case "hl2":
		srcVal = (c.High + c.Low) / 2.0
	case "hlc3":
		srcVal = (c.High + c.Low + c.Close) / 3.0
	case "ohlc4":
		srcVal = (c.Open + c.High + c.Low + c.Close) / 4.0
	default:
		srcVal = c.Close
	}

	if desc != nil {
		switch desc.WasmClass {
		case "VolumeOscillator":
			if numInputs == 1 {
				return []float64{c.Volume}
			}
		case "OBV", "ForceIndex", "TSV", "TradeVolumeIndex", "VZO", "VolumePriceTrend",
			"VolumeRsi", "VolumeWeightedMacd", "EVWMA", "VWMA", "NVI", "PVI":
			if numInputs == 2 {
				return []float64{srcVal, c.Volume}
			}
		case "EaseOfMovement", "MarketFacilitationIndex", "VolumeWeightedSr":
			if numInputs == 3 {
				return []float64{c.High, c.Low, c.Volume}
			}
		case "VWAP", "AnchoredVWAP", "RollingVWAP", "ADL", "ChaikinMoneyFlow",
			"ChaikinOscillator", "DemandIndex", "IntradayIntensity", "TwiggsMoneyFlow":
			if numInputs == 4 {
				return []float64{c.High, c.Low, c.Close, c.Volume}
			}
		}
	}

	switch numInputs {
	case 1:
		return []float64{srcVal}
	case 2:
		return []float64{c.High, c.Low}
	case 3:
		return []float64{c.High, c.Low, c.Close}
	case 4:
		return []float64{c.Open, c.High, c.Low, c.Close}
	case 5:
		return []float64{c.Open, c.High, c.Low, c.Close, c.Volume}
	default:
		return []float64{srcVal}
	}
}

// Update performs an O(1) streaming step. Returns (singleVal, multiVal, isReady, error).
func (inst *IndicatorInstance) Update(ctx context.Context, candle CandleData) (float64, map[string]float64, bool, error) {
	if inst.customUpdate != nil {
		return inst.customUpdate(ctx, candle)
	}

	ctx = WithSessionHost(ctx, inst.worker.Session)
	w := inst.worker

	inputVals := extractInputs(inst.desc, candle, inst.source, inst.numInputs)

	if inst.isMulti {
		if inst.hasRetptr {
			spRes, err := w.AddSP.Call(ctx, stackAlloc64)
			if err != nil {
				return 0, nil, false, err
			}
			retptr := uint32(spRes[0])
			defer w.AddSP.Call(ctx, uint64(int32(64)))

			callArgs := []uint64{uint64(retptr), uint64(inst.ptr)}
			for _, v := range inputVals {
				callArgs = append(callArgs, api.EncodeF64(v))
			}

			if _, err := inst.updateFn.Call(ctx, callArgs...); err != nil {
				return 0, nil, false, err
			}

			status, _ := w.Mod.Memory().ReadUint32Le(retptr)
			if status == 0 {
				return math.NaN(), nil, false, nil // Warming up
			}

			outMap := make(map[string]float64, len(w.Session.LastMap))
			for k, v := range w.Session.LastMap {
				outMap[k] = v
			}
			w.Session.dropHeapObject(status)
			w.Session.LastMap = nil

			return 0, outMap, true, nil
		}

		callArgs := []uint64{uint64(inst.ptr)}
		for _, v := range inputVals {
			callArgs = append(callArgs, api.EncodeF64(v))
		}
		res, err := inst.updateFn.Call(ctx, callArgs...)
		if err != nil {
			return 0, nil, false, err
		}
		if res[0] == 0 {
			return math.NaN(), nil, false, nil // Warming up
		}

		outMap := make(map[string]float64, len(w.Session.LastMap))
		for k, v := range w.Session.LastMap {
			outMap[k] = v
		}
		// Clean up transient heap object handle allocated by __wbg_objN
		w.Session.dropHeapObject(uint32(res[0]))
		w.Session.LastMap = nil

		return 0, outMap, true, nil
	}

	// Single output
	spRes, err := w.AddSP.Call(ctx, stackAlloc16)
	if err != nil {
		return 0, nil, false, err
	}
	retptr := uint32(spRes[0])
	defer w.AddSP.Call(ctx, uint64(int32(16)))

	callArgs := []uint64{uint64(retptr), uint64(inst.ptr)}
	for _, v := range inputVals {
		callArgs = append(callArgs, api.EncodeF64(v))
	}

	if _, err := inst.updateFn.Call(ctx, callArgs...); err != nil {
		return 0, nil, false, err
	}

	status, _ := w.Mod.Memory().ReadUint32Le(retptr)
	if status == 0 {
		return math.NaN(), nil, false, nil // Warming up
	}

	valBits, _ := w.Mod.Memory().ReadUint64Le(retptr + 8)
	return api.DecodeF64(valBits), nil, true, nil
}

// Free cleans up the allocated Rust indicator in WASM linear memory.
func (inst *IndicatorInstance) Free(ctx context.Context) {
	if inst.customFree != nil {
		inst.customFree(ctx)
		inst.customFree = nil
	}
	if inst.freeFn != nil && inst.ptr != 0 {
		inst.freeFn.Call(ctx, uint64(inst.ptr), 0)
		inst.ptr = 0
	}
}

// Evaluate computes historical indicator plots for a batch of candles across multiple indicators.
func (e *Engine) Evaluate(ctx context.Context, candles []CandleData, configs []EvalIndicatorInstance) ([]EvalResult, error) {
	if len(configs) == 0 {
		return []EvalResult{}, nil
	}

	worker := e.workerPool.Get().(*Worker)
	defer func() {
		worker.Session.Reset()
		e.workerPool.Put(worker)
	}()

	var results []EvalResult

	for _, cfg := range configs {
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

		inst, err := worker.NewIndicator(ctx, desc, cfg.Inputs)
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
		if isDirectionalStopIndicator(desc.ID) {
			res.Plots["up"] = make([]SeriesPoint, 0, len(candles))
			res.Plots["down"] = make([]SeriesPoint, 0, len(candles))
			res.Plots["value"] = make([]SeriesPoint, 0, len(candles))
			res.Plots["direction"] = make([]SeriesPoint, 0, len(candles))
		} else if isSlopeIndicator(desc.ID) {
			res.Plots["up"] = make([]SeriesPoint, 0, len(candles))
			res.Plots["down"] = make([]SeriesPoint, 0, len(candles))
			res.Plots["plot"] = make([]SeriesPoint, 0, len(candles))
			res.Plots["value"] = make([]SeriesPoint, 0, len(candles))
			res.Plots["direction"] = make([]SeriesPoint, 0, len(candles))
		}

		var interval int64 = 60
		if len(candles) >= 2 {
			interval = candles[len(candles)-1].Time - candles[len(candles)-2].Time
			if interval <= 0 {
				interval = 60
			}
		}

		// Check for plot offsets in cfg.Inputs (e.g. jawOffset, teethOffset, lipsOffset, or general offset)
		offsets := make(map[string]int64)
		for k, v := range cfg.Inputs {
			lk := strings.ToLower(k)
			if lk == "offset" {
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
						offsets[p.ID] = int64(toInt(v))
					}
				}
			}
		}

		var prevSlopePoint SeriesPoint
		var hasPrevSlopePoint bool
		var prevRegime int // +1 for Up, -1 for Down, 0 for Unset

		for _, c := range candles {
			singleVal, multiVal, isReady, err := inst.Update(ctx, c)
			if err != nil {
				inst.Free(ctx)
				return nil, fmt.Errorf("eval error on %q: %w", desc.ID, err)
			}
			if !isReady {
				continue // Skip warmup bars
			}

			if inst.isMulti {
				if isDirectionalStopIndicator(desc.ID) {
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
				if math.IsNaN(singleVal) || math.IsInf(singleVal, 0) {
					continue
				}

				if isSlopeIndicator(desc.ID) {
					ptTime := c.Time
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

					if !hasPrevSlopePoint {
						prevSlopePoint = currPt
						hasPrevSlopePoint = true
					} else {
						slope := currPt.Value - prevSlopePoint.Value
						if slope > 0 {
							if prevRegime != 1 {
								// Inflection from Down to Up: include transition anchor bar in Up
								res.Plots["up"] = append(res.Plots["up"], prevSlopePoint)
								prevRegime = 1
							}
							res.Plots["up"] = append(res.Plots["up"], currPt)
						} else if slope < 0 {
							if prevRegime != -1 {
								// Inflection from Up to Down: include transition anchor bar in Down
								res.Plots["down"] = append(res.Plots["down"], prevSlopePoint)
								prevRegime = -1
							}
							res.Plots["down"] = append(res.Plots["down"], currPt)
						} else {
							// Flat slope: persist current regime (default to Up if unset)
							if prevRegime == -1 {
								res.Plots["down"] = append(res.Plots["down"], currPt)
							} else {
								if prevRegime == 0 {
									res.Plots["up"] = append(res.Plots["up"], prevSlopePoint)
									prevRegime = 1
								}
								res.Plots["up"] = append(res.Plots["up"], currPt)
							}
						}
						prevSlopePoint = currPt
					}
					var dirVal float64 = 1.0
					if prevRegime == -1 {
						dirVal = -1.0
					}
					res.Plots["direction"] = append(res.Plots["direction"], SeriesPoint{Time: ptTime, Value: dirVal})
				} else {
					plotID := "plot"
					if len(desc.Plots) > 0 {
						plotID = desc.Plots[0].ID
					}
					ptTime := c.Time
					if off, ok := offsets[plotID]; ok && off != 0 {
						ptTime += off * interval
					}
					res.Plots[plotID] = append(res.Plots[plotID], SeriesPoint{
						Time:  ptTime,
						Value: singleVal,
					})
				}
			}
		}

		inst.Free(ctx)
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

// CreateSession creates a dedicated streaming session for the given symbol, resolution, and indicator configs.
func (e *Engine) CreateSession(ctx context.Context, symbol, resolution string, configs []EvalIndicatorInstance) (IndicatorSession, error) {
	worker, err := e.spawnWorker(ctx)
	if err != nil {
		return nil, fmt.Errorf("spawn streaming worker: %w", err)
	}

	instances := make([]*IndicatorInstance, 0, len(configs))
	for _, cfg := range configs {
		indID := cfg.IndicatorID
		if indID == "wickra.vwap_std_dev_bands" || indID == "VwapStdDevBands" {
			indID = "wickra.vwap"
		}
		desc, ok := e.catalog.GetByID(indID)
		if !ok {
			desc, ok = e.catalog.GetByWasmClass(indID)
			if !ok {
				worker.Mod.Close(ctx)
				return nil, fmt.Errorf("indicator %q not found", cfg.IndicatorID)
			}
		}

		inst, err := worker.NewIndicator(ctx, desc, cfg.Inputs)
		if err != nil {
			for _, prev := range instances {
				prev.Free(ctx)
			}
			worker.Mod.Close(ctx)
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

// Update processes a new candle and returns the updated plot values keyed by instanceId -> plotId -> value.
func (s *StreamingSession) Update(ctx context.Context, c CandleData) (map[string]map[string]float64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return nil, fmt.Errorf("session is closed")
	}

	plots := make(map[string]map[string]float64)

	for i, inst := range s.instances {
		cfg := s.configs[i]
		singleVal, multiVal, isReady, err := inst.Update(ctx, c)
		if err != nil {
			return nil, err
		}
		if !isReady {
			continue
		}

		if inst.isMulti {
			cleanMap := make(map[string]float64, len(multiVal)+2)
			for k, v := range multiVal {
				if !math.IsNaN(v) && !math.IsInf(v, 0) {
					cleanMap[k] = v
				}
			}
			if isDirectionalStopIndicator(inst.desc.ID) {
				val, valOk := cleanMap["value"]
				dir, dirOk := cleanMap["direction"]
				if valOk && dirOk {
					if dir > 0 {
						cleanMap["up"] = val
					} else if dir < 0 {
						cleanMap["down"] = val
					}
				}
			}
			if len(cleanMap) > 0 {
				plots[cfg.InstanceID] = cleanMap
			}
		} else {
			if !math.IsNaN(singleVal) && !math.IsInf(singleVal, 0) {
				cleanMap := make(map[string]float64)
				if isSlopeIndicator(inst.desc.ID) {
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
					cleanMap[plotID] = singleVal
				}
				plots[cfg.InstanceID] = cleanMap
			}
		}
	}

	return plots, nil
}

// Close releases all indicator instances and closes the dedicated worker module.
func (s *StreamingSession) Close(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return nil
	}
	s.closed = true

	for _, inst := range s.instances {
		inst.Free(ctx)
	}
	return s.worker.Mod.Close(ctx)
}
