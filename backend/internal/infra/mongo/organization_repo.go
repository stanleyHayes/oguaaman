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

// UpdateProfile applies a PARTIAL profile patch: only the fields the client
// sent are written, and the Clear* flags $unset the optional bool/number facts.
// A field the caller didn't send is never touched, so one client's save can't
// wipe the per-kind facts, the MoMo number or the verification links another
// client maintains.
func (r *OrgRepo) UpdateProfile(ctx context.Context, id string, patch domain.OrgProfilePatch) error {
	set, unset := orgProfileUpdate(patch)
	update := bson.M{}
	if len(set) > 0 {
		update["$set"] = set
	}
	if len(unset) > 0 {
		update["$unset"] = unset
	}
	if len(update) == 0 {
		return nil // nothing sent — nothing to write
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, update)
	return err
}

// orgProfileUpdate turns a partial patch into its $set / $unset documents.
func orgProfileUpdate(p domain.OrgProfilePatch) (set, unset bson.M) {
	set, unset = bson.M{}, bson.M{}
	for key, v := range map[string]*string{
		"summary": p.Summary, "history": p.History, "motto": p.Motto, "crestUrl": p.CrestURL,
		"gesCategory": p.GESCategory, "boardingType": p.BoardingType, "genderPolicy": p.GenderPolicy,
		"ghanaPostGPS": p.GhanaPostGPS, "momoNumber": p.MoMoNumber,
		"quarterTag": p.QuarterTag, "asafoTag": p.AsafoTag,
	} {
		if v != nil {
			set[key] = *v
		}
	}
	for key, v := range map[string]*[]domain.SocialLink{"contact": p.Contact, "verificationArtifacts": p.VerificationArtifacts} {
		if v != nil {
			links := *v
			if links == nil {
				links = []domain.SocialLink{}
			}
			set[key] = links
		}
	}
	optional := []struct {
		key   string
		value any
		clear bool
	}{
		{"nhisAccredited", derefBool(p.NHISAccredited), p.ClearNHISAccredited},
		{"latitude", derefFloat(p.Latitude), p.ClearLatitude},
		{"longitude", derefFloat(p.Longitude), p.ClearLongitude},
	}
	for _, o := range optional {
		switch {
		case o.clear:
			unset[o.key] = ""
		case o.value != nil:
			set[o.key] = o.value
		}
	}
	return set, unset
}

// derefBool / derefFloat return the pointed-to value, or an untyped nil so the
// caller can tell "not sent" apart from a zero value.
func derefBool(b *bool) any {
	if b == nil {
		return nil
	}
	return *b
}

func derefFloat(f *float64) any {
	if f == nil {
		return nil
	}
	return *f
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
