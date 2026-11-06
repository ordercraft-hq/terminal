import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, ChevronDown, ChevronUp, Trash2, Check } from 'lucide-react';
import { useSyncStore } from '../../store/syncStore';
import type { ChartVisualSettings } from '../../store/syncStore';
import { ALL_TIMEZONES } from '../ChartPane/ChartPane';
import { chartTemplateManager, type ChartTemplate } from '../../templates/ChartTemplateManager';
import { SaveChartTemplateModal } from './SaveChartTemplateModal';
import { DeleteChartTemplateModal } from './DeleteChartTemplateModal';

export interface ChartSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'symbol' | 'status' | 'scales' | 'canvas' | 'trading';

// --- Custom Pro UI Controls ---

const ProCheckbox: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}> = ({ checked, onChange, label, disabled = false, className = '' }) => (
  <label
    className={`flex items-center space-x-2.5 select-none ${
      disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
    } ${className}`}
  >
    <div
      onClick={(e) => {
        if (disabled) return;
        e.preventDefault();
        onChange(!checked);
      }}
      className={`w-4 h-4 rounded-[3px] border transition-colors flex items-center justify-center shrink-0 ${
        checked
          ? 'bg-[#2962ff] border-[#2962ff]'
          : 'bg-[#1e222d] border-[#434651] hover:border-[#787b86]'
      }`}
    >
      {checked && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path
            d="M1 4L3.5 6.5L9 1"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
    {label && <span className="text-xs text-[#d1d4dc]">{label}</span>}
  </label>
);

import { ColorPickerPopover } from '../Common/ColorPickerPopover';

const ProColorSwatch: React.FC<{
  color: string;
  onChange: (color: string) => void;
  showLine?: boolean;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  lineWidth?: number;
  onLineStyleChange?: (style: 'solid' | 'dashed' | 'dotted') => void;
  onLineWidthChange?: (width: number) => void;
  splitColor?: string;
  title?: string;
}> = ({
  color,
  onChange,
  showLine = false,
  lineStyle,
  lineWidth,
  onLineStyleChange,
  onLineWidthChange,
  splitColor,
  title,
}) => (
  <ColorPickerPopover
    color={color}
    onChange={onChange}
    showLine={showLine}
    lineStyle={lineStyle}
    lineWidth={lineWidth}
    onLineStyleChange={onLineStyleChange}
    onLineWidthChange={onLineWidthChange}
    splitColor={splitColor}
    title={title}
  />
);

const ProSelect: React.FC<{
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  width?: string;
}> = ({ value, onChange, options, className = '', width = 'w-48' }) => (
  <div className={`relative inline-block ${width} ${className}`}>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full appearance-none bg-[#1e222d] hover:bg-[#242835] border border-[#363a45] hover:border-[#434651] rounded-[4px] pl-2.5 pr-7 py-1.5 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff] cursor-pointer transition-colors truncate"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-[#1e222d] text-[#d1d4dc]">
          {opt.label}
        </option>
      ))}
    </select>
    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[#787b86]">
      <ChevronDown size={12} />
    </div>
  </div>
);

const WatermarkSelect: React.FC<{
  settings: ChartVisualSettings;
  onUpdate: (partial: Partial<ChartVisualSettings>) => void;
}> = ({ settings, onUpdate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isTickerChecked =
    settings.canvasWatermarkTicker ?? (settings.canvasWatermark ? true : false);
  const isIntervalChecked =
    settings.canvasWatermarkInterval ?? (settings.canvasWatermark ? true : false);

  const selectedLabels: string[] = [];
  if (isTickerChecked) selectedLabels.push('Ticker');
  if (isIntervalChecked) selectedLabels.push('Interval');
  const summary = selectedLabels.length > 0 ? selectedLabels.join(', ') : 'Hidden';

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const toggleOption = (option: 'ticker' | 'interval') => {
    const nextTicker = option === 'ticker' ? !isTickerChecked : isTickerChecked;
    const nextInterval = option === 'interval' ? !isIntervalChecked : isIntervalChecked;
    const isAnyActive = nextTicker || nextInterval;

    onUpdate({
      canvasWatermark: isAnyActive,
      canvasWatermarkTicker: nextTicker,
      canvasWatermarkInterval: nextInterval,
    });
  };

  return (
    <div ref={containerRef} className="relative inline-block w-48">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between bg-[#1e222d] hover:bg-[#242835] border border-[#363a45] hover:border-[#434651] rounded-[4px] pl-2.5 pr-2.5 py-1.5 text-xs text-[#d1d4dc] transition-colors focus:border-[#2962ff] outline-none"
      >
        <span className="truncate">{summary}</span>
        {isOpen ? (
          <ChevronUp size={12} className="text-[#787b86] shrink-0 ml-1.5" />
        ) : (
          <ChevronDown size={12} className="text-[#787b86] shrink-0 ml-1.5" />
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1 w-full bg-[#1e222d] border border-[#363a45] rounded-[4px] shadow-xl z-50 py-2 px-2.5 space-y-2.5 select-none">
          <ProCheckbox
            checked={isTickerChecked}
            onChange={() => toggleOption('ticker')}
            label="Ticker"
          />
          <ProCheckbox
            checked={isIntervalChecked}
            onChange={() => toggleOption('interval')}
            label="Interval"
          />
        </div>
      )}
    </div>
  );
};

export const ChartSettingsModal: React.FC<ChartSettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('symbol');
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);
  const [templates, setTemplates] = useState<ChartTemplate[]>(() => chartTemplateManager.getAllTemplates());
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<ChartTemplate | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const templateMenuRef = useRef<HTMLDivElement>(null);

  const customTemplates = useMemo(() => templates.filter((t) => !t.isBuiltin), [templates]);
  const builtinTemplates = useMemo(() => templates.filter((t) => t.isBuiltin), [templates]);

  useEffect(() => {
    setTemplates(chartTemplateManager.getAllTemplates());
    const unsubscribe = chartTemplateManager.subscribe(() => {
      setTemplates(chartTemplateManager.getAllTemplates());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isTemplateMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(e.target as Node)) {
        setIsTemplateMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isTemplateMenuOpen]);

  const {
    timezone,
    setTimezone,
    chartSettings,
    panes,
    activePaneId,
    targetSettingsPaneId,
    updatePaneSettings,
    updatePaneConfig,
    applySettingsToAllPanes,
  } = useSyncStore();

  // Identify target pane: opened from context menu (targetSettingsPaneId) or active chart (activePaneId)
  const resolvedPaneId = targetSettingsPaneId || activePaneId || 'pane-1';
  const targetPane = panes[resolvedPaneId];
  const targetSettings = targetPane?.settings || chartSettings;
  const targetTimezone = targetPane?.timezone || timezone;

  // Local working state
  const [localSettings, setLocalSettings] = useState<ChartVisualSettings>(targetSettings);
  const [localTimezone, setLocalTimezone] = useState<string>(targetTimezone);

  // Snapshot taken when modal is opened to revert on Cancel
  const initialSettingsRef = useRef<ChartVisualSettings>(targetSettings);
  const initialTimezoneRef = useRef<string>(targetTimezone);

  // Modal draggable positioning state
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // Center modal initially whenever opened
  useEffect(() => {
    if (isOpen) {
      const cur = targetPane?.settings || chartSettings;
      const curTz = targetPane?.timezone || timezone;
      setLocalSettings(cur);
      setLocalTimezone(curTz);
      initialSettingsRef.current = { ...cur };
      initialTimezoneRef.current = curTz;
      setIsTemplateMenuOpen(false);

      const w = 590;
      const h = 550;
      const winW = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
      const left = Math.max(8, Math.min(winW - w - 8, Math.round((winW - w) / 2)));
      const top = Math.max(8, Math.min(winH - h - 8, Math.round((winH - h) / 2)));
      setPos({ x: left, y: top });
      currentPosRef.current = { x: left, y: top };
    }
  }, [isOpen, resolvedPaneId]);

  const getClampedPos = (x: number, y: number) => {
    const modalW = modalRef.current?.offsetWidth || 590;
    const modalH = modalRef.current?.offsetHeight || 550;
    const winW = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const minX = 8;
    const minY = 8;
    const maxX = Math.max(minX, winW - modalW - 8);
    const maxY = Math.max(minY, winH - modalH - 8);
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  };

  // Keep within boundaries on resize
  useEffect(() => {
    if (!isOpen) return;
    const clampPos = () => {
      setPos((prev) => {
        const clamped = getClampedPos(prev.x, prev.y);
        if (clamped.x !== prev.x || clamped.y !== prev.y) {
          currentPosRef.current = clamped;
          if (modalRef.current) {
            modalRef.current.style.left = `${clamped.x}px`;
            modalRef.current.style.top = `${clamped.y}px`;
          }
          return clamped;
        }
        return prev;
      });
    };
    const timer = setTimeout(clampPos, 20);
    window.addEventListener('resize', clampPos);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', clampPos);
    };
  }, [isOpen]);

  const rafIdRef = useRef<number | null>(null);

  // Header drag event handler
  const handleDragStart = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('input')
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    setIsDragging(true);
    isDraggingRef.current = true;
    dragStartMouseRef.current = { x: e.clientX, y: e.clientY };
    dragStartPosRef.current = { ...currentPosRef.current };
  };

  // Fluid pointer movement with rAF batching with boundary constraints
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - dragStartMouseRef.current.x;
      const dy = e.clientY - dragStartMouseRef.current.y;
      const clamped = getClampedPos(dragStartPosRef.current.x + dx, dragStartPosRef.current.y + dy);
      currentPosRef.current = clamped;
      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          if (modalRef.current) {
            modalRef.current.style.left = `${currentPosRef.current.x}px`;
            modalRef.current.style.top = `${currentPosRef.current.y}px`;
          }
        });
      }
    };

    const onUp = (e: PointerEvent) => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      try {
        if (headerRef.current && headerRef.current.hasPointerCapture(e.pointerId)) {
          headerRef.current.releasePointerCapture(e.pointerId);
        }
        (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
      } catch {}
      isDraggingRef.current = false;
      setIsDragging(false);
      setPos({ x: currentPosRef.current.x, y: currentPosRef.current.y });
      if (modalRef.current) {
        modalRef.current.style.left = `${currentPosRef.current.x}px`;
        modalRef.current.style.top = `${currentPosRef.current.y}px`;
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isDragging]);

  // Live update target chart immediately on change (live direct apply!)
  const handleUpdate = (partial: Partial<ChartVisualSettings>) => {
    setLocalSettings((prev) => {
      const next = { ...prev, ...partial };
      updatePaneSettings(resolvedPaneId, next);
      return next;
    });
  };

  // Timezone live update
  const handleTimezoneChange = (val: string) => {
    setLocalTimezone(val);
    updatePaneConfig(resolvedPaneId, { timezone: val });
  };

  // Revert to snapshot on Cancel
  const handleCancel = () => {
    updatePaneSettings(resolvedPaneId, initialSettingsRef.current);
    if (initialTimezoneRef.current) {
      updatePaneConfig(resolvedPaneId, { timezone: initialTimezoneRef.current });
    }
    setLocalSettings(initialSettingsRef.current);
    setLocalTimezone(initialTimezoneRef.current);
    onClose();
  };

  // Escape key listener to cancel & revert
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Confirm current settings and close
  const handleOk = () => {
    updatePaneSettings(resolvedPaneId, localSettings);
    onClose();
  };

  // Apply to all charts in the layout
  const handleApplyToAll = () => {
    applySettingsToAllPanes(localSettings);
    if (localTimezone !== timezone) {
      setTimezone(localTimezone);
    }
    onClose();
  };

  // Apply defaults live
  const handleApplyDefaults = () => {
    const def = chartTemplateManager.resetToDefaults();
    setLocalSettings(def);
    updatePaneSettings(resolvedPaneId, def);
    setActiveTemplateId('ctmpl_dark_pro');
    setIsTemplateMenuOpen(false);
  };

  const handleApplyTemplate = (tmpl: ChartTemplate) => {
    const applied = chartTemplateManager.applyTemplate(localSettings, tmpl);
    setLocalSettings(applied);
    updatePaneSettings(resolvedPaneId, applied);
    setActiveTemplateId(tmpl.id);
    setIsTemplateMenuOpen(false);
  };

  const handleSaveTemplate = async (name: string) => {
    const saved = await chartTemplateManager.saveTemplate(name, localSettings);
    setActiveTemplateId(saved.id);
  };

  const handleDeleteTemplate = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await chartTemplateManager.deleteTemplate(id);
    if (activeTemplateId === id) {
      setActiveTemplateId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        ref={modalRef}
      style={{
        left: `${isDragging ? currentPosRef.current.x : pos.x}px`,
        top: `${isDragging ? currentPosRef.current.y : pos.y}px`,
        willChange: isDragging ? 'left, top' : 'auto',
        touchAction: 'none',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-50 w-[590px] h-[550px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl overflow-hidden flex flex-col text-[#d1d4dc] select-none animate-in zoom-in-95 duration-100"
    >
      {/* Draggable Header */}
      <div
        ref={headerRef}
        onPointerDown={handleDragStart}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex items-center justify-between px-5 py-3.5 border-b border-[#2a2e39] bg-[#1e222d] cursor-move select-none"
      >
        <div className="flex items-center space-x-2.5 pointer-events-none">
          <img src="/logo.png" alt="ORDERCRAFT" className="w-5 h-5 rounded-[4px] object-contain shadow-sm" />
          <h2 className="text-sm font-semibold text-white">Chart Settings</h2>
        </div>
        <button
          onClick={handleCancel}
          className="text-[#787b86] hover:text-white p-1 rounded hover:bg-[#2a2e39] transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

        {/* Body Layout: Left Sidebar Tabs + Right Content Pane */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Navigation Tabs */}
          <div className="w-44 border-r border-[#2a2e39] py-2 bg-[#171a24] shrink-0 flex flex-col">
            {/* Tab 1: Symbol */}
            <button
              onClick={() => setActiveTab('symbol')}
              className={`w-full flex items-center space-x-3 px-4 py-2.5 text-xs text-left cursor-pointer transition-colors ${
                activeTab === 'symbol'
                  ? 'bg-[#242731] font-semibold text-white'
                  : 'text-[#d1d4dc] hover:text-white hover:bg-[#1e222d]/60 font-normal'
              }`}
            >
              {/* Candlestick icon */}
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <path d="M9 4v2m0 12v2M9 6h3v12H9zM16 8v2m0 6v2m-2-8h3v8h-3z" />
              </svg>
              <span>Symbol</span>
            </button>

            {/* Tab 2: Status line */}
            <button
              onClick={() => setActiveTab('status')}
              className={`w-full flex items-center space-x-3 px-4 py-2.5 text-xs text-left cursor-pointer transition-colors ${
                activeTab === 'status'
                  ? 'bg-[#242731] font-semibold text-white'
                  : 'text-[#d1d4dc] hover:text-white hover:bg-[#1e222d]/60 font-normal'
              }`}
            >
              {/* Menu horizontal lines */}
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="11" x2="21" y2="11" />
                <line x1="3" y1="16" x2="16" y2="16" />
                <line x1="3" y1="21" x2="11" y2="21" />
              </svg>
              <span>Status line</span>
            </button>

            {/* Tab 3: Scales and lines */}
            <button
              onClick={() => setActiveTab('scales')}
              className={`w-full flex items-center space-x-3 px-4 py-2.5 text-xs text-left cursor-pointer transition-colors ${
                activeTab === 'scales'
                  ? 'bg-[#242731] font-semibold text-white'
                  : 'text-[#d1d4dc] hover:text-white hover:bg-[#1e222d]/60 font-normal'
              }`}
            >
              {/* Axes coordinate corner arrow */}
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <path d="M4 3v17h17" />
                <path d="m4 4 4 4" />
                <path d="m20 20-4-4" />
              </svg>
              <span>Scales and lines</span>
            </button>

            {/* Tab 4: Canvas */}
            <button
              onClick={() => setActiveTab('canvas')}
              className={`w-full flex items-center space-x-3 px-4 py-2.5 text-xs text-left cursor-pointer transition-colors ${
                activeTab === 'canvas'
                  ? 'bg-[#242731] font-semibold text-white'
                  : 'text-[#d1d4dc] hover:text-white hover:bg-[#1e222d]/60 font-normal'
              }`}
            >
              {/* Pencil icon */}
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
              <span>Canvas</span>
            </button>

            {/* Tab 5: Paper Trading */}
            <button
              onClick={() => setActiveTab('trading')}
              className={`w-full flex items-center space-x-3 px-4 py-2.5 text-xs text-left cursor-pointer transition-colors ${
                activeTab === 'trading'
                  ? 'bg-[#242731] font-semibold text-white'
                  : 'text-[#d1d4dc] hover:text-white hover:bg-[#1e222d]/60 font-normal'
              }`}
            >
              {/* Angled exchange arrows */}
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <path d="m16 4 4 4-4 4" />
                <path d="M20 8H4" />
                <path d="m8 20-4-4 4-4" />
                <path d="M4 16h16" />
              </svg>
              <span>Paper Trading</span>
            </button>
          </div>

          {/* Right Content Pane */}
          <div className="flex-1 p-5 overflow-y-auto space-y-6 text-xs bg-[#1e222d] custom-scrollbar">
            {/* TAB 1: SYMBOL (matches Image 2) */}
            {activeTab === 'symbol' && (
              <div className="space-y-5">
                {/* Section: CANDLES */}
                <div>
                  <h3 className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-3">
                    Candles
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <ProCheckbox
                        checked={localSettings.colorBarsBasedOnPrevClose}
                        onChange={(val) => handleUpdate({ colorBarsBasedOnPrevClose: val })}
                        label="Color bars based on previous close"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <ProCheckbox
                        checked={localSettings.showCandleBody}
                        onChange={(val) => handleUpdate({ showCandleBody: val })}
                        label="Body"
                      />
                      <div className="flex items-center space-x-2">
                        <ProColorSwatch
                          color={localSettings.candleBodyUpColor}
                          onChange={(c) => handleUpdate({ candleBodyUpColor: c })}
                          title="Bullish body"
                        />
                        <ProColorSwatch
                          color={localSettings.candleBodyDownColor}
                          onChange={(c) => handleUpdate({ candleBodyDownColor: c })}
                          title="Bearish body"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <ProCheckbox
                        checked={localSettings.showCandleBorders}
                        onChange={(val) => handleUpdate({ showCandleBorders: val })}
                        label="Borders"
                      />
                      <div className="flex items-center space-x-2">
                        <ProColorSwatch
                          color={localSettings.candleBorderUpColor}
                          onChange={(c) => handleUpdate({ candleBorderUpColor: c })}
                          title="Bullish border"
                        />
                        <ProColorSwatch
                          color={localSettings.candleBorderDownColor}
                          onChange={(c) => handleUpdate({ candleBorderDownColor: c })}
                          title="Bearish border"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <ProCheckbox
                        checked={localSettings.showCandleWick}
                        onChange={(val) => handleUpdate({ showCandleWick: val })}
                        label="Wick"
                      />
                      <div className="flex items-center space-x-2">
                        <ProColorSwatch
                          color={localSettings.candleWickUpColor}
                          onChange={(c) => handleUpdate({ candleWickUpColor: c })}
                          title="Bullish wick"
                        />
                        <ProColorSwatch
                          color={localSettings.candleWickDownColor}
                          onChange={(c) => handleUpdate({ candleWickDownColor: c })}
                          title="Bearish wick"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section: DATA MODIFICATION */}
                <div className="pt-2">
                  <h3 className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-3">
                    Data Modification
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Session</span>
                      <ProSelect
                        value={localSettings.sessionType}
                        onChange={(val) => handleUpdate({ sessionType: val })}
                        options={[
                          { value: 'Electronic trading hours', label: 'Electronic tradi...' },
                          { value: 'Regular trading hours', label: 'Regular trading hours' },
                        ]}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Precision</span>
                      <ProSelect
                        value={localSettings.precisionMode}
                        onChange={(val) => handleUpdate({ precisionMode: val })}
                        options={[
                          { value: 'Default', label: 'Default' },
                          { value: '1/10', label: '1/10' },
                          { value: '1/100', label: '1/100' },
                          { value: '1/1000', label: '1/1000' },
                          { value: '1/10000', label: '1/10000' },
                          { value: '1/100000', label: '1/100000' },
                          { value: '1/1000000', label: '1/1000000' },
                          { value: '1/10000000', label: '1/10000000' },
                          { value: '1/100000000', label: '1/100000000' },
                        ]}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Timezone</span>
                      <ProSelect
                        value={localTimezone}
                        onChange={(val) => handleTimezoneChange(val)}
                        options={ALL_TIMEZONES.map((tz) => ({
                          value: tz.value,
                          label: tz.label.includes('(')
                            ? `(${tz.value}) ${tz.label.split('(')[1].replace(')', '').split('/')[0].trim()}`
                            : tz.label,
                        }))}
                        width="w-56"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: STATUS LINE (matches Image 3) */}
            {activeTab === 'status' && (
              <div className="space-y-5">
                {/* Section: SYMBOL */}
                <div>
                  <h3 className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-3">
                    Symbol
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <ProCheckbox
                        checked={localSettings.statusShowTitle}
                        onChange={(val) => handleUpdate({ statusShowTitle: val })}
                        label="Title"
                      />
                      <ProSelect
                        value={localSettings.statusTitleMode}
                        onChange={(val) =>
                          handleUpdate({
                            statusTitleMode: val as
                              | 'Ticker'
                              | 'Description'
                              | 'Ticker and description',
                          })
                        }
                        options={[
                          { value: 'Ticker', label: 'Ticker' },
                          { value: 'Description', label: 'Description' },
                          { value: 'Ticker and description', label: 'Ticker and description' },
                        ]}
                      />
                    </div>

                    <div>
                      <ProCheckbox
                        checked={localSettings.statusShowChartValues}
                        onChange={(val) => handleUpdate({ statusShowChartValues: val })}
                        label="Chart values"
                      />
                    </div>

                    <div>
                      <ProCheckbox
                        checked={localSettings.statusShowBarChange}
                        onChange={(val) => handleUpdate({ statusShowBarChange: val })}
                        label="Bar change values"
                      />
                    </div>

                    <div>
                      <ProCheckbox
                        checked={localSettings.statusShowVolume}
                        onChange={(val) => handleUpdate({ statusShowVolume: val })}
                        label="Volume"
                      />
                    </div>
                  </div>
                </div>

                {/* Section: INDICATORS */}
                <div className="pt-2">
                  <h3 className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-3">
                    Indicators
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <ProCheckbox
                        checked={localSettings.statusShowIndicatorTitles}
                        onChange={(val) => handleUpdate({ statusShowIndicatorTitles: val })}
                        label="Titles"
                      />
                    </div>

                    {/* Sub-item: Inputs (indented) */}
                    <div className="pl-6">
                      <ProCheckbox
                        checked={localSettings.statusShowIndicatorInputs}
                        onChange={(val) => handleUpdate({ statusShowIndicatorInputs: val })}
                        label="Inputs"
                      />
                    </div>

                    <div>
                      <ProCheckbox
                        checked={localSettings.statusShowIndicatorValues}
                        onChange={(val) => handleUpdate({ statusShowIndicatorValues: val })}
                        label="Values"
                      />
                    </div>

                    {/* Background checkbox + opacity slider */}
                    <div className="flex items-center space-x-4">
                      <ProCheckbox
                        checked={localSettings.statusShowIndicatorBackground}
                        onChange={(val) =>
                          handleUpdate({ statusShowIndicatorBackground: val })
                        }
                        label="Background"
                      />

                      {/* Pro slider with blue fill and white round thumb */}
                      <div className="relative w-44 flex items-center">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={localSettings.statusIndicatorBgOpacity}
                          onChange={(e) =>
                            handleUpdate({
                              statusIndicatorBgOpacity: parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full h-2 rounded bg-gradient-to-r from-[#1e222d] to-[#2962ff] accent-[#2962ff] cursor-pointer appearance-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: SCALES AND LINES (matches Images 4 & 5) */}
            {activeTab === 'scales' && (
              <div className="space-y-5">
                {/* Section: PRICE SCALE */}
                <div>
                  <h3 className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-3">
                    Price Scale
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Scale modes (A and L)</span>
                      <ProSelect
                        value={localSettings.scaleModeAL}
                        onChange={(val) => handleUpdate({ scaleModeAL: val })}
                        options={[
                          { value: 'Visible on mouse over', label: 'Visible on mouse over' },
                          { value: 'Always visible', label: 'Always visible' },
                          { value: 'Always hidden', label: 'Always hidden' },
                        ]}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <ProCheckbox
                        checked={localSettings.lockPriceToBarRatio}
                        onChange={(val) => handleUpdate({ lockPriceToBarRatio: val })}
                        label="Lock price to bar ratio"
                      />
                      <input
                        type="text"
                        value={localSettings.priceToBarRatioValue}
                        onChange={(e) => handleUpdate({ priceToBarRatioValue: e.target.value })}
                        disabled={!localSettings.lockPriceToBarRatio}
                        className="w-48 bg-[#1e222d] border border-[#363a45] rounded-[4px] px-2.5 py-1.5 text-xs text-[#787b86] focus:text-[#d1d4dc] outline-none disabled:opacity-50"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Scales placement</span>
                      <ProSelect
                        value={localSettings.scalesPlacement}
                        onChange={(val) => handleUpdate({ scalesPlacement: val })}
                        options={[
                          { value: 'Auto', label: 'Auto' },
                          { value: 'Right', label: 'Right' },
                          { value: 'Left', label: 'Left' },
                        ]}
                      />
                    </div>
                  </div>
                </div>

                {/* Section: PRICE LABELS & LINES */}
                <div className="pt-2">
                  <h3 className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-3">
                    Price Labels & Lines
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <ProCheckbox
                        checked={localSettings.noOverlappingLabels}
                        onChange={(val) => handleUpdate({ noOverlappingLabels: val })}
                        label="No overlapping labels"
                      />
                    </div>

                    <div>
                      <ProCheckbox
                        checked={localSettings.showPlusButton}
                        onChange={(val) => handleUpdate({ showPlusButton: val })}
                        label="Plus button"
                      />
                    </div>

                    <div>
                      <ProCheckbox
                        checked={localSettings.showCountdownToBarClose}
                        onChange={(val) => handleUpdate({ showCountdownToBarClose: val })}
                        label="Countdown to bar close"
                      />
                    </div>

                    {/* Symbol Line & Value */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[#d1d4dc]">Symbol</span>
                        <div className="flex items-center space-x-2">
                          <ProSelect
                            value={localSettings.symbolPriceScaleMode}
                            onChange={(val) => handleUpdate({ symbolPriceScaleMode: val })}
                            options={[
                              { value: 'Value, line', label: 'Value, line' },
                              { value: 'Value according to scale', label: 'Value according to sc...' },
                              { value: 'Line only', label: 'Line only' },
                              { value: 'Value only', label: 'Value only' },
                              { value: 'Hidden', label: 'Hidden' },
                            ]}
                            width="w-44"
                          />
                          <ProColorSwatch
                            color={localSettings.symbolPriceLineColor || '#089981'}
                            onChange={(c) => handleUpdate({ symbolPriceLineColor: c })}
                            showLine
                            lineStyle={localSettings.symbolPriceLineStyle || 'dashed'}
                            lineWidth={localSettings.symbolPriceLineWidth || 1}
                            onLineStyleChange={(s) => handleUpdate({ symbolPriceLineStyle: s })}
                            onLineWidthChange={(w) => handleUpdate({ symbolPriceLineWidth: w })}
                            title="Current Price Line Style"
                          />
                        </div>
                      </div>

                      {/* Indented Sub-option */}
                      <div className="flex justify-end pr-8">
                        <ProSelect
                          value={localSettings.symbolPriceSubMode}
                          onChange={(val) => handleUpdate({ symbolPriceSubMode: val })}
                          options={[
                            { value: 'Value according to scale', label: 'Value according to sc...' },
                            { value: 'Last price and line', label: 'Last price and line' },
                          ]}
                          width="w-44"
                        />
                      </div>
                    </div>

                    {/* Previous Day Close */}
                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Previous day close</span>
                      <div className="flex items-center space-x-2">
                        <ProSelect
                          value={localSettings.previousDayCloseMode}
                          onChange={(val) => handleUpdate({ previousDayCloseMode: val })}
                          options={[
                            { value: 'Hidden', label: 'Hidden' },
                            { value: 'Value, line', label: 'Value, line' },
                            { value: 'Line only', label: 'Line only' },
                          ]}
                          width="w-44"
                        />
                        <ProColorSwatch
                          color="#787b86"
                          onChange={() => {}}
                          showLine
                          title="Previous day close color"
                        />
                      </div>
                    </div>

                    {/* Indicators and Financials */}
                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Indicators and financials</span>
                      <ProSelect
                        value={localSettings.indicatorsPriceScaleMode}
                        onChange={(val) => handleUpdate({ indicatorsPriceScaleMode: val })}
                        options={[
                          { value: 'Value', label: 'Value' },
                          { value: 'Value, line', label: 'Value, line' },
                          { value: 'Hidden', label: 'Hidden' },
                        ]}
                        width="w-44"
                      />
                    </div>

                    {/* High and Low */}
                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">High and low</span>
                      <div className="flex items-center space-x-2">
                        <ProSelect
                          value={localSettings.highLowPriceScaleMode}
                          onChange={(val) => handleUpdate({ highLowPriceScaleMode: val })}
                          options={[
                            { value: 'Hidden', label: 'Hidden' },
                            { value: 'Value, line', label: 'Value, line' },
                            { value: 'Line only', label: 'Line only' },
                          ]}
                          width="w-44"
                        />
                        <ProColorSwatch
                          color="#089981"
                          splitColor="#f23645"
                          onChange={() => {}}
                          showLine
                          title="High/Low lines"
                        />
                      </div>
                    </div>

                    {/* Bid and Ask */}
                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Bid and ask</span>
                      <div className="flex items-center space-x-2">
                        <ProSelect
                          value={localSettings.bidAskPriceScaleMode}
                          onChange={(val) => handleUpdate({ bidAskPriceScaleMode: val })}
                          options={[
                            { value: 'Hidden', label: 'Hidden' },
                            { value: 'Value, line', label: 'Value, line' },
                            { value: 'Line only', label: 'Line only' },
                          ]}
                          width="w-44"
                        />
                        <ProColorSwatch
                          color="#2962ff"
                          onChange={() => {}}
                          title="Bid price color"
                        />
                        <ProColorSwatch
                          color="#f23645"
                          onChange={() => {}}
                          title="Ask price color"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section: TIME SCALE (matches Image 5) */}
                <div className="pt-2">
                  <h3 className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-3">
                    Time Scale
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <ProCheckbox
                        checked={localSettings.dayOfWeekOnLabels}
                        onChange={(val) => handleUpdate({ dayOfWeekOnLabels: val })}
                        label="Day of week on labels"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Date format</span>
                      <ProSelect
                        value={localSettings.dateFormat}
                        onChange={(val) => handleUpdate({ dateFormat: val })}
                        options={[
                          { value: "Mon 29 Sep '97", label: "Mon 29 Sep '97" },
                          { value: "29 Sep '97", label: "29 Sep '97" },
                          { value: 'yyyy-MM-dd', label: '1997-09-29' },
                          { value: 'dd-MM-yyyy', label: '29-09-1997' },
                          { value: 'MM/dd/yyyy', label: '09/29/1997' },
                        ]}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Time hours format</span>
                      <ProSelect
                        value={localSettings.timeHoursFormat}
                        onChange={(val) => handleUpdate({ timeHoursFormat: val })}
                        options={[
                          { value: '24-hours', label: '24-hours' },
                          { value: '12-hours', label: '12-hours' },
                        ]}
                      />
                    </div>

                    <div>
                      <ProCheckbox
                        checked={localSettings.saveChartLeftEdgePosition}
                        onChange={(val) => handleUpdate({ saveChartLeftEdgePosition: val })}
                        label="Save chart left edge position when changing interval"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: CANVAS */}
            {activeTab === 'canvas' && (
              <div className="space-y-6">
                {/* SECTION 1: CHART BASIC STYLES */}
                <div>
                  <h3 className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-3">
                    Chart Basic Styles
                  </h3>
                  <div className="space-y-3.5">
                    {/* Background */}
                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Background</span>
                      <div className="flex items-center space-x-2">
                        <ProSelect
                          value={localSettings.canvasBgType}
                          onChange={(val) =>
                            handleUpdate({ canvasBgType: val as 'solid' | 'gradient' })
                          }
                          options={[
                            { value: 'solid', label: 'Solid' },
                            { value: 'gradient', label: 'Gradient' },
                          ]}
                          width="w-44"
                        />
                        <ProColorSwatch
                          color={localSettings.canvasBgColor}
                          onChange={(c) => handleUpdate({ canvasBgColor: c })}
                          title="Background Color 1"
                        />
                        {localSettings.canvasBgType === 'gradient' && (
                          <ProColorSwatch
                            color={localSettings.canvasBgColor2}
                            onChange={(c) => handleUpdate({ canvasBgColor2: c })}
                            title="Background Color 2"
                          />
                        )}
                      </div>
                    </div>

                    {/* Grid lines */}
                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Grid lines</span>
                      <div className="flex items-center space-x-2">
                        <ProSelect
                          value={localSettings.canvasGridMode || 'Vertical and horizontal'}
                          onChange={(val) =>
                            handleUpdate({
                              canvasGridMode: val as
                                | 'None'
                                | 'Vertical and horizontal'
                                | 'Vertical only'
                                | 'Horizontal only',
                            })
                          }
                          options={[
                            { value: 'None', label: 'None' },
                            { value: 'Vertical and horizontal', label: 'Vertical and horizontal' },
                            { value: 'Vertical only', label: 'Vertical only' },
                            { value: 'Horizontal only', label: 'Horizontal only' },
                          ]}
                          width="w-44"
                        />
                        {localSettings.canvasGridMode !== 'None' && (
                          <>
                            {(localSettings.canvasGridMode === 'Vertical and horizontal' ||
                              localSettings.canvasGridMode === 'Vertical only') && (
                              <ProColorSwatch
                                color={localSettings.canvasVertGridColor}
                                onChange={(c) => handleUpdate({ canvasVertGridColor: c })}
                                showLine
                                lineStyle={localSettings.canvasGridStyle || 'dashed'}
                                onLineStyleChange={(s) => handleUpdate({ canvasGridStyle: s })}
                                title="Vertical grid lines"
                              />
                            )}
                            {(localSettings.canvasGridMode === 'Vertical and horizontal' ||
                              localSettings.canvasGridMode === 'Horizontal only') && (
                              <ProColorSwatch
                                color={localSettings.canvasHorzGridColor}
                                onChange={(c) => handleUpdate({ canvasHorzGridColor: c })}
                                showLine
                                lineStyle={localSettings.canvasGridStyle || 'dashed'}
                                onLineStyleChange={(s) => handleUpdate({ canvasGridStyle: s })}
                                title="Horizontal grid lines"
                              />
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Session breaks */}
                    <div className="flex items-center justify-between">
                      <ProCheckbox
                        checked={localSettings.canvasSessionBreaks || false}
                        onChange={(val) => handleUpdate({ canvasSessionBreaks: val })}
                        label="Session breaks"
                      />
                      <ProColorSwatch
                        color={localSettings.canvasSessionBreaksColor || '#2962ff'}
                        onChange={(c) => handleUpdate({ canvasSessionBreaksColor: c })}
                        showLine
                        lineStyle={localSettings.canvasSessionBreaksStyle || 'dashed'}
                        lineWidth={localSettings.canvasSessionBreaksWidth || 1}
                        onLineStyleChange={(s) => handleUpdate({ canvasSessionBreaksStyle: s })}
                        onLineWidthChange={(w) => handleUpdate({ canvasSessionBreaksWidth: w })}
                        title="Session breaks line"
                      />
                    </div>

                    {/* Crosshair */}
                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Crosshair</span>
                      <ProColorSwatch
                        color={localSettings.canvasCrosshairColor || '#787b86'}
                        onChange={(c) => handleUpdate({ canvasCrosshairColor: c })}
                        showLine
                        lineStyle={localSettings.canvasCrosshairStyle || 'dotted'}
                        lineWidth={localSettings.canvasCrosshairWidth || 1}
                        onLineStyleChange={(s) => handleUpdate({ canvasCrosshairStyle: s })}
                        onLineWidthChange={(w) => handleUpdate({ canvasCrosshairWidth: w })}
                        title="Crosshair line"
                      />
                    </div>

                    {/* Watermark */}
                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Watermark</span>
                      <div className="flex items-center space-x-2">
                        <WatermarkSelect
                          settings={localSettings}
                          onUpdate={handleUpdate}
                        />
                        <ProColorSwatch
                          color={localSettings.canvasWatermarkColor || 'rgba(255, 255, 255, 0.08)'}
                          onChange={(c) => handleUpdate({ canvasWatermarkColor: c })}
                          title="Watermark color"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: SCALES */}
                <div className="pt-2">
                  <h3 className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-3">
                    Scales
                  </h3>
                  <div className="space-y-3.5">
                    {/* Text */}
                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Text</span>
                      <div className="flex items-center space-x-2">
                        <ProSelect
                          value={String(localSettings.scalesTextSize || 11)}
                          onChange={(val) => handleUpdate({ scalesTextSize: Number(val) })}
                          options={[
                            { value: '10', label: '10' },
                            { value: '11', label: '11' },
                            { value: '12', label: '12' },
                            { value: '14', label: '14' },
                            { value: '16', label: '16' },
                            { value: '20', label: '20' },
                          ]}
                          width="w-16"
                        />
                        <ProColorSwatch
                          color={localSettings.scalesTextColor || '#787b86'}
                          onChange={(c) => handleUpdate({ scalesTextColor: c })}
                          title="Scales text color"
                        />
                      </div>
                    </div>

                    {/* Lines */}
                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Lines</span>
                      <ProColorSwatch
                        color={localSettings.scalesLineColor || '#2a2e39'}
                        onChange={(c) => handleUpdate({ scalesLineColor: c })}
                        title="Scales border lines color"
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 3: BUTTONS */}
                <div className="pt-2">
                  <h3 className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-3">
                    Buttons
                  </h3>
                  <div className="space-y-3.5">
                    {/* Navigation */}
                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Navigation</span>
                      <ProSelect
                        value={localSettings.navButtonsMode || 'Visible on mouse over'}
                        onChange={(val) =>
                          handleUpdate({
                            navButtonsMode: val as
                              | 'Visible on mouse over'
                              | 'Always visible'
                              | 'Always hidden',
                          })
                        }
                        options={[
                          { value: 'Visible on mouse over', label: 'Visible on mouse over' },
                          { value: 'Always visible', label: 'Always visible' },
                          { value: 'Always hidden', label: 'Always hidden' },
                        ]}
                        width="w-48"
                      />
                    </div>

                    {/* Pane */}
                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Pane</span>
                      <ProSelect
                        value={localSettings.paneButtonsMode || 'Visible on mouse over'}
                        onChange={(val) =>
                          handleUpdate({
                            paneButtonsMode: val as
                              | 'Visible on mouse over'
                              | 'Always visible'
                              | 'Always hidden',
                          })
                        }
                        options={[
                          { value: 'Visible on mouse over', label: 'Visible on mouse over' },
                          { value: 'Always visible', label: 'Always visible' },
                          { value: 'Always hidden', label: 'Always hidden' },
                        ]}
                        width="w-48"
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 4: MARGINS */}
                <div className="pt-2">
                  <h3 className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-3">
                    Margins
                  </h3>
                  <div className="space-y-3.5">
                    {/* Top Margin */}
                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Top</span>
                      <div className="flex items-center space-x-1.5">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={localSettings.marginScaleTop ?? 10}
                          onChange={(e) =>
                            handleUpdate({
                              marginScaleTop: Math.max(
                                0,
                                Math.min(100, Number(e.target.value) || 0)
                              ),
                            })
                          }
                          className="w-16 bg-[#131722] border border-[#363a45] rounded px-2.5 py-1 text-xs font-mono text-[#d1d4dc] outline-none focus:border-[#2962ff]"
                        />
                        <span className="text-[#787b86] text-xs">%</span>
                      </div>
                    </div>

                    {/* Bottom Margin */}
                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Bottom</span>
                      <div className="flex items-center space-x-1.5">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={localSettings.marginScaleBottom ?? 8}
                          onChange={(e) =>
                            handleUpdate({
                              marginScaleBottom: Math.max(
                                0,
                                Math.min(100, Number(e.target.value) || 0)
                              ),
                            })
                          }
                          className="w-16 bg-[#131722] border border-[#363a45] rounded px-2.5 py-1 text-xs font-mono text-[#d1d4dc] outline-none focus:border-[#2962ff]"
                        />
                        <span className="text-[#787b86] text-xs">%</span>
                      </div>
                    </div>

                    {/* Right Offset / Margin */}
                    <div className="flex items-center justify-between">
                      <span className="text-[#d1d4dc]">Right</span>
                      <div className="flex items-center space-x-1.5">
                        <input
                          type="number"
                          min="0"
                          max="500"
                          value={localSettings.marginRightBars ?? 10}
                          onChange={(e) =>
                            handleUpdate({
                              marginRightBars: Math.max(
                                0,
                                Math.min(500, Number(e.target.value) || 0)
                              ),
                            })
                          }
                          className="w-16 bg-[#131722] border border-[#363a45] rounded px-2.5 py-1 text-xs font-mono text-[#d1d4dc] outline-none focus:border-[#2962ff]"
                        />
                        <span className="text-[#787b86] text-xs">Bars</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: PAPER TRADING */}
            {activeTab === 'trading' && (
              <div className="h-full flex flex-col items-center justify-center py-24 text-center select-none">
                <div className="w-14 h-14 rounded-2xl bg-[#2962ff]/10 border border-[#2962ff]/25 flex items-center justify-center text-[#2962ff] mb-4 shadow-lg shadow-[#2962ff]/5">
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m16 4 4 4-4 4" />
                    <path d="M20 8H4" />
                    <path d="m8 20-4-4 4-4" />
                    <path d="M4 16h16" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-white tracking-wide mb-1.5">
                  Coming Soon
                </h3>
                <p className="text-xs text-[#787b86] max-w-[280px] leading-relaxed">
                  Paper trading simulation, order routing, and portfolio management features are currently under development.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer (matches Image 2, 3, 4, 5) */}
        <div className="h-14 px-5 border-t border-[#2a2e39] bg-[#1e222d] flex items-center justify-between shrink-0">
          {/* Left: Template dropdown */}
          <div ref={templateMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsTemplateMenuOpen(!isTemplateMenuOpen)}
              className={`px-3 py-1.5 rounded-[4px] border transition-colors cursor-pointer text-xs flex items-center space-x-1.5 select-none ${
                isTemplateMenuOpen
                  ? 'border-[#2962ff] bg-[#2a2e39] text-white'
                  : 'border-[#363a45] hover:border-[#434651] hover:bg-[#2a2e39]/50 text-[#d1d4dc]'
              }`}
            >
              <span>Template</span>
              {isTemplateMenuOpen ? (
                <ChevronUp size={12} className="text-[#787b86]" />
              ) : (
                <ChevronDown size={12} className="text-[#787b86]" />
              )}
            </button>

            {isTemplateMenuOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-64 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl py-1 z-30 text-xs select-none animate-in fade-in zoom-in-95 duration-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsTemplateMenuOpen(false);
                    setIsSaveModalOpen(true);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#2a2e39] text-[#d1d4dc] transition-colors cursor-pointer flex items-center justify-between"
                >
                  <span>Save as...</span>
                </button>
                <button
                  type="button"
                  onClick={handleApplyDefaults}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#2a2e39] text-[#d1d4dc] transition-colors cursor-pointer"
                >
                  Apply Defaults
                </button>

                {/* Divider */}
                <div className="h-[1px] bg-[#2a2e39] my-1" />

                <div className="max-h-60 overflow-y-auto">
                  {/* Custom Templates */}
                  {customTemplates.length > 0 && (
                    <div>
                      <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#787b86]">
                        My Templates
                      </div>
                      {customTemplates.map((tmpl) => (
                        <div
                          key={tmpl.id}
                          onClick={() => handleApplyTemplate(tmpl)}
                          className={`group flex items-center justify-between px-3 py-1.5 hover:bg-[#2a2e39] text-[#d1d4dc] transition-colors cursor-pointer ${
                            activeTemplateId === tmpl.id ? 'bg-[#2a2e39]/60 font-medium' : ''
                          }`}
                        >
                          <span className="truncate pr-2">{tmpl.name}</span>
                          <div className="flex items-center space-x-1.5 shrink-0">
                            {activeTemplateId === tmpl.id && (
                              <Check size={12} className="text-[#2962ff]" />
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsTemplateMenuOpen(false);
                                setTemplateToDelete(tmpl);
                              }}
                              className="p-1 rounded text-[#787b86] hover:text-[#f23645] hover:bg-[#363a45] transition-colors cursor-pointer"
                              title={`Delete ${tmpl.name}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="h-[1px] bg-[#2a2e39] my-1" />
                    </div>
                  )}

                  {/* Built-in Presets */}
                  {builtinTemplates.length > 0 && (
                    <div>
                      <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#787b86]">
                        Presets
                      </div>
                      {builtinTemplates.map((tmpl) => (
                        <div
                          key={tmpl.id}
                          onClick={() => handleApplyTemplate(tmpl)}
                          className={`group flex items-center justify-between px-3 py-1.5 hover:bg-[#2a2e39] text-[#d1d4dc] transition-colors cursor-pointer ${
                            activeTemplateId === tmpl.id ? 'bg-[#2a2e39]/60 font-medium' : ''
                          }`}
                        >
                          <span className="truncate pr-2">{tmpl.name}</span>
                          <div className="flex items-center space-x-1.5 shrink-0">
                            {activeTemplateId === tmpl.id && (
                              <Check size={12} className="text-[#2962ff]" />
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsTemplateMenuOpen(false);
                                setTemplateToDelete(tmpl);
                              }}
                              className="p-1 rounded text-[#787b86] hover:text-[#f23645] hover:bg-[#363a45] transition-colors cursor-pointer"
                              title={`Delete ${tmpl.name}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right: Apply to all, Cancel, Ok */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleApplyToAll}
              className="px-3 py-1.5 rounded-[4px] border border-[#363a45] hover:border-[#434651] hover:bg-[#2a2e39]/50 text-xs text-[#d1d4dc] font-medium transition-colors cursor-pointer"
            >
              Apply to all
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-[4px] border border-[#363a45] hover:border-[#434651] hover:bg-[#2a2e39]/50 text-xs text-[#d1d4dc] font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleOk}
              className="px-4 py-1.5 rounded-[4px] bg-white hover:bg-[#e0e3eb] text-black text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              Ok
            </button>
          </div>
        </div>
      </div>

      {/* Save Chart Template Modal */}
      <SaveChartTemplateModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        onSave={handleSaveTemplate}
      />

      {/* Delete Chart Template Modal */}
      <DeleteChartTemplateModal
        isOpen={templateToDelete !== null}
        template={templateToDelete}
        onClose={() => setTemplateToDelete(null)}
        onDelete={(id) => handleDeleteTemplate(id)}
      />
    </>
  );
};
