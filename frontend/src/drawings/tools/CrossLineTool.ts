import { BaseDrawingTool } from '../BaseDrawingTool';
import type {
  DrawingToolType,
  UserDrawing,
  DrawingRenderContext,
  DrawingHandle,
  HitTestResult,
  TrendlineOptions,
} from '../types';

export class CrossLineTool extends BaseDrawingTool<TrendlineOptions> {
  readonly id: DrawingToolType = 'cross_line';
  readonly name: string = 'Crossline';
  readonly minAnchors: number = 1;
  readonly maxAnchors: number = 1;

  getDefaultOptions(): TrendlineOptions {
    return {
      showPriceLabels: true,
      showTimeLabel: true,
      extend: true,
      extendLeft: false,
      extendRight: false,
      leftEnd: 'normal',
      rightEnd: 'normal',
      showMiddlePoint: false,
      stats: 'hidden',
      statsPosition: 'center',
      alwaysShowStats: false,
      showText: false,
      text: '',
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

  private getPoint(drawing: UserDrawing, ctx: DrawingRenderContext): { x: number; y: number } | null {
    if (!drawing.anchors || drawing.anchors.length < 1) return null;
    const a = drawing.anchors[0];

    let p0 = ctx.anchorToCoordinates(a);
    let x = p0 ? p0.x : null;
    let y = p0 ? p0.y : null;

    if (x === null) {
      const coordX = ctx.chart.timeScale().timeToCoordinate(a.time as any);
      if (coordX !== null && !isNaN(coordX)) x = coordX;
    }

    if (y === null) {
      const coordY = ctx.series.priceToCoordinate(a.price);
      if (coordY !== null && !isNaN(coordY)) y = coordY;
    }

    if (x === null || y === null || isNaN(x) || isNaN(y)) return null;
    return { x, y };
  }

  getHandles(drawing: UserDrawing, ctx: DrawingRenderContext): DrawingHandle[] {
    const handles: DrawingHandle[] = [];
    const pt = this.getPoint(drawing, ctx);
    if (!pt) return handles;

    handles.push({
      x: pt.x,
      y: pt.y,
      index: 0,
      type: 'vertex',
      cursor: 'move',
    });

    return handles;
  }

  render(ctx: DrawingRenderContext, drawing: UserDrawing): void {
    if (!drawing.anchors || drawing.anchors.length < 1) return;

    const pt = this.getPoint(drawing, ctx);
    if (!pt) return;

    const { x, y } = pt;
    const c2d = ctx.ctx;
    const color = drawing.color || '#2962ff';
    const lineWidth = drawing.lineWidth || 1;
    const lineStyle = drawing.lineStyle || 'solid';

    c2d.save();

    // 1. Line dash styling
    if (lineStyle === 'dashed') {
      c2d.setLineDash([6, 6]);
    } else if (lineStyle === 'dotted') {
      c2d.setLineDash([2, 4]);
    } else {
      c2d.setLineDash([]);
    }

    c2d.strokeStyle = color;
    c2d.lineWidth = lineWidth;

    // 2. Draw cross lines: Horizontal & Vertical intersecting at (x, y)
    c2d.beginPath();
    // Horizontal line from 0 to width
    c2d.moveTo(0, y);
    c2d.lineTo(ctx.width, y);
    // Vertical line from 0 to height
    c2d.moveTo(x, 0);
    c2d.lineTo(x, ctx.height);
    c2d.stroke();

    // 3. Render Anchor Handle at intersection when selected or drafting
    if (ctx.isSelected || ctx.isDraft) {
      BaseDrawingTool.drawAnchorHandle(c2d, x, y, ctx.isSelected, 5, color);
    }

    c2d.restore();
  }

  /**
   * Renders the pro time scale badge directly on the time scale (unclipped pass).
   */
  renderTimeLabel(ctx: DrawingRenderContext, drawing: UserDrawing): void {
    const opts: TrendlineOptions = (drawing.options as TrendlineOptions) || {};
    if (opts.showTimeLabel === false) return;
    if (!drawing.anchors || drawing.anchors.length < 1) return;

    const pt = this.getPoint(drawing, ctx);
    if (!pt) return;

    const text = BaseDrawingTool.formatTimeScaleLabel(drawing.anchors[0].time, ctx.timezone || 'UTC');
    BaseDrawingTool.drawTimeScaleBadge(ctx.ctx, text, pt.x, ctx.height + 13);
  }

  hitTest(
    drawing: UserDrawing,
    px: number,
    py: number,
    ctx: DrawingRenderContext
  ): HitTestResult | null {
    if (!drawing.anchors || drawing.anchors.length < 1) return null;

    const pt = this.getPoint(drawing, ctx);
    if (!pt) return null;

    const { x, y } = pt;

    // 1. Check Vertex Handle at intersection (8px radius)
    if (BaseDrawingTool.dist(px, py, x, y) <= 8) {
      return { hit: true, handleIndex: 0, cursor: 'move' };
    }

    // 2. Check Line Hit along the cross lines
    const threshold = Math.max(6, (drawing.lineWidth || 1) + 4);
    if (Math.abs(py - y) <= threshold || Math.abs(px - x) <= threshold) {
      return { hit: true, handleIndex: -1, cursor: 'move' };
    }

    // 3. Check Time Label Pill on timescale
    const opts: TrendlineOptions = (drawing.options as TrendlineOptions) || {};
    if (opts.showTimeLabel !== false) {
      if (Math.abs(px - x) <= 55 && py >= ctx.height - 4 && py <= ctx.height + 26) {
        return { hit: true, handleIndex: -1, cursor: 'move' };
      }
    }

    return null;
  }
}
