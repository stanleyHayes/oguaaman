package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── authorized directives / announcements ────────────────────────────────────
//
// A directive is an official notice from a recognised authority (an emergency,
// security or health service, or local government). It mirrors the incident
// model — the same severity scale, a read-time status, and a high/critical fan
// out — but is issued top-down by an org rather than reported by a member.

var validDirectiveSeverities = map[string]bool{
	"low": true, "medium": true, "high": true, "critical": true,
}

var validDirectiveKinds = map[string]bool{
	"advisory": true, "directive": true, "emergency": true,
}

// severityRank orders the feed most-severe first.
var severityRank = map[string]int{"critical": 4, "high": 3, "medium": 2, "low": 1}

// DirectiveInput is the create payload. For the institution route the issuedBy*
// fields are ignored (the org comes from the path); for the admin route
// IssuedByOrgID or IssuedByOrgSlug selects the issuing authority.
type DirectiveInput struct {
	Title          string `json:"title"`
	Body           string `json:"body"`
	Severity       string `json:"severity"`
	Kind           string `json:"kind"`
	Action         string `json:"action"`
	Area           string `json:"area"`
	EffectiveFrom  string `json:"effectiveFrom"`
	EffectiveUntil string `json:"effectiveUntil"`

	// Optional geo footprint — when a directive/closure covers a known place, it
	// is drawn as a circular area on the town map. All three must be present.
	Latitude  *float64 `json:"latitude"`
	Longitude *float64 `json:"longitude"`
	RadiusM   *float64 `json:"radiusM"`

	// Admin-only: choose the issuing authority.
	IssuedByOrgID   string `json:"issuedByOrgId"`
	IssuedByOrgSlug string `json:"issuedByOrgSlug"`
}

// CreateDirectiveForOrg issues a directive on behalf of an institution. The
// caller must be one of the org's MANAGERS (requireManagerScope — officers are
// "content only" and may not speak for an authority; stewards bypass), and the
// org's kind must be an authority kind — unless the caller is a steward, who
// bypasses both gates. High/critical directives fan out townwide.
func (s *Service) CreateDirectiveForOrg(ctx context.Context, memberID, orgSlug string, in DirectiveInput) (*domain.Directive, error) {
	org, err := s.requireManagerScope(ctx, memberID, orgSlug)
	if err != nil {
		return nil, err
	}
	// Stewards bypass both gates. Everyone else must manage a recognised
	// authority whose page a steward has already verified — an authority page
	// awaiting verification cannot yet issue notices (spec: authority claims
	// need verification before the org can act).
	if !s.isSteward(ctx, memberID) {
		if !domain.IsAuthorityKind(org.Kind) {
			return nil, &domain.ForbiddenError{Reason: "only recognised authorities (emergency, security or health services, or local government) can issue directives"}
		}
		if !org.Verified {
			return nil, &domain.ForbiddenError{Reason: "this authority is awaiting steward verification before it can issue notices"}
		}
	}
	return s.createDirective(ctx, memberID, org, in)
}

// AdminCreateDirective issues a directive as a curator/steward on behalf of any
// authority. The issuing org is resolved from IssuedByOrgID or IssuedByOrgSlug;
// there is no manager check (the back-office is already role-gated).
func (s *Service) AdminCreateDirective(ctx context.Context, memberID string, in DirectiveInput) (*domain.Directive, error) {
	org, err := s.resolveIssuingOrg(ctx, in.IssuedByOrgID, in.IssuedByOrgSlug)
	if err != nil {
		return nil, err
	}
	return s.createDirective(ctx, memberID, org, in)
}

// resolveIssuingOrg finds the org to attribute an admin-issued directive to.
func (s *Service) resolveIssuingOrg(ctx context.Context, orgID, orgSlug string) (*domain.Organization, error) {
	if id := strings.TrimSpace(orgID); id != "" {
		return s.orgs.ByID(ctx, id)
	}
	if slug := strings.TrimSpace(orgSlug); slug != "" {
		return s.orgs.BySlug(ctx, slug)
	}
	return nil, &domain.ValidationError{Message: "choose an issuing authority (issuedByOrgId or issuedByOrgSlug)"}
}

// createDirective validates, persists and (on high/critical) broadcasts a new
// directive attributed to org.
func (s *Service) createDirective(ctx context.Context, creatorID string, org *domain.Organization, in DirectiveInput) (*domain.Directive, error) {
	title, body, err := validateDirectiveText(in)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	effectiveFrom, effectiveUntil, err := directiveWindow(in.EffectiveFrom, in.EffectiveUntil, now)
	if err != nil {
		return nil, err
	}
	// Town scope: inherit the issuing member's town so the ?town= filter works;
	// empty = townwide.
	townID := ""
	if m, err := s.members.ByID(ctx, creatorID); err == nil && m != nil {
		townID = m.TownID
	}
	d := &domain.Directive{
		ID:              "dir-" + fmt.Sprintf("%d", now.UnixNano()),
		Slug:            slugify(title) + "-" + fmt.Sprintf("%d", now.UnixNano()%1_000_000),
		Title:           title,
		Body:            body,
		Severity:        in.Severity,
		Kind:            in.Kind,
		Action:          strings.TrimSpace(in.Action),
		Area:            strings.TrimSpace(in.Area),
		TownID:          townID,
		IssuedByOrgID:   org.ID,
		IssuedByOrgSlug: org.Slug,
		IssuedByName:    org.Name,
		EffectiveFrom:   effectiveFrom,
		EffectiveUntil:  effectiveUntil,
		Status:          domain.DirectiveStatusActive,
		CreatedAt:       now.Format(time.RFC3339),
		CreatedByID:     creatorID,
	}
	// Geo is drawn as a map area only when the full centre + radius is given.
	if in.Latitude != nil && in.Longitude != nil && in.RadiusM != nil && *in.RadiusM > 0 {
		d.Latitude, d.Longitude, d.RadiusM = in.Latitude, in.Longitude, in.RadiusM
	}
	if err := s.directives.Insert(ctx, d); err != nil {
		return nil, err
	}
	if d.Severity == domain.DirectiveSeverityHigh || d.Severity == domain.DirectiveSeverityCritical {
		s.broadcastDirective(ctx, d)
	}
	return d, nil
}

// validateDirectiveText checks the title, body, severity and kind of a new
// directive, returning the trimmed title and body.
func validateDirectiveText(in DirectiveInput) (title, body string, err error) {
	title = strings.TrimSpace(in.Title)
	if len(title) < 2 || len(title) > 160 {
		return "", "", &domain.ValidationError{Message: "title must be 2–160 characters"}
	}
	body = strings.TrimSpace(in.Body)
	if body == "" {
		return "", "", &domain.ValidationError{Message: "a directive needs a body"}
	}
	if !validDirectiveSeverities[in.Severity] {
		return "", "", &domain.ValidationError{Message: "choose a valid severity"}
	}
	if !validDirectiveKinds[in.Kind] {
		return "", "", &domain.ValidationError{Message: "choose a valid directive kind"}
	}
	return title, body, nil
}

// directiveWindow parses the effective window. Both bounds must be RFC3339
// timestamps (with a zone); they are stored normalised to UTC. An empty "from"
// means now and an empty "until" means open-ended. An unparseable bound is
// rejected rather than stored, because read-time expiry ignores a bound it
// cannot parse and the directive would then never expire.
func directiveWindow(fromRaw, untilRaw string, now time.Time) (from, until string, err error) {
	start := now
	if v := strings.TrimSpace(fromRaw); v != "" {
		if start, err = time.Parse(time.RFC3339, v); err != nil {
			return "", "", &domain.ValidationError{Message: "effectiveFrom must be an RFC3339 date and time with a timezone, e.g. 2026-10-05T18:00:00Z"}
		}
	}
	from = start.UTC().Format(time.RFC3339)
	v := strings.TrimSpace(untilRaw)
	if v == "" {
		return from, "", nil
	}
	end, err := time.Parse(time.RFC3339, v)
	if err != nil {
		return "", "", &domain.ValidationError{Message: "effectiveUntil must be an RFC3339 date and time with a timezone, e.g. 2026-10-05T18:00:00Z"}
	}
	if !end.After(start) {
		return "", "", &domain.ValidationError{Message: "effectiveUntil must be after effectiveFrom"}
	}
	return from, end.UTC().Format(time.RFC3339), nil
}

// ListDirectives returns the public directive feed for a town (empty town = all
// towns), sorted most-severe then newest. Statuses are computed on read: an
// active directive past its effectiveUntil is lazily flipped to "expired" in the
// returned data and persisted (no cron needed). When activeOnly is set, only
// currently-active directives are kept.
func (s *Service) ListDirectives(ctx context.Context, activeOnly bool, town string) ([]domain.Directive, error) {
	rows, err := s.directives.List(ctx, domain.DirectiveFilters{ActiveOnly: activeOnly, Town: town})
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	out := make([]domain.Directive, 0, len(rows))
	for i := range rows {
		d := rows[i]
		s.applyLazyExpiry(ctx, &d)
		if activeOnly && !d.IsActive(now) {
			continue
		}
		out = append(out, d)
	}
	sortDirectives(out)
	return out, nil
}

// AdminDirectives returns every directive (all statuses) for the back-office,
// with the same read-time expiry and sort as the public feed.
func (s *Service) AdminDirectives(ctx context.Context) ([]domain.Directive, error) {
	rows, err := s.directives.List(ctx, domain.DirectiveFilters{IncludeAllStatuses: true})
	if err != nil {
		return nil, err
	}
	for i := range rows {
		s.applyLazyExpiry(ctx, &rows[i])
	}
	sortDirectives(rows)
	return rows, nil
}

// Directive fetches one directive by slug, applying read-time expiry.
func (s *Service) Directive(ctx context.Context, slug string) (*domain.Directive, error) {
	d, err := s.directives.BySlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	s.applyLazyExpiry(ctx, d)
	return d, nil
}

// CancelDirective withdraws a directive (curator/steward action).
func (s *Service) CancelDirective(ctx context.Context, id string) (*domain.Directive, error) {
	if _, err := s.directives.ByID(ctx, id); err != nil {
		return nil, err
	}
	if err := s.directives.SetStatus(ctx, id, domain.DirectiveStatusCancelled); err != nil {
		return nil, err
	}
	return s.directives.ByID(ctx, id)
}

// applyLazyExpiry flips an active-but-past directive to "expired" in place and
// persists it, so status stays honest without a scheduled job. Cancelled/already
// expired and open-ended directives are left untouched.
func (s *Service) applyLazyExpiry(ctx context.Context, d *domain.Directive) {
	if d.Status != domain.DirectiveStatusActive || d.EffectiveUntil == "" {
		return
	}
	until, err := time.Parse(time.RFC3339, d.EffectiveUntil)
	if err != nil {
		return
	}
	if time.Now().UTC().After(until) {
		d.Status = domain.DirectiveStatusExpired
		_ = s.directives.SetStatus(ctx, d.ID, domain.DirectiveStatusExpired)
	}
}

// broadcastDirective fans a severe directive out to every member as an in-app
// notice linking to /alerts. Mirrors notifyCuratorsOfIncident but reaches the
// whole town; runs in a goroutine so the member scan never delays the response.
func (s *Service) broadcastDirective(ctx context.Context, d *domain.Directive) {
	if s.notifs == nil {
		return
	}
	body := directiveNoticeBody(d)
	go func() {
		members, err := s.members.All(context.Background())
		if err != nil {
			return
		}
		for i := range members {
			m := &members[i]
			_ = s.notifs.Insert(context.Background(), domain.Notification{
				ID:       "ntf-" + fmt.Sprintf("%d-%s", time.Now().UnixNano(), m.ID),
				MemberID: m.ID, Kind: "directive",
				Title:     d.Title,
				Body:      body,
				Link:      "/alerts",
				CreatedAt: time.Now().UTC().Format(time.RFC3339),
			})
		}
	}()
	// A push in parallel: a critical/emergency directive rings like a call.
	if s.push != nil {
		go s.push.BroadcastAll(context.Background(), PushPayload{
			Title: d.Title, Body: body, URL: "/alerts", Tag: "directive-" + d.ID,
			Severity: d.Severity, Kind: "directive", Ring: d.Severity == "critical" || d.Kind == "emergency",
		})
	}
}

// directiveNoticeBody builds the short notification body: the action if the
// authority gave one, else a trimmed lead of the directive body.
func directiveNoticeBody(d *domain.Directive) string {
	if a := strings.TrimSpace(d.Action); a != "" {
		return fmt.Sprintf("%s — %s", d.IssuedByName, a)
	}
	return shortenText(d.Body, 160)
}

// shortenText truncates on rune boundaries so multi-byte characters are never
// split, appending an ellipsis when it cuts.
func shortenText(s string, max int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) <= max {
		return string(r)
	}
	return strings.TrimSpace(string(r[:max])) + "…"
}

// isSteward reports whether the member may act as a steward (D9: in
// production only with two-factor on).
func (s *Service) isSteward(ctx context.Context, memberID string) bool {
	return s.actingRole(ctx, memberID) == domain.RoleSteward
}

// sortDirectives orders a feed most-severe first, then newest.
func sortDirectives(ds []domain.Directive) {
	sort.SliceStable(ds, func(i, j int) bool {
		if ri, rj := severityRank[ds[i].Severity], severityRank[ds[j].Severity]; ri != rj {
			return ri > rj
		}
		return ds[i].CreatedAt > ds[j].CreatedAt
	})
}
