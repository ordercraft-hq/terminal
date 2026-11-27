# ORDERCRAFT — Custom Data Provider Integration Guide

This guide walks you through adding a **market data provider** to OrderCraft, covering both **Standard Level 1 (L1) Providers** (OHLCV candles) and **Advanced Level 2 (L2) Providers** (Tick data, Order Book Depth, and Orderflow / Footprint clusters).

OrderCraft follows a **High-Performance, Off-Thread Architecture**:
- All time-series normalization, candle aggregation, tick ingestion, and WebSocket streaming live in pure Go backend ([`internal/datafeed/`](internal/datafeed/)).
- The React + TypeScript frontend ([`frontend/`](frontend/)) receives pre-computed, normalized OHLCV data and footprint clusters, rendering them at 60–144fps using `lightweight-charts` and custom series primitives.

---

## 1. Provider Tiers: L1 vs. L2

OrderCraft differentiates data providers by capability tier:

| Tier | Capabilities | Core Interfaces | Chart Support | Reference Adapters |
| :--- | :--- | :--- | :--- | :--- |
| **Level 1 (L1)** | Historical & Real-Time OHLCV Candles, Instrument Search | `datafeed.DataProvider` | Candlesticks, Bars, Line, Area, Baseline, Heikin-Ashi | `binance.go`, `bybit.go`, `coinbase.go`, `oanda.go`, `alpaca.go` |
| **Level 2 (L2)** | OHLCV Candles + Trade Execution Ticks + Order Book Depth + Footprint Candle Clusters | `datafeed.DataProvider` + `datafeed.L2DataProvider` | All L1 Charts + **Footprint (Cluster Chart)** + **Orderflow Suite** (Delta, Imbalances, Volume Profile) | `databridge.go` (DataBridge L2) |

---

## 2. Repository Architecture & File Map

When adding a provider named `MYEXCHANGE` (e.g. crypto exchange, broker, or institutional bridge), you interact with the following directory structure:

```
ordercraft/
├── internal/
│   ├── datafeed/
│   │   ├── provider.go                        <-- DataProvider & L2DataProvider interfaces
│   │   ├── types.go                           <-- TickData, OrderBookDepth, FootprintBar, DeltaAggregator
│   │   ├── coordinator.go                     <-- Multi-provider router & memory cache
│   │   ├── aggregator.go                      <-- Candle bucketing & timeframe aggregation
│   │   └── providers/
│   │       ├── <name>.go                      <-- [CREATE] Your new provider adapter
│   │       ├── <name>_test.go                 <-- [CREATE] Unit tests & mock HTTP/WS tests
│   │       ├── databridge.go                  <-- [REFERENCE: L2] DataBridge L2 orderflow adapter
│   │       ├── binance.go                     <-- [REFERENCE: L1] Binance Spot & Futures
│   │       ├── bybit.go                       <-- [REFERENCE: L1] Bybit v5 Linear & Spot
│   │       ├── coinbase.go                    <-- [REFERENCE: L1] Coinbase Exchange Spot
│   │       ├── alpaca.go                      <-- [REFERENCE: L1] Alpaca US Stocks & Crypto
│   │       └── oanda.go                       <-- [REFERENCE: L1] OANDA v20 Forex / CFD
│   └── server/
│       ├── server.go                          <-- [MODIFY] Register provider & status API
│       ├── hub.go                             <-- Auto-routes L1 candles & L2 footprint broadcasts
│       └── providers_test.go                  <-- [MODIFY] Server provider count test
└── frontend/
    └── src/
        ├── utils/
        │   ├── timeframeSupport.ts            <-- [MODIFY] Supported intervals & symbol routing
        │   └── chartTypeSupport.ts            <-- [MODIFY] Register L2 capability (unlocks Footprint)
        └── components/
            └── RightSidebar/
                ├── RightDockRail.tsx          <-- Real-time connected feeds badge count
                └── panels/
                    ├── ProvidersPanel.tsx     <-- [MODIFY] Providers UI panel & integrations
                    └── OrderflowPanel.tsx     <-- Displays Orderflow & Footprint controls when L2 active
```

---

## 3. Interface Contracts

### 3.1 Standard Level 1 (`DataProvider`) Interface

Defined in [`internal/datafeed/provider.go`](internal/datafeed/provider.go):

```go
type DataProvider interface {
    // Unique uppercase exchange identifier (e.g., "COINBASE", "BINANCE", "MYEXCHANGE")
    Name() string

    // Native intervals supported by the provider (e.g. []string{"1m", "5m", "15m", "1h", "1d"})
    SupportedResolutions() []string

    // Historical OHLCV query (from/to unix timestamp seconds UTC, count candles)
    GetHistory(ctx context.Context, symbol, resolution string, from, to int64, count int) ([]Candle, error)

    // Instrument search matching against cached or live symbols
    Search(ctx context.Context, query string) ([]SymbolInfo, error)

    // Real-time streaming subscription (invokes onCandle callback on live ticks/bars)
    Subscribe(ctx context.Context, symbol, resolution string, onCandle func(c Candle)) error

    // Cancels and cleans up a live subscription without leaking channels or goroutines
    Unsubscribe(symbol, resolution string) error
}
```

### 3.2 Advanced Level 2 (`L2DataProvider`) Interface

Defined in [`internal/datafeed/provider.go`](internal/datafeed/provider.go):

```go
type DataTier string

const (
    DataTierL1 DataTier = "L1" // OHLCV Candles only
    DataTierL2 DataTier = "L2" // Ticks, Orderbook Depth, Footprint
)

type L2DataProvider interface {
    DataProvider

    // Returns DataTierL2
    GetDataTier() DataTier

    // Real-time market execution ticks (aggressor trade stream)
    SubscribeTicks(ctx context.Context, symbol string, onTick func(t TickData)) error
    UnsubscribeTicks(symbol string) error

    // Real-time Level 2 order book market depth (bids and asks ladder)
    SubscribeDepth(ctx context.Context, symbol string, onDepth func(d OrderBookDepth)) error
    UnsubscribeDepth(symbol string) error

    // Historical Footprint candle clusters (price levels with bid/ask volume)
    GetFootprintHistory(ctx context.Context, symbol, resolution string, from, to int64, count int) ([]FootprintBar, error)

    // Real-time streaming Footprint updates (emits as ticks aggregate into the forming bar)
    SubscribeFootprint(ctx context.Context, symbol, resolution string, onFootprint func(f FootprintBar)) error
    UnsubscribeFootprint(symbol, resolution string) error
}
```

### 3.3 Core Data Models

Defined in [`internal/datafeed/provider.go`](internal/datafeed/provider.go) and [`internal/datafeed/types.go`](internal/datafeed/types.go):

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
    FullSymbol  string `json:"full_symbol"`  // e.g. "MYEXCHANGE:BTC-USD"
    Description string `json:"description"`  // e.g. "Bitcoin / US Dollar (MyExchange)"
    Exchange    string `json:"exchange"`     // e.g. "MYEXCHANGE"
    Type        string `json:"type"`         // "crypto", "forex", "stock", "bridge"
    PriceScale  int    `json:"price_scale"`  // e.g. 100 for 2 decimals, 10000 for 4 decimals
}

type TickData struct {
    Time     int64    `json:"time"`                // Unix timestamp in seconds (UTC)
    TimeNano int64    `json:"time_nano,omitempty"` // Unix timestamp in nanoseconds (UTC)
    Price    float64  `json:"price"`               // Execution price
    Volume   float64  `json:"volume"`              // Execution quantity/size
    Side     TickSide `json:"side"`                // "buy", "sell", or "unknown"
    Symbol   string   `json:"symbol,omitempty"`    // Full symbol (e.g. "MYEXCHANGE:BTCUSDT")
    TradeID  string   `json:"trade_id,omitempty"`  // Exchange match/trade ID
}

type OrderBookDepth struct {
    Symbol string           `json:"symbol"`
    Time   int64            `json:"time"`
    Bids   []OrderBookLevel `json:"bids"`
    Asks   []OrderBookLevel `json:"asks"`
}

type FootprintPriceLevel struct {
    Price       float64 `json:"price"`        // Discretized price tier
    BidVolume   float64 `json:"bid_volume"`   // Aggressor sell volume
    AskVolume   float64 `json:"ask_volume"`   // Aggressor buy volume
    TotalVolume float64 `json:"total_volume"` // BidVolume + AskVolume
    Delta       float64 `json:"delta"`        // AskVolume - BidVolume
    Imbalance   bool    `json:"imbalance"`    // Exceeds imbalance ratio
}

type FootprintBar struct {
    Time        int64                 `json:"time"`        // Period start timestamp in seconds (UTC)
    Resolution  string                `json:"resolution"`  // Candle timeframe resolution (e.g. "5m")
    Candle      Candle                `json:"candle"`      // Underlying OHLCV candle
    Levels      []FootprintPriceLevel `json:"levels"`      // Price levels sorted ascending by price
    TotalBid    float64               `json:"total_bid"`   // Aggregate bid volume in bar
    TotalAsk    float64               `json:"total_ask"`   // Aggregate ask volume in bar
    TotalDelta  float64               `json:"total_delta"` // TotalAsk - TotalBid
    POC         float64               `json:"poc"`         // Point of Control (highest volume price)
    POCVolume   float64               `json:"poc_volume"`  // Total volume traded at POC
    VAH         float64               `json:"vah"`         // Value Area High (70% volume containment)
    VAL         float64               `json:"val"`         // Value Area Low (70% volume containment)
}
```

---

## 4. Implementing a Standard Level 1 (L1) Provider

Follow this workflow when your data source provides historical bars and live OHLCV candle streams.

### Step 1: Create the Adapter (`internal/datafeed/providers/<name>.go`)

```go
package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
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
	return p
}

func (p *MyExchangeProvider) Name() string {
	return "MYEXCHANGE"
}

func (p *MyExchangeProvider) SupportedResolutions() []string {
	return []string{"1m", "5m", "15m", "1h", "4h", "1d"}
}

func (p *MyExchangeProvider) normalizeSymbol(raw string) string {
	clean := raw
	if parts := strings.Split(raw, ":"); len(parts) == 2 {
		clean = parts[1]
	}
	return strings.ToUpper(strings.TrimSpace(clean))
}

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

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var rawData [][]float64
	if err := json.NewDecoder(resp.Body).Decode(&rawData); err != nil {
		return nil, err
	}

	// NOTE: Lightweight-charts requires strict chronological order (oldest -> newest)
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
	// Implement exponential backoff reconnection loop using nhooyr.io/websocket
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
```

---

## 5. Implementing an Advanced Level 2 (L2) Provider

If your provider supplies **execution ticks**, **order book depth**, or **footprint clusters** (such as direct exchange WebSocket trade feeds or local Level 2 DataBridge feeds):

### 5.1 Architecture Patterns for L2 Footprints

There are two primary ways an L2 provider delivers footprints to OrderCraft:

1. **Native Footprint API (e.g. DataBridge):** The external server aggregates ticks into footprint bars and supplies `/history` and `footprint_bar` WebSocket events directly.
2. **On-the-Fly Tick Aggregation (`datafeed.DeltaAggregator`):** Your adapter subscribes to raw market trade ticks (`SubscribeTicks`) and feeds them into OrderCraft's built-in `DeltaAggregator`. The aggregator quantizes prices to tick boundaries, classifies aggressor buy/sell volume, calculates continuous POC/VAH/VAL, and emits `FootprintBar` updates in real-time.

### 5.2 Step-by-Step L2 Provider Implementation

Create your adapter in `internal/datafeed/providers/<name>.go`:

```go
package providers

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/ordercraft-hq/terminal/internal/datafeed"
)

type MyL2Provider struct {
	*MyExchangeProvider // Embed base L1 implementation

	wsMu                sync.Mutex
	activeTickSubs      map[string]map[uint64]func(t datafeed.TickData)
	activeDepthSubs     map[string]map[uint64]func(d datafeed.OrderBookDepth)
	activeFootprintSubs map[string]map[uint64]func(f datafeed.FootprintBar)
	aggregators         map[string]*datafeed.DeltaAggregator
	nextSubID           uint64
}

func NewMyL2Provider() *MyL2Provider {
	base := NewMyExchangeProvider()
	return &MyL2Provider{
		MyExchangeProvider:  base,
		activeTickSubs:      make(map[string]map[uint64]func(t datafeed.TickData)),
		activeDepthSubs:     make(map[string]map[uint64]func(d datafeed.OrderBookDepth)),
		activeFootprintSubs: make(map[string]map[uint64]func(f datafeed.FootprintBar)),
		aggregators:         make(map[string]*datafeed.DeltaAggregator),
	}
}

// 1. Declare DataTier L2
func (p *MyL2Provider) GetDataTier() datafeed.DataTier {
	return datafeed.DataTierL2
}

// 2. Subscribe to execution ticks
func (p *MyL2Provider) SubscribeTicks(ctx context.Context, symbol string, onTick func(t datafeed.TickData)) error {
	sym := p.normalizeSymbol(symbol)
	p.wsMu.Lock()
	defer p.wsMu.Unlock()

	p.nextSubID++
	subID := p.nextSubID

	listeners, exists := p.activeTickSubs[sym]
	if !exists {
		listeners = make(map[uint64]func(t datafeed.TickData))
		p.activeTickSubs[sym] = listeners
		// Send wire subscription for live trade ticks (e.g. WebSocket trade stream)
	}
	listeners[subID] = onTick
	return nil
}

func (p *MyL2Provider) UnsubscribeTicks(symbol string) error {
	sym := p.normalizeSymbol(symbol)
	p.wsMu.Lock()
	defer p.wsMu.Unlock()

	delete(p.activeTickSubs, sym)
	// Send wire unsubscribe command
	return nil
}

// 3. Subscribe to Order Book Market Depth
func (p *MyL2Provider) SubscribeDepth(ctx context.Context, symbol string, onDepth func(d datafeed.OrderBookDepth)) error {
	sym := p.normalizeSymbol(symbol)
	p.wsMu.Lock()
	defer p.wsMu.Unlock()

	p.nextSubID++
	subID := p.nextSubID

	listeners, exists := p.activeDepthSubs[sym]
	if !exists {
		listeners = make(map[uint64]func(d datafeed.OrderBookDepth))
		p.activeDepthSubs[sym] = listeners
		// Send wire subscription for orderbook depth
	}
	listeners[subID] = onDepth
	return nil
}

func (p *MyL2Provider) UnsubscribeDepth(symbol string) error {
	sym := p.normalizeSymbol(symbol)
	p.wsMu.Lock()
	defer p.wsMu.Unlock()

	delete(p.activeDepthSubs, sym)
	return nil
}

// 4. Fetch Historical Footprints
func (p *MyL2Provider) GetFootprintHistory(ctx context.Context, symbol, resolution string, from, to int64, count int) ([]datafeed.FootprintBar, error) {
	// Query historical footprint bars from REST endpoint or synthesize from historical ticks
	return []datafeed.FootprintBar{}, nil
}

// 5. Real-Time Footprint Streaming via DeltaAggregator
func (p *MyL2Provider) SubscribeFootprint(ctx context.Context, symbol, resolution string, onFootprint func(f datafeed.FootprintBar)) error {
	sym := p.normalizeSymbol(symbol)
	key := fmt.Sprintf("%s::%s", sym, resolution)

	p.wsMu.Lock()
	defer p.wsMu.Unlock()

	p.nextSubID++
	subID := p.nextSubID

	listeners, exists := p.activeFootprintSubs[key]
	if !exists {
		listeners = make(map[uint64]func(f datafeed.FootprintBar))
		p.activeFootprintSubs[key] = listeners

		// Create a DeltaAggregator if none exists for this symbol/timeframe
		if _, hasAgg := p.aggregators[key]; !hasAgg {
			tickSize := 0.25 // Quantization step (e.g. 0.25 for ES/NQ, 0.01 for Crypto)
			agg := datafeed.NewDeltaAggregator(resolution, tickSize)
			p.aggregators[key] = agg

			// Hook raw ticks into the DeltaAggregator
			p.SubscribeTicks(ctx, sym, func(tick datafeed.TickData) {
				formingBar := agg.AddTick(tick)
				if formingBar != nil {
					p.wsMu.Lock()
					activeListeners := p.activeFootprintSubs[key]
					p.wsMu.Unlock()

					for _, cb := range activeListeners {
						cb(*formingBar)
					}
				}
			})
		}
	}
	listeners[subID] = onFootprint
	return nil
}

func (p *MyL2Provider) UnsubscribeFootprint(symbol, resolution string) error {
	sym := p.normalizeSymbol(symbol)
	key := fmt.Sprintf("%s::%s", sym, resolution)

	p.wsMu.Lock()
	defer p.wsMu.Unlock()

	delete(p.activeFootprintSubs, key)
	delete(p.aggregators, key)
	return nil
}
```

---

## 6. Server & StreamHub Registration

Once your provider is implemented:

### 6.1 Register in `internal/server/server.go`

Open [`internal/server/server.go`](internal/server/server.go):

1. **Register Provider with the Coordinator:**
```go
func NewServer(s *storage.Storage) *Server {
    coord := datafeed.NewCoordinator()
    coord.RegisterProvider(providers.NewBinanceProvider())
    coord.RegisterProvider(providers.NewMyL2Provider()) // <-- REGISTER HERE
    coord.RegisterAlias("MYEX", "MYL2")                 // Optional alias
```

2. **Configure Provider Status API (`handleProvidersStatus`):**
```go
    case "MYL2":
        info["name"] = "MyExchange Level 2 Market Engine"
        info["type"] = "crypto_l2"
        info["latencyMs"] = 15
        info["dataTier"] = "L2" // <-- Explicitly mark L2
        provList = append(provList, info)
```

### 6.2 Automatic StreamHub Routing (`internal/server/hub.go`)

OrderCraft's WebSocket `StreamHub` automatically detects `L2DataProvider` instances when a client subscribes to a topic. You do not need to write custom multiplexing logic:

```go
// hub.go: When a client subscribes, StreamHub detects L2 capability:
if l2p, ok := provider.(datafeed.L2DataProvider); ok {
    go func() {
        _ = l2p.SubscribeFootprint(context.Background(), cleanSym, resCapture, func(fp datafeed.FootprintBar) {
            h.BroadcastFootprint(symCapture, resCapture, fp)
        })
    }()
}
```

The server broadcasts live footprint bars under the WS message type `"footprint"`.

---

## 7. Frontend Integration Checklist

To enable full UI support (toolbar intervals, symbol search routing, and unlocking Footprint mode in the chart selector):

### 7.1 Register Timeframe Support (`frontend/src/utils/timeframeSupport.ts`)

Open [`frontend/src/utils/timeframeSupport.ts`](frontend/src/utils/timeframeSupport.ts):

```ts
export const PROVIDER_SUPPORTED_TIMEFRAMES: Record<string, string[]> = {
  ...
  MYL2: [
    '1s', '5s', '15s', '30s',
    '1m', '5m', '15m', '30m',
    '1h', '4h', '1D', '1d',
  ],
};

export function getProviderFromSymbol(symbol: string): string {
  ...
  if (prefix === 'MYL2' || prefix === 'MYEX') {
    return 'MYL2';
  }
}
```

### 7.2 Unlock Footprint & Orderflow (`frontend/src/utils/chartTypeSupport.ts`)

Open [`frontend/src/utils/chartTypeSupport.ts`](frontend/src/utils/chartTypeSupport.ts) and add your provider identifier to `L2_CAPABLE_PROVIDERS`:

```ts
const L2_CAPABLE_PROVIDERS = new Set<string>([
  'DATABRIDGE',
  'BRIDGE',
  'L2FEED',
  'MYL2', // <-- UNLOCKS FOOTPRINT CHART & ORDERFLOW PANEL
]);
```

> [!IMPORTANT]
> If a provider is not registered in `L2_CAPABLE_PROVIDERS`, the chart type dropdown will gracefully disable the **Footprint** chart option, and the Orderflow sidebar panel will display an informational banner: *"OrderFlow Features not Supported for this provider"*. Adding your provider here unlocks all Footprint, Delta, and Volume Profile features.

### 7.3 Update UI Providers Panel (`frontend/src/components/RightSidebar/panels/ProvidersPanel.tsx`)

Add your provider definition with the `dataTier: 'L2'` tag:

```ts
{
  id: 'MYL2',
  name: 'MyExchange Level 2 Market Engine',
  status: 'connected',
  type: 'crypto_l2',
  dataTier: 'L2',
  latencyMs: 15,
  supportedIntervals: ['1s', '1m', '5m', '15m', '1h', '4h', '1d'],
},
```

---

## 8. Verification & Testing

### 8.1 Backend Unit & Integration Tests

Create `internal/datafeed/providers/<name>_test.go`:

```go
package providers

import (
	"context"
	"testing"
	"github.com/ordercraft-hq/terminal/internal/datafeed"
)

func TestMyL2Provider_Contract(t *testing.T) {
	p := NewMyL2Provider()
	if p.Name() != "MYL2" {
		t.Fatalf("Expected MYL2, got %s", p.Name())
	}
	if p.GetDataTier() != datafeed.DataTierL2 {
		t.Fatalf("Expected DataTierL2, got %v", p.GetDataTier())
	}
}

func TestMyL2Provider_DeltaAggregator(t *testing.T) {
	agg := datafeed.NewDeltaAggregator("1m", 0.25)
	bar := agg.AddTick(datafeed.TickData{
		Time:   1700000000,
		Price:  100.25,
		Volume: 10,
		Side:   datafeed.TickSideBuy,
	})
	if bar == nil {
		t.Fatalf("Expected forming bar output from tick")
	}
	if bar.TotalAsk != 10 {
		t.Errorf("Expected TotalAsk 10, got %f", bar.TotalAsk)
	}
}
```

Run test suite:
```bash
go test -v ./internal/server ./internal/datafeed/providers ./internal/datafeed
```

### 8.2 Frontend Typecheck & Build

```bash
cd frontend && npm run build
```
*Expected: `✓ built in X.XXs` with 0 TypeScript errors.*

### 8.3 Live Visual Verification

1. Launch OrderCraft: `go run main.go -port 8080`.
2. Open `http://localhost:8080`.
3. Open **Data Providers & Feeds** in the right sidebar — confirm your provider displays the purple **L2 Level 2** badge with green **Connected** status.
4. Press `Ctrl+K`, search `MYL2:BTC-USD`, and press Enter.
5. In the top toolbar chart type selector, select **Footprint**.
6. Verify footprint cluster candles render bid/ask volumes, POC bars, and Value Area shading at 60–144fps.
7. Open the **Orderflow & Footprint** panel on the right dock rail — verify Imbalances, Stats, and Volume Profile toggles operate smoothly.

---

## 9. Important Invariants & Performance Rules

1. **Strict Chronological Ordering (`time ASC`):** All candle slices and footprint bar histories MUST be sorted oldest-first.
2. **Unix Seconds UTC:** The `Time` property in `datafeed.Candle`, `datafeed.TickData`, and `datafeed.FootprintBar` MUST be in **seconds UTC** (not milliseconds).
3. **Quantized Price Tiers:** In `FootprintPriceLevel`, prices must be quantized to consistent tick boundaries using `math.Round(price / tickSize) * tickSize` to prevent sub-penny level fragmentation.
4. **No Goroutine or Channel Leaks:** Every `Subscribe` and `SubscribeTicks` must accept a `context.Context` and provide idempotent `Unsubscribe` cleanup.
5. **Level-of-Detail (LOD) & GPU Rendering Safety:** All footprint rendering in OrderCraft uses adaptive LOD (`cellH >= 14 && clusterW >= 36` for text rasterization). Do not attempt to force canvas text rendering when cell heights are too small for glyph display.
6. **Zero Proprietary Code:** Implement all adapters from first principles using standard open-source Go libraries (`net/http`, `nhooyr.io/websocket`). Never include proprietary third-party binaries or obfuscated client packages.
