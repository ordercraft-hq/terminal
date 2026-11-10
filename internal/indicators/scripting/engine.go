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
)

func init() {
	resolve.AllowFloat = true
	resolve.AllowSet = true
	resolve.AllowLambda = true
	resolve.AllowNestedDef = true
	resolve.AllowRecursion = false // Block recursion to prevent call stack exhaustion
	resolve.AllowGlobalReassign = true
}

const (
	MaxScriptSizeBytes = 65536 // 64 KB
	MaxExecutionSteps  = 500000
	CPUTimeout         = 100 * time.Millisecond
)

type Engine struct {
	wickraEngine *wickra.Engine
	safeClient   *security.SafeHttpClient
	mu           sync.RWMutex
}

func NewEngine(wickraEngine *wickra.Engine) *Engine {
	return &Engine{
		wickraEngine: wickraEngine,
		safeClient:   security.NewSafeHttpClient(),
	}
}

type EvalResult struct {
	Plots           map[string][]wickra.SeriesPoint `json:"plots"`
	Directives      []wickra.PlotDirective          `json:"directives"`
	Bands           []wickra.BandDirective          `json:"bands,omitempty"`
	Logs            []string                        `json:"logs"`
	ExecutionTimeMs float64                         `json:"executionTimeMs"`
}

func (e *Engine) Eval(ctx context.Context, code string, sCtx *ScriptContext, grantedPerms []string) (*EvalResult, error) {
	if len(code) > MaxScriptSizeBytes {
		return nil, fmt.Errorf("script size (%d bytes) exceeds 64KB limit", len(code))
	}

	start := time.Now()
	evalCtx, cancel := context.WithTimeout(ctx, CPUTimeout)
	defer cancel()

	var logs []string
	var logsMu sync.Mutex

	thread := &starlark.Thread{
		Name: "OrderScriptThread",
		Print: func(t *starlark.Thread, msg string) {
			logsMu.Lock()
			logs = append(logs, msg)
			logsMu.Unlock()
		},
		Load: nil, // Hermetic: no module loading
	}
	thread.SetMaxExecutionSteps(MaxExecutionSteps)

	// Watchdog for 100ms CPU execution deadline
	done := make(chan struct{})
	defer close(done)

	go func() {
		select {
		case <-evalCtx.Done():
			if evalCtx.Err() == context.DeadlineExceeded {
				thread.Cancel("execution timeout: 100ms CPU limit exceeded")
			}
		case <-done:
		}
	}()

	globals := starlark.StringDict{
		"ta":   e.createTAModule(sCtx),
		"plot": createPlotModule(),
	}

	res, err := starlark.ExecFile(thread, "indicator.star", code, globals)
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

	ctxVal := sCtx.ToStarlark(grantedPerms, e.safeClient)
	retVal, err := starlark.Call(thread, mainFn, starlark.Tuple{ctxVal}, nil)
	if err != nil {
		return nil, fmt.Errorf("runtime error: %w", err)
	}

	result, err := extractPlots(retVal, sCtx.Time)
	if err != nil {
		return nil, err
	}

	result.Logs = logs
	result.ExecutionTimeMs = float64(time.Since(start).Microseconds()) / 1000.0
	return result, nil
}
