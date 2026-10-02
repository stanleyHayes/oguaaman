package http

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── paid advertising: rate card, quotes, sponsors, campaigns, review ────────
// (spec §4.3 except serving and the library, §4.6 except the report)

// WithAds attaches the ads service. Without it every ads route answers 503
// feature_unavailable.
func (h *Handler) WithAds(a *service.AdsService) *Handler {
	h.ads = a
	return h
}

// RegisterAdRoutes adds the advertiser and staff ads routes to mux.
func (h *Handler) RegisterAdRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/ads/rate-card", h.AdRateCard)
	mux.HandleFunc("POST /api/ads/quote", h.AdQuote)
	mux.HandleFunc("GET /api/ads/confirm", h.ConfirmAd)

	mux.HandleFunc("GET /api/me/ad-sponsors", h.MyAdSponsors)
	mux.HandleFunc("POST /api/me/ad-sponsors", h.CreateAdSponsor)
	mux.HandleFunc("PUT /api/me/ad-sponsors/{id}", h.UpdateAdSponsor)
	mux.HandleFunc("POST /api/me/ads", h.SubmitAd)
	mux.HandleFunc("GET /api/me/ads", h.MyAds)
	mux.HandleFunc("GET /api/me/ads/{id}", h.MyAd)
	mux.HandleFunc("POST /api/me/ads/{id}/checkout", h.CheckoutAd)
	mux.HandleFunc("POST /api/me/ads/{id}/cancel", h.CancelAd)

	mux.HandleFunc("GET /api/admin/ads", h.AdminAds)
	mux.HandleFunc("POST /api/admin/ads/kill", h.AdminKillAds)
	mux.HandleFunc("GET /api/admin/ads/{id}", h.AdminAd)
	mux.HandleFunc("POST /api/admin/ads/{id}/approve", h.AdminApproveAd)
	mux.HandleFunc("POST /api/admin/ads/{id}/reject", h.AdminRejectAd)
	mux.HandleFunc("POST /api/admin/ads/{id}/pause", h.AdminPauseAd)
	mux.HandleFunc("POST /api/admin/ads/{id}/resume", h.AdminResumeAd)
	mux.HandleFunc("POST /api/admin/ads/{id}/remove", h.AdminRemoveAd)
	mux.HandleFunc("POST /api/admin/ads/{id}/refund", h.AdminRefundAd)
	mux.HandleFunc("POST /api/admin/ads/{id}/refunds/{refundId}", h.AdminResolveAdRefund)
	mux.HandleFunc("GET /api/admin/ads/{id}/documents/approval", h.AdminAdDocument)
	mux.HandleFunc("GET /api/admin/ad-sponsors/{id}/documents/{kind}", h.AdminAdSponsorDocument)
	mux.HandleFunc("GET /api/admin/ad-sponsors", h.AdminAdSponsors)
	mux.HandleFunc("POST /api/admin/ad-sponsors/{id}/verify", h.AdminVerifyAdSponsor)
	mux.HandleFunc("POST /api/admin/ad-sponsors/{id}/reject", h.AdminRejectAdSponsor)
	mux.HandleFunc("POST /api/admin/ad-sponsors/{id}/suspend", h.AdminSuspendAdSponsor)
	mux.HandleFunc("GET /api/admin/settings/ads", h.AdminAdSettings)
	mux.HandleFunc("PUT /api/admin/settings/ads", h.AdminSaveAdSettings)
}

const (
	adQuotesPerMinute   = 60
	adSubmitsPerHour    = 10
	adCheckoutsPerHour  = 10
	adRateCardPerMinute = 120

	codePaymentFailed = "payment_failed"
	msgPaymentFailed  = "The payment didn't go through. No money was taken; you can try again."
	msgAdSignIn       = "Sign in to manage your ads."
)

// adErrorStatus maps an ads error code to its HTTP status (400 otherwise).
var adErrorStatus = map[string]int{
	service.AdErrInventoryUnavailable: http.StatusConflict,
	service.AdErrSponsorLocked:        http.StatusConflict,
	service.AdErrSponsorNotVerified:   http.StatusConflict,
	service.AdErrNotApproved:          http.StatusConflict,
	service.AdErrApprovalExpired:      http.StatusConflict,
	service.AdErrAlreadyPaid:          http.StatusConflict,
	service.AdErrNotCancellable:       http.StatusConflict,
	service.AdErrAlreadyApprovedByYou: http.StatusConflict,
	service.AdErrInvalidTransition:    http.StatusConflict,
	service.AdErrSponsorNotFound:      http.StatusNotFound,
	service.AdErrNotFound:             http.StatusNotFound,
	service.AdErrForbidden:            http.StatusForbidden,
	service.AdErrAdsDisabled:          http.StatusServiceUnavailable,
	service.AdErrPoliticalDisabled:    http.StatusServiceUnavailable,
	service.AdErrMediaUnavailable:     http.StatusServiceUnavailable,
	service.AdErrPaymentStartFailed:   http.StatusBadGateway,
}

// writeAdErr answers an error from the ads service.
func (h *Handler) writeAdErr(w http.ResponseWriter, err error) {
	if h.paymentsUnavailable(w, err) {
		return
	}
	var ae *service.AdError
	var nf *domain.NotFoundError
	var fe *service.InvalidFieldError
	switch {
	case errors.As(err, &ae):
		status, ok := adErrorStatus[ae.Code]
		if !ok {
			status = http.StatusBadRequest
		}
		body := map[string]any{"error": ae.Code, "message": ae.Message}
		if ae.Field != "" {
			body["field"] = ae.Field
		}
		for k, v := range ae.Extra {
			body[k] = v
		}
		writeJSON(w, status, body)
	case errors.Is(err, service.ErrPaymentNotCompleted):
		writeCodeError(w, http.StatusPaymentRequired, codePaymentFailed, msgPaymentFailed, "")
	case errors.As(err, &nf):
		writeCodeError(w, http.StatusNotFound, codeNotFound, "We couldn't find that "+nf.Entity+".", "")
	case errors.As(err, &fe), errors.Is(err, domain.ErrSettingsConflict):
		h.writeSettingsErr(w, err)
	default:
		h.log.Error("ads handler error", "err", err)
		writeCodeError(w, http.StatusInternalServerError, codeInternal, msgInternal, "")
	}
}

// adsService returns the ads service, or answers 503 when it is not wired.
func (h *Handler) adsService(w http.ResponseWriter) *service.AdsService {
	if h.ads == nil {
		writeCodeError(w, http.StatusServiceUnavailable, codeUnavailable, msgUnavailable, "")
	}
	return h.ads
}

// decodeAdBody reads a JSON body, answering 400 invalid_json on failure.
func decodeAdBody(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := decodeBody(r, v); err != nil {
		writeCodeError(w, http.StatusBadRequest, codeInvalidJSON, msgInvalidJSON, "")
		return false
	}
	return true
}

// adMember is the signed-in advertiser; ads always belong to a member.
func (h *Handler) adMember(w http.ResponseWriter, r *http.Request) (*domain.Member, bool) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return nil, false
	}
	if m == nil {
		writeCodeError(w, http.StatusUnauthorized, "unauthorized", msgAdSignIn, "")
		return nil, false
	}
	return m, true
}

// adStaffFrom describes the staff member for the ads service (a dev server
// without auth acts as a steward).
func adStaffFrom(m *domain.Member) service.AdStaff {
	if m == nil {
		return service.AdStaff{ID: "development", Name: "Development", Role: domain.RoleSteward}
	}
	return service.AdStaff{ID: m.ID, Name: m.DisplayName, Role: m.Role}
}

// adStaff runs the role check and the wiring check for a staff route.
func (h *Handler) adStaff(w http.ResponseWriter, r *http.Request, roles ...string) (*service.AdsService, service.AdStaff, bool) {
	m, ok := h.requireRole(w, r, roles...)
	if !ok {
		return nil, service.AdStaff{}, false
	}
	svc := h.adsService(w)
	return svc, adStaffFrom(m), svc != nil
}

// reviewerRoles review ads and sponsors (spec §4: curator, moderator).
var reviewerRoles = []string{domain.RoleCurator, domain.RoleModerator}

// ── public ──────────────────────────────────────────────────────────────────

// AdRateCard — GET /api/ads/rate-card (public).
func (h *Handler) AdRateCard(w http.ResponseWriter, r *http.Request) {
	if h.rateLimited(w, r, "adrate:"+clientIP(r), adRateCardPerMinute, time.Minute) {
		return
	}
	svc := h.adsService(w)
	if svc == nil {
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=60")
	writeJSON(w, http.StatusOK, svc.RateCard(r.Context()))
}

// AdQuote — POST /api/ads/quote (public, 60 per minute per client).
func (h *Handler) AdQuote(w http.ResponseWriter, r *http.Request) {
	if h.rateLimited(w, r, "adquote:"+clientKey(r), adQuotesPerMinute, time.Minute) {
		return
	}
	svc := h.adsService(w)
	if svc == nil {
		return
	}
	var in service.AdQuoteInput
	if !decodeAdBody(w, r, &in) {
		return
	}
	q, err := svc.Quote(r.Context(), in)
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, q)
}

// ConfirmAd — GET /api/ads/confirm?reference= (member): verifies the payment
// after the advertiser returns from Paystack.
func (h *Handler) ConfirmAd(w http.ResponseWriter, r *http.Request) {
	m, ok := h.adMember(w, r)
	if !ok {
		return
	}
	reference, ok := h.confirmReference(w, r)
	if !ok {
		return
	}
	svc := h.adsService(w)
	if svc == nil {
		return
	}
	c, err := svc.ConfirmForMember(r.Context(), m.ID, reference)
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"campaign": c})
}

// ── the advertiser's sponsors ───────────────────────────────────────────────

// MyAdSponsors — GET /api/me/ad-sponsors (member; contact details included).
func (h *Handler) MyAdSponsors(w http.ResponseWriter, r *http.Request) {
	m, ok := h.adMember(w, r)
	if !ok {
		return
	}
	svc := h.adsService(w)
	if svc == nil {
		return
	}
	out, err := svc.MySponsors(r.Context(), m.ID)
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// CreateAdSponsor — POST /api/me/ad-sponsors (member).
func (h *Handler) CreateAdSponsor(w http.ResponseWriter, r *http.Request) {
	h.saveAdSponsor(w, r, "")
}

// UpdateAdSponsor — PUT /api/me/ad-sponsors/{id} (member, owner, while
// pending or rejected).
func (h *Handler) UpdateAdSponsor(w http.ResponseWriter, r *http.Request) {
	h.saveAdSponsor(w, r, r.PathValue("id"))
}

func (h *Handler) saveAdSponsor(w http.ResponseWriter, r *http.Request, id string) {
	m, ok := h.adMember(w, r)
	if !ok {
		return
	}
	if h.rateLimited(w, r, "adsponsor:"+m.ID, adSubmitsPerHour*2, time.Hour) {
		return
	}
	svc := h.adsService(w)
	if svc == nil {
		return
	}
	var in service.AdSponsorInput
	if !decodeAdBody(w, r, &in) {
		return
	}
	var (
		out *domain.AdSponsorOwnerView
		err error
	)
	status := http.StatusCreated
	if id == "" {
		out, err = svc.CreateSponsor(r.Context(), m.ID, in)
	} else {
		status = http.StatusOK
		out, err = svc.UpdateSponsor(r.Context(), m.ID, id, in)
	}
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, status, out)
}

// ── the advertiser's campaigns ──────────────────────────────────────────────

// SubmitAd — POST /api/me/ads (member, 10 per hour).
func (h *Handler) SubmitAd(w http.ResponseWriter, r *http.Request) {
	m, ok := h.adMember(w, r)
	if !ok {
		return
	}
	if h.rateLimited(w, r, "adsubmit:"+m.ID, adSubmitsPerHour, time.Hour) {
		return
	}
	svc := h.adsService(w)
	if svc == nil {
		return
	}
	var in service.AdSubmitInput
	if !decodeAdBody(w, r, &in) {
		return
	}
	email, ok := h.receiptEmail(w, in.Email, m)
	if !ok {
		return
	}
	c, err := svc.Submit(r.Context(), m.ID, email, in)
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, c)
}

// MyAds — GET /api/me/ads (member).
func (h *Handler) MyAds(w http.ResponseWriter, r *http.Request) {
	m, ok := h.adMember(w, r)
	if !ok {
		return
	}
	svc := h.adsService(w)
	if svc == nil {
		return
	}
	out, err := svc.MyCampaigns(r.Context(), m.ID)
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// MyAd — GET /api/me/ads/{id} (member, owner): the campaign and its daily
// delivery.
func (h *Handler) MyAd(w http.ResponseWriter, r *http.Request) {
	m, ok := h.adMember(w, r)
	if !ok {
		return
	}
	svc := h.adsService(w)
	if svc == nil {
		return
	}
	c, err := svc.MyCampaign(r.Context(), m.ID, r.PathValue("id"))
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, c)
}

// CheckoutAd — POST /api/me/ads/{id}/checkout (member, owner, 10 per hour).
func (h *Handler) CheckoutAd(w http.ResponseWriter, r *http.Request) {
	m, ok := h.adMember(w, r)
	if !ok {
		return
	}
	if h.rateLimited(w, r, "adpay:"+m.ID, adCheckoutsPerHour, time.Hour) {
		return
	}
	svc := h.adsService(w)
	if svc == nil {
		return
	}
	var in struct {
		Email string `json:"email"`
	}
	if r.ContentLength != 0 && !decodeAdBody(w, r, &in) {
		return
	}
	out, err := svc.Checkout(r.Context(), m.ID, r.PathValue("id"), in.Email)
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// reasonBody is the {"reason": "…"} body of cancel and staff actions.
type reasonBody struct {
	Reason string `json:"reason"`
}

// CancelAd — POST /api/me/ads/{id}/cancel (member, owner).
func (h *Handler) CancelAd(w http.ResponseWriter, r *http.Request) {
	m, ok := h.adMember(w, r)
	if !ok {
		return
	}
	svc := h.adsService(w)
	if svc == nil {
		return
	}
	var in reasonBody
	if r.ContentLength != 0 && !decodeAdBody(w, r, &in) {
		return
	}
	c, err := svc.Cancel(r.Context(), m.ID, r.PathValue("id"), in.Reason)
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, c)
}

// ── staff: campaigns ────────────────────────────────────────────────────────

// AdminAds — GET /api/admin/ads?status=&political=1&placement=&page= (reviewer).
func (h *Handler) AdminAds(w http.ResponseWriter, r *http.Request) {
	svc, _, ok := h.adStaff(w, r, reviewerRoles...)
	if !ok {
		return
	}
	q := r.URL.Query()
	f := domain.AdFilter{Status: q.Get("status"), Placement: q.Get("placement")}
	if p := q.Get("political"); p == "1" || p == "0" {
		political := p == "1"
		f.Political = &political
	}
	f.Page, _ = strconv.Atoi(q.Get("page"))
	out, err := svc.AdminCampaigns(r.Context(), f)
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// AdminAd — GET /api/admin/ads/{id} (reviewer).
func (h *Handler) AdminAd(w http.ResponseWriter, r *http.Request) {
	svc, _, ok := h.adStaff(w, r, reviewerRoles...)
	if !ok {
		return
	}
	out, err := svc.AdminCampaign(r.Context(), r.PathValue("id"))
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// AdminApproveAd — POST /api/admin/ads/{id}/approve (reviewer for
// commercial ads; two curators or a steward for political ads).
func (h *Handler) AdminApproveAd(w http.ResponseWriter, r *http.Request) {
	svc, staff, ok := h.adStaff(w, r, reviewerRoles...)
	if !ok {
		return
	}
	var in service.AdApproveInput
	if !decodeAdBody(w, r, &in) {
		return
	}
	out, err := svc.Approve(r.Context(), r.PathValue("id"), in, staff)
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// adReasonAction is a staff action on one campaign that takes a reason.
type adReasonAction func(svc *service.AdsService, ctx context.Context, id, reason string, staff service.AdStaff) (*service.AdCampaignAdmin, error)

// adminAdAction runs a reviewer's reasoned action.
func (h *Handler) adminAdAction(w http.ResponseWriter, r *http.Request, act adReasonAction) {
	svc, staff, ok := h.adStaff(w, r, reviewerRoles...)
	if !ok {
		return
	}
	var in reasonBody
	if !decodeAdBody(w, r, &in) {
		return
	}
	out, err := act(svc, r.Context(), r.PathValue("id"), in.Reason, staff)
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// AdminRejectAd — POST /api/admin/ads/{id}/reject (reviewer).
func (h *Handler) AdminRejectAd(w http.ResponseWriter, r *http.Request) {
	h.adminAdAction(w, r, (*service.AdsService).Reject)
}

// AdminPauseAd — POST /api/admin/ads/{id}/pause (reviewer).
func (h *Handler) AdminPauseAd(w http.ResponseWriter, r *http.Request) {
	h.adminAdAction(w, r, (*service.AdsService).Pause)
}

// AdminResumeAd — POST /api/admin/ads/{id}/resume (reviewer).
func (h *Handler) AdminResumeAd(w http.ResponseWriter, r *http.Request) {
	h.adminAdAction(w, r, (*service.AdsService).Resume)
}

// AdminRemoveAd — POST /api/admin/ads/{id}/remove (reviewer).
func (h *Handler) AdminRemoveAd(w http.ResponseWriter, r *http.Request) {
	h.adminAdAction(w, r, (*service.AdsService).Remove)
}

// AdminRefundAd — POST /api/admin/ads/{id}/refund (steward).
func (h *Handler) AdminRefundAd(w http.ResponseWriter, r *http.Request) {
	svc, staff, ok := h.adStaff(w, r, domain.RoleSteward)
	if !ok {
		return
	}
	var in service.AdRefundInput
	if !decodeAdBody(w, r, &in) {
		return
	}
	out, err := svc.ManualRefund(r.Context(), r.PathValue("id"), in, staff)
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// AdminKillAds — POST /api/admin/ads/kill (curator): pauses every running or
// scheduled political ad, or every ad of one sponsor.
func (h *Handler) AdminKillAds(w http.ResponseWriter, r *http.Request) {
	svc, staff, ok := h.adStaff(w, r, domain.RoleCurator)
	if !ok {
		return
	}
	var in service.AdKillInput
	if !decodeAdBody(w, r, &in) {
		return
	}
	n, err := svc.Kill(r.Context(), in, staff)
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"paused": n})
}

// ── staff: sponsors ─────────────────────────────────────────────────────────

// AdminAdSponsors — GET /api/admin/ad-sponsors?status=&kind= (reviewer).
func (h *Handler) AdminAdSponsors(w http.ResponseWriter, r *http.Request) {
	svc, _, ok := h.adStaff(w, r, reviewerRoles...)
	if !ok {
		return
	}
	q := r.URL.Query()
	out, err := svc.AdminSponsors(r.Context(), domain.AdSponsorFilter{Status: q.Get("status"), Kind: q.Get("kind")})
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// AdminVerifyAdSponsor — POST /api/admin/ad-sponsors/{id}/verify (curator).
func (h *Handler) AdminVerifyAdSponsor(w http.ResponseWriter, r *http.Request) {
	h.reviewAdSponsor(w, r, service.SponsorActionVerify)
}

// AdminRejectAdSponsor — POST /api/admin/ad-sponsors/{id}/reject (curator).
func (h *Handler) AdminRejectAdSponsor(w http.ResponseWriter, r *http.Request) {
	h.reviewAdSponsor(w, r, service.SponsorActionReject)
}

// AdminSuspendAdSponsor — POST /api/admin/ad-sponsors/{id}/suspend
// (curator); the sponsor's running ads are paused.
func (h *Handler) AdminSuspendAdSponsor(w http.ResponseWriter, r *http.Request) {
	h.reviewAdSponsor(w, r, service.SponsorActionSuspend)
}

func (h *Handler) reviewAdSponsor(w http.ResponseWriter, r *http.Request, action string) {
	svc, staff, ok := h.adStaff(w, r, domain.RoleCurator)
	if !ok {
		return
	}
	var in struct {
		Note string `json:"note"`
	}
	if r.ContentLength != 0 && !decodeAdBody(w, r, &in) {
		return
	}
	out, err := svc.ReviewSponsor(r.Context(), r.PathValue("id"), action, in.Note, service.AuditActor{ID: staff.ID, Name: staff.Name})
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// ── staff: settings ─────────────────────────────────────────────────────────

// AdminAdSettings — GET /api/admin/settings/ads (curator): the settings, the
// observed forecast and whether the serving token secret is set.
func (h *Handler) AdminAdSettings(w http.ResponseWriter, r *http.Request) {
	svc, _, ok := h.adStaff(w, r, domain.RoleCurator)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, svc.AdminSettings(r.Context()))
}

// AdminSaveAdSettings — PUT /api/admin/settings/ads (steward): the full
// settings with the version read, plus a reason.
func (h *Handler) AdminSaveAdSettings(w http.ResponseWriter, r *http.Request) {
	svc, _, ok := h.adStaff(w, r, domain.RoleSteward)
	if !ok {
		return
	}
	var in service.AdSettingsInput
	if !decodeAdBody(w, r, &in) {
		return
	}
	out, err := svc.SaveAdSettings(r.Context(), in, auditActor(r))
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// AdminResolveAdRefund — POST /api/admin/ads/{id}/refunds/{refundId}
// (steward): mark a refund that needed a person processed or failed after
// checking Paystack.
func (h *Handler) AdminResolveAdRefund(w http.ResponseWriter, r *http.Request) {
	svc, staff, ok := h.adStaff(w, r, domain.RoleSteward)
	if !ok {
		return
	}
	var in service.AdResolveRefundInput
	if !decodeAdBody(w, r, &in) {
		return
	}
	out, err := svc.ResolveRefund(r.Context(), r.PathValue("id"), r.PathValue("refundId"), in, staff)
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// AdminAdDocument — GET /api/admin/ads/{id}/documents/approval (reviewer):
// the campaign's regulator approval letter.
func (h *Handler) AdminAdDocument(w http.ResponseWriter, r *http.Request) {
	h.adDocument(w, r, func(svc *service.AdsService) (string, error) {
		return svc.CampaignDocument(r.Context(), r.PathValue("id"))
	})
}

// AdminAdSponsorDocument — GET /api/admin/ad-sponsors/{id}/documents/{kind}
// (reviewer): the sponsor's ID document (id) or EC authorisation (ec).
func (h *Handler) AdminAdSponsorDocument(w http.ResponseWriter, r *http.Request) {
	h.adDocument(w, r, func(svc *service.AdsService) (string, error) {
		return svc.SponsorDocument(r.Context(), r.PathValue("id"), r.PathValue("kind"))
	})
}

// adDocument streams a private document reached through an ad or sponsor,
// so ad reviewers (moderators included) open only documents attached to
// what they review. Every read is audited by the private-upload service.
func (h *Handler) adDocument(w http.ResponseWriter, r *http.Request, find func(*service.AdsService) (string, error)) {
	m, ok := h.requireRole(w, r, reviewerRoles...)
	if !ok {
		return
	}
	svc := h.adsService(w)
	if svc == nil {
		return
	}
	upload, err := find(svc)
	if err != nil {
		h.writeAdErr(w, err)
		return
	}
	f, err := h.rights.PrivateUploads.OpenForStaff(r.Context(), m, upload)
	h.writePrivateFile(w, f, err)
}
