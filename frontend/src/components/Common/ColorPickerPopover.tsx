import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, ArrowLeft } from 'lucide-react';
import {
  parseColor,
  formatColorOutput,
  hsvToRgb,
  rgbToHex,
  PRO_PALETTE_GRID,
} from '../../utils/colorUtils';

interface ColorPickerPopoverProps {
  color: string;
  onChange: (color: string) => void;
  showLine?: boolean;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  lineWidth?: number;
  onLineStyleChange?: (style: 'solid' | 'dashed' | 'dotted') => void;
  onLineWidthChange?: (width: number) => void;
  splitColor?: string;
  title?: string;
  className?: string;
  customTrigger?: (props: { isOpen: boolean; color: string }) => React.ReactNode;
}

export const renderLineVisual = (
  style: 'solid' | 'dashed' | 'dotted',
  width: number = 1,
  lineColor: string = '#787b86'
) => {
  const h = Math.max(1, width);
  const color = lineColor && lineColor !== 'transparent' ? lineColor : '#787b86';
  if (style === 'dashed') {
    return (
      <div
        className="w-5"
        style={{
          borderTopWidth: `${h}px`,
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
          borderTopWidth: `${Math.max(1.5, h)}px`,
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
        height: `${h}px`,
        backgroundColor: color,
      }}
    />
  );
};

export const ColorPickerPopover: React.FC<ColorPickerPopoverProps> = ({
  color,
  onChange,
  showLine = false,
  lineStyle,
  lineWidth,
  onLineStyleChange,
  onLineWidthChange,
  splitColor,
  title,
  className = '',
  customTrigger,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<'palette' | 'custom'>('palette');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Position state for floating popover
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Custom colors list (user-added custom colors only, starts completely empty)
  const [customColors, setCustomColors] = useState<string[]>(() => {
    try {
      localStorage.removeItem('ordercraft_custom_colors'); // Clean legacy test defaults
      const saved = localStorage.getItem('ordercraft_user_custom_colors');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Fallback to empty
    }
    return [];
  });

  // Current parsed color state
  const parsed = useMemo(() => parseColor(color), [color]);
  const [currentHsv, setCurrentHsv] = useState({ h: parsed.h, s: parsed.s, v: parsed.v });
  const [currentAlpha, setCurrentAlpha] = useState(parsed.a);
  const [hexInputText, setHexInputText] = useState(parsed.hex.replace('#', ''));

  // Synchronize internal state whenever incoming color changes
  useEffect(() => {
    setCurrentHsv({ h: parsed.h, s: parsed.s, v: parsed.v });
    setCurrentAlpha(parsed.a);
    setHexInputText(parsed.hex.replace('#', ''));
  }, [parsed]);

  // Compute position relative to trigger button
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 270;
    const popoverHeight = view === 'custom' ? 295 : (showLine ? 415 : 340);

    // Center under trigger button when customTrigger is used, or align right edge for modal swatches
    let left = customTrigger
      ? Math.round(rect.left + rect.width / 2 - popoverWidth / 2)
      : rect.right - popoverWidth;
    let top = rect.bottom + 6;

    // Prevent clipping off right edge
    if (left + popoverWidth > window.innerWidth - 12) {
      left = window.innerWidth - popoverWidth - 12;
    }
    // Prevent clipping off left edge
    if (left < 12) {
      left = 12;
    }
    // If not enough space below, show above
    if (top + popoverHeight > window.innerHeight - 12) {
      top = Math.max(12, rect.top - popoverHeight - 6);
    }

    setCoords({ top, left });
  }, [view, showLine]);

  // Update position on open or view switch
  useEffect(() => {
    if (isOpen) {
      updatePosition();
      const onResize = () => updatePosition();
      window.addEventListener('resize', onResize);
      window.addEventListener('scroll', onResize, true);
      return () => {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('scroll', onResize, true);
      };
    }
  }, [isOpen, updatePosition]);

  // Outside click and Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: Event) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
      setView('palette');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsOpen(false);
        setView('palette');
      }
    };

    window.addEventListener('pointerdown', handleOutsideClick, true);
    window.addEventListener('mousedown', handleOutsideClick, true);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('pointerdown', handleOutsideClick, true);
      window.removeEventListener('mousedown', handleOutsideClick, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen]);

  // Palette swatch selection
  const handleSelectPaletteColor = (hex: string) => {
    const p = parseColor(hex);
    setCurrentHsv({ h: p.h, s: p.s, v: p.v });
    setHexInputText(p.hex.replace('#', ''));
    onChange(formatColorOutput(p.r, p.g, p.b, currentAlpha));
  };

  // Opacity change
  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newA = Math.max(0, Math.min(100, parseInt(e.target.value, 10))) / 100;
    setCurrentAlpha(newA);
    const rgb = hsvToRgb(currentHsv.h, currentHsv.s, currentHsv.v);
    onChange(formatColorOutput(rgb.r, rgb.g, rgb.b, newA));
  };

  // SV Picker dragging
  const svRef = useRef<HTMLDivElement>(null);
  const handleSvPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const svEl = svRef.current;
    if (!svEl) return;

    const updateSv = (clientX: number, clientY: number) => {
      const rect = svEl.getBoundingClientRect();
      const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));

      setCurrentHsv((prev) => {
        const next = { ...prev, s, v };
        const rgb = hsvToRgb(next.h, next.s, next.v);
        setHexInputText(rgbToHex(rgb.r, rgb.g, rgb.b).replace('#', ''));
        onChange(formatColorOutput(rgb.r, rgb.g, rgb.b, currentAlpha));
        return next;
      });
    };

    updateSv(e.clientX, e.clientY);

    const onPointerMove = (ev: PointerEvent) => {
      updateSv(ev.clientX, ev.clientY);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Hue Slider dragging
  const hueRef = useRef<HTMLDivElement>(null);
  const handleHuePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const hueEl = hueRef.current;
    if (!hueEl) return;

    const updateHue = (clientY: number) => {
      const rect = hueEl.getBoundingClientRect();
      const h = Math.max(0, Math.min(360, ((clientY - rect.top) / rect.height) * 360));

      setCurrentHsv((prev) => {
        const next = { ...prev, h };
        const rgb = hsvToRgb(next.h, next.s, next.v);
        setHexInputText(rgbToHex(rgb.r, rgb.g, rgb.b).replace('#', ''));
        onChange(formatColorOutput(rgb.r, rgb.g, rgb.b, currentAlpha));
        return next;
      });
    };

    updateHue(e.clientY);

    const onPointerMove = (ev: PointerEvent) => {
      updateHue(ev.clientY);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Hex Text Input change
  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/#/g, '').trim().toUpperCase();
    if (val.length > 6) {
      val = val.slice(0, 6);
    }
    setHexInputText(val);

    const clean = val.trim();
    if (/^[0-9A-Fa-f]{3}$/.test(clean) || /^[0-9A-Fa-f]{6}$/.test(clean)) {
      const p = parseColor('#' + clean);
      setCurrentHsv({ h: p.h, s: p.s, v: p.v });
      onChange(formatColorOutput(p.r, p.g, p.b, currentAlpha));
    }
  };

  // Add custom color button
  const handleAddCustomColor = () => {
    const clean = hexInputText.trim();
    let newHex: string;
    if (/^[0-9A-Fa-f]{3}$/.test(clean) || /^[0-9A-Fa-f]{6}$/.test(clean)) {
      newHex = parseColor('#' + clean).hex;
    } else {
      const rgb = hsvToRgb(currentHsv.h, currentHsv.s, currentHsv.v);
      newHex = rgbToHex(rgb.r, rgb.g, rgb.b);
    }
    const updated = [newHex, ...customColors.filter((c) => c.toLowerCase() !== newHex.toLowerCase())].slice(0, 10);
    setCustomColors(updated);
    try {
      localStorage.setItem('ordercraft_user_custom_colors', JSON.stringify(updated));
    } catch {
      // Ignore
    }
    setView('palette');
  };

  // Current RGB for Hue slider & preview
  const currentRgb = useMemo(() => hsvToRgb(currentHsv.h, currentHsv.s, currentHsv.v), [currentHsv]);
  const currentHex = useMemo(() => rgbToHex(currentRgb.r, currentRgb.g, currentRgb.b), [currentRgb]);
  const pureHueHex = useMemo(() => {
    const rgb = hsvToRgb(currentHsv.h, 1, 1);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }, [currentHsv.h]);

  return (
    <div className={`inline-flex items-center shrink-0 ${className}`} title={title}>
      {customTrigger ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
            setView('palette');
          }}
          className="cursor-pointer inline-flex items-center justify-center bg-transparent border-0 p-0 focus:outline-none"
        >
          {customTrigger({ isOpen, color })}
        </button>
      ) : (
        /* Trigger Swatch Button (Combined Swatch & Line Visual when showLine is true) */
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            setView('palette');
          }}
          className={`h-6 rounded-[3px] border transition-all flex items-center cursor-pointer select-none shrink-0 shadow-inner focus:outline-none ${
            showLine ? 'px-1.5 space-x-1.5' : 'w-7 px-0 justify-center'
          } ${
            isOpen
              ? 'border-[#2962ff] ring-2 ring-[#2962ff]'
              : 'border-[#363a45] hover:border-[#787b86]'
          }`}
        >
          {/* Color Swatch */}
          <div
            className="w-4 h-4 rounded-[2px] border border-[#434651]/50 relative overflow-hidden shrink-0 shadow-inner"
            style={{
              background: splitColor
                ? `linear-gradient(135deg, ${color} 50%, ${splitColor} 50%)`
                : color,
            }}
          >
            {parsed.a < 1 && (
              <div
                className="absolute inset-0 -z-10 pointer-events-none"
                style={{
                  backgroundImage:
                    'repeating-conic-gradient(#2a2e39 0% 25%, #131722 0% 50%)',
                  backgroundSize: '4px 4px',
                }}
              />
            )}
          </div>

          {/* Line visual if showLine is enabled */}
          {showLine && (
            <div className="w-5 flex items-center justify-center">
              {renderLineVisual(lineStyle || 'dashed', lineWidth || 1, color)}
            </div>
          )}
        </button>
      )}

      {/* Floating Popover Portal */}
      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
            className="fixed z-[10005] bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl p-3 w-[272px] text-[#d1d4dc] select-none animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {view === 'palette' ? (
              /* VIEW 1: PRESET PALETTE & OPACITY (Image 2) */
              <div>
                {/* 10x8 Preset Palette Matrix */}
                <div className="grid grid-cols-10 gap-1 mb-2.5">
                  {PRO_PALETTE_GRID.map((row, rIdx) =>
                    row.map((hex, cIdx) => {
                      const isSelected =
                        parsed.hex.toLowerCase() === hex.toLowerCase();
                      return (
                        <div
                          key={`palette-${rIdx}-${cIdx}`}
                          onClick={() => handleSelectPaletteColor(hex)}
                          className={`w-5 h-5 rounded-[2px] cursor-pointer transition-transform hover:scale-115 relative flex items-center justify-center ${
                            isSelected
                              ? 'ring-2 ring-[#2962ff] ring-offset-1 ring-offset-[#1e222d] z-10'
                              : 'hover:ring-1 hover:ring-white/40'
                          }`}
                          style={{ backgroundColor: hex }}
                          title={hex.toUpperCase()}
                        />
                      );
                    })
                  )}
                </div>

                {/* Divider Line */}
                <div className="h-[1px] bg-[#2a2e39] my-2.5" />

                {/* Custom Colors Row + '+' button */}
                <div className="flex items-center space-x-1.5 mb-3 overflow-hidden">
                  {customColors.map((hex, idx) => {
                    const isSelected =
                      parsed.hex.toLowerCase() === hex.toLowerCase();
                    return (
                      <div
                        key={`custom-${idx}`}
                        onClick={() => handleSelectPaletteColor(hex)}
                        className={`w-5 h-5 rounded-[2px] cursor-pointer transition-transform hover:scale-115 shrink-0 ${
                          isSelected
                            ? 'ring-2 ring-[#2962ff] ring-offset-1 ring-offset-[#1e222d] z-10'
                            : 'hover:ring-1 hover:ring-white/40'
                        }`}
                        style={{ backgroundColor: hex }}
                        title={hex.toUpperCase()}
                      />
                    );
                  })}

                  {/* '+' Add Custom Color button */}
                  <button
                    type="button"
                    onClick={() => setView('custom')}
                    className="w-5 h-5 rounded-[2px] border border-[#363a45] hover:border-[#787b86] hover:bg-[#2a2e39] flex items-center justify-center text-[#d1d4dc] hover:text-white transition-colors cursor-pointer shrink-0"
                    title="Add custom color"
                  >
                    <Plus size={13} />
                  </button>
                </div>

                {/* Opacity Control */}
                <div className="flex flex-col space-y-1.5">
                  <span className="text-[11px] font-medium text-[#787b86]">
                    Opacity
                  </span>
                  <div className="flex items-center space-x-2.5">
                    {/* Track Container */}
                    <div
                      className="relative flex-1 h-3 rounded-[3px] overflow-hidden border border-[#363a45] flex items-center"
                      style={{
                        backgroundImage: `linear-gradient(to right, transparent, ${currentHex}), repeating-conic-gradient(#2a2e39 0% 25%, #131722 0% 50%)`,
                        backgroundSize: '100% 100%, 6px 6px',
                      }}
                    >
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={Math.round(currentAlpha * 100)}
                        onChange={handleOpacityChange}
                        className="w-full opacity-0 cursor-ew-resize absolute inset-0 z-10"
                      />
                      {/* Custom Slider Thumb Marker */}
                      <div
                        className="absolute w-3.5 h-3.5 rounded-full border-2 border-white bg-[#1e222d] shadow-md pointer-events-none -translate-x-1/2"
                        style={{ left: `${Math.round(currentAlpha * 100)}%` }}
                      />
                    </div>

                    {/* Percentage Display Box */}
                    <div className="px-2 py-0.5 rounded border border-[#363a45] text-[11px] font-mono text-[#d1d4dc] min-w-[42px] text-center bg-[#131722]">
                      {Math.round(currentAlpha * 100)}%
                    </div>
                  </div>
                </div>

                {/* Optional Thickness & Line style controls */}
                {showLine && (
                  <div className="mt-3 pt-2.5 border-t border-[#2a2e39] space-y-2.5">
                    {/* Thickness */}
                    <div>
                      <div className="text-[11px] font-medium text-[#787b86] mb-1">
                        Thickness
                      </div>
                      <div className="grid grid-cols-4 gap-1 bg-[#131722] p-0.5 rounded border border-[#363a45]">
                        {[1, 2, 3, 4].map((w) => {
                          const isSelected = (lineWidth || 1) === w;
                          return (
                            <button
                              key={w}
                              type="button"
                              onClick={() => onLineWidthChange?.(w)}
                              className={`h-6 rounded-[2px] flex items-center justify-center cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-white text-black shadow'
                                  : 'hover:bg-[#2a2e39] text-[#d1d4dc]'
                              }`}
                              title={`${w}px`}
                            >
                              <div
                                className="w-5 rounded-full"
                                style={{
                                  height: `${w}px`,
                                  backgroundColor: isSelected ? '#000000' : '#d1d4dc',
                                }}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Line style */}
                    <div>
                      <div className="text-[11px] font-medium text-[#787b86] mb-1">
                        Line style
                      </div>
                      <div className="grid grid-cols-3 gap-1 bg-[#131722] p-0.5 rounded border border-[#363a45]">
                        {(['solid', 'dashed', 'dotted'] as const).map((style) => {
                          const isSelected = (lineStyle || 'solid') === style;
                          return (
                            <button
                              key={style}
                              type="button"
                              onClick={() => onLineStyleChange?.(style)}
                              className={`h-6 rounded-[2px] flex items-center justify-center cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-white text-black shadow'
                                  : 'hover:bg-[#2a2e39] text-[#d1d4dc]'
                              }`}
                              title={style}
                            >
                              {style === 'solid' && (
                                <div
                                  className="w-5"
                                  style={{
                                    height: '1px',
                                    backgroundColor: isSelected ? '#000000' : '#d1d4dc',
                                  }}
                                />
                              )}
                              {style === 'dashed' && (
                                <div
                                  className="w-5"
                                  style={{
                                    borderTopWidth: '1px',
                                    borderTopStyle: 'dashed',
                                    borderTopColor: isSelected ? '#000000' : '#d1d4dc',
                                  }}
                                />
                              )}
                              {style === 'dotted' && (
                                <div
                                  className="w-5"
                                  style={{
                                    borderTopWidth: '1.5px',
                                    borderTopStyle: 'dotted',
                                    borderTopColor: isSelected ? '#000000' : '#d1d4dc',
                                  }}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* VIEW 2: CUSTOM COLOR & HEX PICKER (Image 3) */
              <div>
                {/* Header: Back arrow, Preview Swatch, Hex Input, Add Button */}
                <div className="flex items-center space-x-2 mb-2.5">
                  <button
                    type="button"
                    onClick={() => setView('palette')}
                    className="p-1 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc] transition-colors cursor-pointer"
                    title="Back to presets"
                  >
                    <ArrowLeft size={14} />
                  </button>

                  {/* Swatch Preview */}
                  <div
                    className="w-6 h-6 rounded-[3px] border border-[#363a45] shrink-0"
                    style={{ backgroundColor: currentHex }}
                  />

                  {/* Hex Text Field with static unselectable '#' prefix */}
                  <div className="flex-1 min-w-0 flex items-center bg-[#131722] border border-[#363a45] rounded px-2 py-0.5 focus-within:border-[#2962ff] focus-within:ring-1 focus-within:ring-[#2962ff]">
                    <span className="text-[#787b86] font-mono text-xs select-none pointer-events-none mr-0.5 shrink-0">
                      #
                    </span>
                    <input
                      type="text"
                      value={hexInputText}
                      onChange={handleHexInputChange}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomColor();
                        }
                      }}
                      className="flex-1 min-w-0 bg-transparent text-xs font-mono text-[#d1d4dc] outline-none select-text selection:bg-[#2962ff] selection:text-white uppercase p-0 border-0"
                      placeholder="FFFFFF"
                      maxLength={6}
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>

                  {/* Add Button */}
                  <button
                    type="button"
                    onClick={handleAddCustomColor}
                    className="bg-white hover:bg-[#e0e3eb] text-black font-semibold text-xs px-2.5 py-1 rounded transition-colors cursor-pointer shrink-0 shadow"
                  >
                    Add
                  </button>
                </div>

                {/* 2D SV Palette + Hue Spectrum Bar */}
                <div className="flex space-x-2 h-40 mb-3">
                  {/* Saturation-Value 2D Area */}
                  <div
                    ref={svRef}
                    onPointerDown={handleSvPointerDown}
                    className="relative flex-1 h-full rounded border border-[#363a45] cursor-crosshair overflow-hidden"
                    style={{
                      backgroundColor: pureHueHex,
                      backgroundImage: `
                        linear-gradient(to top, #000, transparent),
                        linear-gradient(to right, #fff, transparent)
                      `,
                    }}
                  >
                    {/* Draggable Circle Thumb */}
                    <div
                      className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-md pointer-events-none -translate-x-1/2 -translate-y-1/2 ring-1 ring-black/30"
                      style={{
                        left: `${Math.round(currentHsv.s * 100)}%`,
                        top: `${Math.round((1 - currentHsv.v) * 100)}%`,
                      }}
                    />
                  </div>

                  {/* Vertical Rainbow Hue Bar */}
                  <div
                    ref={hueRef}
                    onPointerDown={handleHuePointerDown}
                    className="relative w-5 h-full rounded border border-[#363a45] cursor-pointer overflow-hidden"
                    style={{
                      backgroundImage:
                        'linear-gradient(to bottom, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
                    }}
                  >
                    {/* Hue Marker Thumb */}
                    <div
                      className="absolute left-0 right-0 h-2 -translate-y-1/2 border-2 border-white rounded-[2px] shadow-sm pointer-events-none bg-transparent"
                      style={{
                        top: `${Math.round((currentHsv.h / 360) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Opacity Control in Custom Mode */}
                <div className="flex flex-col space-y-1.5">
                  <span className="text-[11px] font-medium text-[#787b86]">
                    Opacity
                  </span>
                  <div className="flex items-center space-x-2.5">
                    <div
                      className="relative flex-1 h-3 rounded-[3px] overflow-hidden border border-[#363a45] flex items-center"
                      style={{
                        backgroundImage: `linear-gradient(to right, transparent, ${currentHex}), repeating-conic-gradient(#2a2e39 0% 25%, #131722 0% 50%)`,
                        backgroundSize: '100% 100%, 6px 6px',
                      }}
                    >
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={Math.round(currentAlpha * 100)}
                        onChange={handleOpacityChange}
                        className="w-full opacity-0 cursor-ew-resize absolute inset-0 z-10"
                      />
                      <div
                        className="absolute w-3.5 h-3.5 rounded-full border-2 border-white bg-[#1e222d] shadow-md pointer-events-none -translate-x-1/2"
                        style={{ left: `${Math.round(currentAlpha * 100)}%` }}
                      />
                    </div>
                    <div className="px-2 py-0.5 rounded border border-[#363a45] text-[11px] font-mono text-[#d1d4dc] min-w-[42px] text-center bg-[#131722]">
                      {Math.round(currentAlpha * 100)}%
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};
