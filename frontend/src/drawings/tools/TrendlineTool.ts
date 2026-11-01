import { BaseDrawingTool } from '../BaseDrawingTool';
import type {
  DrawingToolType,
  UserDrawing,
  DrawingRenderContext,
  DrawingHandle,
  HitTestResult,
  TrendlineOptions,
} from '../types';

export class TrendlineTool extends BaseDrawingTool<TrendlineOptions> {
  readonly id: DrawingToolType = 'trendline';
  readonly name: string = 'Trendline';
  readonly minAnchors: number = 2;
  readonly maxAnchors: number = 2;

  getDefaultOptions(): TrendlineOptions {
    return {
      extendLeft: false,
      extendRight: false,
      leftEnd: 'normal',
      rightEnd: 'normal',
      showMiddlePoint: false,
      showPriceLabels: false,
      stats: 'hidden',
      statsPosition: 'right',
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
    if (!drawing.anchors || drawing.anchors.length < 2) return handles;

    const p0 = ctx.anchorToCoordinates(drawing.anchors[0]);
    const p1 = ctx.anchorToCoordinates(drawing.anchors[1]);

    if (p0) {
      handles.push({ x: p0.x, y: p0.y, index: 0, type: 'vertex', cursor: 'move' });
    }
    if (p1) {
      handles.push({ x: p1.x, y: p1.y, index: 1, type: 'vertex', cursor: 'move' });
    }

    const opts = (drawing.options as TrendlineOptions) || {};
    if (opts.showMiddlePoint && p0 && p1) {
      handles.push({
        x: (p0.x + p1.x) / 2,
        y: (p0.y + p1.y) / 2,
        index: 2,
        type: 'middle',
        cursor: 'move',
      });
    }

    return handles;
  }

  render(ctx: DrawingRenderContext, drawing: UserDrawing): void {
    if (!drawing.anchors || drawing.anchors.length < 2) return;

    const c2d = ctx.ctx;
    const p0 = ctx.anchorToCoordinates(drawing.anchors[0]);
    const p1 = ctx.anchorToCoordinates(drawing.anchors[1]);

    if (!p0 || !p1) return;

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

    // 2. Compute endpoints with extensions
    let startX = p0.x;
    let startY = p0.y;
    let endX = p1.x;
    let endY = p1.y;

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 0) {
      const extendDist = Math.max(ctx.width, ctx.height) * 4;

      if (opts.extendLeft) {
        startX = p0.x - (dx / dist) * extendDist;
        startY = p0.y - (dy / dist) * extendDist;
      }

      if (opts.extendRight) {
        endX = p1.x + (dx / dist) * extendDist;
        endY = p1.y + (dy / dist) * extendDist;
      }
    }

    // 3. Draw main line
    c2d.beginPath();
    c2d.moveTo(startX, startY);
    c2d.lineTo(endX, endY);
    c2d.stroke();

    // 4. Render End Caps (Arrows / Circles) if not extended
    if (!opts.extendLeft && dist > 0) {
      if (opts.leftEnd === 'arrow') {
        BaseDrawingTool.drawArrowHead(c2d, p1.x, p1.y, p0.x, p0.y, 11, color);
      } else if (opts.leftEnd === 'circle') {
        BaseDrawingTool.drawCircleCap(c2d, p0.x, p0.y, Math.max(3, lineWidth + 2), color);
      }
    }

    if (!opts.extendRight && dist > 0) {
      if (opts.rightEnd === 'arrow') {
        BaseDrawingTool.drawArrowHead(c2d, p0.x, p0.y, p1.x, p1.y, 11, color);
      } else if (opts.rightEnd === 'circle') {
        BaseDrawingTool.drawCircleCap(c2d, p1.x, p1.y, Math.max(3, lineWidth + 2), color);
      }
    }

    // 5. Render Middle Point (if enabled)
    const midX = (p0.x + p1.x) / 2;
    const midY = (p0.y + p1.y) / 2;
    if (opts.showMiddlePoint) {
      c2d.save();
      c2d.beginPath();
      c2d.arc(midX, midY, 4, 0, Math.PI * 2);
      c2d.fillStyle = '#1e222d';
      c2d.fill();
      c2d.lineWidth = 1.5;
      c2d.strokeStyle = color;
      c2d.stroke();
      c2d.restore();
    }

    // 7. Render Stats Info Pill (if enabled)
    const shouldShowStats =
      opts.stats &&
      opts.stats !== 'hidden' &&
      (opts.alwaysShowStats || ctx.isSelected);

    if (shouldShowStats) {
      const pStart = drawing.anchors[0].price;
      const pEnd = drawing.anchors[1].price;
      const dp = pEnd - pStart;
      const pct = pStart !== 0 ? (dp / pStart) * 100 : 0;
      const dur = BaseDrawingTool.formatDuration(drawing.anchors[1].time - drawing.anchors[0].time);
      const bars = BaseDrawingTool.countBars(ctx.candles, drawing.anchors[0].time, drawing.anchors[1].time);
      const theta = Math.round((Math.atan2(-(p1.y - p0.y), p1.x - p0.x) * 180) / Math.PI);
      const sign = dp >= 0 ? '+' : '';

      let label = '';
      if (opts.stats === 'bars') {
        label = `${dur} (${bars} bars)`;
      } else if (opts.stats === 'price') {
        label = `Δ ${sign}${dp.toFixed(ctx.priceDecimals)} (${sign}${pct.toFixed(2)}%)`;
      } else if (opts.stats === 'date_time') {
        label = `${dur} (${bars} bars) | ${theta}°`;
      } else {
        // 'all'
        label = `Δ ${sign}${dp.toFixed(ctx.priceDecimals)} (${sign}${pct.toFixed(2)}%) | ${dur} (${bars} bars) | ${theta}°`;
      }

      const textVal = opts.text || drawing.text;
      const hasText = opts.showText !== false && !!textVal && textVal.trim().length > 0;
      const textAlignment = opts.textAlignment || 'center';
      const textVAlign = opts.textVerticalAlignment || 'top';
      const fontSize = opts.textSize || 12;

      let statX = midX;
      let statY = midY - 14;

      if (opts.statsPosition === 'left') {
        statX = p0.x + (dx >= 0 ? 20 : -20);
        statY = p0.y - 14;
        if (hasText && textAlignment === 'left' && textVAlign === 'top') {
          statY -= fontSize + 8;
        }
      } else if (opts.statsPosition === 'right') {
        statX = p1.x + (dx >= 0 ? -20 : 20);
        statY = p1.y - 14;
        if (hasText && textAlignment === 'right' && textVAlign === 'top') {
          statY -= fontSize + 8;
        }
      } else {
        // center
        if (hasText && textAlignment === 'center' && textVAlign === 'top') {
          statY -= fontSize + 8;
        }
      }

      BaseDrawingTool.drawPill(c2d, label, statX, statY, '#1e222d', color, '#d1d4dc', 11);
    }

    // 8. Render Text Note along the line angle (in accordance with trendline slope)
    const textVal = opts.text || drawing.text;
    if (opts.showText !== false && textVal && textVal.trim().length > 0) {
      c2d.save();
      const fontSize = opts.textSize || 12;
      const fontBold = opts.textBold ? 'bold ' : '';
      const fontItalic = opts.textItalic ? 'italic ' : '';
      c2d.font = `${fontItalic}${fontBold}${fontSize}px "Inter", -apple-system, sans-serif`;

      // Determine visual left and right points so text angle is always readable left-to-right (upright)
      const pLeft = p0.x <= p1.x ? p0 : p1;
      const pRight = p0.x <= p1.x ? p1 : p0;

      const vx = pRight.x - pLeft.x;
      const vy = pRight.y - pLeft.y;
      const lineLen = Math.hypot(vx, vy);

      // Angle of line in radians (-90 deg to +90 deg, guaranteed upright because vx >= 0)
      const lineAngle = lineLen > 0 ? Math.atan2(vy, vx) : 0;
      const ux = lineLen > 0 ? vx / lineLen : 1;
      const uy = lineLen > 0 ? vy / lineLen : 0;

      // Position along the line (cx, cy)
      let cx = (pLeft.x + pRight.x) / 2;
      let cy = (pLeft.y + pRight.y) / 2;
      const margin = Math.min(24, lineLen * 0.2);

      let textAlign: CanvasTextAlign = 'center';
      if (opts.textAlignment === 'left') {
        cx = pLeft.x + ux * margin;
        cy = pLeft.y + uy * margin;
        textAlign = 'left';
      } else if (opts.textAlignment === 'right') {
        cx = pRight.x - ux * margin;
        cy = pRight.y - uy * margin;
        textAlign = 'right';
      } else {
        textAlign = 'center';
      }

      // Vertical offset perpendicular to the line:
      // 'top': above the line
      // 'bottom': below the line
      // 'middle': centered on the line (with line cutout)
      let localY = -(fontSize / 2 + 5 + lineWidth / 2);
      if (opts.textVerticalAlignment === 'bottom') {
        localY = +(fontSize / 2 + 5 + lineWidth / 2);
      } else if (opts.textVerticalAlignment === 'middle') {
        localY = 0;
      }

      // Translate to position on line and rotate by the line's exact angle
      c2d.translate(cx, cy);
      c2d.rotate(lineAngle);

      c2d.textAlign = textAlign;
      c2d.textBaseline = 'middle';

      // If middle alignment, clear behind the text with background
      if (opts.textVerticalAlignment === 'middle') {
        const tm = c2d.measureText(textVal);
        let bgX = -tm.width / 2 - 4;
        if (textAlign === 'left') bgX = -4;
        if (textAlign === 'right') bgX = -tm.width - 4;
        c2d.fillStyle = '#131722';
        c2d.fillRect(bgX, -fontSize / 2 - 2, tm.width + 8, fontSize + 4);
      }

      c2d.fillStyle = opts.textColor || color;
      c2d.fillText(textVal, 0, localY);
      c2d.restore();
    }

    // 9. Render Anchor Handles when selected or in drafting mode
    if (ctx.isSelected || ctx.isDraft) {
      BaseDrawingTool.drawAnchorHandle(c2d, p0.x, p0.y, ctx.isSelected, 5, color);
      BaseDrawingTool.drawAnchorHandle(c2d, p1.x, p1.y, ctx.isSelected, 5, color);
    }

    c2d.restore();
  }

  hitTest(
    drawing: UserDrawing,
    px: number,
    py: number,
    ctx: DrawingRenderContext
  ): HitTestResult | null {
    if (!drawing.anchors || drawing.anchors.length < 2) return null;

    const p0 = ctx.anchorToCoordinates(drawing.anchors[0]);
    const p1 = ctx.anchorToCoordinates(drawing.anchors[1]);
    if (!p0 || !p1) return null;

    // 1. Check Vertex Handles (8px radius)
    if (BaseDrawingTool.dist(px, py, p0.x, p0.y) <= 8) {
      return { hit: true, handleIndex: 0, cursor: 'move' };
    }
    if (BaseDrawingTool.dist(px, py, p1.x, p1.y) <= 8) {
      return { hit: true, handleIndex: 1, cursor: 'move' };
    }

    const opts: TrendlineOptions = (drawing.options as TrendlineOptions) || {};

    // 2. Check Middle Point Handle if enabled
    if (opts.showMiddlePoint) {
      const midX = (p0.x + p1.x) / 2;
      const midY = (p0.y + p1.y) / 2;
      if (BaseDrawingTool.dist(px, py, midX, midY) <= 8) {
        return { hit: true, handleIndex: -1, cursor: 'move' };
      }
    }

    // 3. Check Line Segment / Ray hit
    const threshold = Math.max(6, (drawing.lineWidth || 1) + 4);

    let d = Infinity;
    if (opts.extendLeft && opts.extendRight) {
      d = BaseDrawingTool.distToLine(px, py, p0.x, p0.y, p1.x, p1.y);
    } else if (opts.extendLeft) {
      // Ray starting at p1 and extending through p0
      d = BaseDrawingTool.distToRay(px, py, p1.x, p1.y, p0.x, p0.y);
    } else if (opts.extendRight) {
      // Ray starting at p0 and extending through p1
      d = BaseDrawingTool.distToRay(px, py, p0.x, p0.y, p1.x, p1.y);
    } else {
      d = BaseDrawingTool.distToSegment(px, py, p0.x, p0.y, p1.x, p1.y);
    }

    if (d <= threshold) {
      return { hit: true, handleIndex: -1, cursor: 'grab' };
    }

    return null;
  }
}
