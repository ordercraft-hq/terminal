package scripting

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/ordercraft-hq/terminal/internal/indicators/wickra"
	"github.com/ordercraft-hq/terminal/internal/security"
	"go.starlark.net/resolve"
	"go.starlark.net/starlark"
	"go.starlark.net/syntax"
)

func init() {
	resolve.AllowFloat = true
	resolve.AllowSet = true
	resolve.AllowLambda = true
	resolve.AllowNestedDef = true
	resolve.AllowRecursion = false // Block recursion to prevent call stack exhaustion
	resolve.AllowGlobalReassign = true
}

var scriptFileOptions = &syntax.FileOptions{
	Set:             true,
	While:           true,
	TopLevelControl: true,
	GlobalReassign:  true,
	Recursion:       false,
}

const (
	MaxScriptSizeBytes   = 65536 // 64 KB
	MaxExecutionSteps    = 500000
	CPUTimeout           = 100 * time.Millisecond
	maxCompiledCacheSize = 256
	MaxLogLines          = 500
	MaxLogTotalBytes     = 64 * 1024 // 64 KB
)

type Engine struct {
	wickraEngine *wickra.Engine
	safeClient   *security.SafeHttpClient
	mu           sync.RWMutex
	progCache    map[string]*starlark.Program
}

func NewEngine(wickraEngine *wickra.Engine) *Engine {
	return &Engine{
		wickraEngine: wickraEngine,
		safeClient:   security.NewSafeHttpClient(),
		progCache:    make(map[string]*starlark.Program, 32),
	}
}

type EvalResult struct {
	Plots           map[string][]wickra.SeriesPoint `json:"plots"`
	Directives      []wickra.PlotDirective          `json:"directives"`
	Bands           []wickra.BandDirective          `json:"bands,omitempty"`
	Logs            []string                        `json:"logs"`
	ExecutionTimeMs float64                         `json:"executionTimeMs"`
}

func isPredeclaredName(name string) bool {
	return name == "ta" || name == "plot"
}

// Compile parses, resolves, and compiles an OrderScript source string into a reusable *starlark.Program.
func (e *Engine) Compile(code string) (*starlark.Program, error) {
	if len(code) > MaxScriptSizeBytes {
		return nil, fmt.Errorf("script size (%d bytes) exceeds 64KB limit", len(code))
	}

	e.mu.RLock()
	if prog, ok := e.progCache[code]; ok {
		e.mu.RUnlock()
		return prog, nil
	}
	e.mu.RUnlock()

	_, prog, err := starlark.SourceProgramOptions(scriptFileOptions, "indicator.star", code, isPredeclaredName)
	if err != nil {
		return nil, fmt.Errorf("compilation error: %w", err)
	}

	e.mu.Lock()
	if e.progCache == nil {
		e.progCache = make(map[string]*starlark.Program, 32)
	}
	if len(e.progCache) >= maxCompiledCacheSize {
		clear(e.progCache)
	}
	e.progCache[code] = prog
	e.mu.Unlock()

	return prog, nil
}

// Eval compiles (with caching) and executes an OrderScript source string.
func (e *Engine) Eval(ctx context.Context, code string, sCtx *ScriptContext, grantedPerms []string) (*EvalResult, error) {
	prog, err := e.Compile(code)
	if err != nil {
		return nil, err
	}
	return e.EvalProgram(ctx, prog, sCtx, grantedPerms)
}

// EvalProgram executes a pre-compiled *starlark.Program against the provided ScriptContext.
func (e *Engine) EvalProgram(ctx context.Context, prog *starlark.Program, sCtx *ScriptContext, grantedPerms []string) (evalResult *EvalResult, evalErr error) {
	if prog == nil {
		return nil, fmt.Errorf("program is nil")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	defer func() {
		if rec := recover(); rec != nil {
			evalResult = nil
			evalErr = fmt.Errorf("script runtime panic: %v", rec)
		}
	}()

	start := time.Now()
	evalCtx, cancel := context.WithTimeout(ctx, CPUTimeout)
	defer cancel()

	var logs []string
	var logBytes int
	var logsTruncated bool
	var logsMu sync.Mutex

	thread := &starlark.Thread{
		Name: "OrderScriptThread",
		Print: func(t *starlark.Thread, msg string) {
			logsMu.Lock()
			defer logsMu.Unlock()
			if logsTruncated {
				return
			}
			if len(logs) >= MaxLogLines || logBytes+len(msg) > MaxLogTotalBytes {
				logs = append(logs, "[logs truncated: output limit exceeded]")
				logsTruncated = true
				return
			}
			logs = append(logs, msg)
			logBytes += len(msg)
		},
		Load: nil, // Hermetic: no module loading
	}
	thread.SetMaxExecutionSteps(MaxExecutionSteps)

	// Watchdog for 100ms CPU execution deadline and parent cancellation
	done := make(chan struct{})
	defer close(done)

	go func() {
		select {
		case <-evalCtx.Done():
			if evalCtx.Err() == context.DeadlineExceeded {
				thread.Cancel("execution timeout: 100ms CPU limit exceeded")
			} else {
				thread.Cancel(fmt.Sprintf("execution canceled: %v", evalCtx.Err()))
			}
		case <-done:
		}
	}()

	globals := starlark.StringDict{
		"ta":   e.createTAModule(evalCtx, sCtx),
		"plot": createPlotModule(),
	}

	res, err := prog.Init(thread, globals)
	if err != nil {
		return nil, fmt.Errorf("compilation error: %w", err)
	}

	mainVal, ok := res["main"]
	if !ok {
		return nil, fmt.Errorf("script must define a 'def main(ctx):' entrypoint function")
	}

	mainFn, ok := mainVal.(*starlark.Function)
	if !ok {
		return nil, fmt.Errorf("'main' must be a function")
	}

	ctxVal := sCtx.ToStarlark(evalCtx, grantedPerms, e.safeClient)
	retVal, err := starlark.Call(thread, mainFn, starlark.Tuple{ctxVal}, nil)
	if err != nil {
		return nil, fmt.Errorf("runtime error: %w", err)
	}

	result, err := extractPlots(retVal, sCtx.Time)
	if err != nil {
		return nil, err
	}

	logsMu.Lock()
	result.Logs = append([]string(nil), logs...)
	logsMu.Unlock()
	result.ExecutionTimeMs = float64(time.Since(start).Microseconds()) / 1000.0
	return result, nil
}
