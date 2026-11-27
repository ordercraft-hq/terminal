package datafeed

import (
	"testing"
)

func TestSyntheticSpreadMath(t *testing.T) {
	a := []Candle{
		{Time: 100, Open: 100, High: 105, Low: 95, Close: 102, Volume: 10},
		{Time: 200, Open: 102, High: 110, Low: 100, Close: 108, Volume: 15},
	}
	b := []Candle{
		{Time: 100, Open: 50, High: 52, Low: 48, Close: 51, Volume: 5},
		{Time: 200, Open: 51, High: 55, Low: 50, Close: 54, Volume: 8},
	}

	// Difference A - B
	diff := SynthesizeSpreadCandles(a, b, SpreadOpSub, AlignIntersection)
	if len(diff) != 2 {
		t.Fatalf("Expected 2 candles, got %d", len(diff))
	}
	if diff[0].Open != 50 || diff[0].Close != 51 {
		t.Fatalf("Expected Open 50, Close 51, got %f, %f", diff[0].Open, diff[0].Close)
	}
	// Verify geometry invariant
	for _, c := range diff {
		if c.High < c.Open || c.High < c.Close || c.Low > c.Open || c.Low > c.Close {
			t.Fatalf("Candle invariant violated: %+v", c)
		}
	}

	// Ratio A / B
	ratio := SynthesizeSpreadCandles(a, b, SpreadOpDiv, AlignIntersection)
	if len(ratio) != 2 {
		t.Fatalf("Expected 2 candles, got %d", len(ratio))
	}
	if ratio[0].Open != 2.0 || ratio[0].Close != 2.0 {
		t.Fatalf("Expected Open 2.0, Close 2.0, got %f, %f", ratio[0].Open, ratio[0].Close)
	}

	// Addition A + B
	sum := SynthesizeSpreadCandles(a, b, SpreadOpAdd, AlignIntersection)
	if len(sum) != 2 {
		t.Fatalf("Expected 2 candles, got %d", len(sum))
	}
	if sum[0].Open != 150 || sum[0].Close != 153 {
		t.Fatalf("Expected Open 150, Close 153, got %f, %f", sum[0].Open, sum[0].Close)
	}

	// Multiplication A * B
	prod := SynthesizeSpreadCandles(a, b, SpreadOpMul, AlignIntersection)
	if len(prod) != 2 {
		t.Fatalf("Expected 2 candles, got %d", len(prod))
	}
	if prod[0].Open != 5000 || prod[0].Close != 5202 {
		t.Fatalf("Expected Open 5000, Close 5202, got %f, %f", prod[0].Open, prod[0].Close)
	}

	// Vector operations
	v1 := []float64{10, 20, 30}
	v2 := []float64{2, 4, 5}
	subRes := SpreadSub(v1, v2)
	if subRes[0] != 8 || subRes[1] != 16 || subRes[2] != 25 {
		t.Fatalf("SpreadSub mismatch: %+v", subRes)
	}

	divRes := SpreadDiv(v1, v2)
	if divRes[0] != 5 || divRes[1] != 5 || divRes[2] != 6 {
		t.Fatalf("SpreadDiv mismatch: %+v", divRes)
	}

	linRes := LinearCombination([][]float64{v1, v2}, []float64{1.0, -2.0})
	if linRes[0] != 6 || linRes[1] != 12 || linRes[2] != 20 {
		t.Fatalf("LinearCombination mismatch: %+v", linRes)
	}
}

func TestDeltaAggregatorOrderflow(t *testing.T) {
	agg := NewDeltaAggregator("1m", 1.0)

	// Ingest ticks: 2 buys of 5 vol at 100.0, 1 sell of 4 vol at 99.0
	agg.UpdateTick(TickData{Time: 1000, Price: 100.0, Volume: 5, Side: TickSideBuy})
	agg.UpdateTick(TickData{Time: 1010, Price: 100.0, Volume: 5, Side: TickSideBuy})
	dBar, _ := agg.UpdateTick(TickData{Time: 1015, Price: 99.0, Volume: 4, Side: TickSideSell})

	if dBar.AskVolume != 10 || dBar.BidVolume != 4 {
		t.Fatalf("Expected Ask 10, Bid 4, got Ask %f, Bid %f", dBar.AskVolume, dBar.BidVolume)
	}
	if dBar.Delta != 6 {
		t.Fatalf("Expected Delta 6, got %f", dBar.Delta)
	}

	fp := agg.GetFootprintBar("1m")
	if fp.POC != 100.0 || fp.POCVolume != 10.0 {
		t.Fatalf("Expected POC 100.0 with 10.0 vol, got POC %f with %f vol", fp.POC, fp.POCVolume)
	}
	if fp.TotalDelta != 6.0 {
		t.Fatalf("Expected total delta 6.0, got %f", fp.TotalDelta)
	}
	if len(fp.Levels) != 2 {
		t.Fatalf("Expected 2 price levels (99, 100), got %d", len(fp.Levels))
	}
}

func TestSynthesizeSpreadCandlesUnsortedAndForwardFill(t *testing.T) {
	a := []Candle{
		{Time: 300, Open: 30, High: 32, Low: 29, Close: 31, Volume: 10},
		{Time: 100, Open: 10, High: 12, Low: 9, Close: 11, Volume: 10},
	}
	b := []Candle{
		{Time: 200, Open: 5, High: 6, Low: 4, Close: 5, Volume: 5},
		{Time: 100, Open: 4, High: 5, Low: 3, Close: 4, Volume: 5},
	}

	res := SynthesizeSpreadCandles(a, b, SpreadOpSub, AlignForwardFill)
	if len(res) != 3 {
		t.Fatalf("expected 3 bars (100, 200, 300), got %d", len(res))
	}
	if res[0].Time != 100 || res[1].Time != 200 || res[2].Time != 300 {
		t.Fatalf("expected ascending timestamps [100,200,300], got [%d,%d,%d]", res[0].Time, res[1].Time, res[2].Time)
	}
	// At t=200, a is forward-filled from a[100].Close (11)
	if res[1].Open != 6 || res[1].Close != 6 {
		t.Fatalf("expected t=200 Open=6 Close=6, got Open=%v Close=%v", res[1].Open, res[1].Close)
	}
}
