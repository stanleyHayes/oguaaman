package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── adopt-a-project payments via Paystack (spec §4/§6/§15, Phase 2) ───────────
//
// Money flow: StartPledge records a pending Pledge and asks Paystack for an
// authorization URL; the payer completes payment on Paystack's page; we confirm
// only after VERIFYING the transaction server-side (redirect callback and/or
// webhook), then atomically add to the project's raised total. Amounts are
// integer pesewas. Without keys a labelled simulation drives the same loop so
// the flow is testable end-to-end in dev (house pattern: the AI bar).

// ErrPledgeAmount is returned for out-of-range pledge amounts.
var ErrPledgeAmount = errors.New("pledge amount out of range")

const (
	minPledgePesewas = 1_00       // GHS 1
	maxPledgePesewas = 100_000_00 // GHS 100,000 per pledge
)

// PaystackClient is the seam to the payment provider.
type PaystackClient interface {
	// Initialize starts a transaction; returns the hosted-checkout URL (redirect
	// fallback) and the access code (used by the in-app Paystack Inline popup so
	// the client resumes THIS transaction rather than starting a new one).
	Initialize(ctx context.Context, email string, amountPesewas int64, currency, reference, callbackURL string) (authorizationURL, accessCode string, err error)
	// Verify reports whether the transaction succeeded and the amount charged.
	// A returned amount of 0 means "amount unknown" (simulation only).
	Verify(ctx context.Context, reference string) (success bool, amountPesewas int64, err error)
	// Simulated reports whether this client moves real money.
	Simulated() bool
}

// ── real Paystack client ──────────────────────────────────────────────────────

type paystackHTTP struct {
	secret string
	base   string
	http   *http.Client
}

// NewPaystackClient talks to the live Paystack API with the given secret key.
func NewPaystackClient(secretKey string) PaystackClient {
	return &paystackHTTP{secret: secretKey, base: "https://api.paystack.co", http: &http.Client{Timeout: 20 * time.Second}}
}

func (p *paystackHTTP) Simulated() bool { return false }

func (p *paystackHTTP) Initialize(ctx context.Context, email string, amountPesewas int64, currency, reference, callbackURL string) (string, string, error) {
	body, _ := json.Marshal(map[string]any{
		"email":        email,
		"amount":       amountPesewas, // subunits (pesewas for GHS)
		"currency":     currency,
		"reference":    reference,
		"callback_url": callbackURL,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.base+"/transaction/initialize", bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Authorization", "Bearer "+p.secret)
	req.Header.Set("Content-Type", "application/json")
	resp, err := p.http.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("paystack initialize failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	var parsed struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    struct {
			AuthorizationURL string `json:"authorization_url"`
			AccessCode       string `json:"access_code"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&parsed); err != nil {
		return "", "", err
	}
	if !parsed.Status || parsed.Data.AuthorizationURL == "" {
		return "", "", fmt.Errorf("paystack initialize rejected: %s", parsed.Message)
	}
	return parsed.Data.AuthorizationURL, parsed.Data.AccessCode, nil
}

func (p *paystackHTTP) Verify(ctx context.Context, reference string) (bool, int64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.base+"/transaction/verify/"+url.PathEscape(reference), nil)
	if err != nil {
		return false, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+p.secret)
	resp, err := p.http.Do(req)
	if err != nil {
		return false, 0, fmt.Errorf("paystack verify failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	var parsed struct {
		Status bool `json:"status"`
		Data   struct {
			Status string `json:"status"`
			Amount int64  `json:"amount"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&parsed); err != nil {
		return false, 0, err
	}
	return parsed.Status && parsed.Data.Status == "success", parsed.Data.Amount, nil
}

// ── simulated client (no keys) ────────────────────────────────────────────────

// SimulatedPaystack closes the payment loop without moving money: the
// "authorization URL" is simply the callback URL, so the payer lands straight
// back on the confirm step. Pledges confirmed this way are flagged Simulated.
type SimulatedPaystack struct{ Log *slog.Logger }

func (s SimulatedPaystack) Simulated() bool { return true }

func (s SimulatedPaystack) Initialize(_ context.Context, email string, amountPesewas int64, currency, reference, callbackURL string) (string, string, error) {
	if s.Log != nil {
		s.Log.Info("SIMULATED Paystack charge — no real money moves", "email", email, "amount", amountPesewas, "currency", currency, "ref", reference)
	}
	// No access code in simulation — the client falls back to the callback URL,
	// which lands straight back on the confirm step.
	return callbackURL, "", nil
}

func (s SimulatedPaystack) Verify(context.Context, string) (bool, int64, error) {
	return true, 0, nil // 0 = amount unknown; the pledge's own amount is used
}

// ── the payments service ──────────────────────────────────────────────────────

// PaymentsService runs the pledge & donation flows. Standalone (like
// AuthService/AIService) so the core Service stays read/moderation-focused.
type PaymentsService struct {
	listings   domain.ListingRepository
	pledges    domain.PledgeRepository
	notifs     domain.NotificationRepository
	members    domain.MemberRepository
	plans      domain.PlanRepository
	paystack   PaystackClient
	portal     string // public portal origin for callback URLs
	feePercent int    // fallback platform fee for legacy civic pledges (integer %)
}

func NewPaymentsService(l domain.ListingRepository, p domain.PledgeRepository, n domain.NotificationRepository, members domain.MemberRepository, plans domain.PlanRepository, ps PaystackClient, portalURL string, feePercent int) *PaymentsService {
	return &PaymentsService{listings: l, pledges: p, notifs: n, members: members, plans: plans, paystack: ps, portal: strings.TrimRight(portalURL, "/"), feePercent: feePercent}
}

// Simulated reports whether pledges run against the labelled simulation.
func (s *PaymentsService) Simulated() bool { return s.paystack.Simulated() }

// StartPledge records a pending pledge against an approved project and returns
// the Paystack authorization URL to redirect the payer to.
func (s *PaymentsService) StartPledge(ctx context.Context, projectSlug, memberID, email string, amountPesewas int64) (authorizationURL, accessCode, reference string, err error) {
	if amountPesewas < minPledgePesewas || amountPesewas > maxPledgePesewas {
		return "", "", "", ErrPledgeAmount
	}
	email = strings.TrimSpace(email)
	if email == "" {
		return "", "", "", fmt.Errorf("an email is required for the payment receipt")
	}
	project, err := s.listings.GetBySlug(ctx, domain.TypeProject, projectSlug)
	if err != nil {
		return "", "", "", err
	}
	if project.Status != domain.StatusApproved {
		return "", "", "", &domain.NotFoundError{Entity: "project"}
	}
	now := time.Now().UTC()
	reference = fmt.Sprintf("plg-%s-%d", project.Slug, now.UnixNano())
	pledge := domain.Pledge{
		ID:            "p" + reference,
		Reference:     reference,
		Kind:          domain.PledgeKindCampaign,
		ProjectID:     project.ID,
		ProjectSlug:   project.Slug,
		ProjectTitle:  project.Title,
		MemberID:      memberID,
		Email:         email,
		AmountPesewas: amountPesewas,
		Currency:      "GHS",
		Status:        domain.PledgePending,
		Simulated:     s.paystack.Simulated(),
		CreatedAt:     now.Format(time.RFC3339),
	}
	if err := s.pledges.Insert(ctx, pledge); err != nil {
		return "", "", "", err
	}
	callback := fmt.Sprintf("%s/projects/%s?pledge_ref=%s", s.portal, project.Slug, url.QueryEscape(reference))
	authURL, accessCode, err := s.paystack.Initialize(ctx, email, amountPesewas, "GHS", reference, callback)
	if err != nil {
		return "", "", "", err
	}
	return authURL, accessCode, reference, nil
}

// StartDonation records a pending "tip jar" donation to an artist and returns
// the Paystack authorization URL. It is gated: the artist's owner must hold an
// active creator subscription (donations are a paid feature). message/anonymous
// are optional donor touches carried on the record.
func (s *PaymentsService) StartDonation(ctx context.Context, artistSlug, memberID, email string, amountPesewas int64, message string, anonymous bool) (authorizationURL, accessCode, reference string, err error) {
	if amountPesewas < minPledgePesewas || amountPesewas > maxPledgePesewas {
		return "", "", "", ErrPledgeAmount
	}
	email = strings.TrimSpace(email)
	if email == "" {
		return "", "", "", fmt.Errorf("an email is required for the payment receipt")
	}
	artist, err := s.listings.GetBySlug(ctx, domain.TypeArtist, artistSlug)
	if err != nil {
		return "", "", "", err
	}
	if artist.Status != domain.StatusApproved {
		return "", "", "", &domain.NotFoundError{Entity: "artist"}
	}
	if !s.donationsEnabled(ctx, artist.OwnerID) {
		return "", "", "", &domain.ForbiddenError{Reason: "this artist isn't accepting donations — the feature needs an active creator plan"}
	}
	now := time.Now().UTC()
	reference = fmt.Sprintf("don-%s-%d", artist.Slug, now.UnixNano())
	donation := domain.Pledge{
		ID:            "p" + reference,
		Reference:     reference,
		Kind:          domain.PledgeKindDonation,
		ProjectID:     artist.ID,
		ProjectSlug:   artist.Slug,
		ProjectTitle:  artist.Title,
		Message:       strings.TrimSpace(message),
		Anonymous:     anonymous,
		MemberID:      memberID,
		Email:         email,
		AmountPesewas: amountPesewas,
		Currency:      "GHS",
		Status:        domain.PledgePending,
		Simulated:     s.paystack.Simulated(),
		CreatedAt:     now.Format(time.RFC3339),
	}
	if err := s.pledges.Insert(ctx, donation); err != nil {
		return "", "", "", err
	}
	callback := fmt.Sprintf("%s/music/%s?donation_ref=%s", s.portal, artist.Slug, url.QueryEscape(reference))
	authURL, accessCode, err := s.paystack.Initialize(ctx, email, amountPesewas, "GHS", reference, callback)
	if err != nil {
		return "", "", "", err
	}
	return authURL, accessCode, reference, nil
}

// donationsEnabled reports whether an artist's owner may receive donations —
// i.e. holds an active creator subscription.
func (s *PaymentsService) donationsEnabled(ctx context.Context, ownerID string) bool {
	if s.members == nil || ownerID == "" {
		return false
	}
	owner, err := s.members.ByID(ctx, ownerID)
	if err != nil {
		return false
	}
	return CreatorSubscriptionActive(owner, time.Now().UTC())
}

// DonationsEnabledForOwner is the exported gate the read layer uses to decide
// whether to show an artist's donate panel.
func (s *PaymentsService) DonationsEnabledForOwner(ctx context.Context, ownerID string) bool {
	return s.donationsEnabled(ctx, ownerID)
}

// ConfirmPledge verifies a transaction with Paystack and, on first success,
// marks the pledge and adds it to the project's raised total. Idempotent: a
// pledge already confirmed (e.g. webhook then redirect) is a no-op success.
func (s *PaymentsService) ConfirmPledge(ctx context.Context, reference string) (*domain.Pledge, error) {
	pledge, err := s.pledges.ByReference(ctx, reference)
	if err != nil {
		return nil, err
	}
	if pledge.Status == domain.PledgeSuccess {
		return pledge, nil // already settled
	}
	success, amount, err := s.paystack.Verify(ctx, reference)
	if err != nil {
		return nil, err
	}
	return s.fulfillPledge(ctx, pledge, success, amount)
}

// FulfillPledge marks a pledge successful using an amount already verified by
// another gateway (e.g. Stripe). It is idempotent.
func (s *PaymentsService) FulfillPledge(ctx context.Context, reference string, amountPesewas int64) (*domain.Pledge, error) {
	pledge, err := s.pledges.ByReference(ctx, reference)
	if err != nil {
		return nil, err
	}
	if pledge.Status == domain.PledgeSuccess {
		return pledge, nil
	}
	return s.fulfillPledge(ctx, pledge, true, amountPesewas)
}

func (s *PaymentsService) fulfillPledge(ctx context.Context, pledge *domain.Pledge, success bool, amount int64) (*domain.Pledge, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if !success || (amount > 0 && amount < pledge.AmountPesewas) {
		_ = s.pledges.UpdateStatus(ctx, pledge.Reference, domain.PledgeFailed, now)
		return nil, fmt.Errorf("payment was not completed")
	}
	if err := s.pledges.UpdateStatus(ctx, pledge.Reference, domain.PledgeSuccess, now); err != nil {
		return nil, err
	}
	// Split the platform fee (integer pesewas, rounded down); the recipient is
	// credited the NET. The rate is the TARGET listing owner's plan take-rate
	// (Creator Monetization), falling back to the flat platform fee for legacy
	// civic projects whose owner has no active creator plan.
	feePercent := s.takeRateForOwner(ctx, pledge.ProjectID)
	fee := pledge.AmountPesewas * int64(feePercent) / 100
	net := pledge.AmountPesewas - fee
	if err := s.pledges.SetFeeNet(ctx, pledge.Reference, fee, net); err != nil {
		return nil, err
	}
	// Credit the recipient: donations bump the artist's donation total; campaign
	// and project pledges bump the project's raised total.
	if pledge.Kind == domain.PledgeKindDonation {
		if err := s.listings.IncrementDonations(ctx, pledge.ProjectID, net); err != nil {
			return nil, err
		}
	} else if err := s.listings.IncrementRaised(ctx, pledge.ProjectID, net); err != nil {
		return nil, err
	}
	pledge.Status = domain.PledgeSuccess
	pledge.FeePesewas = fee
	pledge.NetPesewas = net
	pledge.ConfirmedAt = now
	s.notifyRecipient(ctx, pledge)
	return pledge, nil
}

// takeRateForOwner resolves the platform fee percent for a confirmed
// contribution to targetListingID: the target owner's active creator plan
// take-rate, or the flat platform fee when the owner has no active plan.
func (s *PaymentsService) takeRateForOwner(ctx context.Context, targetListingID string) int {
	if s.members == nil || s.plans == nil {
		return s.feePercent
	}
	listing, err := s.listings.GetByID(ctx, targetListingID)
	if err != nil || listing.OwnerID == "" {
		return s.feePercent
	}
	owner, err := s.members.ByID(ctx, listing.OwnerID)
	if err != nil || !CreatorSubscriptionActive(owner, time.Now().UTC()) || owner.CreatorPlan == "" {
		return s.feePercent
	}
	plan, err := s.plans.BySlug(ctx, owner.CreatorPlan)
	if err != nil {
		return s.feePercent
	}
	return plan.TakeRatePercent
}

// notifyRecipient tells the target's owner that a pledge or donation landed.
func (s *PaymentsService) notifyRecipient(ctx context.Context, p *domain.Pledge) {
	if s.notifs == nil {
		return
	}
	target, err := s.listings.GetByID(ctx, p.ProjectID)
	if err != nil || target.OwnerID == "" {
		return
	}
	cedis := float64(p.AmountPesewas) / 100
	simTail := map[bool]string{true: " (Simulated — dev mode.)", false: ""}[p.Simulated]
	kind, title, body, link := "pledge", "A pledge came in 🎉",
		fmt.Sprintf("GH₵ %.2f was pledged to “%s”.%s", cedis, p.ProjectTitle, simTail),
		"/projects/"+p.ProjectSlug
	if p.Kind == domain.PledgeKindDonation {
		kind, title, body, link = "donation", "A fan supported you 💚",
			fmt.Sprintf("GH₵ %.2f was donated to “%s”.%s", cedis, p.ProjectTitle, simTail),
			"/music/"+p.ProjectSlug
	}
	_ = s.notifs.Insert(ctx, domain.Notification{
		ID: newID(domain.PrefixNotification), MemberID: target.OwnerID,
		Kind: kind, Title: title, Body: body, Link: link,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
}

// AllPledges is the steward ledger: every pledge, newest first.
func (s *PaymentsService) AllPledges(ctx context.Context) ([]domain.Pledge, error) {
	pledges, err := s.pledges.All(ctx)
	if err != nil {
		return nil, err
	}
	sortPledgesNewestFirst(pledges)
	return pledges, nil
}

func sortPledgesNewestFirst(pledges []domain.Pledge) {
	for i := 1; i < len(pledges); i++ { // insertion sort; ledgers are small and mostly ordered
		for j := i; j > 0 && pledges[j].CreatedAt > pledges[j-1].CreatedAt; j-- {
			pledges[j], pledges[j-1] = pledges[j-1], pledges[j]
		}
	}
}

// FeeTotals sums the platform-fee split over successful pledges, for the
// steward ledger: gross charged, fee kept by the platform, net to projects.
func (s *PaymentsService) FeeTotals(ctx context.Context) (gross, fee, net int64, err error) {
	pledges, err := s.pledges.All(ctx)
	if err != nil {
		return 0, 0, 0, err
	}
	for _, p := range pledges {
		if p.Status != domain.PledgeSuccess {
			continue
		}
		gross += p.AmountPesewas
		fee += p.FeePesewas
		net += p.NetPesewas
	}
	return gross, fee, net, nil
}

// MemberPledges lists a member's own giving history, newest first.
func (s *PaymentsService) MemberPledges(ctx context.Context, memberID string) ([]domain.Pledge, error) {
	pledges, err := s.pledges.ByMember(ctx, memberID)
	if err != nil {
		return nil, err
	}
	// Newest first.
	for i, j := 0, len(pledges)-1; i < j; i, j = i+1, j-1 {
		pledges[i], pledges[j] = pledges[j], pledges[i]
	}
	return pledges, nil
}
