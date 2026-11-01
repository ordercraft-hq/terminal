import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  Time,
  PrimitivePaneViewZOrder,
  SeriesType,
  ISeriesApi,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';

export interface PriceCountdownData {
  price: number | null;
  countdown: string;
  showCountdown: boolean;
  visible?: boolean;
  pricePrecision: number;
  priceFormatted?: string;
  badgeBgColor?: string;
}

class PriceCountdownRenderer implements IPrimitivePaneRenderer {
  private _data: PriceCountdownData;
  private _series: ISeriesApi<SeriesType, Time> | null;

  constructor(data: PriceCountdownData, series: ISeriesApi<SeriesType, Time> | null) {
    this._data = data;
    this._series = series;
  }

  updateData(data: PriceCountdownData, series: ISeriesApi<SeriesType, Time> | null) {
    this._data = data;
    this._series = series;
  }

  draw(target: CanvasRenderingTarget2D) {
    const { price, countdown, showCountdown, visible = true, pricePrecision, priceFormatted, badgeBgColor } = this._data;
    if (!visible || price === null || !this._series) return;

    let y: number | null = null;
    try {
      y = this._series.priceToCoordinate(price);
    } catch {
      return;
    }
    if (y === null || isNaN(y)) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const w = mediaSize.width;
      if (w <= 0 || y === null || y < -40 || y > mediaSize.height + 40) return;

      const hasCountdown = showCountdown && !!countdown;
      const h = hasCountdown ? 32 : 20;
      const top = Math.round(y - 10);

      ctx.save();

      // 1. Sleek slate-grey unified badge background (#4c525e / #50535e)
      ctx.fillStyle = badgeBgColor || '#4c525e';
      const radius = 3;

      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        // [top-left, top-right, bottom-right, bottom-left]
        ctx.roundRect(0, top, w - 1, h, [0, radius, radius, 0]);
      } else {
        ctx.rect(0, top, w - 1, h);
      }
      ctx.fill();

      // 2. Format Price with comma thousands separator
      let priceStr = priceFormatted;
      if (!priceStr) {
        priceStr = price.toLocaleString('en-US', {
          minimumFractionDigits: pricePrecision,
          maximumFractionDigits: pricePrecision,
        });
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const centerX = Math.round((w - 1) / 2);

      if (hasCountdown) {
        // Line 1: Current Price (bold crisp white, 12px) - aligns directly with chart's dashed price line at y
        ctx.font = 'bold 12px "JetBrains Mono", -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(priceStr, centerX, top + 10);

        // Line 2: Countdown to bar close (soft pro grey, 10.5px) - nested within the single unified component
        ctx.font = '500 10.5px "JetBrains Mono", -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';
        ctx.fillStyle = '#d1d4dc';
        ctx.fillText(countdown, centerX, top + 23);
      } else {
        // Single Line: Price only (bold crisp white, 12px)
        ctx.font = 'bold 12px "JetBrains Mono", -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(priceStr, centerX, top + 10);
      }

      ctx.restore();
    });
  }
}

class PriceCountdownPaneView implements IPrimitivePaneView {
  private _renderer: PriceCountdownRenderer;

  constructor(data: PriceCountdownData, series: ISeriesApi<SeriesType, Time> | null) {
    this._renderer = new PriceCountdownRenderer(data, series);
  }

  updateData(data: PriceCountdownData, series: ISeriesApi<SeriesType, Time> | null) {
    this._renderer.updateData(data, series);
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'top';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

export class PriceCountdownPrimitive implements ISeriesPrimitive<Time> {
  private _data: PriceCountdownData;
  private _paneView: PriceCountdownPaneView;
  private _attachedParam: SeriesAttachedParameter<Time, SeriesType> | null = null;

  constructor(initialData: PriceCountdownData) {
    this._data = initialData;
    this._paneView = new PriceCountdownPaneView(initialData, null);
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>) {
    this._attachedParam = param;
    this._paneView.updateData(this._data, param.series);
  }

  detached() {
    this._attachedParam = null;
    this._paneView.updateData(this._data, null);
  }

  updateData(data: Partial<PriceCountdownData>) {
    this._data = { ...this._data, ...data };
    this._paneView.updateData(this._data, this._attachedParam?.series ?? null);
    this._attachedParam?.requestUpdate();
  }

  priceAxisPaneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }
}
