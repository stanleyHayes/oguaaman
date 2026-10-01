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
	"strconv"
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

// ErrFundingClosed is returned when a campaign's funding deadline has passed.
var ErrFundingClosed = errors.New("funding for this campaign has closed")

// PledgeRefundPolicy is the refund term shown to a payer before they pledge
// (K17). Keep it in step with the Terms of Use.
const PledgeRefundPolicy = "Pledges aren't refundable once confirmed, unless the campaign is cancelled or the payment was taken in error. See the Terms of Use."

// PledgeQuote is the GET /api/projects/{slug}/pledge-quote payload (K17): what
// Oguaa keeps from a pledge of AmountPesewas and what reaches the project,
// shown before the payer pays.
type PledgeQuote struct {
	AmountPesewas int64  `json:"amountPesewas"`
	FeePercent    int    `json:"feePercent"`
	FeePesewas    int64  `json:"feePesewas"`
	NetPesewas    int64  `json:"netPesewas"`
	ProjectTitle  string `json:"projectTitle"`
	Beneficiary   string `json:"beneficiary,omitempty"` // the named organiser, when the project states one
	FundingClosed bool   `json:"fundingClosed"`
	RefundPolicy  string `json:"refundPolicy"`
}

// splitFee divides a contribution into the platform fee (integer pesewas,
// rounded down) and the net credited to the recipient.
func splitFee(amountPesewas int64, feePercent int) (fee, net int64) {
	fee = amountPesewas * int64(feePercent) / 100
	return fee, amountPesewas - fee
}

// ErrPaymentNotCompleted is returned by every confirm/fulfil path when the
// provider does not report a full, successful charge for the reference. It is
// a settled outcome, not a transient failure: retrying will not change it.
var ErrPaymentNotCompleted = errors.New("payment was not completed")

// SettlementFinal reports whether a confirm error is a settled outcome that a
// retry cannot change — an unknown reference, a charge that did not complete,
// something no longer available to sell — as opposed to a transient failure
// (provider or database unreachable) worth retrying. The Paystack webhook acks
// the former and asks Paystack to retry the latter.
func SettlementFinal(err error) bool {
	var nf *domain.NotFoundError
	var fb *domain.ForbiddenError
	var ve *domain.ValidationError
	return errors.As(err, &nf) || errors.As(err, &fb) || errors.As(err, &ve) ||
		errors.Is(err, ErrPaymentNotCompleted) || errors.Is(err, ErrSoldOut) || errors.Is(err, ErrSoldOutAfterPayment) ||
		errors.Is(err, ErrJobCancelledRefundDue)
}

const (
	minPledgePesewas = 1_00       // GHS 1
	maxPledgePesewas = 100_000_00 // GHS 100,000 per pledge
)

// Paystack reference prefixes. Every money flow stamps its own, so the
// charge.success webhook can route a charge back to the flow that issued it.
const (
	RefPrefixPledge              = "plg-"
	RefPrefixDonation            = "don-"
	RefPrefixTicket              = "tkt-"
	RefPrefixSubscription        = "sub-"
	RefPrefixCreatorSubscription = "csub-"
	RefPrefixPromotion           = "pro-"
	RefPrefixOrder               = "ord-" // CommerceService.StartOrder
	RefPrefixAgentJob            = "job-" // AgentJobsService.AcceptAndFund
)

// PaystackClient is the seam to the payment provider.
type PaystackClient interface {
	// Initialize starts a transaction; returns the hosted-checkout URL (redirect
	// fallback) and the access code (used by the in-app Paystack Inline popup so
	// the client resumes THIS transaction rather than starting a new one).
	Initialize(ctx context.Context, email string, amountPesewas int64, currency, reference, callbackURL string) (authorizationURL, accessCode string, err error)
	// Verify asks the provider what became of a transaction. A non-nil error
	// is transient (provider unreachable, rate-limited or erroring — wrapped in
	// ErrPaymentCheckUnavailable) and says nothing about the payment; the
	// returned PaymentCheck is the provider's verdict otherwise.
	Verify(ctx context.Context, reference string) (PaymentCheck, error)
	// Simulated reports whether this client moves real money.
	Simulated() bool
}

// CommercePaystack extends the existing transaction seam with the two
// marketplace operations that ordinary pledges/tickets do not need.
type CommercePaystack interface {
	PaystackClient
	CreateSubaccount(ctx context.Context, businessName, bankCode, accountNumber string) (string, error)
	InitializeSplit(ctx context.Context, email string, amountPesewas int64, currency, reference, callbackURL, subaccount string, platformFeePesewas int64) (authorizationURL, accessCode string, err error)
}

// ── real Paystack client ──────────────────────────────────────────────────────

type paystackHTTP struct {
	secret string
	base   string
	http   *http.Client
}

// NewPaystackClient talks to the live Paystack API with the given secret key.
func NewPaystackClient(secretKey string) *paystackHTTP {
	return &paystackHTTP{secret: secretKey, base: "https://api.paystack.co", http: &http.Client{Timeout: 20 * time.Second}}
}

func (p *paystackHTTP) Simulated() bool { return false }

func (p *paystackHTTP) Initialize(ctx context.Context, email string, amountPesewas int64, currency, reference, callbackURL string) (string, string, error) {
	return p.initialize(ctx, map[string]any{
		"email":        email,
		"amount":       amountPesewas, // subunits (pesewas for GHS)
		"currency":     currency,
		"reference":    reference,
		"callback_url": callbackURL,
	})
}

func (p *paystackHTTP) InitializeSplit(ctx context.Context, email string, amountPesewas int64, currency, reference, callbackURL, subaccount string, platformFeePesewas int64) (string, string, error) {
	return p.initialize(ctx, map[string]any{"email": email, "amount": amountPesewas, "currency": currency, "reference": reference, "callback_url": callbackURL, "subaccount": subaccount, "transaction_charge": platformFeePesewas, "bearer": "subaccount"})
}

// errNoCallbackURL refuses an initialize without an explicit callback_url:
// the dashboard default is shared with the owner's other apps (C5).
var errNoCallbackURL = errors.New("paystack initialize needs an explicit callback_url")

func (p *paystackHTTP) initialize(ctx context.Context, payload map[string]any) (string, string, error) {
	if cb, _ := payload["callback_url"].(string); strings.TrimSpace(cb) == "" {
		return "", "", errNoCallbackURL
	}
	ref, _ := payload["reference"].(string)
	// Tag the transaction as Oguaa's so the shared integration's webhook can
	// tell it apart from the owner's other apps (C5).
	payload["metadata"] = map[string]string{"app": metadataApp, "flow": refFlowName(ref)}
	body, _ := json.Marshal(payload)
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

func (p *paystackHTTP) CreateSubaccount(ctx context.Context, businessName, bankCode, accountNumber string) (string, error) {
	body, _ := json.Marshal(map[string]any{"business_name": businessName, "settlement_bank": bankCode, "account_number": accountNumber, "percentage_charge": 0})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.base+"/subaccount", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+p.secret)
	req.Header.Set("Content-Type", "application/json")
	resp, err := p.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("paystack subaccount failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	var parsed struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    struct {
			SubaccountCode string `json:"subaccount_code"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&parsed); err != nil {
		return "", err
	}
	if !parsed.Status || parsed.Data.SubaccountCode == "" {
		return "", fmt.Errorf("paystack subaccount rejected: %s", parsed.Message)
	}
	return parsed.Data.SubaccountCode, nil
}

func (p *paystackHTTP) Verify(ctx context.Context, reference string) (PaymentCheck, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.base+"/transaction/verify/"+url.PathEscape(reference), nil)
	if err != nil {
		return PaymentCheck{}, err
	}
	req.Header.Set("Authorization", "Bearer "+p.secret)
	resp, err := p.http.Do(req)
	if err != nil {
		return PaymentCheck{}, fmt.Errorf("%w: paystack verify failed: %w", ErrPaymentCheckUnavailable, err)
	}
	defer func() { _ = resp.Body.Close() }()
	var parsed struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Code    string `json:"code"`
		Data    struct {
			Status    string `json:"status"`
			Amount    int64  `json:"amount"`
			Currency  string `json:"currency"`
			Reference string `json:"reference"`
			Fees      int64  `json:"fees"`
		} `json:"data"`
	}
	decodeErr := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&parsed)
	if paystackReferenceUnknown(resp.StatusCode, parsed.Code, parsed.Message) {
		// Paystack never saw this reference: no charge exists, so it is final.
		return PaymentCheck{Outcome: PaymentFailed, Reference: reference}, nil
	}
	if resp.StatusCode != http.StatusOK || decodeErr != nil || !parsed.Status {
		return PaymentCheck{}, fmt.Errorf("%w: paystack verify answered HTTP %d (%s)", ErrPaymentCheckUnavailable, resp.StatusCode, parsed.Message)
	}
	return PaymentCheck{
		Outcome:       paystackOutcome(parsed.Data.Status),
		AmountPesewas: parsed.Data.Amount,
		Currency:      parsed.Data.Currency,
		Reference:     parsed.Data.Reference,
		FeesPesewas:   parsed.Data.Fees,
	}, nil
}

// paystackReferenceUnknown reports Paystack's "Transaction reference not
// found" answer (HTTP 400/404, code transaction_not_found).
func paystackReferenceUnknown(status int, code, message string) bool {
	if status != http.StatusBadRequest && status != http.StatusNotFound {
		return false
	}
	return code == "transaction_not_found" || strings.Contains(strings.ToLower(message), "reference not found")
}

// paystackOutcome maps a Paystack transaction status onto what a flow acts
// on: success settles; failed, abandoned and reversed are final failures;
// everything else (pending, ongoing, processing, queued, or a status Paystack
// adds later) is still in progress and leaves the record pending (C1).
func paystackOutcome(status string) PaymentOutcome {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "success":
		return PaymentPaid
	case "failed", "abandoned", "reversed":
		return PaymentFailed
	default:
		return PaymentInProgress
	}
}

// ── simulated client (no keys) ────────────────────────────────────────────────

// simulatedSubaccountPrefix marks subaccount codes the simulation made up;
// they don't exist at Paystack.
const simulatedSubaccountPrefix = "ACCT_SIM_"

// SimulatedPaystack closes the payment loop without moving money: the
// "authorization URL" is simply the callback URL, so the payer lands straight
// back on the confirm step. Pledges confirmed this way are flagged Simulated.
type SimulatedPaystack struct{ Log *slog.Logger }

func (s SimulatedPaystack) Simulated() bool { return true }

func (s SimulatedPaystack) Initialize(_ context.Context, email string, amountPesewas int64, currency, reference, callbackURL string) (string, string, error) {
	if strings.TrimSpace(callbackURL) == "" {
		return "", "", errNoCallbackURL
	}
	if s.Log != nil {
		s.Log.Info("SIMULATED Paystack charge — no real money moves", "email", email, "amount", amountPesewas, "currency", currency, "ref", reference)
	}
	// No access code in simulation — the client falls back to the callback URL,
	// which lands straight back on the confirm step.
	return callbackURL, "", nil
}

func (s SimulatedPaystack) Verify(_ context.Context, reference string) (PaymentCheck, error) {
	// Amount 0 = unknown; only the labelled simulation may report it.
	return PaymentCheck{Outcome: PaymentPaid, Currency: paymentCurrency, Reference: reference}, nil
}
func (s SimulatedPaystack) CreateSubaccount(_ context.Context, businessName, _, _ string) (string, error) {
	return simulatedSubaccountPrefix + slugify(businessName), nil
}
func (s SimulatedPaystack) InitializeSplit(ctx context.Context, email string, amount int64, currency, reference, callbackURL, subaccount string, fee int64) (string, string, error) {
	return s.Initialize(ctx, email, amount, currency, reference, callbackURL)
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
	if FundingClosed(*project, now) {
		return "", "", "", ErrFundingClosed
	}
	feePercent := s.takeRateForOwner(ctx, project.ID) // the rate the quote showed; locked for confirmation
	reference = newReference(RefPrefixPledge, project.Slug, strconv.FormatInt(now.UnixNano(), 10))
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
		FeePercent:    &feePercent,
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
	reference = newReference(RefPrefixDonation, artist.Slug, strconv.FormatInt(now.UnixNano(), 10))
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

// QuotePledge tells a payer, before they pay, the platform fee rate for this
// project (its owner's plan take-rate, or the flat platform fee), the fee and
// net amount for amountPesewas, who the money is for and the refund terms.
// StartPledge locks the same rate onto the pledge.
func (s *PaymentsService) QuotePledge(ctx context.Context, projectSlug string, amountPesewas int64) (*PledgeQuote, error) {
	if amountPesewas < minPledgePesewas || amountPesewas > maxPledgePesewas {
		return nil, ErrPledgeAmount
	}
	project, err := s.listings.GetBySlug(ctx, domain.TypeProject, projectSlug)
	if err != nil {
		return nil, err
	}
	if project.Status != domain.StatusApproved {
		return nil, &domain.NotFoundError{Entity: "project"}
	}
	feePercent := s.takeRateForOwner(ctx, project.ID)
	fee, net := splitFee(amountPesewas, feePercent)
	return &PledgeQuote{
		AmountPesewas: amountPesewas,
		FeePercent:    feePercent,
		FeePesewas:    fee,
		NetPesewas:    net,
		ProjectTitle:  project.Title,
		Beneficiary:   strings.TrimSpace(asString(project.Details, "organiser")),
		FundingClosed: FundingClosed(*project, time.Now().UTC()),
		RefundPolicy:  PledgeRefundPolicy,
	}, nil
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
		return s.finishGrant(ctx, pledge) // settled; credit a target a failed earlier confirm left owed
	}
	if err := verifyCharge(ctx, s.paystack, reference, pledge.AmountPesewas, s.pledges.MarkFailed); err != nil {
		return nil, err
	}
	return s.fulfillPledge(ctx, pledge, true, pledge.AmountPesewas)
}

// FulfillPledge marks a pledge successful using an amount already verified by
// another gateway (e.g. Stripe). It is idempotent.
func (s *PaymentsService) FulfillPledge(ctx context.Context, reference string, amountPesewas int64) (*domain.Pledge, error) {
	pledge, err := s.pledges.ByReference(ctx, reference)
	if err != nil {
		return nil, err
	}
	if pledge.Status == domain.PledgeSuccess {
		return s.finishGrant(ctx, pledge)
	}
	return s.fulfillPledge(ctx, pledge, true, amountPesewas)
}

func (s *PaymentsService) fulfillPledge(ctx context.Context, pledge *domain.Pledge, success bool, amount int64) (*domain.Pledge, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if !success || (amount > 0 && amount < pledge.AmountPesewas) {
		_ = s.pledges.MarkFailed(ctx, pledge.Reference)
		return nil, ErrPaymentNotCompleted
	}
	// Split the platform fee (integer pesewas, rounded down); the recipient is
	// credited the NET. The rate is the TARGET listing owner's plan take-rate
	// (Creator Monetization), falling back to the flat platform fee for legacy
	// civic projects whose owner has no active creator plan.
	feePercent := s.takeRateForOwner(ctx, pledge.ProjectID)
	if pledge.FeePercent != nil {
		feePercent = *pledge.FeePercent // the rate the payer was shown
	}
	fee, net := splitFee(pledge.AmountPesewas, feePercent)
	// One conditional write settles the pledge. Every confirm that got this far
	// (redirect, webhook, replays) races here; only the winner credits the
	// target and notifies, so a single payment is never counted twice.
	claimed, err := s.pledges.MarkSuccess(ctx, pledge.Reference, now, fee, net)
	if err != nil {
		return nil, err
	}
	if !claimed {
		return s.pledges.ByReference(ctx, pledge.Reference) // settled by a concurrent confirm
	}
	pledge.Status = domain.PledgeSuccess
	pledge.FeePesewas = fee
	pledge.NetPesewas = net
	pledge.ConfirmedAt = now
	pledge.GrantPending = true
	return s.finishGrant(ctx, pledge)
}

// finishGrant credits the recipient a settled pledge still owes (a confirm
// whose credit write failed after the claim), then clears grantPending:
// donations bump the artist's donation total; campaign and project pledges
// bump the project's raised total. The credit is keyed on the reference, so
// a re-run never counts the pledge twice; the recipient is notified by the
// run that credited it. A record owing nothing is returned as-is.
func (s *PaymentsService) finishGrant(ctx context.Context, pledge *domain.Pledge) (*domain.Pledge, error) {
	if !pledge.GrantPending {
		return pledge, nil
	}
	credit := s.listings.IncrementRaised
	if pledge.Kind == domain.PledgeKindDonation {
		credit = s.listings.IncrementDonations
	}
	credited, err := credit(ctx, pledge.ProjectID, pledge.Reference, pledge.NetPesewas)
	if err != nil {
		return nil, err
	}
	if err := s.pledges.MarkGranted(ctx, pledge.Reference); err != nil {
		return nil, err
	}
	pledge.GrantPending = false
	if credited {
		s.notifyRecipient(ctx, pledge)
	}
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
// Simulated (dev-mode) pledges moved no money and are left out (P32).
func (s *PaymentsService) FeeTotals(ctx context.Context) (gross, fee, net int64, err error) {
	pledges, err := s.pledges.All(ctx)
	if err != nil {
		return 0, 0, 0, err
	}
	for _, p := range pledges {
		if p.Status != domain.PledgeSuccess || p.Simulated {
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
