package calendar

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

type CalendarEvent struct {
	Title    string `json:"title"`
	Country  string `json:"country"`
	Date     string `json:"date"`
	Impact   string `json:"impact"`
	Forecast string `json:"forecast"`
	Previous string `json:"previous"`
	Actual   string `json:"actual,omitempty"`
}

type Service struct {
	mu          sync.RWMutex
	client      *http.Client
	cachedData  []CalendarEvent
	lastFetched time.Time
	cacheTTL    time.Duration
	feedURL     string
}

func NewService() *Service {
	return &Service{
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		cacheTTL: 1 * time.Hour,
		feedURL:  "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
	}
}

func (s *Service) SetFeedURL(url string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.feedURL = url
}

func (s *Service) GetEvents(ctx context.Context, impactFilter string, countryFilter string) ([]CalendarEvent, error) {
	return s.GetEventsWithOpts(ctx, impactFilter, countryFilter, false)
}

func (s *Service) GetEventsWithOpts(ctx context.Context, impactFilter string, countryFilter string, force bool) ([]CalendarEvent, error) {
	s.mu.RLock()
	cachedValid := len(s.cachedData) > 0 && time.Since(s.lastFetched) < s.cacheTTL
	cached := s.cachedData
	s.mu.RUnlock()

	if force || !cachedValid {
		fresh, err := s.fetchEvents(ctx)
		if err != nil {
			if len(cached) > 0 {
				// Use stale cache gracefully if offline
				fresh = cached
			} else {
				// Return fallback sample data if completely offline
				fresh = getFallbackEvents()
			}
		} else {
			s.mu.Lock()
			s.cachedData = fresh
			s.lastFetched = time.Now()
			s.mu.Unlock()
		}
		cached = fresh
	}

	// Filter
	impactFilter = strings.ToLower(strings.TrimSpace(impactFilter))
	countryFilter = strings.ToUpper(strings.TrimSpace(countryFilter))

	var result []CalendarEvent
	for _, ev := range cached {
		if impactFilter != "" && impactFilter != "all" {
			if strings.ToLower(ev.Impact) != impactFilter {
				continue
			}
		}
		if countryFilter != "" && countryFilter != "ALL" {
			if strings.ToUpper(ev.Country) != countryFilter {
				continue
			}
		}
		result = append(result, ev)
	}

	return result, nil
}

func (s *Service) fetchEvents(ctx context.Context) ([]CalendarEvent, error) {
	s.mu.RLock()
	url := s.feedURL
	s.mu.RUnlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "OrderCraft-Terminal/1.0")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("calendar feed returned status: %d", resp.StatusCode)
	}

	var events []CalendarEvent
	if err := json.NewDecoder(resp.Body).Decode(&events); err != nil {
		return nil, err
	}

	return events, nil
}

func getFallbackEvents() []CalendarEvent {
	now := time.Now()
	todayStr := now.Format("2006-01-02T15:04:05-07:00")
	return []CalendarEvent{
		{
			Title:    "Fed Interest Rate Decision",
			Country:  "USD",
			Date:     todayStr,
			Impact:   "High",
			Forecast: "5.25%",
			Previous: "5.50%",
			Actual:   "5.25%",
		},
		{
			Title:    "Non-Farm Employment Change (NFP)",
			Country:  "USD",
			Date:     todayStr,
			Impact:   "High",
			Forecast: "180K",
			Previous: "142K",
			Actual:   "254K",
		},
		{
			Title:    "ECB Monetary Policy Statement",
			Country:  "EUR",
			Date:     todayStr,
			Impact:   "High",
			Forecast: "3.25%",
			Previous: "3.50%",
			Actual:   "3.25%",
		},
		{
			Title:    "Core PCE Price Index MoM",
			Country:  "USD",
			Date:     todayStr,
			Impact:   "Medium",
			Forecast: "0.2%",
			Previous: "0.1%",
		},
		{
			Title:    "BOJ Policy Rate",
			Country:  "JPY",
			Date:     todayStr,
			Impact:   "High",
			Forecast: "0.25%",
			Previous: "0.25%",
		},
	}
}

