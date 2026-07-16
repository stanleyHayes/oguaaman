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
	if err := r.c.FindOne(ctx, bson.M{"reference": reference}).Decode(&t); err != nil {
		return nil, notFound("ticket", err)
	}
	return &t, nil
}

func (r *TicketRepo) UpdateStatus(ctx context.Context, reference, status, at string) error {
	set := bson.M{"status": status}
	if status == domain.PledgeSuccess {
		set["confirmedAt"] = at
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"reference": reference}, bson.M{"$set": set})
	return err
}

func (r *TicketRepo) SetCode(ctx context.Context, reference, code string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"reference": reference}, bson.M{"$set": bson.M{"code": code}})
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
	if err := r.c.FindOne(ctx, bson.M{"code": code}).Decode(&t); err != nil {
		return nil, notFound("ticket", err)
	}
	return &t, nil
}

func (r *TicketRepo) SetCheckedIn(ctx context.Context, code, at string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"code": code}, bson.M{"$set": bson.M{"checkedInAt": at}})
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
