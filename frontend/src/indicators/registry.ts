// ORDERCRAFT Dynamic Indicator Registry & Catalog Service
// Manages 500+ streaming technical indicators with offline fallback caching.
// Strictly adheres to AGENTS.md § 3.2: strict: true, ZERO any types allowed.

import type {
  IndicatorDefinition,
  IndicatorDescriptor,
  IndicatorCatalogResponse,
  IndicatorInputValues,
  IndicatorPlotStyle,
  IndicatorPlotDirective,
  IndicatorBandStyle,
  IndicatorLevelStyle,
  IndicatorSelectOption,
  IndicatorPlotType,
  IndicatorCategory,
} from './types';
import { LEGACY_INDICATOR_MAP, normalizeIndicatorId, registerSubpaneChecker } from './migration';

export { LEGACY_INDICATOR_MAP };
export const LEGACY_MIGRATION_MAP = LEGACY_INDICATOR_MAP;

export const SOURCE_OPTIONS: IndicatorSelectOption[] = [
  { label: 'Close', value: 'close' },
  { label: 'Open', value: 'open' },
  { label: 'High', value: 'high' },
  { label: 'Low', value: 'low' },
  { label: 'HL/2 (Median)', value: 'hl2' },
  { label: 'HLC/3 (Typical)', value: 'hlc3' },
  { label: 'OHLC/4 (Weighted)', value: 'ohlc4' },
];

/**
 * Converts a raw backend IndicatorDescriptor into a fully resolved IndicatorDefinition.
 */
export function descriptorToDefinition(desc: IndicatorDescriptor): IndicatorDefinition {
  const defaultInputs: IndicatorInputValues = {};
  for (const input of desc.inputs || []) {
    defaultInputs[input.id] = input.default;
  }

  const defaultStyles: Record<string, IndicatorPlotStyle> = {};
  const plotLabels: Record<string, string> = {};
  for (const plot of desc.plots || []) {
    defaultStyles[plot.id] = {
      color: plot.color,
      colorUp: plot.colorUp,
      colorDown: plot.colorDown,
      lineWidth: plot.lineWidth || 1,
      lineStyle: plot.lineStyle || 'solid',
      plotType: plot.type as IndicatorPlotType,
      visible: plot.visible !== false,
      visibleUp: plot.visibleUp,
      visibleDown: plot.visibleDown,
      lastValueVisible: plot.lastValueVisible !== false,
      priceLineVisible: Boolean(plot.priceLineVisible),
    };
    plotLabels[plot.id] = plot.title || plot.id;
  }

  const defaultBands: IndicatorBandStyle[] = (desc.bands || []).map((b) => ({
    id: b.id,
    title: b.title,
    upperPlotId: b.upperPlotId,
    lowerPlotId: b.lowerPlotId,
    fillColor: b.fillColor,
    visible: b.visible !== false,
  }));

  const defaultLevels: IndicatorLevelStyle[] = (desc.levels || []).map((l) => ({
    value: l.value,
    color: l.color,
    lineStyle: l.lineStyle || 'dashed',
    lineWidth: l.lineWidth || 1,
    label: l.label,
    visible: l.visible !== false,
  }));

  const paneCategory: IndicatorCategory = desc.overlay ? 'overlay' : 'subpane';

  return {
    id: desc.id,
    type: desc.id,
    wasmClass: desc.wasmClass,
    name: desc.name,
    shortName: desc.shortName,
    family: desc.family,
    category: paneCategory,
    catalogCategory: desc.category,
    overlay: desc.overlay,
    description: desc.description,
    inputs: desc.inputs || [],
    inputSchemas: desc.inputs || [],
    defaultInputs,
    plots: desc.plots || [],
    defaultStyles,
    plotLabels,
    defaultBands: defaultBands.length > 0 ? defaultBands : undefined,
    defaultLevels: defaultLevels.length > 0 ? defaultLevels : undefined,
    warmupPeriod: desc.warmupPeriod,
    priceSources: desc.priceSources,
  };
}

// ============================================================================
// Built-in Fallback Cache for Common Core Indicators
// Ensures instantaneous zero-latency render while asynchronous catalog loads.
// ============================================================================
const CORE_FALLBACK_DESCRIPTORS: IndicatorDescriptor[] = [
  {
    id: 'wickra.volume',
    wasmClass: 'Volume',
    name: 'Volume',
    shortName: 'Vol',
    family: 'Volume',
    category: 'Volume',
    overlay: true,
    description: 'Displays trading volume for each bar as colored histogram bars with optional moving average.',
    inputs: [
      { id: 'maLength', name: 'MA Length', type: 'integer', default: 20, min: 1, max: 200 },
      { id: 'showMa', name: 'Show MA', type: 'boolean', default: true },
    ],
    plots: [
      { id: 'vol', type: 'histogram', title: 'Volume', color: '#089981', colorUp: '#089981', colorDown: '#f23645', lineWidth: 1, visible: true, lastValueVisible: false, priceLineVisible: false },
      { id: 'ma', type: 'line', title: 'Volume MA', color: '#2962FF', lineWidth: 1, visible: false, lastValueVisible: false, priceLineVisible: false },
    ],
  },
  {
    id: 'wickra.sma',
    wasmClass: 'SMA',
    name: 'Simple Moving Average (SMA)',
    shortName: 'SMA',
    family: 'Moving Averages',
    category: 'Trend & Overlays',
    overlay: true,
    description: 'Calculates the unweighted mean of the previous N price bars.',
    inputs: [
      { id: 'period', name: 'Period', type: 'integer', default: 20, min: 1, max: 1000 },
      { id: 'source', name: 'Source', type: 'source', default: 'close', options: SOURCE_OPTIONS },
    ],
    plots: [
      { id: 'plot', type: 'line', title: 'SMA', color: '#2962FF', lineWidth: 2, lineStyle: 'solid', visible: true },
    ],
  },
  {
    id: 'wickra.ema',
    wasmClass: 'EMA',
    name: 'Exponential Moving Average',
    shortName: 'EMA',
    family: 'Moving Averages',
    category: 'Trend & Overlays',
    overlay: true,
    description: 'Calculates Exponential Moving Average (EMA) technical indicator.',
    inputs: [
      { id: 'period', name: 'Length', type: 'integer', default: 9, min: 1, max: 1000 },
      { id: 'source', name: 'Source', type: 'source', default: 'close', options: SOURCE_OPTIONS },
      { id: 'offset', name: 'Offset', type: 'integer', default: 0, min: -1000, max: 1000 },
    ],
    plots: [
      { id: 'plot', type: 'line', title: 'EMA', color: '#2962FF', lineWidth: 2, lineStyle: 'solid', visible: true },
    ],
  },
  {
    id: 'wickra.wma',
    wasmClass: 'WMA',
    name: 'Weighted Moving Average (WMA)',
    shortName: 'WMA',
    family: 'Moving Averages',
    category: 'Trend & Overlays',
    overlay: true,
    description: 'Assigns a heavier weighting to more current data points linearly.',
    inputs: [
      { id: 'period', name: 'Period', type: 'integer', default: 20, min: 1, max: 1000 },
      { id: 'source', name: 'Source', type: 'source', default: 'close', options: SOURCE_OPTIONS },
    ],
    plots: [
      { id: 'plot', type: 'line', title: 'WMA', color: '#9C27B0', lineWidth: 2, lineStyle: 'solid', visible: true },
    ],
  },
  {
    id: 'wickra.hma',
    wasmClass: 'HMA',
    name: 'Hull Moving Average',
    shortName: 'HMA',
    family: 'Moving Averages',
    category: 'Trend & Overlays',
    overlay: true,
    description: "Hull's near-zero-lag WMA(2·WMA(n/2) − WMA(n), √n).",
    inputs: [
      { id: 'period', name: 'Period', type: 'integer', default: 14, min: 1, max: 500 },
      { id: 'source', name: 'Source', type: 'source', default: 'close', options: SOURCE_OPTIONS },
    ],
    plots: [
      { id: 'up', type: 'line', title: 'Up Trend', color: '#089981', lineWidth: 2, lineStyle: 'solid', visible: true },
      { id: 'down', type: 'line', title: 'Down Trend', color: '#F23645', lineWidth: 2, lineStyle: 'solid', visible: true },
      { id: 'value', type: 'line', title: 'Value', color: '#2962FF', lineWidth: 1, lineStyle: 'solid', visible: false },
      { id: 'direction', type: 'line', title: 'Direction', color: '#2962FF', lineWidth: 1, lineStyle: 'solid', visible: false },
    ],
  },
  {
    id: 'wickra.t3',
    wasmClass: 'T3',
    name: 'Tillson T3',
    shortName: 'T3',
    family: 'Moving Averages',
    category: 'Trend & Overlays',
    overlay: true,
    description: "Tillson's six-EMA cascade recombined with a volume factor v.",
    inputs: [
      { id: 'period', name: 'Period', type: 'integer', default: 14, min: 1, max: 500 },
      { id: 'v', name: 'V', type: 'float', default: 1.0, min: 0.01, max: 1000.0, step: 0.1 },
      { id: 'source', name: 'Source', type: 'source', default: 'close', options: SOURCE_OPTIONS },
    ],
    plots: [
      { id: 'up', type: 'line', title: 'Up Trend', color: '#089981', lineWidth: 2, lineStyle: 'solid', visible: true },
      { id: 'down', type: 'line', title: 'Down Trend', color: '#F23645', lineWidth: 2, lineStyle: 'solid', visible: true },
      { id: 'value', type: 'line', title: 'Value', color: '#2962FF', lineWidth: 1, lineStyle: 'solid', visible: false },
      { id: 'direction', type: 'line', title: 'Direction', color: '#2962FF', lineWidth: 1, lineStyle: 'solid', visible: false },
    ],
  },
  {
    id: 'wickra.vwap',
    wasmClass: 'VWAP',
    name: 'Volume Weighted Average Price (VWAP)',
    shortName: 'VWAP',
    family: 'Volume',
    category: 'Volume',
    overlay: true,
    description: 'Volume Weighted Average Price with periodic session anchor resets and standard deviation bands.',
    inputs: [
      {
        id: 'anchor_period',
        name: 'Anchor Period',
        type: 'select',
        default: 'session',
        options: [
          { label: 'Session', value: 'session' },
          { label: 'Week', value: 'week' },
          { label: 'Month', value: 'month' },
          { label: 'Quarter', value: 'quarter' },
          { label: 'Year', value: 'year' },
          { label: 'Decade', value: 'decade' },
          { label: 'Century', value: 'century' },
        ],
      },
      { id: 'source', name: 'Source', type: 'source', default: 'hlc3', options: SOURCE_OPTIONS },
      { id: 'offset', name: 'Offset', type: 'integer', default: 0, min: -500, max: 500 },
      {
        id: 'bands_calculation_mode',
        name: 'Bands Calculation Mode',
        type: 'select',
        default: 'stdev',
        options: [
          { label: 'Standard Deviation', value: 'stdev' },
          { label: 'Percentage', value: 'percentage' },
        ],
      },
      { id: 'bands_multiplier_1', name: 'Bands Multiplier #1', type: 'float', default: 1.0, min: 0.1, max: 50.0, step: 0.1 },
      { id: 'bands_multiplier_2', name: 'Bands Multiplier #2', type: 'float', default: 2.0, min: 0.1, max: 50.0, step: 0.1 },
      { id: 'bands_multiplier_3', name: 'Bands Multiplier #3', type: 'float', default: 3.0, min: 0.1, max: 50.0, step: 0.1 },
    ],
    plots: [
      { id: 'plot', type: 'line', title: 'VWAP', color: '#2962FF', lineWidth: 2, lineStyle: 'solid', visible: true },
      { id: 'upper_1', type: 'line', title: 'Upper Band #1', color: '#089981', lineWidth: 1, lineStyle: 'solid', visible: true },
      { id: 'lower_1', type: 'line', title: 'Lower Band #1', color: '#089981', lineWidth: 1, lineStyle: 'solid', visible: true },
      { id: 'upper_2', type: 'line', title: 'Upper Band #2', color: '#089981', lineWidth: 1, lineStyle: 'solid', visible: false },
      { id: 'lower_2', type: 'line', title: 'Lower Band #2', color: '#089981', lineWidth: 1, lineStyle: 'solid', visible: false },
      { id: 'upper_3', type: 'line', title: 'Upper Band #3', color: '#089981', lineWidth: 1, lineStyle: 'solid', visible: false },
      { id: 'lower_3', type: 'line', title: 'Lower Band #3', color: '#089981', lineWidth: 1, lineStyle: 'solid', visible: false },
    ],
    bands: [
      { id: 'vwap_band_1', title: 'Bands Fill #1', upperPlotId: 'upper_1', lowerPlotId: 'lower_1', fillColor: 'rgba(41, 98, 255, 0.08)', visible: true },
      { id: 'vwap_band_2', title: 'Bands Fill #2', upperPlotId: 'upper_2', lowerPlotId: 'lower_2', fillColor: 'rgba(41, 98, 255, 0.04)', visible: false },
      { id: 'vwap_band_3', title: 'Bands Fill #3', upperPlotId: 'upper_3', lowerPlotId: 'lower_3', fillColor: 'rgba(41, 98, 255, 0.04)', visible: false },
    ],
  },
  {
    id: 'wickra.bollinger_bands',
    wasmClass: 'BollingerBands',
    name: 'Bollinger Bands (BB)',
    shortName: 'BB',
    family: 'Bands & Channels',
    category: 'Volatility & Bands',
    overlay: true,
    description: 'Volatility bands placed above and below a moving average by standard deviation.',
    inputs: [
      { id: 'period', name: 'Length', type: 'integer', default: 20, min: 1, max: 500 },
      { id: 'multiplier', name: 'StdDev Multiplier', type: 'float', default: 2.0, min: 0.1, max: 10, step: 0.1 },
      { id: 'source', name: 'Source', type: 'source', default: 'close', options: SOURCE_OPTIONS },
    ],
    plots: [
      { id: 'upper', type: 'line', title: 'Upper Band', color: '#00897B', lineWidth: 1, lineStyle: 'solid', visible: true },
      { id: 'middle', type: 'line', title: 'Middle (Basis)', color: '#26A69A', lineWidth: 1, lineStyle: 'solid', visible: true },
      { id: 'lower', type: 'line', title: 'Lower Band', color: '#00897B', lineWidth: 1, lineStyle: 'solid', visible: true },
    ],
    bands: [
      { id: 'bollingerbands_fill', upperPlotId: 'upper', lowerPlotId: 'lower', fillColor: 'rgba(41, 98, 255, 0.08)', visible: true },
    ],
  },
  {
    id: 'wickra.keltner',
    wasmClass: 'Keltner',
    name: 'Keltner Channels (KC)',
    shortName: 'KC',
    family: 'Bands & Channels',
    category: 'Volatility & Bands',
    overlay: true,
    description: 'Volatility-based envelopes set above and below an EMA using ATR bands.',
    inputs: [
      { id: 'ema_period', name: 'EMA Period', type: 'integer', default: 20, min: 1, max: 500 },
      { id: 'atr_period', name: 'ATR Period', type: 'integer', default: 10, min: 1, max: 200 },
      { id: 'multiplier', name: 'ATR Multiplier', type: 'float', default: 2.0, min: 0.1, max: 10, step: 0.1 },
    ],
    plots: [
      { id: 'upper', type: 'line', title: 'Upper Channel', color: '#00897B', lineWidth: 1, lineStyle: 'solid', visible: true },
      { id: 'middle', type: 'line', title: 'Middle (Basis)', color: '#26A69A', lineWidth: 1, lineStyle: 'solid', visible: true },
      { id: 'lower', type: 'line', title: 'Lower Channel', color: '#00897B', lineWidth: 1, lineStyle: 'solid', visible: true },
    ],
    bands: [
      { id: 'keltner_fill', upperPlotId: 'upper', lowerPlotId: 'lower', fillColor: 'rgba(0, 137, 123, 0.08)', visible: true },
    ],
  },
  {
    id: 'wickra.super_trend',
    wasmClass: 'SuperTrend',
    name: 'SuperTrend',
    shortName: 'ST',
    family: 'Trailing Stops',
    category: 'Trend & Overlays',
    overlay: true,
    description: 'ATR-banded trailing stop with explicit flip logic.',
    inputs: [
      { id: 'atr_period', name: 'Atr Period', type: 'integer', default: 14, min: 1, max: 500 },
      { id: 'multiplier', name: 'Multiplier', type: 'float', default: 2.0, min: 0.1, max: 10.0, step: 0.1 },
    ],
    plots: [
      { id: 'up', type: 'line', title: 'Up Trend', color: '#089981', lineWidth: 2, lineStyle: 'solid', visible: true },
      { id: 'down', type: 'line', title: 'Down Trend', color: '#F23645', lineWidth: 2, lineStyle: 'solid', visible: true },
      { id: 'value', type: 'line', title: 'Value', color: '#2962FF', lineWidth: 1, lineStyle: 'solid', visible: false },
      { id: 'direction', type: 'line', title: 'Direction', color: '#2962FF', lineWidth: 1, lineStyle: 'solid', visible: false },
    ],
  },
  {
    id: 'wickra.atr_ratchet',
    wasmClass: 'AtrRatchet',
    name: 'ATR Ratchet',
    shortName: 'AR',
    family: 'Trailing Stops',
    category: 'Trend & Overlays',
    overlay: true,
    description: "Perry Kaufman's time-based volatility stop — it tightens by a fixed fraction of ATR every bar, so a stalled trade is squeezed out even in a flat market.",
    inputs: [
      { id: 'atr_period', name: 'Atr Period', type: 'integer', default: 14, min: 1, max: 500 },
      { id: 'start_mult', name: 'Start Mult', type: 'float', default: 2.0, min: 0.1, max: 10.0, step: 0.1 },
      { id: 'increment', name: 'Increment', type: 'float', default: 1.0, min: 0.01, max: 1000.0, step: 0.1 },
    ],
    plots: [
      { id: 'up', type: 'line', title: 'Up Trend', color: '#089981', lineWidth: 2, lineStyle: 'solid', visible: true },
      { id: 'down', type: 'line', title: 'Down Trend', color: '#F23645', lineWidth: 2, lineStyle: 'solid', visible: true },
      { id: 'value', type: 'line', title: 'Value', color: '#2962FF', lineWidth: 1, lineStyle: 'solid', visible: false },
      { id: 'direction', type: 'line', title: 'Direction', color: '#2962FF', lineWidth: 1, lineStyle: 'solid', visible: false },
    ],
  },
  {
    id: 'wickra.elder_safe_zone',
    wasmClass: 'ElderSafeZone',
    name: 'Elder SafeZone Stop',
    shortName: 'ESZ',
    family: 'Trailing Stops',
    category: 'Trend & Overlays',
    overlay: true,
    description: "Alexander Elder's trailing stop placed a multiple of the average market noise away from price — wide enough to survive normal pullbacks, tight enough to exit a real reversal.",
    inputs: [
      { id: 'period', name: 'Period', type: 'integer', default: 14, min: 1, max: 500 },
      { id: 'coeff', name: 'Coeff', type: 'float', default: 1.0, min: 0.01, max: 1000.0, step: 0.1 },
    ],
    plots: [
      { id: 'up', type: 'line', title: 'Up Trend', color: '#089981', lineWidth: 2, lineStyle: 'solid', visible: true },
      { id: 'down', type: 'line', title: 'Down Trend', color: '#F23645', lineWidth: 2, lineStyle: 'solid', visible: true },
      { id: 'value', type: 'line', title: 'Value', color: '#2962FF', lineWidth: 1, lineStyle: 'solid', visible: false },
      { id: 'direction', type: 'line', title: 'Direction', color: '#2962FF', lineWidth: 1, lineStyle: 'solid', visible: false },
    ],
  },
  {
    id: 'wickra.kase_dev_stop',
    wasmClass: 'KaseDevStop',
    name: 'Kase DevStop',
    shortName: 'KDS',
    family: 'Trailing Stops',
    category: 'Trend & Overlays',
    overlay: true,
    description: "Cynthia Kase's volatility trailing stop, built on the standard deviation of the two-bar true range — it ratchets in the trend's favour and flips on a close through the line.",
    inputs: [
      { id: 'period', name: 'Period', type: 'integer', default: 14, min: 1, max: 500 },
      { id: 'dev', name: 'Dev', type: 'float', default: 1.0, min: 0.01, max: 1000.0, step: 0.1 },
    ],
    plots: [
      { id: 'up', type: 'line', title: 'Up Trend', color: '#089981', lineWidth: 2, lineStyle: 'solid', visible: true },
      { id: 'down', type: 'line', title: 'Down Trend', color: '#F23645', lineWidth: 2, lineStyle: 'solid', visible: true },
      { id: 'value', type: 'line', title: 'Value', color: '#2962FF', lineWidth: 1, lineStyle: 'solid', visible: false },
      { id: 'direction', type: 'line', title: 'Direction', color: '#2962FF', lineWidth: 1, lineStyle: 'solid', visible: false },
    ],
  },
  {
    id: 'wickra.modified_ma_stop',
    wasmClass: 'ModifiedMaStop',
    name: 'Modified Ma Stop',
    shortName: 'MMS',
    family: 'Trailing Stops',
    category: 'Trend & Overlays',
    overlay: true,
    description: "A trailing stop riding the Modified Moving Average (SMMA / Wilder's RMA), ratcheted so it only moves in the trend's favour and flips on a decisive cross.",
    inputs: [
      { id: 'period', name: 'Period', type: 'integer', default: 14, min: 1, max: 500 },
    ],
    plots: [
      { id: 'up', type: 'line', title: 'Up Trend', color: '#089981', lineWidth: 2, lineStyle: 'solid', visible: true },
      { id: 'down', type: 'line', title: 'Down Trend', color: '#F23645', lineWidth: 2, lineStyle: 'solid', visible: true },
      { id: 'value', type: 'line', title: 'Value', color: '#2962FF', lineWidth: 1, lineStyle: 'solid', visible: false },
      { id: 'direction', type: 'line', title: 'Direction', color: '#2962FF', lineWidth: 1, lineStyle: 'solid', visible: false },
    ],
  },
  {
    id: 'wickra.nrtr',
    wasmClass: 'Nrtr',
    name: 'Nick Rypock Trailing Reverse',
    shortName: 'Nrtr',
    family: 'Price Statistics',
    category: 'Statistics & Risk',
    overlay: false,
    description: 'Nick Rypock Trailing Reverse — a scale-free percentage trailing-reverse stop that follows the trend extreme and flips when price retraces by a fixed percentage.',
    inputs: [
      { id: 'pct', name: 'Pct', type: 'float', default: 1.0, min: 0.01, max: 1000.0, step: 0.1 },
    ],
    plots: [
      { id: 'up', type: 'line', title: 'Up Trend', color: '#089981', lineWidth: 2, lineStyle: 'solid', visible: true },
      { id: 'down', type: 'line', title: 'Down Trend', color: '#F23645', lineWidth: 2, lineStyle: 'solid', visible: true },
      { id: 'value', type: 'line', title: 'Value', color: '#2962FF', lineWidth: 1, lineStyle: 'solid', visible: false },
      { id: 'direction', type: 'line', title: 'Direction', color: '#2962FF', lineWidth: 1, lineStyle: 'solid', visible: false },
    ],
  },
  {
    id: 'wickra.psar',
    wasmClass: 'PSAR',
    name: 'Parabolic SAR',
    shortName: 'SAR',
    family: 'Trailing Stops',
    category: 'Trend & Overlays',
    overlay: true,
    description: 'Trailing stop and reverse method to identify potential trend reversals.',
    inputs: [
      { id: 'af_start', name: 'Start', type: 'float', default: 0.02, min: 0.001, max: 1, step: 0.005 },
      { id: 'af_step', name: 'Increment', type: 'float', default: 0.02, min: 0.001, max: 1, step: 0.005 },
      { id: 'af_max', name: 'Maximum', type: 'float', default: 0.2, min: 0.01, max: 1, step: 0.01 },
    ],
    plots: [
      { id: 'plot', type: 'circles', title: 'SAR', color: '#2962FF', lineWidth: 2, visible: true },
    ],
  },
  {
    id: 'wickra.rsi',
    wasmClass: 'RSI',
    name: 'Relative Strength Index (RSI)',
    shortName: 'RSI',
    family: 'Momentum Oscillators',
    category: 'Oscillators',
    overlay: false,
    description: 'Momentum oscillator measuring the speed and change of price movements.',
    inputs: [
      { id: 'period', name: 'Period', type: 'integer', default: 14, min: 1, max: 500 },
      { id: 'source', name: 'Source', type: 'source', default: 'close', options: SOURCE_OPTIONS },
    ],
    plots: [
      { id: 'plot', type: 'line', title: 'RSI', color: '#7E57C2', lineWidth: 2, lineStyle: 'solid', visible: true },
    ],
    levels: [
      { value: 70, color: '#F23645', lineStyle: 'dashed', lineWidth: 1, label: 'Overbought', visible: true },
      { value: 50, color: '#787B86', lineStyle: 'dotted', lineWidth: 1, label: 'Midline', visible: true },
      { value: 30, color: '#089981', lineStyle: 'dashed', lineWidth: 1, label: 'Oversold', visible: true },
    ],
  },
  {
    id: 'wickra.macd',
    wasmClass: 'MACD',
    name: 'Moving Average Convergence Divergence (MACD)',
    shortName: 'MACD',
    family: 'Trend & Directional',
    category: 'Trend & Overlays',
    overlay: false,
    description: 'Trend-following momentum indicator showing the relationship between two exponential moving averages.',
    inputs: [
      { id: 'fast', name: 'Fast Length', type: 'integer', default: 12, min: 1, max: 500 },
      { id: 'slow', name: 'Slow Length', type: 'integer', default: 26, min: 1, max: 500 },
      { id: 'signal', name: 'Signal Smoothing', type: 'integer', default: 9, min: 1, max: 200 },
      { id: 'source', name: 'Source', type: 'source', default: 'close', options: SOURCE_OPTIONS },
    ],
    plots: [
      { id: 'macd', type: 'line', title: 'MACD Line', color: '#2962FF', lineWidth: 1.5, lineStyle: 'solid', visible: true },
      { id: 'signal', type: 'line', title: 'Signal Line', color: '#FF6D00', lineWidth: 1.5, lineStyle: 'solid', visible: true },
      { id: 'histogram', type: 'histogram', title: 'Histogram', color: '#089981', lineWidth: 2, lineStyle: 'solid', visible: true },
    ],
    levels: [
      { value: 0, color: '#434651', lineStyle: 'solid', lineWidth: 1, label: 'Zero', visible: true },
    ],
  },
  {
    id: 'wickra.stochastic',
    wasmClass: 'Stochastic',
    name: 'Stochastic Oscillator',
    shortName: 'Stoch',
    family: 'Momentum Oscillators',
    category: 'Oscillators',
    overlay: false,
    description: 'Compares a particular closing price to a range of prices over a given period of time.',
    inputs: [
      { id: 'k_period', name: '%K Period', type: 'integer', default: 14, min: 1, max: 500 },
      { id: 'd_period', name: '%D Period', type: 'integer', default: 3, min: 1, max: 100 },
    ],
    plots: [
      { id: 'k', type: 'line', title: '%K Line', color: '#2962FF', lineWidth: 1.5, lineStyle: 'solid', visible: true },
      { id: 'd', type: 'line', title: '%D Line', color: '#FF6D00', lineWidth: 1.5, lineStyle: 'solid', visible: true },
    ],
    levels: [
      { value: 80, color: '#F23645', lineStyle: 'dashed', lineWidth: 1, label: 'Upper', visible: true },
      { value: 20, color: '#089981', lineStyle: 'dashed', lineWidth: 1, label: 'Lower', visible: true },
    ],
  },
  {
    id: 'wickra.stoch_rsi',
    wasmClass: 'StochRSI',
    name: 'Stochastic RSI',
    shortName: 'StochRSI',
    family: 'Momentum Oscillators',
    category: 'Oscillators',
    overlay: false,
    description: 'Applies Stochastic formula to RSI values rather than standard price data.',
    inputs: [
      { id: 'rsi_period', name: 'RSI Period', type: 'integer', default: 14, min: 1, max: 500 },
      { id: 'stoch_period', name: 'Stochastic Period', type: 'integer', default: 14, min: 1, max: 500 },
      { id: 'source', name: 'Source', type: 'source', default: 'close', options: SOURCE_OPTIONS },
    ],
    plots: [
      { id: 'k', type: 'line', title: '%K Line', color: '#2962FF', lineWidth: 1.5, lineStyle: 'solid', visible: true },
      { id: 'd', type: 'line', title: '%D Line', color: '#FF6D00', lineWidth: 1.5, lineStyle: 'solid', visible: true },
    ],
    levels: [
      { value: 80, color: '#F23645', lineStyle: 'dashed', lineWidth: 1, label: 'Upper', visible: true },
      { value: 20, color: '#089981', lineStyle: 'dashed', lineWidth: 1, label: 'Lower', visible: true },
    ],
  },
  {
    id: 'wickra.atr',
    wasmClass: 'ATR',
    name: 'Average True Range (ATR)',
    shortName: 'ATR',
    family: 'Volatility & Bands',
    category: 'Volatility & Bands',
    overlay: false,
    description: 'Technical analysis volatility indicator that measures market volatility over a period.',
    inputs: [
      { id: 'period', name: 'Length', type: 'integer', default: 14, min: 1, max: 500 },
    ],
    plots: [
      { id: 'plot', type: 'line', title: 'ATR', color: '#AB47BC', lineWidth: 2, lineStyle: 'solid', visible: true },
    ],
  },
  {
    id: 'wickra.cci',
    wasmClass: 'CCI',
    name: 'Commodity Channel Index (CCI)',
    shortName: 'CCI',
    family: 'Momentum Oscillators',
    category: 'Oscillators',
    overlay: false,
    description: 'Versatile indicator that can be used to identify a new trend or warn of extreme conditions.',
    inputs: [
      { id: 'period', name: 'Length', type: 'integer', default: 20, min: 1, max: 500 },
    ],
    plots: [
      { id: 'plot', type: 'line', title: 'CCI', color: '#FF6D00', lineWidth: 2, lineStyle: 'solid', visible: true },
    ],
    levels: [
      { value: 100, color: '#F23645', lineStyle: 'dashed', lineWidth: 1, label: 'Overbought', visible: true },
      { value: -100, color: '#089981', lineStyle: 'dashed', lineWidth: 1, label: 'Oversold', visible: true },
    ],
  },
  {
    id: 'wickra.williams_r',
    wasmClass: 'WilliamsR',
    name: '%R (Williams Percent Range)',
    shortName: 'Williams %R',
    family: 'Momentum Oscillators',
    category: 'Oscillators',
    overlay: false,
    description: 'Momentum indicator that measures overbought and oversold levels, oscillating from 0 to -100.',
    inputs: [
      { id: 'period', name: 'Length', type: 'integer', default: 14, min: 1, max: 500 },
    ],
    plots: [
      { id: 'plot', type: 'line', title: '%R', color: '#26A69A', lineWidth: 2, lineStyle: 'solid', visible: true },
    ],
    levels: [
      { value: -20, color: '#F23645', lineStyle: 'dashed', lineWidth: 1, label: 'Overbought', visible: true },
      { value: -80, color: '#089981', lineStyle: 'dashed', lineWidth: 1, label: 'Oversold', visible: true },
    ],
  },
  {
    id: 'wickra.adx',
    wasmClass: 'ADX',
    name: 'Average Directional Index (ADX)',
    shortName: 'ADX',
    family: 'Trend & Directional',
    category: 'Trend & Overlays',
    overlay: false,
    description: 'Quantifies trend strength without regard to trend direction.',
    inputs: [
      { id: 'period', name: 'Length', type: 'integer', default: 14, min: 1, max: 500 },
    ],
    plots: [
      { id: 'adx', type: 'line', title: 'ADX', color: '#F23645', lineWidth: 2, lineStyle: 'solid', visible: true },
      { id: 'plusDi', type: 'line', title: '+DI', color: '#089981', lineWidth: 1.5, lineStyle: 'solid', visible: true },
      { id: 'minusDi', type: 'line', title: '-DI', color: '#F23645', lineWidth: 1.5, lineStyle: 'solid', visible: true },
    ],
    levels: [
      { value: 25, color: '#787B86', lineStyle: 'dashed', lineWidth: 1, label: 'Strong Trend (25)', visible: true },
    ],
  },
  {
    id: 'wickra.obv',
    wasmClass: 'OBV',
    name: 'On-Balance Volume (OBV)',
    shortName: 'OBV',
    family: 'Volume',
    category: 'Volume',
    overlay: false,
    description: 'Uses volume flow to predict changes in stock price.',
    inputs: [],
    plots: [
      { id: 'plot', type: 'line', title: 'OBV', color: '#2962FF', lineWidth: 2, lineStyle: 'solid', visible: true },
    ],
  },
  {
    id: 'wickra.adl',
    wasmClass: 'ADL',
    name: 'Accumulation/Distribution Line (ADL)',
    shortName: 'ADL',
    family: 'Volume',
    category: 'Volume',
    overlay: false,
    description: 'Cumulative range-weighted volume measuring accumulation and distribution flow.',
    inputs: [],
    plots: [
      { id: 'plot', type: 'line', title: 'ADL', color: '#089981', lineWidth: 2, lineStyle: 'solid', visible: true },
    ],
  },
  {
    id: 'wickra.anchored_vwap',
    wasmClass: 'AnchoredVWAP',
    name: 'Anchored VWAP',
    shortName: 'AVWAP',
    family: 'Volume',
    category: 'Volume',
    overlay: true,
    description: 'Cumulative VWAP from a user-set anchor bar (event-anchored fair price).',
    inputs: [],
    plots: [
      { id: 'plot', type: 'line', title: 'Anchored VWAP', color: '#089981', lineWidth: 2, lineStyle: 'solid', visible: true },
    ],
  },
];

// Initialize registry dictionary with core fallbacks (supporting both legacy and wickra IDs)
function buildInitialRegistry(): Record<string, IndicatorDefinition> {
  const map: Record<string, IndicatorDefinition> = {};
  for (const desc of CORE_FALLBACK_DESCRIPTORS) {
    const def = descriptorToDefinition(desc);
    map[def.id] = def;
    // Map legacy alias (e.g. 'sma' -> 'wickra.sma')
    for (const [legacyId, wickraId] of Object.entries(LEGACY_INDICATOR_MAP)) {
      if (wickraId === def.id) {
        map[legacyId] = def;
      }
    }
  }
  return map;
}

const registryMap: Record<string, IndicatorDefinition> = buildInitialRegistry();

/**
 * Global synchronous dictionary accessor. Maintained for 100% backward compatibility.
 * Augments in-place as soon as fetchCatalog() resolves.
 */
export const INDICATOR_REGISTRY: Record<string, IndicatorDefinition> = registryMap;
registerSubpaneChecker((id) => (INDICATOR_REGISTRY[id] ? !INDICATOR_REGISTRY[id].overlay : undefined));

/**
 * Array of available distinct indicator identifiers for UI catalog display.
 * Updated in-place when catalog is fetched.
 */
function buildDistinctTypes(map: Record<string, IndicatorDefinition>): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const def of Object.values(map)) {
    if (def.id === 'wickra.vwap_std_dev_bands') {
      continue;
    }
    if (!seen.has(def.id)) {
      seen.add(def.id);
      list.push(def.id);
    }
  }
  return list;
}

export const ALL_INDICATOR_TYPES: string[] = buildDistinctTypes(registryMap);

// ============================================================================
// Dynamic Catalog Service
// ============================================================================

let isCatalogLoaded = false;
let catalogLoadingPromise: Promise<IndicatorDefinition[]> | null = null;
const catalogListeners = new Set<() => void>();

/**
 * Subscribes a callback to catalog updates (invoked when backend fetch completes).
 */
export function subscribeCatalog(listener: () => void): () => void {
  catalogListeners.add(listener);
  return () => {
    catalogListeners.delete(listener);
  };
}

/**
 * Indicates whether the complete 500+ indicator catalog has been loaded from the backend.
 */
export function isLoaded(): boolean {
  return isCatalogLoaded;
}

/**
 * Synchronous lookup for an indicator definition by ID.
 * Resolves directly or via legacy normalization map (e.g. 'sma' -> 'wickra.sma').
 */
export function getIndicator(id: string): IndicatorDefinition | undefined {
  if (registryMap[id]) {
    return registryMap[id];
  }
  const norm = normalizeIndicatorId(id);
  if (registryMap[norm]) {
    return registryMap[norm];
  }
  return undefined;
}

/**
 * Returns all distinct loaded indicator definitions.
 * Filters out duplicate alias keys to ensure exact count.
 */
export function getAllIndicators(): IndicatorDefinition[] {
  const seen = new Set<string>();
  const list: IndicatorDefinition[] = [];
  for (const def of Object.values(registryMap)) {
    if (def.id === 'wickra.vwap_std_dev_bands') {
      continue;
    }
    if (!seen.has(def.id)) {
      seen.add(def.id);
      list.push(def);
    }
  }
  return list;
}

/**
 * Returns all distinct indicator categories currently available in the catalog.
 */
export function getCategories(): string[] {
  const set = new Set<string>();
  for (const def of Object.values(registryMap)) {
    if (def.catalogCategory) {
      set.add(def.catalogCategory);
    } else if (def.category) {
      set.add(def.category);
    }
  }
  return Array.from(set).sort();
}

/**
 * Fetches the complete indicator catalog from the Go backend REST API (GET /api/indicators/catalog).
 * Deduplicates in-flight requests and notifies subscribers upon completion.
 */
export async function fetchCatalog(options?: {
  force?: boolean;
  category?: string;
  query?: string;
}): Promise<IndicatorDefinition[]> {
  if (isCatalogLoaded && !options?.force && !options?.category && !options?.query) {
    return getAllIndicators();
  }

  if (catalogLoadingPromise && !options?.force) {
    return catalogLoadingPromise;
  }

  catalogLoadingPromise = (async () => {
    try {
      const params = new URLSearchParams();
      if (options?.category) params.set('category', options.category);
      if (options?.query) params.set('q', options.query);
      const qs = params.toString();
      const url = `/api/indicators/catalog${qs ? `?${qs}` : ''}`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Catalog fetch failed with status ${res.status}: ${res.statusText}`);
      }

      const data: IndicatorCatalogResponse = await res.json();
      if (data && Array.isArray(data.indicators)) {
        for (const desc of data.indicators) {
          const def = descriptorToDefinition(desc);
          registryMap[def.id] = def;
          for (const [legacyId, wickraId] of Object.entries(LEGACY_INDICATOR_MAP)) {
            if (wickraId === def.id) {
              registryMap[legacyId] = def;
            }
          }
        }

        // Update ALL_INDICATOR_TYPES in-place with distinct canonical IDs
        ALL_INDICATOR_TYPES.length = 0;
        ALL_INDICATOR_TYPES.push(...buildDistinctTypes(registryMap));
        isCatalogLoaded = true;

        // Notify UI subscribers
        catalogListeners.forEach((fn) => {
          try {
            fn();
          } catch (err) {
            console.error('[IndicatorCatalog] Listener error:', err);
          }
        });
      }
    } catch (err) {
      console.warn('[IndicatorCatalog] Unable to load dynamic catalog, using fallback cache:', err);
    } finally {
      catalogLoadingPromise = null;
    }
    return getAllIndicators();
  })();

  return catalogLoadingPromise;
}

/**
 * Dynamically registers or updates a user-script indicator in the runtime registry.
 */
export function registerCustomIndicator(def: IndicatorDefinition): void {
  registryMap[def.id] = def;
  if (!def.id.startsWith('wickra.')) {
    registryMap[`wickra.${def.id}`] = def;
  }
  if (!ALL_INDICATOR_TYPES.includes(def.id)) {
    ALL_INDICATOR_TYPES.push(def.id);
  }
  catalogListeners.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.error('[IndicatorCatalog] Custom indicator registration listener error:', err);
    }
  });
}

// ============================================================================
// Multi-State & Regime Helpers
// ============================================================================

/**
 * List of canonical multi-state indicator IDs.
 */
export const MULTI_STATE_INDICATOR_IDS = [
  'wickra.super_trend',
  'wickra.t3',
  'wickra.hma',
  'wickra.atr_ratchet',
  'wickra.elder_safe_zone',
  'wickra.kase_dev_stop',
  'wickra.modified_ma_stop',
  'wickra.nrtr',
] as const;

/**
 * Determines whether an indicator has trend-dependent or regime-dependent multi-color plots ('up' and 'down').
 * Accepts an indicator ID string, an IndicatorDefinition, or an IndicatorDescriptor.
 */
export function isMultiStateIndicator(
  target: string | IndicatorDefinition | IndicatorDescriptor | null | undefined
): boolean {
  if (!target) return false;
  if (typeof target === 'string') {
    const def = getIndicator(target);
    if (!def) {
      const norm = normalizeIndicatorId(target);
      return (MULTI_STATE_INDICATOR_IDS as readonly string[]).includes(norm);
    }
    return Boolean(
      def.plots &&
      def.plots.some((p) => p.id === 'up') &&
      def.plots.some((p) => p.id === 'down')
    );
  }

  const plots = target.plots;
  return Boolean(
    plots &&
    plots.some((p) => p.id === 'up') &&
    plots.some((p) => p.id === 'down')
  );
}

/**
 * Retrieves the displayable plot directives for an indicator in user-facing settings.
 * For multi-state indicators, returns ['up', 'down'] and any user-configured plots,
 * filtering out internal auxiliary channels ('value', 'direction').
 */
export function getDisplayPlots(def: IndicatorDefinition): IndicatorPlotDirective[] {
  if (!isMultiStateIndicator(def)) {
    return def.plots;
  }
  return def.plots.filter((p) => p.id !== 'value' && p.id !== 'direction');
}


