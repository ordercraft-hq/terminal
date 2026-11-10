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
};

function formatVol(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) {
    return `${(val / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${(val / 1_000).toFixed(1)}k`;
  }
  return val % 1 === 0 ? val.toString() : val.toFixed(1);
}

class FootprintRenderer implements IPrimitivePaneRenderer {
  private _data: readonly FootprintBar[];
  private _options: FootprintPrimitiveOptions;
  private _series: ISeriesApi<SeriesType, Time> | null;
  private _chart: IChartApiBase<Time> | null;

  constructor(
    data: readonly FootprintBar[],
    options: FootprintPrimitiveOptions,
    series: ISeriesApi<SeriesType, Time> | null,
    chart: IChartApiBase<Time> | null
  ) {
    this._data = data;
    this._options = options;
    this._series = series;
    this._chart = chart;
  }

  update(
    data: readonly FootprintBar[],
    options: FootprintPrimitiveOptions,
    series: ISeriesApi<SeriesType, Time> | null,
    chart: IChartApiBase<Time> | null
  ): void {
    this._data = data;
    this._options = options;
    this._series = series;
    this._chart = chart;
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (!this._options.visible || !this._series || !this._chart || this._data.length === 0) {
      return;
    }

    const series = this._series;
    const chart = this._chart;
    const timeScale = chart.timeScale();

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      if (mediaSize.width <= 0 || mediaSize.height <= 0) return;

      // Compute dynamic bar width
      let barWidth = 36;
      if (this._data.length >= 2) {
        const x0 = timeScale.timeToCoordinate(this._data[0].time as Time);
        const x1 = timeScale.timeToCoordinate(this._data[1].time as Time);
        if (x0 !== null && x1 !== null && Number.isFinite(x0) && Number.isFinite(x1)) {
          barWidth = Math.max(12, Math.min(140, Math.abs(x1 - x0) * 0.82));
        }
      }

      const showText = this._options.showText && barWidth >= 42;
      const pocBoxColor = this._options.pocColor || '#ffb700';

      ctx.save();
      ctx.font = '9px "JetBrains Mono", Consolas, monospace';

      for (let b = 0; b < this._data.length; b++) {
        const bar = this._data[b];
        const x = timeScale.timeToCoordinate(bar.time as Time);
        if (x === null || !Number.isFinite(x) || x < -barWidth || x > mediaSize.width + barWidth) {
          continue;
        }

        const halfWidth = barWidth / 2;
        const left = x - halfWidth;

        // Find max level volume for proportional heat fill
        let maxLevelVol = 1;
        let detectedPocPrice = bar.pocPrice;
        let maxTotal = -1;

        for (let l = 0; l < bar.levels.length; l++) {
          const lvl = bar.levels[l];
          const tot = lvl.bidVolume + lvl.askVolume;
          if (tot > maxTotal) {
            maxTotal = tot;
            if (detectedPocPrice === undefined) {
              detectedPocPrice = lvl.price;
            }
          }
          if (tot > maxLevelVol) {
            maxLevelVol = tot;
          }
        }

        // Determine slice height
        let levelHeight = 12;
        if (bar.levels.length >= 2) {
          const y0 = series.priceToCoordinate(bar.levels[0].price);
          const y1 = series.priceToCoordinate(bar.levels[1].price);
          if (y0 !== null && y1 !== null && Number.isFinite(y0) && Number.isFinite(y1)) {
            levelHeight = Math.max(3, Math.min(40, Math.abs(y0 - y1)));
          }
        }

        for (let l = 0; l < bar.levels.length; l++) {
          const lvl = bar.levels[l];
          const y = series.priceToCoordinate(lvl.price);
          if (y === null || !Number.isFinite(y) || y < -30 || y > mediaSize.height + 30) {
            continue;
          }

          const top = y - levelHeight / 2;
          const isPOC =
            this._options.showPOC &&
            (lvl.isPOC ||
              (detectedPocPrice !== undefined && Math.abs(lvl.price - detectedPocPrice) < 1e-6));

          // Bid volume fill (left side: center x towards left)
          const bidRatio = Math.min(1, lvl.bidVolume / maxLevelVol);
          const bidW = Math.max(0, bidRatio * (halfWidth - 1));
          ctx.fillStyle = `rgba(242, 54, 69, ${Math.max(0.12, bidRatio * 0.55)})`;
          ctx.fillRect(x - bidW, top, bidW, levelHeight - 1);

          // Ask volume fill (right side: center x towards right)
          const askRatio = Math.min(1, lvl.askVolume / maxLevelVol);
          const askW = Math.max(0, askRatio * (halfWidth - 1));
          ctx.fillStyle = `rgba(8, 153, 129, ${Math.max(0.12, askRatio * 0.55)})`;
          ctx.fillRect(x, top, askW, levelHeight - 1);

          // Imbalance highlight
          if (this._options.showImbalance) {
            if (lvl.isImbalanceSell) {
              ctx.strokeStyle = '#f23645';
              ctx.lineWidth = 1;
              ctx.strokeRect(left, top, halfWidth, levelHeight - 1);
            } else if (lvl.isImbalanceBuy) {
              ctx.strokeStyle = '#089981';
              ctx.lineWidth = 1;
              ctx.strokeRect(x, top, halfWidth, levelHeight - 1);
            }
          }

          // Point of Control (POC) box
          if (isPOC) {
            ctx.strokeStyle = pocBoxColor;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(left, top, barWidth, levelHeight - 1);
          }

          // Numbers text
          if (showText && levelHeight >= 9) {
            ctx.textBaseline = 'middle';
            const textY = y;

            ctx.textAlign = 'right';
            ctx.fillStyle = lvl.bidVolume > 0 ? '#d1d4dc' : '#787b86';
            ctx.fillText(formatVol(lvl.bidVolume), x - 2, textY);

            ctx.textAlign = 'left';
            ctx.fillStyle = lvl.askVolume > 0 ? '#ffffff' : '#787b86';
            ctx.fillText(formatVol(lvl.askVolume), x + 2, textY);
          }
        }

        // Center separator line
        ctx.strokeStyle = '#2a2e39';
        ctx.lineWidth = 1;
        const yHigh = series.priceToCoordinate(bar.high);
        const yLow = series.priceToCoordinate(bar.low);
        if (
          yHigh !== null &&
          yLow !== null &&
          Number.isFinite(yHigh) &&
          Number.isFinite(yLow)
        ) {
          ctx.beginPath();
          ctx.moveTo(x, Math.min(yHigh, yLow) - levelHeight / 2);
          ctx.lineTo(x, Math.max(yHigh, yLow) + levelHeight / 2);
          ctx.stroke();
        }

        // Delta indicator below bar
        if (this._options.showDelta && yLow !== null && Number.isFinite(yLow)) {
          const deltaVal = bar.delta;
          const deltaText = `${deltaVal >= 0 ? '+' : ''}${formatVol(deltaVal)}`;
          const bottomY = yHigh !== null && Number.isFinite(yHigh) ? Math.max(yHigh, yLow) : yLow;
          const badgeY = bottomY + levelHeight + 6;
          ctx.font = 'bold 9px "JetBrains Mono", Consolas, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = deltaVal >= 0 ? '#089981' : '#f23645';
          ctx.fillText(deltaText, x, badgeY);
          ctx.font = '9px "JetBrains Mono", Consolas, monospace';
        }
      }

      ctx.restore();
    });
  }
}

class FootprintPaneView implements IPrimitivePaneView {
  private _renderer: FootprintRenderer;

  constructor(
    data: readonly FootprintBar[],
    options: FootprintPrimitiveOptions,
    series: ISeriesApi<SeriesType, Time> | null,
    chart: IChartApiBase<Time> | null
  ) {
    this._renderer = new FootprintRenderer(data, options, series, chart);
  }

  update(
    data: readonly FootprintBar[],
    options: FootprintPrimitiveOptions,
    series: ISeriesApi<SeriesType, Time> | null,
    chart: IChartApiBase<Time> | null
  ): void {
    this._renderer.update(data, options, series, chart);
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

export class FootprintPrimitive implements ISeriesPrimitive<Time> {
  private _data: FootprintBar[] = [];
  private _options: FootprintPrimitiveOptions;
  private _attachedParam: SeriesAttachedParameter<Time, SeriesType> | null = null;
  private _paneView: FootprintPaneView;

  constructor(options?: Partial<FootprintPrimitiveOptions>, initialData: FootprintBar[] = []) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
    this._data = initialData;
    this._paneView = new FootprintPaneView(this._data, this._options, null, null);
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._attachedParam = param;
    this._paneView.update(this._data, this._options, param.series, param.chart);
    this._attachedParam.requestUpdate();
  }

  detached(): void {
    this._attachedParam = null;
    this._paneView.update(this._data, this._options, null, null);
  }

  updateData(data: FootprintBar[], options?: Partial<FootprintPrimitiveOptions>): void {
    this._data = data;
    if (options) {
      this._options = { ...this._options, ...options };
    }
    this._paneView.update(
      this._data,
      this._options,
      this._attachedParam?.series ?? null,
      this._attachedParam?.chart ?? null
    );
    this._attachedParam?.requestUpdate();
  }

  setOptions(options: Partial<FootprintPrimitiveOptions>): void {
    this._options = { ...this._options, ...options };
    this._paneView.update(
      this._data,
      this._options,
      this._attachedParam?.series ?? null,
      this._attachedParam?.chart ?? null
    );
    this._attachedParam?.requestUpdate();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }
}
