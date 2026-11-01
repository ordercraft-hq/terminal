package news

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestNewsService(t *testing.T) {
	now := time.Now()
	dateOlder := now.Add(-2 * time.Hour).Format(time.RFC1123)
	dateNewer := now.Add(-30 * time.Minute).Format(time.RFC1123)

	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		// Send older item first to verify sorting places newer item first
		w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
		<rss version="2.0">
			<channel>
				<title>Market News</title>
				<item>
					<title>Older Item - Wall Street Journal</title>
					<link>https://example.com/older</link>
					<pubDate>` + dateOlder + `</pubDate>
					<description>Older news article.</description>
					<source url="https://wsj.com">Wall Street Journal</source>
				</item>
				<item>
					<title>Fed Decision Announced - Reuters</title>
					<link>https://example.com/fed</link>
					<pubDate>` + dateNewer + `</pubDate>
					<description>&lt;p&gt;The Fed kept interest rates unchanged.&lt;/p&gt;</description>
					<source url="https://reuters.com">Reuters</source>
				</item>
			</channel>
		</rss>`))
	}))
	defer mockServer.Close()

	svc := NewService()
	svc.SetBaseURL(mockServer.URL)

	articles, err := svc.GetNews(context.Background(), "stock market")
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	if len(articles) != 2 {
		t.Fatalf("expected 2 articles, got %d", len(articles))
	}

	// Verify the newer article is placed first (sorted by latest)
	if articles[0].Title != "Fed Decision Announced" {
		t.Errorf("expected newer article 'Fed Decision Announced' first, got: %s", articles[0].Title)
	}
	if articles[0].Source != "Reuters" {
		t.Errorf("expected source Reuters, got: %s", articles[0].Source)
	}
	if articles[0].PublishedAt <= articles[1].PublishedAt {
		t.Errorf("expected articles[0] timestamp (%d) > articles[1] timestamp (%d)", articles[0].PublishedAt, articles[1].PublishedAt)
	}

	// Test cache bypass with force=true
	articlesFresh, err := svc.GetNewsWithOpts(context.Background(), "stock market", true)
	if err != nil {
		t.Fatalf("expected no error with force refresh, got: %v", err)
	}
	if len(articlesFresh) != 2 {
		t.Fatalf("expected 2 articles from fresh call, got %d", len(articlesFresh))
	}
}
