import React from 'react';
import type { UserDrawing, TrendlineOptions, LineEndCap, StatsMode, StatsPosition } from '../../types';
import { ColorPickerPopover } from '../../../components/Common/ColorPickerPopover';
import { CapSelectorPopover } from '../common/CapSelectorPopover';

interface TrendlineStyleTabProps {
  drawing: UserDrawing;
  onChange: (updates: Partial<UserDrawing>) => void;
}

export const TrendlineStyleTab: React.FC<TrendlineStyleTabProps> = ({
  drawing,
  onChange,
}) => {
  const opts = (drawing.options as TrendlineOptions) || {};
  const color = drawing.color || '#2962ff';
  const lineWidth = drawing.lineWidth || 1;
  const lineStyle = drawing.lineStyle || 'solid';
  const isHorizontal = drawing.type === 'horizontal_line' || drawing.type === 'horizontal_ray';
  const isVertical = drawing.type === 'vertical_line';
  const isCrossline = drawing.type === 'cross_line';
  const isSpecialLine = isHorizontal || isVertical || isCrossline;

  // Compute extend dropdown value
  let extendValue = 'none';
  if (opts.extendLeft && opts.extendRight) {
    extendValue = 'both';
  } else if (opts.extendLeft) {
    extendValue = 'left';
  } else if (opts.extendRight) {
    extendValue = 'right';
  }

  const handleExtendChange = (val: string) => {
    onChange({
      options: {
        ...opts,
        extendLeft: val === 'left' || val === 'both',
        extendRight: val === 'right' || val === 'both',
      },
    });
  };

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
          {!isSpecialLine && (
            <CapSelectorPopover
              direction="left"
              value={opts.leftEnd || 'normal'}
              onChange={(cap: LineEndCap) => updateOpts({ leftEnd: cap })}
            />
          )}

          {/* Right End Cap */}
          {!isSpecialLine && (
            <CapSelectorPopover
              direction="right"
              value={opts.rightEnd || 'normal'}
              onChange={(cap: LineEndCap) => updateOpts({ rightEnd: cap })}
            />
          )}
        </div>
      </div>

      {/* 2a. Extend Row (Hidden for Ray and Special lines) */}
      {drawing.type !== 'ray' && !isSpecialLine && (
        <div className="flex items-center justify-between">
          <label className="text-[#d1d4dc] font-normal">Extend</label>
          <select
            value={extendValue}
            onChange={(e) => handleExtendChange(e.target.value)}
            className="bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] rounded px-3 py-1.5 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff] cursor-pointer w-44"
          >
            <option value="none">Don't extend</option>
            <option value="left">Extend left</option>
            <option value="right">Extend right</option>
            <option value="both">Both</option>
          </select>
        </div>
      )}

      {/* 2b. Extend Checkbox (Vertical line only) */}
      {isVertical && (
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id={`${drawing.type}-extend`}
            checked={opts.extend !== false}
            onChange={(e) => updateOpts({ extend: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
          />
          <label htmlFor={`${drawing.type}-extend`} className="cursor-pointer select-none">
            Extend
          </label>
        </div>
      )}

      {/* 3. Middle point checkbox (Hidden for Special lines) */}
      {!isSpecialLine && (
        <div className="flex items-center space-x-2 pt-1">
          <input
            type="checkbox"
            id={`${drawing.type}-middle-point`}
            checked={!!opts.showMiddlePoint}
            onChange={(e) => updateOpts({ showMiddlePoint: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
          />
          <label htmlFor={`${drawing.type}-middle-point`} className="cursor-pointer select-none">
            Middle point
          </label>
        </div>
      )}

      {/* 4. Price label and/or Time label checkboxes */}
      {isCrossline ? (
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id={`${drawing.type}-price-labels`}
              checked={opts.showPriceLabels !== false}
              onChange={(e) => updateOpts({ showPriceLabels: e.target.checked })}
              className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
            />
            <label htmlFor={`${drawing.type}-price-labels`} className="cursor-pointer select-none">
              Price label
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id={`${drawing.type}-time-label`}
              checked={opts.showTimeLabel !== false}
              onChange={(e) => updateOpts({ showTimeLabel: e.target.checked })}
              className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
            />
            <label htmlFor={`${drawing.type}-time-label`} className="cursor-pointer select-none">
              Time label
            </label>
          </div>
        </div>
      ) : isVertical ? (
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id={`${drawing.type}-time-label`}
            checked={opts.showTimeLabel !== false}
            onChange={(e) => updateOpts({ showTimeLabel: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
          />
          <label htmlFor={`${drawing.type}-time-label`} className="cursor-pointer select-none">
            Time label
          </label>
        </div>
      ) : (
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id={`${drawing.type}-price-labels`}
            checked={!!opts.showPriceLabels}
            onChange={(e) => updateOpts({ showPriceLabels: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
          />
          <label htmlFor={`${drawing.type}-price-labels`} className="cursor-pointer select-none">
            {isHorizontal ? 'Price label' : 'Price labels'}
          </label>
        </div>
      )}

      {/* 5. INFO Section Header (Hidden for Special lines) */}
      {!isSpecialLine && (
        <div className="pt-2">
          <div className="text-[11px] font-semibold tracking-wider text-[#787b86] uppercase mb-3">
            Info
          </div>

          {/* 6. Stats Row */}
          <div className="flex items-center justify-between mb-3">
            <label className="text-[#d1d4dc] font-normal">Stats</label>
            <select
              value={opts.stats || 'hidden'}
              onChange={(e) => updateOpts({ stats: e.target.value as StatsMode })}
              className="bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] rounded px-3 py-1.5 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff] cursor-pointer w-44"
            >
              <option value="hidden">Hidden</option>
              <option value="bars">Show bars range</option>
              <option value="price">Show price range</option>
              <option value="date_time">Show date/time range</option>
              <option value="all">Show all</option>
            </select>
          </div>

          {/* 7. Stats position Row */}
          <div className="flex items-center justify-between mb-3">
            <label className="text-[#d1d4dc] font-normal">Stats position</label>
            <select
              value={opts.statsPosition || 'right'}
              onChange={(e) => updateOpts({ statsPosition: e.target.value as StatsPosition })}
              className="bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] rounded px-3 py-1.5 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff] cursor-pointer w-44"
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>

          {/* 8. Always show stats checkbox */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id={`${drawing.type}-always-stats`}
              checked={!!opts.alwaysShowStats}
              onChange={(e) => updateOpts({ alwaysShowStats: e.target.checked })}
              className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
            />
            <label htmlFor={`${drawing.type}-always-stats`} className="cursor-pointer select-none">
              Always show stats
            </label>
          </div>
        </div>
      )}
    </div>
  );
};
