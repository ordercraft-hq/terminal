import type { Candle } from '../transport/client';
import type {
  IndicatorType,
  IndicatorCalculationResult,
  IndicatorPlotDataPoint,
} from './types';

// Helper to extract series values according to source
export function getSourceSeries(candles: Candle[], source: string = 'close'): number[] {
  const n = candles.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const c = candles[i];
    switch (source) {
      case 'open':
        out[i] = c.open;
        break;
      case 'high':
        out[i] = c.high;
        break;
      case 'low':
        out[i] = c.low;
        break;
      case 'hl2':
        out[i] = (c.high + c.low) / 2;
        break;
      case 'hlc3':
        out[i] = (c.high + c.low + c.close) / 3;
        break;
      case 'ohlc4':
        out[i] = (c.open + c.high + c.low + c.close) / 4;
        break;
      case 'close':
      default:
        out[i] = c.close;
        break;
    }
  }
  return Array.from(out);
}

// ===================== MATH ROUTINES =====================

// 1. SMA
export function computeSMA(candles: Candle[], length: number, source: string = 'close'): IndicatorPlotDataPoint[] {
  const n = candles.length;
  if (n === 0 || length <= 0) return [];
  const src = getSourceSeries(candles, source);
  const result: IndicatorPlotDataPoint[] = [];

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += src[i];
    if (i >= length) {
      sum -= src[i - length];
    }
    if (i >= length - 1) {
      result.push({
        time: candles[i].time,
        value: sum / length,
      });
    }
  }
  return result;
}

// 2. EMA
export function computeEMA(candles: Candle[], length: number, source: string = 'close'): IndicatorPlotDataPoint[] {
  const n = candles.length;
  if (n === 0 || length <= 0) return [];
  const src = getSourceSeries(candles, source);
  const result: IndicatorPlotDataPoint[] = [];

  const alpha = 2 / (length + 1);
  let ema = 0;
  let sum = 0;

  for (let i = 0; i < n; i++) {
    if (i < length) {
      sum += src[i];
      if (i === length - 1) {
        ema = sum / length;
        result.push({ time: candles[i].time, value: ema });
      }
    } else {
      ema = alpha * src[i] + (1 - alpha) * ema;
      result.push({ time: candles[i].time, value: ema });
    }
  }
  return result;
}

// 3. WMA
export function computeWMA(candles: Candle[], length: number, source: string = 'close'): IndicatorPlotDataPoint[] {
  const n = candles.length;
  if (n === 0 || length <= 0) return [];
  const src = getSourceSeries(candles, source);
  const result: IndicatorPlotDataPoint[] = [];

  const divisor = (length * (length + 1)) / 2;
  for (let i = length - 1; i < n; i++) {
    let weightSum = 0;
    for (let j = 0; j < length; j++) {
      weightSum += src[i - j] * (length - j);
    }
    result.push({
      time: candles[i].time,
      value: weightSum / divisor,
    });
  }
  return result;
}

// 4. HMA: WMA(2*WMA(n/2) - WMA(n), floor(sqrt(n)))
export function computeHMA(candles: Candle[], length: number, source: string = 'close'): IndicatorPlotDataPoint[] {
  const n = candles.length;
  if (n === 0 || length < 2) return [];
  const halfLen = Math.floor(length / 2);
  const sqrtLen = Math.floor(Math.sqrt(length));

  const src = getSourceSeries(candles, source);
  const halfWma = new Float64Array(n);
  const fullWma = new Float64Array(n);

  const halfDiv = (halfLen * (halfLen + 1)) / 2;
  for (let i = halfLen - 1; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < halfLen; j++) sum += src[i - j] * (halfLen - j);
    halfWma[i] = sum / halfDiv;
  }

  const fullDiv = (length * (length + 1)) / 2;
  for (let i = length - 1; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < length; j++) sum += src[i - j] * (length - j);
    fullWma[i] = sum / fullDiv;
  }

  const diff = new Float64Array(n);
  for (let i = length - 1; i < n; i++) {
    diff[i] = 2 * halfWma[i] - fullWma[i];
  }

  const result: IndicatorPlotDataPoint[] = [];
  const sqrtDiv = (sqrtLen * (sqrtLen + 1)) / 2;
  for (let i = length - 1 + sqrtLen - 1; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < sqrtLen; j++) sum += diff[i - j] * (sqrtLen - j);
    result.push({
      time: candles[i].time,
      value: sum / sqrtDiv,
    });
  }
  return result;
}

// Helper to get New York civil date and hour accounting for EDT/EST automatically
const nyDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  hour12: false,
});

export function getNYSessionDateKey(timeSec: number, cutoffHour: number = 18): string {
  const parts = nyDateFormatter.formatToParts(new Date(timeSec * 1000));
  let year = 0, month = 0, day = 0, hour = 0;
  for (const p of parts) {
    if (p.type === 'year') year = Number(p.value);
    else if (p.type === 'month') month = Number(p.value);
    else if (p.type === 'day') day = Number(p.value);
    else if (p.type === 'hour') hour = Number(p.value) % 24;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  // If hour >= cutoffHour (e.g. 18:00 NY), it belongs to next calendar day's trade session
  if (hour >= cutoffHour) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

// 5. VWAP
export function computeVWAP(candles: Candle[], anchor: string = 'session'): IndicatorPlotDataPoint[] {
  const n = candles.length;
  if (n === 0) return [];
  const result: IndicatorPlotDataPoint[] = [];

  let cumVolume = 0;
  let cumTypicalVolume = 0;
  let lastSessionKey: string | number = '';

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const date = new Date(c.time * 1000);

    let isNewSession = false;
    if (i === 0) {
      isNewSession = true;
      if (anchor === 'week') {
        const day = date.getUTCDay();
        lastSessionKey = Math.floor((c.time - day * 86400) / (7 * 86400));
      } else if (anchor === 'month') {
        lastSessionKey = date.getUTCFullYear() * 12 + date.getUTCMonth();
      } else if (anchor === 'year') {
        lastSessionKey = date.getUTCFullYear();
      } else if (anchor === 'session_utc') {
        lastSessionKey = Math.floor(c.time / 86400);
      } else {
        lastSessionKey = getNYSessionDateKey(c.time, 18);
      }
    } else {
      if (anchor === 'week') {
        const day = date.getUTCDay();
        const curKey = Math.floor((c.time - day * 86400) / (7 * 86400));
        if (curKey !== lastSessionKey) {
          isNewSession = true;
          lastSessionKey = curKey;
        }
      } else if (anchor === 'month') {
        const curKey = date.getUTCFullYear() * 12 + date.getUTCMonth();
        if (curKey !== lastSessionKey) {
          isNewSession = true;
          lastSessionKey = curKey;
        }
      } else if (anchor === 'year') {
        const curKey = date.getUTCFullYear();
        if (curKey !== lastSessionKey) {
          isNewSession = true;
          lastSessionKey = curKey;
        }
      } else if (anchor === 'session_utc') {
        const curKey = Math.floor(c.time / 86400);
        if (curKey !== lastSessionKey) {
          isNewSession = true;
          lastSessionKey = curKey;
        }
      } else {
        // Default: Trading Session (Dual-Trigger: Time gap >= 45m or NY 18:00 rollover)
        const gap = c.time - candles[i - 1].time;
        const curKey = getNYSessionDateKey(c.time, 18);
        if (gap >= 2700 || curKey !== lastSessionKey) {
          isNewSession = true;
          lastSessionKey = curKey;
        }
      }
    }

    if (isNewSession) {
      cumVolume = 0;
      cumTypicalVolume = 0;
    }

    const typical = (c.high + c.low + c.close) / 3;
    const vol = c.volume > 0 ? c.volume : 1;
    cumVolume += vol;
    cumTypicalVolume += typical * vol;

    result.push({
      time: c.time,
      value: cumTypicalVolume / cumVolume,
    });
  }
  return result;
}

// 6. Bollinger Bands
export function computeBollingerBands(
  candles: Candle[],
  length: number = 20,
  multiplier: number = 2.0,
  source: string = 'close'
): { upper: IndicatorPlotDataPoint[]; basis: IndicatorPlotDataPoint[]; lower: IndicatorPlotDataPoint[] } {
  const n = candles.length;
  if (n === 0 || length <= 0) return { upper: [], basis: [], lower: [] };
  const src = getSourceSeries(candles, source);

  const upper: IndicatorPlotDataPoint[] = [];
  const basis: IndicatorPlotDataPoint[] = [];
  const lower: IndicatorPlotDataPoint[] = [];

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += src[i];
    if (i >= length) sum -= src[i - length];

    if (i >= length - 1) {
      const mean = sum / length;
      let varSum = 0;
      for (let j = 0; j < length; j++) {
        const diff = src[i - j] - mean;
        varSum += diff * diff;
      }
      const stdev = Math.sqrt(varSum / length);
      const time = candles[i].time;

      basis.push({ time, value: mean });
      upper.push({ time, value: mean + multiplier * stdev });
      lower.push({ time, value: mean - multiplier * stdev });
    }
  }
  return { upper, basis, lower };
}

// 7. Keltner Channels
export function computeKeltnerChannels(
  candles: Candle[],
  emaLength: number = 20,
  atrLength: number = 10,
  multiplier: number = 2.0,
  source: string = 'close'
): { upper: IndicatorPlotDataPoint[]; basis: IndicatorPlotDataPoint[]; lower: IndicatorPlotDataPoint[] } {
  const n = candles.length;
  if (n === 0) return { upper: [], basis: [], lower: [] };

  // Calculate True Range
  const tr = new Float64Array(n);
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < n; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr[i] = Math.max(hl, hc, lc);
  }

  // EMA of TR (ATR)
  const atr = new Float64Array(n);
  const alphaAtr = 2 / (atrLength + 1);
  let atrSum = 0;
  for (let i = 0; i < n; i++) {
    if (i < atrLength) {
      atrSum += tr[i];
      if (i === atrLength - 1) atr[i] = atrSum / atrLength;
    } else {
      atr[i] = alphaAtr * tr[i] + (1 - alphaAtr) * atr[i - 1];
    }
  }

  // EMA of Price (Basis)
  const src = getSourceSeries(candles, source);
  const ema = new Float64Array(n);
  const alphaEma = 2 / (emaLength + 1);
  let emaSum = 0;
  for (let i = 0; i < n; i++) {
    if (i < emaLength) {
      emaSum += src[i];
      if (i === emaLength - 1) ema[i] = emaSum / emaLength;
    } else {
      ema[i] = alphaEma * src[i] + (1 - alphaEma) * ema[i - 1];
    }
  }

  const startIdx = Math.max(emaLength, atrLength) - 1;
  const upper: IndicatorPlotDataPoint[] = [];
  const basis: IndicatorPlotDataPoint[] = [];
  const lower: IndicatorPlotDataPoint[] = [];

  for (let i = startIdx; i < n; i++) {
    const time = candles[i].time;
    const b = ema[i];
    const range = multiplier * atr[i];
    basis.push({ time, value: b });
    upper.push({ time, value: b + range });
    lower.push({ time, value: b - range });
  }
  return { upper, basis, lower };
}

// 8. SuperTrend
export function computeSuperTrend(
  candles: Candle[],
  atrPeriod: number = 10,
  multiplier: number = 3.0
): IndicatorPlotDataPoint[] {
  const n = candles.length;
  if (n === 0 || atrPeriod <= 0) return [];

  // 1. Calculate ATR (Wilder's RMA)
  const tr = new Float64Array(n);
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < n; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr[i] = Math.max(hl, hc, lc);
  }

  const atr = new Float64Array(n);
  let trSum = 0;
  for (let i = 0; i < atrPeriod && i < n; i++) {
    trSum += tr[i];
  }
  atr[atrPeriod - 1] = trSum / atrPeriod;
  for (let i = atrPeriod; i < n; i++) {
    atr[i] = (atr[i - 1] * (atrPeriod - 1) + tr[i]) / atrPeriod;
  }

  // 2. Bands and directional trend
  const result: IndicatorPlotDataPoint[] = [];
  let upperBand = 0;
  let lowerBand = 0;
  let prevUpper = 0;
  let prevLower = 0;
  let trend = 1; // 1 = bullish, -1 = bearish

  for (let i = atrPeriod - 1; i < n; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1]?.close ?? c.close;
    const hl2 = (c.high + c.low) / 2;
    const basicUpper = hl2 + multiplier * atr[i];
    const basicLower = hl2 - multiplier * atr[i];

    if (basicLower > prevLower || prevClose < prevLower) {
      lowerBand = basicLower;
    } else {
      lowerBand = prevLower;
    }

    if (basicUpper < prevUpper || prevClose > prevUpper) {
      upperBand = basicUpper;
    } else {
      upperBand = prevUpper;
    }

    if (i === atrPeriod - 1) {
      trend = c.close > upperBand ? 1 : -1;
    } else {
      if (trend === -1 && c.close > prevUpper) {
        trend = 1;
      } else if (trend === 1 && c.close < prevLower) {
        trend = -1;
      }
    }

    const value = trend === 1 ? lowerBand : upperBand;
    const color = trend === 1 ? '#089981' : '#F23645';

    result.push({
      time: c.time,
      value,
      color,
    });

    prevUpper = upperBand;
    prevLower = lowerBand;
  }

  return result;
}

// 9. Parabolic SAR
export function computeParabolicSAR(
  candles: Candle[],
  start: number = 0.02,
  increment: number = 0.02,
  maximum: number = 0.2
): IndicatorPlotDataPoint[] {
  const n = candles.length;
  if (n < 2) return [];

  const result: IndicatorPlotDataPoint[] = [];

  let isLong = candles[1].close > candles[0].close;
  let sar = isLong ? candles[0].low : candles[0].high;
  let ep = isLong ? candles[1].high : candles[1].low;
  let af = start;

  for (let i = 1; i < n; i++) {
    const prevC = candles[i - 1];
    const curC = candles[i];

    // Compute next SAR
    sar = sar + af * (ep - sar);

    // Rule: SAR can't be above previous 2 lows (in long) or below previous 2 highs (in short)
    if (isLong) {
      sar = Math.min(sar, prevC.low, i > 1 ? candles[i - 2].low : prevC.low);
      if (curC.low < sar) {
        // Reverse to short
        isLong = false;
        sar = ep;
        ep = curC.low;
        af = start;
      } else {
        if (curC.high > ep) {
          ep = curC.high;
          af = Math.min(af + increment, maximum);
        }
      }
    } else {
      sar = Math.max(sar, prevC.high, i > 1 ? candles[i - 2].high : prevC.high);
      if (curC.high > sar) {
        // Reverse to long
        isLong = true;
        sar = ep;
        ep = curC.high;
        af = start;
      } else {
        if (curC.low < ep) {
          ep = curC.low;
          af = Math.min(af + increment, maximum);
        }
      }
    }

    result.push({
      time: curC.time,
      value: sar,
      color: isLong ? '#089981' : '#F23645',
    });
  }

  return result;
}

// 10. RSI
export function computeRSI(candles: Candle[], length: number = 14, source: string = 'close'): IndicatorPlotDataPoint[] {
  const n = candles.length;
  if (n <= length) return [];
  const src = getSourceSeries(candles, source);
  const result: IndicatorPlotDataPoint[] = [];

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= length; i++) {
    const diff = src[i] - src[i - 1];
    if (diff > 0) gainSum += diff;
    else lossSum -= diff;
  }

  let avgGain = gainSum / length;
  let avgLoss = lossSum / length;

  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let rsi = 100 - 100 / (1 + rs);
  result.push({ time: candles[length].time, value: rsi });

  for (let i = length + 1; i < n; i++) {
    const diff = src[i] - src[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi = 100 - 100 / (1 + rs);
    result.push({ time: candles[i].time, value: rsi });
  }

  return result;
}

// 11. MACD
export function computeMACD(
  candles: Candle[],
  fastLength: number = 12,
  slowLength: number = 26,
  signalLength: number = 9,
  source: string = 'close'
): { macd: IndicatorPlotDataPoint[]; signal: IndicatorPlotDataPoint[]; hist: IndicatorPlotDataPoint[] } {
  const n = candles.length;
  if (n < slowLength + signalLength) return { macd: [], signal: [], hist: [] };
  const src = getSourceSeries(candles, source);

  // Fast EMA
  const fastAlpha = 2 / (fastLength + 1);
  const fastEma = new Float64Array(n);
  let fastSum = 0;
  for (let i = 0; i < n; i++) {
    if (i < fastLength) {
      fastSum += src[i];
      if (i === fastLength - 1) fastEma[i] = fastSum / fastLength;
    } else {
      fastEma[i] = fastAlpha * src[i] + (1 - fastAlpha) * fastEma[i - 1];
    }
  }

  // Slow EMA
  const slowAlpha = 2 / (slowLength + 1);
  const slowEma = new Float64Array(n);
  let slowSum = 0;
  for (let i = 0; i < n; i++) {
    if (i < slowLength) {
      slowSum += src[i];
      if (i === slowLength - 1) slowEma[i] = slowSum / slowLength;
    } else {
      slowEma[i] = slowAlpha * src[i] + (1 - slowAlpha) * slowEma[i - 1];
    }
  }

  // MACD Line
  const macdLine = new Float64Array(n);
  for (let i = slowLength - 1; i < n; i++) {
    macdLine[i] = fastEma[i] - slowEma[i];
  }

  // Signal Line (EMA of MACD Line)
  const signalAlpha = 2 / (signalLength + 1);
  const signalLine = new Float64Array(n);
  let sigSum = 0;
  const sigStart = slowLength - 1;
  const warmEnd = sigStart + signalLength;

  for (let i = sigStart; i < n; i++) {
    if (i < warmEnd) {
      sigSum += macdLine[i];
      if (i === warmEnd - 1) signalLine[i] = sigSum / signalLength;
    } else {
      signalLine[i] = signalAlpha * macdLine[i] + (1 - signalAlpha) * signalLine[i - 1];
    }
  }

  const macd: IndicatorPlotDataPoint[] = [];
  const signal: IndicatorPlotDataPoint[] = [];
  const hist: IndicatorPlotDataPoint[] = [];

  let prevHist = 0;
  for (let i = warmEnd - 1; i < n; i++) {
    const time = candles[i].time;
    const m = macdLine[i];
    const s = signalLine[i];
    const h = m - s;

    // 4-Color Momentum:
    // Positive & Rising: #089981 (Strong Green)
    // Positive & Falling: #26A69A (Pale Green)
    // Negative & Falling: #F23645 (Strong Red)
    // Negative & Rising: #EF5350 (Pale Red)
    let color = '#089981';
    if (h >= 0) {
      color = h >= prevHist ? '#089981' : '#26A69A';
    } else {
      color = h <= prevHist ? '#F23645' : '#EF5350';
    }

    macd.push({ time, value: m });
    signal.push({ time, value: s });
    hist.push({ time, value: h, color });
    prevHist = h;
  }

  return { macd, signal, hist };
}

// 12. Stochastic Oscillator
export function computeStochastic(
  candles: Candle[],
  kLength: number = 14,
  kSmoothing: number = 1,
  dSmoothing: number = 3
): { k: IndicatorPlotDataPoint[]; d: IndicatorPlotDataPoint[] } {
  const n = candles.length;
  if (n < kLength + dSmoothing) return { k: [], d: [] };

  const rawK = new Float64Array(n);
  for (let i = kLength - 1; i < n; i++) {
    let high = -Infinity;
    let low = Infinity;
    for (let j = 0; j < kLength; j++) {
      const c = candles[i - j];
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
    }
    const range = high - low;
    rawK[i] = range === 0 ? 50 : ((candles[i].close - low) / range) * 100;
  }

  // Smooth K if kSmoothing > 1
  const smoothedK = new Float64Array(n);
  if (kSmoothing <= 1) {
    for (let i = kLength - 1; i < n; i++) smoothedK[i] = rawK[i];
  } else {
    let sum = 0;
    const start = kLength - 1;
    for (let i = start; i < n; i++) {
      sum += rawK[i];
      if (i >= start + kSmoothing) sum -= rawK[i - kSmoothing];
      if (i >= start + kSmoothing - 1) smoothedK[i] = sum / kSmoothing;
    }
  }

  // Compute D (%D = SMA of smoothedK)
  const dStart = kLength - 1 + (kSmoothing > 1 ? kSmoothing - 1 : 0);
  const kOut: IndicatorPlotDataPoint[] = [];
  const dOut: IndicatorPlotDataPoint[] = [];

  let dSum = 0;
  for (let i = dStart; i < n; i++) {
    dSum += smoothedK[i];
    if (i >= dStart + dSmoothing) dSum -= smoothedK[i - dSmoothing];

    if (i >= dStart + dSmoothing - 1) {
      const time = candles[i].time;
      kOut.push({ time, value: smoothedK[i] });
      dOut.push({ time, value: dSum / dSmoothing });
    }
  }

  return { k: kOut, d: dOut };
}

// 13. Stochastic RSI
export function computeStochRSI(
  candles: Candle[],
  rsiLength: number = 14,
  stochLength: number = 14,
  k: number = 3,
  d: number = 3,
  source: string = 'close'
): { k: IndicatorPlotDataPoint[]; d: IndicatorPlotDataPoint[] } {
  const rsiPoints = computeRSI(candles, rsiLength, source);
  const n = rsiPoints.length;
  if (n < stochLength + d) return { k: [], d: [] };

  const rawStoch = new Float64Array(n);
  for (let i = stochLength - 1; i < n; i++) {
    let high = -Infinity;
    let low = Infinity;
    for (let j = 0; j < stochLength; j++) {
      const v = rsiPoints[i - j].value;
      if (v > high) high = v;
      if (v < low) low = v;
    }
    const range = high - low;
    rawStoch[i] = range === 0 ? 50 : ((rsiPoints[i].value - low) / range) * 100;
  }

  // Smooth K with SMA of length k
  const smoothedK = new Float64Array(n);
  let kSum = 0;
  const kStart = stochLength - 1;
  for (let i = kStart; i < n; i++) {
    kSum += rawStoch[i];
    if (i >= kStart + k) kSum -= rawStoch[i - k];
    if (i >= kStart + k - 1) smoothedK[i] = kSum / k;
  }

  // Smooth D with SMA of length d
  const dStart = kStart + k - 1;
  const kOut: IndicatorPlotDataPoint[] = [];
  const dOut: IndicatorPlotDataPoint[] = [];

  let dSum = 0;
  for (let i = dStart; i < n; i++) {
    dSum += smoothedK[i];
    if (i >= dStart + d) dSum -= smoothedK[i - d];

    if (i >= dStart + d - 1) {
      const time = rsiPoints[i].time;
      kOut.push({ time, value: smoothedK[i] });
      dOut.push({ time, value: dSum / d });
    }
  }

  return { k: kOut, d: dOut };
}

// 14. ATR (Average True Range)
export function computeATR(candles: Candle[], length: number = 14): IndicatorPlotDataPoint[] {
  const n = candles.length;
  if (n <= length) return [];

  const tr = new Float64Array(n);
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < n; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr[i] = Math.max(hl, hc, lc);
  }

  const result: IndicatorPlotDataPoint[] = [];
  let trSum = 0;
  for (let i = 0; i < length; i++) trSum += tr[i];
  let atr = trSum / length;
  result.push({ time: candles[length - 1].time, value: atr });

  for (let i = length; i < n; i++) {
    atr = (atr * (length - 1) + tr[i]) / length;
    result.push({ time: candles[i].time, value: atr });
  }

  return result;
}

// 15. CCI (Commodity Channel Index)
export function computeCCI(candles: Candle[], length: number = 20): IndicatorPlotDataPoint[] {
  const n = candles.length;
  if (n < length) return [];

  const tp = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    tp[i] = (candles[i].high + candles[i].low + candles[i].close) / 3;
  }

  const result: IndicatorPlotDataPoint[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += tp[i];
    if (i >= length) sum -= tp[i - length];

    if (i >= length - 1) {
      const mean = sum / length;
      let devSum = 0;
      for (let j = 0; j < length; j++) devSum += Math.abs(tp[i - j] - mean);
      const meanDev = devSum / length;
      const cci = meanDev === 0 ? 0 : (tp[i] - mean) / (0.015 * meanDev);
      result.push({ time: candles[i].time, value: cci });
    }
  }

  return result;
}

// 16. Williams %R
export function computeWilliamsR(candles: Candle[], length: number = 14): IndicatorPlotDataPoint[] {
  const n = candles.length;
  if (n < length) return [];

  const result: IndicatorPlotDataPoint[] = [];
  for (let i = length - 1; i < n; i++) {
    let high = -Infinity;
    let low = Infinity;
    for (let j = 0; j < length; j++) {
      const c = candles[i - j];
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
    }
    const range = high - low;
    const wr = range === 0 ? -50 : ((high - candles[i].close) / range) * -100;
    result.push({ time: candles[i].time, value: wr });
  }

  return result;
}

// 17. ADX (Average Directional Index)
export function computeADX(
  candles: Candle[],
  adxLength: number = 14,
  diLength: number = 14
): { adx: IndicatorPlotDataPoint[]; plusDi: IndicatorPlotDataPoint[]; minusDi: IndicatorPlotDataPoint[] } {
  const n = candles.length;
  if (n < diLength + adxLength) return { adx: [], plusDi: [], minusDi: [] };

  const tr = new Float64Array(n);
  const plusDm = new Float64Array(n);
  const minusDm = new Float64Array(n);

  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < n; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];

    const hl = cur.high - cur.low;
    const hc = Math.abs(cur.high - prev.close);
    const lc = Math.abs(cur.low - prev.close);
    tr[i] = Math.max(hl, hc, lc);

    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;

    if (upMove > downMove && upMove > 0) plusDm[i] = upMove;
    if (downMove > upMove && downMove > 0) minusDm[i] = downMove;
  }

  // Smooth TR, +DM, -DM using Wilder's RMA
  const smoothTr = new Float64Array(n);
  const smoothPlusDm = new Float64Array(n);
  const smoothMinusDm = new Float64Array(n);

  let trSum = 0;
  let pSum = 0;
  let mSum = 0;
  for (let i = 1; i <= diLength; i++) {
    trSum += tr[i];
    pSum += plusDm[i];
    mSum += minusDm[i];
  }
  smoothTr[diLength] = trSum;
  smoothPlusDm[diLength] = pSum;
  smoothMinusDm[diLength] = mSum;

  for (let i = diLength + 1; i < n; i++) {
    smoothTr[i] = smoothTr[i - 1] - smoothTr[i - 1] / diLength + tr[i];
    smoothPlusDm[i] = smoothPlusDm[i - 1] - smoothPlusDm[i - 1] / diLength + plusDm[i];
    smoothMinusDm[i] = smoothMinusDm[i - 1] - smoothMinusDm[i - 1] / diLength + minusDm[i];
  }

  const plusDiArr = new Float64Array(n);
  const minusDiArr = new Float64Array(n);
  const dx = new Float64Array(n);

  for (let i = diLength; i < n; i++) {
    plusDiArr[i] = smoothTr[i] === 0 ? 0 : (smoothPlusDm[i] / smoothTr[i]) * 100;
    minusDiArr[i] = smoothTr[i] === 0 ? 0 : (smoothMinusDm[i] / smoothTr[i]) * 100;
    const diSum = plusDiArr[i] + minusDiArr[i];
    dx[i] = diSum === 0 ? 0 : (Math.abs(plusDiArr[i] - minusDiArr[i]) / diSum) * 100;
  }

  // ADX is RMA of DX
  const adxStart = diLength + adxLength - 1;
  let dxSum = 0;
  for (let i = diLength; i < diLength + adxLength; i++) dxSum += dx[i];
  let currentAdx = dxSum / adxLength;

  const adx: IndicatorPlotDataPoint[] = [];
  const plusDi: IndicatorPlotDataPoint[] = [];
  const minusDi: IndicatorPlotDataPoint[] = [];

  adx.push({ time: candles[adxStart].time, value: currentAdx });
  plusDi.push({ time: candles[adxStart].time, value: plusDiArr[adxStart] });
  minusDi.push({ time: candles[adxStart].time, value: minusDiArr[adxStart] });

  for (let i = adxStart + 1; i < n; i++) {
    currentAdx = (currentAdx * (adxLength - 1) + dx[i]) / adxLength;
    const time = candles[i].time;
    adx.push({ time, value: currentAdx });
    plusDi.push({ time, value: plusDiArr[i] });
    minusDi.push({ time, value: minusDiArr[i] });
  }

  return { adx, plusDi, minusDi };
}

// 18. OBV (On-Balance Volume)
export function computeOBV(candles: Candle[]): IndicatorPlotDataPoint[] {
  const n = candles.length;
  if (n === 0) return [];

  const result: IndicatorPlotDataPoint[] = [];
  let obv = 0;
  result.push({ time: candles[0].time, value: obv });

  for (let i = 1; i < n; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const vol = cur.volume > 0 ? cur.volume : 1;

    if (cur.close > prev.close) {
      obv += vol;
    } else if (cur.close < prev.close) {
      obv -= vol;
    }
    result.push({ time: cur.time, value: obv });
  }

  return result;
}

// 18. Volume
export function computeVolume(
  candles: Candle[],
  showMa: boolean = true,
  maLength: number = 20,
  colorUp: string = '#089981',
  colorDown: string = '#f23645'
): { vol: IndicatorPlotDataPoint[]; ma: IndicatorPlotDataPoint[] } {
  const n = candles.length;
  if (n === 0) return { vol: [], ma: [] };

  const volPlots: IndicatorPlotDataPoint[] = [];
  const volValues: number[] = [];

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const isUp = c.close >= c.open;
    volPlots.push({
      time: c.time,
      value: c.volume,
      color: isUp ? colorUp : colorDown,
    });
    volValues.push(c.volume);
  }

  const maPlots: IndicatorPlotDataPoint[] = [];
  if (showMa && maLength > 0 && n >= maLength) {
    let sum = 0;
    for (let i = 0; i < maLength; i++) {
      sum += volValues[i];
    }
    maPlots.push({ time: candles[maLength - 1].time, value: sum / maLength });

    for (let i = maLength; i < n; i++) {
      sum += volValues[i] - volValues[i - maLength];
      maPlots.push({ time: candles[i].time, value: sum / maLength });
    }
  }

  return { vol: volPlots, ma: maPlots };
}

// ===================== MASTER DISPATCHER =====================

export function computeIndicator(
  type: IndicatorType,
  candles: Candle[],
  inputs: Record<string, any>
): IndicatorCalculationResult {
  switch (type) {
    case 'volume': {
      const v = computeVolume(
        candles,
        true,
        Number(inputs.maLength ?? 20)
      );
      return { plots: { vol: v.vol, ma: v.ma } };
    }
    case 'sma':
      return { plots: { plot: computeSMA(candles, Number(inputs.length ?? 20), inputs.source) } };
    case 'ema':
      return { plots: { plot: computeEMA(candles, Number(inputs.length ?? 20), inputs.source) } };
    case 'wma':
      return { plots: { plot: computeWMA(candles, Number(inputs.length ?? 20), inputs.source) } };
    case 'hma':
      return { plots: { plot: computeHMA(candles, Number(inputs.length ?? 20), inputs.source) } };
    case 'vwap':
      return { plots: { plot: computeVWAP(candles, inputs.anchor ?? 'session') } };
    case 'bollinger_bands': {
      const bb = computeBollingerBands(
        candles,
        Number(inputs.length ?? 20),
        Number(inputs.multiplier ?? 2.0),
        inputs.source
      );
      return { plots: { upper: bb.upper, basis: bb.basis, lower: bb.lower } };
    }
    case 'keltner_channels': {
      const kc = computeKeltnerChannels(
        candles,
        Number(inputs.emaLength ?? 20),
        Number(inputs.atrLength ?? 10),
        Number(inputs.multiplier ?? 2.0),
        inputs.source
      );
      return { plots: { upper: kc.upper, basis: kc.basis, lower: kc.lower } };
    }
    case 'supertrend':
      return {
        plots: {
          trend: computeSuperTrend(
            candles,
            Number(inputs.atrPeriod ?? 10),
            Number(inputs.multiplier ?? 3.0)
          ),
        },
      };
    case 'parabolic_sar':
      return {
        plots: {
          sar: computeParabolicSAR(
            candles,
            Number(inputs.start ?? 0.02),
            Number(inputs.increment ?? 0.02),
            Number(inputs.maximum ?? 0.2)
          ),
        },
      };
    case 'rsi':
      return { plots: { rsi: computeRSI(candles, Number(inputs.length ?? 14), inputs.source) } };
    case 'macd': {
      const m = computeMACD(
        candles,
        Number(inputs.fastLength ?? 12),
        Number(inputs.slowLength ?? 26),
        Number(inputs.signalLength ?? 9),
        inputs.source
      );
      return { plots: { macd: m.macd, signal: m.signal, hist: m.hist } };
    }
    case 'stochastic': {
      const st = computeStochastic(
        candles,
        Number(inputs.kLength ?? 14),
        Number(inputs.kSmoothing ?? 1),
        Number(inputs.dSmoothing ?? 3)
      );
      return { plots: { k: st.k, d: st.d } };
    }
    case 'stoch_rsi': {
      const sr = computeStochRSI(
        candles,
        Number(inputs.rsiLength ?? 14),
        Number(inputs.stochLength ?? 14),
        Number(inputs.k ?? 3),
        Number(inputs.d ?? 3),
        inputs.source
      );
      return { plots: { k: sr.k, d: sr.d } };
    }
    case 'atr':
      return { plots: { atr: computeATR(candles, Number(inputs.length ?? 14)) } };
    case 'cci':
      return { plots: { cci: computeCCI(candles, Number(inputs.length ?? 20)) } };
    case 'williams_r':
      return { plots: { williams: computeWilliamsR(candles, Number(inputs.length ?? 14)) } };
    case 'adx': {
      const adxRes = computeADX(candles, Number(inputs.adxLength ?? 14), Number(inputs.diLength ?? 14));
      return { plots: { adx: adxRes.adx, plusDi: adxRes.plusDi, minusDi: adxRes.minusDi } };
    }
    case 'obv':
      return { plots: { obv: computeOBV(candles) } };
    default:
      return { plots: {} };
  }
}
