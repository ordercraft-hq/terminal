import React from 'react';
import type { UserDrawing } from '../../types';
import type { FibRetracementOptions, FibLevel } from '../../tools/FibRetracementTool';
import { DEFAULT_FIB_LEVELS } from '../../tools/FibRetracementTool';
import { ColorPickerPopover } from '../../../components/Common/ColorPickerPopover';
import { LineWidthPopover } from '../common/LineWidthPopover';
import { LineStylePopover } from '../common/LineStylePopover';
import { CoeffInput } from '../common/CoeffInput';

interface FibRetracementStyleTabProps {
  drawing: UserDrawing;
  onChange: (updates: Partial<UserDrawing>) => void;
}

export const FibRetracementStyleTab: React.FC<FibRetracementStyleTabProps> = ({
  drawing,
  onChange,
}) => {
  const opts: FibRetracementOptions = (drawing.options as FibRetracementOptions) || {};
  const levels: FibLevel[] =
    opts.levels && opts.levels.length > 0
      ? opts.levels
      : JSON.parse(JSON.stringify(DEFAULT_FIB_LEVELS));

  const updateOpts = (newOpts: Partial<FibRetracementOptions>) => {
    onChange({
      options: {
        ...opts,
        ...newOpts,
      },
    });
  };

  const handleLevelChange = (index: number, updates: Partial<FibLevel>) => {
    const nextLevels = [...levels];
    nextLevels[index] = { ...nextLevels[index], ...updates };
    updateOpts({ levels: nextLevels });
  };

  // 24 levels: 12 in left column, 12 in right column
  const leftLevels = levels.slice(0, 12);
  const rightLevels = levels.slice(12, 24);

  return (
    <div className="space-y-3.5 text-xs text-[#d1d4dc]">
      {/* 1. Trend Line Row */}
      <div className="flex items-center justify-between">
        <label className="flex items-center space-x-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!opts.showTrendline}
            onChange={(e) => updateOpts({ showTrendline: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[#d1d4dc]">Trend line</span>
        </label>

        <ColorPickerPopover
          color={opts.trendlineColor || '#787b86'}
          onChange={(c) => updateOpts({ trendlineColor: c })}
          showLine={true}
          lineWidth={opts.trendlineWidth || 1}
          lineStyle={opts.trendlineStyle || 'dashed'}
          onLineWidthChange={(w) => updateOpts({ trendlineWidth: w })}
          onLineStyleChange={(s) => updateOpts({ trendlineStyle: s })}
          title="Trend line style"
        />
      </div>

      {/* 2. Levels Line Row */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc]">Levels line</label>
        <div className="flex items-center space-x-2">
          <LineWidthPopover
            value={opts.levelsLineWidth || 1}
            onChange={(w) => updateOpts({ levelsLineWidth: w })}
          />
          <LineStylePopover
            value={opts.levelsLineStyle || 'solid'}
            onChange={(s) => updateOpts({ levelsLineStyle: s })}
          />
        </div>
      </div>

      {/* 3. Extend Row */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc]">Extend</label>
        <select
          value={opts.extend || 'none'}
          onChange={(e) => updateOpts({ extend: e.target.value as 'none' | 'left' | 'right' | 'both' })}
          className="bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] rounded px-3 py-1.5 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff] cursor-pointer w-44"
        >
          <option value="none">Don't extend</option>
          <option value="left">Extend left</option>
          <option value="right">Extend right</option>
          <option value="both">Both</option>
        </select>
      </div>

      {/* 4. 24 Fibonacci Levels (2 columns x 12 rows) */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 py-1 border-t border-b border-[#2a2e39]/60">
        {/* Left Column */}
        <div className="space-y-2">
          {leftLevels.map((lvl, localIdx) => {
            const globalIdx = localIdx;
            return (
              <div key={globalIdx} className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <input
                    type="checkbox"
                    checked={!!lvl.enabled}
                    onChange={(e) => handleLevelChange(globalIdx, { enabled: e.target.checked })}
                    className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
                  />
                  <CoeffInput
                    value={lvl.coeff}
                    onChange={(val) => handleLevelChange(globalIdx, { coeff: val })}
                    className="w-16"
                  />
                </div>
                <ColorPickerPopover
                  color={lvl.color || '#787b86'}
                  onChange={(c) => handleLevelChange(globalIdx, { color: c })}
                />
              </div>
            );
          })}
        </div>

        {/* Right Column */}
        <div className="space-y-2">
          {rightLevels.map((lvl, localIdx) => {
            const globalIdx = 12 + localIdx;
            return (
              <div key={globalIdx} className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <input
                    type="checkbox"
                    checked={!!lvl.enabled}
                    onChange={(e) => handleLevelChange(globalIdx, { enabled: e.target.checked })}
                    className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
                  />
                  <CoeffInput
                    value={lvl.coeff}
                    onChange={(val) => handleLevelChange(globalIdx, { coeff: val })}
                    className="w-16"
                  />
                </div>
                <ColorPickerPopover
                  color={lvl.color || '#787b86'}
                  onChange={(c) => handleLevelChange(globalIdx, { color: c })}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Use one color Row */}
      <div className="flex items-center justify-between">
        <label className="flex items-center space-x-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!opts.useOneColor}
            onChange={(e) => updateOpts({ useOneColor: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[#d1d4dc]">Use one color</span>
        </label>

        <ColorPickerPopover
          color={opts.singleColor || '#2962ff'}
          onChange={(c) => updateOpts({ singleColor: c })}
          title="Single color for all levels"
        />
      </div>

      {/* 6. Background Row + Opacity Slider */}
      <div className="flex items-center justify-between">
        <label className="flex items-center space-x-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!opts.showBackground}
            onChange={(e) => updateOpts({ showBackground: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[#d1d4dc]">Background</span>
        </label>

        <div className="flex items-center space-x-2">
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round((opts.backgroundOpacity ?? 0.15) * 100)}
            onChange={(e) => updateOpts({ backgroundOpacity: Number(e.target.value) / 100 })}
            className="w-32 h-1.5 bg-[#2a2e39] rounded-lg appearance-none cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[11px] text-[#787b86] font-mono w-7 text-right">
            {Math.round((opts.backgroundOpacity ?? 0.15) * 100)}%
          </span>
        </div>
      </div>

      {/* 7. Reverse Row */}
      <div className="flex items-center justify-between">
        <label className="flex items-center space-x-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!opts.reverse}
            onChange={(e) => updateOpts({ reverse: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[#d1d4dc]">Reverse</span>
        </label>
      </div>

      {/* 8. Prices Row */}
      <div className="flex items-center justify-between">
        <label className="flex items-center space-x-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={opts.showPrices !== false}
            onChange={(e) => updateOpts({ showPrices: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[#d1d4dc]">Prices</span>
        </label>
      </div>

      {/* 9. Levels Row with Format Dropdown */}
      <div className="flex items-center justify-between">
        <label className="flex items-center space-x-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={opts.showLevels !== false}
            onChange={(e) => updateOpts({ showLevels: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[#d1d4dc]">Levels</span>
        </label>

        <select
          value={opts.levelsFormat || 'values'}
          onChange={(e) => updateOpts({ levelsFormat: e.target.value as 'values' | 'percents' })}
          className="bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] rounded px-3 py-1.5 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff] cursor-pointer w-44"
        >
          <option value="values">Values</option>
          <option value="percents">Percents</option>
        </select>
      </div>

      {/* 10. Labels Row with Horizontal and Vertical dropdowns */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc]">Labels</label>
        <div className="flex items-center space-x-2">
          <select
            value={opts.labelsPosition || 'right'}
            onChange={(e) => updateOpts({ labelsPosition: e.target.value as 'left' | 'center' | 'right' })}
            className="bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] rounded px-2.5 py-1.5 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff] cursor-pointer w-[86px]"
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>

          <select
            value={opts.labelsVerticalPosition || 'middle'}
            onChange={(e) => updateOpts({ labelsVerticalPosition: e.target.value as 'top' | 'middle' | 'bottom' })}
            className="bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] rounded px-2.5 py-1.5 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff] cursor-pointer w-[86px]"
          >
            <option value="top">Top</option>
            <option value="middle">Middle</option>
            <option value="bottom">Bottom</option>
          </select>
        </div>
      </div>

      {/* 11. Font Size Row */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc]">Font size</label>
        <select
          value={opts.fontSize || 12}
          onChange={(e) => updateOpts({ fontSize: Number(e.target.value) })}
          className="bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] rounded px-3 py-1.5 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff] cursor-pointer w-44"
        >
          <option value="10">10</option>
          <option value="11">11</option>
          <option value="12">12</option>
          <option value="14">14</option>
          <option value="16">16</option>
          <option value="20">20</option>
        </select>
      </div>

      {/* 12. Fib levels based on log scale Row */}
      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center space-x-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!opts.logScale}
            onChange={(e) => updateOpts({ logScale: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[#d1d4dc]">Fib levels based on log scale</span>
        </label>
      </div>
    </div>
  );
};
