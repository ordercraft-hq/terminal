package datafeed

import (
	"math"
	"sort"
	"sync"
)

// TickSide represents the aggressor side of an executed trade.
type TickSide string

const (
	TickSideBuy     TickSide = "buy"     // Aggressor lifted the ask (market buy)
	TickSideSell    TickSide = "sell"    // Aggressor hit the bid (market sell)
	TickSideUnknown TickSide = "unknown" // Indeterminate aggressor side
)

// TickData represents a single normalized market execution tick.
type TickData struct {
	Time     int64    `json:"time"`                // Unix timestamp in seconds (UTC)
	TimeNano int64    `json:"time_nano,omitempty"` // Unix timestamp in nanoseconds (UTC)
	Price    float64  `json:"price"`               // Execution price
	Volume   float64  `json:"volume"`              // Execution quantity/size
	Side     TickSide `json:"side"`                // "buy", "sell", or "unknown"
	Symbol   string   `json:"symbol,omitempty"`    // Full symbol identifier (e.g. "BINANCE:BTCUSDT")
	TradeID  string   `json:"trade_id,omitempty"`  // Exchange match/trade ID
}

// DeltaBar captures the buyer and seller volume distribution and delta for a candle period.
type DeltaBar struct {
	Time       int64   `json:"time"`        // Period start timestamp in seconds (UTC)
	Open       float64 `json:"open"`        // Open price
	High       float64 `json:"high"`        // High price
	Low        float64 `json:"low"`         // Low price
	Close      float64 `json:"close"`       // Close price
	Volume     float64 `json:"volume"`      // Total traded volume
	BidVolume  float64 `json:"bid_volume"`  // Aggressor sell volume hitting the bid
	AskVolume  float64 `json:"ask_volume"`  // Aggressor buy volume lifting the ask
	Delta      float64 `json:"delta"`       // Volume Delta = AskVolume - BidVolume
	Cumulative float64 `json:"cumulative"`  // Cumulative Volume Delta (CVD) running total
	MinDelta   float64 `json:"min_delta"`   // Minimum intra-bar delta reached
	MaxDelta   float64 `json:"max_delta"`   // Maximum intra-bar delta reached
}

// FootprintPriceLevel records bid and ask volume at a discrete price tier.
type FootprintPriceLevel struct {
	Price       float64 `json:"price"`        // Discretized price tier
	BidVolume   float64 `json:"bid_volume"`   // Aggressor sell volume
	AskVolume   float64 `json:"ask_volume"`   // Aggressor buy volume
	TotalVolume float64 `json:"total_volume"` // BidVolume + AskVolume
	Delta       float64 `json:"delta"`        // AskVolume - BidVolume
	Imbalance   bool    `json:"imbalance"`    // True if Ask/Bid exceeds imbalance ratio
}

// FootprintBar represents an orderflow cluster footprint profile for a candle.
type FootprintBar struct {
	Time        int64                 `json:"time"`        // Period start timestamp in seconds (UTC)
	Resolution  string                `json:"resolution"`  // Candle timeframe resolution (e.g. "5m")
	Candle      Candle                `json:"candle"`      // Underlying OHLCV candle
	Levels      []FootprintPriceLevel `json:"levels"`      // Price levels sorted ascending by price
	TotalBid    float64               `json:"total_bid"`   // Aggregate bid volume in bar
	TotalAsk    float64               `json:"total_ask"`   // Aggregate ask volume in bar
	TotalDelta  float64               `json:"total_delta"` // TotalAsk - TotalBid
	POC         float64               `json:"poc"`         // Point of Control (highest volume price)
	POCVolume   float64               `json:"poc_volume"`  // Total volume traded at POC
	VAH         float64               `json:"vah"`         // Value Area High (70% volume containment)
	VAL         float64               `json:"val"`         // Value Area Low (70% volume containment)
}

// DeltaAggregator aggregates live ticks into DeltaBar and FootprintBar structures.
type DeltaAggregator struct {
	mu             sync.Mutex
	targetStepSec  int64
	tickSize       float64
	imbalanceRatio float64 // default 3.0 (300%)
	runningCVD     float64
	lastPrice      float64
	lastSide       TickSide

	currentBar *DeltaBar
	levelsMap  map[int64]*FootprintPriceLevel // quantized price int -> level
}

// NewDeltaAggregator creates a stateful delta and footprint aggregator.
func NewDeltaAggregator(resolution string, tickSize float64) *DeltaAggregator {
	step := ResolutionToSeconds(resolution)
	if step <= 0 {
		step = 60
	}
	if tickSize <= 0 {
		tickSize = 0.01
	}
	return &DeltaAggregator{
		targetStepSec:  step,
		tickSize:       tickSize,
		imbalanceRatio: 3.0,
		levelsMap:      make(map[int64]*FootprintPriceLevel),
		lastSide:       TickSideUnknown,
	}
}

// UpdateTick incorporates an incoming execution tick and returns the updated DeltaBar.
func (a *DeltaAggregator) UpdateTick(t TickData) DeltaBar {
	a.mu.Lock()
	defer a.mu.Unlock()

	bucket := (t.Time / a.targetStepSec) * a.targetStepSec

	// Classify side via tick rule if unknown
	side := t.Side
	if side == TickSideUnknown {
		if a.lastPrice > 0 {
			if t.Price > a.lastPrice {
				side = TickSideBuy
			} else if t.Price < a.lastPrice {
				side = TickSideSell
			} else {
				side = a.lastSide
			}
		} else {
			side = TickSideBuy
		}
	}
	a.lastPrice = t.Price
	a.lastSide = side

	var bidVol, askVol float64
	if side == TickSideBuy {
		askVol = t.Volume
	} else {
		bidVol = t.Volume
	}
	tickDelta := askVol - bidVol

	if a.currentBar == nil || bucket > a.currentBar.Time {
		// New bar
		a.runningCVD += tickDelta
		a.currentBar = &DeltaBar{
			Time:       bucket,
			Open:       t.Price,
			High:       t.Price,
			Low:        t.Price,
			Close:      t.Price,
			Volume:     t.Volume,
			BidVolume:  bidVol,
			AskVolume:  askVol,
			Delta:      tickDelta,
			Cumulative: a.runningCVD,
			MinDelta:   math.Min(0, tickDelta),
			MaxDelta:   math.Max(0, tickDelta),
		}
		a.levelsMap = make(map[int64]*FootprintPriceLevel)
	} else {
		// Existing bar update
		if t.Price > a.currentBar.High {
			a.currentBar.High = t.Price
		}
		if t.Price < a.currentBar.Low {
			a.currentBar.Low = t.Price
		}
		a.currentBar.Close = t.Price
		a.currentBar.Volume += t.Volume
		a.currentBar.BidVolume += bidVol
		a.currentBar.AskVolume += askVol
		a.currentBar.Delta = a.currentBar.AskVolume - a.currentBar.BidVolume
		a.runningCVD += tickDelta
		a.currentBar.Cumulative = a.runningCVD
		if a.currentBar.Delta < a.currentBar.MinDelta {
			a.currentBar.MinDelta = a.currentBar.Delta
		}
		if a.currentBar.Delta > a.currentBar.MaxDelta {
			a.currentBar.MaxDelta = a.currentBar.Delta
		}
	}

	// Update footprint level
	priceTier := int64(math.Round(t.Price / a.tickSize))
	lvl, exists := a.levelsMap[priceTier]
	if !exists {
		lvl = &FootprintPriceLevel{
			Price: float64(priceTier) * a.tickSize,
		}
		a.levelsMap[priceTier] = lvl
	}
	lvl.BidVolume += bidVol
	lvl.AskVolume += askVol
	lvl.TotalVolume += t.Volume
	lvl.Delta = lvl.AskVolume - lvl.BidVolume

	return *a.currentBar
}

// GetFootprintBar calculates the POC, VAH, and VAL from the active cluster levels.
func (a *DeltaAggregator) GetFootprintBar(resolution string) FootprintBar {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.currentBar == nil {
		return FootprintBar{Resolution: resolution}
	}

	levels := make([]FootprintPriceLevel, 0, len(a.levelsMap))
	var totalBid, totalAsk, totalVol float64
	var pocPrice, maxVol float64

	for _, lvl := range a.levelsMap {
		levels = append(levels, *lvl)
		totalBid += lvl.BidVolume
		totalAsk += lvl.AskVolume
		totalVol += lvl.TotalVolume
		if lvl.TotalVolume > maxVol {
			maxVol = lvl.TotalVolume
			pocPrice = lvl.Price
		}
	}

	// Sort ascending by price
	sort.Slice(levels, func(i, j int) bool {
		return levels[i].Price < levels[j].Price
	})

	// Check diagonal imbalances (e.g. Ask[i] >= 3.0 * Bid[i-1])
	for i := range levels {
		if i > 0 && levels[i-1].BidVolume > 0 {
			if levels[i].AskVolume >= levels[i-1].BidVolume*a.imbalanceRatio {
				levels[i].Imbalance = true
			}
		}
		if i < len(levels)-1 && levels[i+1].AskVolume > 0 {
			if levels[i].BidVolume >= levels[i+1].AskVolume*a.imbalanceRatio {
				levels[i].Imbalance = true
			}
		}
	}

	// Compute Value Area (70% total volume containment around POC)
	targetVAVolume := totalVol * 0.70
	accumVol := maxVol
	pocIdx := 0
	for i, l := range levels {
		if l.Price == pocPrice {
			pocIdx = i
			break
		}
	}

	upIdx := pocIdx + 1
	downIdx := pocIdx - 1
	vah := pocPrice
	val := pocPrice

	for accumVol < targetVAVolume && (upIdx < len(levels) || downIdx >= 0) {
		var nextUpVol, nextDownVol float64
		if upIdx < len(levels) {
			nextUpVol = levels[upIdx].TotalVolume
		}
		if downIdx >= 0 {
			nextDownVol = levels[downIdx].TotalVolume
		}

		if nextUpVol >= nextDownVol && upIdx < len(levels) {
			accumVol += nextUpVol
			vah = levels[upIdx].Price
			upIdx++
		} else if downIdx >= 0 {
			accumVol += nextDownVol
			val = levels[downIdx].Price
			downIdx--
		} else if upIdx < len(levels) {
			accumVol += nextUpVol
			vah = levels[upIdx].Price
			upIdx++
		}
	}

	return FootprintBar{
		Time:       a.currentBar.Time,
		Resolution: resolution,
		Candle: Candle{
			Time:   a.currentBar.Time,
			Open:   a.currentBar.Open,
			High:   a.currentBar.High,
			Low:    a.currentBar.Low,
			Close:  a.currentBar.Close,
			Volume: a.currentBar.Volume,
		},
		Levels:     levels,
		TotalBid:   totalBid,
		TotalAsk:   totalAsk,
		TotalDelta: totalAsk - totalBid,
		POC:        pocPrice,
		POCVolume:  maxVol,
		VAH:        vah,
		VAL:        val,
	}
}
