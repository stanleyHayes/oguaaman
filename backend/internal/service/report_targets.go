package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── report targets: resolving, hiding, restoring and removing reported content ─
//
// Every reportable content type (K11) resolves to a reportTarget: a readable
// title, the member responsible for it, the listing it lives on (when there is
// one) and an evidence snapshot. Urgent reports (child safety, intimate images)
// withdraw the content from public view where the type supports it; a steward
// then removes it for good or puts it back. Nothing is deleted outright except
// a storefront item, whose snapshot the report keeps as evidence.

// reportTarget is a resolved piece of reported content.
type reportTarget struct {
	Type    string
	ID      string
	Title   string
	OwnerID string
	Listing *domain.Listing // the listing the content is or lives on, if any
	// Status is the content's current visibility, restored if an urgent
	// report's auto-hide is undone ("" when the type has none).
	Status   string
	evidence any
}

const (
	maxReportTargetIDLen = 200
	maxEvidenceBytes     = 64 << 10
	reportNoteRemoved    = "removed after a report"
)

// resolveReportTarget looks up the content a report names.
func (s *Service) resolveReportTarget(ctx context.Context, typ, id, listingID string) (*reportTarget, error) {
	if id == "" || len(id) > maxReportTargetIDLen {
		return nil, &domain.NotFoundError{Entity: "content"}
	}
	switch typ {
	case domain.ReportTargetListing:
		return s.listingTarget(ctx, id)
	case domain.ReportTargetMember:
		return s.memberTarget(ctx, id)
	case domain.ReportTargetReview:
		return s.reviewTarget(ctx, id)
	case domain.ReportTargetTribute:
		return s.tributeTarget(ctx, id)
	case domain.ReportTargetProduct:
		return s.productTarget(ctx, listingID, id)
	case domain.ReportTargetNews:
		return s.newsTarget(ctx, id)
	case domain.ReportTargetAgent:
		return s.agentTarget(ctx, id)
	case domain.ReportTargetAgentReview:
		return s.agentReviewTarget(ctx, id)
	case domain.ReportTargetAIOutput:
		return &reportTarget{Type: typ, ID: id, Title: "AI writing suggestion"}, nil
	}
	return nil, fmt.Errorf("choose what you are reporting")
}

func (s *Service) listingTarget(ctx context.Context, id string) (*reportTarget, error) {
	l, err := s.listings.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return &reportTarget{Type: domain.ReportTargetListing, ID: l.ID, Title: l.Title, OwnerID: l.OwnerID, Listing: l, Status: l.Status, evidence: l}, nil
}

func (s *Service) memberTarget(ctx context.Context, id string) (*reportTarget, error) {
	m, err := s.members.ByID(ctx, id)
	if err != nil || m == nil {
		if m, err = s.members.BySlug(ctx, id); err != nil {
			return nil, err
		}
		if m == nil {
			return nil, &domain.NotFoundError{Entity: "member"}
		}
	}
	// Public profile fields only: the evidence never copies private data.
	snap := map[string]any{"id": m.ID, "slug": m.Slug, "displayName": m.DisplayName, "bio": m.Bio, "photoUrl": m.PhotoURL}
	return &reportTarget{Type: domain.ReportTargetMember, ID: m.ID, Title: m.DisplayName, OwnerID: m.ID, evidence: snap}, nil
}

func (s *Service) reviewTarget(ctx context.Context, id string) (*reportTarget, error) {
	if s.reviews == nil {
		return nil, &domain.NotFoundError{Entity: "review"}
	}
	rv, err := s.reviews.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	t := &reportTarget{Type: domain.ReportTargetReview, ID: rv.ID, Title: "Review by " + rv.AuthorName, OwnerID: rv.MemberID, Status: rv.Status, evidence: rv}
	if l, err := s.listings.GetByID(ctx, rv.ListingID); err == nil {
		t.Listing = l
		t.Title = fmt.Sprintf("Review of %s by %s", l.Title, rv.AuthorName)
	}
	return t, nil
}

func (s *Service) tributeTarget(ctx context.Context, id string) (*reportTarget, error) {
	l, err := s.listings.GetByTributeID(ctx, id)
	if err != nil {
		return nil, err
	}
	for _, tr := range l.Tributes {
		if tr.ID == id {
			return &reportTarget{Type: domain.ReportTargetTribute, ID: id, Title: "Tribute on " + l.Title + " by " + tr.AuthorName,
				OwnerID: tr.MemberID, Listing: l, Status: tr.Status, evidence: tr}, nil
		}
	}
	return nil, &domain.NotFoundError{Entity: tributeNoun}
}

func (s *Service) productTarget(ctx context.Context, listingID, id string) (*reportTarget, error) {
	if listingID == "" {
		return nil, fmt.Errorf("say which business the product belongs to (listingId)")
	}
	l, err := s.listings.GetByID(ctx, listingID)
	if err != nil {
		return nil, err
	}
	for _, items := range [][]domain.StoreItem{l.Products, l.Services} {
		for _, it := range items {
			if it.ID == id {
				return &reportTarget{Type: domain.ReportTargetProduct, ID: id, Title: it.Name + " (" + l.Title + ")", OwnerID: l.OwnerID, Listing: l, evidence: it}, nil
			}
		}
	}
	return nil, &domain.NotFoundError{Entity: "product"}
}

func (s *Service) newsTarget(ctx context.Context, id string) (*reportTarget, error) {
	if s.news == nil {
		return nil, &domain.NotFoundError{Entity: "article"}
	}
	a, err := s.news.Get(ctx, id)
	if err != nil {
		if a, err = s.news.BySlug(ctx, id); err != nil {
			return nil, err
		}
	}
	return &reportTarget{Type: domain.ReportTargetNews, ID: a.ID, Title: a.Title, OwnerID: a.AuthorID, Status: a.Status, evidence: a}, nil
}

func (s *Service) agentTarget(ctx context.Context, id string) (*reportTarget, error) {
	if s.agents == nil {
		return nil, &domain.NotFoundError{Entity: "agent"}
	}
	a, err := s.agents.ByID(ctx, id)
	if err != nil {
		if a, err = s.agents.BySlug(ctx, id); err != nil {
			return nil, err
		}
	}
	return &reportTarget{Type: domain.ReportTargetAgent, ID: a.ID, Title: a.DisplayName, OwnerID: a.MemberID, Status: a.Status, evidence: a}, nil
}

func (s *Service) agentReviewTarget(ctx context.Context, id string) (*reportTarget, error) {
	if s.agentReviews == nil {
		return nil, &domain.NotFoundError{Entity: "review"}
	}
	rv, err := s.agentReviews.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	author := rv.ClientName
	if author == "" {
		author = "a client"
	}
	t := &reportTarget{Type: domain.ReportTargetAgentReview, ID: rv.ID, Title: "Agent review by " + author,
		OwnerID: rv.ClientMemberID, Status: rv.Status, evidence: rv}
	if s.agents != nil {
		if a, err := s.agents.ByID(ctx, rv.AgentID); err == nil {
			t.Title = fmt.Sprintf("Review of %s by %s", a.DisplayName, author)
		}
	}
	return t, nil
}

// setAgentReviewStatus changes an agent review's visibility and refreshes the
// agent's rating so hidden and removed reviews stop counting.
func (s *Service) setAgentReviewStatus(ctx context.Context, id, status string) error {
	if err := s.agentReviews.SetStatus(ctx, id, status); err != nil {
		return err
	}
	rv, err := s.agentReviews.Get(ctx, id)
	if err != nil || s.agents == nil {
		return err
	}
	return recomputeAgentRating(ctx, s.agentReviews, s.agents, rv.AgentID)
}

// evidenceSnapshot is the content as it was reported, as JSON, bounded.
func evidenceSnapshot(v any) string {
	if v == nil {
		return ""
	}
	b, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	if len(b) > maxEvidenceBytes {
		b = b[:maxEvidenceBytes]
	}
	return string(b)
}

// hideReportTarget withdraws content from public view pending review. It
// reports whether the type supports hiding and the content was visible.
func (s *Service) hideReportTarget(ctx context.Context, t *reportTarget) (bool, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	switch t.Type {
	case domain.ReportTargetListing:
		if t.Status != domain.StatusApproved {
			return false, nil
		}
		return true, s.listings.HoldForReview(ctx, t.ID, now)
	case domain.ReportTargetReview:
		if t.Status != "" {
			return false, nil
		}
		return true, s.setReviewStatus(ctx, t, domain.ReviewHidden)
	case domain.ReportTargetAgentReview:
		if t.Status != "" {
			return false, nil
		}
		return true, s.setAgentReviewStatus(ctx, t.ID, domain.ReviewHidden)
	case domain.ReportTargetTribute:
		if t.Status != "" {
			return false, nil
		}
		return true, s.listings.SetTributeStatus(ctx, t.Listing.ID, t.ID, domain.TributeHidden)
	case domain.ReportTargetNews:
		if t.Status != domain.NewsPublished {
			return false, nil
		}
		return true, s.news.SetPublished(ctx, t.ID, domain.NewsDraft, "")
	case domain.ReportTargetAgent:
		if t.Status == domain.AgentStatusSuspended {
			return false, nil
		}
		return true, s.setAgentStatus(ctx, t.ID, domain.AgentStatusSuspended)
	}
	return false, nil
}

// restoreReportTarget puts auto-hidden content back as it was.
func (s *Service) restoreReportTarget(ctx context.Context, rep *domain.Report) error {
	id := rep.TargetID
	switch rep.TargetType {
	case domain.ReportTargetListing, "":
		if id == "" {
			id = rep.ListingID
		}
		return s.listings.UpdateStatus(ctx, id, rep.HiddenFromStatus, rep.ReviewedByID, "restored after review", time.Now().UTC().Format(time.RFC3339))
	case domain.ReportTargetReview:
		return s.setReviewStatus(ctx, &reportTarget{ID: id, Listing: &domain.Listing{ID: rep.ListingID}}, "")
	case domain.ReportTargetAgentReview:
		return s.setAgentReviewStatus(ctx, id, "")
	case domain.ReportTargetTribute:
		return s.listings.SetTributeStatus(ctx, rep.ListingID, id, "")
	case domain.ReportTargetNews:
		return s.news.SetPublished(ctx, id, domain.NewsPublished, time.Now().UTC().Format(time.RFC3339))
	case domain.ReportTargetAgent:
		return s.setAgentStatus(ctx, id, rep.HiddenFromStatus)
	}
	return nil
}

// removeReportTarget takes reported content down for good (kept as evidence
// where the type allows). A reported member is suspended.
func (s *Service) removeReportTarget(ctx context.Context, rep *domain.Report, reviewerID string) error {
	t, err := s.resolveReportTarget(ctx, reportTargetType(rep), reportTargetID(rep), rep.ListingID)
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	switch t.Type {
	case domain.ReportTargetListing:
		return s.listings.UpdateStatus(ctx, t.ID, domain.StatusUnpublished, reviewerID, reportNoteRemoved, now)
	case domain.ReportTargetMember:
		return s.members.SetSuspended(ctx, t.ID, true)
	case domain.ReportTargetReview:
		return s.setReviewStatus(ctx, t, domain.ReviewRemoved)
	case domain.ReportTargetAgentReview:
		return s.setAgentReviewStatus(ctx, t.ID, domain.ReviewRemoved)
	case domain.ReportTargetTribute:
		return s.listings.SetTributeStatus(ctx, t.Listing.ID, t.ID, domain.TributeRemoved)
	case domain.ReportTargetProduct:
		return s.listings.RemoveStoreItem(ctx, t.Listing.ID, t.ID)
	case domain.ReportTargetNews:
		return s.news.SetPublished(ctx, t.ID, domain.NewsDraft, "")
	case domain.ReportTargetAgent:
		return s.setAgentStatus(ctx, t.ID, domain.AgentStatusSuspended)
	}
	return fmt.Errorf("this kind of content can't be removed from the reports queue")
}

// setReviewStatus changes a review's visibility and refreshes the business's
// aggregate rating so hidden and removed reviews stop counting.
func (s *Service) setReviewStatus(ctx context.Context, t *reportTarget, status string) error {
	if err := s.reviews.SetStatus(ctx, t.ID, status); err != nil {
		return err
	}
	if t.Listing == nil || t.Listing.ID == "" {
		return nil
	}
	all, err := s.reviews.ByListing(ctx, t.Listing.ID)
	if err != nil {
		return err
	}
	avg, count := ratingAggregate(visibleReviews(all))
	return s.listings.SetRating(ctx, t.Listing.ID, avg, count)
}

func (s *Service) setAgentStatus(ctx context.Context, id, status string) error {
	if status == "" {
		return nil
	}
	a, err := s.agents.ByID(ctx, id)
	if err != nil {
		return err
	}
	a.Status = status
	a.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	_, err = s.agents.Update(ctx, a)
	return err
}

// reportTargetType / reportTargetID read a report's target, treating rows from
// before targets were generalised as listing reports.
func reportTargetType(rep *domain.Report) string {
	if rep.TargetType == "" {
		return domain.ReportTargetListing
	}
	return rep.TargetType
}

func reportTargetID(rep *domain.Report) string {
	if rep.TargetID == "" {
		return rep.ListingID
	}
	return rep.TargetID
}

// thresholdHeldTypes are the sensitive listings withheld for review once
// reportThreshold different people have open reports against them (A017).
var thresholdHeldTypes = map[string]bool{
	domain.TypeIncident: true, domain.TypeLostFound: true, domain.TypeMemorial: true,
}

const reportThreshold = 3

// holdAfterRepeatedReports withdraws a sensitive listing (incident, lost &
// found notice, memorial) once several distinct people have open reports
// against it. It reports whether the listing was withheld.
func (s *Service) holdAfterRepeatedReports(ctx context.Context, t *reportTarget) bool {
	if t.Type != domain.ReportTargetListing || t.Listing == nil || !thresholdHeldTypes[t.Listing.Type] || t.Listing.Status != domain.StatusApproved {
		return false
	}
	open, err := s.reports.OpenByTarget(ctx, domain.ReportTargetListing, t.ID)
	if err != nil {
		return false
	}
	// Anonymous reports count as one reporter together: one person can send
	// any number of them.
	reporters := map[string]bool{}
	for _, r := range open {
		key := r.ReporterID
		if key == "" {
			key = "anon"
		}
		reporters[key] = true
	}
	if len(reporters) < reportThreshold {
		return false
	}
	return s.listings.HoldForReview(ctx, t.ID, time.Now().UTC().Format(time.RFC3339)) == nil
}

// reportOutcome is the reporter-facing summary of a resolution.
func reportOutcome(status, action string) string {
	switch {
	case action == domain.ReportActionRemoveAndSuspend:
		return "we removed it and suspended the account responsible"
	case action == domain.ReportActionRemove:
		return "we removed it"
	case status == domain.ReportActioned:
		return "we took action"
	default:
		return "it doesn't break our community rules, so it stays up"
	}
}

// staffNoticeTitle names a new report for the staff in-box.
func staffNoticeTitle(rep *domain.Report) string {
	if domain.UrgentReportReason(rep.Reason) {
		return "Urgent: " + strings.ToLower(reportReasonLabel(rep.Reason)) + " report"
	}
	return "Content was reported"
}
