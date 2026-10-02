package domain

import (
	"context"
	"errors"
	"time"
)

// ── paid advertising (Feature B, spec §3) ────────────────────────────────────
//
// Ads are contextual display placements sold on one public CPM rate card.
// Every campaign is reviewed before it is paid for (D1): quote → submit →
// review → approve → pay → scheduled/active → completed. Money is integer
// pesewas, dates are YYYY-MM-DD in Africa/Accra, timestamps RFC3339 UTC.

// Placement slugs. They are fixed in code: frontends hard-code the slots.
const (
	AdPlacementPortalHomeBanner  = "portal-home-banner"
	AdPlacementPortalFeedCard    = "portal-feed-card"
	AdPlacementPortalArticleRect = "portal-article-rect"
	AdPlacementMarketingCard     = "marketing-card"
	AdPlacementAppCard           = "app-card"
)

// Creative formats.
const (
	AdFormatBanner = "banner"
	AdFormatCard   = "card"
	AdFormatRect   = "rect"
)

// Surfaces a placement renders on.
const (
	AdSurfacePortal    = "portal"
	AdSurfaceMarketing = "marketing"
	AdSurfaceApp       = "app"
)

// AdPlacement describes one fixed slot. Prices live in AdSettings.
type AdPlacement struct {
	Slug        string   `json:"slug"`
	Name        string   `json:"name"`
	Format      string   `json:"format"`
	Surface     string   `json:"surface"`
	Description string   `json:"description"` // where it renders, for the rate card
	Sizes       []string `json:"sizes"`       // minimum upload sizes, "WxH"
	// Why completes "This ad is shown to everyone who views …" in the
	// "Why am I seeing this ad?" panel (slate `why`).
	Why string `json:"why"`
}

// AdPlacements is the fixed placement registry, in rate-card order.
var AdPlacements = []AdPlacement{
	{Slug: AdPlacementPortalHomeBanner, Name: "Portal home banner", Format: AdFormatBanner, Surface: AdSurfacePortal,
		Description: "Top of the Oguaa home page, below the hero", Sizes: []string{"728x90", "320x100"}, Why: "the Oguaa home page"},
	{Slug: AdPlacementPortalFeedCard, Name: "Portal feed card", Format: AdFormatCard, Surface: AdSurfacePortal,
		Description: "In the news and events lists, after the fourth item", Sizes: []string{"1200x628"}, Why: "Oguaa news and events pages"},
	{Slug: AdPlacementPortalArticleRect, Name: "Portal article box", Format: AdFormatRect, Surface: AdSurfacePortal,
		Description: "Beside news articles on wide screens, below the sources on phones", Sizes: []string{"300x250"}, Why: "Oguaa news articles"},
	{Slug: AdPlacementMarketingCard, Name: "Oguaa website card", Format: AdFormatCard, Surface: AdSurfaceMarketing,
		Description: "On the oguaaman.com home page and news list", Sizes: []string{"1200x628"}, Why: "the oguaaman.com website"},
	{Slug: AdPlacementAppCard, Name: "Oguaa app card", Format: AdFormatCard, Surface: AdSurfaceApp,
		Description: "In the Oguaa app's home screen and news", Sizes: []string{"1200x628"}, Why: "the Oguaa app home screen and news"},
}

// AdPlacementBySlug returns the placement with slug, or ok=false.
func AdPlacementBySlug(slug string) (AdPlacement, bool) {
	for _, p := range AdPlacements {
		if p.Slug == slug {
			return p, true
		}
	}
	return AdPlacement{}, false
}

// ── settings (platform_settings/ads, spec §3.2) ─────────────────────────────

// AdPlacementPrice is one placement's row on the rate card.
type AdPlacementPrice struct {
	Slug                string `json:"slug" bson:"slug"`                               // one of the 5 slugs
	Active              bool   `json:"active" bson:"active"`                           // sellable + servable
	CpmPesewas          int64  `json:"cpmPesewas" bson:"cpmPesewas"`                   // net, per 1,000 viewable impressions; 100..100_000
	PoliticalCpmPesewas int64  `json:"politicalCpmPesewas" bson:"politicalCpmPesewas"` // net; 100..100_000; must be ≥ cpmPesewas
	FallbackDailyViews  int    `json:"fallbackDailyViews" bson:"fallbackDailyViews"`   // forecast used until 7 days of data; 0..1_000_000
}

// AdSettings is the ads feature's settings document. Stewards edit it;
// curators read it.
type AdSettings struct {
	AdsEnabled             bool               `json:"adsEnabled" bson:"adsEnabled"`                         // global kill switch (selling + serving)
	PoliticalEnabled       bool               `json:"politicalEnabled" bson:"politicalEnabled"`             // political kill switch
	AppDeliveryEnabled     bool               `json:"appDeliveryEnabled" bson:"appDeliveryEnabled"`         // D6
	AllowDistrictAssembly  bool               `json:"allowDistrictAssembly" bson:"allowDistrictAssembly"`   // [A13]
	TaxRateBps             int                `json:"taxRateBps" bson:"taxRateBps"`                         // [A9]; 0..5000
	TaxLabel               string             `json:"taxLabel" bson:"taxLabel"`                             // "VAT, NHIL and GETFund"
	MinOrderPesewas        int64              `json:"minOrderPesewas" bson:"minOrderPesewas"`               // compared with total
	MinImpressions         int64              `json:"minImpressions" bson:"minImpressions"`                 //
	ImpressionStep         int64              `json:"impressionStep" bson:"impressionStep"`                 //
	MaxImpressionsPerOrder int64              `json:"maxImpressionsPerOrder" bson:"maxImpressionsPerOrder"` //
	MaxCampaignDays        int                `json:"maxCampaignDays" bson:"maxCampaignDays"`               // 1..180
	MinLeadDays            int                `json:"minLeadDays" bson:"minLeadDays"`                       // review time; 0..14
	ApprovalValidHours     int                `json:"approvalValidHours" bson:"approvalValidHours"`         // 24..336
	SellThroughPercent     int                `json:"sellThroughPercent" bson:"sellThroughPercent"`         // 10..100
	BlockedCategories      []string           `json:"blockedCategories" bson:"blockedCategories"`           // subset of the admin-blockable list
	Placements             []AdPlacementPrice `json:"placements" bson:"placements"`                         // exactly the 5 slugs
	Version                int                `json:"version" bson:"version"`
	EffectiveFrom          string             `json:"effectiveFrom" bson:"effectiveFrom"` // UpdatedAt of the last price change (public)
	UpdatedAt              string             `json:"updatedAt" bson:"updatedAt"`
	UpdatedByName          string             `json:"updatedByName" bson:"updatedByName"`
}

// Price returns the settings row for a placement slug, or ok=false.
func (s AdSettings) Price(slug string) (AdPlacementPrice, bool) {
	for _, p := range s.Placements {
		if p.Slug == slug {
			return p, true
		}
	}
	return AdPlacementPrice{}, false
}

// Servable reports whether ads may be sold for and shown in a placement:
// ads on, the placement active, and (for the app) app delivery on (D6).
func (s AdSettings) Servable(slug string) bool {
	p, ok := s.Price(slug)
	if !ok || !s.AdsEnabled || !p.Active {
		return false
	}
	if slug == AdPlacementAppCard && !s.AppDeliveryEnabled {
		return false
	}
	return true
}

// ── sponsors ────────────────────────────────────────────────────────────────

// Sponsor kinds.
const (
	AdSponsorCommercial = "commercial"
	AdSponsorPolitical  = "political"
)

// Sponsor entity types.
const (
	AdEntityIndividual        = "individual"
	AdEntityBusiness          = "business"
	AdEntityNGO               = "ngo"
	AdEntityGovernment        = "government"
	AdEntityParty             = "party"
	AdEntityCandidate         = "candidate"
	AdEntityCampaignCommittee = "campaign_committee"
)

// Sponsor statuses.
const (
	AdSponsorPending   = "pending"
	AdSponsorVerified  = "verified"
	AdSponsorRejected  = "rejected"
	AdSponsorSuspended = "suspended"
)

// Political offices a sponsor can stand for or speak to.
const (
	AdOfficePresidential     = "presidential"
	AdOfficeParliamentary    = "parliamentary"
	AdOfficeDistrictAssembly = "district_assembly"
	AdOfficePartyInternal    = "party_internal"
	AdOfficeIssue            = "issue"
)

// AdSponsor is who pays for and is named on an ad.
type AdSponsor struct {
	ID                 string `json:"id" bson:"_id"`
	MemberID           string `json:"-" bson:"memberId,omitempty"` // cleared on member erasure
	Kind               string `json:"kind" bson:"kind"`
	EntityType         string `json:"entityType" bson:"entityType"`
	DisplayName        string `json:"displayName" bson:"displayName"`                                   // commercial label "Sponsored · X"; 2..60
	LegalName          string `json:"legalName" bson:"legalName"`                                       // political label "Paid for by X"; 2..120
	RegistrationNumber string `json:"registrationNumber,omitempty" bson:"registrationNumber,omitempty"` // business/party/company
	IDNumberLast4      string `json:"idNumberLast4,omitempty" bson:"idNumberLast4,omitempty"`           // Ghana Card; full number only in the uploaded document
	IDDocumentUploadID string `json:"-" bson:"idDocumentUploadId,omitempty"`                            // private upload (POST /api/uploads/private)
	TIN                string `json:"tin,omitempty" bson:"tin,omitempty"`
	Address            string `json:"address" bson:"address"` // physical / GPS address
	Phone              string `json:"-" bson:"phone"`
	Email              string `json:"-" bson:"email"`
	ContactPerson      string `json:"contactPerson,omitempty" bson:"contactPerson,omitempty"`
	// political only
	PartyName               string `json:"partyName,omitempty" bson:"partyName,omitempty"`
	CandidateName           string `json:"candidateName,omitempty" bson:"candidateName,omitempty"`
	Office                  string `json:"office,omitempty" bson:"office,omitempty"` // presidential|parliamentary|district_assembly|party_internal|issue
	Constituency            string `json:"constituency,omitempty" bson:"constituency,omitempty"`
	ECAuthorisationUploadID string `json:"-" bson:"ecAuthorisationUploadId,omitempty"`
	CitizenshipDeclaredAt   string `json:"citizenshipDeclaredAt,omitempty" bson:"citizenshipDeclaredAt,omitempty"`
	Status                  string `json:"status" bson:"status"`
	ReviewNote              string `json:"reviewNote,omitempty" bson:"reviewNote,omitempty"`
	VerifiedByName          string `json:"verifiedByName,omitempty" bson:"verifiedByName,omitempty"`
	VerifiedAt              string `json:"verifiedAt,omitempty" bson:"verifiedAt,omitempty"`
	CreatedAt               string `json:"createdAt" bson:"createdAt"`
	UpdatedAt               string `json:"updatedAt" bson:"updatedAt"`
}

// AdSponsorOwnerView is a sponsor as its own member sees it: the contact
// details hidden everywhere else are included (GET /api/me/ad-sponsors and
// the member's data export).
type AdSponsorOwnerView struct {
	AdSponsor
	Phone string `json:"phone"`
	Email string `json:"email"`
	// Whether a document is on file (the upload ids themselves stay hidden);
	// an edit that leaves an id empty keeps the stored document.
	HasIDDocument      bool `json:"hasIdDocument"`
	HasECAuthorisation bool `json:"hasEcAuthorisation"`
}

// OwnerView returns the sponsor with its contact details visible.
func (s AdSponsor) OwnerView() AdSponsorOwnerView {
	return AdSponsorOwnerView{
		AdSponsor: s, Phone: s.Phone, Email: s.Email,
		HasIDDocument: s.IDDocumentUploadID != "", HasECAuthorisation: s.ECAuthorisationUploadID != "",
	}
}

// AdCampaignExport is a campaign in its member's data export: the receipt
// email hidden elsewhere is included.
type AdCampaignExport struct {
	AdCampaign
	Email string `json:"email,omitempty"`
}

// AdSponsorFilter narrows the admin sponsor queue ("" = any).
type AdSponsorFilter struct {
	Status string
	Kind   string
}

// AdSponsorRepository persists sponsors (collection `ad_sponsors`).
type AdSponsorRepository interface {
	Insert(ctx context.Context, s AdSponsor) error
	Get(ctx context.Context, id string) (*AdSponsor, error)
	ByMember(ctx context.Context, memberID string) ([]AdSponsor, error)
	// Update replaces an owner-editable sponsor only while its status is one
	// of from; it reports whether it did.
	Update(ctx context.Context, s AdSponsor, from []string) (bool, error)
	// SetStatus moves a sponsor from any of from to status with a staff note,
	// in one conditional write; verified also stamps verifiedByName/At.
	SetStatus(ctx context.Context, id string, from []string, status, note, staffName, at string) (bool, error)
	List(ctx context.Context, f AdSponsorFilter) ([]AdSponsor, error)
	// AnonymiseMember clears memberId, email and phone on the member's
	// sponsors, keeping the record (tax and political transparency).
	AnonymiseMember(ctx context.Context, memberID string) error
	EnsureIndexes(ctx context.Context) error
}

// ── campaigns ───────────────────────────────────────────────────────────────

// Campaign statuses (spec §3.5).
const (
	AdStatusPendingReview = "pending_review"
	AdStatusApproved      = "approved"
	AdStatusScheduled     = "scheduled"
	AdStatusActive        = "active"
	AdStatusPaused        = "paused"
	AdStatusCompleted     = "completed"
	AdStatusRejected      = "rejected"
	AdStatusExpired       = "expired"
	AdStatusCancelled     = "cancelled"
	AdStatusRemoved       = "removed"
)

// AdStatuses lists every campaign status, in lifecycle order.
var AdStatuses = []string{
	AdStatusPendingReview, AdStatusApproved, AdStatusScheduled, AdStatusActive, AdStatusPaused,
	AdStatusCompleted, AdStatusRejected, AdStatusExpired, AdStatusCancelled, AdStatusRemoved,
}

// Campaign payment statuses.
const (
	AdPaymentNone    = "none"
	AdPaymentPending = "pending"
	AdPaymentSuccess = "success"
	AdPaymentFailed  = "failed"
)

// Political ad types.
const (
	AdPoliticalElection = "election"
	AdPoliticalIssue    = "issue"
)

// Refund reasons.
const (
	AdRefundUnderDelivery        = "under_delivery"
	AdRefundCancelledBeforeStart = "cancelled_before_start"
	AdRefundStoppedByAdvertiser  = "stopped_by_advertiser"
	AdRefundRemoved              = "removed"
	AdRefundElectionBlackout     = "election_blackout"
	AdRefundPaidAfterClose       = "paid_after_close"
	AdRefundManual               = "manual"
	// AdRefundDuplicateCharge refunds a second successful charge for a
	// campaign that was already paid: it goes back to that charge's own
	// reference and never counts against the campaign's refund allowance.
	AdRefundDuplicateCharge = "duplicate_charge"
)

// Refund statuses.
const (
	AdRefundRequesting  = "requesting"
	AdRefundPending     = "pending"
	AdRefundProcessed   = "processed"
	AdRefundFailed      = "failed"
	AdRefundManualCheck = "manual_check"
)

// Actor names on status changes made by someone other than a staff member.
const (
	AdActorAdvertiser = "advertiser"
	AdActorSystem     = "system"
)

// AdCreative is what the ad shows.
type AdCreative struct {
	Format                 string `json:"format" bson:"format"`                                       // banner | card | rect (derived from placement)
	ImageURL               string `json:"imageUrl,omitempty" bson:"imageUrl,omitempty"`               // card 1200x628 / rect 300x250
	ImageURLDesktop        string `json:"imageUrlDesktop,omitempty" bson:"imageUrlDesktop,omitempty"` // banner 728x90
	ImageURLMobile         string `json:"imageUrlMobile,omitempty" bson:"imageUrlMobile,omitempty"`   // banner 320x100
	Headline               string `json:"headline,omitempty" bson:"headline,omitempty"`               // card: required, ≤ 60
	Body                   string `json:"body,omitempty" bson:"body,omitempty"`                       // card: optional, ≤ 90
	Alt                    string `json:"alt" bson:"alt"`                                             // required, ≤ 125
	LandingURL             string `json:"landingUrl" bson:"landingUrl"`                               // https, ≤ 2048
	ContainsSyntheticMedia bool   `json:"containsSyntheticMedia" bson:"containsSyntheticMedia"`
}

// AdCompliance holds the regulator references a category needs.
type AdCompliance struct {
	FDARegistrationNo    string `json:"fdaRegistrationNo,omitempty" bson:"fdaRegistrationNo,omitempty"`
	FDAApprovalRef       string `json:"fdaApprovalRef,omitempty" bson:"fdaApprovalRef,omitempty"`
	FDAApprovalExpiresOn string `json:"fdaApprovalExpiresOn,omitempty" bson:"fdaApprovalExpiresOn,omitempty"` // date; campaign endDate must be ≤ this
	Regulator            string `json:"regulator,omitempty" bson:"regulator,omitempty"`                       // SEC | BoG | NIC | GamingCommission | NLA
	LicenceNumber        string `json:"licenceNumber,omitempty" bson:"licenceNumber,omitempty"`
	ApprovalUploadID     string `json:"-" bson:"approvalUploadId,omitempty"` // private upload of the approval letter
}

// AdPriceSnapshot is the price locked when the campaign was quoted.
type AdPriceSnapshot struct {
	SettingsVersion int   `json:"settingsVersion" bson:"settingsVersion"`
	CpmPesewas      int64 `json:"cpmPesewas" bson:"cpmPesewas"`
	NetPesewas      int64 `json:"netPesewas" bson:"netPesewas"`
	TaxRateBps      int   `json:"taxRateBps" bson:"taxRateBps"`
	TaxPesewas      int64 `json:"taxPesewas" bson:"taxPesewas"`
	TotalPesewas    int64 `json:"totalPesewas" bson:"totalPesewas"`
}

// AdStatusChange is one entry of a campaign's status history.
type AdStatusChange struct {
	From      string `json:"from" bson:"from"`
	To        string `json:"to" bson:"to"`
	At        string `json:"at" bson:"at"`
	ActorName string `json:"actorName" bson:"actorName"` // "advertiser" | staff name | "system"
	Reason    string `json:"reason,omitempty" bson:"reason,omitempty"`
}

// AdApproval is one reviewer's sign-off.
type AdApproval struct {
	StaffID   string          `json:"-" bson:"staffId"`
	StaffName string          `json:"staffName" bson:"staffName"`
	At        string          `json:"at" bson:"at"`
	Checklist map[string]bool `json:"checklist" bson:"checklist"`
}

// AdRefund is one refund of a campaign's payment.
type AdRefund struct {
	ID               string `json:"id" bson:"id"`
	AmountPesewas    int64  `json:"amountPesewas" bson:"amountPesewas"`
	Reason           string `json:"reason" bson:"reason"` // under_delivery|cancelled_before_start|stopped_by_advertiser|removed|election_blackout|paid_after_close|manual|duplicate_charge
	Status           string `json:"status" bson:"status"` // requesting|pending|processed|failed|manual_check
	PaystackRefundID string `json:"-" bson:"paystackRefundId,omitempty"`
	// Reference is the Paystack charge this refund goes back to when it is
	// not the campaign's paid reference (a duplicate charge).
	Reference string `json:"-" bson:"reference,omitempty"`
	// Note records how staff resolved a refund that needed a person.
	Note      string `json:"note,omitempty" bson:"note,omitempty"`
	CreatedAt string `json:"createdAt" bson:"createdAt"`
	UpdatedAt string `json:"updatedAt" bson:"updatedAt"`
}

// DuplicateCharge reports whether r refunds a second charge rather than part
// of the campaign's own payment.
func (r AdRefund) DuplicateCharge() bool { return r.Reason == AdRefundDuplicateCharge }

// AdCampaign is one paid placement booking.
type AdCampaign struct {
	ID                string           `json:"id" bson:"_id"`
	MemberID          string           `json:"-" bson:"memberId,omitempty"`
	Email             string           `json:"-" bson:"email,omitempty"` // receipt email for Paystack
	SponsorID         string           `json:"sponsorId" bson:"sponsorId"`
	SponsorLine       string           `json:"sponsorLine" bson:"sponsorLine"` // snapshot at approval: "Sponsored · X" | "Paid for by X"
	Political         bool             `json:"political" bson:"political"`
	PoliticalType     string           `json:"politicalType,omitempty" bson:"politicalType,omitempty"` // election | issue
	ElectionID        string           `json:"electionId,omitempty" bson:"electionId,omitempty"`
	ElectionName      string           `json:"electionName,omitempty" bson:"electionName,omitempty"`
	Category          string           `json:"category" bson:"category"` // spec §3.4
	Compliance        AdCompliance     `json:"compliance" bson:"compliance"`
	Placement         string           `json:"placement" bson:"placement"`
	Creative          AdCreative       `json:"creative" bson:"creative"`
	StartDate         string           `json:"startDate" bson:"startDate"` // inclusive, Accra
	EndDate           string           `json:"endDate" bson:"endDate"`     // inclusive, Accra
	BookedImpressions int64            `json:"bookedImpressions" bson:"bookedImpressions"`
	Price             AdPriceSnapshot  `json:"price" bson:"price"`
	QuoteExpiresAt    string           `json:"-" bson:"quoteExpiresAt"`
	Status            string           `json:"status" bson:"status"` // spec §3.5
	StatusHistory     []AdStatusChange `json:"statusHistory" bson:"statusHistory"`
	Approvals         []AdApproval     `json:"approvals,omitempty" bson:"approvals,omitempty"`
	ApprovalExpiresAt string           `json:"approvalExpiresAt,omitempty" bson:"approvalExpiresAt,omitempty"`
	RejectReason      string           `json:"rejectReason,omitempty" bson:"rejectReason,omitempty"`
	RemovalReason     string           `json:"removalReason,omitempty" bson:"removalReason,omitempty"`
	StartConsentAt    string           `json:"startConsentAt,omitempty" bson:"startConsentAt,omitempty"` // Act 772 s.49(4)(d) acknowledgement
	Reference         string           `json:"reference,omitempty" bson:"reference,omitempty"`           // oguaa-adv-…; latest checkout
	PaymentStatus     string           `json:"paymentStatus" bson:"paymentStatus"`                       // none|pending|success|failed
	PaidAt            string           `json:"paidAt,omitempty" bson:"paidAt,omitempty"`
	Simulated         bool             `json:"simulated,omitempty" bson:"simulated,omitempty"`
	FailureReason     string           `json:"failureReason,omitempty" bson:"failureReason,omitempty"`
	Delivered         int64            `json:"delivered" bson:"delivered"`
	Clicks            int64            `json:"clicks" bson:"clicks"`
	FirstImpressionAt string           `json:"firstImpressionAt,omitempty" bson:"firstImpressionAt,omitempty"`
	LastImpressionAt  string           `json:"lastImpressionAt,omitempty" bson:"lastImpressionAt,omitempty"`
	Refunds           []AdRefund       `json:"refunds,omitempty" bson:"refunds,omitempty"`
	RefundedPesewas   int64            `json:"refundedPesewas" bson:"refundedPesewas"` // processed refunds only
	RetainUntil       string           `json:"-" bson:"retainUntil,omitempty"`         // political: lastImpressionAt (or completion) + 7 years
	CreatedAt         string           `json:"createdAt" bson:"createdAt"`
	UpdatedAt         string           `json:"updatedAt" bson:"updatedAt"`

	// ── bookkeeping beyond the spec's public shape (never serialised) ──

	// PastReferences are earlier checkout references of this campaign, so a
	// payment completed on an older Paystack page still finds its campaign.
	PastReferences []string `json:"-" bson:"pastReferences,omitempty"`
	// CheckoutAt is when the latest checkout started: the reconciliation
	// sweep's clock (a campaign may wait days in review before it is paid).
	CheckoutAt string `json:"-" bson:"checkoutAt,omitempty"`
	// RefundOwed names the refund reason a transition left owing. It is set
	// in the same write as the transition and cleared in the same write that
	// records the refund, so a crash in between never loses or doubles it.
	RefundOwed string `json:"-" bson:"refundOwed,omitempty"`
	// PausedBy says what paused the campaign: "staff" (one reviewer), "kill"
	// (the emergency stop) or "sponsor" (its sponsor was suspended or is no
	// longer verified). Only curators resume the last two.
	PausedBy string `json:"pausedBy,omitempty" bson:"pausedBy,omitempty"`
}

// What paused a campaign (AdCampaign.PausedBy).
const (
	AdPausedByStaff   = "staff"
	AdPausedByKill    = "kill"
	AdPausedBySponsor = "sponsor"
)

// AdCheckoutGrace: a checkout started before the approval lapsed keeps the
// approval, and the inventory it holds, this long, so a payment still in
// progress (a Mobile Money approval, say) isn't cut off by the expiry.
const AdCheckoutGrace = time.Hour

// ApprovalHeld reports whether an approved campaign still holds its approval
// at now: it is paid, its approval hasn't lapsed, or a checkout started
// within AdCheckoutGrace is still pending.
func (c AdCampaign) ApprovalHeld(now time.Time) bool {
	if c.PaymentStatus == AdPaymentSuccess || c.ApprovalExpiresAt == "" || c.ApprovalExpiresAt >= now.UTC().Format(time.RFC3339) {
		return true
	}
	return c.PaymentStatus == AdPaymentPending && c.CheckoutAt >= now.Add(-AdCheckoutGrace).UTC().Format(time.RFC3339)
}

// RefundCommittedPesewas is what has been refunded or is still being
// refunded from the campaign's own payment: every refund row that has not
// failed, leaving out refunds of duplicate charges (they have their own).
func (c AdCampaign) RefundCommittedPesewas() int64 {
	var n int64
	for _, r := range c.Refunds {
		if r.Status != AdRefundFailed && !r.DuplicateCharge() {
			n += r.AmountPesewas
		}
	}
	return n
}

// AdFilter narrows the admin campaign list ("" / nil = any). PerPage 0 means
// no paging (all matches).
type AdFilter struct {
	Status        string
	Political     *bool
	Placement     string
	SponsorID     string
	PaymentStatus string
	Page          int
	PerPage       int
}

// Ad library tabs (spec §3.10).
const (
	AdLibraryPolitical = "political"
	AdLibraryRunning   = "running"
)

// AdLibraryFilter narrows the public ad library.
type AdLibraryFilter struct {
	Tab     string // political | running
	Query   string // sponsor name search
	Now     string // RFC3339; political entries past retainUntil drop out
	Page    int
	PerPage int
}

// ErrAdApprovalExists is returned by AddApproval when the staff member has
// already approved the campaign (HTTP 409 already_approved_by_you).
var ErrAdApprovalExists = errors.New("already_approved_by_you")

// ErrAdStateChanged is returned by AddApproval when the campaign is no
// longer pending review (HTTP 409 invalid_transition).
var ErrAdStateChanged = errors.New("ad_state_changed")

// AdRepository persists campaigns (collection `ad_campaigns`). Every state
// change is one conditional write.
type AdRepository interface {
	Insert(ctx context.Context, c AdCampaign) error
	Get(ctx context.Context, id string) (*AdCampaign, error)
	// ByReference finds the campaign a checkout reference (current or past)
	// belongs to.
	ByReference(ctx context.Context, ref string) (*AdCampaign, error)
	ByMember(ctx context.Context, memberID string) ([]AdCampaign, error) // newest first
	// List is the admin queue, newest first.
	List(ctx context.Context, f AdFilter) ([]AdCampaign, int, error)
	// StatusCounts counts campaigns per status (political/placement narrow it).
	StatusCounts(ctx context.Context, political *bool, placement string) (map[string]int, error)
	// Transition moves id from any of `from` to `to` atomically, appending the
	// status change and applying `set` (bson fields). Reports whether it won.
	Transition(ctx context.Context, id string, from []string, to string, change AdStatusChange, set map[string]any) (bool, error)
	// SetCheckout records a new checkout reference only while status is
	// approved and the payment has not succeeded; paymentStatus becomes
	// pending and the previous reference moves to pastReferences.
	SetCheckout(ctx context.Context, id, ref, email, at string) (bool, error)
	// MarkPaid: approved and payment != success → nextStatus (scheduled|active),
	// paymentStatus success. When nextStatus is active and startDate is before
	// date(at), startDate becomes date(at). The paying reference becomes the
	// reference and every other one stays in pastReferences, so a later charge
	// on another checkout is still found. Reports whether it won.
	MarkPaid(ctx context.Context, ref, at string, simulated bool, nextStatus string) (bool, error)
	// MarkPaidClosed records a successful payment on an expired, cancelled or
	// rejected campaign (status unchanged) and leaves a full refund owed; the
	// references move as in MarkPaid.
	MarkPaidClosed(ctx context.Context, ref, at string, simulated bool) (bool, error)
	// MarkPaymentFailed records a final payment failure on the current
	// reference unless the payment already succeeded.
	MarkPaymentFailed(ctx context.Context, ref, reason string) error
	// AddApproval appends a sign-off while the campaign is pending review;
	// ErrAdApprovalExists when that staff member already signed,
	// ErrAdStateChanged when it is no longer pending review.
	AddApproval(ctx context.Context, id string, a AdApproval) error
	// IncrDelivered: $inc delivered by 1 iff status=="active" && delivered < bookedImpressions; sets first/lastImpressionAt.
	IncrDelivered(ctx context.Context, id, at string) (bool, error)
	IncrClicks(ctx context.Context, id string) error
	// PushRefund appends r unless a refund with its id already exists or,
	// for a refund of the campaign's own payment, it would take the committed
	// refunds (RefundCommittedPesewas) past the price total; reports whether
	// it pushed. Refunds of duplicate charges are not capped.
	PushRefund(ctx context.Context, id string, r AdRefund) (bool, error)
	// SettleOwedRefund appends r and clears refundOwed in one write, only
	// while refundOwed equals r.Reason, no refund with r's id exists and the
	// committed refunds stay within the price total; reports whether it pushed.
	SettleOwedRefund(ctx context.Context, id string, r AdRefund) (bool, error)
	// ClearRefundOwed drops an owed-refund marker that needs no money moved
	// (simulated payment, or less than GH₵1 due).
	ClearRefundOwed(ctx context.Context, id, reason string) error
	// UpdateRefund sets one refund's status (and Paystack id). The first time
	// a refund turns processed, refundedPesewas grows by processedAmount.
	UpdateRefund(ctx context.Context, id, refundID string, status, paystackRefundID, at string, processedAmount int64) error
	// ResolveRefund settles a manual_check refund by hand: status processed
	// or failed, with a note; refundedPesewas grows by processedAmount.
	// Reports whether the refund was still waiting for a person.
	ResolveRefund(ctx context.Context, id, refundID, status, note, at string, processedAmount int64) (bool, error)
	Serving(ctx context.Context, placement, today string) ([]AdCampaign, error)        // status active, placement, startDate<=today<=endDate, delivered<booked
	Overlapping(ctx context.Context, placement, from, to string) ([]AdCampaign, error) // statuses approved(unexpired)|scheduled|active|paused overlapping [from,to]
	// PendingBetween lists campaigns whose payment is pending with a checkout
	// started in [from, to), oldest first (reconciliation sweep).
	PendingBetween(ctx context.Context, from, to string, limit int) ([]AdCampaign, error)
	// UnpaidCheckoutsBetween lists campaigns not yet paid (payment pending or
	// failed) whose latest checkout started in [from, to), oldest first, so
	// the sweep can re-check the references of their earlier checkouts.
	UnpaidCheckoutsBetween(ctx context.Context, from, to string, limit int) ([]AdCampaign, error)
	// ExpirePending marks a still-pending payment failed with reason; the
	// campaign status is unchanged.
	ExpirePending(ctx context.Context, ref, reason, at string) (bool, error)
	// DueForScheduler: statuses approved|scheduled|active|paused, an owed
	// refund, refunds requesting|pending, or a manual_check refund that has a
	// Paystack id and was created in the 30 days before now (still polled).
	DueForScheduler(ctx context.Context, now string) ([]AdCampaign, error)
	// CountLiveForElection counts campaigns approved|scheduled|active|paused
	// that reference the election.
	CountLiveForElection(ctx context.Context, electionID string) (int, error)
	Library(ctx context.Context, f AdLibraryFilter) ([]AdCampaign, int, error)
	AnonymiseMember(ctx context.Context, memberID string) error // clears memberId/email; keeps the campaign
	EnsureIndexes(ctx context.Context) error
}

// ── delivery statistics (written by the serving code, read here) ────────────

// AdCampaignDay is one campaign's delivery on one Accra day
// (`ad_campaign_days`, _id "<campaignId>|<day>").
type AdCampaignDay struct {
	CampaignID string `json:"-" bson:"campaignId"`
	Day        string `json:"day" bson:"day"`
	Views      int64  `json:"views" bson:"views"`
	Unbilled   int64  `json:"-" bson:"unbilled"`
	Clicks     int64  `json:"clicks" bson:"clicks"`
}

// AdPlacementDay is one placement's ad opportunities on one Accra day
// (`ad_placement_days`, _id "<placement>|<day>").
type AdPlacementDay struct {
	Placement     string `json:"placement" bson:"placement"`
	Day           string `json:"day" bson:"day"`
	Opportunities int64  `json:"opportunities" bson:"opportunities"`
}

// AdStatsReader reads the delivery collections the ads core needs: a
// campaign's daily delivery and a placement's observed opportunities.
type AdStatsReader interface {
	CampaignDays(ctx context.Context, campaignID string) ([]AdCampaignDay, error)
	// PlacementDays returns the days in [from, to] (inclusive dates).
	PlacementDays(ctx context.Context, placement, from, to string) ([]AdPlacementDay, error)
}
