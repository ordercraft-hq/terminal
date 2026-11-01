import { BaseDrawingTool } from '../BaseDrawingTool';
import type {
  DrawingToolType,
  UserDrawing,
  DrawingRenderContext,
  DrawingHandle,
  HitTestResult,
  FRVPOptions,
  LogicalAnchor,
} from '../types';
import type { Candle } from '../../transport/client';

export interface VolumeProfileBin {
  low: number;
  high: number;
  mid: number;
  upVolume: number;
  downVolume: number;
  totalVolume: number;
  inValueArea: boolean;
}

export interface VolumeProfileData {
  bins: VolumeProfileBin[];
  pocPrice: number;
  pocVolume: number;
  vahPrice: number;
  valPrice: number;
  totalVolume: number;
  minPrice: number;
  maxPrice: number;
  effectiveStartTime: number;
  effectiveEndTime: number;
  devPOC?: Array<{ time: number; price: number }>;
  devVAH?: Array<{ time: number; price: number }>;
  devVAL?: Array<{ time: number; price: number }>;
}

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

export class FixedRangeVolumeProfileTool extends BaseDrawingTool<FRVPOptions> {
  readonly id: DrawingToolType = 'fixed_range_volume_profile';
  readonly name: string = 'Fixed Range Volume Profile';
  readonly minAnchors: number = 2;
  readonly maxAnchors: number = 2;

  getDefaultOptions(): FRVPOptions {
    return {
      // Inputs Tab (FRVP settings)
      rowsLayout: 'number_of_rows',
      rowSize: 24,
      volume: 'up_down',
      valueAreaVolume: 70,
      extendRight: false,

      // Style Tab
      showVolumeProfile: true,
      showValues: false,
      valuesColor: '#d1d4dc',
      widthPercent: 30,
      placement: 'left',

      // Volume Colors
      upVolumeColor: '#1e88e5',
      downVolumeColor: '#c2185b',
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
      pocColor: '#f23645',
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
      histogramBoxColor: 'rgba(41, 98, 255, 0.08)',

      // Guidelines & Boundary Lines
      lineColor: '#787b86',
      lineWidth: 1,
      showPriceLabels: false,

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
   * from candle data between the two anchors (or extending to live candle).
   */
  public computeProfile(
    anchors: LogicalAnchor[],
    candles: Candle[],
    opts: FRVPOptions
  ): VolumeProfileData | null {
    if (!anchors || anchors.length < 2 || !candles || candles.length === 0) {
      return null;
    }

    const t1 = anchors[0].time;
    const t2 = anchors[1].time;
    const effectiveStartTime = Math.min(t1, t2);

    let effectiveEndTime = Math.max(t1, t2);
    if (opts.extendRight && candles.length > 0) {
      const liveCandleTime = candles[candles.length - 1].time;
      effectiveEndTime = Math.max(effectiveStartTime, liveCandleTime);
    }

    // Filter candles within range
    let rangeCandles = candles.filter(
      (c) => c.time >= effectiveStartTime && c.time <= effectiveEndTime
    );

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

        // Find current step POC
        let stepMaxVol = -1;
        let stepPocK = 0;
        for (let k = 0; k < devBins.length; k++) {
          if (devBins[k].totalVolume > stepMaxVol) {
            stepMaxVol = devBins[k].totalVolume;
            stepPocK = k;
          }
        }
        devPOC.push({ time: c.time, price: devBins[stepPocK].mid });

        // Step VA
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
    if (!drawing.anchors || drawing.anchors.length < 2) return handles;

    const opts: FRVPOptions = (drawing.options as FRVPOptions) || this.getDefaultOptions();
    const profile = this.computeProfile(drawing.anchors, ctx.candles, opts);

    const p1 = ctx.anchorToCoordinates(drawing.anchors[0]);
    let effectiveAnchor2 = drawing.anchors[1];
    if (opts.extendRight && ctx.candles.length > 0) {
      effectiveAnchor2 = {
        time: ctx.candles[ctx.candles.length - 1].time,
        price: drawing.anchors[1].price,
      };
    }
    const p2 = ctx.anchorToCoordinates(effectiveAnchor2);

    if (!p1 || !p2) return handles;

    const xLeft = Math.min(p1.x, p2.x);
    const xRight = Math.max(p1.x, p2.x);

    let boxTop = Math.min(p1.y, p2.y);
    let boxBottom = Math.max(p1.y, p2.y);

    if (profile && ctx.series) {
      try {
        const yMax = ctx.series.priceToCoordinate(profile.maxPrice);
        const yMin = ctx.series.priceToCoordinate(profile.minPrice);
        if (yMax !== null && yMin !== null) {
          boxTop = Math.min(yMax, yMin);
          boxBottom = Math.max(yMax, yMin);
        }
      } catch {}
    }

    // Top-Left handle (Anchor 0: earlier time, highest price)
    handles.push({
      x: xLeft,
      y: boxTop,
      index: 0,
      type: 'vertex',
      cursor: 'grab',
    });

    // Bottom-Right handle (Anchor 1: later time, lowest price)
    handles.push({
      x: xRight,
      y: boxBottom,
      index: 1,
      type: 'vertex',
      cursor: 'grab',
    });

    return handles;
  }

  render(ctx: DrawingRenderContext, drawing: UserDrawing): void {
    if (!drawing.anchors || drawing.anchors.length < 2) return;

    const timeScale = ctx.chart.timeScale();
    const series = ctx.series;
    const opts: FRVPOptions = (drawing.options as FRVPOptions) || this.getDefaultOptions();
    const c2d = ctx.ctx;

    const p1 = ctx.anchorToCoordinates(drawing.anchors[0]);
    let effectiveAnchor2 = drawing.anchors[1];
    if (opts.extendRight && ctx.candles.length > 0) {
      effectiveAnchor2 = {
        time: ctx.candles[ctx.candles.length - 1].time,
        price: drawing.anchors[1].price,
      };
    }
    const p2 = ctx.anchorToCoordinates(effectiveAnchor2);

    if (!p1 || !p2) return;

    const x1 = p1.x;
    const y1 = p1.y;
    const x2 = p2.x;
    const y2 = p2.y;

    const xLeft = Math.min(x1, x2);
    const xRight = Math.max(x1, x2);
    const boxWidth = Math.max(1, xRight - xLeft);

    c2d.save();

    // 1. DRAFTING GUIDELINES
    if (ctx.isDraft) {
      // Full-height vertical boundary lines at x1 and x2
      c2d.beginPath();
      c2d.strokeStyle = '#787b86';
      c2d.lineWidth = 1;
      c2d.setLineDash([]);
      c2d.moveTo(x1, 0);
      c2d.lineTo(x1, ctx.height);
      c2d.moveTo(x2, 0);
      c2d.lineTo(x2, ctx.height);
      c2d.stroke();

      // Horizontal dotted cross-level line at Anchor 1 price (y1)
      c2d.beginPath();
      c2d.strokeStyle = 'rgba(120, 123, 134, 0.7)';
      c2d.lineWidth = 1;
      c2d.setLineDash([2, 3]);
      c2d.moveTo(0, y1);
      c2d.lineTo(ctx.width, y1);
      c2d.stroke();
      c2d.setLineDash([]);

      // Diagonal guideline connecting (x1, y1) to (x2, y2)
      c2d.beginPath();
      c2d.strokeStyle = 'rgba(120, 123, 134, 0.8)';
      c2d.lineWidth = 1;
      c2d.setLineDash([]);
      c2d.moveTo(x1, y1);
      c2d.lineTo(x2, y2);
      c2d.stroke();

      // Anchor 2 cursor handle
      c2d.beginPath();
      c2d.arc(x2, y2, 4.5, 0, Math.PI * 2);
      c2d.fillStyle = '#ffffff';
      c2d.fill();
      c2d.lineWidth = 2;
      c2d.strokeStyle = '#2962ff';
      c2d.stroke();
    }

    const profile = this.computeProfile(drawing.anchors, ctx.candles, opts);
    if (!profile) {
      c2d.restore();
      return;
    }

    const applyDash = (style?: 'solid' | 'dashed' | 'dotted') => {
      if (style === 'dashed') c2d.setLineDash([5, 5]);
      else if (style === 'dotted') c2d.setLineDash([2, 4]);
      else c2d.setLineDash([]);
    };

    // Calculate box top and bottom in coordinate space
    const yMinBox = series.priceToCoordinate(profile.maxPrice);
    const yMaxBox = series.priceToCoordinate(profile.minPrice);
    const boxTop = yMinBox !== null && yMaxBox !== null ? Math.min(yMinBox, yMaxBox) : Math.min(y1, y2);
    const boxHeight = yMinBox !== null && yMaxBox !== null ? Math.max(2, Math.abs(yMaxBox - yMinBox)) : Math.abs(y2 - y1);

    // 2. Histogram Box Shaded Background (matching reference image)
    const boxColor = opts.histogramBoxColor || 'rgba(41, 98, 255, 0.08)';
    if (boxColor !== 'transparent') {
      c2d.fillStyle = boxColor;
      c2d.fillRect(xLeft, boxTop, boxWidth, boxHeight);
    }

    // If selected or hovered, render subtle boundary outline around the box
    if (ctx.isSelected || ctx.isHovered) {
      c2d.strokeStyle = ctx.isSelected ? 'rgba(41, 98, 255, 0.6)' : 'rgba(120, 123, 134, 0.3)';
      c2d.lineWidth = 1;
      c2d.setLineDash([]);
      c2d.strokeRect(xLeft, boxTop, boxWidth, boxHeight);
    }

    // 4. Volume Profile Horizontal Bars
    if (opts.showVolumeProfile !== false && profile.bins.length > 0) {
      const widthPercent = typeof opts.widthPercent === 'number' ? opts.widthPercent : 30;
      const maxBarWidth = boxWidth * (widthPercent / 100);
      const isLeft = (opts.placement || 'left') === 'left';
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
            if (isLeft) {
              c2d.fillRect(xLeft, barY, barWidth, barHeight);
            } else {
              c2d.fillRect(xRight - barWidth, barY, barWidth, barHeight);
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

            if (isLeft) {
              // Left-aligned:
              // Translucent total volume bar
              c2d.fillStyle = bgCol;
              c2d.fillRect(xLeft, barY, barWidth, barHeight);
              // Saturated delta bar anchored at left edge
              if (deltaWidth > 0) {
                c2d.fillStyle = fgCol;
                c2d.fillRect(xLeft, barY, deltaWidth, barHeight);
              }
            } else {
              // Right-aligned:
              // Translucent total volume bar
              c2d.fillStyle = bgCol;
              c2d.fillRect(xRight - barWidth, barY, barWidth, barHeight);
              // Saturated delta bar anchored at right edge
              if (deltaWidth > 0) {
                c2d.fillStyle = fgCol;
                c2d.fillRect(xRight - deltaWidth, barY, deltaWidth, barHeight);
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

            if (isLeft) {
              // Left-aligned: Up volume closest to left edge, then Down volume
              if (upWidth > 0) {
                c2d.fillStyle = upCol;
                c2d.fillRect(xLeft, barY, upWidth, barHeight);
              }
              if (downWidth > 0) {
                c2d.fillStyle = downCol;
                c2d.fillRect(xLeft + upWidth, barY, downWidth, barHeight);
              }
            } else {
              // Right-aligned: Up volume closest to right edge, then Down volume
              if (upWidth > 0) {
                c2d.fillStyle = upCol;
                c2d.fillRect(xRight - upWidth, barY, upWidth, barHeight);
              }
              if (downWidth > 0) {
                c2d.fillStyle = downCol;
                c2d.fillRect(xRight - upWidth - downWidth, barY, downWidth, barHeight);
              }
            }
          }

          // Optional Values text label on bar
          if (opts.showValues) {
            c2d.font = '10px JetBrains Mono, monospace';
            c2d.fillStyle = opts.valuesColor || '#d1d4dc';
            c2d.textAlign = isLeft ? 'left' : 'right';
            c2d.textBaseline = 'middle';
            let labelText: string;
            if (volumeMode === 'delta') {
              const delta = bin.upVolume - bin.downVolume;
              labelText = `${delta >= 0 ? '+' : ''}${Math.round(delta).toLocaleString()}`;
            } else {
              labelText = Math.round(bin.totalVolume).toLocaleString();
            }
            const textX = isLeft ? xLeft + barWidth + 4 : xRight - barWidth - 4;
            c2d.fillText(labelText, textX, barY + barHeight / 2);
          }
        }
      }
    }

    // 5. Point of Control (POC) Line
    if (opts.showPOC !== false) {
      const yPOC = series.priceToCoordinate(profile.pocPrice);
      if (yPOC !== null) {
        c2d.beginPath();
        applyDash(opts.pocStyle);
        c2d.strokeStyle = opts.pocColor || '#f23645';
        c2d.lineWidth = opts.pocWidth || 1;
        c2d.moveTo(xLeft, yPOC);
        c2d.lineTo(xRight, yPOC);
        c2d.stroke();
      }
    }

    // 6. Value Area High (VAH) Line
    if (opts.showVAH) {
      const yVAH = series.priceToCoordinate(profile.vahPrice);
      if (yVAH !== null) {
        c2d.beginPath();
        applyDash(opts.vahStyle);
        c2d.strokeStyle = opts.vahColor || '#089981';
        c2d.lineWidth = opts.vahWidth || 1;
        c2d.moveTo(xLeft, yVAH);
        c2d.lineTo(xRight, yVAH);
        c2d.stroke();
      }
    }

    // 7. Value Area Low (VAL) Line
    if (opts.showVAL) {
      const yVAL = series.priceToCoordinate(profile.valPrice);
      if (yVAL !== null) {
        c2d.beginPath();
        applyDash(opts.valStyle);
        c2d.strokeStyle = opts.valColor || '#089981';
        c2d.lineWidth = opts.valWidth || 1;
        c2d.moveTo(xLeft, yVAL);
        c2d.lineTo(xRight, yVAL);
        c2d.stroke();
      }
    }

    // 8. Developing POC Stepped Line
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
          // Stepped line
          const prevPt = profile.devPOC[i - 1];
          const prevY = series.priceToCoordinate(prevPt.price) ?? py;
          c2d.lineTo(px, prevY);
          c2d.lineTo(px, py);
        }
      }
      c2d.stroke();
    }

    // 9. Developing VA Lines
    if (opts.showDevelopingVA && profile.devVAH && profile.devVAL && profile.devVAH.length > 1) {
      c2d.beginPath();
      applyDash(opts.devVaStyle);
      c2d.strokeStyle = opts.devVaColor || '#00bcd4';
      c2d.lineWidth = opts.devVaWidth || 1;

      // Developing VAH
      for (let i = 0; i < profile.devVAH.length; i++) {
        const pt = profile.devVAH[i];
        const px = timeScale.timeToCoordinate(pt.time as any);
        const py = series.priceToCoordinate(pt.price);
        if (px === null || py === null) continue;
        if (i === 0) c2d.moveTo(px, py);
        else c2d.lineTo(px, py);
      }
      c2d.stroke();

      // Developing VAL
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

    // 10. Anchor Vertex Handles: ONLY visible when selected (and not drafting)
    if (ctx.isSelected && !ctx.isDraft) {
      const renderHandle = (hx: number, hy: number) => {
        c2d.beginPath();
        c2d.arc(hx, hy, 8.5, 0, Math.PI * 2);
        c2d.fillStyle = 'rgba(41, 98, 255, 0.25)';
        c2d.fill();

        c2d.beginPath();
        c2d.arc(hx, hy, 4.5, 0, Math.PI * 2);
        c2d.fillStyle = '#ffffff';
        c2d.fill();
        c2d.lineWidth = 2;
        c2d.strokeStyle = '#2962ff';
        c2d.stroke();
      };

      renderHandle(x1, y1);
      renderHandle(x2, y2);
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

    const series = ctx.series;
    const opts: FRVPOptions = (drawing.options as FRVPOptions) || this.getDefaultOptions();

    const p1 = ctx.anchorToCoordinates(drawing.anchors[0]);
    let effectiveAnchor2 = drawing.anchors[1];
    if (opts.extendRight && ctx.candles.length > 0) {
      effectiveAnchor2 = {
        time: ctx.candles[ctx.candles.length - 1].time,
        price: drawing.anchors[1].price,
      };
    }
    const p2 = ctx.anchorToCoordinates(effectiveAnchor2);

    if (!p1 || !p2) return null;

    const xLeft = Math.min(p1.x, p2.x);
    const xRight = Math.max(p1.x, p2.x);

    const profile = this.computeProfile(drawing.anchors, ctx.candles, opts);
    let boxTop = Math.min(p1.y, p2.y);
    let boxBottom = Math.max(p1.y, p2.y);

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

    // 1. Hit-test vertex handles at Top-Left and Bottom-Right (radius <= 14px)
    if (Math.hypot(px - xLeft, py - boxTop) <= 14) {
      return { hit: true, handleIndex: 0, cursor: 'grab' };
    }
    if (Math.hypot(px - xRight, py - boxBottom) <= 14) {
      return { hit: true, handleIndex: 1, cursor: 'grab' };
    }

    // 2. Hit-test inside profile bounding box
    if (px >= xLeft - 4 && px <= xRight + 4 && py >= boxTop - 4 && py <= boxBottom + 4) {
      return { hit: true, handleIndex: -1, cursor: 'pointer' };
    }

    return null;
  }
}
