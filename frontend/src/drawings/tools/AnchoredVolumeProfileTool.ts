import { BaseDrawingTool } from '../BaseDrawingTool';
import type {
  DrawingToolType,
  UserDrawing,
  DrawingRenderContext,
  DrawingHandle,
  HitTestResult,
  AVPOptions,
  LogicalAnchor,
} from '../types';
import type { Candle } from '../../transport/client';
import type { VolumeProfileData } from './FixedRangeVolumeProfileTool';
import { computeVolumeProfileFromCandles } from '../helpers/volumeProfileCalc';

function toAlpha(color: string, alpha: number): string {
  if (!color || color === 'transparent') return 'transparent';
  if (color.startsWith('rgba')) {
    return color.replace(/[\d\.]+\)$/, `${alpha})`);
  }
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  }
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return color;
}

interface AVPCache {
  anchorsKey: string;
  candlesRef: Candle[];
  candlesLen: number;
  lastCandleTime: number;
  lastCandleHigh: number;
  lastCandleLow: number;
  lastCandleClose: number;
  lastCandleVolume: number;
  optsKey: string;
  data: VolumeProfileData | null;
}

const avpCache = new WeakMap<UserDrawing, AVPCache>();

export class AnchoredVolumeProfileTool extends BaseDrawingTool<AVPOptions> {
  readonly id: DrawingToolType = 'anchored_volume_profile';
  readonly name: string = 'Anchored Volume Profile';
  readonly minAnchors: number = 1;
  readonly maxAnchors: number = 1;

  getDefaultOptions(): AVPOptions {
    return {
      // Inputs Tab
      rowsLayout: 'number_of_rows',
      rowSize: 24,
      volume: 'up_down',
      valueAreaVolume: 70,

      // Style Tab
      showVolumeProfile: true,
      showValues: false,
      valuesColor: '#d1d4dc',
      widthPercent: 30,
      placement: 'right',

      // Volume Colors
      upVolumeColor: '#00bcd4',
      downVolumeColor: '#e91e63',
      valueAreaUpColor: '#00bcd4',
      valueAreaDownColor: '#e91e63',

      // Key Levels
      showVAH: false,
      vahColor: '#089981',
      vahWidth: 1,
      vahStyle: 'solid',

      showVAL: false,
      valColor: '#089981',
      valWidth: 1,
      valStyle: 'solid',

      showPOC: true,
      pocColor: '#000000',
      pocWidth: 1,
      pocStyle: 'solid',

      showDevelopingPOC: false,
      devPocColor: '#ff9800',
      devPocWidth: 1,
      devPocStyle: 'solid',

      showDevelopingVA: false,
      devVaColor: '#00bcd4',
      devVaWidth: 1,
      devVaStyle: 'solid',

      // Histogram Box
      histogramBoxColor: 'transparent',

      // Price & Status Line Labels
      showPriceLabels: true,
      valuesInStatusLine: true,
      showTimeLabel: true,

      // Visibility Tab
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
   * Memoized profile computation on drawing entity.
   */
  public getOrComputeProfile(
    drawing: UserDrawing,
    candles: Candle[],
    opts?: AVPOptions
  ): VolumeProfileData | null {
    if (!drawing.anchors || drawing.anchors.length < 1 || !candles || candles.length === 0) {
      return null;
    }

    const effectiveOpts = opts || (drawing.options as AVPOptions) || this.getDefaultOptions();
    const anchorsKey = drawing.anchors.map((a) => `${a.time}_${a.price}`).join(';');
    const candlesLen = candles.length;
    const lastCandle = candles[candlesLen - 1];
    const lastCandleTime = lastCandle ? lastCandle.time : 0;
    const lastCandleHigh = lastCandle ? lastCandle.high : 0;
    const lastCandleLow = lastCandle ? lastCandle.low : 0;
    const lastCandleClose = lastCandle ? lastCandle.close : 0;
    const lastCandleVolume = lastCandle ? (lastCandle.volume ?? 0) : 0;
    const optsKey = `${drawing.symbol || ''}_${effectiveOpts.rowsLayout}_${effectiveOpts.rowSize}_${effectiveOpts.valueAreaVolume}_${effectiveOpts.volume}_${effectiveOpts.showDevelopingPOC}_${effectiveOpts.showDevelopingVA}`;

    const cached = avpCache.get(drawing);
    if (
      cached &&
      cached.anchorsKey === anchorsKey &&
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

    const data = this.computeProfile(drawing.anchors, candles, effectiveOpts, drawing.symbol);
    avpCache.set(drawing, {
      anchorsKey,
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
   * Computes the volume profile histogram, POC, and Value Area (VAH & VAL)
   * from candle data starting at anchor.time extending to the latest live candle.
   */
  public computeProfile(
    anchors: LogicalAnchor[],
    candles: Candle[],
    opts: AVPOptions,
    symbol?: string
  ): VolumeProfileData | null {
    if (!anchors || anchors.length < 1 || !candles || candles.length === 0) {
      return null;
    }

    const effectiveStartTime = anchors[0].time;
    const effectiveEndTime = candles[candles.length - 1].time;

    // Filter candles within range (from anchor time to live candle)
    let rangeCandles = candles.filter((c) => c.time >= effectiveStartTime);

    if (rangeCandles.length === 0) {
      let closest = candles[0];
      let minDiff = Math.abs(candles[0].time - effectiveStartTime);
      for (let i = 1; i < candles.length; i++) {
        const diff = Math.abs(candles[i].time - effectiveStartTime);
        if (diff < minDiff) {
          minDiff = diff;
          closest = candles[i];
        }
      }
      rangeCandles = [closest];
    }

    return computeVolumeProfileFromCandles(
      rangeCandles,
      effectiveStartTime,
      effectiveEndTime,
      opts,
      symbol
    );
  }

  getHandles(drawing: UserDrawing, ctx: DrawingRenderContext): DrawingHandle[] {
    const handles: DrawingHandle[] = [];
    if (!drawing.anchors || drawing.anchors.length < 1) return handles;

    const p0 = ctx.anchorToCoordinates(drawing.anchors[0]);
    if (!p0) return handles;

    // Single anchor point handle
    handles.push({
      x: p0.x,
      y: p0.y,
      index: 0,
      type: 'vertex',
      cursor: 'grab',
    });

    return handles;
  }

  render(ctx: DrawingRenderContext, drawing: UserDrawing): void {
    if (!drawing.anchors || drawing.anchors.length < 1) return;

    const timeScale = ctx.chart.timeScale();
    const series = ctx.series;
    const opts: AVPOptions = (drawing.options as AVPOptions) || this.getDefaultOptions();
    const c2d = ctx.ctx;

    const p0 = ctx.anchorToCoordinates(drawing.anchors[0]);
    if (!p0) return;

    const xLeft = p0.x;

    // Find xRight (latest live candle)
    const lastCandle = ctx.candles && ctx.candles.length > 0 ? ctx.candles[ctx.candles.length - 1] : null;
    let xLive: number | null = null;
    if (lastCandle) {
      xLive = ctx.anchorToCoordinates({ time: lastCandle.time, price: drawing.anchors[0].price })?.x ?? null;
      if (xLive === null) {
        try {
          xLive = timeScale.timeToCoordinate(lastCandle.time as any);
        } catch {}
      }
    }
    const xRight = xLive !== null && !isNaN(xLive) ? Math.max(xLeft + 10, xLive) : ctx.width;
    const boxWidth = Math.max(1, xRight - xLeft);

    const profile = this.getOrComputeProfile(drawing, ctx.candles, opts);
    if (!profile) return;

    c2d.save();

    const applyDash = (style?: 'solid' | 'dashed' | 'dotted') => {
      if (style === 'dashed') c2d.setLineDash([5, 5]);
      else if (style === 'dotted') c2d.setLineDash([2, 4]);
      else c2d.setLineDash([]);
    };

    // Calculate box top and bottom from minPrice and maxPrice
    const yMinBox = series.priceToCoordinate(profile.maxPrice);
    const yMaxBox = series.priceToCoordinate(profile.minPrice);
    const boxTop = yMinBox !== null && yMaxBox !== null ? Math.min(yMinBox, yMaxBox) : 0;
    const boxBottom = yMinBox !== null && yMaxBox !== null ? Math.max(yMinBox, yMaxBox) : ctx.height;
    const boxHeight = Math.max(2, boxBottom - boxTop);

    // 1. Shaded Background Box (only if user explicitly configured a non-transparent color)
    const boxColor = opts.histogramBoxColor;
    if (boxColor && boxColor !== 'transparent' && boxColor !== 'rgba(0, 0, 0, 0)') {
      c2d.fillStyle = boxColor;
      c2d.fillRect(xLeft, boxTop, boxWidth, boxHeight);
    }

    // 2. Volume Profile Horizontal Bars
    if (opts.showVolumeProfile !== false && profile.bins.length > 0) {
      const widthPercent = typeof opts.widthPercent === 'number' ? opts.widthPercent : 30;
      // Consistent Profile sizing: use total chart width rather than time-distance boxWidth
      const maxBarWidth = ctx.width * (widthPercent / 100);
      const isRight = (opts.placement || 'right') === 'right';
      const volumeMode = opts.volume || 'up_down';

      let maxVol = 0;
      for (const b of profile.bins) {
        if (b.totalVolume > maxVol) maxVol = b.totalVolume;
      }

      if (maxVol > 0) {
        for (const bin of profile.bins) {
          if (bin.totalVolume <= 0) continue;

          const yTop = series.priceToCoordinate(bin.high);
          const yBottom = series.priceToCoordinate(bin.low);
          if (yTop === null || yBottom === null) continue;

          const barY = Math.min(yTop, yBottom);
          const barHeight = Math.max(1, Math.abs(yBottom - yTop) - 0.5);
          const barWidth = (bin.totalVolume / maxVol) * maxBarWidth;

          if (volumeMode === 'total') {
            // Total Volume Mode: Single uniform bar per row (Image 3)
            // In VA: Solid saturated valueAreaUpColor
            // Outside VA: Muted upVolumeColor (~55% opacity)
            const col = bin.inValueArea
              ? (opts.valueAreaUpColor || '#00bcd4')
              : toAlpha(opts.upVolumeColor || '#00bcd4', 0.55);

            c2d.fillStyle = col;
            if (isRight) {
              c2d.fillRect(ctx.width - barWidth, barY, barWidth, barHeight);
            } else {
              c2d.fillRect(0, barY, barWidth, barHeight);
            }
          } else if (volumeMode === 'delta') {
            // Delta Mode (Image 4):
            // Net Delta = upVolume - downVolume
            // Total volume is shown as a translucent background bar.
            // Saturated foreground bar at alignment edge represents |Delta|.
            const delta = bin.upVolume - bin.downVolume;
            const absDelta = Math.abs(delta);
            const deltaWidth = (absDelta / maxVol) * maxBarWidth;

            const isUpDelta = delta >= 0;
            const primaryColor = isUpDelta
              ? (bin.inValueArea ? (opts.valueAreaUpColor || '#00bcd4') : (opts.upVolumeColor || '#00bcd4'))
              : (bin.inValueArea ? (opts.valueAreaDownColor || '#e91e63') : (opts.downVolumeColor || '#e91e63'));

            const bgCol = toAlpha(primaryColor, bin.inValueArea ? 0.38 : 0.18);
            const fgCol = bin.inValueArea ? primaryColor : toAlpha(primaryColor, 0.60);

            if (isRight) {
              // Right-aligned:
              // Translucent total volume bar
              c2d.fillStyle = bgCol;
              c2d.fillRect(ctx.width - barWidth, barY, barWidth, barHeight);
              // Saturated delta bar anchored at right edge
              if (deltaWidth > 0) {
                c2d.fillStyle = fgCol;
                c2d.fillRect(ctx.width - deltaWidth, barY, deltaWidth, barHeight);
              }
            } else {
              // Left-aligned:
              // Translucent total volume bar
              c2d.fillStyle = bgCol;
              c2d.fillRect(0, barY, barWidth, barHeight);
              // Saturated delta bar anchored at left edge
              if (deltaWidth > 0) {
                c2d.fillStyle = fgCol;
                c2d.fillRect(0, barY, deltaWidth, barHeight);
              }
            }
          } else {
            // Up/Down Mode: Stacked buy & sell volume (Image 2)
            const upRatio = bin.totalVolume > 0 ? bin.upVolume / bin.totalVolume : 0.5;
            const upWidth = barWidth * upRatio;
            const downWidth = barWidth - upWidth;

            const upCol = bin.inValueArea
              ? (opts.valueAreaUpColor || '#00bcd4')
              : toAlpha(opts.upVolumeColor || '#00bcd4', 0.55);
            const downCol = bin.inValueArea
              ? (opts.valueAreaDownColor || '#e91e63')
              : toAlpha(opts.downVolumeColor || '#e91e63', 0.55);

            if (isRight) {
              // Right-aligned to right edge of chart pane (ctx.width)
              // Up volume closest to the right edge, Down volume extending leftward
              const barRightX = ctx.width;
              if (upWidth > 0) {
                c2d.fillStyle = upCol;
                c2d.fillRect(barRightX - upWidth, barY, upWidth, barHeight);
              }
              if (downWidth > 0) {
                c2d.fillStyle = downCol;
                c2d.fillRect(barRightX - upWidth - downWidth, barY, downWidth, barHeight);
              }
            } else {
              // Left-aligned directly to the left edge of the chart (x = 0)
              const barLeftX = 0;
              if (upWidth > 0) {
                c2d.fillStyle = upCol;
                c2d.fillRect(barLeftX, barY, upWidth, barHeight);
              }
              if (downWidth > 0) {
                c2d.fillStyle = downCol;
                c2d.fillRect(barLeftX + upWidth, barY, downWidth, barHeight);
              }
            }
          }

          // Optional Values text label on bar
          if (opts.showValues) {
            c2d.font = '10px JetBrains Mono, monospace';
            c2d.fillStyle = opts.valuesColor || '#d1d4dc';
            c2d.textAlign = isRight ? 'right' : 'left';
            c2d.textBaseline = 'middle';
            let labelText: string;
            if (volumeMode === 'delta') {
              const delta = bin.upVolume - bin.downVolume;
              labelText = `${delta >= 0 ? '+' : ''}${Math.round(delta).toLocaleString()}`;
            } else {
              labelText = Math.round(bin.totalVolume).toLocaleString();
            }
            const textX = isRight ? ctx.width - barWidth - 4 : barWidth + 4;
            c2d.fillText(labelText, textX, barY + barHeight / 2);
          }
        }
      }
    }

    // Horizontal levels start point: drawn across the volume profile histogram area
    const isRightPlacement = (opts.placement || 'right') === 'right';
    const widthPercent = typeof opts.widthPercent === 'number' ? opts.widthPercent : 30;
    const maxBarWidth = ctx.width * (widthPercent / 100);
    const lineStartX = isRightPlacement ? ctx.width - maxBarWidth : 0;
    const lineEndX = isRightPlacement ? ctx.width : maxBarWidth;

    // 3. Point of Control (POC) Line: drawn across the profile histogram
    if (opts.showPOC !== false) {
      const yPOC = series.priceToCoordinate(profile.pocPrice);
      if (yPOC !== null) {
        c2d.beginPath();
        applyDash(opts.pocStyle);
        c2d.strokeStyle = opts.pocColor || '#000000';
        c2d.lineWidth = opts.pocWidth || 1;
        c2d.moveTo(lineStartX, yPOC);
        c2d.lineTo(lineEndX, yPOC);
        c2d.stroke();
      }
    }

    // 4. Value Area High (VAH) Line
    if (opts.showVAH) {
      const yVAH = series.priceToCoordinate(profile.vahPrice);
      if (yVAH !== null) {
        c2d.beginPath();
        applyDash(opts.vahStyle);
        c2d.strokeStyle = opts.vahColor || '#089981';
        c2d.lineWidth = opts.vahWidth || 1;
        c2d.moveTo(lineStartX, yVAH);
        c2d.lineTo(lineEndX, yVAH);
        c2d.stroke();
      }
    }

    // 5. Value Area Low (VAL) Line
    if (opts.showVAL) {
      const yVAL = series.priceToCoordinate(profile.valPrice);
      if (yVAL !== null) {
        c2d.beginPath();
        applyDash(opts.valStyle);
        c2d.strokeStyle = opts.valColor || '#089981';
        c2d.lineWidth = opts.valWidth || 1;
        c2d.moveTo(lineStartX, yVAL);
        c2d.lineTo(lineEndX, yVAL);
        c2d.stroke();
      }
    }

    // 6. Developing POC Stepped Line
    if (opts.showDevelopingPOC && profile.devPOC && profile.devPOC.length > 1) {
      c2d.beginPath();
      applyDash(opts.devPocStyle);
      c2d.strokeStyle = opts.devPocColor || '#ff9800';
      c2d.lineWidth = opts.devPocWidth || 1;

      for (let i = 0; i < profile.devPOC.length; i++) {
        const pt = profile.devPOC[i];
        const px = timeScale.timeToCoordinate(pt.time as any);
        const py = series.priceToCoordinate(pt.price);
        if (px === null || py === null) continue;

        if (i === 0) c2d.moveTo(px, py);
        else {
          const prevPt = profile.devPOC[i - 1];
          const prevY = series.priceToCoordinate(prevPt.price) ?? py;
          c2d.lineTo(px, prevY);
          c2d.lineTo(px, py);
        }
      }
      c2d.stroke();
    }

    // 7. Developing VA Lines
    if (opts.showDevelopingVA && profile.devVAH && profile.devVAL && profile.devVAH.length > 1) {
      c2d.beginPath();
      applyDash(opts.devVaStyle);
      c2d.strokeStyle = opts.devVaColor || '#00bcd4';
      c2d.lineWidth = opts.devVaWidth || 1;

      for (let i = 0; i < profile.devVAH.length; i++) {
        const pt = profile.devVAH[i];
        const px = timeScale.timeToCoordinate(pt.time as any);
        const py = series.priceToCoordinate(pt.price);
        if (px === null || py === null) continue;
        if (i === 0) c2d.moveTo(px, py);
        else c2d.lineTo(px, py);
      }
      c2d.stroke();

      c2d.beginPath();
      for (let i = 0; i < profile.devVAL.length; i++) {
        const pt = profile.devVAL[i];
        const px = timeScale.timeToCoordinate(pt.time as any);
        const py = series.priceToCoordinate(pt.price);
        if (px === null || py === null) continue;
        if (i === 0) c2d.moveTo(px, py);
        else c2d.lineTo(px, py);
      }
      c2d.stroke();
    }

    // 8. Anchor Handle: Render circular handle at (p0.x, p0.y) strictly when selected
    if (ctx.isSelected) {
      c2d.beginPath();
      c2d.arc(p0.x, p0.y, 6, 0, Math.PI * 2);
      c2d.fillStyle = '#ffffff';
      c2d.fill();
      c2d.lineWidth = 2;
      c2d.strokeStyle = '#2962ff';
      c2d.setLineDash([]);
      c2d.stroke();
    }

    c2d.restore();
  }

  /**
   * Renders the pro time scale badge directly on the bottom time scale axis (unclipped pass).
   */
  renderTimeLabel(ctx: DrawingRenderContext, drawing: UserDrawing): void {
    const opts: AVPOptions = (drawing.options as AVPOptions) || this.getDefaultOptions();
    if (opts.showTimeLabel === false || !ctx.isSelected) return;
    if (!drawing.anchors || drawing.anchors.length < 1) return;

    const p0 = ctx.anchorToCoordinates(drawing.anchors[0]);
    if (!p0) return;

    const text = BaseDrawingTool.formatTimeScaleLabel(drawing.anchors[0].time, ctx.timezone || 'UTC');
    BaseDrawingTool.drawTimeScaleBadge(ctx.ctx, text, p0.x, ctx.height + 13);
  }

  hitTest(
    drawing: UserDrawing,
    px: number,
    py: number,
    ctx: DrawingRenderContext
  ): HitTestResult | null {
    if (!drawing.anchors || drawing.anchors.length < 1) return null;

    const series = ctx.series;
    const opts: AVPOptions = (drawing.options as AVPOptions) || this.getDefaultOptions();

    const p0 = ctx.anchorToCoordinates(drawing.anchors[0]);
    if (!p0) return null;

    // 1. Hit-test vertex handle at anchor point (radius <= 16px)
    if (Math.hypot(px - p0.x, py - p0.y) <= 16) {
      return { hit: true, handleIndex: 0, cursor: 'grab' };
    }

    const profile = this.getOrComputeProfile(drawing, ctx.candles, opts);
    let boxTop = p0.y - 50;
    let boxBottom = p0.y + 50;

    if (profile && series) {
      try {
        const yMinBox = series.priceToCoordinate(profile.maxPrice);
        const yMaxBox = series.priceToCoordinate(profile.minPrice);
        if (yMinBox !== null && yMaxBox !== null) {
          boxTop = Math.min(yMinBox, yMaxBox);
          boxBottom = Math.max(yMinBox, yMaxBox);
        }
      } catch {}
    }

    // 2. Hit-test strictly inside volume histogram profile area (right or left edge)
    const isRightPlacement = (opts.placement || 'right') === 'right';
    const widthPercent = typeof opts.widthPercent === 'number' ? opts.widthPercent : 30;
    const maxBarWidth = ctx.width * (widthPercent / 100);

    if (isRightPlacement) {
      const profileLeft = ctx.width - maxBarWidth - 8;
      if (px >= profileLeft && px <= ctx.width + 4 && py >= boxTop - 4 && py <= boxBottom + 4) {
        return { hit: true, handleIndex: -1, cursor: 'pointer' };
      }
    } else {
      const profileRight = maxBarWidth + 8;
      if (px >= 0 && px <= profileRight && py >= boxTop - 4 && py <= boxBottom + 4) {
        return { hit: true, handleIndex: -1, cursor: 'pointer' };
      }
    }

    return null;
  }
}
