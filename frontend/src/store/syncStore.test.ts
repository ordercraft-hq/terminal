declare const process: { exit: (code: number) => never };

// Mock localStorage before importing syncStore to test debounced persist storage
const localStorageStore = new Map<string, string>();
let setItemCalls = 0;

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => localStorageStore.get(key) ?? null,
    setItem: (key: string, val: string) => {
      setItemCalls++;
      localStorageStore.set(key, val);
    },
    removeItem: (key: string) => {
      localStorageStore.delete(key);
    },
    clear: () => {
      localStorageStore.clear();
    },
  },
  configurable: true,
});

import { useSyncStore, flushPersistedWorkspaceStorage } from './syncStore.ts';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string): void {
  totalTests++;
  if (!condition) {
    failedTests++;
    console.error(`  ❌ FAIL: ${message}`);
  } else {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  }
}

console.log('\n--- 1. setLayoutType ACTIVE PANE RESET & SYNC ---');
{
  const s = useSyncStore.getState();
  s.setLayoutType('2v');
  s.updatePaneConfig('pane-1', { symbol: 'BINANCE:BTCUSDT', timeframe: '15m', chartType: 'candles' });
  s.updatePaneConfig('pane-2', { symbol: 'BINANCE:ETHUSDT', timeframe: '1h', chartType: 'bars' });
  s.setActivePaneId('pane-2');

  let cur = useSyncStore.getState();
  assert(cur.activePaneId === 'pane-2', 'Active pane set to pane-2 in 2v layout');
  assert(cur.symbol === 'BINANCE:ETHUSDT', 'Root symbol synced to pane-2');

  cur.setLayoutType('1');
  cur = useSyncStore.getState();
  assert(cur.activePaneId === 'pane-1', 'Switching to 1-pane layout resets activePaneId to pane-1');
  assert(cur.symbol === 'BINANCE:BTCUSDT', 'Root symbol synced back to pane-1');
  assert(cur.timeframe === '15m', 'Root timeframe synced back to pane-1');
  assert(cur.chartType === 'candles', 'Root chartType synced back to pane-1');
}

console.log('\n--- 2. alertLogs CAPPED AT 200 ---');
{
  const s = useSyncStore.getState();
  s.clearAlertLogs();
  for (let i = 0; i < 210; i++) {
    s.addAlert({
      symbol: 'BINANCE:BTCUSDT',
      condition: 'crossing',
      targetPrice: 50000 + i,
      active: true,
    });
    const added = useSyncStore.getState().alerts[0];
    s.triggerAlert(added.id, 50000 + i);
  }
  const logs = useSyncStore.getState().alertLogs;
  assert(logs.length === 200, `alertLogs capped at 200 (got ${logs.length})`);
  assert(logs[0].triggerPrice === 50209, 'Newest alert log preserved at index 0');
}

console.log('\n--- 3. BATCH updateWatchlistTicks ---');
{
  const s = useSyncStore.getState();
  s.updateWatchlistTicks({
    AAPL: { lastPrice: 210.5, change: 2.5, changePct: 1.2, volume: 1000000 },
    MSFT: { lastPrice: 420.25, change: -1.75, changePct: -0.41, volume: 500000 },
  });
  const wl = useSyncStore.getState().watchlists.find((w) => w.id === 'watchlist-main');
  const aapl = wl?.items.find((it) => it.symbol === 'AAPL');
  const msft = wl?.items.find((it) => it.symbol === 'MSFT');
  assert(aapl?.lastPrice === 210.5 && aapl?.changePct === 1.2, 'AAPL updated via batch ticks');
  assert(msft?.lastPrice === 420.25 && msft?.volume === 500000, 'MSFT updated via batch ticks');
}

console.log('\n--- 4. skipHistory + commitSnapshot + undo ---');
{
  // Reset history stack cleanly via setLayout
  useSyncStore.getState().setLayout('test_layout', 'Test');
  const beforeColor = useSyncStore.getState().chartSettings.canvasBgColor;
  useSyncStore.getState().commitSnapshot('drag color picker');
  const pastCountAfterCommit = useSyncStore.getState().historyPast.length;
  assert(pastCountAfterCommit === 1, 'commitSnapshot pushes 1 snapshot');

  useSyncStore.getState().updateChartSettings({ canvasBgColor: '#111111' }, true);
  useSyncStore.getState().updateChartSettings({ canvasBgColor: '#222222' }, true);
  useSyncStore.getState().updateChartSettings({ canvasBgColor: '#333333' }, true);
  assert(
    useSyncStore.getState().historyPast.length === 1,
    'skipHistory=true prevents flooding history during drag'
  );

  useSyncStore.getState().undo();
  assert(
    useSyncStore.getState().chartSettings.canvasBgColor === beforeColor,
    'undo restores state captured by commitSnapshot'
  );
}

console.log('\n--- 5. DEBOUNCED PERSIST STORAGE ---');
{
  flushPersistedWorkspaceStorage();
  const baselineCalls = setItemCalls;
  for (let i = 0; i < 20; i++) {
    useSyncStore.getState().setActiveScriptCode(`# script ${i}`);
  }
  assert(
    setItemCalls === baselineCalls,
    'Rapid keystrokes do not synchronously call localStorage.setItem'
  );
  flushPersistedWorkspaceStorage();
  assert(
    setItemCalls === baselineCalls + 1,
    'flushPersistedWorkspaceStorage writes once with latest state'
  );
  const persistedRaw = localStorageStore.get('ordercraft_workspace_sync_v2') || '';
  assert(
    persistedRaw.includes('# script 19'),
    'Flushed storage contains latest activeScriptCode'
  );
}

console.log('\n========================================');
console.log(`TOTAL TESTS: ${totalTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${failedTests}`);
console.log('========================================\n');

if (failedTests > 0) {
  process.exit(1);
}
