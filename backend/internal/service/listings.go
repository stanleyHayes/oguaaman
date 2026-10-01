package service

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
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

// systemDetailKeys are the details keys the platform and its curators
// maintain, listed by the listing types that use them. Members can never set
// one: Submit strips them all, whatever the type. An owner's edit can never
// write one either, and always carries the stored values over, so a content
// edit can't wipe a paid entitlement, a payment counter or curated festival
// data. Add a key here whenever new code starts keeping state in details.
var systemDetailKeys = map[string]bool{
	// business / property: paid plan entitlements and placements.
	"subscribedUntil": true, "plan": true, "promotedUntil": true, "featuredUntil": true,
	// business: the review aggregate written by SetRating (JSON-LD aggregateRating).
	"ratingAvg": true, "ratingCount": true,
	// artist: the home-page spotlight and the tip-jar counters kept by IncrementDonations.
	"spotlight": true, "donationsNetPesewas": true, "donorCount": true,
	// event: festival archive data maintained by curators (festivals.go, AnchorEvent).
	"anchorFestival": true, "festival": true, "edition": true, "recap": true, "programme": true,
	// memorial: counters and the curator-granted keeper.
	"candles": true, "rememberedByCount": true, "keeperId": true,
	// project / campaign: pledge counters and the campaign marker.
	"raisedPesewas": true, "backers": true, "campaign": true,
	// incident / lost & found: the operational lifecycles and alert bookkeeping.
	"incidentStatus": true, "statusHistory": true, "broadcastAt": true, "ringAt": true, "lfStatus": true,
	"postReviewDueAt": true, "postReviewedAt": true, "postReviewedBy": true,
}

// editableDetailsKeys whitelists the details vocabulary a creator may write.
// Everything else in an edit is ignored; stored keys outside the whitelist
// (system keys included) are carried over untouched.
var editableDetailsKeys = map[string]map[string]bool{
	domain.TypeArtist:      {"actName": true, "genres": true, "bio": true, "link": true, "streamingLinks": true, "socials": true, "booking": true, "releases": true},
	domain.TypeBusiness:    {"category": true, "categories": true, "description": true, "address": true, "openingHours": true, "services": true, "contact": true},
	domain.TypeProperty:    propertyEditableDetailsKeys,
	domain.TypeEvent:       {"description": true, "startsAt": true, "endsAt": true, "venue": true, "organiser": true, "eventFormat": true, "audience": true, "admission": true, "startTime": true, "endTime": true, "highlights": true, "featuredGuests": true, "ageGuidance": true, "accessibility": true, "dressCode": true, "contactInfo": true, "refundPolicy": true, "tiers": true},
	domain.TypeMemory:      {"text": true, "era": true},
	domain.TypeOpportunity: {"kind": true, "description": true, "eligibility": true, "deadline": true, "applyUrl": true, "provider": true, "safeguardingPolicyUrl": true, "minAge": true, "maxAge": true, "guardianConsentRequired": true},
	domain.TypePerson:      {"whyNotable": true, "era": true},
	domain.TypeMemorial:    {"honorific": true, "bornYear": true, "diedDate": true, "birthday": true, "epitaph": true, "lifeStory": true, "associations": true, "gallery": true, "observeBirthday": true, "remindersEnabled": true},
}

// urlDetailKeys are scalar details values that must pass the URL guard.
var urlDetailKeys = map[string]bool{"applyUrl": true, "link": true, "booking": true, "bookingUrl": true, "safeguardingPolicyUrl": true}

// linkListKeys are details arrays of {label,url}-ish objects whose url fields
// need the same guard (streamingLinks/socials/contact/gallery).
var linkListKeys = map[string]bool{"streamingLinks": true, "socials": true, "contact": true, "gallery": true}

// majorEditKeys are details fields whose change is significant enough to
// re-queue a previously-approved listing for curator review (spec §8.2/§17.3).
// Minor edits (links, opening hours, contact info, booking URL) stay live.
// The opportunity eligibility and safeguarding terms are major: a mentorship
// must never quietly open to younger children or drop its safeguarding policy.
var majorEditKeys = map[string]bool{
	"bio": true, "description": true, "lifeStory": true, "epitaph": true,
	"releases": true,
	"text":     true, "whyNotable": true, "eligibility": true, "services": true,
	"address": true, "area": true, "offerType": true, "propertyType": true,
	"category": true, "categories": true,
	"startsAt": true, "endsAt": true, "venue": true, "organiser": true,
	"eventFormat": true, "audience": true, "admission": true, "tiers": true,
	"highlights": true, "featuredGuests": true, "ageGuidance": true,
	"pricePesewas": true, "pricePeriod": true, "depositPesewas": true,
	"bedrooms": true, "bathrooms": true, "furnished": true, "amenities": true,
	"kind": true, "safeguardingPolicyUrl": true, "minAge": true, "maxAge": true, "guardianConsentRequired": true,
}

// guardDetailValue applies the URL guard a details key needs, if any.
func guardDetailValue(key string, v any) any {
	switch {
	case urlDetailKeys[key]:
		if s, ok := v.(string); ok {
			return safeURL(s)
		}
	case linkListKeys[key]:
		return sanitizeLinkList(v)
	}
	return v
}

// submittedDetails copies a new listing's details without any system key and,
// except for property (whose cleaner validates links strictly and reports bad
// ones), with every link URL-guarded.
func submittedDetails(typ string, in map[string]any) map[string]any {
	out := make(map[string]any, len(in))
	for k, v := range in {
		if systemDetailKeys[k] {
			continue
		}
		if typ != domain.TypeProperty {
			v = guardDetailValue(k, v)
		}
		out[k] = v
	}
	return out
}

// ownerEditedDetails merges an owner's edit into the stored details. The edit
// fully replaces the whitelisted keys (one the client omits is cleared), while
// every stored key outside the whitelist — system counters, entitlements,
// editorial and festival data, keys from other clients — is carried over.
func ownerEditedDetails(typ string, stored, edit map[string]any) map[string]any {
	allow := editableDetailsKeys[typ]
	details := make(map[string]any, len(stored)+len(edit))
	for k, v := range stored {
		if !allow[k] {
			details[k] = v
		}
	}
	for k, v := range edit {
		if allow[k] {
			details[k] = guardDetailValue(k, v)
		}
	}
	return details
}

// carrySystemDetails copies every system key of the stored details onto
// details (used after a type cleaner rebuilt the map from scratch).
func carrySystemDetails(details, stored map[string]any) {
	for k, v := range stored {
		if systemDetailKeys[k] {
			details[k] = v
		}
	}
}

// canonicalDetail rewrites a details value into the shape a JSON request
// decodes to — map[string]any, []any, float64, string, bool or nil — so a value
// read back from MongoDB (bson.A arrays, bson.D documents, int32/int64 numbers,
// typed seed structs) compares equal to the same value arriving in an HTTP
// payload. Empty strings, lists and objects become nil: an absent key and an
// empty one mean the same thing to a reader.
func canonicalDetail(v any) any {
	return canonicalValue(reflect.ValueOf(v))
}

func canonicalValue(rv reflect.Value) any {
	rv = indirectPropertyValue(rv)
	if !rv.IsValid() {
		return nil
	}
	switch rv.Kind() {
	case reflect.String:
		if rv.Len() == 0 {
			return nil
		}
		return rv.String()
	case reflect.Bool:
		return rv.Bool()
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return float64(rv.Int())
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return float64(rv.Uint())
	case reflect.Float32, reflect.Float64:
		return rv.Float()
	case reflect.Map:
		return canonicalMap(rv)
	case reflect.Slice, reflect.Array:
		return canonicalSlice(rv)
	case reflect.Struct:
		return canonicalStruct(rv)
	default:
		return rv.Interface()
	}
}

func canonicalMap(rv reflect.Value) any {
	if rv.Len() == 0 {
		return nil
	}
	out := make(map[string]any, rv.Len())
	iter := rv.MapRange()
	for iter.Next() {
		out[fmt.Sprint(iter.Key().Interface())] = canonicalValue(iter.Value())
	}
	return out
}

func canonicalSlice(rv reflect.Value) any {
	if rv.Len() == 0 {
		return nil
	}
	if isKeyValueSlice(rv) { // bson.D — an ordered document
		out := make(map[string]any, rv.Len())
		for i := 0; i < rv.Len(); i++ {
			e := rv.Index(i)
			out[e.FieldByName("Key").String()] = canonicalValue(e.FieldByName("Value"))
		}
		return out
	}
	out := make([]any, rv.Len())
	for i := range out {
		out[i] = canonicalValue(rv.Index(i))
	}
	return out
}

// canonicalStruct turns a typed value (e.g. a seeded []SocialLink) into the
// generic JSON shape by round-tripping it through encoding/json.
func canonicalStruct(rv reflect.Value) any {
	raw, err := json.Marshal(rv.Interface())
	if err != nil {
		return rv.Interface()
	}
	var generic any
	if err := json.Unmarshal(raw, &generic); err != nil {
		return rv.Interface()
	}
	return canonicalValue(reflect.ValueOf(generic))
}

// isKeyValueSlice reports whether rv is a slice of {Key string; Value any}
// structs — the Mongo driver's ordered-document type — without importing it.
func isKeyValueSlice(rv reflect.Value) bool {
	elem := rv.Type().Elem()
	if elem.Kind() != reflect.Struct {
		return false
	}
	key, hasKey := elem.FieldByName("Key")
	_, hasValue := elem.FieldByName("Value")
	return hasKey && hasValue && key.Type.Kind() == reflect.String
}

// majorDetailsChange reports whether any major content key differs between
// the stored and the edited details, comparing canonical forms.
func majorDetailsChange(baseline, details map[string]any) bool {
	for k := range majorEditKeys {
		if !reflect.DeepEqual(canonicalDetail(baseline[k]), canonicalDetail(details[k])) {
			return true
		}
	}
	return false
}

// detailStrings collects the text in a details map (nested lists and objects
// included) for the content screen. Bounded so a huge payload costs little.
func detailStrings(details map[string]any) []string {
	out := []string{}
	var walk func(v any)
	walk = func(v any) {
		if len(out) >= 200 {
			return
		}
		switch x := canonicalDetail(v).(type) {
		case string:
			out = append(out, x)
		case []any:
			for _, item := range x {
				walk(item)
			}
		case map[string]any:
			for _, item := range x {
				walk(item)
			}
		}
	}
	for _, v := range details {
		walk(v)
	}
	return out
}

// Owner-edit audit actions (ModerationRecord.Action).
const (
	editKindMinor = "owner-edit-minor"
	editKindMajor = "owner-edit-major"
)

func (s *Service) UpdateOwnerListing(ctx context.Context, actor *domain.Member, listingID string, in OwnerEditInput) (*domain.Listing, error) {
	l, err := s.editableListing(ctx, actor, listingID)
	if err != nil {
		return nil, err
	}
	title := strings.TrimSpace(in.Title)
	if len(title) < 2 || len(title) > 160 {
		return nil, fmt.Errorf("title must be 2–160 characters")
	}
	details, err := ownerEditDetails(l, in.Details)
	if err != nil {
		return nil, err
	}
	// Screen only what the edit introduces: text a curator already approved
	// must not re-queue the listing on every later edit.
	flags := newScreenReasons(
		ScreenTerms(append([]string{l.Title}, detailStrings(l.Details)...)...),
		ScreenTerms(append([]string{title}, detailStrings(details)...)...),
	)
	now := time.Now().UTC().Format(time.RFC3339)
	status, submittedAt, editKind := ownerEditStatus(l, title, details, len(flags) > 0, now)

	if err := s.listings.OwnerUpdate(ctx, l.ID, title, safeURL(strings.TrimSpace(in.CoverImageURL)), details, status, submittedAt); err != nil {
		return nil, err
	}
	rec := domain.ModerationRecord{
		ID:          newID(domain.PrefixModeration),
		ListingID:   l.ID,
		ModeratorID: actor.ID,
		Action:      editKind,
		CreatedAt:   now,
	}
	if len(flags) > 0 {
		if err := s.listings.SetScreenFlags(ctx, l.ID, flags); err != nil {
			return nil, err
		}
		rec.Reason = "content screen: " + strings.Join(flags, ", ")
	}
	if err := s.mod.Insert(ctx, rec); err != nil {
		return nil, err
	}
	return s.listings.GetByID(ctx, l.ID)
}

// editableListing loads a listing the actor may edit: its owner, or a
// curator or steward.
func (s *Service) editableListing(ctx context.Context, actor *domain.Member, listingID string) (*domain.Listing, error) {
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
	return l, nil
}

// ownerEditDetails builds the details an edit stores: the whitelisted keys
// from the edit (URL-guarded, cleaned and validated for the type, the
// mentorship safeguarding gate included) on top of everything the owner
// can't edit, with every system key carried over from the stored listing.
func ownerEditDetails(l *domain.Listing, edit map[string]any) (map[string]any, error) {
	details, err := cleanTypedDetails(l.Type, ownerEditedDetails(l.Type, l.Details, edit))
	if err != nil {
		return nil, err
	}
	// A type cleaner may rebuild the map (property does), so restore the
	// system keys afterwards.
	carrySystemDetails(details, l.Details)
	if l.Type == domain.TypeMemorial {
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
	return details, nil
}

// cleanTypedDetails runs the per-type cleaners and validators shared by
// Submit and the owner edit.
func cleanTypedDetails(typ string, details map[string]any) (map[string]any, error) {
	switch typ {
	case domain.TypeProperty:
		return cleanPropertyDetails(details)
	case domain.TypeArtist:
		return cleanArtistDetails(details), nil
	case domain.TypeEvent:
		if err := validateEventRange(details); err != nil {
			return nil, err
		}
		return cleanEventDetails(details)
	case domain.TypeOpportunity:
		if err := validateOpportunityDetails(details); err != nil {
			return nil, err
		}
	}
	return details, nil
}

// ownerEditStatus applies the status policy (spec §8.2/§17.3):
//   - draft/rejected/unpublished → pending (re-queue)
//   - pending → stays pending
//   - approved → stays live for minor edits; re-queues for major ones.
//
// A "major" edit is a title change, a change to significant content keys (bio,
// description, lifeStory, the opportunity safeguarding terms… — see
// majorEditKeys) or new text the content screen flags. Link, hours, contact and
// image changes are otherwise minor and stay live. It returns the new status,
// the new submittedAt ("" = unchanged) and the audit action.
func ownerEditStatus(l *domain.Listing, title string, details map[string]any, flagged bool, now string) (string, string, string) {
	switch l.Status {
	case domain.StatusApproved:
		if title == l.Title && !flagged && !majorDetailsChange(approvedBaseline(l), details) {
			return l.Status, "", editKindMinor
		}
		return domain.StatusPending, now, editKindMajor
	case domain.StatusPending:
		return l.Status, "", editKindMinor
	default:
		return domain.StatusPending, now, editKindMajor
	}
}

// approvedBaseline is the stored details to compare an edit against. Property
// details are cleaned first so the canonical shapes (deduped amenities,
// normalised enums) line up with the cleaned edit.
func approvedBaseline(l *domain.Listing) map[string]any {
	if l.Type == domain.TypeProperty {
		if cleaned, err := cleanPropertyDetails(l.Details); err == nil {
			return cleaned
		}
	}
	return l.Details
}

// newScreenReasons returns the screen reasons in after that before did not
// already have.
func newScreenReasons(before, after ScreenVerdict) []string {
	seen := map[string]bool{}
	for _, r := range before.Reasons {
		seen[r] = true
	}
	var out []string
	for _, r := range after.Reasons {
		if !seen[r] {
			out = append(out, r)
		}
	}
	return out
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

// cleanArtistDetails keeps the artist profile extensible while applying the
// same stored-link safety guard to platform links and nested release artwork.
// Platform labels are deliberately not whitelisted: artists may add every
// service they use now, including new services that launch later.
func cleanArtistDetails(details map[string]any) map[string]any {
	for _, key := range []string{"link", "booking"} {
		if raw, ok := details[key].(string); ok {
			details[key] = safeURL(raw)
		}
	}
	for _, key := range []string{"streamingLinks", "socials"} {
		if raw, ok := details[key]; ok {
			details[key] = sanitizeLinkList(raw)
		}
	}
	if raw, ok := details["releases"]; ok {
		details["releases"] = sanitizeArtistReleases(raw)
	}
	return details
}

func sanitizeArtistReleases(v any) []any {
	items, ok := v.([]any)
	if !ok {
		return []any{}
	}
	out := make([]any, 0, len(items))
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		title := strings.TrimSpace(asStringAny(m["title"]))
		if title == "" {
			continue
		}
		release := map[string]any{"title": title}
		for _, key := range []string{"id", "kind", "description"} {
			if value := strings.TrimSpace(asStringAny(m[key])); value != "" {
				release[key] = value
			}
		}
		for _, key := range []string{"coverImageUrl", "url"} {
			if value := safeURL(asStringAny(m[key])); value != "" {
				release[key] = value
			}
		}
		if year, ok := asIntAny(m["year"]); ok && year >= 1900 && year <= 2100 {
			release["year"] = year
		}
		if tracks, ok := m["tracks"].([]any); ok {
			cleanTracks := make([]any, 0, len(tracks))
			for _, track := range tracks {
				trackMap, ok := track.(map[string]any)
				if !ok {
					continue
				}
				if trackTitle := strings.TrimSpace(asStringAny(trackMap["title"])); trackTitle != "" {
					cleanTracks = append(cleanTracks, map[string]any{"title": trackTitle})
				}
			}
			if len(cleanTracks) > 0 {
				release["tracks"] = cleanTracks
			}
		}
		out = append(out, release)
	}
	return out
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
