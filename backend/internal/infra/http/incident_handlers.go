package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── incidents: community safety (auto-published; curators transition) ────────

// Incidents lists published safety incidents, newest first, with optional
// ?status=, ?category= and ?town= filters.
func (h *Handler) Incidents(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	items, err := h.svc.Incidents(r.Context(), service.IncidentFilters{
		Status:   q.Get("status"),
		Category: q.Get("category"),
		Town:     q.Get("town"),
	})
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// Incident fetches one published incident by slug.
func (h *Handler) Incident(w http.ResponseWriter, r *http.Request) {
	l, err := h.svc.Incident(r.Context(), r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, l)
}

// SubmitIncident files a safety report as the signed-in member. The incident
// goes live immediately (time-critical); curators verify afterwards.
func (h *Handler) SubmitIncident(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if h.rateLimited(w, r, "incident:"+clientKey(r), 10, time.Hour) {
		return
	}
	var in service.IncidentInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if m == nil {
		m = &domain.Member{ID: "m-akua"} // dev convenience only — never reached when AUTH_REQUIRED=true
	}
	l, err := h.svc.SubmitIncident(r.Context(), m, in)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, l)
}

// AdminIncidentStatus advances an incident's lifecycle (curator/steward only).
func (h *Handler) AdminIncidentStatus(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, "curator", "moderator")
	if !ok {
		return
	}
	var in struct {
		Status string `json:"status"`
		Note   string `json:"note"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if m == nil {
		m = &domain.Member{ID: "m-nana", Role: domain.RoleSteward} // dev convenience only — never reached when AUTH_REQUIRED=true
	}
	if err := h.svc.TransitionIncident(r.Context(), r.PathValue("id"), m, in.Status, in.Note); err != nil {
		var fb *domain.ForbiddenError
		if errors.As(err, &fb) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": in.Status})
}
