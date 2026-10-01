package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

type TicketRepo struct{ c *mongo.Collection }

func NewTicketRepo(db *mongo.Database) *TicketRepo { return &TicketRepo{db.Collection(collTickets)} }

func (r *TicketRepo) Insert(ctx context.Context, t domain.Ticket) error {
	_, err := r.c.InsertOne(ctx, t)
	return err
}

func (r *TicketRepo) ByReference(ctx context.Context, reference string) (*domain.Ticket, error) {
	var t domain.Ticket
	if err := r.c.FindOne(ctx, bson.M{fieldReference: reference}).Decode(&t); err != nil {
		return nil, notFound("ticket", err)
	}
	return &t, nil
}

// Ticket refund bookkeeping fields.
const (
	fieldRefundDue     = "refundDue"
	fieldFailureReason = "failureReason"
	fieldCode          = "code"
)

// MarkSuccess issues a ticket in one conditional write; see
// domain.TicketRepository for the concurrency contract.
func (r *TicketRepo) MarkSuccess(ctx context.Context, reference, at, code string) (bool, error) {
	return won(r.c.UpdateOne(ctx, unsettled(reference), bson.M{
		"$set":   bson.M{fieldStatus: domain.PledgeSuccess, fieldConfirmedAt: at, fieldCode: code},
		"$unset": bson.M{fieldRefundDue: "", fieldFailureReason: ""},
	}))
}

// MarkFailed records a failed payment unless the ticket was already issued.
func (r *TicketRepo) MarkFailed(ctx context.Context, reference string) error {
	_, err := r.c.UpdateOne(ctx, unsettled(reference), bson.M{"$set": bson.M{fieldStatus: domain.PledgeFailed}})
	return err
}

// MarkRefundDue records a paid ticket that can't be issued, unless it already was.
func (r *TicketRepo) MarkRefundDue(ctx context.Context, reference, reason string) error {
	_, err := r.c.UpdateOne(ctx, unsettled(reference), bson.M{"$set": bson.M{
		fieldStatus: domain.PledgeFailed, fieldRefundDue: true, fieldFailureReason: reason,
	}})
	return err
}

// RevokeForRefund withdraws an issued ticket and its code, flagging the refund.
func (r *TicketRepo) RevokeForRefund(ctx context.Context, reference, reason string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{fieldReference: reference, fieldStatus: domain.PledgeSuccess}, bson.M{
		"$set":   bson.M{fieldStatus: domain.PledgeFailed, fieldRefundDue: true, fieldFailureReason: reason},
		"$unset": bson.M{fieldCode: "", fieldConfirmedAt: ""},
	})
	return err
}

func (r *TicketRepo) ByEvent(ctx context.Context, eventID string) ([]domain.Ticket, error) {
	cur, err := r.c.Find(ctx, bson.M{"eventId": eventID})
	if err != nil {
		return nil, err
	}
	out := []domain.Ticket{}
	return out, cur.All(ctx, &out)
}

func (r *TicketRepo) ByMember(ctx context.Context, memberID string) ([]domain.Ticket, error) {
	cur, err := r.c.Find(ctx, bson.M{"memberId": memberID})
	if err != nil {
		return nil, err
	}
	out := []domain.Ticket{}
	return out, cur.All(ctx, &out)
}

func (r *TicketRepo) ByCode(ctx context.Context, code string) (*domain.Ticket, error) {
	var t domain.Ticket
	if err := r.c.FindOne(ctx, bson.M{fieldCode: code}).Decode(&t); err != nil {
		return nil, notFound("ticket", err)
	}
	return &t, nil
}

func (r *TicketRepo) SetCheckedIn(ctx context.Context, code, at string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{fieldCode: code}, bson.M{"$set": bson.M{"checkedInAt": at}})
	return err
}

func (r *TicketRepo) ByEvents(ctx context.Context, eventIDs []string) ([]domain.Ticket, error) {
	if len(eventIDs) == 0 {
		return nil, nil
	}
	cur, err := r.c.Find(ctx, bson.M{"eventId": bson.M{"$in": eventIDs}})
	if err != nil {
		return nil, err
	}
	out := []domain.Ticket{}
	return out, cur.All(ctx, &out)
}

func (r *TicketRepo) All(ctx context.Context) ([]domain.Ticket, error) {
	cur, err := r.c.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	out := []domain.Ticket{}
	return out, cur.All(ctx, &out)
}
