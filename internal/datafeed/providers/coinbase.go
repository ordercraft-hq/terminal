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

// CoinbaseProvider implements datafeed.DataProvider for Coinbase Exchange / Advanced public market data.
type CoinbaseProvider struct {
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

// NewCoinbaseProvider creates and initializes a Coinbase market data provider.
func NewCoinbaseProvider() *CoinbaseProvider {
	cp := &CoinbaseProvider{
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
		baseURL: "https://api.exchange.coinbase.com",
		wsURL:   "wss://ws-feed.exchange.coinbase.com",
		subs:    make(map[string]context.CancelFunc),
	}
	// Seed common popular symbols immediately for instant responsiveness
	cp.seedDefaultSymbols()
	// Asynchronously load full instruments from Coinbase Exchange
	ctx, cancel := context.WithCancel(context.Background())
	cp.cancelLoad = cancel
	go cp.loadInstruments(ctx)
	return cp
}

// BaseURL returns the configured base URL safely under mutex.
func (c *CoinbaseProvider) BaseURL() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.baseURL
}

// SetBaseURL dynamically updates the REST base URL and cancels in-flight instrument indexing.
func (c *CoinbaseProvider) SetBaseURL(url string) {
	c.mu.Lock()
	if c.cancelLoad != nil {
		c.cancelLoad()
		c.cancelLoad = nil
	}
	c.baseURL = url
	c.mu.Unlock()
}

func (c *CoinbaseProvider) Name() string {
	return "COINBASE"
}

// SupportedResolutions returns the native candlestick granularities supported by Coinbase Exchange.
func (c *CoinbaseProvider) SupportedResolutions() []string {
	return []string{
		"1m", "5m", "15m",
		"1h", "6h", "1d",
	}
}

// normalizeCoinbaseProduct ensures symbols are formatted as "BASE-QUOTE" (e.g. "BTC-USD").
func normalizeCoinbaseProduct(rawSymbol string) string {
	clean := rawSymbol
	if parts := strings.Split(rawSymbol, ":"); len(parts) == 2 {
		clean = parts[1]
	}
	clean = strings.ToUpper(strings.TrimSpace(clean))

	// If already hyphenated, e.g. "BTC-USD"
	if strings.Contains(clean, "-") {
		return clean
	}

	// Try splitting known quote currencies
	quotes := []string{"USDT", "USDC", "USD", "EUR", "GBP", "BTC", "ETH", "CAD", "JPY"}
	for _, q := range quotes {
		if strings.HasSuffix(clean, q) && len(clean) > len(q) {
			base := strings.TrimSuffix(clean, q)
			return fmt.Sprintf("%s-%s", base, q)
		}
	}

	return clean
}

// granularityForResolution maps a resolution to Coinbase seconds granularity.
// Returns (granularitySec, requiresAggregation, baseGranularitySec).
func granularityForResolution(res string) (int64, bool, int64) {
	clean := strings.TrimSpace(res)
	upper := strings.ToUpper(clean)

	switch upper {
	case "1", "1M":
		return 60, false, 60
	case "5", "5M":
		return 300, false, 300
	case "15", "15M":
		return 900, false, 900
	case "60", "1H":
		return 3600, false, 3600
	case "360", "6H":
		return 21600, false, 21600
	case "D", "1D":
		return 86400, false, 86400
	}

	// For resolutions not natively supported by Coinbase, aggregate from base
	targetSec := datafeed.ResolutionToSeconds(res)
	if targetSec < 60 {
		return 60, false, 60
	}
	if targetSec < 3600 {
		return targetSec, true, 60
	}
	if targetSec < 86400 {
		return targetSec, true, 3600
	}
	return targetSec, true, 86400
}

// GetHistory fetches historical OHLCV candles from Coinbase Exchange REST API.
func (c *CoinbaseProvider) GetHistory(ctx context.Context, symbol, resolution string, from, to int64, count int) ([]datafeed.Candle, error) {
	productID := normalizeCoinbaseProduct(symbol)
	targetSec, needAgg, baseGranularity := granularityForResolution(resolution)

	if count <= 0 {
		count = 300
	}
	if count > 500 {
		count = 500
	}

	now := time.Now().UTC().Unix()
	if to <= 0 || to > now {
		to = now
	}

	reqGranularity := baseGranularity
	if !needAgg {
		reqGranularity = targetSec
	}

	if from <= 0 {
		from = to - (int64(count) * targetSec)
	}

	endpoint := fmt.Sprintf("%s/products/%s/candles", c.BaseURL(), url.PathEscape(productID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("coinbase new request: %w", err)
	}

	q := req.URL.Query()
	q.Set("granularity", strconv.FormatInt(reqGranularity, 10))
	q.Set("start", time.Unix(from, 0).UTC().Format(time.RFC3339))
	q.Set("end", time.Unix(to, 0).UTC().Format(time.RFC3339))
	req.URL.RawQuery = q.Encode()

	// Coinbase requires User-Agent header
	req.Header.Set("User-Agent", "OrderCraft/1.0 (Financial Workstation)")
	req.Header.Set("Accept", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("coinbase http get: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("coinbase unexpected status code: %d", resp.StatusCode)
	}

	// Coinbase candles schema:
	// [[time, low, high, open, close, volume], ...]
	var rawCandles [][]float64
	if err := json.NewDecoder(resp.Body).Decode(&rawCandles); err != nil {
		return nil, fmt.Errorf("coinbase json decode: %w", err)
	}

	if len(rawCandles) == 0 {
		return []datafeed.Candle{}, nil
	}

	// Coinbase returns newest first. Reverse to chronological order (oldest -> newest).
	candles := make([]datafeed.Candle, 0, len(rawCandles))
	for i := len(rawCandles) - 1; i >= 0; i-- {
		row := rawCandles[i]
		if len(row) < 6 {
			continue
		}

		tSec := int64(row[0])
		low := row[1]
		high := row[2]
		open := row[3]
		closePrice := row[4]
		volume := row[5]

		candles = append(candles, datafeed.Candle{
			Time:   tSec,
			Open:   open,
			High:   high,
			Low:    low,
			Close:  closePrice,
			Volume: volume,
		})
	}

	if needAgg {
		candles = datafeed.AggregateCandles(candles, targetSec)
	}

	if len(candles) > count {
		candles = candles[len(candles)-count:]
	}

	return candles, nil
}

// Search queries cached Coinbase instruments.
func (c *CoinbaseProvider) Search(ctx context.Context, query string) ([]datafeed.SymbolInfo, error) {
	c.symbolsMu.RLock()
	defer c.symbolsMu.RUnlock()

	q := strings.ToUpper(strings.TrimSpace(query))
	if q == "" {
		if len(c.cachedSymbols) > 50 {
			return c.cachedSymbols[:50], nil
		}
		return c.cachedSymbols, nil
	}

	var results []datafeed.SymbolInfo
	for _, sym := range c.cachedSymbols {
		if strings.Contains(strings.ToUpper(sym.Symbol), q) ||
			strings.Contains(strings.ToUpper(sym.Description), q) ||
			strings.Contains(strings.ToUpper(sym.FullSymbol), q) {
			results = append(results, sym)
			if len(results) >= 50 {
				break
			}
		}
	}
	return results, nil
}

// Subscribe opens a WebSocket stream for live Coinbase ticker data.
func (c *CoinbaseProvider) Subscribe(ctx context.Context, symbol, resolution string, onCandle func(c datafeed.Candle)) error {
	productID := normalizeCoinbaseProduct(symbol)
	subKey := fmt.Sprintf("%s@%s", productID, resolution)

	c.mu.Lock()
	if _, exists := c.subs[subKey]; exists {
		c.mu.Unlock()
		return nil
	}
	subCtx, cancel := context.WithCancel(ctx)
	c.subs[subKey] = cancel
	c.mu.Unlock()

	stepSec := datafeed.ResolutionToSeconds(resolution)
	go c.runWebSocketLoop(subCtx, productID, stepSec, onCandle)
	return nil
}

// Unsubscribe cancels a live ticker subscription.
func (c *CoinbaseProvider) Unsubscribe(symbol, resolution string) error {
	productID := normalizeCoinbaseProduct(symbol)
	subKey := fmt.Sprintf("%s@%s", productID, resolution)

	c.mu.Lock()
	defer c.mu.Unlock()
	if cancel, ok := c.subs[subKey]; ok {
		cancel()
		delete(c.subs, subKey)
	}
	return nil
}

func (c *CoinbaseProvider) runWebSocketLoop(ctx context.Context, productID string, stepSec int64, onCandle func(c datafeed.Candle)) {
	wsURL := c.wsURL

	backoff := 1 * time.Second
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		dialOpts := &websocket.DialOptions{
			HTTPHeader: http.Header{
				"User-Agent": []string{"OrderCraft/1.0"},
			},
		}

		conn, _, err := websocket.Dial(ctx, wsURL, dialOpts)
		if err != nil {
			log.Printf("[Coinbase WS] Dial error: %v. Retrying in %v...", err, backoff)
			select {
			case <-time.After(backoff):
				backoff = min(backoff*2, 30*time.Second)
				continue
			case <-ctx.Done():
				return
			}
		}
		backoff = 1 * time.Second

		// Subscribe to Coinbase ticker channel
		subMsg := map[string]interface{}{
			"type":        "subscribe",
			"product_ids": []string{productID},
			"channels":    []string{"ticker"},
		}
		if err := wsjson.Write(ctx, conn, subMsg); err != nil {
			conn.Close(websocket.StatusInternalError, "write subscribe failed")
			continue
		}

		type coinbaseTickerMsg struct {
			Type      string `json:"type"`
			ProductID string `json:"product_id"`
			Price     string `json:"price"`
			Time      string `json:"time"`
			LastSize  string `json:"last_size"`
			Volume24h string `json:"volume_24h"`
		}

		var curCandle *datafeed.Candle
		var curCandleMu sync.Mutex
		var lastEmitTime time.Time

		readErrCh := make(chan error, 1)
		go func() {
			for {
				var msg coinbaseTickerMsg
				if err := wsjson.Read(ctx, conn, &msg); err != nil {
					readErrCh <- err
					return
				}

				if msg.Type != "ticker" || msg.ProductID != productID || msg.Price == "" {
					continue
				}

				price, err := strconv.ParseFloat(msg.Price, 64)
				if err != nil {
					continue
				}

				tradeTime := time.Now().UTC()
				if msg.Time != "" {
					if parsed, err := time.Parse(time.RFC3339Nano, msg.Time); err == nil {
						tradeTime = parsed.UTC()
					}
				}

				bucket := (tradeTime.Unix() / stepSec) * stepSec
				var tickVol float64
				if msg.LastSize != "" {
					tickVol, _ = strconv.ParseFloat(msg.LastSize, 64)
				}

				curCandleMu.Lock()
				if curCandle == nil || curCandle.Time != bucket {
					curCandle = &datafeed.Candle{
						Time:   bucket,
						Open:   price,
						High:   price,
						Low:    price,
						Close:  price,
						Volume: tickVol,
					}
				} else {
					if price > curCandle.High {
						curCandle.High = price
					}
					if price < curCandle.Low {
						curCandle.Low = price
					}
					curCandle.Close = price
					curCandle.Volume += tickVol
				}
				now := time.Now()
				// Throttle live ticker emission to at most once per 50ms (20Hz) to prevent socket flooding
				if curCandle.Time != bucket || now.Sub(lastEmitTime) >= 50*time.Millisecond {
					lastEmitTime = now
					candleCopy := *curCandle
					curCandleMu.Unlock()
					onCandle(candleCopy)
				} else {
					curCandleMu.Unlock()
				}
			}
		}()

		select {
		case <-ctx.Done():
			conn.Close(websocket.StatusNormalClosure, "unsubscribed")
			return
		case <-readErrCh:
			conn.Close(websocket.StatusAbnormalClosure, "read error")
			time.Sleep(500 * time.Millisecond)
		}
	}
}

// loadInstruments fetches online products from Coinbase Exchange API.
func (c *CoinbaseProvider) loadInstruments(ctx context.Context) {
	endpoint := fmt.Sprintf("%s/products", c.BaseURL())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return
	}
	req.Header.Set("User-Agent", "OrderCraft/1.0")

	resp, err := c.client.Do(req)
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

	type cbProduct struct {
		ID            string `json:"id"`
		BaseCurrency  string `json:"base_currency"`
		QuoteCurrency string `json:"quote_currency"`
		DisplayName   string `json:"display_name"`
		Status        string `json:"status"`
	}

	var products []cbProduct
	if err := json.NewDecoder(resp.Body).Decode(&products); err != nil {
		return
	}

	var symbols []datafeed.SymbolInfo
	for _, p := range products {
		if p.Status != "online" && p.Status != "" {
			continue
		}

		desc := fmt.Sprintf("%s / %s (Coinbase)", p.BaseCurrency, p.QuoteCurrency)
		if p.DisplayName != "" {
			desc = fmt.Sprintf("%s (Coinbase)", p.DisplayName)
		}

		symbols = append(symbols, datafeed.SymbolInfo{
			Symbol:      p.ID,
			FullSymbol:  fmt.Sprintf("COINBASE:%s", p.ID),
			Description: desc,
			Exchange:    "COINBASE",
			Type:        "crypto",
			PriceScale:  100,
		})
	}

	if len(symbols) > 0 {
		if ctx.Err() != nil {
			return
		}
		c.symbolsMu.Lock()
		if ctx.Err() == nil {
			c.cachedSymbols = symbols
			c.lastFetched = time.Now()
		}
		c.symbolsMu.Unlock()
	}
}

// seedDefaultSymbols populates top liquid crypto instruments for instantaneous startup.
func (c *CoinbaseProvider) seedDefaultSymbols() {
	defaults := []struct {
		sym  string
		desc string
	}{
		{"BTC-USD", "Bitcoin / US Dollar (Coinbase)"},
		{"ETH-USD", "Ethereum / US Dollar (Coinbase)"},
		{"SOL-USD", "Solana / US Dollar (Coinbase)"},
		{"XRP-USD", "XRP / US Dollar (Coinbase)"},
		{"DOGE-USD", "Dogecoin / US Dollar (Coinbase)"},
		{"ADA-USD", "Cardano / US Dollar (Coinbase)"},
		{"AVAX-USD", "Avalanche / US Dollar (Coinbase)"},
		{"LINK-USD", "Chainlink / US Dollar (Coinbase)"},
		{"DOT-USD", "Polkadot / US Dollar (Coinbase)"},
		{"NEAR-USD", "NEAR Protocol / US Dollar (Coinbase)"},
		{"SUI-USD", "Sui / US Dollar (Coinbase)"},
		{"PEPE-USD", "Pepe / US Dollar (Coinbase)"},
		{"SHIB-USD", "Shiba Inu / US Dollar (Coinbase)"},
		{"LTC-USD", "Litecoin / US Dollar (Coinbase)"},
		{"BCH-USD", "Bitcoin Cash / US Dollar (Coinbase)"},
		{"BTC-USDT", "Bitcoin / Tether USD (Coinbase)"},
		{"ETH-USDT", "Ethereum / Tether USD (Coinbase)"},
		{"SOL-USDT", "Solana / Tether USD (Coinbase)"},
		{"BTC-EUR", "Bitcoin / Euro (Coinbase)"},
		{"ETH-EUR", "Ethereum / Euro (Coinbase)"},
	}

	var symbols []datafeed.SymbolInfo
	for _, d := range defaults {
		symbols = append(symbols, datafeed.SymbolInfo{
			Symbol:      d.sym,
			FullSymbol:  fmt.Sprintf("COINBASE:%s", d.sym),
			Description: d.desc,
			Exchange:    "COINBASE",
			Type:        "crypto",
			PriceScale:  100,
		})
	}

	c.symbolsMu.Lock()
	c.cachedSymbols = symbols
	c.symbolsMu.Unlock()
}
