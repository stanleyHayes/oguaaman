package http

import (
	"net/http"

	"github.com/oguaa/backend/internal/domain"
)

// ── member ↔ member follows + birthday opt-in (spec §8.11) ───────────────────

func (h *Handler) MemberFollowState(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		writeJSON(w, http.StatusOK, map[string]bool{"following": false})
		return
	}
	following, err := h.svc.IsFollowingMember(r.Context(), m.ID, r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"following": following})
}

func (h *Handler) FollowMember(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		fail(w, http.StatusUnauthorized, "Sign in to follow someone.")
		return
	}
	count, err := h.svc.FollowMember(r.Context(), m.ID, r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"following": true, "followers": count})
}

func (h *Handler) UnfollowMember(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	count, err := h.svc.UnfollowMember(r.Context(), m.ID, r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"following": false, "followers": count})
}

// SetMyProfile — the signed-in member edits their display name and bio.
func (h *Handler) SetMyProfile(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	var in struct {
		DisplayName string `json:"displayName"`
		Bio         string `json:"bio"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	updated, err := h.svc.UpdateMemberProfile(r.Context(), m.ID, in.DisplayName, in.Bio)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// SetMyBirthday — the signed-in member sets their birthday + broadcast opt-in.
func (h *Handler) SetMyBirthday(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	var in struct {
		Birthday  string `json:"birthday"`
		Broadcast bool   `json:"broadcast"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if err := h.svc.SetMemberBirthday(r.Context(), m.ID, in.Birthday, in.Broadcast); err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"birthday": in.Birthday, "broadcastBirthday": in.Broadcast})
}

// SetMyPhoto — the signed-in member sets (or clears) their profile photo. The
// image is uploaded to Cloudinary in the browser; we persist only the URL.
func (h *Handler) SetMyPhoto(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	var in struct {
		PhotoURL string `json:"photoUrl"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if err := h.svc.SetMemberPhoto(r.Context(), m.ID, in.PhotoURL); err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"photoUrl": in.PhotoURL})
}

// MyConnections — "people you may know" for the signed-in member (spec §8.6).
func (h *Handler) MyConnections(w http.ResponseWriter, r *http.Request) {
	m := currentMember(r)
	if m == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	conns, err := h.svc.Recommendations(r.Context(), m.ID)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, conns)
}

// SetMySchooling — the member records their schools + years (the classmate signal).
func (h *Handler) SetMySchooling(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	var in struct {
		Schooling []domain.SchoolStint `json:"schooling"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if err := h.svc.SetMemberSchooling(r.Context(), m.ID, in.Schooling); err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"schooling": in.Schooling})
}

// SetMyAffiliations — the signed-in member sets their quarter + Asafo company.
func (h *Handler) SetMyAffiliations(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	var in struct {
		TownID  string `json:"townId"`
		AsafoID string `json:"asafoId"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if err := h.svc.SetMemberAffiliations(r.Context(), m.ID, in.TownID, in.AsafoID); err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"townId": in.TownID, "asafoId": in.AsafoID})
}
