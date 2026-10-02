package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// ── paid advertising: sponsors (spec §3.3) ──────────────────────────────────

const adSponsorNoun = "sponsor"

// AdSponsorRepo stores ad sponsors (domain.AdSponsorRepository).
type AdSponsorRepo struct{ c *mongo.Collection }

func NewAdSponsorRepo(db *mongo.Database) *AdSponsorRepo {
	return &AdSponsorRepo{c: db.Collection(collAdSponsors)}
}

// EnsureIndexes creates the sponsor indexes of spec §3.3.
func (r *AdSponsorRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.c.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: fMemberID, Value: 1}}},
		{Keys: bson.D{{Key: fieldStatus, Value: 1}, {Key: "kind", Value: 1}}},
	})
	return err
}

func (r *AdSponsorRepo) Insert(ctx context.Context, s domain.AdSponsor) error {
	_, err := r.c.InsertOne(ctx, s)
	return err
}

func (r *AdSponsorRepo) Get(ctx context.Context, id string) (*domain.AdSponsor, error) {
	var s domain.AdSponsor
	if err := r.c.FindOne(ctx, bson.M{fAdID: id}).Decode(&s); err != nil {
		return nil, notFound(adSponsorNoun, err)
	}
	return &s, nil
}

func (r *AdSponsorRepo) ByMember(ctx context.Context, memberID string) ([]domain.AdSponsor, error) {
	return findMemberDocs[domain.AdSponsor](ctx, r.c, bson.M{fMemberID: memberID},
		options.Find().SetSort(bson.D{{Key: fieldCreatedAt, Value: -1}}))
}

// Update replaces the sponsor while its status is one of from.
func (r *AdSponsorRepo) Update(ctx context.Context, s domain.AdSponsor, from []string) (bool, error) {
	res, err := r.c.ReplaceOne(ctx, bson.M{fAdID: s.ID, fieldStatus: bson.M{opIn: from}}, s)
	if err != nil {
		return false, err
	}
	return res.MatchedCount == 1, nil
}

// sponsorStatusUpdate builds SetStatus's update.
func sponsorStatusUpdate(status, note, staffName, at string) bson.M {
	set := bson.M{fieldStatus: status, "reviewNote": note, "updatedAt": at}
	if status == domain.AdSponsorVerified {
		set["verifiedByName"] = staffName
		set["verifiedAt"] = at
	}
	return bson.M{opSet: set}
}

func (r *AdSponsorRepo) SetStatus(ctx context.Context, id string, from []string, status, note, staffName, at string) (bool, error) {
	return won(r.c.UpdateOne(ctx, bson.M{fAdID: id, fieldStatus: bson.M{opIn: from}}, sponsorStatusUpdate(status, note, staffName, at)))
}

func (r *AdSponsorRepo) List(ctx context.Context, f domain.AdSponsorFilter) ([]domain.AdSponsor, error) {
	q := bson.M{}
	if f.Status != "" {
		q[fieldStatus] = f.Status
	}
	if f.Kind != "" {
		q["kind"] = f.Kind
	}
	return findMemberDocs[domain.AdSponsor](ctx, r.c, q, options.Find().SetSort(bson.D{{Key: fieldCreatedAt, Value: 1}}).SetLimit(500))
}

// AnonymiseMember clears the member link and contact details from their
// sponsors; the records stay (tax invoices, political transparency).
func (r *AdSponsorRepo) AnonymiseMember(ctx context.Context, memberID string) error {
	if memberID == "" {
		return nil
	}
	_, err := r.c.UpdateMany(ctx, bson.M{fMemberID: memberID}, bson.M{
		opSet:   bson.M{"phone": "", "email": ""},
		opUnset: bson.M{fMemberID: ""},
	})
	return err
}
