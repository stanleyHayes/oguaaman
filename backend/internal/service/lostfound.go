package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── lost & found: lost items, found items, missing people ────────────────────
//
// Notices auto-publish (time-critical, especially for missing people; D3)
// unless the content screen flags the text, which waits for a curator.
// Curators are alerted to every missing person and every held notice, and
// review auto-published notices afterwards (postReviewDueAt). The poster's
// contact is private (D3): the public reaches the poster through
// ContactLostFoundPoster instead.

var validLostFoundKinds = map[string]bool{
	"lost_item": true, "found_item": true, "missing_person": true,
}

// The resolution lifecycle a notice can be closed with (it opens as "open").
var validLostFoundStatuses = map[string]bool{
	domain.LostFoundStatusReunited: true, domain.LostFoundStatusClosed: true,
}

// Lost & found field limits.
const (
	kindMissingPerson             = "missing_person"
	notificationKindLostFound     = "lostfound"
	maxLostFoundDescriptionRunes  = 4000
	maxLostFoundLocationRunes     = 160
	maxLostFoundContactRunes      = 200
	maxLostFoundMessageRunes      = 1000
	lostFoundAdminLink            = "/lost-found"
	lostFoundResolvedByPosterNote = "resolved"
)

// LostFoundInput is a member's notice (kind validated below).
type LostFoundInput struct {
	Title            string `json:"title"`
	Kind             string `json:"kind"`
	Description      string `json:"description"`
	LastSeenLocation string `json:"lastSeenLocation"`
	LastSeenDate     string `json:"lastSeenDate"`
	Contact          string `json:"contact"`
	CoverImageURL    string `json:"coverImageUrl"`
	// Missing person notices (G087): whether the missing person is under 18
	// and, if so, the poster's attestation that they are the child's parent
	// or guardian (or act with the family's consent) and their relation.
	SubjectIsMinor      bool   `json:"subjectIsMinor"`
	GuardianAttestation bool   `json:"guardianAttestation"`
	GuardianRelation    string `json:"guardianRelation"`
	PoliceReference     string `json:"policeReference"`
}

// LostFoundFilters narrows the lost & found feed; empty fields are ignored.
type LostFoundFilters struct {
	Kind   string // details.kind
	Status string // details.lfStatus
}

func (in *LostFoundInput) normalise() error {
	in.Title = strings.TrimSpace(in.Title)
	in.Description = strings.TrimSpace(in.Description)
	in.LastSeenLocation = strings.TrimSpace(in.LastSeenLocation)
	in.LastSeenDate = strings.TrimSpace(in.LastSeenDate)
	in.Contact = strings.TrimSpace(in.Contact)
	in.CoverImageURL = safeURL(strings.TrimSpace(in.CoverImageURL))
	switch {
	case !validLostFoundKinds[in.Kind]:
		return fmt.Errorf("choose a valid notice kind")
	case len(in.Title) < 2 || len(in.Title) > 160:
		return fmt.Errorf("title must be 2–160 characters")
	case in.Description == "":
		return fmt.Errorf("a description is required — who or what, and how to recognise them")
	case runeLen(in.Description) > maxLostFoundDescriptionRunes:
		return fmt.Errorf("please keep the description under %d characters", maxLostFoundDescriptionRunes)
	case runeLen(in.LastSeenLocation) > maxLostFoundLocationRunes:
		return fmt.Errorf("please keep the location under %d characters", maxLostFoundLocationRunes)
	case in.Contact == "":
		return fmt.Errorf("a contact is required so people can reach you")
	case runeLen(in.Contact) > maxLostFoundContactRunes:
		return fmt.Errorf("please keep the contact under %d characters", maxLostFoundContactRunes)
	}
	return in.normaliseMissingPerson()
}

// normaliseMissingPerson checks the safeguards on a missing-person notice.
func (in *LostFoundInput) normaliseMissingPerson() error {
	in.GuardianRelation = strings.TrimSpace(in.GuardianRelation)
	in.PoliceReference = strings.TrimSpace(in.PoliceReference)
	if in.Kind != kindMissingPerson {
		in.SubjectIsMinor, in.GuardianAttestation, in.GuardianRelation, in.PoliceReference = false, false, "", ""
		return nil
	}
	switch {
	case in.SubjectIsMinor && (!in.GuardianAttestation || in.GuardianRelation == ""):
		return fmt.Errorf("for a missing child, confirm you are their parent or guardian (or act with the family's consent) and say how you are related")
	case runeLen(in.GuardianRelation) > 60 || runeLen(in.PoliceReference) > 80:
		return fmt.Errorf("please keep the relation and police reference short")
	}
	return nil
}

// SubmitLostFound posts a lost & found notice. It auto-publishes (approved,
// published now) with lfStatus=open, and the owner or a curator resolves it
// afterwards (D3). Only a notice the content screen flags is saved pending
// with Held set until a curator reviews it.
func (s *Service) SubmitLostFound(ctx context.Context, member *domain.Member, in LostFoundInput) (*domain.Listing, error) {
	if member == nil {
		// Same guard as SubmitIncident: refuse an anonymous notice.
		return nil, fmt.Errorf("a signed-in member is required to post a lost & found notice")
	}
	if err := in.normalise(); err != nil {
		return nil, err
	}
	// Flagged text (threats and slurs included) waits for a curator rather
	// than being refused: the notice may be quoting someone.
	verdict := ScreenText(in.Title, in.Description, in.LastSeenLocation)
	l := newLostFoundListing(member, in, verdict.Flagged(), verdict.Reasons)
	if err := s.listings.Insert(ctx, l); err != nil {
		return nil, err
	}
	if l.Held || in.Kind == kindMissingPerson {
		s.notifyCuratorsOfNotice(ctx, &l)
	}
	return &l, nil
}

func newLostFoundListing(member *domain.Member, in LostFoundInput, held bool, flags []string) domain.Listing {
	now := time.Now().UTC().Format(time.RFC3339)
	suffix := fmt.Sprintf("%d", time.Now().UnixNano()%1_000_000)
	l := domain.Listing{
		ID:            "lf-" + slugify(in.Title) + "-" + suffix,
		Slug:          slugify(in.Title) + "-" + suffix,
		Type:          domain.TypeLostFound,
		OwnerID:       member.ID,
		Title:         in.Title,
		Status:        domain.StatusApproved, // auto-published: time-critical
		Tags:          []string{"lost-found", in.Kind},
		TownID:        member.TownID,
		CoverImageURL: in.CoverImageURL,
		CreatedAt:     now,
		SubmittedAt:   now,
		PublishedAt:   now,
		ScreenFlags:   flags,
		Details: map[string]any{
			"kind":             in.Kind,
			"description":      in.Description,
			"lastSeenLocation": in.LastSeenLocation,
			"lastSeenDate":     in.LastSeenDate,
			"contact":          in.Contact,
			"lfStatus":         domain.LostFoundStatusOpen,
		},
	}
	if in.Kind == kindMissingPerson {
		l.Details["subjectIsMinor"] = in.SubjectIsMinor
		if in.SubjectIsMinor {
			l.Details["guardianRelation"] = in.GuardianRelation
			l.Details["guardianAttestedAt"] = now
		}
		if in.PoliceReference != "" {
			l.Details["policeReference"] = in.PoliceReference
		}
	}
	if held {
		l.Status, l.PublishedAt, l.Held = domain.StatusPending, "", true
	} else {
		l.Details["postReviewDueAt"] = postReviewDue()
	}
	return l
}

// notifyCuratorsOfNotice alerts every curator, steward and moderator to a
// missing person or to a notice waiting for review: in-app, by email /
// WhatsApp and by push. Runs off the request path.
func (s *Service) notifyCuratorsOfNotice(_ context.Context, l *domain.Listing) {
	title := "Missing person alert"
	body := fmt.Sprintf("“%s” was posted. Spread the word and help coordinate the search.", l.Title)
	pushTitle := "Missing person notice posted"
	if l.Held {
		title = "A lost & found notice is waiting for review"
		body = fmt.Sprintf("“%s” is held until a curator reviews it.", l.Title)
		pushTitle = "Lost & found notice needs review"
	}
	push := PushPayload{Title: pushTitle, Body: "Open Oguaa to review it.", URL: lostFoundAdminLink + "/" + l.Slug,
		Tag: "lostfound-staff-" + l.ID, Kind: notificationKindLostFound}
	incidentFanOut(func() {
		bg := context.Background()
		staff := s.safetyStaffIDs(bg)
		for _, id := range staff {
			if s.notifs != nil {
				_ = s.notifs.Insert(bg, domain.Notification{
					ID:       "ntf-" + fmt.Sprintf("%d-%s", time.Now().UnixNano(), id),
					MemberID: id, Kind: notificationKindLostFound,
					Title: title, Body: body, Link: lostFoundAdminLink,
					CreatedAt: time.Now().UTC().Format(time.RFC3339),
				})
			}
			s.notifyOutOfBandAs(bg, id, notificationKindLostFound, title, body, push.URL)
		}
		if s.push != nil && len(staff) > 0 {
			s.push.SendToMembers(bg, staff, push)
		}
	})
}

// LostFound lists approved lost & found notices for viewer, newest first, with
// optional filters on the kind and the resolution lifecycle status. Notices
// by a member in a block with the viewer are left out, and the poster's
// details are removed unless the viewer may see them (D3).
func (s *Service) LostFound(ctx context.Context, viewer *domain.Member, f LostFoundFilters) ([]domain.Listing, error) {
	items, err := s.approved(ctx, domain.TypeLostFound)
	if err != nil {
		return nil, err
	}
	out := []domain.Listing{}
	for _, l := range items {
		if f.Kind != "" && asString(l.Details, "kind") != f.Kind {
			continue
		}
		if f.Status != "" && asString(l.Details, "lfStatus") != f.Status {
			continue
		}
		out = append(out, l)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return s.ViewListings(ctx, viewer, out), nil
}

// LostFoundBySlug fetches one lost & found notice by slug, as viewer may see
// it: a published one for anyone, a held or withdrawn one only for its poster
// and safety staff.
func (s *Service) LostFoundBySlug(ctx context.Context, viewer *domain.Member, slug string) (*domain.Listing, error) {
	return s.safetyPostBySlug(ctx, viewer, domain.TypeLostFound, slug)
}

// ResolveLostFound closes a notice as reunited or closed, whatever its status.
// Only the person who posted it or a curator/steward may resolve it. A
// resolved missing-person notice is also unpublished: once the person is
// found, their photo and description should not stay public. A notice still
// held for review is unpublished too, so it can't be approved after the fact.
func (s *Service) ResolveLostFound(ctx context.Context, listingID string, actor *domain.Member, newStatus string) error {
	if actor == nil {
		return &domain.ForbiddenError{Reason: "a signed-in member is required to resolve a lost & found notice"}
	}
	if !validLostFoundStatuses[newStatus] {
		return fmt.Errorf("invalid lost & found status %q", newStatus)
	}
	l, err := s.listings.GetByID(ctx, listingID)
	if err != nil {
		return err
	}
	if l.Type != domain.TypeLostFound {
		return &domain.NotFoundError{Entity: "lost & found notice"}
	}
	if actor.ID != l.OwnerID && actor.Role != domain.RoleCurator && actor.Role != domain.RoleSteward {
		return &domain.ForbiddenError{Reason: "only the person who posted the notice or a curator can resolve it"}
	}
	if err := s.listings.SetLostFoundStatus(ctx, listingID, newStatus); err != nil {
		return err
	}
	if (asString(l.Details, "kind") == kindMissingPerson || l.Status == domain.StatusPending) && l.Status != domain.StatusUnpublished {
		return s.listings.UpdateStatus(ctx, listingID, domain.StatusUnpublished, actor.ID, lostFoundResolvedByPosterNote, time.Now().UTC().Format(time.RFC3339))
	}
	return nil
}

// ContactLostFoundPoster relays a message to the member who posted an open
// lost & found notice. The poster's own contact stays private (D3); they get
// the message in-app and by email / WhatsApp, with a link to the sender's
// profile, and decide whether to reply. The sender may include their own
// number in the message.
func (s *Service) ContactLostFoundPoster(ctx context.Context, sender *domain.Member, slug, message string) error {
	if sender == nil {
		return &domain.ForbiddenError{Reason: "sign in to contact the person who posted this notice"}
	}
	message = strings.TrimSpace(message)
	if message == "" || runeLen(message) > maxLostFoundMessageRunes {
		return fmt.Errorf("write a message of up to %d characters", maxLostFoundMessageRunes)
	}
	if err := screenRefusal(ScreenTerms(message), "message"); err != nil {
		return err
	}
	l, err := s.ListingBySlug(ctx, domain.TypeLostFound, slug)
	if err != nil {
		return err
	}
	switch {
	case l.OwnerID == sender.ID:
		return fmt.Errorf("this is your own notice")
	case asString(l.Details, "lfStatus") != domain.LostFoundStatusOpen:
		return fmt.Errorf("this notice has been resolved")
	case s.BlockedBetween(ctx, sender, l.OwnerID):
		return &domain.ForbiddenError{Reason: "you can't contact this member"}
	}
	name := strings.TrimSpace(sender.DisplayName)
	if name == "" {
		name = "A member of the community"
	}
	title := fmt.Sprintf("A message about “%s”", l.Title)
	body := fmt.Sprintf("%s wrote: %s", name, message)
	link := lostFoundAdminLink + "/" + l.Slug
	if sender.Slug != "" {
		link = "/members/" + sender.Slug
	}
	s.notify(ctx, l.OwnerID, notificationKindLostFound, title, body, link)
	return nil
}
