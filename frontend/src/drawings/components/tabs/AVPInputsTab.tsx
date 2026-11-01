import React from 'react';
import type { UserDrawing, AVPOptions, AVPRowsLayout, AVPVolumeType } from '../../types';

interface AVPInputsTabProps {
  drawing: UserDrawing;
  onChange: (updates: Partial<UserDrawing>) => void;
}

export const AVPInputsTab: React.FC<AVPInputsTabProps> = ({ drawing, onChange }) => {
  const opts: AVPOptions = (drawing.options as AVPOptions) || {};

  const updateOpts = (newOpts: Partial<AVPOptions>) => {
    onChange({
      options: {
        ...opts,
        ...newOpts,
      },
    });
  };

  return (
    <div className="space-y-4 text-xs text-[#d1d4dc]">
      {/* 1. Rows Layout */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-medium">Rows Layout</label>
        <select
          value={opts.rowsLayout || 'number_of_rows'}
          onChange={(e) => updateOpts({ rowsLayout: e.target.value as AVPRowsLayout })}
          className="bg-[#131722] border border-[#2a2e39] text-[#d1d4dc] rounded px-3 py-1.5 outline-none hover:border-[#363a45] focus:border-[#2962ff] transition-colors w-40 cursor-pointer"
        >
          <option value="number_of_rows">Number of Rows</option>
          <option value="ticks_per_row">Ticks Per Row</option>
        </select>
      </div>

      {/* 2. Row Size */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-medium">Row Size</label>
        <input
          type="number"
          min={5}
          max={200}
          value={opts.rowSize ?? 24}
          onChange={(e) => updateOpts({ rowSize: parseInt(e.target.value, 10) || 24 })}
          className="bg-[#131722] border border-[#2a2e39] text-[#d1d4dc] rounded px-3 py-1.5 outline-none hover:border-[#363a45] focus:border-[#2962ff] transition-colors w-40 text-left font-mono tabular-nums"
        />
      </div>

      {/* 3. Volume */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-medium">Volume</label>
        <select
          value={opts.volume || 'up_down'}
          onChange={(e) => updateOpts({ volume: e.target.value as AVPVolumeType })}
          className="bg-[#131722] border border-[#2a2e39] text-[#d1d4dc] rounded px-3 py-1.5 outline-none hover:border-[#363a45] focus:border-[#2962ff] transition-colors w-40 cursor-pointer"
        >
          <option value="up_down">Up/Down</option>
          <option value="total">Total</option>
          <option value="delta">Delta</option>
        </select>
      </div>

      {/* 4. Value Area Volume */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-medium">Value Area Volume</label>
        <input
          type="number"
          min={1}
          max={100}
          value={opts.valueAreaVolume ?? 70}
          onChange={(e) => updateOpts({ valueAreaVolume: parseInt(e.target.value, 10) || 70 })}
          className="bg-[#131722] border border-[#2a2e39] text-[#d1d4dc] rounded px-3 py-1.5 outline-none hover:border-[#363a45] focus:border-[#2962ff] transition-colors w-40 text-left font-mono tabular-nums"
        />
      </div>
    </div>
  );
};
