package http

import (
	"net/http"
	"strconv"

	"github.com/oguaa/backend/internal/domain"
)

// ── search & diaspora register ───────────────────────────────────────────────

// Search runs the unified cross-pillar search (spec §12).
func (h *Handler) Search(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	hits, err := h.svc.Search(r.Context(), q, limit)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, hits)
}

// DiasporaMembers lists the "sons & daughters abroad" wall (spec §4/§5).
func (h *Handler) DiasporaMembers(w http.ResponseWriter, r *http.Request) {
	members, err := h.svc.DiasporaMembers(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeList(w, r, members)
}

// SetMyDiaspora records the signed-in member's location abroad (opt-in).
func (h *Handler) SetMyDiaspora(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	var in struct {
		Abroad  bool   `json:"abroad"`
		City    string `json:"city"`
		Country string `json:"country"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	d, err := h.svc.SetMemberDiaspora(r.Context(), m.ID, in.Abroad, in.City, in.Country)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	if d == nil {
		writeJSON(w, http.StatusOK, map[string]any{"diaspora": nil})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"diaspora": domain.Diaspora{Abroad: d.Abroad, City: d.City, Country: d.Country}})
}
