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
	Type          string         `json:"type"`
	Title         string         `json:"title"`
	OwnerID       string         `json:"ownerId"`
	Tags          []string       `json:"tags"`
	TownID        string         `json:"townId"`
	CoverImageURL string         `json:"coverImageUrl"`
	Details       map[string]any `json:"details"`
}

var validTypes = map[string]bool{
	domain.TypeBusiness: true, domain.TypeArtist: true, domain.TypePerson: true,
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
	details := in.Details
	if details == nil {
		details = map[string]any{}
	}
	if in.Type == domain.TypeOpportunity {
		if err := validateOpportunityDetails(details); err != nil {
			return nil, err
		}
		if kind, _ := details["kind"].(string); strings.TrimSpace(kind) != "" {
			tagged := false
			for _, t := range in.Tags {
				if t == kind {
					tagged = true
					break
				}
			}
			if !tagged {
				in.Tags = append(in.Tags, kind)
			}
		}
	}
	if in.Type == domain.TypeMemorial {
		if _, ok := details["candles"]; !ok {
			details["candles"] = 0
		}
		details["rememberedByCount"] = 0
		// Yearly remembrance (spec §8.11): on by default — the passing
		// anniversary. The keeper may switch reminders off, or also observe
		// the birthday, at creation or any later edit; explicit values are
		// respected, only absent ones are defaulted.
		if _, ok := details["remindersEnabled"]; !ok {
			details["remindersEnabled"] = true
		}
		if _, ok := details["observeBirthday"]; !ok {
			details["observeBirthday"] = false
		}
	}
	// Use the nanosecond as a uniqueness token so two submissions with the same
	// title don't collide on slug or ID.
	nano := fmt.Sprintf("%d", time.Now().UnixNano())
	l := domain.Listing{
		ID:            "lst-" + slugify(title) + "-" + nano,
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
	if err := s.listings.Insert(ctx, l); err != nil {
		return nil, err
	}
	return &l, nil
}

var validOpportunityKinds = map[string]bool{
	"scholarship":   true,
	"internship":    true,
	"apprenticeship": true,
	"training":      true,
	"job":           true,
	"investment":    true,
	"mentorship":    true,
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
	if newStatus != "" {
		if err := s.listings.UpdateStatus(ctx, listingID, newStatus, moderatorID, reason, now); err != nil {
			return err
		}
	}
	if err := s.mod.Insert(ctx, domain.ModerationRecord{
		ID:          "mod-" + fmt.Sprintf("%d", time.Now().UnixNano()),
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
		ID: "ntf-" + fmt.Sprintf("%d", time.Now().UnixNano()), MemberID: l.OwnerID,
		Kind: kind, Title: title, Body: body, CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
	s.notifyOutOfBand(ctx, l.OwnerID, title, body, "/me")
}

func (s *Service) LightCandle(ctx context.Context, slug string) (int, error) {
	l, err := s.listings.GetBySlug(ctx, domain.TypeMemorial, slug)
	if err != nil {
		return 0, err
	}
	return s.listings.IncrementCandles(ctx, l.ID)
}

func (s *Service) AddTribute(ctx context.Context, slug, author, message string) (*domain.Tribute, error) {
	message = strings.TrimSpace(message)
	if message == "" {
		return nil, fmt.Errorf("tribute message is required")
	}
	l, err := s.listings.GetBySlug(ctx, domain.TypeMemorial, slug)
	if err != nil {
		return nil, err
	}
	if author == "" {
		author = "A member of the community"
	}
	t := domain.Tribute{
		ID:         "trb-" + fmt.Sprintf("%d", time.Now().UnixNano()),
		AuthorName: author,
		Message:    message,
		CreatedAt:  time.Now().UTC().Format(time.RFC3339),
	}
	if err := s.listings.AddTribute(ctx, l.ID, t); err != nil {
		return nil, err
	}
	return &t, nil
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
		ID:           "rpt-" + fmt.Sprintf("%d", time.Now().UnixNano()),
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
