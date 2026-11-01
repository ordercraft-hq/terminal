package screener

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"sync"
	"time"
)

type MoverItem struct {
	Symbol      string  `json:"symbol"`
	Name        string  `json:"name,omitempty"`
	LastPrice   float64 `json:"lastPrice"`
	Change      float64 `json:"change"`
	ChangePct   float64 `json:"changePct"`
	High        float64 `json:"high,omitempty"`
	Low         float64 `json:"low,omitempty"`
	VolumeQuote float64 `json:"volumeQuote"`
	MarketCap   float64 `json:"marketCap,omitempty"`
}

type MoversResponse struct {
	Category string      `json:"category,omitempty"`
	Gainers  []MoverItem `json:"gainers"`
	Losers   []MoverItem `json:"losers"`
	Volume   []MoverItem `json:"volume"`
}

type ScreenerCategory struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Group       string `json:"group"`
}

var YFinanceCategories = []ScreenerCategory{
	{
		ID:          "day_movers",
		Name:        "US Market Movers",
		Description: "Live US equities day gainers, losers, and most actives",
		Group:       "Market Overview",
	},
	{
		ID:          "all_cryptocurrencies_us",
		Name:        "Crypto Universe",
		Description: "Cryptocurrencies ranked live by market activity",
		Group:       "Crypto",
	},
	{
		ID:          "growth_technology_stocks",
		Name:        "Technology & High Growth",
		Description: "Top technology and high-growth equities",
		Group:       "Equities & Sectors",
	},
	{
		ID:          "undervalued_growth_stocks",
		Name:        "Undervalued Growth",
		Description: "Equities with strong earnings growth at low valuation multiples",
		Group:       "Equities & Sectors",
	},
	{
		ID:          "undervalued_large_caps",
		Name:        "Undervalued Large Caps",
		Description: "High-capitalization blue chips with low valuation multiples",
		Group:       "Equities & Sectors",
	},
	{
		ID:          "aggressive_small_caps",
		Name:        "Aggressive Small Caps",
		Description: "High-momentum, high-volatility small-cap equities",
		Group:       "Equities & Sectors",
	},
	{
		ID:          "small_cap_gainers",
		Name:        "Small Caps Momentum",
		Description: "Small cap companies with strong trading momentum",
		Group:       "Equities & Sectors",
	},
	{
		ID:          "most_shorted_stocks",
		Name:        "Most Shorted Equities",
		Description: "Equities with high short interest and squeeze activity",
		Group:       "Equities & Sectors",
	},
	{
		ID:          "top_etfs_us",
		Name:        "Top US ETFs",
		Description: "Top performing exchange-traded funds in the US",
		Group:       "ETFs & Funds",
	},
	{
		ID:          "technology_etfs",
		Name:        "Technology ETFs",
		Description: "Technology and innovation focused exchange-traded funds",
		Group:       "ETFs & Funds",
	},
	{
		ID:          "top_mutual_funds",
		Name:        "Top Mutual Funds",
		Description: "Top performing mutual funds by return and rating",
		Group:       "ETFs & Funds",
	},
	{
		ID:          "high_yield_bond",
		Name:        "High Yield Bonds",
		Description: "High yield corporate and fixed-income bond funds",
		Group:       "ETFs & Funds",
	},
}

type yfQuote struct {
	Symbol                     string  `json:"symbol"`
	ShortName                  string  `json:"shortName"`
	LongName                   string  `json:"longName"`
	RegularMarketPrice         float64 `json:"regularMarketPrice"`
	RegularMarketChange        float64 `json:"regularMarketChange"`
	RegularMarketChangePercent float64 `json:"regularMarketChangePercent"`
	RegularMarketVolume        float64 `json:"regularMarketVolume"`
	MarketCap                  float64 `json:"marketCap"`
}

type yfScreenerResponse struct {
	Finance struct {
		Result []struct {
			Title  string    `json:"title"`
			Quotes []yfQuote `json:"quotes"`
		} `json:"result"`
		Error interface{} `json:"error"`
	} `json:"finance"`
}

type cachedCategory struct {
	data        *MoversResponse
	lastFetched time.Time
}

type Service struct {
	mu            sync.RWMutex
	client        *http.Client
	categoryCache map[string]*cachedCategory
	cacheTTL      time.Duration
	endpointBase  string
	userAgent     string
}

func NewService() *Service {
	return &Service{
		client: &http.Client{
			Timeout: 12 * time.Second,
		},
		categoryCache: make(map[string]*cachedCategory),
		cacheTTL:      25 * time.Second,
		endpointBase:  "https://query2.finance.yahoo.com/v1/finance/screener/predefined/saved",
		userAgent:     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
	}
}

func (s *Service) SetEndpointURL(urlStr string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.endpointBase = urlStr
}

func (s *Service) GetMovers(ctx context.Context, category ...string) (*MoversResponse, error) {
	cat := "day_movers"
	if len(category) > 0 && category[0] != "" {
		cat = category[0]
	}
	return s.GetMoversWithOpts(ctx, cat, false)
}

func (s *Service) GetMoversWithOpts(ctx context.Context, category string, force bool) (*MoversResponse, error) {
	if category == "" {
		category = "day_movers"
	}

	if !force {
		s.mu.RLock()
		cached, exists := s.categoryCache[category]
		cachedValid := exists && cached.data != nil && time.Since(cached.lastFetched) < s.cacheTTL
		s.mu.RUnlock()

		if cachedValid {
			return cached.data, nil
		}
	}

	fresh, err := s.fetchCategoryFromYFinance(ctx, category)
	if err != nil {
		s.mu.RLock()
		cached, exists := s.categoryCache[category]
		s.mu.RUnlock()
		if exists && cached.data != nil {
			return cached.data, nil
		}
		return getFallbackMovers(category), nil
	}

	s.mu.Lock()
	s.categoryCache[category] = &cachedCategory{
		data:        fresh,
		lastFetched: time.Now(),
	}
	s.mu.Unlock()

	return fresh, nil
}

func (s *Service) fetchCategoryFromYFinance(ctx context.Context, category string) (*MoversResponse, error) {
	if category == "day_movers" {
		return s.fetchDayMovers(ctx)
	}

	quotes, err := s.fetchScreenerQuotes(ctx, category, 50)
	if err != nil {
		return nil, err
	}

	items := make([]MoverItem, 0, len(quotes))
	for _, q := range quotes {
		if q.RegularMarketPrice <= 0 {
			continue
		}
		name := q.ShortName
		if name == "" {
			name = q.LongName
		}
		items = append(items, MoverItem{
			Symbol:      q.Symbol,
			Name:        name,
			LastPrice:   q.RegularMarketPrice,
			Change:      q.RegularMarketChange,
			ChangePct:   q.RegularMarketChangePercent,
			VolumeQuote: q.RegularMarketVolume,
			MarketCap:   q.MarketCap,
		})
	}

	// 1. Gainers (descending by ChangePct)
	gainers := make([]MoverItem, len(items))
	copy(gainers, items)
	sort.Slice(gainers, func(i, j int) bool {
		return gainers[i].ChangePct > gainers[j].ChangePct
	})
	if len(gainers) > 25 {
		gainers = gainers[:25]
	}

	// 2. Losers (ascending by ChangePct)
	losers := make([]MoverItem, len(items))
	copy(losers, items)
	sort.Slice(losers, func(i, j int) bool {
		return losers[i].ChangePct < losers[j].ChangePct
	})
	if len(losers) > 25 {
		losers = losers[:25]
	}

	// 3. Volume leaders
	vol := make([]MoverItem, len(items))
	copy(vol, items)
	sort.Slice(vol, func(i, j int) bool {
		return vol[i].VolumeQuote > vol[j].VolumeQuote
	})
	if len(vol) > 25 {
		vol = vol[:25]
	}

	return &MoversResponse{
		Category: category,
		Gainers:  gainers,
		Losers:   losers,
		Volume:   vol,
	}, nil
}

func (s *Service) fetchDayMovers(ctx context.Context) (*MoversResponse, error) {
	type resultContainer struct {
		gainers []MoverItem
		losers  []MoverItem
		volume  []MoverItem
	}

	res := &resultContainer{}
	var wg sync.WaitGroup
	var errOnce sync.Once
	var fetchErr error

	// 1. Fetch Gainers
	wg.Add(1)
	go func() {
		defer wg.Done()
		q, err := s.fetchScreenerQuotes(ctx, "day_gainers", 25)
		if err != nil {
			errOnce.Do(func() { fetchErr = err })
			return
		}
		res.gainers = toMoverItems(q)
	}()

	// 2. Fetch Losers
	wg.Add(1)
	go func() {
		defer wg.Done()
		q, err := s.fetchScreenerQuotes(ctx, "day_losers", 25)
		if err != nil {
			errOnce.Do(func() { fetchErr = err })
			return
		}
		res.losers = toMoverItems(q)
	}()

	// 3. Fetch Most Actives (Volume)
	wg.Add(1)
	go func() {
		defer wg.Done()
		q, err := s.fetchScreenerQuotes(ctx, "most_actives", 25)
		if err != nil {
			errOnce.Do(func() { fetchErr = err })
			return
		}
		res.volume = toMoverItems(q)
	}()

	wg.Wait()

	if fetchErr != nil && len(res.gainers) == 0 && len(res.losers) == 0 {
		return nil, fetchErr
	}

	return &MoversResponse{
		Category: "day_movers",
		Gainers:  res.gainers,
		Losers:   res.losers,
		Volume:   res.volume,
	}, nil
}

func (s *Service) fetchScreenerQuotes(ctx context.Context, scrId string, count int) ([]yfQuote, error) {
	s.mu.RLock()
	base := s.endpointBase
	s.mu.RUnlock()

	reqURL := fmt.Sprintf("%s?scrIds=%s&count=%d", base, url.QueryEscape(scrId), count)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", s.userAgent)
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("yahoo screener returned HTTP %d for %s", resp.StatusCode, scrId)
	}

	var parsed yfScreenerResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}

	if len(parsed.Finance.Result) == 0 {
		return nil, fmt.Errorf("no screener results returned for %s", scrId)
	}

	return parsed.Finance.Result[0].Quotes, nil
}

func toMoverItems(quotes []yfQuote) []MoverItem {
	items := make([]MoverItem, 0, len(quotes))
	for _, q := range quotes {
		if q.RegularMarketPrice <= 0 {
			continue
		}
		name := q.ShortName
		if name == "" {
			name = q.LongName
		}
		items = append(items, MoverItem{
			Symbol:      q.Symbol,
			Name:        name,
			LastPrice:   q.RegularMarketPrice,
			Change:      q.RegularMarketChange,
			ChangePct:   q.RegularMarketChangePercent,
			VolumeQuote: q.RegularMarketVolume,
			MarketCap:   q.MarketCap,
		})
	}
	return items
}

func getFallbackMovers(category string) *MoversResponse {
	return &MoversResponse{
		Category: category,
		Gainers: []MoverItem{
			{Symbol: "NVDA", Name: "NVIDIA Corporation", LastPrice: 214.03, Change: 12.50, ChangePct: 6.20, VolumeQuote: 45000000},
			{Symbol: "AAPL", Name: "Apple Inc.", LastPrice: 349.13, Change: 5.30, ChangePct: 1.54, VolumeQuote: 14000000},
			{Symbol: "META", Name: "Meta Platforms, Inc.", LastPrice: 628.70, Change: 16.20, ChangePct: 2.65, VolumeQuote: 12000000},
		},
		Losers: []MoverItem{
			{Symbol: "GOOGL", Name: "Alphabet Inc.", LastPrice: 286.81, Change: -38.08, ChangePct: -11.72, VolumeQuote: 72000000},
			{Symbol: "CRM", Name: "Salesforce, Inc.", LastPrice: 229.01, Change: -13.10, ChangePct: -5.41, VolumeQuote: 6500000},
		},
		Volume: []MoverItem{
			{Symbol: "GOOGL", Name: "Alphabet Inc.", LastPrice: 286.81, Change: -38.08, ChangePct: -11.72, VolumeQuote: 72000000},
			{Symbol: "NVDA", Name: "NVIDIA Corporation", LastPrice: 214.03, Change: 12.50, ChangePct: 6.20, VolumeQuote: 45000000},
		},
	}
}
