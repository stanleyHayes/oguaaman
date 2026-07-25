package service

import (
	"context"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

type ArtistBookingInput struct {
	EventType     string `json:"eventType"`
	EventDate     string `json:"eventDate"`
	Location      string `json:"location"`
	AudienceSize  int    `json:"audienceSize"`
	BudgetPesewas int64  `json:"budgetPesewas"`
	Message       string `json:"message"`
	ContactEmail  string `json:"contactEmail"`
	ContactPhone  string `json:"contactPhone"`
}

type ArtistBookingService struct {
	listings domain.ListingRepository
	bookings domain.ArtistBookingRepository
	notifs   domain.NotificationRepository
}

func NewArtistBookingService(listings domain.ListingRepository, bookings domain.ArtistBookingRepository, notifs domain.NotificationRepository) *ArtistBookingService {
	return &ArtistBookingService{listings: listings, bookings: bookings, notifs: notifs}
}

func (s *ArtistBookingService) Request(ctx context.Context, requester *domain.Member, artistSlug string, in ArtistBookingInput) (domain.ArtistBooking, error) {
	if requester == nil {
		return domain.ArtistBooking{}, fmt.Errorf("sign in to request an artist booking")
	}
	artist, err := s.listings.GetBySlug(ctx, domain.TypeArtist, artistSlug)
	if err != nil {
		return domain.ArtistBooking{}, err
	}
	if artist.Status != domain.StatusApproved || artist.OwnerID == "" {
		return domain.ArtistBooking{}, fmt.Errorf("this artist is not accepting platform booking requests")
	}

	eventType := strings.TrimSpace(in.EventType)
	location := strings.TrimSpace(in.Location)
	message := strings.TrimSpace(in.Message)
	if len(eventType) < 2 || len(eventType) > 80 {
		return domain.ArtistBooking{}, fmt.Errorf("event type must be between 2 and 80 characters")
	}
	if len(location) < 2 || len(location) > 180 {
		return domain.ArtistBooking{}, fmt.Errorf("location must be between 2 and 180 characters")
	}
	if len(message) > 2000 {
		return domain.ArtistBooking{}, fmt.Errorf("message must be 2000 characters or fewer")
	}
	eventDate, err := time.Parse(time.DateOnly, strings.TrimSpace(in.EventDate))
	if err != nil || eventDate.Before(time.Now().UTC().Truncate(24*time.Hour)) {
		return domain.ArtistBooking{}, fmt.Errorf("event date must be today or later")
	}
	if in.AudienceSize < 0 || in.AudienceSize > 1_000_000 {
		return domain.ArtistBooking{}, fmt.Errorf("audience size is outside the supported range")
	}
	if in.BudgetPesewas < 0 || in.BudgetPesewas > 100_000_000_00 {
		return domain.ArtistBooking{}, fmt.Errorf("budget is outside the supported range")
	}

	email := strings.TrimSpace(in.ContactEmail)
	phone := strings.TrimSpace(in.ContactPhone)
	if email == "" {
		email = requester.Email
	}
	if phone == "" {
		phone = requester.Phone
	}
	if email != "" {
		address, parseErr := mail.ParseAddress(email)
		if parseErr != nil || address.Address != email {
			return domain.ArtistBooking{}, fmt.Errorf("enter a valid contact email")
		}
	}
	if len(phone) > 40 {
		return domain.ArtistBooking{}, fmt.Errorf("contact phone is too long")
	}
	if email == "" && phone == "" {
		return domain.ArtistBooking{}, fmt.Errorf("add an email address or phone number for the artist to reply")
	}

	now := time.Now().UTC().Format(time.RFC3339)
	booking := domain.ArtistBooking{
		ID:       fmt.Sprintf("artist-booking-%d", time.Now().UnixNano()),
		ArtistID: artist.ID, ArtistSlug: artist.Slug, ArtistName: artist.Title, ArtistOwnerID: artist.OwnerID,
		RequesterID: requester.ID, RequesterName: requester.DisplayName, RequesterEmail: email, RequesterPhone: phone,
		EventType: eventType, EventDate: eventDate.Format(time.DateOnly), Location: location,
		AudienceSize: in.AudienceSize, BudgetPesewas: in.BudgetPesewas, Message: message,
		Status: domain.ArtistBookingNew, CreatedAt: now, UpdatedAt: now,
	}
	created, err := s.bookings.Create(ctx, booking)
	if err != nil {
		return domain.ArtistBooking{}, err
	}
	if s.notifs != nil {
		_ = s.notifs.Insert(ctx, domain.Notification{
			ID: fmt.Sprintf("ntf-artist-booking-%d", time.Now().UnixNano()), MemberID: artist.OwnerID, Kind: "artist-booking",
			Title: "New booking request for " + artist.Title,
			Body:  requester.DisplayName + " wants to book you for " + eventType + " on " + eventDate.Format("2 January 2006") + ".",
			Link:  "/bookings", CreatedAt: now,
		})
	}
	return created, nil
}

func (s *ArtistBookingService) ForOwner(ctx context.Context, ownerID string) ([]domain.ArtistBooking, error) {
	return s.bookings.ForArtistOwner(ctx, ownerID)
}

func (s *ArtistBookingService) UpdateStatus(ctx context.Context, ownerID, bookingID, status, note string) (domain.ArtistBooking, error) {
	switch status {
	case domain.ArtistBookingNew, domain.ArtistBookingReviewing, domain.ArtistBookingAccepted, domain.ArtistBookingDeclined:
	default:
		return domain.ArtistBooking{}, fmt.Errorf("unsupported booking status")
	}
	note = strings.TrimSpace(note)
	if len(note) > 500 {
		return domain.ArtistBooking{}, fmt.Errorf("artist note must be 500 characters or fewer")
	}
	updated, err := s.bookings.UpdateStatus(ctx, bookingID, ownerID, status, note, time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		return domain.ArtistBooking{}, err
	}
	if s.notifs != nil {
		_ = s.notifs.Insert(ctx, domain.Notification{
			ID: fmt.Sprintf("ntf-artist-booking-status-%d", time.Now().UnixNano()), MemberID: updated.RequesterID, Kind: "artist-booking-status",
			Title: updated.ArtistName + " updated your booking request",
			Body:  "Your " + updated.EventType + " request is now " + status + ".",
			Link:  "/music/" + updated.ArtistSlug, CreatedAt: time.Now().UTC().Format(time.RFC3339),
		})
	}
	return updated, nil
}
