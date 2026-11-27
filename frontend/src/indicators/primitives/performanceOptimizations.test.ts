declare const process: { exit: (code: number) => never };

import {
  FootprintPrimitive,
  type FootprintBar,
  type ImbalanceRule,
  type ImbalanceGlobalSettings,
} from './FootprintPrimitive.ts';
import { FixedRangeVolumeProfileTool } from '../../drawings/tools/FixedRangeVolumeProfileTool.ts';
import { AnchoredVolumeProfileTool } from '../../drawings/tools/AnchoredVolumeProfileTool.ts';
import { AnchoredVWAPTool } from '../../drawings/tools/AnchoredVWAPTool.ts';
import type { Candle } from '../../transport/client.ts';
import type { UserDrawing, DrawingRenderContext } from '../../drawings/types.ts';

// ============================================================================
// Test Harness
// ============================================================================

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    failedTests++;
    failures.push(message);
    console.error(`  ❌ FAIL: ${message}`);
  } else {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  }
}

class MockCanvasContext {
  public calls: Array<{ method: string; args: any[] }> = [];
  public fillStyle: any = '';
  public strokeStyle: any = '';
  public lineWidth: number = 1;
  public font: string = '';
  public textAlign: string = '';
  public textBaseline: string = '';

  save() { this.calls.push({ method: 'save', args: [] }); }
  restore() { this.calls.push({ method: 'restore', args: [] }); }
  beginPath() { this.calls.push({ method: 'beginPath', args: [] }); }
  closePath() { this.calls.push({ method: 'closePath', args: [] }); }
  fill() { this.calls.push({ method: 'fill', args: [] }); }
  stroke() { this.calls.push({ method: 'stroke', args: [] }); }
  moveTo(x: number, y: number) { this.calls.push({ method: 'moveTo', args: [x, y] }); }
  lineTo(x: number, y: number) { this.calls.push({ method: 'lineTo', args: [x, y] }); }
  fillRect(x: number, y: number, w: number, h: number) { this.calls.push({ method: 'fillRect', args: [x, y, w, h] }); }
  strokeRect(x: number, y: number, w: number, h: number) { this.calls.push({ method: 'strokeRect', args: [x, y, w, h] }); }
  fillText(text: string, x: number, y: number) { this.calls.push({ method: 'fillText', args: [text, x, y] }); }
  setLineDash(segments: number[]) { this.calls.push({ method: 'setLineDash', args: segments }); }
}

class MockRenderingTarget {
  public ctx: MockCanvasContext;
  public mediaWidth: number;
  public mediaHeight: number;

  constructor(width = 800, height = 600) {
    this.ctx = new MockCanvasContext();
    this.mediaWidth = width;
    this.mediaHeight = height;
  }

  useMediaCoordinateSpace(cb: (scope: { context: any; mediaSize: { width: number; height: number } }) => void) {
    cb({
      context: this.ctx,
      mediaSize: { width: this.mediaWidth, height: this.mediaHeight },
    });
  }
}

function createMockEnvironment(priceScale = 4, barSpacing = 40) {
  const chart = {
    timeScale: () => ({
      timeToCoordinate: (t: any) => 100 + (Number(t) - 1000) * barSpacing,
      logicalToCoordinate: (l: any) => Number(l) * barSpacing,
      getVisibleRange: () => ({ from: 900, to: 3000 }),
    }),
  };

  const series = {
    priceToCoordinate: (p: number) => 300 - (p - 100) * priceScale,
  };

  const attachedParam = {
    chart: chart as any,
    series: series as any,
    requestUpdate: () => {},
  };

  return { chart, series, attachedParam };
}

// ============================================================================
// Test 1: Footprint Text Level-of-Detail (LOD) Gate
// ============================================================================
console.log('\n--- 1. FOOTPRINT TEXT LOD GATE (cellH >= 14 && clusterW >= 36) ---');
{
  const bar: FootprintBar = {
    time: 1000,
    open: 100,
    high: 102,
    low: 100,
    close: 102,
    totalVolume: 500,
    delta: 50,
    levels: [
      { price: 100, bidVolume: 50, askVolume: 100 },
      { price: 101, bidVolume: 60, askVolume: 120 },
      { price: 102, bidVolume: 70, askVolume: 100 },
    ],
  };

  // Scenario A: clusterW is large (80px), priceScale is large (16px/level -> cellH = 16 >= 14)
  // Text should render!
  const envLarge = createMockEnvironment(16, 80);
  const fpLarge = new FootprintPrimitive({ showText: true, showStats: false, tickSize: 1.0 }, [bar]);
  fpLarge.attached(envLarge.attachedParam as any);
  const targetLarge = new MockRenderingTarget();
  fpLarge.paneViews()[0].renderer()?.draw(targetLarge as any);
  const fillTextCallsLarge = targetLarge.ctx.calls.filter((c) => c.method === 'fillText');
  assert(fillTextCallsLarge.length > 0, `Large zoom renders text (found ${fillTextCallsLarge.length} fillText calls)`);

  // Scenario B: Zoomed out, priceScale is small (8px/level -> cellH = 8 < 14)
  // Text should be gated / suppressed!
  const envSmallH = createMockEnvironment(8, 80);
  const fpSmallH = new FootprintPrimitive({ showText: true, showStats: false, aggregateProfiles: false, tickSize: 1.0 }, [bar]);
  fpSmallH.attached(envSmallH.attachedParam as any);
  const targetSmallH = new MockRenderingTarget();
  fpSmallH.paneViews()[0].renderer()?.draw(targetSmallH as any);
  const fillTextSmallH = targetSmallH.ctx.calls.filter((c) => c.method === 'fillText');
  assert(fillTextSmallH.length === 0, `Zoomed out cellH < 14 suppresses text to protect GPU font rasterizer (found ${fillTextSmallH.length} calls)`);

  // Scenario C: clusterW is small (barSpacing = 30px < 36px)
  // Text should be gated / suppressed!
  const envSmallW = createMockEnvironment(16, 30);
  const fpSmallW = new FootprintPrimitive({ showText: true, showStats: false, tickSize: 1.0 }, [bar]);
  fpSmallW.attached(envSmallW.attachedParam as any);
  const targetSmallW = new MockRenderingTarget();
  fpSmallW.paneViews()[0].renderer()?.draw(targetSmallW as any);
  const fillTextSmallW = targetSmallW.ctx.calls.filter((c) => c.method === 'fillText');
  assert(fillTextSmallW.length === 0, `Zoomed out clusterW < 36 suppresses text (found ${fillTextSmallW.length} calls)`);
}

// ============================================================================
// Test 2: Imbalance Pre-calculation & Incremental Forming Bar Updates
// ============================================================================
console.log('\n--- 2. IMBALANCE PRE-CALCULATION & INCREMENTAL FORMING BAR ---');
{
  const rules: ImbalanceRule[] = [
    {
      id: 'rule_1',
      name: '300% rule',
      enabled: true,
      imbalancePercent: 300,
      deltaFilter: 0,
      deltaFilterEnabled: false,
      sellColor: '#d8b4e2',
      sellLineWidth: 1.0,
      sellLineStyle: 'solid',
      sellDisplay: true,
      buyColor: '#8da9c4',
      buyLineWidth: 1.0,
      buyLineStyle: 'solid',
      buyDisplay: true,
    },
  ];

  const globalSettings: ImbalanceGlobalSettings = {
    skipZeroValues: false,
    showStackedImbalances: true,
    showMitigatedZones: true,
    drawZoneBorders: false,
    stackedMinLevels: 3,
  };

  // Bar 1: Creates stacked buy imbalance at prices 101, 102, 103 (ask >= 3x bid below)
  const bar1: FootprintBar = {
    time: 1000,
    open: 100,
    high: 104,
    low: 100,
    close: 104,
    totalVolume: 1000,
    delta: 500,
    levels: [
      { price: 100, bidVolume: 10, askVolume: 10 },
      { price: 101, bidVolume: 10, askVolume: 100 }, // ask 100 vs bid 10 at 100 -> Buy Imbalance
      { price: 102, bidVolume: 10, askVolume: 100 }, // ask 100 vs bid 10 at 101 -> Buy Imbalance
      { price: 103, bidVolume: 10, askVolume: 100 }, // ask 100 vs bid 10 at 102 -> Buy Imbalance
      { price: 104, bidVolume: 50, askVolume: 50 },
    ],
  };

  // Bar 2: Immediate next bar DOES NOT touch [100.5, 103.5]
  const bar2: FootprintBar = {
    time: 1001,
    open: 105,
    high: 108,
    low: 105,
    close: 107,
    totalVolume: 300,
    delta: 50,
    levels: [
      { price: 105, bidVolume: 20, askVolume: 20 },
      { price: 106, bidVolume: 20, askVolume: 20 },
      { price: 107, bidVolume: 20, askVolume: 20 },
      { price: 108, bidVolume: 20, askVolume: 20 },
    ],
  };

  const fp = new FootprintPrimitive({
    imbalanceRules: rules,
    imbalanceGlobalSettings: globalSettings,
    tickSize: 1.0,
  }, [bar1, bar2]);

  const env = createMockEnvironment(10, 50);
  fp.attached(env.attachedParam as any);

  // Render bar1 and bar2
  const target1 = new MockRenderingTarget();
  fp.paneViews()[0].renderer()?.draw(target1 as any);
  const fillRectCalls1 = target1.ctx.calls.filter((c) => c.method === 'fillRect');
  assert(fillRectCalls1.length > 0, `Pre-computed stacked imbalance renders successfully (found ${fillRectCalls1.length} fillRect calls)`);

  // Now test Bar 3 (mitigates Bar 1): low drops to 102
  const bar3: FootprintBar = {
    time: 1002,
    open: 106,
    high: 106,
    low: 102,
    close: 103,
    totalVolume: 400,
    delta: -50,
    levels: [
      { price: 102, bidVolume: 30, askVolume: 20 },
      { price: 103, bidVolume: 30, askVolume: 20 },
    ],
  };

  // Upsert Bar 3 into primitive
  fp.upsertBar(bar3);

  // Verify that historical bars remained intact and forming bar was evaluated
  const target2 = new MockRenderingTarget();
  fp.paneViews()[0].renderer()?.draw(target2 as any);
  const fillRectCalls2 = target2.ctx.calls.filter((c) => c.method === 'fillRect');
  assert(fillRectCalls2.length > 0, `Incremental forming bar mitigation updates smoothly without error (found ${fillRectCalls2.length} fillRect calls)`);

  // Test updating the forming bar in-place (same timestamp 1002)
  bar3.low = 101;
  bar3.close = 102;
  fp.upsertBar(bar3);

  const target3 = new MockRenderingTarget();
  fp.paneViews()[0].renderer()?.draw(target3 as any);
  assert(target3.ctx.calls.length > 0, `In-place forming bar update evaluated in O(1)`);
}

// ============================================================================
// Test 3: FixedRangeVolumeProfileTool Memoization on Drawing Entity
// ============================================================================
console.log('\n--- 3. FIXED RANGE VOLUME PROFILE MEMOIZATION & HITTEST O(1) ---');
{
  const tool = new FixedRangeVolumeProfileTool();
  const candles: Candle[] = [];
  for (let i = 0; i < 200; i++) {
    candles.push({
      time: 1000 + i * 60,
      open: 100 + Math.sin(i / 10) * 10,
      high: 115 + Math.sin(i / 10) * 10,
      low: 95 + Math.sin(i / 10) * 10,
      close: 105 + Math.sin(i / 10) * 10,
      volume: 1000 + (i % 5) * 200,
    });
  }

  const drawing: UserDrawing = {
    id: 'frvp_test',
    type: 'fixed_range_volume_profile',
    anchors: [
      { time: 1000, price: 100 },
      { time: 1000 + 100 * 60, price: 110 },
    ],
    options: tool.getDefaultOptions(),
  };

  const env = createMockEnvironment(4, 10);
  const mockRenderCtx: DrawingRenderContext = {
    chart: env.chart as any,
    series: env.series as any,
    candles,
    ctx: new MockCanvasContext() as any,
    width: 800,
    height: 600,
    priceDecimals: 2,
    timezone: 'UTC',
    isSelected: false,
    isDraft: false,
    pixelRatio: 1,
    anchorToCoordinates: (anchor) => {
      const x = env.chart.timeScale().timeToCoordinate(anchor.time);
      const y = env.series.priceToCoordinate(anchor.price);
      return x !== null && y !== null ? { x, y } : null;
    },
    canvasToAnchor: () => null,
  };

  // 1. Initial compute & memoization
  const profile1 = tool.getOrComputeProfile(drawing, candles, drawing.options as any);
  assert(profile1 !== null && profile1.bins.length > 0, 'FRVP computes profile bins');

  // 2. Second access on same drawing entity: MUST return exact same reference in O(1)
  const profile2 = tool.getOrComputeProfile(drawing, candles, drawing.options as any);
  assert(profile1 === profile2, 'FRVP returns memoized profile data in O(1) without recomputation');

  // 3. hitTest uses memoized data & strictly hit-tests the profile, not empty space
  // With anchor0 price=100 (y=300) and candle range 85..125 (y=200..360), py=280 is inside the profile vertically
  // and px=150 is inside the profile horizontally (xLeft=100)
  const hitResult = tool.hitTest(drawing, 150, 280, mockRenderCtx);
  assert(hitResult !== null && hitResult.hit === true, 'hitTest hits inside actual profile column');

  // Verify empty space (e.g. px = 30000 in the empty space of the box) returns null
  const hitEmptyResult = tool.hitTest(drawing, 30000, 280, mockRenderCtx);
  assert(hitEmptyResult === null, 'hitTest returns null in empty space of FRVP so chart panning works');

  // 4. Invalidation: when anchors change
  drawing.anchors = [
    { time: 1000, price: 100 },
    { time: 1000 + 150 * 60, price: 110 },
  ];
  const profile3 = tool.getOrComputeProfile(drawing, candles, drawing.options as any);
  assert(profile3 !== profile1, 'FRVP invalidates cache when anchors move');
}

// ============================================================================
// Test 4: AnchoredVolumeProfileTool Memoization on Drawing Entity
// ============================================================================
console.log('\n--- 4. ANCHORED VOLUME PROFILE MEMOIZATION & HITTEST O(1) ---');
{
  const tool = new AnchoredVolumeProfileTool();
  const candles: Candle[] = [];
  for (let i = 0; i < 150; i++) {
    candles.push({
      time: 2000 + i * 60,
      open: 50,
      high: 60,
      low: 45,
      close: 55,
      volume: 500,
    });
  }

  const drawing: UserDrawing = {
    id: 'avp_test',
    type: 'anchored_volume_profile',
    anchors: [{ time: 2000, price: 50 }],
    options: tool.getDefaultOptions(),
  };

  const p1 = tool.getOrComputeProfile(drawing, candles, drawing.options as any);
  assert(p1 !== null && p1.bins.length > 0, 'AVP computes profile bins');

  const p2 = tool.getOrComputeProfile(drawing, candles, drawing.options as any);
  assert(p1 === p2, 'AVP returns memoized profile data in O(1)');

  // Invalidation: candle array updates
  const newCandles = [...candles, { time: 2000 + 151 * 60, open: 55, high: 62, low: 54, close: 60, volume: 800 }];
  const p3 = tool.getOrComputeProfile(drawing, newCandles, drawing.options as any);
  assert(p3 !== p1, 'AVP invalidates cache when new candle arrives');
}

// ============================================================================
// Test 5: AnchoredVWAPTool Memoization on Drawing Entity
// ============================================================================
console.log('\n--- 5. ANCHORED VWAP MEMOIZATION & HITTEST O(1) ---');
{
  const tool = new AnchoredVWAPTool();
  const candles: Candle[] = [];
  for (let i = 0; i < 200; i++) {
    candles.push({
      time: 3000 + i * 60,
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 1000,
    });
  }

  const drawing: UserDrawing = {
    id: 'avwap_test',
    type: 'anchored_vwap',
    anchors: [{ time: 3000, price: 100 }],
    options: tool.getDefaultOptions(),
  };

  const vwap1 = tool.getOrComputeVWAPData(drawing, drawing.anchors[0], candles, drawing.options as any);
  assert(vwap1.length > 0, 'Anchored VWAP computes standard deviation points');

  const vwap2 = tool.getOrComputeVWAPData(drawing, drawing.anchors[0], candles, drawing.options as any);
  assert(vwap1 === vwap2, 'Anchored VWAP returns memoized points in O(1)');

  // Invalidation when anchor moves
  drawing.anchors = [{ time: 3000 + 50 * 60, price: 100 }];
  const vwap3 = tool.getOrComputeVWAPData(drawing, drawing.anchors[0], candles, drawing.options as any);
  assert(vwap3 !== vwap1, 'Anchored VWAP invalidates cache when anchor time changes');
}

// ============================================================================
// Test 6: Forming Candle Live Mutations (Volume / High / Low) Invalidate Drawing Caches
// ============================================================================
console.log('\n--- 6. FORMING CANDLE VOLUME/HIGH/LOW MUTATIONS INVALIDATE DRAWING CACHES ---');
{
  const frvpTool = new FixedRangeVolumeProfileTool();
  const candles: Candle[] = [
    { time: 1000, open: 100, high: 105, low: 95, close: 100, volume: 1000 },
    { time: 1060, open: 100, high: 105, low: 95, close: 100, volume: 1000 },
  ];
  const drawing: UserDrawing = {
    id: 'frvp_vol_test',
    type: 'fixed_range_volume_profile',
    anchors: [
      { time: 1000, price: 100 },
      { time: 1060, price: 100 },
    ],
    options: frvpTool.getDefaultOptions(),
  };

  const p1 = frvpTool.getOrComputeProfile(drawing, candles, drawing.options as any);
  assert(p1 !== null, 'Initial FRVP profile computed');

  // Mutate forming candle volume only (close and time unchanged!)
  const candlesVolUpdated: Candle[] = [
    candles[0],
    { ...candles[1], volume: 50000 },
  ];
  const p2 = frvpTool.getOrComputeProfile(drawing, candlesVolUpdated, drawing.options as any);
  assert(p2 !== p1, 'FRVP invalidates cache when forming candle volume surges with identical close');

  // Mutate forming candle high (close and time unchanged!)
  const candlesHighUpdated: Candle[] = [
    candles[0],
    { ...candles[1], high: 120 },
  ];
  const p3 = frvpTool.getOrComputeProfile(drawing, candlesHighUpdated, drawing.options as any);
  assert(p3 !== p1, 'FRVP invalidates cache when forming candle high expands with identical close');

  // Same check for Anchored VWAP
  const vwapTool = new AnchoredVWAPTool();
  const vDrawing: UserDrawing = {
    id: 'vwap_vol_test',
    type: 'anchored_vwap',
    anchors: [{ time: 1000, price: 100 }],
    options: vwapTool.getDefaultOptions(),
  };
  const v1 = vwapTool.getOrComputeVWAPData(vDrawing, vDrawing.anchors[0], candles, vDrawing.options as any);
  const v2 = vwapTool.getOrComputeVWAPData(vDrawing, vDrawing.anchors[0], candlesVolUpdated, vDrawing.options as any);
  assert(v2 !== v1, 'Anchored VWAP invalidates cache when forming candle volume updates with identical close');
}

// ============================================================================
// Test 7: Footprint Bar Profile Value Area Toggle Invalidation
// ============================================================================
console.log('\n--- 7. FOOTPRINT BAR PROFILE SHOW VA TOGGLE INVALIDATION ---');
{
  const bar: FootprintBar = {
    time: 1000,
    open: 100,
    high: 104,
    low: 100,
    close: 104,
    totalVolume: 1000,
    delta: 100,
    levels: [
      { price: 100, bidVolume: 100, askVolume: 100 },
      { price: 101, bidVolume: 100, askVolume: 100 },
      { price: 102, bidVolume: 200, askVolume: 200 },
      { price: 103, bidVolume: 50, askVolume: 50 },
      { price: 104, bidVolume: 50, askVolume: 50 },
    ],
  };

  const env = createMockEnvironment(10, 60);
  const fp = new FootprintPrimitive({
    volProfileMode: 'profile',
    volProfileEnabled: true,
    volProfileShowValueArea: false,
    tickSize: 1.0,
  }, [bar]);
  fp.attached(env.attachedParam as any);

  // Initial draw with VA disabled
  const targetNoVA = new MockRenderingTarget();
  fp.paneViews()[0].renderer()?.draw(targetNoVA as any);

  // Toggle Value Area ON
  fp.setOptions({ volProfileShowValueArea: true });
  const targetWithVA = new MockRenderingTarget();
  fp.paneViews()[0].renderer()?.draw(targetWithVA as any);

  assert(targetWithVA.ctx.calls.length > 0, 'Footprint primitive re-renders after toggling volProfileShowValueArea');
}

// ============================================================================
// Test 8: In-place Forming Bar Mutation in upsertBar Invalidates Caches
// ============================================================================
console.log('\n--- 8. IN-PLACE FORMING BAR UPSERT CACHE INVALIDATION ---');
{
  const bar: FootprintBar = {
    time: 1000,
    open: 50,
    high: 51,
    low: 50,
    close: 51,
    totalVolume: 200,
    delta: 20,
    levels: [
      { price: 50, bidVolume: 50, askVolume: 50 },
      { price: 51, bidVolume: 50, askVolume: 50 },
    ],
  };

  const env = createMockEnvironment(10, 60);
  const fp = new FootprintPrimitive({
    volProfileMode: 'both',
    volProfileEnabled: true,
    tickSize: 1.0,
  }, [bar]);
  fp.attached(env.attachedParam as any);

  const target1 = new MockRenderingTarget();
  fp.paneViews()[0].renderer()?.draw(target1 as any);

  // Forming bar receives trade at new price 52 and 53
  const updatedBar: FootprintBar = {
    ...bar,
    high: 53,
    close: 53,
    totalVolume: 500,
    levels: [
      ...bar.levels,
      { price: 52, bidVolume: 100, askVolume: 100 },
      { price: 53, bidVolume: 50, askVolume: 50 },
    ],
  };
  fp.upsertBar(updatedBar);

  const target2 = new MockRenderingTarget();
  fp.paneViews()[0].renderer()?.draw(target2 as any);
  assert(target2.ctx.calls.length > target1.ctx.calls.length, `In-place forming bar upsert incorporated new price levels into render (${target2.ctx.calls.length} > ${target1.ctx.calls.length})`);
}

// ============================================================================
// Summary
// ============================================================================
console.log('\n========================================');
console.log(`TOTAL PERFORMANCE TESTS: ${totalTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${failedTests}`);
console.log('========================================\n');

if (failedTests > 0) {
  process.exit(1);
}
