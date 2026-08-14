package http

import (
	"net/http"
	"strings"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

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
		fail(w, http.StatusBadRequest, err.Error())
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
func (h *Handler) BusinessCommerceStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"enabled": h.commerce.CommerceEnabled(r.Context(), r.PathValue("slug"))})
}
func (h *Handler) AdminBusinessVerifications(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator); !ok {
		return
	}
	rows, err := h.commerce.AllVerifications(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
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
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (h *Handler) StartCommerceOrder(w http.ResponseWriter, r *http.Request) {
	var in service.CheckoutInput
	if decodeBody(r, &in) != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	o, auth, access, err := h.commerce.StartOrder(r.Context(), r.PathValue("slug"), currentMember(r), in)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"order": o, "authorizationUrl": auth, "accessCode": access, "reference": o.Reference, "simulated": o.Simulated})
}
func (h *Handler) ConfirmCommerceOrder(w http.ResponseWriter, r *http.Request) {
	ref := strings.TrimSpace(r.URL.Query().Get("reference"))
	if ref == "" {
		fail(w, http.StatusBadRequest, "reference is required")
		return
	}
	o, err := h.commerce.ConfirmOrder(r.Context(), ref)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, o)
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
	if _, ok := h.requireRole(w, r, domain.RoleCurator); !ok {
		return
	}
	rows, err := h.commerce.AdminOrders(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
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
		fail(w, http.StatusBadRequest, err.Error())
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
		fail(w, http.StatusBadRequest, err.Error())
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
		h.handleErr(w, err)
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
		h.handleErr(w, err)
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
		h.handleErr(w, err)
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
		h.handleErr(w, err)
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
		h.handleErr(w, err)
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
		h.handleErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
