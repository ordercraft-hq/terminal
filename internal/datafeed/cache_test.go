package datafeed

import (
	"testing"
	"time"
)

func TestCandleCacheGetSet(t *testing.T) {
	cache := NewCandleCache(10, 1*time.Second)

	candles := []Candle{
		{Time: 100, Open: 10, High: 15, Low: 9, Close: 14, Volume: 100},
		{Time: 200, Open: 14, High: 16, Low: 13, Close: 15, Volume: 120},
	}

	key := "BINANCE:BTCUSDT:15m:0:0:200"
	cache.Set(key, candles)

	cached, ok := cache.Get(key)
	if !ok {
		t.Fatalf("expected cache hit for key %s", key)
	}
	if len(cached) != 2 || cached[0].Close != 14 || cached[1].Close != 15 {
		t.Fatalf("unexpected cached candles: %+v", cached)
	}
}

func TestCandleCacheTTL(t *testing.T) {
	cache := NewCandleCache(10, 50*time.Millisecond)

	candles := []Candle{
		{Time: 100, Open: 10, High: 15, Low: 9, Close: 14, Volume: 100},
	}

	key := "BINANCE:ETHUSDT:15m:0:0:200"
	cache.Set(key, candles)

	// Immediate get succeeds
	if _, ok := cache.Get(key); !ok {
		t.Fatal("expected cache hit immediately after set")
	}

	// Sleep past TTL
	time.Sleep(60 * time.Millisecond)

	if _, ok := cache.Get(key); ok {
		t.Fatal("expected cache miss after TTL expired")
	}
}

func TestCandleCacheEviction(t *testing.T) {
	cache := NewCandleCache(2, 1*time.Second)

	c1 := []Candle{{Time: 100, Close: 1}}
	c2 := []Candle{{Time: 200, Close: 2}}
	c3 := []Candle{{Time: 300, Close: 3}}

	cache.Set("key1", c1)
	cache.Set("key2", c2)
	cache.Set("key3", c3) // key1 should be evicted

	if _, ok := cache.Get("key1"); ok {
		t.Fatal("expected key1 to be evicted")
	}
	if _, ok := cache.Get("key2"); !ok {
		t.Fatal("expected key2 to exist")
	}
	if _, ok := cache.Get("key3"); !ok {
		t.Fatal("expected key3 to exist")
	}
}

func TestCandleCacheInvalidateSymbol(t *testing.T) {
	cache := NewCandleCache(10, 1*time.Second)

	cache.Set("BINANCE:BTCUSDT:15m", []Candle{{Time: 1, Close: 100}})
	cache.Set("BINANCE:BTCUSDT:1h", []Candle{{Time: 1, Close: 100}})
	cache.Set("BINANCE:ETHUSDT:15m", []Candle{{Time: 1, Close: 50}})

	cache.InvalidateSymbol("BINANCE:BTCUSDT")

	if _, ok := cache.Get("BINANCE:BTCUSDT:15m"); ok {
		t.Fatal("expected BINANCE:BTCUSDT:15m to be invalidated")
	}
	if _, ok := cache.Get("BINANCE:BTCUSDT:1h"); ok {
		t.Fatal("expected BINANCE:BTCUSDT:1h to be invalidated")
	}
	if _, ok := cache.Get("BINANCE:ETHUSDT:15m"); !ok {
		t.Fatal("expected BINANCE:ETHUSDT:15m to remain valid")
	}
}
