package mongo

import (
	"reflect"
	"slices"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// ── political sponsors' documents kept after erasure (spec §3.12) ──────────
//
// They used to be kept for ever: the erasure kept them, nothing deleted
// them. Now the kept document records when its retention ends and a daily
// sweep deletes it once the sponsor's political campaigns no longer need it.

const sweepNow = "2026-10-02T09:00:00Z"

func TestKeptUploadRecordsWhenItsRetentionEnds(t *testing.T) {
	update := keptUpload(politicalRetention{until: "2033-10-20T12:00:00Z"}, sweepNow)
	set, unset := update[opSet].(bson.M), update[opUnset].(bson.M)
	if set[fRetainedFor] != retainedPoliticalAd || set[fRetainUntil] != "2033-10-20T12:00:00Z" {
		t.Errorf("$set = %v, want the marker and the end of retention", set)
	}
	if _, ok := unset[fOwnerID]; !ok || len(unset) != 1 {
		t.Errorf("$unset = %v, want only the owner link", unset)
	}
	// A campaign still running has no end yet: none is recorded, so the
	// sweep looks again every day.
	running := keptUpload(politicalRetention{running: true}, sweepNow)[opSet].(bson.M)
	if _, ok := running[fRetainUntil]; ok {
		t.Errorf("running campaign: $set = %v, want no retainUntil", running)
	}
}

func TestRetainedDueFilterMatchesWhatTheErasureKeeps(t *testing.T) {
	f := retainedDueFilter(sweepNow)
	if f[fRetainedFor] != retainedPoliticalAd || !reflect.DeepEqual(f[fOwnerID], bson.M{opExists: false}) {
		t.Fatalf("filter = %v, want kept, unowned documents only", f)
	}
	want := bson.A{
		bson.M{fRetainUntil: bson.M{opExists: false}},
		bson.M{fRetainUntil: ""},
		bson.M{fRetainUntil: bson.M{adOpLte: sweepNow}},
	}
	if !reflect.DeepEqual(f[opOr], want) {
		t.Fatalf("$or = %v, want no end recorded, or the end reached", f[opOr])
	}
	// The filter names the fields keptUpload writes.
	set := keptUpload(politicalRetention{until: "2033-01-01T00:00:00Z"}, sweepNow)[opSet].(bson.M)
	for _, k := range []string{fRetainedFor, fRetainUntil} {
		if _, ok := set[k]; !ok {
			t.Errorf("the erasure does not write %s", k)
		}
	}
}

func TestPoliticalRetentionMergesSponsorsAndCampaigns(t *testing.T) {
	a := politicalRetention{until: "2031-05-01T00:00:00Z"}
	b := politicalRetention{until: "2033-10-20T12:00:00Z"}
	c := politicalRetention{running: true}
	got := a.merge(b).merge(c)
	if got.until != b.until || !got.running {
		t.Fatalf("merged = %+v, want the latest end and running", got)
	}
	if (politicalRetention{}).keeps(sweepNow) || !c.keeps(sweepNow) || !b.keeps(sweepNow) ||
		(politicalRetention{until: "2026-10-01T00:00:00Z"}).keeps(sweepNow) {
		t.Fatal("keeps: want true only while running or before the end")
	}
}

func TestRetainedSweepPlan(t *testing.T) {
	due := []string{"orphan", "running", "ended", "later", "running-and-later", "ended-today"}
	retention := map[string]politicalRetention{
		// "orphan": no political sponsor names it any more
		"running":           {running: true},
		"ended":             {until: "2026-09-30T00:00:00Z"},
		"later":             {until: "2033-10-20T12:00:00Z"}, // a campaign ended later than recorded
		"running-and-later": {until: "2031-01-01T00:00:00Z", running: true},
		"ended-today":       {until: sweepNow},
	}
	remove, extend := retainedSweepPlan(due, retention, sweepNow)
	slices.Sort(remove)
	if !reflect.DeepEqual(remove, []string{"ended", "ended-today", "orphan"}) {
		t.Errorf("remove = %v", remove)
	}
	if !reflect.DeepEqual(extend, map[string]string{"later": "2033-10-20T12:00:00Z", "running-and-later": "2031-01-01T00:00:00Z"}) {
		t.Errorf("extend = %v", extend)
	}
}
