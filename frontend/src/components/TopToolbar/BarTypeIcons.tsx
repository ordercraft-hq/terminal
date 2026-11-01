import React from 'react';
import type { ChartType } from '../../store/syncStore';

export interface BarTypeIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export const BarsIcon: React.FC<BarTypeIconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.6,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Left Bar (Close lower than open) */}
    <line x1="8" y1="4" x2="8" y2="20" />
    <line x1="4.5" y1="8" x2="8" y2="8" />
    <line x1="8" y1="16" x2="11.5" y2="16" />

    {/* Right Bar (Close higher than open) */}
    <line x1="16" y1="4" x2="16" y2="20" />
    <line x1="12.5" y1="14" x2="16" y2="14" />
    <line x1="16" y1="7" x2="19.5" y2="7" />
  </svg>
);

export const CandlesIcon: React.FC<BarTypeIconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.6,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Left Candle */}
    <line x1="7" y1="3" x2="7" y2="7" />
    <rect x="4.5" y="7" width="5" height="10" rx="0.5" />
    <line x1="7" y1="17" x2="7" y2="21" />

    {/* Right Candle */}
    <line x1="17" y1="3" x2="17" y2="9" />
    <rect x="14.5" y="9" width="5" height="8" rx="0.5" />
    <line x1="17" y1="17" x2="17" y2="21" />
  </svg>
);

export const HollowCandlesIcon: React.FC<BarTypeIconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.6,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Left Candle (Hollow / hatched) */}
    <line x1="7" y1="3" x2="7" y2="7" />
    <rect x="4.5" y="7" width="5" height="10" rx="0.5" strokeDasharray="1.5 1.5" />
    <line x1="7" y1="17" x2="7" y2="21" />

    {/* Right Candle (Hollow body) */}
    <line x1="17" y1="3" x2="17" y2="9" />
    <rect x="14.5" y="9" width="5" height="8" rx="0.5" />
    <line x1="14.5" y1="11" x2="19.5" y2="15" strokeWidth={1} />
    <line x1="17" y1="17" x2="17" y2="21" />
  </svg>
);

export const VolumeCandlesIcon: React.FC<BarTypeIconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.6,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Left Candle with Volume width */}
    <line x1="7" y1="3" x2="7" y2="6" />
    <rect x="4" y="6" width="6" height="12" rx="0.5" fill="currentColor" fillOpacity="0.25" />
    <line x1="7" y1="18" x2="7" y2="21" />

    {/* Right Candle with slimmer Volume width */}
    <line x1="17" y1="5" x2="17" y2="9" />
    <rect x="15" y="9" width="4" height="7" rx="0.5" />
    <line x1="17" y1="16" x2="17" y2="20" />
  </svg>
);

export const HlcBarsIcon: React.FC<BarTypeIconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.6,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Left HLC Bar (vertical with right tick only) */}
    <line x1="7" y1="5" x2="7" y2="19" />
    <line x1="7" y1="14" x2="11.5" y2="14" />

    {/* Right HLC Bar (vertical with right tick only) */}
    <line x1="16" y1="3" x2="16" y2="21" />
    <line x1="16" y1="9" x2="20.5" y2="9" />
  </svg>
);

export const LineIcon: React.FC<BarTypeIconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <polyline points="3 17 9 11 14 15 21 7" />
  </svg>
);

export const LineWithMarkersIcon: React.FC<BarTypeIconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <polyline points="3 17 9 11 14 15 21 7" />
    <circle cx="3" cy="17" r="1.5" fill="currentColor" />
    <circle cx="9" cy="11" r="1.5" fill="currentColor" />
    <circle cx="14" cy="15" r="1.5" fill="currentColor" />
    <circle cx="21" cy="7" r="1.5" fill="currentColor" />
  </svg>
);

export const StepLineIcon: React.FC<BarTypeIconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <polyline points="3 19 8 19 8 13 15 13 15 6 21 6" />
  </svg>
);

export const AreaIcon: React.FC<BarTypeIconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.8,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path
      d="M3 17 L9 11 L14 15 L21 7 L21 21 L3 21 Z"
      fill="currentColor"
      fillOpacity="0.25"
      stroke="none"
    />
    <polyline points="3 17 9 11 14 15 21 7" />
  </svg>
);

export const BaselineIcon: React.FC<BarTypeIconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.6,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Center dashed baseline */}
    <line x1="3" y1="12" x2="21" y2="12" strokeDasharray="2 2" strokeOpacity="0.6" />
    {/* Area line moving above and below baseline */}
    <polyline points="3 15 8 7 13 16 18 8 21 11" />
  </svg>
);

export const HighLowIcon: React.FC<BarTypeIconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.6,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Left Range Bar */}
    <line x1="5" y1="6" x2="9" y2="6" />
    <line x1="7" y1="6" x2="7" y2="18" />
    <line x1="5" y1="18" x2="9" y2="18" />

    {/* Right Range Bar */}
    <line x1="15" y1="4" x2="19" y2="4" />
    <line x1="17" y1="4" x2="17" y2="20" />
    <line x1="15" y1="20" x2="19" y2="20" />
  </svg>
);

export const HeikinAshiIcon: React.FC<BarTypeIconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.6,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* Twin Heikin Ashi Candles */}
    <line x1="7" y1="4" x2="7" y2="7" />
    <rect x="5" y="7" width="4" height="12" rx="0.5" />
    <line x1="7" y1="19" x2="7" y2="21" />

    <line x1="16" y1="3" x2="16" y2="6" />
    <rect x="14" y="6" width="4" height="10" rx="0.5" fill="currentColor" fillOpacity="0.3" />
    <line x1="16" y1="16" x2="16" y2="19" />
  </svg>
);

export const RenkoIcon: React.FC<BarTypeIconProps> = ({
  size = 16,
  className = '',
  strokeWidth = 1.5,
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {/* 3 Stepped Diagonal Bricks */}
    <rect x="4" y="14" width="5" height="6" rx="0.5" />
    <rect x="9.5" y="9" width="5" height="6" rx="0.5" />
    <rect x="15" y="4" width="5" height="6" rx="0.5" />
  </svg>
);

export const BarTypeIcon: React.FC<{
  type: ChartType;
  size?: number;
  className?: string;
  strokeWidth?: number;
}> = ({ type, size = 16, className = '', strokeWidth = 1.6 }) => {
  switch (type) {
    case 'bars':
      return <BarsIcon size={size} className={className} strokeWidth={strokeWidth} />;
    case 'candles':
      return <CandlesIcon size={size} className={className} strokeWidth={strokeWidth} />;
    case 'hollow_candles':
      return <HollowCandlesIcon size={size} className={className} strokeWidth={strokeWidth} />;
    case 'volume_candles':
      return <VolumeCandlesIcon size={size} className={className} strokeWidth={strokeWidth} />;
    case 'hlc_bars':
      return <HlcBarsIcon size={size} className={className} strokeWidth={strokeWidth} />;
    case 'line':
      return <LineIcon size={size} className={className} strokeWidth={strokeWidth} />;
    case 'line_with_markers':
      return <LineWithMarkersIcon size={size} className={className} strokeWidth={strokeWidth} />;
    case 'step_line':
      return <StepLineIcon size={size} className={className} strokeWidth={strokeWidth} />;
    case 'area':
      return <AreaIcon size={size} className={className} strokeWidth={strokeWidth} />;
    case 'baseline':
      return <BaselineIcon size={size} className={className} strokeWidth={strokeWidth} />;
    case 'high_low':
      return <HighLowIcon size={size} className={className} strokeWidth={strokeWidth} />;
    case 'heikin_ashi':
      return <HeikinAshiIcon size={size} className={className} strokeWidth={strokeWidth} />;
    case 'renko':
      return <RenkoIcon size={size} className={className} strokeWidth={strokeWidth} />;
    default:
      return <CandlesIcon size={size} className={className} strokeWidth={strokeWidth} />;
  }
};

export interface BarTypeItem {
  id: ChartType;
  label: string;
  category: 'candles_bars' | 'lines' | 'area_bands' | 'exotic';
}

export const BAR_TYPE_CATEGORIES: {
  category: 'candles_bars' | 'lines' | 'area_bands' | 'exotic';
  label: string;
  items: BarTypeItem[];
}[] = [
  {
    category: 'candles_bars',
    label: 'Candles & Bars',
    items: [
      { id: 'bars', label: 'Bars', category: 'candles_bars' },
      { id: 'candles', label: 'Candles', category: 'candles_bars' },
      { id: 'hollow_candles', label: 'Hollow candles', category: 'candles_bars' },
      { id: 'volume_candles', label: 'Volume candles', category: 'candles_bars' },
      { id: 'hlc_bars', label: 'HLC bars', category: 'candles_bars' },
    ],
  },
  {
    category: 'lines',
    label: 'Lines',
    items: [
      { id: 'line', label: 'Line', category: 'lines' },
      { id: 'line_with_markers', label: 'Line with markers', category: 'lines' },
      { id: 'step_line', label: 'Step line', category: 'lines' },
    ],
  },
  {
    category: 'area_bands',
    label: 'Area & Baseline',
    items: [
      { id: 'area', label: 'Area', category: 'area_bands' },
      { id: 'baseline', label: 'Baseline', category: 'area_bands' },
      { id: 'high_low', label: 'High-low', category: 'area_bands' },
    ],
  },
  {
    category: 'exotic',
    label: 'Exotic',
    items: [
      { id: 'heikin_ashi', label: 'Heikin Ashi', category: 'exotic' },
      { id: 'renko', label: 'Renko', category: 'exotic' },
    ],
  },
];
