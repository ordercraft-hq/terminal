import type { Candle } from '../../transport/client';

export interface LiveCandleMergeResult {
  action: 'update' | 'resync' | 'noop';
  candle: Candle;
  needsCatchUp: boolean;
}

/**
 * Merges an incoming live or REST-reconciled candle update into the sorted
 * chart candle array in place and reports whether Lightweight Charts can use an
 * incremental `series.update()` (`update`) or needs a series `setData()` sync
 * (`resync`) because an earlier closed/finalized bar was updated or inserted.
 */
export function mergeLiveCandleTick(
  arr: Candle[],
  liveCandle: Candle,
  timeframeDurationSec: number
): LiveCandleMergeResult {
  const dur = Math.max(1, timeframeDurationSec);
  const rawTime =
    typeof liveCandle.time === 'number'
      ? liveCandle.time
      : Math.floor(new Date(liveCandle.time).getTime() / 1000);
  const bucketTime = dur > 1 ? Math.floor(rawTime / dur) * dur : rawTime;

  if (arr.length === 0) {
    const initialized: Candle = {
      ...liveCandle,
      time: bucketTime,
    };
    arr.push(initialized);
    return { action: 'update', candle: initialized, needsCatchUp: false };
  }

  const lastBar = arr[arr.length - 1];

  if (bucketTime < lastBar.time) {
    // Scan backwards since reconciled previous bars are almost always at arr.length - 2.
    let idx = -1;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].time === bucketTime) {
        idx = i;
        break;
      }
      if (arr[i].time < bucketTime) {
        break;
      }
    }

    if (idx !== -1) {
      const existing = arr[idx];
      const nextOpen = liveCandle.open > 0 ? liveCandle.open : existing.open;
      const nextHigh = Math.max(existing.high, liveCandle.high, nextOpen, liveCandle.close);
      const lowCandidates = [existing.low, liveCandle.low, nextOpen, liveCandle.close].filter(
        (v) => v > 0
      );
      const nextLow = lowCandidates.length > 0 ? Math.min(...lowCandidates) : liveCandle.low;
      const nextClose = liveCandle.close;
      const nextVolume = Math.max(existing.volume || 0, liveCandle.volume ?? 0);

      const ohlcChanged =
        nextOpen !== existing.open ||
        nextHigh !== existing.high ||
        nextLow !== existing.low ||
        nextClose !== existing.close;

      const updated: Candle = {
        time: bucketTime,
        open: nextOpen,
        high: nextHigh,
        low: nextLow,
        close: nextClose,
        volume: nextVolume,
      };
      arr[idx] = updated;

      return {
        action: ohlcChanged ? 'resync' : 'noop',
        candle: updated,
        needsCatchUp: false,
      };
    }

    // Missing historical/previous bar received out of order: insert in ascending order.
    const inserted: Candle = {
      ...liveCandle,
      time: bucketTime,
      volume: liveCandle.volume ?? 0,
    };
    let insertAt = arr.length;
    while (insertAt > 0 && arr[insertAt - 1].time > bucketTime) {
      insertAt--;
    }
    arr.splice(insertAt, 0, inserted);
    return { action: 'resync', candle: inserted, needsCatchUp: false };
  }

  if (lastBar.time === bucketTime) {
    const liveVol = liveCandle.volume ?? 0;
    const newVolume = Math.max(lastBar.volume || 0, liveVol);
    // Adopt authoritative Open updates when provider REST reconciliation corrects
    // a stream tick's initial price.
    const nextOpen = liveCandle.open > 0 ? liveCandle.open : lastBar.open;
    const lowCandidates = [lastBar.low, liveCandle.low, nextOpen, liveCandle.close].filter(
      (v) => v > 0
    );
    const aggregatedCandle: Candle = {
      time: bucketTime,
      open: nextOpen,
      high: Math.max(lastBar.high, liveCandle.high, nextOpen, liveCandle.close),
      low: lowCandidates.length > 0 ? Math.min(...lowCandidates) : liveCandle.low,
      close: liveCandle.close,
      volume: newVolume,
    };
    arr[arr.length - 1] = aggregatedCandle;
    return { action: 'update', candle: aggregatedCandle, needsCatchUp: false };
  }

  // New bar opened (`bucketTime > lastBar.time`).
  const isGap = bucketTime - lastBar.time > dur * 1.5;
  const openPrice = liveCandle.open > 0 ? liveCandle.open : liveCandle.close;
  const nextLow =
    liveCandle.low > 0
      ? Math.min(liveCandle.low, openPrice, liveCandle.close)
      : Math.min(openPrice, liveCandle.close);
  const aggregatedCandle: Candle = {
    time: bucketTime,
    open: openPrice,
    high: Math.max(liveCandle.high, openPrice, liveCandle.close),
    low: nextLow,
    close: liveCandle.close,
    volume: liveCandle.volume ?? 0,
  };
  arr.push(aggregatedCandle);
  return { action: 'update', candle: aggregatedCandle, needsCatchUp: isGap };
}
