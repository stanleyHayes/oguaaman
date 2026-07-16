package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── business subscriptions (Phase 7): the Supporter plan via Paystack ─────────

// Subscribe starts a Supporter subscription payment for a business. Requires a
// signed-in member; the service enforces that the member owns the business.
func (h *Handler) Subscribe(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if h.rateLimited(w, r, "subscribe:"+clientKey(r), 10, time.Hour) {
		return
	}
	memberID, email := "", ""
	if m != nil {
		memberID = m.ID
		email = m.Email
	}
	if email == "" {
		email = "support@oguaa.test" // dev mode without auth — Paystack requires an email
	}
	var in struct {
		Plan string `json:"plan"`
	}
	if r.Body != nil && r.ContentLength > 0 {
		if err := decodeBody(r, &in); err != nil {
			fail(w, http.StatusBadRequest, msgInvalidRequestBody)
			return
		}
	}
	authURL, reference, err := h.subs.StartSubscription(r.Context(), r.PathValue("slug"), memberID, email, in.Plan)
	if err != nil {
		var nf *domain.NotFoundError
		var fb *domain.ForbiddenError
		if errors.As(err, &nf) || errors.As(err, &fb) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadGateway, "Could not start the payment. Please try again.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"authorizationUrl": authURL,
		"reference":        reference,
		"simulated":        h.subs.Simulated(),
	})
}

// ConfirmSubscription verifies a transaction after the owner returns from Paystack.
func (h *Handler) ConfirmSubscription(w http.ResponseWriter, r *http.Request) {
	reference := r.URL.Query().Get("reference")
	if reference == "" {
		fail(w, http.StatusBadRequest, "reference is required")
		return
	}
	sub, err := h.subs.ConfirmSubscription(r.Context(), reference)
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, sub)
}

// MySubscriptions — the signed-in member's subscriptions.
func (h *Handler) MySubscriptions(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		writeJSON(w, http.StatusOK, []domain.Subscription{})
		return
	}
	subs, err := h.subs.MemberSubscriptions(r.Context(), m.ID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, subs)
}

// AdminSubscriptions — the steward ledger of every subscription (curator/steward only).
func (h *Handler) AdminSubscriptions(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator"); !ok {
		return
	}
	subs, err := h.subs.AllSubscriptions(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, subs)
}
