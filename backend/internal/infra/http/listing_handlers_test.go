package http

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

type submitListings struct {
	inserted []domain.Listing
}

func (s *submitListings) Find(context.Context, domain.ListingFilter) ([]domain.Listing, error) { return nil, nil }
func (s *submitListings) GetBySlug(context.Context, string, string) (*domain.Listing, error)    { return nil, &domain.NotFoundError{Entity: "listing"} }
func (s *submitListings) GetByID(context.Context, string) (*domain.Listing, error)               { return nil, &domain.NotFoundError{Entity: "listing"} }
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
func (s *submitListings) IncrementCandles(context.Context, string) (int, error)     { return 0, nil }
func (s *submitListings) IncrementRaised(context.Context, string, int64) error      { return nil }
func (s *submitListings) SetFeatured(context.Context, string, bool, string) error   { return nil }
func (s *submitListings) UpdateIncidentStatus(context.Context, string, string, map[string]any) error {
	return nil
}
func (s *submitListings) SetLostFoundStatus(context.Context, string, string) error { return nil }
func (s *submitListings) SetSubscribedUntil(context.Context, string, string) error  { return nil }
func (s *submitListings) RecordView(context.Context, string, string) (bool, error)  { return true, nil }
func (s *submitListings) ViewsThisMonth(context.Context, []string) (int, error)     { return 0, nil }

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
