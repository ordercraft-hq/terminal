/**
 * Dynamic Price Precision & Tick Size Detection
 *
 * Automatically calculates the optimal decimal precision, tick size, and minMove
 * for any asset (Forex, Crypto, Commodities, Futures) based on price magnitude,
 * symbol characteristics, or actual candle data.
 */

export interface PriceFormatConfig {
  type: 'price';
  precision: number;
  minMove: number;
}

/**
 * Returns the expected decimal precision based on symbol conventions and/or a sample price.
 */
export function getPriceDecimals(symbol: string, samplePrice?: number): number {
  const sym = (symbol || '').toUpperCase().trim();
  const clean = sym.includes(':') ? sym.split(':')[1] : sym;

  // 1. Known Indices, Futures, and Commodities: always 2 decimals
  if (
    clean.includes('NAS100') ||
    clean.includes('US100') ||
    clean.includes('USTEC') ||
    clean.includes('SPX500') ||
    clean.includes('US500') ||
    clean.includes('SP500') ||
    clean.includes('US30') ||
    clean.includes('WS30') ||
    clean.includes('DE30') ||
    clean.includes('DE40') ||
    clean.includes('UK100') ||
    clean.includes('JP225') ||
    clean.includes('EU50') ||
    clean.startsWith('NQ') ||
    clean.startsWith('ENQ') ||
    clean.startsWith('MNQ') ||
    clean.startsWith('ES') ||
    clean.startsWith('MES') ||
    clean.startsWith('YM') ||
    clean.startsWith('MYM') ||
    clean.startsWith('GC') ||
    clean.startsWith('CL') ||
    clean.includes('XAU') ||
    clean.includes('WTICO') ||
    clean.includes('BCO')
  ) {
    return 2;
  }

  // 2. If we have an actual sample price, determine precision by magnitude & asset type
  if (samplePrice !== undefined && samplePrice !== null && !isNaN(samplePrice) && samplePrice > 0) {
    if (samplePrice < 0.0001) return 8; // micro caps, meme tokens
    if (samplePrice < 0.01) return 6;   // small crypto
    if (samplePrice < 0.1) return 5;
    if (samplePrice < 20) {
      if (clean.includes('JPY')) return 3;
      return 5;
    }
    if (samplePrice < 1000) {
      if (clean.includes('JPY')) return 3;
      return 2;
    }
    return 2;
  }

  // 3. Forex currency pairs:
  if (
    clean.includes('EUR') ||
    clean.includes('GBP') ||
    clean.includes('AUD') ||
    clean.includes('NZD') ||
    clean.includes('CAD') ||
    clean.includes('CHF')
  ) {
    if (clean.includes('JPY')) return 3;
    return 5;
  }

  if (clean.includes('DOGE') || clean.includes('XRP') || clean.includes('ADA') || clean.includes('TRX')) {
    return 4;
  }

  if (clean.includes('SHIB') || clean.includes('PEPE') || clean.includes('BONK') || clean.includes('FLOKI')) {
    return 8;
  }

  return 2;
}

/**
 * Returns known tick size for common futures contracts, indices, and asset classes.
 */
export function getSymbolTickSize(symbol: string): number | null {
  const sym = (symbol || '').toUpperCase().trim();
  const clean = sym.includes(':') ? sym.split(':')[1] : sym;

  // OANDA index CFDs have fine tick increments (0.01 / 0.1) rather than CME futures ticks (0.25 / 1.0)
  if (sym.includes('OANDA')) {
    return null;
  }

  // 1. E-mini & Micro Nasdaq Futures / Index (0.25 tick)
  if (
    clean.startsWith('ENQ') ||
    clean.startsWith('MNQ') ||
    clean.startsWith('@NQ') ||
    clean.startsWith('NQ') ||
    clean.startsWith('NAS100') ||
    clean.startsWith('US100') ||
    clean.includes('NAS100') ||
    clean === 'NASDAQ' ||
    clean.includes('USTEC')
  ) {
    return 0.25;
  }

  // 2. E-mini & Micro S&P 500 Futures / Index (0.25 tick)
  if (
    clean.startsWith('EP') ||
    clean.startsWith('MES') ||
    clean.startsWith('@ES') ||
    clean.startsWith('ES') ||
    clean.startsWith('SPX500') ||
    clean.startsWith('SP500') ||
    clean.startsWith('US500') ||
    clean.includes('SPX500') ||
    clean === 'SPX' ||
    clean === 'SP500' ||
    clean === 'US500'
  ) {
    return 0.25;
  }

  // 3. E-mini & Micro Dow Jones Futures (1.0 tick)
  if (
    clean.startsWith('YM') ||
    clean.startsWith('MYM') ||
    clean.startsWith('@YM') ||
    clean === 'US30' ||
    clean.startsWith('US30_')
  ) {
    return 1.0;
  }

  // 4. Russell 2000 Futures (0.1 tick)
  if (
    clean.startsWith('RTY') ||
    clean.startsWith('M2K') ||
    clean.startsWith('@RTY') ||
    clean === 'US2000'
  ) {
    return 0.1;
  }

  // 5. Gold (0.1 tick)
  if (clean.startsWith('GC') || clean.startsWith('MGC') || clean === 'XAUUSD' || clean === 'XAU_USD') {
    return 0.1;
  }

  // 6. Silver (0.005 tick)
  if (clean.startsWith('SI') || clean.startsWith('SIL') || clean.startsWith('SIE') || clean === 'XAGUSD' || clean === 'XAG_USD') {
    return 0.005;
  }

  // 7. Crude Oil (0.01 tick; Mini is 0.025)
  if (clean.startsWith('CL') || clean.startsWith('MCL') || clean.startsWith('CLEX')) {
    return 0.01;
  }
  if (clean.startsWith('QM') || clean.startsWith('NQM') || clean.startsWith('NQMX')) {
    return 0.025;
  }

  // 8. Natural Gas (0.001 tick; Mini is 0.005)
  if (clean.startsWith('NG')) {
    return 0.001;
  }
  if (clean.startsWith('QG') || clean.startsWith('NQG') || clean.startsWith('NQGX')) {
    return 0.005;
  }

  // 9. Agricultural Futures (0.25 tick)
  if (clean.startsWith('ZC') || clean.startsWith('ZS') || clean.startsWith('ZW')) {
    return 0.25;
  }

  // 10. Soybean Meal (0.1) & Soybean Oil (0.01)
  if (clean.startsWith('ZM')) return 0.1;
  if (clean.startsWith('ZL')) return 0.01;

  // 11. Currencies Futures
  if (clean.startsWith('6E') || clean.startsWith('M6E') || clean.startsWith('EU6')) return 0.00005;
  if (clean.startsWith('6B') || clean.startsWith('M6B') || clean.startsWith('BP6')) return 0.0001;
  if (clean.startsWith('6A') || clean.startsWith('M6A') || clean.startsWith('DA6')) return 0.0001;
  if (clean.startsWith('6C') || clean.startsWith('GMCD') || clean.startsWith('CA6')) return 0.00005;
  if (clean.startsWith('6J') || clean.startsWith('MJY') || clean.startsWith('JY6')) return 0.0000005;

  // 12. Nikkei (5.0 tick)
  if (clean.startsWith('NKD')) return 5.0;

  // 13. STOXX 600 (0.1 tick)
  if (clean.startsWith('FXXP')) return 0.1;

  // 14. Index CFDs (OANDA / Broker standard is 2 decimals / 0.01 tick)
  if (
    clean === 'NAS100_USD' ||
    clean === 'NAS100' ||
    clean === 'US100' ||
    clean.includes('NAS100') ||
    clean.includes('US100')
  ) {
    return 0.01;
  }

  if (
    clean === 'SPX500_USD' ||
    clean === 'SPX500' ||
    clean.includes('SPX500')
  ) {
    return 0.01;
  }

  if (clean === 'DE30_EUR' || clean === 'DE40_EUR' || clean.includes('GER40')) {
    return 0.1;
  }

  return null;
}

/**
 * Returns the number of decimal places of a floating point number.
 */
export function getDecimalPlaces(val: number): number {
  if (!val || isNaN(val) || Math.floor(val) === val) return 0;
  const s = val.toString();
  if (s.includes('e-')) {
    const parts = s.split('e-');
    return parseInt(parts[1], 10);
  }
  if (s.includes('.')) {
    return s.split('.')[1].length;
  }
  return 0;
}

/**
 * Returns the number of decimal places needed to display multiples of a given tick size.
 */
export function getPrecisionForTickSize(tickSize: number): number {
  if (!tickSize || tickSize <= 0) return 2;
  const s = tickSize.toString();
  if (s.includes('e-')) {
    const parts = s.split('e-');
    return parseInt(parts[1], 10);
  }
  if (s.includes('.')) {
    return s.split('.')[1].length;
  }
  return 0;
}

/**
 * Snaps any floating-point price to the nearest integer multiple of a tick size.
 * Handles IEEE 754 precision issues cleanly.
 */
export function snapPriceToTick(price: number, tickSize: number): number {
  if (!tickSize || tickSize <= 0 || isNaN(price)) return price;
  const precision = getPrecisionForTickSize(tickSize);
  const factor = Math.round(price / tickSize);
  const snapped = factor * tickSize;
  return Number(snapped.toFixed(precision));
}

/**
 * Snaps a synchronized crosshair price from another chart onto this chart.
 *
 * Requirements & Multi-Asset Rules:
 * 1. If target chart is a futures contract with a rigid exchange tick size
 *    (e.g., NQ/ES with 0.25 tick, YM with 1.0 tick, NKD with 5.0 tick, ZC with 0.25 tick),
 *    the incoming crosshair price MUST snap to the nearest tick multiple of this contract.
 *    Example: Moving crosshair on NAS100 (e.g. 29729.30) -> NQ snaps to 29729.25.
 *
 * 2. If target chart is an index CFD (e.g., NAS100_USD with 2 decimals) or standard asset,
 *    and the incoming price fits cleanly within targetPrecision (e.g. 29729.25 from NQ),
 *    we PRESERVE the exact price (29729.25) so it is NOT distorted into 29729.30.
 *
 * 3. If the incoming price has more fractional decimals than this chart supports,
 *    it snaps to this chart's tick size.
 */
export function snapSyncedPrice(
  incomingPrice: number,
  targetTickSize: number,
  targetPrecision: number,
  targetSymbol: string
): number {
  if (incomingPrice == null || isNaN(incomingPrice) || incomingPrice <= 0) {
    return incomingPrice;
  }

  // Check if target symbol is an exchange-traded futures contract with fixed coarse tick
  const knownRuleTick = getSymbolTickSize(targetSymbol);
  const isFixedFuturesTick =
    knownRuleTick !== null &&
    knownRuleTick >= 0.025 &&
    !targetSymbol.toUpperCase().includes('NAS100') &&
    !targetSymbol.toUpperCase().includes('SPX500') &&
    !targetSymbol.toUpperCase().includes('OANDA');

  if (isFixedFuturesTick) {
    return snapPriceToTick(incomingPrice, knownRuleTick);
  }

  // For non-futures or CFDs, check if incoming price already fits target precision
  const incomingDecimals = getDecimalPlaces(incomingPrice);
  if (incomingDecimals <= targetPrecision) {
    return Number(incomingPrice.toFixed(targetPrecision));
  }

  // Otherwise snap to target's tick size
  return snapPriceToTick(incomingPrice, targetTickSize || Math.pow(10, -targetPrecision));
}

/**
 * Formats a synchronized crosshair price for the price scale pill.
 */
export function formatSyncedCrosshairPrice(price: number, precision: number): string {
  if (price == null || isNaN(price)) return '';
  const prec = Math.min(Math.max(precision, 0), 8);
  return price.toFixed(prec);
}

/**
 * Formats a price snapped to its tick size with the appropriate decimal places.
 */
export function formatPriceWithTick(price: number, tickSize: number, precision?: number): string {
  const snapped = snapPriceToTick(price, tickSize);
  const prec = precision !== undefined ? precision : getPrecisionForTickSize(tickSize);
  return snapped.toFixed(prec);
}

/**
 * Inspects a batch of candles to detect the maximum decimals present in actual OHLC values.
 */
export function detectPrecisionFromCandles(
  candles: { open: number; high: number; low: number; close: number }[],
  symbol: string
): number {
  if (!candles || candles.length === 0) {
    return getPriceDecimals(symbol);
  }

  const lastPrice = candles[candles.length - 1]?.close;
  const expectedDecimals = getPriceDecimals(symbol, lastPrice);

  const sym = (symbol || '').toUpperCase().trim();
  const clean = sym.includes(':') ? sym.split(':')[1] : sym;

  // Rigid index/commodity symbols should never deviate from 2 decimals
  if (
    clean.includes('NAS100') ||
    clean.includes('US100') ||
    clean.includes('USTEC') ||
    clean.includes('SPX500') ||
    clean.includes('US500') ||
    clean.includes('SP500') ||
    clean.includes('US30') ||
    clean.includes('WS30') ||
    clean.includes('DE30') ||
    clean.includes('DE40') ||
    clean.includes('UK100') ||
    clean.includes('JP225') ||
    clean.includes('EU50') ||
    clean.startsWith('NQ') ||
    clean.startsWith('ENQ') ||
    clean.startsWith('MNQ') ||
    clean.startsWith('ES') ||
    clean.startsWith('MES') ||
    clean.startsWith('YM') ||
    clean.startsWith('MYM') ||
    clean.startsWith('GC') ||
    clean.startsWith('CL') ||
    clean.includes('XAU') ||
    clean.includes('WTICO') ||
    clean.includes('BCO')
  ) {
    return 2;
  }

  // Sample the last 25 candles
  const samples = candles.slice(-25);
  let maxDecimals = 0;

  for (const c of samples) {
    for (const val of [c.open, c.high, c.low, c.close]) {
      if (typeof val === 'number' && !isNaN(val)) {
        // Strip binary floating-point representation noise like 29555.600000000002 -> 29555.6
        const cleanVal = Number(val.toFixed(8));
        const s = cleanVal.toString();
        if (s.includes('.')) {
          const dec = s.split('.')[1].length;
          if (dec > maxDecimals) {
            maxDecimals = dec;
          }
        }
      }
    }
  }

  if (maxDecimals > 0) {
    return Math.min(Math.max(maxDecimals, 2), expectedDecimals);
  }

  return expectedDecimals;
}

/**
 * Detects the minimum price movement (tick size) from symbol conventions or candle data.
 */
export function detectTickSizeFromCandles(
  candles: { open: number; high: number; low: number; close: number }[],
  symbol: string
): number {
  // 1. Check known symbol rules first
  const ruleTick = getSymbolTickSize(symbol);
  if (ruleTick !== null && ruleTick > 0) {
    return ruleTick;
  }

  // 2. If candles are present, inspect their prices
  if (candles && candles.length > 0) {
    const samples = candles.slice(-50);
    const candidateTicks = [
      5.0, 1.0, 0.5, 0.25, 0.1, 0.05, 0.025, 0.01, 0.005, 0.001, 0.0005, 0.0001, 0.00005, 0.00001,
    ];

    let minDiff = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const c = samples[i];
      const hl = Math.abs(c.high - c.low);
      if (hl > 0 && hl < minDiff) minDiff = hl;
      const oc = Math.abs(c.close - c.open);
      if (oc > 0 && oc < minDiff) minDiff = oc;
    }

    if (minDiff < Infinity) {
      for (const tick of candidateTicks) {
        if (minDiff < tick * 0.9) continue;
        let allMatch = true;
        for (const c of samples) {
          for (const val of [c.open, c.high, c.low, c.close]) {
            const remainder = Math.abs(Math.round(val / tick) * tick - val);
            if (remainder > tick * 0.02) {
              allMatch = false;
              break;
            }
          }
          if (!allMatch) break;
        }
        if (allMatch) {
          return tick;
        }
      }
    }
  }

  // 3. Fallback based on precision
  const decimals = detectPrecisionFromCandles(candles, symbol);
  return Math.pow(10, -decimals);
}

/**
 * Returns Lightweight Charts series priceFormat configuration object with proper precision and minMove.
 */
export function getPriceFormatConfig(precision: number, tickSize?: number): PriceFormatConfig {
  const safePrecision = Math.min(Math.max(precision, 0), 8);
  const safeMinMove = tickSize && tickSize > 0 ? tickSize : Math.pow(10, -safePrecision);
  const minMoveDecimals = getPrecisionForTickSize(safeMinMove);
  const finalPrecision = Math.max(safePrecision, minMoveDecimals);
  return {
    type: 'price',
    precision: finalPrecision,
    minMove: safeMinMove,
  };
}
