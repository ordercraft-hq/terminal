import React from 'react';
import type { UserDrawing } from '../../types';
import type { RotatedRectangleOptions } from '../../tools/RotatedRectangleTool';
import { ColorPickerPopover } from '../../../components/Common/ColorPickerPopover';

interface RotatedRectangleStyleTabProps {
  drawing: UserDrawing;
  onChange: (updates: Partial<UserDrawing>) => void;
}

export const RotatedRectangleStyleTab: React.FC<RotatedRectangleStyleTabProps> = ({
  drawing,
  onChange,
}) => {
  const opts = (drawing.options as RotatedRectangleOptions) || {};

  const updateOpts = (newOpts: Partial<RotatedRectangleOptions>) => {
    onChange({
      options: {
        ...opts,
        ...newOpts,
      },
    });
  };

  const borderColor = opts.borderColor || drawing.color || '#089981';
  const borderWidth = opts.borderWidth || drawing.lineWidth || 2;
  const borderStyle = opts.borderStyle || drawing.lineStyle || 'solid';
  const bgColor = opts.backgroundColor || 'rgba(8, 153, 129, 0.2)';

  return (
    <div className="space-y-4 text-xs text-[#d1d4dc]">
      {/* 1. Border */}
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

      {/* 2. Background */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="rotated-rect-bg-toggle"
            checked={opts.showBackground !== false}
            onChange={(e) => updateOpts({ showBackground: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
          />
          <label htmlFor="rotated-rect-bg-toggle" className="cursor-pointer select-none font-normal">
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
