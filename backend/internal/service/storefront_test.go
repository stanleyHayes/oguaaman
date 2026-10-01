package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

func storefrontSvc(listings ...domain.Listing) (*Service, *fakeRepo) {
	repo := &fakeRepo{listings: listings}
	return &Service{listings: repo}, repo
}

func supporterBiz(id, owner string, active bool) domain.Listing {
	until := time.Now().Add(-time.Hour) // lapsed
	if active {
		until = time.Now().Add(48 * time.Hour)
	}
	return domain.Listing{
		ID: id, Type: domain.TypeBusiness, OwnerID: owner, Title: "Aunty's Kitchen",
		Status: domain.StatusApproved, Details: map[string]any{"subscribedUntil": until.Format(time.RFC3339)},
	}
}

func TestStorefront_RequiresSupporter(t *testing.T) {
	svc, _ := storefrontSvc(supporterBiz("b1", "m1", false))
	owner := &domain.Member{ID: "m1", Role: domain.RoleMember}
	_, err := svc.SetListingStorefront(context.Background(), owner, "b1", StorefrontInput{})
	var fb *domain.ForbiddenError
	if !errors.As(err, &fb) {
		t.Fatalf("non-supporter owner: got %v, want ForbiddenError", err)
	}
}

func TestStorefront_OnlyOwner(t *testing.T) {
	svc, _ := storefrontSvc(supporterBiz("b1", "m1", true))
	stranger := &domain.Member{ID: "m2", Role: domain.RoleMember}
	_, err := svc.SetListingStorefront(context.Background(), stranger, "b1", StorefrontInput{})
	var fb *domain.ForbiddenError
	if !errors.As(err, &fb) {
		t.Fatalf("non-owner: got %v, want ForbiddenError", err)
	}
}

func TestStorefront_SavesAndCapsMedia(t *testing.T) {
	svc, repo := storefrontSvc(supporterBiz("b1", "m1", true))
	owner := &domain.Member{ID: "m1", Role: domain.RoleMember}

	// Within caps: 2 photos, 1 video, one section, a clean handle.
	in := StorefrontInput{
		Handle:   "Aunty's Kitchen!",
		Sections: []domain.ProfileSection{{Type: domain.SectionRichText, Title: "About", Body: "Best waakye in Oguaa."}},
		Photos:   []domain.MediaAsset{{URL: "https://cdn.test/a.jpg"}, {URL: "https://cdn.test/b.jpg"}},
		Videos:   []domain.MediaAsset{{URL: "https://cdn.test/v.mp4"}},
	}
	out, err := svc.SetListingStorefront(context.Background(), owner, "b1", in)
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if out.Handle != "aunty-s-kitchen" {
		t.Errorf("handle = %q, want slugified aunty-s-kitchen", out.Handle)
	}
	if len(out.Photos) != 2 || out.Photos[0].Kind != "photo" {
		t.Errorf("photos not saved/kinded: %+v", out.Photos)
	}
	if len(out.Videos) != 1 || out.Videos[0].Kind != "video" {
		t.Errorf("videos not saved/kinded: %+v", out.Videos)
	}
	// Handle is now looked up by the public route.
	byHandle, err := svc.ListingByHandle(context.Background(), "aunty-s-kitchen")
	if err != nil || byHandle.ID != "b1" {
		t.Fatalf("ListingByHandle: %v / %+v", err, byHandle)
	}

	// Over the photo cap → rejected.
	tooMany := make([]domain.MediaAsset, domain.MaxStorefrontPhotos+1)
	for i := range tooMany {
		tooMany[i] = domain.MediaAsset{URL: "https://cdn.test/x.jpg"}
	}
	if _, err := svc.SetListingStorefront(context.Background(), owner, "b1", StorefrontInput{Photos: tooMany}); err == nil {
		t.Error("expected error over photo cap")
	}
	_ = repo
}

func TestStorefront_HandleUniqueAndReserved(t *testing.T) {
	svc, _ := storefrontSvc(
		supporterBiz("b1", "m1", true),
		func() domain.Listing { l := supporterBiz("b2", "m2", true); l.Handle = "kotokuraba"; return l }(),
	)
	owner := &domain.Member{ID: "m1", Role: domain.RoleMember}

	if _, err := svc.SetListingStorefront(context.Background(), owner, "b1", StorefrontInput{Handle: "kotokuraba"}); err == nil {
		t.Error("expected taken-handle error")
	}
	if _, err := svc.SetListingStorefront(context.Background(), owner, "b1", StorefrontInput{Handle: "business"}); err == nil {
		t.Error("expected reserved-handle error")
	}
}

// F054/F087: a handle never serves a business that isn't approved (a curator
// takedown, a rejection or a pending major edit must take the page down).
func TestStorefrontHandleServesOnlyApprovedBusinesses(t *testing.T) {
	for _, status := range []string{domain.StatusPending, domain.StatusRejected, domain.StatusUnpublished, domain.StatusDraft} {
		l := supporterBiz("b1", "m1", true)
		l.Handle, l.Status = "aunties-kitchen", status
		svc, _ := storefrontSvc(l)
		_, err := svc.ListingByHandle(context.Background(), "aunties-kitchen")
		var nf *domain.NotFoundError
		if !errors.As(err, &nf) {
			t.Errorf("%s business served by handle: err=%v", status, err)
		}
	}
	notBusiness := domain.Listing{ID: "e1", Type: domain.TypeEvent, Status: domain.StatusApproved, Handle: "gig"}
	svc, _ := storefrontSvc(notBusiness)
	if _, err := svc.ListingByHandle(context.Background(), "gig"); err == nil {
		t.Error("a non-business listing was served as a storefront")
	}
}

// F051: new items get ids that collide with no surviving item, and a repeated
// id (older data) is re-assigned, so checkout can never resolve another item.
func TestStoreItemIDsNeverCollide(t *testing.T) {
	items := []domain.StoreItem{
		{ID: "product-2", Name: "B", PricePesewas: 2_000},
		{Name: "C (new)", PricePesewas: 15_000},
		{ID: "product-2", Name: "D (legacy duplicate)", PricePesewas: 900},
		{ID: "tmp-1", Name: "E", PricePesewas: 100},
	}
	out, err := cleanStoreItems(items, "product", domain.StoreItemPhysical, 10)
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]string{}
	for _, it := range out {
		if other, dup := seen[it.ID]; dup {
			t.Fatalf("%q and %q share id %q", other, it.Name, it.ID)
		}
		seen[it.ID] = it.Name
	}
	if out[0].ID != "product-2" {
		t.Errorf("the first item lost its id: %+v", out[0])
	}
	if out[3].ID != "tmp-1" {
		t.Errorf("an unrelated existing id changed: %+v", out[3])
	}
}

// P062: only physical goods and in-person services can be listed.
func TestStorefrontRejectsDigitalProducts(t *testing.T) {
	out, err := cleanStoreItems([]domain.StoreItem{{Name: "Kente"}}, "product", domain.StoreItemPhysical, 5)
	if err != nil || out[0].Kind != domain.StoreItemPhysical {
		t.Fatalf("default product kind: %+v %v", out, err)
	}
	out, err = cleanStoreItems([]domain.StoreItem{{Name: "Braiding"}}, "service", domain.StoreItemService, 5)
	if err != nil || out[0].Kind != domain.StoreItemService {
		t.Fatalf("default service kind: %+v %v", out, err)
	}
	for _, kind := range []string{"digital", "download", "ebook"} {
		_, err = cleanStoreItems([]domain.StoreItem{{Name: "Beat pack", Kind: kind}}, "product", domain.StoreItemPhysical, 5)
		var ve *domain.ValidationError
		if !errors.As(err, &ve) || ve.Message != msgDigitalGoodsRefused {
			t.Errorf("kind %q: err=%v", kind, err)
		}
	}
}
