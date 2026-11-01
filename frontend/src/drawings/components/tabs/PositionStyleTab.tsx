import React from 'react';
import type { UserDrawing } from '../../types';
import type { PositionOptions } from '../../tools/PositionTool';
import { ColorPickerPopover } from '../../../components/Common/ColorPickerPopover';

interface PositionStyleTabProps {
  drawing: UserDrawing;
  onChange: (updates: Partial<UserDrawing>) => void;
}

export const PositionStyleTab: React.FC<PositionStyleTabProps> = ({
  drawing,
  onChange,
}) => {
  const opts = (drawing.options as PositionOptions) || {};

  const updateOpts = (newOpts: Partial<PositionOptions>) => {
    onChange({
      options: {
        ...opts,
        ...newOpts,
      },
    });
  };

  const lineColor = opts.lineColor || '#2a2e39';
  const lineWidth = opts.lineWidth || drawing.lineWidth || 1.5;
  const lineStyle = drawing.lineStyle || 'solid';
  const stopColor = opts.stopColor || 'rgba(242, 54, 69, 0.2)';
  const targetColor = opts.targetColor || 'rgba(8, 153, 129, 0.2)';
  const textColor = opts.textColor || '#ffffff';
  const textSize = opts.textSize || 12;
  const showPriceLabels = opts.showPriceLabels !== false;
  const compactStatsMode = opts.compactStatsMode !== false;
  const alwaysShowStats = opts.alwaysShowStats === true;

  return (
    <div className="space-y-4 text-xs text-[#d1d4dc]">
      {/* 1. Lines */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-normal">Lines</label>
        <ColorPickerPopover
          color={lineColor}
          onChange={(newColor) => {
            onChange({
              color: newColor,
              options: {
                ...opts,
                lineColor: newColor,
              },
            });
          }}
          showLine={true}
          lineWidth={lineWidth}
          lineStyle={lineStyle}
          onLineWidthChange={(w) => {
            onChange({
              lineWidth: w,
              options: {
                ...opts,
                lineWidth: w,
              },
            });
          }}
          onLineStyleChange={(s) => {
            onChange({
              lineStyle: s,
            });
          }}
          title="Lines Color"
        />
      </div>

      {/* 2. Stop color */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-normal">Stop color</label>
        <ColorPickerPopover
          color={stopColor}
          onChange={(newStopColor) => updateOpts({ stopColor: newStopColor })}
          title="Stop Color"
        />
      </div>

      {/* 3. Target color */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-normal">Target color</label>
        <ColorPickerPopover
          color={targetColor}
          onChange={(newTargetColor) => updateOpts({ targetColor: newTargetColor })}
          title="Target Color"
        />
      </div>

      {/* 4. Text */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-normal">Text</label>
        <div className="flex items-center space-x-2">
          <ColorPickerPopover
            color={textColor}
            onChange={(newTextColor) => updateOpts({ textColor: newTextColor })}
            title="Text Color"
          />
          <select
            value={textSize}
            onChange={(e) => updateOpts({ textSize: parseInt(e.target.value, 10) || 12 })}
            className="w-20 bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] rounded px-2.5 py-1 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff] cursor-pointer"
          >
            <option value="10">10</option>
            <option value="11">11</option>
            <option value="12">12</option>
            <option value="14">14</option>
            <option value="16">16</option>
            <option value="18">18</option>
            <option value="20">20</option>
            <option value="24">24</option>
          </select>
        </div>
      </div>

      {/* 5. Price labels */}
      <div className="flex items-center space-x-2.5 pt-1">
        <input
          id="pos-price-labels"
          type="checkbox"
          checked={showPriceLabels}
          onChange={(e) => updateOpts({ showPriceLabels: e.target.checked })}
          className="rounded bg-[#131722] border-[#363a45] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer"
        />
        <label htmlFor="pos-price-labels" className="text-[#d1d4dc] cursor-pointer select-none">
          Price labels
        </label>
      </div>

      {/* INFO SECTION */}
      <div className="pt-2 border-t border-[#2a2e39]/60 space-y-3.5">
        <div className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider">
          Info
        </div>

        {/* Stats dropdown */}
        <div className="flex items-center justify-between">
          <label className="text-[#d1d4dc] font-normal">Stats</label>
          <select
            value={opts.stats || 'tp_offset_percent_rr'}
            onChange={(e) => updateOpts({ stats: e.target.value })}
            className="w-52 bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] rounded px-2.5 py-1 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff] cursor-pointer truncate"
          >
            <option value="tp_offset_percent_rr">TP price offset, TP percentage, R:R</option>
            <option value="offset_percent">Price offset and percentage</option>
            <option value="all">All stats (ticks, price, %, amount)</option>
            <option value="rr_only">Risk/Reward only</option>
            <option value="hidden">Hidden</option>
          </select>
        </div>

        {/* Compact stats mode */}
        <div className="flex items-center space-x-2.5">
          <input
            id="pos-compact-stats"
            type="checkbox"
            checked={compactStatsMode}
            onChange={(e) => updateOpts({ compactStatsMode: e.target.checked })}
            className="rounded bg-[#131722] border-[#363a45] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer"
          />
          <label htmlFor="pos-compact-stats" className="text-[#d1d4dc] cursor-pointer select-none">
            Compact stats mode
          </label>
        </div>

        {/* Always show stats */}
        <div className="flex items-center space-x-2.5">
          <input
            id="pos-always-stats"
            type="checkbox"
            checked={alwaysShowStats}
            onChange={(e) => updateOpts({ alwaysShowStats: e.target.checked })}
            className="rounded bg-[#131722] border-[#363a45] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer"
          />
          <label htmlFor="pos-always-stats" className="text-[#d1d4dc] cursor-pointer select-none">
            Always show stats
          </label>
        </div>
      </div>
    </div>
  );
};
