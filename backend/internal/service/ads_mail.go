package service

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/platform/emailtmpl"
)

// ── transactional email to advertisers (spec §3.7 step 7) ───────────────────
//
// The advertiser hears about each transition that needs them: approved (with
// the Pay link), rejected, live, completed (delivery and refund) and removed.
// These are transactional messages about their own order (Act 772 s.50),
// never marketing. A failed send is logged and never blocks the change.

const adMailTimeout = 10 * time.Second

// adMail is one message.
type adMail struct {
	subject, heading string
	lines            []string
	button           string // label of the button to the campaign's page
	warning          bool
}

// notifyTransition emails the advertiser about c's current status.
func (s *AdsService) notifyTransition(ctx context.Context, c *domain.AdCampaign) {
	if s.email == nil || c == nil {
		return
	}
	subject, body, ok := AdEmail(c, s.portal)
	if !ok {
		return
	}
	to := s.advertiserEmail(ctx, c)
	if to == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), adMailTimeout)
	defer cancel()
	if err := s.email.Send(ctx, to, subject, body); err != nil {
		s.log.Warn("ads: advertiser email failed", logKeyCampaign, c.ID, "status", c.Status, logKeyErr, err)
	}
}

// AdEmail renders the advertiser email for c's current status in the branded
// layout (ok=false: that status sends none). cmd/emailpreview uses it too.
func AdEmail(c *domain.AdCampaign, portalURL string) (subject, packedHTML string, ok bool) {
	m, ok := adMailFor(c)
	if !ok {
		return "", "", false
	}
	u := emailtmpl.AdUpdate{Subject: m.subject, Heading: m.heading, Paragraphs: m.lines, Warning: m.warning}
	if m.button != "" {
		u.Button = &emailtmpl.Link{Label: m.button, URL: strings.TrimRight(portalURL, "/") + "/advertise/" + c.ID}
	}
	return m.subject, brandedEmail(emailtmpl.AdUpdateMessage(u), strings.Join(m.lines, "\n")), true
}

// advertiserEmail is the campaign's receipt email, else the sponsor's.
func (s *AdsService) advertiserEmail(ctx context.Context, c *domain.AdCampaign) string {
	if e := strings.TrimSpace(c.Email); e != "" {
		return e
	}
	if sp, err := s.sponsors.Get(ctx, c.SponsorID); err == nil && sp != nil {
		return strings.TrimSpace(sp.Email)
	}
	return ""
}

// adMailFor writes the message for a status (ok=false: no email).
func adMailFor(c *domain.AdCampaign) (adMail, bool) {
	name := adMailName(c)
	switch c.Status {
	case domain.AdStatusApproved:
		return adMail{subject: "Your Oguaa ad is approved", heading: "Your ad is approved", button: "Pay for your ad", lines: []string{
			fmt.Sprintf("Your ad %s has been approved.", name),
			fmt.Sprintf("Pay %s by %s to book it from %s to %s.", adCedis(c.Price.TotalPesewas), adMailTime(c.ApprovalExpiresAt), adMailDate(c.StartDate), adMailDate(c.EndDate)),
			"If you don't pay by then, the approval lapses and nothing is charged.",
		}}, true
	case domain.AdStatusRejected:
		return adMail{subject: "Your Oguaa ad was not approved", heading: "We couldn't approve your ad", button: "See your ad", lines: []string{
			fmt.Sprintf("We couldn't approve your ad %s.", name),
			"Reason: " + c.RejectReason,
			"No payment was taken. You can change the ad and submit it again.",
		}}, true
	case domain.AdStatusActive:
		return adMail{subject: "Your Oguaa ad is live", heading: "Your ad is live", button: "Follow its delivery", lines: []string{
			fmt.Sprintf("Your ad %s is now running until %s.", name, adMailDate(c.EndDate)),
		}}, true
	case domain.AdStatusCompleted:
		return adMail{subject: "Your Oguaa ad has finished", heading: "Your ad has finished", button: "See how it did", lines: completedLines(c, name)}, true
	case domain.AdStatusRemoved:
		return adMail{subject: "Your Oguaa ad was removed", heading: "We removed your ad", button: "See your ad", warning: true, lines: []string{
			fmt.Sprintf("We removed your ad %s.", name),
			"Reason: " + c.RemovalReason,
			refundLine(*c),
		}}, true
	}
	return adMail{}, false
}

func completedLines(c *domain.AdCampaign, name string) []string {
	return []string{
		fmt.Sprintf("Your ad %s has finished.", name),
		fmt.Sprintf("It was seen %s times of the %s impressions you booked, and clicked %s times.",
			adCount(c.Delivered), adCount(c.BookedImpressions), adCount(c.Clicks)),
		refundLine(*c),
	}
}

// refundLine says what will be refunded (computed the same way the
// scheduler computes the refund).
func refundLine(c domain.AdCampaign) string {
	if c.RefundOwed == "" || c.Simulated {
		return "No refund is due."
	}
	due := owedAmount(c)
	if due < minAdRefundPesewas {
		return "No refund is due."
	}
	return fmt.Sprintf("We are refunding %s to your original payment method.", adCedis(due))
}

func adMailName(c *domain.AdCampaign) string {
	if h := strings.TrimSpace(c.Creative.Headline); h != "" {
		return "“" + h + "”"
	}
	return "for " + c.SponsorLine
}

func adMailTime(rfc string) string {
	t, err := time.Parse(time.RFC3339, rfc)
	if err != nil {
		return rfc
	}
	return t.In(calendarZone).Format("2 Jan 2006, 15:04") + " GMT"
}

// adMailDate shows a YYYY-MM-DD date as "5 Oct 2026".
func adMailDate(day string) string {
	t, err := time.Parse(time.DateOnly, day)
	if err != nil {
		return day
	}
	return t.Format("2 Jan 2006")
}

// adCount writes a count with thousands separators (12,500).
func adCount(n int64) string {
	s := strconv.FormatInt(n, 10)
	for i := len(s) - 3; i > 0 && s[i-1] != '-'; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return s
}
