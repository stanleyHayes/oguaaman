package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

// ── settlement banks and Mobile Money networks (C2, P02/P19) ─────────────────
//
// A seller's Paystack subaccount needs settlement_bank to be a code from
// Paystack's own list (GET /bank?currency=GHS). Sellers pick from that list
// instead of typing a code, and KYC submission refuses a code not on it.

// Settlement bank kinds.
const (
	BankKindBank        = "bank"
	BankKindMobileMoney = "mobile_money"
)

// SettlementBank is one entry of the GHS bank and Mobile Money list.
type SettlementBank struct {
	Code string `json:"code"`
	Name string `json:"name"`
	Type string `json:"type"` // BankKindBank | BankKindMobileMoney
}

// BankLister is implemented by payment clients that can list Paystack's
// settlement banks for GHS.
type BankLister interface {
	ListBanks(ctx context.Context) ([]SettlementBank, error)
}

// bankListTTL is how long the bank list is cached (it changes rarely).
const bankListTTL = 24 * time.Hour

// BankDirectory caches the bank list for a day.
type BankDirectory struct {
	src BankLister
	ttl time.Duration
	now func() time.Time

	mu      sync.Mutex
	banks   []SettlementBank
	fetched time.Time
}

// NewBankDirectory caches src's bank list for bankListTTL.
func NewBankDirectory(src BankLister) *BankDirectory {
	return &BankDirectory{src: src, ttl: bankListTTL, now: time.Now}
}

// All returns every bank and network, fetching when the cache is stale. A
// failed refresh keeps serving the previous list when there is one.
func (d *BankDirectory) All(ctx context.Context) ([]SettlementBank, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.banks != nil && d.now().Sub(d.fetched) < d.ttl {
		return d.banks, nil
	}
	banks, err := d.src.ListBanks(ctx)
	if err != nil {
		if d.banks != nil {
			return d.banks, nil
		}
		return nil, err
	}
	d.banks, d.fetched = banks, d.now()
	return banks, nil
}

// OfKind lists the banks of one kind ("" = all).
func (d *BankDirectory) OfKind(ctx context.Context, kind string) ([]SettlementBank, error) {
	all, err := d.All(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]SettlementBank, 0, len(all))
	for _, b := range all {
		if kind == "" || b.Type == kind {
			out = append(out, b)
		}
	}
	return out, nil
}

// Known reports whether code is on the list. ok=false means the list could
// not be loaded, so nothing can be said about the code.
func (d *BankDirectory) Known(ctx context.Context, code string) (known, ok bool) {
	all, err := d.All(ctx)
	if err != nil {
		return false, false
	}
	for _, b := range all {
		if b.Code == code {
			return true, true
		}
	}
	return false, true
}

// ListBanks fetches Paystack's GHS banks and Mobile Money networks: the
// currency list, plus the type=mobile_money list (C2), merged by code. Either
// call failing fails the whole list, so a partial list is never cached.
func (p *paystackHTTP) ListBanks(ctx context.Context) ([]SettlementBank, error) {
	all, err := p.fetchBanks(ctx, "/bank?currency=GHS&perPage=100", "")
	if err != nil {
		return nil, err
	}
	momo, err := p.fetchBanks(ctx, "/bank?currency=GHS&type=mobile_money&perPage=100", BankKindMobileMoney)
	if err != nil {
		return nil, err
	}
	seen := make(map[string]int, len(all))
	for i, b := range all {
		seen[b.Code] = i
	}
	for _, b := range momo {
		if i, ok := seen[b.Code]; ok {
			all[i].Type = BankKindMobileMoney
			continue
		}
		all = append(all, b)
	}
	sortBanks(all)
	return all, nil
}

// fetchBanks reads one Paystack bank list; kind forces the entries' type.
func (p *paystackHTTP) fetchBanks(ctx context.Context, path, kind string) ([]SettlementBank, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.base+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+p.secret)
	resp, err := p.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("paystack bank list failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	var parsed struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    []struct {
			Name      string `json:"name"`
			Code      string `json:"code"`
			Type      string `json:"type"`
			Active    *bool  `json:"active"`
			IsDeleted bool   `json:"is_deleted"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&parsed); err != nil || resp.StatusCode != http.StatusOK || !parsed.Status {
		return nil, fmt.Errorf("paystack bank list answered HTTP %d (%s)", resp.StatusCode, parsed.Message)
	}
	banks := make([]SettlementBank, 0, len(parsed.Data))
	for _, b := range parsed.Data {
		if b.Code == "" || b.IsDeleted || (b.Active != nil && !*b.Active) {
			continue
		}
		banks = append(banks, SettlementBank{Code: b.Code, Name: strings.TrimSpace(b.Name), Type: bankKind(kind, b.Type)})
	}
	return banks, nil
}

// bankKind is forced when the list was fetched for one kind, else read from
// Paystack's own type (anything but mobile_money is a bank).
func bankKind(forced, paystackType string) string {
	switch {
	case forced != "":
		return forced
	case paystackType == BankKindMobileMoney:
		return BankKindMobileMoney
	default:
		return BankKindBank
	}
}

// sortBanks orders banks first, then networks, each by name.
func sortBanks(banks []SettlementBank) {
	sort.SliceStable(banks, func(i, j int) bool {
		if banks[i].Type != banks[j].Type {
			return banks[i].Type == BankKindBank
		}
		return strings.ToLower(banks[i].Name) < strings.ToLower(banks[j].Name)
	})
}

// ListBanks in the labelled simulation returns a short sample list (dev only).
func (SimulatedPaystack) ListBanks(context.Context) ([]SettlementBank, error) {
	return []SettlementBank{
		{Code: "SIM-BANK", Name: "Simulated Bank (dev)", Type: BankKindBank},
		{Code: "MTN", Name: "MTN Mobile Money", Type: BankKindMobileMoney},
		{Code: "VOD", Name: "Telecel Cash", Type: BankKindMobileMoney},
		{Code: "ATL", Name: "AirtelTigo Money", Type: BankKindMobileMoney},
	}, nil
}

// ListBanks is unavailable without a Paystack key in production.
func (DisabledPaystack) ListBanks(context.Context) ([]SettlementBank, error) {
	return nil, ErrPaymentsUnavailable
}
