import { BaseDrawingTool } from '../BaseDrawingTool';
import type {
  DrawingToolType,
  UserDrawing,
  DrawingRenderContext,
  DrawingHandle,
  HitTestResult,
  PathOptions,
} from '../types';

export class PathTool extends BaseDrawingTool<PathOptions> {
  readonly id: DrawingToolType = 'path';
  readonly name: string = 'Path';
  readonly minAnchors: number = 2;
  readonly maxAnchors: number = 999;

  getDefaultOptions(): PathOptions {
    return {
      leftEnd: 'circle',
      rightEnd: 'arrow',
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

  getHandles(drawing: UserDrawing, ctx: DrawingRenderContext): DrawingHandle[] {
    const handles: DrawingHandle[] = [];
    if (!drawing.anchors || drawing.anchors.length === 0) return handles;

    drawing.anchors.forEach((anchor, i) => {
      const pt = ctx.anchorToCoordinates(anchor);
      if (pt && !isNaN(pt.x) && !isNaN(pt.y)) {
        handles.push({
          x: pt.x,
          y: pt.y,
          index: i,
          type: 'vertex',
          cursor: 'move',
        });
      }
    });

    return handles;
  }

  render(renderCtx: DrawingRenderContext, drawing: UserDrawing): void {
    const c2d = renderCtx.ctx;
    if (!drawing.anchors || drawing.anchors.length === 0) return;

    const pts = drawing.anchors
      .map((a) => renderCtx.anchorToCoordinates(a))
      .filter((p): p is { x: number; y: number } => p !== null && !isNaN(p.x) && !isNaN(p.y));

    if (pts.length === 0) return;

    const color = drawing.color || '#2962ff';
    const lineWidth = drawing.lineWidth || 1;
    const opts = (drawing.options as PathOptions) || {};
    const leftEnd = opts.leftEnd ?? 'circle';
    const rightEnd = opts.rightEnd ?? 'arrow';

    c2d.save();

    // 1. Single-point drafting preview
    if (pts.length === 1) {
      if (renderCtx.isDraft || renderCtx.isSelected) {
        BaseDrawingTool.drawAnchorHandle(c2d, pts[0].x, pts[0].y, renderCtx.isSelected, 5, color);
      }
      c2d.restore();
      return;
    }

    // 2. Draw Polyline Segments
    c2d.beginPath();
    c2d.strokeStyle = color;
    c2d.lineWidth = lineWidth;
    c2d.lineJoin = 'round';
    c2d.lineCap = 'round';

    if (drawing.lineStyle === 'dashed') {
      c2d.setLineDash([6, 6]);
    } else if (drawing.lineStyle === 'dotted') {
      c2d.setLineDash([2, 2]);
    } else {
      c2d.setLineDash([]);
    }

    c2d.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      c2d.lineTo(pts[i].x, pts[i].y);
    }
    c2d.stroke();

    // 3. Render End Caps (when not in dashed/dotted or when desired)
    // Left End Cap (Point 0)
    if (leftEnd === 'arrow') {
      BaseDrawingTool.drawArrowHead(
        c2d,
        pts[1].x,
        pts[1].y,
        pts[0].x,
        pts[0].y,
        Math.max(11, 8 + lineWidth * 2),
        color
      );
    } else if (leftEnd === 'circle') {
      BaseDrawingTool.drawCircleCap(
        c2d,
        pts[0].x,
        pts[0].y,
        Math.max(3.5, 2.5 + lineWidth),
        color
      );
    }

    // Right End Cap (Point N - 1)
    if (rightEnd === 'arrow') {
      BaseDrawingTool.drawArrowHead(
        c2d,
        pts[pts.length - 2].x,
        pts[pts.length - 2].y,
        pts[pts.length - 1].x,
        pts[pts.length - 1].y,
        Math.max(11, 8 + lineWidth * 2),
        color
      );
    } else if (rightEnd === 'circle') {
      BaseDrawingTool.drawCircleCap(
        c2d,
        pts[pts.length - 1].x,
        pts[pts.length - 1].y,
        Math.max(3.5, 2.5 + lineWidth),
        color
      );
    }

    // 4. Render Anchor Handles when selected or drafting
    if (renderCtx.isSelected || renderCtx.isDraft) {
      for (let i = 0; i < pts.length; i++) {
        BaseDrawingTool.drawAnchorHandle(c2d, pts[i].x, pts[i].y, renderCtx.isSelected, 5, color);
      }
    }

    c2d.restore();
  }

  hitTest(
    drawing: UserDrawing,
    px: number,
    py: number,
    ctx: DrawingRenderContext
  ): HitTestResult | null {
    if (!drawing.anchors || drawing.anchors.length === 0) return null;

    const pts = drawing.anchors
      .map((a) => ctx.anchorToCoordinates(a))
      .filter((p): p is { x: number; y: number } => p !== null && !isNaN(p.x) && !isNaN(p.y));

    if (pts.length === 0) return null;

    // 1. Check Vertex Handles (8px radius)
    for (let i = 0; i < pts.length; i++) {
      if (BaseDrawingTool.dist(px, py, pts[i].x, pts[i].y) <= 8) {
        return { hit: true, handleIndex: i, cursor: 'move' };
      }
    }

    // 2. Check Line Segments
    const hitTolerance = Math.max(6, (drawing.lineWidth || 1) + 4);
    for (let i = 0; i < pts.length - 1; i++) {
      const d = BaseDrawingTool.distToSegment(
        px,
        py,
        pts[i].x,
        pts[i].y,
        pts[i + 1].x,
        pts[i + 1].y
      );
      if (d <= hitTolerance) {
        return { hit: true, handleIndex: -1, cursor: 'grab' };
      }
    }

    return null;
  }
}
