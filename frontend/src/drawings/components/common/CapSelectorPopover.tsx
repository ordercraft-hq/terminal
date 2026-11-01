import React, { useState, useRef, useEffect } from 'react';
import type { LineEndCap } from '../../types';

interface CapSelectorPopoverProps {
  value: LineEndCap;
  onChange: (cap: LineEndCap) => void;
  direction: 'left' | 'right';
  className?: string;
}

export const CapSelectorPopover: React.FC<CapSelectorPopoverProps> = ({
  value,
  onChange,
  direction,
  className = '',
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

  const renderCapPreview = (cap: LineEndCap) => {
    return (
      <svg width="24" height="14" viewBox="0 0 24 14" className="overflow-visible">
        {/* Base line */}
        <line x1="2" y1="7" x2="22" y2="7" stroke="#d1d4dc" strokeWidth="1.5" />
        {/* Left Cap */}
        {direction === 'left' && cap === 'arrow' && (
          <polygon points="8,3 2,7 8,11" fill="#d1d4dc" />
        )}
        {direction === 'left' && cap === 'circle' && (
          <circle cx="4" cy="7" r="3" fill="#d1d4dc" />
        )}
        {/* Right Cap */}
        {direction === 'right' && cap === 'arrow' && (
          <polygon points="16,3 22,7 16,11" fill="#d1d4dc" />
        )}
        {direction === 'right' && cap === 'circle' && (
          <circle cx="20" cy="7" r="3" fill="#d1d4dc" />
        )}
      </svg>
    );
  };

  const options: { cap: LineEndCap; label: string }[] = [
    { cap: 'normal', label: 'Normal' },
    { cap: 'arrow', label: 'Arrow' },
    { cap: 'circle', label: 'Circle' },
  ];

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="h-7 px-2 rounded-[3px] border border-[#363a45] hover:border-[#787b86] bg-[#1e222d] hover:bg-[#2a2e39] flex items-center justify-center cursor-pointer transition-colors"
        title={`${direction === 'left' ? 'Left' : 'Right'} Cap`}
      >
        {renderCapPreview(value)}
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 left-0 bg-[#1e222d] border border-[#2a2e39] rounded shadow-xl py-1 w-24">
          {options.map((opt) => (
            <button
              key={opt.cap}
              type="button"
              onClick={() => {
                onChange(opt.cap);
                setIsOpen(false);
              }}
              className={`w-full px-2 py-1.5 flex items-center justify-between hover:bg-[#2a2e39] cursor-pointer transition-colors ${
                value === opt.cap ? 'bg-[#2962ff]/20 text-[#2962ff]' : 'text-[#d1d4dc]'
              }`}
            >
              <div className="flex items-center space-x-1.5">
                {renderCapPreview(opt.cap)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
