// ORDERCRAFT Dual-Mode Transport Client
// Conforms strictly to Dual-Mode Transport Invariant (docs/architecture/MASTER_PLAN.md):
// All frontend-to-backend communication MUST go through this file.
// Abstracts Wails Desktop vs. Browser Web mode seamlessly.

export interface Candle {
  time: number;  // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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

class TransportClient {
  private apiBase: string;

  constructor() {
    // In Vite dev mode, '/api' is proxied to Go backend (port 8080)
    // In production or self-hosted, it uses current origin or localhost
    this.apiBase = '/api';

    // Auto-reconnect WebSocket if dropped or frozen while tab/window was backgrounded
    if (typeof document !== 'undefined') {
      const handleWake = () => {
        if (document.visibilityState === 'visible' && this.wsSubscribers.size > 0) {
          if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
            this.connectWs();
          }
        }
      };
      document.addEventListener('visibilitychange', handleWake);
      window.addEventListener('focus', handleWake);
    }
  }

  async getVersion(): Promise<string> {
    try {
      const res = await fetch(`${this.apiBase}/version`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.version) return data.version;
      }
    } catch {}
    return 'v0.1.2';
  }

  // Window Management (Wails fallback to no-op in web mode)
  minimizeWindow(): void {
    if (window.runtime?.WindowMinimise) {
      window.runtime.WindowMinimise();
    }
  }

  toggleMaximizeWindow(): void {
    if (window.runtime?.WindowToggleMaximise) {
      window.runtime.WindowToggleMaximise();
    }
  }

  async toggleFullscreen(): Promise<boolean> {
    // 1. Wails desktop native fullscreen
    if (window.runtime?.WindowFullscreen && window.runtime?.WindowUnfullscreen) {
      if (window.runtime.WindowIsFullscreen) {
        const isFs = await window.runtime.WindowIsFullscreen();
        if (isFs) {
          window.runtime.WindowUnfullscreen();
          return false;
        } else {
          window.runtime.WindowFullscreen();
          return true;
        }
      } else {
        window.runtime.WindowToggleMaximise?.();
        return true;
      }
    }

    // 2. Web browser fullscreen
    const doc = document as any;
    const isFs = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
    try {
      if (!isFs) {
        const root = document.documentElement as any;
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
      } else {
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
      }
    } catch (err) {
      console.warn('Standard fullscreen toggle error:', err);
      return !isFs;
    }
  }

  closeWindow(): void {
    if (window.runtime?.WindowClose) {
      window.runtime.WindowClose();
    }
  }

  // Market Data APIs
  async fetchCandles(
    symbol: string,
    resolution: string,
    from?: number,
    to?: number,
    count = 200
  ): Promise<Candle[]> {
    const params = new URLSearchParams({
      symbol,
      resolution,
      count: count.toString(),
    });
    if (from) params.set('from', from.toString());
    if (to) params.set('to', to.toString());

    const res = await fetch(`${this.apiBase}/datafeed/candles?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch candles: ${res.statusText}`);
    }
    const data = await res.json();
    return data.candles || [];
  }

  async searchSymbols(query: string): Promise<SymbolInfo[]> {
    const params = new URLSearchParams({ query });
    const res = await fetch(`${this.apiBase}/datafeed/symbols?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Failed to search symbols: ${res.statusText}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  // Layout Persistence APIs
  async getLayouts(): Promise<LayoutMetadata[]> {
    const res = await fetch(`${this.apiBase}/layout/`);
    if (!res.ok) {
      throw new Error(`Failed to get layouts: ${res.statusText}`);
    }
    return await res.json();
  }

  async getLayoutContent(id: string): Promise<string> {
    const res = await fetch(`${this.apiBase}/layout/${encodeURIComponent(id)}`);
    if (!res.ok) {
      throw new Error(`Failed to get layout content: ${res.statusText}`);
    }
    const data = await res.json();
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
    const data = await res.json();
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
  async getDrawings(layoutId: string, symbol: string): Promise<DrawingData[]> {
    const params = new URLSearchParams({ layout_id: layoutId, symbol });
    const res = await fetch(`${this.apiBase}/drawings?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Failed to get drawings: ${res.statusText}`);
    }
    return await res.json();
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
    return await res.json();
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
      return await res.json();
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
    return await res.json();
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
      return await res.json();
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
    return await res.json();
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


  // Unified Real-Time Streaming via Backend /ws Relay (100% Provider-Agnostic)
  private ws: WebSocket | null = null;
  private wsSubscribers: Map<string, Set<(candle: Candle) => void>> = new Map();
  private wsStatusListeners: Set<(connected: boolean) => void> = new Set();
  private isWsConnecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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

  private getWsUrl(): string {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }

  private connectWs(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (this.isWsConnecting) return;
    this.isWsConnecting = true;

    try {
      this.ws = new WebSocket(this.getWsUrl());

      this.ws.onopen = () => {
        this.isWsConnecting = false;
        this.notifyWsStatus(true);
        // Resubscribe to all active topics on connect or reconnect
        for (const key of this.wsSubscribers.keys()) {
          const [symbol, resolution] = key.split('::');
          if (symbol && resolution) {
            this.sendWsAction('subscribe', symbol, resolution);
          }
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.type === 'candle' && data.candle) {
            const key = `${data.symbol}::${data.resolution}`;
            const subs = this.wsSubscribers.get(key);
            if (subs && subs.size > 0) {
              for (const cb of subs) {
                cb(data.candle);
              }
            }
          }
        } catch (e) {
          console.error('[TransportClient WS Message Error]', e);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[TransportClient WS Error]', err);
        this.notifyWsStatus(false);
      };

      this.ws.onclose = () => {
        this.isWsConnecting = false;
        this.ws = null;
        this.notifyWsStatus(false);
        if (this.wsSubscribers.size > 0 && !this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connectWs();
          }, 2000);
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
    onUpdate: (candle: Candle) => void
  ): () => void {
    const key = `${symbol}::${timeframe}`;
    let subs = this.wsSubscribers.get(key);
    if (!subs) {
      subs = new Set();
      this.wsSubscribers.set(key, subs);
      this.sendWsAction('subscribe', symbol, timeframe);
    }
    subs.add(onUpdate);

    this.connectWs();

    return () => {
      const currentSubs = this.wsSubscribers.get(key);
      if (currentSubs) {
        currentSubs.delete(onUpdate);
        if (currentSubs.size === 0) {
          this.wsSubscribers.delete(key);
          this.sendWsAction('unsubscribe', symbol, timeframe);
        }
      }
    };
  }
}

export const transport = new TransportClient();
