package http

import (
	"errors"
	"net/http"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── admin: manage the civic pledges (behaviours) ─────────────────────────────

// AdminCivicBehaviours lists every pledge for the dashboard (curator).
func (h *Handler) AdminCivicBehaviours(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator); !ok {
		return
	}
	items, err := h.svc.AdminCivicBehaviours(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// AdminCreateCivicBehaviour adds a new pledge (curator).
func (h *Handler) AdminCreateCivicBehaviour(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator); !ok {
		return
	}
	var in service.CivicBehaviourInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	b, err := h.svc.CreateCivicBehaviour(r.Context(), in)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, b)
}

// AdminUpdateCivicBehaviour edits a pledge (curator). POST, not PATCH (CORS).
func (h *Handler) AdminUpdateCivicBehaviour(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator); !ok {
		return
	}
	var in service.CivicBehaviourInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	b, err := h.svc.UpdateCivicBehaviour(r.Context(), r.PathValue("slug"), in)
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, b)
}

// AdminDeleteCivicBehaviour removes a pledge (curator).
func (h *Handler) AdminDeleteCivicBehaviour(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator); !ok {
		return
	}
	if err := h.svc.DeleteCivicBehaviour(r.Context(), r.PathValue("slug")); err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
