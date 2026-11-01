import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSyncStore } from '../../store/syncStore';
import { INDICATOR_REGISTRY } from '../../indicators/registry';
import type { IndicatorPlotStyle } from '../../indicators/types';
import { X, ChevronDown } from 'lucide-react';
import { ColorPickerPopover } from '../Common/ColorPickerPopover';

type TabType = 'inputs' | 'style' | 'visibility';

export const IndicatorSettingsModal: React.FC = () => {
  const activeSettings = useSyncStore((s) => s.activeSettingsIndicator);
  const closeIndicatorSettings = useSyncStore((s) => s.closeIndicatorSettings);
  const indicatorsMap = useSyncStore((s) => s.indicators);
  const updateIndicatorInputs = useSyncStore((s) => s.updateIndicatorInputs);
  const updateIndicatorStyles = useSyncStore((s) => s.updateIndicatorStyles);

  const paneId = activeSettings?.paneId ?? '';
  const indicatorId = activeSettings?.indicatorId ?? '';
  const indicator = indicatorsMap[paneId]?.find((ind) => ind.id === indicatorId);
  const def = indicator ? INDICATOR_REGISTRY[indicator.type] : null;

  const [activeTab, setActiveTab] = useState<TabType>('inputs');
  const [localInputs, setLocalInputs] = useState<Record<string, any>>({});
  const [localStyles, setLocalStyles] = useState<Record<string, IndicatorPlotStyle>>({});
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);

  // Snapshot original inputs & styles when modal opens to allow instant revert on Cancel
  const originalSnapshotRef = useRef<{
    inputs: Record<string, any>;
    styles: Record<string, IndicatorPlotStyle>;
  } | null>(null);

  // Sync draft when incoming indicator changes or modal opens
  useEffect(() => {
    if (indicator && activeSettings) {
      const snap = {
        inputs: JSON.parse(JSON.stringify(indicator.inputs)),
        styles: JSON.parse(JSON.stringify(indicator.styles)),
      };
      originalSnapshotRef.current = snap;
      setLocalInputs(snap.inputs);
      setLocalStyles(snap.styles);
      setActiveTab('inputs');
    }
  }, [indicator?.id, activeSettings?.indicatorId]);

  // Viewport clamping & position logic (identical to DrawingSettingsModal)
  const modalRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const getClampedPos = (x: number, y: number) => {
    const modalW = modalRef.current?.offsetWidth || 370;
    const modalH = modalRef.current?.offsetHeight || 500;
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

  const getInitialCenterPos = () => {
    const w = 370;
    const h = 500;
    const winW = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const left = Math.max(8, Math.min(winW - w - 8, Math.round((winW - w) / 2)));
    const top = Math.max(8, Math.min(winH - h - 8, Math.round((winH - h) / 2)));
    return { x: left, y: top };
  };

  const [pos, setPos] = useState<{ x: number; y: number }>(getInitialCenterPos);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentPosRef = useRef<{ x: number; y: number }>(getInitialCenterPos());

  // Re-center when modal newly opens
  const wasOpenRef = useRef(false);
  const isOpen = Boolean(activeSettings && indicator && def);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const center = getInitialCenterPos();
      setPos(center);
      currentPosRef.current = center;
      if (modalRef.current) {
        modalRef.current.style.left = `${center.x}px`;
        modalRef.current.style.top = `${center.y}px`;
      }
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

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

  const handleDragStart = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'BUTTON' ||
      target.tagName === 'SELECT' ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select')
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

  // Fluid pointer movement with rAF batching & pointer capture (eliminates lag across monitors)
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

  // Live update inputs on chart
  const handleInputChange = (key: string, value: any) => {
    const next = { ...localInputs, [key]: value };
    setLocalInputs(next);
    updateIndicatorInputs(paneId, indicatorId, next);
  };

  // Live update styles on chart
  const handleStyleChange = (plotId: string, updates: Partial<IndicatorPlotStyle>) => {
    const current = localStyles[plotId] || def?.defaultStyles[plotId] || { color: '#2962ff', lineWidth: 2 };
    const nextPlot = { ...current, ...updates };
    const nextStyles = { ...localStyles, [plotId]: nextPlot };
    setLocalStyles(nextStyles);
    updateIndicatorStyles(paneId, indicatorId, nextStyles);
  };

  // Toggle price scale labels across all plots (does NOT draw horizontal lines across chart)
  const handleGlobalPriceScaleLabelToggle = (visible: boolean) => {
    if (!def) return;
    const nextStyles: Record<string, IndicatorPlotStyle> = {};
    for (const plotId of Object.keys(def.plotLabels)) {
      const current = localStyles[plotId] || def.defaultStyles[plotId] || { color: '#2962ff', lineWidth: 2 };
      nextStyles[plotId] = {
        ...current,
        lastValueVisible: visible,
        priceLineVisible: false,
      };
    }
    setLocalStyles(nextStyles);
    updateIndicatorStyles(paneId, indicatorId, nextStyles);
  };

  // Revert changes on cancel
  const handleCancel = () => {
    if (originalSnapshotRef.current) {
      updateIndicatorInputs(paneId, indicatorId, originalSnapshotRef.current.inputs);
      updateIndicatorStyles(paneId, indicatorId, originalSnapshotRef.current.styles);
    }
    closeIndicatorSettings();
  };

  // Confirm changes
  const handleOk = () => {
    updateIndicatorInputs(paneId, indicatorId, localInputs);
    updateIndicatorStyles(paneId, indicatorId, localStyles);
    closeIndicatorSettings();
  };

  // Reset to defaults
  const handleApplyDefaults = () => {
    if (!def) return;
    const defInp = { ...def.defaultInputs };
    const defSty = JSON.parse(JSON.stringify(def.defaultStyles));
    setLocalInputs(defInp);
    setLocalStyles(defSty);
    updateIndicatorInputs(paneId, indicatorId, defInp);
    updateIndicatorStyles(paneId, indicatorId, defSty);
    setShowTemplateMenu(false);
  };

  const handleSaveAsDefault = () => {
    if (!def) return;
    try {
      localStorage.setItem(
        `ordercraft_indicator_template_${def.type}`,
        JSON.stringify({ inputs: localInputs, styles: localStyles })
      );
    } catch {}
    setShowTemplateMenu(false);
  };

  // ESC key listener to revert and close
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

  if (!isOpen || !indicator || !def) return null;

  // Determine if all plots currently show price scale labels
  const allPriceScaleLabelsVisible = Object.keys(def.plotLabels).every(
    (plotId) => (localStyles[plotId]?.lastValueVisible ?? true) !== false
  );

  const availableTabs: TabType[] = ['inputs', 'style', 'visibility'];

  return createPortal(
    <div
      ref={modalRef}
      style={{
        left: `${isDragging ? currentPosRef.current.x : pos.x}px`,
        top: `${isDragging ? currentPosRef.current.y : pos.y}px`,
        willChange: isDragging ? 'left, top' : 'auto',
        touchAction: 'none',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="fixed z-[9999] w-[370px] bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl flex flex-col overflow-hidden text-[#d1d4dc] select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Header: Indicator Title + Close Button */}
      <div
        ref={headerRef}
        onPointerDown={handleDragStart}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex items-center justify-between px-4 py-3 cursor-move border-b border-[#2a2e39]/80 select-none"
      >
        <div className="flex items-center space-x-2">
          <span className="text-base font-semibold text-[#d1d4dc]">{indicator.name}</span>
        </div>

        <button
          type="button"
          onClick={handleCancel}
          className="p-1 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc] transition-colors cursor-pointer"
          title="Close (Esc)"
        >
          <X size={16} />
        </button>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center px-4 border-b border-[#2a2e39] space-x-5 text-xs font-medium">
        {availableTabs.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`py-2.5 capitalize transition-colors relative cursor-pointer ${
                isActive ? 'text-[#d1d4dc] font-semibold' : 'text-[#787b86] hover:text-[#d1d4dc]'
              }`}
            >
              {tab}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#2962ff] rounded-t-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Body Content */}
      <div className="p-4 max-h-[440px] overflow-y-auto space-y-4">
        {/* INPUTS TAB */}
        {activeTab === 'inputs' && (
          <div className="space-y-3.5">
            {def.inputSchemas.length === 0 ? (
              <p className="text-xs text-[#787b86] py-6 text-center">
                This indicator does not require any input parameters.
              </p>
            ) : (
              def.inputSchemas.map((schema) => (
                <div key={schema.id} className="flex items-center justify-between gap-4">
                  <label className="text-xs text-[#d1d4dc] font-normal">{schema.name}</label>
                  {schema.type === 'number' ? (
                    <input
                      type="number"
                      min={schema.min ?? 1}
                      max={schema.max ?? 1000}
                      step={schema.step ?? 1}
                      value={localInputs[schema.id] ?? schema.default}
                      onChange={(e) =>
                        handleInputChange(schema.id, parseFloat(e.target.value) || schema.default)
                      }
                      className="w-28 px-2.5 py-1.5 rounded bg-[#131722] border border-[#2a2e39] hover:border-[#363a45] text-xs font-mono text-white text-right focus:outline-none focus:border-[#2962ff]"
                    />
                  ) : (
                    <select
                      value={localInputs[schema.id] ?? schema.default}
                      onChange={(e) => handleInputChange(schema.id, e.target.value)}
                      className="w-36 px-2.5 py-1.5 rounded bg-[#131722] border border-[#2a2e39] hover:border-[#363a45] text-xs text-white focus:outline-none focus:border-[#2962ff] cursor-pointer"
                    >
                      {schema.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* STYLE TAB */}
        {activeTab === 'style' && (
          <div className="space-y-4">
            {/* Plot Rows */}
            <div className="space-y-3">
              {Object.entries(def.plotLabels).map(([plotId, label]) => {
                const style = localStyles[plotId] || def.defaultStyles[plotId] || {
                  color: '#2962ff',
                  lineWidth: 2,
                  visible: true,
                };
                const isPlotVisible = style.visible !== false;
                const isPriceScaleVisible = style.lastValueVisible !== false;

                const isVolume = indicator.type === 'volume';
                const isVolPlot = isVolume && plotId === 'vol';
                const isHistogram = style.plotType === 'histogram' || isVolPlot;

                return (
                  <div
                    key={plotId}
                    className="p-2.5 rounded bg-[#171a22] border border-[#2a2e39] space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isPlotVisible}
                          onChange={(e) => {
                            handleStyleChange(plotId, { visible: e.target.checked });
                            if (isVolume && plotId === 'ma') {
                              handleInputChange('showMa', e.target.checked);
                            }
                          }}
                          className="rounded border-[#363a45] bg-[#131722] text-[#2962ff] focus:ring-0 cursor-pointer"
                        />
                        <span className="text-xs font-semibold text-[#d1d4dc]">{label}</span>
                      </label>

                      {/* Color Picker Swatch(es) using global ColorPickerPopover */}
                      {isVolPlot ? (
                        <div className="flex items-center gap-2.5">
                          <div className="flex items-center gap-1.5" title="Up volume (growing)">
                            <span className="text-[10px] font-medium text-[#787b86]">Up</span>
                            <ColorPickerPopover
                              color={style.colorUp || style.color || '#089981'}
                              onChange={(c) => handleStyleChange(plotId, { colorUp: c, color: c })}
                              title="Up Volume"
                            />
                          </div>
                          <div className="flex items-center gap-1.5" title="Down volume (falling)">
                            <span className="text-[10px] font-medium text-[#787b86]">Down</span>
                            <ColorPickerPopover
                              color={style.colorDown || '#f23645'}
                              onChange={(c) => handleStyleChange(plotId, { colorDown: c })}
                              title="Down Volume"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <ColorPickerPopover
                            color={style.color || '#2962ff'}
                            onChange={(color) => handleStyleChange(plotId, { color })}
                            title={label}
                          />
                        </div>
                      )}
                    </div>

                    {/* Width & Line Style Selector (only for line/non-histogram series) */}
                    {!isHistogram && (
                      <div className="flex items-center justify-between pt-0.5">
                        {/* Width buttons */}
                        <div className="flex items-center gap-1 bg-[#131722] p-0.5 rounded border border-[#2a2e39]">
                          {[1, 2, 3, 4].map((w) => (
                            <button
                              key={w}
                              type="button"
                              onClick={() => handleStyleChange(plotId, { lineWidth: w as 1 | 2 | 3 | 4 })}
                              className={`px-1.5 py-0.5 text-[10px] rounded font-mono cursor-pointer ${
                                (style.lineWidth || 1) === w
                                  ? 'bg-[#2962ff] text-white'
                                  : 'text-[#787b86] hover:text-white'
                              }`}
                            >
                              {w}px
                            </button>
                          ))}
                        </div>

                        {/* Line style dropdown */}
                        <select
                          value={style.lineStyle || 'solid'}
                          onChange={(e) =>
                            handleStyleChange(plotId, {
                              lineStyle: e.target.value as 'solid' | 'dashed' | 'dotted',
                            })
                          }
                          className="px-2 py-0.5 rounded bg-[#131722] border border-[#2a2e39] text-[11px] text-[#d1d4dc] focus:outline-none focus:border-[#2962ff] cursor-pointer"
                        >
                          <option value="solid">Solid</option>
                          <option value="dashed">Dashed</option>
                          <option value="dotted">Dotted</option>
                        </select>
                      </div>
                    )}

                    {/* Plot-specific Price scale label toggle (Request 4) */}
                    <div className="flex items-center justify-between pt-1 border-t border-[#2a2e39]/60">
                      <span className="text-[11px] text-[#787b86]">Price scale label</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isPriceScaleVisible}
                          onChange={(e) =>
                            handleStyleChange(plotId, {
                              lastValueVisible: e.target.checked,
                              priceLineVisible: false,
                            })
                          }
                          className="rounded border-[#363a45] bg-[#131722] text-[#2962ff] focus:ring-0 cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Master Price Scale Label Toggle */}
            <div className="flex items-center justify-between p-2.5 rounded bg-[#171a22] border border-[#2a2e39]">
              <span className="text-xs font-medium text-[#d1d4dc]">Labels on price scale</span>
              <input
                type="checkbox"
                checked={allPriceScaleLabelsVisible}
                onChange={(e) => handleGlobalPriceScaleLabelToggle(e.target.checked)}
                className="rounded border-[#363a45] bg-[#131722] text-[#2962ff] focus:ring-0 cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* VISIBILITY TAB */}
        {activeTab === 'visibility' && (
          <div className="space-y-3">
            <p className="text-xs text-[#787b86]">
              Select which timeframe ranges this indicator is active and visible on:
            </p>
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              {['Ticks', 'Seconds', 'Minutes', 'Hours', 'Days', 'Weeks'].map((tf) => (
                <label
                  key={tf}
                  className="flex items-center space-x-2 text-xs text-[#d1d4dc] cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    defaultChecked
                    className="rounded border-[#363a45] bg-[#131722] text-[#2962ff] focus:ring-0 cursor-pointer"
                  />
                  <span>{tf}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer: Defaults dropdown + Cancel / Ok buttons */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-[#2a2e39] bg-[#1a1d26]">
        {/* Template / Defaults Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTemplateMenu(!showTemplateMenu)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded border border-[#363a45] hover:border-[#787b86] hover:bg-[#2a2e39] text-xs text-[#d1d4dc] transition-colors cursor-pointer"
          >
            <span>Defaults</span>
            <ChevronDown size={13} className="text-[#787b86]" />
          </button>

          {showTemplateMenu && (
            <div className="absolute bottom-full left-0 mb-1 z-50 bg-[#1e222d] border border-[#2a2e39] rounded shadow-2xl py-1 w-44 text-xs">
              <button
                type="button"
                onClick={handleApplyDefaults}
                className="w-full text-left px-3 py-1.5 hover:bg-[#2a2e39] text-[#d1d4dc] transition-colors cursor-pointer"
              >
                Apply default template
              </button>
              <button
                type="button"
                onClick={handleSaveAsDefault}
                className="w-full text-left px-3 py-1.5 hover:bg-[#2a2e39] text-[#d1d4dc] transition-colors cursor-pointer"
              >
                Save as default
              </button>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleCancel}
            className="px-3.5 py-1.5 rounded border border-[#363a45] hover:border-[#787b86] hover:bg-[#2a2e39] text-xs text-[#d1d4dc] font-medium transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleOk}
            className="px-4 py-1.5 rounded bg-white hover:bg-[#e0e3eb] text-black text-xs font-semibold shadow transition-colors cursor-pointer"
          >
            Ok
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
