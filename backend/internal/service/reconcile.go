package service

import (
	"context"
	"errors"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── payment reconciliation sweep (C5) ────────────────────────────────────────
//
// The Paystack webhook URL is shared with the owner's other apps, so Oguaa
// can't rely on it. Every ~10 minutes the sweep re-verifies Oguaa's pending
// payment records through the same idempotent confirm paths the redirect and
// webhook use (C1: still processing stays pending, a final failure fails, a
// success settles exactly once). Records still pending after 48 hours are
// closed as abandoned. Each flow is bounded per run.

const (
	// ReconcileInterval is how often cmd/server runs the sweep.
	ReconcileInterval = 10 * time.Minute
	// reconcileMinAge leaves a fresh checkout to the payer's own confirm.
	reconcileMinAge = 2 * time.Minute
	// reconcileMaxAge is when an unpaid record is given up as abandoned.
	reconcileMaxAge = 48 * time.Hour
	// reconcileBatch bounds each flow's work per window per run.
	reconcileBatch = 50
	// AbandonedReason is recorded on records the sweep closes.
	AbandonedReason = domain.AbandonedPaymentReason
)

// ReconcileCounts is one flow's outcome for a run.
type ReconcileCounts struct {
	Checked int `json:"checked"`
	Settled int `json:"settled"` // paid and granted (or already settled)
	Pending int `json:"pending"` // Paystack still processing
	Failed  int `json:"failed"`  // final: failed, abandoned, mismatched
	Expired int `json:"expired"` // closed after 48 h still unpaid
	Errors  int `json:"errors"`  // transient: retried next run
}

// reconcileFlow adapts one money flow to the sweep.
type reconcileFlow struct {
	name    string
	pending func(ctx context.Context, from, to string, limit int) ([]string, error)
	confirm func(ctx context.Context, ref string) error
	// expire closes a still-pending record; nil = the flow never expires
	// (an agent job's checkout stays payable while the job is quoted).
	expire func(ctx context.Context, ref, reason, at string) (bool, error)
}

// PaymentReconciler re-verifies pending payments across every flow.
type PaymentReconciler struct {
	flows []reconcileFlow
	now   func() time.Time
}

// refsOf maps records to their references.
func refsOf[T any](rows []T, err error, ref func(T) string) ([]string, error) {
	if err != nil {
		return nil, err
	}
	out := make([]string, len(rows))
	for i, r := range rows {
		out[i] = ref(r)
	}
	return out, nil
}

// NewPaymentReconciler wires the sweep to every Paystack flow. A nil service
// is skipped.
func NewPaymentReconciler(p *PaymentsService, t *TicketsService, s *SubscriptionsService, pr *PromotionsService, c *CommerceService, j *AgentJobsService) *PaymentReconciler {
	r := &PaymentReconciler{now: time.Now}
	if p != nil {
		r.flows = append(r.flows, reconcileFlow{name: "pledges",
			pending: func(ctx context.Context, from, to string, n int) ([]string, error) {
				rows, err := p.pledges.PendingBetween(ctx, from, to, n)
				return refsOf(rows, err, func(x domain.Pledge) string { return x.Reference })
			},
			confirm: func(ctx context.Context, ref string) error { _, err := p.ConfirmPledge(ctx, ref); return err },
			expire:  p.pledges.ExpirePending})
	}
	if t != nil {
		r.flows = append(r.flows, reconcileFlow{name: "tickets",
			pending: func(ctx context.Context, from, to string, n int) ([]string, error) {
				rows, err := t.tickets.PendingBetween(ctx, from, to, n)
				return refsOf(rows, err, func(x domain.Ticket) string { return x.Reference })
			},
			confirm: func(ctx context.Context, ref string) error { _, err := t.ConfirmTicket(ctx, ref); return err },
			expire:  t.tickets.ExpirePending})
	}
	if s != nil {
		r.flows = append(r.flows, reconcileFlow{name: "subscriptions",
			pending: func(ctx context.Context, from, to string, n int) ([]string, error) {
				rows, err := s.subs.PendingBetween(ctx, from, to, n)
				return refsOf(rows, err, func(x domain.Subscription) string { return x.Reference })
			},
			confirm: func(ctx context.Context, ref string) error { _, err := s.ConfirmSubscription(ctx, ref); return err },
			expire:  s.subs.ExpirePending})
	}
	if pr != nil {
		r.flows = append(r.flows, reconcileFlow{name: "promotions",
			pending: func(ctx context.Context, from, to string, n int) ([]string, error) {
				rows, err := pr.promotions.PendingBetween(ctx, from, to, n)
				return refsOf(rows, err, func(x domain.Promotion) string { return x.Reference })
			},
			confirm: func(ctx context.Context, ref string) error { _, err := pr.ConfirmPromotion(ctx, ref); return err },
			expire:  pr.promotions.ExpirePending})
	}
	if c != nil {
		r.flows = append(r.flows, reconcileFlow{name: "orders",
			pending: func(ctx context.Context, from, to string, n int) ([]string, error) {
				rows, err := c.orders.PendingBetween(ctx, from, to, n)
				return refsOf(rows, err, func(x domain.CommerceOrder) string { return x.Reference })
			},
			confirm: func(ctx context.Context, ref string) error { _, err := c.ConfirmOrder(ctx, ref); return err },
			expire:  c.orders.ExpirePending})
	}
	if j != nil {
		r.flows = append(r.flows, reconcileFlow{name: "agentJobs",
			pending: func(ctx context.Context, from, to string, n int) ([]string, error) {
				rows, err := j.jobs.PendingCheckouts(ctx, from, to, n)
				return refsOf(rows, err, func(x domain.AgentJob) string { return x.Reference })
			},
			confirm: func(ctx context.Context, ref string) error { _, err := j.ConfirmFunding(ctx, ref); return err }})
	}
	return r
}

// reconcileOutcome classifies a confirm result.
type reconcileOutcome int

const (
	outcomeSettled reconcileOutcome = iota
	outcomePending
	outcomeFailed
	outcomeTransient
)

func classifyConfirm(err error) reconcileOutcome {
	switch {
	case err == nil:
		return outcomeSettled
	case errors.Is(err, ErrPaymentPending):
		return outcomePending
	case SettlementFinal(err):
		return outcomeFailed
	default:
		return outcomeTransient
	}
}

func (c *ReconcileCounts) count(o reconcileOutcome) {
	c.Checked++
	switch o {
	case outcomeSettled:
		c.Settled++
	case outcomePending:
		c.Pending++
	case outcomeFailed:
		c.Failed++
	default:
		c.Errors++
	}
}

// Run sweeps every flow once and returns per-flow counts. It never panics on
// a flow's failure; a flow whose work list can't be read counts one error.
func (r *PaymentReconciler) Run(ctx context.Context) map[string]ReconcileCounts {
	now := r.now().UTC()
	fresh := now.Add(-reconcileMinAge).Format(time.RFC3339)
	stale := now.Add(-reconcileMaxAge).Format(time.RFC3339)
	out := make(map[string]ReconcileCounts, len(r.flows))
	for _, f := range r.flows {
		var counts ReconcileCounts
		r.recheck(ctx, f, stale, fresh, &counts)
		r.expireStale(ctx, f, stale, now.Format(time.RFC3339), &counts)
		out[f.name] = counts
	}
	return out
}

// recheck re-verifies records pending between 2 minutes and 48 hours old.
func (r *PaymentReconciler) recheck(ctx context.Context, f reconcileFlow, from, to string, counts *ReconcileCounts) {
	refs, err := f.pending(ctx, from, to, reconcileBatch)
	if err != nil {
		counts.Errors++
		return
	}
	for _, ref := range refs {
		counts.count(classifyConfirm(f.confirm(ctx, ref)))
	}
}

// expireStale gives a record pending for over 48 hours one last check and,
// unless it turns out paid or Paystack can't be asked, closes it as
// abandoned. A late payment still settles afterwards: confirms re-verify any
// record that has not succeeded.
func (r *PaymentReconciler) expireStale(ctx context.Context, f reconcileFlow, before, at string, counts *ReconcileCounts) {
	if f.expire == nil {
		return
	}
	refs, err := f.pending(ctx, "", before, reconcileBatch)
	if err != nil {
		counts.Errors++
		return
	}
	for _, ref := range refs {
		outcome := classifyConfirm(f.confirm(ctx, ref))
		if outcome == outcomeSettled || outcome == outcomeTransient {
			counts.count(outcome)
			continue
		}
		counts.Checked++
		if closed, err := f.expire(ctx, ref, AbandonedReason, at); err != nil {
			counts.Errors++
		} else if closed {
			counts.Expired++
		} else {
			counts.Failed++ // the confirm already failed it
		}
	}
}
