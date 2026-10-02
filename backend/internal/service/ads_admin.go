package service

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── staff review and control of campaigns (spec §3.5, §4.6) ────────────────
//
// Reviewers (curators, moderators) approve commercial ads; political ads need
// two different curators, or one steward. Approval re-runs every check
// (sponsor verified, inventory, licences, text) and copies the creative into
// Oguaa's own ads folder. Staff can pause, resume and remove running ads; a
// steward can refund by hand; the kill switch pauses whole groups at once.

// adApprovalChecklist is every box a reviewer must tick to approve.
var adApprovalChecklist = []string{
	"sponsorIdentified", "notDisguisedAsNews", "noFalseOrUnsubstantiatedClaims", "noHateOrSectionalAppeal",
	"noVoterSuppressionOrResultClaims", "categoryLicenceChecked", "landingPageMatches", "ghsPricingOnly",
	"aiMediaDisclosed", "noPartySymbolsIfDistrictAssembly",
}

// politicalApprovalsNeeded is how many different curators approve a
// political ad (a steward alone suffices).
const politicalApprovalsNeeded = 2

// AdStaff is the staff member acting.
type AdStaff struct {
	ID   string
	Name string
	Role string
}

// AdCampaignAdmin is the admin shape of a campaign (spec §4.5).
type AdCampaignAdmin struct {
	domain.AdCampaign
	MemberID            string                 `json:"memberId,omitempty"`
	Flags               []string               `json:"flags"`
	Sponsor             *AdSponsorAdmin        `json:"sponsor,omitempty"`
	ReportsCount        int                    `json:"reportsCount"`
	ApprovalDocumentURL string                 `json:"approvalDocumentUrl,omitempty"`
	ApprovalsNeeded     int                    `json:"approvalsNeeded"`
	Daily               []domain.AdCampaignDay `json:"daily,omitempty"`
}

// AdAdminPage is the GET /api/admin/ads payload.
type AdAdminPage struct {
	Items   []AdCampaignAdmin `json:"items"`
	Total   int               `json:"total"`
	Page    int               `json:"page"`
	PerPage int               `json:"perPage"`
	Counts  map[string]int    `json:"counts"`
}

// AdminCampaigns is the review queue.
func (s *AdsService) AdminCampaigns(ctx context.Context, f domain.AdFilter) (*AdAdminPage, error) {
	f.Page = max(f.Page, 1)
	f.PerPage = adAdminPerPage
	rows, total, err := s.campaigns.List(ctx, f)
	if err != nil {
		return nil, err
	}
	counts, err := s.campaigns.StatusCounts(ctx, f.Political, f.Placement)
	if err != nil {
		return nil, err
	}
	out := &AdAdminPage{Items: make([]AdCampaignAdmin, 0, len(rows)), Total: total, Page: f.Page, PerPage: f.PerPage, Counts: counts}
	sponsors := map[string]*domain.AdSponsor{}
	for _, c := range rows {
		out.Items = append(out.Items, s.adminView(ctx, c, sponsors))
	}
	return out, nil
}

// AdminCampaign is one campaign with its daily delivery.
func (s *AdsService) AdminCampaign(ctx context.Context, id string) (*AdCampaignAdmin, error) {
	c, err := s.getCampaign(ctx, id)
	if err != nil {
		return nil, err
	}
	v := s.adminView(ctx, *c, map[string]*domain.AdSponsor{})
	v.Daily = s.daily(ctx, c.ID)
	return &v, nil
}

// adminView decorates a campaign for staff. sponsors caches lookups.
func (s *AdsService) adminView(ctx context.Context, c domain.AdCampaign, sponsors map[string]*domain.AdSponsor) AdCampaignAdmin {
	v := AdCampaignAdmin{AdCampaign: c, MemberID: c.MemberID, ApprovalsNeeded: 1}
	if v.StatusHistory == nil {
		v.StatusHistory = []domain.AdStatusChange{}
	}
	if c.Political {
		v.ApprovalsNeeded = politicalApprovalsNeeded
	}
	if c.Compliance.ApprovalUploadID != "" {
		v.ApprovalDocumentURL = adminAdsPath + c.ID + adDocumentsSegment + AdDocApproval
	}
	sp, ok := sponsors[c.SponsorID]
	if !ok {
		sp, _ = s.sponsors.Get(ctx, c.SponsorID)
		sponsors[c.SponsorID] = sp
	}
	if sp != nil {
		view := sponsorAdminView(*sp)
		v.Sponsor = &view
	}
	v.Flags = s.campaignFlags(c, sp)
	if s.reports != nil {
		if open, err := s.reports.OpenByTarget(ctx, domain.ReportTargetAd, c.ID); err == nil {
			v.ReportsCount = len(open)
		}
	}
	return v
}

// campaignFlags are the things a reviewer should look at: text the screen
// held, an unverified sponsor, synthetic media, and refunds needing a person.
func (s *AdsService) campaignFlags(c domain.AdCampaign, sp *domain.AdSponsor) []string {
	flags, _ := screenAdText(c.Category, []string{c.Creative.Headline, c.Creative.Body, c.Creative.Alt})
	if flags == nil {
		flags = []string{}
	}
	if sp == nil || sp.Status != domain.AdSponsorVerified {
		flags = append(flags, "sponsor_not_verified")
	}
	if c.Creative.ContainsSyntheticMedia {
		flags = append(flags, "synthetic_media")
	}
	if c.Compliance.FDAApprovalExpiresOn != "" && c.Compliance.FDAApprovalExpiresOn < s.today() {
		flags = append(flags, "fda_approval_expired")
	}
	for _, r := range c.Refunds {
		if r.Status == domain.AdRefundFailed || r.Status == domain.AdRefundManualCheck {
			flags = append(flags, "refund_needs_attention")
			break
		}
	}
	return flags
}

// ── approve ─────────────────────────────────────────────────────────────────

// AdApproveInput is the POST /api/admin/ads/{id}/approve body.
type AdApproveInput struct {
	Note      string          `json:"note"`
	Checklist map[string]bool `json:"checklist"`
}

// Approve records a reviewer's sign-off. A commercial ad is approved at once;
// a political one needs two different curators or one steward (until then it
// stays pending_review with one approval).
func (s *AdsService) Approve(ctx context.Context, id string, in AdApproveInput, staff AdStaff) (*AdCampaignAdmin, error) {
	c, err := s.getCampaign(ctx, id)
	if err != nil {
		return nil, err
	}
	if c.Status != domain.AdStatusPendingReview {
		return nil, errAdTransition()
	}
	if err := checkApprover(c, in, staff); err != nil {
		return nil, err
	}
	if err := s.recheckForApproval(ctx, c); err != nil {
		return nil, err
	}
	signed := slices.ContainsFunc(c.Approvals, func(a domain.AdApproval) bool { return a.StaffID == staff.ID })
	approval := domain.AdApproval{StaffID: staff.ID, StaffName: staff.Name, At: s.nowRFC(), Checklist: in.Checklist}
	if !signed {
		c.Approvals = append(c.Approvals, approval)
	}
	complete := approvalComplete(c, staff)
	if signed && !complete {
		return nil, errAlreadyApproved()
	}
	if !complete {
		return s.recordApproval(ctx, c, approval)
	}
	// Copy first: a failed copy must leave nothing recorded, so the reviewer
	// can simply try again.
	creative, err := s.copyCreative(ctx, c)
	if err != nil {
		return nil, err
	}
	if !signed {
		if _, err := s.recordApproval(ctx, c, approval); err != nil {
			return nil, err
		}
	}
	if err := s.finishApproval(ctx, c, creative, staff, strings.TrimSpace(in.Note)); err != nil {
		return nil, err
	}
	return s.AdminCampaign(ctx, c.ID)
}

// recordApproval stores one sign-off and returns the campaign.
func (s *AdsService) recordApproval(ctx context.Context, c *domain.AdCampaign, a domain.AdApproval) (*AdCampaignAdmin, error) {
	err := s.campaigns.AddApproval(ctx, c.ID, a)
	switch {
	case errors.Is(err, domain.ErrAdApprovalExists):
		return nil, errAlreadyApproved()
	case errors.Is(err, domain.ErrAdStateChanged):
		return nil, errAdTransition()
	case err != nil:
		return nil, err
	}
	return s.AdminCampaign(ctx, c.ID)
}

func errAlreadyApproved() *AdError {
	return adErr(AdErrAlreadyApprovedByYou, "You have already approved this ad. A second curator must approve it too.")
}

// checkApprover enforces the checklist and who may approve: never the
// member who booked the ad.
func checkApprover(c *domain.AdCampaign, in AdApproveInput, staff AdStaff) error {
	if c.MemberID != "" && c.MemberID == staff.ID {
		return adErr(AdErrForbidden, "You can't approve your own ad. Ask another reviewer.")
	}
	for _, key := range adApprovalChecklist {
		if !in.Checklist[key] {
			return adFieldErr(AdErrChecklistIncomplete, key, "Tick every item on the review checklist.")
		}
	}
	if c.Political && staff.Role != domain.RoleSteward && staff.Role != domain.RoleCurator {
		return adErr(AdErrForbidden, "Political ads are approved by curators (two of them) or a steward.")
	}
	return nil
}

// approvalComplete: commercial ads need one approval; political ads two
// different staff, or a steward.
func approvalComplete(c *domain.AdCampaign, staff AdStaff) bool {
	if !c.Political || staff.Role == domain.RoleSteward {
		return true
	}
	ids := map[string]bool{}
	for _, a := range c.Approvals {
		ids[a.StaffID] = true
	}
	return len(ids) >= politicalApprovalsNeeded
}

// recheckForApproval re-runs the checks that can change while an ad waits:
// the sponsor's verification, licences, the text screen and inventory.
func (s *AdsService) recheckForApproval(ctx context.Context, c *domain.AdCampaign) error {
	sp, err := s.sponsors.Get(ctx, c.SponsorID)
	if err != nil || sp == nil || sp.Status != domain.AdSponsorVerified {
		return adErr(AdErrSponsorNotVerified, "Verify the sponsor before approving its ads.")
	}
	if err := checkSponsorNames(sp.DisplayName, sp.LegalName); err != nil {
		return err
	}
	if err := checkCompliance(c.Category, c.Compliance, c.EndDate, s.today()); err != nil {
		return err
	}
	if _, err := screenAdText(c.Category, []string{c.Creative.Headline, c.Creative.Body, c.Creative.Alt}); err != nil {
		return err
	}
	if err := s.checkRunnable(ctx, s.Settings(ctx), c); err != nil {
		return err
	}
	return s.recheckInventory(ctx, c)
}

// recheckInventory confirms a booked campaign still fits its placement's
// inventory, ignoring its own commitment. Once the start date has passed,
// the booked impressions must fit the days that are left.
func (s *AdsService) recheckInventory(ctx context.Context, c *domain.AdCampaign) error {
	set := s.Settings(ctx)
	price, ok := set.Price(c.Placement)
	start, e1 := parseAdDay(max(c.StartDate, s.today()))
	end, e2 := parseAdDay(c.EndDate)
	if !ok || e1 != nil || e2 != nil || end.Before(start) {
		return adErr(AdErrInventoryUnavailable, "This placement is no longer on sale.")
	}
	avail, err := s.available(ctx, set, price, start, end, c.ID)
	if err != nil {
		return err
	}
	if c.BookedImpressions > avail {
		maxAvail := avail / max(set.ImpressionStep, 1) * max(set.ImpressionStep, 1)
		e := adErr(AdErrInventoryUnavailable, fmt.Sprintf("Only %d impressions are still available on those dates.", maxAvail))
		e.Extra = map[string]any{"maxAvailable": maxAvail}
		return e
	}
	return nil
}

// finishApproval copies the creative, snapshots the sponsor line and moves
// the campaign to approved for approvalValidHours.
func (s *AdsService) finishApproval(ctx context.Context, c *domain.AdCampaign, creative domain.AdCreative, staff AdStaff, note string) error {
	sp, err := s.sponsors.Get(ctx, c.SponsorID)
	if err != nil {
		return err
	}
	hours := s.Settings(ctx).ApprovalValidHours
	if hours <= 0 {
		hours = defaultAdApprovalHours
	}
	set := map[string]any{
		"creative":          creative,
		"sponsorLine":       sponsorLine(sp, c.Political),
		"approvalExpiresAt": s.now().UTC().Add(time.Duration(hours) * time.Hour).Format(time.RFC3339),
	}
	_, err = s.transition(ctx, c, []string{domain.AdStatusPendingReview}, domain.AdStatusApproved, staff.Name, note, set)
	return err
}

// copyCreative copies each creative image into oguaa/ads/<campaignId>/ and
// returns the creative with the new URLs. Without an image store the
// creative is kept as uploaded.
func (s *AdsService) copyCreative(ctx context.Context, c *domain.AdCampaign) (domain.AdCreative, error) {
	cr := c.Creative
	if s.images == nil {
		return cr, nil
	}
	targets := []*string{&cr.ImageURL}
	if cr.Format == domain.AdFormatBanner {
		targets = []*string{&cr.ImageURLDesktop, &cr.ImageURLMobile}
	}
	for i, p := range targets {
		if *p == "" || strings.Contains(*p, "/oguaa/ads/"+c.ID+"/") {
			continue
		}
		copied, err := s.images.CopyAdImage(ctx, c.ID, "creative-"+strconv.Itoa(i+1), *p)
		if err != nil {
			s.log.Error("ads: copying a creative failed", logKeyCampaign, c.ID, logKeyErr, err)
			return cr, adErr(AdErrMediaUnavailable, "We couldn't copy the ad's images just now. Try approving again in a minute.")
		}
		*p = copied
	}
	return cr, nil
}

// ── reject, pause, resume, remove ───────────────────────────────────────────

// Reject turns down an ad in review with a reason the advertiser sees.
func (s *AdsService) Reject(ctx context.Context, id, reason string, staff AdStaff) (*AdCampaignAdmin, error) {
	reason, err := cleanReason(reason, true)
	if err != nil {
		return nil, err
	}
	return s.staffTransition(ctx, id, []string{domain.AdStatusPendingReview}, domain.AdStatusRejected, staff, reason, map[string]any{"rejectReason": reason})
}

// Pause stops a running ad without changing its dates.
func (s *AdsService) Pause(ctx context.Context, id, reason string, staff AdStaff) (*AdCampaignAdmin, error) {
	reason, err := cleanReason(reason, true)
	if err != nil {
		return nil, err
	}
	return s.staffTransition(ctx, id, []string{domain.AdStatusActive}, domain.AdStatusPaused, staff, reason, map[string]any{fieldPausedBy: domain.AdPausedByStaff})
}

// fieldPausedBy is the bson field of AdCampaign.PausedBy.
const fieldPausedBy = "pausedBy"

// Resume restarts a paused ad (scheduled again if its start is still ahead).
// Its sponsor must be verified, and an ad stopped by the emergency stop or a
// sponsor suspension is resumed by a curator or steward, not a moderator.
func (s *AdsService) Resume(ctx context.Context, id, reason string, staff AdStaff) (*AdCampaignAdmin, error) {
	reason, err := cleanReason(reason, true)
	if err != nil {
		return nil, err
	}
	c, err := s.getCampaign(ctx, id)
	if err != nil {
		return nil, err
	}
	if (c.PausedBy == domain.AdPausedByKill || c.PausedBy == domain.AdPausedBySponsor) && staff.Role == domain.RoleModerator {
		return nil, adErr(AdErrForbidden, "A curator resumes ads stopped by the emergency stop or a sponsor suspension.")
	}
	if sp, err := s.sponsors.Get(ctx, c.SponsorID); err != nil || sp == nil || sp.Status != domain.AdSponsorVerified {
		return nil, adErr(AdErrSponsorNotVerified, "Verify the sponsor again before resuming its ads.")
	}
	to := domain.AdStatusActive
	if c.StartDate > s.today() {
		to = domain.AdStatusScheduled
	}
	return s.staffTransition(ctx, id, []string{domain.AdStatusPaused}, to, staff, reason, map[string]any{fieldPausedBy: ""})
}

// Remove takes a booked ad down for good (refunding the undelivered share;
// political ads stay in the library with the reason).
func (s *AdsService) Remove(ctx context.Context, id, reason string, staff AdStaff) (*AdCampaignAdmin, error) {
	reason, err := cleanReason(reason, true)
	if err != nil {
		return nil, err
	}
	c, err := s.getCampaign(ctx, id)
	if err != nil {
		return nil, err
	}
	if _, err := s.remove(ctx, c, staff.Name, reason); err != nil {
		return nil, err
	}
	return s.AdminCampaign(ctx, id)
}

// remove moves a scheduled, active or paused campaign to removed.
func (s *AdsService) remove(ctx context.Context, c *domain.AdCampaign, actor, reason string) (*domain.AdCampaign, error) {
	set := map[string]any{"removalReason": reason}
	if c.PaymentStatus == domain.AdPaymentSuccess {
		set[fieldRefundOwed] = domain.AdRefundRemoved
	}
	s.retainPolitical(c, set)
	live := []string{domain.AdStatusScheduled, domain.AdStatusActive, domain.AdStatusPaused}
	if !slices.Contains(live, c.Status) {
		return nil, errAdTransition()
	}
	return s.transition(ctx, c, live, domain.AdStatusRemoved, actor, reason, set)
}

// staffTransition loads a campaign and makes one staff status change.
func (s *AdsService) staffTransition(ctx context.Context, id string, from []string, to string, staff AdStaff, reason string, set map[string]any) (*AdCampaignAdmin, error) {
	c, err := s.getCampaign(ctx, id)
	if err != nil {
		return nil, err
	}
	if !slices.Contains(from, c.Status) {
		return nil, errAdTransition()
	}
	if _, err := s.transition(ctx, c, from, to, staff.Name, reason, set); err != nil {
		return nil, err
	}
	return s.AdminCampaign(ctx, id)
}

// ── kill switch ─────────────────────────────────────────────────────────────

// Kill scopes.
const (
	AdKillPolitical = "political"
	AdKillSponsor   = "sponsor"
)

// AdKillInput is the POST /api/admin/ads/kill body.
type AdKillInput struct {
	Scope     string `json:"scope"`
	SponsorID string `json:"sponsorId"`
	Reason    string `json:"reason"`
}

// Kill pauses every scheduled or active campaign in the scope.
func (s *AdsService) Kill(ctx context.Context, in AdKillInput, staff AdStaff) (int, error) {
	reason, err := cleanReason(in.Reason, true)
	if err != nil {
		return 0, err
	}
	var f domain.AdFilter
	switch in.Scope {
	case AdKillPolitical:
		political := true
		f.Political = &political
	case AdKillSponsor:
		if strings.TrimSpace(in.SponsorID) == "" {
			return 0, adFieldErr(AdErrInvalidScope, adFieldSponsorID, "Choose the sponsor whose ads to pause.")
		}
		f.SponsorID = strings.TrimSpace(in.SponsorID)
	default:
		return 0, adFieldErr(AdErrInvalidScope, "scope", "Choose political or sponsor.")
	}
	return s.pauseMatching(ctx, f, staff.Name, reason, domain.AdPausedByKill)
}

// pauseMatching pauses every active or scheduled campaign matching f,
// recording what paused it (by).
func (s *AdsService) pauseMatching(ctx context.Context, f domain.AdFilter, actor, reason, by string) (int, error) {
	paused := 0
	for _, status := range []string{domain.AdStatusActive, domain.AdStatusScheduled} {
		f.Status, f.Page, f.PerPage = status, 0, 0
		rows, _, err := s.campaigns.List(ctx, f)
		if err != nil {
			return paused, err
		}
		for i := range rows {
			change := domain.AdStatusChange{From: status, To: domain.AdStatusPaused, At: s.nowRFC(), ActorName: actor, Reason: reason}
			won, err := s.campaigns.Transition(ctx, rows[i].ID, []string{status}, domain.AdStatusPaused, change, map[string]any{fieldPausedBy: by})
			if err != nil {
				return paused, err
			}
			if won {
				paused++
			}
		}
	}
	return paused, nil
}

// ── manual refund (steward) ─────────────────────────────────────────────────

const adFieldAmount = "amountPesewas"

// AdRefundInput is the POST /api/admin/ads/{id}/refund body.
type AdRefundInput struct {
	AmountPesewas int64  `json:"amountPesewas"`
	Reason        string `json:"reason"`
}

// ManualRefund refunds part or all of what is left of a paid campaign.
func (s *AdsService) ManualRefund(ctx context.Context, id string, in AdRefundInput, staff AdStaff) (*AdCampaignAdmin, error) {
	reason, err := cleanReason(in.Reason, true)
	if err != nil {
		return nil, err
	}
	c, err := s.getCampaign(ctx, id)
	if err != nil {
		return nil, err
	}
	if c.PaymentStatus != domain.AdPaymentSuccess {
		return nil, adFieldErr(AdErrInvalidAmount, adFieldAmount, "Only a paid campaign can be refunded.")
	}
	left := c.Price.TotalPesewas - c.RefundCommittedPesewas()
	if in.AmountPesewas <= 0 || in.AmountPesewas > left {
		return nil, adFieldErr(AdErrInvalidAmount, adFieldAmount, fmt.Sprintf("Refund between GH₵0.01 and %s.", adCedis(left)))
	}
	if !c.Simulated && paymentsOff(s.paystack) {
		return nil, ErrPaymentsUnavailable
	}
	r := domain.AdRefund{
		ID: c.ID + "-manual-" + strconv.FormatInt(time.Now().UnixNano(), 10), AmountPesewas: in.AmountPesewas,
		Reason: domain.AdRefundManual, Status: domain.AdRefundRequesting, CreatedAt: s.nowRFC(), UpdatedAt: s.nowRFC(),
	}
	if err := s.sendRefund(ctx, c, r, staff.Name+": "+reason); err != nil {
		return nil, err
	}
	return s.AdminCampaign(ctx, id)
}

// ── refunds that need a person (steward) ────────────────────────────────────

// AdResolveRefundInput is the POST /api/admin/ads/{id}/refunds/{refundId}
// body: what a steward found on the Paystack dashboard.
type AdResolveRefundInput struct {
	Status string `json:"status"` // processed | failed
	Reason string `json:"reason"`
}

// ResolveRefund settles a refund stuck in manual_check after a steward has
// checked Paystack: "processed" (the money went back; it counts as refunded)
// or "failed" (it didn't; the amount can be refunded again).
func (s *AdsService) ResolveRefund(ctx context.Context, id, refundID string, in AdResolveRefundInput, staff AdStaff) (*AdCampaignAdmin, error) {
	reason, err := cleanReason(in.Reason, true)
	if err != nil {
		return nil, err
	}
	if in.Status != domain.AdRefundProcessed && in.Status != domain.AdRefundFailed {
		return nil, adFieldErr(AdErrInvalidTransition, "status", "Mark the refund processed or failed.")
	}
	c, err := s.getCampaign(ctx, id)
	if err != nil {
		return nil, err
	}
	i := slices.IndexFunc(c.Refunds, func(r domain.AdRefund) bool { return r.ID == refundID })
	if i < 0 {
		return nil, errAdNotFound()
	}
	note := staff.Name + ": " + reason
	won, err := s.campaigns.ResolveRefund(ctx, id, refundID, in.Status, note, s.nowRFC(), refundedShare(c.Refunds[i], in.Status))
	if err != nil {
		return nil, err
	}
	if !won {
		return nil, adErr(AdErrInvalidTransition, "This refund isn't waiting for a check any more. Reload to see its status.")
	}
	s.log.Info("ads: refund resolved by staff", logKeyCampaign, id, logKeyRefund, refundID, "status", in.Status, "staff", staff.Name)
	return s.AdminCampaign(ctx, id)
}

// paymentsOff reports whether the server runs without a payment provider.
func paymentsOff(p RefundingPaystack) bool {
	switch p.(type) {
	case nil, DisabledPaystack, *DisabledPaystack:
		return true
	}
	return false
}
