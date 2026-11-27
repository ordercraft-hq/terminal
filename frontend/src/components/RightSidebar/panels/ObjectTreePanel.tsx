import React, { useState, useEffect, useMemo } from 'react';
import {
  CandlestickChart,
  Copy,
  ArrowUpDown,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Settings,
  Activity,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useSyncStore, createDefaultVolumeIndicator } from '../../../store/syncStore';
import type { DrawingToolType } from '../../../store/syncStore';
import { getDrawingIcon, DRAWING_TOOL_LABELS } from '../../../drawings/icons';
import { transport, type Candle, type IndicatorEvalResultItem } from '../../../transport/client';
import { detectPrecisionFromCandles } from '../../../utils/priceFormatting';
import type { IndicatorInstance } from '../../../indicators/types';

interface ObjectTreeDataWindowProps {
  activeSymbol: string;
  activeTimeframe: string;
  currentIndicators: IndicatorInstance[];
}

const ObjectTreeDataWindow: React.FC<ObjectTreeDataWindowProps> = ({
  activeSymbol,
  activeTimeframe,
  currentIndicators,
}) => {
  const syncCrosshair = useSyncStore((s) => s.syncCrosshair);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [evalResults, setEvalResults] = useState<IndicatorEvalResultItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    transport
      .fetchCandles(activeSymbol, activeTimeframe, undefined, undefined, 200, controller.signal)
      .then((data) => {
        if (!mounted || controller.signal.aborted) return;
        setCandles(data);
      })
      .catch(() => {});

    const unsubLive = transport.subscribeLiveKline(activeSymbol, activeTimeframe, (tick) => {
      if (!mounted) return;
      setCandles((prev) => {
        if (prev.length === 0) return [tick];
        const last = prev[prev.length - 1];
        if (last.time === tick.time) {
          return [...prev.slice(0, -1), tick];
        }
        if (tick.time > last.time) {
          return [...prev.slice(-199), tick];
        }
        return prev;
      });
    });

    return () => {
      mounted = false;
      controller.abort();
      unsubLive();
    };
  }, [activeSymbol, activeTimeframe]);

  const evalKey = useMemo(
    () =>
      currentIndicators
        .filter((ind) => ind.visible)
        .map((ind) => `${ind.id}:${ind.type}:${JSON.stringify(ind.inputs)}`)
        .join('|'),
    [currentIndicators]
  );

  useEffect(() => {
    if (candles.length === 0) {
      setEvalResults([]);
      return;
    }
    const visibleNonVol = currentIndicators.filter(
      (ind) => ind.visible && ind.type !== 'wickra.volume' && ind.type !== 'volume'
    );
    if (visibleNonVol.length === 0) {
      setEvalResults([]);
      return;
    }

    const controller = new AbortController();
    transport
      .evaluateIndicators(
        {
          symbol: activeSymbol,
          resolution: activeTimeframe,
          candles,
          indicators: visibleNonVol.map((ind) => ({
            instanceId: ind.id,
            indicatorId: ind.type,
            inputs: ind.inputs as Record<string, unknown>,
          })),
        },
        controller.signal
      )
      .then((res) => {
        if (!controller.signal.aborted) {
          setEvalResults(res.results || []);
        }
      })
      .catch(() => {});

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol, activeTimeframe, candles.length, evalKey]);

  const precision = useMemo(
    () => detectPrecisionFromCandles(candles, activeSymbol),
    [candles, activeSymbol]
  );

  const activeCandle = useMemo(() => {
    if (candles.length === 0) return null;
    if (syncCrosshair?.time != null) {
      const targetTime = syncCrosshair.time;
      let match: Candle | null = null;
      for (let i = candles.length - 1; i >= 0; i--) {
        if (candles[i].time <= targetTime) {
          match = candles[i];
          break;
        }
      }
      return match || candles[candles.length - 1];
    }
    return candles[candles.length - 1];
  }, [candles, syncCrosshair?.time]);

  const indicatorValueById = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    const targetTime = activeCandle?.time;
    for (const res of evalResults) {
      const plotVals: Record<string, number> = {};
      for (const [plotName, pts] of Object.entries(res.plots || {})) {
        if (!Array.isArray(pts) || pts.length === 0) continue;
        let val: number | undefined;
        if (targetTime !== undefined) {
          for (let i = pts.length - 1; i >= 0; i--) {
            if (pts[i].time <= targetTime) {
              val = pts[i].value;
              break;
            }
          }
        }
        if (val === undefined) {
          val = pts[pts.length - 1]?.value;
        }
        if (typeof val === 'number' && !Number.isNaN(val)) {
          plotVals[plotName] = val;
        }
      }
      map.set(res.instanceId, plotVals);
    }
    return map;
  }, [evalResults, activeCandle?.time]);

  const formatPriceVal = (val: number | undefined) => {
    if (val === undefined || Number.isNaN(val)) return '—';
    return val.toFixed(precision);
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      <div className="p-3 bg-[#181b27] border border-[#2a2e39] rounded-lg space-y-2">
        <div className="flex items-center justify-between text-white font-semibold border-b border-[#2a2e39] pb-1.5">
          <span>{activeSymbol}</span>
          <span className="font-mono text-[11px] text-[#787b86]">{activeTimeframe}</span>
        </div>

        <div className="grid grid-cols-2 gap-y-1.5 text-[11px] font-mono tabular-nums">
          <span className="text-[#787b86]">Bar Time:</span>
          <span className="text-right text-[#d1d4dc]">
            {activeCandle
              ? new Date(activeCandle.time * 1000).toLocaleString()
              : syncCrosshair?.time
              ? new Date(syncCrosshair.time * 1000).toLocaleString()
              : 'Loading...'}
          </span>

          <span className="text-[#787b86]">Open:</span>
          <span className="text-right text-[#d1d4dc]">{formatPriceVal(activeCandle?.open)}</span>

          <span className="text-[#787b86]">High:</span>
          <span className="text-right text-[#089981]">{formatPriceVal(activeCandle?.high)}</span>

          <span className="text-[#787b86]">Low:</span>
          <span className="text-right text-[#f23645]">{formatPriceVal(activeCandle?.low)}</span>

          <span className="text-[#787b86]">Close:</span>
          <span className="text-right text-white font-semibold">{formatPriceVal(activeCandle?.close)}</span>

          <span className="text-[#787b86]">Volume:</span>
          <span className="text-right text-[#d1d4dc]">
            {activeCandle?.volume !== undefined ? activeCandle.volume.toLocaleString() : '—'}
          </span>

          <span className="text-[#787b86]">Cursor Price:</span>
          <span className="text-right text-[#2962ff] font-semibold">
            {syncCrosshair?.price != null ? syncCrosshair.price.toFixed(precision) : '—'}
          </span>
        </div>
      </div>

      {/* Active Indicators Values Window */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase font-bold text-[#787b86] tracking-wider">
          Indicator Values
        </div>
        {currentIndicators.length === 0 ? (
          <div className="text-center py-4 text-xs text-[#787b86]">
            No indicators added to active chart.
          </div>
        ) : (
          currentIndicators.map((ind) => {
            const isVol = ind.type === 'wickra.volume' || ind.type === 'volume';
            const plotVals = indicatorValueById.get(ind.id);
            const entries = plotVals ? Object.entries(plotVals) : [];

            return (
              <div
                key={ind.id}
                className="p-2.5 bg-[#181b27]/60 border border-[#2a2e39]/60 rounded-lg space-y-1 text-xs font-mono"
              >
                <div className="flex items-center justify-between">
                  <span className="font-sans font-medium text-white truncate">{ind.name}</span>
                  {!ind.visible ? (
                    <span className="text-[10px] text-[#787b86]">Hidden</span>
                  ) : isVol ? (
                    <span className="text-[#089981] tabular-nums">
                      {activeCandle?.volume !== undefined ? activeCandle.volume.toLocaleString() : '—'}
                    </span>
                  ) : entries.length === 1 ? (
                    <span className="text-[#089981] tabular-nums">
                      {entries[0][1].toFixed(precision)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#089981]">Active</span>
                  )}
                </div>
                {ind.visible && !isVol && entries.length > 1 && (
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pt-1 border-t border-[#2a2e39]/50 text-[10px] tabular-nums">
                    {entries.map(([plotName, val]) => (
                      <React.Fragment key={plotName}>
                        <span className="text-[#787b86] truncate">{plotName}</span>
                        <span className="text-right text-[#d1d4dc]">{val.toFixed(precision)}</span>
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export const ObjectTreePanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tree' | 'dataWindow'>('tree');
  const [sortReverse, setSortReverse] = useState(false);

  const currentPaneId = useSyncStore((s) => s.activePaneId || 'pane-1');
  const paneConfig = useSyncStore((s) => s.panes[currentPaneId]);
  const rawIndicators = useSyncStore((s) => s.indicators[currentPaneId]);

  const {
    symbol,
    timeframe,
    drawings,
    deleteDrawing,
    duplicateDrawing,
    toggleDrawingLock,
    toggleDrawingVisibility,
    clearDrawings,
    selectedDrawingId,
    setSelectedDrawingId,
    toggleIndicatorVisibility,
    removeIndicatorFromPane,
    openIndicatorSettings,
  } = useSyncStore(
    useShallow((s) => ({
      symbol: s.symbol,
      timeframe: s.timeframe,
      drawings: s.drawings,
      deleteDrawing: s.deleteDrawing,
      duplicateDrawing: s.duplicateDrawing,
      toggleDrawingLock: s.toggleDrawingLock,
      toggleDrawingVisibility: s.toggleDrawingVisibility,
      clearDrawings: s.clearDrawings,
      selectedDrawingId: s.selectedDrawingId,
      setSelectedDrawingId: s.setSelectedDrawingId,
      toggleIndicatorVisibility: s.toggleIndicatorVisibility,
      removeIndicatorFromPane: s.removeIndicatorFromPane,
      openIndicatorSettings: s.openIndicatorSettings,
    }))
  );

  const activeSymbol = paneConfig?.symbol || symbol;
  const activeTimeframe = paneConfig?.timeframe || timeframe;

  const currentIndicators = useMemo(
    () =>
      rawIndicators !== undefined
        ? rawIndicators
        : [createDefaultVolumeIndicator(currentPaneId)],
    [rawIndicators, currentPaneId]
  );

  const currentDrawings = useMemo(() => {
    const filtered = drawings.filter((d) => {
      if (!d || !d.id || !d.type || !Array.isArray(d.anchors)) return false;
      if (d.symbol && d.symbol !== activeSymbol) return false;
      return true;
    });
    return sortReverse ? [...filtered].reverse() : filtered;
  }, [drawings, activeSymbol, sortReverse]);

  const getToolTitle = (type: DrawingToolType) => {
    return (
      DRAWING_TOOL_LABELS[type] ||
      type
        .split('_')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ')
    );
  };

  const handleClearAllDrawings = () => {
    for (const d of currentDrawings) {
      transport.deleteDrawing(d.id).catch(console.error);
    }
    clearDrawings(activeSymbol, undefined, true);
  };

  return (
    <div className="flex flex-col h-full bg-[#131722] text-[#d1d4dc] select-none text-xs">
      {/* 1. Top Segmented Navigation: [ Object tree ] [ Data window ] */}
      <div className="p-3 border-b border-[#2a2e39] bg-[#181b27]">
        <div className="flex bg-[#131722] p-0.5 rounded-lg border border-[#2a2e39]">
          <button
            onClick={() => setActiveTab('tree')}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'tree'
                ? 'bg-[#2a2e39] text-white shadow-sm'
                : 'text-[#787b86] hover:text-[#d1d4dc]'
            }`}
          >
            Object tree
          </button>
          <button
            onClick={() => setActiveTab('dataWindow')}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'dataWindow'
                ? 'bg-[#2a2e39] text-white shadow-sm'
                : 'text-[#787b86] hover:text-[#d1d4dc]'
            }`}
          >
            Data window
          </button>
        </div>
      </div>

      {activeTab === 'tree' ? (
        <>
          {/* 2. Subheader Controls */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2e39] bg-[#131722] text-[#787b86]">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                disabled={!selectedDrawingId}
                onClick={() => {
                  if (selectedDrawingId) {
                    duplicateDrawing(selectedDrawingId);
                  }
                }}
                className={`p-1 rounded transition-colors ${
                  selectedDrawingId
                    ? 'hover:text-white hover:bg-[#2a2e39] cursor-pointer'
                    : 'opacity-40 cursor-not-allowed'
                }`}
                title={selectedDrawingId ? 'Duplicate selected drawing' : 'Select a drawing to clone'}
              >
                <Copy size={14} />
              </button>
              <button
                type="button"
                onClick={() => setSortReverse((prev) => !prev)}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  sortReverse
                    ? 'text-[#2962ff] bg-[#2962ff]/15'
                    : 'hover:text-white hover:bg-[#2a2e39]'
                }`}
                title="Reverse drawing order"
              >
                <ArrowUpDown size={14} />
              </button>
            </div>

            {currentDrawings.length > 0 && (
              <button
                onClick={handleClearAllDrawings}
                className="p-1 hover:text-[#f23645] rounded hover:bg-[#f23645]/20 transition-colors cursor-pointer"
                title="Remove All Drawings"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {/* 3. Object Tree Hierarchy */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {/* Root Node: Active Symbol & Timeframe */}
            <div className="flex items-center space-x-2 px-2.5 py-2 rounded-lg bg-[#181b27] border border-[#2a2e39]/60 font-semibold text-white">
              <CandlestickChart size={15} className="text-[#2962ff]" />
              <span className="truncate">{activeSymbol}</span>
              <span className="text-[#787b86] font-normal">·</span>
              <span className="text-[#787b86] font-mono text-[11px]">{activeTimeframe}</span>
            </div>

            {/* Indicators Section */}
            {currentIndicators.length > 0 && (
              <div className="pt-2">
                <div className="px-2 py-1 text-[10px] uppercase font-bold text-[#787b86] tracking-wider">
                  Indicators ({currentIndicators.length})
                </div>
                <div className="space-y-0.5 pl-2 border-l border-[#2a2e39] ml-3">
                  {currentIndicators.map((ind) => (
                    <div
                      key={ind.id}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-[#1e222d] transition-colors group cursor-pointer"
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <Activity size={13} className="text-[#2962ff] shrink-0" />
                        <span className="truncate font-medium text-[#d1d4dc] text-[11px]">
                          {ind.name}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          onClick={() => toggleIndicatorVisibility(currentPaneId, ind.id)}
                          className="p-1 text-[#787b86] hover:text-white rounded hover:bg-[#2a2e39] transition-colors cursor-pointer"
                          title={ind.visible ? 'Hide indicator' : 'Show indicator'}
                        >
                          {ind.visible ? <Eye size={13} /> : <EyeOff size={13} className="text-[#ff9800]" />}
                        </button>
                        <button
                          onClick={() => openIndicatorSettings(currentPaneId, ind.id)}
                          className="p-1 text-[#787b86] hover:text-white rounded hover:bg-[#2a2e39] transition-colors cursor-pointer"
                          title="Indicator settings"
                        >
                          <Settings size={13} />
                        </button>
                        <button
                          onClick={() => removeIndicatorFromPane(currentPaneId, ind.id)}
                          className="p-1 text-[#787b86] hover:text-[#f23645] rounded hover:bg-[#f23645]/20 transition-colors cursor-pointer"
                          title="Remove indicator"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Drawings Section */}
            <div className="pt-2">
              <div className="px-2 py-1 text-[10px] uppercase font-bold text-[#787b86] tracking-wider flex items-center justify-between">
                <span>Drawings ({currentDrawings.length})</span>
              </div>
              {currentDrawings.length === 0 ? (
                <div className="px-2 py-4 text-center text-[11px] text-[#787b86]">
                  No drawings on this chart.
                </div>
              ) : (
                <div className="space-y-0.5 pl-2 border-l border-[#2a2e39] ml-3">
                  {currentDrawings.map((d) => {
                    const isSelected = d.id === selectedDrawingId;
                    return (
                      <div
                        key={d.id}
                        onClick={() => setSelectedDrawingId(d.id)}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded transition-colors group cursor-pointer ${
                          isSelected
                            ? 'bg-[#2962ff]/20 text-white font-medium'
                            : 'hover:bg-[#1e222d] text-[#d1d4dc]'
                        }`}
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          <div className="w-4 h-4 rounded flex items-center justify-center shrink-0">
                            {getDrawingIcon(d.type, { size: 13 })}
                          </div>
                          <span className="truncate text-[11px]">{getToolTitle(d.type)}</span>
                          <span
                            className="w-2 h-2 rounded-full border border-white/20 shrink-0"
                            style={{ backgroundColor: d.color || '#2962ff' }}
                          />
                        </div>

                        <div className="flex items-center space-x-1 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDrawingVisibility(d.id);
                            }}
                            className="p-1 text-[#787b86] hover:text-white rounded hover:bg-[#2a2e39] transition-colors cursor-pointer"
                            title={d.hidden ? 'Show drawing' : 'Hide drawing'}
                          >
                            {d.hidden ? <EyeOff size={13} className="text-[#ff9800]" /> : <Eye size={13} />}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDrawingLock(d.id);
                            }}
                            className="p-1 text-[#787b86] hover:text-white rounded hover:bg-[#2a2e39] transition-colors cursor-pointer"
                            title={d.locked ? 'Unlock drawing' : 'Lock drawing'}
                          >
                            {d.locked ? <Lock size={13} className="text-[#f23645]" /> : <Unlock size={13} />}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteDrawing(d.id);
                              transport.deleteDrawing(d.id).catch(console.error);
                            }}
                            className="p-1 text-[#787b86] hover:text-[#f23645] rounded hover:bg-[#f23645]/20 transition-colors cursor-pointer"
                            title="Delete drawing"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <ObjectTreeDataWindow
          activeSymbol={activeSymbol}
          activeTimeframe={activeTimeframe}
          currentIndicators={currentIndicators}
        />
      )}
    </div>
  );
};
