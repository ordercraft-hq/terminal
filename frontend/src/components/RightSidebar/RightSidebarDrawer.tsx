import React, { useRef, useEffect } from 'react';
import { useSyncStore } from '../../store/syncStore';
import { WatchlistPanel } from './panels/WatchlistPanel';
import { AlertsPanel } from './panels/AlertsPanel';
import { ObjectTreePanel } from './panels/ObjectTreePanel';
import { EconomicCalendarPanel } from './panels/EconomicCalendarPanel';
import { NewsFlowPanel } from './panels/NewsFlowPanel';
import { ProvidersPanel } from './panels/ProvidersPanel';
import { MoversPanel } from './panels/MoversPanel';
import { HelpPanel } from './panels/HelpPanel';
import { IssuesPanel } from './panels/IssuesPanel';

export const RightSidebarDrawer: React.FC = () => {
  const activeTab = useSyncStore((s) => s.activeRightSidebarTab);
  const width = useSyncStore((s) => s.rightSidebarWidth);
  const setWidth = useSyncStore((s) => s.setRightSidebarWidth);

  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = startXRef.current - e.clientX;
      const nextWidth = Math.max(280, Math.min(600, startWidthRef.current + deltaX));
      setWidth(nextWidth);
    };

    const handlePointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [setWidth]);

  const handleResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  if (!activeTab) return null;

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
      default:
        return null;
    }
  };

  return (
    <div
      className="relative h-full bg-[#131722] border-l border-[#2a2e39] flex flex-col z-20 shrink-0"
      style={{ width: `${width}px` }}
    >
      {/* Left Resizer Drag Handle */}
      <div
        onPointerDown={handleResizeStart}
        className="absolute top-0 bottom-0 -left-1 w-2 hover:bg-[#2962ff]/50 cursor-col-resize z-30 transition-colors"
        title="Drag to resize panel"
      />

      {/* Panel Body */}
      <div className="flex-1 overflow-hidden relative">
        {renderActivePanel()}
      </div>
    </div>
  );
};
