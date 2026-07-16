package service

import (
	"context"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// fakeRepo implements every repository interface with in-memory slices, so the
// engine can be tested without MongoDB.
type fakeRepo struct {
	listings []domain.Listing
	mods     []domain.ModerationRecord
}

func (f *fakeRepo) Find(_ context.Context, q domain.ListingFilter) ([]domain.Listing, error) {
	out := []domain.Listing{}
	for _, l := range f.listings {
		if q.Type != "" && l.Type != q.Type {
			continue
		}
		if q.Status != "" && l.Status != q.Status {
			continue
		}
		if q.Slug != "" && l.Slug != q.Slug {
			continue
		}
		if q.OwnerID != "" && l.OwnerID != q.OwnerID {
			continue
		}
		out = append(out, l)
	}
	return out, nil
}
func (f *fakeRepo) GetBySlug(_ context.Context, typ, slug string) (*domain.Listing, error) {
	for i := range f.listings {
		if f.listings[i].Type == typ && f.listings[i].Slug == slug {
			return &f.listings[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "listing"}
}
func (f *fakeRepo) Insert(_ context.Context, l domain.Listing) error {
	f.listings = append(f.listings, l)
	return nil
}
func (f *fakeRepo) GetByID(_ context.Context, id string) (*domain.Listing, error) {
	for i := range f.listings {
		if f.listings[i].ID == id {
			return &f.listings[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "listing"}
}
func (f *fakeRepo) UpdateStatus(_ context.Context, id, status, _, _, _ string) error {
	for i := range f.listings {
		if f.listings[i].ID == id {
			f.listings[i].Status = status
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "listing"}
}
func (f *fakeRepo) OwnerUpdate(_ context.Context, id, title, coverImageURL string, details map[string]any, status, submittedAt string) error {
	for i := range f.listings {
		if f.listings[i].ID == id {
			f.listings[i].Title = title
			f.listings[i].CoverImageURL = coverImageURL
			f.listings[i].Details = details
			f.listings[i].Status = status
			if submittedAt != "" {
				f.listings[i].SubmittedAt = submittedAt
			}
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "listing"}
}
func (f *fakeRepo) AddTribute(_ context.Context, id string, t domain.Tribute) error { return nil }
func (f *fakeRepo) IncrementCandles(_ context.Context, id string) (int, error)      { return 1, nil }
func (f *fakeRepo) IncrementRaised(_ context.Context, id string, delta int64) error {
	for i := range f.listings {
		if f.listings[i].ID == id {
			if f.listings[i].Details == nil {
				f.listings[i].Details = map[string]any{}
			}
			cur, _ := f.listings[i].Details["raisedPesewas"].(int64)
			f.listings[i].Details["raisedPesewas"] = cur + delta
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "listing"}
}
func (f *fakeRepo) SetFeatured(_ context.Context, id string, featured bool, until string) error {
	for i := range f.listings {
		if f.listings[i].ID == id {
			f.listings[i].Featured = featured
			f.listings[i].FeaturedUntil = until
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "listing"}
}
func (f *fakeRepo) UpdateIncidentStatus(_ context.Context, id, status string, entry map[string]any) error {
	for i := range f.listings {
		if f.listings[i].ID == id {
			if f.listings[i].Details == nil {
				f.listings[i].Details = map[string]any{}
			}
			f.listings[i].Details["incidentStatus"] = status
			hist, _ := f.listings[i].Details["statusHistory"].([]map[string]any)
			f.listings[i].Details["statusHistory"] = append(hist, entry)
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "listing"}
}

func (f *fakeRepo) SetLostFoundStatus(_ context.Context, id, status string) error {
	for i := range f.listings {
		if f.listings[i].ID == id {
			if f.listings[i].Details == nil {
				f.listings[i].Details = map[string]any{}
			}
			f.listings[i].Details["lfStatus"] = status
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "listing"}
}

func (f *fakeRepo) SetSubscribedUntil(_ context.Context, id, until string) error {
	for i := range f.listings {
		if f.listings[i].ID == id {
			if f.listings[i].Details == nil {
				f.listings[i].Details = map[string]any{}
			}
			f.listings[i].Details["subscribedUntil"] = until
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "listing"}
}

// repository interfaces the service needs but these tests don't exercise.
func (f *fakeRepo) All(context.Context) ([]domain.Member, error)           { return nil, nil }
func (f *fakeRepo) ByID(context.Context, string) (*domain.Member, error)   { return nil, nil }
func (f *fakeRepo) BySlug(context.Context, string) (*domain.Member, error) { return nil, nil }

func (f *fakeRepo) Insert2(_ context.Context, r domain.ModerationRecord) error {
	f.mods = append(f.mods, r)
	return nil
}

// modRepo wraps fakeRepo to satisfy ModerationRepository distinctly.
type modRepo struct{ f *fakeRepo }

func (m modRepo) Insert(_ context.Context, r domain.ModerationRecord) error {
	m.f.mods = append(m.f.mods, r)
	return nil
}
func (m modRepo) All(_ context.Context) ([]domain.ModerationRecord, error) { return m.f.mods, nil }

func newTestService(f *fakeRepo) *Service {
	// members/orgs/places aren't used by the tested methods; pass nil-safe stubs.
	return New(Deps{Listings: f, Members: stubMembers{}, Orgs: stubOrgs{}, Places: stubPlaces{}, Mod: modRepo{f}, Notifs: stubNotifs{}, Follows: stubFollows{}, Claims: stubClaims{}, News: stubNews{}, Reports: stubReports{}, Timeline: stubTimeline{}})
}

type stubReports struct{}

type stubTimeline struct{}

func (stubTimeline) All(context.Context) ([]domain.TimelineEntry, error)      { return nil, nil }
func (stubTimeline) InsertMany(context.Context, []domain.TimelineEntry) error { return nil }

func (stubReports) Insert(context.Context, domain.Report) error         { return nil }
func (stubReports) All(context.Context) ([]domain.Report, error)        { return nil, nil }
func (stubReports) Get(context.Context, string) (*domain.Report, error) { return nil, nil }
func (stubReports) UpdateStatus(context.Context, string, string, string, string, string) error {
	return nil
}
func (stubReports) OpenCount(context.Context) (int, error) { return 0, nil }

type stubNews struct{}

func (stubNews) Insert(context.Context, domain.NewsArticle) error            { return nil }
func (stubNews) Update(context.Context, domain.NewsArticle) error            { return nil }
func (stubNews) Get(context.Context, string) (*domain.NewsArticle, error)    { return nil, nil }
func (stubNews) BySlug(context.Context, string) (*domain.NewsArticle, error) { return nil, nil }
func (stubNews) All(context.Context) ([]domain.NewsArticle, error)           { return nil, nil }
func (stubNews) Published(context.Context) ([]domain.NewsArticle, error)     { return nil, nil }
func (stubNews) SetPublished(context.Context, string, string, string) error  { return nil }
func (stubNews) Delete(context.Context, string) error                        { return nil }

type stubNotifs struct{}

func (stubNotifs) Insert(context.Context, domain.Notification) error               { return nil }
func (stubNotifs) ByMember(context.Context, string) ([]domain.Notification, error) { return nil, nil }
func (stubNotifs) MarkRead(context.Context, string, string) error                  { return nil }
func (stubNotifs) MarkAllRead(context.Context, string) error                       { return nil }
func (stubNotifs) UnreadCount(context.Context, string) (int, error)                { return 0, nil }

type stubFollows struct{}

func (stubFollows) Add(context.Context, string, string) error                 { return nil }
func (stubFollows) Remove(context.Context, string, string) error              { return nil }
func (stubFollows) IsFollowing(context.Context, string, string) (bool, error) { return false, nil }
func (stubFollows) Followers(context.Context, string) ([]string, error)       { return nil, nil }
func (stubFollows) FollowMember(context.Context, string, string) error        { return nil }
func (stubFollows) UnfollowMember(context.Context, string, string) error      { return nil }
func (stubFollows) IsFollowingMember(context.Context, string, string) (bool, error) {
	return false, nil
}
func (stubFollows) MemberFollowers(context.Context, string) ([]string, error) { return nil, nil }

type stubMembers struct{}

func (stubMembers) All(context.Context) ([]domain.Member, error)                     { return nil, nil }
func (stubMembers) ByID(context.Context, string) (*domain.Member, error)             { return nil, nil }
func (stubMembers) BySlug(context.Context, string) (*domain.Member, error)           { return nil, nil }
func (stubMembers) ByIdentifier(context.Context, string) (*domain.Member, error)     { return nil, nil }
func (stubMembers) Insert(context.Context, domain.Member) error                      { return nil }
func (stubMembers) SetPhoneVerified(context.Context, string, bool) error             { return nil }
func (stubMembers) SetPhoneVerification(context.Context, string, string, string) error {
	return nil
}
func (stubMembers) UpdateRole(context.Context, string, string) error                 { return nil }
func (stubMembers) SetSuspended(context.Context, string, bool) error                 { return nil }
func (stubMembers) SetBirthday(context.Context, string, string, bool) error          { return nil }
func (stubMembers) SetAffiliations(context.Context, string, string, string) error    { return nil }
func (stubMembers) SetSchooling(context.Context, string, []domain.SchoolStint) error { return nil }
func (stubMembers) SetDiaspora(context.Context, string, *domain.Diaspora) error      { return nil }
func (stubMembers) SetPhoto(context.Context, string, string) error                   { return nil }
func (stubMembers) SetProfile(context.Context, string, string, string, string) error { return nil }
func (stubMembers) SetPasswordHash(context.Context, string, string) error            { return nil }
func (stubMembers) SetDateOfBirth(context.Context, string, string) error             { return nil }
func (stubMembers) SetCreatorTypes(context.Context, string, []string) error          { return nil }
func (stubMembers) SetMFA(context.Context, string, bool, string, []string) error     { return nil }
func (stubMembers) Anonymize(context.Context, string) error                          { return nil }

type stubOrgs struct{}

func (stubOrgs) All(context.Context) ([]domain.Organization, error)                  { return nil, nil }
func (stubOrgs) ByKind(context.Context, string) ([]domain.Organization, error)       { return nil, nil }
func (stubOrgs) BySlug(context.Context, string) (*domain.Organization, error)        { return nil, nil }
func (stubOrgs) ByID(context.Context, string) (*domain.Organization, error)          { return nil, nil }
func (stubOrgs) Create(context.Context, domain.Organization) error                   { return nil }
func (stubOrgs) SetVerified(context.Context, string, bool, string) error             { return nil }
func (stubOrgs) UpdateProfile(context.Context, string, domain.OrgProfilePatch) error { return nil }
func (stubOrgs) SetOffices(context.Context, string, []domain.Office) error           { return nil }
func (stubOrgs) SetGallery(context.Context, string, []domain.MediaAsset) error       { return nil }
func (stubOrgs) SetSections(context.Context, string, []domain.ProfileSection) error  { return nil }

type stubClaims struct{}

func (stubClaims) Insert(context.Context, domain.OrgClaim) error                      { return nil }
func (stubClaims) Get(context.Context, string) (*domain.OrgClaim, error)              { return nil, nil }
func (stubClaims) Pending(context.Context) ([]domain.OrgClaim, error)                 { return nil, nil }
func (stubClaims) ByMember(context.Context, string) ([]domain.OrgClaim, error)        { return nil, nil }
func (stubClaims) UpdateStatus(context.Context, string, string, string, string) error { return nil }
func (stubClaims) IsManager(context.Context, string, string) (bool, error)            { return false, nil }
func (stubClaims) ManagedOrgIDs(context.Context, string) ([]string, error)            { return nil, nil }
func (stubClaims) HasActiveClaim(context.Context, string, string) (bool, error)       { return false, nil }

type stubPlaces struct{}

func (stubPlaces) All(context.Context) ([]domain.Place, error)         { return nil, nil }
func (stubPlaces) ByID(context.Context, string) (*domain.Place, error) { return nil, nil }

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Madam Adwoa Mensah":   "madam-adwoa-mensah",
		"  The Oguaa Sound!  ": "the-oguaa-sound",
		"C.K. Mann":            "c-k-mann",
	}
	for in, want := range cases {
		if got := slugify(in); got != want {
			t.Errorf("slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestAsStringSlice_handlesNamedSliceTypes(t *testing.T) {
	type bsonA []any // mimics the driver's bson.A named type
	got := asStringSlice(bsonA{"Highlife", "Gospel", 7})
	if len(got) != 2 || got[0] != "Highlife" || got[1] != "Gospel" {
		t.Fatalf("asStringSlice = %v, want [Highlife Gospel]", got)
	}
	if asStringSlice([]string{"x"})[0] != "x" {
		t.Fatal("asStringSlice should pass through []string")
	}
	if asStringSlice("nope") != nil {
		t.Fatal("asStringSlice of non-slice should be nil")
	}
}

func TestSubmit_validatesAndDefaults(t *testing.T) {
	ctx := context.Background()
	svc := newTestService(&fakeRepo{})

	if _, err := svc.Submit(ctx, SubmitInput{Type: "spaceship", Title: "x"}); err == nil {
		t.Error("expected error for invalid type")
	}
	if _, err := svc.Submit(ctx, SubmitInput{Type: domain.TypeMemory, Title: "a"}); err == nil {
		t.Error("expected error for too-short title")
	}
	if _, err := svc.Submit(ctx, SubmitInput{Type: domain.TypeMemory, Title: "No owner here"}); err == nil {
		t.Error("expected error when owner is empty (no signed-in member — no silent demo identity)")
	}
	l, err := svc.Submit(ctx, SubmitInput{Type: domain.TypeMemory, Title: "A real memory", OwnerID: "m-test"})
	if err != nil {
		t.Fatalf("valid submit failed: %v", err)
	}
	if l.Status != domain.StatusPending {
		t.Errorf("new listing status = %q, want pending", l.Status)
	}
	if !strings.HasPrefix(l.Slug, "a-real-memory-") {
		t.Errorf("slug = %q, want prefix \"a-real-memory-\"", l.Slug)
	}
	if l.OwnerID != "m-test" {
		t.Errorf("owner = %q, want the supplied member id", l.OwnerID)
	}
}

func TestModerate_requiresReasonToReject(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{listings: []domain.Listing{{ID: "x1", Type: domain.TypeArtist, Status: domain.StatusPending}}}
	svc := newTestService(f)

	if err := svc.Moderate(ctx, "x1", "reject", "", "m-mod"); err == nil {
		t.Error("reject without reason should fail")
	}
	if err := svc.Moderate(ctx, "x1", "approve", "", ""); err == nil {
		t.Error("moderation without a moderator identity should fail")
	}
	if err := svc.Moderate(ctx, "x1", "approve", "", "m-mod"); err != nil {
		t.Fatalf("approve failed: %v", err)
	}
	if f.listings[0].Status != domain.StatusApproved {
		t.Errorf("status = %q, want approved", f.listings[0].Status)
	}
	if len(f.mods) != 1 {
		t.Errorf("expected an audit record, got %d", len(f.mods))
	}
}

func TestGenres_dedupesAndSorts(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{listings: []domain.Listing{
		{Type: domain.TypeArtist, Status: domain.StatusApproved, Details: map[string]any{"genres": []string{"Highlife"}}},
		{Type: domain.TypeArtist, Status: domain.StatusApproved, Details: map[string]any{"genres": []any{"Highlife", "Gospel"}}},
	}}
	svc := newTestService(f)
	got, err := svc.Genres(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0] != "Gospel" || got[1] != "Highlife" {
		t.Errorf("genres = %v, want [Gospel Highlife]", got)
	}
}
