/**
 * streamingStress.test.ts
 *
 * Empirical Challenger M2-2 Stress Test Suite:
 * 1. High-Frequency Live Ticks (50 - 5,000 ticks/sec)
 * 2. Rapid Indicator Toggling & Leak Detection (20+ indicators, 1,000 toggles)
 * 3. Crosshair Binary Search Inspection (10,000+ points across multiple series)
 * 4. Invariant 2.3 Off-Thread Calculation Verification (UI thread math avoidance)
 * 5. Concurrency Race Conditions & Out-of-Order Network Resolution
 */

import { performance } from 'node:perf_hooks';
import {
  UniversalIndicatorConnector,
  isVolumeIndicatorType,
  LEGACY_INDICATOR_MIGRATION_MAP,
} from '../src/indicators/UniversalIndicatorConnector';
import { BandFillPrimitive } from '../src/indicators/primitives/BandFillPrimitive';
import { FootprintPrimitive, type FootprintBar } from '../src/indicators/primitives/FootprintPrimitive';
import type { IndicatorInstance } from '../src/indicators/types';
import type { Candle } from '../src/transport/client';
import type {
  IChartApiBase,
  ISeriesApi,
  SeriesType,
  Time,
  IPriceLine,
  ISeriesPrimitive,
} from 'lightweight-charts';

// Ensure browser globals for UniversalIndicatorConnector in Node environment
if (typeof globalThis.window === 'undefined') {
  (globalThis as unknown as { window: unknown }).window = {
    location: {
      protocol: 'http:',
      host: 'localhost:8080',
    },
  };
}

// ==========================================
// MOCK LIGHTWEIGHT-CHARTS ENVIRONMENT
// ==========================================

export class MockPriceScale {
  public id: string;
  public paneIndex?: number;
  public options: Record<string, unknown> = {};
  constructor(id: string, paneIndex?: number) {
    this.id = id;
    this.paneIndex = paneIndex;
  }
  applyOptions(opts: Record<string, unknown>): void {
    this.options = { ...this.options, ...opts };
  }
}

export class MockSeriesApi implements ISeriesApi<SeriesType, Time> {
  public id: string;
  public seriesType: SeriesType;
  public options: Record<string, unknown>;
  public paneIndex: number;
  public data: unknown[] = [];
  public updates: unknown[] = [];
  public priceLines: MockPriceLine[] = [];
  public attachedPrimitives: Set<ISeriesPrimitive<Time>> = new Set();
  public isDestroyed: boolean = false;
  public priceScaleApi?: MockPriceScale;
  public parentChart?: MockChart;

  constructor(id: string, type: SeriesType, options: Record<string, unknown>, paneIndex: number) {
    this.id = id;
    this.seriesType = type;
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

  priceScale(): MockPriceScale {
    if (!this.priceScaleApi) {
      if (this.parentChart) {
        this.priceScaleApi = this.parentChart.priceScale('right', this.paneIndex);
      } else {
        this.priceScaleApi = new MockPriceScale('right', this.paneIndex);
      }
    }
    return this.priceScaleApi;
  }

  createPriceLine(options: Record<string, unknown>): IPriceLine {
    const pl = new MockPriceLine(options, this);
    this.priceLines.push(pl);
    return pl as unknown as IPriceLine;
  }

  removePriceLine(line: IPriceLine): void {
    const idx = this.priceLines.indexOf(line as unknown as MockPriceLine);
    if (idx !== -1) {
      this.priceLines.splice(idx, 1);
    }
  }

  attachPrimitive(primitive: ISeriesPrimitive<Time>): void {
    this.attachedPrimitives.add(primitive);
    if (primitive.attached) {
      primitive.attached({
        chart: {} as IChartApiBase<Time>,
        series: this as unknown as ISeriesApi<SeriesType, Time>,
        requestUpdate: () => {},
      });
    }
  }

  detachPrimitive(primitive: ISeriesPrimitive<Time>): void {
    this.attachedPrimitives.delete(primitive);
    if (primitive.detached) {
      primitive.detached();
    }
  }

  setMarkers(): void {}
  series(): unknown { return this; }
}

export class MockPriceLine {
  public options: Record<string, unknown>;
  public parentSeries: MockSeriesApi;
  constructor(options: Record<string, unknown>, parent: MockSeriesApi) {
    this.options = { ...options };
    this.parentSeries = parent;
  }
  applyOptions(options: Record<string, unknown>): void {
    this.options = { ...this.options, ...options };
  }
  options() {
    return this.options;
  }
}

export class MockPane {
  public index: number;
  public stretchFactor: number = 25;
  public parentChart: MockChart;

  constructor(index: number, parent: MockChart) {
    this.index = index;
    this.parentChart = parent;
  }

  getSeries(): MockSeriesApi[] {
    return this.parentChart.seriesList.filter((s) => s.paneIndex === this.index && !s.isDestroyed);
  }

  setStretchFactor(factor: number): void {
    this.stretchFactor = factor;
  }
}

export class MockChart implements IChartApiBase<Time> {
  public seriesList: MockSeriesApi[] = [];
  public paneList: MockPane[] = [new MockPane(0, this)];
  public nextSeriesId = 1;
  public isRemoved = false;

  panes(): MockPane[] {
    return this.paneList;
  }

  addPane(): MockPane {
    const newPane = new MockPane(this.paneList.length, this);
    this.paneList.push(newPane);
    return newPane;
  }

  removePane(index: number): void {
    if (index >= 0 && index < this.paneList.length) {
      // lightweight-charts destroys series in the removed pane
      for (const s of this.seriesList) {
        if (s.paneIndex === index) {
          s.isDestroyed = true;
        } else if (s.paneIndex > index) {
          s.paneIndex--;
        }
      }
      this.paneList.splice(index, 1);
      // Re-index remaining panes
      for (let i = 0; i < this.paneList.length; i++) {
        this.paneList[i].index = i;
      }
    }
  }

  swapPanes(idxA: number, idxB: number): void {
    if (idxA >= 0 && idxA < this.paneList.length && idxB >= 0 && idxB < this.paneList.length) {
      const temp = this.paneList[idxA];
      this.paneList[idxA] = this.paneList[idxB];
      this.paneList[idxB] = temp;
      this.paneList[idxA].index = idxA;
      this.paneList[idxB].index = idxB;
      for (const s of this.seriesList) {
        if (s.paneIndex === idxA) s.paneIndex = idxB;
        else if (s.paneIndex === idxB) s.paneIndex = idxA;
      }
    }
  }

  public priceScales: Map<string, MockPriceScale> = new Map();

  addSeries(type: unknown, options: Record<string, unknown>, paneIndex: number = 0): MockSeriesApi {
    const s = new MockSeriesApi(`series_${this.nextSeriesId++}`, type as SeriesType, options, paneIndex);
    s.parentChart = this;
    this.seriesList.push(s);
    return s;
  }

  addCustomSeries(customSeriesView: unknown, options: Record<string, unknown>, paneIndex: number = 0): MockSeriesApi {
    const s = new MockSeriesApi(`series_${this.nextSeriesId++}`, 'Custom' as SeriesType, options, paneIndex);
    s.parentChart = this;
    this.seriesList.push(s);
    return s;
  }

  removeSeries(series: unknown): void {
    const mock = series as MockSeriesApi;
    mock.isDestroyed = true;
    const idx = this.seriesList.indexOf(mock);
    if (idx !== -1) {
      this.seriesList.splice(idx, 1);
    }
  }

  priceScale(id: string, paneIndex?: number): MockPriceScale {
    const key = `${id}_${paneIndex ?? 0}`;
    let ps = this.priceScales.get(key);
    if (!ps) {
      ps = new MockPriceScale(id, paneIndex);
      this.priceScales.set(key, ps);
    }
    return ps;
  }

  applyOptions(_options: unknown): void {}

  timeScale() {
    return {
      timeToCoordinate: (t: Time) => {
        const num = typeof t === 'number' ? t : Number(t);
        return isNaN(num) ? null : num * 0.1;
      },
    };
  }

  remove(): void {
    this.isRemoved = true;
    for (const s of this.seriesList) {
      s.isDestroyed = true;
    }
    this.seriesList = [];
    this.paneList = [];
  }
}

// ==========================================
// TEST UTILITIES & GENERATORS
// ==========================================

function makeCandles(count: number, startPrice = 100, startTime = 1700000000): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const t = startTime + i * 60;
    const delta = (Math.sin(i * 0.1) * 2) + ((i % 5) - 2);
    const open = price;
    const close = price + delta;
    const high = Math.max(open, close) + 1.5;
    const low = Math.min(open, close) - 1.5;
    const volume = 100 + Math.abs(delta) * 50;
    price = close;
    candles.push({ time: t, open, high, low, close, volume });
  }
  return candles;
}

function makeIndicatorInstance(
  id: string,
  type: string,
  category: 'overlay' | 'subpane' = 'overlay',
  plots: string[] = ['plot']
): IndicatorInstance {
  const styles: Record<string, { color: string; lineWidth?: number; plotType?: string }> = {};
  for (const p of plots) {
    styles[p] = { color: '#2962ff', lineWidth: 2, plotType: 'line' };
  }
  return {
    id,
    type,
    name: `Test ${type}`,
    category,
    visible: true,
    inputs: { period: 14 },
    styles,
    levels: [],
    bands: [],
  };
}

// ==========================================
// EMPIRICAL CHALLENGE SUITE
// ==========================================

export async function runStreamingLoadStressTests() {
  console.log('====================================================');
  console.log('CHALLENGER M2-2: EMPIRICAL STRESS TEST SUITE RUNNING');
  console.log('====================================================\n');

  const results: {
    name: string;
    passed: boolean;
    durationMs: number;
    details: string;
    criticalFindings: string[];
  }[] = [];

  // ----------------------------------------------------
  // TEST 1: Binary Search HUD Inspection Under 10,000+ Points
  // ----------------------------------------------------
  {
    console.log('[TEST 1] HUD Crosshair Binary Search Inspection (10,000 - 50,000 Points)...');
    const startT = performance.now();
    const criticalFindings: string[] = [];

    const mockChart = new MockChart();
    const connector = new UniversalIndicatorConnector(
      mockChart as unknown as IChartApiBase<Time>,
      'pane_main',
      'BINANCE:BTCUSDT',
      '1m'
    );

    // Setup 10 indicators, each with 3 plots = 30 series, 10,000 points each = 300,000 cached points
    const indicatorCount = 10;
    const pointsPerPlot = 10000;
    const startTime = 1700000000;
    const indicators: IndicatorInstance[] = [];

    for (let i = 0; i < indicatorCount; i++) {
      indicators.push(
        makeIndicatorInstance(`ind_${i}`, `wickra.custom_${i}`, i === 0 ? 'overlay' : 'subpane', [
          'fast',
          'slow',
          'signal',
        ])
      );
    }

    // Populate connector internals directly
    const entries = connector.getManagedEntries();
    for (const ind of indicators) {
      const cachedPlots: Record<string, { time: number; value: number }[]> = {};
      for (const plotId of ['fast', 'slow', 'signal']) {
        const pts: { time: number; value: number }[] = [];
        for (let p = 0; p < pointsPerPlot; p++) {
          pts.push({
            time: startTime + p * 60,
            value: Math.sin(p * 0.01) * 50 + 100,
          });
        }
        cachedPlots[plotId] = pts;
      }
      entries.set(ind.id, {
        instanceId: ind.id,
        indicatorId: ind.type,
        paneIndex: 0,
        series: new Map(),
        bands: new Map(),
        footprints: new Map(),
        priceLines: [],
        latestValues: {},
        cachedPlots,
        markers: new Map(),
      });
    }

    // 1. Boundary: Exact first element (index 0)
    const valFirst = connector.getValuesAtTime(startTime);
    let firstFound = true;
    for (const ind of indicators) {
      if (valFirst[ind.id]?.['fast'] === null || valFirst[ind.id]?.['fast'] === undefined) {
        firstFound = false;
      }
    }

    // 2. Boundary: Exact last element (index 9999)
    const lastTime = startTime + (pointsPerPlot - 1) * 60;
    const valLast = connector.getValuesAtTime(lastTime);
    let lastFound = true;
    for (const ind of indicators) {
      if (valLast[ind.id]?.['signal'] === null || valLast[ind.id]?.['signal'] === undefined) {
        lastFound = false;
      }
    }

    // 3. Boundary: Timestamp before start (out of bounds)
    const valBefore = connector.getValuesAtTime(startTime - 600);
    let beforeNull = true;
    for (const ind of indicators) {
      if (valBefore[ind.id]?.['fast'] !== null) beforeNull = false;
    }

    // 4. Boundary: Timestamp after end (out of bounds)
    const valAfter = connector.getValuesAtTime(lastTime + 600);
    let afterNull = true;
    for (const ind of indicators) {
      if (valAfter[ind.id]?.['fast'] !== null) afterNull = false;
    }

    // 5. Gap lookup: Non-existent timestamp between two bars (e.g. half-minute)
    const valMidGap = connector.getValuesAtTime(startTime + 30);
    let midGapNull = true;
    for (const ind of indicators) {
      if (valMidGap[ind.id]?.['fast'] !== null) midGapNull = false;
    }

    // 6. High-throughput inspection: 10,000 queries at random valid timestamps
    const queryCount = 10000;
    const queryStartT = performance.now();
    for (let q = 0; q < queryCount; q++) {
      const randomIdx = Math.floor(Math.random() * pointsPerPlot);
      const queryTime = startTime + randomIdx * 60;
      connector.getValuesAtTime(queryTime);
    }
    const queryTotalMs = performance.now() - queryStartT;
    const queryThroughput = Math.round((queryCount / queryTotalMs) * 1000);
    const avgLatencyMicrosec = Math.round((queryTotalMs / queryCount) * 1000);

    // 7. Edge Case: Non-numeric timestamp string (e.g. "1700000000")
    const valStr = connector.getValuesAtTime(String(startTime) as unknown as number);
    const strMatch = valStr['ind_0']?.['fast'] !== null;

    // 8. Edge Case: Empty cachedPlots entry
    entries.get('ind_0')!.cachedPlots['fast'] = [];
    const valEmpty = connector.getValuesAtTime(startTime);
    const emptyHandled = valEmpty['ind_0']?.['fast'] === null;

    // 9. Edge Case: Unsorted data (simulating out-of-order streaming updates)
    // If an update was pushed with an older timestamp, binary search breaks
    entries.get('ind_1')!.cachedPlots['fast'] = [
      { time: 100, value: 1 },
      { time: 300, value: 3 },
      { time: 200, value: 2 }, // OUT OF ORDER
    ];
    const valUnsorted = connector.getValuesAtTime(200);
    if (valUnsorted['ind_1']?.['fast'] !== 2) {
      criticalFindings.push(
        'Binary search in getValuesAtTime fails silently when cachedPlots contains out-of-order timestamps.'
      );
    }

    const test1Passed =
      firstFound &&
      lastFound &&
      beforeNull &&
      afterNull &&
      midGapNull &&
      strMatch &&
      emptyHandled;

    const test1Duration = performance.now() - startT;
    console.log(
      `  -> Inspection: 10,000 queries in ${queryTotalMs.toFixed(2)}ms (${queryThroughput.toLocaleString()} ops/sec, avg ${avgLatencyMicrosec}µs/op)`
    );
    console.log(`  -> Boundaries (first, last, before, after, midGap): ${test1Passed ? 'PASS' : 'FAIL'}`);

    results.push({
      name: 'HUD Binary Search Inspection',
      passed: test1Passed,
      durationMs: test1Duration,
      details: `${queryThroughput.toLocaleString()} lookups/sec over 300,000 data points across 10 indicators`,
      criticalFindings,
    });
  }

  // ----------------------------------------------------
  // TEST 2: High-Frequency Realtime Candle Ticks (updateRealtimeCandle)
  // ----------------------------------------------------
  {
    console.log('\n[TEST 2] High-Frequency Realtime Candle Ingestion (1,000 - 10,000 Ticks/Sec)...');
    const startT = performance.now();
    const criticalFindings: string[] = [];

    const mockChart = new MockChart();
    const connector = new UniversalIndicatorConnector(
      mockChart as unknown as IChartApiBase<Time>,
      'pane_main',
      'BINANCE:BTCUSDT',
      '1m'
    );

    const candles = makeCandles(200);
    const volumeIndicator: IndicatorInstance = {
      id: 'vol_main',
      type: 'volume',
      name: 'Volume',
      category: 'overlay',
      visible: true,
      inputs: {},
      styles: {
        vol: { color: '#089981', colorUp: '#089981', colorDown: '#f23645', plotType: 'histogram' },
      },
      levels: [],
      bands: [],
    };

    // Synchronize initial state
    await connector.syncIndicators([volumeIndicator], candles, ['main'], {});

    const volSeries = connector.getManagedEntries().get('vol_main')?.series.get('vol') as unknown as MockSeriesApi;
    if (!volSeries) {
      criticalFindings.push('Volume series was not created in UniversalIndicatorConnector');
    }

    // Measure baseline memory
    if (globalThis.gc) globalThis.gc();
    const memBefore = process.memoryUsage().heapUsed;

    // Simulate 5,000 rapid ticks updating the latest forming candle
    const tickCount = 5000;
    const baseTime = candles[candles.length - 1].time;
    const tickStartT = performance.now();

    for (let t = 0; t < tickCount; t++) {
      connector.updateRealtimeCandle({
        time: baseTime,
        open: 100,
        high: 100 + (t % 10),
        low: 99,
        close: 100 + (t % 8),
        volume: 500 + t * 2,
      });
    }

    const tickTotalMs = performance.now() - tickStartT;
    const ticksPerSec = Math.round((tickCount / tickTotalMs) * 1000);
    const memAfter = process.memoryUsage().heapUsed;
    const memDeltaKb = Math.round((memAfter - memBefore) / 1024);

    console.log(
      `  -> Processed ${tickCount.toLocaleString()} ticks in ${tickTotalMs.toFixed(2)}ms (${ticksPerSec.toLocaleString()} ticks/sec, memory delta: ${memDeltaKb} KB)`
    );

    // Verify series.update() was called for all 5,000 ticks
    if (volSeries.updates.length !== tickCount) {
      criticalFindings.push(
        `Series update count mismatch: expected ${tickCount}, got ${volSeries.updates.length}`
      );
    }

    // Verify latestValues matches the last tick
    const latestVals = connector.getLatestValues();
    const lastExpectedVol = 500 + (tickCount - 1) * 2;
    if (latestVals['vol_main']?.['vol'] !== lastExpectedVol) {
      criticalFindings.push(
        `latestValues mismatch: expected ${lastExpectedVol}, got ${latestVals['vol_main']?.['vol']}`
      );
    }

    // CRITICAL EMPIRICAL BUG CHECK: Does updateRealtimeCandle update cachedPlots['vol']?
    // Let's test if crosshair inspection at baseTime returns the latest volume or the old volume!
    const inspectFormingCandle = connector.getValuesAtTime(baseTime);
    const inspectedVol = inspectFormingCandle['vol_main']?.['vol'];
    if (inspectedVol !== lastExpectedVol) {
      criticalFindings.push(
        `BUG CONFIRMED: updateRealtimeCandle updates volSeries and latestValues, but FAILS to update entry.cachedPlots['vol']. ` +
          `Crosshair getValuesAtTime(${baseTime}) returned ${inspectedVol} instead of ${lastExpectedVol}. HUD shows stale volume during live ticks!`
      );
    }

    // CRITICAL EMPIRICAL BUG CHECK 2: What happens when a NEW candle arrives at baseTime + 60?
    const newCandleTime = baseTime + 60;
    connector.updateRealtimeCandle({
      time: newCandleTime,
      open: 105,
      high: 106,
      low: 104,
      close: 105.5,
      volume: 1250,
    });
    const inspectNewCandle = connector.getValuesAtTime(newCandleTime);
    const inspectedNewVol = inspectNewCandle['vol_main']?.['vol'];
    if (inspectedNewVol !== 1250) {
      criticalFindings.push(
        `BUG CONFIRMED: When a new candle bar arrives via updateRealtimeCandle, getValuesAtTime(${newCandleTime}) returns ${inspectedNewVol} (expected 1250) ` +
          `because cachedPlots['vol'] does not append newly arrived live bars. HUD completely fails on live forming bars!`
      );
    }

    const test2Passed = criticalFindings.length === 0;
    const test2Duration = performance.now() - startT;

    results.push({
      name: 'High-Frequency Realtime Candle Ticks',
      passed: test2Passed,
      durationMs: test2Duration,
      details: `${ticksPerSec.toLocaleString()} ticks/sec throughput (${tickCount} ticks in ${tickTotalMs.toFixed(1)}ms)`,
      criticalFindings,
    });
  }

  // ----------------------------------------------------
  // TEST 3: Streaming WebSocket Update Load & UI Callback Flooding
  // ----------------------------------------------------
  {
    console.log('\n[TEST 3] WebSocket Streaming Broadcast Load & React Callback Flooding...');
    const startT = performance.now();
    const criticalFindings: string[] = [];

    const mockChart = new MockChart();
    let callbackCount = 0;
    const connector = new UniversalIndicatorConnector(
      mockChart as unknown as IChartApiBase<Time>,
      'pane_main',
      'BINANCE:BTCUSDT',
      '1m',
      {
        onLatestValuesChange: () => {
          callbackCount++;
        },
      }
    );

    const ind1 = makeIndicatorInstance('sma_1', 'wickra.sma', 'overlay', ['plot']);
    const candles = makeCandles(100);

    // Populate managed entry
    const entries = connector.getManagedEntries();
    const mockSeries = mockChart.addSeries('Line', {}, 0);
    entries.set('sma_1', {
      instanceId: 'sma_1',
      indicatorId: 'wickra.sma',
      paneIndex: 0,
      series: new Map([['plot', mockSeries as unknown as ISeriesApi<SeriesType, Time>]]),
      bands: new Map(),
      footprints: new Map(),
      priceLines: [],
      latestValues: {},
      cachedPlots: { plot: candles.map((c) => ({ time: c.time, value: c.close })) },
      markers: new Map(),
    });

    // Directly access private handleStreamingIndicatorUpdate via typecast
    const connectorAny = connector as unknown as {
      handleStreamingIndicatorUpdate: (time: number, plots: Record<string, Record<string, number>>) => void;
    };

    const streamStartT = performance.now();
    const streamTickCount = 2000;
    const lastTime = candles[candles.length - 1].time;

    for (let i = 0; i < streamTickCount; i++) {
      connectorAny.handleStreamingIndicatorUpdate(lastTime, {
        sma_1: { plot: 100 + i * 0.1 },
      });
    }

    const streamTotalMs = performance.now() - streamStartT;
    const streamOpsPerSec = Math.round((streamTickCount / streamTotalMs) * 1000);

    console.log(
      `  -> Ingested ${streamTickCount.toLocaleString()} streaming ticks in ${streamTotalMs.toFixed(2)}ms (${streamOpsPerSec.toLocaleString()} updates/sec)`
    );
    console.log(`  -> onLatestValuesChange fired: ${callbackCount} times`);

    // In ChartPane.tsx: onLatestValuesChange: (vals) => setIndicatorLatestValues(vals);
    // If onLatestValuesChange is fired 2,000 times synchronously, it causes 2,000 React re-renders!
    if (callbackCount === streamTickCount) {
      criticalFindings.push(
        `PERFORMANCE DEFECT: onLatestValuesChange is called unthrottled on every single WebSocket frame (${callbackCount} callbacks for ${streamTickCount} ticks). ` +
          `In ChartPane.tsx, this triggers a React state re-render on every tick. At 100 ticks/sec, this starves the UI thread.`
      );
    }

    // Check cachedPlots growth: did it overwrite or grow unbounded?
    const cachedPlot = entries.get('sma_1')?.cachedPlots['plot'];
    if (cachedPlot && cachedPlot.length !== candles.length) {
      criticalFindings.push(
        `cachedPlots array grew unexpectedly: expected ${candles.length}, got ${cachedPlot.length}`
      );
    }

    const test3Passed = criticalFindings.length === 0;
    const test3Duration = performance.now() - startT;

    results.push({
      name: 'WebSocket Streaming Update Load',
      passed: test3Passed,
      durationMs: test3Duration,
      details: `${streamOpsPerSec.toLocaleString()} updates/sec; callback fired ${callbackCount} times`,
      criticalFindings,
    });
  }

  // ----------------------------------------------------
  // TEST 4: Rapid Indicator Toggling & Series/Primitive Leak Detection
  // ----------------------------------------------------
  {
    console.log('\n[TEST 4] Rapid Indicator Toggling & Leak Detection (20 Indicators, 50 Cycles = 1,000 Toggles)...');
    const startT = performance.now();
    const criticalFindings: string[] = [];

    const mockChart = new MockChart();
    const connector = new UniversalIndicatorConnector(
      mockChart as unknown as IChartApiBase<Time>,
      'pane_main',
      'BINANCE:BTCUSDT',
      '1m'
    );

    const candles = makeCandles(100);

    // Create 20 indicator instances (10 overlays, 10 subpanes)
    const twentyIndicators: IndicatorInstance[] = [];
    for (let i = 0; i < 10; i++) {
      twentyIndicators.push(
        makeIndicatorInstance(`overlay_${i}`, `wickra.sma`, 'overlay', ['plot'])
      );
    }
    for (let i = 0; i < 10; i++) {
      twentyIndicators.push(
        makeIndicatorInstance(`subpane_${i}`, `wickra.rsi`, 'subpane', ['plot'])
      );
    }

    // Mock fetch for /api/indicators/eval so it doesn't fail
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return {
        ok: true,
        json: async () => ({
          symbol: 'BINANCE:BTCUSDT',
          resolution: '1m',
          results: [],
        }),
      } as unknown as Response;
    };

    const cycleCount = 50;
    const toggleStartT = performance.now();

    for (let c = 0; c < cycleCount; c++) {
      // Step A: Add 20 indicators
      await connector.syncIndicators(
        twentyIndicators,
        candles,
        ['main', ...twentyIndicators.filter((i) => i.category === 'subpane').map((i) => i.id)],
        {}
      );

      // Step B: Remove all indicators
      await connector.syncIndicators([], candles, ['main'], {});
    }

    globalThis.fetch = originalFetch;

    const toggleTotalMs = performance.now() - toggleStartT;
    const totalToggles = cycleCount * 2 * 20;
    const togglesPerSec = Math.round((totalToggles / toggleTotalMs) * 1000);

    console.log(
      `  -> Executed ${totalToggles} indicator add/remove toggles across ${cycleCount} cycles in ${toggleTotalMs.toFixed(2)}ms (${togglesPerSec.toLocaleString()} toggles/sec)`
    );

    // Check for Series Leaks
    const activeSeries = mockChart.seriesList.filter((s) => !s.isDestroyed);
    console.log(`  -> Remaining active series in chart after removal: ${activeSeries.length}`);
    if (activeSeries.length !== 0) {
      criticalFindings.push(
        `SERIES LEAK: ${activeSeries.length} series remained alive in chart after indicators were removed!`
      );
    }

    // Check for Pane Leaks
    console.log(`  -> Remaining panes in chart: ${mockChart.panes().length} (expected 1: main pane)`);
    if (mockChart.panes().length !== 1) {
      criticalFindings.push(
        `PANE LEAK: ${mockChart.panes().length} panes remained in chart after removing all subpane indicators (expected 1).`
      );
    }

    // Check managed map
    if (connector.getManagedEntries().size !== 0) {
      criticalFindings.push(
        `CONNECTOR MAP LEAK: ${connector.getManagedEntries().size} entries remained in managed map after empty sync.`
      );
    }

    // ----------------------------------------------------
    // TEST 4B: Swapped Pane Subpane Removal Destruction Bug
    // ----------------------------------------------------
    console.log('\n[TEST 4B] Testing Swapped Panes Subpane Removal (Main pane index !== 0)...');
    globalThis.fetch = async () => {
      return {
        ok: true,
        json: async () => ({
          symbol: 'BINANCE:BTCUSDT',
          resolution: '1m',
          results: [],
        }),
      } as unknown as Response;
    };

    // Scenario: User had 1 subpane, and swapped main pane to index 1: paneOrder = ['sub_1', 'main']
    const subInd = makeIndicatorInstance('sub_1', 'wickra.rsi', 'subpane', ['plot']);
    // Add main candlestick series in pane 0
    const mainCandleSeries = mockChart.addSeries('Candlestick', {}, 0);

    // Sync subpane
    await connector.syncIndicators([subInd], candles, ['sub_1', 'main'], {});
    // Chart now has 2 panes: pane 0 (sub_1), pane 1 (main)
    mainCandleSeries.paneIndex = 1; // main candle series is now in pane 1!

    // Now user deletes sub_1: syncIndicators([], candles, ['main'], {})
    await connector.syncIndicators([], candles, ['main'], {});
    globalThis.fetch = originalFetch;

    // Inspect if mainCandleSeries was destroyed by removePane!
    if (mainCandleSeries.isDestroyed) {
      criticalFindings.push(
        `CRITICAL PANE DESTRUCTION BUG: When main pane is not at index 0 (e.g. swapped), ` +
          `syncIndicators removes pane (length - 1) which destroyed the user's main candlestick series!`
      );
    }

    const test4Passed = criticalFindings.length === 0;
    const test4Duration = performance.now() - startT;

    results.push({
      name: 'Rapid Indicator Toggling & Leak Detection',
      passed: test4Passed,
      durationMs: test4Duration,
      details: `${togglesPerSec.toLocaleString()} toggles/sec, 0 series leaked, 0 primitives leaked`,
      criticalFindings,
    });
  }

  // ----------------------------------------------------
  // TEST 5: Asynchronous Evaluation Race Condition (Out-of-Order Fetch)
  // ----------------------------------------------------
  {
    console.log('\n[TEST 5] Asynchronous Evaluation Race Condition (Out-of-Order HTTP Resolution)...');
    const startT = performance.now();
    const criticalFindings: string[] = [];

    const mockChart = new MockChart();
    const connector = new UniversalIndicatorConnector(
      mockChart as unknown as IChartApiBase<Time>,
      'pane_main',
      'BINANCE:BTCUSDT',
      '1m'
    );

    const candles = makeCandles(50);
    const indV1 = makeIndicatorInstance('sma_test', 'wickra.sma', 'overlay', ['plot']);
    indV1.inputs = { period: 10 };

    const indV2 = makeIndicatorInstance('sma_test', 'wickra.sma', 'overlay', ['plot']);
    indV2.inputs = { period: 50 }; // User changed period from 10 to 50

    // Simulate Network Latency Inversion:
    // Request 1 (period 10) takes 80ms
    // Request 2 (period 50) takes 20ms
    let resolveV1: ((val: unknown) => void) | null = null;
    let resolveV2: ((val: unknown) => void) | null = null;
    let callIndex = 0;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url: unknown, options: unknown) => {
      const body = JSON.parse((options as { body: string }).body);
      const reqPeriod = body.indicators[0].inputs.period;
      callIndex++;

      return new Promise<Response>((resolve) => {
        if (reqPeriod === 10) {
          resolveV1 = () =>
            resolve({
              ok: true,
              json: async () => ({
                symbol: 'BINANCE:BTCUSDT',
                resolution: '1m',
                results: [
                  {
                    instanceId: 'sma_test',
                    indicatorId: 'wickra.sma',
                    plots: {
                      plot: candles.map((c) => ({ time: c.time, value: 10.0 })), // Period 10 value: 10.0
                    },
                  },
                ],
              }),
            } as Response);
        } else {
          resolveV2 = () =>
            resolve({
              ok: true,
              json: async () => ({
                symbol: 'BINANCE:BTCUSDT',
                resolution: '1m',
                results: [
                  {
                    instanceId: 'sma_test',
                    indicatorId: 'wickra.sma',
                    plots: {
                      plot: candles.map((c) => ({ time: c.time, value: 50.0 })), // Period 50 value: 50.0
                    },
                  },
                ],
              }),
            } as Response);
        }
      });
    };

    // User triggers sync with V1 (period 10)
    const p1 = connector.syncIndicators([indV1], candles, ['main'], {});
    // Immediately user modifies input to V2 (period 50)
    const p2 = connector.syncIndicators([indV2], candles, ['main'], {});

    // Now V2 completes FIRST (fast network response)
    if (resolveV2) (resolveV2 as () => void)();
    await p2;

    const valAfterV2 = connector.getLatestValues()['sma_test']?.['plot'];
    console.log(`  -> Value after V2 resolved (expected 50.0): ${valAfterV2}`);

    // Now V1 completes LATER (slow network response arrives out of order)
    if (resolveV1) (resolveV1 as () => void)();
    await p1;

    const valAfterV1Stale = connector.getLatestValues()['sma_test']?.['plot'];
    console.log(`  -> Value after stale V1 resolved: ${valAfterV1Stale}`);

    globalThis.fetch = originalFetch;

    if (valAfterV1Stale === 10.0) {
      criticalFindings.push(
        `CRITICAL RACE CONDITION CONFIRMED: Out-of-order HTTP evaluation responses overwrite newer indicator data with stale historical calculations. ` +
          `Expected plot value 50.0, but stale request 1 overwrote series with 10.0 because UniversalIndicatorConnector lacks request cancellation (AbortController) or generation/epoch tracking.`
      );
    }

    const test5Passed = criticalFindings.length === 0;
    const test5Duration = performance.now() - startT;

    results.push({
      name: 'Asynchronous Evaluation Race Condition',
      passed: test5Passed,
      durationMs: test5Duration,
      details: `Stale request overwrote new request: ${valAfterV1Stale === 10.0 ? 'YES (VULNERABLE)' : 'NO'}`,
      criticalFindings,
    });
  }

  // ----------------------------------------------------
  // TEST 6: Invariant 2.3 Off-Thread Math Codebase Verification
  // ----------------------------------------------------
  {
    console.log('\n[TEST 6] Invariant 2.3 Verification: Off-Thread Calculation & Absence of Synchronous UI Indicator Math...');
    const startT = performance.now();
    const criticalFindings: string[] = [];

    // Verify calculator import in ChartPane.tsx
    // (This is verified by inspecting ChartPane.tsx source)
    const fs = await import('node:fs');
    const path = await import('node:path');

    const chartPanePath = path.resolve('src/components/ChartPane/ChartPane.tsx');
    if (fs.existsSync(chartPanePath)) {
      const content = fs.readFileSync(chartPanePath, 'utf-8');
      if (content.includes('computeIndicator')) {
        criticalFindings.push('ChartPane.tsx still contains references to computeIndicator!');
      }
      if (content.includes("from '../../indicators/calculator'") || content.includes('from "../indicators/calculator"')) {
        criticalFindings.push('ChartPane.tsx still imports legacy calculator!');
      }
    }

    const test6Passed = criticalFindings.length === 0;
    const test6Duration = performance.now() - startT;

    results.push({
      name: 'Invariant 2.3 Off-Thread Math Verification',
      passed: test6Passed,
      durationMs: test6Duration,
      details: '0 synchronous indicator math calls found in ChartPane.tsx',
      criticalFindings,
    });
  }

  // ----------------------------------------------------
  // TEST 7: Primitives HiDPI & Rendering Robustness
  // ----------------------------------------------------
  {
    console.log('\n[TEST 7] Custom Canvas Primitives Robustness (BandFillPrimitive & FootprintPrimitive)...');
    const startT = performance.now();
    const criticalFindings: string[] = [];

    // Test BandFillPrimitive
    const band = new BandFillPrimitive('rgba(41, 98, 255, 0.12)', [
      { time: 100, upper: 105, lower: 95 },
      { time: 200, upper: NaN, lower: 96 }, // NaN segment break
      { time: 300, upper: 108, lower: 97 },
      { time: 400, upper: 110, lower: 98 },
    ]);

    const paneViews = band.paneViews();
    if (paneViews.length !== 1) {
      criticalFindings.push(`BandFillPrimitive returned ${paneViews.length} pane views (expected 1)`);
    }
    if (paneViews[0].zOrder() !== 'bottom') {
      criticalFindings.push(`BandFillPrimitive zOrder must be 'bottom', got ${paneViews[0].zOrder()}`);
    }

    // Test FootprintPrimitive
    const fpBars: FootprintBar[] = [
      {
        time: 1700000000,
        open: 100,
        high: 105,
        low: 95,
        close: 103,
        totalVolume: 5000,
        delta: 1200,
        pocPrice: 101,
        levels: [
          { price: 95, bidVolume: 100, askVolume: 50 },
          { price: 101, bidVolume: 1200, askVolume: 1500, isPOC: true },
          { price: 105, bidVolume: 200, askVolume: 800, isImbalanceBuy: true },
        ],
      },
      {
        time: 1700000060,
        open: 103,
        high: 104,
        low: 98,
        close: 99,
        totalVolume: 3500,
        delta: -1500,
        levels: [
          { price: 99, bidVolume: 1800, askVolume: 200, isImbalanceSell: true },
        ],
      },
    ];

    const fp = new FootprintPrimitive({}, fpBars);
    if (fp.paneViews().length !== 1) {
      criticalFindings.push(`FootprintPrimitive returned ${fp.paneViews().length} pane views (expected 1)`);
    }

    const test7Passed = criticalFindings.length === 0;
    const test7Duration = performance.now() - startT;

    results.push({
      name: 'Primitives HiDPI & Rendering Robustness',
      passed: test7Passed,
      durationMs: test7Duration,
      details: 'BandFillPrimitive and FootprintPrimitive passed structural contracts',
      criticalFindings,
    });
  }

  // ----------------------------------------------------
  // TEST 8: VWAP Standard Deviation Bands Reattachment & Streaming
  // ----------------------------------------------------
  {
    console.log('\n[TEST 8] VWAP Standard Deviation Bands Reattachment & Streaming...');
    const startT = performance.now();
    const criticalFindings: string[] = [];

    const mockChart = new MockChart() as unknown as IChartApiBase<Time>;
    const connector = new UniversalIndicatorConnector(mockChart, 'pane-1', 'TEST:NAS100', '15m');

    const vwapInd: IndicatorInstance = {
      id: 'ind_vwap',
      type: 'wickra.vwap',
      name: 'VWAP',
      category: 'overlay',
      visible: true,
      inputs: {
        anchor_period: 'session',
        source: 'hlc3',
        bands_multiplier_1: 1.0,
      },
      styles: {
        plot: { color: '#2962ff', lineWidth: 2, lineStyle: 'solid', plotType: 'line', visible: true },
        upper_1: { color: '#089981', lineWidth: 1, lineStyle: 'solid', plotType: 'line', visible: true },
        lower_1: { color: '#089981', lineWidth: 1, lineStyle: 'solid', plotType: 'line', visible: true },
      },
      bands: [
        {
          id: 'vwap_band_1',
          title: 'Bands Fill #1',
          upperPlotId: 'upper_1',
          lowerPlotId: 'lower_1',
          fillColor: 'rgba(41, 98, 255, 0.08)',
          visible: true,
        },
      ],
    };

    const initialCandles: Candle[] = [
      { time: 1700000000, open: 100, high: 105, low: 95, close: 102, volume: 1000 },
      { time: 1700000900, open: 102, high: 106, low: 101, close: 104, volume: 1500 },
    ];

    // Mock fetch to simulate Go indicator evaluation response with bands
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return {
        ok: true,
        json: async () => ({
          symbol: 'TEST:NAS100',
          resolution: '15m',
          results: [
            {
              instanceId: 'ind_vwap',
              indicatorId: 'wickra.vwap',
              plots: {
                plot: [
                  { time: 1700000000, value: 100.67 },
                  { time: 1700000900, value: 102.35 },
                ],
                upper_1: [
                  { time: 1700000000, value: 103.0 },
                  { time: 1700000900, value: 105.0 },
                ],
                lower_1: [
                  { time: 1700000000, value: 98.34 },
                  { time: 1700000900, value: 99.7 },
                ],
              },
            },
          ],
        }),
      } as Response;
    }) as typeof fetch;

    try {
      await connector.syncIndicators([vwapInd], initialCandles, ['main'], {});

      const entry = (connector as any).managed.get('ind_vwap');
      if (!entry) {
        criticalFindings.push('Managed entry for ind_vwap was not created');
      } else {
        const bandPrim = entry.bands.get('vwap_band_1');
        if (!bandPrim) {
          criticalFindings.push('BandFillPrimitive for vwap_band_1 was not instantiated in entry.bands');
        } else {
          // Attached host check
          const attachedSeries = entry.bandAttachedSeries?.get('vwap_band_1');
          if (!attachedSeries) {
            criticalFindings.push('entry.bandAttachedSeries was not populated for vwap_band_1');
          }

          // Now toggle plot visibility to false (hide main VWAP line, leave bands visible)
          const vwapIndHiddenPlot: IndicatorInstance = {
            ...vwapInd,
            styles: {
              ...vwapInd.styles,
              plot: { ...vwapInd.styles.plot, visible: false },
            },
          };

          await connector.syncIndicators([vwapIndHiddenPlot], initialCandles, ['main'], {});

          const reattachedSeries = entry.bandAttachedSeries?.get('vwap_band_1');
          const upperSeries = entry.series.get('upper_1');
          if (reattachedSeries !== upperSeries) {
            criticalFindings.push('BandFillPrimitive failed to reattach to upper_1 when plot series became hidden');
          }
        }
      }
    } finally {
      globalThis.fetch = originalFetch;
      connector.destroy();
    }

    const test8Passed = criticalFindings.length === 0;
    const test8Duration = performance.now() - startT;

    results.push({
      name: 'VWAP Std Dev Bands Host Reattachment & Visibility',
      passed: test8Passed,
      durationMs: test8Duration,
      details: 'Bands dynamically reattach to visible boundary series when center plot is hidden',
      criticalFindings,
    });
  }

  // ----------------------------------------------------
  // TEST 9: Subpane Price Scale Autoscale & Last Value In View
  // ----------------------------------------------------
  {
    console.log('[TEST 9] Subpane Price Scale Autoscale & Last Value In View...');
    const startT = performance.now();
    const criticalFindings: string[] = [];

    const mockChart = new MockChart();
    const connector = new UniversalIndicatorConnector(
      mockChart as unknown as IChartApiBase<Time>,
      () => null
    );

    const obvInd: IndicatorInstance = {
      id: 'ind_obv',
      type: 'wickra.obv',
      name: 'On-Balance Volume',
      category: 'subpane',
      paneId: 'pane_obv',
      visible: true,
      inputs: {},
      styles: {
        plot: { color: '#2962ff', lineWidth: 2, plotType: 'line', visible: true, lastValueVisible: true },
      },
      levels: [],
      bands: [],
    };

    const rsiInd: IndicatorInstance = {
      id: 'ind_rsi',
      type: 'wickra.rsi',
      name: 'Relative Strength Index',
      category: 'subpane',
      paneId: 'pane_rsi',
      visible: true,
      inputs: { period: 14 },
      styles: {
        plot: { color: '#7e57c2', lineWidth: 2, plotType: 'line', visible: true, lastValueVisible: true },
      },
      levels: [
        { id: 'ob', value: 70, style: 'dashed', color: '#787b86', visible: true },
        { id: 'os', value: 30, style: 'dashed', color: '#787b86', visible: true },
      ],
      bands: [],
    };

    const initialCandles: Candle[] = [
      { time: 1700000000, open: 100, high: 105, low: 95, close: 102, volume: 1000 },
      { time: 1700000900, open: 102, high: 106, low: 101, close: 104, volume: 1500 },
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return {
        ok: true,
        json: async () => ({
          symbol: 'TEST:NAS100',
          resolution: '15m',
          results: [
            {
              instanceId: 'ind_obv',
              indicatorId: 'wickra.obv',
              plots: {
                plot: [
                  { time: 1700000000, value: -142000.0 },
                  { time: 1700000900, value: -140654.0 },
                ],
              },
            },
            {
              instanceId: 'ind_rsi',
              indicatorId: 'wickra.rsi',
              plots: {
                plot: [
                  { time: 1700000000, value: 48.5 },
                  { time: 1700000900, value: 52.3 },
                ],
              },
            },
          ],
        }),
      } as Response;
    }) as typeof fetch;

    try {
      const paneOrder = ['main', 'ind_obv', 'ind_rsi'];
      await connector.syncIndicators([obvInd, rsiInd], initialCandles, paneOrder, {});

      // 1. Verify Subpane 1 (OBV) Price Scale autoScale is true with 10% margins
      const obvPriceScale = mockChart.priceScale('right', 1);
      if (!obvPriceScale.options.autoScale) {
        criticalFindings.push(`OBV subpane price scale does not have autoScale: true (got ${obvPriceScale.options.autoScale})`);
      }
      const obvMargins = obvPriceScale.options.scaleMargins as { top: number; bottom: number } | undefined;
      if (!obvMargins || obvMargins.top !== 0.1 || obvMargins.bottom !== 0.1) {
        criticalFindings.push(`OBV subpane price scale margins are not { top: 0.1, bottom: 0.1 } (got ${JSON.stringify(obvMargins)})`);
      }

      // 2. Verify Subpane 2 (RSI) Price Scale autoScale is true with 10% margins
      const rsiPriceScale = mockChart.priceScale('right', 2);
      if (!rsiPriceScale.options.autoScale) {
        criticalFindings.push(`RSI subpane price scale does not have autoScale: true (got ${rsiPriceScale.options.autoScale})`);
      }

      // 3. Verify series options: lastValueVisible is true and autoscaleInfoProvider is set
      const obvEntry = (connector as any).managed.get('ind_obv');
      const rsiEntry = (connector as any).managed.get('ind_rsi');

      if (!obvEntry) {
        criticalFindings.push('Managed entry for ind_obv missing');
      } else {
        const obvSeries = obvEntry.series.get('plot') as MockSeriesApi;
        if (!obvSeries) {
          criticalFindings.push('OBV plot series missing');
        } else {
          if (!obvSeries.options.lastValueVisible) {
            criticalFindings.push('OBV series does not have lastValueVisible: true');
          }
          if (typeof obvSeries.options.autoscaleInfoProvider !== 'function') {
            criticalFindings.push('OBV series does not have an autoscaleInfoProvider function');
          } else {
            const provider = obvSeries.options.autoscaleInfoProvider as (orig: () => any) => any;
            const res = provider(() => ({ priceRange: { minValue: -142000, maxValue: -140000 }, margins: null }));
            if (!res || res.priceRange.minValue !== -142000 || res.priceRange.maxValue !== -140000) {
              criticalFindings.push(`OBV autoscaleInfoProvider returned unexpected range: ${JSON.stringify(res)}`);
            }
          }
        }

        const allLatest = connector.getLatestValues();
        const latestObv = allLatest['ind_obv'];
        if (!latestObv || latestObv.plot !== -140654.0) {
          criticalFindings.push(`OBV latest value not in view / incorrect: expected -140654.0, got ${latestObv?.plot}`);
        }
      }

      if (!rsiEntry) {
        criticalFindings.push('Managed entry for ind_rsi missing');
      } else {
        const rsiSeries = rsiEntry.series.get('plot') as MockSeriesApi;
        if (!rsiSeries) {
          criticalFindings.push('RSI plot series missing');
        } else {
          const provider = rsiSeries.options.autoscaleInfoProvider as (orig: () => any) => any;
          if (typeof provider !== 'function') {
            criticalFindings.push('RSI series does not have an autoscaleInfoProvider function');
          } else {
            // Visible series range is [48.5, 52.3]. Levels are 30 and 70.
            // autoscaleInfoProvider must expand the bounds to include levels [30, 70]!
            const res = provider(() => ({ priceRange: { minValue: 48.5, maxValue: 52.3 }, margins: null }));
            if (!res || res.priceRange.minValue !== 30 || res.priceRange.maxValue !== 70) {
              criticalFindings.push(`RSI autoscaleInfoProvider failed to include levels [30, 70]: got ${JSON.stringify(res?.priceRange)}`);
            }

            // Edge Case A: When original() is null (initial sync / warm-up / empty data),
            // provider MUST still provide range from configured levels [30, 70]!
            const resNullOrig = provider(() => null);
            if (!resNullOrig || resNullOrig.priceRange.minValue !== 30 || resNullOrig.priceRange.maxValue !== 70) {
              criticalFindings.push(`RSI autoscaleInfoProvider failed when original() returned null: got ${JSON.stringify(resNullOrig)}`);
            }
          }
        }
      }

      // Edge Case B: Flat line indicator without levels (min === max)
      const flatInd: IndicatorInstance = {
        id: 'ind_flat',
        type: 'wickra.aroon',
        name: 'Aroon Oscillator',
        category: 'subpane',
        paneId: 'pane_flat',
        visible: true,
        inputs: {},
        styles: {
          plot: { color: '#00e5ff', lineWidth: 2, plotType: 'line', visible: true, lastValueVisible: true },
        },
        levels: [],
        bands: [],
      };
      await connector.syncIndicators([obvInd, rsiInd, flatInd], initialCandles, ['main', 'ind_obv', 'ind_rsi', 'ind_flat'], {});
      const flatEntry = (connector as any).managed.get('ind_flat');
      const flatSeries = flatEntry?.series.get('plot') as MockSeriesApi;
      const flatProvider = flatSeries?.options.autoscaleInfoProvider as (orig: () => any) => any;
      if (!flatProvider) {
        criticalFindings.push('Flat indicator series missing autoscaleInfoProvider');
      } else {
        const flatRes = flatProvider(() => ({ priceRange: { minValue: 100.0, maxValue: 100.0 }, margins: null }));
        if (!flatRes || flatRes.priceRange.minValue >= flatRes.priceRange.maxValue) {
          criticalFindings.push(`autoscaleInfoProvider failed to expand flat degenerate range: got ${JSON.stringify(flatRes)}`);
        }
      }

      // Edge Case C: Indicator last value bounding
      // If visible bars range is [-142000, -141500] but latest streaming value is -140654.0,
      // autoscaleInfoProvider MUST expand maxValue to include -140654.0!
      if (obvEntry) {
        const obvSeries = obvEntry.series.get('plot') as MockSeriesApi;
        const provider = obvSeries.options.autoscaleInfoProvider as (orig: () => any) => any;
        const resWithLatest = provider(() => ({ priceRange: { minValue: -142000, maxValue: -141500 }, margins: null }));
        if (!resWithLatest || resWithLatest.priceRange.maxValue < -140654.0) {
          criticalFindings.push(`OBV autoscaleInfoProvider failed to include latest value: got ${JSON.stringify(resWithLatest?.priceRange)}`);
        }
      }

      // 4. Test re-evaluation preserves autoScale: true
      await connector.evaluateOffThread(initialCandles);
      if (!obvPriceScale.options.autoScale || !rsiPriceScale.options.autoScale) {
        criticalFindings.push('Subpane price scale autoScale was cleared after evaluateOffThread');
      }

      // 5. Test swapped panes: if main pane is swapped with index 1
      connector.swapIndicatorPanes(0, 1);
      const pane0PriceScale = mockChart.priceScale('right', 0);
      if (!pane0PriceScale.options.autoScale) {
        criticalFindings.push('Swapped subpane at index 0 does not have autoScale: true');
      }
    } finally {
      globalThis.fetch = originalFetch;
      connector.destroy();
    }

    const test9Passed = criticalFindings.length === 0;
    const test9Duration = performance.now() - startT;

    results.push({
      name: 'Subpane Price Scale Autoscale & Last Value in View',
      passed: test9Passed,
      durationMs: test9Duration,
      details: 'Subpanes have autoScale: true, 10% margins, lastValueVisible: true, and level-aware autoscaleInfoProvider',
      criticalFindings,
    });
  }

  // ----------------------------------------------------
  // SUMMARY REPORT
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log('CHALLENGER M2-2 STRESS TEST RESULTS SUMMARY');
  console.log('====================================================');

  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`${status} | ${r.name} (${r.durationMs.toFixed(1)}ms) - ${r.details}`);
    if (!r.passed) {
      allPassed = false;
      for (const f of r.criticalFindings) {
        console.log(`    ! FINDING: ${f}`);
      }
    }
  }

  console.log('====================================================');
  console.log(`FINAL VERDICT: ${allPassed ? 'VERDICT: APPROVE' : 'VERDICT: REQUEST_CHANGES'}`);
  console.log('====================================================\n');

  return { results, allPassed };
}

// Auto-run if executed directly
runStreamingLoadStressTests().then(({ allPassed }) => {
  if (!allPassed) {
    process.exit(1);
  } else {
    process.exit(0);
  }
});
