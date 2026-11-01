import { BaseDrawingTool } from '../BaseDrawingTool';
import type {
  DrawingToolType,
  UserDrawing,
  DrawingRenderContext,
  DrawingHandle,
  HitTestResult,
  LogicalAnchor,
} from '../types';

export interface PositionOptions {
  // Inputs tab
  accountSize?: number; // default: 100000
  accountCurrency?: string; // default: 'Default'
  lotSize?: number; // default: 1
  risk?: number; // default: 250
  riskType?: 'USDT' | 'USD' | 'EUR' | 'GBP' | 'BTC' | '%' | 'Cash'; // default: 'USDT'
  entryPrice?: number;
  leverage?: number; // default: 10000.0
  profitLevelTicks?: number;
  profitLevelPrice?: number;
  stopLevelTicks?: number;
  stopLevelPrice?: number;
  qtyPrecision?: string; // 'Default' | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8'

  // Style tab
  lineColor?: string; // border line color
  lineWidth?: number; // default: 1.5
  stopColor?: string; // default: 'rgba(242, 54, 69, 0.2)'
  targetColor?: string; // default: 'rgba(8, 153, 129, 0.2)'
  textColor?: string; // default: '#ffffff'
  textSize?: number; // default: 12
  showPriceLabels?: boolean; // default: true

  // INFO section
  stats?: string; // default: 'tp_offset_percent_rr'
  compactStatsMode?: boolean; // default: true
  alwaysShowStats?: boolean; // default: false

  // Visibility tab
  visibility?: {
    seconds?: boolean;
    minutes?: boolean;
    hours?: boolean;
    days?: boolean;
    weeks?: boolean;
    months?: boolean;
  };
  [key: string]: any;
}

export abstract class BasePositionTool extends BaseDrawingTool<PositionOptions> {
  readonly minAnchors: number = 3;
  readonly maxAnchors: number = 3;
  abstract readonly isLong: boolean;

  getDefaultOptions(): PositionOptions {
    return {
      accountSize: 100000,
      accountCurrency: 'Default',
      lotSize: 1,
      risk: 250,
      riskType: 'USDT',
      leverage: 10000.0,
      qtyPrecision: 'Default',
      lineColor: '#2a2e39',
      lineWidth: 1.5,
      stopColor: 'rgba(242, 54, 69, 0.2)',
      targetColor: 'rgba(8, 153, 129, 0.2)',
      textColor: '#ffffff',
      textSize: 12,
      showPriceLabels: true,
      stats: 'tp_offset_percent_rr',
      compactStatsMode: true,
      alwaysShowStats: false,
      visibility: {
        seconds: true,
        minutes: true,
        hours: true,
        days: true,
        weeks: true,
        months: true,
      },
    };
  }

  createDefaultDrawing(
    id: string,
    anchors: LogicalAnchor[],
    symbol?: string,
    paneId?: string,
    defaultColor?: string
  ): UserDrawing {
    const isLong = this.isLong;
    const defaults = this.getDefaultOptions();
    return {
      id,
      type: this.id,
      anchors,
      color: defaultColor || (isLong ? '#089981' : '#f23645'),
      lineWidth: defaults.lineWidth || 1.5,
      lineStyle: 'solid',
      symbol,
      paneId,
      options: {
        ...defaults,
        entryPrice: anchors[0]?.price,
        profitLevelPrice: anchors[1]?.price,
        stopLevelPrice: anchors[2]?.price,
      },
    };
  }

  private getBounds(
    drawing: UserDrawing,
    ctx: DrawingRenderContext
  ): {
    x1: number;
    x2: number;
    w: number;
    yEntry: number;
    yTarget: number;
    yStop: number;
    pEntry: number;
    pTarget: number;
    pStop: number;
  } | null {
    const { anchors } = drawing;
    if (!anchors || anchors.length < 3) return null;

    const pt0 = ctx.anchorToCoordinates(anchors[0]);
    const pt1 = ctx.anchorToCoordinates(anchors[1]);
    const pt2 = ctx.anchorToCoordinates(anchors[2]);

    if (!pt0 || !pt1 || !pt2) return null;

    const x1 = Math.min(pt0.x, pt1.x);
    const x2 = Math.max(pt0.x, pt1.x);
    const w = Math.max(24, x2 - x1);

    return {
      x1,
      x2,
      w,
      yEntry: pt0.y,
      yTarget: pt1.y,
      yStop: pt2.y,
      pEntry: anchors[0].price,
      pTarget: anchors[1].price,
      pStop: anchors[2].price,
    };
  }

  render(ctx: DrawingRenderContext, drawing: UserDrawing): void {
    const bounds = this.getBounds(drawing, ctx);
    if (!bounds) return;

    const { ctx: c, priceDecimals, isSelected, isDraft } = ctx;
    const { x1, w, yEntry, yTarget, yStop, pEntry, pTarget, pStop } = bounds;
    const isLong = this.isLong;
    const opts = (drawing.options as PositionOptions) || {};

    const targetColor = opts.targetColor || 'rgba(8, 153, 129, 0.2)';
    const stopColor = opts.stopColor || 'rgba(242, 54, 69, 0.2)';
    const lineColor = opts.lineColor || '#2a2e39';
    const lineWidth = opts.lineWidth || 1.5;
    const textColor = opts.textColor || '#ffffff';
    const textSize = opts.textSize || 12;
    const compactStats = opts.compactStatsMode !== false;
    const alwaysShowStats = opts.alwaysShowStats === true;

    // Mathematical calculations
    const profit = isLong ? pTarget - pEntry : pEntry - pTarget;
    const profitPct = pEntry !== 0 ? (profit / pEntry) * 100 : 0;
    const loss = isLong ? pEntry - pStop : pStop - pEntry;
    const lossPct = pEntry !== 0 ? (loss / pEntry) * 100 : 0;
    const rr = loss > 0 ? profit / loss : 0;

    // Position sizing values
    const accountSize = opts.accountSize ?? 100000;
    const risk = opts.risk ?? 250;
    const riskType = opts.riskType ?? 'USDT';
    const riskAmount = riskType === '%' ? (accountSize * risk) / 100 : risk;
    const lossPerUnit = Math.abs(pEntry - pStop);
    const lotSize = opts.lotSize || 1;
    const qty = lossPerUnit > 0 ? riskAmount / (lossPerUnit * lotSize) : 0;
    const profitAmount = qty * Math.abs(pTarget - pEntry) * lotSize;
    const currency = opts.accountCurrency && opts.accountCurrency !== 'Default' ? opts.accountCurrency : 'USDT';

    c.save();

    // 1. Target (Profit) Zone
    const profitTop = Math.min(yEntry, yTarget);
    const profitHeight = Math.abs(yEntry - yTarget);
    c.fillStyle = targetColor;
    c.fillRect(x1, profitTop, w, profitHeight);
    c.strokeStyle = lineColor;
    c.lineWidth = lineWidth;
    c.strokeRect(x1, profitTop, w, profitHeight);

    // 2. Stop (Loss) Zone
    const lossTop = Math.min(yEntry, yStop);
    const lossHeight = Math.abs(yEntry - yStop);
    c.fillStyle = stopColor;
    c.fillRect(x1, lossTop, w, lossHeight);
    c.strokeStyle = lineColor;
    c.lineWidth = lineWidth;
    c.strokeRect(x1, lossTop, w, lossHeight);

    // 3. Entry Line
    c.strokeStyle = lineColor === '#2a2e39' ? '#d1d4dc' : lineColor;
    c.lineWidth = lineWidth;
    c.beginPath();
    c.moveTo(x1, yEntry);
    c.lineTo(x1 + w, yEntry);
    c.stroke();

    // Ticks & position sizing
    const tickSize = opts.tickSize || Math.pow(10, -Math.min(6, Math.max(0, priceDecimals))) || 0.01;
    const targetTicks = opts.profitLevelTicks ?? (tickSize > 0 ? Math.round(profit / tickSize) : 0);
    const stopTicks = opts.stopLevelTicks ?? (tickSize > 0 ? Math.round(loss / tickSize) : 0);

    // Helper: Draw pill badge (supports single-line or multi-line text)
    const drawBadge = (
      text: string | string[],
      x: number,
      y: number,
      bgColor: string,
      borderColor: string,
      txtColor: string = '#ffffff'
    ) => {
      const lines = Array.isArray(text) ? text : [text];
      c.font = `600 ${textSize}px Inter, -apple-system, BlinkMacSystemFont, sans-serif`;
      const padX = 8;
      const padY = 5;
      const lineHeight = textSize + 4;
      let maxW = 0;
      for (const line of lines) {
        const w = c.measureText(line).width;
        if (w > maxW) maxW = w;
      }
      const pillW = maxW + padX * 2;
      const pillH = lines.length * lineHeight + padY * 2 - 2;

      c.fillStyle = bgColor;
      c.beginPath();
      c.roundRect(x - pillW / 2, y - pillH / 2, pillW, pillH, 4);
      c.fill();

      c.strokeStyle = borderColor;
      c.lineWidth = 1;
      c.stroke();

      c.fillStyle = txtColor;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const startY = y - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, i) => {
        c.fillText(line, x, startY + i * lineHeight);
      });
    };

    // 4. Badges / Stats
    const isHovered = !!ctx.isHovered;
    const showStats = alwaysShowStats || isSelected || isDraft || isHovered;
    const statsMode = opts.stats || 'tp_offset_percent_rr';

    if (showStats && statsMode !== 'none' && statsMode !== 'hidden') {
      let showTarget = true;
      let showStop = true;
      let showRR = true;

      let targetText: string | string[] = '';
      let stopText: string | string[] = '';
      const rrText: string = `Risk/Reward: ${rr.toFixed(2)}`;

      if (statsMode === 'all') {
        const targetPriceOffset = `+${profit.toFixed(priceDecimals)}`;
        const targetPercent = `(+${profitPct.toFixed(2)}%)`;
        const targetTicksStr = `${targetTicks} ticks`;
        const targetAmountStr = `${profitAmount.toFixed(2)} ${currency}`;

        const stopPriceOffset = `-${loss.toFixed(priceDecimals)}`;
        const stopPercent = `(-${lossPct.toFixed(2)}%)`;
        const stopTicksStr = `${stopTicks} ticks`;
        const stopAmountStr = `${riskAmount.toFixed(2)} ${currency}`;

        if (compactStats) {
          targetText = `Target: ${targetPriceOffset} ${targetPercent} ${targetTicksStr} | ${targetAmountStr}`;
          stopText = `Stop: ${stopPriceOffset} ${stopPercent} ${stopTicksStr} | ${stopAmountStr}`;
        } else {
          targetText = [
            `Target: ${targetPriceOffset} ${targetPercent}`,
            `${targetTicksStr} | Amount: ${targetAmountStr}`,
          ];
          stopText = [
            `Stop: ${stopPriceOffset} ${stopPercent}`,
            `${stopTicksStr} | Amount: ${stopAmountStr}`,
          ];
        }
      } else if (statsMode === 'offset_percent') {
        targetText = `+${profit.toFixed(priceDecimals)} (+${profitPct.toFixed(2)}%)`;
        stopText = `-${loss.toFixed(priceDecimals)} (-${lossPct.toFixed(2)}%)`;
        showRR = false;
      } else if (statsMode === 'rr_only') {
        showTarget = false;
        showStop = false;
        showRR = true;
      } else {
        // 'tp_offset_percent_rr' (default)
        if (compactStats) {
          targetText = `Target: +${profit.toFixed(priceDecimals)} (+${profitPct.toFixed(2)}%)`;
          stopText = `Stop: -${loss.toFixed(priceDecimals)} (-${lossPct.toFixed(2)}%)`;
        } else {
          targetText = [
            `Target: +${profit.toFixed(priceDecimals)}`,
            `(+${profitPct.toFixed(2)}%)`,
          ];
          stopText = [
            `Stop: -${loss.toFixed(priceDecimals)}`,
            `(-${lossPct.toFixed(2)}%)`,
          ];
        }
      }

      const targetPillH = Array.isArray(targetText)
        ? targetText.length * (textSize + 4) + 8
        : textSize + 8;
      const stopPillH = Array.isArray(stopText)
        ? stopText.length * (textSize + 4) + 8
        : textSize + 8;

      const targetPillY =
        profitHeight >= targetPillH + 8
          ? isLong
            ? profitTop + targetPillH / 2 + 4
            : profitTop + profitHeight - targetPillH / 2 - 4
          : Math.min(profitTop + profitHeight / 2, yEntry - targetPillH / 2);

      const stopPillY =
        lossHeight >= stopPillH + 8
          ? isLong
            ? lossTop + lossHeight - stopPillH / 2 - 4
            : lossTop + stopPillH / 2 + 4
          : Math.max(lossTop + lossHeight / 2, yEntry + stopPillH / 2);

      if (showTarget) {
        drawBadge(targetText, x1 + w / 2, targetPillY, '#089981', '#089981', textColor);
      }
      if (showStop) {
        drawBadge(stopText, x1 + w / 2, stopPillY, '#f23645', '#f23645', textColor);
      }
      if (showRR) {
        drawBadge(rrText, x1 + w / 2, yEntry, '#1e222d', '#2a2e39', '#d1d4dc');
      }
    }

    // 5. Interactive Handles
    if (isSelected || isDraft) {
      const drawHandle = (x: number, y: number, color: string) => {
        c.fillStyle = color;
        c.strokeStyle = '#1e222d';
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(x, y, 4.5, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      };

      const xMid = x1 + w / 2;
      // Target handles (Green) - center & right
      drawHandle(xMid, yTarget, '#089981');
      drawHandle(x1 + w, yTarget, '#089981');
      // Stop handles (Red) - center & right
      drawHandle(xMid, yStop, '#f23645');
      drawHandle(x1 + w, yStop, '#f23645');
      // Width handle (Blue) - right edge of entry line
      drawHandle(x1 + w, yEntry, '#2962ff');
      // Entry move handles (White) - left edge & center
      drawHandle(x1, yEntry, '#ffffff');
      drawHandle(xMid, yEntry, '#ffffff');
    }

    c.restore();
  }

  hitTest(
    drawing: UserDrawing,
    px: number,
    py: number,
    ctx: DrawingRenderContext
  ): HitTestResult | null {
    const bounds = this.getBounds(drawing, ctx);
    if (!bounds) return null;

    const { x1, w, yEntry, yTarget, yStop } = bounds;
    const xLeft = x1;
    const xRight = x1 + w;
    const xMid = (xLeft + xRight) / 2;

    // 1. Target handle or entire target line: handleIndex 1
    if (
      Math.hypot(px - xMid, py - yTarget) <= 14 ||
      Math.hypot(px - xRight, py - yTarget) <= 14 ||
      (px >= xLeft - 6 && px <= xRight + 6 && Math.abs(py - yTarget) <= 10)
    ) {
      return { hit: true, handleIndex: 1, cursor: 'ns-resize' };
    }

    // 2. Stop handle or entire stop line: handleIndex 2
    if (
      Math.hypot(px - xMid, py - yStop) <= 14 ||
      Math.hypot(px - xRight, py - yStop) <= 14 ||
      (px >= xLeft - 6 && px <= xRight + 6 && Math.abs(py - yStop) <= 10)
    ) {
      return { hit: true, handleIndex: 2, cursor: 'ns-resize' };
    }

    // 3. Width handle or right edge: handleIndex 3
    const yMin = Math.min(yTarget, yStop, yEntry);
    const yMax = Math.max(yTarget, yStop, yEntry);
    if (
      Math.hypot(px - xRight, py - yEntry) <= 14 ||
      (Math.abs(px - xRight) <= 8 && py >= yMin - 6 && py <= yMax + 6)
    ) {
      return { hit: true, handleIndex: 3, cursor: 'ew-resize' };
    }

    // 4. Entry handle or entry line: handleIndex 0
    if (
      Math.hypot(px - xLeft, py - yEntry) <= 14 ||
      Math.hypot(px - xMid, py - yEntry) <= 14 ||
      (px >= xLeft - 6 && px <= xRight + 6 && Math.abs(py - yEntry) <= 8)
    ) {
      return { hit: true, handleIndex: 0, cursor: 'move' };
    }

    // 5. Body hit: handleIndex -1
    if (px >= xLeft && px <= xRight && py >= yMin && py <= yMax) {
      return { hit: true, handleIndex: -1, cursor: 'grab' };
    }

    return null;
  }

  getHandles(drawing: UserDrawing, ctx: DrawingRenderContext): DrawingHandle[] {
    const bounds = this.getBounds(drawing, ctx);
    if (!bounds) return [];

    const { x1, w, yEntry, yTarget, yStop } = bounds;
    const xMid = x1 + w / 2;
    const xRight = x1 + w;

    return [
      { x: x1, y: yEntry, index: 0, type: 'vertex', cursor: 'move' },
      { x: xMid, y: yTarget, index: 1, type: 'vertex', cursor: 'ns-resize' },
      { x: xMid, y: yStop, index: 2, type: 'vertex', cursor: 'ns-resize' },
      { x: xRight, y: yEntry, index: 3, type: 'middle', cursor: 'ew-resize' },
    ];
  }
}

export class LongPositionTool extends BasePositionTool {
  readonly id: DrawingToolType = 'long_position';
  readonly name: string = 'Long Position';
  readonly isLong: boolean = true;
}

export class ShortPositionTool extends BasePositionTool {
  readonly id: DrawingToolType = 'short_position';
  readonly name: string = 'Short Position';
  readonly isLong: boolean = false;
}
