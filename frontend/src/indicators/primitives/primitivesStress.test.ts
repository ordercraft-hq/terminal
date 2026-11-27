declare const process: { exit: (code: number) => never };

import { BandFillPrimitive, type BandPoint } from './BandFillPrimitive.ts';
import {
  FootprintPrimitive,
  type FootprintBar,
} from './FootprintPrimitive.ts';

// ============================================================================
// Mock Canvas & lightweight-charts Environment
// ============================================================================

interface CanvasCall {
  method: string;
  args: any[];
}

class MockCanvasContext {
  public calls: CanvasCall[] = [];
  public nonFiniteCalls: CanvasCall[] = [];
  public fillStyle: any = '';
  public strokeStyle: any = '';
  public lineWidth: number = 1;
  public font: string = '';
  public textAlign: string = '';
  public textBaseline: string = '';

  private record(method: string, args: any[]) {
    this.calls.push({ method, args });
    for (const a of args) {
      if (typeof a === 'number' && !Number.isFinite(a)) {
        this.nonFiniteCalls.push({ method, args });
      }
    }
  }

  save() { this.record('save', []); }
  restore() { this.record('restore', []); }
  beginPath() { this.record('beginPath', []); }
  closePath() { this.record('closePath', []); }
  fill() { this.record('fill', []); }
  stroke() { this.record('stroke', []); }
  moveTo(x: number, y: number) { this.record('moveTo', [x, y]); }
  lineTo(x: number, y: number) { this.record('lineTo', [x, y]); }
  fillRect(x: number, y: number, w: number, h: number) { this.record('fillRect', [x, y, w, h]); }
  strokeRect(x: number, y: number, w: number, h: number) { this.record('strokeRect', [x, y, w, h]); }
  fillText(text: string, x: number, y: number) { this.record('fillText', [text, x, y]); }
  setLineDash(segments: number[]) { this.record('setLineDash', segments); }
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

interface MockChartConfig {
  timeToCoord?: (time: any) => number | null;
  priceToCoord?: (price: number) => number | null;
}

function createMockEnvironment(config: MockChartConfig = {}) {
  const timeToCoord = config.timeToCoord ?? ((time: any) => {
    const t = Number(time);
    if (!Number.isFinite(t)) return null;
    return 100 + (t - 1000) * 0.5;
  });

  const priceToCoord = config.priceToCoord ?? ((price: number) => {
    if (!Number.isFinite(price)) return null;
    return 500 - price * 4;
  });

  const chart = {
    timeScale: () => ({
      timeToCoordinate: (t: any) => timeToCoord(t),
    }),
  };

  const series = {
    priceToCoordinate: (p: number) => priceToCoord(p),
  };

  const attachedParam = {
    chart: chart as any,
    series: series as any,
    requestUpdate: () => {},
  };

  return { chart, series, attachedParam };
}

// ============================================================================
// Test Suite Framework
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

// ============================================================================
// Tests
// ============================================================================

console.log('\n--- 1. INVARIANT 2.2: ZERO PIXEL COORDINATES IN STATE ---');

{
  const band = new BandFillPrimitive('rgba(0,0,255,0.2)', [
    { time: 1000, upper: 100, lower: 90 },
    { time: 1060, upper: 105, lower: 95 },
  ]);

  const { attachedParam } = createMockEnvironment();
  band.attached(attachedParam as any);

  const paneViews = band.paneViews();
  const renderer = paneViews[0]?.renderer();
  const target = new MockRenderingTarget();
  renderer?.draw(target as any);

  const bandStateStr = JSON.stringify(band);
  assert(!bandStateStr.includes('"x"') && !bandStateStr.includes('"y"'), 'BandFillPrimitive state contains zero pixel coordinates (x, y)');

  const footprint = new FootprintPrimitive({}, [
    {
      time: 1000,
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      totalVolume: 1000,
      delta: 200,
      pocPrice: 102,
      levels: [
        { price: 100, bidVolume: 300, askVolume: 400 },
        { price: 102, bidVolume: 500, askVolume: 600, isPOC: true },
      ],
    },
  ]);
  footprint.attached(attachedParam as any);
  const fpRenderer = footprint.paneViews()[0]?.renderer();
  const fpTarget = new MockRenderingTarget();
  fpRenderer?.draw(fpTarget as any);

  const fpStateStr = JSON.stringify(footprint);
  assert(!fpStateStr.includes('"x"') && !fpStateStr.includes('"y"'), 'FootprintPrimitive state contains zero pixel coordinates (x, y)');
}

console.log('\n--- 2. BANDFILL: HIGH / LOW CROSS-OVERS (UPPER < LOWER) ---');

{
  const crossoverData: BandPoint[] = [
    { time: 1000, upper: 100, lower: 80 },  // upper > lower
    { time: 1060, upper: 70, lower: 90 },   // crossover! upper < lower
    { time: 1120, upper: 60, lower: 95 },   // upper < lower
    { time: 1180, upper: 110, lower: 85 },  // crossover back! upper > lower
  ];

  const band = new BandFillPrimitive('rgba(41, 98, 255, 0.2)', crossoverData);
  const { attachedParam } = createMockEnvironment();
  band.attached(attachedParam as any);

  const target = new MockRenderingTarget();
  band.paneViews()[0]?.renderer()?.draw(target as any);

  assert(target.ctx.nonFiniteCalls.length === 0, 'No non-finite canvas calls during crossover');
  const fills = target.ctx.calls.filter(c => c.method === 'fill');
  assert(fills.length === 1, 'Flushed 1 complete polygon path through crossover');

  const lineTos = target.ctx.calls.filter(c => c.method === 'lineTo');
  assert(lineTos.length === 7, `Expected 7 lineTo segments through crossover, got ${lineTos.length}`);
}

console.log('\n--- 3. BANDFILL: INVERTED & NEGATIVE PRICE LEVELS ---');

{
  const negativePriceData: BandPoint[] = [
    { time: 1000, upper: -20, lower: -50 },
    { time: 1060, upper: -15, lower: -45 },
    { time: 1120, upper: -10, lower: -40 },
  ];

  const band = new BandFillPrimitive('rgba(41, 98, 255, 0.2)', negativePriceData);
  const { attachedParam } = createMockEnvironment();
  band.attached(attachedParam as any);

  const target = new MockRenderingTarget();
  band.paneViews()[0]?.renderer()?.draw(target as any);

  assert(target.ctx.nonFiniteCalls.length === 0, 'No non-finite coordinates for negative prices');
  const fills = target.ctx.calls.filter(c => c.method === 'fill');
  assert(fills.length === 1, 'Rendered band cleanly in negative price domain');

  const moveTos = target.ctx.calls.filter(c => c.method === 'moveTo');
  assert(moveTos.length === 1 && typeof moveTos[0].args[0] === 'number', 'Valid moveTo coordinate for negative prices');
}

console.log('\n--- 4. BANDFILL: MISSING / NAN / NULL BAR COORDINATES & SEGMENTS ---');

{
  const discontinuousData: BandPoint[] = [
    { time: 1000, upper: 100, lower: 90 },
    { time: 1060, upper: 105, lower: 95 },
    { time: 1120, upper: NaN, lower: 95 }, // Gap here
    { time: 1180, upper: 110, lower: 100 },
    { time: 1240, upper: 115, lower: 105 },
    { time: 1300, upper: 120, lower: 110 },
    { time: 1360, upper: null as any, lower: null as any }, // Gap here
    { time: 1420, upper: 130, lower: 120 }, // Single isolated point
    { time: 1480, upper: NaN, lower: NaN }, // Gap
    { time: 1540, upper: 140, lower: 130 },
    { time: 1600, upper: 145, lower: 135 },
  ];

  const band = new BandFillPrimitive('rgba(41, 98, 255, 0.2)', discontinuousData);
  const { attachedParam } = createMockEnvironment();
  band.attached(attachedParam as any);

  const target = new MockRenderingTarget();
  band.paneViews()[0]?.renderer()?.draw(target as any);

  assert(target.ctx.nonFiniteCalls.length === 0, 'Zero non-finite canvas calls during NaN/null breaks');
  const fills = target.ctx.calls.filter(c => c.method === 'fill');
  assert(fills.length === 3, `Expected exactly 3 separate polygon fills for discontinuous segments, got ${fills.length}`);
}

console.log('\n--- 5. BANDFILL: INFINITY / -INFINITY ROBUSTNESS (ADVERSARIAL CHALLENGE) ---');

{
  const infinityData: BandPoint[] = [
    { time: 1000, upper: 100, lower: 90 },
    { time: 1060, upper: Infinity, lower: 95 },
    { time: 1120, upper: 110, lower: -Infinity },
    { time: 1180, upper: 120, lower: 110 },
  ];

  const band = new BandFillPrimitive('rgba(41, 98, 255, 0.2)', infinityData);
  const { attachedParam } = createMockEnvironment({
    priceToCoord: (p: number) => {
      if (p === Infinity) return Infinity;
      if (p === -Infinity) return -Infinity;
      return 500 - p * 4;
    },
  });
  band.attached(attachedParam as any);

  const target = new MockRenderingTarget();
  band.paneViews()[0]?.renderer()?.draw(target as any);

  assert(
    target.ctx.nonFiniteCalls.length === 0,
    `BandFillPrimitive must filter out +/-Infinity coordinates (found ${target.ctx.nonFiniteCalls.length} non-finite canvas calls)`
  );
}

console.log('\n--- 6. FOOTPRINT: NAN TIME COORDINATE STABILITY (ADVERSARIAL CHALLENGE) ---');

{
  const fpDataWithNaN: FootprintBar[] = [
    {
      time: NaN, // Invalid timestamp yielding NaN coordinate
      open: 100, high: 110, low: 90, close: 105,
      totalVolume: 100, delta: 10,
      levels: [{ price: 100, bidVolume: 50, askVolume: 50 }],
    },
    {
      time: 1060,
      open: 100, high: 110, low: 90, close: 105,
      totalVolume: 100, delta: 10,
      levels: [{ price: 100, bidVolume: 50, askVolume: 50 }],
    },
  ];

  const fp = new FootprintPrimitive({}, fpDataWithNaN);
  const { attachedParam } = createMockEnvironment({
    timeToCoord: (t) => (isNaN(Number(t)) ? NaN : 200),
  });
  fp.attached(attachedParam as any);

  const target = new MockRenderingTarget();
  fp.paneViews()[0]?.renderer()?.draw(target as any);

  assert(
    target.ctx.nonFiniteCalls.length === 0,
    `FootprintPrimitive must safely ignore bars with NaN time coordinate (found ${target.ctx.nonFiniteCalls.length} non-finite calls)`
  );
}

console.log('\n--- 7. FOOTPRINT: NAN PRICE LEVEL COORDINATE STABILITY (ADVERSARIAL CHALLENGE) ---');

{
  const fpDataWithNaNLevel: FootprintBar[] = [
    {
      time: 1000,
      open: 100, high: 110, low: 90, close: 105,
      totalVolume: 100, delta: 10,
      levels: [
        { price: NaN, bidVolume: 50, askVolume: 50 },
        { price: 100, bidVolume: 50, askVolume: 50 },
      ],
    },
  ];

  const fp = new FootprintPrimitive({}, fpDataWithNaNLevel);
  const { attachedParam } = createMockEnvironment({
    priceToCoord: (p) => (isNaN(p) ? NaN : 500 - p * 4),
  });
  fp.attached(attachedParam as any);

  const target = new MockRenderingTarget();
  fp.paneViews()[0]?.renderer()?.draw(target as any);

  assert(
    target.ctx.nonFiniteCalls.length === 0,
    `FootprintPrimitive must safely ignore price levels with NaN coordinate (found ${target.ctx.nonFiniteCalls.length} non-finite calls)`
  );
}

console.log('\n--- 8. FOOTPRINT: INVERTED PRICE SCALE DELTA BADGE POSITIONING ---');

{
  const bar: FootprintBar = {
    time: 1000,
    open: 100, high: 120, low: 80, close: 110,
    totalVolume: 1000, delta: 200,
    levels: [
      { price: 90, bidVolume: 100, askVolume: 200 },
      { price: 110, bidVolume: 300, askVolume: 400 },
    ],
  };

  let badgeY = 0;
  const fp = new FootprintPrimitive({ showDelta: true }, [bar]);
  // Inverted price scale: high price (120) -> Y=200 (visually bottom), low price (80) -> Y=100 (visually top)
  const { attachedParam } = createMockEnvironment({
    priceToCoord: (p) => p * 2.5 - 100,
  });
  fp.attached(attachedParam as any);

  const target = new MockRenderingTarget();
  target.ctx.fillText = (text, _x, y) => {
    if (text.includes('200')) {
      badgeY = y;
    }
  };
  fp.paneViews()[0]?.renderer()?.draw(target as any);

  // Candlestick visual bottom on inverted scale is at Y=200 (for high=120).
  // Badge must be BELOW candlestick visual bottom (Y > 200), not at Y=146 (colliding with body).
  assert(
    badgeY > 200,
    `Delta badge on inverted price scale must be positioned below visual bar bottom (got badgeY=${badgeY}, expected > 200)`
  );
}

console.log('\n--- 9. FOOTPRINT: IMBALANCES & STACKED ZONES VERIFICATION ---');
{
  const bar1 = {
    time: 1000,
    open: 100,
    high: 105,
    low: 100,
    close: 104,
    totalVolume: 500,
    delta: 120,
    levels: [
      { price: 100, bidVolume: 10, askVolume: 100 },
      { price: 101, bidVolume: 10, askVolume: 90 },
      { price: 102, bidVolume: 10, askVolume: 80 },
      { price: 103, bidVolume: 10, askVolume: 70 },
      { price: 104, bidVolume: 10, askVolume: 60 },
    ],
  };
  const bar2 = {
    time: 1060,
    open: 104,
    high: 106,
    low: 103,
    close: 105,
    totalVolume: 300,
    delta: 50,
    levels: [
      { price: 103, bidVolume: 20, askVolume: 30 },
      { price: 104, bidVolume: 30, askVolume: 40 },
      { price: 105, bidVolume: 40, askVolume: 50 },
    ],
  };

  const fp = new FootprintPrimitive(
    {
      imbalanceRules: [
        {
          id: 'test_rule',
          name: '300% Delta 15',
          enabled: true,
          imbalancePercent: 300,
          deltaFilter: 15,
          deltaFilterEnabled: true,
          sellColor: '#d8b4e2',
          sellLineWidth: 1.0,
          sellLineStyle: 'solid',
          sellDisplay: true,
          buyColor: '#8da9c4',
          buyLineWidth: 1.0,
          buyLineStyle: 'solid',
          buyDisplay: true,
        },
      ],
      imbalanceGlobalSettings: {
        skipZeroValues: false,
        showStackedImbalances: true,
        showMitigatedZones: true,
        drawZoneBorders: false,
        stackedMinLevels: 3,
      },
    },
    [bar1, bar2]
  );

  const { attachedParam } = createMockEnvironment();
  const target = new MockRenderingTarget();
  fp.attached(attachedParam as any);
  fp.paneViews()[0]?.renderer()?.draw(target as any);

  assert(
    target.ctx.nonFiniteCalls.length === 0,
    `FootprintPrimitive imbalance rendering produced ${target.ctx.nonFiniteCalls.length} non-finite canvas calls`
  );

  const fpStateStr = JSON.stringify(fp);
  assert(
    !fpStateStr.includes('"x"') && !fpStateStr.includes('"y"'),
    'FootprintPrimitive with imbalance zones maintains strictly logical coordinates'
  );
}

// ============================================================================
// Summary
// ============================================================================

console.log('\n========================================');
console.log(`TOTAL TESTS: ${totalTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${failedTests}`);
console.log('========================================\n');

if (failedTests > 0) {
  console.log('Empirical challenge harness discovered vulnerabilities that must be addressed:');
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
  process.exit(1);
} else {
  process.exit(0);
}
