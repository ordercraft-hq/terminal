import React from 'react';
import { Info } from 'lucide-react';
import type { UserDrawing, AnchoredVWAPOptions, BandsCalcMode, VWAPSource } from '../../types';

interface AnchoredVWAPInputsTabProps {
  drawing: UserDrawing;
  onChange: (updates: Partial<UserDrawing>) => void;
}

export const AnchoredVWAPInputsTab: React.FC<AnchoredVWAPInputsTabProps> = ({
  drawing,
  onChange,
}) => {
  const opts = (drawing.options as AnchoredVWAPOptions) || {};

  const updateOpts = (newOpts: Partial<AnchoredVWAPOptions>) => {
    onChange({
      options: {
        ...opts,
        ...newOpts,
      },
    });
  };

  return (
    <div className="space-y-4 text-xs text-[#d1d4dc] py-1 select-none">
      {/* Section Header: BANDS SETTINGS */}
      <div className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider">
        BANDS SETTINGS
      </div>

      {/* Bands Calculation Mode */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <label className="text-[#d1d4dc] font-normal">Bands Calculation Mode</label>
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={opts.calcMode || 'stdev'}
            onChange={(e) => updateOpts({ calcMode: e.target.value as BandsCalcMode })}
            className="w-36 bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] focus:border-[#2962ff] rounded px-2.5 py-1 text-xs text-[#d1d4dc] outline-none cursor-pointer"
          >
            <option value="stdev">Standard Deviation</option>
            <option value="percentage">Percentage</option>
          </select>
          <div
            className="text-[#787b86] hover:text-[#d1d4dc] cursor-help p-0.5"
            title="Determines whether bands are calculated as Standard Deviations or Percentages of the VWAP"
          >
            <Info size={14} />
          </div>
        </div>
      </div>

      {/* Bands Multiplier #1 */}
      <div className="flex items-center justify-between">
        <label className="flex items-center space-x-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={opts.band1 !== false}
            onChange={(e) => updateOpts({ band1: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[#d1d4dc]">Bands Multiplier #1</span>
        </label>
        <input
          type="number"
          step="0.1"
          min="0.1"
          value={opts.mult1 ?? 1}
          disabled={opts.band1 === false}
          onChange={(e) => updateOpts({ mult1: parseFloat(e.target.value) || 1 })}
          className="w-36 bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] focus:border-[#2962ff] disabled:opacity-40 rounded px-2.5 py-1 text-xs text-[#d1d4dc] outline-none font-mono"
        />
      </div>

      {/* Bands Multiplier #2 */}
      <div className="flex items-center justify-between">
        <label className="flex items-center space-x-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(opts.band2)}
            onChange={(e) => updateOpts({ band2: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[#d1d4dc]">Bands Multiplier #2</span>
        </label>
        <input
          type="number"
          step="0.1"
          min="0.1"
          value={opts.mult2 ?? 2}
          disabled={!opts.band2}
          onChange={(e) => updateOpts({ mult2: parseFloat(e.target.value) || 2 })}
          className="w-36 bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] focus:border-[#2962ff] disabled:opacity-40 rounded px-2.5 py-1 text-xs text-[#d1d4dc] outline-none font-mono"
        />
      </div>

      {/* Bands Multiplier #3 */}
      <div className="flex items-center justify-between">
        <label className="flex items-center space-x-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(opts.band3)}
            onChange={(e) => updateOpts({ band3: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[#d1d4dc]">Bands Multiplier #3</span>
        </label>
        <input
          type="number"
          step="0.1"
          min="0.1"
          value={opts.mult3 ?? 3}
          disabled={!opts.band3}
          onChange={(e) => updateOpts({ mult3: parseFloat(e.target.value) || 3 })}
          className="w-36 bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] focus:border-[#2962ff] disabled:opacity-40 rounded px-2.5 py-1 text-xs text-[#d1d4dc] outline-none font-mono"
        />
      </div>

      {/* Source */}
      <div className="flex items-center justify-between pt-2">
        <label className="text-[#d1d4dc] font-normal">Source</label>
        <select
          value={opts.source || 'hlc3'}
          onChange={(e) => updateOpts({ source: e.target.value as VWAPSource })}
          className="w-36 bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] focus:border-[#2962ff] rounded px-2.5 py-1 text-xs text-[#d1d4dc] outline-none cursor-pointer"
        >
          <option value="hlc3">(H + L + C) / 3</option>
          <option value="close">Close</option>
          <option value="open">Open</option>
          <option value="high">High</option>
          <option value="low">Low</option>
          <option value="hl2">(H + L) / 2</option>
          <option value="ohlc4">(O + H + L + C) / 4</option>
        </select>
      </div>
    </div>
  );
};
