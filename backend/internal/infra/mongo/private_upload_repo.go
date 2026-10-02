package mongo

import (
	"context"
	"slices"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/domain"
)

// PrivateUploadRepo stores encrypted identity/vetting documents
// (domain.PrivateUploadRepository). Documents are small (≤ 5 MB), so the
// ciphertext lives in the document itself — durable across redeploys, unlike
// the API's ephemeral disk.
type PrivateUploadRepo struct{ c *mongo.Collection }

func NewPrivateUploadRepo(db *mongo.Database) *PrivateUploadRepo {
	return &PrivateUploadRepo{c: db.Collection(collPrivateUploads)}
}

// EnsureIndexes creates the owner lookup index and, for the daily sweep,
// an index over the few uploads kept after their owner's erasure (partial,
// so the sweep never scans the documents' ciphertext).
func (r *PrivateUploadRepo) EnsureIndexes(ctx context.Context) error {
	_, err := r.c.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: fOwnerID, Value: 1}}},
		{
			Keys:    bson.D{{Key: fRetainedFor, Value: 1}, {Key: fRetainUntil, Value: 1}},
			Options: options.Index().SetPartialFilterExpression(bson.M{fRetainedFor: bson.M{opExists: true}}),
		},
	})
	return err
}

func (r *PrivateUploadRepo) Insert(ctx context.Context, u domain.PrivateUpload) error {
	_, err := r.c.InsertOne(ctx, u)
	return err
}

func (r *PrivateUploadRepo) ByID(ctx context.Context, id string) (*domain.PrivateUpload, error) {
	var u domain.PrivateUpload
	if err := r.c.FindOne(ctx, bson.M{fAdID: id}).Decode(&u); err != nil {
		return nil, notFound("document", err)
	}
	return &u, nil
}

func (r *PrivateUploadRepo) ByOwner(ctx context.Context, ownerID string) ([]domain.PrivateUpload, error) {
	return findMemberDocs[domain.PrivateUpload](ctx, r.c, bson.M{fOwnerID: ownerID},
		options.Find().SetProjection(bson.M{"ciphertext": 0}).SetSort(bson.D{{Key: "createdAt", Value: -1}}))
}

// OwnerUsage counts the owner's documents and sums their sizes. The quota
// keeps an owner to a handful of documents, so reading only the size field of
// each is cheap.
func (r *PrivateUploadRepo) OwnerUsage(ctx context.Context, ownerID string) (int, int64, error) {
	rows, err := findMemberDocs[struct {
		Size int64 `bson:"size"`
	}](ctx, r.c, bson.M{fOwnerID: ownerID}, options.Find().SetProjection(bson.M{"size": 1}))
	if err != nil {
		return 0, 0, err
	}
	var total int64
	for _, row := range rows {
		total += row.Size
	}
	return len(rows), total, nil
}

// DeleteByOwner removes every upload the member owns, except the identity
// documents of political ad sponsors whose campaigns must stay on the public
// record (spec §3.12): those are kept, unlinked from the member, with the
// date their retention ends — the latest retainUntil of the sponsor's
// political campaigns — and SweepRetainedPolitical deletes them after it.
func (r *PrivateUploadRepo) DeleteByOwner(ctx context.Context, ownerID string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	keep, err := r.retainedForPoliticalAds(ctx, ownerID, now)
	if err != nil {
		return err
	}
	kept := bson.A{}
	for id, ret := range keep {
		if _, err := r.c.UpdateOne(ctx, bson.M{fAdID: id, fOwnerID: ownerID}, keptUpload(ret, now)); err != nil {
			return err
		}
		kept = append(kept, id)
	}
	filter := bson.M{fOwnerID: ownerID}
	if len(kept) > 0 {
		filter[fAdID] = bson.M{"$nin": kept}
	}
	_, err = r.c.DeleteMany(ctx, filter)
	return err
}

// Retention marker on private uploads kept after their owner's erasure.
const (
	fRetainedFor        = "retainedFor"
	fRetainUntil        = "retainUntil"
	retainedPoliticalAd = "political_ad"

	// retainedSweepBatch bounds one sweep pass; kept documents are rare and
	// the sweep runs daily, so anything left over is handled the next day.
	retainedSweepBatch = 500
)

// politicalRetention is how long political sponsors keep a document on
// file: while any of their political campaigns is running (its retainUntil
// isn't set until it stops), and until the latest retainUntil.
type politicalRetention struct {
	until   string // latest campaign retainUntil (RFC 3339 UTC), "" for none
	running bool   // a political campaign is scheduled, active or paused
}

// merge combines the retention of several campaigns or sponsors.
func (p politicalRetention) merge(o politicalRetention) politicalRetention {
	return politicalRetention{until: max(p.until, o.until), running: p.running || o.running}
}

// keeps reports whether the document must stay on file at now.
func (p politicalRetention) keeps(now string) bool { return p.running || p.until > now }

// endOnRecord is the retainUntil to store on a kept document: the latest
// campaign retainUntil when it is still ahead, otherwise none (a campaign
// still running has no end yet, so the daily sweep looks again).
func (p politicalRetention) endOnRecord(now string) string {
	if p.until > now {
		return p.until
	}
	return ""
}

// keptUpload is the update that keeps an upload past its owner's erasure.
func keptUpload(ret politicalRetention, now string) bson.M {
	set := bson.M{fRetainedFor: retainedPoliticalAd}
	if end := ret.endOnRecord(now); end != "" {
		set[fRetainUntil] = end
	}
	return bson.M{opSet: set, opUnset: bson.M{fOwnerID: ""}}
}

// retainedForPoliticalAds lists the owner's uploads that a political ad
// sponsor relies on (ID document, EC authorisation) while any of that
// sponsor's political campaigns is running or still inside retainUntil,
// with how long each must be kept.
func (r *PrivateUploadRepo) retainedForPoliticalAds(ctx context.Context, ownerID, now string) (map[string]politicalRetention, error) {
	docs, err := findMemberDocs[struct {
		ID string `bson:"_id"`
	}](ctx, r.c, bson.M{fOwnerID: ownerID}, options.Find().SetProjection(bson.M{fAdID: 1}))
	if err != nil || len(docs) == 0 {
		return nil, err
	}
	ids := make([]string, 0, len(docs))
	for _, d := range docs {
		ids = append(ids, d.ID)
	}
	all, err := r.politicalRetentionOf(ctx, ids, now)
	if err != nil {
		return nil, err
	}
	keep := map[string]politicalRetention{}
	for id, ret := range all {
		if ret.keeps(now) {
			keep[id] = ret
		}
	}
	return keep, nil
}

// politicalRetentionOf works out, for each of ids, how long the political
// sponsors that rely on it keep it on file (zero for an upload no political
// sponsor names).
func (r *PrivateUploadRepo) politicalRetentionOf(ctx context.Context, ids []string, now string) (map[string]politicalRetention, error) {
	want := bson.A{}
	for _, id := range ids {
		want = append(want, id)
	}
	sponsors, err := findMemberDocs[domain.AdSponsor](ctx, r.c.Database().Collection(collAdSponsors), bson.M{
		"kind": domain.AdSponsorPolitical,
		opOr:   bson.A{bson.M{"idDocumentUploadId": bson.M{opIn: want}}, bson.M{"ecAuthorisationUploadId": bson.M{opIn: want}}},
	})
	if err != nil {
		return nil, err
	}
	out := make(map[string]politicalRetention, len(ids))
	for _, sp := range sponsors {
		ret, err := r.sponsorRetention(ctx, sp.ID, now)
		if err != nil {
			return nil, err
		}
		for _, id := range []string{sp.IDDocumentUploadID, sp.ECAuthorisationUploadID} {
			if id != "" && slices.Contains(ids, id) {
				out[id] = out[id].merge(ret)
			}
		}
	}
	return out, nil
}

// sponsorRetention reads the sponsor's political campaigns that keep its
// documents on file (politicalRetentionFilter).
func (r *PrivateUploadRepo) sponsorRetention(ctx context.Context, sponsorID, now string) (politicalRetention, error) {
	rows, err := findMemberDocs[struct {
		Status      string `bson:"status"`
		RetainUntil string `bson:"retainUntil"`
	}](ctx, r.c.Database().Collection(collAdCampaigns), politicalRetentionFilter(sponsorID, now),
		options.Find().SetProjection(bson.M{fieldStatus: 1, fAdRetainUntil: 1}))
	if err != nil {
		return politicalRetention{}, err
	}
	var ret politicalRetention
	for _, row := range rows {
		ret = ret.merge(politicalRetention{until: row.RetainUntil, running: slices.Contains(runningAdStatuses, row.Status)})
	}
	return ret, nil
}

// runningAdStatuses are the campaign statuses that have no retainUntil yet.
var runningAdStatuses = []string{domain.AdStatusScheduled, domain.AdStatusActive, domain.AdStatusPaused}

// politicalRetentionFilter matches a sponsor's political campaigns that keep
// its documents on file: still running, or inside retainUntil.
func politicalRetentionFilter(sponsorID, now string) bson.M {
	running := bson.A{}
	for _, st := range runningAdStatuses {
		running = append(running, st)
	}
	return bson.M{
		fAdSponsorID: sponsorID, fAdPolitical: true,
		opOr: bson.A{
			bson.M{fieldStatus: bson.M{opIn: running}},
			bson.M{fAdRetainUntil: bson.M{adOpGt: now}},
		},
	}
}

// ── the daily sweep of kept documents ────────────────────────────────────────

// retainedDueFilter matches the uploads kept for political-ad transparency
// whose retention has no end on record or has reached it.
func retainedDueFilter(now string) bson.M {
	return bson.M{
		fRetainedFor: retainedPoliticalAd,
		fOwnerID:     bson.M{opExists: false},
		opOr: bson.A{
			bson.M{fRetainUntil: bson.M{opExists: false}},
			bson.M{fRetainUntil: ""},
			bson.M{fRetainUntil: bson.M{adOpLte: now}},
		},
	}
}

// retainedSweepPlan decides what happens to each due kept upload: deleted
// when nothing keeps it any more, otherwise kept, with a new end of
// retention to record when one is known (a campaign that ran on, or ended
// later, moves it on).
func retainedSweepPlan(due []string, retention map[string]politicalRetention, now string) (remove []string, extend map[string]string) {
	extend = map[string]string{}
	for _, id := range due {
		ret := retention[id]
		switch {
		case !ret.keeps(now):
			remove = append(remove, id)
		case ret.endOnRecord(now) != "":
			extend[id] = ret.endOnRecord(now)
		}
	}
	return remove, extend
}

// SweepRetainedPolitical deletes the uploads DeleteByOwner kept for
// political-ad transparency once their retention has ended: the sponsors
// relying on them have no political campaign running and the latest
// campaign retainUntil has passed (the privacy notice: kept until 7 years
// after the sponsor's last political ad). Uploads whose recorded end is
// still ahead are not looked at; one that is due is checked against the
// campaigns again before anything is deleted. The ciphertext lives in the
// document, so deleting the document deletes the file, as every
// private-upload delete does. It returns how many were deleted.
func (r *PrivateUploadRepo) SweepRetainedPolitical(ctx context.Context, at time.Time) (int, error) {
	now := at.UTC().Format(time.RFC3339)
	rows, err := findMemberDocs[struct {
		ID string `bson:"_id"`
	}](ctx, r.c, retainedDueFilter(now), options.Find().SetProjection(bson.M{fAdID: 1}).SetLimit(retainedSweepBatch))
	if err != nil || len(rows) == 0 {
		return 0, err
	}
	due := make([]string, 0, len(rows))
	for _, row := range rows {
		due = append(due, row.ID)
	}
	retention, err := r.politicalRetentionOf(ctx, due, now)
	if err != nil {
		return 0, err
	}
	remove, extend := retainedSweepPlan(due, retention, now)
	for id, end := range extend {
		if _, err := r.c.UpdateOne(ctx, bson.M{fAdID: id, fRetainedFor: retainedPoliticalAd}, bson.M{opSet: bson.M{fRetainUntil: end}}); err != nil {
			return 0, err
		}
	}
	deleted := 0
	for _, id := range remove {
		res, err := r.c.DeleteOne(ctx, bson.M{fAdID: id, fRetainedFor: retainedPoliticalAd, fOwnerID: bson.M{opExists: false}})
		if err != nil {
			return deleted, err
		}
		deleted += int(res.DeletedCount)
	}
	return deleted, nil
}
