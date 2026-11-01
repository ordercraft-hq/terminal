import React, { useEffect, useRef, useState } from 'react';
import {
  RotateCcw,
  Hexagon,
  ChevronRight,
  Check,
} from 'lucide-react';
import { useSyncStore } from '../../store/syncStore';
import { transport } from '../../transport/client';

export interface ChartContextMenuProps {
  isOpen: boolean;
  paneId?: string;
  position: { x: number; y: number };
  price: number | null;
  onClose: () => void;
  onResetChartView: () => void;
  onOpenSettings: () => void;
  onOpenObjectTree: () => void;
  onOpenTableView: () => void;
}

export const ChartContextMenu: React.FC<ChartContextMenuProps> = ({
  isOpen,
  paneId,
  position,
  price,
  onClose,
  onResetChartView,
  onOpenSettings,
  onOpenObjectTree,
  onOpenTableView,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isTemplateHovered, setIsTemplateHovered] = useState(false);
  const [copiedPrice, setCopiedPrice] = useState(false);

  const {
    drawings,
    clearDrawings,
    crosshairLock,
    toggleLock,
    symbol,
    activePaneId,
    panes,
    syncDrawingsAcrossCharts,
  } = useSyncStore();

  const currentPaneId = paneId || activePaneId || 'pane-1';
  const activePane = panes[currentPaneId];
  const activeSymbol = activePane?.symbol || symbol;
  const indicatorsMap = useSyncStore((s) => s.indicators);
  const paneIndicators = indicatorsMap[currentPaneId] || [];
  const indicatorsCount = paneIndicators.length;
  const hasIndicators = indicatorsCount > 0;

  const chartDrawings = drawings.filter((d) => {
    if (d.symbol && d.symbol !== activeSymbol) return false;
    if (syncDrawingsAcrossCharts) return true;
    const drawingPaneId = d.paneId || 'pane-1';
    return drawingPaneId === currentPaneId;
  });

  const drawingsCount = chartDrawings.length;

  // Format price display (e.g. 29,548.9 or 1.0824)
  const formattedPrice = React.useMemo(() => {
    if (price === null || isNaN(price)) return '0.00';
    if (Math.abs(price) >= 1000) {
      return price.toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 2,
      });
    }
    if (Math.abs(price) < 1) {
      return price.toFixed(4);
    }
    return price.toFixed(2);
  }, [price]);

  // Adjust menu position so it doesn't overflow screen boundaries
  const adjustedPos = React.useMemo(() => {
    const menuWidth = 260;
    const menuHeight = 360;
    const pad = 12;

    const x = Math.min(position.x, window.innerWidth - menuWidth - pad);
    const y = Math.min(position.y, window.innerHeight - menuHeight - pad);

    return {
      x: Math.max(pad, x),
      y: Math.max(pad, y),
    };
  }, [position]);

  // Close on Escape or click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyPrice = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(formattedPrice).catch(() => {});
    setCopiedPrice(true);
    setTimeout(() => {
      setCopiedPrice(false);
      onClose();
    }, 400);
  };

  const handlePaste = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.readText().catch(() => {});
    onClose();
  };

  const handleRemoveDrawings = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (drawingsCount === 0) return;
    const alwaysRemoveLocked = localStorage.getItem('ordercraft_always_remove_locked_drawings') === 'true';
    const toDelete = chartDrawings.filter((d) => alwaysRemoveLocked || !d.locked);
    for (const d of toDelete) {
      transport.deleteDrawing(d.id).catch(console.error);
    }
    clearDrawings(activeSymbol, !syncDrawingsAcrossCharts ? currentPaneId : undefined, alwaysRemoveLocked);
    onClose();
  };

  return (
    <>
      {/* Invisible backdrop to capture outside clicks and context menu events */}
      <div
        className="fixed inset-0 z-50 select-none"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      {/* Main Right-Click Context Menu */}
      <div
        ref={menuRef}
        className="fixed z-50 w-[252px] bg-[#1e222d] border border-[#2a2e39] rounded-md shadow-[0_12px_28px_rgba(0,0,0,0.65),0_2px_4px_rgba(0,0,0,0.4)] py-1.5 text-[13px] text-[#d1d4dc] font-sans select-none animate-in fade-in zoom-in-95 duration-75"
        style={{
          left: `${adjustedPos.x}px`,
          top: `${adjustedPos.y}px`,
        }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* 1. Reset chart view */}
        <button
          onClick={() => {
            onResetChartView();
            onClose();
          }}
          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#2a2e39] hover:text-white transition-colors cursor-pointer group text-left"
        >
          <div className="flex items-center space-x-2.5">
            <div className="w-4 h-4 flex items-center justify-center shrink-0 text-[#787b86] group-hover:text-white">
              <RotateCcw size={14} />
            </div>
            <span>Reset chart view</span>
          </div>
          <span className="font-mono text-xs text-[#787b86] tracking-tight">Alt + R</span>
        </button>

        <div className="h-[1px] bg-[#2a2e39] my-1" />

        {/* 2. Copy price */}
        <button
          onClick={handleCopyPrice}
          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#2a2e39] hover:text-white transition-colors cursor-pointer text-left"
        >
          <div className="flex items-center space-x-2.5">
            <div className="w-4 h-4 shrink-0" />
            <span>{copiedPrice ? 'Copied to clipboard!' : `Copy price ${formattedPrice}`}</span>
          </div>
        </button>

        {/* 3. Paste */}
        <button
          onClick={handlePaste}
          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#2a2e39] hover:text-white transition-colors cursor-pointer text-left"
        >
          <div className="flex items-center space-x-2.5">
            <div className="w-4 h-4 shrink-0" />
            <span>Paste</span>
          </div>
          <span className="font-mono text-xs text-[#787b86] tracking-tight">Ctrl + V</span>
        </button>

        <div className="h-[1px] bg-[#2a2e39] my-1" />

        {/* 4. Lock vertical cursor line by time */}
        <button
          onClick={() => {
            toggleLock('crosshairLock');
            onClose();
          }}
          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#2a2e39] hover:text-white transition-colors cursor-pointer text-left"
        >
          <div className="flex items-center space-x-2.5">
            <div className="w-4 h-4 flex items-center justify-center shrink-0">
              {crosshairLock && <Check size={13} className="text-[#2962ff]" />}
            </div>
            <span className={crosshairLock ? 'text-[#2962ff] font-medium' : ''}>
              Lock vertical cursor line by time
            </span>
          </div>
        </button>

        <div className="h-[1px] bg-[#2a2e39] my-1" />

        {/* 5. Table view */}
        <button
          onClick={() => {
            onOpenTableView();
            onClose();
          }}
          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#2a2e39] hover:text-white transition-colors cursor-pointer text-left"
        >
          <div className="flex items-center space-x-2.5">
            <div className="w-4 h-4 shrink-0" />
            <span>Table view</span>
          </div>
        </button>

        {/* 6. Object tree */}
        <button
          onClick={() => {
            onOpenObjectTree();
            onClose();
          }}
          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#2a2e39] hover:text-white transition-colors cursor-pointer text-left"
        >
          <div className="flex items-center space-x-2.5">
            <div className="w-4 h-4 shrink-0" />
            <span>Object tree</span>
          </div>
        </button>

        {/* 7. Chart template (with flyout submenu) */}
        <div
          className="relative"
          onMouseEnter={() => setIsTemplateHovered(true)}
          onMouseLeave={() => setIsTemplateHovered(false)}
        >
          <button
            className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#2a2e39] hover:text-white transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center space-x-2.5">
              <div className="w-4 h-4 shrink-0" />
              <span>Chart template</span>
            </div>
            <ChevronRight size={14} className="text-[#787b86]" />
          </button>

          {isTemplateHovered && (
            <div className="absolute left-[98%] top-0 w-44 bg-[#1e222d] border border-[#2a2e39] rounded-md shadow-2xl py-1 text-[13px] text-[#d1d4dc] z-50 animate-in fade-in zoom-in-95 duration-75">
              {['Dark Pro (Default)', 'Midnight Blue', 'Monochrome Minimal', 'High Contrast'].map(
                (tpl, idx) => (
                  <button
                    key={tpl}
                    onClick={() => {
                      setIsTemplateHovered(false);
                      onClose();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#2a2e39] hover:text-white transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span>{tpl}</span>
                    {idx === 0 && <Check size={12} className="text-[#2962ff]" />}
                  </button>
                )
              )}
            </div>
          )}
        </div>

        <div className="h-[1px] bg-[#2a2e39] my-1" />

        {/* 8. Remove [N] drawings */}
        <button
          onClick={handleRemoveDrawings}
          disabled={drawingsCount === 0}
          className={`w-full flex items-center justify-between px-3 py-1.5 transition-colors text-left ${
            drawingsCount > 0
              ? 'hover:bg-[#2a2e39] hover:text-[#f23645] cursor-pointer'
              : 'text-[#50535e] cursor-not-allowed'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <div className="w-4 h-4 shrink-0" />
            <span>
              {drawingsCount > 0
                ? `Remove ${drawingsCount} drawing${drawingsCount > 1 ? 's' : ''}`
                : 'Remove drawings'}
            </span>
          </div>
        </button>

        {/* 9. Remove indicators */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!hasIndicators) return;
            if (currentPaneId) {
              useSyncStore.getState().clearIndicatorsFromPane(currentPaneId);
              useSyncStore.getState().updatePaneSettings(currentPaneId, {
                showVolume: false,
                statusShowVolume: false,
              });
            }
            onClose();
          }}
          disabled={!hasIndicators}
          className={`w-full flex items-center justify-between px-3 py-1.5 transition-colors text-left ${
            hasIndicators
              ? 'hover:bg-[#2a2e39] hover:text-[#f23645] cursor-pointer'
              : 'text-[#50535e] cursor-not-allowed'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <div className="w-4 h-4 shrink-0" />
            <span>
              {indicatorsCount > 0
                ? `Remove ${indicatorsCount} indicator${indicatorsCount === 1 ? '' : 's'}`
                : 'Remove indicators'}
            </span>
          </div>
        </button>

        <div className="h-[1px] bg-[#2a2e39] my-1" />

        {/* 10. Settings... */}
        <button
          onClick={() => {
            onOpenSettings();
            onClose();
          }}
          className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#2a2e39] hover:text-white transition-colors cursor-pointer group text-left"
        >
          <div className="flex items-center space-x-2.5">
            <div className="w-4 h-4 flex items-center justify-center shrink-0 text-[#787b86] group-hover:text-white">
              <Hexagon size={14} />
            </div>
            <span>Settings...</span>
          </div>
        </button>
      </div>
    </>
  );
};
