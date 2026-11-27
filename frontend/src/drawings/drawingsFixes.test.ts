declare const process: { exit: (code: number) => never };

import { PriceScaleMode } from 'lightweight-charts';
import { anchorToCanvas, canvasToAnchor } from './helpers/drawingCoordinates';
import { FixedRangeVolumeProfileTool } from './tools/FixedRangeVolumeProfileTool';
import { AnchoredVolumeProfileTool } from './tools/AnchoredVolumeProfileTool';
import { AnchoredVWAPTool } from './tools/AnchoredVWAPTool';
import { BaseDrawingTool } from './BaseDrawingTool';
import { hitTestDrawing } from './helpers/drawingHitTest';
import { drawFallbackSingle } from './helpers/fallbackRenderer';
import type { Candle } from '../transport/client';
import type { UserDrawing, DrawingRenderContext } from './types';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
  } else {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  }
}

console.log('\n--- 1. LOGARITHMIC OFF-SCREEN PRICE EXTRAPOLATION ---');
{
  // Exact log mapping: y(p) = 200 - 100 * ln(p / 10) / ln(10)
  // At p=10 -> y=200; at p=100 -> y=100; at p=630.957344 -> y=20
  const yFromLogPrice = (p: number) => 200 - 100 * (Math.log(p / 10) / Math.LN10);
  const logPriceFromY = (y: number) => 10 * Math.pow(10, (200 - y) / 100);

  const candles: Candle[] = [
    { time: 1000, open: 20, high: 25, low: 18, close: 22, volume: 100 },
    { time: 1060, open: 22, high: 30, low: 20, close: 28, volume: 100 },
  ];

  const logChart = {
    timeScale: () => ({
      timeToCoordinate: (t: number) => (t === 1000 ? 100 : t === 1060 ? 140 : null),
      coordinateToLogical: () => 0,
      logicalToCoordinate: (l: number) => 100 + l * 40,
      coordinateToTime: () => 1000,
    }),
  };

  const logSeries = {
    priceScale: () => ({
      options: () => ({ mode: PriceScaleMode.Logarithmic }),
    }),
    // Simulate LWC returning null outside [0, 220] screen bounds
    priceToCoordinate: (p: number) => {
      const y = yFromLogPrice(p);
      return y >= 0 && y <= 220 ? y : null;
    },
    coordinateToPrice: (y: number) => {
      if (y < 0 || y > 220) return null;
      return logPriceFromY(y);
    },
  };

  // Off-screen high price p = 1000 -> expected y = 0, p = 10000 -> expected y = -100
  const offScreenHigh = anchorToCanvas(
    { time: 1000, price: 10000 },
    logChart as never,
    logSeries as never,
    candles
  );
  assert(
    offScreenHigh !== null && Math.abs(offScreenHigh.y - -100) < 1e-6,
    `Log anchorToCanvas extrapolates off-screen high price 10000 to y=-100 (got ${offScreenHigh?.y})`
  );

  // Off-screen low price p = 1 -> expected y = 300
  const offScreenLow = anchorToCanvas(
    { time: 1000, price: 1 },
    logChart as never,
    logSeries as never,
    candles
  );
  assert(
    offScreenLow !== null && Math.abs(offScreenLow.y - 300) < 1e-6,
    `Log anchorToCanvas extrapolates off-screen low price 1 to y=300 (got ${offScreenLow?.y})`
  );

  // Round-trip canvasToAnchor at off-screen y = -100 -> expected price = 10000
  const roundTripHigh = canvasToAnchor(100, -100, logChart as never, logSeries as never, candles);
  assert(
    roundTripHigh !== null && Math.abs(roundTripHigh.price - 10000) < 1e-4,
    `Log canvasToAnchor extrapolates y=-100 back to price=10000 (got ${roundTripHigh?.price})`
  );

  // Non-positive price in log mode falls back safely to finite linear result without NaN
  const nonPositive = anchorToCanvas(
    { time: 1000, price: -5 },
    logChart as never,
    logSeries as never,
    candles
  );
  assert(
    nonPositive !== null && Number.isFinite(nonPositive.y),
    `Log anchorToCanvas handles non-positive price safely via linear fallback (got ${nonPositive?.y})`
  );
}

console.log('\n--- 2. VOLUME PROFILE TICKS_PER_ROW & DEVELOPING VA O(N*B) ---');
{
  const frvp = new FixedRangeVolumeProfileTool();
  const avp = new AnchoredVolumeProfileTool();
  // Tick size = 0.25 (NQ); range = 100.00 to 110.00 (span = 10.00 = 40 ticks)
  // With rowSize = 2 ticks_per_row -> 10.00 / (2 * 0.25) = 20 rows!
  const candles: Candle[] = [];
  for (let i = 0; i < 100; i++) {
    const base = 100 + (i % 10);
    candles.push({
      time: 1000 + i * 60,
      open: base,
      high: base + 1,
      low: base,
      close: base + 0.5,
      volume: 100 + i * 10,
    });
  }

  const drawing: UserDrawing = {
    id: 'frvp_ticks',
    type: 'fixed_range_volume_profile',
    symbol: 'NQ1!',
    anchors: [
      { time: 1000, price: 100 },
      { time: 1000 + 99 * 60, price: 110 },
    ],
    options: {
      ...frvp.getDefaultOptions(),
      rowsLayout: 'ticks_per_row',
      rowSize: 2,
      showDevelopingPOC: true,
      showDevelopingVA: true,
    },
  };

  const profile = frvp.getOrComputeProfile(drawing, candles);
  assert(
    profile !== null && profile.bins.length === 20,
    `FRVP ticks_per_row computes 20 rows for 10.00 span / (2 * 0.25 tick) (got ${profile?.bins.length})`
  );
  assert(
    profile !== null &&
      profile.devPOC?.length === 100 &&
      profile.devVAH?.length === 100 &&
      profile.devVAL?.length === 100,
    'FRVP developing POC/VAH/VAL emitted 100 points'
  );
  let vaOrderingValid = true;
  if (profile && profile.devPOC && profile.devVAH && profile.devVAL) {
    for (let i = 0; i < profile.devPOC.length; i++) {
      if (profile.devVAH[i].price < profile.devPOC[i].price || profile.devVAL[i].price > profile.devPOC[i].price) {
        vaOrderingValid = false;
        break;
      }
    }
  }
  assert(vaOrderingValid, 'Developing VAH >= Developing POC >= Developing VAL at every candle');

  const avpDrawing: UserDrawing = {
    id: 'avp_ticks',
    type: 'anchored_volume_profile',
    symbol: 'NQ1!',
    anchors: [{ time: 1000, price: 100 }],
    options: {
      ...avp.getDefaultOptions(),
      rowsLayout: 'ticks_per_row',
      rowSize: 4,
      showDevelopingPOC: true,
      showDevelopingVA: true,
    },
  };
  const avpProfile = avp.getOrComputeProfile(avpDrawing, candles);
  assert(
    avpProfile !== null && avpProfile.bins.length === 10,
    `AVP ticks_per_row computes 10 rows for 10.00 span / (4 * 0.25 tick) (got ${avpProfile?.bins.length})`
  );
}

console.log('\n--- 3. ANCHORED VWAP VISIBLE-RANGE CULLING ---');
{
  const vwapTool = new AnchoredVWAPTool();
  const candles: Candle[] = [];
  for (let i = 0; i < 500; i++) {
    candles.push({
      time: 1000 + i * 60,
      open: 100,
      high: 105,
      low: 95,
      close: 102,
      volume: 1000,
    });
  }

  let priceToCoordCalls = 0;
  // Visible range is only bars 450..499 (time 28000..30940)
  const visibleFrom = 1000 + 450 * 60;
  const visibleTo = 1000 + 499 * 60;

  const mockCtx: DrawingRenderContext = {
    ctx: {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      fill: () => {},
      stroke: () => {},
      arc: () => {},
      setLineDash: () => {},
    } as unknown as CanvasRenderingContext2D,
    chart: {
      timeScale: () => ({
        getVisibleRange: () => ({ from: visibleFrom, to: visibleTo }),
        timeToCoordinate: (t: number) => ((t - visibleFrom) / 60) * 10,
      }),
    } as never,
    series: {
      priceToCoordinate: (p: number) => {
        priceToCoordCalls++;
        return 300 - p;
      },
    } as never,
    candles,
    width: 600,
    height: 400,
    priceDecimals: 2,
    isSelected: false,
    isDraft: false,
    pixelRatio: 1,
    anchorToCoordinates: () => ({ x: 0, y: 0 }),
    canvasToAnchor: () => null,
  };

  const drawing: UserDrawing = {
    id: 'vwap_cull',
    type: 'anchored_vwap',
    anchors: [{ time: 1000, price: 100 }],
    options: vwapTool.getDefaultOptions(),
  };

  vwapTool.render(mockCtx, drawing);
  // 51 visible bars * 7 priceToCoordinate calls = ~357 calls (vs 500 * 7 = 3500 without culling)
  assert(
    priceToCoordCalls > 0 && priceToCoordCalls < 600,
    `AnchoredVWAP visible-range culling projected only visible bars (${priceToCoordCalls} priceToCoordinate calls vs 3500+ unculled)`
  );

  // Verify getHandles still projects true anchor at computed[0] even when off-screen left
  const handles = vwapTool.getHandles(drawing, mockCtx);
  assert(
    handles.length === 1 && handles[0].x < 0,
    `AnchoredVWAP getHandles anchors at true start bar off-screen left (x=${handles[0]?.x})`
  );
}

console.log('\n--- 4. ROUNDRECT FALLBACK & REGISTRY / FALLBACK COMPATIBILITY ---');
{
  const ops: string[] = [];
  const legacyCtx = {
    beginPath: () => ops.push('beginPath'),
    moveTo: () => ops.push('moveTo'),
    lineTo: () => ops.push('lineTo'),
    quadraticCurveTo: () => ops.push('quadraticCurveTo'),
    closePath: () => ops.push('closePath'),
  } as unknown as CanvasRenderingContext2D;

  BaseDrawingTool.drawRoundedRect(legacyCtx, 10, 20, 100, 30, 4);
  assert(
    ops.includes('quadraticCurveTo') && ops.includes('closePath'),
    'drawRoundedRect falls back to quadraticCurveTo when ctx.roundRect is unavailable'
  );

  let usedNativeRoundRect = false;
  const modernCtx = {
    beginPath: () => {},
    roundRect: () => {
      usedNativeRoundRect = true;
    },
  } as unknown as CanvasRenderingContext2D;
  BaseDrawingTool.drawRoundedRect(modernCtx, 10, 20, 100, 30, 4);
  assert(usedNativeRoundRect, 'drawRoundedRect uses native ctx.roundRect when available');

  // Unregistered shape 'circle' still renders and hit-tests
  const circleCalls: string[] = [];
  const mockDrawCtx = {
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    arc: () => circleCalls.push('arc'),
    fill: () => circleCalls.push('fill'),
    stroke: () => circleCalls.push('stroke'),
    setLineDash: () => {},
  } as unknown as CanvasRenderingContext2D;

  const anchorMap = (a: { time: number; price: number }) =>
    a.time === 1000 ? { x: 100, y: 100 } : { x: 150, y: 100 };

  drawFallbackSingle({
    ctx: mockDrawCtx,
    type: 'circle',
    anchors: [
      { time: 1000, price: 100 },
      { time: 1060, price: 100 },
    ],
    isSelected: false,
    width: 800,
    height: 600,
    series: null,
    candles: [],
    priceDecimals: 2,
    anchorToCanvas: anchorMap,
    drawHandle: () => {},
  });
  assert(circleCalls.includes('arc'), 'drawFallbackSingle preserves unregistered circle rendering');

  const circleHit = hitTestDrawing(120, 100, {
    drawingsHidden: false,
    visibleDrawings: [
      {
        id: 'c1',
        type: 'circle',
        anchors: [
          { time: 1000, price: 100 },
          { time: 1060, price: 100 },
        ],
      },
    ],
    selectedDrawingId: null,
    chart: null,
    series: null,
    candles: [],
    plotSize: { width: 800, height: 600 },
    priceDecimals: 2,
    canvas: null,
    currentTimezone: 'UTC',
    anchorToCanvas: anchorMap,
    canvasToAnchor: () => null,
  });
  assert(
    circleHit !== null && circleHit.drawingId === 'c1',
    'hitTestDrawing preserves unregistered circle hit-testing'
  );
}

console.log('\n========================================');
console.log(`TOTAL DRAWINGS FIXES TESTS: ${totalTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${failedTests}`);
console.log('========================================\n');

if (failedTests > 0) {
  process.exit(1);
}
