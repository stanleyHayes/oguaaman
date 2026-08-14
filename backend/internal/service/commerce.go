package service

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

var ghanaCardPattern = regexp.MustCompile(`^GHA-[0-9]{9}-[0-9]$`)
var couponCodePattern = regexp.MustCompile(`^[A-Z0-9][A-Z0-9_-]{2,19}$`)

type CommerceService struct {
	listings      domain.ListingRepository
	verifications domain.BusinessVerificationRepository
	orders        domain.CommerceOrderRepository
	coupons       domain.BusinessCouponRepository
	affiliates    domain.AffiliateRepository
	paystack      CommercePaystack
	portal        string
	feePercent    int
}

func NewCommerceService(l domain.ListingRepository, v domain.BusinessVerificationRepository, o domain.CommerceOrderRepository, c domain.BusinessCouponRepository, a domain.AffiliateRepository, p CommercePaystack, portal string, fee int) *CommerceService {
	if fee < 1 {
		fee = 5
	}
	if fee > 50 {
		fee = 50
	}
	return &CommerceService{l, v, o, c, a, p, strings.TrimRight(portal, "/"), fee}
}

type BusinessVerificationInput struct {
	LegalName           string   `json:"legalName"`
	RegistrationNumber  string   `json:"registrationNumber"`
	TaxIdentificationNo string   `json:"taxIdentificationNo"`
	GhanaCardNumber     string   `json:"ghanaCardNumber"`
	BusinessPhone       string   `json:"businessPhone"`
	GhanaPostGPS        string   `json:"ghanaPostGPS"`
	Documents           []string `json:"documents"`
	SettlementBankCode  string   `json:"settlementBankCode"`
	SettlementAccountNo string   `json:"settlementAccountNo"`
	SettlementName      string   `json:"settlementName"`
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
	in.LegalName = strings.TrimSpace(in.LegalName)
	in.RegistrationNumber = strings.ToUpper(strings.TrimSpace(in.RegistrationNumber))
	in.GhanaCardNumber = strings.ToUpper(strings.TrimSpace(in.GhanaCardNumber))
	in.BusinessPhone = strings.TrimSpace(in.BusinessPhone)
	in.GhanaPostGPS = strings.ToUpper(strings.TrimSpace(in.GhanaPostGPS))
	in.SettlementBankCode = strings.TrimSpace(in.SettlementBankCode)
	in.SettlementAccountNo = strings.TrimSpace(in.SettlementAccountNo)
	in.SettlementName = strings.TrimSpace(in.SettlementName)
	if in.LegalName == "" || len(in.LegalName) > 200 || in.RegistrationNumber == "" || !ghanaCardPattern.MatchString(in.GhanaCardNumber) || in.BusinessPhone == "" || in.GhanaPostGPS == "" || in.SettlementBankCode == "" || len(in.SettlementAccountNo) < 6 || in.SettlementName == "" || len(in.Documents) < 3 {
		return nil, fmt.Errorf("legal identity, registration, Ghana Card, location, three verification documents and settlement account are required")
	}
	for _, doc := range in.Documents {
		if !safeCommerceURL(doc) {
			return nil, fmt.Errorf("verification documents must be secure upload URLs")
		}
	}
	now := time.Now().UTC().Format(time.RFC3339)
	v := domain.BusinessVerification{ID: "bvr-" + l.ID, ListingID: l.ID, ListingSlug: l.Slug, OwnerID: actor.ID, LegalName: in.LegalName, RegistrationNumber: in.RegistrationNumber, TaxIdentificationNo: strings.TrimSpace(in.TaxIdentificationNo), GhanaCardNumber: in.GhanaCardNumber, BusinessPhone: in.BusinessPhone, GhanaPostGPS: in.GhanaPostGPS, Documents: in.Documents, SettlementBankCode: in.SettlementBankCode, SettlementAccountNo: in.SettlementAccountNo, SettlementName: in.SettlementName, Status: domain.BusinessVerificationPending, SubmittedAt: now, CreatedAt: now, UpdatedAt: now}
	if old, e := s.verifications.ByListing(ctx, l.ID); e == nil {
		v.ID = old.ID
		v.CreatedAt = old.CreatedAt
	}
	if err := s.verifications.Upsert(ctx, v); err != nil {
		return nil, err
	}
	return &v, nil
}
func safeCommerceURL(v string) bool {
	return strings.HasPrefix(v, "https://")
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
func (s *CommerceService) CommerceEnabled(ctx context.Context, businessSlug string) bool {
	l, err := s.listings.GetBySlug(ctx, domain.TypeBusiness, businessSlug)
	if err != nil || l.Status != domain.StatusApproved {
		return false
	}
	v, err := s.verifications.ByListing(ctx, l.ID)
	return err == nil && v.Status == domain.BusinessVerificationVerified && v.PaystackSubaccount != ""
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
		return nil, fmt.Errorf("invalid verification decision")
	}
	sub := ""
	if status == domain.BusinessVerificationVerified {
		sub, err = s.paystack.CreateSubaccount(ctx, v.LegalName, v.SettlementBankCode, v.SettlementAccountNo)
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

func (s *CommerceService) StartOrder(ctx context.Context, businessSlug string, buyer *domain.Member, in CheckoutInput) (*domain.CommerceOrder, string, string, error) {
	l, err := s.listings.GetBySlug(ctx, domain.TypeBusiness, businessSlug)
	if err != nil {
		return nil, "", "", err
	}
	if l.Status != domain.StatusApproved {
		return nil, "", "", &domain.NotFoundError{Entity: "business"}
	}
	v, err := s.verifications.ByListing(ctx, l.ID)
	if err != nil || v.Status != domain.BusinessVerificationVerified || v.PaystackSubaccount == "" {
		return nil, "", "", &domain.ForbiddenError{Reason: "this business is not verified for online payments"}
	}
	in.BuyerName = strings.TrimSpace(in.BuyerName)
	in.BuyerEmail = strings.TrimSpace(in.BuyerEmail)
	in.BuyerPhone = strings.TrimSpace(in.BuyerPhone)
	if in.BuyerName == "" || in.BuyerEmail == "" || in.BuyerPhone == "" || len(in.Lines) == 0 {
		return nil, "", "", fmt.Errorf("buyer contact and at least one product are required")
	}
	if in.Fulfilment != "pickup" && in.Fulfilment != "delivery" {
		return nil, "", "", fmt.Errorf("choose pickup or delivery")
	}
	if in.Fulfilment == "delivery" && strings.TrimSpace(in.DeliveryAddress) == "" {
		return nil, "", "", fmt.Errorf("delivery address is required")
	}
	products := map[string]domain.StoreItem{}
	for _, p := range l.Products {
		products[p.ID] = p
	}
	lines := make([]domain.OrderLine, 0, len(in.Lines))
	var subtotal int64
	for _, want := range in.Lines {
		p, ok := products[want.ProductID]
		if !ok || !p.Available || p.PricePesewas <= 0 || want.Quantity < 1 || want.Quantity > 20 {
			return nil, "", "", fmt.Errorf("a selected product is unavailable")
		}
		lineTotal := p.PricePesewas * int64(want.Quantity)
		subtotal += lineTotal
		lines = append(lines, domain.OrderLine{ProductID: p.ID, Name: p.Name, Quantity: want.Quantity, UnitPesewas: p.PricePesewas, SubtotalPesewas: lineTotal})
	}
	if subtotal < 100 {
		return nil, "", "", fmt.Errorf("order total is too low")
	}
	discount, coupon, err := s.discount(ctx, l.ID, in.CouponCode, subtotal)
	if err != nil {
		return nil, "", "", err
	}
	amount := subtotal - discount
	if amount < 100 {
		return nil, "", "", fmt.Errorf("coupon leaves an invalid payment amount")
	}
	feeBase := amount
	if coupon != nil && coupon.FundingSource == domain.PromotionFundingBusiness {
		feeBase = subtotal
	}
	fee := feeBase * int64(s.feePercent) / 100
	if fee < 1 {
		fee = 1
	}
	if coupon != nil && coupon.FundingSource == domain.PromotionFundingPlatform {
		originalFee := subtotal * int64(s.feePercent) / 100
		if discount >= originalFee {
			return nil, "", "", &domain.ForbiddenError{Reason: "platform promotion exceeds Oguaa's fee budget"}
		}
		fee = originalFee - discount
	}
	now := time.Now().UTC()
	ref := fmt.Sprintf("ord-%s-%d", l.Slug, now.UnixNano())
	buyerID := ""
	if buyer != nil {
		buyerID = buyer.ID
	}
	o := domain.CommerceOrder{ID: "o" + ref, Reference: ref, ListingID: l.ID, ListingSlug: l.Slug, BusinessName: l.Title, BuyerID: buyerID, BuyerName: in.BuyerName, BuyerEmail: in.BuyerEmail, BuyerPhone: in.BuyerPhone, Fulfilment: in.Fulfilment, DeliveryAddress: strings.TrimSpace(in.DeliveryAddress), Note: strings.TrimSpace(in.Note), Lines: lines, CouponCode: strings.ToUpper(strings.TrimSpace(in.CouponCode)), SubtotalPesewas: subtotal, DiscountPesewas: discount, AmountPesewas: amount, PlatformFeePesewas: fee, BusinessNetPesewas: amount - fee, PaystackSubaccount: v.PaystackSubaccount, Status: domain.OrderPending, Simulated: s.paystack.Simulated(), CreatedAt: now.Format(time.RFC3339), UpdatedAt: now.Format(time.RFC3339)}
	if coupon != nil {
		o.PromotionID = coupon.ID
		o.PromotionFunding = coupon.FundingSource
	}
	transactionCharge := fee
	conversionID := ""
	var pendingConversion *domain.AffiliateConversion
	if code := strings.ToUpper(strings.TrimSpace(in.AffiliateCode)); code != "" && s.affiliates != nil {
		aff, findErr := s.affiliates.AffiliateByCode(ctx, l.ID, code)
		if findErr != nil {
			return nil, "", "", &domain.ForbiddenError{Reason: "affiliate code is invalid"}
		}
		programme, findErr := s.affiliates.Programme(ctx, aff.ProgrammeID)
		if findErr != nil || !programme.Active || strings.EqualFold(aff.Email, in.BuyerEmail) {
			return nil, "", "", &domain.ForbiddenError{Reason: "affiliate attribution is not eligible"}
		}
		commission := amount * programme.CommissionBps / 10_000
		if commission < 1 {
			return nil, "", "", &domain.ForbiddenError{Reason: "affiliate commission is too low"}
		}
		if programme.FundingSource == domain.PromotionFundingPlatform {
			if commission >= fee {
				return nil, "", "", &domain.ForbiddenError{Reason: "affiliate commission exceeds Oguaa's fee budget"}
			}
		} else {
			transactionCharge += commission
			o.BusinessNetPesewas -= commission
		}
		o.AffiliateCode, o.AffiliateID, o.AffiliateProgrammeID, o.AffiliateCommissionPesewas = code, aff.ID, programme.ID, commission
		conv := domain.AffiliateConversion{ID: "afc-" + ref, OrderID: o.ID, OrderReference: ref, AffiliateID: aff.ID, ProgrammeID: programme.ID, ListingID: l.ID, AffiliateCode: code, GrossPesewas: amount, CommissionPesewas: commission, FundingSource: programme.FundingSource, Status: domain.AffiliateReserved, CreatedAt: now.Format(time.RFC3339), UpdatedAt: now.Format(time.RFC3339)}
		pendingConversion = &conv
	}
	if coupon != nil {
		if err = s.coupons.Reserve(ctx, coupon.ID); err != nil {
			return nil, "", "", err
		}
	}
	if pendingConversion != nil {
		if err = s.affiliates.ReserveConversion(ctx, *pendingConversion); err != nil {
			if coupon != nil {
				_ = s.coupons.Release(ctx, coupon.ID)
			}
			return nil, "", "", err
		}
		conversionID = pendingConversion.ID
	}
	if err = s.orders.Insert(ctx, o); err != nil {
		if coupon != nil {
			_ = s.coupons.Release(ctx, coupon.ID)
		}
		if conversionID != "" {
			_ = s.affiliates.SetConversionStatus(ctx, conversionID, domain.AffiliateVoid, now.Format(time.RFC3339))
		}
		return nil, "", "", err
	}
	callback := fmt.Sprintf("%s/business/%s/order?reference=%s", s.portal, l.Slug, url.QueryEscape(ref))
	auth, access, err := s.paystack.InitializeSplit(ctx, o.BuyerEmail, o.AmountPesewas, "GHS", ref, callback, v.PaystackSubaccount, transactionCharge)
	if err != nil {
		if coupon != nil {
			_ = s.coupons.Release(ctx, coupon.ID)
		}
		if conversionID != "" {
			_ = s.affiliates.SetConversionStatus(ctx, conversionID, domain.AffiliateVoid, time.Now().UTC().Format(time.RFC3339))
		}
		return nil, "", "", err
	}
	return &o, auth, access, nil
}
func (s *CommerceService) discount(ctx context.Context, lid, code string, subtotal int64) (int64, *domain.BusinessCoupon, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		return 0, nil, nil
	}
	c, err := s.coupons.ByCode(ctx, lid, code)
	if err != nil {
		return 0, nil, &domain.ForbiddenError{Reason: "coupon is invalid"}
	}
	now := time.Now().UTC()
	if !c.Active || subtotal < c.MinimumPesewas || (c.StartsAt != "" && parseCommerceTime(c.StartsAt).After(now)) || (c.EndsAt != "" && !parseCommerceTime(c.EndsAt).After(now)) {
		return 0, nil, &domain.ForbiddenError{Reason: "coupon is not active"}
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
	if o.Status != domain.OrderPending {
		return o, nil
	}
	ok, amount, err := s.paystack.Verify(ctx, ref)
	if err != nil {
		return nil, err
	}
	if !ok || (amount != 0 && amount != o.AmountPesewas) {
		return nil, fmt.Errorf("payment could not be verified")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if err = s.orders.MarkPaid(ctx, ref, now); err != nil {
		return nil, err
	}
	if o.AffiliateID != "" && s.affiliates != nil {
		programme, e := s.affiliates.Programme(ctx, o.AffiliateProgrammeID)
		if e == nil {
			_ = s.affiliates.Convert(ctx, ref, time.Now().UTC().AddDate(0, 0, programme.HoldDays).Format(time.RFC3339), now)
		}
	}
	return s.orders.ByReference(ctx, ref)
}

func (s *CommerceService) businessOwned(ctx context.Context, actor *domain.Member, id string) (*domain.Listing, error) {
	if actor == nil {
		return nil, &domain.ForbiddenError{Reason: "sign in as the business owner"}
	}
	l, err := s.listings.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if l.OwnerID != actor.ID && actor.Role != domain.RoleSteward && actor.Role != domain.RoleCurator {
		return nil, &domain.ForbiddenError{Reason: "only the business owner can manage commerce"}
	}
	return l, nil
}
func (s *CommerceService) SaveCoupon(ctx context.Context, actor *domain.Member, listingID string, c domain.BusinessCoupon) (*domain.BusinessCoupon, error) {
	if _, err := s.businessOwned(ctx, actor, listingID); err != nil {
		return nil, err
	}
	c.Code = strings.ToUpper(strings.TrimSpace(c.Code))
	if !couponCodePattern.MatchString(c.Code) || (c.DiscountType != domain.CouponPercent && c.DiscountType != domain.CouponFixed) || c.DiscountValue <= 0 || (c.DiscountType == domain.CouponPercent && c.DiscountValue > 90) {
		return nil, fmt.Errorf("invalid coupon")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if c.ID == "" {
		c.ID = fmt.Sprintf("cpn-%s-%d", listingID, time.Now().UnixNano())
		c.CreatedAt = now
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
func (s *CommerceService) SavePlatformPromotion(ctx context.Context, actor *domain.Member, c domain.BusinessCoupon) (*domain.BusinessCoupon, error) {
	if actor == nil || actor.Role != domain.RoleSteward {
		return nil, &domain.ForbiddenError{Reason: "steward access required"}
	}
	c.ListingID = "*"
	c.OwnerType = domain.PromotionOwnerPlatform
	c.FundingSource = domain.PromotionFundingPlatform
	c.Code = strings.ToUpper(strings.TrimSpace(c.Code))
	if !couponCodePattern.MatchString(c.Code) || (c.DiscountType != domain.CouponPercent && c.DiscountType != domain.CouponFixed) || c.DiscountValue <= 0 || (c.DiscountType == domain.CouponPercent && c.DiscountValue > 90) {
		return nil, fmt.Errorf("invalid promotion")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if c.ID == "" {
		c.ID = fmt.Sprintf("prm-platform-%d", time.Now().UnixNano())
		c.CreatedAt = now
	}
	c.UpdatedAt = now
	if err := s.coupons.Upsert(ctx, c); err != nil {
		return nil, err
	}
	return &c, nil
}
func (s *CommerceService) AllPromotions(ctx context.Context, actor *domain.Member) ([]domain.BusinessCoupon, error) {
	if actor == nil || actor.Role != domain.RoleSteward {
		return nil, &domain.ForbiddenError{Reason: "steward access required"}
	}
	return s.coupons.All(ctx)
}

func (s *CommerceService) SaveAffiliateProgramme(ctx context.Context, actor *domain.Member, listingID string, p domain.AffiliateProgramme) (*domain.AffiliateProgramme, error) {
	if s.affiliates == nil {
		return nil, errors.New("affiliate service unavailable")
	}
	ownerType := domain.PromotionOwnerBusiness
	if listingID == "*" {
		if actor == nil || actor.Role != domain.RoleSteward {
			return nil, &domain.ForbiddenError{Reason: "steward access required"}
		}
		ownerType = domain.PromotionOwnerPlatform
	} else if _, err := s.businessOwned(ctx, actor, listingID); err != nil {
		return nil, err
	}
	p.Name = strings.TrimSpace(p.Name)
	if p.Name == "" || p.CommissionBps < 1 || p.CommissionBps > 5000 {
		return nil, fmt.Errorf("name and commission between 0.01%% and 50%% are required")
	}
	if p.HoldDays < 0 || p.HoldDays > 180 {
		return nil, fmt.Errorf("hold days must be between 0 and 180")
	}
	if p.FundingSource != "" && p.FundingSource != domain.PromotionFundingBusiness && p.FundingSource != domain.PromotionFundingPlatform {
		return nil, fmt.Errorf("invalid funding source")
	}
	if p.FundingSource == "" {
		p.FundingSource = ownerType
	}
	if ownerType == domain.PromotionOwnerBusiness {
		p.FundingSource = domain.PromotionFundingBusiness
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if p.ID == "" {
		p.ID = fmt.Sprintf("afp-%d", time.Now().UnixNano())
		p.CreatedAt = now
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
	if listingID == "*" {
		if actor == nil || actor.Role != domain.RoleSteward {
			return nil, &domain.ForbiddenError{Reason: "steward access required"}
		}
	} else if _, err := s.businessOwned(ctx, actor, listingID); err != nil {
		return nil, err
	}
	return s.affiliates.Programmes(ctx, listingID)
}
func (s *CommerceService) SaveAffiliate(ctx context.Context, actor *domain.Member, listingID string, a domain.Affiliate) (*domain.Affiliate, error) {
	p, err := s.affiliates.Programme(ctx, a.ProgrammeID)
	if err != nil {
		return nil, err
	}
	if p.ListingID != listingID {
		return nil, &domain.ForbiddenError{Reason: "programme does not belong to this business"}
	}
	if listingID == "*" {
		if actor == nil || actor.Role != domain.RoleSteward {
			return nil, &domain.ForbiddenError{Reason: "steward access required"}
		}
	} else if _, err = s.businessOwned(ctx, actor, listingID); err != nil {
		return nil, err
	}
	a.Code = strings.ToUpper(strings.TrimSpace(a.Code))
	a.Name = strings.TrimSpace(a.Name)
	a.Email = strings.ToLower(strings.TrimSpace(a.Email))
	if !couponCodePattern.MatchString(a.Code) || a.Name == "" || !strings.Contains(a.Email, "@") {
		return nil, fmt.Errorf("valid affiliate code, name and email are required")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if a.ID == "" {
		a.ID = fmt.Sprintf("aff-%d", time.Now().UnixNano())
		a.CreatedAt = now
	}
	a.ListingID = listingID
	a.UpdatedAt = now
	if err = s.affiliates.SaveAffiliate(ctx, a); err != nil {
		return nil, err
	}
	return &a, nil
}
func (s *CommerceService) Affiliates(ctx context.Context, actor *domain.Member, listingID, programmeID string) ([]domain.Affiliate, error) {
	if listingID == "*" {
		if actor == nil || actor.Role != domain.RoleSteward {
			return nil, &domain.ForbiddenError{Reason: "steward access required"}
		}
	} else if _, err := s.businessOwned(ctx, actor, listingID); err != nil {
		return nil, err
	}
	return s.affiliates.Affiliates(ctx, programmeID)
}
func (s *CommerceService) AffiliateConversions(ctx context.Context, actor *domain.Member, listingID string) ([]domain.AffiliateConversion, error) {
	if listingID == "*" {
		if actor == nil || actor.Role != domain.RoleSteward {
			return nil, &domain.ForbiddenError{Reason: "steward access required"}
		}
		listingID = ""
	} else if _, err := s.businessOwned(ctx, actor, listingID); err != nil {
		return nil, err
	}
	return s.affiliates.Conversions(ctx, listingID)
}
func (s *CommerceService) SetAffiliateConversionStatus(ctx context.Context, actor *domain.Member, id, status string) error {
	if actor == nil || actor.Role != domain.RoleSteward {
		return &domain.ForbiddenError{Reason: "steward access required"}
	}
	if status != domain.AffiliatePayable && status != domain.AffiliatePaid && status != domain.AffiliateVoid {
		return errors.New("invalid affiliate conversion status")
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
func (s *CommerceService) BusinessOrders(ctx context.Context, actor *domain.Member, listingID string) ([]domain.CommerceOrder, error) {
	if _, err := s.businessOwned(ctx, actor, listingID); err != nil {
		return nil, err
	}
	return s.orders.ByBusiness(ctx, listingID)
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
		return errors.New("invalid order status")
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
		return errors.New("order status must advance from paid to processing, ready and fulfilled")
	}
	return s.orders.SetStatus(ctx, orderID, listingID, status, time.Now().UTC().Format(time.RFC3339))
}
