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
import type { VolumeProfileBin, VolumeProfileData } from './FixedRangeVolumeProfileTool';

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
   * Computes the volume profile histogram, POC, and Value Area (VAH & VAL)
   * from candle data starting at anchor.time extending to the latest live candle.
   */
  public computeProfile(
    anchors: LogicalAnchor[],
    candles: Candle[],
    opts: AVPOptions
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

    // Determine min and max price across range
    let minPrice = rangeCandles[0].low;
    let maxPrice = rangeCandles[0].high;
    for (let i = 1; i < rangeCandles.length; i++) {
      const c = rangeCandles[i];
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    }

    if (maxPrice <= minPrice) {
      const delta = minPrice > 0 ? minPrice * 0.001 : 0.01;
      maxPrice += delta;
      minPrice -= delta;
    }

    const rowCount = Math.max(4, Math.min(200, opts.rowSize || 24));
    const priceStep = (maxPrice - minPrice) / rowCount;

    // Initialize bins
    const bins: VolumeProfileBin[] = [];
    for (let k = 0; k < rowCount; k++) {
      const low = minPrice + k * priceStep;
      const high = minPrice + (k + 1) * priceStep;
      bins.push({
        low,
        high,
        mid: (low + high) / 2,
        upVolume: 0,
        downVolume: 0,
        totalVolume: 0,
        inValueArea: false,
      });
    }

    // Distribute volume into bins
    let totalVolume = 0;

    for (const c of rangeCandles) {
      const vol = typeof c.volume === 'number' && c.volume > 0 ? c.volume : 1;
      const isUp = c.close >= c.open;
      const cLow = c.low;
      const cHigh = c.high;
      const span = Math.max(1e-9, cHigh - cLow);

      for (const bin of bins) {
        const overlap = Math.max(0, Math.min(cHigh, bin.high) - Math.max(cLow, bin.low));
        if (overlap > 0) {
          const frac = overlap / span;
          const v = vol * frac;
          if (isUp) {
            bin.upVolume += v;
          } else {
            bin.downVolume += v;
          }
          bin.totalVolume += v;
          totalVolume += v;
        }
      }
    }

    // Find Point of Control (POC)
    let maxBinVol = -1;
    let kPOC = 0;
    for (let k = 0; k < bins.length; k++) {
      if (bins[k].totalVolume > maxBinVol) {
        maxBinVol = bins[k].totalVolume;
        kPOC = k;
      }
    }

    const pocPrice = bins[kPOC].mid;
    const pocVolume = bins[kPOC].totalVolume;

    // Value Area Calculation (70% standard)
    const vaPercentage = typeof opts.valueAreaVolume === 'number' ? opts.valueAreaVolume : 70;
    const targetVAVolume = totalVolume * (vaPercentage / 100);

    bins[kPOC].inValueArea = true;
    let currentVAVolume = bins[kPOC].totalVolume;
    let upIdx = kPOC + 1;
    let downIdx = kPOC - 1;

    while (
      currentVAVolume < targetVAVolume &&
      (upIdx < bins.length || downIdx >= 0)
    ) {
      const volUp = upIdx < bins.length ? bins[upIdx].totalVolume : -1;
      const volDown = downIdx >= 0 ? bins[downIdx].totalVolume : -1;

      if (volUp >= volDown && volUp >= 0) {
        bins[upIdx].inValueArea = true;
        currentVAVolume += volUp;
        upIdx++;
      } else if (volDown >= 0) {
        bins[downIdx].inValueArea = true;
        currentVAVolume += volDown;
        downIdx--;
      } else {
        break;
      }
    }

    let vahPrice = pocPrice;
    for (let k = bins.length - 1; k >= 0; k--) {
      if (bins[k].inValueArea) {
        vahPrice = bins[k].high;
        break;
      }
    }

    let valPrice = pocPrice;
    for (let k = 0; k < bins.length; k++) {
      if (bins[k].inValueArea) {
        valPrice = bins[k].low;
        break;
      }
    }

    // Compute Developing POC & Developing VA if requested
    let devPOC: Array<{ time: number; price: number }> | undefined;
    let devVAH: Array<{ time: number; price: number }> | undefined;
    let devVAL: Array<{ time: number; price: number }> | undefined;

    if (opts.showDevelopingPOC || opts.showDevelopingVA) {
      devPOC = [];
      devVAH = [];
      devVAL = [];

      const devBins: VolumeProfileBin[] = bins.map((b) => ({
        ...b,
        upVolume: 0,
        downVolume: 0,
        totalVolume: 0,
        inValueArea: false,
      }));

      let cumDevVol = 0;

      for (const c of rangeCandles) {
        const vol = typeof c.volume === 'number' && c.volume > 0 ? c.volume : 1;
        const isUp = c.close >= c.open;
        const span = Math.max(1e-9, c.high - c.low);

        for (const bin of devBins) {
          const overlap = Math.max(0, Math.min(c.high, bin.high) - Math.max(c.low, bin.low));
          if (overlap > 0) {
            const v = vol * (overlap / span);
            if (isUp) bin.upVolume += v;
            else bin.downVolume += v;
            bin.totalVolume += v;
            cumDevVol += v;
          }
        }

        let stepMaxVol = -1;
        let stepPocK = 0;
        for (let k = 0; k < devBins.length; k++) {
          if (devBins[k].totalVolume > stepMaxVol) {
            stepMaxVol = devBins[k].totalVolume;
            stepPocK = k;
          }
        }
        devPOC.push({ time: c.time, price: devBins[stepPocK].mid });

        if (opts.showDevelopingVA) {
          for (const b of devBins) b.inValueArea = false;
          devBins[stepPocK].inValueArea = true;
          let stepVaVol = devBins[stepPocK].totalVolume;
          const targetStepVa = cumDevVol * (vaPercentage / 100);
          let sUp = stepPocK + 1;
          let sDown = stepPocK - 1;

          while (stepVaVol < targetStepVa && (sUp < devBins.length || sDown >= 0)) {
            const vUp = sUp < devBins.length ? devBins[sUp].totalVolume : -1;
            const vDown = sDown >= 0 ? devBins[sDown].totalVolume : -1;
            if (vUp >= vDown && vUp >= 0) {
              devBins[sUp].inValueArea = true;
              stepVaVol += vUp;
              sUp++;
            } else if (vDown >= 0) {
              devBins[sDown].inValueArea = true;
              stepVaVol += vDown;
              sDown--;
            } else break;
          }

          let sVah = devBins[stepPocK].mid;
          for (let k = devBins.length - 1; k >= 0; k--) {
            if (devBins[k].inValueArea) {
              sVah = devBins[k].high;
              break;
            }
          }
          let sVal = devBins[stepPocK].mid;
          for (let k = 0; k < devBins.length; k++) {
            if (devBins[k].inValueArea) {
              sVal = devBins[k].low;
              break;
            }
          }
          devVAH.push({ time: c.time, price: sVah });
          devVAL.push({ time: c.time, price: sVal });
        }
      }
    }

    return {
      bins,
      pocPrice,
      pocVolume,
      vahPrice,
      valPrice,
      totalVolume,
      minPrice,
      maxPrice,
      effectiveStartTime,
      effectiveEndTime,
      devPOC,
      devVAH,
      devVAL,
    };
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

    const profile = this.computeProfile(drawing.anchors, ctx.candles, opts);
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

    const profile = this.computeProfile(drawing.anchors, ctx.candles, opts);
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
