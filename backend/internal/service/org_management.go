package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── institution management: claim → steward-verify → manage (spec §8.13) ──────

// OrgClaimView enriches a claim with the org and member display names for review.
type OrgClaimView struct {
	domain.OrgClaim
	OrgName    string `json:"orgName"`
	OrgSlug    string `json:"orgSlug"`
	MemberName string `json:"memberName"`
}

// ManagedOrg is an institution a member manages, surfaced in their portal.
type ManagedOrg struct {
	Organization domain.Organization `json:"organization"`
}

// RequestOrgClaim records a member's request to manage an institution. A steward
// must approve it before any management rights take effect.
func (s *Service) RequestOrgClaim(ctx context.Context, memberID, orgSlug, requestedRole, note string) (*domain.OrgClaim, error) {
	if strings.TrimSpace(requestedRole) == "" {
		return nil, fmt.Errorf("tell us the office or role you hold")
	}
	org, err := s.orgs.BySlug(ctx, orgSlug)
	if err != nil {
		return nil, err
	}
	// Reserved authority handles can only be assigned by a steward — a member
	// may not self-claim an official emergency/security/local-government name.
	if domain.IsReservedSlug(org.Slug) && !s.isSteward(ctx, memberID) {
		return nil, &domain.ForbiddenError{Reason: "this is a reserved official handle — a steward must assign it"}
	}
	active, err := s.claims.HasActiveClaim(ctx, memberID, org.ID)
	if err != nil {
		return nil, err
	}
	if active {
		return nil, fmt.Errorf("you already have a pending or approved claim for %s", org.Name)
	}
	now := time.Now().UTC().Format(time.RFC3339)
	c := domain.OrgClaim{
		ID:            newID(domain.PrefixClaim),
		OrgID:         org.ID,
		MemberID:      memberID,
		RequestedRole: strings.TrimSpace(requestedRole),
		Note:          strings.TrimSpace(note),
		Status:        domain.ClaimPending,
		CreatedAt:     now,
	}
	if err := s.claims.Insert(ctx, c); err != nil {
		return nil, err
	}
	return &c, nil
}

// PendingClaims lists claims awaiting steward review, newest first, enriched for display.
func (s *Service) PendingClaims(ctx context.Context) ([]OrgClaimView, error) {
	claims, err := s.claims.Pending(ctx)
	if err != nil {
		return nil, err
	}
	sort.SliceStable(claims, func(i, j int) bool { return claims[i].CreatedAt > claims[j].CreatedAt })
	out := make([]OrgClaimView, 0, len(claims))
	for _, c := range claims {
		v := OrgClaimView{OrgClaim: c}
		if org, err := s.orgs.ByID(ctx, c.OrgID); err == nil {
			v.OrgName, v.OrgSlug = org.Name, org.Slug
		} else if c.NewOrg != nil {
			v.OrgName = c.NewOrg.Name // a request to CREATE this institution
		}
		if m, err := s.members.ByID(ctx, c.MemberID); err == nil {
			v.MemberName = m.DisplayName
		}
		out = append(out, v)
	}
	return out, nil
}

// ReviewOrgClaim approves or rejects a claim (steward only). On approval the
// member becomes a manager, and — as a courtesy — the institution records their
// office in the roster if it isn't there yet. The member is notified either way.
func (s *Service) ReviewOrgClaim(ctx context.Context, claimID string, approve bool, stewardID string) error {
	c, err := s.claims.Get(ctx, claimID)
	if err != nil {
		return err
	}
	if c.Status != domain.ClaimPending {
		return fmt.Errorf("this claim has already been reviewed")
	}
	status := domain.ClaimRejected
	if approve {
		status = domain.ClaimApproved
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if err := s.claims.UpdateStatus(ctx, claimID, status, stewardID, now); err != nil {
		return err
	}
	if approve {
		// A new-institution request: create + verify the org from the same
		// click, then point the claim at it (Creator plan §4.1.1).
		if c.NewOrg != nil {
			org, err := s.createOrg(ctx, c.NewOrg.Name, c.NewOrg.Kind, "", "", c.NewOrg.Seat)
			if err != nil {
				return err
			}
			if err := s.claims.AttachOrg(ctx, claimID, org.ID); err != nil {
				return err
			}
			c.OrgID = org.ID
		}
		s.ensureOffice(ctx, c.OrgID, c.MemberID, c.RequestedRole)
	}
	s.notifyClaim(ctx, c, approve)
	return nil
}

// ensureOffice adds the manager's claimed office to the org roster if absent.
func (s *Service) ensureOffice(ctx context.Context, orgID, memberID, role string) {
	org, err := s.orgs.ByID(ctx, orgID)
	if err != nil {
		return
	}
	for _, o := range org.Offices {
		if o.HolderID == memberID && strings.EqualFold(o.Role, role) {
			return
		}
	}
	holderName := ""
	if m, err := s.members.ByID(ctx, memberID); err == nil && m != nil {
		holderName = m.DisplayName
	}
	offices := append(org.Offices, domain.Office{
		ID:   newID("ofc-"),
		Role: role, HolderID: memberID, HolderName: holderName, Verified: true,
	})
	_ = s.orgs.SetOffices(ctx, orgID, offices)
}

func (s *Service) notifyClaim(ctx context.Context, c *domain.OrgClaim, approve bool) {
	if s.notifs == nil {
		return
	}
	org, _ := s.orgs.ByID(ctx, c.OrgID)
	name := "your institution"
	link := ""
	if org != nil {
		name = org.Name
		link = "/education/" + org.Slug
	}
	var title, body string
	if approve {
		title = "You can now manage " + name
		body = fmt.Sprintf("Your claim as %s was approved. You can edit the profile, roster, and post official events.", c.RequestedRole)
		if c.NewOrg != nil {
			title = name + " is live — you're its first manager"
			body = "Your new institution was created and verified. Open its Team workspace in the creator app to build the page."
		}
	} else {
		title = "Claim not approved"
		body = fmt.Sprintf("Your request to manage %s was not approved. Reach out if you think this was a mistake.", name)
	}
	_ = s.notifs.Insert(ctx, domain.Notification{
		ID: newID(domain.PrefixNotification), MemberID: c.MemberID,
		Kind: "org-claim", Title: title, Body: body, Link: link,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
}

// ManagedOrgs returns the institutions a member may manage (approved claims).
func (s *Service) ManagedOrgs(ctx context.Context, memberID string) ([]domain.Organization, error) {
	ids, err := s.claims.ManagedOrgIDs(ctx, memberID)
	if err != nil {
		return nil, err
	}
	out := []domain.Organization{}
	for _, id := range ids {
		if org, err := s.orgs.ByID(ctx, id); err == nil {
			out = append(out, *org)
		}
	}
	return out, nil
}

// requireManager guards a management action: the member must have an approved
// claim for the org (resolved by slug). Returns the org on success.
func (s *Service) requireManager(ctx context.Context, memberID, orgSlug string) (*domain.Organization, error) {
	org, err := s.orgs.BySlug(ctx, orgSlug)
	if err != nil {
		return nil, err
	}
	// Stewards are the platform's editors of record: they may configure any
	// institution's official page — including heritage and visitor sites that
	// have no external manager to claim them — not only orgs they hold an
	// approved claim for. (The HTTP layer still gates on requireAuth.)
	if m, err := s.members.ByID(ctx, memberID); err == nil && m != nil && m.Role == domain.RoleSteward {
		return org, nil
	}
	ok, err := s.claims.IsManager(ctx, memberID, org.ID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, &domain.ForbiddenError{Reason: "you don't manage this institution"}
	}
	return org, nil
}

// CanManageInstitution reports whether the member manages the institution
// (approved claim) or is a steward. The public institution endpoint uses it to
// let managers and stewards view a page that revocation has taken offline.
func (s *Service) CanManageInstitution(ctx context.Context, memberID, orgSlug string) bool {
	_, err := s.requireManager(ctx, memberID, orgSlug)
	return err == nil
}

// UpdateOrgProfile lets a manager edit the institution's soft profile fields.
func (s *Service) UpdateOrgProfile(ctx context.Context, memberID, orgSlug string, patch domain.OrgProfilePatch) (*domain.Organization, error) {
	org, err := s.requireManager(ctx, memberID, orgSlug)
	if err != nil {
		return nil, err
	}
	for i := range patch.Contact {
		patch.Contact[i].URL = safeURL(patch.Contact[i].URL) // contact links render as <a href>
	}
	for i := range patch.VerificationArtifacts {
		patch.VerificationArtifacts[i].URL = safeURL(patch.VerificationArtifacts[i].URL)
	}
	if err := s.orgs.UpdateProfile(ctx, org.ID, patch); err != nil {
		return nil, err
	}
	return s.orgs.ByID(ctx, org.ID)
}

// SetOrgOffices lets a manager replace the institution's roster of offices.
func (s *Service) SetOrgOffices(ctx context.Context, memberID, orgSlug string, offices []domain.Office) (*domain.Organization, error) {
	org, err := s.requireManager(ctx, memberID, orgSlug)
	if err != nil {
		return nil, err
	}
	for i := range offices {
		if strings.TrimSpace(offices[i].Role) == "" {
			return nil, fmt.Errorf("every office needs a role/title")
		}
		if offices[i].ID == "" {
			offices[i].ID = "ofc-" + fmt.Sprintf("%d-%d", time.Now().UnixNano(), i)
		}
	}
	if err := s.orgs.SetOffices(ctx, org.ID, offices); err != nil {
		return nil, err
	}
	return s.orgs.ByID(ctx, org.ID)
}

// SetOrgGallery lets a manager replace the institution's photo gallery. Empty
// rows (no URL) are dropped; new assets get an id and sensible defaults.
func (s *Service) SetOrgGallery(ctx context.Context, memberID, orgSlug string, gallery []domain.MediaAsset) (*domain.Organization, error) {
	org, err := s.requireManager(ctx, memberID, orgSlug)
	if err != nil {
		return nil, err
	}
	clean := cleanMedia(gallery, "g")
	if err := s.orgs.SetGallery(ctx, org.ID, clean); err != nil {
		return nil, err
	}
	return s.orgs.ByID(ctx, org.ID)
}

// SetOrgSections lets a manager replace the institution's custom showcase
// sections (the author-composed blocks). Sections render in the order given;
// each must be a known kind. Nested media/items are cleaned and id-stamped.
func (s *Service) SetOrgSections(ctx context.Context, memberID, orgSlug string, sections []domain.ProfileSection) (*domain.Organization, error) {
	org, err := s.requireManager(ctx, memberID, orgSlug)
	if err != nil {
		return nil, err
	}
	for i := range sections {
		if err := cleanSection(&sections[i], i); err != nil {
			return nil, err
		}
	}
	if err := s.orgs.SetSections(ctx, org.ID, sections); err != nil {
		return nil, err
	}
	return s.orgs.ByID(ctx, org.ID)
}

// cleanSection validates and normalizes one profile section in place: known
// type/tone, id stamped, media cleaned, empty rows dropped, links sanitized.
func cleanSection(sec *domain.ProfileSection, i int) error {
	sec.Type = strings.TrimSpace(sec.Type)
	if !domain.ValidSectionType(sec.Type) {
		return fmt.Errorf("unknown section type %q", sec.Type)
	}
	sec.Tone = strings.TrimSpace(sec.Tone)
	if !domain.ValidTone(sec.Tone) {
		return fmt.Errorf("unknown section tone %q", sec.Tone)
	}
	if sec.ID == "" {
		sec.ID = "sec-" + fmt.Sprintf("%d-%d", time.Now().UnixNano(), i)
	}
	sec.Media = cleanMedia(sec.Media, fmt.Sprintf("s%d", i))
	sec.Items = cleanSectionItems(sec.Items, i)
	sec.Groups = cleanSubEntities(sec.Groups, i)
	return nil
}

// cleanSectionItems drops fully-empty rows, sanitizes links and stamps ids.
func cleanSectionItems(in []domain.SectionItem, i int) []domain.SectionItem {
	items := make([]domain.SectionItem, 0, len(in))
	for j, it := range in {
		if it.Label == "" && it.Value == "" && it.Detail == "" && it.Image == "" && it.URL == "" {
			continue // drop fully-empty rows
		}
		it.URL = safeURL(it.URL) // defense-in-depth: drop javascript:/data: link schemes
		if it.ID == "" {
			it.ID = fmt.Sprintf("itm-%d-%d-%d", time.Now().UnixNano(), i, j)
		}
		items = append(items, it)
	}
	return items
}

// cleanSubEntities normalizes sub-entity cards (houses, departments, Asafo
// companies, year groups, lineage): drop nameless cards, mint ids, clean each
// card's key/value facts.
func cleanSubEntities(in []domain.SubEntity, i int) []domain.SubEntity {
	groups := make([]domain.SubEntity, 0, len(in))
	for j := range in {
		g := in[j]
		g.Name = strings.TrimSpace(g.Name)
		if g.Name == "" {
			continue
		}
		g.CrestURL = safeURL(g.CrestURL) // stored URL rendered as <img>/<Image> src
		if g.ID == "" {
			g.ID = fmt.Sprintf("grp-%d-%d-%d", time.Now().UnixNano(), i, j)
		}
		g.Attrs = cleanAttrs(g.Attrs, i, j)
		groups = append(groups, g)
	}
	return groups
}

// cleanAttrs drops label-less facts, sanitizes links and stamps ids.
func cleanAttrs(in []domain.SectionItem, i, j int) []domain.SectionItem {
	attrs := make([]domain.SectionItem, 0, len(in))
	for k, a := range in {
		if strings.TrimSpace(a.Label) == "" && strings.TrimSpace(a.Value) == "" {
			continue
		}
		a.URL = safeURL(a.URL) // defense-in-depth: match the items loop
		if a.ID == "" {
			a.ID = fmt.Sprintf("atr-%d-%d-%d-%d", time.Now().UnixNano(), i, j, k)
		}
		attrs = append(attrs, a)
	}
	return attrs
}

// safeURL blanks out URLs whose scheme is not web-safe, as defense-in-depth
// against stored XSS via javascript:/data: links rendered as <a href> (the
// clients also guard). Empty, scheme-less (relative), http(s), mailto and tel
// URLs pass through; any other explicit scheme is dropped.
func safeURL(raw string) string {
	u := strings.TrimSpace(raw)
	if u == "" {
		return ""
	}
	lower := strings.ToLower(u)
	switch {
	case strings.HasPrefix(lower, "http://"), strings.HasPrefix(lower, "https://"),
		strings.HasPrefix(lower, "mailto:"), strings.HasPrefix(lower, "tel:"):
		return u
	}
	if colon := strings.IndexByte(u, ':'); colon >= 0 {
		// A ':' before any /?# means an explicit (disallowed) scheme → drop it.
		if slash := strings.IndexAny(u, "/?#"); slash == -1 || colon < slash {
			return ""
		}
	}
	return u
}

// cleanMedia drops URL-less assets and stamps ids/defaults on the rest. tag
// disambiguates ids when called for multiple sections in one request.
func cleanMedia(in []domain.MediaAsset, tag string) []domain.MediaAsset {
	out := make([]domain.MediaAsset, 0, len(in))
	for i, a := range in {
		a.URL = strings.TrimSpace(a.URL)
		if a.URL == "" {
			continue
		}
		if a.ID == "" {
			a.ID = fmt.Sprintf("med-%s-%d-%d", tag, time.Now().UnixNano(), i)
		}
		if a.Kind == "" {
			a.Kind = "photo"
		}
		if a.Moderation == "" {
			a.Moderation = "approved"
		}
		out = append(out, a)
	}
	return out
}

// PostOrgEvent lets a manager publish an official event for the institution.
// Verified institutions publish immediately (their identity is trusted); others
// go to the moderation queue like any submission (spec §8.2, §8.13).
func (s *Service) PostOrgEvent(ctx context.Context, memberID, orgSlug, title string, details map[string]any) (*domain.Listing, error) {
	org, err := s.requireManager(ctx, memberID, orgSlug)
	if err != nil {
		return nil, err
	}
	title = strings.TrimSpace(title)
	if len(title) < 2 || len(title) > 160 {
		return nil, fmt.Errorf("title must be 2–160 characters")
	}
	if details == nil {
		details = map[string]any{}
	}
	now := time.Now().UTC().Format(time.RFC3339)
	status := domain.StatusPending
	publishedAt := ""
	if org.Verified {
		status = domain.StatusApproved
		publishedAt = now
	}
	l := domain.Listing{
		ID:            "org-" + slugify(title) + "-" + fmt.Sprintf("%d", time.Now().UnixNano()%1_000_000),
		Slug:          slugify(title),
		Type:          domain.TypeEvent,
		OwnerID:       memberID,
		Title:         title,
		Status:        status,
		Tags:          []string{},
		PostedByOrgID: org.ID,
		Details:       details,
		CreatedAt:     now,
		SubmittedAt:   now,
		PublishedAt:   publishedAt,
	}
	if err := s.listings.Insert(ctx, l); err != nil {
		return nil, err
	}
	return &l, nil
}
