package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── admin ────────────────────────────────────────────────────────────────────

// AllListings returns every listing across all statuses (admin search source).
func (s *Service) AllListings(ctx context.Context) ([]domain.Listing, error) {
	all, err := s.listings.Find(ctx, domain.ListingFilter{})
	if err != nil {
		return nil, err
	}
	sort.SliceStable(all, func(i, j int) bool { return all[i].CreatedAt > all[j].CreatedAt })
	return all, nil
}

// AuditLog returns moderation records, newest first (spec §8.10).
func (s *Service) AuditLog(ctx context.Context) ([]domain.ModerationRecord, error) {
	recs, err := s.mod.All(ctx)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(recs, func(i, j int) bool { return recs[i].CreatedAt > recs[j].CreatedAt })
	return recs, nil
}

func validRole(role string) bool {
	return role == domain.RoleMember || role == domain.RoleCurator || role == domain.RoleSteward || role == domain.RoleEditor || role == domain.RoleModerator
}

func (s *Service) SetMemberRole(ctx context.Context, id, role string) error {
	if !validRole(role) {
		return fmt.Errorf("invalid role %q", role)
	}
	return s.members.UpdateRole(ctx, id, role)
}

// InviteMember pre-creates a member with a role (steward action). When they
// later sign in with this phone/email, they already hold the role — the
// passwordless way to onboard curators, stewards and editors (spec §9).
func (s *Service) InviteMember(ctx context.Context, identifier, displayName, role string) (*domain.Member, error) {
	identifier = strings.TrimSpace(identifier)
	displayName = strings.TrimSpace(displayName)
	if identifier == "" || displayName == "" {
		return nil, fmt.Errorf("a name and a phone or email are required")
	}
	if !validRole(role) {
		return nil, fmt.Errorf("invalid role %q", role)
	}
	if existing, _ := s.members.ByIdentifier(ctx, identifier); existing != nil {
		return nil, fmt.Errorf("%s is already a member — change their role from the list instead", identifier)
	}
	m := domain.Member{
		ID:          "m-" + fmt.Sprintf("%d", time.Now().UnixNano()),
		Slug:        slugify(displayName),
		DisplayName: displayName,
		Initials:    initialsOf(displayName),
		Role:        role,
		SchoolIDs:   []string{},
		JoinedAt:    time.Now().UTC().Format(time.DateOnly),
	}
	if strings.Contains(identifier, "@") {
		m.Email = identifier
	} else {
		m.Phone = identifier
	}
	if err := s.members.Insert(ctx, m); err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *Service) SuspendMember(ctx context.Context, id string, suspended bool) error {
	return s.members.SetSuspended(ctx, id, suspended)
}

// SetFeatured surfaces a listing on the front pages as a paid placement
// (spec §8.14). days > 0 sets an expiry that many days out; days <= 0 features
// with no expiry (editorial). Unfeaturing clears the expiry. Returns the
// computed expiry ("" when none) so callers can echo it back.
func (s *Service) SetFeatured(ctx context.Context, id string, featured bool, days int) (string, error) {
	until := ""
	if featured && days > 0 {
		until = time.Now().UTC().Add(time.Duration(days) * 24 * time.Hour).Format(time.RFC3339)
	}
	if err := s.listings.SetFeatured(ctx, id, featured, until); err != nil {
		return "", err
	}
	return until, nil
}

func (s *Service) VerifyInstitution(ctx context.Context, id string, verified bool) error {
	on := ""
	if verified {
		on = time.Now().UTC().Format(time.DateOnly)
	}
	if err := s.orgs.SetVerified(ctx, id, verified, on); err != nil {
		return err
	}
	if verified {
		return nil
	}
	// Revocation takes the page offline: the public directory/detail endpoints
	// hide unverified institutions, and the org's self-published events must
	// not stay live either. They go back to the review queue (pending) — after
	// a later re-verification a curator restores them through normal review;
	// nothing is deleted and nothing returns without a second look.
	events, err := s.listings.Find(ctx, domain.ListingFilter{Type: domain.TypeEvent, Status: domain.StatusApproved, PostedByOrgID: id})
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	for _, e := range events {
		if err := s.listings.UpdateStatus(ctx, e.ID, domain.StatusPending, "steward", "institution verification revoked", now); err != nil {
			return err
		}
	}
	return nil
}

// AllInstitutions is the steward's unfiltered directory (verification queue):
// it includes unverified/revoked institutions that the public endpoints hide.
func (s *Service) AllInstitutions(ctx context.Context) ([]domain.Organization, error) {
	return s.orgs.All(ctx)
}

// CreateOrg creates a new institution (steward action — e.g. a heritage/visitor
// place). It mints an id and a unique slug from the name, defaults the kind to
// "heritage", and marks it verified (steward-authored platform content). The
// steward then configures its official page (summary/history/sections/gallery)
// via the normal manager endpoints (which already accept stewards).
func (s *Service) CreateOrg(ctx context.Context, name, kind, classification, summary string) (*domain.Organization, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("a name is required")
	}
	kind = strings.TrimSpace(kind)
	if kind == "" {
		kind = "heritage"
	}
	base := slugify(name)
	if base == "" {
		base = "place"
	}
	slug := base
	for i := 2; i < 100; i++ {
		if existing, _ := s.orgs.BySlug(ctx, slug); existing == nil {
			break
		}
		slug = fmt.Sprintf("%s-%d", base, i)
	}
	org := domain.Organization{
		ID:             "org-" + fmt.Sprintf("%d", time.Now().UnixNano()),
		Slug:           slug,
		Kind:           kind,
		Name:           name,
		Classification: strings.TrimSpace(classification),
		Summary:        strings.TrimSpace(summary),
		Offices:        []domain.Office{},
		Verified:       true,
		VerifiedOn:     time.Now().UTC().Format(time.DateOnly),
	}
	if err := s.orgs.Create(ctx, org); err != nil {
		return nil, err
	}
	return &org, nil
}
