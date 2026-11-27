import type {
  IChartApiBase,
  ISeriesApi,
  SeriesType,
  Time,
  IPriceLine,
  SeriesMarker,
  HistogramData,
  AutoscaleInfoProvider,
  AutoscaleInfo,
} from 'lightweight-charts';
import {
  LineSeries,
  HistogramSeries,
  LineType,
  LineStyle,
} from 'lightweight-charts';
import { BandFillPrimitive, type BandPoint } from './primitives/BandFillPrimitive';
import { FootprintPrimitive, type FootprintBar } from './primitives/FootprintPrimitive';
import {
  DiscontinuousLinePaneView,
  type DiscontinuousLineSeriesApi,
  isDiscontinuousPlot,
} from './primitives/DiscontinuousLinePaneView';
import type {
  IndicatorInstance,
  IndicatorPlotDataPoint,
  IndicatorPlotStyle,
  IndicatorBandStyle,
} from './types';
import { INDICATOR_REGISTRY } from './registry';
import { normalizeIndicatorId } from './migration';
import {
  transport,
  type Candle,
  type IndicatorEvalResponsePayload,
  type IndicatorStreamUpdate,
} from '../transport/client';
import type { ChartVisualSettings } from '../store/syncStore';

const MAX_CACHED_CANDLES = 5000;

function isIndicatorVisibleOnTimeframe(ind: IndicatorInstance, timeframe: string): boolean {
  const vis = ind.visibility;
  if (!vis) return true;
  const rawTf = (timeframe || '').trim();
  const tf = rawTf.toLowerCase();
  if (tf.endsWith('t')) return vis.ticks !== false;
  if (tf.endsWith('s')) return vis.seconds !== false;
  if (tf.endsWith('h')) return vis.hours !== false;
  if (tf.endsWith('d')) return vis.days !== false;
  if (tf.endsWith('w') || rawTf === '1M' || rawTf === 'M' || tf.includes('mo')) return vis.weeks !== false;
  if (tf.endsWith('m') || (!isNaN(Number(tf)) && Number(tf) > 0)) return vis.minutes !== false;
  return true;
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSerialize(obj[k])}`).join(',')}}`;
}

export function isVolumeIndicatorType(type: string): boolean {
  return type === 'volume' || type === 'wickra.volume';
}

export const LEGACY_INDICATOR_MIGRATION_MAP: Record<string, string> = {
  volume: 'wickra.volume',
  sma: 'wickra.sma',
  ema: 'wickra.ema',
  wma: 'wickra.wma',
  hma: 'wickra.hma',
  vwap: 'wickra.vwap',
  bollinger_bands: 'wickra.bollinger_bands',
  keltner_channels: 'wickra.keltner_channels',
  supertrend: 'wickra.supertrend',
  parabolic_sar: 'wickra.parabolic_sar',
  rsi: 'wickra.rsi',
  macd: 'wickra.macd',
  stochastic: 'wickra.stochastic',
  stoch_rsi: 'wickra.stoch_rsi',
  atr: 'wickra.atr',
  cci: 'wickra.cci',
  williams_r: 'wickra.williams_r',
  adx: 'wickra.adx',
  obv: 'wickra.obv',
  adl: 'wickra.adl',
  anchored_vwap: 'wickra.anchored_vwap',
  avwap: 'wickra.anchored_vwap',
};

export function getIndicatorLineStyle(style?: 'solid' | 'dashed' | 'dotted'): LineStyle {
  if (style === 'dashed') return LineStyle.Dashed;
  if (style === 'dotted') return LineStyle.Dotted;
  return LineStyle.Solid;
}

export interface ManagedIndicatorEntry {
  instanceId: string;
  indicatorId: string;
  paneIndex: number;
  series: Map<string, ISeriesApi<SeriesType, Time>>;
  bands: Map<string, BandFillPrimitive>;
  bandAttachedSeries?: Map<string, ISeriesApi<SeriesType, Time>>;
  footprints: Map<string, FootprintPrimitive>;
  priceLines: IPriceLine[];
  latestValues: Record<string, number | null>;
  cachedPlots: Record<string, IndicatorPlotDataPoint[]>;
  markers: Map<string, SeriesMarker<Time>[]>;
  autoscaleProviders: Map<string, AutoscaleInfoProvider>;
  latestIndicator?: IndicatorInstance;
  levelsSignature?: string;
  priceLinesHost?: ISeriesApi<SeriesType, Time>;
  appliedStyleSignatures?: Record<string, string>;
}

export interface EvalIndicatorInstancePayload {
  instanceId: string;
  indicatorId: string;
  inputs: Record<string, unknown>;
}

export type EvalResultPayload = IndicatorEvalResponsePayload['results'][number];
export type { IndicatorEvalResponsePayload };

export interface IndicatorBroadcastMessagePayload {
  type: string;
  symbol: string;
  resolution: string;
  time: number;
  plots: Record<string, Record<string, number>>;
}

export interface UniversalIndicatorConnectorOptions {
  onLatestValuesChange?: (values: Record<string, Record<string, number | null>>) => void;
  onPanesAdjusted?: () => void;
}

export class UniversalIndicatorConnector {
  private chart: IChartApiBase<Time>;
  private paneId: string;
  private symbol: string;
  private resolution: string;
  private options: UniversalIndicatorConnectorOptions;

  private managed: Map<string, ManagedIndicatorEntry> = new Map();
  private currentIndicators: IndicatorInstance[] = [];
  private lastCandles: Candle[] = [];
  private mainPaneIndex: number = 0;

  // Multiplexed WebSocket real-time streaming state & eval dirty tracking
  private streamUnsubscribe: (() => void) | null = null;
  private activeStreamSubKey = '';
  private streamRafId: number | null = null;
  private pendingStreamUpdates: Map<number, Record<string, Record<string, number>>> = new Map();
  private lastEvalKeyMap: Map<string, string> = new Map();
  private lastEvalCandlesSig = '';
  private isDestroyed = false;
  private evalEpoch = 0;
  private hudUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingHudUpdate = false;

  constructor(
    chart: IChartApiBase<Time>,
    paneId: string,
    symbol: string,
    resolution: string,
    options: UniversalIndicatorConnectorOptions = {}
  ) {
    this.chart = chart;
    this.paneId = paneId;
    this.symbol = symbol;
    this.resolution = resolution;
    this.options = options;
  }

  public updateContext(symbol: string, resolution: string): void {
    const symbolChanged = this.symbol !== symbol;
    const resChanged = this.resolution !== resolution;
    this.symbol = symbol;
    this.resolution = resolution;

    if (symbolChanged || resChanged) {
      this.cancelPendingStreamBatch();
      if (this.streamUnsubscribe) {
        try {
          this.streamUnsubscribe();
        } catch {}
        this.streamUnsubscribe = null;
      }
      this.activeStreamSubKey = '';
      this.lastEvalCandlesSig = '';
    }
  }

  public getPaneId(): string {
    return this.paneId;
  }

  public getLastCandles(): Candle[] {
    return this.lastCandles;
  }

  public getManagedEntries(): Map<string, ManagedIndicatorEntry> {
    return this.managed;
  }

  public setMainPaneIndex(idx: number): void {
    this.mainPaneIndex = idx;
  }

  public swapIndicatorPanes(idxA: number, idxB: number): void {
    if (this.mainPaneIndex === idxA) {
      this.mainPaneIndex = idxB;
    } else if (this.mainPaneIndex === idxB) {
      this.mainPaneIndex = idxA;
    }
    for (const entry of this.managed.values()) {
      if (entry.paneIndex === idxA) {
        entry.paneIndex = idxB;
      } else if (entry.paneIndex === idxB) {
        entry.paneIndex = idxA;
      }
    }
    try {
      if (idxA !== this.mainPaneIndex) {
        (this.chart as any).priceScale?.('right', idxA)?.applyOptions?.({
          autoScale: true,
          scaleMargins: { top: 0.1, bottom: 0.1 },
        });
      }
      if (idxB !== this.mainPaneIndex) {
        (this.chart as any).priceScale?.('right', idxB)?.applyOptions?.({
          autoScale: true,
          scaleMargins: { top: 0.1, bottom: 0.1 },
        });
      }
    } catch {}
  }

  public updateChartSettings(settings: ChartVisualSettings): void {
    for (const entry of this.managed.values()) {
      for (const pl of entry.priceLines) {
        try {
          pl.applyOptions({
            axisLabelTextColor: settings.scalesTextColor || '#d1d4dc',
          });
        } catch {}
      }
    }
  }

  /**
   * Fast HUD inspection: binary search the cached plot points for a given timestamp.
   */
  public getValuesAtTime(time: Time | number): Record<string, Record<string, number | null>> {
    const numericTime = typeof time === 'number' ? time : Number(time);
    const result: Record<string, Record<string, number | null>> = {};
    for (const [id, entry] of this.managed.entries()) {
      result[id] = {};
      for (const [plotId, pts] of Object.entries(entry.cachedPlots)) {
        if (!pts || pts.length === 0) {
          result[id][plotId] = null;
          continue;
        }
        let low = 0;
        let high = pts.length - 1;
        let foundVal: number | null = null;
        while (low <= high) {
          const mid = (low + high) >> 1;
          const pt = pts[mid];
          if (pt.time === numericTime) {
            foundVal = pt.value;
            break;
          } else if (pt.time < numericTime) {
            low = mid + 1;
          } else {
            high = mid - 1;
          }
        }
        result[id][plotId] = foundVal;
      }
    }
    return result;
  }

  public getLatestValues(): Record<string, Record<string, number | null>> {
    const result: Record<string, Record<string, number | null>> = {};
    for (const [id, entry] of this.managed.entries()) {
      result[id] = { ...entry.latestValues };
    }
    return result;
  }

  /**
   * Synchronizes indicator definitions, subpanes, series, and triggers off-thread calculation
   * only when indicator type/inputs or underlying candles change.
   */
  public async syncIndicators(
    indicators: IndicatorInstance[],
    candles: Candle[],
    paneOrder: string[],
    chartSettings: ChartVisualSettings,
    customStretchFactors: Record<string, number> = {},
    containerElement?: HTMLElement | null
  ): Promise<void> {
    if (this.isDestroyed || !this.chart) return;

    this.currentIndicators = [...indicators];
    this.lastCandles =
      candles.length > MAX_CACHED_CANDLES ? candles.slice(-MAX_CACHED_CANDLES) : [...candles];

    // 1. Remove deleted indicators
    const currentIds = new Set(indicators.map((ind) => ind.id));
    let anyDeleted = false;
    for (const [id, entry] of Array.from(this.managed.entries())) {
      if (!currentIds.has(id)) {
        anyDeleted = true;
        this.cleanupEntry(entry);
        this.managed.delete(id);
        this.lastEvalKeyMap.delete(id);
      }
    }
    if (anyDeleted) {
      this.evalEpoch++;
    }

    // 2. Adjust chart subpanes layout (remove empty panes, add missing panes)
    const currentSubpaneIds = new Set(
      indicators.filter((i) => i.category === 'subpane').map((i) => i.id)
    );
    let nextOrder = paneOrder.filter(
      (id) => id === 'main' || currentSubpaneIds.has(id)
    );
    if (!nextOrder.includes('main')) {
      nextOrder = ['main', ...nextOrder];
    }
    for (const ind of indicators) {
      if (ind.category === 'subpane' && !nextOrder.includes(ind.id)) {
        nextOrder.push(ind.id);
      }
    }

    const requiredPanes = nextOrder.length;
    let panesChanged = false;
    try {
      const existingPanes = this.chart.panes();
      for (let i = existingPanes.length - 1; i >= 0; i--) {
        if (this.chart.panes().length > requiredPanes && existingPanes[i].getSeries().length === 0) {
          this.chart.removePane(i);
          panesChanged = true;
        }
      }
      while (this.chart.panes().length < requiredPanes) {
        this.chart.addPane();
        panesChanged = true;
      }
    } catch (err) {
      console.warn('[UniversalIndicatorConnector] Pane setup error:', err);
    }

    const mainVIdx = nextOrder.indexOf('main') !== -1 ? nextOrder.indexOf('main') : 0;
    this.mainPaneIndex = mainVIdx;

    const paneAssignment = new Map<string, number>();
    for (const ind of indicators) {
      if (ind.category === 'overlay') {
        paneAssignment.set(ind.id, mainVIdx);
      } else {
        const vIdx = nextOrder.indexOf(ind.id);
        paneAssignment.set(ind.id, vIdx !== -1 ? vIdx : 1);
      }
    }

    // 3. Allocate/reconcile series structure for each active indicator (using moveToPane when pane changed)
    for (const ind of indicators) {
      const targetPane = paneAssignment.get(ind.id) ?? mainVIdx;
      let entry = this.managed.get(ind.id);
      let paneChanged = false;

      if (entry && entry.indicatorId !== ind.type) {
        this.cleanupEntry(entry);
        entry = undefined;
      }

      if (!entry) {
        entry = {
          instanceId: ind.id,
          indicatorId: ind.type,
          paneIndex: targetPane,
          series: new Map(),
          bands: new Map(),
          bandAttachedSeries: new Map(),
          footprints: new Map(),
          priceLines: [],
          latestValues: {},
          cachedPlots: {},
          markers: new Map(),
          autoscaleProviders: new Map(),
          latestIndicator: ind,
          appliedStyleSignatures: {},
        };
        this.managed.set(ind.id, entry);
      } else {
        entry.latestIndicator = ind;
        if (entry.paneIndex !== targetPane) {
          paneChanged = true;
          for (const s of entry.series.values()) {
            try {
              if (typeof s.moveToPane === 'function') {
                s.moveToPane(targetPane);
              }
            } catch {}
          }
          entry.paneIndex = targetPane;
        }
      }

      this.ensureIndicatorSeries(ind, entry, targetPane, mainVIdx, chartSettings, paneChanged);
      this.syncLevels(ind, entry, chartSettings);
      this.syncBands(ind, entry);
    }

    // Remove any remaining excess panes after series have been moved to target panes
    try {
      while (this.chart.panes().length > requiredPanes && this.chart.panes().length > 1) {
        this.chart.removePane(this.chart.panes().length - 1);
        panesChanged = true;
      }

      this.chart.panes().forEach((_, pIdx) => {
        this.chart.priceScale('right', pIdx).applyOptions({
          textColor: chartSettings.scalesTextColor || '#787b86',
          borderColor: chartSettings.scalesLineColor || '#2a2e39',
          ...(pIdx !== mainVIdx
            ? {
                autoScale: true,
                scaleMargins: { top: 0.1, bottom: 0.1 },
              }
            : {}),
        });
      });

      if (panesChanged) {
        const curPanes = this.chart.panes();
        if (curPanes.length > 1) {
          curPanes[0].setStretchFactor(customStretchFactors['main'] ?? 75);
          const subCount = curPanes.length - 1;
          for (let p = 1; p < curPanes.length; p++) {
            const indId = nextOrder[p];
            const saved = indId ? customStretchFactors[indId] : undefined;
            curPanes[p].setStretchFactor(saved ?? Math.round(25 / subCount));
          }
          if (containerElement) {
            this.chart.applyOptions({
              width: containerElement.clientWidth,
              height: containerElement.clientHeight,
            });
          }
        }
        this.options.onPanesAdjusted?.();
      }
    } catch (err) {
      console.warn('[UniversalIndicatorConnector] Pane finalization error:', err);
    }

    // 4. Evaluate off-thread only for indicators whose type/inputs or candles changed;
    // style/visibility/band/level-only edits are applied strictly client-side.
    await this.evaluateOffThread(candles);

    // 5. Connect/resubscribe shared multiplexed WebSocket streaming stream
    this.resubscribeStream();
  }

  private getOrCreateAutoscaleProvider(
    entry: ManagedIndicatorEntry,
    plotId: string
  ): AutoscaleInfoProvider {
    const existing = entry.autoscaleProviders.get(plotId);
    if (existing) return existing;

    const provider: AutoscaleInfoProvider = (
      original: () => AutoscaleInfo | null
    ): AutoscaleInfo | null => {
      const res = original();
      let min = res?.priceRange ? res.priceRange.minValue : Infinity;
      let max = res?.priceRange ? res.priceRange.maxValue : -Infinity;

      // 1. Expand range to include indicator reference levels (e.g. RSI 70/30, Stoch 80/20)
      const levels = entry.latestIndicator?.levels;
      if (levels && levels.length > 0) {
        for (const lvl of levels) {
          if (lvl.visible !== false && typeof lvl.value === 'number' && Number.isFinite(lvl.value)) {
            if (lvl.value < min) min = lvl.value;
            if (lvl.value > max) max = lvl.value;
          }
        }
      }

      // 2. Expand range to guarantee indicator last value is always centered and in view
      const latestVal = entry.latestValues[plotId];
      if (typeof latestVal === 'number' && Number.isFinite(latestVal)) {
        if (latestVal < min) min = latestVal;
        if (latestVal > max) max = latestVal;
      }

      // 3. Fallback if no valid points, levels, or latest values exist yet
      if (min === Infinity || max === -Infinity) {
        if (res && res.priceRange) return res;
        return null;
      }

      // 4. Handle flat/degenerate zero-height ranges (e.g. constant line or single point)
      if (min === max) {
        const pad = min !== 0 ? Math.abs(min) * 0.05 : 1;
        min -= pad;
        max += pad;
      }

      return {
        priceRange: { minValue: min, maxValue: max },
        margins: res?.margins,
      };
    };

    entry.autoscaleProviders.set(plotId, provider);
    return provider;
  }

  private ensureIndicatorSeries(
    ind: IndicatorInstance,
    entry: ManagedIndicatorEntry,
    targetPane: number,
    mainVIdx: number,
    chartSettings: ChartVisualSettings,
    paneChanged = false
  ): void {
    const isVolumeIndicator = isVolumeIndicatorType(ind.type);
    const priceScaleId =
      targetPane === mainVIdx ? (isVolumeIndicator ? 'overlay_volume' : 'right') : 'right';

    const def = INDICATOR_REGISTRY[ind.type] || INDICATOR_REGISTRY[normalizeIndicatorId(ind.type)];
    const effectiveStyles: Record<string, IndicatorPlotStyle> = {
      ...(def?.defaultStyles || {}),
      ...(ind.styles || {}),
    };

    const tfVisible = isIndicatorVisibleOnTimeframe(ind, this.resolution);
    for (const [plotId, style] of Object.entries(effectiveStyles)) {
      const isVisible = ind.visible && tfVisible && (style ? style.visible !== false : true);
      const isHistogram = style?.plotType === 'histogram';
      const showPriceScale =
        (ind.showLabelsOnPriceScale !== false) &&
        (style?.lastValueVisible !== false) &&
        (chartSettings.indicatorsPriceScaleMode !== 'Hidden');

      const plotDirective = def?.plots?.find((p) => p.id === plotId);
      const isPlotOverlay = plotDirective ? plotDirective.overlay !== false : (style?.overlay !== false);

      let plotPriceScaleId = priceScaleId;
      if (targetPane === mainVIdx && !isVolumeIndicator && !isPlotOverlay) {
        plotPriceScaleId = `overlay_${ind.id}_${plotId}`;
      }

      const autoscaleInfoProvider: AutoscaleInfoProvider | undefined =
        targetPane !== mainVIdx ? this.getOrCreateAutoscaleProvider(entry, plotId) : undefined;

      let seriesApi = entry.series.get(plotId);
      if (!seriesApi) {
        try {
          if (isHistogram) {
            seriesApi = this.chart.addSeries(
              HistogramSeries,
              {
                color: style?.color || '#089981',
                priceFormat: isVolumeIndicator ? { type: 'volume' } : undefined,
                priceScaleId: plotPriceScaleId,
                visible: isVisible,
                lastValueVisible: showPriceScale,
                priceLineVisible: false,
                autoscaleInfoProvider,
              },
              targetPane
            );
            if (targetPane === mainVIdx) {
              if (isVolumeIndicator) {
                seriesApi.priceScale().applyOptions({
                  scaleMargins: { top: 0.8, bottom: 0 },
                });
              } else if (!isPlotOverlay) {
                seriesApi.priceScale().applyOptions({
                  scaleMargins: { top: 0.75, bottom: 0.02 },
                });
              }
            }
          } else if (isDiscontinuousPlot(ind.type, plotId)) {
            // =========================================================================
            // DISCONTINUOUS MULTI-STATE SERIES (Supertrend, Tillson T3, Trailing Stops)
            // =========================================================================
            const defaultRegimeColor = plotId === 'down' ? '#F23645' : '#089981';
            const customPaneView = new DiscontinuousLinePaneView({
              color: style?.color || defaultRegimeColor,
              lineWidth: (style?.lineWidth || 2) as 1 | 2 | 3 | 4,
              lineStyle: getIndicatorLineStyle(style?.lineStyle),
              lineType: style?.plotType === 'stepline' ? LineType.WithSteps : LineType.Simple,
              pointMarkersVisible: style?.plotType === 'circles' || style?.plotType === 'cross',
              pointMarkersRadius: 3,
            });

            seriesApi = this.chart.addCustomSeries(
              customPaneView,
              {
                color: style?.color || defaultRegimeColor,
                priceScaleId: plotPriceScaleId,
                priceFormat: isVolumeIndicator ? { type: 'volume' } : undefined,
                visible: isVisible,
                lastValueVisible: showPriceScale,
                priceLineVisible: Boolean(style?.priceLineVisible),
                autoscaleInfoProvider,
              },
              targetPane
            ) as unknown as ISeriesApi<SeriesType, Time>;
            if (targetPane === mainVIdx) {
              if (isVolumeIndicator) {
                seriesApi.priceScale().applyOptions({
                  scaleMargins: { top: 0.8, bottom: 0 },
                });
              } else if (!isPlotOverlay) {
                seriesApi.priceScale().applyOptions({
                  scaleMargins: { top: 0.75, bottom: 0.02 },
                });
              }
            }
          } else {
            seriesApi = this.chart.addSeries(
              LineSeries,
              {
                color: style?.color || '#2962ff',
                lineWidth: (style?.lineWidth || 2) as 1 | 2 | 3 | 4,
                lineStyle: getIndicatorLineStyle(style?.lineStyle),
                lineType: style?.plotType === 'stepline' ? LineType.WithSteps : LineType.Simple,
                pointMarkersVisible: style?.plotType === 'circles' || style?.plotType === 'cross',
                pointMarkersRadius: 3,
                crosshairMarkerVisible: false,
                priceScaleId: plotPriceScaleId,
                priceFormat: isVolumeIndicator ? { type: 'volume' } : undefined,
                visible: isVisible,
                lastValueVisible: showPriceScale,
                priceLineVisible: Boolean(style?.priceLineVisible),
                autoscaleInfoProvider,
              },
              targetPane
            );
            if (targetPane === mainVIdx) {
              if (isVolumeIndicator) {
                seriesApi.priceScale().applyOptions({
                  scaleMargins: { top: 0.8, bottom: 0 },
                });
              } else if (!isPlotOverlay) {
                seriesApi.priceScale().applyOptions({
                  scaleMargins: { top: 0.75, bottom: 0.02 },
                });
              }
            }
          }

          if (targetPane !== mainVIdx) {
            seriesApi.priceScale().applyOptions({
              textColor: chartSettings.scalesTextColor || '#787b86',
              borderColor: chartSettings.scalesLineColor || '#2a2e39',
              autoScale: true,
              scaleMargins: { top: 0.1, bottom: 0.1 },
            });
          } else {
            seriesApi.priceScale().applyOptions({
              textColor: chartSettings.scalesTextColor || '#787b86',
              borderColor: chartSettings.scalesLineColor || '#2a2e39',
            });
          }

          entry.series.set(plotId, seriesApi);
        } catch (err) {
          console.warn(`[UniversalIndicatorConnector] Failed to create series for ${ind.id}:${plotId}:`, err);
        }
      } else {
        try {
          if (targetPane !== mainVIdx) {
            seriesApi.priceScale().applyOptions({
              autoScale: true,
              scaleMargins: { top: 0.1, bottom: 0.1 },
            });
          } else if (!isPlotOverlay) {
            seriesApi.priceScale().applyOptions({
              scaleMargins: { top: 0.75, bottom: 0.02 },
            });
          }
          const paneAutoscalePatch = paneChanged ? { autoscaleInfoProvider } : {};
          if (isHistogram) {
            seriesApi.applyOptions({
              color: style?.color || '#089981',
              visible: isVisible,
              lastValueVisible: showPriceScale,
              priceLineVisible: false,
              ...paneAutoscalePatch,
            });
          } else if (isDiscontinuousPlot(ind.type, plotId)) {
            const defaultRegimeColor = plotId === 'down' ? '#F23645' : '#089981';
            (seriesApi as unknown as DiscontinuousLineSeriesApi).applyOptions({
              color: style?.color || defaultRegimeColor,
              lineWidth: (style?.lineWidth || 2) as 1 | 2 | 3 | 4,
              lineStyle: getIndicatorLineStyle(style?.lineStyle),
              lineType: style?.plotType === 'stepline' ? LineType.WithSteps : LineType.Simple,
              pointMarkersVisible: style?.plotType === 'circles' || style?.plotType === 'cross',
              visible: isVisible,
              lastValueVisible: showPriceScale,
              priceLineVisible: Boolean(style?.priceLineVisible),
              ...paneAutoscalePatch,
            });
          } else {
            seriesApi.applyOptions({
              color: style?.color || '#2962ff',
              lineWidth: (style?.lineWidth || 2) as 1 | 2 | 3 | 4,
              lineStyle: getIndicatorLineStyle(style?.lineStyle),
              lineType: style?.plotType === 'stepline' ? LineType.WithSteps : LineType.Simple,
              pointMarkersVisible: style?.plotType === 'circles' || style?.plotType === 'cross',
              crosshairMarkerVisible: false,
              visible: isVisible,
              lastValueVisible: showPriceScale,
              priceLineVisible: Boolean(style?.priceLineVisible),
              ...paneAutoscalePatch,
            });
          }
        } catch {}
      }
    }
  }

  private syncLevels(
    ind: IndicatorInstance,
    entry: ManagedIndicatorEntry,
    _chartSettings: ChartVisualSettings
  ): void {
    const firstSeries = Array.from(entry.series.values())[0];
    const nextLevelsSig = stableSerialize(ind.levels || []);

    if (entry.levelsSignature === nextLevelsSig && entry.priceLinesHost === firstSeries) {
      return;
    }

    if (entry.priceLines.length > 0) {
      const host = entry.priceLinesHost || firstSeries;
      if (host) {
        for (const pl of entry.priceLines) {
          try {
            host.removePriceLine(pl);
          } catch {}
        }
      }
      entry.priceLines = [];
    }

    entry.levelsSignature = nextLevelsSig;
    entry.priceLinesHost = firstSeries;

    if (!ind.levels || ind.levels.length === 0 || !firstSeries) {
      return;
    }

    for (const lvl of ind.levels) {
      if (lvl.visible !== false) {
        try {
          const rawLabel = (lvl.label || '').trim();
          const isOverbought = /overbought|upper/i.test(rawLabel) || lvl.value === 70 || lvl.value === 80;
          const isOversold = /oversold|lower/i.test(rawLabel) || lvl.value === 30 || lvl.value === 20;
          const isMidline = /midline|middle|zero/i.test(rawLabel) || lvl.value === 50;

          let effectiveColor = lvl.color;
          if (!effectiveColor || effectiveColor === '#787B86' || effectiveColor === '#787b86' || effectiveColor === '#434651') {
            if (isOverbought) effectiveColor = '#F23645';
            else if (isOversold) effectiveColor = '#089981';
            else if (isMidline) effectiveColor = '#787B86';
          }

          // Strip redundant trailing numbers like "(70)" so title badge cleanly reads "Overbought"
          const cleanTitle = (rawLabel || `${lvl.value}`).replace(/\s*\(\s*[-+]?\d*\.?\d+\s*\)\s*$/, '');

          const pl = firstSeries.createPriceLine({
            price: lvl.value,
            color: effectiveColor,
            lineWidth: (lvl.lineWidth || 1) as 1 | 2 | 3 | 4,
            lineStyle: getIndicatorLineStyle(lvl.lineStyle),
            axisLabelVisible: true,
            title: cleanTitle,
            axisLabelColor: effectiveColor,
            axisLabelTextColor: '#FFFFFF',
          });
          entry.priceLines.push(pl);
        } catch {}
      }
    }
  }

  private syncBands(ind: IndicatorInstance, entry: ManagedIndicatorEntry): void {
    const def = INDICATOR_REGISTRY[ind.type] || INDICATOR_REGISTRY[normalizeIndicatorId(ind.type)];
    const effectiveBands =
      ind.bands && ind.bands.length > 0
        ? ind.bands
        : (def?.defaultBands || []);

    if (!entry.bandAttachedSeries) {
      entry.bandAttachedSeries = new Map();
    }

    if (effectiveBands.length === 0) {
      for (const [id, bandPrim] of entry.bands.entries()) {
        const attached = entry.bandAttachedSeries.get(id) || Array.from(entry.series.values())[0];
        if (attached) {
          try {
            attached.detachPrimitive(bandPrim);
          } catch {}
        }
      }
      entry.bands.clear();
      entry.bandAttachedSeries.clear();
      return;
    }

    const firstSeries = Array.from(entry.series.values())[0];
    if (!firstSeries) return;

    // Helper to pick the best visible host series for this band
    const findTargetSeries = (band: IndicatorBandStyle) => {
      const upperSeries = entry.series.get(band.upperPlotId);
      const lowerSeries = entry.series.get(band.lowerPlotId);
      const upperVisible = ind.styles[band.upperPlotId]?.visible !== false;
      const lowerVisible = ind.styles[band.lowerPlotId]?.visible !== false;

      if (upperSeries && upperVisible) return upperSeries;
      if (lowerSeries && lowerVisible) return lowerSeries;

      for (const [pId, s] of entry.series.entries()) {
        if (ind.styles[pId]?.visible !== false) {
          return s;
        }
      }
      return upperSeries || lowerSeries || firstSeries;
    };

    const currentBandIds = new Set(effectiveBands.map((b) => b.id));
    for (const [id, bandPrim] of entry.bands.entries()) {
      if (!currentBandIds.has(id)) {
        const attached = entry.bandAttachedSeries.get(id) || firstSeries;
        if (attached) {
          try {
            attached.detachPrimitive(bandPrim);
          } catch {}
        }
        entry.bands.delete(id);
        entry.bandAttachedSeries.delete(id);
      }
    }

    for (const band of effectiveBands) {
      const targetSeries = findTargetSeries(band);
      if (!targetSeries) continue;

      let bandPrim = entry.bands.get(band.id);
      const currentAttached = entry.bandAttachedSeries.get(band.id);

      if (!bandPrim) {
        bandPrim = new BandFillPrimitive(band.fillColor);
        bandPrim.setVisible(band.visible !== false);
        try {
          targetSeries.attachPrimitive(bandPrim);
          entry.bands.set(band.id, bandPrim);
          entry.bandAttachedSeries.set(band.id, targetSeries);
        } catch (err) {
          console.warn('[UniversalIndicatorConnector] Failed to attach BandFillPrimitive:', err);
        }
      } else {
        bandPrim.setFillColor(band.fillColor);
        bandPrim.setVisible(band.visible !== false);
        if (currentAttached && currentAttached !== targetSeries) {
          try {
            currentAttached.detachPrimitive(bandPrim);
            targetSeries.attachPrimitive(bandPrim);
            entry.bandAttachedSeries.set(band.id, targetSeries);
          } catch (err) {
            console.warn('[UniversalIndicatorConnector] Failed to reattach BandFillPrimitive:', err);
          }
        }
      }
    }
  }

  private applyPlotSeriesData(
    ind: IndicatorInstance,
    entry: ManagedIndicatorEntry,
    plotId: string,
    points: IndicatorPlotDataPoint[],
    candleMap: Map<number, Candle>
  ): void {
    const seriesApi = entry.series.get(plotId);
    if (!seriesApi) return;

    const style = ind.styles[plotId];
    const isHistogram = style?.plotType === 'histogram';
    const isDiscontinuous = isDiscontinuousPlot(ind.type, plotId);
    const defaultRegimeColor = plotId === 'down' ? '#F23645' : '#089981';

    try {
      if (isHistogram) {
        const colorUp = style?.colorUp || style?.color || '#089981';
        const colorDown = style?.colorDown || '#f23645';
        const histData: HistogramData<Time>[] = points.map((pt) => {
          const candle = candleMap.get(pt.time);
          const isUp = candle ? candle.close >= candle.open : pt.value >= 0;
          return {
            time: pt.time as Time,
            value: pt.value,
            color: pt.color || (isUp ? colorUp : colorDown),
          };
        });
        seriesApi.setData(histData);
      } else if (isDiscontinuous) {
        seriesApi.setData(
          points.map((pt) => ({
            time: pt.time as Time,
            value: pt.value,
            color: pt.color || style?.color || defaultRegimeColor,
          }))
        );
      } else {
        seriesApi.setData(
          points.map((pt) => ({
            time: pt.time as Time,
            value: pt.value,
            ...(pt.color ? { color: pt.color } : {}),
          }))
        );
      }

      if (entry.paneIndex !== this.mainPaneIndex) {
        this.chart.priceScale('right', entry.paneIndex).applyOptions({
          autoScale: true,
          scaleMargins: { top: 0.1, bottom: 0.1 },
        });
      }
    } catch (err) {
      console.warn(`[UniversalIndicatorConnector] Failed to setData on ${ind.id}:${plotId}`, err);
    }

    if (!entry.appliedStyleSignatures) entry.appliedStyleSignatures = {};
    entry.appliedStyleSignatures[plotId] = `${style?.color || ''}|${style?.colorUp || ''}|${style?.colorDown || ''}|${style?.plotType || ''}`;
  }

  private refreshBandsFromCache(ind: IndicatorInstance, entry: ManagedIndicatorEntry): void {
    const def = INDICATOR_REGISTRY[ind.type] || INDICATOR_REGISTRY[normalizeIndicatorId(ind.type)];
    const effectiveBands =
      ind.bands && ind.bands.length > 0
        ? ind.bands
        : (def?.defaultBands || []);

    if (effectiveBands.length === 0) return;

    for (const band of effectiveBands) {
      const bandPrim = entry.bands.get(band.id);
      if (!bandPrim) continue;

      const upperPts = entry.cachedPlots[band.upperPlotId] || [];
      const lowerPts = entry.cachedPlots[band.lowerPlotId] || [];

      const lowerMap = new Map<number, number>();
      for (let i = 0; i < lowerPts.length; i++) {
        lowerMap.set(lowerPts[i].time, lowerPts[i].value);
      }

      const bandPoints: BandPoint[] = [];
      for (let i = 0; i < upperPts.length; i++) {
        const t = upperPts[i].time;
        const lowVal = lowerMap.get(t);
        if (lowVal !== undefined) {
          bandPoints.push({
            time: t,
            upper: upperPts[i].value,
            lower: lowVal,
          });
        }
      }

      bandPrim.updateData(bandPoints, band.fillColor, band.visible !== false);
    }
  }

  /**
   * Evaluates indicators strictly off the main thread:
   * 1. Volume is mapped directly from candle volume (no math).
   * 2. Technical indicators are evaluated via POST /api/indicators/eval in Go ONLY when
   *    candles changed or an indicator's type/inputs changed.
   */
  private async evaluateOffThread(candles: Candle[]): Promise<void> {
    if (candles.length === 0 || this.currentIndicators.length === 0) return;
    const currentEpoch = ++this.evalEpoch;

    const firstTime = candles[0]?.time ?? 0;
    const lastCandle = candles[candles.length - 1];
    const candlesSig = `${this.symbol}|${this.resolution}|${candles.length}|${firstTime}|${lastCandle?.time ?? 0}|${lastCandle?.close ?? 0}|${lastCandle?.volume ?? 0}`;
    const candlesChanged = this.lastEvalCandlesSig !== candlesSig;
    this.lastEvalCandlesSig = candlesSig;

    let candleMap: Map<number, Candle> | null = null;
    const getCandleMap = (): Map<number, Candle> => {
      if (!candleMap) {
        candleMap = new Map<number, Candle>();
        for (let i = 0; i < candles.length; i++) {
          candleMap.set(candles[i].time, candles[i]);
        }
      }
      return candleMap;
    };

    // 1. Process volume indicator directly from OHLCV candles (only when candles or volume colors changed)
    for (const ind of this.currentIndicators) {
      if (isVolumeIndicatorType(ind.type)) {
        const entry = this.managed.get(ind.id);
        if (!entry) continue;

        const volStyle = ind.styles['vol'];
        const volStyleSig = `${volStyle?.colorUp || ''}|${volStyle?.colorDown || ''}|${volStyle?.color || ''}`;
        const volStyleChanged = entry.appliedStyleSignatures?.['vol'] !== volStyleSig;
        if (!candlesChanged && !volStyleChanged && entry.cachedPlots['vol']?.length) {
          continue;
        }

        const volSeries = entry.series.get('vol');
        if (volSeries) {
          const colorUp = volStyle?.colorUp || volStyle?.color || '#089981';
          const colorDown = volStyle?.colorDown || '#f23645';
          const histData: HistogramData<Time>[] = candles.map((c) => ({
            time: c.time as Time,
            value: c.volume,
            color: c.close >= c.open ? colorUp : colorDown,
          }));
          try {
            volSeries.setData(histData);
            if (entry.paneIndex !== this.mainPaneIndex) {
              this.chart.priceScale('right', entry.paneIndex).applyOptions({
                autoScale: true,
                scaleMargins: { top: 0.1, bottom: 0.1 },
              });
            }
          } catch {}

          entry.cachedPlots['vol'] = candles.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? colorUp : colorDown,
          }));
          entry.latestValues['vol'] = lastCandle ? lastCandle.volume : null;
          if (!entry.appliedStyleSignatures) entry.appliedStyleSignatures = {};
          entry.appliedStyleSignatures['vol'] = volStyleSig;
        }
      }
    }

    // 2. Partition non-volume indicators into dirty (needs Go eval) vs style/visibility-only (client-side only)
    const dirtyOffThreadIndicators: EvalIndicatorInstancePayload[] = [];
    const dirtyEvalKeys = new Map<string, string>();

    for (const ind of this.currentIndicators) {
      if (isVolumeIndicatorType(ind.type)) continue;

      const entry = this.managed.get(ind.id);
      const evalKey = `${ind.type}|${stableSerialize(ind.inputs || {})}`;
      const hasCachedPlots = entry ? Object.keys(entry.cachedPlots).length > 0 : false;
      const needsEval = candlesChanged || this.lastEvalKeyMap.get(ind.id) !== evalKey || !hasCachedPlots;

      if (needsEval) {
        dirtyOffThreadIndicators.push({
          instanceId: ind.id,
          indicatorId: LEGACY_INDICATOR_MIGRATION_MAP[ind.type] || ind.type,
          inputs: (ind.inputs || {}) as Record<string, unknown>,
        });
        dirtyEvalKeys.set(ind.id, evalKey);
      } else if (entry) {
        // Apply any style-driven data coloring updates (e.g. histogram colorUp/colorDown or discontinuous color)
        for (const [plotId, pts] of Object.entries(entry.cachedPlots)) {
          const style = ind.styles[plotId];
          const nextSig = `${style?.color || ''}|${style?.colorUp || ''}|${style?.colorDown || ''}|${style?.plotType || ''}`;
          const prevSig = entry.appliedStyleSignatures?.[plotId];
          if (
            prevSig !== nextSig &&
            (style?.plotType === 'histogram' || isDiscontinuousPlot(ind.type, plotId))
          ) {
            this.applyPlotSeriesData(ind, entry, plotId, pts, getCandleMap());
          } else if (entry.appliedStyleSignatures) {
            entry.appliedStyleSignatures[plotId] = nextSig;
          }
        }
        this.refreshBandsFromCache(ind, entry);
      }
    }

    if (dirtyOffThreadIndicators.length === 0) {
      this.options.onLatestValuesChange?.(this.getLatestValues());
      return;
    }

    try {
      const evalData = await transport.evaluateIndicators({
        symbol: this.symbol,
        resolution: this.resolution,
        candles: candles.map((c) => ({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        })),
        indicators: dirtyOffThreadIndicators,
      });

      if (this.evalEpoch !== currentEpoch || this.isDestroyed) {
        return;
      }

      for (const [id, key] of dirtyEvalKeys.entries()) {
        this.lastEvalKeyMap.set(id, key);
      }

      if (evalData && Array.isArray(evalData.results)) {
        this.ingestEvalResults(evalData.results, getCandleMap());
      }
    } catch (err) {
      if (this.evalEpoch !== currentEpoch || this.isDestroyed) {
        return;
      }
      console.warn('[UniversalIndicatorConnector] Evaluation request error:', err);
    }
  }

  private ingestEvalResults(
    results: EvalResultPayload[],
    candleMap: Map<number, Candle>
  ): void {
    for (const res of results) {
      const entry = this.managed.get(res.instanceId);
      const ind = this.currentIndicators.find((i) => i.id === res.instanceId);
      if (!entry || !ind) continue;

      for (const [plotId, points] of Object.entries(res.plots)) {
        entry.cachedPlots[plotId] = points;
        this.applyPlotSeriesData(ind, entry, plotId, points, candleMap);

        const lastPt = points[points.length - 1];
        const lastCandle = this.lastCandles[this.lastCandles.length - 1];
        const isDiscontinuous = isDiscontinuousPlot(ind.type, plotId);
        const isActiveOnLatestBar = Boolean(lastPt && lastCandle && lastPt.time === lastCandle.time);

        // Discontinuous regime plots (up/down) show null in HUD if not active on latest candle
        entry.latestValues[plotId] = (!isDiscontinuous || isActiveOnLatestBar) && lastPt
          ? lastPt.value
          : null;
      }

      this.refreshBandsFromCache(ind, entry);
    }

    this.options.onLatestValuesChange?.(this.getLatestValues());
  }

  /**
   * Real-time unthrottled live tick ingestion for indicators.
   * Runs in O(1) time without blocking the UI thread.
   */
  public updateRealtimeCandle(candle: Candle): void {
    if (this.isDestroyed) return;

    if (this.lastCandles.length > 0) {
      const last = this.lastCandles[this.lastCandles.length - 1];
      if (last.time === candle.time) {
        this.lastCandles[this.lastCandles.length - 1] = candle;
      } else if (candle.time > last.time) {
        this.lastCandles.push(candle);
        if (this.lastCandles.length > MAX_CACHED_CANDLES) {
          this.lastCandles.splice(0, this.lastCandles.length - MAX_CACHED_CANDLES);
        }
      }
    }

    for (const ind of this.currentIndicators) {
      if (isVolumeIndicatorType(ind.type)) {
        const entry = this.managed.get(ind.id);
        if (!entry) continue;

        const volStyle = ind.styles['vol'];
        const volSeries = entry.series.get('vol');
        if (volSeries) {
          const colorUp = volStyle?.colorUp || volStyle?.color || '#089981';
          const colorDown = volStyle?.colorDown || '#f23645';
          const isUp = candle.close >= candle.open;
          try {
            volSeries.update({
              time: candle.time as Time,
              value: candle.volume,
              color: isUp ? colorUp : colorDown,
            });
          } catch {}

          entry.latestValues['vol'] = candle.volume;

          const cached = entry.cachedPlots['vol'] || [];
          if (cached.length > 0 && cached[cached.length - 1].time === candle.time) {
            cached[cached.length - 1].value = candle.volume;
            cached[cached.length - 1].color = isUp ? colorUp : colorDown;
          } else {
            cached.push({
              time: candle.time,
              value: candle.volume,
              color: isUp ? colorUp : colorDown,
            });
            if (cached.length > MAX_CACHED_CANDLES) {
              cached.splice(0, cached.length - MAX_CACHED_CANDLES);
            }
          }
          entry.cachedPlots['vol'] = cached;
        }
      }
    }
  }

  /**
   * Attach or update footprint orderflow primitive data on a chart.
   */
  public updateFootprintData(instanceId: string, bars: FootprintBar[]): void {
    const entry = this.managed.get(instanceId);
    if (!entry) return;

    let fpPrim = entry.footprints.get('footprint');
    const firstSeries = Array.from(entry.series.values())[0];
    if (!firstSeries) return;

    if (!fpPrim) {
      fpPrim = new FootprintPrimitive({}, bars);
      try {
        firstSeries.attachPrimitive(fpPrim);
        entry.footprints.set('footprint', fpPrim);
      } catch (err) {
        console.warn('[UniversalIndicatorConnector] Failed to attach FootprintPrimitive:', err);
      }
    } else {
      fpPrim.updateData(bars);
    }
  }

  /**
   * Set signal markers on an indicator series.
   */
  public setMarkers(instanceId: string, plotId: string, markers: SeriesMarker<Time>[]): void {
    const entry = this.managed.get(instanceId);
    if (!entry) return;

    const s = entry.series.get(plotId);
    if (s && 'setMarkers' in s && typeof (s as { setMarkers?: unknown }).setMarkers === 'function') {
      try {
        (s as { setMarkers: (m: SeriesMarker<Time>[]) => void }).setMarkers(markers);
        entry.markers.set(plotId, markers);
      } catch {}
    }
  }

  // ==========================================
  // REAL-TIME MULTIPLEXED WEBSOCKET STREAMING (/ws/indicators)
  // ==========================================

  private cancelPendingStreamBatch(): void {
    if (this.streamRafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.streamRafId);
    }
    this.streamRafId = null;
    this.pendingStreamUpdates.clear();
  }

  private resubscribeStream(): void {
    if (this.isDestroyed) return;

    const indicatorsToSub = this.currentIndicators
      .filter((i) => !isVolumeIndicatorType(i.type))
      .map((i) => ({
        instanceId: i.id,
        indicatorId: LEGACY_INDICATOR_MIGRATION_MAP[i.type] || i.type,
        inputs: (i.inputs || {}) as Record<string, unknown>,
      }));

    if (indicatorsToSub.length === 0) {
      if (this.streamUnsubscribe) {
        try {
          this.streamUnsubscribe();
        } catch {}
        this.streamUnsubscribe = null;
      }
      this.activeStreamSubKey = '';
      return;
    }

    const nextKey = `${this.symbol}|${this.resolution}|${stableSerialize(indicatorsToSub)}`;
    if (nextKey === this.activeStreamSubKey && this.streamUnsubscribe) {
      return;
    }

    const prevUnsub = this.streamUnsubscribe;
    this.activeStreamSubKey = nextKey;
    this.streamUnsubscribe = transport.subscribeIndicatorStream({
      symbol: this.symbol,
      resolution: this.resolution,
      indicators: indicatorsToSub,
      candles: this.lastCandles.slice(-2000).map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })),
      onUpdate: (update: IndicatorStreamUpdate) => {
        if (this.isDestroyed || update.symbol !== this.symbol || update.resolution !== this.resolution) {
          return;
        }
        this.enqueueStreamingIndicatorUpdate(update.time, update.plots);
      },
    });

    if (prevUnsub) {
      try {
        prevUnsub();
      } catch {}
    }
  }

  private enqueueStreamingIndicatorUpdate(
    time: number,
    plots: Record<string, Record<string, number>>
  ): void {
    if (this.isDestroyed) return;

    let timeBucket = this.pendingStreamUpdates.get(time);
    if (!timeBucket) {
      timeBucket = {};
      this.pendingStreamUpdates.set(time, timeBucket);
    }
    for (const [instanceId, plotMap] of Object.entries(plots)) {
      const existing = timeBucket[instanceId];
      if (!existing) {
        timeBucket[instanceId] = { ...plotMap };
      } else {
        Object.assign(existing, plotMap);
      }
    }

    if (typeof requestAnimationFrame === 'function') {
      if (this.streamRafId === null) {
        this.streamRafId = requestAnimationFrame(() => {
          this.streamRafId = null;
          this.flushStreamingIndicatorUpdates();
        });
      }
    } else {
      this.flushStreamingIndicatorUpdates();
    }
  }

  private flushStreamingIndicatorUpdates(): void {
    if (this.isDestroyed || this.pendingStreamUpdates.size === 0) return;

    const times = Array.from(this.pendingStreamUpdates.keys()).sort((a, b) => a - b);
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      const plots = this.pendingStreamUpdates.get(t);
      if (plots) {
        this.handleStreamingIndicatorUpdate(t, plots);
      }
    }
    this.pendingStreamUpdates.clear();
  }

  private findCachedCandleAtTime(time: number): Candle | undefined {
    const candles = this.lastCandles;
    for (let i = candles.length - 1; i >= 0; i--) {
      if (candles[i].time === time) return candles[i];
      if (candles[i].time < time) break;
    }
    return undefined;
  }

  private handleStreamingIndicatorUpdate(
    time: number,
    plots: Record<string, Record<string, number>>
  ): void {
    if (this.isDestroyed) return;

    const candle = this.findCachedCandleAtTime(time);
    let hasUpdates = false;

    for (const [instanceId, plotMap] of Object.entries(plots)) {
      const entry = this.managed.get(instanceId);
      if (!entry) continue;

      const ind = this.currentIndicators.find((i) => i.id === instanceId);

      for (const [plotId, val] of Object.entries(plotMap)) {
        const s = entry.series.get(plotId);
        const style = ind?.styles[plotId];
        const isHistogram = style?.plotType === 'histogram';
        const isDiscontinuous = ind ? isDiscontinuousPlot(ind.type, plotId) : false;

        if (s) {
          if (val === null || val === undefined || !Number.isFinite(val)) {
            if (isDiscontinuous) {
              try {
                (s as unknown as { update: (d: { time: Time }) => void }).update({ time: time as Time });
              } catch {}
              entry.latestValues[plotId] = null;
              hasUpdates = true;
            }
            continue;
          }

          try {
            let ptColor: string | undefined;
            if (isHistogram) {
              const colorUp = style?.colorUp || style?.color || '#089981';
              const colorDown = style?.colorDown || '#f23645';
              const isUp = candle ? candle.close >= candle.open : val >= 0;
              ptColor = isUp ? colorUp : colorDown;
              s.update({ time: time as Time, value: val, color: ptColor });
            } else if (isDiscontinuous) {
              const defaultRegimeColor = plotId === 'down' ? '#F23645' : '#089981';
              ptColor = style?.color || defaultRegimeColor;
              (s as unknown as DiscontinuousLineSeriesApi).update({
                time: time as Time,
                value: val,
                color: ptColor,
                customValues: { regime: plotId },
              });
            } else {
              s.update({ time: time as Time, value: val });
            }

            entry.latestValues[plotId] = val;
            hasUpdates = true;

            const cached = entry.cachedPlots[plotId] || [];
            if (cached.length > 0 && cached[cached.length - 1].time === time) {
              cached[cached.length - 1].value = val;
              if (ptColor) cached[cached.length - 1].color = ptColor;
            } else {
              cached.push({
                time,
                value: val,
                ...(ptColor ? { color: ptColor } : {}),
              });
              if (cached.length > MAX_CACHED_CANDLES) {
                cached.splice(0, cached.length - MAX_CACHED_CANDLES);
              }
            }
            entry.cachedPlots[plotId] = cached;
          } catch {}
        }
      }

      // Mutual exclusivity for live trend HUD: clear opposite regime
      if ('up' in plotMap && !('down' in plotMap)) {
        entry.latestValues['down'] = null;
      } else if ('down' in plotMap && !('up' in plotMap)) {
        entry.latestValues['up'] = null;
      }

      // Update shaded bands (e.g. VWAP std dev bands, Bollinger Bands) in real time
      const def = ind
        ? INDICATOR_REGISTRY[ind.type] || INDICATOR_REGISTRY[normalizeIndicatorId(ind.type)]
        : undefined;
      const effectiveBands =
        ind?.bands && ind.bands.length > 0
          ? ind.bands
          : (def?.defaultBands || []);

      if (effectiveBands.length > 0) {
        for (const band of effectiveBands) {
          const bandPrim = entry.bands.get(band.id);
          if (!bandPrim) continue;
          const upVal = plotMap[band.upperPlotId];
          const lowVal = plotMap[band.lowerPlotId];
          if (upVal !== undefined && lowVal !== undefined) {
            bandPrim.updatePoint({
              time,
              upper: upVal,
              lower: lowVal,
            });
          }
        }
      }
    }

    if (hasUpdates) {
      this.scheduleLatestValuesCallback();
    }
  }

  private scheduleLatestValuesCallback(): void {
    if (this.isDestroyed || !this.options.onLatestValuesChange) return;

    if (this.hudUpdateTimer !== null) {
      this.pendingHudUpdate = true;
      return;
    }

    this.options.onLatestValuesChange(this.getLatestValues());
    this.hudUpdateTimer = setTimeout(() => {
      this.hudUpdateTimer = null;
      if (this.pendingHudUpdate && !this.isDestroyed) {
        this.pendingHudUpdate = false;
        this.scheduleLatestValuesCallback();
      }
    }, 50);
    const hudTimerObj = this.hudUpdateTimer as unknown;
    if (hudTimerObj && typeof (hudTimerObj as { unref?: () => void }).unref === 'function') {
      (hudTimerObj as { unref: () => void }).unref();
    }
  }

  private cleanupEntry(entry: ManagedIndicatorEntry): void {
    const firstSeries = Array.from(entry.series.values())[0];
    for (const [id, band] of entry.bands.entries()) {
      const attached = entry.bandAttachedSeries?.get(id) || firstSeries;
      if (attached) {
        try {
          attached.detachPrimitive(band);
        } catch {}
      }
    }
    if (firstSeries) {
      for (const fp of entry.footprints.values()) {
        try {
          firstSeries.detachPrimitive(fp);
        } catch {}
      }
      for (const pl of entry.priceLines) {
        try {
          firstSeries.removePriceLine(pl);
        } catch {}
      }
    }
    for (const s of entry.series.values()) {
      try {
        this.chart.removeSeries(s);
      } catch {}
    }
    entry.series.clear();
    entry.bands.clear();
    entry.bandAttachedSeries?.clear();
    entry.footprints.clear();
    entry.priceLines = [];
    entry.autoscaleProviders.clear();
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.evalEpoch++;
    this.cancelPendingStreamBatch();
    if (this.hudUpdateTimer) {
      clearTimeout(this.hudUpdateTimer);
      this.hudUpdateTimer = null;
    }
    this.pendingHudUpdate = false;
    if (this.streamUnsubscribe) {
      try {
        this.streamUnsubscribe();
      } catch {}
      this.streamUnsubscribe = null;
    }
    this.activeStreamSubKey = '';
    this.lastEvalKeyMap.clear();
    for (const entry of this.managed.values()) {
      this.cleanupEntry(entry);
    }
    this.managed.clear();
  }
}
