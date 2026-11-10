package security

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// ============================================================================
// CHALLENGER SECURITY SUITE: Direct SafeHttpClient Loopback Strictness
// ============================================================================

func TestChallenger_SafeHttpClient_LoopbackPortStrictness(t *testing.T) {
	expectedPayload := `{"verified": true, "suite": "empirical_challenger"}`

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(expectedPayload))
	}))
	defer ts.Close()

	u, err := url.Parse(ts.URL)
	if err != nil {
		t.Fatalf("failed to parse url: %v", err)
	}
	port := u.Port()
	client := NewSafeHttpClient()

	// 1. Attempt with portless token "network:127.0.0.1" -> MUST BE REJECTED
	_, _, err = client.Get(context.Background(), ts.URL, nil, []string{"network:127.0.0.1"})
	if err == nil {
		t.Fatalf("CRITICAL SECURITY FLAW: SafeHttpClient allowed loopback GET with portless token 'network:127.0.0.1'")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission denied") {
		t.Errorf("expected permission denied error, got: %v", err)
	}

	// 2. Attempt with portless token "network:localhost" -> MUST BE REJECTED
	localhostURL := fmt.Sprintf("http://localhost:%s/", port)
	_, _, err = client.Get(context.Background(), localhostURL, nil, []string{"network:localhost"})
	if err == nil {
		t.Fatalf("CRITICAL SECURITY FLAW: SafeHttpClient allowed loopback GET with portless token 'network:localhost'")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission denied") {
		t.Errorf("expected permission denied error, got: %v", err)
	}

	// 3. Attempt with wrong port token "network:127.0.0.1:12345" -> MUST BE REJECTED
	_, _, err = client.Get(context.Background(), ts.URL, nil, []string{"network:127.0.0.1:12345"})
	if err == nil {
		t.Fatalf("CRITICAL SECURITY FLAW: SafeHttpClient allowed loopback GET with mismatched port token")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission denied") {
		t.Errorf("expected permission denied error, got: %v", err)
	}

	// 4. Attempt with matching port token "network:127.0.0.1:<port>" -> MUST SUCCEED
	matchingToken := fmt.Sprintf("network:127.0.0.1:%s", port)
	body, code, err := client.Get(context.Background(), ts.URL, nil, []string{matchingToken})
	if err != nil {
		t.Fatalf("SafeHttpClient failed with valid matching port token: %v", err)
	}
	if code != http.StatusOK {
		t.Errorf("expected HTTP 200, got %d", code)
	}
	if string(body) != expectedPayload {
		t.Errorf("payload mismatch: expected %s, got %s", expectedPayload, string(body))
	}

	// 5. CheckUrlAllowed directly
	err = CheckUrlAllowed(u, []string{"network:127.0.0.1"})
	if err == nil {
		t.Errorf("CheckUrlAllowed should reject portless 127.0.0.1 token")
	}

	err = CheckUrlAllowed(u, []string{matchingToken})
	if err != nil {
		t.Errorf("CheckUrlAllowed should accept matching port token %s, got %v", matchingToken, err)
	}
}
