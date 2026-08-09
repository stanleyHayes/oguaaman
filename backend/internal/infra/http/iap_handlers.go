package http

import (
	"errors"
	"net/http"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── Apple In-App Purchase (App Store Review Guideline 3.1.1) ─────────────────

// AppleProducts — GET /api/iap/apple/products.
//
// The app needs App Store product ids to query StoreKit, and hard-coding them
// in two places guarantees they drift. Public: product ids are not secret, and
// the screen that lists plans renders before sign-in.
func (h *Handler) AppleProducts(w http.ResponseWriter, r *http.Request) {
	out := make([]map[string]string, 0, len(domain.AppleProductForPlan))
	for plan, product := range domain.AppleProductForPlan {
		out = append(out, map[string]string{"planSlug": plan, "productId": product})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"products": out,
		"enabled":  h.iap != nil && h.iap.Enabled(),
	})
}

// RedeemApplePurchase — POST /api/iap/apple/redeem.
//
// The app posts the StoreKit 2 signed transaction (the JWS in `purchaseToken`)
// after a successful purchase or a restore. The server is the only place that
// decides whether it grants anything.
func (h *Handler) RedeemApplePurchase(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.iap == nil || !h.iap.Enabled() {
		fail(w, http.StatusServiceUnavailable, "In-app purchases are not configured on this server.")
		return
	}

	var in struct {
		// StoreKit 2 hands this to the app as `purchaseToken`; older clients may
		// still call it signedTransaction.
		PurchaseToken     string `json:"purchaseToken"`
		SignedTransaction string `json:"signedTransaction"`
		Reference         string `json:"reference"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	token := in.PurchaseToken
	if token == "" {
		token = in.SignedTransaction
	}
	if token == "" {
		fail(w, http.StatusBadRequest, "Missing the purchase receipt.")
		return
	}

	res, err := h.iap.Redeem(r.Context(), m.ID, token, in.Reference)
	switch {
	case err == nil:
		writeJSON(w, http.StatusOK, res)
	case errors.Is(err, service.ErrAppleReceiptInvalid):
		// 400, not 403: the receipt is malformed or not ours, which is a bad
		// request rather than a permission problem.
		fail(w, http.StatusBadRequest, "That purchase could not be verified with Apple.")
	case errors.Is(err, service.ErrIAPAlreadyRedeemed):
		// 200, not an error: a restore-purchases pass replays every transaction,
		// and "already applied" is the correct, successful outcome for the user.
		writeJSON(w, http.StatusOK, map[string]any{"alreadyRedeemed": true})
	case errors.Is(err, service.ErrIAPUnknownProduct):
		fail(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, service.ErrIAPExpired):
		fail(w, http.StatusBadRequest, err.Error())
	default:
		h.handleErr(w, err)
	}
}
