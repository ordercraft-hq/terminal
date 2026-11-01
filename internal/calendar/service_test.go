package calendar

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCalendarService(t *testing.T) {
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[
			{"title":"Fed Rate Decision","country":"USD","date":"2026-10-29T14:00:00-04:00","impact":"High","forecast":"5.25%","previous":"5.50%"},
			{"title":"Retail Sales","country":"USD","date":"2026-10-29T08:30:00-04:00","impact":"Medium","forecast":"0.4%","previous":"0.1%"},
			{"title":"German CPI","country":"EUR","date":"2026-10-29T03:00:00-04:00","impact":"Medium","forecast":"2.0%","previous":"1.9%"},
			{"title":"BOJ Rate","country":"JPY","date":"2026-10-29T22:30:00-04:00","impact":"High","forecast":"0.25%","previous":"0.25%"}
		]`))
	}))
	defer mockServer.Close()

	svc := NewService()
	svc.SetFeedURL(mockServer.URL)

	events, err := svc.GetEvents(context.Background(), "", "")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if len(events) != 4 {
		t.Fatalf("expected 4 events, got: %d", len(events))
	}

	// Filter by High impact
	highEvents, err := svc.GetEvents(context.Background(), "high", "")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if len(highEvents) != 2 {
		t.Fatalf("expected 2 high impact events, got: %d", len(highEvents))
	}

	// Filter by country USD
	usdEvents, err := svc.GetEvents(context.Background(), "", "USD")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if len(usdEvents) != 2 {
		t.Fatalf("expected 2 USD events, got: %d", len(usdEvents))
	}

	// Force refresh test
	freshEvents, err := svc.GetEventsWithOpts(context.Background(), "", "", true)
	if err != nil {
		t.Fatalf("expected no error on force refresh, got: %v", err)
	}
	if len(freshEvents) != 4 {
		t.Fatalf("expected 4 events on fresh call, got: %d", len(freshEvents))
	}
}

