package mongo

import (
	"context"
	"fmt"
	"sort"

	"go.mongodb.org/mongo-driver/v2/bson"
	mongodriver "go.mongodb.org/mongo-driver/v2/mongo"
)

// MapBackfillResult reports the documents selected and changed in one
// collection. In dry-run mode ModifiedCount is always zero.
type MapBackfillResult struct {
	Collection    string
	MatchedCount  int64
	ModifiedCount int64
}

type mapBackfillTarget struct {
	ID        string
	Latitude  float64
	Longitude float64
}

// BackfillMapCoordinates adds the known seed coordinates to existing listings
// and organizations. Dry-run is the default at the command boundary; when
// apply is false this function only counts documents that need a coordinate.
//
// Updates are deliberately conditional. A non-null latitude or longitude is
// retained, including on a partially populated document, so this operation can
// never replace coordinates supplied after the original seed.
func BackfillMapCoordinates(ctx context.Context, db *mongodriver.Database, apply bool) ([]MapBackfillResult, error) {
	collections := []struct {
		name    string
		targets []mapBackfillTarget
	}{
		{name: collListings, targets: mapBackfillTargets(listingGeo)},
		{name: collOrgs, targets: mapBackfillTargets(orgGeo)},
	}

	results := make([]MapBackfillResult, 0, len(collections))
	for _, collection := range collections {
		result, err := backfillMapCollection(ctx, db.Collection(collection.name), collection.name, collection.targets, apply)
		if err != nil {
			return nil, err
		}
		results = append(results, result)
	}
	return results, nil
}

func backfillMapCollection(
	ctx context.Context,
	collection *mongodriver.Collection,
	collectionName string,
	targets []mapBackfillTarget,
	apply bool,
) (MapBackfillResult, error) {
	result := MapBackfillResult{Collection: collectionName}
	for _, target := range targets {
		filter := coordinateBackfillFilter(target.ID)
		if !apply {
			matched, err := collection.CountDocuments(ctx, filter)
			if err != nil {
				return result, fmt.Errorf("count map coordinates for %s %q: %w", collectionName, target.ID, err)
			}
			result.MatchedCount += matched
			continue
		}

		updateResult, err := collection.UpdateOne(
			ctx,
			filter,
			coordinateBackfillUpdate(target.Latitude, target.Longitude),
		)
		if err != nil {
			return result, fmt.Errorf("backfill map coordinates for %s %q: %w", collectionName, target.ID, err)
		}
		result.MatchedCount += updateResult.MatchedCount
		result.ModifiedCount += updateResult.ModifiedCount
	}
	return result, nil
}

func mapBackfillTargets(coords map[string][2]float64) []mapBackfillTarget {
	ids := make([]string, 0, len(coords))
	for id := range coords {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	targets := make([]mapBackfillTarget, 0, len(ids))
	for _, id := range ids {
		coord := coords[id]
		targets = append(targets, mapBackfillTarget{
			ID:        id,
			Latitude:  coord[0],
			Longitude: coord[1],
		})
	}
	return targets
}

func coordinateBackfillFilter(id string) bson.D {
	return bson.D{
		{Key: "_id", Value: id},
		{Key: "$or", Value: bson.A{
			bson.D{{Key: "latitude", Value: bson.D{{Key: "$exists", Value: false}}}},
			bson.D{{Key: "latitude", Value: nil}},
			bson.D{{Key: "longitude", Value: bson.D{{Key: "$exists", Value: false}}}},
			bson.D{{Key: "longitude", Value: nil}},
		}},
	}
}

func coordinateBackfillUpdate(latitude, longitude float64) mongodriver.Pipeline {
	return mongodriver.Pipeline{
		bson.D{{Key: "$set", Value: bson.D{
			{Key: "latitude", Value: bson.D{{Key: "$ifNull", Value: bson.A{"$latitude", latitude}}}},
			{Key: "longitude", Value: bson.D{{Key: "$ifNull", Value: bson.A{"$longitude", longitude}}}},
		}}},
	}
}
