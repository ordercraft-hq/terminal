package datafeed

import (
	"math"
	"strconv"
	"strings"
)

// ResolutionToSeconds converts resolution strings into second durations.
// Examples: "1s" -> 1, "15s" -> 15, "1m" -> 60, "3m" -> 180, "15m" -> 900, "1h" -> 3600, "1D" -> 86400.
func ResolutionToSeconds(res string) int64 {
	clean := strings.TrimSpace(res)
	if clean == "" {
		return 60
	}

	// Month is uppercase 'M' or '1M' or '1MON'
	if clean == "M" || clean == "1M" || strings.EqualFold(clean, "1MON") || strings.EqualFold(clean, "1MONTH") {
		return 2592000
	}
	if strings.EqualFold(clean, "D") || strings.EqualFold(clean, "1D") {
		return 86400
	}
	if strings.EqualFold(clean, "W") || strings.EqualFold(clean, "1W") {
		return 604800
	}

	lower := strings.ToLower(clean)
	if strings.HasSuffix(lower, "s") {
		num, err := strconv.ParseInt(strings.TrimSuffix(lower, "s"), 10, 64)
		if err == nil && num > 0 {
			return num
		}
	}
	if strings.HasSuffix(lower, "m") {
		num, err := strconv.ParseInt(strings.TrimSuffix(lower, "m"), 10, 64)
		if err == nil && num > 0 {
			return num * 60
		}
	}
	if strings.HasSuffix(lower, "h") {
		num, err := strconv.ParseInt(strings.TrimSuffix(lower, "h"), 10, 64)
		if err == nil && num > 0 {
			return num * 3600
		}
	}

	// Plain number defaults to minutes
	num, err := strconv.ParseInt(clean, 10, 64)
	if err == nil && num > 0 {
		return num * 60
	}

	return 60
}

// AggregateCandles aggregates base resolution candles into target resolution candles.
// For example, aggregates 1m candles into 3m, 5m, 15m, 1h, etc.
func AggregateCandles(candles []Candle, targetStepSec int64) []Candle {
	if len(candles) == 0 || targetStepSec <= 0 {
		return candles
	}

	var aggregated []Candle
	var current *Candle
	var currentBucket int64 = -1

	for _, c := range candles {
		bucket := (c.Time / targetStepSec) * targetStepSec

		if current == nil || bucket != currentBucket {
			if current != nil {
				aggregated = append(aggregated, *current)
			}
			currentBucket = bucket
			current = &Candle{
				Time:   bucket,
				Open:   c.Open,
				High:   c.High,
				Low:    c.Low,
				Close:  c.Close,
				Volume: c.Volume,
			}
		} else {
			if c.High > current.High {
				current.High = c.High
			}
			if c.Low < current.Low {
				current.Low = c.Low
			}
			current.Close = c.Close
			current.Volume += c.Volume
		}
	}

	if current != nil {
		aggregated = append(aggregated, *current)
	}

	return aggregated
}

// LiveAggregator maintains an in-progress candle for a target timeframe from incoming ticks or smaller bars.
type LiveAggregator struct {
	targetStepSec int64
	current       *Candle
}

// NewLiveAggregator creates a new live aggregator for the given target resolution.
func NewLiveAggregator(resolution string) *LiveAggregator {
	return &LiveAggregator{
		targetStepSec: ResolutionToSeconds(resolution),
	}
}

// UpdateTick updates the current bar with a tick price and timestamp.
// Returns the updated candle.
func (a *LiveAggregator) UpdateTick(price float64, timeSec int64) Candle {
	bucket := (timeSec / a.targetStepSec) * a.targetStepSec

	if a.current == nil || bucket > a.current.Time {
		a.current = &Candle{
			Time:   bucket,
			Open:   price,
			High:   price,
			Low:    price,
			Close:  price,
			Volume: 1,
		}
	} else {
		if price > a.current.High {
			a.current.High = price
		}
		if price < a.current.Low {
			a.current.Low = price
		}
		a.current.Close = price
		a.current.Volume++
	}

	return *a.current
}

// UpdateCandle merges an incoming smaller candle into the target bar.
func (a *LiveAggregator) UpdateCandle(c Candle) Candle {
	bucket := (c.Time / a.targetStepSec) * a.targetStepSec

	if a.current == nil || bucket > a.current.Time {
		a.current = &Candle{
			Time:   bucket,
			Open:   c.Open,
			High:   c.High,
			Low:    c.Low,
			Close:  c.Close,
			Volume: c.Volume,
		}
	} else if bucket == a.current.Time {
		if c.High > a.current.High {
			a.current.High = c.High
		}
		if c.Low < a.current.Low {
			a.current.Low = c.Low
		}
		a.current.Close = c.Close
		a.current.Volume += c.Volume
	}

	// Sanity check to avoid NaN/Inf
	if math.IsNaN(a.current.High) || math.IsInf(a.current.High, 0) {
		a.current.High = a.current.Close
	}
	if math.IsNaN(a.current.Low) || math.IsInf(a.current.Low, 0) {
		a.current.Low = a.current.Close
	}

	return *a.current
}
