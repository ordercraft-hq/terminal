import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import type { Candle } from '../../transport/client';
import type { LogicalAnchor, MagnetMode } from '../../store/syncStore';

/**
 * Calculates exact plot surface dimensions, excluding right price scale and bottom time scale.
 */
export function getPlotDimensions(
  chart: IChartApi | null,
  container: HTMLElement | null,
  fallbackSize: { width: number; height: number }
): { width: number; height: number } {
  let w = 0;
  let h = 0;

  if (chart) {
    try {
      const size = (chart as any).paneSize?.(0);
      if (size && size.width > 0 && size.height > 0) {
        w = size.width;
        h = size.height;
      }
    } catch {}

    if (w <= 0) {
      try {
        const tsW = chart.timeScale()?.width?.();
        if (tsW && tsW > 0) w = tsW;
      } catch {}
    }
  }

  if (w <= 0 || h <= 0) {
    if (container) {
      const rect = container.getBoundingClientRect();
      const priceScaleWidth = chart ? (chart.priceScale('right')?.width() || 65) : 65;
      const timeScaleHeight = chart ? (chart.timeScale()?.height() || 26) : 26;
      if (w <= 0) w = Math.max(0, rect.width - priceScaleWidth);
      if (h <= 0) h = Math.max(0, rect.height - timeScaleHeight);
    }
  }

  if (w <= 0 || h <= 0) {
    if (fallbackSize.width > 0 && w <= 0) w = fallbackSize.width;
    if (fallbackSize.height > 0 && h <= 0) h = fallbackSize.height;
  }

  return { width: Math.max(0, w), height: Math.max(0, h) };
}

/**
 * Binary search to find closest candle by timestamp.
 */
export function findClosestCandle(candles: Candle[], time: number): Candle | null {
  if (!candles || candles.length === 0) return null;
  let low = 0;
  let high = candles.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (candles[mid].time === time) return candles[mid];
    if (candles[mid].time < time) low = mid + 1;
    else high = mid - 1;
  }
  if (low >= candles.length) return candles[candles.length - 1];
  if (high < 0) return candles[0];
  const diffLow = Math.abs(candles[low].time - time);
  const diffHigh = Math.abs(candles[high].time - time);
  return diffLow < diffHigh ? candles[low] : candles[high];
}

/**
 * Snap coordinates and anchor to Candle Open, High, Low, or Close.
 */
export function snapToCandleOHLC(
  rawAnchor: LogicalAnchor,
  mouseX: number,
  mouseY: number,
  isCtrlHeld: boolean,
  magnetMode: MagnetMode,
  chart: IChartApi | null,
  series: ISeriesApi<'Candlestick'> | null,
  candles: Candle[]
): { anchor: LogicalAnchor; snapCoord: { x: number; y: number } | null } {
  const isSnappingActive = isCtrlHeld || magnetMode === 'weak' || magnetMode === 'strong';
  if (!isSnappingActive || !chart || !series || candles.length === 0) {
    return { anchor: rawAnchor, snapCoord: null };
  }

  const candle = findClosestCandle(candles, rawAnchor.time);
  if (!candle) return { anchor: rawAnchor, snapCoord: null };

  const candleX = chart.timeScale().timeToCoordinate(candle.time as Time);
  if (candleX === null) return { anchor: rawAnchor, snapCoord: null };

  const candidates = [candle.open, candle.high, candle.low, candle.close];
  let bestPrice = candle.close;
  let bestDist = Infinity;
  let bestY = mouseY;

  for (const p of candidates) {
    const y = series.priceToCoordinate(p);
    if (y === null) continue;
    const d = Math.abs(y - mouseY);
    if (d < bestDist) {
      bestDist = d;
      bestPrice = p;
      bestY = y;
    }
  }

  if (isCtrlHeld || magnetMode === 'strong') {
    return {
      anchor: { time: candle.time, price: bestPrice },
      snapCoord: { x: candleX, y: bestY },
    };
  }

  const distX = Math.abs(candleX - mouseX);
  const distY = Math.abs(bestY - mouseY);
  if (Math.hypot(distX, distY) <= 24) {
    return {
      anchor: { time: candle.time, price: bestPrice },
      snapCoord: { x: candleX, y: bestY },
    };
  }

  return { anchor: rawAnchor, snapCoord: null };
}

/**
 * Convert LogicalAnchor (time, price) to Canvas Coordinates (x, y).
 */
export function anchorToCanvas(
  anchor: LogicalAnchor,
  chart: IChartApi | null,
  series: ISeriesApi<'Candlestick'> | null,
  candles: Candle[]
): { x: number; y: number } | null {
  if (!chart || !series) return null;

  // 1. Convert price to coordinate (with continuous off-screen linear extrapolation)
  let y: number | null = series.priceToCoordinate(anchor.price) as number | null;
  if (y === null || isNaN(y)) {
    const yA = 20;
    const yB = 200;
    const pA = series.coordinateToPrice(yA as any) as number | null;
    const pB = series.coordinateToPrice(yB as any) as number | null;
    if (pA !== null && pB !== null && pA !== pB) {
      const slope = (pB - pA) / (yB - yA);
      y = yA + (anchor.price - pA) / slope;
    } else {
      return null;
    }
  }

  // 2. Direct match on chart time scale
  const directX = chart.timeScale().timeToCoordinate(anchor.time as Time) as number | null;
  if (directX !== null && !isNaN(directX)) {
    return { x: directX, y };
  }

  // 3. Multi-timeframe sub-bar interpolation and future/past linear extrapolation
  if (candles.length > 0) {
    const first = candles[0];
    const last = candles[candles.length - 1];
    const barDt = candles.length >= 2 ? Math.max(1, last.time - candles[candles.length - 2].time) : 60;

    // Case A: Future extrapolation
    if (anchor.time >= last.time) {
      const lastIdx = candles.length - 1;
      const xLast =
        (chart.timeScale().logicalToCoordinate(lastIdx as any) as number | null) ??
        (chart.timeScale().timeToCoordinate(last.time as Time) as number | null);
      const xPrev =
        (chart.timeScale().logicalToCoordinate((lastIdx - 1) as any) as number | null) ??
        (candles.length >= 2
          ? (chart.timeScale().timeToCoordinate(candles[candles.length - 2].time as Time) as number | null)
          : null);
      if (xLast !== null && xPrev !== null && !isNaN(xLast) && !isNaN(xPrev)) {
        const barWidth = xLast - xPrev;
        if (barWidth > 0) {
          const diffBars = (anchor.time - last.time) / barDt;
          return { x: xLast + diffBars * barWidth, y };
        }
      }
    }

    // Case B: Past extrapolation
    if (anchor.time <= first.time) {
      const xFirst =
        (chart.timeScale().logicalToCoordinate(0 as any) as number | null) ??
        (chart.timeScale().timeToCoordinate(first.time as Time) as number | null);
      const xSecond =
        (chart.timeScale().logicalToCoordinate(1 as any) as number | null) ??
        (candles.length >= 2
          ? (chart.timeScale().timeToCoordinate(candles[1].time as Time) as number | null)
          : null);
      if (xFirst !== null && xSecond !== null && !isNaN(xFirst) && !isNaN(xSecond)) {
        const barWidth = xSecond - xFirst;
        if (barWidth > 0) {
          const diffBars = (first.time - anchor.time) / barDt;
          return { x: xFirst - diffBars * barWidth, y };
        }
      }
    }

    // Case C: Between candle interpolation
    try {
      let low = 0;
      let high = candles.length - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (candles[mid].time < anchor.time) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      const leftIdx = Math.max(0, high);
      const rightIdx = Math.min(candles.length - 1, low);

      if (leftIdx !== rightIdx && leftIdx >= 0 && rightIdx < candles.length) {
        const tLeft = candles[leftIdx].time;
        const tRight = candles[rightIdx].time;
        const xLeft = chart.timeScale().timeToCoordinate(tLeft as Time);
        const xRight = chart.timeScale().timeToCoordinate(tRight as Time);

        if (xLeft !== null && xRight !== null && tRight > tLeft) {
          const fraction = (anchor.time - tLeft) / (tRight - tLeft);
          const x = xLeft + fraction * (xRight - xLeft);
          return { x, y };
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Convert Canvas Coordinates (x, y) to LogicalAnchor (time, price).
 */
export function canvasToAnchor(
  x: number,
  y: number,
  chart: IChartApi | null,
  series: ISeriesApi<'Candlestick'> | null,
  candles: Candle[]
): LogicalAnchor | null {
  if (!chart || !series) return null;

  // 1. Convert y coordinate to price
  let price: number | null = series.coordinateToPrice(y as any) as number | null;
  if (price === null || isNaN(price)) {
    const yA = 20;
    const yB = 200;
    const pA = series.coordinateToPrice(yA as any) as number | null;
    const pB = series.coordinateToPrice(yB as any) as number | null;
    if (pA !== null && pB !== null && pA !== pB) {
      const slope = (pB - pA) / (yB - yA);
      price = pA + slope * (y - yA);
    } else if (candles.length > 0) {
      price = candles[candles.length - 1].close;
    } else {
      return null;
    }
  }

  // 2. High-precision coordinate to time conversion via timeScale.coordinateToLogical with sub-bar precision
  if (candles.length > 0) {
    try {
      const logical = chart.timeScale().coordinateToLogical(x);
      if (logical !== null && !isNaN(logical as number)) {
        const N = candles.length;
        const barDt = N >= 2 ? Math.max(1, candles[N - 1].time - candles[N - 2].time) : 60;
        const intLog = Math.floor(logical as number);

        const x0 = chart.timeScale().logicalToCoordinate(intLog as any) as number | null;
        const x1 = chart.timeScale().logicalToCoordinate((intLog + 1) as any) as number | null;
        let frac = 0;
        if (x0 !== null && x1 !== null && x1 !== x0) {
          frac = (x - x0) / (x1 - x0);
        }
        const floatLog = intLog + frac;

        let time: number;
        if (floatLog >= N - 1) {
          time = Math.round(candles[N - 1].time + (floatLog - (N - 1)) * barDt);
        } else if (floatLog <= 0) {
          time = Math.round(candles[0].time + floatLog * barDt);
        } else {
          const idx = Math.floor(floatLog);
          const subFrac = floatLog - idx;
          if (idx < N - 1) {
            time = Math.round(candles[idx].time + subFrac * (candles[idx + 1].time - candles[idx].time));
          } else {
            time = candles[idx].time;
          }
        }
        return { time, price };
      }
    } catch {}
  }

  // 3. Fallback: coordinateToTime
  const time = chart.timeScale().coordinateToTime(x) as number | null;
  if (time !== null) {
    return { time, price };
  }

  // 4. Fallback: continuous time calculation using latest candle step
  if (candles.length >= 2) {
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const lastX = chart.timeScale().timeToCoordinate(last.time as Time) as number | null;
    const prevX = chart.timeScale().timeToCoordinate(prev.time as Time) as number | null;
    if (lastX !== null && prevX !== null) {
      const dt = last.time - prev.time;
      const barWidth = lastX - prevX;
      if (barWidth > 0 && dt > 0) {
        const diffBars = (x - lastX) / barWidth;
        return { time: Math.round(last.time + diffBars * dt), price };
      }
    }
  }

  if (candles.length > 0) {
    return { time: candles[candles.length - 1].time, price };
  }

  return null;
}
