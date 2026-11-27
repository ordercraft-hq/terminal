import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Code2,
  Terminal,
  Play,
  PlusSquare,
  Maximize2,
  Minimize2,
  X,
  FileCode,
  Loader2,
  Check,
} from 'lucide-react';
import { useSyncStore } from '../../store/syncStore';
import { transport, type ScriptEvalResponsePayload } from '../../transport/client';
import { MonacoEditorPane } from './MonacoEditorPane';
import { ConsolePanel } from './ConsolePanel';
import { ScriptPermissionModal } from './ScriptPermissionModal';
import { ORDERSCRIPT_TEMPLATES } from './templates';
import { registerCustomIndicator } from '../../indicators/registry';
import type {
  IndicatorDefinition,
  IndicatorPlotStyle,
  IndicatorPlotType,
  IndicatorPlotDirective,
  IndicatorBandDirective,
} from '../../indicators/types';

export const ScriptEditorDrawer: React.FC = () => {
  const isBottomDrawerOpen = useSyncStore((state) => state.isBottomDrawerOpen);
  const bottomDrawerHeight = useSyncStore((state) => state.bottomDrawerHeight);
  const bottomDrawerTab = useSyncStore((state) => state.bottomDrawerTab);
  const activeScriptCode = useSyncStore((state) => state.activeScriptCode);
  const scriptConsoleLogs = useSyncStore((state) => state.scriptConsoleLogs);

  const toggleBottomDrawer = useSyncStore((state) => state.toggleBottomDrawer);
  const setBottomDrawerHeight = useSyncStore((state) => state.setBottomDrawerHeight);
  const setBottomDrawerTab = useSyncStore((state) => state.setBottomDrawerTab);
  const setActiveScriptCode = useSyncStore((state) => state.setActiveScriptCode);
  const addScriptConsoleLog = useSyncStore((state) => state.addScriptConsoleLog);
  const clearScriptConsoleLogs = useSyncStore((state) => state.clearScriptConsoleLogs);

  const activePaneId = useSyncStore((state) => state.activePaneId);
  const symbol = useSyncStore((state) => state.symbol);
  const timeframe = useSyncStore((state) => state.timeframe);
  const addIndicatorToPane = useSyncStore((state) => state.addIndicatorToPane);

  const [isRunning, setIsRunning] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addedSuccess, setAddedSuccess] = useState(false);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [preMaximizedHeight, setPreMaximizedHeight] = useState(bottomDrawerHeight);

  // Capability permissions modal state
  const [permissionModalOpen, setPermissionModalOpen] = useState(false);
  const [requestedPermissions, setRequestedPermissions] = useState<string[]>([]);
  const [grantedPermissions, setGrantedPermissions] = useState<string[]>([]);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);

  // Drag resizing state (commits to store on pointerup to avoid 60fps persist writes)
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(bottomDrawerHeight);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const dragHeightRef = useRef<number | null>(null);
  const addedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (addedTimerRef.current !== null) {
        window.clearTimeout(addedTimerRef.current);
      }
    };
  }, []);

  const effectiveHeight = dragHeight ?? bottomDrawerHeight;

  const clampHeight = (h: number) => {
    const maxH = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 650;
    return Math.max(160, Math.min(maxH, Math.round(h)));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = bottomDrawerHeight;
    dragHeightRef.current = bottomDrawerHeight;
    setDragHeight(bottomDrawerHeight);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const deltaY = startYRef.current - e.clientY;
    const newHeight = clampHeight(startHeightRef.current + deltaY);
    dragHeightRef.current = newHeight;
    setDragHeight(newHeight);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const finalHeight = dragHeightRef.current;
    dragHeightRef.current = null;
    setDragHeight(null);
    if (finalHeight !== null) {
      setBottomDrawerHeight(finalHeight);
    }
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture was lost
    }
  };

  const toggleMaximize = () => {
    if (isMaximized) {
      setBottomDrawerHeight(preMaximizedHeight);
      setIsMaximized(false);
    } else {
      setPreMaximizedHeight(bottomDrawerHeight);
      const maxHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 600;
      setBottomDrawerHeight(maxHeight);
      setIsMaximized(true);
    }
  };

  const applyTemplateById = (templateId: string) => {
    const tpl = ORDERSCRIPT_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    setActiveScriptCode(tpl.code);
    setScriptError(null);
    setPendingTemplateId(null);
  };

  const handleTemplateChange = (templateId: string) => {
    const tpl = ORDERSCRIPT_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    if (activeScriptCode.trim() !== '') {
      setPendingTemplateId(templateId);
      return;
    }
    applyTemplateById(templateId);
  };

  const applyScriptToChart = useCallback(
    async (
      evalData: ScriptEvalResponsePayload,
      permissionsToUse: string[],
      forceNew: boolean
    ) => {
      const nameMatch = activeScriptCode.match(/#\s*(.+)/);
      const scriptName = nameMatch && nameMatch[1] ? nameMatch[1].trim() : 'Custom Script';
      const timestamp = Date.now();
      const scriptId = `script.${scriptName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${timestamp}`;

      await transport.saveScript({
        id: scriptId,
        name: scriptName,
        code: activeScriptCode,
        permissions: permissionsToUse,
      });

      const defaultStyles: Record<string, IndicatorPlotStyle> = {};
      const plotLabels: Record<string, string> = {};
      const rawPlots = evalData.directives || [];
      const plots: IndicatorPlotDirective[] = [];

      for (const p of rawPlots) {
        const plotType = p.type as IndicatorPlotType;
        const color = p.color || '#2962FF';
        const lineWidth = p.lineWidth || 2;
        const lineStyle = p.lineStyle || 'solid';
        const overlay = p.overlay !== false;

        defaultStyles[p.id] = {
          color,
          colorUp: p.colorUp,
          colorDown: p.colorDown,
          lineWidth,
          lineStyle,
          plotType,
          visible: true,
          lastValueVisible: true,
          priceLineVisible: false,
          overlay,
        };
        plotLabels[p.id] = p.title || p.id;
        plots.push({
          id: p.id,
          type: plotType,
          title: p.title || p.id,
          color,
          colorUp: p.colorUp,
          colorDown: p.colorDown,
          lineWidth,
          lineStyle,
          visible: true,
          overlay,
        });
      }

      const bands: IndicatorBandDirective[] | undefined = evalData.bands?.map((b) => ({
        id: b.id,
        upperPlotId: b.plot1,
        lowerPlotId: b.plot2,
        fillColor: b.color || 'rgba(41, 98, 255, 0.2)',
        visible: true,
      }));

      const isOverlay = plots.some((p) => p.overlay !== false);

      const customDef: IndicatorDefinition = {
        id: scriptId,
        type: scriptId,
        name: scriptName,
        shortName: scriptName.substring(0, 8),
        family: 'Custom Script',
        category: isOverlay ? 'overlay' : 'subpane',
        catalogCategory: 'Custom Script',
        overlay: isOverlay,
        description: `OrderScript Custom Indicator: ${scriptName}`,
        inputs: [],
        inputSchemas: [],
        defaultInputs: {
          code: activeScriptCode,
          permissions: JSON.stringify(permissionsToUse),
        },
        plots,
        defaultStyles,
        plotLabels,
        defaultBands: bands,
      };

      registerCustomIndicator(customDef);

      const paneIndicators = useSyncStore.getState().indicators[activePaneId] || [];
      const existing = !forceNew
        ? paneIndicators.find(
            (i) => i.type.startsWith('script.') || (i.inputs && i.inputs.code === activeScriptCode)
          )
        : null;

      if (existing) {
        useSyncStore.getState().updateIndicatorInputs(activePaneId, existing.id, {
          code: activeScriptCode,
          permissions: JSON.stringify(permissionsToUse),
        });
        useSyncStore.getState().updateIndicatorStyles(activePaneId, existing.id, defaultStyles);
        addScriptConsoleLog(`[OK] Updated "${scriptName}" on chart pane "${activePaneId}".`);
      } else {
        addIndicatorToPane(activePaneId, scriptId);
        addScriptConsoleLog(`[OK] Added "${scriptName}" to chart pane "${activePaneId}".`);
      }

      setAddedSuccess(true);
      if (addedTimerRef.current !== null) {
        window.clearTimeout(addedTimerRef.current);
      }
      addedTimerRef.current = window.setTimeout(() => {
        setAddedSuccess(false);
        addedTimerRef.current = null;
      }, 2500);
    },
    [activeScriptCode, activePaneId, addIndicatorToPane, addScriptConsoleLog]
  );

  const handleRunScript = useCallback(
    async (permissionsToUse = grantedPermissions) => {
      if (isRunning) return;
      setIsRunning(true);
      setScriptError(null);

      const permMatch = activeScriptCode.match(/permissions\s*=\s*\[(.*?)\]/s);
      if (permMatch && permMatch[1]) {
        const extracted = permMatch[1]
          .split(',')
          .map((s) => s.replace(/['"\s]/g, ''))
          .filter(Boolean);

        const missing = extracted.filter((p) => !permissionsToUse.includes(p));
        if (missing.length > 0) {
          setRequestedPermissions(extracted);
          setPermissionModalOpen(true);
          setIsRunning(false);
          return;
        }
      }

      try {
        const data = await transport.runScript({
          code: activeScriptCode,
          symbol,
          resolution: timeframe,
          permissions: permissionsToUse,
        });

        if (!data.success) {
          const errMsg = data.error || 'Evaluation failed';
          setScriptError(errMsg);
          addScriptConsoleLog(`[ERROR] ${errMsg}`);
          setBottomDrawerTab('console');
          return;
        }

        setExecutionTimeMs(data.executionTimeMs ?? 0);
        if (Array.isArray(data.logs)) {
          for (const log of data.logs) {
            addScriptConsoleLog(log);
          }
        }
        addScriptConsoleLog(
          `[OK] Compiled and evaluated successfully in ${(data.executionTimeMs ?? 0).toFixed(2)}ms.`
        );

        await applyScriptToChart(data, permissionsToUse, false);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setScriptError(errMsg);
        addScriptConsoleLog(`[ERROR] Network or server error: ${errMsg}`);
        setBottomDrawerTab('console');
      } finally {
        setIsRunning(false);
      }
    },
    [
      activeScriptCode,
      symbol,
      timeframe,
      grantedPermissions,
      isRunning,
      addScriptConsoleLog,
      setBottomDrawerTab,
      applyScriptToChart,
    ]
  );

  const handleAddToChart = async () => {
    if (isAdding) return;
    setIsAdding(true);
    setScriptError(null);

    try {
      const data = await transport.runScript({
        code: activeScriptCode,
        symbol,
        resolution: timeframe,
        permissions: grantedPermissions,
      });

      if (!data.success) {
        throw new Error(data.error || 'Evaluation failed');
      }

      await applyScriptToChart(data, grantedPermissions, true);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setScriptError(errMsg);
      addScriptConsoleLog(`[ERROR] Add to chart failed: ${errMsg}`);
      setBottomDrawerTab('console');
    } finally {
      setIsAdding(false);
    }
  };

  const handleGrantPermissions = (granted: string[]) => {
    setGrantedPermissions(granted);
    setPermissionModalOpen(false);
    handleRunScript(granted);
  };

  if (!isBottomDrawerOpen) return null;

  return (
    <div
      style={{ height: `${effectiveHeight}px` }}
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#131722] border-t border-[#2a2e39] flex flex-col shadow-2xl transition-none select-none"
    >
      {/* Resizer Handle */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="w-full h-1.5 bg-[#2a2e39] hover:bg-[#2962ff] active:bg-[#2962ff] cursor-row-resize transition-colors shrink-0 flex items-center justify-center group"
      >
        <div className="w-12 h-0.5 rounded-full bg-[#787b86] group-hover:bg-white transition-colors" />
      </div>

      {/* Drawer Header & Action Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#171a22] border-b border-[#2a2e39] shrink-0 text-xs text-[#d1d4dc]">
        {/* Left: Tabs & Title */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setBottomDrawerTab('editor')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded font-medium transition-colors ${
              bottomDrawerTab === 'editor'
                ? 'bg-[#1e222d] text-white border border-[#2a2e39]'
                : 'text-[#787b86] hover:text-white hover:bg-[#1e222d]'
            }`}
          >
            <Code2 className="w-3.5 h-3.5 text-[#2962ff]" />
            <span className="text-[9px] font-bold px-1 py-0.5 bg-[#2962ff]/20 text-[#2962ff] rounded border border-[#2962ff]/30 leading-none">BETA</span>
            <span>OrderScript Editor</span>
          </button>

          <button
            onClick={() => setBottomDrawerTab('console')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded font-medium transition-colors ${
              bottomDrawerTab === 'console'
                ? 'bg-[#1e222d] text-white border border-[#2a2e39]'
                : 'text-[#787b86] hover:text-white hover:bg-[#1e222d]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-[#089981]" />
            <span>Console</span>
            {scriptConsoleLogs.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#2a2e39] text-[#d1d4dc]">
                {scriptConsoleLogs.length}
              </span>
            )}
            {scriptError && (
              <span className="w-2 h-2 rounded-full bg-[#f23645] animate-pulse" />
            )}
          </button>
        </div>

        {/* Center: Template Picker */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#131722] border border-[#2a2e39]">
            <FileCode className="w-3.5 h-3.5 text-[#787b86]" />
            <select
              onChange={(e) => handleTemplateChange(e.target.value)}
              value=""
              className="bg-transparent text-xs text-[#d1d4dc] focus:outline-none cursor-pointer py-0.5"
            >
              <option value="" disabled>
                Load Template...
              </option>
              {ORDERSCRIPT_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id} className="bg-[#1e222d] text-white">
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleRunScript()}
            disabled={isRunning}
            title="Execute Script (Ctrl+Enter)"
            className="flex items-center gap-1 px-3 py-1 rounded bg-[#2a2e39] hover:bg-[#363a45] text-white transition-colors disabled:opacity-50"
          >
            {isRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 text-[#089981] fill-[#089981]" />
            )}
            <span>Run</span>
          </button>

          <button
            onClick={handleAddToChart}
            disabled={isAdding}
            title="Save and Render on Chart"
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white font-medium transition-colors disabled:opacity-50"
          >
            {isAdding ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : addedSuccess ? (
              <Check className="w-3.5 h-3.5 text-white" />
            ) : (
              <PlusSquare className="w-3.5 h-3.5" />
            )}
            <span>{addedSuccess ? 'Added!' : 'Add to Chart'}</span>
          </button>

          <div className="w-px h-4 bg-[#2a2e39] mx-1" />

          <button
            onClick={toggleMaximize}
            title={isMaximized ? 'Restore Size' : 'Maximize'}
            className="p-1 rounded text-[#787b86] hover:text-white hover:bg-[#2a2e39] transition-colors"
          >
            {isMaximized ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            onClick={toggleBottomDrawer}
            title="Close Drawer"
            className="p-1 rounded text-[#787b86] hover:text-white hover:bg-[#2a2e39] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Inline Template Replacement Confirmation Banner */}
      {pendingTemplateId && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/30 text-xs text-[#d1d4dc] shrink-0">
          <span>Loading this template will replace your current editor content. Continue?</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPendingTemplateId(null)}
              className="px-2.5 py-0.5 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[#d1d4dc] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => applyTemplateById(pendingTemplateId)}
              className="px-2.5 py-0.5 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white font-medium cursor-pointer"
            >
              Replace
            </button>
          </div>
        </div>
      )}

      {/* Drawer Body - keep MonacoEditorPane mounted to preserve undo history & cursor */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <div className={bottomDrawerTab === 'editor' ? 'w-full h-full' : 'hidden'}>
          <MonacoEditorPane
            code={activeScriptCode}
            onChange={setActiveScriptCode}
            onRun={() => handleRunScript()}
            error={scriptError}
          />
        </div>
        {bottomDrawerTab === 'console' && (
          <ConsolePanel
            logs={scriptConsoleLogs}
            error={scriptError}
            executionTimeMs={executionTimeMs}
            onClear={clearScriptConsoleLogs}
            onErrorClick={() => setBottomDrawerTab('editor')}
          />
        )}
      </div>

      {/* Permission Authorization Modal */}
      <ScriptPermissionModal
        isOpen={permissionModalOpen}
        requestedPermissions={requestedPermissions}
        onGrant={handleGrantPermissions}
        onDeny={() => setPermissionModalOpen(false)}
      />
    </div>
  );
};
