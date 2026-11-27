package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"

	"github.com/ordercraft-hq/terminal/internal/datafeed"
)

const (
	maxBridgeHTTPResponseBytes = 16 * 1024 * 1024 // 16 MB JSON response cap
	bridgeWriteTimeout         = 3 * time.Second
	maxSynthesizedLevels       = 2000
)

// DataBridgeProvider implements datafeed.DataProvider connecting to the
// generic DataBridge Level 2 orderflow & candle server.
type DataBridgeProvider struct {
	httpClient *http.Client
	baseURL    string
	wsURL      string

	// Cached symbols catalog
	symbolsMu     sync.RWMutex
	cachedSymbols []datafeed.SymbolInfo
	symbolAlias   map[string]string // e.g. "@NQ" -> "ENQZ26"
	aliasToSymbol map[string]string // e.g. "ENQZ26" -> "@NQ"
	lastFetched   time.Time

	// Real-time WebSocket connection state
	wsMu                sync.Mutex
	writeMu             sync.Mutex
	wsConn              *websocket.Conn
	activeSubs          map[string]map[uint64]func(c datafeed.Candle) // key: "SYMBOL::TIMEFRAME"
	activeTickSubs      map[string]map[uint64]func(t datafeed.TickData)
	activeDepthSubs     map[string]map[uint64]func(d datafeed.OrderBookDepth)
	activeFootprintSubs map[string]map[uint64]func(f datafeed.FootprintBar)
	aggregators         map[string]*datafeed.DeltaAggregator
	lastTickTime        map[string]time.Time // symbol -> last tick receive time
	nextSubID           uint64
	connCtx             context.Context
	connCancel          context.CancelFunc
	reconnectCh         chan struct{}
	stopCh              chan struct{}
	isClosed            bool
}

// NewDataBridgeProvider creates and initializes a generic DataBridgeProvider.
func NewDataBridgeProvider() *DataBridgeProvider {
	httpBase := os.Getenv("BRIDGE_HTTP_URL")
	if httpBase == "" {
		httpBase = os.Getenv("DATABRIDGE_URL")
	}
	if httpBase == "" {
		httpBase = "http://127.0.0.1:8088"
	}
	httpBase = strings.TrimRight(httpBase, "/")

	wsBase := os.Getenv("BRIDGE_WS_URL")
	if wsBase == "" {
		wsBase = os.Getenv("DATABRIDGE_WS_URL")
	}
	if wsBase == "" {
		// Derive from httpBase
		if strings.HasPrefix(httpBase, "https://") {
			wsBase = "wss://" + strings.TrimPrefix(httpBase, "https://") + "/ws"
		} else {
			wsBase = "ws://" + strings.TrimPrefix(httpBase, "http://") + "/ws"
		}
	}

	p := &DataBridgeProvider{
		httpClient:          datafeed.NewHTTPClient(15 * time.Second),
		baseURL:             httpBase,
		wsURL:               wsBase,
		activeSubs:          make(map[string]map[uint64]func(c datafeed.Candle)),
		activeTickSubs:      make(map[string]map[uint64]func(t datafeed.TickData)),
		activeDepthSubs:     make(map[string]map[uint64]func(d datafeed.OrderBookDepth)),
		activeFootprintSubs: make(map[string]map[uint64]func(f datafeed.FootprintBar)),
		aggregators:         make(map[string]*datafeed.DeltaAggregator),
		lastTickTime:        make(map[string]time.Time),
		symbolAlias:         make(map[string]string),
		aliasToSymbol:       make(map[string]string),
		reconnectCh:         make(chan struct{}, 1),
		stopCh:              make(chan struct{}),
	}

	// Pre-load symbol catalog asynchronously if bridge is available
	go p.loadCatalog(context.Background())

	// Start WebSocket supervisor loop
	go p.wsSupervisor()

	// Start live bar supervisor loop (polls /history when WS stream is inactive)
	go p.liveSupervisor()

	return p
}

// Name returns the provider identifier.
func (p *DataBridgeProvider) Name() string {
	return "DATABRIDGE"
}

// GetDataTier returns DataTierL2 indicating this provider supports Level 2 ticks and depth.
func (p *DataBridgeProvider) GetDataTier() datafeed.DataTier {
	return datafeed.DataTierL2
}

// SupportedResolutions returns timeframes natively supported by DataBridge.
func (p *DataBridgeProvider) SupportedResolutions() []string {
	return []string{
		"1s", "5s", "15s", "30s",
		"1m", "2m", "3m", "5m", "10m", "15m", "30m",
		"1h", "2h", "3h", "4h", "12h",
		"1d", "1w",
	}
}

// cleanBridgeSymbol strips provider prefixes such as "DATABRIDGE:" or "BRIDGE:".
func cleanBridgeSymbol(symbol string) string {
	clean := strings.TrimSpace(symbol)
	if idx := strings.Index(clean, ":"); idx != -1 {
		clean = clean[idx+1:]
	}
	return strings.ToUpper(strings.TrimSpace(clean))
}

// normalizeBridgeTimeframe standardizes resolution strings to bridge notation.
func normalizeBridgeTimeframe(resolution string) string {
	clean := strings.TrimSpace(resolution)
	upper := strings.ToUpper(clean)

	if strings.HasSuffix(upper, "S") {
		return strings.ToLower(upper)
	}

	switch upper {
	case "1", "1M":
		return "1m"
	case "2", "2M":
		return "2m"
	case "3", "3M":
		return "3m"
	case "5", "5M":
		return "5m"
	case "10", "10M":
		return "10m"
	case "15", "15M":
		return "15m"
	case "30", "30M":
		return "30m"
	case "60", "1H":
		return "1h"
	case "120", "2H":
		return "2h"
	case "180", "3H":
		return "3h"
	case "240", "4H":
		return "4h"
	case "720", "12H":
		return "12h"
	case "D", "1D":
		return "1d"
	case "W", "1W":
		return "1w"
	default:
		return strings.ToLower(clean)
	}
}

// computePriceScale converts tick size (e.g. 0.25, 0.0001, 1) to integer decimal scale.
func computePriceScale(tickSize float64) int {
	if tickSize <= 0 {
		return 100
	}
	s := strconv.FormatFloat(tickSize, 'f', -1, 64)
	if idx := strings.Index(s, "."); idx != -1 {
		decimals := len(s) - idx - 1
		scale := 1
		for i := 0; i < decimals; i++ {
			scale *= 10
		}
		return scale
	}
	return 1
}

type bridgeHistoryResponse struct {
	Symbol    string `json:"symbol"`
	SymbolID  string `json:"symbolId"`
	Exchange  string `json:"exchange"`
	Timeframe string `json:"timeframe"`
	Count     int    `json:"count"`
	Bars      []struct {
		Time   string  `json:"time"`
		Open   float64 `json:"open"`
		High   float64 `json:"high"`
		Low    float64 `json:"low"`
		Close  float64 `json:"close"`
		Volume float64 `json:"volume"`
		Ticks  int64   `json:"ticks"`
	} `json:"bars"`
	Error string `json:"error,omitempty"`
}

func computeBridgeTimeWindow(tf string, from, to int64, count int) (int64, int64, bool) {
	targetSec := int64(datafeed.ResolutionToSeconds(tf))
	if targetSec <= 0 {
		targetSec = 60
	}

	// If neither from nor to was specified by the caller:
	if from <= 0 && to <= 0 {
		// Only daily and weekly resolutions require an explicit lookback window
		// so DataBridge returns hundreds of daily bars instead of just a few.
		if targetSec >= 86400 {
			now := time.Now().UTC().Unix()
			lookbackSec := int64(count) * targetSec * 2
			if lookbackSec < 365*86400 {
				lookbackSec = 365 * 86400
			}
			return now - lookbackSec, now, true
		}
		// For intraday bars, omitting from/to lets the bridge return the latest `count` bars immediately
		// without scanning weeks of orderbook tick data.
		return 0, 0, false
	}

	effectiveTo := to
	now := time.Now().UTC().Unix()
	if effectiveTo <= 0 || effectiveTo > now {
		effectiveTo = now
	}

	effectiveFrom := from
	if effectiveFrom <= 0 {
		// Proportional lookback with max 4-day buffer for weekends
		lookbackSec := int64(count) * targetSec * 3
		maxIntradayLookback := int64(4 * 86400)
		if lookbackSec > maxIntradayLookback {
			lookbackSec = maxIntradayLookback
		}
		effectiveFrom = effectiveTo - lookbackSec
	}

	return effectiveFrom, effectiveTo, true
}

func (p *DataBridgeProvider) fetchHistoryFromBridge(
	ctx context.Context,
	sym, tf string,
	from, to int64,
	count int,
) ([]datafeed.Candle, error) {
	params := url.Values{}
	params.Set("symbol", sym)
	params.Set("timeframe", tf)

	if count <= 0 {
		count = 200
	}
	if count > 5000 {
		count = 5000
	}
	params.Set("bars", strconv.Itoa(count))

	effectiveFrom, effectiveTo, hasWindow := computeBridgeTimeWindow(tf, from, to, count)
	if hasWindow {
		fromStr := time.Unix(effectiveFrom, 0).UTC().Format(time.RFC3339)
		toStr := time.Unix(effectiveTo, 0).UTC().Format(time.RFC3339)
		params.Set("from", fromStr)
		params.Set("to", toStr)
	}

	reqURL := fmt.Sprintf("%s/history?%s", p.baseURL, params.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to build DataBridge history request: %w", err)
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to request DataBridge history: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("DataBridge history API returned status %d", resp.StatusCode)
	}

	var data bridgeHistoryResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxBridgeHTTPResponseBytes)).Decode(&data); err != nil {
		return nil, fmt.Errorf("failed to decode DataBridge history response: %w", err)
	}

	if data.Error != "" {
		return nil, fmt.Errorf("DataBridge history error: %s", data.Error)
	}

	candles := make([]datafeed.Candle, 0, len(data.Bars))
	for _, b := range data.Bars {
		t, err := time.Parse(time.RFC3339Nano, b.Time)
		if err != nil {
			t, err = time.Parse(time.RFC3339, b.Time)
		}
		if err != nil {
			continue
		}

		candles = append(candles, datafeed.Candle{
			Time:   t.Unix(),
			Open:   b.Open,
			High:   b.High,
			Low:    b.Low,
			Close:  b.Close,
			Volume: b.Volume,
		})
	}

	sort.Slice(candles, func(i, j int) bool {
		return candles[i].Time < candles[j].Time
	})

	return candles, nil
}

// GetHistory fetches historical OHLCV bars from the bridge /history endpoint with automatic contract alias and resolution fallback.
func (p *DataBridgeProvider) GetHistory(
	ctx context.Context,
	symbol, resolution string,
	from, to int64,
	count int,
) ([]datafeed.Candle, error) {
	cleanSym := cleanBridgeSymbol(symbol)
	tf := normalizeBridgeTimeframe(resolution)

	// 1. First attempt: exact requested symbol and timeframe
	candles, err := p.fetchHistoryFromBridge(ctx, cleanSym, tf, from, to, count)
	if err == nil && len(candles) > 0 {
		return candles, nil
	}

	// 2. Second attempt: check if symbol has an active contract alias (e.g. @NQ -> ENQZ26, @MES -> MESZ26)
	p.symbolsMu.RLock()
	aliasSym := p.symbolAlias[strings.ToUpper(cleanSym)]
	p.symbolsMu.RUnlock()

	if aliasSym != "" && aliasSym != cleanSym {
		cAlias, errAlias := p.fetchHistoryFromBridge(ctx, aliasSym, tf, from, to, count)
		if errAlias == nil && len(cAlias) > 0 {
			return cAlias, nil
		}
	}

	return candles, err
}

type bridgeSymbolItem struct {
	Name        string  `json:"name"`
	ID          string  `json:"id"`
	Description string  `json:"description"`
	Exchange    string  `json:"exchange"`
	TickSize    float64 `json:"tickSize"`
	LotSize     float64 `json:"lotSize"`
	Connection  string  `json:"connection"`
}

type bridgeSymbolsResponse struct {
	Count   int                `json:"count"`
	Symbols []bridgeSymbolItem `json:"symbols"`
	Error   string             `json:"error,omitempty"`
}

func (p *DataBridgeProvider) toSymbolInfo(s bridgeSymbolItem) datafeed.SymbolInfo {
	symType := "futures"
	connUpper := strings.ToUpper(s.Connection)
	exchUpper := strings.ToUpper(s.Exchange)
	descUpper := strings.ToUpper(s.Description)

	if strings.Contains(connUpper, "CRYPTO") || strings.Contains(exchUpper, "BINANCE") {
		symType = "crypto"
	} else if strings.Contains(descUpper, "EUR/USD") || strings.Contains(descUpper, "CAD/USD") || strings.Contains(descUpper, "FOREX") {
		symType = "forex"
	} else if strings.Contains(descUpper, "STOCK") || strings.Contains(connUpper, "EQUITIES") {
		symType = "stock"
	}

	exch := "DATABRIDGE"
	if s.Exchange != "" {
		exch = s.Exchange
	}

	return datafeed.SymbolInfo{
		Symbol:      s.Name,
		FullSymbol:  "DATABRIDGE:" + s.Name,
		Description: s.Description,
		Exchange:    exch,
		Type:        symType,
		PriceScale:  computePriceScale(s.TickSize),
	}
}

// loadCatalog fetches the active symbols catalog from the Data Bridge.
func (p *DataBridgeProvider) loadCatalog(ctx context.Context) ([]datafeed.SymbolInfo, error) {
	p.symbolsMu.RLock()
	// Only reuse cache if it has more than 1 symbol and is less than 5 minutes old
	if len(p.cachedSymbols) > 1 && time.Since(p.lastFetched) < 5*time.Minute {
		cached := p.cachedSymbols
		p.symbolsMu.RUnlock()
		return cached, nil
	}
	p.symbolsMu.RUnlock()

	reqURL := fmt.Sprintf("%s/symbols?limit=5000", p.baseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("DataBridge symbols returned HTTP %d", resp.StatusCode)
	}

	var data bridgeSymbolsResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxBridgeHTTPResponseBytes)).Decode(&data); err != nil {
		return nil, err
	}

	symbols := make([]datafeed.SymbolInfo, 0, len(data.Symbols))
	for _, s := range data.Symbols {
		symbols = append(symbols, p.toSymbolInfo(s))
	}

	p.symbolsMu.Lock()
	p.cachedSymbols = symbols
	p.lastFetched = time.Now()
	if p.symbolAlias == nil {
		p.symbolAlias = make(map[string]string)
	}
	if p.aliasToSymbol == nil {
		p.aliasToSymbol = make(map[string]string)
	}
	for _, s := range data.Symbols {
		if s.ID != "" && s.ID != s.Name {
			p.symbolAlias[strings.ToUpper(s.Name)] = s.ID
			p.aliasToSymbol[strings.ToUpper(s.ID)] = s.Name
		}
		nameUpper := strings.ToUpper(s.Name)
		if strings.HasPrefix(nameUpper, "ENQ") {
			p.symbolAlias["@NQ"] = s.Name
			p.symbolAlias["NQ"] = s.Name
		}
		if strings.HasPrefix(nameUpper, "MNQ") {
			p.symbolAlias["@MNQ"] = s.Name
			p.symbolAlias["MNQ"] = s.Name
		}
		if strings.HasPrefix(nameUpper, "EP") {
			p.symbolAlias["@ES"] = s.Name
			p.symbolAlias["ES"] = s.Name
		}
		if strings.HasPrefix(nameUpper, "MES") {
			p.symbolAlias["@MES"] = s.Name
			p.symbolAlias["MES"] = s.Name
		}
	}
	p.symbolsMu.Unlock()

	return symbols, nil
}

// IsActive reports whether the DataBridge connection is currently active.
func (p *DataBridgeProvider) IsActive() bool {
	p.wsMu.Lock()
	defer p.wsMu.Unlock()
	return p.wsConn != nil
}

// Search searches active instruments in DataBridge.
// If the DataBridge server is not running/connected, it immediately returns nil.
func (p *DataBridgeProvider) Search(ctx context.Context, query string) ([]datafeed.SymbolInfo, error) {
	if !p.IsActive() {
		return nil, nil
	}

	p.symbolsMu.RLock()
	defer p.symbolsMu.RUnlock()

	cleanQ := strings.ToUpper(cleanBridgeSymbol(query))
	var results []datafeed.SymbolInfo
	for _, s := range p.cachedSymbols {
		if cleanQ == "" ||
			strings.Contains(strings.ToUpper(s.Symbol), cleanQ) ||
			strings.Contains(strings.ToUpper(s.Description), cleanQ) ||
			strings.Contains(strings.ToUpper(s.FullSymbol), cleanQ) {
			results = append(results, s)
			if len(results) >= 100 {
				break
			}
		}
	}

	return results, nil
}

// wsSupervisor maintains the persistent WebSocket connection to DataBridge.
func (p *DataBridgeProvider) wsSupervisor() {
	backoff := 1 * time.Second

	for {
		p.wsMu.Lock()
		if p.isClosed {
			p.wsMu.Unlock()
			return
		}
		p.wsMu.Unlock()

		connCtx, cancel := context.WithCancel(context.Background())
		p.wsMu.Lock()
		p.connCtx = connCtx
		p.connCancel = cancel
		p.wsMu.Unlock()

		conn, _, err := websocket.Dial(connCtx, p.wsURL, nil)
		if err != nil {
			log.Printf("[DataBridge WS] Dial error (%s): %v. Retrying in %v...", p.wsURL, err, backoff)
			cancel()
			select {
			case <-p.stopCh:
				return
			case <-time.After(backoff):
			}
			if backoff < 10*time.Second {
				backoff *= 2
			}
			continue
		}

		backoff = 1 * time.Second
		log.Printf("[DataBridge WS] Connected to %s", p.wsURL)

		p.wsMu.Lock()
		p.wsConn = conn
		var cmds []map[string]interface{}
		for key := range p.activeSubs {
			parts := strings.Split(key, "::")
			if len(parts) == 2 {
				cmds = append(cmds, map[string]interface{}{
					"action":    "subscribe",
					"symbol":    parts[0],
					"timeframe": parts[1],
				})
			}
		}
		for sym := range p.activeTickSubs {
			cmds = append(cmds, map[string]interface{}{
				"action": "subscribe_ticks",
				"symbol": sym,
			})
		}
		for sym := range p.activeDepthSubs {
			cmds = append(cmds, map[string]interface{}{
				"action": "subscribe_depth",
				"symbol": sym,
				"levels": 20,
			})
		}
		for key := range p.activeFootprintSubs {
			parts := strings.Split(key, "::")
			if len(parts) == 2 {
				cmds = append(cmds,
					map[string]interface{}{
						"action": "subscribe_ticks",
						"symbol": parts[0],
					},
					map[string]interface{}{
						"action":    "subscribe",
						"symbol":    parts[0],
						"timeframe": parts[1],
					},
				)
			}
		}
		p.wsMu.Unlock()

		for _, cmd := range cmds {
			_ = p.writeWSJSON(conn, connCtx, cmd)
		}

		// Dynamically fetch live symbols catalog from bridge server upon connection
		go p.loadCatalog(context.Background())

		// Read loop
		p.wsReadLoop(connCtx, conn)

		p.wsMu.Lock()
		if p.wsConn == conn {
			p.wsConn = nil
		}
		p.wsMu.Unlock()

		p.symbolsMu.Lock()
		p.cachedSymbols = nil
		p.symbolsMu.Unlock()
		cancel()

		select {
		case <-p.stopCh:
			return
		case <-time.After(1 * time.Second):
		}
	}
}

type bridgeWsMessage struct {
	Type      string      `json:"type"`      // "bar", "tick", "depth", "footprint", "welcome"
	Event     string      `json:"event"`     // "snapshot", "update", "new_bar"
	Status    string      `json:"status"`    // "subscribed"
	Symbol    string      `json:"symbol"`
	Timeframe string      `json:"timeframe"`
	Time      interface{} `json:"time"`
	Open      float64     `json:"open"`
	High      float64     `json:"high"`
	Low       float64     `json:"low"`
	Close     float64     `json:"close"`
	Volume    float64     `json:"volume"`
	Ticks     int64       `json:"ticks"`
	TimeNano  int64       `json:"time_nano"`
	Price     float64     `json:"price"`
	Side      string      `json:"side"`
	Bids      [][]float64 `json:"bids"`
	Asks      [][]float64 `json:"asks"`
}

func parseTimeSec(val interface{}) int64 {
	var sec int64
	switch v := val.(type) {
	case float64:
		sec = int64(v)
	case int64:
		sec = v
	case string:
		if pt, err := time.Parse(time.RFC3339Nano, v); err == nil {
			sec = pt.Unix()
		} else if pt, err := time.Parse(time.RFC3339, v); err == nil {
			sec = pt.Unix()
		} else if pt, err := time.Parse("2006-01-02T15:04:05.999999999", v); err == nil {
			sec = pt.Unix()
		} else if pt, err := time.Parse("2006-01-02T15:04:05", v); err == nil {
			sec = pt.Unix()
		} else {
			sec = time.Now().Unix()
		}
	default:
		sec = time.Now().Unix()
	}

	// Sanitize 5.5h (19800s) timezone offset artifact from bridge if present
	now := time.Now().Unix()
	diff := now - sec
	if diff >= 19700 && diff <= 19900 {
		sec += 19800
	}
	return sec
}

func (p *DataBridgeProvider) wsReadLoop(ctx context.Context, conn *websocket.Conn) {
	for {
		var msg bridgeWsMessage
		if err := wsjson.Read(ctx, conn, &msg); err != nil {
			log.Printf("[DataBridge WS] Read error: %v", err)
			return
		}

		cleanSym := cleanBridgeSymbol(msg.Symbol)
		cleanSymUpper := strings.ToUpper(cleanSym)

		// 1. Bar message
		if msg.Type == "bar" && msg.Symbol != "" && msg.Time != nil {
			timeSec := parseTimeSec(msg.Time)

			candle := datafeed.Candle{
				Time:   timeSec,
				Open:   msg.Open,
				High:   msg.High,
				Low:    msg.Low,
				Close:  msg.Close,
				Volume: msg.Volume,
			}

			p.symbolsMu.RLock()
			revSym := p.aliasToSymbol[cleanSymUpper]
			p.symbolsMu.RUnlock()

			exactKey := fmt.Sprintf("%s::%s", cleanSym, normalizeBridgeTimeframe(msg.Timeframe))
			revKey := ""
			if revSym != "" {
				revKey = fmt.Sprintf("%s::%s", revSym, normalizeBridgeTimeframe(msg.Timeframe))
			}

			p.wsMu.Lock()
			if p.lastTickTime == nil {
				p.lastTickTime = make(map[string]time.Time)
			}
			nowTick := time.Now()
			p.lastTickTime[cleanSym] = nowTick
			if revSym != "" {
				p.lastTickTime[revSym] = nowTick
			}

			var syncAggs []*datafeed.DeltaAggregator
			for key, agg := range p.aggregators {
				if key == exactKey || (revKey != "" && key == revKey) {
					syncAggs = append(syncAggs, agg)
				}
			}

			uniqueCbs := make(map[uint64]func(c datafeed.Candle))

			// Dispatch ONLY to subscribers of the exact matching timeframe (or alias with exact matching timeframe)
			if listeners, ok := p.activeSubs[exactKey]; ok {
				for id, cb := range listeners {
					uniqueCbs[id] = cb
				}
			}
			if revKey != "" {
				if listeners, ok := p.activeSubs[revKey]; ok {
					for id, cb := range listeners {
						uniqueCbs[id] = cb
					}
				}
			}
			p.wsMu.Unlock()

			for _, agg := range syncAggs {
				agg.SyncCandle(candle)
			}
			for _, cb := range uniqueCbs {
				cb(candle)
			}
		}

		// 2. Execution Tick message
		if msg.Type == "tick" && msg.Symbol != "" {
			timeSec := parseTimeSec(msg.Time)
			timeNano := msg.TimeNano
			now := time.Now().Unix()
			if rawSec, ok := msg.Time.(float64); ok {
				if now-int64(rawSec) >= 19700 && now-int64(rawSec) <= 19900 && timeNano > 0 {
					timeNano += 19800 * 1_000_000_000
				}
			} else if rawSecInt, ok := msg.Time.(int64); ok {
				if now-rawSecInt >= 19700 && now-rawSecInt <= 19900 && timeNano > 0 {
					timeNano += 19800 * 1_000_000_000
				}
			}

			tick := datafeed.TickData{
				Time:     timeSec,
				TimeNano: timeNano,
				Price:    msg.Price,
				Volume:   msg.Volume,
				Side:     datafeed.TickSide(msg.Side),
				Symbol:   msg.Symbol,
			}

			type aggTarget struct {
				tf        string
				agg       *datafeed.DeltaAggregator
				candleCbs []func(c datafeed.Candle)
				fpCbs     []func(f datafeed.FootprintBar)
			}

			p.wsMu.Lock()
			if p.lastTickTime == nil {
				p.lastTickTime = make(map[string]time.Time)
			}
			p.lastTickTime[cleanSym] = time.Now()

			var tickCbs []func(t datafeed.TickData)
			if subs, ok := p.activeTickSubs[cleanSym]; ok {
				for _, cb := range subs {
					tickCbs = append(tickCbs, cb)
				}
			}

			var aggTargets []aggTarget
			symPrefix := cleanSym + "::"
			for key, agg := range p.aggregators {
				if !strings.HasPrefix(key, symPrefix) {
					continue
				}
				tf := strings.TrimPrefix(key, symPrefix)
				var cbs []func(c datafeed.Candle)
				if subs, ok := p.activeSubs[key]; ok && len(subs) > 0 {
					cbs = make([]func(c datafeed.Candle), 0, len(subs))
					for _, cb := range subs {
						cbs = append(cbs, cb)
					}
				}
				var fpCbs []func(f datafeed.FootprintBar)
				if subs, ok := p.activeFootprintSubs[key]; ok && len(subs) > 0 {
					fpCbs = make([]func(f datafeed.FootprintBar), 0, len(subs))
					for _, cb := range subs {
						fpCbs = append(fpCbs, cb)
					}
				}
				aggTargets = append(aggTargets, aggTarget{
					tf:        tf,
					agg:       agg,
					candleCbs: cbs,
					fpCbs:     fpCbs,
				})
			}
			p.wsMu.Unlock()

			for _, cb := range tickCbs {
				cb(tick)
			}
			for _, target := range aggTargets {
				dBar, closedBar := target.agg.UpdateTick(tick)
				if closedBar != nil && len(target.candleCbs) > 0 {
					closedCandle := datafeed.Candle{
						Time:   closedBar.Time,
						Open:   closedBar.Open,
						High:   closedBar.High,
						Low:    closedBar.Low,
						Close:  closedBar.Close,
						Volume: closedBar.Volume,
					}
					for _, cb := range target.candleCbs {
						cb(closedCandle)
					}
				}
				if len(target.candleCbs) > 0 {
					liveCandle := datafeed.Candle{
						Time:   dBar.Time,
						Open:   dBar.Open,
						High:   dBar.High,
						Low:    dBar.Low,
						Close:  dBar.Close,
						Volume: dBar.Volume,
					}
					for _, cb := range target.candleCbs {
						cb(liveCandle)
					}
				}
				if len(target.fpCbs) > 0 {
					fpBar := target.agg.GetFootprintBar(target.tf)
					for _, cb := range target.fpCbs {
						cb(fpBar)
					}
				}
			}
		}

		// 3. Market Depth message
		if msg.Type == "depth" && msg.Symbol != "" {
			bids := make([]datafeed.OrderBookLevel, 0, len(msg.Bids))
			for _, b := range msg.Bids {
				if len(b) >= 2 {
					bids = append(bids, datafeed.OrderBookLevel{Price: b[0], Size: b[1]})
				}
			}
			asks := make([]datafeed.OrderBookLevel, 0, len(msg.Asks))
			for _, a := range msg.Asks {
				if len(a) >= 2 {
					asks = append(asks, datafeed.OrderBookLevel{Price: a[0], Size: a[1]})
				}
			}

			depth := datafeed.OrderBookDepth{
				Symbol: cleanSym,
				Time:   parseTimeSec(msg.Time),
				Bids:   bids,
				Asks:   asks,
			}

			p.wsMu.Lock()
			var depthCbs []func(d datafeed.OrderBookDepth)
			if subs, ok := p.activeDepthSubs[cleanSym]; ok {
				for _, cb := range subs {
					depthCbs = append(depthCbs, cb)
				}
			}
			p.wsMu.Unlock()

			for _, cb := range depthCbs {
				cb(depth)
			}
		}
	}
}

// writeWSJSON serializes writes onto conn with a bounded timeout outside p.wsMu.
func (p *DataBridgeProvider) writeWSJSON(conn *websocket.Conn, parentCtx context.Context, payload interface{}) error {
	if conn == nil || parentCtx == nil {
		return nil
	}
	wCtx, cancel := context.WithTimeout(parentCtx, bridgeWriteTimeout)
	defer cancel()
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	return wsjson.Write(wCtx, conn, payload)
}

// Subscribe subscribes to live candle updates for a symbol and resolution.
func (p *DataBridgeProvider) Subscribe(
	ctx context.Context,
	symbol, resolution string,
	onCandle func(c datafeed.Candle),
) error {
	cleanSym := cleanBridgeSymbol(symbol)
	tf := normalizeBridgeTimeframe(resolution)
	key := fmt.Sprintf("%s::%s", cleanSym, tf)

	var (
		conn    *websocket.Conn
		connCtx context.Context
		subCmd  map[string]interface{}
	)

	p.wsMu.Lock()
	p.nextSubID++
	subID := p.nextSubID

	listeners, exists := p.activeSubs[key]
	if !exists {
		listeners = make(map[uint64]func(c datafeed.Candle))
		p.activeSubs[key] = listeners

		if p.wsConn != nil && p.connCtx != nil {
			conn = p.wsConn
			connCtx = p.connCtx
			subCmd = map[string]interface{}{
				"action":    "subscribe",
				"symbol":    cleanSym,
				"timeframe": tf,
			}
		}
	}
	listeners[subID] = onCandle
	p.wsMu.Unlock()

	if subCmd != nil {
		_ = p.writeWSJSON(conn, connCtx, subCmd)
	}
	return nil
}

// Unsubscribe removes a subscription from live updates.
func (p *DataBridgeProvider) Unsubscribe(symbol, resolution string) error {
	cleanSym := cleanBridgeSymbol(symbol)
	tf := normalizeBridgeTimeframe(resolution)
	key := fmt.Sprintf("%s::%s", cleanSym, tf)

	p.wsMu.Lock()
	delete(p.activeSubs, key)
	conn := p.wsConn
	connCtx := p.connCtx
	p.wsMu.Unlock()

	if conn != nil && connCtx != nil {
		unsubCmd := map[string]interface{}{
			"action":    "unsubscribe",
			"symbol":    cleanSym,
			"timeframe": tf,
		}
		_ = p.writeWSJSON(conn, connCtx, unsubCmd)
	}

	return nil
}

// SubscribeTicks subscribes to live trade execution ticks.
func (p *DataBridgeProvider) SubscribeTicks(ctx context.Context, symbol string, onTick func(t datafeed.TickData)) error {
	cleanSym := cleanBridgeSymbol(symbol)
	var (
		conn    *websocket.Conn
		connCtx context.Context
		subCmd  map[string]interface{}
	)

	p.wsMu.Lock()
	p.nextSubID++
	subID := p.nextSubID

	listeners, exists := p.activeTickSubs[cleanSym]
	if !exists {
		listeners = make(map[uint64]func(t datafeed.TickData))
		p.activeTickSubs[cleanSym] = listeners

		if p.wsConn != nil && p.connCtx != nil {
			conn = p.wsConn
			connCtx = p.connCtx
			subCmd = map[string]interface{}{
				"action": "subscribe_ticks",
				"symbol": cleanSym,
			}
		}
	}
	listeners[subID] = onTick
	p.wsMu.Unlock()

	if subCmd != nil {
		_ = p.writeWSJSON(conn, connCtx, subCmd)
	}
	return nil
}

// UnsubscribeTicks unsubscribes from live trade execution ticks.
func (p *DataBridgeProvider) UnsubscribeTicks(symbol string) error {
	cleanSym := cleanBridgeSymbol(symbol)
	p.wsMu.Lock()
	delete(p.activeTickSubs, cleanSym)
	needUnsub := !p.hasRemainingTickOrFootprintLocked(cleanSym) && p.wsConn != nil && p.connCtx != nil
	conn := p.wsConn
	connCtx := p.connCtx
	p.wsMu.Unlock()

	if needUnsub {
		unsubCmd := map[string]interface{}{
			"action": "unsubscribe_ticks",
			"symbol": cleanSym,
		}
		_ = p.writeWSJSON(conn, connCtx, unsubCmd)
	}
	return nil
}

// SubscribeDepth subscribes to Level 2 order book market depth.
func (p *DataBridgeProvider) SubscribeDepth(ctx context.Context, symbol string, onDepth func(d datafeed.OrderBookDepth)) error {
	cleanSym := cleanBridgeSymbol(symbol)
	var (
		conn    *websocket.Conn
		connCtx context.Context
		subCmd  map[string]interface{}
	)

	p.wsMu.Lock()
	p.nextSubID++
	subID := p.nextSubID

	listeners, exists := p.activeDepthSubs[cleanSym]
	if !exists {
		listeners = make(map[uint64]func(d datafeed.OrderBookDepth))
		p.activeDepthSubs[cleanSym] = listeners

		if p.wsConn != nil && p.connCtx != nil {
			conn = p.wsConn
			connCtx = p.connCtx
			subCmd = map[string]interface{}{
				"action": "subscribe_depth",
				"symbol": cleanSym,
				"levels": 20,
			}
		}
	}
	listeners[subID] = onDepth
	p.wsMu.Unlock()

	if subCmd != nil {
		_ = p.writeWSJSON(conn, connCtx, subCmd)
	}
	return nil
}

// UnsubscribeDepth unsubscribes from Level 2 order book market depth.
func (p *DataBridgeProvider) UnsubscribeDepth(symbol string) error {
	cleanSym := cleanBridgeSymbol(symbol)
	p.wsMu.Lock()
	delete(p.activeDepthSubs, cleanSym)
	conn := p.wsConn
	connCtx := p.connCtx
	p.wsMu.Unlock()

	if conn != nil && connCtx != nil {
		unsubCmd := map[string]interface{}{
			"action": "unsubscribe_depth",
			"symbol": cleanSym,
		}
		_ = p.writeWSJSON(conn, connCtx, unsubCmd)
	}
	return nil
}

// SubscribeFootprint subscribes to real-time Footprint candle clusters and delta updates.
func (p *DataBridgeProvider) SubscribeFootprint(ctx context.Context, symbol, resolution string, onFootprint func(f datafeed.FootprintBar)) error {
	cleanSym := cleanBridgeSymbol(symbol)
	tf := normalizeBridgeTimeframe(resolution)
	key := fmt.Sprintf("%s::%s", cleanSym, tf)

	var (
		conn    *websocket.Conn
		connCtx context.Context
		cmds    []map[string]interface{}
	)

	p.wsMu.Lock()
	p.nextSubID++
	subID := p.nextSubID

	listeners, exists := p.activeFootprintSubs[key]
	if !exists {
		listeners = make(map[uint64]func(f datafeed.FootprintBar))
		p.activeFootprintSubs[key] = listeners

		if _, hasAgg := p.aggregators[key]; !hasAgg {
			ts := p.getSymbolTickSize(cleanSym)
			if ts <= 0 {
				ts = 0.25
			}
			agg := datafeed.NewDeltaAggregator(tf, ts)
			p.aggregators[key] = agg

			// Pre-seed active bar levels from DataBridge history so live aggregator has full levels
			go func(a *datafeed.DeltaAggregator, sym, res string) {
				hist, err := p.GetFootprintHistory(context.Background(), sym, res, 0, 0, 2)
				if err == nil && len(hist) > 0 {
					lastBar := hist[len(hist)-1]
					a.SeedLevels(lastBar)
				}
			}(agg, cleanSym, tf)
		}

		if p.wsConn != nil && p.connCtx != nil {
			conn = p.wsConn
			connCtx = p.connCtx
			cmds = []map[string]interface{}{
				{
					"action": "subscribe_ticks",
					"symbol": cleanSym,
				},
				{
					"action":    "subscribe",
					"symbol":    cleanSym,
					"timeframe": tf,
				},
			}
		}
	}
	listeners[subID] = onFootprint
	p.wsMu.Unlock()

	for _, cmd := range cmds {
		_ = p.writeWSJSON(conn, connCtx, cmd)
	}
	return nil
}

func (p *DataBridgeProvider) hasRemainingTickOrFootprintLocked(cleanSym string) bool {
	if subs, ok := p.activeTickSubs[cleanSym]; ok && len(subs) > 0 {
		return true
	}
	prefix := cleanSym + "::"
	for k, subs := range p.activeFootprintSubs {
		if strings.HasPrefix(k, prefix) && len(subs) > 0 {
			return true
		}
	}
	return false
}

// UnsubscribeFootprint unsubscribes from Footprint candle clusters.
func (p *DataBridgeProvider) UnsubscribeFootprint(symbol, resolution string) error {
	cleanSym := cleanBridgeSymbol(symbol)
	tf := normalizeBridgeTimeframe(resolution)
	key := fmt.Sprintf("%s::%s", cleanSym, tf)

	p.wsMu.Lock()
	delete(p.activeFootprintSubs, key)
	delete(p.aggregators, key)
	needUnsub := !p.hasRemainingTickOrFootprintLocked(cleanSym) && p.wsConn != nil && p.connCtx != nil
	conn := p.wsConn
	connCtx := p.connCtx
	p.wsMu.Unlock()

	if needUnsub {
		_ = p.writeWSJSON(conn, connCtx, map[string]interface{}{
			"action": "unsubscribe_ticks",
			"symbol": cleanSym,
		})
	}
	return nil
}

type bridgeFootprintResponse struct {
	Symbol    string `json:"symbol"`
	Timeframe string `json:"timeframe"`
	Count     int    `json:"count"`
	Bars      []struct {
		Time   int64   `json:"time"`
		Open   float64 `json:"open"`
		High   float64 `json:"high"`
		Low    float64 `json:"low"`
		Close  float64 `json:"close"`
		Volume float64 `json:"volume"`
		Delta  float64 `json:"delta"`
		POC    float64 `json:"poc"`
		Levels []struct {
			Price     float64 `json:"price"`
			BidVolume float64 `json:"bid_volume"`
			AskVolume float64 `json:"ask_volume"`
			Delta     float64 `json:"delta"`
			IsPOC     bool    `json:"is_poc"`
			Imbalance *string `json:"imbalance,omitempty"`
		} `json:"levels"`
	} `json:"bars"`
	Error string `json:"error,omitempty"`
}

// GetFootprintHistory retrieves historical Footprint cluster bars.
func (p *DataBridgeProvider) GetFootprintHistory(
	ctx context.Context,
	symbol, resolution string,
	from, to int64,
	count int,
) ([]datafeed.FootprintBar, error) {
	cleanSym := cleanBridgeSymbol(symbol)
	tf := normalizeBridgeTimeframe(resolution)

	if count <= 0 {
		count = 200
	}

	effectiveFrom, effectiveTo, hasWindow := computeBridgeTimeWindow(tf, from, to, count)
	reqURL := fmt.Sprintf("%s/footprint?symbol=%s&timeframe=%s&bars=%d",
		p.baseURL,
		url.QueryEscape(cleanSym),
		url.QueryEscape(tf),
		count,
	)
	if hasWindow {
		reqURL = fmt.Sprintf("%s&from=%s&to=%s",
			reqURL,
			url.QueryEscape(time.Unix(effectiveFrom, 0).UTC().Format(time.RFC3339)),
			url.QueryEscape(time.Unix(effectiveTo, 0).UTC().Format(time.RFC3339)),
		)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := p.httpClient.Do(req)
	if err != nil {
		log.Printf("[DataBridge] Warning: /footprint request error (%v), falling back to candle history", err)
		candles, cErr := p.GetHistory(ctx, symbol, resolution, from, to, count)
		if cErr == nil && len(candles) > 0 {
			res := make([]datafeed.FootprintBar, 0, len(candles))
			for _, c := range candles {
				res = append(res, p.synthesizeFootprintFromCandle(symbol, c, tf))
			}
			return res, nil
		}
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("[DataBridge] Warning: /footprint returned HTTP %d, falling back to candle history", resp.StatusCode)
		candles, err := p.GetHistory(ctx, symbol, resolution, from, to, count)
		if err != nil {
			return nil, fmt.Errorf("DataBridge footprint HTTP %d and candle fallback failed: %w", resp.StatusCode, err)
		}
		res := make([]datafeed.FootprintBar, 0, len(candles))
		for _, c := range candles {
			res = append(res, p.synthesizeFootprintFromCandle(symbol, c, tf))
		}
		return res, nil
	}

	var data bridgeFootprintResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxBridgeHTTPResponseBytes)).Decode(&data); err != nil {
		return nil, err
	}

	if len(data.Bars) == 0 {
		// Bridge has no tick-level footprint for this historical range (e.g. beyond tick cache).
		// Fallback to candle history and synthesize footprint clusters so candles are never missing on the chart.
		candles, err := p.GetHistory(ctx, symbol, resolution, from, to, count)
		if err == nil && len(candles) > 0 {
			res := make([]datafeed.FootprintBar, 0, len(candles))
			for _, c := range candles {
				res = append(res, p.synthesizeFootprintFromCandle(symbol, c, tf))
			}
			return res, nil
		}
	}

	result := make([]datafeed.FootprintBar, 0, len(data.Bars))
	for _, b := range data.Bars {
		levels := make([]datafeed.FootprintPriceLevel, 0, len(b.Levels))
		var totalBid, totalAsk float64
		for _, lvl := range b.Levels {
			totalBid += lvl.BidVolume
			totalAsk += lvl.AskVolume
			levels = append(levels, datafeed.FootprintPriceLevel{
				Price:       lvl.Price,
				BidVolume:   lvl.BidVolume,
				AskVolume:   lvl.AskVolume,
				TotalVolume: lvl.BidVolume + lvl.AskVolume,
				Delta:       lvl.Delta,
				Imbalance:   lvl.Imbalance != nil,
			})
		}

		barOpen := b.Open
		barClose := b.Close
		barHigh := b.High
		barLow := b.Low
		if barLow == 0 && len(levels) > 0 {
			barLow = levels[0].Price
		}
		if barHigh == 0 && len(levels) > 0 {
			barHigh = levels[len(levels)-1].Price
		}
		if barOpen == 0 && len(levels) > 0 {
			barOpen = barLow
		}
		if barClose == 0 && len(levels) > 0 {
			barClose = barHigh
		}

		result = append(result, datafeed.FootprintBar{
			Time:       b.Time,
			Resolution: tf,
			Candle: datafeed.Candle{
				Time:   b.Time,
				Open:   barOpen,
				High:   barHigh,
				Low:    barLow,
				Close:  barClose,
				Volume: b.Volume,
			},
			Levels:     levels,
			TotalBid:   totalBid,
			TotalAsk:   totalAsk,
			TotalDelta: b.Delta,
			POC:        b.POC,
		})
	}

	return result, nil
}

// Close shuts down the provider and its WebSocket supervisor.
func (p *DataBridgeProvider) Close() error {
	p.wsMu.Lock()
	if !p.isClosed {
		p.isClosed = true
		if p.stopCh != nil {
			close(p.stopCh)
		}
	}
	cancel := p.connCancel
	conn := p.wsConn
	p.connCancel = nil
	p.wsConn = nil
	p.wsMu.Unlock()

	if cancel != nil {
		cancel()
	}
	if conn != nil {
		_ = conn.Close(websocket.StatusNormalClosure, "provider closed")
	}
	return nil
}

// liveSupervisor maintains calm background synchronization when the WebSocket feed
// is idle or closed, backing off exponentially during quiet/closed market periods
// and resetting immediately when live ticks arrive.
func (p *DataBridgeProvider) liveSupervisor() {
	const (
		checkInterval        = 500 * time.Millisecond
		baseQuietPoll        = 1 * time.Second
		maxQuietPoll         = 15 * time.Second
		activeSyncInterval   = 2500 * time.Millisecond
		liveTickFreshWindow  = 2 * time.Second
	)

	ticker := time.NewTicker(checkInterval)
	defer ticker.Stop()

	type barState struct {
		time   int64
		open   float64
		high   float64
		low    float64
		close  float64
		volume float64
	}

	var stateMu sync.Mutex
	lastBars := make(map[string]barState)
	lastPollTime := make(map[string]time.Time)
	pollBackoff := make(map[string]time.Duration)
	inFlight := make(map[string]bool)

	for {
		select {
		case <-p.stopCh:
			return
		case <-ticker.C:
		}

		p.wsMu.Lock()
		if p.isClosed {
			p.wsMu.Unlock()
			return
		}

		type subTarget struct {
			key      string
			sym      string
			tf       string
			cbs      []func(c datafeed.Candle)
			lastTick time.Time
		}
		var activeSnapshots []subTarget
		activeKeys := make(map[string]bool, len(p.activeSubs))
		now := time.Now()

		for key, listeners := range p.activeSubs {
			if len(listeners) == 0 {
				continue
			}
			parts := strings.Split(key, "::")
			if len(parts) != 2 {
				continue
			}
			activeKeys[key] = true
			sym, tf := parts[0], parts[1]
			cbList := make([]func(c datafeed.Candle), 0, len(listeners))
			for _, cb := range listeners {
				cbList = append(cbList, cb)
			}
			activeSnapshots = append(activeSnapshots, subTarget{
				key:      key,
				sym:      sym,
				tf:       tf,
				cbs:      cbList,
				lastTick: p.lastTickTime[sym],
			})
		}
		p.wsMu.Unlock()

		var targets []subTarget
		stateMu.Lock()
		for k := range lastBars {
			if !activeKeys[k] {
				delete(lastBars, k)
				delete(lastPollTime, k)
				delete(pollBackoff, k)
			}
		}
		for _, snap := range activeSnapshots {
			if inFlight[snap.key] {
				continue
			}
			lastPoll := lastPollTime[snap.key]
			ticksActive := !snap.lastTick.IsZero() && now.Sub(snap.lastTick) <= liveTickFreshWindow
			var needsPoll bool
			if ticksActive {
				pollBackoff[snap.key] = baseQuietPoll
				needsPoll = now.Sub(lastPoll) >= activeSyncInterval
			} else {
				interval := pollBackoff[snap.key]
				if interval <= 0 {
					interval = baseQuietPoll
					pollBackoff[snap.key] = interval
				}
				needsPoll = lastPoll.IsZero() || now.Sub(lastPoll) >= interval
			}
			if needsPoll {
				lastPollTime[snap.key] = now
				inFlight[snap.key] = true
				targets = append(targets, snap)
			}
		}
		stateMu.Unlock()

		for _, target := range targets {
			go func(t subTarget) {
				defer func() {
					stateMu.Lock()
					delete(inFlight, t.key)
					stateMu.Unlock()
				}()

				ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
				defer cancel()

				stepSec := int64(datafeed.ResolutionToSeconds(t.tf))
				if stepSec <= 0 {
					stepSec = 60
				}
				lookbackSec := stepSec * 2
				if lookbackSec < 60 {
					lookbackSec = 60
				}
				if lookbackSec > 3600 {
					lookbackSec = 3600
				}
				from := time.Now().Unix() - lookbackSec

				bars, err := p.GetHistory(ctx, t.sym, t.tf, from, 0, 2)
				if err != nil || len(bars) == 0 {
					stateMu.Lock()
					next := pollBackoff[t.key] * 2
					if next <= 0 {
						next = baseQuietPoll * 2
					}
					if next > maxQuietPoll {
						next = maxQuietPoll
					}
					pollBackoff[t.key] = next
					stateMu.Unlock()
					return
				}

				latest := bars[len(bars)-1]

				p.wsMu.Lock()
				targetKey := fmt.Sprintf("%s::%s", t.sym, t.tf)
				var syncAggs []*datafeed.DeltaAggregator
				for key, agg := range p.aggregators {
					if key == targetKey {
						syncAggs = append(syncAggs, agg)
					}
				}
				p.wsMu.Unlock()
				for _, agg := range syncAggs {
					agg.SyncCandle(latest)
				}

				stateMu.Lock()
				last, hasLast := lastBars[t.key]
				unchanged := hasLast &&
					latest.Time == last.time &&
					latest.Open == last.open &&
					latest.High == last.high &&
					latest.Low == last.low &&
					latest.Close == last.close &&
					latest.Volume == last.volume
				if unchanged {
					next := pollBackoff[t.key] * 2
					if next <= 0 {
						next = baseQuietPoll * 2
					}
					if next > maxQuietPoll {
						next = maxQuietPoll
					}
					pollBackoff[t.key] = next
					stateMu.Unlock()
					return
				}
				pollBackoff[t.key] = baseQuietPoll
				stateMu.Unlock()

				// If a new candle opened and we have the previous bar,
				// dispatch the finalized previous bar first so its final close and volume are recorded.
				if hasLast && latest.Time > last.time && len(bars) >= 2 {
					prev := bars[len(bars)-2]
					for _, cb := range t.cbs {
						cb(prev)
					}
				}

				// Dispatch the updated in-progress bar
				for _, cb := range t.cbs {
					cb(latest)
				}

				stateMu.Lock()
				lastBars[t.key] = barState{
					time:   latest.Time,
					open:   latest.Open,
					high:   latest.High,
					low:    latest.Low,
					close:  latest.Close,
					volume: latest.Volume,
				}
				stateMu.Unlock()
			}(target)
		}
	}
}

func (p *DataBridgeProvider) getSymbolTickSize(symbol string) float64 {
	p.symbolsMu.RLock()
	defer p.symbolsMu.RUnlock()
	clean := cleanBridgeSymbol(symbol)
	for _, s := range p.cachedSymbols {
		if cleanBridgeSymbol(s.Symbol) == clean || cleanBridgeSymbol(s.FullSymbol) == clean {
			if s.PriceScale > 0 {
				return 1.0 / float64(s.PriceScale)
			}
		}
	}
	return 0.25
}

func (p *DataBridgeProvider) synthesizeFootprintFromCandle(symbol string, c datafeed.Candle, resolution string) datafeed.FootprintBar {
	ts := p.getSymbolTickSize(symbol)
	if ts <= 0 || math.IsNaN(ts) || math.IsInf(ts, 0) {
		ts = 0.25
	}
	rangeSpan := c.High - c.Low
	if math.IsNaN(rangeSpan) || math.IsInf(rangeSpan, 0) || rangeSpan < ts {
		rangeSpan = ts
	}
	stepsFloat := math.Round(rangeSpan/ts) + 1
	stepCount := 1
	if math.IsNaN(stepsFloat) || math.IsInf(stepsFloat, 0) || stepsFloat > float64(maxSynthesizedLevels) {
		stepCount = maxSynthesizedLevels
		ts = rangeSpan / float64(maxSynthesizedLevels-1)
	} else if stepsFloat >= 1 {
		stepCount = int(stepsFloat)
	}
	levels := make([]datafeed.FootprintPriceLevel, 0, stepCount)
	isBullish := c.Close >= c.Open
	volPerStep := c.Volume / float64(stepCount)
	if volPerStep <= 0 {
		volPerStep = 1
	}
	pocP := math.Round(((c.Open + 2*c.Close + c.High + c.Low) / 4) / ts) * ts

	var totalBid, totalAsk float64
	for s := 0; s < stepCount; s++ {
		pTier := math.Round((c.Low + float64(s)*ts)/ts) * ts
		buyRatio := 0.5
		if isBullish {
			if pTier >= c.Open {
				buyRatio = 0.65
			} else {
				buyRatio = 0.45
			}
		} else {
			if pTier <= c.Open {
				buyRatio = 0.35
			} else {
				buyRatio = 0.55
			}
		}
		askV := math.Round(volPerStep * buyRatio)
		bidV := volPerStep - askV
		if bidV < 0 {
			bidV = 0
		}
		totalBid += bidV
		totalAsk += askV
		levels = append(levels, datafeed.FootprintPriceLevel{
			Price:       pTier,
			BidVolume:   bidV,
			AskVolume:   askV,
			TotalVolume: bidV + askV,
			Delta:       askV - bidV,
		})
	}

	return datafeed.FootprintBar{
		Time:       c.Time,
		Resolution: resolution,
		Candle:     c,
		Levels:     levels,
		TotalBid:   totalBid,
		TotalAsk:   totalAsk,
		TotalDelta: totalAsk - totalBid,
		POC:        pocP,
	}
}
