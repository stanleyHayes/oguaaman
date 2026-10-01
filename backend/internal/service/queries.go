package service

import (
	"context"
	"sort"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── reads: listings by type ──────────────────────────────────────────────────

// approved returns the published listings of one type. Tributes that were
// hidden or removed are never part of a public read.
func (s *Service) approved(ctx context.Context, typ string) ([]domain.Listing, error) {
	items, err := s.listings.Find(ctx, domain.ListingFilter{Type: typ, Status: domain.StatusApproved})
	if err != nil {
		return nil, err
	}
	for i := range items {
		items[i].Tributes = visibleTributes(items[i].Tributes, nil)
	}
	return items, nil
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
	l.Tributes = visibleTributes(l.Tributes, nil)
	return l, nil
}

// ── what a viewer may see (blocks, reporter privacy, tribute visibility) ─────

// viewerID is the member id of a viewer, "" when signed out.
func viewerID(viewer *domain.Member) string {
	if viewer == nil {
		return ""
	}
	return viewer.ID
}

// ViewListings prepares listings for a public response to viewer (nil when
// signed out). Listings owned by a member the viewer has blocked, or who
// blocked the viewer, are dropped (K13), and each listing gets its public
// projection: a safety post loses its reporter's details unless the viewer is
// the reporter or staff (D3), and a memorial shows only visible tributes by
// authors outside the viewer's blocks.
func (s *Service) ViewListings(ctx context.Context, viewer *domain.Member, items []domain.Listing) []domain.Listing {
	items = s.FilterBlockedListings(ctx, viewerID(viewer), items)
	var hidden map[string]struct{}
	for i := range items {
		if len(items[i].Tributes) > 0 {
			hidden = s.hiddenFor(ctx, viewerID(viewer))
			break
		}
	}
	out := make([]domain.Listing, len(items))
	for i, l := range items {
		out[i] = publicListingView(l, viewer, hidden)
	}
	return out
}

// ViewListing is ViewListings for one listing: NotFound when a block between
// the viewer and the owner hides it.
func (s *Service) ViewListing(ctx context.Context, viewer *domain.Member, l *domain.Listing) (*domain.Listing, error) {
	views := s.ViewListings(ctx, viewer, []domain.Listing{*l})
	if len(views) == 0 {
		return nil, &domain.NotFoundError{Entity: l.Type}
	}
	return &views[0], nil
}

// FilterBlockedNews drops articles written by a member in a block with the
// viewer (K13). Signed-out viewers see everything.
func (s *Service) FilterBlockedNews(ctx context.Context, viewer *domain.Member, in []domain.NewsArticle) []domain.NewsArticle {
	hidden := s.hiddenFor(ctx, viewerID(viewer))
	if len(hidden) == 0 {
		return in
	}
	out := make([]domain.NewsArticle, 0, len(in))
	for _, a := range in {
		if _, blocked := hidden[a.AuthorID]; blocked && a.AuthorID != "" {
			continue
		}
		out = append(out, a)
	}
	return out
}

// BlockedBetween reports whether viewer and the member ownerID have blocked
// each other (either direction). Signed-out viewers have no blocks.
func (s *Service) BlockedBetween(ctx context.Context, viewer *domain.Member, ownerID string) bool {
	if viewer == nil || ownerID == "" {
		return false
	}
	_, blocked := s.hiddenFor(ctx, viewer.ID)[ownerID]
	return blocked
}

func publicListingView(l domain.Listing, viewer *domain.Member, hidden map[string]struct{}) domain.Listing {
	if (l.Type == domain.TypeIncident || l.Type == domain.TypeLostFound) && !canSeeReporter(viewer, &l) {
		l = publicSafetyView(l)
	}
	if len(l.Tributes) > 0 {
		l.Tributes = visibleTributes(l.Tributes, hidden)
	}
	return l
}

// visibleTributes keeps the tributes the public may read: not hidden or
// removed, and not written by a member in hidden (the viewer's blocks).
func visibleTributes(in []domain.Tribute, hidden map[string]struct{}) []domain.Tribute {
	if len(in) == 0 {
		return in
	}
	out := make([]domain.Tribute, 0, len(in))
	for _, t := range in {
		if t.Status != "" {
			continue
		}
		if _, blocked := hidden[t.MemberID]; blocked && t.MemberID != "" {
			continue
		}
		out = append(out, t)
	}
	return out
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
	// No artists yet (e.g. a freshly-launched town): there is simply nothing to
	// spotlight. Return nil rather than a 404 so the home endpoint still renders.
	return nil, nil
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

// Projects — curated civic adopt-a-project listings (spec §4/§6/§15). Member-
// created fundraising campaigns share the `project` type but are surfaced on
// their own wall (Campaigns), so they're excluded here.
func (s *Service) Projects(ctx context.Context) ([]domain.Listing, error) {
	items, err := s.approved(ctx, domain.TypeProject)
	if err != nil {
		return nil, err
	}
	out := make([]domain.Listing, 0, len(items))
	for _, l := range items {
		if !isCampaign(l) {
			out = append(out, l)
		}
	}
	return out, nil
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
	items, err := s.approved(ctx, domain.TypeProperty)
	if err != nil {
		return nil, err
	}
	// A property the owner has marked "let" (taken) drops out of the public
	// browse so renters only see places they can actually take. Direct links and
	// the owner's own dashboard still resolve it, and the owner can re-list it as
	// available at any time. See SetPropertyAvailability.
	out := items[:0]
	for _, l := range items {
		if asString(l.Details, "availability") == domain.PropertyAvailabilityLet {
			continue
		}
		out = append(out, l)
	}
	return out, nil
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
// maxListingIDLen bounds ids taken from a URL before any lookup.
const maxListingIDLen = 200

// RecordView counts a daily-unique view of a published listing. Unknown,
// unpublished or absurd ids are NotFound, so no view record is written for
// them (F098).
func (s *Service) RecordView(ctx context.Context, listingID, visitorKey string) (bool, error) {
	if listingID == "" || len(listingID) > maxListingIDLen {
		return false, &domain.NotFoundError{Entity: "listing"}
	}
	l, err := s.listings.GetByID(ctx, listingID)
	if err != nil {
		return false, err
	}
	if l.Status != domain.StatusApproved {
		return false, &domain.NotFoundError{Entity: "listing"}
	}
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
