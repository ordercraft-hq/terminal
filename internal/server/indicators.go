package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/ordercraft-hq/terminal/internal/datafeed"
	"github.com/ordercraft-hq/terminal/internal/indicators/wickra"
)

// IndicatorEvalRequest payload for POST /api/indicators/eval.
type IndicatorEvalRequest struct {
	Symbol     string                        `json:"symbol"`
	Resolution string                        `json:"resolution"`
	Candles    []datafeed.Candle             `json:"candles,omitempty"`
	Indicators []wickra.EvalIndicatorInstance `json:"indicators"`
}

// IndicatorEvalResponse payload for POST /api/indicators/eval.
type IndicatorEvalResponse struct {
	Symbol     string              `json:"symbol"`
	Resolution string              `json:"resolution"`
	Results    []wickra.EvalResult `json:"results"`
}

// IndicatorSubscribeAction received from client over WebSocket.
type IndicatorSubscribeAction struct {
	Action      string                         `json:"action"` // "subscribe" or "unsubscribe"
	Symbol      string                         `json:"symbol"`
	Resolution  string                         `json:"resolution"`
	Indicators  []wickra.EvalIndicatorInstance `json:"indicators,omitempty"`
	InstanceIDs []string                       `json:"instanceIds,omitempty"` // For selective unsubscribe
}

// IndicatorBroadcastMessage sent from server to client over WebSocket.
type IndicatorBroadcastMessage struct {
	Type       string                        `json:"type"` // "indicator_update"
	Symbol     string                        `json:"symbol"`
	Resolution string                        `json:"resolution"`
	Time       int64                         `json:"time"`
	Plots      map[string]map[string]float64 `json:"plots"` // instanceId -> (plotId -> value)
}

// IndicatorEngine defines the decoupled indicator computation interface.
type IndicatorEngine interface {
	GetCatalog(category, query string) []wickra.IndicatorDescriptor
	GetDescriptor(id string) (wickra.IndicatorDescriptor, bool)
	Evaluate(ctx context.Context, candles []wickra.CandleData, configs []wickra.EvalIndicatorInstance) ([]wickra.EvalResult, error)
	CreateSession(ctx context.Context, symbol, resolution string, configs []wickra.EvalIndicatorInstance) (wickra.IndicatorSession, error)
}

// IndicatorSession maintains state for real-time streaming updates.
type IndicatorSession = wickra.IndicatorSession

// SetIndicatorEngine attaches an indicator engine to the server and its streaming hub.
func (s *Server) SetIndicatorEngine(engine IndicatorEngine) {
	if _, ok := engine.(*UnifiedIndicatorEngine); ok {
		s.indicatorEngine = engine
	} else {
		s.indicatorEngine = NewUnifiedIndicatorEngine(engine, s.scriptingEngine, s.storage)
	}
	if s.streamHub != nil {
		s.streamHub.SetIndicatorEngine(s.indicatorEngine)
	}
}

// handleIndicatorsCatalog handles GET /api/indicators/catalog.
func (s *Server) handleIndicatorsCatalog(w http.ResponseWriter, r *http.Request) {
	if !enableCORS(w, r) {
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	q := r.URL.Query()
	category := q.Get("category")
	searchQuery := q.Get("q")
	if searchQuery == "" {
		searchQuery = q.Get("search")
	}

	var indicators []wickra.IndicatorDescriptor
	if s.indicatorEngine != nil {
		indicators = s.indicatorEngine.GetCatalog(category, searchQuery)
	}
	if indicators == nil {
		indicators = []wickra.IndicatorDescriptor{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"count":      len(indicators),
		"indicators": indicators,
	})
}

// handleIndicatorsEval handles POST /api/indicators/eval.
func (s *Server) handleIndicatorsEval(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if rec := recover(); rec != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error": fmt.Sprintf("indicator evaluation panic: %v", rec),
			})
		}
	}()

	if !enableCORS(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// Limit request body to 10MB to guard against DOS
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)

	var req IndicatorEvalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": fmt.Sprintf("invalid request payload: %v", err),
		})
		return
	}

	if len(req.Indicators) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error": "no indicators specified in request",
		})
		return
	}

	// Fallback to coordinator candles if candles array is omitted
	candles := req.Candles
	if len(candles) == 0 && req.Symbol != "" && s.coordinator != nil {
		res := req.Resolution
		if res == "" {
			res = "15m"
		}
		var err error
		candles, err = s.coordinator.GetCandles(r.Context(), req.Symbol, res, 0, 0, 500)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error": fmt.Sprintf("failed to fetch candles: %v", err),
			})
			return
		}
	}

	// Map datafeed.Candle to wickra.CandleData
	cData := make([]wickra.CandleData, len(candles))
	for i, c := range candles {
		cData[i] = wickra.CandleData{
			Time:   c.Time,
			Open:   c.Open,
			High:   c.High,
			Low:    c.Low,
			Close:  c.Close,
			Volume: c.Volume,
		}
	}

	var results []wickra.EvalResult
	if s.indicatorEngine != nil {
		var err error
		results, err = s.indicatorEngine.Evaluate(r.Context(), cData, req.Indicators)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"error": fmt.Sprintf("indicator evaluation error: %v", err),
			})
			return
		}
	}
	if results == nil {
		results = []wickra.EvalResult{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(IndicatorEvalResponse{
		Symbol:     req.Symbol,
		Resolution: req.Resolution,
		Results:    results,
	})
}
