import React, { useState } from 'react';
import {
  X,
  Trash2,
  Search,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Copy,
} from 'lucide-react';
import { useSyncStore } from '../../store/syncStore';
import type { DrawingToolType } from '../../store/syncStore';
import { transport } from '../../transport/client';
import { getDrawingIcon, DRAWING_TOOL_LABELS } from '../../drawings/icons';

export interface ObjectTreeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ObjectTreeModal: React.FC<ObjectTreeModalProps> = ({ isOpen, onClose }) => {
  const [search, setSearch] = useState('');

  const {
    drawings,
    deleteDrawing,
    duplicateDrawing,
    toggleDrawingLock,
    toggleDrawingVisibility,
    clearDrawings,
    selectedDrawingId,
    setSelectedDrawingId,
    symbol,
    activePaneId,
    panes,
    syncDrawingsAcrossCharts,
  } = useSyncStore();

  if (!isOpen) return null;

  const currentPaneId = activePaneId || 'pane-1';
  const activeSymbol = panes[currentPaneId]?.symbol || symbol;

  // Filter drawings specifically belonging to the active chart
  const currentChartDrawings = drawings.filter((d) => {
    if (!d || !d.id || !d.type || !Array.isArray(d.anchors) || d.anchors.length === 0) return false;
    if (d.symbol && d.symbol !== activeSymbol) return false;
    if (!syncDrawingsAcrossCharts) {
      const drawingPaneId = d.paneId || 'pane-1';
      if (drawingPaneId !== currentPaneId) return false;
    }
    return true;
  });

  const filteredDrawings = currentChartDrawings.filter((d) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const typeMatch = d.type.toLowerCase().includes(q);
    const labelMatch = (DRAWING_TOOL_LABELS[d.type] || '').toLowerCase().includes(q);
    const textMatch = d.text ? d.text.toLowerCase().includes(q) : false;
    return typeMatch || labelMatch || textMatch;
  });

  const getToolIcon = (type: DrawingToolType) => {
    return getDrawingIcon(type, { size: 14 });
  };

  const formatToolTitle = (type: DrawingToolType) => {
    return (
      DRAWING_TOOL_LABELS[type] ||
      type
        .split('_')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ')
    );
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteDrawing(id);
    transport.deleteDrawing(id).catch(console.error);
  };

  const handleDuplicate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    duplicateDrawing(id);
  };

  const handleToggleLock = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleDrawingLock(id);
  };

  const handleToggleVisibility = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleDrawingVisibility(id);
  };

  const handleClearAll = () => {
    for (const d of currentChartDrawings) {
      transport.deleteDrawing(d.id).catch(console.error);
    }
    clearDrawings(activeSymbol, !syncDrawingsAcrossCharts ? currentPaneId : undefined, true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none animate-in fade-in duration-100">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[#1e222d] border border-[#2a2e39] rounded-xl shadow-2xl overflow-hidden flex flex-col z-10 animate-in zoom-in-95 duration-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2e39] bg-[#181b27]">
          <div className="flex items-center space-x-2.5">
            <img src="/logo.png" alt="ORDERCRAFT" className="w-5 h-5 rounded-[4px] object-contain shadow-sm" />
            <h2 className="text-sm font-semibold text-white">Object Tree</h2>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#2a2e39] text-[#787b86]">
              {currentChartDrawings.length} {currentChartDrawings.length === 1 ? 'drawing' : 'drawings'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[#787b86] hover:text-white p-1 rounded-md hover:bg-[#2a2e39] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search filter */}
        <div className="p-3 border-b border-[#2a2e39] bg-[#131722]/50">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-2.5 text-[#787b86]" />
            <input
              type="text"
              placeholder="Filter drawings by type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#181b27] border border-[#2a2e39] focus:border-[#2962ff] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#d1d4dc] placeholder-[#787b86] outline-none"
            />
          </div>
        </div>

        {/* List of Drawings */}
        <div className="max-h-72 overflow-y-auto divide-y divide-[#2a2e39]/50 p-1">
          {filteredDrawings.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#787b86]">
              {search.trim()
                ? 'No matching drawings found.'
                : 'No drawings on this chart.'}
            </div>
          ) : (
            filteredDrawings.map((d, idx) => {
              const isSelected = d.id === selectedDrawingId;
              return (
                <div
                  key={d.id}
                  onClick={() => setSelectedDrawingId(d.id)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#2962ff]/20 text-white'
                      : 'hover:bg-[#2a2e39] text-[#d1d4dc]'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="w-5 h-5 rounded flex items-center justify-center bg-[#131722]">
                      {getToolIcon(d.type)}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center space-x-1.5 font-medium">
                        <span>{formatToolTitle(d.type)}</span>
                        <div
                          className="w-2.5 h-2.5 rounded-full border border-white/20"
                          style={{ backgroundColor: d.color || '#2962ff' }}
                        />
                      </div>
                      <span className="text-[10px] text-[#787b86] font-mono">
                        #{idx + 1} · {d.anchors.length} {d.anchors.length === 1 ? 'anchor' : 'anchors'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={(e) => handleToggleVisibility(d.id, e)}
                      className={`p-1 rounded transition-colors cursor-pointer ${
                        d.hidden ? 'text-[#ff9800] bg-[#ff9800]/20' : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]'
                      }`}
                      title={d.hidden ? 'Show drawing' : 'Hide drawing'}
                    >
                      {d.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>

                    <button
                      onClick={(e) => handleToggleLock(d.id, e)}
                      className={`p-1 rounded transition-colors cursor-pointer ${
                        d.locked ? 'text-[#f23645] bg-[#f23645]/20' : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]'
                      }`}
                      title={d.locked ? 'Unlock drawing' : 'Lock drawing'}
                    >
                      {d.locked ? <Lock size={13} /> : <Unlock size={13} />}
                    </button>

                    <button
                      onClick={(e) => handleDuplicate(d.id, e)}
                      className="p-1 hover:bg-[#2a2e39] text-[#787b86] hover:text-[#2962ff] rounded transition-colors cursor-pointer"
                      title="Duplicate drawing"
                    >
                      <Copy size={13} />
                    </button>

                    <button
                      onClick={(e) => handleDelete(d.id, e)}
                      className="p-1 hover:bg-[#f23645]/20 text-[#787b86] hover:text-[#f23645] rounded transition-colors cursor-pointer"
                      title="Delete drawing"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#2a2e39] bg-[#181b27]">
          {currentChartDrawings.length > 0 ? (
            <button
              onClick={handleClearAll}
              className="text-xs text-[#f23645] hover:text-[#ff6b77] transition-colors cursor-pointer flex items-center space-x-1"
            >
              <Trash2 size={12} />
              <span>Remove all drawings</span>
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-[#2a2e39] hover:bg-[#363a45] text-white text-xs font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
