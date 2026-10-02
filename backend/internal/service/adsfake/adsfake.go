// Package adsfake holds in-memory ads repositories with the Mongo
// repositories' conditional-write semantics, for tests of the ads service and
// its HTTP handlers. Nothing in production imports it.
package adsfake

import (
	"context"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// Ads is an in-memory domain.AdRepository.
type Ads struct {
	mu   sync.Mutex
	Rows map[string]*domain.AdCampaign
	// MarkPaidWins counts successful MarkPaid calls (concurrency tests).
	MarkPaidWins int
	// Now is the clock Overlapping uses for unexpired approvals.
	Now func() time.Time
}

// NewAds returns an empty repository.
func NewAds() *Ads {
	return &Ads{Rows: map[string]*domain.AdCampaign{}, Now: time.Now}
}

func clone(c *domain.AdCampaign) *domain.AdCampaign {
	out := *c
	out.StatusHistory = slices.Clone(c.StatusHistory)
	out.Approvals = slices.Clone(c.Approvals)
	out.Refunds = slices.Clone(c.Refunds)
	out.PastReferences = slices.Clone(c.PastReferences)
	return &out
}

func notFound() error { return &domain.NotFoundError{Entity: "ad"} }

// Put stores a campaign as is (test setup).
func (a *Ads) Put(c domain.AdCampaign) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.Rows[c.ID] = clone(&c)
}

// Peek returns a copy of a stored campaign (test assertions).
func (a *Ads) Peek(id string) domain.AdCampaign {
	a.mu.Lock()
	defer a.mu.Unlock()
	if c, ok := a.Rows[id]; ok {
		return *clone(c)
	}
	return domain.AdCampaign{}
}

func (a *Ads) Insert(_ context.Context, c domain.AdCampaign) error {
	a.Put(c)
	return nil
}

func (a *Ads) Get(_ context.Context, id string) (*domain.AdCampaign, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	c, ok := a.Rows[id]
	if !ok {
		return nil, notFound()
	}
	return clone(c), nil
}

func (a *Ads) byRef(ref string) *domain.AdCampaign {
	for _, c := range a.Rows {
		if ref != "" && (c.Reference == ref || slices.Contains(c.PastReferences, ref)) {
			return c
		}
	}
	return nil
}

func (a *Ads) ByReference(_ context.Context, ref string) (*domain.AdCampaign, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if c := a.byRef(ref); c != nil {
		return clone(c), nil
	}
	return nil, notFound()
}

// sorted returns the matching rows newest first.
func (a *Ads) sorted(match func(*domain.AdCampaign) bool) []domain.AdCampaign {
	out := []domain.AdCampaign{}
	for _, c := range a.Rows {
		if match(c) {
			out = append(out, *clone(c))
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].CreatedAt != out[j].CreatedAt {
			return out[i].CreatedAt > out[j].CreatedAt
		}
		return out[i].ID < out[j].ID
	})
	return out
}

func (a *Ads) ByMember(_ context.Context, memberID string) ([]domain.AdCampaign, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.sorted(func(c *domain.AdCampaign) bool { return c.MemberID == memberID }), nil
}

func filterMatch(f domain.AdFilter, c *domain.AdCampaign) bool {
	return (f.Status == "" || c.Status == f.Status) &&
		(f.Political == nil || c.Political == *f.Political) &&
		(f.Placement == "" || c.Placement == f.Placement) &&
		(f.SponsorID == "" || c.SponsorID == f.SponsorID) &&
		(f.PaymentStatus == "" || c.PaymentStatus == f.PaymentStatus)
}

func page[T any](rows []T, p, per int) []T {
	if per <= 0 {
		return rows
	}
	p = max(p, 1)
	from := min((p-1)*per, len(rows))
	return rows[from:min(from+per, len(rows))]
}

func (a *Ads) List(_ context.Context, f domain.AdFilter) ([]domain.AdCampaign, int, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	rows := a.sorted(func(c *domain.AdCampaign) bool { return filterMatch(f, c) })
	return page(rows, f.Page, f.PerPage), len(rows), nil
}

func (a *Ads) StatusCounts(_ context.Context, political *bool, placement string) (map[string]int, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := map[string]int{}
	for _, s := range domain.AdStatuses {
		out[s] = 0
	}
	f := domain.AdFilter{Political: political, Placement: placement}
	for _, c := range a.Rows {
		if filterMatch(f, c) {
			out[c.Status]++
		}
	}
	return out, nil
}

// applySet applies the bson fields Transition callers use.
func applySet(c *domain.AdCampaign, set map[string]any) {
	for k, v := range set {
		switch k {
		case "refundOwed":
			c.RefundOwed, _ = v.(string)
		case "retainUntil":
			c.RetainUntil, _ = v.(string)
		case "rejectReason":
			c.RejectReason, _ = v.(string)
		case "removalReason":
			c.RemovalReason, _ = v.(string)
		case "approvalExpiresAt":
			c.ApprovalExpiresAt, _ = v.(string)
		case "sponsorLine":
			c.SponsorLine, _ = v.(string)
		case "creative":
			c.Creative, _ = v.(domain.AdCreative)
		case "pausedBy":
			c.PausedBy, _ = v.(string)
		default:
			panic("adsfake: unsupported Transition field " + k)
		}
	}
}

func (a *Ads) Transition(_ context.Context, id string, from []string, to string, change domain.AdStatusChange, set map[string]any) (bool, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	c, ok := a.Rows[id]
	if !ok || !slices.Contains(from, c.Status) {
		return false, nil
	}
	applySet(c, set)
	c.Status, c.UpdatedAt = to, change.At
	c.StatusHistory = append(c.StatusHistory, change)
	return true, nil
}

func (a *Ads) SetCheckout(_ context.Context, id, ref, email, at string) (bool, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	c, ok := a.Rows[id]
	if !ok || c.Status != domain.AdStatusApproved || c.PaymentStatus == domain.AdPaymentSuccess {
		return false, nil
	}
	if c.Reference != "" && !slices.Contains(c.PastReferences, c.Reference) {
		c.PastReferences = append(c.PastReferences, c.Reference)
	}
	c.Reference, c.PaymentStatus, c.Email, c.CheckoutAt, c.UpdatedAt, c.FailureReason = ref, domain.AdPaymentPending, email, at, at, ""
	return true, nil
}

func (a *Ads) MarkPaid(_ context.Context, ref, at string, simulated bool, next string) (bool, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	c := a.byRef(ref)
	if c == nil || c.Status != domain.AdStatusApproved || c.PaymentStatus == domain.AdPaymentSuccess {
		return false, nil
	}
	if today := at[:10]; next == domain.AdStatusActive && c.StartDate < today {
		c.StartDate = today
	}
	c.StatusHistory = append(c.StatusHistory, domain.AdStatusChange{From: c.Status, To: next, At: at, ActorName: domain.AdActorSystem, Reason: "Payment confirmed."})
	payWith(c, ref)
	c.Status, c.PaymentStatus, c.PaidAt, c.Simulated, c.UpdatedAt, c.FailureReason = next, domain.AdPaymentSuccess, at, simulated, at, ""
	a.MarkPaidWins++
	return true, nil
}

// payWith makes ref the reference and keeps every other checkout reference
// in PastReferences (the Mongo pipeline's $setUnion/$setDifference).
func payWith(c *domain.AdCampaign, ref string) {
	refs := append(slices.Clone(c.PastReferences), c.Reference)
	c.PastReferences = nil
	for _, r := range refs {
		if r != "" && r != ref && !slices.Contains(c.PastReferences, r) {
			c.PastReferences = append(c.PastReferences, r)
		}
	}
	c.Reference = ref
}

func (a *Ads) MarkPaidClosed(_ context.Context, ref, at string, simulated bool) (bool, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	c := a.byRef(ref)
	closed := []string{domain.AdStatusExpired, domain.AdStatusCancelled, domain.AdStatusRejected}
	if c == nil || !slices.Contains(closed, c.Status) || c.PaymentStatus == domain.AdPaymentSuccess {
		return false, nil
	}
	payWith(c, ref)
	c.PaymentStatus, c.PaidAt, c.Simulated, c.RefundOwed, c.UpdatedAt, c.FailureReason = domain.AdPaymentSuccess, at, simulated, domain.AdRefundPaidAfterClose, at, ""
	return true, nil
}

func (a *Ads) MarkPaymentFailed(_ context.Context, ref, reason string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, c := range a.Rows {
		if c.Reference == ref && c.PaymentStatus != domain.AdPaymentSuccess {
			c.PaymentStatus, c.FailureReason = domain.AdPaymentFailed, reason
		}
	}
	return nil
}

func (a *Ads) AddApproval(_ context.Context, id string, ap domain.AdApproval) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	c, ok := a.Rows[id]
	if !ok {
		return notFound()
	}
	if slices.ContainsFunc(c.Approvals, func(x domain.AdApproval) bool { return x.StaffID == ap.StaffID }) {
		return domain.ErrAdApprovalExists
	}
	if c.Status != domain.AdStatusPendingReview {
		return domain.ErrAdStateChanged
	}
	c.Approvals = append(c.Approvals, ap)
	return nil
}

func (a *Ads) IncrDelivered(_ context.Context, id, at string) (bool, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	c, ok := a.Rows[id]
	if !ok || c.Status != domain.AdStatusActive || c.Delivered >= c.BookedImpressions {
		return false, nil
	}
	c.Delivered++
	c.LastImpressionAt = at
	if c.FirstImpressionAt == "" || at < c.FirstImpressionAt {
		c.FirstImpressionAt = at
	}
	return true, nil
}

func (a *Ads) IncrClicks(_ context.Context, id string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if c, ok := a.Rows[id]; ok {
		c.Clicks++
	}
	return nil
}

func hasRefund(c *domain.AdCampaign, id string) bool {
	return slices.ContainsFunc(c.Refunds, func(r domain.AdRefund) bool { return r.ID == id })
}

// refundFits is the Mongo refundFilter: no refund with r's id, and a refund
// of the campaign's own payment keeps the committed total within the price.
func refundFits(c *domain.AdCampaign, r domain.AdRefund) bool {
	if hasRefund(c, r.ID) {
		return false
	}
	return r.DuplicateCharge() || c.RefundCommittedPesewas()+r.AmountPesewas <= c.Price.TotalPesewas
}

func (a *Ads) PushRefund(_ context.Context, id string, r domain.AdRefund) (bool, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	c, ok := a.Rows[id]
	if !ok || !refundFits(c, r) {
		return false, nil
	}
	c.Refunds = append(c.Refunds, r)
	return true, nil
}

func (a *Ads) SettleOwedRefund(_ context.Context, id string, r domain.AdRefund) (bool, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	c, ok := a.Rows[id]
	if !ok || c.RefundOwed != r.Reason || !refundFits(c, r) {
		return false, nil
	}
	c.Refunds = append(c.Refunds, r)
	c.RefundOwed = ""
	return true, nil
}

func (a *Ads) ClearRefundOwed(_ context.Context, id, reason string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if c, ok := a.Rows[id]; ok && c.RefundOwed == reason {
		c.RefundOwed = ""
	}
	return nil
}

func (a *Ads) UpdateRefund(_ context.Context, id, refundID string, status, paystackRefundID, at string, processed int64) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	c, ok := a.Rows[id]
	if !ok {
		return nil
	}
	for i := range c.Refunds {
		r := &c.Refunds[i]
		if r.ID != refundID || r.Status == domain.AdRefundProcessed {
			continue
		}
		r.Status, r.UpdatedAt = status, at
		if paystackRefundID != "" {
			r.PaystackRefundID = paystackRefundID
		}
		if status == domain.AdRefundProcessed {
			c.RefundedPesewas += processed
		}
	}
	return nil
}

func (a *Ads) Serving(_ context.Context, placement, today string) ([]domain.AdCampaign, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.sorted(func(c *domain.AdCampaign) bool {
		return c.Status == domain.AdStatusActive && c.Placement == placement && c.StartDate <= today && today <= c.EndDate && c.Delivered < c.BookedImpressions
	}), nil
}

func (a *Ads) ResolveRefund(_ context.Context, id, refundID, status, note, at string, processed int64) (bool, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	c, ok := a.Rows[id]
	if !ok {
		return false, nil
	}
	for i := range c.Refunds {
		r := &c.Refunds[i]
		if r.ID != refundID || r.Status != domain.AdRefundManualCheck {
			continue
		}
		r.Status, r.Note, r.UpdatedAt = status, note, at
		if status == domain.AdRefundProcessed {
			c.RefundedPesewas += processed
		}
		return true, nil
	}
	return false, nil
}

func (a *Ads) Overlapping(_ context.Context, placement, from, to string) ([]domain.AdCampaign, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	now := a.Now()
	return a.sorted(func(c *domain.AdCampaign) bool {
		if c.Placement != placement || c.StartDate > to || c.EndDate < from {
			return false
		}
		switch c.Status {
		case domain.AdStatusScheduled, domain.AdStatusActive, domain.AdStatusPaused:
			return true
		case domain.AdStatusApproved:
			return c.ApprovalHeld(now)
		}
		return false
	}), nil
}

func (a *Ads) PendingBetween(_ context.Context, from, to string, limit int) ([]domain.AdCampaign, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	rows := a.sorted(func(c *domain.AdCampaign) bool {
		return c.PaymentStatus == domain.AdPaymentPending && (from == "" || c.CheckoutAt >= from) && c.CheckoutAt < to
	})
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].CheckoutAt < rows[j].CheckoutAt })
	return rows[:min(limit, len(rows))], nil
}

func (a *Ads) UnpaidCheckoutsBetween(_ context.Context, from, to string, limit int) ([]domain.AdCampaign, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	rows := a.sorted(func(c *domain.AdCampaign) bool {
		unpaid := c.PaymentStatus == domain.AdPaymentPending || c.PaymentStatus == domain.AdPaymentFailed
		return unpaid && c.CheckoutAt != "" && (from == "" || c.CheckoutAt >= from) && c.CheckoutAt < to
	})
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].CheckoutAt < rows[j].CheckoutAt })
	return rows[:min(limit, len(rows))], nil
}

func (a *Ads) ExpirePending(_ context.Context, ref, reason, at string) (bool, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, c := range a.Rows {
		if c.Reference == ref && c.PaymentStatus == domain.AdPaymentPending {
			c.PaymentStatus, c.FailureReason, c.UpdatedAt = domain.AdPaymentFailed, reason, at
			return true, nil
		}
	}
	return false, nil
}

var live = []string{domain.AdStatusApproved, domain.AdStatusScheduled, domain.AdStatusActive, domain.AdStatusPaused}

func (a *Ads) DueForScheduler(_ context.Context, now string) ([]domain.AdCampaign, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	since := now
	if t, err := time.Parse(time.RFC3339, now); err == nil {
		since = t.Add(-30 * 24 * time.Hour).UTC().Format(time.RFC3339)
	}
	return a.sorted(func(c *domain.AdCampaign) bool {
		return slices.Contains(live, c.Status) || c.RefundOwed != "" ||
			slices.ContainsFunc(c.Refunds, func(r domain.AdRefund) bool {
				polled := r.Status == domain.AdRefundManualCheck && r.PaystackRefundID != "" && r.CreatedAt >= since
				return r.Status == domain.AdRefundRequesting || r.Status == domain.AdRefundPending || polled
			})
	}), nil
}

func (a *Ads) CountLiveForElection(_ context.Context, electionID string) (int, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	n := 0
	for _, c := range a.Rows {
		if c.ElectionID == electionID && slices.Contains(live, c.Status) {
			n++
		}
	}
	return n, nil
}

func (a *Ads) Library(_ context.Context, f domain.AdLibraryFilter) ([]domain.AdCampaign, int, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	q := strings.ToLower(strings.TrimSpace(f.Query))
	rows := a.sorted(func(c *domain.AdCampaign) bool {
		if q != "" && !strings.Contains(strings.ToLower(c.SponsorLine), q) {
			return false
		}
		if f.Tab == domain.AdLibraryRunning {
			return c.Status == domain.AdStatusActive
		}
		booked := slices.ContainsFunc(c.StatusHistory, func(h domain.AdStatusChange) bool {
			return h.To == domain.AdStatusScheduled || h.To == domain.AdStatusActive
		})
		return c.Political && booked && (c.RetainUntil == "" || c.RetainUntil > f.Now)
	})
	return page(rows, f.Page, f.PerPage), len(rows), nil
}

func (a *Ads) AnonymiseMember(_ context.Context, memberID string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, c := range a.Rows {
		if c.MemberID == memberID {
			c.MemberID, c.Email = "", ""
		}
	}
	return nil
}

func (a *Ads) EnsureIndexes(context.Context) error { return nil }

// Sponsors is an in-memory domain.AdSponsorRepository.
type Sponsors struct {
	mu   sync.Mutex
	Rows map[string]domain.AdSponsor
}

// NewSponsors returns an empty repository.
func NewSponsors() *Sponsors { return &Sponsors{Rows: map[string]domain.AdSponsor{}} }

func (s *Sponsors) Insert(_ context.Context, sp domain.AdSponsor) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Rows[sp.ID] = sp
	return nil
}

func (s *Sponsors) Get(_ context.Context, id string) (*domain.AdSponsor, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sp, ok := s.Rows[id]
	if !ok {
		return nil, &domain.NotFoundError{Entity: "sponsor"}
	}
	return &sp, nil
}

func (s *Sponsors) ByMember(_ context.Context, memberID string) ([]domain.AdSponsor, error) {
	return s.list(func(sp domain.AdSponsor) bool { return sp.MemberID == memberID }), nil
}

func (s *Sponsors) list(match func(domain.AdSponsor) bool) []domain.AdSponsor {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := []domain.AdSponsor{}
	for _, sp := range s.Rows {
		if match(sp) {
			out = append(out, sp)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func (s *Sponsors) Update(_ context.Context, sp domain.AdSponsor, from []string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cur, ok := s.Rows[sp.ID]
	if !ok || !slices.Contains(from, cur.Status) {
		return false, nil
	}
	s.Rows[sp.ID] = sp
	return true, nil
}

func (s *Sponsors) SetStatus(_ context.Context, id string, from []string, status, note, staffName, at string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sp, ok := s.Rows[id]
	if !ok || !slices.Contains(from, sp.Status) {
		return false, nil
	}
	sp.Status, sp.ReviewNote, sp.UpdatedAt = status, note, at
	if status == domain.AdSponsorVerified {
		sp.VerifiedByName, sp.VerifiedAt = staffName, at
	}
	s.Rows[id] = sp
	return true, nil
}

func (s *Sponsors) List(_ context.Context, f domain.AdSponsorFilter) ([]domain.AdSponsor, error) {
	return s.list(func(sp domain.AdSponsor) bool {
		return (f.Status == "" || sp.Status == f.Status) && (f.Kind == "" || sp.Kind == f.Kind)
	}), nil
}

func (s *Sponsors) AnonymiseMember(_ context.Context, memberID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, sp := range s.Rows {
		if sp.MemberID == memberID {
			sp.MemberID, sp.Phone, sp.Email = "", "", ""
			s.Rows[id] = sp
		}
	}
	return nil
}

func (s *Sponsors) EnsureIndexes(context.Context) error { return nil }

// Stats is an in-memory domain.AdStatsReader.
type Stats struct {
	Campaign  map[string][]domain.AdCampaignDay
	Placement map[string][]domain.AdPlacementDay
}

func (s *Stats) CampaignDays(_ context.Context, id string) ([]domain.AdCampaignDay, error) {
	return s.Campaign[id], nil
}

func (s *Stats) PlacementDays(_ context.Context, placement, from, to string) ([]domain.AdPlacementDay, error) {
	out := []domain.AdPlacementDay{}
	for _, d := range s.Placement[placement] {
		if d.Day >= from && d.Day <= to {
			out = append(out, d)
		}
	}
	return out, nil
}
