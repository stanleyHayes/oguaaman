package domain

import "context"

// CivicBehaviour — one entry in the town's code of conduct: a thing to do or to
// stop, placed on a ring of responsibility that widens from the self outward.
// Rings: self, home, school, work, town (Cape-Coast civic life), nation.
// Read publicly (GET /api/civic); loaded by the seed. The JSON shape is the
// frontend contract and must not drift.
type CivicBehaviour struct {
	Slug        string `json:"slug" bson:"_id"`
	Ring        string `json:"ring" bson:"ring"`               // self | home | school | work | town | nation
	Type        string `json:"type" bson:"type"`               // do | stop
	Title       string `json:"title" bson:"title"`             // the call to action
	Description string `json:"description" bson:"description"` // the practice, in Oguaa terms
	Why         string `json:"why" bson:"why"`                 // one line: why it matters
}

// CivicLesson — a principle drawn from a civilization that built a great,
// orderly society, with a one-line lesson adapted for Cape Coast. Read publicly
// (GET /api/civic); loaded by the seed.
type CivicLesson struct {
	Slug      string `json:"slug" bson:"_id"`
	Name      string `json:"name" bson:"name"`
	Era       string `json:"era" bson:"era"`
	Principle string `json:"principle" bson:"principle"`
	Lesson    string `json:"lesson" bson:"lesson"`
}

// CivicBehaviourRepository persists the code of behaviours — read publicly and
// now editable from the admin dashboard (curators add/edit/remove pledges).
// InsertMany exists for the seed.
type CivicBehaviourRepository interface {
	All(ctx context.Context) ([]CivicBehaviour, error)
	BySlug(ctx context.Context, slug string) (CivicBehaviour, error)
	Create(ctx context.Context, b CivicBehaviour) (CivicBehaviour, error)
	Update(ctx context.Context, b CivicBehaviour) (CivicBehaviour, error)
	Delete(ctx context.Context, slug string) error
	InsertMany(ctx context.Context, items []CivicBehaviour) error
}

// CivicLessonRepository persists the civilization lessons — read publicly,
// loaded by the seed (InsertMany exists for the seed only).
type CivicLessonRepository interface {
	All(ctx context.Context) ([]CivicLesson, error)
	InsertMany(ctx context.Context, items []CivicLesson) error
}
