import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Maximize2, Minimize2 } from 'lucide-react';
import { transport } from '../../transport/client';

export const Titlebar: React.FC = () => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const isDesktop = typeof window !== 'undefined' && Boolean(window.runtime);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, []);

  const handleToggleFullscreen = async () => {
    const fs = await transport.toggleFullscreen();
    setIsFullscreen(fs);
  };

  return (
    <header className="wails-drag h-9 w-full bg-[#131722] border-b border-[#2a2e39] flex items-center justify-between px-3 text-xs select-none z-50">
      {/* Left: Brand */}
      <div className="wails-no-drag flex items-center space-x-3">
        <div className="flex items-center space-x-2 font-bold tracking-wider text-[#d1d4dc]">
          <img
            src="/logo.png"
            alt="ORDERCRAFT Logo"
            className="w-5 h-5 rounded-[4px] object-contain shadow-[0_0_10px_rgba(41,98,255,0.35)]"
          />
          <span className="text-sm font-semibold tracking-tight text-white">ORDERCRAFT</span>
        </div>
      </div>

      {/* Center spacer */}
      <div className="flex-1" />

      {/* Right: Fullscreen Toggle and Window Controls */}
      <div className="wails-no-drag flex items-center space-x-2">
        {/* Working Full-Screen Toggle Button */}
        <button
          onClick={handleToggleFullscreen}
          className="w-8 h-7 flex items-center justify-center text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d] rounded transition-colors cursor-pointer"
          title={isFullscreen ? 'Exit Fullscreen (Alt+F)' : 'Fullscreen Mode (Alt+F)'}
          aria-label="Toggle Fullscreen"
        >
          {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>

        {/* Native Desktop Window Controls (shown only when running in desktop wrapper) */}
        {isDesktop && (
          <div className="flex items-center space-x-1 border-l border-[#2a2e39] pl-1 ml-1">
            <button
              onClick={() => transport.minimizeWindow()}
              className="w-8 h-7 flex items-center justify-center text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d] rounded transition-colors cursor-pointer"
              title="Minimize"
              aria-label="Minimize Window"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={() => transport.toggleMaximizeWindow()}
              className="w-8 h-7 flex items-center justify-center text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d] rounded transition-colors cursor-pointer"
              title="Maximize"
              aria-label="Maximize Window"
            >
              <Square size={12} />
            </button>
            <button
              onClick={() => transport.closeWindow()}
              className="w-8 h-7 flex items-center justify-center text-[#787b86] hover:text-white hover:bg-[#f23645] rounded transition-colors cursor-pointer"
              title="Close"
              aria-label="Close Window"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
