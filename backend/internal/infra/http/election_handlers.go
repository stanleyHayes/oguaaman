package http

import (
	"net/http"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── the election calendar (spec §1.2, §4.2) ──────────────────────────────────

const (
	publicElectionsPerMinute = 120
	electionsCacheControl    = "public, max-age=60"
)

// PublicElections lists the calendar. GET /api/elections?upcoming=1 (public):
// with upcoming=1 only polls from today on, soonest first; otherwise all,
// latest first. Every field is public. Without the calendar wired it is [].
func (h *Handler) PublicElections(w http.ResponseWriter, r *http.Request) {
	if h.rateLimited(w, r, "elections:"+clientIP(r), publicElectionsPerMinute, time.Minute) {
		return
	}
	svc := h.foundations.Elections
	if svc == nil {
		writeJSON(w, http.StatusOK, []domain.Election{})
		return
	}
	var (
		out []domain.Election
		err error
	)
	if r.URL.Query().Get("upcoming") == "1" {
		out, err = svc.Upcoming(r.Context(), time.Now().UTC().Format(time.DateOnly)) // Accra is GMT
	} else {
		out, err = svc.All(r.Context())
	}
	if err != nil {
		h.writeSettingsErr(w, err)
		return
	}
	w.Header().Set("Cache-Control", electionsCacheControl)
	writeJSON(w, http.StatusOK, out)
}

// electionsFor returns the calendar service for a staff route that passed
// its role check, or answers 503 when it is not wired.
func (h *Handler) electionsFor(w http.ResponseWriter) *service.ElectionsService {
	if h.foundations.Elections == nil {
		writeCodeError(w, http.StatusServiceUnavailable, codeUnavailable, msgUnavailable, "")
	}
	return h.foundations.Elections
}

// AdminElections lists the whole calendar. GET /api/admin/elections (curator).
func (h *Handler) AdminElections(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleCurator); !ok {
		return
	}
	svc := h.electionsFor(w)
	if svc == nil {
		return
	}
	out, err := svc.All(r.Context())
	if err != nil {
		h.writeSettingsErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// AdminCreateElection adds an election. POST /api/admin/elections (steward).
func (h *Handler) AdminCreateElection(w http.ResponseWriter, r *http.Request) {
	h.saveElection(w, r, "")
}

// AdminUpdateElection replaces an election's fields.
// PUT /api/admin/elections/{id} (steward).
func (h *Handler) AdminUpdateElection(w http.ResponseWriter, r *http.Request) {
	h.saveElection(w, r, r.PathValue("id"))
}

// saveElection creates (id == "") or updates an election.
func (h *Handler) saveElection(w http.ResponseWriter, r *http.Request, id string) {
	if _, ok := h.requireRole(w, r, domain.RoleSteward); !ok {
		return
	}
	svc := h.electionsFor(w)
	if svc == nil {
		return
	}
	var in service.ElectionInput
	if err := decodeBody(r, &in); err != nil {
		writeCodeError(w, http.StatusBadRequest, codeInvalidJSON, msgInvalidJSON, "")
		return
	}
	var (
		e   *domain.Election
		err error
	)
	status := http.StatusCreated
	if id == "" {
		e, err = svc.Create(r.Context(), in, auditActor(r))
	} else {
		status = http.StatusOK
		e, err = svc.Update(r.Context(), id, in, auditActor(r))
	}
	if err != nil {
		h.writeSettingsErr(w, err)
		return
	}
	writeJSON(w, status, e)
}

// AdminDeleteElection removes an election no live campaign references.
// DELETE /api/admin/elections/{id}?reason=… (steward).
func (h *Handler) AdminDeleteElection(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, domain.RoleSteward); !ok {
		return
	}
	svc := h.electionsFor(w)
	if svc == nil {
		return
	}
	reason := strings.TrimSpace(r.URL.Query().Get("reason"))
	if err := svc.Delete(r.Context(), r.PathValue("id"), auditActor(r), reason); err != nil {
		h.writeSettingsErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
