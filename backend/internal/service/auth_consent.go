package service

import (
	"context"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── consent & age (contracts K1/K2, decisions D5/D8) ─────────────────────────

// newConsent records acceptance of the notice versions in force now. The
// versions are always the server's own, never a client-supplied value.
func newConsent(platform string, at time.Time) domain.Consent {
	return domain.Consent{
		TermsVersion:   domain.CurrentTermsVersion,
		PrivacyVersion: domain.CurrentPrivacyVersion,
		AcceptedAt:     at.UTC().Format(time.RFC3339),
		Platform:       domain.ConsentPlatform(platform),
	}
}

// ConsentRequired reports whether the member must (re-)accept the Terms of Use
// and Privacy Policy: they never accepted, or accepted an older version.
// Invited and pre-consent accounts start here; clients show a blocking dialog.
func ConsentRequired(m *domain.Member) bool {
	return m != nil && !m.Consent.Current()
}

// AdultVerified reports whether the member is confirmed 18 or older: checked
// at sign-up, or confirmed by the member. Accounts not yet migrated by
// cmd/migratedob still count when their stored date of birth shows 18+.
func AdultVerified(m *domain.Member) bool {
	if m == nil {
		return false
	}
	return m.AdultVerifiedAt != "" || (m.DateOfBirth != "" && isAdult(m.DateOfBirth, time.Now().UTC()))
}

// AdultByDateOfBirth reports whether someone born on dob ("YYYY-MM-DD") is 18
// or older on now. A malformed date is not adult (the check fails closed).
// cmd/migratedob uses it to turn legacy stored dates into adultVerifiedAt.
func AdultByDateOfBirth(dob string, now time.Time) bool { return isAdult(dob, now) }

// ConsentInput is a signed-in member's answer to the consent dialog (K2).
type ConsentInput struct {
	AcceptTerms  bool // must be true
	ConfirmAdult bool // "I confirm I am 18 or older"; required when the age was never verified
	Platform     string
}

// RecordConsent stores the member's acceptance of the current Terms of Use and
// Privacy Policy and, when confirmed, that they are 18 or older. A member whose
// age was never verified (an invited or pre-consent account) must confirm it.
// Returns the updated member.
func (a *AuthService) RecordConsent(ctx context.Context, memberID string, in ConsentInput) (*domain.Member, error) {
	if !in.AcceptTerms {
		return nil, ErrTermsNotAccepted
	}
	m, err := a.members.ByID(ctx, memberID)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	if m.AdultVerifiedAt == "" {
		if !in.ConfirmAdult && !AdultVerified(m) {
			return nil, ErrAdultConfirmationRequired
		}
		if in.ConfirmAdult {
			at := now.Format(time.RFC3339)
			if err := a.members.SetAdultVerified(ctx, m.ID, at); err != nil {
				return nil, err
			}
			m.AdultVerifiedAt = at
		}
	}
	consent := newConsent(in.Platform, now)
	if err := a.members.SetConsent(ctx, m.ID, consent); err != nil {
		return nil, err
	}
	m.Consent = &consent
	m.ConsentHistory = append(m.ConsentHistory, consent)
	return m, nil
}
