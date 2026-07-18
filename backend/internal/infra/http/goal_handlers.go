package http

import (
	"errors"
	"net/http"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── town goals (civic accountability) ────────────────────────────────────────
//
// A goal is a collective commitment for the town, set for a period and later
// judged achieved/missed by an accountability officer. Curators set goals; the
// officer records the verdict — a deliberate separation of duties.

// Goals lists every town goal (public), each with its status computed for now.
func (h *Handler) Goals(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.Goals(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// AdminGoals lists every goal for the back-office (curator).
func (h *Handler) AdminGoals(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator); !ok {
		return
	}
	items, err := h.svc.AdminGoals(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// AdminCreateGoal sets a new goal (curator).
func (h *Handler) AdminCreateGoal(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, domain.RoleCurator)
	if !ok {
		return
	}
	var in service.GoalInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	g, err := h.svc.CreateGoal(r.Context(), *orDevSteward(m), in)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, g)
}

// AdminUpdateGoal edits a goal's fields (curator). POST (not PATCH) because the
// CORS policy allows GET/POST/DELETE only.
func (h *Handler) AdminUpdateGoal(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator); !ok {
		return
	}
	var in service.GoalInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	g, err := h.svc.UpdateGoal(r.Context(), r.PathValue("id"), in)
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, g)
}

// AdminDeleteGoal removes a goal (curator).
func (h *Handler) AdminDeleteGoal(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator); !ok {
		return
	}
	if err := h.svc.DeleteGoal(r.Context(), r.PathValue("id")); err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// AdminReviewGoal records the achieved/missed verdict — the manual accountability
// check — gated to the accountability officer role (stewards pass automatically).
func (h *Handler) AdminReviewGoal(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, domain.RoleAccountabilityOfficer)
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
	g, err := h.svc.ReviewGoal(r.Context(), r.PathValue("id"), in.Status, in.Note, *orDevSteward(m))
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, g)
}

// orDevSteward supplies a dev-mode member when AUTH_REQUIRED is false and
// requireRole returned a nil member (mirrors AdminCreateDirective). Never used in
// production, where requireRole yields a real authenticated member.
func orDevSteward(m *domain.Member) *domain.Member {
	if m == nil {
		return &domain.Member{ID: domain.DevDemoModeratorID, Role: domain.RoleSteward}
	}
	return m
}
