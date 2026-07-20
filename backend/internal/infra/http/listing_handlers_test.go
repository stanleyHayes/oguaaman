package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

type submitListings struct {
	inserted []domain.Listing
}

func (s *submitListings) Find(_ context.Context, filter domain.ListingFilter) ([]domain.Listing, error) {
	out := []domain.Listing{}
	for _, listing := range s.inserted {
		if filter.Type != "" && listing.Type != filter.Type {
			continue
		}
		if filter.Status != "" && listing.Status != filter.Status {
			continue
		}
		out = append(out, listing)
	}
	return out, nil
}
func (s *submitListings) GetBySlug(_ context.Context, typ, slug string) (*domain.Listing, error) {
	for i := range s.inserted {
		if s.inserted[i].Type == typ && s.inserted[i].Slug == slug {
			return &s.inserted[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "listing"}
}
func (s *submitListings) GetByID(context.Context, string) (*domain.Listing, error) {
	return nil, &domain.NotFoundError{Entity: "listing"}
}
func (s *submitListings) Insert(_ context.Context, l domain.Listing) error {
	s.inserted = append(s.inserted, l)
	return nil
}
func (s *submitListings) UpdateStatus(context.Context, string, string, string, string, string) error {
	return nil
}
func (s *submitListings) OwnerUpdate(context.Context, string, string, string, map[string]any, string, string) error {
	return nil
}
func (s *submitListings) AddTribute(context.Context, string, domain.Tribute) error { return nil }
func (s *submitListings) IncrementCandles(context.Context, string) (int, error)    { return 0, nil }
func (s *submitListings) IncrementRaised(context.Context, string, int64) error     { return nil }
func (s *submitListings) SetFeatured(context.Context, string, bool, string) error  { return nil }
func (s *submitListings) UpdateIncidentStatus(context.Context, string, string, map[string]any) error {
	return nil
}
func (s *submitListings) SetLostFoundStatus(context.Context, string, string) error { return nil }
func (s *submitListings) SetSubscribedUntil(context.Context, string, string) error { return nil }
func (s *submitListings) SetStorefront(context.Context, string, string, []domain.ProfileSection, []domain.MediaAsset, []domain.MediaAsset) error {
	return nil
}
func (s *submitListings) GetByHandle(context.Context, string) (*domain.Listing, error) {
	return nil, &domain.NotFoundError{Entity: "listing"}
}
func (s *submitListings) HandleTaken(context.Context, string, string) (bool, error) { return false, nil }
func (s *submitListings) SetKeeperID(context.Context, string, string) error        { return nil }
func (s *submitListings) AvgApprovalHours(context.Context) (float64, error)        { return 0, nil }
func (s *submitListings) RecordView(context.Context, string, string) (bool, error) { return true, nil }
func (s *submitListings) ViewsThisMonth(context.Context, []string) (int, error)    { return 0, nil }
func (s *submitListings) PlatformViewsThisMonth(context.Context) (int, error)      { return 0, nil }

func TestSubmit_requiresVerifiedContact(t *testing.T) {
	listings := &submitListings{}
	svc := service.New(service.Deps{Listings: listings})
	h := NewHandler(HandlerDeps{Svc: svc, AuthRequired: true})

	body := bytes.NewBufferString(`{"type":"artist","title":"A real band"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/listings", body)
	req = req.WithContext(context.WithValue(req.Context(), memberCtxKey, &domain.Member{
		ID: "m-1", PhoneVerified: false,
	}))
	w := httptest.NewRecorder()

	h.Submit(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusForbidden)
	}
	if got := w.Body.String(); got == "" || !bytes.Contains(w.Body.Bytes(), []byte("Verify your phone or contact before you submit.")) {
		t.Fatalf("body = %q, want verification message", got)
	}
	if len(listings.inserted) != 0 {
		t.Fatalf("listing should not have been inserted, got %d inserts", len(listings.inserted))
	}
}

func TestSubmit_allowsVerifiedContact(t *testing.T) {
	listings := &submitListings{}
	svc := service.New(service.Deps{Listings: listings})
	h := NewHandler(HandlerDeps{Svc: svc, AuthRequired: true})

	body := bytes.NewBufferString(`{"type":"artist","title":"A real band"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/listings", body)
	req = req.WithContext(context.WithValue(req.Context(), memberCtxKey, &domain.Member{
		ID: "m-1", PhoneVerified: true,
	}))
	w := httptest.NewRecorder()

	h.Submit(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusCreated)
	}
	if len(listings.inserted) != 1 {
		t.Fatalf("listing should have been inserted once, got %d", len(listings.inserted))
	}
}

func TestPropertiesListAndDetailExposeApprovedPropertyData(t *testing.T) {
	listings := &submitListings{inserted: []domain.Listing{
		{ID: "p1", Slug: "pedu-flat", Type: domain.TypeProperty, Status: domain.StatusApproved, Title: "Pedu Flat", Details: map[string]any{"pricePesewas": int64(180000)}},
		{ID: "p2", Slug: "hidden-flat", Type: domain.TypeProperty, Status: domain.StatusPending, Title: "Hidden Flat"},
	}}
	h := NewHandler(HandlerDeps{Svc: service.New(service.Deps{Listings: listings})})

	listRequest := httptest.NewRequest(http.MethodGet, "/api/properties", nil)
	listResponse := httptest.NewRecorder()
	h.Properties(listResponse, listRequest)
	if listResponse.Code != http.StatusOK {
		t.Fatalf("list status = %d, want 200", listResponse.Code)
	}
	var items []domain.Listing
	if err := json.Unmarshal(listResponse.Body.Bytes(), &items); err != nil {
		t.Fatalf("decode property list: %v", err)
	}
	if len(items) != 1 || items[0].Slug != "pedu-flat" {
		t.Fatalf("approved property list = %+v", items)
	}

	detailRequest := httptest.NewRequest(http.MethodGet, "/api/properties/pedu-flat", nil)
	detailRequest.SetPathValue("slug", "pedu-flat")
	detailResponse := httptest.NewRecorder()
	h.Property(detailResponse, detailRequest)
	if detailResponse.Code != http.StatusOK {
		t.Fatalf("detail status = %d, body=%s", detailResponse.Code, detailResponse.Body.String())
	}
	var item domain.Listing
	if err := json.Unmarshal(detailResponse.Body.Bytes(), &item); err != nil {
		t.Fatalf("decode property detail: %v", err)
	}
	if item.Type != domain.TypeProperty || item.Slug != "pedu-flat" {
		t.Fatalf("property detail = %+v", item)
	}
}
