import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  Time,
  PrimitivePaneViewZOrder,
  SeriesType,
  ISeriesApi,
  IChartApiBase,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';

export interface PriceLevelVolume {
  price: number;
  bidVolume: number;
  askVolume: number;
  delta?: number;
  isPOC?: boolean;
  isImbalanceBuy?: boolean;
  isImbalanceSell?: boolean;
}

export interface FootprintBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  totalVolume: number;
  delta: number;
  pocPrice?: number;
  levels: PriceLevelVolume[];
}

export interface ImbalanceRule {
  id: string;
  name: string;
  enabled: boolean;
  imbalancePercent: number; // e.g. 300
  deltaFilter: number;       // e.g. 15
  deltaFilterEnabled: boolean;
  sellColor: string;         // e.g. '#d8b4e2'
  sellLineWidth: number;     // e.g. 1.0
  sellLineStyle: 'solid' | 'dashed' | 'dotted';
  sellDisplay: boolean;
  buyColor: string;          // e.g. '#8da9c4'
  buyLineWidth: number;      // e.g. 1.0
  buyLineStyle: 'solid' | 'dashed' | 'dotted';
  buyDisplay: boolean;
  createdAt?: number;
}

export interface ImbalanceGlobalSettings {
  skipZeroValues: boolean;
  showStackedImbalances: boolean;
  showMitigatedZones: boolean;
  drawZoneBorders: boolean;
  stackedMinLevels: number;
}

export interface FootprintPrimitiveOptions {
  visible: boolean;
  showText: boolean;
  showDelta: boolean;
  showPOC: boolean;
  showImbalance: boolean;
  pocColor: string;
  bidColor: string;
  askColor: string;
  imbalanceRatio: number;
  imbalanceRepresentation?: 'Highlight text' | 'Border box' | 'Box & text';
  imbalanceBuyColor?: string;
  imbalanceSellColor?: string;
  textColor?: string;
  zeroColor?: string;
  deltaPositiveColor?: string;
  deltaNegativeColor?: string;
  statsPosition?: 'Below' | 'Above' | 'As per candle';
  showStats?: boolean;
  showTotalVolume?: boolean;
  totalVolumeColor?: string;
  showDeltaPercent?: boolean;
  deltaPercentColor?: string;
  showMinMaxDelta?: boolean;
  minDeltaColor?: string;
  maxDeltaColor?: string;
  aggregateProfiles?: boolean;
  convertClusterToCandlesOnZoom?: boolean;
  includeEmptyLevels?: boolean;
  barVisualization?: 'None' | 'Bid x Ask' | 'Delta';
  candleZone?: 'Candle' | 'Bar' | 'None';
  candleZonePosition?: 'Footprint #1' | 'Behind' | 'Front';
  barMarginPx?: number;
  calculateFontSizeAuto?: boolean;
  maxValueCalculation?: 'Daily' | 'Session' | 'Visible range' | 'Bar';
  tickSize?: number;

  // Imbalances Tab Options (Multi-Rule & Stacked / Single Zones)
  imbalanceRules?: ImbalanceRule[];
  imbalanceGlobalSettings?: ImbalanceGlobalSettings;

  // Global Candle & Bar Coloring (synchronized with Chart Settings)
  candleUpColor?: string;
  candleDownColor?: string;
  candleBorderUpColor?: string;
  candleBorderDownColor?: string;
  candleWickUpColor?: string;
  candleWickDownColor?: string;
  showCandleBody?: boolean;
  showCandleBorders?: boolean;
  showCandleWick?: boolean;

  // Vol Profile Tab Options
  volProfileEnabled?: boolean;
  volProfileMode?: 'footprint' | 'profile' | 'both' | 'noCandle';
  volProfileTickInterval?: number;
  volProfileBarColor?: string;
  volProfilePocBarColor?: string;
  volProfilePocBarEnabled?: boolean;
  volProfileShowValueArea?: boolean;
  volProfileValueAreaPercent?: number;
  volProfileValueAreaBarColor?: string;
  volProfileValueAreaBarEnabled?: boolean;
}

const DEFAULT_OPTIONS: FootprintPrimitiveOptions = {
  visible: true,
  showText: true,
  showDelta: true,
  showPOC: true,
  showImbalance: true,
  pocColor: '#ffb700',
  bidColor: '#f23645',
  askColor: '#089981',
  imbalanceRatio: 3.0,
  imbalanceRepresentation: 'Highlight text',
  imbalanceBuyColor: '#00e676',
  imbalanceSellColor: '#ff5252',
  textColor: '#d1d4dc',
  zeroColor: '#505460',
  deltaPositiveColor: '#089981',
  deltaNegativeColor: '#f23645',
  showStats: true,
  statsPosition: 'Below',
  showTotalVolume: true,
  totalVolumeColor: '#d1d4dc',
  showDeltaPercent: false,
  deltaPercentColor: '#ffb700',
  showMinMaxDelta: false,
  minDeltaColor: '#f23645',
  maxDeltaColor: '#089981',
  aggregateProfiles: true,
  convertClusterToCandlesOnZoom: true,
  includeEmptyLevels: true,
  barVisualization: 'Bid x Ask',
  candleZone: 'Candle',
  candleZonePosition: 'Footprint #1',
  barMarginPx: 0,
  calculateFontSizeAuto: true,
  maxValueCalculation: 'Daily',
  imbalanceRules: [],
  imbalanceGlobalSettings: {
    skipZeroValues: false,
    showStackedImbalances: true,
    showMitigatedZones: true,
    drawZoneBorders: false,
    stackedMinLevels: 3,
  },
  candleUpColor: '#089981',
  candleDownColor: '#f23645',
  candleBorderUpColor: '#089981',
  candleBorderDownColor: '#f23645',
  candleWickUpColor: '#089981',
  candleWickDownColor: '#f23645',
  showCandleBody: true,
  showCandleBorders: true,
  showCandleWick: true,

  volProfileEnabled: false,
  volProfileMode: 'footprint',
  volProfileTickInterval: 1,
  volProfileBarColor: '#50535e',
  volProfilePocBarColor: '#d1d4dc',
  volProfilePocBarEnabled: true,
  volProfileShowValueArea: true,
  volProfileValueAreaPercent: 70.0,
  volProfileValueAreaBarColor: '#787b86',
  volProfileValueAreaBarEnabled: true,
};

export interface PrecomputedStackZone {
  type: 'buy' | 'sell';
  startTime: number;
  barIndex: number;
  mitigatedTime: number | null;
  mitigatedIndex: number | null;
  bottomPrice: number;
  topPrice: number;
  color: string;
  fillColor: string;
  borderColor: string;
}

export interface PrecomputedSingleLine {
  type: 'buy' | 'sell';
  startTime: number;
  barIndex: number;
  mitigatedTime: number | null;
  mitigatedIndex: number | null;
  price: number;
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
}

export interface PrecomputedImbalances {
  stackZones: PrecomputedStackZone[];
  singleLines: PrecomputedSingleLine[];
}

export interface ProfileBucket {
  bIndex: number;
  volume: number;
  delta: number;
  isPOC: boolean;
  isVA: boolean;
}

export interface BarProfileData {
  bucketSize: number;
  showVA: boolean;
  vaRangePct: number;
  buckets: ProfileBucket[];
  maxBVol: number;
  pocBIdx: number;
}

const MAX_COLOR_CACHE_SIZE = 512;
const rgbaColorCache = new Map<string, string>();
const rgbParsedCache = new Map<string, [number, number, number]>();

function setBoundedCache<K, V>(cache: Map<K, V>, key: K, value: V): void {
  if (!cache.has(key) && cache.size >= MAX_COLOR_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, value);
}

function parseRgb(color: string): [number, number, number] {
  const cached = rgbParsedCache.get(color);
  if (cached) return cached;
  let parsed: [number, number, number] = [8, 153, 129];
  if (color) {
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 3) {
        parsed = [
          parseInt(hex[0] + hex[0], 16),
          parseInt(hex[1] + hex[1], 16),
          parseInt(hex[2] + hex[2], 16),
        ];
      } else if (hex.length >= 6) {
        parsed = [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
        ];
      }
    } else if (color.startsWith('rgb')) {
      const match = color.match(/\d+/g);
      if (match && match.length >= 3) {
        parsed = [Number(match[0]), Number(match[1]), Number(match[2])];
      }
    }
  }
  setBoundedCache(rgbParsedCache, color, parsed);
  return parsed;
}

function toRgbaWithAlpha(color: string, alpha: number): string {
  if (!color || color === 'transparent') return 'transparent';
  const qAlpha = Math.round(alpha * 100) / 100;
  const key = `${color}_${qAlpha}`;
  let res = rgbaColorCache.get(key);
  if (res) return res;

  const [r, g, b] = parseRgb(color);
  res = `rgba(${r}, ${g}, ${b}, ${qAlpha})`;
  setBoundedCache(rgbaColorCache, key, res);
  return res;
}

// Module-level caches and scratch structures to achieve zero-allocation rendering
const barProfileCache = new WeakMap<FootprintBar, BarProfileData>();
const scratchProfileBucketMap = new Map<number, { bIndex: number; volume: number; delta: number; isPOC: boolean }>();
const scratchProfileInVAMap = new Map<number, boolean>();
const scratchSortedBIndices: number[] = [];

function getOrComputeBarProfile(
  bar: FootprintBar,
  bucketSize: number,
  showVA: boolean,
  vaRangePct: number
): BarProfileData {
  const cached = barProfileCache.get(bar);
  if (
    cached &&
    Math.abs(cached.bucketSize - bucketSize) < 1e-9 &&
    cached.showVA === showVA &&
    Math.abs(cached.vaRangePct - vaRangePct) < 1e-9
  ) {
    return cached;
  }

  scratchProfileBucketMap.clear();
  scratchProfileInVAMap.clear();
  scratchSortedBIndices.length = 0;

  for (let l = 0; l < bar.levels.length; l++) {
    const lvl = bar.levels[l];
    const bIdx = Math.floor((lvl.price + 1e-9) / bucketSize);
    let cur = scratchProfileBucketMap.get(bIdx);
    if (!cur) {
      cur = { bIndex: bIdx, volume: 0, delta: 0, isPOC: false };
      scratchProfileBucketMap.set(bIdx, cur);
      scratchSortedBIndices.push(bIdx);
    }
    cur.volume += (lvl.bidVolume + lvl.askVolume);
    cur.delta += (lvl.askVolume - lvl.bidVolume);
  }

  scratchSortedBIndices.sort((a, b) => a - b);
  let maxBVol = 0;
  let totalBarVol = 0;
  let pocBIdx = -1;

  for (let i = 0; i < scratchSortedBIndices.length; i++) {
    const idx = scratchSortedBIndices[i];
    const b = scratchProfileBucketMap.get(idx)!;
    totalBarVol += b.volume;
    if (b.volume > maxBVol) {
      maxBVol = b.volume;
      pocBIdx = idx;
    }
  }

  const vaTarget = totalBarVol * (vaRangePct / 100.0);

  if (showVA && scratchSortedBIndices.length > 0 && maxBVol > 0) {
    const pocPos = scratchSortedBIndices.indexOf(pocBIdx);
    if (pocPos !== -1) {
      scratchProfileInVAMap.set(pocBIdx, true);
      let accumulated = scratchProfileBucketMap.get(pocBIdx)!.volume;
      let upP = pocPos + 1;
      let downP = pocPos - 1;

      while (accumulated < vaTarget && (upP < scratchSortedBIndices.length || downP >= 0)) {
        const upVol = upP < scratchSortedBIndices.length ? scratchProfileBucketMap.get(scratchSortedBIndices[upP])!.volume : -1;
        const downVol = downP >= 0 ? scratchProfileBucketMap.get(scratchSortedBIndices[downP])!.volume : -1;

        if (upVol >= downVol && upP < scratchSortedBIndices.length) {
          accumulated += upVol;
          scratchProfileInVAMap.set(scratchSortedBIndices[upP], true);
          upP++;
        } else if (downP >= 0) {
          accumulated += downVol;
          scratchProfileInVAMap.set(scratchSortedBIndices[downP], true);
          downP--;
        } else {
          break;
        }
      }
    }
  }

  const buckets: ProfileBucket[] = new Array(scratchSortedBIndices.length);
  for (let i = 0; i < scratchSortedBIndices.length; i++) {
    const idx = scratchSortedBIndices[i];
    const b = scratchProfileBucketMap.get(idx)!;
    buckets[i] = {
      bIndex: b.bIndex,
      volume: b.volume,
      delta: b.delta,
      isPOC: b.bIndex === pocBIdx,
      isVA: scratchProfileInVAMap.get(b.bIndex) === true,
    };
  }

  scratchProfileBucketMap.clear();
  scratchProfileInVAMap.clear();
  scratchSortedBIndices.length = 0;

  const result: BarProfileData = {
    bucketSize,
    showVA,
    vaRangePct,
    buckets,
    maxBVol,
    pocBIdx,
  };

  barProfileCache.set(bar, result);
  return result;
}

const filledLevelsCache = new WeakMap<FootprintBar, { tickSize: number; levels: PriceLevelVolume[] }>();
const scratchLevelMap = new Map<number, PriceLevelVolume>();

function getOrComputeFilledLevels(bar: FootprintBar, tickSize: number): PriceLevelVolume[] {
  const cached = filledLevelsCache.get(bar);
  if (cached && Math.abs(cached.tickSize - tickSize) < 1e-9) {
    return cached.levels;
  }

  const lowIdx = Math.round(bar.low / tickSize);
  const highIdx = Math.round(bar.high / tickSize);
  if (!Number.isFinite(lowIdx) || !Number.isFinite(highIdx) || highIdx < lowIdx || highIdx - lowIdx > 4000) {
    return bar.levels;
  }

  scratchLevelMap.clear();
  for (let i = 0; i < bar.levels.length; i++) {
    const lvl = bar.levels[i];
    scratchLevelMap.set(Math.round(lvl.price / tickSize), lvl);
  }

  const filled: PriceLevelVolume[] = new Array(highIdx - lowIdx + 1);
  let outIdx = 0;
  for (let idx = lowIdx; idx <= highIdx; idx++) {
    const existing = scratchLevelMap.get(idx);
    if (existing) {
      filled[outIdx++] = existing;
    } else {
      filled[outIdx++] = {
        price: idx * tickSize,
        bidVolume: 0,
        askVolume: 0,
        delta: 0,
        isPOC: false,
      };
    }
  }

  scratchLevelMap.clear();
  filledLevelsCache.set(bar, { tickSize, levels: filled });
  return filled;
}

const scratchAggBucketMap = new Map<number, { bIndex: number; bid: number; ask: number; originalPOC: boolean }>();
const scratchAggSortedIndices: number[] = [];

const formatVolCache = new Map<number, string>();
const MAX_FORMAT_VOL_CACHE = 2048;

function formatVol(val: number): string {
  const cached = formatVolCache.get(val);
  if (cached !== undefined) return cached;
  const abs = Math.abs(val);
  let out: string;
  if (abs >= 1_000_000) {
    out = `${(val / 1_000_000).toFixed(1)}M`;
  } else if (abs >= 1_000) {
    out = `${(val / 1_000).toFixed(1)}k`;
  } else {
    out = val % 1 === 0 ? val.toString() : val.toFixed(1);
  }
  if (formatVolCache.size >= MAX_FORMAT_VOL_CACHE) {
    formatVolCache.clear();
  }
  formatVolCache.set(val, out);
  return out;
}

class FootprintRenderer implements IPrimitivePaneRenderer {
  private _data: readonly FootprintBar[];
  private _options: FootprintPrimitiveOptions;
  private _series: ISeriesApi<SeriesType, Time> | null;
  private _chart: IChartApiBase<Time> | null;
  private _imbalances: PrecomputedImbalances = { stackZones: [], singleLines: [] };

  constructor(
    data: readonly FootprintBar[],
    options: FootprintPrimitiveOptions,
    series: ISeriesApi<SeriesType, Time> | null,
    chart: IChartApiBase<Time> | null,
    imbalances?: PrecomputedImbalances
  ) {
    this._data = data;
    this._options = options;
    this._series = series;
    this._chart = chart;
    if (imbalances) {
      this._imbalances = imbalances;
    }
  }

  update(
    data: readonly FootprintBar[],
    options: FootprintPrimitiveOptions,
    series: ISeriesApi<SeriesType, Time> | null,
    chart: IChartApiBase<Time> | null,
    imbalances?: PrecomputedImbalances
  ): void {
    this._data = data;
    this._options = options;
    this._series = series;
    this._chart = chart;
    if (imbalances) {
      this._imbalances = imbalances;
    }
  }

  private _drawProfileHistogram(
    ctx: CanvasRenderingContext2D,
    series: ISeriesApi<SeriesType, Time>,
    barProfile: BarProfileData,
    bucketSize: number,
    tickSize: number,
    profileStartX: number,
    maxProfileW: number,
    showVA: boolean
  ): void {
    const pocBarColor = this._options.volProfilePocBarColor || '#d1d4dc';
    const pocBarEnabled = this._options.volProfilePocBarEnabled ?? true;
    const barColor = this._options.volProfileBarColor || '#50535e';
    const vaBarColor = this._options.volProfileValueAreaBarColor || '#787b86';
    const vaBarEnabled = this._options.volProfileValueAreaBarEnabled ?? true;

    let lastFillStyle = '';
    for (let b = 0; b < barProfile.buckets.length; b++) {
      const bData = barProfile.buckets[b];
      const bPrice = bData.bIndex * bucketSize;
      const yTop = series.priceToCoordinate(bPrice + bucketSize);
      const yBottom = series.priceToCoordinate(bPrice);
      if (yTop === null || yBottom === null || !Number.isFinite(yTop) || !Number.isFinite(yBottom)) {
        continue;
      }

      const top = Math.min(yTop, yBottom);
      const cellH = Math.max(1, Math.abs(yTop - yBottom) - (bucketSize > tickSize ? 1 : 0));
      const ratio = barProfile.maxBVol > 0 ? bData.volume / barProfile.maxBVol : 0;
      const barW = Math.max(1, Math.round(ratio * maxProfileW));

      let col = barColor;
      if (bData.isPOC && pocBarEnabled) {
        col = pocBarColor;
      } else if (showVA && vaBarEnabled && bData.isVA) {
        col = vaBarColor;
      }

      if (col !== lastFillStyle) {
        ctx.fillStyle = col;
        lastFillStyle = col;
      }
      ctx.fillRect(profileStartX, top, barW, cellH);
    }
  }

  private _resolveVisibleTickSize(visibleBars: ReadonlyArray<{ bar: FootprintBar; x: number }>): number {
    if (this._options.tickSize && this._options.tickSize > 0) {
      return this._options.tickSize;
    }

    let minPositiveDiff = Infinity;
    const sampleCount = Math.min(5, visibleBars.length);
    for (let k = 0; k < sampleCount; k++) {
      const levels = visibleBars[k].bar.levels;
      if (levels.length < 2) continue;

      let isSorted = true;
      for (let i = 1; i < levels.length; i++) {
        if (levels[i].price < levels[i - 1].price) {
          isSorted = false;
          break;
        }
      }

      if (isSorted) {
        for (let i = 1; i < levels.length; i++) {
          const diff = Math.round((levels[i].price - levels[i - 1].price) * 10000) / 10000;
          if (diff > 0.00001 && diff < minPositiveDiff) {
            minPositiveDiff = diff;
          }
        }
      } else {
        const sortedPrices = levels.map((l) => l.price).sort((a, b) => a - b);
        for (let i = 1; i < sortedPrices.length; i++) {
          const diff = Math.round((sortedPrices[i] - sortedPrices[i - 1]) * 10000) / 10000;
          if (diff > 0.00001 && diff < minPositiveDiff) {
            minPositiveDiff = diff;
          }
        }
      }
    }

    return Number.isFinite(minPositiveDiff) && minPositiveDiff > 0 ? minPositiveDiff : 0.25;
  }

  draw(target: CanvasRenderingTarget2D): void {
    const dataLen = this._data.length;
    if (!this._options.visible || !this._series || !this._chart || dataLen === 0) {
      return;
    }

    const series = this._series;
    const chart = this._chart;
    const timeScale = chart.timeScale();

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      if (mediaSize.width <= 0 || mediaSize.height <= 0) return;

      // 1. Determine nominal bar spacing from chart timeScale
      let nominalSpacing = 36;
      try {
        const c0 = timeScale.logicalToCoordinate(0 as any);
        const c1 = timeScale.logicalToCoordinate(1 as any);
        if (c0 !== null && c1 !== null && Number.isFinite(c0) && Number.isFinite(c1)) {
          const s = Math.abs(c1 - c0);
          if (s > 0) nominalSpacing = s;
        }
      } catch {}

      // 2. Identify visible bars via binary search on visible time range (falling back to full scan when unavailable)
      interface VisibleBarEntry {
        bar: FootprintBar;
        x: number;
      }
      const visibleBars: VisibleBarEntry[] = [];

      let startIdx = 0;
      let endIdx = dataLen - 1;
      let rangeMinT: number | null = null;
      let rangeMaxT: number | null = null;

      const visibleRange = typeof timeScale.getVisibleRange === 'function' ? timeScale.getVisibleRange() : null;
      if (visibleRange && typeof visibleRange.from === 'number' && typeof visibleRange.to === 'number') {
        rangeMinT = Math.min(visibleRange.from, visibleRange.to);
        rangeMaxT = Math.max(visibleRange.from, visibleRange.to);
      } else if (
        typeof timeScale.getVisibleLogicalRange === 'function' &&
        typeof timeScale.coordinateToTime === 'function'
      ) {
        const logicalRange = timeScale.getVisibleLogicalRange();
        if (logicalRange) {
          const t0 = timeScale.coordinateToTime(0);
          const t1 = timeScale.coordinateToTime(mediaSize.width);
          if (typeof t0 === 'number' && typeof t1 === 'number') {
            rangeMinT = Math.min(t0, t1);
            rangeMaxT = Math.max(t0, t1);
          }
        }
      }

      if (
        rangeMinT !== null &&
        rangeMaxT !== null &&
        Number.isFinite(this._data[0].time) &&
        Number.isFinite(this._data[dataLen - 1].time)
      ) {
        // Binary search lower bound for rangeMinT
        let lo = 0;
        let hi = dataLen;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (this._data[mid].time < rangeMinT) {
            lo = mid + 1;
          } else {
            hi = mid;
          }
        }
        startIdx = Math.max(0, lo - 4);

        // Binary search upper bound for rangeMaxT
        lo = startIdx;
        hi = dataLen;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (this._data[mid].time <= rangeMaxT) {
            lo = mid + 1;
          } else {
            hi = mid;
          }
        }
        endIdx = Math.min(dataLen - 1, lo + 3);
      }

      for (let b = startIdx; b <= endIdx; b++) {
        const bar = this._data[b];
        const x = timeScale.timeToCoordinate(bar.time as Time);
        if (x !== null && Number.isFinite(x) && x >= -300 && x <= mediaSize.width + 300) {
          visibleBars.push({ bar, x });
        }
      }

      const pocBoxColor = this._options.pocColor || '#ffb700';
      const userMargin = Math.max(0, this._options.barMarginPx ?? 0);

      // Draw horizontal imbalance lines and stacked imbalance rectangles
      if (this._options.imbalanceRules && this._options.imbalanceRules.length > 0) {
        this._drawImbalanceZonesAndLines(
          ctx,
          mediaSize,
          series,
          timeScale,
          this._imbalances.stackZones,
          this._imbalances.singleLines,
          this._options.imbalanceGlobalSettings || {
            skipZeroValues: false,
            showStackedImbalances: true,
            showMitigatedZones: true,
            drawZoneBorders: false,
            stackedMinLevels: 3,
          }
        );
      }

      if (visibleBars.length === 0) {
        return;
      }

      // Hoist tick size and pixel step height computation outside the per-bar loop
      const tickSize = this._resolveVisibleTickSize(visibleBars);
      let rawLevelHeight = 12;
      for (let k = 0; k < visibleBars.length; k++) {
        const b = visibleBars[k].bar;
        const refP = b.levels[0]?.price ?? b.close;
        if (Number.isFinite(refP)) {
          const yRef0 = series.priceToCoordinate(refP);
          const yRef1 = series.priceToCoordinate(refP + tickSize);
          if (yRef0 !== null && yRef1 !== null && Number.isFinite(yRef0) && Number.isFinite(yRef1)) {
            rawLevelHeight = Math.abs(yRef1 - yRef0);
            break;
          }
        }
      }

      const vpMode: 'footprint' | 'profile' | 'both' | 'noCandle' =
        this._options.volProfileMode || (this._options.volProfileEnabled ? 'profile' : 'footprint');
      const isAggregating = Boolean(this._options.aggregateProfiles && rawLevelHeight < 12);
      const convertToCandles = this._options.convertClusterToCandlesOnZoom ?? true;

      ctx.save();
      ctx.font = '9px "JetBrains Mono", Consolas, monospace';

      const candleUpBodyRgba = toRgbaWithAlpha(this._options.candleUpColor || '#089981', 0.08);
      const candleDownBodyRgba = toRgbaWithAlpha(this._options.candleDownColor || '#f23645', 0.08);

      interface RenderLevel {
        price: number;
        topPrice: number;
        bottomPrice: number;
        bidVolume: number;
        askVolume: number;
        delta: number;
        isPOC: boolean;
        isImbalanceBuy: boolean;
        isImbalanceSell: boolean;
      }
      interface StatItem {
        text: string;
        color: string;
        isBold?: boolean;
      }
      const effectiveLevels: RenderLevel[] = [];
      const statItems: StatItem[] = [];

      for (let k = 0; k < visibleBars.length; k++) {
        const { bar, x } = visibleBars[k];

        // Determine local bar spacing from adjacent visible bars or nominal spacing
        const prevX = k > 0 ? visibleBars[k - 1].x : null;
        const nextX = k < visibleBars.length - 1 ? visibleBars[k + 1].x : null;
        let localSpacing = nominalSpacing;
        if (prevX !== null && nextX !== null) {
          localSpacing = Math.min(x - prevX, nextX - x);
        } else if (prevX !== null) {
          localSpacing = x - prevX;
        } else if (nextX !== null) {
          localSpacing = nextX - x;
        }
        if (!Number.isFinite(localSpacing) || localSpacing <= 0) {
          localSpacing = nominalSpacing;
        }

        // Clamp barWidth so it NEVER exceeds adjacent bar spacing minus margin.
        // This mathematically guarantees bars and cluster boxes NEVER touch or overlap.
        let barWidth: number;
        if (localSpacing < 14) {
          barWidth = Math.max(2, localSpacing * 0.82);
        } else {
          const maxAllowed = Math.max(4, localSpacing - Math.max(2, userMargin * 2));
          barWidth = Math.min(maxAllowed, 240);
        }

        const halfWidth = barWidth / 2;
        const left = x - halfWidth;
        const showText = this._options.showText && barWidth >= 28;

        const shouldConvertToCandles = vpMode === 'profile'
          ? localSpacing < 6
          : vpMode === 'noCandle'
          ? false
          : convertToCandles && (barWidth < 14 || (!isAggregating && rawLevelHeight < 2.0));

        const isBullish = bar.close >= bar.open;

        // Global candle visual styles
        const bodyUp = this._options.candleUpColor || '#089981';
        const bodyDown = this._options.candleDownColor || '#f23645';
        const borderUp = this._options.candleBorderUpColor || bodyUp;
        const borderDown = this._options.candleBorderDownColor || bodyDown;
        const wickUp = this._options.candleWickUpColor || borderUp;
        const wickDown = this._options.candleWickDownColor || borderDown;

        const showBody = this._options.showCandleBody !== false;
        const showBorders = this._options.showCandleBorders !== false;
        const showWick = this._options.showCandleWick !== false;

        const candleBodyColor = isBullish ? bodyUp : bodyDown;
        const candleBorderColor = isBullish ? borderUp : borderDown;
        const candleWickColor = isBullish ? wickUp : wickDown;
        const candleBarColor = isBullish ? bodyUp : bodyDown;

        const yHigh = series.priceToCoordinate(bar.high);
        const yLow = series.priceToCoordinate(bar.low);
        const yOpen = series.priceToCoordinate(bar.open);
        const yClose = series.priceToCoordinate(bar.close);

        // Only collapse into clean candles on extreme zoom out (e.g. microscopic bar width or tiny level height)
        if (shouldConvertToCandles) {
          if (
            yHigh !== null &&
            yLow !== null &&
            yOpen !== null &&
            yClose !== null &&
            Number.isFinite(yHigh) &&
            Number.isFinite(yLow) &&
            Number.isFinite(yOpen) &&
            Number.isFinite(yClose)
          ) {
            const bodyTop = Math.min(yOpen, yClose);
            const bodyBottom = Math.max(yOpen, yClose);
            const bodyHeight = Math.max(1, bodyBottom - bodyTop);

            if (showWick) {
              ctx.strokeStyle = candleWickColor;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(x, Math.min(yHigh, yLow));
              ctx.lineTo(x, Math.max(yHigh, yLow));
              ctx.stroke();
            }

            // Candle body width strictly bounded to 72% of localSpacing
            const w = Math.max(1, Math.min(halfWidth * 0.82, (localSpacing * 0.72) / 2));
            if (showBody) {
              ctx.fillStyle = candleBodyColor;
              ctx.fillRect(x - w, bodyTop, w * 2, bodyHeight);
            }
            if (showBorders) {
              ctx.strokeStyle = candleBorderColor;
              ctx.lineWidth = 1;
              ctx.strokeRect(x - w, bodyTop, w * 2, bodyHeight);
            }
          }
          continue;
        }

        // ==========================================
        // DEDICATED VOL PROFILE CANDLE RENDERING (Vol Profile Only / No Candle)
        // ==========================================
        if (vpMode === 'profile' || vpMode === 'noCandle') {
          if (
            yHigh !== null &&
            yLow !== null &&
            yOpen !== null &&
            yClose !== null &&
            Number.isFinite(yHigh) &&
            Number.isFinite(yLow) &&
            Number.isFinite(yOpen) &&
            Number.isFinite(yClose)
          ) {
            const candleBodyW = Math.max(3, Math.min(8, Math.floor(localSpacing * 0.16)));
            const bLeft = x - Math.floor(candleBodyW / 2);
            const bTop = Math.min(yOpen, yClose);
            const bH = Math.max(2, Math.abs(yClose - yOpen));

            // 1. Get pre-computed volume profile for this bar
            const interval = Math.max(1, Math.round(this._options.volProfileTickInterval || 1));
            const bucketSize = tickSize * interval;
            const showVA = this._options.volProfileShowValueArea ?? true;
            const vaRangePct = this._options.volProfileValueAreaPercent ?? 70.0;
            const barProfile = getOrComputeBarProfile(bar, bucketSize, showVA, vaRangePct);

            // 2. Render Horizontal Profile Histogram FIRST (behind candle)
            const profileStartX = x;
            const maxProfileW = vpMode === 'noCandle'
              ? Math.max(6, Math.min(localSpacing * 0.85, localSpacing - 4))
              : Math.max(6, Math.min(localSpacing * 0.82, localSpacing - candleBodyW - 6));

            this._drawProfileHistogram(
              ctx,
              series,
              barProfile,
              bucketSize,
              tickSize,
              profileStartX,
              maxProfileW,
              showVA
            );

            // 4. Draw Candlestick wick and body ON TOP of profile (if not 'noCandle')
            if (vpMode !== 'noCandle') {
              if (showWick) {
                ctx.strokeStyle = candleWickColor;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, Math.min(yHigh, yLow));
                ctx.lineTo(x, Math.max(yHigh, yLow));
                ctx.stroke();
              }
              if (showBody) {
                ctx.fillStyle = candleBodyColor;
                ctx.fillRect(bLeft, bTop, candleBodyW, bH);
              }
              if (showBorders) {
                ctx.strokeStyle = candleBorderColor;
                ctx.lineWidth = 1;
                ctx.strokeRect(bLeft, bTop, candleBodyW, bH);
              }
            }

            // 5. Render Candle Stats Above/Below (Delta & Total Volume)
            if (this._options.showStats !== false) {
              statItems.length = 0;

              if (this._options.showDelta !== false) {
                const deltaVal = bar.delta;
                const deltaCol =
                  deltaVal >= 0
                    ? this._options.deltaPositiveColor || '#089981'
                    : this._options.deltaNegativeColor || '#f23645';
                statItems.push({ text: `${deltaVal}`, color: deltaCol, isBold: true });
              }

              if (this._options.showTotalVolume) {
                statItems.push({
                  text: `${formatVol(bar.totalVolume)}`,
                  color: this._options.totalVolumeColor || '#d1d4dc',
                });
              }

              if (this._options.showDeltaPercent) {
                const pct = bar.totalVolume > 0 ? Math.round((bar.delta / bar.totalVolume) * 100) : 0;
                statItems.push({
                  text: `${pct >= 0 ? '+' : ''}${pct}%`,
                  color: this._options.deltaPercentColor || '#ffb700',
                });
              }

              if (statItems.length > 0) {
                const statsPos = this._options.statsPosition || 'As per candle';
                const renderAbove = statsPos === 'Above' || (statsPos === 'As per candle' && isBullish);

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const lineHeight = 11;
                const totalStatsHeight = statItems.length * lineHeight;

                let startY: number;
                if (renderAbove) {
                  const topY = Math.min(yHigh, yLow);
                  startY = topY - 7 - totalStatsHeight + lineHeight / 2;
                } else {
                  const bottomY = Math.max(yHigh, yLow);
                  startY = bottomY + 8 + lineHeight / 2;
                }

                for (let s = 0; s < statItems.length; s++) {
                  const item = statItems[s];
                  ctx.font = item.isBold
                    ? 'bold 9px "JetBrains Mono", Consolas, monospace'
                    : '9px "JetBrains Mono", Consolas, monospace';
                  ctx.fillStyle = item.color;
                  ctx.fillText(item.text, x, startY + s * lineHeight);
                }
                ctx.font = '9px "JetBrains Mono", Consolas, monospace';
              }
            }
          }
          continue;
        }

        // Source levels (with empty intermediate levels filled in if requested, memoized per bar)
        let sourceLevels = bar.levels;
        if (this._options.includeEmptyLevels && tickSize > 0) {
          sourceLevels = getOrComputeFilledLevels(bar, tickSize);
        }

        // Aggregate price levels dynamically when vertical scale compresses price levels
        effectiveLevels.length = 0;
        let maxLevelVol = 1;

        if (isAggregating) {
          const ticksPerBucket = Math.max(2, Math.ceil(13 / Math.max(0.5, rawLevelHeight)));
          const bucketSize = tickSize * ticksPerBucket;
          scratchAggBucketMap.clear();
          scratchAggSortedIndices.length = 0;

          for (let l = 0; l < sourceLevels.length; l++) {
            const lvl = sourceLevels[l];
            const bIndex = Math.floor((lvl.price + 1e-9) / bucketSize);
            let cur = scratchAggBucketMap.get(bIndex);
            if (!cur) {
              cur = { bIndex, bid: 0, ask: 0, originalPOC: false };
              scratchAggBucketMap.set(bIndex, cur);
              scratchAggSortedIndices.push(bIndex);
            }
            cur.bid += lvl.bidVolume;
            cur.ask += lvl.askVolume;
            if (lvl.isPOC) cur.originalPOC = true;
          }

          let maxBucketTotal = 0;
          let pocBucketIndex = -1;
          scratchAggSortedIndices.sort((a, b) => a - b);

          for (let idx = 0; idx < scratchAggSortedIndices.length; idx++) {
            const bIndex = scratchAggSortedIndices[idx];
            const bData = scratchAggBucketMap.get(bIndex)!;
            const tot = bData.bid + bData.ask;
            if (tot > maxBucketTotal) {
              maxBucketTotal = tot;
              pocBucketIndex = bIndex;
            }
            if (tot > maxLevelVol) {
              maxLevelVol = tot;
            }
          }

          for (let idx = 0; idx < scratchAggSortedIndices.length; idx++) {
            const bIndex = scratchAggSortedIndices[idx];
            const bData = scratchAggBucketMap.get(bIndex)!;
            const bPrice = bIndex * bucketSize;
            effectiveLevels.push({
              price: bPrice + bucketSize / 2,
              topPrice: bPrice + bucketSize,
              bottomPrice: bPrice,
              bidVolume: bData.bid,
              askVolume: bData.ask,
              delta: bData.ask - bData.bid,
              isPOC: bIndex === pocBucketIndex && maxBucketTotal > 0,
              isImbalanceBuy: bData.bid > 0 ? bData.ask >= bData.bid * 3.0 && bData.ask >= 10.0 : false,
              isImbalanceSell: bData.ask > 0 ? bData.bid >= bData.ask * 3.0 && bData.bid >= 10.0 : false,
            });
          }
          scratchAggBucketMap.clear();
          scratchAggSortedIndices.length = 0;
        } else {
          // Standard raw levels: find strictly ONE real POC price
          let targetPocPrice: number | undefined = bar.pocPrice;
          if (targetPocPrice === undefined) {
            let maxTotal = 0;
            for (let l = 0; l < sourceLevels.length; l++) {
              const lvl = sourceLevels[l];
              const tot = lvl.bidVolume + lvl.askVolume;
              if (tot > maxTotal) {
                maxTotal = tot;
                targetPocPrice = lvl.price;
              }
            }
          }

          for (let l = 0; l < sourceLevels.length; l++) {
            const lvl = sourceLevels[l];
            const tot = lvl.bidVolume + lvl.askVolume;
            if (tot > maxLevelVol) {
              maxLevelVol = tot;
            }
          }

          let pocAssigned = false;
          for (let l = 0; l < sourceLevels.length; l++) {
            const lvl = sourceLevels[l];
            const isThisPoc =
              !pocAssigned &&
              this._options.showPOC &&
              ((targetPocPrice !== undefined && Math.abs(lvl.price - targetPocPrice) < tickSize * 0.51) ||
                Boolean(lvl.isPOC));

            if (isThisPoc) {
              pocAssigned = true;
            }

            effectiveLevels.push({
              price: lvl.price,
              topPrice: lvl.price + tickSize / 2,
              bottomPrice: lvl.price - tickSize / 2,
              bidVolume: lvl.bidVolume,
              askVolume: lvl.askVolume,
              delta: lvl.delta ?? (lvl.askVolume - lvl.bidVolume),
              isPOC: isThisPoc,
              isImbalanceBuy: Boolean(lvl.isImbalanceBuy),
              isImbalanceSell: Boolean(lvl.isImbalanceSell),
            });
          }
        }

        const isBoth = vpMode === 'both';
        const clusterW = isBoth ? Math.max(28, Math.floor(barWidth * 0.58)) : barWidth;
        const clusterLeft = left;
        const clusterHalfW = clusterW / 2;
        const clusterCenterX = clusterLeft + clusterHalfW;

        const profileStartX = clusterLeft + clusterW + 2;
        const profileMaxW = isBoth ? Math.max(6, barWidth - clusterW - 4) : 0;

        const interval = Math.max(1, Math.round(this._options.volProfileTickInterval || 1));
        const bothBucketSize = tickSize * interval;
        const showVA = this._options.volProfileShowValueArea ?? true;
        const vaRangePct = this._options.volProfileValueAreaPercent ?? 70.0;
        const barProfile = isBoth ? getOrComputeBarProfile(bar, bothBucketSize, showVA, vaRangePct) : null;

        // Draw unified Candle Zone (Candle outline, Bar ticks, or None) and wicks
        const candleZone = this._options.candleZone ?? 'Candle';
        if (
          yHigh !== null &&
          yLow !== null &&
          yOpen !== null &&
          yClose !== null &&
          Number.isFinite(yHigh) &&
          Number.isFinite(yLow) &&
          Number.isFinite(yOpen) &&
          Number.isFinite(yClose)
        ) {
          const bodyTop = Math.min(yOpen, yClose);
          const bodyBottom = Math.max(yOpen, yClose);
          const bodyHeight = Math.max(2, bodyBottom - bodyTop);

          if (candleZone === 'Candle') {
            // Draw background fill for candle zone
            if (showBody) {
              ctx.fillStyle = isBullish ? candleUpBodyRgba : candleDownBodyRgba;
              ctx.fillRect(clusterLeft, bodyTop, clusterW, bodyHeight);
            }

            // Draw crisp stroke outline around open-to-close body
            if (showBorders) {
              ctx.strokeStyle = candleBorderColor;
              ctx.lineWidth = 1;
              ctx.strokeRect(clusterLeft, bodyTop, clusterW, bodyHeight);
            }

            // Upper wick
            if (showWick) {
              ctx.strokeStyle = candleWickColor;
              ctx.lineWidth = 1;
              const wickTop = Math.min(yHigh, yLow);
              if (wickTop < bodyTop) {
                ctx.beginPath();
                ctx.moveTo(clusterCenterX, wickTop);
                ctx.lineTo(clusterCenterX, bodyTop);
                ctx.stroke();
              }

              // Lower wick
              const wickBottom = Math.max(yHigh, yLow);
              if (wickBottom > bodyBottom) {
                ctx.beginPath();
                ctx.moveTo(clusterCenterX, bodyBottom);
                ctx.lineTo(clusterCenterX, wickBottom);
                ctx.stroke();
              }
            }
          } else if (candleZone === 'Bar') {
            // OHLC bar: center vertical line, left open tick, right close tick
            ctx.strokeStyle = candleBarColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(clusterCenterX, Math.min(yHigh, yLow));
            ctx.lineTo(clusterCenterX, Math.max(yHigh, yLow));
            ctx.moveTo(clusterLeft, yOpen);
            ctx.lineTo(clusterCenterX, yOpen);
            ctx.moveTo(clusterCenterX, yClose);
            ctx.lineTo(clusterLeft + clusterW, yClose);
            ctx.stroke();
          } else {
            // CandleZone === 'None': subtle center wick line
            if (showWick) {
              ctx.strokeStyle = '#2a2e39';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(clusterCenterX, Math.min(yHigh, yLow));
              ctx.lineTo(clusterCenterX, Math.max(yHigh, yLow));
              ctx.stroke();
            }
          }
        }

        const barViz = this._options.barVisualization ?? 'Bid x Ask';
        const showFills = barViz !== 'None';
        const autoFont = this._options.calculateFontSizeAuto ?? true;
        const imbRep = this._options.imbalanceRepresentation || 'Highlight text';
        const imbBuyCol = this._options.imbalanceBuyColor || '#00e676';
        const imbSellCol = this._options.imbalanceSellColor || '#ff5252';
        const normalTextColor = this._options.textColor || '#d1d4dc';
        const zeroTextColor = this._options.zeroColor || '#505460';

        let maxAbsDelta = 1;
        if (barViz === 'Delta') {
          for (let l = 0; l < effectiveLevels.length; l++) {
            const d = Math.abs(effectiveLevels[l].delta);
            if (d > maxAbsDelta) maxAbsDelta = d;
          }
        }

        for (let l = 0; l < effectiveLevels.length; l++) {
          const lvl = effectiveLevels[l];
          const yTop = series.priceToCoordinate(lvl.topPrice);
          const yBottom = series.priceToCoordinate(lvl.bottomPrice);
          if (yTop === null || yBottom === null || !Number.isFinite(yTop) || !Number.isFinite(yBottom)) {
            continue;
          }

          const top = Math.min(yTop, yBottom);
          const cellH = Math.max(1, Math.abs(yTop - yBottom) - 1);
          const centerY = (yTop + yBottom) / 2;

          if (centerY < -30 || centerY > mediaSize.height + 30) {
            continue;
          }

          let curFillStyle = '';
          const setFill = (style: string) => {
            if (curFillStyle !== style) {
              ctx.fillStyle = style;
              curFillStyle = style;
            }
          };

          if (showFills) {
            if (barViz === 'Bid x Ask' && (lvl.bidVolume > 0 || lvl.askVolume > 0)) {
              // Bid volume fill (left side: clusterCenterX towards left)
              const bidRatio = Math.min(1, lvl.bidVolume / maxLevelVol);
              const bidW = Math.max(0, bidRatio * (clusterHalfW - 1));
              setFill(toRgbaWithAlpha(this._options.bidColor || '#f23645', Math.max(0.12, bidRatio * 0.55)));
              ctx.fillRect(clusterCenterX - bidW, top, bidW, cellH);

              // Ask volume fill (right side: clusterCenterX towards right)
              const askRatio = Math.min(1, lvl.askVolume / maxLevelVol);
              const askW = Math.max(0, askRatio * (clusterHalfW - 1));
              setFill(toRgbaWithAlpha(this._options.askColor || '#089981', Math.max(0.12, askRatio * 0.55)));
              ctx.fillRect(clusterCenterX, top, askW, cellH);
            } else if (barViz === 'Delta' && lvl.delta !== 0) {
              // Delta volume fill (positive to right, negative to left)
              if (lvl.delta > 0) {
                const deltaRatio = Math.min(1, lvl.delta / maxAbsDelta);
                const deltaW = Math.max(0, deltaRatio * (clusterHalfW - 1));
                setFill(toRgbaWithAlpha(this._options.deltaPositiveColor || '#089981', Math.max(0.18, deltaRatio * 0.65)));
                ctx.fillRect(clusterCenterX, top, deltaW, cellH);
              } else {
                const deltaRatio = Math.min(1, Math.abs(lvl.delta) / maxAbsDelta);
                const deltaW = Math.max(0, deltaRatio * (clusterHalfW - 1));
                setFill(toRgbaWithAlpha(this._options.deltaNegativeColor || '#f23645', Math.max(0.18, deltaRatio * 0.65)));
                ctx.fillRect(clusterCenterX - deltaW, top, deltaW, cellH);
              }
            }
          }

          // Imbalance border boxes (when Border box or Box & text representation is selected)
          if (this._options.showImbalance && (imbRep === 'Border box' || imbRep === 'Box & text') && cellH >= 6) {
            if (lvl.isImbalanceSell) {
              ctx.strokeStyle = imbSellCol;
              ctx.lineWidth = 1.25;
              ctx.strokeRect(clusterLeft + 1, top + 1, clusterHalfW - 2, cellH - 2);
            }
            if (lvl.isImbalanceBuy) {
              ctx.strokeStyle = imbBuyCol;
              ctx.lineWidth = 1.25;
              ctx.strokeRect(clusterCenterX + 1, top + 1, clusterHalfW - 2, cellH - 2);
            }
          }

          // Point of Control (POC) box: perfectly spanning left to left + clusterW
          if (this._options.showPOC && lvl.isPOC && cellH >= 4) {
            ctx.strokeStyle = pocBoxColor;
            ctx.lineWidth = 1.75;
            ctx.strokeRect(clusterLeft, top, clusterW, cellH);
          }

          // Numbers text - Level-of-Detail (LOD) Gate: suppressed when zoomed out
          const canRenderText = showText && cellH >= 14 && clusterW >= 36;
          if (canRenderText) {
            const fontSize = autoFont ? Math.max(8, Math.min(11, Math.floor(cellH * 0.65))) : 9;
            const regularFont = `${fontSize}px "JetBrains Mono", Consolas, monospace`;
            const boldFont = `bold ${fontSize}px "JetBrains Mono", Consolas, monospace`;
            ctx.textBaseline = 'middle';

            const highlightSell = this._options.showImbalance && lvl.isImbalanceSell && (imbRep === 'Highlight text' || imbRep === 'Box & text');
            const highlightBuy = this._options.showImbalance && lvl.isImbalanceBuy && (imbRep === 'Highlight text' || imbRep === 'Box & text');

            // Bid volume text
            ctx.textAlign = 'right';
            const bidFont = lvl.bidVolume !== 0 && highlightSell ? boldFont : regularFont;
            const bidCol = lvl.bidVolume === 0 ? zeroTextColor : highlightSell ? imbSellCol : normalTextColor;
            if (ctx.font !== bidFont) ctx.font = bidFont;
            setFill(bidCol);
            ctx.fillText(formatVol(lvl.bidVolume), clusterCenterX - 3, centerY);

            // Ask volume text
            ctx.textAlign = 'left';
            const askFont = lvl.askVolume !== 0 && highlightBuy ? boldFont : regularFont;
            const askCol = lvl.askVolume === 0 ? zeroTextColor : highlightBuy ? imbBuyCol : normalTextColor;
            if (ctx.font !== askFont) ctx.font = askFont;
            setFill(askCol);
            ctx.fillText(formatVol(lvl.askVolume), clusterCenterX + 3, centerY);
          }
        }

        // Center separator line
        ctx.strokeStyle = '#2a2e39';
        ctx.lineWidth = 1;
        if (
          yHigh !== null &&
          yLow !== null &&
          Number.isFinite(yHigh) &&
          Number.isFinite(yLow)
        ) {
          ctx.beginPath();
          ctx.moveTo(clusterCenterX, Math.min(yHigh, yLow));
          ctx.lineTo(clusterCenterX, Math.max(yHigh, yLow));
          ctx.stroke();
        }

        // Volume Profile Histogram Rendering for 'both' mode
        if (isBoth && barProfile && barProfile.buckets.length > 0 && profileMaxW > 0) {
          this._drawProfileHistogram(
            ctx,
            series,
            barProfile,
            bothBucketSize,
            tickSize,
            profileStartX,
            profileMaxW,
            showVA
          );
        }

        // Stats Rendering (Total Delta, Total Volume, Delta %, Min/Max Delta)
        statItems.length = 0;

        if (this._options.showDelta !== false) {
          const deltaVal = bar.delta;
          const deltaText = `${deltaVal >= 0 ? '+' : ''}${formatVol(deltaVal)}`;
          const deltaCol = deltaVal >= 0 ? (this._options.deltaPositiveColor || '#089981') : (this._options.deltaNegativeColor || '#f23645');
          statItems.push({ text: deltaText, color: deltaCol, isBold: true });
        }

        if (this._options.showTotalVolume) {
          statItems.push({
            text: `Vol ${formatVol(bar.totalVolume)}`,
            color: this._options.totalVolumeColor || '#d1d4dc',
          });
        }

        if (this._options.showDeltaPercent) {
          const pct = bar.totalVolume > 0 ? Math.round((bar.delta / bar.totalVolume) * 100) : 0;
          statItems.push({
            text: `Δ% ${pct >= 0 ? '+' : ''}${pct}%`,
            color: this._options.deltaPercentColor || '#ffb700',
          });
        }

        if (this._options.showMinMaxDelta) {
          let minD = 0;
          let maxD = 0;
          for (let l = 0; l < effectiveLevels.length; l++) {
            const d = effectiveLevels[l].delta;
            if (d < minD) minD = d;
            if (d > maxD) maxD = d;
          }
          statItems.push({
            text: `Min ${formatVol(minD)} / Max ${formatVol(maxD)}`,
            color: this._options.maxDeltaColor || '#089981',
          });
        }

        if (this._options.showStats !== false && barWidth >= 24 && statItems.length > 0 && yLow !== null && yHigh !== null && Number.isFinite(yLow) && Number.isFinite(yHigh)) {
          const statsPos = this._options.statsPosition || 'Below';
          const renderAbove = statsPos === 'Above' || (statsPos === 'As per candle' && isBullish);

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const lineHeight = 11;
          const totalStatsHeight = statItems.length * lineHeight;

          let startY: number;
          if (renderAbove) {
            const topY = Math.min(yHigh, yLow);
            startY = topY - 8 - totalStatsHeight + lineHeight / 2;
          } else {
            const bottomY = Math.max(yHigh, yLow);
            startY = bottomY + 10 + lineHeight / 2;
          }

          for (let s = 0; s < statItems.length; s++) {
            const item = statItems[s];
            ctx.font = item.isBold
              ? 'bold 9px "JetBrains Mono", Consolas, monospace'
              : '9px "JetBrains Mono", Consolas, monospace';
            ctx.fillStyle = item.color;
            ctx.fillText(item.text, isBoth ? clusterCenterX : x, startY + s * lineHeight);
          }
          ctx.font = '9px "JetBrains Mono", Consolas, monospace';
        }
      }

      ctx.restore();
    });
  }

  private _drawImbalanceZonesAndLines(
    ctx: CanvasRenderingContext2D,
    mediaSize: { width: number; height: number },
    series: ISeriesApi<SeriesType, Time>,
    timeScale: ReturnType<IChartApiBase<Time>['timeScale']>,
    stackZones: readonly PrecomputedStackZone[],
    singleLines: readonly PrecomputedSingleLine[],
    globalSettings: ImbalanceGlobalSettings
  ): void {
    if ((!stackZones || stackZones.length === 0) && (!singleLines || singleLines.length === 0)) return;

    const showMitigated = globalSettings.showMitigatedZones !== false;
    const drawBorders = Boolean(globalSettings.drawZoneBorders);
    const visibleRange = timeScale.getVisibleRange ? timeScale.getVisibleRange() : null;

    // 1. Draw Stacked Rectangles
    for (let i = 0; i < stackZones.length; i++) {
      const zone = stackZones[i];
      if (!showMitigated && zone.mitigatedTime !== null) {
        continue;
      }

      let startX: number;
      const x1 = timeScale.timeToCoordinate(zone.startTime as Time);
      if (x1 !== null && Number.isFinite(x1)) {
        startX = x1;
      } else {
        if (visibleRange && (zone.startTime as number) > (visibleRange.to as number)) {
          startX = mediaSize.width + 200;
        } else {
          startX = -100;
        }
      }

      let endX: number;
      if (zone.mitigatedTime !== null) {
        const x2 = timeScale.timeToCoordinate(zone.mitigatedTime as Time);
        if (x2 !== null && Number.isFinite(x2)) {
          endX = x2;
        } else {
          if (visibleRange && (zone.mitigatedTime as number) < (visibleRange.from as number)) {
            endX = -100;
          } else {
            endX = mediaSize.width + 100;
          }
        }
      } else {
        endX = mediaSize.width + 100;
      }

      if (endX < 0 || startX > mediaSize.width) continue;

      const yTopCoord = series.priceToCoordinate(zone.topPrice);
      const yBottomCoord = series.priceToCoordinate(zone.bottomPrice);

      if (yTopCoord === null || yBottomCoord === null || !Number.isFinite(yTopCoord) || !Number.isFinite(yBottomCoord)) {
        continue;
      }

      const yMin = Math.min(yTopCoord, yBottomCoord);
      const h = Math.max(2, Math.abs(yBottomCoord - yTopCoord));
      const renderStartX = Math.max(0, startX);
      const renderWidth = Math.max(1, endX - renderStartX);

      ctx.save();
      ctx.fillStyle = zone.fillColor;
      ctx.fillRect(renderStartX, yMin, renderWidth, h);

      if (drawBorders) {
        ctx.strokeStyle = zone.borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(renderStartX, yMin, renderWidth, h);
      }
      ctx.restore();
    }

    // 2. Draw Single Lines
    for (let i = 0; i < singleLines.length; i++) {
      const line = singleLines[i];
      if (!showMitigated && line.mitigatedTime !== null) {
        continue;
      }

      let startX: number;
      const x1 = timeScale.timeToCoordinate(line.startTime as Time);
      if (x1 !== null && Number.isFinite(x1)) {
        startX = x1;
      } else {
        if (visibleRange && (line.startTime as number) > (visibleRange.to as number)) {
          startX = mediaSize.width + 200;
        } else {
          startX = -100;
        }
      }

      let endX: number;
      if (line.mitigatedTime !== null) {
        const x2 = timeScale.timeToCoordinate(line.mitigatedTime as Time);
        if (x2 !== null && Number.isFinite(x2)) {
          endX = x2;
        } else {
          if (visibleRange && (line.mitigatedTime as number) < (visibleRange.from as number)) {
            endX = -100;
          } else {
            endX = mediaSize.width + 100;
          }
        }
      } else {
        endX = mediaSize.width + 100;
      }

      if (endX < 0 || startX > mediaSize.width) continue;

      const y = series.priceToCoordinate(line.price);
      if (y === null || !Number.isFinite(y)) continue;

      const renderStartX = Math.max(0, startX);
      const renderEndX = endX;

      ctx.save();
      ctx.strokeStyle = line.color;
      ctx.lineWidth = Math.max(0.5, line.lineWidth);

      if (ctx.setLineDash) {
        if (line.lineStyle === 'dashed') {
          ctx.setLineDash([6, 4]);
        } else if (line.lineStyle === 'dotted') {
          ctx.setLineDash([2, 2]);
        } else {
          ctx.setLineDash([]);
        }
      }

      ctx.beginPath();
      ctx.moveTo(renderStartX, y);
      ctx.lineTo(renderEndX, y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

class FootprintPaneView implements IPrimitivePaneView {
  private _renderer: FootprintRenderer;

  constructor(
    data: readonly FootprintBar[],
    options: FootprintPrimitiveOptions,
    series: ISeriesApi<SeriesType, Time> | null,
    chart: IChartApiBase<Time> | null,
    imbalances?: PrecomputedImbalances
  ) {
    this._renderer = new FootprintRenderer(data, options, series, chart, imbalances);
  }

  update(
    data: readonly FootprintBar[],
    options: FootprintPrimitiveOptions,
    series: ISeriesApi<SeriesType, Time> | null,
    chart: IChartApiBase<Time> | null,
    imbalances?: PrecomputedImbalances
  ): void {
    this._renderer.update(data, options, series, chart, imbalances);
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

function computeRawBarImbalances(
  bar: FootprintBar,
  barIndex: number,
  rules: ImbalanceRule[],
  globalSettings: ImbalanceGlobalSettings,
  tickSize: number
): { zones: PrecomputedStackZone[]; lines: PrecomputedSingleLine[] } {
  const zones: PrecomputedStackZone[] = [];
  const lines: PrecomputedSingleLine[] = [];
  if (!bar.levels || bar.levels.length === 0) return { zones, lines };

  const showStacked = globalSettings.showStackedImbalances !== false;
  const skipZero = Boolean(globalSettings.skipZeroValues);
  const minStackLevels = Math.max(2, globalSettings.stackedMinLevels || 3);

  let levelsAreSorted = true;
  for (let i = 1; i < bar.levels.length; i++) {
    if (bar.levels[i].price < bar.levels[i - 1].price) {
      levelsAreSorted = false;
      break;
    }
  }
  const sortedLevels = levelsAreSorted ? bar.levels : [...bar.levels].sort((a, b) => a.price - b.price);
  const pIndexMap = new Map<number, PriceLevelVolume>();
  for (const lvl of sortedLevels) {
    pIndexMap.set(Math.round(lvl.price / tickSize), lvl);
  }

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const ratio = Math.max(1, (rule.imbalancePercent || 300) / 100);
    const deltaFilter = rule.deltaFilter || 0;
    const deltaFilterEnabled = rule.deltaFilterEnabled !== false;

    const buyImbalancePrices = new Set<number>();
    const sellImbalancePrices = new Set<number>();

    for (const lvl of sortedLevels) {
      const pIdx = Math.round(lvl.price / tickSize);

      if (rule.buyDisplay) {
        const prevLvl = pIndexMap.get(pIdx - 1);
        const bid = prevLvl ? prevLvl.bidVolume : 0;
        const ask = lvl.askVolume;

        let isBuy = false;
        if (bid > 0) {
          if (ask >= bid * ratio && (!deltaFilterEnabled || (ask - bid) >= deltaFilter)) {
            isBuy = true;
          }
        } else if (!skipZero && ask > 0) {
          if (!deltaFilterEnabled || ask >= deltaFilter) {
            isBuy = true;
          }
        }
        if (isBuy) buyImbalancePrices.add(lvl.price);
      }

      if (rule.sellDisplay) {
        const nextLvl = pIndexMap.get(pIdx + 1);
        const ask = nextLvl ? nextLvl.askVolume : 0;
        const bid = lvl.bidVolume;

        let isSell = false;
        if (ask > 0) {
          if (bid >= ask * ratio && (!deltaFilterEnabled || (bid - ask) >= deltaFilter)) {
            isSell = true;
          }
        } else if (!skipZero && bid > 0) {
          if (!deltaFilterEnabled || bid >= deltaFilter) {
            isSell = true;
          }
        }
        if (isSell) sellImbalancePrices.add(lvl.price);
      }
    }

    if (rule.buyDisplay && buyImbalancePrices.size > 0) {
      const sortedBuy = Array.from(buyImbalancePrices).sort((a, b) => a - b);
      const runs: number[][] = [];
      let curRun: number[] = [];
      for (let i = 0; i < sortedBuy.length; i++) {
        if (curRun.length === 0) {
          curRun.push(sortedBuy[i]);
        } else {
          const prev = curRun[curRun.length - 1];
          if (Math.abs(sortedBuy[i] - (prev + tickSize)) < tickSize * 0.4) {
            curRun.push(sortedBuy[i]);
          } else {
            runs.push(curRun);
            curRun = [sortedBuy[i]];
          }
        }
      }
      if (curRun.length > 0) runs.push(curRun);

      const color = rule.buyColor || '#8da9c4';
      const fillColor = toRgbaWithAlpha(color, 0.22);
      const borderColor = toRgbaWithAlpha(color, 0.65);

      for (const run of runs) {
        if (showStacked && run.length >= minStackLevels) {
          zones.push({
            type: 'buy',
            startTime: bar.time,
            barIndex,
            mitigatedTime: null,
            mitigatedIndex: null,
            bottomPrice: run[0] - tickSize / 2,
            topPrice: run[run.length - 1] + tickSize / 2,
            color,
            fillColor,
            borderColor,
          });
        } else {
          for (const p of run) {
            lines.push({
              type: 'buy',
              startTime: bar.time,
              barIndex,
              mitigatedTime: null,
              mitigatedIndex: null,
              price: p,
              color,
              lineWidth: rule.buyLineWidth || 1.0,
              lineStyle: rule.buyLineStyle || 'solid',
            });
          }
        }
      }
    }

    if (rule.sellDisplay && sellImbalancePrices.size > 0) {
      const sortedSell = Array.from(sellImbalancePrices).sort((a, b) => a - b);
      const runs: number[][] = [];
      let curRun: number[] = [];
      for (let i = 0; i < sortedSell.length; i++) {
        if (curRun.length === 0) {
          curRun.push(sortedSell[i]);
        } else {
          const prev = curRun[curRun.length - 1];
          if (Math.abs(sortedSell[i] - (prev + tickSize)) < tickSize * 0.4) {
            curRun.push(sortedSell[i]);
          } else {
            runs.push(curRun);
            curRun = [sortedSell[i]];
          }
        }
      }
      if (curRun.length > 0) runs.push(curRun);

      const color = rule.sellColor || '#d8b4e2';
      const fillColor = toRgbaWithAlpha(color, 0.22);
      const borderColor = toRgbaWithAlpha(color, 0.65);

      for (const run of runs) {
        if (showStacked && run.length >= minStackLevels) {
          zones.push({
            type: 'sell',
            startTime: bar.time,
            barIndex,
            mitigatedTime: null,
            mitigatedIndex: null,
            bottomPrice: run[0] - tickSize / 2,
            topPrice: run[run.length - 1] + tickSize / 2,
            color,
            fillColor,
            borderColor,
          });
        } else {
          for (const p of run) {
            lines.push({
              type: 'sell',
              startTime: bar.time,
              barIndex,
              mitigatedTime: null,
              mitigatedIndex: null,
              price: p,
              color,
              lineWidth: rule.sellLineWidth || 1.0,
              lineStyle: rule.sellLineStyle || 'solid',
            });
          }
        }
      }
    }
  }

  return { zones, lines };
}

export class FootprintPrimitive implements ISeriesPrimitive<Time> {
  private _data: FootprintBar[] = [];
  private _options: FootprintPrimitiveOptions;
  private _attachedParam: SeriesAttachedParameter<Time, SeriesType> | null = null;
  private _paneView: FootprintPaneView;

  private _historicalZones: PrecomputedStackZone[] = [];
  private _historicalLines: PrecomputedSingleLine[] = [];
  private _unmitigatedHistoricalZones: PrecomputedStackZone[] = [];
  private _unmitigatedHistoricalLines: PrecomputedSingleLine[] = [];
  private _precomputedImbalances: PrecomputedImbalances = { stackZones: [], singleLines: [] };

  constructor(options?: Partial<FootprintPrimitiveOptions>, initialData: FootprintBar[] = []) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
    this._data = initialData;
    this._recomputeAllImbalances();
    this._paneView = new FootprintPaneView(this._data, this._options, null, null, this._precomputedImbalances);
  }

  private _getTickSize(): number {
    let globalMinDiff = Infinity;
    for (let b = 0; b < Math.min(25, this._data.length); b++) {
      const sortedPrices = this._data[b].levels.map((l) => l.price).sort((a, b) => a - b);
      for (let i = 1; i < sortedPrices.length; i++) {
        const diff = Math.round((sortedPrices[i] - sortedPrices[i - 1]) * 10000) / 10000;
        if (diff > 0.00001 && diff < globalMinDiff) {
          globalMinDiff = diff;
        }
      }
    }
    return this._options.tickSize && this._options.tickSize > 0
      ? this._options.tickSize
      : Number.isFinite(globalMinDiff) && globalMinDiff > 0
      ? globalMinDiff
      : 0.25;
  }

  private _recomputeAllImbalances(): void {
    const rules = this._options.imbalanceRules;
    if (!rules || rules.length === 0 || this._data.length === 0) {
      this._historicalZones = [];
      this._historicalLines = [];
      this._unmitigatedHistoricalZones = [];
      this._unmitigatedHistoricalLines = [];
      this._precomputedImbalances = { stackZones: [], singleLines: [] };
      return;
    }

    const settings = this._options.imbalanceGlobalSettings || {
      skipZeroValues: false,
      showStackedImbalances: true,
      showMitigatedZones: true,
      drawZoneBorders: false,
      stackedMinLevels: 3,
    };
    const tickSize = this._getTickSize();
    const data = this._data;
    const len = data.length;

    this._historicalZones = [];
    this._historicalLines = [];
    this._unmitigatedHistoricalZones = [];
    this._unmitigatedHistoricalLines = [];

    // Single forward sweep over historical bars (indices 0 to len - 2),
    // tracking only currently active unmitigated zones/lines in-place.
    const historicalEnd = len - 1;
    for (let b = 0; b < historicalEnd; b++) {
      const bar = data[b];
      const barLow = bar.low;
      const barHigh = bar.high;
      const barTime = bar.time;

      // Mitigate active zones against bar b (in-place compaction)
      let activeZoneCount = 0;
      for (let zIdx = 0; zIdx < this._unmitigatedHistoricalZones.length; zIdx++) {
        const zone = this._unmitigatedHistoricalZones[zIdx];
        if (barLow <= zone.topPrice && barHigh >= zone.bottomPrice) {
          if (b !== zone.barIndex + 1) {
            zone.mitigatedIndex = b;
            zone.mitigatedTime = barTime;
            this._historicalZones.push(zone);
          }
        } else {
          this._unmitigatedHistoricalZones[activeZoneCount++] = zone;
        }
      }
      this._unmitigatedHistoricalZones.length = activeZoneCount;

      // Mitigate active lines against bar b (in-place compaction)
      let activeLineCount = 0;
      for (let lIdx = 0; lIdx < this._unmitigatedHistoricalLines.length; lIdx++) {
        const line = this._unmitigatedHistoricalLines[lIdx];
        if (barLow <= line.price && barHigh >= line.price) {
          if (b !== line.barIndex + 1) {
            line.mitigatedIndex = b;
            line.mitigatedTime = barTime;
            this._historicalLines.push(line);
          }
        } else {
          this._unmitigatedHistoricalLines[activeLineCount++] = line;
        }
      }
      this._unmitigatedHistoricalLines.length = activeLineCount;

      const { zones, lines } = computeRawBarImbalances(bar, b, rules, settings, tickSize);
      for (let i = 0; i < zones.length; i++) {
        this._unmitigatedHistoricalZones.push(zones[i]);
      }
      for (let i = 0; i < lines.length; i++) {
        this._unmitigatedHistoricalLines.push(lines[i]);
      }
    }

    this._evaluateFormingBar();
  }

  private _evaluateFormingBar(): void {
    const data = this._data;
    if (data.length === 0) {
      this._precomputedImbalances = { stackZones: [], singleLines: [] };
      return;
    }

    const rules = this._options.imbalanceRules;
    if (!rules || rules.length === 0) {
      this._precomputedImbalances = { stackZones: [], singleLines: [] };
      return;
    }

    const settings = this._options.imbalanceGlobalSettings || {
      skipZeroValues: false,
      showStackedImbalances: true,
      showMitigatedZones: true,
      drawZoneBorders: false,
      stackedMinLevels: 3,
    };
    const tickSize = this._getTickSize();

    const lastIdx = data.length - 1;
    const formingBar = data[lastIdx];

    const finalZones: PrecomputedStackZone[] = [...this._historicalZones];
    const finalLines: PrecomputedSingleLine[] = [...this._historicalLines];

    // Evaluate unmitigated historical zones against the active forming bar
    for (const zone of this._unmitigatedHistoricalZones) {
      if (formingBar.low <= zone.topPrice && formingBar.high >= zone.bottomPrice) {
        if (lastIdx === zone.barIndex + 1) {
          // Suppressed by immediate next candle
          continue;
        }
        finalZones.push({
          ...zone,
          mitigatedIndex: lastIdx,
          mitigatedTime: formingBar.time,
        });
      } else {
        finalZones.push(zone);
      }
    }

    for (const line of this._unmitigatedHistoricalLines) {
      if (formingBar.low <= line.price && formingBar.high >= line.price) {
        if (lastIdx === line.barIndex + 1) {
          continue;
        }
        finalLines.push({
          ...line,
          mitigatedIndex: lastIdx,
          mitigatedTime: formingBar.time,
        });
      } else {
        finalLines.push(line);
      }
    }

    // Compute raw zones for active forming bar itself
    const { zones: fZones, lines: fLines } = computeRawBarImbalances(formingBar, lastIdx, rules, settings, tickSize);
    for (const z of fZones) finalZones.push(z);
    for (const l of fLines) finalLines.push(l);

    this._precomputedImbalances = { stackZones: finalZones, singleLines: finalLines };
  }

  private _syncPaneView(): void {
    this._paneView.update(
      this._data,
      this._options,
      this._attachedParam?.series ?? null,
      this._attachedParam?.chart ?? null,
      this._precomputedImbalances
    );
    this._attachedParam?.requestUpdate();
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._attachedParam = param;
    this._syncPaneView();
  }

  detached(): void {
    this._attachedParam = null;
    this._paneView.update(this._data, this._options, null, null, this._precomputedImbalances);
  }

  updateData(data: FootprintBar[], options?: Partial<FootprintPrimitiveOptions>): void {
    this._data = data;
    if (options) {
      this._options = { ...this._options, ...options };
    }
    this._recomputeAllImbalances();
    this._syncPaneView();
  }

  setData(data: FootprintBar[]): void {
    this.updateData(data);
  }

  getBar(time: number): FootprintBar | undefined {
    let lo = 0;
    let hi = this._data.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const t = this._data[mid].time;
      if (t === time) {
        return this._data[mid];
      }
      if (t < time) {
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return undefined;
  }

  getData(): FootprintBar[] {
    return this._data;
  }

  prependBars(bars: FootprintBar[]): void {
    if (!bars || bars.length === 0) return;
    const existingMap = new Map<number, FootprintBar>();
    for (const b of this._data) {
      existingMap.set(b.time, b);
    }
    for (const b of bars) {
      if (!existingMap.has(b.time)) {
        existingMap.set(b.time, b);
      }
    }
    this._data = Array.from(existingMap.values()).sort((a, b) => a.time - b.time);
    this._recomputeAllImbalances();
    this._syncPaneView();
  }

  upsertBar(bar: FootprintBar): void {
    if (this._data.length === 0) {
      this._data.push(bar);
      this._recomputeAllImbalances();
      this._syncPaneView();
      return;
    }

    const lastBar = this._data[this._data.length - 1];

    if (bar.time === lastBar.time) {
      // Invalidate cached bar profiles and filled levels for forming bar
      barProfileCache.delete(lastBar);
      filledLevelsCache.delete(lastBar);
      barProfileCache.delete(bar);
      filledLevelsCache.delete(bar);

      // 1. Updating forming bar: skip redundant map/sort when mutating the existing tip object in-place
      if (bar !== lastBar) {
        if (lastBar.levels && lastBar.levels.length > 0) {
          const levelMap = new Map<number, PriceLevelVolume>();
          for (const lvl of lastBar.levels) {
            levelMap.set(lvl.price, { ...lvl });
          }
          for (const lvl of (bar.levels || [])) {
            levelMap.set(lvl.price, lvl);
          }
          bar.levels = Array.from(levelMap.values()).sort((a, b) => a.price - b.price);
          if (bar.levels.length > 0) {
            bar.high = Math.max(bar.high, bar.levels[bar.levels.length - 1].price);
            bar.low = Math.min(bar.low > 0 ? bar.low : bar.levels[0].price, bar.levels[0].price);
          }
          bar.totalVolume = Math.max(bar.totalVolume, lastBar.totalVolume);
        }
        this._data[this._data.length - 1] = bar;
      }

      // Incremental evaluation of active forming bar only: O(1)
      this._evaluateFormingBar();
      this._syncPaneView();
      return;
    }

    if (bar.time > lastBar.time) {
      // 2. New bar formed! The previous bar is finalized into history.
      const finalizedIdx = this._data.length - 1;
      const finalizedBar = lastBar;

      const remainingUnmitigatedZones: PrecomputedStackZone[] = [];
      for (const zone of this._unmitigatedHistoricalZones) {
        if (finalizedBar.low <= zone.topPrice && finalizedBar.high >= zone.bottomPrice) {
          if (finalizedIdx !== zone.barIndex + 1) {
            zone.mitigatedIndex = finalizedIdx;
            zone.mitigatedTime = finalizedBar.time;
            this._historicalZones.push(zone);
          }
        } else {
          remainingUnmitigatedZones.push(zone);
        }
      }
      this._unmitigatedHistoricalZones = remainingUnmitigatedZones;

      const remainingUnmitigatedLines: PrecomputedSingleLine[] = [];
      for (const line of this._unmitigatedHistoricalLines) {
        if (finalizedBar.low <= line.price && finalizedBar.high >= line.price) {
          if (finalizedIdx !== line.barIndex + 1) {
            line.mitigatedIndex = finalizedIdx;
            line.mitigatedTime = finalizedBar.time;
            this._historicalLines.push(line);
          }
        } else {
          remainingUnmitigatedLines.push(line);
        }
      }
      this._unmitigatedHistoricalLines = remainingUnmitigatedLines;

      const rules = this._options.imbalanceRules;
      if (rules && rules.length > 0) {
        const settings = this._options.imbalanceGlobalSettings || {
          skipZeroValues: false,
          showStackedImbalances: true,
          showMitigatedZones: true,
          drawZoneBorders: false,
          stackedMinLevels: 3,
        };
        const tickSize = this._getTickSize();
        const { zones, lines } = computeRawBarImbalances(finalizedBar, finalizedIdx, rules, settings, tickSize);
        for (const z of zones) this._unmitigatedHistoricalZones.push(z);
        for (const l of lines) this._unmitigatedHistoricalLines.push(l);
      }

      this._data.push(bar);
      this._evaluateFormingBar();
      this._syncPaneView();
      return;
    }

    // 3. Historical backfill / out-of-order bar: full recompute
    const idx = this._data.findIndex((b) => b.time === bar.time);
    if (idx >= 0) {
      this._data[idx] = bar;
    } else {
      this._data.push(bar);
      this._data.sort((a, b) => a.time - b.time);
    }
    this._recomputeAllImbalances();
    this._syncPaneView();
  }

  setOptions(options: Partial<FootprintPrimitiveOptions>): void {
    const rulesChanged =
      options.imbalanceRules !== undefined ||
      options.imbalanceGlobalSettings !== undefined ||
      options.tickSize !== undefined;
    this._options = { ...this._options, ...options };
    if (rulesChanged) {
      this._recomputeAllImbalances();
    }
    this._syncPaneView();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }
}

export function adaptBackendFootprintBar(
  raw: any,
  findCandle?: (time: number) => { open: number; high: number; low: number; close: number; volume?: number } | undefined
): FootprintBar {
  const time = typeof raw.time === 'number' ? raw.time : Math.floor(new Date(raw.time).getTime() / 1000);
  const matchedCandle = findCandle ? findCandle(time) : undefined;

  const rawOpen = raw.candle?.open ?? raw.open ?? 0;
  const rawHigh = raw.candle?.high ?? raw.high ?? 0;
  const rawLow = raw.candle?.low ?? raw.low ?? 0;
  const rawClose = raw.candle?.close ?? raw.close ?? 0;

  // The live incoming tick/bar prices MUST be authoritative when present (> 0).
  // matchedCandle is only a secondary fallback when raw fields are missing.
  const o = rawOpen > 0 ? rawOpen : (matchedCandle?.open ?? 0);
  const h = rawHigh > 0 ? rawHigh : (matchedCandle?.high ?? 0);
  const l = rawLow > 0 ? rawLow : (matchedCandle?.low ?? 0);
  const c = rawClose > 0 ? rawClose : (matchedCandle?.close ?? 0);
  const rawVol = raw.candle?.volume ?? raw.total_volume ?? ((raw.total_bid ?? 0) + (raw.total_ask ?? 0));
  const v = rawVol > 0
    ? (matchedCandle && matchedCandle.volume ? Math.max(matchedCandle.volume, rawVol) : rawVol)
    : (matchedCandle?.volume ?? 0);
  const delta = raw.total_delta ?? raw.delta ?? 0;
  const poc = raw.poc ?? raw.pocPrice;

  const rawLevels = raw.levels || [];
  const levels: PriceLevelVolume[] = rawLevels.map((lvl: any) => {
    const bid = lvl.bid_volume ?? lvl.bidVolume ?? 0;
    const ask = lvl.ask_volume ?? lvl.askVolume ?? 0;
    const price = lvl.price;
    const isPOC = poc !== undefined ? Math.abs(price - poc) < 1e-6 : Boolean(lvl.is_poc || lvl.isPOC);
    const isImbalanceBuy = lvl.is_imbalance_buy ?? (lvl.imbalance && ask > bid) ?? (bid > 0 && ask / bid >= 3.0);
    const isImbalanceSell = lvl.is_imbalance_sell ?? (lvl.imbalance && bid > ask) ?? (ask > 0 && bid / ask >= 3.0);

    return {
      price,
      bidVolume: bid,
      askVolume: ask,
      delta: lvl.delta ?? (ask - bid),
      isPOC,
      isImbalanceBuy,
      isImbalanceSell,
    };
  });

  return {
    time,
    open: o,
    high: h,
    low: l,
    close: c,
    totalVolume: v,
    delta,
    pocPrice: poc,
    levels,
  };
}

export function synthesizeFormingFootprintBar(candle: { time: number | string; open: number; high: number; low: number; close: number; volume: number }, tickSize: number = 0.25): FootprintBar {
  const ts = tickSize > 0 ? tickSize : 0.25;
  const range = Math.max(candle.high - candle.low, ts);
  const stepCount = Math.max(1, Math.round(range / ts) + 1);
  const levels: PriceLevelVolume[] = [];
  const isBullish = candle.close >= candle.open;
  const totVol = Math.max(1, candle.volume || 10);
  const volPerStep = Math.max(1, Math.round(totVol / stepCount));
  const pocPrice = Math.round(((candle.open + 2 * candle.close + candle.high + candle.low) / 4) / ts) * ts;

  for (let s = 0; s < stepCount; s++) {
    const p = Math.round((candle.low + s * ts) / ts) * ts;
    const isPOC = Math.abs(p - pocPrice) < ts * 0.6;
    const buyRatio = isBullish ? (p >= candle.open ? 0.65 : 0.45) : (p <= candle.open ? 0.35 : 0.55);
    const askVol = Math.max(0, Math.round(volPerStep * buyRatio));
    const bidVol = Math.max(0, volPerStep - askVol);
    levels.push({
      price: p,
      bidVolume: bidVol,
      askVolume: askVol,
      delta: askVol - bidVol,
      isPOC,
    });
  }

  const timeSec = typeof candle.time === 'number' ? candle.time : Math.floor(new Date(candle.time).getTime() / 1000);

  return {
    time: timeSec,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    totalVolume: totVol,
    delta: isBullish ? totVol * 0.2 : -totVol * 0.2,
    pocPrice,
    levels,
  };
}
