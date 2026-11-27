package wickra

import (
	"context"
	"math"
	"testing"
)

var testPrices = []float64{
	10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 14.0, 13.0, 12.0, 11.0, 10.0, 11.0, 12.0, 13.0, 14.0,
}

func almostEqual(a, b, tol float64) bool {
	if math.IsNaN(a) && math.IsNaN(b) {
		return true
	}
	if math.IsNaN(a) || math.IsNaN(b) {
		return false
	}
	return math.Abs(a-b) <= tol
}

func TestCatalogIntegrity(t *testing.T) {
	cat := DefaultCatalog()
	count := cat.Count()
	if count != 515 {
		t.Fatalf("Expected 515 indicators in catalog, got %d", count)
	}

	sma, ok := cat.GetByID("wickra.sma")
	if !ok || sma.Name != "Simple Moving Average" {
		t.Fatalf("wickra.sma not found or invalid: %+v", sma)
	}

	macd, ok := cat.GetByID("wickra.macd")
	if !ok || macd.ShortName != "MACD" {
		t.Fatalf("wickra.macd not found or invalid: %+v", macd)
	}

	bb, ok := cat.GetByID("wickra.bollinger_bands")
	if !ok || bb.WasmClass != "BollingerBands" {
		t.Fatalf("wickra.bollinger_bands not found or invalid: %+v", bb)
	}

	expectedCategories := []string{
		"Trend & Overlays",
		"Oscillators",
		"Volatility & Bands",
		"Volume",
		"Statistics & Risk",
		"DSP & Cycles",
		"Patterns & Drawings",
		"Orderflow & Microstructure",
	}

	for _, catName := range expectedCategories {
		inds := cat.GetByCategory(catName)
		if len(inds) == 0 {
			t.Errorf("Expected category %q to have indicators, got 0", catName)
		}
	}
}

func TestTableDrivenNumericalVerification(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine failed: %v", err)
	}
	defer engine.Close(ctx)

	worker := engine.acquireWorker()
	defer engine.releaseWorker(worker)

	// 1. SMA(5)
	smaDesc, _ := engine.GetDescriptor("wickra.sma")
	smaInst, err := worker.NewIndicator(ctx, &smaDesc, map[string]interface{}{"period": 5})
	if err != nil {
		t.Fatalf("NewIndicator SMA: %v", err)
	}
	defer smaInst.Free(ctx)

	// 2. EMA(5)
	emaDesc, _ := engine.GetDescriptor("wickra.ema")
	emaInst, err := worker.NewIndicator(ctx, &emaDesc, map[string]interface{}{"period": 5})
	if err != nil {
		t.Fatalf("NewIndicator EMA: %v", err)
	}
	defer emaInst.Free(ctx)

	// 3. RSI(5)
	rsiDesc, _ := engine.GetDescriptor("wickra.rsi")
	rsiInst, err := worker.NewIndicator(ctx, &rsiDesc, map[string]interface{}{"period": 5})
	if err != nil {
		t.Fatalf("NewIndicator RSI: %v", err)
	}
	defer rsiInst.Free(ctx)

	// 4. MACD(3, 6, 2)
	macdDesc, _ := engine.GetDescriptor("wickra.macd")
	macdInst, err := worker.NewIndicator(ctx, &macdDesc, map[string]interface{}{
		"fast":   3,
		"slow":   6,
		"signal": 2,
	})
	if err != nil {
		t.Fatalf("NewIndicator MACD: %v", err)
	}
	defer macdInst.Free(ctx)

	// 5. BollingerBands(5, 2.0)
	bbDesc, _ := engine.GetDescriptor("wickra.bollinger_bands")
	bbInst, err := worker.NewIndicator(ctx, &bbDesc, map[string]interface{}{
		"period":     5,
		"multiplier": 2.0,
	})
	if err != nil {
		t.Fatalf("NewIndicator BB: %v", err)
	}
	defer bbInst.Free(ctx)

	const tol = 1e-5

	expectedSMA := []float64{
		math.NaN(), math.NaN(), math.NaN(), math.NaN(),
		12.000000, 13.000000, 13.600000, 13.800000, 13.600000,
		13.000000, 12.000000, 11.400000, 11.200000, 11.400000, 12.000000,
	}

	expectedEMA := []float64{
		math.NaN(), math.NaN(), math.NaN(), math.NaN(),
		12.000000, 13.000000, 13.333333, 13.222222, 12.814815,
		12.209877, 11.473251, 11.315501, 11.543667, 12.029111, 12.686074,
	}

	expectedRSI := []float64{
		math.NaN(), math.NaN(), math.NaN(), math.NaN(), math.NaN(),
		100.000000, 80.000000, 64.000000, 51.200000, 40.960000,
		32.768000, 46.214400, 56.971520, 65.577216, 72.461773,
	}

	expectedMACD := []struct {
		ready  bool
		macd   float64
		signal float64
		hist   float64
	}{
		{ready: false}, {ready: false}, {ready: false}, {ready: false}, {ready: false}, {ready: false},
		{ready: true, macd: 1.071429, signal: 1.285714, hist: -0.214286},
		{ready: true, macd: 0.551020, signal: 0.795918, hist: -0.244898},
		{ready: true, macd: 0.072157, signal: 0.313411, hist: -0.241254},
		{ready: true, macd: -0.323459, signal: -0.111169, hist: -0.212290},
		{ready: true, macd: -0.632828, signal: -0.458942, hist: -0.173886},
		{ready: true, macd: -0.438627, signal: -0.445399, hist: 0.006772},
		{ready: true, macd: -0.092323, signal: -0.210015, hist: 0.117692},
		{ready: true, macd: 0.258832, signal: 0.102550, hist: 0.156282},
		{ready: true, macd: 0.561554, signal: 0.408553, hist: 0.153001},
	}

	expectedBB := []struct {
		ready  bool
		upper  float64
		middle float64
		lower  float64
		stddev float64
	}{
		{ready: false}, {ready: false}, {ready: false}, {ready: false},
		{ready: true, upper: 14.828427, middle: 12.000000, lower: 9.171573, stddev: 1.414214},
		{ready: true, upper: 15.828427, middle: 13.000000, lower: 10.171573, stddev: 1.414214},
		{ready: true, upper: 15.639608, middle: 13.600000, lower: 11.560392, stddev: 1.019804},
		{ready: true, upper: 15.296663, middle: 13.800000, lower: 12.303337, stddev: 0.748331},
		{ready: true, upper: 15.639608, middle: 13.600000, lower: 11.560392, stddev: 1.019804},
		{ready: true, upper: 15.828427, middle: 13.000000, lower: 10.171573, stddev: 1.414214},
		{ready: true, upper: 14.828427, middle: 12.000000, lower: 9.171573, stddev: 1.414214},
		{ready: true, upper: 13.439608, middle: 11.400000, lower: 9.360392, stddev: 1.019804},
		{ready: true, upper: 12.696663, middle: 11.200000, lower: 9.703337, stddev: 0.748331},
		{ready: true, upper: 13.439608, middle: 11.400000, lower: 9.360392, stddev: 1.019804},
		{ready: true, upper: 14.828427, middle: 12.000000, lower: 9.171573, stddev: 1.414214},
	}

	for i, price := range testPrices {
		candle := CandleData{
			Time:  int64(1000 + i*60),
			Open:  price,
			High:  price,
			Low:   price,
			Close: price,
		}

		// SMA
		smaVal, _, smaReady, err := smaInst.Update(ctx, candle)
		if err != nil {
			t.Fatalf("Bar %d: SMA error: %v", i, err)
		}
		if math.IsNaN(expectedSMA[i]) {
			if smaReady {
				t.Fatalf("Bar %d: expected SMA to be warming up", i)
			}
		} else {
			if !smaReady || !almostEqual(smaVal, expectedSMA[i], tol) {
				t.Fatalf("Bar %d: SMA expected %f, got %f (ready=%v)", i, expectedSMA[i], smaVal, smaReady)
			}
		}

		// EMA
		emaVal, _, emaReady, err := emaInst.Update(ctx, candle)
		if err != nil {
			t.Fatalf("Bar %d: EMA error: %v", i, err)
		}
		if math.IsNaN(expectedEMA[i]) {
			if emaReady {
				t.Fatalf("Bar %d: expected EMA to be warming up", i)
			}
		} else {
			if !emaReady || !almostEqual(emaVal, expectedEMA[i], tol) {
				t.Fatalf("Bar %d: EMA expected %f, got %f (ready=%v)", i, expectedEMA[i], emaVal, emaReady)
			}
		}

		// RSI
		rsiVal, _, rsiReady, err := rsiInst.Update(ctx, candle)
		if err != nil {
			t.Fatalf("Bar %d: RSI error: %v", i, err)
		}
		if math.IsNaN(expectedRSI[i]) {
			if rsiReady {
				t.Fatalf("Bar %d: expected RSI to be warming up", i)
			}
		} else {
			if !rsiReady || !almostEqual(rsiVal, expectedRSI[i], tol) {
				t.Fatalf("Bar %d: RSI expected %f, got %f (ready=%v)", i, expectedRSI[i], rsiVal, rsiReady)
			}
		}

		// MACD
		_, macdMap, macdReady, err := macdInst.Update(ctx, candle)
		if err != nil {
			t.Fatalf("Bar %d: MACD error: %v", i, err)
		}
		if !expectedMACD[i].ready {
			if macdReady {
				t.Fatalf("Bar %d: expected MACD to be warming up", i)
			}
		} else {
			if !macdReady {
				t.Fatalf("Bar %d: expected MACD to be ready", i)
			}
			exp := expectedMACD[i]
			if !almostEqual(macdMap["macd"], exp.macd, tol) ||
				!almostEqual(macdMap["signal"], exp.signal, tol) ||
				!almostEqual(macdMap["histogram"], exp.hist, tol) {
				t.Fatalf("Bar %d: MACD expected {macd:%f, sig:%f, hist:%f}, got %+v",
					i, exp.macd, exp.signal, exp.hist, macdMap)
			}
		}

		// Bollinger Bands
		_, bbMap, bbReady, err := bbInst.Update(ctx, candle)
		if err != nil {
			t.Fatalf("Bar %d: BB error: %v", i, err)
		}
		if !expectedBB[i].ready {
			if bbReady {
				t.Fatalf("Bar %d: expected BB to be warming up", i)
			}
		} else {
			if !bbReady {
				t.Fatalf("Bar %d: expected BB to be ready", i)
			}
			exp := expectedBB[i]
			if !almostEqual(bbMap["upper"], exp.upper, tol) ||
				!almostEqual(bbMap["middle"], exp.middle, tol) ||
				!almostEqual(bbMap["lower"], exp.lower, tol) ||
				!almostEqual(bbMap["stddev"], exp.stddev, tol) {
				t.Fatalf("Bar %d: BB expected {upper:%f, mid:%f, low:%f, std:%f}, got %+v",
					i, exp.upper, exp.middle, exp.lower, exp.stddev, bbMap)
			}
		}
	}
}

func TestEngineBatchEvaluate(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	candles := make([]CandleData, len(testPrices))
	for i, p := range testPrices {
		candles[i] = CandleData{
			Time:  int64(1000 + i*60),
			Open:  p,
			High:  p,
			Low:   p,
			Close: p,
		}
	}

	configs := []EvalIndicatorInstance{
		{
			InstanceID:  "ind_sma",
			IndicatorID: "wickra.sma",
			Inputs:      map[string]interface{}{"period": 5},
		},
		{
			InstanceID:  "ind_bb",
			IndicatorID: "wickra.bollinger_bands",
			Inputs:      map[string]interface{}{"period": 5, "multiplier": 2.0},
		},
	}

	results, err := engine.Evaluate(ctx, candles, configs)
	if err != nil {
		t.Fatalf("Evaluate error: %v", err)
	}

	if len(results) != 2 {
		t.Fatalf("Expected 2 results, got %d", len(results))
	}

	smaRes := results[0]
	if smaRes.InstanceID != "ind_sma" {
		t.Fatalf("Expected ind_sma, got %s", smaRes.InstanceID)
	}
	smaPlot := smaRes.Plots["plot"]
	// 15 bars - 4 warmup bars = 11 ready bars
	if len(smaPlot) != 11 {
		t.Fatalf("Expected 11 ready bars for SMA(5), got %d", len(smaPlot))
	}
	if !almostEqual(smaPlot[0].Value, 12.0, 1e-5) {
		t.Fatalf("Expected first ready SMA = 12.0, got %f", smaPlot[0].Value)
	}
	if !almostEqual(smaPlot[len(smaPlot)-1].Value, 12.0, 1e-5) {
		t.Fatalf("Expected last ready SMA = 12.0, got %f", smaPlot[len(smaPlot)-1].Value)
	}

	bbRes := results[1]
	if bbRes.InstanceID != "ind_bb" {
		t.Fatalf("Expected ind_bb, got %s", bbRes.InstanceID)
	}
	if len(bbRes.Plots["upper"]) != 11 || len(bbRes.Plots["middle"]) != 11 || len(bbRes.Plots["lower"]) != 11 {
		t.Fatalf("Expected 11 points per BB plot, got upper=%d, mid=%d, low=%d",
			len(bbRes.Plots["upper"]), len(bbRes.Plots["middle"]), len(bbRes.Plots["lower"]))
	}
}

func TestStreamingSessionLifecycle(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	configs := []EvalIndicatorInstance{
		{
			InstanceID:  "stream_sma",
			IndicatorID: "wickra.sma",
			Inputs:      map[string]interface{}{"period": 3},
		},
		{
			InstanceID:  "stream_macd",
			IndicatorID: "wickra.macd",
			Inputs:      map[string]interface{}{"fast": 3, "slow": 6, "signal": 2},
		},
	}

	session, err := engine.CreateSession(ctx, "BINANCE:BTCUSDT", "1m", configs)
	if err != nil {
		t.Fatalf("CreateSession error: %v", err)
	}

	for i, p := range testPrices {
		candle := CandleData{
			Time:  int64(1000 + i*60),
			Open:  p,
			High:  p,
			Low:   p,
			Close: p,
		}
		plots, err := session.Update(ctx, candle)
		if err != nil {
			t.Fatalf("session.Update error at bar %d: %v", i, err)
		}
		if i >= 2 {
			if _, ok := plots["stream_sma"]; !ok {
				t.Fatalf("Expected stream_sma plot from bar 2 onwards, got %+v", plots)
			}
		}
	}

	if err := session.Close(ctx); err != nil {
		t.Fatalf("session.Close error: %v", err)
	}
}

func TestWorkerPoolingAcrossSessions(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	cfgs := []EvalIndicatorInstance{
		{InstanceID: "pool_sma", IndicatorID: "wickra.sma", Inputs: map[string]interface{}{"period": 3}},
	}

	// Sequentially create and close 12 sessions: pooled worker should be reused instead of spawning 12 modules.
	for i := 0; i < 12; i++ {
		sess, err := engine.CreateSession(ctx, "BINANCE:BTCUSDT", "1m", cfgs)
		if err != nil {
			t.Fatalf("CreateSession %d failed: %v", i, err)
		}
		for bar := 0; bar < 3; bar++ {
			plots, err := sess.Update(ctx, CandleData{Time: int64(1000 + bar*60), Close: float64(10 + bar)})
			if err != nil {
				t.Fatalf("Update %d.%d failed: %v", i, bar, err)
			}
			if bar == 2 {
				if got := plots["pool_sma"]["plot"]; !almostEqual(got, 11.0, 1e-6) {
					t.Fatalf("session %d expected SMA 11.0, got %f", i, got)
				}
			}
		}
		if err := sess.Close(ctx); err != nil {
			t.Fatalf("Close %d failed: %v", i, err)
		}
	}

	if engine.sessionSeq > 4 {
		t.Fatalf("expected worker pool reuse (sessionSeq <= 4), got %d spawned workers", engine.sessionSeq)
	}
}

func TestGetCatalogFiltering(t *testing.T) {
	ctx := context.Background()
	engine, err := NewEngine(ctx)
	if err != nil {
		t.Fatalf("NewEngine: %v", err)
	}
	defer engine.Close(ctx)

	oscRSI := engine.GetCatalog("oscillators", "rsi")
	if len(oscRSI) == 0 {
		t.Fatalf("expected non-empty filtered results for oscillators + rsi")
	}
	foundRSI := false
	for _, d := range oscRSI {
		if d.ID == "wickra.rsi" {
			foundRSI = true
		}
		if d.ID == "wickra.vwap_std_dev_bands" {
			t.Fatalf("deprecated wickra.vwap_std_dev_bands must be excluded")
		}
	}
	if !foundRSI {
		t.Fatalf("expected wickra.rsi in filtered catalog")
	}

	all := engine.GetCatalog("", "")
	if len(all) != engine.Catalog().Count()-1 {
		t.Fatalf("expected %d descriptors (excluding deprecated vwap_std_dev_bands), got %d", engine.Catalog().Count()-1, len(all))
	}
}
