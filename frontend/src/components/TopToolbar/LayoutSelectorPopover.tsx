import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSyncStore } from '../../store/syncStore';
import type { LayoutType } from '../../store/syncStore';
import { Check, Link, Clock, Crosshair, Calendar } from 'lucide-react';

interface LayoutSelectorPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

interface LayoutOption {
  type: LayoutType;
  label: string;
  gridRender: React.ReactNode;
}

export const LayoutSelectorPopover: React.FC<LayoutSelectorPopoverProps> = ({
  isOpen,
  onClose,
  anchorRef,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 40, left: 260 });

  const {
    layoutType,
    setLayoutType,
    panes,
    symbol: activeSymbol,
    timeframe: activeTimeframe,
    symbolLock,
    intervalLock,
    crosshairLock,
    dateRangeLock,
    toggleLock,
  } = useSyncStore();

  const isSymbolSynced = symbolLock && !Object.values(panes).some((p) => p.symbol !== activeSymbol);
  const isIntervalSynced = intervalLock && !Object.values(panes).some((p) => p.timeframe !== activeTimeframe);

  useEffect(() => {
    if (isOpen && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const popoverWidth = 320;
      const left = Math.min(Math.max(10, rect.left), window.innerWidth - popoverWidth - 10);
      const top = rect.bottom + 4;
      setPosition({ top, left });
    }
  }, [isOpen, anchorRef]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  const layoutOptions: LayoutOption[] = [
    {
      type: '1',
      label: 'Single Chart',
      gridRender: <div className="w-6 h-6 border border-current rounded-sm bg-current/20" />,
    },
    {
      type: '2v',
      label: '2 Charts Vertical',
      gridRender: (
        <div className="w-6 h-6 grid grid-cols-2 gap-0.5 border border-current p-0.5 rounded-sm">
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
        </div>
      ),
    },
    {
      type: '2h',
      label: '2 Charts Horizontal',
      gridRender: (
        <div className="w-6 h-6 grid grid-rows-2 gap-0.5 border border-current p-0.5 rounded-sm">
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
        </div>
      ),
    },
    {
      type: '3v',
      label: '3 Charts Vertical',
      gridRender: (
        <div className="w-6 h-6 grid grid-cols-3 gap-0.5 border border-current p-0.5 rounded-sm">
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
        </div>
      ),
    },
    {
      type: '3h',
      label: '3 Charts Horizontal',
      gridRender: (
        <div className="w-6 h-6 grid grid-rows-3 gap-0.5 border border-current p-0.5 rounded-sm">
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
        </div>
      ),
    },
    {
      type: '3top',
      label: '3 Charts (Top + 2 Bottom)',
      gridRender: (
        <div className="w-6 h-6 grid grid-cols-2 grid-rows-2 gap-0.5 border border-current p-0.5 rounded-sm">
          <div className="col-span-2 bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
        </div>
      ),
    },
    {
      type: '3left',
      label: '3 Charts (Left + 2 Right)',
      gridRender: (
        <div className="w-6 h-6 grid grid-cols-2 grid-rows-2 gap-0.5 border border-current p-0.5 rounded-sm">
          <div className="row-span-2 bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
        </div>
      ),
    },
    {
      type: '4',
      label: '4 Charts Grid (2x2)',
      gridRender: (
        <div className="w-6 h-6 grid grid-cols-2 grid-rows-2 gap-0.5 border border-current p-0.5 rounded-sm">
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
        </div>
      ),
    },
    {
      type: '4v',
      label: '4 Charts Columns',
      gridRender: (
        <div className="w-6 h-6 grid grid-cols-4 gap-0.5 border border-current p-0.5 rounded-sm">
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
        </div>
      ),
    },
    {
      type: '4h',
      label: '4 Charts Rows',
      gridRender: (
        <div className="w-6 h-6 grid grid-rows-4 gap-0.5 border border-current p-0.5 rounded-sm">
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
        </div>
      ),
    },
    {
      type: '6',
      label: '6 Charts (3x2)',
      gridRender: (
        <div className="w-6 h-6 grid grid-cols-3 grid-rows-2 gap-0.5 border border-current p-0.5 rounded-sm">
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
        </div>
      ),
    },
    {
      type: '8',
      label: '8 Charts (4x2)',
      gridRender: (
        <div className="w-6 h-6 grid grid-cols-4 grid-rows-2 gap-0.5 border border-current p-0.5 rounded-sm">
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
          <div className="bg-current/30 rounded-[1px]" />
        </div>
      ),
    },
  ];

  return createPortal(
    <>
      {/* Full viewport backdrop overlay to guarantee popover sits above all elements and dismisses on outside click */}
      <div
        className="fixed inset-0 z-[9998]"
        onClick={onClose}
      />

      <div
        ref={popoverRef}
        className="fixed w-80 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl p-3 z-[9999] text-xs select-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
        style={{ top: `${position.top}px`, left: `${position.left}px` }}
      >
      {/* Header */}
      <div className="text-[10px] font-semibold text-[#787b86] uppercase tracking-wider mb-2">
        Select Chart Grid Layout
      </div>

      {/* Grid of Layout Icons */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {layoutOptions.map((opt) => {
          const isSelected = layoutType === opt.type;
          return (
            <button
              key={opt.type}
              onClick={() => {
                setLayoutType(opt.type);
                onClose();
              }}
              title={opt.label}
              className={`flex flex-col items-center justify-center p-2 rounded border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#2962ff]/20 border-[#2962ff] text-[#2962ff] shadow-[0_0_8px_rgba(41,98,255,0.3)]'
                  : 'bg-[#181b27] border-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc] hover:border-[#787b86]'
              }`}
            >
              {opt.gridRender}
              <span className="text-[9px] mt-1 font-mono uppercase">{opt.type}</span>
            </button>
          );
        })}
      </div>

      <div className="h-[1px] bg-[#2a2e39] my-2.5" />

      {/* Cross-Chart Synchronization Options */}
      <div className="text-[10px] font-semibold text-[#787b86] uppercase tracking-wider mb-2">
        Sync in All Charts
      </div>

      <div className="space-y-1">
        {/* Symbol Sync */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => toggleLock('symbolLock')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleLock('symbolLock');
            }
          }}
          className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#2a2e39]/60 cursor-pointer transition-colors"
        >
          <div className="flex items-center space-x-2 text-[#d1d4dc]">
            <Link size={13} className={isSymbolSynced ? 'text-[#2962ff]' : 'text-[#787b86]'} />
            <span>Symbol</span>
          </div>
          <div
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              isSymbolSynced
                ? 'bg-[#2962ff] border-[#2962ff] text-white'
                : 'border-[#434651] bg-[#131722]'
            }`}
          >
            {isSymbolSynced && <Check size={11} strokeWidth={3} />}
          </div>
        </div>

        {/* Interval / Timeframe Sync */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => toggleLock('intervalLock')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleLock('intervalLock');
            }
          }}
          className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#2a2e39]/60 cursor-pointer transition-colors"
        >
          <div className="flex items-center space-x-2 text-[#d1d4dc]">
            <Clock size={13} className={isIntervalSynced ? 'text-[#2962ff]' : 'text-[#787b86]'} />
            <span>Interval (Timeframe)</span>
          </div>
          <div
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              isIntervalSynced
                ? 'bg-[#2962ff] border-[#2962ff] text-white'
                : 'border-[#434651] bg-[#131722]'
            }`}
          >
            {isIntervalSynced && <Check size={11} strokeWidth={3} />}
          </div>
        </div>

        {/* Crosshair Sync */}
        <label
          onClick={() => toggleLock('crosshairLock')}
          className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#2a2e39]/60 cursor-pointer transition-colors"
        >
          <div className="flex items-center space-x-2 text-[#d1d4dc]">
            <Crosshair size={13} className={crosshairLock ? 'text-[#2962ff]' : 'text-[#787b86]'} />
            <span>Crosshair</span>
          </div>
          <div
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              crosshairLock
                ? 'bg-[#2962ff] border-[#2962ff] text-white'
                : 'border-[#434651] bg-[#131722]'
            }`}
          >
            {crosshairLock && <Check size={11} strokeWidth={3} />}
          </div>
        </label>

        {/* Date Range / Zoom Pan Sync */}
        <label
          onClick={() => toggleLock('dateRangeLock')}
          className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#2a2e39]/60 cursor-pointer transition-colors"
        >
          <div className="flex items-center space-x-2 text-[#d1d4dc]">
            <Calendar size={13} className={dateRangeLock ? 'text-[#2962ff]' : 'text-[#787b86]'} />
            <span>Date Range / Time Scale</span>
          </div>
          <div
            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              dateRangeLock
                ? 'bg-[#2962ff] border-[#2962ff] text-white'
                : 'border-[#434651] bg-[#131722]'
            }`}
          >
            {dateRangeLock && <Check size={11} strokeWidth={3} />}
          </div>
        </label>
      </div>
    </div>
    </>,
    document.body
  );
};

export default LayoutSelectorPopover;
