package service

import (
	"context"

	"github.com/oguaa/backend/internal/domain"
)

// PublicInstitutionBySlug is the anonymous read of an institution page. A
// revoked or not-yet-verified institution is offline to the public (spec §8.13),
// so it reads as not found — the same answer the REST detail endpoint gives a
// visitor who does not manage the page. Surfaces with no viewer identity
// (GraphQL, gRPC) use this; managers keep using the REST endpoint.
func (s *Service) PublicInstitutionBySlug(ctx context.Context, slug string) (*domain.Organization, error) {
	org, err := s.orgs.BySlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	if !org.Verified {
		return nil, &domain.NotFoundError{Entity: "institution"}
	}
	return org, nil
}
