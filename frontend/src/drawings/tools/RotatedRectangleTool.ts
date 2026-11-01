import { BaseDrawingTool } from '../BaseDrawingTool';
import type {
  DrawingToolType,
  UserDrawing,
  DrawingRenderContext,
  DrawingHandle,
  HitTestResult,
  LogicalAnchor,
} from '../types';

export interface RotatedRectangleOptions {
  border?: boolean;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  showBackground?: boolean;
  backgroundColor?: string;
  visibility?: {
    seconds?: boolean;
    minutes?: boolean;
    hours?: boolean;
    days?: boolean;
    weeks?: boolean;
    months?: boolean;
  };
  [key: string]: any;
}

export class RotatedRectangleTool extends BaseDrawingTool<RotatedRectangleOptions> {
  readonly id: DrawingToolType = 'rotated_rectangle';
  readonly name: string = 'Rotated rectangle';
  readonly minAnchors: number = 2;
  readonly maxAnchors: number = 3;

  createDefaultDrawing(
    id: string,
    anchors: LogicalAnchor[],
    symbol?: string,
    paneId?: string,
    defaultColor: string = '#089981'
  ): UserDrawing {
    return {
      id,
      type: this.id,
      anchors,
      color: defaultColor,
      lineWidth: 2,
      lineStyle: 'solid',
      symbol,
      paneId,
      options: this.getDefaultOptions() as Record<string, any>,
    };
  }

  getDefaultOptions(): RotatedRectangleOptions {
    return {
      border: true,
      borderColor: '#089981',
      borderWidth: 2,
      borderStyle: 'solid',
      showBackground: true,
      backgroundColor: 'rgba(8, 153, 129, 0.2)',
      visibility: {
        seconds: true,
        minutes: true,
        hours: true,
        days: true,
        weeks: true,
        months: true,
      },
    };
  }

  /**
   * Computes the 4 corners (C1, C4, C3, C2) and 2 midpoints (M1, M2)
   */
  public getGeometry(
    drawing: UserDrawing,
    ctx: DrawingRenderContext
  ): {
    p1: { x: number; y: number };
    p2: { x: number; y: number };
    c1: { x: number; y: number };
    c2: { x: number; y: number };
    c3: { x: number; y: number };
    c4: { x: number; y: number };
    m1: { x: number; y: number };
    m2: { x: number; y: number };
    halfWidth: number;
    hasWidth: boolean;
  } | null {
    if (!drawing.anchors || drawing.anchors.length < 2) return null;

    const p1 = ctx.anchorToCoordinates(drawing.anchors[0]);
    const p2 = ctx.anchorToCoordinates(drawing.anchors[1]);
    if (!p1 || !p2 || isNaN(p1.x) || isNaN(p1.y) || isNaN(p2.x) || isNaN(p2.y)) return null;

    const vx = p2.x - p1.x;
    const vy = p2.y - p1.y;
    const len = Math.hypot(vx, vy);

    // If points are coincident, cannot determine perpendicular vector
    if (len < 0.5) {
      return {
        p1,
        p2,
        c1: p1,
        c2: p1,
        c3: p2,
        c4: p2,
        m1: p1,
        m2: p2,
        halfWidth: 0,
        hasWidth: false,
      };
    }

    // Unit perpendicular vector (rotated 90 deg counterclockwise)
    const nx = -vy / len;
    const ny = vx / len;

    let halfWidth = 0;
    let hasWidth = false;

    if (drawing.anchors.length >= 3 && drawing.anchors[2]) {
      const p3 = ctx.anchorToCoordinates(drawing.anchors[2]);
      if (p3 && !isNaN(p3.x) && !isNaN(p3.y)) {
        // Project (p3 - p1) onto perpendicular unit vector
        const wx = p3.x - p1.x;
        const wy = p3.y - p1.y;
        const perpDist = wx * nx + wy * ny;
        halfWidth = Math.abs(perpDist);
        hasWidth = true;
      }
    }

    // When 3rd point is not yet placed or has 0 width during drafting
    if (!hasWidth) {
      return {
        p1,
        p2,
        c1: p1,
        c2: p1,
        c3: p2,
        c4: p2,
        m1: p1,
        m2: p2,
        halfWidth: 0,
        hasWidth: false,
      };
    }

    // 4 Corners:
    // C1: p1 + halfWidth * n
    // C2: p1 - halfWidth * n
    // C3: p2 - halfWidth * n
    // C4: p2 + halfWidth * n
    const c1 = { x: p1.x + halfWidth * nx, y: p1.y + halfWidth * ny };
    const c2 = { x: p1.x - halfWidth * nx, y: p1.y - halfWidth * ny };
    const c3 = { x: p2.x - halfWidth * nx, y: p2.y - halfWidth * ny };
    const c4 = { x: p2.x + halfWidth * nx, y: p2.y + halfWidth * ny };

    // 2 Midpoints on short edges:
    const m1 = p1;
    const m2 = p2;

    return {
      p1,
      p2,
      c1,
      c2,
      c3,
      c4,
      m1,
      m2,
      halfWidth,
      hasWidth: true,
    };
  }

  render(ctx: DrawingRenderContext, drawing: UserDrawing): void {
    const geo = this.getGeometry(drawing, ctx);
    if (!geo) return;

    const c2d = ctx.ctx;
    const opts = (drawing.options as RotatedRectangleOptions) || {};
    const color = drawing.color || opts.borderColor || '#089981';
    const lineWidth = drawing.lineWidth || opts.borderWidth || 2;
    const lineStyle = drawing.lineStyle || opts.borderStyle || 'solid';

    c2d.save();

    // 1. If only baseline exists (drafting step 1->2)
    if (!geo.hasWidth || geo.halfWidth < 1) {
      c2d.strokeStyle = color;
      c2d.lineWidth = lineWidth;
      c2d.beginPath();
      c2d.moveTo(geo.p1.x, geo.p1.y);
      c2d.lineTo(geo.p2.x, geo.p2.y);
      c2d.stroke();

      // Draw handles on baseline ends
      if (ctx.isSelected || ctx.isDraft) {
        [geo.p1, geo.p2].forEach((pt) => {
          c2d.save();
          c2d.fillStyle = '#1e222d';
          c2d.strokeStyle = '#2962ff';
          c2d.lineWidth = 2;
          c2d.beginPath();
          c2d.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
          c2d.fill();
          c2d.stroke();
          c2d.restore();
        });
      }
      c2d.restore();
      return;
    }

    const { c1, c2, c3, c4, m1, m2 } = geo;

    // 2. Background Fill
    if (opts.showBackground !== false) {
      c2d.fillStyle = opts.backgroundColor || 'rgba(8, 153, 129, 0.2)';
      c2d.beginPath();
      c2d.moveTo(c1.x, c1.y);
      c2d.lineTo(c4.x, c4.y);
      c2d.lineTo(c3.x, c3.y);
      c2d.lineTo(c2.x, c2.y);
      c2d.closePath();
      c2d.fill();
    }

    // 3. Border Stroke
    if (opts.border !== false) {
      c2d.strokeStyle = color;
      c2d.lineWidth = lineWidth;

      if (lineStyle === 'dashed') {
        c2d.setLineDash([6, 6]);
      } else if (lineStyle === 'dotted') {
        c2d.setLineDash([2, 4]);
      } else {
        c2d.setLineDash([]);
      }

      c2d.beginPath();
      c2d.moveTo(c1.x, c1.y);
      c2d.lineTo(c4.x, c4.y);
      c2d.lineTo(c3.x, c3.y);
      c2d.lineTo(c2.x, c2.y);
      c2d.closePath();
      c2d.stroke();
    }

    // 4. Handles (6 circle handles when selected or drafting)
    if (ctx.isSelected || ctx.isDraft) {
      // 6 handles:
      // m1 (midpoint of short edge 1), m2 (midpoint of short edge 2),
      // c1, c2 (corners of short edge 1), c4, c3 (corners of short edge 2)
      const handles = [m1, m2, c1, c2, c4, c3];

      handles.forEach((h) => {
        c2d.save();
        c2d.fillStyle = '#1e222d';
        c2d.strokeStyle = '#2962ff';
        c2d.lineWidth = 2;
        c2d.beginPath();
        c2d.arc(h.x, h.y, 4.5, 0, Math.PI * 2);
        c2d.fill();
        c2d.stroke();
        c2d.restore();
      });
    }

    c2d.restore();
  }

  hitTest(
    drawing: UserDrawing,
    px: number,
    py: number,
    ctx: DrawingRenderContext
  ): HitTestResult | null {
    const geo = this.getGeometry(drawing, ctx);
    if (!geo) return null;

    // Baseline-only hit testing
    if (!geo.hasWidth || geo.halfWidth < 1) {
      if (Math.hypot(px - geo.p1.x, py - geo.p1.y) <= 10) return { hit: true, handleIndex: 0, cursor: 'move' };
      if (Math.hypot(px - geo.p2.x, py - geo.p2.y) <= 10) return { hit: true, handleIndex: 1, cursor: 'move' };
      if (BaseDrawingTool.distToSegment(px, py, geo.p1.x, geo.p1.y, geo.p2.x, geo.p2.y) <= 7) {
        return { hit: true, handleIndex: -1, cursor: 'move' };
      }
      return null;
    }

    const { c1, c2, c3, c4, m1, m2 } = geo;

    // 1. Test 6 circle handles
    // 0: m1, 1: m2, 2: c1, 3: c2, 4: c4, 5: c3
    const handles = [
      { pt: m1, idx: 0, cursor: 'move' },
      { pt: m2, idx: 1, cursor: 'move' },
      { pt: c1, idx: 2, cursor: 'nwse-resize' },
      { pt: c2, idx: 3, cursor: 'nesw-resize' },
      { pt: c4, idx: 4, cursor: 'nesw-resize' },
      { pt: c3, idx: 5, cursor: 'nwse-resize' },
    ];

    for (const h of handles) {
      if (Math.hypot(px - h.pt.x, py - h.pt.y) <= 10) {
        return { hit: true, handleIndex: h.idx, cursor: h.cursor };
      }
    }

    // 2. Test 4 perimeter boundary segments
    const tolerance = 7;
    if (
      BaseDrawingTool.distToSegment(px, py, c1.x, c1.y, c4.x, c4.y) <= tolerance ||
      BaseDrawingTool.distToSegment(px, py, c4.x, c4.y, c3.x, c3.y) <= tolerance ||
      BaseDrawingTool.distToSegment(px, py, c3.x, c3.y, c2.x, c2.y) <= tolerance ||
      BaseDrawingTool.distToSegment(px, py, c2.x, c2.y, c1.x, c1.y) <= tolerance
    ) {
      return { hit: true, handleIndex: -1, cursor: 'move' };
    }

    // 3. Test inside polygon
    const poly = [c1, c4, c3, c2];
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }

    if (inside) {
      return { hit: true, handleIndex: -1, cursor: 'move' };
    }

    return null;
  }

  getHandles(drawing: UserDrawing, ctx: DrawingRenderContext): DrawingHandle[] {
    const geo = this.getGeometry(drawing, ctx);
    if (!geo) return [];

    if (!geo.hasWidth || geo.halfWidth < 1) {
      return [
        { x: geo.p1.x, y: geo.p1.y, index: 0, cursor: 'move' },
        { x: geo.p2.x, y: geo.p2.y, index: 1, cursor: 'move' },
      ];
    }

    const { c1, c2, c3, c4, m1, m2 } = geo;
    return [
      { x: m1.x, y: m1.y, index: 0, cursor: 'move' },
      { x: m2.x, y: m2.y, index: 1, cursor: 'move' },
      { x: c1.x, y: c1.y, index: 2, cursor: 'nwse-resize' },
      { x: c2.x, y: c2.y, index: 3, cursor: 'nesw-resize' },
      { x: c4.x, y: c4.y, index: 4, cursor: 'nesw-resize' },
      { x: c3.x, y: c3.y, index: 5, cursor: 'nwse-resize' },
    ];
  }
}
