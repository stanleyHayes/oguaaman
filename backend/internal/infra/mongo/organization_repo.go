package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/domain"
)

type OrgRepo struct{ c *mongo.Collection }

func NewOrgRepo(db *mongo.Database) *OrgRepo { return &OrgRepo{db.Collection(collOrgs)} }

func (r *OrgRepo) All(ctx context.Context) ([]domain.Organization, error) {
	cur, err := r.c.Find(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	out := []domain.Organization{}
	return out, cur.All(ctx, &out)
}

func (r *OrgRepo) Create(ctx context.Context, org domain.Organization) error {
	_, err := r.c.InsertOne(ctx, org)
	return err
}

func (r *OrgRepo) ByKind(ctx context.Context, kind string) ([]domain.Organization, error) {
	cur, err := r.c.Find(ctx, bson.M{"kind": kind})
	if err != nil {
		return nil, err
	}
	out := []domain.Organization{}
	return out, cur.All(ctx, &out)
}

func (r *OrgRepo) BySlug(ctx context.Context, slug string) (*domain.Organization, error) {
	var o domain.Organization
	if err := r.c.FindOne(ctx, bson.M{"slug": slug}).Decode(&o); err != nil {
		return nil, notFound("organization", err)
	}
	return &o, nil
}

func (r *OrgRepo) ByID(ctx context.Context, id string) (*domain.Organization, error) {
	var o domain.Organization
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&o); err != nil {
		return nil, notFound("organization", err)
	}
	return &o, nil
}

func (r *OrgRepo) SetVerified(ctx context.Context, id string, verified bool, on string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"verified": verified, "verifiedOn": on}})
	return err
}

func (r *OrgRepo) UpdateProfile(ctx context.Context, id string, patch domain.OrgProfilePatch) error {
	contact := patch.Contact
	if contact == nil {
		contact = []domain.SocialLink{}
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{
		"summary":  patch.Summary,
		"history":  patch.History,
		"motto":    patch.Motto,
		"crestUrl": patch.CrestURL,
		"contact":  contact,
	}})
	return err
}

func (r *OrgRepo) SetOffices(ctx context.Context, id string, offices []domain.Office) error {
	if offices == nil {
		offices = []domain.Office{}
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"offices": offices}})
	return err
}

func (r *OrgRepo) SetGallery(ctx context.Context, id string, gallery []domain.MediaAsset) error {
	if gallery == nil {
		gallery = []domain.MediaAsset{}
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"gallery": gallery}})
	return err
}

func (r *OrgRepo) SetSections(ctx context.Context, id string, sections []domain.ProfileSection) error {
	if sections == nil {
		sections = []domain.ProfileSection{}
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"sections": sections}})
	return err
}
