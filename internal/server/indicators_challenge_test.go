package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ordercraft-hq/terminal/internal/datafeed"
	"github.com/ordercraft-hq/terminal/internal/indicators/wickra"
	"github.com/ordercraft-hq/terminal/internal/storage"
	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

// Helper to create test server with real Wazero engine if available, or mock
func setupChallengeServer(t *testing.T, useRealEngine bool) (*Server, *httptest.Server, func()) {
	tmpDB := fmt.Sprintf("test_challenge_%d.db", time.Now().UnixNano())
	st, err := storage.NewStorage(tmpDB)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}

	srv := NewServer(st)
	if !useRealEngine || srv.indicatorEngine == nil {
		srv.SetIndicatorEngine(NewMockIndicatorEngine())
	}

	httpSrv := httptest.NewServer(srv.mux)

	cleanup := func() {
		httpSrv.Close()
		_ = srv.Shutdown(context.Background())
		st.Close()
		_ = os.Remove(tmpDB)
	}

	return srv, httpSrv, cleanup
}

// -------------------------------------------------------------
// 1. BATCH EVALUATION CHALLENGES
// -------------------------------------------------------------

// Challenge: Empty candle array
func TestChallenge_BatchEval_EmptyCandles(t *testing.T) {
	srv, httpSrv, cleanup := setupChallengeServer(t, false)
	defer cleanup()

	payload := map[string]interface{}{
		"candles": []interface{}{},
		"indicators": []map[string]interface{}{
			{"instanceId": "ind_1", "indicatorId": "wickra.sma", "inputs": map[string]interface{}{"period": 5}},
		},
	}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(httpSrv.URL+"/api/indicators/eval", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		t.Fatalf("Expected 200 OK for empty candles, got %d: %s", resp.StatusCode, string(respBody))
	}

	var res IndicatorEvalResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if len(res.Results) != 1 {
		t.Fatalf("Expected 1 result for empty candles, got %d", len(res.Results))
	}
	t.Logf("Empty candles evaluated cleanly with 0 points: %+v", res.Results[0].Plots)
	_ = srv
}

// Challenge: Gigantic candle payload (50,000 candles)
func TestChallenge_BatchEval_GiganticPayload(t *testing.T) {
	_, httpSrv, cleanup := setupChallengeServer(t, true)
	defer cleanup()

	const count = 50000
	candles := make([]datafeed.Candle, count)
	now := time.Now().Unix()
	price := 50000.0
	for i := 0; i < count; i++ {
		price += (rand.Float64() - 0.49) * 10
		candles[i] = datafeed.Candle{
			Time:   now + int64(i*60),
			Open:   price,
			High:   price + 5,
			Low:    price - 5,
			Close:  price + 1,
			Volume: 100,
		}
	}

	payload := IndicatorEvalRequest{
		Symbol:     "BINANCE:BTCUSDT",
		Resolution: "1m",
		Candles:    candles,
		Indicators: []wickra.EvalIndicatorInstance{
			{InstanceID: "ind_big", IndicatorID: "wickra.sma", Inputs: map[string]interface{}{"period": 20}},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("Marshal error: %v", err)
	}
	t.Logf("Payload size for 50,000 candles: %.2f MB", float64(len(body))/(1024*1024))

	start := time.Now()
	resp, err := http.Post(httpSrv.URL+"/api/indicators/eval", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST failed: %v", err)
	}
	defer resp.Body.Close()
	elapsed := time.Since(start)

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		t.Fatalf("Expected 200 OK for 50k candles, got %d: %s", resp.StatusCode, string(respBody))
	}

	var res IndicatorEvalResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if len(res.Results) != 1 {
		t.Fatalf("Expected 1 result, got %d", len(res.Results))
	}
	pts := res.Results[0].Plots["plot"]
	t.Logf("Evaluated 50,000 candles in %v (%d points emitted)", elapsed, len(pts))
	if len(pts) < count-30 {
		t.Fatalf("Expected at least %d points, got %d", count-30, len(pts))
	}
}

// Challenge: Payload exceeding MaxBytesReader (10MB limit guard)
func TestChallenge_BatchEval_OverPayloadLimit(t *testing.T) {
	_, httpSrv, cleanup := setupChallengeServer(t, false)
	defer cleanup()

	// Create an oversized payload (11 MB)
	oversized := make([]byte, 11*1024*1024)
	for i := range oversized {
		oversized[i] = 'a'
	}

	resp, err := http.Post(httpSrv.URL+"/api/indicators/eval", "application/json", bytes.NewReader(oversized))
	if err != nil {
		// Connection might be reset by server when limit is exceeded - this is valid defense
		t.Logf("Connection reset/closed as expected on oversized payload: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest && resp.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("Expected 400 or 413 for oversized payload, got %d", resp.StatusCode)
	}
	t.Logf("10MB payload limit properly rejected with status %d", resp.StatusCode)
}

// Challenge: 50 indicators in a single request
func TestChallenge_BatchEval_FiftyIndicators(t *testing.T) {
	_, httpSrv, cleanup := setupChallengeServer(t, true)
	defer cleanup()

	const candleCount = 200
	candles := make([]datafeed.Candle, candleCount)
	now := time.Now().Unix()
	for i := 0; i < candleCount; i++ {
		candles[i] = datafeed.Candle{
			Time:   now + int64(i*60),
			Open:   100,
			High:   105,
			Low:    95,
			Close:  100 + float64(i%10),
			Volume: 50,
		}
	}

	const indicatorCount = 50
	indicators := make([]wickra.EvalIndicatorInstance, indicatorCount)
	for i := 0; i < indicatorCount; i++ {
		indicators[i] = wickra.EvalIndicatorInstance{
			InstanceID:  fmt.Sprintf("ind_%d", i),
			IndicatorID: "wickra.sma",
			Inputs:      map[string]interface{}{"period": float64(5 + (i % 20))},
		}
	}

	payload := IndicatorEvalRequest{
		Symbol:     "TEST:BATCH",
		Resolution: "1m",
		Candles:    candles,
		Indicators: indicators,
	}

	body, _ := json.Marshal(payload)
	start := time.Now()
	resp, err := http.Post(httpSrv.URL+"/api/indicators/eval", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST failed: %v", err)
	}
	defer resp.Body.Close()
	elapsed := time.Since(start)

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		t.Fatalf("Expected 200 OK for 50 indicators, got %d: %s", resp.StatusCode, string(respBody))
	}

	var res IndicatorEvalResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if len(res.Results) != indicatorCount {
		t.Fatalf("Expected %d results, got %d", indicatorCount, len(res.Results))
	}
	t.Logf("Successfully evaluated %d indicators across %d candles in %v", indicatorCount, candleCount, elapsed)
}

// Challenge: Unknown indicator ID in batch eval
func TestChallenge_BatchEval_UnknownIndicator(t *testing.T) {
	_, httpSrv, cleanup := setupChallengeServer(t, true)
	defer cleanup()

	payload := IndicatorEvalRequest{
		Symbol:     "TEST:SYM",
		Resolution: "1m",
		Candles: []datafeed.Candle{
			{Time: 100, Close: 50},
			{Time: 101, Close: 51},
		},
		Indicators: []wickra.EvalIndicatorInstance{
			{InstanceID: "bad_ind", IndicatorID: "wickra.nonexistent_super_indicator"},
		},
	}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(httpSrv.URL+"/api/indicators/eval", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST failed: %v", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	t.Logf("Unknown indicator response: status=%d body=%s", resp.StatusCode, string(respBody))
	if resp.StatusCode != http.StatusInternalServerError && resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("Expected 400 or 500 error for unknown indicator, got %d", resp.StatusCode)
	}
	if !strings.Contains(string(respBody), "not found") {
		t.Fatalf("Expected 'not found' error message, got: %s", string(respBody))
	}
}

// Challenge: Concurrent batch evaluation requests (20 parallel clients)
func TestChallenge_BatchEval_ConcurrentClients(t *testing.T) {
	_, httpSrv, cleanup := setupChallengeServer(t, true)
	defer cleanup()

	const concurrentClients = 20
	var wg sync.WaitGroup
	var errCount int64

	candles := make([]datafeed.Candle, 100)
	for i := range candles {
		candles[i] = datafeed.Candle{Time: int64(1000 + i*60), Close: 100 + float64(i)}
	}

	payload := IndicatorEvalRequest{
		Symbol:     "TEST:CONC",
		Resolution: "1m",
		Candles:    candles,
		Indicators: []wickra.EvalIndicatorInstance{
			{InstanceID: "ind_sma", IndicatorID: "wickra.sma", Inputs: map[string]interface{}{"period": 10}},
		},
	}
	body, _ := json.Marshal(payload)

	wg.Add(concurrentClients)
	for c := 0; c < concurrentClients; c++ {
		go func(clientID int) {
			defer wg.Done()
			for req := 0; req < 5; req++ {
				resp, err := http.Post(httpSrv.URL+"/api/indicators/eval", "application/json", bytes.NewReader(body))
				if err != nil {
					atomic.AddInt64(&errCount, 1)
					return
				}
				if resp.StatusCode != http.StatusOK {
					atomic.AddInt64(&errCount, 1)
				}
				_ = resp.Body.Close()
			}
		}(c)
	}

	wg.Wait()
	if errCount > 0 {
		t.Fatalf("Encountered %d errors during concurrent batch eval", errCount)
	}
	t.Logf("20 concurrent clients completed 100 total batch evaluations with 0 errors")
}

// -------------------------------------------------------------
// 2. WEBSOCKET CONCURRENCY & STREAMING CHALLENGES
// -------------------------------------------------------------

// Challenge: Concurrent WebSocket clients subscribing/unsubscribing during active broadcast
func TestChallenge_WebSocket_ConcurrentSubUnsubDuringBroadcast(t *testing.T) {
	srv, httpSrv, cleanup := setupChallengeServer(t, false)
	defer cleanup()

	wsURL := "ws" + strings.TrimPrefix(httpSrv.URL, "http") + "/ws/indicators"
	const numClients = 15
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var stopBroadcast int32
	var broadcastCount int64

	// Start high-frequency background broadcast
	go func() {
		ticker := time.NewTicker(5 * time.Millisecond)
		defer ticker.Stop()
		seq := int64(1000)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if atomic.LoadInt32(&stopBroadcast) == 1 {
					return
				}
				seq++
				srv.streamHub.Broadcast("BINANCE:BTCUSDT", "1m", datafeed.Candle{
					Time:  seq,
					Close: 50000 + float64(seq%100),
				})
				srv.streamHub.Broadcast("COINBASE:ETHUSD", "5m", datafeed.Candle{
					Time:  seq,
					Close: 3000 + float64(seq%50),
				})
				atomic.AddInt64(&broadcastCount, 1)
			}
		}
	}()

	var wg sync.WaitGroup
	var clientErrors int64

	wg.Add(numClients)
	for i := 0; i < numClients; i++ {
		go func(clientID int) {
			defer wg.Done()

			conn, _, err := websocket.Dial(ctx, wsURL, nil)
			if err != nil {
				atomic.AddInt64(&clientErrors, 1)
				return
			}
			defer conn.Close(websocket.StatusNormalClosure, "done")

			symbols := []string{"BINANCE:BTCUSDT", "COINBASE:ETHUSD"}

			for cycle := 0; cycle < 10; cycle++ {
				sym := symbols[cycle%len(symbols)]
				// Subscribe
				subMsg := map[string]interface{}{
					"action":     "subscribe",
					"symbol":     sym,
					"resolution": "1m",
					"indicators": []map[string]interface{}{
						{"instanceId": fmt.Sprintf("ind_%d", clientID), "indicatorId": "wickra.sma", "inputs": map[string]interface{}{"period": 3}},
					},
				}
				if err := wsjson.Write(ctx, conn, subMsg); err != nil {
					return
				}

				time.Sleep(time.Duration(5+rand.Intn(10)) * time.Millisecond)

				// Unsubscribe
				unsubMsg := map[string]interface{}{
					"action":     "unsubscribe",
					"symbol":     sym,
					"resolution": "1m",
				}
				if err := wsjson.Write(ctx, conn, unsubMsg); err != nil {
					return
				}
			}
		}(i)
	}

	wg.Wait()
	atomic.StoreInt32(&stopBroadcast, 1)

	if clientErrors > 0 {
		t.Fatalf("%d clients encountered connection errors", clientErrors)
	}
	t.Logf("Completed concurrent sub/unsub under %d broadcasts with 0 deadlocks or panics", atomic.LoadInt64(&broadcastCount))
}

// Challenge: Malformed JSON frames & over-limit frames
func TestChallenge_WebSocket_MalformedFrames(t *testing.T) {
	_, httpSrv, cleanup := setupChallengeServer(t, false)
	defer cleanup()

	wsURL := "ws" + strings.TrimPrefix(httpSrv.URL, "http") + "/ws/indicators"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 1. Send completely invalid JSON text
	t.Run("InvalidJSONText", func(t *testing.T) {
		conn, _, err := websocket.Dial(ctx, wsURL, nil)
		if err != nil {
			t.Fatalf("Dial failed: %v", err)
		}
		defer conn.Close(websocket.StatusNormalClosure, "done")

		err = conn.Write(ctx, websocket.MessageText, []byte("NOT_JSON{[[{"))
		if err != nil {
			t.Fatalf("Write failed: %v", err)
		}

		// The server should close connection gracefully upon JSON decode error
		time.Sleep(100 * time.Millisecond)
		var dummy map[string]interface{}
		err = wsjson.Read(ctx, conn, &dummy)
		if err == nil {
			t.Logf("Warning: connection was not closed immediately after invalid JSON")
		} else {
			t.Logf("Connection closed as expected on invalid JSON: %v", err)
		}
	})

	// 2. Send empty message
	t.Run("EmptyMessage", func(t *testing.T) {
		conn, _, err := websocket.Dial(ctx, wsURL, nil)
		if err != nil {
			t.Fatalf("Dial failed: %v", err)
		}
		defer conn.Close(websocket.StatusNormalClosure, "done")

		err = conn.Write(ctx, websocket.MessageText, []byte(""))
		if err != nil {
			t.Fatalf("Write failed: %v", err)
		}
		time.Sleep(50 * time.Millisecond)
	})

	// 3. Send message exceeding 64KB read limit
	t.Run("FrameOverReadLimit", func(t *testing.T) {
		conn, _, err := websocket.Dial(ctx, wsURL, nil)
		if err != nil {
			t.Fatalf("Dial failed: %v", err)
		}
		defer conn.Close(websocket.StatusNormalClosure, "done")

		giantPayload := map[string]interface{}{
			"action": "subscribe",
			"symbol": "BTC",
			"data":   strings.Repeat("X", 70*1024), // 70 KB
		}
		b, _ := json.Marshal(giantPayload)

		_ = conn.Write(ctx, websocket.MessageText, b)
		time.Sleep(100 * time.Millisecond)

		var dummy map[string]interface{}
		err = wsjson.Read(ctx, conn, &dummy)
		if err == nil {
			t.Fatalf("Expected connection closure for frame > 64KB, but read succeeded")
		}
		t.Logf("Frame > 64KB properly closed connection: %v", err)
	})
}

// Challenge: Abrupt client disconnect during active broadcast
func TestChallenge_WebSocket_AbruptDisconnectDuringBroadcast(t *testing.T) {
	srv, httpSrv, cleanup := setupChallengeServer(t, false)
	defer cleanup()

	wsURL := "ws" + strings.TrimPrefix(httpSrv.URL, "http") + "/ws/indicators"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	const clientCount = 20
	var conns []*websocket.Conn

	for i := 0; i < clientCount; i++ {
		c, _, err := websocket.Dial(ctx, wsURL, nil)
		if err != nil {
			t.Fatalf("Dial %d failed: %v", i, err)
		}
		conns = append(conns, c)

		// Subscribe
		sub := map[string]interface{}{
			"action":     "subscribe",
			"symbol":     "TEST:ABRUPT",
			"resolution": "1m",
			"indicators": []map[string]interface{}{
				{"instanceId": fmt.Sprintf("ind_%d", i), "indicatorId": "wickra.sma"},
			},
		}
		_ = wsjson.Write(ctx, c, sub)
	}

	time.Sleep(50 * time.Millisecond)

	// Now abruptly close half the connections from client side
	for i := 0; i < clientCount/2; i++ {
		_ = conns[i].Close(websocket.StatusGoingAway, "abrupt disconnect")
	}

	// Concurrently broadcast 100 messages while closing remaining connections
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		for i := 0; i < 50; i++ {
			srv.streamHub.Broadcast("TEST:ABRUPT", "1m", datafeed.Candle{Time: int64(1000 + i), Close: 100})
			time.Sleep(2 * time.Millisecond)
		}
	}()

	go func() {
		defer wg.Done()
		time.Sleep(20 * time.Millisecond)
		for i := clientCount / 2; i < clientCount; i++ {
			_ = conns[i].Close(websocket.StatusNormalClosure, "close remaining")
		}
	}()

	wg.Wait()
	t.Logf("Broadcast during abrupt client disconnects completed with zero crashes or deadlocks")
}

// Challenge: Empirical investigation of session leak on unsubscribe
func TestChallenge_WebSocket_UnsubscribeIndicatorLeak(t *testing.T) {
	srv, httpSrv, cleanup := setupChallengeServer(t, false)
	defer cleanup()

	wsURL := "ws" + strings.TrimPrefix(httpSrv.URL, "http") + "/ws/indicators"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("Dial failed: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "done")

	// 1. Subscribe to indicators for SYMBOL_A
	subMsg := map[string]interface{}{
		"action":     "subscribe",
		"symbol":     "SYMBOL_A",
		"resolution": "1m",
		"indicators": []map[string]interface{}{
			{"instanceId": "ind_a", "indicatorId": "wickra.sma", "inputs": map[string]interface{}{"period": 5}},
		},
	}
	if err := wsjson.Write(ctx, conn, subMsg); err != nil {
		t.Fatalf("Write sub failed: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	// Inspect srv.streamHub.clients to locate our HubClient
	srv.streamHub.mu.RLock()
	var clientRef *HubClient
	for cl := range srv.streamHub.clients {
		clientRef = cl
		break
	}
	srv.streamHub.mu.RUnlock()

	if clientRef == nil {
		t.Fatalf("Client not found in streamHub")
	}

	// Verify indicator session was registered
	clientRef.indicatorMu.Lock()
	sessionCountBefore := len(clientRef.indicatorSubs)
	clientRef.indicatorMu.Unlock()
	if sessionCountBefore != 1 {
		t.Fatalf("Expected 1 indicator session, got %d", sessionCountBefore)
	}
	t.Logf("Indicator session for SYMBOL_A created successfully")

	// 2. Now client sends standard unsubscribe for SYMBOL_A:
	unsubMsg := map[string]interface{}{
		"action":     "unsubscribe",
		"symbol":     "SYMBOL_A",
		"resolution": "1m",
	}
	if err := wsjson.Write(ctx, conn, unsubMsg); err != nil {
		t.Fatalf("Write unsub failed: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	// 3. Check clientRef.indicatorSubs!
	clientRef.indicatorMu.Lock()
	sessionCountAfter := len(clientRef.indicatorSubs)
	clientRef.indicatorMu.Unlock()

	t.Logf("Session count after unsubscribe: %d", sessionCountAfter)
	if sessionCountAfter > 0 {
		t.Errorf("BUG CONFIRMED: IndicatorSession was NOT closed or removed upon topic unsubscribe! Memory leak detected: %d active sessions remain", sessionCountAfter)
	}
}

// Challenge: Empirical investigation of selective indicator unsubscribe
func TestChallenge_WebSocket_SelectiveIndicatorUnsubscribe(t *testing.T) {
	srv, httpSrv, cleanup := setupChallengeServer(t, false)
	defer cleanup()

	wsURL := "ws" + strings.TrimPrefix(httpSrv.URL, "http") + "/ws/indicators"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("Dial failed: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "done")

	// Subscribe to TWO indicators on SYMBOL_B: ind_1 (SMA) and ind_2 (RSI)
	subMsg := map[string]interface{}{
		"action":     "subscribe",
		"symbol":     "SYMBOL_B",
		"resolution": "1m",
		"indicators": []map[string]interface{}{
			{"instanceId": "ind_1", "indicatorId": "wickra.sma"},
			{"instanceId": "ind_2", "indicatorId": "wickra.bollinger"},
		},
	}
	if err := wsjson.Write(ctx, conn, subMsg); err != nil {
		t.Fatalf("Write sub failed: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	// Unsubscribe ONLY ind_1
	unsubMsg := map[string]interface{}{
		"action":      "unsubscribe",
		"symbol":      "SYMBOL_B",
		"resolution":  "1m",
		"instanceIds": []string{"ind_1"},
	}
	if err := wsjson.Write(ctx, conn, unsubMsg); err != nil {
		t.Fatalf("Write unsub failed: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	// Inspect clientRef.indicatorSubs
	srv.streamHub.mu.RLock()
	var clientRef *HubClient
	for cl := range srv.streamHub.clients {
		clientRef = cl
		break
	}
	srv.streamHub.mu.RUnlock()

	clientRef.indicatorMu.Lock()
	sessionExists := clientRef.indicatorSubs[srv.streamHub.topicKey("SYMBOL_B", "1m")] != nil
	clientRef.indicatorMu.Unlock()

	t.Logf("Session exists after selective unsubscribe of 1 indicator: %v", sessionExists)
	if !sessionExists {
		t.Logf("NOTE: Selective unsubscribe removes entire session for that topic, destroying ind_2 as well")
	}
}

// Challenge: Goroutine and Memory Leak Profile
func TestChallenge_GoroutineLeakProfile(t *testing.T) {
	srv, httpSrv, cleanup := setupChallengeServer(t, false)
	defer cleanup()

	runtime.GC()
	initialGoroutines := runtime.NumGoroutine()

	wsURL := "ws" + strings.TrimPrefix(httpSrv.URL, "http") + "/ws/indicators"
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Connect 30 clients, perform work, and disconnect
	for i := 0; i < 30; i++ {
		conn, _, err := websocket.Dial(ctx, wsURL, nil)
		if err != nil {
			t.Fatalf("Dial failed: %v", err)
		}
		_ = wsjson.Write(ctx, conn, map[string]interface{}{
			"action":     "subscribe",
			"symbol":     "TEST:LEAK",
			"resolution": "1m",
			"indicators": []map[string]interface{}{
				{"instanceId": "ind_test", "indicatorId": "wickra.sma"},
			},
		})
		srv.streamHub.Broadcast("TEST:LEAK", "1m", datafeed.Candle{Time: 1000, Close: 100})
		_ = conn.Close(websocket.StatusNormalClosure, "done")
	}

	// Allow goroutines to wind down
	time.Sleep(500 * time.Millisecond)
	runtime.GC()

	finalGoroutines := runtime.NumGoroutine()
	t.Logf("Goroutines before: %d, after 30 client cycles: %d", initialGoroutines, finalGoroutines)

	if finalGoroutines > initialGoroutines+10 {
		t.Errorf("Potential goroutine leak: initial=%d, final=%d", initialGoroutines, finalGoroutines)
	}
}


// Challenge: Ghost client leak if subscribe is called on closed client
func TestChallenge_GhostClientOnClosedSubscribe(t *testing.T) {
	srv, httpSrv, cleanup := setupChallengeServer(t, false)
	defer cleanup()

	wsURL := "ws" + strings.TrimPrefix(httpSrv.URL, "http") + "/ws/indicators"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("Dial failed: %v", err)
	}

	time.Sleep(50 * time.Millisecond)

	srv.streamHub.mu.RLock()
	var clientRef *HubClient
	for cl := range srv.streamHub.clients {
		clientRef = cl
		break
	}
	srv.streamHub.mu.RUnlock()

	if clientRef == nil {
		t.Fatalf("Client not found")
	}

	// Client closes
	_ = conn.Close(websocket.StatusNormalClosure, "done")
	time.Sleep(100 * time.Millisecond)

	// Verify client is not in hub.clients
	srv.streamHub.mu.RLock()
	inClients := srv.streamHub.clients[clientRef]
	srv.streamHub.mu.RUnlock()
	if inClients {
		t.Fatalf("Expected client to be removed from hub.clients")
	}

	// Now simulate concurrent readPump calling subscribe after close
	srv.streamHub.subscribe(clientRef, "GHOST:SYM", "1m")

	// Check if client was re-added to topics
	key := srv.streamHub.topicKey("GHOST:SYM", "1m")
	srv.streamHub.mu.RLock()
	subscribers := srv.streamHub.topics[key]
	isSubbed := subscribers != nil && subscribers[clientRef]
	srv.streamHub.mu.RUnlock()

	if isSubbed {
		t.Errorf("BUG CONFIRMED: Closed client was re-added to StreamHub.topics[%s]! Because closeOnce has already executed, this client will NEVER be removed and will receive ghost broadcasts forever.", key)
	}
}

// Challenge: Check if "indicator_subscribe" and "indicator_unsubscribe" are handled
func TestChallenge_IndicatorActionAliases(t *testing.T) {
	srv, httpSrv, cleanup := setupChallengeServer(t, false)
	defer cleanup()

	wsURL := "ws" + strings.TrimPrefix(httpSrv.URL, "http") + "/ws/indicators"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, wsURL, nil)
	if err != nil {
		t.Fatalf("Dial failed: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "done")

	// Send "indicator_subscribe"
	indSubMsg := map[string]interface{}{
		"action":     "indicator_subscribe",
		"symbol":     "TEST:ALIAS",
		"resolution": "1m",
		"indicators": []map[string]interface{}{
			{"instanceId": "ind_alias", "indicatorId": "wickra.sma"},
		},
	}
	if err := wsjson.Write(ctx, conn, indSubMsg); err != nil {
		t.Fatalf("Write failed: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	srv.streamHub.mu.RLock()
	var clientRef *HubClient
	for cl := range srv.streamHub.clients {
		clientRef = cl
		break
	}
	srv.streamHub.mu.RUnlock()

	clientRef.indicatorMu.Lock()
	hasSession := len(clientRef.indicatorSubs) > 0
	clientRef.indicatorMu.Unlock()

	if !hasSession {
		t.Errorf("CLAIM INVALIDATED: 'indicator_subscribe' action is NOT recognized by StreamHub (worker claimed support in handoff). Only 'subscribe' is handled.")
	}
}
