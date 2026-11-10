// ORDERCRAFT Discontinuous Line Custom Series Plugin for lightweight-charts v5
// Eliminates diagonal bridge lines across trend transitions and renders single-bar regimes visibly.
// Strictly adheres to AGENTS.md § 2.2, § 2.4, § 3.2: strict: true, ZERO any types allowed.

import type {
  ICustomSeriesPaneView,
  ICustomSeriesPaneRenderer,
  PaneRendererCustomData,
  CustomBarItemData,
  CustomSeriesOptions,
  CustomSeriesPricePlotValues,
  CustomSeriesWhitespaceData,
  PriceToCoordinateConverter,
  ISeriesApi,
  Time,
} from 'lightweight-charts';
import {
  LineStyle,
  LineType,
  customSeriesDefaultOptions,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';

export interface DiscontinuousLineData {
  time: Time;
  value: number;
  color?: string;
  customValues?: Record<string, unknown>;
}

export interface DiscontinuousLineOptions extends CustomSeriesOptions {
  color: string;
  lineWidth?: number;
  lineStyle?: LineStyle;
  lineType?: LineType;
  pointMarkersVisible?: boolean;
  pointMarkersRadius?: number;
}

export type DiscontinuousLineSeriesApi = ISeriesApi<
  'Custom',
  Time,
  DiscontinuousLineData,
  DiscontinuousLineOptions,
  Partial<DiscontinuousLineOptions>
>;

export class DiscontinuousLineRenderer implements ICustomSeriesPaneRenderer {
  private _data: PaneRendererCustomData<Time, DiscontinuousLineData> | null = null;
  private _options: DiscontinuousLineOptions | null = null;

  public update(
    data: PaneRendererCustomData<Time, DiscontinuousLineData>,
    options: DiscontinuousLineOptions
  ): void {
    this._data = data;
    this._options = options;
  }

  public draw(
    target: CanvasRenderingTarget2D,
    priceConverter: PriceToCoordinateConverter,
    _isHovered: boolean,
    _hitTestData?: unknown
  ): void {
    if (!this._data || !this._options || this._data.bars.length === 0) {
      return;
    }

    const { bars, barSpacing, visibleRange } = this._data;
    if (!visibleRange || visibleRange.to <= visibleRange.from) {
      return;
    }

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      if (mediaSize.width <= 0 || mediaSize.height <= 0) return;

      const options = this._options;
      if (!options) return;

      ctx.save();
      const lineWidth = Math.max(1, options.lineWidth || 2);
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = options.color || '#2962ff';

      // Configure dash pattern matching LineStyle enum
      if (options.lineStyle === LineStyle.Dashed) {
        ctx.setLineDash([lineWidth * 3, lineWidth * 3]);
      } else if (options.lineStyle === LineStyle.Dotted) {
        ctx.setLineDash([lineWidth, lineWidth * 2]);
      } else {
        ctx.setLineDash([]);
      }

      const isStepLine = options.lineType === LineType.WithSteps;
      let inSegment = false;
      let segmentLength = 0;
      let segmentStartX = 0;
      let segmentStartY = 0;
      let lastX = 0;
      let lastY = 0;
      let prevBarIndex = 0;

      const flushSegment = () => {
        if (inSegment) {
          if (segmentLength === 1) {
            // SINGLE-BAR REGIME GUARANTEE:
            // An isolated 1-bar regime path has zero length and draws nothing with moveTo alone.
            // Render a crisp horizontal bar tick centered across the candle.
            const halfTick = Math.max(2, barSpacing * 0.35);
            ctx.beginPath();
            ctx.moveTo(segmentStartX - halfTick, segmentStartY);
            ctx.lineTo(segmentStartX + halfTick, segmentStartY);
            ctx.stroke();
          } else {
            ctx.stroke();
          }
          inSegment = false;
        }
      };

      const from = Math.max(0, visibleRange.from - 1);
      const to = Math.min(bars.length, visibleRange.to + 1);

      for (let i = from; i < to; i++) {
        const bar: CustomBarItemData<Time, DiscontinuousLineData> = bars[i];
        const rawVal = bar.originalData?.value;

        // Skip missing or non-finite values cleanly
        if (rawVal === null || rawVal === undefined || !Number.isFinite(rawVal)) {
          flushSegment();
          continue;
        }

        const y = priceConverter(rawVal);
        if (y === null || !Number.isFinite(y)) {
          flushSegment();
          continue;
        }

        const x = bar.x;

        // DISCONTINUITY & GAP DETECTION:
        // A gap occurs if:
        // 1. Logical time scale index difference != 1 (missing candle between points)
        // 2. Physical horizontal distance > 1.5 * barSpacing or reversed (x - lastX < 0)
        const isTimeIndexGap = inSegment && (bar.time !== prevBarIndex + 1);
        const isPhysicalGap = inSegment && ((x - lastX) > barSpacing * 1.5 || (x - lastX) < 0);
        const isGap = isTimeIndexGap || isPhysicalGap;

        if (!inSegment || isGap) {
          flushSegment();
          ctx.beginPath();
          ctx.moveTo(x, y);
          inSegment = true;
          segmentLength = 1;
          segmentStartX = x;
          segmentStartY = y;
        } else {
          if (isStepLine) {
            ctx.lineTo(x, lastY);
            ctx.lineTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          segmentLength++;
        }

        lastX = x;
        lastY = y;
        prevBarIndex = bar.time; // In CustomBarItemData, bar.time is the logical time scale index
      }

      flushSegment();

      // Render point markers if requested (e.g. plotType === 'circles' || 'cross')
      if (options.pointMarkersVisible) {
        const radius = options.pointMarkersRadius || lineWidth / 2 + 2;
        ctx.fillStyle = options.color || '#2962ff';
        for (let i = visibleRange.from; i < visibleRange.to; i++) {
          const bar = bars[i];
          const val = bar.originalData?.value;
          if (val !== null && val !== undefined && Number.isFinite(val)) {
            const y = priceConverter(val);
            if (y !== null && Number.isFinite(y)) {
              ctx.beginPath();
              ctx.arc(bar.x, y, radius, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      ctx.restore();
    });
  }
}

export class DiscontinuousLinePaneView
  implements ICustomSeriesPaneView<Time, DiscontinuousLineData, DiscontinuousLineOptions>
{
  private _renderer: DiscontinuousLineRenderer = new DiscontinuousLineRenderer();
  private _options: DiscontinuousLineOptions;

  constructor(options?: Partial<DiscontinuousLineOptions>) {
    this._options = {
      ...customSeriesDefaultOptions,
      color: '#2962ff',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      lineType: LineType.Simple,
      ...options,
    };
  }

  public renderer(): ICustomSeriesPaneRenderer {
    return this._renderer;
  }

  public update(
    data: PaneRendererCustomData<Time, DiscontinuousLineData>,
    seriesOptions: DiscontinuousLineOptions
  ): void {
    this._options = seriesOptions;
    this._renderer.update(data, seriesOptions);
  }

  public priceValueBuilder(plotRow: DiscontinuousLineData): CustomSeriesPricePlotValues {
    return [plotRow.value];
  }

  public isWhitespace(
    data: DiscontinuousLineData | CustomSeriesWhitespaceData<Time>
  ): data is CustomSeriesWhitespaceData<Time> {
    return (data as DiscontinuousLineData).value === undefined || (data as DiscontinuousLineData).value === null;
  }

  public defaultOptions(): DiscontinuousLineOptions {
    return this._options;
  }

  public destroy(): void {
    // Zero persistent event listeners or timers
  }
}

/**
 * Checks whether a plot is a multi-regime discontinuous line series.
 */
export function isDiscontinuousPlot(_indicatorId: string, plotId: string): boolean {
  if (plotId === 'up' || plotId === 'down') return true;
  if (plotId === 'bull' || plotId === 'bear') return true;
  return false;
}
