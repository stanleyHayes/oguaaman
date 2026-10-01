package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// memberDir is a stateful MemberRepository for the member-privacy tests: it
// serves a fixed directory by id/slug and records profile writes.
type memberDir struct {
	stubMembers
	ms        []domain.Member
	links     []domain.SocialLink
	birthday  string
	broadcast bool
}

func (d *memberDir) All(context.Context) ([]domain.Member, error) { return d.ms, nil }
func (d *memberDir) ByID(_ context.Context, id string) (*domain.Member, error) {
	for i := range d.ms {
		if d.ms[i].ID == id {
			m := d.ms[i]
			return &m, nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "member"}
}
func (d *memberDir) BySlug(_ context.Context, slug string) (*domain.Member, error) {
	for i := range d.ms {
		if d.ms[i].Slug == slug {
			m := d.ms[i]
			return &m, nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "member"}
}
func (d *memberDir) SetLinks(_ context.Context, _ string, links []domain.SocialLink) error {
	d.links = links
	return nil
}
func (d *memberDir) SetBirthday(_ context.Context, _ string, birthday string, broadcast bool) error {
	d.birthday, d.broadcast = birthday, broadcast
	return nil
}

// memFollows is a stateful member-follow graph (follower → followed).
type memFollows struct {
	stubFollows
	edges map[[2]string]bool
}

func (f *memFollows) FollowMember(_ context.Context, follower, member string) error {
	if f.edges == nil {
		f.edges = map[[2]string]bool{}
	}
	f.edges[[2]string{follower, member}] = true
	return nil
}
func (f *memFollows) UnfollowMember(_ context.Context, follower, member string) error {
	delete(f.edges, [2]string{follower, member})
	return nil
}
func (f *memFollows) IsFollowingMember(_ context.Context, follower, member string) (bool, error) {
	return f.edges[[2]string{follower, member}], nil
}
func (f *memFollows) MemberFollowers(_ context.Context, member string) ([]string, error) {
	out := []string{}
	for e := range f.edges {
		if e[1] == member {
			out = append(out, e[0])
		}
	}
	return out, nil
}

func privacySvc(dir *memberDir, follows *memFollows, blocks *fakeBlockRepo, listings *fakeRepo) *Service {
	if listings == nil {
		listings = &fakeRepo{}
	}
	return New(Deps{
		Listings: listings, Members: dir, Orgs: stubOrgs{}, Places: stubPlaces{}, Mod: modRepo{listings},
		Notifs: stubNotifs{}, Follows: follows, Blocks: blocks, Claims: stubClaims{}, News: stubNews{},
		Reports: stubReports{}, Timeline: stubTimeline{},
	})
}

// K5 / F021 / F103 / F107 / F088: the public projection must never carry the
// private or account-state fields, and the birthday only as an opted-in MM-DD.
func TestPublicMemberOfHidesPrivateFields(t *testing.T) {
	m := domain.Member{
		ID: "m1", Slug: "ama", DisplayName: "Ama Mensah", Role: domain.RoleSteward,
		Birthday: "1990-04-12", BroadcastBirthday: false, MFAEnabled: false, Suspended: false,
		CreatorPlan: "creator-pro", CreatorSubscribedUntil: "2030-01-01T00:00:00Z", CampaignerVetted: true,
		PhoneVerified: true, Email: "ama@example.com", Phone: "+233200000000", DateOfBirth: "1990-04-12",
		CreatorPlanIntent: "creator-pro",
	}
	raw, err := json.Marshal(PublicMemberOf(&m))
	if err != nil {
		t.Fatal(err)
	}
	body := string(raw)
	for _, forbidden := range []string{
		"birthday", "1990", "mfaEnabled", "suspended", "creatorPlan", "creatorSubscribedUntil",
		"campaignerVetted", "phoneVerified", "broadcastBirthday", "email", "phone", "dateOfBirth",
		"ama@example.com", "+233200000000",
	} {
		if strings.Contains(body, forbidden) {
			t.Errorf("public member JSON leaks %q: %s", forbidden, body)
		}
	}

	m.BroadcastBirthday = true
	if got := PublicMemberOf(&m).Birthday; got != "04-12" {
		t.Errorf("broadcast birthday = %q, want the month-day only (04-12)", got)
	}
}

func TestPublicMembersSkipSuspendedAndDiasporaIsPublic(t *testing.T) {
	abroad := &domain.Diaspora{Abroad: true, City: "London"}
	dir := &memberDir{ms: []domain.Member{
		{ID: "m1", Slug: "a", DisplayName: "Active", Diaspora: abroad, Birthday: "1980-01-02"},
		{ID: "m2", Slug: "former-x", DisplayName: "Former member", Suspended: true, Diaspora: abroad},
	}}
	svc := privacySvc(dir, &memFollows{}, &fakeBlockRepo{}, nil)
	list, err := svc.PublicMembers(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].ID != "m1" {
		t.Fatalf("public directory = %+v, want only the active member", list)
	}
	if list[0].Birthday != "" {
		t.Errorf("unbroadcast birthday leaked into the directory: %q", list[0].Birthday)
	}
	wall, err := svc.DiasporaMembers(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(wall) != 1 || wall[0].Diaspora == nil || wall[0].Diaspora.City != "London" {
		t.Fatalf("diaspora wall = %+v, want the one active abroad member with their city", wall)
	}
}

// F108: drafts, pending, rejected and taken-down listings are visible only to
// the owner and staff.
func TestProfileListingsDependOnViewer(t *testing.T) {
	owner := &domain.Member{ID: "m-owner", Role: domain.RoleMember}
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "l1", OwnerID: "m-owner", Status: domain.StatusApproved},
		{ID: "l2", OwnerID: "m-owner", Status: domain.StatusDraft},
		{ID: "l3", OwnerID: "m-owner", Status: domain.StatusRejected, RejectionReason: "suspected scam"},
		{ID: "l4", OwnerID: "m-owner", Status: domain.StatusUnpublished},
		{ID: "l5", OwnerID: "m-other", Status: domain.StatusApproved},
	}}
	svc := privacySvc(&memberDir{}, &memFollows{}, &fakeBlockRepo{}, listings)
	cases := []struct {
		name   string
		viewer *domain.Member
		want   int
	}{
		{"anonymous", nil, 1},
		{"another member", &domain.Member{ID: "m-x", Role: domain.RoleMember}, 1},
		{"editor is not moderation staff", &domain.Member{ID: "m-e", Role: domain.RoleEditor}, 1},
		{"owner", owner, 4},
		{"curator", &domain.Member{ID: "m-c", Role: domain.RoleCurator}, 4},
		{"moderator", &domain.Member{ID: "m-mod", Role: domain.RoleModerator}, 4},
		{"steward", &domain.Member{ID: "m-s", Role: domain.RoleSteward}, 4},
	}
	for _, tc := range cases {
		got, err := svc.ProfileListings(context.Background(), owner, tc.viewer)
		if err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}
		if len(got) != tc.want {
			t.Errorf("%s sees %d listings, want %d", tc.name, len(got), tc.want)
		}
		for _, l := range got {
			if tc.want == 1 && l.Status != domain.StatusApproved {
				t.Errorf("%s sees a %s listing", tc.name, l.Status)
			}
		}
	}
}

// F034 / F116: the block state says which side the viewer is on.
func TestBlockStatusIsDirectional(t *testing.T) {
	dir := &memberDir{ms: []domain.Member{{ID: "ama", Slug: "ama"}, {ID: "kofi", Slug: "kofi"}}}
	blocks := &fakeBlockRepo{}
	svc := privacySvc(dir, &memFollows{}, blocks, nil)
	ctx := context.Background()
	if err := svc.BlockMember(ctx, "ama", "kofi", ""); err != nil {
		t.Fatal(err)
	}
	amaView, err := svc.BlockStatusWith(ctx, "ama", "kofi")
	if err != nil {
		t.Fatal(err)
	}
	if !amaView.BlockedByMe || amaView.BlockedMe {
		t.Errorf("blocker's view = %+v, want blockedByMe only", amaView)
	}
	kofiView, err := svc.BlockStatusWith(ctx, "kofi", "ama")
	if err != nil {
		t.Fatal(err)
	}
	if kofiView.BlockedByMe || !kofiView.BlockedMe || !kofiView.Blocked() {
		t.Errorf("blocked member's view = %+v, want blockedMe only", kofiView)
	}
	// Kofi "unblocking" removes nothing: Ama's block stands.
	if err := svc.UnblockMember(ctx, "kofi", "ama"); err != nil {
		t.Fatal(err)
	}
	if st, _ := svc.BlockStatusWith(ctx, "kofi", "ama"); !st.BlockedMe {
		t.Error("the blocked member lifted a block they did not make")
	}
}

// F033: a block in either direction forbids a new follow.
func TestFollowRefusedAcrossABlock(t *testing.T) {
	dir := &memberDir{ms: []domain.Member{{ID: "ama", Slug: "ama"}, {ID: "kofi", Slug: "kofi"}}}
	follows := &memFollows{}
	blocks := &fakeBlockRepo{}
	svc := privacySvc(dir, follows, blocks, nil)
	ctx := context.Background()
	_ = blocks.Block(ctx, "ama", "kofi", "")

	for _, pair := range [][2]string{{"kofi", "ama"}, {"ama", "kofi"}} {
		_, err := svc.FollowMember(ctx, pair[0], pair[1])
		var fb *domain.ForbiddenError
		if !errors.As(err, &fb) {
			t.Errorf("%s following %s across a block: err = %v, want Forbidden", pair[0], pair[1], err)
		}
		if ok, _ := follows.IsFollowingMember(ctx, pair[0], pair[1]); ok {
			t.Errorf("%s now follows %s despite the block", pair[0], pair[1])
		}
	}
	// With no block the follow goes through.
	_ = blocks.Unblock(ctx, "ama", "kofi")
	if n, err := svc.FollowMember(ctx, "kofi", "ama"); err != nil || n != 1 {
		t.Fatalf("follow after unblock: n=%d err=%v", n, err)
	}
}

// F035: suggestions skip members on either side of a block and members the
// viewer already follows, and carry only the public projection.
func TestRecommendationsSkipBlockedAndFollowed(t *testing.T) {
	school := []domain.SchoolStint{{SchoolID: "adisadel", FromYear: 2000, ToYear: 2004}}
	dir := &memberDir{ms: []domain.Member{
		{ID: "kofi", Slug: "kofi", DisplayName: "Kofi", Schooling: school},
		{ID: "ama", Slug: "ama", DisplayName: "Ama", Schooling: school, Birthday: "1991-03-14"},
		{ID: "esi", Slug: "esi", DisplayName: "Esi", Schooling: school},
		{ID: "yaw", Slug: "yaw", DisplayName: "Yaw", Schooling: school},
	}}
	follows := &memFollows{}
	blocks := &fakeBlockRepo{}
	svc := privacySvc(dir, follows, blocks, nil)
	ctx := context.Background()
	_ = blocks.Block(ctx, "ama", "kofi", "") // Ama blocked Kofi
	_ = follows.FollowMember(ctx, "kofi", "esi")

	got, err := svc.Recommendations(ctx, "kofi")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Member.ID != "yaw" {
		ids := []string{}
		for _, c := range got {
			ids = append(ids, c.Member.ID)
		}
		t.Fatalf("suggestions = %v, want only yaw (ama blocked kofi, esi already followed)", ids)
	}
	raw, _ := json.Marshal(got)
	if strings.Contains(string(raw), "birthday") {
		t.Errorf("suggestion leaked a birthday: %s", raw)
	}
}

// F041: the response carries the stored links, not the raw request.
func TestSetMemberLinksReturnsWhatWasStored(t *testing.T) {
	dir := &memberDir{}
	svc := privacySvc(dir, &memFollows{}, &fakeBlockRepo{}, nil)
	got, err := svc.SetMemberLinks(context.Background(), "m1", []domain.SocialLink{
		{Label: "Site", URL: "https://example.com"},
		{Label: "Bad", URL: "javascript:alert(1)"},
		{Label: " ", URL: " "},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[1].URL != "" || len(dir.links) != 2 {
		t.Fatalf("stored/returned links = %+v / %+v, want the unsafe URL blanked and the empty row dropped", got, dir.links)
	}
}

// D5: only the month and day of a birthday are stored.
func TestSetMemberBirthdayKeepsMonthDayOnly(t *testing.T) {
	dir := &memberDir{}
	svc := privacySvc(dir, &memFollows{}, &fakeBlockRepo{}, nil)
	ctx := context.Background()
	stored, err := svc.SetMemberBirthday(ctx, "m1", "1990-04-12", true)
	if err != nil || stored != "04-12" || dir.birthday != "04-12" || !dir.broadcast {
		t.Fatalf("stored=%q persisted=%q broadcast=%v err=%v, want 04-12", stored, dir.birthday, dir.broadcast, err)
	}
	if _, err := svc.SetMemberBirthday(ctx, "m1", "", true); err == nil {
		t.Error("broadcasting with no birthday should be refused")
	}
	if _, err := svc.SetMemberBirthday(ctx, "m1", "12th April", false); err == nil {
		t.Error("an unparseable birthday should be refused")
	}
	if stored, err := svc.SetMemberBirthday(ctx, "m1", "", false); err != nil || stored != "" {
		t.Errorf("clearing: stored=%q err=%v", stored, err)
	}
}

// R05: a public profile shows the member's safety posts without their contact
// or member id, and memorials without hidden or removed tributes.
func TestProfileListings_publicProjection(t *testing.T) {
	owner := &domain.Member{ID: "m-owner", Role: domain.RoleMember}
	listings := &fakeRepo{listings: []domain.Listing{
		{ID: "inc-1", Type: domain.TypeIncident, OwnerID: "m-owner", Status: domain.StatusApproved,
			Details: map[string]any{"contact": "0244 123 456", "statusHistory": []any{map[string]any{"status": "reported", "by": "m-owner"}}}},
		{ID: "mem-1", Type: domain.TypeMemorial, OwnerID: "m-owner", Status: domain.StatusApproved, Tributes: []domain.Tribute{
			{ID: "t-ok", Message: "Rest well"}, {ID: "t-hid", Message: "hidden", Status: domain.TributeHidden}, {ID: "t-rm", Message: "removed", Status: domain.TributeRemoved},
		}},
	}}
	svc := privacySvc(&memberDir{}, &memFollows{}, &fakeBlockRepo{}, listings)
	for _, viewer := range []*domain.Member{nil, {ID: "m-x", Role: domain.RoleMember}} {
		got, err := svc.ProfileListings(context.Background(), owner, viewer)
		if err != nil || len(got) != 2 {
			t.Fatalf("profile listings: %+v (%v)", got, err)
		}
		for _, l := range got {
			switch l.Type {
			case domain.TypeIncident:
				if l.OwnerID != "" || l.Details["contact"] != nil {
					t.Fatalf("public profile exposes the reporter: owner %q contact %v", l.OwnerID, l.Details["contact"])
				}
				if h, _ := l.Details["statusHistory"].([]any); len(h) != 1 || h[0].(map[string]any)["by"] != nil {
					t.Fatalf("public history carries actor ids: %+v", l.Details["statusHistory"])
				}
			case domain.TypeMemorial:
				if len(l.Tributes) != 1 || l.Tributes[0].ID != "t-ok" {
					t.Fatalf("public memorial tributes = %+v, want the visible one only", l.Tributes)
				}
			}
		}
	}
	mine, _ := svc.ProfileListings(context.Background(), owner, owner)
	for _, l := range mine {
		if l.Type == domain.TypeIncident && l.Details["contact"] == nil {
			t.Fatal("the reporter still sees their own contact")
		}
	}
}
