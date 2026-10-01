package domain

import "context"

const (
	BusinessVerificationDraft    = "draft"
	BusinessVerificationPending  = "pending"
	BusinessVerificationVerified = "verified"
	BusinessVerificationRejected = "rejected"
	BusinessVerificationRevoked  = "revoked"

	OrderPending    = "pending"
	OrderPaid       = "paid"
	OrderProcessing = "processing"
	OrderReady      = "ready"
	OrderFulfilled  = "fulfilled"
	OrderCancelled  = "cancelled"
	OrderRefunded   = "refunded"

	// AbandonedPaymentReason is recorded on unpaid records the payment
	// reconciliation sweep closes after 48 hours. An order closed this way
	// can still be revived by a payment that completes later.
	AbandonedPaymentReason = "abandoned: no completed payment within 48 hours"

	CouponPercent            = "percent"
	CouponFixed              = "fixed"
	PromotionOwnerBusiness   = "business"
	PromotionOwnerPlatform   = "platform"
	PromotionFundingBusiness = "business"
	PromotionFundingPlatform = "platform"

	AffiliateReserved  = "reserved"
	AffiliateConverted = "converted"
	AffiliatePayable   = "payable"
	AffiliatePaid      = "paid"
	AffiliateVoid      = "void"

	// StoreItemPhysical and StoreItemService are the only kinds of storefront
	// item Oguaa sells through Paystack/Stripe: physical goods and in-person
	// services. Digital goods (downloads, online content) are refused — the
	// app stores require those to go through their own billing.
	StoreItemPhysical = "physical"
	StoreItemService  = "service"
)

// BusinessVerification is deliberately separate from the public Listing.
// It contains identity and settlement PII and is returned only to the owner
// and authorised staff. A verified record with an active Paystack subaccount
// is the single gate for accepting online orders.
type BusinessVerification struct {
	ID                  string   `json:"id" bson:"_id"`
	ListingID           string   `json:"listingId" bson:"listingId"`
	ListingSlug         string   `json:"listingSlug" bson:"listingSlug"`
	OwnerID             string   `json:"ownerId" bson:"ownerId"`
	LegalName           string   `json:"legalName" bson:"legalName"`
	RegistrationNumber  string   `json:"registrationNumber" bson:"registrationNumber"`
	TaxIdentificationNo string   `json:"taxIdentificationNo,omitempty" bson:"taxIdentificationNo,omitempty"`
	GhanaCardNumber     string   `json:"ghanaCardNumber" bson:"ghanaCardNumber"`
	BusinessPhone       string   `json:"businessPhone" bson:"businessPhone"`
	BusinessEmail       string   `json:"businessEmail,omitempty" bson:"businessEmail,omitempty"` // optional public contact for buyers
	GhanaPostGPS        string   `json:"ghanaPostGPS" bson:"ghanaPostGPS"`
	Documents           []string `json:"documents" bson:"documents"` // KYC evidence: new submissions are "private:<id>" upload refs
	SettlementBankCode  string   `json:"settlementBankCode" bson:"settlementBankCode"`
	SettlementAccountNo string   `json:"settlementAccountNo" bson:"settlementAccountNo"`
	SettlementName      string   `json:"settlementName" bson:"settlementName"`
	PaystackSubaccount  string   `json:"paystackSubaccount,omitempty" bson:"paystackSubaccount,omitempty"`
	Status              string   `json:"status" bson:"status"`
	ReviewNote          string   `json:"reviewNote,omitempty" bson:"reviewNote,omitempty"`
	ReviewedByID        string   `json:"reviewedById,omitempty" bson:"reviewedById,omitempty"`
	SubmittedAt         string   `json:"submittedAt,omitempty" bson:"submittedAt,omitempty"`
	ReviewedAt          string   `json:"reviewedAt,omitempty" bson:"reviewedAt,omitempty"`
	CreatedAt           string   `json:"createdAt" bson:"createdAt"`
	UpdatedAt           string   `json:"updatedAt" bson:"updatedAt"`
}

type BusinessVerificationRepository interface {
	ByListing(ctx context.Context, listingID string) (*BusinessVerification, error)
	Upsert(ctx context.Context, verification BusinessVerification) error
	All(ctx context.Context) ([]BusinessVerification, error)
	Review(ctx context.Context, listingID, status, note, reviewerID, reviewedAt, subaccount string) error
	// SetPaystackSubaccount replaces a seller's subaccount code (operator
	// relink after switching Paystack keys); the review is untouched.
	SetPaystackSubaccount(ctx context.Context, listingID, subaccount, at string) error
}

type OrderLine struct {
	ProductID       string `json:"productId" bson:"productId"`
	Name            string `json:"name" bson:"name"`
	Quantity        int    `json:"quantity" bson:"quantity"`
	UnitPesewas     int64  `json:"unitPesewas" bson:"unitPesewas"`
	SubtotalPesewas int64  `json:"subtotalPesewas" bson:"subtotalPesewas"`
}

// CommerceOrder snapshots every amount used to initialize Paystack. Never
// recompute settlement from mutable products or coupon definitions later.
type CommerceOrder struct {
	ID                         string      `json:"id" bson:"_id"`
	Reference                  string      `json:"reference" bson:"reference"`
	ListingID                  string      `json:"listingId" bson:"listingId"`
	ListingSlug                string      `json:"listingSlug" bson:"listingSlug"`
	BusinessName               string      `json:"businessName" bson:"businessName"`
	BuyerID                    string      `json:"buyerId,omitempty" bson:"buyerId,omitempty"`
	BuyerName                  string      `json:"buyerName" bson:"buyerName"`
	BuyerEmail                 string      `json:"buyerEmail" bson:"buyerEmail"`
	BuyerPhone                 string      `json:"buyerPhone" bson:"buyerPhone"`
	Fulfilment                 string      `json:"fulfilment" bson:"fulfilment"`
	DeliveryAddress            string      `json:"deliveryAddress,omitempty" bson:"deliveryAddress,omitempty"`
	Note                       string      `json:"note,omitempty" bson:"note,omitempty"`
	Lines                      []OrderLine `json:"lines" bson:"lines"`
	CouponCode                 string      `json:"couponCode,omitempty" bson:"couponCode,omitempty"`
	PromotionID                string      `json:"promotionId,omitempty" bson:"promotionId,omitempty"`
	PromotionFunding           string      `json:"promotionFunding,omitempty" bson:"promotionFunding,omitempty"`
	AffiliateCode              string      `json:"affiliateCode,omitempty" bson:"affiliateCode,omitempty"`
	AffiliateID                string      `json:"affiliateId,omitempty" bson:"affiliateId,omitempty"`
	AffiliateProgrammeID       string      `json:"affiliateProgrammeId,omitempty" bson:"affiliateProgrammeId,omitempty"`
	AffiliateCommissionPesewas int64       `json:"affiliateCommissionPesewas,omitempty" bson:"affiliateCommissionPesewas,omitempty"`
	AffiliateFunding           string      `json:"-" bson:"affiliateFunding,omitempty"`  // programme terms snapshotted at checkout,
	AffiliateHoldDays          int         `json:"-" bson:"affiliateHoldDays,omitempty"` // so the paid-order conversion matches the split
	SubtotalPesewas            int64       `json:"subtotalPesewas" bson:"subtotalPesewas"`
	DiscountPesewas            int64       `json:"discountPesewas" bson:"discountPesewas"`
	AmountPesewas              int64       `json:"amountPesewas" bson:"amountPesewas"`
	PlatformFeePesewas         int64       `json:"platformFeePesewas" bson:"platformFeePesewas"`
	// BusinessNetPesewas is what the seller's Paystack subaccount receives.
	// The split sends bearer=subaccount, so Paystack's processing fee comes
	// out of the seller's share (P15): until payment it is amount − Oguaa's
	// fee − any business-funded commission; once paid, the fee Paystack
	// reported (ProcessingFeePesewas) has been taken off it too.
	BusinessNetPesewas int64 `json:"businessNetPesewas" bson:"businessNetPesewas"`
	// ProcessingFeePesewas is Paystack's fee on the charge, borne by the
	// seller, recorded when the order is paid (0 when Paystack reported none).
	ProcessingFeePesewas int64 `json:"processingFeePesewas,omitempty" bson:"processingFeePesewas,omitempty"`
	// CancelReason says why an unpaid order was cancelled (e.g. abandoned:
	// no completed payment within 48 hours).
	CancelReason       string `json:"cancelReason,omitempty" bson:"cancelReason,omitempty"`
	PaystackSubaccount string `json:"-" bson:"paystackSubaccount"`
	Status             string `json:"status" bson:"status"`
	Simulated          bool   `json:"simulated,omitempty" bson:"simulated,omitempty"`
	CreatedAt          string `json:"createdAt" bson:"createdAt"`
	PaidAt             string `json:"paidAt,omitempty" bson:"paidAt,omitempty"`
	UpdatedAt          string `json:"updatedAt" bson:"updatedAt"`
	BuyerContactHidden bool   `json:"buyerContactHidden,omitempty" bson:"-"` // response-only: the seller's view dropped the buyer's contact
}

type CommerceOrderRepository interface {
	Insert(ctx context.Context, order CommerceOrder) error
	ByReference(ctx context.Context, reference string) (*CommerceOrder, error)
	ByBuyer(ctx context.Context, buyerID string) ([]CommerceOrder, error)
	ByBusiness(ctx context.Context, listingID string) ([]CommerceOrder, error)
	All(ctx context.Context) ([]CommerceOrder, error)
	// MarkPaid moves a pending order to paid, recording Paystack's processing
	// fee and taking it off the seller's net (P15). It reports whether THIS
	// call made the transition, so once-only side effects run exactly once
	// when a webhook and a redirect confirm the same order at the same time.
	MarkPaid(ctx context.Context, reference, paidAt string, processingFeePesewas int64) (bool, error)
	SetStatus(ctx context.Context, id, listingID, status, updatedAt string) error
	// PendingBetween lists records still pending whose createdAt is in
	// [from, to) (from "" = no lower bound), oldest first, at most limit —
	// the payment reconciliation sweep's work list (C5).
	PendingBetween(ctx context.Context, from, to string, limit int) ([]CommerceOrder, error)
	// ExpirePending closes a record that is STILL pending (status failed, or
	// cancelled for an order) with reason; it reports whether it did.
	ExpirePending(ctx context.Context, reference, reason, at string) (bool, error)
}

type BusinessCoupon struct {
	ID              string `json:"id" bson:"_id"`
	ListingID       string `json:"listingId" bson:"listingId"`
	OwnerType       string `json:"ownerType" bson:"ownerType"`
	FundingSource   string `json:"fundingSource" bson:"fundingSource"`
	Title           string `json:"title,omitempty" bson:"title,omitempty"`
	Code            string `json:"code" bson:"code"`
	Description     string `json:"description,omitempty" bson:"description,omitempty"`
	DiscountType    string `json:"discountType" bson:"discountType"`
	DiscountValue   int64  `json:"discountValue" bson:"discountValue"`
	MinimumPesewas  int64  `json:"minimumPesewas,omitempty" bson:"minimumPesewas,omitempty"`
	MaximumDiscount int64  `json:"maximumDiscountPesewas,omitempty" bson:"maximumDiscountPesewas,omitempty"`
	RedemptionLimit int    `json:"redemptionLimit,omitempty" bson:"redemptionLimit,omitempty"`
	Redemptions     int    `json:"redemptions" bson:"redemptions"`
	StartsAt        string `json:"startsAt,omitempty" bson:"startsAt,omitempty"`
	EndsAt          string `json:"endsAt,omitempty" bson:"endsAt,omitempty"`
	Active          bool   `json:"active" bson:"active"`
	CreatedAt       string `json:"createdAt" bson:"createdAt"`
	UpdatedAt       string `json:"updatedAt" bson:"updatedAt"`
}

type BusinessCouponRepository interface {
	Upsert(ctx context.Context, coupon BusinessCoupon) error
	ByCode(ctx context.Context, listingID, code string) (*BusinessCoupon, error)
	ByBusiness(ctx context.Context, listingID string) ([]BusinessCoupon, error)
	All(ctx context.Context) ([]BusinessCoupon, error)
	// Redeem counts one redemption. It is called once per PAID order, so
	// abandoned checkouts never use up a coupon's redemption limit.
	Redeem(ctx context.Context, id string) error
	Delete(ctx context.Context, id, listingID string) error
}

// AffiliateProgramme is either owned by Oguaa (platform-wide) or by one
// verified business. CommissionBps uses basis points (1000 = 10%).
type AffiliateProgramme struct {
	ID                   string `json:"id" bson:"_id"`
	ListingID            string `json:"listingId,omitempty" bson:"listingId,omitempty"`
	OwnerType            string `json:"ownerType" bson:"ownerType"`
	Name                 string `json:"name" bson:"name"`
	Description          string `json:"description,omitempty" bson:"description,omitempty"`
	CommissionBps        int64  `json:"commissionBps" bson:"commissionBps"`
	FundingSource        string `json:"fundingSource" bson:"fundingSource"`
	CookieWindowDays     int    `json:"cookieWindowDays" bson:"cookieWindowDays"`
	HoldDays             int    `json:"holdDays" bson:"holdDays"`
	MinimumPayoutPesewas int64  `json:"minimumPayoutPesewas" bson:"minimumPayoutPesewas"`
	PayoutMode           string `json:"payoutMode" bson:"payoutMode"`
	Active               bool   `json:"active" bson:"active"`
	CreatedAt            string `json:"createdAt" bson:"createdAt"`
	UpdatedAt            string `json:"updatedAt" bson:"updatedAt"`
}

type Affiliate struct {
	ID                string   `json:"id" bson:"_id"`
	ProgrammeID       string   `json:"programmeId" bson:"programmeId"`
	ListingID         string   `json:"listingId,omitempty" bson:"listingId,omitempty"`
	Code              string   `json:"code" bson:"code"`
	Name              string   `json:"name" bson:"name"`
	Email             string   `json:"email" bson:"email"`
	PayoutPhone       string   `json:"payoutPhone,omitempty" bson:"payoutPhone,omitempty"`
	PromotionChannels []string `json:"promotionChannels,omitempty" bson:"promotionChannels,omitempty"`
	AudienceSummary   string   `json:"audienceSummary,omitempty" bson:"audienceSummary,omitempty"`
	Status            string   `json:"status,omitempty" bson:"status,omitempty"`
	Active            bool     `json:"active" bson:"active"`
	CreatedAt         string   `json:"createdAt" bson:"createdAt"`
	UpdatedAt         string   `json:"updatedAt" bson:"updatedAt"`
}

type AffiliateConversion struct {
	ID                string `json:"id" bson:"_id"`
	OrderID           string `json:"orderId" bson:"orderId"`
	OrderReference    string `json:"orderReference" bson:"orderReference"`
	AffiliateID       string `json:"affiliateId" bson:"affiliateId"`
	ProgrammeID       string `json:"programmeId" bson:"programmeId"`
	ListingID         string `json:"listingId" bson:"listingId"`
	AffiliateCode     string `json:"affiliateCode" bson:"affiliateCode"`
	GrossPesewas      int64  `json:"grossPesewas" bson:"grossPesewas"`
	CommissionPesewas int64  `json:"commissionPesewas" bson:"commissionPesewas"`
	FundingSource     string `json:"fundingSource" bson:"fundingSource"`
	Status            string `json:"status" bson:"status"`
	HoldUntil         string `json:"holdUntil,omitempty" bson:"holdUntil,omitempty"`
	CreatedAt         string `json:"createdAt" bson:"createdAt"`
	UpdatedAt         string `json:"updatedAt" bson:"updatedAt"`
}

type AffiliateRepository interface {
	// SaveProgramme upserts a programme scoped to its listing: an existing
	// programme with the same id but another listingId is never replaced.
	SaveProgramme(context.Context, AffiliateProgramme) error
	Programmes(context.Context, string) ([]AffiliateProgramme, error)
	Programme(context.Context, string) (*AffiliateProgramme, error)
	// SaveAffiliate upserts an affiliate scoped to its listing: an existing
	// affiliate with the same id but another listingId is never replaced.
	SaveAffiliate(context.Context, Affiliate) error
	// AffiliateByID returns one affiliate (or NotFound).
	AffiliateByID(ctx context.Context, id string) (*Affiliate, error)
	// Affiliates lists the affiliates of one listing ("*" = Oguaa's own),
	// optionally narrowed to one programme. listingID is always required.
	Affiliates(ctx context.Context, listingID, programmeID string) ([]Affiliate, error)
	AffiliateByCode(context.Context, string, string) (*Affiliate, error)
	// RecordConversion stores the conversion of a PAID order (idempotent on
	// its id, and it upgrades a legacy "reserved" row for the same order).
	RecordConversion(context.Context, AffiliateConversion) error
	Conversions(context.Context, string) ([]AffiliateConversion, error)
	SetConversionStatus(context.Context, string, string, string) error
}
