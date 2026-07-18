package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

// ── town goals seed (GET /api/goals) ─────────────────────────────────────────
// The town's collective commitments across the cadence ladder — the flagship
// annual goal set at the grand durbar (Fetu Afahye) plus finer quarterly,
// monthly and weekly goals — and two past goals already judged (one kept, one
// missed) so the accountability trail is visible from day one. Curators set
// these; an accountability officer records the verdict.

var seedGoals = []domain.Goal{
	{
		ID:          "goal-2026-annual",
		Slug:        "a-cleaner-oguaa-2026",
		Title:       "A cleaner Oguaa by the next durbar",
		Description: "This year the whole town commits to a visibly cleaner Cape Coast — Kotokuraba, Commercial Street and the shore below the Castle. Every home bags and sorts its rubbish, every gutter is kept clear, and no sachet is dropped on the ground.",
		Target:      "Kotokuraba, Commercial Street and the shore visibly cleaner — judged at Fetu Afahye 2027.",
		Cadence:     domain.GoalCadenceAnnual,
		PeriodLabel: "2026",
		PeriodStart: "2026-01-01T00:00:00Z",
		PeriodEnd:   "2026-12-31T23:59:59Z",
		Status:      domain.GoalStatusActive,
		SetAtDurbar: true,
		Ring:        "town",
		Featured:    true,
		CreatedByID: "m-nana", CreatedByName: "Oguaa Traditional Council",
		CreatedAt: "2026-01-04T09:00:00Z",
	},
	{
		ID:          "goal-2026-q3-gutters",
		Slug:        "clear-the-gutters-q3-2026",
		Title:       "Clear every choked gutter before the heavy rains",
		Description: "Ward by ward, clear and desilt the open drains along Commercial Street and the market lanes so the July–September rains run off instead of flooding rooms.",
		Target:      "All main gutters in the central wards desilted by 30 September.",
		Cadence:     domain.GoalCadenceQuarterly,
		PeriodLabel: "Q3 2026",
		PeriodStart: "2026-07-01T00:00:00Z",
		PeriodEnd:   "2026-09-30T23:59:59Z",
		Status:      domain.GoalStatusActive,
		Ring:        "town",
		CreatedByID: "m-nana", CreatedByName: "Cape Coast Metropolitan Assembly",
		CreatedAt: "2026-06-28T09:00:00Z",
	},
	{
		ID:          "goal-2026-jul-classrooms",
		Slug:        "clean-classrooms-july-2026",
		Title:       "Every classroom swept and tidy, every day",
		Description: "Through July, each school keeps its own compound and classrooms clean at the close of day — pupils sweep, dust the louvres and clear the desks.",
		Cadence:     domain.GoalCadenceMonthly,
		PeriodLabel: "July 2026",
		PeriodStart: "2026-07-01T00:00:00Z",
		PeriodEnd:   "2026-07-31T23:59:59Z",
		Status:      domain.GoalStatusActive,
		Ring:        "school",
		CreatedByID: "m-nana", CreatedByName: "Oguaa Schools Union",
		CreatedAt: "2026-06-30T09:00:00Z",
	},
	{
		ID:          "goal-2026-w29-read",
		Slug:        "read-off-screen-week-29-2026",
		Title:       "Read thirty minutes a day, off the screen",
		Description: "This week, put the phone down after nine and read — a book, scripture, the newspaper on paper. Cape Coast schooled the nation; keep the habit.",
		Cadence:     domain.GoalCadenceWeekly,
		PeriodLabel: "Week of 14 July 2026",
		PeriodStart: "2026-07-13T00:00:00Z",
		PeriodEnd:   "2026-07-19T23:59:59Z",
		Status:      domain.GoalStatusActive,
		Ring:        "self",
		CreatedByID: "m-nana", CreatedByName: "Oguaa Reads",
		CreatedAt: "2026-07-12T18:00:00Z",
	},
	{
		ID:          "goal-2025-annual",
		Slug:        "clean-up-saturdays-2025",
		Title:       "Bring back the town clean-up Saturdays",
		Description: "Through 2025 Oguaa revived the monthly communal clean-up — one Saturday a month, ward by ward, along the gutters and the shore.",
		Target:      "A communal clean-up held every month of 2025.",
		Cadence:     domain.GoalCadenceAnnual,
		PeriodLabel: "2025",
		PeriodStart: "2025-01-01T00:00:00Z",
		PeriodEnd:   "2025-12-31T23:59:59Z",
		Status:      domain.GoalStatusAchieved,
		SetAtDurbar: true,
		Ring:        "town",
		CreatedByID: "m-nana", CreatedByName: "Oguaa Traditional Council",
		CreatedAt:    "2025-01-06T09:00:00Z",
		ReviewNote:   "Held in eleven of twelve months — the town turned out. Counted as kept.",
		ReviewedByID: "m-nana", ReviewedByName: "Kwesi Aidoo · Accountability Officer",
		ReviewedAt: "2026-01-05T10:00:00Z",
		UpdatedAt:  "2026-01-05T10:00:00Z",
	},
	{
		ID:          "goal-2026-q2-commercial",
		Slug:        "zero-litter-commercial-street-q2-2026",
		Title:       "Zero litter on Commercial Street",
		Description: "For the second quarter, keep Commercial Street free of dropped sachets and bottles from dawn to dusk.",
		Cadence:     domain.GoalCadenceQuarterly,
		PeriodLabel: "Q2 2026",
		PeriodStart: "2026-04-01T00:00:00Z",
		PeriodEnd:   "2026-06-30T23:59:59Z",
		Status:      domain.GoalStatusMissed,
		Ring:        "town",
		CreatedByID: "m-nana", CreatedByName: "Cape Coast Metropolitan Assembly",
		CreatedAt:    "2026-03-30T09:00:00Z",
		ReviewNote:   "Bins were too few and market days overwhelmed the daily sweep. Not met — carried into the annual goal.",
		ReviewedByID: "m-nana", ReviewedByName: "Kwesi Aidoo · Accountability Officer",
		ReviewedAt: "2026-07-02T10:00:00Z",
		UpdatedAt:  "2026-07-02T10:00:00Z",
	},
}

// seedGoals loads the town goals (seed only).
func seedGoalsData(ctx context.Context, db *mongo.Database) error {
	return insertAll(ctx, db.Collection(collGoals), seedGoals)
}

// SeedGoalsOnly drops and reloads ONLY the goals collection, leaving every other
// collection untouched — a targeted, non-destructive top-up for a live database
// (mirrors SeedCivicOnly). Idempotent.
func SeedGoalsOnly(ctx context.Context, db *mongo.Database) error {
	if err := db.Collection(collGoals).Drop(ctx); err != nil {
		return err
	}
	return seedGoalsData(ctx, db)
}
