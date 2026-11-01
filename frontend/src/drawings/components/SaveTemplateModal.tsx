import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { drawingTemplateManager } from '../templates/DrawingTemplateManager';

interface SaveTemplateModalProps {
  isOpen: boolean;
  toolType: string;
  defaultName?: string;
  onClose: () => void;
  onSave: (name: string) => void;
}

export const SaveTemplateModal: React.FC<SaveTemplateModalProps> = ({
  isOpen,
  toolType,
  defaultName = '',
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, defaultName]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const existingTemplates = drawingTemplateManager.getTemplatesForTool(toolType);
  const isDuplicate = existingTemplates.some(
    (t) => t.name.toLowerCase() === name.trim().toLowerCase()
  );

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-[340px] bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl overflow-hidden text-[#d1d4dc] text-sm animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2e39]">
          <span className="font-medium text-[#d1d4dc]">Save Drawing Template As...</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39] transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-xs text-[#787b86] mb-1.5">
              Template name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. EQX, Liquidity Grab"
              maxLength={40}
              className="w-full h-8 px-2.5 rounded bg-[#131722] border border-[#2a2e39] focus:border-[#2962ff] focus:outline-none text-xs text-[#d1d4dc] transition-colors placeholder:text-[#50535e]"
            />
            {isDuplicate && (
              <p className="text-[11px] text-[#f59e0b] mt-1.5">
                Note: An existing template with this name will be replaced.
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-[#363a45] hover:border-[#787b86] hover:bg-[#2a2e39] text-xs text-[#d1d4dc] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-1.5 rounded bg-[#2962ff] hover:bg-[#1e4bd8] disabled:opacity-40 disabled:hover:bg-[#2962ff] text-white text-xs font-medium shadow transition-colors cursor-pointer"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
