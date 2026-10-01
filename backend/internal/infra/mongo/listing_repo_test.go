package mongo

import (
	"reflect"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// R27: candle records live in listing_views with a day field, but the admin
// "views this month" figure counts page views only.
func TestPlatformViewsFilterSkipsCandleRecords(t *testing.T) {
	t.Parallel()

	want := bson.M{
		"day":  bson.M{"$gte": "2026-10-01", "$lte": "2026-10-31"},
		"kind": bson.M{"$ne": "candle"},
	}
	got := platformViewsFilter("2026-10-01", "2026-10-31")
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("platformViewsFilter() = %#v, want %#v", got, want)
	}
}
