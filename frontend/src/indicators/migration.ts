// ORDERCRAFT Backward-Compatible Indicator Migration Service
// Migrates legacy 19 indicator configurations to Wickra catalog IDs, input keys, and plot styles.
// Strictly adheres to AGENTS.md § 3.2: strict: true, ZERO any types allowed.

import type {
  IndicatorInstance,
  IndicatorInputValue,
  IndicatorInputValues,
  IndicatorPlotStyle,
  IndicatorBandStyle,
  IndicatorCategory,
} from './types';

/**
 * Mapping from legacy indicator IDs and shorthand aliases to canonical Wickra catalog IDs.
 */
export const LEGACY_INDICATOR_MAP: Record<string, string> = {
  // Legacy 19 indicators
  volume: 'wickra.volume',
  sma: 'wickra.sma',
  ema: 'wickra.ema',
  wma: 'wickra.wma',
  hma: 'wickra.hma',
  vwap: 'wickra.vwap',
  vwap_std_dev_bands: 'wickra.vwap',
  'wickra.vwap_std_dev_bands': 'wickra.vwap',
  bollinger_bands: 'wickra.bollinger_bands',
  keltner_channels: 'wickra.keltner',
  supertrend: 'wickra.super_trend',
  parabolic_sar: 'wickra.psar',
  rsi: 'wickra.rsi',
  macd: 'wickra.macd',
  stochastic: 'wickra.stochastic',
  stoch_rsi: 'wickra.stoch_rsi',
  atr: 'wickra.atr',
  cci: 'wickra.cci',
  williams_r: 'wickra.williams_r',
  adx: 'wickra.adx',
  obv: 'wickra.obv',
  adl: 'wickra.adl',
  anchored_vwap: 'wickra.anchored_vwap',
  avwap: 'wickra.anchored_vwap',

  // Common shorthand aliases
  bollinger: 'wickra.bollinger_bands',
  bb: 'wickra.bollinger_bands',
  keltner: 'wickra.keltner',
  kc: 'wickra.keltner',
  super_trend: 'wickra.super_trend',
  st: 'wickra.super_trend',
  psar: 'wickra.psar',
  sar: 'wickra.psar',
  stoch: 'wickra.stochastic',
  wpr: 'wickra.williams_r',
  williams: 'wickra.williams_r',
  vol: 'wickra.volume',
  vwma: 'wickra.vwma',
  mfi: 'wickra.mfi',
  ichimoku: 'wickra.ichimoku',
  pivot_points: 'wickra.pivot_points',
  pivots: 'wickra.pivot_points',
  classic_pivots: 'wickra.pivot_points',

  // Aliases needing normalization to canonical catalog.go IDs
  'wickra.keltner_channels': 'wickra.keltner',
  'wickra.supertrend': 'wickra.super_trend',
  'wickra.parabolic_sar': 'wickra.psar',
  'wickra.bb': 'wickra.bollinger_bands',
  'wickra.classic_pivots': 'wickra.pivot_points',

  // Trend-following / multi-state regime aliases
  t3: 'wickra.t3',
  hull_ma: 'wickra.hma',
  atr_ratchet: 'wickra.atr_ratchet',
  elder_safe_zone: 'wickra.elder_safe_zone',
  kase_dev_stop: 'wickra.kase_dev_stop',
  modified_ma_stop: 'wickra.modified_ma_stop',
  nrtr: 'wickra.nrtr',
};

export const CANONICAL_INDICATOR_MAP = LEGACY_INDICATOR_MAP;

/**
 * Set of canonical indicator IDs that feature regime-dependent or trend-dependent multi-color lines.
 * Corresponds to catalog.go & runtime.go multi-state support.
 */
export const MULTI_COLOR_TREND_INDICATORS = new Set<string>([
  'wickra.super_trend',
  'wickra.atr_ratchet',
  'wickra.elder_safe_zone',
  'wickra.kase_dev_stop',
  'wickra.modified_ma_stop',
  'wickra.nrtr',
  'wickra.t3',
  'wickra.hma',
]);

/**
 * Checks whether an indicator is a multi-color trend or regime indicator.
 */
export function isMultiColorTrendIndicator(rawType: string): boolean {
  const norm = normalizeIndicatorId(rawType);
  return MULTI_COLOR_TREND_INDICATORS.has(norm);
}

/**
 * Normalizes any legacy, shorthand, or catalog ID to its canonical Wickra identifier.
 */
export function normalizeIndicatorId(rawId: string): string {
  if (!rawId || typeof rawId !== 'string') return 'wickra.volume';
  const clean = rawId.trim();
  if (LEGACY_INDICATOR_MAP[clean]) {
    return LEGACY_INDICATOR_MAP[clean];
  }
  const lower = clean.toLowerCase();
  if (LEGACY_INDICATOR_MAP[lower]) {
    return LEGACY_INDICATOR_MAP[lower];
  }
  if (clean.startsWith('wickra.script.') || clean.startsWith('wickra.custom.') || clean.startsWith('wickra.user.')) {
    return clean.slice(7);
  }
  if (clean.startsWith('script.') || clean.startsWith('custom.') || clean.startsWith('user.')) {
    return clean;
  }
  if (clean.startsWith('wickra.')) {
    return clean;
  }
  return `wickra.${clean}`;
}

let customSubpaneChecker: ((id: string) => boolean | undefined) | null = null;

/**
 * Registers an optional dynamic registry checker for subpane detection.
 */
export function registerSubpaneChecker(checker: (id: string) => boolean | undefined): void {
  customSubpaneChecker = checker;
}

/**
 * Determines whether the given indicator identifier belongs in a separate subpane (oscillator).
 */
export function isSubpaneIndicator(type: string): boolean {
  const norm = normalizeIndicatorId(type);
  if (customSubpaneChecker) {
    const res = customSubpaneChecker(norm);
    if (typeof res === 'boolean') return res;
    const resOrig = customSubpaneChecker(type);
    if (typeof resOrig === 'boolean') return resOrig;
  }
  const subpaneSet = new Set([
    'wickra.rsi',
    'wickra.macd',
    'wickra.stochastic',
    'wickra.stoch_rsi',
    'wickra.atr',
    'wickra.cci',
    'wickra.williams_r',
    'wickra.adx',
    'wickra.obv',
    'wickra.mfi',
    'wickra.adl',
  ]);
  return subpaneSet.has(norm);
}

/**
 * Safely sanitizes an unknown value into an IndicatorInputValue (string | number | boolean).
 */
function sanitizeInputValue(val: unknown): IndicatorInputValue {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  if (typeof val === 'boolean') {
    return val;
  }
  if (typeof val === 'string') {
    return val;
  }
  return String(val ?? '');
}

/**
 * Migrates legacy parameter keys to their corresponding Wickra input IDs.
 */
export function migrateIndicatorInputs(
  rawType: string,
  rawInputs: Record<string, unknown> = {}
): IndicatorInputValues {
  const normType = normalizeIndicatorId(rawType);
  const inputs: IndicatorInputValues = {};

  for (const [key, value] of Object.entries(rawInputs)) {
    if (value !== undefined) {
      inputs[key] = sanitizeInputValue(value);
    }
  }

  // Generic length -> period mapping
  if (inputs.length !== undefined && inputs.period === undefined) {
    inputs.period = inputs.length;
  }

  switch (normType) {
    case 'wickra.macd':
      if (inputs.fastLength !== undefined && inputs.fast === undefined) inputs.fast = inputs.fastLength;
      if (inputs.slowLength !== undefined && inputs.slow === undefined) inputs.slow = inputs.slowLength;
      if (inputs.signalLength !== undefined && inputs.signal === undefined) inputs.signal = inputs.signalLength;
      break;

    case 'wickra.keltner':
      if (inputs.emaLength !== undefined && inputs.ema_period === undefined) inputs.ema_period = inputs.emaLength;
      if (inputs.atrLength !== undefined && inputs.atr_period === undefined) inputs.atr_period = inputs.atrLength;
      break;

    case 'wickra.super_trend':
      if (inputs.atrPeriod !== undefined && inputs.atr_period === undefined) inputs.atr_period = inputs.atrPeriod;
      break;

    case 'wickra.psar':
      if (inputs.start !== undefined && inputs.af_start === undefined) inputs.af_start = inputs.start;
      if (inputs.increment !== undefined && inputs.af_step === undefined) inputs.af_step = inputs.increment;
      if (inputs.maximum !== undefined && inputs.af_max === undefined) inputs.af_max = inputs.maximum;
      break;

    case 'wickra.stochastic':
      if (inputs.kLength !== undefined && inputs.k_period === undefined) inputs.k_period = inputs.kLength;
      if (inputs.dSmoothing !== undefined && inputs.d_period === undefined) inputs.d_period = inputs.dSmoothing;
      break;

    case 'wickra.stoch_rsi':
      if (inputs.rsiLength !== undefined && inputs.rsi_period === undefined) inputs.rsi_period = inputs.rsiLength;
      if (inputs.stochLength !== undefined && inputs.stoch_period === undefined) inputs.stoch_period = inputs.stochLength;
      break;

    case 'wickra.adx':
      if (inputs.adxLength !== undefined && inputs.period === undefined) inputs.period = inputs.adxLength;
      break;

    case 'wickra.ichimoku':
      if (inputs.tenkanPeriod !== undefined && inputs.tenkan_period === undefined) inputs.tenkan_period = inputs.tenkanPeriod;
      if (inputs.kijunPeriod !== undefined && inputs.kijun_period === undefined) inputs.kijun_period = inputs.kijunPeriod;
      if (inputs.senkouBPeriod !== undefined && inputs.senkou_b_period === undefined) inputs.senkou_b_period = inputs.senkouBPeriod;
      break;

    case 'wickra.vwap':
      if (inputs.anchor_period === undefined) inputs.anchor_period = (inputs.anchor as string) || 'session';
      if (inputs.source === undefined) inputs.source = 'hlc3';
      if (inputs.offset === undefined) inputs.offset = 0;
      if (inputs.bands_calculation_mode === undefined) inputs.bands_calculation_mode = 'stdev';
      if (inputs.bands_multiplier_1 === undefined) inputs.bands_multiplier_1 = 1.0;
      if (inputs.bands_multiplier_2 === undefined) inputs.bands_multiplier_2 = 2.0;
      if (inputs.bands_multiplier_3 === undefined) inputs.bands_multiplier_3 = 3.0;
      break;
  }

  return inputs;
}

/**
 * Migrates legacy plot style keys to their corresponding Wickra plot series IDs.
 */
export function migrateIndicatorStyles(
  rawType: string,
  rawStyles: Record<string, IndicatorPlotStyle> = {}
): Record<string, IndicatorPlotStyle> {
  const normType = normalizeIndicatorId(rawType);
  const styles: Record<string, IndicatorPlotStyle> = { ...rawStyles };

  // 1. Multi-color trend & regime indicator migration (Supertrend, Tillson T3, HMA, Trailing Stops)
  if (isMultiColorTrendIndicator(normType)) {
    const legacy = styles.value || styles.plot || styles.trend || styles.stop;
    const lineWidth = legacy?.lineWidth ?? 2;
    const lineStyle = legacy?.lineStyle ?? 'solid';
    const plotType = legacy?.plotType ?? 'line';
    const visible = legacy?.visible !== false;
    const lastValueVisible = legacy?.lastValueVisible !== false;

    if (!styles.up) {
      styles.up = {
        color: legacy?.colorUp || '#089981',
        lineWidth,
        lineStyle,
        plotType,
        visible,
        lastValueVisible,
        priceLineVisible: false,
      };
    }
    if (!styles.down) {
      styles.down = {
        color: legacy?.colorDown || '#F23645',
        lineWidth,
        lineStyle,
        plotType,
        visible,
        lastValueVisible,
        priceLineVisible: false,
      };
    }

    // Suppress auxiliary/legacy single line plots to eliminate duplicate bridge lines
    if (styles.value) {
      styles.value = { ...styles.value, visible: false };
    } else {
      styles.value = {
        color: '#2962FF',
        lineWidth: 1,
        lineStyle: 'solid',
        plotType: 'line',
        visible: false,
        lastValueVisible: false,
        priceLineVisible: false,
      };
    }

    if (styles.direction) {
      styles.direction = { ...styles.direction, visible: false };
    } else {
      styles.direction = {
        color: '#2962FF',
        lineWidth: 1,
        lineStyle: 'solid',
        plotType: 'line',
        visible: false,
        lastValueVisible: false,
        priceLineVisible: false,
      };
    }

    if (styles.trend) {
      styles.trend = { ...styles.trend, visible: false };
    }
    if (styles.plot && (normType === 'wickra.super_trend' || normType === 'wickra.t3' || normType === 'wickra.hma')) {
      styles.plot = { ...styles.plot, visible: false };
    }
  }

  // 2. Existing legacy migrations for other indicators
  switch (normType) {
    case 'wickra.bollinger_bands':
    case 'wickra.keltner':
      if (styles.basis && !styles.middle) {
        styles.middle = { ...styles.basis };
      }
      break;

    case 'wickra.macd':
      if (styles.hist && !styles.histogram) {
        styles.histogram = { ...styles.hist };
      }
      break;

    case 'wickra.psar':
      if (styles.sar && !styles.plot) {
        styles.plot = { ...styles.sar };
      }
      break;

    case 'wickra.rsi':
      if (styles.rsi && !styles.plot) {
        styles.plot = { ...styles.rsi };
      }
      break;

    case 'wickra.atr':
      if (styles.atr && !styles.plot) {
        styles.plot = { ...styles.atr };
      }
      break;

    case 'wickra.cci':
      if (styles.cci && !styles.plot) {
        styles.plot = { ...styles.cci };
      }
      break;

    case 'wickra.williams_r':
      if (styles.williams && !styles.plot) {
        styles.plot = { ...styles.williams };
      }
      break;

    case 'wickra.obv':
      if (styles.obv && !styles.plot) {
        styles.plot = { ...styles.obv };
      }
      break;

    case 'wickra.stoch_rsi':
      if (styles.k && !styles.plot) {
        styles.plot = { ...styles.k };
      }
      break;

    case 'wickra.vwap':
      if (!styles.plot && styles.vwap) {
        styles.plot = { ...styles.vwap };
      }
      if (!styles.plot) {
        styles.plot = {
          color: '#2962FF',
          lineWidth: 2,
          lineStyle: 'solid',
          plotType: 'line',
          visible: true,
          lastValueVisible: true,
          priceLineVisible: false,
        };
      }
      if (!styles.upper_1) {
        styles.upper_1 = {
          color: '#089981',
          lineWidth: 1,
          lineStyle: 'solid',
          plotType: 'line',
          visible: true,
          lastValueVisible: true,
          priceLineVisible: false,
        };
      }
      if (!styles.lower_1) {
        styles.lower_1 = {
          color: '#089981',
          lineWidth: 1,
          lineStyle: 'solid',
          plotType: 'line',
          visible: true,
          lastValueVisible: true,
          priceLineVisible: false,
        };
      }
      if (!styles.upper_2) {
        styles.upper_2 = {
          color: '#089981',
          lineWidth: 1,
          lineStyle: 'solid',
          plotType: 'line',
          visible: false,
          lastValueVisible: true,
          priceLineVisible: false,
        };
      }
      if (!styles.lower_2) {
        styles.lower_2 = {
          color: '#089981',
          lineWidth: 1,
          lineStyle: 'solid',
          plotType: 'line',
          visible: false,
          lastValueVisible: true,
          priceLineVisible: false,
        };
      }
      if (!styles.upper_3) {
        styles.upper_3 = {
          color: '#089981',
          lineWidth: 1,
          lineStyle: 'solid',
          plotType: 'line',
          visible: false,
          lastValueVisible: true,
          priceLineVisible: false,
        };
      }
      if (!styles.lower_3) {
        styles.lower_3 = {
          color: '#089981',
          lineWidth: 1,
          lineStyle: 'solid',
          plotType: 'line',
          visible: false,
          lastValueVisible: true,
          priceLineVisible: false,
        };
      }
      break;
  }

  return styles;
}

/**
 * Safely migrates an arbitrary indicator instance object to a fully compliant IndicatorInstance.
 */
export function migrateIndicatorInstance(inst: unknown): IndicatorInstance {
  if (!inst || typeof inst !== 'object') {
    return {
      id: `ind_migrated_${Date.now()}`,
      type: 'wickra.volume',
      paneId: 'pane-1',
      name: 'Vol',
      category: 'overlay',
      visible: true,
      inputs: {},
      styles: {},
    };
  }

  const record = inst as Record<string, unknown>;
  const rawType = typeof record.type === 'string'
    ? record.type
    : (typeof record.indicatorId === 'string' ? record.indicatorId : 'volume');

  const normType = normalizeIndicatorId(rawType);
  const rawCategory = typeof record.category === 'string' ? record.category : undefined;
  const category: IndicatorCategory = rawCategory || (isSubpaneIndicator(normType) ? 'subpane' : 'overlay');

  const rawInputs = (record.inputs && typeof record.inputs === 'object')
    ? (record.inputs as Record<string, unknown>)
    : {};
  const inputs = migrateIndicatorInputs(rawType, rawInputs);

  const rawStyles = (record.styles && typeof record.styles === 'object')
    ? (record.styles as Record<string, IndicatorPlotStyle>)
    : {};
  const styles = migrateIndicatorStyles(rawType, rawStyles);

  // Band migration for Bollinger Bands and Keltner Channels
  let bands: IndicatorBandStyle[] | undefined = Array.isArray(record.bands)
    ? (record.bands as IndicatorBandStyle[])
    : undefined;

  if (normType === 'wickra.bollinger_bands' && (!bands || bands.length === 0)) {
    bands = [
      {
        id: 'bollingerbands_fill',
        upperPlotId: 'upper',
        lowerPlotId: 'lower',
        fillColor: 'rgba(41, 98, 255, 0.08)',
        visible: true,
      },
    ];
  } else if (normType === 'wickra.keltner' && (!bands || bands.length === 0)) {
    bands = [
      {
        id: 'keltner_fill',
        upperPlotId: 'upper',
        lowerPlotId: 'lower',
        fillColor: 'rgba(0, 137, 123, 0.08)',
        visible: true,
      },
    ];
  } else if (normType === 'wickra.vwap' && (!bands || bands.length === 0)) {
    bands = [
      {
        id: 'vwap_band_1',
        title: 'Bands Fill #1',
        upperPlotId: 'upper_1',
        lowerPlotId: 'lower_1',
        fillColor: 'rgba(41, 98, 255, 0.08)',
        visible: true,
      },
      {
        id: 'vwap_band_2',
        title: 'Bands Fill #2',
        upperPlotId: 'upper_2',
        lowerPlotId: 'lower_2',
        fillColor: 'rgba(41, 98, 255, 0.04)',
        visible: false,
      },
      {
        id: 'vwap_band_3',
        title: 'Bands Fill #3',
        upperPlotId: 'upper_3',
        lowerPlotId: 'lower_3',
        fillColor: 'rgba(41, 98, 255, 0.04)',
        visible: false,
      },
    ];
  }

  const id = typeof record.id === 'string' && record.id.length > 0
    ? record.id
    : `ind_${normType}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const name = typeof record.name === 'string' && record.name.length > 0
    ? record.name
    : normType.replace('wickra.', '').toUpperCase();

  const paneId = typeof record.paneId === 'string' && record.paneId.length > 0
    ? record.paneId
    : 'pane-1';

  const visible = record.visible !== false;

  const migratedLevels = Array.isArray(record.levels)
    ? record.levels.map((lvl) => {
        let color = lvl.color;
        const rawLabel = (lvl.label || '').trim();
        const isOverbought = /overbought|upper/i.test(rawLabel) || lvl.value === 70 || lvl.value === 80;
        const isOversold = /oversold|lower/i.test(rawLabel) || lvl.value === 30 || lvl.value === 20;
        if (!color || color === '#787B86' || color === '#787b86' || color === '#434651') {
          if (isOverbought) color = '#F23645';
          else if (isOversold) color = '#089981';
        }
        const cleanLabel = rawLabel.replace(/\s*\(\s*[-+]?\d*\.?\d+\s*\)\s*$/, '');
        return {
          ...lvl,
          color,
          label: cleanLabel || lvl.label,
        };
      })
    : undefined;

  return {
    id,
    type: normType,
    paneId,
    name,
    category,
    visible,
    inputs,
    styles,
    levels: migratedLevels,
    bands,
  };
}

/**
 * Alias for migrateIndicatorInstance.
 */
export const migrateIndicator = migrateIndicatorInstance;

/**
 * Migrates an array of indicator instances.
 */
export function migrateIndicatorList(list: unknown[]): IndicatorInstance[] {
  if (!Array.isArray(list)) return [];
  return list.map((item) => migrateIndicatorInstance(item));
}

/**
 * Migrates a dictionary of indicators grouped by paneId (Record<paneId, IndicatorInstance[]>).
 */
export function migrateIndicatorsRecord(
  indicators: unknown
): Record<string, IndicatorInstance[]> {
  if (!indicators || typeof indicators !== 'object') {
    return {};
  }
  const result: Record<string, IndicatorInstance[]> = {};
  for (const [paneId, list] of Object.entries(indicators as Record<string, unknown>)) {
    if (Array.isArray(list)) {
      result[paneId] = migrateIndicatorList(list);
    } else {
      result[paneId] = [];
    }
  }
  return result;
}

/**
 * Migrates a list of favorite indicator IDs.
 */
export function migrateFavoriteIndicators(favorites: unknown): string[] {
  if (!Array.isArray(favorites)) return [];
  const set = new Set<string>();
  for (const fav of favorites) {
    if (typeof fav === 'string' && fav.trim().length > 0) {
      set.add(normalizeIndicatorId(fav.trim()));
    }
  }
  return Array.from(set);
}
