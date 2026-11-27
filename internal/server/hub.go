package server

import (
	"context"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ordercraft-hq/terminal/internal/datafeed"
	"github.com/ordercraft-hq/terminal/internal/indicators/wickra"
	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

const (
	clientWriteTimeout  = 3 * time.Second
	maxHistoryCandles   = 2000
	maxConsecutiveDrops = 256
)

type sharedSessionKey struct {
	topic     string
	configKey string
}

type sharedIndicatorSession struct {
	hub        *StreamHub
	key        sharedSessionKey
	inner      IndicatorSession
	refCount   int
	closed     atomic.Bool
	seeded     bool
	hasUpdates bool
	mu         sync.Mutex // serializes inner.Update / Seed calls across concurrent Broadcasts
}

func (s *sharedIndicatorSession) update(ctx context.Context, c wickra.CandleData) (map[string]map[string]float64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed.Load() || s.inner == nil {
		return nil, nil
	}
	s.hasUpdates = true
	return s.inner.Update(ctx, c)
}

func (s *sharedIndicatorSession) seedIfIdle(ctx context.Context, candles []wickra.CandleData) {
	if len(candles) == 0 {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed.Load() || s.inner == nil || s.seeded || s.hasUpdates {
		return
	}
	s.seeded = true
	if seeder, ok := s.inner.(interface {
		Seed(context.Context, []wickra.CandleData) error
	}); ok {
		_ = seeder.Seed(ctx, candles)
	}
}

func (s *sharedIndicatorSession) release(ctx context.Context) error {
	s.hub.sharedMu.Lock()
	if s.closed.Load() {
		s.hub.sharedMu.Unlock()
		return nil
	}
	s.refCount--
	if s.refCount > 0 {
		s.hub.sharedMu.Unlock()
		return nil
	}
	s.closed.Store(true)
	if s.hub.sharedSessions != nil {
		delete(s.hub.sharedSessions, s.key)
	}
	s.hub.sharedMu.Unlock()

	s.mu.Lock()
	inner := s.inner
	s.inner = nil
	s.mu.Unlock()
	if inner != nil {
		return inner.Close(ctx)
	}
	return nil
}

type hubSessionHandle struct {
	shared    *sharedIndicatorSession
	closeOnce sync.Once
}

func (h *hubSessionHandle) Update(ctx context.Context, c wickra.CandleData) (map[string]map[string]float64, error) {
	if h.shared == nil {
		return nil, nil
	}
	return h.shared.update(ctx, c)
}

func (h *hubSessionHandle) Close(ctx context.Context) error {
	var err error
	h.closeOnce.Do(func() {
		if h.shared != nil {
			err = h.shared.release(ctx)
		}
	})
	return err
}

// StreamHub coordinates WebSocket connections from frontend clients
// and multiplexes subscriptions to underlying data providers.
type StreamHub struct {
	coordinator     *datafeed.Coordinator
	indicatorEngine IndicatorEngine
	ctx             context.Context
	cancel          context.CancelFunc
	mu              sync.RWMutex
	clients         map[*HubClient]bool
	topics          map[string]map[*HubClient]bool
	topicCancels    map[string]context.CancelFunc
	lastCandles     map[string]datafeed.Candle
	historyCandles  map[string][]wickra.CandleData
	sharedMu        sync.Mutex
	sharedSessions  map[sharedSessionKey]*sharedIndicatorSession
	indWorkerOnce   sync.Once
	indJobs         chan func()
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
	droppedMsgs      atomic.Int64
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
	ctx, cancel := context.WithCancel(context.Background())
	return &StreamHub{
		coordinator:    coordinator,
		ctx:            ctx,
		cancel:         cancel,
		clients:        make(map[*HubClient]bool),
		topics:         make(map[string]map[*HubClient]bool),
		topicCancels:   make(map[string]context.CancelFunc),
		lastCandles:    make(map[string]datafeed.Candle),
		historyCandles: make(map[string][]wickra.CandleData),
		sharedSessions: make(map[sharedSessionKey]*sharedIndicatorSession),
	}
}

func (h *StreamHub) hubContext() context.Context {
	if h.ctx != nil {
		return h.ctx
	}
	return context.Background()
}

func (h *StreamHub) enqueueIndicatorJob(job func()) {
	ctx := h.hubContext()
	if ctx.Err() != nil {
		return
	}
	h.indWorkerOnce.Do(func() {
		h.indJobs = make(chan func(), 256)
		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case fn := <-h.indJobs:
					if fn != nil {
						fn()
					}
				}
			}
		}()
	})
	select {
	case h.indJobs <- job:
	default:
		// Drop overload indicator update rather than stalling upstream provider read loops
	}
}

// Close cancels all active provider subscription contexts and closes connected clients.
func (h *StreamHub) Close() {
	if h.cancel != nil {
		h.cancel()
	}

	h.mu.Lock()
	for key, cancelFn := range h.topicCancels {
		if cancelFn != nil {
			cancelFn()
		}
		delete(h.topicCancels, key)
	}
	clients := make([]*HubClient, 0, len(h.clients))
	for cl := range h.clients {
		clients = append(clients, cl)
	}
	h.mu.Unlock()

	for _, cl := range clients {
		cl.close()
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
		if c.conn != nil {
			c.conn.Close(websocket.StatusNormalClosure, "client closed")
		}
		c.indicatorMu.Lock()
		for _, s := range c.indicatorSubs {
			if s != nil {
				_ = s.Close(context.Background())
			}
		}
		c.indicatorSubs = nil
		c.indicatorConfigs = nil
		c.indicatorMu.Unlock()
		if c.hub != nil {
			c.hub.removeClient(c)
		}
	})
}

type writeTimeoutCtx struct {
	parent   context.Context
	mu       sync.Mutex
	done     chan struct{}
	err      error
	deadline time.Time
	closed   bool
}

func newWriteTimeoutCtx(parent context.Context) *writeTimeoutCtx {
	return &writeTimeoutCtx{
		parent: parent,
		done:   make(chan struct{}),
	}
}

func (w *writeTimeoutCtx) Deadline() (time.Time, bool) {
	w.mu.Lock()
	d := w.deadline
	w.mu.Unlock()
	return d, !d.IsZero()
}

func (w *writeTimeoutCtx) Done() <-chan struct{} {
	w.mu.Lock()
	ch := w.done
	w.mu.Unlock()
	return ch
}

func (w *writeTimeoutCtx) Err() error {
	w.mu.Lock()
	err := w.err
	w.mu.Unlock()
	return err
}

func (w *writeTimeoutCtx) Value(key any) any {
	return w.parent.Value(key)
}

func (w *writeTimeoutCtx) setDeadline(d time.Time) {
	w.mu.Lock()
	w.deadline = d
	w.mu.Unlock()
}

func (w *writeTimeoutCtx) trigger(err error) {
	w.mu.Lock()
	if !w.closed {
		w.closed = true
		w.err = err
		close(w.done)
	}
	w.mu.Unlock()
}

func (w *writeTimeoutCtx) resetAfterFire() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.parent.Err() != nil {
		return false
	}
	if w.closed {
		w.done = make(chan struct{})
		w.err = nil
		w.closed = false
	}
	return true
}

func (c *HubClient) trySend(data []byte) {
	select {
	case <-c.done:
		return
	default:
	}

	select {
	case c.send <- data:
		c.droppedMsgs.Store(0)
		return
	default:
	}

	// Send queue full: coalesce by evicting one oldest stale frame and retrying.
	select {
	case <-c.send:
	default:
	}

	select {
	case c.send <- data:
		if c.droppedMsgs.Add(1) > maxConsecutiveDrops {
			go c.close()
		}
	default:
		// Still blocked: disconnect sluggish/dead client cleanly outside caller locks.
		go c.close()
	}
}

func (c *HubClient) writePump(ctx context.Context) {
	defer c.close()

	wctx := newWriteTimeoutCtx(ctx)
	stopParent := context.AfterFunc(ctx, func() {
		err := ctx.Err()
		if err == nil {
			err = context.Canceled
		}
		wctx.trigger(err)
	})
	defer stopParent()

	timer := time.AfterFunc(time.Hour, func() {
		wctx.trigger(context.DeadlineExceeded)
	})
	timer.Stop()
	defer timer.Stop()

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
			wctx.setDeadline(time.Now().Add(clientWriteTimeout))
			timer.Reset(clientWriteTimeout)
			err := c.conn.Write(wctx, websocket.MessageText, msg)
			stopped := timer.Stop()
			if err != nil {
				return
			}
			if !stopped && !wctx.resetAfterFire() {
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

func canonicalIndicatorConfigKey(configs []wickra.EvalIndicatorInstance) string {
	b, err := json.Marshal(configs)
	if err != nil {
		return ""
	}
	return string(b)
}

func (h *StreamHub) acquireSharedSession(
	topicKey string,
	symbol string,
	resolution string,
	eng IndicatorEngine,
	configs []wickra.EvalIndicatorInstance,
	seedCandles []wickra.CandleData,
) (*hubSessionHandle, error) {
	cfgKey := canonicalIndicatorConfigKey(configs)
	sKey := sharedSessionKey{topic: topicKey, configKey: cfgKey}

	h.sharedMu.Lock()
	if h.sharedSessions == nil {
		h.sharedSessions = make(map[sharedSessionKey]*sharedIndicatorSession)
	}
	if existing, ok := h.sharedSessions[sKey]; ok && !existing.closed.Load() {
		existing.refCount++
		h.sharedMu.Unlock()
		return &hubSessionHandle{shared: existing}, nil
	}
	h.sharedMu.Unlock()

	session, err := eng.CreateSession(context.Background(), symbol, resolution, configs)
	if err != nil {
		return nil, err
	}

	seeded := false
	if len(seedCandles) > 0 {
		if seeder, ok := session.(interface {
			Seed(context.Context, []wickra.CandleData) error
		}); ok {
			if err := seeder.Seed(context.Background(), seedCandles); err == nil {
				seeded = true
			}
		}
	}

	h.sharedMu.Lock()
	if existing, ok := h.sharedSessions[sKey]; ok && !existing.closed.Load() {
		existing.refCount++
		h.sharedMu.Unlock()
		_ = session.Close(context.Background())
		return &hubSessionHandle{shared: existing}, nil
	}
	shared := &sharedIndicatorSession{
		hub:      h,
		key:      sKey,
		inner:    session,
		refCount: 1,
		seeded:   seeded,
	}
	h.sharedSessions[sKey] = shared
	h.sharedMu.Unlock()

	return &hubSessionHandle{shared: shared}, nil
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
	coord := h.coordinator
	h.mu.RUnlock()

	if eng == nil {
		return
	}

	const (
		maxClientIndicatorTopics  = 16
		maxClientIndicatorConfigs = 32
	)

	client.indicatorMu.Lock()
	if client.indicatorSubs == nil {
		client.indicatorMu.Unlock()
		return
	}
	if _, hasTopic := client.indicatorConfigs[key]; !hasTopic && len(client.indicatorConfigs) >= maxClientIndicatorTopics {
		client.indicatorMu.Unlock()
		return
	}

	// Merge new configs with existing configs by InstanceID
	mergedConfigs := make([]wickra.EvalIndicatorInstance, 0, len(configs))
	configMap := make(map[string]wickra.EvalIndicatorInstance, len(configs))
	var order []string

	if existing, ok := client.indicatorConfigs[key]; ok {
		for _, cfg := range existing {
			configMap[cfg.InstanceID] = cfg
			order = append(order, cfg.InstanceID)
		}
	}

	for _, cfg := range configs {
		if _, exists := configMap[cfg.InstanceID]; !exists {
			if len(order) >= maxClientIndicatorConfigs {
				continue
			}
			order = append(order, cfg.InstanceID)
		}
		configMap[cfg.InstanceID] = cfg
	}

	for _, id := range order {
		mergedConfigs = append(mergedConfigs, configMap[id])
	}
	client.indicatorConfigs[key] = mergedConfigs
	client.indicatorMu.Unlock()

	// Use clientCandles only for this client's session seed; never overwrite shared h.historyCandles[key] across clients.
	var seedCandles []wickra.CandleData
	needAsyncFetch := false
	h.mu.RLock()
	existingHist := h.historyCandles[key]
	if len(clientCandles) > 0 {
		start := 0
		if len(clientCandles) > maxHistoryCandles {
			start = len(clientCandles) - maxHistoryCandles
		}
		seedCandles = make([]wickra.CandleData, len(clientCandles)-start)
		copy(seedCandles, clientCandles[start:])
	} else {
		needAsyncFetch = len(existingHist) < 50 && coord != nil
		if len(existingHist) > 0 {
			seedCandles = make([]wickra.CandleData, len(existingHist))
			copy(seedCandles, existingHist)
		}
	}
	h.mu.RUnlock()

	session, err := h.acquireSharedSession(key, symbol, resolution, eng, mergedConfigs, seedCandles)
	if err != nil {
		return
	}

	var prevSession IndicatorSession
	var attached bool
	client.indicatorMu.Lock()
	select {
	case <-client.done:
		client.indicatorMu.Unlock()
		_ = session.Close(context.Background())
		return
	default:
	}
	if client.indicatorSubs != nil {
		prevSession = client.indicatorSubs[key]
		client.indicatorSubs[key] = session
		attached = true
	} else {
		prevSession = session
	}
	client.indicatorMu.Unlock()

	if prevSession != nil {
		_ = prevSession.Close(context.Background())
	}

	if needAsyncFetch && attached {
		sharedRef := session.shared
		go func() {
			fetchCtx, cancel := context.WithTimeout(h.hubContext(), 2*time.Second)
			rawHistory, fetchErr := coord.GetCandles(fetchCtx, symbol, resolution, 0, 0, 1000)
			cancel()
			if fetchErr != nil || len(rawHistory) == 0 {
				return
			}
			cList := make([]wickra.CandleData, len(rawHistory))
			for i, rc := range rawHistory {
				cList[i] = wickra.CandleData{
					Time: rc.Time, Open: rc.Open, High: rc.High, Low: rc.Low, Close: rc.Close, Volume: rc.Volume,
				}
			}

			var toSeed []wickra.CandleData
			h.mu.Lock()
			if h.historyCandles == nil {
				h.historyCandles = make(map[string][]wickra.CandleData)
			}
			if len(h.historyCandles[key]) < 50 {
				h.historyCandles[key] = cList
				toSeed = make([]wickra.CandleData, len(cList))
				copy(toSeed, cList)
			}
			h.mu.Unlock()

			if len(toSeed) > 0 && sharedRef != nil {
				sharedRef.seedIfIdle(h.hubContext(), toSeed)
			}
		}()
	}
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
		session := client.indicatorSubs[key]
		delete(client.indicatorSubs, key)
		if client.indicatorConfigs != nil {
			delete(client.indicatorConfigs, key)
		}
		client.indicatorMu.Unlock()
		if session != nil {
			_ = session.Close(context.Background())
		}
		return
	}

	existing, exists := client.indicatorConfigs[key]
	if !exists || len(existing) == 0 {
		session := client.indicatorSubs[key]
		delete(client.indicatorSubs, key)
		client.indicatorMu.Unlock()
		if session != nil {
			_ = session.Close(context.Background())
		}
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
		session := client.indicatorSubs[key]
		delete(client.indicatorSubs, key)
		if client.indicatorConfigs != nil {
			delete(client.indicatorConfigs, key)
		}
		client.indicatorMu.Unlock()
		if session != nil {
			_ = session.Close(context.Background())
		}
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

	h.mu.RLock()
	var seedCandles []wickra.CandleData
	if hist := h.historyCandles[key]; len(hist) > 0 {
		seedCandles = make([]wickra.CandleData, len(hist))
		copy(seedCandles, hist)
	}
	h.mu.RUnlock()

	newSession, err := h.acquireSharedSession(key, symbol, resolution, eng, remaining, seedCandles)
	if err != nil {
		log.Printf("[StreamHub] Failed to recreate indicator session after selective unsubscribe for %s: %v", key, err)
		return
	}

	var prevSession IndicatorSession
	client.indicatorMu.Lock()
	select {
	case <-client.done:
		client.indicatorMu.Unlock()
		_ = newSession.Close(context.Background())
		return
	default:
	}

	if client.indicatorSubs == nil {
		client.indicatorMu.Unlock()
		_ = newSession.Close(context.Background())
		return
	}

	prevSession = client.indicatorSubs[key]
	client.indicatorSubs[key] = newSession
	if client.indicatorConfigs != nil {
		client.indicatorConfigs[key] = remaining
	}
	client.indicatorMu.Unlock()

	if prevSession != nil {
		_ = prevSession.Close(context.Background())
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
	if !h.clients[client] {
		h.mu.Unlock()
		return
	}

	client.subs[key] = true

	subscribers, exists := h.topics[key]
	if !exists {
		subscribers = make(map[*HubClient]bool)
		h.topics[key] = subscribers

		// First subscriber to this topic: start provider subscription with a cancellable lifetime context
		if h.coordinator != nil {
			provider, cleanSym, err := h.coordinator.ResolveProvider(symbol)
			if err == nil && provider != nil {
				if h.topicCancels == nil {
					h.topicCancels = make(map[string]context.CancelFunc)
				}
				subCtx, subCancel := context.WithCancel(h.hubContext())
				h.topicCancels[key] = subCancel

				symCapture := symbol
				resCapture := resolution
				log.Printf("[StreamHub] Starting subscription for %s (%s)", symCapture, resCapture)
				go func() {
					_ = provider.Subscribe(subCtx, cleanSym, resCapture, func(c datafeed.Candle) {
						h.Broadcast(symCapture, resCapture, c)
					})
				}()

				// If provider also supports L2 footprint, hook it up as well
				if l2p, ok := provider.(datafeed.L2DataProvider); ok {
					go func() {
						_ = l2p.SubscribeFootprint(subCtx, cleanSym, resCapture, func(fp datafeed.FootprintBar) {
							h.BroadcastFootprint(symCapture, resCapture, fp)
						})
					}()
				}
			} else {
				log.Printf("[StreamHub] Failed to resolve provider for %s: %v", symbol, err)
			}
		}
	}

	subscribers[client] = true

	lastCandle, hasLast := h.lastCandles[key]
	h.mu.Unlock()

	// If we already have a recent candle for this topic, immediately send it to the client
	if hasLast {
		msg := CandleBroadcastMessage{
			Type:       "candle",
			Symbol:     symbol,
			Resolution: resolution,
			Candle:     lastCandle,
		}
		if data, err := json.Marshal(msg); err == nil {
			client.trySend(data)
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
			delete(h.historyCandles, key)
			delete(h.lastCandles, key)
			if cancelFn, ok := h.topicCancels[key]; ok {
				cancelFn()
				delete(h.topicCancels, key)
			}

			// No more clients for this topic: unsubscribe from provider
			if h.coordinator != nil {
				provider, cleanSym, err := h.coordinator.ResolveProvider(symbol)
				if err == nil && provider != nil {
					resCapture := resolution
					log.Printf("[StreamHub] Stopping subscription for %s (%s)", symbol, resCapture)
					go func() {
						_ = provider.Unsubscribe(cleanSym, resCapture)
						if l2p, ok := provider.(datafeed.L2DataProvider); ok {
							_ = l2p.UnsubscribeFootprint(cleanSym, resCapture)
						}
					}()
				}
			}
		}
	}
	h.mu.Unlock()

	var session IndicatorSession
	client.indicatorMu.Lock()
	if client.indicatorSubs != nil {
		if s, ok := client.indicatorSubs[key]; ok {
			session = s
			delete(client.indicatorSubs, key)
		}
	}
	if client.indicatorConfigs != nil {
		delete(client.indicatorConfigs, key)
	}
	client.indicatorMu.Unlock()

	if session != nil {
		_ = session.Close(context.Background())
	}
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
				delete(h.historyCandles, key)
				delete(h.lastCandles, key)
				if cancelFn, ok := h.topicCancels[key]; ok {
					cancelFn()
					delete(h.topicCancels, key)
				}

				if h.coordinator != nil {
					parts := strings.Split(key, "::")
					if len(parts) >= 2 {
						sym := parts[0]
						res := parts[1]
						provider, cleanSym, err := h.coordinator.ResolveProvider(sym)
						if err == nil && provider != nil {
							go func() {
								_ = provider.Unsubscribe(cleanSym, res)
								if l2p, ok := provider.(datafeed.L2DataProvider); ok {
									_ = l2p.UnsubscribeFootprint(cleanSym, res)
								}
							}()
						}
					}
				}
			}
		}
	}
}

func sanitizeSessionPlots(raw map[string]map[string]float64) map[string]map[string]float64 {
	if len(raw) == 0 {
		return nil
	}
	var sanitized map[string]map[string]float64
	for instID, pMap := range raw {
		if len(pMap) == 0 {
			continue
		}
		var cleanMap map[string]float64
		for pID, val := range pMap {
			if math.IsNaN(val) || math.IsInf(val, 0) {
				continue
			}
			if cleanMap == nil {
				cleanMap = make(map[string]float64, len(pMap))
			}
			cleanMap[pID] = val
		}
		if len(cleanMap) > 0 {
			if sanitized == nil {
				sanitized = make(map[string]map[string]float64, len(raw))
			}
			sanitized[instID] = cleanMap
		}
	}
	return sanitized
}

func (h *StreamHub) Broadcast(symbol, resolution string, candle datafeed.Candle) {
	key := h.topicKey(symbol, resolution)

	cData := wickra.CandleData{
		Time:   candle.Time,
		Open:   candle.Open,
		High:   candle.High,
		Low:    candle.Low,
		Close:  candle.Close,
		Volume: candle.Volume,
	}

	h.mu.Lock()
	if h.lastCandles == nil {
		h.lastCandles = make(map[string]datafeed.Candle)
	}
	h.lastCandles[key] = candle

	// Update recent candle history in sliding window under h.mu.Lock().
	if h.historyCandles == nil {
		h.historyCandles = make(map[string][]wickra.CandleData)
	}
	history := h.historyCandles[key]
	if len(history) == 0 {
		history = []wickra.CandleData{cData}
	} else if cData.Time == history[len(history)-1].Time {
		// Same in-progress bar: update current bar while preserving OHLC bounds & volume
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
		// New bar opened: append and cap cleanly without aliasing stale prefix memory
		history = append(history, cData)
		if len(history) > maxHistoryCandles {
			trim := len(history) - maxHistoryCandles
			copy(history, history[trim:])
			history = history[:maxHistoryCandles]
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
	h.mu.Unlock()

	// Marshal candle message only after confirming len(subscribers) > 0.
	msg := CandleBroadcastMessage{
		Type:       "candle",
		Symbol:     symbol,
		Resolution: resolution,
		Candle:     candle,
	}
	if data, err := json.Marshal(msg); err == nil {
		for _, cl := range clientsList {
			cl.trySend(data)
		}
	}

	// Incremental indicator session updates, deduplicated across clients sharing identical (topic, config).
	type sessionGroup struct {
		session IndicatorSession
		clients []*HubClient
	}
	var groups []*sessionGroup
	bySession := make(map[any]*sessionGroup, len(clientsList))

	for _, cl := range clientsList {
		cl.indicatorMu.Lock()
		var sess IndicatorSession
		if cl.indicatorSubs != nil {
			sess = cl.indicatorSubs[key]
		}
		cl.indicatorMu.Unlock()

		if sess == nil {
			continue
		}

		var dedupKey any = sess
		if handle, ok := sess.(*hubSessionHandle); ok && handle.shared != nil {
			dedupKey = handle.shared
		}

		grp, found := bySession[dedupKey]
		if !found {
			grp = &sessionGroup{session: sess}
			bySession[dedupKey] = grp
			groups = append(groups, grp)
		}
		grp.clients = append(grp.clients, cl)
	}

	if len(groups) > 0 {
		symCopy := symbol
		resCopy := resolution
		barTime := candle.Time
		candleCopy := cData
		h.enqueueIndicatorJob(func() {
			for _, grp := range groups {
				updCtx, cancel := context.WithTimeout(h.hubContext(), 250*time.Millisecond)
				rawPlots, err := grp.session.Update(updCtx, candleCopy)
				cancel()
				if err != nil || len(rawPlots) == 0 {
					continue
				}

				sanitizedPlots := sanitizeSessionPlots(rawPlots)
				if len(sanitizedPlots) == 0 {
					continue
				}

				indMsg := IndicatorBroadcastMessage{
					Type:       "indicator_update",
					Symbol:     symCopy,
					Resolution: resCopy,
					Time:       barTime,
					Plots:      sanitizedPlots,
				}
				if indData, err := json.Marshal(indMsg); err == nil {
					for _, cl := range grp.clients {
						cl.trySend(indData)
					}
				}
			}
		})
	}
}

// BroadcastFootprint delivers real-time Footprint cluster bars to subscribers.
func (h *StreamHub) BroadcastFootprint(symbol, resolution string, fp datafeed.FootprintBar) {
	key := h.topicKey(symbol, resolution)

	h.mu.RLock()
	subscribers, exists := h.topics[key]
	if !exists || len(subscribers) == 0 {
		h.mu.RUnlock()
		return
	}

	clientsList := make([]*HubClient, 0, len(subscribers))
	for cl := range subscribers {
		clientsList = append(clientsList, cl)
	}
	h.mu.RUnlock()

	msg := map[string]interface{}{
		"type":       "footprint",
		"symbol":     symbol,
		"resolution": resolution,
		"footprint":  fp,
	}
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	for _, cl := range clientsList {
		cl.trySend(data)
	}
}
