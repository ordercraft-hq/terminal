# ORDERCRAFT — Custom Data Provider Integration Guide

This guide walks you through adding a **new market data provider** (crypto exchange, forex/CFD broker, equity feed, or custom trading engine bridge) to Ordercraft.

Ordercraft follows a **High-Performance, Off-Thread Architecture**:
- All time-series normalization, candle aggregation, and WebSocket streaming live in pure Go backend ([`internal/datafeed/providers/`](internal/datafeed/providers/)).
- The React + TypeScript frontend ([`frontend/`](frontend/)) receives pre-computed, normalized OHLCV data and renders it at 60–144fps using `lightweight-charts`.

---

## Repository Architecture & File Map

When adding a provider named `EXCHANGE` (e.g., `KRAKEN`, `COINBASE`, `BYBIT`), you will interact with the following directory structure:

```
ordercraft/
├── internal/
│   ├── datafeed/
│   │   ├── provider.go                        <-- DataProvider interface & Candle models
│   │   ├── coordinator.go                     <-- Multi-provider router & memory cache
│   │   ├── aggregator.go                      <-- Candle bucketing & timeframe aggregation
│   │   └── providers/
│   │       ├── <name>.go                      <-- [CREATE] Your new provider adapter
│   │       ├── <name>_test.go                 <-- [CREATE] Unit tests & mock HTTP tests
│   │       ├── binance.go                     <-- [REFERENCE] Binance Spot & Futures
│   │       ├── bybit.go                       <-- [REFERENCE] Bybit v5 Linear & Spot
│   │       ├── coinbase.go                    <-- [REFERENCE] Coinbase Exchange Spot
│   │       ├── alpaca.go                      <-- [REFERENCE] Alpaca US Stocks & Crypto
│   │       └── oanda.go                       <-- [REFERENCE] OANDA v20 Forex / CFD
│   └── server/
│       ├── server.go                          <-- [MODIFY] Register provider & status API
│       └── providers_test.go                  <-- [MODIFY] Server provider count test
└── frontend/
    └── src/
        ├── utils/
        │   └── timeframeSupport.ts            <-- [MODIFY] Supported intervals & symbol routing
        └── components/
            └── RightSidebar/
                ├── RightDockRail.tsx          <-- Real-time connected feeds badge count
                └── panels/
                    └── ProvidersPanel.tsx     <-- [MODIFY] Providers UI panel & integrations
```

---

## Architecture Checklist

| # | Layer | Relative File Path | Action | Description |
|---|---|---|---|---|
| **1** | Go Backend | [`internal/datafeed/providers/<name>.go`](internal/datafeed/providers/) | **Create** | Implements the `datafeed.DataProvider` interface (REST + WS). |
| **2** | Go Backend | [`internal/datafeed/providers/<name>_test.go`](internal/datafeed/providers/) | **Create** | Table-driven tests for normalization, mock REST parsing, and search. |
| **3** | Go Backend | [`internal/server/server.go`](internal/server/server.go) | **Modify** | Register provider in `Coordinator` and update `/api/providers/status`. |
| **4** | Go Backend | [`internal/server/providers_test.go`](internal/server/providers_test.go) | **Modify** | Update provider count and ID assertions. |
| **5** | TypeScript | [`frontend/src/utils/timeframeSupport.ts`](frontend/src/utils/timeframeSupport.ts) | **Modify** | Register supported intervals, symbol routing, and UI display name. |
| **6** | React UI | [`frontend/src/components/RightSidebar/panels/ProvidersPanel.tsx`](frontend/src/components/RightSidebar/panels/ProvidersPanel.tsx) | **Modify** | Add initial state entry and update supported integrations list. |

---

## 1. The `DataProvider` Interface Contract

Every adapter in `internal/datafeed/providers/` must implement the `datafeed.DataProvider` interface defined in [`internal/datafeed/provider.go`](internal/datafeed/provider.go):

```go
type DataProvider interface {
    // Unique uppercase exchange identifier (e.g., "COINBASE", "BINANCE", "BYBIT")
    Name() string

    // Native intervals supported by the provider (e.g. []string{"1m", "5m", "15m", "1h", "1d"})
    SupportedResolutions() []string

    // Historical OHLCV query (from/to unix timestamp seconds UTC, count candles)
    GetHistory(ctx context.Context, symbol, resolution string, from, to int64, count int) ([]Candle, error)

    // Instrument search matching against cached or live symbols
    Search(ctx context.Context, query string) ([]SymbolInfo, error)

    // Real-time streaming subscription (calls onCandle callback for live ticks/bars)
    Subscribe(ctx context.Context, symbol, resolution string, onCandle func(c Candle)) error

    // Cancels and cleans up a live subscription without leaking channels or goroutines
    Unsubscribe(symbol, resolution string) error
}
```

### Core Data Models

```go
type Candle struct {
    Time   int64   `json:"time"`   // Unix timestamp in seconds (UTC)
    Open   float64 `json:"open"`
    High   float64 `json:"high"`
    Low    float64 `json:"low"`
    Close  float64 `json:"close"`
    Volume float64 `json:"volume"`
}

type SymbolInfo struct {
    Symbol      string `json:"symbol"`       // e.g. "BTC-USD" or "BTCUSDT"
    FullSymbol  string `json:"full_symbol"`  // e.g. "COINBASE:BTC-USD"
    Description string `json:"description"`  // e.g. "Bitcoin / US Dollar (Coinbase)"
    Exchange    string `json:"exchange"`     // e.g. "COINBASE"
    Type        string `json:"type"`         // "crypto", "forex", "stock", "bridge"
    PriceScale  int    `json:"price_scale"`  // e.g. 100 for 2 decimals, 10000 for 4 decimals
}
```

---

## 2. Step-by-Step Implementation

### Step 1: Create the Provider (`internal/datafeed/providers/<name>.go`)

Create a new file in `internal/datafeed/providers/<name>.go` (for example, `myexchange.go`):

```go
package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
	"github.com/ordercraft-hq/terminal/internal/datafeed"
)

type MyExchangeProvider struct {
	client        *http.Client
	baseURL       string
	wsURL         string
	mu            sync.Mutex
	subs          map[string]context.CancelFunc
	symbolsMu     sync.RWMutex
	cachedSymbols []datafeed.SymbolInfo
}

func NewMyExchangeProvider() *MyExchangeProvider {
	p := &MyExchangeProvider{
		client:  &http.Client{Timeout: 15 * time.Second},
		baseURL: "https://api.myexchange.com",
		wsURL:   "wss://ws.myexchange.com/feed",
		subs:    make(map[string]context.CancelFunc),
	}
	p.seedDefaultSymbols()
	go p.loadInstruments(context.Background())
	return p
}

func (p *MyExchangeProvider) Name() string {
	return "MYEXCHANGE"
}

func (p *MyExchangeProvider) SupportedResolutions() []string {
	return []string{"1m", "5m", "15m", "1h", "4h", "1d"}
}

// Normalize symbols (e.g. MYEXCHANGE:BTCUSD -> BTC-USD)
func (p *MyExchangeProvider) normalizeSymbol(raw string) string {
	clean := raw
	if parts := strings.Split(raw, ":"); len(parts) == 2 {
		clean = parts[1]
	}
	return strings.ToUpper(strings.TrimSpace(clean))
}

// Fetch historical candles via REST API
func (p *MyExchangeProvider) GetHistory(ctx context.Context, symbol, resolution string, from, to int64, count int) ([]datafeed.Candle, error) {
	sym := p.normalizeSymbol(symbol)
	if count <= 0 {
		count = 300
	}

	endpoint := fmt.Sprintf("%s/v1/candles?symbol=%s&interval=%s&limit=%d", p.baseURL, url.QueryEscape(sym), resolution, count)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "OrderCraft/1.0 (Terminal Workstation)")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	// Parse JSON candles (ensure oldest -> newest chronological order!)
	var rawData [][]float64
	if err := json.NewDecoder(resp.Body).Decode(&rawData); err != nil {
		return nil, err
	}

	candles := make([]datafeed.Candle, 0, len(rawData))
	for _, row := range rawData {
		candles = append(candles, datafeed.Candle{
			Time:   int64(row[0]),
			Open:   row[1],
			High:   row[2],
			Low:    row[3],
			Close:  row[4],
			Volume: row[5],
		})
	}
	return candles, nil
}

// Search instruments
func (p *MyExchangeProvider) Search(ctx context.Context, query string) ([]datafeed.SymbolInfo, error) {
	p.symbolsMu.RLock()
	defer p.symbolsMu.RUnlock()

	q := strings.ToUpper(strings.TrimSpace(query))
	if q == "" {
		if len(p.cachedSymbols) > 50 {
			return p.cachedSymbols[:50], nil
		}
		return p.cachedSymbols, nil
	}

	var res []datafeed.SymbolInfo
	for _, s := range p.cachedSymbols {
		if strings.Contains(strings.ToUpper(s.Symbol), q) || strings.Contains(strings.ToUpper(s.Description), q) {
			res = append(res, s)
			if len(res) >= 50 {
				break
			}
		}
	}
	return res, nil
}

// Real-time WebSocket streaming
func (p *MyExchangeProvider) Subscribe(ctx context.Context, symbol, resolution string, onCandle func(c datafeed.Candle)) error {
	sym := p.normalizeSymbol(symbol)
	subKey := fmt.Sprintf("%s@%s", sym, resolution)

	p.mu.Lock()
	if _, exists := p.subs[subKey]; exists {
		p.mu.Unlock()
		return nil
	}
	subCtx, cancel := context.WithCancel(ctx)
	p.subs[subKey] = cancel
	p.mu.Unlock()

	go p.runWebSocket(subCtx, sym, resolution, onCandle)
	return nil
}

func (p *MyExchangeProvider) Unsubscribe(symbol, resolution string) error {
	sym := p.normalizeSymbol(symbol)
	subKey := fmt.Sprintf("%s@%s", sym, resolution)

	p.mu.Lock()
	defer p.mu.Unlock()
	if cancel, ok := p.subs[subKey]; ok {
		cancel()
		delete(p.subs, subKey)
	}
	return nil
}

func (p *MyExchangeProvider) runWebSocket(ctx context.Context, symbol, resolution string, onCandle func(c datafeed.Candle)) {
	backoff := 1 * time.Second
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		conn, _, err := websocket.Dial(ctx, p.wsURL, nil)
		if err != nil {
			select {
			case <-time.After(backoff):
				backoff = min(backoff*2, 30*time.Second)
				continue
			case <-ctx.Done():
				return
			}
		}
		backoff = 1 * time.Second

		// Send subscription payload
		wsjson.Write(ctx, conn, map[string]interface{}{
			"action": "subscribe",
			"symbol": symbol,
		})

		// Read loop
		for {
			var msg map[string]interface{}
			if err := wsjson.Read(ctx, conn, &msg); err != nil {
				conn.Close(websocket.StatusAbnormalClosure, "read error")
				break
			}
			// Build and deliver live bar to onCandle()
		}
	}
}

func (p *MyExchangeProvider) seedDefaultSymbols() {
	p.symbolsMu.Lock()
	defer p.symbolsMu.Unlock()
	p.cachedSymbols = []datafeed.SymbolInfo{
		{
			Symbol:      "BTC-USD",
			FullSymbol:  "MYEXCHANGE:BTC-USD",
			Description: "Bitcoin / US Dollar (MyExchange)",
			Exchange:    "MYEXCHANGE",
			Type:        "crypto",
			PriceScale:  100,
		},
	}
}

func (p *MyExchangeProvider) loadInstruments(ctx context.Context) {
	// Optional: Fetch live products from REST endpoint and update p.cachedSymbols
}
```

---

### Step 2: Add Provider Unit Tests (`internal/datafeed/providers/<name>_test.go`)

Create `internal/datafeed/providers/myexchange_test.go`:

```go
package providers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMyExchangeProvider_Basics(t *testing.T) {
	p := NewMyExchangeProvider()
	if p.Name() != "MYEXCHANGE" {
		t.Fatalf("Expected MYEXCHANGE, got %s", p.Name())
	}
	if len(p.SupportedResolutions()) == 0 {
		t.Fatalf("Expected non-empty supported resolutions")
	}
}

func TestMyExchangeProvider_GetHistory_Mock(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// [[time, open, high, low, close, volume]]
		w.Write([]byte(`[[1700000000, 100.0, 105.0, 99.0, 104.0, 50.0]]`))
	}))
	defer ts.Close()

	p := NewMyExchangeProvider()
	p.baseURL = ts.URL

	candles, err := p.GetHistory(context.Background(), "BTC-USD", "15m", 0, 0, 10)
	if err != nil {
		t.Fatalf("GetHistory failed: %v", err)
	}
	if len(candles) != 1 {
		t.Fatalf("Expected 1 candle, got %d", len(candles))
	}
	if candles[0].Close != 104.0 {
		t.Errorf("Expected close 104.0, got %f", candles[0].Close)
	}
}
```

---

### Step 3: Register in Server (`internal/server/server.go`)

Open [`internal/server/server.go`](internal/server/server.go):

1. **Register in `NewServer()`**:
```go
func NewServer(s *storage.Storage) *Server {
    coord := datafeed.NewCoordinator()
    coord.RegisterProvider(providers.NewBinanceProvider())
    coord.RegisterProvider(providers.NewBybitProvider())
    coord.RegisterProvider(providers.NewCoinbaseProvider())
    coord.RegisterProvider(providers.NewMyExchangeProvider()) // <-- REGISTER NEW PROVIDER
    coord.RegisterAlias("MYEX", "MYEXCHANGE")                 // Optional alias
    coord.RegisterProvider(providers.NewOandaProvider())
    ...
```

2. **Update Provider Status in `handleProvidersStatus()`**:
```go
    case "MYEXCHANGE":
        info["name"] = "MyExchange Pro Market Data"
        info["type"] = "crypto"
        info["latencyMs"] = 38
```

3. **Update UI Sorting Order**:
```go
    order := map[string]int{
        "BINANCE": 1,
        "BYBIT": 2,
        "COINBASE": 3,
        "MYEXCHANGE": 4, // <-- DEFINE DESIRED DISPLAY ORDER
        "OANDA": 5,
    }
```

4. **Update `availableIntegrations`**:
If `MYEXCHANGE` was previously listed in `availableIntegrations`, remove it from that slice since it is now registered under active connected feeds.

---

### Step 4: Update Server Integration Test (`internal/server/providers_test.go`)

Open [`internal/server/providers_test.go`](internal/server/providers_test.go) and update assertions:
```go
if resp.Count < 6 { // Increment expected provider count
    t.Fatalf("Expected at least 6 providers, got %d", resp.Count)
}

foundMyEx := false
for _, p := range resp.Providers {
    if p["id"] == "MYEXCHANGE" {
        foundMyEx = true
        break
    }
}
if !foundMyEx {
    t.Errorf("MYEXCHANGE not found in providers status response")
}
```

---

### Step 5: Register Frontend Timeframes (`frontend/src/utils/timeframeSupport.ts`)

Open [`frontend/src/utils/timeframeSupport.ts`](frontend/src/utils/timeframeSupport.ts):

1. **Add to `PROVIDER_SUPPORTED_TIMEFRAMES`**:
```ts
export const PROVIDER_SUPPORTED_TIMEFRAMES: Record<string, string[]> = {
  ...
  MYEXCHANGE: [
    '1m', '5m', '15m',
    '1h', '4h',
    '1D', '1d',
  ],
};
```

2. **Update Symbol Parsing (`getProviderFromSymbol`)**:
```ts
if (prefix === 'MYEXCHANGE' || prefix === 'MYEX') {
  return 'MYEXCHANGE';
}
```

3. **Update Display Name (`getProviderDisplayName`)**:
```ts
case 'MYEXCHANGE':
case 'MYEX':
  return 'MyExchange';
```

---

### Step 6: Update Sidebar Panel (`frontend/src/components/RightSidebar/panels/ProvidersPanel.tsx`)

Open [`frontend/src/components/RightSidebar/panels/ProvidersPanel.tsx`](frontend/src/components/RightSidebar/panels/ProvidersPanel.tsx):

1. **Add initial state entry in `providers` array**:
```ts
{
  id: 'MYEXCHANGE',
  name: 'MyExchange Pro Market Data',
  status: 'connected',
  type: 'crypto',
  latencyMs: 38,
  supportedIntervals: ['1m', '5m', '15m', '1h', '4h', '1d'],
},
```

2. **Remove `MYEXCHANGE` from initial `integrations` array** (if present).

---

## 3. Real-World Reference Implementations

Inspect these production implementations in the repository to understand different provider patterns:

- **Crypto REST & WebSocket:** [`internal/datafeed/providers/coinbase.go`](internal/datafeed/providers/coinbase.go) and [`internal/datafeed/providers/bybit.go`](internal/datafeed/providers/bybit.go)
- **High-Frequency Aggregation:** [`internal/datafeed/providers/binance.go`](internal/datafeed/providers/binance.go)
- **Forex / CFD REST & Stream:** [`internal/datafeed/providers/oanda.go`](internal/datafeed/providers/oanda.go)
- **US Equities & Crypto Broker:** [`internal/datafeed/providers/alpaca.go`](internal/datafeed/providers/alpaca.go)

---

## 4. Verification & Testing

Run the test suite to verify your new provider meets Ordercraft's quality bar:

### 1. Run Backend Unit & Integration Tests
```bash
go test -v ./internal/server ./internal/datafeed/providers ./internal/datafeed
```
*Expected: 100% PASS with zero race conditions.*

### 2. Compile the Go Executable
```bash
go build -o ordercraft.exe main.go
```

### 3. Build & Typecheck Frontend
```bash
cd frontend && npm run build
```
*Expected: `✓ built` with 0 TypeScript/lint errors.*

### 4. Run & Test Live
Launch Ordercraft and verify:
1. The radio tower icon in the right dock rail increments its badge count.
2. Clicking the icon opens **Data Providers & Feeds** showing your provider with green **Connected** status and its exact timeframes.
3. Open symbol search (`Ctrl+K`), search `MYEXCHANGE:BTC-USD`, and press Enter.
4. Candlesticks load and render cleanly on the chart.
5. Incompatible timeframes (e.g. 1s or 30s) are gracefully disabled/greyed out on the toolbar.

---

## Important Invariants to Follow

1. **Strict Chronological Order (`time ASC`):** Candlestick charts require candles sorted strictly **oldest-first**. If an API returns newest-first (like Coinbase or Bybit), reverse the slice before returning.
2. **Unix Seconds:** The `Time` field in `datafeed.Candle` MUST always be in **seconds UTC** (not milliseconds).
3. **No Goroutine Leaks:** In `Subscribe()`, store the `context.CancelFunc` in a thread-safe map. In `Unsubscribe()`, call `cancel()` and cleanly close all connections.
4. **Original Implementation Standards:** Author all code from first principles using standard Go libraries (`net/http`, `nhooyr.io/websocket`). Never include proprietary binaries or restricted SDKs.
