package datafeed

import (
	"container/list"
	"strings"
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
	mu       sync.Mutex
	entries  map[string]*list.Element
	order    *list.List // front = most recently used, back = least recently used
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
		entries:  make(map[string]*list.Element),
		order:    list.New(),
		capacity: capacity,
		ttl:      ttl,
	}
}

// Get looks up candles by cache key. Returns (candles, true) if found and not expired.
func (c *CandleCache) Get(key string) ([]Candle, bool) {
	now := time.Now()
	c.mu.Lock()
	defer c.mu.Unlock()

	elem, ok := c.entries[key]
	if !ok {
		return nil, false
	}
	entry := elem.Value.(*cacheEntry)
	if now.After(entry.expiresAt) {
		c.order.Remove(elem)
		delete(c.entries, key)
		return nil, false
	}
	c.order.MoveToFront(elem)

	result := make([]Candle, len(entry.candles))
	copy(result, entry.candles)
	return result, true
}

// Set stores candles in the cache with the configured default TTL.
func (c *CandleCache) Set(key string, candles []Candle) {
	c.SetWithTTL(key, candles, c.ttl)
}

// SetWithTTL stores candles in the cache with a custom TTL (falls back to default TTL if <= 0).
func (c *CandleCache) SetWithTTL(key string, candles []Candle, ttl time.Duration) {
	if len(candles) == 0 {
		return
	}
	if ttl <= 0 {
		ttl = c.ttl
	}

	stored := make([]Candle, len(candles))
	copy(stored, candles)
	now := time.Now()

	c.mu.Lock()
	defer c.mu.Unlock()

	if elem, exists := c.entries[key]; exists {
		entry := elem.Value.(*cacheEntry)
		entry.candles = stored
		entry.expiresAt = now.Add(ttl)
		c.order.MoveToFront(elem)
		return
	}

	// Reclaim any expired entries before evicting a live LRU entry.
	if c.order.Len() >= c.capacity {
		for e := c.order.Back(); e != nil; {
			prev := e.Prev()
			ent := e.Value.(*cacheEntry)
			if now.After(ent.expiresAt) {
				c.order.Remove(e)
				delete(c.entries, ent.key)
			}
			e = prev
		}
		for c.order.Len() >= c.capacity {
			oldest := c.order.Back()
			if oldest == nil {
				break
			}
			ent := oldest.Value.(*cacheEntry)
			c.order.Remove(oldest)
			delete(c.entries, ent.key)
		}
	}

	entry := &cacheEntry{
		candles:   stored,
		expiresAt: now.Add(ttl),
		key:       key,
	}
	elem := c.order.PushFront(entry)
	c.entries[key] = elem
}

// InvalidateSymbol evicts all entries matching a specific symbol prefix.
func (c *CandleCache) InvalidateSymbol(symbolPrefix string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	for e := c.order.Front(); e != nil; {
		next := e.Next()
		ent := e.Value.(*cacheEntry)
		if strings.HasPrefix(ent.key, symbolPrefix) {
			c.order.Remove(e)
			delete(c.entries, ent.key)
		}
		e = next
	}
}

// Clear flushes all entries from the cache.
func (c *CandleCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = make(map[string]*list.Element)
	c.order.Init()
}

// Len returns the number of entries currently tracked by the cache.
func (c *CandleCache) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.order.Len()
}
