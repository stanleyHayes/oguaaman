// Package http is the REST delivery layer: a Handler that delegates to the
// service core, plus middleware and the router. Handlers are split across files
// by concern (listings, institutions, moderation, auth, notifications, ai).
package http

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

const maxBody = 256 * 1024 // 256KB request cap (roomy for section-builder payloads)

const (
	msgInvalidRequestBody = "invalid request body" // decodeBody could not parse the JSON payload
	msgSignInToContinue   = "Sign in to continue." // endpoint needs a signed-in member
)

// Handler holds the application services the routes delegate to.
type Handler struct {
	svc            *service.Service
	ai             *service.AIService
	auth           *service.AuthService
	payments       *service.PaymentsService
	tickets        *service.TicketsService
	subs           *service.SubscriptionsService
	promotions     *service.PromotionsService
	revenue        *service.RevenueService
	paystackSecret string // webhook signature verification; "" in dev simulation
	authRequired   bool
	log            *slog.Logger
	limiter        *rateLimiter
	uploadDir      string // where uploaded images are written
	uploadBase     string // public base URL for uploaded files ("" → derive from request)
}

func NewHandler(svc *service.Service, ai *service.AIService, auth *service.AuthService, payments *service.PaymentsService, tickets *service.TicketsService, subs *service.SubscriptionsService, promotions *service.PromotionsService, revenue *service.RevenueService, paystackSecret string, authRequired bool, uploadDir, uploadBase string, log *slog.Logger) *Handler {
	return &Handler{
		svc: svc, ai: ai, auth: auth, payments: payments, tickets: tickets, subs: subs, promotions: promotions, revenue: revenue, paystackSecret: paystackSecret, authRequired: authRequired,
		uploadDir: uploadDir, uploadBase: uploadBase, log: log, limiter: newRateLimiter(),
	}
}

// requireAuth returns the signed-in member, or (nil,true) in dev when auth isn't
// enforced (handlers then fall back to a demo identity). When AUTH_REQUIRED=true
// and there's no member, it writes 401 and returns ok=false.
func (h *Handler) requireAuth(w http.ResponseWriter, r *http.Request) (*domain.Member, bool) {
	m := currentMember(r)
	if m == nil && h.authRequired {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return nil, false
	}
	return m, true
}

// requireRole gates curator/steward actions (stewards pass everything).
func (h *Handler) requireRole(w http.ResponseWriter, r *http.Request, roles ...string) (*domain.Member, bool) {
	m := currentMember(r)
	if m != nil {
		if m.Role == "steward" {
			return m, true
		}
		for _, role := range roles {
			if m.Role == role {
				return m, true
			}
		}
	}
	if !h.authRequired {
		return m, true // dev: open back-office
	}
	fail(w, http.StatusForbidden, "Curator or steward access required.")
	return nil, false
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// handleErr maps domain errors to HTTP statuses.
func (h *Handler) handleErr(w http.ResponseWriter, err error) {
	var nf *domain.NotFoundError
	if errors.As(err, &nf) {
		fail(w, http.StatusNotFound, nf.Error())
		return
	}
	var fb *domain.ForbiddenError
	if errors.As(err, &fb) {
		fail(w, http.StatusForbidden, fb.Error())
		return
	}
	h.log.Error("handler error", "err", err)
	fail(w, http.StatusInternalServerError, "something went wrong")
}

func decodeBody(r *http.Request, v any) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, maxBody))
	return dec.Decode(v)
}

func today() string { return time.Now().UTC().Format("2006-01-02") }

// ── health ───────────────────────────────────────────────────────────────────

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
