package wickra

import "context"

// InputType defines the data type of an indicator configuration input.
type InputType string

const (
	InputTypeInteger InputType = "integer"
	InputTypeFloat   InputType = "float"
	InputTypeSource  InputType = "source"
	InputTypeBoolean InputType = "boolean"
	InputTypeSelect  InputType = "select"
	InputTypeString  InputType = "string"
)

// SelectOption defines a discrete value option for select inputs.
type SelectOption struct {
	Label string      `json:"label"`
	Value interface{} `json:"value"`
}

// InputSchema defines a configurable input parameter for an indicator.
type InputSchema struct {
	ID      string         `json:"id"`
	Name    string         `json:"name"`
	Type    InputType      `json:"type"`
	Default interface{}    `json:"default"`
	Min     *float64       `json:"min,omitempty"`
	Max     *float64       `json:"max,omitempty"`
	Step    *float64       `json:"step,omitempty"`
	Options []SelectOption `json:"options,omitempty"`
}

// PlotType defines how a plot stream is rendered in lightweight-charts.
type PlotType string

const (
	PlotTypeLine      PlotType = "line"
	PlotTypeStepLine  PlotType = "stepline"
	PlotTypeHistogram PlotType = "histogram"
	PlotTypeCross     PlotType = "cross"
	PlotTypeCircles   PlotType = "circles"
	PlotTypeBandFill  PlotType = "band_fill"
	PlotTypeMarker    PlotType = "marker"
	PlotTypeFootprint PlotType = "footprint"
)

// LineStyle defines stroke style for lines.
type LineStyle string

const (
	LineStyleSolid  LineStyle = "solid"
	LineStyleDashed LineStyle = "dashed"
	LineStyleDotted LineStyle = "dotted"
)

// PlotDirective defines a visual series rendered on the chart for this indicator.
type PlotDirective struct {
	ID               string    `json:"id"`
	Type             PlotType  `json:"type"`
	Title            string    `json:"title"`
	Color            string    `json:"color"`
	ColorUp          string    `json:"colorUp,omitempty"`
	ColorDown        string    `json:"colorDown,omitempty"`
	LineWidth        int       `json:"lineWidth,omitempty"`
	LineStyle        LineStyle `json:"lineStyle,omitempty"`
	Visible          bool      `json:"visible"`
	LastValueVisible bool      `json:"lastValueVisible,omitempty"`
	PriceLineVisible bool      `json:"priceLineVisible,omitempty"`
	Overlay          *bool     `json:"overlay,omitempty"`
}

// BandDirective defines a shaded area between two plot lines (e.g. Bollinger Bands).
type BandDirective struct {
	ID          string `json:"id"`
	Title       string `json:"title,omitempty"`
	UpperPlotID string `json:"upperPlotId"`
	LowerPlotID string `json:"lowerPlotId"`
	FillColor   string `json:"fillColor"`
	Visible     bool   `json:"visible"`
}

// LevelDirective defines a horizontal reference level (e.g. RSI 70/30).
type LevelDirective struct {
	Value     float64   `json:"value"`
	Color     string    `json:"color"`
	LineStyle LineStyle `json:"lineStyle,omitempty"`
	LineWidth int       `json:"lineWidth,omitempty"`
	Label     string    `json:"label,omitempty"`
	Visible   bool      `json:"visible"`
}

// IndicatorDescriptor is the complete metadata record for an indicator in the catalog.
type IndicatorDescriptor struct {
	ID           string           `json:"id"`
	WasmClass    string           `json:"wasmClass"`
	Name         string           `json:"name"`
	ShortName    string           `json:"shortName"`
	Family       string           `json:"family"`
	Category     string           `json:"category"`
	Overlay      bool             `json:"overlay"`
	Description  string           `json:"description"`
	Inputs       []InputSchema    `json:"inputs"`
	Plots        []PlotDirective  `json:"plots"`
	Bands        []BandDirective  `json:"bands,omitempty"`
	Levels       []LevelDirective `json:"levels,omitempty"`
	WarmupPeriod int              `json:"warmupPeriod,omitempty"`
	PriceSources []string         `json:"priceSources,omitempty"`
}

// CandleData represents an OHLCV candle for batch indicator evaluation.
type CandleData struct {
	Time   int64   `json:"time"`
	Open   float64 `json:"open"`
	High   float64 `json:"high"`
	Low    float64 `json:"low"`
	Close  float64 `json:"close"`
	Volume float64 `json:"volume"`
}

// EvalIndicatorInstance specifies an indicator instance to evaluate.
type EvalIndicatorInstance struct {
	InstanceID  string                 `json:"instanceId"`
	IndicatorID string                 `json:"indicatorId"`
	Inputs      map[string]interface{} `json:"inputs"`
}

// EvalRequest is the payload for POST /api/indicators/eval.
type EvalRequest struct {
	Symbol     string                  `json:"symbol"`
	Resolution string                  `json:"resolution"`
	Candles    []CandleData            `json:"candles"`
	Indicators []EvalIndicatorInstance `json:"indicators"`
}

// SeriesPoint is a timestamped value for a plot series.
type SeriesPoint struct {
	Time  int64   `json:"time"`
	Value float64 `json:"value"`
	Color string  `json:"color,omitempty"`
}

// EvalResult holds the computed plot points for an indicator instance.
type EvalResult struct {
	InstanceID  string                   `json:"instanceId"`
	IndicatorID string                   `json:"indicatorId"`
	Plots       map[string][]SeriesPoint `json:"plots"`
}

// EvalResponse is the response body for POST /api/indicators/eval.
type EvalResponse struct {
	Results []EvalResult `json:"results"`
}

// CatalogResponse is the response body for GET /api/indicators/catalog.
type CatalogResponse struct {
	Indicators []IndicatorDescriptor `json:"indicators"`
}

// StreamSubscribeMessage is sent by client over WebSocket to subscribe to indicators.
type StreamSubscribeMessage struct {
	Action     string                  `json:"action"` // "subscribe" or "unsubscribe"
	Symbol     string                  `json:"symbol"`
	Resolution string                  `json:"resolution"`
	Indicators []EvalIndicatorInstance `json:"indicators"`
}

// IndicatorSession provides streaming update steps for subscribed indicators.
type IndicatorSession interface {
	Update(ctx context.Context, c CandleData) (map[string]map[string]float64, error)
	Close(ctx context.Context) error
}

// StreamUpdateMessage is emitted over WebSocket on live market ticks.
type StreamUpdateMessage struct {
	Type       string                         `json:"type"` // "indicator_update"
	Symbol     string                         `json:"symbol"`
	Resolution string                         `json:"resolution"`
	Time       int64                          `json:"time"`
	Plots      map[string]map[string]float64 `json:"plots"` // instanceId -> plotId -> value
}
