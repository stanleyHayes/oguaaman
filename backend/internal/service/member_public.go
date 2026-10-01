package service

import (
	"context"
	"sort"

	"github.com/oguaa/backend/internal/domain"
)

// ── public member projection (Act 843; contract K5) ─────────────────────────
//
// domain.Member is the stored record. Serialising it straight onto a public
// endpoint leaked whatever the struct happened to carry — the date-of-birth
// seeded birthday, mfaEnabled (which tells an attacker which staff accounts are
// password-only), the suspended flag, plan and campaigner state. Every public
// member surface now goes through PublicMember instead, so a field reaches an
// anonymous caller only when it is listed here on purpose.

// PublicMember is the only shape of a member that public endpoints return
// (GET /api/members, /api/members/{slug}, /api/diaspora, /api/me/connections).
// JSON names match domain.Member so existing clients keep reading the same keys.
type PublicMember struct {
	ID          string               `json:"id"`
	Slug        string               `json:"slug"`
	DisplayName string               `json:"displayName"`
	Initials    string               `json:"initials"`
	PhotoURL    string               `json:"photoUrl,omitempty"`
	Bio         string               `json:"bio,omitempty"`
	TownID      string               `json:"townId,omitempty"`
	AsafoID     string               `json:"asafoId,omitempty"`
	SchoolIDs   []string             `json:"schoolIds"`
	Schooling   []domain.SchoolStint `json:"schooling,omitempty"`
	Links       []domain.SocialLink  `json:"links,omitempty"`
	Role        string               `json:"role"`
	Verified    bool                 `json:"verified"`
	VerifiedAs  string               `json:"verifiedAs,omitempty"`
	JoinedAt    string               `json:"joinedAt"`
	// Birthday is "MM-DD" and present only when the member opted into
	// broadcasting it. The year is never published.
	Birthday string `json:"birthday,omitempty"`
	// Diaspora is present only when the member opted onto the abroad register.
	Diaspora *domain.Diaspora `json:"diaspora,omitempty"`
}

// PublicMemberOf projects a stored member onto the public shape.
func PublicMemberOf(m *domain.Member) PublicMember {
	if m == nil {
		return PublicMember{SchoolIDs: []string{}}
	}
	p := PublicMember{
		ID: m.ID, Slug: m.Slug, DisplayName: m.DisplayName, Initials: m.Initials,
		PhotoURL: m.PhotoURL, Bio: m.Bio, TownID: m.TownID, AsafoID: m.AsafoID,
		SchoolIDs: m.SchoolIDs, Schooling: m.Schooling, Links: m.Links,
		Role: m.Role, Verified: m.Verified, VerifiedAs: m.VerifiedAs, JoinedAt: m.JoinedAt,
	}
	if p.SchoolIDs == nil {
		p.SchoolIDs = []string{}
	}
	if m.BroadcastBirthday {
		p.Birthday = monthDayOf(m.Birthday)
	}
	if m.Diaspora != nil && m.Diaspora.Abroad {
		d := *m.Diaspora
		p.Diaspora = &d
	}
	return p
}

// publicMembersOf projects a slice, dropping suspended accounts: a suspended
// member is sanctioned or erased ("Former member"), and neither belongs in a
// public directory.
func publicMembersOf(in []domain.Member) []PublicMember {
	out := make([]PublicMember, 0, len(in))
	for i := range in {
		if in[i].Suspended {
			continue
		}
		out = append(out, PublicMemberOf(&in[i]))
	}
	return out
}

// PublicMembers is the public member directory (GET /api/members).
func (s *Service) PublicMembers(ctx context.Context) ([]PublicMember, error) {
	all, err := s.members.All(ctx)
	if err != nil {
		return nil, err
	}
	return publicMembersOf(all), nil
}

// IsStaffViewer reports whether a member may see the staff view of other
// members' profiles and listings at every status (moderation needs it).
func IsStaffViewer(m *domain.Member) bool {
	if m == nil {
		return false
	}
	switch m.Role {
	case domain.RoleSteward, domain.RoleCurator, domain.RoleModerator:
		return true
	}
	return false
}

// ProfileListings returns the listings shown on a member's profile. The owner
// and staff see every status (the owner's studio relies on it); everyone else
// sees only approved listings — drafts, pending and rejected submissions, and
// listings curators took down, are nobody else's business — in their public
// projection: safety posts without the reporter's contact or member id (D3),
// memorials with visible tributes only.
func (s *Service) ProfileListings(ctx context.Context, owner *domain.Member, viewer *domain.Member) ([]domain.Listing, error) {
	if owner == nil {
		return []domain.Listing{}, nil
	}
	if viewer != nil && (viewer.ID == owner.ID || IsStaffViewer(viewer)) {
		return s.listings.Find(ctx, domain.ListingFilter{OwnerID: owner.ID})
	}
	items, err := s.listings.Find(ctx, domain.ListingFilter{OwnerID: owner.ID, Status: domain.StatusApproved})
	if err != nil {
		return nil, err
	}
	return s.ViewListings(ctx, viewer, items), nil
}

// StaffMembers is the staff directory (GET /api/admin/members): the full stored
// record (role, suspension, two-factor state), sorted by name. Private
// identifiers stay json:"-" on domain.Member and never leave the server.
func (s *Service) StaffMembers(ctx context.Context) ([]domain.Member, error) {
	all, err := s.members.All(ctx)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(all, func(i, j int) bool { return all[i].DisplayName < all[j].DisplayName })
	return all, nil
}
