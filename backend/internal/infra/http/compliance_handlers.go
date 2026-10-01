package http

import (
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/infra/cloudinary"
	"github.com/oguaa/backend/internal/service"
)

// ── Ghana Data Protection Act, 2012 (Act 843) — spec §14.2 ──────────────────
// Right of access (export) and right to erasure (contracts K6, K7). Both need a
// genuinely signed-in member — never the dev fallback identity — except the
// public deletion-request flow, which proves control of the account's email or
// phone with a one-time code instead.

// DataRightsDeps wires the member-data features (export, erasure, private
// documents, data-rights requests, signed media uploads) into the handler.
// Any field may be nil; the affected endpoints then answer 503.
type DataRightsDeps struct {
	Erasure         *service.ErasureService
	Export          *service.ExportService
	PrivateUploads  *service.PrivateUploadService
	PrivacyRequests *service.PrivacyRequestService
	Uploads         domain.UploadRepository // who uploaded which first-party file
	Media           *cloudinary.Client      // signed Cloudinary uploads (K9)
}

// WithDataRights attaches the member-data features. Returns h for chaining.
func (h *Handler) WithDataRights(d DataRightsDeps) *Handler {
	h.rights = d
	return h
}

// Messages reused across the data-rights endpoints.
const (
	msgFeatureUnavailable = "This is temporarily unavailable. Please try again later."
	msgWrongPassword      = "That password is incorrect."
	msgDeletionBlocked    = "Settle these first, then delete your account."
)

// devEcho reports whether one-time codes may be echoed in responses: local
// development only (never with AUTH_REQUIRED, never in production).
func (h *Handler) devEcho() bool {
	return !h.authRequired && os.Getenv("GO_ENV") != "production"
}

// ExportMyData — GET /api/me/export. Everything the platform holds about the
// member, every section present, as a JSON download (Act 843 right of access).
// If any section cannot be loaded the request fails: an export that silently
// drops a section would look complete when it is not.
func (h *Handler) ExportMyData(w http.ResponseWriter, r *http.Request) {
	m, authed := h.requireAuth(w, r)
	if !authed {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "export:"+clientKey(r), 5, time.Hour) {
		return
	}
	if h.rights.Export == nil {
		fail(w, http.StatusServiceUnavailable, msgFeatureUnavailable)
		return
	}
	out, err := h.rights.Export.ExportMember(r.Context(), m.ID)
	if err != nil {
		h.log.Error("data export failed", "err", err)
		fail(w, http.StatusInternalServerError, "We couldn't put together your complete data export just now. Please try again in a few minutes.")
		return
	}
	// Headers must be set before writeJSON commits them.
	w.Header().Set("Content-Disposition", `attachment; filename="oguaa-data-export.json"`)
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, out)
}

// DeleteMyAccount — DELETE /api/me {password}. Erases the account everywhere
// (service.EraseMember) and answers what was kept and why.
func (h *Handler) DeleteMyAccount(w http.ResponseWriter, r *http.Request) {
	m, authed := h.requireAuth(w, r)
	if !authed {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "delete:"+clientKey(r), 5, time.Hour) {
		return
	}
	var in struct {
		Password string `json:"password"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if h.rights.Erasure == nil {
		fail(w, http.StatusServiceUnavailable, msgFeatureUnavailable)
		return
	}
	res, err := h.rights.Erasure.DeleteWithPassword(r.Context(), m.ID, in.Password)
	h.writeErasure(w, res, err)
}

// StartAccountDeletion — POST /api/account/deletion-requests {identifier}.
// For people who cannot sign in (Google Play's web deletion requirement):
// sends a 6-digit code to the account's email/phone when it exists. Always
// 202 {"ok":true} — the response never says whether an account exists.
func (h *Handler) StartAccountDeletion(w http.ResponseWriter, r *http.Request) {
	if h.rateLimited(w, r, "acct-delete-start-ip:"+clientIP(r), 5, time.Hour) {
		return
	}
	var in struct {
		Identifier string `json:"identifier"`
	}
	if err := decodeBody(r, &in); err != nil || strings.TrimSpace(in.Identifier) == "" {
		fail(w, http.StatusBadRequest, "Enter the email address or phone number on your account.")
		return
	}
	if h.rateLimited(w, r, "acct-delete-start-id:"+identifierKey(in.Identifier), 3, time.Hour) {
		return
	}
	if h.rights.Erasure == nil {
		fail(w, http.StatusServiceUnavailable, msgFeatureUnavailable)
		return
	}
	code, err := h.rights.Erasure.StartDeletionRequest(r.Context(), in.Identifier)
	if err != nil {
		h.handleErr(w, err)
		return
	}
	out := map[string]any{"ok": true}
	if code != "" && h.devEcho() {
		out["devCode"] = code
	}
	writeJSON(w, http.StatusAccepted, out)
}

// ConfirmAccountDeletion — POST /api/account/deletion-requests/confirm
// {identifier, code}. Deletes the account; 400 on a wrong or expired code.
func (h *Handler) ConfirmAccountDeletion(w http.ResponseWriter, r *http.Request) {
	if h.rateLimited(w, r, "acct-delete-confirm-ip:"+clientIP(r), 10, 15*time.Minute) {
		return
	}
	var in struct {
		Identifier string `json:"identifier"`
		Code       string `json:"code"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	if h.rateLimited(w, r, "acct-delete-confirm-id:"+identifierKey(in.Identifier), 10, time.Hour) {
		return
	}
	if h.rights.Erasure == nil {
		fail(w, http.StatusServiceUnavailable, msgFeatureUnavailable)
		return
	}
	res, err := h.rights.Erasure.ConfirmDeletionRequest(r.Context(), in.Identifier, in.Code)
	h.writeErasure(w, res, err)
}

// AdminEraseMember — POST /api/admin/members/{id}/erase (steward only). Lets a
// steward carry out a verified deletion request for someone who cannot use the
// self-service flows. The same erasure, the same blockers.
func (h *Handler) AdminEraseMember(w http.ResponseWriter, r *http.Request) {
	staff, ok := h.requireRole(w, r) // steward only
	if !ok {
		return
	}
	if h.rights.Erasure == nil {
		fail(w, http.StatusServiceUnavailable, msgFeatureUnavailable)
		return
	}
	id := r.PathValue("id")
	if _, err := h.svc.MemberByID(r.Context(), id); err != nil {
		h.handleErr(w, err)
		return
	}
	res, err := h.rights.Erasure.DeleteAccountByStaff(r.Context(), id, staff)
	h.writeErasure(w, res, err)
}

// writeErasure maps the outcome of any deletion path to the K6 response.
func (h *Handler) writeErasure(w http.ResponseWriter, res *service.ErasureResult, err error) {
	var blocked *service.DeletionBlockedError
	switch {
	case err == nil:
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "deleted": res.Deleted, "retained": res.Retained})
	case errors.Is(err, service.ErrInvalidCredentials):
		fail(w, http.StatusForbidden, msgWrongPassword)
	case errors.Is(err, service.ErrDeletionCodeInvalid):
		fail(w, http.StatusBadRequest, "That code didn't work or has expired. Request a new code and try again.")
	case errors.As(err, &blocked):
		writeJSON(w, http.StatusConflict, map[string]any{"error": msgDeletionBlocked, "blockers": blocked.Blockers})
	default:
		h.handleErr(w, err)
	}
}

// identifierKey normalises an email/phone for per-identifier rate limits, so
// case or spacing changes cannot reset the count.
func identifierKey(s string) string {
	return strings.ToLower(strings.Join(strings.Fields(s), ""))
}
