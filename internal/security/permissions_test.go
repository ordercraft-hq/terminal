package security

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestPermissionsSSRFProtection(t *testing.T) {
	metadataURLs := []string{
		"http://169.254.169.254/latest/meta-data/",
		"http://169.254.1.1/secret",
	}

	for _, uStr := range metadataURLs {
		parsed, err := url.Parse(uStr)
		if err != nil {
			t.Fatalf("failed to parse url %s: %v", uStr, err)
		}
		err = CheckUrlAllowed(parsed, []string{"*"})
		if err != ErrSSRFProtection {
			t.Errorf("expected ErrSSRFProtection for %s, got %v", uStr, err)
		}
	}
}

func TestPermissionsSchemeValidation(t *testing.T) {
	invalidSchemes := []string{
		"file:///etc/passwd",
		"ftp://example.com/data",
		"gopher://example.com",
	}

	for _, uStr := range invalidSchemes {
		parsed, err := url.Parse(uStr)
		if err != nil {
			continue
		}
		err = CheckUrlAllowed(parsed, []string{"*"})
		if err != ErrInvalidScheme {
			t.Errorf("expected ErrInvalidScheme for %s, got %v", uStr, err)
		}
	}
}

func TestPermissionsLoopbackEnforcement(t *testing.T) {
	target := "http://127.0.0.1:8080/api/gex"
	parsed, err := url.Parse(target)
	if err != nil {
		t.Fatalf("url parse error: %v", err)
	}

	// Ungranted should fail
	err = CheckUrlAllowed(parsed, []string{})
	if err == nil || !strings.Contains(err.Error(), "permission denied") {
		t.Errorf("expected permission denied for loopback without token, got %v", err)
	}

	// Granted with different port should fail
	err = CheckUrlAllowed(parsed, []string{"network:127.0.0.1:9000"})
	if err == nil || !strings.Contains(err.Error(), "permission denied") {
		t.Errorf("expected permission denied for wrong port, got %v", err)
	}

	// Granted with matching token should succeed
	err = CheckUrlAllowed(parsed, []string{"network:127.0.0.1:8080"})
	if err != nil {
		t.Errorf("expected success with matching token, got %v", err)
	}

	// Wildcard should succeed
	err = CheckUrlAllowed(parsed, []string{"*"})
	if err != nil {
		t.Errorf("expected success with wildcard, got %v", err)
	}
}

func TestPermissionsExternalDomain(t *testing.T) {
	target := "https://api.binance.com/api/v3/ticker/price"
	parsed, err := url.Parse(target)
	if err != nil {
		t.Fatalf("url parse error: %v", err)
	}

	// No grant
	err = CheckUrlAllowed(parsed, []string{"network:api.coinbase.com"})
	if err == nil || !strings.Contains(err.Error(), "permission denied") {
		t.Errorf("expected permission denied, got %v", err)
	}

	// Proper domain grant
	err = CheckUrlAllowed(parsed, []string{"network:api.binance.com"})
	if err != nil {
		t.Errorf("expected success for granted domain, got %v", err)
	}
}

func TestPermissionsIPC(t *testing.T) {
	err := CheckIPCAllowed("pytorch_gex", []string{"ipc:sentiment"})
	if err == nil {
		t.Errorf("expected error for ungranted service, got nil")
	}

	err = CheckIPCAllowed("pytorch_gex", []string{"ipc:pytorch_gex"})
	if err != nil {
		t.Errorf("expected success for granted IPC service, got %v", err)
	}
}

func TestSafeHttpClientGet(t *testing.T) {
	// Start test server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"price": 65000.50}`))
	}))
	defer ts.Close()

	u, err := url.Parse(ts.URL)
	if err != nil {
		t.Fatalf("failed to parse test server url: %v", err)
	}

	client := NewSafeHttpClient()

	// Call without permissions should fail
	_, _, err = client.Get(context.Background(), ts.URL, nil, []string{})
	if err == nil {
		t.Errorf("expected error when permissions are empty, got nil")
	}

	// Call with permission
	token := "network:" + u.Host
	body, code, err := client.Get(context.Background(), ts.URL, nil, []string{token})
	if err != nil {
		t.Fatalf("expected successful GET, got %v", err)
	}
	if code != http.StatusOK {
		t.Errorf("expected status 200, got %d", code)
	}
	if !strings.Contains(string(body), "65000.50") {
		t.Errorf("unexpected body content: %s", string(body))
	}
}

func TestSafeHttpClientMaxBodyLimit(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Write 1.5MB of data
		bigData := make([]byte, 1500*1024)
		w.Write(bigData)
	}))
	defer ts.Close()

	u, _ := url.Parse(ts.URL)
	client := NewSafeHttpClient()
	token := "network:" + u.Host

	_, _, err := client.Get(context.Background(), ts.URL, nil, []string{token})
	if err != ErrResponseBodyTooLarge {
		t.Errorf("expected ErrResponseBodyTooLarge, got %v", err)
	}
}

func TestLoopbackPortStrictness(t *testing.T) {
	testCases := []struct {
		name        string
		targetURL   string
		granted     []string
		expectAllow bool
	}{
		{
			name:        "127.0.0.1 with portless token rejected",
			targetURL:   "http://127.0.0.1:8000/metrics",
			granted:     []string{"network:127.0.0.1"},
			expectAllow: false,
		},
		{
			name:        "127.0.0.1 with wrong port rejected",
			targetURL:   "http://127.0.0.1:8000/metrics",
			granted:     []string{"network:127.0.0.1:9000"},
			expectAllow: false,
		},
		{
			name:        "127.0.0.1 with matching port accepted",
			targetURL:   "http://127.0.0.1:8000/metrics",
			granted:     []string{"network:127.0.0.1:8000"},
			expectAllow: true,
		},
		{
			name:        "localhost with portless token rejected",
			targetURL:   "http://localhost:8000/metrics",
			granted:     []string{"network:localhost"},
			expectAllow: false,
		},
		{
			name:        "localhost with wrong port rejected",
			targetURL:   "http://localhost:8000/metrics",
			granted:     []string{"network:localhost:9000"},
			expectAllow: false,
		},
		{
			name:        "localhost with matching port accepted",
			targetURL:   "http://localhost:8000/metrics",
			granted:     []string{"network:localhost:8000"},
			expectAllow: true,
		},
		{
			name:        "wildcard token accepted for loopback with port",
			targetURL:   "http://127.0.0.1:8000/metrics",
			granted:     []string{"*"},
			expectAllow: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			u, err := url.Parse(tc.targetURL)
			if err != nil {
				t.Fatalf("failed to parse url: %v", err)
			}
			err = CheckUrlAllowed(u, tc.granted)
			if tc.expectAllow && err != nil {
				t.Errorf("expected access allowed, got error: %v", err)
			}
			if !tc.expectAllow && err == nil {
				t.Errorf("expected access denied for %s with granted %v, but was allowed", tc.targetURL, tc.granted)
			}
		})
	}
}

func TestSafeHttpClientLoopbackPortStrictness(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	}))
	defer ts.Close()

	u, err := url.Parse(ts.URL)
	if err != nil {
		t.Fatalf("url parse error: %v", err)
	}

	client := NewSafeHttpClient()

	// 1. Portless loopback token MUST be rejected
	_, _, err = client.Get(context.Background(), ts.URL, nil, []string{"network:127.0.0.1"})
	if err == nil {
		t.Fatalf("expected error when loopback token lacks port, got success")
	}

	// 2. Exact token with host and port MUST be accepted
	token := "network:" + u.Host
	body, code, err := client.Get(context.Background(), ts.URL, nil, []string{token})
	if err != nil {
		t.Fatalf("expected success with exact token %q, got error: %v", token, err)
	}
	if code != http.StatusOK {
		t.Errorf("expected HTTP 200, got %d", code)
	}
	if !strings.Contains(string(body), "ok") {
		t.Errorf("unexpected body: %s", string(body))
	}
}

func TestSafeDialContext_BlocksMetadataAtConnectTime(t *testing.T) {
	dialCtx := NewSafeDialContext(nil, nil)

	// Direct metadata IP in address
	_, err := dialCtx(context.Background(), "tcp", "169.254.169.254:80")
	if !errors.Is(err, ErrSSRFProtection) {
		t.Errorf("expected ErrSSRFProtection, got %v", err)
	}

	// IPv4-mapped IPv6 metadata
	_, err = dialCtx(context.Background(), "tcp", "[::ffff:169.254.169.254]:80")
	if !errors.Is(err, ErrSSRFProtection) {
		t.Errorf("expected ErrSSRFProtection for IPv4-mapped IPv6, got %v", err)
	}

	// IPv6 link-local
	_, err = dialCtx(context.Background(), "tcp", "[fe80::1]:80")
	if !errors.Is(err, ErrSSRFProtection) {
		t.Errorf("expected ErrSSRFProtection for IPv6 link-local, got %v", err)
	}
}

func TestSafeHttpClient_RedirectToBlockedTarget(t *testing.T) {
	// Server that redirects to AWS metadata IP
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://169.254.169.254/latest/meta-data", http.StatusFound)
	}))
	defer ts.Close()

	u, _ := url.Parse(ts.URL)
	client := NewSafeHttpClient()
	token := "network:" + u.Host

	_, _, err := client.Get(context.Background(), ts.URL, nil, []string{token, "*"})
	if err == nil {
		t.Fatalf("expected error on redirect to metadata IP, got nil")
	}
	if !errors.Is(err, ErrSSRFProtection) && !strings.Contains(err.Error(), ErrSSRFProtection.Error()) {
		t.Errorf("expected ErrSSRFProtection on redirect, got %v", err)
	}
}

func TestSafeDialContext_BlocksInternalAndProxyBypass(t *testing.T) {
	dialCtx := NewSafeDialContext(nil, nil)
	blocked := []string{
		"10.0.0.1:80",
		"172.16.0.1:443",
		"192.168.1.1:80",
		"100.100.100.200:80",
		"[fd00:ec2::254]:80",
		"0.0.0.0:8448",
	}
	for _, target := range blocked {
		_, err := dialCtx(context.Background(), "tcp", target)
		if !errors.Is(err, ErrSSRFProtection) {
			t.Errorf("expected ErrSSRFProtection for %s, got %v", target, err)
		}
	}

	client := NewSafeHttpClient()
	tr, ok := client.client.Transport.(*http.Transport)
	if !ok {
		t.Fatalf("expected *http.Transport")
	}
	if tr.Proxy != nil {
		t.Fatalf("expected SafeHttpClient transport Proxy to be nil to prevent ambient proxy SSRF bypass")
	}
}
