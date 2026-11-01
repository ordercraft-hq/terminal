import React, { useState, useRef, useEffect } from 'react';
import {
  GripVertical,
  Pencil,
  PaintBucket,
  Type,
  Settings,
  Hexagon,
  Clock,
  Lock,
  Unlock,
  Trash2,
  MoreHorizontal,
  LayoutGrid,
  Copy,
  EyeOff,
} from 'lucide-react';
import type { UserDrawing, TrendlineOptions } from '../types';
import type { PositionOptions } from '../tools/PositionTool';
import { ColorPickerPopover } from '../../components/Common/ColorPickerPopover';
import { LineWidthPopover } from './common/LineWidthPopover';
import { LineStylePopover } from './common/LineStylePopover';
import { drawingTemplateManager } from '../templates/DrawingTemplateManager';
import { SaveTemplateModal } from './SaveTemplateModal';

type QuickToolbarOptions = Omit<TrendlineOptions, 'stats'> &
  Omit<PositionOptions, 'stats'> & {
    stats?: string;
    showBackground?: boolean;
    backgroundColor?: string;
  };

interface DrawingQuickToolbarProps {
  drawing: UserDrawing;
  onUpdate: (updates: Partial<UserDrawing>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onOpenSettings: () => void;
  initialCoords?: { x: number; y: number };
  containerBounds?: { width: number; height: number };
}

export const DrawingQuickToolbar: React.FC<DrawingQuickToolbarProps> = ({
  drawing,
  onUpdate,
  onDelete,
  onDuplicate,
  onOpenSettings,
  initialCoords,
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Helper to compute clamped coordinates inside parent container
  const getClampedPos = (x: number, y: number) => {
    const parent = toolbarRef.current?.parentElement;
    const containerW = parent ? parent.clientWidth : (typeof window !== 'undefined' ? window.innerWidth : 1200);
    const containerH = parent ? parent.clientHeight : (typeof window !== 'undefined' ? window.innerHeight : 800);
    const barW = toolbarRef.current?.offsetWidth || 220;
    const barH = toolbarRef.current?.offsetHeight || 36;
    const minX = 8;
    const minY = 8;
    const maxX = Math.max(minX, containerW - barW - 8);
    const maxY = Math.max(minY, containerH - barH - 8);
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  };

  // Position state (draggable)
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (initialCoords) {
      return {
        x: Math.max(8, initialCoords.x - 160),
        y: Math.max(8, initialCoords.y - 56),
      };
    }
    return { x: 200, y: 40 };
  });

  // Position only re-centers when a DIFFERENT drawing is selected, not when the current line moves
  const lastSelectedIdRef = useRef<string>(drawing.id);
  useEffect(() => {
    if (drawing.id !== lastSelectedIdRef.current) {
      lastSelectedIdRef.current = drawing.id;
      if (initialCoords) {
        const nextPos = getClampedPos(initialCoords.x - 160, initialCoords.y - 56);
        setPos(nextPos);
        currentPosRef.current = nextPos;
      }
    }
  }, [drawing.id, initialCoords]);

  // Ensure toolbar stays within boundaries after layout or resize
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

    const timer = setTimeout(clampPos, 20);
    window.addEventListener('resize', clampPos);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', clampPos);
    };
  }, [drawing.id]);

  // Dragging toolbar logic (direct DOM transform for smooth 144fps without hitting artificial boundaries)
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentPosRef = useRef<{ x: number; y: number }>(pos);

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
      if (toolbarRef.current) {
        toolbarRef.current.style.left = `${clamped.x}px`;
        toolbarRef.current.style.top = `${clamped.y}px`;
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      try {
        (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
      } catch {}
      isDraggingRef.current = false;
      setIsDragging(false);
      setPos({ ...currentPosRef.current });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [isDragging]);

  // Dropdown menus states
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showTextPopover, setShowTextPopover] = useState(false);
  const [quickTextValue, setQuickTextValue] = useState(drawing.text || '');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [templates, setTemplates] = useState(() => drawingTemplateManager.getTemplatesForTool(drawing.type));

  useEffect(() => {
    setTemplates(drawingTemplateManager.getTemplatesForTool(drawing.type));
    const unsubscribe = drawingTemplateManager.subscribe(() => {
      setTemplates(drawingTemplateManager.getTemplatesForTool(drawing.type));
    });
    return unsubscribe;
  }, [drawing.type]);

  const moreMenuRef = useRef<HTMLDivElement>(null);
  const templateMenuRef = useRef<HTMLDivElement>(null);
  const textPopoverRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setShowMoreMenu(false);
      }
      if (templateMenuRef.current && !templateMenuRef.current.contains(target)) {
        setShowTemplateMenu(false);
      }
      if (textPopoverRef.current && !textPopoverRef.current.contains(target)) {
        setShowTextPopover(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const color = drawing.color || '#2962ff';
  const lineWidth = drawing.lineWidth || 1;
  const lineStyle = drawing.lineStyle || 'solid';
  const opts = (drawing.options as QuickToolbarOptions) || {};
  const textColor = opts.textColor || color;
  const isPosition = drawing.type === 'long_position' || drawing.type === 'short_position';

  return (
    <div
      ref={toolbarRef}
      style={{
        left: `${isDragging ? currentPosRef.current.x : pos.x}px`,
        top: `${isDragging ? currentPosRef.current.y : pos.y}px`,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        const target = e.target as HTMLElement;
        if (
          target.closest('button') ||
          target.closest('input') ||
          target.closest('select') ||
          target.closest('textarea') ||
          target.closest('[role="button"]') ||
          target.closest('.dropdown-menu')
        ) {
          return;
        }
        handleDragStart(e);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="floating-drawing-toolbar absolute z-40 pointer-events-auto flex items-center h-9 px-1.5 rounded-lg bg-[#1e222d] border border-[#2a2e39] shadow-2xl text-[#d1d4dc] backdrop-blur-md select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* 1. Drag Handle (6 dots) */}
      <div
        onPointerDown={handleDragStart}
        className="px-1 py-1 cursor-grab active:cursor-grabbing text-[#787b86] hover:text-[#d1d4dc] transition-colors flex items-center justify-center shrink-0"
        title="Drag toolbar"
      >
        <GripVertical size={14} />
      </div>

      <div className="w-[1px] h-4 bg-[#2a2e39] mx-1" />

      {/* 2. Template / Presets Button */}
      <div ref={templateMenuRef} className="relative">
        <button
          type="button"
          onClick={() => setShowTemplateMenu(!showTemplateMenu)}
          className={`p-1.5 rounded transition-colors cursor-pointer shrink-0 ${
            showTemplateMenu ? 'bg-[#2a2e39] text-[#d1d4dc]' : 'hover:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc]'
          }`}
          title="Drawing Templates"
        >
          <LayoutGrid size={15} />
        </button>

        {showTemplateMenu && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="dropdown-menu absolute z-50 left-0 mt-1 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl py-1 w-52 text-xs select-none"
          >
            <button
              type="button"
              onClick={() => {
                setShowTemplateMenu(false);
                setIsSaveModalOpen(true);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#2a2e39] text-[#d1d4dc] transition-colors cursor-pointer"
            >
              Save Drawing Template As...
            </button>
            <button
              type="button"
              onClick={() => {
                const resetDrawing = drawingTemplateManager.resetToDefaults(drawing);
                onUpdate({
                  color: resetDrawing.color,
                  lineWidth: resetDrawing.lineWidth,
                  lineStyle: resetDrawing.lineStyle,
                  text: resetDrawing.text,
                  options: resetDrawing.options,
                });
                setShowTemplateMenu(false);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#2a2e39] text-[#d1d4dc] transition-colors cursor-pointer"
            >
              Apply Default Drawing Template
            </button>

            {templates.length > 0 && <div className="h-[1px] bg-[#2a2e39] my-1" />}

            {templates.length > 0 && (
              <div className="max-h-52 overflow-y-auto">
                <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#787b86]">
                  Saved Templates
                </div>
                {templates.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    role="button"
                    tabIndex={0}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      const updated = drawingTemplateManager.applyTemplate(drawing, tmpl);
                      onUpdate({
                        color: updated.color,
                        lineWidth: updated.lineWidth,
                        lineStyle: updated.lineStyle,
                        text: updated.text,
                        options: updated.options,
                      });
                      setShowTemplateMenu(false);
                    }}
                    className="group flex items-center justify-between px-3 py-1.5 hover:bg-[#2a2e39] text-[#d1d4dc] transition-colors cursor-pointer"
                  >
                    <span className="truncate pr-2">{tmpl.name}</span>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        drawingTemplateManager.deleteTemplate(tmpl.id);
                      }}
                      className="p-1 rounded text-[#787b86] hover:text-[#f23645] hover:bg-[#363a45] transition-colors cursor-pointer"
                      title={`Delete ${tmpl.name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="w-[1px] h-4 bg-[#2a2e39] mx-1" />

      {isPosition ? (
        <>
          {/* 3. Text Color / Styling (T with text color underline) */}
          <ColorPickerPopover
            color={opts.textColor || '#ffffff'}
            onChange={(newColor) =>
              onUpdate({
                options: {
                  ...opts,
                  textColor: newColor,
                },
              })
            }
            title="Text Color"
            customTrigger={({ isOpen }) => (
              <div
                className={`p-1.5 rounded flex flex-col items-center justify-center transition-colors cursor-pointer ${
                  isOpen ? 'bg-[#2a2e39]' : 'hover:bg-[#2a2e39]'
                }`}
                title="Text Color"
              >
                <Type size={15} className="text-[#d1d4dc]" />
                <div
                  className="w-4 h-[3px] rounded-full mt-0.5"
                  style={{ backgroundColor: opts.textColor || '#ffffff' }}
                />
              </div>
            )}
          />

          {/* 4. Target Color (PaintBucket with target color underline) */}
          <ColorPickerPopover
            color={opts.targetColor || 'rgba(8, 153, 129, 0.2)'}
            onChange={(newColor) =>
              onUpdate({
                options: {
                  ...opts,
                  targetColor: newColor,
                },
              })
            }
            title="Target Color"
            customTrigger={({ isOpen }) => (
              <div
                className={`p-1.5 rounded flex flex-col items-center justify-center transition-colors cursor-pointer ${
                  isOpen ? 'bg-[#2a2e39]' : 'hover:bg-[#2a2e39]'
                }`}
                title="Target Color"
              >
                <PaintBucket size={15} className="text-[#d1d4dc]" />
                <div
                  className="w-4 h-[3px] rounded-full mt-0.5"
                  style={{ backgroundColor: opts.targetColor || '#089981' }}
                />
              </div>
            )}
          />

          {/* 5. Stop Color (PaintBucket with stop color underline) */}
          <ColorPickerPopover
            color={opts.stopColor || 'rgba(242, 54, 69, 0.2)'}
            onChange={(newColor) =>
              onUpdate({
                options: {
                  ...opts,
                  stopColor: newColor,
                },
              })
            }
            title="Stop Color"
            customTrigger={({ isOpen }) => (
              <div
                className={`p-1.5 rounded flex flex-col items-center justify-center transition-colors cursor-pointer ${
                  isOpen ? 'bg-[#2a2e39]' : 'hover:bg-[#2a2e39]'
                }`}
                title="Stop Color"
              >
                <PaintBucket size={15} className="text-[#d1d4dc]" />
                <div
                  className="w-4 h-[3px] rounded-full mt-0.5"
                  style={{ backgroundColor: opts.stopColor || '#f23645' }}
                />
              </div>
            )}
          />

          {/* 6. Lines Color (Pencil with line color underline) */}
          <ColorPickerPopover
            color={opts.lineColor || drawing.color || '#2a2e39'}
            onChange={(newColor) =>
              onUpdate({
                color: newColor,
                options: {
                  ...opts,
                  lineColor: newColor,
                },
              })
            }
            title="Lines Color"
            customTrigger={({ isOpen }) => (
              <div
                className={`p-1.5 rounded flex flex-col items-center justify-center transition-colors cursor-pointer ${
                  isOpen ? 'bg-[#2a2e39]' : 'hover:bg-[#2a2e39]'
                }`}
                title="Lines Color"
              >
                <Pencil size={15} className="text-[#d1d4dc]" />
                <div
                  className="w-4 h-[3px] rounded-full mt-0.5"
                  style={{ backgroundColor: opts.lineColor || '#2a2e39' }}
                />
              </div>
            )}
          />

          <div className="w-[1px] h-4 bg-[#2a2e39] mx-1" />

          {/* 7. Settings Hexagon Nut Icon */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-1.5 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc] transition-colors cursor-pointer shrink-0"
            title="Settings (Double-click drawing)"
          >
            <Hexagon size={15} />
          </button>

          {/* 8. Alert Clock Icon */}
          <button
            type="button"
            onClick={() => {}}
            className="p-1.5 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc] transition-colors cursor-pointer shrink-0"
            title="Set Alert on Position"
          >
            <Clock size={15} />
          </button>
        </>
      ) : (drawing.type === 'fixed_range_volume_profile' || drawing.type === 'anchored_volume_profile') ? (
        <>
          {/* Settings Hexagon Nut Icon */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-1.5 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc] transition-colors cursor-pointer shrink-0"
            title="Settings (Double-click drawing)"
          >
            <Hexagon size={15} />
          </button>
        </>
      ) : (
        <>
          {/* 3. Line Color Picker (Pencil with colored underline) */}
          <ColorPickerPopover
            color={color}
            onChange={(newColor) => {
              if (drawing.type === 'rectangle' || drawing.type === 'rotated_rectangle') {
                onUpdate({
                  color: newColor,
                  options: {
                    ...opts,
                    borderColor: newColor,
                  },
                });
              } else {
                onUpdate({ color: newColor });
              }
            }}
            title="Line Color"
            customTrigger={({ isOpen }) => (
              <div
                className={`p-1.5 rounded flex flex-col items-center justify-center transition-colors ${
                  isOpen ? 'bg-[#2a2e39]' : 'hover:bg-[#2a2e39]'
                }`}
              >
                <Pencil size={15} className="text-[#d1d4dc]" />
                <div
                  className="w-4 h-[3px] rounded-full mt-0.5"
                  style={{ backgroundColor: color }}
                />
              </div>
            )}
          />

          {/* 3b. Background Fill Color Picker (PaintBucket with colored underline) */}
          {drawing.type !== 'anchored_vwap' && (drawing.type === 'rectangle' || drawing.type === 'rotated_rectangle' || (drawing.type !== 'path' && opts.showBackground !== undefined)) && (
            <ColorPickerPopover
              color={opts.backgroundColor || (drawing.type === 'rectangle' ? 'rgba(41, 98, 255, 0.2)' : 'rgba(8, 153, 129, 0.2)')}
              onChange={(newBg) =>
                onUpdate({
                  options: {
                    ...opts,
                    backgroundColor: newBg,
                    showBackground: true,
                  },
                })
              }
              title="Background Color"
              customTrigger={({ isOpen }) => (
                <div
                  className={`p-1.5 rounded flex flex-col items-center justify-center transition-colors cursor-pointer ${
                    isOpen ? 'bg-[#2a2e39]' : 'hover:bg-[#2a2e39]'
                  }`}
                  title="Background Color"
                >
                  <PaintBucket size={15} className="text-[#d1d4dc]" />
                  <div
                    className="w-4 h-[3px] rounded-full mt-0.5"
                    style={{
                      backgroundColor:
                        opts.showBackground === false
                          ? 'transparent'
                          : opts.backgroundColor || (drawing.type === 'rectangle' ? 'rgba(41, 98, 255, 0.2)' : 'rgba(8, 153, 129, 0.2)'),
                    }}
                  />
                </div>
              )}
            />
          )}

          {/* 4. Text Annotation ('T' with colored underline + Quick Popover) - not supported on cross_line, fib_retracement, fib_extension, rotated_rectangle, path, or anchored_vwap */}
          {drawing.type !== 'cross_line' && drawing.type !== 'fib_retracement' && drawing.type !== 'fib_extension' && drawing.type !== 'rotated_rectangle' && drawing.type !== 'path' && drawing.type !== 'anchored_vwap' && (
            <>
              <div ref={textPopoverRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setQuickTextValue(drawing.text || opts.text || '');
                    setShowTextPopover(!showTextPopover);
                  }}
                  className={`p-1.5 rounded flex flex-col items-center justify-center transition-colors cursor-pointer ${
                    showTextPopover ? 'bg-[#2a2e39]' : 'hover:bg-[#2a2e39]'
                  }`}
                  title="Text Note"
                >
                  <Type size={15} className="text-[#d1d4dc]" />
                  <div
                    className="w-4 h-[3px] rounded-full mt-0.5"
                    style={{ backgroundColor: textColor }}
                  />
                </button>

                {showTextPopover && (
                  <div
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`dropdown-menu absolute z-50 left-0 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl p-2.5 w-60 text-xs ${
                      pos.y > 400 ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                    }`}
                  >
                    <div className="font-semibold text-[#d1d4dc] mb-1.5">Text Note</div>
                    <textarea
                      rows={2}
                      value={quickTextValue}
                      onChange={(e) => setQuickTextValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          onUpdate({
                            text: quickTextValue,
                            options: {
                              ...opts,
                              text: quickTextValue,
                              showText: quickTextValue.trim().length > 0,
                            },
                          });
                          setShowTextPopover(false);
                        }
                      }}
                      placeholder="Enter drawing label (Enter to apply)..."
                      className="w-full bg-[#131722] border border-[#363a45] rounded p-1.5 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff] resize-none mb-2"
                      autoFocus
                    />
                    <div className="flex justify-end space-x-1.5">
                      <button
                        type="button"
                        onClick={() => setShowTextPopover(false)}
                        className="px-2 py-1 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[#787b86] hover:text-[#d1d4dc] transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onUpdate({
                            text: quickTextValue,
                            options: {
                              ...opts,
                              text: quickTextValue,
                              showText: quickTextValue.trim().length > 0,
                            },
                          });
                          setShowTextPopover(false);
                        }}
                        className="px-2.5 py-1 rounded bg-[#2962ff] hover:bg-[#1e4bd8] text-white font-medium transition-colors cursor-pointer"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="w-[1px] h-4 bg-[#2a2e39] mx-1" />
            </>
          )}

          {/* 5. Line Thickness Selector ('— 1px') */}
          <LineWidthPopover
            value={lineWidth}
            onChange={(w) => {
              if (drawing.type === 'rectangle' || drawing.type === 'rotated_rectangle') {
                onUpdate({
                  lineWidth: w,
                  options: {
                    ...opts,
                    borderWidth: w,
                  },
                });
              } else {
                onUpdate({ lineWidth: w });
              }
            }}
            color={color}
          />

          {/* 6. Line Style Selector ('—') */}
          {drawing.type !== 'anchored_vwap' && (
            <LineStylePopover
              value={lineStyle}
              onChange={(style) => {
                if (drawing.type === 'rectangle' || drawing.type === 'rotated_rectangle') {
                  onUpdate({
                    lineStyle: style,
                    options: {
                      ...opts,
                      borderStyle: style,
                    },
                  });
                } else {
                  onUpdate({ lineStyle: style });
                }
              }}
              color={color}
            />
          )}

          <div className="w-[1px] h-4 bg-[#2a2e39] mx-1" />

          {/* 7. Settings Gear/Nut Icon (Opens Main Modal) */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-1.5 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc] transition-colors cursor-pointer shrink-0"
            title="Settings (Double-click drawing)"
          >
            {drawing.type === 'anchored_vwap' ? <Hexagon size={15} /> : <Settings size={15} />}
          </button>

          {/* 8. Alert Clock Icon */}
          <button
            type="button"
            onClick={() => {
              // Future alert hook / notification
            }}
            className="p-1.5 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc] transition-colors cursor-pointer shrink-0"
            title="Set Alert on Trendline"
          >
            <Clock size={15} />
          </button>
        </>
      )}

      {/* 9. Lock / Unlock Toggle */}
      <button
        type="button"
        onClick={() => onUpdate({ locked: !drawing.locked })}
        className={`p-1.5 rounded transition-colors cursor-pointer shrink-0 ${
          drawing.locked
            ? 'text-[#ff9800] bg-[#ff9800]/10 hover:bg-[#ff9800]/20'
            : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]'
        }`}
        title={drawing.locked ? 'Unlock Drawing' : 'Lock Drawing'}
      >
        {drawing.locked ? <Lock size={15} /> : <Unlock size={15} />}
      </button>

      {/* 10. Trash / Delete Button */}
      <button
        type="button"
        onClick={() => {
          if (!drawing.locked) onDelete();
        }}
        disabled={drawing.locked}
        className={`p-1.5 rounded transition-colors shrink-0 ${
          drawing.locked
            ? 'text-[#787b86]/40 cursor-not-allowed'
            : 'text-[#787b86] hover:text-[#f23645] hover:bg-[#f23645]/20 cursor-pointer'
        }`}
        title={drawing.locked ? 'Drawing is locked' : 'Delete Drawing (Del / Backspace)'}
      >
        <Trash2 size={15} />
      </button>

      {/* 11. More Options (...) */}
      <div ref={moreMenuRef} className="relative">
        <button
          type="button"
          onClick={() => setShowMoreMenu(!showMoreMenu)}
          className="p-1.5 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc] transition-colors cursor-pointer shrink-0"
          title="More Actions"
        >
          <MoreHorizontal size={15} />
        </button>

        {showMoreMenu && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="dropdown-menu absolute z-50 right-0 mt-1 bg-[#1e222d] border border-[#2a2e39] rounded shadow-2xl py-1 w-44 text-xs select-none"
          >
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                onDuplicate();
                setShowMoreMenu(false);
              }}
              className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-[#2a2e39] text-[#d1d4dc] transition-colors cursor-pointer"
            >
              <Copy size={13} />
              <span>Clone / Duplicate</span>
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                onUpdate({ hidden: true });
                setShowMoreMenu(false);
              }}
              className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-[#2a2e39] text-[#d1d4dc] transition-colors cursor-pointer"
            >
              <EyeOff size={13} />
              <span>Hide Drawing</span>
            </button>
            <div className="h-[1px] bg-[#2a2e39] my-1" />
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                onOpenSettings();
                setShowMoreMenu(false);
              }}
              className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-[#2a2e39] text-[#d1d4dc] transition-colors cursor-pointer"
            >
              <Settings size={13} />
              <span>Settings...</span>
            </button>
          </div>
        )}
      </div>

      {isSaveModalOpen && (
        <SaveTemplateModal
          isOpen={isSaveModalOpen}
          toolType={drawing.type}
          onClose={() => setIsSaveModalOpen(false)}
          onSave={(name) => {
            drawingTemplateManager.saveTemplate(drawing.type, name, drawing);
          }}
        />
      )}
    </div>
  );
};
