package main

import (
	"context"
	"log/slog"
	"os"
	"regexp"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/config"
	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/infra/cloudinary"
	httpx "github.com/oguaa/backend/internal/infra/http"
	mongox "github.com/oguaa/backend/internal/infra/mongo"
	"github.com/oguaa/backend/internal/infra/storage"
	"github.com/oguaa/backend/internal/service"
)

// dataRightsDeps wires the member-data features: data export, account
// erasure (in-app, public request and staff), encrypted private documents,
// data-rights requests, upload ownership and signed Cloudinary uploads.
func dataRightsDeps(ctx context.Context, db *mongo.Database, cfg config.Config, log *slog.Logger,
	members domain.MemberRepository, iap *service.IAPService, email service.EmailSender, wa service.MessageSender,
) httpx.DataRightsDeps {
	uploads := mongox.NewUploadRepo(db)
	private := mongox.NewPrivateUploadRepo(db)
	requests := mongox.NewPrivacyRequestRepo(db)
	codes := mongox.NewDeletionCodeRepo(db)
	ensureDataRightsIndexes(ctx, log, uploads, private, requests, codes)
	ensureRetentionIndexes(ctx, log, db)
	warnDemoAccountsInProduction(ctx, db, log)

	media := cloudinary.New(cfg.CloudinaryCloudName, cfg.CloudinaryAPIKey, cfg.CloudinaryAPISecret)
	if media == nil {
		log.Info("Cloudinary signed uploads DISABLED — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to enable")
	}
	data := mongox.NewMemberDataRepo(db)
	erasure := service.ErasureDeps{
		Members: members, Data: data, Codes: codes, Blocks: mongox.NewBlockRepo(db), Devices: mongox.NewPushRepo(db), News: mongox.NewNewsRepo(db),
		Private: private, Uploads: uploads, Files: storage.LocalUploads{Dir: cfg.UploadDir},
		Email: email, WhatsApp: wa, Log: log,
	}
	if media != nil {
		erasure.Media = media
	}
	if iap != nil {
		erasure.Apple = iap
	}
	return httpx.DataRightsDeps{
		Erasure:         service.NewErasureService(erasure),
		Export:          service.NewExportService(members, data),
		PrivateUploads:  privateUploadService(private, cfg, log),
		PrivacyRequests: service.NewPrivacyRequestService(requests, members, mongox.NewNotificationRepo(db), log),
		Uploads:         uploads,
		Media:           media,
	}
}

// privateUploadService keys document encryption from MFA_ENC_KEY. Local
// development may fall back to JWT_SECRET; production refuses private uploads
// (503) rather than store identity documents without the dedicated key.
func privateUploadService(repo domain.PrivateUploadRepository, cfg config.Config, log *slog.Logger) *service.PrivateUploadService {
	secret := cfg.MFAEncKey
	if secret == "" && os.Getenv("GO_ENV") != "production" {
		secret = cfg.JWTSecret
		log.Warn("private documents keyed from JWT_SECRET (development fallback) — set MFA_ENC_KEY")
	}
	svc, err := service.NewPrivateUploadService(repo, secret, log)
	if err != nil {
		log.Error("private document uploads DISABLED — could not build the cipher", "err", err)
		svc, _ = service.NewPrivateUploadService(repo, "", log)
	}
	if !svc.Available() {
		log.Error("private document uploads DISABLED — set MFA_ENC_KEY")
	}
	return svc
}

type indexer interface {
	EnsureIndexes(ctx context.Context) error
}

// ensureDataRightsIndexes creates the data-rights collections' indexes. A
// failure is logged, not fatal: the API still serves without them.
func ensureDataRightsIndexes(ctx context.Context, log *slog.Logger, repos ...indexer) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	for _, r := range repos {
		if err := r.EnsureIndexes(ctx); err != nil {
			log.Warn("data-rights index creation failed", "err", err)
		}
	}
}

// ensureRetentionIndexes creates the retention TTL indexes the privacy policy
// promises (notifications 12 months, AI usage counters 90 days) and backfills
// expiry dates on older rows. Idempotent, so it runs on every start rather
// than only from the seed commands. A failure is logged, not fatal.
func ensureRetentionIndexes(ctx context.Context, log *slog.Logger, db *mongo.Database) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	if err := mongox.EnsureRetentionIndexes(ctx, db); err != nil {
		log.Error("retention index creation failed — notifications and AI usage will not expire", "err", err)
	}
}

// warnDemoAccountsInProduction logs an ERROR when seeded demo identities
// (@oguaa.test, whose shared password is documented in the repository) exist
// in the production database. They cannot sign in there, but they should be
// removed with cmd/purgefabricated. Logged, not fatal: refusing to start would
// take the whole API down over data it already neutralises.
func warnDemoAccountsInProduction(ctx context.Context, db *mongo.Database, log *slog.Logger) {
	if os.Getenv("GO_ENV") != "production" {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	n, err := db.Collection("members").CountDocuments(ctx, bson.M{
		"email": bson.M{"$regex": regexp.QuoteMeta(domain.DemoMemberEmailSuffix) + "$"},
	})
	if err != nil {
		log.Warn("demo-account check failed", "err", err)
		return
	}
	if n > 0 {
		log.Error("demo accounts found in the production database — remove them with cmd/purgefabricated",
			"type", "security", "count", n)
	}
}

// runPrivacyDeadlineScheduler reminds stewards once a day (07:00 UTC, Ghana
// morning) of data-rights requests due within a week or overdue (G099).
func runPrivacyDeadlineScheduler(log *slog.Logger, svc *service.PrivacyRequestService) {
	if svc == nil {
		return
	}
	const hourUTC = 7
	for {
		now := time.Now().UTC()
		next := time.Date(now.Year(), now.Month(), now.Day(), hourUTC, 0, 0, 0, time.UTC)
		if !next.After(now) {
			next = next.Add(24 * time.Hour)
		}
		timer := time.NewTimer(time.Until(next))
		<-timer.C
		if n, err := svc.AlertDueSoon(context.Background()); err != nil {
			log.Error("privacy deadline reminder failed", "err", err)
		} else if n > 0 {
			log.Info("privacy deadline reminder sent", "requests", n)
		}
	}
}
