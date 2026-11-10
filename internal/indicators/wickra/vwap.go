package wickra

import (
	"context"
	"math"
	"strings"
	"time"
)

// VWAPCalculator computes Volume Weighted Average Price with periodic/session resets
// and configurable standard deviation bands.
type VWAPCalculator struct {
	AnchorPeriod string  // "session", "day", "week", "month", "year", "quarter", "decade", "century"
	Source       string  // "hlc3", "close", "open", "high", "low", "hl2", "ohlc4"
	BandsMode    string  // "stdev" (default) or "percentage"
	Multiplier1  float64 // Multiplier for Band 1 (default 1.0)
	Multiplier2  float64 // Multiplier for Band 2 (default 2.0)
	Multiplier3  float64 // Multiplier for Band 3 (default 3.0)
	Offset       int64

	// Incremental accumulator state
	prevTime      time.Time
	cumVolume     float64
	cumPriceVol   float64
	cumPriceSqVol float64
	lastVWAP      float64
	lastSigma     float64
}

// NewVWAPCalculator initializes a VWAPCalculator from configuration inputs.
func NewVWAPCalculator(inputs map[string]any) *VWAPCalculator {
	anchor := "session"
	if a, ok := inputs["anchor_period"].(string); ok && a != "" {
		anchor = a
	} else if a, ok := inputs["anchor"].(string); ok && a != "" {
		anchor = a
	}

	source := "hlc3"
	if s, ok := inputs["source"].(string); ok && s != "" {
		source = s
	}

	bandsMode := "stdev"
	if m, ok := inputs["bands_calculation_mode"].(string); ok && m != "" {
		bandsMode = strings.ToLower(strings.TrimSpace(m))
	} else if m, ok := inputs["bands_mode"].(string); ok && m != "" {
		bandsMode = strings.ToLower(strings.TrimSpace(m))
	}

	mult1 := getMultiplier(inputs, 1.0, "bands_multiplier_1", "multiplier_1", "multiplier1", "mult1")
	mult2 := getMultiplier(inputs, 2.0, "bands_multiplier_2", "multiplier_2", "multiplier2", "mult2")
	mult3 := getMultiplier(inputs, 3.0, "bands_multiplier_3", "multiplier_3", "multiplier3", "mult3")

	var offset int64 = 0
	if off, ok := inputs["offset"]; ok {
		offset = int64(toInt(off))
	}

	return &VWAPCalculator{
		AnchorPeriod: anchor,
		Source:       source,
		BandsMode:    bandsMode,
		Multiplier1:  mult1,
		Multiplier2:  mult2,
		Multiplier3:  mult3,
		Offset:       offset,
	}
}

func getMultiplier(inputs map[string]any, defaultVal float64, keys ...string) float64 {
	for _, k := range keys {
		if v, ok := inputs[k]; ok && v != nil {
			switch n := v.(type) {
			case float64:
				if n > 0 {
					return n
				}
			case float32:
				if n > 0 {
					return float64(n)
				}
			case int:
				if n > 0 {
					return float64(n)
				}
			case int32:
				if n > 0 {
					return float64(n)
				}
			case int64:
				if n > 0 {
					return float64(n)
				}
			}
		}
	}
	return defaultVal
}

// Reset resets the running accumulator state.
func (v *VWAPCalculator) Reset() {
	v.prevTime = time.Time{}
	v.cumVolume = 0
	v.cumPriceVol = 0
	v.cumPriceSqVol = 0
	v.lastVWAP = 0
	v.lastSigma = 0
}

// isNewVWAPPeriod checks if the timestamp crosses the boundary of the configured anchor period.
func isNewVWAPPeriod(anchor string, prevTime, currTime time.Time) bool {
	if prevTime.IsZero() || !currTime.After(prevTime) {
		return false
	}
	norm := strings.ToLower(strings.TrimSpace(anchor))
	switch norm {
	case "week":
		prevYear, prevWeek := prevTime.ISOWeek()
		currYear, currWeek := currTime.ISOWeek()
		return prevYear != currYear || prevWeek != currWeek
	case "month":
		return prevTime.Year() != currTime.Year() || prevTime.Month() != currTime.Month()
	case "year":
		return prevTime.Year() != currTime.Year()
	case "quarter":
		prevQ := (int(prevTime.Month()) - 1) / 3
		currQ := (int(currTime.Month()) - 1) / 3
		return prevTime.Year() != currTime.Year() || prevQ != currQ
	case "decade":
		return prevTime.Year()/10 != currTime.Year()/10
	case "century":
		return prevTime.Year()/100 != currTime.Year()/100
	case "session", "day", "session_utc", "":
		// Default to calendar day (00:00 UTC)
		return prevTime.Year() != currTime.Year() || prevTime.YearDay() != currTime.YearDay()
	default:
		return prevTime.Year() != currTime.Year() || prevTime.YearDay() != currTime.YearDay()
	}
}

// extractPrice extracts typical price according to the configured source.
func extractPrice(source string, open, high, low, close float64) float64 {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case "open":
		return open
	case "high":
		return high
	case "low":
		return low
	case "close":
		return close
	case "hl2", "median":
		return (high + low) / 2.0
	case "ohlc4":
		return (open + high + low + close) / 4.0
	case "weighted", "hlcc4":
		return (high + low + 2.0*close) / 4.0
	case "hlc3", "typical", "":
		return (high + low + close) / 3.0
	default:
		return (high + low + close) / 3.0
	}
}

// Step processes a single candle and updates incremental state.
// Returns a map containing all plot values: plot (VWAP), upper_1, lower_1, upper_2, lower_2, upper_3, lower_3, stddev.
func (v *VWAPCalculator) Step(c CandleData) map[string]float64 {
	currTime := time.Unix(c.Time, 0).UTC()

	// Check if this candle begins a new anchor period
	if isNewVWAPPeriod(v.AnchorPeriod, v.prevTime, currTime) {
		v.cumVolume = 0
		v.cumPriceVol = 0
		v.cumPriceSqVol = 0
		v.lastVWAP = 0
		v.lastSigma = 0
	}
	v.prevTime = currTime

	price := extractPrice(v.Source, c.Open, c.High, c.Low, c.Close)
	vol := c.Volume
	if vol < 0 || math.IsNaN(vol) || math.IsInf(vol, 0) {
		vol = 0
	}

	if vol > 0 {
		v.cumVolume += vol
		v.cumPriceVol += price * vol
		v.cumPriceSqVol += price * price * vol
	}

	var vwap float64
	var sigma float64

	if v.cumVolume > 0 {
		vwap = v.cumPriceVol / v.cumVolume
		// Variance: sigma^2 = (sum(V * P^2) / sum(V)) - VWAP^2
		variance := (v.cumPriceSqVol / v.cumVolume) - (vwap * vwap)
		if variance < 1e-12 {
			variance = 0
		}
		sigma = math.Sqrt(variance)
		v.lastVWAP = vwap
		v.lastSigma = sigma
	} else {
		// Zero cumulative volume: fallback to current typical price and 0 variance
		vwap = price
		sigma = 0
		if v.lastVWAP != 0 {
			vwap = v.lastVWAP
			sigma = v.lastSigma
		}
	}

	var u1, l1, u2, l2, u3, l3 float64
	if v.BandsMode == "percentage" || v.BandsMode == "percent" {
		u1 = vwap * (1.0 + v.Multiplier1/100.0)
		l1 = vwap * (1.0 - v.Multiplier1/100.0)
		u2 = vwap * (1.0 + v.Multiplier2/100.0)
		l2 = vwap * (1.0 - v.Multiplier2/100.0)
		u3 = vwap * (1.0 + v.Multiplier3/100.0)
		l3 = vwap * (1.0 - v.Multiplier3/100.0)
	} else {
		u1 = vwap + v.Multiplier1*sigma
		l1 = vwap - v.Multiplier1*sigma
		u2 = vwap + v.Multiplier2*sigma
		l2 = vwap - v.Multiplier2*sigma
		u3 = vwap + v.Multiplier3*sigma
		l3 = vwap - v.Multiplier3*sigma
	}

	return map[string]float64{
		"plot":    vwap,
		"upper_1": u1,
		"lower_1": l1,
		"upper":   u1, // alias for backwards compatibility
		"lower":   l1, // alias for backwards compatibility
		"upper_2": u2,
		"lower_2": l2,
		"upper_3": u3,
		"lower_3": l3,
		"stddev":  sigma,
	}
}

// NewVWAPIndicatorInstance creates a wickra.IndicatorInstance powered by the pure-Go VWAPCalculator.
func NewVWAPIndicatorInstance(desc *IndicatorDescriptor, inputs map[string]any) *IndicatorInstance {
	calc := NewVWAPCalculator(inputs)
	return &IndicatorInstance{
		isMulti: true,
		desc:    desc,
		source:  calc.Source,
		customUpdate: func(ctx context.Context, candle CandleData) (float64, map[string]float64, bool, error) {
			plots := calc.Step(candle)
			return plots["plot"], plots, true, nil
		},
		customFree: func(ctx context.Context) {
			calc.Reset()
		},
	}
}
