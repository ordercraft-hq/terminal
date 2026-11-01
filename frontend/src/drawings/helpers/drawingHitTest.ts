import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Candle } from '../../transport/client';
import type { LogicalAnchor, UserDrawing } from '../../store/syncStore';
import { drawingRegistry } from '../registry';

/**
 * Distance from point (px, py) to line segment (x1, y1) -> (x2, y2).
 */
export function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

export interface HitTestOptions {
  drawingsHidden: boolean;
  visibleDrawings: UserDrawing[];
  selectedDrawingId: string | null;
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  candles: Candle[];
  plotSize: { width: number; height: number };
  priceDecimals: number;
  canvas: HTMLCanvasElement | null;
  currentTimezone: string;
  anchorToCanvas: (anchor: LogicalAnchor) => { x: number; y: number } | null;
  canvasToAnchor: (x: number, y: number) => LogicalAnchor | null;
}

/**
 * Hit test drawings at coordinate (px, py).
 * Checks the registered DrawingTool.hitTest first, then falls back to geometric shape tests for legacy drawings.
 */
export function hitTestDrawing(
  px: number,
  py: number,
  options: HitTestOptions
): { drawingId: string; handleIndex: number } | null {
  const {
    drawingsHidden,
    visibleDrawings,
    selectedDrawingId,
    chart,
    series,
    candles,
    plotSize,
    priceDecimals,
    canvas,
    currentTimezone,
    anchorToCanvas,
    canvasToAnchor,
  } = options;

  if (drawingsHidden) return null;

  for (let i = visibleDrawings.length - 1; i >= 0; i--) {
    const d = visibleDrawings[i];
    if (d.hidden) continue;

    // Check registered tool implementation first
    if (drawingRegistry.has(d.type) && chart && series) {
      const tool = drawingRegistry.get(d.type)!;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        const res = tool.hitTest(d, px, py, {
          ctx,
          chart,
          series,
          candles,
          width: plotSize.width,
          height: plotSize.height,
          priceDecimals,
          isSelected: d.id === selectedDrawingId,
          isDraft: false,
          pixelRatio: window.devicePixelRatio || 1,
          anchorToCoordinates: anchorToCanvas,
          canvasToAnchor,
          timezone: currentTimezone,
        });
        if (res && res.hit) {
          return { drawingId: d.id, handleIndex: res.handleIndex };
        }
      }
      continue;
    }

    // Geometric fallback tests for legacy / unregistered shapes
    const pts = d.anchors.map((a) => anchorToCanvas(a));

    if (
      (d.type === 'long_position' || d.type === 'short_position') &&
      pts.length >= 3 &&
      pts[0] &&
      pts[1] &&
      pts[2]
    ) {
      const xLeft = Math.min(pts[0].x, pts[1].x);
      const xRight = Math.max(pts[0].x, pts[1].x);
      const xMid = (xLeft + xRight) / 2;
      const yEntry = pts[0].y;
      const yTarget = pts[1].y;
      const yStop = pts[2].y;

      // 1. Target handle or entire target line: handleIndex 1
      if (
        Math.hypot(px - xMid, py - yTarget) <= 14 ||
        Math.hypot(px - xRight, py - yTarget) <= 14 ||
        (px >= xLeft - 6 && px <= xRight + 6 && Math.abs(py - yTarget) <= 10)
      ) {
        return { drawingId: d.id, handleIndex: 1 };
      }

      // 2. Stop handle or entire stop line: handleIndex 2
      if (
        Math.hypot(px - xMid, py - yStop) <= 14 ||
        Math.hypot(px - xRight, py - yStop) <= 14 ||
        (px >= xLeft - 6 && px <= xRight + 6 && Math.abs(py - yStop) <= 10)
      ) {
        return { drawingId: d.id, handleIndex: 2 };
      }

      // 3. Width handle or right edge: handleIndex 3
      const yMin = Math.min(yTarget, yStop, yEntry);
      const yMax = Math.max(yTarget, yStop, yEntry);
      if (
        Math.hypot(px - xRight, py - yEntry) <= 14 ||
        (Math.abs(px - xRight) <= 8 && py >= yMin - 6 && py <= yMax + 6)
      ) {
        return { drawingId: d.id, handleIndex: 3 };
      }

      // 4. Entry handle or entry line: handleIndex 0
      if (
        Math.hypot(px - xLeft, py - yEntry) <= 14 ||
        Math.hypot(px - xMid, py - yEntry) <= 14 ||
        (px >= xLeft - 6 && px <= xRight + 6 && Math.abs(py - yEntry) <= 8)
      ) {
        return { drawingId: d.id, handleIndex: 0 };
      }

      // 5. Body move: handleIndex -1
      if (px >= xLeft - 6 && px <= xRight + 6 && py >= yMin - 6 && py <= yMax + 6) {
        return { drawingId: d.id, handleIndex: -1 };
      }
      continue;
    }

    // For rectangle, test all 8 handles
    if (d.type === 'rectangle' && pts.length >= 2 && pts[0] && pts[1]) {
      const xMin = Math.min(pts[0].x, pts[1].x);
      const xMax = Math.max(pts[0].x, pts[1].x);
      const yMin = Math.min(pts[0].y, pts[1].y);
      const yMax = Math.max(pts[0].y, pts[1].y);
      const xMid = (xMin + xMax) / 2;
      const yMid = (yMin + yMax) / 2;
      const handles = [
        { x: xMin, y: yMin, idx: 0 },
        { x: xMax, y: yMin, idx: 1 },
        { x: xMax, y: yMax, idx: 2 },
        { x: xMin, y: yMax, idx: 3 },
        { x: xMid, y: yMin, idx: 4 },
        { x: xMax, y: yMid, idx: 5 },
        { x: xMid, y: yMax, idx: 6 },
        { x: xMin, y: yMid, idx: 7 },
      ];
      for (const h of handles) {
        if (Math.hypot(px - h.x, py - h.y) <= 12) {
          return { drawingId: d.id, handleIndex: h.idx };
        }
      }
    }

    // Test anchor handles first (radius <= 12px)
    for (let h = 0; h < pts.length; h++) {
      if (pts[h] && Math.hypot(px - pts[h]!.x, py - pts[h]!.y) <= 12) {
        return { drawingId: d.id, handleIndex: h };
      }
    }

    // Test geometry for selection / whole drawing move
    if (d.type === 'horizontal_line' && pts[0]) {
      if (Math.abs(py - pts[0].y) <= 8) return { drawingId: d.id, handleIndex: -1 };
    } else if (d.type === 'horizontal_ray' && pts[0]) {
      if (px >= pts[0].x - 6 && Math.abs(py - pts[0].y) <= 8) return { drawingId: d.id, handleIndex: -1 };
    } else if (d.type === 'vertical_line' && pts[0]) {
      if (Math.abs(px - pts[0].x) <= 8) return { drawingId: d.id, handleIndex: -1 };
    } else if (d.type === 'cross_line' && pts[0]) {
      if (Math.abs(px - pts[0].x) <= 8 || Math.abs(py - pts[0].y) <= 8) return { drawingId: d.id, handleIndex: -1 };
    } else if (
      (d.type === 'rectangle' ||
        d.type === 'price_range' ||
        d.type === 'date_range' ||
        d.type === 'date_price_range') &&
      pts.length >= 2 &&
      pts[0] &&
      pts[1]
    ) {
      const xMin = Math.min(pts[0].x, pts[1].x);
      const xMax = Math.max(pts[0].x, pts[1].x);
      const yMin = Math.min(pts[0].y, pts[1].y);
      const yMax = Math.max(pts[0].y, pts[1].y);
      if (px >= xMin - 6 && px <= xMax + 6 && py >= yMin - 6 && py <= yMax + 6) {
        return { drawingId: d.id, handleIndex: -1 };
      }
    } else if (d.type === 'circle' && pts.length >= 2 && pts[0] && pts[1]) {
      const r = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const dist = Math.hypot(px - pts[0].x, py - pts[0].y);
      if (Math.abs(dist - r) <= 8 || dist <= r) {
        return { drawingId: d.id, handleIndex: -1 };
      }
    } else if (d.type === 'parallel_channel' && pts.length >= 3 && pts[0] && pts[1] && pts[2]) {
      const x1 = pts[0].x,
        y1 = pts[0].y;
      const x2 = pts[1].x,
        y2 = pts[1].y;
      const dx = x2 - x1,
        dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq > 0) {
        const x3 = pts[2].x,
          y3 = pts[2].y;
        const t = ((x3 - x1) * dx + (y3 - y1) * dy) / lenSq;
        const ox = x3 - (x1 + t * dx);
        const oy = y3 - (y1 + t * dy);
        if (
          distToSegment(px, py, x1, y1, x2, y2) <= 8 ||
          distToSegment(px, py, x1 + ox, y1 + oy, x2 + ox, y2 + oy) <= 8 ||
          distToSegment(px, py, x1 + ox / 2, y1 + oy / 2, x2 + ox / 2, y2 + oy / 2) <= 8
        ) {
          return { drawingId: d.id, handleIndex: -1 };
        }
      }
    } else if ((d.type === 'fib_retracement' || d.type === 'fib_extension') && pts.length >= 2 && pts[0] && pts[1]) {
      const xMin = Math.min(pts[0].x, pts[1].x);
      const xMax = Math.max(pts[0].x, pts[1].x) + 300;
      const validPts = pts.filter(Boolean);
      const yMin = Math.min(...validPts.map((p) => p!.y)) - 50;
      const yMax = Math.max(...validPts.map((p) => p!.y)) + 50;
      if (px >= xMin - 8 && px <= xMax && py >= yMin && py <= yMax) {
        return { drawingId: d.id, handleIndex: -1 };
      }
    } else if (pts.length >= 2 && pts[0] && pts[1]) {
      if (distToSegment(px, py, pts[0].x, pts[0].y, pts[1].x, pts[1].y) <= 8) {
        return { drawingId: d.id, handleIndex: -1 };
      }
    }
  }

  return null;
}
