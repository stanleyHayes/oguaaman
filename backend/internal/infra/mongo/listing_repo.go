package mongo

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

type ListingRepo struct {
	c     *mongo.Collection
	views *mongo.Collection
}

func NewListingRepo(db *mongo.Database) *ListingRepo {
	return &ListingRepo{
		c:     db.Collection(collListings),
		views: db.Collection(collListingViews),
	}
}

func (r *ListingRepo) Find(ctx context.Context, f domain.ListingFilter) ([]domain.Listing, error) {
	q := bson.M{}
	if f.Type != "" {
		q["type"] = f.Type
	}
	if f.Status != "" {
		q["status"] = f.Status
	}
	if f.Slug != "" {
		q["slug"] = f.Slug
	}
	if f.OwnerID != "" {
		q["ownerId"] = f.OwnerID
	}
	if f.PostedByOrgID != "" {
		q["postedByOrgId"] = f.PostedByOrgID
	}
	if f.SchoolID != "" {
		q["schoolIds"] = f.SchoolID // array-contains match
	}
	if f.FeaturedOnly {
		q["featured"] = true
		if f.Now != "" {
			// Exclude lapsed placements: keep those with no expiry or an expiry still in the future.
			q["$or"] = []bson.M{
				{"featuredUntil": ""},
				{"featuredUntil": bson.M{"$exists": false}},
				{"featuredUntil": bson.M{"$gte": f.Now}},
			}
		}
	}
	if f.TownID != "" {
		q["townId"] = f.TownID
	}
	if f.Tag != "" {
		q["tags"] = f.Tag
	}
	if f.Era != "" {
		q["details.era"] = f.Era
	}
	cur, err := r.c.Find(ctx, q)
	if err != nil {
		return nil, err
	}
	out := []domain.Listing{}
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (r *ListingRepo) GetBySlug(ctx context.Context, typ, slug string) (*domain.Listing, error) {
	var l domain.Listing
	if err := r.c.FindOne(ctx, bson.M{"type": typ, "slug": slug}).Decode(&l); err != nil {
		return nil, notFound("listing", err)
	}
	return &l, nil
}

func (r *ListingRepo) GetByID(ctx context.Context, id string) (*domain.Listing, error) {
	var l domain.Listing
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&l); err != nil {
		return nil, notFound("listing", err)
	}
	return &l, nil
}

func (r *ListingRepo) Insert(ctx context.Context, l domain.Listing) error {
	_, err := r.c.InsertOne(ctx, l)
	return err
}

func (r *ListingRepo) UpdateStatus(ctx context.Context, id, status, reviewedBy, reason, at string) error {
	set := bson.M{"status": status, "reviewedById": reviewedBy, "reviewedAt": at}
	if status == domain.StatusApproved {
		set["publishedAt"] = at
	}
	if reason != "" {
		set["rejectionReason"] = reason
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": set})
	return err
}

// OwnerUpdate applies a creator's content edit in one $set (see the interface
// doc for the status/submittedAt semantics — computed by the service).
func (r *ListingRepo) OwnerUpdate(ctx context.Context, id, title, coverImageURL string, details map[string]any, status, submittedAt string) error {
	set := bson.M{"title": title, "status": status, "details": details, "coverImageUrl": coverImageURL}
	if submittedAt != "" {
		set["submittedAt"] = submittedAt
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": set})
	return err
}

func (r *ListingRepo) AddTribute(ctx context.Context, listingID string, t domain.Tribute) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": listingID}, bson.M{"$push": bson.M{"tributes": t}})
	return err
}

func (r *ListingRepo) SetFeatured(ctx context.Context, id string, featured bool, until string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"featured": featured, "featuredUntil": until}})
	return err
}

// UpdateIncidentStatus advances an incident's operational lifecycle: sets the
// current status and appends the audit entry to the history array.
func (r *ListingRepo) UpdateIncidentStatus(ctx context.Context, id, status string, entry map[string]any) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{
		"$set":  bson.M{"details.incidentStatus": status},
		"$push": bson.M{"details.statusHistory": entry},
	})
	return err
}

// SetLostFoundStatus resolves a lost & found notice (open → reunited | closed).
func (r *ListingRepo) SetLostFoundStatus(ctx context.Context, id, status string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"details.lfStatus": status}})
	return err
}

// SetSubscribedUntil records a business's Supporter paid-until date (Phase 7).
func (r *ListingRepo) SetSubscribedUntil(ctx context.Context, id, until string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"details.subscribedUntil": until}})
	return err
}

// SetKeeperID assigns a keeper (family administrator) to a memorial listing.
func (r *ListingRepo) SetKeeperID(ctx context.Context, id, keeperMemberID string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"details.keeperId": keeperMemberID}})
	return err
}

func (r *ListingRepo) IncrementRaised(ctx context.Context, listingID string, deltaPesewas int64) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": listingID}, bson.M{"$inc": bson.M{
		"details.raisedPesewas": deltaPesewas,
		"details.backers":       1,
	}})
	return err
}

func (r *ListingRepo) IncrementCandles(ctx context.Context, listingID string) (int, error) {
	if _, err := r.c.UpdateOne(ctx, bson.M{"_id": listingID}, bson.M{"$inc": bson.M{"details.candles": 1}}); err != nil {
		return 0, err
	}
	var l domain.Listing
	if err := r.c.FindOne(ctx, bson.M{"_id": listingID}).Decode(&l); err != nil {
		return 0, notFound("listing", err)
	}
	return toInt(l.Details["candles"]), nil
}

// RecordView upserts a view doc keyed by "listingId:day:visitorKey". On first
// insert (new unique daily view) it also increments the listing's viewCount.
func (r *ListingRepo) RecordView(ctx context.Context, listingID, visitorKey string) (bool, error) {
	day := time.Now().UTC().Format("2006-01-02")
	key := listingID + ":" + day + ":" + visitorKey
	res, err := r.views.UpdateOne(ctx,
		bson.M{"_id": key},
		bson.M{"$setOnInsert": bson.M{"_id": key, "listingId": listingID, "day": day}},
		options.UpdateOne().SetUpsert(true),
	)
	if err != nil {
		return false, err
	}
	isNew := res.UpsertedCount > 0
	if isNew {
		_, err = r.c.UpdateOne(ctx, bson.M{"_id": listingID}, bson.M{"$inc": bson.M{"viewCount": 1}})
	}
	return isNew, err
}

// ViewsThisMonth counts unique daily view records whose day starts with the
// current YYYY-MM prefix and whose listingId is among listingIDs.
func (r *ListingRepo) ViewsThisMonth(ctx context.Context, listingIDs []string) (int, error) {
	if len(listingIDs) == 0 {
		return 0, nil
	}
	prefix := time.Now().UTC().Format("2006-01")
	cur, err := r.views.Find(ctx, bson.M{
		"listingId": bson.M{"$in": listingIDs},
		"day":       bson.M{"$regex": "^" + prefix},
	})
	if err != nil {
		return 0, err
	}
	var docs []bson.M
	if err := cur.All(ctx, &docs); err != nil {
		return 0, err
	}
	return len(docs), nil
}

// PlatformViewsThisMonth counts all unique daily view records in the current
// calendar month across every listing.
func (r *ListingRepo) PlatformViewsThisMonth(ctx context.Context) (int, error) {
	prefix := time.Now().UTC().Format("2006-01")
	n, err := r.views.CountDocuments(ctx, bson.M{"day": bson.M{"$regex": "^" + prefix}})
	return int(n), err
}

// AvgApprovalHours computes the mean hours between submittedAt and reviewedAt
// for approved listings decided in the last 90 days.
func (r *ListingRepo) AvgApprovalHours(ctx context.Context) (float64, error) {
	cutoff := time.Now().UTC().Add(-90 * 24 * time.Hour).Format(time.RFC3339)
	cur, err := r.c.Find(ctx, bson.M{
		"status":     "approved",
		"reviewedAt": bson.M{"$gte": cutoff},
		"submittedAt": bson.M{"$exists": true, "$ne": ""},
	})
	if err != nil {
		return 0, err
	}
	defer cur.Close(ctx)

	type row struct {
		SubmittedAt string `bson:"submittedAt"`
		ReviewedAt  string `bson:"reviewedAt"`
	}
	var total float64
	var n int
	for cur.Next(ctx) {
		var rd row
		if err := cur.Decode(&rd); err != nil {
			continue
		}
		sub, e1 := time.Parse(time.RFC3339, rd.SubmittedAt)
		rev, e2 := time.Parse(time.RFC3339, rd.ReviewedAt)
		if e1 != nil || e2 != nil {
			continue
		}
		diff := rev.Sub(sub).Hours()
		if diff >= 0 {
			total += diff
			n++
		}
	}
	if n == 0 {
		return 0, nil
	}
	return total / float64(n), nil
}
