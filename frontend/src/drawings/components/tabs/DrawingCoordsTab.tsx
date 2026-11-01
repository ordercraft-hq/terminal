import React from 'react';
import type { UserDrawing, LogicalAnchor } from '../../types';

interface DrawingCoordsTabProps {
  drawing: UserDrawing;
  onChange: (updates: Partial<UserDrawing>) => void;
  priceDecimals?: number;
}

export const DrawingCoordsTab: React.FC<DrawingCoordsTabProps> = ({
  drawing,
  onChange,
  priceDecimals = 2,
}) => {
  const anchors = drawing.anchors || [];

  const handlePriceChange = (index: number, newPrice: number) => {
    if (isNaN(newPrice)) return;
    const nextAnchors: LogicalAnchor[] = [...anchors];
    if (nextAnchors[index]) {
      nextAnchors[index] = {
        ...nextAnchors[index],
        price: newPrice,
      };
      onChange({ anchors: nextAnchors });
    }
  };

  const handleTimeChange = (index: number, newTime: number) => {
    if (isNaN(newTime)) return;
    const nextAnchors: LogicalAnchor[] = [...anchors];
    if (nextAnchors[index]) {
      nextAnchors[index] = {
        ...nextAnchors[index],
        time: newTime,
      };
      onChange({ anchors: nextAnchors });
    }
  };

  const formatIsoDate = (timestampSec: number) => {
    try {
      const d = new Date(timestampSec * 1000);
      return d.toISOString().replace('T', ' ').substring(0, 19);
    } catch {
      return `${timestampSec}`;
    }
  };

  const parseIsoDate = (str: string): number | null => {
    try {
      const ms = Date.parse(str);
      if (!isNaN(ms)) return Math.floor(ms / 1000);
    } catch {}
    return null;
  };

  return (
    <div className="space-y-4 text-xs text-[#d1d4dc]">
      {anchors.map((anchor, idx) => (
        <div key={idx} className="p-3 bg-[#131722] rounded border border-[#2a2e39] space-y-2.5">
          <div className="font-semibold text-[#d1d4dc] text-[11px] uppercase tracking-wider">
            {drawing.type === 'horizontal_line' || drawing.type === 'horizontal_ray' || drawing.type === 'vertical_line' || drawing.type === 'cross_line' ? 'Coordinates' : `Point ${idx + 1}`}
          </div>

          <div className={drawing.type === 'horizontal_line' || drawing.type === 'vertical_line' ? 'grid grid-cols-1' : 'grid grid-cols-2 gap-3'}>
            {/* Price Input (hidden for vertical line) */}
            {drawing.type !== 'vertical_line' && (
              <div>
                <label className="block text-[11px] text-[#787b86] mb-1">Price</label>
                <input
                  type="number"
                  step={Math.pow(10, -priceDecimals)}
                  value={anchor.price}
                  onChange={(e) => handlePriceChange(idx, parseFloat(e.target.value))}
                  className="w-full bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] focus:border-[#2962ff] rounded px-2.5 py-1.5 text-xs text-[#d1d4dc] font-mono outline-none"
                />
              </div>
            )}

            {/* Date/Time Input (hidden for horizontal line) */}
            {drawing.type !== 'horizontal_line' && (
              <div>
                <label className="block text-[11px] text-[#787b86] mb-1">Time (UTC)</label>
                <input
                  type="text"
                  defaultValue={formatIsoDate(anchor.time)}
                  onBlur={(e) => {
                    const parsed = parseIsoDate(e.target.value);
                    if (parsed !== null) {
                      handleTimeChange(idx, parsed);
                    }
                  }}
                  className="w-full bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] focus:border-[#2962ff] rounded px-2.5 py-1.5 text-xs text-[#d1d4dc] font-mono outline-none"
                  placeholder="YYYY-MM-DD HH:MM:SS"
                />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
