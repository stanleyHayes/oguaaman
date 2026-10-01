package service

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// manyVerifications is a BusinessVerificationRepository over several rows.
type manyVerifications struct{ rows []domain.BusinessVerification }

func (m *manyVerifications) ByListing(_ context.Context, id string) (*domain.BusinessVerification, error) {
	for i := range m.rows {
		if m.rows[i].ListingID == id {
			return &m.rows[i], nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "verification"}
}
func (m *manyVerifications) Upsert(context.Context, domain.BusinessVerification) error { return nil }
func (m *manyVerifications) All(context.Context) ([]domain.BusinessVerification, error) {
	return append([]domain.BusinessVerification(nil), m.rows...), nil
}
func (m *manyVerifications) Review(context.Context, string, string, string, string, string, string) error {
	return nil
}
func (m *manyVerifications) SetPaystackSubaccount(_ context.Context, id, sub, at string) error {
	for i := range m.rows {
		if m.rows[i].ListingID == id {
			m.rows[i].PaystackSubaccount, m.rows[i].UpdatedAt = sub, at
		}
	}
	return nil
}

// liveKeeper knows the live subaccounts and creates new ones.
type liveKeeper struct {
	live    map[string]bool
	created int
	fail    string // legal name whose creation Paystack refuses
}

func (k *liveKeeper) SubaccountExists(_ context.Context, code string) (bool, error) {
	return k.live[code], nil
}
func (k *liveKeeper) CreateSubaccount(_ context.Context, name, _, _ string) (string, error) {
	if name == k.fail {
		return "", errors.New("paystack subaccount rejected: Account number is invalid")
	}
	k.created++
	return "ACCT_live_" + name, nil
}

func relinkRows() []domain.BusinessVerification {
	seller := func(id, name, code string) domain.BusinessVerification {
		return domain.BusinessVerification{ListingID: id, ListingSlug: id, LegalName: name, Status: domain.BusinessVerificationVerified, SettlementBankCode: "MTN", SettlementAccountNo: "0240001234", PaystackSubaccount: code}
	}
	pending := seller("b-pending", "Pending Ltd", "")
	pending.Status = domain.BusinessVerificationPending
	noBank := seller("b-nobank", "No Bank Ltd", "ACCT_test1")
	noBank.SettlementBankCode = ""
	return []domain.BusinessVerification{
		seller("b-live", "Live Ltd", "ACCT_live1"),
		seller("b-test", "Test Ltd", "ACCT_test1"),
		seller("b-sim", "Sim Ltd", "ACCT_SIM_sim-ltd"),
		seller("b-refused", "Refused Ltd", ""),
		pending, noBank,
	}
}

// P01/P46: a dry run reports and changes nothing; --apply creates a live
// subaccount for every verified seller the live key can't see and stores it.
func TestRelinkSubaccounts(t *testing.T) {
	ctx := context.Background()
	repo := &manyVerifications{rows: relinkRows()}
	keeper := &liveKeeper{live: map[string]bool{"ACCT_live1": true}, fail: "Refused Ltd"}

	dry, err := RelinkSubaccounts(ctx, repo, keeper, false)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{"b-live": RelinkKeep, "b-test": RelinkCreate, "b-sim": RelinkCreate, "b-refused": RelinkCreate, "b-nobank": RelinkSkipped}
	if len(dry) != len(want) {
		t.Fatalf("dry run rows = %+v", dry)
	}
	for _, r := range dry {
		if want[r.ListingID] != r.Action || r.NewCode != "" {
			t.Errorf("dry %s: action %q new %q, want %q and nothing created", r.ListingID, r.Action, r.NewCode, want[r.ListingID])
		}
	}
	if keeper.created != 0 || repo.rows[1].PaystackSubaccount != "ACCT_test1" {
		t.Fatal("a dry run changed something")
	}

	applied, err := RelinkSubaccounts(ctx, repo, keeper, true)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]SubaccountRelink{}
	for _, r := range applied {
		got[r.ListingID] = r
	}
	if got["b-test"].NewCode != "ACCT_live_Test Ltd" || repo.rows[1].PaystackSubaccount != "ACCT_live_Test Ltd" || repo.rows[2].PaystackSubaccount != "ACCT_live_Sim Ltd" {
		t.Fatalf("not relinked: %+v / %+v", got["b-test"], repo.rows)
	}
	if got["b-refused"].Action != RelinkFailed || got["b-refused"].Err == nil || repo.rows[3].PaystackSubaccount != "" {
		t.Fatalf("refused creation: %+v", got["b-refused"])
	}
	if repo.rows[0].PaystackSubaccount != "ACCT_live1" || keeper.created != 2 {
		t.Fatalf("live seller touched or wrong count: %q created=%d", repo.rows[0].PaystackSubaccount, keeper.created)
	}
	if got["b-test"].AccountTail != "1234" {
		t.Fatalf("account tail = %q", got["b-test"].AccountTail)
	}
}

func TestPaystackSubaccountExists(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/subaccount/ACCT_live":
			_, _ = w.Write([]byte(`{"status":true,"data":{"subaccount_code":"ACCT_live"}}`))
		case "/subaccount/ACCT_test":
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"status":false,"message":"Subaccount not found"}`))
		default:
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"status":false,"message":"slow down"}`))
		}
	}))
	defer srv.Close()
	p := NewPaystackClient("sk_live_x")
	p.base = srv.URL
	ctx := context.Background()
	if ok, err := p.SubaccountExists(ctx, "ACCT_live"); !ok || err != nil {
		t.Fatalf("live: %v %v", ok, err)
	}
	if ok, err := p.SubaccountExists(ctx, "ACCT_test"); ok || err != nil {
		t.Fatalf("test-mode code: %v %v", ok, err)
	}
	if _, err := p.SubaccountExists(ctx, "ACCT_other"); err == nil {
		t.Fatal("a rate limit must be an error, not 'missing'")
	}
}

// P01: under a real key, a seller still holding a simulated subaccount code
// is not offered checkout (the order would fail at Paystack).
func TestCheckout_closedForSimulatedSubaccountUnderRealKey(t *testing.T) {
	listings := &fakeRepo{listings: []domain.Listing{commerceShop()}}
	v := commerceVerifiedShop()
	v.row.PaystackSubaccount = "ACCT_SIM_oguaa-shop"
	svc := NewCommerceService(listings, v, &orderFake{}, &couponFake{}, nil, &commercePaystackFake{}, "", 5)
	if svc.Status(context.Background(), "shop").Enabled {
		t.Fatal("checkout offered with a simulated subaccount under a real key")
	}
	sim := NewCommerceService(listings, v, &orderFake{}, &couponFake{}, nil, SimulatedPaystack{}, "", 5)
	if !sim.Status(context.Background(), "shop").Enabled {
		t.Fatal("the simulation should keep its own codes working")
	}
}
