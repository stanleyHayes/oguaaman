package http

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

const msgStripeNotConfigured = "Stripe is not configured on this server."

// StripeIntent creates a PaymentIntent for the mobile Stripe PaymentSheet. The
// caller must have already created the pending domain record (pledge, ticket,
// subscription or promotion) via the existing start endpoint; the reference
// and flow name that record. The amount and currency are the SERVER's — the
// record's stored amount, in GHS — whatever the client sends.
func (h *Handler) StripeIntent(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if h.stripe == nil {
		fail(w, http.StatusServiceUnavailable, msgStripeNotConfigured)
		return
	}
	if h.rateLimited(w, r, "stripe:intent:"+clientKey(r), 20, time.Hour) {
		return
	}
	var in struct {
		Reference string `json:"reference"`
		Flow      string `json:"flow"`
		// amountPesewas, currency and metadata are accepted for older clients
		// but ignored: the server decides what is charged.
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	checkout, err := h.stripe.CreateIntent(r.Context(), orDevMember(m), strings.TrimSpace(in.Flow), in.Reference)
	if err != nil {
		var ve *domain.ValidationError
		var nf *domain.NotFoundError
		var fb *domain.ForbiddenError
		if errors.As(err, &ve) || errors.As(err, &nf) || errors.As(err, &fb) {
			h.commerceErr(w, err)
			return
		}
		h.log.Error("stripe intent failed", "err", err)
		fail(w, http.StatusBadGateway, "Could not start the Stripe payment. Please try again.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"clientSecret":    checkout.ClientSecret,
		"paymentIntentId": checkout.PaymentIntentID,
		"reference":       strings.TrimSpace(in.Reference),
		"amountPesewas":   checkout.AmountPesewas,
		"currency":        strings.ToUpper(checkout.Currency),
	})
}

// StripeConfirm verifies a PaymentIntent with Stripe and, on success, fulfills
// the matching money flow.
func (h *Handler) StripeConfirm(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuth(w, r); !ok {
		return
	}
	if h.stripe == nil {
		fail(w, http.StatusServiceUnavailable, msgStripeNotConfigured)
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
		switch {
		case errors.As(err, &nf):
			h.handleErr(w, err)
		case errors.Is(err, service.ErrStripePaymentMismatch):
			// A payment on other terms than the checkout (another currency,
			// amount or reference) is a tampering signal, not a user slip.
			h.log.Warn("security: stripe payment does not match its checkout", "reference", reference, "memberId", memberIDOf(currentMember(r)))
			fail(w, http.StatusBadRequest, err.Error())
		default:
			fail(w, http.StatusBadRequest, err.Error())
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "success",
		"reference": reference,
	})
}

// memberIDOf is the member id for logs ("" when anonymous).
func memberIDOf(m *domain.Member) string {
	if m == nil {
		return ""
	}
	return m.ID
}
