package service

import (
	"context"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

func lostFoundSvcWith(f *fakeRepo, notifs *lfNotifs, blocks *fakeBlockRepo, members ...domain.Member) *Service {
	return New(Deps{Listings: f, Members: lfMembers{members: members}, Orgs: stubOrgs{}, Places: stubPlaces{}, Mod: modRepo{f}, Notifs: notifs, Follows: stubFollows{}, Blocks: blocks, Claims: stubClaims{}, News: stubNews{}, Reports: stubReports{}, Timeline: stubTimeline{}})
}

// R12 / D3: lost & found notices auto-publish whoever posts them; only text
// the content screen flags waits for a curator.
func TestSubmitLostFound_unverifiedPosterPublishes(t *testing.T) {
	syncIncidentFanOut(t)
	f, notifs := &fakeRepo{}, &lfNotifs{}
	svc := lostFoundSvcWith(f, notifs, &fakeBlockRepo{}, domain.Member{ID: "m-c", Role: domain.RoleCurator})
	l, err := svc.SubmitLostFound(context.Background(), &domain.Member{ID: "m-new"}, LostFoundInput{
		Title: "Found: a school bag", Kind: "found_item", Description: "Blue bag near the lorry park.", Contact: "024 000 0000",
	})
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	if l.Status != domain.StatusApproved || l.Held || l.PublishedAt == "" {
		t.Fatalf("unverified notice = status %q held %v, want published", l.Status, l.Held)
	}
	if len(notifs.inserted) != 0 {
		t.Fatalf("a clean found-item notice needs no curator alert: %+v", notifs.inserted)
	}
}

func TestSubmitLostFound_contentScreen(t *testing.T) {
	syncIncidentFanOut(t)
	verified := &domain.Member{ID: "m-9", PhoneVerified: true}
	svc := lostFoundSvcWith(&fakeRepo{}, &lfNotifs{}, &fakeBlockRepo{})
	l, err := svc.SubmitLostFound(context.Background(), verified, LostFoundInput{
		Title: "Lost phone", Kind: "lost_item", Description: "Black Samsung. Call my sister on 0244 123 456.", Contact: "024 000 0000",
	})
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	if !l.Held || l.Status != domain.StatusPending || len(l.ScreenFlags) == 0 || l.ScreenFlags[0] != ScreenPrivateInfo {
		t.Fatalf("phone number in free text = held %v status %q flags %v, want held for review", l.Held, l.Status, l.ScreenFlags)
	}
	// R03: a threat is held for a curator, not refused (the poster may be
	// quoting someone).
	threat, err := svc.SubmitLostFound(context.Background(), verified, LostFoundInput{
		Title: "Found you", Kind: "found_item", Description: "I know where you live", Contact: "x",
	})
	if err != nil || !threat.Held || threat.Status != domain.StatusPending {
		t.Fatalf("a threatening notice must wait for a curator: %+v (%v)", threat, err)
	}
}

// D3 / F095: the public never sees the poster's contact or member id.
func TestLostFoundPublicViewHidesPoster(t *testing.T) {
	svc, _ := lostFoundTestService()
	ctx := context.Background()
	public, err := svc.LostFoundBySlug(ctx, nil, "lost-black-samsung-phone-at-victoria-park")
	if err != nil {
		t.Fatalf("public read: %v", err)
	}
	if public.OwnerID != "" || public.Details["contact"] != nil {
		t.Fatalf("public notice exposes the poster: owner %q contact %v", public.OwnerID, public.Details["contact"])
	}
	for _, viewer := range []*domain.Member{{ID: "m-7"}, {ID: "m-c", Role: domain.RoleCurator}} {
		l, err := svc.LostFoundBySlug(ctx, viewer, "lost-black-samsung-phone-at-victoria-park")
		if err != nil || l.Details["contact"] != "m-7" || l.OwnerID != "m-7" {
			t.Fatalf("%s must see the poster's contact: %+v (%v)", viewer.ID, l, err)
		}
	}
	list, _ := svc.LostFound(ctx, nil, LostFoundFilters{})
	if len(list) != 1 || list[0].Details["contact"] != nil {
		t.Fatalf("public list exposes the contact: %+v", list)
	}
}

func TestResolveLostFound_missingPersonIsUnpublished(t *testing.T) {
	f := &fakeRepo{listings: []domain.Listing{{ID: "lf-2", Slug: "missing-ama", Type: domain.TypeLostFound, Status: domain.StatusApproved, OwnerID: "m-7",
		Details: map[string]any{"kind": "missing_person", "lfStatus": "open"}}}}
	svc := newTestService(f)
	if err := svc.ResolveLostFound(context.Background(), "lf-2", &domain.Member{ID: "m-7"}, "reunited"); err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if f.listings[0].Status != domain.StatusUnpublished || f.listings[0].Details["lfStatus"] != "reunited" {
		t.Fatalf("a found person's notice must leave public view: %+v", f.listings[0])
	}
}

func TestContactLostFoundPoster(t *testing.T) {
	f := &fakeRepo{listings: []domain.Listing{{ID: "lf-1", Slug: "lost-keys", Type: domain.TypeLostFound, Status: domain.StatusApproved, OwnerID: "m-7", Title: "Lost keys",
		Details: map[string]any{"kind": "lost_item", "lfStatus": "open", "contact": "024 000 0000"}}}}
	notifs, blocks := &lfNotifs{}, &fakeBlockRepo{}
	svc := lostFoundSvcWith(f, notifs, blocks)
	ctx := context.Background()
	finder := &domain.Member{ID: "m-9", Slug: "kojo", DisplayName: "Kojo"}

	if err := svc.ContactLostFoundPoster(ctx, finder, "lost-keys", "I found your keys, call me on 0555 000 111"); err != nil {
		t.Fatalf("relay: %v", err)
	}
	if len(notifs.inserted) != 1 || notifs.inserted[0].MemberID != "m-7" || !strings.Contains(notifs.inserted[0].Body, "I found your keys") {
		t.Fatalf("poster did not get the message: %+v", notifs.inserted)
	}
	if err := svc.ContactLostFoundPoster(ctx, &domain.Member{ID: "m-7"}, "lost-keys", "hello"); err == nil {
		t.Error("posters can't message themselves")
	}
	_ = blocks.Block(ctx, "m-7", "m-9", "")
	var fb *domain.ForbiddenError
	if err := svc.ContactLostFoundPoster(ctx, finder, "lost-keys", "hello again"); !isForbidden(err, &fb) {
		t.Errorf("a blocked member must not reach the poster, got %v", err)
	}
	if err := svc.ContactLostFoundPoster(ctx, nil, "lost-keys", "hello"); !isForbidden(err, &fb) {
		t.Errorf("signed-out callers must be refused, got %v", err)
	}
}

// G087 / R12: a missing child needs a guardian's attestation; attested
// missing-person notices auto-publish (D3), with or without a photo, and
// curators are alerted to review them.
func TestSubmitLostFound_missingPersonSafeguards(t *testing.T) {
	syncIncidentFanOut(t)
	verified := &domain.Member{ID: "m-9", PhoneVerified: true}
	notifs := &lfNotifs{}
	svc := lostFoundSvcWith(&fakeRepo{}, notifs, &fakeBlockRepo{}, domain.Member{ID: "m-c", Role: domain.RoleCurator})
	base := LostFoundInput{Title: "Missing: Kwesi", Kind: "missing_person", Description: "Last seen in a blue shirt.", Contact: "024 000 0000"}

	child := base
	child.SubjectIsMinor = true
	if _, err := svc.SubmitLostFound(context.Background(), verified, child); err == nil {
		t.Fatal("a missing child without a guardian's attestation must be refused")
	}
	child.GuardianAttestation, child.GuardianRelation = true, "Mother"
	l, err := svc.SubmitLostFound(context.Background(), verified, child)
	if err != nil || l.Held || l.Status != domain.StatusApproved || l.Details["guardianRelation"] != "Mother" {
		t.Fatalf("attested missing child: %+v (%v), want published with the relation", l, err)
	}

	photo := base
	photo.CoverImageURL = "/uploads/kwesi.jpg"
	if l, err := svc.SubmitLostFound(context.Background(), &domain.Member{ID: "m-new"}, photo); err != nil || l.Held {
		t.Fatalf("a missing person with a photo publishes at once: %+v (%v)", l, err)
	}
	if noticesTo(notifs, "m-c") != 2 {
		t.Fatalf("curators must be alerted to each missing person: %+v", notifs.inserted)
	}
}

// R13: the poster (and safety staff) can open and close a held notice; nobody
// else can see it, and closing it takes it out of the review queue for good.
func TestHeldNotice_ownerCanOpenAndResolve(t *testing.T) {
	f := &fakeRepo{listings: []domain.Listing{{ID: "lf-9", Slug: "missing-esi", Type: domain.TypeLostFound, Status: domain.StatusPending, Held: true, OwnerID: "m-7",
		Details: map[string]any{"kind": "lost_item", "lfStatus": "open", "contact": "024 000 0000"}}}}
	svc := newTestService(f)
	ctx := context.Background()
	for _, viewer := range []*domain.Member{nil, {ID: "m-x"}} {
		if _, err := svc.LostFoundBySlug(ctx, viewer, "missing-esi"); err == nil {
			t.Fatalf("%v must not see a held notice", viewer)
		}
	}
	for _, viewer := range []*domain.Member{{ID: "m-7"}, {ID: "m-c", Role: domain.RoleCurator}} {
		l, err := svc.LostFoundBySlug(ctx, viewer, "missing-esi")
		if err != nil || !l.Held || l.Details["contact"] == nil {
			t.Fatalf("%s must see the held notice whole: %+v (%v)", viewer.ID, l, err)
		}
	}
	if err := svc.ResolveLostFound(ctx, "lf-9", &domain.Member{ID: "m-7"}, domain.LostFoundStatusReunited); err != nil {
		t.Fatalf("owner resolve: %v", err)
	}
	if f.listings[0].Status != domain.StatusUnpublished || f.listings[0].Details["lfStatus"] != domain.LostFoundStatusReunited {
		t.Fatalf("a resolved held notice must leave the review queue: %+v", f.listings[0])
	}
}

// R13: a reporter can open their own held incident report; the public cannot.
func TestHeldIncident_visibleToReporterOnly(t *testing.T) {
	f := &fakeRepo{listings: []domain.Listing{{ID: "inc-9", Slug: "robbery", Type: domain.TypeIncident, Status: domain.StatusPending, Held: true, OwnerID: "m-7",
		Details: map[string]any{"category": "crime", "contact": "024 000 0000"}}}}
	svc := newTestService(f)
	ctx := context.Background()
	if _, err := svc.Incident(ctx, &domain.Member{ID: "m-x"}, "robbery"); err == nil {
		t.Fatal("another member must not see a held report")
	}
	if l, err := svc.Incident(ctx, &domain.Member{ID: "m-7"}, "robbery"); err != nil || l.OwnerID != "m-7" {
		t.Fatalf("the reporter must see their held report: %+v (%v)", l, err)
	}
}
