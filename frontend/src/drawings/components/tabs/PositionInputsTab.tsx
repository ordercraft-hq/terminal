import React from 'react';
import type { UserDrawing } from '../../types';
import type { PositionOptions } from '../../tools/PositionTool';

interface PositionInputsTabProps {
  drawing: UserDrawing;
  onChange: (updates: Partial<UserDrawing>) => void;
  priceDecimals?: number;
}

export const PositionInputsTab: React.FC<PositionInputsTabProps> = ({
  drawing,
  onChange,
  priceDecimals = 2,
}) => {
  const opts = (drawing.options as PositionOptions) || {};
  const isLong = drawing.type === 'long_position';
  const anchors = drawing.anchors || [];

  const entryPrice = anchors[0]?.price ?? 0;
  const targetPrice = anchors[1]?.price ?? 0;
  const stopPrice = anchors[2]?.price ?? 0;

  const tickSize = Math.pow(10, -Math.min(6, Math.max(0, priceDecimals))) || 0.01;

  const profitTicks =
    tickSize > 0 ? Math.round(Math.abs(targetPrice - entryPrice) / tickSize) : 0;
  const stopTicks =
    tickSize > 0 ? Math.round(Math.abs(stopPrice - entryPrice) / tickSize) : 0;

  const updateOpts = (newOpts: Partial<PositionOptions>) => {
    onChange({
      options: {
        ...opts,
        ...newOpts,
      },
    });
  };

  const updateAnchorPrice = (index: number, newPrice: number) => {
    const nextAnchors = anchors.map((a, i) => (i === index ? { ...a, price: newPrice } : { ...a }));
    onChange({
      anchors: nextAnchors,
      options: {
        ...opts,
        entryPrice: index === 0 ? newPrice : opts.entryPrice,
        profitLevelPrice: index === 1 ? newPrice : opts.profitLevelPrice,
        stopLevelPrice: index === 2 ? newPrice : opts.stopLevelPrice,
      },
    });
  };

  const handleProfitTicksChange = (ticks: number) => {
    const safeTicks = Math.max(0, ticks);
    const newTarget = isLong ? entryPrice + safeTicks * tickSize : entryPrice - safeTicks * tickSize;
    updateAnchorPrice(1, parseFloat(newTarget.toFixed(priceDecimals)));
  };

  const handleStopTicksChange = (ticks: number) => {
    const safeTicks = Math.max(0, ticks);
    const newStop = isLong ? entryPrice - safeTicks * tickSize : entryPrice + safeTicks * tickSize;
    updateAnchorPrice(2, parseFloat(newStop.toFixed(priceDecimals)));
  };

  return (
    <div className="space-y-3.5 text-xs text-[#d1d4dc]">
      {/* 1. Account size */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-normal">Account size</label>
        <div className="flex items-center space-x-2">
          <input
            type="number"
            value={opts.accountSize ?? 100000}
            onChange={(e) => updateOpts({ accountSize: parseFloat(e.target.value) || 0 })}
            className="w-28 bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] focus:border-[#2962ff] rounded px-2.5 py-1 text-xs text-[#d1d4dc] outline-none font-mono"
          />
          <select
            value={opts.accountCurrency || 'Default'}
            onChange={(e) => updateOpts({ accountCurrency: e.target.value })}
            className="w-24 bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] rounded px-2 py-1 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff] cursor-pointer"
          >
            <option value="Default">Default</option>
            <option value="USDT">USDT</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="BTC">BTC</option>
            <option value="ETH">ETH</option>
          </select>
        </div>
      </div>

      {/* 2. Lot size */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-normal">Lot size</label>
        <input
          type="number"
          value={opts.lotSize ?? 1}
          onChange={(e) => updateOpts({ lotSize: parseFloat(e.target.value) || 1 })}
          className="w-32 bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] focus:border-[#2962ff] rounded px-2.5 py-1 text-xs text-[#d1d4dc] outline-none font-mono"
        />
      </div>

      {/* 3. Risk */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-normal">Risk</label>
        <div className="flex items-center space-x-2">
          <input
            type="number"
            value={opts.risk ?? 250}
            onChange={(e) => updateOpts({ risk: parseFloat(e.target.value) || 0 })}
            className="w-28 bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] focus:border-[#2962ff] rounded px-2.5 py-1 text-xs text-[#d1d4dc] outline-none font-mono"
          />
          <select
            value={opts.riskType || 'USDT'}
            onChange={(e) => updateOpts({ riskType: e.target.value as PositionOptions['riskType'] })}
            className="w-24 bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] rounded px-2 py-1 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff] cursor-pointer"
          >
            <option value="USDT">USDT</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="%">%</option>
            <option value="Cash">Cash</option>
          </select>
        </div>
      </div>

      {/* 4. Entry price */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-normal">Entry price</label>
        <input
          type="number"
          step="any"
          value={entryPrice}
          onChange={(e) => updateAnchorPrice(0, parseFloat(e.target.value) || 0)}
          className="w-32 bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] focus:border-[#2962ff] rounded px-2.5 py-1 text-xs text-[#d1d4dc] outline-none font-mono"
        />
      </div>

      {/* 5. Leverage */}
      <div className="flex items-center justify-between">
        <label className="text-[#d1d4dc] font-normal">Leverage</label>
        <input
          type="number"
          step="any"
          value={opts.leverage ?? 10000.0}
          onChange={(e) => updateOpts({ leverage: parseFloat(e.target.value) || 1 })}
          className="w-32 bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] focus:border-[#2962ff] rounded px-2.5 py-1 text-xs text-[#d1d4dc] outline-none font-mono"
        />
      </div>

      {/* PROFIT LEVEL SECTION */}
      <div className="pt-2 border-t border-[#2a2e39]/60">
        <div className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-2.5">
          Profit Level
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[#d1d4dc] font-normal">Ticks</label>
            <input
              type="number"
              value={profitTicks}
              onChange={(e) => handleProfitTicksChange(parseInt(e.target.value, 10) || 0)}
              className="w-32 bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] focus:border-[#2962ff] rounded px-2.5 py-1 text-xs text-[#d1d4dc] outline-none font-mono"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-[#d1d4dc] font-normal">Price</label>
            <input
              type="number"
              step="any"
              value={targetPrice}
              onChange={(e) => updateAnchorPrice(1, parseFloat(e.target.value) || 0)}
              className="w-32 bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] focus:border-[#2962ff] rounded px-2.5 py-1 text-xs text-[#d1d4dc] outline-none font-mono"
            />
          </div>
        </div>
      </div>

      {/* STOP LEVEL SECTION */}
      <div className="pt-2 border-t border-[#2a2e39]/60">
        <div className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-2.5">
          Stop Level
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[#d1d4dc] font-normal">Ticks</label>
            <input
              type="number"
              value={stopTicks}
              onChange={(e) => handleStopTicksChange(parseInt(e.target.value, 10) || 0)}
              className="w-32 bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] focus:border-[#2962ff] rounded px-2.5 py-1 text-xs text-[#d1d4dc] outline-none font-mono"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-[#d1d4dc] font-normal">Price</label>
            <input
              type="number"
              step="any"
              value={stopPrice}
              onChange={(e) => updateAnchorPrice(2, parseFloat(e.target.value) || 0)}
              className="w-32 bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] focus:border-[#2962ff] rounded px-2.5 py-1 text-xs text-[#d1d4dc] outline-none font-mono"
            />
          </div>
        </div>
      </div>

      {/* 6. QTY precision */}
      <div className="flex items-center justify-between pt-2 border-t border-[#2a2e39]/60">
        <label className="text-[#d1d4dc] font-normal">QTY precision</label>
        <select
          value={opts.qtyPrecision || 'Default'}
          onChange={(e) => updateOpts({ qtyPrecision: e.target.value })}
          className="w-32 bg-[#1e222d] border border-[#363a45] hover:border-[#787b86] rounded px-2.5 py-1 text-xs text-[#d1d4dc] outline-none focus:border-[#2962ff] cursor-pointer"
        >
          <option value="Default">Default</option>
          <option value="0">0</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
          <option value="6">6</option>
          <option value="7">7</option>
          <option value="8">8</option>
        </select>
      </div>
    </div>
  );
};
