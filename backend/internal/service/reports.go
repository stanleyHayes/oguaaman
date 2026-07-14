package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── reports: notice-and-takedown (spec §14.3/§14.4/§14.7) ────────────────────

// ReportInput is a member-facing report against a listing.
type ReportInput struct {
	ListingID    string `json:"listingId"`
	Reason       string `json:"reason"`
	Detail       string `json:"detail"`
	ReporterID   string `json:"-"` // set from the session, never trusted from the body
	ReporterName string `json:"-"`
}

// SubmitReport records a report against a listing and alerts the stewards. The
// listing is denormalised onto the report so the triage queue reads cleanly even
// if the listing is later removed.
func (s *Service) SubmitReport(ctx context.Context, in ReportInput) (*domain.Report, error) {
	if s.reports == nil {
		return nil, fmt.Errorf("reports are not available")
	}
	if !domain.ValidReportReason(in.Reason) {
		return nil, fmt.Errorf("choose a reason for the report")
	}
	detail := strings.TrimSpace(in.Detail)
	if len(detail) > 2000 {
		return nil, fmt.Errorf("please keep the detail under 2000 characters")
	}
	listing, err := s.listings.GetByID(ctx, in.ListingID)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	rep := domain.Report{
		ID:           "rpt-" + fmt.Sprintf("%d", time.Now().UnixNano()),
		ListingID:    listing.ID,
		ListingSlug:  listing.Slug,
		ListingType:  listing.Type,
		ListingTitle: listing.Title,
		Reason:       in.Reason,
		Detail:       detail,
		ReporterID:   in.ReporterID,
		ReporterName: in.ReporterName,
		Status:       domain.ReportOpen,
		CreatedAt:    now,
	}
	if err := s.reports.Insert(ctx, rep); err != nil {
		return nil, err
	}
	s.notifyStewardsOfReport(ctx, &rep)
	return &rep, nil
}

// notifyStewardsOfReport drops a notice in every curator/steward's in-box so the
// report surfaces in the back-office without polling.
func (s *Service) notifyStewardsOfReport(ctx context.Context, rep *domain.Report) {
	if s.notifs == nil {
		return
	}
	members, err := s.members.All(ctx)
	if err != nil {
		return
	}
	for i := range members {
		m := &members[i]
		if m.Role != domain.RoleCurator && m.Role != domain.RoleSteward {
			continue
		}
		_ = s.notifs.Insert(ctx, domain.Notification{
			ID:       "ntf-" + fmt.Sprintf("%d-%s", time.Now().UnixNano(), m.ID),
			MemberID: m.ID, Kind: "report",
			Title:     "A listing was reported",
			Body:      fmt.Sprintf("“%s” was reported (%s). Review it in the queue.", rep.ListingTitle, reportReasonLabel(rep.Reason)),
			Link:      "/reports",
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		})
	}
}

func reportReasonLabel(reason string) string {
	switch reason {
	case domain.ReasonInaccurate:
		return "not accurate"
	case domain.ReasonInappropriate:
		return "inappropriate"
	case domain.ReasonImpersonation:
		return "impersonation"
	case domain.ReasonBereavement:
		return "a memorial concern"
	default:
		return "other"
	}
}

// Reports returns every report, newest first (steward triage queue).
func (s *Service) Reports(ctx context.Context) ([]domain.Report, error) {
	reps, err := s.reports.All(ctx)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(reps, func(i, j int) bool { return reps[i].CreatedAt > reps[j].CreatedAt })
	return reps, nil
}

// OpenReportsCount is the back-office KPI for the steward dashboard.
func (s *Service) OpenReportsCount(ctx context.Context) (int, error) {
	if s.reports == nil {
		return 0, nil
	}
	return s.reports.OpenCount(ctx)
}

// ResolveReport closes a report as actioned or dismissed.
func (s *Service) ResolveReport(ctx context.Context, id, status, resolution, reviewerID string) error {
	if status != domain.ReportActioned && status != domain.ReportDismissed {
		return fmt.Errorf("invalid resolution %q", status)
	}
	now := time.Now().UTC().Format(time.RFC3339)
	return s.reports.UpdateStatus(ctx, id, status, reviewerID, strings.TrimSpace(resolution), now)
}
