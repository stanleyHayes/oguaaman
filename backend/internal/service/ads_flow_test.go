package service

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── sponsors ────────────────────────────────────────────────────────────────

func sponsorInput(kind string) AdSponsorInput {
	in := AdSponsorInput{
		Kind: kind, EntityType: domain.AdEntityBusiness, DisplayName: "Kotokuraba Traders", LegalName: "Kotokuraba Traders Ltd",
		Address: "GE-161-2814, Cape Coast", Phone: "+233 55 518 0048", Email: "ads@kotokuraba.test",
	}
	if kind == domain.AdSponsorPolitical {
		in.EntityType, in.LegalName, in.IDNumberLast4, in.IDDocumentUploadID = domain.AdEntityCandidate, "Ama Mensah", "123A", "private:pu-id"
		in.CandidateName, in.Office, in.Constituency, in.PartyName = "Ama Mensah", domain.AdOfficeParliamentary, "Cape Coast North", "Independent"
		in.CitizenshipDeclaration = true
	}
	return in
}

func TestSponsorValidation(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	sp, err := f.svc.CreateSponsor(ctx, adMember, sponsorInput(domain.AdSponsorCommercial))
	if err != nil || sp.Status != domain.AdSponsorPending || sp.Phone == "" || sp.MemberID != adMember {
		t.Fatalf("commercial sponsor = %+v %v", sp, err)
	}
	pol, err := f.svc.CreateSponsor(ctx, adMember, sponsorInput(domain.AdSponsorPolitical))
	if err != nil || pol.IDDocumentUploadID != "pu-id" || pol.CitizenshipDeclaredAt == "" {
		t.Fatalf("political sponsor = %+v %v", pol, err)
	}
	cases := map[string]struct {
		kind   string
		mutate func(*AdSponsorInput)
		code   string
	}{
		"concerned citizens": {domain.AdSponsorCommercial, func(in *AdSponsorInput) { in.DisplayName = "Concerned Citizens of Oguaa" }, AdErrSponsorNameNotAllowed},
		"friends of":         {domain.AdSponsorPolitical, func(in *AdSponsorInput) { in.LegalName = "Friends of Ama" }, AdErrSponsorNameNotAllowed},
		"no citizenship":     {domain.AdSponsorPolitical, func(in *AdSponsorInput) { in.CitizenshipDeclaration = false }, AdErrCitizenshipRequired},
		"no ghana card":      {domain.AdSponsorPolitical, func(in *AdSponsorInput) { in.IDDocumentUploadID = "" }, AdErrInvalidSponsor},
		"org needs reg no":   {domain.AdSponsorPolitical, func(in *AdSponsorInput) { in.EntityType = domain.AdEntityParty }, AdErrInvalidSponsor},
		"no constituency":    {domain.AdSponsorPolitical, func(in *AdSponsorInput) { in.Constituency = "" }, AdErrInvalidSponsor},
		"da needs EC": {domain.AdSponsorPolitical, func(in *AdSponsorInput) {
			in.Office = domain.AdOfficeDistrictAssembly
		}, AdErrInvalidSponsor},
		"bad email": {domain.AdSponsorCommercial, func(in *AdSponsorInput) { in.Email = "nope" }, AdErrInvalidSponsor},
		"bad phone": {domain.AdSponsorCommercial, func(in *AdSponsorInput) { in.Phone = "call me" }, AdErrInvalidSponsor},
		"bad kind":  {"secret", func(*AdSponsorInput) {}, AdErrInvalidSponsor},
	}
	for name, c := range cases {
		in := sponsorInput(c.kind)
		c.mutate(&in)
		if _, err := f.svc.CreateSponsor(ctx, adMember, in); adCode(err) != c.code {
			t.Errorf("%s: err = %v, want %s", name, err, c.code)
		}
	}
}

func TestSponsorEditAndReview(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	sp, _ := f.svc.CreateSponsor(ctx, adMember, sponsorInput(domain.AdSponsorCommercial))
	in := sponsorInput(domain.AdSponsorCommercial)
	in.DisplayName = "Kotokuraba Market Traders"
	if _, err := f.svc.UpdateSponsor(ctx, "m-other", sp.ID, in); adCode(err) != AdErrSponsorNotFound {
		t.Fatalf("someone else's sponsor: %v", err)
	}
	if _, err := f.svc.ReviewSponsor(ctx, sp.ID, SponsorActionReject, "", AuditActor{Name: "Curator"}); adCode(err) != AdErrInvalidReason {
		t.Fatalf("reject without a note: %v", err)
	}
	if _, err := f.svc.ReviewSponsor(ctx, sp.ID, SponsorActionReject, "Registration number missing", AuditActor{Name: "Curator"}); err != nil {
		t.Fatal(err)
	}
	upd, err := f.svc.UpdateSponsor(ctx, adMember, sp.ID, in)
	if err != nil || upd.Status != domain.AdSponsorPending || upd.DisplayName != "Kotokuraba Market Traders" {
		t.Fatalf("edit after rejection = %+v %v", upd, err)
	}
	v, err := f.svc.ReviewSponsor(ctx, sp.ID, SponsorActionVerify, "", AuditActor{Name: "Curator"})
	if err != nil || v.Status != domain.AdSponsorVerified || v.VerifiedByName != "Curator" {
		t.Fatalf("verify = %+v %v", v, err)
	}
	if _, err := f.svc.UpdateSponsor(ctx, adMember, sp.ID, in); adCode(err) != AdErrSponsorLocked {
		t.Fatalf("verified sponsor edit: %v", err)
	}
	mine, _ := f.svc.MySponsors(ctx, adMember)
	if len(mine) != 2 || mine[0].Email == "" {
		t.Fatalf("my sponsors = %+v", mine)
	}
}

// Suspending a sponsor pauses its running and scheduled campaigns.
func TestSuspendingASponsorPausesItsAds(t *testing.T) {
	f := newAdFix(t)
	id := f.booked() // scheduled from 5 Oct
	if _, err := f.svc.ReviewSponsor(context.Background(), adSponsorID, SponsorActionSuspend, "Fraud report confirmed", AuditActor{Name: "Curator"}); err != nil {
		t.Fatal(err)
	}
	if got := f.ads.Peek(id).Status; got != domain.AdStatusPaused {
		t.Fatalf("status = %q, want paused", got)
	}
	if _, err := f.svc.Submit(context.Background(), adMember, "", submitInput()); adCode(err) != AdErrSponsorNotVerified {
		t.Fatalf("suspended sponsor submits: %v", err)
	}
}

// ── review ──────────────────────────────────────────────────────────────────

func TestApproveCommercial(t *testing.T) {
	f := newAdFix(t)
	c := f.submit()
	if _, err := f.svc.Approve(context.Background(), c.ID, AdApproveInput{Checklist: map[string]bool{"sponsorIdentified": true}}, moderator); adCode(err) != AdErrChecklistIncomplete {
		t.Fatalf("partial checklist: %v", err)
	}
	got := f.approve(c.ID, moderator)
	if got.Status != domain.AdStatusApproved || got.ApprovalExpiresAt != adNow.Add(72*time.Hour).Format(time.RFC3339) {
		t.Fatalf("approved = %s %s", got.Status, got.ApprovalExpiresAt)
	}
	if got.Creative.ImageURL != "https://res.cloudinary.com/demo/image/upload/v9/oguaa/ads/"+c.ID+"/creative-1.jpg" || len(f.images.copies) != 1 {
		t.Fatalf("creative not copied: %+v %v", got.Creative, f.images.copies)
	}
	if got.SponsorLine != "Sponsored · Kotokuraba Traders" || len(got.Approvals) != 1 || got.Approvals[0].Checklist == nil {
		t.Fatalf("approval = %+v", got.Approvals)
	}
	if subj := f.mail.subjects(); len(subj) != 1 || subj[0] != "Your Oguaa ad is approved" {
		t.Fatalf("emails = %v", subj)
	}
	if _, err := f.svc.Approve(context.Background(), c.ID, AdApproveInput{Checklist: allTicked}, curatorA); adCode(err) != AdErrInvalidTransition {
		t.Fatalf("approving twice: %v", err)
	}
	// The advertiser sees who approved, never the checklist.
	mine, _ := f.svc.MyCampaign(context.Background(), adMember, c.ID)
	if len(mine.Approvals) != 1 || mine.Approvals[0].StaffName != "Moderator" {
		t.Fatalf("advertiser approvals = %+v", mine.Approvals)
	}
}

func TestApproveNeedsAVerifiedSponsorAndInventory(t *testing.T) {
	f := newAdFix(t)
	f.addSponsor("asp-new", domain.AdSponsorCommercial, domain.AdSponsorPending)
	c := f.submit(func(in *AdSubmitInput) { in.SponsorID = "asp-new" })
	if _, err := f.svc.Approve(context.Background(), c.ID, AdApproveInput{Checklist: allTicked}, curatorA); adCode(err) != AdErrSponsorNotVerified {
		t.Fatalf("unverified sponsor: %v", err)
	}
	// Another campaign booked the whole window meanwhile.
	d := f.submit()
	f.ads.Put(domain.AdCampaign{ID: "ad-big2", Placement: domain.AdPlacementPortalFeedCard, Status: domain.AdStatusScheduled, StartDate: "2026-10-05", EndDate: "2026-10-18", BookedImpressions: 7000})
	if _, err := f.svc.Approve(context.Background(), d.ID, AdApproveInput{Checklist: allTicked}, stewardStaff); adCode(err) != AdErrInventoryUnavailable {
		t.Fatalf("sold-out approval: %v", err)
	}
	// A failed creative copy records nothing, so the reviewer can retry.
	g := newAdFix(t)
	e := g.submit()
	g.images.err = errors.New("cloudinary down")
	if _, err := g.svc.Approve(context.Background(), e.ID, AdApproveInput{Checklist: allTicked}, curatorA); adCode(err) != AdErrMediaUnavailable {
		t.Fatalf("copy failure: %v", err)
	}
	g.images.err = nil
	if got := g.approve(e.ID, curatorA); got.Status != domain.AdStatusApproved {
		t.Fatalf("retry = %s", got.Status)
	}
}

// Political ads: two different curators, or one steward; moderators can't.
func TestApprovePoliticalNeedsTwoCuratorsOrASteward(t *testing.T) {
	f := newAdFix(t)
	f.addSponsor("asp-pol", domain.AdSponsorPolitical, domain.AdSponsorVerified)
	pol := func(in *AdSubmitInput) {
		in.SponsorID, in.Political, in.PoliticalType, in.Category = "asp-pol", true, domain.AdPoliticalIssue, ""
		in.Creative.Headline = "Clean water for every ward"
	}
	c := f.submit(pol)
	if c.Category != AdCategoryPolitical || c.SponsorLine != "Paid for by Ama Mensah" {
		t.Fatalf("political submission = %+v", c)
	}
	if _, err := f.svc.Approve(context.Background(), c.ID, AdApproveInput{Checklist: allTicked}, moderator); adCode(err) != AdErrForbidden {
		t.Fatalf("moderator: %v", err)
	}
	first := f.approve(c.ID, curatorA)
	if first.Status != domain.AdStatusPendingReview || len(first.Approvals) != 1 || first.ApprovalsNeeded != 2 {
		t.Fatalf("after one curator = %s, %d approvals", first.Status, len(first.Approvals))
	}
	if _, err := f.svc.Approve(context.Background(), c.ID, AdApproveInput{Checklist: allTicked}, curatorA); adCode(err) != AdErrAlreadyApprovedByYou {
		t.Fatalf("same curator twice: %v", err)
	}
	second := f.approve(c.ID, curatorB)
	if second.Status != domain.AdStatusApproved || len(second.Approvals) != 2 {
		t.Fatalf("after two curators = %s", second.Status)
	}
	d := f.submit(pol)
	if got := f.approve(d.ID, stewardStaff); got.Status != domain.AdStatusApproved {
		t.Fatalf("steward alone = %s", got.Status)
	}
}

func TestRejectPauseResumeRemove(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	c := f.submit()
	if _, err := f.svc.Reject(ctx, c.ID, "no", curatorA); adCode(err) != AdErrInvalidReason {
		t.Fatalf("short reason: %v", err)
	}
	r, err := f.svc.Reject(ctx, c.ID, "The landing page sells something else", curatorA)
	if err != nil || r.Status != domain.AdStatusRejected || r.RejectReason == "" {
		t.Fatalf("reject = %+v %v", r, err)
	}
	if _, err := f.svc.Pause(ctx, c.ID, "Checking a complaint", curatorA); adCode(err) != AdErrInvalidTransition {
		t.Fatalf("pausing a rejected ad: %v", err)
	}

	f.at("2026-10-03")
	id := f.booked(func(in *AdSubmitInput) { in.StartDate = "2026-10-05" })
	f.at("2026-10-06")
	f.svc.RunScheduler(ctx)
	if got := f.ads.Peek(id).Status; got != domain.AdStatusActive {
		t.Fatalf("scheduler start = %q", got)
	}
	if p, err := f.svc.Pause(ctx, id, "Checking a complaint", curatorA); err != nil || p.Status != domain.AdStatusPaused {
		t.Fatalf("pause = %v", err)
	}
	if p, err := f.svc.Resume(ctx, id, "Complaint not upheld", curatorA); err != nil || p.Status != domain.AdStatusActive {
		t.Fatalf("resume = %v", err)
	}
	f.ads.Put(func() domain.AdCampaign { c := f.ads.Peek(id); c.Delivered = 1500; return c }())
	rm, err := f.svc.Remove(ctx, id, "Misleading claims about prices", curatorA)
	if err != nil || rm.Status != domain.AdStatusRemoved || rm.RemovalReason == "" || rm.RefundOwed != domain.AdRefundRemoved {
		t.Fatalf("remove = %+v %v", rm, err)
	}
	f.svc.RunScheduler(ctx)
	got := f.ads.Peek(id)
	if len(got.Refunds) != 1 || got.Refunds[0].AmountPesewas != 7500 || got.Refunds[0].Reason != domain.AdRefundRemoved || got.RefundOwed != "" {
		t.Fatalf("removal refund = %+v", got.Refunds)
	}
}

// ── payment ─────────────────────────────────────────────────────────────────

func TestCheckoutAndConfirm(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	c := f.submit()
	if _, err := f.svc.Checkout(ctx, adMember, c.ID, ""); adCode(err) != AdErrNotApproved {
		t.Fatalf("checkout before approval: %v", err)
	}
	f.approve(c.ID, curatorA)
	if _, err := f.svc.Checkout(ctx, "m-other", c.ID, ""); adCode(err) != AdErrNotFound {
		t.Fatalf("someone else's ad: %v", err)
	}
	co, err := f.svc.Checkout(ctx, adMember, c.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(co.Reference, "oguaa-adv-"+c.ID+"-") || f.pay.inits[0] != "https://portal.test/me/ads?ad_ref="+co.Reference {
		t.Fatalf("checkout = %+v, callback %q", co, f.pay.inits)
	}
	if prefix, ns := RefFlow(co.Reference); prefix != RefPrefixAd || !ns {
		t.Fatalf("RefFlow = %q %v", prefix, ns)
	}
	// Still processing: confirm waits, a new checkout is refused.
	if _, err := f.svc.ConfirmPayment(ctx, co.Reference); !errors.Is(err, ErrPaymentPending) {
		t.Fatalf("pending confirm: %v", err)
	}
	if _, err := f.svc.Checkout(ctx, adMember, c.ID, ""); !errors.Is(err, ErrPaymentPending) {
		t.Fatalf("second checkout while the first is in progress: %v", err)
	}
	// The first checkout failed; a second one replaces it.
	f.pay.failed[co.Reference] = true
	co2, err := f.svc.Checkout(ctx, adMember, c.ID, "")
	if err != nil || co2.Reference == co.Reference {
		t.Fatalf("retry checkout = %+v %v", co2, err)
	}
	// The payer still pays on the first page: the campaign is found by its past reference.
	f.pay.failed[co.Reference] = false
	f.pay.paid[co.Reference] = c.Price.TotalPesewas
	paid, err := f.svc.ConfirmPayment(ctx, co.Reference)
	if err != nil || paid.Status != domain.AdStatusScheduled || paid.PaymentStatus != domain.AdPaymentSuccess || paid.Reference != co.Reference {
		t.Fatalf("confirm = %+v %v", paid, err)
	}
	if _, err := f.svc.Checkout(ctx, adMember, c.ID, ""); adCode(err) != AdErrAlreadyPaid {
		t.Fatalf("checkout after payment: %v", err)
	}
	again, err := f.svc.ConfirmPayment(ctx, co.Reference)
	if err != nil || again.Status != domain.AdStatusScheduled {
		t.Fatalf("idempotent confirm: %v", err)
	}
}

func TestConfirmWrongAmountFails(t *testing.T) {
	f := newAdFix(t)
	c := f.submit()
	f.approve(c.ID, curatorA)
	co, _ := f.svc.Checkout(context.Background(), adMember, c.ID, "")
	f.pay.paid[co.Reference] = 100
	if _, err := f.svc.ConfirmPayment(context.Background(), co.Reference); !errors.Is(err, ErrPaymentNotCompleted) {
		t.Fatalf("short payment: %v", err)
	}
	if got := f.ads.Peek(c.ID); got.PaymentStatus != domain.AdPaymentFailed || got.Status != domain.AdStatusApproved {
		t.Fatalf("after mismatch = %s / %s", got.Status, got.PaymentStatus)
	}
}

// Starting today (or late) makes the campaign active at once from today.
func TestConfirmStartsTodayAndClampsALateStart(t *testing.T) {
	f := newAdFix(t, func(s *domain.AdSettings) { s.MinLeadDays = 0 })
	c := f.submit(func(in *AdSubmitInput) { in.StartDate = "2026-10-02" })
	f.approve(c.ID, curatorA)
	f.at("2026-10-03") // paid a day late
	paid := f.payFor(c.ID)
	if paid.Status != domain.AdStatusActive || paid.StartDate != "2026-10-03" || paid.EndDate != "2026-10-18" || paid.BookedImpressions != 3000 {
		t.Fatalf("late start = %+v", paid)
	}
	if subj := f.mail.subjects(); subj[len(subj)-1] != "Your Oguaa ad is live" {
		t.Fatalf("emails = %v", subj)
	}
}

// Concurrent confirms settle once.
func TestConcurrentConfirmsSettleOnce(t *testing.T) {
	f := newAdFix(t)
	c := f.submit()
	f.approve(c.ID, curatorA)
	co, _ := f.svc.Checkout(context.Background(), adMember, c.ID, "")
	f.pay.paid[co.Reference] = c.Price.TotalPesewas
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := f.svc.ConfirmPayment(context.Background(), co.Reference); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	got := f.ads.Peek(c.ID)
	paidChanges := 0
	for _, h := range got.StatusHistory {
		if h.From == domain.AdStatusApproved && h.To == domain.AdStatusScheduled {
			paidChanges++
		}
	}
	if f.ads.MarkPaidWins != 1 || paidChanges != 1 {
		t.Fatalf("MarkPaid won %d times, %d history rows", f.ads.MarkPaidWins, paidChanges)
	}
}

// A payment that lands after the campaign closed is refunded in full.
func TestPaymentAfterCloseIsRefundedInFull(t *testing.T) {
	for _, closeIt := range []string{"cancel", "expire"} {
		f := newAdFix(t)
		ctx := context.Background()
		c := f.submit()
		f.approve(c.ID, curatorA)
		co, _ := f.svc.Checkout(ctx, adMember, c.ID, "")
		if closeIt == "cancel" {
			if _, err := f.svc.Cancel(ctx, adMember, c.ID, ""); err != nil {
				t.Fatal(err)
			}
		} else {
			f.clock = adNow.Add(73 * time.Hour)
			f.svc.RunScheduler(ctx)
			if got := f.ads.Peek(c.ID).Status; got != domain.AdStatusExpired {
				t.Fatalf("expire: status %q", got)
			}
		}
		f.pay.paid[co.Reference] = c.Price.TotalPesewas
		paid, err := f.svc.ConfirmPayment(ctx, co.Reference)
		if err != nil || paid.PaymentStatus != domain.AdPaymentSuccess || paid.RefundOwed != domain.AdRefundPaidAfterClose {
			t.Fatalf("%s: late payment = %+v %v", closeIt, paid, err)
		}
		f.svc.RunScheduler(ctx)
		got := f.ads.Peek(c.ID)
		if len(got.Refunds) != 1 || got.Refunds[0].AmountPesewas != c.Price.TotalPesewas || len(f.pay.refunds) != 1 {
			t.Fatalf("%s: refunds = %+v / %v", closeIt, got.Refunds, f.pay.refunds)
		}
	}
}

// Spec §4.3 checkout: payments switched off answers 503 before anything else.
func TestCheckoutWithPaymentsDisabled(t *testing.T) {
	f := newAdFix(t)
	f.svc.paystack = DisabledPaystack{}
	if _, err := f.svc.Checkout(context.Background(), adMember, "ad-missing", ""); !errors.Is(err, ErrPaymentsUnavailable) {
		t.Fatalf("checkout = %v", err)
	}
	if _, err := f.svc.ConfirmPayment(context.Background(), "oguaa-adv-x"); err == nil {
		t.Fatal("confirm of an unknown reference must fail")
	}
}

func TestCheckoutRefusals(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	c := f.submit()
	f.approve(c.ID, curatorA)
	f.clock = adNow.Add(73 * time.Hour)
	if _, err := f.svc.Checkout(ctx, adMember, c.ID, ""); adCode(err) != AdErrApprovalExpired {
		t.Fatalf("expired approval: %v", err)
	}
	g := newAdFix(t)
	d := g.submit()
	g.approve(d.ID, curatorA)
	g.ads.Put(domain.AdCampaign{ID: "ad-rival", Placement: domain.AdPlacementPortalFeedCard, Status: domain.AdStatusActive, StartDate: "2026-10-01", EndDate: "2026-10-31", BookedImpressions: 15_500})
	if _, err := g.svc.Checkout(ctx, adMember, d.ID, ""); adCode(err) != AdErrInventoryUnavailable {
		t.Fatalf("sold out at checkout: %v", err)
	}
}

// ── advertiser cancel ───────────────────────────────────────────────────────

func TestCancel(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	pending := f.submit()
	if c, err := f.svc.Cancel(ctx, adMember, pending.ID, ""); err != nil || c.Status != domain.AdStatusCancelled || c.RefundOwed != "" {
		t.Fatalf("cancel in review = %+v %v", c, err)
	}
	if _, err := f.svc.Cancel(ctx, adMember, pending.ID, ""); adCode(err) != AdErrNotCancellable {
		t.Fatalf("cancel twice: %v", err)
	}
	scheduled := f.booked()
	c, err := f.svc.Cancel(ctx, adMember, scheduled, "Plans changed")
	if err != nil || c.RefundOwed != domain.AdRefundCancelledBeforeStart {
		t.Fatalf("cancel before start = %+v %v", c, err)
	}
	f.svc.RunScheduler(ctx)
	if got := f.ads.Peek(scheduled); len(got.Refunds) != 1 || got.Refunds[0].AmountPesewas != got.Price.TotalPesewas {
		t.Fatalf("full refund = %+v", got.Refunds)
	}
}

// ── the scheduler and refunds ───────────────────────────────────────────────

func TestSchedulerCompletesAndRefundsUnderDelivery(t *testing.T) {
	f := newAdFix(t, func(s *domain.AdSettings) { s.TaxRateBps = 2000 })
	ctx := context.Background()
	id := f.booked() // 3,000 impressions, total GH₵180
	f.at("2026-10-05")
	f.svc.RunScheduler(ctx)
	c := f.ads.Peek(id)
	if c.Status != domain.AdStatusActive {
		t.Fatalf("start = %q", c.Status)
	}
	c.Delivered = 2001
	f.ads.Put(c)
	f.at("2026-10-19")
	counts := f.svc.RunScheduler(ctx)
	got := f.ads.Peek(id)
	// floor(18,000 × 999 / 3,000) = 5,994
	if got.Status != domain.AdStatusCompleted || len(got.Refunds) != 1 || got.Refunds[0].AmountPesewas != 5994 ||
		got.Refunds[0].Reason != domain.AdRefundUnderDelivery || got.Refunds[0].Status != domain.AdRefundPending || counts.Completed != 1 {
		t.Fatalf("completion = %s %+v %+v", got.Status, got.Refunds, counts)
	}
	if subj := f.mail.subjects(); subj[len(subj)-1] != "Your Oguaa ad has finished" {
		t.Fatalf("emails = %v", subj)
	}
	// The next pass polls Paystack and records the processed amount once.
	f.svc.RunScheduler(ctx)
	f.svc.RunScheduler(ctx)
	got = f.ads.Peek(id)
	if got.Refunds[0].Status != domain.AdRefundProcessed || got.RefundedPesewas != 5994 {
		t.Fatalf("after polling = %+v refunded %d", got.Refunds, got.RefundedPesewas)
	}
}

func TestSchedulerFullDeliveryNeedsNoRefund(t *testing.T) {
	f := newAdFix(t)
	id := f.booked()
	f.at("2026-10-06")
	f.svc.RunScheduler(context.Background())
	c := f.ads.Peek(id)
	c.Delivered = c.BookedImpressions
	f.ads.Put(c)
	f.svc.RunScheduler(context.Background())
	got := f.ads.Peek(id)
	if got.Status != domain.AdStatusCompleted || len(got.Refunds) != 0 || got.RefundOwed != "" {
		t.Fatalf("fully delivered = %+v", got)
	}
}

// D8: a political campaign meeting a blackout completes and is refunded for
// the undelivered share; the political library keeps it for 7 years.
func TestSchedulerPoliticalBlackout(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	f.addSponsor("asp-pol", domain.AdSponsorPolitical, domain.AdSponsorVerified)
	id := f.booked(func(in *AdSubmitInput) {
		in.SponsorID, in.Political, in.PoliticalType, in.Category = "asp-pol", true, domain.AdPoliticalIssue, ""
	})
	// A snap by-election is called with a blackout over the running flight.
	e := f.addElection("elc-snap", domain.ElectionParliamentaryBy, "2026-10-08")
	if e.BlackoutStart != "2026-10-07T00:00:00Z" {
		t.Fatalf("blackout = %s", e.BlackoutStart)
	}
	f.at("2026-10-06")
	f.svc.RunScheduler(ctx)
	if got := f.ads.Peek(id).Status; got != domain.AdStatusActive {
		t.Fatalf("before the blackout = %q", got)
	}
	f.clock = time.Date(2026, 10, 7, 1, 0, 0, 0, time.UTC)
	f.svc.RunScheduler(ctx)
	got := f.ads.Peek(id)
	if got.Status != domain.AdStatusCompleted || len(got.Refunds) != 1 || got.Refunds[0].Reason != domain.AdRefundElectionBlackout || got.RetainUntil != "2033-10-07T01:00:00Z" {
		t.Fatalf("blackout completion = %s %+v retain %q", got.Status, got.Refunds, got.RetainUntil)
	}
}

func TestSchedulerExpiresUnpaidApprovals(t *testing.T) {
	f := newAdFix(t)
	c := f.submit()
	f.approve(c.ID, curatorA)
	f.clock = adNow.Add(71 * time.Hour)
	f.svc.RunScheduler(context.Background())
	if got := f.ads.Peek(c.ID).Status; got != domain.AdStatusApproved {
		t.Fatalf("before expiry = %q", got)
	}
	f.clock = adNow.Add(73 * time.Hour)
	counts := f.svc.RunScheduler(context.Background())
	if got := f.ads.Peek(c.ID).Status; got != domain.AdStatusExpired || counts.Expired != 1 {
		t.Fatalf("after expiry = %q %+v", got, counts)
	}
}

// A "requesting" row older than 10 minutes means we crashed mid-refund: it
// goes to manual_check and Paystack is never called for it again.
func TestRefundCrashGuard(t *testing.T) {
	f := newAdFix(t)
	id := f.booked()
	c := f.ads.Peek(id)
	c.Refunds = []domain.AdRefund{{ID: id + "-removed", AmountPesewas: 500, Reason: domain.AdRefundRemoved, Status: domain.AdRefundRequesting, CreatedAt: adNow.Format(time.RFC3339)}}
	f.ads.Put(c)
	f.clock = adNow.Add(5 * time.Minute)
	f.svc.RunScheduler(context.Background())
	if got := f.ads.Peek(id).Refunds[0].Status; got != domain.AdRefundRequesting {
		t.Fatalf("fresh requesting row = %q", got)
	}
	f.clock = adNow.Add(11 * time.Minute)
	counts := f.svc.RunScheduler(context.Background())
	if got := f.ads.Peek(id).Refunds[0].Status; got != domain.AdRefundManualCheck || counts.Stuck != 1 || len(f.pay.refunds) != 0 {
		t.Fatalf("stale requesting row = %q, %d refund calls", got, len(f.pay.refunds))
	}
}

func TestRefundErrorsGoToManualCheck(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	id := f.booked()
	f.pay.refundErr = errors.New("connection reset")
	if _, err := f.svc.Cancel(ctx, adMember, id, ""); err != nil {
		t.Fatal(err)
	}
	f.svc.RunScheduler(ctx)
	got := f.ads.Peek(id)
	if len(got.Refunds) != 1 || got.Refunds[0].Status != domain.AdRefundManualCheck || got.RefundOwed != "" {
		t.Fatalf("refund after an error = %+v", got.Refunds)
	}
	admin, _ := f.svc.AdminCampaign(ctx, id)
	if !strings.Contains(strings.Join(admin.Flags, ","), "refund_needs_attention") {
		t.Fatalf("flags = %v", admin.Flags)
	}
}

// Simulated payments never move refund money; payments switched off leave
// owed refunds for later.
func TestRefundsSkippedWhenSimulatedOrDisabled(t *testing.T) {
	f := newAdFix(t)
	f.pay.simulated = true
	id := f.booked()
	if _, err := f.svc.Cancel(context.Background(), adMember, id, ""); err != nil {
		t.Fatal(err)
	}
	f.svc.RunScheduler(context.Background())
	if got := f.ads.Peek(id); len(got.Refunds) != 0 || got.RefundOwed != "" || len(f.pay.refunds) != 0 {
		t.Fatalf("simulated = %+v", got)
	}

	g := newAdFix(t)
	gid := g.booked()
	if _, err := g.svc.Cancel(context.Background(), adMember, gid, ""); err != nil {
		t.Fatal(err)
	}
	g.svc.paystack = DisabledPaystack{}
	g.svc.RunScheduler(context.Background())
	if got := g.ads.Peek(gid); got.RefundOwed != domain.AdRefundCancelledBeforeStart || len(got.Refunds) != 0 {
		t.Fatalf("payments off = %+v", got)
	}
}

func TestOwedAmountProRata(t *testing.T) {
	c := domain.AdCampaign{Price: domain.AdPriceSnapshot{TotalPesewas: 10_000}, BookedImpressions: 3000, Delivered: 1000}
	for reason, want := range map[string]int64{
		domain.AdRefundUnderDelivery: 6666, domain.AdRefundStoppedByAdvertiser: 6666, domain.AdRefundRemoved: 6666,
		domain.AdRefundCancelledBeforeStart: 10_000, domain.AdRefundPaidAfterClose: 10_000,
	} {
		c.RefundOwed = reason
		if got := owedAmount(c); got != want {
			t.Errorf("%s: %d, want %d", reason, got, want)
		}
	}
	c.RefundOwed = domain.AdRefundUnderDelivery
	c.Refunds = []domain.AdRefund{{AmountPesewas: 9000, Status: domain.AdRefundProcessed}, {AmountPesewas: 500, Status: domain.AdRefundFailed}}
	if got := owedAmount(c); got != 1000 {
		t.Fatalf("capped by earlier refunds = %d", got)
	}
}

func TestManualRefund(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	id := f.booked()
	if _, err := f.svc.ManualRefund(ctx, id, AdRefundInput{AmountPesewas: 99_999, Reason: "Goodwill refund"}, stewardStaff); adCode(err) != AdErrInvalidAmount {
		t.Fatalf("too much: %v", err)
	}
	f.pay.refundStatus = RefundProcessed
	got, err := f.svc.ManualRefund(ctx, id, AdRefundInput{AmountPesewas: 2000, Reason: "Goodwill refund"}, stewardStaff)
	if err != nil || len(got.Refunds) != 1 || got.Refunds[0].Status != domain.AdRefundProcessed || got.RefundedPesewas != 2000 {
		t.Fatalf("manual refund = %+v %v", got, err)
	}
	f.svc.paystack = DisabledPaystack{}
	if _, err := f.svc.ManualRefund(ctx, id, AdRefundInput{AmountPesewas: 100, Reason: "Goodwill refund"}, stewardStaff); !errors.Is(err, ErrPaymentsUnavailable) {
		t.Fatalf("payments off: %v", err)
	}
}

func TestKillSwitchPausesPoliticalAds(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	f.addSponsor("asp-pol", domain.AdSponsorPolitical, domain.AdSponsorVerified)
	pol := f.booked(func(in *AdSubmitInput) {
		in.SponsorID, in.Political, in.PoliticalType, in.Category = "asp-pol", true, domain.AdPoliticalIssue, ""
	})
	com := f.booked()
	if _, err := f.svc.Kill(ctx, AdKillInput{Scope: "everything", Reason: "Court order"}, curatorA); adCode(err) != AdErrInvalidScope {
		t.Fatalf("bad scope: %v", err)
	}
	n, err := f.svc.Kill(ctx, AdKillInput{Scope: AdKillPolitical, Reason: "Court order received"}, curatorA)
	if err != nil || n != 1 || f.ads.Peek(pol).Status != domain.AdStatusPaused || f.ads.Peek(com).Status != domain.AdStatusScheduled {
		t.Fatalf("kill = %d %v", n, err)
	}
}

// ── reports queue and the election calendar ─────────────────────────────────

func TestAdReportHooks(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	id := f.booked()
	r, err := f.svc.AdForReport(ctx, id)
	if err != nil || r.Title != "Market days at Kotokuraba" || r.OwnerID != adMember || r.Political {
		t.Fatalf("report target = %+v %v", r, err)
	}
	if err := f.svc.RemoveReportedAd(ctx, id, "m-steward", ""); err != nil {
		t.Fatal(err)
	}
	if got := f.ads.Peek(id); got.Status != domain.AdStatusRemoved || got.RemovalReason != "Removed after a report" {
		t.Fatalf("removed = %+v", got)
	}
	f.ads.Put(domain.AdCampaign{ID: "ad-e", ElectionID: "elc-1", Status: domain.AdStatusScheduled})
	f.ads.Put(domain.AdCampaign{ID: "ad-f", ElectionID: "elc-1", Status: domain.AdStatusCompleted})
	if n, _ := f.svc.LiveCampaignsForElection(ctx, "elc-1"); n != 1 {
		t.Fatalf("live campaigns = %d", n)
	}
}

// ── settings ────────────────────────────────────────────────────────────────

func TestSaveAdSettings(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	cur := f.svc.Settings(ctx)
	if cur.Version != 1 || cur.EffectiveFrom != "" {
		t.Fatalf("stored = v%d %q", cur.Version, cur.EffectiveFrom)
	}
	next := cur
	next.Placements = append([]domain.AdPlacementPrice(nil), cur.Placements...)
	next.Placements[0].CpmPesewas = 7000
	next.Placements[0].PoliticalCpmPesewas = 6999
	if _, err := f.svc.SaveAdSettings(ctx, AdSettingsInput{AdSettings: next, Reason: "Rate card for 2027"}, AuditActor{Name: "Nana"}); err == nil {
		t.Fatal("political CPM below the commercial one accepted")
	}
	next.Placements[0].PoliticalCpmPesewas = 9500
	next.BlockedCategories = []string{"tobacco_vape"}
	var fe *InvalidFieldError
	if _, err := f.svc.SaveAdSettings(ctx, AdSettingsInput{AdSettings: next, Reason: "Rate card for 2027"}, AuditActor{Name: "Nana"}); !errors.As(err, &fe) || fe.Field != "blockedCategories" {
		t.Fatalf("hard-blocked category in the admin list: %v", err)
	}
	next.BlockedCategories = []string{AdCategoryGambling}
	if _, err := f.svc.SaveAdSettings(ctx, AdSettingsInput{AdSettings: next, Reason: "no"}, AuditActor{Name: "Nana"}); !errors.As(err, &fe) || fe.Field != "reason" {
		t.Fatalf("short reason: %v", err)
	}
	saved, err := f.svc.SaveAdSettings(ctx, AdSettingsInput{AdSettings: next, Reason: "Rate card for 2027"}, AuditActor{Name: "Nana"})
	if err != nil || saved.Version != 2 || saved.EffectiveFrom != adNow.Format(time.RFC3339) || saved.UpdatedByName != "Nana" {
		t.Fatalf("saved = %+v %v", saved, err)
	}
	// A stale version conflicts.
	if _, err := f.svc.SaveAdSettings(ctx, AdSettingsInput{AdSettings: next, Reason: "Rate card for 2027"}, AuditActor{Name: "Nana"}); !errors.Is(err, domain.ErrSettingsConflict) {
		t.Fatalf("stale save: %v", err)
	}
	// A save that moves no price keeps effectiveFrom.
	f.clock = adNow.Add(time.Hour)
	again := saved
	again.SellThroughPercent = 60
	kept, err := f.svc.SaveAdSettings(ctx, AdSettingsInput{AdSettings: again, Reason: "Sell a bit more inventory"}, AuditActor{Name: "Nana"})
	if err != nil || kept.EffectiveFrom != saved.EffectiveFrom {
		t.Fatalf("effectiveFrom moved without a price change: %+v %v", kept, err)
	}
	card := f.svc.RateCard(ctx)
	if card.Placements[0].CpmPesewas != 7000 || card.Version != 3 || len(card.BlockedCategories) != 1+len(hardBlockedCategories) || card.Operator.Registration != "BN843072020" {
		t.Fatalf("rate card = %+v", card)
	}
	for _, c := range card.Categories {
		if c.Slug == AdCategoryGambling || c.Slug == AdCategoryPolitical {
			t.Fatalf("category %q is not selectable", c.Slug)
		}
	}
}

func TestDefaultAdSettingsAreAllOff(t *testing.T) {
	s := LoadAdSettings(context.Background(), nil)
	if s.AdsEnabled || s.PoliticalEnabled || s.AppDeliveryEnabled || s.AllowDistrictAssembly || s.TaxRateBps != 0 {
		t.Fatalf("defaults = %+v", s)
	}
	if err := validateAdSettings(&s); err != nil {
		t.Fatalf("the defaults must validate: %v", err)
	}
	if s.Servable(domain.AdPlacementPortalFeedCard) {
		t.Fatal("nothing is servable while ads are off")
	}
}
