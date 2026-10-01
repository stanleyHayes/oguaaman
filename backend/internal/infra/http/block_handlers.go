package http

import (
	"net/http"

	"github.com/oguaa/backend/internal/service"
)

// ── member blocking (App Store Review Guideline 1.2) ─────────────────────────

// blockStateBody is the direction-aware block state every block endpoint
// returns (contract K5). `blocked` is the legacy either-direction flag kept for
// older clients; new clients must use blockedByMe (offer "Unblock") and
// blockedMe (show a neutral "profile unavailable" — never "You blocked …").
func blockStateBody(st service.BlockStatus) map[string]bool {
	return map[string]bool{"blocked": st.Blocked(), "blockedByMe": st.BlockedByMe, "blockedMe": st.BlockedMe}
}

// BlockState — GET /api/members/{slug}/block. Signed-out callers are never
// blocking anyone, so they get all-false rather than a 401; the profile page
// renders the same for them either way.
func (h *Handler) BlockState(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		writeJSON(w, http.StatusOK, blockStateBody(service.BlockStatus{}))
		return
	}
	st, err := h.svc.BlockStatusWith(r.Context(), m.ID, r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, blockStateBody(st))
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
	slug := r.PathValue("slug")
	if err := h.svc.BlockMember(r.Context(), m.ID, slug, in.Reason); err != nil {
		h.handleErr(w, err)
		return
	}
	h.writeBlockState(w, r, m.ID, slug)
}

// UnblockMember — DELETE /api/members/{slug}/block. Only the viewer's own block
// can be lifted; the recomputed state tells the client whether a block made by
// the other member still stands.
func (h *Handler) UnblockMember(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	slug := r.PathValue("slug")
	if err := h.svc.UnblockMember(r.Context(), m.ID, slug); err != nil {
		h.handleErr(w, err)
		return
	}
	h.writeBlockState(w, r, m.ID, slug)
}

// writeBlockState answers a block/unblock with the state as it now stands.
func (h *Handler) writeBlockState(w http.ResponseWriter, r *http.Request, viewerID, slug string) {
	st, err := h.svc.BlockStatusWith(r.Context(), viewerID, slug)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, blockStateBody(st))
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
