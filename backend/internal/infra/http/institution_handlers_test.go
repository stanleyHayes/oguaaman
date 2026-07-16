package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// fakeOrgs is a minimal OrganizationRepository; only All is exercised by the
// Institutions handler (the rest satisfy the interface).
type fakeOrgs struct{ list []domain.Organization }

func (f fakeOrgs) All(context.Context) ([]domain.Organization, error)                { return f.list, nil }
func (fakeOrgs) ByKind(context.Context, string) ([]domain.Organization, error)       { return nil, nil }
func (fakeOrgs) BySlug(context.Context, string) (*domain.Organization, error)        { return nil, nil }
func (fakeOrgs) ByID(context.Context, string) (*domain.Organization, error)          { return nil, nil }
func (fakeOrgs) Create(context.Context, domain.Organization) error                   { return nil }
func (fakeOrgs) SetVerified(context.Context, string, bool, string) error             { return nil }
func (fakeOrgs) UpdateProfile(context.Context, string, domain.OrgProfilePatch) error { return nil }
func (fakeOrgs) SetOffices(context.Context, string, []domain.Office) error           { return nil }
func (fakeOrgs) SetGallery(context.Context, string, []domain.MediaAsset) error       { return nil }
func (fakeOrgs) SetSections(context.Context, string, []domain.ProfileSection) error  { return nil }

func TestInstitutionsHandler_kindFilter(t *testing.T) {
	// Public directory fixtures are verified — the service now hides unverified
	// orgs from /api/institutions (revocation takes a page offline, spec §8.13).
	orgs := fakeOrgs{list: []domain.Organization{
		{ID: "1", Slug: "cape-coast-castle", Kind: "heritage", Name: "Cape Coast Castle", Verified: true},
		{ID: "2", Slug: "mfantsipim", Kind: "school", Name: "Mfantsipim School", Verified: true},
		{ID: "3", Slug: "kakum", Kind: "heritage", Name: "Kakum National Park", Verified: true},
	}}
	// Only s.orgs is touched by Institutions; the other repos can be nil.
	svc := service.New(service.Deps{Orgs: orgs})
	h := &Handler{svc: svc}

	decode := func(url string) []domain.Organization {
		req := httptest.NewRequest(http.MethodGet, url, nil)
		w := httptest.NewRecorder()
		h.Institutions(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("GET %s → status %d", url, w.Code)
		}
		var out []domain.Organization
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatalf("GET %s → bad JSON: %v", url, err)
		}
		return out
	}

	// ?kind=heritage returns only the two heritage places.
	heritage := decode("/api/institutions?kind=heritage")
	if len(heritage) != 2 {
		t.Fatalf("?kind=heritage → got %d orgs, want 2", len(heritage))
	}
	for _, o := range heritage {
		if o.Kind != "heritage" {
			t.Errorf("?kind=heritage leaked a %q org (%s)", o.Kind, o.Slug)
		}
	}

	// No filter returns every org.
	if all := decode("/api/institutions"); len(all) != 3 {
		t.Errorf("unfiltered → got %d orgs, want 3", len(all))
	}

	// An unmatched kind returns an empty list (not all).
	if none := decode("/api/institutions?kind=nonesuch"); len(none) != 0 {
		t.Errorf("?kind=nonesuch → got %d orgs, want 0", len(none))
	}
}
