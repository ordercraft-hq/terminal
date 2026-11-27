import type { Candle } from '../../transport/client';
import type { FRVPRowsLayout } from '../types';
import { detectTickSizeFromCandles } from '../../utils/priceFormatting';
import type { VolumeProfileBin, VolumeProfileData } from '../tools/FixedRangeVolumeProfileTool';

export interface VolumeProfileCalcOptions {
  rowsLayout?: FRVPRowsLayout;
  rowSize?: number;
  valueAreaVolume?: number;
  showDevelopingPOC?: boolean;
  showDevelopingVA?: boolean;
}

/**
 * Computes volume profile bins, POC, Value Area (VAH/VAL), and optional developing curves
 * for a pre-filtered slice of candles.
 */
export function computeVolumeProfileFromCandles(
  rangeCandles: Candle[],
  effectiveStartTime: number,
  effectiveEndTime: number,
  opts: VolumeProfileCalcOptions,
  symbol?: string
): VolumeProfileData {
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

  let rowCount: number;
  if (opts.rowsLayout === 'ticks_per_row') {
    const ticksPerRow = Math.max(1, opts.rowSize || 24);
    const tickSize = detectTickSizeFromCandles(rangeCandles, symbol || '');
    const rowHeight = ticksPerRow * tickSize;
    const rawRows = rowHeight > 0 ? Math.round((maxPrice - minPrice) / rowHeight) : 24;
    rowCount = Math.max(4, Math.min(200, rawRows || 24));
  } else {
    rowCount = Math.max(4, Math.min(200, opts.rowSize || 24));
  }

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

  // Distribute volume into overlapping bins
  let totalVolume = 0;
  for (let i = 0; i < rangeCandles.length; i++) {
    const c = rangeCandles[i];
    const vol = typeof c.volume === 'number' && c.volume > 0 ? c.volume : 1;
    const isUp = c.close >= c.open;
    const cLow = c.low;
    const cHigh = c.high;
    const span = Math.max(1e-9, cHigh - cLow);

    const kStart = Math.max(0, Math.floor((cLow - minPrice) / priceStep) - 1);
    const kEnd = Math.min(rowCount - 1, Math.floor((cHigh - minPrice) / priceStep) + 1);

    for (let k = kStart; k <= kEnd; k++) {
      const bin = bins[k];
      const overlap = Math.max(0, Math.min(cHigh, bin.high) - Math.max(cLow, bin.low));
      if (overlap > 0) {
        const v = vol * (overlap / span);
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

  while (currentVAVolume < targetVAVolume && (upIdx < bins.length || downIdx >= 0)) {
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

  const vahPrice = bins[upIdx - 1].high;
  const valPrice = bins[downIdx + 1].low;

  // Compute Developing POC & Developing VA in O(candles * bins) using flat Float64Array
  let devPOC: Array<{ time: number; price: number }> | undefined;
  let devVAH: Array<{ time: number; price: number }> | undefined;
  let devVAL: Array<{ time: number; price: number }> | undefined;

  if (opts.showDevelopingPOC || opts.showDevelopingVA) {
    devPOC = [];
    devVAH = [];
    devVAL = [];

    const devTotals = new Float64Array(rowCount);
    let cumDevVol = 0;
    let stepPocK = 0;

    for (let i = 0; i < rangeCandles.length; i++) {
      const c = rangeCandles[i];
      const vol = typeof c.volume === 'number' && c.volume > 0 ? c.volume : 1;
      const span = Math.max(1e-9, c.high - c.low);

      const kStart = Math.max(0, Math.floor((c.low - minPrice) / priceStep) - 1);
      const kEnd = Math.min(rowCount - 1, Math.floor((c.high - minPrice) / priceStep) + 1);

      let stepMaxVol = devTotals[stepPocK];
      for (let k = kStart; k <= kEnd; k++) {
        const bin = bins[k];
        const overlap = Math.max(0, Math.min(c.high, bin.high) - Math.max(c.low, bin.low));
        if (overlap > 0) {
          const v = vol * (overlap / span);
          devTotals[k] += v;
          cumDevVol += v;
        }
      }

      // Re-evaluate stepPocK across updated range [kStart, kEnd] preserving lower-index tie-break
      stepMaxVol = devTotals[stepPocK];
      for (let k = kStart; k <= kEnd; k++) {
        const kv = devTotals[k];
        if (kv > stepMaxVol || (kv === stepMaxVol && k < stepPocK)) {
          stepMaxVol = kv;
          stepPocK = k;
        }
      }

      devPOC.push({ time: c.time, price: bins[stepPocK].mid });

      if (opts.showDevelopingVA) {
        let stepVaVol = devTotals[stepPocK];
        const targetStepVa = cumDevVol * (vaPercentage / 100);
        let sUp = stepPocK + 1;
        let sDown = stepPocK - 1;

        while (stepVaVol < targetStepVa && (sUp < rowCount || sDown >= 0)) {
          const vUp = sUp < rowCount ? devTotals[sUp] : -1;
          const vDown = sDown >= 0 ? devTotals[sDown] : -1;
          if (vUp >= vDown && vUp >= 0) {
            stepVaVol += vUp;
            sUp++;
          } else if (vDown >= 0) {
            stepVaVol += vDown;
            sDown--;
          } else {
            break;
          }
        }

        devVAH.push({ time: c.time, price: bins[sUp - 1].high });
        devVAL.push({ time: c.time, price: bins[sDown + 1].low });
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
