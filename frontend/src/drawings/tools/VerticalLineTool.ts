import { BaseDrawingTool } from '../BaseDrawingTool';
import type {
  DrawingToolType,
  UserDrawing,
  DrawingRenderContext,
  DrawingHandle,
  HitTestResult,
  TrendlineOptions,
} from '../types';

export class VerticalLineTool extends BaseDrawingTool<TrendlineOptions> {
  readonly id: DrawingToolType = 'vertical_line';
  readonly name: string = 'Vertical Line';
  readonly minAnchors: number = 1;
  readonly maxAnchors: number = 1;

  getDefaultOptions(): TrendlineOptions {
    return {
      extend: true,
      showTimeLabel: true,
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
      textOrientation: 'vertical',
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

  private getXCoord(drawing: UserDrawing, ctx: DrawingRenderContext): number | null {
    if (!drawing.anchors || drawing.anchors.length < 1) return null;
    const p0 = ctx.anchorToCoordinates(drawing.anchors[0]);
    if (p0 && !isNaN(p0.x)) return p0.x;

    const coord = ctx.chart.timeScale().timeToCoordinate(drawing.anchors[0].time as any);
    if (coord !== null && !isNaN(coord)) return coord;

    return null;
  }

  getHandles(drawing: UserDrawing, ctx: DrawingRenderContext): DrawingHandle[] {
    const handles: DrawingHandle[] = [];
    const x = this.getXCoord(drawing, ctx);
    if (x === null) return handles;

    handles.push({
      x,
      y: ctx.height / 2,
      index: 0,
      type: 'vertex',
      cursor: 'ew-resize',
    });

    return handles;
  }

  render(ctx: DrawingRenderContext, drawing: UserDrawing): void {
    if (!drawing.anchors || drawing.anchors.length < 1) return;

    const x = this.getXCoord(drawing, ctx);
    if (x === null) return;

    const c2d = ctx.ctx;
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

    // 2. Draw vertical line from top (0) to bottom (height)
    c2d.beginPath();
    c2d.moveTo(x, 0);
    c2d.lineTo(x, ctx.height);
    c2d.stroke();

    // 3. Render Text Note (Vertical along the line by default)
    const textVal = opts.text || drawing.text;
    if (opts.showText !== false && textVal && textVal.trim().length > 0) {
      c2d.save();
      const fontSize = opts.textSize || 12;
      const fontBold = opts.textBold ? 'bold ' : '';
      const fontItalic = opts.textItalic ? 'italic ' : '';
      c2d.font = `${fontItalic}${fontBold}${fontSize}px "Inter", -apple-system, sans-serif`;

      const tm = c2d.measureText(textVal);
      const textLen = tm.width;
      const orientation = opts.textOrientation || 'vertical';

      // Compute vertical center along the line
      let cy = ctx.height / 2;
      if (opts.textVerticalAlignment === 'top') {
        cy = Math.min(ctx.height / 2, orientation === 'vertical' ? textLen / 2 + 24 : 30);
      } else if (opts.textVerticalAlignment === 'bottom') {
        const bottomMargin = opts.showTimeLabel !== false ? 45 : 25;
        cy = Math.max(
          ctx.height / 2,
          orientation === 'vertical'
            ? ctx.height - bottomMargin - textLen / 2
            : ctx.height - bottomMargin
        );
      }

      if (orientation === 'vertical') {
        // Vertical text along the line (rotated -90 degrees, reading bottom to top)
        c2d.translate(x, cy);
        c2d.rotate(-Math.PI / 2);

        let localY = 0;
        const sideOffset = fontSize / 2 + 5 + lineWidth / 2;

        if (opts.textAlignment === 'left') {
          localY = -sideOffset;
        } else if (opts.textAlignment === 'right') {
          localY = sideOffset;
        } else {
          localY = 0;
          // Clear background line behind text
          c2d.fillStyle = '#131722';
          c2d.fillRect(-textLen / 2 - 4, -fontSize / 2 - 2, textLen + 8, fontSize + 4);
        }

        c2d.textAlign = 'center';
        c2d.textBaseline = 'middle';
        c2d.fillStyle = opts.textColor || color;
        c2d.fillText(textVal, 0, localY);
      } else {
        // Horizontal text centered/aligned at (x, cy)
        let cx = x;
        let textAlign: CanvasTextAlign = 'center';
        const sideMargin = 10;

        if (opts.textAlignment === 'left') {
          cx = x - sideMargin;
          textAlign = 'right';
        } else if (opts.textAlignment === 'right') {
          cx = x + sideMargin;
          textAlign = 'left';
        } else {
          cx = x;
          textAlign = 'center';
          c2d.fillStyle = '#131722';
          c2d.fillRect(cx - textLen / 2 - 4, cy - fontSize / 2 - 2, textLen + 8, fontSize + 4);
        }

        c2d.textAlign = textAlign;
        c2d.textBaseline = 'middle';
        c2d.fillStyle = opts.textColor || color;
        c2d.fillText(textVal, cx, cy);
      }

      c2d.restore();
    }

    // 4. Render Anchor Handle when selected or drafting
    if (ctx.isSelected || ctx.isDraft) {
      BaseDrawingTool.drawAnchorHandle(c2d, x, ctx.height / 2, ctx.isSelected, 5, color);
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

    const x = this.getXCoord(drawing, ctx);
    if (x === null || isNaN(x)) return;

    const text = BaseDrawingTool.formatTimeScaleLabel(drawing.anchors[0].time, ctx.timezone || 'UTC');
    BaseDrawingTool.drawTimeScaleBadge(ctx.ctx, text, x, ctx.height + 13);
  }

  hitTest(
    drawing: UserDrawing,
    px: number,
    py: number,
    ctx: DrawingRenderContext
  ): HitTestResult | null {
    if (!drawing.anchors || drawing.anchors.length < 1) return null;

    const x = this.getXCoord(drawing, ctx);
    if (x === null) return null;

    // 1. Check Vertex Handle at center (8px radius)
    if (BaseDrawingTool.dist(px, py, x, ctx.height / 2) <= 8) {
      return { hit: true, handleIndex: 0, cursor: 'ew-resize' };
    }

    // 2. Check Line Hit along the vertical span
    const threshold = Math.max(6, (drawing.lineWidth || 1) + 4);
    if (Math.abs(px - x) <= threshold && py >= 0 && py <= ctx.height) {
      return { hit: true, handleIndex: -1, cursor: 'ew-resize' };
    }

    // 3. Check Time Label Pill on timescale
    const opts: TrendlineOptions = (drawing.options as TrendlineOptions) || {};
    if (opts.showTimeLabel !== false) {
      if (Math.abs(px - x) <= 55 && py >= ctx.height - 4 && py <= ctx.height + 26) {
        return { hit: true, handleIndex: -1, cursor: 'ew-resize' };
      }
    }

    // 4. Check Text Annotation Bounds (if visible)
    const textVal = opts.text || drawing.text;
    if (opts.showText !== false && textVal && textVal.trim().length > 0) {
      const fontSize = opts.textSize || 12;
      const textLen = textVal.length * (fontSize * 0.65);
      const orientation = opts.textOrientation || 'vertical';

      let cy = ctx.height / 2;
      if (opts.textVerticalAlignment === 'top') {
        cy = Math.min(ctx.height / 2, orientation === 'vertical' ? textLen / 2 + 24 : 30);
      } else if (opts.textVerticalAlignment === 'bottom') {
        const bottomMargin = opts.showTimeLabel !== false ? 45 : 25;
        cy = Math.max(
          ctx.height / 2,
          orientation === 'vertical'
            ? ctx.height - bottomMargin - textLen / 2
            : ctx.height - bottomMargin
        );
      }

      if (orientation === 'vertical') {
        if (Math.abs(px - x) <= fontSize + 10 && Math.abs(py - cy) <= textLen / 2 + 6) {
          return { hit: true, handleIndex: -1, cursor: 'ew-resize' };
        }
      } else {
        if (Math.abs(px - x) <= textLen / 2 + 10 && Math.abs(py - cy) <= fontSize / 2 + 6) {
          return { hit: true, handleIndex: -1, cursor: 'ew-resize' };
        }
      }
    }

    return null;
  }
}
