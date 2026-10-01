package service

import (
	"context"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── data export (Act 843 right of access; contract K7) ───────────────────────

// ExportService assembles a member's own copy of everything the platform holds
// about them.
type ExportService struct {
	members domain.MemberRepository
	data    domain.MemberDataRepository
}

func NewExportService(members domain.MemberRepository, data domain.MemberDataRepository) *ExportService {
	return &ExportService{members: members, data: data}
}

// ExportProfile is the member document with the private identifiers and
// records the public API never shows (this copy is the member's own): contact
// details, every Terms/Privacy acceptance, the age confirmation, notification
// choices with their marketing consent record, and the writing-assistant
// consent. Credentials and secrets (password hash, two-factor secret, pending
// codes) are not personal data to hand back and stay out.
type ExportProfile struct {
	*domain.Member
	Email                   string                  `json:"email,omitempty"`
	Phone                   string                  `json:"phone,omitempty"`
	DateOfBirth             string                  `json:"dateOfBirth,omitempty"`
	Consent                 *domain.Consent         `json:"consent,omitempty"`
	ConsentHistory          []domain.Consent        `json:"consentHistory"`
	AdultVerifiedAt         string                  `json:"adultVerifiedAt,omitempty"`
	NotificationPreferences ExportNotificationPrefs `json:"notificationPreferences"`
	AIConsentAt             string                  `json:"aiConsentAt,omitempty"`
}

// ExportNotificationPrefs is the member's notification choices (the defaults
// when they never chose) with the consent record for product messages.
type ExportNotificationPrefs struct {
	domain.NotificationPrefs
	ProductConsentAt   string `json:"productConsentAt,omitempty"`
	ProductWithdrawnAt string `json:"productWithdrawnAt,omitempty"`
	UpdatedAt          string `json:"updatedAt,omitempty"`
}

// exportProfile builds the member's own profile section.
func exportProfile(m *domain.Member) ExportProfile {
	prefs := domain.DefaultNotificationPrefs()
	if m.NotificationPrefs != nil {
		prefs = *m.NotificationPrefs
	}
	history := m.ConsentHistory
	if history == nil {
		history = []domain.Consent{}
	}
	return ExportProfile{
		Member: m, Email: m.Email, Phone: m.Phone, DateOfBirth: m.DateOfBirth,
		Consent: m.Consent, ConsentHistory: history, AdultVerifiedAt: m.AdultVerifiedAt, AIConsentAt: m.AIConsentAt,
		NotificationPreferences: ExportNotificationPrefs{
			NotificationPrefs: prefs, ProductConsentAt: prefs.ProductConsentAt,
			ProductWithdrawnAt: prefs.ProductWithdrawnAt, UpdatedAt: prefs.UpdatedAt,
		},
	}
}

// MemberExport is the downloadable export. Every section is present (empty
// sections are empty lists); if any section cannot be loaded the export fails
// rather than looking complete.
type MemberExport struct {
	ExportedAt string        `json:"exportedAt"`
	Profile    ExportProfile `json:"profile"`
	*domain.MemberRecords
	Processing ProcessingNotice `json:"processing"`
}

// ExportMember builds the export for memberID.
func (s *ExportService) ExportMember(ctx context.Context, memberID string) (*MemberExport, error) {
	m, err := s.members.ByID(ctx, memberID)
	if err != nil {
		return nil, err
	}
	rec, err := s.data.ExportRecords(ctx, m.ID)
	if err != nil {
		return nil, err
	}
	redactThirdParties(rec)
	return &MemberExport{
		ExportedAt:    time.Now().UTC().Format(time.RFC3339),
		Profile:       exportProfile(m),
		MemberRecords: rec,
		Processing:    ProcessingNoticeForExport(),
	}, nil
}

// redactThirdParties removes other people's contact details and device
// secrets from the export: a seller's copy of an order keeps the buyer's name
// but not their email, phone or address; an artist's booking requests keep the
// requester's name only; push devices are identified, not handed over as
// working credentials.
func redactThirdParties(rec *domain.MemberRecords) {
	for i := range rec.SellerOrders {
		o := &rec.SellerOrders[i]
		o.BuyerEmail, o.BuyerPhone, o.DeliveryAddress, o.Note = "", "", "", ""
	}
	for i := range rec.ArtistBookingsReceived {
		b := &rec.ArtistBookingsReceived[i]
		b.RequesterEmail, b.RequesterPhone = "", ""
	}
	for i := range rec.PushDevices {
		p := &rec.PushDevices[i]
		p.ID, p.Endpoint, p.ExpoToken = maskSecret(p.ID), maskSecret(p.Endpoint), maskSecret(p.ExpoToken)
		p.P256dh, p.Auth = "", ""
	}
	for i := range rec.StripeIntents {
		rec.StripeIntents[i].ClientSecret = ""
	}
}

// maskSecret keeps only the last few characters of a token so a device can be
// recognised without the export working as a credential.
func maskSecret(s string) string {
	const keep = 6
	if len(s) <= keep {
		return s
	}
	return "…" + s[len(s)-keep:]
}
