declare const process: { exit: (code: number) => never };

import { ChartHudController, type OhlcHudValues } from './ChartHudController.tsx';

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

console.log('\n--- CHART HUD CONTROLLER ISOLATION TESTS ---');

const ctrl = new ChartHudController();
let ohlcEmits = 0;
let indEmits = 0;
const unsubOhlc = ctrl.subscribeOhlc(() => { ohlcEmits++; });
const unsubInd = ctrl.subscribeIndicators(() => { indEmits++; });

const bar1: OhlcHudValues = {
  open: 100,
  high: 105,
  low: 99,
  close: 103,
  volume: 500,
  change: 3,
  changePercent: 3,
};

ctrl.setHoveredOHLC(bar1);
assert(ohlcEmits === 1, 'Initial hovered OHLC emits once');

ctrl.setHoveredOHLC({ ...bar1 });
assert(ohlcEmits === 1, 'Identical hovered OHLC values do not re-emit');

ctrl.setHoveredOHLC(null);
assert(ohlcEmits === 2, 'Clearing hovered OHLC emits once');

ctrl.setHoveredOHLC(null);
assert(ohlcEmits === 2, 'Repeated null hovered OHLC does not re-emit');

ctrl.setLiveOHLC(bar1);
assert(ctrl.getDisplayOHLC(false)?.close === 103, 'Falls back to liveOHLC when not hovered');

const barSync: OhlcHudValues = { ...bar1, close: 200 };
ctrl.setSyncHoveredOHLC(barSync);
assert(ctrl.getDisplayOHLC(true)?.close === 200, 'Shows syncHoveredOHLC when crosshairLock is enabled');
assert(ctrl.getDisplayOHLC(false)?.close === 103, 'Ignores syncHoveredOHLC when crosshairLock is disabled');

const latest = { ind1: { value: 42 } };
ctrl.setIndicatorLatestValues(latest);
assert(indEmits === 1, 'Latest indicator values emit once');
assert(ctrl.getDisplayIndicatorValues().ind1.value === 42, 'Returns latest indicator value');

const hoveredInd = { ind1: { value: 77 } };
ctrl.setHoveredIndicatorValues(hoveredInd);
assert(indEmits === 2, 'Hovered indicator values emit once');
assert(ctrl.getDisplayIndicatorValues().ind1.value === 77, 'Prefers hovered indicator value over latest');

ctrl.setHoveredIndicatorValues(null);
assert(indEmits === 3, 'Clearing hovered indicator values restores latest');
assert(ctrl.getDisplayIndicatorValues().ind1.value === 42, 'Restored latest indicator value');

unsubOhlc();
unsubInd();

console.log(`\nTOTAL: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}\n`);
if (failedTests > 0) process.exit(1);
