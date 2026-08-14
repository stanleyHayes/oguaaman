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
	GhanaPostGPS        string   `json:"ghanaPostGPS" bson:"ghanaPostGPS"`
	Documents           []string `json:"documents" bson:"documents"`
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
	SubtotalPesewas            int64       `json:"subtotalPesewas" bson:"subtotalPesewas"`
	DiscountPesewas            int64       `json:"discountPesewas" bson:"discountPesewas"`
	AmountPesewas              int64       `json:"amountPesewas" bson:"amountPesewas"`
	PlatformFeePesewas         int64       `json:"platformFeePesewas" bson:"platformFeePesewas"`
	BusinessNetPesewas         int64       `json:"businessNetPesewas" bson:"businessNetPesewas"`
	PaystackSubaccount         string      `json:"-" bson:"paystackSubaccount"`
	Status                     string      `json:"status" bson:"status"`
	Simulated                  bool        `json:"simulated,omitempty" bson:"simulated,omitempty"`
	CreatedAt                  string      `json:"createdAt" bson:"createdAt"`
	PaidAt                     string      `json:"paidAt,omitempty" bson:"paidAt,omitempty"`
	UpdatedAt                  string      `json:"updatedAt" bson:"updatedAt"`
}

type CommerceOrderRepository interface {
	Insert(ctx context.Context, order CommerceOrder) error
	ByReference(ctx context.Context, reference string) (*CommerceOrder, error)
	ByBuyer(ctx context.Context, buyerID string) ([]CommerceOrder, error)
	ByBusiness(ctx context.Context, listingID string) ([]CommerceOrder, error)
	All(ctx context.Context) ([]CommerceOrder, error)
	MarkPaid(ctx context.Context, reference, paidAt string) error
	SetStatus(ctx context.Context, id, listingID, status, updatedAt string) error
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
	Reserve(ctx context.Context, id string) error
	Release(ctx context.Context, id string) error
	Delete(ctx context.Context, id, listingID string) error
}

// AffiliateProgramme is either owned by Oguaa (platform-wide) or by one
// verified business. CommissionBps uses basis points (1000 = 10%).
type AffiliateProgramme struct {
	ID            string `json:"id" bson:"_id"`
	ListingID     string `json:"listingId,omitempty" bson:"listingId,omitempty"`
	OwnerType     string `json:"ownerType" bson:"ownerType"`
	Name          string `json:"name" bson:"name"`
	CommissionBps int64  `json:"commissionBps" bson:"commissionBps"`
	FundingSource string `json:"fundingSource" bson:"fundingSource"`
	HoldDays      int    `json:"holdDays" bson:"holdDays"`
	Active        bool   `json:"active" bson:"active"`
	CreatedAt     string `json:"createdAt" bson:"createdAt"`
	UpdatedAt     string `json:"updatedAt" bson:"updatedAt"`
}

type Affiliate struct {
	ID          string `json:"id" bson:"_id"`
	ProgrammeID string `json:"programmeId" bson:"programmeId"`
	ListingID   string `json:"listingId,omitempty" bson:"listingId,omitempty"`
	Code        string `json:"code" bson:"code"`
	Name        string `json:"name" bson:"name"`
	Email       string `json:"email" bson:"email"`
	PayoutPhone string `json:"payoutPhone,omitempty" bson:"payoutPhone,omitempty"`
	Active      bool   `json:"active" bson:"active"`
	CreatedAt   string `json:"createdAt" bson:"createdAt"`
	UpdatedAt   string `json:"updatedAt" bson:"updatedAt"`
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
	SaveProgramme(context.Context, AffiliateProgramme) error
	Programmes(context.Context, string) ([]AffiliateProgramme, error)
	Programme(context.Context, string) (*AffiliateProgramme, error)
	SaveAffiliate(context.Context, Affiliate) error
	Affiliates(context.Context, string) ([]Affiliate, error)
	AffiliateByCode(context.Context, string, string) (*Affiliate, error)
	ReserveConversion(context.Context, AffiliateConversion) error
	Convert(context.Context, string, string, string) error
	Conversions(context.Context, string) ([]AffiliateConversion, error)
	SetConversionStatus(context.Context, string, string, string) error
}
