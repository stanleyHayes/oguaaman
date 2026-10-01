package service

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/oguaa/backend/internal/domain"
)

var ghanaCardPattern = regexp.MustCompile(`^GHA-[0-9]{9}-[0-9]$`)
var couponCodePattern = regexp.MustCompile(`^[A-Z0-9][A-Z0-9_-]{2,19}$`)

// privateDocRefPattern matches a reference returned by POST
// /api/uploads/private ("private:<id>"). Identity and KYC evidence must be
// stored this way so it is never reachable by a public URL.
var privateDocRefPattern = regexp.MustCompile(`^private:[A-Za-z0-9._-]{1,128}$`)

// errAffiliatesUnavailable — the service was built without an affiliate store.
var errAffiliatesUnavailable = errors.New("affiliate service unavailable")

const (
	msgStewardAccessRequired = "steward access required"
	// msgIDNeedsPrivateUpload is the contract-K8 refusal for an ID or KYC
	// document supplied as a new public URL instead of a private upload ref.
	msgIDNeedsPrivateUpload = "Upload your ID with the private document uploader."
	msgProgrammeNotOwned    = "programme does not belong to this business"
	msgProductUnavailable   = "a selected product is unavailable"

	affiliateScopePlatform = "*"
	// minOrderPesewas is the smallest amount Paystack will charge (GH₵ 1).
	minOrderPesewas int64 = 100
	// maxCheckoutLines bounds one basket.
	maxCheckoutLines = 50
	// maxLineQuantity bounds one basket line.
	maxLineQuantity = 20
	// maxFixedCouponPesewas is a guardrail on fixed-amount coupon values.
	maxFixedCouponPesewas int64 = 100_000_000
	// sellerContactRetention is how long after fulfilment a seller can still
	// see the buyer's contact details (data minimisation, Act 843).
	sellerContactRetention = 30 * 24 * time.Hour
)

type CommerceService struct {
	listings      domain.ListingRepository
	verifications domain.BusinessVerificationRepository
	orders        domain.CommerceOrderRepository
	coupons       domain.BusinessCouponRepository
	affiliates    domain.AffiliateRepository
	paystack      CommercePaystack
	portal        string
	feePercent    int
	banks         *BankDirectory // nil when the payment client can't list banks
}

func NewCommerceService(l domain.ListingRepository, v domain.BusinessVerificationRepository, o domain.CommerceOrderRepository, c domain.BusinessCouponRepository, a domain.AffiliateRepository, p CommercePaystack, portal string, fee int) *CommerceService {
	if fee < 1 {
		fee = 5
	}
	if fee > 50 {
		fee = 50
	}
	s := &CommerceService{listings: l, verifications: v, orders: o, coupons: c, affiliates: a, paystack: p, portal: strings.TrimRight(portal, "/"), feePercent: fee}
	if lister, ok := p.(BankLister); ok {
		s.banks = NewBankDirectory(lister)
	}
	return s
}

// msgChooseSettlementBank refuses a settlement code that is not on Paystack's
// GHS bank and Mobile Money list (C2).
const msgChooseSettlementBank = "Choose your bank or Mobile Money network from the list."

// SettlementBanks lists Paystack's GHS banks ("bank"), Mobile Money networks
// ("mobile_money") or both (""), for the seller's settlement picker (C2).
func (s *CommerceService) SettlementBanks(ctx context.Context, kind string) ([]SettlementBank, error) {
	if s.banks == nil {
		return nil, ErrPaymentsUnavailable
	}
	return s.banks.OfKind(ctx, kind)
}

// checkSettlementBank refuses a settlement code that is not on Paystack's
// list. When the list can't be loaded the code is let through: the curator's
// review creates the subaccount, and Paystack refuses an unknown code there.
func (s *CommerceService) checkSettlementBank(ctx context.Context, code string) error {
	if s.banks == nil {
		return nil
	}
	if known, ok := s.banks.Known(ctx, code); ok && !known {
		return commerceInvalid(msgChooseSettlementBank)
	}
	return nil
}

// commerceInvalid is a business-rule refusal the HTTP layer answers with 400.
func commerceInvalid(msg string) error { return &domain.ValidationError{Message: msg} }

func isCommerceNotFound(err error) bool {
	var nf *domain.NotFoundError
	return errors.As(err, &nf)
}

// isPrivateDocRef reports whether v is a private upload reference.
func isPrivateDocRef(v string) bool { return privateDocRefPattern.MatchString(v) }

// checkPrivateDocs enforces contract K8 on identity/KYC document fields: every
// value must be a private upload ref, except a value already on record
// (earlier https uploads stay readable and may be resubmitted unchanged).
func checkPrivateDocs(docs, onRecord []string) error {
	for _, doc := range docs {
		if isPrivateDocRef(doc) || slices.Contains(onRecord, doc) {
			continue
		}
		return commerceInvalid(msgIDNeedsPrivateUpload)
	}
	return nil
}

type BusinessVerificationInput struct {
	LegalName           string   `json:"legalName"`
	RegistrationNumber  string   `json:"registrationNumber"`
	TaxIdentificationNo string   `json:"taxIdentificationNo"`
	GhanaCardNumber     string   `json:"ghanaCardNumber"`
	BusinessPhone       string   `json:"businessPhone"`
	BusinessEmail       string   `json:"businessEmail"`
	GhanaPostGPS        string   `json:"ghanaPostGPS"`
	Documents           []string `json:"documents"`
	SettlementBankCode  string   `json:"settlementBankCode"`
	SettlementAccountNo string   `json:"settlementAccountNo"`
	SettlementName      string   `json:"settlementName"`
}

func (in *BusinessVerificationInput) normalise() {
	in.LegalName = strings.TrimSpace(in.LegalName)
	in.RegistrationNumber = strings.ToUpper(strings.TrimSpace(in.RegistrationNumber))
	in.TaxIdentificationNo = strings.TrimSpace(in.TaxIdentificationNo)
	in.GhanaCardNumber = strings.ToUpper(strings.TrimSpace(in.GhanaCardNumber))
	in.BusinessPhone = strings.TrimSpace(in.BusinessPhone)
	in.BusinessEmail = strings.ToLower(strings.TrimSpace(in.BusinessEmail))
	in.GhanaPostGPS = strings.ToUpper(strings.TrimSpace(in.GhanaPostGPS))
	in.SettlementBankCode = strings.TrimSpace(in.SettlementBankCode)
	in.SettlementAccountNo = strings.TrimSpace(in.SettlementAccountNo)
	in.SettlementName = strings.TrimSpace(in.SettlementName)
	docs := make([]string, 0, len(in.Documents))
	for _, d := range in.Documents {
		if d = strings.TrimSpace(d); d != "" {
			docs = append(docs, d)
		}
	}
	in.Documents = docs
}

func (in BusinessVerificationInput) validate() error {
	identityOK := in.LegalName != "" && len(in.LegalName) <= 200 && in.RegistrationNumber != "" && ghanaCardPattern.MatchString(in.GhanaCardNumber)
	contactOK := in.BusinessPhone != "" && in.GhanaPostGPS != ""
	settlementOK := in.SettlementBankCode != "" && len(in.SettlementAccountNo) >= 6 && in.SettlementName != ""
	if !identityOK || !contactOK || !settlementOK || len(in.Documents) < 3 {
		return commerceInvalid("legal identity, registration, Ghana Card, location, three verification documents and settlement account are required")
	}
	if in.BusinessEmail != "" && (len(in.BusinessEmail) > 200 || !strings.Contains(in.BusinessEmail, "@")) {
		return commerceInvalid("enter a valid business email or leave it blank")
	}
	return nil
}

func (s *CommerceService) SubmitVerification(ctx context.Context, actor *domain.Member, listingID string, in BusinessVerificationInput) (*domain.BusinessVerification, error) {
	if actor == nil {
		return nil, &domain.ForbiddenError{Reason: "sign in to verify a business"}
	}
	l, err := s.listings.GetByID(ctx, listingID)
	if err != nil {
		return nil, err
	}
	if l.Type != domain.TypeBusiness || l.OwnerID != actor.ID {
		return nil, &domain.ForbiddenError{Reason: "only the business owner can submit verification"}
	}
	in.normalise()
	if err = in.validate(); err != nil {
		return nil, err
	}
	if err = s.checkSettlementBank(ctx, in.SettlementBankCode); err != nil {
		return nil, err
	}
	old, oldErr := s.verifications.ByListing(ctx, l.ID)
	var onRecord []string
	if oldErr == nil {
		onRecord = old.Documents
	}
	if err = checkPrivateDocs(in.Documents, onRecord); err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	v := domain.BusinessVerification{ID: "bvr-" + l.ID, ListingID: l.ID, ListingSlug: l.Slug, OwnerID: actor.ID, LegalName: in.LegalName, RegistrationNumber: in.RegistrationNumber, TaxIdentificationNo: in.TaxIdentificationNo, GhanaCardNumber: in.GhanaCardNumber, BusinessPhone: in.BusinessPhone, BusinessEmail: in.BusinessEmail, GhanaPostGPS: in.GhanaPostGPS, Documents: in.Documents, SettlementBankCode: in.SettlementBankCode, SettlementAccountNo: in.SettlementAccountNo, SettlementName: in.SettlementName, Status: domain.BusinessVerificationPending, SubmittedAt: now, CreatedAt: now, UpdatedAt: now}
	if oldErr == nil {
		v.ID = old.ID
		v.CreatedAt = old.CreatedAt
	}
	if err := s.verifications.Upsert(ctx, v); err != nil {
		return nil, err
	}
	return &v, nil
}
func (s *CommerceService) Verification(ctx context.Context, actor *domain.Member, listingID string) (*domain.BusinessVerification, error) {
	v, err := s.verifications.ByListing(ctx, listingID)
	if err != nil {
		return nil, err
	}
	if actor == nil || (actor.ID != v.OwnerID && actor.Role != domain.RoleCurator && actor.Role != domain.RoleSteward) {
		return nil, &domain.ForbiddenError{Reason: "verification is private"}
	}
	return v, nil
}

// PublicSeller is the verified legal identity of a seller that buyers see on
// product pages (contract K19). Only public-safe KYC fields: never the Ghana
// Card number, tax id, settlement account or documents.
type PublicSeller struct {
	LegalName          string `json:"legalName"`
	Location           string `json:"location"`
	ContactEmail       string `json:"contactEmail,omitempty"`
	ContactPhone       string `json:"contactPhone,omitempty"`
	RegistrationNumber string `json:"registrationNumber,omitempty"`
	VerifiedAt         string `json:"verifiedAt,omitempty"`
}

// CommerceStatus is the GET /api/businesses/{slug}/commerce-status payload:
// whether online checkout is open, and who the buyer contracts with.
type CommerceStatus struct {
	Enabled bool          `json:"enabled"`
	Seller  *PublicSeller `json:"seller,omitempty"`
}

// Status reports whether an approved business can take online orders and,
// once its KYC is verified, its public seller identity.
func (s *CommerceService) Status(ctx context.Context, businessSlug string) CommerceStatus {
	l, err := s.listings.GetBySlug(ctx, domain.TypeBusiness, businessSlug)
	if err != nil || l.Status != domain.StatusApproved {
		return CommerceStatus{}
	}
	v, err := s.verifications.ByListing(ctx, l.ID)
	if err != nil || v.Status != domain.BusinessVerificationVerified {
		return CommerceStatus{}
	}
	return CommerceStatus{
		Enabled: s.subaccountUsable(v.PaystackSubaccount),
		Seller: &PublicSeller{
			LegalName:          v.LegalName,
			Location:           v.GhanaPostGPS,
			ContactEmail:       v.BusinessEmail,
			ContactPhone:       v.BusinessPhone,
			RegistrationNumber: v.RegistrationNumber,
			VerifiedAt:         v.ReviewedAt,
		},
	}
}

// CommerceEnabled reports whether an approved business can take online orders.
func (s *CommerceService) CommerceEnabled(ctx context.Context, businessSlug string) bool {
	return s.Status(ctx, businessSlug).Enabled
}
func (s *CommerceService) AllVerifications(ctx context.Context) ([]domain.BusinessVerification, error) {
	return s.verifications.All(ctx)
}
func (s *CommerceService) ReviewVerification(ctx context.Context, reviewer *domain.Member, listingID, status, note string) (*domain.BusinessVerification, error) {
	if reviewer == nil || (reviewer.Role != domain.RoleCurator && reviewer.Role != domain.RoleSteward) {
		return nil, &domain.ForbiddenError{Reason: "curator access required"}
	}
	v, err := s.verifications.ByListing(ctx, listingID)
	if err != nil {
		return nil, err
	}
	if status != domain.BusinessVerificationVerified && status != domain.BusinessVerificationRejected && status != domain.BusinessVerificationRevoked {
		return nil, commerceInvalid("invalid verification decision")
	}
	sub := ""
	if status == domain.BusinessVerificationVerified {
		sub, err = s.subaccountFor(ctx, v)
		if err != nil {
			return nil, err
		}
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if err = s.verifications.Review(ctx, listingID, status, strings.TrimSpace(note), reviewer.ID, now, sub); err != nil {
		return nil, err
	}
	return s.verifications.ByListing(ctx, listingID)
}

// subaccountFor returns the seller's Paystack subaccount, creating it only
// when the verification has none (P19: re-verifying never creates a
// duplicate). A resubmitted KYC pack starts without one, so changed
// settlement details always get a new subaccount. A simulated code is
// replaced once a real Paystack key is in use.
func (s *CommerceService) subaccountFor(ctx context.Context, v *domain.BusinessVerification) (string, error) {
	if v.PaystackSubaccount != "" && (s.paystack.Simulated() || !IsSimulatedSubaccount(v.PaystackSubaccount)) {
		return v.PaystackSubaccount, nil
	}
	return s.paystack.CreateSubaccount(ctx, v.LegalName, v.SettlementBankCode, v.SettlementAccountNo)
}

// subaccountUsable reports whether checkout can split to code: a simulated
// code only works with the simulation (P01: run cmd/livesubaccounts).
func (s *CommerceService) subaccountUsable(code string) bool {
	return code != "" && (s.paystack.Simulated() || !IsSimulatedSubaccount(code))
}

// IsSimulatedSubaccount reports a subaccount code made by SimulatedPaystack.
func IsSimulatedSubaccount(code string) bool {
	return strings.HasPrefix(code, simulatedSubaccountPrefix)
}

type CheckoutLineInput struct {
	ProductID string `json:"productId"`
	Quantity  int    `json:"quantity"`
}
type CheckoutInput struct {
	BuyerName       string              `json:"buyerName"`
	BuyerEmail      string              `json:"buyerEmail"`
	BuyerPhone      string              `json:"buyerPhone"`
	Fulfilment      string              `json:"fulfilment"`
	DeliveryAddress string              `json:"deliveryAddress"`
	Note            string              `json:"note"`
	CouponCode      string              `json:"couponCode"`
	AffiliateCode   string              `json:"affiliateCode"`
	Lines           []CheckoutLineInput `json:"lines"`
}

func (in *CheckoutInput) normalise() {
	in.BuyerName = strings.TrimSpace(in.BuyerName)
	in.BuyerEmail = strings.TrimSpace(in.BuyerEmail)
	in.BuyerPhone = strings.TrimSpace(in.BuyerPhone)
	in.DeliveryAddress = strings.TrimSpace(in.DeliveryAddress)
	in.Note = strings.TrimSpace(in.Note)
	in.CouponCode = strings.ToUpper(strings.TrimSpace(in.CouponCode))
	in.AffiliateCode = strings.ToUpper(strings.TrimSpace(in.AffiliateCode))
}

// validEmail reports whether v is a bare email address Paystack will accept
// (P23): a malformed one would fail the checkout only after the order exists.
func validEmail(v string) bool {
	if len(v) > 254 {
		return false
	}
	addr, err := mail.ParseAddress(v)
	return err == nil && addr.Address == v
}

func (in CheckoutInput) validate() error {
	if in.BuyerName == "" || in.BuyerEmail == "" || in.BuyerPhone == "" || len(in.Lines) == 0 {
		return commerceInvalid("buyer contact and at least one product are required")
	}
	if !validEmail(in.BuyerEmail) {
		return commerceInvalid("enter a valid email address for your receipt")
	}
	if len(in.Lines) > maxCheckoutLines {
		return commerceInvalid(fmt.Sprintf("an order can hold at most %d products", maxCheckoutLines))
	}
	if in.Fulfilment != "pickup" && in.Fulfilment != "delivery" {
		return commerceInvalid("choose pickup or delivery")
	}
	if in.Fulfilment == "delivery" && in.DeliveryAddress == "" {
		return commerceInvalid("delivery address is required")
	}
	return nil
}

// sellableKind reports whether a storefront item may go through checkout:
// physical goods and in-person services only (legacy items with no kind are
// physical). Digital goods can't be sold through Paystack/Stripe in the apps.
func sellableKind(kind string) bool {
	return kind == "" || kind == domain.StoreItemPhysical || kind == domain.StoreItemService
}

// checkoutLines prices the basket from the business's own catalogue — never
// from client-sent prices. A duplicated product id resolves to the FIRST item,
// the same one the product page shows.
func checkoutLines(catalogue []domain.StoreItem, wanted []CheckoutLineInput) ([]domain.OrderLine, int64, error) {
	products := make(map[string]domain.StoreItem, len(catalogue))
	for _, p := range catalogue {
		if _, dup := products[p.ID]; !dup {
			products[p.ID] = p
		}
	}
	lines := make([]domain.OrderLine, 0, len(wanted))
	var subtotal int64
	for _, want := range wanted {
		p, ok := products[want.ProductID]
		if !ok || !p.Available || p.PricePesewas <= 0 || !sellableKind(p.Kind) || want.Quantity < 1 || want.Quantity > maxLineQuantity {
			return nil, 0, commerceInvalid(msgProductUnavailable)
		}
		lineTotal := p.PricePesewas * int64(want.Quantity)
		subtotal += lineTotal
		lines = append(lines, domain.OrderLine{ProductID: p.ID, Name: p.Name, Quantity: want.Quantity, UnitPesewas: p.PricePesewas, SubtotalPesewas: lineTotal})
	}
	if subtotal < minOrderPesewas {
		return nil, 0, commerceInvalid("order total is too low")
	}
	return lines, subtotal, nil
}

// orderPricing is the money split of one checkout, in pesewas: what the buyer
// pays (amount) and Oguaa's share of it (fee). The business receives the rest.
type orderPricing struct {
	subtotal, discount, amount, fee int64
	coupon                          *domain.BusinessCoupon
}

// feeOn is Oguaa's platform fee on a base amount (at least 1 pesewa).
func (s *CommerceService) feeOn(base int64) int64 {
	fee := base * int64(s.feePercent) / 100
	if fee < 1 {
		fee = 1
	}
	return fee
}

// priceOrder applies the coupon and computes the platform fee. Business-funded
// coupons are charged the fee on the pre-discount subtotal; Oguaa-funded
// promotions come out of Oguaa's own fee. Either way the business must be
// left a positive share, or Paystack would be asked to split more than the
// charge.
func (s *CommerceService) priceOrder(ctx context.Context, listingID, couponCode string, subtotal int64) (orderPricing, error) {
	discount, coupon, err := s.discount(ctx, listingID, couponCode, subtotal)
	if err != nil {
		return orderPricing{}, err
	}
	p := orderPricing{subtotal: subtotal, discount: discount, amount: subtotal - discount, coupon: coupon}
	if p.amount < minOrderPesewas {
		return orderPricing{}, commerceInvalid("coupon leaves an invalid payment amount")
	}
	switch {
	case coupon != nil && coupon.FundingSource == domain.PromotionFundingPlatform:
		originalFee := s.feeOn(subtotal)
		if discount >= originalFee {
			return orderPricing{}, commerceInvalid("this promotion needs a larger basket")
		}
		p.fee = originalFee - discount
	case coupon != nil:
		p.fee = s.feeOn(subtotal)
	default:
		p.fee = s.feeOn(p.amount)
	}
	if p.fee >= p.amount {
		return orderPricing{}, commerceInvalid("this coupon is larger than the order can carry")
	}
	return p, nil
}

// affiliateAttribution is an eligible affiliate credit for one order.
type affiliateAttribution struct {
	code       string
	affiliate  *domain.Affiliate
	programme  *domain.AffiliateProgramme
	commission int64
}

// affiliateEligible screens the affiliate record itself: approved, and never
// the buyer crediting themselves.
func affiliateEligible(a *domain.Affiliate, buyerEmail string) bool {
	if !a.Active || (a.Status != "" && a.Status != "approved") {
		return false
	}
	return !strings.EqualFold(a.Email, buyerEmail)
}

// commissionBudget caps a commission so the split stays valid: Oguaa-funded
// commissions come out of (and must stay below) Oguaa's fee; business-funded
// ones must leave the business a positive net.
func commissionBudget(funding string, p orderPricing) int64 {
	if funding == domain.PromotionFundingPlatform {
		return p.fee - 1
	}
	return p.amount - p.fee - 1
}

// attributeAffiliate resolves the affiliate code sent with a checkout. It is
// best-effort: a stale, foreign, paused or self-referral code is dropped and
// the order proceeds without commission — attribution must never block a sale
// (the web app remembers the last ?aff= code for 30 days, for every shop).
func (s *CommerceService) attributeAffiliate(ctx context.Context, l *domain.Listing, code, buyerEmail string, p orderPricing) *affiliateAttribution {
	if code == "" || s.affiliates == nil {
		return nil
	}
	aff, err := s.affiliates.AffiliateByCode(ctx, l.ID, code)
	if err != nil || !affiliateEligible(aff, buyerEmail) {
		return nil
	}
	programme, err := s.affiliates.Programme(ctx, aff.ProgrammeID)
	if err != nil || !programme.Active || programme.ListingID != aff.ListingID {
		return nil
	}
	if programme.ListingID != l.ID && programme.ListingID != affiliateScopePlatform {
		return nil
	}
	commission := min(p.amount*programme.CommissionBps/10_000, commissionBudget(programme.FundingSource, p))
	if commission < 1 {
		return nil
	}
	return &affiliateAttribution{code: code, affiliate: aff, programme: programme, commission: commission}
}

// apply records the attribution on the order and returns the extra Paystack
// transaction charge it adds (a business-funded commission is withheld from
// the business's share; an Oguaa-funded one is paid from Oguaa's fee).
func (a *affiliateAttribution) apply(o *domain.CommerceOrder) int64 {
	o.AffiliateCode, o.AffiliateID, o.AffiliateProgrammeID, o.AffiliateCommissionPesewas = a.code, a.affiliate.ID, a.programme.ID, a.commission
	o.AffiliateFunding, o.AffiliateHoldDays = a.programme.FundingSource, a.programme.HoldDays
	if a.programme.FundingSource == domain.PromotionFundingPlatform {
		return 0
	}
	o.BusinessNetPesewas -= a.commission
	return a.commission
}

// checkoutSeller loads an approved business that is verified for payments.
func (s *CommerceService) checkoutSeller(ctx context.Context, businessSlug string) (*domain.Listing, *domain.BusinessVerification, error) {
	l, err := s.listings.GetBySlug(ctx, domain.TypeBusiness, businessSlug)
	if err != nil {
		return nil, nil, err
	}
	if l.Status != domain.StatusApproved {
		return nil, nil, &domain.NotFoundError{Entity: "business"}
	}
	v, err := s.verifications.ByListing(ctx, l.ID)
	if err != nil || v.Status != domain.BusinessVerificationVerified || !s.subaccountUsable(v.PaystackSubaccount) {
		return nil, nil, &domain.ForbiddenError{Reason: "this business is not verified for online payments"}
	}
	return l, v, nil
}

func (s *CommerceService) StartOrder(ctx context.Context, businessSlug string, buyer *domain.Member, in CheckoutInput) (*domain.CommerceOrder, string, string, error) {
	l, v, err := s.checkoutSeller(ctx, businessSlug)
	if err != nil {
		return nil, "", "", err
	}
	in.normalise()
	if err = in.validate(); err != nil {
		return nil, "", "", err
	}
	lines, subtotal, err := checkoutLines(l.Products, in.Lines)
	if err != nil {
		return nil, "", "", err
	}
	pricing, err := s.priceOrder(ctx, l.ID, in.CouponCode, subtotal)
	if err != nil {
		return nil, "", "", err
	}
	now := time.Now().UTC()
	ref := newReference(RefPrefixOrder, l.Slug, strconv.FormatInt(now.UnixNano(), 10))
	buyerID := ""
	if buyer != nil {
		buyerID = buyer.ID
	}
	o := domain.CommerceOrder{ID: "o" + ref, Reference: ref, ListingID: l.ID, ListingSlug: l.Slug, BusinessName: l.Title, BuyerID: buyerID, BuyerName: in.BuyerName, BuyerEmail: in.BuyerEmail, BuyerPhone: in.BuyerPhone, Fulfilment: in.Fulfilment, DeliveryAddress: in.DeliveryAddress, Note: in.Note, Lines: lines, SubtotalPesewas: pricing.subtotal, DiscountPesewas: pricing.discount, AmountPesewas: pricing.amount, PlatformFeePesewas: pricing.fee, BusinessNetPesewas: pricing.amount - pricing.fee, PaystackSubaccount: v.PaystackSubaccount, Status: domain.OrderPending, Simulated: s.paystack.Simulated(), CreatedAt: now.Format(time.RFC3339), UpdatedAt: now.Format(time.RFC3339)}
	if pricing.coupon != nil {
		o.CouponCode = in.CouponCode
		o.PromotionID = pricing.coupon.ID
		o.PromotionFunding = pricing.coupon.FundingSource
	}
	transactionCharge := pricing.fee
	if att := s.attributeAffiliate(ctx, l, in.AffiliateCode, in.BuyerEmail, pricing); att != nil {
		transactionCharge += att.apply(&o)
	}
	if err = s.orders.Insert(ctx, o); err != nil {
		return nil, "", "", err
	}
	callback := fmt.Sprintf("%s/business/%s/order?reference=%s", s.portal, l.Slug, url.QueryEscape(ref))
	auth, access, err := s.paystack.InitializeSplit(ctx, o.BuyerEmail, o.AmountPesewas, "GHS", ref, callback, v.PaystackSubaccount, transactionCharge)
	if err != nil {
		// No Paystack transaction exists, so this order can never be paid.
		_ = s.orders.SetStatus(ctx, o.ID, l.ID, domain.OrderCancelled, time.Now().UTC().Format(time.RFC3339))
		return nil, "", "", err
	}
	return &o, auth, access, nil
}

// couponLive reports whether a coupon applies to this basket right now.
func couponLive(c *domain.BusinessCoupon, subtotal int64, now time.Time) bool {
	if !c.Active || subtotal < c.MinimumPesewas {
		return false
	}
	if c.StartsAt != "" && parseCommerceTime(c.StartsAt).After(now) {
		return false
	}
	return c.EndsAt == "" || parseCommerceTime(c.EndsAt).After(now)
}

// discount prices a coupon for a basket. The redemption limit is checked
// here and counted only when the order is paid (ConfirmOrder), so unpaid
// checkouts never use a coupon up. A missing or zero limit is unlimited.
func (s *CommerceService) discount(ctx context.Context, lid, code string, subtotal int64) (int64, *domain.BusinessCoupon, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		return 0, nil, nil
	}
	c, err := s.coupons.ByCode(ctx, lid, code)
	if err != nil {
		return 0, nil, &domain.ForbiddenError{Reason: "coupon is invalid"}
	}
	if !couponLive(c, subtotal, time.Now().UTC()) {
		return 0, nil, &domain.ForbiddenError{Reason: "coupon is not active"}
	}
	if c.RedemptionLimit > 0 && c.Redemptions >= c.RedemptionLimit {
		return 0, nil, &domain.ForbiddenError{Reason: "coupon is no longer available"}
	}
	var d int64
	if c.DiscountType == domain.CouponPercent {
		d = subtotal * c.DiscountValue / 100
	} else {
		d = c.DiscountValue
	}
	if c.MaximumDiscount > 0 && d > c.MaximumDiscount {
		d = c.MaximumDiscount
	}
	if d <= 0 || d >= subtotal {
		return 0, nil, &domain.ForbiddenError{Reason: "coupon cannot be applied"}
	}
	return d, c, nil
}
func parseCommerceTime(v string) time.Time { t, _ := time.Parse(time.RFC3339, v); return t }

func (s *CommerceService) ConfirmOrder(ctx context.Context, ref string) (*domain.CommerceOrder, error) {
	o, err := s.orders.ByReference(ctx, ref)
	if err != nil {
		return nil, err
	}
	abandoned := o.Status == domain.OrderCancelled && o.CancelReason == domain.AbandonedPaymentReason
	if o.Status != domain.OrderPending && !abandoned {
		return o, nil
	}
	check, err := verifiedCharge(ctx, s.paystack, ref, o.AmountPesewas, nil)
	if err != nil {
		if errors.Is(err, ErrPaymentNotCompleted) {
			if abandoned {
				return o, nil // still unpaid: it stays closed
			}
			return nil, commerceInvalid("payment could not be verified")
		}
		return nil, err // still processing, or Paystack unreachable: the order stays as it is
	}
	now := time.Now().UTC()
	won, err := s.orders.MarkPaid(ctx, ref, now.Format(time.RFC3339), sellerBorneFee(check.FeesPesewas, o.BusinessNetPesewas))
	if err != nil {
		return nil, err
	}
	if won {
		s.settlePaidOrder(ctx, o, now)
	}
	return s.orders.ByReference(ctx, ref)
}

// sellerBorneFee is the part of Paystack's processing fee recorded against
// the seller's share (bearer=subaccount, P15), never more than that share.
func sellerBorneFee(fee, businessNet int64) int64 {
	return max(0, min(fee, businessNet))
}

// settlePaidOrder runs the once-only effects of a newly paid order: the
// coupon redemption is counted and the affiliate conversion recorded (held
// for the programme's hold period before it becomes payable).
func (s *CommerceService) settlePaidOrder(ctx context.Context, o *domain.CommerceOrder, now time.Time) {
	at := now.Format(time.RFC3339)
	if o.PromotionID != "" {
		_ = s.coupons.Redeem(ctx, o.PromotionID)
	}
	if o.AffiliateID == "" || s.affiliates == nil {
		return
	}
	_ = s.affiliates.RecordConversion(ctx, domain.AffiliateConversion{
		ID: "afc-" + o.Reference, OrderID: o.ID, OrderReference: o.Reference,
		AffiliateID: o.AffiliateID, ProgrammeID: o.AffiliateProgrammeID, ListingID: o.ListingID,
		AffiliateCode: o.AffiliateCode, GrossPesewas: o.AmountPesewas, CommissionPesewas: o.AffiliateCommissionPesewas,
		FundingSource: o.AffiliateFunding, Status: domain.AffiliateConverted,
		HoldUntil: now.AddDate(0, 0, o.AffiliateHoldDays).Format(time.RFC3339),
		CreatedAt: at, UpdatedAt: at,
	})
}

// BuyerContactVisible reports whether viewer may see the buyer's contact
// details on an order: only the buyer and the selling business's owner
// (contract K20). The confirm endpoint is public, so everyone else — anyone
// holding the reference from a callback URL — gets the order without them.
func (s *CommerceService) BuyerContactVisible(ctx context.Context, o *domain.CommerceOrder, viewer *domain.Member) (buyer, seller bool) {
	if o == nil || viewer == nil || viewer.ID == "" {
		return false, false
	}
	if o.BuyerID != "" && o.BuyerID == viewer.ID {
		return true, false
	}
	l, err := s.listings.GetByID(ctx, o.ListingID)
	return false, err == nil && l.OwnerID == viewer.ID
}

// sellerCanContactBuyer: a seller needs the buyer's contact details while an
// order is being fulfilled and for a short after-sales window, not forever.
func sellerCanContactBuyer(o domain.CommerceOrder, now time.Time) bool {
	switch o.Status {
	case domain.OrderPaid, domain.OrderProcessing, domain.OrderReady:
		return true
	case domain.OrderFulfilled:
		done, err := time.Parse(time.RFC3339, o.UpdatedAt)
		return err == nil && now.Sub(done) <= sellerContactRetention
	default:
		return false
	}
}

// SellerOrderView is the seller's copy of an order: the buyer's contact
// details, address and note are dropped (and the name reduced to an initial)
// once the order no longer needs them.
func SellerOrderView(o domain.CommerceOrder, now time.Time) domain.CommerceOrder {
	if sellerCanContactBuyer(o, now) {
		return o
	}
	initial := ""
	if r, _ := utf8.DecodeRuneInString(o.BuyerName); r != utf8.RuneError {
		initial = string(r) + "."
	}
	o.BuyerName, o.BuyerEmail, o.BuyerPhone, o.DeliveryAddress, o.Note = initial, "", "", "", ""
	o.BuyerContactHidden = true
	return o
}

func (s *CommerceService) businessOwned(ctx context.Context, actor *domain.Member, id string) (*domain.Listing, error) {
	if actor == nil {
		return nil, &domain.ForbiddenError{Reason: "sign in as the business owner"}
	}
	l, err := s.listings.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if l.Type != domain.TypeBusiness {
		return nil, &domain.ForbiddenError{Reason: "commerce is available for businesses only"}
	}
	if l.OwnerID != actor.ID && actor.Role != domain.RoleSteward && actor.Role != domain.RoleCurator {
		return nil, &domain.ForbiddenError{Reason: "only the business owner can manage commerce"}
	}
	return l, nil
}

// affiliateScope authorises a caller for one affiliate scope: "*" is Oguaa's
// own platform programme (stewards only); anything else must be a business
// listing the caller manages.
func (s *CommerceService) affiliateScope(ctx context.Context, actor *domain.Member, listingID string) error {
	if listingID == affiliateScopePlatform {
		if actor == nil || actor.Role != domain.RoleSteward {
			return &domain.ForbiddenError{Reason: msgStewardAccessRequired}
		}
		return nil
	}
	_, err := s.businessOwned(ctx, actor, listingID)
	return err
}

// validateCouponShape checks the fields every coupon needs.
func validateCouponShape(c domain.BusinessCoupon) bool {
	if !couponCodePattern.MatchString(c.Code) || c.DiscountValue <= 0 || c.RedemptionLimit < 0 || c.MinimumPesewas < 0 || c.MaximumDiscount < 0 {
		return false
	}
	switch c.DiscountType {
	case domain.CouponPercent:
		return c.DiscountValue <= 90
	case domain.CouponFixed:
		return c.DiscountValue <= maxFixedCouponPesewas
	default:
		return false
	}
}

// keepCouponCounters carries the server-owned fields of an existing coupon in
// this scope over to an edit (its redemption count and creation time), and
// gives a new coupon a server-generated id.
func (s *CommerceService) keepCouponCounters(ctx context.Context, c *domain.BusinessCoupon, scope, idPrefix, now string) error {
	if c.ID != "" {
		existing, err := s.coupons.ByBusiness(ctx, scope)
		if err != nil {
			return err
		}
		for _, e := range existing {
			if e.ID == c.ID {
				c.Redemptions, c.CreatedAt = e.Redemptions, e.CreatedAt
				return nil
			}
		}
	}
	c.ID = fmt.Sprintf("%s-%d", idPrefix, time.Now().UnixNano())
	c.Redemptions, c.CreatedAt = 0, now
	return nil
}

func (s *CommerceService) SaveCoupon(ctx context.Context, actor *domain.Member, listingID string, c domain.BusinessCoupon) (*domain.BusinessCoupon, error) {
	if _, err := s.businessOwned(ctx, actor, listingID); err != nil {
		return nil, err
	}
	c.Code = strings.ToUpper(strings.TrimSpace(c.Code))
	if !validateCouponShape(c) {
		return nil, commerceInvalid("invalid coupon")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if err := s.keepCouponCounters(ctx, &c, listingID, "cpn-"+listingID, now); err != nil {
		return nil, err
	}
	c.ListingID = listingID
	c.OwnerType = domain.PromotionOwnerBusiness
	c.FundingSource = domain.PromotionFundingBusiness
	c.UpdatedAt = now
	if err := s.coupons.Upsert(ctx, c); err != nil {
		return nil, err
	}
	return &c, nil
}

// platformPromotionFits checks an Oguaa-funded promotion against Oguaa's own
// fee, which pays for it: a percentage must be below the fee percentage, and
// a fixed amount needs a minimum basket whose fee covers it. Anything else
// would save fine and then refuse every checkout.
func (s *CommerceService) platformPromotionFits(c domain.BusinessCoupon) error {
	if c.DiscountType == domain.CouponPercent && c.DiscountValue >= int64(s.feePercent) {
		return commerceInvalid(fmt.Sprintf("an Oguaa-funded percentage promotion must be below Oguaa's %d%% fee", s.feePercent))
	}
	if c.DiscountType == domain.CouponFixed && c.DiscountValue >= c.MinimumPesewas*int64(s.feePercent)/100 {
		return commerceInvalid(fmt.Sprintf("set a minimum basket large enough for Oguaa's %d%% fee to cover this discount", s.feePercent))
	}
	return nil
}

func (s *CommerceService) SavePlatformPromotion(ctx context.Context, actor *domain.Member, c domain.BusinessCoupon) (*domain.BusinessCoupon, error) {
	if actor == nil || actor.Role != domain.RoleSteward {
		return nil, &domain.ForbiddenError{Reason: msgStewardAccessRequired}
	}
	c.ListingID = affiliateScopePlatform
	c.OwnerType = domain.PromotionOwnerPlatform
	c.FundingSource = domain.PromotionFundingPlatform
	c.Code = strings.ToUpper(strings.TrimSpace(c.Code))
	if !validateCouponShape(c) {
		return nil, commerceInvalid("invalid promotion")
	}
	if err := s.platformPromotionFits(c); err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if err := s.keepCouponCounters(ctx, &c, affiliateScopePlatform, "prm-platform", now); err != nil {
		return nil, err
	}
	c.UpdatedAt = now
	if err := s.coupons.Upsert(ctx, c); err != nil {
		return nil, err
	}
	return &c, nil
}
func (s *CommerceService) AllPromotions(ctx context.Context, actor *domain.Member) ([]domain.BusinessCoupon, error) {
	if actor == nil || actor.Role != domain.RoleSteward {
		return nil, &domain.ForbiddenError{Reason: msgStewardAccessRequired}
	}
	return s.coupons.All(ctx)
}

// normaliseProgramme validates programme terms. An Oguaa-funded commission
// is paid out of Oguaa's fee, so it must be below the fee percentage.
func (s *CommerceService) normaliseProgramme(p *domain.AffiliateProgramme, ownerType string) error {
	p.Name = strings.TrimSpace(p.Name)
	p.Description = strings.TrimSpace(p.Description)
	if p.Name == "" || p.CommissionBps < 1 || p.CommissionBps > 5000 {
		return commerceInvalid("name and commission between 0.01% and 50% are required")
	}
	if p.HoldDays < 0 || p.HoldDays > 180 {
		return commerceInvalid("hold days must be between 0 and 180")
	}
	if p.CookieWindowDays == 0 {
		p.CookieWindowDays = 30
	}
	if p.CookieWindowDays < 1 || p.CookieWindowDays > 365 {
		return commerceInvalid("cookie window must be between 1 and 365 days")
	}
	if p.MinimumPayoutPesewas < 0 {
		return commerceInvalid("minimum payout cannot be negative")
	}
	if p.PayoutMode == "" {
		p.PayoutMode = "mobile_money"
	}
	if p.PayoutMode != "mobile_money" && p.PayoutMode != "bank" && p.PayoutMode != "manual" {
		return commerceInvalid("invalid payout mode")
	}
	if p.FundingSource != "" && p.FundingSource != domain.PromotionFundingBusiness && p.FundingSource != domain.PromotionFundingPlatform {
		return commerceInvalid("invalid funding source")
	}
	if p.FundingSource == "" || ownerType == domain.PromotionOwnerBusiness {
		p.FundingSource = ownerType
	}
	if p.FundingSource == domain.PromotionFundingPlatform && p.CommissionBps >= int64(s.feePercent)*100 {
		return commerceInvalid(fmt.Sprintf("an Oguaa-funded commission must be below Oguaa's %d%% fee (%d basis points)", s.feePercent, s.feePercent*100))
	}
	return nil
}

// claimProgrammeID keeps a client-supplied id only when it names a programme
// this scope already owns; any other id is replaced by a server-generated one.
func (s *CommerceService) claimProgrammeID(ctx context.Context, p *domain.AffiliateProgramme, listingID, now string) error {
	if p.ID != "" {
		existing, err := s.affiliates.Programme(ctx, p.ID)
		switch {
		case err == nil && existing.ListingID == listingID:
			p.CreatedAt = existing.CreatedAt
			return nil
		case err == nil:
			return &domain.ForbiddenError{Reason: msgProgrammeNotOwned}
		case !isCommerceNotFound(err):
			return err
		}
	}
	p.ID = fmt.Sprintf("afp-%d", time.Now().UnixNano())
	p.CreatedAt = now
	return nil
}

func (s *CommerceService) SaveAffiliateProgramme(ctx context.Context, actor *domain.Member, listingID string, p domain.AffiliateProgramme) (*domain.AffiliateProgramme, error) {
	if s.affiliates == nil {
		return nil, errAffiliatesUnavailable
	}
	if err := s.affiliateScope(ctx, actor, listingID); err != nil {
		return nil, err
	}
	ownerType := domain.PromotionOwnerBusiness
	if listingID == affiliateScopePlatform {
		ownerType = domain.PromotionOwnerPlatform
	}
	if err := s.normaliseProgramme(&p, ownerType); err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if err := s.claimProgrammeID(ctx, &p, listingID, now); err != nil {
		return nil, err
	}
	p.ListingID = listingID
	p.OwnerType = ownerType
	p.UpdatedAt = now
	if err := s.affiliates.SaveProgramme(ctx, p); err != nil {
		return nil, err
	}
	return &p, nil
}
func (s *CommerceService) AffiliateProgrammes(ctx context.Context, actor *domain.Member, listingID string) ([]domain.AffiliateProgramme, error) {
	if s.affiliates == nil {
		return nil, errAffiliatesUnavailable
	}
	if err := s.affiliateScope(ctx, actor, listingID); err != nil {
		return nil, err
	}
	return s.affiliates.Programmes(ctx, listingID)
}

func normaliseAffiliate(a *domain.Affiliate) error {
	a.Code = strings.ToUpper(strings.TrimSpace(a.Code))
	a.Name = strings.TrimSpace(a.Name)
	a.Email = strings.ToLower(strings.TrimSpace(a.Email))
	a.AudienceSummary = strings.TrimSpace(a.AudienceSummary)
	if !couponCodePattern.MatchString(a.Code) || a.Name == "" || !strings.Contains(a.Email, "@") {
		return commerceInvalid("valid affiliate code, name and email are required")
	}
	if len(a.PromotionChannels) > 8 {
		return commerceInvalid("up to eight promotion channels are allowed")
	}
	if a.Status == "" {
		a.Status = "approved"
	}
	if a.Status != "pending" && a.Status != "approved" && a.Status != "paused" && a.Status != "rejected" {
		return commerceInvalid("invalid affiliate status")
	}
	return nil
}

// claimAffiliateID keeps a client-supplied id only when it names an affiliate
// this scope already owns; new affiliates always get a server-generated id.
func (s *CommerceService) claimAffiliateID(ctx context.Context, a *domain.Affiliate, listingID, now string) error {
	if a.ID != "" {
		existing, err := s.affiliates.AffiliateByID(ctx, a.ID)
		switch {
		case err == nil && existing.ListingID == listingID:
			a.CreatedAt = existing.CreatedAt
			return nil
		case err == nil:
			return &domain.ForbiddenError{Reason: "affiliate does not belong to this business"}
		case !isCommerceNotFound(err):
			return err
		}
	}
	a.ID = fmt.Sprintf("aff-%d", time.Now().UnixNano())
	a.CreatedAt = now
	return nil
}

func (s *CommerceService) SaveAffiliate(ctx context.Context, actor *domain.Member, listingID string, a domain.Affiliate) (*domain.Affiliate, error) {
	if s.affiliates == nil {
		return nil, errAffiliatesUnavailable
	}
	if err := s.affiliateScope(ctx, actor, listingID); err != nil {
		return nil, err
	}
	p, err := s.affiliates.Programme(ctx, a.ProgrammeID)
	if err != nil {
		return nil, err
	}
	if p.ListingID != listingID {
		return nil, &domain.ForbiddenError{Reason: msgProgrammeNotOwned}
	}
	if err = normaliseAffiliate(&a); err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if err = s.claimAffiliateID(ctx, &a, listingID, now); err != nil {
		return nil, err
	}
	a.ListingID = listingID
	a.UpdatedAt = now
	if err = s.affiliates.SaveAffiliate(ctx, a); err != nil {
		return nil, err
	}
	return &a, nil
}

// Affiliates lists one scope's affiliates (payout numbers included, so only
// for that business's managers or, for "*", stewards). The repository query
// is always filtered by the listing, whatever programme id is asked for.
func (s *CommerceService) Affiliates(ctx context.Context, actor *domain.Member, listingID, programmeID string) ([]domain.Affiliate, error) {
	if s.affiliates == nil {
		return nil, errAffiliatesUnavailable
	}
	if err := s.affiliateScope(ctx, actor, listingID); err != nil {
		return nil, err
	}
	return s.affiliates.Affiliates(ctx, listingID, strings.TrimSpace(programmeID))
}
func (s *CommerceService) AffiliateConversions(ctx context.Context, actor *domain.Member, listingID string) ([]domain.AffiliateConversion, error) {
	if s.affiliates == nil {
		return nil, errAffiliatesUnavailable
	}
	if err := s.affiliateScope(ctx, actor, listingID); err != nil {
		return nil, err
	}
	if listingID == affiliateScopePlatform {
		listingID = "" // stewards reconcile every conversion
	}
	return s.affiliates.Conversions(ctx, listingID)
}
func (s *CommerceService) SetAffiliateConversionStatus(ctx context.Context, actor *domain.Member, id, status string) error {
	if actor == nil || actor.Role != domain.RoleSteward {
		return &domain.ForbiddenError{Reason: msgStewardAccessRequired}
	}
	if status != domain.AffiliatePayable && status != domain.AffiliatePaid && status != domain.AffiliateVoid {
		return commerceInvalid("invalid affiliate conversion status")
	}
	return s.affiliates.SetConversionStatus(ctx, id, status, time.Now().UTC().Format(time.RFC3339))
}
func (s *CommerceService) Coupons(ctx context.Context, actor *domain.Member, listingID string) ([]domain.BusinessCoupon, error) {
	if _, err := s.businessOwned(ctx, actor, listingID); err != nil {
		return nil, err
	}
	return s.coupons.ByBusiness(ctx, listingID)
}
func (s *CommerceService) DeleteCoupon(ctx context.Context, actor *domain.Member, listingID, id string) error {
	if _, err := s.businessOwned(ctx, actor, listingID); err != nil {
		return err
	}
	return s.coupons.Delete(ctx, id, listingID)
}

// BusinessOrders is the seller's order book, with buyer contact details only
// on orders that still need them (see SellerOrderView).
func (s *CommerceService) BusinessOrders(ctx context.Context, actor *domain.Member, listingID string) ([]domain.CommerceOrder, error) {
	if _, err := s.businessOwned(ctx, actor, listingID); err != nil {
		return nil, err
	}
	orders, err := s.orders.ByBusiness(ctx, listingID)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	for i := range orders {
		orders[i] = SellerOrderView(orders[i], now)
	}
	return orders, nil
}
func (s *CommerceService) MyOrders(ctx context.Context, buyerID string) ([]domain.CommerceOrder, error) {
	if buyerID == "" {
		return nil, &domain.ForbiddenError{Reason: "sign in to view orders"}
	}
	return s.orders.ByBuyer(ctx, buyerID)
}
func (s *CommerceService) AdminOrders(ctx context.Context) ([]domain.CommerceOrder, error) {
	return s.orders.All(ctx)
}
func (s *CommerceService) SetOrderStatus(ctx context.Context, actor *domain.Member, listingID, orderID, status string) error {
	if _, err := s.businessOwned(ctx, actor, listingID); err != nil {
		return err
	}
	allowed := map[string]bool{domain.OrderProcessing: true, domain.OrderReady: true, domain.OrderFulfilled: true}
	if !allowed[status] {
		return commerceInvalid("invalid order status")
	}
	orders, err := s.orders.ByBusiness(ctx, listingID)
	if err != nil {
		return err
	}
	var current string
	for _, order := range orders {
		if order.ID == orderID {
			current = order.Status
			break
		}
	}
	if current == "" {
		return &domain.NotFoundError{Entity: "order"}
	}
	transitions := map[string]map[string]bool{
		domain.OrderPaid:       {domain.OrderProcessing: true},
		domain.OrderProcessing: {domain.OrderReady: true},
		domain.OrderReady:      {domain.OrderFulfilled: true},
	}
	if !transitions[current][status] {
		return commerceInvalid("order status must advance from paid to processing, ready and fulfilled")
	}
	return s.orders.SetStatus(ctx, orderID, listingID, status, time.Now().UTC().Format(time.RFC3339))
}
