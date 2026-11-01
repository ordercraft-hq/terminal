package datafeed

import (
	"sync"
	"time"
)

type cacheEntry struct {
	candles   []Candle
	expiresAt time.Time
	key       string
}

// CandleCache is an in-memory concurrent-safe LRU/TTL cache for candle queries.
type CandleCache struct {
	mu       sync.RWMutex
	entries  map[string]*cacheEntry
	keys     []string // order of keys for basic eviction
	capacity int
	ttl      time.Duration
}

// NewCandleCache creates a new CandleCache with given capacity and TTL.
func NewCandleCache(capacity int, ttl time.Duration) *CandleCache {
	if capacity <= 0 {
		capacity = 500
	}
	if ttl <= 0 {
		ttl = 10 * time.Second
	}
	return &CandleCache{
		entries:  make(map[string]*cacheEntry),
		keys:     make([]string, 0, capacity),
		capacity: capacity,
		ttl:      ttl,
	}
}

// Get looks up candles by cache key. Returns (candles, true) if found and not expired.
func (c *CandleCache) Get(key string) ([]Candle, bool) {
	c.mu.RLock()
	entry, ok := c.entries[key]
	if !ok {
		c.mu.RUnlock()
		return nil, false
	}
	if time.Now().After(entry.expiresAt) {
		c.mu.RUnlock()
		// Expired: lazily delete on write
		c.mu.Lock()
		delete(c.entries, key)
		c.mu.Unlock()
		return nil, false
	}
	result := make([]Candle, len(entry.candles))
	copy(result, entry.candles)
	c.mu.RUnlock()
	return result, true
}

// Set stores candles in the cache with the configured TTL.
func (c *CandleCache) Set(key string, candles []Candle) {
	if len(candles) == 0 {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()

	// If at capacity and key is new, evict oldest
	if _, exists := c.entries[key]; !exists {
		if len(c.keys) >= c.capacity {
			oldest := c.keys[0]
			c.keys = c.keys[1:]
			delete(c.entries, oldest)
		}
		c.keys = append(c.keys, key)
	}

	stored := make([]Candle, len(candles))
	copy(stored, candles)

	c.entries[key] = &cacheEntry{
		candles:   stored,
		expiresAt: time.Now().Add(c.ttl),
		key:       key,
	}
}

// InvalidateSymbol evicts all entries matching a specific symbol prefix.
func (c *CandleCache) InvalidateSymbol(symbolPrefix string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	newKeys := make([]string, 0, len(c.keys))
	for _, k := range c.keys {
		if len(k) >= len(symbolPrefix) && k[:len(symbolPrefix)] == symbolPrefix {
			delete(c.entries, k)
		} else {
			newKeys = append(newKeys, k)
		}
	}
	c.keys = newKeys
}

// Clear flushes all entries from the cache.
func (c *CandleCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = make(map[string]*cacheEntry)
	c.keys = c.keys[:0]
}
