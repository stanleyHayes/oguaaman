package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// searchMembers / searchOrgs override only All() on the shared stubs so Search
// has real member/institution rows to rank and attach images to.
type searchMembers struct {
	stubMembers
	items []domain.Member
}

func (s searchMembers) All(context.Context) ([]domain.Member, error) { return s.items, nil }

type searchOrgs struct {
	stubOrgs
	items []domain.Organization
}

func (s searchOrgs) All(context.Context) ([]domain.Organization, error) { return s.items, nil }

// recordPhotoMembers captures the SetPhoto arguments so we can assert trimming.
type recordPhotoMembers struct {
	stubMembers
	gotID, gotURL string
	calls         int
}

func (r *recordPhotoMembers) SetPhoto(_ context.Context, id, url string) error {
	r.gotID, r.gotURL = id, url
	r.calls++
	return nil
}

// hitByKind returns the first search hit of a given kind, or a zero value.
func hitByKind(hits []SearchHit, kind string) (SearchHit, bool) {
	for _, h := range hits {
		if h.Kind == kind {
			return h, true
		}
	}
	return SearchHit{}, false
}

func TestSearch_attachesEntityImages(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{listings: []domain.Listing{
		{Type: domain.TypeArtist, Status: domain.StatusApproved, Slug: "ato-kwamena", Title: "Ato Kwamena", CoverImageURL: "https://img/cover.jpg"},
	}}
	members := searchMembers{items: []domain.Member{
		{Slug: "kojo-mensah", DisplayName: "Kojo Mensah", PhotoURL: "https://img/photo.jpg"},
	}}
	orgs := searchOrgs{items: []domain.Organization{
		{Slug: "mfantsipim", Name: "Mfantsipim School", CrestURL: "https://img/crest.jpg"},
	}}
	svc := New(Deps{Listings: f, Members: members, Orgs: orgs, Places: stubPlaces{}, Mod: modRepo{f}, Notifs: stubNotifs{}, Follows: stubFollows{}, Claims: stubClaims{}, News: stubNews{}, Reports: stubReports{}, Timeline: stubTimeline{}})

	// Each query is chosen to match exactly one entity by a distinctive term.
	cases := []struct {
		query, kind, wantImage string
	}{
		{"kwamena", "listing", "https://img/cover.jpg"},
		{"kojo", "member", "https://img/photo.jpg"},
		{"mfantsipim", "institution", "https://img/crest.jpg"},
	}
	for _, c := range cases {
		hits, err := svc.Search(ctx, c.query, 20)
		if err != nil {
			t.Fatalf("Search(%q) error: %v", c.query, err)
		}
		h, ok := hitByKind(hits, c.kind)
		if !ok {
			t.Fatalf("Search(%q) returned no %s hit; got %+v", c.query, c.kind, hits)
		}
		if h.ImageURL != c.wantImage {
			t.Errorf("Search(%q) %s ImageURL = %q, want %q", c.query, c.kind, h.ImageURL, c.wantImage)
		}
	}
}

func TestCreateNews_carriesCoverImage(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{}
	svc := newTestService(f)

	a, err := svc.CreateNews(ctx, "m-ed", "Editor", NewsInput{
		Title:         "Fetu Afahye returns",
		Body:          "The durbar of chiefs climaxes the festival.",
		CoverImageURL: "  https://img/news-cover.jpg  ",
	})
	if err != nil {
		t.Fatalf("CreateNews failed: %v", err)
	}
	if a.CoverImageURL != "https://img/news-cover.jpg" {
		t.Errorf("CoverImageURL = %q, want the trimmed URL", a.CoverImageURL)
	}
}

func TestSetMemberPhoto_trimsAndPersists(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{}
	rec := &recordPhotoMembers{}
	svc := New(Deps{Listings: f, Members: rec, Orgs: stubOrgs{}, Places: stubPlaces{}, Mod: modRepo{f}, Notifs: stubNotifs{}, Follows: stubFollows{}, Claims: stubClaims{}, News: stubNews{}, Reports: stubReports{}, Timeline: stubTimeline{}})

	if err := svc.SetMemberPhoto(ctx, "m-1", "  https://img/p.jpg  "); err != nil {
		t.Fatalf("SetMemberPhoto failed: %v", err)
	}
	if rec.calls != 1 {
		t.Fatalf("SetPhoto called %d times, want 1", rec.calls)
	}
	if rec.gotID != "m-1" {
		t.Errorf("member id = %q, want m-1", rec.gotID)
	}
	if rec.gotURL != "https://img/p.jpg" {
		t.Errorf("photo url = %q, want the trimmed URL", rec.gotURL)
	}
}
