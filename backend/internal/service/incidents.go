package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── incidents: community safety — rescue & early recovery ────────────────────
//
// Safety policy (DECISIONS D3):
//   - crime and medical reports can name, accuse or expose people, so they are
//     never auto-published: they wait for a curator ("held"). So does any
//     report the content screen holds. Other categories auto-publish.
//   - A severe report alerts the whole town (in-app notice + push) only when
//     the reporter has a verified phone and is in good standing; otherwise only
//     curators are alerted, and the town-wide alert goes out when a curator
//     verifies the incident.
//   - The critical "ringing" push is sent only after curator verification.
//   - Alert text is generic ("Safety alert near {area}" / "{Category}
//     reported. Open Oguaa for details.") — never the member's own words or
//     contact details.
//   - Public JSON never carries the reporter's contact, member id or the ids
//     of the staff who updated the incident; the reporter and staff see them.

var validIncidentCategories = map[string]bool{
	"flood": true, "fire": true, "accident": true, "medical": true,
	"crime": true, "utility": true, "other": true,
}

// heldIncidentCategories are never auto-published (D3).
var heldIncidentCategories = map[string]bool{"crime": true, "medical": true}

// incidentCategoryLabels name each category in alert text.
var incidentCategoryLabels = map[string]string{
	"flood": "Flooding", "fire": "Fire", "accident": "Accident", "medical": "Medical emergency",
	"crime": "Crime", "utility": "Utility problem", "other": "Incident",
}

var validIncidentSeverities = map[string]bool{
	"low": true, "medium": true, "high": true, "critical": true,
}

// The operational lifecycle an incident moves through. Curators verify and
// transition it after the (time-critical) auto-publish, or retract it.
var validIncidentStatuses = map[string]bool{
	domain.IncidentStatusReported: true, domain.IncidentStatusVerified: true, domain.IncidentStatusResponding: true,
	domain.IncidentStatusResolved: true, domain.IncidentStatusRecovered: true, domain.IncidentStatusRetracted: true,
}

// Incident field limits.
const (
	maxIncidentLocationRunes    = 160
	maxIncidentDescriptionRunes = 4000
	maxIncidentContactRunes     = 200
	incidentAlertAreaRunes      = 60
	severityCritical            = "critical"
	notificationKindIncident    = "incident"
	safetyPathPrefix            = "/safety/"
	incidentAdminLink           = "/incidents"
)

// incidentFanOut runs the town-wide fan-out (every member, every device) off
// the request path so it never delays the time-critical response. Tests swap
// it for a synchronous runner.
var incidentFanOut = func(f func()) { go f() }

// IncidentInput is a member's safety report (category/severity validated below).
type IncidentInput struct {
	Title       string `json:"title"`
	Category    string `json:"category"`
	Severity    string `json:"severity"`
	Location    string `json:"location"`
	Contact     string `json:"contact"`
	Description string `json:"description"`
}

// IncidentFilters narrows the incident feed; empty fields are ignored.
type IncidentFilters struct {
	Status   string // details.incidentStatus
	Category string // details.category
	Town     string // townId
}

// normalise trims the input and enforces the field rules.
func (in *IncidentInput) normalise() error {
	in.Title = strings.TrimSpace(in.Title)
	in.Location = strings.TrimSpace(in.Location)
	in.Contact = strings.TrimSpace(in.Contact)
	in.Description = strings.TrimSpace(in.Description)
	switch {
	case !validIncidentCategories[in.Category]:
		return fmt.Errorf("choose a valid incident category")
	case !validIncidentSeverities[in.Severity]:
		return fmt.Errorf("choose a valid incident severity")
	case len(in.Title) < 2 || len(in.Title) > 160:
		return fmt.Errorf("title must be 2–160 characters")
	case in.Location == "":
		return fmt.Errorf("a location is required so responders can find the incident")
	case runeLen(in.Location) > maxIncidentLocationRunes:
		return fmt.Errorf("please keep the location under %d characters", maxIncidentLocationRunes)
	case runeLen(in.Description) > maxIncidentDescriptionRunes:
		return fmt.Errorf("please keep the description under %d characters", maxIncidentDescriptionRunes)
	case runeLen(in.Contact) > maxIncidentContactRunes:
		return fmt.Errorf("please keep the contact under %d characters", maxIncidentContactRunes)
	}
	return nil
}

func runeLen(s string) int { return len([]rune(s)) }

// SubmitIncident files a safety report. An incident is time-critical: unless
// its category or the content screen holds it for a curator, it auto-publishes
// (approved, published now) with incidentStatus=reported, and curators
// verify/transition it afterwards. A held report is saved as pending with
// Held set (K12: the response carries status "pending" and held: true).
func (s *Service) SubmitIncident(ctx context.Context, member *domain.Member, in IncidentInput) (*domain.Listing, error) {
	if member == nil {
		// Same guard as Submit: the owner is the signed-in member, attributed by
		// the delivery layer. Refuse rather than write an anonymous safety report.
		return nil, fmt.Errorf("a signed-in member is required to report an incident")
	}
	if err := in.normalise(); err != nil {
		return nil, err
	}
	// Anything the screen flags waits for a curator — threats and slurs too:
	// a victim reporting a threat may be quoting it, so it is never refused.
	verdict := ScreenText(in.Title, in.Location, in.Description)
	l := newIncidentListing(member, in, heldIncidentCategories[in.Category] || verdict.Flagged(), verdict.Reasons)
	if err := s.listings.Insert(ctx, l); err != nil {
		return nil, err
	}
	switch {
	case l.Held:
		s.notifyCuratorsOfIncident(ctx, &l)
	case severeIncident(&l):
		s.notifyCuratorsOfIncident(ctx, &l)
		if trustedReporter(member) {
			s.broadcastIncident(ctx, &l, false)
		}
	}
	return &l, nil
}

func newIncidentListing(member *domain.Member, in IncidentInput, held bool, flags []string) domain.Listing {
	now := time.Now().UTC().Format(time.RFC3339)
	suffix := fmt.Sprintf("%d", time.Now().UnixNano()%1_000_000)
	l := domain.Listing{
		ID:          "inc-" + slugify(in.Title) + "-" + suffix,
		Slug:        slugify(in.Title) + "-" + suffix,
		Type:        domain.TypeIncident,
		OwnerID:     member.ID,
		Title:       in.Title,
		Status:      domain.StatusApproved, // auto-published: time-critical
		Tags:        []string{"safety", in.Category},
		TownID:      member.TownID,
		CreatedAt:   now,
		SubmittedAt: now,
		PublishedAt: now,
		ScreenFlags: flags,
		Details: map[string]any{
			"category":       in.Category,
			"severity":       in.Severity,
			"location":       in.Location,
			"contact":        in.Contact,
			"incidentStatus": domain.IncidentStatusReported,
			"statusHistory": []map[string]any{
				{"status": domain.IncidentStatusReported, "by": member.ID, "note": "Incident reported", "at": now},
			},
			"description": in.Description,
		},
	}
	if held {
		l.Status, l.PublishedAt, l.Held = domain.StatusPending, "", true
	} else {
		l.Details["postReviewDueAt"] = postReviewDue()
	}
	return l
}

func severeIncident(l *domain.Listing) bool {
	sev := asString(l.Details, "severity")
	return sev == "high" || sev == severityCritical
}

// trustedReporter reports whether a member's report may alert the whole town
// straight away: a verified phone and good standing (D3).
func trustedReporter(m *domain.Member) bool {
	return m != nil && m.PhoneVerified && !m.Suspended
}

// incidentAlertText is the generic, town-wide alert: the area and category
// only — never the member's title, description or contact (D3, Apple 4.5.4).
func incidentAlertText(l *domain.Listing) (title, body string) {
	title = "Safety alert"
	if area := alertArea(asString(l.Details, "location")); area != "" {
		title = "Safety alert near " + area
	}
	label := incidentCategoryLabels[asString(l.Details, "category")]
	if label == "" {
		label = incidentCategoryLabels["other"]
	}
	return title, label + " reported. Open Oguaa for details."
}

// alertArea collapses whitespace and shortens a location for an alert title.
func alertArea(location string) string {
	area := []rune(strings.Join(strings.Fields(location), " "))
	if len(area) > incidentAlertAreaRunes {
		return strings.TrimSpace(string(area[:incidentAlertAreaRunes-1])) + "…"
	}
	return string(area)
}

// incidentPushPayload is the push for a town-wide alert. Ring (the critical,
// call-like alert) is only ever set for a curator-verified critical incident.
func incidentPushPayload(l *domain.Listing, ring bool) PushPayload {
	title, body := incidentAlertText(l)
	return PushPayload{
		Title: title, Body: body, URL: safetyPathPrefix + l.Slug, Tag: "incident-" + l.ID,
		Severity: asString(l.Details, "severity"), Kind: notificationKindIncident, Ring: ring,
	}
}

// broadcastIncident alerts the whole town to a severe incident: an in-app
// notice to every member plus a push. It is sent at most once per incident
// (ClaimIncidentAlert); when it has already gone out and ring is set, only
// the ringing push follows. Members in a block with the reporter get no
// in-app notice.
func (s *Service) broadcastIncident(ctx context.Context, l *domain.Listing, ring bool) {
	now := time.Now().UTC().Format(time.RFC3339)
	won, err := s.listings.ClaimIncidentAlert(ctx, l.ID, domain.IncidentAlertBroadcast, now)
	if err != nil {
		s.log.Warn("incident alert claim failed", "listingId", l.ID, "err", err)
		return
	}
	if !won {
		if ring {
			s.ringIncident(ctx, l)
		}
		return
	}
	if ring {
		// The first alert rings, so no separate ringing push follows.
		_, _ = s.listings.ClaimIncidentAlert(ctx, l.ID, domain.IncidentAlertRing, now)
	}
	title, body := incidentAlertText(l)
	s.fanOutIncidentNotice(ctx, l, title, body)
	if s.push != nil {
		payload := incidentPushPayload(l, ring)
		incidentFanOut(func() { s.push.BroadcastAll(context.Background(), payload) })
	}
}

// ringIncident sends the critical ringing push for an incident that was
// already alerted without it (a verified reporter's report, now verified).
func (s *Service) ringIncident(ctx context.Context, l *domain.Listing) {
	won, err := s.listings.ClaimIncidentAlert(ctx, l.ID, domain.IncidentAlertRing, time.Now().UTC().Format(time.RFC3339))
	if err != nil || !won || s.push == nil {
		return
	}
	payload := incidentPushPayload(l, true)
	incidentFanOut(func() { s.push.BroadcastAll(context.Background(), payload) })
}

// fanOutIncidentNotice writes an in-app notice about an incident to every
// member, except those in a block with its reporter.
func (s *Service) fanOutIncidentNotice(ctx context.Context, l *domain.Listing, title, body string) {
	if s.notifs == nil {
		return
	}
	hidden := s.hiddenFor(ctx, l.OwnerID)
	link := safetyPathPrefix + l.Slug
	incidentFanOut(func() {
		bg := context.Background()
		members, err := s.members.All(bg)
		if err != nil {
			return
		}
		for i := range members {
			m := &members[i]
			if _, blocked := hidden[m.ID]; blocked {
				continue
			}
			_ = s.notifs.Insert(bg, domain.Notification{
				ID:       "ntf-" + fmt.Sprintf("%d-%s", time.Now().UnixNano(), m.ID),
				MemberID: m.ID, Kind: notificationKindIncident,
				Title: title, Body: body, Link: link,
				CreatedAt: time.Now().UTC().Format(time.RFC3339),
			})
		}
	})
}

// isSafetyStaff reports whether a role triages incidents and reports.
func isSafetyStaff(role string) bool {
	return role == domain.RoleCurator || role == domain.RoleSteward || role == domain.RoleModerator
}

// notifyCuratorsOfIncident alerts every curator, steward and moderator to a
// severe or held incident: in-app, by email / WhatsApp and by push, so a held
// urgent report reaches staff who are not in the app. Runs off the request
// path: the full-member scan must not hold up the time-critical response.
func (s *Service) notifyCuratorsOfIncident(_ context.Context, l *domain.Listing) {
	title := "Urgent incident reported"
	body := fmt.Sprintf("“%s” (%s severity) was reported. Verify and coordinate response.", l.Title, asString(l.Details, "severity"))
	if l.Held {
		title = "An incident report is waiting for review"
		body = fmt.Sprintf("“%s” (%s, %s severity) is held until a curator reviews it.", l.Title, asString(l.Details, "category"), asString(l.Details, "severity"))
	}
	push := staffIncidentPush(l)
	incidentFanOut(func() {
		bg := context.Background()
		staff := s.safetyStaffIDs(bg)
		for _, id := range staff {
			if s.notifs != nil {
				_ = s.notifs.Insert(bg, domain.Notification{
					ID:       "ntf-" + fmt.Sprintf("%d-%s", time.Now().UnixNano(), id),
					MemberID: id, Kind: notificationKindIncident,
					Title: title, Body: body, Link: incidentAdminLink,
					CreatedAt: time.Now().UTC().Format(time.RFC3339),
				})
			}
			s.notifyOutOfBandAs(bg, id, notificationKindIncident, title, body, push.URL)
		}
		if s.push != nil && len(staff) > 0 {
			s.push.SendToMembers(bg, staff, push)
		}
	})
}

// safetyStaffIDs lists the ids of every curator, steward and moderator.
func (s *Service) safetyStaffIDs(ctx context.Context) []string {
	members, err := s.members.All(ctx)
	if err != nil {
		return nil
	}
	var ids []string
	for i := range members {
		if isSafetyStaff(members[i].Role) && !members[i].Suspended {
			ids = append(ids, members[i].ID)
		}
	}
	return ids
}

// staffIncidentPush is the push that tells safety staff an incident needs
// them. Like the town alert it carries the area and category only.
func staffIncidentPush(l *domain.Listing) PushPayload {
	_, body := incidentAlertText(l)
	title := "Incident needs review"
	if !l.Held {
		title = "Urgent incident reported"
	}
	if area := alertArea(asString(l.Details, "location")); area != "" {
		title += " near " + area
	}
	return PushPayload{
		Title: title, Body: body, URL: safetyPathPrefix + l.Slug, Tag: "incident-staff-" + l.ID,
		Severity: asString(l.Details, "severity"), Kind: notificationKindIncident,
	}
}

// Incidents lists approved incidents for viewer, newest first, with optional
// filters on the incident lifecycle status, category, and town. Incidents
// posted by a member in a block with the viewer are left out, and the
// reporter's details are removed unless viewer may see them.
func (s *Service) Incidents(ctx context.Context, viewer *domain.Member, f IncidentFilters) ([]domain.Listing, error) {
	items, err := s.approved(ctx, domain.TypeIncident)
	if err != nil {
		return nil, err
	}
	out := []domain.Listing{}
	for _, l := range items {
		if f.Status != "" && asString(l.Details, "incidentStatus") != f.Status {
			continue
		}
		if f.Category != "" && asString(l.Details, "category") != f.Category {
			continue
		}
		if f.Town != "" && l.TownID != f.Town {
			continue
		}
		out = append(out, l)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return s.ViewListings(ctx, viewer, out), nil
}

// Incident fetches one incident by slug, as viewer may see it: a published
// one for anyone, a held or withdrawn one only for its reporter and safety
// staff (see safetyPostBySlug).
func (s *Service) Incident(ctx context.Context, viewer *domain.Member, slug string) (*domain.Listing, error) {
	return s.safetyPostBySlug(ctx, viewer, domain.TypeIncident, slug)
}

// safetyPostBySlug fetches an incident or lost & found notice by slug for
// viewer. Everyone may read a published post; the reporter and safety staff
// may also read one at any other status (held for review, withdrawn), so the
// reporter can follow and close what they posted. Anyone else gets NotFound.
func (s *Service) safetyPostBySlug(ctx context.Context, viewer *domain.Member, typ, slug string) (*domain.Listing, error) {
	l, err := s.listings.GetBySlug(ctx, typ, slug)
	if err != nil {
		return nil, err
	}
	if l.Status != domain.StatusApproved && !canSeeReporter(viewer, l) {
		return nil, &domain.NotFoundError{Entity: typ}
	}
	return s.ViewListing(ctx, viewer, l)
}

// AdminIncidents lists incidents for safety staff: every live incident plus
// the held reports waiting for a curator, held first, then newest first. Staff
// see every report whole, whatever blocks they have.
func (s *Service) AdminIncidents(ctx context.Context, viewer *domain.Member) ([]domain.Listing, error) {
	if viewer == nil || !isSafetyStaff(viewer.Role) {
		return nil, &domain.ForbiddenError{Reason: "only curators and stewards can review incidents"}
	}
	live, err := s.listings.Find(ctx, domain.ListingFilter{Type: domain.TypeIncident, Status: domain.StatusApproved})
	if err != nil {
		return nil, err
	}
	pending, err := s.listings.Find(ctx, domain.ListingFilter{Type: domain.TypeIncident, Status: domain.StatusPending})
	if err != nil {
		return nil, err
	}
	out := make([]domain.Listing, 0, len(live)+len(pending))
	for _, l := range pending {
		if l.Held {
			out = append(out, l)
		}
	}
	out = append(out, live...)
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Held != out[j].Held {
			return out[i].Held
		}
		return out[i].CreatedAt > out[j].CreatedAt
	})
	return out, nil
}

// TransitionIncident moves an incident through its lifecycle (curator,
// steward or moderator), appending an audit entry to statusHistory.
//   - verified: a held report is published, and a severe one alerts the town
//     (a critical one rings) if it has not already.
//   - retracted: the incident is unpublished and, if it was alerted, a
//     correction goes to the same audience.
//   - resolved / recovered: the reporter is notified.
func (s *Service) TransitionIncident(ctx context.Context, listingID string, actor *domain.Member, newStatus, note string) error {
	if actor == nil || !isSafetyStaff(actor.Role) {
		return &domain.ForbiddenError{Reason: "only curators and stewards can update an incident's status"}
	}
	if !validIncidentStatuses[newStatus] {
		return fmt.Errorf("invalid incident status %q", newStatus)
	}
	l, err := s.listings.GetByID(ctx, listingID)
	if err != nil {
		return err
	}
	if l.Type != domain.TypeIncident {
		return &domain.NotFoundError{Entity: "incident"}
	}
	return s.applyIncidentStatus(ctx, l, actor, newStatus, note)
}

// applyIncidentStatus records a lifecycle step on an incident and runs what
// the step unlocks (see TransitionIncident). The moderation queue's approve
// goes through here too, so a held report approved there alerts the town
// exactly as verifying it on the Incidents page does.
func (s *Service) applyIncidentStatus(ctx context.Context, l *domain.Listing, actor *domain.Member, newStatus, note string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	entry := map[string]any{
		"status": newStatus,
		"by":     actor.ID,
		"note":   strings.TrimSpace(note),
		"at":     now,
	}
	if err := s.listings.UpdateIncidentStatus(ctx, l.ID, newStatus, entry); err != nil {
		return err
	}
	switch newStatus {
	case domain.IncidentStatusVerified:
		return s.verifyIncident(ctx, l, actor, now)
	case domain.IncidentStatusRetracted:
		return s.retractIncident(ctx, l, actor, now)
	case domain.IncidentStatusResolved, domain.IncidentStatusRecovered:
		s.notifyIncidentOwner(ctx, l, newStatus)
	}
	return nil
}

// verifyIncident publishes a held incident and sends the town-wide alert a
// curator's verification unlocks.
func (s *Service) verifyIncident(ctx context.Context, l *domain.Listing, actor *domain.Member, now string) error {
	if l.Status == domain.StatusPending {
		if err := s.listings.UpdateStatus(ctx, l.ID, domain.StatusApproved, actor.ID, "", now); err != nil {
			return err
		}
		l.Status, l.Held = domain.StatusApproved, false
	}
	if l.Status == domain.StatusApproved && severeIncident(l) {
		s.broadcastIncident(ctx, l, asString(l.Details, "severity") == severityCritical)
	}
	return nil
}

// retractIncident takes a false or mistaken report down and, if the town was
// alerted, sends the correction through the same channels.
func (s *Service) retractIncident(ctx context.Context, l *domain.Listing, actor *domain.Member, now string) error {
	if err := s.listings.UpdateStatus(ctx, l.ID, domain.StatusUnpublished, actor.ID, "retracted", now); err != nil {
		return err
	}
	if asString(l.Details, "broadcastAt") == "" {
		return nil
	}
	title := "Correction: safety alert withdrawn"
	body := "An earlier safety alert was withdrawn after review."
	if area := alertArea(asString(l.Details, "location")); area != "" {
		body = fmt.Sprintf("The earlier safety alert near %s was withdrawn after review.", area)
	}
	s.fanOutIncidentNotice(ctx, l, title, body)
	if s.push != nil {
		payload := PushPayload{Title: title, Body: body, URL: "/safety", Tag: "incident-" + l.ID, Kind: notificationKindIncident}
		incidentFanOut(func() { s.push.BroadcastAll(context.Background(), payload) })
	}
	return nil
}

// notifyIncidentOwner tells the reporter their incident was closed out.
func (s *Service) notifyIncidentOwner(ctx context.Context, l *domain.Listing, status string) {
	if s.notifs == nil {
		return
	}
	_ = s.notifs.Insert(ctx, domain.Notification{
		ID: newID(domain.PrefixNotification), MemberID: l.OwnerID,
		Kind: notificationKindIncident, Title: "Your incident was marked " + status,
		Body:      fmt.Sprintf("“%s” is now %s. Thank you for keeping Oguaa safe.", l.Title, status),
		Link:      safetyPathPrefix + l.Slug,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
}

// ── who may see a safety post's reporter (D3) ────────────────────────────────

// canSeeReporter reports whether viewer may see who posted an incident or a
// lost & found notice and how to reach them: the poster and safety staff.
func canSeeReporter(viewer *domain.Member, l *domain.Listing) bool {
	return viewer != nil && (viewer.ID == l.OwnerID || isSafetyStaff(viewer.Role))
}

// publicSafetyView returns an incident or lost & found notice as the public may
// see it: without the poster's contact or member id, without the ids of the
// staff who updated it, and without the alert bookkeeping.
func publicSafetyView(l domain.Listing) domain.Listing {
	out := l
	out.OwnerID = ""
	out.ScreenFlags = nil
	details := make(map[string]any, len(l.Details))
	for k, v := range l.Details {
		switch k {
		case "contact", "broadcastAt", "ringAt", "postReviewedBy":
		case "statusHistory":
			details[k] = anonymousHistory(v)
		default:
			details[k] = v
		}
	}
	out.Details = details
	return out
}

// anonymousHistory copies a statusHistory without the actor ids.
func anonymousHistory(v any) []any {
	entries, _ := canonicalDetail(v).([]any)
	out := make([]any, 0, len(entries))
	for _, e := range entries {
		if m, ok := e.(map[string]any); ok {
			delete(m, "by") // m is a fresh canonical copy
			out = append(out, m)
		}
	}
	return out
}
