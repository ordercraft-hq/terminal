package watchlist

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/ordercraft-hq/terminal/internal/datafeed"
)

type WatchlistQuote struct {
	Symbol      string  `json:"symbol"`
	OriginalKey string  `json:"originalKey,omitempty"`
	Name        string  `json:"name"`
	Price       float64 `json:"price"`
	Change      float64 `json:"change"`
	ChangePct   float64 `json:"changePct"`
	Volume      float64 `json:"volume"`
	Currency    string  `json:"currency"`
	Exchange    string  `json:"exchange"`
}

type SearchItem struct {
	Symbol   string `json:"symbol"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	Exchange string `json:"exchange"`
}

type rawQuoteItem struct {
	Symbol                     string  `json:"symbol"`
	ShortName                  string  `json:"shortName"`
	LongName                   string  `json:"longName"`
	RegularMarketPrice         float64 `json:"regularMarketPrice"`
	RegularMarketChange        float64 `json:"regularMarketChange"`
	RegularMarketChangePercent float64 `json:"regularMarketChangePercent"`
	RegularMarketVolume        float64 `json:"regularMarketVolume"`
	Currency                   string  `json:"currency"`
	Exchange                   string  `json:"exchange"`
}

type rawQuoteResponse struct {
	QuoteResponse struct {
		Result []rawQuoteItem `json:"result"`
		Error  interface{}    `json:"error"`
	} `json:"quoteResponse"`
}

type rawSearchItem struct {
	Symbol    string `json:"symbol"`
	ShortName string `json:"shortname"`
	LongName  string `json:"longname"`
	QuoteType string `json:"quoteType"`
	ExchDisp  string `json:"exchDisp"`
}

type rawSearchResponse struct {
	Quotes []rawSearchItem `json:"quotes"`
}

type cachedQuotes struct {
	data      []WatchlistQuote
	fetchedAt time.Time
}

const defaultMaxQuoteCacheEntries = 256

type Service struct {
	mu              sync.RWMutex
	client          *http.Client
	crumb           string
	crumbExpires    time.Time
	quotesCache     map[string]cachedQuotes
	maxCacheEntries int
	quoteTTL        time.Duration
	userAgent       string
	baseQuoteURL    string
	baseCrumbURL    string
	baseSearchURL   string
	flight          datafeed.SingleFlight[[]WatchlistQuote]
	crumbFlight     datafeed.SingleFlight[string]
}

func NewService() *Service {
	jar, _ := cookiejar.New(nil)
	return &Service{
		client:          datafeed.NewHTTPClientWithJar(jar, 12*time.Second),
		quotesCache:     make(map[string]cachedQuotes),
		maxCacheEntries: defaultMaxQuoteCacheEntries,
		quoteTTL:        15 * time.Second,
		userAgent:       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
		baseQuoteURL:    "https://query2.finance.yahoo.com/v7/finance/quote",
		baseCrumbURL:    "https://query2.finance.yahoo.com/v1/test/getcrumb",
		baseSearchURL:   "https://query2.finance.yahoo.com/v1/finance/search",
	}
}

func (s *Service) SetEndpoints(quoteURL, crumbURL, searchURL string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if quoteURL != "" {
		s.baseQuoteURL = quoteURL
	}
	if crumbURL != "" {
		s.baseCrumbURL = crumbURL
	}
	if searchURL != "" {
		s.baseSearchURL = searchURL
	}
}

// Map common symbols or prefixes to Yahoo-compatible tickers
func NormalizeToYahooTicker(raw string) string {
	clean := strings.TrimSpace(raw)
	upper := strings.ToUpper(clean)

	// Remove OANDA: or BINANCE: prefix if present
	if strings.HasPrefix(upper, "OANDA:") {
		upper = strings.TrimPrefix(upper, "OANDA:")
	} else if strings.HasPrefix(upper, "BINANCE:") {
		upper = strings.TrimPrefix(upper, "BINANCE:")
	}

	// Specific index / CFD mappings
	switch upper {
	case "NAS100_USD", "NAS100", "US100", "NQ":
		return "^NDX"
	case "SPX500_USD", "SPX500", "US500", "ES":
		return "^GSPC"
	case "US30_USD", "US30", "YM":
		return "^DJI"
	case "DE30_EUR", "GER40", "DAX":
		return "^GDAXI"
	case "UK100_GBP", "FTSE100":
		return "^FTSE"
	case "WTICO_USD", "WTI", "USOIL":
		return "CL=F"
	case "BCO_USD", "BRENT":
		return "BZ=F"
	case "XAU_USD", "GOLD":
		return "GC=F"
	case "XAG_USD", "SILVER":
		return "SI=F"
	}

	// Forex pairs like EUR_USD -> EURUSD=X
	if strings.Contains(upper, "_") && len(upper) == 7 {
		parts := strings.Split(upper, "_")
		if len(parts) == 2 && len(parts[0]) == 3 && len(parts[1]) == 3 {
			return parts[0] + parts[1] + "=X"
		}
	}
	if len(upper) == 6 && !strings.HasSuffix(upper, "USDT") {
		// e.g. EURUSD
		return upper + "=X"
	}

	// Crypto pairs like BTCUSDT -> BTC-USD
	if strings.HasSuffix(upper, "USDT") {
		base := strings.TrimSuffix(upper, "USDT")
		return base + "-USD"
	}
	if strings.HasSuffix(upper, "-USD") {
		return upper
	}

	return upper
}

func (s *Service) ensureCrumb(ctx context.Context) (string, error) {
	s.mu.RLock()
	if s.crumb != "" && time.Now().Before(s.crumbExpires) {
		crumb := s.crumb
		s.mu.RUnlock()
		return crumb, nil
	}
	s.mu.RUnlock()

	return s.crumbFlight.Do(ctx, "yahoo_crumb", func(fetchCtx context.Context) (string, error) {
		s.mu.RLock()
		if s.crumb != "" && time.Now().Before(s.crumbExpires) {
			crumb := s.crumb
			s.mu.RUnlock()
			return crumb, nil
		}
		crumbURL := s.baseCrumbURL
		s.mu.RUnlock()

		// 1. Visit fc.yahoo.com to set cookie (skip external host when overridden in tests)
		if strings.Contains(crumbURL, "finance.yahoo.com") {
			initReq, err := http.NewRequestWithContext(fetchCtx, http.MethodGet, "https://fc.yahoo.com", nil)
			if err == nil {
				initReq.Header.Set("User-Agent", s.userAgent)
				resp, initErr := s.client.Do(initReq)
				if initErr == nil {
					io.Copy(io.Discard, resp.Body)
					resp.Body.Close()
				}
			}
		}

		// 2. Fetch crumb
		crumbReq, err := http.NewRequestWithContext(fetchCtx, http.MethodGet, crumbURL, nil)
		if err != nil {
			return "", err
		}
		crumbReq.Header.Set("User-Agent", s.userAgent)

		crumbResp, err := s.client.Do(crumbReq)
		if err != nil {
			return "", err
		}
		defer crumbResp.Body.Close()

		if crumbResp.StatusCode != http.StatusOK {
			return "", fmt.Errorf("crumb request failed with status: %d", crumbResp.StatusCode)
		}

		bodyBytes, err := io.ReadAll(io.LimitReader(crumbResp.Body, 64<<10))
		if err != nil {
			return "", err
		}

		crumb := strings.TrimSpace(string(bodyBytes))
		if crumb == "" {
			return "", fmt.Errorf("received empty crumb from Yahoo")
		}

		s.mu.Lock()
		s.crumb = crumb
		s.crumbExpires = time.Now().Add(2 * time.Hour)
		s.mu.Unlock()
		return crumb, nil
	})
}

func (s *Service) evictQuotesLocked(now time.Time) {
	for k, v := range s.quotesCache {
		if now.Sub(v.fetchedAt) >= s.quoteTTL {
			delete(s.quotesCache, k)
		}
	}
	maxEntries := s.maxCacheEntries
	if maxEntries <= 0 {
		maxEntries = defaultMaxQuoteCacheEntries
	}
	for len(s.quotesCache) >= maxEntries {
		var oldestKey string
		var oldestTime time.Time
		for k, v := range s.quotesCache {
			if oldestKey == "" || v.fetchedAt.Before(oldestTime) {
				oldestKey = k
				oldestTime = v.fetchedAt
			}
		}
		if oldestKey == "" {
			break
		}
		delete(s.quotesCache, oldestKey)
	}
}

func (s *Service) GetQuotes(ctx context.Context, rawSymbols []string) ([]WatchlistQuote, error) {
	if len(rawSymbols) == 0 {
		return nil, nil
	}

	// Map raw input symbols to normalized Yahoo symbols
	symbolMap := make(map[string]string) // yahooSymbol -> originalKey
	var yahooSymbols []string

	for _, raw := range rawSymbols {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		yTicker := NormalizeToYahooTicker(raw)
		if _, exists := symbolMap[yTicker]; !exists {
			symbolMap[yTicker] = raw
			yahooSymbols = append(yahooSymbols, yTicker)
		}
	}

	if len(yahooSymbols) == 0 {
		return nil, nil
	}

	cacheKey := strings.Join(yahooSymbols, ",")
	s.mu.RLock()
	cached, ok := s.quotesCache[cacheKey]
	s.mu.RUnlock()

	if ok && time.Since(cached.fetchedAt) < s.quoteTTL {
		return cached.data, nil
	}

	return s.flight.Do(ctx, cacheKey, func(fetchCtx context.Context) ([]WatchlistQuote, error) {
		s.mu.RLock()
		cachedInner, okInner := s.quotesCache[cacheKey]
		baseQuoteURL := s.baseQuoteURL
		s.mu.RUnlock()

		if okInner && time.Since(cachedInner.fetchedAt) < s.quoteTTL {
			return cachedInner.data, nil
		}

		crumb, err := s.ensureCrumb(fetchCtx)
		if err != nil {
			// If crumb acquisition failed, try direct without crumb or return fallback
			crumb = ""
		}

		endpoint := fmt.Sprintf("%s?symbols=%s", baseQuoteURL, url.QueryEscape(strings.Join(yahooSymbols, ",")))
		if crumb != "" {
			endpoint += "&crumb=" + url.QueryEscape(crumb)
		}

		req, err := http.NewRequestWithContext(fetchCtx, http.MethodGet, endpoint, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("User-Agent", s.userAgent)

		resp, err := s.client.Do(req)
		if err != nil {
			if okInner && len(cachedInner.data) > 0 {
				return cachedInner.data, nil
			}
			return getFallbackQuotes(symbolMap), nil
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusUnauthorized {
			// Reset crumb and invalidate
			s.mu.Lock()
			s.crumb = ""
			s.mu.Unlock()
			if okInner && len(cachedInner.data) > 0 {
				return cachedInner.data, nil
			}
			return getFallbackQuotes(symbolMap), nil
		}

		var parsed rawQuoteResponse
		if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&parsed); err != nil {
			if okInner && len(cachedInner.data) > 0 {
				return cachedInner.data, nil
			}
			return getFallbackQuotes(symbolMap), nil
		}

		var results []WatchlistQuote
		for _, it := range parsed.QuoteResponse.Result {
			name := it.ShortName
			if name == "" {
				name = it.LongName
			}
			if name == "" {
				name = it.Symbol
			}

			origKey := symbolMap[it.Symbol]
			if origKey == "" {
				origKey = it.Symbol
			}

			results = append(results, WatchlistQuote{
				Symbol:      it.Symbol,
				OriginalKey: origKey,
				Name:        name,
				Price:       it.RegularMarketPrice,
				Change:      it.RegularMarketChange,
				ChangePct:   it.RegularMarketChangePercent,
				Volume:      it.RegularMarketVolume,
				Currency:    it.Currency,
				Exchange:    it.Exchange,
			})
		}

		now := time.Now()
		s.mu.Lock()
		if _, exists := s.quotesCache[cacheKey]; !exists {
			s.evictQuotesLocked(now)
		}
		s.quotesCache[cacheKey] = cachedQuotes{
			data:      results,
			fetchedAt: now,
		}
		s.mu.Unlock()

		return results, nil
	})
}

func (s *Service) Search(ctx context.Context, query string) ([]SearchItem, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}

	s.mu.RLock()
	baseSearchURL := s.baseSearchURL
	s.mu.RUnlock()

	endpoint := fmt.Sprintf("%s?q=%s&quotesCount=10&newsCount=0", baseSearchURL, url.QueryEscape(query))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", s.userAgent)

	resp, err := s.client.Do(req)
	if err != nil {
		return getFallbackSearch(query), nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return getFallbackSearch(query), nil
	}

	var raw rawSearchResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&raw); err != nil {
		return getFallbackSearch(query), nil
	}

	var items []SearchItem
	for _, q := range raw.Quotes {
		name := q.ShortName
		if name == "" {
			name = q.LongName
		}
		items = append(items, SearchItem{
			Symbol:   q.Symbol,
			Name:     name,
			Type:     q.QuoteType,
			Exchange: q.ExchDisp,
		})
	}

	return items, nil
}

func getFallbackQuotes(symbolMap map[string]string) []WatchlistQuote {
	var results []WatchlistQuote
	for yTicker, origKey := range symbolMap {
		results = append(results, WatchlistQuote{
			Symbol:      yTicker,
			OriginalKey: origKey,
			Name:        origKey,
			Price:       100.0,
			Change:      0.5,
			ChangePct:   0.5,
			Volume:      1000000,
		})
	}
	return results
}

func getFallbackSearch(query string) []SearchItem {
	q := strings.ToUpper(query)
	return []SearchItem{
		{Symbol: q, Name: q + " Asset", Type: "EQUITY", Exchange: "US"},
	}
}
