package http

import (
	"errors"
	"net/http"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── Oguaa Outside — verified agents (slice 1) ────────────────────────────────

// AgentServicesList returns the service catalogue (public) — used for the
// directory filters and the application form.
func (h *Handler) AgentServicesList(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, domain.AgentServices)
}

// Agents lists the public directory of verified agents. ?service= and ?area=
// filter it.
func (h *Handler) Agents(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	items, err := h.svc.Agents(r.Context(), q.Get("service"), q.Get("area"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// Agent fetches one verified agent by slug (public, redacted).
func (h *Handler) Agent(w http.ResponseWriter, r *http.Request) {
	a, err := h.svc.Agent(r.Context(), r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

// MyAgent returns the caller's own agent profile in full (404 if none yet).
func (h *Handler) MyAgent(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	a, err := h.svc.MyAgent(r.Context(), orDevMember(m).ID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

// ApplyAsAgent creates the caller's pending agent profile (background-check
// application: ID + guarantor + bond).
func (h *Handler) ApplyAsAgent(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	var in service.AgentInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	a, err := h.svc.ApplyAsAgent(r.Context(), *orDevMember(m), in)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

// UpdateMyAgent edits the caller's own agent profile.
func (h *Handler) UpdateMyAgent(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	var in service.AgentInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	a, err := h.svc.UpdateMyAgent(r.Context(), orDevMember(m).ID, in)
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, a)
}

// AdminAgents lists every agent for the back-office; ?status=pending drives the
// vetting queue. Vetting officers + stewards only.
func (h *Handler) AdminAgents(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleVettingOfficer); !ok {
		return
	}
	items, err := h.svc.AdminAgents(r.Context(), r.URL.Query().Get("status"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// AdminVerifyAgent approves an agent after the background check (Vetting officer).
func (h *Handler) AdminVerifyAgent(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, domain.RoleVettingOfficer)
	if !ok {
		return
	}
	a, err := h.svc.VerifyAgent(r.Context(), r.PathValue("id"), *orDevSteward(m))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

// AdminRejectAgent declines an application with a reason (Vetting officer).
func (h *Handler) AdminRejectAgent(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, domain.RoleVettingOfficer)
	if !ok {
		return
	}
	var in struct {
		Reason string `json:"reason"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	a, err := h.svc.RejectAgent(r.Context(), r.PathValue("id"), in.Reason, *orDevSteward(m))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

// AdminSuspendAgent takes a verified agent off the directory (Vetting officer).
func (h *Handler) AdminSuspendAgent(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, domain.RoleVettingOfficer)
	if !ok {
		return
	}
	a, err := h.svc.SuspendAgent(r.Context(), r.PathValue("id"), *orDevSteward(m))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

// orDevMember supplies a dev-mode applicant when AUTH_REQUIRED is false and
// requireAuth returned a nil member. Never reached in production.
func orDevMember(m *domain.Member) *domain.Member {
	if m == nil {
		return &domain.Member{ID: domain.DevDemoMemberID, DisplayName: "Demo Member"}
	}
	return m
}
