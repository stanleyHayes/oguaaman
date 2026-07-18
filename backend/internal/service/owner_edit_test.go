package service

import (
	"context"
	"errors"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

func ownerActor() *domain.Member {
	return &domain.Member{ID: "m-owner", Role: domain.RoleMember}
}

func TestOwnerEditApprovedMinorStaysLive(t *testing.T) {
	f := &fakeRepo{listings: []domain.Listing{{
		ID: "l1", Slug: "esi-sunshine", Type: domain.TypeArtist, OwnerID: "m-owner",
		Title: "Esi Sunshine", Status: domain.StatusApproved, SubmittedAt: "2026-03-10T00:00:00Z",
		Details: map[string]any{"actName": "Esi Sunshine", "bio": "same bio", "spotlight": true},
	}}}
	svc := newTestService(f)

	// Minor edit: only link and actName changed (no major content keys, title unchanged).
	l, err := svc.UpdateOwnerListing(context.Background(), ownerActor(), "l1", OwnerEditInput{
		Title: "Esi Sunshine",
		Details: map[string]any{
			"bio":       "same bio",           // unchanged — not major
			"actName":   "Esi Sunshine (Esi)", // minor rename
			"link":      "https://example.com/esi",
			"spotlight": true,                  // system key — must be stripped
			"unknown":   "nope",                // unknown key — must be dropped
			"bad":       "javascript:alert(1)", // not whitelisted anyway
		},
	})
	if err != nil {
		t.Fatalf("edit: %v", err)
	}
	if l.Status != domain.StatusApproved {
		t.Fatalf("minor edit of approved listing must stay live, got %q", l.Status)
	}
	if l.SubmittedAt != "2026-03-10T00:00:00Z" {
		t.Fatalf("submittedAt must be untouched on minor edits, got %q", l.SubmittedAt)
	}
	if l.Details["actName"] != "Esi Sunshine (Esi)" {
		t.Fatalf("actName not updated: %v", l.Details["actName"])
	}
	if _, ok := l.Details["spotlight"]; ok {
		t.Fatal("system key spotlight leaked into details")
	}
	if _, ok := l.Details["unknown"]; ok {
		t.Fatal("unknown key leaked into details")
	}
	// Audit record written with minor kind.
	if len(f.mods) != 1 || f.mods[0].Action != "owner-edit-minor" || f.mods[0].ModeratorID != "m-owner" {
		t.Fatalf("expected one owner-edit-minor audit record, got %+v", f.mods)
	}
}

func TestOwnerEditApprovedMajorRequeues(t *testing.T) {
	f := &fakeRepo{listings: []domain.Listing{{
		ID: "l1", Slug: "esi-sunshine", Type: domain.TypeArtist, OwnerID: "m-owner",
		Title: "Esi Sunshine", Status: domain.StatusApproved, SubmittedAt: "2026-03-10T00:00:00Z",
		Details: map[string]any{"bio": "old bio"},
	}}}
	svc := newTestService(f)

	// Major edit: bio content changed.
	l, err := svc.UpdateOwnerListing(context.Background(), ownerActor(), "l1", OwnerEditInput{
		Title:   "Esi Sunshine",
		Details: map[string]any{"bio": "completely new bio content"},
	})
	if err != nil {
		t.Fatalf("edit: %v", err)
	}
	if l.Status != domain.StatusPending {
		t.Fatalf("major bio edit of approved listing must re-queue, got %q", l.Status)
	}
	if l.SubmittedAt == "2026-03-10T00:00:00Z" || l.SubmittedAt == "" {
		t.Fatalf("submittedAt should refresh on major edit, got %q", l.SubmittedAt)
	}
	// Audit record written with major kind.
	if len(f.mods) != 1 || f.mods[0].Action != "owner-edit-major" {
		t.Fatalf("expected one owner-edit-major audit record, got %+v", f.mods)
	}
}

func TestOwnerEditApprovedTitleChangeRequeues(t *testing.T) {
	f := &fakeRepo{listings: []domain.Listing{{
		ID: "l1", Type: domain.TypeBusiness, OwnerID: "m-owner",
		Title: "Campus Bookshop", Status: domain.StatusApproved, SubmittedAt: "2026-03-10T00:00:00Z",
	}}}
	svc := newTestService(f)

	l, err := svc.UpdateOwnerListing(context.Background(), ownerActor(), "l1", OwnerEditInput{
		Title: "Campus Books & Stationery", // title changed = major
	})
	if err != nil {
		t.Fatalf("edit: %v", err)
	}
	if l.Status != domain.StatusPending {
		t.Fatalf("title change on approved listing must re-queue, got %q", l.Status)
	}
}

func TestOwnerEditPropertyPriceRequeuesAndKeepsEntitlement(t *testing.T) {
	current := validPropertyDetails()
	current["offerType"] = "long-term"
	current["propertyType"] = "apartment"
	current["area"] = "Pedu"
	current["pricePesewas"] = int64(180000)
	current["depositPesewas"] = int64(360000)
	current["bedrooms"] = int64(2)
	current["bathrooms"] = int64(2)
	delete(current, "unknown")
	current["availability"] = "available"
	current["subscribedUntil"] = "2027-01-01T00:00:00Z"
	f := &fakeRepo{listings: []domain.Listing{{
		ID: "p1", Type: domain.TypeProperty, OwnerID: "m-owner", Title: "Pedu Garden Apartment",
		Status: domain.StatusApproved, Details: current,
	}}}
	next := validPropertyDetails()
	next["pricePesewas"] = float64(190000)
	l, err := newTestService(f).UpdateOwnerListing(context.Background(), ownerActor(), "p1", OwnerEditInput{
		Title: "Pedu Garden Apartment", Details: next,
	})
	if err != nil {
		t.Fatalf("edit property: %v", err)
	}
	if l.Status != domain.StatusPending {
		t.Fatalf("numeric property price change must re-queue, got %q", l.Status)
	}
	if l.Details["pricePesewas"] != int64(190000) {
		t.Fatalf("price was not normalised and updated: %+v", l.Details)
	}
	if l.Details["subscribedUntil"] != "2027-01-01T00:00:00Z" {
		t.Fatalf("system entitlement was lost: %+v", l.Details)
	}
}

func TestOwnerEditPropertyAvailabilityOnlyStaysLive(t *testing.T) {
	current := validPropertyDetails()
	current["offerType"] = "long-term"
	current["propertyType"] = "apartment"
	current["area"] = "Pedu"
	current["pricePesewas"] = int64(180000)
	current["depositPesewas"] = int64(360000)
	current["bedrooms"] = int64(2)
	current["bathrooms"] = int64(2)
	current["amenities"] = []string{"Water tank", "Parking"}
	delete(current, "unknown")
	current["availability"] = "available"
	f := &fakeRepo{listings: []domain.Listing{{
		ID: "p1", Type: domain.TypeProperty, OwnerID: "m-owner", Title: "Pedu Garden Apartment",
		Status: domain.StatusApproved, Details: current,
	}}}
	next := validPropertyDetails()
	next["availability"] = "let"
	l, err := newTestService(f).UpdateOwnerListing(context.Background(), ownerActor(), "p1", OwnerEditInput{
		Title: "Pedu Garden Apartment", Details: next,
	})
	if err != nil {
		t.Fatalf("edit property: %v", err)
	}
	if l.Status != domain.StatusApproved || l.Details["availability"] != "let" {
		t.Fatalf("availability-only edit should stay live: %+v", l)
	}
}

func TestOwnerEditRequeuesNonLive(t *testing.T) {
	for _, from := range []string{domain.StatusDraft, domain.StatusRejected, domain.StatusUnpublished} {
		f := &fakeRepo{listings: []domain.Listing{{
			ID: "l1", Type: domain.TypeBusiness, OwnerID: "m-owner",
			Title: "Campus Bookshop", Status: from, SubmittedAt: "2026-01-01T00:00:00Z",
			Details: map[string]any{"description": "old"},
		}}}
		svc := newTestService(f)
		l, err := svc.UpdateOwnerListing(context.Background(), ownerActor(), "l1", OwnerEditInput{Title: "Campus Bookshop", Details: map[string]any{"description": "new"}})
		if err != nil {
			t.Fatalf("%s: edit: %v", from, err)
		}
		if l.Status != domain.StatusPending {
			t.Fatalf("%s: expected re-queue to pending, got %q", from, l.Status)
		}
		if l.SubmittedAt == "2026-01-01T00:00:00Z" || l.SubmittedAt == "" {
			t.Fatalf("%s: submittedAt should refresh on re-queue, got %q", from, l.SubmittedAt)
		}
	}
}

func TestOwnerEditPendingStaysPending(t *testing.T) {
	f := &fakeRepo{listings: []domain.Listing{{
		ID: "l1", Type: domain.TypeEvent, OwnerID: "m-owner",
		Title: "Gig", Status: domain.StatusPending, SubmittedAt: "2026-05-01T00:00:00Z",
	}}}
	svc := newTestService(f)
	l, err := svc.UpdateOwnerListing(context.Background(), ownerActor(), "l1", OwnerEditInput{Title: "Gig", Details: map[string]any{"venue": "Castle Gardens"}})
	if err != nil {
		t.Fatalf("edit: %v", err)
	}
	if l.Status != domain.StatusPending || l.SubmittedAt != "2026-05-01T00:00:00Z" {
		t.Fatalf("pending edit must keep status/submittedAt, got %q / %q", l.Status, l.SubmittedAt)
	}
}

func TestOwnerEditRejectsNonOwner(t *testing.T) {
	f := &fakeRepo{listings: []domain.Listing{{
		ID: "l1", Type: domain.TypeArtist, OwnerID: "m-owner", Title: "Esi", Status: domain.StatusApproved,
	}}}
	svc := newTestService(f)
	stranger := &domain.Member{ID: "m-other", Role: domain.RoleMember}
	_, err := svc.UpdateOwnerListing(context.Background(), stranger, "l1", OwnerEditInput{Title: "Hijack"})
	var fb *domain.ForbiddenError
	if !errors.As(err, &fb) {
		t.Fatalf("expected ForbiddenError, got %v", err)
	}
}

func TestOwnerEditCuratorBypass(t *testing.T) {
	f := &fakeRepo{listings: []domain.Listing{{
		ID: "l1", Type: domain.TypeArtist, OwnerID: "m-owner", Title: "Esi", Status: domain.StatusApproved,
	}}}
	svc := newTestService(f)
	curator := &domain.Member{ID: "m-cur", Role: domain.RoleCurator}
	if _, err := svc.UpdateOwnerListing(context.Background(), curator, "l1", OwnerEditInput{Title: "Esi Fixed"}); err != nil {
		t.Fatalf("curator bypass: %v", err)
	}
}

func TestOwnerEditValidates(t *testing.T) {
	f := &fakeRepo{listings: []domain.Listing{{
		ID: "l1", Type: domain.TypeArtist, OwnerID: "m-owner", Title: "Esi", Status: domain.StatusApproved,
	}}}
	svc := newTestService(f)
	if _, err := svc.UpdateOwnerListing(context.Background(), ownerActor(), "l1", OwnerEditInput{Title: "x"}); err == nil {
		t.Fatal("expected title validation error")
	}
	if _, err := svc.UpdateOwnerListing(context.Background(), nil, "l1", OwnerEditInput{Title: "Fine Title"}); err == nil {
		t.Fatal("expected sign-in required error")
	}
}

func TestOwnerEditMemorialKeepsCounters(t *testing.T) {
	f := &fakeRepo{listings: []domain.Listing{{
		ID: "l1", Type: domain.TypeMemorial, OwnerID: "m-owner", Title: "Nana", Status: domain.StatusApproved,
		Details: map[string]any{"lifeStory": "old", "candles": 7, "rememberedByCount": 3},
	}}}
	svc := newTestService(f)
	// lifeStory is a major edit key — the listing re-queues, but counters must survive.
	l, err := svc.UpdateOwnerListing(context.Background(), ownerActor(), "l1", OwnerEditInput{Title: "Nana", Details: map[string]any{"lifeStory": "new"}})
	if err != nil {
		t.Fatalf("edit: %v", err)
	}
	if l.Details["candles"] != 7 || l.Details["rememberedByCount"] != 3 {
		t.Fatalf("system counters lost: %+v", l.Details)
	}
	// lifeStory changed = major edit, listing re-queues
	if l.Status != domain.StatusPending {
		t.Fatalf("major content edit should re-queue, got %q", l.Status)
	}
}

func TestOwnerEditMemorialKeepsRemembranceFlags(t *testing.T) {
	f := &fakeRepo{listings: []domain.Listing{{
		ID: "l1", Type: domain.TypeMemorial, OwnerID: "m-owner", Title: "Nana", Status: domain.StatusApproved,
		Details: map[string]any{"lifeStory": "same story", "remindersEnabled": true, "observeBirthday": true, "keeperId": "m-keeper", "candles": 7},
	}}}
	svc := newTestService(f)
	// An edit that omits the flags (older client) must not switch remembrance off.
	// lifeStory is unchanged (same value) → minor edit, stays live.
	l, err := svc.UpdateOwnerListing(context.Background(), ownerActor(), "l1", OwnerEditInput{Title: "Nana", Details: map[string]any{"lifeStory": "same story"}})
	if err != nil {
		t.Fatalf("edit: %v", err)
	}
	if l.Details["remindersEnabled"] != true || l.Details["observeBirthday"] != true {
		t.Fatalf("remembrance flags lost: %+v", l.Details)
	}
	if l.Details["keeperId"] != "m-keeper" || l.Details["candles"] != 7 {
		t.Fatalf("keeper link / counters lost: %+v", l.Details)
	}
}

func TestOwnerEditMemorialKeeperTogglesReminders(t *testing.T) {
	f := &fakeRepo{listings: []domain.Listing{{
		ID: "l1", Type: domain.TypeMemorial, OwnerID: "m-owner", Title: "Nana", Status: domain.StatusApproved,
		Details: map[string]any{"lifeStory": "same", "remindersEnabled": true, "observeBirthday": false},
	}}}
	svc := newTestService(f)
	// Toggle flags only, lifeStory unchanged → minor edit, stays approved.
	l, err := svc.UpdateOwnerListing(context.Background(), ownerActor(), "l1", OwnerEditInput{Title: "Nana", Details: map[string]any{
		"lifeStory": "same", "remindersEnabled": false, "observeBirthday": true,
	}})
	if err != nil {
		t.Fatalf("edit: %v", err)
	}
	if l.Details["remindersEnabled"] != false || l.Details["observeBirthday"] != true {
		t.Fatalf("keeper toggles not applied: %+v", l.Details)
	}
	if l.Status != domain.StatusApproved {
		t.Fatalf("flag-only change should stay approved, got %q", l.Status)
	}
}
