package service

import (
	"context"
	"errors"
	"strconv"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── serving fixes from the security review ──────────────────────────────────

// setSponsorStatus changes a sponsor's status the way staff review does.
func (f *serveFix) setSponsorStatus(id, status string) {
	f.t.Helper()
	ok, err := f.sponsors.SetStatus(context.Background(), id,
		[]string{domain.AdSponsorPending, domain.AdSponsorVerified, domain.AdSponsorRejected, domain.AdSponsorSuspended},
		status, "Review note", "Curator A", f.clock.Format(time.RFC3339))
	if err != nil || !ok {
		f.t.Fatalf("set sponsor %s %s: %v %v", id, status, ok, err)
	}
}

// A sponsor suspended or rejected after approval takes its ads off the
// slate, whatever state the campaign is in: the review found a suspended
// sponsor's campaign paid and activated afterwards, and one resumed by a
// moderator, both still served.
func TestAdSlateSkipsAdsWhoseSponsorIsNotVerified(t *testing.T) {
	f := newServeFix(t)
	f.addSponsor("asp-2", domain.AdSponsorCommercial, domain.AdSponsorVerified)
	f.addSponsor("asp-pending", domain.AdSponsorCommercial, domain.AdSponsorPending)
	f.activeAd("ad-1")
	f.activeAd("ad-2", func(c *domain.AdCampaign) { c.SponsorID = "asp-2" })
	f.activeAd("ad-pending", func(c *domain.AdCampaign) { c.SponsorID = "asp-pending" })
	f.activeAd("ad-orphan", func(c *domain.AdCampaign) { c.SponsorID = "asp-missing" })
	want := func(step string, ids ...string) {
		t.Helper()
		got := slateIDs(f.slate(domain.AdPlacementPortalFeedCard, false))
		if len(got) != len(ids) {
			t.Fatalf("%s: slate = %v, want %v", step, got, ids)
		}
		for i := range ids {
			if got[i] != ids[i] {
				t.Fatalf("%s: slate = %v, want %v", step, got, ids)
			}
		}
	}
	want("verified sponsors only", "ad-1", "ad-2")

	f.setSponsorStatus(adSponsorID, domain.AdSponsorSuspended)
	f.clock = f.clock.Add(adSlateCacheTTL + time.Second) // the slate and sponsor caches expire together
	want("sponsor suspended", "ad-2")

	f.setSponsorStatus("asp-2", domain.AdSponsorRejected)
	f.clock = f.clock.Add(adSlateCacheTTL + time.Second)
	want("sponsor rejected")

	f.setSponsorStatus(adSponsorID, domain.AdSponsorVerified)
	f.clock = f.clock.Add(adSlateCacheTTL + time.Second)
	want("sponsor verified again", "ad-1")
}

// The same through the ads service: suspending the sponsor pauses the
// campaign; if anything later sets it running again, it still isn't served.
func TestAdSlateSkipsARunningCampaignOfASuspendedSponsor(t *testing.T) {
	ctx := context.Background()
	f := newServeFix(t)
	f.at("2026-10-05")
	id := f.booked(func(in *AdSubmitInput) { in.StartDate, in.EndDate = "2026-10-07", "2026-10-20" })
	f.at("2026-10-07")
	f.svc.RunScheduler(ctx)
	if got := slateIDs(f.slate(domain.AdPlacementPortalFeedCard, false)); len(got) != 1 || got[0] != id {
		t.Fatalf("running campaign not served: %v", got)
	}
	if _, err := f.svc.ReviewSponsor(ctx, adSponsorID, SponsorActionSuspend, "Fraudulent sponsor", AuditActor{ID: "m-cur-a", Name: "Curator A"}); err != nil {
		t.Fatal(err)
	}
	c := f.ads.Peek(id)
	c.Status = domain.AdStatusActive // resumed, by whatever route
	f.ads.Put(c)
	f.clock = f.clock.Add(adSlateCacheTTL + time.Second)
	if got := slateIDs(f.slate(domain.AdPlacementPortalFeedCard, false)); len(got) != 0 {
		t.Fatalf("a suspended sponsor's campaign is served: %v", got)
	}
}

func TestAdSlateWithoutTheSponsorStoreServesNothing(t *testing.T) {
	f := newServeFix(t)
	f.activeAd("ad-1")
	f.serving.sponsors = nil
	if got := slateIDs(f.slate(domain.AdPlacementPortalFeedCard, false)); len(got) != 0 {
		t.Fatalf("served unchecked sponsors: %v", got)
	}
}

// Political ads stay off the page when the election calendar can't be read
// (a cold start during a database outage): serving can't rule out a
// blackout. The scheduler's reading is unchanged — no blackout, so nothing
// is ended and refunded because of the outage.
func TestAdSlateLeavesPoliticalAdsOutWhenTheCalendarIsUnreadable(t *testing.T) {
	ctx := context.Background()
	f := newServeFix(t)
	f.elections.setFail(errors.New("mongo down"))
	f.serving = f.newServing(adServeSecret) // nothing cached yet
	f.activeAd("ad-pol", political)
	f.activeAd("ad-com")
	if ids := slateIDs(f.slate(domain.AdPlacementPortalFeedCard, false)); len(ids) != 1 || ids[0] != "ad-com" {
		t.Fatalf("unreadable calendar: slate = %v, want the commercial ad only", ids)
	}
	if in, _ := f.serving.elections.InBlackout(ctx, f.clock); in {
		t.Fatal("the scheduler must still read an unreadable calendar as no blackout")
	}
	f.elections.setFail(nil)
	f.clock = f.clock.Add(adSlateCacheTTL + time.Second)
	if ids := slateIDs(f.slate(domain.AdPlacementPortalFeedCard, false)); len(ids) != 2 {
		t.Fatalf("calendar readable again: slate = %v, want both ads", ids)
	}
}

// The click redirect works while a campaign is booked and live, and for a
// week after a completed campaign's end date (people click old pages);
// anything else is a 404 rather than a redirect that lives for ever.
func TestAdClickRedirectsOnlyWhileTheCampaignIsLive(t *testing.T) {
	f := newServeFix(t) // today is 2 October
	cases := []struct {
		status, end string
		redirects   bool
	}{
		{domain.AdStatusScheduled, "2026-10-20", true},
		{domain.AdStatusActive, "2026-10-10", true},
		{domain.AdStatusPaused, "2026-10-10", true},
		{domain.AdStatusCompleted, "2026-10-10", true},  // delivered early
		{domain.AdStatusCompleted, "2026-09-25", true},  // ended 7 days ago
		{domain.AdStatusCompleted, "2026-09-24", false}, // ended 8 days ago
		{domain.AdStatusCompleted, "not-a-date", false},
		{domain.AdStatusApproved, "2026-10-10", false}, // never paid
		{domain.AdStatusRejected, "2026-10-10", false},
		{domain.AdStatusCancelled, "2026-10-10", false},
		{domain.AdStatusExpired, "2026-10-10", false},
		{domain.AdStatusRemoved, "2026-10-10", false},
	}
	for i, tc := range cases {
		id := "ad-" + strconv.Itoa(i)
		f.activeAd(id, func(c *domain.AdCampaign) { c.Status, c.EndDate = tc.status, tc.end })
		landing, _, err := f.click(id, "", 0, adReader)
		if tc.redirects && (err != nil || landing != adLanding) {
			t.Errorf("%s ending %s: %q %v, want the redirect", tc.status, tc.end, landing, err)
		}
		if !tc.redirects && !errors.Is(err, ErrAdNotFound) {
			t.Errorf("%s ending %s: %q %v, want not found", tc.status, tc.end, landing, err)
		}
	}
}

// The review's case: an approved ad taken down after a report (it was never
// paid, so it becomes rejected, not removed) kept redirecting, even with no
// token at all.
func TestAdClickStopsAfterAReportTakedown(t *testing.T) {
	ctx := context.Background()
	f := newServeFix(t)
	c := f.submit()
	f.approve(c.ID, stewardStaff)
	if _, _, err := f.click(c.ID, "", 0, adReader); !errors.Is(err, ErrAdNotFound) {
		t.Fatalf("approved but unpaid: err = %v, want not found", err)
	}
	if err := f.svc.RemoveReportedAd(ctx, c.ID, "m-mod", "phishing landing page"); err != nil {
		t.Fatal(err)
	}
	if landing, _, err := f.click(c.ID, "", 0, adReader); !errors.Is(err, ErrAdNotFound) {
		t.Fatalf("taken down (%s): %q %v, want not found", f.ads.Peek(c.ID).Status, landing, err)
	}
}
