package http

import (
	"net/http"
)

// ── member blocking (App Store Review Guideline 1.2) ─────────────────────────

// BlockState — GET /api/members/{slug}/block. Signed-out callers are never
// blocking anyone, so they get a plain false rather than a 401; the profile page
// renders the same for them either way.
func (h *Handler) BlockState(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		writeJSON(w, http.StatusOK, map[string]bool{"blocked": false})
		return
	}
	blocked, err := h.svc.IsBlockedMember(r.Context(), m.ID, r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"blocked": blocked})
}

// BlockMember — POST /api/members/{slug}/block.
func (h *Handler) BlockMember(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, "Sign in to block someone.")
		return
	}
	// The reason is optional and private to the blocker; a body is not required.
	var in struct {
		Reason string `json:"reason"`
	}
	_ = decodeBody(r, &in)
	if err := h.svc.BlockMember(r.Context(), m.ID, r.PathValue("slug"), in.Reason); err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"blocked": true})
}

// UnblockMember — DELETE /api/members/{slug}/block.
func (h *Handler) UnblockMember(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if err := h.svc.UnblockMember(r.Context(), m.ID, r.PathValue("slug")); err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"blocked": false})
}

// MyBlocked — GET /api/me/blocked. The unblock list for the settings screen.
// Apple expects blocking to be reversible by the member who made it.
func (h *Handler) MyBlocked(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	rows, err := h.svc.MyBlocked(r.Context(), m.ID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, rows)
}
