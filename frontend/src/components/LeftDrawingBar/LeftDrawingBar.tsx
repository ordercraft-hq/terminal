import React, { useState, useRef, useEffect } from 'react';
import {
  TrendingUp,
  ArrowUpRight,
  Square,
  TrendingDown,
  Ruler,
  Magnet,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Trash2,
  Layers,
  Circle,
  Maximize2,
  Calendar,
  Info,
  Check,
  ChevronLeft,
  Link2,
  Star,
} from 'lucide-react';
import { useSyncStore } from '../../store/syncStore';
import type { DrawingToolType, CursorType } from '../../store/syncStore';
import {
  CrossCursorIcon,
  DotCursorIcon,
  ArrowCursorIcon,
  TrendlineIcon,
  HorizontalLineIcon,
  HorizontalRayIcon,
  VerticalLineIcon,
  CrossLineIcon,
  FibRetracementIcon,
  FibExtensionIcon,
  RotatedRectangleIcon,
  PathIcon,
  AnchoredVWAPIcon,
  FixedRangeVolumeProfileIcon,
  AnchoredVolumeProfileIcon,
} from '../../drawings/icons';
import { transport } from '../../transport/client';

interface ToolItem {
  type: DrawingToolType;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
}

export const LeftDrawingBar: React.FC = () => {
  const {
    activeTool,
    setActiveTool,
    cursorType,
    setCursorType,
    magnetMode,
    setMagnetMode,
    drawingsLocked,
    toggleDrawingsLocked,
    drawingsHidden,
    toggleDrawingsHidden,
    clearDrawings,
    drawings,
    symbol,
    isObjectTreeOpen,
    toggleObjectTree,
    activePaneId,
    panes,
    syncDrawingsAcrossCharts,
    toggleSyncDrawingsAcrossCharts,
    favoriteDrawingTools,
    toggleFavoriteDrawingTool,
    showFavoriteDrawingsBar,
    toggleShowFavoriteDrawingsBar,
  } = useSyncStore();

  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [lastActiveMagnetMode, setLastActiveMagnetMode] = useState<'weak' | 'strong'>('weak');
  const [isTrashMenuOpen, setIsTrashMenuOpen] = useState(false);
  const [lastSelectedTools, setLastSelectedTools] = useState<Record<string, DrawingToolType>>({
    lines: 'trendline',
    fib: 'fib_retracement',
    shapes: 'rectangle',
    measure: 'price_range',
    volume: 'anchored_vwap',
  });
  const [alwaysRemoveLockedDrawings, setAlwaysRemoveLockedDrawings] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ordercraft_always_remove_locked_drawings') === 'true';
    } catch {
      return false;
    }
  });

  const containerRef = useRef<HTMLElement>(null);

  const currentPaneId = activePaneId || 'pane-1';
  const activePane = panes[currentPaneId];
  const activeSymbol = activePane?.symbol || symbol;
  // Count drawings that belong to the active/selected chart
  const activeChartDrawings = drawings.filter((d) => {
    if (d.symbol && d.symbol !== activeSymbol) return false;
    if (syncDrawingsAcrossCharts) return true;
    const drawingPaneId = d.paneId || 'pane-1';
    return drawingPaneId === currentPaneId;
  });

  const drawingsCount = activeChartDrawings.length;
  const indicatorsMap = useSyncStore((s) => s.indicators);
  const paneIndicators = indicatorsMap[currentPaneId] || [];
  const indicatorsCount = paneIndicators.length;

  const toggleMagnet = () => {
    if (magnetMode === 'none') {
      setMagnetMode(lastActiveMagnetMode);
    } else {
      setMagnetMode('none');
      setOpenGroup(null);
    }
  };

  // Close flyouts when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
        setIsTrashMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRemoveDrawings = () => {
    const toDelete = activeChartDrawings.filter((d) => {
      if (!alwaysRemoveLockedDrawings && (d.locked || drawingsLocked)) return false;
      return true;
    });

    for (const d of toDelete) {
      transport.deleteDrawing(d.id).catch(console.error);
    }

    clearDrawings(activeSymbol, !syncDrawingsAcrossCharts ? currentPaneId : undefined, alwaysRemoveLockedDrawings);
    setActiveTool('cursor');
    setIsTrashMenuOpen(false);
  };

  const handleRemoveIndicators = () => {
    if (currentPaneId) {
      useSyncStore.getState().clearIndicatorsFromPane(currentPaneId);
      useSyncStore.getState().updatePaneSettings(currentPaneId, {
        showVolume: false,
        statusShowVolume: false,
      });
    }
    setIsTrashMenuOpen(false);
  };

  const handleRemoveBoth = () => {
    handleRemoveDrawings();
    handleRemoveIndicators();
  };

  const toggleAlwaysRemoveLocked = () => {
    setAlwaysRemoveLockedDrawings((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('ordercraft_always_remove_locked_drawings', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Group definitions
  const cursorTools: { type: CursorType; label: string; icon: React.ReactNode }[] = [
    { type: 'cross', label: 'Cross', icon: <CrossCursorIcon size={15} /> },
    { type: 'dot', label: 'Dot', icon: <DotCursorIcon size={15} /> },
    { type: 'arrow', label: 'Arrow', icon: <ArrowCursorIcon size={15} /> },
  ];

  const lineTools: ToolItem[] = [
    { type: 'trendline', label: 'Trend Line', icon: <TrendlineIcon size={15} />, shortcut: 'Alt+T' },
    { type: 'ray', label: 'Ray', icon: <ArrowUpRight size={15} /> },
    { type: 'info_line', label: 'Info Line', icon: <Info size={15} /> },
    { type: 'horizontal_line', label: 'Horizontal Line', icon: <HorizontalLineIcon size={15} />, shortcut: 'Alt+H' },
    { type: 'horizontal_ray', label: 'Horizontal Ray', icon: <HorizontalRayIcon size={15} />, shortcut: 'Alt+J' },
    { type: 'vertical_line', label: 'Vertical Line', icon: <VerticalLineIcon size={15} />, shortcut: 'Alt+V' },
    { type: 'cross_line', label: 'Cross Line', icon: <CrossLineIcon size={15} />, shortcut: 'Alt+C' },
    { type: 'parallel_channel', label: 'Parallel Channel', icon: <Maximize2 size={15} /> },
  ];

  const fibTools: ToolItem[] = [
    { type: 'fib_retracement', label: 'Fib Retracement', icon: <FibRetracementIcon size={15} />, shortcut: 'Alt+F' },
    { type: 'fib_extension', label: 'Trend-Based Fib Extension', icon: <FibExtensionIcon size={15} /> },
  ];

  const shapeTools: ToolItem[] = [
    { type: 'rectangle', label: 'Rectangle', icon: <Square size={15} />, shortcut: 'Alt+Shift+R' },
    { type: 'rotated_rectangle', label: 'Rotated rectangle', icon: <RotatedRectangleIcon size={15} /> },
    { type: 'path', label: 'Path', icon: <PathIcon size={15} /> },
    { type: 'circle', label: 'Circle / Ellipse', icon: <Circle size={15} /> },
  ];

  const measureTools: ToolItem[] = [
    { type: 'price_range', label: 'Price Range Ruler', icon: <Ruler size={15} className="text-[#2962ff]" /> },
    { type: 'date_range', label: 'Date Range Ruler', icon: <Calendar size={15} className="text-[#9c27b0]" /> },
    { type: 'date_price_range', label: 'Date and Price Range', icon: <Maximize2 size={15} className="text-[#00e5ff]" /> },
    { type: 'long_position', label: 'Long Position (R:R Calculator)', icon: <TrendingUp size={15} className="text-[#089981]" /> },
    { type: 'short_position', label: 'Short Position (R:R Calculator)', icon: <TrendingDown size={15} className="text-[#f23645]" /> },
  ];

  const volumeTools: ToolItem[] = [
    { type: 'anchored_vwap', label: 'Anchored VWAP', icon: <AnchoredVWAPIcon size={15} /> },
    { type: 'fixed_range_volume_profile', label: 'Fixed range volume profile', icon: <FixedRangeVolumeProfileIcon size={15} /> },
    { type: 'anchored_volume_profile', label: 'Anchored volume profile', icon: <AnchoredVolumeProfileIcon size={15} /> },
  ];

  const renderToolGroup = (
    groupId: string,
    defaultIcon: React.ReactNode,
    tools: ToolItem[],
    headerTitle?: string
  ) => {
    const isGroupActive = tools.some((t) => t.type === activeTool);
    const activeToolInGroup = tools.find((t) => t.type === activeTool);
    const chosenType = activeToolInGroup ? activeToolInGroup.type : lastSelectedTools[groupId] || tools[0].type;
    const currentTool = tools.find((t) => t.type === chosenType) || tools[0];
    const displayIcon = currentTool.icon || defaultIcon;
    const isOpen = openGroup === groupId;

    return (
      <div className="relative flex items-center group">
        <button
          id={`group-${groupId}`}
          onClick={() => {
            if (activeToolInGroup) {
              setOpenGroup(isOpen ? null : groupId);
            } else {
              setActiveTool(currentTool.type);
              setOpenGroup(null);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setOpenGroup(isOpen ? null : groupId);
          }}
          className={`w-9 h-9 flex items-center justify-center rounded transition-colors relative cursor-pointer ${
            isGroupActive
              ? 'bg-[#2962ff] text-white shadow-sm'
              : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
          }`}
          title={currentTool.label}
        >
          {displayIcon}
        </button>

        {/* Flyout arrow tab - visible on hover or when menu is open */}
        <button
          id={`arrow-${groupId}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpenGroup(isOpen ? null : groupId);
          }}
          className={`absolute -right-2 top-2 bottom-2 w-3 rounded-r flex items-center justify-center text-[#787b86] hover:text-white hover:bg-[#363a45] transition-all cursor-pointer z-10 ${
            isOpen
              ? 'opacity-100 bg-[#2a2e39]'
              : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto bg-[#2a2e39]'
          }`}
          title="More tools"
        >
          <ChevronLeft
            size={10}
            className={`transition-transform duration-150 ${isOpen ? '' : 'rotate-180'}`}
          />
        </button>

        {/* Flyout Submenu */}
        {isOpen && (
          <div className="absolute left-11 top-0 z-50 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl py-1 w-64 text-xs text-[#d1d4dc] backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
            {headerTitle && (
              <div className="px-3 py-1.5 text-[10px] font-semibold text-[#787b86] uppercase tracking-wider">
                {headerTitle}
              </div>
            )}
            {tools.map((t) => {
              const isSelected = activeTool === t.type;
              const isFav = favoriteDrawingTools.includes(t.type);
              return (
                <div
                  key={t.type}
                  id={`tool-${t.type}`}
                  data-tool={t.type}
                  onClick={() => {
                    setActiveTool(t.type);
                    setLastSelectedTools((prev) => ({ ...prev, [groupId]: t.type }));
                    setOpenGroup(null);
                  }}
                  className={`drawing-tool-row group/row w-full flex items-center justify-between px-3 py-2 hover:bg-[#2a2e39] transition-colors cursor-pointer text-left ${
                    isSelected ? 'bg-[#2962ff]/20 text-[#2962ff] font-medium' : 'text-[#d1d4dc]'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <span className={isSelected ? 'text-[#2962ff]' : 'text-[#787b86]'}>{t.icon}</span>
                    <span>{t.label}</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    {t.shortcut && (
                      <span className="text-[10px] font-mono text-[#787b86] px-1 py-0.5 rounded bg-[#131722]">
                        {t.shortcut}
                      </span>
                    )}
                    <button
                      type="button"
                      id={`star-${t.type}`}
                      data-star-tool={t.type}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavoriteDrawingTool(t.type);
                      }}
                      className={`drawing-tool-star-btn p-1 rounded hover:bg-[#363a45] transition-colors cursor-pointer shrink-0 ${
                        isFav
                          ? 'opacity-100 text-white'
                          : 'opacity-0 group-hover/row:opacity-100 text-[#787b86] hover:text-white'
                      }`}
                      title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star
                        size={14}
                        className={isFav ? 'text-white fill-white' : 'text-[#787b86] hover:text-[#d1d4dc]'}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      ref={containerRef}
      className="w-11 h-full bg-[#131722] border-r border-[#2a2e39] flex flex-col items-center py-2 space-y-1 select-none z-40"
    >
      {/* 1. Crosshairs & Cursor Group */}
      <div className="relative flex items-center group">
        <button
          onClick={() => {
            if (activeTool === 'cursor') {
              setOpenGroup(openGroup === 'cursor' ? null : 'cursor');
            } else {
              setActiveTool('cursor');
              setOpenGroup(null);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setOpenGroup(openGroup === 'cursor' ? null : 'cursor');
          }}
          className={`w-9 h-9 flex items-center justify-center rounded transition-colors relative cursor-pointer ${
            activeTool === 'cursor'
              ? 'bg-[#2962ff] text-white shadow-sm'
              : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
          }`}
          title={
            cursorType === 'cross'
              ? 'Cross'
              : cursorType === 'dot'
              ? 'Dot'
              : 'Arrow'
          }
        >
          {cursorType === 'cross' && <CrossCursorIcon size={16} />}
          {cursorType === 'dot' && <DotCursorIcon size={16} />}
          {cursorType === 'arrow' && <ArrowCursorIcon size={16} />}
        </button>

        {/* Flyout arrow tab - visible on hover or when menu is open */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpenGroup(openGroup === 'cursor' ? null : 'cursor');
          }}
          className={`absolute -right-2 top-2 bottom-2 w-3 rounded-r flex items-center justify-center text-[#787b86] hover:text-white hover:bg-[#363a45] transition-all cursor-pointer z-10 ${
            openGroup === 'cursor'
              ? 'opacity-100 bg-[#2a2e39]'
              : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto bg-[#2a2e39]'
          }`}
          title="Cursor options"
        >
          <ChevronLeft
            size={10}
            className={`transition-transform duration-150 ${openGroup === 'cursor' ? '' : 'rotate-180'}`}
          />
        </button>

        {/* Cursor / Crosshairs Flyout Submenu */}
        {openGroup === 'cursor' && (
          <div className="absolute left-11 top-0 z-50 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl py-1 w-48 text-xs text-[#d1d4dc] backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
            {cursorTools.map((t) => {
              const isSelected = activeTool === 'cursor' && cursorType === t.type;
              const isFav = favoriteDrawingTools.includes(t.type);
              return (
                <div
                  key={t.type}
                  id={`cursor-tool-${t.type}`}
                  data-tool={t.type}
                  onClick={() => {
                    setCursorType(t.type);
                    setActiveTool('cursor');
                    setOpenGroup(null);
                  }}
                  className={`drawing-tool-row group/row w-full flex items-center justify-between px-3 py-2 hover:bg-[#2a2e39] transition-colors cursor-pointer text-left ${
                    isSelected ? 'bg-[#2962ff]/20 text-[#2962ff] font-medium' : 'text-[#d1d4dc]'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <span className={isSelected ? 'text-[#2962ff]' : 'text-[#787b86]'}>
                      {t.icon}
                    </span>
                    <span>{t.label}</span>
                  </div>
                  <button
                    type="button"
                    id={`star-${t.type}`}
                    data-star-tool={t.type}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavoriteDrawingTool(t.type);
                    }}
                    className={`drawing-tool-star-btn p-1 rounded hover:bg-[#363a45] transition-colors cursor-pointer shrink-0 ${
                      isFav
                        ? 'opacity-100 text-white'
                        : 'opacity-0 group-hover/row:opacity-100 text-[#787b86] hover:text-white'
                    }`}
                    title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Star
                      size={14}
                      className={isFav ? 'text-white fill-white' : 'text-[#787b86] hover:text-[#d1d4dc]'}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="w-6 h-[1px] bg-[#2a2e39] my-1" />

      {/* 2. Lines & Rays Group */}
      {renderToolGroup('lines', <TrendlineIcon size={16} />, lineTools)}

      {/* 3. Fibonacci & Gann Group */}
      {renderToolGroup('fib', <FibRetracementIcon size={16} />, fibTools)}

      {/* 4. Geometric Shapes Group */}
      {renderToolGroup('shapes', <Square size={16} />, shapeTools)}

      {/* 5. Separate Long Position Tool */}
      <button
        onClick={() => {
          setActiveTool('long_position');
          setOpenGroup(null);
        }}
        className={`w-9 h-9 flex items-center justify-center rounded transition-colors relative cursor-pointer ${
          activeTool === 'long_position'
            ? 'bg-[#089981] text-white shadow-sm'
            : 'text-[#089981] hover:text-white hover:bg-[#089981]/20'
        }`}
        title="Long Position (R:R Calculator)"
      >
        <TrendingUp size={16} />
      </button>

      {/* 6. Separate Short Position Tool */}
      <button
        onClick={() => {
          setActiveTool('short_position');
          setOpenGroup(null);
        }}
        className={`w-9 h-9 flex items-center justify-center rounded transition-colors relative cursor-pointer ${
          activeTool === 'short_position'
            ? 'bg-[#f23645] text-white shadow-sm'
            : 'text-[#f23645] hover:text-white hover:bg-[#f23645]/20'
        }`}
        title="Short Position (R:R Calculator)"
      >
        <TrendingDown size={16} />
      </button>

      {/* 7. Prediction & Measurement Group */}
      {renderToolGroup('measure', <Ruler size={16} className="text-[#2962ff]" />, measureTools)}

      {/* 8. Volume-Based Group */}
      {renderToolGroup('volume', <AnchoredVWAPIcon size={16} />, volumeTools, 'VOLUME-BASED')}

      {/* Spacer to push utility toggles to bottom */}
      <div className="flex-1" />

      <div className="w-6 h-[1px] bg-[#2a2e39] my-1" />

      {/* 6. Magnet Mode Toggle & Selector */}
      <div className="relative flex items-center group">
        <button
          onClick={toggleMagnet}
          onContextMenu={(e) => {
            e.preventDefault();
            setOpenGroup(openGroup === 'magnet' ? null : 'magnet');
          }}
          className={`w-9 h-9 flex items-center justify-center rounded transition-colors relative cursor-pointer ${
            magnetMode === 'none'
              ? 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
              : 'bg-[#2962ff] text-white shadow-sm'
          }`}
          title={
            magnetMode === 'none'
              ? `Magnet Mode: OFF (Click to turn on ${lastActiveMagnetMode === 'strong' ? 'Strong' : 'Weak'} Magnet)`
              : `Magnet Mode: ${magnetMode.toUpperCase()} (Click to turn off)`
          }
        >
          <Magnet size={16} />
        </button>

        {/* Flyout arrow tab - visible on hover or when menu is open */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpenGroup(openGroup === 'magnet' ? null : 'magnet');
          }}
          className={`absolute -right-2 top-2 bottom-2 w-3 rounded-r flex items-center justify-center text-[#787b86] hover:text-white hover:bg-[#363a45] transition-all cursor-pointer z-10 ${
            openGroup === 'magnet'
              ? 'opacity-100 bg-[#2a2e39]'
              : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto bg-[#2a2e39]'
          }`}
          title="Magnet options"
        >
          <ChevronLeft
            size={10}
            className={`transition-transform duration-150 ${openGroup === 'magnet' ? '' : 'rotate-180'}`}
          />
        </button>

        {/* Flyout Submenu for Magnet Mode selection */}
        {openGroup === 'magnet' && (
          <div className="absolute left-11 top-0 z-50 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl py-1 w-56 text-xs text-[#d1d4dc] backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
            <button
              onClick={() => {
                setLastActiveMagnetMode('weak');
                setMagnetMode('weak');
                setOpenGroup(null);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 hover:bg-[#2a2e39] transition-colors cursor-pointer text-left ${
                magnetMode === 'weak' ? 'text-[#2962ff] font-medium' : 'text-[#d1d4dc]'
              }`}
            >
              <div className="flex flex-col">
                <span className="font-medium">Weak Magnet</span>
                <span className="text-[10px] text-[#787b86]">Snap within 24px of OHLC</span>
              </div>
              {magnetMode === 'weak' && <Check size={14} className="text-[#2962ff]" />}
            </button>
            <button
              onClick={() => {
                setLastActiveMagnetMode('strong');
                setMagnetMode('strong');
                setOpenGroup(null);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 hover:bg-[#2a2e39] transition-colors cursor-pointer text-left ${
                magnetMode === 'strong' ? 'text-[#2962ff] font-medium' : 'text-[#d1d4dc]'
              }`}
            >
              <div className="flex flex-col">
                <span className="font-medium">Strong Magnet</span>
                <span className="text-[10px] text-[#787b86]">Snap unconditionally to OHLC</span>
              </div>
              {magnetMode === 'strong' && <Check size={14} className="text-[#2962ff]" />}
            </button>
          </div>
        )}
      </div>

      {/* 7. Lock All Drawings */}
      <button
        onClick={toggleDrawingsLocked}
        className={`w-9 h-9 flex items-center justify-center rounded transition-colors cursor-pointer ${
          drawingsLocked
            ? 'bg-[#1e222d] text-[#f23645] border border-[#f23645]'
            : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
        }`}
        title={drawingsLocked ? 'Unlock All Drawings' : 'Lock All Drawings'}
      >
        {drawingsLocked ? <Lock size={16} /> : <Unlock size={16} />}
      </button>

      {/* 8. Object Tree Drawer Toggle */}
      <button
        onClick={toggleObjectTree}
        className={`w-9 h-9 flex items-center justify-center rounded transition-colors relative cursor-pointer ${
          isObjectTreeOpen
            ? 'bg-[#2962ff] text-white shadow-sm'
            : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
        }`}
        title="Object Tree & Drawings Manager"
      >
        <Layers size={16} />
        {drawingsCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#2962ff]" />
        )}
      </button>

      {/* 9. Hide All Drawings */}
      <button
        onClick={toggleDrawingsHidden}
        className={`w-9 h-9 flex items-center justify-center rounded transition-colors cursor-pointer ${
          drawingsHidden
            ? 'bg-[#1e222d] text-[#ff9800] border border-[#ff9800]'
            : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
        }`}
        title={drawingsHidden ? 'Show All Drawings' : 'Hide All Drawings'}
      >
        {drawingsHidden ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>

      {/* 10. Link Drawings Across Charts (Replicate drawings) */}
      <div className="relative flex items-center group">
        <button
          onClick={toggleSyncDrawingsAcrossCharts}
          className={`w-9 h-9 flex items-center justify-center rounded transition-colors cursor-pointer relative ${
            syncDrawingsAcrossCharts
              ? 'bg-[#2a2e39] text-[#2962ff]'
              : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
          }`}
          title="Sync drawings across charts"
        >
          <Link2 size={16} />
        </button>

        {/* Custom Tooltip */}
        <div className="absolute left-11 top-1/2 -translate-y-1/2 z-50 pointer-events-none hidden group-hover:block select-none">
          <div className="relative bg-[#2a2e39] border border-[#363a45] rounded-md shadow-2xl px-3.5 py-2.5 w-[260px] text-[13px] text-[#d1d4dc] leading-relaxed text-left">
            {/* Notch triangle pointing left */}
            <span className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#2a2e39] border-l border-b border-[#363a45] rotate-45" />
            <span>New drawings are replicated to all charts in the layout and shown when the same ticker is selected</span>
          </div>
        </div>
      </div>

      {/* 11. Delete Drawings Button with Flyout Menu */}
      <div className="relative flex items-center group">
        <button
          onClick={handleRemoveDrawings}
          onContextMenu={(e) => {
            e.preventDefault();
            setIsTrashMenuOpen(!isTrashMenuOpen);
          }}
          className={`w-9 h-9 flex items-center justify-center rounded transition-colors cursor-pointer relative ${
            isTrashMenuOpen
              ? 'bg-[#1e222d] text-[#d1d4dc]'
              : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
          }`}
          title="Remove drawings of selected chart"
        >
          <Trash2 size={16} />
        </button>

        {/* Flyout arrow tab - visible on hover or when menu is open */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsTrashMenuOpen(!isTrashMenuOpen);
          }}
          className={`absolute -right-2 top-2 bottom-2 w-3 rounded-r flex items-center justify-center text-[#787b86] hover:text-white hover:bg-[#363a45] transition-all cursor-pointer z-10 ${
            isTrashMenuOpen
              ? 'opacity-100 bg-[#2a2e39]'
              : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto bg-[#2a2e39]'
          }`}
          title="Remove options"
        >
          <ChevronLeft
            size={10}
            className={`transition-transform duration-150 ${isTrashMenuOpen ? '' : 'rotate-180'}`}
          />
        </button>

        {/* Flyout Submenu */}
        {isTrashMenuOpen && (
          <div
            className="absolute left-11 bottom-0 z-50 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl py-1.5 w-[270px] text-[13px] text-[#d1d4dc] backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 1. Remove X drawings */}
            <button
              onClick={handleRemoveDrawings}
              className="w-full flex items-center px-4 py-2 hover:bg-[#2a2e39] hover:text-white transition-colors cursor-pointer text-left font-normal"
            >
              <span>
                {drawingsCount > 0
                  ? `Remove ${drawingsCount} drawing${drawingsCount === 1 ? '' : 's'}`
                  : 'Remove drawings'}
              </span>
            </button>

            {/* 2. Remove 1 indicator */}
            <button
              onClick={handleRemoveIndicators}
              className="w-full flex items-center px-4 py-2 hover:bg-[#2a2e39] hover:text-white transition-colors cursor-pointer text-left font-normal"
            >
              <span>
                {indicatorsCount > 0
                  ? `Remove ${indicatorsCount} indicator${indicatorsCount === 1 ? '' : 's'}`
                  : 'Remove indicators'}
              </span>
            </button>

            {/* 3. Remove X drawings & 1 indicator */}
            <button
              onClick={handleRemoveBoth}
              className="w-full flex items-center px-4 py-2 hover:bg-[#2a2e39] hover:text-white transition-colors cursor-pointer text-left font-normal"
            >
              <span>
                {drawingsCount > 0
                  ? `Remove ${drawingsCount} drawing${drawingsCount === 1 ? '' : 's'} & ${indicatorsCount > 0 ? `${indicatorsCount} indicator${indicatorsCount === 1 ? '' : 's'}` : 'indicators'}`
                  : `Remove drawings & ${indicatorsCount > 0 ? `${indicatorsCount} indicator${indicatorsCount === 1 ? '' : 's'}` : 'indicators'}`}
              </span>
            </button>

            {/* Divider */}
            <div className="h-[1px] bg-[#2a2e39] my-1" />

            {/* 4. Always remove locked drawings Toggle */}
            <div
              onClick={toggleAlwaysRemoveLocked}
              className="w-full flex items-center justify-between px-4 py-2 hover:bg-[#2a2e39] transition-colors cursor-pointer select-none text-left"
            >
              <span className="text-[#d1d4dc]">Always remove locked drawings</span>
              <div
                className={`w-[36px] h-[20px] rounded-full transition-colors flex items-center p-[3px] shrink-0 ${
                  alwaysRemoveLockedDrawings ? 'bg-[#2962ff]' : 'bg-[#50535e]'
                }`}
              >
                <div
                  className={`w-[14px] h-[14px] rounded-full transition-all duration-150 ${
                    alwaysRemoveLockedDrawings
                      ? 'translate-x-[16px] bg-white'
                      : 'translate-x-0 bg-[#262931]'
                  }`}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 12. Starred Drawings Bar Toggle Button (Image 1) */}
      <div className="relative flex items-center group pt-1">
        <button
          id="toggle-favorites-bar"
          onClick={toggleShowFavoriteDrawingsBar}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer relative ${
            showFavoriteDrawingsBar
              ? 'bg-[#e0e3eb] text-[#131722] shadow-sm hover:bg-white'
              : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
          }`}
          title={showFavoriteDrawingsBar ? 'Hide favorite drawings bar' : 'Show favorite drawings bar'}
        >
          <Star
            size={18}
            className={showFavoriteDrawingsBar ? 'fill-none stroke-[2.2]' : 'fill-none stroke-[1.8]'}
          />
        </button>
      </div>
    </aside>
  );
};
