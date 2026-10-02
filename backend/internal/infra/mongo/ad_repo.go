package mongo

import (
	"context"
	"regexp"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// ── paid advertising: campaigns (spec §3.3) ─────────────────────────────────
//
// Every state change is one conditional write, so concurrent confirms,
// scheduler passes and staff actions settle exactly once.

const (
	collAdCampaigns = "ad_campaigns"
	collAdSponsors  = "ad_sponsors"

	// The serving code's daily delivery collections (read-only here).
	adStatsCampaignDaysColl  = "ad_campaign_days"
	adStatsPlacementDaysColl = "ad_placement_days"

	adNoun = "ad"

	fAdPaymentStatus   = "paymentStatus"
	fAdPlacement       = "placement"
	fAdPolitical       = "political"
	fAdSponsorID       = "sponsorId"
	fAdStartDate       = "startDate"
	fAdEndDate         = "endDate"
	fAdUpdatedAt       = "updatedAt"
	fAdRefunds         = "refunds"
	fAdRefundOwed      = "refundOwed"
	fAdPastReferences  = "pastReferences"
	fAdStatusHistory   = "statusHistory"
	fAdApprovalExpires = "approvalExpiresAt"
	fAdElectionID      = "electionId"
	fAdRetainUntil     = "retainUntil"
	fAdDelivered       = "delivered"
	fAdFailureReason   = "failureReason"
	fAdDay             = "day"
	adOpExpr           = "$expr"
	adOpPush           = "$push"
	adOpInc            = "$inc"
	adOpNe             = "$ne"
	adOpGte            = "$gte"
	adOpLte            = "$lte"
	adOpGt             = "$gt"
	adOpLt             = "$lt"
	fAdID              = "_id"
)

// liveAdStatuses hold inventory and depend on their election.
var liveAdStatuses = bson.A{domain.AdStatusApproved, domain.AdStatusScheduled, domain.AdStatusActive, domain.AdStatusPaused}

// AdRepo stores campaigns (domain.AdRepository).
type AdRepo struct{ c *mongo.Collection }

func NewAdRepo(db *mongo.Database) *AdRepo { return &AdRepo{c: db.Collection(collAdCampaigns)} }

// EnsureIndexes creates the campaign indexes of spec §3.3, plus the
// past-reference, checkout-time and election lookups this repo uses.
func (r *AdRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.c.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: fieldReference, Value: 1}}, Options: options.Index().SetUnique(true).SetSparse(true)},
		{Keys: bson.D{{Key: fieldStatus, Value: 1}, {Key: fAdPlacement, Value: 1}, {Key: fAdStartDate, Value: 1}, {Key: fAdEndDate, Value: 1}}},
		{Keys: bson.D{{Key: fMemberID, Value: 1}, {Key: fieldCreatedAt, Value: -1}}},
		{Keys: bson.D{{Key: fAdPolitical, Value: 1}, {Key: fieldStatus, Value: 1}, {Key: fAdStartDate, Value: -1}}},
		{Keys: bson.D{{Key: fAdPaymentStatus, Value: 1}, {Key: fieldCreatedAt, Value: 1}}},
		{Keys: bson.D{{Key: fAdPaymentStatus, Value: 1}, {Key: fAdCheckoutAt, Value: 1}}},
		{Keys: bson.D{{Key: fAdPastReferences, Value: 1}}},
		{Keys: bson.D{{Key: fAdElectionID, Value: 1}, {Key: fieldStatus, Value: 1}}},
	})
	return err
}

const fAdCheckoutAt = "checkoutAt"

func (r *AdRepo) Insert(ctx context.Context, c domain.AdCampaign) error {
	_, err := r.c.InsertOne(ctx, c)
	return err
}

func (r *AdRepo) Get(ctx context.Context, id string) (*domain.AdCampaign, error) {
	var c domain.AdCampaign
	if err := r.c.FindOne(ctx, bson.M{fAdID: id}).Decode(&c); err != nil {
		return nil, notFound(adNoun, err)
	}
	return &c, nil
}

// adByReference matches the campaign holding ref as its current or a past
// checkout reference.
func adByReference(ref string) bson.M {
	return bson.M{opOr: bson.A{bson.M{fieldReference: ref}, bson.M{fAdPastReferences: ref}}}
}

func (r *AdRepo) ByReference(ctx context.Context, ref string) (*domain.AdCampaign, error) {
	if ref == "" {
		return nil, &domain.NotFoundError{Entity: adNoun}
	}
	var c domain.AdCampaign
	if err := r.c.FindOne(ctx, adByReference(ref)).Decode(&c); err != nil {
		return nil, notFound(adNoun, err)
	}
	return &c, nil
}

func (r *AdRepo) ByMember(ctx context.Context, memberID string) ([]domain.AdCampaign, error) {
	return findMemberDocs[domain.AdCampaign](ctx, r.c, bson.M{fMemberID: memberID},
		options.Find().SetSort(bson.D{{Key: fieldCreatedAt, Value: -1}}))
}

// adListFilter builds the admin list filter.
func adListFilter(f domain.AdFilter) bson.M {
	q := bson.M{}
	if f.Status != "" {
		q[fieldStatus] = f.Status
	}
	if f.Political != nil {
		q[fAdPolitical] = *f.Political
	}
	if f.Placement != "" {
		q[fAdPlacement] = f.Placement
	}
	if f.SponsorID != "" {
		q[fAdSponsorID] = f.SponsorID
	}
	if f.PaymentStatus != "" {
		q[fAdPaymentStatus] = f.PaymentStatus
	}
	return q
}

// findPage runs a filtered, sorted, optionally paged find with its total.
func findPage[T any](ctx context.Context, c *mongo.Collection, filter bson.M, sort bson.D, page, perPage int) ([]T, int, error) {
	total, err := c.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	opts := options.Find().SetSort(sort)
	if perPage > 0 {
		page = max(page, 1)
		opts.SetSkip(int64((page - 1) * perPage)).SetLimit(int64(perPage))
	}
	rows, err := findMemberDocs[T](ctx, c, filter, opts)
	return rows, int(total), err
}

func (r *AdRepo) List(ctx context.Context, f domain.AdFilter) ([]domain.AdCampaign, int, error) {
	return findPage[domain.AdCampaign](ctx, r.c, adListFilter(f), bson.D{{Key: fieldCreatedAt, Value: -1}, {Key: fAdID, Value: 1}}, f.Page, f.PerPage)
}

func (r *AdRepo) StatusCounts(ctx context.Context, political *bool, placement string) (map[string]int, error) {
	match := adListFilter(domain.AdFilter{Political: political, Placement: placement})
	cur, err := r.c.Aggregate(ctx, mongo.Pipeline{
		{{Key: "$match", Value: match}},
		{{Key: "$group", Value: bson.D{{Key: fAdID, Value: "$" + fieldStatus}, {Key: "n", Value: bson.D{{Key: "$sum", Value: 1}}}}}},
	})
	if err != nil {
		return nil, err
	}
	var rows []struct {
		ID string `bson:"_id"`
		N  int    `bson:"n"`
	}
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	out := map[string]int{}
	for _, s := range domain.AdStatuses {
		out[s] = 0
	}
	for _, row := range rows {
		out[row.ID] = row.N
	}
	return out, nil
}

// adTransitionUpdate builds the update of a status change.
func adTransitionUpdate(to string, change domain.AdStatusChange, set map[string]any) bson.M {
	fields := bson.M{}
	for k, v := range set {
		fields[k] = v
	}
	fields[fieldStatus] = to
	fields[fAdUpdatedAt] = change.At
	return bson.M{opSet: fields, adOpPush: bson.M{fAdStatusHistory: change}}
}

func (r *AdRepo) Transition(ctx context.Context, id string, from []string, to string, change domain.AdStatusChange, set map[string]any) (bool, error) {
	filter := bson.M{fAdID: id, fieldStatus: bson.M{opIn: from}}
	return won(r.c.UpdateOne(ctx, filter, adTransitionUpdate(to, change, set)))
}

// SetCheckout records a new checkout; the previous reference (if any) moves
// to pastReferences. It reads the current reference and writes on condition
// that it is unchanged, so two checkouts can't lose one another's reference.
func (r *AdRepo) SetCheckout(ctx context.Context, id, ref, email, at string) (bool, error) {
	cur, err := r.Get(ctx, id)
	if err != nil {
		return false, err
	}
	filter := bson.M{fAdID: id, fieldStatus: domain.AdStatusApproved, fAdPaymentStatus: bson.M{adOpNe: domain.AdPaymentSuccess}}
	update := bson.M{
		opSet: bson.M{
			fieldReference: ref, fAdPaymentStatus: domain.AdPaymentPending, "email": email,
			fAdCheckoutAt: at, fAdUpdatedAt: at,
		},
		opUnset: bson.M{fAdFailureReason: ""},
	}
	if cur.Reference != "" {
		filter[fieldReference] = cur.Reference
		update["$addToSet"] = bson.M{fAdPastReferences: cur.Reference}
	} else {
		filter[fieldReference] = bson.M{opExists: false}
	}
	return won(r.c.UpdateOne(ctx, filter, update))
}

// paidReferences is the pipeline $set that makes ref the campaign's
// reference and keeps every other checkout reference (the current one
// included) in pastReferences, so a later charge on another checkout page
// still finds the campaign and is refunded as a duplicate.
func paidReferences(ref string) bson.D {
	lit := bson.D{{Key: "$literal", Value: ref}}
	return bson.D{
		{Key: fAdPastReferences, Value: bson.D{{Key: "$setDifference", Value: bson.A{
			bson.D{{Key: "$setUnion", Value: bson.A{
				bson.D{{Key: "$ifNull", Value: bson.A{"$" + fAdPastReferences, bson.A{}}}},
				bson.A{bson.D{{Key: "$ifNull", Value: bson.A{"$" + fieldReference, lit}}}},
			}}},
			bson.A{lit},
		}}}},
		{Key: fieldReference, Value: lit},
	}
}

// markPaidPipeline settles an approved campaign: next status, payment
// success, the paying reference, and (when it goes live now) a start date no
// earlier than today. A pipeline keeps the start-date clamp in the same write.
func markPaidPipeline(ref, at string, simulated bool, next string) mongo.Pipeline {
	today := at
	if t, err := time.Parse(time.RFC3339, at); err == nil {
		today = t.UTC().Format(time.DateOnly) // Accra is GMT
	}
	start := any("$" + fAdStartDate)
	if next == domain.AdStatusActive {
		start = bson.D{{Key: "$max", Value: bson.A{"$" + fAdStartDate, today}}}
	}
	change := domain.AdStatusChange{From: domain.AdStatusApproved, To: next, At: at, ActorName: domain.AdActorSystem, Reason: "Payment confirmed."}
	return mongo.Pipeline{
		{{Key: opSet, Value: paidReferences(ref)}},
		{{Key: opSet, Value: bson.D{
			{Key: fieldStatus, Value: next},
			{Key: fAdPaymentStatus, Value: domain.AdPaymentSuccess},
			{Key: "paidAt", Value: at},
			{Key: "simulated", Value: simulated},
			{Key: fAdUpdatedAt, Value: at},
			{Key: fAdStartDate, Value: start},
			{Key: fAdStatusHistory, Value: bson.D{{Key: "$concatArrays", Value: bson.A{
				bson.D{{Key: "$ifNull", Value: bson.A{"$" + fAdStatusHistory, bson.A{}}}},
				bson.A{bson.D{{Key: "$literal", Value: change}}},
			}}}},
		}}},
		{{Key: opUnset, Value: fAdFailureReason}},
	}
}

func (r *AdRepo) MarkPaid(ctx context.Context, ref, at string, simulated bool, next string) (bool, error) {
	filter := bson.M{
		opOr:             adByReference(ref)[opOr],
		fieldStatus:      domain.AdStatusApproved,
		fAdPaymentStatus: bson.M{adOpNe: domain.AdPaymentSuccess},
	}
	return won(r.c.UpdateOne(ctx, filter, markPaidPipeline(ref, at, simulated, next)))
}

func (r *AdRepo) MarkPaidClosed(ctx context.Context, ref, at string, simulated bool) (bool, error) {
	filter := bson.M{
		opOr:             adByReference(ref)[opOr],
		fieldStatus:      bson.M{opIn: bson.A{domain.AdStatusExpired, domain.AdStatusCancelled, domain.AdStatusRejected}},
		fAdPaymentStatus: bson.M{adOpNe: domain.AdPaymentSuccess},
	}
	return won(r.c.UpdateOne(ctx, filter, markPaidClosedPipeline(ref, at, simulated)))
}

// markPaidClosedPipeline records a payment on a closed campaign: payment
// success, the paying reference and a full refund owed.
func markPaidClosedPipeline(ref, at string, simulated bool) mongo.Pipeline {
	return mongo.Pipeline{
		{{Key: opSet, Value: paidReferences(ref)}},
		{{Key: opSet, Value: bson.D{
			{Key: fAdPaymentStatus, Value: domain.AdPaymentSuccess},
			{Key: "paidAt", Value: at},
			{Key: "simulated", Value: simulated},
			{Key: fAdRefundOwed, Value: domain.AdRefundPaidAfterClose},
			{Key: fAdUpdatedAt, Value: at},
		}}},
		{{Key: opUnset, Value: fAdFailureReason}},
	}
}

func (r *AdRepo) MarkPaymentFailed(ctx context.Context, ref, reason string) error {
	_, err := r.c.UpdateOne(ctx,
		bson.M{fieldReference: ref, fAdPaymentStatus: bson.M{adOpNe: domain.AdPaymentSuccess}},
		bson.M{opSet: bson.M{fAdPaymentStatus: domain.AdPaymentFailed, fAdFailureReason: reason}})
	return err
}

func (r *AdRepo) AddApproval(ctx context.Context, id string, a domain.AdApproval) error {
	ok, err := won(r.c.UpdateOne(ctx,
		bson.M{fAdID: id, fieldStatus: domain.AdStatusPendingReview, "approvals.staffId": bson.M{adOpNe: a.StaffID}},
		bson.M{adOpPush: bson.M{"approvals": a}, opSet: bson.M{fAdUpdatedAt: a.At}}))
	if err != nil || ok {
		return err
	}
	c, err := r.Get(ctx, id)
	if err != nil {
		return err
	}
	for _, prev := range c.Approvals {
		if prev.StaffID == a.StaffID {
			return domain.ErrAdApprovalExists
		}
	}
	return domain.ErrAdStateChanged
}

func (r *AdRepo) IncrDelivered(ctx context.Context, id, at string) (bool, error) {
	return won(r.c.UpdateOne(ctx,
		bson.M{fAdID: id, fieldStatus: domain.AdStatusActive, adOpExpr: bson.M{adOpLt: bson.A{"$" + fAdDelivered, "$bookedImpressions"}}},
		bson.M{adOpInc: bson.M{fAdDelivered: 1}, opSet: bson.M{"lastImpressionAt": at}, "$min": bson.M{"firstImpressionAt": at}}))
}

func (r *AdRepo) IncrClicks(ctx context.Context, id string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{fAdID: id}, bson.M{adOpInc: bson.M{"clicks": 1}})
	return err
}

// refundFilter matches campaign id when it has no refund with rf's id and,
// for a refund of the campaign's own payment, when the committed refunds
// (not failed, not duplicate charges) plus rf stay within the price total.
// Checking the sum in the write makes concurrent refunds safe.
func refundFilter(id string, rf domain.AdRefund) bson.M {
	filter := bson.M{fAdID: id, "refunds.id": bson.M{adOpNe: rf.ID}}
	if rf.DuplicateCharge() {
		return filter
	}
	committed := bson.D{{Key: "$sum", Value: bson.D{{Key: "$map", Value: bson.D{
		{Key: "input", Value: bson.D{{Key: "$filter", Value: bson.D{
			{Key: "input", Value: bson.D{{Key: "$ifNull", Value: bson.A{"$" + fAdRefunds, bson.A{}}}}},
			{Key: "cond", Value: bson.D{{Key: "$and", Value: bson.A{
				bson.D{{Key: adOpNe, Value: bson.A{"$$this.status", domain.AdRefundFailed}}},
				bson.D{{Key: adOpNe, Value: bson.A{"$$this.reason", domain.AdRefundDuplicateCharge}}},
			}}}},
		}}}},
		{Key: "in", Value: "$$this.amountPesewas"},
	}}}}}
	filter[adOpExpr] = bson.D{{Key: adOpLte, Value: bson.A{
		bson.D{{Key: "$add", Value: bson.A{committed, rf.AmountPesewas}}}, "$price.totalPesewas",
	}}}
	return filter
}

func (r *AdRepo) PushRefund(ctx context.Context, id string, rf domain.AdRefund) (bool, error) {
	return won(r.c.UpdateOne(ctx, refundFilter(id, rf),
		bson.M{adOpPush: bson.M{fAdRefunds: rf}, opSet: bson.M{fAdUpdatedAt: rf.CreatedAt}}))
}

func (r *AdRepo) SettleOwedRefund(ctx context.Context, id string, rf domain.AdRefund) (bool, error) {
	filter := refundFilter(id, rf)
	filter[fAdRefundOwed] = rf.Reason
	return won(r.c.UpdateOne(ctx, filter,
		bson.M{adOpPush: bson.M{fAdRefunds: rf}, opSet: bson.M{fAdUpdatedAt: rf.CreatedAt}, opUnset: bson.M{fAdRefundOwed: ""}}))
}

func (r *AdRepo) ClearRefundOwed(ctx context.Context, id, reason string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{fAdID: id, fAdRefundOwed: reason}, bson.M{opUnset: bson.M{fAdRefundOwed: ""}})
	return err
}

// refundUpdate builds UpdateRefund's filter and update. A processed refund
// is never changed again, and refundedPesewas grows only on the write that
// first marks it processed.
func refundUpdate(id, refundID, status, paystackRefundID, at string, processedAmount int64) (bson.M, bson.M) {
	filter := bson.M{fAdID: id, fAdRefunds: bson.M{"$elemMatch": bson.M{"id": refundID, fieldStatus: bson.M{adOpNe: domain.AdRefundProcessed}}}}
	set := bson.M{"refunds.$.status": status, "refunds.$.updatedAt": at, fAdUpdatedAt: at}
	if paystackRefundID != "" {
		set["refunds.$.paystackRefundId"] = paystackRefundID
	}
	update := bson.M{opSet: set}
	if status == domain.AdRefundProcessed && processedAmount > 0 {
		update[adOpInc] = bson.M{"refundedPesewas": processedAmount}
	}
	return filter, update
}

func (r *AdRepo) UpdateRefund(ctx context.Context, id, refundID string, status, paystackRefundID, at string, processedAmount int64) error {
	filter, update := refundUpdate(id, refundID, status, paystackRefundID, at, processedAmount)
	_, err := r.c.UpdateOne(ctx, filter, update)
	return err
}

// resolveRefundUpdate builds ResolveRefund's filter and update: only a
// refund still in manual_check changes.
func resolveRefundUpdate(id, refundID, status, note, at string, processedAmount int64) (bson.M, bson.M) {
	filter := bson.M{fAdID: id, fAdRefunds: bson.M{"$elemMatch": bson.M{"id": refundID, fieldStatus: domain.AdRefundManualCheck}}}
	update := bson.M{opSet: bson.M{"refunds.$.status": status, "refunds.$.note": note, "refunds.$.updatedAt": at, fAdUpdatedAt: at}}
	if status == domain.AdRefundProcessed && processedAmount > 0 {
		update[adOpInc] = bson.M{"refundedPesewas": processedAmount}
	}
	return filter, update
}

func (r *AdRepo) ResolveRefund(ctx context.Context, id, refundID, status, note, at string, processedAmount int64) (bool, error) {
	filter, update := resolveRefundUpdate(id, refundID, status, note, at, processedAmount)
	return won(r.c.UpdateOne(ctx, filter, update))
}

func (r *AdRepo) Serving(ctx context.Context, placement, today string) ([]domain.AdCampaign, error) {
	return findMemberDocs[domain.AdCampaign](ctx, r.c, bson.M{
		fieldStatus: domain.AdStatusActive, fAdPlacement: placement,
		fAdStartDate: bson.M{adOpLte: today}, fAdEndDate: bson.M{adOpGte: today},
		adOpExpr: bson.M{adOpLt: bson.A{"$" + fAdDelivered, "$bookedImpressions"}},
	})
}

// overlappingFilter matches campaigns holding inventory on [from, to]:
// scheduled, active or paused, or approved and still holding the approval
// (domain.AdCampaign.ApprovalHeld): paid, unexpired, or paying within the
// checkout grace.
func overlappingFilter(placement, from, to, now string) bson.M {
	graceFrom := now
	if t, err := time.Parse(time.RFC3339, now); err == nil {
		graceFrom = t.Add(-domain.AdCheckoutGrace).UTC().Format(time.RFC3339)
	}
	return bson.M{
		fAdPlacement: placement, fAdStartDate: bson.M{adOpLte: to}, fAdEndDate: bson.M{adOpGte: from},
		opOr: bson.A{
			bson.M{fieldStatus: bson.M{opIn: bson.A{domain.AdStatusScheduled, domain.AdStatusActive, domain.AdStatusPaused}}},
			bson.M{fieldStatus: domain.AdStatusApproved, fAdApprovalExpires: bson.M{adOpGte: now}},
			bson.M{fieldStatus: domain.AdStatusApproved, fAdPaymentStatus: domain.AdPaymentSuccess},
			bson.M{fieldStatus: domain.AdStatusApproved, fAdPaymentStatus: domain.AdPaymentPending, fAdCheckoutAt: bson.M{adOpGte: graceFrom}},
		},
	}
}

func (r *AdRepo) Overlapping(ctx context.Context, placement, from, to string) ([]domain.AdCampaign, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	return findMemberDocs[domain.AdCampaign](ctx, r.c, overlappingFilter(placement, from, to, now))
}

func (r *AdRepo) PendingBetween(ctx context.Context, from, to string, limit int) ([]domain.AdCampaign, error) {
	return pendingBetween[domain.AdCampaign](ctx, r.c, bson.M{fAdPaymentStatus: domain.AdPaymentPending}, fAdCheckoutAt, from, to, limit)
}

func (r *AdRepo) UnpaidCheckoutsBetween(ctx context.Context, from, to string, limit int) ([]domain.AdCampaign, error) {
	return pendingBetween[domain.AdCampaign](ctx, r.c,
		bson.M{fAdPaymentStatus: bson.M{opIn: bson.A{domain.AdPaymentPending, domain.AdPaymentFailed}}}, fAdCheckoutAt, from, to, limit)
}

func (r *AdRepo) ExpirePending(ctx context.Context, ref, reason, at string) (bool, error) {
	return won(r.c.UpdateOne(ctx,
		bson.M{fieldReference: ref, fAdPaymentStatus: domain.AdPaymentPending},
		bson.M{opSet: bson.M{fAdPaymentStatus: domain.AdPaymentFailed, fAdFailureReason: reason, fAdUpdatedAt: at}}))
}

// adManualCheckPollWindow is how long a manual_check refund that Paystack
// knows about keeps being polled (it may still be settled on Paystack's side).
const adManualCheckPollWindow = 30 * 24 * time.Hour

// dueFilter matches every campaign the scheduler may have work on.
func dueFilter(now string) bson.M {
	since := now
	if t, err := time.Parse(time.RFC3339, now); err == nil {
		since = t.Add(-adManualCheckPollWindow).UTC().Format(time.RFC3339)
	}
	return bson.M{opOr: bson.A{
		bson.M{fieldStatus: bson.M{opIn: liveAdStatuses}},
		bson.M{fAdRefundOwed: bson.M{opExists: true}},
		bson.M{"refunds.status": bson.M{opIn: bson.A{domain.AdRefundRequesting, domain.AdRefundPending}}},
		bson.M{fAdRefunds: bson.M{"$elemMatch": bson.M{
			fieldStatus: domain.AdRefundManualCheck, "paystackRefundId": bson.M{adOpGt: ""}, fieldCreatedAt: bson.M{adOpGte: since},
		}}},
	}}
}

func (r *AdRepo) DueForScheduler(ctx context.Context, now string) ([]domain.AdCampaign, error) {
	return findMemberDocs[domain.AdCampaign](ctx, r.c, dueFilter(now))
}

func (r *AdRepo) CountLiveForElection(ctx context.Context, electionID string) (int, error) {
	n, err := r.c.CountDocuments(ctx, bson.M{fAdElectionID: electionID, fieldStatus: bson.M{opIn: liveAdStatuses}})
	return int(n), err
}

// libraryFilter selects the public ad library: political campaigns that were
// ever booked (removed ones included) until retainUntil, or everything
// running now; optionally by sponsor name.
func libraryFilter(f domain.AdLibraryFilter) bson.M {
	q := bson.M{fieldStatus: domain.AdStatusActive}
	if f.Tab != domain.AdLibraryRunning {
		q = bson.M{
			fAdPolitical:             true,
			fAdStatusHistory + ".to": bson.M{opIn: bson.A{domain.AdStatusScheduled, domain.AdStatusActive}},
			opOr: bson.A{
				bson.M{fAdRetainUntil: bson.M{opExists: false}},
				bson.M{fAdRetainUntil: ""},
				bson.M{fAdRetainUntil: bson.M{adOpGt: f.Now}},
			},
		}
	}
	if s := strings.TrimSpace(f.Query); s != "" {
		if len(s) > 100 {
			s = s[:100]
		}
		q["sponsorLine"] = bson.M{"$regex": regexp.QuoteMeta(s), "$options": "i"}
	}
	return q
}

func (r *AdRepo) Library(ctx context.Context, f domain.AdLibraryFilter) ([]domain.AdCampaign, int, error) {
	if f.Now == "" {
		f.Now = time.Now().UTC().Format(time.RFC3339)
	}
	return findPage[domain.AdCampaign](ctx, r.c, libraryFilter(f), bson.D{{Key: fAdStartDate, Value: -1}, {Key: fAdID, Value: 1}}, f.Page, f.PerPage)
}

// AnonymiseMember clears the member link and receipt email from their
// campaigns; the records stay (tax invoices, political transparency).
func (r *AdRepo) AnonymiseMember(ctx context.Context, memberID string) error {
	if memberID == "" {
		return nil
	}
	_, err := r.c.UpdateMany(ctx, bson.M{fMemberID: memberID}, bson.M{opUnset: bson.M{fMemberID: "", "email": ""}})
	return err
}

// ── delivery statistics (read-only) ─────────────────────────────────────────

// AdStatsRepo reads the serving code's daily delivery collections
// (domain.AdStatsReader).
type AdStatsRepo struct {
	campaignDays  *mongo.Collection
	placementDays *mongo.Collection
}

func NewAdStatsRepo(db *mongo.Database) *AdStatsRepo {
	return &AdStatsRepo{campaignDays: db.Collection(adStatsCampaignDaysColl), placementDays: db.Collection(adStatsPlacementDaysColl)}
}

func (r *AdStatsRepo) CampaignDays(ctx context.Context, campaignID string) ([]domain.AdCampaignDay, error) {
	return findMemberDocs[domain.AdCampaignDay](ctx, r.campaignDays, bson.M{"campaignId": campaignID},
		options.Find().SetSort(bson.D{{Key: fAdDay, Value: 1}}))
}

func (r *AdStatsRepo) PlacementDays(ctx context.Context, placement, from, to string) ([]domain.AdPlacementDay, error) {
	return findMemberDocs[domain.AdPlacementDay](ctx, r.placementDays,
		bson.M{fAdPlacement: placement, fAdDay: bson.M{adOpGte: from, adOpLte: to}},
		options.Find().SetSort(bson.D{{Key: fAdDay, Value: 1}}))
}

// Compile-time checks that the repositories satisfy their domain interfaces.
var (
	_ domain.AdRepository        = (*AdRepo)(nil)
	_ domain.AdSponsorRepository = (*AdSponsorRepo)(nil)
	_ domain.AdStatsReader       = (*AdStatsRepo)(nil)
)
