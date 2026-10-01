package mongo

import (
	"context"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

type BusinessVerificationRepo struct{ c *mongo.Collection }

func NewBusinessVerificationRepo(db *mongo.Database) *BusinessVerificationRepo {
	return &BusinessVerificationRepo{db.Collection(collBusinessVerifications)}
}
func (r *BusinessVerificationRepo) ByListing(ctx context.Context, id string) (*domain.BusinessVerification, error) {
	var v domain.BusinessVerification
	err := r.c.FindOne(ctx, bson.M{"listingId": id}).Decode(&v)
	return &v, notFound("business verification", err)
}
func (r *BusinessVerificationRepo) Upsert(ctx context.Context, v domain.BusinessVerification) error {
	_, err := r.c.ReplaceOne(ctx, bson.M{"listingId": v.ListingID}, v, options.Replace().SetUpsert(true))
	return err
}
func (r *BusinessVerificationRepo) All(ctx context.Context) ([]domain.BusinessVerification, error) {
	cur, err := r.c.Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "updatedAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	out := []domain.BusinessVerification{}
	return out, cur.All(ctx, &out)
}
func (r *BusinessVerificationRepo) Review(ctx context.Context, listingID, status, note, reviewerID, reviewedAt, subaccount string) error {
	set := bson.M{"status": status, "reviewNote": note, "reviewedById": reviewerID, "reviewedAt": reviewedAt, "updatedAt": reviewedAt}
	if subaccount != "" {
		set["paystackSubaccount"] = subaccount
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"listingId": listingID}, bson.M{"$set": set})
	return err
}

func (r *BusinessVerificationRepo) SetPaystackSubaccount(ctx context.Context, listingID, subaccount, at string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"listingId": listingID}, bson.M{"$set": bson.M{"paystackSubaccount": subaccount, "updatedAt": at}})
	return err
}

type CommerceOrderRepo struct{ c *mongo.Collection }

func NewCommerceOrderRepo(db *mongo.Database) *CommerceOrderRepo {
	return &CommerceOrderRepo{db.Collection(collCommerceOrders)}
}
func (r *CommerceOrderRepo) Insert(ctx context.Context, o domain.CommerceOrder) error {
	_, err := r.c.InsertOne(ctx, o)
	return err
}
func (r *CommerceOrderRepo) ByReference(ctx context.Context, ref string) (*domain.CommerceOrder, error) {
	var o domain.CommerceOrder
	err := r.c.FindOne(ctx, bson.M{"reference": ref}).Decode(&o)
	return &o, notFound("order", err)
}
func (r *CommerceOrderRepo) find(ctx context.Context, filter bson.M) ([]domain.CommerceOrder, error) {
	cur, err := r.c.Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	out := []domain.CommerceOrder{}
	return out, cur.All(ctx, &out)
}
func (r *CommerceOrderRepo) ByBuyer(ctx context.Context, id string) ([]domain.CommerceOrder, error) {
	return r.find(ctx, bson.M{"buyerId": id})
}
func (r *CommerceOrderRepo) ByBusiness(ctx context.Context, id string) ([]domain.CommerceOrder, error) {
	return r.find(ctx, bson.M{"listingId": id})
}
func (r *CommerceOrderRepo) All(ctx context.Context) ([]domain.CommerceOrder, error) {
	return r.find(ctx, bson.M{})
}

// MarkPaid is a conditional pending→paid update; ModifiedCount tells the
// caller whether it won the transition. An order the reconciliation sweep
// closed as abandoned is also claimable: a payment that completes after the
// sweep must revive the order rather than be ignored (with split payments the
// seller's share has already been settled to them).
func (r *CommerceOrderRepo) MarkPaid(ctx context.Context, ref, at string, processingFee int64) (bool, error) {
	update := bson.M{
		"$set":   bson.M{"status": domain.OrderPaid, "paidAt": at, "updatedAt": at},
		"$unset": bson.M{"cancelReason": ""},
	}
	if processingFee > 0 {
		update["$set"].(bson.M)["processingFeePesewas"] = processingFee
		update["$inc"] = bson.M{"businessNetPesewas": -processingFee}
	}
	filter := bson.M{"reference": ref, "$or": bson.A{
		bson.M{"status": domain.OrderPending},
		bson.M{"status": domain.OrderCancelled, "cancelReason": domain.AbandonedPaymentReason},
	}}
	res, err := r.c.UpdateOne(ctx, filter, update)
	if err != nil {
		return false, err
	}
	return res.ModifiedCount == 1, nil
}
func (r *CommerceOrderRepo) SetStatus(ctx context.Context, id, listingID, status, at string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id, "listingId": listingID}, bson.M{"$set": bson.M{"status": status, "updatedAt": at}})
	return err
}

type BusinessCouponRepo struct{ c *mongo.Collection }

func NewBusinessCouponRepo(db *mongo.Database) *BusinessCouponRepo {
	return &BusinessCouponRepo{db.Collection(collBusinessCoupons)}
}
func (r *BusinessCouponRepo) Upsert(ctx context.Context, c domain.BusinessCoupon) error {
	_, err := r.c.ReplaceOne(ctx, bson.M{"_id": c.ID, "listingId": c.ListingID}, c, options.Replace().SetUpsert(true))
	return err
}
func (r *BusinessCouponRepo) ByCode(ctx context.Context, lid, code string) (*domain.BusinessCoupon, error) {
	var c domain.BusinessCoupon
	err := r.c.FindOne(ctx, bson.M{"listingId": bson.M{"$in": bson.A{lid, "*"}}, "code": code}, options.FindOne().SetSort(bson.D{{Key: "listingId", Value: -1}})).Decode(&c)
	return &c, notFound("coupon", err)
}
func (r *BusinessCouponRepo) All(ctx context.Context) ([]domain.BusinessCoupon, error) {
	cur, err := r.c.Find(ctx, bson.M{}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	out := []domain.BusinessCoupon{}
	return out, cur.All(ctx, &out)
}
func (r *BusinessCouponRepo) ByBusiness(ctx context.Context, lid string) ([]domain.BusinessCoupon, error) {
	cur, err := r.c.Find(ctx, bson.M{"listingId": lid}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	out := []domain.BusinessCoupon{}
	return out, cur.All(ctx, &out)
}

// Redeem counts a redemption for a paid order. It is unconditional on
// purpose: the buyer has already paid the discounted price, so the count
// must record it even if concurrent checkouts pushed it past the limit.
func (r *BusinessCouponRepo) Redeem(ctx context.Context, id string) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$inc": bson.M{"redemptions": 1}})
	return err
}
func (r *BusinessCouponRepo) Delete(ctx context.Context, id, lid string) error {
	_, err := r.c.DeleteOne(ctx, bson.M{"_id": id, "listingId": lid})
	return err
}

type AffiliateRepo struct {
	programmes  *mongo.Collection
	affiliates  *mongo.Collection
	conversions *mongo.Collection
}

func NewAffiliateRepo(db *mongo.Database) *AffiliateRepo {
	return &AffiliateRepo{db.Collection(collAffiliateProgrammes), db.Collection(collAffiliates), db.Collection(collAffiliateConversions)}
}

// SaveProgramme filters on {_id, listingId}: if the id already belongs to
// another listing the upsert collides on _id instead of replacing it.
func (r *AffiliateRepo) SaveProgramme(ctx context.Context, v domain.AffiliateProgramme) error {
	_, err := r.programmes.ReplaceOne(ctx, bson.M{"_id": v.ID, "listingId": v.ListingID}, v, options.Replace().SetUpsert(true))
	return err
}
func (r *AffiliateRepo) Programmes(ctx context.Context, lid string) ([]domain.AffiliateProgramme, error) {
	filter := bson.M{}
	if lid != "" {
		filter["listingId"] = lid
	}
	cur, err := r.programmes.Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	out := []domain.AffiliateProgramme{}
	return out, cur.All(ctx, &out)
}
func (r *AffiliateRepo) Programme(ctx context.Context, id string) (*domain.AffiliateProgramme, error) {
	var v domain.AffiliateProgramme
	err := r.programmes.FindOne(ctx, bson.M{"_id": id}).Decode(&v)
	return &v, notFound("affiliate programme", err)
}

// SaveAffiliate filters on {_id, listingId} for the same reason as
// SaveProgramme: one business can never overwrite another's affiliate.
func (r *AffiliateRepo) SaveAffiliate(ctx context.Context, v domain.Affiliate) error {
	_, err := r.affiliates.ReplaceOne(ctx, bson.M{"_id": v.ID, "listingId": v.ListingID}, v, options.Replace().SetUpsert(true))
	return err
}
func (r *AffiliateRepo) AffiliateByID(ctx context.Context, id string) (*domain.Affiliate, error) {
	var v domain.Affiliate
	err := r.affiliates.FindOne(ctx, bson.M{"_id": id}).Decode(&v)
	return &v, notFound("affiliate", err)
}

// Affiliates is always scoped to one listing so a caller can never list
// another business's (or Oguaa's) partners by omitting the programme.
func (r *AffiliateRepo) Affiliates(ctx context.Context, listingID, programmeID string) ([]domain.Affiliate, error) {
	filter := bson.M{"listingId": listingID}
	if programmeID != "" {
		filter["programmeId"] = programmeID
	}
	cur, err := r.affiliates.Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	out := []domain.Affiliate{}
	return out, cur.All(ctx, &out)
}
func (r *AffiliateRepo) AffiliateByCode(ctx context.Context, lid, code string) (*domain.Affiliate, error) {
	var v domain.Affiliate
	err := r.affiliates.FindOne(ctx, bson.M{"code": code, "active": true, "listingId": bson.M{"$in": bson.A{lid, "*"}}}, options.FindOne().SetSort(bson.D{{Key: "listingId", Value: -1}})).Decode(&v)
	return &v, notFound("affiliate", err)
}

// RecordConversion upserts the conversion of a paid order by its order
// reference. A legacy row reserved at checkout is upgraded in place; a row
// that has already moved on (payable, paid, void) is left alone.
func (r *AffiliateRepo) RecordConversion(ctx context.Context, v domain.AffiliateConversion) error {
	filter := bson.M{"orderReference": v.OrderReference, "status": bson.M{"$in": bson.A{domain.AffiliateReserved, v.Status}}}
	set := bson.M{"status": v.Status, "holdUntil": v.HoldUntil, "updatedAt": v.UpdatedAt}
	insert := bson.M{"_id": v.ID, "orderId": v.OrderID, "affiliateId": v.AffiliateID, "programmeId": v.ProgrammeID, "listingId": v.ListingID, "affiliateCode": v.AffiliateCode, "grossPesewas": v.GrossPesewas, "commissionPesewas": v.CommissionPesewas, "fundingSource": v.FundingSource, "createdAt": v.CreatedAt}
	_, err := r.conversions.UpdateOne(ctx, filter, bson.M{"$set": set, "$setOnInsert": insert}, options.UpdateOne().SetUpsert(true))
	if mongo.IsDuplicateKeyError(err) {
		return nil // the conversion already exists and has moved past "converted"
	}
	return err
}
func (r *AffiliateRepo) Conversions(ctx context.Context, lid string) ([]domain.AffiliateConversion, error) {
	filter := bson.M{}
	if lid != "" {
		filter["listingId"] = lid
	}
	cur, err := r.conversions.Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	out := []domain.AffiliateConversion{}
	return out, cur.All(ctx, &out)
}
func (r *AffiliateRepo) SetConversionStatus(ctx context.Context, id, status, at string) error {
	_, err := r.conversions.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"status": status, "updatedAt": at}})
	return err
}
