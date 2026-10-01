package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── reports: notice-and-takedown (spec §14.3/§14.4/§14.7, K11) ───────────────
//
// Any piece of member content can be reported (see domain.ValidReportTarget).
// Stewards, curators and moderators are alerted to every report and must act
// within ReportSLA. Child-safety and intimate-image reports withdraw the
// content from public view the moment they arrive, where the content type
// supports it, and the content is snapshotted as evidence either way.

// ReportSLA is how quickly a report must be handled (Apple 1.2: 24 hours).
const ReportSLA = 24 * time.Hour

const maxReportDetailRunes = 2000

// ReportInput is a report against a piece of content.
type ReportInput struct {
	TargetType string `json:"targetType"`
	TargetID   string `json:"targetId"`
	// ListingID is the listing being reported on the legacy listing route, and
	// the business a reported product belongs to.
	ListingID    string `json:"listingId"`
	Reason       string `json:"reason"`
	Detail       string `json:"detail"`
	Details      string `json:"details"` // K11 spelling of Detail
	ReporterID   string `json:"-"`       // set from the session, never trusted from the body
	ReporterName string `json:"-"`
	// Legacy marks a report sent through the anonymous listing route (POST
	// /api/listings/{id}/report). Such a report never hides anything by
	// itself: it is queued at its priority and staff are alerted.
	Legacy bool `json:"-"`
}

// normalise fills the target from the legacy listing fields and checks the
// reason and detail.
func (in *ReportInput) normalise() error {
	in.TargetType = strings.TrimSpace(in.TargetType)
	in.TargetID = strings.TrimSpace(in.TargetID)
	if in.TargetType == "" && in.ListingID != "" {
		in.TargetType, in.TargetID = domain.ReportTargetListing, in.ListingID
	}
	if in.Detail == "" {
		in.Detail = in.Details
	}
	in.Detail = strings.TrimSpace(in.Detail)
	switch {
	case !domain.ValidReportTarget(in.TargetType):
		return fmt.Errorf("choose what you are reporting")
	case !domain.ValidReportReason(in.Reason):
		return fmt.Errorf("choose a reason for the report")
	case runeLen(in.Detail) > maxReportDetailRunes:
		return fmt.Errorf("please keep the detail under %d characters", maxReportDetailRunes)
	}
	return nil
}

// SubmitReport records a report and alerts safety staff. The target is
// denormalised onto the report (title, owner, the listing it lives on and an
// evidence snapshot) so the queue reads cleanly even if the content is later
// changed or removed. An urgent report hides the content immediately, and a
// sensitive listing reported by several people is held for review.
func (s *Service) SubmitReport(ctx context.Context, in ReportInput) (*domain.Report, error) {
	if s.reports == nil {
		return nil, fmt.Errorf("reports are not available")
	}
	if err := in.normalise(); err != nil {
		return nil, err
	}
	t, err := s.resolveReportTarget(ctx, in.TargetType, in.TargetID, in.ListingID)
	if err != nil {
		return nil, err
	}
	rep := newReport(in, t)
	if domain.UrgentReportReason(in.Reason) && s.mayAutoHide(ctx, in, t) {
		hidden, err := s.hideReportTarget(ctx, t)
		if err != nil {
			s.log.Warn("report: could not hide reported content", "targetType", t.Type, "targetId", t.ID, "err", err)
		}
		if hidden && err == nil {
			rep.AutoHidden, rep.HiddenFromStatus = true, t.Status
		}
	}
	if err := s.reports.Insert(ctx, rep); err != nil {
		return nil, err
	}
	if !rep.AutoHidden {
		s.holdAfterRepeatedReports(ctx, t)
	}
	s.notifyStewardsOfReport(ctx, &rep)
	return &rep, nil
}

// mayAutoHide reports whether an urgent report may withdraw its target on
// its own, before anyone reviews it. Only a signed-in reporter in good
// standing with a verified phone can, and never through the anonymous legacy
// route. Safety posts (incidents, lost & found notices) are never taken down
// by one report: they are held once several people report them
// (holdAfterRepeatedReports) or by a curator.
func (s *Service) mayAutoHide(ctx context.Context, in ReportInput, t *reportTarget) bool {
	if in.Legacy || in.ReporterID == "" {
		return false
	}
	if t.Type == domain.ReportTargetListing && t.Listing != nil && safetyPostTypes[t.Listing.Type] {
		return false
	}
	reporter, err := s.members.ByID(ctx, in.ReporterID)
	return err == nil && trustedReporter(reporter)
}

// safetyPostTypes are the time-critical listings a single report never hides.
var safetyPostTypes = map[string]bool{domain.TypeIncident: true, domain.TypeLostFound: true}

func newReport(in ReportInput, t *reportTarget) domain.Report {
	rep := domain.Report{
		ID:            newID(domain.PrefixReport),
		TargetType:    t.Type,
		TargetID:      t.ID,
		TargetTitle:   t.Title,
		TargetOwnerID: t.OwnerID,
		Reason:        in.Reason,
		Priority:      domain.ReportPriority(in.Reason),
		Detail:        in.Detail,
		ReporterID:    in.ReporterID,
		ReporterName:  in.ReporterName,
		Status:        domain.ReportOpen,
		CreatedAt:     time.Now().UTC().Format(time.RFC3339),
		Evidence:      evidenceSnapshot(t.evidence),
	}
	if t.Listing != nil {
		rep.ListingID, rep.ListingSlug, rep.ListingType, rep.ListingTitle = t.Listing.ID, t.Listing.Slug, t.Listing.Type, t.Listing.Title
	}
	return rep
}

// notifyStewardsOfReport alerts every curator, steward and moderator in-app
// and by email / WhatsApp, so a report surfaces without anyone polling.
func (s *Service) notifyStewardsOfReport(ctx context.Context, rep *domain.Report) {
	if s.notifs == nil {
		return
	}
	members, err := s.members.All(ctx)
	if err != nil {
		return
	}
	title := staffNoticeTitle(rep)
	var staff []string
	body := fmt.Sprintf("“%s” was reported (%s). Review it in the queue within 24 hours.", rep.TargetTitle, reportReasonLabel(rep.Reason))
	if rep.AutoHidden {
		body = fmt.Sprintf("“%s” was reported (%s) and has been hidden until you review it.", rep.TargetTitle, reportReasonLabel(rep.Reason))
	}
	for i := range members {
		m := &members[i]
		if !isSafetyStaff(m.Role) {
			continue
		}
		_ = s.notifs.Insert(ctx, domain.Notification{
			ID:       "ntf-" + fmt.Sprintf("%d-%s", time.Now().UnixNano(), m.ID),
			MemberID: m.ID, Kind: "report",
			Title: title, Body: body, Link: "/reports",
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		})
		s.notifyOutOfBand(ctx, m.ID, title, body, "/reports")
		staff = append(staff, m.ID)
	}
	if domain.UrgentReportReason(rep.Reason) && s.push != nil && len(staff) > 0 {
		// An urgent report also pushes to staff devices: it may be the only
		// thing standing between the content and the public.
		payload := PushPayload{Title: title, Body: "Open the reports queue to review it.", URL: "/reports", Tag: "report-" + rep.ID, Kind: "report"}
		incidentFanOut(func() { s.push.SendToMembers(context.Background(), staff, payload) })
	}
}

// reportReasonLabels name each reason in notices.
var reportReasonLabels = map[string]string{
	domain.ReasonInaccurate:    "not accurate",
	domain.ReasonInappropriate: "inappropriate",
	domain.ReasonImpersonation: "impersonation",
	domain.ReasonBereavement:   "a memorial concern",
	domain.ReasonChildSafety:   "child safety",
	domain.ReasonNCII:          "intimate image shared without consent",
	domain.ReasonHarassment:    "harassment",
	domain.ReasonHate:          "hate",
	domain.ReasonViolence:      "violence",
	domain.ReasonPrivateInfo:   "private information",
	domain.ReasonScam:          "scam",
}

func reportReasonLabel(reason string) string {
	if l, ok := reportReasonLabels[reason]; ok {
		return l
	}
	return "other"
}

// ReportRow is a report in the triage queue with its age against the SLA.
type ReportRow struct {
	domain.Report
	AgeMinutes  int  `json:"ageMinutes"`
	SLABreached bool `json:"slaBreached"`
}

// Reports returns the triage queue: open reports first, most urgent reason
// first, then oldest first; closed reports after them, newest first. Rows
// from before targets were generalised read as listing reports.
func (s *Service) Reports(ctx context.Context) ([]ReportRow, error) {
	reps, err := s.reports.All(ctx)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	rows := make([]ReportRow, len(reps))
	for i, r := range reps {
		rows[i] = reportRow(r, now)
	}
	sort.SliceStable(rows, func(i, j int) bool { return reportBefore(&rows[i].Report, &rows[j].Report) })
	return rows, nil
}

func reportRow(r domain.Report, now time.Time) ReportRow {
	r.TargetType, r.TargetID = reportTargetType(&r), reportTargetID(&r)
	if r.TargetTitle == "" {
		r.TargetTitle = r.ListingTitle
	}
	row := ReportRow{Report: r}
	if created, err := time.Parse(time.RFC3339, r.CreatedAt); err == nil {
		age := now.Sub(created)
		row.AgeMinutes = int(age / time.Minute)
		row.SLABreached = r.Status == domain.ReportOpen && age > ReportSLA
	}
	return row
}

func reportBefore(a, b *domain.Report) bool {
	aOpen, bOpen := a.Status == domain.ReportOpen, b.Status == domain.ReportOpen
	switch {
	case aOpen != bOpen:
		return aOpen
	case !aOpen:
		return a.CreatedAt > b.CreatedAt
	case a.Priority != b.Priority:
		return a.Priority < b.Priority
	default:
		return a.CreatedAt < b.CreatedAt
	}
}

// OpenReportsCount is the back-office KPI for the steward dashboard.
func (s *Service) OpenReportsCount(ctx context.Context) (int, error) {
	if s.reports == nil {
		return 0, nil
	}
	return s.reports.OpenCount(ctx)
}

// ResolveReportInput is a reviewer's decision on a report (K11).
type ResolveReportInput struct {
	Status     string `json:"status"` // actioned | dismissed
	Action     string `json:"action"` // none (default) | remove | remove_and_suspend
	Resolution string `json:"resolution"`
}

func (in *ResolveReportInput) normalise() error {
	in.Resolution = strings.TrimSpace(in.Resolution)
	if in.Action == "" {
		in.Action = domain.ReportActionNone
	}
	switch in.Action {
	case domain.ReportActionRemove, domain.ReportActionRemoveAndSuspend:
		in.Status = domain.ReportActioned
		if in.Resolution == "" {
			return fmt.Errorf("add a note saying why the content was removed")
		}
	case domain.ReportActionNone:
	default:
		return fmt.Errorf("invalid action %q", in.Action)
	}
	if in.Status != domain.ReportActioned && in.Status != domain.ReportDismissed {
		return fmt.Errorf("invalid resolution %q", in.Status)
	}
	return nil
}

// ResolveReport closes a report. "remove" takes the content down and
// "remove_and_suspend" also suspends the member responsible, in one step;
// both are written to the moderation audit trail. Resolving with "none" puts
// back content an urgent report had hidden. The reporter is told the outcome.
func (s *Service) ResolveReport(ctx context.Context, id string, in ResolveReportInput, reviewerID string) error {
	if err := in.normalise(); err != nil {
		return err
	}
	rep, err := s.reports.Get(ctx, id)
	if err != nil {
		return err
	}
	if rep == nil {
		return &domain.NotFoundError{Entity: "report"}
	}
	rep.ReviewedByID = reviewerID
	if err := s.applyReportAction(ctx, rep, in.Action, reviewerID); err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if err := s.reports.Resolve(ctx, id, in.Status, in.Action, reviewerID, in.Resolution, now); err != nil {
		return err
	}
	if in.Action != domain.ReportActionNone {
		s.auditReportAction(ctx, rep, in.Action, reviewerID, in.Resolution, now)
	}
	s.notifyReporter(ctx, rep, in.Status, in.Action)
	return nil
}

func (s *Service) applyReportAction(ctx context.Context, rep *domain.Report, action, reviewerID string) error {
	switch action {
	case domain.ReportActionNone:
		if rep.AutoHidden && rep.Status == domain.ReportOpen {
			return s.restoreReportTarget(ctx, rep)
		}
		return nil
	case domain.ReportActionRemove:
		return s.removeReportTarget(ctx, rep, reviewerID)
	}
	if err := s.removeReportTarget(ctx, rep, reviewerID); err != nil {
		return err
	}
	if rep.TargetOwnerID == "" {
		return nil
	}
	return s.members.SetSuspended(ctx, rep.TargetOwnerID, true)
}

func (s *Service) auditReportAction(ctx context.Context, rep *domain.Report, action, reviewerID, note, now string) {
	if s.mod == nil {
		return
	}
	if err := s.mod.Insert(ctx, domain.ModerationRecord{
		ID: newID(domain.PrefixModeration), ListingID: rep.ListingID, ModeratorID: reviewerID,
		Action: "report-" + action, Reason: note, CreatedAt: now,
		TargetType: reportTargetType(rep), TargetID: reportTargetID(rep),
	}); err != nil {
		s.log.Warn("report: audit record failed", "reportId", rep.ID, "err", err)
	}
}

func (s *Service) notifyReporter(ctx context.Context, rep *domain.Report, status, action string) {
	if rep.ReporterID == "" {
		return
	}
	title := rep.TargetTitle
	if title == "" {
		title = rep.ListingTitle
	}
	body := fmt.Sprintf("We reviewed your report about “%s”: %s. Thank you for helping keep Oguaa safe.", title, reportOutcome(status, action))
	s.notify(ctx, rep.ReporterID, "report", "Your report was reviewed", body, "")
}
