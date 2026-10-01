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

// AdminGoals lists every goal for the back-office. Curators (who set goals) and
// accountability officers (who record the verdict) both need the list.
func (h *Handler) AdminGoals(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator, domain.RoleAccountabilityOfficer); !ok {
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
		h.failInputOr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, g)
}

// AdminUpdateGoal edits a goal's fields (curator). POST (not PATCH) because the
// CORS policy allows GET/POST/DELETE only. A goal with a recorded verdict can
// only be edited by a steward (403 otherwise).
func (h *Handler) AdminUpdateGoal(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, domain.RoleCurator)
	if !ok {
		return
	}
	var in service.GoalInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	g, err := h.svc.UpdateGoal(r.Context(), *orDevSteward(m), r.PathValue("id"), in)
	if err != nil {
		h.failInputOr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, g)
}

// AdminDeleteGoal removes a goal (curator). A goal with a recorded verdict can
// only be removed by a steward (403 otherwise); every delete is audited.
func (h *Handler) AdminDeleteGoal(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, domain.RoleCurator)
	if !ok {
		return
	}
	if err := h.svc.DeleteGoal(r.Context(), *orDevSteward(m), r.PathValue("id")); err != nil {
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
		h.failInputOr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, g)
}

// failInputOr answers a service error: a validation error is the caller's to fix
// and is echoed as 400; everything else goes through handleErr (404/403 mapped,
// internal errors logged and replaced by a generic 500) so database and driver
// details never reach the caller.
func (h *Handler) failInputOr(w http.ResponseWriter, err error) {
	var ve *domain.ValidationError
	if errors.As(err, &ve) {
		fail(w, http.StatusBadRequest, ve.Error())
		return
	}
	h.handleErr(w, err)
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
