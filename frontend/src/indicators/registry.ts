import type { IndicatorDefinition, IndicatorType } from './types';

export const SOURCE_OPTIONS = [
  { label: 'Close', value: 'close' },
  { label: 'Open', value: 'open' },
  { label: 'High', value: 'high' },
  { label: 'Low', value: 'low' },
  { label: 'HL/2 (Median)', value: 'hl2' },
  { label: 'HLC/3 (Typical)', value: 'hlc3' },
  { label: 'OHLC/4 (Weighted)', value: 'ohlc4' },
];

export const INDICATOR_REGISTRY: Record<IndicatorType, IndicatorDefinition> = {
  // ===================== OVERLAYS =====================
  volume: {
    type: 'volume',
    name: 'Volume',
    shortName: 'Vol',
    category: 'overlay',
    description: 'Displays the trading volume for each bar as colored histogram bars with optional moving average.',
    defaultInputs: { maLength: 20, showMa: true },
    inputSchemas: [
      { id: 'maLength', name: 'MA Length', type: 'number', default: 20, min: 1, max: 200 },
    ],
    defaultStyles: {
      vol: {
        color: '#089981',
        colorUp: '#089981',
        colorDown: '#f23645',
        lineWidth: 1,
        lineStyle: 'solid',
        plotType: 'histogram',
        visible: true,
        lastValueVisible: false,
        priceLineVisible: false,
      },
      ma: {
        color: '#2962FF',
        lineWidth: 1,
        lineStyle: 'solid',
        plotType: 'line',
        visible: false,
        lastValueVisible: false,
        priceLineVisible: false,
      },
    },
    plotLabels: { vol: 'Volume', ma: 'Volume MA' },
  },

  sma: {
    type: 'sma',
    name: 'Simple Moving Average (SMA)',
    shortName: 'SMA',
    category: 'overlay',
    description: 'Calculates the unweighted mean of the previous N price bars.',
    defaultInputs: { length: 20, source: 'close' },
    inputSchemas: [
      { id: 'length', name: 'Length', type: 'number', default: 20, min: 1, max: 1000 },
      { id: 'source', name: 'Source', type: 'source', default: 'close', options: SOURCE_OPTIONS },
    ],
    defaultStyles: {
      plot: { color: '#2962FF', lineWidth: 2, lineStyle: 'solid', plotType: 'line', visible: true },
    },
    plotLabels: { plot: 'SMA' },
  },

  ema: {
    type: 'ema',
    name: 'Exponential Moving Average (EMA)',
    shortName: 'EMA',
    category: 'overlay',
    description: 'Places greater weight and significance on the most recent price data points.',
    defaultInputs: { length: 20, source: 'close' },
    inputSchemas: [
      { id: 'length', name: 'Length', type: 'number', default: 20, min: 1, max: 1000 },
      { id: 'source', name: 'Source', type: 'source', default: 'close', options: SOURCE_OPTIONS },
    ],
    defaultStyles: {
      plot: { color: '#FF9800', lineWidth: 2, lineStyle: 'solid', plotType: 'line', visible: true },
    },
    plotLabels: { plot: 'EMA' },
  },

  wma: {
    type: 'wma',
    name: 'Weighted Moving Average (WMA)',
    shortName: 'WMA',
    category: 'overlay',
    description: 'Assigns a heavier weighting to more current data points linearly.',
    defaultInputs: { length: 20, source: 'close' },
    inputSchemas: [
      { id: 'length', name: 'Length', type: 'number', default: 20, min: 1, max: 1000 },
      { id: 'source', name: 'Source', type: 'source', default: 'close', options: SOURCE_OPTIONS },
    ],
    defaultStyles: {
      plot: { color: '#9C27B0', lineWidth: 2, lineStyle: 'solid', plotType: 'line', visible: true },
    },
    plotLabels: { plot: 'WMA' },
  },

  hma: {
    type: 'hma',
    name: 'Hull Moving Average (HMA)',
    shortName: 'HMA',
    category: 'overlay',
    description: 'Extremely responsive moving average that almost eliminates lag while smoothing.',
    defaultInputs: { length: 20, source: 'close' },
    inputSchemas: [
      { id: 'length', name: 'Length', type: 'number', default: 20, min: 2, max: 1000 },
      { id: 'source', name: 'Source', type: 'source', default: 'close', options: SOURCE_OPTIONS },
    ],
    defaultStyles: {
      plot: { color: '#00BCD4', lineWidth: 2, lineStyle: 'solid', plotType: 'line', visible: true },
    },
    plotLabels: { plot: 'HMA' },
  },

  vwap: {
    type: 'vwap',
    name: 'Volume Weighted Average Price (VWAP)',
    shortName: 'VWAP',
    category: 'overlay',
    description: 'Ratio of the value traded to total volume traded over a session period.',
    defaultInputs: { anchor: 'session' },
    inputSchemas: [
      {
        id: 'anchor',
        name: 'Anchor Period',
        type: 'select',
        default: 'session',
        options: [
          { label: 'Session (Auto / Exchange Open)', value: 'session' },
          { label: 'Session (UTC 00:00)', value: 'session_utc' },
          { label: 'Week', value: 'week' },
          { label: 'Month', value: 'month' },
          { label: 'Year', value: 'year' },
        ],
      },
    ],
    defaultStyles: {
      plot: { color: '#E91E63', lineWidth: 2, lineStyle: 'solid', plotType: 'line', visible: true },
    },
    plotLabels: { plot: 'VWAP' },
  },

  bollinger_bands: {
    type: 'bollinger_bands',
    name: 'Bollinger Bands (BB)',
    shortName: 'BB',
    category: 'overlay',
    description: 'Volatility bands placed above and below a moving average by standard deviation.',
    defaultInputs: { length: 20, multiplier: 2.0, source: 'close' },
    inputSchemas: [
      { id: 'length', name: 'Length', type: 'number', default: 20, min: 1, max: 500 },
      { id: 'multiplier', name: 'StdDev Multiplier', type: 'number', default: 2.0, min: 0.1, max: 10, step: 0.1 },
      { id: 'source', name: 'Source', type: 'source', default: 'close', options: SOURCE_OPTIONS },
    ],
    defaultStyles: {
      upper: { color: '#2962FF', lineWidth: 1, lineStyle: 'solid', plotType: 'line', visible: true },
      basis: { color: '#FF6D00', lineWidth: 1, lineStyle: 'solid', plotType: 'line', visible: true },
      lower: { color: '#2962FF', lineWidth: 1, lineStyle: 'solid', plotType: 'line', visible: true },
    },
    plotLabels: { upper: 'Upper Band', basis: 'Basis (SMA)', lower: 'Lower Band' },
    defaultBands: [
      { id: 'bb_fill', upperPlotId: 'upper', lowerPlotId: 'lower', fillColor: 'rgba(41, 98, 255, 0.08)', visible: true },
    ],
  },

  keltner_channels: {
    type: 'keltner_channels',
    name: 'Keltner Channels (KC)',
    shortName: 'KC',
    category: 'overlay',
    description: 'Volatility-based envelopes set above and below an EMA using Average True Range.',
    defaultInputs: { emaLength: 20, atrLength: 10, multiplier: 2.0, source: 'close' },
    inputSchemas: [
      { id: 'emaLength', name: 'EMA Length', type: 'number', default: 20, min: 1, max: 500 },
      { id: 'atrLength', name: 'ATR Length', type: 'number', default: 10, min: 1, max: 500 },
      { id: 'multiplier', name: 'ATR Multiplier', type: 'number', default: 2.0, min: 0.1, max: 10, step: 0.1 },
      { id: 'source', name: 'Source', type: 'source', default: 'close', options: SOURCE_OPTIONS },
    ],
    defaultStyles: {
      upper: { color: '#00897B', lineWidth: 1, lineStyle: 'solid', plotType: 'line', visible: true },
      basis: { color: '#26A69A', lineWidth: 1, lineStyle: 'solid', plotType: 'line', visible: true },
      lower: { color: '#00897B', lineWidth: 1, lineStyle: 'solid', plotType: 'line', visible: true },
    },
    plotLabels: { upper: 'Upper Channel', basis: 'Basis (EMA)', lower: 'Lower Channel' },
    defaultBands: [
      { id: 'kc_fill', upperPlotId: 'upper', lowerPlotId: 'lower', fillColor: 'rgba(0, 137, 123, 0.08)', visible: true },
    ],
  },

  supertrend: {
    type: 'supertrend',
    name: 'SuperTrend',
    shortName: 'SuperTrend',
    category: 'overlay',
    description: 'Trend-following indicator based on Average True Range with dynamic trailing stop flips.',
    defaultInputs: { atrPeriod: 10, multiplier: 3.0 },
    inputSchemas: [
      { id: 'atrPeriod', name: 'ATR Period', type: 'number', default: 10, min: 1, max: 200 },
      { id: 'multiplier', name: 'Multiplier', type: 'number', default: 3.0, min: 0.1, max: 20, step: 0.1 },
    ],
    defaultStyles: {
      trend: { color: '#089981', lineWidth: 2, lineStyle: 'solid', plotType: 'line', visible: true },
    },
    plotLabels: { trend: 'SuperTrend' },
  },

  parabolic_sar: {
    type: 'parabolic_sar',
    name: 'Parabolic SAR (PSAR)',
    shortName: 'PSAR',
    category: 'overlay',
    description: 'Highlights trend direction and potential reversal points with trailing dots.',
    defaultInputs: { start: 0.02, increment: 0.02, maximum: 0.2 },
    inputSchemas: [
      { id: 'start', name: 'Start AF', type: 'number', default: 0.02, min: 0.001, max: 1, step: 0.005 },
      { id: 'increment', name: 'Increment AF', type: 'number', default: 0.02, min: 0.001, max: 1, step: 0.005 },
      { id: 'maximum', name: 'Maximum AF', type: 'number', default: 0.2, min: 0.01, max: 1, step: 0.01 },
    ],
    defaultStyles: {
      sar: { color: '#2196F3', lineWidth: 2, lineStyle: 'solid', plotType: 'circles', visible: true },
    },
    plotLabels: { sar: 'Parabolic SAR' },
  },

  // ===================== SUB-PANES (OSCILLATORS) =====================
  rsi: {
    type: 'rsi',
    name: 'Relative Strength Index (RSI)',
    shortName: 'RSI',
    category: 'subpane',
    description: 'Momentum oscillator that measures the speed and change of price movements.',
    defaultInputs: { length: 14, source: 'close' },
    inputSchemas: [
      { id: 'length', name: 'Length', type: 'number', default: 14, min: 1, max: 500 },
      { id: 'source', name: 'Source', type: 'source', default: 'close', options: SOURCE_OPTIONS },
    ],
    defaultStyles: {
      rsi: { color: '#7E57C2', lineWidth: 2, lineStyle: 'solid', plotType: 'line', visible: true },
    },
    plotLabels: { rsi: 'RSI' },
    defaultLevels: [
      { value: 70, color: '#787B86', lineStyle: 'dashed', lineWidth: 1, label: 'Overbought (70)', visible: true },
      { value: 50, color: '#434651', lineStyle: 'dotted', lineWidth: 1, label: 'Midline (50)', visible: true },
      { value: 30, color: '#787B86', lineStyle: 'dashed', lineWidth: 1, label: 'Oversold (30)', visible: true },
    ],
  },

  macd: {
    type: 'macd',
    name: 'Moving Average Convergence Divergence (MACD)',
    shortName: 'MACD',
    category: 'subpane',
    description: 'Trend-following momentum indicator showing relationship between two exponential averages.',
    defaultInputs: { fastLength: 12, slowLength: 26, signalLength: 9, source: 'close' },
    inputSchemas: [
      { id: 'fastLength', name: 'Fast Length', type: 'number', default: 12, min: 1, max: 500 },
      { id: 'slowLength', name: 'Slow Length', type: 'number', default: 26, min: 1, max: 500 },
      { id: 'signalLength', name: 'Signal Smoothing', type: 'number', default: 9, min: 1, max: 200 },
      { id: 'source', name: 'Source', type: 'source', default: 'close', options: SOURCE_OPTIONS },
    ],
    defaultStyles: {
      macd: { color: '#2962FF', lineWidth: 1.5, lineStyle: 'solid', plotType: 'line', visible: true },
      signal: { color: '#FF6D00', lineWidth: 1.5, lineStyle: 'solid', plotType: 'line', visible: true },
      hist: { color: '#089981', lineWidth: 2, lineStyle: 'solid', plotType: 'histogram', visible: true },
    },
    plotLabels: { macd: 'MACD Line', signal: 'Signal Line', hist: 'Histogram' },
    defaultLevels: [
      { value: 0, color: '#434651', lineStyle: 'solid', lineWidth: 1, label: 'Zero', visible: true },
    ],
  },

  stochastic: {
    type: 'stochastic',
    name: 'Stochastic Oscillator (Stoch)',
    shortName: 'Stoch',
    category: 'subpane',
    description: 'Compares a particular closing price to a range of prices over a given period of time.',
    defaultInputs: { kLength: 14, kSmoothing: 1, dSmoothing: 3 },
    inputSchemas: [
      { id: 'kLength', name: '%K Length', type: 'number', default: 14, min: 1, max: 500 },
      { id: 'kSmoothing', name: '%K Smoothing', type: 'number', default: 1, min: 1, max: 100 },
      { id: 'dSmoothing', name: '%D Smoothing', type: 'number', default: 3, min: 1, max: 100 },
    ],
    defaultStyles: {
      k: { color: '#2962FF', lineWidth: 1.5, lineStyle: 'solid', plotType: 'line', visible: true },
      d: { color: '#FF6D00', lineWidth: 1.5, lineStyle: 'solid', plotType: 'line', visible: true },
    },
    plotLabels: { k: '%K Line', d: '%D Line' },
    defaultLevels: [
      { value: 80, color: '#787B86', lineStyle: 'dashed', lineWidth: 1, label: 'Upper (80)', visible: true },
      { value: 20, color: '#787B86', lineStyle: 'dashed', lineWidth: 1, label: 'Lower (20)', visible: true },
    ],
  },

  stoch_rsi: {
    type: 'stoch_rsi',
    name: 'Stochastic RSI (Stoch RSI)',
    shortName: 'Stoch RSI',
    category: 'subpane',
    description: 'Applies the Stochastic formula to RSI values rather than standard price data.',
    defaultInputs: { rsiLength: 14, stochLength: 14, k: 3, d: 3, source: 'close' },
    inputSchemas: [
      { id: 'rsiLength', name: 'RSI Length', type: 'number', default: 14, min: 1, max: 500 },
      { id: 'stochLength', name: 'Stochastic Length', type: 'number', default: 14, min: 1, max: 500 },
      { id: 'k', name: '%K Smoothing', type: 'number', default: 3, min: 1, max: 100 },
      { id: 'd', name: '%D Smoothing', type: 'number', default: 3, min: 1, max: 100 },
      { id: 'source', name: 'Source', type: 'source', default: 'close', options: SOURCE_OPTIONS },
    ],
    defaultStyles: {
      k: { color: '#2962FF', lineWidth: 1.5, lineStyle: 'solid', plotType: 'line', visible: true },
      d: { color: '#FF6D00', lineWidth: 1.5, lineStyle: 'solid', plotType: 'line', visible: true },
    },
    plotLabels: { k: '%K Line', d: '%D Line' },
    defaultLevels: [
      { value: 80, color: '#787B86', lineStyle: 'dashed', lineWidth: 1, label: 'Upper (80)', visible: true },
      { value: 20, color: '#787B86', lineStyle: 'dashed', lineWidth: 1, label: 'Lower (20)', visible: true },
    ],
  },

  atr: {
    type: 'atr',
    name: 'Average True Range (ATR)',
    shortName: 'ATR',
    category: 'subpane',
    description: 'Technical analysis volatility indicator that measures market volatility over a period.',
    defaultInputs: { length: 14 },
    inputSchemas: [
      { id: 'length', name: 'Length', type: 'number', default: 14, min: 1, max: 500 },
    ],
    defaultStyles: {
      atr: { color: '#AB47BC', lineWidth: 2, lineStyle: 'solid', plotType: 'line', visible: true },
    },
    plotLabels: { atr: 'ATR' },
  },

  cci: {
    type: 'cci',
    name: 'Commodity Channel Index (CCI)',
    shortName: 'CCI',
    category: 'subpane',
    description: 'Versatile momentum-based oscillator to identify cyclic trends and overbought/oversold levels.',
    defaultInputs: { length: 20 },
    inputSchemas: [
      { id: 'length', name: 'Length', type: 'number', default: 20, min: 1, max: 500 },
    ],
    defaultStyles: {
      cci: { color: '#FF9800', lineWidth: 1.5, lineStyle: 'solid', plotType: 'line', visible: true },
    },
    plotLabels: { cci: 'CCI' },
    defaultLevels: [
      { value: 100, color: '#787B86', lineStyle: 'dashed', lineWidth: 1, label: '+100 Level', visible: true },
      { value: -100, color: '#787B86', lineStyle: 'dashed', lineWidth: 1, label: '-100 Level', visible: true },
    ],
  },

  williams_r: {
    type: 'williams_r',
    name: 'Williams %R',
    shortName: 'Williams %R',
    category: 'subpane',
    description: 'Negative momentum oscillator moving between 0 and -100 to gauge market exhaustion.',
    defaultInputs: { length: 14 },
    inputSchemas: [
      { id: 'length', name: 'Length', type: 'number', default: 14, min: 1, max: 500 },
    ],
    defaultStyles: {
      williams: { color: '#26C6DA', lineWidth: 1.5, lineStyle: 'solid', plotType: 'line', visible: true },
    },
    plotLabels: { williams: 'Williams %R' },
    defaultLevels: [
      { value: -20, color: '#787B86', lineStyle: 'dashed', lineWidth: 1, label: 'Overbought (-20)', visible: true },
      { value: -80, color: '#787B86', lineStyle: 'dashed', lineWidth: 1, label: 'Oversold (-80)', visible: true },
    ],
  },

  adx: {
    type: 'adx',
    name: 'Average Directional Index (ADX / DMI)',
    shortName: 'ADX',
    category: 'subpane',
    description: 'Measures the overall strength of a trend irrespective of upward or downward direction.',
    defaultInputs: { adxLength: 14, diLength: 14 },
    inputSchemas: [
      { id: 'adxLength', name: 'ADX Smoothing', type: 'number', default: 14, min: 1, max: 200 },
      { id: 'diLength', name: 'DI Length', type: 'number', default: 14, min: 1, max: 200 },
    ],
    defaultStyles: {
      adx: { color: '#E91E63', lineWidth: 2, lineStyle: 'solid', plotType: 'line', visible: true },
      plusDi: { color: '#089981', lineWidth: 1, lineStyle: 'solid', plotType: 'line', visible: true },
      minusDi: { color: '#F23645', lineWidth: 1, lineStyle: 'solid', plotType: 'line', visible: true },
    },
    plotLabels: { adx: 'ADX', plusDi: '+DI Line', minusDi: '-DI Line' },
    defaultLevels: [
      { value: 25, color: '#787B86', lineStyle: 'dotted', lineWidth: 1, label: 'Trend Level (25)', visible: true },
    ],
  },

  obv: {
    type: 'obv',
    name: 'On-Balance Volume (OBV)',
    shortName: 'OBV',
    category: 'subpane',
    description: 'Uses volume flow to predict changes in stock price, measuring buying and selling pressure.',
    defaultInputs: {},
    inputSchemas: [],
    defaultStyles: {
      obv: { color: '#2962FF', lineWidth: 1.5, lineStyle: 'solid', plotType: 'line', visible: true },
    },
    plotLabels: { obv: 'OBV' },
  },
};

export const ALL_INDICATOR_TYPES: IndicatorType[] = Object.keys(INDICATOR_REGISTRY) as IndicatorType[];
