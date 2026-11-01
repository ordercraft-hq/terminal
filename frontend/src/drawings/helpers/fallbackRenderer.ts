import type { ISeriesApi } from 'lightweight-charts';
import type { Candle } from '../../transport/client';
import type { LogicalAnchor, DrawingToolType } from '../../store/syncStore';
import { drawMeasureOverlay } from './measureRenderer';

/**
 * Draws a circular selection handle with an optional glow effect.
 */
export function drawHandleCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isSelected: boolean,
  customColor?: string
): void {
  ctx.save();
  ctx.fillStyle = customColor || (isSelected ? '#2962ff' : '#ffffff');
  ctx.strokeStyle = '#131722';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Outer glow for selected handles
  if (isSelected) {
    ctx.strokeStyle = customColor ? `${customColor}80` : 'rgba(41, 98, 255, 0.4)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Formats duration in seconds into human-readable label (e.g. 15s, 5m, 1.5h, 3.0d).
 */
export function formatDuration(sec: number): string {
  const s = Math.abs(sec);
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

/**
 * Calculates number of chart bars between two timestamps.
 */
export function countBars(candles: Candle[], t1: number, t2: number): number {
  if (candles.length < 2) return Math.max(1, Math.round(Math.abs(t2 - t1) / 900));
  const startTime = Math.min(t1, t2);
  const endTime = Math.max(t1, t2);
  const inRange = candles.filter((c) => c.time >= startTime && c.time <= endTime).length;
  if (inRange > 0) return inRange;
  const barDt = Math.max(1, candles[candles.length - 1].time - candles[candles.length - 2].time);
  return Math.max(1, Math.round(Math.abs(t2 - t1) / barDt));
}

/**
 * Draws a stylized text pill badge with background and border.
 */
export function drawPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  bg = '#1e222d',
  border = '#2a2e39',
  textColor = '#d1d4dc'
): void {
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = '10px JetBrains Mono';
  const metrics = ctx.measureText(text);
  const padX = 6;
  const boxW = metrics.width + padX * 2;
  const boxH = 18;
  const boxX = x - boxW / 2;
  const boxY = y - boxH / 2;

  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

export interface FallbackRenderOptions {
  ctx: CanvasRenderingContext2D;
  type: DrawingToolType;
  anchors: LogicalAnchor[];
  isSelected: boolean;
  color?: string;
  isDraft?: boolean;
  customLineWidth?: number;
  customLineStyle?: 'solid' | 'dashed' | 'dotted';
  width: number;
  height: number;
  series: ISeriesApi<'Candlestick'> | null;
  candles: Candle[];
  priceDecimals: number;
  anchorToCanvas: (anchor: LogicalAnchor) => { x: number; y: number } | null;
  drawHandle: (x: number, y: number, isSelected: boolean, customColor?: string) => void;
}

/**
 * Fallback renderer for drawing tool types that do not have a dedicated DrawingTool implementation registered.
 */
export function drawFallbackSingle(options: FallbackRenderOptions): void {
  const {
    ctx,
    type,
    anchors,
    isSelected,
    color = '#2962ff',
    isDraft = false,
    customLineWidth,
    customLineStyle,
    width,
    height,
    series,
    candles,
    priceDecimals,
    anchorToCanvas,
    drawHandle,
  } = options;

  if (anchors.length === 0) return;
  const pts = anchors.map((a) => anchorToCanvas(a));

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  const baseWidth = customLineWidth || 1.5;
  ctx.lineWidth = isSelected ? baseWidth + 1 : baseWidth;

  if (isDraft) {
    ctx.setLineDash([4, 4]);
  } else if (customLineStyle === 'dashed') {
    ctx.setLineDash([6, 6]);
  } else if (customLineStyle === 'dotted') {
    ctx.setLineDash([2, 4]);
  } else {
    ctx.setLineDash([]);
  }

  switch (type) {
    case 'trendline': {
      if (pts.length >= 2 && pts[0] && pts[1]) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();
        if (isSelected || isDraft) {
          drawHandle(pts[0].x, pts[0].y, isSelected);
          drawHandle(pts[1].x, pts[1].y, isSelected);
        }
      }
      break;
    }

    case 'ray': {
      if (pts.length >= 2 && pts[0] && pts[1]) {
        const dx = pts[1].x - pts[0].x;
        const dy = pts[1].y - pts[0].y;
        const dist = Math.hypot(dx, dy);
        const scale = dist > 0 ? (Math.max(width, height) * 4) / dist : 1;
        const endX = pts[0].x + dx * scale;
        const endY = pts[0].y + dy * scale;

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        if (isSelected || isDraft) {
          drawHandle(pts[0].x, pts[0].y, isSelected);
          drawHandle(pts[1].x, pts[1].y, isSelected);
        }
      }
      break;
    }

    case 'info_line': {
      if (pts.length >= 2 && pts[0] && pts[1]) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();

        const p1 = anchors[0].price;
        const p2 = anchors[1].price;
        const dp = p2 - p1;
        const pct = p1 !== 0 ? (dp / p1) * 100 : 0;
        const dur = formatDuration(anchors[1].time - anchors[0].time);
        const bars = countBars(candles, anchors[0].time, anchors[1].time);
        const theta = Math.round((Math.atan2(-(pts[1].y - pts[0].y), pts[1].x - pts[0].x) * 180) / Math.PI);
        const sign = dp >= 0 ? '+' : '';
        const label = `Δ ${sign}${dp.toFixed(2)} (${sign}${pct.toFixed(2)}%) | ${dur} (${bars} bars) | ${theta}°`;
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        drawPill(ctx, label, midX, midY - 14, '#1e222d', color, '#d1d4dc');

        if (isSelected || isDraft) {
          drawHandle(pts[0].x, pts[0].y, isSelected);
          drawHandle(pts[1].x, pts[1].y, isSelected);
        }
      }
      break;
    }

    case 'horizontal_line': {
      if (pts[0]) {
        const y = pts[0].y;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        if (isSelected) {
          drawHandle(width / 2, y, isSelected);
        }
      }
      break;
    }

    case 'horizontal_ray': {
      if (pts[0]) {
        const y = pts[0].y;
        const x = pts[0].x;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        if (isSelected || isDraft) {
          drawHandle(x, y, isSelected);
        }
      }
      break;
    }

    case 'vertical_line': {
      if (pts[0]) {
        const x = pts[0].x;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        if (isSelected) {
          drawHandle(x, height / 2, isSelected);
        }
      }
      break;
    }

    case 'cross_line': {
      if (pts[0]) {
        const { x, y } = pts[0];
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        if (isSelected || isDraft) {
          drawHandle(x, y, isSelected);
        }
      }
      break;
    }

    case 'parallel_channel': {
      if (pts.length >= 2 && pts[0] && pts[1]) {
        const x1 = pts[0].x,
          y1 = pts[0].y;
        const x2 = pts[1].x,
          y2 = pts[1].y;
        const dx = x2 - x1,
          dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;

        if (pts.length >= 3 && pts[2] && lenSq > 0) {
          const x3 = pts[2].x,
            y3 = pts[2].y;
          const t = ((x3 - x1) * dx + (y3 - y1) * dy) / lenSq;
          const ox = x3 - (x1 + t * dx);
          const oy = y3 - (y1 + t * dy);

          // Shaded channel fill
          ctx.save();
          ctx.fillStyle = isSelected ? 'rgba(41, 98, 255, 0.2)' : 'rgba(41, 98, 255, 0.1)';
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.lineTo(x2 + ox, y2 + oy);
          ctx.lineTo(x1 + ox, y1 + oy);
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          // Baseline
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();

          // Parallel line
          ctx.beginPath();
          ctx.moveTo(x1 + ox, y1 + oy);
          ctx.lineTo(x2 + ox, y2 + oy);
          ctx.stroke();

          // Dashed Midline
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(x1 + ox / 2, y1 + oy / 2);
          ctx.lineTo(x2 + ox / 2, y2 + oy / 2);
          ctx.stroke();
          ctx.restore();

          if (isSelected || isDraft) {
            drawHandle(x1, y1, isSelected);
            drawHandle(x2, y2, isSelected);
            drawHandle(x3, y3, isSelected);
          }
        } else {
          // 2 points during initial drafting phase
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          if (isSelected || isDraft) {
            drawHandle(x1, y1, isSelected);
            drawHandle(x2, y2, isSelected);
          }
        }
      }
      break;
    }

    case 'rectangle': {
      if (pts.length >= 2 && pts[0] && pts[1]) {
        const x = Math.min(pts[0].x, pts[1].x);
        const y = Math.min(pts[0].y, pts[1].y);
        const w = Math.abs(pts[1].x - pts[0].x);
        const h = Math.abs(pts[1].y - pts[0].y);

        ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.25)' : 'rgba(41, 98, 255, 0.15)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);

        if (isSelected || isDraft) {
          drawHandle(pts[0].x, pts[0].y, isSelected);
          drawHandle(pts[1].x, pts[1].y, isSelected);
          drawHandle(pts[0].x, pts[1].y, isSelected);
          drawHandle(pts[1].x, pts[0].y, isSelected);
        }
      }
      break;
    }

    case 'circle': {
      if (pts.length >= 2 && pts[0] && pts[1]) {
        const r = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        ctx.fillStyle = isSelected ? 'rgba(41, 98, 255, 0.2)' : 'rgba(41, 98, 255, 0.1)';
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (isSelected || isDraft) {
          drawHandle(pts[0].x, pts[0].y, isSelected);
          drawHandle(pts[1].x, pts[1].y, isSelected);
        }
      }
      break;
    }

    case 'fib_retracement': {
      if (pts.length >= 2 && pts[0] && pts[1] && series) {
        const levels = [
          { r: 0.0, c: '#787b86' },
          { r: 0.236, c: '#f23645' },
          { r: 0.382, c: '#ff9800' },
          { r: 0.5, c: '#089981' },
          { r: 0.618, c: '#2962ff' },
          { r: 0.786, c: '#9c27b0' },
          { r: 1.0, c: '#787b86' },
        ];

        const p0 = anchors[1].price;
        const p1 = anchors[0].price;
        const xStart = Math.min(pts[0].x, pts[1].x);
        const xEnd = Math.max(pts[0].x, pts[1].x) + 140;

        levels.forEach((lvl, idx) => {
          const priceLevel = p0 + (p1 - p0) * lvl.r;
          const yLevel = series.priceToCoordinate(priceLevel);
          if (yLevel === null) return;

          ctx.strokeStyle = lvl.c;
          ctx.beginPath();
          ctx.moveTo(xStart, yLevel);
          ctx.lineTo(Math.max(xEnd, width), yLevel);
          ctx.stroke();

          // Fib Label
          ctx.fillStyle = lvl.c;
          ctx.font = '10px JetBrains Mono';
          ctx.textAlign = 'left';
          ctx.fillText(`${lvl.r} (${priceLevel.toFixed(priceDecimals)})`, xStart + 4, yLevel - 3);

          // Shaded bands
          if (idx < levels.length - 1) {
            const nextPrice = p0 + (p1 - p0) * levels[idx + 1].r;
            const nextY = series.priceToCoordinate(nextPrice);
            if (nextY !== null) {
              ctx.fillStyle = `${lvl.c}1a`; // 10% opacity
              ctx.fillRect(xStart, yLevel, Math.max(xEnd, width) - xStart, nextY - yLevel);
            }
          }
        });

        if (isSelected || isDraft) {
          drawHandle(pts[0].x, pts[0].y, isSelected);
          drawHandle(pts[1].x, pts[1].y, isSelected);
        }
      }
      break;
    }

    case 'fib_extension': {
      if (pts.length >= 2 && pts[0] && pts[1] && series) {
        // Draw A -> B trendline
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();

        if (pts.length >= 3 && pts[2]) {
          // Draw B -> C retracement line
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(pts[1].x, pts[1].y);
          ctx.lineTo(pts[2].x, pts[2].y);
          ctx.stroke();
          ctx.restore();

          const extLevels = [
            { r: 0.0, c: '#787b86' },
            { r: 0.236, c: '#f23645' },
            { r: 0.382, c: '#ff9800' },
            { r: 0.5, c: '#089981' },
            { r: 0.618, c: '#2962ff' },
            { r: 0.786, c: '#9c27b0' },
            { r: 1.0, c: '#787b86' },
            { r: 1.272, c: '#ff9800' },
            { r: 1.618, c: '#089981' },
            { r: 2.618, c: '#2962ff' },
          ];

          const p1 = anchors[0].price;
          const p2 = anchors[1].price;
          const p3 = anchors[2].price;
          const xStart = Math.min(pts[1].x, pts[2].x);
          const xEnd = Math.max(pts[1].x, pts[2].x);

          extLevels.forEach((lvl, idx) => {
            const priceLevel = p3 + (p2 - p1) * lvl.r;
            const yLevel = series.priceToCoordinate(priceLevel);
            if (yLevel === null) return;

            ctx.strokeStyle = lvl.c;
            ctx.beginPath();
            ctx.moveTo(xStart, yLevel);
            ctx.lineTo(Math.max(xEnd, width), yLevel);
            ctx.stroke();

            ctx.fillStyle = lvl.c;
            ctx.font = '10px JetBrains Mono';
            ctx.textAlign = 'left';
            ctx.fillText(`${lvl.r} (${priceLevel.toFixed(priceDecimals)})`, xStart + 4, yLevel - 3);

            if (idx < extLevels.length - 1) {
              const nextPrice = p3 + (p2 - p1) * extLevels[idx + 1].r;
              const nextY = series.priceToCoordinate(nextPrice);
              if (nextY !== null) {
                ctx.fillStyle = `${lvl.c}14`;
                ctx.fillRect(xStart, yLevel, Math.max(xEnd, width) - xStart, nextY - yLevel);
              }
            }
          });

          if (isSelected || isDraft) {
            drawHandle(pts[0].x, pts[0].y, isSelected);
            drawHandle(pts[1].x, pts[1].y, isSelected);
            drawHandle(pts[2].x, pts[2].y, isSelected);
          }
        } else if (isSelected || isDraft) {
          drawHandle(pts[0].x, pts[0].y, isSelected);
          drawHandle(pts[1].x, pts[1].y, isSelected);
        }
      }
      break;
    }

    case 'long_position': {
      if (pts.length >= 3 && pts[0] && pts[1] && pts[2]) {
        const x1 = Math.min(pts[0].x, pts[1].x);
        const x2 = Math.max(pts[0].x, pts[1].x);
        const w = Math.max(20, x2 - x1);
        const yEntry = pts[0].y;
        const yTarget = pts[1].y;
        const yStop = pts[2].y;

        const pEntry = anchors[0].price;
        const pTarget = anchors[1].price;
        const pStop = anchors[2].price;

        const profit = pTarget - pEntry;
        const profitPct = pEntry !== 0 ? (profit / pEntry) * 100 : 0;
        const loss = pEntry - pStop;
        const lossPct = pEntry !== 0 ? (loss / pEntry) * 100 : 0;
        const rr = loss > 0 ? profit / loss : 0;

        // Target (Profit) Zone - Green
        const profitTop = Math.min(yEntry, yTarget);
        const profitHeight = Math.abs(yEntry - yTarget);
        ctx.fillStyle = 'rgba(8, 153, 129, 0.2)';
        ctx.fillRect(x1, profitTop, w, profitHeight);
        ctx.strokeStyle = '#089981';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x1, profitTop, w, profitHeight);

        // Stop (Loss) Zone - Red
        const lossTop = Math.min(yEntry, yStop);
        const lossHeight = Math.abs(yEntry - yStop);
        ctx.fillStyle = 'rgba(242, 54, 69, 0.2)';
        ctx.fillRect(x1, lossTop, w, lossHeight);
        ctx.strokeStyle = '#f23645';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x1, lossTop, w, lossHeight);

        // Entry Line - Gray
        ctx.strokeStyle = '#d1d4dc';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x1, yEntry);
        ctx.lineTo(x1 + w, yEntry);
        ctx.stroke();

        // Pills: Target (top), Stop (bottom), R:R (center)
        const targetPillY = profitHeight >= 36 ? profitTop + 14 : Math.min(profitTop + profitHeight / 2, yEntry - 14);
        const stopPillY =
          lossHeight >= 36 ? lossTop + lossHeight - 14 : Math.max(lossTop + lossHeight / 2, yEntry + 14);
        drawPill(
          ctx,
          `Target: +${profit.toFixed(priceDecimals)} (+${profitPct.toFixed(2)}%)`,
          x1 + w / 2,
          targetPillY,
          '#089981',
          '#089981',
          '#ffffff'
        );
        drawPill(
          ctx,
          `Stop: -${loss.toFixed(priceDecimals)} (-${lossPct.toFixed(2)}%)`,
          x1 + w / 2,
          stopPillY,
          '#f23645',
          '#f23645',
          '#ffffff'
        );
        drawPill(ctx, `Risk/Reward: ${rr.toFixed(2)}`, x1 + w / 2, yEntry, '#1e222d', '#2a2e39', '#d1d4dc');

        if (isSelected || isDraft) {
          const xMid = x1 + w / 2;
          // Target Handles (Green) - center & right
          drawHandle(xMid, yTarget, isSelected, '#089981');
          drawHandle(x1 + w, yTarget, isSelected, '#089981');
          // Stop Handles (Red) - center & right
          drawHandle(xMid, yStop, isSelected, '#f23645');
          drawHandle(x1 + w, yStop, isSelected, '#f23645');
          // Width Handle (Blue) - right edge center
          drawHandle(x1 + w, yEntry, isSelected, '#2962ff');
          // Entry Handles (White) - left edge & center
          drawHandle(pts[0].x, pts[0].y, isSelected, '#ffffff');
          drawHandle(xMid, yEntry, isSelected, '#ffffff');
        }
      }
      break;
    }

    case 'short_position': {
      if (pts.length >= 3 && pts[0] && pts[1] && pts[2]) {
        const x1 = Math.min(pts[0].x, pts[1].x);
        const x2 = Math.max(pts[0].x, pts[1].x);
        const w = Math.max(20, x2 - x1);
        const yEntry = pts[0].y;
        const yTarget = pts[1].y;
        const yStop = pts[2].y;

        const pEntry = anchors[0].price;
        const pTarget = anchors[1].price;
        const pStop = anchors[2].price;

        const profit = pEntry - pTarget;
        const profitPct = pEntry !== 0 ? (profit / pEntry) * 100 : 0;
        const loss = pStop - pEntry;
        const lossPct = pEntry !== 0 ? (loss / pEntry) * 100 : 0;
        const rr = loss > 0 ? profit / loss : 0;

        // Stop (Loss) Zone - Red (Above Entry)
        const lossTop = Math.min(yEntry, yStop);
        const lossHeight = Math.abs(yEntry - yStop);
        ctx.fillStyle = 'rgba(242, 54, 69, 0.2)';
        ctx.fillRect(x1, lossTop, w, lossHeight);
        ctx.strokeStyle = '#f23645';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x1, lossTop, w, lossHeight);

        // Target (Profit) Zone - Green (Below Entry)
        const profitTop = Math.min(yEntry, yTarget);
        const profitHeight = Math.abs(yEntry - yTarget);
        ctx.fillStyle = 'rgba(8, 153, 129, 0.2)';
        ctx.fillRect(x1, profitTop, w, profitHeight);
        ctx.strokeStyle = '#089981';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x1, profitTop, w, profitHeight);

        // Entry Line - Gray
        ctx.strokeStyle = '#d1d4dc';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x1, yEntry);
        ctx.lineTo(x1 + w, yEntry);
        ctx.stroke();

        // Pills: Stop (top), Target (bottom), R:R (center)
        const stopPillY = lossHeight >= 36 ? lossTop + 14 : Math.min(lossTop + lossHeight / 2, yEntry - 14);
        const targetPillY =
          profitHeight >= 36 ? profitTop + profitHeight - 14 : Math.max(profitTop + profitHeight / 2, yEntry + 14);
        drawPill(
          ctx,
          `Stop: -${loss.toFixed(priceDecimals)} (-${lossPct.toFixed(2)}%)`,
          x1 + w / 2,
          stopPillY,
          '#f23645',
          '#f23645',
          '#ffffff'
        );
        drawPill(
          ctx,
          `Target: +${profit.toFixed(priceDecimals)} (+${profitPct.toFixed(2)}%)`,
          x1 + w / 2,
          targetPillY,
          '#089981',
          '#089981',
          '#ffffff'
        );
        drawPill(ctx, `Risk/Reward: ${rr.toFixed(2)}`, x1 + w / 2, yEntry, '#1e222d', '#2a2e39', '#d1d4dc');

        if (isSelected || isDraft) {
          const xMid = x1 + w / 2;
          // Target Handles (Green) - center & right
          drawHandle(xMid, yTarget, isSelected, '#089981');
          drawHandle(x1 + w, yTarget, isSelected, '#089981');
          // Stop Handles (Red) - center & right
          drawHandle(xMid, yStop, isSelected, '#f23645');
          drawHandle(x1 + w, yStop, isSelected, '#f23645');
          // Width Handle (Blue) - right edge center
          drawHandle(x1 + w, yEntry, isSelected, '#2962ff');
          // Entry Handles (White) - left edge & center
          drawHandle(pts[0].x, pts[0].y, isSelected, '#ffffff');
          drawHandle(xMid, yEntry, isSelected, '#ffffff');
        }
      }
      break;
    }

    case 'price_range':
    case 'date_price_range': {
      if (pts.length >= 2 && pts[0] && pts[1]) {
        drawMeasureOverlay({
          ctx,
          startAnchor: anchors[0],
          currentAnchor: anchors[1],
          width,
          height,
          candles,
          priceDecimals,
          anchorToCanvas,
          isPlaced: !isDraft,
          drawHandle,
        });
      }
      break;
    }

    default:
      break;
  }

  ctx.restore();
}
