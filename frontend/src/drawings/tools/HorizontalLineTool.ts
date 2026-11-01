import { BaseDrawingTool } from '../BaseDrawingTool';
import type {
  DrawingToolType,
  UserDrawing,
  DrawingRenderContext,
  DrawingHandle,
  HitTestResult,
  TrendlineOptions,
} from '../types';

export class HorizontalLineTool extends BaseDrawingTool<TrendlineOptions> {
  readonly id: DrawingToolType = 'horizontal_line';
  readonly name: string = 'Horizontal Line';
  readonly minAnchors: number = 1;
  readonly maxAnchors: number = 1;

  getDefaultOptions(): TrendlineOptions {
    return {
      extendLeft: false,
      extendRight: false,
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

    let handleX = p0.x;
    if (handleX < 20 || handleX > ctx.width - 20) {
      handleX = ctx.width / 2;
    }

    handles.push({
      x: handleX,
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

    // 2. Draw horizontal line from edge to edge
    c2d.beginPath();
    c2d.moveTo(0, y);
    c2d.lineTo(ctx.width, y);
    c2d.stroke();

    // 3. Render Text Note (if enabled)
    const textVal = opts.text || drawing.text;
    if (opts.showText !== false && textVal && textVal.trim().length > 0) {
      c2d.save();
      const fontSize = opts.textSize || 12;
      const fontBold = opts.textBold ? 'bold ' : '';
      const fontItalic = opts.textItalic ? 'italic ' : '';
      c2d.font = `${fontItalic}${fontBold}${fontSize}px "Inter", -apple-system, sans-serif`;

      let cx = ctx.width / 2;
      let textAlign: CanvasTextAlign = 'center';
      const margin = 24;

      if (opts.textAlignment === 'left') {
        cx = margin;
        textAlign = 'left';
      } else if (opts.textAlignment === 'right') {
        cx = ctx.width - margin;
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
      let handleX = p0.x;
      if (handleX < 20 || handleX > ctx.width - 20) {
        handleX = ctx.width / 2;
      }
      BaseDrawingTool.drawAnchorHandle(c2d, handleX, y, ctx.isSelected, 5, color);
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

    // 1. Check Vertex Handle (8px radius)
    let handleX = p0.x;
    if (handleX < 20 || handleX > ctx.width - 20) {
      handleX = ctx.width / 2;
    }
    if (BaseDrawingTool.dist(px, py, handleX, y) <= 8) {
      return { hit: true, handleIndex: 0, cursor: 'move' };
    }

    // 2. Check Line Hit across entire horizontal span
    const threshold = Math.max(6, (drawing.lineWidth || 1) + 4);
    if (Math.abs(py - y) <= threshold) {
      return { hit: true, handleIndex: -1, cursor: 'ns-resize' };
    }

    return null;
  }
}
