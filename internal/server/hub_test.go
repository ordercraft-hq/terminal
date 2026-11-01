package server

import (
	"context"
	"encoding/json"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ordercraft-hq/terminal/internal/datafeed"
)

type dummyProvider struct {
	subscribed   atomic.Bool
	unsubscribed atomic.Bool
}

func (d *dummyProvider) Name() string {
	return "TESTEX"
}

func (d *dummyProvider) SupportedResolutions() []string {
	return []string{"15m"}
}

func (d *dummyProvider) GetHistory(ctx context.Context, symbol, resolution string, from, to int64, count int) ([]datafeed.Candle, error) {
	return nil, nil
}

func (d *dummyProvider) Search(ctx context.Context, query string) ([]datafeed.SymbolInfo, error) {
	return nil, nil
}

func (d *dummyProvider) Subscribe(ctx context.Context, symbol, resolution string, onCandle func(c datafeed.Candle)) error {
	d.subscribed.Store(true)
	return nil
}

func (d *dummyProvider) Unsubscribe(symbol, resolution string) error {
	d.unsubscribed.Store(true)
	return nil
}

func TestStreamHubSubscriptionAndBroadcast(t *testing.T) {
	coord := datafeed.NewCoordinator()
	p := &dummyProvider{}
	coord.RegisterProvider(p)

	hub := NewStreamHub(coord)

	client := &HubClient{
		hub:  hub,
		subs: make(map[string]bool),
		send: make(chan []byte, 10),
		done: make(chan struct{}),
	}

	hub.mu.Lock()
	hub.clients[client] = true
	hub.mu.Unlock()

	// Subscribe client
	hub.subscribe(client, "TESTEX:BTCUSD", "15m")

	time.Sleep(50 * time.Millisecond)
	if !p.subscribed.Load() {
		t.Fatalf("expected provider to be subscribed")
	}

	// Broadcast candle
	testCandle := datafeed.Candle{
		Time:   1700000000,
		Open:   50000,
		High:   50100,
		Low:    49900,
		Close:  50050,
		Volume: 10,
	}
	hub.Broadcast("TESTEX:BTCUSD", "15m", testCandle)

	select {
	case msg := <-client.send:
		var parsed CandleBroadcastMessage
		if err := json.Unmarshal(msg, &parsed); err != nil {
			t.Fatalf("failed to unmarshal broadcast message: %v", err)
		}
		if parsed.Symbol != "TESTEX:BTCUSD" || parsed.Candle.Close != 50050 {
			t.Fatalf("unexpected message: %+v", parsed)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("timed out waiting for broadcast message")
	}

	// Unsubscribe
	hub.unsubscribe(client, "TESTEX:BTCUSD", "15m")
	time.Sleep(50 * time.Millisecond)

	if !p.unsubscribed.Load() {
		t.Fatalf("expected provider to be unsubscribed")
	}
}
