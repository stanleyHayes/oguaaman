package http

import (
	"net/http"

	"github.com/oguaa/backend/internal/service"
)

// ── subscription plans catalog (Creator plan §5) ─────────────────────────────

// Plans is the public, active-only catalog — the creator Grow page and the
// portal subscribe panel render it so prices are never hardcoded client-side.
func (h *Handler) Plans(w http.ResponseWriter, r *http.Request) {
	plans, err := h.svc.Plans(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, plans)
}

func (h *Handler) AdminPlans(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator"); !ok {
		return
	}
	plans, err := h.svc.AdminPlans(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, plans)
}

func (h *Handler) AdminCreatePlan(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator"); !ok {
		return
	}
	var in service.PlanInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	p, err := h.svc.CreatePlan(r.Context(), in)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

func (h *Handler) AdminUpdatePlan(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator"); !ok {
		return
	}
	var in service.PlanInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	p, err := h.svc.UpdatePlan(r.Context(), r.PathValue("id"), in)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (h *Handler) AdminDeletePlan(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator"); !ok {
		return
	}
	if err := h.svc.DeletePlan(r.Context(), r.PathValue("id")); err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
