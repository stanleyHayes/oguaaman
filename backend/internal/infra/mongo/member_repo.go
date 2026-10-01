package mongo

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// Member document fields written by more than one of the sign-in guard methods.
const (
	memberFailedLogins          = "failedLogins"
	memberLoginLockouts         = "loginLockouts"
	memberLockedUntil           = "lockedUntil"
	memberMFAChallengeNonce     = "mfaChallengeNonce"
	memberMFAChallengeFailures  = "mfaChallengeFailures"
	memberPendingTOTPSecret     = "pendingTotpSecret"
	memberPasswordResetAttempts = "passwordResetAttempts"
)

type MemberRepo struct{ c *mongo.Collection }

func NewMemberRepo(db *mongo.Database) *MemberRepo { return &MemberRepo{db.Collection(collMembers)} }

func (r *MemberRepo) All(ctx context.Context) ([]domain.Member, error) {
	cur, err := r.c.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	out := []domain.Member{}
	return out, cur.All(ctx, &out)
}

func (r *MemberRepo) ByID(ctx context.Context, id string) (*domain.Member, error) {
	var m domain.Member
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&m); err != nil {
		return nil, notFound("member", err)
	}
	return &m, nil
}

func (r *MemberRepo) BySlug(ctx context.Context, slug string) (*domain.Member, error) {
	var m domain.Member
	if err := r.c.FindOne(ctx, bson.M{"slug": slug}).Decode(&m); err != nil {
		return nil, notFound("member", err)
	}
	return &m, nil
}

func (r *MemberRepo) ByIdentifier(ctx context.Context, identifier string) (*domain.Member, error) {
	var m domain.Member
	q := bson.M{"$or": []bson.M{{"phone": identifier}, {"email": identifier}}}
	if err := r.c.FindOne(ctx, q).Decode(&m); err != nil {
		return nil, notFound("member", err)
	}
	return &m, nil
}

func (r *MemberRepo) Insert(ctx context.Context, m domain.Member) error {
	_, err := r.c.InsertOne(ctx, m)
	return err
}

func (r *MemberRepo) SetPhoneVerified(ctx context.Context, id string, verified bool) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{
		"phoneVerified":              verified,
		"phoneVerificationCodeHash":  "",
		"phoneVerificationExpiresAt": "",
	}})
	return err
}

func (r *MemberRepo) SetPhoneVerification(ctx context.Context, id, codeHash, expiresAt string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{
		"phoneVerified":              false,
		"phoneVerificationCodeHash":  codeHash,
		"phoneVerificationExpiresAt": expiresAt,
	}})
	return err
}

// SetPasswordReset stores (or clears, with empty args) the password-reset code
// hash and expiry backing the "forgot password" flow, and resets the wrong-guess
// counter so every code gets its own allowance. Mirrors SetPhoneVerification.
func (r *MemberRepo) SetPasswordReset(ctx context.Context, id, codeHash, expiresAt string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{
		"$set": bson.M{
			"passwordResetCodeHash":  codeHash,
			"passwordResetExpiresAt": expiresAt,
		},
		"$unset": bson.M{memberPasswordResetAttempts: ""},
	})
	return err
}

// RecordPasswordResetFailure counts a wrong guess against the current reset
// code and returns the new count.
func (r *MemberRepo) RecordPasswordResetFailure(ctx context.Context, id string) (int, error) {
	return r.increment(ctx, id, memberPasswordResetAttempts)
}

// increment atomically adds one to a numeric member field and returns the new
// value.
func (r *MemberRepo) increment(ctx context.Context, id, field string) (int, error) {
	var out bson.M
	err := r.c.FindOneAndUpdate(ctx,
		bson.M{"_id": id},
		bson.M{"$inc": bson.M{field: 1}},
		options.FindOneAndUpdate().SetReturnDocument(options.After).SetProjection(bson.M{field: 1}),
	).Decode(&out)
	if err != nil {
		return 0, notFound("member", err)
	}
	return toInt(out[field]), nil
}

// SetAdultVerified records when (RFC3339) the member was confirmed 18+.
func (r *MemberRepo) SetAdultVerified(ctx context.Context, id, at string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"adultVerifiedAt": at}})
	return err
}

// consentHistoryCap bounds the per-member acceptance history kept as evidence.
const consentHistoryCap = 50

// SetConsent stores the member's current Terms/Privacy acceptance and appends
// it to the (capped) consent history.
func (r *MemberRepo) SetConsent(ctx context.Context, id string, c domain.Consent) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{
		"$set":  bson.M{"consent": c},
		"$push": bson.M{"consentHistory": bson.M{"$each": []domain.Consent{c}, "$slice": -consentHistoryCap}},
	})
	return err
}

// BumpTokenVersion revokes every session issued so far and returns the new
// version.
func (r *MemberRepo) BumpTokenVersion(ctx context.Context, id string) (int, error) {
	return r.increment(ctx, id, memberTokenVersion)
}

// RecordLoginFailure counts a failed sign-in attempt and returns the
// consecutive failure count.
func (r *MemberRepo) RecordLoginFailure(ctx context.Context, id string) (int, error) {
	return r.increment(ctx, id, memberFailedLogins)
}

// LockLogin blocks sign-in until `until`, counts the lockout and starts a fresh
// failure count for when the lock lifts.
func (r *MemberRepo) LockLogin(ctx context.Context, id, until string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{
		"$set":   bson.M{memberLockedUntil: until},
		"$inc":   bson.M{memberLoginLockouts: 1},
		"$unset": bson.M{memberFailedLogins: ""},
	})
	return err
}

// ClearLoginFailures forgets failed attempts, lockouts and any outstanding
// two-factor challenge.
func (r *MemberRepo) ClearLoginFailures(ctx context.Context, id string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$unset": bson.M{
		memberFailedLogins: "", memberLoginLockouts: "", memberLockedUntil: "",
		memberMFAChallengeNonce: "", memberMFAChallengeFailures: "",
	}})
	return err
}

// SetMFAChallenge binds (or, with "", clears) the outstanding two-factor
// sign-in challenge and resets its wrong-code count.
func (r *MemberRepo) SetMFAChallenge(ctx context.Context, id, nonce string) error {
	update := bson.M{
		"$set":   bson.M{memberMFAChallengeNonce: nonce},
		"$unset": bson.M{memberMFAChallengeFailures: ""},
	}
	if nonce == "" {
		update = bson.M{"$unset": bson.M{memberMFAChallengeNonce: "", memberMFAChallengeFailures: ""}}
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, update)
	return err
}

// RecordMFAChallengeFailure counts a wrong code against the outstanding
// challenge and returns the new count.
func (r *MemberRepo) RecordMFAChallengeFailure(ctx context.Context, id string) (int, error) {
	return r.increment(ctx, id, memberMFAChallengeFailures)
}

// SetPendingMFA stores (or, with "", clears) an authenticator secret waiting
// for its first code.
func (r *MemberRepo) SetPendingMFA(ctx context.Context, id, secret string) error {
	update := bson.M{"$set": bson.M{memberPendingTOTPSecret: secret}}
	if secret == "" {
		update = bson.M{"$unset": bson.M{memberPendingTOTPSecret: ""}}
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, update)
	return err
}

func (r *MemberRepo) UpdateRole(ctx context.Context, id, role string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"role": role}})
	return err
}

func (r *MemberRepo) SetSuspended(ctx context.Context, id string, suspended bool) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"suspended": suspended}})
	return err
}

func (r *MemberRepo) SetBirthday(ctx context.Context, id, birthday string, broadcast bool) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"birthday": birthday, "broadcastBirthday": broadcast}})
	return err
}

func (r *MemberRepo) SetAffiliations(ctx context.Context, id, townID, asafoID string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"townId": townID, "asafoId": asafoID}})
	return err
}

func (r *MemberRepo) SetPhoto(ctx context.Context, id, photoURL string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"photoUrl": photoURL}})
	return err
}

func (r *MemberRepo) SetProfile(ctx context.Context, id, displayName, initials, bio string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"displayName": displayName, "initials": initials, "bio": bio}})
	return err
}

func (r *MemberRepo) SetPasswordHash(ctx context.Context, id, hash string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"passwordHash": hash}})
	return err
}

func (r *MemberRepo) SetDiaspora(ctx context.Context, id string, d *domain.Diaspora) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"diaspora": d}})
	return err
}

// SetLinks replaces the member's social/contact links (Creator Platform plan §3).
func (r *MemberRepo) SetLinks(ctx context.Context, id string, links []domain.SocialLink) error {
	if links == nil {
		links = []domain.SocialLink{}
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"links": links}})
	return err
}

// SetNotificationPrefs stores the member's notification preferences (K14).
func (r *MemberRepo) SetNotificationPrefs(ctx context.Context, id string, prefs domain.NotificationPrefs) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"notificationPrefs": prefs}})
	return err
}

// SetAIConsent records (RFC3339 at) or withdraws (at == "") the member's
// consent to the AI writing assistant (K15).
func (r *MemberRepo) SetAIConsent(ctx context.Context, id, at string) error {
	update := bson.M{"$set": bson.M{"aiConsentAt": at}}
	if at == "" {
		update = bson.M{"$unset": bson.M{"aiConsentAt": ""}}
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, update)
	return err
}

// NotificationOptOuts lists the ids of members who switched a channel off —
// or, when category is non-empty, that category — so a push fan-out can skip
// them (service.PushPreferences). Members who never chose keep the defaults
// and never match.
func (r *MemberRepo) NotificationOptOuts(ctx context.Context, channel, category string) ([]string, error) {
	or := bson.A{bson.M{"notificationPrefs.channels." + channel: false}}
	if category != "" {
		or = append(or, bson.M{"notificationPrefs.categories." + category: false})
	}
	cur, err := r.c.Find(ctx, bson.M{"$or": or}, options.Find().SetProjection(bson.M{"_id": 1}))
	if err != nil {
		return nil, err
	}
	var rows []struct {
		ID string `bson:"_id"`
	}
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	return ids, nil
}

// SetCreatorTypes records the member's creator kinds (Creator Platform plan §3).
func (r *MemberRepo) SetCreatorTypes(ctx context.Context, id string, types []string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"creatorTypes": types}})
	return err
}

// SetCreatorPlanIntent records a creator's onboarding plan choice. An empty
// slug removes the preference; paid entitlement still comes only from a
// confirmed subscription record.
func (r *MemberRepo) SetCreatorPlanIntent(ctx context.Context, id, planSlug string) error {
	update := bson.M{"$set": bson.M{"creatorPlanIntent": planSlug}}
	if planSlug == "" {
		update = bson.M{"$unset": bson.M{"creatorPlanIntent": ""}}
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, update)
	return err
}

// SetCreatorSubscription records a confirmed member-level creator plan (slug +
// RFC3339 paid-until). Set only after Paystack verifies the charge; it unlocks
// artist donations and fundraising campaigns and sets the platform take-rate.
func (r *MemberRepo) SetCreatorSubscription(ctx context.Context, id, planSlug, until string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{
		"creatorPlan": planSlug, "creatorSubscribedUntil": until,
	}})
	return err
}

// SetCampaignerVetted flips the member's campaign auto-publish entitlement,
// set true when a curator approves their first fundraising campaign.
func (r *MemberRepo) SetCampaignerVetted(ctx context.Context, id string, vetted bool) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"campaignerVetted": vetted}})
	return err
}

// SetMFA persists the member's TOTP state (spec §14): enabled flag, base32
// secret (empty clears it), and bcrypt hashes of unused recovery codes.
func (r *MemberRepo) SetMFA(ctx context.Context, id string, enabled bool, secret string, recoveryHashes []string) error {
	if recoveryHashes == nil {
		recoveryHashes = []string{}
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{
		"mfaEnabled": enabled, "totpSecret": secret, "mfaRecoveryHashes": recoveryHashes,
	}})
	return err
}

// ReserveErasureID stores candidate as the member's erasure id unless one is
// already there, then returns whichever is stored.
func (r *MemberRepo) ReserveErasureID(ctx context.Context, id, candidate string) (string, error) {
	if _, err := r.c.UpdateOne(ctx, bson.M{"_id": id, memberErasureID: bson.M{opExists: false}},
		bson.M{opSet: bson.M{memberErasureID: candidate}}); err != nil {
		return "", err
	}
	var cur struct {
		ErasureID string `bson:"erasureId"`
	}
	err := r.c.FindOne(ctx, bson.M{"_id": id},
		options.FindOne().SetProjection(bson.M{memberErasureID: 1})).Decode(&cur)
	if err != nil {
		return "", notFound("member", err)
	}
	return cur.ErasureID, nil
}

// Anonymize wipes a member's personal data and suspends the account (Act 843
// right to erasure, spec §14.2), leaving a "Former member" tombstone that
// published content and retained ledgers keep pointing at.
//
// The document is REPLACED by a locked tombstone rather than patched field by
// field: a field list goes stale the moment someone adds a field (consent,
// notification preferences, AI consent…), and a stale list quietly keeps that
// data after "erasure". email/phone carry sparse unique indexes; the tombstone
// simply has none, which also frees them for re-registration. Member ids
// embed the name chosen at sign-up, so the tombstone normally lives under a
// new random id (tombstoneID) and the original document is deleted; its slug
// is derived from a hash of that id.
//
// The tombstone carries the member's token version plus one, so every session
// the person ever held is revoked for good, even if the lock were lifted.
func (r *MemberRepo) Anonymize(ctx context.Context, id, tombstoneID string) error {
	if tombstoneID == "" || tombstoneID == id {
		return r.anonymizeInPlace(ctx, id)
	}
	var cur struct {
		TokenVersion int `bson:"tokenVersion"`
	}
	err := r.c.FindOne(ctx, bson.M{"_id": id},
		options.FindOne().SetProjection(bson.M{memberTokenVersion: 1})).Decode(&cur)
	if err != nil {
		return notFound("member", err)
	}
	// The tombstone goes in first, so a failure before the delete leaves the
	// original to retry from. The filter matches only this erasure's own
	// tombstone (from an earlier attempt): any other record holding the id
	// fails the upsert on the duplicate _id instead of being overwritten.
	if _, err := r.c.ReplaceOne(ctx, bson.M{"_id": tombstoneID, memberErasureID: tombstoneID},
		erasedMemberTombstone(tombstoneID, cur.TokenVersion, time.Now().UTC()),
		options.Replace().SetUpsert(true)); err != nil {
		return err
	}
	_, err = r.c.DeleteOne(ctx, bson.M{"_id": id})
	return err
}

// anonymizeInPlace replaces the document under its own id. The replace is
// conditional on the token version read, so a session issued in between
// (which would share the new number) makes it retry instead.
func (r *MemberRepo) anonymizeInPlace(ctx context.Context, id string) error {
	const attempts = 3
	for range attempts {
		var cur struct {
			TokenVersion int `bson:"tokenVersion"`
		}
		err := r.c.FindOne(ctx, bson.M{"_id": id},
			options.FindOne().SetProjection(bson.M{memberTokenVersion: 1})).Decode(&cur)
		if err != nil {
			return notFound("member", err)
		}
		res, err := r.c.ReplaceOne(ctx, tokenVersionIs(id, cur.TokenVersion),
			erasedMemberTombstone(id, cur.TokenVersion, time.Now().UTC()))
		if err != nil {
			return err
		}
		if res.MatchedCount == 1 {
			return nil
		}
	}
	return errors.New("member record changed during erasure; try again")
}

// Stored session-version and erasure-id fields.
const (
	memberTokenVersion = "tokenVersion"
	memberErasureID    = "erasureId"
)

// tokenVersionIs matches the member while their token version is still v (an
// absent field counts as 0).
func tokenVersionIs(id string, v int) bson.M {
	if v == 0 {
		return bson.M{"_id": id, memberTokenVersion: bson.M{"$in": bson.A{0, nil}}}
	}
	return bson.M{"_id": id, memberTokenVersion: v}
}

// erasedMemberTombstone is the locked, anonymous record that replaces an
// erased member, stored under id. Its token version is always past every one
// ever issued, and its erasure id is its own, so erasing it again leaves it
// where it is.
func erasedMemberTombstone(id string, tokenVersion int, now time.Time) bson.M {
	sum := sha256.Sum256([]byte("oguaa-erased:" + id))
	return bson.M{
		"_id": id, "slug": "former-" + hex.EncodeToString(sum[:8]),
		"displayName": "Former member", "initials": "FM",
		"schoolIds": bson.A{}, "role": domain.RoleMember, "suspended": true,
		"phoneVerified": false, "broadcastBirthday": false, "mfaEnabled": false,
		memberTokenVersion: tokenVersion + 1,
		memberErasureID:    id,
		"erasedAt":         now.Format(time.RFC3339),
	}
}

func (r *MemberRepo) SetSchooling(ctx context.Context, id string, stints []domain.SchoolStint) error {
	if stints == nil {
		stints = []domain.SchoolStint{}
	}
	// Keep schoolIds in sync so existing "rep your school" reads still work.
	ids := make([]string, 0, len(stints))
	for _, s := range stints {
		ids = append(ids, s.SchoolID)
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"schooling": stints, "schoolIds": ids}})
	return err
}
