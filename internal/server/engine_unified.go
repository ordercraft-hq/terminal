package server

import (
	"context"
	"encoding/json"
	"log"
	"math"
	"strings"
	"sync"

	"github.com/ordercraft-hq/terminal/internal/indicators/scripting"
	"github.com/ordercraft-hq/terminal/internal/indicators/wickra"
	"github.com/ordercraft-hq/terminal/internal/storage"
)

// UnifiedIndicatorEngine orchestrates technical indicator evaluation across both
// compiled WebAssembly (Wazero) built-in indicators and hermetic OrderScript (Starlark) custom indicators.
type UnifiedIndicatorEngine struct {
	wasmEngine      IndicatorEngine
	scriptingEngine *scripting.Engine
	storage         *storage.Storage
	mu              sync.RWMutex
}

// NewUnifiedIndicatorEngine constructs a new UnifiedIndicatorEngine.
func NewUnifiedIndicatorEngine(wasm IndicatorEngine, script *scripting.Engine, st *storage.Storage) *UnifiedIndicatorEngine {
	return &UnifiedIndicatorEngine{
		wasmEngine:      wasm,
		scriptingEngine: script,
		storage:         st,
	}
}

// SetScriptingEngine updates the attached OrderScript VM engine.
func (u *UnifiedIndicatorEngine) SetScriptingEngine(engine *scripting.Engine) {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.scriptingEngine = engine
}

// SetStorage updates the storage backend reference.
func (u *UnifiedIndicatorEngine) SetStorage(st *storage.Storage) {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.storage = st
}

// SetWasmEngine updates the underlying WASM engine.
func (u *UnifiedIndicatorEngine) SetWasmEngine(engine IndicatorEngine) {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.wasmEngine = engine
}

// GetCatalog returns descriptors for both built-in WASM indicators and user-saved custom scripts.
func (u *UnifiedIndicatorEngine) GetCatalog(category, query string) []wickra.IndicatorDescriptor {
	u.mu.RLock()
	wasm := u.wasmEngine
	st := u.storage
	u.mu.RUnlock()

	var descriptors []wickra.IndicatorDescriptor
	if wasm != nil {
		descriptors = wasm.GetCatalog(category, query)
	}
	if descriptors == nil {
		descriptors = []wickra.IndicatorDescriptor{}
	}

	// Include custom script indicators from storage if category matches
	if st != nil && (category == "" || strings.EqualFold(category, "Custom Script") || strings.EqualFold(category, "Custom")) {
		userInds, err := st.GetUserIndicators(context.Background())
		if err == nil {
			qLower := strings.ToLower(query)
			for _, ind := range userInds {
				if qLower != "" &&
					!strings.Contains(strings.ToLower(ind.ID), qLower) &&
					!strings.Contains(strings.ToLower(ind.Name), qLower) &&
					!strings.Contains(strings.ToLower(ind.Description), qLower) {
					continue
				}
				descriptors = append(descriptors, wickra.IndicatorDescriptor{
					ID:          ind.ID,
					Name:        ind.Name,
					ShortName:   ind.Name,
					Family:      "Custom Script",
					Category:    "Custom Script",
					Description: ind.Description,
					Overlay:     true,
					Inputs:      []wickra.InputSchema{},
					Plots:       []wickra.PlotDirective{},
				})
			}
		}
	}

	return descriptors
}

// GetDescriptor looks up an indicator descriptor from WASM catalog, storage, or synthetic custom script.
func (u *UnifiedIndicatorEngine) GetDescriptor(id string) (wickra.IndicatorDescriptor, bool) {
	u.mu.RLock()
	wasm := u.wasmEngine
	st := u.storage
	u.mu.RUnlock()

	if wasm != nil {
		if desc, ok := wasm.GetDescriptor(id); ok {
			return desc, true
		}
	}

	cleanID := strings.TrimPrefix(id, "wickra.")
	if st != nil {
		ind, err := st.GetUserIndicator(context.Background(), cleanID)
		if err != nil || ind == nil {
			ind, err = st.GetUserIndicator(context.Background(), id)
		}
		if err == nil && ind != nil {
			return wickra.IndicatorDescriptor{
				ID:          ind.ID,
				Name:        ind.Name,
				ShortName:   ind.Name,
				Family:      "Custom Script",
				Category:    "Custom Script",
				Description: ind.Description,
				Overlay:     true,
			}, true
		}
	}

	if strings.HasPrefix(cleanID, "script.") || strings.HasPrefix(cleanID, "user.") || strings.HasPrefix(cleanID, "custom.") {
		return wickra.IndicatorDescriptor{
			ID:       id,
			Name:     cleanID,
			Family:   "Custom Script",
			Category: "Custom Script",
			Overlay:  true,
		}, true
	}

	return wickra.IndicatorDescriptor{}, false
}

// isScriptConfig determines whether an indicator configuration represents an OrderScript script.
func (u *UnifiedIndicatorEngine) isScriptConfig(ctx context.Context, cfg wickra.EvalIndicatorInstance) bool {
	cleanID := strings.TrimPrefix(cfg.IndicatorID, "wickra.")
	if strings.HasPrefix(cleanID, "script.") ||
		strings.HasPrefix(cleanID, "user.") ||
		strings.HasPrefix(cleanID, "custom.") {
		return true
	}

	if cfg.Inputs != nil {
		if c, ok := cfg.Inputs["code"].(string); ok && strings.TrimSpace(c) != "" {
			return true
		}
		if c, ok := cfg.Inputs["script"].(string); ok && strings.TrimSpace(c) != "" {
			return true
		}
	}

	u.mu.RLock()
	wasm := u.wasmEngine
	st := u.storage
	u.mu.RUnlock()

	if wasm != nil {
		indID := cfg.IndicatorID
		if indID == "wickra.vwap_std_dev_bands" || indID == "VwapStdDevBands" {
			indID = "wickra.vwap"
		}
		if _, ok := wasm.GetDescriptor(indID); ok {
			return false
		}
	}

	if st != nil {
		if ind, err := st.GetUserIndicator(ctx, cleanID); err == nil && ind != nil {
			return true
		}
		if ind, err := st.GetUserIndicator(ctx, cfg.IndicatorID); err == nil && ind != nil {
			return true
		}
	}

	return false
}

// Evaluate performs batch coordinate calculation on candles for all requested indicators.
func (u *UnifiedIndicatorEngine) Evaluate(ctx context.Context, candles []wickra.CandleData, configs []wickra.EvalIndicatorInstance) ([]wickra.EvalResult, error) {
	if len(configs) == 0 {
		return []wickra.EvalResult{}, nil
	}

	var wasmConfigs []wickra.EvalIndicatorInstance
	var scriptConfigs []wickra.EvalIndicatorInstance

	for _, cfg := range configs {
		if u.isScriptConfig(ctx, cfg) {
			scriptConfigs = append(scriptConfigs, cfg)
		} else {
			wasmConfigs = append(wasmConfigs, cfg)
		}
	}

	resultsMap := make(map[string]wickra.EvalResult)

	u.mu.RLock()
	wasm := u.wasmEngine
	scriptEng := u.scriptingEngine
	st := u.storage
	u.mu.RUnlock()

	// 1. Evaluate WASM indicators
	if len(wasmConfigs) > 0 {
		if wasm != nil {
			wasmResults, err := wasm.Evaluate(ctx, candles, wasmConfigs)
			if err != nil {
				return nil, err
			}
			for _, res := range wasmResults {
				resultsMap[res.InstanceID] = res
			}
		} else {
			for _, cfg := range wasmConfigs {
				resultsMap[cfg.InstanceID] = wickra.EvalResult{
					InstanceID:  cfg.InstanceID,
					IndicatorID: cfg.IndicatorID,
					Plots:       make(map[string][]wickra.SeriesPoint),
				}
			}
		}
	}

	// 2. Evaluate OrderScript indicators
	if len(scriptConfigs) > 0 {
		var symbol, resolution string
		for _, cfg := range scriptConfigs {
			if cfg.Inputs != nil {
				if sym, ok := cfg.Inputs["symbol"].(string); ok && sym != "" {
					symbol = sym
				}
				if res, ok := cfg.Inputs["resolution"].(string); ok && res != "" {
					resolution = res
				}
			}
		}
		sCtx := scripting.NewScriptContextFromCandles(symbol, resolution, candles)
		for _, cfg := range scriptConfigs {
			var code string
			var perms []string

			// Extract from inputs first
			if cfg.Inputs != nil {
				if c, ok := cfg.Inputs["code"].(string); ok && strings.TrimSpace(c) != "" {
					code = c
				} else if c, ok := cfg.Inputs["script"].(string); ok && strings.TrimSpace(c) != "" {
					code = c
				}

				if pSlice, ok := cfg.Inputs["permissions"].([]string); ok {
					perms = pSlice
				} else if pSlice, ok := cfg.Inputs["permissions"].([]interface{}); ok {
					for _, item := range pSlice {
						if str, ok := item.(string); ok {
							perms = append(perms, str)
						}
					}
				} else if pStr, ok := cfg.Inputs["permissions"].(string); ok && strings.TrimSpace(pStr) != "" {
					if strings.HasPrefix(strings.TrimSpace(pStr), "[") {
						_ = json.Unmarshal([]byte(pStr), &perms)
					} else {
						for _, part := range strings.Split(pStr, ",") {
							trimmed := strings.TrimSpace(part)
							if trimmed != "" {
								perms = append(perms, trimmed)
							}
						}
					}
				}
			}

			// Fallback to storage
			cleanID := strings.TrimPrefix(cfg.IndicatorID, "wickra.")
			if code == "" && st != nil {
				if userInd, err := st.GetUserIndicator(ctx, cleanID); err == nil && userInd != nil {
					code = userInd.Code
					if len(perms) == 0 {
						perms = userInd.Permissions
					}
				} else if userInd, err := st.GetUserIndicator(ctx, cfg.IndicatorID); err == nil && userInd != nil {
					code = userInd.Code
					if len(perms) == 0 {
						perms = userInd.Permissions
					}
				}
			}

			if code == "" || scriptEng == nil {
				resultsMap[cfg.InstanceID] = wickra.EvalResult{
					InstanceID:  cfg.InstanceID,
					IndicatorID: cfg.IndicatorID,
					Plots:       make(map[string][]wickra.SeriesPoint),
				}
				continue
			}

			res, err := scriptEng.Eval(ctx, code, sCtx, perms)
			if err != nil {
				log.Printf("[UnifiedIndicatorEngine] OrderScript evaluation error for %s: %v", cfg.IndicatorID, err)
				resultsMap[cfg.InstanceID] = wickra.EvalResult{
					InstanceID:  cfg.InstanceID,
					IndicatorID: cfg.IndicatorID,
					Plots:       make(map[string][]wickra.SeriesPoint),
				}
				continue
			}

			plots := res.Plots
			if plots == nil {
				plots = make(map[string][]wickra.SeriesPoint)
			}
			resultsMap[cfg.InstanceID] = wickra.EvalResult{
				InstanceID:  cfg.InstanceID,
				IndicatorID: cfg.IndicatorID,
				Plots:       plots,
			}
		}
	}

	// 3. Assemble results in original input order
	finalResults := make([]wickra.EvalResult, 0, len(configs))
	for _, cfg := range configs {
		if res, exists := resultsMap[cfg.InstanceID]; exists {
			finalResults = append(finalResults, res)
		} else {
			finalResults = append(finalResults, wickra.EvalResult{
				InstanceID:  cfg.InstanceID,
				IndicatorID: cfg.IndicatorID,
				Plots:       make(map[string][]wickra.SeriesPoint),
			})
		}
	}

	return finalResults, nil
}

// CreateSession establishes a real-time streaming session for the given indicator set.
func (u *UnifiedIndicatorEngine) CreateSession(ctx context.Context, symbol, resolution string, configs []wickra.EvalIndicatorInstance) (wickra.IndicatorSession, error) {
	var wasmConfigs []wickra.EvalIndicatorInstance
	var scriptConfigs []wickra.EvalIndicatorInstance

	for _, cfg := range configs {
		if u.isScriptConfig(ctx, cfg) {
			scriptConfigs = append(scriptConfigs, cfg)
		} else {
			wasmConfigs = append(wasmConfigs, cfg)
		}
	}

	u.mu.RLock()
	wasm := u.wasmEngine
	scriptEng := u.scriptingEngine
	st := u.storage
	u.mu.RUnlock()

	var wasmSession wickra.IndicatorSession
	if len(wasmConfigs) > 0 && wasm != nil {
		var err error
		wasmSession, err = wasm.CreateSession(ctx, symbol, resolution, wasmConfigs)
		if err != nil {
			return nil, err
		}
	}

	return &UnifiedIndicatorSession{
		wasmSession:     wasmSession,
		scriptingEngine: scriptEng,
		storage:         st,
		scriptConfigs:   scriptConfigs,
		symbol:          symbol,
		resolution:      resolution,
		history:         make([]wickra.CandleData, 0, 500),
	}, nil
}

// UnifiedIndicatorSession maintains streaming evaluation state for both WASM and OrderScript indicators.
type UnifiedIndicatorSession struct {
	wasmSession     wickra.IndicatorSession
	scriptingEngine *scripting.Engine
	storage         *storage.Storage
	scriptConfigs   []wickra.EvalIndicatorInstance
	symbol          string
	resolution      string
	history         []wickra.CandleData
	mu              sync.Mutex
}

// Update processes an incoming candle tick and computes updated plot coordinates.
func (s *UnifiedIndicatorSession) Update(ctx context.Context, c wickra.CandleData) (map[string]map[string]float64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	combinedPlots := make(map[string]map[string]float64)

	// 1. Update WASM session if present
	if s.wasmSession != nil {
		wasmPlots, err := s.wasmSession.Update(ctx, c)
		if err == nil && wasmPlots != nil {
			for instID, pMap := range wasmPlots {
				combinedPlots[instID] = pMap
			}
		}
	}

	// 2. Update rolling candle history for script indicators
	if len(s.history) > 0 && s.history[len(s.history)-1].Time == c.Time {
		s.history[len(s.history)-1] = c
	} else {
		s.history = append(s.history, c)
		if len(s.history) > 2000 {
			s.history = s.history[len(s.history)-2000:]
		}
	}

	// 3. Update script indicators
	if len(s.scriptConfigs) > 0 && s.scriptingEngine != nil {
		sCtx := scripting.NewScriptContextFromCandles(s.symbol, s.resolution, s.history)
		for _, cfg := range s.scriptConfigs {
			var code string
			var perms []string

			if cfg.Inputs != nil {
				if cStr, ok := cfg.Inputs["code"].(string); ok && strings.TrimSpace(cStr) != "" {
					code = cStr
				} else if cStr, ok := cfg.Inputs["script"].(string); ok && strings.TrimSpace(cStr) != "" {
					code = cStr
				}

				if pSlice, ok := cfg.Inputs["permissions"].([]string); ok {
					perms = pSlice
				} else if pSlice, ok := cfg.Inputs["permissions"].([]interface{}); ok {
					for _, item := range pSlice {
						if str, ok := item.(string); ok {
							perms = append(perms, str)
						}
					}
				} else if pStr, ok := cfg.Inputs["permissions"].(string); ok && strings.TrimSpace(pStr) != "" {
					if strings.HasPrefix(strings.TrimSpace(pStr), "[") {
						_ = json.Unmarshal([]byte(pStr), &perms)
					} else {
						for _, part := range strings.Split(pStr, ",") {
							trimmed := strings.TrimSpace(part)
							if trimmed != "" {
								perms = append(perms, trimmed)
							}
						}
					}
				}
			}
			cleanID := strings.TrimPrefix(cfg.IndicatorID, "wickra.")
			if code == "" && s.storage != nil {
				if userInd, err := s.storage.GetUserIndicator(ctx, cleanID); err == nil && userInd != nil {
					code = userInd.Code
					perms = userInd.Permissions
				} else if userInd, err := s.storage.GetUserIndicator(ctx, cfg.IndicatorID); err == nil && userInd != nil {
					code = userInd.Code
					perms = userInd.Permissions
				}
			}
			if code == "" {
				continue
			}

			evalRes, err := s.scriptingEngine.Eval(ctx, code, sCtx, perms)
			if err != nil || evalRes == nil || evalRes.Plots == nil {
				continue
			}

			pMap := make(map[string]float64)
			for pID, pts := range evalRes.Plots {
				if len(pts) > 0 {
					lastVal := pts[len(pts)-1].Value
					if !math.IsNaN(lastVal) && !math.IsInf(lastVal, 0) {
						pMap[pID] = lastVal
					}
				}
			}
			if len(pMap) > 0 {
				combinedPlots[cfg.InstanceID] = pMap
			}
		}
	}

	return combinedPlots, nil
}

// Close terminates and cleans up streaming session resources.
func (s *UnifiedIndicatorSession) Close(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.wasmSession != nil {
		return s.wasmSession.Close(ctx)
	}
	return nil
}
