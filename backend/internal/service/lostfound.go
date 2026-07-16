package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── lost & found: lost items, found items, missing people ────────────────────

var validLostFoundKinds = map[string]bool{
	"lost_item": true, "found_item": true, "missing_person": true,
}

// The resolution lifecycle a notice can be closed with (it opens as "open").
var validLostFoundStatuses = map[string]bool{
	"reunited": true, "closed": true,
}

// LostFoundInput is a member's notice (kind validated below).
type LostFoundInput struct {
	Title            string `json:"title"`
	Kind             string `json:"kind"`
	Description      string `json:"description"`
	LastSeenLocation string `json:"lastSeenLocation"`
	LastSeenDate     string `json:"lastSeenDate"`
	Contact          string `json:"contact"`
	CoverImageURL    string `json:"coverImageUrl"`
}

// LostFoundFilters narrows the lost & found feed; empty fields are ignored.
type LostFoundFilters struct {
	Kind   string // details.kind
	Status string // details.lfStatus
}

// SubmitLostFound posts a lost & found notice. Like an incident it is
// time-critical — especially for missing people — so it auto-publishes
// (approved, published now) with lfStatus=open, and the owner or a curator
// resolves it afterwards.
func (s *Service) SubmitLostFound(ctx context.Context, member *domain.Member, in LostFoundInput) (*domain.Listing, error) {
	if member == nil {
		// Same guard as SubmitIncident: refuse an anonymous notice.
		return nil, fmt.Errorf("a signed-in member is required to post a lost & found notice")
	}
	if !validLostFoundKinds[in.Kind] {
		return nil, fmt.Errorf("choose a valid notice kind")
	}
	title := strings.TrimSpace(in.Title)
	if len(title) < 2 || len(title) > 160 {
		return nil, fmt.Errorf("title must be 2–160 characters")
	}
	description := strings.TrimSpace(in.Description)
	if description == "" {
		return nil, fmt.Errorf("a description is required — who or what, and how to recognise them")
	}
	contact := strings.TrimSpace(in.Contact)
	if contact == "" {
		return nil, fmt.Errorf("a contact is required so people can reach you")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	suffix := fmt.Sprintf("%d", time.Now().UnixNano()%1_000_000)
	l := domain.Listing{
		ID:            "lf-" + slugify(title) + "-" + suffix,
		Slug:          slugify(title) + "-" + suffix,
		Type:          domain.TypeLostFound,
		OwnerID:       member.ID,
		Title:         title,
		Status:        domain.StatusApproved, // auto-published: time-critical
		Tags:          []string{"lost-found", in.Kind},
		TownID:        member.TownID,
		CoverImageURL: strings.TrimSpace(in.CoverImageURL),
		CreatedAt:     now,
		SubmittedAt:   now,
		PublishedAt:   now,
		Details: map[string]any{
			"kind":             in.Kind,
			"description":      description,
			"lastSeenLocation": strings.TrimSpace(in.LastSeenLocation),
			"lastSeenDate":     strings.TrimSpace(in.LastSeenDate),
			"contact":          contact,
			"lfStatus":         "open",
		},
	}
	if err := s.listings.Insert(ctx, l); err != nil {
		return nil, err
	}
	if in.Kind == "missing_person" {
		s.notifyCuratorsOfMissingPerson(ctx, &l)
	}
	return &l, nil
}

// notifyCuratorsOfMissingPerson alerts every curator/steward to a missing
// person, mirroring the incident-alert pattern.
func (s *Service) notifyCuratorsOfMissingPerson(ctx context.Context, l *domain.Listing) {
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
			MemberID: m.ID, Kind: "lostfound",
			Title:     "Missing person alert",
			Body:      fmt.Sprintf("“%s” was posted. Spread the word and help coordinate the search.", l.Title),
			Link:      "/lost-found",
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		})
	}
}

// LostFound lists approved lost & found notices, newest first, with optional
// filters on the kind and the resolution lifecycle status.
func (s *Service) LostFound(ctx context.Context, f LostFoundFilters) ([]domain.Listing, error) {
	items, err := s.approved(ctx, domain.TypeLostFound)
	if err != nil {
		return nil, err
	}
	out := []domain.Listing{}
	for _, l := range items {
		if f.Kind != "" && asString(l.Details, "kind") != f.Kind {
			continue
		}
		if f.Status != "" && asString(l.Details, "lfStatus") != f.Status {
			continue
		}
		out = append(out, l)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return out, nil
}

// LostFoundBySlug fetches one published lost & found notice by slug.
func (s *Service) LostFoundBySlug(ctx context.Context, slug string) (*domain.Listing, error) {
	return s.ListingBySlug(ctx, domain.TypeLostFound, slug)
}

// ResolveLostFound closes a notice as reunited or closed. Only the person who
// posted it or a curator/steward may resolve it.
func (s *Service) ResolveLostFound(ctx context.Context, listingID string, actor *domain.Member, newStatus string) error {
	if actor == nil {
		return &domain.ForbiddenError{Reason: "a signed-in member is required to resolve a lost & found notice"}
	}
	if !validLostFoundStatuses[newStatus] {
		return fmt.Errorf("invalid lost & found status %q", newStatus)
	}
	l, err := s.listings.GetByID(ctx, listingID)
	if err != nil {
		return err
	}
	if l.Type != domain.TypeLostFound {
		return &domain.NotFoundError{Entity: "lost & found notice"}
	}
	if actor.ID != l.OwnerID && actor.Role != domain.RoleCurator && actor.Role != domain.RoleSteward {
		return &domain.ForbiddenError{Reason: "only the person who posted the notice or a curator can resolve it"}
	}
	return s.listings.SetLostFoundStatus(ctx, listingID, newStatus)
}
