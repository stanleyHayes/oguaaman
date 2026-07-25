package domain

import "context"

const (
	ArtistBookingNew       = "new"
	ArtistBookingReviewing = "reviewing"
	ArtistBookingAccepted  = "accepted"
	ArtistBookingDeclined  = "declined"
)

// ArtistBooking is a private enquiry sent from a public artist profile to the
// artist's creator dashboard. Contact details are exposed only on owner-scoped
// endpoints; there is no public booking list.
type ArtistBooking struct {
	ID            string `json:"id" bson:"_id"`
	ArtistID      string `json:"artistId" bson:"artistId"`
	ArtistSlug    string `json:"artistSlug" bson:"artistSlug"`
	ArtistName    string `json:"artistName" bson:"artistName"`
	ArtistOwnerID string `json:"-" bson:"artistOwnerId"`

	RequesterID    string `json:"requesterId" bson:"requesterId"`
	RequesterName  string `json:"requesterName" bson:"requesterName"`
	RequesterEmail string `json:"requesterEmail,omitempty" bson:"requesterEmail,omitempty"`
	RequesterPhone string `json:"requesterPhone,omitempty" bson:"requesterPhone,omitempty"`

	EventType     string `json:"eventType" bson:"eventType"`
	EventDate     string `json:"eventDate" bson:"eventDate"`
	Location      string `json:"location" bson:"location"`
	AudienceSize  int    `json:"audienceSize,omitempty" bson:"audienceSize,omitempty"`
	BudgetPesewas int64  `json:"budgetPesewas,omitempty" bson:"budgetPesewas,omitempty"`
	Message       string `json:"message,omitempty" bson:"message,omitempty"`
	Status        string `json:"status" bson:"status"`
	ArtistNote    string `json:"artistNote,omitempty" bson:"artistNote,omitempty"`
	CreatedAt     string `json:"createdAt" bson:"createdAt"`
	UpdatedAt     string `json:"updatedAt" bson:"updatedAt"`
}

type ArtistBookingRepository interface {
	Create(ctx context.Context, booking ArtistBooking) (ArtistBooking, error)
	ForArtistOwner(ctx context.Context, ownerID string) ([]ArtistBooking, error)
	ByID(ctx context.Context, id string) (ArtistBooking, error)
	UpdateStatus(ctx context.Context, id, ownerID, status, artistNote, updatedAt string) (ArtistBooking, error)
}
