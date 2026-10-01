package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── live subaccount relink (P01/P46, operator tooling) ───────────────────────
//
// Paystack subaccounts belong to the key mode that created them: a code made
// with an sk_test_ key, or an ACCT_SIM_ code from the simulation, does not
// exist under the live key, so every split checkout for that seller fails.
// cmd/livesubaccounts finds verified sellers whose code the live key cannot
// see and, with --apply, creates a live subaccount from the KYC settlement
// details and stores it.

// SubaccountKeeper is what the relink needs from Paystack.
type SubaccountKeeper interface {
	SubaccountExists(ctx context.Context, code string) (bool, error)
	CreateSubaccount(ctx context.Context, businessName, bankCode, accountNumber string) (string, error)
}

// Relink actions.
const (
	RelinkKeep    = "keep"    // the live key already sees this subaccount
	RelinkCreate  = "create"  // a live subaccount is (or would be) created
	RelinkFailed  = "failed"  // Paystack refused or could not be asked
	RelinkSkipped = "skipped" // no settlement details to create one from
)

// SubaccountRelink is one verified seller's outcome.
type SubaccountRelink struct {
	ListingID   string
	ListingSlug string
	LegalName   string
	BankCode    string
	AccountTail string // last four digits only
	OldCode     string
	NewCode     string
	Action      string
	Err         error
}

// RelinkSubaccounts checks every verified seller's subaccount against the
// key in ps and, when apply is set, creates a live one for each that the key
// cannot see. A dry run changes nothing at Paystack or in the database.
func RelinkSubaccounts(ctx context.Context, repo domain.BusinessVerificationRepository, ps SubaccountKeeper, apply bool) ([]SubaccountRelink, error) {
	all, err := repo.All(ctx)
	if err != nil {
		return nil, err
	}
	var out []SubaccountRelink
	for _, v := range all {
		if v.Status != domain.BusinessVerificationVerified {
			continue
		}
		out = append(out, relinkOne(ctx, repo, ps, v, apply))
	}
	return out, nil
}

func relinkOne(ctx context.Context, repo domain.BusinessVerificationRepository, ps SubaccountKeeper, v domain.BusinessVerification, apply bool) SubaccountRelink {
	r := SubaccountRelink{ListingID: v.ListingID, ListingSlug: v.ListingSlug, LegalName: v.LegalName, BankCode: v.SettlementBankCode, AccountTail: lastFour(v.SettlementAccountNo), OldCode: v.PaystackSubaccount}
	if v.PaystackSubaccount != "" && !IsSimulatedSubaccount(v.PaystackSubaccount) {
		exists, err := ps.SubaccountExists(ctx, v.PaystackSubaccount)
		if err != nil {
			r.Action, r.Err = RelinkFailed, err
			return r
		}
		if exists {
			r.Action = RelinkKeep
			return r
		}
	}
	if v.SettlementBankCode == "" || v.SettlementAccountNo == "" || v.LegalName == "" {
		r.Action, r.Err = RelinkSkipped, fmt.Errorf("no settlement details on record — ask the seller to resubmit KYC")
		return r
	}
	r.Action = RelinkCreate
	if !apply {
		return r
	}
	code, err := ps.CreateSubaccount(ctx, v.LegalName, v.SettlementBankCode, v.SettlementAccountNo)
	if err != nil {
		r.Action, r.Err = RelinkFailed, err
		return r
	}
	r.NewCode = code
	if err := repo.SetPaystackSubaccount(ctx, v.ListingID, code, time.Now().UTC().Format(time.RFC3339)); err != nil {
		r.Action, r.Err = RelinkFailed, fmt.Errorf("created %s at Paystack but could not store it: %w", code, err)
	}
	return r
}

func lastFour(s string) string {
	if len(s) <= 4 {
		return s
	}
	return s[len(s)-4:]
}

// SubaccountExists reports whether this key's Paystack domain has the
// subaccount (a test-mode code is "not found" under the live key).
func (p *paystackHTTP) SubaccountExists(ctx context.Context, code string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.base+"/subaccount/"+url.PathEscape(code), nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("Authorization", "Bearer "+p.secret)
	resp, err := p.http.Do(req)
	if err != nil {
		return false, fmt.Errorf("paystack subaccount lookup failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	var parsed struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    struct {
			SubaccountCode string `json:"subaccount_code"`
		} `json:"data"`
	}
	_ = json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&parsed)
	switch {
	case resp.StatusCode == http.StatusOK && parsed.Status:
		return strings.EqualFold(parsed.Data.SubaccountCode, code) || parsed.Data.SubaccountCode == "", nil
	case resp.StatusCode == http.StatusNotFound, resp.StatusCode == http.StatusBadRequest && strings.Contains(strings.ToLower(parsed.Message), "not found"):
		return false, nil
	default:
		return false, fmt.Errorf("paystack subaccount lookup answered HTTP %d (%s)", resp.StatusCode, parsed.Message)
	}
}
