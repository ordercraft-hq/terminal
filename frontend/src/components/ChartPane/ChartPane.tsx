import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  BarSeries,
  LineSeries,
  AreaSeries,
  BaselineSeries,
  HistogramSeries,
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
  HistogramData,
  WhitespaceData,
  IPriceLine,
} from 'lightweight-charts';
import { useSyncStore, createDefaultVolumeIndicator } from '../../store/syncStore';
import type { CrosshairSyncData, ChartType, ChartVisualSettings } from '../../store/syncStore';
import { transport } from '../../transport/client';
import type { Candle } from '../../transport/client';
import { DrawingCanvas } from './DrawingCanvas';
import { PriceCountdownPrimitive } from './PriceCountdownPrimitive';
import { computeIndicator } from '../../indicators/calculator';
import { IndicatorLegend, IndicatorLegendItem } from './IndicatorLegend';
import type { IndicatorInstance } from '../../indicators/types';
import { isLightColor } from '../../utils/colorUtils';
import {
  transformHeikinAshi,
  transformHollowCandles,
  transformVolumeCandles,
  transformHighLow,
  transformRenko,
} from '../../utils/barTypeTransformers';
import { Globe, Clock, ChevronUp, ArrowUp, ArrowDown, Trash2, Minus, Maximize2, Minimize2, ChevronsRight } from 'lucide-react';
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

export interface TimezoneItem {
  label: string;
  value: string;
  offsetSec: number;
}

export const ALL_TIMEZONES: TimezoneItem[] = [
  { label: 'UTC-12:00 (Baker Island, Howland Island)', value: 'UTC-12', offsetSec: -12 * 3600 },
  { label: 'UTC-11:00 (Pago Pago, Samoa, Midway)', value: 'UTC-11', offsetSec: -11 * 3600 },
  { label: 'UTC-10:00 (Honolulu, Hawaii / HST)', value: 'UTC-10', offsetSec: -10 * 3600 },
  { label: 'UTC-9:30 (Marquesas Islands)', value: 'UTC-9:30', offsetSec: -9.5 * 3600 },
  { label: 'UTC-9:00 (Anchorage, Alaska / AKST)', value: 'UTC-9', offsetSec: -9 * 3600 },
  { label: 'UTC-8:00 (Los Angeles, San Francisco, Vancouver / PST)', value: 'UTC-8', offsetSec: -8 * 3600 },
  { label: 'UTC-7:00 (Denver, Phoenix, Calgary / MST)', value: 'UTC-7', offsetSec: -7 * 3600 },
  { label: 'UTC-6:00 (Chicago, Mexico City, Dallas, Houston / CST)', value: 'UTC-6', offsetSec: -6 * 3600 },
  { label: 'UTC-5:00 (New York, Toronto, Miami, Bogota / EST)', value: 'UTC-5', offsetSec: -5 * 3600 },
  { label: 'UTC-4:00 (New York, Toronto, Miami / EDT, Santiago, Caracas, Bermuda / AST)', value: 'UTC-4', offsetSec: -4 * 3600 },
  { label: 'UTC-3:30 (St. John\'s, Newfoundland / NST)', value: 'UTC-3:30', offsetSec: -3.5 * 3600 },
  { label: 'UTC-3:00 (São Paulo, Buenos Aires, Montevideo)', value: 'UTC-3', offsetSec: -3 * 3600 },
  { label: 'UTC-2:00 (Fernando de Noronha, South Georgia)', value: 'UTC-2', offsetSec: -2 * 3600 },
  { label: 'UTC-1:00 (Cape Verde, Azores)', value: 'UTC-1', offsetSec: -1 * 3600 },
  { label: 'UTC+0:00 (London, Dublin, Lisbon, Reykjavik / GMT)', value: 'UTC', offsetSec: 0 },
  { label: 'UTC+1:00 (Berlin, Paris, Madrid, Rome, Zurich, Frankfurt, Amsterdam, Lagos / CET)', value: 'UTC+1', offsetSec: 1 * 3600 },
  { label: 'UTC+2:00 (Athens, Cairo, Johannesburg, Helsinki, Jerusalem, Kyiv / EET)', value: 'UTC+2', offsetSec: 2 * 3600 },
  { label: 'UTC+3:00 (Moscow, Istanbul, Riyadh, Doha, Nairobi, Kuwait / MSK)', value: 'UTC+3', offsetSec: 3 * 3600 },
  { label: 'UTC+3:30 (Tehran / IRST)', value: 'UTC+3:30', offsetSec: 3.5 * 3600 },
  { label: 'UTC+4:00 (Dubai, Abu Dhabi, Baku, Muscat, Tbilisi / GST)', value: 'UTC+4', offsetSec: 4 * 3600 },
  { label: 'UTC+4:30 (Kabul / AFT)', value: 'UTC+4:30', offsetSec: 4.5 * 3600 },
  { label: 'UTC+5:00 (Karachi, Tashkent, Islamabad / PKT)', value: 'UTC+5', offsetSec: 5 * 3600 },
  { label: 'UTC+5:30 (Kolkata, Mumbai, New Delhi, Colombo / IST)', value: 'UTC+5:30', offsetSec: 5.5 * 3600 },
  { label: 'UTC+5:45 (Kathmandu / NPT)', value: 'UTC+5:45', offsetSec: 5.75 * 3600 },
  { label: 'UTC+6:00 (Dhaka, Almaty, Astana / BST)', value: 'UTC+6', offsetSec: 6 * 3600 },
  { label: 'UTC+6:30 (Yangon, Cocos Islands / MMT)', value: 'UTC+6:30', offsetSec: 6.5 * 3600 },
  { label: 'UTC+7:00 (Bangkok, Jakarta, Ho Chi Minh, Hanoi / ICT)', value: 'UTC+7', offsetSec: 7 * 3600 },
  { label: 'UTC+8:00 (Singapore, Hong Kong, Shanghai, Beijing, Taipei, Perth / SGT, HKT)', value: 'UTC+8', offsetSec: 8 * 3600 },
  { label: 'UTC+8:45 (Eucla / ACWST)', value: 'UTC+8:45', offsetSec: 8.75 * 3600 },
  { label: 'UTC+9:00 (Tokyo, Seoul, Osaka / JST, KST)', value: 'UTC+9', offsetSec: 9 * 3600 },
  { label: 'UTC+9:30 (Adelaide, Darwin / ACST)', value: 'UTC+9:30', offsetSec: 9.5 * 3600 },
  { label: 'UTC+10:00 (Sydney, Melbourne, Brisbane, Vladivostok, Guam / AEST)', value: 'UTC+10', offsetSec: 10 * 3600 },
  { label: 'UTC+10:30 (Lord Howe Island / LHST)', value: 'UTC+10:30', offsetSec: 10.5 * 3600 },
  { label: 'UTC+11:00 (Solomon Islands, New Caledonia, Magadan)', value: 'UTC+11', offsetSec: 11 * 3600 },
  { label: 'UTC+11:30 (Norfolk Island / NFT)', value: 'UTC+11:30', offsetSec: 11.5 * 3600 },
  { label: 'UTC+12:00 (Auckland, Wellington, Fiji, Marshall Islands / NZST)', value: 'UTC+12', offsetSec: 12 * 3600 },
  { label: 'UTC+12:45 (Chatham Islands / CHAST)', value: 'UTC+12:45', offsetSec: 12.75 * 3600 },
  { label: 'UTC+13:00 (Nuku\'alofa, Samoa, Phoenix Islands / TOT)', value: 'UTC+13', offsetSec: 13 * 3600 },
  { label: 'UTC+14:00 (Kiritimati, Line Islands / LINT)', value: 'UTC+14', offsetSec: 14 * 3600 },
];

export function getTimezoneOffsetSeconds(tz: string): number {
  if (!tz || tz === 'UTC' || tz === 'UTC+0' || tz === 'UTC+0:00' || tz === 'GMT') return 0;
  
  // Fast exact match from comprehensive array
  const found = ALL_TIMEZONES.find((item) => item.value === tz);
  if (found) return found.offsetSec;

  // Regex parse: UTC+5:30, UTC-8, UTC+05:00
  const match = tz.match(/UTC([+-])(\d+)(?::(\d+))?/i);
  if (match) {
    const sign = match[1] === '-' ? -1 : 1;
    const hours = parseInt(match[2], 10);
    const minutes = match[3] ? parseInt(match[3], 10) : 0;
    return sign * (hours * 3600 + minutes * 60);
  }

  // Fallback for decimal UTC+5.5
  const decMatch = tz.match(/UTC([+-]\d+(?:\.\d+)?)/i);
  if (decMatch) {
    return Math.round(parseFloat(decMatch[1]) * 3600);
  }

  return 0;
}

function getIndicatorLineStyle(style?: 'solid' | 'dashed' | 'dotted'): LineStyle {
  if (style === 'dashed') return LineStyle.Dashed;
  if (style === 'dotted') return LineStyle.Dotted;
  return LineStyle.Solid;
}

// Format the tick marks directly on the X-axis in the chosen timezone
function formatTickMarkInTimezone(
  time: Time,
  tickMarkType: number,
  timezone: string,
  showSeconds = false
): string | null {
  let ts: number;
  if (typeof time === 'number') {
    ts = time;
  } else if (typeof time === 'object' && time !== null && 'year' in time) {
    ts = Math.floor(Date.UTC((time as any).year, (time as any).month - 1, (time as any).day) / 1000);
  } else {
    return null;
  }

  const offset = getTimezoneOffsetSeconds(timezone);
  const adjusted = ts + offset;
  const d = new Date(adjusted * 1000);

  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  const day = d.getUTCDate();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[d.getUTCMonth()];
  const year = d.getUTCFullYear();

  switch (tickMarkType) {
    case 0: // Year
      return String(year);
    case 1: // Month
      return month;
    case 2: // DayOfMonth
      return `${day} ${month}`;
    case 3: // Time
      if (showSeconds && d.getUTCSeconds() !== 0) {
        return `${hours}:${minutes}:${seconds}`;
      }
      return `${hours}:${minutes}`;
    case 4: // TimeWithSeconds
      return `${hours}:${minutes}:${seconds}`;
    default:
      if (showSeconds) {
        return `${hours}:${minutes}:${seconds}`;
      }
      return `${hours}:${minutes}`;
  }
}

// Format the crosshair date/time pill in the chosen timezone
function formatCrosshairTimeInTimezone(
  time: Time,
  timezone: string,
  showSeconds = false
): string {
  let ts: number;
  if (typeof time === 'number') {
    ts = time;
  } else if (typeof time === 'object' && time !== null && 'year' in time) {
    ts = Math.floor(Date.UTC((time as any).year, (time as any).month - 1, (time as any).day) / 1000);
  } else {
    return '';
  }

  const offset = getTimezoneOffsetSeconds(timezone);
  const adjusted = ts + offset;
  const d = new Date(adjusted * 1000);

  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  const day = d.getUTCDate();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[d.getUTCMonth()];
  const year = String(d.getUTCFullYear()).slice(-2);

  if (showSeconds || d.getUTCSeconds() !== 0) {
    return `${day} ${month} '${year}  ${hours}:${minutes}:${seconds}`;
  }
  return `${day} ${month} '${year}  ${hours}:${minutes}`;
}

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

export const ChartPane: React.FC<ChartPaneProps> = ({
  paneId = 'pane-1',
  isGrid = false,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const barSeriesRef = useRef<ISeriesApi<'Bar'> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const baselineSeriesRef = useRef<ISeriesApi<'Baseline'> | null>(null);
  const futureWhitespaceSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceCountdownPrimitiveRef = useRef<PriceCountdownPrimitive | null>(null);
  const activeSeriesForCountdownRef = useRef<ISeriesApi<SeriesType, Time> | null>(null);
  const futureBarCountRef = useRef<number>(300);
  const prevLoadedTimeframeRef = useRef<string | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const [candlesData, setCandlesData] = useState<Candle[]>([]);

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

  const symbol = useSyncStore((s) => s.panes[paneId]?.symbol || s.symbol);
  const timeframe = useSyncStore((s) => s.panes[paneId]?.timeframe || s.timeframe);
  const chartType = useSyncStore((s) => s.panes[paneId]?.chartType || s.chartType);
  const timezone = useSyncStore((s) => s.panes[paneId]?.timezone || s.timezone);
  const isSecondsTf = getTimeframeDurationSeconds(timeframe) < 60 || timeframe.trim().toLowerCase().endsWith('s');
  const marketStatus = getMarketStatus(symbol);
  const [pricePrecision, setPricePrecision] = useState<number>(() => getPriceDecimals(symbol));
  const [tickSize, setTickSize] = useState<number>(() => detectTickSizeFromCandles([], symbol));
  const tickSizeRef = useRef<number>(tickSize);
  tickSizeRef.current = tickSize;
  const chartSettings = useSyncStore((s) => s.panes[paneId]?.settings || s.chartSettings);
  const chartSettingsRef = useRef(chartSettings);
  chartSettingsRef.current = chartSettings;
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

  const [indicatorLatestValues, setIndicatorLatestValues] = useState<
    Record<string, Record<string, number | null>>
  >({});
  const [hoveredIndicatorValues, setHoveredIndicatorValues] = useState<
    Record<string, Record<string, number | null>> | null
  >(null);
  const [paneOffsets, setPaneOffsets] = useState<Record<number, number>>({});

  const displayIndicatorValues = hoveredIndicatorValues || indicatorLatestValues;
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
        managedIndicatorsRef.current.forEach((entry) => {
          if (entry.paneIndex === currentIdx) {
            entry.paneIndex = targetIdx;
          } else if (entry.paneIndex === targetIdx) {
            entry.paneIndex = currentIdx;
          }
        });
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
        managedIndicatorsRef.current.forEach((entry) => {
          if (entry.paneIndex === currentIdx) {
            entry.paneIndex = targetIdx;
          } else if (entry.paneIndex === targetIdx) {
            entry.paneIndex = currentIdx;
          }
        });
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

  const managedIndicatorsRef = useRef<
    Map<
      string,
      {
        instanceId: string;
        paneIndex: number;
        series: Map<string, ISeriesApi<SeriesType, Time>>;
        priceLines: IPriceLine[];
      }
    >
  >(new Map());

  const syncIndicators = useCallback((candles: Candle[]) => {
    const chart = chartApiRef.current;
    if (!chart || candles.length === 0) return;

    const currentIndicators = indicatorsRef.current;
    const managed = managedIndicatorsRef.current;

    // 1. Remove deleted indicators
    const currentIds = new Set(currentIndicators.map((ind) => ind.id));
    for (const [id, entry] of Array.from(managed.entries())) {
      if (!currentIds.has(id)) {
        for (const line of entry.priceLines) {
          const firstSeries = Array.from(entry.series.values())[0];
          if (firstSeries) {
            try {
              firstSeries.removePriceLine(line);
            } catch {}
          }
        }
        for (const s of Array.from(entry.series.values())) {
          try {
            chart.removeSeries(s);
          } catch {}
        }
        managed.delete(id);
      }
    }

    // 2. Determine pane assignments using paneOrder
    const currentSubpaneIds = new Set(
      currentIndicators.filter((i) => i.category === 'subpane').map((i) => i.id)
    );
    let nextOrder = paneOrder.filter(
      (id) => id === 'main' || currentSubpaneIds.has(id)
    );
    if (!nextOrder.includes('main')) {
      nextOrder = ['main', ...nextOrder];
    }
    for (const ind of currentIndicators) {
      if (ind.category === 'subpane' && !nextOrder.includes(ind.id)) {
        nextOrder.push(ind.id);
      }
    }

    const requiredPanes = nextOrder.length;
    let panesChanged = false;
    try {
      const existingPanes = chart.panes();
      for (let i = existingPanes.length - 1; i >= 0; i--) {
        if (chart.panes().length > requiredPanes && existingPanes[i].getSeries().length === 0) {
          chart.removePane(i);
          panesChanged = true;
        }
      }
      while (chart.panes().length < requiredPanes) {
        chart.addPane();
        panesChanged = true;
      }
      while (chart.panes().length > requiredPanes && chart.panes().length > 1) {
        chart.removePane(chart.panes().length - 1);
        panesChanged = true;
      }
      chart.panes().forEach((_, pIdx) => {
        chart.priceScale('right', pIdx).applyOptions({
          textColor: chartSettingsRef.current.scalesTextColor || '#787b86',
          borderColor: chartSettingsRef.current.scalesLineColor || '#2a2e39',
        });
      });

      if (panesChanged) {
        const curPanes = chart.panes();
        if (curPanes.length > 1) {
          curPanes[0].setStretchFactor(customStretchFactorsRef.current['main'] ?? 75);
          const subCount = curPanes.length - 1;
          for (let p = 1; p < curPanes.length; p++) {
            const indId = nextOrder[p];
            const saved = indId ? customStretchFactorsRef.current[indId] : undefined;
            curPanes[p].setStretchFactor(saved ?? Math.round(25 / subCount));
          }
          const cont = chartContainerRef.current;
          if (cont) {
            chart.applyOptions({ width: cont.clientWidth, height: cont.clientHeight });
          }
        }
      }
    } catch (err) {
      console.warn('Pane adjustment error:', err);
    }

    const mainVIdx = nextOrder.indexOf('main') !== -1 ? nextOrder.indexOf('main') : 0;
    const paneAssignment = new Map<string, number>();
    for (const ind of currentIndicators) {
      if (ind.category === 'overlay') {
        paneAssignment.set(ind.id, mainVIdx);
      } else {
        const vIdx = nextOrder.indexOf(ind.id);
        paneAssignment.set(ind.id, vIdx !== -1 ? vIdx : 1);
      }
    }

    // 3. For each active indicator, compute and update series
    const newLatestValues: Record<string, Record<string, number | null>> = {};

    for (const ind of currentIndicators) {
      const targetPane = paneAssignment.get(ind.id) ?? mainVIdx;
      let entry = managed.get(ind.id);

      if (!entry || entry.paneIndex !== targetPane) {
        if (entry) {
          for (const s of Array.from(entry.series.values())) {
            try {
              chart.removeSeries(s);
            } catch {}
          }
        }
        entry = {
          instanceId: ind.id,
          paneIndex: targetPane,
          series: new Map(),
          priceLines: [],
        };
        managed.set(ind.id, entry);
      }

      // Compute plots
      const calcResult = computeIndicator(ind.type, candles, ind.inputs);
      newLatestValues[ind.id] = {};

      for (const [plotId, plotData] of Object.entries(calcResult.plots)) {
        const style = ind.styles[plotId];
        const isVisible = ind.visible && (style ? style.visible !== false : true);
        const isHistogram = style?.plotType === 'histogram';
        const showPriceScale = style?.lastValueVisible !== false;

        const isVolumeIndicator = ind.type === 'volume';
        const priceScaleId = targetPane === mainVIdx ? (isVolumeIndicator ? 'overlay_volume' : 'right') : 'right';

        let seriesApi = entry.series.get(plotId);
        if (!seriesApi) {
          try {
            if (isHistogram) {
              seriesApi = chart.addSeries(
                HistogramSeries,
                {
                  color: style?.color || '#089981',
                  priceFormat: isVolumeIndicator ? { type: 'volume' } : undefined,
                  priceScaleId,
                  visible: isVisible,
                  lastValueVisible: showPriceScale,
                  priceLineVisible: false,
                },
                targetPane
              );
              if (targetPane === mainVIdx && isVolumeIndicator) {
                seriesApi.priceScale().applyOptions({
                  scaleMargins: {
                    top: 0.8,
                    bottom: 0,
                  },
                });
              }
              seriesApi.priceScale().applyOptions({
                textColor: chartSettingsRef.current.scalesTextColor || '#787b86',
                borderColor: chartSettingsRef.current.scalesLineColor || '#2a2e39',
              });
            } else {
              seriesApi = chart.addSeries(
                LineSeries,
                {
                  color: style?.color || '#2962ff',
                  lineWidth: (style?.lineWidth || 2) as 1 | 2 | 3 | 4,
                  lineStyle: getIndicatorLineStyle(style?.lineStyle),
                  lineType: style?.plotType === 'stepline' ? LineType.WithSteps : LineType.Simple,
                  pointMarkersVisible: style?.plotType === 'circles' || style?.plotType === 'cross',
                  pointMarkersRadius: 3,
                  crosshairMarkerVisible: false,
                  priceScaleId,
                  priceFormat: isVolumeIndicator ? { type: 'volume' } : undefined,
                  visible: isVisible,
                  lastValueVisible: showPriceScale,
                  priceLineVisible: Boolean(style?.priceLineVisible),
                },
                targetPane
              );
              if (targetPane === mainVIdx && isVolumeIndicator) {
                seriesApi.priceScale().applyOptions({
                  scaleMargins: {
                    top: 0.8,
                    bottom: 0,
                  },
                });
              }
              seriesApi.priceScale().applyOptions({
                textColor: chartSettingsRef.current.scalesTextColor || '#787b86',
                borderColor: chartSettingsRef.current.scalesLineColor || '#2a2e39',
              });
            }
            entry.series.set(plotId, seriesApi);
          } catch (err) {
            console.warn(`Failed to create series for ${ind.id}:${plotId}:`, err);
            continue;
          }
        } else {
          try {
            if (isHistogram) {
              seriesApi.applyOptions({
                color: style?.color || '#089981',
                visible: isVisible,
                lastValueVisible: showPriceScale,
                priceLineVisible: false,
              });
              if (targetPane === mainVIdx && isVolumeIndicator) {
                seriesApi.priceScale().applyOptions({
                  scaleMargins: {
                    top: 0.8,
                    bottom: 0,
                  },
                });
              }
              seriesApi.priceScale().applyOptions({
                textColor: chartSettingsRef.current.scalesTextColor || '#787b86',
                borderColor: chartSettingsRef.current.scalesLineColor || '#2a2e39',
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
              });
              if (targetPane === mainVIdx && isVolumeIndicator) {
                seriesApi.priceScale().applyOptions({
                  scaleMargins: {
                    top: 0.8,
                    bottom: 0,
                  },
                });
              }
              seriesApi.priceScale().applyOptions({
                textColor: chartSettingsRef.current.scalesTextColor || '#787b86',
                borderColor: chartSettingsRef.current.scalesLineColor || '#2a2e39',
              });
            }
          } catch {}
        }

        // Set data on series
        if (isHistogram) {
          const colorUp = style?.colorUp || style?.color || '#089981';
          const colorDown = style?.colorDown || '#f23645';
          const candleMap = new Map<number, Candle>();
          for (let i = 0; i < candles.length; i++) {
            candleMap.set(candles[i].time, candles[i]);
          }
          const histData: HistogramData<Time>[] = plotData.map((pt) => {
            const candle = candleMap.get(pt.time);
            const isUp = candle ? candle.close >= candle.open : true;
            return {
              time: pt.time as Time,
              value: pt.value,
              color: isUp ? colorUp : colorDown,
            };
          });
          seriesApi.setData(histData);
        } else {
          const lineData = plotData.map((pt) => ({
            time: pt.time as Time,
            value: pt.value,
            color: pt.color || style?.color,
          }));
          seriesApi.setData(lineData);
        }

        const lastPt = plotData[plotData.length - 1];
        newLatestValues[ind.id][plotId] = lastPt ? lastPt.value : null;
      }

      // Manage levels
      if (ind.levels && ind.levels.length > 0) {
        const firstSeries = Array.from(entry.series.values())[0];
        if (firstSeries) {
          if (entry.priceLines.length === 0) {
            for (const lvl of ind.levels) {
              if (lvl.visible !== false) {
                try {
                  const pl = firstSeries.createPriceLine({
                    price: lvl.value,
                    color: lvl.color,
                    lineWidth: (lvl.lineWidth || 1) as 1 | 2 | 3 | 4,
                    lineStyle: getIndicatorLineStyle(lvl.lineStyle),
                    axisLabelVisible: true,
                    title: lvl.label || `${lvl.value}`,
                    axisLabelTextColor: chartSettingsRef.current.scalesTextColor || '#d1d4dc',
                  });
                  entry.priceLines.push(pl);
                } catch {}
              }
            }
          } else {
            entry.priceLines.forEach((pl, lIdx) => {
              const lvl = ind.levels?.[lIdx];
              if (lvl) {
                try {
                  pl.applyOptions({
                    price: lvl.value,
                    color: lvl.color,
                    lineWidth: (lvl.lineWidth || 1) as 1 | 2 | 3 | 4,
                    lineStyle: getIndicatorLineStyle(lvl.lineStyle),
                    axisLabelVisible: lvl.visible !== false,
                    title: lvl.label || `${lvl.value}`,
                    axisLabelTextColor: chartSettingsRef.current.scalesTextColor || '#d1d4dc',
                  });
                } catch {}
              }
            });
          }
        }
      }
    }

    setIndicatorLatestValues(newLatestValues);
    requestAnimationFrame(updatePaneOffsets);
  }, [paneOrder, updatePaneOffsets]);

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

  const [hoveredOHLC, setHoveredOHLC] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    change: number;
    changePercent: number;
  } | null>(null);

  const [syncHoveredOHLC, setSyncHoveredOHLC] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    change: number;
    changePercent: number;
  } | null>(null);

  const [liveOHLC, setLiveOHLC] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    change: number;
    changePercent: number;
  } | null>(null);

  // Derived display OHLC combining local cursor hover, synchronized crosshair time, or real-time live bar
  const displayOHLC = useMemo(() => {
    if (hoveredOHLC) return hoveredOHLC;
    if (crosshairLock && syncHoveredOHLC) return syncHoveredOHLC;
    if (liveOHLC) return liveOHLC;
    const arr = candlesRef.current;
    if (arr.length > 0) {
      const last = arr[arr.length - 1];
      const change = last.close - last.open;
      const changePercent = (change / last.open) * 100;
      return {
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
        volume: last.volume,
        change,
        changePercent,
      };
    }
    return null;
  }, [hoveredOHLC, syncHoveredOHLC, liveOHLC, crosshairLock]);

  // Imperative direct DOM crosshair refs — ZERO React re-renders during mouse move!
  const syncVLineRef = useRef<HTMLDivElement | null>(null);
  const syncHLineRef = useRef<HTMLDivElement | null>(null);
  const syncTimePillRef = useRef<HTMLDivElement | null>(null);
  const syncPricePillRef = useRef<HTMLDivElement | null>(null);
  const timezoneRef = useRef<string>(timezone);
  timezoneRef.current = timezone;
  const isSecondsTfRef = useRef<boolean>(isSecondsTf);
  isSecondsTfRef.current = isSecondsTf;
  const pricePrecisionRef = useRef<number>(pricePrecision);
  pricePrecisionRef.current = pricePrecision;

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
          setSyncHoveredOHLC(null);
        }
        return;
      }

      const containerW = chartContainerRef.current?.clientWidth || 0;
      const containerH = chartContainerRef.current?.clientHeight || 0;
      if (containerW <= 0 || containerH <= 0 || !chartApiRef.current) {
        vline.style.display = 'none';
        hline.style.display = 'none';
        return;
      }

      // 1. Resolve X Coordinate (Vertical Line)
      let syncXCoord: number | null = null;
      let syncTime: Time | number | null = null;

      if (sync.time !== null && chartApiRef.current && containerW > 0) {
        const exactX = chartApiRef.current.timeScale().timeToCoordinate(sync.time as Time);
        if (exactX !== null && exactX >= 0 && exactX <= containerW) {
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
                const nearestX = chartApiRef.current.timeScale().timeToCoordinate(best.time as Time);
                if (nearestX !== null && nearestX >= 0 && nearestX <= containerW) {
                  syncXCoord = nearestX;
                }
              }
            }
          }
        }

        if (syncXCoord !== null) {
          syncTime = chartApiRef.current.timeScale().coordinateToTime(syncXCoord) || sync.time;
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
              setSyncHoveredOHLC({
                open: found.open,
                high: found.high,
                low: found.low,
                close: found.close,
                volume: found.volume,
                change,
                changePercent,
              });
            } else {
              setSyncHoveredOHLC(null);
            }
          }
        }
      } else if (lastSyncBarTime !== null) {
        lastSyncBarTime = null;
        setSyncHoveredOHLC(null);
      }

      if (syncXCoord !== null && syncXCoord >= 0 && syncXCoord <= containerW) {
        vline.style.display = 'block';
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

      // 2. Resolve Y Coordinate (Horizontal Line)
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

      if (sync.price != null && activeSeries && containerH > 0) {
        const thisTickSize = tickSizeRef.current;
        const targetPrice = snapSyncedPrice(
          sync.price,
          thisTickSize,
          pricePrecisionRef.current,
          symbolRef.current
        );
        const priceCoord = activeSeries.priceToCoordinate(targetPrice);
        if (priceCoord !== null && priceCoord >= 0 && priceCoord <= containerH) {
          syncYCoord = priceCoord;
          syncPrice = targetPrice;
        }
      }

      if (syncYCoord !== null && syncYCoord >= 0 && syncYCoord <= containerH) {
        hline.style.display = 'block';
        hline.style.transform = `translate3d(0, ${Math.round(syncYCoord)}px, 0)`;
        if (pricePill && syncPrice !== null) {
          pricePill.textContent = formatSyncedCrosshairPrice(syncPrice, pricePrecisionRef.current);
          pricePill.style.display = 'block';
        }
      } else {
        hline.style.display = 'none';
      }
    };

    const unsub = useSyncStore.subscribe((state) => {
      pendingSync = state.syncCrosshair;
      if (syncRafId === null) {
        syncRafId = requestAnimationFrame(updateCrosshairDOM);
      }
    });

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

  // Dynamically populate future whitespace bars so lightweight-charts creates
  // future tick marks, timescale timestamps, vertical grid lines, and crosshair snapping.
  const updateFutureWhitespace = useCallback((candles: Candle[], tf: string, minBars = 300) => {
    if (!futureWhitespaceSeriesRef.current || candles.length === 0) return;
    const lastCandle = candles[candles.length - 1];
    const lastTime = lastCandle.time;
    const step =
      getTimeframeDurationSeconds(tf) ||
      (candles.length >= 2 ? Math.max(1, lastTime - candles[candles.length - 2].time) : 60);

    const count = Math.max(futureBarCountRef.current, minBars);
    futureBarCountRef.current = count;

    const whitespaceData: WhitespaceData<Time>[] = [];
    for (let i = 1; i <= count; i++) {
      whitespaceData.push({
        time: (lastTime + i * step) as Time,
      });
    }
    futureWhitespaceSeriesRef.current.setData(whitespaceData);
  }, []);

  const updateFutureWhitespaceRef = useRef<(candles: Candle[], tf: string, minBars?: number) => void>(() => {});
  updateFutureWhitespaceRef.current = updateFutureWhitespace;

  const applyChartTypeData = useCallback((ct: ChartType, candles: Candle[]) => {
    if (!candles || candles.length === 0) return;

    const isCandleType =
      ct === 'candles' ||
      ct === 'hollow_candles' ||
      ct === 'volume_candles' ||
      ct === 'heikin_ashi' ||
      ct === 'renko' ||
      ct === 'high_low';
    const isBarType = ct === 'bars' || ct === 'hlc_bars';
    const isLineType = ct === 'line' || ct === 'line_with_markers' || ct === 'step_line';

    candleSeriesRef.current?.applyOptions({
      visible: isCandleType,
      lastValueVisible: false,
    });

    barSeriesRef.current?.applyOptions({
      visible: isBarType,
      openVisible: ct === 'bars',
      lastValueVisible: false,
    });

    lineSeriesRef.current?.applyOptions({
      visible: isLineType,
      lineType: ct === 'step_line' ? LineType.WithSteps : LineType.Simple,
      pointMarkersVisible: ct === 'line_with_markers',
      lastValueVisible: false,
    });

    areaSeriesRef.current?.applyOptions({
      visible: ct === 'area',
      lastValueVisible: false,
    });

    baselineSeriesRef.current?.applyOptions({
      visible: ct === 'baseline',
      lastValueVisible: false,
    });

    if (isCandleType && candleSeriesRef.current) {
      if (ct === 'heikin_ashi') {
        candleSeriesRef.current.setData(transformHeikinAshi(candles));
      } else if (ct === 'hollow_candles') {
        candleSeriesRef.current.setData(transformHollowCandles(candles));
      } else if (ct === 'volume_candles') {
        candleSeriesRef.current.setData(transformVolumeCandles(candles));
      } else if (ct === 'high_low') {
        candleSeriesRef.current.setData(transformHighLow(candles));
      } else if (ct === 'renko') {
        candleSeriesRef.current.setData(transformRenko(candles));
      } else {
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
      lineSeriesRef.current.setData(
        candles.map((c) => ({
          time: c.time as Time,
          value: c.close,
        }))
      );
    } else if (ct === 'area' && areaSeriesRef.current) {
      areaSeriesRef.current.setData(
        candles.map((c) => ({
          time: c.time as Time,
          value: c.close,
        }))
      );
    } else if (ct === 'baseline' && baselineSeriesRef.current) {
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
  }, []);

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
      if (dedupedOlder.length < 10) {
        hasMoreHistoryRef.current = false;
      }

      // Preserve viewport position without visual jump
      const currentLogicalRange = chartApiRef.current.timeScale().getVisibleLogicalRange();

      const merged = [...dedupedOlder, ...candlesRef.current];
      candlesRef.current = merged;
      setCandlesData(merged);
      applyChartTypeDataRef.current(chartTypeRef.current, merged);
      updateFutureWhitespaceRef.current(merged, timeframeRef.current);
      syncIndicators(merged);

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
      // 1. Clock in selected timezone
      const now = new Date();
      const offset = getTimezoneOffsetSeconds(timezone);
      const targetDate = new Date(now.getTime() + offset * 1000 + now.getTimezoneOffset() * 60000);
      const h = String(targetDate.getHours()).padStart(2, '0');
      const m = String(targetDate.getMinutes()).padStart(2, '0');
      const s = String(targetDate.getSeconds()).padStart(2, '0');
      setCurrentTimeStr(`${h}:${m}:${s}`);

      // 2. Bar close countdown
      const arr = candlesRef.current;
      if (arr.length > 0) {
        const lastCandle = arr[arr.length - 1];
        const dur = getTimeframeDurationSeconds(timeframe);
        const nowSec = Math.floor(Date.now() / 1000);

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
    const interval = setInterval(updateTick, 1000);
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
        autoScale: false,
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
    if (wrapperRef.current) {
      (wrapperRef.current as any).__chart = chart;
    }

    const initialPriceFormat = getPriceFormatConfig(pricePrecision, tickSize);

    // 1. Candlestick Series
    const isCandleType =
      chartType === 'candles' ||
      chartType === 'hollow_candles' ||
      chartType === 'volume_candles' ||
      chartType === 'heikin_ashi' ||
      chartType === 'renko' ||
      chartType === 'high_low';

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#089981',
      downColor: '#f23645',
      borderUpColor: '#089981',
      borderDownColor: '#f23645',
      wickUpColor: '#089981',
      wickDownColor: '#f23645',
      priceFormat: initialPriceFormat,
      lastValueVisible: false,
      visible: isCandleType,
    });
    candleSeriesRef.current = candleSeries;

    // 2. Bar Series (OHLC Bars and HLC Bars)
    const isBarType = chartType === 'bars' || chartType === 'hlc_bars';
    const barSeries = chart.addSeries(BarSeries, {
      upColor: '#089981',
      downColor: '#f23645',
      openVisible: chartType === 'bars',
      thinBars: false,
      priceFormat: initialPriceFormat,
      lastValueVisible: false,
      visible: isBarType,
    });
    barSeriesRef.current = barSeries;

    // 3. Line Series (Simple, Markers, Step)
    const isLineType = chartType === 'line' || chartType === 'line_with_markers' || chartType === 'step_line';
    const lineSeries = chart.addSeries(LineSeries, {
      color: '#2962ff',
      lineWidth: 2,
      lineType: chartType === 'step_line' ? LineType.WithSteps : LineType.Simple,
      pointMarkersVisible: chartType === 'line_with_markers',
      pointMarkersRadius: 3,
      visible: isLineType,
      priceFormat: initialPriceFormat,
      lastValueVisible: false,
    });
    lineSeriesRef.current = lineSeries;

    // 4. Area Series
    const areaSeries = chart.addSeries(AreaSeries, {
      topColor: 'rgba(41, 98, 255, 0.4)',
      bottomColor: 'rgba(41, 98, 255, 0.0)',
      lineColor: '#2962ff',
      lineWidth: 2,
      visible: chartType === 'area',
      priceFormat: initialPriceFormat,
      lastValueVisible: false,
    });
    areaSeriesRef.current = areaSeries;

    // 5. Baseline Series
    const baselineSeries = chart.addSeries(BaselineSeries, {
      baseValue: { type: 'price', price: 0 },
      topLineColor: '#089981',
      topFillColor1: 'rgba(8, 153, 129, 0.28)',
      topFillColor2: 'rgba(8, 153, 129, 0.02)',
      bottomLineColor: '#f23645',
      bottomFillColor1: 'rgba(242, 54, 69, 0.02)',
      bottomFillColor2: 'rgba(242, 54, 69, 0.28)',
      lineWidth: 2,
      priceFormat: initialPriceFormat,
      lastValueVisible: false,
      visible: chartType === 'baseline',
    });
    baselineSeriesRef.current = baselineSeries;

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
    const initialActiveSeries =
      getActiveSeries(chartType, candleSeries, barSeries, lineSeries, areaSeries, baselineSeries) || candleSeries;
    initialActiveSeries.attachPrimitive(priceCountdown);
    priceCountdownPrimitiveRef.current = priceCountdown;
    activeSeriesForCountdownRef.current = initialActiveSeries;

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
        const curAuto = chart.priceScale('right').options().autoScale ?? false;
        setIsAutoScale((prev) => (prev !== curAuto ? curAuto : prev));
      } catch {
        // chart may have been destroyed
      }
    };

    window.addEventListener('pointerup', checkAutoScale);
    window.addEventListener('mouseup', checkAutoScale);
    window.addEventListener('touchend', checkAutoScale);

    // Crosshair move HUD update & dynamic price Y tracker
    chart.subscribeCrosshairMove((param) => {
      const curAuto = chart.priceScale('right').options().autoScale ?? false;
      setIsAutoScale((prev) => (prev !== curAuto ? curAuto : prev));
      const isCrosshairLocked = useSyncStore.getState().crosshairLock;

      if (!param || !param.point) {
        if (lastHoveredBarTime !== null) {
          lastHoveredBarTime = null;
          setHoveredOHLC(null);
          setHoveredIndicatorValues(null);
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
          setHoveredOHLC(null);
          setHoveredIndicatorValues(null);
        }
        return;
      }

      const barTime = param.time as number;
      if (barTime !== lastHoveredBarTime) {
        const candleData = param.seriesData.get(candleSeries) as CandlestickData<Time> | undefined;

        if (candleData) {
          lastHoveredBarTime = barTime;
          const change = candleData.close - candleData.open;
          const changePercent = (change / candleData.open) * 100;
          const matchedCandle = candlesRef.current.find((c) => c.time === barTime);
          setHoveredOHLC({
            open: candleData.open,
            high: candleData.high,
            low: candleData.low,
            close: candleData.close,
            volume: matchedCandle ? matchedCandle.volume : 0,
            change,
            changePercent,
          });

          // Extract hovered indicator values from seriesData for this candle
          const currentIndicators = indicatorsRef.current;
          const managed = managedIndicatorsRef.current;
          const hoveredVals: Record<string, Record<string, number | null>> = {};
          for (const ind of currentIndicators) {
            const entry = managed.get(ind.id);
            if (!entry) continue;
            hoveredVals[ind.id] = {};
            for (const [plotId, sApi] of entry.series.entries()) {
              const sData = param.seriesData.get(sApi);
              if (sData && 'value' in sData && typeof (sData as any).value === 'number' && !isNaN((sData as any).value)) {
                hoveredVals[ind.id][plotId] = (sData as any).value;
              } else {
                hoveredVals[ind.id][plotId] = null;
              }
            }
          }
          setHoveredIndicatorValues(hoveredVals);
        } else {
          lastHoveredBarTime = null;
          setHoveredOHLC(null);
          setHoveredIndicatorValues(null);
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
        // Toggle "Scroll to the most recent bar" button when scrolled back in history
        const scrollPos = chart.timeScale().scrollPosition();
        setShowScrollToLatest(scrollPos < 2);

        const totalBars = arr.length + futureBarCountRef.current;
        if (logicalRange.to > totalBars - 60) {
          updateFutureWhitespaceRef.current(arr, timeframeRef.current, futureBarCountRef.current + 200);
        }
      } else {
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
      window.removeEventListener('mouseup', checkAutoScale);
      window.removeEventListener('touchend', checkAutoScale);
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
      priceCountdownPrimitiveRef.current = null;
      activeSeriesForCountdownRef.current = null;
      candleSeriesRef.current = null;
      barSeriesRef.current = null;
      lineSeriesRef.current = null;
      areaSeriesRef.current = null;
      baselineSeriesRef.current = null;
      futureWhitespaceSeriesRef.current = null;
      chart.remove();
      chartApiRef.current = null;
    };
  }, []);

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
  }, [chartType, applyChartTypeData]);

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

    if (candleSeriesRef.current) {
      candleSeriesRef.current.applyOptions({
        upColor: chartSettings.showCandleBody ? chartSettings.candleBodyUpColor : 'transparent',
        downColor: chartSettings.showCandleBody ? chartSettings.candleBodyDownColor : 'transparent',
        borderUpColor: chartSettings.showCandleBorders ? chartSettings.candleBorderUpColor : 'transparent',
        borderDownColor: chartSettings.showCandleBorders ? chartSettings.candleBorderDownColor : 'transparent',
        wickUpColor: chartSettings.showCandleWick ? chartSettings.candleWickUpColor : 'transparent',
        wickDownColor: chartSettings.showCandleWick ? chartSettings.candleWickDownColor : 'transparent',
        ...priceLineOpts,
      });
    }

    if (barSeriesRef.current) {
      barSeriesRef.current.applyOptions({
        ...priceLineOpts,
      });
    }

    if (lineSeriesRef.current) {
      lineSeriesRef.current.applyOptions({
        ...priceLineOpts,
      });
    }

    if (areaSeriesRef.current) {
      areaSeriesRef.current.applyOptions({
        ...priceLineOpts,
      });
    }

    if (baselineSeriesRef.current) {
      baselineSeriesRef.current.applyOptions({
        ...priceLineOpts,
      });
    }

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
      allPanes.forEach((_, pIdx) => {
        chartApiRef.current?.priceScale('right', pIdx).applyOptions({
          textColor: chartSettings.scalesTextColor || '#787b86',
          borderColor: chartSettings.scalesLineColor || '#2a2e39',
        });
      });
      timeScale.applyOptions({
        borderColor: chartSettings.scalesLineColor || '#2a2e39',
      });

      // Synchronize indicator level axis labels text color
      managedIndicatorsRef.current.forEach((entry) => {
        entry.priceLines.forEach((pl) => {
          try {
            pl.applyOptions({
              axisLabelTextColor: chartSettings.scalesTextColor || '#d1d4dc',
            });
          } catch {}
        });
      });

      // Only update scaleMargins if the margin percentages specifically changed
      if (
        prev &&
        (prev.marginScaleTop !== chartSettings.marginScaleTop ||
          prev.marginScaleBottom !== chartSettings.marginScaleBottom)
      ) {
        chartApiRef.current.priceScale('right').applyOptions({
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
  }, [chartSettings]);

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
    chartApiRef.current.panes().forEach((_, pIdx) => {
      chartApiRef.current?.priceScale('right', pIdx).applyOptions({
        autoScale: true,
      });
    });
    setIsAutoScale(true);
  };

  // Toggle Auto price scale
  const toggleAutoScale = () => {
    if (!chartApiRef.current) return;
    const curAuto = chartApiRef.current.priceScale('right').options().autoScale ?? false;
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
      chartApiRef.current.priceScale('right').applyOptions({
        autoScale: true,
      });
      setIsAutoScale(true);
    } else {
      const range = chartApiRef.current.priceScale('right').getVisibleRange();
      if (range) {
        chartApiRef.current.priceScale('right').setVisibleRange(range);
      } else {
        chartApiRef.current.priceScale('right').applyOptions({
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
    let hudRafId: number | null = null;
    let candlesRafId: number | null = null;
    let candlesTimeoutId: ReturnType<typeof setTimeout> | null = null;
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
        syncIndicators(candles);

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

        // Position viewport to keep last price visible and set manual price range without autoScale
        if (isFirstLoad || isSymbolChange || isTimeframeChange) {
          if (candles.length > 0 && chartApiRef.current) {
            const count = candles.length;
            const visibleCount = Math.min(count, 80);
            chartApiRef.current.timeScale().setVisibleLogicalRange({
              from: count - visibleCount,
              to: count + 5,
            });

            // Directly compute visible candles min/max and set manual visible range with margins
            const visibleCandles = candles.slice(Math.max(0, count - visibleCount));
            let minPrice = Infinity;
            let maxPrice = -Infinity;
            for (const c of visibleCandles) {
              if (c.low < minPrice) minPrice = c.low;
              if (c.high > maxPrice) maxPrice = c.high;
            }
            if (minPrice !== Infinity && maxPrice !== -Infinity) {
              const span = maxPrice - minPrice || 1;
              const topMargin = (chartSettings.marginScaleTop ?? 10) / 100;
              const bottomMargin = (chartSettings.marginScaleBottom ?? 8) / 100;
              const from = minPrice - span * bottomMargin;
              const to = maxPrice + span * topMargin;
              chartApiRef.current.priceScale('right').setVisibleRange({ from, to });
              setIsAutoScale(false);
            }
          }
        }

        // Default HUD
        const last = candles[candles.length - 1];
        const change = last.close - last.open;
        const changePercent = (change / last.open) * 100;
        setLiveOHLC({
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
          volume: last.volume,
          change,
          changePercent,
        });
        setHoveredOHLC(null);
        setHoveredIndicatorValues(null);

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
                setLiveOHLC(pendingHudUpdate);
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

        // Subscribe to live kline stream (WebSocket for Binance, Poll for OANDA)
        wsCleanup = transport.subscribeLiveKline(symbol, timeframe, (liveCandle) => {
          if (isCancelled) return;
          setIsWsActive(true);

        try {
          const dur = getTimeframeDurationSeconds(timeframe);
          const bucketTime = dur > 1 ? Math.floor(liveCandle.time / dur) * dur : liveCandle.time;

          const arr = candlesRef.current;
          let aggregatedCandle: Candle;

          if (arr.length > 0) {
            const lastBar = arr[arr.length - 1];
            if (bucketTime < lastBar.time) {
              const idx = arr.findIndex((b) => b.time === bucketTime);
              if (idx !== -1) {
                arr[idx] = {
                  ...arr[idx],
                  high: Math.max(arr[idx].high, liveCandle.high),
                  low: Math.min(arr[idx].low, liveCandle.low),
                  close: liveCandle.close,
                };
                scheduleCandlesUpdate();
                // NOTE: Do NOT call candleSeries.update() for bars older than the series tip!
                // Lightweight Charts explicitly forbids updating older data:
                // "Error: Cannot update oldest data, last time=..., new time=..."
              }
              return;
            }

            if (lastBar.time === bucketTime) {
              const liveVol = liveCandle.volume ?? 0;
              // Candle volume can only increase or stay the same — it must never decrease.
              const newVolume =
                liveCandle.time === lastBar.time
                  ? Math.max(lastBar.volume || 0, liveVol)
                  : (lastBar.volume || 0) + liveVol;

              aggregatedCandle = {
                time: bucketTime,
                open: lastBar.open,
                high: Math.max(lastBar.high, liveCandle.high),
                low: Math.min(lastBar.low, liveCandle.low),
                close: liveCandle.close,
                volume: newVolume,
              };
              arr[arr.length - 1] = aggregatedCandle;
              scheduleCandlesUpdate();
            } else {
              const isGap = bucketTime - lastBar.time > dur * 1.5;
              aggregatedCandle = {
                time: bucketTime,
                open: liveCandle.open,
                high: liveCandle.high,
                low: liveCandle.low,
                close: liveCandle.close,
                volume: liveCandle.volume ?? 0,
              };
              arr.push(aggregatedCandle);
              scheduleCandlesUpdate(true);
              updateFutureWhitespaceRef.current(arr, timeframeRef.current);

              if (isGap) {
                // Gap between last known bar and incoming bar! Trigger immediate catch-up backfill
                reconcileCatchUpRef.current('live_gap');
              }
            }
          } else {
            aggregatedCandle = {
              ...liveCandle,
              time: bucketTime,
            };
            arr.push(aggregatedCandle);
            scheduleCandlesUpdate(true);
            updateFutureWhitespaceRef.current(arr, timeframeRef.current);
          }

          // If pane is off-screen or occluded, mark pending flush and skip GPU series draws
          if (!isVisibleRef.current) {
            pendingSeriesFlushRef.current = true;
            return;
          }

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
              applyChartTypeDataRef.current(ct, candlesRef.current);
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

            if (indicatorsRef.current.length > 0) {
              syncIndicators(candlesRef.current);
            }
          };

          // Raw, unthrottled real-time canvas dispatch: every single WebSocket update
          // is rendered directly to the Lightweight Charts canvas with zero delay, cap, or skipping.
          try {
            applySeriesUpdate(aggregatedCandle);
          } catch (seriesErr) {
            applyChartTypeDataRef.current(chartTypeRef.current, candlesRef.current);
          }

          const chg = aggregatedCandle.close - aggregatedCandle.open;
          const chgPct = (chg / aggregatedCandle.open) * 100;
          scheduleHudUpdate({
            open: aggregatedCandle.open,
            high: aggregatedCandle.high,
            low: aggregatedCandle.low,
            close: aggregatedCandle.close,
            volume: aggregatedCandle.volume,
            change: chg,
            changePercent: chgPct,
          });
        } catch (seriesErr) {
          console.warn('[Live Candle Update Warning]', seriesErr);
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
      if (wsCleanup) {
        wsCleanup();
      }
    };
  }, [symbol, timeframe]);

  // Visible logical range synchronization listener (0 React re-renders during panning!)
  useEffect(() => {
    if (!dateRangeLock) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useSyncStore.subscribe((state) => {
      const syncRange = state.syncLogicalRange;
      if (!syncRange || syncRange.sourceId === paneId) return;
      if (!chartApiRef.current) return;
      const curRange = chartApiRef.current.timeScale().getVisibleLogicalRange();
      if (
        curRange &&
        Math.abs(curRange.from - syncRange.from) < 0.05 &&
        Math.abs(curRange.to - syncRange.to) < 0.05
      ) {
        return;
      }
      isApplyingSyncRangeRef.current = true;
      chartApiRef.current.timeScale().setVisibleLogicalRange({
        from: syncRange.from,
        to: syncRange.to,
      });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        isApplyingSyncRangeRef.current = false;
      }, 50);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
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
          chart={chartApiRef.current}
          series={candleSeriesRef.current}
          candles={candlesData}
          containerRef={wrapperRef}
          paneSymbol={symbol}
          paneId={paneId}
          isActive={isActive}
          isGrid={isGrid}
        />

        {/* Chart Watermark */}
        {chartSettings.canvasWatermark && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 select-none overflow-hidden">
            <span
              className="text-8xl font-black tracking-widest uppercase opacity-25"
              style={{ color: chartSettings.canvasWatermarkColor || 'rgba(42, 46, 57, 0.4)' }}
            >
              {symbol}
            </span>
          </div>
        )}

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
            className={`absolute top-2 right-12 z-25 p-1 rounded backdrop-blur transition-colors cursor-pointer shadow select-none ${
              isLightCanvas
                ? 'bg-white/90 hover:bg-white border border-black/10 text-[#434651] hover:text-[#131722]'
                : 'bg-[#1e222d]/85 hover:bg-[#2a2e39] border border-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc]'
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
                  className={`absolute ${isGrid ? 'right-20' : 'right-14'} z-30 flex items-center gap-0.5 rounded px-1 py-0.5 shadow backdrop-blur-xs select-none ${
                    isLightCanvas
                      ? 'bg-white/90 hover:bg-white border border-black/10 text-[#434651]'
                      : 'bg-[#1e222d]/85 hover:bg-[#1e222d] border border-[#2a2e39] text-[#787b86]'
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

                    {displayOHLC && (
                      <div
                        className="flex items-center space-x-2 tabular-nums text-[11px]"
                        style={{ fontSize: `${statusTextSize}px` }}
                      >
                        {chartSettings.statusShowChartValues && (
                          <>
                            <span style={{ color: statusTextColor }}>
                              <span className="opacity-75 font-normal">O</span>{' '}
                              <span className="font-medium">{displayOHLC.open.toFixed(pricePrecision)}</span>
                            </span>
                            <span style={{ color: statusTextColor }}>
                              <span className="opacity-75 font-normal">H</span>{' '}
                              <span className="font-medium">{displayOHLC.high.toFixed(pricePrecision)}</span>
                            </span>
                            <span style={{ color: statusTextColor }}>
                              <span className="opacity-75 font-normal">L</span>{' '}
                              <span className="font-medium">{displayOHLC.low.toFixed(pricePrecision)}</span>
                            </span>
                            <span style={{ color: statusTextColor }}>
                              <span className="opacity-75 font-normal">C</span>{' '}
                              <span className="font-medium">{displayOHLC.close.toFixed(pricePrecision)}</span>
                            </span>
                          </>
                        )}
                        {chartSettings.statusShowBarChange && (
                          <span
                            className={`font-medium ${
                              displayOHLC.change >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
                            }`}
                          >
                            {displayOHLC.change >= 0 ? '+' : ''}
                            {displayOHLC.change.toFixed(pricePrecision)} ({displayOHLC.change >= 0 ? '+' : ''}
                            {displayOHLC.changePercent.toFixed(2)}%)
                          </span>
                        )}
                        {chartSettings.statusShowVolume && (
                          <span style={{ color: statusTextColor }}>
                            <span className="opacity-75 font-normal">Vol</span>{' '}
                            <span className="font-medium">{displayOHLC.volume.toLocaleString()}</span>
                          </span>
                        )}
                      </div>
                    )}

                    {isBackfilling && (
                      <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-[#1e222d] border border-[#2962ff]/50 text-[#2962ff] text-[10px] font-mono select-none">
                        <div className="w-2.5 h-2.5 rounded-full border-2 border-[#2962ff] border-t-transparent animate-spin" />
                        <span>Loading history...</span>
                      </div>
                    )}
                  </div>

                  {/* Active Overlay Indicators Legend (Overlays stay on Main Chart) */}
                  <IndicatorLegend
                    paneId={paneId}
                    category="overlay"
                    values={displayIndicatorValues}
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
                      <IndicatorLegendItem
                        paneId={paneId}
                        indicator={ind}
                        values={displayIndicatorValues[ind.id] || {}}
                        precision={pricePrecision}
                      />
                    </div>

                    {/* Sub-pane Action Controls Toolbar */}
                    <div
                      className={`absolute ${isGrid ? 'right-20' : 'right-14'} z-30 flex items-center gap-0.5 rounded px-1 py-0.5 shadow backdrop-blur-xs select-none transition-opacity ${
                        isThisPaneCollapsing ? 'opacity-30' : 'opacity-100'
                      } ${
                        isLightCanvas
                          ? 'bg-white/90 hover:bg-white border border-black/10 text-[#434651]'
                          : 'bg-[#1e222d]/85 hover:bg-[#1e222d] border border-[#2a2e39] text-[#787b86]'
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
                const values = displayIndicatorValues?.[ind.id] || {};
                const inputsStr =
                  ind.type === 'volume'
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
                    className={`w-full h-[22px] px-3 border-t flex items-center justify-between text-[11px] font-sans select-none cursor-pointer transition-colors group backdrop-blur-xs ${
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
                      <div className="flex items-center space-x-2 font-mono tabular-nums text-[11px] truncate">
                        {Object.entries(values).map(([plotKey, val]) => {
                          const style = ind.styles[plotKey];
                          const color = style?.color || '#2962ff';
                          const formatted =
                            val !== null && val !== undefined && !isNaN(val)
                              ? ind.type === 'volume' && plotKey === 'vol'
                                ? Math.abs(val) >= 1_000_000
                                  ? (val / 1_000_000).toFixed(2) + 'M'
                                  : Math.abs(val) >= 1_000
                                  ? (val / 1_000).toFixed(2) + 'K'
                                  : Math.round(val).toLocaleString()
                                : val.toFixed(2)
                              : '—';
                          return (
                            <span key={plotKey} style={{ color }}>
                              {formatted}
                            </span>
                          );
                        })}
                      </div>
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
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[#1e222d] border border-[#2962ff] shadow-xl shadow-[#2962ff]/30 px-3.5 py-1.5 rounded-full text-xs text-white pointer-events-none select-none backdrop-blur-md animate-pulse">
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
          } left-3 z-30 flex items-center space-x-1.5 px-2 py-1 rounded bg-[#131722]/85 backdrop-blur-md border border-[#2a2e39] hover:border-[#2962ff] transition-all select-none pointer-events-auto cursor-pointer group shadow-lg`}
          title="OrderCraft — Powered by TradingView Lightweight Charts™"
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
          <div className="absolute inset-0 bg-[#131722]/60 backdrop-blur-[1px] flex items-center justify-center z-20">
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
                <div className="absolute bottom-8 right-0 w-80 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl py-1 z-50 text-xs backdrop-blur-md overflow-hidden animate-in fade-in zoom-in-95 duration-100">
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
