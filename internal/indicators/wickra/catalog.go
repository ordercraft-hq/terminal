package wickra

import (
	"strings"
	"sync"
)

// Catalog holds all 500+ registered Wickra indicator descriptors.
type Catalog struct {
	descriptors  []IndicatorDescriptor
	byID         map[string]*IndicatorDescriptor
	byWasmClass  map[string]*IndicatorDescriptor
	byFamily     map[string][]*IndicatorDescriptor
	byCategory   map[string][]*IndicatorDescriptor
	byGroupLower map[string][]*IndicatorDescriptor
}

var (
	defaultCatalog *Catalog
	catalogOnce    sync.Once
)

// DefaultCatalog returns the lazily initialized singleton indicator catalog.
func DefaultCatalog() *Catalog {
	catalogOnce.Do(func() {
		defaultCatalog = NewCatalog()
	})
	return defaultCatalog
}

// NewCatalog constructs and returns the complete 500+ indicator catalog.
func NewCatalog() *Catalog {
	c := &Catalog{
		descriptors:  make([]IndicatorDescriptor, 0, 520),
		byID:         make(map[string]*IndicatorDescriptor, 520),
		byWasmClass:  make(map[string]*IndicatorDescriptor, 520),
		byFamily:     make(map[string][]*IndicatorDescriptor),
		byCategory:   make(map[string][]*IndicatorDescriptor),
		byGroupLower: make(map[string][]*IndicatorDescriptor, 48),
	}

	c.registerMovingAverages()
	c.registerMomentumOscillators()
	c.registerTrendDirectional()
	c.registerPriceOscillators()
	c.registerVolatilityBands()
	c.registerBandsChannels()
	c.registerTrailingStops()
	c.registerVolume()
	c.registerPriceStatistics()
	c.registerEhlersDSP()
	c.registerPivotsSR()
	c.registerDeMark()
	c.registerIchimokuCharts()
	c.registerAltChartBars()
	c.registerCandlestickPatterns()
	c.registerChartPatterns()
	c.registerHarmonicPatterns()
	c.registerFibonacci()
	c.registerMicrostructure()
	c.registerDerivatives()
	c.registerMarketProfile()
	c.registerMarketBreadth()
	c.registerRiskPerformance()
	c.registerSeasonalitySession()

	return c
}

// GetAll returns a copy of all indicator descriptors.
func (c *Catalog) GetAll() []IndicatorDescriptor {
	res := make([]IndicatorDescriptor, len(c.descriptors))
	copy(res, c.descriptors)
	return res
}

// GetByID looks up an indicator descriptor by its catalog ID (e.g. "wickra.sma").
func (c *Catalog) GetByID(id string) (*IndicatorDescriptor, bool) {
	d, ok := c.byID[id]
	return d, ok
}

// GetByWasmClass looks up an indicator descriptor by its WASM class name (e.g. "SMA").
func (c *Catalog) GetByWasmClass(wasmClass string) (*IndicatorDescriptor, bool) {
	d, ok := c.byWasmClass[wasmClass]
	return d, ok
}

// GetByFamily returns all descriptors belonging to a Wickra family (e.g. "Moving Averages").
func (c *Catalog) GetByFamily(family string) []*IndicatorDescriptor {
	return c.byFamily[family]
}

// GetByCategory returns all descriptors belonging to a UI category (e.g. "Trend & Overlays").
func (c *Catalog) GetByCategory(category string) []*IndicatorDescriptor {
	return c.byCategory[category]
}

// Count returns the total number of registered indicators.
func (c *Catalog) Count() int {
	return len(c.descriptors)
}

func (c *Catalog) add(d IndicatorDescriptor) {
	c.descriptors = append(c.descriptors, d)
	idx := len(c.descriptors) - 1
	ptr := &c.descriptors[idx]
	c.byID[d.ID] = ptr
	c.byWasmClass[d.WasmClass] = ptr
	c.byFamily[d.Family] = append(c.byFamily[d.Family], ptr)
	c.byCategory[d.Category] = append(c.byCategory[d.Category], ptr)

	catLower := strings.ToLower(d.Category)
	famLower := strings.ToLower(d.Family)
	if catLower != "" {
		c.byGroupLower[catLower] = append(c.byGroupLower[catLower], ptr)
	}
	if famLower != "" && famLower != catLower {
		c.byGroupLower[famLower] = append(c.byGroupLower[famLower], ptr)
	}
}

// containsFold reports whether s contains lowerSub (which must already be lowercase) case-insensitively.
func containsFold(s, lowerSub string) bool {
	if lowerSub == "" {
		return true
	}
	// Fast ASCII path avoids allocating lowercased copies for all 515+ descriptors.
	if len(s) < len(lowerSub) {
		return false
	}
	for i := 0; i < len(lowerSub); i++ {
		if lowerSub[i] >= 0x80 {
			return strings.Contains(strings.ToLower(s), lowerSub)
		}
	}
	for i := 0; i < len(s); i++ {
		if s[i] >= 0x80 {
			return strings.Contains(strings.ToLower(s), lowerSub)
		}
	}
	limit := len(s) - len(lowerSub)
	for i := 0; i <= limit; i++ {
		matched := true
		for j := 0; j < len(lowerSub); j++ {
			b := s[i+j]
			if b >= 'A' && b <= 'Z' {
				b += 'a' - 'A'
			}
			if b != lowerSub[j] {
				matched = false
				break
			}
		}
		if matched {
			return true
		}
	}
	return false
}

// Filter returns descriptors matching category/family and search query without copying non-matching entries.
func (c *Catalog) Filter(category, query string) []IndicatorDescriptor {
	catLower := strings.ToLower(strings.TrimSpace(category))
	qLower := strings.ToLower(strings.TrimSpace(query))

	matchesQuery := func(d *IndicatorDescriptor) bool {
		if d.ID == "wickra.vwap_std_dev_bands" {
			return false // Exclude deprecated standalone indicator consolidated into canonical wickra.vwap
		}
		if qLower == "" {
			return true
		}
		return containsFold(d.ID, qLower) ||
			containsFold(d.Name, qLower) ||
			containsFold(d.ShortName, qLower) ||
			containsFold(d.WasmClass, qLower)
	}

	if catLower != "" {
		candidates := c.byGroupLower[catLower]
		if len(candidates) == 0 {
			return nil
		}
		var filtered []IndicatorDescriptor
		if qLower == "" {
			filtered = make([]IndicatorDescriptor, 0, len(candidates))
		}
		for _, d := range candidates {
			if matchesQuery(d) {
				filtered = append(filtered, *d)
			}
		}
		return filtered
	}

	var filtered []IndicatorDescriptor
	if qLower == "" {
		filtered = make([]IndicatorDescriptor, 0, len(c.descriptors))
	}
	for i := range c.descriptors {
		d := &c.descriptors[i]
		if matchesQuery(d) {
			filtered = append(filtered, *d)
		}
	}
	return filtered
}

var defaultSourceOptions = []SelectOption{
	{Label: "Close", Value: "close"},
	{Label: "Open", Value: "open"},
	{Label: "High", Value: "high"},
	{Label: "Low", Value: "low"},
	{Label: "HL/2 (Median)", Value: "hl2"},
	{Label: "HLC/3 (Typical)", Value: "hlc3"},
	{Label: "OHLC/4 (Weighted)", Value: "ohlc4"},
}

func inputSource(def string) InputSchema {
	return InputSchema{
		ID:      "source",
		Name:    "Source",
		Type:    InputTypeSource,
		Default: def,
		Options: defaultSourceOptions,
	}
}

func inputPeriod(id, name string, def, min, max int) InputSchema {
	minF := float64(min)
	maxF := float64(max)
	stepF := float64(1)
	return InputSchema{
		ID:      id,
		Name:    name,
		Type:    InputTypeInteger,
		Default: def,
		Min:     &minF,
		Max:     &maxF,
		Step:    &stepF,
	}
}

func inputFloat(id, name string, def, min, max, step float64) InputSchema {
	return InputSchema{
		ID:      id,
		Name:    name,
		Type:    InputTypeFloat,
		Default: def,
		Min:     &min,
		Max:     &max,
		Step:    &step,
	}
}

func inputBool(id, name string, def bool) InputSchema {
	return InputSchema{
		ID:      id,
		Name:    name,
		Type:    InputTypeBoolean,
		Default: def,
	}
}

var defaultAnchorPeriodOptions = []SelectOption{
	{Label: "Session", Value: "session"},
	{Label: "Week", Value: "week"},
	{Label: "Month", Value: "month"},
	{Label: "Quarter", Value: "quarter"},
	{Label: "Year", Value: "year"},
	{Label: "Decade", Value: "decade"},
	{Label: "Century", Value: "century"},
}

var defaultBandsModeOptions = []SelectOption{
	{Label: "Standard Deviation", Value: "stdev"},
	{Label: "Percentage", Value: "percentage"},
}

func inputSelect(id, name, def string, options []SelectOption) InputSchema {
	return InputSchema{
		ID:      id,
		Name:    name,
		Type:    InputTypeSelect,
		Default: def,
		Options: options,
	}
}

func (c *Catalog) registerMovingAverages() {
	c.add(IndicatorDescriptor{
		ID: "wickra.alma",
		WasmClass: "ALMA",
		Name: "Arnaud Legoux Moving Average",
		ShortName: "ALMA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Gaussian-weighted moving average with offset center and sigma control.",
		Inputs: []InputSchema{inputPeriod("period", "Length", 9, 1, 500), inputFloat("offset", "Offset", 0.85, 0.01, 1.0, 0.01), inputFloat("sigma", "Sigma", 6.0, 1.0, 100.0, 1.0), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "ALMA", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.adaptive_laguerre",
		WasmClass: "AdaptiveLaguerre",
		Name: "Adaptive Laguerre Filter",
		ShortName: "AL",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Adaptive Laguerre filter with error-driven damping factor alpha.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Adaptive Laguerre", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.alligator",
		WasmClass: "Alligator",
		Name: "Alligator",
		ShortName: "Alligator",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Three Smmas of (high + low) / 2: Jaw / Teeth / Lips.",
		Inputs: []InputSchema{
			inputPeriod("jaw", "Jaw Length", 13, 1, 500),
			inputPeriod("teeth", "Teeth Length", 8, 1, 500),
			inputPeriod("lips", "Lips Length", 5, 1, 500),
			inputPeriod("jawOffset", "Jaw Offset", 8, 0, 100),
			inputPeriod("teethOffset", "Teeth Offset", 5, 0, 100),
			inputPeriod("lipsOffset", "Lips Offset", 3, 0, 100),
		},
		Plots: []PlotDirective{
			PlotDirective{ID: "jaw", Type: PlotTypeLine, Title: "Jaw", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true},
			PlotDirective{ID: "teeth", Type: PlotTypeLine, Title: "Teeth", Color: "#F23645", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true},
			PlotDirective{ID: "lips", Type: PlotTypeLine, Title: "Lips", Color: "#089981", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true},
		},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.dema",
		WasmClass: "DEMA",
		Name: "Double Exponential Moving Average",
		ShortName: "DEMA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Mulloy's 2·EMA − EMA(EMA); removes first-order EMA lag.",
		Inputs: []InputSchema{inputPeriod("period", "Length", 9, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "DEMA", Color: "#43A047", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ehma",
		WasmClass: "EHMA",
		Name: "Exponential Hull Moving Average",
		ShortName: "EHMA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Exponential Hull MA — EMA(2·EMA(n/2) − EMA(n), √n), low lag.",
		Inputs: []InputSchema{inputPeriod("period", "Length", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "EHMA", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ema",
		WasmClass: "EMA",
		Name: "Exponential Moving Average",
		ShortName: "EMA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "EMA with α = 2 / (period + 1), SMA-seeded.",
		Inputs: []InputSchema{
			inputPeriod("period", "Length", 9, 1, 500),
			inputSource("close"),
			inputPeriod("offset", "Offset", 0, -500, 500),
		},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "EMA", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.evwma",
		WasmClass: "EVWMA",
		Name: "Elastic Volume-Weighted Moving Average",
		ShortName: "EVWMA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Elastic volume-weighted recurrence over a rolling window.",
		Inputs: []InputSchema{
			inputPeriod("period", "Length", 14, 1, 500),
			inputSource("close"),
		},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "EVWMA", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.frama",
		WasmClass: "FRAMA",
		Name: "Fractal Adaptive Moving Average",
		ShortName: "FRAMA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Ehlers' fractal-dimension-adaptive EMA over close-only window halves.",
		Inputs: []InputSchema{
			inputPeriod("period", "Period", 14, 2, 500),
			inputSource("close"),
			inputPeriod("fast", "Fast moving average", 1, 1, 100),
			inputPeriod("slow", "Slow moving average", 200, 2, 500),
		},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "FRAMA", Color: "#FFD600", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.gd",
		WasmClass: "GD",
		Name: "Generalized DEMA",
		ShortName: "GD",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Tillson volume-factor double EMA (1 + v)·EMA − v·EMA(EMA).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("v", "V", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "G D", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.gma",
		WasmClass: "GMA",
		Name: "Geometric Moving Average",
		ShortName: "GMA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Rolling geometric mean of the last period prices.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "G MA", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.hma",
		WasmClass: "HMA",
		Name: "Hull Moving Average",
		ShortName: "HMA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Hull's near-zero-lag WMA(2·WMA(n/2) − WMA(n), √n).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{
			PlotDirective{ID: "up", Type: PlotTypeLine, Title: "Up Trend", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true},
			PlotDirective{ID: "down", Type: PlotTypeLine, Title: "Down Trend", Color: "#F23645", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true},
			PlotDirective{ID: "value", Type: PlotTypeLine, Title: "Value", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
			PlotDirective{ID: "direction", Type: PlotTypeLine, Title: "Direction", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
		},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.holt_winters",
		WasmClass: "HoltWinters",
		Name: "Holt-Winters",
		ShortName: "HW",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Holt double-exp smoothing (level + trend); one-step forecast.",
		Inputs: []InputSchema{inputFloat("alpha", "Alpha", 1.0, 0.01, 1000.0, 0.1), inputFloat("beta", "Beta", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Holt Winters", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.jma",
		WasmClass: "JMA",
		Name: "Jurik Moving Average",
		ShortName: "JMA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Jurik MA — three-stage filter reconstruction.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("phase", "Phase", 1.0, 0.01, 1000.0, 0.1), inputFloat("power", "Power", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "J MA", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.kama",
		WasmClass: "KAMA",
		Name: "Kaufman Adaptive Moving Average",
		ShortName: "KAMA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Kaufman's adaptive average; efficiency ratio picks α per bar.",
		Inputs: []InputSchema{inputPeriod("er_period", "Er Period", 14, 1, 500), inputPeriod("fast", "Fast Period", 12, 1, 200), inputPeriod("slow", "Slow Period", 26, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "K A MA", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.mc_ginley_dynamic",
		WasmClass: "McGinleyDynamic",
		Name: "McGinley Dynamic",
		ShortName: "MGD",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Self-adjusting MA, MD + (price − MD) / (0.6 · period · (price / MD)⁴).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Mc Ginley Dynamic", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.median_ma",
		WasmClass: "MedianMA",
		Name: "Median Moving Average",
		ShortName: "MMA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Rolling median of the last period prices (outlier-robust).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Median MA", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.sma",
		WasmClass: "SMA",
		Name: "Simple Moving Average",
		ShortName: "SMA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Equal-weighted rolling mean over period closes.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 20, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "SMA", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.smma",
		WasmClass: "SMMA",
		Name: "Smoothed Moving Average",
		ShortName: "SMMA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Wilder's RMA: SMA-seeded exponential average, 1/period factor.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "S M MA", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.swma",
		WasmClass: "SWMA",
		Name: "Sine-Weighted Moving Average",
		ShortName: "SWMA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Sine-weighted MA (half-cycle weights, centre-heavy).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "S W MA", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.t3",
		WasmClass: "T3",
		Name: "Tillson T3",
		ShortName: "T3",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Tillson's six-EMA cascade recombined with a volume factor v.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("v", "V", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{
			PlotDirective{ID: "up", Type: PlotTypeLine, Title: "Up Trend", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true},
			PlotDirective{ID: "down", Type: PlotTypeLine, Title: "Down Trend", Color: "#F23645", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true},
			PlotDirective{ID: "value", Type: PlotTypeLine, Title: "Value", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
			PlotDirective{ID: "direction", Type: PlotTypeLine, Title: "Direction", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
		},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tema",
		WasmClass: "TEMA",
		Name: "Triple Exponential Moving Average",
		ShortName: "TEMA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Mulloy's 3·EMA − 3·EMA(EMA) + EMA(EMA(EMA)).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T E MA", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.trima",
		WasmClass: "TRIMA",
		Name: "Triangular Moving Average",
		ShortName: "TRIMA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "A period-window SMA applied twice; triangular weights.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T R I MA", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.vidya",
		WasmClass: "VIDYA",
		Name: "Variable Index Dynamic Average",
		ShortName: "VIDYA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "EMA whose alpha scales with |CMO(cmo_period)| / 100.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputPeriod("cmo_period", "Cmo Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "V I D Y A", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.vwma",
		WasmClass: "VWMA",
		Name: "Volume-Weighted Moving Average",
		ShortName: "VWMA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Rolling mean of closes weighted by each bar's volume.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "V W MA", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.wma",
		WasmClass: "WMA",
		Name: "Weighted Moving Average",
		ShortName: "WMA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Linear weights 1, 2, …, period; newest bar matters most.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "W MA", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.zlema",
		WasmClass: "ZLEMA",
		Name: "Zero-Lag Exponential Moving Average",
		ShortName: "ZLEMA",
		Family: "Moving Averages",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "EMA of the de-lagged series 2·price − price[lag].",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Z L E MA", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerMomentumOscillators() {
	c.add(IndicatorDescriptor{
		ID: "wickra.anchored_rsi",
		WasmClass: "AnchoredRSI",
		Name: "Anchored RSI",
		ShortName: "ARSI",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Cumulative RSI from a user-set anchor bar (RSI of the whole leg).",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Anchored RSI", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.awesome_oscillator",
		WasmClass: "AwesomeOscillator",
		Name: "Awesome Oscillator",
		ShortName: "AO",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "SMA(median, fast) − SMA(median, slow); zero-line crossover.",
		Inputs: []InputSchema{inputPeriod("fast", "Fast Period", 12, 1, 200), inputPeriod("slow", "Slow Period", 26, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Awesome Oscillator", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.cci",
		WasmClass: "CCI",
		Name: "Commodity Channel Index",
		ShortName: "CCI",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "(typical − SMA(typical)) / (0.015 · mean_dev).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "C C I", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
		Levels: []LevelDirective{LevelDirective{Value: 100, Color: "#F23645", LineStyle: LineStyleDashed, LineWidth: 1, Label: "Overbought", Visible: true}, LevelDirective{Value: -100, Color: "#089981", LineStyle: LineStyleDashed, LineWidth: 1, Label: "Oversold", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.cmo",
		WasmClass: "CMO",
		Name: "Chande Momentum Oscillator",
		ShortName: "CMO",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Chande Momentum Oscillator; 100·(Σgain − Σloss)/(Σgain + Σloss).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "C M O", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.connors_rsi",
		WasmClass: "ConnorsRSI",
		Name: "Connors RSI",
		ShortName: "CRSI",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Average of RSI(close), RSI(streak), percentile-rank of returns.",
		Inputs: []InputSchema{inputPeriod("period_rsi", "Period Rsi", 14, 1, 500), inputPeriod("period_streak", "Period Streak", 14, 1, 500), inputPeriod("period_rank", "Period Rank", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Connors RSI", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
		Levels: []LevelDirective{LevelDirective{Value: 70, Color: "#F23645", LineStyle: LineStyleDashed, LineWidth: 1, Label: "Overbought", Visible: true}, LevelDirective{Value: 30, Color: "#089981", LineStyle: LineStyleDashed, LineWidth: 1, Label: "Oversold", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.derivative_oscillator",
		WasmClass: "DerivativeOscillator",
		Name: "Derivative Oscillator",
		ShortName: "DO",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Brown's double-EMA-smoothed RSI minus an SMA signal; zero-centered histogram.",
		Inputs: []InputSchema{inputPeriod("rsi_period", "Rsi Period", 14, 1, 500), inputFloat("smooth1", "Smooth1", 1.0, 0.01, 1000.0, 0.1), inputFloat("smooth2", "Smooth2", 1.0, 0.01, 1000.0, 0.1), inputPeriod("signal_period", "Signal Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Derivative Oscillator", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.disparity_index",
		WasmClass: "DisparityIndex",
		Name: "Disparity Index",
		ShortName: "DI",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Percentage gap between price and its SMA (the Japanese kairi).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Disparity Index", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.dynamic_momentum_index",
		WasmClass: "DynamicMomentumIndex",
		Name: "Dynamic Momentum Index",
		ShortName: "DMI",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Chande RSI whose lookback shortens as volatility rises.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Dynamic Momentum Index", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.elder_ray",
		WasmClass: "ElderRay",
		Name: "Elder Ray",
		ShortName: "ER",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Bull/Bear Power: each bar's high/low vs. an EMA of close.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "bullPower", Type: PlotTypeLine, Title: "bullPower", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "bearPower", Type: PlotTypeLine, Title: "bearPower", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.fisher_rsi",
		WasmClass: "FisherRSI",
		Name: "Fisher RSI",
		ShortName: "FRSI",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Fisher transform of a normalised RSI; sharp symmetric extremes.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Fisher RSI", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.imi",
		WasmClass: "IMI",
		Name: "Intraday Momentum Index",
		ShortName: "IMI",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "RSI built from the candle body (open→close).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "I M I", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.inertia",
		WasmClass: "Inertia",
		Name: "Inertia Indicator",
		ShortName: "INERTI",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "LinearRegression(RelativeVolatilityIndex(close, rvi_period), linreg_period) (Dorsey).",
		Inputs: []InputSchema{inputPeriod("rvi_period", "Rvi Period", 14, 1, 500), inputPeriod("linreg_period", "Linreg Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Inertia", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.kst",
		WasmClass: "KST",
		Name: "Know Sure Thing (KST)",
		ShortName: "KST",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Pring's 1·RCMA_1 + 2·RCMA_2 + 3·RCMA_3 + 4·RCMA_4, plus SMA signal.",
		Inputs: []InputSchema{inputFloat("roc1", "Roc1", 1.0, 0.01, 1000.0, 0.1), inputFloat("roc2", "Roc2", 1.0, 0.01, 1000.0, 0.1), inputFloat("roc3", "Roc3", 1.0, 0.01, 1000.0, 0.1), inputFloat("roc4", "Roc4", 1.0, 0.01, 1000.0, 0.1), inputFloat("sma1", "Sma1", 1.0, 0.01, 1000.0, 0.1), inputFloat("sma2", "Sma2", 1.0, 0.01, 1000.0, 0.1), inputFloat("sma3", "Sma3", 1.0, 0.01, 1000.0, 0.1), inputFloat("sma4", "Sma4", 1.0, 0.01, 1000.0, 0.1), inputPeriod("signal_period", "Signal Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "kst", Type: PlotTypeLine, Title: "kst", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "signal", Type: PlotTypeLine, Title: "signal", Color: "#FF9800", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.laguerre_rsi",
		WasmClass: "LaguerreRSI",
		Name: "Laguerre RSI",
		ShortName: "LRSI",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Ehlers' 4-stage Laguerre filter with RSI up/down accumulator.",
		Inputs: []InputSchema{inputFloat("gamma", "Gamma", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Laguerre RSI", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
		Levels: []LevelDirective{LevelDirective{Value: 70, Color: "#F23645", LineStyle: LineStyleDashed, LineWidth: 1, Label: "Overbought", Visible: true}, LevelDirective{Value: 30, Color: "#089981", LineStyle: LineStyleDashed, LineWidth: 1, Label: "Oversold", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.mfi",
		WasmClass: "MFI",
		Name: "Money Flow Index",
		ShortName: "MFI",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "\"Volume-weighted RSI\": Wilder smoothing of money-flow ratios.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "M F I", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.mom",
		WasmClass: "MOM",
		Name: "Momentum",
		ShortName: "MOM",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "price − price[period]; raw price-difference momentum.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "M O M", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.pgo",
		WasmClass: "PGO",
		Name: "Pretty Good Oscillator",
		ShortName: "PGO",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "(close − SMA(close, period)) / EMA(TR, period).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "P G O", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.pmo",
		WasmClass: "PMO",
		Name: "Price Momentum Oscillator",
		ShortName: "PMO",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "DecisionPoint Price Momentum Oscillator; doubly-smoothed ROC.",
		Inputs: []InputSchema{inputFloat("smoothing1", "Smoothing1", 1.0, 0.01, 1000.0, 0.1), inputFloat("smoothing2", "Smoothing2", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "P M O", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.qqe",
		WasmClass: "QQE",
		Name: "Quantitative Qualitative Estimation (QQE)",
		ShortName: "QQE",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Smoothed RSI with an \"ATR-of-RSI\" trailing line.",
		Inputs: []InputSchema{inputPeriod("rsi_period", "Rsi Period", 14, 1, 500), inputFloat("smoothing", "Smoothing", 1.0, 0.01, 1000.0, 0.1), inputFloat("factor", "Factor", 2.0, 0.1, 10.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "rsiMa", Type: PlotTypeLine, Title: "rsiMa", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "trailingLine", Type: PlotTypeLine, Title: "trailingLine", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rmi",
		WasmClass: "RMI",
		Name: "Relative Momentum Index",
		ShortName: "RMI",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Wilder RSI over a multi-bar momentum lookback.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("momentum", "Momentum", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "R M I", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.roc",
		WasmClass: "ROC",
		Name: "Rate of Change",
		ShortName: "ROC",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "(price − price_n) / price_n × 100; raw percentage change.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "R O C", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rocp",
		WasmClass: "ROCP",
		Name: "Rate of Change Percentage (ROCP)",
		ShortName: "ROCP",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Rate of Change Percentage; (close − close[period]) / close[period].",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "R O C P", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rocr",
		WasmClass: "ROCR",
		Name: "Rate of Change Ratio",
		ShortName: "ROCR",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Rate of Change Ratio; close / close[period].",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "R O C R", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rocr100",
		WasmClass: "ROCR100",
		Name: "Rate of Change Ratio 100",
		ShortName: "ROCR100",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Rate of Change Ratio ×100; close / close[period] · 100.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "R O C R100", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rsi",
		WasmClass: "RSI",
		Name: "Relative Strength Index (RSI)",
		ShortName: "RSI",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Wilder's RSI; smoothed gain / (gain + loss) × 100.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "R S I", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
		Levels: []LevelDirective{
			LevelDirective{Value: 70, Color: "#F23645", LineStyle: LineStyleDashed, LineWidth: 1, Label: "Overbought", Visible: true},
			LevelDirective{Value: 50, Color: "#787B86", LineStyle: LineStyleDotted, LineWidth: 1, Label: "Midline", Visible: true},
			LevelDirective{Value: 30, Color: "#089981", LineStyle: LineStyleDashed, LineWidth: 1, Label: "Oversold", Visible: true},
		},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rsx",
		WasmClass: "RSX",
		Name: "Relative Strength Xtra (RSX)",
		ShortName: "RSX",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Jurik-smoothed, low-noise RSI.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "R S X", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rvi",
		WasmClass: "RVI",
		Name: "Relative Vigor Index (RVI)",
		ShortName: "RVI",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "SMA(sym(close − open), period) / SMA(sym(high − low), period), sym = 1-2-2-1 / 6 weighting.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "R V I", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.smi",
		WasmClass: "SMI",
		Name: "Stochastic Momentum Index (SMI)",
		ShortName: "SMI",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Blau's doubly-EMA-smoothed close-vs-range displacement.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputPeriod("d_period", "D Period", 14, 1, 500), inputPeriod("d2_period", "D2 Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "S M I", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.stoch_rsi",
		WasmClass: "StochRSI",
		Name: "Stochastic RSI",
		ShortName: "SRSI",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Stochastic Oscillator applied to the RSI series.",
		Inputs: []InputSchema{inputPeriod("rsi_period", "Rsi Period", 14, 1, 500), inputPeriod("stoch_period", "Stoch Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Stoch RSI", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
		Levels: []LevelDirective{LevelDirective{Value: 80, Color: "#F23645", LineStyle: LineStyleDashed, LineWidth: 1, Label: "Upper", Visible: true}, LevelDirective{Value: 20, Color: "#089981", LineStyle: LineStyleDashed, LineWidth: 1, Label: "Lower", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.stochastic",
		WasmClass: "Stochastic",
		Name: "Stochastic Oscillator",
		ShortName: "STOCHA",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "%K = (close − low_n)/(high_n − low_n) × 100, smoothed into %D.",
		Inputs: []InputSchema{inputPeriod("k_period", "K Period", 14, 1, 500), inputPeriod("d_period", "D Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "k", Type: PlotTypeLine, Title: "k", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "d", Type: PlotTypeLine, Title: "d", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
		Levels: []LevelDirective{LevelDirective{Value: 80, Color: "#F23645", LineStyle: LineStyleDashed, LineWidth: 1, Label: "Upper", Visible: true}, LevelDirective{Value: 20, Color: "#089981", LineStyle: LineStyleDashed, LineWidth: 1, Label: "Lower", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.stochastic_cci",
		WasmClass: "StochasticCCI",
		Name: "Stochastic CCI",
		ShortName: "SCCI",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Stochastic oscillator over the CCI; bounded [0, 100].",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Stochastic CCI", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tsi",
		WasmClass: "TSI",
		Name: "True Strength Index (TSI)",
		ShortName: "TSI",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "True Strength Index; double-EMA-smoothed momentum ratio.",
		Inputs: []InputSchema{inputFloat("long", "Long", 1.0, 0.01, 1000.0, 0.1), inputFloat("short", "Short", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T S I", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ultimate_oscillator",
		WasmClass: "UltimateOscillator",
		Name: "Ultimate Oscillator",
		ShortName: "UO",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Larry Williams' weighted three-timeframe buying-pressure oscillator.",
		Inputs: []InputSchema{inputFloat("short", "Short", 1.0, 0.01, 1000.0, 0.1), inputFloat("mid", "Mid", 1.0, 0.01, 1000.0, 0.1), inputFloat("long", "Long", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Ultimate Oscillator", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.williams_r",
		WasmClass: "WilliamsR",
		Name: "Williams %R",
		ShortName: "WR",
		Family: "Momentum Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "−100 × (high_n − close) / (high_n − low_n).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Williams R", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerTrendDirectional() {
	c.add(IndicatorDescriptor{
		ID: "wickra.adx",
		WasmClass: "ADX",
		Name: "Average Directional Movement Index (ADX)",
		ShortName: "ADX",
		Family: "Trend & Directional",
		Category: "Trend & Overlays",
		Overlay: false,
		Description: "Wilder's directional system: +DI, −DI and the ADX strength index.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plusDi", Type: PlotTypeLine, Title: "plusDi", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "minusDi", Type: PlotTypeLine, Title: "minusDi", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "adx", Type: PlotTypeLine, Title: "adx", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.adxr",
		WasmClass: "ADXR",
		Name: "Average Directional Movement Index Rating (ADXR)",
		ShortName: "ADXR",
		Family: "Trend & Directional",
		Category: "Trend & Overlays",
		Overlay: false,
		Description: "Wilder's ADX-rating: average of ADX_t and ADX_{t − (period − 1)}.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "A D X R", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.aroon",
		WasmClass: "Aroon",
		Name: "Aroon",
		ShortName: "Aroon",
		Family: "Trend & Directional",
		Category: "Trend & Overlays",
		Overlay: false,
		Description: "Bars-since-high and bars-since-low scaled to [0, 100].",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "up", Type: PlotTypeLine, Title: "up", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "down", Type: PlotTypeLine, Title: "down", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.aroon_oscillator",
		WasmClass: "AroonOscillator",
		Name: "Aroon Oscillator",
		ShortName: "AO",
		Family: "Trend & Directional",
		Category: "Trend & Overlays",
		Overlay: false,
		Description: "AroonUp − AroonDown; the two Aroon lines as one gauge.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Aroon Oscillator", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.choppiness_index",
		WasmClass: "ChoppinessIndex",
		Name: "Choppiness Index",
		ShortName: "CI",
		Family: "Trend & Directional",
		Category: "Trend & Overlays",
		Overlay: false,
		Description: "Summed true range over the high-low span, log-scaled.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Choppiness Index", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.dx",
		WasmClass: "DX",
		Name: "Directional Movement Index (DX)",
		ShortName: "DX",
		Family: "Trend & Directional",
		Category: "Trend & Overlays",
		Overlay: false,
		Description: "Directional Movement Index; 100·abs(+DI − −DI)/(+DI + −DI).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "D X", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.gator_oscillator",
		WasmClass: "GatorOscillator",
		Name: "Gator Oscillator",
		ShortName: "GO",
		Family: "Trend & Directional",
		Category: "Trend & Overlays",
		Overlay: false,
		Description: "Alligator convergence/divergence as a two-sided histogram.",
		Inputs: []InputSchema{inputPeriod("jaw_period", "Jaw Period", 14, 1, 500), inputPeriod("teeth_period", "Teeth Period", 14, 1, 500), inputPeriod("lips_period", "Lips Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "upper", Type: PlotTypeLine, Title: "upper", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lower", Type: PlotTypeLine, Title: "lower", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
		Bands: []BandDirective{BandDirective{ID: "gatoroscillator_fill", UpperPlotID: "upper", LowerPlotID: "lower", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.kase_permission_stochastic",
		WasmClass: "KasePermissionStochastic",
		Name: "Kase Permission Stochastic",
		ShortName: "KPS",
		Family: "Trend & Directional",
		Category: "Trend & Overlays",
		Overlay: false,
		Description: "Double-smoothed stochastic fast/slow permission filter.",
		Inputs: []InputSchema{inputPeriod("length", "Length", 14, 1, 500), inputFloat("smooth", "Smooth", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "fast", Type: PlotTypeLine, Title: "fast", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "slow", Type: PlotTypeLine, Title: "slow", Color: "#FF9800", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.macd",
		WasmClass: "MACD",
		Name: "Moving Average Convergence Divergence (MACD)",
		ShortName: "MACD",
		Family: "Trend & Directional",
		Category: "Trend & Overlays",
		Overlay: false,
		Description: "EMA(fast) − EMA(slow) plus a signal EMA and the histogram.",
		Inputs: []InputSchema{inputPeriod("fast", "Fast Period", 12, 1, 200), inputPeriod("slow", "Slow Period", 26, 1, 500), inputPeriod("signal", "Signal Period", 9, 1, 100), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "macd", Type: PlotTypeLine, Title: "macd", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "signal", Type: PlotTypeLine, Title: "signal", Color: "#FF9800", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "histogram", Type: PlotTypeHistogram, Title: "histogram", Color: "#089981", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.macdext",
		WasmClass: "MACDEXT",
		Name: "MACD Extended",
		ShortName: "MACDEXT",
		Family: "Trend & Directional",
		Category: "Trend & Overlays",
		Overlay: false,
		Description: "MACD with a selectable MA type (SMA/EMA/WMA/DEMA/TEMA/TRIMA) per line.",
		Inputs: []InputSchema{inputPeriod("fast", "Fast Period", 12, 1, 200), inputFloat("fast_matype", "Fast Matype", 1.0, 0.01, 1000.0, 0.1), inputPeriod("slow", "Slow Period", 26, 1, 500), inputFloat("slow_matype", "Slow Matype", 1.0, 0.01, 1000.0, 0.1), inputPeriod("signal", "Signal Period", 9, 1, 100), inputFloat("signal_matype", "Signal Matype", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "macd", Type: PlotTypeLine, Title: "macd", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "signal", Type: PlotTypeLine, Title: "signal", Color: "#FF9800", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "histogram", Type: PlotTypeHistogram, Title: "histogram", Color: "#089981", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.macdfix",
		WasmClass: "MACDFIX",
		Name: "MACD Fixed",
		ShortName: "MACDFIX",
		Family: "Trend & Directional",
		Category: "Trend & Overlays",
		Overlay: false,
		Description: "TA-Lib MACDFIX — fast/slow EMAs with fixed constants 0.15 / 0.075; only the signal period is tunable.",
		Inputs: []InputSchema{inputPeriod("signal", "Signal Period", 9, 1, 100), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "macd", Type: PlotTypeLine, Title: "macd", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "signal", Type: PlotTypeLine, Title: "signal", Color: "#FF9800", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "histogram", Type: PlotTypeHistogram, Title: "histogram", Color: "#089981", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.mass_index",
		WasmClass: "MassIndex",
		Name: "Mass Index",
		ShortName: "MI",
		Family: "Trend & Directional",
		Category: "Trend & Overlays",
		Overlay: false,
		Description: "Dorsey's range-expansion sum of the EMA-of-range ratio.",
		Inputs: []InputSchema{inputPeriod("ema_period", "Ema Period", 14, 1, 500), inputPeriod("sum_period", "Sum Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Mass Index", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.qstick",
		WasmClass: "Qstick",
		Name: "Qstick",
		ShortName: "Qstick",
		Family: "Trend & Directional",
		Category: "Trend & Overlays",
		Overlay: false,
		Description: "Running average of the candle body close − open.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Qstick", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.trix",
		WasmClass: "TRIX",
		Name: "Triple Exponentially Smoothed Average (TRIX)",
		ShortName: "TRIX",
		Family: "Trend & Directional",
		Category: "Trend & Overlays",
		Overlay: false,
		Description: "Rate of change of a triple-smoothed EMA, × 10000.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T R I X", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.vertical_horizontal_filter",
		WasmClass: "VerticalHorizontalFilter",
		Name: "Vertical Horizontal Filter (VHF)",
		ShortName: "VHF",
		Family: "Trend & Directional",
		Category: "Trend & Overlays",
		Overlay: false,
		Description: "Net price move divided by total move over period.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Vertical Horizontal Filter", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.vortex",
		WasmClass: "Vortex",
		Name: "Vortex Indicator",
		ShortName: "Vortex",
		Family: "Trend & Directional",
		Category: "Trend & Overlays",
		Overlay: false,
		Description: "Vortex Indicator VI+ / VI−; crossings mark trend onset.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plus", Type: PlotTypeLine, Title: "plus", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "minus", Type: PlotTypeLine, Title: "minus", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.wave_pm",
		WasmClass: "WAVE_PM",
		Name: "Wave PM",
		ShortName: "WAVE_PM",
		Family: "Trend & Directional",
		Category: "Trend & Overlays",
		Overlay: false,
		Description: "Kase variance-normalised peak-momentum statistic.",
		Inputs: []InputSchema{inputPeriod("length", "Length", 14, 1, 500), inputFloat("smoothing", "Smoothing", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "W A V E_ P M", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.wave_trend",
		WasmClass: "WaveTrend",
		Name: "WaveTrend",
		ShortName: "WT",
		Family: "Trend & Directional",
		Category: "Trend & Overlays",
		Overlay: false,
		Description: "LazyBear: 3-stage EMA cascade through the typical-price channel index.",
		Inputs: []InputSchema{inputPeriod("channel_period", "Channel Period", 14, 1, 500), inputPeriod("average_period", "Average Period", 14, 1, 500), inputPeriod("signal_period", "Signal Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "wt1", Type: PlotTypeLine, Title: "wt1", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "wt2", Type: PlotTypeLine, Title: "wt2", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerPriceOscillators() {
	c.add(IndicatorDescriptor{
		ID: "wickra.apo",
		WasmClass: "APO",
		Name: "Absolute Price Oscillator",
		ShortName: "APO",
		Family: "Price Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Absolute Price Oscillator; raw EMA_fast − EMA_slow.",
		Inputs: []InputSchema{inputPeriod("fast", "Fast Period", 12, 1, 200), inputPeriod("slow", "Slow Period", 26, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "A P O", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.accelerator_oscillator",
		WasmClass: "AcceleratorOscillator",
		Name: "Accelerator Oscillator (AC)",
		ShortName: "AO",
		Family: "Price Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "AO − SMA(AO, signal); the acceleration of momentum.",
		Inputs: []InputSchema{inputFloat("ao_fast", "Ao Fast", 1.0, 0.01, 1000.0, 0.1), inputFloat("ao_slow", "Ao Slow", 1.0, 0.01, 1000.0, 0.1), inputPeriod("signal_period", "Signal Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Accelerator Oscillator", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.awesome_oscillator_histogram",
		WasmClass: "AwesomeOscillatorHistogram",
		Name: "Awesome Oscillator Histogram",
		ShortName: "AOH",
		Family: "Price Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "AO − AO_{t-1}; differenced Awesome Oscillator.",
		Inputs: []InputSchema{inputPeriod("fast", "Fast Period", 12, 1, 200), inputPeriod("slow", "Slow Period", 26, 1, 500), inputPeriod("sma_period", "Sma Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Awesome Oscillator Histogram", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.balance_of_power",
		WasmClass: "BalanceOfPower",
		Name: "Balance of Power (BOP)",
		ShortName: "BOP",
		Family: "Price Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "(close − open) / (high − low); intrabar buyer/seller control.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Balance Of Power", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.cfo",
		WasmClass: "CFO",
		Name: "Chande Forecast Oscillator",
		ShortName: "CFO",
		Family: "Price Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Chande Forecast Oscillator; 100·(close − linreg_endpoint)/close.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "C F O", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.coppock",
		WasmClass: "Coppock",
		Name: "Coppock",
		ShortName: "COPPOC",
		Family: "Price Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Coppock Curve; WMA(ROC(long) + ROC(short), wma_period).",
		Inputs: []InputSchema{inputFloat("roc_long", "Roc Long", 1.0, 0.01, 1000.0, 0.1), inputFloat("roc_short", "Roc Short", 1.0, 0.01, 1000.0, 0.1), inputPeriod("wma_period", "Wma Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Coppock", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.dpo",
		WasmClass: "DPO",
		Name: "Detrended Price Oscillator (DPO)",
		ShortName: "DPO",
		Family: "Price Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Detrended Price Oscillator; price[t − period/2 − 1] − SMA(period).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "D P O", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.elder_impulse",
		WasmClass: "ElderImpulse",
		Name: "Elder Impulse System",
		ShortName: "EI",
		Family: "Price Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Alexander Elder's (EMA-slope, MACD-hist-slope) regime classifier.",
		Inputs: []InputSchema{inputPeriod("ema_period", "Ema Period", 14, 1, 500), inputFloat("macd_fast", "Macd Fast", 1.0, 0.01, 1000.0, 0.1), inputFloat("macd_slow", "Macd Slow", 1.0, 0.01, 1000.0, 0.1), inputFloat("macd_signal", "Macd Signal", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Elder Impulse", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.macd_histogram",
		WasmClass: "MacdHistogram",
		Name: "MACD Histogram",
		ShortName: "MH",
		Family: "Price Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Standalone MACD histogram; macd − signal.",
		Inputs: []InputSchema{inputPeriod("fast", "Fast Period", 12, 1, 200), inputPeriod("slow", "Slow Period", 26, 1, 500), inputPeriod("signal", "Signal Period", 9, 1, 100), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Macd Histogram", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ppo",
		WasmClass: "PPO",
		Name: "PPO",
		ShortName: "PPO",
		Family: "Price Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Percentage Price Oscillator; 100·(EMA_fast − EMA_slow)/EMA_slow.",
		Inputs: []InputSchema{inputPeriod("fast", "Fast Period", 12, 1, 200), inputPeriod("slow", "Slow Period", 26, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "P P O", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ppo_histogram",
		WasmClass: "PpoHistogram",
		Name: "PPO Histogram",
		ShortName: "PH",
		Family: "Price Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "PPO histogram; ppo − EMA(ppo, signal), scale-free.",
		Inputs: []InputSchema{inputPeriod("fast", "Fast Period", 12, 1, 200), inputPeriod("slow", "Slow Period", 26, 1, 500), inputPeriod("signal", "Signal Period", 9, 1, 100), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Ppo Histogram", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.stc",
		WasmClass: "STC",
		Name: "Schaff Trend Cycle (STC)",
		ShortName: "STC",
		Family: "Price Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Schaff Trend Cycle; double-stochastic of MACD.",
		Inputs: []InputSchema{inputPeriod("fast", "Fast Period", 12, 1, 200), inputPeriod("slow", "Slow Period", 26, 1, 500), inputPeriod("schaff_period", "Schaff Period", 14, 1, 500), inputFloat("factor", "Factor", 2.0, 0.1, 10.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "S T C", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tsf_oscillator",
		WasmClass: "TsfOscillator",
		Name: "Time Series Forecast Oscillator",
		ShortName: "TO",
		Family: "Price Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "Time Series Forecast Oscillator; 100·(close − TSF)/close (one bar ahead).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Tsf Oscillator", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.zero_lag_macd",
		WasmClass: "ZeroLagMACD",
		Name: "Zero-Lag MACD",
		ShortName: "ZLMACD",
		Family: "Price Oscillators",
		Category: "Oscillators",
		Overlay: false,
		Description: "MACD with ZLEMA in place of EMA; faster, slightly noisier.",
		Inputs: []InputSchema{inputPeriod("fast", "Fast Period", 12, 1, 200), inputPeriod("slow", "Slow Period", 26, 1, 500), inputPeriod("signal", "Signal Period", 9, 1, 100), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "macd", Type: PlotTypeLine, Title: "macd", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "signal", Type: PlotTypeLine, Title: "signal", Color: "#FF9800", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "histogram", Type: PlotTypeHistogram, Title: "histogram", Color: "#089981", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerVolatilityBands() {
	c.add(IndicatorDescriptor{
		ID: "wickra.atr",
		WasmClass: "ATR",
		Name: "Average True Range (ATR)",
		ShortName: "ATR",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "Wilder-smoothed True Range; per-bar absolute volatility.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "A T R", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.bollinger_bandwidth",
		WasmClass: "BollingerBandwidth",
		Name: "Bollinger Bandwidth",
		ShortName: "BB",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "(upper − lower) / middle of the Bollinger Bands.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("multiplier", "Multiplier", 2.0, 0.1, 10.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Bollinger Bandwidth", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.chaikin_volatility",
		WasmClass: "ChaikinVolatility",
		Name: "Chaikin Volatility",
		ShortName: "CV",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "Rate of change of an EMA-smoothed high-low spread.",
		Inputs: []InputSchema{inputPeriod("ema_period", "Ema Period", 14, 1, 500), inputPeriod("roc_period", "Roc Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Chaikin Volatility", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.donchian",
		WasmClass: "Donchian",
		Name: "Donchian Channels",
		ShortName: "DONCHI",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "Highest high and lowest low over period bars.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "upper", Type: PlotTypeLine, Title: "upper", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "middle", Type: PlotTypeLine, Title: "middle", Color: "#26A69A", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lower", Type: PlotTypeLine, Title: "lower", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
		Bands: []BandDirective{BandDirective{ID: "donchian_fill", UpperPlotID: "upper", LowerPlotID: "lower", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ewma_volatility",
		WasmClass: "EwmaVolatility",
		Name: "EWMA Volatility",
		ShortName: "EV",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "EWMA Volatility — the RiskMetrics exponentially-weighted volatility of log returns, reacting instantly to a shock and forgetting it at rate λ.",
		Inputs: []InputSchema{inputFloat("lambda", "Lambda", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Ewma Volatility", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.garch11",
		WasmClass: "Garch11",
		Name: "GARCH(1,1) conditional volatility",
		ShortName: "G11",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "GARCH(1,1) conditional volatility — the EWMA recursion plus a constant ω that anchors the estimate to a finite, mean-reverting long-run variance.",
		Inputs: []InputSchema{inputFloat("omega", "Omega", 1.0, 0.01, 1000.0, 0.1), inputFloat("alpha", "Alpha", 1.0, 0.01, 1000.0, 0.1), inputFloat("beta", "Beta", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Garch11", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.garman_klass_volatility",
		WasmClass: "GarmanKlassVolatility",
		Name: "Garman-Klass Volatility",
		ShortName: "GKV",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "OHLC realised vol; ~7.4× efficient, biased under drift.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputPeriod("trading_periods", "Trading Periods", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Garman Klass Volatility", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.historical_volatility",
		WasmClass: "HistoricalVolatility",
		Name: "Historical Volatility",
		ShortName: "HV",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "Annualised sample stddev of log returns.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputPeriod("trading_periods", "Trading Periods", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Historical Volatility", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.keltner",
		WasmClass: "Keltner",
		Name: "Keltner Channels",
		ShortName: "KELTNE",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "EMA middle band with ±multiplier × ATR bands.",
		Inputs: []InputSchema{inputPeriod("ema_period", "Ema Period", 14, 1, 500), inputPeriod("atr_period", "Atr Period", 14, 1, 500), inputFloat("multiplier", "Multiplier", 2.0, 0.1, 10.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "upper", Type: PlotTypeLine, Title: "upper", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "middle", Type: PlotTypeLine, Title: "middle", Color: "#26A69A", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lower", Type: PlotTypeLine, Title: "lower", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
		Bands: []BandDirective{BandDirective{ID: "keltner_fill", UpperPlotID: "upper", LowerPlotID: "lower", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.natr",
		WasmClass: "NATR",
		Name: "Normalized Average True Range (NATR)",
		ShortName: "NATR",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "100·ATR/close; ATR as a percentage.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "N A T R", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.parkinson_volatility",
		WasmClass: "ParkinsonVolatility",
		Name: "Parkinson Volatility",
		ShortName: "PV",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "High-low realised vol; ~5× more efficient than C2C stddev.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputPeriod("trading_periods", "Trading Periods", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Parkinson Volatility", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.percent_b",
		WasmClass: "PercentB",
		Name: "Bollinger %b",
		ShortName: "PB",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "(price − lower) / (upper − lower); price position in the bands.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("multiplier", "Multiplier", 2.0, 0.1, 10.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Percent B", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rvivolatility",
		WasmClass: "RVIVolatility",
		Name: "Relative Volatility Index (RVI)",
		ShortName: "RVIV",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "RSI-shaped volatility direction gauge built on rolling stddev.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "R V I Volatility", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.realized_volatility",
		WasmClass: "RealizedVolatility",
		Name: "Realized Volatility",
		ShortName: "RV",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "√(Σ r²) raw quadratic variation over period returns.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Realized Volatility", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rogers_satchell_volatility",
		WasmClass: "RogersSatchellVolatility",
		Name: "Rogers-Satchell Volatility",
		ShortName: "RSV",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "Drift-free OHLC realised vol; exact under arbitrary Brownian drift.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputPeriod("trading_periods", "Trading Periods", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Rogers Satchell Volatility", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.std_dev",
		WasmClass: "StdDev",
		Name: "Std Dev",
		ShortName: "StdDev",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "Rolling population standard deviation of price.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Std Dev", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.true_range",
		WasmClass: "TrueRange",
		Name: "True Range",
		ShortName: "TR",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "max(H−L, |H−prevC|, |L−prevC|); raw single-bar volatility.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "True Range", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ulcer_index",
		WasmClass: "UlcerIndex",
		Name: "Ulcer Index",
		ShortName: "UI",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "RMS of trailing-high drawdowns; downside-only risk.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Ulcer Index", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.volatility_cone",
		WasmClass: "VolatilityCone",
		Name: "Volatility Cone",
		ShortName: "VC",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "Volatility Cone — where the current realized volatility sits inside its own historical envelope (min / median / max / percentile) over a lookback window.",
		Inputs: []InputSchema{inputPeriod("window", "Window", 14, 1, 500), inputPeriod("lookback", "Lookback", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "current", Type: PlotTypeLine, Title: "current", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "min", Type: PlotTypeLine, Title: "min", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "median", Type: PlotTypeLine, Title: "median", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "max", Type: PlotTypeLine, Title: "max", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "percentile", Type: PlotTypeLine, Title: "percentile", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.volatility_of_volatility",
		WasmClass: "VolatilityOfVolatility",
		Name: "Volatility of Volatility",
		ShortName: "VOV",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "Volatility of Volatility — the standard deviation of a rolling realized- volatility series; how unstable the volatility regime itself is.",
		Inputs: []InputSchema{inputFloat("vol_window", "Vol Window", 1.0, 0.01, 1000.0, 0.1), inputFloat("vov_window", "Vov Window", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Volatility Of Volatility", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.yang_zhang_volatility",
		WasmClass: "YangZhangVolatility",
		Name: "Yang-Zhang Volatility",
		ShortName: "YZV",
		Family: "Volatility & Bands",
		Category: "Volatility & Bands",
		Overlay: false,
		Description: "Drift- and gap-robust OHLC blend of overnight, open-close and Rogers-Satchell.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputPeriod("trading_periods", "Trading Periods", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Yang Zhang Volatility", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerBandsChannels() {
	c.add(IndicatorDescriptor{
		ID: "wickra.acceleration_bands",
		WasmClass: "AccelerationBands",
		Name: "Acceleration Bands",
		ShortName: "AB",
		Family: "Bands & Channels",
		Category: "Volatility & Bands",
		Overlay: true,
		Description: "Price Headley's momentum-biased bands; width scales with (H − L) / (H + L).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("factor", "Factor", 2.0, 0.1, 10.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "upper", Type: PlotTypeLine, Title: "upper", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "middle", Type: PlotTypeLine, Title: "middle", Color: "#26A69A", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lower", Type: PlotTypeLine, Title: "lower", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
		Bands: []BandDirective{BandDirective{ID: "accelerationbands_fill", UpperPlotID: "upper", LowerPlotID: "lower", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.atr_bands",
		WasmClass: "AtrBands",
		Name: "Atr Bands",
		ShortName: "AB",
		Family: "Bands & Channels",
		Category: "Volatility & Bands",
		Overlay: true,
		Description: "Close-anchored envelope close ± k·ATR; stop/target bracket.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("multiplier", "Multiplier", 2.0, 0.1, 10.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "upper", Type: PlotTypeLine, Title: "upper", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "middle", Type: PlotTypeLine, Title: "middle", Color: "#26A69A", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lower", Type: PlotTypeLine, Title: "lower", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
		Bands: []BandDirective{BandDirective{ID: "atrbands_fill", UpperPlotID: "upper", LowerPlotID: "lower", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.bollinger_bands",
		WasmClass: "BollingerBands",
		Name: "Bollinger Bands",
		ShortName: "BB",
		Family: "Bands & Channels",
		Category: "Volatility & Bands",
		Overlay: true,
		Description: "SMA middle band with ±multiplier × population_stddev bands.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("multiplier", "Multiplier", 2.0, 0.1, 10.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "upper", Type: PlotTypeLine, Title: "upper", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "middle", Type: PlotTypeLine, Title: "middle", Color: "#26A69A", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lower", Type: PlotTypeLine, Title: "lower", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "stddev", Type: PlotTypeLine, Title: "stddev", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
		Bands: []BandDirective{BandDirective{ID: "bollingerbands_fill", UpperPlotID: "upper", LowerPlotID: "lower", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.bomar_bands",
		WasmClass: "BomarBands",
		Name: "Bomar Bands",
		ShortName: "BB",
		Family: "Bands & Channels",
		Category: "Volatility & Bands",
		Overlay: true,
		Description: "Adaptive percentage bands around a moving average, sized so that a fixed coverage fraction of recent closes falls inside them.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("coverage", "Coverage", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "upper", Type: PlotTypeLine, Title: "upper", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "middle", Type: PlotTypeLine, Title: "middle", Color: "#26A69A", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lower", Type: PlotTypeLine, Title: "lower", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
		Bands: []BandDirective{BandDirective{ID: "bomarbands_fill", UpperPlotID: "upper", LowerPlotID: "lower", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.double_bollinger",
		WasmClass: "DoubleBollinger",
		Name: "Double Bollinger",
		ShortName: "DB",
		Family: "Bands & Channels",
		Category: "Volatility & Bands",
		Overlay: true,
		Description: "Two concentric Bollinger envelopes (±k_inner·σ, ±k_outer·σ).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("k_inner", "K Inner", 1.0, 0.01, 1000.0, 0.1), inputFloat("k_outer", "K Outer", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "upperOuter", Type: PlotTypeLine, Title: "upperOuter", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "upperInner", Type: PlotTypeLine, Title: "upperInner", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "middle", Type: PlotTypeLine, Title: "middle", Color: "#26A69A", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lowerInner", Type: PlotTypeLine, Title: "lowerInner", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lowerOuter", Type: PlotTypeLine, Title: "lowerOuter", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.fractal_chaos_bands",
		WasmClass: "FractalChaosBands",
		Name: "Fractal Chaos Bands",
		ShortName: "FCB",
		Family: "Bands & Channels",
		Category: "Volatility & Bands",
		Overlay: true,
		Description: "Step-function envelope of the latest Bill Williams 5-bar fractals.",
		Inputs: []InputSchema{inputFloat("k", "K", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "upper", Type: PlotTypeLine, Title: "upper", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lower", Type: PlotTypeLine, Title: "lower", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
		Bands: []BandDirective{BandDirective{ID: "fractalchaosbands_fill", UpperPlotID: "upper", LowerPlotID: "lower", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.hurst_channel",
		WasmClass: "HurstChannel",
		Name: "Hurst Channel",
		ShortName: "HC",
		Family: "Bands & Channels",
		Category: "Volatility & Bands",
		Overlay: true,
		Description: "SMA centerline wrapped by the rolling high-low range.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("multiplier", "Multiplier", 2.0, 0.1, 10.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "upper", Type: PlotTypeLine, Title: "upper", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "middle", Type: PlotTypeLine, Title: "middle", Color: "#26A69A", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lower", Type: PlotTypeLine, Title: "lower", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
		Bands: []BandDirective{BandDirective{ID: "hurstchannel_fill", UpperPlotID: "upper", LowerPlotID: "lower", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.lin_reg_channel",
		WasmClass: "LinRegChannel",
		Name: "Lin Reg Channel",
		ShortName: "LRC",
		Family: "Bands & Channels",
		Category: "Volatility & Bands",
		Overlay: true,
		Description: "OLS endpoint ± k · σ of regression residuals.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("multiplier", "Multiplier", 2.0, 0.1, 10.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "upper", Type: PlotTypeLine, Title: "upper", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "middle", Type: PlotTypeLine, Title: "middle", Color: "#26A69A", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lower", Type: PlotTypeLine, Title: "lower", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
		Bands: []BandDirective{BandDirective{ID: "linregchannel_fill", UpperPlotID: "upper", LowerPlotID: "lower", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ma_envelope",
		WasmClass: "MaEnvelope",
		Name: "Ma Envelope",
		ShortName: "ME",
		Family: "Bands & Channels",
		Category: "Volatility & Bands",
		Overlay: true,
		Description: "SMA centerline with fixed-percent envelope.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("percent", "Percent", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "upper", Type: PlotTypeLine, Title: "upper", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "middle", Type: PlotTypeLine, Title: "middle", Color: "#26A69A", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lower", Type: PlotTypeLine, Title: "lower", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
		Bands: []BandDirective{BandDirective{ID: "maenvelope_fill", UpperPlotID: "upper", LowerPlotID: "lower", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.median_channel",
		WasmClass: "MedianChannel",
		Name: "Median Channel",
		ShortName: "MC",
		Family: "Bands & Channels",
		Category: "Volatility & Bands",
		Overlay: true,
		Description: "A robust analogue of Bollinger Bands: centre on the rolling median, size by the median absolute deviation (MAD).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("multiplier", "Multiplier", 2.0, 0.1, 10.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "upper", Type: PlotTypeLine, Title: "upper", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "middle", Type: PlotTypeLine, Title: "middle", Color: "#26A69A", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lower", Type: PlotTypeLine, Title: "lower", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
		Bands: []BandDirective{BandDirective{ID: "medianchannel_fill", UpperPlotID: "upper", LowerPlotID: "lower", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.projection_bands",
		WasmClass: "ProjectionBands",
		Name: "Projection Bands",
		ShortName: "PB",
		Family: "Bands & Channels",
		Category: "Volatility & Bands",
		Overlay: true,
		Description: "Mel Widner's forward-projected high/low envelope: fit a separate regression to the highs and to the lows, slide every bar forward along its slope, and take the running max / min.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "upper", Type: PlotTypeLine, Title: "upper", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "middle", Type: PlotTypeLine, Title: "middle", Color: "#26A69A", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lower", Type: PlotTypeLine, Title: "lower", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
		Bands: []BandDirective{BandDirective{ID: "projectionbands_fill", UpperPlotID: "upper", LowerPlotID: "lower", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.projection_oscillator",
		WasmClass: "ProjectionOscillator",
		Name: "Projection Oscillator",
		ShortName: "PO",
		Family: "Bands & Channels",
		Category: "Volatility & Bands",
		Overlay: true,
		Description: "Mel Widner's companion to the projection bands: where the close sits inside the [lower, upper] projection envelope, scaled to 0..100.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Projection Oscillator", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.quartile_bands",
		WasmClass: "QuartileBands",
		Name: "Quartile Bands",
		ShortName: "QB",
		Family: "Bands & Channels",
		Category: "Volatility & Bands",
		Overlay: true,
		Description: "A non-parametric envelope drawn at the rolling 25th / 50th / 75th percentiles — order statistics instead of mean ± sigma.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "upper", Type: PlotTypeLine, Title: "upper", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "middle", Type: PlotTypeLine, Title: "middle", Color: "#26A69A", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lower", Type: PlotTypeLine, Title: "lower", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
		Bands: []BandDirective{BandDirective{ID: "quartilebands_fill", UpperPlotID: "upper", LowerPlotID: "lower", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.spread_bollinger_bands",
		WasmClass: "SpreadBollingerBands",
		Name: "Spread Bollinger Bands",
		ShortName: "SBB",
		Family: "Bands & Channels",
		Category: "Volatility & Bands",
		Overlay: true,
		Description: "Bollinger bands on the spread a − b of two series.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("num_std", "Num Std", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "middle", Type: PlotTypeLine, Title: "middle", Color: "#26A69A", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "upper", Type: PlotTypeLine, Title: "upper", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lower", Type: PlotTypeLine, Title: "lower", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "percentB", Type: PlotTypeLine, Title: "percentB", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
		Bands: []BandDirective{BandDirective{ID: "spreadbollingerbands_fill", UpperPlotID: "upper", LowerPlotID: "lower", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.standard_error_bands",
		WasmClass: "StandardErrorBands",
		Name: "Standard Error Bands",
		ShortName: "SEB",
		Family: "Bands & Channels",
		Category: "Volatility & Bands",
		Overlay: true,
		Description: "OLS endpoint ± k · stderr (n − 2 denominator).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("multiplier", "Multiplier", 2.0, 0.1, 10.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "upper", Type: PlotTypeLine, Title: "upper", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "middle", Type: PlotTypeLine, Title: "middle", Color: "#26A69A", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lower", Type: PlotTypeLine, Title: "lower", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
		Bands: []BandDirective{BandDirective{ID: "standarderrorbands_fill", UpperPlotID: "upper", LowerPlotID: "lower", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.starc_bands",
		WasmClass: "StarcBands",
		Name: "Stoller Average Range Channel",
		ShortName: "SB",
		Family: "Bands & Channels",
		Category: "Volatility & Bands",
		Overlay: true,
		Description: "Stoller Average Range Channel — SMA(close) ± k·ATR.",
		Inputs: []InputSchema{inputPeriod("sma_period", "Sma Period", 14, 1, 500), inputPeriod("atr_period", "Atr Period", 14, 1, 500), inputFloat("multiplier", "Multiplier", 2.0, 0.1, 10.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "upper", Type: PlotTypeLine, Title: "upper", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "middle", Type: PlotTypeLine, Title: "middle", Color: "#26A69A", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lower", Type: PlotTypeLine, Title: "lower", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
		Bands: []BandDirective{BandDirective{ID: "starcbands_fill", UpperPlotID: "upper", LowerPlotID: "lower", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ttm_squeeze",
		WasmClass: "TtmSqueeze",
		Name: "Ttm Squeeze",
		ShortName: "TS",
		Family: "Bands & Channels",
		Category: "Volatility & Bands",
		Overlay: true,
		Description: "BB-inside-KC squeeze flag + detrended-close momentum (LinReg).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("bb_mult", "Bb Mult", 2.0, 0.1, 10.0, 0.1), inputFloat("kc_mult", "Kc Mult", 2.0, 0.1, 10.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "squeeze", Type: PlotTypeLine, Title: "squeeze", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "momentum", Type: PlotTypeLine, Title: "momentum", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID:          "wickra.vwap_std_dev_bands",
		WasmClass:   "VwapStdDevBands",
		Name:        "Vwap Std Dev Bands",
		ShortName:   "VSDB",
		Family:      "Bands & Channels",
		Category:    "Volatility & Bands",
		Overlay:     true,
		Description: "Cumulative VWAP ± k·σ (volume-weighted standard deviation). Consolidates to canonical wickra.vwap.",
		Inputs:      []InputSchema{inputFloat("multiplier", "Multiplier", 2.0, 0.1, 10.0, 0.1)},
		Plots: []PlotDirective{
			{ID: "plot", Type: PlotTypeLine, Title: "VWAP", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true},
			{ID: "upper", Type: PlotTypeLine, Title: "Upper", Color: "#089981", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true},
			{ID: "lower", Type: PlotTypeLine, Title: "Lower", Color: "#089981", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true},
			{ID: "upper_1", Type: PlotTypeLine, Title: "Upper Band #1", Color: "#089981", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true},
			{ID: "lower_1", Type: PlotTypeLine, Title: "Lower Band #1", Color: "#089981", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true},
			{ID: "stddev", Type: PlotTypeLine, Title: "StdDev", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true},
		},
		Bands: []BandDirective{
			{ID: "vwapstddevbands_fill", Title: "Bands Fill #1", UpperPlotID: "upper", LowerPlotID: "lower", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true},
		},
	})
}

func (c *Catalog) registerTrailingStops() {
	c.add(IndicatorDescriptor{
		ID: "wickra.atr_ratchet",
		WasmClass: "AtrRatchet",
		Name: "ATR Ratchet",
		ShortName: "AR",
		Family: "Trailing Stops",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Perry Kaufman's time-based volatility stop — it tightens by a fixed fraction of ATR every bar, so a stalled trade is squeezed out even in a flat market.",
		Inputs: []InputSchema{inputPeriod("atr_period", "Atr Period", 14, 1, 500), inputFloat("start_mult", "Start Mult", 2.0, 0.1, 10.0, 0.1), inputFloat("increment", "Increment", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{
			PlotDirective{ID: "up", Type: PlotTypeLine, Title: "Up Trend", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true},
			PlotDirective{ID: "down", Type: PlotTypeLine, Title: "Down Trend", Color: "#F23645", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true},
			PlotDirective{ID: "value", Type: PlotTypeLine, Title: "Value", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
			PlotDirective{ID: "direction", Type: PlotTypeLine, Title: "Direction", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
		},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.atr_trailing_stop",
		WasmClass: "AtrTrailingStop",
		Name: "ATR Trailing Stop",
		ShortName: "ATS",
		Family: "Trailing Stops",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "A single line trailing the close by k·ATR, ratcheting.",
		Inputs: []InputSchema{inputPeriod("atr_period", "Atr Period", 14, 1, 500), inputFloat("multiplier", "Multiplier", 2.0, 0.1, 10.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Atr Trailing Stop", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.chande_kroll_stop",
		WasmClass: "ChandeKrollStop",
		Name: "Chande Kroll Stop",
		ShortName: "CKS",
		Family: "Trailing Stops",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Two-stage ATR stop: extreme-based, then smoothed.",
		Inputs: []InputSchema{inputPeriod("atr_period", "Atr Period", 14, 1, 500), inputFloat("atr_multiplier", "Atr Multiplier", 2.0, 0.1, 10.0, 0.1), inputPeriod("stop_period", "Stop Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "stopLong", Type: PlotTypeLine, Title: "stopLong", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "stopShort", Type: PlotTypeLine, Title: "stopShort", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.chandelier_exit",
		WasmClass: "ChandelierExit",
		Name: "Chandelier Exit",
		ShortName: "CE",
		Family: "Trailing Stops",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "highest_high − k·ATR (long) and lowest_low + k·ATR (short).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("multiplier", "Multiplier", 2.0, 0.1, 10.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "longStop", Type: PlotTypeLine, Title: "longStop", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "shortStop", Type: PlotTypeLine, Title: "shortStop", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.donchian_stop",
		WasmClass: "DonchianStop",
		Name: "Donchian Channel Stop",
		ShortName: "DS",
		Family: "Trailing Stops",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Turtle exit channel: lowest low / highest high over period.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "stopLong", Type: PlotTypeLine, Title: "stopLong", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "stopShort", Type: PlotTypeLine, Title: "stopShort", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.elder_safe_zone",
		WasmClass: "ElderSafeZone",
		Name: "Elder SafeZone Stop",
		ShortName: "ESZ",
		Family: "Trailing Stops",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Alexander Elder's trailing stop placed a multiple of the average market noise away from price — wide enough to survive normal pullbacks, tight enough to exit a real reversal.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("coeff", "Coeff", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{
			PlotDirective{ID: "up", Type: PlotTypeLine, Title: "Up Trend", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true},
			PlotDirective{ID: "down", Type: PlotTypeLine, Title: "Down Trend", Color: "#F23645", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true},
			PlotDirective{ID: "value", Type: PlotTypeLine, Title: "Value", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
			PlotDirective{ID: "direction", Type: PlotTypeLine, Title: "Direction", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
		},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.hi_lo_activator",
		WasmClass: "HiLoActivator",
		Name: "Gann HiLo Activator",
		ShortName: "HLA",
		Family: "Trailing Stops",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "SMA(high) / SMA(low) state-machine trail (Crabel-style).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Hi Lo Activator", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.kase_dev_stop",
		WasmClass: "KaseDevStop",
		Name: "Kase DevStop",
		ShortName: "KDS",
		Family: "Trailing Stops",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Cynthia Kase's volatility trailing stop, built on the standard deviation of the two-bar true range — it ratchets in the trend's favour and flips on a close through the line.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("dev", "Dev", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{
			PlotDirective{ID: "up", Type: PlotTypeLine, Title: "Up Trend", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true},
			PlotDirective{ID: "down", Type: PlotTypeLine, Title: "Down Trend", Color: "#F23645", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true},
			PlotDirective{ID: "value", Type: PlotTypeLine, Title: "Value", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
			PlotDirective{ID: "direction", Type: PlotTypeLine, Title: "Direction", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
		},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.modified_ma_stop",
		WasmClass: "ModifiedMaStop",
		Name: "Modified Ma Stop",
		ShortName: "MMS",
		Family: "Trailing Stops",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "A trailing stop riding the Modified Moving Average (SMMA / Wilder's RMA), ratcheted so it only moves in the trend's favour and flips on a decisive cross.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{
			PlotDirective{ID: "up", Type: PlotTypeLine, Title: "Up Trend", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true},
			PlotDirective{ID: "down", Type: PlotTypeLine, Title: "Down Trend", Color: "#F23645", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true},
			PlotDirective{ID: "value", Type: PlotTypeLine, Title: "Value", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
			PlotDirective{ID: "direction", Type: PlotTypeLine, Title: "Direction", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
		},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.psar",
		WasmClass: "PSAR",
		Name: "Parabolic SAR",
		ShortName: "PSAR",
		Family: "Trailing Stops",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Wilder's Parabolic Stop-and-Reverse; flips sides on a crossing.",
		Inputs: []InputSchema{inputFloat("af_start", "Af Start", 1.0, 0.01, 1000.0, 0.1), inputFloat("af_step", "Af Step", 1.0, 0.01, 1000.0, 0.1), inputFloat("af_max", "Af Max", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeCircles, Title: "P S A R", Color: "#2196F3", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.percentage_trailing_stop",
		WasmClass: "PercentageTrailingStop",
		Name: "Percentage Trailing Stop",
		ShortName: "PTS",
		Family: "Trailing Stops",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Fixed-percentage flip-on-close-through trail.",
		Inputs: []InputSchema{inputFloat("percent", "Percent", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Percentage Trailing Stop", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.renko_trailing_stop",
		WasmClass: "RenkoTrailingStop",
		Name: "Renko Trailing Stop",
		ShortName: "RTS",
		Family: "Trailing Stops",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Renko-brick-anchored trail; anchor moves only after full-brick advance.",
		Inputs: []InputSchema{inputFloat("block_size", "Block Size", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Renko Trailing Stop", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.sarext",
		WasmClass: "SAREXT",
		Name: "Parabolic SAR Extended",
		ShortName: "SAREXT",
		Family: "Trailing Stops",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Extended Parabolic SAR: start value, reversal offset, separate long/short acceleration, signed output.",
		Inputs: []InputSchema{inputFloat("start_value", "Start Value", 1.0, 0.01, 1000.0, 0.1), inputFloat("offset_on_reverse", "Offset On Reverse", 1.0, 0.01, 1000.0, 0.1), inputFloat("accel_init_long", "Accel Init Long", 1.0, 0.01, 1000.0, 0.1), inputFloat("accel_long", "Accel Long", 1.0, 0.01, 1000.0, 0.1), inputFloat("accel_max_long", "Accel Max Long", 1.0, 0.01, 1000.0, 0.1), inputFloat("accel_init_short", "Accel Init Short", 1.0, 0.01, 1000.0, 0.1), inputFloat("accel_short", "Accel Short", 1.0, 0.01, 1000.0, 0.1), inputFloat("accel_max_short", "Accel Max Short", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "S A R E X T", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.step_trailing_stop",
		WasmClass: "StepTrailingStop",
		Name: "Step Trailing Stop",
		ShortName: "STS",
		Family: "Trailing Stops",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Grid-snapped trail; ratchets in discrete step_size increments.",
		Inputs: []InputSchema{inputFloat("step_size", "Step Size", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Step Trailing Stop", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.super_trend",
		WasmClass: "SuperTrend",
		Name: "SuperTrend",
		ShortName: "ST",
		Family: "Trailing Stops",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "ATR-banded trailing stop with explicit flip logic.",
		Inputs: []InputSchema{inputPeriod("atr_period", "Atr Period", 14, 1, 500), inputFloat("multiplier", "Multiplier", 2.0, 0.1, 10.0, 0.1)},
		Plots: []PlotDirective{
			PlotDirective{ID: "up", Type: PlotTypeLine, Title: "Up Trend", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true},
			PlotDirective{ID: "down", Type: PlotTypeLine, Title: "Down Trend", Color: "#F23645", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true},
			PlotDirective{ID: "value", Type: PlotTypeLine, Title: "Value", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
			PlotDirective{ID: "direction", Type: PlotTypeLine, Title: "Direction", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
		},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.time_based_stop",
		WasmClass: "TimeBasedStop",
		Name: "Time-Based Stop",
		ShortName: "TBS",
		Family: "Trailing Stops",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "A holding-period timer — it ignores price entirely and fires after a fixed number of bars, reporting the fraction of the window elapsed.",
		Inputs: []InputSchema{inputFloat("max_bars", "Max Bars", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Time Based Stop", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.volty_stop",
		WasmClass: "VoltyStop",
		Name: "Volty Stop",
		ShortName: "VS",
		Family: "Trailing Stops",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Kase's extreme-close-anchored ATR trail (no give-back on pullbacks).",
		Inputs: []InputSchema{inputPeriod("atr_period", "Atr Period", 14, 1, 500), inputFloat("multiplier", "Multiplier", 2.0, 0.1, 10.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Volty Stop", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.yoyo_exit",
		WasmClass: "YoyoExit",
		Name: "Yo-Yo Exit",
		ShortName: "YE",
		Family: "Trailing Stops",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Long-only ATR trail with passive re-entry trigger above the trail.",
		Inputs: []InputSchema{inputPeriod("atr_period", "Atr Period", 14, 1, 500), inputFloat("multiplier", "Multiplier", 2.0, 0.1, 10.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Yoyo Exit", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerVolume() {
	c.add(IndicatorDescriptor{
		ID: "wickra.adl",
		WasmClass: "ADL",
		Name: "Accumulation/Distribution Line",
		ShortName: "ADL",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "Accumulation/Distribution Line; cumulative range-weighted volume.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "A D L", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.anchored_vwap",
		WasmClass: "AnchoredVWAP",
		Name: "Anchored VWAP",
		ShortName: "AVWAP",
		Family: "Volume",
		Category: "Volume",
		Overlay: true,
		Description: "Cumulative VWAP from a user-set anchor bar (event-anchored fair price).",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Anchored VWAP", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.better_volume",
		WasmClass: "BetterVolume",
		Name: "Better Volume",
		ShortName: "BV",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "Better Volume bar classifier (emini-watch) — tags climax-up/down, high-volume churn, climax-churn and low-volume bars from volume and volume·range over the window.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeHistogram, Title: "Better Volume", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.chaikin_money_flow",
		WasmClass: "ChaikinMoneyFlow",
		Name: "Chaikin Money Flow (CMF)",
		ShortName: "CMF",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "Summed money-flow volume over summed volume across period bars.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeHistogram, Title: "Chaikin Money Flow", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.chaikin_oscillator",
		WasmClass: "ChaikinOscillator",
		Name: "Chaikin Oscillator",
		ShortName: "CO",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "EMA(ADL, fast) − EMA(ADL, slow); the MACD of the ADL.",
		Inputs: []InputSchema{inputPeriod("fast", "Fast Period", 12, 1, 200), inputPeriod("slow", "Slow Period", 26, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeHistogram, Title: "Chaikin Oscillator", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.demand_index",
		WasmClass: "DemandIndex",
		Name: "Demand Index",
		ShortName: "DI",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "Sibbet's Demand Index — volume-weighted buying-vs-selling pressure, EMA-smoothed (TradeStation form).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeHistogram, Title: "Demand Index", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ease_of_movement",
		WasmClass: "EaseOfMovement",
		Name: "Ease of Movement (EOM)",
		ShortName: "EOM",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "SMA of distance travelled per unit of volume.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("divisor", "Divisor", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeHistogram, Title: "Ease Of Movement", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.force_index",
		WasmClass: "ForceIndex",
		Name: "Force Index",
		ShortName: "FI",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "EMA((close − prev_close) · volume, period).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeHistogram, Title: "Force Index", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.intraday_intensity",
		WasmClass: "IntradayIntensity",
		Name: "Intraday Intensity",
		ShortName: "II",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "David Bostian's Intraday Intensity Index — a cumulative line weighting each bar's volume by where the close sits inside its range.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeHistogram, Title: "Intraday Intensity", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.market_facilitation_index",
		WasmClass: "MarketFacilitationIndex",
		Name: "Market Facilitation Index (MFI)",
		ShortName: "MFI",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "Williams' (high − low) / volume per-bar facilitation.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeHistogram, Title: "Market Facilitation Index", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.nvi",
		WasmClass: "NVI",
		Name: "Negative Volume Index (NVI)",
		ShortName: "NVI",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "Negative Volume Index — cumulative; updates only on volume contraction.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeHistogram, Title: "N V I", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.obv",
		WasmClass: "OBV",
		Name: "On-Balance Volume (OBV)",
		ShortName: "OBV",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "On-Balance Volume: cumulative signed volume.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "O B V", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.pvi",
		WasmClass: "PVI",
		Name: "Positive Volume Index (PVI)",
		ShortName: "PVI",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "Positive Volume Index — mirror of NVI; updates only on volume expansion.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeHistogram, Title: "P V I", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tsv",
		WasmClass: "TSV",
		Name: "Time Segmented Volume (TSV)",
		ShortName: "TSV",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "Time Segmented Volume — rolling sum of (close-change · volume).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeHistogram, Title: "T S V", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.trade_volume_index",
		WasmClass: "TradeVolumeIndex",
		Name: "Trade Volume Index",
		ShortName: "TVI",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "Cumulative volume signed by a minimum-tick rule — adds volume on up-ticks, subtracts on down-ticks, and holds direction through sub-tick churn.",
		Inputs: []InputSchema{inputFloat("min_tick", "Min Tick", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeHistogram, Title: "Trade Volume Index", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.twiggs_money_flow",
		WasmClass: "TwiggsMoneyFlow",
		Name: "Twiggs Money Flow",
		ShortName: "TMF",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "Colin Twiggs' refinement of Chaikin Money Flow — true-range boundaries and Wilder exponential smoothing make a faster, gap-aware [−1, +1] money-flow oscillator.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeHistogram, Title: "Twiggs Money Flow", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID:          "wickra.vwap",
		WasmClass:   "VWAP",
		Name:        "Volume Weighted Average Price (VWAP)",
		ShortName:   "VWAP",
		Family:      "Volume",
		Category:    "Volume",
		Overlay:     true,
		Description: "Volume Weighted Average Price with periodic session anchor resets and standard deviation bands.",
		Inputs: []InputSchema{
			inputSelect("anchor_period", "Anchor Period", "session", defaultAnchorPeriodOptions),
			inputSource("hlc3"),
			inputPeriod("offset", "Offset", 0, -500, 500),
			inputSelect("bands_calculation_mode", "Bands Calculation Mode", "stdev", defaultBandsModeOptions),
			inputFloat("bands_multiplier_1", "Bands Multiplier #1", 1.0, 0.1, 50.0, 0.1),
			inputFloat("bands_multiplier_2", "Bands Multiplier #2", 2.0, 0.1, 50.0, 0.1),
			inputFloat("bands_multiplier_3", "Bands Multiplier #3", 3.0, 0.1, 50.0, 0.1),
		},
		Plots: []PlotDirective{
			{ID: "plot", Type: PlotTypeLine, Title: "VWAP", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true},
			{ID: "upper_1", Type: PlotTypeLine, Title: "Upper Band #1", Color: "#089981", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true},
			{ID: "lower_1", Type: PlotTypeLine, Title: "Lower Band #1", Color: "#089981", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true},
			{ID: "upper_2", Type: PlotTypeLine, Title: "Upper Band #2", Color: "#089981", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
			{ID: "lower_2", Type: PlotTypeLine, Title: "Lower Band #2", Color: "#089981", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
			{ID: "upper_3", Type: PlotTypeLine, Title: "Upper Band #3", Color: "#089981", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
			{ID: "lower_3", Type: PlotTypeLine, Title: "Lower Band #3", Color: "#089981", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
		},
		Bands: []BandDirective{
			{ID: "vwap_band_1", Title: "Bands Fill #1", UpperPlotID: "upper_1", LowerPlotID: "lower_1", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true},
			{ID: "vwap_band_2", Title: "Bands Fill #2", UpperPlotID: "upper_2", LowerPlotID: "lower_2", FillColor: "rgba(41, 98, 255, 0.04)", Visible: false},
			{ID: "vwap_band_3", Title: "Bands Fill #3", UpperPlotID: "upper_3", LowerPlotID: "lower_3", FillColor: "rgba(41, 98, 255, 0.04)", Visible: false},
		},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.vzo",
		WasmClass: "VZO",
		Name: "Volume Zone Oscillator (VZO)",
		ShortName: "VZO",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "Volume Zone Oscillator — 100·EMA(signed vol)/EMA(|vol|).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeHistogram, Title: "V Z O", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.volume_oscillator",
		WasmClass: "VolumeOscillator",
		Name: "Volume Oscillator",
		ShortName: "VO",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "100·(SMA(vol,fast) − SMA(vol,slow))/SMA(vol,slow).",
		Inputs: []InputSchema{inputPeriod("fast", "Fast Period", 12, 1, 200), inputPeriod("slow", "Slow Period", 26, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeHistogram, Title: "Volume Oscillator", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.volume_price_trend",
		WasmClass: "VolumePriceTrend",
		Name: "Volume-Price Trend (VPT)",
		ShortName: "VPT",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "Cumulative volume · ROC; volume weighted by percentage move.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeHistogram, Title: "Volume Price Trend", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.volume_rsi",
		WasmClass: "VolumeRsi",
		Name: "Volume RSI",
		ShortName: "VR",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "Wilder's RSI applied to the volume stream instead of price — a [0, 100] oscillator of expanding versus contracting participation.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeHistogram, Title: "Volume Rsi", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.volume_weighted_macd",
		WasmClass: "VolumeWeightedMacd",
		Name: "Volume Weighted Macd",
		ShortName: "VWM",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "MACD built on volume-weighted moving averages — heavy-volume bars dominate the trend estimate, so crossovers reflect where real participation occurred.",
		Inputs: []InputSchema{inputPeriod("fast", "Fast Period", 12, 1, 200), inputPeriod("slow", "Slow Period", 26, 1, 500), inputPeriod("signal", "Signal Period", 9, 1, 100)},
		Plots: []PlotDirective{PlotDirective{ID: "macd", Type: PlotTypeLine, Title: "macd", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "signal", Type: PlotTypeLine, Title: "signal", Color: "#FF9800", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "histogram", Type: PlotTypeHistogram, Title: "histogram", Color: "#089981", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.volume_weighted_sr",
		WasmClass: "VolumeWeightedSr",
		Name: "Volume Weighted Sr",
		ShortName: "VWS",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "A support/resistance band whose edges are the volume-weighted average of recent lows and highs — levels gravitate to where trading actually happened.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "support", Type: PlotTypeLine, Title: "support", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "resistance", Type: PlotTypeLine, Title: "resistance", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.wad",
		WasmClass: "Wad",
		Name: "Williams Accumulation/Distribution",
		ShortName: "Wad",
		Family: "Volume",
		Category: "Volume",
		Overlay: false,
		Description: "Larry Williams' Accumulation/Distribution — a cumulative, volume-free line that adds true-low accumulation on up-closes and true-high distribution on down-closes.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeHistogram, Title: "Wad", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerPriceStatistics() {
	c.add(IndicatorDescriptor{
		ID: "wickra.avgprice",
		WasmClass: "AVGPRICE",
		Name: "Average Price (AVGPRICE)",
		ShortName: "AVGPRICE",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Average Price; (open + high + low + close) / 4.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "A V G P R I C E", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.autocorrelation",
		WasmClass: "Autocorrelation",
		Name: "Autocorrelation",
		ShortName: "AUTOCO",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Rolling lag-k Pearson autocorrelation.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("lag", "Lag", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Autocorrelation", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.beta",
		WasmClass: "Beta",
		Name: "Beta",
		ShortName: "Beta",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Rolling OLS sensitivity of asset to benchmark.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Beta", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.beta_neutral_spread",
		WasmClass: "BetaNeutralSpread",
		Name: "Beta Neutral Spread",
		ShortName: "BNS",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Rolling OLS residual of a on b — the beta-neutral spread.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Beta Neutral Spread", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.bipower_variation",
		WasmClass: "BipowerVariation",
		Name: "Realized Bipower Variation",
		ShortName: "BV",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Realized Bipower Variation — a jump-robust estimator of integrated variance built from products of adjacent absolute log returns instead of squares.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Bipower Variation", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.body_size_pct",
		WasmClass: "BodySizePct",
		Name: "Body Size Pct",
		ShortName: "BSP",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Absolute body as a fraction of the bar range.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Body Size Pct", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.close_vs_open",
		WasmClass: "CloseVsOpen",
		Name: "Close vs Open",
		ShortName: "CVO",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Signed body as a fraction of open, (close − open)/open.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Close Vs Open", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.coefficient_of_variation",
		WasmClass: "CoefficientOfVariation",
		Name: "Coefficient of Variation (CV)",
		ShortName: "COV",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "StdDev / Mean — dimensionless dispersion.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Coefficient Of Variation", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.cointegration",
		WasmClass: "Cointegration",
		Name: "Cointegration",
		ShortName: "COINTE",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Engle–Granger hedge ratio + ADF stationarity test on the spread.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("adf_lags", "Adf Lags", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "hedgeRatio", Type: PlotTypeLine, Title: "hedgeRatio", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "spread", Type: PlotTypeLine, Title: "spread", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "adfStat", Type: PlotTypeLine, Title: "adfStat", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.detrended_std_dev",
		WasmClass: "DetrendedStdDev",
		Name: "Detrended StdDev",
		ShortName: "DSD",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Standard deviation of OLS residuals — noise around the trend.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Detrended Std Dev", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.distance_ssd",
		WasmClass: "DistanceSsd",
		Name: "Distance Ssd",
		ShortName: "DS",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Gatev sum of squared deviations between two normalised series.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Distance Ssd", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.granger_causality",
		WasmClass: "GrangerCausality",
		Name: "Granger Causality",
		ShortName: "GC",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Rolling F-statistic: does b help predict a?",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("lag", "Lag", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Granger Causality", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.high_low_range",
		WasmClass: "HighLowRange",
		Name: "High-Low Range",
		ShortName: "HLR",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Bar range as a fraction of close (scale-free volatility).",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "High Low Range", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.hurst_exponent",
		WasmClass: "HurstExponent",
		Name: "Hurst Exponent",
		ShortName: "HE",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Rescaled-range (R/S) Hurst exponent estimate.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("chunks", "Chunks", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Hurst Exponent", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.jarquebera",
		WasmClass: "JARQUEBERA",
		Name: "Jarque Bera",
		ShortName: "JARQUEBERA",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "The Jarque-Bera statistic on a rolling window — a normality test that flags fat-tailed or skewed return regimes from skewness and excess kurtosis.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "J A R Q U E B E R A", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.jump_indicator",
		WasmClass: "JumpIndicator",
		Name: "Jump Indicator",
		ShortName: "JI",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Return-outlier flag vs trailing volatility (deviation from the mean).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("threshold", "Threshold", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Jump Indicator", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.kvo",
		WasmClass: "KVO",
		Name: "Klinger Volume Oscillator (KVO)",
		ShortName: "KVO",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Klinger Volume Oscillator — EMA(fast) − EMA(slow) of the H+L+C-trend volume force.",
		Inputs: []InputSchema{inputPeriod("fast", "Fast Period", 12, 1, 200), inputPeriod("slow", "Slow Period", 26, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "K V O", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.kendall_tau",
		WasmClass: "KendallTau",
		Name: "Kendall Tau",
		ShortName: "KT",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Kendall's tau-b — a robust rank correlation between two series measured by the balance of concordant and discordant pairs, with a tie correction.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Kendall Tau", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.kurtosis",
		WasmClass: "Kurtosis",
		Name: "Kurtosis",
		ShortName: "KURTOS",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Rolling excess kurtosis (fourth standardised moment − 3).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Kurtosis", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.linearreg_intercept",
		WasmClass: "LINEARREG_INTERCEPT",
		Name: "Lin Reg Intercept",
		ShortName: "LINEARREG_INTERCEPT",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Intercept a of the rolling OLS fit y = a + b·x (value at x = 0).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "L I N E A R R E G_ I N T E R C E P T", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.lead_lag_cross_correlation",
		WasmClass: "LeadLagCrossCorrelation",
		Name: "Lead Lag Cross Correlation",
		ShortName: "LLCC",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Offset that maximises |corr(a[t], b[t+k])| — which asset leads.",
		Inputs: []InputSchema{inputPeriod("window", "Window", 14, 1, 500), inputFloat("max_lag", "Max Lag", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "lag", Type: PlotTypeLine, Title: "lag", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "correlation", Type: PlotTypeLine, Title: "correlation", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.lin_reg_angle",
		WasmClass: "LinRegAngle",
		Name: "Lin Reg Angle",
		ShortName: "LRA",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "The rolling regression slope as a degree angle.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Lin Reg Angle", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.lin_reg_slope",
		WasmClass: "LinRegSlope",
		Name: "Lin Reg Slope",
		ShortName: "LRS",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Slope of the rolling least-squares line.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Lin Reg Slope", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.linear_regression",
		WasmClass: "LinearRegression",
		Name: "Linear Regression",
		ShortName: "LR",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Endpoint of the rolling least-squares line.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Linear Regression", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.log_return",
		WasmClass: "LogReturn",
		Name: "Log Return",
		ShortName: "LR",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Logarithmic return over a fixed lag, ln(p_t / p_{t−period}).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Log Return", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.m2_measure",
		WasmClass: "M2Measure",
		Name: "Modigliani–Modigliani measure",
		ShortName: "M2M",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "The Modigliani–Modigliani measure — the Sharpe ratio rescaled into the benchmark's return units.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("risk_free", "Risk Free", 1.0, 0.01, 1000.0, 0.1), inputFloat("benchmark_stddev", "Benchmark Stddev", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "M2 Measure", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.midpoint",
		WasmClass: "MIDPOINT",
		Name: "Mid Point",
		ShortName: "MIDPOINT",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "(highest + lowest) / 2 of a scalar series over period.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "M I D P O I N T", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.midprice",
		WasmClass: "MIDPRICE",
		Name: "Midpoint Price (MIDPRICE)",
		ShortName: "MIDPRICE",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "(highest high + lowest low) / 2 over period candles.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "M I D P R I C E", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.minus_di",
		WasmClass: "MINUS_DI",
		Name: "Minus Directional Indicator (-DI)",
		ShortName: "MINUS_DI",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Minus Directional Indicator; 100·smoothed(−DM)/smoothed(TR).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "M I N U S_ D I", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.minus_dm",
		WasmClass: "MINUS_DM",
		Name: "Minus Directional Movement (-DM)",
		ShortName: "MINUS_DM",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Wilder-smoothed minus directional movement (−DM).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "M I N U S_ D M", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.median_absolute_deviation",
		WasmClass: "MedianAbsoluteDeviation",
		Name: "Median Absolute Deviation (MAD)",
		ShortName: "MAD",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Robust dispersion: median(|x − median|).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Median Absolute Deviation", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.median_price",
		WasmClass: "MedianPrice",
		Name: "Median Price",
		ShortName: "MP",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "(high + low) / 2.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Median Price", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.morning_evening_star",
		WasmClass: "MorningEveningStar",
		Name: "Morning Star / Evening Star",
		ShortName: "MES",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Three-bar reversal pattern. A long candle, then a small",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Morning Evening Star", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.nrtr",
		WasmClass: "Nrtr",
		Name: "Nick Rypock Trailing Reverse",
		ShortName: "Nrtr",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Nick Rypock Trailing Reverse — a scale-free percentage trailing-reverse stop that follows the trend extreme and flips when price retraces by a fixed percentage.",
		Inputs: []InputSchema{inputFloat("pct", "Pct", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{
			PlotDirective{ID: "up", Type: PlotTypeLine, Title: "Up Trend", Color: "#089981", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true},
			PlotDirective{ID: "down", Type: PlotTypeLine, Title: "Down Trend", Color: "#F23645", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true},
			PlotDirective{ID: "value", Type: PlotTypeLine, Title: "Value", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
			PlotDirective{ID: "direction", Type: PlotTypeLine, Title: "Direction", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: false},
		},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.oiprice_divergence",
		WasmClass: "OIPriceDivergence",
		Name: "OI Price Divergence",
		ShortName: "OIPD",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Relative OI change minus relative price change over window.",
		Inputs: []InputSchema{inputPeriod("window", "Window", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "O I Price Divergence", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.oiweighted",
		WasmClass: "OIWeighted",
		Name: "OI Weighted",
		ShortName: "OIW",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Cumulative OI-weighted mark price.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "O I Weighted", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ou_half_life",
		WasmClass: "OuHalfLife",
		Name: "Ou Half Life",
		ShortName: "OHL",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Ornstein–Uhlenbeck half-life of mean reversion of the spread a − b.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Ou Half Life", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.plus_di",
		WasmClass: "PLUS_DI",
		Name: "Plus Directional Indicator (+DI)",
		ShortName: "PLUS_DI",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Plus Directional Indicator; 100·smoothed(+DM)/smoothed(TR).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "P L U S_ D I", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.plus_dm",
		WasmClass: "PLUS_DM",
		Name: "Plus Directional Movement (+DM)",
		ShortName: "PLUS_DM",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Wilder-smoothed plus directional movement (+DM).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "P L U S_ D M", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.polarized_fractal_efficiency",
		WasmClass: "POLARIZED_FRACTAL_EFFICIENCY",
		Name: "Polarized Fractal Efficiency",
		ShortName: "POLARIZED_FRACTAL_EFFICIENCY",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Direction-signed trend efficiency (straight vs. jagged path).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("smoothing", "Smoothing", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "P O L A R I Z E D_ F R A C T A L_ E F F I C I E N C Y", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.pair_spread_zscore",
		WasmClass: "PairSpreadZScore",
		Name: "Pair Spread Z Score",
		ShortName: "PSZS",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Z-score of the log-spread ln(a) − β·ln(b) of a pair.",
		Inputs: []InputSchema{inputPeriod("beta_period", "Beta Period", 14, 1, 500), inputPeriod("z_period", "Z Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Pair Spread Z Score", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.pairwise_beta",
		WasmClass: "PairwiseBeta",
		Name: "Pairwise Beta",
		ShortName: "PB",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Rolling OLS slope of one asset's log-returns on another's.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Pairwise Beta", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.pearson_correlation",
		WasmClass: "PearsonCorrelation",
		Name: "Pearson Correlation",
		ShortName: "PC",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Rolling Pearson correlation of two synchronised series.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Pearson Correlation", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.percent_above_ma",
		WasmClass: "PercentAboveMa",
		Name: "Percent Above Moving Average",
		ShortName: "PAM",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Percentage of the universe trading above its reference moving average.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Percent Above Ma", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.piercing_dark_cloud",
		WasmClass: "PiercingDarkCloud",
		Name: "Piercing Line / Dark Cloud Cover",
		ShortName: "PDC",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "a long red bar followed by a green bar that opens below the red bar",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Piercing Dark Cloud", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.pin",
		WasmClass: "Pin",
		Name: "Pin",
		ShortName: "Pin",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "The Probability of Informed Trading (EKOP) — estimated from the buy/sell imbalance over a rolling window of trades.",
		Inputs: []InputSchema{inputPeriod("window", "Window", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Pin", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.reflex",
		WasmClass: "REFLEX",
		Name: "Reflex",
		ShortName: "REFLEX",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Ehlers' near-zero-lag cycle oscillator — averages how far the SuperSmoothed price deviates from the straight line across the lookback, then self-normalises.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "R E F L E X", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rollingminmax",
		WasmClass: "ROLLINGMINMAX",
		Name: "streaming MinMaxScaler",
		ShortName: "ROLLINGMINMAX",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "The streaming MinMaxScaler — maps the current value onto [0, 1] against the min and max of the trailing window.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "R O L L I N G M I N M A X", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rsquared",
		WasmClass: "RSquared",
		Name: "R² (Coefficient of Determination)",
		ShortName: "RS",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "R² of the rolling OLS fit; fraction of variance explained.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "R Squared", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rwi",
		WasmClass: "RWI",
		Name: "Random Walk Index (RWI)",
		ShortName: "RWI",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Poulos' Random Walk Index: actual displacement vs ATR_i · sqrt(i).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "high", Type: PlotTypeLine, Title: "high", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "low", Type: PlotTypeLine, Title: "low", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.regime_label",
		WasmClass: "RegimeLabel",
		Name: "Regime Label",
		ShortName: "RL",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Volatility-quantile regime: −1 calm / 0 normal / +1 stressed.",
		Inputs: []InputSchema{inputPeriod("vol_period", "Vol Period", 14, 1, 500), inputPeriod("lookback", "Lookback", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Regime Label", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.relative_strength_ab",
		WasmClass: "RelativeStrengthAB",
		Name: "Relative Strength AB",
		ShortName: "RSAB",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Ratio line a / b with its moving average and RSI.",
		Inputs: []InputSchema{inputPeriod("ma_period", "Ma Period", 14, 1, 500), inputPeriod("rsi_period", "Rsi Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "ratio", Type: PlotTypeLine, Title: "ratio", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "ratioMa", Type: PlotTypeLine, Title: "ratioMa", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "ratioRsi", Type: PlotTypeLine, Title: "ratioRsi", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.resampler",
		WasmClass: "Resampler",
		Name: "Bar Resampler",
		ShortName: "RESAMP",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Resamples tick or minute bars into higher timeframe intervals.",
		Inputs: []InputSchema{inputFloat("timeframe", "Timeframe", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "open", Type: PlotTypeLine, Title: "open", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rolling_correlation",
		WasmClass: "RollingCorrelation",
		Name: "Rolling Correlation",
		ShortName: "RC",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Rolling Pearson correlation of the two series' returns.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Rolling Correlation", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rolling_covariance",
		WasmClass: "RollingCovariance",
		Name: "Rolling Covariance",
		ShortName: "RC",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Rolling covariance of the two series' returns.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Rolling Covariance", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rolling_iqr",
		WasmClass: "RollingIqr",
		Name: "Rolling Iqr",
		ShortName: "RI",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Interquartile range Q3 − Q1; robust dispersion.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Rolling Iqr", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rolling_percentile_rank",
		WasmClass: "RollingPercentileRank",
		Name: "Rolling Percentile Rank",
		ShortName: "RPR",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Percentile rank of the latest value within its window.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Rolling Percentile Rank", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rolling_quantile",
		WasmClass: "RollingQuantile",
		Name: "Rolling Quantile",
		ShortName: "RQ",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Interpolated q-th quantile over period values (type-7).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("quantile", "Quantile", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Rolling Quantile", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rolling_vwap",
		WasmClass: "RollingVWAP",
		Name: "Rolling VWAP",
		ShortName: "RVWAP",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: true,
		Description: "VWAP over a finite rolling window (vs the cumulative Vwap).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Rolling VWAP", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.sampleent",
		WasmClass: "SAMPLEENT",
		Name: "Richman & Moorman",
		ShortName: "SAMPLEENT",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Richman & Moorman's Sample Entropy (SampEn) — how regular a window is: the negative log probability that points similar for m steps stay similar at the next step.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("m", "M", 1.0, 0.01, 1000.0, 0.1), inputFloat("r_factor", "R Factor", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "S A M P L E E N T", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.shannonent",
		WasmClass: "SHANNONENT",
		Name: "Shannon Entropy",
		ShortName: "SHANNONENT",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "The Shannon information entropy (in bits) of a rolling window's binned distribution — a regime gauge for how spread-out and unpredictable recent prices are.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("bins", "Bins", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "S H A N N O N E N T", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.session_vwap",
		WasmClass: "SessionVwap",
		Name: "Session VWAP",
		ShortName: "SV",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Session-anchored volume-weighted average price.",
		Inputs: []InputSchema{inputFloat("utc_offset_minutes", "Utc Offset Minutes", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Session Vwap", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.skewness",
		WasmClass: "Skewness",
		Name: "Skewness",
		ShortName: "SKEWNE",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Rolling Pearson skewness (third standardised moment).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Skewness", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.spearman_correlation",
		WasmClass: "SpearmanCorrelation",
		Name: "Spearman Rank Correlation",
		ShortName: "SC",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Rolling rank correlation; monotone-relationship robust.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Spearman Correlation", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.spread_ar1_coefficient",
		WasmClass: "SpreadAr1Coefficient",
		Name: "Spread Ar1 Coefficient",
		ShortName: "SA1C",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "AR(1) coefficient ρ of the spread a − b (cointegration strength).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Spread Ar1 Coefficient", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.spread_hurst",
		WasmClass: "SpreadHurst",
		Name: "Spread Hurst",
		ShortName: "SH",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Hurst exponent of the spread a − b (pairs regime detection).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Spread Hurst", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.standard_error",
		WasmClass: "StandardError",
		Name: "Standard Error",
		ShortName: "SE",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Standard error of the rolling OLS line; trend-detrended volatility.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Standard Error", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tii",
		WasmClass: "TII",
		Name: "Trend Intensity Index (TII)",
		ShortName: "TII",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Share of recent SMA-deviations that are positive, scaled to [0, 100].",
		Inputs: []InputSchema{inputPeriod("sma_period", "Sma Period", 14, 1, 500), inputPeriod("dev_period", "Dev Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T I I", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.trendflex",
		WasmClass: "TRENDFLEX",
		Name: "Trendflex",
		ShortName: "TRENDFLEX",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Ehlers' trend-sensitive companion to Reflex — averages how far the SuperSmoothed price sits above/below its recent values, then self-normalises.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T R E N D F L E X", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.trend_strength_index",
		WasmClass: "TREND_STRENGTH_INDEX",
		Name: "Trend Strength Index",
		ShortName: "TREND_STRENGTH_INDEX",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Signed r² of a linear regression of price vs. time.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T R E N D_ S T R E N G T H_ I N D E X", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tsf",
		WasmClass: "TSF",
		Name: "Time Series Forecast (TSF)",
		ShortName: "TSF",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Time Series Forecast; OLS line projected one bar ahead (a + b·period).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T S F", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ttm_trend",
		WasmClass: "TTM_TREND",
		Name: "TTM Trend",
		ShortName: "TTM_TREND",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "±1 by whether close is above the SMA of median prices.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T T M_ T R E N D", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.three_inside",
		WasmClass: "ThreeInside",
		Name: "Three Inside Up / Down",
		ShortName: "TI",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Three-bar reversal pattern. A confirmed Harami: the first two bars form a Harami (small inside body) and the third bar confirms direction by closing beyond the first bar",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Three Inside", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.three_outside",
		WasmClass: "ThreeOutside",
		Name: "Three Outside Up / Down",
		ShortName: "TO",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Three-bar reversal pattern. A confirmed Engulfing: the first two bars form an Engulfing pattern and the third bar confirms direction by closing beyond the second bar",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Three Outside", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.trend_label",
		WasmClass: "TrendLabel",
		Name: "Trend Label",
		ShortName: "TL",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Discrete trend state from the sign of the rolling OLS slope.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Trend Label", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.typical_price",
		WasmClass: "TypicalPrice",
		Name: "Typical Price",
		ShortName: "TP",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "(high + low + close) / 3.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Typical Price", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.universalosc",
		WasmClass: "UNIVERSALOSC",
		Name: "Universal Oscillator",
		ShortName: "UNIVERSALOSC",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Ehlers' Universal Oscillator — whitens the price, SuperSmooths it, then AGC-normalises to a clean [−1, +1] cycle reading on any instrument.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "U N I V E R S A L O S C", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.value_at_risk",
		WasmClass: "ValueAtRisk",
		Name: "Value at Risk (VaR)",
		ShortName: "VAR",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Historical lower-tail quantile, sign-flipped.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("confidence", "Confidence", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Value At Risk", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.variance",
		WasmClass: "Variance",
		Name: "Variance",
		ShortName: "VARIAN",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Rolling population variance (second central moment).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Variance", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.weighted_close",
		WasmClass: "WeightedClose",
		Name: "Weighted Close",
		ShortName: "WC",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "(high + low + 2·close) / 4.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Weighted Close", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.zscore",
		WasmClass: "ZScore",
		Name: "Z-Score",
		ShortName: "ZScore",
		Family: "Price Statistics",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "(price − SMA(n)) / population_stddev(n).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Z Score", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerEhlersDSP() {
	c.add(IndicatorDescriptor{
		ID: "wickra.adaptivecci",
		WasmClass: "ADAPTIVECCI",
		Name: "Adaptive Cci",
		ShortName: "ADAPTIVECCI",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Lambert's CCI with an efficiency-ratio-adaptive centre line — it leads in trends and stays calm in chop.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "A D A P T I V E CCI", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.adaptiversi",
		WasmClass: "ADAPTIVERSI",
		Name: "Adaptive Rsi",
		ShortName: "ADAPTIVERSI",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Wilder's RSI whose up/down averaging adapts to trendiness via Kaufman's efficiency ratio — fast in clean moves, smooth through chop.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "A D A P T I V E RSI", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.autocorrpgram",
		WasmClass: "AUTOCORRPGRAM",
		Name: "Autocorrelation Periodogram",
		ShortName: "AUTOCORRPGRAM",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Ehlers' Autocorrelation Periodogram — estimates the market's dominant cycle period by correlating a roofing-filtered price with lagged copies of itself.",
		Inputs: []InputSchema{inputPeriod("min_period", "Min Period", 14, 1, 500), inputPeriod("max_period", "Max Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "A U T O C O R R P G R A M", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.adaptive_cycle",
		WasmClass: "AdaptiveCycle",
		Name: "Adaptive Cycle",
		ShortName: "AC",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Half-period wrapper over HilbertDominantCycle for adaptive oscillators.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Adaptive Cycle", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.bandpass",
		WasmClass: "BANDPASS",
		Name: "Bandpass Filter",
		ShortName: "BANDPASS",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Ehlers' two-pole bandpass resonator — isolates the cyclic component around a target period, rejecting both trend and high-frequency noise.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("bandwidth", "Bandwidth", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "B A N D P A S S", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.cti",
		WasmClass: "CTI",
		Name: "Correlation Trend Indicator",
		ShortName: "CTI",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Ehlers' CTI — the Pearson correlation of price against a straight time ramp; +1 is a clean uptrend, −1 a clean downtrend, 0 no linear trend.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "C T I", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.center_of_gravity",
		WasmClass: "CenterOfGravity",
		Name: "Center of Gravity (CG) Oscillator",
		ShortName: "COG",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Linear-weighted price barycenter, near-zero-lag.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Center Of Gravity", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.cybernetic_cycle",
		WasmClass: "CyberneticCycle",
		Name: "Cybernetic Cycle Component",
		ShortName: "CC",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "4-tap pre-smoother + 2nd-order high-pass cycle extractor.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Cybernetic Cycle", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.decycler",
		WasmClass: "Decycler",
		Name: "Decycler",
		ShortName: "DECYCL",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "price − HighPass(price) — low-lag trend extractor.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Decycler", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.decycler_oscillator",
		WasmClass: "DecyclerOscillator",
		Name: "Decycler Oscillator",
		ShortName: "DO",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Difference of fast and slow Decyclers — MACD-shape.",
		Inputs: []InputSchema{inputPeriod("fast", "Fast Period", 12, 1, 200), inputPeriod("slow", "Slow Period", 26, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Decycler Oscillator", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.evenbettersine",
		WasmClass: "EVENBETTERSINE",
		Name: "Even Better Sinewave",
		ShortName: "EVENBETTERSINE",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Ehlers' EBSW — a self-normalising cycle oscillator that swings cleanly in [−1, +1] regardless of price amplitude.",
		Inputs: []InputSchema{inputPeriod("hp_period", "Hp Period", 14, 1, 500), inputFloat("ssf_length", "Ssf Length", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "E V E N B E T T E R S I N E", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ehlers_stochastic",
		WasmClass: "EhlersStochastic",
		Name: "Ehlers Stochastic",
		ShortName: "ES",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Stochastic on Roofing-Filter output ([-1, +1] scale).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Ehlers Stochastic", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.empirical_mode_decomposition",
		WasmClass: "EmpiricalModeDecomposition",
		Name: "Empirical Mode Decomposition (EMD)",
		ShortName: "EMD",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Ehlers: trend = SMA(bandpass, 2·period); peak/valley envelopes fraction · avg(peaks/valleys, 50); regime classifier.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("fraction", "Fraction", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Empirical Mode Decomposition", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.fama",
		WasmClass: "FAMA",
		Name: "FAMA (Following Adaptive Moving Average)",
		ShortName: "FAMA",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Scalar wrapper exposing only MAMA's slow follower line.",
		Inputs: []InputSchema{inputFloat("fast_limit", "Fast Limit", 1.0, 0.01, 1000.0, 0.1), inputFloat("slow_limit", "Slow Limit", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "F A MA", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.fisher_transform",
		WasmClass: "FisherTransform",
		Name: "Fisher Transform",
		ShortName: "FT",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Ehlers: recursively smoothed min/max position x, then 0.5·ln((1+x)/(1-x)) + 0.5·prev.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Fisher Transform", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.highpass",
		WasmClass: "HIGHPASS",
		Name: "Highpass Filter",
		ShortName: "HIGHPASS",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Ehlers' two-pole highpass filter — strips the low-frequency trend and leaves the cyclic content; the complement of the Decycler.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "H I G H P A S S", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ht_dcphase",
		WasmClass: "HT_DCPHASE",
		Name: "Hilbert Transform Dominant Cycle Phase",
		ShortName: "HT_DCPHASE",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Hilbert-transform dominant-cycle phase, in degrees.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "H T_ D C P H A S E", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ht_phasor",
		WasmClass: "HT_PHASOR",
		Name: "Hilbert Transform Phasor Components",
		ShortName: "HT_PHASOR",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Hilbert-transform in-phase / quadrature components of the analytic signal.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "inphase", Type: PlotTypeLine, Title: "inphase", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "quadrature", Type: PlotTypeLine, Title: "quadrature", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ht_trendmode",
		WasmClass: "HT_TRENDMODE",
		Name: "Hilbert Transform Trend vs Cycle Mode",
		ShortName: "HT_TRENDMODE",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Ehlers' trend (1) vs cycle (0) classification.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "H T_ T R E N D M O D E", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.hilbert_dominant_cycle",
		WasmClass: "HilbertDominantCycle",
		Name: "Hilbert Dominant Cycle",
		ShortName: "HDC",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Truncated-Hilbert phase-derived dominant cycle period.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Hilbert Dominant Cycle", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.instantaneous_trendline",
		WasmClass: "InstantaneousTrendline",
		Name: "Instantaneous Trendline",
		ShortName: "IT",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Near-zero-lag tuned recurrence — fast trend line.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Instantaneous Trendline", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.inverse_fisher_transform",
		WasmClass: "InverseFisherTransform",
		Name: "Inverse Fisher Transform",
		ShortName: "IFT",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "tanh(scale · input); bounded squash.",
		Inputs: []InputSchema{inputFloat("scale", "Scale", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Inverse Fisher Transform", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.mama",
		WasmClass: "MAMA",
		Name: "MESA Adaptive Moving Average (MAMA)",
		ShortName: "MAMA",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "MESA Adaptive MA — adaptive alpha from Hilbert phase.",
		Inputs: []InputSchema{inputFloat("fast_limit", "Fast Limit", 1.0, 0.01, 1000.0, 0.1), inputFloat("slow_limit", "Slow Limit", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "mama", Type: PlotTypeLine, Title: "mama", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "fama", Type: PlotTypeLine, Title: "fama", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.roofing_filter",
		WasmClass: "RoofingFilter",
		Name: "Roofing Filter",
		ShortName: "RF",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "High-pass + SuperSmoother = cycle-band bandpass.",
		Inputs: []InputSchema{inputPeriod("lp_period", "Lp Period", 14, 1, 500), inputPeriod("hp_period", "Hp Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Roofing Filter", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.sine_wave",
		WasmClass: "SineWave",
		Name: "Sine Wave Indicator",
		ShortName: "SW",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "sin(phase) from Hilbert phase; pair with lead() for cross.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Sine Wave", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.super_smoother",
		WasmClass: "SuperSmoother",
		Name: "SuperSmoother Filter",
		ShortName: "SS",
		Family: "Ehlers / Cycle (DSP)",
		Category: "DSP & Cycles",
		Overlay: false,
		Description: "Ehlers' 2-pole Butterworth lowpass filter.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Super Smoother", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerPivotsSR() {
	c.add(IndicatorDescriptor{
		ID: "wickra.andrews_pitchfork",
		WasmClass: "AndrewsPitchfork",
		Name: "Andrews Pitchfork",
		ShortName: "AP",
		Family: "Pivots & S/R",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Alan Andrews' median-line tool — a central line through three auto-detected swing pivots, flanked by two parallels, projected to the current bar.",
		Inputs: []InputSchema{inputFloat("strength", "Strength", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "median", Type: PlotTypeLine, Title: "median", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "upper", Type: PlotTypeLine, Title: "upper", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lower", Type: PlotTypeLine, Title: "lower", Color: "#00897B", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
		Bands: []BandDirective{BandDirective{ID: "andrewspitchfork_fill", UpperPlotID: "upper", LowerPlotID: "lower", FillColor: "rgba(41, 98, 255, 0.08)", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.camarilla",
		WasmClass: "Camarilla",
		Name: "Camarilla Pivots",
		ShortName: "CAMARI",
		Family: "Pivots & S/R",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Stott's close-anchored 4-tier ±(1.1 · range / {12,6,4,2}).",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "pp", Type: PlotTypeLine, Title: "pp", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "r1", Type: PlotTypeLine, Title: "r1", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "r2", Type: PlotTypeLine, Title: "r2", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "r3", Type: PlotTypeLine, Title: "r3", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "r4", Type: PlotTypeLine, Title: "r4", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "s1", Type: PlotTypeLine, Title: "s1", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "s2", Type: PlotTypeLine, Title: "s2", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "s3", Type: PlotTypeLine, Title: "s3", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "s4", Type: PlotTypeLine, Title: "s4", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.central_pivot_range",
		WasmClass: "CentralPivotRange",
		Name: "Central Pivot Range",
		ShortName: "CPR",
		Family: "Pivots & S/R",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "The pivot point plus its two central lines — the width of the range forecasts a trending vs.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "pivot", Type: PlotTypeLine, Title: "pivot", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "tc", Type: PlotTypeLine, Title: "tc", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "bc", Type: PlotTypeLine, Title: "bc", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.classic_pivots",
		WasmClass: "ClassicPivots",
		Name: "Classic Pivots (Floor-Trader Pivots)",
		ShortName: "CP",
		Family: "Pivots & S/R",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Floor-trader pivots: PP, R1-R3, S1-S3 from (H+L+C)/3.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "pp", Type: PlotTypeLine, Title: "pp", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "r1", Type: PlotTypeLine, Title: "r1", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "r2", Type: PlotTypeLine, Title: "r2", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "r3", Type: PlotTypeLine, Title: "r3", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "s1", Type: PlotTypeLine, Title: "s1", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "s2", Type: PlotTypeLine, Title: "s2", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "s3", Type: PlotTypeLine, Title: "s3", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.murrey_math_lines",
		WasmClass: "MurreyMathLines",
		Name: "T. H. Murrey",
		ShortName: "MML",
		Family: "Pivots & S/R",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "T. H. Murrey",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "mm8_8", Type: PlotTypeLine, Title: "mm8_8", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "mm7_8", Type: PlotTypeLine, Title: "mm7_8", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "mm6_8", Type: PlotTypeLine, Title: "mm6_8", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "mm5_8", Type: PlotTypeLine, Title: "mm5_8", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "mm4_8", Type: PlotTypeLine, Title: "mm4_8", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "mm3_8", Type: PlotTypeLine, Title: "mm3_8", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "mm2_8", Type: PlotTypeLine, Title: "mm2_8", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "mm1_8", Type: PlotTypeLine, Title: "mm1_8", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "mm0_8", Type: PlotTypeLine, Title: "mm0_8", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.pivot_reversal",
		WasmClass: "PivotReversal",
		Name: "Pivot Reversal",
		ShortName: "PR",
		Family: "Pivots & S/R",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "A breakout signal off the most recent confirmed swing pivots — +1 when price closes back above a swing high, −1 when it closes below a swing low.",
		Inputs: []InputSchema{inputFloat("left", "Left", 1.0, 0.01, 1000.0, 0.1), inputFloat("right", "Right", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Pivot Reversal", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.williams_fractals",
		WasmClass: "WilliamsFractals",
		Name: "Williams Fractals",
		ShortName: "WF",
		Family: "Pivots & S/R",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Bill Williams' 5-bar swing-high / swing-low detector.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "up", Type: PlotTypeLine, Title: "up", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "down", Type: PlotTypeLine, Title: "down", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.woodie_pivots",
		WasmClass: "WoodiePivots",
		Name: "Woodie Pivots",
		ShortName: "WP",
		Family: "Pivots & S/R",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Close-weighted pivot (H+L+2C)/4 with 2-tier R/S.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "pp", Type: PlotTypeLine, Title: "pp", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "r1", Type: PlotTypeLine, Title: "r1", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "r2", Type: PlotTypeLine, Title: "r2", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "s1", Type: PlotTypeLine, Title: "s1", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "s2", Type: PlotTypeLine, Title: "s2", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.zig_zag",
		WasmClass: "ZigZag",
		Name: "Zig Zag",
		ShortName: "ZigZag",
		Family: "Pivots & S/R",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Non-repainting percentage-threshold swing detector.",
		Inputs: []InputSchema{inputFloat("threshold", "Threshold", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "swing", Type: PlotTypeLine, Title: "swing", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "direction", Type: PlotTypeLine, Title: "direction", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerDeMark() {
	c.add(IndicatorDescriptor{
		ID: "wickra.demark_pivots",
		WasmClass: "DemarkPivots",
		Name: "DeMark Pivots",
		ShortName: "DP",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "Open-conditional 1-tier pivot (different formula per bar direction).",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "pp", Type: PlotTypeLine, Title: "pp", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "r1", Type: PlotTypeLine, Title: "r1", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "s1", Type: PlotTypeLine, Title: "s1", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tdcamouflage",
		WasmClass: "TDCamouflage",
		Name: "TD Camouflage",
		ShortName: "TDC",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "Tom DeMark's TD Camouflage — a one-bar reversal that looks weak (or strong) on the close but reveals hidden accumulation (or distribution) intrabar.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T D Camouflage", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tdclop",
		WasmClass: "TDClop",
		Name: "TD Clop",
		ShortName: "TDClop",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "Tom DeMark's TD Clop — a two-bar open/close reversal: the bar opens beyond the whole prior body and closes back beyond it.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T D Clop", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tdclopwin",
		WasmClass: "TDClopwin",
		Name: "TD Clopwin",
		ShortName: "TDC",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "Tom DeMark's TD Clopwin — the inside-body cousin of TD Clop: the bar's open and close both sit inside the prior body, a compression bar whose direction hints at the next move.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T D Clopwin", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tdcombo",
		WasmClass: "TDCombo",
		Name: "TD Combo",
		ShortName: "TDC",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "Stricter, faster countdown variant (3 strictness conditions).",
		Inputs: []InputSchema{inputFloat("setup_lookback", "Setup Lookback", 1.0, 0.01, 1000.0, 0.1), inputFloat("setup_target", "Setup Target", 1.0, 0.01, 1000.0, 0.1), inputFloat("countdown_lookback", "Countdown Lookback", 1.0, 0.01, 1000.0, 0.1), inputFloat("countdown_target", "Countdown Target", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T D Combo", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tdcountdown",
		WasmClass: "TDCountdown",
		Name: "TD Countdown",
		ShortName: "TDC",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "Standalone Countdown 13 (auto-detects setup internally).",
		Inputs: []InputSchema{inputFloat("setup_lookback", "Setup Lookback", 1.0, 0.01, 1000.0, 0.1), inputFloat("setup_target", "Setup Target", 1.0, 0.01, 1000.0, 0.1), inputFloat("countdown_lookback", "Countdown Lookback", 1.0, 0.01, 1000.0, 0.1), inputFloat("countdown_target", "Countdown Target", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T D Countdown", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tddwave",
		WasmClass: "TDDWave",
		Name: "TD D-Wave",
		ShortName: "TDDW",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "Tom DeMark's TD D-Wave — an objective Elliott-style wave counter that labels the swing sequence 1–5 (impulse) then A–C (correction).",
		Inputs: []InputSchema{inputFloat("strength", "Strength", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T D D Wave", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tdde_marker",
		WasmClass: "TDDeMarker",
		Name: "TD DeMarker",
		ShortName: "TDDM",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "High/low-extension based 0-1 momentum oscillator.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T D De Marker", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tddifferential",
		WasmClass: "TDDifferential",
		Name: "TD Differential",
		ShortName: "TDD",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "3-bar buying/selling-pressure reversal pattern (DeMark).",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T D Differential", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tdlines",
		WasmClass: "TDLines",
		Name: "TD Lines (TDST)",
		ShortName: "TDL",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "TDST support/resistance — extremes of completed setups.",
		Inputs: []InputSchema{inputPeriod("lookback", "Lookback", 14, 1, 500), inputFloat("target", "Target", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "resistance", Type: PlotTypeLine, Title: "resistance", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "support", Type: PlotTypeLine, Title: "support", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tdmoving_average",
		WasmClass: "TDMovingAverage",
		Name: "TD Moving Average",
		ShortName: "TDMA",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "Tom DeMark's TD Moving Averages — a fast (ST1) / slow (ST2) ribbon on the median price; their relationship defines the trend.",
		Inputs: []InputSchema{inputPeriod("period_st1", "Period St1", 14, 1, 500), inputPeriod("period_st2", "Period St2", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "st1", Type: PlotTypeLine, Title: "st1", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "st2", Type: PlotTypeLine, Title: "st2", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tdopen",
		WasmClass: "TDOpen",
		Name: "TD Open",
		ShortName: "TDOpen",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "Gap-and-fade reversal signal (open outside prior range).",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T D Open", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tdpressure",
		WasmClass: "TDPressure",
		Name: "TD Pressure",
		ShortName: "TDP",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "Volume-weighted DeMark pressure oscillator.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T D Pressure", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tdpropulsion",
		WasmClass: "TDPropulsion",
		Name: "TD Propulsion",
		ShortName: "TDP",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "Tom DeMark's TD Propulsion — a two-bar continuation thrust: open on the trend side of the prior close, then close beyond the prior bar's extreme.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T D Propulsion", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tdrei",
		WasmClass: "TDREI",
		Name: "TD REI (Range Expansion Index)",
		ShortName: "TDREI",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "Range Expansion Index — conditionally-weighted short oscillator.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T D R E I", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tdrange_projection",
		WasmClass: "TDRangeProjection",
		Name: "TD Range Projection",
		ShortName: "TDRP",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "Next-bar high/low projection from current bar OHLC.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "high", Type: PlotTypeLine, Title: "high", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "low", Type: PlotTypeLine, Title: "low", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tdrisk_level",
		WasmClass: "TDRiskLevel",
		Name: "TD Risk Level",
		ShortName: "TDRL",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "Protective-stop level from setup extreme + true range.",
		Inputs: []InputSchema{inputPeriod("lookback", "Lookback", 14, 1, 500), inputFloat("target", "Target", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "buyRisk", Type: PlotTypeLine, Title: "buyRisk", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "sellRisk", Type: PlotTypeLine, Title: "sellRisk", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tdsequential",
		WasmClass: "TDSequential",
		Name: "TD Sequential",
		ShortName: "TDS",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "Setup + Countdown 13 — canonical DeMark exhaustion.",
		Inputs: []InputSchema{inputFloat("setup_lookback", "Setup Lookback", 1.0, 0.01, 1000.0, 0.1), inputFloat("setup_target", "Setup Target", 1.0, 0.01, 1000.0, 0.1), inputFloat("countdown_lookback", "Countdown Lookback", 1.0, 0.01, 1000.0, 0.1), inputFloat("countdown_target", "Countdown Target", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "setup", Type: PlotTypeLine, Title: "setup", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "countdown", Type: PlotTypeLine, Title: "countdown", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "direction", Type: PlotTypeLine, Title: "direction", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tdsetup",
		WasmClass: "TDSetup",
		Name: "TD Setup",
		ShortName: "TDS",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "9-bar momentum-exhaustion setup count (signed).",
		Inputs: []InputSchema{inputPeriod("lookback", "Lookback", 14, 1, 500), inputFloat("target", "Target", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T D Setup", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tdtrap",
		WasmClass: "TDTrap",
		Name: "TD Trap",
		ShortName: "TDTrap",
		Family: "DeMark",
		Category: "Oscillators",
		Overlay: false,
		Description: "Tom DeMark's TD Trap — an inside (\"trap\") bar followed by a close beyond its range fires a directional breakout signal.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "T D Trap", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerIchimokuCharts() {
	c.add(IndicatorDescriptor{
		ID: "wickra.candle_volume",
		WasmClass: "CandleVolume",
		Name: "candlestick analogue of Equivolume",
		ShortName: "CV",
		Family: "Ichimoku & Charts",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "The candlestick analogue of Equivolume — each bar's signed body paired with a width proportional to its volume relative to the recent average.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "body", Type: PlotTypeLine, Title: "body", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "width", Type: PlotTypeLine, Title: "width", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.equivolume",
		WasmClass: "Equivolume",
		Name: "Equivolume",
		ShortName: "EQUIVO",
		Family: "Ichimoku & Charts",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Richard Arms' Equivolume chart as numbers — each bar is a box whose height is its price range and whose width is its volume relative to the recent average.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "height", Type: PlotTypeLine, Title: "height", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "width", Type: PlotTypeLine, Title: "width", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.heikin_ashi",
		WasmClass: "HeikinAshi",
		Name: "Heikin-Ashi",
		ShortName: "HA",
		Family: "Ichimoku & Charts",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "\"Average bar\" candle-smoothing transform.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "open", Type: PlotTypeLine, Title: "open", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "high", Type: PlotTypeLine, Title: "high", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "low", Type: PlotTypeLine, Title: "low", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "close", Type: PlotTypeLine, Title: "close", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.heikin_ashi_oscillator",
		WasmClass: "HeikinAshiOscillator",
		Name: "Heikin Ashi Oscillator",
		ShortName: "HAO",
		Family: "Ichimoku & Charts",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "The Heikin-Ashi candle body (ha_close − ha_open), optionally EMA-smoothed, as a zero-line oscillator — the HA colour/strength turned into a number.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Heikin Ashi Oscillator", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ichimoku",
		WasmClass: "Ichimoku",
		Name: "Ichimoku Kinko Hyo",
		ShortName: "ICHIMO",
		Family: "Ichimoku & Charts",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "Five-line cloud system (Tenkan, Kijun, Senkou A/B, Chikou).",
		Inputs: []InputSchema{inputPeriod("tenkan_period", "Tenkan Period", 14, 1, 500), inputPeriod("kijun_period", "Kijun Period", 14, 1, 500), inputPeriod("senkou_b_period", "Senkou B Period", 14, 1, 500), inputFloat("displacement", "Displacement", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "tenkan", Type: PlotTypeLine, Title: "tenkan", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "kijun", Type: PlotTypeLine, Title: "kijun", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "senkouA", Type: PlotTypeLine, Title: "senkouA", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "senkouB", Type: PlotTypeLine, Title: "senkouB", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "chikou", Type: PlotTypeLine, Title: "chikou", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.smoothed_heikin_ashi",
		WasmClass: "SmoothedHeikinAshi",
		Name: "Smoothed Heikin-Ashi",
		ShortName: "SHA",
		Family: "Ichimoku & Charts",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "The Heikin-Ashi transform applied to EMA-smoothed OHLC — long, clean runs of same-colour candles for an even clearer trend read.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "open", Type: PlotTypeLine, Title: "open", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "high", Type: PlotTypeLine, Title: "high", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "low", Type: PlotTypeLine, Title: "low", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "close", Type: PlotTypeLine, Title: "close", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.three_line_break",
		WasmClass: "ThreeLineBreak",
		Name: "Three Line Break",
		ShortName: "TLB",
		Family: "Ichimoku & Charts",
		Category: "Trend & Overlays",
		Overlay: true,
		Description: "The trend direction of a line-break chart — a reversal needs the close to break the extreme of the last three lines, filtering out minor pullbacks.",
		Inputs: []InputSchema{inputFloat("lines", "Lines", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Three Line Break", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerAltChartBars() {
	c.add(IndicatorDescriptor{
		ID: "wickra.dollar_bars",
		WasmClass: "DollarBars",
		Name: "Dollar Bars",
		ShortName: "DB",
		Family: "Alt-Chart Bars",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Drift-robust OHLC bars — one bar per fixed amount of traded value (price × volume).",
		Inputs: []InputSchema{inputFloat("dollar_per_bar", "Dollar Per Bar", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "open", Type: PlotTypeLine, Title: "open", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.imbalance_bars",
		WasmClass: "ImbalanceBars",
		Name: "Imbalance Bars",
		ShortName: "IB",
		Family: "Alt-Chart Bars",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Order-flow bars — sample when cumulative signed tick imbalance becomes one-sided.",
		Inputs: []InputSchema{inputFloat("threshold", "Threshold", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "open", Type: PlotTypeLine, Title: "open", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.kagi_bars",
		WasmClass: "KagiBars",
		Name: "Kagi Bars",
		ShortName: "KB",
		Family: "Alt-Chart Bars",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Reversal-amount line segments.",
		Inputs: []InputSchema{inputFloat("reversal", "Reversal", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "start", Type: PlotTypeLine, Title: "start", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.point_and_figure_bars",
		WasmClass: "PointAndFigureBars",
		Name: "Point and Figure Bars",
		ShortName: "PAFB",
		Family: "Alt-Chart Bars",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Box-size X/O columns with an N-box reversal.",
		Inputs: []InputSchema{inputFloat("box_size", "Box Size", 1.0, 0.01, 1000.0, 0.1), inputFloat("reversal", "Reversal", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "direction", Type: PlotTypeLine, Title: "direction", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.range_bars",
		WasmClass: "RangeBars",
		Name: "Range Bars",
		ShortName: "RB",
		Family: "Alt-Chart Bars",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Fixed price-range bars with no reversal penalty — one bar per range of close movement in either direction.",
		Inputs: []InputSchema{inputFloat("range", "Range", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "open", Type: PlotTypeLine, Title: "open", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.renko_bars",
		WasmClass: "RenkoBars",
		Name: "Renko Bars",
		ShortName: "RB",
		Family: "Alt-Chart Bars",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Fixed box-size bricks with the two-box reversal rule.",
		Inputs: []InputSchema{inputFloat("box_size", "Box Size", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "open", Type: PlotTypeLine, Title: "open", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.run_bars",
		WasmClass: "RunBars",
		Name: "Run Bars",
		ShortName: "RB",
		Family: "Alt-Chart Bars",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Persistence bars — sample on an uninterrupted run of same-signed ticks.",
		Inputs: []InputSchema{inputFloat("run_length", "Run Length", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "open", Type: PlotTypeLine, Title: "open", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.three_line_break_bars",
		WasmClass: "ThreeLineBreakBars",
		Name: "Three Line Break Bars",
		ShortName: "TLBB",
		Family: "Alt-Chart Bars",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Line-break chart segments — a new line per close extreme, reversing only on a break of the last three lines.",
		Inputs: []InputSchema{inputFloat("lines", "Lines", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "open", Type: PlotTypeLine, Title: "open", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tick_bars",
		WasmClass: "TickBars",
		Name: "Tick Bars",
		ShortName: "TB",
		Family: "Alt-Chart Bars",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Activity-sampled OHLCV bars — one bar per fixed number of input candles (ticks).",
		Inputs: []InputSchema{inputFloat("ticks", "Ticks", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "open", Type: PlotTypeLine, Title: "open", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.volume_bars",
		WasmClass: "VolumeBars",
		Name: "Volume Bars",
		ShortName: "VB",
		Family: "Alt-Chart Bars",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Equal-participation OHLCV bars — one bar per fixed amount of traded volume.",
		Inputs: []InputSchema{inputFloat("volume_per_bar", "Volume Per Bar", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "open", Type: PlotTypeLine, Title: "open", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerCandlestickPatterns() {
	c.add(IndicatorDescriptor{
		ID: "wickra.abandoned_baby",
		WasmClass: "AbandonedBaby",
		Name: "Abandoned Baby",
		ShortName: "AB",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Strong three-bar reversal where a doji is",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Abandoned Baby", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.advance_block",
		WasmClass: "AdvanceBlock",
		Name: "Advance Block",
		ShortName: "AB",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "each real body shrinks while the upper shadows lengthen, hinting the…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Advance Block", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.belt_hold",
		WasmClass: "BeltHold",
		Name: "Belt Hold",
		ShortName: "BH",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "a bullish belt-hold opens at the low and rallies, a bearish one…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Belt Hold", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.breakaway",
		WasmClass: "Breakaway",
		Name: "Breakaway",
		ShortName: "BREAKA",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Five-bar reversal that fades an exhausted run. A trend gaps away on the second bar, drifts two more bars in the same direction, then the fifth bar snaps the other way and closes back…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Breakaway", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.closing_marubozu",
		WasmClass: "ClosingMarubozu",
		Name: "Closing Marubozu",
		ShortName: "CM",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Single-bar strong-momentum candle with a long body and no shadow on the close end. White closes right at the high; black closes right at the low. The shaved close shows the move…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Closing Marubozu", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.concealing_baby_swallow",
		WasmClass: "ConcealingBabySwallow",
		Name: "Concealing Baby Swallow",
		ShortName: "CBS",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Rare four-bar bullish reversal. Two black marubozu lead a steep decline; the third is a black candle that gaps down on the open yet throws a long upper shadow back up into…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Concealing Baby Swallow", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.counterattack",
		WasmClass: "Counterattack",
		Name: "Counterattack",
		ShortName: "COUNTE",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Two-bar reversal where the second bar storms back to close right where the first closed. A long candle runs with the trend, then an opposite-coloured long candle opens far in the…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Counterattack", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.doji",
		WasmClass: "Doji",
		Name: "Doji",
		ShortName: "Doji",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Single-bar indecision candle. A Doji prints whenever the absolute distance between open and close is small compared to the bar",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Doji", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.doji_star",
		WasmClass: "DojiStar",
		Name: "Doji Star",
		ShortName: "DS",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "the indecision hinting the move is about to turn.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Doji Star", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.downside_gap_three_methods",
		WasmClass: "DownsideGapThreeMethods",
		Name: "Downside Gap Three Methods",
		ShortName: "DGTM",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Three-bar bearish continuation. Two black candles decline with a downside body gap between them, then a white candle opens inside the second body and closes inside the…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Downside Gap Three Methods", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.dragonfly_doji",
		WasmClass: "DragonflyDoji",
		Name: "Dragonfly Doji",
		ShortName: "DD",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Bullish reversal doji with a long lower shadow and open/close at the session high.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Dragonfly Doji", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.dumpling_top",
		WasmClass: "DumplingTop",
		Name: "Dumpling Top",
		ShortName: "DT",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "a gently rounded top (dome) confirmed by a close back below where the dome began.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Dumpling Top", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.engulfing",
		WasmClass: "Engulfing",
		Name: "Engulfing",
		ShortName: "ENGULF",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Two-bar reversal pattern. The current candle",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Engulfing", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.evening_doji_star",
		WasmClass: "EveningDojiStar",
		Name: "Evening Doji Star",
		ShortName: "EDS",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Three-bar bearish top reversal. A long white bar extends the advance, a doji gaps up above it (the star of indecision), then a black bar gaps back down and closes deep into the…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Evening Doji Star", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.falling_three_methods",
		WasmClass: "FallingThreeMethods",
		Name: "Falling Three Methods",
		ShortName: "FTM",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Five-bar bearish continuation. A long black candle is followed by three small white bars that drift up with their bodies inside its range (a brief rest), then a second long…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Falling Three Methods", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.fry_pan_bottom",
		WasmClass: "FryPanBottom",
		Name: "Fry Pan Bottom",
		ShortName: "FPB",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "a bullish accumulation pattern.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Fry Pan Bottom", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.gap_side_by_side_white",
		WasmClass: "GapSideBySideWhite",
		Name: "Gap Side By Side White",
		ShortName: "GSBSW",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Three-bar continuation. After a gap away from the first bar, two white candles of similar size open at roughly the same level (side by side) and hold the gap open, signalling…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Gap Side By Side White", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.gravestone_doji",
		WasmClass: "GravestoneDoji",
		Name: "Gravestone Doji",
		ShortName: "GD",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Bearish reversal doji with a long upper shadow and open/close at the session low.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Gravestone Doji", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.hammer",
		WasmClass: "Hammer",
		Name: "Hammer",
		ShortName: "Hammer",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Single-bar bullish reversal candidate. A Hammer has a small real body sitting near the top of the bar, a long lower shadow at least twice the body, and a short or absent upper shadow.…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Hammer", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.hanging_man",
		WasmClass: "HangingMan",
		Name: "Hanging Man",
		ShortName: "HM",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Bearish reversal candlestick with a small upper body and long lower wick at market tops.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Hanging Man", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.harami",
		WasmClass: "Harami",
		Name: "Harami",
		ShortName: "Harami",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Two-bar reversal pattern. The current candle",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Harami", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.harami_cross",
		WasmClass: "HaramiCross",
		Name: "stronger Harami",
		ShortName: "HC",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "a large real body followed by a Doji contained within it; the total indecision after a strong move makes the reversal more potent.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Harami Cross", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.high_wave",
		WasmClass: "HighWave",
		Name: "High Wave",
		ShortName: "HW",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "trend conviction has evaporated.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "High Wave", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.hikkake",
		WasmClass: "Hikkake",
		Name: "Hikkake",
		ShortName: "HIKKAK",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Three-bar trap. An inside bar sets up a breakout that immediately fails on the next bar, trapping breakout traders and pointing the opposite way.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Hikkake", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.hikkake_modified",
		WasmClass: "HikkakeModified",
		Name: "Hikkake Modified",
		ShortName: "HM",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Dan Chesler",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Hikkake Modified", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.homing_pigeon",
		WasmClass: "HomingPigeon",
		Name: "Homing Pigeon",
		ShortName: "HP",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Two-bar bullish reversal. Two black candles in a decline, the second a small body sitting entirely inside the first body (a same-colour harami). The shrinking range signals selling…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Homing Pigeon", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.identical_three_crows",
		WasmClass: "IdenticalThreeCrows",
		Name: "Identical Three Crows",
		ShortName: "ITC",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Three-bar bearish reversal: three consecutive black candles with steadily lower closes where each opens at (or very near) the prior candle",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Identical Three Crows", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.in_neck",
		WasmClass: "InNeck",
		Name: "In Neck",
		ShortName: "InNeck",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Two-bar bearish continuation, slightly stronger than On-Neck. A long black candle in a decline is followed by a white candle that opens below the black bar",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "In Neck", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.inverted_hammer",
		WasmClass: "InvertedHammer",
		Name: "Inverted Hammer",
		ShortName: "IH",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Single-bar bullish reversal candidate. The mirror of a Hammer: small real body near the bottom of the bar, a long upper shadow at least twice the body, and a short or absent…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Inverted Hammer", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.kicking",
		WasmClass: "Kicking",
		Name: "Kicking",
		ShortName: "KICKIN",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Two-bar reversal of two opposite-coloured marubozu separated by a gap. A shadowless candle is",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Kicking", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.kicking_by_length",
		WasmClass: "KickingByLength",
		Name: "Kicking By Length",
		ShortName: "KBL",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "The [Kicking](/Indicators/Indicator-Kicking) pattern with the signal taken from the longer of the two marubozu rather than from the gap direction. When the two shadowless candles…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Kicking By Length", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ladder_bottom",
		WasmClass: "LadderBottom",
		Name: "Ladder Bottom",
		ShortName: "LB",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Five-bar bullish reversal. Three long black candles step the market down like rungs of a ladder, a fourth black candle finally shows an upper shadow (the first sign of buying), and…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Ladder Bottom", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.long_legged_doji",
		WasmClass: "LongLeggedDoji",
		Name: "Long Legged Doji",
		ShortName: "LLD",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "a tug-of-war that often precedes a turn.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Long Legged Doji", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.long_line",
		WasmClass: "LongLine",
		Name: "Long Line",
		ShortName: "LL",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "a solid directional bar. Because",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Long Line", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.marubozu",
		WasmClass: "Marubozu",
		Name: "Marubozu",
		ShortName: "MARUBO",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "one side won the entire bar with no contest. Signals strong momentum in…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Marubozu", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.mat_hold",
		WasmClass: "MatHold",
		Name: "Mat Hold",
		ShortName: "MH",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Five-bar bullish continuation. A long white candle is followed by a brief three-bar pullback that gaps up and then drifts on small bodies without surrendering much ground, after which a…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Mat Hold", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.matching_low",
		WasmClass: "MatchingLow",
		Name: "Matching Low",
		ShortName: "ML",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Two-bar bullish reversal. Two black candles in a decline close at the same level: the second sell-off cannot push price any lower, so the matching closes mark a support floor.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Matching Low", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.morning_doji_star",
		WasmClass: "MorningDojiStar",
		Name: "Morning Doji Star",
		ShortName: "MDS",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Three-bar bullish bottom reversal. A long black bar extends the decline, a doji gaps down below it (the star of indecision), then a white bar gaps back up and closes deep into…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Morning Doji Star", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.new_price_lines",
		WasmClass: "NewPriceLines",
		Name: "Japanese",
		ShortName: "NPL",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "The Japanese",
		Inputs: []InputSchema{inputFloat("count", "Count", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "New Price Lines", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.on_neck",
		WasmClass: "OnNeck",
		Name: "On Neck",
		ShortName: "OnNeck",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Two-bar bearish continuation. In a decline a long black candle is followed by a white candle that opens below the black bar",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "On Neck", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.opening_marubozu",
		WasmClass: "OpeningMarubozu",
		Name: "Opening Marubozu",
		ShortName: "OM",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Single-bar strong-momentum candle with a long body and no shadow on the open end. White opens right at the low; black opens right at the high. The shaved open shows the move took…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Opening Marubozu", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rickshaw_man",
		WasmClass: "RickshawMan",
		Name: "Rickshaw Man",
		ShortName: "RM",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "the most balanced form of indecision: neither side controlled the close and…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Rickshaw Man", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rising_three_methods",
		WasmClass: "RisingThreeMethods",
		Name: "Rising Three Methods",
		ShortName: "RTM",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Five-bar bullish continuation. A long white candle is followed by three small black bars that drift back with their bodies inside its range (a brief rest), then a second long…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Rising Three Methods", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.separating_lines",
		WasmClass: "SeparatingLines",
		Name: "Separating Lines",
		ShortName: "SL",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Two-bar continuation. After a counter-trend candle, the next candle of the opposite colour opens right back at the prior open and runs as an opening marubozu in the trend…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Separating Lines", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.shooting_star",
		WasmClass: "ShootingStar",
		Name: "Shooting Star",
		ShortName: "SS",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "small body near the bottom, long upper shadow ≥ 2× body, short…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Shooting Star", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.short_line",
		WasmClass: "ShortLine",
		Name: "Short Line",
		ShortName: "SL",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "a compact directional bar. As with…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Short Line", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.spinning_top",
		WasmClass: "SpinningTop",
		Name: "Spinning Top",
		ShortName: "ST",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Indecision candlestick pattern with small real body and symmetric upper/lower shadows.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Spinning Top", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.stalled_pattern",
		WasmClass: "StalledPattern",
		Name: "Stalled Pattern",
		ShortName: "SP",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Three-bar bearish reversal warning (also called Deliberation). Two long white candles push higher, then a small-bodied white candle opens at or near the top of the second body and…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Stalled Pattern", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.stick_sandwich",
		WasmClass: "StickSandwich",
		Name: "Stick Sandwich",
		ShortName: "SS",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Three-bar bullish reversal. A black candle, then a white candle that trades entirely above the first close, then a second black candle that drives price back down to close at the…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Stick Sandwich", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.takuri",
		WasmClass: "Takuri",
		Name: "Single-bar bullish reversal",
		ShortName: "Takuri",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "a stricter Dragonfly Doji. Open, close and high sit at the very top with a negligible upper shadow, while an exceptionally long lower shadow shows price was…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Takuri", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tasuki_gap",
		WasmClass: "TasukiGap",
		Name: "Tasuki Gap",
		ShortName: "TG",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Three-bar continuation pattern. Two same-coloured candles open a body gap in the trend direction, then an opposite-coloured candle opens inside the second body and closes back into the…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Tasuki Gap", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.three_line_strike",
		WasmClass: "ThreeLineStrike",
		Name: "Three Line Strike",
		ShortName: "TLS",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Four-bar pattern: three candles marching in one direction (a three-soldiers / three-crows run) followed by a fourth, opposite-colour candle that opens beyond the third and closes…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Three Line Strike", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.three_soldiers_or_crows",
		WasmClass: "ThreeSoldiersOrCrows",
		Name: "Three White Soldiers / Three Black Crows",
		ShortName: "TSOC",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Three-bar continuation pattern. Three consecutive long-bodied bars in the same direction, each opening inside the previous body and closing beyond it.…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Three Soldiers Or Crows", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.three_stars_in_south",
		WasmClass: "ThreeStarsInSouth",
		Name: "Three Stars In South",
		ShortName: "TSIS",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Rare three-bar bullish reversal. Three shrinking black candles, each carving a higher low and contracting toward a tiny black marubozu, show selling pressure draining away at…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Three Stars In South", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.thrusting",
		WasmClass: "Thrusting",
		Name: "Thrusting",
		ShortName: "THRUST",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Two-bar bearish continuation, deeper than In-Neck but short of a piercing reversal. A long black candle in a decline is followed by a white candle that opens below the black bar",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Thrusting", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tower_top_bottom",
		WasmClass: "TowerTopBottom",
		Name: "Tower Top Bottom",
		ShortName: "TTB",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Multi-bar reversal pattern with strong vertical moves flanking consolidation bars.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Tower Top Bottom", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tristar",
		WasmClass: "Tristar",
		Name: "Tristar",
		ShortName: "TRISTA",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Three consecutive Doji where the middle one",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Tristar", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tweezer",
		WasmClass: "Tweezer",
		Name: "Tweezer (Top / Bottom)",
		ShortName: "TWEEZE",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Two-bar reversal pattern where two consecutive candles share an extreme. Tweezer Top: matched highs at the top of an uptrend (bearish reversal); Tweezer Bottom: matched…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Tweezer", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.two_crows",
		WasmClass: "TwoCrows",
		Name: "Two Crows",
		ShortName: "TC",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Three-bar bearish reversal after an advance. A long white candle is followed by two black candles: the first gaps its body up, the second opens inside that body and closes back down…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Two Crows", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.unique_three_river",
		WasmClass: "UniqueThreeRiver",
		Name: "Unique Three River",
		ShortName: "UTR",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Three-bar bullish reversal (the",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Unique Three River", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.upside_gap_three_methods",
		WasmClass: "UpsideGapThreeMethods",
		Name: "Upside Gap Three Methods",
		ShortName: "UGTM",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Three-bar bullish continuation. Two white candles advance with an upside body gap between them, then a black candle opens inside the second body and closes inside the…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Upside Gap Three Methods", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.upside_gap_two_crows",
		WasmClass: "UpsideGapTwoCrows",
		Name: "Upside Gap Two Crows",
		ShortName: "UGTC",
		Family: "Candlestick Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Three-bar bearish reversal after an advance. Two black candles gap up above a long white candle; the second black candle engulfs the first crow yet still closes above the white…",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "signal", Type: PlotTypeMarker, Title: "Upside Gap Two Crows", Color: "#089981", ColorUp: "#089981", ColorDown: "#F23645", Visible: true}},
	})
}

func (c *Catalog) registerChartPatterns() {
	c.add(IndicatorDescriptor{
		ID: "wickra.cup_and_handle",
		WasmClass: "CupAndHandle",
		Name: "Cup and Handle",
		ShortName: "CAH",
		Family: "Chart Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Rounded base with a shallow handle near the rim (and inverse).",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Cup And Handle", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.double_top_bottom",
		WasmClass: "DoubleTopBottom",
		Name: "Double Top / Bottom",
		ShortName: "DTB",
		Family: "Chart Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Twin-peak / twin-trough reversal on the second matching extreme.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Double Top Bottom", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.flag_pennant",
		WasmClass: "FlagPennant",
		Name: "Flag / Pennant",
		ShortName: "FP",
		Family: "Chart Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Shallow consolidation against a pole — continuation in the pole direction.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Flag Pennant", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.head_and_shoulders",
		WasmClass: "HeadAndShoulders",
		Name: "Head and Shoulders",
		ShortName: "HAS",
		Family: "Chart Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Central head, two matching shoulders, flat neckline (and inverse).",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Head And Shoulders", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.rectangle_range",
		WasmClass: "RectangleRange",
		Name: "Rectangle / Range",
		ShortName: "RR",
		Family: "Chart Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Flat support / resistance — mean-reversion off the touched boundary.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Rectangle Range", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.triangle",
		WasmClass: "Triangle",
		Name: "Triangle Chart Pattern",
		ShortName: "TRIANG",
		Family: "Chart Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Converging trendlines: ascending +1, descending -1, symmetrical leans with the last swing.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Triangle", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.triple_top_bottom",
		WasmClass: "TripleTopBottom",
		Name: "Three-extreme reversal",
		ShortName: "TTB",
		Family: "Chart Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Three matching peaks / troughs — a stronger reversal.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Triple Top Bottom", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.wedge",
		WasmClass: "Wedge",
		Name: "Wedge (rising / falling)",
		ShortName: "Wedge",
		Family: "Chart Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Same-direction converging trendlines: rising wedge -1, falling wedge +1.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Wedge", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerHarmonicPatterns() {
	c.add(IndicatorDescriptor{
		ID: "wickra.abcd",
		WasmClass: "Abcd",
		Name: "AB=CD",
		ShortName: "Abcd",
		Family: "Harmonic Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Four-point AB=CD: BC retraces AB, CD mirrors AB.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Abcd", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.bat",
		WasmClass: "Bat",
		Name: "Bat",
		ShortName: "Bat",
		Family: "Harmonic Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Five-point harmonic with a shallow B and 0.886 D.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Bat", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.butterfly",
		WasmClass: "Butterfly",
		Name: "Butterfly",
		ShortName: "BUTTER",
		Family: "Harmonic Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Five-point harmonic with an extended (1.27-1.618 XA) D.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Butterfly", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.crab",
		WasmClass: "Crab",
		Name: "Crab",
		ShortName: "Crab",
		Family: "Harmonic Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Five-point harmonic with the deepest (1.618 XA) D.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Crab", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.cypher",
		WasmClass: "Cypher",
		Name: "Cypher",
		ShortName: "Cypher",
		Family: "Harmonic Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Five-point harmonic whose D retraces XC by 0.786.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Cypher", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.gartley",
		WasmClass: "Gartley",
		Name: "Gartley",
		ShortName: "GARTLE",
		Family: "Harmonic Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Five-point harmonic with a 0.786 D completion.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Gartley", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.shark",
		WasmClass: "Shark",
		Name: "Shark",
		ShortName: "Shark",
		Family: "Harmonic Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Five-point harmonic with an expansion leg and 0.886-1.13 D.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Shark", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.three_drives",
		WasmClass: "ThreeDrives",
		Name: "Three Drives",
		ShortName: "TD",
		Family: "Harmonic Patterns",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Three symmetric drives with extension legs.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Three Drives", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerFibonacci() {
	c.add(IndicatorDescriptor{
		ID: "wickra.auto_fib",
		WasmClass: "AutoFib",
		Name: "Auto-Fibonacci",
		ShortName: "AF",
		Family: "Fibonacci",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Retracement anchored on the dominant recent leg.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "level0", Type: PlotTypeLine, Title: "level0", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level236", Type: PlotTypeLine, Title: "level236", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level382", Type: PlotTypeLine, Title: "level382", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level500", Type: PlotTypeLine, Title: "level500", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level618", Type: PlotTypeLine, Title: "level618", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level786", Type: PlotTypeLine, Title: "level786", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level1000", Type: PlotTypeLine, Title: "level1000", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.fib_arcs",
		WasmClass: "FibArcs",
		Name: "Fibonacci Arcs",
		ShortName: "FA",
		Family: "Fibonacci",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Semicircular retracement levels decaying over time.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "arc382", Type: PlotTypeLine, Title: "arc382", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "arc500", Type: PlotTypeLine, Title: "arc500", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "arc618", Type: PlotTypeLine, Title: "arc618", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.fib_channel",
		WasmClass: "FibChannel",
		Name: "Fibonacci Channel",
		ShortName: "FC",
		Family: "Fibonacci",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Sloped base trendline plus parallel Fibonacci offsets.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "base", Type: PlotTypeLine, Title: "base", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level618", Type: PlotTypeLine, Title: "level618", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level1000", Type: PlotTypeLine, Title: "level1000", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level1618", Type: PlotTypeLine, Title: "level1618", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.fib_confluence",
		WasmClass: "FibConfluence",
		Name: "Fibonacci Confluence",
		ShortName: "FC",
		Family: "Fibonacci",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Densest cluster of retracement levels across recent legs.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "price", Type: PlotTypeLine, Title: "price", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "strength", Type: PlotTypeLine, Title: "strength", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.fib_extension",
		WasmClass: "FibExtension",
		Name: "Fibonacci Extension",
		ShortName: "FE",
		Family: "Fibonacci",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Five extension ratios (127.2-261.8%) projected beyond the leg.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "level1272", Type: PlotTypeLine, Title: "level1272", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level1414", Type: PlotTypeLine, Title: "level1414", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level1618", Type: PlotTypeLine, Title: "level1618", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level2000", Type: PlotTypeLine, Title: "level2000", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level2618", Type: PlotTypeLine, Title: "level2618", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.fib_fan",
		WasmClass: "FibFan",
		Name: "Fibonacci Fan",
		ShortName: "FibFan",
		Family: "Fibonacci",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Trendlines fanning through the leg's retracement levels.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "fan382", Type: PlotTypeLine, Title: "fan382", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "fan500", Type: PlotTypeLine, Title: "fan500", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "fan618", Type: PlotTypeLine, Title: "fan618", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.fib_projection",
		WasmClass: "FibProjection",
		Name: "Fibonacci Projection",
		ShortName: "FP",
		Family: "Fibonacci",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "A-B-C measured-move target zone projected from C.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "level618", Type: PlotTypeLine, Title: "level618", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level1000", Type: PlotTypeLine, Title: "level1000", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level1618", Type: PlotTypeLine, Title: "level1618", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level2618", Type: PlotTypeLine, Title: "level2618", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.fib_retracement",
		WasmClass: "FibRetracement",
		Name: "Fibonacci Retracement",
		ShortName: "FR",
		Family: "Fibonacci",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Seven retracement levels (0-100%) of the last swing leg.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "level0", Type: PlotTypeLine, Title: "level0", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level236", Type: PlotTypeLine, Title: "level236", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level382", Type: PlotTypeLine, Title: "level382", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level500", Type: PlotTypeLine, Title: "level500", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level618", Type: PlotTypeLine, Title: "level618", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level786", Type: PlotTypeLine, Title: "level786", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "level1000", Type: PlotTypeLine, Title: "level1000", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.fib_time_zones",
		WasmClass: "FibTimeZones",
		Name: "Fibonacci Time Zones",
		ShortName: "FTZ",
		Family: "Fibonacci",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Markers at Fibonacci bar-distances from the latest pivot.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "onZone", Type: PlotTypeLine, Title: "onZone", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "barsToNext", Type: PlotTypeLine, Title: "barsToNext", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.fibonacci_pivots",
		WasmClass: "FibonacciPivots",
		Name: "Fibonacci Pivots",
		ShortName: "FP",
		Family: "Fibonacci",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "Pivot + Fib-ratio R/S levels (0.382 / 0.618 / 1.000 · range).",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "pp", Type: PlotTypeLine, Title: "pp", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "r1", Type: PlotTypeLine, Title: "r1", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "r2", Type: PlotTypeLine, Title: "r2", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "r3", Type: PlotTypeLine, Title: "r3", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "s1", Type: PlotTypeLine, Title: "s1", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "s2", Type: PlotTypeLine, Title: "s2", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "s3", Type: PlotTypeLine, Title: "s3", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.golden_pocket",
		WasmClass: "GoldenPocket",
		Name: "0.618-0.65",
		ShortName: "GP",
		Family: "Fibonacci",
		Category: "Patterns & Drawings",
		Overlay: true,
		Description: "The 0.618-0.65 optimal-trade-entry band.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "low", Type: PlotTypeLine, Title: "low", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "mid", Type: PlotTypeLine, Title: "mid", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "high", Type: PlotTypeLine, Title: "high", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerMicrostructure() {
	c.add(IndicatorDescriptor{
		ID: "wickra.amihud_illiquidity",
		WasmClass: "AmihudIlliquidity",
		Name: "Amihud Illiquidity",
		ShortName: "AI",
		Family: "Microstructure",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Mean |return| / traded value; price-impact liquidity proxy.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Amihud Illiquidity", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.cumulative_volume_delta",
		WasmClass: "CumulativeVolumeDelta",
		Name: "Cumulative Volume Delta (CVD)",
		ShortName: "CVD",
		Family: "Microstructure",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Running sum of signed volume.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Cumulative Volume Delta", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.depth_slope",
		WasmClass: "DepthSlope",
		Name: "Depth Slope",
		ShortName: "DS",
		Family: "Microstructure",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Mean per-side OLS slope of cumulative size vs distance.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Depth Slope", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.effective_spread",
		WasmClass: "EffectiveSpread",
		Name: "Effective Spread",
		ShortName: "ES",
		Family: "Microstructure",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "2·D·(price − mid)/mid·1e4 bps round-trip cost.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Effective Spread", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.footprint",
		WasmClass: "Footprint",
		Name: "Footprint Chart",
		ShortName: "FOOTPR",
		Family: "Microstructure",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Buy/sell volume profile per price bucket.",
		Inputs: []InputSchema{inputFloat("tick_size", "Tick Size", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "price", Type: PlotTypeLine, Title: "price", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.hasbrouck_information_share",
		WasmClass: "HasbrouckInformationShare",
		Name: "Hasbrouck Information Share",
		ShortName: "HIS",
		Family: "Microstructure",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Each venue's contribution to price discovery — the share of total return variance carried by the first of two synchronised price series.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Hasbrouck Information Share", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.kyles_lambda",
		WasmClass: "KylesLambda",
		Name: "Kyle's Lambda",
		ShortName: "KL",
		Family: "Microstructure",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Rolling OLS price impact per unit signed volume.",
		Inputs: []InputSchema{inputPeriod("window", "Window", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Kyles Lambda", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.microprice",
		WasmClass: "Microprice",
		Name: "Microprice",
		ShortName: "MICROP",
		Family: "Microstructure",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Size-weighted fair value tilting the mid.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Microprice", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.order_book_imbalance_full",
		WasmClass: "OrderBookImbalanceFull",
		Name: "Order Book Imbalance (Full)",
		ShortName: "OBIF",
		Family: "Microstructure",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Signed depth pressure over the whole book.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Order Book Imbalance Full", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.order_book_imbalance_top1",
		WasmClass: "OrderBookImbalanceTop1",
		Name: "Order Book Imbalance (Top 1)",
		ShortName: "OBIT1",
		Family: "Microstructure",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Signed depth pressure at the touch.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Order Book Imbalance Top1", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.order_book_imbalance_top_n",
		WasmClass: "OrderBookImbalanceTopN",
		Name: "Order Book Imbalance (Top N)",
		ShortName: "OBITN",
		Family: "Microstructure",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Signed depth pressure over the top levels.",
		Inputs: []InputSchema{inputFloat("levels", "Levels", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Order Book Imbalance Top N", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.order_flow_imbalance",
		WasmClass: "OrderFlowImbalance",
		Name: "Order Flow Imbalance (OFI)",
		ShortName: "OFI",
		Family: "Microstructure",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Rolling sum of best-level order-flow events (Cont-Kukanov-Stoikov OFI).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Order Flow Imbalance", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.quoted_spread",
		WasmClass: "QuotedSpread",
		Name: "Quoted Spread",
		ShortName: "QS",
		Family: "Microstructure",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Top-of-book spread in bps of the mid.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Quoted Spread", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.realized_spread",
		WasmClass: "RealizedSpread",
		Name: "Realized Spread",
		ShortName: "RS",
		Family: "Microstructure",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Effective spread net of impact over horizon.",
		Inputs: []InputSchema{inputFloat("horizon", "Horizon", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Realized Spread", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.roll_measure",
		WasmClass: "RollMeasure",
		Name: "Roll Measure",
		ShortName: "RM",
		Family: "Microstructure",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Effective spread from the serial covariance of price changes.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Roll Measure", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.signed_volume",
		WasmClass: "SignedVolume",
		Name: "Signed Volume",
		ShortName: "SV",
		Family: "Microstructure",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Trade size signed by aggressor (±size).",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Signed Volume", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.trade_imbalance",
		WasmClass: "TradeImbalance",
		Name: "Trade Imbalance",
		ShortName: "TI",
		Family: "Microstructure",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Rolling (buy − sell)/(buy + sell) over window trades.",
		Inputs: []InputSchema{inputPeriod("window", "Window", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Trade Imbalance", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.trade_sign_autocorrelation",
		WasmClass: "TradeSignAutocorrelation",
		Name: "Trade Sign Autocorrelation",
		ShortName: "TSA",
		Family: "Microstructure",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "The lag-1 autocorrelation of the trade-aggressor side — how strongly signed order flow persists, a footprint of order-splitting and informed execution.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Trade Sign Autocorrelation", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.vpin",
		WasmClass: "Vpin",
		Name: "Volume-Synchronized Probability of Informed Trading (VPIN)",
		ShortName: "Vpin",
		Family: "Microstructure",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Volume-bucketed order-flow toxicity (informed trading).",
		Inputs: []InputSchema{inputFloat("bucket_volume", "Bucket Volume", 1.0, 0.01, 1000.0, 0.1), inputFloat("num_buckets", "Num Buckets", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Vpin", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerDerivatives() {
	c.add(IndicatorDescriptor{
		ID: "wickra.calendar_spread",
		WasmClass: "CalendarSpread",
		Name: "Calendar Spread",
		ShortName: "CS",
		Family: "Derivatives",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Dated-future premium to the perpetual (futures − mark)/mark.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Calendar Spread", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.estimated_leverage_ratio",
		WasmClass: "EstimatedLeverageRatio",
		Name: "Estimated Leverage Ratio",
		ShortName: "ELR",
		Family: "Derivatives",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Open interest divided by the exchange's coin reserve (CryptoQuant ELR).",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Estimated Leverage Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.funding_basis",
		WasmClass: "FundingBasis",
		Name: "perpetual mark",
		ShortName: "FB",
		Family: "Derivatives",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Perp premium to spot (mark − index)/index.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Funding Basis", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.funding_implied_apr",
		WasmClass: "FundingImpliedApr",
		Name: "Funding Implied Apr",
		ShortName: "FIA",
		Family: "Derivatives",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "The per-interval funding rate annualised — the carry cost (or yield) of holding a perpetual position for a year.",
		Inputs: []InputSchema{inputFloat("intervals_per_year", "Intervals Per Year", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Funding Implied Apr", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.funding_rate",
		WasmClass: "FundingRate",
		Name: "Funding Rate",
		ShortName: "FR",
		Family: "Derivatives",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "The current perpetual funding rate.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Funding Rate", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.funding_rate_mean",
		WasmClass: "FundingRateMean",
		Name: "Funding Rate Mean",
		ShortName: "FRM",
		Family: "Derivatives",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Rolling mean funding rate over window.",
		Inputs: []InputSchema{inputPeriod("window", "Window", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Funding Rate Mean", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.funding_rate_zscore",
		WasmClass: "FundingRateZScore",
		Name: "Funding Rate Z Score",
		ShortName: "FRZS",
		Family: "Derivatives",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Funding rate in stddevs from its rolling mean.",
		Inputs: []InputSchema{inputPeriod("window", "Window", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Funding Rate Z Score", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.liquidation_features",
		WasmClass: "LiquidationFeatures",
		Name: "Liquidation Features",
		ShortName: "LF",
		Family: "Derivatives",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Long/short liquidation → net / total / imbalance.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "long", Type: PlotTypeLine, Title: "long", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "short", Type: PlotTypeLine, Title: "short", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "net", Type: PlotTypeLine, Title: "net", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "total", Type: PlotTypeLine, Title: "total", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "imbalance", Type: PlotTypeLine, Title: "imbalance", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.long_short_ratio",
		WasmClass: "LongShortRatio",
		Name: "Long/Short Ratio",
		ShortName: "LSR",
		Family: "Derivatives",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Aggregate long size over short size.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Long Short Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.open_interest_delta",
		WasmClass: "OpenInterestDelta",
		Name: "Open Interest Delta",
		ShortName: "OID",
		Family: "Derivatives",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Tick-over-tick change in open interest.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Open Interest Delta", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.open_interest_momentum",
		WasmClass: "OpenInterestMomentum",
		Name: "Open Interest Momentum",
		ShortName: "OIM",
		Family: "Derivatives",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "The percentage rate of change of open interest over a lookback — positioning trend rather than the single-tick delta.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Open Interest Momentum", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.perpetual_premium_index",
		WasmClass: "PerpetualPremiumIndex",
		Name: "perpetual",
		ShortName: "PPI",
		Family: "Derivatives",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "The perpetual's mark price relative to spot — positive means the perp trades at a premium (net long demand), negative a discount.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Perpetual Premium Index", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.taker_buy_sell_ratio",
		WasmClass: "TakerBuySellRatio",
		Name: "Taker Buy Sell Ratio",
		ShortName: "TBSR",
		Family: "Derivatives",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Taker buy volume over taker sell volume.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Taker Buy Sell Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.term_structure_basis",
		WasmClass: "TermStructureBasis",
		Name: "Term Structure Basis",
		ShortName: "TSB",
		Family: "Derivatives",
		Category: "Orderflow & Microstructure",
		Overlay: false,
		Description: "Dated-future premium to spot (futures − index)/index.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Term Structure Basis", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerMarketProfile() {
	c.add(IndicatorDescriptor{
		ID: "wickra.composite_profile",
		WasmClass: "CompositeProfile",
		Name: "Composite Profile",
		ShortName: "CP",
		Family: "Market Profile",
		Category: "Orderflow & Microstructure",
		Overlay: true,
		Description: "A multi-session volume profile reduced to its point of control and value area — the swing-horizon levels that matter.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("bin_count", "Bin Count", 1.0, 0.01, 1000.0, 0.1), inputFloat("value_area_pct", "Value Area Pct", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "poc", Type: PlotTypeLine, Title: "poc", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "vah", Type: PlotTypeLine, Title: "vah", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "val", Type: PlotTypeLine, Title: "val", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.day_of_week_profile",
		WasmClass: "DayOfWeekProfile",
		Name: "Day-of-Week Profile",
		ShortName: "DOWP",
		Family: "Market Profile",
		Category: "Orderflow & Microstructure",
		Overlay: true,
		Description: "Mean bar return bucketed by weekday.",
		Inputs: []InputSchema{inputFloat("utc_offset_minutes", "Utc Offset Minutes", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "values", Type: PlotTypeLine, Title: "Day Of Week Profile", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.high_low_volume_nodes",
		WasmClass: "HighLowVolumeNodes",
		Name: "High Low Volume Nodes",
		ShortName: "HLVN",
		Family: "Market Profile",
		Category: "Orderflow & Microstructure",
		Overlay: true,
		Description: "The price levels of greatest (HVN) and least (LVN) acceptance in a rolling volume profile — magnets and rejection zones.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("bin_count", "Bin Count", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "hvn", Type: PlotTypeLine, Title: "hvn", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "lvn", Type: PlotTypeLine, Title: "lvn", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.initial_balance",
		WasmClass: "InitialBalance",
		Name: "Initial Balance (IB)",
		ShortName: "IB",
		Family: "Market Profile",
		Category: "Orderflow & Microstructure",
		Overlay: true,
		Description: "First-N-bar session range, locked after warmup.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "high", Type: PlotTypeLine, Title: "high", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "low", Type: PlotTypeLine, Title: "low", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.intraday_volatility_profile",
		WasmClass: "IntradayVolatilityProfile",
		Name: "Intraday Volatility Profile",
		ShortName: "IVP",
		Family: "Market Profile",
		Category: "Orderflow & Microstructure",
		Overlay: true,
		Description: "Return standard deviation bucketed by intraday time.",
		Inputs: []InputSchema{inputFloat("buckets", "Buckets", 1.0, 0.01, 1000.0, 0.1), inputFloat("utc_offset_minutes", "Utc Offset Minutes", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "values", Type: PlotTypeLine, Title: "Intraday Volatility Profile", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.naked_poc",
		WasmClass: "NakedPoc",
		Name: "nearest untested (",
		ShortName: "NP",
		Family: "Market Profile",
		Category: "Orderflow & Microstructure",
		Overlay: true,
		Description: "The nearest untested (\"virgin\") point of control — a heavily-traded prior-session price the market has not yet revisited, an outstanding magnet.",
		Inputs: []InputSchema{inputFloat("session_len", "Session Len", 1.0, 0.01, 1000.0, 0.1), inputFloat("bin_count", "Bin Count", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Naked Poc", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.opening_range",
		WasmClass: "OpeningRange",
		Name: "Opening Range (OR)",
		ShortName: "OR",
		Family: "Market Profile",
		Category: "Orderflow & Microstructure",
		Overlay: true,
		Description: "Locked first-N range + live breakout-distance from midpoint.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "high", Type: PlotTypeLine, Title: "high", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "low", Type: PlotTypeLine, Title: "low", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "breakoutDistance", Type: PlotTypeLine, Title: "breakoutDistance", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.profile_shape",
		WasmClass: "ProfileShape",
		Name: "Profile Shape",
		ShortName: "PS",
		Family: "Market Profile",
		Category: "Orderflow & Microstructure",
		Overlay: true,
		Description: "Classifies the rolling volume profile by where its point of control sits: P-shape (+1), b-shape (−1), or D/normal (0).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("bin_count", "Bin Count", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Profile Shape", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.single_prints",
		WasmClass: "SinglePrints",
		Name: "Single Prints",
		ShortName: "SP",
		Family: "Market Profile",
		Category: "Orderflow & Microstructure",
		Overlay: true,
		Description: "The count of price levels touched by exactly one bar — Market Profile \"single prints\" that mark fast, low-acceptance moves.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("bin_count", "Bin Count", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Single Prints", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.time_of_day_return_profile",
		WasmClass: "TimeOfDayReturnProfile",
		Name: "Time-of-Day Return Profile",
		ShortName: "TODRP",
		Family: "Market Profile",
		Category: "Orderflow & Microstructure",
		Overlay: true,
		Description: "Mean bar return bucketed by intraday time.",
		Inputs: []InputSchema{inputFloat("buckets", "Buckets", 1.0, 0.01, 1000.0, 0.1), inputFloat("utc_offset_minutes", "Utc Offset Minutes", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "values", Type: PlotTypeLine, Title: "Time Of Day Return Profile", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tpo_profile",
		WasmClass: "TpoProfile",
		Name: "TPO Profile",
		ShortName: "TP",
		Family: "Market Profile",
		Category: "Orderflow & Microstructure",
		Overlay: true,
		Description: "Time-Price-Opportunity (letter) count per price bucket.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("bin_count", "Bin Count", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "priceLow", Type: PlotTypeLine, Title: "priceLow", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "priceHigh", Type: PlotTypeLine, Title: "priceHigh", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "counts", Type: PlotTypeLine, Title: "counts", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.value_area",
		WasmClass: "ValueArea",
		Name: "Value Area (POC / VAH / VAL)",
		ShortName: "VA",
		Family: "Market Profile",
		Category: "Orderflow & Microstructure",
		Overlay: true,
		Description: "Rolling Market Profile: POC + VAH + VAL via volume bins.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("bin_count", "Bin Count", 1.0, 0.01, 1000.0, 0.1), inputFloat("value_area_pct", "Value Area Pct", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "poc", Type: PlotTypeLine, Title: "poc", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "vah", Type: PlotTypeLine, Title: "vah", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "val", Type: PlotTypeLine, Title: "val", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.volume_by_time_profile",
		WasmClass: "VolumeByTimeProfile",
		Name: "Volume-by-Time Profile",
		ShortName: "VBTP",
		Family: "Market Profile",
		Category: "Orderflow & Microstructure",
		Overlay: true,
		Description: "Mean traded volume bucketed by intraday time.",
		Inputs: []InputSchema{inputFloat("buckets", "Buckets", 1.0, 0.01, 1000.0, 0.1), inputFloat("utc_offset_minutes", "Utc Offset Minutes", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "values", Type: PlotTypeLine, Title: "Volume By Time Profile", Color: "#2962FF", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.volume_profile",
		WasmClass: "VolumeProfile",
		Name: "Volume Profile",
		ShortName: "VP",
		Family: "Market Profile",
		Category: "Orderflow & Microstructure",
		Overlay: true,
		Description: "Full per-bin volume histogram over a rolling window.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("bin_count", "Bin Count", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "priceLow", Type: PlotTypeLine, Title: "priceLow", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "priceHigh", Type: PlotTypeLine, Title: "priceHigh", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "bins", Type: PlotTypeLine, Title: "bins", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerMarketBreadth() {
	c.add(IndicatorDescriptor{
		ID: "wickra.absolute_breadth_index",
		WasmClass: "AbsoluteBreadthIndex",
		Name: "Absolute Breadth Index",
		ShortName: "ABI",
		Family: "Market Breadth",
		Category: "Volume",
		Overlay: false,
		Description: "Absolute value of net advancing-minus-declining issues.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Absolute Breadth Index", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ad_oscillator",
		WasmClass: "AdOscillator",
		Name: "Accumulation/Distribution Oscillator",
		ShortName: "AO",
		Family: "Market Breadth",
		Category: "Volume",
		Overlay: false,
		Description: "Williams A/D Oscillator — the volume-less Williams A/D line minus its 13-bar SMA.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Ad Oscillator", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.ad_volume_line",
		WasmClass: "AdVolumeLine",
		Name: "Advance/Decline Volume Line",
		ShortName: "AVL",
		Family: "Market Breadth",
		Category: "Volume",
		Overlay: false,
		Description: "Cumulative net advancing-minus-declining volume.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Ad Volume Line", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.advance_decline",
		WasmClass: "AdvanceDecline",
		Name: "Advance/Decline Line",
		ShortName: "AD",
		Family: "Market Breadth",
		Category: "Volume",
		Overlay: false,
		Description: "Cumulative net advancing-minus-declining issues.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Advance Decline", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.advance_decline_ratio",
		WasmClass: "AdvanceDeclineRatio",
		Name: "Advance/Decline Ratio",
		ShortName: "ADR",
		Family: "Market Breadth",
		Category: "Volume",
		Overlay: false,
		Description: "Advancing issues divided by declining issues.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Advance Decline Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.breadth_thrust",
		WasmClass: "BreadthThrust",
		Name: "Breadth Thrust (Zweig)",
		ShortName: "BT",
		Family: "Market Breadth",
		Category: "Volume",
		Overlay: false,
		Description: "10-period EMA of the advancing-issues share (Zweig).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Breadth Thrust", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.bullish_percent_index",
		WasmClass: "BullishPercentIndex",
		Name: "Bullish Percent Index (BPI)",
		ShortName: "BPI",
		Family: "Market Breadth",
		Category: "Volume",
		Overlay: false,
		Description: "Percentage of the universe on a point-and-figure buy signal.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Bullish Percent Index", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.cumulative_volume_index",
		WasmClass: "CumulativeVolumeIndex",
		Name: "Cumulative Volume Index (CVI)",
		ShortName: "CVI",
		Family: "Market Breadth",
		Category: "Volume",
		Overlay: false,
		Description: "Running total of net advancing volume (advancing − declining volume).",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Cumulative Volume Index", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.high_low_index",
		WasmClass: "HighLowIndex",
		Name: "High-Low Index",
		ShortName: "HLI",
		Family: "Market Breadth",
		Category: "Volume",
		Overlay: false,
		Description: "Moving average of the record-high percentage.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "High Low Index", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.mc_clellan_oscillator",
		WasmClass: "McClellanOscillator",
		Name: "McClellan Oscillator",
		ShortName: "MCO",
		Family: "Market Breadth",
		Category: "Volume",
		Overlay: false,
		Description: "Spread between a 19/39-period EMA of ratio-adjusted net advances.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Mc Clellan Oscillator", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.mc_clellan_summation_index",
		WasmClass: "McClellanSummationIndex",
		Name: "McClellan Summation Index",
		ShortName: "MCSI",
		Family: "Market Breadth",
		Category: "Volume",
		Overlay: false,
		Description: "Running cumulative total of the McClellan Oscillator.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Mc Clellan Summation Index", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.new_highs_new_lows",
		WasmClass: "NewHighsNewLows",
		Name: "New Highs - New Lows",
		ShortName: "NHNL",
		Family: "Market Breadth",
		Category: "Volume",
		Overlay: false,
		Description: "Net count of new period highs minus new period lows.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "New Highs New Lows", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tick_index",
		WasmClass: "TickIndex",
		Name: "TICK Index",
		ShortName: "TI",
		Family: "Market Breadth",
		Category: "Volume",
		Overlay: false,
		Description: "Instantaneous net advancing-minus-declining issues.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Tick Index", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.trin",
		WasmClass: "Trin",
		Name: "TRIN (Arms Index)",
		ShortName: "Trin",
		Family: "Market Breadth",
		Category: "Volume",
		Overlay: false,
		Description: "Advance-decline ratio over the up-down volume ratio (Arms Index).",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Trin", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.up_down_volume_ratio",
		WasmClass: "UpDownVolumeRatio",
		Name: "Up/Down Volume Ratio",
		ShortName: "UDVR",
		Family: "Market Breadth",
		Category: "Volume",
		Overlay: false,
		Description: "Advancing volume divided by declining volume.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Up Down Volume Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerRiskPerformance() {
	c.add(IndicatorDescriptor{
		ID: "wickra.alpha",
		WasmClass: "Alpha",
		Name: "Alpha (Jensen)",
		ShortName: "Alpha",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Jensen's alpha — mean(asset) − (rf + Beta·(mean_bench − rf)).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("risk_free", "Risk Free", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Alpha", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.average_drawdown",
		WasmClass: "AverageDrawdown",
		Name: "Average Drawdown",
		ShortName: "AD",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Rolling mean drawdown depth (same as PainIndex).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Average Drawdown", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.burke_ratio",
		WasmClass: "BurkeRatio",
		Name: "Burke Ratio",
		ShortName: "BR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Return per unit of severe pain — mean return over the Euclidean norm of the equity-curve drawdowns.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Burke Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.calmar_ratio",
		WasmClass: "CalmarRatio",
		Name: "Calmar Ratio",
		ShortName: "CR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "mean(returns) / max_drawdown(equity) from window.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Calmar Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.common_sense_ratio",
		WasmClass: "CommonSenseRatio",
		Name: "Common Sense Ratio",
		ShortName: "CSR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "One number that must win on both fronts — the profit factor (the body) multiplied by the tail ratio (the extremes).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Common Sense Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.conditional_value_at_risk",
		WasmClass: "ConditionalValueAtRisk",
		Name: "Conditional Value at Risk (CVaR / Expected Shortfall)",
		ShortName: "CVAR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Mean of returns beyond VaR (Expected Shortfall).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("confidence", "Confidence", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Conditional Value At Risk", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.drawdown_duration",
		WasmClass: "DrawdownDuration",
		Name: "Drawdown Duration",
		ShortName: "DD",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Bars elapsed since all-time peak.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Drawdown Duration", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.expectancy",
		WasmClass: "Expectancy",
		Name: "Expectancy",
		ShortName: "EXPECT",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Expected return per unit of average loss (R-multiple).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Expectancy", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.gain_loss_ratio",
		WasmClass: "GainLossRatio",
		Name: "Gain / Loss Ratio",
		ShortName: "GLR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "mean(wins) / mean(|losses|).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Gain Loss Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.gain_to_pain_ratio",
		WasmClass: "GainToPainRatio",
		Name: "Gain To Pain Ratio",
		ShortName: "GTPR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Jack Schwager's return-per-unit-of-downside — the sum of all returns over the sum of the absolute losses.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Gain To Pain Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.information_ratio",
		WasmClass: "InformationRatio",
		Name: "Information Ratio (IR)",
		ShortName: "IR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "mean(active) / tracking_error.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Information Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.kratio",
		WasmClass: "KRatio",
		Name: "K Ratio",
		ShortName: "KRatio",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Kestner's consistency score — the slope of the cumulative-return curve divided by the standard error of that slope.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "K Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.kalman_hedge_ratio",
		WasmClass: "KalmanHedgeRatio",
		Name: "Kalman Hedge Ratio",
		ShortName: "KHR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Dynamic hedge ratio between two series via an online Kalman filter.",
		Inputs: []InputSchema{inputFloat("delta", "Delta", 1.0, 0.01, 1000.0, 0.1), inputFloat("observation_var", "Observation Var", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "hedgeRatio", Type: PlotTypeLine, Title: "hedgeRatio", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "intercept", Type: PlotTypeLine, Title: "intercept", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "spread", Type: PlotTypeLine, Title: "spread", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.kelly_criterion",
		WasmClass: "KellyCriterion",
		Name: "Kelly Criterion",
		ShortName: "KC",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Rolling Kelly fraction winrate − (1−winrate)/payoff_ratio.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Kelly Criterion", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.martin_ratio",
		WasmClass: "MartinRatio",
		Name: "Ulcer Performance Index",
		ShortName: "MR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "The Ulcer Performance Index — mean return over the Ulcer Index (the RMS of percentage drawdowns).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Martin Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.max_drawdown",
		WasmClass: "MaxDrawdown",
		Name: "Max Drawdown (MDD)",
		ShortName: "MD",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Rolling worst peak-to-trough decline.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Max Drawdown", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.oi_to_volume_ratio",
		WasmClass: "OiToVolumeRatio",
		Name: "Oi To Volume Ratio",
		ShortName: "OTVR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Open interest divided by traded volume — how much position is held versus turned over.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Oi To Volume Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.omega_ratio",
		WasmClass: "OmegaRatio",
		Name: "Omega Ratio",
		ShortName: "OR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Σ gains-above-threshold / Σ losses-below.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("threshold", "Threshold", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Omega Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.pain_index",
		WasmClass: "PainIndex",
		Name: "Pain Index",
		ShortName: "PI",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Mean drawdown depth (Becker).",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Pain Index", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.profit_factor",
		WasmClass: "ProfitFactor",
		Name: "Profit Factor",
		ShortName: "PF",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Σ positive / Σ |negative| over window.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Profit Factor", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.recovery_factor",
		WasmClass: "RecoveryFactor",
		Name: "Recovery Factor",
		ShortName: "RF",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Cumulative net_return / max_drawdown.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Recovery Factor", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.sharpe_ratio",
		WasmClass: "SharpeRatio",
		Name: "Sharpe Ratio",
		ShortName: "SR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "(mean - rf) / sample_stddev rolling.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("risk_free", "Risk Free", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Sharpe Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.sortino_ratio",
		WasmClass: "SortinoRatio",
		Name: "Sortino Ratio",
		ShortName: "SR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Sharpe with downside-only deviation.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("mar", "Mar", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Sortino Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.sterling_ratio",
		WasmClass: "SterlingRatio",
		Name: "Sterling Ratio",
		ShortName: "SR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Return per unit of typical pain — mean return over the average drawdown of the compounded equity curve.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Sterling Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.tail_ratio",
		WasmClass: "TailRatio",
		Name: "Tail Ratio",
		ShortName: "TR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "The fatness of the right tail against the left — the 95th percentile of returns over the absolute 5th percentile.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Tail Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.treynor_ratio",
		WasmClass: "TreynorRatio",
		Name: "Treynor Ratio",
		ShortName: "TR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "(mean_asset − rf) / Beta.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("risk_free", "Risk Free", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Treynor Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.upside_potential_ratio",
		WasmClass: "UpsidePotentialRatio",
		Name: "Upside Potential Ratio",
		ShortName: "UPR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "The Sortino purist's ratio — average outperformance above a threshold over the downside deviation below it.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("mar", "Mar", 1.0, 0.01, 1000.0, 0.1), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Upside Potential Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.variance_ratio",
		WasmClass: "VarianceRatio",
		Name: "Variance Ratio",
		ShortName: "VR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Lo–MacKinlay variance ratio of the spread a − b.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("q", "Q", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Variance Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.volatility_ratio",
		WasmClass: "VolatilityRatio",
		Name: "Volatility Ratio",
		ShortName: "VR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Schwager's Volatility Ratio — today's true range divided by the EMA of the prior true ranges; a reading above 2.0 marks a wide-ranging day.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Volatility Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.wick_ratio",
		WasmClass: "WickRatio",
		Name: "Wick Ratio",
		ShortName: "WR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Signed upper-vs-lower shadow imbalance over the range.",
		Inputs: []InputSchema{},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Wick Ratio", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.win_rate",
		WasmClass: "WinRate",
		Name: "Win Rate",
		ShortName: "WR",
		Family: "Risk / Performance",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Fraction of strictly-positive returns over period.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputSource("close")},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Win Rate", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
}

func (c *Catalog) registerSeasonalitySession() {
	c.add(IndicatorDescriptor{
		ID: "wickra.average_daily_range",
		WasmClass: "AverageDailyRange",
		Name: "Average Daily Range (ADR)",
		ShortName: "ADR",
		Family: "Seasonality & Session",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Mean high-low range of the last N completed sessions.",
		Inputs: []InputSchema{inputPeriod("period", "Period", 14, 1, 500), inputFloat("utc_offset_minutes", "Utc Offset Minutes", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Average Daily Range", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.overnight_gap",
		WasmClass: "OvernightGap",
		Name: "Overnight Gap",
		ShortName: "OG",
		Family: "Seasonality & Session",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Close-to-open return across the session boundary.",
		Inputs: []InputSchema{inputFloat("utc_offset_minutes", "Utc Offset Minutes", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Overnight Gap", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.overnight_intraday_return",
		WasmClass: "OvernightIntradayReturn",
		Name: "Overnight vs. Intraday Return",
		ShortName: "OIR",
		Family: "Seasonality & Session",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Splits the session return into overnight + intraday legs.",
		Inputs: []InputSchema{inputFloat("utc_offset_minutes", "Utc Offset Minutes", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "overnight", Type: PlotTypeLine, Title: "overnight", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "intraday", Type: PlotTypeLine, Title: "intraday", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.seasonal_zscore",
		WasmClass: "SeasonalZScore",
		Name: "Seasonal Z-Score",
		ShortName: "SZS",
		Family: "Seasonality & Session",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Z-score of the current return vs the same hour-of-day history.",
		Inputs: []InputSchema{inputFloat("utc_offset_minutes", "Utc Offset Minutes", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Seasonal Z Score", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.session_high_low",
		WasmClass: "SessionHighLow",
		Name: "Session High/Low",
		ShortName: "SHL",
		Family: "Seasonality & Session",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Running high / low of the current session.",
		Inputs: []InputSchema{inputFloat("utc_offset_minutes", "Utc Offset Minutes", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "high", Type: PlotTypeLine, Title: "high", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "low", Type: PlotTypeLine, Title: "low", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.session_range",
		WasmClass: "SessionRange",
		Name: "Session Range",
		ShortName: "SR",
		Family: "Seasonality & Session",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Per-session (Asia / EU / US) high-low range.",
		Inputs: []InputSchema{inputFloat("utc_offset_minutes", "Utc Offset Minutes", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "asia", Type: PlotTypeLine, Title: "asia", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "eu", Type: PlotTypeLine, Title: "eu", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}, PlotDirective{ID: "us", Type: PlotTypeLine, Title: "us", Color: "#2962FF", LineWidth: 1, LineStyle: LineStyleSolid, Visible: true}},
	})
	c.add(IndicatorDescriptor{
		ID: "wickra.turn_of_month",
		WasmClass: "TurnOfMonth",
		Name: "Turn-of-Month Effect",
		ShortName: "TOM",
		Family: "Seasonality & Session",
		Category: "Statistics & Risk",
		Overlay: false,
		Description: "Mean daily return inside the turn-of-month window.",
		Inputs: []InputSchema{inputFloat("n_first", "N First", 1.0, 0.01, 1000.0, 0.1), inputFloat("n_last", "N Last", 1.0, 0.01, 1000.0, 0.1), inputFloat("utc_offset_minutes", "Utc Offset Minutes", 1.0, 0.01, 1000.0, 0.1)},
		Plots: []PlotDirective{PlotDirective{ID: "plot", Type: PlotTypeLine, Title: "Turn Of Month", Color: "#7E57C2", LineWidth: 2, LineStyle: LineStyleSolid, Visible: true}},
	})
}
