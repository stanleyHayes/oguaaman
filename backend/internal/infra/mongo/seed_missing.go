package mongo

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

// SeedMissingResult describes what the non-destructive demo-data top-up found
// and, when apply is true, inserted. A collection is eligible only when it has
// no documents at all; existing collections are never changed or supplemented.
type SeedMissingResult struct {
	Collection      string
	ExistingCount   int64
	FixtureCount    int
	InsertedCount   int
	UpdatedListings int64
}

type missingSeedCollection struct {
	name string
	docs []any
}

// SeedEmptyCollections is the apply-only entry point for safely filling the
// demo activity collections. Existing collections are left exactly as they
// are; callers receive the same per-collection report as SeedMissing.
func SeedEmptyCollections(ctx context.Context, db *mongo.Database) ([]SeedMissingResult, error) {
	return SeedMissing(ctx, db, true)
}

// SeedMissing inspects the user-facing collections that are normally populated
// by product activity. It inserts representative demo fixtures only when apply
// is true and CountDocuments reports that the entire collection is empty.
//
// It deliberately excludes ai_usage and stripe_intents: those collections are
// operational/transient records and should truthfully start empty.
func SeedMissing(ctx context.Context, db *mongo.Database, apply bool) ([]SeedMissingResult, error) {
	collections := missingSeedCollections()
	results := make([]SeedMissingResult, 0, len(collections))
	for _, seed := range collections {
		count, err := db.Collection(seed.name).CountDocuments(ctx, bson.M{})
		if err != nil {
			return results, fmt.Errorf("count %s: %w", seed.name, err)
		}
		result := SeedMissingResult{
			Collection:    seed.name,
			ExistingCount: count,
			FixtureCount:  len(seed.docs),
		}
		if count == 0 && apply {
			if err := insertAll(ctx, db.Collection(seed.name), seed.docs); err != nil {
				return results, fmt.Errorf("seed %s: %w", seed.name, err)
			}
			result.InsertedCount = len(seed.docs)
			updated, err := applySeedDerivedListingState(ctx, db, seed.name)
			if err != nil {
				return results, fmt.Errorf("reconcile %s listing state: %w", seed.name, err)
			}
			result.UpdatedListings = updated
		}
		results = append(results, result)
	}
	return results, nil
}

// applySeedDerivedListingState keeps the denormalised listing fields in sync
// with newly inserted demo ledgers. It is called only after the corresponding
// collection was confirmed empty and its fixtures were inserted.
func applySeedDerivedListingState(ctx context.Context, db *mongo.Database, collection string) (int64, error) {
	sets, err := seedDerivedListingSets(collection)
	if err != nil {
		return 0, err
	}
	var matched int64
	for listingID, fields := range sets {
		result, err := db.Collection(collListings).UpdateOne(ctx, bson.M{"_id": listingID}, bson.M{"$set": fields})
		if err != nil {
			return matched, err
		}
		if result.MatchedCount != 1 {
			return matched, fmt.Errorf("seed listing %q was not found", listingID)
		}
		matched += result.MatchedCount
	}
	return matched, nil
}

func seedDerivedListingSets(collection string) (map[string]bson.M, error) {
	sets := map[string]bson.M{}
	switch collection {
	case collPledges:
		type totals struct {
			raised  int64
			backers int
		}
		byProject := map[string]totals{}
		for _, pledge := range seedPledges {
			if pledge.Status != domain.PledgeSuccess {
				continue
			}
			total := byProject[pledge.ProjectID]
			total.raised += pledge.NetPesewas
			total.backers++
			byProject[pledge.ProjectID] = total
		}
		for listingID, total := range byProject {
			sets[listingID] = bson.M{
				"details.raisedPesewas": total.raised,
				"details.backers":       total.backers,
			}
		}
	case collSubscriptions:
		for _, subscription := range seedSubscriptions {
			if subscription.Status == domain.PledgeSuccess {
				sets[subscription.ListingID] = bson.M{"details.subscribedUntil": subscription.PeriodEnd}
			}
		}
	case collPromotions:
		for _, promotion := range seedPromotions {
			if promotion.Status != domain.PledgeSuccess {
				continue
			}
			confirmed, err := time.Parse(time.RFC3339, promotion.ConfirmedAt)
			if err != nil {
				return nil, fmt.Errorf("parse promotion %s confirmedAt: %w", promotion.ID, err)
			}
			sets[promotion.ListingID] = bson.M{
				"featured":      true,
				"featuredUntil": confirmed.Add(time.Duration(promotion.Days) * 24 * time.Hour).Format(time.RFC3339),
			}
		}
	case collListingViews:
		counts := map[string]int{}
		for _, view := range seedListingViews {
			listingID, _ := view["listingId"].(string)
			counts[listingID]++
		}
		for listingID, count := range counts {
			sets[listingID] = bson.M{"viewCount": count}
		}
	}
	return sets, nil
}

func missingSeedCollections() []missingSeedCollection {
	return []missingSeedCollection{
		{name: collModeration, docs: toSeedDocs(seedModerationRecords)},
		{name: collNotifications, docs: toSeedDocs(seedNotifications)},
		{name: collFollows, docs: toSeedDocs(seedFollows)},
		{name: collMemberFollows, docs: toSeedDocs(seedMemberFollows)},
		{name: collReports, docs: toSeedDocs(seedReports)},
		{name: collPledges, docs: toSeedDocs(seedPledges)},
		{name: collTickets, docs: toSeedDocs(seedTickets)},
		{name: collSubscriptions, docs: toSeedDocs(seedSubscriptions)},
		{name: collPromotions, docs: toSeedDocs(seedPromotions)},
		{name: collListingViews, docs: toSeedDocs(seedListingViews)},
		{name: collPlans, docs: toSeedDocs(seedPlans)},
	}
}

func toSeedDocs[T any](items []T) []any {
	docs := make([]any, len(items))
	for i := range items {
		docs[i] = items[i]
	}
	return docs
}

// Activity fixtures stay relative to the day the seeder starts, so a fresh
// demo database always has a currently active subscription/promotion and view
// activity in the current month. The anchor is fixed once per process, keeping
// dry-run/apply calculations internally deterministic.
var seedActivityAnchor = func() time.Time {
	now := time.Now().UTC()
	return time.Date(now.Year(), now.Month(), now.Day(), 12, 0, 0, 0, time.UTC)
}()

func seedActivityTime(dayOffset, hour, minute int) string {
	day := seedActivityAnchor.AddDate(0, 0, dayOffset)
	return time.Date(day.Year(), day.Month(), day.Day(), hour, minute, 0, 0, time.UTC).Format(time.RFC3339)
}

func seedActivityDay(dayOffset int) string {
	day := seedActivityAnchor.AddDate(0, 0, dayOffset)
	if day.Year() != seedActivityAnchor.Year() || day.Month() != seedActivityAnchor.Month() {
		day = time.Date(seedActivityAnchor.Year(), seedActivityAnchor.Month(), 1, 0, 0, 0, 0, time.UTC)
	}
	return day.Format(time.DateOnly)
}

func seedActiveSubscriptionPeriodEnd() string { return seedActivityTime(21, 10, 0) }

var seedModerationRecords = []domain.ModerationRecord{
	{ID: "mod-seed-castleview-approved", ListingID: "b-castleview", ModeratorID: "m-kofi", Action: "approve", CreatedAt: "2026-03-03T09:20:00Z"},
	{ID: "mod-seed-fetu-approved", ListingID: "e-fetu", ModeratorID: memberAidoo, Action: "approve", CreatedAt: "2026-03-02T14:10:00Z"},
	{ID: "mod-seed-prints-changes", ListingID: "b-pending-prints", ModeratorID: "m-kofi", Action: "request-changes", Reason: "Please add a complete workshop address and a clearer cover photo.", CreatedAt: "2026-06-01T11:45:00Z"},
	{ID: "mod-seed-incident-flag", ListingID: "inc-kotokuraba-fire", ModeratorID: memberNana, Action: "flag", Reason: "Kept on the verification watch-list until the response update arrived.", CreatedAt: "2026-07-10T09:05:00Z"},
}

var seedNotifications = []domain.Notification{
	{ID: "ntf-seed-castleview-live", MemberID: "m-yaw", Kind: "approved", Title: "Your listing is live", Body: "Castle View Guesthouse was approved and is now published.", Link: "/business/castle-view-guesthouse", Read: true, CreatedAt: "2026-03-03T09:21:00Z"},
	{ID: "ntf-seed-prints-changes", MemberID: "m-yaw", Kind: "changes", Title: "Changes requested", Body: "Oguaa Prints & Textiles needs a complete address and a clearer cover photo.", Link: "/me", CreatedAt: "2026-06-01T11:46:00Z"},
	{ID: "ntf-seed-remembrance", MemberID: memberKojo, Kind: "remembrance", Title: "Remembering Madam Adwoa Mensah", Body: "Today the Oguaa community pauses to remember Madam Adwoa Mensah.", Link: "/memorial/madam-adwoa-mensah", CreatedAt: "2026-07-02T07:00:00Z"},
	{ID: "ntf-seed-pledge", MemberID: memberAidoo, Kind: "pledge", Title: "A pledge came in 🎉", Body: "GH₵ 100.00 was pledged to the Bakaano library corner. (Simulated — dev mode.)", Link: "/projects/bakaano-basic-library-corner", Read: true, CreatedAt: "2026-07-08T13:12:00Z"},
	{ID: "ntf-seed-ticket", MemberID: memberAkua, Kind: "ticket", Title: "Your ticket is ready", Body: "Your simulated ticket for The Oguaa Sound is ready for check-in.", Link: "/me", CreatedAt: "2026-07-12T16:31:00Z"},
	{ID: "ntf-seed-welcome", MemberID: "m-abena", Kind: "welcome", Title: "Akwaaba to Oguaa", Body: "Your community profile is ready. Add the places and schools that connect you to home.", Link: "/me", CreatedAt: "2026-05-22T10:05:00Z"},
}

var seedFollows = []domain.Follow{
	{MemberID: memberKojo, ListingID: "mem-adwoa", CreatedAt: "2026-04-04T08:00:00Z"},
	{MemberID: memberEfua, ListingID: "mem-adwoa", CreatedAt: "2026-04-05T12:30:00Z"},
	{MemberID: "m-akosua", ListingID: "mem-efua-abakah", CreatedAt: "2026-06-03T18:15:00Z"},
	{MemberID: memberNana, ListingID: "mem-kobina", CreatedAt: "2026-02-02T09:40:00Z"},
}

var seedMemberFollows = []domain.MemberFollow{
	{FollowerID: "m-ama", MemberID: memberEfua, CreatedAt: "2026-02-15T10:00:00Z"},
	{FollowerID: "m-yaw", MemberID: memberAkua, CreatedAt: "2026-03-06T17:20:00Z"},
	{FollowerID: "m-kwabena", MemberID: memberKojo, CreatedAt: "2026-03-20T08:35:00Z"},
	{FollowerID: "m-akosua", MemberID: "m-ama", CreatedAt: "2026-04-08T19:10:00Z"},
	{FollowerID: "m-abena", MemberID: memberNana, CreatedAt: "2026-05-23T07:45:00Z"},
}

var seedReports = []domain.Report{
	{
		ID: "rpt-seed-fish-address", ListingID: "b-fish", ListingSlug: "kotokuraba-fresh-fish", ListingType: domain.TypeBusiness, ListingTitle: "Esi's Fresh Fish — Kotokuraba",
		Reason: domain.ReasonInaccurate, Detail: "The market stall moved to the east entrance; please confirm and update the directions.", ReporterID: "m-abena", ReporterName: "Abena Quainoo", Status: domain.ReportOpen, CreatedAt: "2026-07-13T08:40:00Z",
	},
	{
		ID: "rpt-seed-memorial-claim", ListingID: "mem-adwoa", ListingSlug: "madam-adwoa-mensah", ListingType: domain.TypeMemorial, ListingTitle: "Adwoa Mensah",
		Reason: domain.ReasonBereavement, Detail: "Family keeper request reviewed with the submitted relationship details.", ReporterID: "m-akosua", ReporterName: "Akosua Biney", Status: domain.ReportActioned, CreatedAt: "2026-06-18T14:05:00Z", ReviewedByID: memberAidoo, ReviewedAt: "2026-06-20T10:30:00Z", Resolution: "Keeper request verified and family guidance sent.", KeeperClaim: true,
	},
	{
		ID: "rpt-seed-person-dismissed", ListingID: "p-ck-mann", ListingSlug: "ck-mann", ListingType: domain.TypePerson, ListingTitle: "C.K. Mann",
		Reason: domain.ReasonImpersonation, Detail: "Submitted for review because the page is maintained by a community curator.", Status: domain.ReportDismissed, CreatedAt: "2026-05-10T16:20:00Z", ReviewedByID: "m-kofi", ReviewedAt: "2026-05-11T09:15:00Z", Resolution: "The curator attribution and source notes were verified.",
	},
}

var seedPledges = []domain.Pledge{
	{
		ID: "plg-seed-library-efua", Reference: "seed-sim-pledge-library-efua", ProjectID: "pr-bakaano-lib", ProjectSlug: "bakaano-basic-library-corner", ProjectTitle: "A library corner for Bakaano M/A Basic",
		MemberID: memberEfua, Email: "efua-sam@oguaa.test", AmountPesewas: 10_000, FeePesewas: 500, NetPesewas: 9_500, Currency: "GHS", Status: domain.PledgeSuccess, Simulated: true, CreatedAt: "2026-07-08T13:10:00Z", ConfirmedAt: "2026-07-08T13:12:00Z",
	},
	{
		ID: "plg-seed-fosu-kwabena", Reference: "seed-sim-pledge-fosu-kwabena", ProjectID: "pr-fosu-cleanup", ProjectSlug: "fosu-lagoon-cleanup", ProjectTitle: "Fosu Lagoon cleanup & mangrove watch",
		MemberID: "m-kwabena", Email: "kwabena-mensah@oguaa.test", AmountPesewas: 25_000, FeePesewas: 1_250, NetPesewas: 23_750, Currency: "GHS", Status: domain.PledgeSuccess, Simulated: true, CreatedAt: "2026-07-09T18:05:00Z", ConfirmedAt: "2026-07-09T18:07:00Z",
	},
	{
		ID: "plg-seed-ict-pending", Reference: "seed-sim-pledge-ict-pending", ProjectID: "pr-quaque-ict", ProjectSlug: "philip-quaque-ict-lab", ProjectTitle: "An ICT lab for Philip Quaque Boys' School",
		MemberID: "m-abena", Email: "abena-quainoo@oguaa.test", AmountPesewas: 15_000, Currency: "GHS", Status: domain.PledgePending, Simulated: true, CreatedAt: "2026-07-15T08:55:00Z",
	},
	{
		ID: "plg-seed-library-failed", Reference: "seed-sim-pledge-library-failed", ProjectID: "pr-bakaano-lib", ProjectSlug: "bakaano-basic-library-corner", ProjectTitle: "A library corner for Bakaano M/A Basic",
		MemberID: "m-yaw", Email: "yaw-ofori@oguaa.test", AmountPesewas: 5_000, Currency: "GHS", Status: domain.PledgeFailed, Simulated: true, CreatedAt: "2026-07-16T12:00:00Z",
	},
}

var seedTickets = []domain.Ticket{
	{
		ID: "tkt-seed-fetu-checked-in", Reference: "seed-sim-ticket-fetu-checked-in", EventID: "e-fetu", EventSlug: "fetu-afahye-2026", EventTitle: "Oguaa Fetu Afahye 2026",
		MemberID: memberKojo, Email: "kojo-arthur@oguaa.test", Tier: "Grand Durbar stand", Qty: 1, AmountPesewas: 5_000, Status: domain.PledgeSuccess, Code: "A1B2C3D4", CheckedInAt: "2026-07-17T09:02:00Z", Simulated: true, CreatedAt: "2026-07-01T10:15:00Z", ConfirmedAt: "2026-07-01T10:17:00Z",
	},
	{
		ID: "tkt-seed-sound-ready", Reference: "seed-sim-ticket-sound-ready", EventID: "e-soundlive", EventSlug: "the-oguaa-sound-live", EventTitle: "The Oguaa Sound — Live at the Castle Gardens",
		MemberID: memberAkua, Email: "akua-pratt@oguaa.test", Tier: "Standard", Qty: 2, AmountPesewas: 4_000, Status: domain.PledgeSuccess, Code: "E5F6G7H8", Simulated: true, CreatedAt: "2026-07-12T16:28:00Z", ConfirmedAt: "2026-07-12T16:30:00Z",
	},
	{
		ID: "tkt-seed-fetu-pending", Reference: "seed-sim-ticket-fetu-pending", EventID: "e-fetu", EventSlug: "fetu-afahye-2026", EventTitle: "Oguaa Fetu Afahye 2026",
		MemberID: "m-abena", Email: "abena-quainoo@oguaa.test", Tier: "Orange Friday carnival", Qty: 2, AmountPesewas: 6_000, Status: domain.PledgePending, Simulated: true, CreatedAt: "2026-07-16T17:40:00Z",
	},
	{
		ID: "tkt-seed-sound-failed", Reference: "seed-sim-ticket-sound-failed", EventID: "e-soundlive", EventSlug: "the-oguaa-sound-live", EventTitle: "The Oguaa Sound — Live at the Castle Gardens",
		MemberID: "m-yaw", Email: "yaw-ofori@oguaa.test", Tier: "Standard", Qty: 1, AmountPesewas: 2_000, Status: domain.PledgeFailed, Simulated: true, CreatedAt: "2026-07-17T14:00:00Z",
	},
}

var seedSubscriptions = []domain.Subscription{
	{
		ID: "sub-seed-castleview-active", Reference: "seed-sim-sub-castleview-active", MemberID: "m-yaw", ListingID: "b-castleview", ListingSlug: "castle-view-guesthouse", ListingTitle: "Castle View Guesthouse",
		Plan: "supporter", AmountPesewas: 5_000, Status: domain.PledgeSuccess, PeriodEnd: seedActiveSubscriptionPeriodEnd(), Simulated: true, CreatedAt: seedActivityTime(-9, 9, 58), ConfirmedAt: seedActivityTime(-9, 10, 0),
	},
	{
		ID: "sub-seed-kenkey-pending", Reference: "seed-sim-sub-kenkey-pending", MemberID: memberEfua, ListingID: "b-kenkey", ListingSlug: "bakaano-kenkey-junction", ListingTitle: "Bakaano Kenkey Junction",
		Plan: "supporter", AmountPesewas: 5_000, Status: domain.PledgePending, Simulated: true, CreatedAt: "2026-07-17T12:20:00Z",
	},
	{
		ID: "sub-seed-fish-failed", Reference: "seed-sim-sub-fish-failed", MemberID: "m-esi", ListingID: "b-fish", ListingSlug: "kotokuraba-fresh-fish", ListingTitle: "Esi's Fresh Fish — Kotokuraba",
		Plan: "featured", AmountPesewas: 12_000, Status: domain.PledgeFailed, Simulated: true, CreatedAt: "2026-07-17T15:45:00Z",
	},
}

var seedPromotions = []domain.Promotion{
	{
		ID: "pro-seed-kenkey-success", Reference: "seed-sim-promo-kenkey-success", ListingID: "b-kenkey", ListingSlug: "bakaano-kenkey-junction", ListingTitle: "Bakaano Kenkey Junction",
		MemberID: memberEfua, Email: "efua-sam@oguaa.test", Days: 14, AmountPesewas: 14_000, Status: domain.PledgeSuccess, Simulated: true, CreatedAt: seedActivityTime(-4, 10, 10), ConfirmedAt: seedActivityTime(-4, 10, 12),
	},
	{
		ID: "pro-seed-sound-pending", Reference: "seed-sim-promo-sound-pending", ListingID: "e-soundlive", ListingSlug: "the-oguaa-sound-live", ListingTitle: "The Oguaa Sound — Live at the Castle Gardens",
		MemberID: memberAkua, Email: "akua-pratt@oguaa.test", Days: 7, AmountPesewas: 7_000, Status: domain.PledgePending, Simulated: true, CreatedAt: "2026-07-16T11:25:00Z",
	},
	{
		ID: "pro-seed-fish-failed", Reference: "seed-sim-promo-fish-failed", ListingID: "b-fish", ListingSlug: "kotokuraba-fresh-fish", ListingTitle: "Esi's Fresh Fish — Kotokuraba",
		MemberID: "m-esi", Email: "esi-quayson@oguaa.test", Days: 30, AmountPesewas: 30_000, Status: domain.PledgeFailed, Simulated: true, CreatedAt: "2026-07-17T16:10:00Z",
	},
}

var seedListingViews = []bson.M{
	{"_id": "b-castleview:" + seedActivityDay(-3) + ":m-kojo", "listingId": "b-castleview", "day": seedActivityDay(-3)},
	{"_id": "b-castleview:" + seedActivityDay(-3) + ":m-efua", "listingId": "b-castleview", "day": seedActivityDay(-3)},
	{"_id": "b-castleview:" + seedActivityDay(-2) + ":m-abena", "listingId": "b-castleview", "day": seedActivityDay(-2)},
	{"_id": "b-kenkey:" + seedActivityDay(-2) + ":m-akosua", "listingId": "b-kenkey", "day": seedActivityDay(-2)},
	{"_id": "b-kenkey:" + seedActivityDay(-1) + ":m-yaw", "listingId": "b-kenkey", "day": seedActivityDay(-1)},
	{"_id": "e-fetu:" + seedActivityDay(-3) + ":m-kwabena", "listingId": "e-fetu", "day": seedActivityDay(-3)},
	{"_id": "e-fetu:" + seedActivityDay(-2) + ":m-akosua", "listingId": "e-fetu", "day": seedActivityDay(-2)},
	{"_id": "e-fetu:" + seedActivityDay(-1) + ":m-abena", "listingId": "e-fetu", "day": seedActivityDay(-1)},
	{"_id": "e-soundlive:" + seedActivityDay(-1) + ":m-yaw-darko", "listingId": "e-soundlive", "day": seedActivityDay(-1)},
	{"_id": "pr-bakaano-lib:" + seedActivityDay(-2) + ":m-efua", "listingId": "pr-bakaano-lib", "day": seedActivityDay(-2)},
	{"_id": "pr-fosu-cleanup:" + seedActivityDay(-1) + ":m-kwabena", "listingId": "pr-fosu-cleanup", "day": seedActivityDay(-1)},
	{"_id": "mem-adwoa:" + seedActivityDay(0) + ":m-kojo", "listingId": "mem-adwoa", "day": seedActivityDay(0)},
}
