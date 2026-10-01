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
	"github.com/oguaa/backend/internal/platform/logger"
)

type ctxKey int

const (
	// memberCtxKey holds the member a request acts as. For a staff account that
	// may not use its role yet (production, no two-factor) this is a copy with
	// the plain member role.
	memberCtxKey ctxKey = iota
	// accountCtxKey holds the signed-in account exactly as stored, for the
	// self-view endpoints (GET /api/auth/me) that must show the real role.
	accountCtxKey
	// heldRoleCtxKey holds the staff role withheld until two-factor is on.
	heldRoleCtxKey
)

// Auth parses an optional Bearer token, resolves it to a member and stashes
// it on the request context. It is permissive (never rejects here); handlers
// decide what requires a signed-in member via requireAuth / requireRole. A
// revoked, suspended or (in production) demo-identity session is simply
// treated as signed out. The client IP rides along for security events.
func (h *Handler) Auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := logger.WithClientIP(r.Context(), clientIP(r))
		if m := h.sessionMember(ctx, r); m != nil {
			ctx = h.withSession(ctx, m)
		}
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// sessionMember resolves the request's Bearer token, or returns nil.
func (h *Handler) sessionMember(ctx context.Context, r *http.Request) *domain.Member {
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || token == "" || h.auth == nil {
		return nil
	}
	m, err := h.auth.Authenticate(ctx, token)
	if err != nil {
		return nil
	}
	return m
}

// withSession attaches the signed-in member. In production a staff account
// without two-factor acts as a plain member everywhere (so no service-level
// staff check can pass either); requireRole answers its staff routes with 403
// mfa_required until it enrols (D9/K4).
func (h *Handler) withSession(ctx context.Context, m *domain.Member) context.Context {
	ctx = logger.WithActor(ctx, m.ID)
	ctx = context.WithValue(ctx, accountCtxKey, m)
	if h.auth.StaffMFARequired(m) {
		limited := *m
		limited.Role = domain.RoleMember
		ctx = context.WithValue(ctx, heldRoleCtxKey, m.Role)
		m = &limited
	}
	return context.WithValue(ctx, memberCtxKey, m)
}

func currentMember(r *http.Request) *domain.Member {
	m, _ := r.Context().Value(memberCtxKey).(*domain.Member)
	return m
}

// currentAccount returns the signed-in account as stored (real role included),
// for endpoints that show members their own account.
func currentAccount(r *http.Request) *domain.Member {
	m, _ := r.Context().Value(accountCtxKey).(*domain.Member)
	return m
}

// heldStaffRole returns the staff role a signed-in account holds but may not
// use until two-factor is on ("" when none).
func heldStaffRole(r *http.Request) string {
	role, _ := r.Context().Value(heldRoleCtxKey).(string)
	return role
}

// CORS lets the known frontends (public web, admin, marketing) call the API.
// Because several frontends run on different origins, it echoes back the
// request's Origin when allowed rather than naming a single static origin. An
// allowed entry of "*" permits any origin. When allowLoopback is set (every
// environment except production) loopback origins (localhost / 127.0.0.1 /
// [::1] on any port) are allowed too, so the exact dev ports don't have to be
// configured; production only answers the configured origins.
func CORS(allowed []string, allowLoopback bool, next http.Handler) http.Handler {
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
		if allow := corsAllowedOrigin(origin, set, wildcard, allowLoopback); allow != "" {
			w.Header().Set("Access-Control-Allow-Origin", allow)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
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
func corsAllowedOrigin(origin string, set map[string]struct{}, wildcard, allowLoopback bool) string {
	if origin == "" {
		return ""
	}
	if _, ok := set[origin]; ok || wildcard || (allowLoopback && isLoopbackOrigin(origin)) {
		return origin
	}
	return ""
}

// Content-Security-Policy values. The API serves JSON, so its responses may
// load nothing and be framed by nobody; uploaded files may only show
// themselves, sandboxed. The GraphQL playground page (GET /graphql in a
// browser) loads its own scripts and keeps only the non-CSP headers.
const (
	cspAPI     = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
	cspUploads = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; sandbox"
	// hstsValue: two years, subdomains included (production only — HTTPS there).
	hstsValue = "max-age=63072000; includeSubDomains; preload"
)

// SecurityHeaders sets the browser hardening headers on every response:
// nosniff, no framing, a strict referrer policy, no powerful features, a
// restrictive CSP and — in production, which is served over HTTPS only — HSTS.
func SecurityHeaders(production bool, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		switch {
		case strings.HasPrefix(r.URL.Path, "/uploads/"):
			h.Set("Content-Security-Policy", cspUploads)
		case r.URL.Path == "/graphql":
		default:
			h.Set("Content-Security-Policy", cspAPI)
		}
		if production {
			h.Set("Strict-Transport-Security", hstsValue)
		}
		next.ServeHTTP(w, r)
	})
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

// Flush passes through to the underlying writer so streaming handlers (the
// /api/ai/stream SSE endpoint) still see an http.Flusher behind the logger.
func (w *statusWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Unwrap exposes the underlying writer to http.ResponseController.
func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

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
