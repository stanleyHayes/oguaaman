package http

import (
	"errors"
	"net/http"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// ── reports: notice-and-takedown (spec §14.3/§14.4/§14.7) ────────────────────

// Report is the legacy listing report path (POST /api/listings/{id}/report):
// any visitor can flag a listing; if they are signed in we attribute the
// report to them so stewards can follow up. A report sent here never hides
// the listing by itself (use POST /api/reports for that).
func (h *Handler) Report(w http.ResponseWriter, r *http.Request) {
	if h.rateLimited(w, r, "report:"+clientKey(r), 10, time.Hour) {
		return
	}
	var in service.ReportInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	in.TargetType, in.TargetID, in.ListingID = domain.ReportTargetListing, r.PathValue("id"), r.PathValue("id")
	in.Legacy = true // never auto-hides: queued at its priority and staff are alerted
	h.submitReport(w, r, in)
}

// ContentReport — POST /api/reports {targetType, targetId, reason, details?,
// listingId?} (K11). Signed-in members report any piece of content: a
// listing, member, business review, tribute, product (with its business's
// listingId), news article, agent, agent review (agent_review) or AI
// suggestion.
func (h *Handler) ContentReport(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	if m == nil {
		fail(w, http.StatusUnauthorized, msgSignInToContinue)
		return
	}
	if h.rateLimited(w, r, "report:"+clientKey(r), 10, time.Hour) {
		return
	}
	var in service.ReportInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	h.submitReport(w, r, in)
}

func (h *Handler) submitReport(w http.ResponseWriter, r *http.Request, in service.ReportInput) {
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
	writeJSON(w, http.StatusCreated, map[string]any{"reported": true, "id": rep.ID, "hidden": rep.AutoHidden})
}

// AdminReports lists the report triage queue for stewards/curators: open
// reports first, most urgent first, each with its age and SLA state.
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

// AdminResolveReport closes a report as actioned or dismissed, optionally
// removing the content (and suspending its author) in the same step (K11).
func (h *Handler) AdminResolveReport(w http.ResponseWriter, r *http.Request) {
	m, ok := h.requireRole(w, r, "curator", "moderator")
	if !ok {
		return
	}
	var in service.ResolveReportInput
	if err := decodeBody(r, &in); err != nil {
		fail(w, http.StatusBadRequest, msgInvalidRequestBody)
		return
	}
	reviewer := ""
	if m != nil {
		reviewer = m.ID
	}
	if err := h.svc.ResolveReport(r.Context(), r.PathValue("id"), in, reviewer); err != nil {
		h.failDomain(w, err)
		return
	}
	status := in.Status
	if in.Action == domain.ReportActionRemove || in.Action == domain.ReportActionRemoveAndSuspend {
		status = domain.ReportActioned
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": status})
}
