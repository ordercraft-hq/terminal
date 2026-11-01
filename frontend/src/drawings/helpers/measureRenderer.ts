import type { LogicalAnchor } from '../types';
import type { Candle } from '../../transport/client';

export interface MeasureState {
  startAnchor: LogicalAnchor;
  currentAnchor: LogicalAnchor;
  isPlaced: boolean;
  startPoint?: { x: number; y: number };
  currentPoint?: { x: number; y: number };
  isDragging?: boolean;
}

export interface MeasureRenderOptions {
  ctx: CanvasRenderingContext2D;
  startAnchor: LogicalAnchor;
  currentAnchor: LogicalAnchor;
  width: number;
  height: number;
  candles: Candle[];
  priceDecimals: number;
  anchorToCanvas: (anchor: LogicalAnchor) => { x: number; y: number } | null;
  isPlaced?: boolean;
  drawHandle?: (x: number, y: number, isSelected: boolean, customColor?: string) => void;
}

/**
 * Draws rounded rectangle path compatible with all Canvas 2D contexts.
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

/**
 * Draws sharp directional vector arrowheads at the ends of the crosshair axes.
 */
function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  toX: number,
  toY: number,
  dir: 'up' | 'down' | 'left' | 'right',
  color: string
) {
  const len = 7;
  const width = 4;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  if (dir === 'up') {
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - width, toY + len);
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX + width, toY + len);
  } else if (dir === 'down') {
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - width, toY - len);
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX + width, toY - len);
  } else if (dir === 'right') {
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - len, toY - width);
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - len, toY + width);
  } else if (dir === 'left') {
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX + len, toY - width);
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX + len, toY + width);
  }

  ctx.stroke();
  ctx.restore();
}

/**
 * Formats time difference in seconds into concise duration (e.g. 26m, 1h 15m, 2d).
 */
export function formatMeasureDuration(absSeconds: number): string {
  if (absSeconds < 60) {
    return `${absSeconds}s`;
  }
  if (absSeconds < 3600) {
    return `${Math.round(absSeconds / 60)}m`;
  }
  if (absSeconds < 86400) {
    const h = Math.floor(absSeconds / 3600);
    const m = Math.round((absSeconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(absSeconds / 86400);
  const h = Math.round((absSeconds % 86400) / 3600);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

/**
 * Formats volume into compact human-readable string (e.g. 168, 45.2K, 1.25M).
 */
export function formatMeasureVolume(vol: number): string {
  if (vol >= 1_000_000_000) {
    return `${(vol / 1_000_000_000).toFixed(2)}B`;
  }
  if (vol >= 1_000_000) {
    return `${(vol / 1_000_000).toFixed(2)}M`;
  }
  if (vol >= 1_000) {
    return `${(vol / 1_000).toFixed(1)}K`;
  }
  return Math.round(vol).toString();
}

/**
 * Finds index of candle closest to target timestamp.
 */
function findClosestCandleIndex(candles: Candle[], targetTime: number): number {
  if (!candles || candles.length === 0) return -1;
  let low = 0;
  let high = candles.length - 1;
  let bestIdx = 0;
  let minDiff = Math.abs(candles[0].time - targetTime);

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const diff = Math.abs(candles[mid].time - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      bestIdx = mid;
    }
    if (candles[mid].time < targetTime) {
      low = mid + 1;
    } else if (candles[mid].time > targetTime) {
      high = mid - 1;
    } else {
      return mid;
    }
  }
  return bestIdx;
}

/**
 * Renders the measurement box with directional crosshair arrows and stats badge.
 */
export function drawMeasureOverlay(options: MeasureRenderOptions): void {
  const {
    ctx,
    startAnchor,
    currentAnchor,
    width,
    height,
    candles,
    priceDecimals,
    anchorToCanvas,
    isPlaced = false,
    drawHandle,
  } = options;

  const p1 = anchorToCanvas(startAnchor);
  const p2 = anchorToCanvas(currentAnchor);
  if (!p1 || !p2 || isNaN(p1.x) || isNaN(p1.y) || isNaN(p2.x) || isNaN(p2.y)) {
    return;
  }

  const x1 = Math.min(p1.x, p2.x);
  const x2 = Math.max(p1.x, p2.x);
  const y1 = Math.min(p1.y, p2.y);
  const y2 = Math.max(p1.y, p2.y);
  const boxW = Math.max(2, x2 - x1);
  const boxH = Math.max(2, y2 - y1);

  // Price calculations
  const dp = currentAnchor.price - startAnchor.price;
  const isBullish = dp >= 0;

  // Pro Theme Colors:
  // Bullish: Blue (#2962ff), rgba(41, 98, 255, 0.20)
  // Bearish: Red/Pink (#f25363 or #f23645), rgba(242, 54, 69, 0.20)
  const primaryColor = isBullish ? '#2962ff' : '#f25363';
  const fillColor = isBullish ? 'rgba(41, 98, 255, 0.20)' : 'rgba(242, 54, 69, 0.20)';
  const borderColor = isBullish ? 'rgba(41, 98, 255, 0.85)' : 'rgba(242, 83, 99, 0.85)';

  ctx.save();

  // 1. Shaded Rectangle Fill
  ctx.fillStyle = fillColor;
  ctx.fillRect(x1, y1, boxW, boxH);

  // 2. Outer Border (thin line)
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeRect(x1, y1, boxW, boxH);

  // 3. Center Crosshair Axes with Directional Arrows
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = 1.2;

  // Horizontal axis line across box
  ctx.beginPath();
  ctx.moveTo(x1, midY);
  ctx.lineTo(x2, midY);
  ctx.stroke();

  // Vertical axis line across box
  ctx.beginPath();
  ctx.moveTo(midX, y1);
  ctx.lineTo(midX, y2);
  ctx.stroke();

  // Horizontal arrow pointing to cursor direction
  if (p2.x >= p1.x) {
    drawArrowHead(ctx, x2, midY, 'right', primaryColor);
  } else {
    drawArrowHead(ctx, x1, midY, 'left', primaryColor);
  }

  // Vertical arrow pointing to cursor direction (canvas y decreases as price increases)
  if (p2.y <= p1.y) {
    drawArrowHead(ctx, midX, y1, 'up', primaryColor);
  } else {
    drawArrowHead(ctx, midX, y2, 'down', primaryColor);
  }

  // 4. Calculate Stats Data
  const pct = startAnchor.price !== 0 ? (dp / startAnchor.price) * 100 : 0;
  const tickMultiplier = Math.pow(10, Math.min(6, Math.max(0, priceDecimals)));
  const ticks = Math.round(dp * tickMultiplier);

  // Line 1: Price diff, percentage in parens, ticks/points
  // Positive: "1.61 (0.07%) 161"
  // Negative: "-2.05 (-0.09%) -205"
  const dpStr = dp.toFixed(priceDecimals);
  const pctStr = `${pct.toFixed(2)}%`;
  const line1 = `${dpStr} (${pctStr}) ${ticks}`;

  // Line 2: Bar count and duration
  let barCount = 1;
  let totalVol = 0;
  let hasCandles = false;

  if (candles && candles.length > 0) {
    hasCandles = true;
    const idx1 = findClosestCandleIndex(candles, startAnchor.time);
    const idx2 = findClosestCandleIndex(candles, currentAnchor.time);

    if (idx1 >= 0 && idx2 >= 0) {
      const rawBars = Math.abs(idx2 - idx1) + 1;
      barCount = currentAnchor.time < startAnchor.time ? -rawBars : rawBars;

      const iMin = Math.min(idx1, idx2);
      const iMax = Math.max(idx1, idx2);
      for (let i = iMin; i <= iMax && i < candles.length; i++) {
        totalVol += candles[i].volume || 0;
      }
    }
  } else {
    const rawBars = Math.max(1, Math.round(Math.abs(currentAnchor.time - startAnchor.time) / 60));
    barCount = currentAnchor.time < startAnchor.time ? -rawBars : rawBars;
  }

  const dtSeconds = currentAnchor.time - startAnchor.time;
  const absDt = Math.abs(dtSeconds);
  let durStr = formatMeasureDuration(absDt);
  if (dtSeconds < 0) {
    durStr = `-${durStr}`;
  }

  const line2 = `${barCount} bars, ${durStr}`;

  // Line 3: Volume (if available and positive)
  const lines: string[] = [line1, line2];
  if (hasCandles && totalVol > 0) {
    lines.push(`Vol ${formatMeasureVolume(totalVol)}`);
  }

  // 5. Compute Badge Layout
  ctx.font = 'bold 12px Inter, -apple-system, system-ui, sans-serif';
  let maxTextW = 0;
  for (const line of lines) {
    const m = ctx.measureText(line);
    if (m.width > maxTextW) maxTextW = m.width;
  }

  const badgeW = Math.max(130, Math.ceil(maxTextW + 28));
  const badgeH = lines.length === 3 ? 58 : 42;
  const badgeRadius = 7;

  // Center horizontally over the measured box, clamped to plot area
  let badgeX = midX - badgeW / 2;
  if (badgeX < 6) badgeX = 6;
  if (badgeX + badgeW > width - 6) badgeX = width - badgeW - 6;

  // Vertical placement:
  // Upward measurement: Badge sits above y1
  // Downward measurement: Badge sits below y2
  let badgeY: number;
  if (isBullish) {
    badgeY = y1 - badgeH - 6;
    // If overflowing top of chart, flip below y2
    if (badgeY < 6) {
      badgeY = y2 + 6;
    }
  } else {
    badgeY = y2 + 6;
    // If overflowing bottom of chart, flip above y1
    if (badgeY + badgeH > height - 6) {
      badgeY = y1 - badgeH - 6;
    }
  }

  // 6. Draw Badge Background
  ctx.save();
  ctx.fillStyle = primaryColor;
  drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeRadius);
  ctx.fill();
  ctx.restore();

  // 7. Render Badge Text
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const badgeMidX = badgeX + badgeW / 2;

  // Header line (bold 12px)
  ctx.font = 'bold 12px Inter, -apple-system, system-ui, sans-serif';
  ctx.fillText(lines[0], badgeMidX, badgeY + 13);

  // Sub-line 1: bars & duration (11px)
  ctx.font = '11px Inter, -apple-system, system-ui, sans-serif';
  ctx.fillText(lines[1], badgeMidX, badgeY + 29);

  // Sub-line 2: volume (11px)
  if (lines.length > 2) {
    ctx.fillText(lines[2], badgeMidX, badgeY + 45);
  }

  // 8. Handles on corners when placed
  if (isPlaced && drawHandle) {
    drawHandle(p1.x, p1.y, true, primaryColor);
    drawHandle(p2.x, p2.y, true, primaryColor);
  }

  ctx.restore();
}
