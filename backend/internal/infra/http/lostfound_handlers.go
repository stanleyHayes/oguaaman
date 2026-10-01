package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── lost & found: lost items, found items, missing people (auto-published; ──
// ── the owner or a curator resolves the notice) ─────────────────────────────

// LostFound lists published lost & found notices, newest first, with optional
// ?kind= and ?status= filters. The poster's contact and member id are shown
// only to the poster and to staff (D3).
func (h *Handler) LostFound(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	items, err := h.svc.LostFound(r.Context(), currentMember(r), service.LostFoundFilters{
		Kind:   q.Get("kind"),
		Status: q.Get("status"),
	})
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeList(w, r, items)
}

// LostFoundBySlug fetches one published lost & found notice by slug.
func (h *Handler) LostFoundBySlug(w http.ResponseWriter, r *http.Request) {
	l, err := h.svc.LostFoundBySlug(r.Context(), currentMember(r), r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, l)
}

// SubmitLostFound posts a notice as the signed-in member. The notice goes live
// immediately (time-critical) unless it is held for a curator — the poster has
// no verified phone yet, or the content screen flagged it — in which case it is
// saved pending with held: true.
func (h *Handler) SubmitLostFound(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if h.rateLimited(w, r, "lostfound:"+clientKey(r), 10, time.Hour) {
		return
	}
	var in service.LostFoundInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if m == nil {
		m = &domain.Member{ID: domain.DevDemoMemberID} // dev convenience only — never reached when AUTH_REQUIRED=true
	}
	l, err := h.svc.SubmitLostFound(r.Context(), m, in)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, l)
}

// ResolveLostFound closes a notice as reunited or closed (the person who
// posted it, or a curator/steward).
func (h *Handler) ResolveLostFound(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	var in struct {
		Status string `json:"status"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if m == nil {
		m = &domain.Member{ID: domain.DevDemoMemberID} // dev convenience only — never reached when AUTH_REQUIRED=true
	}
	l, err := h.svc.LostFoundBySlug(r.Context(), m, r.PathValue("slug"))
	if err != nil {
		h.handleErr(w, err)
		return
	}
	if err := h.svc.ResolveLostFound(r.Context(), l.ID, m, in.Status); err != nil {
		h.failDomain(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": in.Status})
}

// ContactLostFound — POST /api/lost-found/{slug}/contact {message}. Relays a
// signed-in member's message to the poster, whose contact is private (D3).
func (h *Handler) ContactLostFound(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "lostfound-contact:"+clientKey(r), 5, time.Hour) {
		return
	}
	var in struct {
		Message string `json:"message"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if err := h.svc.ContactLostFoundPoster(r.Context(), m, r.PathValue("slug"), in.Message); err != nil {
		h.failDomain(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"sent": true})
}

// failDomain maps not-found and forbidden errors to 404/403 and anything else
// (validation, content screen) to 400 with the error's message.
func (h *Handler) failDomain(w http.ResponseWriter, err error) {
	var nf *domain.NotFoundError
	var fb *domain.ForbiddenError
	if errors.As(err, &nf) || errors.As(err, &fb) {
		h.handleErr(w, err)
		return
	}
	fail(w, http.StatusBadRequest, err.Error())
}
