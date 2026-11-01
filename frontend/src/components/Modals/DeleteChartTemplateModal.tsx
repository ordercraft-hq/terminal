import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, AlertTriangle } from 'lucide-react';
import type { ChartTemplate } from '../../templates/ChartTemplateManager';

interface DeleteChartTemplateModalProps {
  isOpen: boolean;
  template: ChartTemplate | null;
  templatesList?: ChartTemplate[];
  onClose: () => void;
  onDelete: (templateId: string) => void;
}

export const DeleteChartTemplateModal: React.FC<DeleteChartTemplateModalProps> = ({
  isOpen,
  template,
  templatesList = [],
  onClose,
  onDelete,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Enter' && template) {
        e.stopPropagation();
        onDelete(template.id);
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, template, onClose, onDelete]);

  if (!isOpen) return null;

  const isSingleConfirmation = template !== null;
  const customTemplates = templatesList;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-[360px] max-w-full bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl overflow-hidden text-[#d1d4dc] text-sm animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2e39] bg-[#1e222d]">
          <div className="flex items-center space-x-2 text-white font-medium">
            <Trash2 size={16} className="text-[#f23645]" />
            <span>{isSingleConfirmation ? 'Delete Template' : 'Delete Templates'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39] transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Modal Body */}
        {isSingleConfirmation ? (
          <div className="p-4 space-y-3">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded bg-[#f23645]/10 text-[#f23645] shrink-0 mt-0.5">
                <AlertTriangle size={18} />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-[#d1d4dc]">
                  Are you sure you want to delete template{' '}
                  <span className="font-semibold text-white">"{template.name}"</span>?
                </p>
                <p className="text-[11px] text-[#787b86]">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#2a2e39]">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded border border-[#363a45] hover:border-[#787b86] hover:bg-[#2a2e39] text-xs text-[#d1d4dc] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(template.id);
                  onClose();
                }}
                className="px-3.5 py-1.5 rounded bg-[#f23645] hover:bg-[#e0283b] text-white text-xs font-medium shadow transition-colors cursor-pointer flex items-center space-x-1.5"
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <p className="text-xs text-[#787b86]">
              Choose a custom template to delete:
            </p>

            <div className="max-h-56 overflow-y-auto space-y-1 pr-1 border border-[#2a2e39] rounded bg-[#131722] p-1.5">
              {customTemplates.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#787b86]">
                  No custom templates found.
                </div>
              ) : (
                customTemplates.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-[#2a2e39] transition-colors text-xs"
                  >
                    <span className="text-[#d1d4dc] truncate pr-2 font-medium">
                      {tmpl.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDelete(tmpl.id)}
                      className="px-2 py-1 rounded bg-[#f23645]/15 hover:bg-[#f23645] text-[#f23645] hover:text-white transition-colors cursor-pointer flex items-center space-x-1 shrink-0 text-[11px]"
                      title={`Delete ${tmpl.name}`}
                    >
                      <Trash2 size={11} />
                      <span>Delete</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded border border-[#363a45] hover:border-[#787b86] hover:bg-[#2a2e39] text-xs text-[#d1d4dc] transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
