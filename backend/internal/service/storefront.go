package service

import (
	"context"
	"fmt"
	"strings"
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
	Products []domain.StoreItem      `json:"products"`
	Services []domain.StoreItem      `json:"services"`
}

const (
	maxStoreItemNameRunes = 120
	maxStoreItemDescRunes = 600
	maxStoreItemPesewas   = 100_000_000 // GH₵ 1,000,000 per item — a guardrail
)

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

	// Products & services are capped by the business's subscription plan
	// (admin-configured Plan.MaxProducts / MaxServices).
	maxProducts, maxServices := s.storefrontItemCaps(ctx, *l)
	products, err := cleanStoreItems(in.Products, "product", maxProducts)
	if err != nil {
		return nil, err
	}
	services, err := cleanStoreItems(in.Services, "service", maxServices)
	if err != nil {
		return nil, err
	}

	if err := s.listings.SetStorefront(ctx, l.ID, handle, sections, photos, videos, products, services); err != nil {
		return nil, err
	}
	return s.listings.GetByID(ctx, l.ID)
}

// storefrontItemCaps resolves how many products/services a business may publish:
// its active subscription plan's caps, or the default free plan's caps when it
// has no active paid plan. Missing plans mean a zero cap (feature unavailable).
func (s *Service) storefrontItemCaps(ctx context.Context, l domain.Listing) (maxProducts, maxServices int) {
	if s.plans == nil {
		return 0, 0
	}
	slug, _ := l.Details["plan"].(string)
	if slug == "" || !SupporterActive(l, time.Now()) {
		slug = domain.DefaultCreatorPlanIntentSlug // the free "starter" plan
	}
	plan, err := s.plans.BySlug(ctx, slug)
	if err != nil {
		return 0, 0
	}
	return plan.MaxProducts, plan.MaxServices
}

// cleanStoreItems validates and normalises a product/service catalog, enforcing
// the per-plan count cap. idPrefix seeds ids for new items lacking one.
func cleanStoreItems(items []domain.StoreItem, idPrefix string, max int) ([]domain.StoreItem, error) {
	out := make([]domain.StoreItem, 0, len(items))
	for i := range items {
		it := items[i]
		it.Name = strings.TrimSpace(it.Name)
		if it.Name == "" {
			continue // skip blank rows silently (empty editor rows)
		}
		if len([]rune(it.Name)) > maxStoreItemNameRunes {
			return nil, fmt.Errorf("a %s name is too long (max %d characters)", idPrefix, maxStoreItemNameRunes)
		}
		it.Description = strings.TrimSpace(it.Description)
		if len([]rune(it.Description)) > maxStoreItemDescRunes {
			return nil, fmt.Errorf("a %s description is too long (max %d characters)", idPrefix, maxStoreItemDescRunes)
		}
		if it.PricePesewas < 0 || it.PricePesewas > maxStoreItemPesewas {
			return nil, fmt.Errorf("a %s price is out of range", idPrefix)
		}
		it.Unit = strings.TrimSpace(it.Unit)
		it.ImageURL = safeURL(strings.TrimSpace(it.ImageURL))
		if strings.TrimSpace(it.ID) == "" {
			it.ID = fmt.Sprintf("%s-%d", idPrefix, i+1)
		}
		out = append(out, it)
	}
	if len(out) > max {
		return nil, fmt.Errorf("your plan allows at most %d %ss — upgrade to add more", max, idPrefix)
	}
	return out, nil
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
