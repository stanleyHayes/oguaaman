package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// ── payment reconciliation (C5): pending work lists and expiry ───────────────

const fieldCreatedAt = "createdAt"

// timeWindow is a [from, to) range on an RFC3339 string field; from "" has
// no lower bound.
func timeWindow(from, to string) bson.M {
	w := bson.M{"$lt": to}
	if from != "" {
		w["$gte"] = from
	}
	return w
}

// pendingBetween lists the documents matching filter whose timeField is in
// [from, to), oldest first, at most limit.
func pendingBetween[T any](ctx context.Context, c *mongo.Collection, filter bson.M, timeField, from, to string, limit int) ([]T, error) {
	filter[timeField] = timeWindow(from, to)
	opts := options.Find().SetSort(bson.D{{Key: timeField, Value: 1}}).SetLimit(int64(limit))
	cur, err := c.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	out := []T{}
	return out, cur.All(ctx, &out)
}

// expirePending closes a record that is still pendingStatus with status and
// a reason in reasonField.
func expirePending(ctx context.Context, c *mongo.Collection, reference, pendingStatus, status, reasonField, reason, at string) (bool, error) {
	set := bson.M{fieldStatus: status, reasonField: reason}
	if at != "" {
		set["updatedAt"] = at
	}
	return won(c.UpdateOne(ctx, bson.M{fieldReference: reference, fieldStatus: pendingStatus}, bson.M{"$set": set}))
}

func (r *PledgeRepo) PendingBetween(ctx context.Context, from, to string, limit int) ([]domain.Pledge, error) {
	return pendingBetween[domain.Pledge](ctx, r.c, bson.M{fieldStatus: domain.PledgePending}, fieldCreatedAt, from, to, limit)
}

func (r *PledgeRepo) ExpirePending(ctx context.Context, reference, reason, _ string) (bool, error) {
	return expirePending(ctx, r.c, reference, domain.PledgePending, domain.PledgeFailed, fieldFailureReason, reason, "")
}

func (r *TicketRepo) PendingBetween(ctx context.Context, from, to string, limit int) ([]domain.Ticket, error) {
	return pendingBetween[domain.Ticket](ctx, r.c, bson.M{fieldStatus: domain.PledgePending}, fieldCreatedAt, from, to, limit)
}

func (r *TicketRepo) ExpirePending(ctx context.Context, reference, reason, _ string) (bool, error) {
	return expirePending(ctx, r.c, reference, domain.PledgePending, domain.PledgeFailed, fieldFailureReason, reason, "")
}

func (r *SubscriptionRepo) PendingBetween(ctx context.Context, from, to string, limit int) ([]domain.Subscription, error) {
	return pendingBetween[domain.Subscription](ctx, r.c, bson.M{fieldStatus: domain.PledgePending}, fieldCreatedAt, from, to, limit)
}

func (r *SubscriptionRepo) ExpirePending(ctx context.Context, reference, reason, _ string) (bool, error) {
	return expirePending(ctx, r.c, reference, domain.PledgePending, domain.PledgeFailed, fieldFailureReason, reason, "")
}

func (r *PromotionRepo) PendingBetween(ctx context.Context, from, to string, limit int) ([]domain.Promotion, error) {
	return pendingBetween[domain.Promotion](ctx, r.c, bson.M{fieldStatus: domain.PledgePending}, fieldCreatedAt, from, to, limit)
}

func (r *PromotionRepo) ExpirePending(ctx context.Context, reference, reason, _ string) (bool, error) {
	return expirePending(ctx, r.c, reference, domain.PledgePending, domain.PledgeFailed, fieldFailureReason, reason, "")
}

func (r *CommerceOrderRepo) PendingBetween(ctx context.Context, from, to string, limit int) ([]domain.CommerceOrder, error) {
	return pendingBetween[domain.CommerceOrder](ctx, r.c, bson.M{fieldStatus: domain.OrderPending}, fieldCreatedAt, from, to, limit)
}

func (r *CommerceOrderRepo) ExpirePending(ctx context.Context, reference, reason, at string) (bool, error) {
	return expirePending(ctx, r.c, reference, domain.OrderPending, domain.OrderCancelled, "cancelReason", reason, at)
}

func (r *AgentJobRepo) PendingCheckouts(ctx context.Context, from, to string, limit int) ([]domain.AgentJob, error) {
	filter := bson.M{fieldStatus: domain.JobStatusQuoted, "escrow.status": domain.EscrowPending, "reference": bson.M{"$ne": ""}}
	return pendingBetween[domain.AgentJob](ctx, r.c, filter, "updatedAt", from, to, limit)
}
