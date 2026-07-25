package service

import (
	"context"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

type bookingMemoryRepo struct{ bookings []domain.ArtistBooking }

func (r *bookingMemoryRepo) Create(_ context.Context, booking domain.ArtistBooking) (domain.ArtistBooking, error) {
	r.bookings = append(r.bookings, booking)
	return booking, nil
}
func (r *bookingMemoryRepo) ForArtistOwner(_ context.Context, ownerID string) ([]domain.ArtistBooking, error) {
	out := []domain.ArtistBooking{}
	for _, booking := range r.bookings {
		if booking.ArtistOwnerID == ownerID {
			out = append(out, booking)
		}
	}
	return out, nil
}
func (r *bookingMemoryRepo) ByID(_ context.Context, id string) (domain.ArtistBooking, error) {
	for _, booking := range r.bookings {
		if booking.ID == id {
			return booking, nil
		}
	}
	return domain.ArtistBooking{}, &domain.NotFoundError{Entity: "artist booking"}
}
func (r *bookingMemoryRepo) UpdateStatus(_ context.Context, id, ownerID, status, note, updatedAt string) (domain.ArtistBooking, error) {
	for i := range r.bookings {
		if r.bookings[i].ID == id && r.bookings[i].ArtistOwnerID == ownerID {
			r.bookings[i].Status, r.bookings[i].ArtistNote, r.bookings[i].UpdatedAt = status, note, updatedAt
			return r.bookings[i], nil
		}
	}
	return domain.ArtistBooking{}, &domain.NotFoundError{Entity: "artist booking"}
}

func TestArtistBookingRequestAndOwnerStatus(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{{
		ID: "artist-1", Slug: "adwoa-b", Type: domain.TypeArtist, OwnerID: "artist-owner", Title: "Adwoa B", Status: domain.StatusApproved,
	}}}
	bookings := &bookingMemoryRepo{}
	notifs := &recNotifs{}
	svc := NewArtistBookingService(listings, bookings, notifs)
	requester := &domain.Member{ID: "fan-1", DisplayName: "Ama Fan", Email: "ama@example.com"}

	created, err := svc.Request(context.Background(), requester, "adwoa-b", ArtistBookingInput{
		EventType: "Wedding reception", EventDate: time.Now().UTC().AddDate(0, 2, 0).Format(time.DateOnly),
		Location: "Cape Coast", AudienceSize: 240, BudgetPesewas: 350000, Message: "Evening live set.",
	})
	if err != nil {
		t.Fatalf("request booking: %v", err)
	}
	if created.Status != domain.ArtistBookingNew || created.RequesterEmail != requester.Email {
		t.Fatalf("unexpected booking: %+v", created)
	}
	if len(notifs.inserted) != 1 || notifs.inserted[0].MemberID != "artist-owner" {
		t.Fatalf("artist notification missing: %+v", notifs.inserted)
	}

	updated, err := svc.UpdateStatus(context.Background(), "artist-owner", created.ID, domain.ArtistBookingAccepted, "Date held pending contract.")
	if err != nil {
		t.Fatalf("update booking: %v", err)
	}
	if updated.Status != domain.ArtistBookingAccepted || len(notifs.inserted) != 2 || notifs.inserted[1].MemberID != requester.ID {
		t.Fatalf("status notification missing: booking=%+v notifications=%+v", updated, notifs.inserted)
	}
}

func TestArtistBookingRejectsPastDateAndWrongOwner(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{{ID: "artist-1", Slug: "adwoa-b", Type: domain.TypeArtist, OwnerID: "artist-owner", Title: "Adwoa B", Status: domain.StatusApproved}}}
	bookings := &bookingMemoryRepo{}
	svc := NewArtistBookingService(listings, bookings, nil)
	requester := &domain.Member{ID: "fan-1", DisplayName: "Ama Fan", Phone: "+233200000000"}
	if _, err := svc.Request(context.Background(), requester, "adwoa-b", ArtistBookingInput{EventType: "Wedding", EventDate: "2020-01-01", Location: "Oguaa"}); err == nil {
		t.Fatal("past booking date accepted")
	}
	bookings.bookings = append(bookings.bookings, domain.ArtistBooking{ID: "booking-1", ArtistOwnerID: "artist-owner"})
	if _, err := svc.UpdateStatus(context.Background(), "someone-else", "booking-1", domain.ArtistBookingDeclined, ""); err == nil {
		t.Fatal("non-owner updated booking")
	}
}
