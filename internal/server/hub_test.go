package server

import (
	"context"
	"encoding/json"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ordercraft-hq/terminal/internal/datafeed"
	"github.com/ordercraft-hq/terminal/internal/indicators/wickra"
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

type raceTestProvider struct {
	historyDelay time.Duration
	subCtxsMu    sync.Mutex
	subCtxs      []context.Context
	unsubCount   atomic.Int64
}

func (p *raceTestProvider) Name() string                   { return "RACEEX" }
func (p *raceTestProvider) SupportedResolutions() []string { return []string{"1m"} }
func (p *raceTestProvider) GetHistory(ctx context.Context, symbol, resolution string, from, to int64, count int) ([]datafeed.Candle, error) {
	if p.historyDelay > 0 {
		select {
		case <-time.After(p.historyDelay):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return []datafeed.Candle{{Time: 100, Open: 10, High: 11, Low: 9, Close: 10, Volume: 5}}, nil
}
func (p *raceTestProvider) Search(ctx context.Context, query string) ([]datafeed.SymbolInfo, error) {
	return nil, nil
}
func (p *raceTestProvider) Subscribe(ctx context.Context, symbol, resolution string, onCandle func(c datafeed.Candle)) error {
	p.subCtxsMu.Lock()
	p.subCtxs = append(p.subCtxs, ctx)
	p.subCtxsMu.Unlock()
	<-ctx.Done()
	return ctx.Err()
}
func (p *raceTestProvider) Unsubscribe(symbol, resolution string) error {
	p.unsubCount.Add(1)
	return nil
}

type countingIndicatorEngine struct {
	createCalls atomic.Int64
	updateCalls atomic.Int64
	closeCalls  atomic.Int64
}

func (e *countingIndicatorEngine) GetCatalog(category, query string) []wickra.IndicatorDescriptor {
	return nil
}
func (e *countingIndicatorEngine) GetDescriptor(id string) (wickra.IndicatorDescriptor, bool) {
	return wickra.IndicatorDescriptor{}, false
}
func (e *countingIndicatorEngine) Evaluate(ctx context.Context, candles []wickra.CandleData, configs []wickra.EvalIndicatorInstance) ([]wickra.EvalResult, error) {
	return nil, nil
}
func (e *countingIndicatorEngine) CreateSession(ctx context.Context, symbol, resolution string, configs []wickra.EvalIndicatorInstance) (wickra.IndicatorSession, error) {
	e.createCalls.Add(1)
	return &countingIndicatorSession{eng: e, configs: configs}, nil
}

type countingIndicatorSession struct {
	eng     *countingIndicatorEngine
	configs []wickra.EvalIndicatorInstance
	count   atomic.Int64
}

func (s *countingIndicatorSession) Update(ctx context.Context, c wickra.CandleData) (map[string]map[string]float64, error) {
	s.eng.updateCalls.Add(1)
	n := s.count.Add(1)
	out := make(map[string]map[string]float64, len(s.configs))
	for _, cfg := range s.configs {
		out[cfg.InstanceID] = map[string]float64{"plot": c.Close + float64(n)}
	}
	return out, nil
}

func (s *countingIndicatorSession) Close(ctx context.Context) error {
	s.eng.closeCalls.Add(1)
	return nil
}

func TestStreamHubConcurrentBroadcastSubscribeAndSessionUpdate(t *testing.T) {
	coord := datafeed.NewCoordinator()
	prov := &raceTestProvider{historyDelay: 250 * time.Millisecond}
	coord.RegisterProvider(prov)

	hub := NewStreamHub(coord)
	defer hub.Close()

	eng := &countingIndicatorEngine{}
	hub.SetIndicatorEngine(eng)

	const numClients = 4
	clients := make([]*HubClient, numClients)
	for i := 0; i < numClients; i++ {
		cl := &HubClient{
			hub:              hub,
			subs:             make(map[string]bool),
			indicatorSubs:    make(map[string]IndicatorSession),
			indicatorConfigs: make(map[string][]wickra.EvalIndicatorInstance),
			send:             make(chan []byte, 256),
			done:             make(chan struct{}),
		}
		clients[i] = cl
		hub.mu.Lock()
		hub.clients[cl] = true
		hub.mu.Unlock()
		hub.subscribe(cl, "RACEEX:BTCUSD", "1m")
	}

	// Verify provider.Subscribe received a cancellable context
	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		prov.subCtxsMu.Lock()
		nCtx := len(prov.subCtxs)
		prov.subCtxsMu.Unlock()
		if nCtx > 0 {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	prov.subCtxsMu.Lock()
	if len(prov.subCtxs) != 1 {
		prov.subCtxsMu.Unlock()
		t.Fatalf("expected 1 provider Subscribe call, got %d", len(prov.subCtxs))
	}
	subCtx := prov.subCtxs[0]
	prov.subCtxsMu.Unlock()

	sharedCfgs := []wickra.EvalIndicatorInstance{
		{InstanceID: "shared_1", IndicatorID: "wickra.sma", Inputs: map[string]interface{}{"period": 5}},
	}

	// Slow GetHistory in subscribeIndicators must NOT block Broadcast.
	startSub := time.Now()
	for _, cl := range clients {
		hub.subscribeIndicators(cl, "RACEEX:BTCUSD", "1m", sharedCfgs, nil)
	}
	if elapsed := time.Since(startSub); elapsed > 150*time.Millisecond {
		t.Fatalf("subscribeIndicators blocked on slow GetHistory (%v)", elapsed)
	}

	// Deduplication: 4 clients with identical (topic, config) share 1 IndicatorSession
	if got := eng.createCalls.Load(); got != 1 {
		t.Fatalf("expected 1 shared CreateSession call across 4 clients, got %d", got)
	}

	// Concurrent Broadcast + subscribeIndicators/unsubscribeIndicators + queue drain
	var wg sync.WaitGroup
	wg.Add(3)
	go func() {
		defer wg.Done()
		for i := 0; i < 60; i++ {
			ts := int64(1700000000 + (i/3)*60)
			hub.Broadcast("RACEEX:BTCUSD", "1m", datafeed.Candle{
				Time: ts, Open: 100, High: 102, Low: 99, Close: 101 + float64(i), Volume: 10,
			})
			time.Sleep(time.Millisecond)
		}
	}()

	go func() {
		defer wg.Done()
		for i := 0; i < 10; i++ {
			hub.subscribeIndicators(clients[0], "RACEEX:BTCUSD", "1m", []wickra.EvalIndicatorInstance{
				{InstanceID: "dyn_1", IndicatorID: "wickra.ema", Inputs: map[string]interface{}{"period": 3 + i}},
			}, nil)
			hub.unsubscribeIndicators(clients[0], "RACEEX:BTCUSD", "1m", []string{"dyn_1"})
			time.Sleep(3 * time.Millisecond)
		}
	}()

	go func() {
		defer wg.Done()
		// Drain client channels concurrently
		stopAt := time.Now().Add(300 * time.Millisecond)
		for time.Now().Before(stopAt) {
			for _, cl := range clients {
				select {
				case <-cl.send:
				default:
				}
			}
			time.Sleep(time.Millisecond)
		}
	}()
	wg.Wait()

	// For the 3 clients still sharing sharedCfgs, updateCalls should be far less than 60*3
	if updates := eng.updateCalls.Load(); updates == 0 {
		t.Fatalf("expected incremental session.Update calls during Broadcast, got 0")
	}

	// Unsubscribe all clients -> topic context must cancel and shared session must close
	for _, cl := range clients {
		hub.unsubscribe(cl, "RACEEX:BTCUSD", "1m")
	}

	select {
	case <-subCtx.Done():
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("expected provider Subscribe context to be cancelled when last subscriber unsubscribed")
	}

	if closes := eng.closeCalls.Load(); closes < 1 {
		t.Fatalf("expected shared indicator session to close when last subscriber unsubscribed, got %d", closes)
	}
}
