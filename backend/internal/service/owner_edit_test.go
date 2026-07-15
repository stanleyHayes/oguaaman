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

func TestOwnerEditApprovedStaysLive(t *testing.T) {
	f := &fakeRepo{listings: []domain.Listing{{
		ID: "l1", Slug: "esi-sunshine", Type: domain.TypeArtist, OwnerID: "m-owner",
		Title: "Esi Sunshine", Status: domain.StatusApproved, SubmittedAt: "2026-03-10T00:00:00Z",
		Details: map[string]any{"actName": "Esi Sunshine", "bio": "old bio", "spotlight": true},
	}}}
	svc := newTestService(f)

	l, err := svc.UpdateOwnerListing(context.Background(), ownerActor(), "l1", OwnerEditInput{
		Title: "Esi Sunshine",
		Details: map[string]any{
			"bio":       "new bio",
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
		t.Fatalf("approved listing must stay live, got %q", l.Status)
	}
	if l.SubmittedAt != "2026-03-10T00:00:00Z" {
		t.Fatalf("submittedAt must be untouched on live edits, got %q", l.SubmittedAt)
	}
	if l.Details["bio"] != "new bio" {
		t.Fatalf("bio not updated: %v", l.Details["bio"])
	}
	if _, ok := l.Details["spotlight"]; ok {
		t.Fatal("system key spotlight leaked into details")
	}
	if _, ok := l.Details["unknown"]; ok {
		t.Fatal("unknown key leaked into details")
	}
	// Audit record written.
	if len(f.mods) != 1 || f.mods[0].Action != "owner-edit" || f.mods[0].ModeratorID != "m-owner" {
		t.Fatalf("expected one owner-edit audit record, got %+v", f.mods)
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
	l, err := svc.UpdateOwnerListing(context.Background(), ownerActor(), "l1", OwnerEditInput{Title: "Nana", Details: map[string]any{"lifeStory": "new"}})
	if err != nil {
		t.Fatalf("edit: %v", err)
	}
	if l.Details["candles"] != 7 || l.Details["rememberedByCount"] != 3 {
		t.Fatalf("system counters lost: %+v", l.Details)
	}
}
