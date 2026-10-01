package service

import (
	"context"
	"errors"
	"testing"
	"time"

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
	row := *f.row
	return &row, nil
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

func (f *verificationFake) SetPaystackSubaccount(_ context.Context, id, sub, at string) error {
	if f.row != nil && f.row.ListingID == id {
		f.row.PaystackSubaccount, f.row.UpdatedAt = sub, at
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
			row := f.rows[i]
			return &row, nil
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

// MarkPaid mirrors the conditional pending→paid update: only the first call
// for a pending order reports a win.
func (f *orderFake) MarkPaid(_ context.Context, ref, at string, fee int64) (bool, error) {
	for i := range f.rows {
		claimable := f.rows[i].Status == domain.OrderPending ||
			(f.rows[i].Status == domain.OrderCancelled && f.rows[i].CancelReason == domain.AbandonedPaymentReason)
		if f.rows[i].Reference == ref && claimable {
			f.rows[i].Status = domain.OrderPaid
			f.rows[i].CancelReason = ""
			f.rows[i].PaidAt = at
			f.rows[i].ProcessingFeePesewas = fee
			f.rows[i].BusinessNetPesewas -= fee
			return true, nil
		}
	}
	return false, nil
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

// couponFake mirrors BusinessCouponRepo: Upsert replaces on {_id, listingId}.
type couponFake struct{ rows []domain.BusinessCoupon }

func (f *couponFake) Upsert(_ context.Context, c domain.BusinessCoupon) error {
	for i := range f.rows {
		if f.rows[i].ID == c.ID {
			if f.rows[i].ListingID != c.ListingID {
				return errors.New("duplicate key")
			}
			f.rows[i] = c
			return nil
		}
	}
	f.rows = append(f.rows, c)
	return nil
}
func (f *couponFake) ByCode(_ context.Context, lid, code string) (*domain.BusinessCoupon, error) {
	for _, want := range []string{lid, "*"} {
		for i := range f.rows {
			if f.rows[i].ListingID == want && f.rows[i].Code == code {
				row := f.rows[i]
				return &row, nil
			}
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
func (f *couponFake) Redeem(_ context.Context, id string) error {
	for i := range f.rows {
		if f.rows[i].ID == id {
			f.rows[i].Redemptions++
			return nil
		}
	}
	return nil
}
func (f *couponFake) Delete(context.Context, string, string) error { return nil }

// affiliateFake mirrors AffiliateRepo, including its {_id, listingId} upserts
// (an id owned by another listing collides instead of being replaced).
type affiliateFake struct {
	programmes  []domain.AffiliateProgramme
	affiliates  []domain.Affiliate
	conversions []domain.AffiliateConversion
}

var errFakeDuplicateKey = errors.New("duplicate key")

func (f *affiliateFake) SaveProgramme(_ context.Context, v domain.AffiliateProgramme) error {
	for i := range f.programmes {
		if f.programmes[i].ID == v.ID {
			if f.programmes[i].ListingID != v.ListingID {
				return errFakeDuplicateKey
			}
			f.programmes[i] = v
			return nil
		}
	}
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
			row := f.programmes[i]
			return &row, nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "programme"}
}
func (f *affiliateFake) SaveAffiliate(_ context.Context, v domain.Affiliate) error {
	for i := range f.affiliates {
		if f.affiliates[i].ID == v.ID {
			if f.affiliates[i].ListingID != v.ListingID {
				return errFakeDuplicateKey
			}
			f.affiliates[i] = v
			return nil
		}
	}
	f.affiliates = append(f.affiliates, v)
	return nil
}
func (f *affiliateFake) AffiliateByID(_ context.Context, id string) (*domain.Affiliate, error) {
	for i := range f.affiliates {
		if f.affiliates[i].ID == id {
			row := f.affiliates[i]
			return &row, nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "affiliate"}
}
func (f *affiliateFake) Affiliates(_ context.Context, lid, programmeID string) ([]domain.Affiliate, error) {
	var out []domain.Affiliate
	for _, a := range f.affiliates {
		if a.ListingID == lid && (programmeID == "" || a.ProgrammeID == programmeID) {
			out = append(out, a)
		}
	}
	return out, nil
}
func (f *affiliateFake) AffiliateByCode(_ context.Context, lid, code string) (*domain.Affiliate, error) {
	for i := range f.affiliates {
		if f.affiliates[i].Code == code && f.affiliates[i].Active && (f.affiliates[i].ListingID == lid || f.affiliates[i].ListingID == "*") {
			row := f.affiliates[i]
			return &row, nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "affiliate"}
}
func (f *affiliateFake) RecordConversion(_ context.Context, v domain.AffiliateConversion) error {
	for i := range f.conversions {
		if f.conversions[i].OrderReference == v.OrderReference {
			if f.conversions[i].Status == domain.AffiliateReserved || f.conversions[i].Status == v.Status {
				f.conversions[i].Status, f.conversions[i].HoldUntil, f.conversions[i].UpdatedAt = v.Status, v.HoldUntil, v.UpdatedAt
			}
			return nil
		}
	}
	f.conversions = append(f.conversions, v)
	return nil
}
func (f *affiliateFake) Conversions(context.Context, string) ([]domain.AffiliateConversion, error) {
	return f.conversions, nil
}
func (f *affiliateFake) SetConversionStatus(context.Context, string, string, string) error {
	return nil
}

// ── fixtures ─────────────────────────────────────────────────────────────────

var privateKYCDocs = []string{"private:reg-1", "private:card-front", "private:card-back"}

func commerceShop(products ...domain.StoreItem) domain.Listing {
	if len(products) == 0 {
		products = []domain.StoreItem{{ID: "p1", Name: "Basket", PricePesewas: 10_000, Available: true}}
	}
	return domain.Listing{ID: "b1", Slug: "shop", Type: domain.TypeBusiness, OwnerID: "owner", Title: "Shop", Status: domain.StatusApproved, Products: products}
}

func commerceVerifiedShop() *verificationFake {
	return &verificationFake{row: &domain.BusinessVerification{ListingID: "b1", Status: domain.BusinessVerificationVerified, PaystackSubaccount: "ACCT", LegalName: "Oguaa Shop Ltd", GhanaPostGPS: "CR-001-0001", BusinessPhone: "0240000000", RegistrationNumber: "CS123", GhanaCardNumber: "GHA-123456789-1", SettlementAccountNo: "0240000000", ReviewedAt: "2026-09-01T00:00:00Z"}}
}

func commerceBasket(product string, qty int) CheckoutInput {
	return CheckoutInput{BuyerName: "Buyer", BuyerEmail: "buyer@test", BuyerPhone: "0200000000", Fulfilment: "pickup", Lines: []CheckoutLineInput{{ProductID: product, Quantity: qty}}}
}

func isCommerceValidation(err error) bool {
	var ve *domain.ValidationError
	return errors.As(err, &ve)
}

func isCommerceForbidden(err error) bool {
	var fb *domain.ForbiddenError
	return errors.As(err, &fb)
}

// ── tests ────────────────────────────────────────────────────────────────────

func TestCommerceVerificationSplitCheckoutAndConfirmation(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{commerceShop()}}
	v := &verificationFake{}
	orders := &orderFake{}
	coupons := &couponFake{}
	paystack := &commercePaystackFake{fakePaystack: fakePaystack{verifyOK: true, verifyAmount: 9_000}}
	svc := NewCommerceService(listings, v, orders, coupons, nil, paystack, "https://oguaa.test", 5)
	owner := &domain.Member{ID: "owner"}
	_, err := svc.SubmitVerification(context.Background(), owner, "b1", BusinessVerificationInput{LegalName: "Oguaa Shop Ltd", RegistrationNumber: "CS123", GhanaCardNumber: "GHA-123456789-1", BusinessPhone: "0240000000", GhanaPostGPS: "CC-001-0001", Documents: privateKYCDocs, SettlementBankCode: "MTN", SettlementAccountNo: "0240000000", SettlementName: "Oguaa Shop Ltd"})
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
	in := commerceBasket("p1", 1)
	in.CouponCode = "SAVE10"
	order, _, _, err := svc.StartOrder(context.Background(), "shop", &domain.Member{ID: "buyer"}, in)
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
	if coupons.rows[0].Redemptions != 1 {
		t.Fatalf("redemptions=%d, want the paid order counted once", coupons.rows[0].Redemptions)
	}
	// A second confirmation (webhook + redirect) must not count it again.
	if _, err = svc.ConfirmOrder(context.Background(), order.Reference); err != nil {
		t.Fatal(err)
	}
	if coupons.rows[0].Redemptions != 1 {
		t.Fatalf("redemptions=%d after a repeat confirm", coupons.rows[0].Redemptions)
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
	listings := &fakeRepo{listings: []domain.Listing{commerceShop()}}
	affiliates := &affiliateFake{programmes: []domain.AffiliateProgramme{{ID: "ap1", ListingID: "b1", CommissionBps: 1000, FundingSource: domain.PromotionFundingBusiness, HoldDays: 14, Active: true}}, affiliates: []domain.Affiliate{{ID: "a1", ProgrammeID: "ap1", ListingID: "b1", Code: "AMA10", Email: "ama@test", Active: true}}}
	paystack := &commercePaystackFake{fakePaystack: fakePaystack{verifyOK: true, verifyAmount: 10_000}}
	svc := NewCommerceService(listings, commerceVerifiedShop(), &orderFake{}, &couponFake{}, affiliates, paystack, "https://oguaa.test", 5)
	in := commerceBasket("p1", 1)
	in.AffiliateCode = "AMA10"
	o, _, _, err := svc.StartOrder(context.Background(), "shop", nil, in)
	if err != nil {
		t.Fatal(err)
	}
	if o.AffiliateCommissionPesewas != 1_000 || o.BusinessNetPesewas != 8_500 || paystack.splitFee != 1_500 {
		t.Fatalf("affiliate split mismatch: order=%+v charge=%d", o, paystack.splitFee)
	}
	if len(affiliates.conversions) != 0 {
		t.Fatal("an unpaid checkout recorded a conversion (it would show as pending commission forever)")
	}
	if _, err = svc.ConfirmOrder(context.Background(), o.Reference); err != nil {
		t.Fatal(err)
	}
	if len(affiliates.conversions) != 1 || affiliates.conversions[0].Status != domain.AffiliateConverted || affiliates.conversions[0].HoldUntil == "" {
		t.Fatalf("conversion not held: %+v", affiliates.conversions)
	}
	if affiliates.conversions[0].FundingSource != domain.PromotionFundingBusiness {
		t.Fatalf("conversion funding=%q", affiliates.conversions[0].FundingSource)
	}
}

// F042: an owner must only ever see their own business's affiliates.
func TestAffiliatesAreScopedToTheCallersListing(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{commerceShop(), {ID: "b2", Slug: "other", Type: domain.TypeBusiness, OwnerID: "rival", Status: domain.StatusPending}}}
	affiliates := &affiliateFake{
		programmes: []domain.AffiliateProgramme{{ID: "ap1", ListingID: "b1"}, {ID: "ap2", ListingID: "b2"}, {ID: "ap-oguaa", ListingID: "*"}},
		affiliates: []domain.Affiliate{
			{ID: "a1", ProgrammeID: "ap1", ListingID: "b1", Email: "partner@b1.test", PayoutPhone: "0241"},
			{ID: "a2", ProgrammeID: "ap2", ListingID: "b2", Email: "partner@b2.test", PayoutPhone: "0242"},
			{ID: "a3", ProgrammeID: "ap-oguaa", ListingID: "*", Email: "ambassador@oguaa.test", PayoutPhone: "0243"},
		},
	}
	svc := NewCommerceService(listings, commerceVerifiedShop(), &orderFake{}, &couponFake{}, affiliates, &commercePaystackFake{}, "", 5)
	rival := &domain.Member{ID: "rival"}
	for _, programme := range []string{"", "ap1", "ap-oguaa"} {
		rows, err := svc.Affiliates(context.Background(), rival, "b2", programme)
		if err != nil {
			t.Fatal(err)
		}
		for _, a := range rows {
			if a.ListingID != "b2" {
				t.Fatalf("programme %q leaked another scope's affiliate: %+v", programme, a)
			}
		}
	}
	if _, err := svc.Affiliates(context.Background(), rival, "*", ""); !isCommerceForbidden(err) {
		t.Fatalf("a member listed Oguaa's platform affiliates: %v", err)
	}
	if _, err := svc.Affiliates(context.Background(), rival, "b1", ""); !isCommerceForbidden(err) {
		t.Fatalf("a member listed another business's affiliates: %v", err)
	}
}

func TestCommerceManagementNeedsABusinessListing(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{{ID: "e1", Slug: "gig", Type: domain.TypeEvent, OwnerID: "m1", Status: domain.StatusApproved}}}
	svc := NewCommerceService(listings, &verificationFake{}, &orderFake{}, &couponFake{}, &affiliateFake{}, &commercePaystackFake{}, "", 5)
	if _, err := svc.Coupons(context.Background(), &domain.Member{ID: "m1"}, "e1"); !isCommerceForbidden(err) {
		t.Fatalf("an event owner managed commerce: %v", err)
	}
}

// F043: a client-supplied programme id must never take over another scope's
// programme, and new programmes get server ids.
func TestSaveAffiliateProgrammeCannotTakeOverAnotherScope(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{commerceShop(), {ID: "b2", Slug: "attacker", Type: domain.TypeBusiness, OwnerID: "attacker", Status: domain.StatusApproved}}}
	victim := domain.AffiliateProgramme{ID: "afp-123", ListingID: "b1", Name: "Partners", CommissionBps: 1000, FundingSource: domain.PromotionFundingBusiness, Active: true}
	platform := domain.AffiliateProgramme{ID: "afp-oguaa", ListingID: "*", Name: "Ambassadors", CommissionBps: 300, FundingSource: domain.PromotionFundingPlatform, Active: true}
	affiliates := &affiliateFake{programmes: []domain.AffiliateProgramme{victim, platform}}
	svc := NewCommerceService(listings, commerceVerifiedShop(), &orderFake{}, &couponFake{}, affiliates, &commercePaystackFake{}, "", 5)
	attacker := &domain.Member{ID: "attacker"}
	for _, id := range []string{"afp-123", "afp-oguaa"} {
		_, err := svc.SaveAffiliateProgramme(context.Background(), attacker, "b2", domain.AffiliateProgramme{ID: id, Name: "x", CommissionBps: 5000, Active: true})
		if !isCommerceForbidden(err) {
			t.Fatalf("overwrite of %s: err=%v, want forbidden", id, err)
		}
	}
	if got, _ := affiliates.Programme(context.Background(), "afp-123"); got.ListingID != "b1" || got.CommissionBps != 1000 {
		t.Fatalf("victim programme changed: %+v", got)
	}
	if got, _ := affiliates.Programme(context.Background(), "afp-oguaa"); got.ListingID != "*" || got.FundingSource != domain.PromotionFundingPlatform {
		t.Fatalf("platform programme changed: %+v", got)
	}
	created, err := svc.SaveAffiliateProgramme(context.Background(), attacker, "b2", domain.AffiliateProgramme{ID: "afp-made-up", Name: "Mine", CommissionBps: 500, Active: true})
	if err != nil {
		t.Fatal(err)
	}
	if created.ID == "afp-made-up" || created.ListingID != "b2" {
		t.Fatalf("new programme kept the client id or scope: %+v", created)
	}
	// The owner can still edit their own programme in place.
	created.CommissionBps = 800
	edited, err := svc.SaveAffiliateProgramme(context.Background(), attacker, "b2", *created)
	if err != nil || edited.ID != created.ID {
		t.Fatalf("own edit: %+v %v", edited, err)
	}
}

// F044: a client-supplied affiliate id must never hijack another business's
// affiliate (and its payout number).
func TestSaveAffiliateCannotHijackAnotherBusinessesAffiliate(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{commerceShop(), {ID: "b2", Slug: "attacker", Type: domain.TypeBusiness, OwnerID: "attacker", Status: domain.StatusApproved}}}
	affiliates := &affiliateFake{
		programmes: []domain.AffiliateProgramme{{ID: "ap1", ListingID: "b1"}, {ID: "ap-att", ListingID: "b2"}},
		affiliates: []domain.Affiliate{{ID: "aff-999", ProgrammeID: "ap1", ListingID: "b1", Code: "AMA10", Name: "Ama", Email: "ama@test", PayoutPhone: "0241111111", Active: true}},
	}
	svc := NewCommerceService(listings, commerceVerifiedShop(), &orderFake{}, &couponFake{}, affiliates, &commercePaystackFake{}, "", 5)
	_, err := svc.SaveAffiliate(context.Background(), &domain.Member{ID: "attacker"}, "b2", domain.Affiliate{ID: "aff-999", ProgrammeID: "ap-att", Code: "MINE1", Name: "x", Email: "a@x.com", PayoutPhone: "0249999999", Active: true})
	if !isCommerceForbidden(err) {
		t.Fatalf("hijack err=%v, want forbidden", err)
	}
	if got, _ := affiliates.AffiliateByID(context.Background(), "aff-999"); got.ListingID != "b1" || got.PayoutPhone != "0241111111" {
		t.Fatalf("victim affiliate changed: %+v", got)
	}
	// Using another business's programme is refused as well.
	if _, err = svc.SaveAffiliate(context.Background(), &domain.Member{ID: "attacker"}, "b2", domain.Affiliate{ProgrammeID: "ap1", Code: "MINE2", Name: "x", Email: "a@x.com", Active: true}); !isCommerceForbidden(err) {
		t.Fatalf("foreign programme err=%v, want forbidden", err)
	}
}

// F050: attribution is best-effort — a stale, foreign, paused or self-referral
// code never blocks the sale.
func TestCheckoutDropsIneligibleAffiliateCodes(t *testing.T) {
	cases := map[string]struct {
		affiliates *affiliateFake
		buyerEmail string
	}{
		"code from another shop":     {affiliates: &affiliateFake{programmes: []domain.AffiliateProgramme{{ID: "ap2", ListingID: "b2", CommissionBps: 1000, Active: true}}, affiliates: []domain.Affiliate{{ID: "a2", ProgrammeID: "ap2", ListingID: "b2", Code: "AMA10", Email: "ama@test", Active: true}}}},
		"paused programme":           {affiliates: &affiliateFake{programmes: []domain.AffiliateProgramme{{ID: "ap1", ListingID: "b1", CommissionBps: 1000}}, affiliates: []domain.Affiliate{{ID: "a1", ProgrammeID: "ap1", ListingID: "b1", Code: "AMA10", Email: "ama@test", Active: true}}}},
		"paused affiliate":           {affiliates: &affiliateFake{programmes: []domain.AffiliateProgramme{{ID: "ap1", ListingID: "b1", CommissionBps: 1000, Active: true}}, affiliates: []domain.Affiliate{{ID: "a1", ProgrammeID: "ap1", ListingID: "b1", Code: "AMA10", Email: "ama@test", Status: "paused", Active: true}}}},
		"buyer is the affiliate":     {affiliates: &affiliateFake{programmes: []domain.AffiliateProgramme{{ID: "ap1", ListingID: "b1", CommissionBps: 1000, Active: true}}, affiliates: []domain.Affiliate{{ID: "a1", ProgrammeID: "ap1", ListingID: "b1", Code: "AMA10", Email: "buyer@test", Active: true}}}},
		"programme of another scope": {affiliates: &affiliateFake{programmes: []domain.AffiliateProgramme{{ID: "ap2", ListingID: "b2", CommissionBps: 1000, Active: true}}, affiliates: []domain.Affiliate{{ID: "a1", ProgrammeID: "ap2", ListingID: "b1", Code: "AMA10", Email: "ama@test", Active: true}}}},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			listings := &fakeRepo{listings: []domain.Listing{commerceShop()}}
			paystack := &commercePaystackFake{}
			svc := NewCommerceService(listings, commerceVerifiedShop(), &orderFake{}, &couponFake{}, tc.affiliates, paystack, "", 5)
			in := commerceBasket("p1", 1)
			in.AffiliateCode = "AMA10"
			o, _, _, err := svc.StartOrder(context.Background(), "shop", nil, in)
			if err != nil {
				t.Fatalf("checkout refused over an affiliate code: %v", err)
			}
			if o.AffiliateCode != "" || o.AffiliateCommissionPesewas != 0 || o.BusinessNetPesewas != 9_500 || paystack.splitFee != 500 {
				t.Fatalf("ineligible code still attributed: %+v charge=%d", o, paystack.splitFee)
			}
		})
	}
}

// F046/F052: a coupon with no limit works, and unpaid checkouts never use a
// limited coupon up.
func TestCouponRedemptionsAreCountedOnlyWhenPaid(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{commerceShop()}}
	coupons := &couponFake{rows: []domain.BusinessCoupon{
		{ID: "c-unlimited", ListingID: "b1", Code: "SAVE10", DiscountType: domain.CouponPercent, DiscountValue: 10, Active: true, FundingSource: domain.PromotionFundingBusiness},
		{ID: "c-limited", ListingID: "b1", Code: "FIRST1", DiscountType: domain.CouponPercent, DiscountValue: 10, RedemptionLimit: 1, Active: true, FundingSource: domain.PromotionFundingBusiness},
	}}
	orders := &orderFake{}
	svc := NewCommerceService(listings, commerceVerifiedShop(), orders, coupons, nil, &commercePaystackFake{fakePaystack: fakePaystack{verifyOK: false}}, "", 5)
	for i := 0; i < 5; i++ {
		for _, code := range []string{"SAVE10", "FIRST1"} {
			in := commerceBasket("p1", 1)
			in.CouponCode = code
			if _, _, _, err := svc.StartOrder(context.Background(), "shop", nil, in); err != nil {
				t.Fatalf("abandoned checkout %d with %s: %v", i, code, err)
			}
		}
	}
	for _, c := range coupons.rows {
		if c.Redemptions != 0 {
			t.Fatalf("%s counted %d redemptions for unpaid orders", c.Code, c.Redemptions)
		}
	}
	// Unpaid confirmations are refused with a 400-class error, not a 500.
	if _, err := svc.ConfirmOrder(context.Background(), orders.rows[0].Reference); !isCommerceValidation(err) {
		t.Fatalf("unverified payment err=%v, want a validation error", err)
	}
}

// F053: Oguaa-funded promotions and programmes are paid from Oguaa's fee, so
// values that equal or exceed it are refused when saved, not at every checkout.
func TestPlatformFundedTermsMustFitInsideTheFee(t *testing.T) {
	steward := &domain.Member{ID: "s", Role: domain.RoleSteward}
	listings := &fakeRepo{listings: []domain.Listing{commerceShop()}}
	coupons := &couponFake{}
	affiliates := &affiliateFake{}
	svc := NewCommerceService(listings, commerceVerifiedShop(), &orderFake{}, coupons, affiliates, &commercePaystackFake{}, "", 5)
	if _, err := svc.SavePlatformPromotion(context.Background(), steward, domain.BusinessCoupon{Code: "OGUAA5", DiscountType: domain.CouponPercent, DiscountValue: 5, Active: true}); !isCommerceValidation(err) {
		t.Fatalf("a 5%% promotion against a 5%% fee saved: %v", err)
	}
	if _, err := svc.SavePlatformPromotion(context.Background(), steward, domain.BusinessCoupon{Code: "OGUAA10", DiscountType: domain.CouponFixed, DiscountValue: 1_000, Active: true}); !isCommerceValidation(err) {
		t.Fatalf("a fixed promotion with no covering minimum basket saved: %v", err)
	}
	if _, err := svc.SaveAffiliateProgramme(context.Background(), steward, "*", domain.AffiliateProgramme{Name: "Ambassadors", CommissionBps: 500, FundingSource: domain.PromotionFundingPlatform, Active: true}); !isCommerceValidation(err) {
		t.Fatalf("a 500 bps Oguaa-funded programme saved: %v", err)
	}
	if _, err := svc.SavePlatformPromotion(context.Background(), steward, domain.BusinessCoupon{Code: "OGUAA4", DiscountType: domain.CouponPercent, DiscountValue: 4, Active: true}); err != nil {
		t.Fatalf("a 4%% promotion was refused: %v", err)
	}
	in := commerceBasket("p1", 1)
	in.CouponCode = "OGUAA4"
	o, _, _, err := svc.StartOrder(context.Background(), "shop", nil, in)
	if err != nil {
		t.Fatalf("checkout with a valid platform promotion: %v", err)
	}
	if o.AmountPesewas != 9_600 || o.PlatformFeePesewas != 100 || o.BusinessNetPesewas != 9_500 {
		t.Fatalf("platform-funded split: %+v", o)
	}
}

// F062: a business-funded coupon can't push the business's share below zero.
func TestCheckoutRefusesACouponLargerThanTheOrderCanCarry(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{commerceShop(domain.StoreItem{ID: "p1", Name: "Cloth", PricePesewas: 3_000, Available: true})}}
	coupons := &couponFake{rows: []domain.BusinessCoupon{{ID: "c1", ListingID: "b1", Code: "BIG", DiscountType: domain.CouponFixed, DiscountValue: 2_900, Active: true, FundingSource: domain.PromotionFundingBusiness}}}
	paystack := &commercePaystackFake{}
	svc := NewCommerceService(listings, commerceVerifiedShop(), &orderFake{}, coupons, nil, paystack, "", 5)
	in := commerceBasket("p1", 1)
	in.CouponCode = "BIG"
	if _, _, _, err := svc.StartOrder(context.Background(), "shop", nil, in); !isCommerceValidation(err) {
		t.Fatalf("err=%v, want a validation refusal", err)
	}
	if paystack.initCalls != 0 {
		t.Fatal("Paystack was asked to split more than the charge")
	}
}

// Business-funded commission is capped so the business keeps a positive net.
func TestBusinessFundedCommissionIsCappedToTheBusinessShare(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{commerceShop()}}
	coupons := &couponFake{rows: []domain.BusinessCoupon{{ID: "c1", ListingID: "b1", Code: "HALF", DiscountType: domain.CouponPercent, DiscountValue: 90, Active: true, FundingSource: domain.PromotionFundingBusiness}}}
	affiliates := &affiliateFake{programmes: []domain.AffiliateProgramme{{ID: "ap1", ListingID: "b1", CommissionBps: 5000, FundingSource: domain.PromotionFundingBusiness, Active: true}}, affiliates: []domain.Affiliate{{ID: "a1", ProgrammeID: "ap1", ListingID: "b1", Code: "AMA10", Email: "ama@test", Active: true}}}
	paystack := &commercePaystackFake{}
	svc := NewCommerceService(listings, commerceVerifiedShop(), &orderFake{}, coupons, affiliates, paystack, "", 5)
	in := commerceBasket("p1", 1)
	in.CouponCode, in.AffiliateCode = "HALF", "AMA10"
	o, _, _, err := svc.StartOrder(context.Background(), "shop", nil, in)
	if err != nil {
		t.Fatal(err)
	}
	if o.BusinessNetPesewas < 1 || paystack.splitFee >= o.AmountPesewas {
		t.Fatalf("split exceeds the charge: %+v charge=%d", o, paystack.splitFee)
	}
}

// P062: digital goods never go through checkout; duplicated ids resolve to
// the first item (the one the product page shows).
func TestCheckoutSellsOnlyPhysicalGoodsAndServices(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{commerceShop(
		domain.StoreItem{ID: "p1", Name: "Kente", PricePesewas: 2_000, Available: true, Kind: domain.StoreItemPhysical},
		domain.StoreItem{ID: "p1", Name: "Shadow", PricePesewas: 15_000, Available: true},
		domain.StoreItem{ID: "ebook", Name: "E-book", PricePesewas: 1_000, Available: true, Kind: "digital"},
	)}}
	svc := NewCommerceService(listings, commerceVerifiedShop(), &orderFake{}, &couponFake{}, nil, &commercePaystackFake{}, "", 5)
	if _, _, _, err := svc.StartOrder(context.Background(), "shop", nil, commerceBasket("ebook", 1)); !isCommerceValidation(err) {
		t.Fatalf("digital product err=%v, want refused", err)
	}
	o, _, _, err := svc.StartOrder(context.Background(), "shop", nil, commerceBasket("p1", 1))
	if err != nil {
		t.Fatal(err)
	}
	if o.Lines[0].Name != "Kente" || o.AmountPesewas != 2_000 {
		t.Fatalf("duplicate id charged for the wrong product: %+v", o.Lines)
	}
}

// Contract K8: KYC evidence must be private upload refs; values already on
// record stay acceptable.
func TestKYCDocumentsMustBePrivateUploads(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{commerceShop()}}
	v := &verificationFake{}
	svc := NewCommerceService(listings, v, &orderFake{}, &couponFake{}, nil, &commercePaystackFake{}, "", 5)
	in := BusinessVerificationInput{LegalName: "Oguaa Shop Ltd", RegistrationNumber: "CS123", GhanaCardNumber: "GHA-123456789-1", BusinessPhone: "0240000000", GhanaPostGPS: "CC-001-0001", SettlementBankCode: "MTN", SettlementAccountNo: "0240000000", SettlementName: "Oguaa Shop Ltd"}
	in.Documents = []string{"private:reg", "https://res.cloudinary.com/x/card-front.jpg", "private:back"}
	_, err := svc.SubmitVerification(context.Background(), &domain.Member{ID: "owner"}, "b1", in)
	if !isCommerceValidation(err) || err.Error() != msgIDNeedsPrivateUpload {
		t.Fatalf("public ID URL err=%v", err)
	}
	// A legacy record keeps its old https documents readable on resubmission.
	v.row = &domain.BusinessVerification{ID: "bvr-b1", ListingID: "b1", Documents: []string{"https://res.cloudinary.com/x/card-front.jpg"}}
	if _, err = svc.SubmitVerification(context.Background(), &domain.Member{ID: "owner"}, "b1", in); err != nil {
		t.Fatalf("unchanged legacy document refused: %v", err)
	}
}

// Contract K19: the commerce status carries the verified seller identity and
// nothing private.
func TestCommerceStatusShowsTheVerifiedSeller(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{commerceShop()}}
	v := commerceVerifiedShop()
	v.row.BusinessEmail = "hello@shop.test"
	svc := NewCommerceService(listings, v, &orderFake{}, &couponFake{}, nil, &commercePaystackFake{}, "", 5)
	st := svc.Status(context.Background(), "shop")
	if !st.Enabled || st.Seller == nil {
		t.Fatalf("status=%+v", st)
	}
	if st.Seller.LegalName != "Oguaa Shop Ltd" || st.Seller.Location != "CR-001-0001" || st.Seller.ContactEmail != "hello@shop.test" || st.Seller.ContactPhone != "0240000000" {
		t.Fatalf("seller=%+v", st.Seller)
	}
	v.row.Status = domain.BusinessVerificationPending
	if st = svc.Status(context.Background(), "shop"); st.Enabled || st.Seller != nil {
		t.Fatalf("an unverified seller was shown: %+v", st)
	}
}

// Contract K20 / G103: contacts only for the buyer and the seller, and the
// seller loses them once the order is done.
func TestBuyerContactsAreOnlyForTheBuyerAndSeller(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{commerceShop()}}
	svc := NewCommerceService(listings, commerceVerifiedShop(), &orderFake{}, &couponFake{}, nil, &commercePaystackFake{}, "", 5)
	o := &domain.CommerceOrder{ListingID: "b1", BuyerID: "buyer"}
	for name, tc := range map[string]struct {
		viewer        *domain.Member
		buyer, seller bool
	}{
		"anonymous": {viewer: nil},
		"stranger":  {viewer: &domain.Member{ID: "stranger"}},
		"buyer":     {viewer: &domain.Member{ID: "buyer"}, buyer: true},
		"seller":    {viewer: &domain.Member{ID: "owner"}, seller: true},
	} {
		b, s := svc.BuyerContactVisible(context.Background(), o, tc.viewer)
		if b != tc.buyer || s != tc.seller {
			t.Errorf("%s: buyer=%v seller=%v", name, b, s)
		}
	}
	now := time.Date(2026, 9, 30, 12, 0, 0, 0, time.UTC)
	live := domain.CommerceOrder{Status: domain.OrderReady, BuyerName: "Ama Mensah", BuyerPhone: "0240000000", BuyerEmail: "ama@test", DeliveryAddress: "Adisadel"}
	if got := SellerOrderView(live, now); got.BuyerPhone == "" || got.BuyerContactHidden {
		t.Fatalf("an order being fulfilled lost its contact: %+v", got)
	}
	old := live
	old.Status, old.UpdatedAt = domain.OrderFulfilled, now.Add(-40*24*time.Hour).Format(time.RFC3339)
	got := SellerOrderView(old, now)
	if !got.BuyerContactHidden || got.BuyerPhone != "" || got.BuyerEmail != "" || got.DeliveryAddress != "" || got.BuyerName != "A." {
		t.Fatalf("a long-fulfilled order kept buyer contacts: %+v", got)
	}
	pending := live
	pending.Status = domain.OrderPending
	if got := SellerOrderView(pending, now); !got.BuyerContactHidden {
		t.Fatal("an unpaid order exposed buyer contacts to the seller")
	}
}

// F061: checkout validation problems are ValidationErrors (HTTP 400).
func TestCheckoutValidationErrorsAreValidationErrors(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{commerceShop()}}
	svc := NewCommerceService(listings, commerceVerifiedShop(), &orderFake{}, &couponFake{}, nil, &commercePaystackFake{}, "", 5)
	in := commerceBasket("p1", 1)
	in.Fulfilment = "delivery"
	if _, _, _, err := svc.StartOrder(context.Background(), "shop", nil, in); !isCommerceValidation(err) || err.Error() != "delivery address is required" {
		t.Fatalf("err=%v", err)
	}
	if _, _, _, err := svc.StartOrder(context.Background(), "shop", nil, commerceBasket("nope", 1)); !isCommerceValidation(err) {
		t.Fatalf("unknown product err=%v", err)
	}
}

// P23: a malformed buyer email is refused before an order or a Paystack
// transaction exists.
func TestCheckoutInput_rejectsMalformedBuyerEmail(t *testing.T) {
	for _, email := range []string{"not-an-email", "Ama <ama@example.com>", "ama@example.com, kofi@example.com", "ama@"} {
		in := commerceBasket("p-1", 1)
		in.BuyerEmail = email
		in.normalise()
		if err := in.validate(); err == nil {
			t.Errorf("%q accepted", email)
		}
	}
	in := commerceBasket("p-1", 1)
	in.BuyerEmail = "ama@example.com"
	if err := in.validate(); err != nil {
		t.Fatalf("valid email refused: %v", err)
	}
}

// feePaystack reports Paystack's processing fee on every verified charge.
type feePaystack struct {
	commercePaystackFake
	fee int64
}

func (f *feePaystack) Verify(ctx context.Context, ref string) (PaymentCheck, error) {
	c, err := f.commercePaystackFake.Verify(ctx, ref)
	c.FeesPesewas = f.fee
	return c, err
}

// P15: the seller's subaccount bears Paystack's fee (bearer=subaccount), so a
// paid order records the fee and its business net is what the seller gets.
func TestConfirmOrder_recordsSellerBorneProcessingFee(t *testing.T) {
	ctx := context.Background()
	orders := &orderFake{}
	ps := &feePaystack{commercePaystackFake: commercePaystackFake{fakePaystack: fakePaystack{verifyOK: true, verifyAmount: 10_000}}, fee: 195}
	svc := NewCommerceService(&fakeRepo{listings: []domain.Listing{commerceShop()}}, commerceVerifiedShop(), orders, &couponFake{}, nil, ps, "", 5)
	o, _, _, err := svc.StartOrder(ctx, "shop", nil, commerceBasket("p1", 1))
	if err != nil {
		t.Fatal(err)
	}
	if o.BusinessNetPesewas != 9_500 {
		t.Fatalf("net before payment = %d, want 9500", o.BusinessNetPesewas)
	}
	paid, err := svc.ConfirmOrder(ctx, o.Reference)
	if err != nil || paid.Status != domain.OrderPaid || paid.ProcessingFeePesewas != 195 || paid.BusinessNetPesewas != 9_305 {
		t.Fatalf("paid order = %+v %v, want fee 195 and net 9305", paid, err)
	}
	if again, _ := svc.ConfirmOrder(ctx, o.Reference); again.BusinessNetPesewas != 9_305 {
		t.Fatalf("a replayed confirm took the fee twice: %d", again.BusinessNetPesewas)
	}
	if sellerBorneFee(50_000, 9_500) != 9_500 || sellerBorneFee(-3, 9_500) != 0 {
		t.Fatal("the recorded fee must stay within the seller's share")
	}
}

// A payment that completes after the reconciliation sweep closed the order as
// abandoned revives it — the seller's split share has already been settled to
// them — and settles it once. An order cancelled for any other reason stays
// cancelled.
func TestConfirmOrder_latePaymentRevivesAbandonedOrder(t *testing.T) {
	ctx := context.Background()
	orders := &orderFake{}
	ps := &commercePaystackFake{fakePaystack: fakePaystack{verifyOK: true, verifyAmount: 10_000}}
	svc := NewCommerceService(&fakeRepo{listings: []domain.Listing{commerceShop()}}, commerceVerifiedShop(), orders, &couponFake{}, nil, ps, "", 5)
	o, _, _, err := svc.StartOrder(ctx, "shop", nil, commerceBasket("p1", 1))
	if err != nil {
		t.Fatal(err)
	}
	orders.rows[0].Status, orders.rows[0].CancelReason = domain.OrderCancelled, domain.AbandonedPaymentReason

	paid, err := svc.ConfirmOrder(ctx, o.Reference)
	if err != nil || paid.Status != domain.OrderPaid || paid.CancelReason != "" {
		t.Fatalf("late payment on an abandoned order = %+v %v, want paid", paid, err)
	}
	if again, err := svc.ConfirmOrder(ctx, o.Reference); err != nil || again.Status != domain.OrderPaid || again.PaidAt != paid.PaidAt {
		t.Fatalf("a replayed confirm changed the revived order: %+v %v", again, err)
	}

	sellerCancelled, _, _, err := svc.StartOrder(ctx, "shop", nil, commerceBasket("p1", 1))
	if err != nil {
		t.Fatal(err)
	}
	for i := range orders.rows {
		if orders.rows[i].Reference == sellerCancelled.Reference {
			orders.rows[i].Status, orders.rows[i].CancelReason = domain.OrderCancelled, "seller cancelled"
		}
	}
	if got, err := svc.ConfirmOrder(ctx, sellerCancelled.Reference); err != nil || got.Status != domain.OrderCancelled {
		t.Fatalf("an order cancelled for another reason = %+v %v, want it left cancelled", got, err)
	}
}
