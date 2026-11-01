import React, { useState, useRef, useEffect } from 'react';
import { GripVertical } from 'lucide-react';
import { useSyncStore, type DrawingToolType } from '../../store/syncStore';
import { getDrawingIcon, DRAWING_TOOL_LABELS } from '../icons';

export const FavoriteDrawingsBar: React.FC = () => {
  const activeTool = useSyncStore((s) => s.activeTool);
  const setActiveTool = useSyncStore((s) => s.setActiveTool);
  const cursorType = useSyncStore((s) => s.cursorType);
  const setCursorType = useSyncStore((s) => s.setCursorType);
  const favoriteDrawingTools = useSyncStore((s) => s.favoriteDrawingTools);
  const showFavoriteDrawingsBar = useSyncStore((s) => s.showFavoriteDrawingsBar);
  const toggleFavoriteDrawingTool = useSyncStore((s) => s.toggleFavoriteDrawingTool);

  const barRef = useRef<HTMLDivElement>(null);

  // Position state (draggable, persisted in localStorage)
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem('ordercraft_favorite_drawings_bar_pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return {
            x: Math.max(8, parsed.x),
            y: Math.max(8, parsed.y),
          };
        }
      }
    } catch {}
    // Default position: lower-left region of the workspace, above the bottom axis
    return {
      x: 60,
      y: 400,
    };
  });

  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentPosRef = useRef<{ x: number; y: number }>(pos);

  // Helper to compute clamped coordinates inside parent container
  const getClampedPos = (x: number, y: number) => {
    const parent = barRef.current?.parentElement;
    const containerW = parent ? parent.clientWidth : (typeof window !== 'undefined' ? window.innerWidth : 1200);
    const containerH = parent ? parent.clientHeight : (typeof window !== 'undefined' ? window.innerHeight : 800);
    const barW = barRef.current?.offsetWidth || 150;
    const barH = barRef.current?.offsetHeight || 36;
    const minX = 8;
    const minY = 8;
    const maxX = Math.max(minX, containerW - barW - 8);
    const maxY = Math.max(minY, containerH - barH - 8);
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  };

  // Clamp position on mount, when items change, or on window resize
  useEffect(() => {
    const clampPos = () => {
      setPos((prev) => {
        const clamped = getClampedPos(prev.x, prev.y);
        if (clamped.x !== prev.x || clamped.y !== prev.y) {
          currentPosRef.current = clamped;
          return clamped;
        }
        return prev;
      });
    };

    // Run after DOM has laid out the toolbar
    const timer = setTimeout(clampPos, 20);
    window.addEventListener('resize', clampPos);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', clampPos);
    };
  }, [favoriteDrawingTools.length, showFavoriteDrawingsBar]);

  const handleDragStart = (e: React.PointerEvent) => {
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

  useEffect(() => {
    if (!isDragging) return;
    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - dragStartMouseRef.current.x;
      const dy = e.clientY - dragStartMouseRef.current.y;
      const clamped = getClampedPos(dragStartPosRef.current.x + dx, dragStartPosRef.current.y + dy);
      currentPosRef.current = clamped;
      if (barRef.current) {
        barRef.current.style.left = `${clamped.x}px`;
        barRef.current.style.top = `${clamped.y}px`;
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      try {
        (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
      } catch {}
      isDraggingRef.current = false;
      setIsDragging(false);
      const finalPos = { ...currentPosRef.current };
      setPos(finalPos);
      try {
        localStorage.setItem('ordercraft_favorite_drawings_bar_pos', JSON.stringify(finalPos));
      } catch {}
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [isDragging]);

  // If toolbar is hidden or no favorite tools exist, do not render
  if (!showFavoriteDrawingsBar || !favoriteDrawingTools || favoriteDrawingTools.length === 0) {
    return null;
  }

  return (
    <div
      ref={barRef}
      id="favorite-drawings-bar"
      style={{
        left: `${isDragging ? currentPosRef.current.x : pos.x}px`,
        top: `${isDragging ? currentPosRef.current.y : pos.y}px`,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        const target = e.target as HTMLElement;
        if (!target.closest('button')) {
          handleDragStart(e);
        }
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="floating-drawing-toolbar absolute z-30 pointer-events-auto flex items-center h-9 px-1.5 rounded-lg bg-[#1e222d] border border-[#2a2e39] shadow-2xl text-[#d1d4dc] backdrop-blur-md select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* 1. Drag Handle (6 dots) */}
      <div
        id="fav-bar-drag-handle"
        onPointerDown={handleDragStart}
        className="px-1 py-1 cursor-grab active:cursor-grabbing text-[#787b86] hover:text-[#d1d4dc] transition-colors flex items-center justify-center shrink-0"
        title="Drag favorite tools bar"
      >
        <GripVertical size={14} />
      </div>

      <div className="w-[1px] h-4 bg-[#2a2e39] mx-1 shrink-0" />

      {/* 2. Starred / Favorite Tools in a Row */}
      <div className="flex items-center space-x-1">
        {favoriteDrawingTools.map((toolType) => {
          const isCursorTool = toolType === 'cross' || toolType === 'dot' || toolType === 'arrow';
          const isActive = isCursorTool
            ? activeTool === 'cursor' && cursorType === toolType
            : activeTool === toolType;
          const label = DRAWING_TOOL_LABELS[toolType] || toolType;

          return (
            <button
              key={toolType}
              id={`fav-tool-${toolType}`}
              onClick={() => {
                if (isCursorTool) {
                  setCursorType(toolType);
                  setActiveTool('cursor');
                } else {
                  setActiveTool(toolType as DrawingToolType);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                toggleFavoriteDrawingTool(toolType);
              }}
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-[#2962ff] text-white shadow-sm'
                  : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]'
              }`}
              title={`${label} (Right-click to unstar)`}
            >
              {getDrawingIcon(toolType, { size: 16 })}
            </button>
          );
        })}
      </div>
    </div>
  );
};
