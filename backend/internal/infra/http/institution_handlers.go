package http

import (
	"net/http"

	"github.com/oguaa/backend/internal/domain"
)

// ── institutions / places / stats ──────────────────────────────────

func (h *Handler) Schools(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.Schools(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeList(w, r, items)
}

func (h *Handler) Places(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.Places(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (h *Handler) Institutions(w http.ResponseWriter, r *http.Request) {
	items, err := h.svc.Institutions(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	// Optional ?kind= filter (e.g. "heritage") so a client can ask for one kind
	// without over-fetching the whole directory.
	if kind := r.URL.Query().Get("kind"); kind != "" {
		filtered := make([]domain.Organization, 0, len(items))
		for _, o := range items {
			if o.Kind == kind {
				filtered = append(filtered, o)
			}
		}
		items = filtered
	}
	writeList(w, r, items)
}

func (h *Handler) Institution(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	org, err := h.svc.InstitutionBySlug(ctx, r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	// A revoked institution is offline (spec §8.13): the public gets a plain
	// 404; only its managers and stewards may still view the page.
	if !org.Verified && !h.canManageInstitution(r, org.Slug) {
		fail(w, http.StatusNotFound, "institution not found")
		return
	}
	events, err := h.svc.EventsForOrg(ctx, org.ID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	official, err := h.svc.OfficialEventsForOrg(ctx, org.ID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"institution": org, "events": events, "officialEvents": official,
	})
}

// canManageInstitution reports whether the request's (optional) signed-in
// member manages the institution or is a steward — the viewers allowed past
// the revoked-page gate in Institution.
func (h *Handler) canManageInstitution(r *http.Request, slug string) bool {
	m := currentMember(r)
	if m == nil {
		return false
	}
	return h.svc.CanManageInstitution(r.Context(), m.ID, slug)
}

func (h *Handler) Stats(w http.ResponseWriter, r *http.Request) {
	st, err := h.svc.Stats(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}
