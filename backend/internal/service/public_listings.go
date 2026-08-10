package service

import (
	"context"

	"github.com/oguaa/backend/internal/domain"
)

// PublicListingsByType returns the approved listings of one type that may be
// shown to the public and offered to search engines.
//
// Illustrative records are withheld. A fabricated business indexed as fact
// would put an invented name, address and price into Google's index, which is a
// structured-data violation and damages the domain — see domain/seedclass.go.
func (s *Service) PublicListingsByType(ctx context.Context, listingType string) ([]domain.Listing, error) {
	items, err := s.listings.Find(ctx, domain.ListingFilter{
		Type:   listingType,
		Status: domain.StatusApproved,
	})
	if err != nil {
		return nil, err
	}
	out := make([]domain.Listing, 0, len(items))
	for _, l := range items {
		// Filter on the per-document Demo flag, NOT on the listing type.
		// domain.FabricatedListingTypes describes the SEED corpus — every seeded
		// business is invented — but "business" as a type is exactly what a real
		// trader creates. Excluding by type would mean no genuine shop is ever
		// indexed, which is the whole point of this sitemap.
		if l.Demo || l.Slug == "" {
			continue
		}
		out = append(out, l)
	}
	return out, nil
}
