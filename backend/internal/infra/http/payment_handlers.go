package http

import (
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── adopt-a-project (spec §4/§6/§15): projects + pledges via Paystack ─────────

func (h *Handler) Projects(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.Projects(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (h *Handler) Project(w http.ResponseWriter, r *http.Request) {
	l, err := h.svc.ListingBySlug(r.Context(), domain.TypeProject, r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, l)
}

// Pledge starts a payment toward a project. Requires a signed-in member (the
// pledge is attributed and the receipt email defaults to theirs).
func (h *Handler) Pledge(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if h.rateLimited(w, r, "pledge:"+clientKey(r), 10, time.Hour) {
		return
	}
	var in struct {
		AmountPesewas int64  `json:"amountPesewas"`
		Email         string `json:"email"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	memberID, email := "", in.Email
	if m != nil {
		memberID = m.ID
		if email == "" {
			email = m.Email
		}
	}
	if email == "" {
		email = "pledge@oguaa.test" // dev mode without auth — Paystack requires an email
	}
	authURL, reference, err := h.payments.StartPledge(r.Context(), r.PathValue("slug"), memberID, email, in.AmountPesewas)
	if errors.Is(err, service.ErrPledgeAmount) {
		fail(w, http.StatusBadRequest, "Pledge between GH₵ 1 and GH₵ 100,000.")
		return
	}
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadGateway, "Could not start the payment. Please try again.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"authorizationUrl": authURL,
		"reference":        reference,
		"simulated":        h.payments.Simulated(),
	})
}

// ConfirmPledge verifies a transaction after the payer returns from Paystack.
func (h *Handler) ConfirmPledge(w http.ResponseWriter, r *http.Request) {
	reference := r.URL.Query().Get("reference")
	if reference == "" {
		fail(w, http.StatusBadRequest, "reference is required")
		return
	}
	pledge, err := h.payments.ConfirmPledge(r.Context(), reference)
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, pledge)
}

// MyPledges — the signed-in member's giving history.
func (h *Handler) MyPledges(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		writeJSON(w, http.StatusOK, []domain.Pledge{})
		return
	}
	pledges, err := h.payments.MemberPledges(r.Context(), m.ID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, pledges)
}

// AdminPledges — the steward ledger of every pledge (curator/steward only).
func (h *Handler) AdminPledges(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator"); !ok {
		return
	}
	pledges, err := h.payments.AllPledges(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, pledges)
}

// AdminPledgeTotals — gross charged, platform fee kept, net to projects
// across successful pledges (curator/steward only).
func (h *Handler) AdminPledgeTotals(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator"); !ok {
		return
	}
	gross, fee, net, err := h.payments.FeeTotals(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int64{
		"grossPesewas": gross,
		"feePesewas":   fee,
		"netPesewas":   net,
	})
}

// PaystackWebhook handles charge.success events. The body is authenticated with
// HMAC-SHA512 (x-paystack-signature) using the secret key; without a configured
// secret (dev simulation) webhooks are ignored — the redirect confirm covers dev.
func (h *Handler) PaystackWebhook(w http.ResponseWriter, r *http.Request) {
	if h.paystackSecret == "" {
		w.WriteHeader(http.StatusOK) // nothing to verify against — accept & ignore
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		fail(w, http.StatusBadRequest, "unreadable body")
		return
	}
	mac := hmac.New(sha512.New, []byte(h.paystackSecret))
	mac.Write(body)
	if !hmac.Equal([]byte(hex.EncodeToString(mac.Sum(nil))), []byte(r.Header.Get("x-paystack-signature"))) {
		fail(w, http.StatusUnauthorized, "bad signature")
		return
	}
	var event struct {
		Event string `json:"event"`
		Data  struct {
			Reference string `json:"reference"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &event); err != nil {
		fail(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if event.Event == "charge.success" && event.Data.Reference != "" {
		if _, err := h.payments.ConfirmPledge(r.Context(), event.Data.Reference); err != nil {
			h.log.Error("webhook confirm failed", "ref", event.Data.Reference, "err", err)
		}
	}
	w.WriteHeader(http.StatusOK)
}
