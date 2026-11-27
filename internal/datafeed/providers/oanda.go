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
	streamClient    *http.Client
	symbolsMu       sync.RWMutex
	cachedSymbols   []datafeed.SymbolInfo
	lastFetched     time.Time

	// Real-time pricing stream state
	streamMu             sync.Mutex
	activeSubs           map[string]map[uint64]func(c datafeed.Candle) // key: "SYMBOL::RESOLUTION"
	activeCandles        map[string]*datafeed.Candle                  // key: "SYMBOL::RESOLUTION"
	lastTickTime         map[string]time.Time                         // symbol -> last tick receive time
	activeStreamSymbols  map[string]bool                              // symbols desired on stream
	currentStreamSymbols map[string]bool                              // symbols on currently open stream
	pendingTeardowns     map[string]*time.Timer                      // symbol -> grace period teardown timer
	restartTimer         *time.Timer
	lastMidPrice         map[string]float64 // symbol -> latest live mid price
	nextSubID            uint64
	streamCancel         context.CancelFunc
	notifyCh             chan struct{}
	stopCh               chan struct{}
	isClosed             bool
	supervisorsStarted   bool
	cancelLoad           context.CancelFunc
}

// NewOandaProvider initializes the provider loading config from env and .env file.
func NewOandaProvider() *OandaProvider {
	datafeed.LoadDotEnv()

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

	streamTransport := datafeed.SharedHTTPTransport.Clone()
	streamTransport.ResponseHeaderTimeout = 3 * time.Second

	op := &OandaProvider{
		accessToken:     token,
		accountID:       accID,
		fallbackToken:   fallbackToken,
		fallbackAccount: fallbackAcc,
		baseURL:         strings.TrimRight(baseURL, "/"),
		streamURL:       strings.TrimRight(streamURL, "/"),
		httpClient:      datafeed.NewHTTPClient(12 * time.Second),
		streamClient: &http.Client{
			Transport: streamTransport,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) > 0 {
					if auth := via[0].Header.Get("Authorization"); auth != "" {
						req.Header.Set("Authorization", auth)
					}
				}
				return nil
			},
			Timeout: 0, // continuous persistent stream
		},
		activeSubs:           make(map[string]map[uint64]func(c datafeed.Candle)),
		activeCandles:        make(map[string]*datafeed.Candle),
		lastTickTime:         make(map[string]time.Time),
		activeStreamSymbols:  make(map[string]bool),
		currentStreamSymbols: make(map[string]bool),
		pendingTeardowns:     make(map[string]*time.Timer),
		lastMidPrice:         make(map[string]float64),
		notifyCh:             make(chan struct{}, 1),
		stopCh:               make(chan struct{}),
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

// openStreamBar opens a new real-time OANDA stream candle from the incoming live quote,
// preserving any natural inter-bar market gap between bars.
func openStreamBar(bucketTime int64, midPrice float64) datafeed.Candle {
	return datafeed.Candle{
		Time:   bucketTime,
		Open:   midPrice,
		High:   midPrice,
		Low:    midPrice,
		Close:  midPrice,
		Volume: 1,
	}
}

// reconcileActiveBar merges authoritative REST candle bounds and Open into an
// active streaming candle (mutating currentBar in place when it matches Time)
// and returns the reconciled snapshot.
func reconcileActiveBar(currentBar *datafeed.Candle, latest datafeed.Candle, hasFreshTicks bool) datafeed.Candle {
	if currentBar == nil || latest.Time > currentBar.Time {
		return latest
	}
	if latest.Time < currentBar.Time {
		return *currentBar
	}
	if latest.Open > 0 {
		currentBar.Open = latest.Open
	}
	if latest.High > currentBar.High {
		currentBar.High = latest.High
	}
	if currentBar.Open > currentBar.High {
		currentBar.High = currentBar.Open
	}
	if latest.Low > 0 && (currentBar.Low == 0 || latest.Low < currentBar.Low) {
		currentBar.Low = latest.Low
	}
	if currentBar.Open > 0 && (currentBar.Low == 0 || currentBar.Open < currentBar.Low) {
		currentBar.Low = currentBar.Open
	}
	if latest.Volume > currentBar.Volume {
		currentBar.Volume = latest.Volume
	}
	if !hasFreshTicks && latest.Close > 0 {
		currentBar.Close = latest.Close
	}
	return *currentBar
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
		currentSet := make(map[string]bool, len(symMap))
		for s := range symMap {
			symbols = append(symbols, s)
			o.activeStreamSymbols[s] = true
			currentSet[s] = true
		}
		o.streamMu.Unlock()

		if len(symbols) == 0 {
			o.streamMu.Lock()
			o.currentStreamSymbols = make(map[string]bool)
			o.streamMu.Unlock()
			select {
			case <-o.stopCh:
				return
			case <-o.notifyCh:
			case <-time.After(3 * time.Second):
			}
			continue
		}

		sort.Strings(symbols)

		ctx, cancel := context.WithCancel(context.Background())
		o.streamMu.Lock()
		o.streamCancel = cancel
		o.currentStreamSymbols = currentSet
		o.streamMu.Unlock()

		err := o.connectAndReadStream(ctx, symbols)
		cancel()

		o.streamMu.Lock()
		if o.isClosed {
			o.streamMu.Unlock()
			return
		}
		o.streamCancel = nil
		o.currentStreamSymbols = make(map[string]bool)
		o.streamMu.Unlock()

		if err != nil && ctx.Err() == nil {
			log.Printf("[OANDA Stream] Stream disconnected: %v. Reconnecting in %v...", err, backoff)
			select {
			case <-o.stopCh:
				return
			case <-o.notifyCh:
				backoff = 1 * time.Second
			case <-time.After(backoff):
				if backoff < 8*time.Second {
					backoff *= 2
				}
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

		resp, err := o.streamClient.Do(req)
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
					nextBar := openStreamBar(bucketTime, midPrice)
					o.activeCandles[subKey] = &nextBar
					bar = &nextBar
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

// fallbackSupervisor ensures continuous live updates when the pricing stream
// is quiet or unavailable, using a calm check interval with exponential backoff
// during quiet/closed market sessions and resetting backoff when live ticks arrive.
func (o *OandaProvider) fallbackSupervisor() {
	const (
		checkInterval       = 500 * time.Millisecond
		baseQuietPoll       = 1 * time.Second
		maxQuietPoll        = 30 * time.Second
		activeSyncInterval  = 2500 * time.Millisecond
		liveTickFreshWindow = 2 * time.Second
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

	lastBars := make(map[string]barState)
	lastPrevBars := make(map[string]barState)
	lastPollTime := make(map[string]time.Time)
	pollBackoff := make(map[string]time.Duration)
	inFlight := make(map[string]bool)
	var stateMu sync.Mutex

	for {
		select {
		case <-o.stopCh:
			return
		case <-ticker.C:
		}

		o.streamMu.Lock()
		if o.isClosed {
			o.streamMu.Unlock()
			return
		}

		now := time.Now()
		type pollTarget struct {
			key           string
			sym           string
			res           string
			cbs           []func(c datafeed.Candle)
			lastTick      time.Time
			activeBarTime int64
		}
		var activeSnapshots []pollTarget
		activeKeys := make(map[string]bool, len(o.activeSubs))

		for key, listeners := range o.activeSubs {
			if len(listeners) == 0 {
				continue
			}
			parts := strings.Split(key, "::")
			if len(parts) != 2 {
				continue
			}
			activeKeys[key] = true
			sym := parts[0]
			res := parts[1]
			cbList := make([]func(c datafeed.Candle), 0, len(listeners))
			for _, cb := range listeners {
				cbList = append(cbList, cb)
			}
			var activeTime int64
			if ab := o.activeCandles[key]; ab != nil {
				activeTime = ab.Time
			}
			activeSnapshots = append(activeSnapshots, pollTarget{
				key:           key,
				sym:           sym,
				res:           res,
				cbs:           cbList,
				lastTick:      o.lastTickTime[sym],
				activeBarTime: activeTime,
			})
		}
		o.streamMu.Unlock()

		var targets []pollTarget
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
			lastState, hasLastState := lastBars[snap.key]
			// Promptly reconcile REST candles right after the live stream rolls over to a new bar
			// so the finalized prior bar close and authentic REST open arrive immediately.
			barRolledOver := hasLastState && snap.activeBarTime > lastState.time && now.Sub(lastPoll) >= 250*time.Millisecond
			var needsPoll bool
			if ticksActive {
				pollBackoff[snap.key] = baseQuietPoll
				needsPoll = barRolledOver || now.Sub(lastPoll) >= activeSyncInterval
			} else {
				interval := pollBackoff[snap.key]
				if interval <= 0 {
					interval = baseQuietPoll
					pollBackoff[snap.key] = interval
				}
				needsPoll = barRolledOver || lastPoll.IsZero() || now.Sub(lastPoll) >= interval
			}
			if needsPoll {
				lastPollTime[snap.key] = now
				inFlight[snap.key] = true
				targets = append(targets, snap)
			}
		}
		stateMu.Unlock()

		for _, target := range targets {
			go func(t pollTarget) {
				defer func() {
					stateMu.Lock()
					delete(inFlight, t.key)
					stateMu.Unlock()
				}()

				ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
				defer cancel()

				candles, err := o.GetHistory(ctx, t.sym, t.res, 0, 0, 2)
				if err != nil || len(candles) == 0 {
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

				latest := candles[len(candles)-1]

				// Check if live stream ticks arrived recently on this symbol
				o.streamMu.Lock()
				lastTickTS := o.lastTickTime[t.sym]
				hasFreshTicks := !lastTickTS.IsZero() && time.Since(lastTickTS) <= 500*time.Millisecond
				currentBar, hasCurrent := o.activeCandles[t.key]
				if hasCurrent && currentBar.Time == latest.Time {
					latest = reconcileActiveBar(currentBar, latest, hasFreshTicks)
				} else if !hasCurrent || latest.Time > currentBar.Time {
					copyBar := latest
					o.activeCandles[t.key] = &copyBar
				}
				o.streamMu.Unlock()

				var prev datafeed.Candle
				hasPrevCandle := len(candles) >= 2
				if hasPrevCandle {
					prev = candles[len(candles)-2]
				}

				stateMu.Lock()
				for k := range lastPrevBars {
					if !activeKeys[k] {
						delete(lastPrevBars, k)
					}
				}
				last, hasLast := lastBars[t.key]
				lastPrev, hasLastPrev := lastPrevBars[t.key]
				unchanged := hasLast &&
					latest.Time == last.time &&
					latest.Open == last.open &&
					latest.High == last.high &&
					latest.Low == last.low &&
					latest.Close == last.close &&
					latest.Volume == last.volume
				prevChanged := hasPrevCandle && (!hasLastPrev ||
					prev.Time != lastPrev.time ||
					prev.Open != lastPrev.open ||
					prev.High != lastPrev.high ||
					prev.Low != lastPrev.low ||
					prev.Close != lastPrev.close ||
					prev.Volume != lastPrev.volume)
				if unchanged && !prevChanged {
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

				// Dispatch finalized previous bar before latest whenever it rolled over
				// or REST finalized revised OHLC/close/volume values after rollover.
				if hasPrevCandle && ((hasLast && latest.Time > last.time) || prevChanged) {
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
				if hasPrevCandle {
					lastPrevBars[t.key] = barState{
						time:   prev.Time,
						open:   prev.Open,
						high:   prev.High,
						low:    prev.Low,
						close:  prev.Close,
						volume: prev.Volume,
					}
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

	// Check if this symbol is already active or on the current multiplexed stream
	isAlreadyStreaming := o.activeStreamSymbols[cleanSym] || o.currentStreamSymbols[cleanSym]
	if !o.activeStreamSymbols[cleanSym] {
		o.activeStreamSymbols[cleanSym] = true
	}

	// If we already have an active candle with authentic volume, emit it
	if bar, exists := o.activeCandles[subKey]; exists && bar != nil {
		onCandle(*bar)
	}

	// Only coalesce a stream restart if a live stream is currently running WITHOUT cleanSym.
	// If no stream is active yet, notifyCh wakes streamSupervisor immediately without tearing down anything.
	if !isAlreadyStreaming && o.streamCancel != nil && !o.currentStreamSymbols[cleanSym] {
		if o.restartTimer != nil {
			o.restartTimer.Stop()
		}
		o.restartTimer = time.AfterFunc(50*time.Millisecond, func() {
			o.streamMu.Lock()
			defer o.streamMu.Unlock()
			o.restartTimer = nil
			if o.streamCancel != nil {
				o.streamCancel()
			}
		})
	}
	o.streamMu.Unlock()

	if ctx != nil && ctx.Done() != nil {
		go func(done <-chan struct{}, sKey string, sID uint64, sym string) {
			<-done
			o.streamMu.Lock()
			if o.isClosed {
				o.streamMu.Unlock()
				return
			}
			if listeners, ok := o.activeSubs[sKey]; ok {
				delete(listeners, sID)
				if len(listeners) == 0 {
					delete(o.activeSubs, sKey)
					delete(o.activeCandles, sKey)
				}
			}
			hasMore := false
			for k := range o.activeSubs {
				if strings.HasPrefix(k, sym+"::") {
					hasMore = true
					break
				}
			}
			if !hasMore {
				o.scheduleTeardownLocked(sym)
			}
			o.streamMu.Unlock()
		}(ctx.Done(), subKey, subID, cleanSym)
	}

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
				copyBar := latest
				o.activeCandles[subKey] = &copyBar
			} else if latest.Time == currentBar.Time {
				candles[len(candles)-1] = reconcileActiveBar(currentBar, latest, false)
			}
			o.streamMu.Unlock()
			for _, c := range candles {
				onCandle(c)
			}
		}
	}()

	select {
	case o.notifyCh <- struct{}{}:
	default:
	}

	return nil
}

func (o *OandaProvider) scheduleTeardownLocked(cleanSym string) {
	if t, ok := o.pendingTeardowns[cleanSym]; ok {
		t.Stop()
	}
	o.pendingTeardowns[cleanSym] = time.AfterFunc(5*time.Second, func() {
		o.streamMu.Lock()
		defer o.streamMu.Unlock()
		delete(o.pendingTeardowns, cleanSym)
		if o.isClosed {
			return
		}

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
		o.scheduleTeardownLocked(cleanSym)
	}
	o.streamMu.Unlock()

	return nil
}

// Close gracefully terminates all stream connections.
func (o *OandaProvider) Close() error {
	o.streamMu.Lock()
	defer o.streamMu.Unlock()
	if !o.isClosed {
		o.isClosed = true
		if o.stopCh != nil {
			close(o.stopCh)
		}
	}
	if o.cancelLoad != nil {
		o.cancelLoad()
		o.cancelLoad = nil
	}
	if o.restartTimer != nil {
		o.restartTimer.Stop()
		o.restartTimer = nil
	}
	for _, t := range o.pendingTeardowns {
		t.Stop()
	}
	o.pendingTeardowns = make(map[string]*time.Timer)
	if o.streamCancel != nil {
		o.streamCancel()
	}
	return nil
}
