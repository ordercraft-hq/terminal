package datafeed

import (
	"context"
)

// Candle represents an OHLCV candlestick with timestamp in seconds (UTC).
type Candle struct {
	Time   int64   `json:"time"`   // Unix timestamp in seconds
	Open   float64 `json:"open"`
	High   float64 `json:"high"`
	Low    float64 `json:"low"`
	Close  float64 `json:"close"`
	Volume float64 `json:"volume"`
}

// SymbolInfo describes an instrument returned by search or resolve.
type SymbolInfo struct {
	Symbol      string `json:"symbol"`       // e.g. "BTCUSDT"
	FullSymbol  string `json:"full_symbol"`  // e.g. "BINANCE:BTCUSDT"
	Description string `json:"description"`  // e.g. "Bitcoin / Tether USD"
	Exchange    string `json:"exchange"`     // e.g. "BINANCE"
	Type        string `json:"type"`         // e.g. "crypto", "forex", "stock", "index"
	PriceScale  int    `json:"price_scale"`  // e.g. 100 for 2 decimals, 10000 for 4 decimals
}

// DataProvider is the clean interface every exchange or feed adapter implements.
type DataProvider interface {
	Name() string
	SupportedResolutions() []string
	GetHistory(ctx context.Context, symbol, resolution string, from, to int64, count int) ([]Candle, error)
	Search(ctx context.Context, query string) ([]SymbolInfo, error)
	Subscribe(ctx context.Context, symbol, resolution string, onCandle func(c Candle)) error
	Unsubscribe(symbol, resolution string) error
}

// DataTier represents the capability level of the market data provider.
type DataTier string

const (
	DataTierL1 DataTier = "L1" // OHLCV Candles only
	DataTierL2 DataTier = "L2" // Ticks, Orderbook Depth, Footprint
)

// L2DataProvider extends DataProvider for Level 2 market depth and tick trade flow.
type L2DataProvider interface {
	DataProvider
	GetDataTier() DataTier
	SubscribeTicks(ctx context.Context, symbol string, onTick func(t TickData)) error
	UnsubscribeTicks(symbol string) error
	SubscribeDepth(ctx context.Context, symbol string, onDepth func(d OrderBookDepth)) error
	UnsubscribeDepth(symbol string) error
	GetFootprintHistory(ctx context.Context, symbol, resolution string, from, to int64, count int) ([]FootprintBar, error)
	SubscribeFootprint(ctx context.Context, symbol, resolution string, onFootprint func(f FootprintBar)) error
	UnsubscribeFootprint(symbol, resolution string) error
}
