package service

import (
	"context"
	"strings"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/oguaa/backend/internal/domain"
)

// F086: a member must not be able to smuggle system-managed details (a free
// Supporter plan, a fake rating, editorial flags, counters) in with a new
// listing.
func TestSubmitStripsSystemDetails(t *testing.T) {
	svc := newTestService(&fakeRepo{})
	l, err := svc.Submit(context.Background(), SubmitInput{
		Type: domain.TypeBusiness, Title: "Corner Shop", OwnerID: "m-owner",
		Details: map[string]any{
			"description":     "Groceries and phone credit.",
			"subscribedUntil": "2099-01-01T00:00:00Z", "plan": "business-pro",
			"ratingAvg": 5, "ratingCount": 250, "spotlight": true, "anchorFestival": true,
			"candles": 900, "donorCount": 17,
		},
	})
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	for _, k := range []string{"subscribedUntil", "plan", "ratingAvg", "ratingCount", "spotlight", "anchorFestival", "candles", "donorCount"} {
		if _, ok := l.Details[k]; ok {
			t.Errorf("system key %q survived submit: %v", k, l.Details[k])
		}
	}
	if SupporterActive(*l, time.Now().UTC()) {
		t.Fatal("a submitted listing must never start with an active Supporter plan")
	}
	if l.Details["description"] != "Groceries and phone credit." {
		t.Fatalf("member content lost: %+v", l.Details)
	}
}

func TestSubmitMemorialCountersStartAtZeroAndLinksAreGuarded(t *testing.T) {
	svc := newTestService(&fakeRepo{})
	l, err := svc.Submit(context.Background(), SubmitInput{
		Type: domain.TypeMemorial, Title: "Nana Esi", OwnerID: "m-owner",
		Details: map[string]any{
			"lifeStory": "A teacher.", "candles": 5000, "rememberedByCount": 80, "keeperId": "m-attacker",
			"gallery": []any{map[string]any{"url": "javascript:alert(1)"}},
		},
	})
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	if l.Details["candles"] != 0 || l.Details["rememberedByCount"] != 0 {
		t.Fatalf("memorial counters must start at zero: %+v", l.Details)
	}
	if _, ok := l.Details["keeperId"]; ok {
		t.Fatal("a member must not appoint the keeper on submit")
	}
	gallery := l.Details["gallery"].([]any)
	if gallery[0].(map[string]any)["url"] != "" {
		t.Fatalf("unsafe gallery link kept: %v", gallery)
	}
}

func TestSubmitFlagsScreenedContentForCurators(t *testing.T) {
	svc := newTestService(&fakeRepo{})
	l, err := svc.Submit(context.Background(), SubmitInput{
		Type: domain.TypeBusiness, Title: "Night club", OwnerID: "m-owner",
		Details: map[string]any{"description": "Free porn screenings every night"},
	})
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	if l.Status != domain.StatusPending || len(l.ScreenFlags) == 0 || l.ScreenFlags[0] != ScreenSexual {
		t.Fatalf("flagged submission = status %q flags %v, want pending with the sexual flag", l.Status, l.ScreenFlags)
	}
}

// F091: an owner's content edit must not wipe details the platform or its
// curators maintain.
func TestOwnerEditKeepsSystemAndEditorialDetails(t *testing.T) {
	f := &fakeRepo{listings: []domain.Listing{
		{ID: "ev", Type: domain.TypeEvent, OwnerID: "m-owner", Title: "Fetu Afahye 2026", Status: domain.StatusApproved,
			Details: map[string]any{
				"description": "The grand durbar.", "admission": "free", "refundPolicy": "No refunds",
				"festival": "fetu-afahye", "edition": "2026", "anchorFestival": true, "recap": "…",
				"programme": bson.A{bson.D{{Key: "day", Value: "Saturday"}, {Key: "title", Value: "Durbar"}}},
			}},
		{ID: "ar", Type: domain.TypeArtist, OwnerID: "m-owner", Title: "Esi", Status: domain.StatusApproved,
			Details: map[string]any{"bio": "same", "donationsNetPesewas": int64(95000), "donorCount": int32(17), "spotlight": true}},
		{ID: "bz", Type: domain.TypeBusiness, OwnerID: "m-owner", Title: "Shop", Status: domain.StatusApproved,
			Details: map[string]any{"description": "same", "ratingAvg": 4.5, "ratingCount": int32(12), "subscribedUntil": "2027-01-01T00:00:00Z", "plan": "supporter"}},
	}}
	svc := newTestService(f)
	edits := map[string]OwnerEditInput{
		"ev": {Title: "Fetu Afahye 2026", Details: map[string]any{"description": "The grand durbar.", "admission": "free", "refundPolicy": "Refunds until Friday"}},
		"ar": {Title: "Esi", Details: map[string]any{"bio": "same", "link": "https://example.com/esi"}},
		"bz": {Title: "Shop", Details: map[string]any{"description": "same", "openingHours": "8–6"}},
	}
	want := map[string][]string{
		"ev": {"festival", "edition", "anchorFestival", "recap", "programme"},
		"ar": {"donationsNetPesewas", "donorCount", "spotlight"},
		"bz": {"ratingAvg", "ratingCount", "subscribedUntil", "plan"},
	}
	for id, in := range edits {
		l, err := svc.UpdateOwnerListing(context.Background(), ownerActor(), id, in)
		if err != nil {
			t.Fatalf("%s: edit: %v", id, err)
		}
		for _, k := range want[id] {
			if _, ok := l.Details[k]; !ok {
				t.Errorf("%s: %q was wiped by the owner edit", id, k)
			}
		}
	}
}

// F090: values read back from MongoDB (bson.A / bson.D / int32) must compare
// equal to the same values in an HTTP payload, so a minor edit stays live.
func TestOwnerEditMinorChangesStayLiveOnStoredBSONShapes(t *testing.T) {
	f := &fakeRepo{listings: []domain.Listing{
		{ID: "bz", Type: domain.TypeBusiness, OwnerID: "m-owner", Title: "Shop", Status: domain.StatusApproved,
			Details: map[string]any{
				"description": "Groceries", "categories": bson.A{"food", "shops"}, "openingHours": "8–6",
				"services": bson.A{"delivery"},
			}},
		{ID: "ev", Type: domain.TypeEvent, OwnerID: "m-owner", Title: "Gig", Status: domain.StatusApproved,
			Details: map[string]any{
				"description": "Live band", "admission": "paid", "audience": bson.A{"all-ages"},
				"highlights": bson.A{"Highlife", "Food"}, "refundPolicy": "No refunds",
				"tiers": bson.A{bson.D{{Key: "name", Value: "Regular"}, {Key: "pricePesewas", Value: int64(5000)}, {Key: "capacity", Value: int32(100)}}},
			}},
		{ID: "ar", Type: domain.TypeArtist, OwnerID: "m-owner", Title: "Esi", Status: domain.StatusApproved,
			Details: map[string]any{"bio": "Highlife singer", "link": "https://old.example"}},
	}}
	svc := newTestService(f)
	edits := map[string]OwnerEditInput{
		"bz": {Title: "Shop", Details: map[string]any{"description": "Groceries", "categories": []any{"food", "shops"}, "openingHours": "7–7", "services": []any{"delivery"}}},
		"ev": {Title: "Gig", Details: map[string]any{
			"description": "Live band", "admission": "paid", "audience": []any{"all-ages"}, "highlights": []any{"Highlife", "Food"},
			"refundPolicy": "Refunds until the day before",
			"tiers":        []any{map[string]any{"name": "Regular", "pricePesewas": float64(5000), "capacity": float64(100)}},
		}},
		"ar": {Title: "Esi", Details: map[string]any{"bio": "Highlife singer", "link": "https://new.example", "releases": []any{}}},
	}
	for id, in := range edits {
		l, err := svc.UpdateOwnerListing(context.Background(), ownerActor(), id, in)
		if err != nil {
			t.Fatalf("%s: edit: %v", id, err)
		}
		if l.Status != domain.StatusApproved {
			t.Errorf("%s: a minor edit re-queued the listing (status %q)", id, l.Status)
		}
	}
}

// F089: the mentorship safeguarding gate applies to edits too, and a change to
// the safeguarding terms re-queues an approved listing.
func TestOwnerEditMentorshipSafeguarding(t *testing.T) {
	approvedMentorship := func() *fakeRepo {
		return &fakeRepo{listings: []domain.Listing{{
			ID: "op", Type: domain.TypeOpportunity, OwnerID: "m-owner", Title: "Mentor Bridge", Status: domain.StatusApproved,
			Details: map[string]any{
				"kind": "mentorship", "description": "Weekly mentoring", "safeguardingPolicyUrl": "https://example.com/policy",
				"minAge": int32(16), "maxAge": int32(19), "guardianConsentRequired": true,
			},
		}}}
	}
	bad := []map[string]any{
		{"kind": "mentorship", "description": "Weekly mentoring", "minAge": "10", "guardianConsentRequired": false},
		{"kind": "mentorship", "description": "Weekly mentoring", "safeguardingPolicyUrl": "javascript:alert(1)", "minAge": "16", "guardianConsentRequired": true},
		{"kind": "mentorship", "description": "Weekly mentoring", "safeguardingPolicyUrl": "https://example.com/policy", "minAge": "16", "guardianConsentRequired": false},
	}
	for i, details := range bad {
		svc := newTestService(approvedMentorship())
		if _, err := svc.UpdateOwnerListing(context.Background(), ownerActor(), "op", OwnerEditInput{Title: "Mentor Bridge", Details: details}); err == nil {
			t.Errorf("case %d: an unsafe mentorship edit was accepted", i)
		}
	}

	f := approvedMentorship()
	l, err := newTestService(f).UpdateOwnerListing(context.Background(), ownerActor(), "op", OwnerEditInput{Title: "Mentor Bridge", Details: map[string]any{
		"kind": "mentorship", "description": "Weekly mentoring", "safeguardingPolicyUrl": "https://example.com/policy",
		"minAge": "14", "maxAge": "19", "guardianConsentRequired": true,
	}})
	if err != nil {
		t.Fatalf("valid safeguarding change: %v", err)
	}
	if l.Status != domain.StatusPending {
		t.Fatalf("lowering the minimum age must re-queue for review, got %q", l.Status)
	}
}

func TestOwnerEditIntroducingFlaggedTextRequeues(t *testing.T) {
	f := &fakeRepo{listings: []domain.Listing{{
		ID: "bz", Type: domain.TypeBusiness, OwnerID: "m-owner", Title: "Shop", Status: domain.StatusApproved,
		Details: map[string]any{"description": "Groceries", "openingHours": "8–6"},
	}}}
	l, err := newTestService(f).UpdateOwnerListing(context.Background(), ownerActor(), "bz", OwnerEditInput{
		Title: "Shop", Details: map[string]any{"description": "Groceries", "openingHours": "open all fucking night"},
	})
	if err != nil {
		t.Fatalf("edit: %v", err)
	}
	if l.Status != domain.StatusPending || len(l.ScreenFlags) == 0 {
		t.Fatalf("flagged minor edit = status %q flags %v, want re-queued and flagged", l.Status, l.ScreenFlags)
	}
	if !strings.Contains(f.mods[len(f.mods)-1].Reason, ScreenProfanity) {
		t.Fatalf("audit record should name the screen reason: %+v", f.mods)
	}
}

func TestCanonicalDetailTreatsEmptyAsAbsent(t *testing.T) {
	for _, v := range []any{nil, "", []any{}, bson.A{}, map[string]any{}, bson.D{}} {
		if got := canonicalDetail(v); got != nil {
			t.Errorf("canonicalDetail(%#v) = %#v, want nil", v, got)
		}
	}
}
