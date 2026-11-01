import React, { useState, useRef, useEffect } from 'react';

interface LineStylePopoverProps {
  value: 'solid' | 'dashed' | 'dotted';
  onChange: (style: 'solid' | 'dashed' | 'dotted') => void;
  className?: string;
  color?: string;
}

export const LineStylePopover: React.FC<LineStylePopoverProps> = ({
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

  const renderStyleLine = (style: 'solid' | 'dashed' | 'dotted') => {
    if (style === 'dashed') {
      return (
        <div
          className="w-5"
          style={{
            borderTopWidth: '1.5px',
            borderTopStyle: 'dashed',
            borderTopColor: color,
          }}
        />
      );
    }
    if (style === 'dotted') {
      return (
        <div
          className="w-5"
          style={{
            borderTopWidth: '2px',
            borderTopStyle: 'dotted',
            borderTopColor: color,
          }}
        />
      );
    }
    return (
      <div
        className="w-5 rounded-full"
        style={{
          height: '1.5px',
          backgroundColor: color,
        }}
      />
    );
  };

  const styles: { id: 'solid' | 'dashed' | 'dotted'; label: string }[] = [
    { id: 'solid', label: 'Solid' },
    { id: 'dashed', label: 'Dashed' },
    { id: 'dotted', label: 'Dotted' },
  ];

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="h-7 px-2 rounded-[3px] hover:bg-[#2a2e39] flex items-center justify-center cursor-pointer text-[#d1d4dc] hover:text-white transition-colors"
        title="Line Style"
      >
        {renderStyleLine(value || 'solid')}
      </button>

      {isOpen && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="dropdown-menu absolute z-50 mt-1 left-0 bg-[#1e222d] border border-[#2a2e39] rounded shadow-xl py-1 w-28 select-none"
        >
          {styles.map((s) => (
            <button
              key={s.id}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                onChange(s.id);
                setIsOpen(false);
              }}
              className={`w-full px-2.5 py-1.5 flex items-center justify-between hover:bg-[#2a2e39] cursor-pointer transition-colors ${
                value === s.id ? 'bg-[#2962ff]/20 text-[#2962ff]' : 'text-[#d1d4dc]'
              }`}
            >
              {renderStyleLine(s.id)}
              <span className="text-[11px] font-sans">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
