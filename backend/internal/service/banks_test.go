package service

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// scriptedBanks is a BankLister that counts fetches and can fail.
type scriptedBanks struct {
	banks []SettlementBank
	err   error
	calls int
}

func (s *scriptedBanks) ListBanks(context.Context) ([]SettlementBank, error) {
	s.calls++
	return s.banks, s.err
}

// bankingPaystack is the commerce fake that can also list banks.
type bankingPaystack struct {
	commercePaystackFake
	scriptedBanks
	subaccounts int
}

func (p *bankingPaystack) CreateSubaccount(ctx context.Context, name, bank, account string) (string, error) {
	p.subaccounts++
	return p.commercePaystackFake.CreateSubaccount(ctx, name, bank, account)
}

var ghanaBanks = []SettlementBank{
	{Code: "GCB", Name: "GCB Bank", Type: BankKindBank},
	{Code: "MTN", Name: "MTN Mobile Money", Type: BankKindMobileMoney},
}

// C2: the list is cached for a day, filtered by kind, and a failed refresh
// keeps serving the last good list.
func TestBankDirectory_cachesAndFilters(t *testing.T) {
	src := &scriptedBanks{banks: ghanaBanks}
	d := NewBankDirectory(src)
	clock := time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
	d.now = func() time.Time { return clock }
	ctx := context.Background()
	if momo, err := d.OfKind(ctx, BankKindMobileMoney); err != nil || len(momo) != 1 || momo[0].Code != "MTN" {
		t.Fatalf("mobile money = %+v %v", momo, err)
	}
	if all, _ := d.OfKind(ctx, ""); len(all) != 2 || src.calls != 1 {
		t.Fatalf("all = %+v, fetches = %d (want cached)", all, src.calls)
	}
	clock = clock.Add(25 * time.Hour)
	src.err = errors.New("paystack down")
	if known, ok := d.Known(ctx, "GCB"); !known || !ok || src.calls != 2 {
		t.Fatalf("stale refresh: known=%v ok=%v calls=%d", known, ok, src.calls)
	}
	empty := NewBankDirectory(&scriptedBanks{err: errors.New("down")})
	if _, ok := empty.Known(ctx, "GCB"); ok {
		t.Fatal("an unloadable list must say it can't judge the code")
	}
}

func TestPaystackListBanks_parsesAndSkipsInactive(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("currency") != "GHS" {
			t.Errorf("query = %s", r.URL.RawQuery)
		}
		if r.URL.Query().Get("type") == "mobile_money" {
			_, _ = w.Write([]byte(`{"status":true,"data":[
				{"name":"MTN Mobile Money","code":"MTN","type":"mobile_money","active":true},
				{"name":"Telecel Cash","code":"VOD","active":true}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"status":true,"data":[
			{"name":"MTN Mobile Money","code":"MTN","type":"mobile_money","active":true},
			{"name":"GCB Bank Limited","code":"040100","type":"ghipss","active":true},
			{"name":"Closed Bank","code":"999","type":"ghipss","active":false},
			{"name":"Gone Bank","code":"998","type":"ghipss","active":true,"is_deleted":true}]}`))
	}))
	defer srv.Close()
	p := NewPaystackClient("sk_test_x")
	p.base = srv.URL
	banks, err := p.ListBanks(context.Background())
	if err != nil || len(banks) != 3 || banks[0] != (SettlementBank{Code: "040100", Name: "GCB Bank Limited", Type: BankKindBank}) ||
		banks[1].Code != "MTN" || banks[2] != (SettlementBank{Code: "VOD", Name: "Telecel Cash", Type: BankKindMobileMoney}) {
		t.Fatalf("banks = %+v %v", banks, err)
	}
}

func verificationInput(code string) BusinessVerificationInput {
	return BusinessVerificationInput{LegalName: "Oguaa Shop Ltd", RegistrationNumber: "CS123", GhanaCardNumber: "GHA-123456789-1", BusinessPhone: "0240000000", GhanaPostGPS: "CC-001-0001", Documents: privateKYCDocs, SettlementBankCode: code, SettlementAccountNo: "0240000000", SettlementName: "Oguaa Shop Ltd"}
}

// C2: KYC refuses a settlement code that is not on Paystack's list; P19: a
// re-review reuses the seller's subaccount instead of creating another.
func TestSubmitVerification_settlementCodeFromTheList(t *testing.T) {
	ctx := context.Background()
	listings := &fakeRepo{listings: []domain.Listing{commerceShop()}}
	v := &verificationFake{}
	ps := &bankingPaystack{scriptedBanks: scriptedBanks{banks: ghanaBanks}}
	svc := NewCommerceService(listings, v, &orderFake{}, &couponFake{}, nil, ps, "", 5)
	owner := &domain.Member{ID: "owner"}
	_, err := svc.SubmitVerification(ctx, owner, "b1", verificationInput("Ghana Commercial Bank"))
	if !isCommerceValidation(err) || err.Error() != msgChooseSettlementBank {
		t.Fatalf("free-text bank: err=%v", err)
	}
	if _, err = svc.SubmitVerification(ctx, owner, "b1", verificationInput("MTN")); err != nil {
		t.Fatalf("listed code refused: %v", err)
	}
	staff := &domain.Member{ID: "staff", Role: domain.RoleCurator}
	for range 2 {
		if _, err = svc.ReviewVerification(ctx, staff, "b1", domain.BusinessVerificationVerified, ""); err != nil {
			t.Fatal(err)
		}
	}
	if ps.subaccounts != 1 || v.row.PaystackSubaccount == "" {
		t.Fatalf("subaccounts created = %d (%q), want one reused", ps.subaccounts, v.row.PaystackSubaccount)
	}
	// A simulated code is never reused once a real key is in use.
	v.row.PaystackSubaccount = "ACCT_SIM_oguaa-shop"
	if _, err = svc.ReviewVerification(ctx, staff, "b1", domain.BusinessVerificationVerified, ""); err != nil || ps.subaccounts != 2 || v.row.PaystackSubaccount == "ACCT_SIM_oguaa-shop" {
		t.Fatalf("simulated code kept: %q (created %d) %v", v.row.PaystackSubaccount, ps.subaccounts, err)
	}
	if list, err := svc.SettlementBanks(ctx, BankKindBank); err != nil || len(list) != 1 {
		t.Fatalf("bank list = %+v %v", list, err)
	}
	noBanks := NewCommerceService(listings, v, &orderFake{}, &couponFake{}, nil, &commercePaystackFake{}, "", 5)
	if _, err := noBanks.SettlementBanks(ctx, ""); !errors.Is(err, ErrPaymentsUnavailable) {
		t.Fatalf("no lister: err=%v", err)
	}
}
