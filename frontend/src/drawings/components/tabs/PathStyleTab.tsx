import React from 'react';
import type { UserDrawing, PathOptions, LineEndCap } from '../../types';
import { ColorPickerPopover } from '../../../components/Common/ColorPickerPopover';
import { CapSelectorPopover } from '../common/CapSelectorPopover';

interface PathStyleTabProps {
  drawing: UserDrawing;
  onChange: (updates: Partial<UserDrawing>) => void;
}

export const PathStyleTab: React.FC<PathStyleTabProps> = ({ drawing, onChange }) => {
  const opts = (drawing.options as PathOptions) || {};
  const color = drawing.color || '#2962ff';
  const lineWidth = drawing.lineWidth || 1;
  const lineStyle = drawing.lineStyle || 'solid';

  const updateOpts = (patch: Partial<PathOptions>) => {
    onChange({
      options: {
        ...opts,
        ...patch,
      },
    });
  };

  return (
    <div className="space-y-4 text-xs text-[#d1d4dc]">
      {/* 1. Line Row (Color swatch, left cap, right cap) */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-normal">Line</label>
        <div className="flex items-center space-x-2">
          {/* Swatch & Line Style Popover */}
          <ColorPickerPopover
            color={color}
            onChange={(c) => onChange({ color: c })}
            showLine={true}
            lineWidth={lineWidth}
            lineStyle={lineStyle}
            onLineWidthChange={(w) => onChange({ lineWidth: w })}
            onLineStyleChange={(s) => onChange({ lineStyle: s })}
            title="Line Color & Thickness"
          />

          {/* Left End Cap */}
          <CapSelectorPopover
            direction="left"
            value={opts.leftEnd || 'circle'}
            onChange={(cap: LineEndCap) => updateOpts({ leftEnd: cap })}
          />

          {/* Right End Cap */}
          <CapSelectorPopover
            direction="right"
            value={opts.rightEnd || 'arrow'}
            onChange={(cap: LineEndCap) => updateOpts({ rightEnd: cap })}
          />
        </div>
      </div>
    </div>
  );
};
