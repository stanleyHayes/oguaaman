package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

type ArtistBookingRepo struct{ c *mongo.Collection }

func NewArtistBookingRepo(db *mongo.Database) *ArtistBookingRepo {
	return &ArtistBookingRepo{c: db.Collection(collArtistBookings)}
}

func (r *ArtistBookingRepo) Create(ctx context.Context, booking domain.ArtistBooking) (domain.ArtistBooking, error) {
	if _, err := r.c.InsertOne(ctx, booking); err != nil {
		return domain.ArtistBooking{}, err
	}
	return booking, nil
}

func (r *ArtistBookingRepo) ForArtistOwner(ctx context.Context, ownerID string) ([]domain.ArtistBooking, error) {
	cur, err := r.c.Find(ctx, bson.M{"artistOwnerId": ownerID}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	out := []domain.ArtistBooking{}
	return out, cur.All(ctx, &out)
}

func (r *ArtistBookingRepo) ByID(ctx context.Context, id string) (domain.ArtistBooking, error) {
	var booking domain.ArtistBooking
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&booking); err != nil {
		return domain.ArtistBooking{}, notFound("artist booking", err)
	}
	return booking, nil
}

func (r *ArtistBookingRepo) UpdateStatus(ctx context.Context, id, ownerID, status, artistNote, updatedAt string) (domain.ArtistBooking, error) {
	var booking domain.ArtistBooking
	err := r.c.FindOneAndUpdate(
		ctx,
		bson.M{"_id": id, "artistOwnerId": ownerID},
		bson.M{"$set": bson.M{"status": status, "artistNote": artistNote, "updatedAt": updatedAt}},
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&booking)
	if err != nil {
		return domain.ArtistBooking{}, notFound("artist booking", err)
	}
	return booking, nil
}
