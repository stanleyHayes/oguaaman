package domain

import "context"

// TimelineEntry — one dated landmark in the history of the people of Oguaa
// (the "history hub"). Year is a string ("1482", "1876") so circa/era dates
// stay possible; seed years as 4-digit strings and a lexical sort is
// chronological.
type TimelineEntry struct {
	ID        string   `json:"id" bson:"_id"`
	Year      string   `json:"year" bson:"year"`
	Title     string   `json:"title" bson:"title"`
	Summary   string   `json:"summary" bson:"summary"`
	Tags      []string `json:"tags,omitempty" bson:"tags,omitempty"`
	CreatedAt string   `json:"createdAt" bson:"createdAt"`
}

// TimelineRepository persists the town's timeline — read publicly, loaded by
// the seed (InsertMany exists for the seed only).
type TimelineRepository interface {
	All(ctx context.Context) ([]TimelineEntry, error)
	InsertMany(ctx context.Context, entries []TimelineEntry) error
}
