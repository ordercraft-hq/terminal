export type IndicatorType =
  // Overlays (Main Pane 0)
  | 'volume'
  | 'sma'
  | 'ema'
  | 'wma'
  | 'hma'
  | 'vwap'
  | 'bollinger_bands'
  | 'keltner_channels'
  | 'supertrend'
  | 'parabolic_sar'
  // Sub-Panes (Oscillators, paneIndex > 0)
  | 'rsi'
  | 'macd'
  | 'stochastic'
  | 'stoch_rsi'
  | 'atr'
  | 'cci'
  | 'williams_r'
  | 'adx'
  | 'obv';

export type IndicatorCategory = 'overlay' | 'subpane';

export type IndicatorPlotType = 'line' | 'stepline' | 'histogram' | 'cross' | 'circles';

export interface IndicatorPlotStyle {
  color: string;
  colorUp?: string;
  colorDown?: string;
  lineWidth: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  plotType?: IndicatorPlotType;
  visible?: boolean;
  lastValueVisible?: boolean;
  priceLineVisible?: boolean;
}

export interface IndicatorBandStyle {
  id: string;
  upperPlotId: string;
  lowerPlotId: string;
  fillColor: string;
  visible?: boolean;
}

export interface IndicatorLevelStyle {
  value: number;
  color: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  lineWidth?: number;
  label?: string;
  visible?: boolean;
}

export interface IndicatorInputSchema {
  id: string;
  name: string;
  type: 'number' | 'select' | 'source';
  default: any;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: any }[];
}

export interface IndicatorDefinition {
  type: IndicatorType;
  name: string;
  shortName: string;
  category: IndicatorCategory;
  description: string;
  defaultInputs: Record<string, any>;
  inputSchemas: IndicatorInputSchema[];
  defaultStyles: Record<string, IndicatorPlotStyle>;
  plotLabels: Record<string, string>;
  defaultLevels?: IndicatorLevelStyle[];
  defaultBands?: IndicatorBandStyle[];
}

export interface IndicatorInstance {
  id: string;
  type: IndicatorType;
  paneId: string;
  name: string;
  category: IndicatorCategory;
  visible: boolean;
  inputs: Record<string, any>;
  styles: Record<string, IndicatorPlotStyle>;
  levels?: IndicatorLevelStyle[];
  bands?: IndicatorBandStyle[];
}

export interface IndicatorPlotDataPoint {
  time: number;
  value: number;
  color?: string; // Optional custom bar/point color (e.g. for MACD histogram or SuperTrend)
}

export interface IndicatorCalculationResult {
  plots: Record<string, IndicatorPlotDataPoint[]>;
}
