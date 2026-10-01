package service

import (
	"context"
	"errors"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// TestPublicInstitutionBySlugHidesUnverified: GraphQL and gRPC serve the same
// "revoked is offline" rule as the REST detail endpoint.
func TestPublicInstitutionBySlugHidesUnverified(t *testing.T) {
	svc := New(Deps{Orgs: mapOrgs{items: []domain.Organization{
		{ID: "ok", Slug: "mfantsipim", Name: "Mfantsipim", Verified: true},
		{ID: "gone", Slug: "fake-school", Name: "Fake school", Verified: false},
	}}})
	ctx := context.Background()

	if o, err := svc.PublicInstitutionBySlug(ctx, "mfantsipim"); err != nil || o.ID != "ok" {
		t.Fatalf("verified institution: got %+v, %v", o, err)
	}
	for _, slug := range []string{"fake-school", "missing"} {
		_, err := svc.PublicInstitutionBySlug(ctx, slug)
		var nf *domain.NotFoundError
		if !errors.As(err, &nf) {
			t.Errorf("%s: want NotFoundError, got %v", slug, err)
		}
	}
}
