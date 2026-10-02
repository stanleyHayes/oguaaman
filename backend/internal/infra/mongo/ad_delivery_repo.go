package mongo

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// ── paid advertising: delivery (spec §3.3, §3.9) ────────────────────────────
//
// ad_views holds each beacon's view id for 48 hours, so a replayed beacon is
// never billed twice. ad_campaign_days and ad_placement_days are daily
// counters the serving code flushes as $inc upserts every five minutes.

const (
	collAdViews = "ad_views"

	// adViewTTL keeps view ids long enough to outlive every token (15 min)
	// and click window (45 min) many times over.
	adViewTTL = 48 * time.Hour

	fAdViewAt         = "at"
	fAdCampaignID     = "campaignId"
	fAdViews          = "views"
	fAdUnbilled       = "unbilled"
	fAdClicks         = "clicks"
	fAdOpportunities  = "opportunities"
	adDeliveryKeySep  = "|"
	adOpSetOnInsert   = "$setOnInsert"
	adDeliveryMaxRows = 50_000 // a report window never needs more rows than this
)

// AdDeliveryRepo stores ad delivery (domain.AdDeliveryRepository). Its
// AdStatsReader half is the ads core's read-only AdStatsRepo.
type AdDeliveryRepo struct {
	*AdStatsRepo
	views *mongo.Collection
}

func NewAdDeliveryRepo(db *mongo.Database) *AdDeliveryRepo {
	return &AdDeliveryRepo{AdStatsRepo: NewAdStatsRepo(db), views: db.Collection(collAdViews)}
}

// EnsureIndexes creates the view TTL and the daily lookups.
func (r *AdDeliveryRepo) EnsureIndexes(ctx context.Context) error {
	if _, err := r.views.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: fAdViewAt, Value: 1}},
		Options: options.Index().SetExpireAfterSeconds(int32(adViewTTL / time.Second)),
	}); err != nil {
		return err
	}
	if _, err := r.campaignDays.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: fAdCampaignID, Value: 1}, {Key: fAdDay, Value: 1}}},
		{Keys: bson.D{{Key: fAdDay, Value: 1}}},
	}); err != nil {
		return err
	}
	_, err := r.placementDays.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: fAdPlacement, Value: 1}, {Key: fAdDay, Value: 1}}},
		{Keys: bson.D{{Key: fAdDay, Value: 1}}},
	})
	return err
}

// InsertView records a view id; a duplicate key means the beacon was seen.
func (r *AdDeliveryRepo) InsertView(ctx context.Context, viewID, campaignID string, at time.Time) (bool, error) {
	_, err := r.views.InsertOne(ctx, bson.M{fAdID: viewID, fAdCampaignID: campaignID, fAdViewAt: at.UTC()})
	if mongo.IsDuplicateKeyError(err) {
		return false, nil
	}
	return err == nil, err
}

// campaignDayModel is the upsert of one campaign-day increment.
func campaignDayModel(d domain.AdCampaignDayDelta) *mongo.UpdateOneModel {
	return mongo.NewUpdateOneModel().
		SetFilter(bson.M{fAdID: d.CampaignID + adDeliveryKeySep + d.Day}).
		SetUpdate(bson.M{
			adOpSetOnInsert: bson.M{fAdCampaignID: d.CampaignID, fAdDay: d.Day},
			adOpInc:         bson.M{fAdViews: d.Views, fAdUnbilled: d.Unbilled, fAdClicks: d.Clicks},
		}).
		SetUpsert(true)
}

// placementDayModel is the upsert of one placement-day increment.
func placementDayModel(d domain.AdPlacementDayDelta) *mongo.UpdateOneModel {
	return mongo.NewUpdateOneModel().
		SetFilter(bson.M{fAdID: d.Placement + adDeliveryKeySep + d.Day}).
		SetUpdate(bson.M{
			adOpSetOnInsert: bson.M{fAdPlacement: d.Placement, fAdDay: d.Day},
			adOpInc:         bson.M{fAdOpportunities: d.Opportunities},
		}).
		SetUpsert(true)
}

// AddCounts applies every non-empty increment, campaigns then placements.
func (r *AdDeliveryRepo) AddCounts(ctx context.Context, campaigns []domain.AdCampaignDayDelta, placements []domain.AdPlacementDayDelta) error {
	var cm []mongo.WriteModel
	for _, d := range campaigns {
		if d.Views != 0 || d.Unbilled != 0 || d.Clicks != 0 {
			cm = append(cm, campaignDayModel(d))
		}
	}
	var pm []mongo.WriteModel
	for _, d := range placements {
		if d.Opportunities != 0 {
			pm = append(pm, placementDayModel(d))
		}
	}
	unordered := options.BulkWrite().SetOrdered(false)
	if len(cm) > 0 {
		if _, err := r.campaignDays.BulkWrite(ctx, cm, unordered); err != nil {
			return err
		}
	}
	if len(pm) > 0 {
		if _, err := r.placementDays.BulkWrite(ctx, pm, unordered); err != nil {
			return err
		}
	}
	return nil
}

// ViewsOn reads the listed campaigns' stored views on one day.
func (r *AdDeliveryRepo) ViewsOn(ctx context.Context, day string, campaignIDs []string) (map[string]int64, error) {
	out := make(map[string]int64, len(campaignIDs))
	if len(campaignIDs) == 0 {
		return out, nil
	}
	ids := make(bson.A, 0, len(campaignIDs))
	for _, id := range campaignIDs {
		ids = append(ids, id+adDeliveryKeySep+day)
	}
	rows, err := findMemberDocs[domain.AdCampaignDay](ctx, r.campaignDays, bson.M{fAdID: bson.M{opIn: ids}})
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.CampaignID] = row.Views
	}
	return out, nil
}

// dayRange matches rows whose day lies in [from, to].
func dayRange(from, to string) bson.M {
	return bson.M{fAdDay: bson.M{adOpGte: from, adOpLte: to}}
}

func (r *AdDeliveryRepo) CampaignDaysBetween(ctx context.Context, from, to string) ([]domain.AdCampaignDay, error) {
	return findMemberDocs[domain.AdCampaignDay](ctx, r.campaignDays, dayRange(from, to),
		options.Find().SetSort(bson.D{{Key: fAdDay, Value: 1}}).SetLimit(adDeliveryMaxRows))
}

func (r *AdDeliveryRepo) PlacementDaysBetween(ctx context.Context, from, to string) ([]domain.AdPlacementDay, error) {
	return findMemberDocs[domain.AdPlacementDay](ctx, r.placementDays, dayRange(from, to),
		options.Find().SetSort(bson.D{{Key: fAdDay, Value: 1}}).SetLimit(adDeliveryMaxRows))
}

var _ domain.AdDeliveryRepository = (*AdDeliveryRepo)(nil)
