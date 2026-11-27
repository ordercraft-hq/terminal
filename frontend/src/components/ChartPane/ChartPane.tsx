import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  createChart,
  createTextWatermark,
  CandlestickSeries,
  BarSeries,
  LineSeries,
  AreaSeries,
  BaselineSeries,
  ColorType,
  CrosshairMode,
  PriceScaleMode,
  LineStyle,
  LineType,
} from 'lightweight-charts';
import type {
  IChartApi,
  ISeriesApi,
  SeriesType,
  Time,
  CandlestickData,
  WhitespaceData,
  ITextWatermarkPluginApi,
  TextWatermarkLineOptions,
} from 'lightweight-charts';
import { useSyncStore, createDefaultVolumeIndicator } from '../../store/syncStore';
import type { CrosshairSyncData, ChartType, ChartVisualSettings } from '../../store/syncStore';
import { transport } from '../../transport/client';
import type { Candle } from '../../transport/client';
import { DrawingCanvas } from './DrawingCanvas';
import { PriceCountdownPrimitive } from './PriceCountdownPrimitive';
import {
  FootprintPrimitive,
  adaptBackendFootprintBar,
  synthesizeFormingFootprintBar,
  type FootprintBar,
} from '../../indicators/primitives/FootprintPrimitive';
import { UniversalIndicatorConnector, isVolumeIndicatorType } from '../../indicators/UniversalIndicatorConnector';
import {
  ChartHudController,
  ChartOhlcReadout,
  ChartOverlayLegend,
  ChartSubpaneLegendItem,
  ChartCollapsedIndicatorValues,
} from './ChartHudController';
import { mergeLiveCandleTick } from './liveCandleMerge';
import type { IndicatorInstance } from '../../indicators/types';
import { isLightColor } from '../../utils/colorUtils';
import { getServerTimeSec, getServerTimeMs, recordServerTimestamp } from '../../utils/serverTime';
import {
  transformHeikinAshi,
  transformHollowCandles,
  transformVolumeCandles,
  transformHighLow,
  transformRenko,
} from '../../utils/barTypeTransformers';
import { isChartTypeSupported } from '../../utils/chartTypeSupport';
import { Globe, Clock, ChevronUp, ArrowUp, ArrowDown, Trash2, Minus, Maximize2, Minimize2, ChevronsRight, Code } from 'lucide-react';
import { ChartContextMenu } from '../ContextMenu/ChartContextMenu';

const ObjectTreeModal = React.lazy(() =>
  import('../Modals/ObjectTreeModal').then((m) => ({ default: m.ObjectTreeModal }))
);
const DataTableViewModal = React.lazy(() =>
  import('../Modals/DataTableViewModal').then((m) => ({ default: m.DataTableViewModal }))
);
import {
  getPriceDecimals,
  detectPrecisionFromCandles,
  detectTickSizeFromCandles,
  getPriceFormatConfig,
  snapPriceToTick,
  snapSyncedPrice,
  formatSyncedCrosshairPrice,
} from '../../utils/priceFormatting';
import {
  ALL_TIMEZONES,
  getTimezoneOffsetSeconds,
  formatTickMarkInTimezone,
  formatCrosshairTimeInTimezone,
  type TimezoneItem,
} from '../../utils/timezones';

export { ALL_TIMEZONES, getTimezoneOffsetSeconds, type TimezoneItem };

function findCandleByTime(candles: readonly Candle[], targetTime: number): Candle | undefined {
  let lo = 0;
  let hi = candles.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = candles[mid].time;
    if (t === targetTime) return candles[mid];
    if (t < targetTime) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return undefined;
}

function getEffectiveBarStep(candles: readonly Candle[], tf: string): number {
  const dur = getTimeframeDurationSeconds(tf);
  if (dur > 0) return dur;
  if (candles.length >= 2) {
    return Math.max(1, candles[candles.length - 1].time - candles[candles.length - 2].time);
  }
  return 60;
}

function logicalIndexToTimestamp(candles: readonly Candle[], tf: string, logicalIdx: number): number | null {
  if (candles.length === 0) return null;
  const step = getEffectiveBarStep(candles, tf);
  const i0 = Math.floor(logicalIdx);
  if (i0 < 0) {
    return candles[0].time + logicalIdx * step;
  }
  if (i0 >= candles.length - 1) {
    return candles[candles.length - 1].time + (logicalIdx - (candles.length - 1)) * step;
  }
  const frac = logicalIdx - i0;
  return candles[i0].time + frac * (candles[i0 + 1].time - candles[i0].time);
}

function timestampToLogicalIndex(candles: readonly Candle[], tf: string, ts: number): number {
  if (candles.length === 0) return 0;
  const step = getEffectiveBarStep(candles, tf);
  if (ts <= candles[0].time) {
    return (ts - candles[0].time) / step;
  }
  const lastIdx = candles.length - 1;
  if (ts >= candles[lastIdx].time) {
    return lastIdx + (ts - candles[lastIdx].time) / step;
  }

  let lo = 0;
  let hi = lastIdx - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time <= ts && ts < candles[mid + 1].time) {
      const span = candles[mid + 1].time - candles[mid].time;
      return span > 0 ? mid + (ts - candles[mid].time) / span : mid;
    }
    if (candles[mid].time < ts) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

const paneSyncRegistry = new Map<string, { getCandles: () => Candle[]; getTimeframe: () => string }>();

// Helper: duration of current timeframe in seconds (unambiguous parser)
function getTimeframeDurationSeconds(tf: string): number {
  const t = tf.trim().toLowerCase();
  if (t === '1s') return 1;
  if (t === '5s') return 5;
  if (t === '15s') return 15;
  if (t === '30s') return 30;
  if (t === '1m' || t === '1') return 60;
  if (t === '2m' || t === '2') return 120;
  if (t === '3m' || t === '3') return 180;
  if (t === '5m' || t === '5') return 300;
  if (t === '10m' || t === '10') return 600;
  if (t === '15m' || t === '15') return 900;
  if (t === '30m' || t === '30') return 1800;
  if (t === '45m' || t === '45') return 2700;
  if (t === '1h' || t === '60') return 3600;
  if (t === '2h' || t === '120') return 7200;
  if (t === '3h' || t === '180') return 10800;
  if (t === '4h' || t === '240') return 14400;
  if (t === '12h' || t === '720') return 43200;
  if (t === '1d' || t === 'd') return 86400;
  if (t === '1w' || t === 'w') return 604800;
  if (t === '1mo' || tf.trim() === '1M' || tf.trim() === 'M') return 2592000;
  if (t.endsWith('s')) return parseInt(t, 10) || 1;
  if (t.endsWith('m')) return (parseInt(t, 10) || 1) * 60;
  if (t.endsWith('h')) return (parseInt(t, 10) || 1) * 3600;
  if (t.endsWith('d')) return (parseInt(t, 10) || 1) * 86400;
  return 60;
}

export function normalizeSymbolKey(sym?: string): string {
  if (!sym) return '';
  const raw = sym.split(':').pop() || '';
  let clean = raw.toUpperCase().replace(/[_\-\/\.\s]/g, '');
  clean = clean.replace(/(PERP|SWAP)$/, '');
  clean = clean.replace(/(USDT|USDC|BUSD|FDUSD|TUSD)$/, 'USD');
  return clean;
}

export function getMarketStatus(symbol: string): { isOpen: boolean; label: string } {
  const s = symbol.toUpperCase();
  // Crypto pairs trade 24/7/365
  if (
    s.startsWith('BINANCE:') ||
    s.startsWith('BYBIT:') ||
    s.startsWith('COINBASE:') ||
    s.endsWith('USDT') ||
    s.endsWith('USDC') ||
    s.endsWith('BTC') ||
    s.endsWith('FDUSD') ||
    s.endsWith('-USD') ||
    (s.endsWith('EUR') && !s.includes('_')) ||
    s.startsWith('BTC') ||
    s.startsWith('ETH') ||
    s.startsWith('SOL')
  ) {
    return { isOpen: true, label: 'Market Open' };
  }

  // Forex / CFDs / Commodities / Indices
  const now = new Date();
  const day = now.getUTCDay(); // 0 is Sunday, 5 is Friday, 6 is Saturday
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const totalMin = hour * 60 + minute;

  // Saturday: Closed all day
  if (day === 6) {
    return { isOpen: false, label: 'Market Closed' };
  }

  // Sunday: Opens at 21:00 UTC (5:00 PM ET)
  if (day === 0) {
    if (totalMin < 21 * 60) {
      return { isOpen: false, label: 'Market Closed' };
    }
    return { isOpen: true, label: 'Market Open' };
  }

  // Friday: Closes at 21:00 UTC (5:00 PM ET)
  if (day === 5) {
    if (totalMin >= 21 * 60) {
      return { isOpen: false, label: 'Market Closed' };
    }
    return { isOpen: true, label: 'Market Open' };
  }

  // Monday through Thursday rollover break (21:00 - 22:00 UTC) for CFDs/Indices/Metals
  if (totalMin >= 21 * 60 && totalMin < 22 * 60) {
    if (s.includes('SPX') || s.includes('NAS') || s.includes('US30') || s.includes('XAU') || s.includes('BCO') || s.includes('WTICO')) {
      return { isOpen: false, label: 'Market Closed' };
    }
  }

  return { isOpen: true, label: 'Market Open' };
}

export interface ChartPaneProps {
  paneId?: string;
  isGrid?: boolean;
}

export function getActiveSeries(
  ct: ChartType,
  candleSeries: ISeriesApi<'Candlestick'> | null,
  barSeries: ISeriesApi<'Bar'> | null,
  lineSeries: ISeriesApi<'Line'> | null,
  areaSeries: ISeriesApi<'Area'> | null,
  baselineSeries: ISeriesApi<'Baseline'> | null
): ISeriesApi<SeriesType, Time> | null {
  if (ct === 'bars' || ct === 'hlc_bars') return barSeries;
  if (ct === 'line' || ct === 'line_with_markers' || ct === 'step_line') return lineSeries;
  if (ct === 'area') return areaSeries;
  if (ct === 'baseline') return baselineSeries;
  return candleSeries;
}

function formatWatermarkInterval(tf: string): string {
  if (!tf) return '';
  const match = tf.match(/^(\d+)([smhDWM])$/i);
  if (!match) return tf;
  const num = match[1];
  const unit = match[2];
  if (unit.toLowerCase() === 'm') {
    return num;
  }
  if (unit.toLowerCase() === 'h') {
    return `${num}h`;
  }
  if (unit.toUpperCase() === 'D') {
    return num === '1' ? '1D' : `${num}D`;
  }
  if (unit.toUpperCase() === 'W') {
    return num === '1' ? '1W' : `${num}W`;
  }
  if (unit.toUpperCase() === 'M') {
    return num === '1' ? '1M' : `${num}M`;
  }
  if (unit.toLowerCase() === 's') {
    return `${num}s`;
  }
  return tf;
}

function getWatermarkLines(
  cleanSymbol: string,
  timeframe: string,
  settings: ChartVisualSettings
): { isVisible: boolean; lines: TextWatermarkLineOptions[] } {
  const isTickerEnabled =
    settings.canvasWatermarkTicker ?? (settings.canvasWatermark ? true : false);
  const isIntervalEnabled =
    settings.canvasWatermarkInterval ?? (settings.canvasWatermark ? true : false);
  const isVisible =
    Boolean(settings.canvasWatermark) && (isTickerEnabled || isIntervalEnabled);

  const watermarkColor = settings.canvasWatermarkColor || 'rgba(255, 255, 255, 0.08)';

  let lineText = '';
  if (isTickerEnabled && isIntervalEnabled) {
    lineText = `${cleanSymbol}, ${formatWatermarkInterval(timeframe)}`;
  } else if (isTickerEnabled) {
    lineText = cleanSymbol;
  } else if (isIntervalEnabled) {
    lineText = formatWatermarkInterval(timeframe);
  }

  const lines: TextWatermarkLineOptions[] = [];
  if (lineText) {
    lines.push({
      text: lineText,
      color: watermarkColor,
      fontSize: 72,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
      fontStyle: 'bold',
    });
  }

  return { isVisible, lines };
}

type ActivePriceSeries = ISeriesApi<'Candlestick' | 'Bar' | 'Line' | 'Area' | 'Baseline'>;

interface DerivedBarsState {
  ct: ChartType;
  bars: CandlestickData<Time>[];
  renkoBrickSize: number;
  renkoPrevBase: number;
  renkoPrevLastClose: number;
  renkoCurBase: number;
  renkoCurLastClose: number;
}

export const ChartPane: React.FC<ChartPaneProps> = ({
  paneId = 'pane-1',
  isGrid = false,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const watermarkRef = useRef<ITextWatermarkPluginApi<Time> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const barSeriesRef = useRef<ISeriesApi<'Bar'> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const baselineSeriesRef = useRef<ISeriesApi<'Baseline'> | null>(null);
  const [chartInstance, setChartInstance] = useState<IChartApi | null>(null);
  const [activeSeriesInstance, setActiveSeriesInstance] = useState<ActivePriceSeries | null>(null);
  const activeSeriesInstanceRef = useRef<ActivePriceSeries | null>(null);
  const futureWhitespaceSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceCountdownPrimitiveRef = useRef<PriceCountdownPrimitive | null>(null);
  const footprintPrimitiveRef = useRef<FootprintPrimitive | null>(null);
  const activeSeriesForCountdownRef = useRef<ISeriesApi<SeriesType, Time> | null>(null);
  const futureBarCountRef = useRef<number>(300);
  const whitespaceStateRef = useRef<{
    symbol: string;
    tf: string;
    anchorTime: number;
    step: number;
    count: number;
  } | null>(null);
  const derivedBarsRef = useRef<DerivedBarsState | null>(null);
  const prevLoadedTimeframeRef = useRef<string | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const [candlesData, setCandlesData] = useState<Candle[]>([]);

  const syncActiveSeriesState = useCallback((series: ActivePriceSeries | null) => {
    if (activeSeriesInstanceRef.current !== series) {
      activeSeriesInstanceRef.current = series;
      setActiveSeriesInstance(series);
    }
  }, []);

  const activePaneId = useSyncStore((s) => s.activePaneId);
  const isActive = activePaneId === paneId;
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const isGridRef = useRef(isGrid);
  isGridRef.current = isGrid;
  const setActivePaneId = useSyncStore((s) => s.setActivePaneId);
  const toggleMaximizePane = useSyncStore((s) => s.toggleMaximizePane);
  const isMaximized = useSyncStore((s) => s.maximizedPaneId === paneId);
  const setTimezone = useSyncStore((s) => s.setTimezone);
  const isBottomDrawerOpen = useSyncStore((s) => s.isBottomDrawerOpen);
  const toggleBottomDrawer = useSyncStore((s) => s.toggleBottomDrawer);

  const symbol = useSyncStore((s) => s.panes[paneId]?.symbol || s.symbol);
  const timeframe = useSyncStore((s) => s.panes[paneId]?.timeframe || s.timeframe);
  const chartType = useSyncStore((s) => s.panes[paneId]?.chartType || s.chartType);
  const timezone = useSyncStore((s) => s.panes[paneId]?.timezone || s.timezone);
  const isSecondsTf = getTimeframeDurationSeconds(timeframe) < 60 || timeframe.trim().toLowerCase().endsWith('s');
  const marketStatus = getMarketStatus(symbol);
  const [pricePrecision, setPricePrecision] = useState<number>(() => getPriceDecimals(symbol));
  const pricePrecisionRef = useRef<number>(pricePrecision);
  pricePrecisionRef.current = pricePrecision;
  const [tickSize, setTickSize] = useState<number>(() => detectTickSizeFromCandles([], symbol));
  const tickSizeRef = useRef<number>(tickSize);
  tickSizeRef.current = tickSize;
  const chartSettings = useSyncStore((s) => s.panes[paneId]?.settings || s.chartSettings);
  const chartSettingsRef = useRef(chartSettings);
  chartSettingsRef.current = chartSettings;
  const orderflowSettings = useSyncStore((s) => s.panes[paneId]?.orderflowSettings || s.orderflowSettings);
  const orderflowSettingsRef = useRef(orderflowSettings);
  orderflowSettingsRef.current = orderflowSettings;
  const openChartSettings = useSyncStore((s) => s.openChartSettings);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);

  const handleScrollToRealTime = useCallback(() => {
    if (!chartApiRef.current) return;
    try {
      chartApiRef.current.timeScale().scrollToRealTime();
    } catch {
      chartApiRef.current.timeScale().resetTimeScale();
    }
  }, []);

  // Keyboard shortcut: Alt + Shift + ArrowRight -> Scroll to the most recent bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isGrid && !isActive) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        typeof target.closest === 'function' &&
        (target.closest('input') || target.closest('textarea'))
      ) {
        return;
      }

      if (e.altKey && e.shiftKey && (e.key === 'ArrowRight' || e.code === 'ArrowRight')) {
        e.preventDefault();
        handleScrollToRealTime();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleScrollToRealTime, isGrid, isActive]);
  const isLightCanvas = useMemo(
    () => isLightColor(chartSettings.canvasBgColor || '#131722'),
    [chartSettings.canvasBgColor]
  );
  const statusTextColor = useMemo(() => {
    if (isLightCanvas) {
      return isLightColor(chartSettings.scalesTextColor)
        ? '#131722'
        : (chartSettings.scalesTextColor || '#131722');
    }
    return !isLightColor(chartSettings.scalesTextColor) &&
      (chartSettings.scalesTextColor === '#131722' || chartSettings.scalesTextColor === '#000000')
      ? '#d1d4dc'
      : (chartSettings.scalesTextColor || '#d1d4dc');
  }, [isLightCanvas, chartSettings.scalesTextColor]);
  const statusTextSize = chartSettings.scalesTextSize || 11;

  // Technical Indicators
  const indicatorsMap = useSyncStore((s) => s.indicators);
  const indicators = useMemo(() => {
    if (indicatorsMap[paneId] !== undefined) {
      return indicatorsMap[paneId];
    }
    return [createDefaultVolumeIndicator(paneId)];
  }, [indicatorsMap, paneId]);
  const indicatorsRef = useRef<IndicatorInstance[]>([]);
  indicatorsRef.current = indicators;

  // Ensure newly created pane registers its default indicators in global store if uninitialized
  useEffect(() => {
    if (useSyncStore.getState().indicators[paneId] === undefined) {
      useSyncStore.setState((state) => ({
        indicators: {
          ...state.indicators,
          [paneId]: [createDefaultVolumeIndicator(paneId)],
        },
      }));
    }
  }, [paneId]);

  const hudController = useMemo(() => new ChartHudController(), []);
  const showScrollToLatestRef = useRef<boolean>(false);
  const [paneOffsets, setPaneOffsets] = useState<Record<number, number>>({});
  const subpaneIndicators = indicators.filter((ind) => ind.category === 'subpane');
  const subpaneIndicatorIds = useMemo(
    () => indicators.filter((ind) => ind.category === 'subpane').map((s) => s.id).join(','),
    [indicators]
  );

  const removeIndicatorFromPane = useSyncStore((s) => s.removeIndicatorFromPane);

  const [maximizedPaneIndex, setMaximizedPaneIndex] = useState<number | null>(null);
  const [collapsedPanes, setCollapsedPanes] = useState<Set<string>>(new Set());
  const [paneOrder, setPaneOrder] = useState<string[]>(['main']);
  const paneOrderRef = useRef<string[]>(['main']);
  paneOrderRef.current = paneOrder;
  const customStretchFactorsRef = useRef<Record<string, number>>({});

  // Clean up any corrupted stretch factor keys from localStorage
  useEffect(() => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('ordercraft_pane_stretch_')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {}
  }, []);

  // Keep paneOrder synchronized when subpane indicators are added/removed (safe primitive dependency)
  useEffect(() => {
    const subs = indicatorsRef.current.filter((ind) => ind.category === 'subpane');
    const subpaneIds = new Set(subs.map((s) => s.id));
    setPaneOrder((prev) => {
      let next = prev.filter((id) => id === 'main' || subpaneIds.has(id));
      if (!next.includes('main')) {
        next = ['main', ...next];
      }
      for (const ind of subs) {
        if (!next.includes(ind.id)) {
          next.push(ind.id);
        }
      }
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) {
        return prev;
      }
      return next;
    });
  }, [subpaneIndicatorIds]);

  const toggleCollapsePane = useCallback((indicatorId: string) => {
    setCollapsedPanes((prev) => {
      const next = new Set(prev);
      if (next.has(indicatorId)) {
        next.delete(indicatorId);
        delete customStretchFactorsRef.current[indicatorId];
      } else {
        next.add(indicatorId);
      }
      return next;
    });
  }, []);

  const updatePaneOffsets = useCallback(() => {
    const chart = chartApiRef.current;
    const container = chartContainerRef.current;
    if (!chart || !container) return;
    const containerRect = container.getBoundingClientRect();
    const panes = chart.panes();
    const offsets: Record<number, number> = {};
    panes.forEach((pane, idx) => {
      const el = pane.getHTMLElement();
      if (el) {
        const rect = el.getBoundingClientRect();
        offsets[idx] = Math.round(rect.top - containerRect.top);
      }
    });
    setPaneOffsets((prev) => {
      const prevKeys = Object.keys(prev);
      const newKeys = Object.keys(offsets);
      if (prevKeys.length !== newKeys.length) return offsets;
      for (const k of newKeys) {
        const numK = Number(k);
        if (Math.abs((prev[numK] ?? -999) - offsets[numK]) > 1) {
          return offsets;
        }
      }
      return prev;
    });
  }, []);

  const handleMovePaneUp = useCallback(
    (id: string) => {
      const chart = chartApiRef.current;
      if (!chart) return;
      const currentIdx = paneOrder.indexOf(id);
      if (currentIdx <= 0) return;
      const targetIdx = currentIdx - 1;

      const panes = chart.panes();
      if (currentIdx < panes.length && targetIdx < panes.length) {
        chart.swapPanes(currentIdx, targetIdx);
        indicatorConnectorRef.current?.swapIndicatorPanes(currentIdx, targetIdx);
        setPaneOrder((prev) => {
          const next = [...prev];
          const temp = next[currentIdx];
          next[currentIdx] = next[targetIdx];
          next[targetIdx] = temp;
          return next;
        });
        setTimeout(updatePaneOffsets, 50);
      }
    },
    [paneOrder, updatePaneOffsets]
  );

  const handleMovePaneDown = useCallback(
    (id: string) => {
      const chart = chartApiRef.current;
      if (!chart) return;
      const currentIdx = paneOrder.indexOf(id);
      if (currentIdx < 0 || currentIdx >= paneOrder.length - 1) return;
      const targetIdx = currentIdx + 1;

      const panes = chart.panes();
      if (currentIdx < panes.length && targetIdx < panes.length) {
        chart.swapPanes(currentIdx, targetIdx);
        indicatorConnectorRef.current?.swapIndicatorPanes(currentIdx, targetIdx);
        setPaneOrder((prev) => {
          const next = [...prev];
          const temp = next[currentIdx];
          next[currentIdx] = next[targetIdx];
          next[targetIdx] = temp;
          return next;
        });
        setTimeout(updatePaneOffsets, 50);
      }
    },
    [paneOrder, updatePaneOffsets]
  );

  const applyPaneLayout = useCallback(() => {
    const chart = chartApiRef.current;
    const container = chartContainerRef.current;
    if (!chart || !container) return;

    const table = container.querySelector('table');
    if (!table) return;

    const panes = chart.panes();
    if (panes.length === 0) return;

    const allRows = Array.from(table.querySelectorAll('tr'));
    if (allRows.length === 0) return;

    const timeScaleRow = allRows[allRows.length - 1];

    if (maximizedPaneIndex !== null && maximizedPaneIndex < panes.length) {
      const activePane = panes[maximizedPaneIndex];
      const activeEl = activePane?.getHTMLElement();
      const activeRow = activeEl?.closest('tr');

      allRows.forEach((tr) => {
        if (tr === activeRow || tr === timeScaleRow) {
          tr.style.display = '';
        } else {
          tr.style.display = 'none';
        }
      });

      try {
        activePane.setStretchFactor(10000);
        for (let i = 0; i < panes.length; i++) {
          if (i !== maximizedPaneIndex) {
            panes[i].setStretchFactor(0.0001);
          }
        }
      } catch {}
    } else {
      allRows.forEach((tr) => {
        tr.style.display = '';
      });

      try {
        paneOrder.forEach((id, visualIdx) => {
          if (visualIdx >= panes.length) return;
          const pane = panes[visualIdx];
          if (id === 'main') {
            const stretch = customStretchFactorsRef.current['main'] ?? 75;
            pane.setStretchFactor(stretch);
          } else {
            if (collapsedPanes.has(id)) {
              pane.setStretchFactor(0.0001);
              const row = pane.getHTMLElement()?.closest('tr');
              if (row) {
                row.style.display = 'none';
                const prev = row.previousElementSibling as HTMLElement | null;
                if (prev && prev.querySelector('td[colspan="3"]')) {
                  prev.style.display = 'none';
                }
                const next = row.nextElementSibling as HTMLElement | null;
                if (next && next.querySelector('td[colspan="3"]')) {
                  next.style.display = 'none';
                }
              }
            } else {
              const stretch = customStretchFactorsRef.current[id] ?? 25;
              pane.setStretchFactor(stretch);
            }
          }
        });
      } catch {}
    }

    try {
      chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    } catch {}
    updatePaneOffsets();
  }, [maximizedPaneIndex, collapsedPanes, paneOrder, updatePaneOffsets]);

  useEffect(() => {
    applyPaneLayout();
  }, [applyPaneLayout]);

  useEffect(() => {
    if (subpaneIndicators.length === 0 && maximizedPaneIndex !== null) {
      setMaximizedPaneIndex(null);
    }
  }, [subpaneIndicators.length, maximizedPaneIndex]);

  // Auto-collapse subpanes when dragged below minimum usable threshold (<= 45px or pulled to boundary)
  const [pendingCollapseIndicatorId, setPendingCollapseIndicatorId] = useState<string | null>(null);
  const pendingCollapseIndicatorIdRef = useRef<string | null>(null);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // Only left click
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const tr = target.closest('tr');
      if (!tr) return;

      // Check if target or row is a pane separator
      const isSeparator =
        tr.querySelector('td[colspan="3"]') !== null ||
        window.getComputedStyle(target).cursor === 'row-resize';
      if (!isSeparator) return;

      const chart = chartApiRef.current;
      if (!chart) return;

      const upperTr = tr.previousElementSibling as HTMLTableRowElement | null;
      const lowerTr = tr.nextElementSibling as HTMLTableRowElement | null;
      if (!upperTr || !lowerTr) return;

      const panes = chart.panes();
      let upperVisualIdx = -1;
      let lowerVisualIdx = -1;
      for (let i = 0; i < panes.length; i++) {
        const pTr = panes[i]?.getHTMLElement()?.closest('tr');
        if (pTr === upperTr) upperVisualIdx = i;
        if (pTr === lowerTr) lowerVisualIdx = i;
      }

      if (upperVisualIdx === -1 || lowerVisualIdx === -1) return;

      const upperId = paneOrderRef.current[upperVisualIdx];
      const lowerId = paneOrderRef.current[lowerVisualIdx];
      const startY = e.clientY;

      let lastCandidateId: string | null = null;

      const handlePointerMove = (moveEv: MouseEvent) => {
        const deltaY = moveEv.clientY - startY;
        const upperHeight = upperTr.getBoundingClientRect().height;
        const lowerHeight = lowerTr.getBoundingClientRect().height;
        const lowerRect = lowerTr.getBoundingClientRect();
        const upperRect = upperTr.getBoundingClientRect();

        let candidateId: string | null = null;

        // If dragging DOWN: lower pane shrinks
        if (deltaY > 0 && lowerId && lowerId !== 'main') {
          if (lowerHeight <= 45 || moveEv.clientY >= lowerRect.bottom - 12) {
            candidateId = lowerId;
          }
        }
        // If dragging UP: upper pane shrinks
        else if (deltaY < 0 && upperId && upperId !== 'main') {
          if (upperHeight <= 45 || moveEv.clientY <= upperRect.top + 12) {
            candidateId = upperId;
          }
        }

        if (candidateId !== lastCandidateId) {
          lastCandidateId = candidateId;
          pendingCollapseIndicatorIdRef.current = candidateId;
          setPendingCollapseIndicatorId(candidateId);
        }

        updatePaneOffsets();
      };

      const handlePointerUp = () => {
        window.removeEventListener('mousemove', handlePointerMove, true);
        window.removeEventListener('mouseup', handlePointerUp, true);

        const candidateToCollapse = pendingCollapseIndicatorIdRef.current;
        pendingCollapseIndicatorIdRef.current = null;
        setPendingCollapseIndicatorId(null);

        if (candidateToCollapse) {
          toggleCollapsePane(candidateToCollapse);
        } else {
          // Save custom stretch factors from this resize
          const cChart = chartApiRef.current;
          if (cChart) {
            const currentPanes = cChart.panes();
            currentPanes.forEach((p, idx) => {
              const id = paneOrderRef.current[idx];
              if (id) {
                customStretchFactorsRef.current[id] = p.getStretchFactor();
              }
            });
          }
        }

        setTimeout(updatePaneOffsets, 50);
      };

      window.addEventListener('mousemove', handlePointerMove, true);
      window.addEventListener('mouseup', handlePointerUp, true);
    };

    container.addEventListener('mousedown', handlePointerDown, true);
    return () => {
      container.removeEventListener('mousedown', handlePointerDown, true);
    };
  }, [toggleCollapsePane, updatePaneOffsets]);

  const getPaneTop = useCallback((targetPane: number): number => {
    if (paneOffsets[targetPane] !== undefined) return paneOffsets[targetPane];
    const chart = chartApiRef.current;
    const container = chartContainerRef.current;
    if (!chart || !container) return 0;
    const panes = chart.panes();
    const el = panes[targetPane]?.getHTMLElement();
    if (el) {
      const cRect = container.getBoundingClientRect();
      const pRect = el.getBoundingClientRect();
      return Math.round(pRect.top - cRect.top);
    }
    return 0;
  }, [paneOffsets]);

  const handleWrapperDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.closest('button') ||
          target.closest('input') ||
          target.closest('[data-no-dblclick]'))
      ) {
        return;
      }

      const containerEl = chartContainerRef.current;
      if (!containerEl) return;
      const cRect = containerEl.getBoundingClientRect();

      // If clicked on price scale on right edge, let price scale auto-scale
      const rightScaleWidth = chartApiRef.current?.priceScale('right')?.width() || 65;
      if (e.clientX >= cRect.right - Math.max(rightScaleWidth, 65)) {
        return;
      }

      const chart = chartApiRef.current;
      if (!chart) return;
      const panes = chart.panes();
      if (panes.length <= 1) return;

      let clickedVisualIndex = -1;
      for (let i = 0; i < panes.length; i++) {
        const pEl = panes[i]?.getHTMLElement();
        if (pEl) {
          const rect = pEl.getBoundingClientRect();
          if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
            clickedVisualIndex = i;
            break;
          }
        }
      }

      if (clickedVisualIndex === -1) return;

      setMaximizedPaneIndex((prev) => (prev === clickedVisualIndex ? null : clickedVisualIndex));
    },
    []
  );

  const indicatorConnectorRef = useRef<UniversalIndicatorConnector | null>(null);

  const syncIndicators = useCallback(
    (candles: Candle[]) => {
      const chart = chartApiRef.current;
      if (!chart || candles.length === 0 || !indicatorConnectorRef.current) return;

      indicatorConnectorRef.current.syncIndicators(
        indicatorsRef.current,
        candles,
        paneOrder,
        chartSettingsRef.current,
        customStretchFactorsRef.current,
        chartContainerRef.current
      );
      requestAnimationFrame(updatePaneOffsets);
    },
    [paneOrder, updatePaneOffsets]
  );


  useEffect(() => {
    if (candlesRef.current.length > 0) {
      syncIndicators(candlesRef.current);
    }
    requestAnimationFrame(updatePaneOffsets);
  }, [indicators, syncIndicators, updatePaneOffsets]);

  // Cross-chart sync channels
  const cursorType = useSyncStore((s) => s.cursorType);
  const activeTool = useSyncStore((s) => s.activeTool);
  const crosshairLock = useSyncStore((s) => s.crosshairLock);
  const setSyncCrosshair = useSyncStore((s) => s.setSyncCrosshair);

  const dateRangeLock = useSyncStore((s) => s.dateRangeLock);
  const isApplyingSyncRangeRef = useRef<boolean>(false);
  const prevSettingsRef = useRef<ChartVisualSettings | null>(null);
  const isVisibleRef = useRef<boolean>(true);
  const isReconcilingRef = useRef<boolean>(false);
  const lastReconcileTimeRef = useRef<number>(0);
  const pendingSeriesFlushRef = useRef<boolean>(false);
  const reconcileCatchUpRef = useRef<(reason?: string) => Promise<void>>(() => Promise.resolve());

  // Imperative direct DOM crosshair refs — ZERO React re-renders during mouse move!
  const syncVLineRef = useRef<HTMLDivElement | null>(null);
  const syncHLineRef = useRef<HTMLDivElement | null>(null);
  const syncTimePillRef = useRef<HTMLDivElement | null>(null);
  const syncPricePillRef = useRef<HTMLDivElement | null>(null);
  const timezoneRef = useRef<string>(timezone);
  timezoneRef.current = timezone;
  const isSecondsTfRef = useRef<boolean>(isSecondsTf);
  isSecondsTfRef.current = isSecondsTf;

  // Synchronized crosshair subscription driving direct GPU translate3d transforms
  useEffect(() => {
    let syncRafId: number | null = null;
    let pendingSync: CrosshairSyncData | null = null;
    let lastSyncBarTime: number | null = null;

    const updateCrosshairDOM = () => {
      syncRafId = null;
      const vline = syncVLineRef.current;
      const hline = syncHLineRef.current;
      const timePill = syncTimePillRef.current;
      const pricePill = syncPricePillRef.current;
      if (!vline || !hline) return;

      const lock = useSyncStore.getState().crosshairLock;
      const sync = pendingSync;
      if (!lock || !sync || sync.sourceId === paneId) {
        vline.style.display = 'none';
        hline.style.display = 'none';
        if (lastSyncBarTime !== null) {
          lastSyncBarTime = null;
          hudController.setSyncHoveredOHLC(null);
        }
        return;
      }

      const containerW = chartContainerRef.current?.clientWidth || 0;
      const containerH = chartContainerRef.current?.clientHeight || 0;
      const chart = chartApiRef.current;
      if (containerW <= 0 || containerH <= 0 || !chart) {
        vline.style.display = 'none';
        hline.style.display = 'none';
        return;
      }

      let rightScaleW = 0;
      let timeScaleH = 0;
      try {
        rightScaleW = chart.priceScale('right')?.width() || 0;
        timeScaleH = chart.timeScale()?.height() || 0;
      } catch {}
      const plotW = Math.max(0, containerW - rightScaleW);
      const plotH = Math.max(0, containerH - timeScaleH);

      // 1. Resolve X Coordinate (Vertical Line)
      let syncXCoord: number | null = null;
      let syncTime: Time | number | null = null;

      if (sync.time !== null && plotW > 0) {
        const exactX = chart.timeScale().timeToCoordinate(sync.time as Time);
        if (exactX !== null && exactX >= 0 && exactX <= plotW) {
          syncXCoord = exactX;
        }

        if (syncXCoord === null) {
          const arr = candlesRef.current;
          if (arr.length > 0) {
            const firstTime = arr[0].time;
            const lastTime = arr[arr.length - 1].time;
            const dur = getTimeframeDurationSeconds(timeframeRef.current);
            if (sync.time >= firstTime && sync.time <= lastTime + dur) {
              let low = 0;
              let high = arr.length - 1;
              let best = arr[0];
              let minDiff = Math.abs(arr[0].time - sync.time);
              while (low <= high) {
                const mid = (low + high) >> 1;
                const diff = Math.abs(arr[mid].time - sync.time);
                if (diff < minDiff) {
                  minDiff = diff;
                  best = arr[mid];
                }
                if (arr[mid].time < sync.time) {
                  low = mid + 1;
                } else if (arr[mid].time > sync.time) {
                  high = mid - 1;
                } else {
                  break;
                }
              }
              if (minDiff <= Math.max(dur * 2, 3600)) {
                const nearestX = chart.timeScale().timeToCoordinate(best.time as Time);
                if (nearestX !== null && nearestX >= 0 && nearestX <= plotW) {
                  syncXCoord = nearestX;
                }
              }
            }
          }
        }

        if (syncXCoord !== null) {
          syncTime = chart.timeScale().coordinateToTime(syncXCoord) || sync.time;
        }
      }

      // Update HUD OHLC only if sync.time crossed to a different bar
      if (sync.time !== null) {
        if (sync.time !== lastSyncBarTime) {
          lastSyncBarTime = sync.time;
          const arr = candlesRef.current;
          if (arr.length > 0) {
            let low = 0;
            let high = arr.length - 1;
            let found: Candle | null = null;
            const dur = getTimeframeDurationSeconds(timeframeRef.current);
            if (sync.time >= arr[0].time && sync.time <= arr[arr.length - 1].time + dur) {
              while (low <= high) {
                const mid = (low + high) >> 1;
                if (arr[mid].time === sync.time) {
                  found = arr[mid];
                  break;
                } else if (arr[mid].time < sync.time) {
                  low = mid + 1;
                } else {
                  high = mid - 1;
                }
              }
              if (!found && high >= 0 && high < arr.length) {
                if (Math.abs(arr[high].time - sync.time) <= dur * 2) {
                  found = arr[high];
                }
              }
            }
            if (found) {
              const change = found.close - found.open;
              const changePercent = (change / found.open) * 100;
              hudController.setSyncHoveredOHLC({
                open: found.open,
                high: found.high,
                low: found.low,
                close: found.close,
                volume: found.volume,
                change,
                changePercent,
              });
            } else {
              hudController.setSyncHoveredOHLC(null);
            }
          }
        }
      } else if (lastSyncBarTime !== null) {
        lastSyncBarTime = null;
        hudController.setSyncHoveredOHLC(null);
      }

      if (syncXCoord !== null && syncXCoord >= 0 && syncXCoord <= plotW) {
        vline.style.display = 'block';
        vline.style.bottom = `${timeScaleH}px`;
        vline.style.transform = `translate3d(${Math.round(syncXCoord)}px, 0, 0)`;
        if (timePill && syncTime !== null) {
          const timeStr = formatCrosshairTimeInTimezone(syncTime as Time, timezoneRef.current, isSecondsTfRef.current);
          if (timeStr) {
            timePill.textContent = timeStr;
            timePill.style.display = 'block';
          } else {
            timePill.style.display = 'none';
          }
        }
      } else {
        vline.style.display = 'none';
      }

      // 2. Resolve Y Coordinate (Horizontal Line) clipped to main plot bounds
      let syncYCoord: number | null = null;
      let syncPrice: number | null = null;

      const activeSeries = getActiveSeries(
        chartTypeRef.current,
        candleSeriesRef.current,
        barSeriesRef.current,
        lineSeriesRef.current,
        areaSeriesRef.current,
        baselineSeriesRef.current
      );

      const mainVIdx = paneOrderRef.current.indexOf('main') !== -1 ? paneOrderRef.current.indexOf('main') : 0;
      let mainPaneTop = 0;
      let mainPaneH = plotH;
      try {
        const mainPane = chart.panes()[mainVIdx];
        if (mainPane) {
          const h = mainPane.getHeight();
          if (h > 0) mainPaneH = h;
          const pEl = mainPane.getHTMLElement();
          if (pEl && chartContainerRef.current) {
            mainPaneTop = Math.max(0, Math.round(pEl.getBoundingClientRect().top - chartContainerRef.current.getBoundingClientRect().top));
          }
        }
      } catch {}

      if (sync.price != null && activeSeries && mainPaneH > 0) {
        const thisTickSize = tickSizeRef.current;
        const targetPrice = snapSyncedPrice(
          sync.price,
          thisTickSize,
          pricePrecisionRef.current,
          symbolRef.current
        );
        const priceCoord = activeSeries.priceToCoordinate(targetPrice);
        if (priceCoord !== null && priceCoord >= 0 && priceCoord <= mainPaneH) {
          syncYCoord = mainPaneTop + priceCoord;
          syncPrice = targetPrice;
        }
      }

      if (syncYCoord !== null && syncYCoord >= 0 && syncYCoord <= plotH) {
        hline.style.display = 'block';
        hline.style.right = `${rightScaleW}px`;
        hline.style.transform = `translate3d(0, ${Math.round(syncYCoord)}px, 0)`;
        if (pricePill && syncPrice !== null) {
          pricePill.textContent = formatSyncedCrosshairPrice(syncPrice, pricePrecisionRef.current);
          pricePill.style.display = 'block';
        }
      } else {
        hline.style.display = 'none';
      }
    };

    const unsub = useSyncStore.subscribe(
      (state) => state.syncCrosshair,
      (syncCrosshair) => {
        pendingSync = syncCrosshair;
        if (syncRafId === null) {
          syncRafId = requestAnimationFrame(updateCrosshairDOM);
        }
      }
    );

    return () => {
      unsub();
      if (syncRafId !== null) cancelAnimationFrame(syncRafId);
    };
  }, [paneId]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isLogScale, setIsLogScale] = useState<boolean>(false);
  const [isAutoScale, setIsAutoScale] = useState<boolean>(false);
  const [isTzDropdownOpen, setIsTzDropdownOpen] = useState<boolean>(false);
  const [tzSearchQuery, setTzSearchQuery] = useState<string>('');
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');
  const [isWsActive, setIsWsActive] = useState<boolean>(false);

  // Right-Click Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    price: number | null;
  }>({
    isOpen: false,
    x: 0,
    y: 0,
    price: null,
  });

  // Supporting Dialog States Triggered from Context Menu & UI
  const [isObjectTreeOpen, setIsObjectTreeOpen] = useState(false);
  const [isTableViewOpen, setIsTableViewOpen] = useState(false);

  // Historical pagination / backfill states & refs
  const [isBackfilling, setIsBackfilling] = useState<boolean>(false);
  const isBackfillingRef = useRef<boolean>(false);
  const hasMoreHistoryRef = useRef<boolean>(true);
  const symbolRef = useRef<string>(symbol);
  const timeframeRef = useRef<string>(timeframe);
  const chartTypeRef = useRef<ChartType>(chartType);
  const loadOlderCandlesRef = useRef<() => void>(() => {});
  const isInitialCandlesLoadedRef = useRef<boolean>(false);
  const prevLoadedSymbolRef = useRef<string | null>(null);

  symbolRef.current = symbol;
  timeframeRef.current = timeframe;
  chartTypeRef.current = chartType;

  // Lazily create only the price series required for the requested chartType
  const ensureSeriesForChartType = useCallback((ct: ChartType): ActivePriceSeries | null => {
    const chart = chartApiRef.current;
    if (!chart) return null;

    const priceFormat = getPriceFormatConfig(pricePrecisionRef.current, tickSizeRef.current);

    if (ct === 'bars' || ct === 'hlc_bars') {
      if (!barSeriesRef.current) {
        barSeriesRef.current = chart.addSeries(BarSeries, {
          upColor: '#089981',
          downColor: '#f23645',
          openVisible: ct === 'bars',
          thinBars: false,
          priceFormat,
          lastValueVisible: false,
          visible: true,
        });
      }
      return barSeriesRef.current;
    }

    if (ct === 'line' || ct === 'line_with_markers' || ct === 'step_line') {
      if (!lineSeriesRef.current) {
        lineSeriesRef.current = chart.addSeries(LineSeries, {
          color: '#2962ff',
          lineWidth: 2,
          lineType: ct === 'step_line' ? LineType.WithSteps : LineType.Simple,
          pointMarkersVisible: ct === 'line_with_markers',
          pointMarkersRadius: 3,
          visible: true,
          priceFormat,
          lastValueVisible: false,
        });
      }
      return lineSeriesRef.current;
    }

    if (ct === 'area') {
      if (!areaSeriesRef.current) {
        areaSeriesRef.current = chart.addSeries(AreaSeries, {
          topColor: 'rgba(41, 98, 255, 0.4)',
          bottomColor: 'rgba(41, 98, 255, 0.0)',
          lineColor: '#2962ff',
          lineWidth: 2,
          visible: true,
          priceFormat,
          lastValueVisible: false,
        });
      }
      return areaSeriesRef.current;
    }

    if (ct === 'baseline') {
      if (!baselineSeriesRef.current) {
        baselineSeriesRef.current = chart.addSeries(BaselineSeries, {
          baseValue: { type: 'price', price: 0 },
          topLineColor: '#089981',
          topFillColor1: 'rgba(8, 153, 129, 0.28)',
          topFillColor2: 'rgba(8, 153, 129, 0.02)',
          bottomLineColor: '#f23645',
          bottomFillColor1: 'rgba(242, 54, 69, 0.02)',
          bottomFillColor2: 'rgba(242, 54, 69, 0.28)',
          lineWidth: 2,
          priceFormat,
          lastValueVisible: false,
          visible: true,
        });
      }
      return baselineSeriesRef.current;
    }

    if (!candleSeriesRef.current) {
      candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor: '#089981',
        downColor: '#f23645',
        borderUpColor: '#089981',
        borderDownColor: '#f23645',
        wickUpColor: '#089981',
        wickDownColor: '#f23645',
        priceFormat,
        lastValueVisible: false,
        visible: true,
      });
    }
    return candleSeriesRef.current;
  }, []);

  // Lazily create and attach FootprintPrimitive only when footprint or volume profile is active
  const ensureFootprintPrimitive = useCallback((): FootprintPrimitive | null => {
    if (footprintPrimitiveRef.current) return footprintPrimitiveRef.current;
    const hostSeries = ensureSeriesForChartType('candles') as ISeriesApi<'Candlestick'> | null;
    if (!hostSeries) return null;

    const cs = chartSettingsRef.current;
    const ofs = orderflowSettingsRef.current;
    const fp = new FootprintPrimitive({
      visible: chartTypeRef.current === 'footprint',
      candleUpColor: cs?.candleBodyUpColor,
      candleDownColor: cs?.candleBodyDownColor,
      candleBorderUpColor: cs?.candleBorderUpColor,
      candleBorderDownColor: cs?.candleBorderDownColor,
      candleWickUpColor: cs?.candleWickUpColor,
      candleWickDownColor: cs?.candleWickDownColor,
      showCandleBody: cs?.showCandleBody,
      showCandleBorders: cs?.showCandleBorders,
      showCandleWick: cs?.showCandleWick,
      showPOC: ofs?.showPOC,
      pocColor: ofs?.pocColor,
      imbalanceRules: ofs?.imbalanceRules,
      imbalanceGlobalSettings: ofs?.imbalanceGlobalSettings,
      imbalanceRepresentation: ofs?.imbalanceRepresentation,
      imbalanceBuyColor: ofs?.imbalanceBuyColor,
      imbalanceSellColor: ofs?.imbalanceSellColor,
      textColor: ofs?.textColor,
      zeroColor: ofs?.zeroColor,
      bidColor: ofs?.bidColor,
      askColor: ofs?.askColor,
      deltaPositiveColor: ofs?.deltaPositiveColor,
      deltaNegativeColor: ofs?.deltaNegativeColor,
      showStats: ofs?.showStats,
      statsPosition: ofs?.statsPosition,
      showDelta: ofs?.showDelta,
      showTotalVolume: ofs?.showTotalVolume,
      totalVolumeColor: ofs?.totalVolumeColor,
      showDeltaPercent: ofs?.showDeltaPercent,
      deltaPercentColor: ofs?.deltaPercentColor,
      showMinMaxDelta: ofs?.showMinMaxDelta,
      minDeltaColor: ofs?.minDeltaColor,
      maxDeltaColor: ofs?.maxDeltaColor,
      aggregateProfiles: ofs?.aggregateProfiles,
      convertClusterToCandlesOnZoom: ofs?.convertClusterToCandlesOnZoom,
      includeEmptyLevels: ofs?.includeEmptyLevels,
      barVisualization: ofs?.barVisualization,
      candleZone: ofs?.candleZone,
      candleZonePosition: ofs?.candleZonePosition,
      barMarginPx: ofs?.barMarginPx,
      calculateFontSizeAuto: ofs?.calculateFontSizeAuto,
      maxValueCalculation: ofs?.maxValueCalculation,
      tickSize: tickSizeRef.current,
      volProfileEnabled: ofs?.volProfileEnabled,
      volProfileMode: ofs?.volProfileMode,
      volProfileTickInterval: ofs?.volProfileTickInterval,
      volProfileBarColor: ofs?.volProfileBarColor,
      volProfilePocBarColor: ofs?.volProfilePocBarColor,
      volProfilePocBarEnabled: ofs?.volProfilePocBarEnabled,
      volProfileShowValueArea: ofs?.volProfileShowValueArea,
      volProfileValueAreaPercent: ofs?.volProfileValueAreaPercent,
      volProfileValueAreaBarColor: ofs?.volProfileValueAreaBarColor,
      volProfileValueAreaBarEnabled: ofs?.volProfileValueAreaBarEnabled,
    });
    hostSeries.attachPrimitive(fp);
    footprintPrimitiveRef.current = fp;
    return fp;
  }, [ensureSeriesForChartType]);

  // Dynamically populate future whitespace bars so lightweight-charts creates
  // future tick marks, timescale timestamps, vertical grid lines, and crosshair snapping.
  // Skips full regeneration on candle close unless approaching the whitespace boundary or context changed.
  const updateFutureWhitespace = useCallback((candles: Candle[], tf: string, minBars = 300, force = false) => {
    if (!futureWhitespaceSeriesRef.current || candles.length === 0) return;
    const lastCandle = candles[candles.length - 1];
    const lastTime = lastCandle.time;
    const step =
      getTimeframeDurationSeconds(tf) ||
      (candles.length >= 2 ? Math.max(1, lastTime - candles[candles.length - 2].time) : 60);

    const prev = whitespaceStateRef.current;
    if (
      !force &&
      prev &&
      prev.symbol === symbolRef.current &&
      prev.tf === tf &&
      prev.step === step
    ) {
      const barsAdvanced = Math.round((lastTime - prev.anchorTime) / step);
      const remaining = prev.count - barsAdvanced;
      if (barsAdvanced >= 0 && remaining >= 60 && minBars <= remaining) {
        futureBarCountRef.current = remaining;
        return;
      }
    }

    const count = Math.max(300, minBars);
    futureBarCountRef.current = count;
    whitespaceStateRef.current = {
      symbol: symbolRef.current,
      tf,
      anchorTime: lastTime,
      step,
      count,
    };

    const whitespaceData: WhitespaceData<Time>[] = new Array(count);
    for (let i = 1; i <= count; i++) {
      whitespaceData[i - 1] = {
        time: (lastTime + i * step) as Time,
      };
    }
    futureWhitespaceSeriesRef.current.setData(whitespaceData);
  }, []);

  const updateFutureWhitespaceRef = useRef<(candles: Candle[], tf: string, minBars?: number, force?: boolean) => void>(() => {});
  updateFutureWhitespaceRef.current = updateFutureWhitespace;

  const applyChartTypeData = useCallback((ct: ChartType, candles: Candle[]) => {
    if (!candles || candles.length === 0) return;

    const targetSeries = ensureSeriesForChartType(ct);
    if (targetSeries) {
      syncActiveSeriesState(targetSeries);
    }

    const isCandleType =
      ct === 'candles' ||
      ct === 'hollow_candles' ||
      ct === 'volume_candles' ||
      ct === 'heikin_ashi' ||
      ct === 'renko' ||
      ct === 'high_low' ||
      ct === 'footprint';
    const isBarType = ct === 'bars' || ct === 'hlc_bars';
    const isLineType = ct === 'line' || ct === 'line_with_markers' || ct === 'step_line';

    const mode = chartSettingsRef.current?.symbolPriceScaleMode || 'Value, line';
    const isPriceLineVisible = mode === 'Value, line' || mode === 'Line only';

    let lineStyleEnum = LineStyle.Dashed;
    if (chartSettingsRef.current?.symbolPriceLineStyle === 'solid') {
      lineStyleEnum = LineStyle.Solid;
    } else if (chartSettingsRef.current?.symbolPriceLineStyle === 'dotted') {
      lineStyleEnum = LineStyle.Dotted;
    }

    const priceLineOpts = {
      priceLineVisible: isPriceLineVisible,
      lastValueVisible: false,
      priceLineColor: chartSettingsRef.current?.symbolPriceLineColor || undefined,
      priceLineStyle: lineStyleEnum,
      priceLineWidth: (chartSettingsRef.current?.symbolPriceLineWidth || 1) as 1 | 2 | 3 | 4,
    };

    if (candleSeriesRef.current) {
      if (ct === 'footprint') {
        candleSeriesRef.current.applyOptions({
          visible: true,
          upColor: 'transparent',
          downColor: 'transparent',
          borderUpColor: 'transparent',
          borderDownColor: 'transparent',
          wickUpColor: 'transparent',
          wickDownColor: 'transparent',
          ...priceLineOpts,
        });
      } else {
        candleSeriesRef.current.applyOptions({
          visible: isCandleType,
          upColor: chartSettingsRef.current?.candleBodyUpColor || '#089981',
          downColor: chartSettingsRef.current?.candleBodyDownColor || '#f23645',
          borderUpColor: chartSettingsRef.current?.candleBorderUpColor || '#089981',
          borderDownColor: chartSettingsRef.current?.candleBorderDownColor || '#f23645',
          wickUpColor: chartSettingsRef.current?.candleWickUpColor || '#089981',
          wickDownColor: chartSettingsRef.current?.candleWickDownColor || '#f23645',
          ...(isCandleType ? priceLineOpts : { priceLineVisible: false, lastValueVisible: false }),
        });
      }
    }

    const ofs = orderflowSettingsRef.current;
    const needsFootprint =
      ct === 'footprint' ||
      Boolean(ofs?.volProfileEnabled) ||
      ofs?.volProfileMode === 'profile' ||
      ofs?.volProfileMode === 'both' ||
      ofs?.volProfileMode === 'noCandle';
    const fpPrim = needsFootprint ? ensureFootprintPrimitive() : footprintPrimitiveRef.current;
    if (fpPrim) {
      fpPrim.setOptions({
        visible: ct === 'footprint',
        candleUpColor: chartSettingsRef.current?.candleBodyUpColor,
        candleDownColor: chartSettingsRef.current?.candleBodyDownColor,
        candleBorderUpColor: chartSettingsRef.current?.candleBorderUpColor,
        candleBorderDownColor: chartSettingsRef.current?.candleBorderDownColor,
        candleWickUpColor: chartSettingsRef.current?.candleWickUpColor,
        candleWickDownColor: chartSettingsRef.current?.candleWickDownColor,
        showCandleBody: chartSettingsRef.current?.showCandleBody,
        showCandleBorders: chartSettingsRef.current?.showCandleBorders,
        showCandleWick: chartSettingsRef.current?.showCandleWick,
      });
    }

    barSeriesRef.current?.applyOptions({
      visible: isBarType,
      openVisible: ct === 'bars',
      ...(isBarType ? priceLineOpts : { priceLineVisible: false, lastValueVisible: false }),
    });

    lineSeriesRef.current?.applyOptions({
      visible: isLineType,
      lineType: ct === 'step_line' ? LineType.WithSteps : LineType.Simple,
      pointMarkersVisible: ct === 'line_with_markers',
      ...(isLineType ? priceLineOpts : { priceLineVisible: false, lastValueVisible: false }),
    });

    areaSeriesRef.current?.applyOptions({
      visible: ct === 'area',
      ...(ct === 'area' ? priceLineOpts : { priceLineVisible: false, lastValueVisible: false }),
    });

    baselineSeriesRef.current?.applyOptions({
      visible: ct === 'baseline',
      ...(ct === 'baseline' ? priceLineOpts : { priceLineVisible: false, lastValueVisible: false }),
    });

    if (isCandleType && candleSeriesRef.current) {
      if (ct === 'heikin_ashi') {
        const transformed = transformHeikinAshi(candles);
        derivedBarsRef.current = {
          ct,
          bars: transformed,
          renkoBrickSize: 0,
          renkoPrevBase: 0,
          renkoPrevLastClose: 0,
          renkoCurBase: 0,
          renkoCurLastClose: 0,
        };
        candleSeriesRef.current.setData(transformed);
      } else if (ct === 'hollow_candles') {
        const transformed = transformHollowCandles(candles);
        derivedBarsRef.current = {
          ct,
          bars: transformed,
          renkoBrickSize: 0,
          renkoPrevBase: 0,
          renkoPrevLastClose: 0,
          renkoCurBase: 0,
          renkoCurLastClose: 0,
        };
        candleSeriesRef.current.setData(transformed);
      } else if (ct === 'volume_candles') {
        const transformed = transformVolumeCandles(candles);
        derivedBarsRef.current = {
          ct,
          bars: transformed,
          renkoBrickSize: 0,
          renkoPrevBase: 0,
          renkoPrevLastClose: 0,
          renkoCurBase: 0,
          renkoCurLastClose: 0,
        };
        candleSeriesRef.current.setData(transformed);
      } else if (ct === 'high_low') {
        const transformed = transformHighLow(candles);
        derivedBarsRef.current = {
          ct,
          bars: transformed,
          renkoBrickSize: 0,
          renkoPrevBase: 0,
          renkoPrevLastClose: 0,
          renkoCurBase: 0,
          renkoCurLastClose: 0,
        };
        candleSeriesRef.current.setData(transformed);
      } else if (ct === 'renko') {
        const transformed = transformRenko(candles);
        const avgPrice = candles.reduce((acc, c) => acc + c.close, 0) / candles.length;
        const brickSize = Math.max(
          avgPrice * 0.001,
          Math.abs(candles[candles.length - 1].close - candles[0].close) / 50 || 1
        );
        const initialBase = Math.floor(candles[0].close / brickSize) * brickSize;
        const prevClose =
          transformed.length >= 2 ? Number(transformed[transformed.length - 2].close) : initialBase;
        const curClose =
          transformed.length >= 1 ? Number(transformed[transformed.length - 1].close) : initialBase;
        derivedBarsRef.current = {
          ct,
          bars: transformed,
          renkoBrickSize: brickSize,
          renkoPrevBase: prevClose,
          renkoPrevLastClose: prevClose,
          renkoCurBase: curClose,
          renkoCurLastClose: curClose,
        };
        candleSeriesRef.current.setData(transformed);
      } else {
        derivedBarsRef.current = null;
        candleSeriesRef.current.setData(
          candles.map((c) => ({
            time: c.time as Time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
        );
      }
    } else if (isBarType && barSeriesRef.current) {
      derivedBarsRef.current = null;
      barSeriesRef.current.setData(
        candles.map((c) => ({
          time: c.time as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
    } else if (isLineType && lineSeriesRef.current) {
      derivedBarsRef.current = null;
      lineSeriesRef.current.setData(
        candles.map((c) => ({
          time: c.time as Time,
          value: c.close,
        }))
      );
    } else if (ct === 'area' && areaSeriesRef.current) {
      derivedBarsRef.current = null;
      areaSeriesRef.current.setData(
        candles.map((c) => ({
          time: c.time as Time,
          value: c.close,
        }))
      );
    } else if (ct === 'baseline' && baselineSeriesRef.current) {
      derivedBarsRef.current = null;
      const basePrice = candles[0].close;
      baselineSeriesRef.current.applyOptions({
        baseValue: { type: 'price', price: basePrice },
      });
      baselineSeriesRef.current.setData(
        candles.map((c) => ({
          time: c.time as Time,
          value: c.close,
        }))
      );
    }
  }, [ensureSeriesForChartType, ensureFootprintPrimitive, syncActiveSeriesState]);

  const applyChartTypeDataRef = useRef<(ct: ChartType, candles: Candle[]) => void>(() => {});
  applyChartTypeDataRef.current = applyChartTypeData;

  // Track live WebSocket connection status & recover on reconnect
  useEffect(() => {
    return transport.onWsStatus((connected) => {
      setIsWsActive(connected);
      if (connected) {
        reconcileCatchUpRef.current('ws_reconnect');
      }
    });
  }, []);

  const loadOlderCandles = useCallback(async () => {
    if (isBackfillingRef.current || !hasMoreHistoryRef.current || !chartApiRef.current) return;
    const arr = candlesRef.current;
    if (arr.length === 0) return;

    const earliest = arr[0];
    isBackfillingRef.current = true;
    setIsBackfilling(true);

    try {
      const older = await transport.fetchCandles(
        symbolRef.current,
        timeframeRef.current,
        undefined,
        earliest.time,
        200
      );

      // Strict deduplication & chronological sorting: older candles must have time < earliest.time
      const uniqueOlder = older.filter((c) => c.time < earliest.time);
      uniqueOlder.sort((a, b) => a.time - b.time);

      const seen = new Set<number>();
      const dedupedOlder: Candle[] = [];
      for (const c of uniqueOlder) {
        if (!seen.has(c.time)) {
          seen.add(c.time);
          dedupedOlder.push(c);
        }
      }

      if (dedupedOlder.length === 0) {
        hasMoreHistoryRef.current = false;
        return;
      }

      // Preserve viewport position without visual jump
      const currentLogicalRange = chartApiRef.current.timeScale().getVisibleLogicalRange();

      const merged = [...dedupedOlder, ...candlesRef.current];
      candlesRef.current = merged;
      setCandlesData(merged);
      applyChartTypeDataRef.current(chartTypeRef.current, merged);
      updateFutureWhitespaceRef.current(merged, timeframeRef.current);
      syncIndicators(merged);

      // Backfill footprint orderflow clusters if footprint mode is active
      const isFootprintActive = chartTypeRef.current === 'footprint';
      if (isFootprintActive && footprintPrimitiveRef.current) {
        transport
          .fetchFootprint(symbolRef.current, timeframeRef.current, undefined, earliest.time, 200)
          .then((rawOlderFp) => {
            if (rawOlderFp && rawOlderFp.length > 0) {
              const adaptedOlder = rawOlderFp.map((b) => adaptBackendFootprintBar(b, lookupCandleByTime));
              footprintPrimitiveRef.current?.prependBars(adaptedOlder);
            }
          })
          .catch((fpErr) => {
            console.warn('[Backfill Footprint Error]', fpErr);
          });
      }

      // Shift visible logical range by number of prepended bars so visible bars stay stationary
      if (currentLogicalRange) {
        chartApiRef.current.timeScale().setVisibleLogicalRange({
          from: currentLogicalRange.from + dedupedOlder.length,
          to: currentLogicalRange.to + dedupedOlder.length,
        });
      }
    } catch (err) {
      console.warn('[Backfill History Error]', err);
    } finally {
      setIsBackfilling(false);
      setTimeout(() => {
        isBackfillingRef.current = false;
      }, 250);
    }
  }, []);

  loadOlderCandlesRef.current = loadOlderCandles;

  // Reconcile and backfill missing candles after window backgrounding, tab sleep, or stream gap
  const reconcileCatchUp = useCallback(async (reason = 'visibility') => {
    if (isReconcilingRef.current) return;
    const now = Date.now();
    // Throttle duplicate recovery requests within 1.2s (e.g. visibilitychange + focus firing in parallel)
    if (now - lastReconcileTimeRef.current < 1200) return;
    lastReconcileTimeRef.current = now;

    const sym = symbolRef.current;
    const tf = timeframeRef.current;
    const arr = candlesRef.current;
    if (!sym || !tf || !isInitialCandlesLoadedRef.current || arr.length === 0) return;

    const lastBar = arr[arr.length - 1];
    const dur = Math.max(1, getTimeframeDurationSeconds(tf));
    const nowSec = Math.floor(now / 1000);
    const elapsedSec = nowSec - lastBar.time;

    // Check if more than 1 timeframe interval has elapsed since the last bar
    const isGapPossible = elapsedSec >= dur * 1.5;

    if (!isGapPossible && reason !== 'forced' && reason !== 'live_gap') {
      // No gap, but if live updates arrived while invisible or occluded, flush them to canvas
      if (pendingSeriesFlushRef.current) {
        pendingSeriesFlushRef.current = false;
        applyChartTypeDataRef.current(chartTypeRef.current, arr);
        setCandlesData([...arr]);
      }
      return;
    }

    isReconcilingRef.current = true;
    try {
      const estimatedMissingBars = Math.ceil(elapsedSec / dur);
      // Fetch enough candles to cover the gap plus generous safety overlap for seamless stitching
      const fetchCount = Math.min(1000, Math.max(50, estimatedMissingBars + 20));

      const recentCandles = await transport.fetchCandles(
        sym,
        tf,
        undefined,
        undefined,
        fetchCount
      );

      // Verify that symbol/timeframe haven't changed while fetching
      if (symbolRef.current !== sym || timeframeRef.current !== tf || recentCandles.length === 0) {
        return;
      }

      // Merge recentCandles with candlesRef.current
      const currentArr = candlesRef.current;
      const candleMap = new Map<number, Candle>();

      // Preserve all existing historical candles (including earlier backfilled history)
      for (const c of currentArr) {
        candleMap.set(c.time, c);
      }

      const lastExistingTime = currentArr[currentArr.length - 1]?.time ?? 0;

      // Overwrite/insert recent candles
      for (const rc of recentCandles) {
        const existing = candleMap.get(rc.time);
        if (!existing) {
          candleMap.set(rc.time, rc);
        } else if (rc.time < lastExistingTime) {
          // Closed bar: trust server-calculated candle
          candleMap.set(rc.time, rc);
        } else {
          // Active tip bar: merge with any real-time ticks that arrived in the interim
          candleMap.set(rc.time, {
            ...rc,
            high: Math.max(rc.high, existing.high),
            low: Math.min(rc.low, existing.low),
            close: existing.close,
            volume: Math.max(rc.volume || 0, existing.volume || 0),
          });
        }
      }

      const merged = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);
      candlesRef.current = merged;

      // Update series on canvas and state
      applyChartTypeDataRef.current(chartTypeRef.current, merged);
      setCandlesData(merged);
      updateFutureWhitespaceRef.current(merged, tf);
      syncIndicators(merged);

      if (merged.length > 0 && priceCountdownPrimitiveRef.current) {
        priceCountdownPrimitiveRef.current.updateData({
          price: merged[merged.length - 1].close,
        });
      }
      pendingSeriesFlushRef.current = false;
    } catch (err) {
      console.warn('[reconcileCatchUp] Failed to fetch missing bars:', err);
    } finally {
      isReconcilingRef.current = false;
    }
  }, [syncIndicators]);

  reconcileCatchUpRef.current = reconcileCatchUp;

  // Window & Tab Visibility Recovery: catch up missing bars when window/tab is brought upfront
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        reconcileCatchUpRef.current('visibilitychange');
      }
    };
    const handleFocus = () => {
      reconcileCatchUpRef.current('focus');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Live ticking clock & countdown calculation
  useEffect(() => {
    const updateTick = () => {
      // 1. Clock in selected timezone synchronized to exchange/server time
      const now = new Date(getServerTimeMs());
      const offset = getTimezoneOffsetSeconds(timezone);
      const targetDate = new Date(now.getTime() + offset * 1000 + now.getTimezoneOffset() * 60000);
      const h = String(targetDate.getHours()).padStart(2, '0');
      const m = String(targetDate.getMinutes()).padStart(2, '0');
      const s = String(targetDate.getSeconds()).padStart(2, '0');
      const nextTimeStr = `${h}:${m}:${s}`;
      setCurrentTimeStr((prev) => (prev === nextTimeStr ? prev : nextTimeStr));

      // 2. Bar close countdown
      const arr = candlesRef.current;
      if (arr.length > 0) {
        const lastCandle = arr[arr.length - 1];
        const dur = getTimeframeDurationSeconds(timeframe);
        const nowSec = getServerTimeSec();

        // Calculate countdown to period close.
        // If the last candle is currently open, count down to its closeTs.
        // In low-volume markets when waiting for the next trade to arrive, count down to the current wall-clock bucket end.
        const closeTs = lastCandle.time + dur;
        const isMarketOpen = getMarketStatus(symbol).isOpen;
        const isActivelyTrading = isMarketOpen && (nowSec < closeTs + 2 * dur);
        const shouldShowCountdown = isActivelyTrading && chartSettings.showCountdownToBarClose !== false;

        let formattedCountdown = '';
        if (shouldShowCountdown) {
          let rem = 0;
          if (nowSec < closeTs) {
            rem = closeTs - nowSec;
          } else if (dur > 0) {
            const currentBucketEnd = (Math.floor(nowSec / dur) + 1) * dur;
            rem = currentBucketEnd - nowSec;
          }
          if (dur > 0) {
            rem = Math.min(dur, Math.max(0, rem));
          }

          if (rem < 3600) {
            const remM = Math.floor(rem / 60);
            const remS = rem % 60;
            formattedCountdown = `${String(remM).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
          } else if (rem < 86400) {
            const remH = Math.floor(rem / 3600);
            const remM = Math.floor((rem % 3600) / 60);
            const remS = rem % 60;
            formattedCountdown = `${String(remH).padStart(2, '0')}:${String(remM).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
          } else {
            const remD = Math.floor(rem / 86400);
            const remH = Math.floor((rem % 86400) / 3600);
            formattedCountdown = `${remD}d ${remH}h`;
          }
        }

        priceCountdownPrimitiveRef.current?.updateData({
          countdown: formattedCountdown,
          price: lastCandle.close,
          showCountdown: shouldShowCountdown,
        });
      }
    };

    updateTick();
    const interval = setInterval(updateTick, 250);
    return () => clearInterval(interval);
  }, [timezone, timeframe, symbol, chartSettings.showCountdownToBarClose]);

  // Initialize Lightweight Charts v5 Canvas
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const gridMode = chartSettings.canvasGridMode || 'Vertical and horizontal';
    const showVert = gridMode === 'Vertical and horizontal' || gridMode === 'Vertical only';
    const showHorz = gridMode === 'Vertical and horizontal' || gridMode === 'Horizontal only';

    let gridLineStyleEnum = LineStyle.Dashed;
    if (chartSettings.canvasGridStyle === 'solid') gridLineStyleEnum = LineStyle.Solid;
    else if (chartSettings.canvasGridStyle === 'dotted') gridLineStyleEnum = LineStyle.Dotted;

    let crosshairStyleEnum = LineStyle.Dotted;
    if (chartSettings.canvasCrosshairStyle === 'solid') crosshairStyleEnum = LineStyle.Solid;
    else if (chartSettings.canvasCrosshairStyle === 'dashed') crosshairStyleEnum = LineStyle.Dashed;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background:
          chartSettings.canvasBgType === 'gradient'
            ? {
                type: ColorType.VerticalGradient,
                topColor: chartSettings.canvasBgColor,
                bottomColor: chartSettings.canvasBgColor2,
              }
            : { type: ColorType.Solid, color: chartSettings.canvasBgColor || '#131722' },
        textColor: chartSettings.scalesTextColor || '#787b86',
        fontSize: chartSettings.scalesTextSize || 11,
        fontFamily: "'JetBrains Mono', -apple-system, BlinkMacSystemFont, sans-serif",
        attributionLogo: false,
      },
      grid: {
        vertLines: {
          visible: showVert,
          color: showVert ? (chartSettings.canvasVertGridColor || 'rgba(42, 46, 57, 0.4)') : 'transparent',
          style: gridLineStyleEnum,
        },
        horzLines: {
          visible: showHorz,
          color: showHorz ? (chartSettings.canvasHorzGridColor || 'rgba(42, 46, 57, 0.4)') : 'transparent',
          style: gridLineStyleEnum,
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          visible: cursorType !== 'arrow',
          labelVisible: cursorType !== 'arrow',
          color: chartSettings.canvasCrosshairColor || '#787b86',
          width: (chartSettings.canvasCrosshairWidth || 1) as 1 | 2 | 3 | 4,
          style: crosshairStyleEnum,
          labelBackgroundColor: '#2a2e39',
        },
        horzLine: {
          visible: cursorType !== 'arrow',
          labelVisible: cursorType !== 'arrow',
          color: chartSettings.canvasCrosshairColor || '#787b86',
          width: (chartSettings.canvasCrosshairWidth || 1) as 1 | 2 | 3 | 4,
          style: crosshairStyleEnum,
          labelBackgroundColor: '#2a2e39',
        },
      },
      rightPriceScale: {
        textColor: chartSettings.scalesTextColor || '#787b86',
        borderColor: chartSettings.scalesLineColor || '#2a2e39',
        scaleMargins: {
          top: (chartSettings.marginScaleTop ?? 10) / 100,
          bottom: (chartSettings.marginScaleBottom ?? 8) / 100,
        },
        autoScale: true,
        minimumWidth: 75,
      },
      timeScale: {
        borderColor: chartSettings.scalesLineColor || '#2a2e39',
        rightOffset: chartSettings.marginRightBars ?? 10,
        timeVisible: true,
        secondsVisible: isSecondsTf,
        tickMarkFormatter: (time: Time, tickMarkType: number) => {
          return formatTickMarkInTimezone(time, tickMarkType, timezone, isSecondsTf);
        },
      },
      localization: {
        timeFormatter: (time: Time) => {
          return formatCrosshairTimeInTimezone(time, timezone, isSecondsTf);
        },
      },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
      },
      handleScroll: {
        vertTouchDrag: true,
        horzTouchDrag: true,
      },
    });

    chartApiRef.current = chart;
    setChartInstance(chart);
    paneSyncRegistry.set(paneId, {
      getCandles: () => candlesRef.current,
      getTimeframe: () => timeframeRef.current,
    });
    if (wrapperRef.current) {
      (wrapperRef.current as unknown as { __chart?: IChartApi }).__chart = chart;
    }

    indicatorConnectorRef.current = new UniversalIndicatorConnector(
      chart,
      paneId,
      symbol,
      timeframe,
      {
        onLatestValuesChange: (vals) => {
          hudController.setIndicatorLatestValues(vals);
        },
        onPanesAdjusted: () => {
          requestAnimationFrame(updatePaneOffsets);
        },
      }
    );

    // Initialize professional lightweight-charts v5 text watermark on first pane
    const firstPane = chart.panes()[0];
    if (firstPane) {
      try {
        const cleanSym = symbol.includes(':') ? symbol.split(':')[1] : symbol;
        const wm = getWatermarkLines(cleanSym, timeframe, chartSettings);
        watermarkRef.current = createTextWatermark(firstPane, {
          visible: wm.isVisible,
          horzAlign: 'center',
          vertAlign: 'center',
          lines: wm.lines,
        });
      } catch (err) {
        console.error('Failed to attach text watermark:', err);
      }
    }

    // Lazily create only the series required for the initial active chartType
    const initialActiveSeries = ensureSeriesForChartType(chartTypeRef.current);
    syncActiveSeriesState(initialActiveSeries);

    // Single unified Price & Countdown badge on price scale canvas
    const mode = chartSettings.symbolPriceScaleMode || 'Value, line';
    const isLastValVisible = mode === 'Value, line' || mode === 'Value only' || mode === 'Value according to scale';
    const isMarketOpen = getMarketStatus(symbol).isOpen;
    const priceCountdown = new PriceCountdownPrimitive({
      price: null,
      countdown: '',
      showCountdown: isMarketOpen && chartSettings.showCountdownToBarClose !== false,
      visible: isLastValVisible,
      pricePrecision,
    });
    if (initialActiveSeries) {
      initialActiveSeries.attachPrimitive(priceCountdown);
      activeSeriesForCountdownRef.current = initialActiveSeries;
    }
    priceCountdownPrimitiveRef.current = priceCountdown;

    // Lazily attach FootprintPrimitive only if footprint or volume profile is active initially
    if (
      chartTypeRef.current === 'footprint' ||
      orderflowSettings.volProfileEnabled ||
      orderflowSettings.volProfileMode === 'profile' ||
      orderflowSettings.volProfileMode === 'both' ||
      orderflowSettings.volProfileMode === 'noCandle'
    ) {
      ensureFootprintPrimitive();
    }

    // 4. Future Whitespace Series (LineSeries with transparent styling and autoscale disabled to extend timescale into future)
    const futureWhitespaceSeries = chart.addSeries(LineSeries, {
      color: 'transparent',
      lineWidth: 1,
      lineVisible: false,
      pointMarkersVisible: false,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
      autoscaleInfoProvider: () => null,
    });
    futureWhitespaceSeriesRef.current = futureWhitespaceSeries;

    let crosshairRafId: number | null = null;
    let pendingCrosshair: CrosshairSyncData | null = null;
    let lastHoveredBarTime: number | null = null;

    const checkAutoScale = () => {
      try {
        if (useSyncStore.getState().activePaneId !== paneId) return;
        const mainVIdx = paneOrderRef.current.indexOf('main') !== -1 ? paneOrderRef.current.indexOf('main') : 0;
        const curAuto = chart.priceScale('right', mainVIdx).options().autoScale ?? false;
        setIsAutoScale((prev) => (prev !== curAuto ? curAuto : prev));
      } catch {
        // chart may have been destroyed
      }
    };

    window.addEventListener('pointerup', checkAutoScale);
    window.addEventListener('touchend', checkAutoScale);

    // Crosshair move HUD update & dynamic price Y tracker (zero ChartPane re-renders)
    chart.subscribeCrosshairMove((param) => {
      const isCrosshairLocked = useSyncStore.getState().crosshairLock;

      if (!param || !param.point) {
        if (lastHoveredBarTime !== null) {
          lastHoveredBarTime = null;
          hudController.setHoveredOHLC(null);
          hudController.setHoveredIndicatorValues(null);
        }
        if (crosshairRafId !== null) {
          cancelAnimationFrame(crosshairRafId);
          crosshairRafId = null;
        }
        pendingCrosshair = null;
        if (isCrosshairLocked) {
          useSyncStore.getState().setSyncCrosshair(null);
        }
        return;
      }

      if (isCrosshairLocked) {
        const activeSeries = getActiveSeries(
          chartTypeRef.current,
          candleSeriesRef.current,
          barSeriesRef.current,
          lineSeriesRef.current,
          areaSeriesRef.current,
          baselineSeriesRef.current
        );
        const rawPrice = activeSeries?.coordinateToPrice(param.point.y) ?? null;
        const cursorPrice = rawPrice !== null ? snapPriceToTick(rawPrice, tickSizeRef.current) : null;
        const containerH = chartContainerRef.current?.clientHeight || 0;
        const containerW = chartContainerRef.current?.clientWidth || 0;
        const yRatio = containerH > 0 ? param.point.y / containerH : null;
        const xRatio = containerW > 0 ? param.point.x / containerW : null;

        pendingCrosshair = {
          time: (param.time as number) || null,
          price: cursorPrice,
          xRatio,
          x: param.point.x,
          yRatio,
          y: param.point.y,
          symbol: symbolRef.current,
          sourceId: paneId,
        };

        if (crosshairRafId === null) {
          crosshairRafId = requestAnimationFrame(() => {
            crosshairRafId = null;
            useSyncStore.getState().setSyncCrosshair(pendingCrosshair);
          });
        }
      }

      if (!param.time || !param.seriesData) {
        if (lastHoveredBarTime !== null) {
          lastHoveredBarTime = null;
          hudController.setHoveredOHLC(null);
          hudController.setHoveredIndicatorValues(null);
        }
        return;
      }

      const barTime = param.time as number;
      if (barTime !== lastHoveredBarTime) {
        const targetSeries = activeSeriesInstanceRef.current || candleSeriesRef.current;
        const seriesPoint = targetSeries ? param.seriesData.get(targetSeries) : undefined;
        const matchedCandle = findCandleByTime(candlesRef.current, barTime);

        if (seriesPoint && 'open' in seriesPoint && 'close' in seriesPoint) {
          const ohlc = seriesPoint as CandlestickData<Time>;
          lastHoveredBarTime = barTime;
          const change = ohlc.close - ohlc.open;
          const changePercent = ohlc.open !== 0 ? (change / ohlc.open) * 100 : 0;
          hudController.setHoveredOHLC({
            open: ohlc.open,
            high: ohlc.high,
            low: ohlc.low,
            close: ohlc.close,
            volume: matchedCandle ? matchedCandle.volume : 0,
            change,
            changePercent,
          });
          if (indicatorConnectorRef.current) {
            const hoveredVals = indicatorConnectorRef.current.getValuesAtTime(ohlc.time);
            hudController.setHoveredIndicatorValues(hoveredVals);
          }
        } else if (matchedCandle) {
          lastHoveredBarTime = barTime;
          const change = matchedCandle.close - matchedCandle.open;
          const changePercent = matchedCandle.open !== 0 ? (change / matchedCandle.open) * 100 : 0;
          hudController.setHoveredOHLC({
            open: matchedCandle.open,
            high: matchedCandle.high,
            low: matchedCandle.low,
            close: matchedCandle.close,
            volume: matchedCandle.volume,
            change,
            changePercent,
          });
          if (indicatorConnectorRef.current) {
            const hoveredVals = indicatorConnectorRef.current.getValuesAtTime(barTime as Time);
            hudController.setHoveredIndicatorValues(hoveredVals);
          }
        } else {
          lastHoveredBarTime = null;
          hudController.setHoveredOHLC(null);
          hudController.setHoveredIndicatorValues(null);
        }
      }
    });

    let lastBroadcastRange: { from: number; to: number } | null = null;
    chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
      if (logicalRange && dateRangeLock && !isApplyingSyncRangeRef.current) {
        if (
          !lastBroadcastRange ||
          Math.abs(lastBroadcastRange.from - logicalRange.from) >= 0.1 ||
          Math.abs(lastBroadcastRange.to - logicalRange.to) >= 0.1
        ) {
          lastBroadcastRange = { from: logicalRange.from, to: logicalRange.to };
          useSyncStore.getState().setSyncLogicalRange({
            from: logicalRange.from,
            to: logicalRange.to,
            sourceId: paneId,
          });
        }
      }
      if (logicalRange && logicalRange.from < 50) {
        loadOlderCandlesRef.current();
      }

      // Dynamically extend future timescale buffer as the user scrolls right into the future
      const arr = candlesRef.current;
      if (logicalRange && arr.length > 0) {
        // Toggle "Scroll to the most recent bar" button only when visibility actually flips
        const nextShow = chart.timeScale().scrollPosition() < 2;
        if (nextShow !== showScrollToLatestRef.current) {
          showScrollToLatestRef.current = nextShow;
          setShowScrollToLatest(nextShow);
        }

        const totalBars = arr.length + futureBarCountRef.current;
        if (logicalRange.to > totalBars - 60) {
          updateFutureWhitespaceRef.current(arr, timeframeRef.current, futureBarCountRef.current + 200);
        }
      } else if (showScrollToLatestRef.current) {
        showScrollToLatestRef.current = false;
        setShowScrollToLatest(false);
      }
    });

    // Resize observer attached to wrapperRef (the parent flex container)
    // to measure true grid cell dimensions and prevent chartContainerRef
    // from getting stuck with lightweight-charts inline width/height.
    let lastChartW = 0;
    let lastChartH = 0;
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0 || !entries[0].contentRect) return;
      const { width, height } = entries[0].contentRect;
      const floorW = Math.floor(width);
      const floorH = Math.floor(height);
      if (floorW > 0 && floorH > 0 && (floorW !== lastChartW || floorH !== lastChartH)) {
        lastChartW = floorW;
        lastChartH = floorH;
        if (chartContainerRef.current) {
          chartContainerRef.current.style.width = '100%';
          chartContainerRef.current.style.height = '100%';
        }
        chart.applyOptions({ width: floorW, height: floorH });
      }
    });

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (entries.length > 0) {
          const isNowVisible = entries[0].isIntersecting && entries[0].intersectionRatio > 0;
          const wasVisible = isVisibleRef.current;
          isVisibleRef.current = isNowVisible;
          if (isNowVisible && !wasVisible) {
            reconcileCatchUpRef.current('intersection_visible');
          }
        }
      },
      { threshold: 0 }
    );

    if (wrapperRef.current) {
      resizeObserver.observe(wrapperRef.current);
      intersectionObserver.observe(wrapperRef.current);
    }

    return () => {
      window.removeEventListener('pointerup', checkAutoScale);
      window.removeEventListener('touchend', checkAutoScale);
      paneSyncRegistry.delete(paneId);
      setChartInstance(null);
      syncActiveSeriesState(null);
      if (crosshairRafId !== null) {
        cancelAnimationFrame(crosshairRafId);
        crosshairRafId = null;
      }
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      if (activeSeriesForCountdownRef.current && priceCountdownPrimitiveRef.current) {
        try {
          activeSeriesForCountdownRef.current.detachPrimitive(priceCountdownPrimitiveRef.current);
        } catch {}
      }
      if (candleSeriesRef.current && footprintPrimitiveRef.current) {
        try {
          candleSeriesRef.current.detachPrimitive(footprintPrimitiveRef.current);
        } catch {}
      }
      priceCountdownPrimitiveRef.current = null;
      footprintPrimitiveRef.current = null;
      activeSeriesForCountdownRef.current = null;
      candleSeriesRef.current = null;
      barSeriesRef.current = null;
      lineSeriesRef.current = null;
      areaSeriesRef.current = null;
      baselineSeriesRef.current = null;
      futureWhitespaceSeriesRef.current = null;
      if (watermarkRef.current) {
        try {
          watermarkRef.current.detach();
        } catch {}
        watermarkRef.current = null;
      }
      if (indicatorConnectorRef.current) {
        indicatorConnectorRef.current.destroy();
        indicatorConnectorRef.current = null;
      }
      chart.remove();
      chartApiRef.current = null;
    };
  }, []);

  // Reactive Watermark update
  useEffect(() => {
    const chart = chartApiRef.current;
    if (!chart) return;

    const cleanSym = symbol.includes(':') ? symbol.split(':')[1] : symbol;
    const wm = getWatermarkLines(cleanSym, timeframe, chartSettings);

    if (!watermarkRef.current) {
      const firstPane = chart.panes()[0];
      if (firstPane) {
        try {
          watermarkRef.current = createTextWatermark(firstPane, {
            visible: wm.isVisible,
            horzAlign: 'center',
            vertAlign: 'center',
            lines: wm.lines,
          });
        } catch (err) {
          console.error('Failed to attach text watermark:', err);
        }
      }
    } else {
      try {
        watermarkRef.current.applyOptions({
          visible: wm.isVisible,
          horzAlign: 'center',
          vertAlign: 'center',
          lines: wm.lines,
        });
      } catch (err) {
        console.error('Failed to update text watermark:', err);
      }
    }
  }, [
    chartSettings.canvasWatermark,
    chartSettings.canvasWatermarkTicker,
    chartSettings.canvasWatermarkInterval,
    chartSettings.canvasWatermarkColor,
    symbol,
    timeframe,
  ]);

  // Update chart timeScale and localization formatters whenever timeframe or timezone changes
  useEffect(() => {
    if (!chartApiRef.current) return;
    const isSec = getTimeframeDurationSeconds(timeframe) < 60 || timeframe.trim().toLowerCase().endsWith('s');
    chartApiRef.current.applyOptions({
      timeScale: {
        secondsVisible: isSec,
        tickMarkFormatter: (time: Time, tickMarkType: number) => {
          return formatTickMarkInTimezone(time, tickMarkType, timezone, isSec);
        },
      },
      localization: {
        timeFormatter: (time: Time) => {
          return formatCrosshairTimeInTimezone(time, timezone, isSec);
        },
      },
    });
  }, [timeframe, timezone]);


  const lookupCandleByTime = useCallback((time: number) => {
    const candles = candlesRef.current;
    for (let i = candles.length - 1; i >= 0; i--) {
      const cTime = typeof candles[i].time === 'number'
        ? (candles[i].time as number)
        : Math.floor(new Date(candles[i].time).getTime() / 1000);
      if (cTime === time) return candles[i];
      if (cTime < time - 86400) break;
    }
    return undefined;
  }, []);

  // Auto-fallback from footprint to candles if active symbol does not support L2 orderflow
  useEffect(() => {
    if (chartType === 'footprint') {
      const support = isChartTypeSupported(symbol, 'footprint');
      if (!support.supported) {
        useSyncStore.getState().updatePaneConfig(paneId, { chartType: 'candles' });
      }
    }
  }, [symbol, chartType, paneId]);

  // Update visible series depending on chartType
  useEffect(() => {
    if (candlesRef.current.length > 0) {
      applyChartTypeData(chartType, candlesRef.current);
    }

    const targetSeries =
      getActiveSeries(
        chartType,
        candleSeriesRef.current,
        barSeriesRef.current,
        lineSeriesRef.current,
        areaSeriesRef.current,
        baselineSeriesRef.current
      ) || candleSeriesRef.current;

    if (priceCountdownPrimitiveRef.current && targetSeries && activeSeriesForCountdownRef.current !== targetSeries) {
      if (activeSeriesForCountdownRef.current) {
        try {
          activeSeriesForCountdownRef.current.detachPrimitive(priceCountdownPrimitiveRef.current);
        } catch {}
      }
      try {
        targetSeries.attachPrimitive(priceCountdownPrimitiveRef.current);
        activeSeriesForCountdownRef.current = targetSeries;
      } catch {}
    }

    const isFootprintActive = chartType === 'footprint';
    if (isFootprintActive) {
      const ofs = orderflowSettingsRef.current;
      footprintPrimitiveRef.current?.setOptions({
        visible: true,
        aggregateProfiles: ofs?.aggregateProfiles,
        convertClusterToCandlesOnZoom: ofs?.convertClusterToCandlesOnZoom,
        includeEmptyLevels: ofs?.includeEmptyLevels,
        barVisualization: ofs?.barVisualization,
        candleZone: ofs?.candleZone,
        candleZonePosition: ofs?.candleZonePosition,
        barMarginPx: ofs?.barMarginPx,
        calculateFontSizeAuto: ofs?.calculateFontSizeAuto,
        maxValueCalculation: ofs?.maxValueCalculation,
        showPOC: ofs?.showPOC,
        pocColor: ofs?.pocColor,
        imbalanceRepresentation: ofs?.imbalanceRepresentation,
        imbalanceBuyColor: ofs?.imbalanceBuyColor,
        imbalanceSellColor: ofs?.imbalanceSellColor,
        textColor: ofs?.textColor,
        zeroColor: ofs?.zeroColor,
        bidColor: ofs?.bidColor,
        askColor: ofs?.askColor,
        deltaPositiveColor: ofs?.deltaPositiveColor,
        deltaNegativeColor: ofs?.deltaNegativeColor,
        showStats: ofs?.showStats,
        statsPosition: ofs?.statsPosition,
        showDelta: ofs?.showDelta,
        showTotalVolume: ofs?.showTotalVolume,
        totalVolumeColor: ofs?.totalVolumeColor,
        showDeltaPercent: ofs?.showDeltaPercent,
        deltaPercentColor: ofs?.deltaPercentColor,
        showMinMaxDelta: ofs?.showMinMaxDelta,
        minDeltaColor: ofs?.minDeltaColor,
        maxDeltaColor: ofs?.maxDeltaColor,
        tickSize: tickSizeRef.current,
        candleUpColor: chartSettingsRef.current?.candleBodyUpColor,
        candleDownColor: chartSettingsRef.current?.candleBodyDownColor,
        candleBorderUpColor: chartSettingsRef.current?.candleBorderUpColor,
        candleBorderDownColor: chartSettingsRef.current?.candleBorderDownColor,
        candleWickUpColor: chartSettingsRef.current?.candleWickUpColor,
        candleWickDownColor: chartSettingsRef.current?.candleWickDownColor,
        showCandleBody: chartSettingsRef.current?.showCandleBody,
        showCandleBorders: chartSettingsRef.current?.showCandleBorders,
        showCandleWick: chartSettingsRef.current?.showCandleWick,
        volProfileEnabled: ofs?.volProfileEnabled,
        volProfileMode: ofs?.volProfileMode,
        volProfileTickInterval: ofs?.volProfileTickInterval,
        volProfileBarColor: ofs?.volProfileBarColor,
        volProfilePocBarColor: ofs?.volProfilePocBarColor,
        volProfilePocBarEnabled: ofs?.volProfilePocBarEnabled,
        volProfileShowValueArea: ofs?.volProfileShowValueArea,
        volProfileValueAreaPercent: ofs?.volProfileValueAreaPercent,
        volProfileValueAreaBarColor: ofs?.volProfileValueAreaBarColor,
        volProfileValueAreaBarEnabled: ofs?.volProfileValueAreaBarEnabled,
      });
      if ((chartType === 'footprint' || ofs?.volProfileEnabled || ofs?.volProfileMode === 'profile' || ofs?.volProfileMode === 'both' || ofs?.volProfileMode === 'noCandle') && isChartTypeSupported(symbolRef.current, 'footprint').supported) {
        transport.fetchFootprint(symbolRef.current, timeframeRef.current, undefined, undefined, Math.max(200, candlesRef.current.length))
          .then((rawBars) => {
            if (rawBars && rawBars.length > 0) {
              const adapted = rawBars.map((b) => adaptBackendFootprintBar(b, lookupCandleByTime));
              footprintPrimitiveRef.current?.updateData(adapted);
            }
          })
          .catch((err) => console.warn('[ChartPane] Footprint history fetch error:', err));
      }
    } else {
      footprintPrimitiveRef.current?.setOptions({ visible: false });
    }
  }, [chartType, applyChartTypeData, lookupCandleByTime]);

  // Synchronize Orderflow / Footprint options dynamically without triggering re-fetch
  useEffect(() => {
    const isFootprintActive = chartType === 'footprint';
    footprintPrimitiveRef.current?.setOptions({
      visible: isFootprintActive,
      aggregateProfiles: orderflowSettings.aggregateProfiles,
      convertClusterToCandlesOnZoom: orderflowSettings.convertClusterToCandlesOnZoom,
      includeEmptyLevels: orderflowSettings.includeEmptyLevels,
      barVisualization: orderflowSettings.barVisualization,
      candleZone: orderflowSettings.candleZone,
      candleZonePosition: orderflowSettings.candleZonePosition,
      barMarginPx: orderflowSettings.barMarginPx,
      calculateFontSizeAuto: orderflowSettings.calculateFontSizeAuto,
      maxValueCalculation: orderflowSettings.maxValueCalculation,
      showPOC: orderflowSettings.showPOC,
      pocColor: orderflowSettings.pocColor,
      imbalanceRules: orderflowSettings.imbalanceRules,
      imbalanceGlobalSettings: orderflowSettings.imbalanceGlobalSettings,
      imbalanceRepresentation: orderflowSettings.imbalanceRepresentation,
      imbalanceBuyColor: orderflowSettings.imbalanceBuyColor,
      imbalanceSellColor: orderflowSettings.imbalanceSellColor,
      textColor: orderflowSettings.textColor,
      zeroColor: orderflowSettings.zeroColor,
      bidColor: orderflowSettings.bidColor,
      askColor: orderflowSettings.askColor,
      deltaPositiveColor: orderflowSettings.deltaPositiveColor,
      deltaNegativeColor: orderflowSettings.deltaNegativeColor,
      showStats: orderflowSettings.showStats,
      statsPosition: orderflowSettings.statsPosition,
      showDelta: orderflowSettings.showDelta,
      showTotalVolume: orderflowSettings.showTotalVolume,
      totalVolumeColor: orderflowSettings.totalVolumeColor,
      showDeltaPercent: orderflowSettings.showDeltaPercent,
      deltaPercentColor: orderflowSettings.deltaPercentColor,
      showMinMaxDelta: orderflowSettings.showMinMaxDelta,
      minDeltaColor: orderflowSettings.minDeltaColor,
      maxDeltaColor: orderflowSettings.maxDeltaColor,
      tickSize: tickSizeRef.current,
      candleUpColor: chartSettingsRef.current?.candleBodyUpColor,
      candleDownColor: chartSettingsRef.current?.candleBodyDownColor,
      candleBorderUpColor: chartSettingsRef.current?.candleBorderUpColor,
      candleBorderDownColor: chartSettingsRef.current?.candleBorderDownColor,
      candleWickUpColor: chartSettingsRef.current?.candleWickUpColor,
      candleWickDownColor: chartSettingsRef.current?.candleWickDownColor,
      showCandleBody: chartSettingsRef.current?.showCandleBody,
      showCandleBorders: chartSettingsRef.current?.showCandleBorders,
      showCandleWick: chartSettingsRef.current?.showCandleWick,
      volProfileEnabled: orderflowSettings.volProfileEnabled,
      volProfileMode: orderflowSettings.volProfileMode,
      volProfileTickInterval: orderflowSettings.volProfileTickInterval,
      volProfileBarColor: orderflowSettings.volProfileBarColor,
      volProfilePocBarColor: orderflowSettings.volProfilePocBarColor,
      volProfilePocBarEnabled: orderflowSettings.volProfilePocBarEnabled,
      volProfileShowValueArea: orderflowSettings.volProfileShowValueArea,
      volProfileValueAreaPercent: orderflowSettings.volProfileValueAreaPercent,
      volProfileValueAreaBarColor: orderflowSettings.volProfileValueAreaBarColor,
      volProfileValueAreaBarEnabled: orderflowSettings.volProfileValueAreaBarEnabled,
    });
  }, [orderflowSettings, chartType]);

  // Dynamically apply visual settings changes from Chart Settings Modal
  useEffect(() => {
    // Determine price line and last value label visibility from symbolPriceScaleMode
    const mode = chartSettings.symbolPriceScaleMode || 'Value, line';
    const isPriceLineVisible = mode === 'Value, line' || mode === 'Line only';
    const isLastValueVisible = mode === 'Value, line' || mode === 'Value only' || mode === 'Value according to scale';

    let lineStyleEnum = LineStyle.Dashed;
    if (chartSettings.symbolPriceLineStyle === 'solid') {
      lineStyleEnum = LineStyle.Solid;
    } else if (chartSettings.symbolPriceLineStyle === 'dotted') {
      lineStyleEnum = LineStyle.Dotted;
    }

    const priceLineOpts = {
      priceLineVisible: isPriceLineVisible,
      lastValueVisible: false,
      priceLineColor: chartSettings.symbolPriceLineColor || undefined,
      priceLineStyle: lineStyleEnum,
      priceLineWidth: (chartSettings.symbolPriceLineWidth || 1) as 1 | 2 | 3 | 4,
    };

    priceCountdownPrimitiveRef.current?.updateData({
      showCountdown: getMarketStatus(symbol).isOpen && chartSettings.showCountdownToBarClose !== false,
      visible: isLastValueVisible,
    });

    footprintPrimitiveRef.current?.setOptions({
      candleUpColor: chartSettings.candleBodyUpColor,
      candleDownColor: chartSettings.candleBodyDownColor,
      candleBorderUpColor: chartSettings.candleBorderUpColor,
      candleBorderDownColor: chartSettings.candleBorderDownColor,
      candleWickUpColor: chartSettings.candleWickUpColor,
      candleWickDownColor: chartSettings.candleWickDownColor,
      showCandleBody: chartSettings.showCandleBody,
      showCandleBorders: chartSettings.showCandleBorders,
      showCandleWick: chartSettings.showCandleWick,
    });

    const activeSeries = getActiveSeries(
      chartType,
      candleSeriesRef.current,
      barSeriesRef.current,
      lineSeriesRef.current,
      areaSeriesRef.current,
      baselineSeriesRef.current
    ) || candleSeriesRef.current;

    const allSeriesList = [
      { ref: candleSeriesRef.current, isCandle: true },
      { ref: barSeriesRef.current, isCandle: false },
      { ref: lineSeriesRef.current, isCandle: false },
      { ref: areaSeriesRef.current, isCandle: false },
      { ref: baselineSeriesRef.current, isCandle: false },
    ];

    allSeriesList.forEach(({ ref, isCandle }) => {
      if (!ref) return;
      if (ref === activeSeries) {
        if (isCandle && chartType === 'footprint') {
          ref.applyOptions({
            upColor: 'transparent',
            downColor: 'transparent',
            borderUpColor: 'transparent',
            borderDownColor: 'transparent',
            wickUpColor: 'transparent',
            wickDownColor: 'transparent',
            ...priceLineOpts,
          });
        } else if (isCandle) {
          ref.applyOptions({
            upColor: chartSettings.showCandleBody ? chartSettings.candleBodyUpColor : 'transparent',
            downColor: chartSettings.showCandleBody ? chartSettings.candleBodyDownColor : 'transparent',
            borderUpColor: chartSettings.showCandleBorders ? chartSettings.candleBorderUpColor : 'transparent',
            borderDownColor: chartSettings.showCandleBorders ? chartSettings.candleBorderDownColor : 'transparent',
            wickUpColor: chartSettings.showCandleWick ? chartSettings.candleWickUpColor : 'transparent',
            wickDownColor: chartSettings.showCandleWick ? chartSettings.candleWickDownColor : 'transparent',
            ...priceLineOpts,
          });
        } else {
          ref.applyOptions({
            ...priceLineOpts,
          });
        }
      } else {
        ref.applyOptions({
          priceLineVisible: false,
          lastValueVisible: false,
        });
      }
    });

    if (chartApiRef.current) {
      const prev = prevSettingsRef.current;
      const timeScale = chartApiRef.current.timeScale();
      const currentLogicalRange = timeScale.getVisibleLogicalRange();

      const gridMode = chartSettings.canvasGridMode || 'Vertical and horizontal';
      const showVert = gridMode === 'Vertical and horizontal' || gridMode === 'Vertical only';
      const showHorz = gridMode === 'Vertical and horizontal' || gridMode === 'Horizontal only';

      let gridLineStyleEnum = LineStyle.Dashed;
      if (chartSettings.canvasGridStyle === 'solid') gridLineStyleEnum = LineStyle.Solid;
      else if (chartSettings.canvasGridStyle === 'dotted') gridLineStyleEnum = LineStyle.Dotted;

      let crosshairStyleEnum = LineStyle.Dotted;
      if (chartSettings.canvasCrosshairStyle === 'solid') crosshairStyleEnum = LineStyle.Solid;
      else if (chartSettings.canvasCrosshairStyle === 'dashed') crosshairStyleEnum = LineStyle.Dashed;

      chartApiRef.current.applyOptions({
        layout: {
          background:
            chartSettings.canvasBgType === 'gradient'
              ? {
                  type: ColorType.VerticalGradient,
                  topColor: chartSettings.canvasBgColor,
                  bottomColor: chartSettings.canvasBgColor2,
                }
              : { type: ColorType.Solid, color: chartSettings.canvasBgColor },
          textColor: chartSettings.scalesTextColor || '#787b86',
          fontSize: chartSettings.scalesTextSize || 11,
        },
        grid: {
          vertLines: {
            visible: showVert,
            color: showVert ? (chartSettings.canvasVertGridColor || 'rgba(42, 46, 57, 0.4)') : 'transparent',
            style: gridLineStyleEnum,
          },
          horzLines: {
            visible: showHorz,
            color: showHorz ? (chartSettings.canvasHorzGridColor || 'rgba(42, 46, 57, 0.4)') : 'transparent',
            style: gridLineStyleEnum,
          },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            visible: cursorType !== 'arrow',
            labelVisible: cursorType !== 'arrow',
            color: chartSettings.canvasCrosshairColor || '#787b86',
            width: (chartSettings.canvasCrosshairWidth || 1) as 1 | 2 | 3 | 4,
            style: crosshairStyleEnum,
          },
          horzLine: {
            visible: cursorType !== 'arrow',
            labelVisible: cursorType !== 'arrow',
            color: chartSettings.canvasCrosshairColor || '#787b86',
            width: (chartSettings.canvasCrosshairWidth || 1) as 1 | 2 | 3 | 4,
            style: crosshairStyleEnum,
          },
        },
        rightPriceScale: {
          textColor: chartSettings.scalesTextColor || '#787b86',
          borderColor: chartSettings.scalesLineColor || '#2a2e39',
        },
        timeScale: {
          borderColor: chartSettings.scalesLineColor || '#2a2e39',
        },
      });

      // Explicitly update all pane price scales to ensure instant redraw across all indicator subpanes
      const allPanes = chartApiRef.current.panes();
      const mainVIdx = paneOrderRef.current.indexOf('main') !== -1 ? paneOrderRef.current.indexOf('main') : 0;
      allPanes.forEach((_, pIdx) => {
        chartApiRef.current?.priceScale('right', pIdx).applyOptions({
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
      timeScale.applyOptions({
        borderColor: chartSettings.scalesLineColor || '#2a2e39',
      });

      // Synchronize indicator level axis labels text color
      indicatorConnectorRef.current?.updateChartSettings(chartSettings);

      // Only update scaleMargins if the margin percentages specifically changed
      if (
        prev &&
        (prev.marginScaleTop !== chartSettings.marginScaleTop ||
          prev.marginScaleBottom !== chartSettings.marginScaleBottom)
      ) {
        chartApiRef.current.priceScale('right', mainVIdx).applyOptions({
          scaleMargins: {
            top: (chartSettings.marginScaleTop ?? 10) / 100,
            bottom: (chartSettings.marginScaleBottom ?? 8) / 100,
          },
        });
      }

      // Only update rightOffset if marginRightBars specifically changed
      if (prev && prev.marginRightBars !== chartSettings.marginRightBars) {
        timeScale.applyOptions({
          rightOffset: chartSettings.marginRightBars ?? 10,
        });
      } else if (currentLogicalRange) {
        // Guarantee candles remain in the exact same position without resetting layout
        timeScale.setVisibleLogicalRange(currentLogicalRange);
      }

      prevSettingsRef.current = chartSettings;
    }
  }, [chartSettings, chartType]);

  // Dynamically update crosshair lines when cursorType changes (Cross vs Dot vs Arrow)
  useEffect(() => {
    if (chartApiRef.current) {
      const isArrow = cursorType === 'arrow';
      chartApiRef.current.applyOptions({
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            visible: !isArrow,
            labelVisible: !isArrow,
          },
          horzLine: {
            visible: !isArrow,
            labelVisible: !isArrow,
          },
        },
      });
    }
  }, [cursorType]);

  // Dynamically update series priceFormat and precision when symbol changes
  useEffect(() => {
    const lastPrice = candlesRef.current[candlesRef.current.length - 1]?.close;
    const decimals = getPriceDecimals(symbol, lastPrice);
    const detectedTick = detectTickSizeFromCandles(candlesRef.current, symbol);
    setPricePrecision(decimals);
    setTickSize(detectedTick);
    const formatConfig = getPriceFormatConfig(decimals, detectedTick);
    candleSeriesRef.current?.applyOptions({ priceFormat: formatConfig });
    barSeriesRef.current?.applyOptions({ priceFormat: formatConfig });
    lineSeriesRef.current?.applyOptions({ priceFormat: formatConfig });
    areaSeriesRef.current?.applyOptions({ priceFormat: formatConfig });
    baselineSeriesRef.current?.applyOptions({ priceFormat: formatConfig });
    priceCountdownPrimitiveRef.current?.updateData({ pricePrecision: decimals });
  }, [symbol]);

  // Toggle Log scale
  const toggleLogScale = () => {
    if (!chartApiRef.current) return;
    const nextLog = !isLogScale;
    setIsLogScale(nextLog);
    chartApiRef.current.priceScale('right').applyOptions({
      mode: nextLog ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
    });
  };

  // Reset Auto scale & frame latest price cleanly in view
  const resetAutoScale = () => {
    if (!chartApiRef.current || candlesRef.current.length === 0) return;
    const count = candlesRef.current.length;
    const visibleCount = Math.min(count, 80);
    chartApiRef.current.timeScale().setVisibleLogicalRange({
      from: count - visibleCount,
      to: count + 5,
    });
    const mainVIdx = paneOrderRef.current.indexOf('main') !== -1 ? paneOrderRef.current.indexOf('main') : 0;
    chartApiRef.current.panes().forEach((_, pIdx) => {
      chartApiRef.current?.priceScale('right', pIdx).applyOptions({
        autoScale: true,
        ...(pIdx !== mainVIdx ? { scaleMargins: { top: 0.1, bottom: 0.1 } } : {}),
      });
    });
    setIsAutoScale(true);
  };

  // Toggle Auto price scale
  const toggleAutoScale = () => {
    if (!chartApiRef.current) return;
    const mainVIdx = paneOrderRef.current.indexOf('main') !== -1 ? paneOrderRef.current.indexOf('main') : 0;
    const curAuto = chartApiRef.current.priceScale('right', mainVIdx).options().autoScale ?? false;
    const nextAuto = !curAuto;
    if (nextAuto) {
      if (candlesRef.current.length > 0) {
        const count = candlesRef.current.length;
        const visibleCount = Math.min(count, 80);
        chartApiRef.current.timeScale().setVisibleLogicalRange({
          from: count - visibleCount,
          to: count + 5,
        });
      }
      chartApiRef.current.panes().forEach((_, pIdx) => {
        chartApiRef.current?.priceScale('right', pIdx).applyOptions({
          autoScale: true,
          ...(pIdx !== mainVIdx ? { scaleMargins: { top: 0.1, bottom: 0.1 } } : {}),
        });
      });
      setIsAutoScale(true);
    } else {
      const range = chartApiRef.current.priceScale('right', mainVIdx).getVisibleRange();
      if (range) {
        chartApiRef.current.priceScale('right', mainVIdx).setVisibleRange(range);
      } else {
        chartApiRef.current.priceScale('right', mainVIdx).applyOptions({
          autoScale: false,
        });
      }
      setIsAutoScale(false);
    }
  };

  // Reset chart view (Alt + R)
  const handleResetChartView = useCallback(() => {
    resetAutoScale();
    if (chartApiRef.current) {
      chartApiRef.current.timeScale().resetTimeScale();
    }
  }, []);

  // Global Alt + R shortcut to reset chart view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        handleResetChartView();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleResetChartView]);

  // Right-click context menu handler
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setActivePaneId(paneId);
    const container = chartContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const localY = e.clientY - rect.top;
    let price: number | null = null;
    const activeSeries = getActiveSeries(
      chartTypeRef.current,
      candleSeriesRef.current,
      barSeriesRef.current,
      lineSeriesRef.current,
      areaSeriesRef.current,
      baselineSeriesRef.current
    );
    if (activeSeries) {
      price = activeSeries.coordinateToPrice(localY);
    }
    if (price === null && candlesRef.current.length > 0) {
      price = candlesRef.current[candlesRef.current.length - 1].close;
    }

    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      price,
    });
  };

  // Load historical data AND subscribe to real-time stream
  useEffect(() => {
    let isCancelled = false;
    let wsCleanup: (() => void) | null = null;
    let fpWsCleanup: (() => void) | null = null;
    let hudRafId: number | null = null;
    let candlesRafId: number | null = null;
    let candlesTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let tickRafId: number | null = null;
    let pendingHistoricalSync = false;
    const pendingTickCandles = new Map<number, Candle>();
    const pendingFpBars = new Map<number, FootprintBar>();
    setIsLoading(true);
    setError(null);
    setIsWsActive(false);
    hasMoreHistoryRef.current = true;
    isBackfillingRef.current = false;

    const loadAndStream = async () => {
      try {
        const candles = await transport.fetchCandles(symbol, timeframe, undefined, undefined, 200);
        if (isCancelled) return;

        if (candles.length === 0) {
          setError('No candle data received');
          setIsLoading(false);
          return;
        }

        candlesRef.current = [...candles];
        setCandlesData([...candles]);

        applyChartTypeDataRef.current(chartTypeRef.current, candles);
        updateFutureWhitespace(candles, timeframe, 300);
        indicatorConnectorRef.current?.updateContext(symbol, timeframe);
        syncIndicators(candles);

        const isFootprintActive = chartTypeRef.current === 'footprint';
        if (isFootprintActive && isChartTypeSupported(symbol, 'footprint').supported) {
          transport.fetchFootprint(symbol, timeframe, undefined, undefined, Math.max(200, candles.length))
            .then((rawBars) => {
              if (rawBars && rawBars.length > 0) {
                const adapted = rawBars.map((b) => adaptBackendFootprintBar(b, lookupCandleByTime));
                footprintPrimitiveRef.current?.updateData(adapted);
              }
            })
            .catch((err) => console.warn('[ChartPane] Footprint fetch error:', err));
        }

        const detectedDecimals = detectPrecisionFromCandles(candles, symbol);
        const detectedTick = detectTickSizeFromCandles(candles, symbol);
        setPricePrecision(detectedDecimals);
        setTickSize(detectedTick);
        const formatConfig = getPriceFormatConfig(detectedDecimals, detectedTick);
        candleSeriesRef.current?.applyOptions({ priceFormat: formatConfig });
        barSeriesRef.current?.applyOptions({ priceFormat: formatConfig });
        lineSeriesRef.current?.applyOptions({ priceFormat: formatConfig });
        areaSeriesRef.current?.applyOptions({ priceFormat: formatConfig });
        baselineSeriesRef.current?.applyOptions({ priceFormat: formatConfig });

        const isFirstLoad = !isInitialCandlesLoadedRef.current;
        const isSymbolChange = prevLoadedSymbolRef.current !== null && prevLoadedSymbolRef.current !== symbol;
        const isTimeframeChange = prevLoadedTimeframeRef.current !== null && prevLoadedTimeframeRef.current !== timeframe;
        prevLoadedSymbolRef.current = symbol;
        prevLoadedTimeframeRef.current = timeframe;
        isInitialCandlesLoadedRef.current = true;

        // Position viewport to keep last price visible
        if (isFirstLoad || isSymbolChange) {
          if (candles.length > 0 && chartApiRef.current) {
            const count = candles.length;
            const visibleCount = Math.min(count, 80);
            chartApiRef.current.timeScale().setVisibleLogicalRange({
              from: count - visibleCount,
              to: count + 5,
            });

            const mainVIdx = paneOrderRef.current.indexOf('main') !== -1 ? paneOrderRef.current.indexOf('main') : 0;
            chartApiRef.current.priceScale('right', mainVIdx).applyOptions({
              autoScale: true,
              scaleMargins: {
                top: (chartSettings.marginScaleTop ?? 10) / 100,
                bottom: (chartSettings.marginScaleBottom ?? 8) / 100,
              },
            });
            setIsAutoScale(true);
          }
        } else if (isTimeframeChange) {
          if (candles.length > 0 && chartApiRef.current) {
            const count = candles.length;
            const visibleCount = Math.min(count, 80);
            chartApiRef.current.timeScale().setVisibleLogicalRange({
              from: count - visibleCount,
              to: count + 5,
            });

            const mainVIdx = paneOrderRef.current.indexOf('main') !== -1 ? paneOrderRef.current.indexOf('main') : 0;
            const mainScale = chartApiRef.current.priceScale('right', mainVIdx);

            // Timeframe change must NOT enter Auto scaling mode
            mainScale.applyOptions({
              autoScale: false,
            });
            setIsAutoScale(false);

            // Keep the last price cleanly in view vertically
            const lastCandle = candles[candles.length - 1];
            const curRange = mainScale.getVisibleRange();
            if (curRange) {
              const span = Math.max(1, curRange.to - curRange.from);
              if (lastCandle.close < curRange.from || lastCandle.close > curRange.to) {
                mainScale.setVisibleRange({
                  from: lastCandle.close - span * 0.45,
                  to: lastCandle.close + span * 0.55,
                });
              }
            } else {
              const priceSpan = Math.max(1, (lastCandle.high - lastCandle.low) * 8);
              mainScale.setVisibleRange({
                from: lastCandle.close - priceSpan * 0.45,
                to: lastCandle.close + priceSpan * 0.55,
              });
            }
          }
        }

        // Default HUD
        const last = candles[candles.length - 1];
        const change = last.close - last.open;
        const changePercent = last.open !== 0 ? (change / last.open) * 100 : 0;
        hudController.setLiveOHLC({
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
          volume: last.volume,
          change,
          changePercent,
        });
        hudController.setHoveredOHLC(null);
        hudController.setHoveredIndicatorValues(null);

        // Initialize Price & Countdown badge on price scale canvas
        priceCountdownPrimitiveRef.current?.updateData({
          price: last.close,
          pricePrecision: detectedDecimals,
          showCountdown: getMarketStatus(symbol).isOpen && chartSettings.showCountdownToBarClose !== false,
        });

        setIsLoading(false);

        // Ultra-low-latency HUD/React state coalescing:
        // Canvas updates happen synchronously at 144Hz, while React DOM updates
        // are coalesced via requestAnimationFrame to avoid blocking the JS thread.
        let pendingHudUpdate: {
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
          change: number;
          changePercent: number;
        } | null = null;

        const scheduleHudUpdate = (
          ohlc: {
            open: number;
            high: number;
            low: number;
            close: number;
            volume: number;
            change: number;
            changePercent: number;
          }
        ) => {
          pendingHudUpdate = ohlc;
          if (hudRafId === null) {
            hudRafId = requestAnimationFrame(() => {
              hudRafId = null;
              if (pendingHudUpdate) {
                hudController.setLiveOHLC(pendingHudUpdate);
              }
            });
          }
        };

        // Throttle live candles React state updates to 4fps (250ms) so React components (DrawingCanvas, HUD)
        // do not re-render 60-80 times per second on high-frequency live ticker streams.
        // The candlestick chart series itself is updated immediately via candleSeriesRef.current.update().
        let lastCandlesStateTime = 0;
        let pendingCandlesUpdate = false;

        const scheduleCandlesUpdate = (forceImmediate = false) => {
          pendingCandlesUpdate = true;
          const now = performance.now();
          if (forceImmediate || now - lastCandlesStateTime >= 250) {
            lastCandlesStateTime = now;
            if (candlesTimeoutId !== null) {
              clearTimeout(candlesTimeoutId);
              candlesTimeoutId = null;
            }
            if (candlesRafId === null) {
              candlesRafId = requestAnimationFrame(() => {
                candlesRafId = null;
                if (isCancelled) return;
                if (pendingCandlesUpdate) {
                  pendingCandlesUpdate = false;
                  setCandlesData([...candlesRef.current]);
                }
              });
            }
          } else if (candlesTimeoutId === null) {
            candlesTimeoutId = setTimeout(() => {
              candlesTimeoutId = null;
              lastCandlesStateTime = performance.now();
              if (isCancelled) return;
              if (pendingCandlesUpdate) {
                pendingCandlesUpdate = false;
                setCandlesData([...candlesRef.current]);
              }
            }, 250 - (now - lastCandlesStateTime));
          }
        };

        const applySeriesUpdate = (candle: Candle) => {
          const timeVal = candle.time as Time;
          const ct = chartTypeRef.current;

          if (ct === 'line' || ct === 'line_with_markers' || ct === 'step_line') {
            lineSeriesRef.current?.update({ time: timeVal, value: candle.close });
          } else if (ct === 'area') {
            areaSeriesRef.current?.update({ time: timeVal, value: candle.close });
          } else if (ct === 'baseline') {
            baselineSeriesRef.current?.update({ time: timeVal, value: candle.close });
          } else if (ct === 'bars' || ct === 'hlc_bars') {
            barSeriesRef.current?.update({
              time: timeVal,
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
            });
          } else if (
            ct === 'heikin_ashi' ||
            ct === 'hollow_candles' ||
            ct === 'volume_candles' ||
            ct === 'high_low' ||
            ct === 'renko'
          ) {
            const derived = derivedBarsRef.current;
            const src = candlesRef.current;
            const candleSeriesInst = candleSeriesRef.current;
            if (!derived || derived.ct !== ct || derived.bars.length === 0 || src.length === 0 || !candleSeriesInst) {
              applyChartTypeDataRef.current(ct, src);
            } else {
              const dBars = derived.bars;
              const lastDerived = dBars[dBars.length - 1];
              const lastDerivedTime = Number(lastDerived.time);
              const incomingTime = Number(candle.time);
              const isTipUpdate = incomingTime === lastDerivedTime;
              const isNextAppend = incomingTime > lastDerivedTime;

              if (!isTipUpdate && !isNextAppend) {
                applyChartTypeDataRef.current(ct, src);
              } else {
                const targetIdx = isTipUpdate ? dBars.length - 1 : dBars.length;
                let nextBar: CandlestickData<Time> | null = null;

                if (ct === 'heikin_ashi') {
                  const haClose = (candle.open + candle.high + candle.low + candle.close) / 4;
                  const prevBar = targetIdx > 0 ? dBars[targetIdx - 1] : null;
                  const haOpen = prevBar
                    ? (Number(prevBar.open) + Number(prevBar.close)) / 2
                    : (candle.open + candle.close) / 2;
                  nextBar = {
                    time: timeVal,
                    open: haOpen,
                    high: Math.max(candle.high, haOpen, haClose),
                    low: Math.min(candle.low, haOpen, haClose),
                    close: haClose,
                  };
                } else if (ct === 'hollow_candles') {
                  const srcIdx = isTipUpdate ? src.length - 1 : src.length - 1;
                  const prevSrc = srcIdx > 0 ? src[srcIdx - 1] : null;
                  const isBullish = candle.close >= candle.open;
                  const isHigher = prevSrc ? candle.close >= prevSrc.close : isBullish;
                  const col = isBullish ? '#089981' : '#f23645';
                  nextBar = {
                    time: timeVal,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                    color: isHigher ? 'transparent' : col,
                    borderColor: col,
                    wickColor: col,
                  };
                } else if (ct === 'volume_candles') {
                  const winStart = Math.max(0, src.length - 20);
                  let volSum = 0;
                  const winCount = src.length - winStart;
                  for (let vi = winStart; vi < src.length; vi++) {
                    volSum += src[vi].volume;
                  }
                  const avgVol = winCount > 0 ? volSum / winCount : 0;
                  const volRatio = avgVol > 0 ? candle.volume / avgVol : 1;
                  const isBull = candle.close >= candle.open;
                  let col = isBull ? '#089981' : '#f23645';
                  let borderCol = col;
                  if (isBull) {
                    if (volRatio >= 1.5) { col = '#00c853'; borderCol = '#00e676'; }
                    else if (volRatio <= 0.6) { col = 'rgba(8, 153, 129, 0.45)'; borderCol = 'rgba(8, 153, 129, 0.65)'; }
                  } else {
                    if (volRatio >= 1.5) { col = '#d50000'; borderCol = '#ff1744'; }
                    else if (volRatio <= 0.6) { col = 'rgba(242, 54, 69, 0.45)'; borderCol = 'rgba(242, 54, 69, 0.65)'; }
                  }
                  nextBar = {
                    time: timeVal,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                    color: col,
                    borderColor: borderCol,
                    wickColor: borderCol,
                  };
                } else if (ct === 'high_low') {
                  const prevSrc = src.length >= 2 ? src[src.length - 2] : null;
                  const isUp = prevSrc ? candle.close >= prevSrc.close : candle.close >= candle.open;
                  const col = isUp ? '#089981' : '#f23645';
                  nextBar = {
                    time: timeVal,
                    open: candle.low,
                    high: candle.high,
                    low: candle.low,
                    close: candle.high,
                    color: col,
                    borderColor: col,
                    wickColor: col,
                  };
                } else if (ct === 'renko' && derived.renkoBrickSize > 0) {
                  const brickSize = derived.renkoBrickSize;
                  const baseBefore = isTipUpdate ? derived.renkoPrevBase : derived.renkoCurBase;
                  const lastBefore = isTipUpdate ? derived.renkoPrevLastClose : derived.renkoCurLastClose;
                  const diff = candle.close - baseBefore;
                  if (diff >= brickSize) {
                    const nextClose = baseBefore + brickSize;
                    nextBar = {
                      time: timeVal,
                      open: baseBefore,
                      high: nextClose,
                      low: baseBefore,
                      close: nextClose,
                      color: '#089981',
                      borderColor: '#089981',
                      wickColor: '#089981',
                    };
                    if (!isTipUpdate) {
                      derived.renkoPrevBase = baseBefore;
                      derived.renkoPrevLastClose = lastBefore;
                    }
                    derived.renkoCurBase = nextClose;
                    derived.renkoCurLastClose = nextClose;
                  } else if (diff <= -brickSize) {
                    const nextClose = baseBefore - brickSize;
                    nextBar = {
                      time: timeVal,
                      open: baseBefore,
                      high: baseBefore,
                      low: nextClose,
                      close: nextClose,
                      color: '#f23645',
                      borderColor: '#f23645',
                      wickColor: '#f23645',
                    };
                    if (!isTipUpdate) {
                      derived.renkoPrevBase = baseBefore;
                      derived.renkoPrevLastClose = lastBefore;
                    }
                    derived.renkoCurBase = nextClose;
                    derived.renkoCurLastClose = nextClose;
                  } else {
                    const isUp = lastBefore >= baseBefore;
                    const col = isUp ? '#089981' : '#f23645';
                    nextBar = {
                      time: timeVal,
                      open: baseBefore,
                      high: isUp ? lastBefore : baseBefore,
                      low: isUp ? baseBefore : lastBefore,
                      close: lastBefore,
                      color: col,
                      borderColor: col,
                      wickColor: col,
                    };
                    if (!isTipUpdate) {
                      derived.renkoPrevBase = baseBefore;
                      derived.renkoPrevLastClose = lastBefore;
                    }
                    derived.renkoCurBase = baseBefore;
                    derived.renkoCurLastClose = lastBefore;
                  }
                }

                if (nextBar) {
                  if (isTipUpdate) {
                    dBars[targetIdx] = nextBar;
                  } else {
                    dBars.push(nextBar);
                  }
                  candleSeriesInst.update(nextBar);
                } else {
                  applyChartTypeDataRef.current(ct, src);
                }
              }
            }
          } else {
            candleSeriesRef.current?.update({
              time: timeVal,
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
            });
          }

          priceCountdownPrimitiveRef.current?.updateData({
            price: candle.close,
          });
        };

        const flushBatchedTickUpdates = () => {
          tickRafId = null;
          if (isCancelled) return;

          if (pendingFpBars.size > 0 && footprintPrimitiveRef.current) {
            try {
              const sortedFpBars = Array.from(pendingFpBars.values()).sort((a, b) => a.time - b.time);
              for (const fpBar of sortedFpBars) {
                footprintPrimitiveRef.current.upsertBar(fpBar);
              }
            } catch (e) {
              console.error('[ChartPane] Error updating batched footprint bar:', e);
            }
            pendingFpBars.clear();
          }

          if (pendingHistoricalSync || pendingTickCandles.size > 0) {
            const hadHistoricalSync = pendingHistoricalSync;
            pendingHistoricalSync = false;
            const sortedCandles = Array.from(pendingTickCandles.values()).sort(
              (a, b) => (a.time as number) - (b.time as number)
            );
            pendingTickCandles.clear();

            if (!isVisibleRef.current) {
              pendingSeriesFlushRef.current = true;
              return;
            }

            if (hadHistoricalSync && candlesRef.current.length > 0) {
              // An earlier closed/finalized bar was updated (or inserted) — LWC's update() rejects
              // timestamps older than the active tip, so apply an atomic setData preserving scroll.
              const prevRange = chartApiRef.current?.timeScale().getVisibleLogicalRange() ?? null;
              applyChartTypeDataRef.current(chartTypeRef.current, candlesRef.current);
              if (prevRange) {
                chartApiRef.current?.timeScale().setVisibleLogicalRange(prevRange);
              }
              const latestBar = candlesRef.current[candlesRef.current.length - 1];
              if (latestBar) {
                priceCountdownPrimitiveRef.current?.updateData({
                  price: latestBar.close,
                });
                const chg = latestBar.close - latestBar.open;
                const chgPct = latestBar.open > 0 ? (chg / latestBar.open) * 100 : 0;
                scheduleHudUpdate({
                  open: latestBar.open,
                  high: latestBar.high,
                  low: latestBar.low,
                  close: latestBar.close,
                  volume: latestBar.volume,
                  change: chg,
                  changePercent: chgPct,
                });
              }
              if (indicatorsRef.current.length > 0) {
                syncIndicators(candlesRef.current);
              }
            }

            let lastCandle: Candle | null = null;
            for (const candle of sortedCandles) {
              if (hadHistoricalSync && candle.time < (candlesRef.current[candlesRef.current.length - 1]?.time ?? 0)) {
                continue;
              }
              try {
                applySeriesUpdate(candle);
              } catch (seriesErr) {
                applyChartTypeDataRef.current(chartTypeRef.current, candlesRef.current);
              }

              if (indicatorsRef.current.length > 0) {
                indicatorConnectorRef.current?.updateRealtimeCandle(candle);
              }
              lastCandle = candle;
            }

            if (lastCandle) {
              const chg = lastCandle.close - lastCandle.open;
              const chgPct = lastCandle.open > 0 ? (chg / lastCandle.open) * 100 : 0;
              scheduleHudUpdate({
                open: lastCandle.open,
                high: lastCandle.high,
                low: lastCandle.low,
                close: lastCandle.close,
                volume: lastCandle.volume,
                change: chg,
                changePercent: chgPct,
              });
            }
          }
        };

        const scheduleTickDispatch = () => {
          if (tickRafId === null) {
            tickRafId = requestAnimationFrame(flushBatchedTickUpdates);
          }
        };

        // Subscribe to live kline stream (WebSocket for Binance, Poll for OANDA)
        wsCleanup = transport.subscribeLiveKline(symbol, timeframe, (liveCandle) => {
          if (isCancelled) return;
          setIsWsActive(true);

        try {
          const dur = getTimeframeDurationSeconds(timeframe);
          const rawTime = typeof liveCandle.time === 'number' ? liveCandle.time : Math.floor(new Date(liveCandle.time).getTime() / 1000);
          recordServerTimestamp(rawTime);

          const arr = candlesRef.current;
          const prevLastTime = arr.length > 0 ? arr[arr.length - 1].time : -1;
          const mergeRes = mergeLiveCandleTick(arr, liveCandle, dur);
          const aggregatedCandle = mergeRes.candle;

          if (mergeRes.action === 'noop') {
            scheduleCandlesUpdate();
            return;
          }

          if (mergeRes.action === 'resync') {
            pendingHistoricalSync = true;
            scheduleCandlesUpdate(true);
            updateFutureWhitespaceRef.current(arr, timeframeRef.current);
            pendingTickCandles.set(aggregatedCandle.time as number, aggregatedCandle);
            scheduleTickDispatch();
            return;
          }

          const openedNewBar = (aggregatedCandle.time as number) > prevLastTime;
          scheduleCandlesUpdate(openedNewBar);
          if (openedNewBar) {
            updateFutureWhitespaceRef.current(arr, timeframeRef.current);
            if (mergeRes.needsCatchUp) {
              // Gap between last known bar and incoming bar! Trigger immediate catch-up backfill
              reconcileCatchUpRef.current('live_gap');
            }
          }

          // Ensure the active forming candle immediately has its footprint bar rendered & updated
          const isFpActive = chartTypeRef.current === 'footprint';
          const isRealL2Symbol = symbol.startsWith('DATABRIDGE:');
          if (isFpActive && footprintPrimitiveRef.current) {
            const candleTimeSec = typeof aggregatedCandle.time === 'number' ? aggregatedCandle.time : Math.floor(new Date(aggregatedCandle.time).getTime() / 1000);
            const existingFp = pendingFpBars.get(candleTimeSec) || footprintPrimitiveRef.current.getBar(candleTimeSec);
            if (isRealL2Symbol) {
              // For real L2 symbols (e.g. DATABRIDGE), synchronously update forming candle OHLC
              if (existingFp) {
                existingFp.close = aggregatedCandle.close;
                existingFp.high = Math.max(existingFp.high, aggregatedCandle.high);
                existingFp.low = Math.min(existingFp.low, aggregatedCandle.low);
                pendingFpBars.set(candleTimeSec, existingFp);
              }
            } else if (!existingFp) {
              const liveFp = synthesizeFormingFootprintBar(aggregatedCandle, tickSizeRef.current);
              pendingFpBars.set(candleTimeSec, liveFp);
            } else {
              // Real-time update for forming footprint bar on every tick
              const prevFpLow = existingFp.low;
              const prevFpHigh = existingFp.high;
              existingFp.high = Math.max(existingFp.high, aggregatedCandle.high);
              existingFp.low = Math.min(existingFp.low, aggregatedCandle.low);
              existingFp.close = aggregatedCandle.close;
              const prevVol = existingFp.totalVolume;
              existingFp.totalVolume = Math.max(existingFp.totalVolume, aggregatedCandle.volume || (prevVol + 1));
              const deltaVol = Math.max(1, existingFp.totalVolume - prevVol);

              const ts = tickSizeRef.current > 0 ? tickSizeRef.current : 0.25;
              const rangeExpanded = existingFp.low !== prevFpLow || existingFp.high !== prevFpHigh || existingFp.levels.length === 0;
              if (orderflowSettingsRef.current?.includeEmptyLevels && rangeExpanded) {
                const lowTick = Math.round(existingFp.low / ts) * ts;
                const highTick = Math.round(existingFp.high / ts) * ts;
                let insertedEmpty = false;
                for (let p = lowTick; p <= highTick + ts * 0.5; p += ts) {
                  const roundedEmpty = Number((Math.round(p / ts) * ts).toFixed(4));
                  const exists = existingFp.levels.some((l) => Math.abs(l.price - roundedEmpty) < ts * 0.5);
                  if (!exists) {
                    existingFp.levels.push({
                      price: roundedEmpty,
                      bidVolume: 0,
                      askVolume: 0,
                      delta: 0,
                      isPOC: false,
                    });
                    insertedEmpty = true;
                  }
                }
                if (insertedEmpty) {
                  existingFp.levels.sort((a, b) => a.price - b.price);
                }
              }

              const roundedP = Number((Math.round(aggregatedCandle.close / ts) * ts).toFixed(6));
              let lvl = existingFp.levels.find((l) => Math.abs(l.price - roundedP) < ts * 0.5);
              if (!lvl) {
                lvl = {
                  price: roundedP,
                  bidVolume: 0,
                  askVolume: 0,
                  delta: 0,
                  isPOC: false,
                };
                existingFp.levels.push(lvl);
                existingFp.levels.sort((a, b) => a.price - b.price);
              }

              if (aggregatedCandle.close >= aggregatedCandle.open) {
                lvl.askVolume += deltaVol;
              } else {
                lvl.bidVolume += deltaVol;
              }
              lvl.delta = lvl.askVolume - lvl.bidVolume;

              // Re-calculate POC and total delta across forming candle
              let maxLvlVol = -1;
              let pocP = existingFp.pocPrice ?? aggregatedCandle.close;
              let totDelta = 0;
              for (const l of existingFp.levels) {
                const t = l.bidVolume + l.askVolume;
                if (t > maxLvlVol) {
                  maxLvlVol = t;
                  pocP = l.price;
                }
                totDelta += (l.askVolume - l.bidVolume);
              }
              existingFp.pocPrice = pocP;
              existingFp.delta = totDelta;
              for (const l of existingFp.levels) {
                l.isPOC = Math.abs(l.price - pocP) < ts * 0.5;
              }

              pendingFpBars.set(candleTimeSec, existingFp);
            }
          }

          // Throttle incoming real-time WebSocket tick series dispatches and footprint updates
          // using requestAnimationFrame, batching rapid ticks per frame (60Hz / 144Hz)
          pendingTickCandles.set(aggregatedCandle.time as number, aggregatedCandle);
          scheduleTickDispatch();
        } catch (seriesErr) {
          console.warn('[Live Candle Update Warning]', seriesErr);
        }
        });

        // Subscribe to live institutional Footprint stream if active
        fpWsCleanup = transport.subscribeFootprint(symbol, timeframe, (fp) => {
          if (isCancelled) return;
          setIsWsActive(true);
          try {
            const adapted = adaptBackendFootprintBar(fp, lookupCandleByTime);

            const liveCandle: Candle = {
              time: adapted.time,
              open: adapted.open,
              high: adapted.high,
              low: adapted.low,
              close: adapted.close,
              volume: adapted.totalVolume,
            };

            // Keep candlesRef in sync so other components and timers have the live price
            if (candlesRef.current.length > 0) {
              const lastIdx = candlesRef.current.length - 1;
              if (candlesRef.current[lastIdx].time === adapted.time) {
                candlesRef.current[lastIdx] = liveCandle;
              } else if (adapted.time > (candlesRef.current[lastIdx].time as number)) {
                candlesRef.current.push(liveCandle);
              }
            }

            pendingFpBars.set(adapted.time, adapted);
            pendingTickCandles.set(liveCandle.time as number, liveCandle);
            scheduleTickDispatch();
          } catch (e) {
            console.error('[ChartPane] Error updating footprint bar:', e);
          }
        });
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Error fetching candles');
          setIsLoading(false);
        }
      }
    };

    loadAndStream();

    return () => {
      isCancelled = true;
      if (hudRafId !== null) {
        cancelAnimationFrame(hudRafId);
        hudRafId = null;
      }
      if (candlesRafId !== null) {
        cancelAnimationFrame(candlesRafId);
        candlesRafId = null;
      }
      if (candlesTimeoutId !== null) {
        clearTimeout(candlesTimeoutId);
        candlesTimeoutId = null;
      }
      if (tickRafId !== null) {
        cancelAnimationFrame(tickRafId);
        tickRafId = null;
      }
      pendingTickCandles.clear();
      pendingFpBars.clear();
      if (wsCleanup) {
        wsCleanup();
      }
      if (fpWsCleanup) {
        fpWsCleanup();
      }
    };
  }, [symbol, timeframe]);

  // Visible logical range synchronization listener (timestamp-aligned across panes, 0 React re-renders)
  useEffect(() => {
    if (!dateRangeLock) return;
    const unsub = useSyncStore.subscribe(
      (state) => state.syncLogicalRange,
      (syncRange) => {
        if (!syncRange || syncRange.sourceId === paneId) return;
        const chart = chartApiRef.current;
        if (!chart) return;

        let targetFrom = syncRange.from;
        let targetTo = syncRange.to;
        const srcEntry = paneSyncRegistry.get(syncRange.sourceId);
        const dstCandles = candlesRef.current;
        if (srcEntry && dstCandles.length > 0) {
          const srcCandles = srcEntry.getCandles();
          const srcTf = srcEntry.getTimeframe();
          if (srcCandles.length > 0) {
            const fromTs = logicalIndexToTimestamp(srcCandles, srcTf, syncRange.from);
            const toTs = logicalIndexToTimestamp(srcCandles, srcTf, syncRange.to);
            if (fromTs !== null && toTs !== null) {
              targetFrom = timestampToLogicalIndex(dstCandles, timeframeRef.current, fromTs);
              targetTo = timestampToLogicalIndex(dstCandles, timeframeRef.current, toTs);
            }
          }
        }

        const curRange = chart.timeScale().getVisibleLogicalRange();
        if (
          curRange &&
          Math.abs(curRange.from - targetFrom) < 0.05 &&
          Math.abs(curRange.to - targetTo) < 0.05
        ) {
          return;
        }
        isApplyingSyncRangeRef.current = true;
        chart.timeScale().setVisibleLogicalRange({
          from: targetFrom,
          to: targetTo,
        });
        queueMicrotask(() => {
          isApplyingSyncRangeRef.current = false;
        });
      }
    );
    return () => {
      unsub();
    };
  }, [dateRangeLock, paneId]);

  const exchangeLabel = useMemo(() => {
    if (symbol.includes(':')) {
      return symbol.split(':')[0];
    }
    return 'ORDERCRAFT';
  }, [symbol]);

  return (
    <div
      onClick={() => setActivePaneId(paneId)}
      className={`chart-pane-wrapper relative flex-1 min-h-0 w-full h-full bg-[#131722] flex flex-col overflow-hidden ${
        isActive && isGrid ? 'ring-1 ring-[#2962ff] ring-inset' : ''
      }`}
      data-pane-id={paneId}
      data-active-pane={isActive ? 'true' : 'false'}
    >
      {/* Core Chart Canvas Container & Drawing Overlay */}
      <div
        ref={wrapperRef}
        onDoubleClick={handleWrapperDoubleClick}
        className={`chart-viewport-wrapper relative flex-1 w-full h-full overflow-hidden ${
          activeTool !== 'cursor' ? 'drawing-tool-active' : `cursor-mode-${cursorType}`
        }`}
        data-pane-id={paneId}
        data-active-pane={isActive ? 'true' : 'false'}
        data-cursor-type={cursorType}
        onContextMenu={handleContextMenu}
      >
        <div
          ref={chartContainerRef}
          onPointerLeave={() => {
            if (crosshairLock) setSyncCrosshair(null);
          }}
          className={`w-full h-full chart-pane-canvas ${
            activeTool !== 'cursor' ? 'drawing-tool-active' : `cursor-mode-${cursorType}`
          }`}
          data-pane-id={paneId}
          data-active-pane={isActive ? 'true' : 'false'}
          data-cursor-type={cursorType}
          style={{ width: '100%', height: '100%' }}
        />

        {/* Interactive Drawing Overlay Canvas */}
        <DrawingCanvas
          chart={chartInstance}
          series={activeSeriesInstance}
          candles={candlesData}
          containerRef={wrapperRef}
          paneSymbol={symbol}
          paneId={paneId}
          isActive={isActive}
          isGrid={isGrid}
        />


        {/* Synchronized Crosshair Vertical Line across panes (Direct DOM GPU accelerated) */}
        <div
          ref={syncVLineRef}
          className="absolute top-0 bottom-0 pointer-events-none z-10"
          style={{
            display: 'none',
            left: 0,
            willChange: 'transform',
            borderLeftWidth: `${chartSettings.canvasCrosshairWidth || 1}px`,
            borderLeftStyle:
              chartSettings.canvasCrosshairStyle === 'solid'
                ? 'solid'
                : chartSettings.canvasCrosshairStyle === 'dashed'
                ? 'dashed'
                : 'dotted',
            borderLeftColor: chartSettings.canvasCrosshairColor || '#787b86',
          }}
        >
          <div
            ref={syncTimePillRef}
            className="absolute bottom-0 -translate-x-1/2 px-1.5 py-0.5 bg-[#1e222d] text-[#d1d4dc] text-[10px] font-mono border-t border-x border-[#787b86]/60 rounded-t shadow-md whitespace-nowrap"
            style={{ display: 'none' }}
          />
        </div>

        {/* Synchronized Crosshair Horizontal Line across panes (Direct DOM GPU accelerated) */}
        <div
          ref={syncHLineRef}
          className="absolute left-0 right-0 pointer-events-none z-10"
          style={{
            display: 'none',
            top: 0,
            willChange: 'transform',
            borderTopWidth: `${chartSettings.canvasCrosshairWidth || 1}px`,
            borderTopStyle:
              chartSettings.canvasCrosshairStyle === 'solid'
                ? 'solid'
                : chartSettings.canvasCrosshairStyle === 'dashed'
                ? 'dashed'
                : 'dotted',
            borderTopColor: chartSettings.canvasCrosshairColor || '#787b86',
          }}
        >
          <div
            ref={syncPricePillRef}
            className="absolute right-0 -translate-y-1/2 px-1.5 py-0.5 bg-[#1e222d] text-[#d1d4dc] text-[10px] font-mono border-l border-y border-[#787b86]/60 rounded-l shadow-md"
            style={{ display: 'none' }}
          />
        </div>

        {/* Grid Pane Header Focus/Enlarge Control */}
        {isGrid && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleMaximizePane(paneId);
            }}
            className={`absolute top-2 right-12 z-25 p-1 rounded transition-colors cursor-pointer shadow select-none ${
              isLightCanvas
                ? 'bg-white/95 hover:bg-white border border-black/10 text-[#434651] hover:text-[#131722]'
                : 'bg-[#1e222d]/95 hover:bg-[#2a2e39] border border-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc]'
            } ${
              isMaximized ? 'text-[#2962ff] border-[#2962ff]/50' : ''
            }`}
            title={isMaximized ? 'Restore Multi-Chart Grid' : 'Focus Chart'}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        )}

        {/* Main Chart and Sub-Pane Positioning Layout */}
        {(() => {
          const mainVIdx = paneOrder.indexOf('main') !== -1 ? paneOrder.indexOf('main') : 0;
          const isMainMaximized = maximizedPaneIndex === mainVIdx;
          const isMainVisible = maximizedPaneIndex === null || isMainMaximized;
          const mainTopOffset = isMainMaximized ? 2 : getPaneTop(mainVIdx);

          return (
            <>
              {/* Main Chart Pane Action Controls (When sub-panes exist) */}
              {subpaneIndicators.length > 0 && isMainVisible && (
                <div
                  className={`absolute ${isGrid ? 'right-20' : 'right-14'} z-30 flex items-center gap-0.5 rounded px-1 py-0.5 shadow select-none ${
                    isLightCanvas
                      ? 'bg-white/95 hover:bg-white border border-black/10 text-[#434651]'
                      : 'bg-[#1e222d]/95 hover:bg-[#1e222d] border border-[#2a2e39] text-[#787b86]'
                  }`}
                  style={{
                    top: `${mainTopOffset + 6}px`,
                  }}
                >
                  {!isMainMaximized && (
                    <>
                      {/* Move Up */}
                      {mainVIdx > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMovePaneUp('main');
                          }}
                          className={`p-1 rounded transition-colors cursor-pointer ${
                            isLightCanvas
                              ? 'text-[#434651] hover:text-[#131722] hover:bg-black/5'
                              : 'text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
                          }`}
                          title="Move pane up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Move Down */}
                      {mainVIdx < paneOrder.length - 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMovePaneDown('main');
                          }}
                          className={`p-1 rounded transition-colors cursor-pointer ${
                            isLightCanvas
                              ? 'text-[#434651] hover:text-[#131722] hover:bg-black/5'
                              : 'text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
                          }`}
                          title="Move pane down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}

                  {/* Maximize / Restore Pane */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMaximizedPaneIndex(isMainMaximized ? null : mainVIdx);
                    }}
                    className={`p-1 rounded transition-colors cursor-pointer ${
                      isLightCanvas
                        ? 'text-[#434651] hover:text-[#131722] hover:bg-black/5'
                        : 'text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
                    } ${isMainMaximized ? 'text-[#2962ff]' : ''}`}
                    title={isMainMaximized ? 'Restore Pane (Double Click)' : 'Maximize Pane (Double Click)'}
                  >
                    {isMainMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}

              {/* Main Chart Top-Left OHLC HUD Legend & Active Indicators */}
              {isMainVisible && (
                <div
                  className="absolute left-3 z-30 pointer-events-none select-none flex flex-col gap-1 max-w-[85%]"
                  style={{
                    top: `${mainTopOffset + 6}px`,
                  }}
                >
                  <div
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
                    style={{
                      color: statusTextColor,
                      fontSize: `${statusTextSize}px`,
                    }}
                  >
                    {chartSettings.statusShowTitle && (
                      <div
                        className="flex items-center space-x-1.5 font-semibold"
                        style={{ color: statusTextColor }}
                      >
                        <span style={{ color: statusTextColor }}>
                          {chartSettings.statusTitleMode === 'Description'
                            ? exchangeLabel
                            : chartSettings.statusTitleMode === 'Ticker and description'
                            ? `${symbol} (${exchangeLabel})`
                            : symbol}
                        </span>
                        <span style={{ color: statusTextColor, opacity: 0.7 }}>·</span>
                        <span style={{ color: statusTextColor, opacity: 0.9 }}>{timeframe}</span>
                        {chartSettings.statusTitleMode === 'Ticker' && (
                          <>
                            <span style={{ color: statusTextColor, opacity: 0.7 }}>·</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                isLightCanvas
                                  ? 'bg-black/5 border border-black/10'
                                  : 'bg-[#1e222d] border border-[#2a2e39]'
                              }`}
                              style={{ color: statusTextColor, opacity: 0.85 }}
                            >
                              {exchangeLabel}
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    <ChartOhlcReadout
                      controller={hudController}
                      crosshairLock={crosshairLock}
                      pricePrecision={pricePrecision}
                      statusTextColor={statusTextColor}
                      statusTextSize={statusTextSize}
                      showChartValues={Boolean(chartSettings.statusShowChartValues)}
                      showBarChange={Boolean(chartSettings.statusShowBarChange)}
                      showVolume={Boolean(chartSettings.statusShowVolume)}
                    />

                    {isBackfilling && (
                      <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-[#1e222d] border border-[#2962ff]/50 text-[#2962ff] text-[10px] font-mono select-none">
                        <div className="w-2.5 h-2.5 rounded-full border-2 border-[#2962ff] border-t-transparent animate-spin" />
                        <span>Loading history...</span>
                      </div>
                    )}
                  </div>

                  {/* Active Overlay Indicators Legend (Overlays stay on Main Chart) */}
                  <ChartOverlayLegend
                    controller={hudController}
                    paneId={paneId}
                    precision={pricePrecision}
                  />
                </div>
              )}

              {/* Sub-Pane Indicator Legends & Action Controls */}
              {subpaneIndicators.map((ind) => {
                const subVIdx = paneOrder.indexOf(ind.id);
                const isThisPaneMaximized = maximizedPaneIndex === subVIdx;
                if (maximizedPaneIndex !== null && !isThisPaneMaximized) return null;
                if (collapsedPanes.has(ind.id)) return null;

                const isThisPaneCollapsing = pendingCollapseIndicatorId === ind.id;
                const topOffset = isThisPaneMaximized ? 2 : getPaneTop(subVIdx !== -1 ? subVIdx : 1);
                return (
                  <React.Fragment key={ind.id}>
                    {/* Sub-pane Legend (Interactive: show/hide, settings, delete) */}
                    <div
                      className={`absolute z-30 pointer-events-auto select-none flex flex-col gap-1 text-[11px] font-sans transition-opacity ${
                        isThisPaneCollapsing ? 'opacity-30' : 'opacity-100'
                      }`}
                      style={{
                        top: `${topOffset + 6}px`,
                        left: '12px',
                      }}
                    >
                      <ChartSubpaneLegendItem
                        controller={hudController}
                        paneId={paneId}
                        indicator={ind}
                        precision={pricePrecision}
                      />
                    </div>

                    {/* Sub-pane Action Controls Toolbar */}
                    <div
                      className={`absolute ${isGrid ? 'right-20' : 'right-14'} z-30 flex items-center gap-0.5 rounded px-1 py-0.5 shadow select-none transition-opacity ${
                        isThisPaneCollapsing ? 'opacity-30' : 'opacity-100'
                      } ${
                        isLightCanvas
                          ? 'bg-white/95 hover:bg-white border border-black/10 text-[#434651]'
                          : 'bg-[#1e222d]/95 hover:bg-[#1e222d] border border-[#2a2e39] text-[#787b86]'
                      }`}
                      style={{
                        top: `${topOffset + 6}px`,
                      }}
                    >
                      {!isThisPaneMaximized && (
                        <>
                          {/* Move Up */}
                          {subVIdx > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMovePaneUp(ind.id);
                              }}
                              className={`p-1 rounded transition-colors cursor-pointer ${
                                isLightCanvas
                                  ? 'text-[#434651] hover:text-[#131722] hover:bg-black/5'
                                  : 'text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
                              }`}
                              title="Move pane up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Move Down */}
                          {subVIdx < paneOrder.length - 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMovePaneDown(ind.id);
                              }}
                              className={`p-1 rounded transition-colors cursor-pointer ${
                                isLightCanvas
                                  ? 'text-[#434651] hover:text-[#131722] hover:bg-black/5'
                                  : 'text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
                              }`}
                              title="Move pane down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Delete Pane */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeIndicatorFromPane(paneId, ind.id);
                              if (maximizedPaneIndex === subVIdx) setMaximizedPaneIndex(null);
                            }}
                            className={`p-1 rounded transition-colors cursor-pointer ${
                              isLightCanvas
                                ? 'text-[#434651] hover:text-[#f23645] hover:bg-red-500/10'
                                : 'text-[#787b86] hover:text-[#f23645] hover:bg-[#2a2e39]'
                            }`}
                            title="Delete pane"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Collapse Pane */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCollapsePane(ind.id);
                            }}
                            className={`p-1 rounded transition-colors cursor-pointer ${
                              isLightCanvas
                                ? 'text-[#434651] hover:text-[#131722] hover:bg-black/5'
                                : 'text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
                            }`}
                            title="Collapse pane"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}

                      {/* Maximize / Restore Pane */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMaximizedPaneIndex(isThisPaneMaximized ? null : subVIdx);
                        }}
                        className={`p-1 rounded transition-colors cursor-pointer ${
                          isLightCanvas
                            ? 'text-[#434651] hover:text-[#131722] hover:bg-black/5'
                            : 'text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
                        } ${isThisPaneMaximized ? 'text-[#2962ff]' : ''}`}
                        title={isThisPaneMaximized ? 'Restore Pane (Double Click)' : 'Maximize Pane (Double Click)'}
                      >
                        {isThisPaneMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </React.Fragment>
                );
              })}
            </>
          );
        })()}

        {/* Collapsed Subpanes Full-Width Bottom Bar */}
        {collapsedPanes.size > 0 && maximizedPaneIndex === null && (
          <div className="absolute left-0 right-0 bottom-[26px] z-30 flex flex-col-reverse pointer-events-auto">
            {subpaneIndicators
              .filter((ind) => collapsedPanes.has(ind.id))
              .map((ind) => {
                const inputsStr =
                  isVolumeIndicatorType(ind.type)
                    ? ind.inputs?.showMa
                      ? String(ind.inputs.maLength || 20)
                      : ''
                    : Object.values(ind.inputs || {})
                        .filter((v) => typeof v !== 'boolean' || v === true)
                        .join(' ');
                const primaryColor = Object.values(ind.styles)[0]?.color || '#7e57c2';

                return (
                  <div
                    key={`collapsed-bar-${ind.id}`}
                    onClick={() => toggleCollapsePane(ind.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      toggleCollapsePane(ind.id);
                    }}
                    className={`w-full h-[22px] px-3 border-t flex items-center justify-between text-[11px] font-sans select-none cursor-pointer transition-colors group ${
                      isLightCanvas
                        ? 'bg-white/95 hover:bg-white border-black/10 text-[#131722]'
                        : 'bg-[#131722]/95 hover:bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]'
                    }`}
                    title="Click or double-click to restore pane"
                  >
                    {/* Left: Indicator title and values */}
                    <div className="flex items-center space-x-1.5 overflow-hidden">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: primaryColor }}
                      />
                      <span
                        className="font-semibold shrink-0"
                        style={{ color: statusTextColor }}
                      >
                        {ind.name}
                      </span>
                      {inputsStr && (
                        <span
                          className="shrink-0 font-normal opacity-75"
                          style={{ color: statusTextColor }}
                        >
                          {inputsStr}
                        </span>
                      )}
                      <ChartCollapsedIndicatorValues controller={hudController} indicator={ind} />
                    </div>

                    {/* Right: Restore, Maximize, and Delete controls */}
                    <div
                      className="flex items-center space-x-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCollapsePane(ind.id);
                        }}
                        className={`p-0.5 rounded transition-colors cursor-pointer ${
                          isLightCanvas
                            ? 'text-[#434651] hover:text-[#131722] hover:bg-black/5'
                            : 'text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
                        }`}
                        title="Restore Pane"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const targetPaneIdx = paneOrder.indexOf(ind.id);
                          toggleCollapsePane(ind.id);
                          if (targetPaneIdx !== -1) setMaximizedPaneIndex(targetPaneIdx);
                        }}
                        className={`p-0.5 rounded transition-colors cursor-pointer opacity-0 group-hover:opacity-100 ${
                          isLightCanvas
                            ? 'text-[#434651] hover:text-[#131722] hover:bg-black/5'
                            : 'text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
                        }`}
                        title="Maximize Pane"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeIndicatorFromPane(paneId, ind.id);
                        }}
                        className={`p-0.5 rounded transition-colors cursor-pointer opacity-0 group-hover:opacity-100 ${
                          isLightCanvas
                            ? 'text-[#434651] hover:text-[#f23645] hover:bg-red-500/10'
                            : 'text-[#787b86] hover:text-[#f23645] hover:bg-[#2a2e39]'
                        }`}
                        title="Delete Pane"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* Separator Drag Auto-Collapse Snap Badge */}
        {pendingCollapseIndicatorId && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[#1e222d] border border-[#2962ff] shadow-xl shadow-[#2962ff]/30 px-3.5 py-1.5 rounded-full text-xs text-white pointer-events-none select-none animate-pulse">
            <Minus className="w-3.5 h-3.5 text-[#2962ff]" />
            <span>
              Release to collapse{' '}
              <strong className="text-[#2962ff]">
                {indicators.find((i) => i.id === pendingCollapseIndicatorId)?.name || 'Pane'}
              </strong>
            </span>
          </div>
        )}

        {/* Custom ORDERCRAFT Brandmark Badge */}
        <div
          className={`absolute ${
            collapsedPanes.size > 0 && maximizedPaneIndex === null
              ? 'bottom-[52px]'
              : 'bottom-[34px]'
          } left-3 z-30 flex items-center space-x-1.5 px-2 py-1 rounded bg-[#131722]/95 border border-[#2a2e39] hover:border-[#2962ff] transition-all select-none pointer-events-auto cursor-pointer group shadow-lg`}
          title="OrderCraft"
        >
          <img
            src="/logo.png"
            alt="ORDERCRAFT Logo"
            className="w-4 h-4 rounded-[3px] object-contain shadow-[0_0_8px_rgba(41,98,255,0.5)] group-hover:scale-105 transition-transform"
          />
          <span className="text-[11px] font-bold tracking-tight text-[#d1d4dc] group-hover:text-white transition-colors">
            ORDER<span className="text-[#2962ff]">CRAFT</span>
          </span>
        </div>

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-[#131722]/75 flex items-center justify-center z-20">
            <div className="flex items-center space-x-2 text-xs text-[#d1d4dc]">
              <div className="w-3.5 h-3.5 border-2 border-[#2962ff] border-t-transparent rounded-full animate-spin" />
              <span>Streaming {symbol} ({timeframe})...</span>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute bottom-10 right-4 bg-[#f23645]/20 border border-[#f23645] text-[#f23645] px-3 py-1.5 rounded text-xs z-30">
            {error}
          </div>
        )}

        {/* Floating "Scroll to the most recent bar" Button & Tooltip (Alt+Shift+Right) */}
        {showScrollToLatest && (
          <div className="absolute bottom-9 right-[78px] z-30 group select-none">
            {/* Tooltip positioned above the button with downward triangle caret */}
            <div className="absolute bottom-full right-0 mb-2 hidden group-hover:flex items-center px-2.5 py-1.5 rounded-[4px] bg-[#1e222d] text-[#d1d4dc] text-[11px] font-normal border border-[#2a2e39] shadow-2xl whitespace-nowrap pointer-events-none z-40">
              <span>Scroll to the most recent bar</span>
              <span className="text-[#363a45] mx-1.5 font-light">|</span>
              <div className="flex items-center space-x-1">
                <kbd className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#2a2e39] text-[#d1d4dc] border border-[#363a45] shadow-xs">
                  Alt
                </kbd>
                <span className="text-[#787b86] text-[10px] font-normal">+</span>
                <kbd className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#2a2e39] text-[#d1d4dc] border border-[#363a45] shadow-xs">
                  Shift
                </kbd>
                <span className="text-[#787b86] text-[10px] font-normal">+</span>
                <kbd className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#2a2e39] text-[#d1d4dc] border border-[#363a45] shadow-xs">
                  →
                </kbd>
              </div>

              {/* Downward triangle arrow pointing to the button */}
              <div className="absolute -bottom-1 right-2.5 w-2 h-2 bg-[#1e222d] border-r border-b border-[#2a2e39] rotate-45 transform" />
            </div>

            {/* Floating double-chevron button */}
            <button
              onClick={handleScrollToRealTime}
              className="w-7 h-7 flex items-center justify-center rounded-[4px] bg-[#1e222d] hover:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc] border border-[#2a2e39] hover:border-[#363a45] shadow-xl hover:shadow-2xl transition-all cursor-pointer active:scale-95"
              aria-label="Scroll to the most recent bar"
            >
              <ChevronsRight size={15} strokeWidth={2.2} />
            </button>
          </div>
        )}
      </div>

      {/* Pro Bottom Status Bar: Scales, Timezone Selector, Live Clock & Feed Status */}
      <footer className="h-7 w-full bg-[#131722] border-t border-[#2a2e39] flex items-center justify-between px-3 text-[11px] text-[#787b86] select-none z-30">
        <div className="flex items-center space-x-2.5">
          {/* Market Status (Open / Closed) */}
          <div className="flex items-center space-x-1.5 font-medium">
            <span
              className={`w-2 h-2 rounded-full ${
                marketStatus.isOpen ? 'bg-[#089981] shadow-[0_0_6px_#089981]' : 'bg-[#787b86]'
              }`}
            />
            <span className={marketStatus.isOpen ? 'text-[#089981]' : 'text-[#787b86]'}>
              {marketStatus.label}
            </span>
          </div>

          <span className="text-[#2a2e39]">•</span>

          {/* Live Feed Indicator */}
          <div className="flex items-center space-x-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isWsActive ? 'bg-[#2962ff] shadow-[0_0_5px_#2962ff]' : 'bg-[#ff9800]'
              }`}
            />
            <span className={isWsActive ? 'text-[#d1d4dc]' : 'text-[#ff9800]'}>
              {isWsActive ? 'Live Stream' : 'Connecting Stream...'}
            </span>
          </div>
        </div>

        {/* Right: Scale Toggles, Timezone Selector & Live Clock */}
        <div className="flex items-center space-x-2">
          {/* OrderScript Editor Quick Toggle */}
          <button
            onClick={toggleBottomDrawer}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer ${
              isBottomDrawerOpen
                ? 'bg-[#2962ff]/20 text-[#2962ff] font-medium'
                : 'hover:bg-[#1e222d] text-[#787b86] hover:text-[#d1d4dc]'
            }`}
            title="Toggle OrderScript Editor (Python / Starlark) [Beta]"
          >
            <Code size={11} className={isBottomDrawerOpen ? 'text-[#2962ff]' : 'text-[#787b86]'} />
            <span className="text-[8px] font-bold px-1 py-0.2 bg-[#2962ff]/20 text-[#2962ff] rounded border border-[#2962ff]/30 leading-none">Beta</span>
            <span>OrderScript</span>
          </button>

          <span className="text-[#2a2e39]">•</span>

          {/* Scale controls */}
          <div className="flex items-center space-x-1">
            <button
              onClick={toggleLogScale}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                isLogScale
                  ? 'bg-[#2962ff] text-white font-semibold'
                  : 'hover:bg-[#1e222d] text-[#787b86] hover:text-[#d1d4dc]'
              }`}
              title="Toggle Logarithmic Price Scale"
            >
              log
            </button>
            <button
              onClick={toggleAutoScale}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                isAutoScale
                  ? 'bg-[#2962ff] text-white font-semibold'
                  : 'hover:bg-[#1e222d] text-[#787b86] hover:text-[#d1d4dc]'
              }`}
              title="Toggle Auto Price Scale (fit content)"
            >
              auto
            </button>
          </div>

          <div className="h-3 w-[1px] bg-[#2a2e39]" />

          {/* Timezone Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsTzDropdownOpen(!isTzDropdownOpen)}
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-[#1e222d] text-[#d1d4dc] transition-colors cursor-pointer"
              title="Change Chart Timezone (synchronizes X-axis and clock)"
            >
              <Globe size={11} className="text-[#2962ff]" />
              <span className="font-mono">{timezone}</span>
              <ChevronUp size={10} className={`transition-transform ${isTzDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isTzDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => {
                    setIsTzDropdownOpen(false);
                    setTzSearchQuery('');
                  }}
                />
                <div className="absolute bottom-8 right-0 w-80 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl py-1 z-50 text-xs overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-[#787b86] border-b border-[#2a2e39] uppercase tracking-wider flex items-center justify-between">
                    <span>Select Timezone (Syncs X-Axis)</span>
                    <span className="font-mono text-[9px] text-[#2962ff]">{ALL_TIMEZONES.length} zones</span>
                  </div>
                  
                  {/* Search input for quick filtering */}
                  <div className="p-2 border-b border-[#2a2e39] bg-[#181b27]">
                    <input
                      type="text"
                      placeholder="Search city, offset (e.g. New York, +5:30)..."
                      value={tzSearchQuery}
                      onChange={(e) => setTzSearchQuery(e.target.value)}
                      className="w-full bg-[#131722] border border-[#2a2e39] focus:border-[#2962ff] rounded px-2.5 py-1 text-xs text-[#d1d4dc] placeholder-[#787b86] outline-none"
                      autoFocus
                    />
                  </div>

                  <div className="max-h-64 overflow-y-auto py-0.5 divide-y divide-[#2a2e39]/30">
                    {ALL_TIMEZONES.filter((tz) => {
                      if (!tzSearchQuery.trim()) return true;
                      const q = tzSearchQuery.trim().toLowerCase();
                      return tz.label.toLowerCase().includes(q) || tz.value.toLowerCase().includes(q);
                    }).map((tz) => (
                      <button
                        key={tz.value + tz.label}
                        onClick={() => {
                          setTimezone(tz.value);
                          setIsTzDropdownOpen(false);
                          setTzSearchQuery('');
                        }}
                        className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-[#2a2e39] transition-colors cursor-pointer text-[11px] ${
                          timezone === tz.value ? 'text-[#2962ff] font-semibold bg-[#2a2e39]/50' : 'text-[#d1d4dc]'
                        }`}
                      >
                        <span className="truncate pr-2">{tz.label}</span>
                        {timezone === tz.value && <span className="text-[#2962ff] font-bold">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="h-3 w-[1px] bg-[#2a2e39]" />

          {/* Live Ticking Clock formatted in chosen timezone */}
          <div className="flex items-center space-x-1 font-mono text-[#d1d4dc] tabular-nums">
            <Clock size={11} className="text-[#787b86]" />
            <span>{currentTimeStr}</span>
          </div>
        </div>
      </footer>

      {/* Right-Click Context Menu */}
      <ChartContextMenu
        isOpen={contextMenu.isOpen}
        paneId={paneId}
        position={{ x: contextMenu.x, y: contextMenu.y }}
        price={contextMenu.price}
        onClose={() => setContextMenu((prev) => ({ ...prev, isOpen: false }))}
        onResetChartView={handleResetChartView}
        onOpenSettings={() => openChartSettings(paneId)}
        onOpenObjectTree={() => setIsObjectTreeOpen(true)}
        onOpenTableView={() => setIsTableViewOpen(true)}
      />

      {/* Supporting Modals Triggered from Context Menu & UI (Lazy Loaded) */}
      {isObjectTreeOpen && (
        <React.Suspense fallback={null}>
          <ObjectTreeModal
            isOpen={isObjectTreeOpen}
            onClose={() => setIsObjectTreeOpen(false)}
          />
        </React.Suspense>
      )}

      {isTableViewOpen && (
        <React.Suspense fallback={null}>
          <DataTableViewModal
            isOpen={isTableViewOpen}
            candles={candlesData.length > 0 ? candlesData : candlesRef.current}
            onClose={() => setIsTableViewOpen(false)}
          />
        </React.Suspense>
      )}
    </div>
  );
};
