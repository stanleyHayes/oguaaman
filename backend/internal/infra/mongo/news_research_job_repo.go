package mongo

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// ── news research jobs (spec §2.2, §2.3) ─────────────────────────────────────

const (
	collNewsResearchJobs = "news_research_jobs"

	fJobStatus        = "status"
	fJobNextAttemptAt = "nextAttemptAt"
	fJobLockedUntil   = "lockedUntil"
	fJobAttempts      = "attempts"
	fJobUpdatedAt     = "updatedAt"
	fJobCreatedAt     = "createdAt"
	fJobArticleID     = "articleId"
	fJobLeadURL       = "leadUrl"
	fJobExpireAt      = "expireAt"
	fJobDraft         = "draft"
	fJobReviewedBy    = "reviewedByName"
	fJobReviewedAt    = "reviewedAt"

	opInc = "$inc"

	// newsJobRetention keeps jobs for a year (a TTL index on expireAt).
	newsJobRetention = 365 * 24 * time.Hour
	maxNewsJobPage   = 100
)

// newsJobDoc is a job as stored: the domain row plus its TTL expiry.
type newsJobDoc struct {
	domain.NewsResearchJob `bson:",inline"`
	ExpireAt               time.Time `bson:"expireAt"`
}

// NewsResearchJobRepo implements domain.NewsResearchJobRepository.
type NewsResearchJobRepo struct{ c *mongo.Collection }

func NewNewsResearchJobRepo(db *mongo.Database) *NewsResearchJobRepo {
	return &NewsResearchJobRepo{c: db.Collection(collNewsResearchJobs)}
}

// EnsureIndexes creates the unique lead index, the queue, article and
// newest-first indexes, and the one-year TTL.
func (r *NewsResearchJobRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.c.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: fJobLeadURL, Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: fJobStatus, Value: 1}, {Key: fJobNextAttemptAt, Value: 1}}},
		{Keys: bson.D{{Key: fJobArticleID, Value: 1}}},
		{Keys: bson.D{{Key: fJobCreatedAt, Value: -1}}},
		{Keys: bson.D{{Key: fJobExpireAt, Value: 1}}, Options: options.Index().SetExpireAfterSeconds(0)},
	})
	return err
}

func (r *NewsResearchJobRepo) Insert(ctx context.Context, j domain.NewsResearchJob) error {
	_, err := r.c.InsertOne(ctx, newsJobDoc{NewsResearchJob: j, ExpireAt: time.Now().UTC().Add(newsJobRetention)})
	if mongo.IsDuplicateKeyError(err) {
		return domain.ErrNewsJobExists
	}
	return err
}

func (r *NewsResearchJobRepo) Get(ctx context.Context, id string) (*domain.NewsResearchJob, error) {
	var j domain.NewsResearchJob
	if err := r.c.FindOne(ctx, bson.M{"_id": id}).Decode(&j); err != nil {
		return nil, notFound("research job", err)
	}
	return &j, nil
}

func (r *NewsResearchJobRepo) ByArticle(ctx context.Context, articleID string) (*domain.NewsResearchJob, error) {
	var j domain.NewsResearchJob
	opts := options.FindOne().SetSort(bson.D{{Key: fJobCreatedAt, Value: -1}})
	if err := r.c.FindOne(ctx, bson.M{fJobArticleID: articleID}, opts).Decode(&j); err != nil {
		return nil, notFound("research job", err)
	}
	return &j, nil
}

func (r *NewsResearchJobRepo) List(ctx context.Context, f domain.NewsJobFilter) ([]domain.NewsResearchJob, int64, error) {
	filter := bson.M{}
	if f.Status != "" {
		filter[fJobStatus] = f.Status
	}
	total, err := r.c.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	limit := f.Limit
	if limit <= 0 || limit > maxNewsJobPage {
		limit = maxNewsJobPage
	}
	opts := options.Find().SetSort(bson.D{{Key: fJobCreatedAt, Value: -1}}).SetSkip(int64(max(f.Skip, 0))).SetLimit(int64(limit))
	cur, err := r.c.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, err
	}
	out := []domain.NewsResearchJob{}
	return out, total, cur.All(ctx, &out)
}

func (r *NewsResearchJobRepo) Claim(ctx context.Context, now, lockedUntil string) (*domain.NewsResearchJob, error) {
	filter := bson.M{fJobStatus: domain.NewsJobQueued, "$or": bson.A{
		bson.M{fJobNextAttemptAt: bson.M{"$exists": false}},
		bson.M{fJobNextAttemptAt: ""},
		bson.M{fJobNextAttemptAt: bson.M{"$lte": now}},
	}}
	update := bson.M{
		opSet: bson.M{fJobStatus: domain.NewsJobRunning, fJobLockedUntil: lockedUntil, fJobUpdatedAt: now},
		opInc: bson.M{fJobAttempts: 1},
	}
	opts := options.FindOneAndUpdate().SetSort(bson.D{{Key: fJobCreatedAt, Value: 1}}).SetReturnDocument(options.After)
	var j domain.NewsResearchJob
	err := r.c.FindOneAndUpdate(ctx, filter, update, opts).Decode(&j)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &j, nil
}

func (r *NewsResearchJobRepo) RequeueExpired(ctx context.Context, now string) (int64, error) {
	res, err := r.c.UpdateMany(ctx,
		bson.M{fJobStatus: domain.NewsJobRunning, fJobLockedUntil: bson.M{"$lt": now}},
		bson.M{opSet: bson.M{fJobStatus: domain.NewsJobQueued, fJobNextAttemptAt: now, fJobUpdatedAt: now}, opUnset: bson.M{fJobLockedUntil: ""}})
	if err != nil {
		return 0, err
	}
	return res.ModifiedCount, nil
}

func (r *NewsResearchJobRepo) Finish(ctx context.Context, id string, o domain.NewsJobOutcome) error {
	set := bson.M{
		fJobStatus: o.Status, fJobNextAttemptAt: o.NextAttemptAt, "lastError": o.LastError,
		"refusalCategory": o.RefusalCategory, "blockedReason": o.BlockedReason,
		"fallbackUsed": o.FallbackUsed, fJobUpdatedAt: o.UpdatedAt,
	}
	if o.Model != "" {
		set["model"] = o.Model
	}
	if o.Draft != nil {
		set[fJobDraft] = o.Draft
	}
	update := bson.M{opSet: set, opUnset: bson.M{fJobLockedUntil: ""}}
	if o.RefundAttempt {
		update[opInc] = bson.M{fJobAttempts: -1}
	}
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id, fJobStatus: domain.NewsJobRunning}, update)
	return err
}

func (r *NewsResearchJobRepo) AddCost(ctx context.Context, id string, claudeMicroUSD, imageMicroUSD int64) error {
	_, err := r.c.UpdateOne(ctx, bson.M{"_id": id}, bson.M{opInc: bson.M{"costMicroUsd": claudeMicroUSD, "imageMicroUsd": imageMicroUSD}})
	return err
}

func (r *NewsResearchJobRepo) SetCover(ctx context.Context, id string, c domain.NewsCoverDraft, updatedAt string) (bool, error) {
	res, err := r.c.UpdateOne(ctx, bson.M{"_id": id, fJobStatus: domain.NewsJobReady, fJobDraft: bson.M{"$ne": nil}},
		bson.M{opSet: bson.M{"draft.cover": c, fJobUpdatedAt: updatedAt}})
	if err != nil {
		return false, err
	}
	return res.MatchedCount == 1, nil
}

func (r *NewsResearchJobRepo) Review(ctx context.Context, id string, rv domain.NewsJobReview) (bool, error) {
	set := bson.M{fJobStatus: rv.Status, fJobReviewedBy: rv.ReviewedByName, fJobReviewedAt: rv.ReviewedAt, fJobUpdatedAt: rv.ReviewedAt}
	if rv.RejectReason != "" {
		set["rejectReason"] = rv.RejectReason
	}
	res, err := r.c.UpdateOne(ctx, bson.M{"_id": id, fJobStatus: domain.NewsJobReady}, bson.M{opSet: set})
	if err != nil {
		return false, err
	}
	return res.MatchedCount == 1, nil
}

func (r *NewsResearchJobRepo) ReopenReview(ctx context.Context, id, updatedAt string) (bool, error) {
	res, err := r.c.UpdateOne(ctx, bson.M{"_id": id, fJobStatus: domain.NewsJobApproved}, bson.M{
		opSet:   bson.M{fJobStatus: domain.NewsJobReady, fJobUpdatedAt: updatedAt},
		opUnset: bson.M{fJobReviewedBy: "", fJobReviewedAt: ""},
	})
	if err != nil {
		return false, err
	}
	return res.MatchedCount == 1, nil
}

func (r *NewsResearchJobRepo) Rerun(ctx context.Context, id string, fromStatuses []string, now string) (bool, error) {
	res, err := r.c.UpdateOne(ctx, bson.M{"_id": id, fJobStatus: bson.M{"$in": fromStatuses}}, bson.M{
		opSet:   bson.M{fJobStatus: domain.NewsJobQueued, fJobAttempts: 0, fJobNextAttemptAt: now, fJobUpdatedAt: now},
		opUnset: bson.M{"lastError": "", "refusalCategory": "", "blockedReason": "", fJobLockedUntil: "", "rejectReason": ""},
	})
	if err != nil {
		return false, err
	}
	return res.MatchedCount == 1, nil
}
