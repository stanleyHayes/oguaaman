package http

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── platform settings audit + shared error shape (spec §1.1, §4.1) ───────────

// FoundationsDeps wires the shared foundations: platform settings (with
// their audit trail) and the election calendar.
type FoundationsDeps struct {
	Settings  *service.SettingsService
	Elections *service.ElectionsService
}

// WithFoundations attaches the settings and election services.
func (h *Handler) WithFoundations(d FoundationsDeps) *Handler {
	h.foundations = d
	return h
}

// RegisterFoundationRoutes adds the settings-audit and election routes
// (spec §4.1 audit, §4.2) to mux. NewRouter calls it.
func (h *Handler) RegisterFoundationRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/elections", h.PublicElections)
	mux.HandleFunc("GET /api/admin/elections", h.AdminElections)
	mux.HandleFunc("POST /api/admin/elections", h.AdminCreateElection)
	mux.HandleFunc("PUT /api/admin/elections/{id}", h.AdminUpdateElection)
	mux.HandleFunc("DELETE /api/admin/elections/{id}", h.AdminDeleteElection)
	mux.HandleFunc("GET /api/admin/settings/audit", h.AdminSettingsAudit)
}

// Error codes and messages of the coded error shape
// {"error":"<code>","message":"<sentence>","field":"<name>"}.
const (
	codeInvalidJSON      = "invalid_json"
	codeNotFound         = "not_found"
	codeInternal         = "internal"
	codeSettingsConflict = "settings_conflict"
	codeElectionInUse    = "election_in_use"
	codeUnavailable      = "feature_unavailable"

	msgInvalidJSON      = "We couldn't read that request. Check the JSON and try again."
	msgSettingsConflict = "Someone else saved these settings after you opened them. Reload to see their changes, then try again."
	msgElectionInUse    = "Ad campaigns still depend on this election. End or move them first."
	msgUnavailable      = "This feature isn't switched on for this server yet."
	msgInternal         = "Something went wrong on our side. Try again in a minute."
)

// writeCodeError writes the coded error shape; field is omitted when empty.
func writeCodeError(w http.ResponseWriter, status int, code, message, field string) {
	body := map[string]string{"error": code, "message": message}
	if field != "" {
		body["field"] = field
	}
	writeJSON(w, status, body)
}

// writeSettingsErr maps the foundations' errors (and the settings errors the
// news-desk and ads settings handlers share) onto the coded error shape.
func (h *Handler) writeSettingsErr(w http.ResponseWriter, err error) {
	var fe *service.InvalidFieldError
	var nf *domain.NotFoundError
	switch {
	case errors.As(err, &fe):
		writeCodeError(w, http.StatusBadRequest, fe.Code, fe.Message, fe.Field)
	case errors.As(err, &nf):
		writeCodeError(w, http.StatusNotFound, codeNotFound, "We couldn't find that "+nf.Entity+".", "")
	case errors.Is(err, domain.ErrSettingsConflict):
		writeCodeError(w, http.StatusConflict, codeSettingsConflict, msgSettingsConflict, "")
	case errors.Is(err, service.ErrElectionInUse):
		writeCodeError(w, http.StatusConflict, codeElectionInUse, msgElectionInUse, "")
	default:
		h.log.Error("foundations handler error", "err", err)
		writeCodeError(w, http.StatusInternalServerError, codeInternal, msgInternal, "")
	}
}

// auditActor is the signed-in staff member as an audit actor. In dev without
// enforced auth there may be nobody signed in.
func auditActor(r *http.Request) service.AuditActor {
	if m := currentMember(r); m != nil {
		return service.AuditActor{ID: m.ID, Name: m.DisplayName}
	}
	return service.AuditActor{Name: "Development"}
}

// AdminSettingsAudit lists recent changes to one audited area.
// GET /api/admin/settings/audit?key=news_desk|ads|elections&limit=50 (curator).
func (h *Handler) AdminSettingsAudit(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator); !ok {
		return
	}
	limit, err := strconv.Atoi(r.URL.Query().Get("limit"))
	if err != nil {
		limit = 50
	}
	rows, err := h.foundations.Settings.Audit(r.Context(), r.URL.Query().Get("key"), limit)
	if err != nil {
		h.writeSettingsErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, rows)
}
