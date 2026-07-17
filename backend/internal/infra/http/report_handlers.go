package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── reports: notice-and-takedown (spec §14.3/§14.4/§14.7) ────────────────────

// Report is the public report path: any visitor can flag a listing; if they are
// signed in we attribute the report to them so stewards can follow up.
func (h *Handler) Report(w http.ResponseWriter, r *http.Request) {
	if h.rateLimited(w, r, "report:"+clientKey(r), 10, time.Hour) {
		return
	}
	var in service.ReportInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	in.ListingID = r.PathValue("id")
	if m := currentMember(r); m != nil {
		in.ReporterID = m.ID
		in.ReporterName = m.DisplayName
	}
	rep, err := h.svc.SubmitReport(r.Context(), in)
	if err != nil {
		var nf *domain.NotFoundError
		if errors.As(err, &nf) {
			h.handleErr(w, err)
			return
		}
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"reported": true, "id": rep.ID})
}

// AdminReports lists the report triage queue for stewards/curators.
func (h *Handler) AdminReports(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireRole(w, r, "curator", "moderator"); !ok {
		return
	}
	reps, err := h.svc.Reports(r.Context())
	if err != nil {
		h.handleErr(w, err)
		return
	}
	writeList(w, r, reps)
}

// AdminResolveReport closes a report as actioned or dismissed.
func (h *Handler) AdminResolveReport(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, "curator", "moderator")
	if !ok {
		return
	}
	var in struct {
		Status     string `json:"status"`
		Resolution string `json:"resolution"`
	}
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	reviewer := ""
	if m != nil {
		reviewer = m.ID
	}
	if err := h.svc.ResolveReport(r.Context(), r.PathValue("id"), in.Status, in.Resolution, reviewer); err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": in.Status})
}
