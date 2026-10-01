package service

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── the engine: submit / moderate / candle / tribute ─────────────────────────

// SubmitInput is a validated listing submission (spec §8.2).
type SubmitInput struct {
	Type          string   `json:"type"`
	Title         string   `json:"title"`
	OwnerID       string   `json:"ownerId"`
	Tags          []string `json:"tags"`
	TownID        string   `json:"townId"`
	CoverImageURL string   `json:"coverImageUrl"`
	// Optional exact coordinates — "claim your spot on the map". Only business
	// and event listings surface on the town map (see mapdata.listingPoint); a
	// pin is stored when both are present and in range, and ignored otherwise.
	Latitude  *float64       `json:"latitude"`
	Longitude *float64       `json:"longitude"`
	Details   map[string]any `json:"details"`
}

var validTypes = map[string]bool{
	domain.TypeBusiness: true, domain.TypeProperty: true, domain.TypeArtist: true, domain.TypePerson: true,
	domain.TypeMemory: true, domain.TypeEvent: true, domain.TypeOpportunity: true, domain.TypeMemorial: true,
}

func (s *Service) Submit(ctx context.Context, in SubmitInput) (*domain.Listing, error) {
	if !validTypes[in.Type] {
		return nil, fmt.Errorf("invalid listing type %q", in.Type)
	}
	title := strings.TrimSpace(in.Title)
	if len(title) < 2 || len(title) > 160 {
		return nil, fmt.Errorf("title must be 2–160 characters")
	}
	owner := strings.TrimSpace(in.OwnerID)
	if owner == "" {
		// The delivery layer attributes the owner (the signed-in member, or a dev
		// demo identity only when auth isn't enforced). An empty owner here means
		// an unauthenticated write slipped through — refuse it rather than mis-attribute.
		return nil, fmt.Errorf("a signed-in member is required to submit")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	// Members never write system keys (plan entitlements, ratings, counters,
	// editorial and festival flags) — see systemDetailKeys.
	details, err := cleanTypedDetails(in.Type, submittedDetails(in.Type, in.Details))
	if err != nil {
		return nil, err
	}
	switch in.Type {
	case domain.TypeOpportunity:
		in.Tags = appendUniqueTag(in.Tags, asStringAny(details["kind"]))
	case domain.TypeProperty:
		for _, key := range []string{"offerType", "propertyType"} {
			in.Tags = appendUniqueTag(in.Tags, asStringAny(details[key]))
		}
	case domain.TypeMemorial:
		defaultMemorialDetails(details)
	}
	// Use the nanosecond as a uniqueness token so two submissions with the same
	// title don't collide on slug or ID.
	nano := strconv.FormatInt(time.Now().UnixNano(), 10)
	l := domain.Listing{
		ID:            domain.PrefixListing + slugify(title) + "-" + nano,
		Slug:          slugify(title) + "-" + nano[len(nano)-7:],
		Type:          in.Type,
		OwnerID:       owner,
		Title:         title,
		Status:        domain.StatusPending,
		Tags:          in.Tags,
		TownID:        in.TownID,
		CoverImageURL: strings.TrimSpace(in.CoverImageURL),
		Details:       details,
		CreatedAt:     now,
		SubmittedAt:   now,
	}
	if l.Tags == nil {
		l.Tags = []string{}
	}
	// Submissions wait for a curator anyway; the content screen marks the ones
	// that need a closer look.
	l.ScreenFlags = ScreenTerms(append([]string{title}, detailStrings(details)...)...).Reasons
	l.Latitude, l.Longitude = sanitizeCoords(in.Latitude, in.Longitude)
	if err := s.listings.Insert(ctx, l); err != nil {
		return nil, err
	}
	return &l, nil
}

// defaultMemorialDetails sets a new memorial's counters and its remembrance
// defaults (spec §8.11): reminders on for the passing anniversary, birthday
// off. Explicit remembrance choices are respected; only absent ones default.
func defaultMemorialDetails(details map[string]any) {
	details["candles"] = 0
	details["rememberedByCount"] = 0
	if _, ok := details["remindersEnabled"]; !ok {
		details["remindersEnabled"] = true
	}
	if _, ok := details["observeBirthday"]; !ok {
		details["observeBirthday"] = false
	}
}

// sanitizeCoords returns the pin only when both coordinates are present and fall
// within valid lat/lng ranges; otherwise it returns (nil, nil) so a partial or
// out-of-range pin is simply dropped rather than stored.
func sanitizeCoords(lat, lng *float64) (*float64, *float64) {
	if lat == nil || lng == nil {
		return nil, nil
	}
	if *lat < -90 || *lat > 90 || *lng < -180 || *lng > 180 {
		return nil, nil
	}
	la, ln := *lat, *lng
	return &la, &ln
}

var validOpportunityKinds = map[string]bool{
	"scholarship":    true,
	"internship":     true,
	"apprenticeship": true,
	"training":       true,
	"job":            true,
	"investment":     true,
	"mentorship":     true,
}

func validateOpportunityDetails(details map[string]any) error {
	kind := strings.TrimSpace(asStringAny(details["kind"]))
	if !validOpportunityKinds[kind] {
		return fmt.Errorf("opportunity kind must be one of scholarship, internship, apprenticeship, training, job, investment, mentorship")
	}
	details["kind"] = kind
	if u := strings.TrimSpace(asStringAny(details["applyUrl"])); u != "" {
		details["applyUrl"] = safeURL(u)
	}
	if kind != "mentorship" {
		return nil
	}
	// Safeguarding gate: mentorship listings must always link an explicit
	// safeguarding policy and, when minors are allowed, require guardian consent.
	policyURL := strings.TrimSpace(asStringAny(details["safeguardingPolicyUrl"]))
	if policyURL == "" {
		return fmt.Errorf("mentorship opportunities must include a safeguarding policy link")
	}
	parsed, err := url.ParseRequestURI(policyURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return fmt.Errorf("safeguarding policy link must be a valid http(s) URL")
	}
	details["safeguardingPolicyUrl"] = safeURL(policyURL)
	minAge, hasMinAge := asIntAny(details["minAge"])
	if !hasMinAge {
		minAge = 18
	}
	maxAge, hasMaxAge := asIntAny(details["maxAge"])
	if hasMaxAge && maxAge < minAge {
		return fmt.Errorf("maxAge cannot be less than minAge")
	}
	if minAge < 13 {
		return fmt.Errorf("mentorship minimum age cannot be below 13")
	}
	if minAge < 18 && !asBoolAny(details["guardianConsentRequired"]) {
		return fmt.Errorf("guardian consent is required when mentorship includes minors")
	}
	if hasMinAge {
		details["minAge"] = minAge
	}
	if hasMaxAge {
		details["maxAge"] = maxAge
	}
	details["guardianConsentRequired"] = asBoolAny(details["guardianConsentRequired"])
	return nil
}

func asStringAny(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func asBoolAny(v any) bool {
	switch x := v.(type) {
	case bool:
		return x
	case string:
		switch strings.ToLower(strings.TrimSpace(x)) {
		case "1", "true", "yes", "on":
			return true
		}
	}
	return false
}

func asIntAny(v any) (int, bool) {
	switch x := v.(type) {
	case int:
		return x, true
	case int32:
		return int(x), true
	case int64:
		return int(x), true
	case float64:
		return int(x), true
	case string:
		n, err := strconv.Atoi(strings.TrimSpace(x))
		if err == nil {
			return n, true
		}
	}
	return 0, false
}

// Moderation actions accepted by Moderate.
const (
	actionApprove        = "approve"
	actionReject         = "reject"
	actionRequestChanges = "request-changes"
	actionUnpublish      = "unpublish"
	actionFlag           = "flag"
)

var validActions = map[string]string{
	actionApprove:        domain.StatusApproved,
	actionReject:         domain.StatusRejected,
	actionRequestChanges: domain.StatusDraft,
	actionUnpublish:      domain.StatusUnpublished,
	actionFlag:           "", // records only; no status change
}

func (s *Service) Moderate(ctx context.Context, listingID, action, reason, moderatorID string) error {
	newStatus, ok := validActions[action]
	if !ok {
		return fmt.Errorf("invalid moderation action %q", action)
	}
	if (action == actionReject || action == actionRequestChanges) && strings.TrimSpace(reason) == "" {
		return fmt.Errorf("a reason is required to reject or request changes")
	}
	if strings.TrimSpace(moderatorID) == "" {
		// Same guard as Submit: the moderator identity is set by the delivery layer.
		// Refuse rather than write an unattributed audit record.
		return fmt.Errorf("a moderator identity is required")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	listing, err := s.listings.GetByID(ctx, listingID)
	if err != nil {
		return err
	}
	if err := s.applyModeration(ctx, listing, action, newStatus, reason, moderatorID, now); err != nil {
		return err
	}
	// First-time campaign approval vets the owner so their subsequent campaigns
	// auto-publish (Creator Monetization).
	if action == actionApprove && listing.Type == domain.TypeProject && isCampaign(*listing) && listing.OwnerID != "" {
		if owner, err := s.members.ByID(ctx, listing.OwnerID); err == nil && !owner.CampaignerVetted {
			if err := s.members.SetCampaignerVetted(ctx, listing.OwnerID, true); err != nil {
				return err
			}
		}
	}
	if err := s.mod.Insert(ctx, domain.ModerationRecord{
		ID:          newID(domain.PrefixModeration),
		ListingID:   listingID,
		ModeratorID: moderatorID,
		Action:      action,
		Reason:      reason,
		CreatedAt:   now,
	}); err != nil {
		return err
	}
	// Notify the owner on approve/reject/request-changes (spec §8.2).
	s.notifyModeration(ctx, listing, action, reason)
	return nil
}

// applyModeration moves a listing to the status a moderation action sets.
// Approving an incident is a curator's verification: it goes through the
// incident lifecycle so a held report publishes with its town alert (and
// ring, when critical), exactly as verifying it on the Incidents page does.
func (s *Service) applyModeration(ctx context.Context, l *domain.Listing, action, newStatus, reason, moderatorID, now string) error {
	switch {
	case newStatus == "":
		return nil
	case action == actionApprove && l.Type == domain.TypeIncident:
		return s.applyIncidentStatus(ctx, l, &domain.Member{ID: moderatorID}, domain.IncidentStatusVerified, reason)
	}
	return s.listings.UpdateStatus(ctx, l.ID, newStatus, moderatorID, reason, now)
}

func (s *Service) notifyModeration(ctx context.Context, l *domain.Listing, action, reason string) {
	if s.notifs == nil {
		return
	}
	var kind, title, body string
	switch action {
	case actionApprove:
		kind, title = "approved", "Your listing is live"
		body = fmt.Sprintf("“%s” was approved and is now published.", l.Title)
	case actionReject:
		kind, title = "rejected", "A listing needs another look"
		body = fmt.Sprintf("“%s” was not approved: %s", l.Title, reason)
	case actionRequestChanges:
		kind, title = "changes", "Changes requested"
		body = fmt.Sprintf("“%s” needs changes: %s", l.Title, reason)
	default:
		return
	}
	_ = s.notifs.Insert(ctx, domain.Notification{
		ID: newID(domain.PrefixNotification), MemberID: l.OwnerID,
		Kind: kind, Title: title, Body: body, CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
	s.notifyOutOfBand(ctx, l.OwnerID, title, body, "/me")
}

// Candles one visitor may light on a memorial per UTC day. A member lights
// one. A signed-out visitor is known only by IP address, and one address can
// be a whole household, school, office or mobile network behind carrier-grade
// NAT, so an address may light several: enough for the people sharing it,
// while one person reloading the page still adds only a bounded number.
const (
	memberCandlesPerDay  = 1
	addressCandlesPerDay = 50
)

// LightCandle lights one candle on a published memorial for visitorKey (a
// member id, or domain.AnonymousVisitorPrefix + the caller's IP when signed
// out), within that visitor's daily allowance; past it a candle returns the
// current count unchanged.
func (s *Service) LightCandle(ctx context.Context, slug, visitorKey string) (int, error) {
	l, err := s.ListingBySlug(ctx, domain.TypeMemorial, slug)
	if err != nil {
		return 0, err
	}
	perDay := memberCandlesPerDay
	if strings.HasPrefix(visitorKey, domain.AnonymousVisitorPrefix) {
		perDay = addressCandlesPerDay
	}
	return s.listings.IncrementCandles(ctx, l.ID, visitorKey, perDay)
}

// Tribute limits (F092): tributes are embedded in the memorial document, so
// each is bounded, and one member can leave only a few on a memorial.
const (
	maxTributeMessageRunes  = 1000
	maxTributeRelationRunes = 60
	maxTributesPerMember    = 3
	tributeNoun             = "tribute"
	msgCannotInteract       = "You can't interact with this member."
)

// TributeInput is a member's tribute on a memorial.
type TributeInput struct {
	Relation string `json:"relation"`
	Message  string `json:"message"`
}

// AddTribute leaves a tribute on a published memorial as the signed-in member.
// The author is always the member's own display name (no impersonation), the
// text is screened (anything flagged is refused with a request to rephrase),
// and a member in a block with the memorial's owner cannot post.
func (s *Service) AddTribute(ctx context.Context, member *domain.Member, slug string, in TributeInput) (*domain.Tribute, error) {
	if member == nil {
		return nil, &domain.ForbiddenError{Reason: "sign in to leave a tribute"}
	}
	if member.Suspended {
		return nil, &domain.ForbiddenError{Reason: "your account is suspended"}
	}
	message := strings.TrimSpace(in.Message)
	relation := strings.TrimSpace(in.Relation)
	switch {
	case message == "":
		return nil, &domain.ValidationError{Message: "tribute message is required"}
	case runeLen(message) > maxTributeMessageRunes:
		return nil, &domain.ValidationError{Message: fmt.Sprintf("please keep your tribute under %d characters", maxTributeMessageRunes)}
	case runeLen(relation) > maxTributeRelationRunes:
		return nil, &domain.ValidationError{Message: fmt.Sprintf("please keep how you knew them under %d characters", maxTributeRelationRunes)}
	}
	if err := screenRefusal(ScreenText(message, relation), tributeNoun); err != nil {
		return nil, err
	}
	// The raw memorial (hidden and removed tributes included) so the per-member
	// cap cannot be dodged by removing and re-posting.
	l, err := s.listings.GetBySlug(ctx, domain.TypeMemorial, slug)
	if err != nil {
		return nil, err
	}
	if l.Status != domain.StatusApproved {
		return nil, &domain.NotFoundError{Entity: domain.TypeMemorial}
	}
	if s.BlockedBetween(ctx, member, l.OwnerID) {
		return nil, &domain.ForbiddenError{Reason: msgCannotInteract}
	}
	if tributesBy(l, member.ID) >= maxTributesPerMember {
		return nil, &domain.ValidationError{Message: fmt.Sprintf("you can leave up to %d tributes on a memorial", maxTributesPerMember)}
	}
	author := strings.TrimSpace(member.DisplayName)
	if author == "" {
		author = "A member of the community"
	}
	t := domain.Tribute{
		ID:         newID(domain.PrefixTribute),
		AuthorName: author,
		Relation:   relation,
		Message:    message,
		CreatedAt:  time.Now().UTC().Format(time.RFC3339),
		MemberID:   member.ID,
		MemberSlug: member.Slug,
	}
	if err := s.listings.AddTribute(ctx, l.ID, t); err != nil {
		return nil, err
	}
	return &t, nil
}

// tributesBy counts the tributes (visible or not) a member left on a memorial.
func tributesBy(l *domain.Listing, memberID string) int {
	n := 0
	for _, t := range l.Tributes {
		if t.MemberID == memberID {
			n++
		}
	}
	return n
}

// RemoveTribute takes a tribute down (kept as evidence, never shown again).
// Its author, the memorial's owner or keeper, and safety staff may remove it.
func (s *Service) RemoveTribute(ctx context.Context, actor *domain.Member, slug, tributeID string) error {
	if actor == nil {
		return &domain.ForbiddenError{Reason: "sign in to remove a tribute"}
	}
	l, err := s.listings.GetByTributeID(ctx, tributeID)
	if err != nil {
		return err
	}
	if l.Type != domain.TypeMemorial || (slug != "" && l.Slug != slug) {
		return &domain.NotFoundError{Entity: tributeNoun}
	}
	var author string
	for _, t := range l.Tributes {
		if t.ID == tributeID {
			author = t.MemberID
		}
	}
	allowed := isSafetyStaff(actor.Role) || actor.ID == l.OwnerID ||
		(author != "" && actor.ID == author) || asString(l.Details, "keeperId") == actor.ID
	if !allowed {
		return &domain.ForbiddenError{Reason: "only the tribute's author, the memorial's keeper or a curator can remove it"}
	}
	return s.listings.SetTributeStatus(ctx, l.ID, tributeID, domain.TributeRemoved)
}

// ClaimKeeperRole submits a memorial family claim request to the curator queue.
// Any signed-in member may claim keeper status for a memorial; a curator
// reviews it and either grants (via GrantKeeperRole) or dismisses it.
func (s *Service) ClaimKeeperRole(ctx context.Context, memberID, memberName, slug, detail string) (*domain.Report, error) {
	if s.reports == nil {
		return nil, fmt.Errorf("reports are not available")
	}
	l, err := s.listings.GetBySlug(ctx, domain.TypeMemorial, slug)
	if err != nil {
		return nil, err
	}
	detail = strings.TrimSpace(detail)
	if len(detail) > 2000 {
		return nil, fmt.Errorf("please keep your message under 2000 characters")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	rep := domain.Report{
		ID:           newID(domain.PrefixReport),
		ListingID:    l.ID,
		ListingSlug:  l.Slug,
		ListingType:  domain.TypeMemorial,
		ListingTitle: l.Title,
		Reason:       domain.ReasonBereavement,
		Detail:       detail,
		ReporterID:   memberID,
		ReporterName: memberName,
		Status:       domain.ReportOpen,
		CreatedAt:    now,
		KeeperClaim:  true,
	}
	if err := s.reports.Insert(ctx, rep); err != nil {
		return nil, err
	}
	s.notifyStewardsOfReport(ctx, &rep)
	return &rep, nil
}

// GrantKeeperRole is a curator action: assign keeperId on a memorial listing
// and resolve the keeper-claim report. reportID may be empty (direct grant).
func (s *Service) GrantKeeperRole(ctx context.Context, listingID, keeperMemberID, curatorID, reportID string) error {
	l, err := s.listings.GetByID(ctx, listingID)
	if err != nil {
		return err
	}
	if l.Type != domain.TypeMemorial {
		return fmt.Errorf("keeper roles can only be granted on memorial listings")
	}
	if err := s.listings.SetKeeperID(ctx, listingID, keeperMemberID); err != nil {
		return err
	}
	if reportID != "" && s.reports != nil {
		now := time.Now().UTC().Format(time.RFC3339)
		var reporterID string
		if rep, rerr := s.reports.Get(ctx, reportID); rerr == nil && rep != nil {
			reporterID = rep.ReporterID
		}
		_ = s.reports.UpdateStatus(ctx, reportID, domain.ReportActioned, curatorID, "keeper role granted", now)
		if reporterID != "" {
			title := "Your memorial keeper claim was approved"
			body := fmt.Sprintf("You were granted keeper access for “%s”.", l.Title)
			s.notify(ctx, reporterID, "keeper-claim", title, body, "/memoriam/"+l.Slug)
		}
	}
	return nil
}
