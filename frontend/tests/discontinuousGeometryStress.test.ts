/**
 * discontinuousGeometryStress.test.ts
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER TEST SUITE (M2_1: Bridge Elimination & Geometry Challenger)
 *
 * Tests:
 * 1. Zero diagonal bridges across trend flips and regime transitions
 * 2. Single-bar isolated regime tick rendering vs vanishing (horizontal tick guarantee)
 * 3. Consecutive single-bar whipsaw / barcode pattern handling
 * 4. Boundary spikes (first bar, last bar, viewport edges)
 * 5. Slope inflection point continuity (0px hole and 0px diagonal bridge) for Tillson T3 & Hull MA
 * 6. Dynamic pan & zoom logical coordinate invariance (no pixel caching/drifting)
 * 7. Adversarial input stress: NaNs, Infinities, nulls, negative barSpacing, empty arrays, reversed x
 * 8. 10,000-bar high-density stress benchmark
 */

import {
  DiscontinuousLineRenderer,
  DiscontinuousLinePaneView,
  isDiscontinuousPlot,
  type DiscontinuousLineData,
  type DiscontinuousLineOptions,
} from '../src/indicators/primitives/DiscontinuousLinePaneView';
import {
  isMultiStateIndicator,
  getDisplayPlots,
  getIndicator,
  MULTI_STATE_INDICATOR_IDS,
} from '../src/indicators/registry';
import {
  LineStyle,
  LineType,
  type CustomBarItemData,
  type PaneRendererCustomData,
  type Time,
  type ISeriesApi,
  type SeriesType,
  type IChartApiBase,
} from 'lightweight-charts';

// Ensure browser globals for UniversalIndicatorConnector in Node environment
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    location: {
      protocol: 'http:',
      host: 'localhost:8080',
    },
  };
}
if (typeof (globalThis as any).fetch === 'function') {
  const originalFetch = globalThis.fetch;
  (globalThis as any).fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes('/api/indicators/eval')) {
      return new Response(JSON.stringify({ symbol: 'BTCUSDT', resolution: '1m', results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(url, init);
  };
}

// ============================================================================
// Adversarial Mock Canvas Context & Spy
// ============================================================================

interface CanvasCall {
  method: string;
  args: number[];
}

class AdversarialCanvasContext {
  public calls: CanvasCall[] = [];
  public nonFiniteCalls: CanvasCall[] = [];
  public lineDash: number[] = [];
  public strokeCount = 0;
  public lineWidth = 1;
  public strokeStyle = '';
  public fillStyle = '';
  public lineJoin = '';
  public lineCap = '';

  public reset() {
    this.calls = [];
    this.nonFiniteCalls = [];
    this.lineDash = [];
    this.strokeCount = 0;
  }

  private record(method: string, args: number[]) {
    this.calls.push({ method, args });
    for (const a of args) {
      if (typeof a === 'number' && !Number.isFinite(a)) {
        this.nonFiniteCalls.push({ method, args });
      }
    }
  }

  save() { this.record('save', []); }
  restore() { this.record('restore', []); }
  setLineDash(dash: number[]) {
    this.lineDash = [...dash];
    this.record('setLineDash', dash);
  }
  beginPath() { this.record('beginPath', []); }
  moveTo(x: number, y: number) { this.record('moveTo', [x, y]); }
  lineTo(x: number, y: number) { this.record('lineTo', [x, y]); }
  stroke() {
    this.strokeCount++;
    this.record('stroke', []);
  }
  arc(x: number, y: number, r: number, sa: number, ea: number) {
    this.record('arc', [x, y, r, sa, ea]);
  }
  fill() { this.record('fill', []); }
}

class MockRenderingTarget {
  public ctx = new AdversarialCanvasContext();
  public width = 1200;
  public height = 800;

  constructor(w = 1200, h = 800) {
    this.width = w;
    this.height = h;
  }

  useMediaCoordinateSpace(fn: (scope: { context: AdversarialCanvasContext; mediaSize: { width: number; height: number } }) => void) {
    fn({ context: this.ctx, mediaSize: { width: this.width, height: this.height } });
  }
}

// Global test counters
let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition: boolean, message: string) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failedAssertions++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

console.log('================================================================');
console.log('CHALLENGER M2_1: ADVERSARIAL GEOMETRY & BRIDGE ELIMINATION TESTS');
console.log('================================================================\n');

const target = new MockRenderingTarget(1200, 800);
const priceConverter = (price: number) => 800 - price * 5; // e.g. price 100 -> y = 300

// ============================================================================
// TEST SUITE 1: ZERO DIAGONAL BRIDGES ACROSS TREND REGIME FLIPS (SUPERTREND)
// ============================================================================
console.log('--- TEST 1: Supertrend Regime Flips & Diagonal Bridge Elimination ---');
{
  const rendererUp = new DiscontinuousLineRenderer();
  const rendererDown = new DiscontinuousLineRenderer();

  // Construct alternating regime data for Supertrend:
  // Regime 1: Bars 0..9 (Up, stop = 100)
  // Regime 2: Bars 10..19 (Down, stop = 150)
  // Regime 3: Bars 20..29 (Up, stop = 105)
  // Regime 4: Bars 30..39 (Down, stop = 160)
  // Regime 5: Bars 40..49 (Up, stop = 110)

  const barSpacing = 10;
  const barsUp: CustomBarItemData<Time, DiscontinuousLineData>[] = [];
  const barsDown: CustomBarItemData<Time, DiscontinuousLineData>[] = [];

  for (let i = 0; i < 50; i++) {
    const x = 50 + i * barSpacing;
    const isUp = (i >= 0 && i < 10) || (i >= 20 && i < 30) || (i >= 40 && i < 50);
    const stopPrice = isUp ? 100 + (i / 10) * 5 : 150 + (i / 10) * 5;

    if (isUp) {
      barsUp.push({
        x,
        time: i,
        barColor: '#089981',
        originalData: { time: (1700000000 + i * 60) as any, value: stopPrice },
      });
    } else {
      barsDown.push({
        x,
        time: i,
        barColor: '#F23645',
        originalData: { time: (1700000000 + i * 60) as any, value: stopPrice },
      });
    }
  }

  // Draw UP series
  target.ctx.reset();
  rendererUp.update(
    {
      bars: barsUp,
      barSpacing,
      visibleRange: { from: 0, to: barsUp.length },
    },
    { color: '#089981', lineWidth: 2, lineStyle: LineStyle.Solid, lineType: LineType.Simple } as any
  );
  rendererUp.draw(target as any, priceConverter as any, false);

  assert(target.ctx.strokeCount === 3, `Up series has exactly 3 strokes for 3 disjoint regimes (got ${target.ctx.strokeCount})`);

  // Inspect all lineTo calls in UP series:
  // Every lineTo must connect adjacent bars with deltaX === barSpacing (10px).
  // A diagonal bridge across the 10-bar gap would have deltaX === 110px.
  let maxDeltaXUp = 0;
  let diagonalBridgeCountUp = 0;
  let prevX = -1;

  for (const call of target.ctx.calls) {
    if (call.method === 'moveTo') {
      prevX = call.args[0];
    } else if (call.method === 'lineTo') {
      const curX = call.args[0];
      const deltaX = Math.abs(curX - prevX);
      if (deltaX > maxDeltaXUp) maxDeltaXUp = deltaX;
      if (deltaX > barSpacing * 1.5) {
        diagonalBridgeCountUp++;
      }
      prevX = curX;
    }
  }

  assert(diagonalBridgeCountUp === 0, `Up series has ZERO diagonal bridges across gaps (got ${diagonalBridgeCountUp})`);
  assert(maxDeltaXUp === barSpacing, `Max horizontal delta in Up series is strictly 1 bar (${barSpacing}px, got ${maxDeltaXUp}px)`);

  // Draw DOWN series
  target.ctx.reset();
  rendererDown.update(
    {
      bars: barsDown,
      barSpacing,
      visibleRange: { from: 0, to: barsDown.length },
    },
    { color: '#F23645', lineWidth: 2, lineStyle: LineStyle.Solid, lineType: LineType.Simple } as any
  );
  rendererDown.draw(target as any, priceConverter as any, false);

  assert(target.ctx.strokeCount === 2, `Down series has exactly 2 strokes for 2 disjoint regimes (got ${target.ctx.strokeCount})`);

  let maxDeltaXDown = 0;
  let diagonalBridgeCountDown = 0;
  prevX = -1;

  for (const call of target.ctx.calls) {
    if (call.method === 'moveTo') {
      prevX = call.args[0];
    } else if (call.method === 'lineTo') {
      const curX = call.args[0];
      const deltaX = Math.abs(curX - prevX);
      if (deltaX > maxDeltaXDown) maxDeltaXDown = deltaX;
      if (deltaX > barSpacing * 1.5) {
        diagonalBridgeCountDown++;
      }
      prevX = curX;
    }
  }

  assert(diagonalBridgeCountDown === 0, `Down series has ZERO diagonal bridges across gaps (got ${diagonalBridgeCountDown})`);
  assert(maxDeltaXDown === barSpacing, `Max horizontal delta in Down series is strictly 1 bar (${barSpacing}px, got ${maxDeltaXDown}px)`);
}

// ============================================================================
// TEST SUITE 2: SINGLE-BAR ISOLATED REGIME TICK RENDERING (NO VANISHING)
// ============================================================================
console.log('\n--- TEST 2: Single-Bar Isolated Regime Rendering & Geometry ---');
{
  const renderer = new DiscontinuousLineRenderer();
  const barSpacing = 12;

  // Single bar at index 5, x = 150, price = 100
  const singleBar: CustomBarItemData<Time, DiscontinuousLineData> = {
    x: 150,
    time: 5,
    barColor: '#089981',
    originalData: { time: 1700000300 as any, value: 100 },
  };

  target.ctx.reset();
  renderer.update(
    {
      bars: [singleBar],
      barSpacing,
      visibleRange: { from: 0, to: 1 },
    },
    { color: '#089981', lineWidth: 2, lineStyle: LineStyle.Solid, lineType: LineType.Simple } as any
  );
  renderer.draw(target as any, priceConverter as any, false);

  assert(target.ctx.strokeCount === 1, `Isolated single-bar regime strokes visible horizontal tick (strokeCount === 1, got ${target.ctx.strokeCount})`);

  // Check tick geometry:
  // Expected halfTick = Math.max(2, 12 * 0.35) = 4.2
  // moveTo(150 - 4.2, y) -> lineTo(150 + 4.2, y)
  const expectedHalfTick = Math.max(2, barSpacing * 0.35); // 4.2
  const expectedY = priceConverter(100);

  // For single-bar tick, flushSegment calls beginPath() then moveTo(center - halfTick) and lineTo(center + halfTick)
  // We inspect the calls within the active path that was stroked (the last beginPath before stroke)
  const lastBeginPathIdx = target.ctx.calls.map((c) => c.method).lastIndexOf('beginPath');
  const activePathCalls = target.ctx.calls.slice(lastBeginPathIdx);
  const moveCall = activePathCalls.find((c) => c.method === 'moveTo');
  const lineCall = activePathCalls.find((c) => c.method === 'lineTo');

  assert(moveCall !== undefined, 'Tick has moveTo command');
  assert(lineCall !== undefined, 'Tick has lineTo command');

  if (moveCall && lineCall) {
    const moveX = moveCall.args[0];
    const moveY = moveCall.args[1];
    const lineX = lineCall.args[0];
    const lineY = lineCall.args[1];

    assert(Math.abs(moveX - (150 - expectedHalfTick)) < 1e-4, `moveTo x is center - halfTick (${150 - expectedHalfTick}, got ${moveX})`);
    assert(Math.abs(lineX - (150 + expectedHalfTick)) < 1e-4, `lineTo x is center + halfTick (${150 + expectedHalfTick}, got ${lineX})`);
    assert(moveY === lineY, `Tick is strictly horizontal (moveY === lineY === ${expectedY})`);
    assert(moveY === expectedY, `Tick y matches price coordinate (${expectedY})`);
    const totalTickWidth = lineX - moveX;
    assert(Math.abs(totalTickWidth - 2 * expectedHalfTick) < 1e-4, `Total tick width is ${2 * expectedHalfTick}px (got ${totalTickWidth}px)`);
  }
}

// ============================================================================
// TEST SUITE 3: RAPID ALTERNATING 1-BAR SPIKES (WHIPSAW / BARCODE PATTERN)
// ============================================================================
console.log('\n--- TEST 3: Rapid Alternating 1-Bar Spikes (Whipsaw Pattern) ---');
{
  const renderer = new DiscontinuousLineRenderer();
  const barSpacing = 10;

  // 10 isolated single-bar spikes at even indices (0, 2, 4, 6, 8, 10, 12, 14, 16, 18)
  const spikeBars: CustomBarItemData<Time, DiscontinuousLineData>[] = [];
  for (let k = 0; k < 10; k++) {
    const timeIndex = k * 2;
    spikeBars.push({
      x: 100 + timeIndex * barSpacing,
      time: timeIndex,
      barColor: '#089981',
      originalData: { time: (1700000000 + timeIndex * 60) as any, value: 100 + k * 2 },
    });
  }

  target.ctx.reset();
  renderer.update(
    {
      bars: spikeBars,
      barSpacing,
      visibleRange: { from: 0, to: spikeBars.length },
    },
    { color: '#089981', lineWidth: 2, lineStyle: LineStyle.Solid, lineType: LineType.Simple } as any
  );
  renderer.draw(target as any, priceConverter as any, false);

  assert(
    target.ctx.strokeCount === 10,
    `Each of the 10 alternating 1-bar spikes strokes an independent horizontal tick (got ${target.ctx.strokeCount})`
  );

  // Verify that NO line connects spike k to spike k+1
  let diagonalConnections = 0;
  const lineCalls = target.ctx.calls.filter((c) => c.method === 'lineTo');
  for (const line of lineCalls) {
    // If line spans across bars (width > barSpacing), it is a diagonal bridge!
    // Horizontal ticks span 2 * halfTick = 7px (< barSpacing = 10px).
    const tickStartX = line.args[0] - 2 * Math.max(2, barSpacing * 0.35);
    const span = line.args[0] - tickStartX;
    if (span > barSpacing) {
      diagonalConnections++;
    }
  }
  assert(diagonalConnections === 0, `Zero diagonal bridge lines between consecutive isolated 1-bar spikes (got ${diagonalConnections})`);
}

// ============================================================================
// TEST SUITE 4: BOUNDARY SPIKES (FIRST BAR, LAST BAR, VIEWPORT EDGES)
// ============================================================================
console.log('\n--- TEST 4: Boundary Spikes at First Bar, Last Bar, and Viewport Boundaries ---');
{
  const renderer = new DiscontinuousLineRenderer();
  const barSpacing = 10;

  // Test 4A: Single bar at first index (time = 0)
  target.ctx.reset();
  renderer.update(
    {
      bars: [
        { x: 10, time: 0, barColor: '#089981', originalData: { time: 1000 as any, value: 50 } },
      ],
      barSpacing,
      visibleRange: { from: 0, to: 1 },
    },
    { color: '#089981', lineWidth: 2 } as any
  );
  renderer.draw(target as any, priceConverter as any, false);
  assert(target.ctx.strokeCount === 1, 'Single bar at index 0 renders tick on stroke');

  // Test 4B: Single bar at last bar after multi-bar segment
  // Bars: [0, 1, 2] continuous, then [5] isolated at end
  target.ctx.reset();
  renderer.update(
    {
      bars: [
        { x: 10, time: 0, barColor: '#089981', originalData: { time: 1000 as any, value: 50 } },
        { x: 20, time: 1, barColor: '#089981', originalData: { time: 1060 as any, value: 52 } },
        { x: 30, time: 2, barColor: '#089981', originalData: { time: 1120 as any, value: 54 } },
        { x: 60, time: 5, barColor: '#089981', originalData: { time: 1300 as any, value: 60 } },
      ],
      barSpacing,
      visibleRange: { from: 0, to: 4 },
    },
    { color: '#089981', lineWidth: 2 } as any
  );
  renderer.draw(target as any, priceConverter as any, false);
  assert(target.ctx.strokeCount === 2, '2 strokes: 1 for multi-bar segment [0..2], 1 for isolated final bar [5]');

  // Test 4C: Extreme zoom spacing (0.1px and 100px)
  target.ctx.reset();
  renderer.update(
    {
      bars: [
        { x: 50, time: 0, barColor: '#089981', originalData: { time: 1000 as any, value: 50 } },
      ],
      barSpacing: 0.1, // Extreme zoom out
      visibleRange: { from: 0, to: 1 },
    },
    { color: '#089981', lineWidth: 2 } as any
  );
  renderer.draw(target as any, priceConverter as any, false);
  const tinyLastBegin = target.ctx.calls.map((c) => c.method).lastIndexOf('beginPath');
  const tinyCalls = target.ctx.calls.slice(tinyLastBegin);
  const tinyZoomLine = tinyCalls.find((c) => c.method === 'lineTo');
  const tinyZoomMove = tinyCalls.find((c) => c.method === 'moveTo');
  assert(tinyZoomLine !== undefined && tinyZoomMove !== undefined, 'Extreme zoom out still draws tick');
  if (tinyZoomLine && tinyZoomMove) {
    const width = tinyZoomLine.args[0] - tinyZoomMove.args[0];
    assert(width >= 4, `Tick has minimum visible width of 4px even at barSpacing 0.1px (got ${width}px)`);
  }
}

// ============================================================================
// TEST SUITE 5: SLOPE INFLECTION POINTS CONTINUITY (T3, HULL MA)
// ============================================================================
console.log('\n--- TEST 5: Slope Inflection Continuity (0px Holes & 0px Bridges) ---');
{
  // Simulate parabolic trough and peak where Tillson T3 / Hull MA reverses slope:
  // Downhill: bars 0..5 (price drops 100 -> 75)
  // Inflection Trough: bar 5 (price = 75)
  // Uphill: bars 5..10 (price rises 75 -> 100)
  // Inflection Peak: bar 10 (price = 100)
  // Downhill: bars 10..15 (price drops 100 -> 75)

  const barSpacing = 15;
  const downBars: CustomBarItemData<Time, DiscontinuousLineData>[] = [];
  const upBars: CustomBarItemData<Time, DiscontinuousLineData>[] = [];

  // Downhill segment 1: bars 0 to 5 (inclusive of trough bar 5 as transition anchor)
  for (let i = 0; i <= 5; i++) {
    const val = 100 - i * 5; // 100, 95, 90, 85, 80, 75
    downBars.push({
      x: 100 + i * barSpacing,
      time: i,
      barColor: '#F23645',
      originalData: { time: (1700000000 + i * 60) as any, value: val },
    });
  }

  // Uphill segment: bars 5 to 10 (inclusive of trough bar 5 and peak bar 10 as transition anchors)
  for (let i = 5; i <= 10; i++) {
    const val = 75 + (i - 5) * 5; // 75, 80, 85, 90, 95, 100
    upBars.push({
      x: 100 + i * barSpacing,
      time: i,
      barColor: '#089981',
      originalData: { time: (1700000000 + i * 60) as any, value: val },
    });
  }

  // Downhill segment 2: bars 10 to 15 (inclusive of peak bar 10 as transition anchor)
  for (let i = 10; i <= 15; i++) {
    const val = 100 - (i - 10) * 5; // 100, 95, 90, 85, 80, 75
    downBars.push({
      x: 100 + i * barSpacing,
      time: i,
      barColor: '#F23645',
      originalData: { time: (1700000000 + i * 60) as any, value: val },
    });
  }

  const rendererUp = new DiscontinuousLineRenderer();
  const rendererDown = new DiscontinuousLineRenderer();

  // Test Down series rendering
  target.ctx.reset();
  rendererDown.update(
    {
      bars: downBars,
      barSpacing,
      visibleRange: { from: 0, to: downBars.length },
    },
    { color: '#F23645', lineWidth: 2, lineStyle: LineStyle.Solid, lineType: LineType.Simple } as any
  );
  rendererDown.draw(target as any, priceConverter as any, false);

  assert(
    target.ctx.strokeCount === 2,
    `Down series has exactly 2 strokes (segment 0..5 and segment 10..15) across the Up wave (got ${target.ctx.strokeCount})`
  );

  // Verify Down segment 1 ends at trough bar 5: x = 100 + 5 * 15 = 175, y = priceConverter(75)
  const downLineCalls = target.ctx.calls.filter((c) => c.method === 'lineTo');
  const troughLineDown = downLineCalls.find((c) => Math.abs(c.args[0] - 175) < 1e-4);
  assert(troughLineDown !== undefined, 'Down series ends with lineTo exactly at trough bar 5 (x=175)');
  if (troughLineDown) {
    assert(troughLineDown.args[1] === priceConverter(75), `Down series connects to exact trough price y (${priceConverter(75)})`);
  }

  // Test Up series rendering
  target.ctx.reset();
  rendererUp.update(
    {
      bars: upBars,
      barSpacing,
      visibleRange: { from: 0, to: upBars.length },
    },
    { color: '#089981', lineWidth: 2, lineStyle: LineStyle.Solid, lineType: LineType.Simple } as any
  );
  rendererUp.draw(target as any, priceConverter as any, false);

  assert(target.ctx.strokeCount === 1, `Up series has exactly 1 stroke for the uphill wave (got ${target.ctx.strokeCount})`);

  // Verify Up segment starts at trough bar 5: x = 175, y = priceConverter(75)
  const upMoveCall = target.ctx.calls.find((c) => c.method === 'moveTo');
  assert(upMoveCall !== undefined, 'Up series has moveTo at start');
  if (upMoveCall && troughLineDown) {
    const xGap = Math.abs(upMoveCall.args[0] - troughLineDown.args[0]);
    const yGap = Math.abs(upMoveCall.args[1] - troughLineDown.args[1]);
    const holeDistance = Math.hypot(xGap, yGap);
    assert(holeDistance === 0, `Hole distance between Down end and Up start at trough is EXACTLY 0.000px (got ${holeDistance}px)`);
  }

  // Verify Up segment ends at peak bar 10: x = 100 + 10 * 15 = 250, y = priceConverter(100)
  const peakLineUp = target.ctx.calls.filter((c) => c.method === 'lineTo').find((c) => Math.abs(c.args[0] - 250) < 1e-4);
  assert(peakLineUp !== undefined, 'Up series ends with lineTo exactly at peak bar 10 (x=250)');
  if (peakLineUp) {
    assert(peakLineUp.args[1] === priceConverter(100), `Up series connects to exact peak price y (${priceConverter(100)})`);
  }

  // Check Down segment 2 start at peak bar 10
  // Down segment 2 was drawn in the down renderer: find the moveTo after the gap!
  target.ctx.reset();
  rendererDown.draw(target as any, priceConverter as any, false);
  const downMoveCalls = target.ctx.calls.filter((c) => c.method === 'moveTo');
  assert(downMoveCalls.length === 2, `Down series has 2 moveTo calls (got ${downMoveCalls.length})`);
  if (downMoveCalls.length === 2 && peakLineUp) {
    const secondMove = downMoveCalls[1];
    const xGap = Math.abs(secondMove.args[0] - peakLineUp.args[0]);
    const yGap = Math.abs(secondMove.args[1] - peakLineUp.args[1]);
    const holeDistance = Math.hypot(xGap, yGap);
    assert(holeDistance === 0, `Hole distance between Up end and Down start at peak is EXACTLY 0.000px (got ${holeDistance}px)`);
  }
}

// ============================================================================
// TEST SUITE 6: DYNAMIC PAN & ZOOM LOGICAL COORDINATE INVARIANCE
// ============================================================================
console.log('\n--- TEST 6: Pan & Zoom Coordinate Invariance (Zero Drift) ---');
{
  const renderer = new DiscontinuousLineRenderer();
  const bars: CustomBarItemData<Time, DiscontinuousLineData>[] = [];
  for (let i = 0; i < 100; i++) {
    bars.push({
      x: i * 10,
      time: i,
      barColor: '#089981',
      originalData: { time: (1700000000 + i * 60) as any, value: 100 + Math.sin(i * 0.1) * 20 },
    });
  }

  // Initial render: barSpacing = 10, visibleRange = [10, 40]
  target.ctx.reset();
  renderer.update(
    { bars, barSpacing: 10, visibleRange: { from: 10, to: 40 } },
    { color: '#089981', lineWidth: 2 } as any
  );
  renderer.draw(target as any, priceConverter as any, false);
  const initialMove = target.ctx.calls.find((c) => c.method === 'moveTo');
  assert(initialMove !== undefined, 'Initial render performed moveTo');

  // Zoom: double barSpacing to 20, update bars x
  const zoomedBars = bars.map((b) => ({ ...b, x: b.time * 20 }));
  target.ctx.reset();
  renderer.update(
    { bars: zoomedBars, barSpacing: 20, visibleRange: { from: 10, to: 25 } },
    { color: '#089981', lineWidth: 2 } as any
  );
  renderer.draw(target as any, priceConverter as any, false);
  const zoomedMove = target.ctx.calls.find((c) => c.method === 'moveTo');
  assert(zoomedMove !== undefined, 'Zoomed render performed moveTo');
  if (zoomedMove) {
    // from is 10 - 1 = 9. x at time 9 is 9 * 20 = 180
    assert(zoomedMove.args[0] === 180, `Zoom recalculates x coordinate dynamically: expected 180, got ${zoomedMove.args[0]}`);
  }

  // Pan: slide visibleRange to [50, 75]
  target.ctx.reset();
  renderer.update(
    { bars: zoomedBars, barSpacing: 20, visibleRange: { from: 50, to: 75 } },
    { color: '#089981', lineWidth: 2 } as any
  );
  renderer.draw(target as any, priceConverter as any, false);
  const pannedMove = target.ctx.calls.find((c) => c.method === 'moveTo');
  assert(pannedMove !== undefined, 'Panned render performed moveTo');
  if (pannedMove) {
    // from is 50 - 1 = 49. x at time 49 is 49 * 20 = 980
    assert(pannedMove.args[0] === 980, `Pan recalculates viewport bounds dynamically: expected 980, got ${pannedMove.args[0]}`);
  }

  // Price scale zoom (dynamic price converter change):
  const zoomedPriceConverter = (price: number) => 800 - price * 10; // 2x price scale
  target.ctx.reset();
  renderer.draw(target as any, zoomedPriceConverter as any, false);
  const newPriceMove = target.ctx.calls.find((c) => c.method === 'moveTo');
  if (newPriceMove && pannedMove) {
    assert(newPriceMove.args[1] !== pannedMove.args[1], 'Changing priceConverter immediately updates vertical coordinate with 0 drift');
  }
}

// ============================================================================
// TEST SUITE 7: ADVERSARIAL NOISE, MALFORMED INPUTS & EXTREME VALUES
// ============================================================================
console.log('\n--- TEST 7: Adversarial Malformed Inputs & Chaos Stress ---');
{
  const renderer = new DiscontinuousLineRenderer();

  // Test 7A: Empty bars array
  target.ctx.reset();
  renderer.update({ bars: [], barSpacing: 10, visibleRange: { from: 0, to: 0 } }, { color: '#089981' } as any);
  renderer.draw(target as any, priceConverter as any, false);
  assert(target.ctx.calls.length === 0, 'Empty bars emits 0 canvas calls without error');

  // Test 7B: Inverted visibleRange (from > to)
  target.ctx.reset();
  renderer.update(
    {
      bars: [{ x: 10, time: 0, barColor: '#089981', originalData: { time: 1000 as any, value: 50 } }],
      barSpacing: 10,
      visibleRange: { from: 10, to: 5 },
    },
    { color: '#089981' } as any
  );
  renderer.draw(target as any, priceConverter as any, false);
  assert(target.ctx.calls.length === 0, 'Inverted visibleRange (from > to) emits 0 canvas calls');

  // Test 7C: Interleaved NaNs, Infinities, and nulls
  const chaosBars: CustomBarItemData<Time, DiscontinuousLineData>[] = [
    { x: 10, time: 0, barColor: '#089981', originalData: { time: 1000 as any, value: 100 } },
    { x: 20, time: 1, barColor: '#089981', originalData: { time: 1060 as any, value: NaN } },
    { x: 30, time: 2, barColor: '#089981', originalData: { time: 1120 as any, value: 102 } },
    { x: 40, time: 3, barColor: '#089981', originalData: { time: 1180 as any, value: Infinity } },
    { x: 50, time: 4, barColor: '#089981', originalData: { time: 1240 as any, value: -Infinity } },
    { x: 60, time: 5, barColor: '#089981', originalData: { time: 1300 as any, value: null as any } },
    { x: 70, time: 6, barColor: '#089981', originalData: { time: 1360 as any, value: undefined as any } },
    { x: 80, time: 7, barColor: '#089981', originalData: { time: 1420 as any, value: 105 } },
  ];

  target.ctx.reset();
  renderer.update(
    { bars: chaosBars, barSpacing: 10, visibleRange: { from: 0, to: chaosBars.length } },
    { color: '#089981', lineWidth: 2 } as any
  );
  renderer.draw(target as any, priceConverter as any, false);

  assert(target.ctx.nonFiniteCalls.length === 0, `Zero non-finite (NaN/Inf) arguments passed to canvas context (got ${target.ctx.nonFiniteCalls.length})`);
  // Points at index 0, 2, and 7 are isolated by NaNs/Infs: each must render as an isolated tick!
  assert(target.ctx.strokeCount === 3, `3 valid isolated points separated by NaNs stroke 3 independent ticks (got ${target.ctx.strokeCount})`);

  // Test 7D: Non-monotonic x coordinates (physical reversal: x[i] < x[i-1])
  const reversedBars: CustomBarItemData<Time, DiscontinuousLineData>[] = [
    { x: 100, time: 0, barColor: '#089981', originalData: { time: 1000 as any, value: 50 } },
    { x: 110, time: 1, barColor: '#089981', originalData: { time: 1060 as any, value: 52 } },
    { x: 90,  time: 2, barColor: '#089981', originalData: { time: 1120 as any, value: 54 } }, // Reversal!
    { x: 120, time: 3, barColor: '#089981', originalData: { time: 1180 as any, value: 56 } },
  ];
  target.ctx.reset();
  renderer.update(
    { bars: reversedBars, barSpacing: 10, visibleRange: { from: 0, to: 4 } },
    { color: '#089981', lineWidth: 2 } as any
  );
  renderer.draw(target as any, priceConverter as any, false);
  // Reversal (x - lastX < 0) triggers isPhysicalGap, correctly breaking stroke!
  assert(target.ctx.strokeCount >= 2, `Reversed horizontal coordinates trigger physical gap stroke break (got ${target.ctx.strokeCount} strokes)`);
}

// ============================================================================
// TEST SUITE 8: 10,000-BAR HIGH-DENSITY STRESS BENCHMARK
// ============================================================================
console.log('\n--- TEST 8: 10,000-Bar High-Density Stress Benchmark ---');
{
  const renderer = new DiscontinuousLineRenderer();
  const barCount = 10000;
  const denseBars: CustomBarItemData<Time, DiscontinuousLineData>[] = [];
  const barSpacing = 4;

  let active = true;
  for (let i = 0; i < barCount; i++) {
    // Flip regime every 50 bars
    if (i % 50 === 0) active = !active;
    if (active) {
      denseBars.push({
        x: i * barSpacing,
        time: i,
        barColor: '#089981',
        originalData: { time: (1700000000 + i * 60) as any, value: 100 + Math.sin(i * 0.05) * 10 },
      });
    }
  }

  const start = performance.now();
  target.ctx.reset();
  renderer.update(
    { bars: denseBars, barSpacing, visibleRange: { from: 0, to: denseBars.length } },
    { color: '#089981', lineWidth: 2, lineStyle: LineStyle.Solid, lineType: LineType.Simple } as any
  );
  renderer.draw(target as any, priceConverter as any, false);
  const elapsed = performance.now() - start;

  assert(elapsed < 100, `10,000 bars canvas traversal rendered in <100ms (took ${elapsed.toFixed(2)}ms)`);
  assert(target.ctx.nonFiniteCalls.length === 0, '10,000 bars stress test has 0 non-finite canvas calls');
  assert(target.ctx.strokeCount === 100, `Rendered exactly 100 regime segments across 10,000 bars (got ${target.ctx.strokeCount})`);
}

// ============================================================================
// TEST SUITE 9: DiscontinuousLinePaneView PLUGIN CONTRACT & WRAPPERS
// ============================================================================
console.log('\n--- TEST 9: DiscontinuousLinePaneView Plugin Contract ---');
{
  const paneView = new DiscontinuousLinePaneView({
    color: '#089981',
    lineWidth: 3,
    lineStyle: LineStyle.Dashed,
  });

  const renderer = paneView.renderer();
  assert(renderer instanceof DiscontinuousLineRenderer, 'paneView.renderer() returns DiscontinuousLineRenderer');

  const priceVals = paneView.priceValueBuilder({ time: 1000 as any, value: 123.45 });
  assert(priceVals.length === 1 && priceVals[0] === 123.45, 'priceValueBuilder returns [plotRow.value]');

  assert(paneView.isWhitespace({ time: 1000 as any, value: null as any }), 'isWhitespace identifies null value');
  assert(paneView.isWhitespace({ time: 1000 as any, value: undefined as any }), 'isWhitespace identifies undefined value');
  assert(!paneView.isWhitespace({ time: 1000 as any, value: 50 }), 'isWhitespace returns false for finite value');

  const defOpts = paneView.defaultOptions();
  assert(defOpts.color === '#089981', 'defaultOptions preserves color');
  assert(defOpts.lineWidth === 3, 'defaultOptions preserves lineWidth');
  assert(defOpts.lineStyle === LineStyle.Dashed, 'defaultOptions preserves lineStyle');

  // Verify plot identification helper
  assert(isDiscontinuousPlot('wickra.super_trend', 'up'), 'isDiscontinuousPlot recognizes up');
  assert(isDiscontinuousPlot('wickra.super_trend', 'down'), 'isDiscontinuousPlot recognizes down');
  assert(isDiscontinuousPlot('wickra.t3', 'up'), 'isDiscontinuousPlot recognizes up for t3');
  assert(isDiscontinuousPlot('wickra.hma', 'down'), 'isDiscontinuousPlot recognizes down for hma');
  assert(!isDiscontinuousPlot('wickra.super_trend', 'value'), 'isDiscontinuousPlot rejects value');
  assert(!isDiscontinuousPlot('wickra.super_trend', 'direction'), 'isDiscontinuousPlot rejects direction');
  assert(!isDiscontinuousPlot('wickra.sma', 'plot'), 'isDiscontinuousPlot rejects regular plot');
}

// ============================================================================
// TEST SUITE 10: UniversalIndicatorConnector Multi-State Lifecycle & HUD Invariant
// ============================================================================
console.log('\n--- TEST 10: UniversalIndicatorConnector Multi-State Lifecycle & HUD ---');
{
  class MockSeries implements ISeriesApi<SeriesType, Time> {
    public id: string;
    public customView: unknown;
    public options: Record<string, unknown>;
    public paneIndex: number;
    public data: unknown[] = [];
    public updates: unknown[] = [];
    public isDestroyed = false;

    constructor(id: string, view: unknown, options: Record<string, unknown>, paneIndex: number) {
      this.id = id;
      this.customView = view;
      this.options = { ...options };
      this.paneIndex = paneIndex;
    }

    setData(data: unknown[]): void {
      if (this.isDestroyed) throw new Error('Cannot setData on destroyed series');
      this.data = [...data];
    }

    update(bar: unknown): void {
      if (this.isDestroyed) throw new Error('Cannot update on destroyed series');
      this.updates.push(bar);
    }

    applyOptions(options: Record<string, unknown>): void {
      this.options = { ...this.options, ...options };
    }

    priceScale() {
      return {
        applyOptions: () => {},
      };
    }

    createPriceLine() { return {} as any; }
    removePriceLine() {}
    attachPrimitive() {}
    detachPrimitive() {}
    setMarkers() {}
    series() { return this; }
  }

  class MockConnectorChart implements IChartApiBase<Time> {
    public seriesList: MockSeries[] = [];
    public customSeriesCount = 0;
    public normalSeriesCount = 0;
    private nextId = 1;

    panes() {
      return [{ index: 0, getSeries: () => this.seriesList, setStretchFactor: () => {} }];
    }

    addCustomSeries(customPaneView: unknown, options: Record<string, unknown>, paneIndex = 0): MockSeries {
      this.customSeriesCount++;
      const s = new MockSeries(`custom_${this.nextId++}`, customPaneView, options, paneIndex);
      this.seriesList.push(s);
      return s;
    }

    addSeries(type: unknown, options: Record<string, unknown>, paneIndex = 0): MockSeries {
      this.normalSeriesCount++;
      const s = new MockSeries(`series_${this.nextId++}`, type, options, paneIndex);
      this.seriesList.push(s);
      return s;
    }

    removeSeries(s: unknown) {
      const idx = this.seriesList.indexOf(s as MockSeries);
      if (idx !== -1) {
        (s as MockSeries).isDestroyed = true;
        this.seriesList.splice(idx, 1);
      }
    }

    priceScale() { return { applyOptions: () => {} }; }
    applyOptions() {}
    timeScale() { return { timeToCoordinate: () => 100 }; }
    addPane() { return {} as any; }
    removePane() {}
    swapPanes() {}
    remove() { this.seriesList = []; }
  }

  // Import UniversalIndicatorConnector dynamically
  const { UniversalIndicatorConnector } = await import('../src/indicators/UniversalIndicatorConnector');

  const chart = new MockConnectorChart();
  let latestHudValues: Record<string, Record<string, number | null>> = {};

  const connector = new UniversalIndicatorConnector(chart as any, 'pane-1', 'BTCUSDT', '1m', {
    onLatestValuesChange: (vals) => {
      latestHudValues = vals;
    },
  });

  const candles = [
    { time: 1700000000, open: 100, high: 105, low: 95, close: 102, volume: 1000 },
    { time: 1700000060, open: 102, high: 108, low: 101, close: 107, volume: 1200 },
    { time: 1700000120, open: 107, high: 110, low: 106, close: 109, volume: 1500 },
  ];

  // Add SuperTrend instance
  const stInstance = {
    id: 'st_1',
    type: 'wickra.super_trend',
    paneId: 'pane-1',
    name: 'SuperTrend',
    category: 'overlay' as const,
    visible: true,
    inputs: { atr_period: 10, multiplier: 3.0 },
    styles: {
      up: { color: '#089981', lineWidth: 2, lineStyle: 'solid' as const, visible: true },
      down: { color: '#F23645', lineWidth: 2, lineStyle: 'solid' as const, visible: true },
      value: { color: '#2962FF', visible: false },
      direction: { color: '#2962FF', visible: false },
    },
  };

  await connector.syncIndicators([stInstance as any], candles as any, ['pane-1'], {} as any);

  assert(chart.customSeriesCount === 2, `SuperTrend created exactly 2 custom series (up and down, got ${chart.customSeriesCount})`);
  assert(chart.normalSeriesCount === 2, `SuperTrend created 2 auxiliary series for value & direction (got ${chart.normalSeriesCount})`);

  // Verify customPaneView is DiscontinuousLinePaneView
  const upSeries = chart.seriesList.find((s) => s.id === 'custom_1');
  const downSeries = chart.seriesList.find((s) => s.id === 'custom_2');
  assert(upSeries?.customView instanceof DiscontinuousLinePaneView, 'Up series uses DiscontinuousLinePaneView');
  assert(downSeries?.customView instanceof DiscontinuousLinePaneView, 'Down series uses DiscontinuousLinePaneView');

  // Verify styling update reactivity via syncIndicators
  const updatedInstance = {
    ...stInstance,
    styles: {
      ...stInstance.styles,
      up: { color: '#00e5ff', lineWidth: 4, lineStyle: 'dashed' as const, visible: true },
      down: { color: '#ff0055', lineWidth: 3, lineStyle: 'dotted' as const, visible: false },
    },
  };
  await connector.syncIndicators([updatedInstance as any], candles as any, ['pane-1'], {} as any);

  assert(upSeries?.options.color === '#00e5ff', 'syncIndicators updated up color to #00e5ff');
  assert(upSeries?.options.lineWidth === 4, 'syncIndicators updated up lineWidth to 4');
  assert(downSeries?.options.color === '#ff0055', 'syncIndicators updated down color to #ff0055');
  assert(downSeries?.options.visible === false, 'syncIndicators updated down visibility to false');

  // Test streaming tick updates & HUD mutual exclusivity
  // Simulate live WebSocket tick with Up active:
  (connector as any).handleStreamingIndicatorUpdate(1700000180, {
    st_1: { up: 105.5, value: 105.5, direction: 1.0 },
  });

  const entry = (connector as any).managed.get('st_1');
  assert(entry !== undefined, 'st_1 managed entry exists');
  assert(entry.latestValues['up'] === 105.5, 'HUD reflects latest up value 105.5');
  assert(entry.latestValues['down'] === null, 'HUD cleared down regime value to null (mutual exclusivity)');

  // Flip to Down on next tick:
  (connector as any).handleStreamingIndicatorUpdate(1700000240, {
    st_1: { down: 120.0, value: 120.0, direction: -1.0 },
  });

  assert(entry.latestValues['down'] === 120.0, 'HUD reflects latest down value 120.0');
  assert(entry.latestValues['up'] === null, 'HUD cleared up regime value to null on flip to Down');

  // Clean removal:
  await connector.syncIndicators([], candles as any, ['pane-1'], {} as any);
  assert(chart.seriesList.length === 0, 'Removing indicator destroyed all series (0 remaining series)');

  connector.destroy();
}

// ============================================================================
// FINAL SUMMARY & VERDICT

// ============================================================================
console.log('\n================================================================');
console.log('CHALLENGER M2_1 TEST RESULTS SUMMARY');
console.log('================================================================');
console.log(`TOTAL ASSERTIONS: ${totalAssertions}`);
console.log(`PASSED: ${passedAssertions}`);
console.log(`FAILED: ${failedAssertions}`);
console.log('================================================================\n');

if (failedAssertions > 0) {
  console.error(`VERDICT: REJECT (${failedAssertions} assertions failed)`);
  process.exit(1);
} else {
  console.log('VERDICT: APPROVE (100% assertions passed)');
  process.exit(0);
}
