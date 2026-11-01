package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
	"github.com/ordercraft-hq/terminal/internal/datafeed"
)

type BinanceProvider struct {
	client        *http.Client
	baseURL       string
	wsHost        string
	isUS          bool
	mu            sync.Mutex
	cancelLoad    context.CancelFunc
	subs          map[string]context.CancelFunc
	symbolsMu     sync.RWMutex
	cachedSymbols []datafeed.SymbolInfo
	lastFetched   time.Time
}

func NewBinanceProvider() *BinanceProvider {
	isUS := strings.EqualFold(os.Getenv("BINANCE_US"), "true") || strings.EqualFold(os.Getenv("BINANCE_USE_US"), "true")
	baseURL := "https://api.binance.com"
	wsHost := "stream.binance.com:9443"
	if isUS {
		baseURL = "https://api.binance.us"
		wsHost = "stream.binance.us:9443"
	}
	if custom := os.Getenv("BINANCE_BASE_URL"); custom != "" {
		baseURL = strings.TrimRight(custom, "/")
	}

	bp := &BinanceProvider{
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
		baseURL: baseURL,
		wsHost:  wsHost,
		isUS:    isUS,
		subs:    make(map[string]context.CancelFunc),
	}
	// Pre-load full instruments dynamically from Binance API asynchronously
	ctx, cancel := context.WithCancel(context.Background())
	bp.cancelLoad = cancel
	go bp.loadInstruments(ctx)
	return bp
}

// BaseURL returns the configured base URL safely under mutex.
func (b *BinanceProvider) BaseURL() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.baseURL
}

// WSHost returns the configured WebSocket host safely under mutex.
func (b *BinanceProvider) WSHost() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.wsHost
}

// IsUS returns true if the provider is currently routing to Binance.US.
func (b *BinanceProvider) IsUS() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.isUS
}

// SetBaseURL dynamically updates the REST base URL and cancels in-flight instrument indexing.
func (b *BinanceProvider) SetBaseURL(url string) {
	b.mu.Lock()
	if b.cancelLoad != nil {
		b.cancelLoad()
		b.cancelLoad = nil
	}
	b.baseURL = url
	b.mu.Unlock()
}

// SwitchToUS automatically transitions from Binance Global to Binance.US upon geo-restriction (HTTP 451/403).
func (b *BinanceProvider) SwitchToUS() {
	b.mu.Lock()
	if b.isUS {
		b.mu.Unlock()
		return
	}
	b.isUS = true
	b.baseURL = "https://api.binance.us"
	b.wsHost = "stream.binance.us:9443"
	if b.cancelLoad != nil {
		b.cancelLoad()
		b.cancelLoad = nil
	}
	b.mu.Unlock()

	b.symbolsMu.Lock()
	b.cachedSymbols = nil
	b.symbolsMu.Unlock()

	log.Printf("[Binance] US environment/geo-restriction detected (HTTP 451/403). Switched to Binance.US API (api.binance.us).")

	ctx, cancel := context.WithCancel(context.Background())
	b.mu.Lock()
	b.cancelLoad = cancel
	b.mu.Unlock()
	go b.loadInstruments(ctx)
}

func (b *BinanceProvider) Name() string {
	return "BINANCE"
}

// SupportedResolutions returns all intervals natively supported by Binance.
func (b *BinanceProvider) SupportedResolutions() []string {
	return []string{
		"1s", "1m", "3m", "5m", "15m", "30m",
		"1h", "2h", "4h", "6h", "8h", "12h",
		"1d", "3d", "1w", "1M",
	}
}

func normalizeBinanceInterval(res string) string {
	clean := strings.TrimSpace(res)
	if clean == "1M" || clean == "M" || strings.EqualFold(clean, "1MO") || strings.EqualFold(clean, "1MTH") || strings.EqualFold(clean, "1MONTH") {
		return "1M"
	}
	resUpper := strings.ToUpper(clean)
	if strings.HasSuffix(resUpper, "S") {
		return "1s"
	}
	switch resUpper {
	case "1", "1M":
		return "1m"
	case "3", "3M":
		return "3m"
	case "5", "5M":
		return "5m"
	case "15", "15M":
		return "15m"
	case "30", "30M":
		return "30m"
	case "60", "1H":
		return "1h"
	case "120", "2H":
		return "2h"
	case "240", "4H":
		return "4h"
	case "360", "6H":
		return "6h"
	case "480", "8H":
		return "8h"
	case "720", "12H":
		return "12h"
	case "D", "1D":
		return "1d"
	case "3D":
		return "3d"
	case "W", "1W":
		return "1w"
	default:
		return "1m"
	}
}

func (b *BinanceProvider) GetHistory(ctx context.Context, symbol, resolution string, from, to int64, count int) ([]datafeed.Candle, error) {
	// Strip provider prefix if present: "BINANCE:BTCUSDT" -> "BTCUSDT"
	cleanSymbol := symbol
	if parts := strings.Split(symbol, ":"); len(parts) == 2 {
		cleanSymbol = parts[1]
	}
	cleanSymbol = strings.ToUpper(strings.TrimSpace(cleanSymbol))

	interval := normalizeBinanceInterval(resolution)

	params := url.Values{}
	params.Set("symbol", cleanSymbol)
	params.Set("interval", interval)

	limit := count
	if limit <= 0 {
		limit = 200
	} else if limit > 1000 {
		limit = 1000
	}
	params.Set("limit", strconv.Itoa(limit))

	if from > 0 {
		fromMs := from
		if fromMs < 10_000_000_000 {
			fromMs *= 1000
		}
		params.Set("startTime", strconv.FormatInt(fromMs, 10))
	}
	if to > 0 {
		toMs := to
		if toMs < 10_000_000_000 {
			toMs *= 1000
		}
		if from == 0 {
			toMs = toMs - 1
		}
		params.Set("endTime", strconv.FormatInt(toMs, 10))
	}

	endpoint := fmt.Sprintf("%s/api/v3/klines?%s", b.BaseURL(), params.Encode())

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to build request: %w", err)
	}

	resp, err := b.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch binance klines: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnavailableForLegalReasons || resp.StatusCode == http.StatusForbidden {
		if req.URL.Host != "api.binance.us" {
			b.SwitchToUS()
			return b.GetHistory(ctx, symbol, resolution, from, to, count)
		}
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("binance api returned status: %d", resp.StatusCode)
	}

	var rawKlines [][]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&rawKlines); err != nil {
		return nil, fmt.Errorf("failed to decode binance klines: %w", err)
	}

	candles := make([]datafeed.Candle, 0, len(rawKlines))
	for _, row := range rawKlines {
		if len(row) < 6 {
			continue
		}

		timeMs, ok := row[0].(float64)
		if !ok {
			continue
		}
		timeSec := int64(timeMs / 1000)

		openStr, _ := row[1].(string)
		highStr, _ := row[2].(string)
		lowStr, _ := row[3].(string)
		closeStr, _ := row[4].(string)
		volStr, _ := row[5].(string)

		open, _ := strconv.ParseFloat(openStr, 64)
		high, _ := strconv.ParseFloat(highStr, 64)
		low, _ := strconv.ParseFloat(lowStr, 64)
		closeVal, _ := strconv.ParseFloat(closeStr, 64)
		volume, _ := strconv.ParseFloat(volStr, 64)

		candles = append(candles, datafeed.Candle{
			Time:   timeSec,
			Open:   open,
			High:   high,
			Low:    low,
			Close:  closeVal,
			Volume: volume,
		})
	}

	return candles, nil
}

type binanceExchangeInfoResponse struct {
	Symbols []struct {
		Symbol     string `json:"symbol"`
		Status     string `json:"status"`
		BaseAsset  string `json:"baseAsset"`
		QuoteAsset string `json:"quoteAsset"`
	} `json:"symbols"`
}

func (b *BinanceProvider) loadInstruments(ctx context.Context) ([]datafeed.SymbolInfo, error) {
	b.symbolsMu.RLock()
	if len(b.cachedSymbols) > 0 && time.Since(b.lastFetched) < 6*time.Hour {
		cached := b.cachedSymbols
		b.symbolsMu.RUnlock()
		return cached, nil
	}
	b.symbolsMu.RUnlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, b.BaseURL()+"/api/v3/exchangeInfo", nil)
	if err != nil {
		return nil, err
	}

	resp, err := b.client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, err
	}
	defer resp.Body.Close()

	if ctx.Err() != nil {
		return nil, ctx.Err()
	}

	if resp.StatusCode == http.StatusUnavailableForLegalReasons || resp.StatusCode == http.StatusForbidden {
		if req.URL.Host != "api.binance.us" {
			b.SwitchToUS()
			return b.loadInstruments(ctx)
		}
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("exchangeInfo returned status %d", resp.StatusCode)
	}

	var data binanceExchangeInfoResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	var symbols []datafeed.SymbolInfo
	validQuote := map[string]bool{
		"USDT": true, "USDC": true, "BTC": true, "FDUSD": true, "EUR": true,
	}

	for _, s := range data.Symbols {
		if s.Status == "TRADING" && validQuote[s.QuoteAsset] {
			scale := 100
			if s.QuoteAsset == "BTC" {
				scale = 100000000
			}
			symbols = append(symbols, datafeed.SymbolInfo{
				Symbol:      s.Symbol,
				FullSymbol:  "BINANCE:" + s.Symbol,
				Description: fmt.Sprintf("%s / %s", s.BaseAsset, s.QuoteAsset),
				Exchange:    "BINANCE",
				Type:        "crypto",
				PriceScale:  scale,
			})
		}
	}

	if ctx.Err() != nil {
		return nil, ctx.Err()
	}

	b.symbolsMu.Lock()
	if ctx.Err() == nil {
		b.cachedSymbols = symbols
		b.lastFetched = time.Now()
	}
	b.symbolsMu.Unlock()

	return symbols, nil
}

func (b *BinanceProvider) Search(ctx context.Context, query string) ([]datafeed.SymbolInfo, error) {
	b.symbolsMu.RLock()
	symbols := b.cachedSymbols
	b.symbolsMu.RUnlock()

	if len(symbols) == 0 {
		var err error
		symbols, err = b.loadInstruments(ctx)
		if err != nil {
			return nil, err
		}
	}

	q := strings.ToUpper(strings.TrimSpace(query))
	var matches []datafeed.SymbolInfo

	for _, s := range symbols {
		if q == "" || strings.Contains(strings.ToUpper(s.Symbol), q) || strings.Contains(strings.ToUpper(s.Description), q) {
			matches = append(matches, s)
			if len(matches) >= 100 {
				break
			}
		}
	}

	return matches, nil
}

type binanceWsPayload struct {
	EventType string `json:"e"`
	EventTime int64  `json:"E"`
	Symbol    string `json:"s"`
	Kline     struct {
		StartTime     int64  `json:"t"`
		EndTime       int64  `json:"T"`
		Symbol        string `json:"s"`
		Interval      string `json:"i"`
		FirstTradeID  int64  `json:"f"`
		LastTradeID   int64  `json:"L"`
		Open          string `json:"o"`
		Close         string `json:"c"`
		High          string `json:"h"`
		Low           string `json:"l"`
		Volume        string `json:"v"`
		TradeCount    int64  `json:"n"`
		IsClosed      bool   `json:"x"`
		QuoteVolume   string `json:"q"`
		TakerBuyBase  string `json:"V"`
		TakerBuyQuote string `json:"Q"`
		Ignore        string `json:"B"`
	} `json:"k"`
}

func (b *BinanceProvider) Subscribe(ctx context.Context, symbol, resolution string, onCandle func(c datafeed.Candle)) error {
	cleanSymbol := symbol
	if parts := strings.Split(symbol, ":"); len(parts) == 2 {
		cleanSymbol = parts[1]
	}
	cleanSymbol = strings.ToUpper(strings.TrimSpace(cleanSymbol))
	interval := normalizeBinanceInterval(resolution)
	subKey := fmt.Sprintf("%s:%s", cleanSymbol, strings.ToLower(resolution))

	b.mu.Lock()
	if existingCancel, ok := b.subs[subKey]; ok {
		existingCancel()
		delete(b.subs, subKey)
	}

	subCtx, cancel := context.WithCancel(context.Background())
	b.subs[subKey] = cancel
	b.mu.Unlock()

	targetStepSec := datafeed.ResolutionToSeconds(resolution)
	callback := onCandle
	if targetStepSec > 1 && interval == "1s" {
		liveAgg := datafeed.NewLiveAggregator(resolution)
		callback = func(c datafeed.Candle) {
			onCandle(liveAgg.UpdateCandle(c))
		}
	}

	go b.runStream(subCtx, cleanSymbol, interval, callback)
	return nil
}

func (b *BinanceProvider) Unsubscribe(symbol, resolution string) error {
	cleanSymbol := symbol
	if parts := strings.Split(symbol, ":"); len(parts) == 2 {
		cleanSymbol = parts[1]
	}
	cleanSymbol = strings.ToUpper(strings.TrimSpace(cleanSymbol))
	subKey := fmt.Sprintf("%s:%s", cleanSymbol, strings.ToLower(resolution))

	b.mu.Lock()
	if cancel, ok := b.subs[subKey]; ok {
		cancel()
		delete(b.subs, subKey)
	}
	b.mu.Unlock()
	return nil
}

func (b *BinanceProvider) runStream(ctx context.Context, symbol, interval string, onCandle func(c datafeed.Candle)) {
	backoff := 1 * time.Second
	for {
		if ctx.Err() != nil {
			return
		}

		wsURL := fmt.Sprintf("wss://%s/ws/%s@kline_%s", b.WSHost(), url.PathEscape(strings.ToLower(symbol)), url.PathEscape(interval))
		log.Printf("[Binance WS] Dialing %s...", wsURL)
		conn, _, err := websocket.Dial(ctx, wsURL, nil)
		if err != nil {
			log.Printf("[Binance WS] Dial failed to %s: %v", wsURL, err)
			if (strings.Contains(err.Error(), "451") || strings.Contains(err.Error(), "403")) && strings.Contains(wsURL, "binance.com") {
				b.SwitchToUS()
				continue
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
				if backoff < 15*time.Second {
					backoff *= 2
				}
				continue
			}
		}

		log.Printf("[Binance WS] Connected to %s successfully!", wsURL)
		backoff = 1 * time.Second

		// Read loop
		for {
			if ctx.Err() != nil {
				conn.Close(websocket.StatusNormalClosure, "unsubscribed")
				return
			}

			var payload binanceWsPayload
			err := wsjson.Read(ctx, conn, &payload)
			if err != nil {
				log.Printf("[Binance WS] Read error from %s: %v", wsURL, err)
				conn.Close(websocket.StatusAbnormalClosure, "read error")
				break
			}

			if payload.Kline.StartTime > 0 {
				open, _ := strconv.ParseFloat(payload.Kline.Open, 64)
				high, _ := strconv.ParseFloat(payload.Kline.High, 64)
				low, _ := strconv.ParseFloat(payload.Kline.Low, 64)
				closeVal, _ := strconv.ParseFloat(payload.Kline.Close, 64)
				vol, _ := strconv.ParseFloat(payload.Kline.Volume, 64)

				candle := datafeed.Candle{
					Time:   payload.Kline.StartTime / 1000,
					Open:   open,
					High:   high,
					Low:    low,
					Close:  closeVal,
					Volume: vol,
				}
				onCandle(candle)
			}
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(500 * time.Millisecond):
		}
	}
}
