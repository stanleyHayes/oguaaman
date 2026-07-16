package service

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── directive test doubles ───────────────────────────────────────────────────

// fakeDirectives is an in-memory DirectiveRepository. Its List mirrors the Mongo
// repo's status filtering so the service's read-time logic is exercised faithfully.
type fakeDirectives struct {
	mu    sync.Mutex
	items []domain.Directive
}

func (f *fakeDirectives) Insert(_ context.Context, d *domain.Directive) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.items = append(f.items, *d)
	return nil
}

func (f *fakeDirectives) List(_ context.Context, flt domain.DirectiveFilters) ([]domain.Directive, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := []domain.Directive{}
	for _, d := range f.items {
		if flt.Town != "" && d.TownID != flt.Town {
			continue
		}
		switch {
		case flt.IncludeAllStatuses:
			// every status
		case flt.ActiveOnly:
			if d.Status != domain.DirectiveStatusActive {
				continue
			}
		default:
			if d.Status == domain.DirectiveStatusCancelled {
				continue
			}
		}
		out = append(out, d)
	}
	return out, nil
}

func (f *fakeDirectives) BySlug(_ context.Context, slug string) (*domain.Directive, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for i := range f.items {
		if f.items[i].Slug == slug {
			d := f.items[i]
			return &d, nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "directive"}
}

func (f *fakeDirectives) ByID(_ context.Context, id string) (*domain.Directive, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for i := range f.items {
		if f.items[i].ID == id {
			d := f.items[i]
			return &d, nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "directive"}
}

func (f *fakeDirectives) SetStatus(_ context.Context, id, status string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	for i := range f.items {
		if f.items[i].ID == id {
			f.items[i].Status = status
			return nil
		}
	}
	return &domain.NotFoundError{Entity: "directive"}
}

func (f *fakeDirectives) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.items)
}

// broadcastNotifs records every inserted notification for broadcast assertions.
// It is mutex-guarded because broadcastDirective fans out from a goroutine.
type broadcastNotifs struct {
	stubNotifs
	mu    sync.Mutex
	items []domain.Notification
}

func (r *broadcastNotifs) Insert(_ context.Context, n domain.Notification) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.items = append(r.items, n)
	return nil
}
func (r *broadcastNotifs) count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.items)
}
func (r *broadcastNotifs) snapshot() []domain.Notification {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]domain.Notification(nil), r.items...)
}

// dirMembers answers ByID with a fixed role and All with a fixed roster —
// enough for the steward check and the broadcast fan-out.
type dirMembers struct {
	stubMembers
	role string
	all  []domain.Member
}

func (m dirMembers) ByID(_ context.Context, id string) (*domain.Member, error) {
	return &domain.Member{ID: id, Role: m.role, TownID: "oguaa"}, nil
}
func (m dirMembers) All(context.Context) ([]domain.Member, error) {
	return append([]domain.Member(nil), m.all...), nil
}

// yesClaims makes every member an approved manager of every org.
type yesClaims struct{ stubClaims }

func (yesClaims) IsManager(context.Context, string, string) (bool, error) { return true, nil }

// directiveSvc assembles a service wired with directive-aware doubles.
func directiveSvc(dirs domain.DirectiveRepository, orgs domain.OrganizationRepository, members domain.MemberRepository, claims domain.OrgClaimRepository, notifs domain.NotificationRepository) *Service {
	f := &fakeRepo{}
	return New(Deps{
		Listings: f, Members: members, Orgs: orgs, Places: stubPlaces{}, Mod: modRepo{f},
		Notifs: notifs, Follows: stubFollows{}, Claims: claims, News: stubNews{},
		Reports: stubReports{}, Timeline: stubTimeline{}, Directives: dirs,
	})
}

func authorityOrgs() *recOrgs {
	return &recOrgs{orgs: []domain.Organization{
		{ID: "org-fire", Slug: "cape-coast-fire", Kind: "emergency-service", Name: "Cape Coast Fire & Rescue Service", Verified: true},
		{ID: "org-school", Slug: "mfantsipim", Kind: "school", Name: "Mfantsipim School", Verified: true},
	}}
}

func validDirectiveInput() DirectiveInput {
	return DirectiveInput{
		Title: "Dry-season fire advisory", Body: "Put out coal pots before sleeping.",
		Severity: domain.DirectiveSeverityMedium, Kind: domain.DirectiveKindAdvisory,
	}
}

// ── tests ────────────────────────────────────────────────────────────────────

func TestCreateDirectiveForOrg_authoritySucceeds(t *testing.T) {
	dirs := &fakeDirectives{}
	svc := directiveSvc(dirs, authorityOrgs(), dirMembers{role: domain.RoleMember}, yesClaims{}, stubNotifs{})

	d, err := svc.CreateDirectiveForOrg(context.Background(), "m-nana", "cape-coast-fire", validDirectiveInput())
	if err != nil {
		t.Fatalf("authority-org manager should issue a directive: %v", err)
	}
	if d.IssuedByOrgID != "org-fire" || d.IssuedByOrgSlug != "cape-coast-fire" || d.IssuedByName != "Cape Coast Fire & Rescue Service" {
		t.Errorf("issuedBy fields not stamped from the org: %+v", d)
	}
	if d.Status != domain.DirectiveStatusActive {
		t.Errorf("status = %q, want active", d.Status)
	}
	if d.EffectiveFrom == "" {
		t.Error("effectiveFrom should default to now when empty")
	}
	if dirs.count() != 1 {
		t.Errorf("expected 1 directive persisted, got %d", dirs.count())
	}
}

func TestCreateDirectiveForOrg_nonAuthorityForbidden(t *testing.T) {
	svc := directiveSvc(&fakeDirectives{}, authorityOrgs(), dirMembers{role: domain.RoleMember}, yesClaims{}, stubNotifs{})

	_, err := svc.CreateDirectiveForOrg(context.Background(), "m-1", "mfantsipim", validDirectiveInput())
	var fb *domain.ForbiddenError
	if err == nil || !isForbidden(err, &fb) {
		t.Errorf("a non-authority org must be refused, got %v", err)
	}
}

func TestCreateDirectiveForOrg_nonManagerForbidden(t *testing.T) {
	// stubClaims.IsManager == false, member is not a steward → requireManager fails.
	svc := directiveSvc(&fakeDirectives{}, authorityOrgs(), dirMembers{role: domain.RoleMember}, stubClaims{}, stubNotifs{})

	_, err := svc.CreateDirectiveForOrg(context.Background(), "m-1", "cape-coast-fire", validDirectiveInput())
	var fb *domain.ForbiddenError
	if err == nil || !isForbidden(err, &fb) {
		t.Errorf("a non-manager must be refused, got %v", err)
	}
}

func TestCreateDirectiveForOrg_stewardBypassesAuthorityGate(t *testing.T) {
	// A steward has no claim (stubClaims) and the org is a non-authority school,
	// yet the steward bypasses both gates.
	svc := directiveSvc(&fakeDirectives{}, authorityOrgs(), dirMembers{role: domain.RoleSteward}, stubClaims{}, stubNotifs{})

	if _, err := svc.CreateDirectiveForOrg(context.Background(), "m-steward", "mfantsipim", validDirectiveInput()); err != nil {
		t.Fatalf("steward should bypass manager + authority gates: %v", err)
	}
}

func TestListDirectives_activeFilterAndLazyExpiry(t *testing.T) {
	past := "2020-01-01T00:00:00Z"
	future := "2999-01-01T00:00:00Z"
	dirs := &fakeDirectives{items: []domain.Directive{
		{ID: "d-live", Slug: "live", Severity: "high", Status: domain.DirectiveStatusActive, TownID: "oguaa", EffectiveFrom: past, EffectiveUntil: future, CreatedAt: past},
		{ID: "d-future", Slug: "future", Severity: "low", Status: domain.DirectiveStatusActive, TownID: "oguaa", EffectiveFrom: future, CreatedAt: past},
		{ID: "d-past", Slug: "past", Severity: "medium", Status: domain.DirectiveStatusActive, TownID: "oguaa", EffectiveFrom: past, EffectiveUntil: past, CreatedAt: past},
		{ID: "d-cancelled", Slug: "cancelled", Severity: "critical", Status: domain.DirectiveStatusCancelled, TownID: "oguaa", EffectiveFrom: past, CreatedAt: past},
	}}
	svc := directiveSvc(dirs, authorityOrgs(), dirMembers{role: domain.RoleMember}, yesClaims{}, stubNotifs{})
	ctx := context.Background()

	active, err := svc.ListDirectives(ctx, true, "oguaa")
	if err != nil {
		t.Fatalf("ListDirectives(active) failed: %v", err)
	}
	if len(active) != 1 || active[0].ID != "d-live" {
		t.Fatalf("activeOnly should return only the currently-active directive, got %+v", active)
	}

	// The past-until active row was lazily flipped to expired and persisted.
	if d, _ := dirs.ByID(ctx, "d-past"); d == nil || d.Status != domain.DirectiveStatusExpired {
		t.Errorf("expected d-past to be lazily persisted as expired, got %+v", d)
	}

	// Without the active filter: everything except the cancelled one, and the
	// expired row now reports status expired.
	all, err := svc.ListDirectives(ctx, false, "oguaa")
	if err != nil {
		t.Fatalf("ListDirectives(all) failed: %v", err)
	}
	if len(all) != 3 {
		t.Fatalf("public feed should exclude cancelled, got %d: %+v", len(all), all)
	}
	for _, d := range all {
		if d.ID == "d-past" && d.Status != domain.DirectiveStatusExpired {
			t.Errorf("d-past status = %q, want expired", d.Status)
		}
	}
}

func TestCreateDirectiveForOrg_highSeverityBroadcasts(t *testing.T) {
	notifs := &broadcastNotifs{}
	roster := []domain.Member{{ID: "m-1"}, {ID: "m-2"}, {ID: "m-3"}}
	svc := directiveSvc(&fakeDirectives{}, authorityOrgs(), dirMembers{role: domain.RoleMember, all: roster}, yesClaims{}, notifs)

	in := validDirectiveInput()
	in.Severity = domain.DirectiveSeverityHigh
	in.Action = "Keep shops closed until 10:00"
	if _, err := svc.CreateDirectiveForOrg(context.Background(), "m-nana", "cape-coast-fire", in); err != nil {
		t.Fatalf("create failed: %v", err)
	}

	// Broadcast runs in a goroutine — wait briefly for the fan-out to land.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && notifs.count() < len(roster) {
		time.Sleep(5 * time.Millisecond)
	}
	if notifs.count() != len(roster) {
		t.Fatalf("expected %d townwide notices, got %d", len(roster), notifs.count())
	}
	for _, n := range notifs.snapshot() {
		if n.Kind != "directive" || n.Link != "/alerts" {
			t.Errorf("notice = %+v, want kind=directive link=/alerts", n)
		}
	}
}

func TestCreateDirectiveForOrg_lowSeverityDoesNotBroadcast(t *testing.T) {
	notifs := &broadcastNotifs{}
	roster := []domain.Member{{ID: "m-1"}, {ID: "m-2"}}
	svc := directiveSvc(&fakeDirectives{}, authorityOrgs(), dirMembers{role: domain.RoleMember, all: roster}, yesClaims{}, notifs)

	in := validDirectiveInput()
	in.Severity = domain.DirectiveSeverityLow
	if _, err := svc.CreateDirectiveForOrg(context.Background(), "m-nana", "cape-coast-fire", in); err != nil {
		t.Fatalf("create failed: %v", err)
	}
	// Give any (erroneous) goroutine a moment; low severity must not fan out.
	time.Sleep(50 * time.Millisecond)
	if notifs.count() != 0 {
		t.Errorf("low-severity directive should not broadcast, got %d notices", notifs.count())
	}
}

func TestAdminCreateDirective_resolvesOrgAndBroadcasts(t *testing.T) {
	notifs := &broadcastNotifs{}
	dirs := &fakeDirectives{}
	roster := []domain.Member{{ID: "m-1"}, {ID: "m-2"}}
	// Admin path takes no manager check; members role is irrelevant here.
	svc := directiveSvc(dirs, authorityOrgs(), dirMembers{role: domain.RoleCurator, all: roster}, stubClaims{}, notifs)

	in := validDirectiveInput()
	in.Severity = domain.DirectiveSeverityCritical
	in.IssuedByOrgSlug = "cape-coast-fire"
	d, err := svc.AdminCreateDirective(context.Background(), "m-curator", in)
	if err != nil {
		t.Fatalf("admin create failed: %v", err)
	}
	if d.IssuedByOrgID != "org-fire" {
		t.Errorf("admin directive should be attributed to the resolved org, got %q", d.IssuedByOrgID)
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) && notifs.count() < len(roster) {
		time.Sleep(5 * time.Millisecond)
	}
	if notifs.count() != len(roster) {
		t.Errorf("critical admin directive should broadcast to %d members, got %d", len(roster), notifs.count())
	}
}

func TestAdminCreateDirective_requiresIssuingOrg(t *testing.T) {
	svc := directiveSvc(&fakeDirectives{}, authorityOrgs(), dirMembers{role: domain.RoleCurator}, stubClaims{}, stubNotifs{})
	if _, err := svc.AdminCreateDirective(context.Background(), "m-curator", validDirectiveInput()); err == nil {
		t.Error("admin create without an issuing org should fail")
	}
}

func TestCancelDirective_setsCancelled(t *testing.T) {
	dirs := &fakeDirectives{items: []domain.Directive{
		{ID: "d-1", Slug: "s1", Status: domain.DirectiveStatusActive, EffectiveFrom: "2020-01-01T00:00:00Z"},
	}}
	svc := directiveSvc(dirs, authorityOrgs(), dirMembers{role: domain.RoleCurator}, stubClaims{}, stubNotifs{})

	d, err := svc.CancelDirective(context.Background(), "d-1")
	if err != nil {
		t.Fatalf("cancel failed: %v", err)
	}
	if d.Status != domain.DirectiveStatusCancelled {
		t.Errorf("status = %q, want cancelled", d.Status)
	}
}
