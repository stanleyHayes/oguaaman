package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── request-a-new-institution (Creator plan §4.1.1) ──────────────────────────
//
// A citizen who can't find their institution requests it: name, kind (from the
// server-side catalog), seat and a note. The request sits in the same steward
// queue as claims; one approve click creates the verified org and approves the
// requester's claim, so they become its first manager immediately.

// InstitutionKinds exposes the server-side kind catalog to clients.
func (s *Service) InstitutionKinds(_ context.Context) []domain.InstitutionKind {
	return domain.InstitutionKindCatalog
}

// RequestNewInstitution records a create-request for a missing institution.
func (s *Service) RequestNewInstitution(ctx context.Context, memberID, name, kind, seat, role, note string) (*domain.OrgClaim, error) {
	name = strings.TrimSpace(name)
	if len(name) < 2 || len(name) > 160 {
		return nil, fmt.Errorf("the institution's name must be 2–160 characters")
	}
	kind = strings.TrimSpace(kind)
	if !domain.ValidInstitutionKind(kind) {
		return nil, fmt.Errorf("pick a kind from the list")
	}
	seat = strings.TrimSpace(seat)
	if seat == "" {
		return nil, fmt.Errorf("tell us where it sits (town or quarter)")
	}
	// A reserved authority handle (police, fire, the assembly, NADMO…) can only
	// be created by a steward, so ordinary members can't stand up an official
	// page under a trusted name (spec: reserved usernames).
	if domain.IsReservedSlug(slugify(name)) && !s.isSteward(ctx, memberID) {
		return nil, &domain.ForbiddenError{Reason: "that name is a reserved official handle — only a steward can create it"}
	}
	role = strings.TrimSpace(role)
	if role == "" {
		role = "Founder"
	}
	// If the institution already exists, the requester should claim it instead.
	orgs, err := s.orgs.All(ctx)
	if err != nil {
		return nil, err
	}
	for _, o := range orgs {
		if strings.EqualFold(strings.TrimSpace(o.Name), name) {
			return nil, fmt.Errorf("%s already has a page — claim it instead", o.Name)
		}
	}
	// One open create-request per member keeps the steward queue readable.
	mine, err := s.claims.ByMember(ctx, memberID)
	if err != nil {
		return nil, err
	}
	for _, c := range mine {
		if c.NewOrg != nil && c.Status == domain.ClaimPending {
			return nil, fmt.Errorf("you already have an institution request awaiting review")
		}
	}
	now := time.Now().UTC().Format(time.RFC3339)
	c := domain.OrgClaim{
		ID:            "clm-" + fmt.Sprintf("%d", time.Now().UnixNano()),
		MemberID:      memberID,
		RequestedRole: role,
		Note:          strings.TrimSpace(note),
		Status:        domain.ClaimPending,
		NewOrg:        &domain.NewOrgRequest{Name: name, Kind: kind, Seat: seat},
		CreatedAt:     now,
	}
	if err := s.claims.Insert(ctx, c); err != nil {
		return nil, err
	}
	return &c, nil
}

// MyInstitutionRequests lists the member's create-requests (any status),
// newest first — the creator app shows their review state.
func (s *Service) MyInstitutionRequests(ctx context.Context, memberID string) ([]domain.OrgClaim, error) {
	mine, err := s.claims.ByMember(ctx, memberID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.OrgClaim, 0, len(mine))
	for _, c := range mine {
		if c.NewOrg != nil {
			out = append(out, c)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return out, nil
}
