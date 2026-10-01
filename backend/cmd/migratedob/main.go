// Command migratedob removes stored dates of birth from member records
// (decision D5: the date of birth is checked at sign-up, never kept).
//
// Accounts created before that decision still carry a private dateOfBirth,
// and a public "birthday" that sign-up used to seed with the full date. For
// every such member this command:
//
//   - sets adultVerifiedAt (when missing) if the stored date shows 18 or older;
//   - reduces "birthday" to month-day ("MM-DD") when the member opted in to
//     broadcasting it (broadcastBirthday), and removes it otherwise;
//   - removes dateOfBirth.
//
// Members whose stored date is missing, malformed or under 18 are not marked
// adult; the app asks them to confirm their age with the next consent prompt.
//
//	go run ./cmd/migratedob           # dry run — reports counts, changes nothing
//	go run ./cmd/migratedob --apply   # write the changes
//
// Uses MONGODB_URI / MONGODB_DB like the server. Output holds counts only, no
// member data.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/config"
	mongox "github.com/oguaa/backend/internal/infra/mongo"
	"github.com/oguaa/backend/internal/service"
)

// Member fields this command reads and writes.
const (
	fieldDateOfBirth     = "dateOfBirth"
	fieldBirthday        = "birthday"
	fieldAdultVerifiedAt = "adultVerifiedAt"
)

// memberDates is the slice of a member record the migration needs.
type memberDates struct {
	ID                string `bson:"_id"`
	DateOfBirth       string `bson:"dateOfBirth"`
	HasDateOfBirth    bool   `bson:"-"`
	Birthday          string `bson:"birthday"`
	HasBirthday       bool   `bson:"-"`
	BroadcastBirthday bool   `bson:"broadcastBirthday"`
	AdultVerifiedAt   string `bson:"adultVerifiedAt"`
}

// plan is the update for one member plus what it counts towards.
type plan struct {
	set             bson.M
	unset           bson.M
	adultVerified   bool
	adultUnverified bool
	birthdayReduced bool
	birthdayRemoved bool
	dobRemoved      bool
}

func (p plan) empty() bool { return len(p.set) == 0 && len(p.unset) == 0 }

func (p plan) update() bson.M {
	u := bson.M{}
	if len(p.set) > 0 {
		u["$set"] = p.set
	}
	if len(p.unset) > 0 {
		u["$unset"] = p.unset
	}
	return u
}

// planFor decides what happens to one member's stored dates.
func planFor(m memberDates, now time.Time) plan {
	p := plan{set: bson.M{}, unset: bson.M{}}
	if m.HasDateOfBirth {
		p.unset[fieldDateOfBirth] = ""
		p.dobRemoved = true
		switch {
		case m.AdultVerifiedAt != "":
		case service.AdultByDateOfBirth(m.DateOfBirth, now):
			p.set[fieldAdultVerifiedAt] = now.UTC().Format(time.RFC3339)
			p.adultVerified = true
		default:
			p.adultUnverified = true
		}
	}
	if m.HasBirthday {
		planBirthday(&p, m)
	}
	return p
}

// planBirthday keeps an opted-in birthday as month-day only and removes any
// other stored birthday.
func planBirthday(p *plan, m memberDates) {
	md := monthDay(m.Birthday)
	switch {
	case m.BroadcastBirthday && md != "" && md == m.Birthday:
		// already month-day only
	case m.BroadcastBirthday && md != "":
		p.set[fieldBirthday] = md
		p.birthdayReduced = true
	default:
		p.unset[fieldBirthday] = ""
		p.birthdayRemoved = true
	}
}

// monthDay returns the "MM-DD" of a "YYYY-MM-DD" or "MM-DD" date, or "".
func monthDay(s string) string {
	s = strings.TrimSpace(s)
	if t, err := time.Parse(time.DateOnly, s); err == nil {
		return t.Format("01-02")
	}
	if t, err := time.Parse("01-02", s); err == nil {
		return t.Format("01-02")
	}
	return ""
}

// tally counts what the migration did (or would do).
type tally struct {
	scanned, changed, adultVerified, adultUnverified, birthdayReduced, birthdayRemoved, dobRemoved int
}

func (t *tally) add(p plan) {
	t.scanned++
	if p.empty() {
		return
	}
	t.changed++
	t.adultVerified += boolInt(p.adultVerified)
	t.adultUnverified += boolInt(p.adultUnverified)
	t.birthdayReduced += boolInt(p.birthdayReduced)
	t.birthdayRemoved += boolInt(p.birthdayRemoved)
	t.dobRemoved += boolInt(p.dobRemoved)
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func main() {
	apply := flag.Bool("apply", false, "write the changes (default: dry run)")
	flag.Parse()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	cfg := config.Load()
	client, db, err := mongox.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		fail("connect", err)
	}
	defer func() { _ = client.Disconnect(context.Background()) }()

	mode := "dry run"
	if *apply {
		mode = "APPLY"
	}
	fmt.Printf("database %s\nmode     %s\n\n", cfg.MongoDB, mode)

	t, err := migrate(ctx, db.Collection("members"), *apply, time.Now())
	if err != nil {
		fail("migrate", err)
	}
	fmt.Printf("members with a stored date of birth or birthday: %d\n", t.scanned)
	fmt.Printf("  records changed:                    %d\n", t.changed)
	fmt.Printf("  dateOfBirth removed:                %d\n", t.dobRemoved)
	fmt.Printf("  marked adult (adultVerifiedAt set): %d\n", t.adultVerified)
	fmt.Printf("  date not 18+ or unreadable:         %d (asked to confirm their age in the app)\n", t.adultUnverified)
	fmt.Printf("  birthday reduced to month-day:      %d\n", t.birthdayReduced)
	fmt.Printf("  birthday removed (not broadcast):   %d\n", t.birthdayRemoved)
	if !*apply {
		fmt.Println("\ndry run — nothing changed. Re-run with --apply to write.")
	}
}

// migrate walks every member that still stores a date and applies (or, in a
// dry run, only counts) its plan.
func migrate(ctx context.Context, members *mongo.Collection, apply bool, now time.Time) (tally, error) {
	var t tally
	filter := bson.M{"$or": []bson.M{
		{fieldDateOfBirth: bson.M{"$exists": true}},
		{fieldBirthday: bson.M{"$exists": true}},
	}}
	projection := bson.M{fieldDateOfBirth: 1, fieldBirthday: 1, "broadcastBirthday": 1, fieldAdultVerifiedAt: 1}
	cur, err := members.Find(ctx, filter, options.Find().SetProjection(projection))
	if err != nil {
		return t, err
	}
	defer func() { _ = cur.Close(ctx) }()
	for cur.Next(ctx) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			return t, err
		}
		var m memberDates
		if err := cur.Decode(&m); err != nil {
			return t, err
		}
		_, m.HasDateOfBirth = raw[fieldDateOfBirth]
		_, m.HasBirthday = raw[fieldBirthday]
		p := planFor(m, now)
		t.add(p)
		if !apply || p.empty() {
			continue
		}
		if _, err := members.UpdateOne(ctx, bson.M{"_id": m.ID}, p.update()); err != nil {
			return t, fmt.Errorf("update member: %w", err)
		}
	}
	return t, cur.Err()
}

func fail(what string, err error) {
	fmt.Fprintf(os.Stderr, "%s: %v\n", what, err)
	os.Exit(1)
}
