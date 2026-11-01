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

// BybitProvider implements datafeed.DataProvider for Bybit v5 public market data (Linear derivatives & Spot).
type BybitProvider struct {
	client        *http.Client
	baseURL       string
	wsURL         string
	mu            sync.Mutex
	cancelLoad    context.CancelFunc
	subs          map[string]context.CancelFunc
	symbolsMu     sync.RWMutex
	cachedSymbols []datafeed.SymbolInfo
	lastFetched   time.Time
}

// NewBybitProvider creates and initializes a Bybit v5 market data provider.
func NewBybitProvider() *BybitProvider {
	bp := &BybitProvider{
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
		baseURL: "https://api.bybit.com",
		wsURL:   "wss://stream.bybit.com/v5/public/linear",
		subs:    make(map[string]context.CancelFunc),
	}
	// Seed common popular symbols immediately for instant responsiveness
	bp.seedDefaultSymbols()
	// Asynchronously load full instruments from Bybit v5
	ctx, cancel := context.WithCancel(context.Background())
	bp.cancelLoad = cancel
	go bp.loadInstruments(ctx)
	return bp
}

// BaseURL returns the configured base URL safely under mutex.
func (b *BybitProvider) BaseURL() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.baseURL
}

// SetBaseURL dynamically updates the REST base URL and cancels in-flight instrument indexing.
func (b *BybitProvider) SetBaseURL(url string) {
	b.mu.Lock()
	if b.cancelLoad != nil {
		b.cancelLoad()
		b.cancelLoad = nil
	}
	b.baseURL = url
	b.mu.Unlock()
}

func (b *BybitProvider) Name() string {
	return "BYBIT"
}

// SupportedResolutions returns all intervals supported natively by Bybit v5.
func (b *BybitProvider) SupportedResolutions() []string {
	return []string{
		"1m", "3m", "5m", "15m", "30m",
		"1h", "2h", "4h", "6h", "12h",
		"1d", "1w", "1M",
	}
}

// normalizeBybitInterval translates UI/standard intervals into Bybit v5 interval parameters.
func normalizeBybitInterval(res string) string {
	clean := strings.TrimSpace(res)
	if clean == "1M" || clean == "M" || strings.EqualFold(clean, "1MO") || strings.EqualFold(clean, "1MTH") || strings.EqualFold(clean, "1MONTH") {
		return "M"
	}
	resUpper := strings.ToUpper(clean)
	switch resUpper {
	case "1", "1M":
		return "1"
	case "3", "3M":
		return "3"
	case "5", "5M":
		return "5"
	case "15", "15M":
		return "15"
	case "30", "30M":
		return "30"
	case "60", "1H":
		return "60"
	case "120", "2H":
		return "120"
	case "240", "4H":
		return "240"
	case "360", "6H":
		return "360"
	case "720", "12H":
		return "720"
	case "D", "1D":
		return "D"
	case "W", "1W":
		return "W"
	default:
		return "15"
	}
}

func (b *BybitProvider) determineCategory(cleanSymbol string) string {
	upper := strings.ToUpper(cleanSymbol)
	if strings.HasSuffix(upper, "USDT") || strings.HasSuffix(upper, "USDC") || strings.HasSuffix(upper, "PERP") {
		return "linear"
	}
	return "spot"
}

// GetHistory fetches historical OHLCV candles from Bybit v5 /v5/market/kline.
func (b *BybitProvider) GetHistory(ctx context.Context, symbol, resolution string, from, to int64, count int) ([]datafeed.Candle, error) {
	cleanSymbol := symbol
	if parts := strings.Split(symbol, ":"); len(parts) == 2 {
		cleanSymbol = parts[1]
	}
	cleanSymbol = strings.ToUpper(strings.TrimSpace(cleanSymbol))

	interval := normalizeBybitInterval(resolution)
	category := b.determineCategory(cleanSymbol)

	params := url.Values{}
	params.Set("category", category)
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
		params.Set("start", strconv.FormatInt(fromMs, 10))
	}
	if to > 0 {
		toMs := to
		if toMs < 10_000_000_000 {
			toMs *= 1000
		}
		params.Set("end", strconv.FormatInt(toMs, 10))
	}

	endpoint := fmt.Sprintf("%s/v5/market/kline?%s", b.BaseURL(), params.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("bybit new request: %w", err)
	}

	resp, err := b.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("bybit http get: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("bybit unexpected status code: %d", resp.StatusCode)
	}

	type bybitKlineResponse struct {
		RetCode int    `json:"retCode"`
		RetMsg  string `json:"retMsg"`
		Result  struct {
			Category string     `json:"category"`
			Symbol   string     `json:"symbol"`
			List     [][]string `json:"list"`
		} `json:"result"`
	}

	var res bybitKlineResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, fmt.Errorf("bybit json decode: %w", err)
	}

	if res.RetCode != 0 {
		return nil, fmt.Errorf("bybit api error code %d: %s", res.RetCode, res.RetMsg)
	}

	// Bybit returns newest first. Reverse to return chronological order (oldest -> newest).
	rawList := res.Result.List
	candles := make([]datafeed.Candle, 0, len(rawList))
	for i := len(rawList) - 1; i >= 0; i-- {
		row := rawList[i]
		if len(row) < 5 {
			continue
		}

		timeMs, err := strconv.ParseInt(row[0], 10, 64)
		if err != nil {
			continue
		}
		tSec := timeMs / 1000

		open, _ := strconv.ParseFloat(row[1], 64)
		high, _ := strconv.ParseFloat(row[2], 64)
		low, _ := strconv.ParseFloat(row[3], 64)
		closePrice, _ := strconv.ParseFloat(row[4], 64)

		var vol float64
		if len(row) > 5 {
			vol, _ = strconv.ParseFloat(row[5], 64)
		}

		candles = append(candles, datafeed.Candle{
			Time:   tSec,
			Open:   open,
			High:   high,
			Low:    low,
			Close:  closePrice,
			Volume: vol,
		})
	}

	return candles, nil
}

// Search queries cached Bybit instruments.
func (b *BybitProvider) Search(ctx context.Context, query string) ([]datafeed.SymbolInfo, error) {
	b.symbolsMu.RLock()
	defer b.symbolsMu.RUnlock()

	q := strings.ToUpper(strings.TrimSpace(query))
	if q == "" {
		if len(b.cachedSymbols) > 50 {
			return b.cachedSymbols[:50], nil
		}
		return b.cachedSymbols, nil
	}

	var results []datafeed.SymbolInfo
	for _, sym := range b.cachedSymbols {
		if strings.Contains(strings.ToUpper(sym.Symbol), q) ||
			strings.Contains(strings.ToUpper(sym.Description), q) {
			results = append(results, sym)
			if len(results) >= 50 {
				break
			}
		}
	}
	return results, nil
}

// Subscribe opens a WebSocket stream for live Bybit klines.
func (b *BybitProvider) Subscribe(ctx context.Context, symbol, resolution string, onCandle func(c datafeed.Candle)) error {
	cleanSymbol := symbol
	if parts := strings.Split(symbol, ":"); len(parts) == 2 {
		cleanSymbol = parts[1]
	}
	cleanSymbol = strings.ToUpper(strings.TrimSpace(cleanSymbol))
	interval := normalizeBybitInterval(resolution)
	subKey := fmt.Sprintf("%s@%s", cleanSymbol, interval)

	b.mu.Lock()
	if _, exists := b.subs[subKey]; exists {
		b.mu.Unlock()
		return nil
	}
	subCtx, cancel := context.WithCancel(ctx)
	b.subs[subKey] = cancel
	b.mu.Unlock()

	go b.runWebSocketLoop(subCtx, cleanSymbol, interval, onCandle)
	return nil
}

// Unsubscribe cancels a live kline subscription.
func (b *BybitProvider) Unsubscribe(symbol, resolution string) error {
	cleanSymbol := symbol
	if parts := strings.Split(symbol, ":"); len(parts) == 2 {
		cleanSymbol = parts[1]
	}
	cleanSymbol = strings.ToUpper(strings.TrimSpace(cleanSymbol))
	interval := normalizeBybitInterval(resolution)
	subKey := fmt.Sprintf("%s@%s", cleanSymbol, interval)

	b.mu.Lock()
	defer b.mu.Unlock()
	if cancel, ok := b.subs[subKey]; ok {
		cancel()
		delete(b.subs, subKey)
	}
	return nil
}

func (b *BybitProvider) runWebSocketLoop(ctx context.Context, symbol, interval string, onCandle func(c datafeed.Candle)) {
	topic := fmt.Sprintf("kline.%s.%s", interval, symbol)
	wsURL := b.wsURL

	backoff := 1 * time.Second
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		conn, _, err := websocket.Dial(ctx, wsURL, nil)
		if err != nil {
			log.Printf("[Bybit WS] Dial error: %v. Retrying in %v...", err, backoff)
			select {
			case <-time.After(backoff):
				backoff = min(backoff*2, 30*time.Second)
				continue
			case <-ctx.Done():
				return
			}
		}
		backoff = 1 * time.Second

		// Subscribe to topic
		subMsg := map[string]interface{}{
			"op":   "subscribe",
			"args": []string{topic},
		}
		if err := wsjson.Write(ctx, conn, subMsg); err != nil {
			conn.Close(websocket.StatusInternalError, "write subscribe failed")
			continue
		}

		// Keep-alive ping ticker every 20s
		pingTicker := time.NewTicker(20 * time.Second)
		readErrCh := make(chan error, 1)

		go func() {
			defer pingTicker.Stop()
			for {
				select {
				case <-pingTicker.C:
					if err := wsjson.Write(ctx, conn, map[string]string{"op": "ping"}); err != nil {
						return
					}
				case <-ctx.Done():
					return
				}
			}
		}()

		// Message read loop
		go func() {
			for {
				var rawMsg struct {
					Topic string `json:"topic"`
					Type  string `json:"type"`
					Data  []struct {
						Start     int64  `json:"start"`
						End       int64  `json:"end"`
						Interval  string `json:"interval"`
						Open      string `json:"open"`
						Close     string `json:"close"`
						High      string `json:"high"`
						Low       string `json:"low"`
						Volume    string `json:"volume"`
						Turnover  string `json:"turnover"`
						Confirm   bool   `json:"confirm"`
						Timestamp int64  `json:"timestamp"`
					} `json:"data"`
				}

				if err := wsjson.Read(ctx, conn, &rawMsg); err != nil {
					readErrCh <- err
					return
				}

				if strings.HasPrefix(rawMsg.Topic, "kline.") && len(rawMsg.Data) > 0 {
					kd := rawMsg.Data[0]
					o, _ := strconv.ParseFloat(kd.Open, 64)
					h, _ := strconv.ParseFloat(kd.High, 64)
					l, _ := strconv.ParseFloat(kd.Low, 64)
					c, _ := strconv.ParseFloat(kd.Close, 64)
					v, _ := strconv.ParseFloat(kd.Volume, 64)

					candle := datafeed.Candle{
						Time:   kd.Start / 1000,
						Open:   o,
						High:   h,
						Low:    l,
						Close:  c,
						Volume: v,
					}
					onCandle(candle)
				}
			}
		}()

		select {
		case <-ctx.Done():
			conn.Close(websocket.StatusNormalClosure, "unsubscribed")
			return
		case err := <-readErrCh:
			log.Printf("[Bybit WS] Read error for %s: %v. Reconnecting...", topic, err)
			conn.Close(websocket.StatusAbnormalClosure, "read error")
		}
	}
}

func (b *BybitProvider) seedDefaultSymbols() {
	b.symbolsMu.Lock()
	defer b.symbolsMu.Unlock()

	defaultTickers := []struct {
		sym  string
		desc string
	}{
		{"BTCUSDT", "Bitcoin / Tether USD (Perpetual)"},
		{"ETHUSDT", "Ethereum / Tether USD (Perpetual)"},
		{"SOLUSDT", "Solana / Tether USD (Perpetual)"},
		{"XRPUSDT", "Ripple / Tether USD (Perpetual)"},
		{"DOGEUSDT", "Dogecoin / Tether USD (Perpetual)"},
		{"BNBUSDT", "BNB / Tether USD (Perpetual)"},
		{"ADAUSDT", "Cardano / Tether USD (Perpetual)"},
		{"AVAXUSDT", "Avalanche / Tether USD (Perpetual)"},
		{"SUIUSDT", "Sui / Tether USD (Perpetual)"},
		{"NEARUSDT", "Near Protocol / Tether USD (Perpetual)"},
		{"LINKUSDT", "Chainlink / Tether USD (Perpetual)"},
		{"PEPEUSDT", "Pepe / Tether USD (Perpetual)"},
	}

	b.cachedSymbols = make([]datafeed.SymbolInfo, 0, len(defaultTickers))
	for _, dt := range defaultTickers {
		b.cachedSymbols = append(b.cachedSymbols, datafeed.SymbolInfo{
			Symbol:      dt.sym,
			FullSymbol:  fmt.Sprintf("BYBIT:%s", dt.sym),
			Description: dt.desc,
			Exchange:    "BYBIT",
			Type:        "crypto",
			PriceScale:  100,
		})
	}
}

func (b *BybitProvider) loadInstruments(ctx context.Context) {
	endpoint := fmt.Sprintf("%s/v5/market/instruments-info?category=linear&limit=1000", b.BaseURL())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return
	}

	resp, err := b.client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	if ctx.Err() != nil {
		return
	}

	if resp.StatusCode != http.StatusOK {
		return
	}

	type instrumentsResp struct {
		RetCode int `json:"retCode"`
		Result  struct {
			List []struct {
				Symbol       string `json:"symbol"`
				ContractType string `json:"contractType"`
				Status       string `json:"status"`
				BaseCoin     string `json:"baseCoin"`
				QuoteCoin    string `json:"quoteCoin"`
				PriceScale   string `json:"priceScale"`
			} `json:"list"`
		} `json:"result"`
	}

	var res instrumentsResp
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return
	}
	if res.RetCode != 0 || len(res.Result.List) == 0 {
		return
	}

	if ctx.Err() != nil {
		return
	}

	b.symbolsMu.Lock()
	defer b.symbolsMu.Unlock()
	if ctx.Err() != nil {
		return
	}

	var loaded []datafeed.SymbolInfo
	for _, inst := range res.Result.List {
		if inst.Status != "Trading" {
			continue
		}
		scale := 100
		if s, err := strconv.Atoi(inst.PriceScale); err == nil && s > 0 {
			scale = 1
			for i := 0; i < s; i++ {
				scale *= 10
			}
		}
		loaded = append(loaded, datafeed.SymbolInfo{
			Symbol:      inst.Symbol,
			FullSymbol:  fmt.Sprintf("BYBIT:%s", inst.Symbol),
			Description: fmt.Sprintf("%s / %s (%s)", inst.BaseCoin, inst.QuoteCoin, inst.ContractType),
			Exchange:    "BYBIT",
			Type:        "crypto",
			PriceScale:  scale,
		})
	}

	if len(loaded) > 0 {
		b.cachedSymbols = loaded
		b.lastFetched = time.Now()
	}
}

