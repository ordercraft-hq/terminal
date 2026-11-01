/**
 * Timeframe Support Matrix & Provider Capability Checker
 *
 * Checks if a specific data provider (e.g. BINANCE, OANDA, BYBIT)
 * supports a given chart timeframe/resolution.
 */

export interface TimeframeSupportResult {
  supported: boolean;
  provider: string;
  providerDisplay: string;
  reason?: string;
}

export const PROVIDER_SUPPORTED_TIMEFRAMES: Record<string, string[]> = {
  BINANCE: [
    '1s', '5s', '15s', '30s',
    '1m', '3m', '5m', '15m', '30m',
    '1h', '2h', '4h', '6h', '8h', '12h',
    '1D', '1d', '3D', '3d', '1W', '1w', '1M',
  ],
  BYBIT: [
    '1m', '3m', '5m', '15m', '30m',
    '1h', '2h', '4h', '6h', '12h',
    '1D', '1d', '1W', '1w', '1M', '1mo',
  ],
  COINBASE: [
    '1m', '5m', '15m',
    '1h', '6h',
    '1D', '1d',
  ],
  COINBASEPRO: [
    '1m', '5m', '15m',
    '1h', '6h',
    '1D', '1d',
  ],
  ALPACA: [
    '1m', '5m', '15m', '30m',
    '1h', '2h', '4h',
    '1D', '1d', '1W', '1w', '1M', '1mo',
  ],
  OANDA: [
    '5s', '10s', '15s', '30s',
    '1m', '2m', '4m', '5m', '10m', '15m', '30m',
    '1h', '2h', '3h', '4h', '6h', '8h', '12h',
    '1D', '1d', '1W', '1w', '1M', '1mo',
  ],
};

/**
 * Dynamically updates or registers supported timeframes for a provider (e.g. from backend API).
 */
export function registerProviderTimeframes(provider: string, timeframes: string[]): void {
  if (!provider || !Array.isArray(timeframes) || timeframes.length === 0) return;
  const key = provider.toUpperCase().trim();
  // Ensure variants like 1D / 1d, 1W / 1w are represented
  const set = new Set<string>();
  for (const tf of timeframes) {
    set.add(tf);
    const low = tf.toLowerCase();
    set.add(low);
    if (low === '1d' || low === 'd') { set.add('1D'); set.add('1d'); }
    if (low === '1w' || low === 'w') { set.add('1W'); set.add('1w'); }
    if (low === '1m' && tf === '1M') { set.add('1M'); set.add('1mo'); }
  }
  PROVIDER_SUPPORTED_TIMEFRAMES[key] = Array.from(set);
}

/**
 * Extracts the uppercase provider key from a full symbol (e.g. "OANDA:EUR_USD" -> "OANDA").
 * Defaults to "BINANCE" if no exchange prefix is present.
 */
export function getProviderFromSymbol(symbol: string): string {
  if (!symbol) return 'BINANCE';
  const clean = symbol.trim().toUpperCase();
  const colonIdx = clean.indexOf(':');
  if (colonIdx !== -1) {
    const prefix = clean.slice(0, colonIdx);
    if (prefix === 'COINBASE' || prefix === 'COINBASEPRO' || prefix === 'GDAX') {
      return 'COINBASE';
    }
    return prefix;
  }
  return 'BINANCE';
}

/**
 * Returns human-friendly provider name for UI badges and tooltips.
 */
export function getProviderDisplayName(provider: string): string {
  switch (provider.toUpperCase()) {
    case 'BINANCE':
      return 'Binance';
    case 'BYBIT':
      return 'Bybit';
    case 'COINBASE':
    case 'COINBASEPRO':
    case 'GDAX':
      return 'Coinbase';
    case 'ALPACA':
      return 'Alpaca';
    case 'OANDA':
      return 'OANDA';
    default:
      return provider;
  }
}

/**
 * Determines whether the specified symbol's provider supports the given timeframe.
 */
export function isTimeframeSupported(symbol: string, timeframe: string): TimeframeSupportResult {
  const provider = getProviderFromSymbol(symbol);
  const providerDisplay = getProviderDisplayName(provider);
  const supportedList = PROVIDER_SUPPORTED_TIMEFRAMES[provider];

  if (!supportedList) {
    // If unknown provider, assume supported
    return { supported: true, provider, providerDisplay };
  }

  const tf = timeframe.trim().toLowerCase();
  const supported = supportedList.some((s) => s.toLowerCase() === tf);

  return {
    supported,
    provider,
    providerDisplay,
    reason: supported ? undefined : `${providerDisplay} does not support this timeframe`,
  };
}

/**
 * Returns the nearest supported timeframe for a given symbol, defaulting to "15m" or "1m".
 */
export function getFallbackTimeframe(symbol: string, requestedTf: string): string {
  const check = isTimeframeSupported(symbol, requestedTf);
  if (check.supported) return requestedTf;

  const provider = getProviderFromSymbol(symbol);
  const list = PROVIDER_SUPPORTED_TIMEFRAMES[provider];
  if (list && list.length > 0) {
    if (list.includes('15m')) return '15m';
    if (list.includes('1m')) return '1m';
    return list[0];
  }
  return '15m';
}

/**
 * Converts a timeframe string (e.g. '1s', '15m', '1h', '1D', '1W', '1M') to seconds.
 */
export function timeframeToSeconds(tf: string): number {
  if (!tf) return 60;
  const clean = tf.trim();
  const lower = clean.toLowerCase();
  if (lower === '1s') return 1;
  if (lower === '5s') return 5;
  if (lower === '10s') return 10;
  if (lower === '15s') return 15;
  if (lower === '30s') return 30;
  if (lower.endsWith('s')) return parseInt(lower, 10) || 1;

  if (lower === '1m' || lower === '1') return 60;
  if (lower === '2m' || lower === '2') return 120;
  if (lower === '3m' || lower === '3') return 180;
  if (lower === '4m' || lower === '4') return 240;
  if (lower === '5m' || lower === '5') return 300;
  if (lower === '10m' || lower === '10') return 600;
  if (lower === '15m' || lower === '15') return 900;
  if (lower === '30m' || lower === '30') return 1800;
  if (lower === '45m' || lower === '45') return 2700;
  if (clean === '1M' || clean === 'M' || lower === '1mo') return 2592000;
  if (lower.endsWith('m')) return (parseInt(lower, 10) || 1) * 60;

  if (lower === '1h' || lower === '60') return 3600;
  if (lower === '2h' || lower === '120') return 7200;
  if (lower === '3h' || lower === '180') return 10800;
  if (lower === '4h' || lower === '240') return 14400;
  if (lower === '6h' || lower === '360') return 21600;
  if (lower === '8h' || lower === '480') return 28800;
  if (lower === '12h' || lower === '720') return 43200;
  if (lower.endsWith('h')) return (parseInt(lower, 10) || 1) * 3600;

  if (lower === '1d' || lower === 'd') return 86400;
  if (lower.endsWith('d')) return (parseInt(lower, 10) || 1) * 86400;

  if (lower === '1w' || lower === 'w') return 604800;
  if (lower.endsWith('w')) return (parseInt(lower, 10) || 1) * 604800;

  return 60;
}
