import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Pencil, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import type { UserDrawing } from '../types';
import { drawingRegistry } from '../registry';
import { drawingTemplateManager, type DrawingTemplate } from '../templates/DrawingTemplateManager';
import { SaveTemplateModal } from './SaveTemplateModal';
import { DeleteDrawingTemplateModal } from './DeleteDrawingTemplateModal';
import { TrendlineStyleTab } from './tabs/TrendlineStyleTab';
import { ParallelChannelStyleTab } from './tabs/ParallelChannelStyleTab';
import { FibRetracementStyleTab } from './tabs/FibRetracementStyleTab';
import { FibExtensionStyleTab } from './tabs/FibExtensionStyleTab';
import { RectangleStyleTab } from './tabs/RectangleStyleTab';
import { RotatedRectangleStyleTab } from './tabs/RotatedRectangleStyleTab';
import { PathStyleTab } from './tabs/PathStyleTab';
import { PositionInputsTab } from './tabs/PositionInputsTab';
import { PositionStyleTab } from './tabs/PositionStyleTab';
import { AnchoredVWAPInputsTab } from './tabs/AnchoredVWAPInputsTab';
import { AnchoredVWAPStyleTab } from './tabs/AnchoredVWAPStyleTab';
import { FRVPInputsTab } from './tabs/FRVPInputsTab';
import { FRVPStyleTab } from './tabs/FRVPStyleTab';
import { AVPInputsTab } from './tabs/AVPInputsTab';
import { AVPStyleTab } from './tabs/AVPStyleTab';
import { DrawingTextTab } from './tabs/DrawingTextTab';
import { DrawingCoordsTab } from './tabs/DrawingCoordsTab';
import { DrawingVisibilityTab } from './tabs/DrawingVisibilityTab';

interface DrawingSettingsModalProps {
  drawing: UserDrawing;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: UserDrawing, commitToDb?: boolean) => void;
  priceDecimals?: number;
}

type TabType = 'inputs' | 'style' | 'text' | 'coordinates' | 'visibility';

export const DrawingSettingsModal: React.FC<DrawingSettingsModalProps> = ({
  drawing,
  isOpen,
  onClose,
  onSave,
  priceDecimals = 2,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('style');
  const [draft, setDraft] = useState<UserDrawing>(drawing);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<DrawingTemplate | null>(null);
  const [templates, setTemplates] = useState(() => drawingTemplateManager.getTemplatesForTool(drawing.type));
  const templateMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTemplates(drawingTemplateManager.getTemplatesForTool(draft.type));
    const unsubscribe = drawingTemplateManager.subscribe(() => {
      setTemplates(drawingTemplateManager.getTemplatesForTool(draft.type));
    });
    return unsubscribe;
  }, [draft.type]);

  useEffect(() => {
    if (!showTemplateMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(e.target as Node)) {
        setShowTemplateMenu(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [showTemplateMenu]);

  // Snapshot original drawing when modal opens to allow instant revert on Cancel
  const originalSnapshotRef = useRef<UserDrawing>(JSON.parse(JSON.stringify(drawing)));

  // Sync draft when incoming drawing changes or modal opens
  useEffect(() => {
    if (isOpen) {
      const snap = JSON.parse(JSON.stringify(drawing));
      originalSnapshotRef.current = snap;
      setDraft(snap);
      const initialTab: TabType =
        drawing.type === 'fixed_range_volume_profile' ||
        drawing.type === 'anchored_volume_profile' ||
        drawing.type === 'anchored_vwap' ||
        drawing.type === 'long_position' ||
        drawing.type === 'short_position'
          ? 'inputs'
          : 'style';
      setActiveTab(initialTab);
    }
  }, [isOpen, drawing.id]);

  const getClampedPos = (x: number, y: number) => {
    const modalW = modalRef.current?.offsetWidth || 370;
    const modalH = modalRef.current?.offsetHeight || 500;
    const winW = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const minX = 8;
    const minY = 8;
    const maxX = Math.max(minX, winW - modalW - 8);
    const maxY = Math.max(minY, winH - modalH - 8);
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  };

  const getInitialCenterPos = () => {
    const w = 370;
    const h = 500;
    const winW = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const left = Math.max(8, Math.min(winW - w - 8, Math.round((winW - w) / 2)));
    const top = Math.max(8, Math.min(winH - h - 8, Math.round((winH - h) / 2)));
    return { x: left, y: top };
  };

  // Modal dragging logic (direct DOM transform for smooth 144fps without hitting artificial boundaries)
  const [pos, setPos] = useState<{ x: number; y: number }>(getInitialCenterPos);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const currentPosRef = useRef<{ x: number; y: number }>(getInitialCenterPos());
  const modalRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // Re-center only when modal newly opens
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const center = getInitialCenterPos();
      setPos(center);
      currentPosRef.current = center;
      if (modalRef.current) {
        modalRef.current.style.left = `${center.x}px`;
        modalRef.current.style.top = `${center.y}px`;
      }
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  // Keep within boundaries on resize
  useEffect(() => {
    if (!isOpen) return;
    const clampPos = () => {
      setPos((prev) => {
        const clamped = getClampedPos(prev.x, prev.y);
        if (clamped.x !== prev.x || clamped.y !== prev.y) {
          currentPosRef.current = clamped;
          if (modalRef.current) {
            modalRef.current.style.left = `${clamped.x}px`;
            modalRef.current.style.top = `${clamped.y}px`;
          }
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
  }, [isOpen]);

  const handleDragStart = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('input')
    ) {
      return;
    }
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

  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isDragging) return;
    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - dragStartMouseRef.current.x;
      const dy = e.clientY - dragStartMouseRef.current.y;
      const clamped = getClampedPos(dragStartPosRef.current.x + dx, dragStartPosRef.current.y + dy);
      currentPosRef.current = clamped;
      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          if (modalRef.current) {
            modalRef.current.style.left = `${currentPosRef.current.x}px`;
            modalRef.current.style.top = `${currentPosRef.current.y}px`;
          }
        });
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      try {
        if (headerRef.current && headerRef.current.hasPointerCapture(e.pointerId)) {
          headerRef.current.releasePointerCapture(e.pointerId);
        }
        (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
      } catch {}
      isDraggingRef.current = false;
      setIsDragging(false);
      setPos({ ...currentPosRef.current });
      if (modalRef.current) {
        modalRef.current.style.left = `${currentPosRef.current.x}px`;
        modalRef.current.style.top = `${currentPosRef.current.y}px`;
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isDragging]);

  const handleCancel = () => {
    // Revert chart directly to the original snapshot
    onSave(originalSnapshotRef.current, false);
    onClose();
  };

  // Escape listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDraftChange = (updates: Partial<UserDrawing>) => {
    const next: UserDrawing = {
      ...draft,
      ...updates,
      options: {
        ...(draft.options || {}),
        ...(updates.options || {}),
      },
    };
    setDraft(next);
    // Live update drawing directly on chart without waiting for OK button
    onSave(next, false);
  };

  const handleApplyDefaults = () => {
    const reset = drawingTemplateManager.resetToDefaults(draft);
    handleDraftChange(reset);
    setShowTemplateMenu(false);
  };

  const handleOk = () => {
    // Commit saved changes to database
    onSave(draft, true);
    onClose();
  };

  const displayTitle =
    customTitle ||
    (draft.type === 'anchored_volume_profile'
      ? 'AVP'
      : draft.type === 'anchored_vwap'
      ? 'Anchored VWAP'
      : draft.type === 'long_position'
      ? 'Long position'
      : draft.type === 'short_position'
      ? 'Short position'
      : draft.type === 'horizontal_line'
      ? 'Horizontal line'
      : draft.type === 'horizontal_ray'
      ? 'Horizontal ray'
      : draft.type === 'vertical_line'
      ? 'Vertical line'
      : draft.type === 'cross_line'
      ? 'Crossline'
      : draft.type === 'parallel_channel'
      ? 'Parallel channel'
      : draft.type === 'fixed_range_volume_profile'
      ? 'FRVP'
      : draft.type === 'fib_retracement'
      ? 'Fib retracement'
      : draft.type === 'rotated_rectangle'
      ? 'Rotated rectangle'
      : draft.type === 'path'
      ? 'Path'
      : draft.type === 'rectangle'
      ? 'Rectangle'
      : drawingRegistry.has(draft.type)
      ? drawingRegistry.get(draft.type)!.name
      : draft.type.replace(/_/g, ' '));

  const availableTabs: TabType[] =
    draft.type === 'fixed_range_volume_profile' || draft.type === 'anchored_volume_profile'
      ? ['inputs', 'style', 'coordinates', 'visibility']
      : draft.type === 'long_position' || draft.type === 'short_position' || draft.type === 'anchored_vwap'
      ? ['inputs', 'style', 'visibility']
      : draft.type === 'rotated_rectangle' || draft.type === 'path'
      ? ['style', 'visibility']
      : draft.type === 'cross_line' || draft.type === 'fib_retracement' || draft.type === 'fib_extension'
      ? ['style', 'coordinates', 'visibility']
      : ['style', 'text', 'coordinates', 'visibility'];

  return createPortal(
    <div
      ref={modalRef}
      style={{
        left: `${isDragging ? currentPosRef.current.x : pos.x}px`,
        top: `${isDragging ? currentPosRef.current.y : pos.y}px`,
        willChange: isDragging ? 'left, top' : 'auto',
        touchAction: 'none',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      className="fixed z-[9999] w-[370px] bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl flex flex-col overflow-hidden text-[#d1d4dc] select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Header: Title with edit icon + Close button */}
      <div
        ref={headerRef}
        onPointerDown={handleDragStart}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex items-center justify-between px-4 py-3 cursor-move border-b border-[#2a2e39]/80 select-none"
      >
        <div className="flex items-center space-x-2">
          {isEditingTitle ? (
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setIsEditingTitle(false);
              }}
              autoFocus
              className="bg-[#131722] border border-[#2962ff] rounded px-2 py-0.5 text-sm font-semibold text-white outline-none"
            />
          ) : (
            <div className="flex items-center space-x-1.5 group cursor-pointer" onClick={() => setIsEditingTitle(true)}>
              <span className="text-base font-semibold text-[#d1d4dc]">{displayTitle}</span>
              <Pencil size={13} className="text-[#787b86] group-hover:text-[#2962ff] transition-colors" />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleCancel}
          className="p-1 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc] transition-colors cursor-pointer"
          title="Close (Esc)"
        >
          <X size={16} />
        </button>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center px-4 border-b border-[#2a2e39] space-x-5 text-xs font-medium">
        {availableTabs.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`py-2.5 capitalize transition-colors relative cursor-pointer ${
                isActive ? 'text-[#d1d4dc] font-semibold' : 'text-[#787b86] hover:text-[#d1d4dc]'
              }`}
            >
              {tab}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#2962ff] rounded-t-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Body: Active Tab Content */}
      <div className="p-4 max-h-[440px] overflow-y-auto">
        {activeTab === 'inputs' && (
          draft.type === 'anchored_volume_profile' ? (
            <AVPInputsTab
              drawing={draft}
              onChange={handleDraftChange}
            />
          ) : draft.type === 'fixed_range_volume_profile' ? (
            <FRVPInputsTab
              drawing={draft}
              onChange={handleDraftChange}
            />
          ) : draft.type === 'anchored_vwap' ? (
            <AnchoredVWAPInputsTab
              drawing={draft}
              onChange={handleDraftChange}
            />
          ) : (draft.type === 'long_position' || draft.type === 'short_position') ? (
            <PositionInputsTab
              drawing={draft}
              onChange={handleDraftChange}
              priceDecimals={priceDecimals}
            />
          ) : null
        )}
        {activeTab === 'style' && (
          draft.type === 'anchored_volume_profile' ? (
            <AVPStyleTab drawing={draft} onChange={handleDraftChange} />
          ) : draft.type === 'fixed_range_volume_profile' ? (
            <FRVPStyleTab drawing={draft} onChange={handleDraftChange} />
          ) : draft.type === 'anchored_vwap' ? (
            <AnchoredVWAPStyleTab drawing={draft} onChange={handleDraftChange} />
          ) : draft.type === 'long_position' || draft.type === 'short_position' ? (
            <PositionStyleTab drawing={draft} onChange={handleDraftChange} />
          ) : draft.type === 'rotated_rectangle' ? (
            <RotatedRectangleStyleTab drawing={draft} onChange={handleDraftChange} />
          ) : draft.type === 'path' ? (
            <PathStyleTab drawing={draft} onChange={handleDraftChange} />
          ) : draft.type === 'rectangle' ? (
            <RectangleStyleTab drawing={draft} onChange={handleDraftChange} />
          ) : draft.type === 'fib_retracement' ? (
            <FibRetracementStyleTab drawing={draft} onChange={handleDraftChange} />
          ) : draft.type === 'fib_extension' ? (
            <FibExtensionStyleTab drawing={draft} onChange={handleDraftChange} />
          ) : draft.type === 'parallel_channel' ? (
            <ParallelChannelStyleTab drawing={draft} onChange={handleDraftChange} />
          ) : (
            <TrendlineStyleTab drawing={draft} onChange={handleDraftChange} />
          )
        )}
        {activeTab === 'text' && (
          <DrawingTextTab drawing={draft} onChange={handleDraftChange} />
        )}
        {activeTab === 'coordinates' && (
          <DrawingCoordsTab
            drawing={draft}
            onChange={handleDraftChange}
            priceDecimals={priceDecimals}
          />
        )}
        {activeTab === 'visibility' && (
          <DrawingVisibilityTab drawing={draft} onChange={handleDraftChange} />
        )}
      </div>

      {/* Footer: Template dropdown + Cancel / Ok buttons */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-[#2a2e39] bg-[#1a1d26]">
        {/* Template Menu */}
        <div ref={templateMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setShowTemplateMenu(!showTemplateMenu)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded border transition-colors cursor-pointer select-none ${
              showTemplateMenu
                ? 'border-[#2962ff] bg-[#2a2e39] text-white'
                : 'border-[#363a45] hover:border-[#787b86] hover:bg-[#2a2e39] text-[#d1d4dc]'
            }`}
          >
            <span className="text-xs">Template</span>
            {showTemplateMenu ? (
              <ChevronUp size={13} className="text-[#787b86]" />
            ) : (
              <ChevronDown size={13} className="text-[#787b86]" />
            )}
          </button>

          {showTemplateMenu && (
            <div className="absolute bottom-full left-0 mb-1 z-50 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl py-1 w-56 text-xs select-none animate-in fade-in zoom-in-95 duration-100">
              <button
                type="button"
                onClick={() => {
                  setShowTemplateMenu(false);
                  setIsSaveModalOpen(true);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#2a2e39] text-[#d1d4dc] transition-colors cursor-pointer"
              >
                Save as...
              </button>
              <button
                type="button"
                onClick={handleApplyDefaults}
                className="w-full text-left px-3 py-1.5 hover:bg-[#2a2e39] text-[#d1d4dc] transition-colors cursor-pointer"
              >
                Apply defaults
              </button>

              {/* Divider */}
              {templates.length > 0 && <div className="h-[1px] bg-[#2a2e39] my-1" />}

              {templates.length > 0 && (
                <div className="max-h-52 overflow-y-auto">
                  <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#787b86]">
                    Saved Templates
                  </div>
                  {templates.map((tmpl) => (
                    <div
                      key={tmpl.id}
                      onClick={() => {
                        const applied = drawingTemplateManager.applyTemplate(draft, tmpl);
                        handleDraftChange(applied);
                        setShowTemplateMenu(false);
                      }}
                      className="group flex items-center justify-between px-3 py-1.5 hover:bg-[#2a2e39] text-[#d1d4dc] transition-colors cursor-pointer"
                    >
                      <span className="truncate pr-2">{tmpl.name}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowTemplateMenu(false);
                          setTemplateToDelete(tmpl);
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

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleCancel}
            className="px-3.5 py-1.5 rounded border border-[#363a45] hover:border-[#787b86] hover:bg-[#2a2e39] text-xs text-[#d1d4dc] font-medium transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleOk}
            className="px-4 py-1.5 rounded bg-white hover:bg-[#e0e3eb] text-black text-xs font-semibold shadow transition-colors cursor-pointer"
          >
            Ok
          </button>
        </div>
      </div>

      {isSaveModalOpen && (
        <SaveTemplateModal
          isOpen={isSaveModalOpen}
          toolType={draft.type}
          onClose={() => setIsSaveModalOpen(false)}
          onSave={(name) => {
            drawingTemplateManager.saveTemplate(draft.type, name, draft);
          }}
        />
      )}

      {/* Delete Drawing Template Modals */}
      <DeleteDrawingTemplateModal
        isOpen={templateToDelete !== null}
        template={templateToDelete}
        onClose={() => setTemplateToDelete(null)}
        onDelete={(id) => drawingTemplateManager.deleteTemplate(id)}
      />
    </div>,
    document.body
  );
};
