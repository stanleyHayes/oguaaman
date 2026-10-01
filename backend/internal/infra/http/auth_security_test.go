package http

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"golang.org/x/crypto/bcrypt"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/service"
)

// memStore is an in-memory MemberRepository for the auth handler tests.
type memStore struct {
	domain.MemberRepository // embedded nil: only the methods below are used
	mu                      sync.Mutex
	byID                    map[string]*domain.Member
}

func newMemStore(members ...*domain.Member) *memStore {
	s := &memStore{byID: map[string]*domain.Member{}}
	for _, m := range members {
		s.byID[m.ID] = m
	}
	return s
}

func (s *memStore) find(match func(*domain.Member) bool) (*domain.Member, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, m := range s.byID {
		if match(m) {
			cp := *m
			return &cp, nil
		}
	}
	return nil, &domain.NotFoundError{Entity: "member"}
}

func (s *memStore) update(id string, fn func(*domain.Member)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	fn(s.byID[id])
}

func (s *memStore) ByID(_ context.Context, id string) (*domain.Member, error) {
	return s.find(func(m *domain.Member) bool { return m.ID == id })
}

func (s *memStore) ByIdentifier(_ context.Context, identifier string) (*domain.Member, error) {
	return s.find(func(m *domain.Member) bool {
		return identifier != "" && (m.Email == identifier || m.Phone == identifier)
	})
}

func (s *memStore) BySlug(_ context.Context, slug string) (*domain.Member, error) {
	return s.find(func(m *domain.Member) bool { return m.Slug == slug })
}

func (s *memStore) Insert(_ context.Context, m domain.Member) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.byID[m.ID] = &m
	return nil
}

func (s *memStore) SetPasswordHash(_ context.Context, id, hash string) error {
	s.update(id, func(m *domain.Member) { m.PasswordHash = hash })
	return nil
}

func (s *memStore) SetPasswordReset(_ context.Context, id, codeHash, expiresAt string) error {
	s.update(id, func(m *domain.Member) {
		m.PasswordResetCodeHash, m.PasswordResetExpiresAt, m.PasswordResetAttempts = codeHash, expiresAt, 0
	})
	return nil
}

func (s *memStore) RecordPasswordResetFailure(_ context.Context, id string) (int, error) {
	n := 0
	s.update(id, func(m *domain.Member) { m.PasswordResetAttempts++; n = m.PasswordResetAttempts })
	return n, nil
}

func (s *memStore) SetConsent(_ context.Context, id string, c domain.Consent) error {
	s.update(id, func(m *domain.Member) { m.Consent = &c; m.ConsentHistory = append(m.ConsentHistory, c) })
	return nil
}

func (s *memStore) SetAdultVerified(_ context.Context, id, at string) error {
	s.update(id, func(m *domain.Member) { m.AdultVerifiedAt = at })
	return nil
}

func (s *memStore) BumpTokenVersion(_ context.Context, id string) (int, error) {
	n := 0
	s.update(id, func(m *domain.Member) { m.TokenVersion++; n = m.TokenVersion })
	return n, nil
}

func (s *memStore) RecordLoginFailure(_ context.Context, id string) (int, error) {
	n := 0
	s.update(id, func(m *domain.Member) { m.FailedLogins++; n = m.FailedLogins })
	return n, nil
}

func (s *memStore) LockLogin(_ context.Context, id, until string) error {
	s.update(id, func(m *domain.Member) { m.LockedUntil, m.FailedLogins = until, 0; m.LoginLockouts++ })
	return nil
}

func (s *memStore) ClearLoginFailures(_ context.Context, id string) error {
	s.update(id, func(m *domain.Member) {
		m.FailedLogins, m.LoginLockouts, m.LockedUntil, m.MFAChallengeNonce, m.MFAChallengeFailures = 0, 0, "", "", 0
	})
	return nil
}

func (s *memStore) SetMFAChallenge(_ context.Context, id, nonce string) error {
	s.update(id, func(m *domain.Member) { m.MFAChallengeNonce, m.MFAChallengeFailures = nonce, 0 })
	return nil
}

// noClaims backs the verified-badge lookup with "manages nothing".
type noClaims struct{ domain.OrgClaimRepository }

func (noClaims) ManagedOrgIDs(context.Context, string) ([]string, error) { return nil, nil }

const handlerTestPassword = "correct horse battery"

func staffMember(t *testing.T, id, email, role string, mfa bool) *domain.Member {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(handlerTestPassword), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	return &domain.Member{ID: id, Slug: id, DisplayName: "Staff " + id, Email: email, Role: role, MFAEnabled: mfa, PasswordHash: string(hash)}
}

type authFixture struct {
	h      *Handler
	auth   *service.AuthService
	store  *memStore
	router http.Handler
}

func newAuthFixture(production bool, members ...*domain.Member) authFixture {
	store := newMemStore(members...)
	auth := service.NewAuthService(store, "test-secret").WithProduction(production)
	svc := service.New(service.Deps{Members: store, Claims: noClaims{}})
	h := NewHandler(HandlerDeps{Svc: svc, Auth: auth, AuthRequired: true})
	return authFixture{h: h, auth: auth, store: store, router: NewRouter(h, nil, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))}
}

// call sends a JSON request through the full router (Auth middleware included).
func (f authFixture) call(method, path, body, token, remoteAddr string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if remoteAddr != "" {
		req.RemoteAddr = remoteAddr
	}
	res := httptest.NewRecorder()
	f.router.ServeHTTP(res, req)
	return res
}

func decodeJSON(t *testing.T, res *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %q: %v", res.Body.String(), err)
	}
	return out
}

func (f authFixture) login(t *testing.T, identifier string) string {
	t.Helper()
	token, _, err := f.auth.Login(context.Background(), identifier, handlerTestPassword)
	if err != nil {
		t.Fatalf("login %s: %v", identifier, err)
	}
	return token
}

// K1: sign-up needs acceptTerms and records consent; no date of birth leaves
// the server.
func TestRegisterConsentContract(t *testing.T) {
	f := newAuthFixture(false)
	body := `{"identifier":"kwame@example.com","displayName":"Kwame Mensah","dateOfBirth":"1990-04-12","password":"a-strong-password","termsVersion":"2026-10-01","platform":"web"}`
	res := f.call(http.MethodPost, "/api/auth/register", body, "", "")
	if res.Code != http.StatusBadRequest || decodeJSON(t, res)["error"] != "Please agree to the Terms of Use and Privacy Policy to join." {
		t.Fatalf("without acceptTerms: %d %s", res.Code, res.Body.String())
	}

	body = strings.Replace(body, `"platform":"web"`, `"platform":"web","acceptTerms":true`, 1)
	res = f.call(http.MethodPost, "/api/auth/register", body, "", "")
	if res.Code != http.StatusOK {
		t.Fatalf("register: %d %s", res.Code, res.Body.String())
	}
	if strings.Contains(res.Body.String(), "1990-04-12") || strings.Contains(res.Body.String(), "birthday") {
		t.Fatalf("date of birth leaked: %s", res.Body.String())
	}
	member := decodeJSON(t, res)["member"].(map[string]any)
	consent, _ := member["consent"].(map[string]any)
	if member["consentRequired"] != false || member["adultVerified"] != true || consent["termsVersion"] != domain.CurrentTermsVersion || consent["platform"] != "web" {
		t.Fatalf("member = %v", member)
	}

	// K3: an existing identifier is never claimed, and the answer is generic.
	res = f.call(http.MethodPost, "/api/auth/register", body, "", "")
	if res.Code != http.StatusConflict || decodeJSON(t, res)["error"] != msgCannotRegister {
		t.Fatalf("duplicate register: %d %s", res.Code, res.Body.String())
	}
}

// F023/F024/R01: sign-in is throttled per targeted identifier from each
// network — the caller's own token buys no extra guesses — but a stranger
// using up that allowance never blocks the owner's sign-in from elsewhere.
func TestLoginThrottlePerIdentifierAndNetwork(t *testing.T) {
	victim := staffMember(t, "m-victim", "victim@example.com", domain.RoleSteward, false)
	attacker := staffMember(t, "m-attacker", "attacker@example.com", domain.RoleMember, false)
	f := newAuthFixture(false, victim, attacker)
	attackerToken := f.login(t, "attacker@example.com")

	wrong := `{"identifier":"VICTIM@example.com","password":"guess"}`
	const attackerAddr = "203.0.113.9:4000"
	for i := 0; i < loginPerIdentifier; i++ {
		if res := f.call(http.MethodPost, "/api/auth/login", wrong, attackerToken, attackerAddr); res.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: %d %s", i+1, res.Code, res.Body.String())
		}
	}
	if res := f.call(http.MethodPost, "/api/auth/login", wrong, "", attackerAddr); res.Code != http.StatusTooManyRequests {
		t.Fatalf("attempt past the per-identifier limit: %d %s", res.Code, res.Body.String())
	}
	right := `{"identifier":"victim@example.com","password":"` + handlerTestPassword + `"}`
	if res := f.call(http.MethodPost, "/api/auth/login", right, "", "198.51.100.7:4000"); res.Code != http.StatusOK {
		t.Fatalf("owner from their own network: %d %s", res.Code, res.Body.String())
	}
}

// R01: a sign-in lock caused from other networks does not refuse the owner's
// right password, and a password reset stays usable too.
func TestForeignLockDoesNotLockOwnerOut(t *testing.T) {
	f := newAuthFixture(false, staffMember(t, "m-victim", "victim@example.com", domain.RoleSteward, false))
	wrong := `{"identifier":"victim@example.com","password":"guess"}`
	for i := 0; i < 10; i++ { // the service's lock threshold, spread over two networks
		addr := "203.0.113." + string(rune('1'+i%2)) + ":4000"
		if res := f.call(http.MethodPost, "/api/auth/login", wrong, "", addr); res.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: %d %s", i+1, res.Code, res.Body.String())
		}
	}
	right := `{"identifier":"victim@example.com","password":"` + handlerTestPassword + `"}`
	if res := f.call(http.MethodPost, "/api/auth/login", right, "", "203.0.113.1:4000"); res.Code != http.StatusTooManyRequests {
		t.Fatalf("right password from a network that caused the lock: %d %s", res.Code, res.Body.String())
	}
	if res := f.call(http.MethodPost, "/api/auth/login", right, "", "198.51.100.7:4000"); res.Code != http.StatusOK {
		t.Fatalf("owner during a foreign lock: %d %s", res.Code, res.Body.String())
	}
}

func TestClientNetWidensIPv6(t *testing.T) {
	for remote, want := range map[string]string{
		"203.0.113.9:5000":                 "203.0.113.9",
		"[2001:db8:1:2:3:4:5:6]:5000":      "2001:db8:1:2::/64",
		"[2001:db8:1:2:ffff:ffff:1:1]:443": "2001:db8:1:2::/64",
	} {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = remote
		if got := clientNet(req); got != want {
			t.Errorf("clientNet(%s) = %q, want %q", remote, got, want)
		}
	}
}

// F039: unknown account, wrong password and unclaimed invite all get the same
// 401 body.
func TestLoginFailureResponsesAreIdentical(t *testing.T) {
	f := newAuthFixture(false,
		staffMember(t, "m-1", "ama@example.com", domain.RoleMember, false),
		&domain.Member{ID: "m-inv", Email: "invited@example.com", Role: domain.RoleCurator})
	var bodies []string
	for _, body := range []string{
		`{"identifier":"nobody@example.com","password":"whatever-pass"}`,
		`{"identifier":"ama@example.com","password":"whatever-pass"}`,
		`{"identifier":"invited@example.com","password":"whatever-pass"}`,
	} {
		res := f.call(http.MethodPost, "/api/auth/login", body, "", "")
		if res.Code != http.StatusUnauthorized {
			t.Fatalf("%s: %d", body, res.Code)
		}
		bodies = append(bodies, res.Body.String())
	}
	if bodies[0] != bodies[1] || bodies[1] != bodies[2] {
		t.Fatalf("login failures differ: %q", bodies)
	}
}

// F039: a reset confirm answers identically for an unknown account and a
// wrong code.
func TestResetConfirmDoesNotRevealAccounts(t *testing.T) {
	f := newAuthFixture(false, staffMember(t, "m-1", "ama@example.com", domain.RoleMember, false))
	if res := f.call(http.MethodPost, "/api/auth/password/reset/start", `{"identifier":"ama@example.com"}`, "", ""); res.Code != http.StatusOK {
		t.Fatalf("reset start: %d", res.Code)
	}
	unknown := f.call(http.MethodPost, "/api/auth/password/reset/confirm", `{"identifier":"nobody@example.com","code":"123456","newPassword":"brand-new-pass"}`, "", "")
	wrong := f.call(http.MethodPost, "/api/auth/password/reset/confirm", `{"identifier":"ama@example.com","code":"12345x","newPassword":"brand-new-pass"}`, "", "")
	if unknown.Code != http.StatusBadRequest || unknown.Body.String() != wrong.Body.String() {
		t.Fatalf("unknown %d %q vs wrong %d %q", unknown.Code, unknown.Body.String(), wrong.Code, wrong.Body.String())
	}
}

// D9/K4: in production a staff account without two-factor gets 403
// mfa_required on staff routes, acts as a plain member elsewhere, and still
// sees its real role on /api/auth/me.
func TestStaffWithoutMFAHeldBackInProduction(t *testing.T) {
	f := newAuthFixture(true,
		staffMember(t, "m-cur", "curator@example.com", domain.RoleCurator, false),
		staffMember(t, "m-mod", "moderator@example.com", domain.RoleModerator, false))
	probe := f.h.Auth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if m, ok := f.h.requireRole(w, r, domain.RoleCurator, domain.RoleModerator); ok {
			writeJSON(w, http.StatusOK, map[string]string{"role": m.Role})
		}
	}))
	for _, email := range []string{"curator@example.com", "moderator@example.com"} {
		token := f.login(t, email)
		req := httptest.NewRequest(http.MethodGet, "/api/admin/queue", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		res := httptest.NewRecorder()
		probe.ServeHTTP(res, req)
		body := decodeJSON(t, res)
		if res.Code != http.StatusForbidden || body["error"] != "mfa_required" || body["message"] != msgStaffMFARequired {
			t.Fatalf("%s on a staff route: %d %v", email, res.Code, body)
		}
		me := decodeJSON(t, f.call(http.MethodGet, "/api/auth/me", "", token, ""))
		if me["role"] == domain.RoleMember || me["staffMfaRequired"] != true {
			t.Fatalf("%s /api/auth/me = %v", email, me)
		}
	}

	// Once the account has two-factor on, the same session passes.
	session := f.login(t, "curator@example.com")
	f.store.update("m-cur", func(m *domain.Member) { m.MFAEnabled = true })
	req := httptest.NewRequest(http.MethodGet, "/api/admin/queue", nil)
	req.Header.Set("Authorization", "Bearer "+session)
	res := httptest.NewRecorder()
	probe.ServeHTTP(res, req)
	if res.Code != http.StatusOK || decodeJSON(t, res)["role"] != domain.RoleCurator {
		t.Fatalf("curator with two-factor: %d %s", res.Code, res.Body.String())
	}
}

// Outside production nothing is held back (dev and test deployments).
func TestStaffNotHeldBackOutsideProduction(t *testing.T) {
	f := newAuthFixture(false, staffMember(t, "m-cur", "curator@example.com", domain.RoleCurator, false))
	token := f.login(t, "curator@example.com")
	me := decodeJSON(t, f.call(http.MethodGet, "/api/auth/me", "", token, ""))
	if me["role"] != domain.RoleCurator || me["staffMfaRequired"] != false {
		t.Fatalf("dev /api/auth/me = %v", me)
	}
}

// K2: the consent endpoint records acceptance (and the 18+ confirmation an
// invited account needs) and returns the /api/auth/me shape.
func TestConsentEndpoint(t *testing.T) {
	f := newAuthFixture(false, staffMember(t, "m-1", "ama@example.com", domain.RoleMember, false))
	token := f.login(t, "ama@example.com")

	me := decodeJSON(t, f.call(http.MethodGet, "/api/auth/me", "", token, ""))
	if me["consentRequired"] != true || me["adultVerified"] != false {
		t.Fatalf("before consent: %v", me)
	}
	res := f.call(http.MethodPost, "/api/me/consent", `{"acceptTerms":false,"platform":"web"}`, token, "")
	if res.Code != http.StatusBadRequest {
		t.Fatalf("acceptTerms=false: %d", res.Code)
	}
	res = f.call(http.MethodPost, "/api/me/consent", `{"acceptTerms":true,"platform":"web"}`, token, "")
	if res.Code != http.StatusBadRequest || !strings.Contains(res.Body.String(), "18 or older") {
		t.Fatalf("missing 18+ confirmation: %d %s", res.Code, res.Body.String())
	}
	res = f.call(http.MethodPost, "/api/me/consent", `{"acceptTerms":true,"confirmAdult":true,"platform":"ios"}`, token, "")
	body := decodeJSON(t, res)
	if res.Code != http.StatusOK || body["consentRequired"] != false || body["adultVerified"] != true || body["email"] != "ama@example.com" {
		t.Fatalf("consent: %d %v", res.Code, body)
	}
	if res := f.call(http.MethodPost, "/api/me/consent", `{"acceptTerms":true}`, "", ""); res.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous consent: %d", res.Code)
	}
}

// F032: changing the password signs out the old session; the response
// carries the new one.
func TestChangePasswordRevokesOldSession(t *testing.T) {
	f := newAuthFixture(false, staffMember(t, "m-1", "ama@example.com", domain.RoleMember, false))
	old := f.login(t, "ama@example.com")
	res := f.call(http.MethodPost, "/api/me/password", `{"currentPassword":"`+handlerTestPassword+`","newPassword":"brand-new-pass"}`, old, "")
	if res.Code != http.StatusOK {
		t.Fatalf("change password: %d %s", res.Code, res.Body.String())
	}
	fresh, _ := decodeJSON(t, res)["token"].(string)
	if fresh == "" {
		t.Fatal("no fresh token in the response")
	}
	if res := f.call(http.MethodGet, "/api/auth/me", "", old, ""); res.Code != http.StatusUnauthorized {
		t.Fatalf("old session after change: %d", res.Code)
	}
	if res := f.call(http.MethodGet, "/api/auth/me", "", fresh, ""); res.Code != http.StatusOK {
		t.Fatalf("fresh session: %d", res.Code)
	}
}

// D10: a demo identity's session is ignored in production.
func TestDemoSessionIgnoredInProduction(t *testing.T) {
	demo := staffMember(t, "m-nana", "nana-essien@oguaa.test", domain.RoleSteward, false)
	token := newAuthFixture(false, demo).login(t, "nana-essien@oguaa.test")
	prod := newAuthFixture(true, demo)
	if res := prod.call(http.MethodGet, "/api/auth/me", "", token, ""); res.Code != http.StatusUnauthorized {
		t.Fatalf("production demo session: %d", res.Code)
	}
}

func TestClientIP(t *testing.T) {
	cases := []struct {
		name   string
		remote string
		xff    []string
		want   string
	}{
		{"direct client ignores its own header", "203.0.113.9:5000", []string{"6.6.6.6"}, "203.0.113.9"},
		{"behind an internal proxy", "10.0.0.5:5000", []string{"6.6.6.6, 81.97.145.24"}, "81.97.145.24"},
		{"render behind cloudflare", "10.226.90.2:5000", []string{"81.97.145.24, 172.71.195.123, 10.226.90.65"}, "81.97.145.24"},
		{"spoofed chain behind cloudflare", "10.226.90.2:5000", []string{"6.6.6.6, 172.64.0.1, 81.97.145.24, 172.71.195.123, 10.226.90.65"}, "81.97.145.24"},
		{"a cloudflare-range client stops the walk", "10.226.90.2:5000", []string{"6.6.6.6, 2a06:98c0:3600::103, 172.71.195.123, 10.226.90.65"}, "2a06:98c0:3600::103"},
		{"split header lines", "10.0.0.5:5000", []string{"6.6.6.6", "81.97.145.24"}, "81.97.145.24"},
		{"hop with a port", "10.0.0.5:5000", []string{"81.97.145.24:1234"}, "81.97.145.24"},
		{"garbage from the proxy side", "10.0.0.5:5000", []string{"81.97.145.24, not-an-ip"}, "10.0.0.5"},
		{"no header behind a proxy", "10.0.0.5:5000", nil, "10.0.0.5"},
	}
	for _, c := range cases {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = c.remote
		for _, v := range c.xff {
			req.Header.Add("X-Forwarded-For", v)
		}
		if got := clientIP(req); got != c.want {
			t.Errorf("%s: clientIP = %q, want %q", c.name, got, c.want)
		}
	}
}
