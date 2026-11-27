import React, { Suspense, useRef, useState, useEffect } from 'react';
import { useSyncStore } from '../../store/syncStore';

const WatchlistPanel = React.lazy(() =>
  import('./panels/WatchlistPanel').then((m) => ({ default: m.WatchlistPanel }))
);
const AlertsPanel = React.lazy(() =>
  import('./panels/AlertsPanel').then((m) => ({ default: m.AlertsPanel }))
);
const ObjectTreePanel = React.lazy(() =>
  import('./panels/ObjectTreePanel').then((m) => ({ default: m.ObjectTreePanel }))
);
const EconomicCalendarPanel = React.lazy(() =>
  import('./panels/EconomicCalendarPanel').then((m) => ({ default: m.EconomicCalendarPanel }))
);
const NewsFlowPanel = React.lazy(() =>
  import('./panels/NewsFlowPanel').then((m) => ({ default: m.NewsFlowPanel }))
);
const ProvidersPanel = React.lazy(() =>
  import('./panels/ProvidersPanel').then((m) => ({ default: m.ProvidersPanel }))
);
const MoversPanel = React.lazy(() =>
  import('./panels/MoversPanel').then((m) => ({ default: m.MoversPanel }))
);
const HelpPanel = React.lazy(() =>
  import('./panels/HelpPanel').then((m) => ({ default: m.HelpPanel }))
);
const IssuesPanel = React.lazy(() =>
  import('./panels/IssuesPanel').then((m) => ({ default: m.IssuesPanel }))
);
const OrderflowPanel = React.lazy(() =>
  import('./panels/OrderflowPanel').then((m) => ({ default: m.OrderflowPanel }))
);

export const RightSidebarDrawer: React.FC = () => {
  const activeTab = useSyncStore((s) => s.activeRightSidebarTab);
  const width = useSyncStore((s) => s.rightSidebarWidth);
  const setWidth = useSyncStore((s) => s.setRightSidebarWidth);

  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragWidthRef = useRef<number | null>(null);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = startXRef.current - e.clientX;
      const nextWidth = Math.max(280, Math.min(600, startWidthRef.current + deltaX));
      dragWidthRef.current = nextWidth;
      setDragWidth(nextWidth);
    };

    const handlePointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        const finalWidth = dragWidthRef.current;
        dragWidthRef.current = null;
        setDragWidth(null);
        if (finalWidth !== null) {
          setWidth(finalWidth);
        }
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [setWidth]);

  const handleResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    dragWidthRef.current = width;
    setDragWidth(width);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  if (!activeTab) return null;

  const effectiveWidth = dragWidth ?? width;

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'watchlist':
        return <WatchlistPanel />;
      case 'alerts':
      case 'notifications':
        return <AlertsPanel />;
      case 'objectTree':
        return <ObjectTreePanel />;
      case 'calendar':
        return <EconomicCalendarPanel />;
      case 'news':
        return <NewsFlowPanel />;
      case 'providers':
        return <ProvidersPanel />;
      case 'movers':
        return <MoversPanel />;
      case 'help':
        return <HelpPanel />;
      case 'issues':
        return <IssuesPanel />;
      case 'orderflow':
        return <OrderflowPanel />;
      default:
        return null;
    }
  };

  return (
    <div
      className="relative h-full bg-[#131722] border-l border-[#2a2e39] flex flex-col z-20 shrink-0"
      style={{ width: `${effectiveWidth}px` }}
    >
      {/* Left Resizer Drag Handle */}
      <div
        onPointerDown={handleResizeStart}
        className="absolute top-0 bottom-0 -left-1 w-2 hover:bg-[#2962ff]/50 cursor-col-resize z-30 transition-colors"
        title="Drag to resize panel"
      />

      {/* Panel Body */}
      <div className="flex-1 overflow-hidden relative">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full text-xs text-[#787b86]">
              Loading...
            </div>
          }
        >
          {renderActivePanel()}
        </Suspense>
      </div>
    </div>
  );
};
