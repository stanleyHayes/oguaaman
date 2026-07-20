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
