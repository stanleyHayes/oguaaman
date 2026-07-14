// Package http is the delivery layer: router, handlers, and middleware.
package http

import (
	"context"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

type ctxKey int

const memberCtxKey ctxKey = iota

// Auth parses an optional Bearer token, loads the member, and stashes it on the
// request context. It is permissive (never rejects here); handlers decide what
// requires a signed-in member via requireAuth / requireRole.
func (h *Handler) Auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authz := r.Header.Get("Authorization")
		if after, ok := strings.CutPrefix(authz, "Bearer "); ok && after != "" {
			if id, err := h.auth.ParseToken(after); err == nil {
				if m, err := h.svc.MemberByID(r.Context(), id); err == nil && !m.Suspended {
					r = r.WithContext(context.WithValue(r.Context(), memberCtxKey, m))
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}

func currentMember(r *http.Request) *domain.Member {
	m, _ := r.Context().Value(memberCtxKey).(*domain.Member)
	return m
}

// CORS lets the known frontends (public web, admin, marketing) call the API.
// Because several frontends run on different origins, it echoes back the
// request's Origin when allowed rather than naming a single static origin. An
// allowed entry of "*" permits any origin; loopback origins (localhost /
// 127.0.0.1 / [::1] on any port) are always allowed for local development so
// the exact dev ports don't have to be configured.
func CORS(allowed []string, next http.Handler) http.Handler {
	wildcard := false
	set := make(map[string]struct{}, len(allowed))
	for _, o := range allowed {
		switch o = strings.TrimSpace(o); o {
		case "":
		case "*":
			wildcard = true
		default:
			set[o] = struct{}{}
		}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if allow := corsAllowedOrigin(origin, set, wildcard); allow != "" {
			w.Header().Set("Access-Control-Allow-Origin", allow)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// corsAllowedOrigin returns the value to echo in Access-Control-Allow-Origin for
// the given request Origin, or "" if the origin is not allowed.
func corsAllowedOrigin(origin string, set map[string]struct{}, wildcard bool) string {
	if origin == "" {
		return ""
	}
	if _, ok := set[origin]; ok || wildcard || isLoopbackOrigin(origin) {
		return origin
	}
	return ""
}

// isLoopbackOrigin reports whether origin is an http(s) URL whose host is a
// loopback address — the dev-server convenience case.
func isLoopbackOrigin(origin string) bool {
	u, err := url.Parse(origin)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}
	switch u.Hostname() {
	case "localhost", "127.0.0.1", "::1":
		return true
	}
	return false
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

// Logging records each request and recovers from panics.
func Logging(log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		defer func() {
			if rec := recover(); rec != nil {
				log.Error("panic recovered", "err", rec, "path", r.URL.Path)
				http.Error(sw, "internal error", http.StatusInternalServerError)
			}
			log.Info("request",
				"method", r.Method, "path", r.URL.Path,
				"status", sw.status, "dur", time.Since(start).String())
		}()
		next.ServeHTTP(sw, r)
	})
}
