package mongo

import (
	"reflect"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"

	"github.com/oguaa/backend/internal/domain"
)

func TestMissingSeedCollectionsCoverUserFacingActivityOnly(t *testing.T) {
	want := []string{
		collModeration, collNotifications, collFollows, collMemberFollows,
		collReports, collPledges, collTickets, collSubscriptions,
		collPromotions, collListingViews, collPlans,
	}
	collections := missingSeedCollections()
	got := make([]string, len(collections))
	for i, collection := range collections {
		got[i] = collection.name
		if len(collection.docs) == 0 {
			t.Fatalf("%s has no fixtures", collection.name)
		}
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("seedmissing collections = %v, want %v", got, want)
	}
	for _, excluded := range []string{collAIUsage, collStripeIntents} {
		for _, name := range got {
			if name == excluded {
				t.Fatalf("operational collection %s must remain intentionally empty", excluded)
			}
		}
	}
}

func TestMissingSeedFixturesReferenceSeededMembersAndListings(t *testing.T) {
	members := map[string]domain.Member{}
	for _, member := range seedMembers {
		members[member.ID] = member
	}
	listings := map[string]domain.Listing{}
	for _, batch := range [][]domain.Listing{seedListings(), seedExtraListings(), seedIncidents(), seedLostFound()} {
		for _, listing := range batch {
			listings[listing.ID] = listing
		}
	}
	requireMember := func(id, fixture string) {
		t.Helper()
		if _, ok := members[id]; !ok {
			t.Errorf("%s references missing member %q", fixture, id)
		}
	}
	requireListing := func(id, fixture string) domain.Listing {
		t.Helper()
		listing, ok := listings[id]
		if !ok {
			t.Errorf("%s references missing listing %q", fixture, id)
		}
		return listing
	}

	for _, record := range seedModerationRecords {
		requireListing(record.ListingID, record.ID)
		requireMember(record.ModeratorID, record.ID)
	}
	for _, notification := range seedNotifications {
		requireMember(notification.MemberID, notification.ID)
	}
	for _, follow := range seedFollows {
		requireMember(follow.MemberID, "memorial follow")
		if listing := requireListing(follow.ListingID, "memorial follow"); listing.Type != domain.TypeMemorial {
			t.Errorf("follow target %s is %s, want memorial", follow.ListingID, listing.Type)
		}
	}
	for _, follow := range seedMemberFollows {
		requireMember(follow.FollowerID, "member follow")
		requireMember(follow.MemberID, "member follow")
	}
	for _, report := range seedReports {
		listing := requireListing(report.ListingID, report.ID)
		if listing.Slug != report.ListingSlug || listing.Type != report.ListingType || listing.Title != report.ListingTitle {
			t.Errorf("%s denormalized listing fields do not match %s", report.ID, listing.ID)
		}
		if report.ReporterID != "" {
			requireMember(report.ReporterID, report.ID)
		}
		if report.ReviewedByID != "" {
			requireMember(report.ReviewedByID, report.ID)
		}
	}
	for _, pledge := range seedPledges {
		listing := requireListing(pledge.ProjectID, pledge.ID)
		if listing.Type != domain.TypeProject || listing.Slug != pledge.ProjectSlug || listing.Title != pledge.ProjectTitle {
			t.Errorf("%s does not match seeded project %s", pledge.ID, listing.ID)
		}
		requireMember(pledge.MemberID, pledge.ID)
	}
	for _, ticket := range seedTickets {
		listing := requireListing(ticket.EventID, ticket.ID)
		if listing.Type != domain.TypeEvent || listing.Slug != ticket.EventSlug || listing.Title != ticket.EventTitle {
			t.Errorf("%s does not match seeded event %s", ticket.ID, listing.ID)
		}
		requireMember(ticket.MemberID, ticket.ID)
	}
	planSlugs := map[string]bool{}
	for _, plan := range seedPlans {
		planSlugs[plan.Slug] = true
	}
	for _, subscription := range seedSubscriptions {
		listing := requireListing(subscription.ListingID, subscription.ID)
		if listing.Type != domain.TypeBusiness || listing.Slug != subscription.ListingSlug || listing.Title != subscription.ListingTitle {
			t.Errorf("%s does not match seeded business %s", subscription.ID, listing.ID)
		}
		requireMember(subscription.MemberID, subscription.ID)
		if !planSlugs[subscription.Plan] {
			t.Errorf("%s references missing plan %q", subscription.ID, subscription.Plan)
		}
	}
	for _, promotion := range seedPromotions {
		listing := requireListing(promotion.ListingID, promotion.ID)
		if listing.Slug != promotion.ListingSlug || listing.Title != promotion.ListingTitle {
			t.Errorf("%s does not match seeded listing %s", promotion.ID, listing.ID)
		}
		requireMember(promotion.MemberID, promotion.ID)
	}
	for _, view := range seedListingViews {
		listingID, _ := view["listingId"].(string)
		requireListing(listingID, "listing view")
		day, _ := view["day"].(string)
		if !strings.HasPrefix(day, seedActivityAnchor.Format("2006-01")) {
			t.Errorf("listing view day %q is outside the current seed month", day)
		}
	}
}

func TestSeedMoneyFixturesAreClearlySimulated(t *testing.T) {
	assertReference := func(id, reference string, simulated bool) {
		t.Helper()
		if !simulated {
			t.Errorf("%s must be marked simulated", id)
		}
		if !strings.HasPrefix(reference, "seed-sim-") {
			t.Errorf("%s reference %q is not clearly marked as seed simulation", id, reference)
		}
	}
	for _, pledge := range seedPledges {
		assertReference(pledge.ID, pledge.Reference, pledge.Simulated)
		if pledge.Currency != "GHS" {
			t.Errorf("%s currency = %q, want GHS", pledge.ID, pledge.Currency)
		}
	}
	for _, ticket := range seedTickets {
		assertReference(ticket.ID, ticket.Reference, ticket.Simulated)
		if ticket.Status == domain.PledgeSuccess && len(ticket.Code) != 8 {
			t.Errorf("%s code %q has length %d, want 8", ticket.ID, ticket.Code, len(ticket.Code))
		}
	}
	for _, subscription := range seedSubscriptions {
		assertReference(subscription.ID, subscription.Reference, subscription.Simulated)
	}
	for _, promotion := range seedPromotions {
		assertReference(promotion.ID, promotion.Reference, promotion.Simulated)
	}
}

func TestSeedFixtureIdentifiersAreUnique(t *testing.T) {
	seen := map[string]string{}
	check := func(collection, id string) {
		t.Helper()
		if id == "" {
			t.Errorf("%s contains an empty fixture identifier", collection)
			return
		}
		key := collection + ":" + id
		if first, exists := seen[key]; exists {
			t.Errorf("duplicate %s fixture identifier %q (first seen in %s)", collection, id, first)
			return
		}
		seen[key] = collection
	}
	for _, fixture := range seedModerationRecords {
		check(collModeration, fixture.ID)
	}
	for _, fixture := range seedNotifications {
		check(collNotifications, fixture.ID)
	}
	for _, fixture := range seedReports {
		check(collReports, fixture.ID)
	}
	for _, fixture := range seedPledges {
		check(collPledges, fixture.ID)
		check(collPledges+"-reference", fixture.Reference)
	}
	for _, fixture := range seedTickets {
		check(collTickets, fixture.ID)
		check(collTickets+"-reference", fixture.Reference)
	}
	for _, fixture := range seedSubscriptions {
		check(collSubscriptions, fixture.ID)
		check(collSubscriptions+"-reference", fixture.Reference)
	}
	for _, fixture := range seedPromotions {
		check(collPromotions, fixture.ID)
		check(collPromotions+"-reference", fixture.Reference)
	}
	for _, fixture := range seedListingViews {
		id, _ := fixture["_id"].(string)
		check(collListingViews, id)
	}
	for _, fixture := range seedPlans {
		check(collPlans, fixture.ID)
		check(collPlans+"-slug", fixture.Slug)
	}
}

func TestSeedDerivedListingSetsMatchSuccessfulFixtures(t *testing.T) {
	want := map[string]map[string]bson.M{
		collPledges: {
			"pr-bakaano-lib":  {"details.raisedPesewas": int64(9_500), "details.backers": 1},
			"pr-fosu-cleanup": {"details.raisedPesewas": int64(23_750), "details.backers": 1},
		},
		collSubscriptions: {
			"b-castleview": {"details.subscribedUntil": seedActiveSubscriptionPeriodEnd()},
		},
		collPromotions: {
			"b-kenkey": {"featured": true, "featuredUntil": seedActivityTime(10, 10, 12)},
		},
		collListingViews: {
			"b-castleview":    {"viewCount": 3},
			"b-kenkey":        {"viewCount": 2},
			"e-fetu":          {"viewCount": 3},
			"e-soundlive":     {"viewCount": 1},
			"pr-bakaano-lib":  {"viewCount": 1},
			"pr-fosu-cleanup": {"viewCount": 1},
			"mem-adwoa":       {"viewCount": 1},
		},
	}
	for collection, expected := range want {
		got, err := seedDerivedListingSets(collection)
		if err != nil {
			t.Fatalf("seedDerivedListingSets(%s): %v", collection, err)
		}
		if !reflect.DeepEqual(got, expected) {
			t.Errorf("seedDerivedListingSets(%s) = %#v, want %#v", collection, got, expected)
		}
	}

	listings := seedListings()
	for _, listing := range listings {
		if listing.ID == "b-castleview" && listing.Details["subscribedUntil"] != seedSubscriptions[0].PeriodEnd {
			t.Errorf("b-castleview subscribedUntil does not match successful subscription")
		}
	}
}
