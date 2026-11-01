import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isTimeframeSupported, getFallbackTimeframe } from '../utils/timeframeSupport';
import type { IndicatorInstance, IndicatorType, IndicatorPlotStyle } from '../indicators/types';
import { INDICATOR_REGISTRY } from '../indicators/registry';
import { transport } from '../transport/client';

export type MagnetMode = 'none' | 'weak' | 'strong';
export type ChartType =
  | 'bars'
  | 'candles'
  | 'hollow_candles'
  | 'volume_candles'
  | 'hlc_bars'
  | 'line'
  | 'line_with_markers'
  | 'step_line'
  | 'area'
  | 'baseline'
  | 'high_low'
  | 'heikin_ashi'
  | 'renko';
export type CursorType = 'cross' | 'dot' | 'arrow';
export type FavoriteItemType = DrawingToolType | CursorType;
export type DrawingToolType =
  | 'cursor'
  // Lines & Rays
  | 'trendline'
  | 'ray'
  | 'info_line'
  | 'horizontal_line'
  | 'horizontal_ray'
  | 'vertical_line'
  | 'cross_line'
  | 'parallel_channel'
  // Fibonacci
  | 'fib_retracement'
  | 'fib_extension'
  // Shapes
  | 'rectangle'
  | 'rotated_rectangle'
  | 'path'
  | 'circle'
  // Trading & Measurement
  | 'long_position'
  | 'short_position'
  | 'price_range'
  | 'date_range'
  | 'date_price_range'
  // Volume-Based
  | 'anchored_vwap'
  | 'fixed_range_volume_profile'
  | 'anchored_volume_profile';

export type LayoutType =
  | '1'
  | '2v'
  | '2h'
  | '3v'
  | '3h'
  | '3top'
  | '3left'
  | '4'
  | '4v'
  | '4h'
  | '6'
  | '8';

export interface LogicalAnchor {
  time: number;  // Unix timestamp in seconds
  price: number; // Price level
}

export interface UserDrawing {
  id: string;
  type: DrawingToolType;
  anchors: LogicalAnchor[];
  color?: string;
  lineWidth?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  text?: string;
  symbol?: string;
  paneId?: string;
  locked?: boolean;
  hidden?: boolean;
  options?: {
    entryPrice?: number;
    targetPrice?: number;
    stopPrice?: number;
    lotSize?: number;
    riskReward?: number;
    extendLeft?: boolean;
    extendRight?: boolean;
    showStats?: boolean;
    fillOpacity?: number;
    [key: string]: any;
  };
}

export type RightSidebarTab =
  | 'watchlist'
  | 'alerts'
  | 'objectTree'
  | 'movers'
  | 'news'
  | 'calendar'
  | 'providers'
  | 'notifications'
  | 'help'
  | 'issues'
  | null;

export interface WatchlistItem {
  symbol: string;
  name?: string;
  group: string;
  lastPrice?: number;
  change?: number;
  changePct?: number;
  volume?: number;
  prevPrice?: number;
  lastUpdated?: number;
}

export interface WatchlistTableSettings {
  isTableView: boolean;
  showLast: boolean;
  showChange: boolean;
  showChangePct: boolean;
  showVolume: boolean;
  showExtendedHours: boolean;
  symbolDisplay: 'both' | 'symbol' | 'name';
  showLogo: boolean;
}

export const DEFAULT_WATCHLIST_TABLE_SETTINGS: WatchlistTableSettings = {
  isTableView: true,
  showLast: true,
  showChange: true,
  showChangePct: true,
  showVolume: false,
  showExtendedHours: false,
  symbolDisplay: 'both',
  showLogo: true,
};

export interface Watchlist {
  id: string;
  name: string;
  items: WatchlistItem[];
}

export interface AlertItem {
  id: string;
  symbol: string;
  condition: 'crossing' | 'crossing_up' | 'crossing_down' | 'greater_than' | 'less_than';
  targetPrice: number;
  createdAt: number;
  triggeredAt?: number;
  active: boolean;
  message?: string;
}

export interface AlertLogItem {
  id: string;
  alertId: string;
  symbol: string;
  condition: string;
  triggerPrice: number;
  timestamp: number;
}

export const DEFAULT_WATCHLISTS: Watchlist[] = [
  {
    id: 'watchlist-main',
    name: 'Main Watchlist',
    items: [
      { symbol: '^NDX', name: 'Nasdaq 100', group: 'INDICES' },
      { symbol: '^GSPC', name: 'S&P 500', group: 'INDICES' },
      { symbol: '^DJI', name: 'Dow Jones 30', group: 'INDICES' },
      { symbol: 'AAPL', name: 'Apple Inc.', group: 'STOCKS' },
      { symbol: 'MSFT', name: 'Microsoft Corp.', group: 'STOCKS' },
      { symbol: 'NVDA', name: 'NVIDIA Corp.', group: 'STOCKS' },
      { symbol: 'TSLA', name: 'Tesla Inc.', group: 'STOCKS' },
      { symbol: 'EURUSD=X', name: 'EUR/USD', group: 'FOREX' },
      { symbol: 'GBPUSD=X', name: 'GBP/USD', group: 'FOREX' },
      { symbol: 'USDJPY=X', name: 'USD/JPY', group: 'FOREX' },
      { symbol: 'BTC-USD', name: 'Bitcoin', group: 'CRYPTO' },
      { symbol: 'ETH-USD', name: 'Ethereum', group: 'CRYPTO' },
      { symbol: 'SOL-USD', name: 'Solana', group: 'ALTS' },
      { symbol: 'XRP-USD', name: 'XRP', group: 'ALTS' },
    ],
  },
];

export interface ChartPaneConfig {
  id: string;
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  timezone: string;
  settings?: ChartVisualSettings;
}

export interface HistorySnapshot {
  description: string;
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  activePaneId?: string;
  panes: Record<string, ChartPaneConfig>;
  drawings: UserDrawing[];
  deletedDrawingIds: Record<string, boolean>;
  indicators: Record<string, IndicatorInstance[]>;
  chartSettings: ChartVisualSettings;
}

export interface CrosshairSyncData {
  time: number | null;
  price?: number | null;
  xRatio?: number | null;
  x?: number | null;
  yRatio?: number | null;
  y?: number | null;
  symbol?: string;
  sourceId: string;
}

export interface LogicalRangeSyncData {
  from: number;
  to: number;
  sourceId: string;
}

export const DEFAULT_PANES: Record<string, ChartPaneConfig> = {
  'pane-1': { id: 'pane-1', symbol: 'BINANCE:BTCUSDT', timeframe: '15m', chartType: 'candles', timezone: 'UTC-4' },
  'pane-2': { id: 'pane-2', symbol: 'BINANCE:ETHUSDT', timeframe: '1h', chartType: 'candles', timezone: 'UTC-4' },
  'pane-3': { id: 'pane-3', symbol: 'BINANCE:SOLUSDT', timeframe: '4h', chartType: 'candles', timezone: 'UTC-4' },
  'pane-4': { id: 'pane-4', symbol: 'BINANCE:BTCUSDT', timeframe: '1D', chartType: 'candles', timezone: 'UTC-4' },
  'pane-5': { id: 'pane-5', symbol: 'BINANCE:BNBUSDT', timeframe: '15m', chartType: 'candles', timezone: 'UTC-4' },
  'pane-6': { id: 'pane-6', symbol: 'BINANCE:XRPUSDT', timeframe: '1h', chartType: 'candles', timezone: 'UTC-4' },
  'pane-7': { id: 'pane-7', symbol: 'BINANCE:DOGEUSDT', timeframe: '15m', chartType: 'candles', timezone: 'UTC-4' },
  'pane-8': { id: 'pane-8', symbol: 'BINANCE:ADAUSDT', timeframe: '1h', chartType: 'candles', timezone: 'UTC-4' },
};

export function getPanesForLayout(type: LayoutType): string[] {
  switch (type) {
    case '1': return ['pane-1'];
    case '2v':
    case '2h': return ['pane-1', 'pane-2'];
    case '3v':
    case '3h':
    case '3top':
    case '3left': return ['pane-1', 'pane-2', 'pane-3'];
    case '4':
    case '4v':
    case '4h': return ['pane-1', 'pane-2', 'pane-3', 'pane-4'];
    case '6': return ['pane-1', 'pane-2', 'pane-3', 'pane-4', 'pane-5', 'pane-6'];
    case '8': return ['pane-1', 'pane-2', 'pane-3', 'pane-4', 'pane-5', 'pane-6', 'pane-7', 'pane-8'];
    default: return ['pane-1'];
  }
}

export interface LayoutRatios {
  cols: number[];
  rows: number[];
}

export const DEFAULT_LAYOUT_RATIOS: Record<LayoutType, LayoutRatios> = {
  '1': { cols: [1], rows: [1] },
  '2v': { cols: [0.5, 0.5], rows: [1] },
  '2h': { cols: [1], rows: [0.5, 0.5] },
  '3v': { cols: [1 / 3, 1 / 3, 1 / 3], rows: [1] },
  '3h': { cols: [1], rows: [1 / 3, 1 / 3, 1 / 3] },
  '3top': { cols: [0.5, 0.5], rows: [0.5, 0.5] },
  '3left': { cols: [0.5, 0.5], rows: [0.5, 0.5] },
  '4': { cols: [0.5, 0.5], rows: [0.5, 0.5] },
  '4v': { cols: [0.25, 0.25, 0.25, 0.25], rows: [1] },
  '4h': { cols: [1], rows: [0.25, 0.25, 0.25, 0.25] },
  '6': { cols: [1 / 3, 1 / 3, 1 / 3], rows: [0.5, 0.5] },
  '8': { cols: [0.25, 0.25, 0.25, 0.25], rows: [0.5, 0.5] },
};

export interface ChartVisualSettings {
  // Candle Colors & Display (Symbol Tab)
  colorBarsBasedOnPrevClose: boolean;
  candleBodyUpColor: string;
  candleBodyDownColor: string;
  candleBorderUpColor: string;
  candleBorderDownColor: string;
  candleWickUpColor: string;
  candleWickDownColor: string;
  showCandleBody: boolean;
  showCandleBorders: boolean;
  showCandleWick: boolean;
  sessionType: string;
  precisionMode: string;

  // Status Line Tab
  statusShowTitle: boolean;
  statusTitleMode: 'Ticker' | 'Description' | 'Ticker and description';
  statusShowChartValues: boolean;
  statusShowBarChange: boolean;
  statusShowVolume: boolean;
  showVolume?: boolean;
  statusShowIndicatorTitles: boolean;
  statusShowIndicatorInputs: boolean;
  statusShowIndicatorValues: boolean;
  statusShowIndicatorBackground: boolean;
  statusIndicatorBgOpacity: number;

  // Scales & Lines Tab
  scaleModeAL: string;
  lockPriceToBarRatio: boolean;
  priceToBarRatioValue: string;
  scalesPlacement: string;
  noOverlappingLabels: boolean;
  showPlusButton: boolean;
  showCountdownToBarClose: boolean;
  symbolPriceScaleMode: string;
  symbolPriceSubMode: string;
  symbolPriceLineColor: string;
  symbolPriceLineStyle: 'solid' | 'dashed' | 'dotted';
  symbolPriceLineWidth: number;
  previousDayCloseMode: string;
  indicatorsPriceScaleMode: string;
  highLowPriceScaleMode: string;
  bidAskPriceScaleMode: string;
  dayOfWeekOnLabels: boolean;
  dateFormat: string;
  timeHoursFormat: string;
  saveChartLeftEdgePosition: boolean;

  // Canvas Tab
  canvasBgType: 'solid' | 'gradient';
  canvasBgColor: string;
  canvasBgColor2: string;
  canvasGridMode: 'None' | 'Vertical and horizontal' | 'Vertical only' | 'Horizontal only';
  canvasVertGridColor: string;
  canvasHorzGridColor: string;
  canvasGridStyle: 'solid' | 'dashed' | 'dotted';
  canvasSessionBreaks: boolean;
  canvasSessionBreaksColor: string;
  canvasSessionBreaksStyle: 'solid' | 'dashed' | 'dotted';
  canvasSessionBreaksWidth: number;
  canvasCrosshairColor: string;
  canvasCrosshairStyle: 'solid' | 'dashed' | 'dotted';
  canvasCrosshairWidth: number;
  canvasWatermark: boolean;
  canvasWatermarkColor: string;

  // Scales Section (in Canvas Tab)
  scalesTextColor: string;
  scalesTextSize: number;
  scalesLineColor: string;

  // Buttons Section (in Canvas Tab)
  navButtonsMode: 'Visible on mouse over' | 'Always visible' | 'Always hidden';
  paneButtonsMode: 'Visible on mouse over' | 'Always visible' | 'Always hidden';

  // Margins Section (in Canvas Tab)
  marginScaleTop: number;
  marginScaleBottom: number;
  marginRightBars: number;

  // Trading Tab
  showTradingBuySellButtons: boolean;
  instantOrderPlacement: boolean;
  playOrderSounds: boolean;
  showPositionsAndOrders: boolean;
}

export const DEFAULT_CHART_SETTINGS: ChartVisualSettings = {
  colorBarsBasedOnPrevClose: false,
  candleBodyUpColor: '#089981',
  candleBodyDownColor: '#f23645',
  candleBorderUpColor: '#089981',
  candleBorderDownColor: '#f23645',
  candleWickUpColor: '#089981',
  candleWickDownColor: '#f23645',
  showCandleBody: true,
  showCandleBorders: true,
  showCandleWick: true,
  sessionType: 'Electronic trading hours',
  precisionMode: 'Default',

  statusShowTitle: true,
  statusTitleMode: 'Ticker',
  statusShowChartValues: true,
  statusShowBarChange: true,
  statusShowVolume: true,
  showVolume: true,
  statusShowIndicatorTitles: true,
  statusShowIndicatorInputs: true,
  statusShowIndicatorValues: true,
  statusShowIndicatorBackground: true,
  statusIndicatorBgOpacity: 50,

  scaleModeAL: 'Visible on mouse over',
  lockPriceToBarRatio: false,
  priceToBarRatioValue: '1.4298744',
  scalesPlacement: 'Auto',
  noOverlappingLabels: true,
  showPlusButton: true,
  showCountdownToBarClose: true,
  symbolPriceScaleMode: 'Value, line',
  symbolPriceSubMode: 'Value according to scale',
  symbolPriceLineColor: '#089981',
  symbolPriceLineStyle: 'dashed',
  symbolPriceLineWidth: 1,
  previousDayCloseMode: 'Hidden',
  indicatorsPriceScaleMode: 'Value',
  highLowPriceScaleMode: 'Hidden',
  bidAskPriceScaleMode: 'Hidden',
  dayOfWeekOnLabels: true,
  dateFormat: "Mon 29 Sep '97",
  timeHoursFormat: '24-hours',
  saveChartLeftEdgePosition: true,

  canvasBgType: 'solid',
  canvasBgColor: '#131722',
  canvasBgColor2: '#181b27',
  canvasGridMode: 'Vertical and horizontal',
  canvasVertGridColor: 'rgba(42, 46, 57, 0.4)',
  canvasHorzGridColor: 'rgba(42, 46, 57, 0.4)',
  canvasGridStyle: 'dashed',
  canvasSessionBreaks: false,
  canvasSessionBreaksColor: '#2962ff',
  canvasSessionBreaksStyle: 'dashed',
  canvasSessionBreaksWidth: 1,
  canvasCrosshairColor: '#787b86',
  canvasCrosshairStyle: 'dotted',
  canvasCrosshairWidth: 1,
  canvasWatermark: false,
  canvasWatermarkColor: 'rgba(42, 46, 57, 0.3)',

  scalesTextColor: '#787b86',
  scalesTextSize: 11,
  scalesLineColor: '#2a2e39',

  navButtonsMode: 'Visible on mouse over',
  paneButtonsMode: 'Visible on mouse over',

  marginScaleTop: 10,
  marginScaleBottom: 8,
  marginRightBars: 10,

  showTradingBuySellButtons: true,
  instantOrderPlacement: false,
  playOrderSounds: true,
  showPositionsAndOrders: true,
};

interface SyncStoreState {
  // Multi-chart workspace layout
  layoutType: LayoutType;
  activePaneId: string;
  maximizedPaneId: string | null;
  panes: Record<string, ChartPaneConfig>;

  // Active chart parameters (reflects activePaneId)
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  timezone: string;

  // Active drawing tool & modes
  activeTool: DrawingToolType;
  cursorType: CursorType;
  magnetMode: MagnetMode;
  drawingsLocked: boolean;
  drawingsHidden: boolean;
  drawings: UserDrawing[];
  selectedDrawingId: string | null;

  // Layout & UI Modals
  layoutId: string;
  layoutName: string;
  layoutAutosave: boolean;
  isSavingLayout: boolean;
  lastSavedTimestamp: number | null;
  isCommandPaletteOpen: boolean;
  commandPaletteInitialQuery: string;
  isIntervalModalOpen: boolean;
  intervalModalInitialQuery: string;
  isLayoutModalOpen: boolean;

  // Multi-chart synchronization locks
  symbolLock: boolean;
  intervalLock: boolean;
  crosshairLock: boolean;
  dateRangeLock: boolean;
  trackTimeLock: boolean;

  // Real-time ephemeral sync channels
  syncCrosshair: CrosshairSyncData | null;
  syncLogicalRange: LogicalRangeSyncData | null;

  // Settings Dialog
  isChartSettingsOpen: boolean;
  targetSettingsPaneId: string | null;
  chartSettings: ChartVisualSettings;
  openChartSettings: (paneId?: string) => void;
  closeChartSettings: () => void;
  updateChartSettings: (partial: Partial<ChartVisualSettings>) => void;
  updatePaneSettings: (paneId: string, partial: Partial<ChartVisualSettings>) => void;
  applySettingsToAllPanes: (settings?: ChartVisualSettings) => void;
  resetChartSettings: (paneId?: string) => void;

  // Customization & Toolbars
  pinnedTimeframes: string[];
  showCountdownToBarClose: boolean;
  layoutRatios: Record<string, LayoutRatios>;
  isFullscreen: boolean;

  // Actions
  setLayoutType: (type: LayoutType) => void;
  setLayoutRatios: (layout: LayoutType, ratios: LayoutRatios) => void;
  resetLayoutRatios: (layout: LayoutType) => void;
  setIsFullscreen: (isFullscreen: boolean) => void;
  toggleFullscreen: () => void;
  setActivePaneId: (id: string) => void;
  setMaximizedPaneId: (id: string | null) => void;
  toggleMaximizePane: (id: string) => void;
  updatePaneConfig: (id: string, partial: Partial<ChartPaneConfig>) => void;

  setSymbol: (symbol: string) => void;
  setTimeframe: (timeframe: string) => void;
  setChartType: (type: ChartType) => void;
  setTimezone: (timezone: string) => void;

  setSyncCrosshair: (data: CrosshairSyncData | null) => void;
  setSyncLogicalRange: (data: LogicalRangeSyncData | null) => void;

  setActiveTool: (tool: DrawingToolType) => void;
  setCursorType: (cursorType: CursorType) => void;
  cycleMagnetMode: () => void;
  setMagnetMode: (mode: MagnetMode) => void;
  toggleDrawingsLocked: () => void;
  toggleDrawingsHidden: () => void;
  syncDrawingsAcrossCharts: boolean;
  toggleSyncDrawingsAcrossCharts: () => void;
  setSyncDrawingsAcrossCharts: (active: boolean) => void;
  addDrawing: (drawing: UserDrawing) => void;
  loadedSymbols: Record<string, boolean>;
  deletedDrawingIds: Record<string, boolean>;
  isSymbolLoaded: (cacheKey: string) => boolean;
  markSymbolLoading: (cacheKey: string) => void;
  loadDrawingsForSymbol: (symbol: string, drawings: UserDrawing[], cacheKey?: string) => void;
  setDrawings: (drawings: UserDrawing[]) => void;
  updateDrawing: (id: string, partial: Partial<UserDrawing>) => void;
  deleteDrawing: (id: string) => void;
  clearDrawings: (symbol?: string, paneId?: string, removeLocked?: boolean) => void;
  setSelectedDrawingId: (id: string | null) => void;
  duplicateDrawing: (id: string) => void;
  toggleDrawingLock: (id: string) => void;
  toggleDrawingVisibility: (id: string) => void;

  setLayout: (id: string, name: string) => void;
  saveCurrentLayout: () => Promise<string>;
  loadLayoutById: (targetId: string, targetName: string) => Promise<boolean>;
  createNewLayout: (newName: string) => Promise<string>;
  cloneCurrentLayout: (copyName: string) => Promise<string>;
  renameCurrentLayout: (newName: string) => Promise<void>;
  toggleLayoutAutosave: () => void;
  setLayoutAutosave: (val: boolean) => void;
  openLayoutModal: () => void;
  closeLayoutModal: () => void;
  isObjectTreeOpen: boolean;
  openObjectTree: () => void;
  closeObjectTree: () => void;
  toggleObjectTree: () => void;
  openCommandPalette: (query?: string) => void;
  closeCommandPalette: () => void;
  openIntervalModal: (query?: string) => void;
  closeIntervalModal: () => void;
  toggleLock: (lock: 'symbolLock' | 'intervalLock' | 'crosshairLock' | 'dateRangeLock' | 'trackTimeLock') => void;
  setPinnedTimeframes: (timeframes: string[]) => void;
  togglePinTimeframe: (timeframe: string) => void;
  pinnedChartTypes: ChartType[];
  togglePinChartType: (chartType: ChartType) => void;
  toggleCountdownToBarClose: () => void;

  // Starred / Favorite Drawings Bar
  favoriteDrawingTools: FavoriteItemType[];
  showFavoriteDrawingsBar: boolean;
  toggleFavoriteDrawingTool: (tool: FavoriteItemType) => void;
  setFavoriteDrawingTools: (tools: FavoriteItemType[]) => void;
  toggleShowFavoriteDrawingsBar: () => void;
  setShowFavoriteDrawingsBar: (show: boolean) => void;

  // Technical Indicators
  indicators: Record<string, IndicatorInstance[]>;
  favoriteIndicators: string[];
  isIndicatorsModalOpen: boolean;
  activeSettingsIndicator: { paneId: string; indicatorId: string } | null;
  openIndicatorsModal: () => void;
  closeIndicatorsModal: () => void;
  openIndicatorSettings: (paneId: string, indicatorId: string) => void;
  closeIndicatorSettings: () => void;
  addIndicatorToPane: (paneId: string, type: IndicatorType) => IndicatorInstance;
  removeIndicatorFromPane: (paneId: string, indicatorId: string) => void;
  clearIndicatorsFromPane: (paneId: string) => void;
  updateIndicatorInputs: (paneId: string, indicatorId: string, inputs: Record<string, any>) => void;
  updateIndicatorStyles: (paneId: string, indicatorId: string, styles: Record<string, IndicatorPlotStyle>) => void;
  toggleIndicatorVisibility: (paneId: string, indicatorId: string) => void;
  swapIndicators: (paneId: string, id1: string, id2: string) => void;
  toggleFavoriteIndicator: (type: string) => void;

  // Right Sidebar & Tools
  activeRightSidebarTab: RightSidebarTab;
  rightSidebarWidth: number;
  setActiveRightSidebarTab: (tab: RightSidebarTab) => void;
  toggleRightSidebarTab: (tab: RightSidebarTab) => void;
  setRightSidebarWidth: (width: number) => void;

  // Watchlists
  watchlists: Watchlist[];
  activeWatchlistId: string;
  watchlistTableSettings: WatchlistTableSettings;
  setWatchlistTableSettings: (partial: Partial<WatchlistTableSettings>) => void;
  setActiveWatchlistId: (id: string) => void;
  addSymbolToWatchlist: (watchlistId: string, symbol: string, group?: string, name?: string) => void;
  removeSymbolFromWatchlist: (watchlistId: string, symbol: string) => void;
  createWatchlist: (name: string) => void;
  deleteWatchlist: (watchlistId: string) => void;
  renameWatchlist: (watchlistId: string, newName: string) => void;
  clearWatchlist: (watchlistId: string) => void;
  sortWatchlist: (watchlistId: string, mode: 'symbol_asc' | 'symbol_desc' | 'chg_asc' | 'chg_desc' | 'vol_desc' | 'price_desc') => void;
  updateWatchlistTick: (symbol: string, price: number, change?: number, changePct?: number, volume?: number, name?: string) => void;

  // Alerts
  alerts: AlertItem[];
  alertLogs: AlertLogItem[];
  addAlert: (alert: Omit<AlertItem, 'id' | 'createdAt'>) => void;
  removeAlert: (id: string) => void;
  toggleAlertActive: (id: string) => void;
  triggerAlert: (alertId: string, triggerPrice: number) => void;
  clearAlertLogs: () => void;

  // History & Undo / Redo
  canUndo: boolean;
  canRedo: boolean;
  undoDescription: string | null;
  redoDescription: string | null;
  historyPast: HistorySnapshot[];
  historyFuture: HistorySnapshot[];
  pushHistory: (description: string) => void;
  undo: () => void;
  redo: () => void;
}

export const createDefaultVolumeIndicator = (paneId: string): IndicatorInstance => ({
  id: `default_vol_${paneId}`,
  type: 'volume',
  paneId,
  name: 'Vol',
  category: 'overlay',
  visible: true,
  inputs: { showMa: false, maLength: 20 },
  styles: {
    vol: { color: '#089981', lineWidth: 1, lineStyle: 'solid', plotType: 'histogram', visible: true, lastValueVisible: false, priceLineVisible: false },
    ma: { color: '#2962FF', lineWidth: 1, lineStyle: 'solid', plotType: 'line', visible: false, lastValueVisible: false, priceLineVisible: false },
  },
});

export function getTimeframeSeconds(tf: string): number {
  const clean = tf.trim();
  if (clean === '1s') return 1;
  if (clean === '5s') return 5;
  if (clean === '15s') return 15;
  if (clean === '30s') return 30;
  if (clean.toLowerCase().endsWith('s')) return parseInt(clean, 10);

  // Minutes (note: '1M' with uppercase M is 1 Month)
  if (clean.toLowerCase().endsWith('m') && clean !== '1M') {
    return parseInt(clean, 10) * 60;
  }
  // Hours
  if (clean.toLowerCase().endsWith('h')) {
    return parseInt(clean, 10) * 3600;
  }
  // Days
  if (clean.toUpperCase().endsWith('D')) {
    return parseInt(clean, 10) * 86400;
  }
  // Weeks
  if (clean.toUpperCase().endsWith('W')) {
    return parseInt(clean, 10) * 604800;
  }
  // Months
  if (clean.toUpperCase().endsWith('M')) {
    return parseInt(clean, 10) * 2592000;
  }
  return 60;
}

function createSnapshot(state: SyncStoreState, description: string): HistorySnapshot {
  return {
    description,
    symbol: state.symbol,
    timeframe: state.timeframe,
    chartType: state.chartType,
    activePaneId: state.activePaneId,
    panes: JSON.parse(JSON.stringify(state.panes || {})),
    drawings: JSON.parse(JSON.stringify(state.drawings || [])),
    deletedDrawingIds: { ...(state.deletedDrawingIds || {}) },
    indicators: JSON.parse(JSON.stringify(state.indicators || {})),
    chartSettings: JSON.parse(JSON.stringify(state.chartSettings || DEFAULT_CHART_SETTINGS)),
  };
}

function syncDrawingChangesToBackend(
  layoutId: string,
  currentDrawings: UserDrawing[],
  restoredDrawings: UserDrawing[]
) {
  try {
    const currentMap = new Map(currentDrawings.map((d) => [d.id, d]));
    const restoredMap = new Map(restoredDrawings.map((d) => [d.id, d]));

    // 1. Any drawing present currently that is NOT in restored drawings was undone -> delete from backend
    for (const [id] of currentMap) {
      if (!restoredMap.has(id)) {
        transport.deleteDrawing(id).catch(console.error);
      }
    }

    // 2. Any drawing restored or changed -> save to backend
    for (const [id, restored] of restoredMap) {
      const cur = currentMap.get(id);
      if (!cur || JSON.stringify(cur) !== JSON.stringify(restored)) {
        transport
          .saveDrawing({
            id: restored.id,
            layout_id: layoutId || 'default_layout',
            tool_type: restored.type,
            symbol: restored.symbol || 'BINANCE:BTCUSDT',
            data: JSON.stringify(restored),
          })
          .catch(console.error);
      }
    }
  } catch (err) {
    console.error('Failed to sync drawing undo/redo to backend:', err);
  }
}

export const useSyncStore = create<SyncStoreState>()(
  persist(
    (set, get) => ({
      // History & Undo / Redo
      canUndo: false,
      canRedo: false,
      undoDescription: null as string | null,
      redoDescription: null as string | null,
      historyPast: [] as HistorySnapshot[],
      historyFuture: [] as HistorySnapshot[],

      pushHistory: (description: string) => {
        const state = get();
        const snapshot = createSnapshot(state, description);
        const nextPast = [...state.historyPast, snapshot];
        if (nextPast.length > 50) {
          nextPast.shift();
        }
        set({
          historyPast: nextPast,
          historyFuture: [],
          canUndo: true,
          canRedo: false,
          undoDescription: description,
          redoDescription: null,
        });
      },

      undo: () => {
        const state = get();
        const { historyPast, historyFuture } = state;
        if (historyPast.length === 0) return;

        const previousSnapshot = historyPast[historyPast.length - 1];
        const nextPast = historyPast.slice(0, -1);
        const currentSnapshot = createSnapshot(state, previousSnapshot.description);
        const nextFuture = [currentSnapshot, ...historyFuture];
        if (nextFuture.length > 50) {
          nextFuture.pop();
        }

        const prevUndoDesc = nextPast.length > 0 ? nextPast[nextPast.length - 1].description : null;
        const nextRedoDesc = currentSnapshot.description;

        syncDrawingChangesToBackend(
          state.layoutId,
          state.drawings,
          previousSnapshot.drawings
        );

        set({
          historyPast: nextPast,
          historyFuture: nextFuture,
          canUndo: nextPast.length > 0,
          canRedo: true,
          undoDescription: prevUndoDesc,
          redoDescription: nextRedoDesc,

          symbol: previousSnapshot.symbol,
          timeframe: previousSnapshot.timeframe,
          chartType: previousSnapshot.chartType,
          activePaneId: previousSnapshot.activePaneId || state.activePaneId,
          panes: previousSnapshot.panes,
          drawings: previousSnapshot.drawings,
          deletedDrawingIds: previousSnapshot.deletedDrawingIds,
          indicators: previousSnapshot.indicators,
          chartSettings: previousSnapshot.chartSettings,
          selectedDrawingId: null,
        });
      },

      redo: () => {
        const state = get();
        const { historyPast, historyFuture } = state;
        if (historyFuture.length === 0) return;

        const targetSnapshot = historyFuture[0];
        const nextFuture = historyFuture.slice(1);
        const currentSnapshot = createSnapshot(state, targetSnapshot.description);
        const nextPast = [...historyPast, currentSnapshot];
        if (nextPast.length > 50) {
          nextPast.shift();
        }

        const nextUndoDesc = targetSnapshot.description;
        const nextRedoDesc = nextFuture.length > 0 ? nextFuture[0].description : null;

        syncDrawingChangesToBackend(
          state.layoutId,
          state.drawings,
          targetSnapshot.drawings
        );

        set({
          historyPast: nextPast,
          historyFuture: nextFuture,
          canUndo: true,
          canRedo: nextFuture.length > 0,
          undoDescription: nextUndoDesc,
          redoDescription: nextRedoDesc,

          symbol: targetSnapshot.symbol,
          timeframe: targetSnapshot.timeframe,
          chartType: targetSnapshot.chartType,
          activePaneId: targetSnapshot.activePaneId || state.activePaneId,
          panes: targetSnapshot.panes,
          drawings: targetSnapshot.drawings,
          deletedDrawingIds: targetSnapshot.deletedDrawingIds,
          indicators: targetSnapshot.indicators,
          chartSettings: targetSnapshot.chartSettings,
          selectedDrawingId: null,
        });
      },

      layoutType: '1',
      activePaneId: 'pane-1',
      maximizedPaneId: null as string | null,
      panes: { ...DEFAULT_PANES },

      symbol: 'BINANCE:BTCUSDT',
      timeframe: '15m',
      chartType: 'candles',
      timezone: 'UTC-4',

      activeTool: 'cursor',
      cursorType: 'cross',
      magnetMode: 'none',
      drawingsLocked: false,
      drawingsHidden: false,
      drawings: [] as UserDrawing[],
      selectedDrawingId: null as string | null,
      loadedSymbols: {},
      deletedDrawingIds: {},

      layoutId: 'default_layout',
      layoutName: 'Main Workspace',
      layoutAutosave: true,
      isSavingLayout: false,
      lastSavedTimestamp: null,
      isCommandPaletteOpen: false,
      commandPaletteInitialQuery: '',
      isIntervalModalOpen: false,
      intervalModalInitialQuery: '',
      isLayoutModalOpen: false,
      isObjectTreeOpen: false,

      isChartSettingsOpen: false,
      targetSettingsPaneId: null as string | null,
      chartSettings: DEFAULT_CHART_SETTINGS,
      openChartSettings: (paneId) =>
        set((state) => ({
          isChartSettingsOpen: true,
          targetSettingsPaneId: typeof paneId === 'string' ? paneId : (state.activePaneId || 'pane-1'),
        })),
      closeChartSettings: () =>
        set({
          isChartSettingsOpen: false,
          targetSettingsPaneId: null,
        }),
      updatePaneSettings: (paneId, partial) => {
        get().pushHistory('change chart settings');
        set((state) => {
          const curPane = state.panes[paneId] || DEFAULT_PANES[paneId] || {
            id: paneId,
            symbol: state.symbol,
            timeframe: state.timeframe,
            chartType: state.chartType,
            timezone: state.timezone,
          };
          const curSettings = curPane.settings || state.chartSettings;
          const nextSettings = { ...curSettings, ...partial };
          return {
            panes: {
              ...state.panes,
              [paneId]: {
                ...curPane,
                settings: nextSettings,
              },
            },
          };
        });
      },
      updateChartSettings: (partial) => {
        get().pushHistory('change chart settings');
        set((state) => {
          const targetId = state.targetSettingsPaneId || state.activePaneId;
          if (targetId && state.panes[targetId]) {
            const curPane = state.panes[targetId];
            const curSettings = curPane.settings || state.chartSettings;
            const nextSettings = { ...curSettings, ...partial };
            return {
              panes: {
                ...state.panes,
                [targetId]: {
                  ...curPane,
                  settings: nextSettings,
                },
              },
            };
          }
          return {
            chartSettings: { ...state.chartSettings, ...partial },
          };
        });
      },
      resetChartSettings: (paneId) => {
        get().pushHistory('reset chart settings');
        set((state) => {
          const targetId = paneId || state.targetSettingsPaneId || state.activePaneId;
          if (targetId && state.panes[targetId]) {
            return {
              panes: {
                ...state.panes,
                [targetId]: {
                  ...state.panes[targetId],
                  settings: { ...DEFAULT_CHART_SETTINGS },
                },
              },
            };
          }
          return { chartSettings: { ...DEFAULT_CHART_SETTINGS } };
        });
      },
      applySettingsToAllPanes: (settings) => {
        get().pushHistory('change chart settings');
        set((state) => {
          const targetSettings =
            settings ||
            (state.targetSettingsPaneId && state.panes[state.targetSettingsPaneId]?.settings) ||
            state.chartSettings;
          const updatedPanes: Record<string, ChartPaneConfig> = {};
          for (const [id, cfg] of Object.entries(state.panes)) {
            updatedPanes[id] = {
              ...cfg,
              settings: { ...targetSettings },
            };
          }
          return {
            chartSettings: { ...targetSettings },
            panes: updatedPanes,
          };
        });
      },

      symbolLock: false,
      intervalLock: false,
      crosshairLock: true,
      dateRangeLock: false,
      trackTimeLock: true,

      syncCrosshair: null,
      syncLogicalRange: null,

      pinnedTimeframes: ['1s', '1m', '5m', '15m', '1h', '4h', '1D', '1W'],
      pinnedChartTypes: ['candles', 'line'] as ChartType[],
      showCountdownToBarClose: true,
      layoutRatios: DEFAULT_LAYOUT_RATIOS,
      isFullscreen: false,

      setIsFullscreen: (isFullscreen) => set({ isFullscreen }),
      toggleFullscreen: () => set((state) => ({ isFullscreen: !state.isFullscreen })),

      setLayoutRatios: (layout, ratios) =>
        set((state) => ({
          layoutRatios: {
            ...state.layoutRatios,
            [layout]: ratios,
          },
        })),
      resetLayoutRatios: (layout) =>
        set((state) => ({
          layoutRatios: {
            ...state.layoutRatios,
            [layout]: DEFAULT_LAYOUT_RATIOS[layout] || { cols: [1], rows: [1] },
          },
        })),

      setLayoutType: (layoutType) =>
        set((state) => {
          const neededPanes = getPanesForLayout(layoutType);
          const updatedPanes = { ...state.panes };
          // Ensure all needed panes exist with valid defaults
          neededPanes.forEach((id) => {
            const existing = updatedPanes[id];
            if (!existing) {
              updatedPanes[id] = {
                id,
                symbol: state.symbolLock ? state.symbol : (DEFAULT_PANES[id]?.symbol || state.symbol),
                timeframe: state.intervalLock ? state.timeframe : (DEFAULT_PANES[id]?.timeframe || state.timeframe),
                chartType: state.chartType,
                timezone: state.timezone,
              };
            } else {
              updatedPanes[id] = {
                ...existing,
                symbol: state.symbolLock ? state.symbol : existing.symbol,
                timeframe: state.intervalLock ? state.timeframe : existing.timeframe,
              };
            }
          });
          return {
            layoutType,
            maximizedPaneId: null,
            panes: updatedPanes,
          };
        }),

      setActivePaneId: (activePaneId) =>
        set((state) => {
          const pane = state.panes[activePaneId];
          if (pane) {
            return {
              activePaneId,
              symbol: pane.symbol,
              timeframe: pane.timeframe,
              chartType: pane.chartType,
            };
          }
          return { activePaneId };
        }),

      setMaximizedPaneId: (maximizedPaneId) => set({ maximizedPaneId }),

      toggleMaximizePane: (id) =>
        set((state) => ({
          maximizedPaneId: state.maximizedPaneId === id ? null : id,
        })),

      updatePaneConfig: (id, partial) =>
        set((state) => {
          const cur = state.panes[id] || DEFAULT_PANES[id] || {
            id,
            symbol: state.symbol,
            timeframe: state.timeframe,
            chartType: state.chartType,
            timezone: state.timezone,
          };
          const next = { ...cur, ...partial };
          const isAct = state.activePaneId === id;
          return {
            panes: { ...state.panes, [id]: next },
            ...(isAct
              ? {
                  symbol: next.symbol,
                  timeframe: next.timeframe,
                  chartType: next.chartType,
                }
              : {}),
          };
        }),

      setSymbol: (newSymbol) => {
        if (!newSymbol) return;
        const curSymbol = get().symbol;
        if (newSymbol === curSymbol) return;
        get().pushHistory('change symbol');
        set((state) => {
          if (state.symbolLock) {
            const updatedPanes: Record<string, ChartPaneConfig> = {};
            for (const [id, cfg] of Object.entries(state.panes)) {
              const validTf = getFallbackTimeframe(newSymbol, cfg.timeframe);
              updatedPanes[id] = { ...cfg, symbol: newSymbol, timeframe: validTf };
            }
            const activeTf = getFallbackTimeframe(newSymbol, state.timeframe);
            return { symbol: newSymbol, timeframe: activeTf, panes: updatedPanes };
          } else {
            const activeId = state.activePaneId || 'pane-1';
            const cur = state.panes[activeId] || {
              id: activeId,
              symbol: newSymbol,
              timeframe: state.timeframe,
              chartType: state.chartType,
              timezone: state.timezone,
            };
            const validTf = getFallbackTimeframe(newSymbol, cur.timeframe);
            return {
              symbol: newSymbol,
              timeframe: validTf,
              panes: {
                ...state.panes,
                [activeId]: { ...cur, symbol: newSymbol, timeframe: validTf },
              },
            };
          }
        });
      },

      setTimeframe: (newTimeframe) => {
        if (!newTimeframe) return;
        const activeId = get().activePaneId || 'pane-1';
        const activeSymbol = get().panes[activeId]?.symbol || get().symbol;
        if (newTimeframe === get().timeframe) return;
        if (!isTimeframeSupported(activeSymbol, newTimeframe).supported) {
          return;
        }
        get().pushHistory('change resolution');
        set((state) => {
          if (state.intervalLock) {
            const updatedPanes: Record<string, ChartPaneConfig> = {};
            for (const [id, cfg] of Object.entries(state.panes)) {
              updatedPanes[id] = { ...cfg, timeframe: newTimeframe };
            }
            return { timeframe: newTimeframe, panes: updatedPanes };
          } else {
            const cur = state.panes[activeId] || {
              id: activeId,
              symbol: state.symbol,
              timeframe: newTimeframe,
              chartType: state.chartType,
              timezone: state.timezone,
            };
            return {
              timeframe: newTimeframe,
              panes: {
                ...state.panes,
                [activeId]: { ...cur, timeframe: newTimeframe },
              },
            };
          }
        });
      },

      setChartType: (chartType) => {
        if (!chartType || chartType === get().chartType) return;
        get().pushHistory('change chart type');
        set((state) => {
          const activeId = state.activePaneId || 'pane-1';
          const cur = state.panes[activeId] || {
            id: activeId,
            symbol: state.symbol,
            timeframe: state.timeframe,
            chartType,
            timezone: state.timezone,
          };
          return {
            chartType,
            panes: {
              ...state.panes,
              [activeId]: { ...cur, chartType },
            },
          };
        });
      },

      setTimezone: (timezone) =>
        set((state) => {
          const updatedPanes: Record<string, ChartPaneConfig> = {};
          for (const [id, cfg] of Object.entries(state.panes)) {
            updatedPanes[id] = { ...cfg, timezone };
          }
          return { timezone, panes: updatedPanes };
        }),

      setSyncCrosshair: (syncCrosshair) => set({ syncCrosshair }),
      setSyncLogicalRange: (syncLogicalRange) => set({ syncLogicalRange }),

      setActiveTool: (activeTool) => set({ activeTool }),
      setCursorType: (cursorType) => set({ cursorType }),
      cycleMagnetMode: () =>
        set((state) => {
          const next: Record<MagnetMode, MagnetMode> = {
            none: 'weak',
            weak: 'strong',
            strong: 'none',
          };
          return { magnetMode: next[state.magnetMode] };
        }),
      setMagnetMode: (magnetMode) => set({ magnetMode }),
      toggleDrawingsLocked: () => set((state) => ({ drawingsLocked: !state.drawingsLocked })),
      toggleDrawingsHidden: () => set((state) => ({ drawingsHidden: !state.drawingsHidden })),

      syncDrawingsAcrossCharts: (() => {
        try {
          return localStorage.getItem('ordercraft_sync_drawings_across_charts') === 'true';
        } catch {
          return false;
        }
      })(),
      toggleSyncDrawingsAcrossCharts: () =>
        set((state) => {
          const next = !state.syncDrawingsAcrossCharts;
          try {
            localStorage.setItem('ordercraft_sync_drawings_across_charts', String(next));
          } catch {
            // ignore
          }
          return { syncDrawingsAcrossCharts: next };
        }),
      setSyncDrawingsAcrossCharts: (syncDrawingsAcrossCharts) => {
        try {
          localStorage.setItem('ordercraft_sync_drawings_across_charts', String(syncDrawingsAcrossCharts));
        } catch {
          // ignore
        }
        set({ syncDrawingsAcrossCharts });
      },

      addDrawing: (drawing) => {
        if (!drawing || !drawing.id || !Array.isArray(drawing.anchors) || drawing.anchors.length === 0) {
          return;
        }
        get().pushHistory('add drawing');
        set((state) => {
          return {
            drawings: [...state.drawings.filter((d) => d.id !== drawing.id), drawing],
          };
        });
      },
      isSymbolLoaded: (cacheKey: string) => {
        return !!get().loadedSymbols[cacheKey];
      },
      markSymbolLoading: (cacheKey) =>
        set((state) => ({
          loadedSymbols: { ...state.loadedSymbols, [cacheKey]: true },
        })),
      loadDrawingsForSymbol: (symbol, newDrawings, cacheKey) =>
        set((state) => {
          const deleted = state.deletedDrawingIds || {};
          const validNew = newDrawings.filter(
            (d) => !deleted[d.id] && d && d.id && Array.isArray(d.anchors) && d.anchors.length > 0
          );
          const existingMap = new Map(state.drawings.map((d) => [d.id, d]));
          for (const d of validNew) {
            const tagged = { ...d, symbol: d.symbol || symbol };
            if (!existingMap.has(tagged.id)) {
              existingMap.set(tagged.id, tagged);
            }
          }
          const nextLoaded = cacheKey
            ? { ...state.loadedSymbols, [cacheKey]: true }
            : state.loadedSymbols;
          return {
            drawings: Array.from(existingMap.values()),
            loadedSymbols: nextLoaded,
          };
        }),
      setDrawings: (drawings) => set({ drawings }),
      updateDrawing: (id, partial) => {
        const cur = get().drawings.find((d) => d.id === id);
        if (!cur) return;
        get().pushHistory('modify drawing');
        set((state) => ({
          drawings: state.drawings.map((d) =>
            d.id === id
              ? {
                  ...d,
                  ...partial,
                  options:
                    d.options && partial.options
                      ? { ...d.options, ...partial.options }
                      : partial.options ?? d.options,
                }
              : d
          ),
        }));
      },
      deleteDrawing: (id) => {
        const cur = get().drawings.find((d) => d.id === id);
        if (!cur) return;
        get().pushHistory('remove drawing');
        set((state) => ({
          drawings: state.drawings.filter((d) => d.id !== id),
          deletedDrawingIds: { ...state.deletedDrawingIds, [id]: true },
          selectedDrawingId: state.selectedDrawingId === id ? null : state.selectedDrawingId,
        }));
      },
      clearDrawings: (symbol, paneId, removeLocked = false) => {
        if (get().drawings.length === 0) return;
        get().pushHistory('remove all drawings');
        set((state) => {
          const newlyDeleted: Record<string, boolean> = {};
          const nextDrawings = state.drawings.filter((d) => {
            if (symbol && d.symbol && d.symbol !== symbol) {
              return true;
            }
            if (paneId && !state.syncDrawingsAcrossCharts) {
              const drawingPaneId = d.paneId || 'pane-1';
              if (drawingPaneId !== paneId) {
                return true;
              }
            }

            if (!removeLocked && (d.locked || state.drawingsLocked)) {
              return true;
            }

            newlyDeleted[d.id] = true;
            return false;
          });

          return {
            drawings: nextDrawings,
            deletedDrawingIds: { ...state.deletedDrawingIds, ...newlyDeleted },
            selectedDrawingId: null,
            activeTool: 'cursor',
          };
        });
      },
      setSelectedDrawingId: (selectedDrawingId) => set({ selectedDrawingId }),
      duplicateDrawing: (id) => {
        const original = get().drawings.find((d) => d.id === id);
        if (!original) return;
        get().pushHistory('duplicate drawing');
        set((state) => {
          const original = state.drawings.find((d) => d.id === id);
          if (!original) return {};
          const newId = `draw_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
          // Offset duplicate slightly so it's clearly visible
          const clonedAnchors = original.anchors.map((a) => ({
            time: a.time,
            price: a.price * 1.002, // 0.2% price offset
          }));
          const cloned: UserDrawing = {
            ...original,
            id: newId,
            anchors: clonedAnchors,
          };
          return {
            drawings: [...state.drawings, cloned],
            selectedDrawingId: newId,
          };
        });
      },
      toggleDrawingLock: (id) => {
        const cur = get().drawings.find((d) => d.id === id);
        if (!cur) return;
        get().pushHistory('toggle drawing lock');
        set((state) => ({
          drawings: state.drawings.map((d) => (d.id === id ? { ...d, locked: !d.locked } : d)),
        }));
      },
      toggleDrawingVisibility: (id) => {
        const cur = get().drawings.find((d) => d.id === id);
        if (!cur) return;
        get().pushHistory('toggle drawing visibility');
        set((state) => ({
          drawings: state.drawings.map((d) => (d.id === id ? { ...d, hidden: !d.hidden } : d)),
          selectedDrawingId: state.selectedDrawingId === id ? null : state.selectedDrawingId,
        }));
      },

      setLayout: (layoutId, layoutName) =>
        set({
          layoutId,
          layoutName,
          drawings: [],
          loadedSymbols: {},
          deletedDrawingIds: {},
          historyPast: [],
          historyFuture: [],
          canUndo: false,
          canRedo: false,
          undoDescription: null,
          redoDescription: null,
        }),
      saveCurrentLayout: async () => {
        const state = get();
        const payload = {
          version: 2,
          layoutType: state.layoutType,
          layoutRatios: state.layoutRatios,
          activePaneId: state.activePaneId,
          panes: state.panes,
          indicators: state.indicators,
          chartSettings: state.chartSettings,
          symbol: state.symbol,
          timeframe: state.timeframe,
          chartType: state.chartType,
          timezone: state.timezone,
          symbolLock: state.symbolLock,
          intervalLock: state.intervalLock,
          crosshairLock: state.crosshairLock,
          dateRangeLock: state.dateRangeLock,
          trackTimeLock: state.trackTimeLock,
          timestamp: Date.now(),
        };
        set({ isSavingLayout: true });
        try {
          const savedId = await transport.saveLayout(
            state.layoutId,
            state.layoutName,
            state.symbol,
            state.timeframe,
            JSON.stringify(payload)
          );
          set({ isSavingLayout: false, lastSavedTimestamp: Date.now() });
          return savedId;
        } catch (err) {
          set({ isSavingLayout: false });
          throw err;
        }
      },
      loadLayoutById: async (targetId: string, targetName: string) => {
        try {
          const rawContent = await transport.getLayoutContent(targetId);
          if (rawContent) {
            try {
              const parsed = JSON.parse(rawContent);

              // 1. Layout Type & Ratios
              if (parsed.layoutType) {
                get().setLayoutType(parsed.layoutType);
              }
              if (parsed.layoutRatios) {
                set({ layoutRatios: parsed.layoutRatios });
              }

              // 2. Panes & Active Pane
              if (parsed.panes && typeof parsed.panes === 'object') {
                set({ panes: parsed.panes });
              }
              if (parsed.activePaneId && parsed.panes?.[parsed.activePaneId]) {
                get().setActivePaneId(parsed.activePaneId);
              }

              // 3. Indicators (All Panes)
              if (parsed.indicators && typeof parsed.indicators === 'object') {
                set({ indicators: parsed.indicators });
              }

              // 4. Chart Visual Settings
              if (parsed.chartSettings && typeof parsed.chartSettings === 'object') {
                set({ chartSettings: parsed.chartSettings });
              }

              // 5. Active Symbol, Timeframe, ChartType, Timezone
              if (parsed.symbol) {
                get().setSymbol(parsed.symbol);
              }
              if (parsed.timeframe) {
                get().setTimeframe(parsed.timeframe);
              }
              if (parsed.chartType) {
                get().setChartType(parsed.chartType);
              }
              if (parsed.timezone) {
                get().setTimezone(parsed.timezone);
              }

              // 6. Multi-chart Locks
              set({
                symbolLock: Boolean(parsed.symbolLock),
                intervalLock: Boolean(parsed.intervalLock),
                crosshairLock: Boolean(parsed.crosshairLock),
                dateRangeLock: Boolean(parsed.dateRangeLock),
                trackTimeLock: Boolean(parsed.trackTimeLock),
              });
            } catch (parseErr) {
              console.warn('Failed to parse layout content JSON:', parseErr);
            }
          }

          // 7. Update layout identity & clear drawing caches to trigger re-fetch for new layout
          get().setLayout(targetId, targetName);
          set({ lastSavedTimestamp: Date.now() });
          return true;
        } catch (err) {
          console.error('Failed to load layout:', err);
          throw err;
        }
      },
      createNewLayout: async (newName: string) => {
        const newId = `layout_${Date.now()}`;
        const state = get();
        const payload = {
          version: 2,
          layoutType: state.layoutType,
          layoutRatios: state.layoutRatios,
          activePaneId: state.activePaneId,
          panes: state.panes,
          indicators: state.indicators,
          chartSettings: state.chartSettings,
          symbol: state.symbol,
          timeframe: state.timeframe,
          chartType: state.chartType,
          timezone: state.timezone,
          symbolLock: state.symbolLock,
          intervalLock: state.intervalLock,
          crosshairLock: state.crosshairLock,
          dateRangeLock: state.dateRangeLock,
          trackTimeLock: state.trackTimeLock,
          timestamp: Date.now(),
        };
        await transport.saveLayout(newId, newName, state.symbol, state.timeframe, JSON.stringify(payload));
        get().setLayout(newId, newName);
        set({ lastSavedTimestamp: Date.now() });
        return newId;
      },
      cloneCurrentLayout: async (copyName: string) => {
        const newId = `layout_${Date.now()}`;
        const state = get();
        const payload = {
          version: 2,
          layoutType: state.layoutType,
          layoutRatios: state.layoutRatios,
          activePaneId: state.activePaneId,
          panes: state.panes,
          indicators: state.indicators,
          chartSettings: state.chartSettings,
          symbol: state.symbol,
          timeframe: state.timeframe,
          chartType: state.chartType,
          timezone: state.timezone,
          symbolLock: state.symbolLock,
          intervalLock: state.intervalLock,
          crosshairLock: state.crosshairLock,
          dateRangeLock: state.dateRangeLock,
          trackTimeLock: state.trackTimeLock,
          timestamp: Date.now(),
        };
        await transport.saveLayout(newId, copyName, state.symbol, state.timeframe, JSON.stringify(payload));
        get().setLayout(newId, copyName);
        set({ lastSavedTimestamp: Date.now() });
        return newId;
      },
      renameCurrentLayout: async (newName: string) => {
        const state = get();
        await transport.updateLayoutMeta(state.layoutId, { name: newName });
        set({ layoutName: newName });
      },
      toggleLayoutAutosave: () => set((state) => ({ layoutAutosave: !state.layoutAutosave })),
      setLayoutAutosave: (val: boolean) => set({ layoutAutosave: val }),
      openLayoutModal: () => set({ isLayoutModalOpen: true }),
      closeLayoutModal: () => set({ isLayoutModalOpen: false }),
      openObjectTree: () => set({ isObjectTreeOpen: true }),
      closeObjectTree: () => set({ isObjectTreeOpen: false }),
      toggleObjectTree: () => set((state) => ({ isObjectTreeOpen: !state.isObjectTreeOpen })),
      openCommandPalette: (initialQuery = '') =>
        set((state) => {
          const q = initialQuery.toUpperCase();
          if (state.isCommandPaletteOpen) {
            return {
              commandPaletteInitialQuery:
                q && q.length === 1
                  ? (state.commandPaletteInitialQuery + q)
                  : (q || state.commandPaletteInitialQuery),
            };
          }
          return {
            isCommandPaletteOpen: true,
            commandPaletteInitialQuery: q,
          };
        }),
      closeCommandPalette: () => set({ isCommandPaletteOpen: false, commandPaletteInitialQuery: '' }),
      openIntervalModal: (initialQuery = '') =>
        set((state) => {
          if (state.isIntervalModalOpen) {
            return {
              intervalModalInitialQuery:
                initialQuery && initialQuery.length === 1
                  ? (state.intervalModalInitialQuery + initialQuery)
                  : (initialQuery || state.intervalModalInitialQuery),
            };
          }
          return {
            isIntervalModalOpen: true,
            intervalModalInitialQuery: initialQuery,
          };
        }),
      closeIntervalModal: () => set({ isIntervalModalOpen: false, intervalModalInitialQuery: '' }),
      toggleLock: (lock) =>
        set((state) => {
          if (lock === 'symbolLock') {
            const activeSymbol = state.symbol;
            const hasDivergent = Object.values(state.panes).some((p) => p.symbol !== activeSymbol);
            // If symbols are divergent OR symbolLock is currently off: sync all panes immediately and lock!
            if (!state.symbolLock || hasDivergent) {
              const updatedPanes: Record<string, ChartPaneConfig> = {};
              for (const [id, cfg] of Object.entries(state.panes)) {
                updatedPanes[id] = { ...cfg, symbol: activeSymbol };
              }
              return { symbolLock: true, panes: updatedPanes };
            }
            return { symbolLock: false };
          }
          if (lock === 'intervalLock') {
            const activeTf = state.timeframe;
            const hasDivergent = Object.values(state.panes).some((p) => p.timeframe !== activeTf);
            // If timeframes are divergent OR intervalLock is currently off: sync all panes immediately and lock!
            if (!state.intervalLock || hasDivergent) {
              const updatedPanes: Record<string, ChartPaneConfig> = {};
              for (const [id, cfg] of Object.entries(state.panes)) {
                updatedPanes[id] = { ...cfg, timeframe: activeTf };
              }
              return { intervalLock: true, panes: updatedPanes };
            }
            return { intervalLock: false };
          }
          return { [lock]: !state[lock] };
        }),
      setPinnedTimeframes: (pinnedTimeframes) =>
        set({
          pinnedTimeframes: [...pinnedTimeframes].sort(
            (a, b) => getTimeframeSeconds(a) - getTimeframeSeconds(b)
          ),
        }),
      togglePinTimeframe: (tf) =>
        set((state) => {
          const exists = state.pinnedTimeframes.includes(tf);
          const next = exists
            ? state.pinnedTimeframes.filter((t) => t !== tf)
            : [...state.pinnedTimeframes, tf];
          next.sort((a, b) => getTimeframeSeconds(a) - getTimeframeSeconds(b));
          return { pinnedTimeframes: next };
        }),
      togglePinChartType: (ct) =>
        set((state) => {
          const exists = state.pinnedChartTypes.includes(ct);
          const next = exists
            ? state.pinnedChartTypes.filter((t) => t !== ct)
            : [...state.pinnedChartTypes, ct];
          return { pinnedChartTypes: next };
        }),
      toggleCountdownToBarClose: () =>
        set((state) => ({ showCountdownToBarClose: !state.showCountdownToBarClose })),

      // Starred / Favorite Drawings Bar
      favoriteDrawingTools: [] as FavoriteItemType[],
      showFavoriteDrawingsBar: true,
      toggleFavoriteDrawingTool: (tool) =>
        set((state) => {
          const exists = state.favoriteDrawingTools.includes(tool);
          const next = exists
            ? state.favoriteDrawingTools.filter((t) => t !== tool)
            : [...state.favoriteDrawingTools, tool];
          const shouldShow = !exists ? true : state.showFavoriteDrawingsBar;
          return { favoriteDrawingTools: next, showFavoriteDrawingsBar: shouldShow };
        }),
      setFavoriteDrawingTools: (tools) => set({ favoriteDrawingTools: tools }),
      toggleShowFavoriteDrawingsBar: () =>
        set((state) => ({ showFavoriteDrawingsBar: !state.showFavoriteDrawingsBar })),
      setShowFavoriteDrawingsBar: (show) => set({ showFavoriteDrawingsBar: show }),

      // Technical Indicators
      indicators: {
        'pane-1': [createDefaultVolumeIndicator('pane-1')],
      },
      favoriteIndicators: ['volume', 'sma', 'bollinger_bands', 'rsi', 'macd', 'supertrend'],
      isIndicatorsModalOpen: false,
      activeSettingsIndicator: null,

      openIndicatorsModal: () => set({ isIndicatorsModalOpen: true }),
      closeIndicatorsModal: () => set({ isIndicatorsModalOpen: false }),

      openIndicatorSettings: (paneId: string, indicatorId: string) =>
        set({ activeSettingsIndicator: { paneId, indicatorId } }),
      closeIndicatorSettings: () => set({ activeSettingsIndicator: null }),

      addIndicatorToPane: (paneId: string, type: IndicatorType) => {
        const def = INDICATOR_REGISTRY[type];
        if (!def) throw new Error(`Unknown indicator type: ${type}`);

        get().pushHistory('add indicator');
        const instanceId = `ind_${type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const instance: IndicatorInstance = {
          id: instanceId,
          type,
          paneId,
          name: def.shortName,
          category: def.category,
          visible: true,
          inputs: { ...def.defaultInputs },
          styles: JSON.parse(JSON.stringify(def.defaultStyles)),
          levels: def.defaultLevels ? JSON.parse(JSON.stringify(def.defaultLevels)) : undefined,
          bands: def.defaultBands ? JSON.parse(JSON.stringify(def.defaultBands)) : undefined,
        };

        set((state) => {
          const currentList = state.indicators[paneId] || [];
          return {
            indicators: {
              ...state.indicators,
              [paneId]: [...currentList, instance],
            },
          };
        });

        return instance;
      },

      removeIndicatorFromPane: (paneId: string, indicatorId: string) => {
        const currentList = get().indicators[paneId] || [];
        if (!currentList.some((ind) => ind.id === indicatorId)) return;
        get().pushHistory('remove indicator');
        set((state) => {
          const currentList = state.indicators[paneId] || [];
          const updated = currentList.filter((ind) => ind.id !== indicatorId);
          return {
            indicators: {
              ...state.indicators,
              [paneId]: updated,
            },
          };
        });
      },

      clearIndicatorsFromPane: (paneId: string) => {
        const currentList = get().indicators[paneId] || [];
        if (currentList.length === 0) return;
        get().pushHistory('remove all indicators');
        set((state) => ({
          indicators: {
            ...state.indicators,
            [paneId]: [],
          },
        }));
      },

      swapIndicators: (paneId: string, id1: string, id2: string) => {
        const list = get().indicators[paneId] || [];
        if (!list.some((i) => i.id === id1) || !list.some((i) => i.id === id2)) return;
        get().pushHistory('reorder indicators');
        set((state) => {
          const list = [...(state.indicators[paneId] || [])];
          const idx1 = list.findIndex((i) => i.id === id1);
          const idx2 = list.findIndex((i) => i.id === id2);
          if (idx1 === -1 || idx2 === -1) return state;
          const temp = list[idx1];
          list[idx1] = list[idx2];
          list[idx2] = temp;
          return {
            indicators: {
              ...state.indicators,
              [paneId]: list,
            },
          };
        });
      },

      updateIndicatorInputs: (paneId: string, indicatorId: string, inputs: Record<string, any>) => {
        get().pushHistory('modify indicator settings');
        set((state) => {
          const currentList = state.indicators[paneId] || [];
          const updated = currentList.map((ind) =>
            ind.id === indicatorId ? { ...ind, inputs: { ...ind.inputs, ...inputs } } : ind
          );
          return {
            indicators: {
              ...state.indicators,
              [paneId]: updated,
            },
          };
        });
      },

      updateIndicatorStyles: (paneId: string, indicatorId: string, styles: Record<string, IndicatorPlotStyle>) => {
        get().pushHistory('modify indicator settings');
        set((state) => {
          const currentList = state.indicators[paneId] || [];
          const updated = currentList.map((ind) =>
            ind.id === indicatorId ? { ...ind, styles: { ...ind.styles, ...styles } } : ind
          );
          return {
            indicators: {
              ...state.indicators,
              [paneId]: updated,
            },
          };
        });
      },

      toggleIndicatorVisibility: (paneId: string, indicatorId: string) => {
        get().pushHistory('toggle indicator visibility');
        set((state) => {
          const currentList = state.indicators[paneId] || [];
          const updated = currentList.map((ind) =>
            ind.id === indicatorId ? { ...ind, visible: !ind.visible } : ind
          );
          return {
            indicators: {
              ...state.indicators,
              [paneId]: updated,
            },
          };
        });
      },

      toggleFavoriteIndicator: (type: string) =>
        set((state) => {
          const exists = state.favoriteIndicators.includes(type);
          const next = exists
            ? state.favoriteIndicators.filter((t) => t !== type)
            : [...state.favoriteIndicators, type];
          return { favoriteIndicators: next };
        }),

      // Right Sidebar & Tools
      activeRightSidebarTab: null,
      rightSidebarWidth: 340,
      setActiveRightSidebarTab: (tab: RightSidebarTab) => set({ activeRightSidebarTab: tab }),
      toggleRightSidebarTab: (tab: RightSidebarTab) =>
        set((state) => ({
          activeRightSidebarTab: state.activeRightSidebarTab === tab ? null : tab,
        })),
      setRightSidebarWidth: (width: number) =>
        set({ rightSidebarWidth: Math.max(280, Math.min(600, width)) }),

      // Watchlists
      watchlists: DEFAULT_WATCHLISTS,
      activeWatchlistId: 'watchlist-main',
      watchlistTableSettings: DEFAULT_WATCHLIST_TABLE_SETTINGS,
      setWatchlistTableSettings: (partial) =>
        set((state) => ({
          watchlistTableSettings: { ...state.watchlistTableSettings, ...partial },
        })),
      setActiveWatchlistId: (id: string) => set({ activeWatchlistId: id }),
      addSymbolToWatchlist: (watchlistId: string, symbol: string, group = 'WATCHLIST', name?: string) =>
        set((state) => {
          const targetWl = state.watchlists.find((w) => w.id === watchlistId);
          if (!targetWl) return state;
          if (targetWl.items.some((it) => it.symbol.toUpperCase() === symbol.toUpperCase())) return state;

          const updated = state.watchlists.map((w) => {
            if (w.id !== watchlistId) return w;
            return {
              ...w,
              items: [
                ...w.items,
                {
                  symbol: symbol.toUpperCase(),
                  name: name || symbol.toUpperCase(),
                  group: group.toUpperCase(),
                  lastPrice: undefined,
                  change: undefined,
                  changePct: undefined,
                  volume: undefined,
                },
              ],
            };
          });
          return { watchlists: updated };
        }),
      removeSymbolFromWatchlist: (watchlistId: string, symbol: string) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) => {
            if (w.id !== watchlistId) return w;
            return {
              ...w,
              items: w.items.filter((it) => it.symbol !== symbol),
            };
          }),
        })),
      createWatchlist: (name: string) =>
        set((state) => {
          const newWl: Watchlist = {
            id: `watchlist_${Date.now()}`,
            name: name.trim() || 'New Watchlist',
            items: [],
          };
          return {
            watchlists: [...state.watchlists, newWl],
            activeWatchlistId: newWl.id,
          };
        }),
      deleteWatchlist: (watchlistId: string) =>
        set((state) => {
          if (state.watchlists.length <= 1) return state; // preserve at least one
          const remaining = state.watchlists.filter((w) => w.id !== watchlistId);
          return {
            watchlists: remaining,
            activeWatchlistId: remaining[0].id,
          };
        }),
      renameWatchlist: (watchlistId: string, newName: string) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) =>
            w.id === watchlistId ? { ...w, name: newName.trim() || w.name } : w
          ),
        })),
      clearWatchlist: (watchlistId: string) =>
        set((state) => ({
          watchlists: state.watchlists.map((w) =>
            w.id === watchlistId ? { ...w, items: [] } : w
          ),
        })),
      sortWatchlist: (watchlistId: string, mode) =>
        set((state) => {
          const updated = state.watchlists.map((w) => {
            if (w.id !== watchlistId) return w;
            const sortedItems = [...w.items].sort((a, b) => {
              switch (mode) {
                case 'symbol_asc':
                  return a.symbol.localeCompare(b.symbol);
                case 'symbol_desc':
                  return b.symbol.localeCompare(a.symbol);
                case 'chg_asc':
                  return (a.changePct ?? 0) - (b.changePct ?? 0);
                case 'chg_desc':
                  return (b.changePct ?? 0) - (a.changePct ?? 0);
                case 'vol_desc':
                  return (b.volume ?? 0) - (a.volume ?? 0);
                case 'price_desc':
                  return (b.lastPrice ?? 0) - (a.lastPrice ?? 0);
                default:
                  return 0;
              }
            });
            return { ...w, items: sortedItems };
          });
          return { watchlists: updated };
        }),
      updateWatchlistTick: (symbol: string, price: number, change?: number, changePct?: number, volume?: number, name?: string) =>
        set((state) => {
          let hasChanged = false;
          const sUpper = symbol.toUpperCase();
          const updated = state.watchlists.map((w) => {
            let itemChanged = false;
            const nextItems = w.items.map((it) => {
              const itUpper = it.symbol.toUpperCase();
              // Direct match or partial ticker match
              const matches =
                itUpper === sUpper ||
                itUpper.replace('OANDA:', '') === sUpper.replace('OANDA:', '') ||
                itUpper.replace('BINANCE:', '') === sUpper.replace('BINANCE:', '');

              if (matches) {
                itemChanged = true;
                hasChanged = true;
                return {
                  ...it,
                  name: name || it.name,
                  prevPrice: it.lastPrice,
                  lastPrice: price,
                  change: change !== undefined ? change : it.change,
                  changePct: changePct !== undefined ? changePct : it.changePct,
                  volume: volume !== undefined ? volume : it.volume,
                  lastUpdated: Date.now(),
                };
              }
              return it;
            });
            return itemChanged ? { ...w, items: nextItems } : w;
          });
          return hasChanged ? { watchlists: updated } : state;
        }),

      // Alerts
      alerts: [] as AlertItem[],
      alertLogs: [] as AlertLogItem[],
      addAlert: (alertData) =>
        set((state) => {
          const newAlert: AlertItem = {
            ...alertData,
            id: `alert_${Date.now()}`,
            createdAt: Date.now(),
            active: true,
          };
          return { alerts: [newAlert, ...state.alerts] };
        }),
      removeAlert: (id: string) =>
        set((state) => ({
          alerts: state.alerts.filter((a) => a.id !== id),
        })),
      toggleAlertActive: (id: string) =>
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === id ? { ...a, active: !a.active } : a
          ),
        })),
      triggerAlert: (alertId: string, triggerPrice: number) =>
        set((state) => {
          const alert = state.alerts.find((a) => a.id === alertId);
          if (!alert) return state;
          const newLog: AlertLogItem = {
            id: `log_${Date.now()}`,
            alertId,
            symbol: alert.symbol,
            condition: alert.condition,
            triggerPrice,
            timestamp: Date.now(),
          };
          return {
            alerts: state.alerts.map((a) =>
              a.id === alertId ? { ...a, active: false, triggeredAt: Date.now() } : a
            ),
            alertLogs: [newLog, ...state.alertLogs],
          };
        }),
      clearAlertLogs: () => set({ alertLogs: [] }),
    }),
    {
      name: 'ordercraft_workspace_sync_v2',
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>;
        if (version < 2 && state) {
          if (state.timezone === 'UTC+5:30') {
            state.timezone = 'UTC-4';
          }
          const panes = state.panes as Record<string, ChartPaneConfig> | undefined;
          if (panes && typeof panes === 'object') {
            for (const key of Object.keys(panes)) {
              if (panes[key]?.timezone === 'UTC+5:30') {
                panes[key] = { ...panes[key], timezone: 'UTC-4' };
              }
            }
          }
        }
        return state as unknown as SyncStoreState;
      },
      partialize: (state) => ({
        layoutType: state.layoutType,
        layoutId: state.layoutId,
        layoutName: state.layoutName,
        layoutAutosave: state.layoutAutosave,
        activePaneId: state.activePaneId,
        panes: state.panes,
        symbol: state.symbol,
        timeframe: state.timeframe,
        chartType: state.chartType,
        timezone: state.timezone,
        symbolLock: state.symbolLock,
        intervalLock: state.intervalLock,
        crosshairLock: state.crosshairLock,
        dateRangeLock: state.dateRangeLock,
        trackTimeLock: state.trackTimeLock,
        pinnedTimeframes: state.pinnedTimeframes,
        pinnedChartTypes: state.pinnedChartTypes,
        showCountdownToBarClose: state.showCountdownToBarClose,
        cursorType: state.cursorType,
        layoutRatios: state.layoutRatios,
        chartSettings: state.chartSettings,
        favoriteDrawingTools: state.favoriteDrawingTools,
        showFavoriteDrawingsBar: state.showFavoriteDrawingsBar,
        indicators: state.indicators,
        favoriteIndicators: state.favoriteIndicators,
        rightSidebarWidth: state.rightSidebarWidth,
        watchlists: state.watchlists,
        activeWatchlistId: state.activeWatchlistId,
        watchlistTableSettings: state.watchlistTableSettings,
        alerts: state.alerts,
        alertLogs: state.alertLogs,
      }),
    }
  )
);
