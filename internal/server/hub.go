package server

import (
	"context"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/ordercraft-hq/terminal/internal/datafeed"
	"github.com/ordercraft-hq/terminal/internal/indicators/wickra"
	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

// StreamHub coordinates WebSocket connections from frontend clients
// and multiplexes subscriptions to underlying data providers.
type StreamHub struct {
	coordinator     *datafeed.Coordinator
	indicatorEngine IndicatorEngine
	mu              sync.RWMutex
	clients         map[*HubClient]bool
	topics          map[string]map[*HubClient]bool
	lastCandles     map[string]datafeed.Candle
	historyCandles  map[string][]wickra.CandleData
	authToken       string
}

type HubClient struct {
	hub              *StreamHub
	conn             *websocket.Conn
	subs             map[string]bool // topic keys
	indicatorMu      sync.Mutex
	indicatorSubs    map[string]IndicatorSession
	indicatorConfigs map[string][]wickra.EvalIndicatorInstance
	send             chan []byte
	done             chan struct{}
	closeOnce        sync.Once
}

type ClientActionMessage struct {
	Action      string                         `json:"action"` // "subscribe", "unsubscribe", "indicator_subscribe", "indicator_unsubscribe"
	Symbol      string                         `json:"symbol"`
	Resolution  string                         `json:"resolution"`
	Indicators  []wickra.EvalIndicatorInstance `json:"indicators,omitempty"`
	InstanceIDs []string                       `json:"instanceIds,omitempty"`
	Candles     []wickra.CandleData            `json:"candles,omitempty"`
}

type CandleBroadcastMessage struct {
	Type       string          `json:"type"` // "candle"
	Symbol     string          `json:"symbol"`
	Resolution string          `json:"resolution"`
	Candle     datafeed.Candle `json:"candle"`
}

func NewStreamHub(coordinator *datafeed.Coordinator) *StreamHub {
	return &StreamHub{
		coordinator:    coordinator,
		clients:        make(map[*HubClient]bool),
		topics:         make(map[string]map[*HubClient]bool),
		lastCandles:    make(map[string]datafeed.Candle),
		historyCandles: make(map[string][]wickra.CandleData),
	}
}

func (h *StreamHub) topicKey(symbol, resolution string) string {
	return strings.ToUpper(strings.TrimSpace(symbol)) + "::" + strings.TrimSpace(resolution)
}

func (h *StreamHub) SetAuthToken(token string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.authToken = token
}

func (h *StreamHub) SetIndicatorEngine(eng IndicatorEngine) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.indicatorEngine = eng
}

func (h *StreamHub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	expectedToken := h.authToken
	h.mu.RUnlock()

	if expectedToken != "" {
		token := r.URL.Query().Get("token")
		if token == "" {
			if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
				token = strings.TrimPrefix(auth, "Bearer ")
			}
		}
		if token != expectedToken {
			http.Error(w, `{"error":"unauthorized: invalid or missing auth token"}`, http.StatusUnauthorized)
			return
		}
	}

	var originPatterns []string
	if expectedToken != "" {
		// When token authentication is active, allow authenticated remote clients
		originPatterns = []string{"*"}
	} else {
		// Localhost only
		originPatterns = []string{"localhost:*", "127.0.0.1:*", "[::1]:*", "localhost", "127.0.0.1", "[::1]"}
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: originPatterns,
	})
	if err != nil {
		log.Printf("[StreamHub] Accept error: %v\n", err)
		return
	}

	// Protect against memory exhaustion with a 64 KB read limit per message
	conn.SetReadLimit(64 * 1024)

	client := &HubClient{
		hub:              h,
		conn:             conn,
		subs:             make(map[string]bool),
		indicatorSubs:    make(map[string]IndicatorSession),
		indicatorConfigs: make(map[string][]wickra.EvalIndicatorInstance),
		send:             make(chan []byte, 2048),
		done:             make(chan struct{}),
	}

	h.mu.Lock()
	h.clients[client] = true
	h.mu.Unlock()

	// Start writer and reader goroutines
	go client.writePump(r.Context())
	client.readPump(r.Context())
}

func (c *HubClient) close() {
	c.closeOnce.Do(func() {
		close(c.done)
		c.conn.Close(websocket.StatusNormalClosure, "client closed")
		c.indicatorMu.Lock()
		for _, s := range c.indicatorSubs {
			if s != nil {
				_ = s.Close(context.Background())
			}
		}
		c.indicatorSubs = nil
		c.indicatorConfigs = nil
		c.indicatorMu.Unlock()
		c.hub.removeClient(c)
	})
}

func (c *HubClient) writePump(ctx context.Context) {
	defer c.close()

	for {
		select {
		case <-ctx.Done():
			return
		case <-c.done:
			return
		case msg, ok := <-c.send:
			if !ok {
				return
			}
			writeCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
			err := c.conn.Write(writeCtx, websocket.MessageText, msg)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

func (c *HubClient) readPump(ctx context.Context) {
	defer c.close()

	for {
		var actionMsg ClientActionMessage
		err := wsjson.Read(ctx, c.conn, &actionMsg)
		if err != nil {
			return
		}

		sym := strings.TrimSpace(actionMsg.Symbol)
		res := strings.TrimSpace(actionMsg.Resolution)
		if sym == "" {
			continue
		}
		if res == "" {
			res = "15m"
		}

		action := strings.ToLower(actionMsg.Action)
		switch action {
		case "subscribe", "indicator_subscribe":
			c.hub.subscribe(c, sym, res)
			if len(actionMsg.Indicators) > 0 {
				c.hub.subscribeIndicators(c, sym, res, actionMsg.Indicators, actionMsg.Candles)
			}
		case "unsubscribe", "indicator_unsubscribe":
			if len(actionMsg.InstanceIDs) > 0 {
				c.hub.unsubscribeIndicators(c, sym, res, actionMsg.InstanceIDs)
			} else if action == "indicator_unsubscribe" {
				c.hub.unsubscribeIndicators(c, sym, res, nil)
			} else {
				c.hub.unsubscribe(c, sym, res)
			}
		}
	}
}

func (h *StreamHub) subscribeIndicators(client *HubClient, symbol, resolution string, configs []wickra.EvalIndicatorInstance, clientCandles []wickra.CandleData) {
	select {
	case <-client.done:
		return
	default:
	}

	key := h.topicKey(symbol, resolution)

	h.mu.RLock()
	eng := h.indicatorEngine
	h.mu.RUnlock()

	if eng == nil {
		return
	}

	client.indicatorMu.Lock()
	if client.indicatorSubs == nil {
		client.indicatorMu.Unlock()
		return
	}

	// Merge new configs with existing configs by InstanceID
	mergedConfigs := make([]wickra.EvalIndicatorInstance, 0)
	configMap := make(map[string]wickra.EvalIndicatorInstance)
	var order []string

	if existing, ok := client.indicatorConfigs[key]; ok {
		for _, cfg := range existing {
			configMap[cfg.InstanceID] = cfg
			order = append(order, cfg.InstanceID)
		}
	}

	for _, cfg := range configs {
		if _, exists := configMap[cfg.InstanceID]; !exists {
			order = append(order, cfg.InstanceID)
		}
		configMap[cfg.InstanceID] = cfg
	}

	for _, id := range order {
		mergedConfigs = append(mergedConfigs, configMap[id])
	}
	client.indicatorConfigs[key] = mergedConfigs
	client.indicatorMu.Unlock()

	session, err := eng.CreateSession(context.Background(), symbol, resolution, mergedConfigs)
	if err == nil {
		client.indicatorMu.Lock()
		if client.indicatorSubs != nil {
			if prev := client.indicatorSubs[key]; prev != nil {
				_ = prev.Close(context.Background())
			}
			client.indicatorSubs[key] = session
		}
		client.indicatorMu.Unlock()
	}

	// Pre-load recent candle history for decoupled accurate indicator evaluations
	h.mu.Lock()
	if len(clientCandles) > 0 {
		h.historyCandles[key] = clientCandles
	} else if len(h.historyCandles[key]) < 50 && h.coordinator != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		rawHistory, err := h.coordinator.GetCandles(ctx, symbol, resolution, 0, 0, 1000)
		cancel()
		if err == nil && len(rawHistory) > 0 {
			var cList []wickra.CandleData
			for _, rc := range rawHistory {
				cList = append(cList, wickra.CandleData{
					Time: rc.Time, Open: rc.Open, High: rc.High, Low: rc.Low, Close: rc.Close, Volume: rc.Volume,
				})
			}
			h.historyCandles[key] = cList
		}
	}
	h.mu.Unlock()
}

func (h *StreamHub) unsubscribeIndicators(client *HubClient, symbol, resolution string, instanceIDs []string) {
	select {
	case <-client.done:
		return
	default:
	}

	key := h.topicKey(symbol, resolution)

	h.mu.RLock()
	eng := h.indicatorEngine
	h.mu.RUnlock()

	client.indicatorMu.Lock()
	if client.indicatorSubs == nil {
		client.indicatorMu.Unlock()
		return
	}

	// If no specific instance IDs were requested, unsubscribe ALL indicators on this topic
	if len(instanceIDs) == 0 {
		if session := client.indicatorSubs[key]; session != nil {
			_ = session.Close(context.Background())
			delete(client.indicatorSubs, key)
		}
		if client.indicatorConfigs != nil {
			delete(client.indicatorConfigs, key)
		}
		client.indicatorMu.Unlock()
		return
	}

	existing, exists := client.indicatorConfigs[key]
	if !exists || len(existing) == 0 {
		if session := client.indicatorSubs[key]; session != nil {
			_ = session.Close(context.Background())
			delete(client.indicatorSubs, key)
		}
		client.indicatorMu.Unlock()
		return
	}

	removeSet := make(map[string]bool, len(instanceIDs))
	for _, id := range instanceIDs {
		removeSet[id] = true
	}

	var remaining []wickra.EvalIndicatorInstance
	for _, cfg := range existing {
		if !removeSet[cfg.InstanceID] {
			remaining = append(remaining, cfg)
		}
	}

	if len(remaining) == 0 {
		if session := client.indicatorSubs[key]; session != nil {
			_ = session.Close(context.Background())
			delete(client.indicatorSubs, key)
		}
		if client.indicatorConfigs != nil {
			delete(client.indicatorConfigs, key)
		}
		client.indicatorMu.Unlock()
		return
	}

	if len(remaining) == len(existing) {
		client.indicatorMu.Unlock()
		return
	}

	client.indicatorMu.Unlock()

	if eng == nil {
		return
	}

	newSession, err := eng.CreateSession(context.Background(), symbol, resolution, remaining)
	if err != nil {
		log.Printf("[StreamHub] Failed to recreate indicator session after selective unsubscribe for %s: %v", key, err)
		return
	}

	client.indicatorMu.Lock()
	defer client.indicatorMu.Unlock()

	select {
	case <-client.done:
		_ = newSession.Close(context.Background())
		return
	default:
	}

	if client.indicatorSubs == nil {
		_ = newSession.Close(context.Background())
		return
	}

	if prev := client.indicatorSubs[key]; prev != nil {
		_ = prev.Close(context.Background())
	}
	client.indicatorSubs[key] = newSession
	if client.indicatorConfigs != nil {
		client.indicatorConfigs[key] = remaining
	}
}

func (h *StreamHub) subscribe(client *HubClient, symbol, resolution string) {
	select {
	case <-client.done:
		return
	default:
	}

	key := h.topicKey(symbol, resolution)

	h.mu.Lock()
	defer h.mu.Unlock()

	if !h.clients[client] {
		return
	}

	client.subs[key] = true

	subscribers, exists := h.topics[key]
	if !exists {
		subscribers = make(map[*HubClient]bool)
		h.topics[key] = subscribers

		// First subscriber to this topic: start provider subscription
		provider, cleanSym, err := h.coordinator.ResolveProvider(symbol)
		if err == nil && provider != nil {
			symCapture := symbol
			resCapture := resolution
			log.Printf("[StreamHub] Starting subscription for %s (%s)", symCapture, resCapture)
			go func() {
				_ = provider.Subscribe(context.Background(), cleanSym, resCapture, func(c datafeed.Candle) {
					h.Broadcast(symCapture, resCapture, c)
				})
			}()
		} else {
			log.Printf("[StreamHub] Failed to resolve provider for %s: %v", symbol, err)
		}
	}

	subscribers[client] = true

	// If we already have a recent candle for this topic, immediately send it to the client
	if candle, ok := h.lastCandles[key]; ok {
		msg := CandleBroadcastMessage{
			Type:       "candle",
			Symbol:     symbol,
			Resolution: resolution,
			Candle:     candle,
		}
		if data, err := json.Marshal(msg); err == nil {
			select {
			case client.send <- data:
			default:
			}
		}
	}
}

func (h *StreamHub) unsubscribe(client *HubClient, symbol, resolution string) {
	key := h.topicKey(symbol, resolution)

	h.mu.Lock()
	delete(client.subs, key)

	subscribers, exists := h.topics[key]
	if exists {
		delete(subscribers, client)
		if len(subscribers) == 0 {
			delete(h.topics, key)

			// No more clients for this topic: unsubscribe from provider
			provider, cleanSym, err := h.coordinator.ResolveProvider(symbol)
			if err == nil && provider != nil {
				resCapture := resolution
				log.Printf("[StreamHub] Stopping subscription for %s (%s)", symbol, resCapture)
				go func() {
					_ = provider.Unsubscribe(cleanSym, resCapture)
				}()
			}
		}
	}
	h.mu.Unlock()

	client.indicatorMu.Lock()
	if client.indicatorSubs != nil {
		if session, ok := client.indicatorSubs[key]; ok && session != nil {
			_ = session.Close(context.Background())
			delete(client.indicatorSubs, key)
		}
	}
	if client.indicatorConfigs != nil {
		delete(client.indicatorConfigs, key)
	}
	client.indicatorMu.Unlock()
}

func (h *StreamHub) removeClient(client *HubClient) {
	h.mu.Lock()
	defer h.mu.Unlock()

	delete(h.clients, client)

	for key := range client.subs {
		subscribers, exists := h.topics[key]
		if exists {
			delete(subscribers, client)
			if len(subscribers) == 0 {
				delete(h.topics, key)

				parts := strings.Split(key, "::")
				if len(parts) >= 2 {
					sym := parts[0]
					res := parts[1]
					provider, cleanSym, err := h.coordinator.ResolveProvider(sym)
					if err == nil && provider != nil {
						go func() {
							_ = provider.Unsubscribe(cleanSym, res)
						}()
					}
				}
			}
		}
	}
}

func (h *StreamHub) Broadcast(symbol, resolution string, candle datafeed.Candle) {
	key := h.topicKey(symbol, resolution)

	msg := CandleBroadcastMessage{
		Type:       "candle",
		Symbol:     symbol,
		Resolution: resolution,
		Candle:     candle,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.Lock()
	if h.lastCandles == nil {
		h.lastCandles = make(map[string]datafeed.Candle)
	}
	h.lastCandles[key] = candle

	// Update recent candle history in sliding window (ring buffer)
	cData := wickra.CandleData{
		Time:   candle.Time,
		Open:   candle.Open,
		High:   candle.High,
		Low:    candle.Low,
		Close:  candle.Close,
		Volume: candle.Volume,
	}
	if h.historyCandles == nil {
		h.historyCandles = make(map[string][]wickra.CandleData)
	}
	history := h.historyCandles[key]
	if len(history) == 0 {
		history = []wickra.CandleData{cData}
	} else if cData.Time == history[len(history)-1].Time {
		// Same in-progress bar: update current bar with latest tick while preserving authentic OHLC bounds & volume
		last := history[len(history)-1]
		if last.Open != 0 {
			cData.Open = last.Open
		}
		if last.High > cData.High {
			cData.High = last.High
		}
		if last.Low < cData.Low && last.Low > 0 {
			cData.Low = last.Low
		}
		if last.Volume > cData.Volume {
			cData.Volume = last.Volume
		}
		history[len(history)-1] = cData
	} else if cData.Time > history[len(history)-1].Time {
		// New bar opened: append and cap
		history = append(history, cData)
		if len(history) > 2000 {
			history = history[len(history)-2000:]
		}
	}
	h.historyCandles[key] = history

	subscribers, exists := h.topics[key]
	if !exists || len(subscribers) == 0 {
		h.mu.Unlock()
		return
	}

	clientsList := make([]*HubClient, 0, len(subscribers))
	for cl := range subscribers {
		clientsList = append(clientsList, cl)
	}
	eng := h.indicatorEngine
	h.mu.Unlock()

	for _, cl := range clientsList {
		select {
		case cl.send <- data:
		default:
			// Buffer full, drop or close
		}
	}

	// 2. Compute and broadcast indicator updates
	// Using the true rolling history ensures technical indicators never collapse or stick to candle close.
	if len(history) >= 2 && eng != nil {
		evalHistory := history
		if len(evalHistory) > 2000 {
			evalHistory = evalHistory[len(evalHistory)-2000:]
		}

		for _, cl := range clientsList {
			cl.indicatorMu.Lock()
			cfgs := cl.indicatorConfigs[key]
			cl.indicatorMu.Unlock()

			if len(cfgs) == 0 {
				continue
			}

			evalResults, err := eng.Evaluate(context.Background(), evalHistory, cfgs)
			if err != nil || len(evalResults) == 0 {
				continue
			}

			sanitizedPlots := make(map[string]map[string]float64)
			for _, res := range evalResults {
				pMap := make(map[string]float64)
				for pID, points := range res.Plots {
					if len(points) > 0 {
						lastPt := points[len(points)-1]
						if !math.IsNaN(lastPt.Value) && !math.IsInf(lastPt.Value, 0) {
							pMap[pID] = lastPt.Value
						}
					}
				}
				if len(pMap) > 0 {
					sanitizedPlots[res.InstanceID] = pMap
				}
			}

			if len(sanitizedPlots) > 0 {
				indMsg := IndicatorBroadcastMessage{
					Type:       "indicator_update",
					Symbol:     symbol,
					Resolution: resolution,
					Time:       candle.Time,
					Plots:      sanitizedPlots,
				}
				if indData, err := json.Marshal(indMsg); err == nil {
					select {
					case cl.send <- indData:
					default:
					}
				}
			}
		}
	}
}
