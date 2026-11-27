package datafeed

import (
	"net"
	"net/http"
	"time"
)

// SharedHTTPTransport is a pooled, concurrency-safe http.Transport shared
// across data providers and market services to maximize TCP/TLS connection reuse.
var SharedHTTPTransport = &http.Transport{
	Proxy: http.ProxyFromEnvironment,
	DialContext: (&net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
	}).DialContext,
	ForceAttemptHTTP2:     true,
	MaxIdleConns:          128,
	MaxIdleConnsPerHost:   16,
	IdleConnTimeout:       90 * time.Second,
	TLSHandshakeTimeout:   10 * time.Second,
	ExpectContinueTimeout: 1 * time.Second,
}

// NewHTTPClient returns an *http.Client backed by SharedHTTPTransport with the given timeout.
func NewHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Transport: SharedHTTPTransport,
		Timeout:   timeout,
	}
}

// NewHTTPClientWithJar returns an *http.Client backed by SharedHTTPTransport and the given CookieJar.
func NewHTTPClientWithJar(jar http.CookieJar, timeout time.Duration) *http.Client {
	return &http.Client{
		Transport: SharedHTTPTransport,
		Jar:       jar,
		Timeout:   timeout,
	}
}
