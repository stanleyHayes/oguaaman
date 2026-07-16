package http

import (
	"net/http"
)

// ── creator platform (Creator Platform plan §3/§4) ──────────────────────────

// SetMyCreatorTypes — POST /api/me/creator-types. The signed-in member declares
// their creator kinds (the "become a creator" upgrade); empty list opts out.
func (h *Handler) SetMyCreatorTypes(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	var in struct {
		CreatorTypes []string `json:"creatorTypes"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	updated, err := h.svc.SetCreatorTypes(r.Context(), m.ID, in.CreatorTypes)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// CreatorOverview — GET /api/creator/overview. The signed-in creator's
// dashboard KPIs: listings by status, live promotions/subscription, earnings.
func (h *Handler) CreatorOverview(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	ov, err := h.creator.Overview(r.Context(), m.ID)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, ov)
}

// CreatorEarnings — GET /api/creator/earnings. Itemized ticket sales and
// pledges for the signed-in creator's events and projects.
func (h *Handler) CreatorEarnings(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	earnings, err := h.creator.Earnings(r.Context(), m.ID)
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, earnings)
}
