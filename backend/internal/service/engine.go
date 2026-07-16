package service

import (
	"context"
	"fmt"
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
