import type { Time, CandlestickData } from 'lightweight-charts';
import type { Candle } from '../transport/client';

/**
 * Transforms candles into Heikin-Ashi candles using standard technical formulas:
 * haClose = (open + high + low + close) / 4
 * haOpen = (prevHaOpen + prevHaClose) / 2
 * haHigh = max(high, haOpen, haClose)
 * haLow = min(low, haOpen, haClose)
 */
export function transformHeikinAshi(candles: Candle[]): CandlestickData<Time>[] {
  if (candles.length === 0) return [];
  const result: CandlestickData<Time>[] = [];
  let prevHaOpen = (candles[0].open + candles[0].close) / 2;
  let prevHaClose = (candles[0].open + candles[0].high + candles[0].low + candles[0].close) / 4;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? prevHaOpen : (prevHaOpen + prevHaClose) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);

    result.push({
      time: c.time as Time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
    });

    prevHaOpen = haOpen;
    prevHaClose = haClose;
  }
  return result;
}

/**
 * Transforms candles into Hollow Candles:
 * - Green (bullish, close >= open):
 *     If close >= prevClose: hollow body (green border, transparent fill)
 *     If close < prevClose: solid green body
 * - Red (bearish, close < open):
 *     If close < prevClose: solid red body
 *     If close >= prevClose: hollow red body (red border, transparent fill)
 */
export function transformHollowCandles(candles: Candle[]): CandlestickData<Time>[] {
  return candles.map((c, i) => {
    const prev = i > 0 ? candles[i - 1] : null;
    const isBullish = c.close >= c.open;
    const isHigherThanPrev = prev ? c.close >= prev.close : isBullish;

    let color = '#089981';
    let borderColor = '#089981';
    let wickColor = '#089981';

    if (isBullish) {
      borderColor = '#089981';
      wickColor = '#089981';
      color = isHigherThanPrev ? 'transparent' : '#089981';
    } else {
      borderColor = '#f23645';
      wickColor = '#f23645';
      color = isHigherThanPrev ? 'transparent' : '#f23645';
    }

    return {
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      color,
      borderColor,
      wickColor,
    };
  });
}

/**
 * Transforms candles into Volume Candles with intensity shading based on 20-period volume MA.
 */
export function transformVolumeCandles(candles: Candle[]): CandlestickData<Time>[] {
  if (candles.length === 0) return [];
  let runningVolSum = 0;
  const windowSize = 20;

  return candles.map((c, i) => {
    runningVolSum += c.volume;
    if (i >= windowSize) {
      runningVolSum -= candles[i - windowSize].volume;
    }
    const avgVol = runningVolSum / Math.min(i + 1, windowSize);
    const volRatio = avgVol > 0 ? c.volume / avgVol : 1;
    const isBullish = c.close >= c.open;

    let color: string;
    let borderColor: string;

    if (isBullish) {
      if (volRatio >= 1.5) {
        color = '#00c853';
        borderColor = '#00e676';
      } else if (volRatio <= 0.6) {
        color = 'rgba(8, 153, 129, 0.45)';
        borderColor = 'rgba(8, 153, 129, 0.65)';
      } else {
        color = '#089981';
        borderColor = '#089981';
      }
    } else {
      if (volRatio >= 1.5) {
        color = '#d50000';
        borderColor = '#ff1744';
      } else if (volRatio <= 0.6) {
        color = 'rgba(242, 54, 69, 0.45)';
        borderColor = 'rgba(242, 54, 69, 0.65)';
      } else {
        color = '#f23645';
        borderColor = '#f23645';
      }
    }

    return {
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      color,
      borderColor,
      wickColor: borderColor,
    };
  });
}

/**
 * Transforms candles into High-Low range bars covering the session range from Low to High.
 */
export function transformHighLow(candles: Candle[]): CandlestickData<Time>[] {
  return candles.map((c, i) => {
    const prev = i > 0 ? candles[i - 1] : null;
    const isUp = prev ? c.close >= prev.close : c.close >= c.open;
    const color = isUp ? '#089981' : '#f23645';
    return {
      time: c.time as Time,
      open: c.low,
      high: c.high,
      low: c.low,
      close: c.high,
      color,
      borderColor: color,
      wickColor: color,
    };
  });
}

/**
 * Transforms candles into Renko bricks based on price volatility.
 */
export function transformRenko(candles: Candle[]): CandlestickData<Time>[] {
  if (candles.length === 0) return [];
  const avgPrice = candles.reduce((acc, c) => acc + c.close, 0) / candles.length;
  const brickSize = Math.max(avgPrice * 0.001, Math.abs(candles[candles.length - 1].close - candles[0].close) / 50 || 1);

  const bricks: CandlestickData<Time>[] = [];
  let currentBrickBase = Math.floor(candles[0].close / brickSize) * brickSize;
  let lastClose = currentBrickBase + brickSize;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const priceDiff = c.close - currentBrickBase;

    if (priceDiff >= brickSize) {
      const open = currentBrickBase;
      const close = currentBrickBase + brickSize;
      bricks.push({
        time: c.time as Time,
        open,
        high: close,
        low: open,
        close,
        color: '#089981',
        borderColor: '#089981',
        wickColor: '#089981',
      });
      currentBrickBase = close;
      lastClose = close;
    } else if (priceDiff <= -brickSize) {
      const open = currentBrickBase;
      const close = currentBrickBase - brickSize;
      bricks.push({
        time: c.time as Time,
        open,
        high: open,
        low: close,
        close,
        color: '#f23645',
        borderColor: '#f23645',
        wickColor: '#f23645',
      });
      currentBrickBase = close;
      lastClose = close;
    } else {
      // Continue previous brick level to ensure exactly 1 element per candle timestamp
      const isUp = lastClose >= currentBrickBase;
      bricks.push({
        time: c.time as Time,
        open: currentBrickBase,
        high: isUp ? lastClose : currentBrickBase,
        low: isUp ? currentBrickBase : lastClose,
        close: lastClose,
        color: isUp ? '#089981' : '#f23645',
        borderColor: isUp ? '#089981' : '#f23645',
        wickColor: isUp ? '#089981' : '#f23645',
      });
    }
  }

  return bricks;
}
