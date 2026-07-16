package service

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/oguaa/backend/internal/domain"
)

// UpdateMemberProfile lets a member edit their own display name and bio (the
// editable identity fields; phone/email stay private and role is steward-managed).
func (s *Service) UpdateMemberProfile(ctx context.Context, id, displayName, bio string) (*domain.Member, error) {
	displayName = strings.TrimSpace(displayName)
	if len(displayName) < 2 || len(displayName) > 80 {
		return nil, fmt.Errorf("your name must be 2–80 characters")
	}
	bio = strings.TrimSpace(bio)
	if len(bio) > 280 {
		return nil, fmt.Errorf("keep your bio under 280 characters")
	}
	if err := s.members.SetProfile(ctx, id, displayName, initialsOf(displayName), bio); err != nil {
		return nil, err
	}
	return s.members.ByID(ctx, id)
}

// ── reads: members / orgs / places ───────────────────────────────────────────

// SetCreatorTypes lets a member declare themselves a creator (or update their
// creator kinds) — the self-serve "become a creator" upgrade (Creator Platform
// plan §3). Passing an empty list turns creator access off.
func (s *Service) SetCreatorTypes(ctx context.Context, id string, types []string) (*domain.Member, error) {
	seen := map[string]bool{}
	clean := []string{}
	for _, t := range types {
		t = strings.ToLower(strings.TrimSpace(t))
		if t == "" {
			continue
		}
		if !domain.ValidCreatorType(t) {
			return nil, fmt.Errorf("unknown creator type %q", t)
		}
		if !seen[t] {
			seen[t] = true
			clean = append(clean, t)
		}
	}
	if err := s.members.SetCreatorTypes(ctx, id, clean); err != nil {
		return nil, err
	}
	return s.members.ByID(ctx, id)
}

func (s *Service) Members(ctx context.Context) ([]domain.Member, error) { return s.members.All(ctx) }
func (s *Service) MemberBySlug(ctx context.Context, slug string) (*domain.Member, error) {
	return s.members.BySlug(ctx, slug)
}
func (s *Service) MemberByID(ctx context.Context, id string) (*domain.Member, error) {
	return s.members.ByID(ctx, id)
}
func (s *Service) Places(ctx context.Context) ([]domain.Place, error) { return s.places.All(ctx) }
// Institutions is the public directory: only verified institutions are listed —
// a revoked page is offline (spec §8.13; see VerifyInstitution). The steward
// queue uses AllInstitutions, which is unfiltered.
func (s *Service) Institutions(ctx context.Context) ([]domain.Organization, error) {
	all, err := s.orgs.All(ctx)
	if err != nil {
		return nil, err
	}
	return verifiedOnly(all), nil
}
func (s *Service) Schools(ctx context.Context) ([]domain.Organization, error) {
	all, err := s.orgs.ByKind(ctx, "school")
	if err != nil {
		return nil, err
	}
	return verifiedOnly(all), nil
}

func verifiedOnly(orgs []domain.Organization) []domain.Organization {
	out := make([]domain.Organization, 0, len(orgs))
	for _, o := range orgs {
		if o.Verified {
			out = append(out, o)
		}
	}
	return out
}
func (s *Service) InstitutionBySlug(ctx context.Context, slug string) (*domain.Organization, error) {
	return s.orgs.BySlug(ctx, slug)
}
func (s *Service) ListingsByOwner(ctx context.Context, ownerID string) ([]domain.Listing, error) {
	return s.listings.Find(ctx, domain.ListingFilter{OwnerID: ownerID})
}

// ── diaspora register (spec §4/§5/§15, Phase 2 foundation) ───────────────────

// SetMemberDiaspora records (or clears) a member's location abroad. Passing
// abroad=false with no city/country clears the opt-in entirely.
func (s *Service) SetMemberDiaspora(ctx context.Context, id string, abroad bool, city, country string) (*domain.Diaspora, error) {
	city = strings.TrimSpace(city)
	country = strings.TrimSpace(country)
	if !abroad && city == "" && country == "" {
		return nil, s.members.SetDiaspora(ctx, id, nil)
	}
	d := &domain.Diaspora{Abroad: abroad, City: city, Country: country}
	return d, s.members.SetDiaspora(ctx, id, d)
}

// DiasporaMembers lists members who have opted in as living abroad — the "sons &
// daughters abroad" wall, sorted by display name.
func (s *Service) DiasporaMembers(ctx context.Context) ([]domain.Member, error) {
	all, err := s.members.All(ctx)
	if err != nil {
		return nil, err
	}
	out := []domain.Member{}
	for _, m := range all {
		if m.Diaspora != nil && m.Diaspora.Abroad {
			out = append(out, m)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].DisplayName < out[j].DisplayName })
	return out, nil
}

// ── moderation queue & stats ─────────────────────────────────────────────────

func (s *Service) ModerationQueue(ctx context.Context, typeFilter string) ([]domain.Listing, error) {
	f := domain.ListingFilter{Status: domain.StatusPending}
	if typeFilter != "" {
		f.Type = typeFilter
	}
	pending, err := s.listings.Find(ctx, f)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(pending, func(i, j int) bool { return pending[i].SubmittedAt < pending[j].SubmittedAt })
	return pending, nil
}

// Stats are the home/admin headline counts (spec §4 KPIs).
type Stats struct {
	Members         int     `json:"members"`
	Listings        int     `json:"listings"`
	Schools         int     `json:"schools"`
	Institutions    int     `json:"institutions"`
	Artists         int     `json:"artists"`
	Memorials       int     `json:"memorials"`
	Memories        int     `json:"memories"`
	Pending         int     `json:"pending"`
	ViewsThisMonth  int     `json:"viewsThisMonth"`
	AvgApprovalHrs  float64 `json:"avgApprovalHrs"`
}

func (s *Service) Stats(ctx context.Context) (Stats, error) {
	var st Stats
	count := func(f domain.ListingFilter) (int, error) {
		ls, err := s.listings.Find(ctx, f)
		return len(ls), err
	}
	members, err := s.members.All(ctx)
	if err != nil {
		return st, err
	}
	orgs, err := s.orgs.All(ctx)
	if err != nil {
		return st, err
	}
	schools, err := s.orgs.ByKind(ctx, "school")
	if err != nil {
		return st, err
	}
	st.Members = len(members)
	st.Institutions = len(orgs)
	st.Schools = len(schools)
	if st.Listings, err = count(domain.ListingFilter{Status: domain.StatusApproved}); err != nil {
		return st, err
	}
	if st.Artists, err = count(domain.ListingFilter{Type: domain.TypeArtist, Status: domain.StatusApproved}); err != nil {
		return st, err
	}
	if st.Memorials, err = count(domain.ListingFilter{Type: domain.TypeMemorial, Status: domain.StatusApproved}); err != nil {
		return st, err
	}
	if st.Memories, err = count(domain.ListingFilter{Type: domain.TypeMemory, Status: domain.StatusApproved}); err != nil {
		return st, err
	}
	if st.Pending, err = count(domain.ListingFilter{Status: domain.StatusPending}); err != nil {
		return st, err
	}
	// Non-critical — fall back to 0 if the views collection is unavailable.
	if views, verr := s.listings.PlatformViewsThisMonth(ctx); verr == nil {
		st.ViewsThisMonth = views
	}
	// Non-critical — fall back to 0 on error.
	if hrs, verr := s.listings.AvgApprovalHours(ctx); verr == nil {
		st.AvgApprovalHrs = hrs
	}
	return st, nil
}
