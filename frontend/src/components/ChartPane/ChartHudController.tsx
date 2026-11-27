import React, { useSyncExternalStore } from 'react';
import type { Candle } from '../../transport/client';
import type { IndicatorInstance } from '../../indicators/types';
import { isVolumeIndicatorType } from '../../indicators/UniversalIndicatorConnector';
import { IndicatorLegend, IndicatorLegendItem } from './IndicatorLegend';

export interface OhlcHudValues {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
}

export type IndicatorValuesMap = Record<string, Record<string, number | null>>;

function ohlcEquals(a: OhlcHudValues | null, b: OhlcHudValues | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.open === b.open &&
    a.high === b.high &&
    a.low === b.low &&
    a.close === b.close &&
    a.volume === b.volume &&
    a.change === b.change &&
    a.changePercent === b.changePercent
  );
}

/**
 * External store isolating high-frequency crosshair/live OHLC & indicator value
 * updates from ChartPane's React component tree so panning/moving never re-renders ChartPane.
 */
export class ChartHudController {
  private hoveredOHLC: OhlcHudValues | null = null;
  private syncHoveredOHLC: OhlcHudValues | null = null;
  private liveOHLC: OhlcHudValues | null = null;
  private hoveredIndicatorValues: IndicatorValuesMap | null = null;
  private indicatorLatestValues: IndicatorValuesMap = {};
  private lastCandleFallback: OhlcHudValues | null = null;

  private ohlcVersion = 0;
  private indVersion = 0;
  private ohlcListeners = new Set<() => void>();
  private indListeners = new Set<() => void>();

  public subscribeOhlc = (listener: () => void): (() => void) => {
    this.ohlcListeners.add(listener);
    return () => {
      this.ohlcListeners.delete(listener);
    };
  };

  public subscribeIndicators = (listener: () => void): (() => void) => {
    this.indListeners.add(listener);
    return () => {
      this.indListeners.delete(listener);
    };
  };

  public getOhlcVersion = (): number => this.ohlcVersion;
  public getIndicatorVersion = (): number => this.indVersion;

  private emitOhlc(): void {
    this.ohlcVersion++;
    for (const l of this.ohlcListeners) l();
  }

  private emitIndicators(): void {
    this.indVersion++;
    for (const l of this.indListeners) l();
  }

  public setHoveredOHLC(next: OhlcHudValues | null): void {
    if (ohlcEquals(this.hoveredOHLC, next)) return;
    this.hoveredOHLC = next;
    this.emitOhlc();
  }

  public setSyncHoveredOHLC(next: OhlcHudValues | null): void {
    if (ohlcEquals(this.syncHoveredOHLC, next)) return;
    this.syncHoveredOHLC = next;
    this.emitOhlc();
  }

  public setLiveOHLC(next: OhlcHudValues | null): void {
    if (ohlcEquals(this.liveOHLC, next)) return;
    this.liveOHLC = next;
    this.lastCandleFallback = next;
    this.emitOhlc();
  }

  public syncFallbackFromCandles(candles: readonly Candle[]): void {
    if (candles.length === 0) {
      if (this.lastCandleFallback !== null) {
        this.lastCandleFallback = null;
        this.emitOhlc();
      }
      return;
    }
    const last = candles[candles.length - 1];
    const change = last.close - last.open;
    const changePercent = last.open !== 0 ? (change / last.open) * 100 : 0;
    const next: OhlcHudValues = {
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
      volume: last.volume,
      change,
      changePercent,
    };
    if (!ohlcEquals(this.lastCandleFallback, next)) {
      this.lastCandleFallback = next;
      if (!this.hoveredOHLC && !this.liveOHLC) {
        this.emitOhlc();
      }
    }
  }

  public setHoveredIndicatorValues(next: IndicatorValuesMap | null): void {
    if (this.hoveredIndicatorValues === next) return;
    this.hoveredIndicatorValues = next;
    this.emitIndicators();
  }

  public setIndicatorLatestValues(next: IndicatorValuesMap): void {
    if (this.indicatorLatestValues === next) return;
    this.indicatorLatestValues = next;
    if (!this.hoveredIndicatorValues) {
      this.emitIndicators();
    }
  }

  public getDisplayOHLC(crosshairLock: boolean): OhlcHudValues | null {
    if (this.hoveredOHLC) return this.hoveredOHLC;
    if (crosshairLock && this.syncHoveredOHLC) return this.syncHoveredOHLC;
    if (this.liveOHLC) return this.liveOHLC;
    return this.lastCandleFallback;
  }

  public getDisplayIndicatorValues(): IndicatorValuesMap {
    return this.hoveredIndicatorValues || this.indicatorLatestValues;
  }
}

interface ChartOhlcReadoutProps {
  controller: ChartHudController;
  crosshairLock: boolean;
  pricePrecision: number;
  statusTextColor: string;
  statusTextSize: number;
  showChartValues: boolean;
  showBarChange: boolean;
  showVolume: boolean;
}

export const ChartOhlcReadout: React.FC<ChartOhlcReadoutProps> = React.memo(({
  controller,
  crosshairLock,
  pricePrecision,
  statusTextColor,
  statusTextSize,
  showChartValues,
  showBarChange,
  showVolume,
}) => {
  useSyncExternalStore(controller.subscribeOhlc, controller.getOhlcVersion);
  const displayOHLC = controller.getDisplayOHLC(crosshairLock);
  if (!displayOHLC) return null;

  return (
    <div
      className="flex items-center space-x-2 tabular-nums text-[11px]"
      style={{ fontSize: `${statusTextSize}px` }}
    >
      {showChartValues && (
        <>
          <span style={{ color: statusTextColor }}>
            <span className="opacity-75 font-normal">O</span>{' '}
            <span className="font-medium">{displayOHLC.open.toFixed(pricePrecision)}</span>
          </span>
          <span style={{ color: statusTextColor }}>
            <span className="opacity-75 font-normal">H</span>{' '}
            <span className="font-medium">{displayOHLC.high.toFixed(pricePrecision)}</span>
          </span>
          <span style={{ color: statusTextColor }}>
            <span className="opacity-75 font-normal">L</span>{' '}
            <span className="font-medium">{displayOHLC.low.toFixed(pricePrecision)}</span>
          </span>
          <span style={{ color: statusTextColor }}>
            <span className="opacity-75 font-normal">C</span>{' '}
            <span className="font-medium">{displayOHLC.close.toFixed(pricePrecision)}</span>
          </span>
        </>
      )}
      {showBarChange && (
        <span
          className={`font-medium ${
            displayOHLC.change >= 0 ? 'text-[#089981]' : 'text-[#f23645]'
          }`}
        >
          {displayOHLC.change >= 0 ? '+' : ''}
          {displayOHLC.change.toFixed(pricePrecision)} ({displayOHLC.change >= 0 ? '+' : ''}
          {displayOHLC.changePercent.toFixed(2)}%)
        </span>
      )}
      {showVolume && (
        <span style={{ color: statusTextColor }}>
          <span className="opacity-75 font-normal">Vol</span>{' '}
          <span className="font-medium">{displayOHLC.volume.toLocaleString()}</span>
        </span>
      )}
    </div>
  );
});

interface ChartOverlayLegendProps {
  controller: ChartHudController;
  paneId: string;
  precision: number;
}

export const ChartOverlayLegend: React.FC<ChartOverlayLegendProps> = React.memo(({
  controller,
  paneId,
  precision,
}) => {
  useSyncExternalStore(controller.subscribeIndicators, controller.getIndicatorVersion);
  return (
    <IndicatorLegend
      paneId={paneId}
      category="overlay"
      values={controller.getDisplayIndicatorValues()}
      precision={precision}
    />
  );
});

interface ChartSubpaneLegendItemProps {
  controller: ChartHudController;
  paneId: string;
  indicator: IndicatorInstance;
  precision: number;
}

export const ChartSubpaneLegendItem: React.FC<ChartSubpaneLegendItemProps> = React.memo(({
  controller,
  paneId,
  indicator,
  precision,
}) => {
  useSyncExternalStore(controller.subscribeIndicators, controller.getIndicatorVersion);
  const allVals = controller.getDisplayIndicatorValues();
  return (
    <IndicatorLegendItem
      paneId={paneId}
      indicator={indicator}
      values={allVals[indicator.id] || {}}
      precision={precision}
    />
  );
});

interface ChartCollapsedIndicatorValuesProps {
  controller: ChartHudController;
  indicator: IndicatorInstance;
}

export const ChartCollapsedIndicatorValues: React.FC<ChartCollapsedIndicatorValuesProps> = React.memo(({
  controller,
  indicator: ind,
}) => {
  useSyncExternalStore(controller.subscribeIndicators, controller.getIndicatorVersion);
  const values = controller.getDisplayIndicatorValues()[ind.id] || {};
  return (
    <div className="flex items-center space-x-2 font-mono tabular-nums text-[11px] truncate">
      {Object.entries(values).map(([plotKey, val]) => {
        const style = ind.styles[plotKey];
        const color = style?.color || '#2962ff';
        const formatted =
          val !== null && val !== undefined && !isNaN(val)
            ? isVolumeIndicatorType(ind.type) && plotKey === 'vol'
              ? Math.abs(val) >= 1_000_000
                ? (val / 1_000_000).toFixed(2) + 'M'
                : Math.abs(val) >= 1_000
                ? (val / 1_000).toFixed(2) + 'K'
                : Math.round(val).toLocaleString()
              : val.toFixed(2)
            : '—';
        return (
          <span key={plotKey} style={{ color }}>
            {formatted}
          </span>
        );
      })}
    </div>
  );
});
