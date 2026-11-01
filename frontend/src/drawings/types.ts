import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Candle } from '../transport/client';
import type { LogicalAnchor, DrawingToolType, UserDrawing } from '../store/syncStore';

export type { LogicalAnchor, DrawingToolType, UserDrawing };

export type LineEndCap = 'normal' | 'arrow' | 'circle';
export type StatsMode = 'hidden' | 'bars' | 'price' | 'date_time' | 'all';
export type StatsPosition = 'left' | 'center' | 'right';
export type TextAlignment = 'left' | 'center' | 'right';
export type TextVerticalAlignment = 'top' | 'middle' | 'bottom';

export interface DrawingVisibility {
  seconds?: boolean;
  minutes?: boolean;
  hours?: boolean;
  days?: boolean;
  weeks?: boolean;
  months?: boolean;
}

export interface TrendlineOptions {
  extendLeft?: boolean;
  extendRight?: boolean;
  extend?: boolean;
  leftEnd?: LineEndCap;
  rightEnd?: LineEndCap;
  showMiddlePoint?: boolean;
  showPriceLabels?: boolean;
  showPriceLabel?: boolean;
  showTimeLabel?: boolean;
  showBarsRange?: boolean;
  stats?: StatsMode;
  statsPosition?: StatsPosition;
  alwaysShowStats?: boolean;
  // Text Tab
  showText?: boolean;
  text?: string;
  textColor?: string;
  textSize?: number;
  textOrientation?: 'horizontal' | 'vertical';
  textAlignment?: TextAlignment;
  textVerticalAlignment?: TextVerticalAlignment;
  textBold?: boolean;
  textItalic?: boolean;
  // Visibility Tab
  visibility?: DrawingVisibility;
}

export interface PathOptions {
  leftEnd?: LineEndCap;
  rightEnd?: LineEndCap;
  visibility?: DrawingVisibility;
}

export type BandsCalcMode = 'stdev' | 'percentage';
export type VWAPSource = 'hlc3' | 'close' | 'open' | 'high' | 'low' | 'hl2' | 'ohlc4';

export interface AnchoredVWAPOptions {
  calcMode?: BandsCalcMode;
  source?: VWAPSource;
  // Multipliers & Enables
  band1?: boolean;
  mult1?: number;
  band2?: boolean;
  mult2?: number;
  band3?: boolean;
  mult3?: number;
  // Style
  color?: string;
  lineWidth?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  // Band 1
  showUpperBand1?: boolean;
  upperBand1Color?: string;
  upperBand1Width?: number;
  upperBand1Style?: 'solid' | 'dashed' | 'dotted';
  showLowerBand1?: boolean;
  lowerBand1Color?: string;
  lowerBand1Width?: number;
  lowerBand1Style?: 'solid' | 'dashed' | 'dotted';
  showBackground1?: boolean;
  background1Color?: string;
  // Band 2
  showUpperBand2?: boolean;
  upperBand2Color?: string;
  upperBand2Width?: number;
  upperBand2Style?: 'solid' | 'dashed' | 'dotted';
  showLowerBand2?: boolean;
  lowerBand2Color?: string;
  lowerBand2Width?: number;
  lowerBand2Style?: 'solid' | 'dashed' | 'dotted';
  // Band 3
  showUpperBand3?: boolean;
  upperBand3Color?: string;
  upperBand3Width?: number;
  upperBand3Style?: 'solid' | 'dashed' | 'dotted';
  showLowerBand3?: boolean;
  lowerBand3Color?: string;
  lowerBand3Width?: number;
  lowerBand3Style?: 'solid' | 'dashed' | 'dotted';
  // Price label
  showPriceLabel?: boolean;
  // Visibility Tab
  visibility?: DrawingVisibility;
}
export type FRVPRowsLayout = 'number_of_rows' | 'ticks_per_row';
export type FRVPVolumeType = 'up_down' | 'total' | 'delta';
export type FRVPPlacement = 'left' | 'right';

export interface FRVPOptions {
  // Inputs Tab
  rowsLayout?: FRVPRowsLayout;
  rowSize?: number;
  volume?: FRVPVolumeType;
  valueAreaVolume?: number;
  extendRight?: boolean;

  // Style Tab
  showVolumeProfile?: boolean;
  showValues?: boolean;
  valuesColor?: string;
  widthPercent?: number;
  placement?: FRVPPlacement;

  // Volume Colors
  upVolumeColor?: string;
  downVolumeColor?: string;
  valueAreaUpColor?: string;
  valueAreaDownColor?: string;

  // Key Levels
  showVAH?: boolean;
  vahColor?: string;
  vahWidth?: number;
  vahStyle?: 'solid' | 'dashed' | 'dotted';

  showVAL?: boolean;
  valColor?: string;
  valWidth?: number;
  valStyle?: 'solid' | 'dashed' | 'dotted';

  showPOC?: boolean;
  pocColor?: string;
  pocWidth?: number;
  pocStyle?: 'solid' | 'dashed' | 'dotted';

  showDevelopingPOC?: boolean;
  devPocColor?: string;
  devPocWidth?: number;
  devPocStyle?: 'solid' | 'dashed' | 'dotted';

  showDevelopingVA?: boolean;
  devVaColor?: string;
  devVaWidth?: number;
  devVaStyle?: 'solid' | 'dashed' | 'dotted';

  // Histogram Box
  histogramBoxColor?: string;

  // Guideline & Boundary lines
  lineColor?: string;
  lineWidth?: number;
  showPriceLabels?: boolean;

  // Visibility Tab
  visibility?: DrawingVisibility;
}

export type AVPRowsLayout = 'number_of_rows' | 'ticks_per_row';
export type AVPVolumeType = 'up_down' | 'total' | 'delta';
export type AVPPlacement = 'left' | 'right';

export interface AVPOptions {
  // Inputs Tab
  rowsLayout?: AVPRowsLayout;
  rowSize?: number;
  volume?: AVPVolumeType;
  valueAreaVolume?: number;

  // Style Tab
  showVolumeProfile?: boolean;
  showValues?: boolean;
  valuesColor?: string;
  widthPercent?: number;
  placement?: AVPPlacement;

  // Volume Colors
  upVolumeColor?: string;
  downVolumeColor?: string;
  valueAreaUpColor?: string;
  valueAreaDownColor?: string;

  // Key Levels
  showVAH?: boolean;
  vahColor?: string;
  vahWidth?: number;
  vahStyle?: 'solid' | 'dashed' | 'dotted';

  showVAL?: boolean;
  valColor?: string;
  valWidth?: number;
  valStyle?: 'solid' | 'dashed' | 'dotted';

  showPOC?: boolean;
  pocColor?: string;
  pocWidth?: number;
  pocStyle?: 'solid' | 'dashed' | 'dotted';

  showDevelopingPOC?: boolean;
  devPocColor?: string;
  devPocWidth?: number;
  devPocStyle?: 'solid' | 'dashed' | 'dotted';

  showDevelopingVA?: boolean;
  devVaColor?: string;
  devVaWidth?: number;
  devVaStyle?: 'solid' | 'dashed' | 'dotted';

  // Histogram Box
  histogramBoxColor?: string;

  // Price & Status Line Labels
  showPriceLabels?: boolean;
  valuesInStatusLine?: boolean;
  showTimeLabel?: boolean;

  // Visibility Tab
  visibility?: DrawingVisibility;
}

export interface DrawingRenderContext {
  ctx: CanvasRenderingContext2D;
  chart: IChartApi;
  series: ISeriesApi<'Candlestick'>;
  candles: Candle[];
  width: number;
  height: number;
  priceScaleWidth?: number;
  totalWidth?: number;
  priceDecimals: number;
  timeframe?: string;
  timezone?: string;
  isSelected: boolean;
  isHovered?: boolean;
  isDraft: boolean;
  pixelRatio: number;
  anchorToCoordinates: (anchor: LogicalAnchor) => { x: number; y: number } | null;
  canvasToAnchor: (x: number, y: number) => LogicalAnchor | null;
}

export interface DrawingHandle {
  x: number;
  y: number;
  index: number;
  type?: 'vertex' | 'middle' | 'special';
  cursor?: string;
}

export interface HitTestResult {
  hit: boolean;
  handleIndex: number; // >= 0: specific anchor handle; -1: body/segment; -2: midpoint/special
  cursor?: string;
}

/**
 * Checks whether a drawing should be visible on the given timeframe
 * according to its options.visibility settings.
 */
export function isDrawingVisibleOnTimeframe(
  drawing: UserDrawing,
  timeframe: string
): boolean {
  const opts = drawing.options as { visibility?: DrawingVisibility } | undefined;
  if (!opts || !opts.visibility) return true;
  const vis = opts.visibility;
  const rawTf = (timeframe || '').trim();
  const tf = rawTf.toLowerCase();

  // 1. Seconds: 1s, 5s, 15s, 30s
  if (tf.endsWith('s')) {
    return vis.seconds !== false;
  }

  // 2. Hours: 1h, 2h, 4h, etc.
  if (tf.endsWith('h')) {
    return vis.hours !== false;
  }

  // 3. Days: 1d, 1D, d, D
  if (tf.endsWith('d')) {
    return vis.days !== false;
  }

  // 4. Weeks: 1w, 1W, w, W
  if (tf.endsWith('w')) {
    return vis.weeks !== false;
  }

  // 5. Months: 1M, M, 1mo, mo
  if (rawTf === '1M' || rawTf === 'M' || tf.includes('mo')) {
    return vis.months !== false;
  }

  // 6. Minutes: 1m, 3m, 5m, 15m, 30m, 45m (or pure number)
  if (tf.endsWith('m') || (!isNaN(Number(tf)) && Number(tf) > 0)) {
    return vis.minutes !== false;
  }

  return true;
}

