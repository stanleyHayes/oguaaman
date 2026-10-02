package http

import (
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── adopt-a-project (spec §4/§6/§15): projects + pledges via Paystack ─────────

const (
	// devReceiptEmail stands in for a receipt address only on a dev server
	// running without auth (Paystack requires an email). Never in production.
	devReceiptEmail = "payments@oguaa.test"
	// memberReceiptDomain hosts the per-member placeholder receipt address
	// (m-<memberId>@receipts.oguaaman.com) for members without an email.
	memberReceiptDomain      = "receipts.oguaaman.com"
	msgReceiptEmailRequired  = "Add an email address for your payment receipt."
	msgReceiptEmailMalformed = "Enter a valid email address for your payment receipt."
	msgPledgeRange           = "Pledge between GH₵ 1 and GH₵ 100,000."
)

// receiptEmail picks the address Paystack sends the receipt to: the one the
// payer typed (validated), else the signed-in member's own, else a
// per-member placeholder (memberReceiptAddress). A payment is never refused
// because a member registered by phone has no email: Paystack needs one, and
// a per-member address keeps each payer a separate Paystack customer. Only a
// dev server without auth (no member) falls back to devReceiptEmail.
// ok=false means a 400 has been written.
func (h *Handler) receiptEmail(w http.ResponseWriter, typed string, m *domain.Member) (string, bool) {
	email := strings.TrimSpace(typed)
	if email != "" {
		if addr, err := mail.ParseAddress(email); err != nil || addr.Address != email {
			fail(w, http.StatusBadRequest, msgReceiptEmailMalformed)
			return "", false
		}
		return email, true
	}
	if m != nil && strings.TrimSpace(m.Email) != "" {
		return strings.TrimSpace(m.Email), true
	}
	if m != nil {
		if addr := memberReceiptAddress(m.ID); addr != "" {
			return addr, true
		}
	}
	if !h.authRequired {
		return devReceiptEmail, true
	}
	fail(w, http.StatusBadRequest, msgReceiptEmailRequired)
	return "", false
}

// memberReceiptAddress is the placeholder receipt address for a member with
// no email: m-<memberId>@receipts.oguaaman.com. Characters outside
// [A-Za-z0-9-] are dropped so the id always forms a valid local part; an
// empty id yields "".
func memberReceiptAddress(memberID string) string {
	id := strings.Map(func(r rune) rune {
		if r == '-' || (r >= '0' && r <= '9') || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
			return r
		}
		return -1
	}, memberID)
	if id == "" {
		return ""
	}
	return "m-" + id + "@" + memberReceiptDomain
}

func (h *Handler) Projects(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.Projects(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, h.viewable(r, items))
}

func (h *Handler) Project(w http.ResponseWriter, r *http.Request) {
	l, err := h.listingBySlug(r, domain.TypeProject)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, l)
}

// PledgeQuote answers GET /api/projects/{slug}/pledge-quote?amountPesewas=N
// (K17): the fee percentage, fee, net amount reaching the project and the
// refund terms, shown before the payer pays. Public.
func (h *Handler) PledgeQuote(w http.ResponseWriter, r *http.Request) {
	amount, err := strconv.ParseInt(r.URL.Query().Get("amountPesewas"), 10, 64)
	if err != nil {
		fail(w, http.StatusBadRequest, msgPledgeRange)
		return
	}
	quote, err := h.payments.QuotePledge(r.Context(), r.PathValue("slug"), amount)
	if errors.Is(err, service.ErrPledgeAmount) {
		fail(w, http.StatusBadRequest, msgPledgeRange)
		return
	}
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, quote)
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
	email, ok := h.receiptEmail(w, in.Email, m)
	if !ok {
		return
	}
	memberID := ""
	if m != nil {
		memberID = m.ID
	}
	authURL, accessCode, reference, err := h.payments.StartPledge(r.Context(), r.PathValue("slug"), memberID, email, in.AmountPesewas)
	if h.paymentsUnavailable(w, err) {
		return
	}
	if errors.Is(err, service.ErrPledgeAmount) {
		fail(w, http.StatusBadRequest, msgPledgeRange)
		return
	}
	if errors.Is(err, service.ErrFundingClosed) {
		fail(w, http.StatusConflict, "Funding for this campaign has closed.")
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
		"accessCode":       accessCode,
		"reference":        reference,
		"simulated":        h.payments.Simulated(),
	})
}

// Donate starts a "tip jar" donation to an artist (Creator Monetization).
// Requires a signed-in member; the service gates on the artist's owner holding
// an active creator subscription.
func (h *Handler) Donate(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if h.rateLimited(w, r, "donate:"+clientKey(r), 10, time.Hour) {
		return
	}
	var in struct {
		AmountPesewas int64  `json:"amountPesewas"`
		Email         string `json:"email"`
		Message       string `json:"message"`
		Anonymous     bool   `json:"anonymous"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	email, ok := h.receiptEmail(w, in.Email, m)
	if !ok {
		return
	}
	memberID := ""
	if m != nil {
		memberID = m.ID
	}
	authURL, accessCode, reference, err := h.payments.StartDonation(r.Context(), r.PathValue("slug"), memberID, email, in.AmountPesewas, in.Message, in.Anonymous)
	if h.paymentsUnavailable(w, err) {
		return
	}
	if errors.Is(err, service.ErrPledgeAmount) {
		fail(w, http.StatusBadRequest, "Donate between GH₵ 1 and GH₵ 100,000.")
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
		"accessCode":       accessCode,
		"reference":        reference,
		"simulated":        h.payments.Simulated(),
	})
}

// ConfirmDonation verifies a donation after the donor returns from Paystack.
// Donations are pledges, so it shares the pledge confirm path (idempotent).
func (h *Handler) ConfirmDonation(w http.ResponseWriter, r *http.Request) {
	h.ConfirmPledge(w, r)
}

// The payment confirm endpoints are unauthenticated (the payer may return from
// Paystack signed out) and each call costs a Paystack Verify round trip.
// Settlement is idempotent, so this limit only stops a replay burst from
// hammering the provider; it is far above any real redirect/retry pattern.
const (
	confirmRateLimit     = 60
	confirmRateWindow    = 10 * time.Minute
	msgReferenceRequired = "reference is required"
)

// msgPaymentStartFailed is the answer when the payment provider could not
// start a checkout.
const msgPaymentStartFailed = "Could not start the payment. Please try again."

// paymentStartErr answers a failed payment start: validation problems are the
// payer's to fix (400), not-found/forbidden keep their statuses, and anything
// else is the provider failing to open a checkout (502).
func (h *Handler) paymentStartErr(w http.ResponseWriter, err error) {
	var ve *domain.ValidationError
	var nf *domain.NotFoundError
	var fb *domain.ForbiddenError
	switch {
	case errors.As(err, &ve):
		fail(w, http.StatusBadRequest, ve.Error())
	case errors.As(err, &nf), errors.As(err, &fb):
		h.handleErr(w, err)
	default:
		h.log.Error("payment start failed", "err", err)
		fail(w, http.StatusBadGateway, msgPaymentStartFailed)
	}
}

// confirmReference reads the ?reference= of a payment confirm call, applying
// the shared confirm rate limit. ok=false means the response is written.
func (h *Handler) confirmReference(w http.ResponseWriter, r *http.Request) (string, bool) {
	if h.rateLimited(w, r, "pay-confirm:"+clientKey(r), confirmRateLimit, confirmRateWindow) {
		return "", false
	}
	reference := r.URL.Query().Get("reference")
	if reference == "" {
		fail(w, http.StatusBadRequest, msgReferenceRequired)
		return "", false
	}
	return reference, true
}

// ConfirmPledge verifies a transaction after the payer returns from Paystack.
func (h *Handler) ConfirmPledge(w http.ResponseWriter, r *http.Request) {
	reference, ok := h.confirmReference(w, r)
	if !ok {
		return
	}
	pledge, err := h.payments.ConfirmPledge(r.Context(), reference)
	if h.paymentsUnavailable(w, err) {
		return
	}
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

// PaymentBanks — GET /api/payments/banks?type=bank|mobile_money (C2): the
// GHS banks and Mobile Money networks a seller can settle to, from Paystack's
// own list (cached for a day). Signed-in only; 503 payments_unavailable when
// the list can't be had (no Paystack key, or Paystack unreachable).
func (h *Handler) PaymentBanks(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAuth(w, r); !ok {
		return
	}
	kind := r.URL.Query().Get("type")
	if kind != "" && kind != service.BankKindBank && kind != service.BankKindMobileMoney {
		fail(w, http.StatusBadRequest, "type must be bank or mobile_money")
		return
	}
	if h.commerce == nil {
		writeSentinelErr(w, service.ErrPaymentsUnavailable)
		return
	}
	banks, err := h.commerce.SettlementBanks(r.Context(), kind)
	if err != nil {
		if !errors.Is(err, service.ErrPaymentsUnavailable) && h.log != nil {
			h.log.Warn("bank list unavailable", "err", err)
		}
		writeSentinelErr(w, service.ErrPaymentsUnavailable)
		return
	}
	w.Header().Set("Cache-Control", "private, max-age=3600")
	writeJSON(w, http.StatusOK, banks)
}

// errNoSettlementRoute marks a charge whose reference no money flow on this
// server issued (or whose flow is not wired): there is nothing to settle.
var errNoSettlementRoute = errors.New("no money flow on this server issues that reference")

// settlePaystackCharge routes a verified charge.success to the confirm of the
// money flow that issued its reference (namespaced oguaa-… or legacy). Each
// confirm re-verifies with Paystack and is idempotent, so the webhook and the
// payer's own confirm settle once.
func (h *Handler) settlePaystackCharge(ctx context.Context, ref string) error {
	prefix, _ := service.RefFlow(ref)
	var err error
	switch {
	case prefix == service.RefPrefixOrder && h.commerce != nil:
		_, err = h.commerce.ConfirmOrder(ctx, ref)
	case prefix == service.RefPrefixTicket && h.tickets != nil:
		_, err = h.tickets.ConfirmTicket(ctx, ref)
	case (prefix == service.RefPrefixSubscription || prefix == service.RefPrefixCreatorSubscription) && h.subs != nil:
		_, err = h.subs.ConfirmSubscription(ctx, ref)
	case prefix == service.RefPrefixPromotion && h.promotions != nil:
		_, err = h.promotions.ConfirmPromotion(ctx, ref)
	case prefix == service.RefPrefixAgentJob && h.agentJobs != nil:
		_, err = h.agentJobs.ConfirmFunding(ctx, ref)
	case prefix == service.RefPrefixAd && h.ads != nil:
		_, err = h.ads.ConfirmPayment(ctx, ref)
	case (prefix == service.RefPrefixPledge || prefix == service.RefPrefixDonation) && h.payments != nil:
		_, err = h.payments.ConfirmPledge(ctx, ref)
	default:
		err = errNoSettlementRoute
	}
	return err
}

// paystackEvent is the part of a Paystack webhook the handler reads.
type paystackEvent struct {
	Event string `json:"event"`
	Data  struct {
		Reference string          `json:"reference"`
		Metadata  json.RawMessage `json:"metadata"`
	} `json:"data"`
}

// metadataApp reads metadata.app from a charge. Paystack echoes metadata as
// sent (an object) but integrations may send it stringified; both are read.
func metadataApp(raw json.RawMessage) string {
	var meta struct {
		App string `json:"app"`
	}
	if json.Unmarshal(raw, &meta) == nil {
		return meta.App
	}
	var inner string
	if json.Unmarshal(raw, &inner) == nil && json.Unmarshal([]byte(inner), &meta) == nil {
		return meta.App
	}
	return ""
}

// foreignCharge reports a charge.success that belongs to another app on the
// shared Paystack integration (C5): tagged for another app, or a reference
// that is no Oguaa flow's.
func foreignCharge(ev paystackEvent) bool {
	if app := metadataApp(ev.Data.Metadata); app != "" && app != "oguaa" {
		return true
	}
	prefix, _ := service.RefFlow(ev.Data.Reference)
	return prefix == ""
}

// PaystackWebhook handles charge.success events. The body is authenticated with
// HMAC-SHA512 (x-paystack-signature) using the secret key; without a configured
// secret (dev simulation) webhooks are ignored — the redirect confirm covers dev.
//
// The integration is shared with the owner's other apps (C5), so after the
// signature check only Oguaa's charges are processed: an oguaa- reference, or
// a legacy prefix that matches an Oguaa record, with metadata.app absent or
// "oguaa". Anything else is acknowledged (200) and logged at debug, never
// processed and never retried. Each Oguaa flow settles its own references. A
// transient failure answers 500 so Paystack retries the event; a final
// outcome (unknown reference, charge not completed, seat or plan no longer
// available) is acknowledged so Paystack stops retrying.
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
	var event paystackEvent
	if err := json.Unmarshal(body, &event); err != nil {
		fail(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if event.Event != "charge.success" || event.Data.Reference == "" {
		w.WriteHeader(http.StatusOK)
		return
	}
	ref := event.Data.Reference
	if foreignCharge(event) {
		h.debug("webhook charge is not Oguaa's; ignored", "ref", ref)
		w.WriteHeader(http.StatusOK)
		return
	}
	if err := h.settlePaystackCharge(r.Context(), ref); err != nil && h.webhookShouldRetry(ref, err) {
		fail(w, http.StatusInternalServerError, "could not settle this charge yet")
		return
	}
	w.WriteHeader(http.StatusOK)
}

// webhookShouldRetry logs a settlement error and reports whether it is
// transient (answer 5xx so Paystack retries) rather than a final outcome or
// a legacy-prefixed reference that is not Oguaa's after all (acknowledge).
func (h *Handler) webhookShouldRetry(ref string, err error) bool {
	var nf *domain.NotFoundError
	_, namespaced := service.RefFlow(ref)
	switch {
	case errors.As(err, &nf) && !namespaced:
		h.debug("webhook legacy-prefixed charge has no Oguaa record; ignored", "ref", ref)
		return false
	case !errors.Is(err, errNoSettlementRoute) && !service.SettlementFinal(err):
		h.logAt(slog.LevelError, "webhook settlement failed; Paystack will retry", "ref", ref, "err", err)
		return true
	default:
		h.logAt(slog.LevelWarn, "webhook charge not applied", "ref", ref, "err", err)
		return false
	}
}

// debug logs at debug level when a logger is configured.
func (h *Handler) debug(msg string, args ...any) { h.logAt(slog.LevelDebug, msg, args...) }

// logAt logs at level when a logger is configured.
func (h *Handler) logAt(level slog.Level, msg string, args ...any) {
	if h.log != nil {
		h.log.Log(context.Background(), level, msg, args...)
	}
}
