import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSyncStore } from '../../store/syncStore';
import { INDICATOR_REGISTRY, SOURCE_OPTIONS } from '../../indicators/registry';
import { normalizeIndicatorId } from '../../indicators/migration';
import type {
  IndicatorPlotStyle,
  IndicatorInputValues,
  IndicatorInputValue,
  IndicatorBandStyle,
  IndicatorLevelStyle,
  IndicatorPlotType,
} from '../../indicators/types';
import { X, ChevronDown, Layers, Sliders, Info, HelpCircle } from 'lucide-react';
import { ColorPickerPopover } from '../Common/ColorPickerPopover';

type TabType = 'inputs' | 'style' | 'visibility';

export const IndicatorSettingsModal: React.FC = () => {
  const activeSettings = useSyncStore((s) => s.activeSettingsIndicator);
  const closeIndicatorSettings = useSyncStore((s) => s.closeIndicatorSettings);
  const indicatorsMap = useSyncStore((s) => s.indicators);
  const updateIndicatorInputs = useSyncStore((s) => s.updateIndicatorInputs);
  const updateIndicatorStyles = useSyncStore((s) => s.updateIndicatorStyles);
  const updateIndicatorBands = useSyncStore((s) => s.updateIndicatorBands);
  const updateIndicatorLevels = useSyncStore((s) => s.updateIndicatorLevels);
  const updateIndicatorMeta = useSyncStore((s) => s.updateIndicatorMeta);

  const paneId = activeSettings?.paneId ?? '';
  const indicatorId = activeSettings?.indicatorId ?? '';
  const indicator = indicatorsMap[paneId]?.find((ind) => ind.id === indicatorId);
  const def = indicator
    ? INDICATOR_REGISTRY[indicator.type] ||
      INDICATOR_REGISTRY[normalizeIndicatorId(indicator.type)] ||
      null
    : null;

  const [activeTab, setActiveTab] = useState<TabType>('inputs');
  const [localInputs, setLocalInputs] = useState<IndicatorInputValues>({});
  const [localStyles, setLocalStyles] = useState<Record<string, IndicatorPlotStyle>>({});
  const [localBands, setLocalBands] = useState<IndicatorBandStyle[]>([]);
  const [localLevels, setLocalLevels] = useState<IndicatorLevelStyle[]>([]);
  const [localPrecision, setLocalPrecision] = useState<string>('default');
  const [localTimeframe, setLocalTimeframe] = useState<string>('chart');
  const [localWaitForClose, setLocalWaitForClose] = useState<boolean>(true);
  const [localLabelsOnPriceScale, setLocalLabelsOnPriceScale] = useState<boolean>(true);
  const [localValuesInStatusLine, setLocalValuesInStatusLine] = useState<boolean>(true);
  const [localInputsInStatusLine, setLocalInputsInStatusLine] = useState<boolean>(true);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [plotTypeDropdownPlotId, setPlotTypeDropdownPlotId] = useState<string | null>(null);

  // Snapshot original inputs & styles when modal opens to allow instant revert on Cancel
  const originalSnapshotRef = useRef<{
    inputs: IndicatorInputValues;
    styles: Record<string, IndicatorPlotStyle>;
    bands?: IndicatorBandStyle[];
    levels?: IndicatorLevelStyle[];
    precision?: number | 'default';
    timeframe?: string;
    waitForClose?: boolean;
    showLabelsOnPriceScale?: boolean;
    showValuesInStatusLine?: boolean;
    showInputsInStatusLine?: boolean;
  } | null>(null);

  // Sync draft when incoming indicator changes or modal opens
  useEffect(() => {
    if (indicator && activeSettings) {
      // Build robust base styles ensuring all declared plots exist
      const baseStyles: Record<string, IndicatorPlotStyle> = {};
      if (def?.defaultStyles) {
        for (const [k, v] of Object.entries(def.defaultStyles)) {
          baseStyles[k] = { ...v };
        }
      }
      if (indicator.styles) {
        for (const [k, v] of Object.entries(indicator.styles)) {
          baseStyles[k] = { ...v };
        }
      }

      // Backfill up/down from legacy plot (value/plot/trend) if indicator was saved with legacy schema
      const hasUpAndDown = def?.plotLabels && 'up' in def.plotLabels && 'down' in def.plotLabels;
      if (hasUpAndDown) {
        const legacy = indicator.styles?.value || indicator.styles?.plot || indicator.styles?.trend;
        if (!baseStyles.up) {
          baseStyles.up = {
            color: legacy?.colorUp || def?.defaultStyles?.up?.color || '#089981',
            lineWidth: legacy?.lineWidth || def?.defaultStyles?.up?.lineWidth || 2,
            lineStyle: legacy?.lineStyle || def?.defaultStyles?.up?.lineStyle || 'solid',
            plotType: legacy?.plotType || def?.defaultStyles?.up?.plotType || 'line',
            visible: legacy?.visible !== false,
            lastValueVisible: legacy?.lastValueVisible !== false,
            priceLineVisible: false,
          };
        }
        if (!baseStyles.down) {
          baseStyles.down = {
            color: legacy?.colorDown || def?.defaultStyles?.down?.color || '#f23645',
            lineWidth: legacy?.lineWidth || def?.defaultStyles?.down?.lineWidth || 2,
            lineStyle: legacy?.lineStyle || def?.defaultStyles?.down?.lineStyle || 'solid',
            plotType: legacy?.plotType || def?.defaultStyles?.down?.plotType || 'line',
            visible: legacy?.visible !== false,
            lastValueVisible: legacy?.lastValueVisible !== false,
            priceLineVisible: false,
          };
        }
      }

      // Backfill missing bands or styles in store if indicator was created without them
      if (!indicator.bands && def?.defaultBands && def.defaultBands.length > 0) {
        updateIndicatorBands(paneId, indicatorId, def.defaultBands);
      }
      if (def?.defaultStyles) {
        let hasMissingStyles = false;
        for (const k of Object.keys(def.defaultStyles)) {
          if (!indicator.styles?.[k]) {
            hasMissingStyles = true;
            break;
          }
        }
        if (hasMissingStyles) {
          updateIndicatorStyles(paneId, indicatorId, baseStyles);
        }
      }

      const snap = {
        inputs: JSON.parse(JSON.stringify(indicator.inputs || {})),
        styles: baseStyles,
        bands: indicator.bands ? JSON.parse(JSON.stringify(indicator.bands)) : (def?.defaultBands ? JSON.parse(JSON.stringify(def.defaultBands)) : undefined),
        levels: indicator.levels ? JSON.parse(JSON.stringify(indicator.levels)) : undefined,
        precision: indicator.precision,
        timeframe: indicator.timeframe,
        waitForClose: indicator.waitForClose,
        showLabelsOnPriceScale: indicator.showLabelsOnPriceScale,
        showValuesInStatusLine: indicator.showValuesInStatusLine,
        showInputsInStatusLine: indicator.showInputsInStatusLine,
      };
      originalSnapshotRef.current = snap;
      setLocalInputs(snap.inputs);
      setLocalStyles(snap.styles);
      setLocalBands(snap.bands || (def?.defaultBands ? JSON.parse(JSON.stringify(def.defaultBands)) : []));
      const rawLevels = snap.levels || (def?.defaultLevels ? JSON.parse(JSON.stringify(def.defaultLevels)) : []);
      const effectiveLevels = (rawLevels as IndicatorLevelStyle[]).map((lvl) => {
        let color = lvl.color;
        const rawLabel = (lvl.label || '').trim();
        const isOverbought = /overbought|upper/i.test(rawLabel) || lvl.value === 70 || lvl.value === 80;
        const isOversold = /oversold|lower/i.test(rawLabel) || lvl.value === 30 || lvl.value === 20;
        if (!color || color === '#787B86' || color === '#787b86' || color === '#434651') {
          if (isOverbought) color = '#F23645';
          else if (isOversold) color = '#089981';
        }
        const cleanLabel = rawLabel.replace(/\s*\(\s*[-+]?\d*\.?\d+\s*\)\s*$/, '');
        return {
          ...lvl,
          color,
          label: cleanLabel || lvl.label,
        };
      });
      setLocalLevels(effectiveLevels);
      setLocalPrecision(snap.precision !== undefined ? String(snap.precision) : 'default');
      setLocalTimeframe(snap.timeframe || 'chart');
      setLocalWaitForClose(snap.waitForClose !== false);
      setLocalLabelsOnPriceScale(snap.showLabelsOnPriceScale !== false);
      setLocalValuesInStatusLine(snap.showValuesInStatusLine !== false);
      setLocalInputsInStatusLine(snap.showInputsInStatusLine !== false);
      setActiveTab('inputs');
      setShowTemplateMenu(false);
      setPlotTypeDropdownPlotId(null);
    }
  }, [indicator?.id, activeSettings?.indicatorId, def?.defaultBands, def?.defaultLevels]);

  // Viewport clamping & position logic
  const modalRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const getInitialCenterPos = () => {
    const w = 380;
    const h = 520;
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

  // Drag listeners
  useEffect(() => {
    if (!isOpen) return;

    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - dragStartMouseRef.current.x;
      const dy = e.clientY - dragStartMouseRef.current.y;
      const nextX = dragStartPosRef.current.x + dx;
      const nextY = dragStartPosRef.current.y + dy;

      const modalW = modalRef.current?.offsetWidth || 380;
      const modalH = modalRef.current?.offsetHeight || 520;
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      const clampedX = Math.max(8, Math.min(winW - modalW - 8, nextX));
      const clampedY = Math.max(8, Math.min(winH - modalH - 8, nextY));

      currentPosRef.current = { x: clampedX, y: clampedY };
      if (modalRef.current) {
        modalRef.current.style.left = `${clampedX}px`;
        modalRef.current.style.top = `${clampedY}px`;
      }
    };

    const onPointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
        setPos(currentPosRef.current);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [isOpen]);

  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartMouseRef.current = { x: e.clientX, y: e.clientY };
    dragStartPosRef.current = { ...pos };
  };

  if (!isOpen || !indicator || !def) return null;

  // Real-time live update for instant interactive preview
  const handleInputChange = (key: string, value: IndicatorInputValue) => {
    const next: IndicatorInputValues = { ...localInputs, [key]: value };
    setLocalInputs(next);
    updateIndicatorInputs(paneId, indicatorId, next);
  };

  const handleStyleChange = (plotId: string, partial: Partial<IndicatorPlotStyle>) => {
    const defaultColor =
      plotId === 'up' ? '#089981' : plotId === 'down' ? '#f23645' : '#2962ff';
    const existing = localStyles[plotId] || def?.defaultStyles[plotId] || {
      color: defaultColor,
      lineWidth: 2,
      visible: true,
      priceLineVisible: false,
    };
    const nextStyles: Record<string, IndicatorPlotStyle> = {
      ...localStyles,
      [plotId]: { ...existing, ...partial, priceLineVisible: false },
    };
    setLocalStyles(nextStyles);
    updateIndicatorStyles(paneId, indicatorId, nextStyles);
  };

  const handleBandChange = (bandIndex: number, partial: Partial<IndicatorBandStyle>) => {
    const nextBands = localBands.map((b, idx) =>
      idx === bandIndex ? { ...b, ...partial } : b
    );
    setLocalBands(nextBands);
    updateIndicatorBands(paneId, indicatorId, nextBands);
  };

  const handleLevelChange = (levelIndex: number, partial: Partial<IndicatorLevelStyle>) => {
    const nextLevels = localLevels.map((l, idx) =>
      idx === levelIndex ? { ...l, ...partial } : l
    );
    setLocalLevels(nextLevels);
    updateIndicatorLevels(paneId, indicatorId, nextLevels);
  };

  const handleTimeframeChange = (tf: string) => {
    setLocalTimeframe(tf);
    updateIndicatorMeta(paneId, indicatorId, { timeframe: tf });
  };

  const handleWaitForCloseChange = (wait: boolean) => {
    setLocalWaitForClose(wait);
    updateIndicatorMeta(paneId, indicatorId, { waitForClose: wait });
  };

  const handlePrecisionChange = (p: string) => {
    setLocalPrecision(p);
    updateIndicatorMeta(paneId, indicatorId, {
      precision: p === 'default' ? 'default' : parseInt(p, 10),
    });
  };

  const handleLabelsOnPriceScaleToggle = (visible: boolean) => {
    setLocalLabelsOnPriceScale(visible);
    updateIndicatorMeta(paneId, indicatorId, { showLabelsOnPriceScale: visible });
    // Also sync to plot styles lastValueVisible
    const nextStyles: Record<string, IndicatorPlotStyle> = {};
    for (const plotId of Object.keys(def.plotLabels)) {
      const existing = localStyles[plotId] || def.defaultStyles[plotId] || {
        color: '#2962ff',
        lineWidth: 2,
        visible: true,
      };
      nextStyles[plotId] = {
        ...existing,
        lastValueVisible: visible,
        priceLineVisible: false,
      };
    }
    setLocalStyles(nextStyles);
    updateIndicatorStyles(paneId, indicatorId, nextStyles);
  };

  const handleValuesInStatusLineToggle = (visible: boolean) => {
    setLocalValuesInStatusLine(visible);
    updateIndicatorMeta(paneId, indicatorId, { showValuesInStatusLine: visible });
  };

  const handleInputsInStatusLineToggle = (visible: boolean) => {
    setLocalInputsInStatusLine(visible);
    updateIndicatorMeta(paneId, indicatorId, { showInputsInStatusLine: visible });
  };

  const handleOk = () => {
    closeIndicatorSettings();
  };

  const handleCancel = () => {
    if (originalSnapshotRef.current) {
      updateIndicatorInputs(paneId, indicatorId, originalSnapshotRef.current.inputs);
      updateIndicatorStyles(paneId, indicatorId, originalSnapshotRef.current.styles);
      if (originalSnapshotRef.current.bands) {
        updateIndicatorBands(paneId, indicatorId, originalSnapshotRef.current.bands);
      }
      if (originalSnapshotRef.current.levels) {
        updateIndicatorLevels(paneId, indicatorId, originalSnapshotRef.current.levels);
      }
      updateIndicatorMeta(paneId, indicatorId, {
        precision: originalSnapshotRef.current.precision,
        timeframe: originalSnapshotRef.current.timeframe,
        waitForClose: originalSnapshotRef.current.waitForClose,
        showLabelsOnPriceScale: originalSnapshotRef.current.showLabelsOnPriceScale,
        showValuesInStatusLine: originalSnapshotRef.current.showValuesInStatusLine,
        showInputsInStatusLine: originalSnapshotRef.current.showInputsInStatusLine,
      });
    }
    closeIndicatorSettings();
  };

  const handleApplyDefaults = () => {
    setLocalInputs(def.defaultInputs);
    setLocalStyles(def.defaultStyles);
    if (def.defaultBands) setLocalBands(def.defaultBands);
    if (def.defaultLevels) setLocalLevels(def.defaultLevels);
    setLocalPrecision('default');
    setLocalTimeframe('chart');
    setLocalWaitForClose(true);
    setLocalLabelsOnPriceScale(true);
    setLocalValuesInStatusLine(true);
    setLocalInputsInStatusLine(true);

    updateIndicatorInputs(paneId, indicatorId, def.defaultInputs);
    updateIndicatorStyles(paneId, indicatorId, def.defaultStyles);
    if (def.defaultBands) updateIndicatorBands(paneId, indicatorId, def.defaultBands);
    if (def.defaultLevels) updateIndicatorLevels(paneId, indicatorId, def.defaultLevels);
    updateIndicatorMeta(paneId, indicatorId, {
      precision: 'default',
      timeframe: 'chart',
      waitForClose: true,
      showLabelsOnPriceScale: true,
      showValuesInStatusLine: true,
      showInputsInStatusLine: true,
    });
    setShowTemplateMenu(false);
  };

  const handleSaveAsDefault = () => {
    setShowTemplateMenu(false);
  };

  if (!activeSettings || !indicator || !def) {
    return null;
  }

  const modalTitle = def.shortName || def.name;

  return createPortal(
    <div
      ref={modalRef}
      style={{
        position: 'fixed',
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        zIndex: 9999,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
      className="w-[380px] rounded-xl border border-[#2a2e39] bg-[#1e222d] shadow-2xl overflow-hidden select-none animate-in fade-in zoom-in-95 duration-100 flex flex-col font-sans"
    >
      {/* Header — Clean title + X close button (matching Image 6 & 7) */}
      <div
        ref={headerRef}
        onPointerDown={handleHeaderPointerDown}
        className="flex items-center justify-between px-5 pt-4 pb-3 cursor-grab active:cursor-grabbing select-none"
      >
        <h3 className="text-sm font-bold text-white tracking-wide">{modalTitle}</h3>
        <button
          type="button"
          onClick={handleCancel}
          className="p-1 rounded text-[#787b86] hover:text-white hover:bg-[#2a2e39] transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Navigation Tabs (Inputs | Style | Visibility) */}
      <div className="flex border-b border-[#2a2e39] px-5 text-xs font-medium text-[#787b86]">
        {(['inputs', 'style', 'visibility'] as TabType[]).map((tab) => {
          const isActive = activeTab === tab;
          const label = tab === 'inputs' ? 'Inputs' : tab === 'style' ? 'Style' : 'Visibility';
          return (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setActiveTab(tab);
                setPlotTypeDropdownPlotId(null);
              }}
              className={`pb-2.5 px-3 border-b-2 font-medium capitalize transition-colors cursor-pointer mr-2 ${
                isActive
                  ? 'border-white text-white font-semibold'
                  : 'border-transparent hover:text-[#d1d4dc]'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Body Content */}
      <div className="p-5 max-h-[420px] overflow-y-auto space-y-4">
        {/* INPUTS TAB */}
        {activeTab === 'inputs' && (
          <div className="space-y-4">
            {def.inputSchemas.length === 0 ? (
              <p className="text-xs text-[#787b86] py-6 text-center">
                This indicator does not require any input parameters.
              </p>
            ) : (
              <div className="space-y-3.5">
                {def.inputSchemas.map((schema) => {
                  const rawVal = localInputs[schema.id] ?? schema.default;
                  const isNumeric =
                    schema.type === 'integer' ||
                    schema.type === 'float' ||
                    schema.type === 'number';

                  // Show info icon for offset, sigma, or parameters with descriptions
                  const hasInfo =
                    schema.id === 'offset' ||
                    schema.id === 'sigma' ||
                    Boolean(schema.description && schema.description !== schema.name);

                  return (
                    <div key={schema.id} className="flex items-center justify-between gap-4">
                      <label className="text-xs text-[#d1d4dc] font-normal">{schema.name}</label>
                      {isNumeric ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={schema.min ?? (schema.type === 'integer' ? 1 : undefined)}
                            max={schema.max ?? (schema.type === 'integer' ? 1000 : undefined)}
                            step={schema.step ?? (schema.type === 'integer' ? 1 : 0.01)}
                            value={Number(rawVal)}
                            onChange={(e) => {
                              const num =
                                schema.type === 'integer'
                                  ? parseInt(e.target.value, 10)
                                  : parseFloat(e.target.value);
                              handleInputChange(
                                schema.id,
                                isNaN(num) ? (schema.default as number) : num
                              );
                            }}
                            className="w-24 px-2.5 py-1.5 rounded bg-[#131722] border border-[#2a2e39] hover:border-[#363a45] text-xs font-mono text-white text-right focus:outline-none focus:border-[#2962ff]"
                          />
                          {hasInfo && (
                            <div
                              title={schema.description || schema.name}
                              className="text-[#787b86] hover:text-[#d1d4dc] cursor-help"
                            >
                              <Info size={13} />
                            </div>
                          )}
                        </div>
                      ) : schema.type === 'boolean' ? (
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(rawVal)}
                            onChange={(e) => handleInputChange(schema.id, e.target.checked)}
                            className="rounded border-[#363a45] bg-[#131722] text-[#2962ff] focus:ring-0 cursor-pointer w-4 h-4"
                          />
                        </label>
                      ) : schema.type === 'source' ? (
                        <select
                          value={String(rawVal)}
                          onChange={(e) => handleInputChange(schema.id, e.target.value)}
                          className="w-32 px-2.5 py-1.5 rounded bg-[#131722] border border-[#2a2e39] hover:border-[#363a45] text-xs text-white focus:outline-none focus:border-[#2962ff] cursor-pointer"
                        >
                          {(schema.options && schema.options.length > 0
                            ? schema.options
                            : SOURCE_OPTIONS
                          ).map((opt) => (
                            <option key={String(opt.value)} value={String(opt.value)}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : schema.type === 'select' ? (
                        <select
                          value={String(rawVal)}
                          onChange={(e) => handleInputChange(schema.id, e.target.value)}
                          className="w-32 px-2.5 py-1.5 rounded bg-[#131722] border border-[#2a2e39] hover:border-[#363a45] text-xs text-white focus:outline-none focus:border-[#2962ff] cursor-pointer"
                        >
                          {schema.options?.map((opt) => (
                            <option key={String(opt.value)} value={String(opt.value)}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={String(rawVal)}
                          onChange={(e) => handleInputChange(schema.id, e.target.value)}
                          className="w-32 px-2.5 py-1.5 rounded bg-[#131722] border border-[#2a2e39] hover:border-[#363a45] text-xs text-white focus:outline-none focus:border-[#2962ff]"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* CALCULATION SECTION (Image 6) */}
            <div className="pt-4 border-t border-[#2a2e39]/60 space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#787b86]">
                Calculation
              </div>

              {/* Timeframe selector */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#d1d4dc]">Timeframe</span>
                <div className="flex items-center gap-2">
                  <select
                    value={localTimeframe}
                    onChange={(e) => handleTimeframeChange(e.target.value)}
                    className="w-28 px-2.5 py-1.5 rounded bg-[#131722] border border-[#2a2e39] hover:border-[#363a45] text-xs text-white focus:outline-none focus:border-[#2962ff] cursor-pointer"
                  >
                    <option value="chart">Chart</option>
                    <option value="1s">1 second</option>
                    <option value="1m">1 minute</option>
                    <option value="3m">3 minutes</option>
                    <option value="5m">5 minutes</option>
                    <option value="15m">15 minutes</option>
                    <option value="30m">30 minutes</option>
                    <option value="1h">1 hour</option>
                    <option value="2h">2 hours</option>
                    <option value="4h">4 hours</option>
                    <option value="1d">1 day</option>
                    <option value="1w">1 week</option>
                  </select>
                  <div
                    title="Timeframe data used for calculating this indicator"
                    className="text-[#787b86] hover:text-[#d1d4dc] cursor-help"
                  >
                    <HelpCircle size={13} />
                  </div>
                </div>
              </div>

              {/* Wait for timeframe closes */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none pt-0.5">
                <input
                  type="checkbox"
                  checked={localWaitForClose}
                  onChange={(e) => handleWaitForCloseChange(e.target.checked)}
                  className="rounded border-[#363a45] bg-[#131722] text-[#2962ff] focus:ring-0 cursor-pointer w-4 h-4"
                />
                <span className="text-xs text-[#d1d4dc]">Wait for timeframe closes</span>
              </label>
            </div>
          </div>
        )}

        {/* STYLE TAB (Image 7) */}
        {activeTab === 'style' && (
          <div className="space-y-4">
            {/* Plot Rows */}
            <div className="space-y-3">
              {(() => {
                const hasTrendRegimes = 'up' in def.plotLabels && 'down' in def.plotLabels;
                const visiblePlotEntries = Object.entries(def.plotLabels).filter(([plotId]) => {
                  if (hasTrendRegimes && (plotId === 'value' || plotId === 'direction' || plotId === 'plot')) {
                    return false;
                  }
                  return true;
                });

                return visiblePlotEntries.map(([plotId, label]) => {
                  const defaultColor =
                    plotId === 'up' ? '#089981' : plotId === 'down' ? '#f23645' : '#2962ff';
                  const style = localStyles[plotId] || def.defaultStyles[plotId] || {
                    color: defaultColor,
                    lineWidth: 2,
                    visible: true,
                    priceLineVisible: false,
                  };
                  const isPlotVisible = style.visible !== false;
                  const isHistogram = style.plotType === 'histogram';

                  return (
                    <div key={plotId} className="flex items-center justify-between py-0.5">
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isPlotVisible}
                          onChange={(e) =>
                            handleStyleChange(plotId, { visible: e.target.checked })
                          }
                          className="rounded border-[#363a45] bg-[#131722] text-[#2962ff] focus:ring-0 cursor-pointer w-4 h-4"
                        />
                        <span className="text-xs font-semibold text-[#d1d4dc]">{label}</span>
                      </label>

                      {isHistogram ? (
                        <div className="flex items-center gap-2.5">
                          <div className="flex items-center gap-1.5" title="Up color">
                            <span className="text-[10px] font-medium text-[#787b86]">Up</span>
                            <ColorPickerPopover
                              color={style.colorUp || style.color || '#089981'}
                              onChange={(c) =>
                                handleStyleChange(plotId, { colorUp: c, color: c })
                              }
                              title="Up Color"
                            />
                          </div>
                          <div className="flex items-center gap-1.5" title="Down color">
                            <span className="text-[10px] font-medium text-[#787b86]">Down</span>
                            <ColorPickerPopover
                              color={style.colorDown || '#f23645'}
                              onChange={(c) => handleStyleChange(plotId, { colorDown: c })}
                              title="Down Color"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {/* Combined Swatch & Line Preview trigger */}
                          <ColorPickerPopover
                            showLine={true}
                            color={style.color || defaultColor}
                            lineWidth={style.lineWidth || 2}
                            lineStyle={style.lineStyle || 'solid'}
                            onChange={(color) => handleStyleChange(plotId, { color })}
                            onLineWidthChange={(lineWidth) => handleStyleChange(plotId, { lineWidth })}
                            onLineStyleChange={(lineStyle) => handleStyleChange(plotId, { lineStyle })}
                            title={label}
                          />

                          {/* Plot Style Selector (~ icon button with dropdown) */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setPlotTypeDropdownPlotId(
                                  plotTypeDropdownPlotId === plotId ? null : plotId
                                )
                              }
                              className="w-7 h-6 rounded-[3px] border border-[#363a45] hover:border-[#787b86] bg-[#131722] flex items-center justify-center text-[#d1d4dc] hover:text-white transition-colors cursor-pointer"
                              title="Plot type (Line, Step line, Histogram, Cross, Circles, Area)"
                            >
                              <svg className="w-4 h-3.5" viewBox="0 0 20 16" fill="none" stroke="currentColor" strokeWidth="2">
                                {style.plotType === 'stepline' ? (
                                  <path d="M2 12h4V8h6V4h6" />
                                ) : style.plotType === 'histogram' ? (
                                  <path d="M4 14V8M8 14V4M12 14V6M16 14V10" />
                                ) : (
                                  <path d="M2 10c3-5 6-5 9 0s5 5 7 0" />
                                )}
                              </svg>
                            </button>

                            {plotTypeDropdownPlotId === plotId && (
                              <div className="absolute right-0 top-full mt-1 z-50 bg-[#1e222d] border border-[#2a2e39] rounded-md shadow-2xl py-1 w-32 text-xs">
                                {[
                                  { id: 'line', label: 'Line' },
                                  { id: 'stepline', label: 'Step line' },
                                  { id: 'histogram', label: 'Histogram' },
                                  { id: 'cross', label: 'Cross' },
                                  { id: 'circles', label: 'Circles' },
                                  { id: 'area', label: 'Area' },
                                ].map((pt) => (
                                  <button
                                    key={pt.id}
                                    type="button"
                                    onClick={() => {
                                      handleStyleChange(plotId, {
                                        plotType: pt.id as IndicatorPlotType,
                                      });
                                      setPlotTypeDropdownPlotId(null);
                                    }}
                                    className={`w-full text-left px-3 py-1.5 hover:bg-[#2a2e39] transition-colors cursor-pointer ${
                                      (style.plotType || 'line') === pt.id
                                        ? 'text-[#2962ff] font-semibold'
                                        : 'text-[#d1d4dc]'
                                    }`}
                                  >
                                    {pt.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            {/* Shaded Bands Controls (e.g. Bollinger Bands, Keltner) */}
            {localBands.length > 0 && (
              <div className="pt-3 border-t border-[#2a2e39]/60 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <Layers className="w-3.5 h-3.5 text-[#2962ff]" />
                  <span>Shaded Bands</span>
                </div>
                {localBands.map((band, idx) => (
                  <div key={band.id || idx} className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={band.visible !== false}
                        onChange={(e) =>
                          handleBandChange(idx, { visible: e.target.checked })
                        }
                        className="rounded border-[#363a45] bg-[#131722] text-[#2962ff] focus:ring-0 cursor-pointer w-4 h-4"
                      />
                      <span className="text-xs text-[#d1d4dc]">{band.title || 'Channel Fill'}</span>
                    </label>
                    <ColorPickerPopover
                      color={band.fillColor || 'rgba(41, 98, 255, 0.2)'}
                      onChange={(c) => handleBandChange(idx, { fillColor: c })}
                      title="Band Fill Color"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Reference Levels Controls (e.g. RSI 70/30) */}
            {localLevels.length > 0 && (
              <div className="pt-3 border-t border-[#2a2e39]/60 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <Sliders className="w-3.5 h-3.5 text-[#089981]" />
                  <span>Reference Levels</span>
                </div>
                {localLevels.map((lvl, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={lvl.visible !== false}
                        onChange={(e) =>
                          handleLevelChange(idx, { visible: e.target.checked })
                        }
                        className="rounded border-[#363a45] bg-[#131722] text-[#2962ff] focus:ring-0 cursor-pointer w-4 h-4"
                      />
                      <span className="text-xs text-[#d1d4dc]">{lvl.label || `Level ${idx + 1}`}</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={lvl.value}
                        onChange={(e) =>
                          handleLevelChange(idx, { value: parseFloat(e.target.value) || 0 })
                        }
                        className="w-16 px-1.5 py-0.5 rounded bg-[#131722] border border-[#2a2e39] text-xs font-mono text-white text-right focus:outline-none focus:border-[#2962ff]"
                      />
                      <ColorPickerPopover
                        showLine={true}
                        color={lvl.color || '#787b86'}
                        lineWidth={lvl.lineWidth || 1}
                        lineStyle={lvl.lineStyle || 'dashed'}
                        onChange={(c) => handleLevelChange(idx, { color: c })}
                        onLineWidthChange={(lineWidth) => handleLevelChange(idx, { lineWidth })}
                        onLineStyleChange={(lineStyle) => handleLevelChange(idx, { lineStyle })}
                        title={lvl.label || `Level ${idx + 1}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* OUTPUT VALUES SECTION (Image 7) */}
            <div className="pt-4 border-t border-[#2a2e39]/60 space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#787b86]">
                Output Values
              </div>

              {/* Precision selector */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#d1d4dc]">Precision</span>
                <select
                  value={localPrecision}
                  onChange={(e) => handlePrecisionChange(e.target.value)}
                  className="w-28 px-2.5 py-1.5 rounded bg-[#131722] border border-[#2a2e39] hover:border-[#363a45] text-xs text-white focus:outline-none focus:border-[#2962ff] cursor-pointer"
                >
                  <option value="default">Default</option>
                  <option value="0">0</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                  <option value="6">6</option>
                  <option value="7">7</option>
                  <option value="8">8</option>
                </select>
              </div>

              {/* Labels on price scale */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={localLabelsOnPriceScale}
                  onChange={(e) => handleLabelsOnPriceScaleToggle(e.target.checked)}
                  className="rounded border-[#363a45] bg-[#131722] text-[#2962ff] focus:ring-0 cursor-pointer w-4 h-4"
                />
                <span className="text-xs text-[#d1d4dc]">Labels on price scale</span>
              </label>

              {/* Values in status line */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={localValuesInStatusLine}
                  onChange={(e) => handleValuesInStatusLineToggle(e.target.checked)}
                  className="rounded border-[#363a45] bg-[#131722] text-[#2962ff] focus:ring-0 cursor-pointer w-4 h-4"
                />
                <span className="text-xs text-[#d1d4dc]">Values in status line</span>
              </label>
            </div>

            {/* INPUT VALUES SECTION (Image 7) */}
            <div className="pt-4 border-t border-[#2a2e39]/60 space-y-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#787b86]">
                Input Values
              </div>

              {/* Inputs in status line */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={localInputsInStatusLine}
                  onChange={(e) => handleInputsInStatusLineToggle(e.target.checked)}
                  className="rounded border-[#363a45] bg-[#131722] text-[#2962ff] focus:ring-0 cursor-pointer w-4 h-4"
                />
                <span className="text-xs text-[#d1d4dc]">Inputs in status line</span>
              </label>
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
                    className="rounded border-[#363a45] bg-[#131722] text-[#2962ff] focus:ring-0 cursor-pointer w-4 h-4"
                  />
                  <span>{tf}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer (matching Image 6 & 7) */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-[#2a2e39] bg-[#171a22]">
        {/* Template / Defaults Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTemplateMenu(!showTemplateMenu)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded border border-[#2a2e39] bg-[#1e222d] hover:border-[#363a45] hover:bg-[#2a2e39] text-xs text-[#d1d4dc] transition-colors cursor-pointer"
          >
            <span>Defaults</span>
            <ChevronDown size={13} className="text-[#787b86]" />
          </button>

          {showTemplateMenu && (
            <div className="absolute bottom-full left-0 mb-1.5 z-50 bg-[#1e222d] border border-[#2a2e39] rounded shadow-2xl py-1 w-44 text-xs">
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
            className="px-4 py-1.5 rounded border border-[#2a2e39] bg-[#1e222d] hover:border-[#363a45] hover:bg-[#2a2e39] text-xs text-[#d1d4dc] font-medium transition-colors cursor-pointer"
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
