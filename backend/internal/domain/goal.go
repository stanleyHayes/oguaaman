package domain

import (
	"context"
	"time"
)

// Goal — a collective civic commitment for the town (Oguaa), set for a period,
// shown to remind everyone, and later JUDGED (achieved/missed) by an
// accountability officer. Distinct from a Directive (an authority's emergency /
// advisory notice): a Goal is a shared promise the whole town is held to. The
// flagship is the annual goal set at the grand durbar (Fetu Afahye); finer
// cadences (quarterly, weekly, daily) keep the town moving between durbars.
type Goal struct {
	ID          string `json:"id" bson:"_id"`
	Slug        string `json:"slug" bson:"slug"`
	Title       string `json:"title" bson:"title"`
	Description string `json:"description" bson:"description"`
	Target      string `json:"target,omitempty" bson:"target,omitempty"` // optional measurable line

	Cadence string `json:"cadence" bson:"cadence"` // daily|weekly|monthly|quarterly|semiannual|annual

	// Period window (RFC3339) + a human label ("2026", "Q3 2026", "Week of 14 Jul").
	PeriodLabel string `json:"periodLabel" bson:"periodLabel"`
	PeriodStart string `json:"periodStart" bson:"periodStart"`
	PeriodEnd   string `json:"periodEnd" bson:"periodEnd"`

	// Stored status: active | achieved | missed. "pending_review" is COMPUTED on
	// read once PeriodEnd has passed with no verdict (never stored), mirroring how
	// Directive derives "expired".
	Status string `json:"status" bson:"status"`

	// Accountability trail — set when an officer records the verdict.
	ReviewNote     string `json:"reviewNote,omitempty" bson:"reviewNote,omitempty"`
	ReviewedByID   string `json:"reviewedById,omitempty" bson:"reviewedById,omitempty"`
	ReviewedByName string `json:"reviewedByName,omitempty" bson:"reviewedByName,omitempty"`
	ReviewedAt     string `json:"reviewedAt,omitempty" bson:"reviewedAt,omitempty"`

	SetAtDurbar bool   `json:"setAtDurbar" bson:"setAtDurbar"`
	Ring        string `json:"ring,omitempty" bson:"ring,omitempty"` // optional civic ring link
	Featured    bool   `json:"featured" bson:"featured"`             // pin as the headline goal

	CreatedByID   string `json:"createdById" bson:"createdById"`
	CreatedByName string `json:"createdByName,omitempty" bson:"createdByName,omitempty"`
	CreatedAt     string `json:"createdAt" bson:"createdAt"`
	UpdatedAt     string `json:"updatedAt,omitempty" bson:"updatedAt,omitempty"`
}

// Goal cadences — the ladder from the daily habit to the durbar year.
const (
	GoalCadenceDaily      = "daily"
	GoalCadenceWeekly     = "weekly"
	GoalCadenceMonthly    = "monthly"
	GoalCadenceQuarterly  = "quarterly"
	GoalCadenceSemiannual = "semiannual"
	GoalCadenceAnnual     = "annual"
)

// Stored goal statuses (a recorded verdict, or still in-flight).
const (
	GoalStatusActive   = "active"
	GoalStatusAchieved = "achieved"
	GoalStatusMissed   = "missed"
)

// GoalStatusPendingReview is COMPUTED on read (never stored): the window has
// closed but no officer has recorded a verdict yet.
const GoalStatusPendingReview = "pending_review"

// EffectiveStatus is the display status at now: a recorded verdict
// (achieved/missed) always wins; otherwise "active" until PeriodEnd passes, then
// "pending_review". An unparseable/empty PeriodEnd is treated as open-ended (the
// goal stays active) so a malformed date never hides a live goal.
func (g Goal) EffectiveStatus(now time.Time) string {
	if g.Status == GoalStatusAchieved || g.Status == GoalStatusMissed {
		return g.Status
	}
	if g.PeriodEnd != "" {
		if end, err := time.Parse(time.RFC3339, g.PeriodEnd); err == nil && now.After(end) {
			return GoalStatusPendingReview
		}
	}
	return GoalStatusActive
}

// GoalRepository persists town goals.
type GoalRepository interface {
	All(ctx context.Context) ([]Goal, error)
	ByID(ctx context.Context, id string) (Goal, error)
	Create(ctx context.Context, g Goal) (Goal, error)
	Update(ctx context.Context, g Goal) (Goal, error)
	Delete(ctx context.Context, id string) error
	InsertMany(ctx context.Context, gs []Goal) error
}
