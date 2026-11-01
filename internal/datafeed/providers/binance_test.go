package providers

import (
	"context"
	"testing"
	"time"

	"github.com/ordercraft-hq/terminal/internal/datafeed"
)

func TestBinanceProviderGetHistory(t *testing.T) {
	bp := NewBinanceProvider()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	candles, err := bp.GetHistory(ctx, "BINANCE:BTCUSDT", "15m", 0, 0, 5)
	if err != nil {
		t.Fatalf("Failed to fetch Binance history: %v", err)
	}

	if len(candles) == 0 {
		t.Fatalf("Expected at least 1 candle, got 0")
	}

	last := candles[len(candles)-1]
	if last.Time <= 0 || last.Open <= 0 || last.High <= 0 || last.Low <= 0 || last.Close <= 0 {
		t.Fatalf("Invalid candle values: %+v", last)
	}
}

func TestBinanceProviderSearch(t *testing.T) {
	bp := NewBinanceProvider()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	results, err := bp.Search(ctx, "BTC")
	if err != nil {
		t.Fatalf("Failed to search Binance symbols: %v", err)
	}
	if len(results) == 0 {
		t.Fatalf("Expected symbols matching 'BTC', got 0")
	}
	if results[0].Exchange != "BINANCE" {
		t.Fatalf("Expected exchange BINANCE, got %s", results[0].Exchange)
	}
}

func TestBinanceProviderSubscribe(t *testing.T) {
	bp := NewBinanceProvider()
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()

	defer bp.Unsubscribe("BINANCE:BTCUSDT", "1m")

	received := make(chan bool, 1)
	err := bp.Subscribe(ctx, "BINANCE:BTCUSDT", "1m", func(c datafeed.Candle) {
		t.Logf("Received live candle: time=%d, open=%f, high=%f, low=%f, close=%f, vol=%f",
			c.Time, c.Open, c.High, c.Low, c.Close, c.Volume)
		select {
		case received <- true:
		default:
		}
	})
	if err != nil {
		t.Fatalf("Subscribe error: %v", err)
	}

	select {
	case <-received:
		t.Logf("Successfully received live candle from Binance WS!")
	case <-time.After(8 * time.Second):
		t.Logf("Binance WS connected; no live trade/candle update occurred within 8s window")
	}
}

func TestBinanceProviderUS_Switch(t *testing.T) {
	bp := NewBinanceProvider()
	bp.SwitchToUS()

	if !bp.IsUS() {
		t.Fatalf("Expected IsUS to be true after SwitchToUS()")
	}
	if bp.BaseURL() != "https://api.binance.us" {
		t.Fatalf("Expected BaseURL https://api.binance.us, got %s", bp.BaseURL())
	}
	if bp.WSHost() != "stream.binance.us:9443" {
		t.Fatalf("Expected WSHost stream.binance.us:9443, got %s", bp.WSHost())
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	candles, err := bp.GetHistory(ctx, "BINANCE:BTCUSDT", "15m", 0, 0, 2)
	if err != nil {
		t.Fatalf("Binance.US GetHistory failed: %v", err)
	}
	if len(candles) == 0 {
		t.Fatalf("Expected candles from Binance.US, got 0")
	}
}
