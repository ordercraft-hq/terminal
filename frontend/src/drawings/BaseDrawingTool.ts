import type { Candle } from '../transport/client';
import type {
  DrawingToolType,
  LogicalAnchor,
  UserDrawing,
  DrawingRenderContext,
  DrawingHandle,
  HitTestResult,
} from './types';

export abstract class BaseDrawingTool<TOptions = Record<string, any>> {
  abstract readonly id: DrawingToolType;
  abstract readonly name: string;
  abstract readonly minAnchors: number;
  abstract readonly maxAnchors: number;

  /**
   * Generates a new drawing instance with default attributes.
   */
  createDefaultDrawing(
    id: string,
    anchors: LogicalAnchor[],
    symbol?: string,
    paneId?: string,
    defaultColor: string = '#2962ff'
  ): UserDrawing {
    return {
      id,
      type: this.id,
      anchors,
      color: defaultColor,
      lineWidth: 1,
      lineStyle: 'solid',
      symbol,
      paneId,
      options: this.getDefaultOptions() as Record<string, any>,
    };
  }

  /**
   * Returns default tool-specific options.
   */
  abstract getDefaultOptions(): TOptions;

  /**
   * Renders the drawing onto the canvas context.
   */
  abstract render(ctx: DrawingRenderContext, drawing: UserDrawing): void;

  /**
   * Hit tests a point (px, py) against the drawing.
   * Returns a HitTestResult if hit, or null if missed.
   */
  abstract hitTest(
    drawing: UserDrawing,
    px: number,
    py: number,
    ctx: DrawingRenderContext
  ): HitTestResult | null;

  /**
   * Returns all interactive handles for the drawing.
   */
  abstract getHandles(drawing: UserDrawing, ctx: DrawingRenderContext): DrawingHandle[];

  // ==========================================
  // SHARED GEOMETRIC & DRAWING UTILITIES
  // ==========================================

  public static dist(x1: number, y1: number, x2: number, y2: number): number {
    return Math.hypot(x2 - x1, y2 - y1);
  }

  public static distToSegment(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }

  public static distToRay(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, t); // Clamped at start, open towards ray
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }

  public static distToLine(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    const t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }

  public static pointInPolygon(
    px: number,
    py: number,
    poly: { x: number; y: number }[]
  ): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x,
        yi = poly[i].y;
      const xj = poly[j].x,
        yj = poly[j].y;
      const intersect =
        yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Draws a professional handle circle matching Image 1:
   * circular ring with a blue outline and dark fill.
   */
  public static drawAnchorHandle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    isSelected: boolean = true,
    radius: number = 5,
    strokeColor: string = '#2962ff',
    fillColor: string = '#131722'
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draws an arrowhead pointing from (fromX, fromY) to (toX, toY).
   */
  public static drawArrowHead(
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    size: number = 10,
    color: string = '#2962ff'
  ): void {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - size * Math.cos(angle - Math.PI / 6),
      toY - size * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      toX - size * Math.cos(angle + Math.PI / 6),
      toY - size * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * Draws a circular endcap at (x, y).
   */
  public static drawCircleCap(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number = 4,
    color: string = '#2962ff'
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  /**
   * Draws a stats or price pill badge with rounded corners.
   */
  public static drawPill(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    bgColor: string = '#1e222d',
    borderColor: string = '#2a2e39',
    textColor: string = '#d1d4dc',
    fontSize: number = 11,
    paddingX: number = 6,
    paddingY: number = 3
  ): { width: number; height: number } {
    ctx.save();
    ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const height = fontSize + paddingY * 2;
    const width = textWidth + paddingX * 2;
    const radius = 3;

    const rx = Math.round(x - width / 2);
    const ry = Math.round(y - height / 2);

    ctx.fillStyle = bgColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.roundRect(rx, ry, width, height, radius);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, rx + width / 2, ry + height / 2);
    ctx.restore();

    return { width, height };
  }

  /**
   * Formats a UTC timestamp into the pro timescale badge format: "Fri 23 Oct '26  11:12"
   */
  public static formatTimeScaleLabel(timestampSec: number, timezone = 'UTC'): string {
    let offsetSec = 0;
    if (timezone && timezone !== 'UTC') {
      const match = timezone.match(/UTC([+-])(\d+)(?::(\d+))?/i);
      if (match) {
        const sign = match[1] === '-' ? -1 : 1;
        const hours = parseInt(match[2], 10);
        const mins = match[3] ? parseInt(match[3], 10) : 0;
        offsetSec = sign * (hours * 3600 + mins * 60);
      }
    }

    const d = new Date((timestampSec + offsetSec) * 1000);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const dow = dayNames[d.getUTCDay()];
    const day = d.getUTCDate();
    const month = monthNames[d.getUTCMonth()];
    const yr = `'${String(d.getUTCFullYear()).slice(-2)}`;
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const mins = String(d.getUTCMinutes()).padStart(2, '0');

    return `${dow} ${day} ${month} ${yr}  ${hours}:${mins}`;
  }

  /**
   * Draws a time scale pill badge directly on the time scale.
   */
  public static drawTimeScaleBadge(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    bgColor = '#434651',
    textColor = '#ffffff',
    fontSize = 11
  ): { width: number; height: number } {
    ctx.save();
    ctx.font = `600 ${fontSize}px "Inter", -apple-system, sans-serif`;
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const paddingX = 7;
    const paddingY = 3.5;
    const height = fontSize + paddingY * 2;
    const width = textWidth + paddingX * 2;
    const radius = 3;

    const rx = Math.round(x - width / 2);
    const ry = Math.round(y - height / 2);

    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(rx, ry, width, height, radius);
    ctx.fill();

    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, rx + width / 2, ry + height / 2);
    ctx.restore();

    return { width, height };
  }

  public static formatDuration(seconds: number): string {
    const s = Math.abs(seconds);
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  public static countBars(candles: Candle[], t1: number, t2: number): number {
    if (!candles || candles.length === 0) return 0;
    const start = Math.min(t1, t2);
    const end = Math.max(t1, t2);
    let count = 0;
    for (let i = 0; i < candles.length; i++) {
      if (candles[i].time >= start && candles[i].time <= end) {
        count++;
      }
    }
    return Math.max(1, count);
  }
}
