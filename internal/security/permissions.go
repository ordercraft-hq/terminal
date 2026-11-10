package security

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

var (
	ErrPermissionDenied   = errors.New("permission denied")
	ErrSSRFProtection     = errors.New("access to cloud metadata or link-local address is blocked")
	ErrInvalidScheme      = errors.New("invalid url scheme: only http and https are allowed")
	ErrResponseBodyTooLarge = errors.New("response body exceeds 1MB limit")
)

const (
	MaxResponseBodyBytes = 1024 * 1024 // 1 MB
	DefaultHttpTimeout   = 5 * time.Second
)

type contextKeyPerms struct{}

// SafeHttpClient performs SSRF-checked, capability-gated HTTP requests.
type SafeHttpClient struct {
	client *http.Client
}

// NewSafeDialContext creates a DialContext function that validates each resolved IP at connection time
// before opening a TCP socket, preventing TOCTOU DNS rebinding and SSRF to cloud metadata.
func NewSafeDialContext(dialer *net.Dialer, resolver *net.Resolver) func(ctx context.Context, network, addr string) (net.Conn, error) {
	if dialer == nil {
		dialer = &net.Dialer{
			Timeout:   3 * time.Second,
			KeepAlive: 30 * time.Second,
		}
	}
	if resolver == nil {
		resolver = net.DefaultResolver
	}

	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, fmt.Errorf("invalid address %q: %w", addr, err)
		}

		var ips []net.IP
		if ip := net.ParseIP(host); ip != nil {
			ips = []net.IP{ip}
		} else {
			addrs, err := resolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, err
			}
			for _, a := range addrs {
				ips = append(ips, a.IP)
			}
		}

		if len(ips) == 0 {
			return nil, fmt.Errorf("no IP addresses found for host %s", host)
		}

		// TOCTOU DNS Rebinding / SSRF Check:
		// Verify every resolved IP. If ANY IP is a metadata or link-local address, abort immediately.
		for _, ip := range ips {
			if IsMetadataIP(ip) {
				return nil, ErrSSRFProtection
			}
		}

		// Connect to the verified IP directly so that no second DNS lookup can be performed.
		var (
			lastErr error
			conn    net.Conn
		)
		for _, ip := range ips {
			targetAddr := net.JoinHostPort(ip.String(), port)
			conn, lastErr = dialer.DialContext(ctx, network, targetAddr)
			if lastErr == nil {
				return conn, nil
			}
		}
		return nil, lastErr
	}
}

// NewSafeHttpClient creates a client configured with a 5s timeout, SSRF protection,
// and connection-time TOCTOU DNS rebinding defense.
func NewSafeHttpClient() *SafeHttpClient {
	transport := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           NewSafeDialContext(nil, nil),
		MaxIdleConns:          50,
		IdleConnTimeout:       30 * time.Second,
		TLSHandshakeTimeout:   3 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   DefaultHttpTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return errors.New("stopped after 10 redirects")
			}
			if perms, ok := req.Context().Value(contextKeyPerms{}).([]string); ok {
				if err := CheckUrlAllowed(req.URL, perms); err != nil {
					return fmt.Errorf("redirect blocked: %w", err)
				}
			}
			return nil
		},
	}

	return &SafeHttpClient{
		client: client,
	}
}

// IsMetadataIP checks if the IP address belongs to the cloud metadata service (169.254.169.254)
// or link-local address block (169.254.0.0/16 or fe80::/10).
func IsMetadataIP(ip net.IP) bool {
	if ip == nil {
		return false
	}
	if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return true
	}
	metadataIP := net.ParseIP("169.254.169.254")
	if ip.Equal(metadataIP) {
		return true
	}
	// Check IPv4 link-local 169.254.0.0/16
	if v4 := ip.To4(); v4 != nil {
		return v4[0] == 169 && v4[1] == 254
	}
	return false
}

// IsLoopbackHost checks if a hostname or IP string corresponds to a loopback address
// (such as localhost, 127.0.0.0/8, ::1, or 0.0.0.0).
func IsLoopbackHost(hostname string) bool {
	h := strings.ToLower(strings.TrimSpace(hostname))
	if h == "localhost" || h == "127.0.0.1" || h == "::1" || h == "0.0.0.0" {
		return true
	}
	if ip := net.ParseIP(h); ip != nil {
		return ip.IsLoopback() || ip.IsUnspecified()
	}
	return false
}

// HasPermission checks if the required capability is present in the granted list.
// Capabilities:
// - "network:<domain>" or "network:<domain>:<port>"
// - "ipc:<service>"
func HasPermission(required string, granted []string) bool {
	req := strings.TrimSpace(strings.ToLower(required))
	for _, g := range granted {
		gNorm := strings.TrimSpace(strings.ToLower(g))
		if gNorm == "*" || gNorm == req {
			return true
		}
		// Wildcard network domain match e.g. "network:*" or prefix
		if strings.HasPrefix(gNorm, "network:") && strings.HasPrefix(req, "network:") {
			pattern := strings.TrimPrefix(gNorm, "network:")
			target := strings.TrimPrefix(req, "network:")
			if pattern == "*" || pattern == target {
				return true
			}
			// If granted is network:api.domain.com and target is network:api.domain.com:443
			hostOnly, _, err := net.SplitHostPort(target)
			if err == nil && hostOnly == pattern {
				// Loopback hosts strictly require an explicit port match.
				// A port-less pattern like "127.0.0.1" or "localhost" must NOT match a target with port.
				if IsLoopbackHost(hostOnly) {
					continue
				}
				return true
			}
		}
		if strings.HasPrefix(gNorm, "ipc:") && strings.HasPrefix(req, "ipc:") {
			pattern := strings.TrimPrefix(gNorm, "ipc:")
			target := strings.TrimPrefix(req, "ipc:")
			if pattern == "*" || pattern == target {
				return true
			}
		}
	}
	return false
}

// ValidatePermissions verifies that all requested permissions have been granted.
func ValidatePermissions(requested []string, granted []string) error {
	var missing []string
	for _, req := range requested {
		if !HasPermission(req, granted) {
			missing = append(missing, req)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("%w: missing required capabilities: %s", ErrPermissionDenied, strings.Join(missing, ", "))
	}
	return nil
}

// CheckUrlAllowed validates that the parsed URL does not violate SSRF rules and has granted permissions.
func CheckUrlAllowed(parsedURL *url.URL, grantedPerms []string) error {
	scheme := strings.ToLower(parsedURL.Scheme)
	if scheme != "http" && scheme != "https" {
		return ErrInvalidScheme
	}

	hostname := strings.ToLower(parsedURL.Hostname())
	if hostname == "" {
		return fmt.Errorf("invalid URL: empty hostname")
	}

	// Resolve IP addresses
	ips, err := net.LookupIP(hostname)
	if err == nil {
		for _, ip := range ips {
			if IsMetadataIP(ip) {
				return ErrSSRFProtection
			}
		}
	} else if ip := net.ParseIP(hostname); ip != nil {
		if IsMetadataIP(ip) {
			return ErrSSRFProtection
		}
	}

	// Determine port
	port := parsedURL.Port()
	if port == "" {
		if scheme == "https" {
			port = "443"
		} else {
			port = "80"
		}
	}

	// Check loopback
	isLoopback := IsLoopbackHost(hostname)
	if !isLoopback && len(ips) > 0 {
		for _, ip := range ips {
			if ip.IsLoopback() || ip.IsUnspecified() {
				isLoopback = true
				break
			}
		}
	}

	// Permissions check
	// Construct permission tokens: "network:hostname" and "network:hostname:port"
	tokenWithPort := fmt.Sprintf("network:%s:%s", hostname, port)
	tokenHostOnly := fmt.Sprintf("network:%s", hostname)

	if isLoopback {
		// Loopback explicitly requires an exact token match with port (e.g. "network:127.0.0.1:8000" or "*").
		// Matching generic host-only token ("network:127.0.0.1") is strictly disallowed.
		if !HasPermission(tokenWithPort, grantedPerms) {
			return fmt.Errorf("%w: loopback access to %s:%s requires capability token '%s'", ErrPermissionDenied, hostname, port, tokenWithPort)
		}
	} else {
		if !HasPermission(tokenHostOnly, grantedPerms) && !HasPermission(tokenWithPort, grantedPerms) {
			return fmt.Errorf("%w: outbound network access to %s requires capability token '%s'", ErrPermissionDenied, hostname, tokenHostOnly)
		}
	}

	return nil
}

// Get performs an HTTP GET request with SSRF checks, capability validation, and 1MB size limit.
func (c *SafeHttpClient) Get(ctx context.Context, targetURL string, headers map[string]string, grantedPerms []string) ([]byte, int, error) {
	parsedURL, err := url.Parse(targetURL)
	if err != nil {
		return nil, 0, fmt.Errorf("invalid url: %w", err)
	}

	if err := CheckUrlAllowed(parsedURL, grantedPerms); err != nil {
		return nil, 0, err
	}

	reqCtx := context.WithValue(ctx, contextKeyPerms{}, grantedPerms)
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, parsedURL.String(), nil)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("User-Agent", "OrderCraft-ScriptRuntime/0.2.0")
	req.Header.Set("Accept", "application/json, text/plain, */*")
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		if errors.Is(err, ErrSSRFProtection) {
			return nil, 0, ErrSSRFProtection
		}
		return nil, 0, fmt.Errorf("http request failed: %w", err)
	}
	defer resp.Body.Close()

	// Read at most MaxResponseBodyBytes + 1 byte to detect overflow
	limitReader := io.LimitReader(resp.Body, int64(MaxResponseBodyBytes+1))
	body, err := io.ReadAll(limitReader)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to read response body: %w", err)
	}

	if len(body) > MaxResponseBodyBytes {
		return nil, resp.StatusCode, ErrResponseBodyTooLarge
	}

	return body, resp.StatusCode, nil
}

// CheckIPCService verifies if IPC call to service is permitted.
func CheckIPCAllowed(serviceName string, grantedPerms []string) error {
	serviceName = strings.TrimSpace(serviceName)
	if serviceName == "" {
		return fmt.Errorf("empty IPC service name")
	}
	token := fmt.Sprintf("ipc:%s", strings.ToLower(serviceName))
	if !HasPermission(token, grantedPerms) {
		return fmt.Errorf("%w: IPC access to '%s' requires capability token '%s'", ErrPermissionDenied, serviceName, token)
	}
	return nil
}

// ParsePort parses a port string safely.
func ParsePort(portStr string) (int, error) {
	p, err := strconv.Atoi(portStr)
	if err != nil || p < 1 || p > 65535 {
		return 0, fmt.Errorf("invalid port: %s", portStr)
	}
	return p, nil
}
