import React from 'react';
import type { UserDrawing, TrendlineOptions, TextAlignment, TextVerticalAlignment } from '../../types';
import { ColorPickerPopover } from '../../../components/Common/ColorPickerPopover';
import { AlignLeft, AlignCenter, AlignRight, Bold, Italic } from 'lucide-react';

interface DrawingTextTabProps {
  drawing: UserDrawing;
  onChange: (updates: Partial<UserDrawing>) => void;
}

export const DrawingTextTab: React.FC<DrawingTextTabProps> = ({
  drawing,
  onChange,
}) => {
  const opts = (drawing.options as TrendlineOptions) || {};
  const textVal = opts.text ?? drawing.text ?? '';
  const textColor = opts.textColor || drawing.color || '#d1d4dc';
  const textSize = opts.textSize || 12;

  const updateOpts = (newOpts: Partial<TrendlineOptions>) => {
    onChange({
      options: {
        ...opts,
        ...newOpts,
      },
    });
  };

  return (
    <div className="space-y-4 text-xs text-[#d1d4dc]">
      {/* 1. Text Checkbox & Textarea */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="drawing-text-enabled"
            checked={!!opts.showText || textVal.trim().length > 0}
            onChange={(e) => updateOpts({ showText: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
          />
          <label htmlFor="drawing-text-enabled" className="cursor-pointer select-none font-normal">
            Text
          </label>
        </div>

        <textarea
          rows={3}
          value={textVal}
          onChange={(e) => {
            const val = e.target.value;
            onChange({
              text: val,
              options: {
                ...opts,
                text: val,
                showText: val.trim().length > 0,
              },
            });
          }}
          placeholder="Enter text annotation..."
          className="w-full bg-[#131722] border border-[#363a45] hover:border-[#787b86] focus:border-[#2962ff] rounded p-2 text-xs text-[#d1d4dc] outline-none resize-none font-sans"
        />
      </div>

      {/* 2. Text Style Controls: Size, Color, Bold, Italic */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-normal">Font size & style</label>
        <div className="flex items-center space-x-2">
          {/* Font Size Select */}
          <select
            value={textSize}
            onChange={(e) => updateOpts({ textSize: parseInt(e.target.value, 10) })}
            className="bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] rounded px-2 py-1 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff] cursor-pointer"
          >
            {[10, 12, 14, 16, 20, 24, 28, 36].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Text Color Picker */}
          <ColorPickerPopover
            color={textColor}
            onChange={(c) => updateOpts({ textColor: c })}
            title="Text Color"
          />

          {/* Bold Toggle */}
          <button
            type="button"
            onClick={() => updateOpts({ textBold: !opts.textBold })}
            className={`w-7 h-7 rounded border border-[#363a45] flex items-center justify-center cursor-pointer transition-colors ${
              opts.textBold ? 'bg-[#2962ff]/20 border-[#2962ff] text-[#2962ff]' : 'hover:bg-[#2a2e39] text-[#787b86]'
            }`}
            title="Bold"
          >
            <Bold size={13} />
          </button>

          {/* Italic Toggle */}
          <button
            type="button"
            onClick={() => updateOpts({ textItalic: !opts.textItalic })}
            className={`w-7 h-7 rounded border border-[#363a45] flex items-center justify-center cursor-pointer transition-colors ${
              opts.textItalic ? 'bg-[#2962ff]/20 border-[#2962ff] text-[#2962ff]' : 'hover:bg-[#2a2e39] text-[#787b86]'
            }`}
            title="Italic"
          >
            <Italic size={13} />
          </button>
        </div>
      </div>

      {/* 2b. Text Orientation (for vertical line) */}
      {drawing.type === 'vertical_line' && (
        <div className="flex items-center justify-between">
          <label className="text-[#d1d4dc] font-normal">Text orientation</label>
          <select
            value={opts.textOrientation || 'vertical'}
            onChange={(e) => updateOpts({ textOrientation: e.target.value as 'horizontal' | 'vertical' })}
            className="bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] rounded px-3 py-1.5 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff] cursor-pointer w-44"
          >
            <option value="vertical">Vertical</option>
            <option value="horizontal">Horizontal</option>
          </select>
        </div>
      )}

      {/* 3. Text Alignment */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-normal">Text alignment</label>
        <div className="flex items-center space-x-1 bg-[#131722] p-0.5 rounded border border-[#363a45]">
          {(['left', 'center', 'right'] as TextAlignment[]).map((align) => {
            const isSelected = (opts.textAlignment || 'center') === align;
            return (
              <button
                key={align}
                type="button"
                onClick={() => updateOpts({ textAlignment: align })}
                className={`p-1.5 rounded cursor-pointer transition-colors ${
                  isSelected ? 'bg-[#2a2e39] text-[#2962ff]' : 'text-[#787b86] hover:text-[#d1d4dc]'
                }`}
                title={`Align ${align}`}
              >
                {align === 'left' && <AlignLeft size={13} />}
                {align === 'center' && <AlignCenter size={13} />}
                {align === 'right' && <AlignRight size={13} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Text Position (Vertical) */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-normal">Text position</label>
        <select
          value={opts.textVerticalAlignment || 'top'}
          onChange={(e) => updateOpts({ textVerticalAlignment: e.target.value as TextVerticalAlignment })}
          className="bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] rounded px-3 py-1.5 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff] cursor-pointer w-44"
        >
          <option value="top">Top</option>
          <option value="middle">Middle</option>
          <option value="bottom">Bottom</option>
        </select>
      </div>
    </div>
  );
};
