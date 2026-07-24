package service

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── fundraising campaigns (Creator Monetization) ─────────────────────────────
//
// A campaign is a member-created `project` listing (details.campaign = true) so
// it reuses the adopt-a-project engine end to end: pledges, raised totals,
// backers, the project detail page, creator earnings and the revenue ledger.
// Two things make campaigns their own feature:
//   • Paid gate — only a member with an active creator subscription may create one.
//   • First-time approval — a member's first campaign enters the moderation
//     queue; once approved, the member is "campaigner vetted" and subsequent
//     campaigns auto-publish on submit (see Moderate's vetting hook).

const (
	campaignTag            = "campaign"
	minCampaignGoalPesewas = 5_00          // GH₵ 5
	maxCampaignGoalPesewas = 100_000_000_0 // GH₵ 10,000,000
	maxCampaignStoryRunes  = 5000
	minCampaignStoryRunes  = 20
)

// CampaignInput is the stepwise-wizard payload for creating a campaign.
type CampaignInput struct {
	Title         string `json:"title"`
	Category      string `json:"category"`
	CoverImageURL string `json:"coverImageUrl"`
	Description   string `json:"description"`
	GoalPesewas   int64  `json:"goalPesewas"`
	Deadline      string `json:"deadline"` // optional; RFC3339 or YYYY-MM-DD
	TownID        string `json:"townId"`
}

// CreateCampaign validates and creates a campaign for a paid creator. It returns
// the created listing. Status depends on the member's vetting: pending for a
// first campaign, approved (auto-published) once vetted.
func (s *Service) CreateCampaign(ctx context.Context, actor *domain.Member, in CampaignInput) (*domain.Listing, error) {
	if actor == nil {
		return nil, &domain.ForbiddenError{Reason: "sign in to start a campaign"}
	}
	now := time.Now().UTC()
	if !CreatorSubscriptionActive(actor, now) {
		return nil, &domain.ForbiddenError{Reason: "starting a campaign needs an active creator plan"}
	}
	title := strings.TrimSpace(in.Title)
	if len(title) < 2 || len(title) > 160 {
		return nil, fmt.Errorf("title must be 2–160 characters")
	}
	story := strings.TrimSpace(in.Description)
	if n := len([]rune(story)); n < minCampaignStoryRunes || n > maxCampaignStoryRunes {
		return nil, fmt.Errorf("tell the story in %d–%d characters", minCampaignStoryRunes, maxCampaignStoryRunes)
	}
	if in.GoalPesewas < minCampaignGoalPesewas || in.GoalPesewas > maxCampaignGoalPesewas {
		return nil, fmt.Errorf("set a goal between GH₵ 5 and GH₵ 10,000,000")
	}
	deadline, err := normalizeDeadline(in.Deadline, now)
	if err != nil {
		return nil, err
	}

	nano := strconv.FormatInt(now.UnixNano(), 10)
	nowISO := now.Format(time.RFC3339)
	details := map[string]any{
		"campaign":      true,
		"description":   story,
		"goalPesewas":   in.GoalPesewas,
		"raisedPesewas": int64(0),
		"backers":       0,
	}
	if cat := strings.TrimSpace(in.Category); cat != "" {
		details["category"] = cat
	}
	if deadline != "" {
		details["deadline"] = deadline
	}
	l := domain.Listing{
		ID:            domain.PrefixListing + slugify(title) + "-" + nano,
		Slug:          slugify(title) + "-" + nano[len(nano)-7:],
		Type:          domain.TypeProject,
		OwnerID:       actor.ID,
		Title:         title,
		Tags:          []string{campaignTag},
		TownID:        strings.TrimSpace(in.TownID),
		CoverImageURL: safeURL(strings.TrimSpace(in.CoverImageURL)),
		Details:       details,
		CreatedAt:     nowISO,
		SubmittedAt:   nowISO,
	}
	// First-time approval: a vetted campaigner's campaigns auto-publish; a first
	// campaign enters the moderation queue.
	if actor.CampaignerVetted {
		l.Status = domain.StatusApproved
		l.ReviewedByID = "system"
		l.ReviewedAt = nowISO
		l.PublishedAt = nowISO
	} else {
		l.Status = domain.StatusPending
	}
	if err := s.listings.Insert(ctx, l); err != nil {
		return nil, err
	}
	return &l, nil
}

// normalizeDeadline accepts an empty string (no deadline), an RFC3339 timestamp,
// or a YYYY-MM-DD date, and returns a normalized RFC3339 value that must be in
// the future.
func normalizeDeadline(raw string, now time.Time) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		if !t.After(now) {
			return "", fmt.Errorf("the deadline must be in the future")
		}
		return t.UTC().Format(time.RFC3339), nil
	}
	if t, err := time.Parse("2006-01-02", raw); err == nil {
		// End of the given day, UTC.
		end := time.Date(t.Year(), t.Month(), t.Day(), 23, 59, 59, 0, time.UTC)
		if !end.After(now) {
			return "", fmt.Errorf("the deadline must be in the future")
		}
		return end.Format(time.RFC3339), nil
	}
	return "", fmt.Errorf("the deadline must be a valid date")
}

// Campaigns lists approved, member-created campaigns (newest first) — the public
// campaign wall, distinct from curated civic adopt-a-project listings.
func (s *Service) Campaigns(ctx context.Context) ([]domain.Listing, error) {
	all, err := s.listings.Find(ctx, domain.ListingFilter{Type: domain.TypeProject, Status: domain.StatusApproved})
	if err != nil {
		return nil, err
	}
	out := []domain.Listing{}
	for _, l := range all {
		if isCampaign(l) {
			out = append(out, l)
		}
	}
	sortListingsNewestFirst(out)
	return out, nil
}

// MyCampaigns lists a member's own campaigns, any status, newest first.
func (s *Service) MyCampaigns(ctx context.Context, memberID string) ([]domain.Listing, error) {
	owned, err := s.listings.Find(ctx, domain.ListingFilter{Type: domain.TypeProject, OwnerID: memberID})
	if err != nil {
		return nil, err
	}
	out := []domain.Listing{}
	for _, l := range owned {
		if isCampaign(l) {
			out = append(out, l)
		}
	}
	sortListingsNewestFirst(out)
	return out, nil
}

// isCampaign reports whether a project listing is a member-created campaign.
func isCampaign(l domain.Listing) bool {
	c, _ := l.Details["campaign"].(bool)
	return c
}

func sortListingsNewestFirst(ls []domain.Listing) {
	for i := 1; i < len(ls); i++ {
		for j := i; j > 0 && ls[j].CreatedAt > ls[j-1].CreatedAt; j-- {
			ls[j], ls[j-1] = ls[j-1], ls[j]
		}
	}
}
