package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── fundraising campaigns (Creator Monetization) ─────────────────────────────

// Campaigns — GET /api/campaigns. The public wall of approved, member-created
// fundraising campaigns.
func (h *Handler) Campaigns(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.Campaigns(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// MyCampaigns — GET /api/me/campaigns. The signed-in creator's own campaigns,
// any status (newest first).
func (h *Handler) MyCampaigns(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	items, err := h.svc.MyCampaigns(r.Context(), m.ID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// CreateCampaign — POST /api/campaigns. Starts a fundraising campaign. Requires
// a signed-in member with an active creator subscription; a first campaign
// enters moderation, subsequent ones auto-publish (service-enforced).
func (h *Handler) CreateCampaign(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "campaign:"+clientKey(r), 20, time.Hour) {
		return
	}
	var in service.CampaignInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	l, err := h.svc.CreateCampaign(r.Context(), m, in)
	if err != nil {
		var fb *domain.ForbiddenError
		if errors.As(err, &fb) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error()) // validation messages are user-facing
		return
	}
	writeJSON(w, http.StatusCreated, l)
}
