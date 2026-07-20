package service

import (
	"context"
	"fmt"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// StorefrontInput is a business owner's storefront save payload: the profile
// sections (institution section engine), the device-uploaded photo/video
// gallery, and an optional clean shareable handle (e.g. /s/aunties-kitchen).
type StorefrontInput struct {
	Handle   string                  `json:"handle"`
	Sections []domain.ProfileSection `json:"sections"`
	Photos   []domain.MediaAsset     `json:"photos"`
	Videos   []domain.MediaAsset     `json:"videos"`
}

// reservedHandles can't be claimed as storefront handles — they'd shadow app
// routes today and subdomains later.
var reservedHandles = map[string]bool{
	"api": true, "s": true, "business": true, "admin": true, "www": true,
	"app": true, "signin": true, "me": true, "search": true, "outside": true,
	"safety": true, "alerts": true, "events": true, "music": true, "people": true,
	"oguaa": true, "oguaaman": true, "citizen": true, "steward": true, "creator": true,
}

// SetListingStorefront saves a business owner's storefront (profile sections +
// photo/video gallery + optional clean shareable handle). Gated on BOTH listing
// ownership AND an active Supporter subscription — the storefront is a paid
// feature. Media is capped at MaxStorefrontPhotos / MaxStorefrontVideos. Staff
// (curator/steward) may edit regardless, for support. Saves live (like an
// institution's sections), so it does not re-queue the listing for moderation.
func (s *Service) SetListingStorefront(ctx context.Context, actor *domain.Member, listingID string, in StorefrontInput) (*domain.Listing, error) {
	if actor == nil {
		return nil, &domain.ForbiddenError{Reason: "a signed-in member is required"}
	}
	l, err := s.listings.GetByID(ctx, listingID)
	if err != nil {
		return nil, err
	}
	if l.Type != domain.TypeBusiness {
		return nil, &domain.ForbiddenError{Reason: "storefronts are available for businesses only"}
	}
	isStaff := actor.Role == domain.RoleCurator || actor.Role == domain.RoleSteward
	if actor.ID != l.OwnerID && !isStaff {
		return nil, &domain.ForbiddenError{Reason: "only the owner can edit this storefront"}
	}
	if !isStaff && !SupporterActive(*l, time.Now()) {
		return nil, &domain.ForbiddenError{Reason: "a Supporter subscription is required to build a storefront"}
	}

	sections := in.Sections
	for i := range sections {
		if err := cleanSection(&sections[i], i); err != nil {
			return nil, err
		}
	}

	photos := cleanMedia(in.Photos, "sf-photo")
	for i := range photos {
		photos[i].Kind = "photo"
	}
	if len(photos) > domain.MaxStorefrontPhotos {
		return nil, fmt.Errorf("a storefront allows at most %d photos", domain.MaxStorefrontPhotos)
	}

	videos := cleanMedia(in.Videos, "sf-video")
	for i := range videos {
		videos[i].Kind = "video"
	}
	if len(videos) > domain.MaxStorefrontVideos {
		return nil, fmt.Errorf("a storefront allows at most %d videos", domain.MaxStorefrontVideos)
	}

	handle, err := s.resolveHandle(ctx, in.Handle, l.ID)
	if err != nil {
		return nil, err
	}

	if err := s.listings.SetStorefront(ctx, l.ID, handle, sections, photos, videos); err != nil {
		return nil, err
	}
	return s.listings.GetByID(ctx, l.ID)
}

// resolveHandle normalises and validates a requested storefront handle. Blank is
// allowed (clears it). Otherwise it must be a clean 3–40 char slug, not reserved,
// and unique across listings.
func (s *Service) resolveHandle(ctx context.Context, raw, listingID string) (string, error) {
	h := slugify(raw)
	if h == "" {
		return "", nil
	}
	if len(h) < 3 || len(h) > 40 {
		return "", fmt.Errorf("a storefront link must be 3–40 characters")
	}
	if reservedHandles[h] {
		return "", fmt.Errorf("that storefront link is reserved — please choose another")
	}
	taken, err := s.listings.HandleTaken(ctx, h, listingID)
	if err != nil {
		return "", err
	}
	if taken {
		return "", fmt.Errorf("that storefront link is already taken")
	}
	return h, nil
}

// ListingByHandle returns a listing by its clean storefront handle.
func (s *Service) ListingByHandle(ctx context.Context, handle string) (*domain.Listing, error) {
	return s.listings.GetByHandle(ctx, slugify(handle))
}
