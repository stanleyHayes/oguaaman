package mongo

import (
	"reflect"
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

func TestCoordinateBackfillFilterRequiresMissingOrNullCoordinate(t *testing.T) {
	t.Parallel()

	want := bson.D{
		{Key: "_id", Value: "b-castleview"},
		{Key: "$or", Value: bson.A{
			bson.D{{Key: "latitude", Value: bson.D{{Key: "$exists", Value: false}}}},
			bson.D{{Key: "latitude", Value: nil}},
			bson.D{{Key: "longitude", Value: bson.D{{Key: "$exists", Value: false}}}},
			bson.D{{Key: "longitude", Value: nil}},
		}},
	}
	got := coordinateBackfillFilter("b-castleview")
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("coordinateBackfillFilter() = %#v, want %#v", got, want)
	}
}

func TestCoordinateBackfillUpdatePreservesExistingValues(t *testing.T) {
	t.Parallel()

	want := mongodriver.Pipeline{
		bson.D{{Key: "$set", Value: bson.D{
			{Key: "latitude", Value: bson.D{{Key: "$ifNull", Value: bson.A{"$latitude", 5.105}}}},
			{Key: "longitude", Value: bson.D{{Key: "$ifNull", Value: bson.A{"$longitude", -1.2431}}}},
		}}},
	}
	got := coordinateBackfillUpdate(5.105, -1.2431)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("coordinateBackfillUpdate() = %#v, want %#v", got, want)
	}
}

func TestMapBackfillTargetsAreStable(t *testing.T) {
	t.Parallel()

	targets := mapBackfillTargets(map[string][2]float64{
		"second": {5.2, -1.2},
		"first":  {5.1, -1.1},
	})
	if len(targets) != 2 {
		t.Fatalf("mapBackfillTargets() returned %d targets, want 2", len(targets))
	}
	if targets[0].ID != "first" || targets[1].ID != "second" {
		t.Fatalf("mapBackfillTargets() order = %q, %q; want first, second", targets[0].ID, targets[1].ID)
	}
}
