package service

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/oguaa/backend/internal/domain"
)

// F020/K3: an invited (password-less) staff account can't be taken over by
// "registering" its identifier, and signing in to it looks exactly like a
// wrong password.
func TestRegisterNeverClaimsAnInvitedAccount(t *testing.T) {
	ctx := context.Background()
	invited := &domain.Member{ID: "m-inv", Slug: "curator", Email: "curator@capecoast.org", Role: domain.RoleCurator}
	repo := newAuthRepo(invited)
	auth := NewAuthService(repo, "secret")

	in := adultSignup("curator@capecoast.org")
	in.DateOfBirth = "1990-01-01"
	if _, _, err := auth.Register(ctx, in); !errors.Is(err, ErrIdentifierTaken) {
		t.Fatalf("Register on an invited account = %v, want ErrIdentifierTaken", err)
	}
	if got := repo.get("m-inv"); got.PasswordHash != "" || got.Role != domain.RoleCurator {
		t.Fatalf("invited account changed: hash=%q role=%q", got.PasswordHash, got.Role)
	}
	if len(repo.inserted) != 0 {
		t.Fatalf("inserted %d accounts, want 0", len(repo.inserted))
	}
	if _, _, err := auth.Login(ctx, "curator@capecoast.org", "anything-at-all"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("Login on an unclaimed invite = %v, want ErrInvalidCredentials", err)
	}
}

// F039: unknown account, wrong password and unclaimed invite are
// indistinguishable; suspension shows only after the right password.
func TestLoginFailuresDoNotRevealAccountState(t *testing.T) {
	ctx := context.Background()
	suspended := memberWithPassword(t, "m-sus", "sus@example.com", domain.RoleMember)
	suspended.Suspended = true
	repo := newAuthRepo(memberWithPassword(t, "m-1", "ama@example.com", domain.RoleMember), suspended,
		&domain.Member{ID: "m-inv", Email: "invited@example.com", Role: domain.RoleSteward})
	auth := NewAuthService(repo, "secret")

	for _, c := range []struct{ identifier, password string }{
		{"nobody@example.com", testPassword},
		{"ama@example.com", "wrong-password"},
		{"invited@example.com", testPassword},
		{"sus@example.com", "wrong-password"},
	} {
		if _, _, err := auth.Login(ctx, c.identifier, c.password); !errors.Is(err, ErrInvalidCredentials) {
			t.Errorf("Login(%s) = %v, want ErrInvalidCredentials", c.identifier, err)
		}
	}
	if _, _, err := auth.Login(ctx, "sus@example.com", testPassword); !errors.Is(err, ErrSuspended) {
		t.Errorf("suspended with the right password = %v, want ErrSuspended", err)
	}
}

// K1/D5/F021: sign-up requires agreeing to the Terms, stores the consent with
// the server's own versions, and keeps no date of birth — neither private nor
// as the public birthday.
func TestRegisterStoresConsentAndAgeCheckNotBirthDate(t *testing.T) {
	ctx := context.Background()
	repo := newAuthRepo()
	auth := NewAuthService(repo, "secret")

	refused := adultSignup("new@example.com")
	refused.AcceptTerms = false
	if _, _, err := auth.Register(ctx, refused); !errors.Is(err, ErrTermsNotAccepted) {
		t.Fatalf("Register without acceptTerms = %v, want ErrTermsNotAccepted", err)
	}
	if len(repo.inserted) != 0 {
		t.Fatal("an account was created without consent")
	}

	in := adultSignup("New@Example.com")
	in.TermsVersion = "1999-01-01" // a stale client version is not what gets recorded
	token, m, err := auth.Register(ctx, in)
	if err != nil || token == "" {
		t.Fatalf("Register: %v", err)
	}
	stored := repo.inserted[0]
	if stored.DateOfBirth != "" || stored.Birthday != "" {
		t.Fatalf("date of birth persisted: dateOfBirth=%q birthday=%q", stored.DateOfBirth, stored.Birthday)
	}
	if stored.AdultVerifiedAt == "" || !AdultVerified(m) {
		t.Fatal("adultVerifiedAt not recorded")
	}
	c := stored.Consent
	if c == nil || c.TermsVersion != domain.CurrentTermsVersion || c.PrivacyVersion != domain.CurrentPrivacyVersion || c.Platform != "ios" || c.AcceptedAt == "" {
		t.Fatalf("consent = %+v", c)
	}
	if len(stored.ConsentHistory) != 1 || ConsentRequired(m) {
		t.Fatalf("history=%d consentRequired=%v", len(stored.ConsentHistory), ConsentRequired(m))
	}
	if stored.Email != "new@example.com" {
		t.Fatalf("email = %q, want lower-cased", stored.Email)
	}
}

func TestRegisterAgeAndInputChecks(t *testing.T) {
	ctx := context.Background()
	auth := NewAuthService(newAuthRepo(), "secret")
	var validation *domain.ValidationError

	noDOB := adultSignup("a@example.com")
	noDOB.DateOfBirth = ""
	if _, _, err := auth.Register(ctx, noDOB); !errors.As(err, &validation) {
		t.Errorf("missing DOB = %v, want ValidationError", err)
	}
	badDOB := adultSignup("b@example.com")
	badDOB.DateOfBirth = "12/04/1990"
	if _, _, err := auth.Register(ctx, badDOB); !errors.As(err, &validation) {
		t.Errorf("malformed DOB = %v, want ValidationError", err)
	}
	minor := adultSignup("c@example.com")
	minor.DateOfBirth = time.Now().UTC().AddDate(-17, 0, 0).Format(time.DateOnly)
	if _, _, err := auth.Register(ctx, minor); !errors.Is(err, ErrUnderage) {
		t.Errorf("17-year-old = %v, want ErrUnderage", err)
	}
	short := adultSignup("d@example.com")
	short.Password = "short"
	if _, _, err := auth.Register(ctx, short); !errors.As(err, &validation) {
		t.Errorf("short password = %v, want ValidationError", err)
	}
}

// K2/G101: an invitee claims the account through the reset flow, then must
// accept the Terms and confirm they are 18+ before the consent gate clears.
func TestInviteeClaimsThroughResetThenConsents(t *testing.T) {
	ctx := context.Background()
	repo := newAuthRepo(&domain.Member{ID: "m-inv", Email: "editor@example.com", Role: domain.RoleEditor})
	auth := NewAuthService(repo, "secret")

	_, code, err := auth.StartPasswordReset(ctx, "editor@example.com")
	if err != nil {
		t.Fatalf("StartPasswordReset: %v", err)
	}
	if err := auth.ConfirmPasswordReset(ctx, "editor@example.com", code, "my-new-password"); err != nil {
		t.Fatalf("ConfirmPasswordReset: %v", err)
	}
	_, m, err := auth.Login(ctx, "editor@example.com", "my-new-password")
	if err != nil {
		t.Fatalf("Login after claiming: %v", err)
	}
	if !ConsentRequired(m) || AdultVerified(m) {
		t.Fatalf("claimed invite: consentRequired=%v adultVerified=%v, want true/false", ConsentRequired(m), AdultVerified(m))
	}
	if _, err := auth.RecordConsent(ctx, m.ID, ConsentInput{AcceptTerms: false, ConfirmAdult: true}); !errors.Is(err, ErrTermsNotAccepted) {
		t.Fatalf("consent without acceptTerms = %v", err)
	}
	if _, err := auth.RecordConsent(ctx, m.ID, ConsentInput{AcceptTerms: true, Platform: "web"}); !errors.Is(err, ErrAdultConfirmationRequired) {
		t.Fatalf("consent without the 18+ confirmation = %v", err)
	}
	updated, err := auth.RecordConsent(ctx, m.ID, ConsentInput{AcceptTerms: true, ConfirmAdult: true, Platform: "android"})
	if err != nil {
		t.Fatalf("RecordConsent: %v", err)
	}
	stored := repo.get("m-inv")
	if ConsentRequired(updated) || !AdultVerified(updated) || stored.AdultVerifiedAt == "" || stored.Consent.Platform != "android" {
		t.Fatalf("after consent: required=%v adult=%v stored=%+v", ConsentRequired(updated), AdultVerified(updated), stored.Consent)
	}
}

func TestConsentRequiredForOlderVersions(t *testing.T) {
	m := &domain.Member{Consent: &domain.Consent{TermsVersion: "2025-01-01", PrivacyVersion: domain.CurrentPrivacyVersion}}
	if !ConsentRequired(m) {
		t.Error("older terms version should require consent")
	}
	m.Consent = &domain.Consent{TermsVersion: domain.CurrentTermsVersion, PrivacyVersion: domain.CurrentPrivacyVersion}
	if ConsentRequired(m) {
		t.Error("current versions should not require consent")
	}
	if !ConsentRequired(&domain.Member{}) {
		t.Error("no consent should require consent")
	}
	legacy := &domain.Member{DateOfBirth: "1980-02-02"}
	if !AdultVerified(legacy) {
		t.Error("a legacy stored adult DOB should count until migrated")
	}
}

// G105: repeated failures lock sign-in, even for the right password, until
// the lock lifts; success then clears the counters.
func TestLoginLocksAfterRepeatedFailures(t *testing.T) {
	ctx := context.Background()
	repo := newAuthRepo(memberWithPassword(t, "m-1", "ama@example.com", domain.RoleMember))
	auth := NewAuthService(repo, "secret")

	for i := 0; i < loginLockThreshold; i++ {
		if _, _, err := auth.Login(ctx, "ama@example.com", "guess"); !errors.Is(err, ErrInvalidCredentials) {
			t.Fatalf("attempt %d = %v", i+1, err)
		}
	}
	if repo.get("m-1").LockedUntil == "" {
		t.Fatal("account not locked after the threshold")
	}
	if _, _, err := auth.Login(ctx, "ama@example.com", testPassword); !errors.Is(err, ErrAccountLocked) {
		t.Fatalf("right password while locked = %v, want ErrAccountLocked", err)
	}
	repo.get("m-1").LockedUntil = time.Now().UTC().Add(-time.Minute).Format(time.RFC3339)
	if _, _, err := auth.Login(ctx, "ama@example.com", testPassword); err != nil {
		t.Fatalf("login after the lock lifted: %v", err)
	}
	if m := repo.get("m-1"); m.FailedLogins != 0 || m.LoginLockouts != 0 || m.LockedUntil != "" {
		t.Fatalf("counters not cleared: %+v", m)
	}
}

// R01: a lock someone else caused never refuses the owner's right password
// from their own network. The sources that caused it stay locked, and a
// wrong password anywhere still gets the lock answer.
func TestLoginLockBindsOnlyTheSourcesThatCausedIt(t *testing.T) {
	ctx := context.Background()
	repo := newAuthRepo(memberWithPassword(t, "m-1", "ama@example.com", domain.RoleMember))
	auth := NewAuthService(repo, "secret")

	attackers := []context.Context{WithRequestSource(ctx, "203.0.113.1"), WithRequestSource(ctx, "203.0.113.2")}
	for i := 0; i < loginLockThreshold; i++ {
		if _, _, err := auth.Login(attackers[i%2], "ama@example.com", "guess"); !errors.Is(err, ErrInvalidCredentials) {
			t.Fatalf("attempt %d = %v", i+1, err)
		}
	}
	if repo.get("m-1").LockedUntil == "" {
		t.Fatal("account not locked after the threshold")
	}
	// Even the right password from a source that caused the lock is refused.
	if _, _, err := auth.Login(attackers[0], "ama@example.com", testPassword); !errors.Is(err, ErrAccountLocked) {
		t.Fatalf("attacker source with the right password = %v, want ErrAccountLocked", err)
	}
	owner := WithRequestSource(ctx, "198.51.100.7")
	// The owner's own typos while locked get the lock answer, not a hint.
	if _, _, err := auth.Login(owner, "ama@example.com", "typo"); !errors.Is(err, ErrAccountLocked) {
		t.Fatalf("wrong password while locked = %v, want ErrAccountLocked", err)
	}
	if _, _, err := auth.Login(owner, "ama@example.com", testPassword); err != nil {
		t.Fatalf("owner's right password during someone else's lock: %v", err)
	}
	if m := repo.get("m-1"); m.LockedUntil != "" || m.FailedLogins != 0 {
		t.Fatalf("success did not clear the lock: %+v", m)
	}
	if _, _, err := auth.Login(attackers[0], "ama@example.com", testPassword); err != nil {
		t.Fatalf("after the owner's success the lock is gone for everyone: %v", err)
	}
}

// R01: with two-factor on, the owner gets the challenge and completes it
// during a lock someone else caused.
func TestMFALoginDuringForeignLock(t *testing.T) {
	ctx := context.Background()
	repo := newAuthRepo(memberWithPassword(t, "m-1", "ama@example.com", domain.RoleMember))
	auth := NewAuthService(repo, "secret")
	secret, _ := enrolMFA(t, auth, "m-1", "")

	attacker := WithRequestSource(ctx, "203.0.113.1")
	for i := 0; i < loginLockThreshold; i++ {
		_, _, _ = auth.Login(attacker, "ama@example.com", "guess")
	}
	if repo.get("m-1").LockedUntil == "" {
		t.Fatal("account not locked")
	}
	owner := WithRequestSource(ctx, "198.51.100.7")
	challenge, _, err := auth.Login(owner, "ama@example.com", testPassword)
	if err != nil {
		t.Fatalf("owner's password step: %v", err)
	}
	code, _ := totpCode(secret, time.Now())
	if _, _, err := auth.MFALogin(owner, challenge, code); err != nil {
		t.Fatalf("owner's code step: %v", err)
	}
}

func TestLoginLockDurationDoublesToACap(t *testing.T) {
	for previous, want := range map[int]time.Duration{0: 15 * time.Minute, 1: 30 * time.Minute, 2: time.Hour, 4: 4 * time.Hour, 9: 4 * time.Hour} {
		if got := loginLockDuration(previous); got != want {
			t.Errorf("loginLockDuration(%d) = %v, want %v", previous, got, want)
		}
	}
}

// F024/G105/R01: one source gets maxCodeAttempts guesses at a reset code,
// but a stranger's guesses never spend the owner's: the right code from
// another source still works. Spraying from many sources kills the code
// once resetCodeMaxGuesses wrong guesses have landed in total.
func TestResetCodeGuessBudgetIsPerSource(t *testing.T) {
	ctx := context.Background()
	repo := newAuthRepo(memberWithPassword(t, "m-1", "ama@example.com", domain.RoleMember))
	auth := NewAuthService(repo, "secret")

	_, code, err := auth.StartPasswordReset(ctx, "ama@example.com")
	if err != nil {
		t.Fatal(err)
	}
	wrong := "000000"
	if code == wrong {
		wrong = "111111"
	}
	attacker := WithRequestSource(ctx, "203.0.113.9")
	for i := 0; i < maxCodeAttempts; i++ {
		if err := auth.ConfirmPasswordReset(attacker, "ama@example.com", wrong, "attacker-pass"); !errors.Is(err, ErrInvalidResetCode) {
			t.Fatalf("guess %d = %v", i+1, err)
		}
	}
	// The spent source is refused even with the right code.
	if err := auth.ConfirmPasswordReset(attacker, "ama@example.com", code, "attacker-pass"); !errors.Is(err, ErrInvalidResetCode) {
		t.Fatalf("right code from a spent source = %v, want ErrInvalidResetCode", err)
	}
	// The owner, from their own network, still resets with the code they got.
	owner := WithRequestSource(ctx, "198.51.100.7")
	if err := auth.ConfirmPasswordReset(owner, "ama@example.com", code, "brand-new-pass"); err != nil {
		t.Fatalf("owner's right code after a stranger's guesses: %v", err)
	}
}

func TestResetCodeDiesAfterTooManyGuessesOverall(t *testing.T) {
	ctx := context.Background()
	repo := newAuthRepo(memberWithPassword(t, "m-1", "ama@example.com", domain.RoleMember))
	auth := NewAuthService(repo, "secret")

	_, code, err := auth.StartPasswordReset(ctx, "ama@example.com")
	if err != nil {
		t.Fatal(err)
	}
	wrong := "000000"
	if code == wrong {
		wrong = "111111"
	}
	for i := 0; i < resetCodeMaxGuesses; i++ {
		src := WithRequestSource(ctx, fmt.Sprintf("203.0.113.%d", i/maxCodeAttempts))
		if err := auth.ConfirmPasswordReset(src, "ama@example.com", wrong, "attacker-pass"); !errors.Is(err, ErrInvalidResetCode) {
			t.Fatalf("guess %d = %v", i+1, err)
		}
	}
	owner := WithRequestSource(ctx, "198.51.100.7")
	if err := auth.ConfirmPasswordReset(owner, "ama@example.com", code, "brand-new-pass"); !errors.Is(err, ErrResetNotStarted) {
		t.Fatalf("right code after the overall limit = %v, want ErrResetNotStarted", err)
	}
	// A fresh code gets a fresh allowance, for every source.
	_, code, _ = auth.StartPasswordReset(ctx, "ama@example.com")
	if err := auth.ConfirmPasswordReset(WithRequestSource(ctx, "203.0.113.0"), "ama@example.com", code, "brand-new-pass"); err != nil {
		t.Fatalf("fresh code: %v", err)
	}
}

// F032: a password reset signs out every existing session.
func TestPasswordResetRevokesSessions(t *testing.T) {
	ctx := context.Background()
	repo := newAuthRepo(memberWithPassword(t, "m-1", "ama@example.com", domain.RoleMember))
	auth := NewAuthService(repo, "secret")

	stolen, _, err := auth.Login(ctx, "ama@example.com", testPassword)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := auth.Authenticate(ctx, stolen); err != nil {
		t.Fatalf("fresh session rejected: %v", err)
	}
	_, code, _ := auth.StartPasswordReset(ctx, "ama@example.com")
	if err := auth.ConfirmPasswordReset(ctx, "ama@example.com", code, "brand-new-pass"); err != nil {
		t.Fatal(err)
	}
	if _, err := auth.Authenticate(ctx, stolen); !errors.Is(err, ErrSessionRevoked) {
		t.Fatalf("session after reset = %v, want ErrSessionRevoked", err)
	}
	fresh, _, err := auth.Login(ctx, "ama@example.com", "brand-new-pass")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := auth.Authenticate(ctx, fresh); err != nil {
		t.Fatalf("new session rejected: %v", err)
	}
}

// F032: a password change revokes the other sessions and hands the caller a
// fresh one.
func TestChangePasswordRotatesSessions(t *testing.T) {
	ctx := context.Background()
	repo := newAuthRepo(memberWithPassword(t, "m-1", "ama@example.com", domain.RoleMember))
	auth := NewAuthService(repo, "secret")

	old, _, _ := auth.Login(ctx, "ama@example.com", testPassword)
	if _, err := auth.ChangePassword(ctx, "m-1", "wrong", "brand-new-pass"); !errors.Is(err, ErrCurrentPasswordWrong) {
		t.Fatalf("wrong current password = %v", err)
	}
	fresh, err := auth.ChangePassword(ctx, "m-1", testPassword, "brand-new-pass")
	if err != nil || fresh == "" {
		t.Fatalf("ChangePassword: %v", err)
	}
	if _, err := auth.Authenticate(ctx, old); !errors.Is(err, ErrSessionRevoked) {
		t.Fatalf("old session = %v, want ErrSessionRevoked", err)
	}
	if _, err := auth.Authenticate(ctx, fresh); err != nil {
		t.Fatalf("fresh session rejected: %v", err)
	}
}

// Sessions minted before token versions existed carry no "tv" claim and keep
// working until the member's version is first bumped.
func TestAuthenticateAcceptsLegacyTokenUntilRevoked(t *testing.T) {
	ctx := context.Background()
	repo := newAuthRepo(memberWithPassword(t, "m-1", "ama@example.com", domain.RoleMember))
	auth := NewAuthService(repo, "secret")
	legacy, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "m-1", "iat": time.Now().Unix(), "exp": time.Now().Add(time.Hour).Unix(),
	}).SignedString([]byte("secret"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := auth.Authenticate(ctx, legacy); err != nil {
		t.Fatalf("legacy session rejected: %v", err)
	}
	repo.get("m-1").TokenVersion = 1
	if _, err := auth.Authenticate(ctx, legacy); !errors.Is(err, ErrSessionRevoked) {
		t.Fatalf("legacy session after a bump = %v, want ErrSessionRevoked", err)
	}
	repo.get("m-1").TokenVersion = 0
	repo.get("m-1").Suspended = true
	if _, err := auth.Authenticate(ctx, legacy); !errors.Is(err, ErrSuspended) {
		t.Fatalf("suspended session = %v, want ErrSuspended", err)
	}
}

// D10: in production the seeded demo identities can't sign in (by email or
// phone), register, reset a password or keep an old session.
func TestDemoIdentitiesRefusedInProduction(t *testing.T) {
	ctx := context.Background()
	demo := memberWithPassword(t, "m-nana", "nana-essien@oguaa.test", domain.RoleSteward)
	demo.Phone = "+233240000004"
	repo := newAuthRepo(demo)
	dev := NewAuthService(repo, "secret")
	// A live phone channel, so the phone reset below reaches the demo check.
	prod := NewAuthService(repo, "secret").WithProduction(true).WithNotifiers(nil, &okSender{})

	devToken, _, err := dev.Login(ctx, "nana-essien@oguaa.test", testPassword)
	if err != nil {
		t.Fatalf("dev login with a demo identity: %v", err)
	}
	for _, id := range []string{"nana-essien@oguaa.test", "+233240000004"} {
		if _, _, err := prod.Login(ctx, id, testPassword); !errors.Is(err, ErrInvalidCredentials) {
			t.Errorf("production login as %s = %v, want ErrInvalidCredentials", id, err)
		}
	}
	if _, err := prod.Authenticate(ctx, devToken); err == nil {
		t.Error("production accepted a demo identity's session")
	}
	var validation *domain.ValidationError
	if _, _, err := prod.Register(ctx, adultSignup("someone-new@oguaa.test")); !errors.As(err, &validation) {
		t.Errorf("production register with a demo address = %v, want ValidationError", err)
	}
	if _, _, err := prod.StartPasswordReset(ctx, "+233240000004"); !errors.Is(err, ErrResetAccountNotFound) {
		t.Errorf("production reset for a demo identity = %v, want ErrResetAccountNotFound", err)
	}
}

// D9: only production staff accounts without two-factor are held back.
func TestStaffMFARequired(t *testing.T) {
	prod := NewAuthService(newAuthRepo(), "secret").WithProduction(true)
	dev := NewAuthService(newAuthRepo(), "secret")
	for _, c := range []struct {
		m    *domain.Member
		want bool
	}{
		{&domain.Member{Role: domain.RoleCurator}, true},
		{&domain.Member{Role: domain.RoleModerator}, true},
		{&domain.Member{Role: domain.RoleVettingOfficer}, true},
		{&domain.Member{Role: domain.RoleSteward, MFAEnabled: true}, false},
		{&domain.Member{Role: domain.RoleMember}, false},
	} {
		if got := prod.StaffMFARequired(c.m); got != c.want {
			t.Errorf("production StaffMFARequired(%s, mfa=%v) = %v, want %v", c.m.Role, c.m.MFAEnabled, got, c.want)
		}
		if dev.StaffMFARequired(c.m) {
			t.Errorf("dev held back %s", c.m.Role)
		}
	}
}

// F038: member slugs are unique — a taken slug is never handed out again.
func TestUniqueMemberSlugSkipsTakenSlugs(t *testing.T) {
	ctx := context.Background()
	repo := newAuthRepo()
	seen := map[string]bool{}
	for i := 0; i < 50; i++ {
		slug, err := UniqueMemberSlug(ctx, repo, "Kwame Mensah")
		if err != nil {
			t.Fatal(err)
		}
		if seen[slug] {
			t.Fatalf("slug %q handed out twice", slug)
		}
		seen[slug] = true
		repo.byID["m-"+slug] = &domain.Member{ID: "m-" + slug, Slug: slug}
	}
	auth := NewAuthService(repo, "secret")
	_, a, err := auth.Register(ctx, adultSignup("one@example.com"))
	if err != nil {
		t.Fatal(err)
	}
	_, b, err := auth.Register(ctx, adultSignup("two@example.com"))
	if err != nil {
		t.Fatal(err)
	}
	if a.Slug == b.Slug || a.ID == b.ID {
		t.Fatalf("two members share slug/id: %q/%q %q/%q", a.Slug, b.Slug, a.ID, b.ID)
	}
}

// Lifting a suspension never revives a session issued before it.
func TestSuspensionRevokesSessions(t *testing.T) {
	ctx := context.Background()
	repo := newAuthRepo(memberWithPassword(t, "m-1", "ama@example.com", domain.RoleMember))
	auth := NewAuthService(repo, "secret")
	svc := New(Deps{Members: repo})
	token, _, err := auth.Login(ctx, "ama@example.com", testPassword)
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.SuspendMember(ctx, "m-1", true); err != nil {
		t.Fatal(err)
	}
	if _, err := auth.Authenticate(ctx, token); !errors.Is(err, ErrSuspended) {
		t.Fatalf("suspended session = %v, want ErrSuspended", err)
	}
	if err := svc.SuspendMember(ctx, "m-1", false); err != nil {
		t.Fatal(err)
	}
	if _, err := auth.Authenticate(ctx, token); !errors.Is(err, ErrSessionRevoked) {
		t.Fatalf("session after unsuspending = %v, want ErrSessionRevoked", err)
	}
}

// F038: two invited staff with the same name get different slugs.
func TestInviteMemberSlugsAreUnique(t *testing.T) {
	ctx := context.Background()
	svc := New(Deps{Members: newAuthRepo()})
	a, err := svc.InviteMember(ctx, "kofi.one@example.com", "Kofi Mensah", domain.RoleCurator)
	if err != nil {
		t.Fatal(err)
	}
	b, err := svc.InviteMember(ctx, "kofi.two@example.com", "Kofi Mensah", domain.RoleCurator)
	if err != nil {
		t.Fatal(err)
	}
	if a.Slug == b.Slug {
		t.Fatalf("both invites got slug %q", a.Slug)
	}
}

// R29: an erased member's "Former member" tombstone can never be reactivated,
// and none of the person's old sessions work on it even if the lock were
// lifted by other means — whether the tombstone replaced the record in place
// or (R15) moved to a new random id, deleting the name-bearing original.
func TestErasedAccountStaysLockedAndSessionsDead(t *testing.T) {
	for name, tombstoneID := range map[string]string{"in place": "m-1", "moved": "erased-0123456789abcdef"} {
		ctx := context.Background()
		repo := newAuthRepo(memberWithPassword(t, "m-1", "ama@example.com", domain.RoleMember))
		auth := NewAuthService(repo, "secret")
		svc := New(Deps{Members: repo})
		member, err := repo.ByID(ctx, "m-1")
		if err != nil {
			t.Fatal(err)
		}
		token, _, err := auth.Login(ctx, "ama@example.com", testPassword)
		if err != nil {
			t.Fatal(err)
		}
		if err := repo.Anonymize(ctx, "m-1", tombstoneID); err != nil {
			t.Fatal(err)
		}
		if tombstoneID != "m-1" && repo.get("m-1") != nil {
			t.Fatalf("%s: the original record survived the erasure", name)
		}
		var ve *domain.ValidationError
		if err := svc.SuspendMember(ctx, tombstoneID, false); !errors.As(err, &ve) {
			t.Fatalf("%s: unsuspending an erased account: err = %v, want a refusal", name, err)
		}
		if !repo.get(tombstoneID).Suspended {
			t.Fatalf("%s: the erased account was reactivated", name)
		}
		// Even with the lock lifted directly, no session issued before the
		// erasure works: not the person's own, nor one under the tombstone's
		// id at the version the account had.
		repo.get(tombstoneID).Suspended = false
		if _, err := auth.Authenticate(ctx, token); err == nil {
			t.Fatalf("%s: the person's old session still signs in", name)
		}
		member.ID = tombstoneID
		stale, err := auth.issue(member)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := auth.Authenticate(ctx, stale); !errors.Is(err, ErrSessionRevoked) {
			t.Fatalf("%s: pre-erasure session on the tombstone = %v, want ErrSessionRevoked", name, err)
		}
		// Suspending (again) stays allowed.
		if err := svc.SuspendMember(ctx, tombstoneID, true); err != nil {
			t.Fatalf("%s: suspending an erased account: %v", name, err)
		}
	}
}
