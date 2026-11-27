// ORDERCRAFT Dual-Mode Transport Client
// Conforms strictly to Dual-Mode Transport Invariant (docs/architecture/MASTER_PLAN.md):
// All frontend-to-backend communication MUST go through this file.
// Abstracts desktop runtime vs. Browser Web mode seamlessly.

export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FootprintPriceLevel {
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
  levels: FootprintPriceLevel[];
}

export interface SymbolInfo {
  symbol: string;
  full_symbol: string;
  description: string;
  exchange: string;
  type: string;
  price_scale: number;
}

export interface LayoutMetadata {
  id: string;
  name: string;
  symbol: string;
  resolution: string;
  timestamp: number;
  is_favorite?: boolean;
}

export interface DrawingData {
  id: string;
  layout_id: string;
  tool_type: string;
  symbol: string;
  data: string; // JSON serialized logical anchors [{time, price}] & style
  timestamp?: number;
}

export interface DrawingTemplateData {
  id: string;
  name: string;
  tool_type: string;
  settings: string; // JSON serialized DrawingTemplateSettings
  created_at?: number;
}

export interface ChartTemplateData {
  id: string;
  name: string;
  settings: string; // JSON serialized ChartVisualSettings
  created_at?: number;
}

export interface ImbalanceRuleData {
  id: string;
  name: string;
  settings: string; // JSON serialized ImbalanceRule
  created_at?: number;
}

export interface IndicatorEvalInstanceConfig {
  instanceId: string;
  indicatorId: string;
  inputs?: Record<string, unknown>;
}

export interface IndicatorEvalRequestPayload {
  symbol: string;
  resolution: string;
  candles?: Candle[];
  indicators: IndicatorEvalInstanceConfig[];
}

export interface IndicatorEvalResultPlotPoint {
  time: number;
  value: number;
  color?: string;
}

export interface IndicatorEvalResultItem {
  instanceId: string;
  indicatorId: string;
  plots: Record<string, IndicatorEvalResultPlotPoint[]>;
}

export interface IndicatorEvalResponsePayload {
  symbol: string;
  resolution: string;
  results: IndicatorEvalResultItem[];
}

export interface ServerTimeResponse {
  server_time?: number;
  server_time_ms?: number;
}

export interface ProviderInfo {
  id: string;
  name: string;
  status: string;
  type: string;
  dataTier?: 'L1' | 'L2' | string;
  latencyMs?: number;
  supportedIntervals?: string[];
  docUrl?: string;
  accountId?: string;
  maskedApiKey?: string;
  hasKey?: boolean;
  hasSecret?: boolean;
  savedSecret?: string;
}

export interface IntegrationInfo {
  id: string;
  name: string;
  category: string;
  authType: string;
  status: string;
  dataTier?: 'L1' | 'L2' | string;
  docUrl?: string;
  accountId?: string;
  maskedApiKey?: string;
  hasKey?: boolean;
  hasSecret?: boolean;
  savedSecret?: string;
}

export interface ProvidersStatusResponse {
  providers?: ProviderInfo[];
  availableIntegrations?: IntegrationInfo[];
}

export interface ProviderConfigurePayload {
  provider: string;
  accountId?: string;
  apiKey?: string;
  apiSecret?: string;
}

export interface WatchlistQuoteItem {
  symbol: string;
  originalKey?: string;
  price: number;
  change?: number;
  changePct?: number;
  volume?: number;
  name?: string;
}

export interface WatchlistSearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
}

export interface MoverItem {
  symbol: string;
  name?: string;
  lastPrice: number;
  change: number;
  changePct: number;
  high?: number;
  low?: number;
  volumeQuote: number;
}

export interface MoverCategoryInfo {
  id: string;
  name: string;
  description?: string;
  group: string;
}

export interface MoversResponse {
  gainers: MoverItem[];
  losers: MoverItem[];
  volume: MoverItem[];
  categories?: MoverCategoryInfo[];
}

export interface NewsArticle {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  description: string;
  publishedAt?: number;
}

export interface CalendarEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
  actual?: string;
}

export interface ScriptSavePayload {
  id: string;
  name: string;
  code: string;
  permissions: string[];
}

export interface UserScriptRecord {
  id: string;
  name: string;
  code: string;
  permissions?: string[];
  created_at?: number;
  updated_at?: number;
}

export interface ScriptEvalRequestPayload {
  code: string;
  symbol: string;
  resolution: string;
  candles?: Candle[];
  permissions?: string[];
}

export interface ScriptEvalPlotDirective {
  id: string;
  title?: string;
  type: string;
  color?: string;
  colorUp?: string;
  colorDown?: string;
  lineWidth?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  overlay?: boolean;
}

export interface ScriptEvalBandDirective {
  id: string;
  plot1: string;
  plot2: string;
  color?: string;
  opacity?: number;
}

export interface ScriptEvalResponsePayload {
  success: boolean;
  plots?: Record<string, IndicatorEvalResultPlotPoint[]>;
  directives?: ScriptEvalPlotDirective[];
  bands?: ScriptEvalBandDirective[];
  logs: string[];
  executionTimeMs: number;
  error?: string;
}

export interface IndicatorStreamUpdate {
  type: 'indicator_update';
  symbol: string;
  resolution: string;
  time: number;
  plots: Record<string, Record<string, number>>;
}

export interface IndicatorStreamSubscriptionParams {
  symbol: string;
  resolution: string;
  indicators: IndicatorEvalInstanceConfig[];
  candles?: Candle[];
  onUpdate: (update: IndicatorStreamUpdate) => void;
}

export interface LiveKlineSubscriptionOptions {
  immediate?: boolean;
}

interface LiveKlineSubscriptionEntry {
  callback: (candle: Candle) => void;
  immediate: boolean;
}

interface IndicatorStreamEntry {
  id: string;
  symbol: string;
  resolution: string;
  indicators: IndicatorEvalInstanceConfig[];
  candles?: Candle[];
  onUpdate: (update: IndicatorStreamUpdate) => void;
}

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  mozCancelFullScreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
  mozRequestFullScreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
}

declare global {
  interface Window {
    runtime?: {
      WindowMinimise?: () => void;
      WindowMaximise?: () => void;
      WindowToggleMaximise?: () => void;
      WindowFullscreen?: () => void;
      WindowUnfullscreen?: () => void;
      WindowIsFullscreen?: () => Promise<boolean>;
      WindowClose?: () => void;
      Quit?: () => void;
    };
  }
}

const WS_HEARTBEAT_INTERVAL_MS = 25_000;
const WS_RECONNECT_BASE_MS = 1_000;
const WS_RECONNECT_MAX_MS = 30_000;

export function computeReconnectDelayMs(attempt: number): number {
  const cappedExponent = Math.min(attempt, 10);
  const baseMs = Math.min(WS_RECONNECT_MAX_MS, WS_RECONNECT_BASE_MS * Math.pow(2, cappedExponent));
  const jitterFactor = 0.8 + Math.random() * 0.4; // +/- 20% jitter
  return Math.min(WS_RECONNECT_MAX_MS, Math.max(250, Math.round(baseMs * jitterFactor)));
}

function unrefTimer(timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>): void {
  const maybeUnref = timer as unknown as { unref?: () => void };
  if (typeof maybeUnref.unref === 'function') {
    maybeUnref.unref();
  }
}

export class TransportClient {
  private apiBase: string;

  constructor() {
    // In Vite dev mode, '/api' is proxied to Go backend (port 8080)
    // In production or self-hosted, it uses current origin or localhost
    this.apiBase = '/api';

    // Auto-reconnect WebSockets if dropped or frozen while tab/window was backgrounded
    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
      const handleWake = () => {
        if (document.visibilityState === 'visible') {
          if (
            (this.wsSubscribers.size > 0 || this.wsFootprintSubscribers.size > 0) &&
            (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING)
          ) {
            this.connectWs();
          }
          if (
            this.indicatorStreamSubs.size > 0 &&
            (!this.indicatorWs ||
              this.indicatorWs.readyState === WebSocket.CLOSED ||
              this.indicatorWs.readyState === WebSocket.CLOSING)
          ) {
            this.connectIndicatorWs();
          }
        }
      };
      document.addEventListener('visibilitychange', handleWake);
      window.addEventListener('focus', handleWake);
    }
  }

  async getVersion(signal?: AbortSignal): Promise<string> {
    try {
      const res = await fetch(`${this.apiBase}/version`, { signal });
      if (res.ok) {
        const data = (await res.json()) as { version?: string };
        if (data && data.version) return data.version;
      }
    } catch {
      // Fallback to default version
    }
    return 'v0.3.0';
  }

  async getServerTime(signal?: AbortSignal): Promise<ServerTimeResponse> {
    const res = await fetch(`${this.apiBase}/time`, { signal });
    if (!res.ok) {
      throw new Error(`Failed to fetch server time: ${res.statusText}`);
    }
    return (await res.json()) as ServerTimeResponse;
  }

  // Window Management (Desktop runtime fallback to no-op in web mode)
  minimizeWindow(): void {
    if (typeof window !== 'undefined' && window.runtime?.WindowMinimise) {
      window.runtime.WindowMinimise();
    }
  }

  toggleMaximizeWindow(): void {
    if (typeof window !== 'undefined' && window.runtime?.WindowToggleMaximise) {
      window.runtime.WindowToggleMaximise();
    }
  }

  async toggleFullscreen(): Promise<boolean> {
    if (typeof window !== 'undefined' && window.runtime?.WindowFullscreen && window.runtime?.WindowUnfullscreen) {
      if (window.runtime.WindowIsFullscreen) {
        const isFs = await window.runtime.WindowIsFullscreen();
        if (isFs) {
          window.runtime.WindowUnfullscreen();
          return false;
        }
        window.runtime.WindowFullscreen();
        return true;
      }
      window.runtime.WindowToggleMaximise?.();
      return true;
    }

    if (typeof document === 'undefined') return false;
    const doc = document as FullscreenDocument;
    const isFs = Boolean(
      doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement
    );
    try {
      if (!isFs) {
        const root = document.documentElement as FullscreenElement;
        if (root.requestFullscreen) {
          await root.requestFullscreen();
        } else if (root.webkitRequestFullscreen) {
          await root.webkitRequestFullscreen();
        } else if (root.mozRequestFullScreen) {
          await root.mozRequestFullScreen();
        } else if (root.msRequestFullscreen) {
          await root.msRequestFullscreen();
        }
        return true;
      }
      if (doc.exitFullscreen) {
        await doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      } else if (doc.mozCancelFullScreen) {
        await doc.mozCancelFullScreen();
      } else if (doc.msExitFullscreen) {
        await doc.msExitFullscreen();
      }
      return false;
    } catch (err) {
      console.warn('Standard fullscreen toggle error:', err);
      return !isFs;
    }
  }

  closeWindow(): void {
    if (typeof window !== 'undefined' && window.runtime?.WindowClose) {
      window.runtime.WindowClose();
    }
  }

  // Market Data APIs
  async fetchCandles(
    symbol: string,
    resolution: string,
    from?: number,
    to?: number,
    count = 200,
    signal?: AbortSignal
  ): Promise<Candle[]> {
    const params = new URLSearchParams({
      symbol,
      resolution,
      count: count.toString(),
    });
    if (from) params.set('from', from.toString());
    if (to) params.set('to', to.toString());

    const res = await fetch(`${this.apiBase}/datafeed/candles?${params.toString()}`, { signal });
    if (!res.ok) {
      throw new Error(`Failed to fetch candles: ${res.statusText}`);
    }
    const data = (await res.json()) as { candles?: Candle[] };
    return data.candles || [];
  }

  async fetchFootprint(
    symbol: string,
    resolution: string,
    from?: number,
    to?: number,
    count = 100,
    signal?: AbortSignal
  ): Promise<FootprintBar[]> {
    const params = new URLSearchParams({
      symbol,
      resolution,
      count: count.toString(),
    });
    if (from) params.set('from', from.toString());
    if (to) params.set('to', to.toString());

    const res = await fetch(`${this.apiBase}/datafeed/footprint?${params.toString()}`, { signal });
    if (!res.ok) {
      throw new Error(`Failed to fetch footprint: ${res.statusText}`);
    }
    const data = (await res.json()) as { bars?: FootprintBar[] };
    return data.bars || [];
  }

  async searchSymbols(query: string, signal?: AbortSignal): Promise<SymbolInfo[]> {
    const params = new URLSearchParams({ query });
    const res = await fetch(`${this.apiBase}/datafeed/symbols?${params.toString()}`, { signal });
    if (!res.ok) {
      throw new Error(`Failed to search symbols: ${res.statusText}`);
    }
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as SymbolInfo[]) : [];
  }

  // Providers APIs
  async getProvidersStatus(signal?: AbortSignal): Promise<ProvidersStatusResponse> {
    const res = await fetch(`${this.apiBase}/providers/status`, { signal });
    if (!res.ok) {
      throw new Error(`Failed to fetch providers status: ${res.statusText}`);
    }
    return (await res.json()) as ProvidersStatusResponse;
  }

  async configureProvider(payload: ProviderConfigurePayload, signal?: AbortSignal): Promise<void> {
    const res = await fetch(`${this.apiBase}/providers/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok) {
      throw new Error(`Failed to configure provider: ${res.statusText}`);
    }
  }

  async connectProvider(payload: ProviderConfigurePayload, signal?: AbortSignal): Promise<void> {
    return this.configureProvider(payload, signal);
  }

  async disconnectProvider(providerId: string, signal?: AbortSignal): Promise<void> {
    const params = new URLSearchParams({ provider: providerId });
    const res = await fetch(`${this.apiBase}/providers/configure?${params.toString()}`, {
      method: 'DELETE',
      signal,
    });
    if (!res.ok) {
      throw new Error(`Failed to disconnect provider: ${res.statusText}`);
    }
  }

  // Watchlist, Movers, News & Economic Calendar APIs
  async getWatchlistQuotes(symbols: string[], signal?: AbortSignal): Promise<WatchlistQuoteItem[]> {
    if (symbols.length === 0) return [];
    const params = new URLSearchParams({ symbols: symbols.join(',') });
    const res = await fetch(`${this.apiBase}/watchlist/quotes?${params.toString()}`, { signal });
    if (!res.ok) {
      throw new Error(`Failed to fetch watchlist quotes: ${res.statusText}`);
    }
    const data = (await res.json()) as { quotes?: WatchlistQuoteItem[] };
    return Array.isArray(data.quotes) ? data.quotes : [];
  }

  async searchWatchlistSymbols(query: string, signal?: AbortSignal): Promise<WatchlistSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const params = new URLSearchParams({ q: trimmed });
    const res = await fetch(`${this.apiBase}/watchlist/search?${params.toString()}`, { signal });
    if (!res.ok) {
      throw new Error(`Failed to search watchlist symbols: ${res.statusText}`);
    }
    const data = (await res.json()) as { results?: WatchlistSearchResult[] };
    return Array.isArray(data.results) ? data.results : [];
  }

  async getMovers(
    category = 'day_movers',
    options?: { refresh?: boolean; signal?: AbortSignal }
  ): Promise<MoversResponse> {
    const params = new URLSearchParams({ category });
    if (options?.refresh) {
      params.set('refresh', 'true');
      params.set('_t', String(Date.now()));
    }
    const res = await fetch(`${this.apiBase}/movers?${params.toString()}`, {
      signal: options?.signal,
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch movers: ${res.statusText}`);
    }
    const json = (await res.json()) as Partial<MoversResponse>;
    return {
      gainers: Array.isArray(json.gainers) ? json.gainers : [],
      losers: Array.isArray(json.losers) ? json.losers : [],
      volume: Array.isArray(json.volume) ? json.volume : [],
      categories: Array.isArray(json.categories) ? json.categories : undefined,
    };
  }

  async getNews(options?: {
    query?: string;
    refresh?: boolean;
    signal?: AbortSignal;
  }): Promise<NewsArticle[]> {
    const params = new URLSearchParams();
    if (options?.query?.trim()) {
      params.set('q', options.query.trim());
    }
    if (options?.refresh) {
      params.set('refresh', 'true');
      params.set('_t', String(Date.now()));
    }
    const qs = params.toString();
    const res = await fetch(`${this.apiBase}/news${qs ? `?${qs}` : ''}`, {
      signal: options?.signal,
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch news: ${res.statusText}`);
    }
    const data = (await res.json()) as { articles?: NewsArticle[] };
    return Array.isArray(data.articles) ? data.articles : [];
  }

  async getEconomicCalendar(options?: {
    refresh?: boolean;
    signal?: AbortSignal;
  }): Promise<CalendarEvent[]> {
    const params = new URLSearchParams();
    if (options?.refresh) {
      params.set('refresh', 'true');
      params.set('_t', String(Date.now()));
    }
    const qs = params.toString();
    const res = await fetch(`${this.apiBase}/calendar${qs ? `?${qs}` : ''}`, {
      signal: options?.signal,
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch economic calendar: ${res.statusText}`);
    }
    const data = (await res.json()) as { events?: CalendarEvent[] };
    return Array.isArray(data.events) ? data.events : [];
  }

  // Technical Indicator & OrderScript Evaluation APIs (AGENTS.md Invariant 2.1)
  async getIndicatorCatalog(options?: {
    category?: string;
    query?: string;
    signal?: AbortSignal;
  }): Promise<unknown> {
    const params = new URLSearchParams();
    if (options?.category) params.set('category', options.category);
    if (options?.query) params.set('q', options.query);
    const qs = params.toString();
    const res = await fetch(`${this.apiBase}/indicators/catalog${qs ? `?${qs}` : ''}`, {
      signal: options?.signal,
    });
    if (!res.ok) {
      throw new Error(`Catalog fetch failed with status ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  }

  async evaluateIndicators(
    payload: IndicatorEvalRequestPayload,
    signal?: AbortSignal
  ): Promise<IndicatorEvalResponsePayload> {
    const res = await fetch(`${this.apiBase}/indicators/eval`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok) {
      throw new Error(`Failed to evaluate indicators: ${res.statusText} (${res.status})`);
    }
    return (await res.json()) as IndicatorEvalResponsePayload;
  }

  async runScript(
    payload: ScriptEvalRequestPayload,
    signal?: AbortSignal
  ): Promise<ScriptEvalResponsePayload> {
    const res = await fetch(`${this.apiBase}/indicators/script/eval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
    const data = (await res.json()) as ScriptEvalResponsePayload;
    if (!res.ok && data && typeof data.success === 'boolean') {
      return data;
    }
    if (!res.ok) {
      throw new Error(`Script evaluation failed with status ${res.status}: ${res.statusText}`);
    }
    return data;
  }

  async saveScript(payload: ScriptSavePayload, signal?: AbortSignal): Promise<UserScriptRecord> {
    const res = await fetch(`${this.apiBase}/indicators/user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok) {
      throw new Error(`Failed to save script: ${res.statusText}`);
    }
    return (await res.json()) as UserScriptRecord;
  }

  async getSavedScripts(signal?: AbortSignal): Promise<UserScriptRecord[]> {
    const res = await fetch(`${this.apiBase}/indicators/user`, { signal });
    if (!res.ok) {
      throw new Error(`Failed to get saved scripts: ${res.statusText}`);
    }
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as UserScriptRecord[]) : [];
  }

  async deleteScript(id: string, signal?: AbortSignal): Promise<void> {
    const res = await fetch(`${this.apiBase}/indicators/user/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      signal,
    });
    if (!res.ok) {
      throw new Error(`Failed to delete script: ${res.statusText}`);
    }
  }

  // Layout Persistence APIs
  async getLayouts(signal?: AbortSignal): Promise<LayoutMetadata[]> {
    const res = await fetch(`${this.apiBase}/layout/`, { signal });
    if (!res.ok) {
      throw new Error(`Failed to get layouts: ${res.statusText}`);
    }
    return (await res.json()) as LayoutMetadata[];
  }

  async getLayoutContent(id: string, signal?: AbortSignal): Promise<string> {
    const res = await fetch(`${this.apiBase}/layout/${encodeURIComponent(id)}`, { signal });
    if (!res.ok) {
      throw new Error(`Failed to get layout content: ${res.statusText}`);
    }
    const data = (await res.json()) as { content: string };
    return data.content;
  }

  async saveLayout(
    id: string,
    name: string,
    symbol: string,
    resolution: string,
    content: string,
    is_favorite?: boolean
  ): Promise<string> {
    const res = await fetch(`${this.apiBase}/layout/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        layout: {
          id,
          name,
          symbol,
          resolution,
          content,
          timestamp: Math.floor(Date.now() / 1000),
          is_favorite: Boolean(is_favorite),
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`Failed to save layout: ${res.statusText}`);
    }
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  async updateLayoutMeta(
    id: string,
    updates: { name?: string; is_favorite?: boolean }
  ): Promise<void> {
    const res = await fetch(`${this.apiBase}/layout/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      throw new Error(`Failed to update layout metadata: ${res.statusText}`);
    }
  }

  async deleteLayout(id: string): Promise<void> {
    const res = await fetch(`${this.apiBase}/layout/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error(`Failed to delete layout: ${res.statusText}`);
    }
  }

  // Drawing Objects APIs
  async getDrawings(layoutId: string, symbol: string, signal?: AbortSignal): Promise<DrawingData[]> {
    const params = new URLSearchParams({ layout_id: layoutId, symbol });
    const res = await fetch(`${this.apiBase}/drawings?${params.toString()}`, { signal });
    if (!res.ok) {
      throw new Error(`Failed to get drawings: ${res.statusText}`);
    }
    return (await res.json()) as DrawingData[];
  }

  async saveDrawing(drawing: DrawingData): Promise<DrawingData> {
    const res = await fetch(`${this.apiBase}/drawings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(drawing),
    });
    if (!res.ok) {
      throw new Error(`Failed to save drawing: ${res.statusText}`);
    }
    return (await res.json()) as DrawingData;
  }

  async deleteDrawing(id: string): Promise<void> {
    const params = new URLSearchParams({ id });
    const res = await fetch(`${this.apiBase}/drawings?${params.toString()}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error(`Failed to delete drawing: ${res.statusText}`);
    }
  }

  async clearDrawings(layoutId?: string, symbol?: string): Promise<void> {
    const params = new URLSearchParams();
    if (layoutId) params.set('layout_id', layoutId);
    if (symbol) params.set('symbol', symbol);
    const res = await fetch(`${this.apiBase}/drawings?${params.toString()}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error(`Failed to clear drawings: ${res.statusText}`);
    }
  }

  // Drawing Templates APIs
  async getDrawingTemplates(toolType?: string): Promise<DrawingTemplateData[]> {
    const params = new URLSearchParams();
    if (toolType) params.set('tool_type', toolType);
    const qs = params.toString();
    const url = `${this.apiBase}/templates/drawings${qs ? '?' + qs : ''}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error(`Failed to get drawing templates: ${res.statusText}`);
      }
      return (await res.json()) as DrawingTemplateData[];
    } catch {
      return [];
    }
  }

  async saveDrawingTemplate(template: DrawingTemplateData): Promise<DrawingTemplateData> {
    const res = await fetch(`${this.apiBase}/templates/drawings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    });
    if (!res.ok) {
      throw new Error(`Failed to save drawing template: ${res.statusText}`);
    }
    return (await res.json()) as DrawingTemplateData;
  }

  async deleteDrawingTemplate(id: string): Promise<void> {
    const params = new URLSearchParams({ id });
    const res = await fetch(`${this.apiBase}/templates/drawings?${params.toString()}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error(`Failed to delete drawing template: ${res.statusText}`);
    }
  }

  // Chart Templates APIs
  async getChartTemplates(): Promise<ChartTemplateData[]> {
    try {
      const res = await fetch(`${this.apiBase}/templates/charts`);
      if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error(`Failed to get chart templates: ${res.statusText}`);
      }
      return (await res.json()) as ChartTemplateData[];
    } catch {
      return [];
    }
  }

  async saveChartTemplate(template: ChartTemplateData): Promise<ChartTemplateData> {
    const res = await fetch(`${this.apiBase}/templates/charts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    });
    if (!res.ok) {
      throw new Error(`Failed to save chart template: ${res.statusText}`);
    }
    return (await res.json()) as ChartTemplateData;
  }

  async deleteChartTemplate(id: string): Promise<void> {
    const params = new URLSearchParams({ id });
    const res = await fetch(`${this.apiBase}/templates/charts?${params.toString()}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error(`Failed to delete chart template: ${res.statusText}`);
    }
  }

  // Orderflow Imbalance Rules APIs (Persistent via SQLite)
  async getImbalanceRules(): Promise<ImbalanceRuleData[]> {
    try {
      const res = await fetch(`${this.apiBase}/orderflow/imbalances`);
      if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error(`Failed to get imbalance rules: ${res.statusText}`);
      }
      return (await res.json()) as ImbalanceRuleData[];
    } catch {
      return [];
    }
  }

  async saveImbalanceRule(rule: ImbalanceRuleData): Promise<ImbalanceRuleData> {
    const res = await fetch(`${this.apiBase}/orderflow/imbalances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    });
    if (!res.ok) {
      throw new Error(`Failed to save imbalance rule: ${res.statusText}`);
    }
    return (await res.json()) as ImbalanceRuleData;
  }

  async deleteImbalanceRule(id: string): Promise<void> {
    const params = new URLSearchParams({ id });
    const res = await fetch(`${this.apiBase}/orderflow/imbalances?${params.toString()}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error(`Failed to delete imbalance rule: ${res.statusText}`);
    }
  }

  // ==========================================
  // Unified Real-Time Streaming via Backend /ws Relay
  // ==========================================
  private ws: WebSocket | null = null;
  private wsSubscribers: Map<string, Set<LiveKlineSubscriptionEntry>> = new Map();
  private wsFootprintSubscribers: Map<string, Set<(fp: FootprintBar) => void>> = new Map();
  private wsStatusListeners: Set<(connected: boolean) => void> = new Set();
  private isWsConnecting = false;
  private wsReconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // High-frequency tick coalescing state
  private pendingCandleTicks: Map<string, Candle[]> = new Map();
  private pendingFootprintTicks: Map<string, FootprintBar[]> = new Map();
  private tickFlushScheduled = false;
  private tickRafId: number | null = null;

  onWsStatus(listener: (connected: boolean) => void): () => void {
    this.wsStatusListeners.add(listener);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      listener(true);
    } else {
      listener(false);
    }
    return () => {
      this.wsStatusListeners.delete(listener);
    };
  }

  private notifyWsStatus(connected: boolean): void {
    for (const listener of this.wsStatusListeners) {
      try {
        listener(connected);
      } catch (e) {
        console.error('[WS Status Listener Error]', e);
      }
    }
  }

  private getWsUrl(path = '/ws'): string {
    if (typeof window === 'undefined') {
      return `ws://localhost${path}`;
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}${path}`;
  }

  private startWsHeartbeat(): void {
    this.stopWsHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ action: 'ping' }));
        } catch {
          // Socket close/error handler will handle reconnect
        }
      }
    }, WS_HEARTBEAT_INTERVAL_MS);
    unrefTimer(this.heartbeatTimer);
  }

  private stopWsHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleTickFlush(): void {
    if (this.tickFlushScheduled) return;
    this.tickFlushScheduled = true;

    const flush = () => {
      this.tickFlushScheduled = false;
      this.tickRafId = null;
      this.flushPendingTicks();
    };

    if (typeof requestAnimationFrame === 'function') {
      this.tickRafId = requestAnimationFrame(flush);
    } else {
      queueMicrotask(flush);
    }
  }

  private flushPendingTicks(): void {
    if (this.pendingCandleTicks.size > 0) {
      const entries = Array.from(this.pendingCandleTicks.entries());
      this.pendingCandleTicks.clear();
      for (const [key, candles] of entries) {
        const subs = this.wsSubscribers.get(key);
        if (!subs || subs.size === 0) continue;
        for (const candle of candles) {
          for (const entry of subs) {
            if (!entry.immediate) {
              entry.callback(candle);
            }
          }
        }
      }
    }

    if (this.pendingFootprintTicks.size > 0) {
      const entries = Array.from(this.pendingFootprintTicks.entries());
      this.pendingFootprintTicks.clear();
      for (const [key, bars] of entries) {
        const subs = this.wsFootprintSubscribers.get(key);
        if (!subs || subs.size === 0) continue;
        for (const fp of bars) {
          for (const cb of subs) {
            cb(fp);
          }
        }
      }
    }
  }

  private enqueueCandleTick(key: string, candle: Candle): void {
    const subs = this.wsSubscribers.get(key);
    if (!subs || subs.size === 0) return;

    let hasCoalescedSub = false;
    for (const entry of subs) {
      if (entry.immediate) {
        entry.callback(candle);
      } else {
        hasCoalescedSub = true;
      }
    }

    if (!hasCoalescedSub) return;

    let queue = this.pendingCandleTicks.get(key);
    if (!queue) {
      queue = [candle];
      this.pendingCandleTicks.set(key, queue);
    } else {
      const last = queue[queue.length - 1];
      if (last && last.time === candle.time) {
        // Same bar timestamp: coalesce to latest tick within this frame
        queue[queue.length - 1] = candle;
      } else {
        queue.push(candle);
      }
    }

    this.scheduleTickFlush();
  }

  private enqueueFootprintTick(key: string, fp: FootprintBar): void {
    const subs = this.wsFootprintSubscribers.get(key);
    if (!subs || subs.size === 0) return;

    let queue = this.pendingFootprintTicks.get(key);
    if (!queue) {
      queue = [fp];
      this.pendingFootprintTicks.set(key, queue);
    } else {
      const last = queue[queue.length - 1];
      if (last && last.time === fp.time) {
        queue[queue.length - 1] = fp;
      } else {
        queue.push(fp);
      }
    }

    this.scheduleTickFlush();
  }

  private closeWsIfIdle(): void {
    if (this.wsSubscribers.size > 0 || this.wsFootprintSubscribers.size > 0) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopWsHeartbeat();
    this.isWsConnecting = false;
    this.wsReconnectAttempt = 0;
    this.pendingCandleTicks.clear();
    this.pendingFootprintTicks.clear();
    this.tickFlushScheduled = false;
    if (this.tickRafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.tickRafId);
      this.tickRafId = null;
    }

    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close(1000, 'idle');
        }
      } catch {
        // Ignore close errors
      }
      this.notifyWsStatus(false);
    }
  }

  private connectWs(): void {
    if (typeof WebSocket === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (this.isWsConnecting) return;
    this.isWsConnecting = true;

    try {
      const socket = new WebSocket(this.getWsUrl('/ws'));
      this.ws = socket;

      socket.onopen = () => {
        if (this.ws !== socket) return;
        this.isWsConnecting = false;
        this.wsReconnectAttempt = 0;
        this.notifyWsStatus(true);
        this.startWsHeartbeat();

        // Resubscribe to all active topics on connect or reconnect
        const sentTopics = new Set<string>();
        for (const key of this.wsSubscribers.keys()) {
          if (sentTopics.has(key)) continue;
          sentTopics.add(key);
          const [symbol, resolution] = key.split('::');
          if (symbol && resolution) {
            this.sendWsAction('subscribe', symbol, resolution);
          }
        }
        for (const key of this.wsFootprintSubscribers.keys()) {
          if (sentTopics.has(key)) continue;
          sentTopics.add(key);
          const [symbol, resolution] = key.split('::');
          if (symbol && resolution) {
            this.sendWsAction('subscribe', symbol, resolution);
          }
        }
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as {
            type?: string;
            symbol?: string;
            resolution?: string;
            candle?: Candle;
            footprint?: FootprintBar;
          };
          if (data && data.type === 'candle' && data.candle && data.symbol && data.resolution) {
            const key = `${data.symbol}::${data.resolution}`;
            this.enqueueCandleTick(key, data.candle);
          } else if (data && data.type === 'footprint' && data.footprint && data.symbol && data.resolution) {
            const key = `${data.symbol}::${data.resolution}`;
            this.enqueueFootprintTick(key, data.footprint);
          }
        } catch (e) {
          console.error('[TransportClient WS Message Error]', e);
        }
      };

      socket.onerror = (err) => {
        this.isWsConnecting = false;
        console.warn('[TransportClient WS Error]', err);
        this.notifyWsStatus(false);
      };

      socket.onclose = () => {
        if (this.ws !== socket) return;
        this.isWsConnecting = false;
        this.ws = null;
        this.stopWsHeartbeat();
        this.notifyWsStatus(false);

        if ((this.wsSubscribers.size > 0 || this.wsFootprintSubscribers.size > 0) && !this.reconnectTimer) {
          const delayMs = computeReconnectDelayMs(this.wsReconnectAttempt);
          this.wsReconnectAttempt++;
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connectWs();
          }, delayMs);
          unrefTimer(this.reconnectTimer);
        }
      };
    } catch (err) {
      this.isWsConnecting = false;
      this.notifyWsStatus(false);
      console.error('[TransportClient WS Connect Error]', err);
    }
  }

  private sendWsAction(action: 'subscribe' | 'unsubscribe', symbol: string, resolution: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action, symbol, resolution }));
    }
  }

  subscribeLiveKline(
    symbol: string,
    timeframe: string,
    onUpdate: (candle: Candle) => void,
    options?: LiveKlineSubscriptionOptions
  ): () => void {
    const key = `${symbol}::${timeframe}`;
    const entry: LiveKlineSubscriptionEntry = {
      callback: onUpdate,
      immediate: Boolean(options?.immediate),
    };

    let subs = this.wsSubscribers.get(key);
    if (!subs) {
      subs = new Set();
      this.wsSubscribers.set(key, subs);
      this.sendWsAction('subscribe', symbol, timeframe);
    }
    subs.add(entry);

    this.connectWs();

    return () => {
      const currentSubs = this.wsSubscribers.get(key);
      if (currentSubs) {
        currentSubs.delete(entry);
        if (currentSubs.size === 0) {
          this.wsSubscribers.delete(key);
          this.pendingCandleTicks.delete(key);
          if (!this.wsFootprintSubscribers.has(key)) {
            this.sendWsAction('unsubscribe', symbol, timeframe);
          }
        }
      }
      this.closeWsIfIdle();
    };
  }

  subscribeFootprint(
    symbol: string,
    timeframe: string,
    onUpdate: (fp: FootprintBar) => void
  ): () => void {
    const key = `${symbol}::${timeframe}`;
    let subs = this.wsFootprintSubscribers.get(key);
    if (!subs) {
      subs = new Set();
      this.wsFootprintSubscribers.set(key, subs);
      this.sendWsAction('subscribe', symbol, timeframe);
    }
    subs.add(onUpdate);

    this.connectWs();

    return () => {
      const currentSubs = this.wsFootprintSubscribers.get(key);
      if (currentSubs) {
        currentSubs.delete(onUpdate);
        if (currentSubs.size === 0) {
          this.wsFootprintSubscribers.delete(key);
          this.pendingFootprintTicks.delete(key);
          if (!this.wsSubscribers.has(key)) {
            this.sendWsAction('unsubscribe', symbol, timeframe);
          }
        }
      }
      this.closeWsIfIdle();
    };
  }

  // ==========================================
  // Shared Multiplexed Indicator Stream (/ws/indicators)
  // ==========================================
  private indicatorWs: WebSocket | null = null;
  private indicatorStreamSubs: Map<string, IndicatorStreamEntry> = new Map();
  private indicatorSubSeq = 0;
  private isIndicatorWsConnecting = false;
  private indicatorReconnectAttempt = 0;
  private indicatorReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private indicatorHeartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private startIndicatorHeartbeat(): void {
    this.stopIndicatorHeartbeat();
    this.indicatorHeartbeatTimer = setInterval(() => {
      if (this.indicatorWs && this.indicatorWs.readyState === WebSocket.OPEN) {
        try {
          this.indicatorWs.send(JSON.stringify({ action: 'ping' }));
        } catch {
          // Handled by onclose/onerror
        }
      }
    }, WS_HEARTBEAT_INTERVAL_MS);
    unrefTimer(this.indicatorHeartbeatTimer);
  }

  private stopIndicatorHeartbeat(): void {
    if (this.indicatorHeartbeatTimer) {
      clearInterval(this.indicatorHeartbeatTimer);
      this.indicatorHeartbeatTimer = null;
    }
  }

  private closeIndicatorWsIfIdle(): void {
    if (this.indicatorStreamSubs.size > 0) return;

    if (this.indicatorReconnectTimer) {
      clearTimeout(this.indicatorReconnectTimer);
      this.indicatorReconnectTimer = null;
    }
    this.stopIndicatorHeartbeat();
    this.isIndicatorWsConnecting = false;
    this.indicatorReconnectAttempt = 0;

    if (this.indicatorWs) {
      const socket = this.indicatorWs;
      this.indicatorWs = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close(1000, 'idle');
        }
      } catch {
        // Ignore close errors
      }
    }
  }

  private sendIndicatorSubscribe(entry: IndicatorStreamEntry): void {
    if (!this.indicatorWs || this.indicatorWs.readyState !== WebSocket.OPEN) return;
    if (entry.indicators.length === 0) return;

    try {
      this.indicatorWs.send(
        JSON.stringify({
          action: 'indicator_subscribe',
          symbol: entry.symbol,
          resolution: entry.resolution,
          indicators: entry.indicators,
          candles: entry.candles ? entry.candles.slice(-2000) : undefined,
        })
      );
    } catch {
      // Ignore transient send errors
    }
  }

  private connectIndicatorWs(): void {
    if (typeof WebSocket === 'undefined') return;
    if (
      this.indicatorWs &&
      (this.indicatorWs.readyState === WebSocket.OPEN || this.indicatorWs.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    if (this.isIndicatorWsConnecting) return;
    this.isIndicatorWsConnecting = true;

    try {
      const socket = new WebSocket(this.getWsUrl('/ws/indicators'));
      this.indicatorWs = socket;

      socket.onopen = () => {
        if (this.indicatorWs !== socket) return;
        this.isIndicatorWsConnecting = false;
        this.indicatorReconnectAttempt = 0;
        this.startIndicatorHeartbeat();

        for (const entry of this.indicatorStreamSubs.values()) {
          this.sendIndicatorSubscribe(entry);
        }
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as Partial<IndicatorStreamUpdate>;
          if (
            msg &&
            msg.type === 'indicator_update' &&
            msg.symbol &&
            msg.resolution &&
            typeof msg.time === 'number' &&
            msg.plots
          ) {
            const update: IndicatorStreamUpdate = {
              type: 'indicator_update',
              symbol: msg.symbol,
              resolution: msg.resolution,
              time: msg.time,
              plots: msg.plots,
            };

            for (const entry of this.indicatorStreamSubs.values()) {
              if (entry.symbol !== update.symbol || entry.resolution !== update.resolution) {
                continue;
              }
              const ownedIds = new Set(entry.indicators.map((ind) => ind.instanceId));
              const filteredPlots: Record<string, Record<string, number>> = {};
              let hasMatchedPlot = false;
              for (const [instanceId, plotMap] of Object.entries(update.plots)) {
                if (ownedIds.has(instanceId)) {
                  filteredPlots[instanceId] = plotMap;
                  hasMatchedPlot = true;
                }
              }
              if (hasMatchedPlot) {
                entry.onUpdate({
                  ...update,
                  plots: filteredPlots,
                });
              }
            }
          }
        } catch (e) {
          console.error('[TransportClient Indicator WS Message Error]', e);
        }
      };

      socket.onerror = (err) => {
        this.isIndicatorWsConnecting = false;
        console.warn('[TransportClient Indicator WS Error]', err);
      };

      socket.onclose = () => {
        if (this.indicatorWs !== socket) return;
        this.isIndicatorWsConnecting = false;
        this.indicatorWs = null;
        this.stopIndicatorHeartbeat();

        if (this.indicatorStreamSubs.size > 0 && !this.indicatorReconnectTimer) {
          const delayMs = computeReconnectDelayMs(this.indicatorReconnectAttempt);
          this.indicatorReconnectAttempt++;
          this.indicatorReconnectTimer = setTimeout(() => {
            this.indicatorReconnectTimer = null;
            this.connectIndicatorWs();
          }, delayMs);
          unrefTimer(this.indicatorReconnectTimer);
        }
      };
    } catch (err) {
      this.isIndicatorWsConnecting = false;
      console.error('[TransportClient Indicator WS Connect Error]', err);
    }
  }

  subscribeIndicatorStream(params: IndicatorStreamSubscriptionParams): () => void {
    const id = `ind_sub_${++this.indicatorSubSeq}`;
    const entry: IndicatorStreamEntry = {
      id,
      symbol: params.symbol,
      resolution: params.resolution,
      indicators: params.indicators,
      candles: params.candles,
      onUpdate: params.onUpdate,
    };

    this.indicatorStreamSubs.set(id, entry);

    if (this.indicatorWs && this.indicatorWs.readyState === WebSocket.OPEN) {
      this.sendIndicatorSubscribe(entry);
    } else {
      this.connectIndicatorWs();
    }

    return () => {
      const removed = this.indicatorStreamSubs.get(id);
      if (!removed) return;
      this.indicatorStreamSubs.delete(id);

      // Find instanceIds owned by removed entry not still referenced by another active sub on same topic
      const stillReferenced = new Set<string>();
      let hasRemainingTopicSub = false;
      for (const other of this.indicatorStreamSubs.values()) {
        if (other.symbol === removed.symbol && other.resolution === removed.resolution) {
          hasRemainingTopicSub = true;
          for (const ind of other.indicators) {
            stillReferenced.add(ind.instanceId);
          }
        }
      }

      if (this.indicatorWs && this.indicatorWs.readyState === WebSocket.OPEN) {
        if (!hasRemainingTopicSub) {
          this.indicatorWs.send(
            JSON.stringify({
              action: 'indicator_unsubscribe',
              symbol: removed.symbol,
              resolution: removed.resolution,
            })
          );
        } else {
          const unsubIds = removed.indicators
            .map((ind) => ind.instanceId)
            .filter((instId) => !stillReferenced.has(instId));
          if (unsubIds.length > 0) {
            this.indicatorWs.send(
              JSON.stringify({
                action: 'indicator_unsubscribe',
                symbol: removed.symbol,
                resolution: removed.resolution,
                instanceIds: unsubIds,
              })
            );
          }
        }
      }

      this.closeIndicatorWsIfIdle();
    };
  }
}

export const transport = new TransportClient();
