package datafeed

import (
	"testing"
)

func TestResolutionToSeconds(t *testing.T) {
	cases := []struct {
		input    string
		expected int64
	}{
		{"1s", 1},
		{"5s", 5},
		{"15s", 15},
		{"30s", 30},
		{"1m", 60},
		{"3m", 180},
		{"5m", 300},
		{"15m", 900},
		{"30m", 1800},
		{"45m", 2700},
		{"1h", 3600},
		{"2h", 7200},
		{"4h", 14400},
		{"1D", 86400},
		{"1W", 604800},
		{"1M", 2592000},
	}

	for _, tc := range cases {
		actual := ResolutionToSeconds(tc.input)
		if actual != tc.expected {
			t.Errorf("ResolutionToSeconds(%q) = %d; want %d", tc.input, actual, tc.expected)
		}
	}
}

func TestAggregateCandles(t *testing.T) {
	// 3 consecutive 1-minute bars
	bars := []Candle{
		{Time: 180, Open: 100, High: 105, Low: 99, Close: 103, Volume: 10},
		{Time: 240, Open: 103, High: 108, Low: 102, Close: 107, Volume: 15},
		{Time: 300, Open: 107, High: 110, Low: 106, Close: 109, Volume: 20},
	}

	// Aggregate into a 3-minute bar (180 seconds duration)
	// Bucket for Time: 180..359 will be bucket 180
	agg := AggregateCandles(bars, 180)
	if len(agg) != 1 {
		t.Fatalf("Expected 1 aggregated candle, got %d", len(agg))
	}

	c := agg[0]
	if c.Time != 180 {
		t.Errorf("Expected bucket time 180, got %d", c.Time)
	}
	if c.Open != 100 {
		t.Errorf("Expected Open 100, got %f", c.Open)
	}
	if c.High != 110 {
		t.Errorf("Expected High 110, got %f", c.High)
	}
	if c.Low != 99 {
		t.Errorf("Expected Low 99, got %f", c.Low)
	}
	if c.Close != 109 {
		t.Errorf("Expected Close 109, got %f", c.Close)
	}
	if c.Volume != 45 {
		t.Errorf("Expected Volume 45, got %f", c.Volume)
	}
}

func TestLiveAggregator(t *testing.T) {
	agg := NewLiveAggregator("1m")

	// Tick 1
	c1 := agg.UpdateTick(100.0, 65)
	if c1.Time != 60 || c1.Open != 100 || c1.Close != 100 {
		t.Errorf("Unexpected c1: %+v", c1)
	}

	// Tick 2 (higher)
	c2 := agg.UpdateTick(105.0, 75)
	if c2.High != 105 || c2.Close != 105 || c2.Volume != 2 {
		t.Errorf("Unexpected c2: %+v", c2)
	}

	// Tick 3 (lower)
	c3 := agg.UpdateTick(98.0, 85)
	if c3.Low != 98 || c3.Close != 98 || c3.Volume != 3 {
		t.Errorf("Unexpected c3: %+v", c3)
	}
}
