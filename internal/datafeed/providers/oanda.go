package providers

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ordercraft-hq/terminal/internal/datafeed"
)

// OandaProvider implements datafeed.DataProvider for OANDA REST v20 API
// and true real-time streaming via OANDA Pricing Stream.
type OandaProvider struct {
	accessToken     string
	accountID       string
	fallbackToken   string
	fallbackAccount string
	baseURL         string
	streamURL       string
	httpClient      *http.Client
	symbolsMu       sync.RWMutex
	cachedSymbols   []datafeed.SymbolInfo
	lastFetched     time.Time

	// Real-time pricing stream state
	streamMu            sync.Mutex
	activeSubs          map[string]map[uint64]func(c datafeed.Candle) // key: "SYMBOL::RESOLUTION"
	activeCandles       map[string]*datafeed.Candle                  // key: "SYMBOL::RESOLUTION"
	lastTickTime        map[string]time.Time                          // symbol -> last tick receive time
	activeStreamSymbols map[string]bool                               // symbols currently streaming
	pendingTeardowns    map[string]*time.Timer                        // symbol -> grace period teardown timer
	lastMidPrice        map[string]float64                            // symbol -> latest live mid price
	nextSubID           uint64
	streamCancel        context.CancelFunc
	notifyCh            chan struct{}
	isClosed            bool
	supervisorsStarted  bool
	cancelLoad          context.CancelFunc
}

// NewOandaProvider initializes the provider loading config from env and .env file.
func NewOandaProvider() *OandaProvider {
	loadDotEnv()

	token := os.Getenv("OANDA_ACCESS_TOKEN")
	accID := os.Getenv("OANDA_ACCOUNT_ID")
	fallbackToken := os.Getenv("OANDA_ACCESS_TOKEN_FALLBACK")
	fallbackAcc := os.Getenv("OANDA_ACCOUNT_ID_FALLBACK")

	baseURL := os.Getenv("OANDA_BASE_URL")
	if baseURL == "" {
		baseURL = "https://api-fxpractice.oanda.com"
	}

	streamURL := os.Getenv("OANDA_STREAM_URL")
	if streamURL == "" {
		streamURL = "https://stream-fxpractice.oanda.com"
	}

	op := &OandaProvider{
		accessToken:     token,
		accountID:       accID,
		fallbackToken:   fallbackToken,
		fallbackAccount: fallbackAcc,
		baseURL:         strings.TrimRight(baseURL, "/"),
		streamURL:       strings.TrimRight(streamURL, "/"),
		httpClient: &http.Client{
			Timeout: 12 * time.Second,
		},
		activeSubs:          make(map[string]map[uint64]func(c datafeed.Candle)),
		activeCandles:       make(map[string]*datafeed.Candle),
		lastTickTime:        make(map[string]time.Time),
		activeStreamSymbols: make(map[string]bool),
		pendingTeardowns:    make(map[string]*time.Timer),
		lastMidPrice:        make(map[string]float64),
		notifyCh:            make(chan struct{}, 1),
	}
	// Pre-load instruments and start supervisors only if configured
	if op.IsConfigured() {
		op.streamMu.Lock()
		op.supervisorsStarted = true
		ctx, cancel := context.WithCancel(context.Background())
		op.cancelLoad = cancel
		op.streamMu.Unlock()

		go op.loadInstruments(ctx)
		go op.streamSupervisor()
		go op.fallbackSupervisor()
	}
	return op
}

func loadDotEnv() {
	// Look for .env in current directory or parent
	paths := []string{".env", "../.env", "../../.env", "../../../.env"}
	for _, p := range paths {
		f, err := os.Open(p)
		if err != nil {
			continue
		}

		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				k := strings.TrimSpace(parts[0])
				v := strings.TrimSpace(parts[1])
				// Don't overwrite existing environment variables
				if os.Getenv(k) == "" {
					os.Setenv(k, v)
				}
			}
		}
		if err := scanner.Err(); err != nil {
			f.Close()
			continue
		}
		f.Close()
		break
	}
}

func (o *OandaProvider) Name() string {
	return "OANDA"
}

// IsConfigured returns true if a valid personal access token is configured.
func (o *OandaProvider) IsConfigured() bool {
	o.streamMu.Lock()
	defer o.streamMu.Unlock()
	token := o.accessToken
	return token != "" &&
		!strings.Contains(token, "your_") &&
		!strings.Contains(token, "placeholder")
}

// SetCredentials dynamically updates OANDA v20 access credentials and triggers instrument indexing.
func (o *OandaProvider) SetCredentials(accountID, token, environment string) {
	cleanAcc := strings.TrimSpace(accountID)
	cleanTok := strings.TrimSpace(token)
	env := strings.ToLower(strings.TrimSpace(environment))

	baseURL := "https://api-fxpractice.oanda.com"
	streamURL := "https://stream-fxpractice.oanda.com"
	if env == "live" {
		baseURL = "https://api-fxtrade.oanda.com"
		streamURL = "https://stream-fxtrade.oanda.com"
	} else if strings.HasPrefix(env, "http") {
		baseURL = env
	}

	configured := cleanTok != "" &&
		!strings.Contains(cleanTok, "your_") &&
		!strings.Contains(cleanTok, "placeholder")

	o.streamMu.Lock()
	if o.cancelLoad != nil {
		o.cancelLoad()
		o.cancelLoad = nil
	}
	o.accountID = cleanAcc
	o.accessToken = cleanTok
	o.baseURL = baseURL
	o.streamURL = streamURL

	var startSupervisors bool
	var loadCtx context.Context
	if configured {
		if !o.supervisorsStarted {
			o.supervisorsStarted = true
			startSupervisors = true
		}
		ctx, cancel := context.WithCancel(context.Background())
		o.cancelLoad = cancel
		loadCtx = ctx
	}
	o.streamMu.Unlock()

	if configured {
		if startSupervisors {
			go o.streamSupervisor()
			go o.fallbackSupervisor()
		}
		select {
		case o.notifyCh <- struct{}{}:
		default:
		}
		go o.loadInstruments(loadCtx)
	} else {
		o.symbolsMu.Lock()
		o.cachedSymbols = nil
		o.symbolsMu.Unlock()
	}
}

// RawCredentials returns current account ID, access token, and environment ("practice" or "live").
func (o *OandaProvider) RawCredentials() (accountID, token, env string) {
	o.streamMu.Lock()
	defer o.streamMu.Unlock()
	env = "practice"
	if strings.Contains(o.baseURL, "fxtrade") {
		env = "live"
	}
	return o.accountID, o.accessToken, env
}

// SupportedResolutions returns all 21 authentic granularities supported natively by the OANDA v20 API:
// S5, S10, S15, S30, M1, M2, M4, M5, M10, M15, M30, H1, H2, H3, H4, H6, H8, H12, D, W, M.
func (o *OandaProvider) SupportedResolutions() []string {
	return []string{
		"5s", "10s", "15s", "30s",
		"1m", "2m", "4m", "5m", "10m", "15m", "30m",
		"1h", "2h", "3h", "4h", "6h", "8h", "12h",
		"1d", "1w", "1M",
	}
}

// Normalize resolution to OANDA granularity
func normalizeOandaGranularity(res string) string {
	r := strings.TrimSpace(res)
	if r == "1M" || r == "M" {
		return "M"
	}
	upper := strings.ToUpper(r)
	switch upper {
	case "1S", "5S":
		return "S5"
	case "10S":
		return "S10"
	case "15S":
		return "S15"
	case "30S":
		return "S30"
	case "1", "1M", "1MIN":
		// lowercase 1m was converted to 1M by upper
		return "M1"
	case "2", "2M":
		return "M2"
	case "4", "4M":
		return "M4"
	case "5", "5M":
		return "M5"
	case "10", "10M":
		return "M10"
	case "15", "15M":
		return "M15"
	case "30", "30M":
		return "M30"
	case "60", "1H":
		return "H1"
	case "120", "2H":
		return "H2"
	case "180", "3H":
		return "H3"
	case "240", "4H":
		return "H4"
	case "360", "6H":
		return "H6"
	case "480", "8H":
		return "H8"
	case "720", "12H":
		return "H12"
	case "D", "1D":
		return "D"
	case "W", "1W":
		return "W"
	case "M", "MONTH", "1MON", "1MO", "1MONTH", "1MTH":
		return "M"
	default:
		return "M15"
	}
}

type oandaCandleResponse struct {
	Instrument  string `json:"instrument"`
	Granularity string `json:"granularity"`
	Candles     []struct {
		Complete bool   `json:"complete"`
		Volume   int64  `json:"volume"`
		Time     string `json:"time"`
		Mid      struct {
			O string `json:"o"`
			H string `json:"h"`
			L string `json:"l"`
			C string `json:"c"`
		} `json:"mid"`
	} `json:"candles"`
}

func (o *OandaProvider) GetHistory(
	ctx context.Context,
	symbol, resolution string,
	from, to int64,
	count int,
) ([]datafeed.Candle, error) {
	cleanSym := strings.TrimPrefix(symbol, "OANDA:")
	// OANDA uses underscores e.g. EUR_USD
	cleanSym = strings.ReplaceAll(cleanSym, "-", "_")
	cleanSym = strings.ReplaceAll(cleanSym, "/", "_")

	gran := normalizeOandaGranularity(resolution)
	if count <= 0 {
		count = 200
	}
	if count > 500 {
		count = 500
	}

	o.streamMu.Lock()
	mainTok := o.accessToken
	fbTok := o.fallbackToken
	baseURL := o.baseURL
	o.streamMu.Unlock()

	tokens := []string{mainTok}
	if fbTok != "" && fbTok != mainTok {
		tokens = append(tokens, fbTok)
	}

	var lastErr error
	for _, tok := range tokens {
		if tok == "" {
			continue
		}

		escapedSym := url.PathEscape(cleanSym)
		reqURL := fmt.Sprintf("%s/v3/instruments/%s/candles?granularity=%s&count=%d", baseURL, escapedSym, url.QueryEscape(gran), count)
		if from > 0 && to > 0 {
			reqURL = fmt.Sprintf(
				"%s/v3/instruments/%s/candles?granularity=%s&from=%s&to=%s",
				baseURL,
				escapedSym,
				url.QueryEscape(gran),
				url.QueryEscape(time.Unix(from, 0).UTC().Format(time.RFC3339Nano)),
				url.QueryEscape(time.Unix(to, 0).UTC().Format(time.RFC3339Nano)),
			)
		} else if to > 0 {
			reqURL = fmt.Sprintf(
				"%s/v3/instruments/%s/candles?granularity=%s&count=%d&to=%s",
				baseURL,
				escapedSym,
				url.QueryEscape(gran),
				count,
				url.QueryEscape(time.Unix(to, 0).UTC().Format(time.RFC3339Nano)),
			)
		} else if from > 0 {
			reqURL = fmt.Sprintf(
				"%s/v3/instruments/%s/candles?granularity=%s&count=%d&from=%s",
				baseURL,
				escapedSym,
				url.QueryEscape(gran),
				count,
				url.QueryEscape(time.Unix(from, 0).UTC().Format(time.RFC3339Nano)),
			)
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
		if err != nil {
			lastErr = err
			continue
		}
		req.Header.Set("Authorization", "Bearer "+tok)
		req.Header.Set("Content-Type", "application/json")

		resp, err := o.httpClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			lastErr = fmt.Errorf("oanda candles api returned status %d", resp.StatusCode)
			continue
		}

		var data oandaCandleResponse
		if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
			resp.Body.Close()
			lastErr = fmt.Errorf("failed to decode oanda candles response: %w", err)
			continue
		}
		resp.Body.Close()

		candles := make([]datafeed.Candle, 0, len(data.Candles))
		for _, c := range data.Candles {
			t, err := time.Parse(time.RFC3339Nano, c.Time)
			if err != nil {
				continue
			}

			open, _ := strconv.ParseFloat(c.Mid.O, 64)
			high, _ := strconv.ParseFloat(c.Mid.H, 64)
			low, _ := strconv.ParseFloat(c.Mid.L, 64)
			closePrice, _ := strconv.ParseFloat(c.Mid.C, 64)

			candles = append(candles, datafeed.Candle{
				Time:   t.Unix(),
				Open:   open,
				High:   high,
				Low:    low,
				Close:  closePrice,
				Volume: float64(c.Volume),
			})
		}

		return candles, nil
	}

	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("oanda access token not configured or authentication failed")
}

type oandaInstrumentsResponse struct {
	Instruments []struct {
		Name             string `json:"name"`
		Type             string `json:"type"`
		DisplayName      string `json:"displayName"`
		PipLocation      int    `json:"pipLocation"`
		DisplayPrecision int    `json:"displayPrecision"`
	} `json:"instruments"`
}

func (o *OandaProvider) loadInstruments(ctx context.Context) ([]datafeed.SymbolInfo, error) {
	if !o.IsConfigured() {
		return nil, nil
	}
	o.symbolsMu.RLock()
	if len(o.cachedSymbols) > 0 && time.Since(o.lastFetched) < 6*time.Hour {
		cached := o.cachedSymbols
		o.symbolsMu.RUnlock()
		return cached, nil
	}
	o.symbolsMu.RUnlock()

	o.streamMu.Lock()
	mainTok := o.accessToken
	fbTok := o.fallbackToken
	mainAcc := o.accountID
	fbAcc := o.fallbackAccount
	baseURL := o.baseURL
	o.streamMu.Unlock()

	tokens := []string{mainTok}
	if fbTok != "" && fbTok != mainTok {
		tokens = append(tokens, fbTok)
	}
	accounts := []string{mainAcc}
	if fbAcc != "" && fbAcc != mainAcc {
		accounts = append(accounts, fbAcc)
	}

	for i, tok := range tokens {
		if tok == "" {
			continue
		}
		acc := accounts[0]
		if i < len(accounts) && accounts[i] != "" {
			acc = accounts[i]
		}
		if acc == "" {
			continue
		}

		reqURL := fmt.Sprintf("%s/v3/accounts/%s/instruments", baseURL, url.PathEscape(acc))
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
		if err != nil {
			continue
		}
		req.Header.Set("Authorization", "Bearer "+tok)
		req.Header.Set("Content-Type", "application/json")

		resp, err := o.httpClient.Do(req)
		if err != nil {
			continue
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			continue
		}

		var data oandaInstrumentsResponse
		err = json.NewDecoder(resp.Body).Decode(&data)
		resp.Body.Close()
		if err != nil {
			continue
		}

		var symbols []datafeed.SymbolInfo
		for _, inst := range data.Instruments {
			sym := inst.Name
			disp := inst.DisplayName
			if disp == "" {
				disp = sym
			}

			itemType := "forex"
			switch {
			case strings.HasPrefix(sym, "NAS100") || strings.HasPrefix(sym, "SPX500") || strings.HasPrefix(sym, "US30") || strings.HasPrefix(sym, "DE30") || strings.HasPrefix(sym, "UK100") || strings.HasPrefix(sym, "JP225") || strings.HasPrefix(sym, "EU50") || strings.HasPrefix(sym, "SG30"):
				itemType = "index"
			case strings.HasPrefix(sym, "XAU") || strings.HasPrefix(sym, "XAG") || strings.HasPrefix(sym, "XPT") || strings.HasPrefix(sym, "XPD") || strings.HasPrefix(sym, "XCU"):
				itemType = "metals"
			case strings.HasPrefix(sym, "WTICO") || strings.HasPrefix(sym, "BCO") || strings.HasPrefix(sym, "NATGAS") || strings.HasPrefix(sym, "SOYBN") || strings.HasPrefix(sym, "CORN") || strings.HasPrefix(sym, "WHEAT"):
				itemType = "commodity"
			case strings.HasPrefix(sym, "USB") || strings.HasPrefix(sym, "US10Y") || strings.HasPrefix(sym, "DE10YB"):
				itemType = "bond"
			}

			scale := 100000
			if inst.DisplayPrecision > 0 && inst.DisplayPrecision <= 8 {
				scale = 1
				for p := 0; p < inst.DisplayPrecision; p++ {
					scale *= 10
				}
			}

			symbols = append(symbols, datafeed.SymbolInfo{
				Symbol:      sym,
				FullSymbol:  "OANDA:" + sym,
				Description: disp,
				Exchange:    "OANDA",
				Type:        itemType,
				PriceScale:  scale,
			})
		}

		if len(symbols) > 0 {
			if ctx.Err() != nil {
				return nil, ctx.Err()
			}
			o.symbolsMu.Lock()
			if ctx.Err() == nil {
				o.cachedSymbols = symbols
				o.lastFetched = time.Now()
			}
			o.symbolsMu.Unlock()
			return symbols, nil
		}
	}

	return nil, nil
}

func (o *OandaProvider) Search(ctx context.Context, query string) ([]datafeed.SymbolInfo, error) {
	if !o.IsConfigured() {
		return nil, nil
	}
	o.symbolsMu.RLock()
	symbols := o.cachedSymbols
	o.symbolsMu.RUnlock()

	if len(symbols) == 0 {
		var err error
		symbols, err = o.loadInstruments(ctx)
		if err != nil {
			return nil, err
		}
	}

	q := strings.ToUpper(strings.TrimSpace(query))
	cleanQ := strings.ReplaceAll(q, "OANDA:", "")
	cleanQ = strings.ReplaceAll(cleanQ, "/", "_")

	var results []datafeed.SymbolInfo
	for _, p := range symbols {
		if cleanQ == "" || strings.Contains(strings.ToUpper(p.Symbol), cleanQ) || strings.Contains(strings.ToUpper(p.Description), cleanQ) {
			results = append(results, p)
			if len(results) >= 100 {
				break
			}
		}
	}
	return results, nil
}

type oandaPriceStreamMessage struct {
	Type        string `json:"type"` // "PRICE" or "HEARTBEAT"
	Time        string `json:"time"`
	Instrument  string `json:"instrument"`
	Tradeable   bool   `json:"tradeable"`
	Status      string `json:"status"`
	Bids        []struct {
		Price     string `json:"price"`
		Liquidity int64  `json:"liquidity"`
	} `json:"bids"`
	Asks []struct {
		Price     string `json:"price"`
		Liquidity int64  `json:"liquidity"`
	} `json:"asks"`
	CloseoutBid string `json:"closeoutBid"`
	CloseoutAsk string `json:"closeoutAsk"`
}

type oandaCreds struct {
	token   string
	account string
}

// streamSupervisor maintains the persistent, multiplexed pricing stream from OANDA.
// Any incoming price tick is immediately dispatched with zero delay and zero capping.
func (o *OandaProvider) streamSupervisor() {
	backoff := 1 * time.Second

	for {
		o.streamMu.Lock()
		if o.isClosed {
			o.streamMu.Unlock()
			return
		}

		symMap := make(map[string]bool)
		for s := range o.activeStreamSymbols {
			symMap[s] = true
		}
		for key, subs := range o.activeSubs {
			if len(subs) > 0 {
				parts := strings.Split(key, "::")
				if len(parts) == 2 {
					symMap[parts[0]] = true
				}
			}
		}

		var symbols []string
		for s := range symMap {
			symbols = append(symbols, s)
			o.activeStreamSymbols[s] = true
		}
		o.streamMu.Unlock()

		if len(symbols) == 0 {
			select {
			case <-o.notifyCh:
			case <-time.After(3 * time.Second):
			}
			continue
		}

		sort.Strings(symbols)

		ctx, cancel := context.WithCancel(context.Background())
		o.streamMu.Lock()
		o.streamCancel = cancel
		o.streamMu.Unlock()

		err := o.connectAndReadStream(ctx, symbols)
		cancel()

		o.streamMu.Lock()
		if o.isClosed {
			o.streamMu.Unlock()
			return
		}
		o.streamMu.Unlock()

		if err != nil && ctx.Err() == nil {
			log.Printf("[OANDA Stream] Stream disconnected: %v. Reconnecting in %v...", err, backoff)
			time.Sleep(backoff)
			if backoff < 8*time.Second {
				backoff *= 2
			}
		} else {
			backoff = 1 * time.Second
		}
	}
}

func (o *OandaProvider) connectAndReadStream(ctx context.Context, symbols []string) error {
	o.streamMu.Lock()
	fbTok := o.fallbackToken
	fbAcc := o.fallbackAccount
	mainTok := o.accessToken
	mainAcc := o.accountID
	streamURL := o.streamURL
	o.streamMu.Unlock()

	var credsList []oandaCreds
	if fbTok != "" && fbAcc != "" {
		credsList = append(credsList, oandaCreds{fbTok, fbAcc})
	}
	if mainTok != "" && mainAcc != "" {
		credsList = append(credsList, oandaCreds{mainTok, mainAcc})
	}

	if len(credsList) == 0 {
		return fmt.Errorf("no OANDA credentials configured")
	}

	instrumentsParam := strings.Join(symbols, ",")

	var activeResp *http.Response
	var activeCred oandaCreds

	for _, cred := range credsList {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		endpoint := fmt.Sprintf("%s/v3/accounts/%s/pricing/stream?instruments=%s", streamURL, url.PathEscape(cred.account), url.QueryEscape(instrumentsParam))
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			continue
		}
		req.Header.Set("Authorization", "Bearer "+cred.token)

		streamClient := &http.Client{
			Transport: &http.Transport{
				ResponseHeaderTimeout: 3 * time.Second,
			},
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				req.Header.Set("Authorization", "Bearer "+cred.token)
				return nil
			},
			Timeout: 0, // continuous persistent stream
		}

		resp, err := streamClient.Do(req)
		if err != nil {
			continue
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			continue
		}

		activeResp = resp
		activeCred = cred
		break
	}

	if activeResp == nil {
		return fmt.Errorf("failed to connect to OANDA pricing stream on all credentials for [%s]", instrumentsParam)
	}
	defer activeResp.Body.Close()

	log.Printf("[OANDA Stream] Connected to live pricing stream for [%s] on account %s", instrumentsParam, activeCred.account)

	scanner := bufio.NewScanner(activeResp.Body)
	buf := make([]byte, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	for scanner.Scan() {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var msg oandaPriceStreamMessage
		if err := json.Unmarshal(line, &msg); err != nil {
			continue
		}

		if msg.Type != "PRICE" || msg.Instrument == "" {
			continue
		}

		var bidPrice, askPrice float64
		if len(msg.Bids) > 0 {
			bidPrice, _ = strconv.ParseFloat(msg.Bids[0].Price, 64)
		} else if msg.CloseoutBid != "" {
			bidPrice, _ = strconv.ParseFloat(msg.CloseoutBid, 64)
		}
		if len(msg.Asks) > 0 {
			askPrice, _ = strconv.ParseFloat(msg.Asks[0].Price, 64)
		} else if msg.CloseoutAsk != "" {
			askPrice, _ = strconv.ParseFloat(msg.CloseoutAsk, 64)
		}

		var midPrice float64
		if bidPrice > 0 && askPrice > 0 {
			midPrice = (bidPrice + askPrice) / 2.0
		} else if bidPrice > 0 {
			midPrice = bidPrice
		} else {
			midPrice = askPrice
		}

		if midPrice <= 0 {
			continue
		}

		t, err := time.Parse(time.RFC3339Nano, msg.Time)
		if err != nil {
			t = time.Now()
		}
		tickSec := t.Unix()

		sym := strings.ToUpper(strings.TrimSpace(msg.Instrument))

		o.streamMu.Lock()
		o.lastTickTime[sym] = time.Now()
		o.lastMidPrice[sym] = midPrice

		type dispatchTarget struct {
			cb     func(c datafeed.Candle)
			candle datafeed.Candle
		}
		var dispatches []dispatchTarget

		for subKey, listeners := range o.activeSubs {
			if strings.HasPrefix(subKey, sym+"::") {
				parts := strings.Split(subKey, "::")
				res := parts[1]
				stepSec := int64(datafeed.ResolutionToSeconds(res))
				if stepSec <= 0 {
					stepSec = 60
				}
				bucketTime := (tickSec / stepSec) * stepSec

				bar, exists := o.activeCandles[subKey]
				if !exists || bucketTime > bar.Time {
					bar = &datafeed.Candle{
						Time:   bucketTime,
						Open:   midPrice,
						High:   midPrice,
						Low:    midPrice,
						Close:  midPrice,
						Volume: 1,
					}
					o.activeCandles[subKey] = bar
				} else {
					if midPrice > bar.High {
						bar.High = midPrice
					}
					if midPrice < bar.Low || bar.Low == 0 {
						bar.Low = midPrice
					}
					bar.Close = midPrice
					bar.Volume += 1
				}

				candleCopy := *bar
				for _, cb := range listeners {
					dispatches = append(dispatches, dispatchTarget{cb: cb, candle: candleCopy})
				}
			}
		}
		o.streamMu.Unlock()

		// Immediate synchronous dispatch of raw tick
		for _, d := range dispatches {
			d.cb(d.candle)
		}
	}

	return scanner.Err()
}

// fallbackSupervisor ensures continuous sub-second live updates.
// When the real-time pricing stream is active, it stays completely idle.
// If stream ticks are not flowing for a symbol (>800ms) or for instruments not enabled on stream,
// it queries the authentic in-progress candle directly with change detection.
func (o *OandaProvider) fallbackSupervisor() {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	type barState struct {
		time   int64
		open   float64
		high   float64
		low    float64
		close  float64
		volume float64
	}

	lastBars := make(map[string]barState)
	lastPollTime := make(map[string]time.Time)
	inFlight := make(map[string]bool)
	var stateMu sync.Mutex

	for {
		<-ticker.C

		o.streamMu.Lock()
		if o.isClosed {
			o.streamMu.Unlock()
			return
		}

		now := time.Now()
		var targets []struct {
			key string
			sym string
			res string
			cbs []func(c datafeed.Candle)
		}

		for key, listeners := range o.activeSubs {
			if len(listeners) == 0 {
				continue
			}
			parts := strings.Split(key, "::")
			if len(parts) != 2 {
				continue
			}
			sym := parts[0]
			res := parts[1]

			// Synchronize authentic candle volume and state periodically from REST (every ~1.2s)
			// or immediately if no live stream ticks have arrived in the last 800ms
			lastPoll := lastPollTime[key]
			needsPoll := now.Sub(o.lastTickTime[sym]) > 800*time.Millisecond || now.Sub(lastPoll) >= 1200*time.Millisecond
			if needsPoll {
				lastPollTime[key] = now
				var cbList []func(c datafeed.Candle)
				for _, cb := range listeners {
					cbList = append(cbList, cb)
				}
				targets = append(targets, struct {
					key string
					sym string
					res string
					cbs []func(c datafeed.Candle)
				}{
					key: key,
					sym: sym,
					res: res,
					cbs: cbList,
				})
			}
		}
		o.streamMu.Unlock()

		for _, target := range targets {
			stateMu.Lock()
			if inFlight[target.key] {
				stateMu.Unlock()
				continue
			}
			inFlight[target.key] = true
			stateMu.Unlock()

			go func(t struct {
				key string
				sym string
				res string
				cbs []func(c datafeed.Candle)
			}) {
				defer func() {
					stateMu.Lock()
					delete(inFlight, t.key)
					stateMu.Unlock()
				}()

				ctx, cancel := context.WithTimeout(context.Background(), 800*time.Millisecond)
				defer cancel()

				candles, err := o.GetHistory(ctx, t.sym, t.res, 0, 0, 2)
				if err != nil || len(candles) == 0 {
					return
				}

				latest := candles[len(candles)-1]

				// Synchronize authentic volume into shared activeCandles
				o.streamMu.Lock()
				currentBar, hasCurrent := o.activeCandles[t.key]
				if hasCurrent && currentBar.Time == latest.Time {
					if latest.Volume > currentBar.Volume {
						currentBar.Volume = latest.Volume
					}
					if latest.High > currentBar.High {
						currentBar.High = latest.High
					}
					if latest.Low < currentBar.Low && latest.Low > 0 {
						currentBar.Low = latest.Low
					}
					latest.Volume = currentBar.Volume
				} else if !hasCurrent || latest.Time > currentBar.Time {
					o.activeCandles[t.key] = &latest
				}
				o.streamMu.Unlock()

				stateMu.Lock()
				last, hasLast := lastBars[t.key]
				stateMu.Unlock()

				// If nothing changed in the candle OHLCV, skip duplicate broadcast
				if hasLast &&
					latest.Time == last.time &&
					latest.Open == last.open &&
					latest.High == last.high &&
					latest.Low == last.low &&
					latest.Close == last.close &&
					latest.Volume == last.volume {
					return
				}

				// If a new candle opened and we have the previous bar, dispatch the finalized previous bar first
				if hasLast && latest.Time > last.time && len(candles) >= 2 {
					prev := candles[len(candles)-2]
					for _, cb := range t.cbs {
						cb(prev)
					}
				}

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

func (o *OandaProvider) Subscribe(ctx context.Context, symbol, resolution string, onCandle func(c datafeed.Candle)) error {
	cleanSym := strings.TrimPrefix(symbol, "OANDA:")
	cleanSym = strings.ReplaceAll(cleanSym, "-", "_")
	cleanSym = strings.ReplaceAll(cleanSym, "/", "_")
	cleanSym = strings.ToUpper(strings.TrimSpace(cleanSym))

	subKey := fmt.Sprintf("%s::%s", cleanSym, strings.ToLower(resolution))

	o.streamMu.Lock()
	o.nextSubID++
	subID := o.nextSubID

	// Cancel any pending teardown timer for this symbol (e.g. from switching timeframe)
	if timer, ok := o.pendingTeardowns[cleanSym]; ok {
		timer.Stop()
		delete(o.pendingTeardowns, cleanSym)
	}

	listeners, exists := o.activeSubs[subKey]
	if !exists {
		listeners = make(map[uint64]func(c datafeed.Candle))
		o.activeSubs[subKey] = listeners
	}
	listeners[subID] = onCandle

	// Check if this symbol is already streaming
	isAlreadyStreaming := o.activeStreamSymbols[cleanSym]
	if !isAlreadyStreaming {
		o.activeStreamSymbols[cleanSym] = true
	}

	// If we already have an active candle with authentic volume, emit it
	if bar, exists := o.activeCandles[subKey]; exists && bar != nil {
		onCandle(*bar)
	}
	o.streamMu.Unlock()

	// Initial fetch to seed authentic historical bar from REST
	go func() {
		initCtx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		defer cancel()
		candles, err := o.GetHistory(initCtx, cleanSym, resolution, 0, 0, 2)
		if err == nil && len(candles) > 0 {
			latest := candles[len(candles)-1]
			o.streamMu.Lock()
			currentBar, hasCurrent := o.activeCandles[subKey]
			if !hasCurrent || latest.Time > currentBar.Time {
				o.activeCandles[subKey] = &latest
			} else if latest.Time == currentBar.Time {
				if latest.High > currentBar.High {
					currentBar.High = latest.High
				}
				if latest.Low < currentBar.Low && latest.Low > 0 {
					currentBar.Low = latest.Low
				}
				if latest.Volume > currentBar.Volume {
					currentBar.Volume = latest.Volume
				}
			}
			o.streamMu.Unlock()
			for _, c := range candles {
				onCandle(c)
			}
		}
	}()

	// Only if this symbol was not already streaming, restart stream supervisor to include the new instrument
	if !isAlreadyStreaming {
		o.streamMu.Lock()
		if o.streamCancel != nil {
			o.streamCancel()
		}
		o.streamMu.Unlock()
	}

	select {
	case o.notifyCh <- struct{}{}:
	default:
	}

	return nil
}

func (o *OandaProvider) Unsubscribe(symbol, resolution string) error {
	cleanSym := strings.TrimPrefix(symbol, "OANDA:")
	cleanSym = strings.ReplaceAll(cleanSym, "-", "_")
	cleanSym = strings.ReplaceAll(cleanSym, "/", "_")
	cleanSym = strings.ToUpper(strings.TrimSpace(cleanSym))

	subKey := fmt.Sprintf("%s::%s", cleanSym, strings.ToLower(resolution))

	o.streamMu.Lock()
	delete(o.activeSubs, subKey)
	delete(o.activeCandles, subKey)

	// Check if symbol has any other active resolutions
	hasMore := false
	for k := range o.activeSubs {
		if strings.HasPrefix(k, cleanSym+"::") {
			hasMore = true
			break
		}
	}

	if !hasMore {
		// Do not immediately cancel the stream!
		// Switching timeframes (e.g. 30s -> 1m) invokes Unsubscribe followed by Subscribe within 100ms.
		// Use a 5-second grace period before tearing down the stream for this instrument.
		if t, ok := o.pendingTeardowns[cleanSym]; ok {
			t.Stop()
		}
		o.pendingTeardowns[cleanSym] = time.AfterFunc(5*time.Second, func() {
			o.streamMu.Lock()
			defer o.streamMu.Unlock()
			delete(o.pendingTeardowns, cleanSym)

			// Re-verify if any resolution was added for cleanSym during the grace period
			stillHasMore := false
			for k := range o.activeSubs {
				if strings.HasPrefix(k, cleanSym+"::") {
					stillHasMore = true
					break
				}
			}

			if !stillHasMore {
				delete(o.activeStreamSymbols, cleanSym)
				if o.streamCancel != nil {
					o.streamCancel()
				}
			}
		})
	}
	o.streamMu.Unlock()

	return nil
}

// Close gracefully terminates all stream connections.
func (o *OandaProvider) Close() error {
	o.streamMu.Lock()
	defer o.streamMu.Unlock()
	o.isClosed = true
	for _, t := range o.pendingTeardowns {
		t.Stop()
	}
	o.pendingTeardowns = make(map[string]*time.Timer)
	if o.streamCancel != nil {
		o.streamCancel()
	}
	return nil
}
