import type { ChartVisualSettings } from '../store/syncStore';
import { DEFAULT_CHART_SETTINGS } from '../store/syncStore';
import { transport } from '../transport/client';

export interface ChartTemplate {
  id: string;
  name: string;
  settings: Partial<ChartVisualSettings>;
  createdAt: number;
  isBuiltin?: boolean;
}

const STORAGE_KEY = 'ordercraft_chart_templates';
const DELETED_PRESETS_KEY = 'ordercraft_chart_templates_deleted_presets';

export const STARTER_CHART_TEMPLATES: ChartTemplate[] = [
  {
    id: 'ctmpl_dark_pro',
    name: 'Dark Pro (Default)',
    settings: { ...DEFAULT_CHART_SETTINGS },
    createdAt: 1700000001,
    isBuiltin: true,
  },
  {
    id: 'ctmpl_light_minimal',
    name: 'Light Minimal',
    settings: {
      ...DEFAULT_CHART_SETTINGS,
      canvasBgType: 'solid',
      canvasBgColor: '#ffffff',
      canvasGridMode: 'Vertical and horizontal',
      canvasVertGridColor: '#e0e3eb',
      canvasHorzGridColor: '#e0e3eb',
      canvasGridStyle: 'dotted',
      canvasCrosshairColor: '#9598a1',
      scalesTextColor: '#131722',
      scalesLineColor: '#e0e3eb',
      candleBodyUpColor: '#089981',
      candleBodyDownColor: '#f23645',
      candleBorderUpColor: '#089981',
      candleBorderDownColor: '#f23645',
      candleWickUpColor: '#089981',
      candleWickDownColor: '#f23645',
    },
    createdAt: 1700000002,
    isBuiltin: true,
  },
  {
    id: 'ctmpl_monochrome_dark',
    name: 'Monochrome Dark',
    settings: {
      ...DEFAULT_CHART_SETTINGS,
      canvasBgType: 'solid',
      canvasBgColor: '#131722',
      canvasGridMode: 'Vertical and horizontal',
      canvasVertGridColor: '#1e222d',
      canvasHorzGridColor: '#1e222d',
      canvasCrosshairColor: '#5d606b',
      candleBodyUpColor: '#d1d4dc',
      candleBodyDownColor: '#434651',
      candleBorderUpColor: '#d1d4dc',
      candleBorderDownColor: '#434651',
      candleWickUpColor: '#d1d4dc',
      candleWickDownColor: '#434651',
    },
    createdAt: 1700000003,
    isBuiltin: true,
  },
  {
    id: 'ctmpl_midnight_blue',
    name: 'Midnight Blue',
    settings: {
      ...DEFAULT_CHART_SETTINGS,
      canvasBgType: 'solid',
      canvasBgColor: '#0d1117',
      canvasGridMode: 'Vertical and horizontal',
      canvasVertGridColor: '#161b22',
      canvasHorzGridColor: '#161b22',
      canvasCrosshairColor: '#30363d',
      candleBodyUpColor: '#00f0ff',
      candleBodyDownColor: '#ff0055',
      candleBorderUpColor: '#00f0ff',
      candleBorderDownColor: '#ff0055',
      candleWickUpColor: '#00f0ff',
      candleWickDownColor: '#ff0055',
    },
    createdAt: 1700000004,
    isBuiltin: true,
  },
  {
    id: 'ctmpl_matrix_terminal',
    name: 'Matrix Terminal',
    settings: {
      ...DEFAULT_CHART_SETTINGS,
      canvasBgType: 'solid',
      canvasBgColor: '#050a05',
      canvasGridMode: 'Vertical and horizontal',
      canvasVertGridColor: '#0d190d',
      canvasHorzGridColor: '#0d190d',
      canvasCrosshairColor: '#00aa44',
      candleBodyUpColor: '#00ff66',
      candleBodyDownColor: '#005522',
      candleBorderUpColor: '#00ff66',
      candleBorderDownColor: '#005522',
      candleWickUpColor: '#00ff66',
      candleWickDownColor: '#005522',
    },
    createdAt: 1700000005,
    isBuiltin: true,
  },
  {
    id: 'ctmpl_warm_sunset',
    name: 'Warm Sunset',
    settings: {
      ...DEFAULT_CHART_SETTINGS,
      canvasBgType: 'gradient',
      canvasBgColor: '#1a151b',
      canvasBgColor2: '#120f13',
      canvasGridMode: 'Vertical and horizontal',
      canvasVertGridColor: '#271f2b',
      canvasHorzGridColor: '#271f2b',
      canvasCrosshairColor: '#8b5cf6',
      candleBodyUpColor: '#ff7a59',
      candleBodyDownColor: '#8b5cf6',
      candleBorderUpColor: '#ff7a59',
      candleBorderDownColor: '#8b5cf6',
      candleWickUpColor: '#ff7a59',
      candleWickDownColor: '#8b5cf6',
    },
    createdAt: 1700000006,
    isBuiltin: true,
  },
];

export class ChartTemplateManager {
  private templates: Map<string, ChartTemplate> = new Map();
  private deletedPresetIds: Set<string> = new Set();
  private listeners: Set<() => void> = new Set();
  private initialized = false;

  constructor() {
    this.init();
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // 1. Load deleted presets tracker from localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        const deletedStored = localStorage.getItem(DELETED_PRESETS_KEY);
        if (deletedStored) {
          const parsed = JSON.parse(deletedStored);
          if (Array.isArray(parsed)) {
            this.deletedPresetIds = new Set(parsed);
          }
        }
      } catch (e) {
        console.warn('[ChartTemplateManager] Failed to load deleted presets from localStorage:', e);
      }
    }

    // 2. Seed default starter presets first (excluding deleted ones)
    for (const starter of STARTER_CHART_TEMPLATES) {
      if (!this.deletedPresetIds.has(starter.id)) {
        this.templates.set(starter.id, starter);
      }
    }

    // 2. Load custom user templates from localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as ChartTemplate[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            for (const tmpl of parsed) {
              if (tmpl && tmpl.id) {
                this.templates.set(tmpl.id, tmpl);
              }
            }
          }
        }
      } catch (e) {
        console.warn('[ChartTemplateManager] Failed to load from localStorage:', e);
      }
    }

    // 3. Sync from backend database asynchronously
    try {
      const remote = await transport.getChartTemplates();
      if (Array.isArray(remote) && remote.length > 0) {
        let changed = false;
        for (const r of remote) {
          try {
            const settings = JSON.parse(r.settings);
            const tmpl: ChartTemplate = {
              id: r.id,
              name: r.name,
              settings,
              createdAt: r.created_at || Date.now(),
              isBuiltin: false,
            };
            this.templates.set(tmpl.id, tmpl);
            changed = true;
          } catch {}
        }
        if (changed) {
          this.persistToLocalStorage();
          this.notify();
        }
      }
    } catch {
      // Backend may be offline or in web standalone mode
    }
  }

  private persistToLocalStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      // Save all templates except built-ins
      const arr = Array.from(this.templates.values()).filter((t) => !t.isBuiltin);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch (e) {
      console.warn('[ChartTemplateManager] Failed to save to localStorage:', e);
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.error('[ChartTemplateManager] Listener error:', e);
      }
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getAllTemplates(): ChartTemplate[] {
    const list = Array.from(this.templates.values());
    list.sort((a, b) => {
      // Builtins first, then by creation date
      if (a.isBuiltin && !b.isBuiltin) return -1;
      if (!a.isBuiltin && b.isBuiltin) return 1;
      return a.createdAt - b.createdAt;
    });
    return list;
  }

  getTemplate(id: string): ChartTemplate | undefined {
    return this.templates.get(id);
  }

  async saveTemplate(name: string, settings: ChartVisualSettings): Promise<ChartTemplate> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Template name cannot be empty');
    }

    // Check if replacing an existing custom template with same name
    let targetId = `ctmpl_${Date.now()}`;
    for (const existing of this.templates.values()) {
      if (!existing.isBuiltin && existing.name.toLowerCase() === trimmed.toLowerCase()) {
        targetId = existing.id;
        break;
      }
    }

    // Clean snapshot of visual settings
    const snapshot: ChartVisualSettings = { ...settings };

    const tmpl: ChartTemplate = {
      id: targetId,
      name: trimmed,
      settings: snapshot,
      createdAt: Date.now(),
      isBuiltin: false,
    };

    this.templates.set(tmpl.id, tmpl);
    this.persistToLocalStorage();
    this.notify();

    // Persist to backend database asynchronously
    try {
      await transport.saveChartTemplate({
        id: tmpl.id,
        name: tmpl.name,
        settings: JSON.stringify(tmpl.settings),
        created_at: tmpl.createdAt,
      });
    } catch (err) {
      console.warn('[ChartTemplateManager] Failed to sync save to backend:', err);
    }

    return tmpl;
  }

  async deleteTemplate(id: string): Promise<void> {
    const tmpl = this.templates.get(id);
    if (!tmpl) return;

    if (tmpl.isBuiltin) {
      this.deletedPresetIds.add(id);
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(DELETED_PRESETS_KEY, JSON.stringify(Array.from(this.deletedPresetIds)));
        } catch (e) {
          console.warn('[ChartTemplateManager] Failed to save deleted presets to localStorage:', e);
        }
      }
    }

    this.templates.delete(id);
    this.persistToLocalStorage();
    this.notify();

    if (!tmpl.isBuiltin) {
      try {
        await transport.deleteChartTemplate(id);
      } catch (err) {
        console.warn('[ChartTemplateManager] Failed to sync delete to backend:', err);
      }
    }
  }

  restoreAllPresets(): void {
    this.deletedPresetIds.clear();
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(DELETED_PRESETS_KEY);
      } catch {}
    }
    for (const starter of STARTER_CHART_TEMPLATES) {
      this.templates.set(starter.id, starter);
    }
    this.notify();
  }

  applyTemplate(current: ChartVisualSettings, template: ChartTemplate): ChartVisualSettings {
    return {
      ...current,
      ...template.settings,
    };
  }

  resetToDefaults(): ChartVisualSettings {
    return { ...DEFAULT_CHART_SETTINGS };
  }
}

export const chartTemplateManager = new ChartTemplateManager();
