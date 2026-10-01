package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── town goals (civic accountability) ────────────────────────────────────────
//
// A goal is a collective commitment for the town, set for a period and later
// judged achieved/missed by an accountability officer — a public accountability
// record. The flagship is the annual goal set at the grand durbar. Curators set
// goals; officers (a separate role — separation of duties) record the verdict.

var validGoalCadences = map[string]bool{
	domain.GoalCadenceDaily: true, domain.GoalCadenceWeekly: true, domain.GoalCadenceMonthly: true,
	domain.GoalCadenceQuarterly: true, domain.GoalCadenceSemiannual: true, domain.GoalCadenceAnnual: true,
}

// cadenceRank orders goals by scope, broadest first (the annual durbar goal
// leads), then finer cadences.
var cadenceRank = map[string]int{
	domain.GoalCadenceAnnual: 6, domain.GoalCadenceSemiannual: 5, domain.GoalCadenceQuarterly: 4,
	domain.GoalCadenceMonthly: 3, domain.GoalCadenceWeekly: 2, domain.GoalCadenceDaily: 1,
}

// GoalInput is the create/update payload (the verdict never travels here — it
// moves only through ReviewGoal).
type GoalInput struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Target      string `json:"target"`
	Cadence     string `json:"cadence"`
	PeriodLabel string `json:"periodLabel"`
	PeriodStart string `json:"periodStart"`
	PeriodEnd   string `json:"periodEnd"`
	SetAtDurbar bool   `json:"setAtDurbar"`
	Ring        string `json:"ring"`
	Featured    bool   `json:"featured"`
}

// Goals returns every goal for public display, each with Status resolved to its
// EffectiveStatus(now), sorted featured-first, then broadest cadence, then newest
// period.
func (s *Service) Goals(ctx context.Context) ([]domain.Goal, error) {
	rows, err := s.goals.All(ctx)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	for i := range rows {
		rows[i].Status = rows[i].EffectiveStatus(now)
	}
	sortGoals(rows)
	return rows, nil
}

// AdminGoals returns every goal for the back-office with the same computed status
// and ordering as the public list.
func (s *Service) AdminGoals(ctx context.Context) ([]domain.Goal, error) {
	return s.Goals(ctx)
}

// CreateGoal validates and persists a new goal (curator action).
func (s *Service) CreateGoal(ctx context.Context, creator domain.Member, in GoalInput) (domain.Goal, error) {
	g, err := s.buildGoal(in)
	if err != nil {
		return domain.Goal{}, err
	}
	now := time.Now().UTC()
	g.ID = "goal-" + fmt.Sprintf("%d", now.UnixNano())
	g.Slug = slugify(in.Title) + "-" + fmt.Sprintf("%d", now.UnixNano()%1_000_000)
	g.Status = domain.GoalStatusActive
	g.CreatedByID = creator.ID
	g.CreatedByName = creator.DisplayName
	g.CreatedAt = now.Format(time.RFC3339)
	return s.goals.Create(ctx, g)
}

// Goal audit actions, written to the moderation audit log (GET /api/admin/audit)
// with the goal id as the target, so a verdict, edit or delete is never lost
// without trace.
const (
	goalAuditVerdict = "goal_verdict"
	goalAuditAmend   = "goal_verdict_amended"
	goalAuditEdit    = "goal_edit"
	goalAuditDelete  = "goal_delete"

	msgGoalJudged = "This goal already has a recorded verdict; only a steward can change it."
)

// goalJudged reports whether an accountability verdict has been recorded.
func goalJudged(g domain.Goal) bool {
	return g.Status == domain.GoalStatusAchieved || g.Status == domain.GoalStatusMissed
}

// canAlterJudgedGoal: once an officer has judged a goal, only a steward may edit,
// delete or re-judge it — the curators who set the promise cannot rewrite the
// verdict on it (separation of duties).
func canAlterJudgedGoal(actor domain.Member) bool {
	return actor.Role == domain.RoleSteward
}

// auditGoal appends an immutable audit record for a goal action.
func (s *Service) auditGoal(ctx context.Context, goalID, action, reason string, actor domain.Member) error {
	return s.mod.Insert(ctx, domain.ModerationRecord{
		ID:          newID(domain.PrefixModeration),
		ListingID:   goalID,
		ModeratorID: actor.ID,
		Action:      action,
		Reason:      reason,
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	})
}

// UpdateGoal edits an existing goal's editable fields (curator action). The
// verdict/review fields are untouched here. A judged goal can only be edited by
// a steward, so a verdict never ends up sitting under text nobody reviewed.
func (s *Service) UpdateGoal(ctx context.Context, actor domain.Member, id string, in GoalInput) (domain.Goal, error) {
	existing, err := s.goals.ByID(ctx, id)
	if err != nil {
		return domain.Goal{}, err
	}
	if goalJudged(existing) && !canAlterJudgedGoal(actor) {
		return domain.Goal{}, &domain.ForbiddenError{Reason: msgGoalJudged}
	}
	patch, err := s.buildGoal(in)
	if err != nil {
		return domain.Goal{}, err
	}
	before := existing.Title + " / " + existing.Target + " / " + existing.PeriodStart + "–" + existing.PeriodEnd
	existing.Title = patch.Title
	existing.Description = patch.Description
	existing.Target = patch.Target
	existing.Cadence = patch.Cadence
	existing.PeriodLabel = patch.PeriodLabel
	existing.PeriodStart = patch.PeriodStart
	existing.PeriodEnd = patch.PeriodEnd
	existing.SetAtDurbar = patch.SetAtDurbar
	existing.Ring = patch.Ring
	existing.Featured = patch.Featured
	existing.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	out, err := s.goals.Update(ctx, existing)
	if err != nil {
		return domain.Goal{}, err
	}
	if err := s.auditGoal(ctx, id, goalAuditEdit, "was: "+before, actor); err != nil {
		return domain.Goal{}, err
	}
	return out, nil
}

// DeleteGoal removes a goal (curator action). A judged goal is part of the
// public accountability record: only a steward may remove it, and every delete
// is audited with the verdict it carried.
func (s *Service) DeleteGoal(ctx context.Context, actor domain.Member, id string) error {
	g, err := s.goals.ByID(ctx, id)
	if err != nil {
		return err
	}
	if goalJudged(g) && !canAlterJudgedGoal(actor) {
		return &domain.ForbiddenError{Reason: msgGoalJudged}
	}
	reason := g.Title + " (status " + g.Status + ")"
	if g.ReviewNote != "" {
		reason += ": " + g.ReviewNote
	}
	// Audit first: if the record cannot be written the goal stays.
	if err := s.auditGoal(ctx, id, goalAuditDelete, reason, actor); err != nil {
		return err
	}
	return s.goals.Delete(ctx, id)
}

// ReviewGoal records the accountability verdict — achieved or missed — with a
// note and the reviewing officer. This is the manual check the town is held to.
// A verdict is final: once recorded, only a steward can amend it, and every
// verdict (and amendment, with the previous one) goes to the audit log.
func (s *Service) ReviewGoal(ctx context.Context, id, status, note string, reviewer domain.Member) (domain.Goal, error) {
	if status != domain.GoalStatusAchieved && status != domain.GoalStatusMissed {
		return domain.Goal{}, &domain.ValidationError{Message: fmt.Sprintf("verdict must be %q or %q", domain.GoalStatusAchieved, domain.GoalStatusMissed)}
	}
	note = strings.TrimSpace(note)
	if note == "" {
		return domain.Goal{}, &domain.ValidationError{Message: "add a note explaining the verdict"}
	}
	g, err := s.goals.ByID(ctx, id)
	if err != nil {
		return domain.Goal{}, err
	}
	action := goalAuditVerdict
	reason := status + ": " + note
	if goalJudged(g) {
		if !canAlterJudgedGoal(reviewer) {
			return domain.Goal{}, &domain.ForbiddenError{Reason: msgGoalJudged}
		}
		action = goalAuditAmend
		reason = fmt.Sprintf("%s (was %s by %s: %s)", reason, g.Status, g.ReviewedByID, g.ReviewNote)
	}
	now := time.Now().UTC()
	g.Status = status
	g.ReviewNote = note
	g.ReviewedByID = reviewer.ID
	g.ReviewedByName = reviewer.DisplayName
	g.ReviewedAt = now.Format(time.RFC3339)
	g.UpdatedAt = now.Format(time.RFC3339)
	out, err := s.goals.Update(ctx, g)
	if err != nil {
		return domain.Goal{}, err
	}
	if err := s.auditGoal(ctx, id, action, reason, reviewer); err != nil {
		return domain.Goal{}, err
	}
	return out, nil
}

// buildGoal validates a GoalInput into a Goal (without identity/status/review).
func (s *Service) buildGoal(in GoalInput) (domain.Goal, error) {
	title := strings.TrimSpace(in.Title)
	if len(title) < 2 || len(title) > 160 {
		return domain.Goal{}, &domain.ValidationError{Message: "title must be 2–160 characters"}
	}
	if !validGoalCadences[in.Cadence] {
		return domain.Goal{}, &domain.ValidationError{Message: "choose a valid cadence"}
	}
	start := strings.TrimSpace(in.PeriodStart)
	end := strings.TrimSpace(in.PeriodEnd)
	if start == "" || end == "" {
		return domain.Goal{}, &domain.ValidationError{Message: "a goal needs a period start and end"}
	}
	if _, err := time.Parse(time.RFC3339, start); err != nil {
		return domain.Goal{}, &domain.ValidationError{Message: "period start must be an RFC3339 date"}
	}
	if _, err := time.Parse(time.RFC3339, end); err != nil {
		return domain.Goal{}, &domain.ValidationError{Message: "period end must be an RFC3339 date"}
	}
	return domain.Goal{
		Title:       title,
		Description: strings.TrimSpace(in.Description),
		Target:      strings.TrimSpace(in.Target),
		Cadence:     in.Cadence,
		PeriodLabel: strings.TrimSpace(in.PeriodLabel),
		PeriodStart: start,
		PeriodEnd:   end,
		SetAtDurbar: in.SetAtDurbar,
		Ring:        strings.TrimSpace(in.Ring),
		Featured:    in.Featured,
	}, nil
}

// sortGoals orders goals featured-first, then by broadest cadence, then newest
// period start.
func sortGoals(gs []domain.Goal) {
	sort.SliceStable(gs, func(i, j int) bool {
		if gs[i].Featured != gs[j].Featured {
			return gs[i].Featured
		}
		if ri, rj := cadenceRank[gs[i].Cadence], cadenceRank[gs[j].Cadence]; ri != rj {
			return ri > rj
		}
		return gs[i].PeriodStart > gs[j].PeriodStart
	})
}
