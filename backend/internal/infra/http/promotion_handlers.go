package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── paid promotions (Phase 8): self-serve featured placements via Paystack ────

// Promote starts a featured-placement payment for a listing. Requires a
// signed-in member; the service enforces that the member owns the listing.
func (h *Handler) Promote(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if h.rateLimited(w, r, "promote:"+clientKey(r), 10, time.Hour) {
		return
	}
	var in struct {
		Days int `json:"days"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	memberID, email := "", ""
	if m != nil {
		memberID = m.ID
		email = m.Email
	}
	if email == "" {
		email = "promote@oguaa.test" // dev mode without auth — Paystack requires an email
	}
	authURL, reference, err := h.promotions.StartPromotion(r.Context(), r.PathValue("id"), memberID, email, in.Days)
	if errors.Is(err, service.ErrPromotionDays) {
		fail(w, http.StatusBadRequest, "Choose a 7, 14 or 30 day promotion.")
		return
	}
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
		"simulated":        h.promotions.Simulated(),
	})
}

// ConfirmPromotion verifies a transaction after the owner returns from Paystack.
func (h *Handler) ConfirmPromotion(w http.ResponseWriter, r *http.Request) {
	reference := r.URL.Query().Get("reference")
	if reference == "" {
		fail(w, http.StatusBadRequest, "reference is required")
		return
	}
	promo, err := h.promotions.ConfirmPromotion(r.Context(), reference)
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, promo)
}

// AdminPromotions — the steward ledger of every promotion (curator/steward only).
func (h *Handler) AdminPromotions(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator"); !ok {
		return
	}
	promos, err := h.promotions.AllPromotions(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, promos)
}

// AdminRevenue — the platform income overview across all four money streams
// (curator/steward only).
func (h *Handler) AdminRevenue(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator"); !ok {
		return
	}
	overview, err := h.revenue.Overview(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, overview)
}
