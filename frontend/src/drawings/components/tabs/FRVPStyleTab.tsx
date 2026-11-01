import React from 'react';
import type { UserDrawing, FRVPOptions, FRVPPlacement } from '../../types';
import { ColorPickerPopover } from '../../../components/Common/ColorPickerPopover';

interface FRVPStyleTabProps {
  drawing: UserDrawing;
  onChange: (updates: Partial<UserDrawing>) => void;
}

export const FRVPStyleTab: React.FC<FRVPStyleTabProps> = ({ drawing, onChange }) => {
  const opts: FRVPOptions = (drawing.options as FRVPOptions) || {};

  const updateOpts = (newOpts: Partial<FRVPOptions>) => {
    onChange({
      options: {
        ...opts,
        ...newOpts,
      },
    });
  };

  return (
    <div className="space-y-4 text-xs text-[#d1d4dc]">
      {/* 1. Volume profile main checkbox */}
      <div className="space-y-3">
        <label className="flex items-center space-x-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={opts.showVolumeProfile !== false}
            onChange={(e) => updateOpts({ showVolumeProfile: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[#d1d4dc] font-semibold text-sm">Volume profile</span>
        </label>

        {opts.showVolumeProfile !== false && (
          <div className="pl-6 space-y-3 border-l border-[#2a2e39] ml-2">
            {/* Values */}
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!opts.showValues}
                  onChange={(e) => updateOpts({ showValues: e.target.checked })}
                  className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
                />
                <span className="text-[#d1d4dc]">Values</span>
              </label>
              <ColorPickerPopover
                color={opts.valuesColor || '#d1d4dc'}
                onChange={(c: string) => updateOpts({ valuesColor: c })}
                title="Values Text Color"
              />
            </div>

            {/* Width (% of the box) */}
            <div className="flex items-center justify-between">
              <label className="text-[#d1d4dc]">Width (% of the box)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={opts.widthPercent ?? 30}
                onChange={(e) => updateOpts({ widthPercent: parseInt(e.target.value, 10) || 30 })}
                className="bg-[#131722] border border-[#2a2e39] text-[#d1d4dc] rounded px-3 py-1 outline-none hover:border-[#363a45] focus:border-[#2962ff] transition-colors w-28 text-left font-mono tabular-nums"
              />
            </div>

            {/* Placement */}
            <div className="flex items-center justify-between">
              <label className="text-[#d1d4dc]">Placement</label>
              <select
                value={opts.placement || 'left'}
                onChange={(e) => updateOpts({ placement: e.target.value as FRVPPlacement })}
                className="bg-[#131722] border border-[#2a2e39] text-[#d1d4dc] rounded px-3 py-1 outline-none hover:border-[#363a45] focus:border-[#2962ff] transition-colors w-28 cursor-pointer"
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </div>

            {/* Up Volume */}
            <div className="flex items-center justify-between">
              <span className="text-[#d1d4dc]">Up Volume</span>
              <ColorPickerPopover
                color={opts.upVolumeColor || '#1e88e5'}
                onChange={(c: string) => updateOpts({ upVolumeColor: c })}
                title="Up Volume Color"
              />
            </div>

            {/* Down Volume */}
            <div className="flex items-center justify-between">
              <span className="text-[#d1d4dc]">Down Volume</span>
              <ColorPickerPopover
                color={opts.downVolumeColor || '#c2185b'}
                onChange={(c: string) => updateOpts({ downVolumeColor: c })}
                title="Down Volume Color"
              />
            </div>

            {/* Value Area Up */}
            <div className="flex items-center justify-between">
              <span className="text-[#d1d4dc]">Value Area Up</span>
              <ColorPickerPopover
                color={opts.valueAreaUpColor || '#00bcd4'}
                onChange={(c: string) => updateOpts({ valueAreaUpColor: c })}
                title="Value Area Up Color"
              />
            </div>

            {/* Value Area Down */}
            <div className="flex items-center justify-between">
              <span className="text-[#d1d4dc]">Value Area Down</span>
              <ColorPickerPopover
                color={opts.valueAreaDownColor || '#e91e63'}
                onChange={(c: string) => updateOpts({ valueAreaDownColor: c })}
                title="Value Area Down Color"
              />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-[#2a2e39] pt-3 space-y-3">
        {/* 2. VAH */}
        <div className="flex items-center justify-between">
          <label className="flex items-center space-x-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={!!opts.showVAH}
              onChange={(e) => updateOpts({ showVAH: e.target.checked })}
              className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
            />
            <span className="text-[#d1d4dc]">VAH</span>
          </label>
          <ColorPickerPopover
            color={opts.vahColor || '#089981'}
            onChange={(c: string) => updateOpts({ vahColor: c })}
            showLine={true}
            lineWidth={opts.vahWidth || 1}
            lineStyle={opts.vahStyle || 'solid'}
            onLineWidthChange={(w: number) => updateOpts({ vahWidth: w })}
            onLineStyleChange={(s: 'solid' | 'dashed' | 'dotted') => updateOpts({ vahStyle: s })}
            title="VAH Line Color & Style"
          />
        </div>

        {/* 3. VAL */}
        <div className="flex items-center justify-between">
          <label className="flex items-center space-x-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={!!opts.showVAL}
              onChange={(e) => updateOpts({ showVAL: e.target.checked })}
              className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
            />
            <span className="text-[#d1d4dc]">VAL</span>
          </label>
          <ColorPickerPopover
            color={opts.valColor || '#089981'}
            onChange={(c: string) => updateOpts({ valColor: c })}
            showLine={true}
            lineWidth={opts.valWidth || 1}
            lineStyle={opts.valStyle || 'solid'}
            onLineWidthChange={(w: number) => updateOpts({ valWidth: w })}
            onLineStyleChange={(s: 'solid' | 'dashed' | 'dotted') => updateOpts({ valStyle: s })}
            title="VAL Line Color & Style"
          />
        </div>

        {/* 4. POC (checked by default) */}
        <div className="flex items-center justify-between">
          <label className="flex items-center space-x-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={opts.showPOC !== false}
              onChange={(e) => updateOpts({ showPOC: e.target.checked })}
              className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
            />
            <span className="text-[#d1d4dc]">POC</span>
          </label>
          <ColorPickerPopover
            color={opts.pocColor || '#f23645'}
            onChange={(c: string) => updateOpts({ pocColor: c })}
            showLine={true}
            lineWidth={opts.pocWidth || 1}
            lineStyle={opts.pocStyle || 'solid'}
            onLineWidthChange={(w: number) => updateOpts({ pocWidth: w })}
            onLineStyleChange={(s: 'solid' | 'dashed' | 'dotted') => updateOpts({ pocStyle: s })}
            title="POC Line Color & Style"
          />
        </div>

        {/* 5. Developing POC */}
        <div className="flex items-center justify-between">
          <label className="flex items-center space-x-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={!!opts.showDevelopingPOC}
              onChange={(e) => updateOpts({ showDevelopingPOC: e.target.checked })}
              className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
            />
            <span className="text-[#d1d4dc]">Developing POC</span>
          </label>
          <ColorPickerPopover
            color={opts.devPocColor || '#ff9800'}
            onChange={(c: string) => updateOpts({ devPocColor: c })}
            showLine={true}
            lineWidth={opts.devPocWidth || 1}
            lineStyle={opts.devPocStyle || 'solid'}
            onLineWidthChange={(w: number) => updateOpts({ devPocWidth: w })}
            onLineStyleChange={(s: 'solid' | 'dashed' | 'dotted') => updateOpts({ devPocStyle: s })}
            title="Developing POC Color & Style"
          />
        </div>

        {/* 6. Developing VA */}
        <div className="flex items-center justify-between">
          <label className="flex items-center space-x-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={!!opts.showDevelopingVA}
              onChange={(e) => updateOpts({ showDevelopingVA: e.target.checked })}
              className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
            />
            <span className="text-[#d1d4dc]">Developing VA</span>
          </label>
          <ColorPickerPopover
            color={opts.devVaColor || '#00bcd4'}
            onChange={(c: string) => updateOpts({ devVaColor: c })}
            showLine={true}
            lineWidth={opts.devVaWidth || 1}
            lineStyle={opts.devVaStyle || 'solid'}
            onLineWidthChange={(w: number) => updateOpts({ devVaWidth: w })}
            onLineStyleChange={(s: 'solid' | 'dashed' | 'dotted') => updateOpts({ devVaStyle: s })}
            title="Developing VA Color & Style"
          />
        </div>

        {/* 7. Histogram Box */}
        <div className="flex items-center justify-between">
          <span className="text-[#d1d4dc]">Histogram Box</span>
          <ColorPickerPopover
            color={opts.histogramBoxColor || 'transparent'}
            onChange={(c: string) => updateOpts({ histogramBoxColor: c })}
            title="Histogram Box Color"
          />
        </div>
      </div>
    </div>
  );
};
