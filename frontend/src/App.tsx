import React, { Suspense, useEffect } from 'react';
import { Titlebar } from './components/Titlebar/Titlebar';
import { TopToolbar } from './components/TopToolbar/TopToolbar';
import { LeftDrawingBar } from './components/LeftDrawingBar/LeftDrawingBar';
import { WorkspaceGrid } from './components/WorkspaceGrid/WorkspaceGrid';
import { FavoriteDrawingsBar } from './drawings/components/FavoriteDrawingsBar';
import { RightSidebar } from './components/RightSidebar/RightSidebar';
import { useSyncStore } from './store/syncStore';
import { CommandPalette } from './components/Modals/CommandPalette';
import { ChangeIntervalModal } from './components/Modals/ChangeIntervalModal';

const LayoutModal = React.lazy(() =>
  import('./components/Modals/LayoutModal').then((m) => ({ default: m.LayoutModal }))
);
const ObjectTreeModal = React.lazy(() =>
  import('./components/Modals/ObjectTreeModal').then((m) => ({ default: m.ObjectTreeModal }))
);
const ChartSettingsModal = React.lazy(() =>
  import('./components/Modals/ChartSettingsModal').then((m) => ({ default: m.ChartSettingsModal }))
);
const IndicatorsModal = React.lazy(() =>
  import('./components/Modals/IndicatorsModal').then((m) => ({ default: m.IndicatorsModal }))
);
const IndicatorSettingsModal = React.lazy(() =>
  import('./components/Modals/IndicatorSettingsModal').then((m) => ({ default: m.IndicatorSettingsModal }))
);

export const App: React.FC = () => {
  const isObjectTreeOpen = useSyncStore((s) => s.isObjectTreeOpen);
  const closeObjectTree = useSyncStore((s) => s.closeObjectTree);
  const isChartSettingsOpen = useSyncStore((s) => s.isChartSettingsOpen);
  const closeChartSettings = useSyncStore((s) => s.closeChartSettings);
  const isLayoutModalOpen = useSyncStore((s) => s.isLayoutModalOpen);
  const isFullscreen = useSyncStore((s) => s.isFullscreen);
  const isIndicatorsModalOpen = useSyncStore((s) => s.isIndicatorsModalOpen);
  const closeIndicatorsModal = useSyncStore((s) => s.closeIndicatorsModal);
  const activeSettingsIndicator = useSyncStore((s) => s.activeSettingsIndicator);

  // Global Keyboard Shortcuts (Capture Phase): Direct chart typing -> Symbol Search & Ctrl+K
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Never intercept when user is typing in an input, textarea, select, or contenteditable
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          (typeof target.closest === 'function' &&
            (target.closest('input') || target.closest('textarea') || target.closest('select'))))
      ) {
        return;
      }

      // 2. Do not intercept if any modal, settings panel, or dialog is currently open
      const state = useSyncStore.getState();
      if (
        state.isCommandPaletteOpen ||
        state.isIntervalModalOpen ||
        state.isLayoutModalOpen ||
        state.isChartSettingsOpen ||
        state.isIndicatorsModalOpen ||
        state.isObjectTreeOpen ||
        Boolean(state.activeSettingsIndicator) ||
        Boolean(document.querySelector('.fixed.inset-0:not(.pointer-events-none)'))
      ) {
        return;
      }

      // 3. Ctrl+Z or Cmd+Z: Undo / Redo
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key.toLowerCase() === 'z' || e.code === 'KeyZ')) {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) {
          state.redo();
        } else {
          state.undo();
        }
        return;
      }

      // 4. Ctrl+Y or Cmd+Y: Redo
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key.toLowerCase() === 'y' || e.code === 'KeyY')) {
        e.preventDefault();
        e.stopPropagation();
        state.redo();
        return;
      }

      // 5. Ctrl+K or Cmd+K: Open Symbol Search / Command Palette
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key.toLowerCase() === 'k' || e.code === 'KeyK')) {
        e.preventDefault();
        e.stopPropagation();
        if (state.activeTool !== 'cursor') {
          state.setActiveTool('cursor');
        }
        state.openCommandPalette();
        return;
      }

      // 4. If modifier keys like Ctrl, Alt, or Meta (Cmd/Win) are pressed, ignore
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      // 5. Typing numbers (0-9) or comma (,) on chart -> opens Change Interval modal
      if (/^[0-9]$/.test(e.key) || e.key === ',') {
        e.preventDefault();
        e.stopPropagation();
        if (state.activeTool !== 'cursor') {
          state.setActiveTool('cursor');
        }
        state.openIntervalModal(e.key === ',' ? '' : e.key);
        return;
      }

      // 6. Direct typing on chart: letters (a-z, A-Z) -> opens Symbol Search / Command Palette
      if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        if (state.activeTool !== 'cursor') {
          state.setActiveTool('cursor');
        }
        state.openCommandPalette(e.key.toUpperCase());
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#131722] text-[#d1d4dc] overflow-hidden select-none">
      {/* 1. Frameless Pro Titlebar (hidden in Fullscreen mode) */}
      {!isFullscreen && <Titlebar />}

      {/* 2. Top Parameter & Timeframe Toolbar */}
      <TopToolbar />

      {/* 3. Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Drawing Tools Sidebar */}
        <LeftDrawingBar />

        {/* Multi-Chart Workspace Grid Canvas Area */}
        <main className="flex-1 relative overflow-hidden h-full">
          <WorkspaceGrid />
          <FavoriteDrawingsBar />
        </main>

        {/* Right Dock & Drawer Sidebar */}
        <RightSidebar />
      </div>

      {/* 4. Global Modals (Lazy Loaded on Demand) */}
      <Suspense fallback={null}>
        <CommandPalette />
        <ChangeIntervalModal />
        {isLayoutModalOpen && <LayoutModal />}
        {isObjectTreeOpen && <ObjectTreeModal isOpen={isObjectTreeOpen} onClose={closeObjectTree} />}
        {isChartSettingsOpen && <ChartSettingsModal isOpen={isChartSettingsOpen} onClose={closeChartSettings} />}
        {isIndicatorsModalOpen && <IndicatorsModal isOpen={isIndicatorsModalOpen} onClose={closeIndicatorsModal} />}
        {activeSettingsIndicator && <IndicatorSettingsModal />}
      </Suspense>
    </div>
  );
};

export default App;
