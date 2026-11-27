import type { ChartType } from '../store/syncStore';
import { getProviderFromSymbol, getProviderDisplayName } from './timeframeSupport';

export interface ChartTypeSupportResult {
  supported: boolean;
  provider: string;
  providerDisplay: string;
  reason?: string;
}

const L2_CAPABLE_PROVIDERS = new Set<string>([
  'DATABRIDGE',
  'BRIDGE',
  'L2FEED',
]);

/**
 * Checks whether a chart type is supported by the active symbol's data provider.
 * For example, 'footprint' requires a Level 2 orderflow feed with aggressive ticks/depth.
 */
export function isChartTypeSupported(symbol: string, chartType: ChartType): ChartTypeSupportResult {
  const provider = getProviderFromSymbol(symbol);
  const providerDisplay = getProviderDisplayName(provider);

  if (chartType === 'footprint') {
    const isL2 = L2_CAPABLE_PROVIDERS.has(provider.toUpperCase());
    if (!isL2) {
      return {
        supported: false,
        provider,
        providerDisplay,
        reason: `Footprint requires Level 2 orderflow feed (e.g. DataBridge). ${providerDisplay} is Level 1 only.`,
      };
    }
  }

  return {
    supported: true,
    provider,
    providerDisplay,
  };
}

/**
 * Returns a fallback chart type if the requested chart type is not supported by the symbol's provider.
 * If chartType is 'footprint' and the symbol's provider is not Level 2 capable, falls back to 'candles'.
 */
export function getFallbackChartType(symbol: string, chartType?: ChartType): ChartType {
  const ct = chartType || 'candles';
  const support = isChartTypeSupported(symbol, ct);
  if (!support.supported) {
    return 'candles';
  }
  return ct;
}
