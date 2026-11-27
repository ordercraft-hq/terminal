/**
 * Server Time Synchronization Utility
 *
 * Keeps the frontend clock accurately synchronized with exchange/server time,
 * eliminating bar countdown drift and premature/late candle cutoffs caused by
 * local client OS clock skew.
 */

import { transport } from '../transport/client';

let serverTimeOffsetMs = 0;
let hasSynced = false;
let syncPromise: Promise<void> | null = null;

export async function syncServerTime(): Promise<void> {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    try {
      const t0 = performance.now();
      const data = await transport.getServerTime();
      const t1 = performance.now();
      const roundTripMs = (t1 - t0) / 2;
      const serverMs = data.server_time_ms || (data.server_time || 0) * 1000;
      if (serverMs > 0) {
        serverTimeOffsetMs = Math.round(serverMs + roundTripMs - Date.now());
        hasSynced = true;
      }
    } catch {
      // Graceful fallback: maintain current offset
    } finally {
      syncPromise = null;
    }
  })();
  return syncPromise;
}

// Auto-sync on load, refresh every 60s when visible, and resync on visibility restore
if (typeof window !== 'undefined') {
  void syncServerTime();

  const timer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    void syncServerTime();
  }, 60_000);

  const maybeUnref = timer as unknown as { unref?: () => void };
  if (typeof maybeUnref.unref === 'function') {
    maybeUnref.unref();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void syncServerTime();
      }
    });
  }
}

/**
 * Incorporate a high-confidence server timestamp from an incoming live tick or candle.
 * If the exchange/server timestamp indicates our clock is lagging behind server time,
 * smoothly adjust the offset immediately.
 */
export function recordServerTimestamp(unixSec: number): void {
  if (!unixSec || unixSec <= 0) return;
  const impliedServerMs = unixSec * 1000;
  const currentEstimatedMs = Date.now() + serverTimeOffsetMs;
  // If the live incoming tick/bar has a timestamp ahead of our estimated server time,
  // the client clock has drifted slow: catch up immediately
  if (impliedServerMs > currentEstimatedMs) {
    serverTimeOffsetMs = impliedServerMs - Date.now();
    hasSynced = true;
  }
}

/**
 * Returns current timestamp in milliseconds synchronized to exchange/server time.
 */
export function getServerTimeMs(): number {
  return Date.now() + serverTimeOffsetMs;
}

/**
 * Returns current timestamp in seconds (Unix epoch) synchronized to exchange/server time.
 */
export function getServerTimeSec(): number {
  return Math.floor((Date.now() + serverTimeOffsetMs) / 1000);
}

/**
 * Get current calculated offset in milliseconds (ServerTime - LocalClientTime).
 */
export function getServerTimeOffsetMs(): number {
  return serverTimeOffsetMs;
}

/**
 * Whether initial synchronization has completed.
 */
export function isServerTimeSynced(): boolean {
  return hasSynced;
}
