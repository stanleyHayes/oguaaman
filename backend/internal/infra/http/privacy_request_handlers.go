package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── data-rights requests (contract K10) ─────────────────────────────────────

// SubmitPrivacyRequest — POST /api/privacy/requests. Public; a signed-in
// member's request is linked to their account. Returns the reference the
// requester quotes in any follow-up.
func (h *Handler) SubmitPrivacyRequest(w http.ResponseWriter, r *http.Request) {
	if h.rateLimited(w, r, "privacy-request-ip:"+clientIP(r), 5, time.Hour) {
		return
	}
	svc := h.rights.PrivacyRequests
	if svc == nil {
		fail(w, http.StatusServiceUnavailable, msgFeatureUnavailable)
		return
	}
	var in service.PrivacyRequestInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	pr, err := svc.Submit(r.Context(), in, currentMember(r))
	if h.writeValidation(w, err) {
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"reference": pr.Reference, "dueAt": pr.DueAt})
}

// AdminPrivacyRequests — GET /api/admin/privacy-requests (steward). The queue,
// soonest deadline first, with overdue flags. Supports ?page=&pageSize=.
func (h *Handler) AdminPrivacyRequests(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r); !ok { // steward only
		return
	}
	svc := h.rights.PrivacyRequests
	if svc == nil {
		fail(w, http.StatusServiceUnavailable, msgFeatureUnavailable)
		return
	}
	rows, err := svc.List(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeList(w, r, rows)
}

// AdminUpdatePrivacyRequest — POST /api/admin/privacy-requests/{id}
// {status, note} (steward). Records the transition in the request history.
func (h *Handler) AdminUpdatePrivacyRequest(w http.ResponseWriter, r *http.Request) {
	staff, ok := h.requireRole(w, r) // steward only
	if !ok {
		return
	}
	svc := h.rights.PrivacyRequests
	if svc == nil {
		fail(w, http.StatusServiceUnavailable, msgFeatureUnavailable)
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
	row, err := svc.Transition(r.Context(), r.PathValue("id"), in.Status, in.Note, staff)
	if h.writeValidation(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, row)
}

// writeValidation writes err (400 for validation errors, mapped otherwise) and
// reports whether it wrote anything.
func (h *Handler) writeValidation(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	var ve *domain.ValidationError
	if errors.As(err, &ve) {
		fail(w, http.StatusBadRequest, ve.Error())
		return true
	}
	h.handleErr(w, err)
	return true
}
