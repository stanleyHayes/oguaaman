package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── owner listing editor (Creator Platform plan §Phase 2) ────────────────────
//
// Creators edit their own listings from the creator studio. Approved listings
// stay live (an "owner-edit" audit record lands in the moderation trail so
// curators can spot-check); edits to draft/rejected/unpublished listings
// re-queue them for review — which also gives "request changes" a way back
// into the queue for the first time.

// OwnerEditInput is the full-replace edit payload (mirrors the submit form's
// shape: title + cover + free-form details, whitelisted per type server-side).
type OwnerEditInput struct {
	Title         string         `json:"title"`
	CoverImageURL string         `json:"coverImageUrl"`
	Details       map[string]any `json:"details"`
}

// ownerEditableTypes are the member-submittable types (same set as Submit).
// project/incident/lostfound have their own flows.
var ownerEditableTypes = validTypes

// editableDetailsKeys whitelists the details vocabulary a creator may write.
// Everything else is stripped — system keys (candles, raisedPesewas, backers,
// subscribedUntil, tiers, incident/lostfound lifecycle, spotlight…) can never
// arrive here because those types/keys are excluded.
var editableDetailsKeys = map[string]map[string]bool{
	domain.TypeArtist:      {"actName": true, "genres": true, "bio": true, "link": true, "streamingLinks": true, "socials": true, "booking": true},
	domain.TypeBusiness:    {"category": true, "description": true, "address": true, "openingHours": true, "services": true, "contact": true},
	domain.TypeEvent:       {"description": true, "startsAt": true, "venue": true, "organiser": true},
	domain.TypeMemory:      {"text": true, "era": true},
	domain.TypeOpportunity: {"kind": true, "description": true, "eligibility": true, "deadline": true, "applyUrl": true, "provider": true, "safeguardingPolicyUrl": true, "minAge": true, "maxAge": true, "guardianConsentRequired": true},
	domain.TypePerson:      {"whyNotable": true, "era": true},
	domain.TypeMemorial:    {"honorific": true, "bornYear": true, "diedDate": true, "birthday": true, "epitaph": true, "lifeStory": true, "associations": true, "gallery": true, "observeBirthday": true, "remindersEnabled": true},
}

// urlDetailKeys are scalar details values that must pass the URL guard.
var urlDetailKeys = map[string]bool{"applyUrl": true, "link": true, "booking": true}

// linkListKeys are details arrays of {label,url}-ish objects whose url fields
// need the same guard (streamingLinks/socials/contact/gallery).
var linkListKeys = map[string]bool{"streamingLinks": true, "socials": true, "contact": true, "gallery": true}

// majorEditKeys are details fields whose change is significant enough to
// re-queue a previously-approved listing for curator review (spec §8.2/§17.3).
// Minor edits (links, opening hours, contact info, booking URL) stay live.
var majorEditKeys = map[string]bool{
	"bio": true, "description": true, "lifeStory": true, "epitaph": true,
	"text": true, "whyNotable": true, "eligibility": true, "services": true,
}

func (s *Service) UpdateOwnerListing(ctx context.Context, actor *domain.Member, listingID string, in OwnerEditInput) (*domain.Listing, error) {
	if actor == nil {
		return nil, &domain.ForbiddenError{Reason: "a signed-in member is required to edit a listing"}
	}
	l, err := s.listings.GetByID(ctx, listingID)
	if err != nil {
		return nil, err
	}
	if !ownerEditableTypes[l.Type] {
		return nil, &domain.NotFoundError{Entity: "editable listing"}
	}
	if actor.ID != l.OwnerID && actor.Role != domain.RoleCurator && actor.Role != domain.RoleSteward {
		return nil, &domain.ForbiddenError{Reason: "only the owner can edit this listing"}
	}
	title := strings.TrimSpace(in.Title)
	if len(title) < 2 || len(title) > 160 {
		return nil, fmt.Errorf("title must be 2–160 characters")
	}

	// Full-replace details, whitelisted per type + URL-guarded.
	details := map[string]any{}
	allow := editableDetailsKeys[l.Type]
	for k, v := range in.Details {
		if !allow[k] {
			continue
		}
		switch {
		case urlDetailKeys[k]:
			if s, ok := v.(string); ok {
				v = safeURL(s)
			}
		case linkListKeys[k]:
			v = sanitizeLinkList(v)
		}
		details[k] = v
	}
	if l.Type == domain.TypeMemorial {
		// System counters and the keeper link must survive the full-replace edit.
		for _, sys := range []string{"candles", "rememberedByCount", "keeperId"} {
			if cur, ok := l.Details[sys]; ok {
				details[sys] = cur
			}
		}
		// Remembrance flags are editable (whitelisted) but an edit that omits
		// them must not silently switch the yearly remembrance off — carry the
		// existing value over (spec §8.11: default is to remember).
		for _, flag := range []string{"remindersEnabled", "observeBirthday"} {
			if _, ok := details[flag]; !ok {
				if cur, ok := l.Details[flag]; ok {
					details[flag] = cur
				}
			}
		}
	}

	// Status policy (spec §8.2/§17.3):
	//   • draft/rejected/unpublished → pending (re-queue)
	//   • pending → stays pending
	//   • approved → stays live for minor edits; re-queues for major ones.
	//
	// A "major" edit is a title change or a change to significant content keys
	// (bio, description, lifeStory, etc. — see majorEditKeys). Link, hours,
	// contact and image changes are always minor and stay live.
	status := l.Status
	submittedAt := ""
	editKind := "owner-edit-minor"
	now := time.Now().UTC().Format(time.RFC3339)
	switch status {
	case domain.StatusApproved:
		// Check whether the edit is major (title change or major content key).
		isMajor := strings.TrimSpace(in.Title) != l.Title
		if !isMajor {
			for k := range details {
				if majorEditKeys[k] {
					prev, _ := l.Details[k].(string)
					next, _ := details[k].(string)
					if next != prev {
						isMajor = true
						break
					}
				}
			}
		}
		if isMajor {
			status = domain.StatusPending
			submittedAt = now
			editKind = "owner-edit-major"
		}
	case domain.StatusPending:
		// already queued; keep pending.
	default:
		// draft/rejected/unpublished — re-queue.
		status = domain.StatusPending
		submittedAt = now
		editKind = "owner-edit-major"
	}

	if err := s.listings.OwnerUpdate(ctx, l.ID, title, safeURL(strings.TrimSpace(in.CoverImageURL)), details, status, submittedAt); err != nil {
		return nil, err
	}
	if err := s.mod.Insert(ctx, domain.ModerationRecord{
		ID:          "mod-" + fmt.Sprintf("%d", time.Now().UnixNano()),
		ListingID:   l.ID,
		ModeratorID: actor.ID,
		Action:      editKind,
		CreatedAt:   now,
	}); err != nil {
		return nil, err
	}
	return s.listings.GetByID(ctx, l.ID)
}

// sanitizeLinkList URL-guards every "url" field of a [{label,url}…] details
// array (best-effort: non-object entries pass through untouched).
func sanitizeLinkList(v any) any {
	items, ok := v.([]any)
	if !ok {
		return v
	}
	for _, item := range items {
		if m, ok := item.(map[string]any); ok {
			if u, ok := m["url"].(string); ok {
				m["url"] = safeURL(u)
			}
		}
	}
	return items
}

// UnpublishDraftsByOwner pulls every listing the member owns that was never
// approved — used on account erasure (Act 843, spec §14.2) so drafts and
// pending submissions don't linger after the owner is anonymised. Approved
// listings stay live under the "Former member" owner.
func (s *Service) UnpublishDraftsByOwner(ctx context.Context, ownerID string) error {
	owned, err := s.listings.Find(ctx, domain.ListingFilter{OwnerID: ownerID})
	if err != nil {
		return err
	}
	at := time.Now().UTC().Format(time.RFC3339)
	for _, l := range owned {
		if l.Status == domain.StatusApproved || l.Status == domain.StatusUnpublished {
			continue
		}
		if err := s.listings.UpdateStatus(ctx, l.ID, domain.StatusUnpublished, ownerID, "account deleted", at); err != nil {
			return err
		}
	}
	return nil
}
