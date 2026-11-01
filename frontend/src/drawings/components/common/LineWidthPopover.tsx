import React, { useState, useRef, useEffect } from 'react';

interface LineWidthPopoverProps {
  value: number;
  onChange: (width: number) => void;
  className?: string;
  color?: string;
}

export const LineWidthPopover: React.FC<LineWidthPopoverProps> = ({
  value,
  onChange,
  className = '',
  color = '#d1d4dc',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const widths = [1, 2, 3, 4];
  const safeWidth = Math.max(1, Math.min(4, Math.round(value || 1)));

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="h-7 px-2 rounded-[3px] hover:bg-[#2a2e39] flex items-center space-x-1.5 cursor-pointer text-[#d1d4dc] hover:text-white transition-colors"
        title="Line Width"
      >
        <div
          className="w-4 rounded-full"
          style={{ height: `${safeWidth}px`, backgroundColor: color }}
        />
        <span className="text-[11px] font-mono">{safeWidth}px</span>
      </button>

      {isOpen && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="dropdown-menu absolute z-50 mt-1 left-0 bg-[#1e222d] border border-[#2a2e39] rounded shadow-xl py-1 w-24 select-none"
        >
          {widths.map((w) => (
            <button
              key={w}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                onChange(w);
                setIsOpen(false);
              }}
              className={`w-full px-2.5 py-1.5 flex items-center space-x-2 hover:bg-[#2a2e39] cursor-pointer transition-colors ${
                safeWidth === w ? 'bg-[#2962ff]/20 text-[#2962ff]' : 'text-[#d1d4dc]'
              }`}
            >
              <div
                className="w-5 rounded-full"
                style={{
                  height: `${w}px`,
                  backgroundColor: safeWidth === w ? '#2962ff' : color,
                }}
              />
              <span className="text-[11px] font-mono">{w}px</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
