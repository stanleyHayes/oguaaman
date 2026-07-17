package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// StripeIntent creates a PaymentIntent for the mobile Stripe PaymentSheet. The
// caller must have already created the pending domain record (pledge, ticket,
// subscription or promotion) via the existing start endpoint; the reference
// links the two records together.
func (h *Handler) StripeIntent(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if h.stripe == nil {
		fail(w, http.StatusServiceUnavailable, "Stripe is not configured on this server.")
		return
	}
	if h.rateLimited(w, r, "stripe:intent:"+clientKey(r), 20, time.Hour) {
		return
	}
	var in struct {
		Reference     string            `json:"reference"`
		AmountPesewas int64             `json:"amountPesewas"`
		Currency      string            `json:"currency"`
		Flow          string            `json:"flow"`
		Metadata      map[string]string `json:"metadata"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if in.Reference == "" {
		fail(w, http.StatusBadRequest, "reference is required")
		return
	}
	if in.AmountPesewas <= 0 {
		fail(w, http.StatusBadRequest, "amount must be greater than zero")
		return
	}
	switch in.Flow {
	case "pledge", "ticket", "subscription", "promotion":
	default:
		fail(w, http.StatusBadRequest, "flow must be pledge, ticket, subscription or promotion")
		return
	}
	currency := in.Currency
	if currency == "" {
		currency = "GHS"
	}
	email := ""
	if m != nil {
		email = m.Email
	}
	clientSecret, paymentIntentID, err := h.stripe.CreateIntent(r.Context(), m.ID, email, in.AmountPesewas, currency, in.Flow, in.Reference, in.Metadata)
	if err != nil {
		fail(w, http.StatusBadGateway, "Could not start the Stripe payment. Please try again.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"clientSecret":    clientSecret,
		"paymentIntentId": paymentIntentID,
		"reference":       in.Reference,
	})
}

// StripeConfirm verifies a PaymentIntent with Stripe and, on success, fulfills
// the matching money flow.
func (h *Handler) StripeConfirm(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuth(w, r); !ok {
		return
	}
	if h.stripe == nil {
		fail(w, http.StatusServiceUnavailable, "Stripe is not configured on this server.")
		return
	}
	reference := r.URL.Query().Get("reference")
	if reference == "" {
		fail(w, http.StatusBadRequest, "reference is required")
		return
	}
	err := h.stripe.ConfirmIntent(r.Context(), reference)
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "success",
		"reference": reference,
	})
}
