package http

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func discardLog() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

// Streaming handlers must still see an http.Flusher behind the Logging wrapper,
// or /api/ai/stream falls back to a single JSON body.
func TestLogging_keepsFlusher(t *testing.T) {
	flusher := false
	h := Logging(discardLog(), http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, flusher = w.(http.Flusher)
		if err := http.NewResponseController(w).Flush(); err != nil {
			t.Errorf("ResponseController.Flush: %v", err)
		}
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/ai/stream", nil))
	if !flusher {
		t.Fatal("statusWriter hides http.Flusher")
	}
	if !rec.Flushed {
		t.Fatal("Flush did not reach the underlying writer")
	}
}

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
}

// G106: every response carries the hardening headers; HSTS only in production.
func TestSecurityHeaders(t *testing.T) {
	for _, production := range []bool{false, true} {
		rec := httptest.NewRecorder()
		SecurityHeaders(production, okHandler()).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/home", nil))
		want := map[string]string{
			"X-Content-Type-Options":  "nosniff",
			"X-Frame-Options":         "DENY",
			"Referrer-Policy":         "strict-origin-when-cross-origin",
			"Content-Security-Policy": cspAPI,
		}
		for k, v := range want {
			if got := rec.Header().Get(k); got != v {
				t.Errorf("production=%v %s = %q, want %q", production, k, got, v)
			}
		}
		if rec.Header().Get("Permissions-Policy") == "" {
			t.Errorf("production=%v: no Permissions-Policy", production)
		}
		if hsts := rec.Header().Get("Strict-Transport-Security"); (hsts != "") != production {
			t.Errorf("production=%v: HSTS = %q", production, hsts)
		}
	}
	rec := httptest.NewRecorder()
	SecurityHeaders(true, okHandler()).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/uploads/a.png", nil))
	if got := rec.Header().Get("Content-Security-Policy"); got != cspUploads {
		t.Errorf("uploads CSP = %q", got)
	}
}

// G106: production answers only the configured origins — never localhost.
func TestCORS_loopbackOnlyOutsideProduction(t *testing.T) {
	allowed := []string{"https://oguaaman.com"}
	cases := []struct {
		origin        string
		allowLoopback bool
		want          bool
	}{
		{"https://oguaaman.com", false, true},
		{"http://localhost:5173", false, false},
		{"http://127.0.0.1:3000", false, false},
		{"http://localhost:5173", true, true},
		{"https://evil.example", true, false},
	}
	for _, c := range cases {
		req := httptest.NewRequest(http.MethodGet, "/api/home", nil)
		req.Header.Set("Origin", c.origin)
		rec := httptest.NewRecorder()
		CORS(allowed, c.allowLoopback, okHandler()).ServeHTTP(rec, req)
		if got := rec.Header().Get("Access-Control-Allow-Origin") == c.origin; got != c.want {
			t.Errorf("origin %s allowLoopback=%v: allowed=%v, want %v", c.origin, c.allowLoopback, got, c.want)
		}
	}
}
