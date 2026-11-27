import type { ISeriesApi, SeriesType } from 'lightweight-charts';
import type { Candle } from '../../transport/client';
import type { LogicalAnchor, DrawingToolType } from '../../store/syncStore';
import { BaseDrawingTool } from '../BaseDrawingTool';
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
  BaseDrawingTool.drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 4);
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
  series: ISeriesApi<SeriesType> | null;
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

    default: {
      // Generic polyline / segment fallback for any unregistered shape
      const validPts = pts.filter((p): p is { x: number; y: number } => p !== null);
      if (validPts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(validPts[0].x, validPts[0].y);
        for (let i = 1; i < validPts.length; i++) {
          ctx.lineTo(validPts[i].x, validPts[i].y);
        }
        ctx.stroke();
      }
      if (isSelected || isDraft) {
        for (const p of validPts) {
          drawHandle(p.x, p.y, isSelected);
        }
      }
      break;
    }
  }

  ctx.restore();
}
