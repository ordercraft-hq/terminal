import { BaseDrawingTool } from '../BaseDrawingTool';
import type {
  DrawingToolType,
  UserDrawing,
  DrawingRenderContext,
  DrawingHandle,
  HitTestResult,
} from '../types';

export interface FibLevel {
  coeff: number;
  enabled: boolean;
  color: string;
}

export interface FibRetracementOptions {
  showTrendline?: boolean;
  trendlineColor?: string;
  trendlineStyle?: 'solid' | 'dashed' | 'dotted';
  trendlineWidth?: number;

  levelsLineWidth?: number;
  levelsLineStyle?: 'solid' | 'dashed' | 'dotted';

  extend?: 'none' | 'left' | 'right' | 'both';

  levels?: FibLevel[];

  useOneColor?: boolean;
  singleColor?: string;

  showBackground?: boolean;
  backgroundOpacity?: number;

  reverse?: boolean;
  showPrices?: boolean;
  showLevels?: boolean;
  levelsFormat?: 'values' | 'percents';
  labelsPosition?: 'left' | 'center' | 'right';
  labelsVerticalPosition?: 'top' | 'middle' | 'bottom';
  fontSize?: number;
  logScale?: boolean;

  visibility?: {
    seconds: boolean;
    minutes: boolean;
    hours: boolean;
    days: boolean;
    weeks: boolean;
    months: boolean;
  };
}

export const DEFAULT_FIB_LEVELS: FibLevel[] = [
  // Primary Retracement & Extension Levels (matching standard trading reference)
  { coeff: 0, enabled: true, color: '#787b86' },
  { coeff: 0.236, enabled: true, color: '#f23645' },
  { coeff: 0.382, enabled: true, color: '#ff9800' },
  { coeff: 0.5, enabled: true, color: '#089981' },
  { coeff: 0.618, enabled: true, color: '#00897b' },
  { coeff: 0.786, enabled: true, color: '#00bcd4' },
  { coeff: 1, enabled: true, color: '#787b86' },
  { coeff: 1.618, enabled: true, color: '#2962ff' },
  { coeff: 2.618, enabled: true, color: '#f23645' },
  { coeff: 3.618, enabled: true, color: '#9c27b0' },
  { coeff: 4.236, enabled: true, color: '#e91e63' },
  { coeff: 1.272, enabled: false, color: '#b26a00' },

  // Secondary & Higher Extension Levels
  { coeff: 1.414, enabled: false, color: '#ad1457' },
  { coeff: 2, enabled: false, color: '#089981' },
  { coeff: 2.272, enabled: false, color: '#b26a00' },
  { coeff: 2.414, enabled: false, color: '#ad1457' },
  { coeff: 3, enabled: false, color: '#00897b' },
  { coeff: 3.272, enabled: false, color: '#787b86' },
  { coeff: 3.414, enabled: false, color: '#2962ff' },
  { coeff: 4, enabled: false, color: '#f23645' },
  { coeff: 4.414, enabled: false, color: '#ad1457' },
  { coeff: 4.618, enabled: false, color: '#b26a00' },
  { coeff: 4.764, enabled: false, color: '#00897b' },
  { coeff: 0.79, enabled: false, color: '#b2b5be' },
];

export class FibRetracementTool extends BaseDrawingTool<FibRetracementOptions> {
  readonly id: DrawingToolType = 'fib_retracement';
  readonly name: string = 'Fib Retracement';
  readonly minAnchors: number = 2;
  readonly maxAnchors: number = 2;

  getDefaultOptions(): FibRetracementOptions {
    return {
      showTrendline: true,
      trendlineColor: '#787b86',
      trendlineStyle: 'dashed',
      trendlineWidth: 1,

      levelsLineWidth: 1,
      levelsLineStyle: 'solid',

      extend: 'none',

      levels: JSON.parse(JSON.stringify(DEFAULT_FIB_LEVELS)),

      useOneColor: false,
      singleColor: '#2962ff',

      showBackground: true,
      backgroundOpacity: 0.15,

      reverse: false,
      showPrices: true,
      showLevels: true,
      levelsFormat: 'values',
      labelsPosition: 'left',
      labelsVerticalPosition: 'middle',
      fontSize: 12,
      logScale: false,

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
  } | null {
    if (!drawing.anchors || drawing.anchors.length < 2) return null;

    const p0 = ctx.anchorToCoordinates(drawing.anchors[0]);
    const p1 = ctx.anchorToCoordinates(drawing.anchors[1]);
    if (!p0 || !p1 || isNaN(p0.x) || isNaN(p0.y) || isNaN(p1.x) || isNaN(p1.y)) return null;

    return { p0, p1 };
  }

  getHandles(drawing: UserDrawing, ctx: DrawingRenderContext): DrawingHandle[] {
    const handles: DrawingHandle[] = [];
    const pts = this.getPoints(drawing, ctx);
    if (!pts) return handles;

    // Handle 0: Anchor 0 (Origin)
    handles.push({
      x: pts.p0.x,
      y: pts.p0.y,
      index: 0,
      type: 'vertex',
      cursor: 'move',
    });

    // Handle 1: Anchor 1 (Impulse point)
    handles.push({
      x: pts.p1.x,
      y: pts.p1.y,
      index: 1,
      type: 'vertex',
      cursor: 'move',
    });

    return handles;
  }

  render(ctx: DrawingRenderContext, drawing: UserDrawing): void {
    const pts = this.getPoints(drawing, ctx);
    if (!pts) return;

    const { p0, p1 } = pts;
    const c2d = ctx.ctx;
    const opts: FibRetracementOptions = (drawing.options as FibRetracementOptions) || {};
    const defaultColor = drawing.color || '#2962ff';
    const levels = opts.levels && opts.levels.length > 0 ? opts.levels : DEFAULT_FIB_LEVELS;

    // In standard Fibonacci Retracement, Anchor 0 is level 1 (100% impulse origin)
    // and Anchor 1 is level 0 (0% retracement / current extreme), with extensions (> 1) extending beyond Anchor 0.
    const pZeroPrice = opts.reverse ? drawing.anchors[0].price : drawing.anchors[1].price;
    const pOnePrice = opts.reverse ? drawing.anchors[1].price : drawing.anchors[0].price;
    const priceDiff = pOnePrice - pZeroPrice;

    // Determine horizontal range for level lines
    let xMin = Math.min(p0.x, p1.x);
    let xMax = Math.max(p0.x, p1.x);

    const isExtendedLeft = opts.extend === 'left' || opts.extend === 'both';
    const isExtendedRight = opts.extend === 'right' || opts.extend === 'both';

    // If the tool is completely off-screen horizontally, return early (no phantom labels or lines)
    if (!isExtendedLeft && !isExtendedRight) {
      if (xMax < -50 || xMin > ctx.width + 50) {
        return;
      }
    } else if (!isExtendedRight && xMax < -50) {
      return;
    } else if (!isExtendedLeft && xMin > ctx.width + 50) {
      return;
    }

    if (opts.extend === 'both') {
      xMin = 0;
      xMax = ctx.width;
    } else if (opts.extend === 'left') {
      xMin = 0;
    } else if (opts.extend === 'right') {
      xMax = ctx.width;
    }

    c2d.save();

    // 1. Draw Trendline between Anchor 0 and Anchor 1 (if enabled)
    if (opts.showTrendline) {
      c2d.save();
      c2d.strokeStyle = opts.trendlineColor || '#787b86';
      c2d.lineWidth = opts.trendlineWidth || 1;
      if (opts.trendlineStyle === 'dashed') {
        c2d.setLineDash([6, 6]);
      } else if (opts.trendlineStyle === 'dotted') {
        c2d.setLineDash([2, 4]);
      } else {
        c2d.setLineDash([]);
      }
      c2d.beginPath();
      c2d.moveTo(p0.x, p0.y);
      c2d.lineTo(p1.x, p1.y);
      c2d.stroke();
      c2d.restore();
    }

    // 2. Compute Screen Y for each enabled level
    interface ComputedLevel {
      coeff: number;
      price: number;
      y: number;
      color: string;
    }

    const computedLevels: ComputedLevel[] = [];

    for (const lvl of levels) {
      if (!lvl.enabled) continue;

      let lvlPrice: number;
      if (opts.logScale && pZeroPrice > 0 && pOnePrice > 0) {
        lvlPrice = pZeroPrice * Math.pow(pOnePrice / pZeroPrice, lvl.coeff);
      } else {
        lvlPrice = pZeroPrice + priceDiff * lvl.coeff;
      }

      const coordY = ctx.series.priceToCoordinate(lvlPrice);
      if (coordY !== null && !isNaN(coordY)) {
        const color = opts.useOneColor
          ? opts.singleColor || defaultColor
          : lvl.color || defaultColor;

        computedLevels.push({
          coeff: lvl.coeff,
          price: lvlPrice,
          y: coordY,
          color,
        });
      }
    }

    // Sort levels by Y coordinate for band shading
    computedLevels.sort((a, b) => a.y - b.y);

    // 3. Shaded Background Bands between adjacent active levels
    if (opts.showBackground && computedLevels.length > 1) {
      const alpha = Math.min(1, Math.max(0.01, opts.backgroundOpacity ?? 0.15));
      for (let i = 0; i < computedLevels.length - 1; i++) {
        const topY = computedLevels[i].y;
        const bottomY = computedLevels[i + 1].y;
        const bandColor = computedLevels[i].color;

        c2d.save();
        c2d.fillStyle = bandColor;
        c2d.globalAlpha = alpha;
        c2d.fillRect(xMin, topY, xMax - xMin, bottomY - topY);
        c2d.restore();
      }
    }

    // 4. Render Level Lines and Labels
    const lineWidth = opts.levelsLineWidth || 1;
    const lineStyle = opts.levelsLineStyle || 'solid';
    const fontSize = opts.fontSize || 12;
    const hPos = opts.labelsPosition || 'right';
    const vPos = opts.labelsVerticalPosition || 'middle';

    for (const lvl of computedLevels) {
      let ratioText = '';
      if (opts.showLevels !== false) {
        if (opts.levelsFormat === 'percents') {
          ratioText = `${(lvl.coeff * 100).toFixed(1)}%`;
        } else {
          ratioText = `${lvl.coeff}`;
        }
      }

      let labelText = ratioText;
      if (opts.showPrices !== false) {
        if (ratioText) {
          labelText = `${ratioText} (${lvl.price.toFixed(ctx.priceDecimals)})`;
        } else {
          labelText = `${lvl.price.toFixed(ctx.priceDecimals)}`;
        }
      }

      // Calculate label coordinates and line segments so the text never overlaps the line
      const lineSegments: Array<{ x1: number; x2: number }> = [];
      let lx = xMax;
      let ly = lvl.y;
      let textAlign: CanvasTextAlign = 'left';
      let textBaseline: CanvasTextBaseline = 'middle';

      if (!labelText) {
        lineSegments.push({ x1: xMin, x2: xMax });
      } else {
        c2d.save();
        c2d.font = `${fontSize}px "JetBrains Mono", monospace`;
        const textWidth = c2d.measureText(labelText).width;
        c2d.restore();
        const gap = 8;

        if (vPos === 'top') {
          ly = lvl.y - 4;
          textBaseline = 'bottom';
          lineSegments.push({ x1: xMin, x2: xMax });
          if (hPos === 'left') {
            lx = isExtendedLeft ? 6 : xMin + 6;
            textAlign = 'left';
          } else if (hPos === 'center') {
            lx = (xMin + xMax) / 2;
            textAlign = 'center';
          } else {
            lx = isExtendedRight ? ctx.width - 6 : xMax - 6;
            textAlign = 'right';
          }
        } else if (vPos === 'bottom') {
          ly = lvl.y + 4;
          textBaseline = 'top';
          lineSegments.push({ x1: xMin, x2: xMax });
          if (hPos === 'left') {
            lx = isExtendedLeft ? 6 : xMin + 6;
            textAlign = 'left';
          } else if (hPos === 'center') {
            lx = (xMin + xMax) / 2;
            textAlign = 'center';
          } else {
            lx = isExtendedRight ? ctx.width - 6 : xMax - 6;
            textAlign = 'right';
          }
        } else {
          // vPos === 'middle' (on the line level vertically)
          ly = lvl.y;
          textBaseline = 'middle';

          if (hPos === 'left') {
            if (isExtendedLeft) {
              // Extended to left edge of screen: text inside left edge, line starts after text
              lx = 6;
              textAlign = 'left';
              const lineStart = Math.min(xMax, textWidth + 14);
              if (lineStart < xMax) {
                lineSegments.push({ x1: lineStart, x2: xMax });
              }
            } else {
              // Text beside line on the left, moves with xMin
              lx = xMin - gap;
              textAlign = 'right';
              lineSegments.push({ x1: xMin, x2: xMax });
            }
          } else if (hPos === 'center') {
            // Text centered inside the line, line broken with a gap
            lx = (xMin + xMax) / 2;
            textAlign = 'center';
            const halfW = textWidth / 2 + 5;
            const leftSegEnd = Math.max(xMin, lx - halfW);
            const rightSegStart = Math.min(xMax, lx + halfW);
            if (leftSegEnd > xMin) {
              lineSegments.push({ x1: xMin, x2: leftSegEnd });
            }
            if (rightSegStart < xMax) {
              lineSegments.push({ x1: rightSegStart, x2: xMax });
            }
          } else {
            // hPos === 'right'
            if (isExtendedRight) {
              // Extended to right edge of screen: text inside right edge, line ends before text
              lx = ctx.width - 6;
              textAlign = 'right';
              const lineEnd = Math.max(xMin, ctx.width - textWidth - 14);
              if (lineEnd > xMin) {
                lineSegments.push({ x1: xMin, x2: lineEnd });
              }
            } else {
              // Text beside line on the right, moves with xMax
              lx = xMax + gap;
              textAlign = 'left';
              lineSegments.push({ x1: xMin, x2: xMax });
            }
          }
        }
      }

      // 4a. Draw level line segments
      c2d.save();
      c2d.strokeStyle = lvl.color;
      c2d.lineWidth = lineWidth;
      if (lineStyle === 'dashed') {
        c2d.setLineDash([6, 6]);
      } else if (lineStyle === 'dotted') {
        c2d.setLineDash([2, 4]);
      } else {
        c2d.setLineDash([]);
      }

      for (const seg of lineSegments) {
        c2d.beginPath();
        c2d.moveTo(seg.x1, lvl.y);
        c2d.lineTo(seg.x2, lvl.y);
        c2d.stroke();
      }
      c2d.restore();

      // 4b. Draw label without overlapping line
      if (labelText) {
        c2d.save();
        c2d.font = `${fontSize}px "JetBrains Mono", monospace`;
        c2d.textAlign = textAlign;
        c2d.textBaseline = textBaseline;
        c2d.fillStyle = lvl.color;
        c2d.fillText(labelText, lx, ly);
        c2d.restore();
      }
    }

    // 5. Draw Anchor Handles when selected or drafting
    if (ctx.isSelected || ctx.isDraft) {
      BaseDrawingTool.drawAnchorHandle(c2d, p0.x, p0.y, ctx.isSelected, 5, defaultColor);
      BaseDrawingTool.drawAnchorHandle(c2d, p1.x, p1.y, ctx.isSelected, 5, defaultColor);
    }

    c2d.restore();
  }

  hitTest(
    drawing: UserDrawing,
    px: number,
    py: number,
    ctx: DrawingRenderContext
  ): HitTestResult | null {
    const pts = this.getPoints(drawing, ctx);
    if (!pts) return null;

    const { p0, p1 } = pts;
    const opts: FibRetracementOptions = (drawing.options as FibRetracementOptions) || {};
    const levels = opts.levels && opts.levels.length > 0 ? opts.levels : DEFAULT_FIB_LEVELS;

    const isExtendedLeft = opts.extend === 'left' || opts.extend === 'both';
    const isExtendedRight = opts.extend === 'right' || opts.extend === 'both';

    const xMinVal = Math.min(p0.x, p1.x);
    const xMaxVal = Math.max(p0.x, p1.x);

    // If completely off-screen, return null early
    if (!isExtendedLeft && !isExtendedRight) {
      if (xMaxVal < -50 || xMinVal > ctx.width + 50) {
        return null;
      }
    } else if (!isExtendedRight && xMaxVal < -50) {
      return null;
    } else if (!isExtendedLeft && xMinVal > ctx.width + 50) {
      return null;
    }

    // 1. Check Handles (8px radius)
    if (BaseDrawingTool.dist(px, py, p0.x, p0.y) <= 8) {
      return { hit: true, handleIndex: 0, cursor: 'move' };
    }
    if (BaseDrawingTool.dist(px, py, p1.x, p1.y) <= 8) {
      return { hit: true, handleIndex: 1, cursor: 'move' };
    }

    // 2. Check Trendline
    if (opts.showTrendline) {
      if (BaseDrawingTool.distToSegment(px, py, p0.x, p0.y, p1.x, p1.y) <= 6) {
        return { hit: true, handleIndex: -1, cursor: 'move' };
      }
    }

    // Determine horizontal range for level lines
    let xMin = Math.min(p0.x, p1.x);
    let xMax = Math.max(p0.x, p1.x);

    if (opts.extend === 'both') {
      xMin = 0;
      xMax = ctx.width;
    } else if (opts.extend === 'left') {
      xMin = 0;
    } else if (opts.extend === 'right') {
      xMax = ctx.width;
    }

    const pZeroPrice = opts.reverse ? drawing.anchors[0].price : drawing.anchors[1].price;
    const pOnePrice = opts.reverse ? drawing.anchors[1].price : drawing.anchors[0].price;
    const priceDiff = pOnePrice - pZeroPrice;

    // 3. Check Level Lines and Labels
    const hPos = opts.labelsPosition || 'left';
    const vPos = opts.labelsVerticalPosition || 'middle';
    const showLabels = opts.showLevels !== false || opts.showPrices !== false;
    const fontSize = opts.fontSize || 12;

    for (const lvl of levels) {
      if (!lvl.enabled) continue;

      let lvlPrice: number;
      if (opts.logScale && pZeroPrice > 0 && pOnePrice > 0) {
        lvlPrice = pZeroPrice * Math.pow(pOnePrice / pZeroPrice, lvl.coeff);
      } else {
        lvlPrice = pZeroPrice + priceDiff * lvl.coeff;
      }

      const coordY = ctx.series.priceToCoordinate(lvlPrice);
      if (coordY !== null && !isNaN(coordY)) {
        let segMinX = xMin;
        let segMaxX = xMax;

        if (showLabels && vPos === 'middle') {
          let labelText = '';
          if (opts.showLevels !== false) {
            labelText =
              opts.levelsFormat === 'percents'
                ? `${(lvl.coeff * 100).toFixed(1)}%`
                : `${lvl.coeff}`;
          }
          if (opts.showPrices !== false) {
            labelText = labelText
              ? `${labelText} (${lvlPrice.toFixed(ctx.priceDecimals)})`
              : `${lvlPrice.toFixed(ctx.priceDecimals)}`;
          }

          if (labelText) {
            ctx.ctx.save();
            ctx.ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
            const textWidth = ctx.ctx.measureText(labelText).width;
            ctx.ctx.restore();

            if (hPos === 'left' && !isExtendedLeft) {
              segMinX = Math.max(0, xMin - 8 - textWidth);
            } else if (hPos === 'right' && !isExtendedRight) {
              segMaxX = Math.min(ctx.width, xMax + 8 + textWidth);
            }
          }
        }

        if (BaseDrawingTool.distToSegment(px, py, segMinX, coordY, segMaxX, coordY) <= 6) {
          return { hit: true, handleIndex: -1, cursor: 'move' };
        }
      }
    }

    return null;
  }
}
