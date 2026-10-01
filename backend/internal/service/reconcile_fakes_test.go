package service

import (
	"context"
	"sort"

	"github.com/oguaa/backend/internal/domain"
)

// ── reconciliation methods on the in-memory payment fakes (C5) ──────────────

// inWindow reports whether at is in [from, to) (from "" = no lower bound).
func inWindow(at, from, to string) bool { return (from == "" || at >= from) && at < to }

// pendingRows filters rows to the pending ones created in the window, oldest
// first, at most limit.
func pendingRows[T any](rows []T, pending func(T) bool, at func(T) string, from, to string, limit int) []T {
	out := []T{}
	for _, r := range rows {
		if pending(r) && inWindow(at(r), from, to) {
			out = append(out, r)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return at(out[i]) < at(out[j]) })
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

func (f *fakePledges) PendingBetween(_ context.Context, from, to string, limit int) ([]domain.Pledge, error) {
	return pendingRows(f.rows, func(p domain.Pledge) bool { return p.Status == domain.PledgePending }, func(p domain.Pledge) string { return p.CreatedAt }, from, to, limit), nil
}
func (f *fakePledges) ExpirePending(_ context.Context, ref, reason, _ string) (bool, error) {
	for i := range f.rows {
		if f.rows[i].Reference == ref && f.rows[i].Status == domain.PledgePending {
			f.rows[i].Status, f.rows[i].FailureReason = domain.PledgeFailed, reason
			return true, nil
		}
	}
	return false, nil
}

func (f *fakeTickets) PendingBetween(_ context.Context, from, to string, limit int) ([]domain.Ticket, error) {
	return pendingRows(f.rows, func(t domain.Ticket) bool { return t.Status == domain.PledgePending }, func(t domain.Ticket) string { return t.CreatedAt }, from, to, limit), nil
}
func (f *fakeTickets) ExpirePending(_ context.Context, ref, reason, _ string) (bool, error) {
	for i := range f.rows {
		if f.rows[i].Reference == ref && f.rows[i].Status == domain.PledgePending {
			f.rows[i].Status, f.rows[i].FailureReason = domain.PledgeFailed, reason
			return true, nil
		}
	}
	return false, nil
}

func (f *fakeSubs) PendingBetween(_ context.Context, from, to string, limit int) ([]domain.Subscription, error) {
	return pendingRows(f.rows, func(s domain.Subscription) bool { return s.Status == domain.PledgePending }, func(s domain.Subscription) string { return s.CreatedAt }, from, to, limit), nil
}
func (f *fakeSubs) ExpirePending(_ context.Context, ref, reason, _ string) (bool, error) {
	for i := range f.rows {
		if f.rows[i].Reference == ref && f.rows[i].Status == domain.PledgePending {
			f.rows[i].Status, f.rows[i].FailureReason = domain.PledgeFailed, reason
			return true, nil
		}
	}
	return false, nil
}

func (f *fakePromos) PendingBetween(_ context.Context, from, to string, limit int) ([]domain.Promotion, error) {
	return pendingRows(f.rows, func(p domain.Promotion) bool { return p.Status == domain.PledgePending }, func(p domain.Promotion) string { return p.CreatedAt }, from, to, limit), nil
}
func (f *fakePromos) ExpirePending(_ context.Context, ref, reason, _ string) (bool, error) {
	for i := range f.rows {
		if f.rows[i].Reference == ref && f.rows[i].Status == domain.PledgePending {
			f.rows[i].Status, f.rows[i].FailureReason = domain.PledgeFailed, reason
			return true, nil
		}
	}
	return false, nil
}

func (f *orderFake) PendingBetween(_ context.Context, from, to string, limit int) ([]domain.CommerceOrder, error) {
	return pendingRows(f.rows, func(o domain.CommerceOrder) bool { return o.Status == domain.OrderPending }, func(o domain.CommerceOrder) string { return o.CreatedAt }, from, to, limit), nil
}
func (f *orderFake) ExpirePending(_ context.Context, ref, reason, at string) (bool, error) {
	for i := range f.rows {
		if f.rows[i].Reference == ref && f.rows[i].Status == domain.OrderPending {
			f.rows[i].Status, f.rows[i].CancelReason, f.rows[i].UpdatedAt = domain.OrderCancelled, reason, at
			return true, nil
		}
	}
	return false, nil
}

func (s *stubJobs) PendingCheckouts(_ context.Context, from, to string, limit int) ([]domain.AgentJob, error) {
	rows := make([]domain.AgentJob, 0, len(s.m))
	for _, j := range s.m {
		rows = append(rows, j)
	}
	return pendingRows(rows, func(j domain.AgentJob) bool {
		return j.Status == domain.JobStatusQuoted && j.Escrow.Status == domain.EscrowPending && j.Reference != ""
	}, func(j domain.AgentJob) string { return j.UpdatedAt }, from, to, limit), nil
}
