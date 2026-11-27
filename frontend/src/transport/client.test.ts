declare const process: { exit: (code: number) => never };

interface SentFrame {
  url: string;
  data: string;
}

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];
  static sentFrames: SentFrame[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  closedCount = 0;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    MockWebSocket.sentFrames.push({ url: this.url, data });
  }

  close(_code?: number, _reason?: string): void {
    this.closedCount++;
    this.readyState = MockWebSocket.CLOSED;
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({} as Event);
  }

  simulateMessage(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }

  simulateError(): void {
    this.onerror?.({} as Event);
  }
}

Object.defineProperty(globalThis, 'WebSocket', {
  value: MockWebSocket,
  configurable: true,
});

import {
  TransportClient,
  computeReconnectDelayMs,
  type Candle,
  type IndicatorStreamUpdate,
} from './client.ts';

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

async function runTests(): Promise<void> {
  console.log('\n--- 1. EXPONENTIAL BACKOFF + JITTER ---');
  {
    const d0 = computeReconnectDelayMs(0);
    const d3 = computeReconnectDelayMs(3);
    const d10 = computeReconnectDelayMs(10);
    assert(d0 >= 800 && d0 <= 1200, `Attempt 0 delay within 1s +/- 20% (${d0}ms)`);
    assert(d3 >= 6400 && d3 <= 9600, `Attempt 3 delay within 8s +/- 20% (${d3}ms)`);
    assert(d10 <= 30000, `Attempt 10 delay capped at 30s (${d10}ms)`);
  }

  console.log('\n--- 2. /ws COALESCING, IDLE CLOSE & ERROR RECOVERY ---');
  {
    MockWebSocket.instances = [];
    MockWebSocket.sentFrames = [];
    const client = new TransportClient();

    const received: Candle[] = [];
    const unsub = client.subscribeLiveKline('BINANCE:BTCUSDT', '1m', (c) => {
      received.push(c);
    });

    assert(MockWebSocket.instances.length === 1, 'Creates 1 WebSocket for /ws');
    const ws = MockWebSocket.instances[0];

    // Simulate error while connecting -> should reset connecting flag cleanly
    ws.simulateError();
    ws.simulateOpen();

    // Burst of 3 ticks on time=1000 and 1 tick on time=1060 in same microtask
    ws.simulateMessage({
      type: 'candle',
      symbol: 'BINANCE:BTCUSDT',
      resolution: '1m',
      candle: { time: 1000, open: 100, high: 101, low: 99, close: 100.5, volume: 10 },
    });
    ws.simulateMessage({
      type: 'candle',
      symbol: 'BINANCE:BTCUSDT',
      resolution: '1m',
      candle: { time: 1000, open: 100, high: 102, low: 99, close: 101.5, volume: 12 },
    });
    ws.simulateMessage({
      type: 'candle',
      symbol: 'BINANCE:BTCUSDT',
      resolution: '1m',
      candle: { time: 1060, open: 101.5, high: 103, low: 101, close: 102.5, volume: 4 },
    });

    await new Promise((r) => setTimeout(r, 10));

    assert(received.length === 2, `Coalesced 2 ticks at t=1000 and kept t=1060 (got ${received.length})`);
    assert(received[0]?.close === 101.5, 'Latest tick for t=1000 delivered');
    assert(received[1]?.time === 1060, 'New bar t=1060 preserved');

    unsub();
    assert(ws.closedCount === 1, 'Closes /ws cleanly when all subscribers unsubscribe');
  }

  console.log('\n--- 3. SHARED MULTIPLEXED /ws/indicators ---');
  {
    MockWebSocket.instances = [];
    MockWebSocket.sentFrames = [];
    const client = new TransportClient();

    const updatesA: IndicatorStreamUpdate[] = [];
    const updatesB: IndicatorStreamUpdate[] = [];

    const unsubA = client.subscribeIndicatorStream({
      symbol: 'BINANCE:BTCUSDT',
      resolution: '15m',
      indicators: [{ instanceId: 'ind_a', indicatorId: 'sma', inputs: { period: 20 } }],
      onUpdate: (u) => updatesA.push(u),
    });

    const unsubB = client.subscribeIndicatorStream({
      symbol: 'BINANCE:BTCUSDT',
      resolution: '15m',
      indicators: [{ instanceId: 'ind_b', indicatorId: 'ema', inputs: { period: 50 } }],
      onUpdate: (u) => updatesB.push(u),
    });

    assert(
      MockWebSocket.instances.length === 1,
      `Multiplexes two indicator panes over 1 /ws/indicators socket (got ${MockWebSocket.instances.length})`
    );
    const indWs = MockWebSocket.instances[0];
    indWs.simulateOpen();

    indWs.simulateMessage({
      type: 'indicator_update',
      symbol: 'BINANCE:BTCUSDT',
      resolution: '15m',
      time: 1000,
      plots: {
        ind_a: { sma: 50100 },
        ind_b: { ema: 49900 },
      },
    });

    assert(updatesA.length === 1 && updatesA[0].plots.ind_a?.sma === 50100, 'Pane A receives ind_a');
    assert(!updatesA[0].plots.ind_b, 'Pane A does not receive ind_b');
    assert(updatesB.length === 1 && updatesB[0].plots.ind_b?.ema === 49900, 'Pane B receives ind_b');

    unsubA();
    assert(indWs.closedCount === 0, 'Socket remains open while Pane B is subscribed');
    const unsubFrames = MockWebSocket.sentFrames.filter((f) => f.data.includes('indicator_unsubscribe'));
    assert(
      unsubFrames.length === 1 && unsubFrames[0].data.includes('ind_a'),
      'Sends targeted indicator_unsubscribe for ind_a'
    );

    unsubB();
    assert(indWs.closedCount === 1, 'Closes /ws/indicators socket when last subscriber unsubscribes');
  }

  console.log('\n========================================');
  console.log(`TOTAL TESTS: ${totalTests}`);
  console.log(`PASSED: ${passedTests}`);
  console.log(`FAILED: ${failedTests}`);
  console.log('========================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

void runTests();
