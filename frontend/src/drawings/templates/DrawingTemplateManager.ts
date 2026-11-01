import type { UserDrawing, DrawingToolType } from '../types';
import { drawingRegistry } from '../registry';
import { transport } from '../../transport/client';

export interface DrawingTemplateSettings {
  color?: string;
  lineWidth?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  text?: string;
  options?: Record<string, any>;
}

export interface DrawingTemplate {
  id: string;
  name: string;
  toolType: string;
  settings: DrawingTemplateSettings;
  createdAt: number;
}

const STORAGE_KEY = 'ordercraft_drawing_templates';

// Tool families for cross-compatibility (e.g. line templates shared across trendlines, rays, info lines)
const TOOL_FAMILIES: Record<string, string[]> = {
  line: [
    'trendline',
    'ray',
    'info_line',
    'extended_line',
    'horizontal_line',
    'horizontal_ray',
    'vertical_line',
    'crossline',
  ],
  channel: ['parallel_channel'],
  fib: ['fib_retracement', 'fib_extension'],
  shape: ['rectangle', 'rotated_rectangle', 'path'],
  position: ['long_position', 'short_position'],
  profile: ['fixed_range_volume_profile', 'anchored_volume_profile', 'anchored_vwap'],
};

function getToolFamily(toolType: string): string | null {
  for (const [family, members] of Object.entries(TOOL_FAMILIES)) {
    if (members.includes(toolType)) {
      return family;
    }
  }
  return null;
}

// Starter templates matching pro trading presets (EQX, Interest, Liquidity Grab, MSS, OB, Volume Imbalance)
const STARTER_TEMPLATES: DrawingTemplate[] = [
  {
    id: 'tmpl_starter_eqx',
    name: 'EQX',
    toolType: 'trendline',
    settings: {
      color: '#787b86',
      lineWidth: 1,
      lineStyle: 'dashed',
      text: 'EQX',
      options: {
        showMiddlePoint: true,
        showText: true,
        text: 'EQX',
        textColor: '#787b86',
        textAlignment: 'center',
        textVerticalAlignment: 'middle',
      },
    },
    createdAt: 1700000001,
  },
  {
    id: 'tmpl_starter_interest',
    name: 'Interest',
    toolType: 'trendline',
    settings: {
      color: '#2962ff',
      lineWidth: 2,
      lineStyle: 'solid',
      text: 'Interest',
      options: {
        showText: true,
        text: 'Interest',
        textColor: '#2962ff',
        textAlignment: 'left',
        textVerticalAlignment: 'top',
      },
    },
    createdAt: 1700000002,
  },
  {
    id: 'tmpl_starter_liq_grab',
    name: 'Liquidity Grab',
    toolType: 'trendline',
    settings: {
      color: '#f23645',
      lineWidth: 2,
      lineStyle: 'solid',
      text: 'Liquidity Grab',
      options: {
        showText: true,
        text: 'Liquidity Grab',
        textColor: '#f23645',
        textAlignment: 'right',
        textVerticalAlignment: 'top',
      },
    },
    createdAt: 1700000003,
  },
  {
    id: 'tmpl_starter_mss',
    name: 'MSS',
    toolType: 'trendline',
    settings: {
      color: '#f59e0b',
      lineWidth: 2,
      lineStyle: 'dashed',
      text: 'MSS',
      options: {
        showText: true,
        text: 'MSS',
        textColor: '#f59e0b',
        textAlignment: 'center',
        textVerticalAlignment: 'middle',
      },
    },
    createdAt: 1700000004,
  },
  {
    id: 'tmpl_starter_ob',
    name: 'OB',
    toolType: 'trendline',
    settings: {
      color: '#089981',
      lineWidth: 2,
      lineStyle: 'solid',
      text: 'OB',
      options: {
        showText: true,
        text: 'OB',
        textColor: '#089981',
        textAlignment: 'left',
        textVerticalAlignment: 'middle',
      },
    },
    createdAt: 1700000005,
  },
  {
    id: 'tmpl_starter_vol_imb',
    name: 'Volume Imbalance',
    toolType: 'trendline',
    settings: {
      color: '#8b5cf6',
      lineWidth: 2,
      lineStyle: 'dotted',
      text: 'Volume Imbalance',
      options: {
        showText: true,
        text: 'Volume Imbalance',
        textColor: '#8b5cf6',
        textAlignment: 'center',
        textVerticalAlignment: 'bottom',
      },
    },
    createdAt: 1700000006,
  },
];

export class DrawingTemplateManager {
  private templates: Map<string, DrawingTemplate> = new Map();
  private listeners: Set<() => void> = new Set();
  private initialized = false;

  constructor() {
    this.init();
  }

  /**
   * Initializes template manager from localStorage and synchronizes with Go SQLite backend.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // 1. Load from localStorage first (instant local availability)
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as DrawingTemplate[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            for (const tmpl of parsed) {
              this.templates.set(tmpl.id, tmpl);
            }
          }
        }
      } catch (e) {
        console.warn('[DrawingTemplateManager] Failed to load from localStorage:', e);
      }
    }

    // 2. If no templates found, seed default starter presets
    if (this.templates.size === 0) {
      for (const starter of STARTER_TEMPLATES) {
        this.templates.set(starter.id, starter);
      }
      this.persistToLocalStorage();
    }

    // 3. Sync from backend database asynchronously
    try {
      const remote = await transport.getDrawingTemplates();
      if (Array.isArray(remote) && remote.length > 0) {
        let changed = false;
        for (const r of remote) {
          try {
            const settings = JSON.parse(r.settings);
            const tmpl: DrawingTemplate = {
              id: r.id,
              name: r.name,
              toolType: r.tool_type,
              settings,
              createdAt: r.created_at || Date.now(),
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
      // Backend may be offline or in web standalone demo mode
    }
  }

  private persistToLocalStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const arr = Array.from(this.templates.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch (e) {
      console.warn('[DrawingTemplateManager] Failed to save to localStorage:', e);
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.error('[DrawingTemplateManager] Listener error:', e);
      }
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Returns all templates matching the given toolType or its compatible family.
   */
  getTemplatesForTool(toolType: string): DrawingTemplate[] {
    const family = getToolFamily(toolType);
    const familyMembers = family ? TOOL_FAMILIES[family] : [toolType];

    const exactMatches: DrawingTemplate[] = [];
    const familyMatches: DrawingTemplate[] = [];
    const seenNames = new Set<string>();

    for (const tmpl of this.templates.values()) {
      if (tmpl.toolType === toolType) {
        exactMatches.push(tmpl);
        seenNames.add(tmpl.name.toLowerCase());
      } else if (familyMembers.includes(tmpl.toolType)) {
        familyMatches.push(tmpl);
      }
    }

    // Combine exact matches first, then family matches with non-conflicting names
    const result = [...exactMatches];
    for (const fm of familyMatches) {
      if (!seenNames.has(fm.name.toLowerCase())) {
        result.push(fm);
        seenNames.add(fm.name.toLowerCase());
      }
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  getAllTemplates(): DrawingTemplate[] {
    return Array.from(this.templates.values());
  }

  getTemplate(id: string): DrawingTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Sanitizes and extracts only styling/settings from drawing, stripping price levels/anchors.
   */
  extractSettings(drawing: UserDrawing): DrawingTemplateSettings {
    const rawOpts = (drawing.options as Record<string, any>) || {};
    const sanitizedOpts: Record<string, any> = {};

    // Keys that must NEVER be saved in a template (price levels, coordinates, anchors, instance ids)
    const FORBIDDEN_KEYS = new Set([
      'entryPrice',
      'targetPrice',
      'stopPrice',
      'lotSize',
      'anchors',
      'id',
      'paneId',
      'symbol',
      'locked',
      'hidden',
    ]);

    for (const [k, v] of Object.entries(rawOpts)) {
      if (!FORBIDDEN_KEYS.has(k) && v !== undefined) {
        // Deep clone primitive/object values cleanly
        try {
          sanitizedOpts[k] = JSON.parse(JSON.stringify(v));
        } catch {
          sanitizedOpts[k] = v;
        }
      }
    }

    return {
      color: drawing.color,
      lineWidth: drawing.lineWidth,
      lineStyle: drawing.lineStyle,
      text: drawing.text,
      options: sanitizedOpts,
    };
  }

  /**
   * Saves or updates a drawing template.
   */
  async saveTemplate(
    toolType: string,
    name: string,
    drawing: UserDrawing
  ): Promise<DrawingTemplate> {
    const cleanName = name.trim();
    if (!cleanName) {
      throw new Error('Template name cannot be empty');
    }

    // Check if a template with this name already exists for this tool
    const existing = Array.from(this.templates.values()).find(
      (t) => t.toolType === toolType && t.name.toLowerCase() === cleanName.toLowerCase()
    );

    const id = existing ? existing.id : `tmpl_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const settings = this.extractSettings(drawing);

    const template: DrawingTemplate = {
      id,
      name: cleanName,
      toolType,
      settings,
      createdAt: existing ? existing.createdAt : Date.now(),
    };

    this.templates.set(id, template);
    this.persistToLocalStorage();
    this.notify();

    // Persist to backend database
    try {
      await transport.saveDrawingTemplate({
        id: template.id,
        name: template.name,
        tool_type: template.toolType,
        settings: JSON.stringify(template.settings),
        created_at: template.createdAt,
      });
    } catch (e) {
      console.warn('[DrawingTemplateManager] Failed to persist template to backend:', e);
    }

    return template;
  }

  /**
   * Deletes a template by ID.
   */
  async deleteTemplate(id: string): Promise<void> {
    if (this.templates.has(id)) {
      this.templates.delete(id);
      this.persistToLocalStorage();
      this.notify();

      try {
        await transport.deleteDrawingTemplate(id);
      } catch (e) {
        console.warn('[DrawingTemplateManager] Failed to delete template from backend:', e);
      }
    }
  }

  /**
   * Applies template settings onto a drawing without altering its anchors or price levels.
   */
  applyTemplate(drawing: UserDrawing, template: DrawingTemplate): UserDrawing {
    const s = template.settings;
    const currentOpts = (drawing.options as Record<string, any>) || {};
    const templateOpts = (s.options as Record<string, any>) || {};

    // Preserve price levels for position tools
    const preservedPriceOpts: Record<string, any> = {};
    if (currentOpts.entryPrice !== undefined) preservedPriceOpts.entryPrice = currentOpts.entryPrice;
    if (currentOpts.targetPrice !== undefined) preservedPriceOpts.targetPrice = currentOpts.targetPrice;
    if (currentOpts.stopPrice !== undefined) preservedPriceOpts.stopPrice = currentOpts.stopPrice;
    if (currentOpts.lotSize !== undefined) preservedPriceOpts.lotSize = currentOpts.lotSize;

    return {
      ...drawing,
      color: s.color !== undefined ? s.color : drawing.color,
      lineWidth: s.lineWidth !== undefined ? s.lineWidth : drawing.lineWidth,
      lineStyle: s.lineStyle !== undefined ? s.lineStyle : drawing.lineStyle,
      text: s.text !== undefined ? s.text : drawing.text,
      options: {
        ...currentOpts,
        ...templateOpts,
        ...preservedPriceOpts,
      },
    };
  }

  /**
   * Resets drawing options to default registered tool options, keeping anchors and price levels.
   */
  resetToDefaults(drawing: UserDrawing): UserDrawing {
    const tool = drawingRegistry.get(drawing.type as DrawingToolType);
    const defaultOpts = (tool?.getDefaultOptions?.() as Record<string, any>) || {};
    const currentOpts = (drawing.options as Record<string, any>) || {};

    // Preserve coordinates/price levels for position tools
    const preservedPriceOpts: Record<string, any> = {};
    if (currentOpts.entryPrice !== undefined) preservedPriceOpts.entryPrice = currentOpts.entryPrice;
    if (currentOpts.targetPrice !== undefined) preservedPriceOpts.targetPrice = currentOpts.targetPrice;
    if (currentOpts.stopPrice !== undefined) preservedPriceOpts.stopPrice = currentOpts.stopPrice;
    if (currentOpts.lotSize !== undefined) preservedPriceOpts.lotSize = currentOpts.lotSize;

    return {
      ...drawing,
      color: '#2962ff',
      lineWidth: 1,
      lineStyle: 'solid',
      text: '',
      options: {
        ...defaultOpts,
        ...preservedPriceOpts,
      },
    };
  }
}

export const drawingTemplateManager = new DrawingTemplateManager();
