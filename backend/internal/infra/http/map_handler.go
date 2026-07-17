package http

import "net/http"

// Map returns the whole town map in one public payload: points, trails and
// areas. Clients filter layers locally (GET /api/map).
func (h *Handler) Map(w http.ResponseWriter, r *http.Request) {
	payload, err := h.svc.MapData(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, payload)
}
