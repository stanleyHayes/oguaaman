package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

func memorialFixture(status string) *fakeRepo {
	return &fakeRepo{listings: []domain.Listing{{
		ID: "mem-1", Slug: "auntie-esi", Type: domain.TypeMemorial, Status: status, OwnerID: "m-owner",
		Details: map[string]any{"keeperId": "m-keeper"},
	}}}
}

func tributeService(f *fakeRepo, blocks *fakeBlockRepo) *Service {
	return New(Deps{Listings: f, Members: stubMembers{}, Orgs: stubOrgs{}, Places: stubPlaces{}, Mod: modRepo{f}, Notifs: stubNotifs{}, Follows: stubFollows{}, Blocks: blocks, Claims: stubClaims{}, News: stubNews{}, Reports: stubReports{}, Timeline: stubTimeline{}})
}

// F092: tributes need a signed-in author, use that member's own name, are
// bounded, screened and only accepted on published memorials.
func TestAddTribute_rules(t *testing.T) {
	ctx := context.Background()
	kojo := &domain.Member{ID: "m-kojo", Slug: "kojo", DisplayName: "Kojo Arthur"}
	in := TributeInput{Message: "Rest well, Auntie.", Relation: "Nephew"}

	svc := tributeService(memorialFixture(domain.StatusApproved), &fakeBlockRepo{})
	var fb *domain.ForbiddenError
	if _, err := svc.AddTribute(ctx, nil, "auntie-esi", in); !errors.As(err, &fb) {
		t.Fatalf("anonymous tribute: got %v, want forbidden", err)
	}
	tr, err := svc.AddTribute(ctx, kojo, "auntie-esi", in)
	if err != nil {
		t.Fatalf("add: %v", err)
	}
	if tr.AuthorName != "Kojo Arthur" || tr.MemberID != "m-kojo" || tr.MemberSlug != "kojo" {
		t.Fatalf("tribute must be attributed to the member: %+v", tr)
	}
	if _, err := svc.AddTribute(ctx, kojo, "auntie-esi", TributeInput{Message: strings.Repeat("a", maxTributeMessageRunes+1)}); err == nil {
		t.Fatal("an over-long tribute must be refused")
	}
	if _, err := svc.AddTribute(ctx, kojo, "auntie-esi", TributeInput{Message: "I will kill you"}); err == nil {
		t.Fatal("a threatening tribute must be refused")
	}
	for i := 1; i < maxTributesPerMember; i++ {
		if _, err := svc.AddTribute(ctx, kojo, "auntie-esi", in); err != nil {
			t.Fatalf("tribute %d: %v", i+1, err)
		}
	}
	if _, err := svc.AddTribute(ctx, kojo, "auntie-esi", in); err == nil {
		t.Fatal("the per-member cap must hold")
	}

	pending := tributeService(memorialFixture(domain.StatusPending), &fakeBlockRepo{})
	var nf *domain.NotFoundError
	if _, err := pending.AddTribute(ctx, kojo, "auntie-esi", in); !errors.As(err, &nf) {
		t.Fatalf("unpublished memorial: got %v, want not found", err)
	}

	blocks := &fakeBlockRepo{}
	_ = blocks.Block(ctx, "m-owner", "m-kojo", "")
	if _, err := tributeService(memorialFixture(domain.StatusApproved), blocks).AddTribute(ctx, kojo, "auntie-esi", in); !errors.As(err, &fb) {
		t.Fatalf("blocked member: got %v, want forbidden", err)
	}
}

func TestRemoveTribute_permissions(t *testing.T) {
	ctx := context.Background()
	f := memorialFixture(domain.StatusApproved)
	f.listings[0].Tributes = []domain.Tribute{{ID: "trb-1", MemberID: "m-kojo", Message: "x"}, {ID: "trb-2", MemberID: "m-ama", Message: "y"}}
	svc := tributeService(f, &fakeBlockRepo{})

	var fb *domain.ForbiddenError
	if err := svc.RemoveTribute(ctx, &domain.Member{ID: "m-stranger"}, "auntie-esi", "trb-1"); !errors.As(err, &fb) {
		t.Fatalf("stranger: got %v, want forbidden", err)
	}
	if err := svc.RemoveTribute(ctx, &domain.Member{ID: "m-kojo"}, "auntie-esi", "trb-1"); err != nil {
		t.Fatalf("author: %v", err)
	}
	if err := svc.RemoveTribute(ctx, &domain.Member{ID: "m-keeper"}, "auntie-esi", "trb-2"); err != nil {
		t.Fatalf("keeper: %v", err)
	}
	for _, tr := range f.listings[0].Tributes {
		if tr.Status != domain.TributeRemoved {
			t.Fatalf("tribute %s not removed", tr.ID)
		}
	}
	l, err := svc.ListingBySlug(ctx, domain.TypeMemorial, "auntie-esi")
	if err != nil || len(l.Tributes) != 0 {
		t.Fatalf("removed tributes must not be public: %+v (%v)", l, err)
	}
}

// F102: one candle per member per day, published memorials only.
func TestLightCandle_dedupesAndNeedsPublished(t *testing.T) {
	ctx := context.Background()
	svc := tributeService(memorialFixture(domain.StatusApproved), &fakeBlockRepo{})
	for i := 0; i < 3; i++ {
		n, err := svc.LightCandle(ctx, "auntie-esi", "m-kojo")
		if err != nil || n != 1 {
			t.Fatalf("candle %d = %d (%v), want 1", i, n, err)
		}
	}
	if n, _ := svc.LightCandle(ctx, "auntie-esi", "m-ama"); n != 2 {
		t.Fatalf("a second visitor lights a second candle, got %d", n)
	}
	pending := tributeService(memorialFixture(domain.StatusPending), &fakeBlockRepo{})
	if _, err := pending.LightCandle(ctx, "auntie-esi", "m-kojo"); err == nil {
		t.Fatal("an unpublished memorial takes no candles")
	}
}

// R27: signed out, a visitor is known only by IP, and one address can be a
// whole school, office or mobile network. Its mourners each light a candle,
// up to a daily allowance per memorial, instead of the first one lighting the
// only candle everyone behind that address gets.
func TestLightCandle_sharedAddressLightsSeveral(t *testing.T) {
	ctx := context.Background()
	svc := tributeService(memorialFixture(domain.StatusApproved), &fakeBlockRepo{})
	school := domain.AnonymousVisitorPrefix + "41.66.200.7"
	for i := 1; i <= addressCandlesPerDay; i++ {
		if n, err := svc.LightCandle(ctx, "auntie-esi", school); err != nil || n != i {
			t.Fatalf("candle %d from one address = %d (%v), want %d", i, n, err, i)
		}
	}
	if n, _ := svc.LightCandle(ctx, "auntie-esi", school); n != addressCandlesPerDay {
		t.Fatalf("past the address's daily allowance the count must stay %d, got %d", addressCandlesPerDay, n)
	}
	if n, _ := svc.LightCandle(ctx, "auntie-esi", domain.AnonymousVisitorPrefix+"102.176.9.1"); n != addressCandlesPerDay+1 {
		t.Fatalf("another address still lights a candle, got %d", n)
	}
}

// F098: views are recorded only for real, published listings.
func TestRecordView_needsPublishedListing(t *testing.T) {
	ctx := context.Background()
	svc := tributeService(memorialFixture(domain.StatusApproved), &fakeBlockRepo{})
	if _, err := svc.RecordView(ctx, "mem-1", "ip:1"); err != nil {
		t.Fatalf("published: %v", err)
	}
	var nf *domain.NotFoundError
	for _, id := range []string{"nope", strings.Repeat("x", maxListingIDLen+1), ""} {
		if _, err := svc.RecordView(ctx, id, "ip:1"); !errors.As(err, &nf) {
			t.Fatalf("id %.10q: got %v, want not found", id, err)
		}
	}
	pending := tributeService(memorialFixture(domain.StatusPending), &fakeBlockRepo{})
	if _, err := pending.RecordView(ctx, "mem-1", "ip:1"); !errors.As(err, &nf) {
		t.Fatalf("unpublished: got %v, want not found", err)
	}
}
