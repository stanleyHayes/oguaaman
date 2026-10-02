package main

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/mongo"

	"github.com/oguaa/backend/internal/config"
	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/infra/cloudinary"
	httpx "github.com/oguaa/backend/internal/infra/http"
	mongox "github.com/oguaa/backend/internal/infra/mongo"
	"github.com/oguaa/backend/internal/infra/openai"
	"github.com/oguaa/backend/internal/service"
)

// ── platform settings, the election calendar, the researched news desk and
// paid advertising (NEWS_ADS_SPEC §1–§3) ─────────────────────────────────────
//
// Everything here ships switched off: the news desk researches nothing until
// ANTHROPIC_API_KEY is set and a steward turns long-form on, and ads neither
// sell nor serve until a steward turns them on (and ADS_TOKEN_SECRET is set).
// A missing key never stops the server; it logs one line and the feature
// answers sensibly without it.

// features are the services the new features add.
type features struct {
	settings  *service.SettingsService
	elections *service.ElectionsService
	desk      *service.NewsDesk
	ads       *service.AdsService
	serving   *service.AdServingService
	library   *service.AdLibraryService
	report    *service.AdReportService
	campaigns domain.AdRepository
	// retained deletes political sponsors' documents kept after their
	// owner's erasure once their retention ends (the private-upload store).
	retained retainedDocumentSweeper
}

// featureInputs are what the features share with the rest of the server.
type featureInputs struct {
	db       *mongo.Database
	cfg      config.Config
	log      *slog.Logger
	paystack service.PlatformPaystack
	media    *cloudinary.Client // nil when Cloudinary is not configured
	email    service.EmailSender
	sources  []service.ResearchSource
}

// newFeatures builds the settings, elections, news desk and ads services,
// creating their indexes first (a failure is logged, not fatal).
func newFeatures(ctx context.Context, in featureInputs) features {
	settingsRepo := mongox.NewSettingsRepo(in.db)
	electionRepo := mongox.NewElectionRepo(in.db)
	jobs := mongox.NewNewsResearchJobRepo(in.db)
	campaigns := mongox.NewAdRepo(in.db)
	sponsors := mongox.NewAdSponsorRepo(in.db)
	delivery := mongox.NewAdDeliveryRepo(in.db)
	ensureIndexes(ctx, in.log, "news and ads", settingsRepo, electionRepo, jobs, campaigns, sponsors, delivery)

	uploads := mongox.NewPrivateUploadRepo(in.db)
	f := features{campaigns: campaigns, retained: uploads}
	f.settings = service.NewSettingsService(settingsRepo, in.log)
	f.elections = service.NewElectionsService(electionRepo, f.settings, in.log)
	f.desk = newNewsDesk(in, f.settings, f.elections, jobs)

	var copier service.AdImageCopier // a nil *cloudinary.Client must stay a nil interface
	if in.media != nil {
		copier = in.media
	}
	f.ads = service.NewAdsService(service.AdsDeps{
		Campaigns: campaigns, Sponsors: sponsors, Stats: delivery, Settings: f.settings, Elections: f.elections,
		Paystack: in.paystack, Images: copier, Uploads: uploads, Reports: mongox.NewReportRepo(in.db),
		Email: in.email, PortalURL: in.cfg.PortalURL, CloudinaryCloudName: in.media.CloudName(),
		TokenSecretConfigured: in.cfg.AdsTokenSecret != "", Log: in.log,
	})
	// NewAdServingService logs its own warning when ADS_TOKEN_SECRET is unset.
	f.serving = service.NewAdServingService(service.AdServingDeps{
		Campaigns: campaigns, Sponsors: sponsors, Delivery: delivery, Settings: f.settings, Elections: f.elections,
		TokenSecret: in.cfg.AdsTokenSecret, APIURL: in.cfg.PublicBaseURL, Log: in.log,
	})
	f.library = service.NewAdLibraryService(campaigns, sponsors, in.log)
	f.report = service.NewAdReportService(campaigns, delivery, in.log)

	// The scheduler flushes serving's in-memory counters, and the calendar
	// refuses to delete an election live campaigns depend on.
	f.ads.SetDeliveryFlush(f.serving.Flush)
	f.elections.SetCampaigns(f.ads)
	if in.media == nil {
		in.log.Info("ads: creative uploads DISABLED — set the CLOUDINARY_* keys; ads cannot be submitted without them")
	}
	return f
}

// newNewsDesk wires the researched news desk. Without ANTHROPIC_API_KEY it
// still serves its settings and the editor workflow but researches nothing;
// without OPENAI_API_KEY or Cloudinary every report gets the branded cover.
func newNewsDesk(in featureInputs, settings *service.SettingsService, elections *service.ElectionsService, jobs domain.NewsResearchJobRepository) *service.NewsDesk {
	var feeds []string
	for _, s := range in.sources {
		if !s.Alert {
			feeds = append(feeds, s.URL)
		}
	}
	extra := in.cfg.NewsAllowedDomains
	if strings.TrimSpace(extra) == "" {
		extra = service.DefaultNewsAllowedDomains
	}
	var store domain.ImageStore // a nil *cloudinary.Client must stay a nil interface
	if in.media != nil {
		store = cloudinaryImageStore{c: in.media}
	}
	images := openai.Generator(openai.NewImages(in.cfg.OpenAIKey, in.cfg.OpenAIImageModel, in.cfg.OpenAIImageQuality))
	desk := service.NewNewsDesk(service.NewsDeskDeps{
		News: mongox.NewNewsRepo(in.db), Jobs: jobs, Usage: mongox.NewAIUsageRepo(in.db),
		Settings: settings, Elections: elections, Images: images, Store: store, Log: in.log,
		Config: service.NewsDeskConfig{
			AnthropicKey: in.cfg.AnthropicKey, Model: in.cfg.NewsModel, StructureModel: in.cfg.NewsStructureModel,
			Effort: in.cfg.NewsEffort, MaxSearches: in.cfg.NewsMaxSearches, MaxFetches: in.cfg.NewsMaxFetches,
			MaxContinuations: in.cfg.NewsMaxContinuations, AllowedDomains: service.NewsAllowedDomains(feeds, extra),
			ImageQuality: in.cfg.OpenAIImageQuality,
		},
	})
	if !desk.Researching() {
		in.log.Info("news desk research DISABLED — set ANTHROPIC_API_KEY; RSS briefs still run, long-form reports never start")
	}
	if images == nil {
		in.log.Info("news desk AI cover illustrations DISABLED — set OPENAI_API_KEY; reports use the branded cover")
	}
	return desk
}

// handlerDeps hands the features to the HTTP layer.
func (f features) handlerDeps(d httpx.HandlerDeps) httpx.HandlerDeps {
	d.Foundations = httpx.FoundationsDeps{Settings: f.settings, Elections: f.elections}
	d.NewsDesk = f.desk
	d.Ads = f.ads
	d.AdServing = httpx.AdServingDeps{Serving: f.serving, Library: f.library, Report: f.report}
	return d
}

// start runs the background work until ctx ends: the news research worker
// (only with an Anthropic key), the ads scheduler (always: it flushes
// counters and moves campaigns along even without payments) and the daily
// sweep of political sponsors' documents whose retention has ended.
func (f features) start(ctx context.Context, log *slog.Logger) {
	if f.desk.Researching() {
		go runGuarded(ctx, log, "news research worker", f.desk.Run)
	}
	go runAdsScheduler(ctx, log, f.ads)
	if f.retained != nil {
		go runRetainedDocumentSweep(ctx, log, f.retained, retainedDocumentSweepInterval)
	}
}

// stop flushes the buffered ad opportunity, view and click counts so a
// restart loses none of them.
func (f features) stop(log *slog.Logger) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := f.serving.Flush(ctx); err != nil {
		log.Error("ads: flushing delivery counters on shutdown failed", "err", err)
	}
}

// runGuarded runs a long-lived loop and logs (rather than crashes on) a panic.
func runGuarded(ctx context.Context, log *slog.Logger, name string, run func(context.Context)) {
	defer func() {
		if p := recover(); p != nil {
			log.Error(name+" panicked and stopped", "panic", p)
		}
	}()
	run(ctx)
}

// runAdsScheduler runs one ads scheduler pass every AdsSchedulerInterval
// (spec §3.8). A panic in one pass is logged and the next pass still runs.
func runAdsScheduler(ctx context.Context, log *slog.Logger, ads *service.AdsService) {
	adsSchedulerPass(ctx, log, ads) // catch up on anything due while the process was down
	ticker := time.NewTicker(service.AdsSchedulerInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			adsSchedulerPass(ctx, log, ads)
		}
	}
}

func adsSchedulerPass(ctx context.Context, log *slog.Logger, ads *service.AdsService) {
	defer func() {
		if p := recover(); p != nil {
			log.Error("ads scheduler panicked", "panic", p)
		}
	}()
	ctx, cancel := context.WithTimeout(ctx, 4*time.Minute)
	defer cancel()
	c := ads.RunScheduler(ctx)
	if c != (service.AdsSchedulerCounts{}) {
		log.Info("ads scheduler", "expired", c.Expired, "activated", c.Activated, "completed", c.Completed,
			"refunds", c.Refunds, "polled", c.Polled, "stuck", c.Stuck, "errors", c.Errors)
	}
}

// retainedDocumentSweeper deletes the identity documents of political ad
// sponsors that were kept after their owner's erasure, once the sponsor's
// political campaigns no longer need them (mongox.PrivateUploadRepo).
type retainedDocumentSweeper interface {
	SweepRetainedPolitical(ctx context.Context, now time.Time) (int, error)
}

// retainedDocumentSweepInterval: retention ends on a date (seven years after
// a sponsor's last political ad), so once a day is plenty.
const retainedDocumentSweepInterval = 24 * time.Hour

// runRetainedDocumentSweep sweeps once at start (catching up on any day the
// process was down) and then every interval until ctx ends. A failed or
// panicking pass is logged and the next one still runs.
func runRetainedDocumentSweep(ctx context.Context, log *slog.Logger, s retainedDocumentSweeper, interval time.Duration) {
	retainedDocumentSweepPass(ctx, log, s)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			retainedDocumentSweepPass(ctx, log, s)
		}
	}
}

func retainedDocumentSweepPass(ctx context.Context, log *slog.Logger, s retainedDocumentSweeper) {
	defer func() {
		if p := recover(); p != nil {
			log.Error("retained document sweep panicked", "panic", p)
		}
	}()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	n, err := s.SweepRetainedPolitical(ctx, time.Now())
	switch {
	case err != nil:
		log.Error("retained document sweep failed", "err", err, "deleted", n)
	case n > 0:
		log.Info("retained political-sponsor documents deleted after their retention ended", "deleted", n)
	}
}

// cloudinaryImageStore stores the news desk's generated covers through the
// signed server-side Cloudinary upload.
type cloudinaryImageStore struct{ c *cloudinary.Client }

func (s cloudinaryImageStore) StoreImage(ctx context.Context, in domain.StoredImageInput) (string, error) {
	img, err := s.c.UploadImage(ctx, cloudinary.UploadImageInput{
		Folder: in.Folder, PublicID: in.PublicID, Data: in.Data, MIME: in.MIME, Tags: in.Tags, Context: in.Context,
	})
	if err != nil {
		return "", err
	}
	return img.SecureURL, nil
}
