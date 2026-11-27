import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';
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
  series: ISeriesApi<SeriesType> | null;
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

    // Geometric fallback tests for unregistered shapes
    const pts = d.anchors.map((a) => anchorToCanvas(a));

    // Test anchor handles first (radius <= 12px)
    for (let h = 0; h < pts.length; h++) {
      if (pts[h] && Math.hypot(px - pts[h]!.x, py - pts[h]!.y) <= 12) {
        return { drawingId: d.id, handleIndex: h };
      }
    }

    // Test geometry for selection / whole drawing move
    if (
      (d.type === 'price_range' ||
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
    } else if (pts.length >= 2) {
      for (let seg = 0; seg < pts.length - 1; seg++) {
        const a = pts[seg];
        const b = pts[seg + 1];
        if (a && b && distToSegment(px, py, a.x, a.y, b.x, b.y) <= 8) {
          return { drawingId: d.id, handleIndex: -1 };
        }
      }
    }
  }

  return null;
}
