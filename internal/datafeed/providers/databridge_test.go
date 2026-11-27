package providers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ordercraft-hq/terminal/internal/datafeed"
	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

func TestDataBridgeNormalization(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"1m", "1m"},
		{"5m", "5m"},
		{"15m", "15m"},
		{"30m", "30m"},
		{"1h", "1h"},
		{"4h", "4h"},
		{"1D", "1d"},
		{"1d", "1d"},
		{"D", "1d"},
		{"1W", "1w"},
		{"W", "1w"},
	}

	for _, tt := range tests {
		actual := normalizeBridgeTimeframe(tt.input)
		if actual != tt.expected {
			t.Errorf("normalizeBridgeTimeframe(%q) = %q; want %q", tt.input, actual, tt.expected)
		}
	}
}

func TestDataBridgeCleanSymbol(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"DATABRIDGE:ENQZ26", "ENQZ26"},
		{"BRIDGE:ENQZ26", "ENQZ26"},
		{"L2FEED:ENQZ26", "ENQZ26"},
		{"ENQZ26", "ENQZ26"},
		{"MNQZ26", "MNQZ26"},
	}

	for _, tt := range tests {
		actual := cleanBridgeSymbol(tt.input)
		if actual != tt.expected {
			t.Errorf("cleanBridgeSymbol(%q) = %q; want %q", tt.input, actual, tt.expected)
		}
	}
}

func TestDataBridgePriceScale(t *testing.T) {
	tests := []struct {
		tickSize float64
		expected int
	}{
		{0.25, 100},
		{0.01, 100},
		{0.0001, 10000},
		{1.0, 1},
		{0.025, 1000},
	}

	for _, tt := range tests {
		actual := computePriceScale(tt.tickSize)
		if actual != tt.expected {
			t.Errorf("computePriceScale(%v) = %d; want %d", tt.tickSize, actual, tt.expected)
		}
	}
}

func TestDataBridgeSearchAndHistory(t *testing.T) {
	p := NewDataBridgeProvider()
	defer p.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 1. Search symbols
	symbols, err := p.Search(ctx, "NQ")
	if err != nil {
		t.Skipf("DataBridge not reachable at %s: %v", p.baseURL, err)
	}
	if len(symbols) == 0 {
		t.Skipf("DataBridge at %s returned 0 symbols (server not running)", p.baseURL)
	}

	foundENQ := false
	for _, s := range symbols {
		if s.Symbol == "ENQZ26" || s.Symbol == "MNQZ26" || strings.Contains(s.Symbol, "ENQ") {
			foundENQ = true
			break
		}
	}
	if !foundENQ {
		t.Logf("Search returned: %+v", symbols)
	}

	// 2. Fetch history
	candles, err := p.GetHistory(ctx, "DATABRIDGE:ENQZ26", "15m", 0, 0, 10)
	if err != nil {
		if strings.Contains(err.Error(), "connectex") || strings.Contains(err.Error(), "connection refused") {
			t.Skipf("DataBridge at %s not running, skipping GetHistory test: %v", p.baseURL, err)
		}
		t.Fatalf("GetHistory failed: %v", err)
	}
	if len(candles) == 0 {
		t.Fatalf("Expected candles for ENQZ26, got 0")
	}

	last := candles[len(candles)-1]
	t.Logf("Fetched %d candles for ENQZ26. Latest bar: Time=%d, Open=%f, Close=%f",
		len(candles), last.Time, last.Open, last.Close)

	if last.Open <= 0 || last.Close <= 0 {
		t.Errorf("Unexpected candle prices: %+v", last)
	}
}

func TestDataBridgeSubscribeLive(t *testing.T) {
	p := NewDataBridgeProvider()
	defer p.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	received := make(chan datafeed.Candle, 5)
	err := p.Subscribe(ctx, "ENQZ26", "1m", func(c datafeed.Candle) {
		received <- c
	})
	if err != nil {
		t.Fatalf("Subscribe failed: %v", err)
	}

	// Expect snapshot bar within 3 seconds
	select {
	case candle := <-received:
		t.Logf("Successfully received snapshot bar: Time=%d, Close=%f, Vol=%f",
			candle.Time, candle.Close, candle.Volume)
		if candle.Close <= 0 {
			t.Errorf("Invalid snapshot candle close: %f", candle.Close)
		}
	case <-time.After(3 * time.Second):
		t.Logf("No snapshot received in 3s (acceptable if bridge has no active bar cached)")
	}

	_ = p.Unsubscribe("ENQZ26", "1m")
}

func TestDataBridgeLiveSupervisorUpdates(t *testing.T) {
	p := NewDataBridgeProvider()
	defer p.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	// Check if bridge server is reachable
	symbols, err := p.Search(ctx, "ENQ")
	if err != nil || len(symbols) == 0 {
		t.Skipf("DataBridge not reachable at %s, skipping live supervisor test", p.baseURL)
	}

	received := make(chan datafeed.Candle, 20)
	err = p.Subscribe(ctx, "ENQZ26", "1m", func(c datafeed.Candle) {
		received <- c
	})
	if err != nil {
		t.Fatalf("Subscribe failed: %v", err)
	}

	count := 0
	deadline := time.After(6 * time.Second)
	for {
		select {
		case c := <-received:
			count++
			t.Logf("Update #%d received: Time=%d, Open=%f, High=%f, Low=%f, Close=%f, Vol=%f",
				count, c.Time, c.Open, c.High, c.Low, c.Close, c.Volume)
			if count >= 2 {
				_ = p.Unsubscribe("ENQZ26", "1m")
				return
			}
		case <-deadline:
			if count < 2 {
				t.Fatalf("Expected at least 2 live bar updates within 6s, got %d", count)
			}
			return
		}
	}
}

func TestDataBridgeUnsubscribeFootprintSendsUnsubscribeTicks(t *testing.T) {
	var mu sync.Mutex
	var actions []string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")
		for {
			var cmd map[string]interface{}
			if err := wsjson.Read(r.Context(), conn, &cmd); err != nil {
				return
			}
			if act, ok := cmd["action"].(string); ok {
				mu.Lock()
				actions = append(actions, act)
				mu.Unlock()
			}
		}
	}))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	p := &DataBridgeProvider{
		httpClient:          datafeed.NewHTTPClient(5 * time.Second),
		baseURL:             srv.URL,
		wsURL:               wsURL,
		activeSubs:          make(map[string]map[uint64]func(c datafeed.Candle)),
		activeTickSubs:      make(map[string]map[uint64]func(t datafeed.TickData)),
		activeDepthSubs:     make(map[string]map[uint64]func(d datafeed.OrderBookDepth)),
		activeFootprintSubs: make(map[string]map[uint64]func(f datafeed.FootprintBar)),
		aggregators:         make(map[string]*datafeed.DeltaAggregator),
		lastTickTime:        make(map[string]time.Time),
		symbolAlias:         make(map[string]string),
		aliasToSymbol:       make(map[string]string),
		reconnectCh:         make(chan struct{}, 1),
		stopCh:              make(chan struct{}),
	}
	defer p.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("dial mock ws: %v", err)
	}
	p.wsMu.Lock()
	p.wsConn = conn
	p.connCtx = ctx
	p.wsMu.Unlock()

	if err := p.SubscribeFootprint(ctx, "ENQ", "1m", func(f datafeed.FootprintBar) {}); err != nil {
		t.Fatalf("SubscribeFootprint failed: %v", err)
	}
	if err := p.UnsubscribeFootprint("ENQ", "1m"); err != nil {
		t.Fatalf("UnsubscribeFootprint failed: %v", err)
	}

	deadline := time.Now().Add(2 * time.Second)
	foundUnsubTicks := false
	for time.Now().Before(deadline) {
		mu.Lock()
		for _, a := range actions {
			if a == "unsubscribe_ticks" {
				foundUnsubTicks = true
				break
			}
		}
		mu.Unlock()
		if foundUnsubTicks {
			break
		}
		time.Sleep(15 * time.Millisecond)
	}
	if !foundUnsubTicks {
		mu.Lock()
		defer mu.Unlock()
		t.Fatalf("expected unsubscribe_ticks action after UnsubscribeFootprint, got %v", actions)
	}
}

