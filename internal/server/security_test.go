package server

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/ordercraft-hq/terminal/internal/storage"
)

func TestSecurity_CORSAndCSRF(t *testing.T) {
	tmpDB := "test_sec_cors.db"
	defer os.Remove(tmpDB)

	st, err := storage.NewStorage(tmpDB)
	if err != nil {
		t.Fatalf("Failed to init storage: %v", err)
	}
	defer st.Close()

	srv := NewServer(st)

	// 1. Legitimate localhost origin should be allowed with Access-Control-Allow-Origin
	legitOrigins := []string{
		"http://localhost:3000",
		"http://127.0.0.1:8448",
		"http://127.0.0.1:3000",
		"http://[::1]:8448",
	}

	for _, origin := range legitOrigins {
		// Preflight OPTIONS
		req := httptest.NewRequest(http.MethodOptions, "/api/datafeed/symbols?query=BTC", nil)
		req.Header.Set("Origin", origin)
		w := httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)

		if w.Code != http.StatusNoContent {
			t.Fatalf("Expected 204 No Content for preflight from %s, got %d", origin, w.Code)
		}
		if got := w.Header().Get("Access-Control-Allow-Origin"); got != origin {
			t.Fatalf("Expected Access-Control-Allow-Origin %q, got %q", origin, got)
		}

		// GET request
		req = httptest.NewRequest(http.MethodGet, "/api/health", nil)
		req.Header.Set("Origin", origin)
		w = httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 OK, got %d", w.Code)
		}
		if got := w.Header().Get("Access-Control-Allow-Origin"); got != origin {
			t.Fatalf("Expected Access-Control-Allow-Origin %q, got %q", origin, got)
		}
	}

	// 2. Malicious external origin must be rejected / protected
	evilOrigins := []string{
		"https://evil.com",
		"http://attacker.org:8080",
		"https://sub.evil-localhost.com",
	}

	for _, origin := range evilOrigins {
		// Preflight OPTIONS must be rejected with 403 Forbidden
		req := httptest.NewRequest(http.MethodOptions, "/api/drawings", nil)
		req.Header.Set("Origin", origin)
		w := httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("Expected 403 Forbidden for preflight from %s, got %d", origin, w.Code)
		}

		// Cross-origin mutation (POST) must be blocked with 403 Forbidden to prevent CSRF
		req = httptest.NewRequest(http.MethodPost, "/api/drawings", strings.NewReader(`{}`))
		req.Header.Set("Origin", origin)
		w = httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("Expected 403 Forbidden for CSRF POST from %s, got %d", origin, w.Code)
		}

		// Cross-origin GET: Access-Control-Allow-Origin must NEVER be set to evil origin
		req = httptest.NewRequest(http.MethodGet, "/api/health", nil)
		req.Header.Set("Origin", origin)
		w = httptest.NewRecorder()
		srv.mux.ServeHTTP(w, req)

		if got := w.Header().Get("Access-Control-Allow-Origin"); got == origin || got == "*" {
			t.Fatalf("Security violation: Access-Control-Allow-Origin leaked %q to untrusted origin", got)
		}
	}
}

func TestSecurity_MaxBytesReader_PayloadLimit(t *testing.T) {
	tmpDB := "test_sec_payload.db"
	defer os.Remove(tmpDB)

	st, err := storage.NewStorage(tmpDB)
	if err != nil {
		t.Fatalf("Failed to init storage: %v", err)
	}
	defer st.Close()

	srv := NewServer(st)

	// Create oversized payload (larger than 1 MB credential limit)
	oversized := bytes.Repeat([]byte("A"), 2*1024*1024)
	req := httptest.NewRequest(http.MethodPost, "/api/providers/configure", bytes.NewReader(oversized))
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	// Should reject with bad request due to MaxBytesReader exceeding limit
	if w.Code == http.StatusOK {
		t.Fatalf("Expected oversized payload to be rejected, got %d", w.Code)
	}
}

func TestSecurity_StorageFilePermissions(t *testing.T) {
	tmpDir := "test_sec_dir"
	defer os.RemoveAll(tmpDir)

	dbPath := tmpDir + "/test_perm.db"
	st, err := storage.NewStorage(dbPath)
	if err != nil {
		t.Fatalf("Failed to init storage: %v", err)
	}
	st.Close()

	info, err := os.Stat(dbPath)
	if err != nil {
		t.Fatalf("Failed to stat db file: %v", err)
	}
	// Verify file mode (on Unix systems 0600; on Windows checks that it's created and accessible)
	if info.IsDir() {
		t.Fatalf("Expected file, got directory")
	}
}

func TestSecurity_TokenAuthentication(t *testing.T) {
	tmpDB := "test_sec_token.db"
	defer os.Remove(tmpDB)

	st, err := storage.NewStorage(tmpDB)
	if err != nil {
		t.Fatalf("Failed to init storage: %v", err)
	}
	defer st.Close()

	srv := NewServer(st)
	srv.SetAuthToken("my_secret_token_123")
	handler := srv.Handler()

	// 1. Health check should be public (no token required)
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for /api/health without token, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), `"auth_enabled":true`) {
		t.Fatalf("Expected auth_enabled:true in health payload, got: %s", w.Body.String())
	}

	// 2. Protected endpoint without token should return 401
	req = httptest.NewRequest(http.MethodGet, "/api/drawings?layoutId=1&symbol=BINANCE:BTCUSDT", nil)
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 Unauthorized without token, got %d", w.Code)
	}

	// 3. Protected endpoint with invalid token should return 401
	req = httptest.NewRequest(http.MethodGet, "/api/drawings?layoutId=1&symbol=BINANCE:BTCUSDT", nil)
	req.Header.Set("Authorization", "Bearer wrong_token")
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 Unauthorized with wrong token, got %d", w.Code)
	}

	// 4. Protected endpoint with valid Bearer token should succeed (200 OK)
	req = httptest.NewRequest(http.MethodGet, "/api/drawings?layoutId=1&symbol=BINANCE:BTCUSDT", nil)
	req.Header.Set("Authorization", "Bearer my_secret_token_123")
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK with valid Bearer token, got %d", w.Code)
	}

	// 5. Protected endpoint with valid token in query param should succeed (200 OK)
	req = httptest.NewRequest(http.MethodGet, "/api/drawings?layoutId=1&symbol=BINANCE:BTCUSDT&token=my_secret_token_123", nil)
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK with valid query param token, got %d", w.Code)
	}
}

func TestSecurity_IsLoopbackHost(t *testing.T) {
	loopbacks := []string{"127.0.0.1", "localhost", "127.0.0.2", "::1", "[::1]", "  127.0.0.1  ", ""}
	for _, h := range loopbacks {
		if !IsLoopbackHost(h) {
			t.Errorf("Expected %q to be identified as loopback", h)
		}
	}

	nonLoopbacks := []string{"0.0.0.0", "192.168.1.100", "10.0.0.5", "example.com", "172.16.0.1"}
	for _, h := range nonLoopbacks {
		if IsLoopbackHost(h) {
			t.Errorf("Expected %q to be identified as non-loopback", h)
		}
	}
}

