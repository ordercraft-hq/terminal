import React from 'react';
import {
  TrendingUp,
  ArrowUpRight,
  Square,
  TrendingDown,
  Ruler,
  Circle,
  Maximize2,
  Calendar,
  Info,
  Layers,
  MousePointer,
} from 'lucide-react';
import type { FavoriteItemType } from '../store/syncStore';

export interface DrawingIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * 0. Cursor / Crosshair Modes
 */
export const CrossCursorIcon: React.FC<DrawingIconProps> = ({
  size = 15,
  className = '',
  strokeWidth = 1.75,
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
    {/* Left horizontal dash */}
    <line x1="3" y1="12" x2="8.5" y2="12" />
    {/* Right horizontal dash */}
    <line x1="15.5" y1="12" x2="21" y2="12" />
    {/* Top vertical dash */}
    <line x1="12" y1="3" x2="12" y2="8.5" />
    {/* Bottom vertical dash */}
    <line x1="12" y1="15.5" x2="12" y2="21" />
  </svg>
);

export const DotCursorIcon: React.FC<DrawingIconProps> = ({
  size = 15,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    {...props}
  >
    <circle cx="12" cy="12" r="3.2" />
  </svg>
);

export const ArrowCursorIcon: React.FC<DrawingIconProps> = ({
  size = 15,
  className = '',
  ...props
}) => (
  <MousePointer size={size} className={className} {...props} />
);

/**
 * 1. Trend Line (Diagonal line with circular anchor handles on both ends)
 */
export const TrendlineIcon: React.FC<DrawingIconProps> = ({
  size = 15,
  className = '',
  strokeWidth = 1.75,
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
    {/* Bottom-left anchor circle */}
    <circle cx="5.5" cy="18.5" r="2.2" />
    {/* Connecting diagonal line */}
    <line x1="7.1" y1="16.9" x2="16.9" y2="7.1" />
    {/* Top-right anchor circle */}
    <circle cx="18.5" cy="5.5" r="2.2" />
  </svg>
);

/**
 * 2. Ray
 */
export const RayIcon: React.FC<DrawingIconProps> = ({ size = 15, className = '', ...props }) => (
  <ArrowUpRight size={size} className={className} {...props} />
);

/**
 * 3. Info Line
 */
export const InfoLineIcon: React.FC<DrawingIconProps> = ({ size = 15, className = '', ...props }) => (
  <Info size={size} className={className} {...props} />
);

/**
 * 4. Horizontal Line
 */
export const HorizontalLineIcon: React.FC<DrawingIconProps> = ({
  size = 15,
  className = '',
  strokeWidth = 1.75,
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
    <line x1="3" y1="12" x2="21" y2="12" />
    <circle cx="12" cy="12" r="2.2" />
  </svg>
);

/**
 * 5. Horizontal Ray
 */
export const HorizontalRayIcon: React.FC<DrawingIconProps> = ({
  size = 15,
  className = '',
  strokeWidth = 1.75,
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
    {/* Left anchor handle point */}
    <circle cx="5" cy="12" r="2.2" />
    {/* Horizontal ray shaft extending right */}
    <line x1="7.2" y1="12" x2="20" y2="12" />
    {/* Right-pointing arrow head */}
    <polyline points="16 8 20 12 16 16" />
  </svg>
);

/**
 * 6. Vertical Line
 */
export const VerticalLineIcon: React.FC<DrawingIconProps> = ({
  size = 15,
  className = '',
  strokeWidth = 1.75,
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
    <line x1="12" y1="3" x2="12" y2="21" />
    <circle cx="12" cy="12" r="2.2" />
  </svg>
);

/**
 * 7. Cross Line
 */
export const CrossLineIcon: React.FC<DrawingIconProps> = ({
  size = 15,
  className = '',
  strokeWidth = 1.75,
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
    <line x1="12" y1="3" x2="12" y2="21" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <circle cx="12" cy="12" r="2.2" />
  </svg>
);

/**
 * 8. Parallel Channel
 */
export const ParallelChannelIcon: React.FC<DrawingIconProps> = ({ size = 15, className = '', ...props }) => (
  <Maximize2 size={size} className={className} {...props} />
);

/**
 * 9. Fibonacci Retracement (4 levels with diagonal anchor handles)
 */
export const FibRetracementIcon: React.FC<DrawingIconProps> = ({
  size = 15,
  className = '',
  strokeWidth = 1.75,
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
    {/* Line 1 (Top straight line) */}
    <line x1="3" y1="4.5" x2="21" y2="4.5" />

    {/* Line 2 (Straight line with circle handle on right) */}
    <line x1="3" y1="9.5" x2="16.5" y2="9.5" />
    <circle cx="18.5" cy="9.5" r="2" />

    {/* Line 3 (Middle straight line) */}
    <line x1="3" y1="14.5" x2="21" y2="14.5" />

    {/* Line 4 (Bottom straight line with circle handle on left) */}
    <circle cx="5.5" cy="19.5" r="2" />
    <line x1="7.5" y1="19.5" x2="21" y2="19.5" />
  </svg>
);

/**
 * 10. Trend-Based Fibonacci Extension (3 anchor zig-zag + 3 horizontal levels)
 */
export const FibExtensionIcon: React.FC<DrawingIconProps> = ({
  size = 15,
  className = '',
  strokeWidth = 1.75,
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
    {/* Diagonal trendline from Point 2 (middle left) to Point 1 (top right) */}
    <line x1="7" y1="10.2" x2="16.3" y2="5.8" />
    {/* Vertical retracement line from Point 2 (middle left) to Point 3 (bottom left) */}
    <line x1="5.5" y1="12.8" x2="5.5" y2="15.2" />

    {/* Three anchor circles */}
    <circle cx="18" cy="5" r="1.8" />
    <circle cx="5.5" cy="11" r="1.8" />
    <circle cx="5.5" cy="17" r="1.8" />

    {/* 3 horizontal parallel level lines */}
    <line x1="7.5" y1="17" x2="21" y2="17" />
    <line x1="5.5" y1="20" x2="21" y2="20" />
    <line x1="5.5" y1="23" x2="21" y2="23" />
  </svg>
);

/**
 * 11. Geometric Shapes
 */
export const RectangleIcon: React.FC<DrawingIconProps> = ({ size = 15, className = '', ...props }) => (
  <Square size={size} className={className} {...props} />
);

/**
 * 11b. Rotated Rectangle (Angled rectangle with 6 circle handles)
 */
export const RotatedRectangleIcon: React.FC<DrawingIconProps> = ({
  size = 15,
  className = '',
  strokeWidth = 1.75,
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
    {/* Perimeter edges */}
    <line x1="4.5" y1="12" x2="16.5" y2="4.5" />
    <line x1="16.5" y1="4.5" x2="20.5" y2="11.5" />
    <line x1="20.5" y1="11.5" x2="8.5" y2="19" />
    <line x1="8.5" y1="19" x2="4.5" y2="12" />

    {/* 4 Corner handles */}
    <circle cx="4.5" cy="12" r="1.5" />
    <circle cx="16.5" cy="4.5" r="1.5" />
    <circle cx="20.5" cy="11.5" r="1.5" />
    <circle cx="8.5" cy="19" r="1.5" />

    {/* 2 Midpoints on short edges */}
    <circle cx="6.5" cy="15.5" r="1.5" />
    <circle cx="18.5" cy="8" r="1.5" />
  </svg>
);

export const CircleIcon: React.FC<DrawingIconProps> = ({ size = 15, className = '', ...props }) => (
  <Circle size={size} className={className} {...props} />
);

/**
 * 11c. Path (Multi-segment path with intermediate circle nodes and end arrow)
 */
export const PathIcon: React.FC<DrawingIconProps> = ({
  size = 15,
  className = '',
  strokeWidth = 1.75,
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
    {/* Segment 1 */}
    <line x1="3" y1="19" x2="8" y2="10" />
    {/* Segment 2 */}
    <line x1="8" y1="10" x2="13" y2="15" />
    {/* Segment 3 */}
    <line x1="13" y1="15" x2="21" y2="6" />
    {/* Arrowhead at end */}
    <polyline points="16 6 21 6 21 11" />
    {/* Intermediate circle node 1 */}
    <circle cx="8" cy="10" r="1.5" fill="#131722" />
    {/* Intermediate circle node 2 */}
    <circle cx="13" cy="15" r="1.5" fill="#131722" />
  </svg>
);

/**
 * 12. Measurement & Position Tools
 */
export const PriceRangeIcon: React.FC<DrawingIconProps> = ({ size = 15, className = 'text-[#2962ff]', ...props }) => (
  <Ruler size={size} className={className} {...props} />
);

export const DateRangeIcon: React.FC<DrawingIconProps> = ({ size = 15, className = 'text-[#9c27b0]', ...props }) => (
  <Calendar size={size} className={className} {...props} />
);

export const DatePriceRangeIcon: React.FC<DrawingIconProps> = ({ size = 15, className = 'text-[#00e5ff]', ...props }) => (
  <Maximize2 size={size} className={className} {...props} />
);

export const LongPositionIcon: React.FC<DrawingIconProps> = ({ size = 15, className = 'text-[#089981]', ...props }) => (
  <TrendingUp size={size} className={className} {...props} />
);

export const ShortPositionIcon: React.FC<DrawingIconProps> = ({ size = 15, className = 'text-[#f23645]', ...props }) => (
  <TrendingDown size={size} className={className} {...props} />
);

/**
 * 8. Volume-Based Tools
 */
export const AnchoredVWAPIcon: React.FC<DrawingIconProps> = ({
  size = 15,
  className = '',
  strokeWidth = 1.75,
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
    <line x1="7" y1="4" x2="7" y2="20" />
    <rect x="5.25" y="8" width="3.5" height="7" rx="0.5" fill="none" />
    {/* Right Candle */}
    <line x1="15" y1="3" x2="15" y2="18" />
    <rect x="13.25" y="6" width="3.5" height="8" rx="0.5" fill="none" />
    {/* Anchor Node */}
    <circle cx="3.5" cy="16.5" r="1.5" />
    {/* VWAP Line slicing across */}
    <line x1="4.7" y1="15.8" x2="20.5" y2="6.5" />
  </svg>
);

export const FixedRangeVolumeProfileIcon: React.FC<DrawingIconProps> = ({
  size = 15,
  className = '',
  strokeWidth = 1.75,
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
    {/* Left Anchor & Vertical Spine */}
    <circle cx="4" cy="18.5" r="1.5" />
    <line x1="4" y1="5.5" x2="4" y2="17" />
    {/* Volume Bars */}
    <line x1="4" y1="8" x2="10.5" y2="8" />
    <line x1="4" y1="11" x2="14" y2="11" />
    <line x1="4" y1="14" x2="9" y2="14" />
    {/* Right Anchor & Vertical Line */}
    <circle cx="18" cy="5.5" r="1.5" />
    <line x1="18" y1="7" x2="18" y2="18.5" />
  </svg>
);

export const AnchoredVolumeProfileIcon: React.FC<DrawingIconProps> = ({
  size = 15,
  className = '',
  strokeWidth = 1.75,
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
    {/* Left Anchor & Connector */}
    <circle cx="4" cy="12" r="1.5" />
    <line x1="5.5" y1="12" x2="9" y2="12" />
    {/* Vertical Spine */}
    <line x1="9" y1="4.5" x2="9" y2="19.5" />
    {/* Volume Profile Histogram Steps */}
    <path
      d="M9 6.5h4.5v3h4v4h-5v3h-3.5"
      strokeLinecap="square"
    />
  </svg>
);

export function getDrawingIcon(
  type: FavoriteItemType,
  props?: DrawingIconProps
): React.ReactElement {
  const size = props?.size ?? 15;
  const className = props?.className ?? '';

  switch (type) {
    case 'cross':
      return <CrossCursorIcon size={size} className={className} />;
    case 'dot':
      return <DotCursorIcon size={size} className={className} />;
    case 'arrow':
      return <ArrowCursorIcon size={size} className={className} />;
    case 'cursor':
      return <CrossCursorIcon size={size} className={className} />;
    case 'trendline':
      return <TrendlineIcon size={size} className={className} />;
    case 'ray':
      return <RayIcon size={size} className={className} />;
    case 'info_line':
      return <InfoLineIcon size={size} className={className} />;
    case 'horizontal_line':
      return <HorizontalLineIcon size={size} className={className} />;
    case 'horizontal_ray':
      return <HorizontalRayIcon size={size} className={className} />;
    case 'vertical_line':
      return <VerticalLineIcon size={size} className={className} />;
    case 'cross_line':
      return <CrossLineIcon size={size} className={className} />;
    case 'parallel_channel':
      return <ParallelChannelIcon size={size} className={className} />;
    case 'fib_retracement':
      return <FibRetracementIcon size={size} className={className} />;
    case 'fib_extension':
      return <FibExtensionIcon size={size} className={className} />;
    case 'rectangle':
      return <RectangleIcon size={size} className={className} />;
    case 'rotated_rectangle':
      return <RotatedRectangleIcon size={size} className={className} />;
    case 'path':
      return <PathIcon size={size} className={className} />;
    case 'circle':
      return <CircleIcon size={size} className={className} />;
    case 'price_range':
      return <PriceRangeIcon size={size} className={className} />;
    case 'date_range':
      return <DateRangeIcon size={size} className={className} />;
    case 'date_price_range':
      return <DatePriceRangeIcon size={size} className={className} />;
    case 'long_position':
      return <LongPositionIcon size={size} className={className} />;
    case 'short_position':
      return <ShortPositionIcon size={size} className={className} />;
    case 'anchored_vwap':
      return <AnchoredVWAPIcon size={size} className={className} />;
    case 'fixed_range_volume_profile':
      return <FixedRangeVolumeProfileIcon size={size} className={className} />;
    case 'anchored_volume_profile':
      return <AnchoredVolumeProfileIcon size={size} className={className} />;
    default:
      return <Layers size={size} className={className} />;
  }
}

export const DRAWING_TOOL_LABELS: Record<FavoriteItemType, string> = {
  cursor: 'Cursor',
  cross: 'Cross',
  dot: 'Dot',
  arrow: 'Arrow',
  trendline: 'Trend Line',
  ray: 'Ray',
  info_line: 'Info Line',
  horizontal_line: 'Horizontal Line',
  horizontal_ray: 'Horizontal Ray',
  vertical_line: 'Vertical Line',
  cross_line: 'Cross Line',
  parallel_channel: 'Parallel Channel',
  fib_retracement: 'Fib Retracement',
  fib_extension: 'Trend-Based Fib Extension',
  rectangle: 'Rectangle',
  rotated_rectangle: 'Rotated rectangle',
  path: 'Path',
  circle: 'Circle / Ellipse',
  price_range: 'Price Range Ruler',
  date_range: 'Date Range Ruler',
  date_price_range: 'Date and Price Range',
  long_position: 'Long Position (R:R Calculator)',
  short_position: 'Short Position (R:R Calculator)',
  anchored_vwap: 'Anchored VWAP',
  fixed_range_volume_profile: 'Fixed range volume profile',
  anchored_volume_profile: 'Anchored volume profile',
};

