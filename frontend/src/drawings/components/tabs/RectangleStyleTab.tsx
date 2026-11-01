import React from 'react';
import type { UserDrawing } from '../../types';
import type { RectangleOptions } from '../../tools/RectangleTool';
import { ColorPickerPopover } from '../../../components/Common/ColorPickerPopover';

interface RectangleStyleTabProps {
  drawing: UserDrawing;
  onChange: (updates: Partial<UserDrawing>) => void;
}

export const RectangleStyleTab: React.FC<RectangleStyleTabProps> = ({
  drawing,
  onChange,
}) => {
  const opts = (drawing.options as RectangleOptions) || {};

  const updateOpts = (newOpts: Partial<RectangleOptions>) => {
    onChange({
      options: {
        ...opts,
        ...newOpts,
      },
    });
  };

  // Determine current extend value
  let extendVal: 'none' | 'left' | 'right' | 'both' = opts.extend || 'none';
  if (opts.extendLeft && opts.extendRight) {
    extendVal = 'both';
  } else if (opts.extendLeft) {
    extendVal = 'left';
  } else if (opts.extendRight) {
    extendVal = 'right';
  }

  const handleExtendChange = (val: 'none' | 'left' | 'right' | 'both') => {
    onChange({
      options: {
        ...opts,
        extend: val,
        extendLeft: val === 'left' || val === 'both',
        extendRight: val === 'right' || val === 'both',
      },
    });
  };

  const borderColor = opts.borderColor || drawing.color || '#2962ff';
  const borderWidth = opts.borderWidth || drawing.lineWidth || 1;
  const borderStyle = opts.borderStyle || drawing.lineStyle || 'solid';

  const middleLineColor = opts.middleLineColor || '#ab47bc';
  const middleLineWidth = opts.middleLineWidth || 1;
  const middleLineStyle = opts.middleLineStyle || 'dashed';

  const bgColor = opts.backgroundColor || 'rgba(41, 98, 255, 0.2)';

  return (
    <div className="space-y-4 text-xs text-[#d1d4dc]">
      {/* 1. Extend */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-normal">Extend</label>
        <select
          value={extendVal}
          onChange={(e) => handleExtendChange(e.target.value as 'none' | 'left' | 'right' | 'both')}
          className="bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] rounded px-3 py-1.5 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff] cursor-pointer w-48"
        >
          <option value="none">Don't extend</option>
          <option value="left">Extend left</option>
          <option value="right">Extend right</option>
          <option value="both">Extend both</option>
        </select>
      </div>

      {/* 2. Border */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-normal">Border</label>
        <div className="flex items-center space-x-2">
          <ColorPickerPopover
            color={borderColor}
            onChange={(c) => {
              onChange({
                color: c,
                options: {
                  ...opts,
                  borderColor: c,
                },
              });
            }}
            showLine={true}
            lineWidth={borderWidth}
            lineStyle={borderStyle}
            onLineWidthChange={(w) => {
              onChange({
                lineWidth: w,
                options: {
                  ...opts,
                  borderWidth: w,
                },
              });
            }}
            onLineStyleChange={(s) => {
              onChange({
                lineStyle: s,
                options: {
                  ...opts,
                  borderStyle: s,
                },
              });
            }}
            title="Border Color & Style"
          />
        </div>
      </div>

      {/* 3. Middle line */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="rect-middle-line-toggle"
            checked={!!opts.showMiddleLine}
            onChange={(e) => updateOpts({ showMiddleLine: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
          />
          <label htmlFor="rect-middle-line-toggle" className="cursor-pointer select-none font-normal">
            Middle line
          </label>
        </div>
        <div className="flex items-center space-x-2">
          <ColorPickerPopover
            color={middleLineColor}
            onChange={(c) => updateOpts({ middleLineColor: c })}
            showLine={true}
            lineWidth={middleLineWidth}
            lineStyle={middleLineStyle}
            onLineWidthChange={(w) => updateOpts({ middleLineWidth: w })}
            onLineStyleChange={(s) => updateOpts({ middleLineStyle: s })}
            title="Middle Line Style"
          />
        </div>
      </div>

      {/* 4. Background */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="rect-bg-toggle"
            checked={opts.showBackground !== false}
            onChange={(e) => updateOpts({ showBackground: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
          />
          <label htmlFor="rect-bg-toggle" className="cursor-pointer select-none font-normal">
            Background
          </label>
        </div>
        <div className="flex items-center space-x-2">
          <ColorPickerPopover
            color={bgColor}
            onChange={(c) => updateOpts({ backgroundColor: c, showBackground: true })}
            title="Background Color"
          />
        </div>
      </div>
    </div>
  );
};
