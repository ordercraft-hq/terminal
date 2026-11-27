// ORDERCRAFT Dynamic Technical Indicator Type System
// Strictly adheres to AGENTS.md § 3.2: strict: true, ZERO any types allowed.

/**
 * Dynamic indicator identifier (e.g. "wickra.sma", "wickra.rsi", "wickra.volume").
 * Replaces the legacy static 19-union type with an open string type to support 500+ indicators.
 */
export type IndicatorId = string;

/**
 * Type alias for backward compatibility across existing store and modal code.
 */
export type IndicatorType = IndicatorId;

/**
 * UI Category of the indicator:
 * - 8 dynamic Wickra catalog categories:
 *   'Trend & Overlays' | 'Oscillators' | 'Volatility & Bands' | 'Volume' |
 *   'DSP & Cycles' | 'Orderflow & Microstructure' | 'Patterns & Drawings' | 'Statistics & Risk'
 * - Legacy layout categories: 'overlay' | 'subpane'
 */
export type IndicatorCategory =
  | 'overlay'
  | 'subpane'
  | 'Trend & Overlays'
  | 'Oscillators'
  | 'Volatility & Bands'
  | 'Volume'
  | 'DSP & Cycles'
  | 'Orderflow & Microstructure'
  | 'Patterns & Drawings'
  | 'Statistics & Risk'
  | string;

export type IndicatorPaneType = 'overlay' | 'subpane';

/**
 * Visual rendering plot types supported by lightweight-charts and custom primitives.
 */
export type IndicatorPlotType =
  | 'line'
  | 'stepline'
  | 'histogram'
  | 'cross'
  | 'circles'
  | 'band_fill'
  | 'marker'
  | 'footprint';

export type IndicatorLineStyle = 'solid' | 'dashed' | 'dotted';

/**
 * Supported data types for indicator input parameters.
 * Strictly typed, matching backend InputType ("integer", "float", "source", "boolean", "select", "string")
 * and legacy frontend ("number", "select", "source").
 */
export type IndicatorInputType =
  | 'integer'
  | 'float'
  | 'number'
  | 'source'
  | 'boolean'
  | 'select'
  | 'string';

/**
 * Strictly typed primitive value for indicator inputs.
 * Replaces all instances of `any`.
 */
export type IndicatorInputValue = string | number | boolean;

/**
 * Map of input values keyed by parameter ID.
 */
export type IndicatorInputValues = Record<string, IndicatorInputValue>;

/**
 * Option entry for select/source input controls.
 */
export interface IndicatorSelectOption {
  label: string;
  value: IndicatorInputValue;
}

/**
 * Schema defining a single configurable parameter for an indicator.
 * Strictly typed: replaces `default: any` and `options?: { label: string; value: any }[]`.
 */
export interface IndicatorInputSchema {
  id: string;
  name: string;
  description?: string;
  type: IndicatorInputType;
  default: IndicatorInputValue;
  min?: number;
  max?: number;
  step?: number;
  options?: IndicatorSelectOption[];
}

/**
 * Style configuration for a single rendered plot line, histogram, or dots series.
 */
export interface IndicatorPlotStyle {
  color: string;
  colorUp?: string;
  colorDown?: string;
  lineWidth: number;
  lineStyle?: IndicatorLineStyle;
  plotType?: IndicatorPlotType;
  visible?: boolean;
  visibleUp?: boolean;
  visibleDown?: boolean;
  lastValueVisible?: boolean;
  priceLineVisible?: boolean;
  overlay?: boolean;
}

export type IndicatorStyle = IndicatorPlotStyle;
export type IndicatorStyles = Record<string, IndicatorPlotStyle>;

/**
 * Directive defining a plot series from backend catalog metadata.
 */
export interface IndicatorPlotDirective {
  id: string;
  type: IndicatorPlotType;
  title: string;
  color: string;
  colorUp?: string;
  colorDown?: string;
  lineWidth?: number;
  lineStyle?: IndicatorLineStyle;
  visible: boolean;
  visibleUp?: boolean;
  visibleDown?: boolean;
  lastValueVisible?: boolean;
  priceLineVisible?: boolean;
  overlay?: boolean;
}

/**
 * Well-known plot IDs for multi-state trend/regime indicators.
 */
export type TrendRegimePlotId = 'up' | 'down' | 'value' | 'direction';

/**
 * Standard visual tokens for trend and regime state lines matching AGENTS.md § 3.2.
 */
export const TREND_REGIME_COLORS = {
  UP: '#089981',
  DOWN: '#F23645',
  VALUE: '#2962FF',
  DIRECTION: '#2962FF',
} as const;

/**
 * Standard default line widths for trend regime plots.
 */
export const TREND_REGIME_LINE_WIDTHS = {
  REGIME: 2,
  AUXILIARY: 1,
} as const;

/**
 * Style configuration for shaded bands between two plot lines (e.g. Bollinger Bands).
 */
export interface IndicatorBandStyle {
  id: string;
  title?: string;
  upperPlotId: string;
  lowerPlotId: string;
  fillColor: string;
  visible?: boolean;
}

export type IndicatorBandDirective = IndicatorBandStyle;

/**
 * Style configuration for static horizontal reference levels (e.g. RSI 70/30).
 */
export interface IndicatorLevelStyle {
  value: number;
  color: string;
  lineStyle?: IndicatorLineStyle;
  lineWidth?: number;
  label?: string;
  visible?: boolean;
}

export type IndicatorLevelDirective = IndicatorLevelStyle;

/**
 * Raw metadata descriptor returned by GET /api/indicators/catalog from Go backend.
 */
export interface IndicatorDescriptor {
  id: IndicatorId;
  wasmClass: string;
  name: string;
  shortName: string;
  family: string;
  category: string;
  overlay: boolean;
  description: string;
  inputs: IndicatorInputSchema[];
  plots: IndicatorPlotDirective[];
  bands?: IndicatorBandDirective[];
  levels?: IndicatorLevelDirective[];
  warmupPeriod?: number;
  priceSources?: string[];
}

/**
 * Response structure from GET /api/indicators/catalog.
 */
export interface IndicatorCatalogResponse {
  count: number;
  indicators: IndicatorDescriptor[];
}

/**
 * Complete indicator definition used throughout frontend UI and registry.
 * Extends raw backend metadata with pre-computed convenience lookups (defaultInputs, defaultStyles, plotLabels).
 */
export interface IndicatorDefinition {
  id: IndicatorId;
  type: IndicatorId; // backward compatibility alias for id
  wasmClass?: string;
  name: string;
  shortName: string;
  family?: string;
  category: IndicatorCategory;
  catalogCategory?: string;
  overlay: boolean;
  description: string;
  inputs: IndicatorInputSchema[];
  inputSchemas: IndicatorInputSchema[]; // backward compatibility alias for inputs
  defaultInputs: IndicatorInputValues;
  plots: IndicatorPlotDirective[];
  defaultStyles: Record<string, IndicatorPlotStyle>;
  plotLabels: Record<string, string>;
  defaultLevels?: IndicatorLevelStyle[];
  defaultBands?: IndicatorBandStyle[];
  warmupPeriod?: number;
  priceSources?: string[];
}

/**
 * Instantiated indicator configured on a specific chart pane.
 */
export interface IndicatorInstance {
  id: string;
  type: IndicatorId;
  paneId: string;
  name: string;
  category: IndicatorCategory;
  overlay?: boolean;
  visible: boolean;
  visibleUp?: boolean;
  visibleDown?: boolean;
  inputs: IndicatorInputValues;
  styles: Record<string, IndicatorPlotStyle>;
  levels?: IndicatorLevelStyle[];
  bands?: IndicatorBandStyle[];
  precision?: number | 'default';
  timeframe?: string;
  waitForClose?: boolean;
  showLabelsOnPriceScale?: boolean;
  showValuesInStatusLine?: boolean;
  showInputsInStatusLine?: boolean;
  visibility?: Record<string, boolean>;
}

export type IndicatorConfig = IndicatorInstance;

/**
 * Individual data point in a plot series.
 */
export interface IndicatorPlotDataPoint {
  time: number;
  value: number;
  color?: string; // Optional custom bar/point color
}

/**
 * Calculation result vector returned by indicator evaluation.
 */
export interface IndicatorCalculationResult {
  plots: Record<string, IndicatorPlotDataPoint[]>;
}

/**
 * Legacy 19 indicator identifiers for migration and verification reference.
 */
export const LEGACY_INDICATOR_IDS = [
  'volume',
  'sma',
  'ema',
  'wma',
  'hma',
  'vwap',
  'bollinger_bands',
  'keltner_channels',
  'supertrend',
  'parabolic_sar',
  'rsi',
  'macd',
  'stochastic',
  'stoch_rsi',
  'atr',
  'cci',
  'williams_r',
  'adx',
  'obv',
] as const;

export type LegacyIndicatorType = (typeof LEGACY_INDICATOR_IDS)[number];
