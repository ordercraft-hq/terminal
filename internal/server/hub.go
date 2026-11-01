package server

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
	"github.com/ordercraft-hq/terminal/internal/datafeed"
)

// StreamHub coordinates WebSocket connections from frontend clients
// and multiplexes subscriptions to underlying data providers.
type StreamHub struct {
	coordinator *datafeed.Coordinator
	mu          sync.RWMutex
	clients     map[*HubClient]bool
	topics      map[string]map[*HubClient]bool
	lastCandles map[string]datafeed.Candle
}

type HubClient struct {
	hub   *StreamHub
	conn  *websocket.Conn
	subs  map[string]bool // topic keys
	send  chan []byte
	done  chan struct{}
	closeOnce sync.Once
}

type ClientActionMessage struct {
	Action     string `json:"action"` // "subscribe" or "unsubscribe"
	Symbol     string `json:"symbol"`
	Resolution string `json:"resolution"`
}

type CandleBroadcastMessage struct {
	Type       string          `json:"type"` // "candle"
	Symbol     string          `json:"symbol"`
	Resolution string          `json:"resolution"`
	Candle     datafeed.Candle `json:"candle"`
}

func NewStreamHub(coordinator *datafeed.Coordinator) *StreamHub {
	return &StreamHub{
		coordinator: coordinator,
		clients:     make(map[*HubClient]bool),
		topics:      make(map[string]map[*HubClient]bool),
		lastCandles: make(map[string]datafeed.Candle),
	}
}

func (h *StreamHub) topicKey(symbol, resolution string) string {
	return strings.ToUpper(strings.TrimSpace(symbol)) + "::" + strings.TrimSpace(resolution)
}

func (h *StreamHub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{"localhost:*", "127.0.0.1:*", "[::1]:*", "localhost", "127.0.0.1", "[::1]"},
	})
	if err != nil {
		log.Printf("[StreamHub] Accept error: %v\n", err)
		return
	}

	// Protect against memory exhaustion with a 64 KB read limit per message
	conn.SetReadLimit(64 * 1024)

	client := &HubClient{
		hub:  h,
		conn: conn,
		subs: make(map[string]bool),
		send: make(chan []byte, 2048),
		done: make(chan struct{}),
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

		switch strings.ToLower(actionMsg.Action) {
		case "subscribe":
			c.hub.subscribe(c, sym, res)
		case "unsubscribe":
			c.hub.unsubscribe(c, sym, res)
		}
	}
}

func (h *StreamHub) subscribe(client *HubClient, symbol, resolution string) {
	key := h.topicKey(symbol, resolution)

	h.mu.Lock()
	defer h.mu.Unlock()

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
	defer h.mu.Unlock()

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

	for _, cl := range clientsList {
		select {
		case cl.send <- data:
		default:
			// Buffer full, drop or close
		}
	}
}
