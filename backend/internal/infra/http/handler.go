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
	"slices"
	"sync"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/platform/logger"
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
	commerce       *service.CommerceService
	stripe         *service.StripeService
	iap            *service.IAPService
	revenue        *service.RevenueService
	creator        *service.CreatorService
	agentJobs      *service.AgentJobsService
	artistBookings *service.ArtistBookingService
	paystackSecret string // webhook signature verification; "" in dev simulation
	authRequired   bool
	production     bool // GO_ENV=production: HSTS on, loopback CORS off, no dev codes
	log            *slog.Logger
	limiter        *rateLimiter
	uploadDir      string // where uploaded images are written
	uploadBase     string // public base URL for uploaded files ("" → derive from request)
	portalURL      string // citizen-app origin; the host the dynamic sitemap's URLs live on

	// rights holds the member-data features (export, erasure, private
	// documents, data-rights requests); see WithDataRights.
	rights DataRightsDeps
	// foundations holds platform settings and the election calendar; see
	// WithFoundations.
	foundations FoundationsDeps
	// newsDesk is the researched news desk; see WithNewsDesk.
	newsDesk *service.NewsDesk
	// ads is paid advertising (sponsors, campaigns, review, payment); see
	// WithAds.
	ads *service.AdsService
	// adServing is ad serving, the ad library and the ads report; see
	// WithAdServing.
	adServing AdServingDeps
	// newsCovers draws and caches branded news covers; see coverRenderer.
	newsCoversOnce sync.Once
	newsCovers     *newsCoverRenderer
}

// HandlerDeps are the application services and settings NewHandler wires into a Handler.
type HandlerDeps struct {
	Svc            *service.Service
	AI             *service.AIService
	Auth           *service.AuthService
	Payments       *service.PaymentsService
	Tickets        *service.TicketsService
	Subs           *service.SubscriptionsService
	Promotions     *service.PromotionsService
	Commerce       *service.CommerceService
	Stripe         *service.StripeService
	IAP            *service.IAPService
	Revenue        *service.RevenueService
	Creator        *service.CreatorService
	AgentJobs      *service.AgentJobsService
	ArtistBookings *service.ArtistBookingService
	PaystackSecret string // webhook signature verification; "" in dev simulation
	AuthRequired   bool
	Production     bool   // GO_ENV=production
	UploadDir      string // where uploaded images are written
	UploadBase     string // public base URL for uploaded files ("" → derive from request)
	PortalURL      string // citizen-app origin, for the dynamic sitemap
	Log            *slog.Logger

	// Foundations are platform settings and the election calendar (spec §1).
	// Without them the settings-audit and election routes answer 503.
	Foundations FoundationsDeps
	// NewsDesk is the researched news desk (spec §2). Nil: its routes answer
	// 503 and public news carries no branded cover.
	NewsDesk *service.NewsDesk
	// Ads is paid advertising (spec §3.2–§3.8). Nil: its routes answer 503.
	Ads *service.AdsService
	// AdServing is ad serving, the ad library and the ads report (spec §3.9,
	// §3.10). Zero: slates are empty and the library is empty.
	AdServing AdServingDeps
}

func NewHandler(d HandlerDeps) *Handler {
	return &Handler{
		svc: d.Svc, ai: d.AI, auth: d.Auth, payments: d.Payments, tickets: d.Tickets, subs: d.Subs, promotions: d.Promotions, commerce: d.Commerce, stripe: d.Stripe, iap: d.IAP, revenue: d.Revenue, creator: d.Creator, agentJobs: d.AgentJobs, artistBookings: d.ArtistBookings, paystackSecret: d.PaystackSecret, authRequired: d.AuthRequired, production: d.Production,
		uploadDir: d.UploadDir, uploadBase: d.UploadBase, portalURL: d.PortalURL, log: d.Log, limiter: newRateLimiter(),
		foundations: d.Foundations, newsDesk: d.NewsDesk, ads: d.Ads, adServing: d.AdServing,
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

// msgStaffMFARequired accompanies 403 {"error":"mfa_required"} (contract K4).
const msgStaffMFARequired = "Turn on two-factor authentication to use staff tools."

// requireRole gates curator/steward actions (stewards pass everything). In
// production a staff account without two-factor gets 403
// {"error":"mfa_required"} instead (D9/K4): the Auth middleware withholds its
// role until it enrols, so the password alone never unlocks staff tools.
func (h *Handler) requireRole(w http.ResponseWriter, r *http.Request, roles ...string) (*domain.Member, bool) {
	m := currentMember(r)
	if m != nil && roleAllowed(m.Role, roles) {
		return m, true
	}
	if held := heldStaffRole(r); held != "" && roleAllowed(held, roles) {
		if acct := currentAccount(r); acct != nil {
			logger.Security(r.Context(), h.log, logger.EventStaffMFARequired, logger.KeyMemberID, acct.ID, "role", held, "path", r.URL.Path)
		}
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "mfa_required", "message": msgStaffMFARequired})
		return nil, false
	}
	if !h.authRequired {
		return m, true // dev: open back-office
	}
	fail(w, http.StatusForbidden, "Curator or steward access required.")
	return nil, false
}

// roleAllowed reports whether role passes a requireRole check for roles.
func roleAllowed(role string, roles []string) bool {
	return role == domain.RoleSteward || slices.Contains(roles, role)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// Messages for the service sentinels handleErr maps centrally.
const (
	msgPaymentsUnavailable  = "Payments are temporarily unavailable."
	msgPaymentPending       = "Your payment is still processing. We'll confirm it automatically — check again in a minute."
	msgPaymentCheckDown     = "We couldn't check your payment right now. Try again in a minute."
	msgCodeNotDelivered     = "We couldn't send a code right now. Try again later."
	msgPhoneCodeUnavailable = "We can't send codes to phone numbers yet. Try again later, or use the email address on your account."
)

// writeSentinelErr writes the response for the service sentinels that map to a
// fixed status and body, and reports whether err was one of them.
func writeSentinelErr(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, service.ErrPaymentsUnavailable):
		// K16: production without a Paystack key never simulates a payment.
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "payments_unavailable", "message": msgPaymentsUnavailable})
	case errors.Is(err, service.ErrPaymentPending):
		// C1: Paystack has not finished the charge; the record stays pending.
		writeJSON(w, http.StatusConflict, map[string]string{"error": "payment_pending", "message": msgPaymentPending})
	case errors.Is(err, service.ErrPaymentCheckUnavailable):
		// C1: Paystack could not be asked; nothing about the payment changed.
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "payment_check_unavailable", "message": msgPaymentCheckDown})
	case errors.Is(err, service.ErrPhoneCodeUnavailable):
		fail(w, http.StatusServiceUnavailable, msgPhoneCodeUnavailable)
	case errors.Is(err, service.ErrCodeNotDelivered):
		fail(w, http.StatusServiceUnavailable, msgCodeNotDelivered)
	default:
		return false
	}
	return true
}

// paymentsUnavailable answers the payment sentinels for handlers that
// otherwise map payment errors themselves: 503 payments_unavailable when
// payments are switched off, and on confirm paths (C1) 409 payment_pending
// while Paystack still processes the charge or 503 payment_check_unavailable
// when Paystack could not be asked.
func (h *Handler) paymentsUnavailable(w http.ResponseWriter, err error) bool {
	if !errors.Is(err, service.ErrPaymentsUnavailable) && !errors.Is(err, service.ErrPaymentPending) && !errors.Is(err, service.ErrPaymentCheckUnavailable) {
		return false
	}
	if errors.Is(err, service.ErrPaymentCheckUnavailable) && h.log != nil {
		h.log.Warn("payment check unavailable", "err", err)
	}
	return writeSentinelErr(w, err)
}

// handleErr maps domain errors to HTTP statuses.
func (h *Handler) handleErr(w http.ResponseWriter, err error) {
	if writeSentinelErr(w, err) {
		return
	}
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
