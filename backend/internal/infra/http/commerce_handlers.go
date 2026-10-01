package http

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// commerceErr answers a marketplace-service error: business-rule refusals
// (domain.ValidationError) are 400 with their message; everything else goes
// through the shared mapping (404/403/…, 500 for the unexpected).
func (h *Handler) commerceErr(w http.ResponseWriter, err error) {
	var ve *domain.ValidationError
	if errors.As(err, &ve) {
		fail(w, http.StatusBadRequest, ve.Error())
		return
	}
	h.handleErr(w, err)
}

// auditStaffRead records a staff read of private commerce records (KYC
// packs, buyer contact details) so access can be reviewed later.
func (h *Handler) auditStaffRead(r *http.Request, m *domain.Member, what string, rows int) {
	if h.log == nil {
		return
	}
	staffID, role := "dev", ""
	if m != nil {
		staffID, role = m.ID, m.Role
	}
	h.log.Info("audit: staff read", "what", what, "staffId", staffID, "role", role, "rows", rows, "path", r.URL.Path)
}

// orderView is what an order looks like outside the seller's back office:
// the lines, amounts and status. The buyer's contact details are included
// only for the buyer themselves or the seller (contract K20); the platform
// and affiliate split never is.
type orderView struct {
	ID                 string             `json:"id"`
	Reference          string             `json:"reference"`
	ListingID          string             `json:"listingId"`
	ListingSlug        string             `json:"listingSlug"`
	BusinessName       string             `json:"businessName"`
	Fulfilment         string             `json:"fulfilment"`
	Lines              []domain.OrderLine `json:"lines"`
	CouponCode         string             `json:"couponCode,omitempty"`
	AffiliateCode      string             `json:"affiliateCode,omitempty"`
	SubtotalPesewas    int64              `json:"subtotalPesewas"`
	DiscountPesewas    int64              `json:"discountPesewas"`
	AmountPesewas      int64              `json:"amountPesewas"`
	Status             string             `json:"status"`
	Simulated          bool               `json:"simulated,omitempty"`
	CreatedAt          string             `json:"createdAt"`
	PaidAt             string             `json:"paidAt,omitempty"`
	UpdatedAt          string             `json:"updatedAt"`
	BuyerName          string             `json:"buyerName,omitempty"`
	BuyerEmail         string             `json:"buyerEmail,omitempty"`
	BuyerPhone         string             `json:"buyerPhone,omitempty"`
	DeliveryAddress    string             `json:"deliveryAddress,omitempty"`
	Note               string             `json:"note,omitempty"`
	BuyerContactHidden bool               `json:"buyerContactHidden,omitempty"`
}

func newOrderView(o domain.CommerceOrder, withContact bool) orderView {
	v := orderView{ID: o.ID, Reference: o.Reference, ListingID: o.ListingID, ListingSlug: o.ListingSlug, BusinessName: o.BusinessName, Fulfilment: o.Fulfilment, Lines: o.Lines, CouponCode: o.CouponCode, AffiliateCode: o.AffiliateCode, SubtotalPesewas: o.SubtotalPesewas, DiscountPesewas: o.DiscountPesewas, AmountPesewas: o.AmountPesewas, Status: o.Status, Simulated: o.Simulated, CreatedAt: o.CreatedAt, PaidAt: o.PaidAt, UpdatedAt: o.UpdatedAt, BuyerContactHidden: o.BuyerContactHidden}
	if withContact {
		v.BuyerName, v.BuyerEmail, v.BuyerPhone, v.DeliveryAddress, v.Note = o.BuyerName, o.BuyerEmail, o.BuyerPhone, o.DeliveryAddress, o.Note
	}
	return v
}

func (h *Handler) SubmitBusinessVerification(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok || m == nil {
		return
	}
	var in service.BusinessVerificationInput
	if decodeBody(r, &in) != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	v, err := h.commerce.SubmitVerification(r.Context(), m, r.PathValue("id"), in)
	if err != nil {
		h.commerceErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}
func (h *Handler) BusinessVerification(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok || m == nil {
		return
	}
	v, err := h.commerce.Verification(r.Context(), m, r.PathValue("id"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// BusinessCommerceStatus — GET /api/businesses/{slug}/commerce-status:
// {enabled, seller?} where seller is the verified legal identity (K19).
func (h *Handler) BusinessCommerceStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.commerce.Status(r.Context(), r.PathValue("slug")))
}
func (h *Handler) AdminBusinessVerifications(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, domain.RoleCurator)
	if !ok {
		return
	}
	rows, err := h.commerce.AllVerifications(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	h.auditStaffRead(r, m, "business-verifications", len(rows))
	writeJSON(w, http.StatusOK, rows)
}
func (h *Handler) AdminReviewBusinessVerification(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, domain.RoleCurator)
	if !ok {
		return
	}
	if m == nil {
		m = &domain.Member{ID: "dev-steward", Role: domain.RoleSteward}
	}
	var in struct {
		Status string `json:"status"`
		Note   string `json:"note"`
	}
	if decodeBody(r, &in) != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	v, err := h.commerce.ReviewVerification(r.Context(), m, r.PathValue("id"), in.Status, in.Note)
	if h.paymentsUnavailable(w, err) {
		return
	}
	if err != nil {
		h.commerceErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// StartCommerceOrder — POST /api/businesses/{slug}/orders. Guest checkout is
// allowed, so it is rate-limited per client. `affiliateApplied` (present when
// an affiliate code was sent) tells the client whether the code earned
// attribution; when false the client can forget its stored code.
func (h *Handler) StartCommerceOrder(w http.ResponseWriter, r *http.Request) {
	if h.rateLimited(w, r, "order:start:"+clientKey(r), 60, time.Hour) {
		return
	}
	var in service.CheckoutInput
	if decodeBody(r, &in) != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	o, auth, access, err := h.commerce.StartOrder(r.Context(), r.PathValue("slug"), currentMember(r), in)
	if err != nil {
		h.commerceErr(w, err)
		return
	}
	out := map[string]any{"order": newOrderView(*o, true), "authorizationUrl": auth, "accessCode": access, "reference": o.Reference, "simulated": o.Simulated}
	if strings.TrimSpace(in.AffiliateCode) != "" {
		out["affiliateApplied"] = o.AffiliateCode != ""
	}
	writeJSON(w, http.StatusCreated, out)
}

// ConfirmCommerceOrder — GET /api/orders/confirm?reference=. Public (it backs
// the Paystack return page), so the buyer's contact details are included
// only when the caller is the buyer or the seller (contract K20).
func (h *Handler) ConfirmCommerceOrder(w http.ResponseWriter, r *http.Request) {
	ref := strings.TrimSpace(r.URL.Query().Get("reference"))
	if ref == "" {
		fail(w, http.StatusBadRequest, "reference is required")
		return
	}
	o, err := h.commerce.ConfirmOrder(r.Context(), ref)
	if err != nil {
		h.commerceErr(w, err)
		return
	}
	isBuyer, isSeller := h.commerce.BuyerContactVisible(r.Context(), o, currentMember(r))
	if isSeller {
		writeJSON(w, http.StatusOK, newOrderView(service.SellerOrderView(*o, time.Now().UTC()), true))
		return
	}
	writeJSON(w, http.StatusOK, newOrderView(*o, isBuyer))
}
func (h *Handler) MyCommerceOrders(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok || m == nil {
		return
	}
	rows, err := h.commerce.MyOrders(r.Context(), m.ID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, rows)
}
func (h *Handler) BusinessCommerceOrders(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok || m == nil {
		return
	}
	rows, err := h.commerce.BusinessOrders(r.Context(), m, r.PathValue("id"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, rows)
}
func (h *Handler) AdminCommerceOrders(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, domain.RoleCurator)
	if !ok {
		return
	}
	rows, err := h.commerce.AdminOrders(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	h.auditStaffRead(r, m, "commerce-orders", len(rows))
	writeJSON(w, http.StatusOK, rows)
}
func (h *Handler) SetCommerceOrderStatus(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok || m == nil {
		return
	}
	var in struct {
		Status string `json:"status"`
	}
	if decodeBody(r, &in) != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if err := h.commerce.SetOrderStatus(r.Context(), m, r.PathValue("id"), r.PathValue("orderId"), in.Status); err != nil {
		h.commerceErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) BusinessCoupons(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok || m == nil {
		return
	}
	listingID := r.PathValue("id")
	if r.Method == http.MethodGet {
		rows, err := h.commerce.Coupons(r.Context(), m, listingID)
		if err != nil {
			h.handleErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, rows)
		return
	}
	var c domain.BusinessCoupon
	if decodeBody(r, &c) != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	saved, err := h.commerce.SaveCoupon(r.Context(), m, listingID, c)
	if err != nil {
		h.commerceErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, saved)
}
func (h *Handler) DeleteBusinessCoupon(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok || m == nil {
		return
	}
	if err := h.commerce.DeleteCoupon(r.Context(), m, r.PathValue("id"), r.PathValue("couponId")); err != nil {
		h.handleErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) AdminCommercePromotions(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, domain.RoleSteward)
	if !ok {
		return
	}
	if r.Method == http.MethodGet {
		rows, err := h.commerce.AllPromotions(r.Context(), m)
		if err != nil {
			h.handleErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, rows)
		return
	}
	var c domain.BusinessCoupon
	if decodeBody(r, &c) != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	saved, err := h.commerce.SavePlatformPromotion(r.Context(), m, c)
	if err != nil {
		h.commerceErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, saved)
}
func (h *Handler) AffiliateProgrammes(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok || m == nil {
		return
	}
	lid := r.PathValue("id")
	if r.Method == http.MethodGet {
		rows, err := h.commerce.AffiliateProgrammes(r.Context(), m, lid)
		if err != nil {
			h.handleErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, rows)
		return
	}
	var p domain.AffiliateProgramme
	if decodeBody(r, &p) != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	saved, err := h.commerce.SaveAffiliateProgramme(r.Context(), m, lid, p)
	if err != nil {
		h.commerceErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, saved)
}
func (h *Handler) Affiliates(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok || m == nil {
		return
	}
	lid := r.PathValue("id")
	if r.Method == http.MethodGet {
		rows, err := h.commerce.Affiliates(r.Context(), m, lid, r.URL.Query().Get("programmeId"))
		if err != nil {
			h.handleErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, rows)
		return
	}
	var a domain.Affiliate
	if decodeBody(r, &a) != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	saved, err := h.commerce.SaveAffiliate(r.Context(), m, lid, a)
	if err != nil {
		h.commerceErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, saved)
}
func (h *Handler) AffiliateConversions(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok || m == nil {
		return
	}
	rows, err := h.commerce.AffiliateConversions(r.Context(), m, r.PathValue("id"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, rows)
}
func (h *Handler) AdminAffiliateProgrammes(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, domain.RoleSteward)
	if !ok {
		return
	}
	if r.Method == http.MethodGet {
		rows, err := h.commerce.AffiliateProgrammes(r.Context(), m, "*")
		if err != nil {
			h.handleErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, rows)
		return
	}
	var p domain.AffiliateProgramme
	if decodeBody(r, &p) != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	saved, err := h.commerce.SaveAffiliateProgramme(r.Context(), m, "*", p)
	if err != nil {
		h.commerceErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, saved)
}
func (h *Handler) AdminAffiliates(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, domain.RoleSteward)
	if !ok {
		return
	}
	if r.Method == http.MethodGet {
		rows, err := h.commerce.Affiliates(r.Context(), m, "*", r.URL.Query().Get("programmeId"))
		if err != nil {
			h.handleErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, rows)
		return
	}
	var a domain.Affiliate
	if decodeBody(r, &a) != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	saved, err := h.commerce.SaveAffiliate(r.Context(), m, "*", a)
	if err != nil {
		h.commerceErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, saved)
}
func (h *Handler) AdminAffiliateConversions(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, domain.RoleSteward)
	if !ok {
		return
	}
	rows, err := h.commerce.AffiliateConversions(r.Context(), m, "*")
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, rows)
}
func (h *Handler) AdminAffiliateConversionStatus(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, domain.RoleSteward)
	if !ok {
		return
	}
	var in struct {
		Status string `json:"status"`
	}
	if decodeBody(r, &in) != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if err := h.commerce.SetAffiliateConversionStatus(r.Context(), m, r.PathValue("id"), in.Status); err != nil {
		h.commerceErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
