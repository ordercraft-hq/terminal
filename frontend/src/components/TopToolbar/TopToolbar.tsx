import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Sparkles,
  ChevronDown,
  Star,
  LayoutGrid,
  Camera,
  Download,
  Copy,
  Check,
  Undo2,
  Redo2,
} from 'lucide-react';
import { useSyncStore, getTimeframeSeconds } from '../../store/syncStore';
import { transport } from '../../transport/client';
import { LayoutSelectorPopover } from './LayoutSelectorPopover';
import { isTimeframeSupported } from '../../utils/timeframeSupport';
import { captureChartSnapshot } from '../../utils/snapshot';
import { BarTypeIcon, BAR_TYPE_CATEGORIES } from './BarTypeIcons';
import { WorkspaceLayoutMenu } from './WorkspaceLayoutMenu';

interface TimeframeCategory {
  category: string;
  items: { value: string; label: string }[];
}

const ALL_TIMEFRAME_CATEGORIES: TimeframeCategory[] = [
  {
    category: 'SECONDS',
    items: [
      { value: '1s', label: '1 second' },
      { value: '5s', label: '5 seconds' },
      { value: '10s', label: '10 seconds' },
      { value: '15s', label: '15 seconds' },
      { value: '30s', label: '30 seconds' },
    ],
  },
  {
    category: 'MINUTES',
    items: [
      { value: '1m', label: '1 minute' },
      { value: '2m', label: '2 minutes' },
      { value: '3m', label: '3 minutes' },
      { value: '4m', label: '4 minutes' },
      { value: '5m', label: '5 minutes' },
      { value: '10m', label: '10 minutes' },
      { value: '15m', label: '15 minutes' },
      { value: '30m', label: '30 minutes' },
      { value: '45m', label: '45 minutes' },
    ],
  },
  {
    category: 'HOURS',
    items: [
      { value: '1h', label: '1 hour' },
      { value: '2h', label: '2 hours' },
      { value: '3h', label: '3 hours' },
      { value: '4h', label: '4 hours' },
      { value: '6h', label: '6 hours' },
      { value: '8h', label: '8 hours' },
      { value: '12h', label: '12 hours' },
    ],
  },
  {
    category: 'DAYS / WEEKS / MONTHS',
    items: [
      { value: '1D', label: '1 day' },
      { value: '1W', label: '1 week' },
      { value: '1M', label: '1 month' },
    ],
  },
];

export const TopToolbar: React.FC = () => {
  const {
    symbol,
    timeframe,
    setTimeframe,
    setChartType,
    openCommandPalette,
    layoutName,
    layoutType,
    openLayoutModal,
    openChartSettings,
    pinnedTimeframes,
    togglePinTimeframe,
    pinnedChartTypes,
    togglePinChartType,
    isFullscreen,
    setIsFullscreen,
  } = useSyncStore();

  const [isTfDropdownOpen, setIsTfDropdownOpen] = useState(false);
  const [isBarTypeDropdownOpen, setIsBarTypeDropdownOpen] = useState(false);
  const [isLayoutPopoverOpen, setIsLayoutPopoverOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const [barTypeDropdownPos, setBarTypeDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const barTypeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Chart Snapshot menu & actions
  const [isSnapshotMenuOpen, setIsSnapshotMenuOpen] = useState(false);
  const [snapshotFeedback, setSnapshotFeedback] = useState<string | null>(null);
  const [layoutFeedback, setLayoutFeedback] = useState<string | null>(null);
  const snapshotBtnRef = useRef<HTMLButtonElement | null>(null);

  const currentSymbol = useSyncStore((s) => (s.activePaneId && s.panes[s.activePaneId]?.symbol) || s.symbol);
  const currentTimeframe = useSyncStore((s) => (s.activePaneId && s.panes[s.activePaneId]?.timeframe) || s.timeframe);
  const currentChartType = useSyncStore((s) => (s.activePaneId && s.panes[s.activePaneId]?.chartType) || s.chartType);
  const openIndicatorsModal = useSyncStore((s) => s.openIndicatorsModal);

  const canUndo = useSyncStore((s) => s.canUndo);
  const canRedo = useSyncStore((s) => s.canRedo);
  const undoDescription = useSyncStore((s) => s.undoDescription);
  const redoDescription = useSyncStore((s) => s.redoDescription);
  const undo = useSyncStore((s) => s.undo);
  const redo = useSyncStore((s) => s.redo);

  const handleToggleBarTypeDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isBarTypeDropdownOpen) {
      setIsBarTypeDropdownOpen(false);
      return;
    }
    if (barTypeBtnRef.current) {
      const rect = barTypeBtnRef.current.getBoundingClientRect();
      setBarTypeDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
      });
      setIsBarTypeDropdownOpen(true);
      setIsTfDropdownOpen(false);
      setIsSnapshotMenuOpen(false);
      setIsLayoutPopoverOpen(false);
    }
  };

  const handleDownloadSnapshot = useCallback(async () => {
    setIsSnapshotMenuOpen(false);
    const success = await captureChartSnapshot(currentSymbol, currentTimeframe, 'download');
    if (success) {
      setSnapshotFeedback('Image downloaded!');
      setTimeout(() => setSnapshotFeedback(null), 2500);
    }
  }, [currentSymbol, currentTimeframe]);

  const handleCopySnapshot = useCallback(async () => {
    setIsSnapshotMenuOpen(false);
    const success = await captureChartSnapshot(currentSymbol, currentTimeframe, 'copy');
    if (success) {
      setSnapshotFeedback('Image copied to clipboard!');
      setTimeout(() => setSnapshotFeedback(null), 2500);
    } else {
      setSnapshotFeedback('Failed to copy');
      setTimeout(() => setSnapshotFeedback(null), 2500);
    }
  }, [currentSymbol, currentTimeframe]);

  const tfBtnRef = useRef<HTMLButtonElement | null>(null);
  const gridBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const handleFsChange = () => {
      const doc = document as any;
      setIsFullscreen(!!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, [setIsFullscreen]);

  const saveCurrentLayout = useSyncStore((s) => s.saveCurrentLayout);

  const handleSave = useCallback(async () => {
    try {
      await saveCurrentLayout();
      setLayoutFeedback(`Layout "${layoutName || 'Workspace'}" saved!`);
      setTimeout(() => setLayoutFeedback(null), 2500);
    } catch (e) {
      console.error('Failed to save layout:', e);
      setLayoutFeedback('Failed to save layout');
      setTimeout(() => setLayoutFeedback(null), 3000);
    }
  }, [saveCurrentLayout, layoutName]);

  // Global Keyboard Shortcuts (Capture Phase)
  // Ctrl+S (Save layout), Ctrl+O (Open layout modal), Ctrl+Alt+S (Download snapshot), Ctrl+Shift+S (Copy snapshot)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable;

      const isS = e.key.toLowerCase() === 's' || e.code === 'KeyS';
      const isO = e.key.toLowerCase() === 'o' || e.code === 'KeyO';

      // 1. Save layout: Ctrl+S or Cmd+S
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && isS) {
        e.preventDefault();
        e.stopPropagation();
        handleSave();
        return;
      }

      // If user is currently typing inside an input field or textarea, do not trigger other shortcuts
      if (isInput) return;

      // 2. Open layouts modal: Ctrl+O or Cmd+O
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && isO) {
        e.preventDefault();
        e.stopPropagation();
        openLayoutModal();
        return;
      }

      // 3. Download snapshot: Ctrl+Alt+S
      if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && isS) {
        e.preventDefault();
        e.stopPropagation();
        handleDownloadSnapshot();
        return;
      }

      // 4. Copy snapshot: Ctrl+Shift+S
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && isS) {
        e.preventDefault();
        e.stopPropagation();
        handleCopySnapshot();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleSave, openLayoutModal, handleDownloadSnapshot, handleCopySnapshot]);

  const handleToggleFullscreen = async () => {
    try {
      const active = await transport.toggleFullscreen();
      setIsFullscreen(active);
    } catch (err) {
      console.warn('Fullscreen toggle failed:', err);
      setIsFullscreen(!isFullscreen);
    }
  };

  const handleToggleDropdown = () => {
    if (isTfDropdownOpen) {
      setIsTfDropdownOpen(false);
    } else {
      if (tfBtnRef.current) {
        const rect = tfBtnRef.current.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom + 4, left: rect.left });
      }
      setIsTfDropdownOpen(true);
    }
  };

  // Determine if active timeframe is in pinned list; if not, show it as extra in sorted order
  const displayedTimeframes = [...pinnedTimeframes];
  if (!displayedTimeframes.includes(timeframe)) {
    displayedTimeframes.push(timeframe);
  }
  displayedTimeframes.sort((a, b) => getTimeframeSeconds(a) - getTimeframeSeconds(b));

  return (
    <div className="relative z-40 h-10 w-full bg-[#131722] border-b border-[#2a2e39] flex items-center justify-between px-2 text-xs text-[#d1d4dc] select-none">
      {/* Left section: Symbol & Timeframe */}
      <div className="flex items-center space-x-1.5">
        {/* Fullscreen Brand Logo */}
        {isFullscreen && (
          <div className="flex items-center space-x-2 pr-1.5">
            <img
              src="/logo.png"
              alt="ORDERCRAFT Logo"
              className="w-5 h-5 rounded-[4px] object-contain shadow-[0_0_8px_rgba(41,98,255,0.4)]"
            />
            <span className="text-xs font-bold tracking-tight text-white hidden sm:inline">ORDERCRAFT</span>
            <div className="h-4 w-[1px] bg-[#2a2e39] mx-0.5" />
          </div>
        )}

        {/* Symbol Search Trigger Button */}
        <button
          onClick={() => openCommandPalette()}
          className="flex items-center space-x-2 px-2.5 py-1.5 rounded bg-[#1e222d] hover:bg-[#2a2e39] border border-[#2a2e39] font-semibold text-white transition-colors cursor-pointer"
          title="Search Symbol (Cmd/Ctrl + K)"
        >
          <Search size={13} className="text-[#2962ff]" />
          <span>{symbol}</span>
        </button>

        <div className="h-4 w-[1px] bg-[#2a2e39] mx-1" />

        {/* Timeframe Selector Pills */}
        <div className="flex items-center space-x-0.5">
          {displayedTimeframes.map((tf) => {
            const support = isTimeframeSupported(symbol, tf);
            const isSupported = support.supported;
            const isActive = timeframe === tf;

            if (!isSupported) {
              return (
                <div
                  key={tf}
                  className="relative group flex items-center px-2 py-1 rounded text-[11px] font-medium text-[#787b86]/40 bg-[#1e222d]/30 border border-[#2a2e39]/40 cursor-not-allowed select-none"
                >
                  <span className="line-through decoration-[#787b86]/40">{tf}</span>

                  {/* Tooltip on hover - positioned below the toolbar so it is always fully visible */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 hidden group-hover:flex items-center px-2 py-1 rounded bg-[#1e222d] text-[#d1d4dc] text-[10px] font-normal border border-[#2a2e39] shadow-xl whitespace-nowrap z-50 pointer-events-none">
                    {support.reason}
                  </div>
                </div>
              );
            }

            return (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#2962ff] text-white shadow-sm font-semibold'
                    : 'hover:bg-[#1e222d] text-[#787b86] hover:text-[#d1d4dc]'
                }`}
              >
                {tf}
              </button>
            );
          })}

          {/* Timeframe Dropdown Button */}
          <button
            ref={tfBtnRef}
            onClick={handleToggleDropdown}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              isTfDropdownOpen
                ? 'bg-[#2962ff] text-white'
                : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
            }`}
            title="More Timeframes & Pin Options"
          >
            <ChevronDown size={13} />
          </button>

          {/* Timeframe Dropdown Menu with fixed viewport positioning rendered via portal */}
          {isTfDropdownOpen && dropdownPos && createPortal(
            <>
              <div
                className="fixed inset-0 z-[9998]"
                onClick={() => setIsTfDropdownOpen(false)}
              />
              <div
                className="fixed w-64 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl py-2 z-[9999] text-xs backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
                style={{ top: dropdownPos.top, left: dropdownPos.left }}
              >
                <div className="px-3 pb-1 text-[10px] font-semibold text-[#787b86] border-b border-[#2a2e39] uppercase tracking-wider flex items-center justify-between">
                  <span>Select Timeframe</span>
                  <span className="text-[9px] lowercase font-normal">★ pin to bar</span>
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-[#2a2e39]/50">
                  {ALL_TIMEFRAME_CATEGORIES.map((cat) => (
                    <div key={cat.category} className="py-1">
                      <div className="px-3 py-1 text-[9px] font-bold text-[#787b86] uppercase tracking-wider">
                        {cat.category}
                      </div>
                      {cat.items.map((item) => {
                        const support = isTimeframeSupported(symbol, item.value);
                        const isSupported = support.supported;
                        const isPinned = pinnedTimeframes.includes(item.value);
                        const isActive = timeframe === item.value;

                        if (!isSupported) {
                          return (
                            <div
                              key={item.value}
                              className="relative group flex items-center justify-between px-3 py-1.5 opacity-40 hover:opacity-75 transition-opacity cursor-not-allowed select-none bg-[#131722]/30"
                            >
                              <div className="flex-1 flex items-center space-x-1.5 text-left text-[#787b86]">
                                <span className="w-8 font-mono line-through text-[#787b86]/70">{item.value}</span>
                                <span className="text-[11px] text-[#787b86]">{item.label}</span>
                              </div>

                              {/* Tooltip on hover */}
                              <div className="absolute right-12 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center px-2 py-1 rounded bg-[#131722] text-[#d1d4dc] text-[10px] font-normal border border-[#2a2e39] shadow-xl whitespace-nowrap z-50 pointer-events-none">
                                {support.reason}
                              </div>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePinTimeframe(item.value);
                                }}
                                className={`p-1 rounded transition-colors ${
                                  isPinned
                                    ? 'text-[#ff9800]'
                                    : 'text-[#787b86]/40 hover:text-[#ff9800] opacity-0 group-hover:opacity-100'
                                }`}
                                title={isPinned ? 'Unpin from topbar' : 'Pin to topbar'}
                              >
                                <Star size={11} fill={isPinned ? '#ff9800' : 'none'} />
                              </button>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={item.value}
                            className={`flex items-center justify-between px-3 py-1.5 hover:bg-[#2a2e39] transition-colors cursor-pointer group ${
                              isActive ? 'bg-[#2a2e39]/60 text-[#2962ff] font-semibold' : 'text-[#d1d4dc]'
                            }`}
                          >
                            <button
                              onClick={() => {
                                setTimeframe(item.value);
                                setIsTfDropdownOpen(false);
                              }}
                              className="flex-1 flex items-center space-x-2 text-left"
                            >
                              <span className="w-8 font-mono">{item.value}</span>
                              <span className="text-[#787b86] text-[11px] group-hover:text-[#d1d4dc]">
                                {item.label}
                              </span>
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePinTimeframe(item.value);
                              }}
                              className={`p-1 rounded transition-colors ${
                                isPinned
                                  ? 'text-[#ff9800]'
                                  : 'text-[#787b86]/40 hover:text-[#ff9800] opacity-0 group-hover:opacity-100'
                              }`}
                              title={isPinned ? 'Unpin from topbar' : 'Pin to topbar'}
                            >
                              <Star size={11} fill={isPinned ? '#ff9800' : 'none'} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </>,
            document.body
          )}
        </div>

        <div className="h-4 w-[1px] bg-[#2a2e39] mx-1" />

        {/* Bar Types Selector & Dropdown */}
        <div className="flex items-center space-x-0.5 bg-[#181b27] p-0.5 rounded border border-[#2a2e39]">
          {/* Pinned Favorite Bar Types */}
          {pinnedChartTypes.map((type) => {
            const isActive = currentChartType === type;
            return (
              <button
                key={type}
                onClick={() => setChartType(type)}
                className={`p-1 rounded transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#2a2e39] text-white shadow-sm font-semibold'
                    : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
                }`}
                title={type.replace('_', ' ')}
              >
                <BarTypeIcon type={type} size={15} strokeWidth={isActive ? 2 : 1.6} />
              </button>
            );
          })}

          {/* Active bar type if not in pinned list */}
          {!pinnedChartTypes.includes(currentChartType) && (
            <button
              onClick={() => setChartType(currentChartType)}
              className="p-1 rounded bg-[#2a2e39] text-white shadow-sm font-semibold cursor-pointer"
              title={currentChartType.replace('_', ' ')}
            >
              <BarTypeIcon type={currentChartType} size={15} strokeWidth={2} />
            </button>
          )}

          {/* Dropdown Chevron Trigger */}
          <button
            ref={barTypeBtnRef}
            onClick={handleToggleBarTypeDropdown}
            className={`p-1 rounded transition-colors cursor-pointer ${
              isBarTypeDropdownOpen
                ? 'bg-[#2962ff] text-white'
                : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
            }`}
            title="More Bar Types & Favorites"
          >
            <ChevronDown size={12} />
          </button>

          {/* Bar Types Dropdown Menu with fixed viewport positioning rendered via portal */}
          {isBarTypeDropdownOpen && barTypeDropdownPos && createPortal(
            <>
              <div
                className="fixed inset-0 z-[9998]"
                onClick={() => setIsBarTypeDropdownOpen(false)}
              />
              <div
                className="fixed w-52 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl py-1.5 z-[9999] text-xs backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none"
                style={{ top: barTypeDropdownPos.top, left: barTypeDropdownPos.left }}
              >
                {BAR_TYPE_CATEGORIES.map((cat, idx) => (
                  <div key={cat.category}>
                    {idx > 0 && <div className="my-1 border-t border-[#2a2e39]" />}
                    <div className="py-0.5">
                      {cat.items.map((item) => {
                        const isActive = currentChartType === item.id;
                        const isPinned = pinnedChartTypes.includes(item.id);

                        return (
                          <div
                            key={item.id}
                            onClick={() => {
                              setChartType(item.id);
                              setIsBarTypeDropdownOpen(false);
                            }}
                            className={`group relative flex items-center justify-between px-3 py-1.5 mx-1 rounded-[4px] cursor-pointer transition-colors ${
                              isActive
                                ? 'bg-white text-black font-semibold'
                                : 'text-[#d1d4dc] hover:bg-[#2a2e39]'
                            }`}
                          >
                            <div className="flex items-center space-x-2.5">
                              <span className={isActive ? 'text-black' : 'text-[#787b86] group-hover:text-white'}>
                                <BarTypeIcon type={item.id} size={16} strokeWidth={isActive ? 2 : 1.6} />
                              </span>
                              <span className="text-[12px]">{item.label}</span>
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePinChartType(item.id);
                              }}
                              className={`p-1 rounded transition-colors ${
                                isPinned
                                  ? 'text-[#ff9800]'
                                  : 'text-[#787b86]/40 hover:text-[#ff9800] opacity-0 group-hover:opacity-100'
                              }`}
                              title={isPinned ? 'Remove from favorites' : 'Add to favorites'}
                            >
                              <Star size={11} fill={isPinned ? '#ff9800' : 'none'} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>,
            document.body
          )}
        </div>

        <div className="h-4 w-[1px] bg-[#2a2e39] mx-1" />

        {/* Indicators Button */}
        <button
          onClick={openIndicatorsModal}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded hover:bg-[#1e222d] text-[#d1d4dc] transition-colors cursor-pointer"
          title="Indicators & Strategies"
        >
          <Sparkles size={13} className="text-[#089981]" />
          <span>Indicators</span>
        </button>

        <div className="h-4 w-[1px] bg-[#2a2e39] mx-1" />

        {/* Undo Button */}
        <div className="relative group flex items-center">
          <button
            onClick={canUndo ? undo : undefined}
            aria-label="Undo"
            className={`p-1.5 rounded transition-colors flex items-center justify-center ${
              canUndo
                ? 'text-[#d1d4dc] hover:text-white hover:bg-[#1e222d] cursor-pointer'
                : 'text-[#787b86]/40 cursor-default'
            }`}
          >
            <Undo2 size={14} />
          </button>
          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover:flex items-center space-x-2 bg-[#1e222d] border border-[#2a2e39] px-2.5 py-1.5 rounded shadow-2xl text-xs whitespace-nowrap z-50">
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#1e222d] border-t border-l border-[#2a2e39] rotate-45" />
            <span className="text-[#d1d4dc] font-normal">
              {undoDescription ? `Undo ${undoDescription}` : 'Undo'}
            </span>
            <span className="text-[#4f5666]">|</span>
            <span className="flex items-center space-x-1">
              <span className="bg-[#363a45] text-[#d1d4dc] font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold">
                Ctrl
              </span>
              <span className="text-[#787b86] text-[10px] font-bold">+</span>
              <span className="bg-[#363a45] text-[#d1d4dc] font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold">
                Z
              </span>
            </span>
          </div>
        </div>

        {/* Redo Button */}
        <div className="relative group flex items-center">
          <button
            onClick={canRedo ? redo : undefined}
            aria-label="Redo"
            className={`p-1.5 rounded transition-colors flex items-center justify-center ${
              canRedo
                ? 'text-[#d1d4dc] hover:text-white hover:bg-[#1e222d] cursor-pointer'
                : 'text-[#787b86]/40 cursor-default'
            }`}
          >
            <Redo2 size={14} />
          </button>
          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover:flex items-center space-x-2 bg-[#1e222d] border border-[#2a2e39] px-2.5 py-1.5 rounded shadow-2xl text-xs whitespace-nowrap z-50">
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#1e222d] border-t border-l border-[#2a2e39] rotate-45" />
            <span className="text-[#d1d4dc] font-normal">
              {redoDescription ? `Redo ${redoDescription}` : 'Redo'}
            </span>
            <span className="text-[#4f5666]">|</span>
            <span className="flex items-center space-x-1">
              <span className="bg-[#363a45] text-[#d1d4dc] font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold">
                Ctrl
              </span>
              <span className="text-[#787b86] text-[10px] font-bold">+</span>
              <span className="bg-[#363a45] text-[#d1d4dc] font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold">
                Y
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Right section: Layout Selector, Workspace Manager, Search, Settings, Snapshot, Fullscreen */}
      <div className="flex items-center space-x-1.5">
        {/* 1. Multi-Chart Grid Layout Selector Button (matches Image 2) */}
        <div className="relative">
          <button
            ref={gridBtnRef}
            onClick={() => setIsLayoutPopoverOpen(!isLayoutPopoverOpen)}
            className={`flex items-center space-x-1.5 px-2 py-1 rounded transition-colors cursor-pointer border ${
              isLayoutPopoverOpen
                ? 'bg-[#2962ff]/20 border-[#2962ff] text-[#2962ff]'
                : 'bg-[#181b27] border-[#2a2e39] text-[#d1d4dc] hover:bg-[#1e222d]'
            }`}
            title="Multi-Chart Grid Layout & Sync Options"
          >
            <LayoutGrid size={13} className="text-[#2962ff]" />
            <span className="font-mono text-[10px] uppercase font-semibold text-[#d1d4dc]">
              {layoutType}
            </span>
            <ChevronDown size={11} className="text-[#787b86]" />
          </button>

          <LayoutSelectorPopover
            isOpen={isLayoutPopoverOpen}
            onClose={() => setIsLayoutPopoverOpen(false)}
            anchorRef={gridBtnRef}
          />
        </div>

        {/* 2. Workspace Selector & Quick Save Menu */}
        <WorkspaceLayoutMenu />

        {/* Vertical divider */}
        <div className="h-4 w-[1px] bg-[#2a2e39] mx-1" />

        {/* 2. Quick Search (Lightning + Search Circle) */}
        <button
          onClick={() => openCommandPalette()}
          className="p-1.5 rounded hover:bg-[#1e222d] text-[#787b86] hover:text-[#d1d4dc] transition-colors cursor-pointer"
          title="Quick Search / Command Palette (Ctrl+K)"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
            <path d="M12 7l-3 5h4l-2 5" />
          </svg>
        </button>

        {/* 3. Settings Icon (Hexagon Nut with Center Hole) */}
        <button
          onClick={() => openChartSettings()}
          className="p-1.5 rounded hover:bg-[#1e222d] text-[#787b86] hover:text-[#d1d4dc] transition-colors cursor-pointer"
          title="Chart Settings"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>

        {/* 4. Snapshot / Camera Icon with 2 Options (Download & Copy) */}
        <div className="relative">
          <button
            ref={snapshotBtnRef}
            onClick={() => setIsSnapshotMenuOpen(!isSnapshotMenuOpen)}
            className={`p-1.5 rounded transition-colors cursor-pointer relative ${
              isSnapshotMenuOpen
                ? 'bg-[#2a2e39] text-white'
                : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
            }`}
            title="Chart snapshot"
          >
            <Camera size={16} />
          </button>

          {/* Feedback badge */}
          {snapshotFeedback && (
            <div className="absolute -bottom-7 right-0 bg-[#089981] text-white text-[10px] font-medium px-2 py-0.5 rounded shadow-lg z-50 whitespace-nowrap animate-in fade-in duration-100">
              {snapshotFeedback}
            </div>
          )}

          {/* Snapshot Dropdown Popover (matches user image) */}
          {isSnapshotMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsSnapshotMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1.5 w-64 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100 select-none">
                <div className="px-3 pb-2 text-[10px] font-semibold text-[#787b86] uppercase tracking-wider">
                  Chart snapshot
                </div>

                <button
                  onClick={handleDownloadSnapshot}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#2a2e39] transition-colors cursor-pointer text-left group"
                >
                  <div className="flex items-center space-x-2.5 text-xs text-[#d1d4dc] group-hover:text-white">
                    <Download size={15} className="text-[#d1d4dc] group-hover:text-white shrink-0" />
                    <span>Download image</span>
                  </div>
                  <span className="text-[11px] text-[#787b86] font-mono">Ctrl + Alt + S</span>
                </button>

                <button
                  onClick={handleCopySnapshot}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#2a2e39] transition-colors cursor-pointer text-left group"
                >
                  <div className="flex items-center space-x-2.5 text-xs text-[#d1d4dc] group-hover:text-white">
                    <Copy size={15} className="text-[#d1d4dc] group-hover:text-white shrink-0" />
                    <span>Copy image</span>
                  </div>
                  <span className="text-[11px] text-[#787b86] font-mono">Ctrl + Shift + S</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* 5. Fullscreen Icon (Corner Brackets) */}
        <button
          onClick={handleToggleFullscreen}
          className="p-1.5 rounded hover:bg-[#1e222d] text-[#787b86] hover:text-[#d1d4dc] transition-colors cursor-pointer"
          title={isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen'}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 8V5a2 2 0 0 1 2-2h3" />
            <path d="M16 3h3a2 2 0 0 1 2 2v3" />
            <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
            <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
          </svg>
        </button>
      </div>

      {/* Layout Save Feedback Toast */}
      {layoutFeedback && (
        <div className="fixed top-12 left-1/2 transform -translate-x-1/2 z-50 flex items-center space-x-1.5 bg-[#1e222d]/95 backdrop-blur-md border border-[#089981]/50 text-[#089981] text-xs font-medium px-3.5 py-1.5 rounded-md shadow-2xl animate-in fade-in zoom-in-95 duration-150 select-none">
          <Check size={14} className="text-[#089981]" />
          <span className="text-[#d1d4dc]">{layoutFeedback}</span>
        </div>
      )}
    </div>
  );
};
