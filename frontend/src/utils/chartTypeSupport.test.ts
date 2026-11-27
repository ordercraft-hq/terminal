declare const process: { exit: (code: number) => never };

import { isChartTypeSupported, getFallbackChartType } from './chartTypeSupport.ts';
import { useSyncStore } from '../store/syncStore.ts';

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

console.log('\n--- 1. L2 VS L1 SYMBOL CAPABILITY DETECTION ---');
// Explicit L2 providers
assert(isChartTypeSupported('DATABRIDGE:ENQZ26', 'footprint').supported === true, 'DATABRIDGE:ENQZ26 supports footprint');
assert(isChartTypeSupported('BRIDGE:MNQZ26', 'footprint').supported === true, 'BRIDGE:MNQZ26 supports footprint');
assert(isChartTypeSupported('L2FEED:ESZ26', 'footprint').supported === true, 'L2FEED:ESZ26 supports footprint');

// Bare futures symbols without prefix
assert(isChartTypeSupported('ENQ', 'footprint').supported === true, 'Bare ENQ supports footprint');
assert(isChartTypeSupported('ENQZ26', 'footprint').supported === true, 'Bare ENQZ26 supports footprint');
assert(isChartTypeSupported('MES', 'footprint').supported === true, 'Bare MES supports footprint');
assert(isChartTypeSupported('@NQ', 'footprint').supported === true, '@NQ supports footprint');

// L1-only symbols
assert(isChartTypeSupported('BINANCE:BTCUSDT', 'footprint').supported === false, 'BINANCE:BTCUSDT does not support footprint');
assert(isChartTypeSupported('BTCUSDT', 'footprint').supported === false, 'Bare BTCUSDT does not support footprint');
assert(isChartTypeSupported('OANDA:EUR_USD', 'footprint').supported === false, 'OANDA:EUR_USD does not support footprint');
assert(isChartTypeSupported('ALPACA:AAPL', 'footprint').supported === false, 'ALPACA:AAPL does not support footprint');

console.log('\n--- 2. STANDARD CHART TYPES PERMITTED ---');
assert(isChartTypeSupported('BINANCE:BTCUSDT', 'candles').supported === true, 'Binance candles supported');
assert(isChartTypeSupported('BINANCE:BTCUSDT', 'bars').supported === true, 'Binance bars supported');
assert(isChartTypeSupported('BTCUSDT', 'heikin_ashi').supported === true, 'BTCUSDT heikin_ashi supported');
assert(isChartTypeSupported('OANDA:EUR_USD', 'line').supported === true, 'OANDA line supported');

console.log('\n--- 3. FALLBACK TO CANDLES ON L1 ---');
assert(getFallbackChartType('DATABRIDGE:ENQZ26', 'footprint') === 'footprint', 'Fallback preserves footprint on DATABRIDGE:ENQZ26');
assert(getFallbackChartType('ENQ', 'footprint') === 'footprint', 'Fallback preserves footprint on bare ENQ');
assert(getFallbackChartType('BINANCE:BTCUSDT', 'footprint') === 'candles', 'Fallback switches footprint to candles on BINANCE:BTCUSDT');
assert(getFallbackChartType('BTCUSDT', 'footprint') === 'candles', 'Fallback switches footprint to candles on bare BTCUSDT');
assert(getFallbackChartType('OANDA:EUR_USD', 'footprint') === 'candles', 'Fallback switches footprint to candles on OANDA:EUR_USD');
assert(getFallbackChartType('BINANCE:BTCUSDT', 'bars') === 'bars', 'Fallback preserves bars on Binance');

console.log('\n--- 4. SYNCSTORE AUTOMATIC TRANSITION (L2 -> L1) ---');
const store = useSyncStore.getState();

// 1. Load an L2 symbol and set footprint chart
store.setSymbol('DATABRIDGE:ENQZ26');
store.setChartType('footprint');

let current = useSyncStore.getState();
assert(current.symbol === 'DATABRIDGE:ENQZ26', 'Store symbol is DATABRIDGE:ENQZ26');
assert(current.chartType === 'footprint', 'Store chartType is footprint');
assert(current.panes[current.activePaneId || 'pane-1'].chartType === 'footprint', 'Pane chartType is footprint');
assert(current.orderflowSettings.enabled === true, 'Orderflow settings enabled for footprint');

// 2. Switch to L1 symbol (BTCUSDT)
store.setSymbol('BINANCE:BTCUSDT');

current = useSyncStore.getState();
assert(current.symbol === 'BINANCE:BTCUSDT', 'Store symbol changed to BINANCE:BTCUSDT');
assert(current.chartType === 'candles', 'Store chartType automatically changed from footprint to candles');
assert(current.panes[current.activePaneId || 'pane-1'].chartType === 'candles', 'Pane chartType automatically changed to candles');
assert(current.orderflowSettings.enabled === false, 'Orderflow settings disabled when switching to L1');

// 3. Block manual footprint switch on L1
store.setChartType('footprint');
current = useSyncStore.getState();
assert(current.chartType === 'candles', 'Manual setChartType(footprint) blocked on L1');

console.log('\n--- 5. DIRECT PANE CONFIG UPDATE FALLBACK ---');
const activeId = store.activePaneId || 'pane-1';
store.updatePaneConfig(activeId, { symbol: 'DATABRIDGE:ENQZ26', chartType: 'footprint' });
current = useSyncStore.getState();
assert(current.panes[activeId].chartType === 'footprint', 'Direct pane config can set footprint on L2');

store.updatePaneConfig(activeId, { symbol: 'BTCUSDT' });
current = useSyncStore.getState();
assert(current.panes[activeId].chartType === 'candles', 'Direct pane config changes footprint to candles on L1');

console.log('\n========================================');
console.log(`TOTAL TESTS: ${totalTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${failedTests}`);
console.log('========================================\n');

if (failedTests > 0) {
  process.exit(1);
}
