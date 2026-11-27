import type { Time } from 'lightweight-charts';
import { BaseDrawingTool } from '../BaseDrawingTool';
import type {
  DrawingToolType,
  UserDrawing,
  DrawingRenderContext,
  DrawingHandle,
  HitTestResult,
  AnchoredVWAPOptions,
  LogicalAnchor,
} from '../types';
import type { Candle } from '../../transport/client';

interface ComputedVWAPPoint {
  time: number;
  vwap: number;
  upper1: number;
  lower1: number;
  upper2: number;
  lower2: number;
  upper3: number;
  lower3: number;
}

interface ScreenVWAPPoint {
  x: number;
  vwapY: number;
  upper1Y: number;
  lower1Y: number;
  upper2Y: number;
  lower2Y: number;
  upper3Y: number;
  lower3Y: number;
}

interface VWAPCache {
  anchorKey: string;
  candlesRef: Candle[];
  candlesLen: number;
  lastCandleTime: number;
  lastCandleHigh: number;
  lastCandleLow: number;
  lastCandleClose: number;
  lastCandleVolume: number;
  optsKey: string;
  data: ComputedVWAPPoint[];
}

const vwapCache = new WeakMap<UserDrawing, VWAPCache>();

export class AnchoredVWAPTool extends BaseDrawingTool<AnchoredVWAPOptions> {
  readonly id: DrawingToolType = 'anchored_vwap';
  readonly name: string = 'Anchored VWAP';
  readonly minAnchors: number = 1;
  readonly maxAnchors: number = 1;

  getDefaultOptions(): AnchoredVWAPOptions {
    return {
      calcMode: 'stdev',
      source: 'hlc3',
      // Multipliers & Enables (default configuration)
      band1: true,
      mult1: 1,
      band2: false,
      mult2: 2,
      band3: false,
      mult3: 3,
      // Main VWAP Line Style
      color: '#2962ff',
      lineWidth: 1,
      lineStyle: 'solid',
      // Band 1: Upper, Lower & Shaded Background (Green)
      showUpperBand1: true,
      upperBand1Color: '#089981',
      upperBand1Width: 1,
      upperBand1Style: 'solid',
      showLowerBand1: true,
      lowerBand1Color: '#089981',
      lowerBand1Width: 1,
      lowerBand1Style: 'solid',
      showBackground1: true,
      background1Color: 'rgba(8, 153, 129, 0.12)',
      // Band 2: Upper & Lower (Olive / Yellow)
      showUpperBand2: true,
      upperBand2Color: '#c5a61e',
      upperBand2Width: 1,
      upperBand2Style: 'solid',
      showLowerBand2: true,
      lowerBand2Color: '#c5a61e',
      lowerBand2Width: 1,
      lowerBand2Style: 'solid',
      // Band 3: Upper & Lower (Teal)
      showUpperBand3: true,
      upperBand3Color: '#00897b',
      upperBand3Width: 1,
      upperBand3Style: 'solid',
      showLowerBand3: true,
      lowerBand3Color: '#00897b',
      lowerBand3Width: 1,
      lowerBand3Style: 'solid',
      // Price label on scale
      showPriceLabel: true,
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
   * Memoized VWAP computation on drawing entity.
   */
  public getOrComputeVWAPData(
    drawing: UserDrawing,
    anchor: LogicalAnchor,
    candles: Candle[],
    opts?: AnchoredVWAPOptions
  ): ComputedVWAPPoint[] {
    if (!anchor || !candles || candles.length === 0) return [];

    const effectiveOpts = opts || (drawing.options as AnchoredVWAPOptions) || this.getDefaultOptions();
    const anchorKey = `${anchor.time}_${anchor.price}`;
    const candlesLen = candles.length;
    const lastCandle = candles[candlesLen - 1];
    const lastCandleTime = lastCandle ? lastCandle.time : 0;
    const lastCandleHigh = lastCandle ? lastCandle.high : 0;
    const lastCandleLow = lastCandle ? lastCandle.low : 0;
    const lastCandleClose = lastCandle ? lastCandle.close : 0;
    const lastCandleVolume = lastCandle ? (lastCandle.volume ?? 0) : 0;
    const optsKey = `${effectiveOpts.calcMode}_${effectiveOpts.source}_${effectiveOpts.mult1}_${effectiveOpts.mult2}_${effectiveOpts.mult3}`;

    const cached = vwapCache.get(drawing);
    if (
      cached &&
      cached.anchorKey === anchorKey &&
      cached.candlesRef === candles &&
      cached.candlesLen === candlesLen &&
      cached.lastCandleTime === lastCandleTime &&
      cached.lastCandleHigh === lastCandleHigh &&
      cached.lastCandleLow === lastCandleLow &&
      cached.lastCandleClose === lastCandleClose &&
      cached.lastCandleVolume === lastCandleVolume &&
      cached.optsKey === optsKey
    ) {
      return cached.data;
    }

    const data = this.computeVWAPData(anchor, candles, effectiveOpts);
    vwapCache.set(drawing, {
      anchorKey,
      candlesRef: candles,
      candlesLen,
      lastCandleTime,
      lastCandleHigh,
      lastCandleLow,
      lastCandleClose,
      lastCandleVolume,
      optsKey,
      data,
    });
    return data;
  }

  /**
   * Computes VWAP and standard deviation bands from anchor time forward through candles.
   */
  public computeVWAPData(
    anchor: LogicalAnchor,
    candles: Candle[],
    opts: AnchoredVWAPOptions
  ): ComputedVWAPPoint[] {
    if (!candles || candles.length === 0) return [];

    const anchorTime = anchor.time;
    // Find first candle with time >= anchorTime
    let startIdx = candles.findIndex((c) => c.time >= anchorTime);
    if (startIdx === -1) {
      if (candles.length > 0 && anchorTime <= candles[0].time) {
        startIdx = 0;
      } else {
        startIdx = candles.length - 1;
      }
    }

    const calcMode = opts.calcMode || 'stdev';
    const source = opts.source || 'hlc3';
    const mult1 = typeof opts.mult1 === 'number' ? opts.mult1 : 1;
    const mult2 = typeof opts.mult2 === 'number' ? opts.mult2 : 2;
    const mult3 = typeof opts.mult3 === 'number' ? opts.mult3 : 3;

    let cumVol = 0;
    let cumPV = 0;
    let cumPV2 = 0;

    const results: ComputedVWAPPoint[] = [];

    for (let i = startIdx; i < candles.length; i++) {
      const c = candles[i];
      let p = (c.high + c.low + c.close) / 3;
      if (source === 'close') p = c.close;
      else if (source === 'open') p = c.open;
      else if (source === 'high') p = c.high;
      else if (source === 'low') p = c.low;
      else if (source === 'hl2') p = (c.high + c.low) / 2;
      else if (source === 'ohlc4') p = (c.open + c.high + c.low + c.close) / 4;

      const v = typeof c.volume === 'number' && c.volume > 0 ? c.volume : 1;

      cumVol += v;
      cumPV += p * v;
      cumPV2 += p * p * v;

      const vwap = cumPV / cumVol;

      let dev = 0;
      if (calcMode === 'percentage') {
        dev = vwap / 100;
      } else {
        // Standard Deviation: sqrt( (sum(v * p^2) / sum(v)) - vwap^2 )
        const variance = Math.max(0, cumPV2 / cumVol - vwap * vwap);
        dev = Math.sqrt(variance);
      }

      results.push({
        time: c.time,
        vwap,
        upper1: vwap + mult1 * dev,
        lower1: vwap - mult1 * dev,
        upper2: vwap + mult2 * dev,
        lower2: vwap - mult2 * dev,
        upper3: vwap + mult3 * dev,
        lower3: vwap - mult3 * dev,
      });
    }

    return results;
  }

  /**
   * Projects a single computed VWAP point into screen pixel coordinates.
   */
  private projectPoint(
    ctx: DrawingRenderContext,
    pt: ComputedVWAPPoint,
    knownX?: number
  ): ScreenVWAPPoint | null {
    const x = knownX ?? (ctx.chart.timeScale().timeToCoordinate(pt.time as Time) as number | null);
    if (x === null || isNaN(x)) return null;

    const series = ctx.series;
    const vwapY = series.priceToCoordinate(pt.vwap);
    const upper1Y = series.priceToCoordinate(pt.upper1);
    const lower1Y = series.priceToCoordinate(pt.lower1);
    if (
      vwapY === null ||
      upper1Y === null ||
      lower1Y === null ||
      isNaN(vwapY) ||
      isNaN(upper1Y) ||
      isNaN(lower1Y)
    ) {
      return null;
    }

    const upper2Y = series.priceToCoordinate(pt.upper2);
    const lower2Y = series.priceToCoordinate(pt.lower2);
    const upper3Y = series.priceToCoordinate(pt.upper3);
    const lower3Y = series.priceToCoordinate(pt.lower3);

    return {
      x,
      vwapY,
      upper1Y,
      lower1Y,
      upper2Y: upper2Y ?? vwapY,
      lower2Y: lower2Y ?? vwapY,
      upper3Y: upper3Y ?? vwapY,
      lower3Y: lower3Y ?? vwapY,
    };
  }

  /**
   * Projects visible computed VWAP points into screen pixel coordinates with visible-range culling.
   */
  private getScreenPoints(
    ctx: DrawingRenderContext,
    computed: ComputedVWAPPoint[]
  ): ScreenVWAPPoint[] {
    if (computed.length === 0) return [];

    const screenPts: ScreenVWAPPoint[] = [];
    const timeScale = ctx.chart.timeScale();

    let startIdx = 0;
    let endIdx = computed.length - 1;

    // 1. Coarse O(log N) binary-search cull using chart visible time range
    try {
      const visibleRange = timeScale.getVisibleRange?.();
      if (
        visibleRange &&
        typeof visibleRange.from === 'number' &&
        typeof visibleRange.to === 'number' &&
        Number.isFinite(visibleRange.from) &&
        Number.isFinite(visibleRange.to)
      ) {
        const fromTime = visibleRange.from;
        const toTime = visibleRange.to;

        // Find last point with time < fromTime so boundary segment enters viewport cleanly
        let lo = 0;
        let hi = computed.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (computed[mid].time < fromTime) lo = mid + 1;
          else hi = mid - 1;
        }
        startIdx = Math.max(0, hi);

        // Find first point with time > toTime so boundary segment exits viewport cleanly
        lo = startIdx;
        hi = computed.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (computed[mid].time <= toTime) lo = mid + 1;
          else hi = mid - 1;
        }
        endIdx = Math.min(computed.length - 1, lo);
      }
    } catch {}

    // 2. Fine screen-X culling: avoid projecting 7 price coords for off-screen bars
    const margin = 60;
    const maxScreenX = ctx.width + margin;
    let pendingLeft: { pt: ComputedVWAPPoint; x: number } | null = null;

    for (let i = startIdx; i <= endIdx; i++) {
      const pt = computed[i];
      const x = timeScale.timeToCoordinate(pt.time as Time) as number | null;
      if (x === null || isNaN(x)) continue;

      if (x < -margin) {
        pendingLeft = { pt, x };
        continue;
      }

      if (pendingLeft) {
        const leftProjected = this.projectPoint(ctx, pendingLeft.pt, pendingLeft.x);
        if (leftProjected) screenPts.push(leftProjected);
        pendingLeft = null;
      }

      const projected = this.projectPoint(ctx, pt, x);
      if (projected) {
        screenPts.push(projected);
      }

      if (x > maxScreenX) {
        break;
      }
    }

    return screenPts;
  }

  getHandles(drawing: UserDrawing, ctx: DrawingRenderContext): DrawingHandle[] {
    const handles: DrawingHandle[] = [];
    if (!drawing.anchors || drawing.anchors.length < 1) return handles;

    const anchor = drawing.anchors[0];
    const opts: AnchoredVWAPOptions = (drawing.options as AnchoredVWAPOptions) || this.getDefaultOptions();
    const computed = this.getOrComputeVWAPData(drawing, anchor, ctx.candles, opts);
    if (computed.length === 0) return handles;

    const anchorPt = this.projectPoint(ctx, computed[0]);
    if (!anchorPt) return handles;

    // Anchor handle placed precisely at the actual start point of the curve (computed[0])
    handles.push({
      x: anchorPt.x,
      y: anchorPt.vwapY,
      index: 0,
      type: 'vertex',
      cursor: 'grab',
    });

    return handles;
  }

  render(ctx: DrawingRenderContext, drawing: UserDrawing): void {
    if (!drawing.anchors || drawing.anchors.length < 1) return;

    const anchor = drawing.anchors[0];
    const opts: AnchoredVWAPOptions = (drawing.options as AnchoredVWAPOptions) || this.getDefaultOptions();
    const c2d = ctx.ctx;

    const computed = this.getOrComputeVWAPData(drawing, anchor, ctx.candles, opts);
    if (computed.length === 0) return;

    const pts = this.getScreenPoints(ctx, computed);
    if (pts.length === 0) return;

    c2d.save();

    // 1. Shaded Background Fill between Band 1 Upper & Lower
    if (opts.band1 !== false && opts.showBackground1 !== false && pts.length >= 2) {
      c2d.beginPath();
      // Forward along Upper Band 1
      c2d.moveTo(pts[0].x, pts[0].upper1Y);
      for (let i = 1; i < pts.length; i++) {
        c2d.lineTo(pts[i].x, pts[i].upper1Y);
      }
      // Backward along Lower Band 1
      for (let i = pts.length - 1; i >= 0; i--) {
        c2d.lineTo(pts[i].x, pts[i].lower1Y);
      }
      c2d.closePath();
      c2d.fillStyle = opts.background1Color || 'rgba(8, 153, 129, 0.12)';
      c2d.fill();
    }

    const applyDash = (style?: 'solid' | 'dashed' | 'dotted') => {
      if (style === 'dashed') c2d.setLineDash([5, 5]);
      else if (style === 'dotted') c2d.setLineDash([2, 4]);
      else c2d.setLineDash([]);
    };

    const drawCurve = (
      yExtractor: (p: ScreenVWAPPoint) => number,
      color: string,
      width: number,
      style?: 'solid' | 'dashed' | 'dotted'
    ) => {
      if (pts.length < 2) return;
      c2d.beginPath();
      applyDash(style);
      c2d.strokeStyle = color;
      c2d.lineWidth = width;
      c2d.lineJoin = 'round';
      c2d.lineCap = 'round';

      c2d.moveTo(pts[0].x, yExtractor(pts[0]));
      for (let i = 1; i < pts.length; i++) {
        c2d.lineTo(pts[i].x, yExtractor(pts[i]));
      }
      c2d.stroke();
    };

    // 2. Band #3 (Lower & Upper)
    if (opts.band3) {
      if (opts.showLowerBand3 !== false) {
        drawCurve(
          (p) => p.lower3Y,
          opts.lowerBand3Color || '#00897b',
          opts.lowerBand3Width || 1,
          opts.lowerBand3Style
        );
      }
      if (opts.showUpperBand3 !== false) {
        drawCurve(
          (p) => p.upper3Y,
          opts.upperBand3Color || '#00897b',
          opts.upperBand3Width || 1,
          opts.upperBand3Style
        );
      }
    }

    // 3. Band #2 (Lower & Upper)
    if (opts.band2) {
      if (opts.showLowerBand2 !== false) {
        drawCurve(
          (p) => p.lower2Y,
          opts.lowerBand2Color || '#c5a61e',
          opts.lowerBand2Width || 1,
          opts.lowerBand2Style
        );
      }
      if (opts.showUpperBand2 !== false) {
        drawCurve(
          (p) => p.upper2Y,
          opts.upperBand2Color || '#c5a61e',
          opts.upperBand2Width || 1,
          opts.upperBand2Style
        );
      }
    }

    // 4. Band #1 (Lower & Upper)
    if (opts.band1 !== false) {
      if (opts.showLowerBand1 !== false) {
        drawCurve(
          (p) => p.lower1Y,
          opts.lowerBand1Color || '#089981',
          opts.lowerBand1Width || 1,
          opts.lowerBand1Style
        );
      }
      if (opts.showUpperBand1 !== false) {
        drawCurve(
          (p) => p.upper1Y,
          opts.upperBand1Color || '#089981',
          opts.upperBand1Width || 1,
          opts.upperBand1Style
        );
      }
    }

    // 5. Main VWAP Line
    const mainColor = drawing.color || opts.color || '#2962ff';
    const mainWidth = drawing.lineWidth || opts.lineWidth || 1;
    const mainStyle = drawing.lineStyle || opts.lineStyle || 'solid';
    drawCurve((p) => p.vwapY, mainColor, mainWidth, mainStyle);

    const anchorPt = this.projectPoint(ctx, computed[0]);

    // 6. Anchor Point Handle at the actual start point (computed[0]) strictly when selected
    if (ctx.isSelected && anchorPt) {
      const anchorX = anchorPt.x;
      const anchorY = anchorPt.vwapY;

      // Outer glow / halo ring when selected
      c2d.beginPath();
      c2d.arc(anchorX, anchorY, 8.5, 0, Math.PI * 2);
      c2d.fillStyle = 'rgba(41, 98, 255, 0.25)';
      c2d.fill();

      // Anchor Handle Circle (blue ring with white interior matching reference image)
      c2d.beginPath();
      c2d.arc(anchorX, anchorY, 5, 0, Math.PI * 2);
      c2d.fillStyle = '#ffffff';
      c2d.fill();
      c2d.lineWidth = 2;
      c2d.strokeStyle = mainColor;
      c2d.stroke();
    }

    // 7. Interactive selection dots along curves when selected (matching reference image)
    if (ctx.isSelected) {
      const renderDot = (x: number, y: number, dotColor: string) => {
        c2d.beginPath();
        c2d.arc(x, y, 3, 0, Math.PI * 2);
        c2d.fillStyle = '#ffffff';
        c2d.fill();
        c2d.strokeStyle = dotColor;
        c2d.lineWidth = 1.25;
        c2d.stroke();
      };

      // Band 1 start handles at actual anchor point
      if (anchorPt && opts.band1 !== false) {
        if (opts.showUpperBand1 !== false) {
          renderDot(anchorPt.x, anchorPt.upper1Y, opts.upperBand1Color || '#089981');
        }
        if (opts.showLowerBand1 !== false) {
          renderDot(anchorPt.x, anchorPt.lower1Y, opts.lowerBand1Color || '#089981');
        }
      }

      if (pts.length >= 2) {
        // Intermediate points
        const sampleCount = Math.min(3, Math.max(1, Math.floor(pts.length / 15)));
        for (let s = 1; s <= sampleCount; s++) {
          const idx = Math.floor((pts.length - 1) * (s / (sampleCount + 1)));
          const p = pts[idx];
          if (!p) continue;
          renderDot(p.x, p.vwapY, mainColor);
          if (opts.band1 !== false) {
            if (opts.showUpperBand1 !== false) {
              renderDot(p.x, p.upper1Y, opts.upperBand1Color || '#089981');
            }
            if (opts.showLowerBand1 !== false) {
              renderDot(p.x, p.lower1Y, opts.lowerBand1Color || '#089981');
            }
          }
        }

        // End points at rightmost candle
        const lastP = pts[pts.length - 1];
        renderDot(lastP.x, lastP.vwapY, mainColor);
        if (opts.band1 !== false) {
          if (opts.showUpperBand1 !== false) {
            renderDot(lastP.x, lastP.upper1Y, opts.upperBand1Color || '#089981');
          }
          if (opts.showLowerBand1 !== false) {
            renderDot(lastP.x, lastP.lower1Y, opts.lowerBand1Color || '#089981');
          }
        }
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
    if (!drawing.anchors || drawing.anchors.length < 1) return null;

    const anchor = drawing.anchors[0];
    const opts: AnchoredVWAPOptions = (drawing.options as AnchoredVWAPOptions) || this.getDefaultOptions();

    const computed = this.getOrComputeVWAPData(drawing, anchor, ctx.candles, opts);
    if (computed.length === 0) return null;

    const anchorPt = this.projectPoint(ctx, computed[0]);
    // 1. Test Anchor Vertex Handle (radius <= 14px) at actual start point
    if (anchorPt) {
      const distToAnchor = Math.hypot(px - anchorPt.x, py - anchorPt.vwapY);
      if (distToAnchor <= 14) {
        return {
          hit: true,
          handleIndex: 0,
          cursor: 'grab',
        };
      }
    }

    const pts = this.getScreenPoints(ctx, computed);
    if (pts.length < 2) return null;

    const hitTolerance = 7;

    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];

      // Quick bounding box filter for segment
      const minX = Math.min(p1.x, p2.x) - hitTolerance;
      const maxX = Math.max(p1.x, p2.x) + hitTolerance;
      if (px < minX || px > maxX) continue;

      // Distance to VWAP curve segment
      if (BaseDrawingTool.distToSegment(px, py, p1.x, p1.vwapY, p2.x, p2.vwapY) <= hitTolerance) {
        return { hit: true, handleIndex: -1, cursor: 'pointer' };
      }

      // Distance to Band 1 Upper/Lower
      if (opts.band1 !== false) {
        if (
          opts.showUpperBand1 !== false &&
          BaseDrawingTool.distToSegment(px, py, p1.x, p1.upper1Y, p2.x, p2.upper1Y) <= hitTolerance
        ) {
          return { hit: true, handleIndex: -1, cursor: 'pointer' };
        }
        if (
          opts.showLowerBand1 !== false &&
          BaseDrawingTool.distToSegment(px, py, p1.x, p1.lower1Y, p2.x, p2.lower1Y) <= hitTolerance
        ) {
          return { hit: true, handleIndex: -1, cursor: 'pointer' };
        }
      }

      // Distance to Band 2 Upper/Lower
      if (opts.band2) {
        if (
          opts.showUpperBand2 !== false &&
          BaseDrawingTool.distToSegment(px, py, p1.x, p1.upper2Y, p2.x, p2.upper2Y) <= hitTolerance
        ) {
          return { hit: true, handleIndex: -1, cursor: 'pointer' };
        }
        if (
          opts.showLowerBand2 !== false &&
          BaseDrawingTool.distToSegment(px, py, p1.x, p1.lower2Y, p2.x, p2.lower2Y) <= hitTolerance
        ) {
          return { hit: true, handleIndex: -1, cursor: 'pointer' };
        }
      }

      // Distance to Band 3 Upper/Lower
      if (opts.band3) {
        if (
          opts.showUpperBand3 !== false &&
          BaseDrawingTool.distToSegment(px, py, p1.x, p1.upper3Y, p2.x, p2.upper3Y) <= hitTolerance
        ) {
          return { hit: true, handleIndex: -1, cursor: 'pointer' };
        }
        if (
          opts.showLowerBand3 !== false &&
          BaseDrawingTool.distToSegment(px, py, p1.x, p1.lower3Y, p2.x, p2.lower3Y) <= hitTolerance
        ) {
          return { hit: true, handleIndex: -1, cursor: 'pointer' };
        }
      }
    }

    return null;
  }
}
