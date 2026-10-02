package service

import (
	"context"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/platform/emailtmpl"
)

// Nobody approves their own ad or reviews a sponsor they created.
func TestStaffCantReviewTheirOwnAdsOrSponsors(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	c := f.submit()
	self := AdStaff{ID: adMember, Name: "Kofi Owner", Role: domain.RoleCurator}
	if _, err := f.svc.Approve(ctx, c.ID, AdApproveInput{Checklist: allTicked}, self); adCode(err) != AdErrForbidden {
		t.Fatalf("self-approval: %v", err)
	}
	if _, err := f.svc.ReviewSponsor(ctx, adSponsorID, SponsorActionSuspend, "Checking my own sponsor", AuditActor{ID: adMember, Name: "Kofi Owner"}); adCode(err) != AdErrForbidden {
		t.Fatalf("self-review: %v", err)
	}
}

// Ads stopped by the emergency stop or a sponsor suspension come back only
// through a curator, and only while the sponsor is verified.
func TestResumingNeedsACuratorAndAVerifiedSponsor(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	id := f.booked()
	if n, err := f.svc.Kill(ctx, AdKillInput{Scope: AdKillSponsor, SponsorID: adSponsorID, Reason: "Emergency stop"}, curatorA); err != nil || n != 1 {
		t.Fatalf("kill = %d %v", n, err)
	}
	if got := f.ads.Peek(id); got.Status != domain.AdStatusPaused || got.PausedBy != domain.AdPausedByKill {
		t.Fatalf("killed = %s %q", got.Status, got.PausedBy)
	}
	if _, err := f.svc.Resume(ctx, id, "Looks fine to me", moderator); adCode(err) != AdErrForbidden {
		t.Fatalf("moderator resume after a kill: %v", err)
	}
	if _, err := f.svc.Resume(ctx, id, "Checked and cleared", curatorA); err != nil {
		t.Fatal(err)
	}
	if got := f.ads.Peek(id); got.Status != domain.AdStatusScheduled || got.PausedBy != "" {
		t.Fatalf("resumed = %s %q", got.Status, got.PausedBy)
	}
	if _, err := f.svc.ReviewSponsor(ctx, adSponsorID, SponsorActionSuspend, "Fraud report confirmed", AuditActor{ID: curatorA.ID, Name: curatorA.Name}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.Resume(ctx, id, "Checked and cleared", curatorA); adCode(err) != AdErrSponsorNotVerified {
		t.Fatalf("resume while the sponsor is suspended: %v", err)
	}
}

// A scheduled ad whose sponsor lost its verification waits paused instead of
// going live on its start date.
func TestSchedulerHoldsAdsOfUnverifiedSponsors(t *testing.T) {
	f := newAdFix(t)
	id := f.booked() // scheduled from 5 October
	sp := f.sponsors.Rows[adSponsorID]
	sp.Status = domain.AdSponsorRejected
	f.sponsors.Rows[adSponsorID] = sp
	f.at("2026-10-05")
	f.svc.RunScheduler(context.Background())
	if got := f.ads.Peek(id); got.Status != domain.AdStatusPaused || got.PausedBy != domain.AdPausedBySponsor {
		t.Fatalf("on the start date = %s %q", got.Status, got.PausedBy)
	}
}

func TestLandingURLMustEndInARealDomain(t *testing.T) {
	for _, bad := range []string{"https://127.1/", "https://0x7f.0.0.1/", "https://10.0.0.1/x", "https://example.1", "https://shop.example.c"} {
		if checkLandingURL(bad) == nil {
			t.Errorf("%s was accepted", bad)
		}
	}
	for _, good := range []string{"https://kotokuraba.test/market", "https://www.ghana.gov.gh/", "https://example.xn--p1ai/"} {
		if err := checkLandingURL(good); err != nil {
			t.Errorf("%s: %v", good, err)
		}
	}
}

func TestComplianceFieldsAreCapped(t *testing.T) {
	c := domain.AdCompliance{Regulator: strings.Repeat("x", maxComplianceRunes+1)}
	if err := checkCompliance(AdCategoryRetail, c, "2026-10-18", "2026-10-02"); adCode(err) != AdErrComplianceRequired {
		t.Fatalf("err = %v", err)
	}
}

// The owner never sees upload ids, so editing a sponsor without uploading
// again keeps the documents on file.
func TestEditingASponsorKeepsItsDocuments(t *testing.T) {
	f := newAdFix(t)
	ctx := context.Background()
	sp, err := f.svc.CreateSponsor(ctx, adMember, sponsorInput(domain.AdSponsorPolitical))
	if err != nil {
		t.Fatal(err)
	}
	if !sp.HasIDDocument {
		t.Fatal("the owner view says a Ghana Card is on file")
	}
	in := sponsorInput(domain.AdSponsorPolitical)
	in.IDDocumentUploadID = "" // what the portal sends back
	in.Constituency = "Cape Coast South"
	upd, err := f.svc.UpdateSponsor(ctx, adMember, sp.ID, in)
	if err != nil {
		t.Fatal(err)
	}
	if !upd.HasIDDocument || f.sponsors.Rows[sp.ID].IDDocumentUploadID != "pu-id" {
		t.Fatalf("after the edit = %+v", f.sponsors.Rows[sp.ID])
	}
}

// Advertiser emails use the branded layout: a button to the campaign page,
// escaped member text, and no unsubscribe link (they're about an order).
func TestAdEmailsAreBranded(t *testing.T) {
	c := &domain.AdCampaign{
		ID: "ad-1", Status: domain.AdStatusApproved, StartDate: "2026-10-05", EndDate: "2026-10-18",
		ApprovalExpiresAt: "2026-10-05T09:00:00Z", Price: domain.AdPriceSnapshot{TotalPesewas: 15_000},
		Creative: domain.AdCreative{Headline: `Market <b>days</b> & more`},
	}
	subject, body, ok := AdEmail(c, "https://citizen.oguaaman.com/")
	if !ok || subject != "Your Oguaa ad is approved" || !emailtmpl.IsBranded(body) {
		t.Fatalf("approved = %v %q branded=%v", ok, subject, emailtmpl.IsBranded(body))
	}
	e := emailtmpl.Prepare(body, subject)
	for _, want := range []string{`href="https://citizen.oguaaman.com/advertise/ad-1"`, "Pay for your ad", "GH₵150", "5 Oct 2026", "Market &lt;b&gt;days&lt;/b&gt; &amp; more"} {
		if !strings.Contains(e.HTML, want) {
			t.Errorf("approved email lacks %s", want)
		}
	}
	if strings.Contains(strings.ToLower(e.HTML), "unsubscribe") || !strings.Contains(e.Text, "Pay for your ad") {
		t.Errorf("transactional footer / text part wrong:\n%s", e.Text)
	}
	c.Status = domain.AdStatusPendingReview
	if _, _, ok := AdEmail(c, "https://citizen.oguaaman.com"); ok {
		t.Error("no email while an ad waits for review")
	}
}
