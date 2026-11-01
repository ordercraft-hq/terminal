import React from 'react';
import type { UserDrawing, AnchoredVWAPOptions } from '../../types';
import { ColorPickerPopover } from '../../../components/Common/ColorPickerPopover';

interface AnchoredVWAPStyleTabProps {
  drawing: UserDrawing;
  onChange: (updates: Partial<UserDrawing>) => void;
}

export const AnchoredVWAPStyleTab: React.FC<AnchoredVWAPStyleTabProps> = ({
  drawing,
  onChange,
}) => {
  const opts = (drawing.options as AnchoredVWAPOptions) || {};
  const mainColor = drawing.color || opts.color || '#2962ff';
  const mainWidth = drawing.lineWidth || opts.lineWidth || 1;
  const mainStyle = drawing.lineStyle || opts.lineStyle || 'solid';

  const updateOpts = (newOpts: Partial<AnchoredVWAPOptions>) => {
    onChange({
      options: {
        ...opts,
        ...newOpts,
      },
    });
  };

  return (
    <div className="space-y-3 text-xs text-[#d1d4dc] py-1 select-none">
      {/* 1. VWAP Main Line */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-normal">VWAP</label>
        <ColorPickerPopover
          color={mainColor}
          onChange={(c) => {
            onChange({ color: c });
            updateOpts({ color: c });
          }}
          showLine={true}
          lineWidth={mainWidth}
          lineStyle={mainStyle}
          onLineWidthChange={(w) => {
            onChange({ lineWidth: w });
            updateOpts({ lineWidth: w });
          }}
          onLineStyleChange={(s) => {
            onChange({ lineStyle: s });
            updateOpts({ lineStyle: s });
          }}
          title="VWAP Line Color & Style"
        />
      </div>

      {/* 2. Lower band #1 */}
      <div className="flex items-center justify-between">
        <label className="flex items-center space-x-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={opts.showLowerBand1 !== false}
            onChange={(e) => updateOpts({ showLowerBand1: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[#d1d4dc]">Lower band #1</span>
        </label>
        <ColorPickerPopover
          color={opts.lowerBand1Color || '#089981'}
          onChange={(c) => updateOpts({ lowerBand1Color: c })}
          showLine={true}
          lineWidth={opts.lowerBand1Width || 1}
          lineStyle={opts.lowerBand1Style || 'solid'}
          onLineWidthChange={(w) => updateOpts({ lowerBand1Width: w })}
          onLineStyleChange={(s) => updateOpts({ lowerBand1Style: s })}
          title="Lower Band #1 Color"
        />
      </div>

      {/* 3. Upper band #1 */}
      <div className="flex items-center justify-between">
        <label className="flex items-center space-x-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={opts.showUpperBand1 !== false}
            onChange={(e) => updateOpts({ showUpperBand1: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[#d1d4dc]">Upper band #1</span>
        </label>
        <ColorPickerPopover
          color={opts.upperBand1Color || '#089981'}
          onChange={(c) => updateOpts({ upperBand1Color: c })}
          showLine={true}
          lineWidth={opts.upperBand1Width || 1}
          lineStyle={opts.upperBand1Style || 'solid'}
          onLineWidthChange={(w) => updateOpts({ upperBand1Width: w })}
          onLineStyleChange={(s) => updateOpts({ upperBand1Style: s })}
          title="Upper Band #1 Color"
        />
      </div>

      {/* 4. Background #1 */}
      <div className="flex items-center justify-between">
        <label className="flex items-center space-x-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={opts.showBackground1 !== false}
            onChange={(e) => updateOpts({ showBackground1: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[#d1d4dc]">Background #1</span>
        </label>
        <ColorPickerPopover
          color={opts.background1Color || 'rgba(8, 153, 129, 0.12)'}
          onChange={(c) => updateOpts({ background1Color: c })}
          title="Background #1 Fill Color & Opacity"
        />
      </div>

      {/* 5. Lower band #2 */}
      <div className="flex items-center justify-between">
        <label className="flex items-center space-x-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={opts.showLowerBand2 !== false}
            onChange={(e) => updateOpts({ showLowerBand2: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[#d1d4dc]">Lower band #2</span>
        </label>
        <ColorPickerPopover
          color={opts.lowerBand2Color || '#c5a61e'}
          onChange={(c) => updateOpts({ lowerBand2Color: c })}
          showLine={true}
          lineWidth={opts.lowerBand2Width || 1}
          lineStyle={opts.lowerBand2Style || 'solid'}
          onLineWidthChange={(w) => updateOpts({ lowerBand2Width: w })}
          onLineStyleChange={(s) => updateOpts({ lowerBand2Style: s })}
          title="Lower Band #2 Color"
        />
      </div>

      {/* 6. Upper band #2 */}
      <div className="flex items-center justify-between">
        <label className="flex items-center space-x-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={opts.showUpperBand2 !== false}
            onChange={(e) => updateOpts({ showUpperBand2: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[#d1d4dc]">Upper band #2</span>
        </label>
        <ColorPickerPopover
          color={opts.upperBand2Color || '#c5a61e'}
          onChange={(c) => updateOpts({ upperBand2Color: c })}
          showLine={true}
          lineWidth={opts.upperBand2Width || 1}
          lineStyle={opts.upperBand2Style || 'solid'}
          onLineWidthChange={(w) => updateOpts({ upperBand2Width: w })}
          onLineStyleChange={(s) => updateOpts({ upperBand2Style: s })}
          title="Upper Band #2 Color"
        />
      </div>

      {/* 7. Lower band #3 */}
      <div className="flex items-center justify-between">
        <label className="flex items-center space-x-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={opts.showLowerBand3 !== false}
            onChange={(e) => updateOpts({ showLowerBand3: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[#d1d4dc]">Lower band #3</span>
        </label>
        <ColorPickerPopover
          color={opts.lowerBand3Color || '#00897b'}
          onChange={(c) => updateOpts({ lowerBand3Color: c })}
          showLine={true}
          lineWidth={opts.lowerBand3Width || 1}
          lineStyle={opts.lowerBand3Style || 'solid'}
          onLineWidthChange={(w) => updateOpts({ lowerBand3Width: w })}
          onLineStyleChange={(s) => updateOpts({ lowerBand3Style: s })}
          title="Lower Band #3 Color"
        />
      </div>

      {/* 8. Upper band #3 */}
      <div className="flex items-center justify-between">
        <label className="flex items-center space-x-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={opts.showUpperBand3 !== false}
            onChange={(e) => updateOpts({ showUpperBand3: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[#d1d4dc]">Upper band #3</span>
        </label>
        <ColorPickerPopover
          color={opts.upperBand3Color || '#00897b'}
          onChange={(c) => updateOpts({ upperBand3Color: c })}
          showLine={true}
          lineWidth={opts.upperBand3Width || 1}
          lineStyle={opts.upperBand3Style || 'solid'}
          onLineWidthChange={(w) => updateOpts({ upperBand3Width: w })}
          onLineStyleChange={(s) => updateOpts({ upperBand3Style: s })}
          title="Upper Band #3 Color"
        />
      </div>

      {/* 9. Price label */}
      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center space-x-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={opts.showPriceLabel !== false}
            onChange={(e) => updateOpts({ showPriceLabel: e.target.checked })}
            className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
          />
          <span className="text-[#d1d4dc]">Price label</span>
        </label>
      </div>
    </div>
  );
};
