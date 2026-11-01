import { BaseDrawingTool } from '../BaseDrawingTool';
import type {
  DrawingToolType,
  UserDrawing,
  DrawingRenderContext,
  DrawingHandle,
  HitTestResult,
  TrendlineOptions,
  TextAlignment,
  TextVerticalAlignment,
} from '../types';

export interface RectangleOptions extends Omit<TrendlineOptions, 'extend'> {
  extend?: 'none' | 'left' | 'right' | 'both';
  extendLeft?: boolean;
  extendRight?: boolean;

  // Border
  border?: boolean;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted';

  // Middle line
  showMiddleLine?: boolean;
  middleLineColor?: string;
  middleLineWidth?: number;
  middleLineStyle?: 'solid' | 'dashed' | 'dotted';

  // Background
  showBackground?: boolean;
  backgroundColor?: string;

  // Text
  showText?: boolean;
  text?: string;
  textColor?: string;
  textSize?: number;
  textBold?: boolean;
  textItalic?: boolean;
  textOrientation?: 'horizontal' | 'vertical';
  textAlignment?: TextAlignment;
  textVerticalAlignment?: TextVerticalAlignment;
}

export class RectangleTool extends BaseDrawingTool<RectangleOptions> {
  readonly id: DrawingToolType = 'rectangle';
  readonly name: string = 'Rectangle';
  readonly minAnchors: number = 2;
  readonly maxAnchors: number = 2;

  getDefaultOptions(): RectangleOptions {
    return {
      extend: 'none',
      extendLeft: false,
      extendRight: false,
      border: true,
      borderColor: '#2962ff',
      borderWidth: 1,
      borderStyle: 'solid',
      showMiddleLine: false,
      middleLineColor: '#ab47bc',
      middleLineWidth: 1,
      middleLineStyle: 'dashed',
      showBackground: true,
      backgroundColor: 'rgba(41, 98, 255, 0.2)',
      showText: true,
      text: '',
      textColor: '#d1d4dc',
      textSize: 14,
      textBold: false,
      textItalic: false,
      textOrientation: 'horizontal',
      textAlignment: 'center',
      textVerticalAlignment: 'middle',
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

  private getBounds(
    drawing: UserDrawing,
    ctx: DrawingRenderContext
  ): {
    p0: { x: number; y: number };
    p1: { x: number; y: number };
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    renderXMin: number;
    renderXMax: number;
    extendLeft: boolean;
    extendRight: boolean;
  } | null {
    if (!drawing.anchors || drawing.anchors.length < 2) return null;
    const p0 = ctx.anchorToCoordinates(drawing.anchors[0]);
    const p1 = ctx.anchorToCoordinates(drawing.anchors[1]);
    if (!p0 || !p1 || isNaN(p0.x) || isNaN(p0.y) || isNaN(p1.x) || isNaN(p1.y)) return null;

    const xMin = Math.min(p0.x, p1.x);
    const xMax = Math.max(p0.x, p1.x);
    const yMin = Math.min(p0.y, p1.y);
    const yMax = Math.max(p0.y, p1.y);

    const opts = (drawing.options as RectangleOptions) || {};
    const extendLeft = !!(opts.extendLeft || opts.extend === 'left' || opts.extend === 'both');
    const extendRight = !!(opts.extendRight || opts.extend === 'right' || opts.extend === 'both');

    const renderXMin = extendLeft ? -10 : xMin;
    const renderXMax = extendRight ? ctx.width + 10 : xMax;

    return { p0, p1, xMin, xMax, yMin, yMax, renderXMin, renderXMax, extendLeft, extendRight };
  }

  render(ctx: DrawingRenderContext, drawing: UserDrawing): void {
    const bounds = this.getBounds(drawing, ctx);
    if (!bounds) return;

    const { xMin, xMax, yMin, yMax, renderXMin, renderXMax, extendLeft, extendRight } = bounds;
    const c2d = ctx.ctx;
    const opts = (drawing.options as RectangleOptions) || {};
    const renderW = Math.max(1, renderXMax - renderXMin);
    const renderH = Math.max(1, yMax - yMin);

    c2d.save();

    // 1. Background Fill
    if (opts.showBackground !== false) {
      c2d.fillStyle = opts.backgroundColor || 'rgba(41, 98, 255, 0.2)';
      c2d.fillRect(renderXMin, yMin, renderW, renderH);
    }

    // 2. Borders
    if (opts.border !== false) {
      c2d.save();
      const borderColor = drawing.color || opts.borderColor || '#2962ff';
      const borderWidth = drawing.lineWidth || opts.borderWidth || 1;
      const borderStyle = drawing.lineStyle || opts.borderStyle || 'solid';

      c2d.strokeStyle = borderColor;
      c2d.lineWidth = borderWidth;

      if (borderStyle === 'dashed') {
        c2d.setLineDash([6, 6]);
      } else if (borderStyle === 'dotted') {
        c2d.setLineDash([2, 4]);
      } else {
        c2d.setLineDash([]);
      }

      if (!extendLeft && !extendRight) {
        c2d.strokeRect(xMin, yMin, xMax - xMin, yMax - yMin);
      } else {
        c2d.beginPath();
        // Top edge
        c2d.moveTo(renderXMin, yMin);
        c2d.lineTo(renderXMax, yMin);
        // Bottom edge
        c2d.moveTo(renderXMin, yMax);
        c2d.lineTo(renderXMax, yMax);
        // Left boundary (if not extended left)
        if (!extendLeft) {
          c2d.moveTo(xMin, yMin);
          c2d.lineTo(xMin, yMax);
        }
        // Right boundary (if not extended right)
        if (!extendRight) {
          c2d.moveTo(xMax, yMin);
          c2d.lineTo(xMax, yMax);
        }
        c2d.stroke();
      }
      c2d.restore();
    }

    // 3. Middle Line
    if (opts.showMiddleLine) {
      c2d.save();
      const yMid = (yMin + yMax) / 2;
      const midColor = opts.middleLineColor || '#ab47bc';
      const midWidth = opts.middleLineWidth || 1;
      const midStyle = opts.middleLineStyle || 'dashed';

      c2d.strokeStyle = midColor;
      c2d.lineWidth = midWidth;

      if (midStyle === 'dashed') {
        c2d.setLineDash([6, 6]);
      } else if (midStyle === 'dotted') {
        c2d.setLineDash([2, 4]);
      } else {
        c2d.setLineDash([]);
      }

      c2d.beginPath();
      c2d.moveTo(renderXMin, yMid);
      c2d.lineTo(renderXMax, yMid);
      c2d.stroke();
      c2d.restore();
    }

    // 4. Text Annotation
    const textVal = opts.text ?? drawing.text ?? '';
    if (opts.showText !== false && textVal && textVal.trim().length > 0) {
      c2d.save();
      const fontSize = opts.textSize || 14;
      const fontBold = opts.textBold ? 'bold ' : '';
      const fontItalic = opts.textItalic ? 'italic ' : '';
      c2d.font = `${fontItalic}${fontBold}${fontSize}px "Inter", -apple-system, sans-serif`;
      c2d.fillStyle = opts.textColor || '#d1d4dc';

      const padding = 6;
      const lines = textVal.split('\n');
      const lineHeight = fontSize * 1.3;
      const totalTextHeight = lines.length * lineHeight;

      // Horizontal text placement
      const hAlign = opts.textAlignment || 'center';
      let tx = (xMin + xMax) / 2;
      if (hAlign === 'left') {
        tx = (extendLeft ? Math.max(10, xMin) : xMin) + padding;
        c2d.textAlign = 'left';
      } else if (hAlign === 'right') {
        tx = (extendRight ? Math.min(ctx.width - 10, xMax) : xMax) - padding;
        c2d.textAlign = 'right';
      } else {
        tx = (xMin + xMax) / 2;
        c2d.textAlign = 'center';
      }

      // Vertical text placement:
      // 'top' displays text OUTSIDE above the rectangle
      // 'bottom' displays text OUTSIDE below the rectangle
      // 'middle' displays text INSIDE centered vertically
      const vAlign = opts.textVerticalAlignment || 'middle';
      if (vAlign === 'top') {
        c2d.textBaseline = 'bottom';
        const startY = yMin - 4 - (lines.length - 1) * lineHeight;
        lines.forEach((line, idx) => {
          c2d.fillText(line, tx, startY + idx * lineHeight);
        });
      } else if (vAlign === 'bottom') {
        c2d.textBaseline = 'top';
        const startY = yMax + 4;
        lines.forEach((line, idx) => {
          c2d.fillText(line, tx, startY + idx * lineHeight);
        });
      } else {
        // middle: inside rectangle
        c2d.textBaseline = 'middle';
        const startY = (yMin + yMax) / 2 - (totalTextHeight - lineHeight) / 2;
        lines.forEach((line, idx) => {
          c2d.fillText(line, tx, startY + idx * lineHeight);
        });
      }
      c2d.restore();
    }

    // 5. Interactive Handles (8 handles: 4 corner circles, 4 midpoint rounded rectangles)
    if (ctx.isSelected || ctx.isDraft) {
      const xMid = (xMin + xMax) / 2;
      const yMid = (yMin + yMax) / 2;

      // Corner handles (circles)
      const corners = [
        { x: xMin, y: yMin }, // 0: Top-Left
        { x: xMax, y: yMin }, // 1: Top-Right
        { x: xMax, y: yMax }, // 2: Bottom-Right
        { x: xMin, y: yMax }, // 3: Bottom-Left
      ];

      // Midpoint handles (rounded squares)
      const midpoints = [
        { x: xMid, y: yMin }, // 4: Top Midpoint
        { x: xMax, y: yMid }, // 5: Right Midpoint
        { x: xMid, y: yMax }, // 6: Bottom Midpoint
        { x: xMin, y: yMid }, // 7: Left Midpoint
      ];

      // Draw 4 corner circle handles
      corners.forEach((c) => {
        c2d.save();
        c2d.fillStyle = '#1e222d';
        c2d.strokeStyle = '#2962ff';
        c2d.lineWidth = 2;
        c2d.beginPath();
        c2d.arc(c.x, c.y, 4.5, 0, Math.PI * 2);
        c2d.fill();
        c2d.stroke();
        c2d.restore();
      });

      // Draw 4 midpoint rounded-rect handles
      midpoints.forEach((m) => {
        c2d.save();
        c2d.fillStyle = '#1e222d';
        c2d.strokeStyle = '#2962ff';
        c2d.lineWidth = 2;
        c2d.beginPath();
        if (typeof c2d.roundRect === 'function') {
          c2d.roundRect(m.x - 4.5, m.y - 4.5, 9, 9, 2.5);
        } else {
          c2d.rect(m.x - 4.5, m.y - 4.5, 9, 9);
        }
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
    const bounds = this.getBounds(drawing, ctx);
    if (!bounds) return null;

    const { xMin, xMax, yMin, yMax, renderXMin, renderXMax } = bounds;
    const xMid = (xMin + xMax) / 2;
    const yMid = (yMin + yMax) / 2;
    const opts = (drawing.options as RectangleOptions) || {};

    // 1. Test 8 interactive handles
    const handles = [
      { x: xMin, y: yMin, idx: 0, cursor: 'nwse-resize' }, // Top-Left
      { x: xMax, y: yMin, idx: 1, cursor: 'nesw-resize' }, // Top-Right
      { x: xMax, y: yMax, idx: 2, cursor: 'nwse-resize' }, // Bottom-Right
      { x: xMin, y: yMax, idx: 3, cursor: 'nesw-resize' }, // Bottom-Left
      { x: xMid, y: yMin, idx: 4, cursor: 'ns-resize' },   // Top Midpoint
      { x: xMax, y: yMid, idx: 5, cursor: 'ew-resize' },   // Right Midpoint
      { x: xMid, y: yMax, idx: 6, cursor: 'ns-resize' },   // Bottom Midpoint
      { x: xMin, y: yMid, idx: 7, cursor: 'ew-resize' },   // Left Midpoint
    ];

    for (const h of handles) {
      if (Math.hypot(px - h.x, py - h.y) <= 10) {
        return { hit: true, handleIndex: h.idx, cursor: h.cursor };
      }
    }

    // 2. Test middle line if enabled
    if (opts.showMiddleLine) {
      if (Math.abs(py - yMid) <= 6 && px >= renderXMin - 4 && px <= renderXMax + 4) {
        return { hit: true, handleIndex: -1, cursor: 'move' };
      }
    }

    // 3. Test 4 perimeter borders
    const tolerance = 7;
    // Top border
    if (Math.abs(py - yMin) <= tolerance && px >= renderXMin - 4 && px <= renderXMax + 4) {
      return { hit: true, handleIndex: -1, cursor: 'move' };
    }
    // Bottom border
    if (Math.abs(py - yMax) <= tolerance && px >= renderXMin - 4 && px <= renderXMax + 4) {
      return { hit: true, handleIndex: -1, cursor: 'move' };
    }
    // Left border
    if (Math.abs(px - xMin) <= tolerance && py >= yMin - 4 && py <= yMax + 4) {
      return { hit: true, handleIndex: -1, cursor: 'move' };
    }
    // Right border
    if (Math.abs(px - xMax) <= tolerance && py >= yMin - 4 && py <= yMax + 4) {
      return { hit: true, handleIndex: -1, cursor: 'move' };
    }

    // 4. Test interior body (if inside the rectangle)
    if (px >= renderXMin && px <= renderXMax && py >= yMin && py <= yMax) {
      return { hit: true, handleIndex: -1, cursor: 'move' };
    }

    // 5. Test text note area if text is placed outside top or bottom
    const textVal = opts.text ?? drawing.text ?? '';
    if (opts.showText !== false && textVal && textVal.trim().length > 0) {
      const fontSize = opts.textSize || 14;
      const lines = textVal.split('\n');
      const lineHeight = fontSize * 1.3;
      const totalH = lines.length * lineHeight;
      const vAlign = opts.textVerticalAlignment || 'middle';
      if (vAlign === 'top') {
        if (py >= yMin - 4 - totalH - 4 && py <= yMin && px >= xMin - 10 && px <= xMax + 10) {
          return { hit: true, handleIndex: -1, cursor: 'move' };
        }
      } else if (vAlign === 'bottom') {
        if (py >= yMax && py <= yMax + 4 + totalH + 4 && px >= xMin - 10 && px <= xMax + 10) {
          return { hit: true, handleIndex: -1, cursor: 'move' };
        }
      }
    }

    return null;
  }

  getHandles(drawing: UserDrawing, ctx: DrawingRenderContext): DrawingHandle[] {
    const bounds = this.getBounds(drawing, ctx);
    if (!bounds) return [];

    const { xMin, xMax, yMin, yMax } = bounds;
    const xMid = (xMin + xMax) / 2;
    const yMid = (yMin + yMax) / 2;

    return [
      { x: xMin, y: yMin, index: 0, cursor: 'nwse-resize' },
      { x: xMax, y: yMin, index: 1, cursor: 'nesw-resize' },
      { x: xMax, y: yMax, index: 2, cursor: 'nwse-resize' },
      { x: xMin, y: yMax, index: 3, cursor: 'nesw-resize' },
      { x: xMid, y: yMin, index: 4, cursor: 'ns-resize' },
      { x: xMax, y: yMid, index: 5, cursor: 'ew-resize' },
      { x: xMid, y: yMax, index: 6, cursor: 'ns-resize' },
      { x: xMin, y: yMid, index: 7, cursor: 'ew-resize' },
    ];
  }
}
