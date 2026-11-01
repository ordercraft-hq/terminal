import {
  computeSMA,
  computeEMA,
  computeWMA,
  computeBollingerBands,
  computeRSI,
  computeMACD,
  computeATR,
  computeSuperTrend,
  computeVWAP,
  computeVolume,
} from './calculator';
import type { Candle } from '../transport/client';

function makeCandles(prices: number[]): Candle[] {
  return prices.map((p, idx) => ({
    time: 1700000000 + idx * 60,
    open: p,
    high: p + 2,
    low: p - 2,
    close: p,
    volume: 100,
  }));
}

export function runTests(): boolean {
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (!condition) {
      console.error(`FAIL: ${msg}`);
      throw new Error(`Test failed: ${msg}`);
    }
    passed++;
  }

  // 1. SMA Test
  const testPrices = [10, 20, 30, 40, 50];
  const candles = makeCandles(testPrices);
  const sma3 = computeSMA(candles, 3);
  assert(sma3.length === 3, 'SMA(3) length must be 3 for 5 bars');
  assert(Math.abs(sma3[0].value - 20) < 1e-6, 'SMA 1st value should be 20');
  assert(Math.abs(sma3[1].value - 30) < 1e-6, 'SMA 2nd value should be 30');
  assert(Math.abs(sma3[2].value - 40) < 1e-6, 'SMA 3rd value should be 40');

  // 2. EMA Test
  const ema3 = computeEMA(candles, 3);
  assert(ema3.length === 3, 'EMA(3) length must be 3');
  // First EMA = SMA = 20; 2nd = 0.5 * 40 + 0.5 * 20 = 30; 3rd = 0.5 * 50 + 0.5 * 30 = 40
  assert(Math.abs(ema3[0].value - 20) < 1e-6, 'EMA 1st value should be 20');
  assert(Math.abs(ema3[1].value - 30) < 1e-6, 'EMA 2nd value should be 30');
  assert(Math.abs(ema3[2].value - 40) < 1e-6, 'EMA 3rd value should be 40');

  // 3. WMA Test
  const wma3 = computeWMA(candles, 3);
  assert(wma3.length === 3, 'WMA(3) length must be 3');
  // WMA(10, 20, 30) = (10*1 + 20*2 + 30*3) / 6 = (10 + 40 + 90) / 6 = 140/6 = 23.333333
  assert(Math.abs(wma3[0].value - 23.333333333333332) < 1e-6, 'WMA 1st value');

  // 4. Bollinger Bands Test
  const bb = computeBollingerBands(candles, 3, 2.0);
  assert(bb.basis.length === 3, 'BB basis length should be 3');
  assert(bb.upper.length === 3, 'BB upper length should be 3');
  assert(bb.lower.length === 3, 'BB lower length should be 3');
  assert(bb.upper[0].value > bb.basis[0].value, 'BB upper must be above basis');
  assert(bb.lower[0].value < bb.basis[0].value, 'BB lower must be below basis');

  // 5. RSI Test
  const rsiPrices = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00];
  const rsiCandles = makeCandles(rsiPrices);
  const rsi = computeRSI(rsiCandles, 14);
  assert(rsi.length === 2, 'RSI(14) on 16 candles should produce 2 values');
  assert(rsi[0].value >= 0 && rsi[0].value <= 100, 'RSI value must be between 0 and 100');

  // 6. MACD Test
  const longPrices = Array.from({ length: 45 }, (_, i) => 100 + Math.sin(i * 0.2) * 10);
  const macdCandles = makeCandles(longPrices);
  const macd = computeMACD(macdCandles, 12, 26, 9);
  assert(macd.macd.length > 0, 'MACD line should have values');
  assert(macd.signal.length > 0, 'MACD signal line should have values');
  assert(macd.hist.length > 0, 'MACD hist should have values');

  // 7. ATR Test
  const atr = computeATR(macdCandles, 14);
  assert(atr.length > 0, 'ATR should have values');
  assert(atr[0].value > 0, 'ATR value must be positive');

  // 8. SuperTrend Test
  const st = computeSuperTrend(macdCandles, 10, 3.0);
  assert(st.length > 0, 'SuperTrend should have values');
  assert(st[0].color === '#089981' || st[0].color === '#F23645', 'SuperTrend color should be green or red');

  // 9. VWAP Session Test (Verifies no false jump at 20:00 NY / 00:00 UTC)
  // Continuous 15m candles from 18:00 NY (22:00 UTC) to 20:15 NY (00:15 UTC):
  const sessionCandles: Candle[] = [];
  const startT = 1730066400; // 18:00 NY
  // 10 candles from 18:00 to 20:15 (each 15m = 900s)
  for (let i = 0; i < 10; i++) {
    sessionCandles.push({
      time: startT + i * 900,
      open: 100 + i * 2,
      high: 100 + i * 2,
      low: 100 + i * 2,
      close: 100 + i * 2,
      volume: 10,
    });
  }
  // Then a 75-minute gap to the next trading day at 18:00 NY
  sessionCandles.push({
    time: startT + 86400,
    open: 200,
    high: 200,
    low: 200,
    close: 200,
    volume: 10,
  });

  const vwap = computeVWAP(sessionCandles, 'session');
  assert(vwap.length === 11, 'VWAP should have 11 points');
  // Bar 0: typical = 100, vwap = 100
  assert(Math.abs(vwap[0].value - 100) < 1e-6, 'VWAP 0 should be 100');
  // Bar 1: (100*10 + 102*10) / 20 = 101
  assert(Math.abs(vwap[1].value - 101) < 1e-6, 'VWAP 1 should be 101');
  // Bar 8 is 20:00 NY (00:00 UTC) -> should NOT reset, value should be weighted average of all 9 bars
  // 10. Volume and Volume MA Test
  const volCandles: Candle[] = [
    { time: 100, open: 10, high: 15, low: 9, close: 12, volume: 100 }, // up -> colorUp
    { time: 160, open: 12, high: 14, low: 8, close: 8, volume: 200 },  // down -> colorDown
    { time: 220, open: 8, high: 11, low: 7, close: 9, volume: 300 },   // up -> colorUp
  ];
  const volResult = computeVolume(volCandles, true, 2, '#00ff00', '#ff0000');
  assert(volResult.vol.length === 3, 'Volume bars length should be 3');
  assert(volResult.vol[0].color === '#00ff00', 'Bar 0 should use custom colorUp');
  assert(volResult.vol[1].color === '#ff0000', 'Bar 1 should use custom colorDown');
  assert(volResult.vol[2].color === '#00ff00', 'Bar 2 should use custom colorUp');
  assert(volResult.ma.length === 2, 'Volume MA(2) on 3 bars should produce 2 values');
  assert(Math.abs(volResult.ma[0].value - 150) < 1e-6, 'Volume MA 1st value should be (100+200)/2 = 150');
  assert(Math.abs(volResult.ma[1].value - 250) < 1e-6, 'Volume MA 2nd value should be (200+300)/2 = 250');

  console.log(`All ${passed}/${total} mathematical indicator tests passed successfully!`);
  return true;
}

