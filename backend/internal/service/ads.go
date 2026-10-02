package service

import (
	"context"
	"errors"
	"log/slog"
	"slices"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── paid advertising: campaigns (spec §3.3–§3.7) ────────────────────────────
//
// An advertiser picks a placement and a sponsor, gets a live quote, uploads a
// creative and submits it for review. Staff review before any money moves
// (D1). An approved campaign holds its price and inventory for
// approvalValidHours; the advertiser pays through Paystack and the campaign is
// scheduled (or active at once). The scheduler (ads_scheduler.go) starts,
// completes and refunds campaigns; serving and the ad library are elsewhere.
// Every state change is one conditional write on the campaign document.

const (
	prefixAdCampaign = "ad-"  // campaign ids; references are oguaa-adv-<id>-<nanos>
	prefixAdSponsor  = "asp-" // sponsor ids

	maxAdHeadlineRunes = 60
	maxAdBodyRunes     = 90
	maxAdAltRunes      = 125
	minAdReasonRunes   = 5
	maxAdReasonRunes   = 1000
	maxAdNoteRunes     = 1000

	adFieldSponsorID       = "sponsorId"
	adFieldImageURL        = "creative.imageUrl"
	adFieldImageURLDesktop = "creative.imageUrlDesktop"
	adFieldImageURLMobile  = "creative.imageUrlMobile"

	// Log keys.
	logKeyCampaign = "campaign"
	logKeyRefund   = "refund"
	logKeyErr      = "err"

	// adAdminPerPage is the admin queue page size.
	adAdminPerPage = 25
)

// AdImageCopier copies a creative image into Oguaa's own ads folder
// (oguaa/ads/<campaignId>/<publicID>) and returns the new secure URL, so
// member-media erasure can never delete an ad's record of what ran.
// *cloudinary.Client implements it.
type AdImageCopier interface {
	CopyAdImage(ctx context.Context, campaignID, publicID, sourceURL string) (string, error)
}

// AdPrivateUploads lists a member's private uploads, to check that the
// documents a sponsor or campaign points at are the member's own.
// domain.PrivateUploadRepository implements it.
type AdPrivateUploads interface {
	ByOwner(ctx context.Context, ownerID string) ([]domain.PrivateUpload, error)
}

// AdsDeps are what the ads service needs. Only Campaigns, Sponsors and
// Paystack are required; the rest switch features off when nil.
type AdsDeps struct {
	Campaigns domain.AdRepository
	Sponsors  domain.AdSponsorRepository
	Stats     domain.AdStatsReader // delivery history (forecast, daily delivery)
	Settings  *SettingsService
	Elections *ElectionsService
	Paystack  RefundingPaystack
	Images    AdImageCopier           // nil: creatives stay where they were uploaded
	Uploads   AdPrivateUploads        // nil: private-upload ownership is not checked
	Reports   domain.ReportRepository // nil: reportsCount is 0
	Email     EmailSender             // nil: no transactional email
	PortalURL string                  // for the Pay link and the Paystack callback
	// CloudinaryCloudName is the cloud creatives must be uploaded to.
	CloudinaryCloudName string
	// TokenSecretConfigured reports whether ADS_TOKEN_SECRET is set (serving).
	TokenSecretConfigured bool
	Log                   *slog.Logger
}

// AdsService runs sponsors, campaigns, review, payment and refunds.
type AdsService struct {
	campaigns             domain.AdRepository
	sponsors              domain.AdSponsorRepository
	stats                 domain.AdStatsReader
	settings              *SettingsService
	elections             *ElectionsService
	paystack              RefundingPaystack
	images                AdImageCopier
	uploads               AdPrivateUploads
	reports               domain.ReportRepository
	email                 EmailSender
	portal                string
	cloudName             string
	tokenSecretConfigured bool
	log                   *slog.Logger
	now                   func() time.Time
	flush                 func(context.Context) error
}

// NewAdsService builds the ads service.
func NewAdsService(d AdsDeps) *AdsService {
	log := d.Log
	if log == nil {
		log = slog.Default()
	}
	return &AdsService{
		campaigns: d.Campaigns, sponsors: d.Sponsors, stats: d.Stats, settings: d.Settings, elections: d.Elections,
		paystack: d.Paystack, images: d.Images, uploads: d.Uploads, reports: d.Reports, email: d.Email,
		portal: strings.TrimRight(d.PortalURL, "/"), cloudName: d.CloudinaryCloudName,
		tokenSecretConfigured: d.TokenSecretConfigured, log: log, now: time.Now,
	}
}

// Simulated reports whether ad payments run against the labelled simulation.
func (s *AdsService) Simulated() bool { return s.paystack != nil && s.paystack.Simulated() }

func (s *AdsService) nowRFC() string { return s.now().UTC().Format(time.RFC3339) }

// ── response shapes (spec §4.5) ─────────────────────────────────────────────

// AdApprovalView is a sign-off as the advertiser sees it (no checklist).
type AdApprovalView struct {
	StaffName string `json:"staffName"`
	At        string `json:"at"`
}

// AdCampaignView is the advertiser shape of a campaign. Daily is filled on
// the single-campaign read.
type AdCampaignView struct {
	domain.AdCampaign
	Approvals []AdApprovalView       `json:"approvals,omitempty"`
	Daily     []domain.AdCampaignDay `json:"daily,omitempty"`
}

// advertiserView hides the reviewers' checklists.
func advertiserView(c domain.AdCampaign) AdCampaignView {
	v := AdCampaignView{AdCampaign: c}
	for _, a := range c.Approvals {
		v.Approvals = append(v.Approvals, AdApprovalView{StaffName: a.StaffName, At: a.At})
	}
	if v.StatusHistory == nil {
		v.StatusHistory = []domain.AdStatusChange{}
	}
	return v
}

// ── errors shared by the flows ──────────────────────────────────────────────

func errAdNotFound() *AdError { return adErr(AdErrNotFound, "We couldn't find that ad.") }

func errAdTransition() *AdError {
	return adErr(AdErrInvalidTransition, "This ad can't make that change in its current state. Reload and try again.")
}

// getCampaign loads a campaign, answering an AdError when it is missing.
func (s *AdsService) getCampaign(ctx context.Context, id string) (*domain.AdCampaign, error) {
	c, err := s.campaigns.Get(ctx, id)
	var nf *domain.NotFoundError
	if errors.As(err, &nf) || (err == nil && c == nil) {
		return nil, errAdNotFound()
	}
	return c, err
}

// ownCampaign loads a campaign the member owns; anyone else gets not found.
func (s *AdsService) ownCampaign(ctx context.Context, memberID, id string) (*domain.AdCampaign, error) {
	c, err := s.getCampaign(ctx, id)
	if err != nil {
		return nil, err
	}
	if memberID == "" || c.MemberID != memberID {
		return nil, errAdNotFound()
	}
	return c, nil
}

// cleanReason trims a staff or advertiser reason and checks its length.
func cleanReason(reason string, required bool) (string, error) {
	reason = strings.TrimSpace(reason)
	n := runeLen(reason)
	if (required || n > 0) && (n < minAdReasonRunes || n > maxAdReasonRunes) {
		return "", adFieldErr(AdErrInvalidReason, adFieldReason, "Give a reason of 5 to 1,000 characters.")
	}
	return reason, nil
}

// privateUploadID normalises a private-upload reference ("private:<id>" or
// "<id>") to the id.
func privateUploadID(ref string) string {
	return strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(ref), domain.PrivateRefPrefix))
}

// checkOwnUploads confirms every non-empty upload id is one of the member's
// own private uploads (when the upload store is wired).
func (s *AdsService) checkOwnUploads(ctx context.Context, memberID string, ids map[string]string) error {
	need := map[string]string{}
	for field, id := range ids {
		if id != "" {
			need[field] = id
		}
	}
	if len(need) == 0 || s.uploads == nil {
		return nil
	}
	own, err := s.uploads.ByOwner(ctx, memberID)
	if err != nil {
		return err
	}
	for field, id := range need {
		if !slices.ContainsFunc(own, func(u domain.PrivateUpload) bool { return u.ID == id }) {
			return adFieldErr(AdErrInvalidSponsor, field, "Upload the document again: we couldn't find it in your private documents.")
		}
	}
	return nil
}

// ── submit (POST /api/me/ads) ───────────────────────────────────────────────

// AdComplianceInput is the compliance block of a submission (the approval
// upload id is accepted here and never echoed back).
type AdComplianceInput struct {
	FDARegistrationNo    string `json:"fdaRegistrationNo"`
	FDAApprovalRef       string `json:"fdaApprovalRef"`
	FDAApprovalExpiresOn string `json:"fdaApprovalExpiresOn"`
	Regulator            string `json:"regulator"`
	LicenceNumber        string `json:"licenceNumber"`
	ApprovalUploadID     string `json:"approvalUploadId"`
}

func (c AdComplianceInput) toDomain() domain.AdCompliance {
	return domain.AdCompliance{
		FDARegistrationNo: strings.TrimSpace(c.FDARegistrationNo), FDAApprovalRef: strings.TrimSpace(c.FDAApprovalRef),
		FDAApprovalExpiresOn: strings.TrimSpace(c.FDAApprovalExpiresOn), Regulator: strings.TrimSpace(c.Regulator),
		LicenceNumber: strings.TrimSpace(c.LicenceNumber), ApprovalUploadID: privateUploadID(c.ApprovalUploadID),
	}
}

// AdSubmitInput is the POST /api/me/ads body.
type AdSubmitInput struct {
	SponsorID     string            `json:"sponsorId"`
	Placement     string            `json:"placement"`
	Political     bool              `json:"political"`
	PoliticalType string            `json:"politicalType"`
	ElectionID    string            `json:"electionId"`
	Category      string            `json:"category"`
	Compliance    AdComplianceInput `json:"compliance"`
	Creative      domain.AdCreative `json:"creative"`
	StartDate     string            `json:"startDate"`
	EndDate       string            `json:"endDate"`
	Impressions   int64             `json:"impressions"`
	AcceptTerms   bool              `json:"acceptTerms"`
	StartConsent  bool              `json:"startConsent"`
	Email         string            `json:"email"`
}

func (in AdSubmitInput) quoteInput() AdQuoteInput {
	return AdQuoteInput{
		Placement: in.Placement, Political: in.Political, ElectionID: in.ElectionID, PoliticalType: in.PoliticalType,
		StartDate: in.StartDate, EndDate: in.EndDate, Impressions: in.Impressions,
	}
}

// Submit validates a campaign and queues it for review (pending_review).
func (s *AdsService) Submit(ctx context.Context, memberID, email string, in AdSubmitInput) (*AdCampaignView, error) {
	set := s.Settings(ctx)
	if err := checkAdSwitches(set, in.Political); err != nil {
		return nil, err
	}
	if !in.AcceptTerms || !in.StartConsent {
		return nil, adErr(AdErrTermsNotAccepted, "Accept the Advertising Policy and Terms of Sale, and confirm when the campaign may start.")
	}
	sponsor, err := s.submitSponsor(ctx, memberID, in.SponsorID, in.Political)
	if err != nil {
		return nil, err
	}
	category := strings.TrimSpace(in.Category)
	if in.Political {
		category = AdCategoryPolitical
	} else if err := checkCategory(category, set, sponsor); err != nil {
		return nil, err
	}
	q, err := s.quote(ctx, set, in.quoteInput(), quoteOptions{sponsor: sponsor})
	if err != nil {
		return nil, err
	}
	compliance := in.Compliance.toDomain()
	if err := s.checkSubmission(ctx, memberID, category, compliance, in, q.format); err != nil {
		return nil, err
	}
	c := s.newCampaign(memberID, email, sponsor, category, compliance, in, q)
	if err := s.campaigns.Insert(ctx, c); err != nil {
		return nil, err
	}
	v := advertiserView(c)
	return &v, nil
}

// submitSponsor loads the member's sponsor and checks it suits the ad.
func (s *AdsService) submitSponsor(ctx context.Context, memberID, sponsorID string, political bool) (*domain.AdSponsor, error) {
	sp, err := s.sponsors.Get(ctx, sponsorID)
	if err != nil || sp == nil || memberID == "" || sp.MemberID != memberID {
		return nil, adFieldErr(AdErrSponsorNotFound, adFieldSponsorID, "Choose one of your sponsors.")
	}
	if (sp.Kind == domain.AdSponsorPolitical) != political {
		return nil, adFieldErr(AdErrSponsorKindMismatch, adFieldSponsorID, "Political ads need a political sponsor, and commercial ads a commercial one.")
	}
	if sp.Status == domain.AdSponsorSuspended {
		return nil, adErr(AdErrSponsorNotVerified, "This sponsor is suspended and can't place ads.")
	}
	if err := checkSponsorNames(sp.DisplayName, sp.LegalName); err != nil {
		return nil, err
	}
	return sp, nil
}

// checkSubmission runs the compliance, creative and text rules.
func (s *AdsService) checkSubmission(ctx context.Context, memberID, category string, compliance domain.AdCompliance, in AdSubmitInput, format string) error {
	if err := checkCompliance(category, compliance, in.EndDate, s.today()); err != nil {
		return err
	}
	if err := s.checkOwnUploads(ctx, memberID, map[string]string{"compliance.approvalUploadId": compliance.ApprovalUploadID}); err != nil {
		return err
	}
	cr := in.Creative
	cr.Format = format
	if err := s.checkCreative(cr); err != nil {
		return err
	}
	_, err := screenAdText(category, []string{cr.Headline, cr.Body, cr.Alt})
	return err
}

// checkCreative validates a creative for its format (spec §3.1).
func (s *AdsService) checkCreative(cr domain.AdCreative) error {
	if err := checkCreativeText(cr); err != nil {
		return err
	}
	if err := checkLandingURL(cr.LandingURL); err != nil {
		return err
	}
	for field, img := range creativeImages(cr) {
		if strings.TrimSpace(img) == "" {
			return adFieldErr(AdErrInvalidCreative, field, "Upload every image this placement needs.")
		}
		if err := checkCloudinaryImage(img, s.cloudName, field); err != nil {
			return err
		}
	}
	return nil
}

// checkCreativeText checks the lengths of the creative's words.
func checkCreativeText(cr domain.AdCreative) error {
	alt := strings.TrimSpace(cr.Alt)
	switch {
	case alt == "" || runeLen(alt) > maxAdAltRunes:
		return adFieldErr(AdErrInvalidCreative, "creative.alt", "Describe the image for people who can't see it (up to 125 characters).")
	case cr.Format == domain.AdFormatCard && (strings.TrimSpace(cr.Headline) == "" || runeLen(cr.Headline) > maxAdHeadlineRunes):
		return adFieldErr(AdErrInvalidCreative, "creative.headline", "Write a headline of up to 60 characters.")
	case runeLen(cr.Body) > maxAdBodyRunes:
		return adFieldErr(AdErrInvalidCreative, "creative.body", "Keep the text to 90 characters.")
	}
	return nil
}

// creativeImages maps each image field the format needs to its value.
func creativeImages(cr domain.AdCreative) map[string]string {
	if cr.Format == domain.AdFormatBanner {
		return map[string]string{adFieldImageURLDesktop: cr.ImageURLDesktop, adFieldImageURLMobile: cr.ImageURLMobile}
	}
	return map[string]string{adFieldImageURL: cr.ImageURL}
}

// cleanCreative keeps only the fields the format uses, trimmed.
func cleanCreative(cr domain.AdCreative, format string) domain.AdCreative {
	out := domain.AdCreative{
		Format: format, Alt: strings.TrimSpace(cr.Alt), LandingURL: strings.TrimSpace(cr.LandingURL),
		ContainsSyntheticMedia: cr.ContainsSyntheticMedia,
	}
	switch format {
	case domain.AdFormatBanner:
		out.ImageURLDesktop, out.ImageURLMobile = strings.TrimSpace(cr.ImageURLDesktop), strings.TrimSpace(cr.ImageURLMobile)
	case domain.AdFormatCard:
		out.ImageURL, out.Headline, out.Body = strings.TrimSpace(cr.ImageURL), strings.TrimSpace(cr.Headline), strings.TrimSpace(cr.Body)
	default:
		out.ImageURL = strings.TrimSpace(cr.ImageURL)
	}
	return out
}

// newCampaign assembles the pending campaign record.
func (s *AdsService) newCampaign(memberID, email string, sp *domain.AdSponsor, category string, compliance domain.AdCompliance, in AdSubmitInput, q *AdQuote) domain.AdCampaign {
	now := s.nowRFC()
	c := domain.AdCampaign{
		ID: newID(prefixAdCampaign), MemberID: memberID, Email: strings.TrimSpace(email), SponsorID: sp.ID,
		SponsorLine: sponsorLine(sp, in.Political), Political: in.Political, Category: category, Compliance: compliance,
		Placement: q.Placement, Creative: cleanCreative(in.Creative, q.format), StartDate: in.StartDate, EndDate: in.EndDate,
		BookedImpressions: in.Impressions, Price: q.Price, QuoteExpiresAt: q.ExpiresAt, Status: domain.AdStatusPendingReview,
		StatusHistory:  []domain.AdStatusChange{{To: domain.AdStatusPendingReview, At: now, ActorName: domain.AdActorAdvertiser}},
		StartConsentAt: now, PaymentStatus: domain.AdPaymentNone, CreatedAt: now, UpdatedAt: now,
	}
	if in.Political {
		c.PoliticalType = in.PoliticalType
		if q.election != nil {
			c.ElectionID, c.ElectionName = q.election.ID, q.election.Name
		}
	}
	return c
}

// sponsorLine is the label an ad carries: "Paid for by <legal name>" for
// political ads, "Sponsored · <display name>" otherwise.
func sponsorLine(sp *domain.AdSponsor, political bool) string {
	if political {
		return "Paid for by " + sp.LegalName
	}
	return "Sponsored · " + sp.DisplayName
}

// ── the advertiser's own campaigns ──────────────────────────────────────────

// MyCampaigns lists the member's campaigns, newest first.
func (s *AdsService) MyCampaigns(ctx context.Context, memberID string) ([]AdCampaignView, error) {
	rows, err := s.campaigns.ByMember(ctx, memberID)
	if err != nil {
		return nil, err
	}
	out := make([]AdCampaignView, 0, len(rows))
	for _, c := range rows {
		out = append(out, advertiserView(c))
	}
	return out, nil
}

// MyCampaign returns one of the member's campaigns with its daily delivery.
func (s *AdsService) MyCampaign(ctx context.Context, memberID, id string) (*AdCampaignView, error) {
	c, err := s.ownCampaign(ctx, memberID, id)
	if err != nil {
		return nil, err
	}
	v := advertiserView(*c)
	v.Daily = s.daily(ctx, c.ID)
	return &v, nil
}

// daily is a campaign's delivery per day (empty when unavailable).
func (s *AdsService) daily(ctx context.Context, id string) []domain.AdCampaignDay {
	out := []domain.AdCampaignDay{}
	if s.stats == nil {
		return out
	}
	rows, err := s.stats.CampaignDays(ctx, id)
	if err != nil {
		s.log.Warn("ads: daily delivery unavailable", logKeyCampaign, id, logKeyErr, err)
		return out
	}
	return append(out, rows...)
}

// Cancel is the advertiser's cancel / "Stop campaign": before payment it
// just closes the campaign (a payment that still lands is refunded in full);
// a scheduled campaign is refunded in full; an active one is stopped and
// refunded for the undelivered share.
func (s *AdsService) Cancel(ctx context.Context, memberID, id, reason string) (*AdCampaignView, error) {
	c, err := s.ownCampaign(ctx, memberID, id)
	if err != nil {
		return nil, err
	}
	reason, err = cleanReason(reason, false)
	if err != nil {
		return nil, err
	}
	set := map[string]any{}
	switch c.Status {
	case domain.AdStatusPendingReview, domain.AdStatusApproved:
	case domain.AdStatusScheduled:
		set[fieldRefundOwed] = domain.AdRefundCancelledBeforeStart
	case domain.AdStatusActive:
		set[fieldRefundOwed] = domain.AdRefundStoppedByAdvertiser
	default:
		return nil, adErr(AdErrNotCancellable, "This campaign can no longer be cancelled.")
	}
	s.retainPolitical(c, set)
	out, err := s.transition(ctx, c, []string{c.Status}, domain.AdStatusCancelled, domain.AdActorAdvertiser, reason, set)
	if err != nil {
		return nil, err
	}
	v := advertiserView(*out)
	return &v, nil
}

// fieldRefundOwed is the bson field of AdCampaign.RefundOwed.
const fieldRefundOwed = "refundOwed"

// politicalRetention is how long a political campaign stays in the public
// library after its last impression (spec §3.10).
const politicalRetentionYears = 7

// retainPolitical stamps retainUntil on a political campaign that leaves the
// running set after having been booked: its last impression (or now) plus
// seven years.
func (s *AdsService) retainPolitical(c *domain.AdCampaign, set map[string]any) {
	if !c.Political || !reachedBooking(c) {
		return
	}
	from := s.now().UTC()
	if t, err := time.Parse(time.RFC3339, c.LastImpressionAt); err == nil {
		from = t
	}
	set["retainUntil"] = from.AddDate(politicalRetentionYears, 0, 0).Format(time.RFC3339)
}

// reachedBooking reports whether a campaign was ever scheduled or active.
func reachedBooking(c *domain.AdCampaign) bool {
	if c.Status == domain.AdStatusScheduled || c.Status == domain.AdStatusActive || c.Status == domain.AdStatusPaused {
		return true
	}
	return slices.ContainsFunc(c.StatusHistory, func(h domain.AdStatusChange) bool {
		return h.To == domain.AdStatusScheduled || h.To == domain.AdStatusActive
	})
}

// transition makes one status change and returns the fresh campaign; a lost
// race is invalid_transition. The advertiser hears about the changes that
// matter to them.
func (s *AdsService) transition(ctx context.Context, c *domain.AdCampaign, from []string, to, actor, reason string, set map[string]any) (*domain.AdCampaign, error) {
	change := domain.AdStatusChange{From: c.Status, To: to, At: s.nowRFC(), ActorName: actor, Reason: reason}
	won, err := s.campaigns.Transition(ctx, c.ID, from, to, change, set)
	if err != nil {
		return nil, err
	}
	if !won {
		return nil, errAdTransition()
	}
	fresh, err := s.getCampaign(ctx, c.ID)
	if err != nil {
		return nil, err
	}
	s.notifyTransition(ctx, fresh)
	return fresh, nil
}

// ── reports queue and election calendar hooks ──────────────────────────────

// AdForReport resolves a reported ad for the reports queue.
func (s *AdsService) AdForReport(ctx context.Context, id string) (*AdReport, error) {
	c, err := s.campaigns.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	title := c.Creative.Headline
	if title == "" {
		title = strings.TrimPrefix(strings.TrimPrefix(c.SponsorLine, "Sponsored · "), "Paid for by ")
	}
	evidence := map[string]any{"creative": c.Creative, "sponsorLine": c.SponsorLine, "placement": c.Placement, "political": c.Political}
	return &AdReport{ID: c.ID, Title: title, OwnerID: c.MemberID, Status: c.Status, Political: c.Political, Evidence: evidence}, nil
}

// RemoveReportedAd takes a reported ad down: a live campaign is removed (and
// refunded for the undelivered share); one still in review is rejected.
func (s *AdsService) RemoveReportedAd(ctx context.Context, id, staffID, note string) error {
	c, err := s.getCampaign(ctx, id)
	if err != nil {
		return err
	}
	reason := strings.TrimSpace(note)
	if reason == "" {
		reason = "Removed after a report"
	}
	switch c.Status {
	case domain.AdStatusPendingReview, domain.AdStatusApproved:
		_, err = s.transition(ctx, c, []string{c.Status}, domain.AdStatusRejected, adStaffName(staffID), reason, map[string]any{"rejectReason": reason})
	case domain.AdStatusScheduled, domain.AdStatusActive, domain.AdStatusPaused:
		_, err = s.remove(ctx, c, adStaffName(staffID), reason)
	}
	return err
}

// adStaffName is the actor name recorded for a staff action known only by id.
func adStaffName(string) string { return "Oguaa staff" }

// LiveCampaignsForElection counts the campaigns that still depend on an
// election (approved, scheduled, active or paused).
func (s *AdsService) LiveCampaignsForElection(ctx context.Context, electionID string) (int, error) {
	return s.campaigns.CountLiveForElection(ctx, electionID)
}
