package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
	"github.com/ordercraft-hq/terminal/internal/datafeed"
)

// AlpacaProvider implements datafeed.DataProvider for Alpaca Markets REST & WebSocket APIs.
type AlpacaProvider struct {
	apiKey        string
	apiSecret     string
	baseURL       string // Paper or Live base URL, e.g. https://paper-api.alpaca.markets/v2
	dataURL       string // Data API base URL, e.g. https://data.alpaca.markets/v2
	streamURL     string // Market data stream URL, e.g. wss://stream.data.alpaca.markets/v2/iex
	feed          string // "iex" (free real-time) or "sip"
	client        *http.Client
	mu            sync.Mutex
	cancelLoad    context.CancelFunc
	subs          map[string]context.CancelFunc
	symbolsMu     sync.RWMutex
	cachedSymbols []datafeed.SymbolInfo
	lastFetched   time.Time
}

// NewAlpacaProvider initializes the Alpaca provider with credentials loaded from environment or .env.
func NewAlpacaProvider() *AlpacaProvider {
	loadDotEnv()

	apiKey := os.Getenv("ALPACA_API_KEY")
	apiSecret := os.Getenv("ALPACA_API_SECRET")

	baseURL := os.Getenv("ALPACA_BASE_URL")
	if baseURL == "" {
		baseURL = "https://paper-api.alpaca.markets/v2"
	}
	baseURL = strings.TrimSuffix(baseURL, "/")

	dataURL := os.Getenv("ALPACA_DATA_URL")
	if dataURL == "" {
		dataURL = "https://data.alpaca.markets/v2"
	}
	dataURL = strings.TrimSuffix(dataURL, "/")

	streamURL := os.Getenv("ALPACA_STREAM_URL")
	if streamURL == "" {
		streamURL = "wss://stream.data.alpaca.markets/v2/iex"
	}

	feed := os.Getenv("ALPACA_FEED")
	if feed == "" {
		feed = "iex"
	}

	ap := &AlpacaProvider{
		apiKey:    apiKey,
		apiSecret: apiSecret,
		baseURL:   baseURL,
		dataURL:   dataURL,
		streamURL: streamURL,
		feed:      feed,
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
		subs: make(map[string]context.CancelFunc),
	}

	// Asynchronously load US equity assets only if credentials configured
	if ap.IsConfigured() {
		ctx, cancel := context.WithCancel(context.Background())
		ap.cancelLoad = cancel
		go ap.loadInstruments(ctx, ap.apiKey, ap.apiSecret)
	}

	return ap
}

func (a *AlpacaProvider) Name() string {
	return "ALPACA"
}

// IsConfigured returns true if valid API credentials have been set.
func (a *AlpacaProvider) IsConfigured() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.apiKey != "" && a.apiSecret != "" &&
		!strings.Contains(a.apiKey, "your_") &&
		!strings.Contains(a.apiKey, "placeholder")
}

// SetCredentials dynamically updates Alpaca API keys and triggers instrument indexing.
func (a *AlpacaProvider) SetCredentials(apiKey, apiSecret string) {
	cleanKey := strings.TrimSpace(apiKey)
	cleanSecret := strings.TrimSpace(apiSecret)
	configured := cleanKey != "" && cleanSecret != "" &&
		!strings.Contains(cleanKey, "your_") &&
		!strings.Contains(cleanKey, "placeholder")

	a.mu.Lock()
	if a.cancelLoad != nil {
		a.cancelLoad()
		a.cancelLoad = nil
	}
	a.apiKey = cleanKey
	a.apiSecret = cleanSecret

	if configured {
		ctx, cancel := context.WithCancel(context.Background())
		a.cancelLoad = cancel
		a.mu.Unlock()

		go a.loadInstruments(ctx, cleanKey, cleanSecret)
	} else {
		a.mu.Unlock()

		a.symbolsMu.Lock()
		a.cachedSymbols = nil
		a.symbolsMu.Unlock()
	}
}

// RawCredentials returns the current API key and secret.
func (a *AlpacaProvider) RawCredentials() (key, secret string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.apiKey, a.apiSecret
}

// SupportedResolutions returns standard candlestick granularities supported by Alpaca Data API.
func (a *AlpacaProvider) SupportedResolutions() []string {
	return []string{
		"1m", "5m", "15m", "30m",
		"1h", "1d", "1w", "1M",
	}
}

// normalizeAlpacaSymbol strips exchange prefix and normalizes ticker symbol.
func normalizeAlpacaSymbol(rawSymbol string) string {
	clean := rawSymbol
	if parts := strings.Split(rawSymbol, ":"); len(parts) == 2 {
		clean = parts[1]
	}
	clean = strings.ToUpper(strings.TrimSpace(clean))
	return clean
}

// normalizeAlpacaTimeframe maps resolution strings to Alpaca API timeframe string and base seconds.
func normalizeAlpacaTimeframe(res string) (tf string, needAgg bool, baseTfSec int64) {
	trimmed := strings.TrimSpace(res)
	upper := strings.ToUpper(trimmed)

	// Month check first (distinguish 1M month vs 1m minute)
	if trimmed == "1M" || upper == "M" || upper == "1MO" || upper == "1MONTH" {
		return "1Month", false, 2592000
	}

	switch upper {
	case "1", "1M", "1MIN": // if "1m" passed, upper is "1M" but didn't match trimmed == "1M"
		return "1Min", false, 60
	case "5", "5M", "5MIN":
		return "5Min", false, 300
	case "15", "15M", "15MIN":
		return "15Min", false, 900
	case "30", "30M", "30MIN":
		return "30Min", false, 1800
	case "60", "1H", "1HOUR":
		return "1Hour", false, 3600
	case "D", "1D", "1DAY":
		return "1Day", false, 86400
	case "W", "1W", "1WEEK":
		return "1Week", false, 604800
	}

	// For resolutions requiring aggregation
	targetSec := datafeed.ResolutionToSeconds(res)
	if targetSec <= 0 {
		return "1Min", false, 60
	}
	if targetSec < 3600 {
		// Aggregate from 1Min
		return "1Min", true, 60
	}
	if targetSec < 86400 {
		// Aggregate from 1Hour
		return "1Hour", true, 3600
	}
	return "1Day", true, 86400
}

// alpacaRawBar represents a single candlestick from Alpaca Data API v2.
type alpacaRawBar struct {
	T  string  `json:"t"`  // RFC3339 timestamp
	O  float64 `json:"o"`  // Open
	H  float64 `json:"h"`  // High
	L  float64 `json:"l"`  // Low
	C  float64 `json:"c"`  // Close
	V  float64 `json:"v"`  // Volume
	N  int64   `json:"n"`  // Trade count
	VW float64 `json:"vw"` // Volume weighted average price
}

type alpacaBarsResponse struct {
	Bars          []alpacaRawBar `json:"bars"`
	Symbol        string         `json:"symbol"`
	NextPageToken *string        `json:"next_page_token"`
	Message       string         `json:"message,omitempty"`
}

type alpacaCryptoBarsResponse struct {
	Bars          map[string][]alpacaRawBar `json:"bars"`
	NextPageToken *string                   `json:"next_page_token"`
	Message       string                    `json:"message,omitempty"`
}

// isCryptoSymbol checks if symbol is a crypto pair (e.g. BTC/USD, ETH/USD, BTCUSD).
func isCryptoSymbol(sym string) bool {
	if strings.Contains(sym, "/") {
		return true
	}
	// Common crypto quotes
	for _, q := range []string{"USD", "USDT", "USDC", "BTC", "ETH"} {
		if strings.HasSuffix(sym, q) && len(sym) >= 6 {
			base := strings.TrimSuffix(sym, q)
			if base == "BTC" || base == "ETH" || base == "SOL" || base == "DOGE" || base == "AVAX" || base == "LINK" {
				return true
			}
		}
	}
	return false
}

// GetHistory fetches historical OHLCV bars from Alpaca Data API v2.
func (a *AlpacaProvider) GetHistory(ctx context.Context, symbol, resolution string, from, to int64, count int) ([]datafeed.Candle, error) {
	cleanSym := normalizeAlpacaSymbol(symbol)
	tf, needAgg, baseTfSec := normalizeAlpacaTimeframe(resolution)

	targetSec := datafeed.ResolutionToSeconds(resolution)
	if targetSec <= 0 {
		targetSec = baseTfSec
	}

	if count <= 0 {
		count = 300
	}
	if count > 5000 {
		count = 5000
	}

	now := time.Now().UTC().Unix()
	if to <= 0 || to > now {
		to = now
	}

	if from <= 0 {
		// Provide sufficient lookback so weekend, holiday, and closed hours do not return empty
		lookbackSec := int64(count) * targetSec * 4
		if targetSec < 86400 {
			// At least 30 days lookback for intraday bars
			minIntraday := int64(30 * 86400)
			if lookbackSec < minIntraday {
				lookbackSec = minIntraday
			}
		} else {
			// At least 365 days lookback for daily / weekly bars
			minDaily := int64(365 * 86400)
			if lookbackSec < minDaily {
				lookbackSec = minDaily
			}
		}
		from = to - lookbackSec
	}

	crypto := isCryptoSymbol(cleanSym)

	var reqURL string
	if crypto {
		// Alpaca Crypto Bars: https://data.alpaca.markets/v1beta3/crypto/us/bars
		formattedCrypto := cleanSym
		if !strings.Contains(cleanSym, "/") && len(cleanSym) > 3 {
			// e.g. BTCUSD -> BTC/USD
			for _, q := range []string{"USD", "USDT", "USDC"} {
				if strings.HasSuffix(cleanSym, q) {
					formattedCrypto = strings.TrimSuffix(cleanSym, q) + "/" + q
					break
				}
			}
		}
		reqURL = fmt.Sprintf("https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=%s&timeframe=%s&limit=%d&sort=desc&start=%s&end=%s",
			url.QueryEscape(formattedCrypto),
			url.QueryEscape(tf),
			count,
			url.QueryEscape(time.Unix(from, 0).UTC().Format(time.RFC3339)),
			url.QueryEscape(time.Unix(to, 0).UTC().Format(time.RFC3339)),
		)
	} else {
		// Alpaca Stocks Bars: https://data.alpaca.markets/v2/stocks/{symbol}/bars
		endpoint := fmt.Sprintf("%s/stocks/%s/bars", a.dataURL, url.PathEscape(cleanSym))
		reqURL = fmt.Sprintf("%s?timeframe=%s&limit=%d&feed=%s&sort=desc&start=%s&end=%s",
			endpoint,
			url.QueryEscape(tf),
			count,
			url.QueryEscape(a.feed),
			url.QueryEscape(time.Unix(from, 0).UTC().Format(time.RFC3339)),
			url.QueryEscape(time.Unix(to, 0).UTC().Format(time.RFC3339)),
		)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("alpaca new request: %w", err)
	}

	apiKey, apiSecret := a.RawCredentials()
	req.Header.Set("APCA-API-KEY-ID", apiKey)
	req.Header.Set("APCA-API-SECRET-KEY", apiSecret)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "OrderCraft/1.0 (Financial Workstation)")

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("alpaca http get: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errResp struct {
			Message string `json:"message"`
		}
		json.NewDecoder(resp.Body).Decode(&errResp)
		msg := errResp.Message
		if msg == "" {
			msg = fmt.Sprintf("HTTP status %d", resp.StatusCode)
		}
		return nil, fmt.Errorf("alpaca API error (%d): %s", resp.StatusCode, msg)
	}

	var rawBars []alpacaRawBar
	if crypto {
		var cResp alpacaCryptoBarsResponse
		if err := json.NewDecoder(resp.Body).Decode(&cResp); err != nil {
			return nil, fmt.Errorf("alpaca crypto json decode: %w", err)
		}
		for _, bList := range cResp.Bars {
			rawBars = append(rawBars, bList...)
		}
	} else {
		var sResp alpacaBarsResponse
		if err := json.NewDecoder(resp.Body).Decode(&sResp); err != nil {
			return nil, fmt.Errorf("alpaca stock json decode: %w", err)
		}
		rawBars = sResp.Bars
	}

	if len(rawBars) == 0 {
		return []datafeed.Candle{}, nil
	}

	// Parse raw bars into chronological candles
	candles := make([]datafeed.Candle, 0, len(rawBars))
	for _, bar := range rawBars {
		t, err := time.Parse(time.RFC3339Nano, bar.T)
		if err != nil {
			t, err = time.Parse(time.RFC3339, bar.T)
		}
		if err != nil {
			continue
		}

		candles = append(candles, datafeed.Candle{
			Time:   t.UTC().Unix(),
			Open:   bar.O,
			High:   bar.H,
			Low:    bar.L,
			Close:  bar.C,
			Volume: bar.V,
		})
	}

	// Sort candles by ascending timestamp
	sort.Slice(candles, func(i, j int) bool {
		return candles[i].Time < candles[j].Time
	})

	if needAgg {
		candles = datafeed.AggregateCandles(candles, targetSec)
	}

	if len(candles) > count {
		candles = candles[len(candles)-count:]
	}

	return candles, nil
}

// Search queries cached Alpaca equity and crypto symbols.
func (a *AlpacaProvider) Search(ctx context.Context, query string) ([]datafeed.SymbolInfo, error) {
	if !a.IsConfigured() {
		return nil, nil
	}
	a.symbolsMu.RLock()
	defer a.symbolsMu.RUnlock()

	q := strings.ToUpper(strings.TrimSpace(query))
	if q == "" {
		if len(a.cachedSymbols) > 50 {
			return a.cachedSymbols[:50], nil
		}
		return a.cachedSymbols, nil
	}

	// Exact match first, then prefix, then substring
	var exact []datafeed.SymbolInfo
	var prefix []datafeed.SymbolInfo
	var substring []datafeed.SymbolInfo

	for _, sym := range a.cachedSymbols {
		sUpper := strings.ToUpper(sym.Symbol)
		dUpper := strings.ToUpper(sym.Description)
		if sUpper == q {
			exact = append(exact, sym)
		} else if strings.HasPrefix(sUpper, q) {
			prefix = append(prefix, sym)
		} else if strings.Contains(sUpper, q) || strings.Contains(dUpper, q) {
			substring = append(substring, sym)
		}
	}

	var results []datafeed.SymbolInfo
	results = append(results, exact...)
	results = append(results, prefix...)
	results = append(results, substring...)

	if len(results) > 50 {
		results = results[:50]
	}

	return results, nil
}

// Subscribe opens a real-time WebSocket connection to Alpaca and routes raw market data.
func (a *AlpacaProvider) Subscribe(ctx context.Context, symbol, resolution string, onCandle func(c datafeed.Candle)) error {
	cleanSymbol := normalizeAlpacaSymbol(symbol)
	subKey := fmt.Sprintf("%s@%s", cleanSymbol, resolution)

	a.mu.Lock()
	if _, exists := a.subs[subKey]; exists {
		a.mu.Unlock()
		return nil
	}
	subCtx, cancel := context.WithCancel(ctx)
	a.subs[subKey] = cancel
	a.mu.Unlock()

	targetSec := datafeed.ResolutionToSeconds(resolution)
	if targetSec <= 0 {
		targetSec = 60
	}

	go a.runWebSocketLoop(subCtx, cleanSymbol, targetSec, onCandle)
	return nil
}

// Unsubscribe cancels a live streaming subscription.
func (a *AlpacaProvider) Unsubscribe(symbol, resolution string) error {
	cleanSymbol := normalizeAlpacaSymbol(symbol)
	subKey := fmt.Sprintf("%s@%s", cleanSymbol, resolution)

	a.mu.Lock()
	defer a.mu.Unlock()
	if cancel, ok := a.subs[subKey]; ok {
		cancel()
		delete(a.subs, subKey)
	}
	return nil
}

// runWebSocketLoop manages connection, authentication, and raw tick streaming.
func (a *AlpacaProvider) runWebSocketLoop(ctx context.Context, symbol string, stepSec int64, onCandle func(c datafeed.Candle)) {
	wsURL := a.streamURL
	crypto := isCryptoSymbol(symbol)
	if crypto {
		wsURL = "wss://stream.data.alpaca.markets/v2/crypto/us"
	}

	backoff := 1 * time.Second
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		conn, _, err := websocket.Dial(ctx, wsURL, nil)
		if err != nil {
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
				backoff *= 2
				if backoff > 30*time.Second {
					backoff = 30 * time.Second
				}
				continue
			}
		}
		backoff = 1 * time.Second

		// 1. Read connected greeting: [{"T":"success","msg":"connected"}]
		var greeting []map[string]interface{}
		if err := wsjson.Read(ctx, conn, &greeting); err != nil {
			conn.Close(websocket.StatusAbnormalClosure, "read greeting error")
			continue
		}

		// 2. Send authentication
		apiKey, apiSecret := a.RawCredentials()
		authMsg := map[string]string{
			"action": "auth",
			"key":    apiKey,
			"secret": apiSecret,
		}
		if err := wsjson.Write(ctx, conn, authMsg); err != nil {
			conn.Close(websocket.StatusAbnormalClosure, "write auth error")
			continue
		}

		// 3. Read authenticated confirmation
		var authResp []map[string]interface{}
		if err := wsjson.Read(ctx, conn, &authResp); err != nil {
			conn.Close(websocket.StatusAbnormalClosure, "read auth error")
			continue
		}

		// 4. Subscribe to trades and bars for the symbol
		subMsg := map[string]interface{}{
			"action": "subscribe",
			"trades": []string{symbol},
			"bars":   []string{symbol},
		}
		if err := wsjson.Write(ctx, conn, subMsg); err != nil {
			conn.Close(websocket.StatusAbnormalClosure, "write sub error")
			continue
		}

		var curCandle *datafeed.Candle
		var curCandleMu sync.Mutex

		readErrCh := make(chan error, 1)
		go func() {
			for {
				var rawMessages []json.RawMessage
				if err := wsjson.Read(ctx, conn, &rawMessages); err != nil {
					readErrCh <- err
					return
				}

				for _, raw := range rawMessages {
					var header struct {
						T string `json:"T"`
						S string `json:"S"`
					}
					if err := json.Unmarshal(raw, &header); err != nil {
						continue
					}

					switch header.T {
					case "t":
						// Raw executed trade: {"T":"t","S":"AAPL","p":150.25,"s":100,"t":"..."}
						var trade struct {
							P float64 `json:"p"`
							S float64 `json:"s"`
							T string  `json:"t"`
						}
						if err := json.Unmarshal(raw, &trade); err != nil || trade.P <= 0 {
							continue
						}

						tradeTime := time.Now().UTC()
						if trade.T != "" {
							if pt, err := time.Parse(time.RFC3339Nano, trade.T); err == nil {
								tradeTime = pt.UTC()
							}
						}

						bucket := (tradeTime.Unix() / stepSec) * stepSec

						curCandleMu.Lock()
						if curCandle == nil || curCandle.Time != bucket {
							curCandle = &datafeed.Candle{
								Time:   bucket,
								Open:   trade.P,
								High:   trade.P,
								Low:    trade.P,
								Close:  trade.P,
								Volume: trade.S,
							}
						} else {
							if trade.P > curCandle.High {
								curCandle.High = trade.P
							}
							if trade.P < curCandle.Low {
								curCandle.Low = trade.P
							}
							curCandle.Close = trade.P
							curCandle.Volume += trade.S
						}
						emitted := *curCandle
						curCandleMu.Unlock()

						// Immediate raw tick emission to chart
						onCandle(emitted)

					case "b":
						// Bar message: {"T":"b","S":"AAPL","o":150.1,"h":150.5,"l":150.0,"c":150.3,"v":1000,"t":"..."}
						var bar struct {
							O float64 `json:"o"`
							H float64 `json:"h"`
							L float64 `json:"l"`
							C float64 `json:"c"`
							V float64 `json:"v"`
							T string  `json:"t"`
						}
						if err := json.Unmarshal(raw, &bar); err != nil || bar.C <= 0 {
							continue
						}

						barTime := time.Now().UTC()
						if bar.T != "" {
							if pt, err := time.Parse(time.RFC3339Nano, bar.T); err == nil {
								barTime = pt.UTC()
							}
						}

						bucket := (barTime.Unix() / stepSec) * stepSec

						curCandleMu.Lock()
						curCandle = &datafeed.Candle{
							Time:   bucket,
							Open:   bar.O,
							High:   bar.H,
							Low:    bar.L,
							Close:  bar.C,
							Volume: bar.V,
						}
						emitted := *curCandle
						curCandleMu.Unlock()

						onCandle(emitted)
					}
				}
			}
		}()

		select {
		case <-ctx.Done():
			conn.Close(websocket.StatusNormalClosure, "unsubscribed")
			return
		case <-readErrCh:
			conn.Close(websocket.StatusAbnormalClosure, "stream disconnected")
			time.Sleep(500 * time.Millisecond)
		}
	}
}

// loadInstruments downloads active US equities from Alpaca Assets REST API.
func (a *AlpacaProvider) loadInstruments(ctx context.Context, apiKey, apiSecret string) {
	if apiKey == "" || apiSecret == "" {
		return
	}
	endpoint := fmt.Sprintf("%s/assets?status=active&asset_class=us_equity", a.baseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return
	}
	req.Header.Set("APCA-API-KEY-ID", apiKey)
	req.Header.Set("APCA-API-SECRET-KEY", apiSecret)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "OrderCraft/1.0")

	resp, err := a.client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return
		}
		log.Printf("[ALPACA] loadInstruments error: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("[ALPACA] loadInstruments status code: %d", resp.StatusCode)
		return
	}

	type alpacaAsset struct {
		ID         string `json:"id"`
		Class      string `json:"class"`
		Exchange   string `json:"exchange"`
		Symbol     string `json:"symbol"`
		Name       string `json:"name"`
		Status     string `json:"status"`
		Tradable   bool   `json:"tradable"`
		Marginable bool   `json:"marginable"`
	}

	var assets []alpacaAsset
	if err := json.NewDecoder(resp.Body).Decode(&assets); err != nil {
		log.Printf("[ALPACA] loadInstruments decode error: %v", err)
		return
	}

	var list []datafeed.SymbolInfo
	seen := make(map[string]bool)

	// Keep default cryptos first
	for _, c := range []string{"BTC/USD", "ETH/USD", "SOL/USD"} {
		list = append(list, datafeed.SymbolInfo{
			Symbol:      c,
			FullSymbol:  fmt.Sprintf("ALPACA:%s", c),
			Description: fmt.Sprintf("%s (Alpaca Crypto)", c),
			Exchange:    "ALPACA",
			Type:        "crypto",
			PriceScale:  100,
		})
		seen[c] = true
	}

	for _, ast := range assets {
		if !ast.Tradable || ast.Status != "active" {
			continue
		}
		if seen[ast.Symbol] {
			continue
		}
		seen[ast.Symbol] = true

		itemType := "stock"
		if strings.Contains(strings.ToLower(ast.Name), "etf") || strings.Contains(strings.ToLower(ast.Name), "trust") {
			itemType = "fund"
		}

		desc := ast.Name
		if desc == "" {
			desc = fmt.Sprintf("%s (%s)", ast.Symbol, ast.Exchange)
		}

		list = append(list, datafeed.SymbolInfo{
			Symbol:      ast.Symbol,
			FullSymbol:  fmt.Sprintf("ALPACA:%s", ast.Symbol),
			Description: desc,
			Exchange:    "ALPACA",
			Type:        itemType,
			PriceScale:  100,
		})
	}

	if ctx.Err() != nil {
		return
	}

	a.symbolsMu.Lock()
	if ctx.Err() == nil {
		a.cachedSymbols = list
		a.lastFetched = time.Now()
	}
	a.symbolsMu.Unlock()

	log.Printf("[ALPACA] Successfully indexed %d active tradable instruments from Alpaca Markets", len(list))
}
