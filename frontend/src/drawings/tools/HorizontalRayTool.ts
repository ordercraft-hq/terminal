import { BaseDrawingTool } from '../BaseDrawingTool';
import type {
  DrawingToolType,
  UserDrawing,
  DrawingRenderContext,
  DrawingHandle,
  HitTestResult,
  TrendlineOptions,
} from '../types';

export class HorizontalRayTool extends BaseDrawingTool<TrendlineOptions> {
  readonly id: DrawingToolType = 'horizontal_ray';
  readonly name: string = 'Horizontal Ray';
  readonly minAnchors: number = 1;
  readonly maxAnchors: number = 1;

  getDefaultOptions(): TrendlineOptions {
    return {
      extendLeft: false,
      extendRight: true,
      leftEnd: 'normal',
      rightEnd: 'normal',
      showMiddlePoint: false,
      showPriceLabels: false,
      stats: 'hidden',
      statsPosition: 'center',
      alwaysShowStats: false,
      showText: false,
      text: '',
      textColor: '#d1d4dc',
      textSize: 12,
      textAlignment: 'center',
      textVerticalAlignment: 'top',
      textBold: false,
      textItalic: false,
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
    if (!drawing.anchors || drawing.anchors.length < 1) return handles;

    const p0 = ctx.anchorToCoordinates(drawing.anchors[0]);
    if (!p0) return handles;

    handles.push({
      x: p0.x,
      y: p0.y,
      index: 0,
      type: 'vertex',
      cursor: 'move',
    });

    return handles;
  }

  render(ctx: DrawingRenderContext, drawing: UserDrawing): void {
    if (!drawing.anchors || drawing.anchors.length < 1) return;

    const c2d = ctx.ctx;
    const p0 = ctx.anchorToCoordinates(drawing.anchors[0]);
    if (!p0) return;

    const y = p0.y;
    const x = p0.x;
    const opts: TrendlineOptions = (drawing.options as TrendlineOptions) || {};
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

    // 2. Draw horizontal ray from p0.x to the right
    const rayEnd = Math.max(x, ctx.width);
    c2d.beginPath();
    c2d.moveTo(x, y);
    c2d.lineTo(rayEnd, y);
    c2d.stroke();

    // 3. Render Text Note (if enabled)
    const textVal = opts.text || drawing.text;
    if (opts.showText !== false && textVal && textVal.trim().length > 0) {
      c2d.save();
      const fontSize = opts.textSize || 12;
      const fontBold = opts.textBold ? 'bold ' : '';
      const fontItalic = opts.textItalic ? 'italic ' : '';
      c2d.font = `${fontItalic}${fontBold}${fontSize}px "Inter", -apple-system, sans-serif`;

      // The ray visible/active span starts at max(0, x) and ends at ctx.width
      const visibleStart = Math.max(0, x);
      const visibleEnd = Math.max(visibleStart, ctx.width);
      const span = visibleEnd - visibleStart;

      let cx = visibleStart + span / 2;
      let textAlign: CanvasTextAlign = 'center';
      const margin = 24;

      if (opts.textAlignment === 'left') {
        cx = visibleStart + margin;
        textAlign = 'left';
      } else if (opts.textAlignment === 'right') {
        cx = visibleEnd - margin;
        textAlign = 'right';
      }

      let localY = y - (fontSize / 2 + 5 + lineWidth / 2);
      if (opts.textVerticalAlignment === 'bottom') {
        localY = y + (fontSize / 2 + 5 + lineWidth / 2);
      } else if (opts.textVerticalAlignment === 'middle') {
        localY = y;
      }

      c2d.textAlign = textAlign;
      c2d.textBaseline = 'middle';

      // Clear line behind text for middle alignment
      if (opts.textVerticalAlignment === 'middle') {
        const tm = c2d.measureText(textVal);
        let bgX = cx - tm.width / 2 - 4;
        if (textAlign === 'left') bgX = cx - 4;
        if (textAlign === 'right') bgX = cx - tm.width - 4;
        c2d.fillStyle = '#131722';
        c2d.fillRect(bgX, y - fontSize / 2 - 2, tm.width + 8, fontSize + 4);
      }

      c2d.fillStyle = opts.textColor || color;
      c2d.fillText(textVal, cx, localY);
      c2d.restore();
    }

    // 4. Render Anchor Handle when selected or drafting
    if (ctx.isSelected || ctx.isDraft) {
      BaseDrawingTool.drawAnchorHandle(c2d, x, y, ctx.isSelected, 5, color);
    }

    c2d.restore();
  }

  hitTest(
    drawing: UserDrawing,
    px: number,
    py: number,
    ctx: DrawingRenderContext
  ): HitTestResult | null {
    if (!drawing.anchors || drawing.anchors.length < 1) return null;

    const p0 = ctx.anchorToCoordinates(drawing.anchors[0]);
    if (!p0) return null;

    const y = p0.y;
    const x = p0.x;

    // 1. Check Vertex Handle (8px radius)
    if (BaseDrawingTool.dist(px, py, x, y) <= 8) {
      return { hit: true, handleIndex: 0, cursor: 'move' };
    }

    // 2. Check Line Hit along the ray from x to the right
    const threshold = Math.max(6, (drawing.lineWidth || 1) + 4);
    if (px >= x - 6 && Math.abs(py - y) <= threshold) {
      return { hit: true, handleIndex: -1, cursor: 'ns-resize' };
    }

    // 3. Check Text Annotation Bounds (if text exists and is visible)
    const opts: TrendlineOptions = (drawing.options as TrendlineOptions) || {};
    const textVal = opts.text || drawing.text;
    if (opts.showText !== false && textVal && textVal.trim().length > 0) {
      const fontSize = opts.textSize || 12;
      const visibleStart = Math.max(0, x);
      const visibleEnd = Math.max(visibleStart, ctx.width);
      const span = visibleEnd - visibleStart;

      let cx = visibleStart + span / 2;
      let textAlign: CanvasTextAlign = 'center';
      const margin = 24;

      if (opts.textAlignment === 'left') {
        cx = visibleStart + margin;
        textAlign = 'left';
      } else if (opts.textAlignment === 'right') {
        cx = visibleEnd - margin;
        textAlign = 'right';
      }

      let localY = y - (fontSize / 2 + 5 + (drawing.lineWidth || 1) / 2);
      if (opts.textVerticalAlignment === 'bottom') {
        localY = y + (fontSize / 2 + 5 + (drawing.lineWidth || 1) / 2);
      } else if (opts.textVerticalAlignment === 'middle') {
        localY = y;
      }

      const approxWidth = textVal.length * (fontSize * 0.65);
      let left = cx - approxWidth / 2;
      if (textAlign === 'left') left = cx;
      if (textAlign === 'right') left = cx - approxWidth;

      if (
        px >= left - 6 &&
        px <= left + approxWidth + 6 &&
        py >= localY - fontSize / 2 - 4 &&
        py <= localY + fontSize / 2 + 4
      ) {
        return { hit: true, handleIndex: -1, cursor: 'move' };
      }
    }

    return null;
  }
}
