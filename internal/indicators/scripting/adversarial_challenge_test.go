package scripting

import (
	"context"
	"fmt"
	"math"
	"strings"
	"testing"
	"time"

	"github.com/ordercraft-hq/terminal/internal/indicators/wickra"
	"github.com/ordercraft-hq/terminal/internal/security"
)

// 1. Timeout Watchdog & Infinite Loop Test
func TestAdversarial_TimeoutWatchdogAndInfiniteLoop(t *testing.T) {
	candles := createTestCandles(20)
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	engine := NewEngine(nil)

	scenarios := []struct {
		name        string
		code        string
		expectError string
	}{
		{
			name: "Massive single loop exceeding 500k steps",
			code: `
def main(ctx):
    count = 0
    for i in range(1000000):
        count += 1
    return []
`,
			expectError: "too many steps",
		},
		{
			name: "Deep nested loops causing step limit exhaustion",
			code: `
def main(ctx):
    total = 0
    for i in range(1000):
        for j in range(1000):
            total += 1
    return []
`,
			expectError: "too many steps",
		},
		{
			name: "CPU intensive calculation loop",
			code: `
def main(ctx):
    x = 1.0001
    for i in range(800000):
        x = x * x + 0.00001
    return []
`,
			expectError: "too many steps",
		},
	}

	for _, sc := range scenarios {
		t.Run(sc.name, func(t *testing.T) {
			start := time.Now()
			_, err := engine.Eval(context.Background(), sc.code, sCtx, nil)
			elapsed := time.Since(start)

			if err == nil {
				t.Fatalf("expected loop timeout or step exhaustion error, got nil")
			}

			// Empirical verification: Error must clearly indicate step limit or execution timeout
			errStr := strings.ToLower(err.Error())
			if !strings.Contains(errStr, "too many steps") && !strings.Contains(errStr, "timeout") && !strings.Contains(errStr, "canceled") && !strings.Contains(errStr, "cancelled") {
				t.Errorf("expected error to mention steps or timeout, got: %v", err)
			}

			// Blast radius check: watchdog must prevent thread freeze (must terminate within 500ms)
			if elapsed > 500*time.Millisecond {
				t.Errorf("execution took %v, exceeding watchdog SLA (500ms)", elapsed)
			}
		})
	}
}

// 2. Recursion Lock Test
func TestAdversarial_RecursionLock(t *testing.T) {
	candles := createTestCandles(10)
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	engine := NewEngine(nil)

	scenarios := []struct {
		name string
		code string
	}{
		{
			name: "Direct recursion",
			code: `
def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)

def main(ctx):
    return [fib(5)]
`,
		},
		{
			name: "Mutual recursion",
			code: `
def is_even(n):
    if n == 0:
        return True
    return is_odd(n - 1)

def is_odd(n):
    if n == 0:
        return False
    return is_even(n - 1)

def main(ctx):
    return [is_even(4)]
`,
		},
		{
			name: "Simple self-call",
			code: `
def f(n):
    return f(n - 1)

def main(ctx):
    return [f(10)]
`,
		},
	}

	for _, sc := range scenarios {
		t.Run(sc.name, func(t *testing.T) {
			_, err := engine.Eval(context.Background(), sc.code, sCtx, nil)
			if err == nil {
				t.Fatalf("expected recursion error due to resolve.AllowRecursion = false, but got success")
			}
			errStr := strings.ToLower(err.Error())
			if !strings.Contains(errStr, "recursiv") {
				t.Errorf("expected error message to mention recursion, got: %v", err)
			}
		})
	}
}

// 3. Hermetic Sandbox & Module Loading Test
func TestAdversarial_HermeticSandboxAndModuleLoading(t *testing.T) {
	candles := createTestCandles(5)
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	engine := NewEngine(nil)

	scenarios := []struct {
		name        string
		code        string
		expectError string
	}{
		{
			name: "Python import os",
			code: `
import os

def main(ctx):
    return []
`,
			expectError: "got import, want primary expression",
		},
		{
			name: "Starlark load os",
			code: `
load("os", "system")

def main(ctx):
    return []
`,
			expectError: "load not implemented",
		},
		{
			name: "Starlark load relative file",
			code: `
load("./secret.star", "token")

def main(ctx):
    return []
`,
			expectError: "load not implemented",
		},
		{
			name: "Python open builtin access",
			code: `
def main(ctx):
    f = open("/etc/passwd")
    return []
`,
			expectError: "undefined: open",
		},
		{
			name: "Python __import__ access",
			code: `
def main(ctx):
    mod = __import__("os")
    return []
`,
			expectError: "undefined: __import__",
		},
		{
			name: "Python eval access",
			code: `
def main(ctx):
    eval("1+1")
    return []
`,
			expectError: "undefined: eval",
		},
	}

	for _, sc := range scenarios {
		t.Run(sc.name, func(t *testing.T) {
			_, err := engine.Eval(context.Background(), sc.code, sCtx, nil)
			if err == nil {
				t.Fatalf("expected sandbox breach attempt to fail, but succeeded!")
			}
			if !strings.Contains(strings.ToLower(err.Error()), strings.ToLower(sc.expectError)) {
				t.Errorf("expected error to contain %q, got: %v", sc.expectError, err)
			}
		})
	}
}

// 4. SSRF & Network Gating Test
func TestAdversarial_SSRFAndNetworkGating(t *testing.T) {
	candles := createTestCandles(10)
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	engine := NewEngine(nil)

	scenarios := []struct {
		name        string
		url         string
		permissions []string
		expectSSRF  bool
		expectDeny  bool
	}{
		{
			name:        "AWS/Cloud metadata IP without permissions",
			url:         "http://169.254.169.254/latest/meta-data",
			permissions: nil,
			expectSSRF:  true,
		},
		{
			name:        "AWS/Cloud metadata IP even with wildcard permission",
			url:         "http://169.254.169.254/latest/meta-data",
			permissions: []string{"*"},
			expectSSRF:  true,
		},
		{
			name:        "IPv4 Link-Local address with permission",
			url:         "http://169.254.1.1/internal/health",
			permissions: []string{"*"},
			expectSSRF:  true,
		},
		{
			name:        "External domain without permission",
			url:         "https://api.binance.com/api/v3/ticker/price",
			permissions: []string{},
			expectDeny:  true,
		},
		{
			name:        "External domain with mismatched permission",
			url:         "https://api.binance.com/api/v3/ticker/price",
			permissions: []string{"network:api.coinbase.com"},
			expectDeny:  true,
		},
		{
			name:        "Loopback IP with mismatched port",
			url:         "http://127.0.0.1:8080/api/secret",
			permissions: []string{"network:127.0.0.1:9000"},
			expectDeny:  true,
		},
		{
			name:        "Localhost with ungranted port",
			url:         "http://localhost:3000/env",
			permissions: []string{"network:localhost:8080"},
			expectDeny:  true,
		},
	}

	for _, sc := range scenarios {
		t.Run(sc.name, func(t *testing.T) {
			script := fmt.Sprintf(`
def main(ctx):
    res = ctx.http.get("%s")
    return []
`, sc.url)

			_, err := engine.Eval(context.Background(), script, sCtx, sc.permissions)
			if err == nil {
				t.Fatalf("expected network request to %s to be blocked, but succeeded", sc.url)
			}

			if sc.expectSSRF {
				if !strings.Contains(err.Error(), security.ErrSSRFProtection.Error()) {
					t.Errorf("expected SSRF protection error %q, got: %v", security.ErrSSRFProtection.Error(), err)
				}
			}

			if sc.expectDeny {
				if !strings.Contains(err.Error(), "permission denied") {
					t.Errorf("expected permission denied error, got: %v", err)
				}
			}
		})
	}
}

// 5. Memory & Payload Limit Test
func TestAdversarial_MemoryAndPayloadLimit(t *testing.T) {
	candles := createTestCandles(5)
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	engine := NewEngine(nil)

	// Valid header
	header := "def main(ctx):\n    return []\n"

	// Exact 64KB boundary: 65536 bytes
	paddingLen64KB := MaxScriptSizeBytes - len(header)
	exactScript := header + strings.Repeat("#", paddingLen64KB)

	if len(exactScript) != MaxScriptSizeBytes {
		t.Fatalf("exactScript size should be %d, got %d", MaxScriptSizeBytes, len(exactScript))
	}

	// Should pass payload size guard
	_, err := engine.Eval(context.Background(), exactScript, sCtx, nil)
	if err != nil {
		t.Errorf("exact 64KB script should not be rejected by size guard, got: %v", err)
	}

	// 1 byte over: 65537 bytes
	overScript := exactScript + " "
	if len(overScript) != MaxScriptSizeBytes+1 {
		t.Fatalf("overScript size should be %d, got %d", MaxScriptSizeBytes+1, len(overScript))
	}

	_, err = engine.Eval(context.Background(), overScript, sCtx, nil)
	if err == nil {
		t.Fatalf("expected 65537 bytes script to be rejected, but got nil")
	}
	if !strings.Contains(err.Error(), "exceeds 64KB limit") {
		t.Errorf("expected 'exceeds 64KB limit' in error, got: %v", err)
	}

	// Massive 1MB payload
	hugeScript := header + strings.Repeat("#", 1024*1024)
	_, err = engine.Eval(context.Background(), hugeScript, sCtx, nil)
	if err == nil || !strings.Contains(err.Error(), "exceeds 64KB limit") {
		t.Errorf("expected 1MB script to be rejected immediately, got: %v", err)
	}
}

// 6. Floating Point Math & Parser Test
func TestAdversarial_FloatingPointMath(t *testing.T) {
	candles := createTestCandles(30)
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	engine := NewEngine(nil)

	// Check floating point operations, multipliers, and float arguments
	scriptFloatSyntax := `
def main(ctx):
    multiplier = 1.75 * 0.5
    factor = 0.0025 + 0.0075
    scaled_close = [c * 1.05 for c in ctx.close]
    bb = ta.bollinger(ctx.close, 20, 2.5) # float stddev
    return [
        plot.line(scaled_close, color="#2962FF", title="Scaled Close"),
        plot.band(bb.upper, bb.lower, fill_color="rgba(41, 98, 255, 0.2)", title="BB 2.5 StdDev")
    ]
`
	res, err := engine.Eval(context.Background(), scriptFloatSyntax, sCtx, nil)
	if err != nil {
		t.Fatalf("floating point script syntax failed: %v", err)
	}

	// Directives: 1 line + 2 band bound lines (upper/lower) = 3 directives; 1 band directive
	if len(res.Directives) != 3 || len(res.Bands) != 1 {
		t.Errorf("expected 3 directives and 1 band, got %d directives and %d bands", len(res.Directives), len(res.Bands))
	}

	// Verify that floating point literals such as 14.5 compile cleanly without parser errors
	// (resolve.AllowFloat = true)
	scriptFloatPeriod := `
def main(ctx):
    # Parser must accept float literals cleanly
    period_float = 14.5
    # If passed directly to ta.sma, runtime type check verifies integer period is required
    fast = ta.sma(ctx.close, int(period_float))
    return [plot.line(fast, title="SMA Float Cast")]
`
	resFloat, err := engine.Eval(context.Background(), scriptFloatPeriod, sCtx, nil)
	if err != nil {
		t.Fatalf("expected script with float literal and int() cast to execute cleanly, got: %v", err)
	}
	if len(resFloat.Plots["plot_0"]) == 0 {
		t.Errorf("expected plot_0 to have data points, got 0")
	}

	// Verify runtime behavior when passing raw float 14.5 directly to ta.sma parameter:
	scriptRawFloatPeriod := `
def main(ctx):
    fast = ta.sma(ctx.close, 14.5)
    return [plot.line(fast, title="SMA Raw Float")]
`
	_, err = engine.Eval(context.Background(), scriptRawFloatPeriod, sCtx, nil)
	if err == nil {
		t.Fatalf("expected runtime type error for float period in ta.sma, got nil")
	}
	// Verify it was NOT a compilation/parser error, but a runtime type assertion
	if strings.Contains(err.Error(), "compilation error") {
		t.Errorf("expected runtime error, not compilation error: %v", err)
	}
	if !strings.Contains(err.Error(), "got float, want int") {
		t.Errorf("expected 'got float, want int' runtime error, got: %v", err)
	}
}

// 7. Division by Zero & Flat Market Test
func TestAdversarial_DivisionByZeroAndFlatMarket(t *testing.T) {
	// Completely flat market: High == Low == Open == Close
	n := 40
	candles := make([]wickra.CandleData, n)
	baseTime := int64(1700000000)
	for i := 0; i < n; i++ {
		candles[i] = wickra.CandleData{
			Time:   baseTime + int64(i*60),
			Open:   100.0,
			High:   100.0,
			Low:    100.0,
			Close:  100.0,
			Volume: 50.0,
		}
	}

	sCtx := NewScriptContextFromCandles("TEST:FLAT", "1m", candles)
	engine := NewEngine(nil)

	script := `
def main(ctx):
    # RSI on flat data (zero gain, zero loss)
    rsi = ta.rsi(ctx.close, 14)
    # Stoch on flat data (high == low)
    stoch = ta.stoch(ctx.high, ctx.low, ctx.close, 14, 3, 3)
    # Bollinger bands with stddev 0
    bb = ta.bollinger(ctx.close, 20, 2.0)
    # Orderflow delta on zero-spread candles
    delta = ctx.orderflow.delta
    return [
        plot.line(rsi, title="RSI Flat"),
        plot.line(stoch.k, title="Stoch K Flat"),
        plot.band(bb.upper, bb.lower, title="BB Flat"),
        plot.histogram(delta, title="Delta Flat")
    ]
`
	res, err := engine.Eval(context.Background(), script, sCtx, nil)
	if err != nil {
		t.Fatalf("flat market eval failed: %v", err)
	}

	// Verify no panics and no NaN or Inf in emitted series points
	for plotID, points := range res.Plots {
		for _, pt := range points {
			if math.IsNaN(pt.Value) || math.IsInf(pt.Value, 0) {
				t.Errorf("plot %s contains invalid value: %v", plotID, pt.Value)
			}
		}
	}
}

// 8. TA Math Edge Cases (Invalid Periods, Empty Data)
func TestAdversarial_TAMathEdgeCases(t *testing.T) {
	emptyData := []float64{}
	singleData := []float64{100.0}

	// SMA on empty data
	smaEmpty := MathSMA(emptyData, 10)
	if len(smaEmpty) != 0 {
		t.Errorf("expected empty slice, got len %d", len(smaEmpty))
	}

	// SMA with period 0
	smaZeroPeriod := MathSMA(singleData, 0)
	if len(smaZeroPeriod) != 1 || !math.IsNaN(smaZeroPeriod[0]) {
		t.Errorf("expected NaN for 0 period, got %v", smaZeroPeriod)
	}

	// RSI on single data
	rsiSingle := MathRSI(singleData, 14)
	if len(rsiSingle) != 1 || !math.IsNaN(rsiSingle[0]) {
		t.Errorf("expected NaN for insufficient RSI data, got %v", rsiSingle)
	}

	// Bollinger on period > len
	up, mid, low := MathBollinger(singleData, 20, 2.0)
	if len(up) != 1 || !math.IsNaN(up[0]) || !math.IsNaN(mid[0]) || !math.IsNaN(low[0]) {
		t.Errorf("expected NaNs for period > len in Bollinger")
	}
}

// 9. Malformed Script Returns (Types other than list of plot directives)
func TestAdversarial_MalformedScriptReturns(t *testing.T) {
	candles := createTestCandles(10)
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	engine := NewEngine(nil)

	testCases := []struct {
		name string
		code string
	}{
		{
			name: "Returns integer",
			code: "def main(ctx):\n    return 42\n",
		},
		{
			name: "Returns string",
			code: "def main(ctx):\n    return 'invalid plot'\n",
		},
		{
			name: "Returns dict",
			code: "def main(ctx):\n    return {'a': 1}\n",
		},
		{
			name: "Returns None",
			code: "def main(ctx):\n    return None\n",
		},
		{
			name: "Returns list of non-plot objects",
			code: "def main(ctx):\n    return [1, 'two', None]\n",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			res, err := engine.Eval(context.Background(), tc.code, sCtx, nil)
			if err != nil {
				t.Fatalf("unexpected error on malformed return: %v", err)
			}
			// Must degrade gracefully: 0 plots, no crashes
			if len(res.Directives) != 0 || len(res.Plots) != 0 {
				t.Errorf("expected 0 directives and plots for malformed return, got %d directives", len(res.Directives))
			}
		})
	}
}

// 10. Concurrency & Thread-Safety Test
func TestAdversarial_Concurrency(t *testing.T) {
	candles := createTestCandles(50)
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	engine := NewEngine(nil)

	script := `
def main(ctx):
    fast = ta.sma(ctx.close, 10)
    slow = ta.ema(ctx.close, 20)
    return [
        plot.line(fast, title="Fast"),
        plot.line(slow, title="Slow")
    ]
`
	concurrency := 20
	errChan := make(chan error, concurrency)

	for i := 0; i < concurrency; i++ {
		go func() {
			res, err := engine.Eval(context.Background(), script, sCtx, nil)
			if err != nil {
				errChan <- fmt.Errorf("eval error: %w", err)
				return
			}
			if len(res.Directives) != 2 {
				errChan <- fmt.Errorf("expected 2 directives, got %d", len(res.Directives))
				return
			}
			errChan <- nil
		}()
	}

	for i := 0; i < concurrency; i++ {
		if err := <-errChan; err != nil {
			t.Fatalf("concurrent eval failed: %v", err)
		}
	}
}

// 11. Large List Allocation & Step Quota Test
func TestAdversarial_LargeListAllocationAndStepLimit(t *testing.T) {
	candles := createTestCandles(10)
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	engine := NewEngine(nil)

	// Attempts to construct an enormous list via repeated concatenation
	script := `
def main(ctx):
    lst = [1] * 1000
    for i in range(25):
        lst = lst + lst
    return []
`
	_, err := engine.Eval(context.Background(), script, sCtx, nil)
	if err == nil {
		t.Fatalf("expected step limit exhaustion or timeout on repeated list doubling")
	}
	errStr := strings.ToLower(err.Error())
	if !strings.Contains(errStr, "step") && !strings.Contains(errStr, "timeout") && !strings.Contains(errStr, "limit") {
		t.Errorf("expected step or timeout error, got: %v", err)
	}
}

// 12. IPv4-Mapped IPv6 SSRF Protection Test
func TestAdversarial_IPv4MappedIPv6SSRF(t *testing.T) {
	candles := createTestCandles(5)
	sCtx := NewScriptContextFromCandles("BINANCE:BTCUSDT", "1m", candles)
	engine := NewEngine(nil)

	// IPv4-mapped IPv6 address for AWS metadata: [::ffff:169.254.169.254]
	script := `
def main(ctx):
    res = ctx.http.get("http://[::ffff:169.254.169.254]/latest/meta-data")
    return []
`
	_, err := engine.Eval(context.Background(), script, sCtx, []string{"*"})
	if err == nil {
		t.Fatalf("expected IPv4-mapped IPv6 metadata access to be blocked, but succeeded")
	}
	if !strings.Contains(err.Error(), security.ErrSSRFProtection.Error()) {
		t.Errorf("expected ErrSSRFProtection for IPv4-mapped IPv6 metadata address, got: %v", err)
	}
}
