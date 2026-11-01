package datafeed

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

// Coordinator coordinates multiple data providers, providing project-level
// candle aggregation, pagination/backfilling, symbol routing, and normalization.
type Coordinator struct {
	mu        sync.RWMutex
	providers map[string]DataProvider
	cache     *CandleCache
}

// NewCoordinator creates a new empty Coordinator with high-speed in-memory caching.
func NewCoordinator() *Coordinator {
	return &Coordinator{
		providers: make(map[string]DataProvider),
		cache:     NewCandleCache(1000, 10*time.Second),
	}
}

// Cache returns the coordinator's in-memory candle cache.
func (c *Coordinator) Cache() *CandleCache {
	return c.cache
}

// RegisterProvider registers a provider under its Name() uppercase key.
func (c *Coordinator) RegisterProvider(p DataProvider) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.providers[strings.ToUpper(p.Name())] = p
}

// RegisterAlias registers an alias name pointing to an existing registered provider.
func (c *Coordinator) RegisterAlias(alias string, targetName string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if target, ok := c.providers[strings.ToUpper(strings.TrimSpace(targetName))]; ok {
		c.providers[strings.ToUpper(strings.TrimSpace(alias))] = target
	}
}

// GetProvider retrieves a provider by exchange name.
func (c *Coordinator) GetProvider(exchange string) (DataProvider, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	p, ok := c.providers[strings.ToUpper(strings.TrimSpace(exchange))]
	return p, ok
}

// Providers returns all distinct registered DataProviders (excluding duplicate alias mappings).
func (c *Coordinator) Providers() []DataProvider {
	c.mu.RLock()
	defer c.mu.RUnlock()
	seen := make(map[DataProvider]bool)
	var list []DataProvider
	for _, p := range c.providers {
		if !seen[p] {
			seen[p] = true
			list = append(list, p)
		}
	}
	return list
}

// ResolveProvider returns the appropriate DataProvider and stripped symbol.
func (c *Coordinator) ResolveProvider(fullSymbol string) (DataProvider, string, error) {
	clean := strings.TrimSpace(fullSymbol)
	exchange := "BINANCE"
	sym := clean

	if parts := strings.SplitN(clean, ":", 2); len(parts) == 2 {
		exchange = strings.ToUpper(parts[0])
		sym = parts[1]
	}

	p, ok := c.GetProvider(exchange)
	if !ok {
		// Fallback to Binance if available, else first registered
		p, ok = c.GetProvider("BINANCE")
		if !ok {
			c.mu.RLock()
			for _, prov := range c.providers {
				p = prov
				ok = true
				break
			}
			c.mu.RUnlock()
		}
	}

	if !ok || p == nil {
		return nil, "", fmt.Errorf("no provider registered for exchange: %s", exchange)
	}

	return p, sym, nil
}

// isNativeResolution checks if a resolution is universally supported natively.
func isNativeResolution(res string) bool {
	upper := strings.ToUpper(strings.TrimSpace(res))
	switch upper {
	case "1S", "1", "1M", "5M", "15M", "30M", "60", "1H", "4H", "D", "1D", "W", "1W", "M", "1MO":
		return true
	default:
		return false
	}
}

// isNativeResolutionForProvider checks if a resolution is natively supported by a specific provider.
func isNativeResolutionForProvider(provider DataProvider, res string) bool {
	if provider != nil {
		clean := strings.TrimSpace(res)
		upper := strings.ToUpper(clean)
		for _, s := range provider.SupportedResolutions() {
			if strings.EqualFold(s, clean) {
				return true
			}
			// Normalization matches for common conventions (1d/D, 1w/W, 1m/1, 1h/60, etc.)
			if (upper == "D" || upper == "1D") && (strings.EqualFold(s, "1d") || strings.EqualFold(s, "d")) {
				return true
			}
			if (upper == "W" || upper == "1W") && (strings.EqualFold(s, "1w") || strings.EqualFold(s, "w")) {
				return true
			}
			if (upper == "M" || upper == "1M" || upper == "1MO") && (s == "1M" || s == "M" || strings.EqualFold(s, "1mo")) {
				return true
			}
			if (upper == "1" || upper == "1M" || upper == "1MIN") && strings.EqualFold(s, "1m") {
				return true
			}
			if (upper == "60" || upper == "1H") && strings.EqualFold(s, "1h") {
				return true
			}
		}
	}
	return isNativeResolution(res)
}

// GetCandles performs project-level historical candle retrieval, coordinating
// pagination/backfill windowing and timeframe aggregation across any provider.
func (c *Coordinator) GetCandles(
	ctx context.Context,
	fullSymbol, resolution string,
	from, to int64,
	count int,
) ([]Candle, error) {
	// Build cache key and check in-memory cache for instant return
	cacheKey := fmt.Sprintf("%s:%s:%d:%d:%d", fullSymbol, resolution, from, to, count)
	if c.cache != nil {
		if cached, ok := c.cache.Get(cacheKey); ok && len(cached) > 0 {
			return cached, nil
		}
	}

	provider, sym, err := c.ResolveProvider(fullSymbol)
	if err != nil {
		return nil, err
	}

	if count <= 0 {
		count = 200
	}
	if count > 5000 {
		count = 5000
	}

	targetStepSec := ResolutionToSeconds(resolution)

	// Check if resolution requires custom project-level aggregation
	needsAggregation := !isNativeResolutionForProvider(provider, resolution)

	fetchResolution := resolution
	fetchCount := count
	if needsAggregation {
		if targetStepSec < 60 && targetStepSec > 1 {
			// Sub-minute timeframe (e.g. 5s, 15s, 30s): Fetch 1s base candles and aggregate
			fetchResolution = "1s"
			ratio := targetStepSec
			if ratio <= 0 {
				ratio = 1
			}
			fetchCount = count * int(ratio)
			if fetchCount > 5000 {
				fetchCount = 5000
			}
		} else if targetStepSec >= 60 {
			// Multi-minute timeframe (e.g. 2m, 45m, 2h): Fetch 1m base candles and aggregate
			fetchResolution = "1m"
			ratio := targetStepSec / 60
			if ratio <= 0 {
				ratio = 1
			}
			fetchCount = count * int(ratio)
			if fetchCount > 5000 {
				fetchCount = 5000
			}
		}
	}

	// Project-level backfill / pagination loop:
	// If provider returns fewer than requested and caller requested a time window or count,
	// coordinator can paginate backwards in chunks to collect the required history.
	var allCandles []Candle
	currentTo := to
	remaining := fetchCount

	// Fetch in chunks of up to 1000 candles
	for remaining > 0 {
		chunkLimit := remaining
		if chunkLimit > 1000 {
			chunkLimit = 1000
		}

		chunk, err := provider.GetHistory(ctx, sym, fetchResolution, from, currentTo, chunkLimit)
		if err != nil {
			if len(allCandles) > 0 {
				break // Return what we gathered so far
			}
			return nil, err
		}

		if len(chunk) == 0 {
			break
		}

		allCandles = append(chunk, allCandles...)
		remaining -= len(chunk)

		// Move currentTo before the earliest candle in this chunk
		earliestTime := chunk[0].Time
		if from > 0 && earliestTime <= from {
			break // Reached requested start
		}
		currentTo = earliestTime - 1

		// If the chunk returned fewer than requested chunkLimit, provider has no more older data
		if len(chunk) < chunkLimit {
			break
		}
	}

	// Deduplicate by timestamp and sort ascending
	allCandles = deduplicateAndSort(allCandles)

	// Aggregate if needed at project level
	if needsAggregation {
		allCandles = AggregateCandles(allCandles, targetStepSec)
	}

	// If we have more than count, keep the most recent `count` bars
	if len(allCandles) > count {
		allCandles = allCandles[len(allCandles)-count:]
	}

	// Cache successful query result
	if c.cache != nil && len(allCandles) > 0 {
		c.cache.Set(cacheKey, allCandles)
	}

	return allCandles, nil
}

// SearchSymbols queries all registered providers concurrently and merges results.
func (c *Coordinator) SearchSymbols(ctx context.Context, query string) ([]SymbolInfo, error) {
	c.mu.RLock()
	seenProv := make(map[DataProvider]bool)
	providersList := make([]DataProvider, 0, len(c.providers))
	for _, p := range c.providers {
		if !seenProv[p] {
			seenProv[p] = true
			providersList = append(providersList, p)
		}
	}
	c.mu.RUnlock()

	searchCtx, cancel := context.WithTimeout(ctx, 200*time.Millisecond)
	defer cancel()

	var wg sync.WaitGroup
	var mu sync.Mutex
	var all []SymbolInfo
	seen := make(map[string]bool)

	for _, p := range providersList {
		wg.Add(1)
		go func(prov DataProvider) {
			defer wg.Done()
			// Skip inactive providers
			if checker, ok := prov.(interface{ IsActive() bool }); ok {
				if !checker.IsActive() {
					return
				}
			}
			// Skip unconfigured / unconnected providers (e.g. OANDA, Alpaca before user connects credentials)
			if configChecker, ok := prov.(interface{ IsConfigured() bool }); ok {
				if !configChecker.IsConfigured() {
					return
				}
			}
			results, err := prov.Search(searchCtx, query)
			if err != nil || len(results) == 0 {
				return
			}
			mu.Lock()
			for _, s := range results {
				if !seen[s.FullSymbol] {
					seen[s.FullSymbol] = true
					all = append(all, s)
				}
			}
			mu.Unlock()
		}(p)
	}

	wg.Wait()

	// Rank results: exact match -> prefix match -> other
	cleanQ := strings.ToUpper(strings.TrimSpace(query))
	if cleanQ != "" {
		sort.SliceStable(all, func(i, j int) bool {
			symI := strings.ToUpper(all[i].Symbol)
			symJ := strings.ToUpper(all[j].Symbol)
			exactI := symI == cleanQ
			exactJ := symJ == cleanQ
			if exactI != exactJ {
				return exactI
			}
			prefixI := strings.HasPrefix(symI, cleanQ)
			prefixJ := strings.HasPrefix(symJ, cleanQ)
			if prefixI != prefixJ {
				return prefixI
			}
			return false
		})
	}

	return all, nil
}

func deduplicateAndSort(candles []Candle) []Candle {
	if len(candles) <= 1 {
		return candles
	}

	seen := make(map[int64]Candle, len(candles))
	for _, c := range candles {
		seen[c.Time] = c
	}

	result := make([]Candle, 0, len(seen))
	for _, c := range seen {
		result = append(result, c)
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].Time < result[j].Time
	})

	return result
}
