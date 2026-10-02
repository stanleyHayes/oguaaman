package service

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

// refundServer is a fake Paystack refund API.
func refundServer(t *testing.T, handle func(w http.ResponseWriter, r *http.Request)) *paystackHTTP {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer sk_test_x" {
			http.Error(w, `{"status":false,"message":"bad key"}`, http.StatusUnauthorized)
			return
		}
		handle(w, r)
	}))
	t.Cleanup(srv.Close)
	return &paystackHTTP{secret: "sk_test_x", base: srv.URL, http: srv.Client()}
}

func TestPaystackRefundPostsOurReferenceAndReadsTheRefund(t *testing.T) {
	var got map[string]any
	p := refundServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/refund" || r.Header.Get("Content-Type") != "application/json" {
			http.Error(w, "unexpected", http.StatusBadRequest)
			return
		}
		_ = json.NewDecoder(r.Body).Decode(&got)
		_, _ = w.Write([]byte(`{"status":true,"message":"Refund has been queued for processing","data":{"id":3018284,"status":"Pending","amount":45000}}`))
	})
	res, err := p.Refund(context.Background(), "oguaa-adv-ad_1-1790000000", 45000, "oguaa ad ad_1: under-delivered")
	if err != nil {
		t.Fatal(err)
	}
	if res.RefundID != "3018284" || res.Status != RefundPending {
		t.Fatalf("result = %+v", res)
	}
	if got["transaction"] != "oguaa-adv-ad_1-1790000000" || got["amount"] != float64(45000) || got["merchant_note"] != "oguaa ad ad_1: under-delivered" {
		t.Fatalf("payload = %v", got)
	}
}

func TestPaystackRefundStatusPolls(t *testing.T) {
	p := refundServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/refund/3018284" {
			http.Error(w, `{"status":false,"message":"not found"}`, http.StatusNotFound)
			return
		}
		_, _ = w.Write([]byte(`{"status":true,"message":"Refund retrieved","data":{"id":"3018284","status":"processed"}}`))
	})
	res, err := p.RefundStatus(context.Background(), "3018284")
	if err != nil || res.Status != RefundProcessed || res.RefundID != "3018284" {
		t.Fatalf("status = %+v, %v", res, err)
	}
	if _, err := p.RefundStatus(context.Background(), "999"); err == nil {
		t.Fatal("a 404 must be an error")
	}
	if _, err := p.RefundStatus(context.Background(), " "); err == nil {
		t.Fatal("an empty refund id must be refused")
	}
}

func TestPaystackRefundErrors(t *testing.T) {
	calls := 0
	p := refundServer(t, func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"status":false,"message":"Transaction has been fully reversed"}`))
	})
	ctx := context.Background()
	if _, err := p.Refund(ctx, "oguaa-adv-1", 100, ""); err == nil {
		t.Fatal("a rejected refund must be an error")
	}
	if _, err := p.Refund(ctx, "T123-other-app", 100, ""); !errors.Is(err, ErrForeignReference) {
		t.Fatalf("foreign reference err = %v", err)
	}
	if _, err := p.Refund(ctx, "plg-legacy-1", 100, ""); !errors.Is(err, ErrForeignReference) {
		t.Fatalf("un-namespaced reference err = %v", err)
	}
	if _, err := p.Refund(ctx, "oguaa-adv-1", 0, ""); !errors.Is(err, ErrRefundAmount) {
		t.Fatalf("zero amount err = %v", err)
	}
	if calls != 1 {
		t.Fatalf("refused refunds must not reach Paystack; %d calls", calls)
	}
}

func TestSimulatedAndDisabledRefunds(t *testing.T) {
	ctx := context.Background()
	sim := SimulatedPaystack{}
	res, err := sim.Refund(ctx, "oguaa-adv-1", 500, "test")
	if err != nil || res.RefundID != "sim-oguaa-adv-1" || res.Status != RefundProcessed {
		t.Fatalf("simulated refund = %+v, %v", res, err)
	}
	if st, _ := sim.RefundStatus(ctx, res.RefundID); st.Status != RefundProcessed {
		t.Fatalf("simulated status = %+v", st)
	}
	if _, err := sim.Refund(ctx, "someone-else", 500, ""); !errors.Is(err, ErrForeignReference) {
		t.Fatalf("the simulation must refuse foreign references too: %v", err)
	}
	prod := PaystackFor("", true, sim)
	if _, err := prod.Refund(ctx, "oguaa-adv-1", 500, ""); !errors.Is(err, ErrPaymentsUnavailable) {
		t.Fatalf("disabled refund err = %v", err)
	}
	if _, err := prod.RefundStatus(ctx, "1"); !errors.Is(err, ErrPaymentsUnavailable) {
		t.Fatalf("disabled status err = %v", err)
	}
	var _ RefundingPaystack = NewPaystackClient("sk")
}
