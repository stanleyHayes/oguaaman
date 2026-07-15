package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

type MemberRepo struct{ c *mongo.Collection }

func NewMemberRepo(db *mongo.Database) *MemberRepo { return &MemberRepo{db.Collection(collMembers)} }

func (r *MemberRepo) All(ctx context.Context) ([]domain.Member, error) {
	cur, err := r.c.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	out := []domain.Member{}
	return out, cur.All(ctx, &out)
}

func (r *MemberRepo) ByID(ctx context.Context, id string) (*domain.Member, error) {
	var m domain.Member
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&m); err != nil {
		return nil, notFound("member", err)
	}
	return &m, nil
}

func (r *MemberRepo) BySlug(ctx context.Context, slug string) (*domain.Member, error) {
	var m domain.Member
	if err := r.c.FindOne(ctx, bson.M{"slug": slug}).Decode(&m); err != nil {
		return nil, notFound("member", err)
	}
	return &m, nil
}

func (r *MemberRepo) ByIdentifier(ctx context.Context, identifier string) (*domain.Member, error) {
	var m domain.Member
	q := bson.M{"$or": []bson.M{{"phone": identifier}, {"email": identifier}}}
	if err := r.c.FindOne(ctx, q).Decode(&m); err != nil {
		return nil, notFound("member", err)
	}
	return &m, nil
}

func (r *MemberRepo) Insert(ctx context.Context, m domain.Member) error {
	_, err := r.c.InsertOne(ctx, m)
	return err
}

func (r *MemberRepo) SetPhoneVerified(ctx context.Context, id string, verified bool) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"phoneVerified": verified}})
	return err
}

func (r *MemberRepo) UpdateRole(ctx context.Context, id, role string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"role": role}})
	return err
}

func (r *MemberRepo) SetSuspended(ctx context.Context, id string, suspended bool) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"suspended": suspended}})
	return err
}

func (r *MemberRepo) SetBirthday(ctx context.Context, id, birthday string, broadcast bool) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"birthday": birthday, "broadcastBirthday": broadcast}})
	return err
}

func (r *MemberRepo) SetAffiliations(ctx context.Context, id, townID, asafoID string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"townId": townID, "asafoId": asafoID}})
	return err
}

func (r *MemberRepo) SetPhoto(ctx context.Context, id, photoURL string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"photoUrl": photoURL}})
	return err
}

func (r *MemberRepo) SetProfile(ctx context.Context, id, displayName, initials, bio string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"displayName": displayName, "initials": initials, "bio": bio}})
	return err
}

func (r *MemberRepo) SetPasswordHash(ctx context.Context, id, hash string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"passwordHash": hash}})
	return err
}

func (r *MemberRepo) SetDateOfBirth(ctx context.Context, id, dateOfBirth string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"dateOfBirth": dateOfBirth}})
	return err
}

func (r *MemberRepo) SetDiaspora(ctx context.Context, id string, d *domain.Diaspora) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"diaspora": d}})
	return err
}

// SetCreatorTypes records the member's creator kinds (Creator Platform plan §3).
func (r *MemberRepo) SetCreatorTypes(ctx context.Context, id string, types []string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"creatorTypes": types}})
	return err
}

func (r *MemberRepo) SetSchooling(ctx context.Context, id string, stints []domain.SchoolStint) error {
	if stints == nil {
		stints = []domain.SchoolStint{}
	}
	// Keep schoolIds in sync so existing "rep your school" reads still work.
	ids := make([]string, 0, len(stints))
	for _, s := range stints {
		ids = append(ids, s.SchoolID)
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"schooling": stints, "schoolIds": ids}})
	return err
}
