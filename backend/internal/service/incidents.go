package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── incidents: community safety — rescue & early recovery ────────────────────

var validIncidentCategories = map[string]bool{
	"flood": true, "fire": true, "accident": true, "medical": true,
	"crime": true, "utility": true, "other": true,
}

var validIncidentSeverities = map[string]bool{
	"low": true, "medium": true, "high": true, "critical": true,
}

// The operational lifecycle an incident moves through. Curators verify and
// transition it after the (time-critical) auto-publish.
var validIncidentStatuses = map[string]bool{
	"reported": true, "verified": true, "responding": true, "resolved": true, "recovered": true,
}

// IncidentInput is a member's safety report (category/severity validated below).
type IncidentInput struct {
	Title       string `json:"title"`
	Category    string `json:"category"`
	Severity    string `json:"severity"`
	Location    string `json:"location"`
	Contact     string `json:"contact"`
	Description string `json:"description"`
}

// IncidentFilters narrows the incident feed; empty fields are ignored.
type IncidentFilters struct {
	Status   string // details.incidentStatus
	Category string // details.category
	Town     string // townId
}

// SubmitIncident files a safety report. Unlike every other listing type, an
// incident is time-critical: it auto-publishes (approved, published now) with
// incidentStatus=reported, and curators verify/transition it afterwards.
func (s *Service) SubmitIncident(ctx context.Context, member *domain.Member, in IncidentInput) (*domain.Listing, error) {
	if member == nil {
		// Same guard as Submit: the owner is the signed-in member, attributed by
		// the delivery layer. Refuse rather than write an anonymous safety report.
		return nil, fmt.Errorf("a signed-in member is required to report an incident")
	}
	if !validIncidentCategories[in.Category] {
		return nil, fmt.Errorf("choose a valid incident category")
	}
	if !validIncidentSeverities[in.Severity] {
		return nil, fmt.Errorf("choose a valid incident severity")
	}
	title := strings.TrimSpace(in.Title)
	if len(title) < 2 || len(title) > 160 {
		return nil, fmt.Errorf("title must be 2–160 characters")
	}
	location := strings.TrimSpace(in.Location)
	if location == "" {
		return nil, fmt.Errorf("a location is required so responders can find the incident")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	suffix := fmt.Sprintf("%d", time.Now().UnixNano()%1_000_000)
	l := domain.Listing{
		ID:          "inc-" + slugify(title) + "-" + suffix,
		Slug:        slugify(title) + "-" + suffix,
		Type:        domain.TypeIncident,
		OwnerID:     member.ID,
		Title:       title,
		Status:      domain.StatusApproved, // auto-published: time-critical
		Tags:        []string{"safety", in.Category},
		TownID:      member.TownID,
		CreatedAt:   now,
		SubmittedAt: now,
		PublishedAt: now,
		Details: map[string]any{
			"category":       in.Category,
			"severity":       in.Severity,
			"location":       location,
			"contact":        strings.TrimSpace(in.Contact),
			"incidentStatus": "reported",
			"statusHistory": []map[string]any{
				{"status": "reported", "by": member.ID, "note": "Incident reported", "at": now},
			},
			"description": strings.TrimSpace(in.Description),
		},
	}
	if err := s.listings.Insert(ctx, l); err != nil {
		return nil, err
	}
	if in.Severity == "high" || in.Severity == "critical" {
		s.notifyCuratorsOfIncident(ctx, &l)
	}
	return &l, nil
}

// notifyCuratorsOfIncident alerts every curator/steward to a severe incident,
// mirroring the report-alert pattern. Runs in a goroutine so the full-member
// scan does not hold up the time-critical incident creation response.
func (s *Service) notifyCuratorsOfIncident(ctx context.Context, l *domain.Listing) {
	if s.notifs == nil {
		return
	}
	go func() {
		members, err := s.members.All(context.Background())
		if err != nil {
			return
		}
		for i := range members {
			m := &members[i]
			if m.Role != domain.RoleCurator && m.Role != domain.RoleSteward {
				continue
			}
			_ = s.notifs.Insert(context.Background(), domain.Notification{
				ID:       "ntf-" + fmt.Sprintf("%d-%s", time.Now().UnixNano(), m.ID),
				MemberID: m.ID, Kind: "incident",
				Title:     "Urgent incident reported",
				Body:      fmt.Sprintf("\u201c%s\u201d (%s severity) was reported. Verify and coordinate response.", l.Title, asString(l.Details, "severity")),
				Link:      "/incidents",
				CreatedAt: time.Now().UTC().Format(time.RFC3339),
			})
		}
	}()
}

// Incidents lists approved incidents, newest first, with optional filters on
// the incident lifecycle status, category, and town.
func (s *Service) Incidents(ctx context.Context, f IncidentFilters) ([]domain.Listing, error) {
	items, err := s.approved(ctx, domain.TypeIncident)
	if err != nil {
		return nil, err
	}
	out := []domain.Listing{}
	for _, l := range items {
		if f.Status != "" && asString(l.Details, "incidentStatus") != f.Status {
			continue
		}
		if f.Category != "" && asString(l.Details, "category") != f.Category {
			continue
		}
		if f.Town != "" && l.TownID != f.Town {
			continue
		}
		out = append(out, l)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return out, nil
}

// Incident fetches one published incident by slug.
func (s *Service) Incident(ctx context.Context, slug string) (*domain.Listing, error) {
	return s.ListingBySlug(ctx, domain.TypeIncident, slug)
}

// TransitionIncident moves an incident through its lifecycle (curator/steward
// only), appending an audit entry to statusHistory. When the incident is
// resolved or recovered, the reporter is notified.
func (s *Service) TransitionIncident(ctx context.Context, listingID string, actor *domain.Member, newStatus, note string) error {
	if actor == nil || (actor.Role != domain.RoleCurator && actor.Role != domain.RoleSteward) {
		return &domain.ForbiddenError{Reason: "only curators and stewards can update an incident's status"}
	}
	if !validIncidentStatuses[newStatus] {
		return fmt.Errorf("invalid incident status %q", newStatus)
	}
	l, err := s.listings.GetByID(ctx, listingID)
	if err != nil {
		return err
	}
	if l.Type != domain.TypeIncident {
		return &domain.NotFoundError{Entity: "incident"}
	}
	now := time.Now().UTC().Format(time.RFC3339)
	entry := map[string]any{
		"status": newStatus,
		"by":     actor.ID,
		"note":   strings.TrimSpace(note),
		"at":     now,
	}
	if err := s.listings.UpdateIncidentStatus(ctx, listingID, newStatus, entry); err != nil {
		return err
	}
	if newStatus == "resolved" || newStatus == "recovered" {
		s.notifyIncidentOwner(ctx, l, newStatus)
	}
	return nil
}

// notifyIncidentOwner tells the reporter their incident was closed out.
func (s *Service) notifyIncidentOwner(ctx context.Context, l *domain.Listing, status string) {
	if s.notifs == nil {
		return
	}
	_ = s.notifs.Insert(ctx, domain.Notification{
		ID: newID(domain.PrefixNotification), MemberID: l.OwnerID,
		Kind: "incident", Title: "Your incident was marked " + status,
		Body:      fmt.Sprintf("“%s” is now %s. Thank you for keeping Oguaa safe.", l.Title, status),
		Link:      "/safety/" + l.Slug,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
}
