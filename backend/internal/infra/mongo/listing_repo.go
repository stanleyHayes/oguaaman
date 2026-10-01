package mongo

import (
	"context"
	"fmt"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// MongoDB operators used more than once in this file.
const (
	opExists = "$exists"
	opUnset  = "$unset"
)

type ListingRepo struct {
	c     *mongo.Collection
	views *mongo.Collection
	// viewsTTL makes sure the listing_views expiry index exists before the
	// first view is recorded by this process (see ensureViewsTTL).
	viewsTTL *sync.Once
}

// listingViewTTL is how long a daily unique-view record is kept. The monthly
// view KPIs only read the current month, so older records are dead weight —
// and without an expiry an anonymous caller could grow the collection forever.
const listingViewTTL = 30 * 24 * time.Hour

func NewListingRepo(db *mongo.Database) *ListingRepo {
	return &ListingRepo{
		c:        db.Collection(collListings),
		views:    db.Collection(collListingViews),
		viewsTTL: &sync.Once{},
	}
}

// ensureViewsTTL creates the TTL index that expires listing_views records
// listingViewTTL after they were written. Creating an existing index is a
// no-op, so every process may do it once; failure only means records linger,
// so it never fails the request that triggered it.
func (r *ListingRepo) ensureViewsTTL(ctx context.Context) {
	r.viewsTTL.Do(func() {
		ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()
		_, _ = r.views.Indexes().CreateOne(ctx, mongo.IndexModel{
			Keys:    bson.D{{Key: "at", Value: 1}},
			Options: options.Index().SetExpireAfterSeconds(int32(listingViewTTL / time.Second)),
		})
	})
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
				{"featuredUntil": bson.M{opExists: false}},
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
	unset := bson.M{}
	if status == domain.StatusApproved {
		// Approval publishes the listing and clears every "needs review"
		// marker. A reason typed while approving is not a rejection reason —
		// $set and $unset on the same path would also conflict in MongoDB.
		set["publishedAt"] = at
		unset["rejectionReason"] = ""
		unset["held"] = ""
		unset["screenFlags"] = ""
	} else if reason != "" {
		set["rejectionReason"] = reason
	}
	update := bson.M{"$set": set}
	if len(unset) > 0 {
		update[opUnset] = unset
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, update)
	return err
}

// HoldForReview withdraws a listing from public view pending curator review.
func (r *ListingRepo) HoldForReview(ctx context.Context, id, at string) error {
	res, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{
		"status": domain.StatusPending, "held": true, "submittedAt": at,
	}})
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return &domain.NotFoundError{Entity: "listing"}
	}
	return nil
}

// SetScreenFlags records the content screen's reasons on a listing.
func (r *ListingRepo) SetScreenFlags(ctx context.Context, id string, flags []string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"screenFlags": flags}})
	return err
}

// ClaimIncidentAlert atomically marks an incident alert as sent: the update
// only matches while details.<alert>At is unset, so exactly one caller wins.
func (r *ListingRepo) ClaimIncidentAlert(ctx context.Context, listingID, alert, at string) (bool, error) {
	var field string
	switch alert {
	case domain.IncidentAlertBroadcast:
		field = "details.broadcastAt"
	case domain.IncidentAlertRing:
		field = "details.ringAt"
	default:
		return false, fmt.Errorf("unknown incident alert %q", alert)
	}
	res, err := r.c.UpdateOne(ctx,
		bson.M{"_id": listingID, "type": domain.TypeIncident, field: bson.M{opExists: false}},
		bson.M{"$set": bson.M{field: at}},
	)
	if err != nil {
		return false, err
	}
	return res.ModifiedCount > 0, nil
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

// AddTribute appends a tribute while the memorial holds fewer than
// MaxTributesPerMemorial. The cap is part of the update filter (the element at
// index cap-1 must not exist), so concurrent posts cannot overshoot it.
func (r *ListingRepo) AddTribute(ctx context.Context, listingID string, t domain.Tribute) error {
	full := fmt.Sprintf("tributes.%d", domain.MaxTributesPerMemorial-1)
	res, err := r.c.UpdateOne(ctx,
		bson.M{"_id": listingID, full: bson.M{opExists: false}},
		bson.M{"$push": bson.M{"tributes": t}},
	)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		if n, cerr := r.c.CountDocuments(ctx, bson.M{"_id": listingID}); cerr == nil && n == 0 {
			return &domain.NotFoundError{Entity: "memorial"}
		}
		return &domain.ValidationError{Message: "This memorial has reached its limit of tributes."}
	}
	return nil
}

// SetTributeStatus changes one embedded tribute's visibility in place.
func (r *ListingRepo) SetTributeStatus(ctx context.Context, listingID, tributeID, status string) error {
	update := bson.M{"$set": bson.M{"tributes.$.status": status}}
	if status == "" {
		update = bson.M{opUnset: bson.M{"tributes.$.status": ""}}
	}
	res, err := r.c.UpdateOne(ctx, bson.M{"_id": listingID, "tributes.id": tributeID}, update)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return &domain.NotFoundError{Entity: "tribute"}
	}
	return nil
}

// GetByTributeID returns the memorial holding the tribute.
func (r *ListingRepo) GetByTributeID(ctx context.Context, tributeID string) (*domain.Listing, error) {
	var l domain.Listing
	if err := r.c.FindOne(ctx, bson.M{"tributes.id": tributeID}).Decode(&l); err != nil {
		return nil, notFound("tribute", err)
	}
	return &l, nil
}

// RemoveStoreItem pulls one product or service out of a storefront catalog.
func (r *ListingRepo) RemoveStoreItem(ctx context.Context, listingID, itemID string) error {
	res, err := r.c.UpdateOne(ctx, bson.M{"_id": listingID}, bson.M{"$pull": bson.M{
		"products": bson.M{"id": itemID},
		"services": bson.M{"id": itemID},
	}})
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return &domain.NotFoundError{Entity: "listing"}
	}
	return nil
}

func (r *ListingRepo) SetFeatured(ctx context.Context, id string, featured bool, until string) error {
	update := bson.M{"$set": bson.M{"featured": featured, "featuredUntil": until}}
	if !featured {
		// Taking a listing off the front pages also ends any paid placement
		// label, so a hidden listing is never shown as "Sponsored".
		update["$unset"] = bson.M{"promotedUntil": ""}
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, update)
	return err
}

// SetPromotedUntil records the end of a listing's paid placement (K18).
func (r *ListingRepo) SetPromotedUntil(ctx context.Context, id, until string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"promotedUntil": until}})
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

// SetPropertyAvailability flips a property's letting state (available | reserved
// | let) without touching its moderation status. A "let" property drops out of
// the public browse + search; the owner can flip it back to available anytime.
func (r *ListingRepo) SetPropertyAvailability(ctx context.Context, id, availability string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"details.availability": availability}})
	return err
}

// SetSubscribedUntil records a business's Supporter paid-until date (Phase 7)
// and its active plan slug (details.plan), which resolves storefront caps.
func (r *ListingRepo) SetSubscribedUntil(ctx context.Context, id, plan, until string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{
		"details.subscribedUntil": until,
		"details.plan":            plan,
	}})
	return err
}

// SetStorefront replaces a business listing's storefront in one $set: the
// profile sections, the photo/video gallery, and the clean handle (unset when
// blank so it never collides on the unique-ish lookup).
func (r *ListingRepo) SetStorefront(ctx context.Context, id, handle string, sections []domain.ProfileSection, photos, videos []domain.MediaAsset, products, services []domain.StoreItem) error {
	set := bson.M{"sections": sections, "photos": photos, "videos": videos, "products": products, "services": services}
	update := bson.M{"$set": set}
	if handle == "" {
		update[opUnset] = bson.M{"handle": ""}
	} else {
		set["handle"] = handle
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, update)
	return err
}

// GetByHandle returns a listing by its clean storefront handle.
func (r *ListingRepo) GetByHandle(ctx context.Context, handle string) (*domain.Listing, error) {
	var l domain.Listing
	if err := r.c.FindOne(ctx, bson.M{"handle": handle}).Decode(&l); err != nil {
		return nil, notFound("listing", err)
	}
	return &l, nil
}

// HandleTaken reports whether another listing already uses this handle.
func (r *ListingRepo) HandleTaken(ctx context.Context, handle, exceptID string) (bool, error) {
	n, err := r.c.CountDocuments(ctx, bson.M{"handle": handle, "_id": bson.M{"$ne": exceptID}})
	return n > 0, err
}

// MarkPostReviewed stamps the follow-up review of an auto-published post.
func (r *ListingRepo) MarkPostReviewed(ctx context.Context, id, reviewerID, at string) error {
	res, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{
		"details.postReviewedAt": at, "details.postReviewedBy": reviewerID,
	}})
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return &domain.NotFoundError{Entity: "listing"}
	}
	return nil
}

// SetKeeperID assigns a keeper (family administrator) to a memorial listing.
func (r *ListingRepo) SetKeeperID(ctx context.Context, id, keeperMemberID string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"details.keeperId": keeperMemberID}})
	return err
}

// ReassignOrgListings hands an institution's listings posted by a removed
// team member to another owner (see domain.ListingRepository).
func (r *ListingRepo) ReassignOrgListings(ctx context.Context, orgID, fromOwnerID, toOwnerID string) (int, error) {
	if orgID == "" || fromOwnerID == "" {
		return 0, nil
	}
	res, err := r.c.UpdateMany(ctx,
		bson.M{"postedByOrgId": orgID, "ownerId": fromOwnerID},
		bson.M{"$set": bson.M{"ownerId": toOwnerID}})
	if err != nil {
		return 0, err
	}
	return int(res.ModifiedCount), nil
}

// fieldPledgeCredits holds the references of the most recent contributions
// credited to a listing (never decoded into domain.Listing). Crediting checks
// and records the reference in the same single-document update, so a retried
// grant of one payment is never counted twice.
const fieldPledgeCredits = "pledgeCredits"

// pledgeCreditsKept bounds that list: a payment's grant is retried within
// Paystack's retry window, long before this many later contributions to the
// same listing push its reference out.
const pledgeCreditsKept = 500

func (r *ListingRepo) IncrementRaised(ctx context.Context, listingID, reference string, deltaPesewas int64) (bool, error) {
	return r.creditOnce(ctx, listingID, reference, bson.M{
		"details.raisedPesewas": deltaPesewas,
		"details.backers":       1,
	})
}

// IncrementDonations adds a confirmed artist donation's net to the artist
// listing's running total and bumps its donor count (Creator Monetization).
func (r *ListingRepo) IncrementDonations(ctx context.Context, listingID, reference string, deltaNetPesewas int64) (bool, error) {
	return r.creditOnce(ctx, listingID, reference, bson.M{
		"details.donationsNetPesewas": deltaNetPesewas,
		"details.donorCount":          1,
	})
}

// creditOnce applies inc to the listing unless reference was already
// credited, recording it in the same write. It reports whether it applied.
func (r *ListingRepo) creditOnce(ctx context.Context, listingID, reference string, inc bson.M) (bool, error) {
	res, err := r.c.UpdateOne(ctx,
		bson.M{"_id": listingID, fieldPledgeCredits: bson.M{"$ne": reference}},
		bson.M{
			"$inc":  inc,
			"$push": bson.M{fieldPledgeCredits: bson.M{"$each": bson.A{reference}, "$slice": -pledgeCreditsKept}},
		})
	if err != nil {
		return false, err
	}
	return res.ModifiedCount == 1, nil
}

// SetRating stores a listing's recomputed review aggregate.
func (r *ListingRepo) SetRating(ctx context.Context, listingID string, avg float64, count int) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": listingID}, bson.M{"$set": bson.M{
		"details.ratingAvg":   avg,
		"details.ratingCount": count,
	}})
	return err
}

// candleKind marks the daily candle records IncrementCandles keeps in
// listing_views. They share the collection (and its TTL) with page views but
// are not views.
const candleKind = "candle"

// IncrementCandles lights a candle for visitorKey and returns the count. The
// visitor's candles for the day are counted (n) on one "candle:"-prefixed
// record in listing_views, and a candle counts only while n is under perDay,
// so repeats past the allowance do not. Only the counter is projected back —
// the memorial document (tributes and all) is not.
func (r *ListingRepo) IncrementCandles(ctx context.Context, listingID, visitorKey string, perDay int) (int, error) {
	r.ensureViewsTTL(ctx)
	now := time.Now().UTC()
	day := now.Format("2006-01-02")
	key := "candle:" + listingID + ":" + day + ":" + visitorKey
	if _, err := r.views.UpdateOne(ctx,
		bson.M{"_id": key},
		bson.M{"$setOnInsert": bson.M{"kind": candleKind, "day": day, "at": now, "n": 0}},
		options.UpdateOne().SetUpsert(true),
	); err != nil {
		return 0, err
	}
	lit, err := won(r.views.UpdateOne(ctx,
		bson.M{"_id": key, "n": bson.M{"$lt": perDay}},
		bson.M{"$inc": bson.M{"n": 1}},
	))
	if err != nil {
		return 0, err
	}
	inc := 0
	if lit {
		inc = 1
	}
	var out struct {
		Details map[string]any `bson:"details"`
	}
	if err := r.c.FindOneAndUpdate(ctx,
		bson.M{"_id": listingID},
		bson.M{"$inc": bson.M{"details.candles": inc}},
		options.FindOneAndUpdate().SetReturnDocument(options.After).SetProjection(bson.M{"details.candles": 1}),
	).Decode(&out); err != nil {
		return 0, notFound("listing", err)
	}
	return toInt(out.Details["candles"]), nil
}

// RecordView upserts a view doc keyed by "listingId:day:visitorKey". On first
// insert (new unique daily view) it also increments the listing's viewCount.
// Each record carries an "at" timestamp that the TTL index expires.
func (r *ListingRepo) RecordView(ctx context.Context, listingID, visitorKey string) (bool, error) {
	r.ensureViewsTTL(ctx)
	now := time.Now().UTC()
	day := now.Format("2006-01-02")
	key := listingID + ":" + day + ":" + visitorKey
	res, err := r.views.UpdateOne(ctx,
		bson.M{"_id": key},
		bson.M{"$setOnInsert": bson.M{"_id": key, "listingId": listingID, "day": day, "at": now}},
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

// monthDayRange returns the inclusive start/end "YYYY-MM-DD" strings for the
// current UTC calendar month. Used for index-friendly view aggregation.
func monthDayRange() (string, string) {
	now := time.Now().UTC()
	start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	end := start.AddDate(0, 1, 0).Add(-time.Nanosecond)
	return start.Format(time.DateOnly), end.Format(time.DateOnly)
}

// ViewsThisMonth counts unique daily view records in the current calendar month
// whose listingId is among listingIDs.
func (r *ListingRepo) ViewsThisMonth(ctx context.Context, listingIDs []string) (int, error) {
	if len(listingIDs) == 0 {
		return 0, nil
	}
	start, end := monthDayRange()
	n, err := r.views.CountDocuments(ctx, bson.M{
		"listingId": bson.M{"$in": listingIDs},
		"day":       bson.M{"$gte": start, "$lte": end},
	})
	return int(n), err
}

// platformViewsFilter matches the page-view records of the days start..end.
// Candle records sit in the same collection with a day too; they are not views.
func platformViewsFilter(start, end string) bson.M {
	return bson.M{
		"day":  bson.M{"$gte": start, "$lte": end},
		"kind": bson.M{"$ne": candleKind},
	}
}

// PlatformViewsThisMonth counts all unique daily page-view records in the
// current calendar month across every listing.
func (r *ListingRepo) PlatformViewsThisMonth(ctx context.Context) (int, error) {
	start, end := monthDayRange()
	n, err := r.views.CountDocuments(ctx, platformViewsFilter(start, end))
	return int(n), err
}

// AvgApprovalHours computes the mean hours between submittedAt and reviewedAt
// for approved listings decided in the last 90 days.
func (r *ListingRepo) AvgApprovalHours(ctx context.Context) (float64, error) {
	cutoff := time.Now().UTC().Add(-90 * 24 * time.Hour).Format(time.RFC3339)
	cur, err := r.c.Find(ctx, bson.M{
		"status":      "approved",
		"reviewedAt":  bson.M{"$gte": cutoff},
		"submittedAt": bson.M{opExists: true, "$ne": ""},
	})
	if err != nil {
		return 0, err
	}
	defer func() { _ = cur.Close(ctx) }()

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
