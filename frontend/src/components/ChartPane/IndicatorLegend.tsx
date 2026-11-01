import React, { useMemo } from 'react';
import { useSyncStore } from '../../store/syncStore';
import type { IndicatorInstance, IndicatorCategory } from '../../indicators/types';
import { Eye, EyeOff, Settings, X } from 'lucide-react';
import { isLightColor } from '../../utils/colorUtils';

interface IndicatorLegendItemProps {
  paneId: string;
  indicator: IndicatorInstance;
  values: Record<string, number | null>;
  precision: number;
}

export const IndicatorLegendItem: React.FC<IndicatorLegendItemProps> = ({
  paneId,
  indicator: ind,
  values,
  precision,
}) => {
  const toggleIndicatorVisibility = useSyncStore((s) => s.toggleIndicatorVisibility);
  const openIndicatorSettings = useSyncStore((s) => s.openIndicatorSettings);
  const removeIndicatorFromPane = useSyncStore((s) => s.removeIndicatorFromPane);
  const chartSettings = useSyncStore((s) => s.panes[paneId]?.settings || s.chartSettings);

  const isLightCanvas = useMemo(() => {
    return isLightColor(chartSettings?.canvasBgColor || '#131722');
  }, [chartSettings?.canvasBgColor]);

  // High contrast text colors:
  const textColor = useMemo(() => {
    if (isLightCanvas) {
      return isLightColor(chartSettings?.scalesTextColor) ? '#131722' : (chartSettings?.scalesTextColor || '#131722');
    }
    return !isLightColor(chartSettings?.scalesTextColor) && chartSettings?.scalesTextColor === '#131722'
      ? '#f0f3fa'
      : (chartSettings?.scalesTextColor || '#f0f3fa');
  }, [isLightCanvas, chartSettings?.scalesTextColor]);

  const paramsColor = isLightCanvas ? '#374151' : '#b2b5be';
  const buttonColor = isLightCanvas ? '#4b5563' : '#9ca3af';

  const statusTextSize = chartSettings?.scalesTextSize || 11;
  const primaryColor = Object.values(ind.styles)[0]?.color || '#2962ff';

  const paramsSummary =
    ind.type === 'volume'
      ? ind.styles?.ma?.visible
        ? String(ind.inputs?.maLength || 20)
        : ''
      : Object.values(ind.inputs || {})
          .filter((v) => typeof v !== 'boolean' || v === true)
          .join(' ');

  const formatPlotValue = (val: number, plotId: string) => {
    if (ind.type === 'volume' && plotId === 'vol') {
      if (Math.abs(val) >= 1_000_000) {
        return (val / 1_000_000).toFixed(2) + 'M';
      }
      if (Math.abs(val) >= 1_000) {
        return (val / 1_000).toFixed(2) + 'K';
      }
      return Math.round(val).toLocaleString();
    }
    return val.toFixed(precision);
  };

  const showBg = chartSettings?.statusShowIndicatorBackground !== false;
  const rawBgOpacity = (chartSettings?.statusIndicatorBgOpacity ?? 50) / 100;
  const bgOpacity = Math.max(0, Math.min(1, rawBgOpacity));

  const bgStyle = useMemo(() => {
    if (!showBg || bgOpacity <= 0) return {};
    if (isLightCanvas) {
      return {
        backgroundColor: `rgba(255, 255, 255, ${bgOpacity})`,
        border: `1px solid rgba(0, 0, 0, ${Math.min(0.12, bgOpacity * 0.16)})`,
        boxShadow: bgOpacity > 0.15 ? '0 1px 3px rgba(0, 0, 0, 0.06)' : 'none',
      };
    }
    return {
      backgroundColor: `rgba(20, 24, 35, ${bgOpacity})`,
      border: `1px solid rgba(255, 255, 255, ${Math.min(0.15, bgOpacity * 0.2)})`,
      boxShadow: bgOpacity > 0.15 ? '0 1px 3px rgba(0, 0, 0, 0.25)' : 'none',
    };
  }, [showBg, bgOpacity, isLightCanvas]);

  return (
    <div
      key={ind.id}
      className={`group flex items-center gap-1.5 px-2 py-0.5 rounded transition-all w-fit text-[11px] font-sans ${
        isLightCanvas ? 'hover:bg-black/5' : 'hover:bg-white/10'
      } backdrop-blur-xs`}
      style={{
        color: textColor,
        fontSize: `${statusTextSize}px`,
        ...bgStyle,
      }}
    >
      {/* Color Indicator Swatch */}
      <span
        className="w-2 h-2 rounded-full shrink-0 shadow-xs"
        style={{ backgroundColor: primaryColor }}
      />

      {/* Title & Params */}
      {chartSettings?.statusShowIndicatorTitles !== false && (
        <span
          className={`font-semibold cursor-pointer hover:underline ${
            ind.visible ? '' : 'line-through opacity-60'
          }`}
          style={{
            color: ind.visible ? textColor : `${textColor}99`,
            fontSize: `${statusTextSize}px`,
          }}
          onClick={() => openIndicatorSettings(paneId, ind.id)}
        >
          {ind.name}
        </span>
      )}
      {chartSettings?.statusShowIndicatorInputs !== false && paramsSummary && (
        <span
          className="font-mono font-medium"
          style={{
            color: paramsColor,
            fontSize: `${Math.max(9, statusTextSize - 1)}px`,
          }}
        >
          {paramsSummary}
        </span>
      )}

      {/* Readout Values */}
      {chartSettings?.statusShowIndicatorValues !== false && ind.visible && (
        <div
          className="flex items-center gap-1.5 font-mono tabular-nums font-semibold ml-1"
          style={{ fontSize: `${statusTextSize}px` }}
        >
          {Object.entries(values).map(([plotId, val]) => {
            if (val === null || val === undefined || isNaN(val)) return null;
            const isVolPlot = ind.type === 'volume' && plotId === 'vol';
            const color = isVolPlot
              ? (ind.styles[plotId]?.colorUp || '#089981')
              : (ind.styles[plotId]?.color || primaryColor || textColor);
            return (
              <span key={plotId} style={{ color }}>
                {formatPlotValue(val, plotId)}
              </span>
            );
          })}
        </div>
      )}

      {/* Actions: hidden when not hovered (removes empty space); appears on hover */}
      <div
        className={`items-center gap-1 ${
          !ind.visible ? 'flex ml-1.5' : 'hidden group-hover:flex ml-1.5'
        }`}
        style={{ color: buttonColor }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleIndicatorVisibility(paneId, ind.id);
          }}
          className={`p-0.5 rounded transition-colors cursor-pointer ${
            !ind.visible
              ? 'text-amber-500 hover:opacity-100'
              : isLightCanvas
              ? 'text-[#4b5563] hover:text-[#131722] hover:bg-black/10'
              : 'text-[#9ca3af] hover:text-white hover:bg-white/10'
          }`}
          title={ind.visible ? 'Hide indicator' : 'Show indicator'}
        >
          {ind.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            openIndicatorSettings(paneId, ind.id);
          }}
          className={`p-0.5 rounded transition-colors cursor-pointer ${
            !ind.visible ? 'hidden group-hover:block' : ''
          } ${
            isLightCanvas
              ? 'text-[#4b5563] hover:text-[#131722] hover:bg-black/10'
              : 'text-[#9ca3af] hover:text-white hover:bg-white/10'
          }`}
          title="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeIndicatorFromPane(paneId, ind.id);
          }}
          className={`p-0.5 rounded transition-colors cursor-pointer ${
            !ind.visible ? 'hidden group-hover:block' : ''
          } ${
            isLightCanvas
              ? 'text-[#4b5563] hover:text-[#f23645] hover:bg-red-500/10'
              : 'text-[#9ca3af] hover:text-[#f23645] hover:bg-red-500/15'
          }`}
          title="Remove"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

interface IndicatorLegendProps {
  paneId: string;
  values?: Record<string, Record<string, number | null>>;
  latestValues?: Record<string, Record<string, number | null>>;
  category?: IndicatorCategory;
  indicatorId?: string;
  precision: number;
}

export const IndicatorLegend: React.FC<IndicatorLegendProps> = ({
  paneId,
  values,
  latestValues,
  category,
  indicatorId,
  precision,
}) => {
  const indicatorsMap = useSyncStore((s) => s.indicators);
  const allIndicators = indicatorsMap[paneId] || [];

  const indicators = allIndicators.filter((ind) => {
    if (indicatorId && ind.id !== indicatorId) return false;
    if (category && ind.category !== category) return false;
    return true;
  });

  if (indicators.length === 0) return null;

  const activeValues = values || latestValues || {};

  return (
    <div className="flex flex-col gap-1 text-[11px] font-sans select-none pointer-events-auto">
      {indicators.map((ind) => (
        <IndicatorLegendItem
          key={ind.id}
          paneId={paneId}
          indicator={ind}
          values={activeValues[ind.id] || {}}
          precision={precision}
        />
      ))}
    </div>
  );
};
