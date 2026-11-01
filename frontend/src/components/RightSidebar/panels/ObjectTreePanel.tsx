import React, { useState } from 'react';
import {
  CandlestickChart,
  FolderPlus,
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
import { useSyncStore } from '../../../store/syncStore';
import type { DrawingToolType } from '../../../store/syncStore';
import { getDrawingIcon, DRAWING_TOOL_LABELS } from '../../../drawings/icons';
import { transport } from '../../../transport/client';

export const ObjectTreePanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tree' | 'dataWindow'>('tree');

  const {
    activePaneId,
    panes,
    symbol,
    timeframe,
    drawings,
    deleteDrawing,
    toggleDrawingLock,
    toggleDrawingVisibility,
    clearDrawings,
    selectedDrawingId,
    setSelectedDrawingId,
    indicators,
    toggleIndicatorVisibility,
    removeIndicatorFromPane,
    openIndicatorSettings,
    syncCrosshair,
  } = useSyncStore();

  const currentPaneId = activePaneId || 'pane-1';
  const paneConfig = panes[currentPaneId];
  const activeSymbol = paneConfig?.symbol || symbol;
  const activeTimeframe = paneConfig?.timeframe || timeframe;

  const currentIndicators = indicators[currentPaneId] || [];
  const currentDrawings = drawings.filter((d) => {
    if (!d || !d.id || !d.type || !Array.isArray(d.anchors)) return false;
    if (d.symbol && d.symbol !== activeSymbol) return false;
    return true;
  });

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
              <button className="p-1 hover:text-white rounded hover:bg-[#2a2e39] transition-colors cursor-pointer" title="Create Folder">
                <FolderPlus size={14} />
              </button>
              <button className="p-1 hover:text-white rounded hover:bg-[#2a2e39] transition-colors cursor-pointer" title="Clone">
                <Copy size={14} />
              </button>
              <button className="p-1 hover:text-white rounded hover:bg-[#2a2e39] transition-colors cursor-pointer" title="Sort">
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
        /* Data Window View */
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          <div className="p-3 bg-[#181b27] border border-[#2a2e39] rounded-lg space-y-2">
            <div className="flex items-center justify-between text-white font-semibold border-b border-[#2a2e39] pb-1.5">
              <span>{activeSymbol}</span>
              <span className="font-mono text-[11px] text-[#787b86]">{activeTimeframe}</span>
            </div>

            <div className="grid grid-cols-2 gap-y-1.5 text-[11px] font-mono">
              <span className="text-[#787b86]">Crosshair Time:</span>
              <span className="text-right text-[#d1d4dc]">
                {syncCrosshair?.time
                  ? new Date(syncCrosshair.time * 1000).toLocaleString()
                  : 'Hover chart'}
              </span>

              <span className="text-[#787b86]">Cursor Price:</span>
              <span className="text-right text-[#2962ff] font-semibold">
                {syncCrosshair?.price ? syncCrosshair.price.toFixed(2) : '—'}
              </span>
            </div>
          </div>

          {/* Active Indicators Values Window */}
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold text-[#787b86] tracking-wider">
              Plot Values
            </div>
            {currentIndicators.length === 0 ? (
              <div className="text-center py-4 text-xs text-[#787b86]">
                No indicators added to active chart.
              </div>
            ) : (
              currentIndicators.map((ind) => (
                <div
                  key={ind.id}
                  className="p-2.5 bg-[#181b27]/60 border border-[#2a2e39]/60 rounded-lg flex items-center justify-between text-xs font-mono"
                >
                  <span className="font-sans font-medium text-white">{ind.name}</span>
                  <span className="text-[#089981]">Active</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
