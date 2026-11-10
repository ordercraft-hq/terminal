package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/ordercraft-hq/terminal/internal/datafeed"
	"github.com/ordercraft-hq/terminal/internal/indicators/scripting"
	"github.com/ordercraft-hq/terminal/internal/indicators/wickra"
	"github.com/ordercraft-hq/terminal/internal/storage"
)

type ScriptEvalRequest struct {
	Code        string            `json:"code"`
	Script      string            `json:"script"` // Alias for code
	Symbol      string            `json:"symbol"`
	Resolution  string            `json:"resolution"`
	Candles     []datafeed.Candle `json:"candles,omitempty"`
	Permissions []string          `json:"permissions,omitempty"`
}

type ScriptEvalResponse struct {
	Success         bool                            `json:"success"`
	Plots           map[string][]wickra.SeriesPoint `json:"plots,omitempty"`
	Directives      []wickra.PlotDirective          `json:"directives,omitempty"`
	Bands           []wickra.BandDirective          `json:"bands,omitempty"`
	Logs            []string                        `json:"logs"`
	ExecutionTimeMs float64                         `json:"executionTimeMs"`
	Error           string                          `json:"error,omitempty"`
}

// handleIndicatorScriptEval executes custom OrderScript code in hermetic Starlark-Go VM.
func (s *Server) handleIndicatorScriptEval(w http.ResponseWriter, r *http.Request) {
	if !enableCORS(w, r) {
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 10MB max body protection
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20)

	var req ScriptEvalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(ScriptEvalResponse{
			Success: false,
			Error:   fmt.Sprintf("invalid json payload: %v", err),
			Logs:    []string{},
		})
		return
	}

	code := req.Code
	if code == "" {
		code = req.Script
	}
	if strings.TrimSpace(code) == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(ScriptEvalResponse{
			Success: false,
			Error:   "script code cannot be empty",
			Logs:    []string{},
		})
		return
	}

	if s.scriptingEngine == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(ScriptEvalResponse{
			Success: false,
			Error:   "scripting engine is not initialized",
			Logs:    []string{},
		})
		return
	}

	// Resolve candles if omitted
	candles := req.Candles
	if len(candles) == 0 && req.Symbol != "" && s.coordinator != nil {
		res := req.Resolution
		if res == "" {
			res = "15m"
		}
		var err error
		candles, err = s.coordinator.GetCandles(r.Context(), req.Symbol, res, 0, 0, 500)
		if err != nil {
			candles = nil
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

	sCtx := scripting.NewScriptContextFromCandles(req.Symbol, req.Resolution, cData)

	res, err := s.scriptingEngine.Eval(r.Context(), code, sCtx, req.Permissions)
	w.Header().Set("Content-Type", "application/json")

	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "timeout") || strings.Contains(err.Error(), "deadline") {
			status = http.StatusRequestTimeout
		}
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(ScriptEvalResponse{
			Success: false,
			Error:   err.Error(),
			Logs:    []string{},
		})
		return
	}

	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(ScriptEvalResponse{
		Success:         true,
		Plots:           res.Plots,
		Directives:      res.Directives,
		Bands:           res.Bands,
		Logs:            res.Logs,
		ExecutionTimeMs: res.ExecutionTimeMs,
	})
}

// handleUserIndicators provides CRUD persistence for user-authored scripts.
func (s *Server) handleUserIndicators(w http.ResponseWriter, r *http.Request) {
	if !enableCORS(w, r) {
		return
	}

	if s.storage == nil {
		http.Error(w, "storage unavailable", http.StatusServiceUnavailable)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/indicators/user")
	path = strings.TrimPrefix(path, "/")

	switch r.Method {
	case http.MethodGet:
		if path == "" {
			// List all
			list, err := s.storage.GetUserIndicators(r.Context())
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if list == nil {
				list = []storage.UserIndicator{}
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(list)
			return
		}

		// Get single
		ind, err := s.storage.GetUserIndicator(r.Context(), path)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if ind == nil {
			http.Error(w, "indicator not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(ind)

	case http.MethodPost:
		var ind storage.UserIndicator
		if err := json.NewDecoder(r.Body).Decode(&ind); err != nil {
			http.Error(w, fmt.Sprintf("invalid json: %v", err), http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(ind.Name) == "" {
			http.Error(w, "indicator name is required", http.StatusBadRequest)
			return
		}
		if err := s.storage.SaveUserIndicator(r.Context(), &ind); err != nil {
			http.Error(w, fmt.Sprintf("failed to save indicator: %v", err), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(ind)

	case http.MethodDelete:
		if path == "" {
			http.Error(w, "indicator id required", http.StatusBadRequest)
			return
		}
		if err := s.storage.DeleteUserIndicator(r.Context(), path); err != nil {
			http.Error(w, fmt.Sprintf("failed to delete indicator: %v", err), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "deleted",
			"id":     path,
		})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
