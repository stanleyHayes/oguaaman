package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

type commercePaystackFake struct {
	fakePaystack
	subaccount string
	splitFee   int64
}

func (f *commercePaystackFake) CreateSubaccount(context.Context, string, string, string) (string, error) {
	if f.subaccount == "" {
		f.subaccount = "ACCT_verified"
	}
	return f.subaccount, nil
}
func (f *commercePaystackFake) InitializeSplit(_ context.Context, _ string, _ int64, _, ref, callback, _ string, fee int64) (string, string, error) {
	f.splitFee = fee
	f.initCalls++
	return "https://pay.example/" + ref + "?cb=" + callback, "ACCESS_" + ref, nil
}

type verificationFake struct{ row *domain.BusinessVerification }

func (f *verificationFake) ByListing(_ context.Context, id string) (*domain.BusinessVerification, error) {
	if f.row == nil || f.row.ListingID != id {
		return nil, &domain.NotFoundError{Entity: "verification"}
	}
	copy := *f.row
	return &copy, nil
}
func (f *verificationFake) Upsert(_ context.Context, v domain.BusinessVerification) error {
	f.row = &v
	return nil
}
func (f *verificationFake) All(context.Context) ([]domain.BusinessVerification, error) {
	if f.row == nil {
		return nil, nil
	}
	return []domain.BusinessVerification{*f.row}, nil
}
func (f *verificationFake) Review(_ context.Context, _ string, status, note, reviewer, at, sub string) error {
	f.row.Status = status
	f.row.ReviewNote = note
	f.row.ReviewedByID = reviewer
	f.row.ReviewedAt = at
	if sub != "" {
		f.row.PaystackSubaccount = sub
	}
	return nil
}

type orderFake struct{ rows []domain.CommerceOrder }

func (f *orderFake) Insert(_ context.Context, o domain.CommerceOrder) error {
	f.rows = append(f.rows, o)
	return nil
}
func (f *orderFake) ByReference(_ context.Context, ref string) (*domain.CommerceOrder, error) {
	for i := range f.rows {
		if f.rows[i].Reference == ref {
			return &f.rows[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "order"}
}
func (f *orderFake) ByBuyer(_ context.Context, id string) ([]domain.CommerceOrder, error) {
	var out []domain.CommerceOrder
	for _, o := range f.rows {
		if o.BuyerID == id {
			out = append(out, o)
		}
	}
	return out, nil
}
func (f *orderFake) ByBusiness(_ context.Context, id string) ([]domain.CommerceOrder, error) {
	var out []domain.CommerceOrder
	for _, o := range f.rows {
		if o.ListingID == id {
			out = append(out, o)
		}
	}
	return out, nil
}
func (f *orderFake) All(context.Context) ([]domain.CommerceOrder, error) { return f.rows, nil }
func (f *orderFake) MarkPaid(_ context.Context, ref, at string) error {
	for i := range f.rows {
		if f.rows[i].Reference == ref {
			f.rows[i].Status = domain.OrderPaid
			f.rows[i].PaidAt = at
		}
	}
	return nil
}
func (f *orderFake) SetStatus(_ context.Context, id, lid, status, at string) error {
	for i := range f.rows {
		if f.rows[i].ID == id && f.rows[i].ListingID == lid {
			f.rows[i].Status = status
			f.rows[i].UpdatedAt = at
		}
	}
	return nil
}

type couponFake struct{ rows []domain.BusinessCoupon }

func (f *couponFake) Upsert(_ context.Context, c domain.BusinessCoupon) error {
	f.rows = append(f.rows, c)
	return nil
}
func (f *couponFake) ByCode(_ context.Context, lid, code string) (*domain.BusinessCoupon, error) {
	for i := range f.rows {
		if f.rows[i].ListingID == lid && f.rows[i].Code == code {
			return &f.rows[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "coupon"}
}
func (f *couponFake) ByBusiness(_ context.Context, lid string) ([]domain.BusinessCoupon, error) {
	var out []domain.BusinessCoupon
	for _, c := range f.rows {
		if c.ListingID == lid {
			out = append(out, c)
		}
	}
	return out, nil
}
func (f *couponFake) All(context.Context) ([]domain.BusinessCoupon, error) { return f.rows, nil }
func (f *couponFake) Reserve(_ context.Context, id string) error {
	for i := range f.rows {
		if f.rows[i].ID == id {
			if f.rows[i].RedemptionLimit > 0 && f.rows[i].Redemptions >= f.rows[i].RedemptionLimit {
				return &domain.ForbiddenError{Reason: "coupon unavailable"}
			}
			f.rows[i].Redemptions++
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "coupon"}
}
func (f *couponFake) Release(_ context.Context, id string) error {
	for i := range f.rows {
		if f.rows[i].ID == id && f.rows[i].Redemptions > 0 {
			f.rows[i].Redemptions--
		}
	}
	return nil
}
func (f *couponFake) Delete(context.Context, string, string) error { return nil }

type affiliateFake struct {
	programmes  []domain.AffiliateProgramme
	affiliates  []domain.Affiliate
	conversions []domain.AffiliateConversion
}

func (f *affiliateFake) SaveProgramme(_ context.Context, v domain.AffiliateProgramme) error {
	f.programmes = append(f.programmes, v)
	return nil
}
func (f *affiliateFake) Programmes(_ context.Context, lid string) ([]domain.AffiliateProgramme, error) {
	var out []domain.AffiliateProgramme
	for _, v := range f.programmes {
		if lid == "" || v.ListingID == lid {
			out = append(out, v)
		}
	}
	return out, nil
}
func (f *affiliateFake) Programme(_ context.Context, id string) (*domain.AffiliateProgramme, error) {
	for i := range f.programmes {
		if f.programmes[i].ID == id {
			return &f.programmes[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "programme"}
}
func (f *affiliateFake) SaveAffiliate(_ context.Context, v domain.Affiliate) error {
	f.affiliates = append(f.affiliates, v)
	return nil
}
func (f *affiliateFake) Affiliates(context.Context, string) ([]domain.Affiliate, error) {
	return f.affiliates, nil
}
func (f *affiliateFake) AffiliateByCode(_ context.Context, lid, code string) (*domain.Affiliate, error) {
	for i := range f.affiliates {
		if f.affiliates[i].Code == code && (f.affiliates[i].ListingID == lid || f.affiliates[i].ListingID == "*") {
			return &f.affiliates[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "affiliate"}
}
func (f *affiliateFake) ReserveConversion(_ context.Context, v domain.AffiliateConversion) error {
	f.conversions = append(f.conversions, v)
	return nil
}
func (f *affiliateFake) Convert(_ context.Context, ref, hold, at string) error {
	for i := range f.conversions {
		if f.conversions[i].OrderReference == ref {
			f.conversions[i].Status = domain.AffiliateConverted
			f.conversions[i].HoldUntil = hold
			f.conversions[i].UpdatedAt = at
		}
	}
	return nil
}
func (f *affiliateFake) Conversions(context.Context, string) ([]domain.AffiliateConversion, error) {
	return f.conversions, nil
}
func (f *affiliateFake) SetConversionStatus(context.Context, string, string, string) error {
	return nil
}

func TestCommerceVerificationSplitCheckoutAndConfirmation(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{{ID: "b1", Slug: "shop", Type: domain.TypeBusiness, OwnerID: "owner", Title: "Shop", Status: domain.StatusApproved, Products: []domain.StoreItem{{ID: "p1", Name: "Basket", PricePesewas: 10_000, Available: true}}}}}
	v := &verificationFake{}
	orders := &orderFake{}
	coupons := &couponFake{}
	paystack := &commercePaystackFake{fakePaystack: fakePaystack{verifyOK: true, verifyAmount: 9_000}}
	svc := NewCommerceService(listings, v, orders, coupons, nil, paystack, "https://oguaa.test", 5)
	owner := &domain.Member{ID: "owner"}
	_, err := svc.SubmitVerification(context.Background(), owner, "b1", BusinessVerificationInput{LegalName: "Oguaa Shop Ltd", RegistrationNumber: "CS123", GhanaCardNumber: "GHA-123456789-1", BusinessPhone: "0240000000", GhanaPostGPS: "CC-001-0001", Documents: []string{"https://files.test/reg", "https://files.test/front", "https://files.test/back"}, SettlementBankCode: "MTN", SettlementAccountNo: "0240000000", SettlementName: "Oguaa Shop Ltd"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = svc.ReviewVerification(context.Background(), &domain.Member{ID: "staff", Role: domain.RoleCurator}, "b1", domain.BusinessVerificationVerified, ""); err != nil {
		t.Fatal(err)
	}
	coupon, err := svc.SaveCoupon(context.Background(), owner, "b1", domain.BusinessCoupon{Code: "SAVE10", DiscountType: domain.CouponPercent, DiscountValue: 10, RedemptionLimit: 1, Active: true})
	if err != nil {
		t.Fatal(err)
	}
	if coupon.Code != "SAVE10" {
		t.Fatalf("code=%s", coupon.Code)
	}
	order, _, _, err := svc.StartOrder(context.Background(), "shop", &domain.Member{ID: "buyer"}, CheckoutInput{BuyerName: "Buyer", BuyerEmail: "buyer@test", BuyerPhone: "0200000000", Fulfilment: "pickup", CouponCode: "SAVE10", Lines: []CheckoutLineInput{{ProductID: "p1", Quantity: 1}}})
	if err != nil {
		t.Fatal(err)
	}
	if order.AmountPesewas != 9_000 || order.PlatformFeePesewas != 500 || order.BusinessNetPesewas != 8_500 {
		t.Fatalf("unexpected split: %+v", order)
	}
	if paystack.splitFee != 500 {
		t.Fatalf("transaction charge=%d", paystack.splitFee)
	}
	confirmed, err := svc.ConfirmOrder(context.Background(), order.Reference)
	if err != nil {
		t.Fatal(err)
	}
	if confirmed.Status != domain.OrderPaid {
		t.Fatalf("status=%s", confirmed.Status)
	}
}

func TestCommerceRejectsUnverifiedSeller(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{{ID: "b1", Slug: "shop", Type: domain.TypeBusiness, Status: domain.StatusApproved}}}
	svc := NewCommerceService(listings, &verificationFake{}, &orderFake{}, &couponFake{}, nil, &commercePaystackFake{}, "", 5)
	if _, _, _, err := svc.StartOrder(context.Background(), "shop", nil, CheckoutInput{}); err == nil {
		t.Fatal("expected verification gate")
	}
}

func TestCommerceAffiliateCommissionIsHeldInSplitAndConvertsAfterPayment(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{{ID: "b1", Slug: "shop", Type: domain.TypeBusiness, OwnerID: "owner", Title: "Shop", Status: domain.StatusApproved, Products: []domain.StoreItem{{ID: "p1", Name: "Basket", PricePesewas: 10_000, Available: true}}}}}
	affiliates := &affiliateFake{programmes: []domain.AffiliateProgramme{{ID: "ap1", ListingID: "b1", CommissionBps: 1000, FundingSource: domain.PromotionFundingBusiness, HoldDays: 14, Active: true}}, affiliates: []domain.Affiliate{{ID: "a1", ProgrammeID: "ap1", ListingID: "b1", Code: "AMA10", Email: "ama@test", Active: true}}}
	paystack := &commercePaystackFake{fakePaystack: fakePaystack{verifyOK: true, verifyAmount: 10_000}}
	svc := NewCommerceService(listings, &verificationFake{row: &domain.BusinessVerification{ListingID: "b1", Status: domain.BusinessVerificationVerified, PaystackSubaccount: "ACCT"}}, &orderFake{}, &couponFake{}, affiliates, paystack, "https://oguaa.test", 5)
	o, _, _, err := svc.StartOrder(context.Background(), "shop", nil, CheckoutInput{BuyerName: "Buyer", BuyerEmail: "buyer@test", BuyerPhone: "020", Fulfilment: "pickup", AffiliateCode: "AMA10", Lines: []CheckoutLineInput{{ProductID: "p1", Quantity: 1}}})
	if err != nil {
		t.Fatal(err)
	}
	if o.AffiliateCommissionPesewas != 1_000 || o.BusinessNetPesewas != 8_500 || paystack.splitFee != 1_500 {
		t.Fatalf("affiliate split mismatch: order=%+v charge=%d", o, paystack.splitFee)
	}
	if _, err = svc.ConfirmOrder(context.Background(), o.Reference); err != nil {
		t.Fatal(err)
	}
	if affiliates.conversions[0].Status != domain.AffiliateConverted || affiliates.conversions[0].HoldUntil == "" {
		t.Fatalf("conversion not held: %+v", affiliates.conversions[0])
	}
}
