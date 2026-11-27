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
	"go.starlark.net/starlark"
)

const maxUnifiedScriptCacheSize = 256

type cachedScriptEntry struct {
	found       bool
	id          string
	name        string
	description string
	code        string
	permissions []string
	prog        *starlark.Program
	compileErr  error
}

// UnifiedIndicatorEngine orchestrates technical indicator evaluation across both
// compiled WebAssembly (Wazero) built-in indicators and hermetic OrderScript (Starlark) custom indicators.
type UnifiedIndicatorEngine struct {
	wasmEngine      IndicatorEngine
	scriptingEngine *scripting.Engine
	storage         *storage.Storage
	mu              sync.RWMutex
	scriptCacheMu   sync.RWMutex
	scriptCache     map[string]*cachedScriptEntry
}

// NewUnifiedIndicatorEngine constructs a new UnifiedIndicatorEngine.
func NewUnifiedIndicatorEngine(wasm IndicatorEngine, script *scripting.Engine, st *storage.Storage) *UnifiedIndicatorEngine {
	return &UnifiedIndicatorEngine{
		wasmEngine:      wasm,
		scriptingEngine: script,
		storage:         st,
		scriptCache:     make(map[string]*cachedScriptEntry),
	}
}

// InvalidateScriptCache evicts cached script metadata and compiled *starlark.Program entries.
// Passing an empty id clears the entire script cache.
func (u *UnifiedIndicatorEngine) InvalidateScriptCache(id string) {
	u.scriptCacheMu.Lock()
	defer u.scriptCacheMu.Unlock()

	if u.scriptCache == nil {
		return
	}
	if id == "" {
		clear(u.scriptCache)
		return
	}

	cleanID := strings.TrimPrefix(id, "wickra.")
	delete(u.scriptCache, id)
	delete(u.scriptCache, cleanID)
	delete(u.scriptCache, "wickra."+cleanID)

	// Evict negative cache entries so direct/aliased saves become immediately visible.
	for k, entry := range u.scriptCache {
		if entry == nil || !entry.found {
			delete(u.scriptCache, k)
		}
	}
}

// SetScriptingEngine updates the attached OrderScript VM engine.
func (u *UnifiedIndicatorEngine) SetScriptingEngine(engine *scripting.Engine) {
	u.mu.Lock()
	u.scriptingEngine = engine
	u.mu.Unlock()
	u.InvalidateScriptCache("")
}

// SetStorage updates the storage backend reference.
func (u *UnifiedIndicatorEngine) SetStorage(st *storage.Storage) {
	u.mu.Lock()
	u.storage = st
	u.mu.Unlock()
	u.InvalidateScriptCache("")
}

// SetWasmEngine updates the underlying WASM engine.
func (u *UnifiedIndicatorEngine) SetWasmEngine(engine IndicatorEngine) {
	u.mu.Lock()
	u.wasmEngine = engine
	u.mu.Unlock()
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

func (u *UnifiedIndicatorEngine) getOrLoadScript(ctx context.Context, id string) *cachedScriptEntry {
	cleanID := strings.TrimPrefix(id, "wickra.")

	u.scriptCacheMu.RLock()
	if entry, ok := u.scriptCache[id]; ok {
		u.scriptCacheMu.RUnlock()
		return entry
	}
	if cleanID != id {
		if entry, ok := u.scriptCache[cleanID]; ok {
			u.scriptCacheMu.RUnlock()
			return entry
		}
	}
	u.scriptCacheMu.RUnlock()

	u.mu.RLock()
	st := u.storage
	scriptEng := u.scriptingEngine
	u.mu.RUnlock()

	if st == nil {
		return nil
	}

	userInd, err := st.GetUserIndicator(ctx, cleanID)
	if (err != nil || userInd == nil) && cleanID != id {
		userInd, err = st.GetUserIndicator(ctx, id)
	}
	if err != nil {
		return nil
	}

	var entry *cachedScriptEntry
	if userInd == nil {
		entry = &cachedScriptEntry{found: false}
	} else {
		var prog *starlark.Program
		var compErr error
		if scriptEng != nil && strings.TrimSpace(userInd.Code) != "" {
			prog, compErr = scriptEng.Compile(userInd.Code)
		}
		permsCopy := append([]string(nil), userInd.Permissions...)
		entry = &cachedScriptEntry{
			found:       true,
			id:          userInd.ID,
			name:        userInd.Name,
			description: userInd.Description,
			code:        userInd.Code,
			permissions: permsCopy,
			prog:        prog,
			compileErr:  compErr,
		}
	}

	u.scriptCacheMu.Lock()
	if u.scriptCache == nil {
		u.scriptCache = make(map[string]*cachedScriptEntry)
	}
	if len(u.scriptCache) >= maxUnifiedScriptCacheSize {
		clear(u.scriptCache)
	}
	u.scriptCache[id] = entry
	if cleanID != id {
		u.scriptCache[cleanID] = entry
	}
	if entry.found && entry.id != "" {
		u.scriptCache[entry.id] = entry
	}
	u.scriptCacheMu.Unlock()

	return entry
}

// GetDescriptor looks up an indicator descriptor from WASM catalog, cached storage, or synthetic custom script.
func (u *UnifiedIndicatorEngine) GetDescriptor(id string) (wickra.IndicatorDescriptor, bool) {
	u.mu.RLock()
	wasm := u.wasmEngine
	u.mu.RUnlock()

	if wasm != nil {
		if desc, ok := wasm.GetDescriptor(id); ok {
			return desc, true
		}
	}

	if entry := u.getOrLoadScript(context.Background(), id); entry != nil && entry.found {
		return wickra.IndicatorDescriptor{
			ID:          entry.id,
			Name:        entry.name,
			ShortName:   entry.name,
			Family:      "Custom Script",
			Category:    "Custom Script",
			Description: entry.description,
			Overlay:     true,
		}, true
	}

	cleanID := strings.TrimPrefix(id, "wickra.")
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

func extractScriptPermissions(inputs map[string]interface{}) []string {
	if inputs == nil {
		return nil
	}
	if pSlice, ok := inputs["permissions"].([]string); ok {
		return pSlice
	}
	if pSlice, ok := inputs["permissions"].([]interface{}); ok {
		perms := make([]string, 0, len(pSlice))
		for _, item := range pSlice {
			if str, ok := item.(string); ok {
				perms = append(perms, str)
			}
		}
		return perms
	}
	if pStr, ok := inputs["permissions"].(string); ok && strings.TrimSpace(pStr) != "" {
		var perms []string
		if strings.HasPrefix(strings.TrimSpace(pStr), "[") {
			_ = json.Unmarshal([]byte(pStr), &perms)
		} else {
			for _, part := range strings.Split(pStr, ",") {
				if trimmed := strings.TrimSpace(part); trimmed != "" {
					perms = append(perms, trimmed)
				}
			}
		}
		return perms
	}
	return nil
}

type resolvedScript struct {
	isScript   bool
	code       string
	prog       *starlark.Program
	compileErr error
	perms      []string
}

func (u *UnifiedIndicatorEngine) resolveScriptConfig(ctx context.Context, cfg wickra.EvalIndicatorInstance) resolvedScript {
	cleanID := strings.TrimPrefix(cfg.IndicatorID, "wickra.")
	hasScriptPrefix := strings.HasPrefix(cleanID, "script.") ||
		strings.HasPrefix(cleanID, "user.") ||
		strings.HasPrefix(cleanID, "custom.")

	u.mu.RLock()
	wasm := u.wasmEngine
	scriptEng := u.scriptingEngine
	u.mu.RUnlock()

	var inlineCode string
	if cfg.Inputs != nil {
		if c, ok := cfg.Inputs["code"].(string); ok && strings.TrimSpace(c) != "" {
			inlineCode = c
		} else if c, ok := cfg.Inputs["script"].(string); ok && strings.TrimSpace(c) != "" {
			inlineCode = c
		}
	}

	perms := extractScriptPermissions(cfg.Inputs)

	if inlineCode != "" {
		var prog *starlark.Program
		var compErr error
		if scriptEng != nil {
			prog, compErr = scriptEng.Compile(inlineCode)
		}
		return resolvedScript{
			isScript:   true,
			code:       inlineCode,
			prog:       prog,
			compileErr: compErr,
			perms:      perms,
		}
	}

	if !hasScriptPrefix && wasm != nil {
		indID := cfg.IndicatorID
		if indID == "wickra.vwap_std_dev_bands" || indID == "VwapStdDevBands" {
			indID = "wickra.vwap"
		}
		if _, ok := wasm.GetDescriptor(indID); ok {
			return resolvedScript{isScript: false}
		}
	}

	if entry := u.getOrLoadScript(ctx, cfg.IndicatorID); entry != nil && entry.found {
		if len(perms) == 0 {
			perms = entry.permissions
		}
		return resolvedScript{
			isScript:   true,
			code:       entry.code,
			prog:       entry.prog,
			compileErr: entry.compileErr,
			perms:      perms,
		}
	}

	return resolvedScript{isScript: hasScriptPrefix, perms: perms}
}

// isScriptConfig determines whether an indicator configuration represents an OrderScript script.
func (u *UnifiedIndicatorEngine) isScriptConfig(ctx context.Context, cfg wickra.EvalIndicatorInstance) bool {
	return u.resolveScriptConfig(ctx, cfg).isScript
}

// Evaluate performs batch coordinate calculation on candles for all requested indicators.
func (u *UnifiedIndicatorEngine) Evaluate(ctx context.Context, candles []wickra.CandleData, configs []wickra.EvalIndicatorInstance) ([]wickra.EvalResult, error) {
	if len(configs) == 0 {
		return []wickra.EvalResult{}, nil
	}

	type resolvedConfig struct {
		cfg    wickra.EvalIndicatorInstance
		script resolvedScript
	}

	var wasmConfigs []wickra.EvalIndicatorInstance
	var scriptConfigs []resolvedConfig

	for _, cfg := range configs {
		resScript := u.resolveScriptConfig(ctx, cfg)
		if resScript.isScript {
			scriptConfigs = append(scriptConfigs, resolvedConfig{cfg: cfg, script: resScript})
		} else {
			wasmConfigs = append(wasmConfigs, cfg)
		}
	}

	resultsMap := make(map[string]wickra.EvalResult, len(configs))

	u.mu.RLock()
	wasm := u.wasmEngine
	scriptEng := u.scriptingEngine
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

	// 2. Evaluate OrderScript indicators using cached compiled programs
	if len(scriptConfigs) > 0 {
		var symbol, resolution string
		for _, scCfg := range scriptConfigs {
			if scCfg.cfg.Inputs != nil {
				if sym, ok := scCfg.cfg.Inputs["symbol"].(string); ok && sym != "" {
					symbol = sym
				}
				if res, ok := scCfg.cfg.Inputs["resolution"].(string); ok && res != "" {
					resolution = res
				}
			}
		}
		sCtx := scripting.NewScriptContextFromCandles(symbol, resolution, candles)
		for _, item := range scriptConfigs {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			cfg := item.cfg
			rs := item.script
			if (rs.prog == nil && rs.code == "") || scriptEng == nil || rs.compileErr != nil {
				if rs.compileErr != nil {
					log.Printf("[UnifiedIndicatorEngine] OrderScript compilation error for %s: %v", cfg.IndicatorID, rs.compileErr)
				}
				resultsMap[cfg.InstanceID] = wickra.EvalResult{
					InstanceID:  cfg.InstanceID,
					IndicatorID: cfg.IndicatorID,
					Plots:       make(map[string][]wickra.SeriesPoint),
				}
				continue
			}

			var res *scripting.EvalResult
			var err error
			if rs.prog != nil {
				res, err = scriptEng.EvalProgram(ctx, rs.prog, sCtx, rs.perms)
			} else {
				res, err = scriptEng.Eval(ctx, rs.code, sCtx, rs.perms)
			}
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
	u.mu.RUnlock()

	var wasmSession wickra.IndicatorSession
	if len(wasmConfigs) > 0 && wasm != nil {
		var err error
		wasmSession, err = wasm.CreateSession(ctx, symbol, resolution, wasmConfigs)
		if err != nil {
			return nil, err
		}
	}

	var sCtx *scripting.ScriptContext
	if len(scriptConfigs) > 0 {
		sCtx = scripting.NewScriptContextFromCandles(symbol, resolution, nil)
	}

	return &UnifiedIndicatorSession{
		engine:          u,
		wasmSession:     wasmSession,
		scriptingEngine: scriptEng,
		scriptConfigs:   scriptConfigs,
		symbol:          symbol,
		resolution:      resolution,
		sCtx:            sCtx,
	}, nil
}

// UnifiedIndicatorSession maintains streaming evaluation state for both WASM and OrderScript indicators.
type UnifiedIndicatorSession struct {
	engine          *UnifiedIndicatorEngine
	wasmSession     wickra.IndicatorSession
	scriptingEngine *scripting.Engine
	scriptConfigs   []wickra.EvalIndicatorInstance
	symbol          string
	resolution      string
	sCtx            *scripting.ScriptContext
	mu              sync.Mutex
}

// Seed warms up the session with historical candles without re-evaluating Starlark on every historical bar.
func (s *UnifiedIndicatorSession) Seed(ctx context.Context, candles []wickra.CandleData) error {
	if len(candles) == 0 {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.wasmSession != nil {
		if seeder, ok := s.wasmSession.(interface {
			Seed(context.Context, []wickra.CandleData) error
		}); ok {
			if err := seeder.Seed(ctx, candles); err != nil {
				return err
			}
		} else {
			for _, c := range candles {
				if _, err := s.wasmSession.Update(ctx, c); err != nil {
					return err
				}
			}
		}
	}

	if len(s.scriptConfigs) > 0 {
		if len(candles) > 2000 {
			candles = candles[len(candles)-2000:]
		}
		s.sCtx = scripting.NewScriptContextFromCandles(s.symbol, s.resolution, candles)
	}
	return nil
}

// Update processes an incoming candle tick and computes updated plot coordinates.
func (s *UnifiedIndicatorSession) Update(ctx context.Context, c wickra.CandleData) (combinedPlots map[string]map[string]float64, updateErr error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("[UnifiedIndicatorSession] recovered panic during Update (%s): %v", s.symbol, rec)
			updateErr = nil
		}
	}()

	combinedPlots = make(map[string]map[string]float64)

	// 1. Update WASM session if present
	if s.wasmSession != nil {
		wasmPlots, err := s.wasmSession.Update(ctx, c)
		if err == nil && wasmPlots != nil {
			for instID, pMap := range wasmPlots {
				combinedPlots[instID] = pMap
			}
		}
	}

	// 2. Incrementally update ScriptContext tip bar and evaluate cached compiled Starlark programs
	if len(s.scriptConfigs) > 0 && s.scriptingEngine != nil {
		if s.sCtx == nil {
			s.sCtx = scripting.NewScriptContextFromCandles(s.symbol, s.resolution, nil)
		}
		s.sCtx.UpdateCandle(c, 2000)

		for _, cfg := range s.scriptConfigs {
			if ctx.Err() != nil {
				break
			}
			var rs resolvedScript
			if s.engine != nil {
				rs = s.engine.resolveScriptConfig(ctx, cfg)
			}
			if (rs.prog == nil && rs.code == "") || rs.compileErr != nil {
				continue
			}

			var evalRes *scripting.EvalResult
			var err error
			if rs.prog != nil {
				evalRes, err = s.scriptingEngine.EvalProgram(ctx, rs.prog, s.sCtx, rs.perms)
			} else {
				evalRes, err = s.scriptingEngine.Eval(ctx, rs.code, s.sCtx, rs.perms)
			}
			if err != nil || evalRes == nil || evalRes.Plots == nil {
				continue
			}

			pMap := make(map[string]float64, len(evalRes.Plots))
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
