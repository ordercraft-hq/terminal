import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useSyncStore, getPanesForLayout, DEFAULT_LAYOUT_RATIOS } from '../../store/syncStore';
import type { LayoutRatios } from '../../store/syncStore';
import { ChartPane } from '../ChartPane/ChartPane';

interface DragState {
  type: 'col' | 'row' | 'both';
  colIndex?: number;
  rowIndex?: number;
  startX: number;
  startY: number;
  startCols: number[];
  startRows: number[];
  containerWidth: number;
  containerHeight: number;
}

export const WorkspaceGrid: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const layoutType = useSyncStore((s) => s.layoutType);
  const maximizedPaneId = useSyncStore((s) => s.maximizedPaneId);
  const setMaximizedPaneId = useSyncStore((s) => s.setMaximizedPaneId);
  const activePaneId = useSyncStore((s) => s.activePaneId);
  const setActivePaneId = useSyncStore((s) => s.setActivePaneId);
  const layoutRatios = useSyncStore((s) => s.layoutRatios);
  const setLayoutRatios = useSyncStore((s) => s.setLayoutRatios);
  const resetLayoutRatios = useSyncStore((s) => s.resetLayoutRatios);

  const [dragState, setDragState] = useState<DragState | null>(null);

  const paneIds = getPanesForLayout(layoutType);
  const isMultiPane = paneIds.length > 1;


  const defaultR = DEFAULT_LAYOUT_RATIOS[layoutType] || { cols: [1], rows: [1] };
  const currentR: LayoutRatios = layoutRatios[layoutType] || defaultR;

  // Ensure valid ratio arrays match column and row counts
  const colRatios = currentR.cols?.length === defaultR.cols.length ? currentR.cols : defaultR.cols;
  const rowRatios = currentR.rows?.length === defaultR.rows.length ? currentR.rows : defaultR.rows;

  const colTemplate = colRatios.map((c) => `${c}fr`).join(' ');
  const rowTemplate = rowRatios.map((r) => `${r}fr`).join(' ');

  const getCellClass = (index: number) => {
    if (layoutType === '3top' && index === 0) {
      return 'col-span-2 row-span-1';
    }
    if (layoutType === '3left' && index === 0) {
      return 'col-span-1 row-span-2';
    }
    return '';
  };

  // Drag interaction handlers
  const handlePointerDownCol = (e: React.PointerEvent, colIndex: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDragState({
      type: 'col',
      colIndex,
      startX: e.clientX,
      startY: e.clientY,
      startCols: [...colRatios],
      startRows: [...rowRatios],
      containerWidth: rect.width,
      containerHeight: rect.height,
    });
  };

  const handlePointerDownRow = (e: React.PointerEvent, rowIndex: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDragState({
      type: 'row',
      rowIndex,
      startX: e.clientX,
      startY: e.clientY,
      startCols: [...colRatios],
      startRows: [...rowRatios],
      containerWidth: rect.width,
      containerHeight: rect.height,
    });
  };

  const handlePointerDownBoth = (e: React.PointerEvent, colIndex: number, rowIndex: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDragState({
      type: 'both',
      colIndex,
      rowIndex,
      startX: e.clientX,
      startY: e.clientY,
      startCols: [...colRatios],
      startRows: [...rowRatios],
      containerWidth: rect.width,
      containerHeight: rect.height,
    });
  };

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragState) return;
      e.preventDefault();

      const nextCols = [...dragState.startCols];
      const nextRows = [...dragState.startRows];

      // Handle horizontal resize (columns)
      if ((dragState.type === 'col' || dragState.type === 'both') && dragState.colIndex !== undefined) {
        const idx = dragState.colIndex;
        const deltaX = e.clientX - dragState.startX;
        const deltaRatio = deltaX / dragState.containerWidth;
        const pairSum = dragState.startCols[idx] + dragState.startCols[idx + 1];
        const minRatio = Math.max(0.08, 90 / dragState.containerWidth);
        const maxRatio = pairSum - minRatio;
        if (maxRatio > minRatio) {
          const newLeft = Math.min(Math.max(dragState.startCols[idx] + deltaRatio, minRatio), maxRatio);
          const newRight = pairSum - newLeft;
          nextCols[idx] = newLeft;
          nextCols[idx + 1] = newRight;
        }
      }

      // Handle vertical resize (rows)
      if ((dragState.type === 'row' || dragState.type === 'both') && dragState.rowIndex !== undefined) {
        const idx = dragState.rowIndex;
        const deltaY = e.clientY - dragState.startY;
        const deltaRatio = deltaY / dragState.containerHeight;
        const pairSum = dragState.startRows[idx] + dragState.startRows[idx + 1];
        const minRatio = Math.max(0.08, 70 / dragState.containerHeight);
        const maxRatio = pairSum - minRatio;
        if (maxRatio > minRatio) {
          const newTop = Math.min(Math.max(dragState.startRows[idx] + deltaRatio, minRatio), maxRatio);
          const newBottom = pairSum - newTop;
          nextRows[idx] = newTop;
          nextRows[idx + 1] = newBottom;
        }
      }

      setLayoutRatios(layoutType, { cols: nextCols, rows: nextRows });
    },
    [dragState, layoutType, setLayoutRatios]
  );

  const handlePointerUp = useCallback(() => {
    setDragState(null);
  }, []);

  useEffect(() => {
    if (!dragState) return;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [dragState, handlePointerMove, handlePointerUp]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && maximizedPaneId) {
        setMaximizedPaneId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [maximizedPaneId, setMaximizedPaneId]);

  // Single maximized pane view (all hooks already called)
  if (maximizedPaneId && paneIds.includes(maximizedPaneId)) {
    return (
      <div className="workspace-grid-container absolute inset-0 flex flex-col min-h-0 overflow-hidden bg-[#131722]">
        <ChartPane paneId={maximizedPaneId} isGrid={isMultiPane} />
      </div>
    );
  }

  // 1x1 Single chart (all hooks already called)
  if (layoutType === '1' || paneIds.length <= 1) {
    return (
      <div className="workspace-grid-container absolute inset-0 flex flex-col min-h-0 overflow-hidden bg-[#131722]">
        <ChartPane paneId="pane-1" isGrid={false} />
      </div>
    );
  }

  // Splitter position percentages
  const getColSplitPercent = (colIdx: number) => {
    let sum = 0;
    for (let i = 0; i <= colIdx; i++) {
      sum += colRatios[i];
    }
    return sum * 100;
  };

  const getRowSplitPercent = (rowIdx: number) => {
    let sum = 0;
    for (let i = 0; i <= rowIdx; i++) {
      sum += rowRatios[i];
    }
    return sum * 100;
  };

  return (
    <div
      ref={containerRef}
      style={{
        gridTemplateColumns: colTemplate,
        gridTemplateRows: rowTemplate,
      }}
      className="workspace-grid-container absolute inset-0 overflow-hidden grid gap-[2px] bg-[#2a2e39]"
    >
      {/* Chart Panes */}
      {paneIds.map((paneId, idx) => {
        const isActive = activePaneId === paneId;
        return (
          <div
            key={paneId}
            onClick={() => setActivePaneId(paneId)}
            className={`workspace-grid-cell relative h-full w-full overflow-hidden bg-[#131722] ${getCellClass(idx)} ${
              isActive
                ? 'ring-1 ring-[#2962ff] ring-inset'
                : 'hover:ring-1 hover:ring-[#2a2e39] hover:ring-inset'
            }`}
          >
            <ChartPane paneId={paneId} isGrid={isMultiPane} />
          </div>
        );
      })}

      {/* Vertical Column Splitters */}
      {colRatios.length > 1 &&
        colRatios.slice(0, -1).map((_, i) => {
          const leftPercent = getColSplitPercent(i);
          const is3top = layoutType === '3top';
          const topPercent = is3top ? getRowSplitPercent(0) : 0;
          return (
            <div
              key={`col-split-${i}`}
              onPointerDown={(e) => handlePointerDownCol(e, i)}
              onDoubleClick={() => resetLayoutRatios(layoutType)}
              style={{
                left: `${leftPercent}%`,
                top: `${topPercent}%`,
                bottom: 0,
              }}
              title="Drag to resize columns • Double-click to reset"
              className="absolute -translate-x-1/2 w-[10px] z-20 cursor-col-resize flex items-center justify-center group select-none"
            >
              <div
                className={`w-[2px] h-full transition-colors duration-150 ${
                  dragState?.type === 'col' && dragState.colIndex === i
                    ? 'bg-[#2962ff] shadow-[0_0_8px_#2962ff]'
                    : 'bg-[#2a2e39] group-hover:bg-[#2962ff]'
                }`}
              />
            </div>
          );
        })}

      {/* Horizontal Row Splitters */}
      {rowRatios.length > 1 &&
        rowRatios.slice(0, -1).map((_, j) => {
          const topPercent = getRowSplitPercent(j);
          const is3left = layoutType === '3left';
          const leftPercent = is3left ? getColSplitPercent(0) : 0;
          return (
            <div
              key={`row-split-${j}`}
              onPointerDown={(e) => handlePointerDownRow(e, j)}
              onDoubleClick={() => resetLayoutRatios(layoutType)}
              style={{
                top: `${topPercent}%`,
                left: `${leftPercent}%`,
                right: 0,
              }}
              title="Drag to resize rows • Double-click to reset"
              className="absolute -translate-y-1/2 h-[10px] z-20 cursor-row-resize flex items-center justify-center group select-none"
            >
              <div
                className={`h-[2px] w-full transition-colors duration-150 ${
                  dragState?.type === 'row' && dragState.rowIndex === j
                    ? 'bg-[#2962ff] shadow-[0_0_8px_#2962ff]'
                    : 'bg-[#2a2e39] group-hover:bg-[#2962ff]'
                }`}
              />
            </div>
          );
        })}

      {/* Intersection Handles for 2D grids (e.g. 4, 6, 8, 3top, 3left) */}
      {colRatios.length > 1 &&
        rowRatios.length > 1 &&
        colRatios.slice(0, -1).map((_, i) =>
          rowRatios.slice(0, -1).map((_, j) => {
            const leftPercent = getColSplitPercent(i);
            const topPercent = getRowSplitPercent(j);
            return (
              <div
                key={`intersect-${i}-${j}`}
                onPointerDown={(e) => handlePointerDownBoth(e, i, j)}
                onDoubleClick={() => resetLayoutRatios(layoutType)}
                style={{
                  left: `${leftPercent}%`,
                  top: `${topPercent}%`,
                }}
                title="Drag to resize both dimensions • Double-click to reset"
                className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 z-30 cursor-move rounded-full bg-[#1e222d] border border-[#2a2e39] hover:border-[#2962ff] hover:shadow-[0_0_8px_rgba(41,98,255,0.8)] flex items-center justify-center group transition-all select-none"
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    dragState?.type === 'both' &&
                    dragState.colIndex === i &&
                    dragState.rowIndex === j
                      ? 'bg-[#2962ff]'
                      : 'bg-[#787b86] group-hover:bg-[#2962ff]'
                  }`}
                />
              </div>
            );
          })
        )}

      {/* Fullscreen Transparent Shield during drag to capture pointer events smoothly */}
      {dragState && (
        <div
          className="fixed inset-0 z-50 select-none pointer-events-auto"
          style={{
            cursor:
              dragState.type === 'col'
                ? 'col-resize'
                : dragState.type === 'row'
                ? 'row-resize'
                : 'move',
          }}
        />
      )}
    </div>
  );
};

export default WorkspaceGrid;
