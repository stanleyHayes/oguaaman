package service

import (
	"context"
	"net/http"
	"time"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"

	"github.com/oguaa/backend/internal/domain"
)

// ── the daily research cap, request by request (spec §2.7) ───────────────────
//
// Every Claude request a run makes (each pause_turn continuation and the
// regenerate included) first reserves its ceiling against today's research
// USD cap and is not sent when that would pass the cap. Afterwards the
// reservation is settled to the request's cost. An attempt that may have been
// billed without returning its usage (a timeout or a dropped connection,
// which the SDK may also have retried) is charged its whole ceiling rather
// than nothing. A counter that cannot be read refuses (fail closed).

// errOverCap stops a run whose next request would pass today's cap.
var errOverCap = &deskError{kind: errCapped, reason: errBudget}

// researchBudget meters one run's Claude requests against today's cap.
type researchBudget struct {
	desk  *NewsDesk
	jobID string
	day   string
	limit int64
	sent  int // requests sent in this run
}

// request sends one metered Claude request. The returned error is already
// classified (errOverCap when the request was not sent).
func (b *researchBudget) request(ctx context.Context, params anthropic.BetaMessageNewParams, ceiling int64, timeout time.Duration) (*anthropic.BetaMessage, error) {
	d := b.desk
	if !d.reserve(ctx, b.day, keyResearchUSD, ceiling, b.limit) {
		return nil, errOverCap
	}
	b.sent++
	var tally attemptTally
	msg, err := d.claude.Beta.Messages.New(ctx, params, option.WithRequestTimeout(timeout), option.WithMiddleware(tally.count))
	b.charge(ctx, ceiling, requestCharge(msg, tally.uncertain, ceiling))
	if err != nil {
		return nil, classifyClaudeErr(err)
	}
	return msg, nil
}

// charge settles a request's reservation to what it is charged and records
// the charge on the job.
func (b *researchBudget) charge(ctx context.Context, reserved, cost int64) {
	d := b.desk
	d.settle(ctx, b.day, keyResearchUSD, cost-reserved)
	if cost == 0 {
		return
	}
	if err := d.jobs.AddCost(context.WithoutCancel(ctx), b.jobID, cost, 0); err != nil {
		d.log.Warn("newsdesk: could not record Claude cost", "job", b.jobID, "err", err)
	}
}

// attemptTally counts the HTTP attempts of one request (the SDK's own
// retries included) that may have been billed: every attempt except one the
// API answered with an error status.
type attemptTally struct{ uncertain int64 }

func (t *attemptTally) count(req *http.Request, next option.MiddlewareNext) (*http.Response, error) {
	res, err := next(req)
	if err != nil || res == nil || res.StatusCode < http.StatusBadRequest {
		t.uncertain++
	}
	return res, err
}

// requestCharge is what one request is charged: the usage of the message it
// returned, plus the ceiling for every other attempt that may have been
// billed without reporting usage.
func requestCharge(msg *anthropic.BetaMessage, uncertain, ceiling int64) int64 {
	var cost int64
	if msg != nil {
		cost = claudeCostMicroUSD(msg.Model, msg.Usage)
		uncertain-- // the attempt that returned the message is priced from its usage
	}
	return cost + max(uncertain, 0)*ceiling
}

// overCap ends a run that today's research cap stopped: back in the queue
// for tomorrow 00:05 Accra. A run that sent nothing gives back its attempt
// and its report slot; one that already spent keeps the attempt, so a job
// too big for the cap fails after three tries instead of spending every day.
func (d *NewsDesk) overCap(ctx context.Context, job *domain.NewsResearchJob, b *researchBudget) domain.NewsJobOutcome {
	if b.sent == 0 {
		d.settle(ctx, b.day, keyReports, -1)
		return d.budgetRequeue()
	}
	if job.Attempts >= maxJobAttempts {
		return domain.NewsJobOutcome{Status: domain.NewsJobFailed, LastError: errBudget}
	}
	o := d.budgetRequeue()
	o.RefundAttempt = false
	return o
}
