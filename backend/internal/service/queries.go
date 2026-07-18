package service

import (
	"context"
	"sort"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── reads: listings by type ──────────────────────────────────────────────────

func (s *Service) approved(ctx context.Context, typ string) ([]domain.Listing, error) {
	return s.listings.Find(ctx, domain.ListingFilter{Type: typ, Status: domain.StatusApproved})
}

func (s *Service) Artists(ctx context.Context) ([]domain.Listing, error) {
	return s.approved(ctx, domain.TypeArtist)
}

func (s *Service) ListingBySlug(ctx context.Context, typ, slug string) (*domain.Listing, error) {
	l, err := s.listings.GetBySlug(ctx, typ, slug)
	if err != nil {
		return nil, err
	}
	if l.Status != domain.StatusApproved {
		return nil, &domain.NotFoundError{Entity: typ}
	}
	return l, nil
}

func (s *Service) SpotlightArtist(ctx context.Context) (*domain.Listing, error) {
	artists, err := s.Artists(ctx)
	if err != nil {
		return nil, err
	}
	for i := range artists {
		if b, _ := artists[i].Details["spotlight"].(bool); b {
			return &artists[i], nil
		}
	}
	if len(artists) > 0 {
		return &artists[0], nil
	}
	return nil, &domain.NotFoundError{Entity: "artist"}
}

func (s *Service) Genres(ctx context.Context) ([]string, error) {
	artists, err := s.Artists(ctx)
	if err != nil {
		return nil, err
	}
	set := map[string]bool{}
	for _, a := range artists {
		for _, g := range asStringSlice(a.Details["genres"]) {
			set[g] = true
		}
	}
	out := make([]string, 0, len(set))
	for g := range set {
		out = append(out, g)
	}
	sort.Strings(out)
	return out, nil
}

func (s *Service) People(ctx context.Context) ([]domain.Listing, error) {
	return s.approved(ctx, domain.TypePerson)
}

func (s *Service) MusicLegacy(ctx context.Context) ([]domain.Listing, error) {
	people, err := s.People(ctx)
	if err != nil {
		return nil, err
	}
	out := []domain.Listing{}
	for _, p := range people {
		if contains(p.Tags, "music") {
			out = append(out, p)
		}
	}
	return out, nil
}

func (s *Service) Memorials(ctx context.Context) ([]domain.Listing, error) {
	return s.approved(ctx, domain.TypeMemorial)
}

// Projects — adopt-a-project campaigns (spec §4/§6/§15), open ones first.
func (s *Service) Projects(ctx context.Context) ([]domain.Listing, error) {
	return s.approved(ctx, domain.TypeProject)
}
func (s *Service) Businesses(ctx context.Context) ([]domain.Listing, error) {
	items, err := s.approved(ctx, domain.TypeBusiness)
	if err != nil {
		return nil, err
	}
	// Supporters (paid placement, Phase 7) surface first; order is otherwise kept.
	now := time.Now().UTC()
	sort.SliceStable(items, func(i, j int) bool {
		return SupporterActive(items[i], now) && !SupporterActive(items[j], now)
	})
	return items, nil
}
func (s *Service) Properties(ctx context.Context) ([]domain.Listing, error) {
	return s.approved(ctx, domain.TypeProperty)
}
func (s *Service) Opportunities(ctx context.Context) ([]domain.Listing, error) {
	return s.approved(ctx, domain.TypeOpportunity)
}
func (s *Service) Memories(ctx context.Context) ([]domain.Listing, error) {
	return s.approved(ctx, domain.TypeMemory)
}

// MemoryFilter scopes the memory wall query (spec §8.7).
type MemoryFilter struct {
	SchoolID string
	TownID   string
	Tag      string
	Era      string
}

// FilteredMemories returns approved memories matching the optional filter.
func (s *Service) FilteredMemories(ctx context.Context, f MemoryFilter) ([]domain.Listing, error) {
	return s.listings.Find(ctx, domain.ListingFilter{
		Type:     domain.TypeMemory,
		Status:   domain.StatusApproved,
		SchoolID: f.SchoolID,
		TownID:   f.TownID,
		Tag:      f.Tag,
		Era:      f.Era,
	})
}

// RecordView records a unique daily page-view for the given listing.
func (s *Service) RecordView(ctx context.Context, listingID, visitorKey string) (bool, error) {
	return s.listings.RecordView(ctx, listingID, visitorKey)
}

func (s *Service) Events(ctx context.Context) ([]domain.Listing, error) {
	events, err := s.approved(ctx, domain.TypeEvent)
	if err != nil {
		return nil, err
	}
	sortByStart(events)
	return events, nil
}

func (s *Service) UpcomingEvents(ctx context.Context, today string, limit int) ([]domain.Listing, error) {
	events, err := s.Events(ctx)
	if err != nil {
		return nil, err
	}
	out := []domain.Listing{}
	for _, e := range events {
		if asString(e.Details, "startsAt") >= today {
			out = append(out, e)
		}
	}
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (s *Service) AnchorEvent(ctx context.Context) (*domain.Listing, error) {
	events, err := s.approved(ctx, domain.TypeEvent)
	if err != nil {
		return nil, err
	}
	for i := range events {
		if b, _ := events[i].Details["anchorFestival"].(bool); b {
			return &events[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "event"}
}

func (s *Service) EventsForOrg(ctx context.Context, orgID string) ([]domain.Listing, error) {
	byPost, err := s.listings.Find(ctx, domain.ListingFilter{Type: domain.TypeEvent, Status: domain.StatusApproved, PostedByOrgID: orgID})
	if err != nil {
		return nil, err
	}
	bySchool, err := s.listings.Find(ctx, domain.ListingFilter{Type: domain.TypeEvent, Status: domain.StatusApproved, SchoolID: orgID})
	if err != nil {
		return nil, err
	}
	merged := dedupeByID(append(byPost, bySchool...))
	sortByStart(merged)
	return merged, nil
}

func (s *Service) OfficialEventsForOrg(ctx context.Context, orgID string) ([]domain.Listing, error) {
	return s.listings.Find(ctx, domain.ListingFilter{Type: domain.TypeEvent, Status: domain.StatusApproved, PostedByOrgID: orgID})
}

// Featured returns the editorially-featured, approved listings (any type) for
// the marketing site's "right now in Oguaa" showcase, newest first.
func (s *Service) Featured(ctx context.Context) ([]domain.Listing, error) {
	items, err := s.listings.Find(ctx, domain.ListingFilter{Status: domain.StatusApproved, FeaturedOnly: true, Now: time.Now().UTC().Format(time.RFC3339)})
	if err != nil {
		return nil, err
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].CreatedAt > items[j].CreatedAt })
	return items, nil
}
