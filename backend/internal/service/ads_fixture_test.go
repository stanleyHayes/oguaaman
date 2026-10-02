package service

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service/adsfake"
)

// ── shared fixture for the ads tests ────────────────────────────────────────

var (
	_ domain.AdRepository        = (*adsfake.Ads)(nil)
	_ domain.AdSponsorRepository = (*adsfake.Sponsors)(nil)
	_ domain.AdStatsReader       = (*adsfake.Stats)(nil)
	_ RefundingPaystack          = (*adPay)(nil)
)

// adNow is the fixture clock: Friday 2 October 2026, 09:00 in Accra.
var adNow = time.Date(2026, 10, 2, 9, 0, 0, 0, time.UTC)

const (
	adImg       = "https://res.cloudinary.com/demo/image/upload/v1/oguaa/m/m-ama/ad.jpg"
	adMember    = "m-ama"
	adSponsorID = "asp-1"
)

// adPay is a refunding Paystack fake: charges are scripted per reference,
// refunds are recorded and answered with refundStatus.
type adPay struct {
	mu           sync.Mutex
	paid         map[string]int64 // ref → amount charged
	failed       map[string]bool
	inits        []string // callback URLs
	refunds      []string // "ref:amount"
	refundStatus string   // reply to Refund (default pending)
	refundErr    error
	pollStatus   string // reply to RefundStatus (default processed)
	simulated    bool
}

func newAdPay() *adPay { return &adPay{paid: map[string]int64{}, failed: map[string]bool{}} }

func (p *adPay) Simulated() bool { return p.simulated }

func (p *adPay) Initialize(_ context.Context, _ string, _ int64, _, ref, callback string) (string, string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.inits = append(p.inits, callback)
	return "https://checkout.paystack.test/" + ref, "AC_" + ref, nil
}

func (p *adPay) Verify(_ context.Context, ref string) (PaymentCheck, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if amount, ok := p.paid[ref]; ok {
		return PaymentCheck{Outcome: PaymentPaid, AmountPesewas: amount, Currency: paymentCurrency, Reference: ref}, nil
	}
	if p.failed[ref] {
		return PaymentCheck{Outcome: PaymentFailed, Reference: ref}, nil
	}
	return PaymentCheck{Outcome: PaymentInProgress}, nil
}

func (p *adPay) Refund(_ context.Context, ref string, amount int64, _ string) (RefundResult, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.refundErr != nil {
		return RefundResult{}, p.refundErr
	}
	p.refunds = append(p.refunds, ref+":"+itoa64(amount))
	status := p.refundStatus
	if status == "" {
		status = RefundPending
	}
	return RefundResult{RefundID: "rf-" + itoa64(int64(len(p.refunds))), Status: status}, nil
}

func (p *adPay) RefundStatus(_ context.Context, id string) (RefundResult, error) {
	status := p.pollStatus
	if status == "" {
		status = RefundProcessed
	}
	return RefundResult{RefundID: id, Status: status}, nil
}

func itoa64(n int64) string {
	b := []byte{}
	if n == 0 {
		return "0"
	}
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

// adMailbox records advertiser emails.
type adMailbox struct {
	mu   sync.Mutex
	sent []string // "to|subject"
}

func (m *adMailbox) Send(_ context.Context, to, subject, _ string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sent = append(m.sent, to+"|"+subject)
	return nil
}

func (m *adMailbox) subjects() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := []string{}
	for _, s := range m.sent {
		out = append(out, s[strings.Index(s, "|")+1:])
	}
	return out
}

// adImages is a fake creative copier.
type adImages struct {
	copies []string
	err    error
}

func (a *adImages) CopyAdImage(_ context.Context, campaignID, publicID, _ string) (string, error) {
	if a.err != nil {
		return "", a.err
	}
	a.copies = append(a.copies, campaignID+"/"+publicID)
	return "https://res.cloudinary.com/demo/image/upload/v9/oguaa/ads/" + campaignID + "/" + publicID + ".jpg", nil
}

type adFix struct {
	t         *testing.T
	svc       *AdsService
	ads       *adsfake.Ads
	sponsors  *adsfake.Sponsors
	stats     *adsfake.Stats
	pay       *adPay
	settings  *SettingsService
	elections *memElections
	calendar  *ElectionsService
	mail      *adMailbox
	images    *adImages
	clock     time.Time
}

// newAdFix builds an ads service with ads and political ads switched on and
// the feed card forecasting 1,000 opportunities a day (500 sellable).
func newAdFix(t *testing.T, mutate ...func(*domain.AdSettings)) *adFix {
	t.Helper()
	f := &adFix{
		t: t, ads: adsfake.NewAds(), sponsors: adsfake.NewSponsors(), pay: newAdPay(),
		stats:     &adsfake.Stats{Campaign: map[string][]domain.AdCampaignDay{}, Placement: map[string][]domain.AdPlacementDay{}},
		elections: newMemElections(), mail: &adMailbox{}, images: &adImages{}, clock: adNow,
	}
	f.ads.Now = func() time.Time { return f.clock }
	f.settings = NewSettingsService(newMemSettings(), slog.New(slog.NewTextHandler(io.Discard, nil)))
	set := DefaultAdSettings()
	set.AdsEnabled, set.PoliticalEnabled = true, true
	for i := range set.Placements {
		if set.Placements[i].Slug == domain.AdPlacementPortalFeedCard {
			set.Placements[i].FallbackDailyViews = 1000
		}
	}
	for _, m := range mutate {
		m(&set)
	}
	if err := f.settings.Save(context.Background(), SettingsChange{Key: domain.SettingsKeyAds, Doc: &set, ActorName: "Steward", Reason: "test fixture"}); err != nil {
		t.Fatal(err)
	}
	f.calendar = NewElectionsService(f.elections, f.settings, nil)
	f.svc = NewAdsService(AdsDeps{
		Campaigns: f.ads, Sponsors: f.sponsors, Stats: f.stats, Settings: f.settings, Elections: f.calendar,
		Paystack: f.pay, Images: f.images, Email: f.mail, PortalURL: "https://portal.test/",
		CloudinaryCloudName: "demo", Log: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	f.svc.now = func() time.Time { return f.clock }
	f.addSponsor(adSponsorID, domain.AdSponsorCommercial, domain.AdSponsorVerified)
	return f
}

// addSponsor stores a sponsor owned by adMember.
func (f *adFix) addSponsor(id, kind, status string) domain.AdSponsor {
	sp := domain.AdSponsor{
		ID: id, MemberID: adMember, Kind: kind, EntityType: domain.AdEntityBusiness, DisplayName: "Kotokuraba Traders",
		LegalName: "Kotokuraba Traders Ltd", Address: "GE-161-2814 Cape Coast", Phone: "+233555180048", Email: "ads@kotokuraba.test",
		Status: status, CreatedAt: adNow.Format(time.RFC3339),
	}
	if kind == domain.AdSponsorPolitical {
		sp.EntityType, sp.LegalName, sp.CandidateName, sp.Office, sp.Constituency = domain.AdEntityCandidate, "Ama Mensah", "Ama Mensah", domain.AdOfficeParliamentary, "Cape Coast North"
	}
	_ = f.sponsors.Insert(context.Background(), sp)
	return sp
}

// submitInput is a valid commercial card booking from 5 to 18 October.
func submitInput() AdSubmitInput {
	return AdSubmitInput{
		SponsorID: adSponsorID, Placement: domain.AdPlacementPortalFeedCard, Category: AdCategoryRetail,
		Creative: domain.AdCreative{
			ImageURL: adImg, Headline: "Market days at Kotokuraba", Body: "Fresh fish and fabric every Saturday.",
			Alt: "Stalls at Kotokuraba market", LandingURL: "https://kotokuraba.test/market",
		},
		StartDate: "2026-10-05", EndDate: "2026-10-18", Impressions: 3000, AcceptTerms: true, StartConsent: true,
	}
}

func (f *adFix) submit(mutate ...func(*AdSubmitInput)) *AdCampaignView {
	f.t.Helper()
	in := submitInput()
	for _, m := range mutate {
		m(&in)
	}
	c, err := f.svc.Submit(context.Background(), adMember, "payer@example.test", in)
	if err != nil {
		f.t.Fatalf("submit: %v", err)
	}
	return c
}

var allTicked = func() map[string]bool {
	m := map[string]bool{}
	for _, k := range adApprovalChecklist {
		m[k] = true
	}
	return m
}()

var (
	stewardStaff = AdStaff{ID: "m-steward", Name: "Nana Essien", Role: domain.RoleSteward}
	curatorA     = AdStaff{ID: "m-cur-a", Name: "Curator A", Role: domain.RoleCurator}
	curatorB     = AdStaff{ID: "m-cur-b", Name: "Curator B", Role: domain.RoleCurator}
	moderator    = AdStaff{ID: "m-mod", Name: "Moderator", Role: domain.RoleModerator}
)

func (f *adFix) approve(id string, staff AdStaff) *AdCampaignAdmin {
	f.t.Helper()
	c, err := f.svc.Approve(context.Background(), id, AdApproveInput{Checklist: allTicked}, staff)
	if err != nil {
		f.t.Fatalf("approve: %v", err)
	}
	return c
}

// pay checks out and confirms a payment of the campaign's total.
func (f *adFix) payFor(id string) *domain.AdCampaign {
	f.t.Helper()
	co, err := f.svc.Checkout(context.Background(), adMember, id, "")
	if err != nil {
		f.t.Fatalf("checkout: %v", err)
	}
	c := f.ads.Peek(id)
	f.pay.paid[co.Reference] = c.Price.TotalPesewas
	paid, err := f.svc.ConfirmPayment(context.Background(), co.Reference)
	if err != nil {
		f.t.Fatalf("confirm: %v", err)
	}
	return paid
}

// booked runs submit → approve → pay and returns the campaign id.
func (f *adFix) booked(mutate ...func(*AdSubmitInput)) string {
	f.t.Helper()
	c := f.submit(mutate...)
	f.approve(c.ID, stewardStaff)
	f.payFor(c.ID)
	return c.ID
}

// adCode returns the AdError code of err ("" when it is not one).
func adCode(err error) string {
	var ae *AdError
	if errors.As(err, &ae) {
		return ae.Code
	}
	return ""
}

func (f *adFix) at(day string) {
	t, err := time.Parse(time.DateOnly, day)
	if err != nil {
		f.t.Fatal(err)
	}
	f.clock = t.Add(9 * time.Hour)
}

// addElection stores an election with the default windows of spec §1.2.
func (f *adFix) addElection(id, kind, poll string) domain.Election {
	f.t.Helper()
	e, err := buildElection(ElectionInput{Name: "Cape Coast North by-election", Kind: kind, Scope: domain.ElectionScopeConstituency, Areas: []string{"Cape Coast North"}, PollDate: poll})
	if err != nil {
		f.t.Fatal(err)
	}
	e.ID = id
	_ = f.elections.Insert(context.Background(), e)
	f.calendar.forget() // as ElectionsService.Create does
	return e
}
