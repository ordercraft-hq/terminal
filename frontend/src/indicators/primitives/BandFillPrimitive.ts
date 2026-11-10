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

export interface BandPoint {
  time: number; // Unix timestamp in seconds
  upper: number; // Upper price level
  lower: number; // Lower price level
}

class BandFillRenderer implements IPrimitivePaneRenderer {
  private _data: readonly BandPoint[];
  private _fillColor: string;
  private _series: ISeriesApi<SeriesType, Time> | null;
  private _chart: IChartApiBase<Time> | null;
  private _visible: boolean;

  constructor(
    data: readonly BandPoint[],
    fillColor: string,
    series: ISeriesApi<SeriesType, Time> | null,
    chart: IChartApiBase<Time> | null,
    visible: boolean
  ) {
    this._data = data;
    this._fillColor = fillColor;
    this._series = series;
    this._chart = chart;
    this._visible = visible;
  }

  update(
    data: readonly BandPoint[],
    fillColor: string,
    series: ISeriesApi<SeriesType, Time> | null,
    chart: IChartApiBase<Time> | null,
    visible: boolean
  ): void {
    this._data = data;
    this._fillColor = fillColor;
    this._series = series;
    this._chart = chart;
    this._visible = visible;
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (!this._visible || !this._series || !this._chart || this._data.length === 0) {
      return;
    }

    const series = this._series;
    const timeScale = this._chart.timeScale();

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      if (mediaSize.width <= 0 || mediaSize.height <= 0) return;

      ctx.save();
      ctx.fillStyle = this._fillColor || 'rgba(41, 98, 255, 0.12)';

      let currentUpper: { x: number; y: number }[] = [];
      let currentLower: { x: number; y: number }[] = [];

      const flushSegment = () => {
        if (currentUpper.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(currentUpper[0].x, currentUpper[0].y);
          for (let i = 1; i < currentUpper.length; i++) {
            ctx.lineTo(currentUpper[i].x, currentUpper[i].y);
          }
          for (let i = currentLower.length - 1; i >= 0; i--) {
            ctx.lineTo(currentLower[i].x, currentLower[i].y);
          }
          ctx.closePath();
          ctx.fill();
        }
        currentUpper = [];
        currentLower = [];
      };

      for (let i = 0; i < this._data.length; i++) {
        const pt = this._data[i];
        if (
          pt.upper === null ||
          pt.lower === null ||
          !Number.isFinite(pt.upper) ||
          !Number.isFinite(pt.lower)
        ) {
          flushSegment();
          continue;
        }

        const x = timeScale.timeToCoordinate(pt.time as Time);
        const yUpper = series.priceToCoordinate(pt.upper);
        const yLower = series.priceToCoordinate(pt.lower);

        if (
          x === null ||
          yUpper === null ||
          yLower === null ||
          !Number.isFinite(x) ||
          !Number.isFinite(yUpper) ||
          !Number.isFinite(yLower)
        ) {
          flushSegment();
          continue;
        }

        currentUpper.push({ x, y: yUpper });
        currentLower.push({ x, y: yLower });
      }

      flushSegment();
      ctx.restore();
    });
  }
}

class BandFillPaneView implements IPrimitivePaneView {
  private _renderer: BandFillRenderer;

  constructor(
    data: readonly BandPoint[],
    fillColor: string,
    series: ISeriesApi<SeriesType, Time> | null,
    chart: IChartApiBase<Time> | null,
    visible: boolean
  ) {
    this._renderer = new BandFillRenderer(data, fillColor, series, chart, visible);
  }

  update(
    data: readonly BandPoint[],
    fillColor: string,
    series: ISeriesApi<SeriesType, Time> | null,
    chart: IChartApiBase<Time> | null,
    visible: boolean
  ): void {
    this._renderer.update(data, fillColor, series, chart, visible);
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

export class BandFillPrimitive implements ISeriesPrimitive<Time> {
  private _data: BandPoint[] = [];
  private _fillColor: string;
  private _visible: boolean = true;
  private _attachedParam: SeriesAttachedParameter<Time, SeriesType> | null = null;
  private _paneView: BandFillPaneView;

  constructor(fillColor: string = 'rgba(41, 98, 255, 0.12)', initialData: BandPoint[] = []) {
    this._fillColor = fillColor;
    this._data = initialData;
    this._paneView = new BandFillPaneView(this._data, this._fillColor, null, null, this._visible);
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._attachedParam = param;
    this._paneView.update(this._data, this._fillColor, param.series, param.chart, this._visible);
    this._attachedParam.requestUpdate();
  }

  detached(): void {
    this._attachedParam = null;
    this._paneView.update(this._data, this._fillColor, null, null, this._visible);
  }

  updateData(data: BandPoint[], fillColor?: string, visible?: boolean): void {
    this._data = data;
    if (fillColor !== undefined) {
      this._fillColor = fillColor;
    }
    if (visible !== undefined) {
      this._visible = visible;
    }
    this._paneView.update(
      this._data,
      this._fillColor,
      this._attachedParam?.series ?? null,
      this._attachedParam?.chart ?? null,
      this._visible
    );
    this._attachedParam?.requestUpdate();
  }

  updatePoint(pt: BandPoint): void {
    if (this._data.length > 0 && this._data[this._data.length - 1].time === pt.time) {
      this._data[this._data.length - 1] = pt;
    } else {
      this._data.push(pt);
    }
    this._paneView.update(
      this._data,
      this._fillColor,
      this._attachedParam?.series ?? null,
      this._attachedParam?.chart ?? null,
      this._visible
    );
    this._attachedParam?.requestUpdate();
  }

  setFillColor(color: string): void {
    this._fillColor = color;
    this._paneView.update(
      this._data,
      this._fillColor,
      this._attachedParam?.series ?? null,
      this._attachedParam?.chart ?? null,
      this._visible
    );
    this._attachedParam?.requestUpdate();
  }

  setVisible(visible: boolean): void {
    this._visible = visible;
    this._paneView.update(
      this._data,
      this._fillColor,
      this._attachedParam?.series ?? null,
      this._attachedParam?.chart ?? null,
      this._visible
    );
    this._attachedParam?.requestUpdate();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }
}
