import React from 'react';
import type { UserDrawing } from '../../types';
import type { ParallelChannelOptions, ChannelLevel } from '../../tools/ParallelChannelTool';
import { DEFAULT_CHANNEL_LEVELS } from '../../tools/ParallelChannelTool';
import { ColorPickerPopover } from '../../../components/Common/ColorPickerPopover';
import { CoeffInput } from '../common/CoeffInput';

interface ParallelChannelStyleTabProps {
  drawing: UserDrawing;
  onChange: (updates: Partial<UserDrawing>) => void;
}

export const ParallelChannelStyleTab: React.FC<ParallelChannelStyleTabProps> = ({
  drawing,
  onChange,
}) => {
  const opts: ParallelChannelOptions = (drawing.options as ParallelChannelOptions) || {};
  const levels: ChannelLevel[] =
    opts.levels && opts.levels.length > 0
      ? opts.levels
      : JSON.parse(JSON.stringify(DEFAULT_CHANNEL_LEVELS));

  const updateOpts = (newOpts: Partial<ParallelChannelOptions>) => {
    onChange({
      options: {
        ...opts,
        ...newOpts,
      },
    });
  };

  const handleLevelChange = (index: number, updates: Partial<ChannelLevel>) => {
    const nextLevels = [...levels];
    nextLevels[index] = { ...nextLevels[index], ...updates };
    updateOpts({ levels: nextLevels });
  };

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
    updateOpts({
      extendLeft: val === 'left' || val === 'both',
      extendRight: val === 'right' || val === 'both',
    });
  };

  return (
    <div className="space-y-3.5 text-xs text-[#d1d4dc]">
      {/* 1. Levels List */}
      <div className="space-y-2">
        {levels.map((lvl, idx) => {
          const isAlwaysOn = lvl.coeff === 0 || lvl.coeff === 1;

          return (
            <div key={idx} className="flex items-center justify-between">
              {/* Left: Checkbox + Coeff Input */}
              <div className="flex items-center space-x-2.5">
                {isAlwaysOn ? (
                  // Spacer to align with checkbox
                  <div className="w-4 h-4" />
                ) : (
                  <input
                    type="checkbox"
                    id={`channel-lvl-${idx}`}
                    checked={!!lvl.enabled}
                    onChange={(e) => handleLevelChange(idx, { enabled: e.target.checked })}
                    className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
                  />
                )}

                {/* Coeff label input */}
                <CoeffInput
                  value={lvl.coeff}
                  onChange={(val) => handleLevelChange(idx, { coeff: val })}
                  disabled={isAlwaysOn}
                  step={0.05}
                  className="w-20 px-2.5 py-1"
                />
              </div>

              {/* Right: Color swatch & Line style popover */}
              <ColorPickerPopover
                color={lvl.color || '#2962ff'}
                onChange={(c) => handleLevelChange(idx, { color: c })}
                showLine={true}
                lineWidth={lvl.lineWidth || 1}
                lineStyle={lvl.lineStyle || 'solid'}
                onLineWidthChange={(w) => handleLevelChange(idx, { lineWidth: w })}
                onLineStyleChange={(s) => handleLevelChange(idx, { lineStyle: s })}
                title={`Level ${lvl.coeff} Style`}
              />
            </div>
          );
        })}
      </div>

      <div className="h-[1px] bg-[#2a2e39]/60 my-2" />

      {/* 2. Extend Row */}
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

      {/* 3. Background Row */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="channel-background-toggle"
            checked={opts.showBackground !== false}
            onChange={(e) => updateOpts({ showBackground: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
          />
          <label htmlFor="channel-background-toggle" className="cursor-pointer select-none font-normal">
            Background
          </label>
        </div>

        <ColorPickerPopover
          color={opts.backgroundColor || 'rgba(41, 98, 255, 0.12)'}
          onChange={(c) => updateOpts({ backgroundColor: c })}
          title="Background Fill Color"
        />
      </div>
    </div>
  );
};
