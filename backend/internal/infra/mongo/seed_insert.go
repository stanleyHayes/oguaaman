package mongo

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// ErrResetRefused is returned by CheckResetAllowed when the destructive local
// reset would run against a database that looks live.
var ErrResetRefused = errors.New("refusing to reset this database")

// insertIfAbsent writes doc under _id only when no document already holds that
// _id. An existing row is never read, merged or replaced: staff and members
// edit seeded rows in place (plan prices, institution pages, moderation
// status…), and a re-run of a live seeder must not undo those edits.
//
// A duplicate-key error on another unique index (a real row already owns the
// slug) also counts as "already present" and is skipped, not failed.
func insertIfAbsent(ctx context.Context, coll *mongo.Collection, id string, doc any) (bool, error) {
	if id == "" {
		return false, nil
	}
	raw, err := bson.Marshal(doc)
	if err != nil {
		return false, fmt.Errorf("encode %s/%s: %w", coll.Name(), id, err)
	}
	fields := bson.M{}
	if err := bson.Unmarshal(raw, &fields); err != nil {
		return false, fmt.Errorf("decode %s/%s: %w", coll.Name(), id, err)
	}
	delete(fields, "_id")
	if len(fields) == 0 {
		fields = bson.M{"_seeded": true}
	}
	res, err := coll.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$setOnInsert": fields}, options.UpdateOne().SetUpsert(true))
	if mongo.IsDuplicateKeyError(err) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("insert %s/%s: %w", coll.Name(), id, err)
	}
	return res.UpsertedCount == 1, nil
}

// resetRefusal decides whether the destructive local reset (Seed) may run.
// Seed drops every collection, members included, so it is refused in
// production and whenever the target already holds a member who is not one of
// the seeded @oguaa.test identities — unless the operator passes the explicit
// override flag.
func resetRefusal(goEnv string, realMembers int64, override bool) error {
	if override {
		return nil
	}
	if goEnv == "production" {
		return fmt.Errorf("%w: GO_ENV=production (use cmd/seedlive for a live database, or pass --i-know-this-drops-data)", ErrResetRefused)
	}
	if realMembers > 0 {
		return fmt.Errorf("%w: it holds %d member account(s) that are not seeded @oguaa.test identities (pass --i-know-this-drops-data to drop them)", ErrResetRefused, realMembers)
	}
	return nil
}

// CheckResetAllowed counts the non-seed member accounts in db and returns an
// error wrapping ErrResetRefused when the destructive Seed() must not run.
func CheckResetAllowed(ctx context.Context, db *mongo.Database, goEnv string, override bool) error {
	if override {
		return nil
	}
	if goEnv == "production" {
		return resetRefusal(goEnv, 0, false)
	}
	n, err := db.Collection(collMembers).CountDocuments(ctx, nonSeedMemberFilter())
	if err != nil {
		return fmt.Errorf("count members: %w", err)
	}
	return resetRefusal(goEnv, n, false)
}

// nonSeedMemberFilter matches every member that is not a seeded demo identity,
// including phone-only accounts with no email at all.
func nonSeedMemberFilter() bson.M {
	return bson.M{"email": bson.M{"$not": demoEmailPattern()}}
}

// DemoMemberFilter matches the seeded demo identities (@oguaa.test emails).
func DemoMemberFilter() bson.M {
	return bson.M{"email": demoEmailPattern()}
}

func demoEmailPattern() bson.Regex {
	return bson.Regex{Pattern: strings.ReplaceAll(domain.DemoMemberEmailSuffix, ".", `\.`) + "$", Options: "i"}
}

// isPlaceholderContact reports whether a contact value or link is one of the
// seed's invented placeholders (an @*.oguaa.test mailbox or a zero-filled
// +233 number) rather than a real way to reach anyone.
func isPlaceholderContact(v string) bool {
	if v == "" {
		return false
	}
	compact := strings.ToLower(strings.ReplaceAll(v, " ", ""))
	return strings.Contains(compact, "oguaa.test") ||
		strings.Contains(compact, "+233330000") ||
		strings.Contains(compact, "233000000000")
}

// liveCorpusOrg is the copy of a seeded institution that may be written to a
// live database: section items whose link or value is a placeholder mailbox or
// phone line are dropped, so an "official" page never offers an Admissions or
// Call-the-office button that reaches nobody.
func liveCorpusOrg(o domain.Organization) domain.Organization {
	if len(o.Sections) == 0 {
		return o
	}
	sections := make([]domain.ProfileSection, len(o.Sections))
	for i, s := range o.Sections {
		if len(s.Items) > 0 {
			items := make([]domain.SectionItem, 0, len(s.Items))
			for _, it := range s.Items {
				if isPlaceholderContact(it.URL) || isPlaceholderContact(it.Value) {
					continue
				}
				items = append(items, it)
			}
			s.Items = items
		}
		sections[i] = s
	}
	o.Sections = sections
	return o
}

// liveCorpusListing is the copy of a real seeded listing that may be written to
// a live database. Ticketing on a seeded event is illustration: the tiers,
// prices and capacities were invented for the local demo, and nobody on the
// platform is the organiser who could honour or refund a ticket. Tiers and the
// "paid" admission marker are dropped so the event page never opens a checkout.
func liveCorpusListing(l domain.Listing) domain.Listing {
	if l.Type != domain.TypeEvent || len(l.Details) == 0 {
		return l
	}
	details := make(map[string]any, len(l.Details))
	for k, v := range l.Details {
		details[k] = v
	}
	delete(details, "tiers")
	delete(details, "refundPolicy")
	if details["admission"] == "paid" {
		delete(details, "admission")
	}
	l.Details = details
	return l
}
