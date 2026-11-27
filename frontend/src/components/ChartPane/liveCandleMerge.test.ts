import { mergeLiveCandleTick } from './liveCandleMerge';
import type { Candle } from '../../transport/client';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    passed++;
  }
}

function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    console.error(`FAIL: ${msg} — got ${String(actual)}, want ${String(expected)}`);
    failed++;
  } else {
    passed++;
  }
}

// 1. Authoritative REST Open update on the active forming tip bar
{
  const arr: Candle[] = [
    { time: 1700000040, open: 25688, high: 25690, low: 25673, close: 25673, volume: 120 },
    { time: 1700000100, open: 25660, high: 25665, low: 25655, close: 25658, volume: 12 },
  ];
  const restTip: Candle = {
    time: 1700000100,
    open: 25673,
    high: 25674,
    low: 25655,
    close: 25658,
    volume: 45,
  };
  const res = mergeLiveCandleTick(arr, restTip, 60);
  assertEq(res.action, 'update', 'tip open reconciliation uses incremental update');
  assertEq(res.candle.open, 25673, 'adopts authoritative REST open on active tip');
  assertEq(res.candle.high, 25674, 'merges high including reconciled open');
  assertEq(res.candle.low, 25655, 'preserves low');
  assertEq(res.candle.volume, 45, 'adopts higher REST cumulative volume');
}

// 2. Finalized previous bar arriving after next minute opened triggers resync
{
  const arr: Candle[] = [
    { time: 1700000040, open: 25688, high: 25690, low: 25665, close: 25666, volume: 100 },
    { time: 1700000100, open: 25666, high: 25668, low: 25650, close: 25652, volume: 8 },
  ];
  const finalizedPrev: Candle = {
    time: 1700000040,
    open: 25688,
    high: 25690,
    low: 25665,
    close: 25673,
    volume: 115,
  };
  const res = mergeLiveCandleTick(arr, finalizedPrev, 60);
  assertEq(res.action, 'resync', 'previous bar close correction requests series resync');
  assertEq(arr[0].close, 25673, 'previous bar close corrected to 25673');
  assertEq(arr[0].volume, 115, 'previous bar volume updated to 115');
  assertEq(res.needsCatchUp, false, 'reconciling finalized bar does not trigger catchUp gap');
}

// 3. Re-emitting identical previous bar is a no-op (no unnecessary setData churn)
{
  const arr: Candle[] = [
    { time: 1700000040, open: 25688, high: 25690, low: 25665, close: 25673, volume: 115 },
    { time: 1700000100, open: 25673, high: 25675, low: 25660, close: 25664, volume: 20 },
  ];
  const duplicatePrev: Candle = {
    time: 1700000040,
    open: 25688,
    high: 25690,
    low: 25665,
    close: 25673,
    volume: 115,
  };
  const res = mergeLiveCandleTick(arr, duplicatePrev, 60);
  assertEq(res.action, 'noop', 'identical previous bar returns noop');
}

// 4. Out-of-order missing bar inserts cleanly in sorted order
{
  const arr: Candle[] = [
    { time: 1700000040, open: 100, high: 105, low: 99, close: 102, volume: 10 },
    { time: 1700000160, open: 103, high: 106, low: 102, close: 104, volume: 5 },
  ];
  const missing: Candle = {
    time: 1700000100,
    open: 102,
    high: 104,
    low: 101,
    close: 103,
    volume: 9,
  };
  const res = mergeLiveCandleTick(arr, missing, 60);
  assertEq(res.action, 'resync', 'missing bar insertion triggers resync');
  assertEq(arr.length, 3, 'array now has 3 bars');
  assert(arr[1].time === 1700000100 && arr[1].close === 103, 'inserted at sorted index 1');
}

// 5. Real multi-bar gap sets needsCatchUp: true
{
  const arr: Candle[] = [
    { time: 1700000040, open: 100, high: 105, low: 99, close: 102, volume: 10 },
  ];
  const gapped: Candle = {
    time: 1700000340,
    open: 110,
    high: 112,
    low: 109,
    close: 111,
    volume: 4,
  };
  const res = mergeLiveCandleTick(arr, gapped, 60);
  assertEq(res.action, 'update', 'new bar after gap updates series');
  assertEq(res.needsCatchUp, true, 'gap > 1.5x duration requests catch-up backfill');
}

if (failed > 0) {
  throw new Error(`liveCandleMerge.test.ts: ${failed} failed, ${passed} passed`);
}
console.log(`liveCandleMerge.test.ts: All ${passed} assertions passed.`);
