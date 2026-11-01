import { BaseDrawingTool } from '../BaseDrawingTool';
import type {
  DrawingToolType,
  UserDrawing,
  DrawingRenderContext,
  DrawingHandle,
  HitTestResult,
  TrendlineOptions,
} from '../types';

export interface ChannelLevel {
  coeff: number;
  enabled: boolean;
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
}

export interface ParallelChannelOptions extends TrendlineOptions {
  levels?: ChannelLevel[];
  extendLeft?: boolean;
  extendRight?: boolean;
  showBackground?: boolean;
  backgroundColor?: string;
}

export const DEFAULT_CHANNEL_LEVELS: ChannelLevel[] = [
  { coeff: -0.25, enabled: false, color: '#2962ff', lineWidth: 1, lineStyle: 'solid' },
  { coeff: 0, enabled: true, color: '#434651', lineWidth: 1, lineStyle: 'solid' },
  { coeff: 0.25, enabled: false, color: '#2962ff', lineWidth: 1, lineStyle: 'solid' },
  { coeff: 0.5, enabled: true, color: '#2962ff', lineWidth: 1, lineStyle: 'dashed' },
  { coeff: 0.75, enabled: false, color: '#2962ff', lineWidth: 1, lineStyle: 'solid' },
  { coeff: 1, enabled: true, color: '#434651', lineWidth: 1, lineStyle: 'solid' },
  { coeff: 1.25, enabled: false, color: '#2962ff', lineWidth: 1, lineStyle: 'solid' },
];

export class ParallelChannelTool extends BaseDrawingTool<ParallelChannelOptions> {
  readonly id: DrawingToolType = 'parallel_channel';
  readonly name: string = 'Parallel Channel';
  readonly minAnchors: number = 2;
  readonly maxAnchors: number = 3;

  getDefaultOptions(): ParallelChannelOptions {
    return {
      levels: JSON.parse(JSON.stringify(DEFAULT_CHANNEL_LEVELS)),
      extendLeft: false,
      extendRight: false,
      showBackground: true,
      backgroundColor: 'rgba(41, 98, 255, 0.12)',
      showText: false,
      text: '',
      textColor: '#d1d4dc',
      textSize: 12,
      textBold: false,
      textItalic: false,
      textOrientation: 'horizontal',
      textAlignment: 'center',
      textVerticalAlignment: 'top',
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

  private getPoints(
    drawing: UserDrawing,
    ctx: DrawingRenderContext
  ): {
    p0: { x: number; y: number };
    p1: { x: number; y: number };
    deltaY: number;
    deltaX: number;
  } | null {
    if (!drawing.anchors || drawing.anchors.length < 2) return null;

    const p0 = ctx.anchorToCoordinates(drawing.anchors[0]);
    const p1 = ctx.anchorToCoordinates(drawing.anchors[1]);
    if (!p0 || !p1 || isNaN(p0.x) || isNaN(p0.y) || isNaN(p1.x) || isNaN(p1.y)) return null;

    let deltaY = 0;
    let deltaX = 0;

    if (drawing.anchors.length >= 3 && drawing.anchors[2]) {
      const p2 = ctx.anchorToCoordinates(drawing.anchors[2]);
      if (p2 && !isNaN(p2.x) && !isNaN(p2.y)) {
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        if (Math.abs(dx) > 0.001) {
          const slope = dy / dx;
          const baselineYAtX2 = p0.y + slope * (p2.x - p0.x);
          deltaY = p2.y - baselineYAtX2;
        } else {
          deltaX = p2.x - p0.x;
        }
      }
    }

    return { p0, p1, deltaY, deltaX };
  }

  getHandles(drawing: UserDrawing, ctx: DrawingRenderContext): DrawingHandle[] {
    const handles: DrawingHandle[] = [];
    const geom = this.getPoints(drawing, ctx);
    if (!geom) return handles;

    const { p0, p1, deltaY, deltaX } = geom;

    // Handle 0: Anchor 0 (Baseline start)
    handles.push({
      x: p0.x,
      y: p0.y,
      index: 0,
      type: 'vertex',
      cursor: 'move',
    });

    // Handle 1: Anchor 1 (Baseline end)
    handles.push({
      x: p1.x,
      y: p1.y,
      index: 1,
      type: 'vertex',
      cursor: 'move',
    });

    if (drawing.anchors.length >= 3) {
      // Handle 2: Anchor 2 (Parallel line corner at p1)
      handles.push({
        x: p1.x + deltaX,
        y: p1.y + deltaY,
        index: 2,
        type: 'vertex',
        cursor: 'ns-resize',
      });

      // Handle 3: Parallel line corner at p0
      handles.push({
        x: p0.x + deltaX,
        y: p0.y + deltaY,
        index: 3,
        type: 'vertex',
        cursor: 'ns-resize',
      });

      // Handle 4: Midpoint of baseline
      handles.push({
        x: (p0.x + p1.x) / 2,
        y: (p0.y + p1.y) / 2,
        index: 4,
        type: 'middle',
        cursor: 'move',
      });

      // Handle 5: Midpoint of parallel line
      handles.push({
        x: (p0.x + p1.x) / 2 + deltaX,
        y: (p0.y + p1.y) / 2 + deltaY,
        index: 5,
        type: 'middle',
        cursor: 'ns-resize',
      });
    }

    return handles;
  }

  render(ctx: DrawingRenderContext, drawing: UserDrawing): void {
    const geom = this.getPoints(drawing, ctx);
    if (!geom) return;

    const { p0, p1, deltaY, deltaX } = geom;
    const c2d = ctx.ctx;
    const opts: ParallelChannelOptions = (drawing.options as ParallelChannelOptions) || {};
    const defaultColor = drawing.color || '#2962ff';
    const defaultWidth = drawing.lineWidth || 1;
    const levels = opts.levels && opts.levels.length > 0 ? opts.levels : DEFAULT_CHANNEL_LEVELS;

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const slope = Math.abs(dx) > 0.001 ? dy / dx : 0;
    const isVertical = Math.abs(dx) <= 0.001;

    c2d.save();

    // 1. If only 2 points during initial drafting, draw baseline line
    if (drawing.anchors.length < 3) {
      c2d.strokeStyle = defaultColor;
      c2d.lineWidth = defaultWidth;
      c2d.beginPath();
      c2d.moveTo(p0.x, p0.y);
      c2d.lineTo(p1.x, p1.y);
      c2d.stroke();

      if (ctx.isSelected || ctx.isDraft) {
        BaseDrawingTool.drawAnchorHandle(c2d, p0.x, p0.y, ctx.isSelected, 5, defaultColor);
        BaseDrawingTool.drawAnchorHandle(c2d, p1.x, p1.y, ctx.isSelected, 5, defaultColor);
      }
      c2d.restore();
      return;
    }

    // Function to calculate start and end points for a given ratio
    const getLevelEndpoints = (coeff: number) => {
      let xStart = p0.x + coeff * deltaX;
      let yStart = p0.y + coeff * deltaY;
      let xEnd = p1.x + coeff * deltaX;
      let yEnd = p1.y + coeff * deltaY;

      if (!isVertical) {
        if (opts.extendLeft) {
          xStart = 0;
          yStart = (p0.y + coeff * deltaY) - slope * p0.x;
        }
        if (opts.extendRight) {
          xEnd = ctx.width;
          yEnd = (p1.y + coeff * deltaY) + slope * (ctx.width - p1.x);
        }
      } else {
        if (opts.extendLeft) yStart = 0;
        if (opts.extendRight) yEnd = ctx.height;
      }

      return { xStart, yStart, xEnd, yEnd };
    };

    // 2. Render Channel Background Fill (between coeff 0 and coeff 1)
    if (opts.showBackground !== false) {
      const b0 = getLevelEndpoints(0);
      const b1 = getLevelEndpoints(1);

      c2d.save();
      c2d.fillStyle = opts.backgroundColor || 'rgba(41, 98, 255, 0.12)';
      c2d.beginPath();
      c2d.moveTo(b0.xStart, b0.yStart);
      c2d.lineTo(b0.xEnd, b0.yEnd);
      c2d.lineTo(b1.xEnd, b1.yEnd);
      c2d.lineTo(b1.xStart, b1.yStart);
      c2d.closePath();
      c2d.fill();
      c2d.restore();
    }

    // 3. Render Channel Levels
    for (const lvl of levels) {
      // Coeff 0 and 1 are always enabled
      const isAlwaysOn = lvl.coeff === 0 || lvl.coeff === 1;
      if (!lvl.enabled && !isAlwaysOn) continue;

      const pts = getLevelEndpoints(lvl.coeff);
      c2d.save();
      c2d.strokeStyle = lvl.color || defaultColor;
      c2d.lineWidth = lvl.lineWidth || defaultWidth;

      if (lvl.lineStyle === 'dashed') {
        c2d.setLineDash([6, 6]);
      } else if (lvl.lineStyle === 'dotted') {
        c2d.setLineDash([2, 4]);
      } else {
        c2d.setLineDash([]);
      }

      c2d.beginPath();
      c2d.moveTo(pts.xStart, pts.yStart);
      c2d.lineTo(pts.xEnd, pts.yEnd);
      c2d.stroke();
      c2d.restore();
    }

    // 4. Render End Caps (Side borders connecting coeff 0 to coeff 1) if not extended
    if (!opts.extendLeft) {
      c2d.save();
      c2d.strokeStyle = levels.find((l) => l.coeff === 0)?.color || defaultColor;
      c2d.lineWidth = defaultWidth;
      c2d.beginPath();
      c2d.moveTo(p0.x, p0.y);
      c2d.lineTo(p0.x + deltaX, p0.y + deltaY);
      c2d.stroke();
      c2d.restore();
    }
    if (!opts.extendRight) {
      c2d.save();
      c2d.strokeStyle = levels.find((l) => l.coeff === 1)?.color || defaultColor;
      c2d.lineWidth = defaultWidth;
      c2d.beginPath();
      c2d.moveTo(p1.x, p1.y);
      c2d.lineTo(p1.x + deltaX, p1.y + deltaY);
      c2d.stroke();
      c2d.restore();
    }

    // 5. Render Text Annotation
    const textVal = opts.text || drawing.text;
    if (opts.showText !== false && textVal && textVal.trim().length > 0) {
      c2d.save();
      const fontSize = opts.textSize || 12;
      const fontBold = opts.textBold ? 'bold ' : '';
      const fontItalic = opts.textItalic ? 'italic ' : '';
      c2d.font = `${fontItalic}${fontBold}${fontSize}px "Inter", -apple-system, sans-serif`;

      // Determine vertical anchor level
      let vRatio = 0; // top / baseline
      if (opts.textVerticalAlignment === 'middle') vRatio = 0.5;
      else if (opts.textVerticalAlignment === 'bottom') vRatio = 1.0;

      // Determine horizontal anchor position along the segment
      let hRatio = 0.5; // center
      if (opts.textAlignment === 'left') hRatio = 0.15;
      else if (opts.textAlignment === 'right') hRatio = 0.85;

      const tx = p0.x + hRatio * dx + vRatio * deltaX;
      const ty = p0.y + hRatio * dy + vRatio * deltaY;

      const angle =
        opts.textOrientation === 'vertical'
          ? -Math.PI / 2
          : opts.textOrientation === 'horizontal'
          ? 0
          : Math.atan2(dy, dx);

      c2d.translate(tx, ty);
      c2d.rotate(angle);

      const metrics = c2d.measureText(textVal);
      const textWidth = metrics.width;
      const paddingX = 4;
      const paddingY = 2;

      // Background fill for text readability
      c2d.fillStyle = 'rgba(19, 23, 34, 0.85)';
      c2d.fillRect(
        -textWidth / 2 - paddingX,
        -fontSize / 2 - paddingY,
        textWidth + paddingX * 2,
        fontSize + paddingY * 2
      );

      c2d.fillStyle = opts.textColor || defaultColor;
      c2d.textAlign = 'center';
      c2d.textBaseline = 'middle';
      c2d.fillText(textVal, 0, 0);

      c2d.restore();
    }

    // 6. Render Anchor Handles when selected or drafting
    if (ctx.isSelected || ctx.isDraft) {
      // Handle 0: Baseline start
      BaseDrawingTool.drawAnchorHandle(c2d, p0.x, p0.y, ctx.isSelected, 5, defaultColor);
      // Handle 1: Baseline end
      BaseDrawingTool.drawAnchorHandle(c2d, p1.x, p1.y, ctx.isSelected, 5, defaultColor);
      // Handle 2: Parallel line end (directly at p1 + delta)
      BaseDrawingTool.drawAnchorHandle(c2d, p1.x + deltaX, p1.y + deltaY, ctx.isSelected, 5, defaultColor);
      // Handle 3: Parallel line start
      BaseDrawingTool.drawAnchorHandle(c2d, p0.x + deltaX, p0.y + deltaY, ctx.isSelected, 5, defaultColor);
      // Handle 4: Midpoint baseline
      BaseDrawingTool.drawAnchorHandle(c2d, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, ctx.isSelected, 4, defaultColor);
      // Handle 5: Midpoint parallel line
      BaseDrawingTool.drawAnchorHandle(
        c2d,
        (p0.x + p1.x) / 2 + deltaX,
        (p0.y + p1.y) / 2 + deltaY,
        ctx.isSelected,
        4,
        defaultColor
      );
    }

    c2d.restore();
  }

  hitTest(
    drawing: UserDrawing,
    px: number,
    py: number,
    ctx: DrawingRenderContext
  ): HitTestResult | null {
    const geom = this.getPoints(drawing, ctx);
    if (!geom) return null;

    const { p0, p1, deltaY, deltaX } = geom;
    const opts: ParallelChannelOptions = (drawing.options as ParallelChannelOptions) || {};
    const levels = opts.levels && opts.levels.length > 0 ? opts.levels : DEFAULT_CHANNEL_LEVELS;

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const slope = Math.abs(dx) > 0.001 ? dy / dx : 0;
    const isVertical = Math.abs(dx) <= 0.001;

    // 1. Check Vertex & Middle Handles
    if (BaseDrawingTool.dist(px, py, p0.x, p0.y) <= 8) {
      return { hit: true, handleIndex: 0, cursor: 'move' };
    }
    if (BaseDrawingTool.dist(px, py, p1.x, p1.y) <= 8) {
      return { hit: true, handleIndex: 1, cursor: 'move' };
    }

    if (drawing.anchors.length >= 3) {
      if (BaseDrawingTool.dist(px, py, p1.x + deltaX, p1.y + deltaY) <= 8) {
        return { hit: true, handleIndex: 2, cursor: 'ns-resize' };
      }
      if (BaseDrawingTool.dist(px, py, p0.x + deltaX, p0.y + deltaY) <= 8) {
        return { hit: true, handleIndex: 3, cursor: 'ns-resize' };
      }
      if (BaseDrawingTool.dist(px, py, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2) <= 8) {
        return { hit: true, handleIndex: 4, cursor: 'move' };
      }
      if (
        BaseDrawingTool.dist(
          px,
          py,
          (p0.x + p1.x) / 2 + deltaX,
          (p0.y + p1.y) / 2 + deltaY
        ) <= 8
      ) {
        return { hit: true, handleIndex: 5, cursor: 'ns-resize' };
      }
    }

    const getLevelEndpoints = (coeff: number) => {
      let xStart = p0.x + coeff * deltaX;
      let yStart = p0.y + coeff * deltaY;
      let xEnd = p1.x + coeff * deltaX;
      let yEnd = p1.y + coeff * deltaY;

      if (!isVertical) {
        if (opts.extendLeft) {
          xStart = 0;
          yStart = (p0.y + coeff * deltaY) - slope * p0.x;
        }
        if (opts.extendRight) {
          xEnd = ctx.width;
          yEnd = (p1.y + coeff * deltaY) + slope * (ctx.width - p1.x);
        }
      } else {
        if (opts.extendLeft) yStart = 0;
        if (opts.extendRight) yEnd = ctx.height;
      }

      return { xStart, yStart, xEnd, yEnd };
    };

    // 2. Check Level Lines
    for (const lvl of levels) {
      const isAlwaysOn = lvl.coeff === 0 || lvl.coeff === 1;
      if (!lvl.enabled && !isAlwaysOn) continue;

      const pts = getLevelEndpoints(lvl.coeff);
      if (BaseDrawingTool.distToSegment(px, py, pts.xStart, pts.yStart, pts.xEnd, pts.yEnd) <= 8) {
        return { hit: true, handleIndex: -1, cursor: 'move' };
      }
    }

    // 3. Check Side Borders
    if (!opts.extendLeft) {
      if (BaseDrawingTool.distToSegment(px, py, p0.x, p0.y, p0.x + deltaX, p0.y + deltaY) <= 8) {
        return { hit: true, handleIndex: -1, cursor: 'move' };
      }
    }
    if (!opts.extendRight) {
      if (BaseDrawingTool.distToSegment(px, py, p1.x, p1.y, p1.x + deltaX, p1.y + deltaY) <= 8) {
        return { hit: true, handleIndex: -1, cursor: 'move' };
      }
    }

    // 4. Check Background Fill (inside polygon)
    if (drawing.anchors.length >= 3 && opts.showBackground !== false) {
      const b0 = getLevelEndpoints(0);
      const b1 = getLevelEndpoints(1);
      const poly = [
        { x: b0.xStart, y: b0.yStart },
        { x: b0.xEnd, y: b0.yEnd },
        { x: b1.xEnd, y: b1.yEnd },
        { x: b1.xStart, y: b1.yStart },
      ];
      if (BaseDrawingTool.pointInPolygon(px, py, poly)) {
        return { hit: true, handleIndex: -1, cursor: 'move' };
      }
    }

    return null;
  }
}
