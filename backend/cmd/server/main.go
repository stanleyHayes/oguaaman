// Command server runs the Oguaa HTTP API.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"google.golang.org/grpc"

	"github.com/oguaa/backend/internal/config"
	"github.com/oguaa/backend/internal/domain"
	emailx "github.com/oguaa/backend/internal/infra/email"
	gqlx "github.com/oguaa/backend/internal/infra/graphql"
	grpcx "github.com/oguaa/backend/internal/infra/grpcapi"
	httpx "github.com/oguaa/backend/internal/infra/http"
	mongox "github.com/oguaa/backend/internal/infra/mongo"
	wax "github.com/oguaa/backend/internal/infra/whatsapp"
	"github.com/oguaa/backend/internal/platform/logger"
	"github.com/oguaa/backend/internal/service"
)

func main() {
	log := logger.New()
	// Anything that still logs through slog.Default() gets the same JSON output
	// and contact-detail masking.
	slog.SetDefault(log)
	cfg := config.Load()
	for _, w := range cfg.ProductionWarnings() {
		log.Error("production config: " + w)
	}

	ctx := context.Background()
	client, db := connectMongo(ctx, log, cfg)
	defer func() {
		_ = client.Disconnect(context.Background())
	}()

	memberRepo := mongox.NewMemberRepo(db)
	planRepo := mongox.NewPlanRepo(db)
	wa, email := deliveryChannels(cfg, log)
	push := service.NewPushSender(mongox.NewPushRepo(db), service.PushConfig{
		VAPIDPublic: cfg.VAPIDPublic, VAPIDPrivate: cfg.VAPIDPrivate, VAPIDSubject: cfg.VAPIDSubject,
	}, log).WithPreferences(memberRepo)
	svc := service.New(service.Deps{
		Listings:        mongox.NewListingRepo(db),
		Members:         memberRepo,
		Orgs:            mongox.NewOrgRepo(db),
		Places:          mongox.NewPlaceRepo(db),
		Mod:             mongox.NewModerationRepo(db),
		Notifs:          mongox.NewNotificationRepo(db),
		Follows:         mongox.NewFollowRepo(db),
		Blocks:          mongox.NewBlockRepo(db),
		Claims:          mongox.NewOrgClaimRepo(db),
		News:            mongox.NewNewsRepo(db),
		Reports:         mongox.NewReportRepo(db),
		Timeline:        mongox.NewTimelineRepo(db),
		Plans:           planRepo,
		Directives:      mongox.NewDirectiveRepo(db),
		CivicBehaviours: mongox.NewCivicBehaviourRepo(db),
		CivicLessons:    mongox.NewCivicLessonRepo(db),
		Goals:           mongox.NewGoalRepo(db),
		Agents:          mongox.NewAgentRepo(db),
		Reviews:         mongox.NewReviewRepo(db),
		AgentReviews:    mongox.NewAgentReviewRepo(db),
		Email:           email,
		WhatsApp:        wa,
		Push:            push,
		Log:             log,
		Production:      cfg.Production,
	})
	// Email/WhatsApp copies: absolute portal links + signed unsubscribe links.
	svc.ConfigureOutbound(cfg.PortalURL, cfg.PublicBaseURL, cfg.JWTSecret)
	ai := newAIService(cfg, db, log)
	auth := newAuthService(memberRepo, planRepo, cfg, email, wa, log)
	ensureUploadDir(log, cfg)
	payments, tickets, subs, promotions, commerce, revenue, stripeSvc, agentJobs := moneyServices(db, cfg, log)
	creator := service.NewCreatorService(mongox.NewListingRepo(db), mongox.NewPledgeRepo(db), mongox.NewTicketRepo(db), mongox.NewSubscriptionRepo(db), mongox.NewPromotionRepo(db))
	artistBookings := service.NewArtistBookingService(mongox.NewListingRepo(db), mongox.NewArtistBookingRepo(db), mongox.NewNotificationRepo(db))

	// Apple In-App Purchase (Guideline 3.1.1). Off unless APPLE_BUNDLE_ID is set:
	// without a bundle id there is nothing to pin a receipt to, and a verifier
	// that accepts any bundle is worse than no verifier at all.
	var iap *service.IAPService
	if cfg.AppleBundleID == "" {
		log.Info("Apple IAP DISABLED — set APPLE_BUNDLE_ID to enable in-app purchases")
	} else if verifier, vErr := service.NewAppleVerifier(cfg.AppleBundleID, cfg.AppleAllowSandbox); vErr != nil {
		log.Error("Apple IAP disabled — could not build the receipt verifier", "err", vErr)
	} else {
		iap = service.NewIAPService(verifier, mongox.NewAppleTxRepo(db), subs, log)
		log.Info("Apple IAP enabled", "bundleId", cfg.AppleBundleID, "sandboxAccepted", cfg.AppleAllowSandbox)
	}

	handler := httpx.NewHandler(httpx.HandlerDeps{
		Svc: svc, AI: ai, Auth: auth, Payments: payments, Tickets: tickets, Subs: subs, Promotions: promotions, Commerce: commerce, Stripe: stripeSvc, IAP: iap, Revenue: revenue, Creator: creator, AgentJobs: agentJobs, ArtistBookings: artistBookings,
		PaystackSecret: cfg.PaystackSecretKey, AuthRequired: cfg.AuthRequired, Production: cfg.Production, UploadDir: cfg.UploadDir, UploadBase: cfg.PublicBaseURL, PortalURL: cfg.PortalURL, Log: log,
	})
	rights := dataRightsDeps(ctx, db, cfg, log, memberRepo, iap, email, wa)
	handler.WithDataRights(rights)
	router := newRouter(log, cfg, svc, handler)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      40 * time.Second, // generous for AI calls
		IdleTimeout:       60 * time.Second,
	}
	serveHTTP(log, cfg, srv)
	grpcSrv := serveGRPC(log, cfg, svc)
	go runRemembranceScheduler(log, svc)
	go runPrivacyDeadlineScheduler(log, rights.PrivacyRequests)
	automatedResearch := service.NewAutomatedResearchService(mongox.NewNewsRepo(db), mongox.NewDirectiveRepo(db), researchSources(cfg)).WithAI(ai)
	go runAutomatedResearchScheduler(log, automatedResearch, cfg.AutoResearchIntervalMinutes)
	if cfg.PaystackSecretKey != "" {
		// C5: re-verify pending payments without relying on the shared
		// webhook. Never in simulation, which would "settle" every checkout.
		go runPaymentReconciler(log, service.NewPaymentReconciler(payments, tickets, subs, promotions, commerce, agentJobs))
	}

	// Graceful shutdown.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	log.Info("shutting down")
	grpcSrv.GracefulStop()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error("shutdown error", "err", err)
	}
}

func researchSources(cfg config.Config) []service.ResearchSource {
	var out []service.ResearchSource
	for _, raw := range strings.Split(cfg.AutoNewsFeeds, ";") {
		// name|https-url, optionally |licenceRef (the licence or permission to
		// republish summaries from a feed that reserves all rights).
		parts := strings.Split(raw, "|")
		if (len(parts) == 2 || len(parts) == 3) && strings.TrimSpace(parts[1]) != "" {
			src := service.ResearchSource{Name: strings.TrimSpace(parts[0]), URL: strings.TrimSpace(parts[1])}
			if len(parts) == 3 {
				src.LicenceRef = strings.TrimSpace(parts[2])
			}
			out = append(out, src)
		}
	}
	for _, raw := range strings.Split(cfg.AutoAlertFeeds, ";") {
		parts := strings.Split(raw, "|")
		if len(parts) == 5 && strings.TrimSpace(parts[1]) != "" {
			out = append(out, service.ResearchSource{Name: strings.TrimSpace(parts[0]), URL: strings.TrimSpace(parts[1]), Alert: true, OrgID: strings.TrimSpace(parts[2]), OrgSlug: strings.TrimSpace(parts[3]), OrgName: strings.TrimSpace(parts[4])})
		}
	}
	return out
}

func runAutomatedResearchScheduler(log *slog.Logger, worker *service.AutomatedResearchService, intervalMinutes int) {
	if intervalMinutes < 5 {
		intervalMinutes = 5
	}
	interval := time.Duration(intervalMinutes) * time.Minute
	run := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		result, err := worker.Run(ctx)
		if err != nil {
			log.Warn("automated research completed with source errors", "err", err, "news", result.PublishedNews, "alerts", result.PublishedAlerts)
			return
		}
		if result.Sources > 0 {
			log.Info("automated research complete", "sources", result.Sources, "seen", result.Seen, "news", result.PublishedNews, "alerts", result.PublishedAlerts, "skipped", result.Skipped)
		}
	}
	run()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		run()
	}
}

// runPaymentReconciler sweeps pending payments every ReconcileInterval (C5).
// A panic in one run is logged and the next run still happens.
func runPaymentReconciler(log *slog.Logger, r *service.PaymentReconciler) {
	run := func() {
		defer func() {
			if p := recover(); p != nil {
				log.Error("payment reconciliation panicked", "panic", p)
			}
		}()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		for flow, c := range r.Run(ctx) {
			if c.Checked == 0 && c.Errors == 0 {
				continue
			}
			log.Info("payment reconciliation", "flow", flow, "checked", c.Checked, "settled", c.Settled, "pending", c.Pending, "failed", c.Failed, "expired", c.Expired, "errors", c.Errors)
		}
	}
	ticker := time.NewTicker(service.ReconcileInterval)
	defer ticker.Stop()
	for range ticker.C {
		run()
	}
}

// newAIService wires the writing assistant (D4): production never simulates —
// with no provider key the AI endpoints answer 503 ai_unavailable — and the
// Kimi (Moonshot AI, China) backup is OFF in production unless AI_ALLOW_KIMI=true.
// Missing keys never stop the server.
func newAIService(cfg config.Config, db *mongo.Database, log *slog.Logger) *service.AIService {
	production := os.Getenv("GO_ENV") == "production"
	ai := service.NewAIService(cfg.AnthropicKey, cfg.AIModel, cfg.AIDailyBudget, cfg.AIPerMember, mongox.NewAIUsageRepo(db)).
		WithProduction(production)
	switch {
	case cfg.KimiAPIKey == "":
	case production && !cfg.AIAllowKimi:
		log.Warn("AI: KIMI_API_KEY is set but the Kimi fallback stays OFF in production — set AI_ALLOW_KIMI=true only once the transfer is contracted and disclosed")
	default:
		ai.WithFallback(cfg.KimiAPIKey, cfg.KimiModel, cfg.KimiBaseURL)
	}
	if production && !ai.Available() {
		log.Error("AI writing assistant UNAVAILABLE — set ANTHROPIC_API_KEY; the AI endpoints answer 503 ai_unavailable until then")
	}
	return ai
}

func connectMongo(ctx context.Context, log *slog.Logger, cfg config.Config) (*mongo.Client, *mongo.Database) {
	client, db, err := mongox.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		log.Error("mongo connect failed", "err", err, "uri", config.RedactedMongoURI(cfg.MongoURI))
		os.Exit(1)
	}
	log.Info("connected to mongodb", "db", cfg.MongoDB)
	return client, db
}

// deliveryChannels builds the WhatsApp and email senders, returning nil for a
// channel that is not configured. Callers treat nil as "no such channel", so
// an undelivered code or notice is never counted as sent.
func deliveryChannels(cfg config.Config, log *slog.Logger) (wax.Sender, service.EmailSender) {
	var wa wax.Sender
	if s := wax.NewWithOptions(cfg.WhatsAppToken, cfg.WhatsAppPhoneID, wax.Options{OTPTemplate: cfg.WhatsAppOTPTemplate, TemplateLang: cfg.WhatsAppTemplateLang}, log); wax.Configured(s) {
		wa = s
	}
	var email service.EmailSender
	if s := emailx.New(cfg.ResendAPIKey, cfg.EmailFrom, log); emailx.Configured(s) {
		email = s
	}
	return wa, email
}

func newAuthService(members domain.MemberRepository, plans domain.PlanRepository, cfg config.Config, email service.EmailSender, wa wax.Sender, log *slog.Logger) *service.AuthService {
	// Production refuses the seeded demo identities and withholds staff powers
	// from staff accounts until they turn on two-factor.
	auth := service.NewAuthService(members, cfg.JWTSecret).WithLogger(log).WithProduction(cfg.Production).
		WithPlans(plans).WithMFAEncryption(cfg.MFAEncKey)
	// OTPSender delivers phone-verification codes; the notifiers deliver
	// password-reset codes over email/WhatsApp (mirrors notifyOutOfBand). A
	// channel that is not configured stays nil (a nil wax.Sender converts to a
	// nil interface, never a typed nil).
	return auth.WithOTPSender(wa).WithNotifiers(email, wa)
}

func ensureUploadDir(log *slog.Logger, cfg config.Config) {
	if err := os.MkdirAll(cfg.UploadDir, 0o755); err != nil {
		log.Error("could not create upload dir", "err", err, "dir", cfg.UploadDir)
		os.Exit(1)
	}
}

// moneyServices wires the payment-backed services: live Paystack when a secret
// key is set; otherwise a labelled simulation in development and, in
// production, a disabled client whose calls fail with
// service.ErrPaymentsUnavailable (503 payments_unavailable) — production never
// simulates a payment (D4/K16). Stripe is optional and only enabled when
// STRIPE_SECRET_KEY is set.
func moneyServices(db *mongo.Database, cfg config.Config, log *slog.Logger) (*service.PaymentsService, *service.TicketsService, *service.SubscriptionsService, *service.PromotionsService, *service.CommerceService, *service.RevenueService, *service.StripeService, *service.AgentJobsService) {
	paystack := service.PaystackFor(cfg.PaystackSecretKey, cfg.Production, service.SimulatedPaystack{Log: log})
	switch mode := cfg.PaystackMode(); {
	case mode == config.PaystackModeLive:
		log.Info("payments via Paystack", "mode", mode)
	case mode != config.PaystackModeNone:
		// sk_test_ (or a malformed key): no real money moves. In production
		// ProductionWarnings has already logged this at ERROR.
		log.Warn("payments via Paystack TEST mode — no real money moves", "mode", mode)
	case cfg.Production:
		log.Error("payments DISABLED — set PAYSTACK_SECRET_KEY; paid flows answer 503 payments_unavailable")
	default:
		log.Info("payments SIMULATED — set PAYSTACK_SECRET_KEY for live charges")
	}
	creatorURL := cfg.CreatorURL
	if creatorURL == "" {
		creatorURL = cfg.PortalURL
	}
	payments := service.NewPaymentsService(mongox.NewListingRepo(db), mongox.NewPledgeRepo(db), mongox.NewNotificationRepo(db), mongox.NewMemberRepo(db), mongox.NewPlanRepo(db), paystack, cfg.PortalURL, cfg.PlatformFeePercent)
	tickets := service.NewTicketsService(mongox.NewListingRepo(db), mongox.NewTicketRepo(db), mongox.NewNotificationRepo(db), paystack, cfg.PortalURL)
	subs := service.NewSubscriptionsService(mongox.NewListingRepo(db), mongox.NewSubscriptionRepo(db), mongox.NewPlanRepo(db), mongox.NewMemberRepo(db), paystack, cfg.PortalURL, creatorURL)
	promotions := service.NewPromotionsService(mongox.NewListingRepo(db), mongox.NewPromotionRepo(db), paystack, cfg.PortalURL).WithCreatorURL(creatorURL)
	commerce := service.NewCommerceService(mongox.NewListingRepo(db), mongox.NewBusinessVerificationRepo(db), mongox.NewCommerceOrderRepo(db), mongox.NewBusinessCouponRepo(db), mongox.NewAffiliateRepo(db), paystack, cfg.PortalURL, cfg.PlatformFeePercent)
	revenue := service.NewRevenueService(mongox.NewPledgeRepo(db), mongox.NewTicketRepo(db), mongox.NewSubscriptionRepo(db), mongox.NewPromotionRepo(db), mongox.NewCommerceOrderRepo(db))
	agentJobs := service.NewAgentJobsService(mongox.NewAgentJobRepo(db), mongox.NewAgentRepo(db), mongox.NewAgentReviewRepo(db), mongox.NewNotificationRepo(db), paystack, cfg.PortalURL, cfg.PlatformFeePercent)

	var stripeSvc *service.StripeService
	if cfg.StripeSecretKey != "" {
		stripeClient := service.NewStripeClient(cfg.StripeSecretKey)
		stripeSvc = service.NewStripeService(stripeClient, mongox.NewStripeIntentRepo(db), payments, tickets, subs, promotions)
		log.Info("Stripe mobile checkouts enabled")
	}
	return payments, tickets, subs, promotions, commerce, revenue, stripeSvc, agentJobs
}

func newRouter(log *slog.Logger, cfg config.Config, svc *service.Service, handler *httpx.Handler) http.Handler {
	gqlHandler, err := gqlx.NewHandler(svc)
	if err != nil {
		log.Error("graphql schema build failed", "err", err)
		os.Exit(1)
	}
	return httpx.NewRouter(handler, gqlHandler, strings.Split(cfg.AllowedOrigin, ","), log)
}

func serveHTTP(log *slog.Logger, cfg config.Config, srv *http.Server) {
	go func() {
		log.Info("oguaa api listening", "port", cfg.Port, "aiKey", cfg.AnthropicKey != "")
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("server error", "err", err)
			os.Exit(1)
		}
	}()
}

// serveGRPC starts the gRPC server (oguaa.v1.OguaaService) on its own port,
// backed by the same service core.
func serveGRPC(log *slog.Logger, cfg config.Config, svc *service.Service) *grpc.Server {
	grpcSrv := grpcx.NewGRPCServer(svc)
	go func() {
		lis, err := net.Listen("tcp", ":"+cfg.GRPCPort)
		if err != nil {
			log.Error("grpc listen failed", "err", err, "port", cfg.GRPCPort)
			os.Exit(1)
		}
		log.Info("oguaa grpc listening", "port", cfg.GRPCPort)
		if err := grpcSrv.Serve(lis); err != nil {
			log.Error("grpc server error", "err", err)
			os.Exit(1)
		}
	}()
	return grpcSrv
}

// runRemembranceScheduler is the daily yearly-remembrance scheduler (spec §8.11):
// a catch-up run on startup, then once each day aligned to 06:00 UTC (06:00 GMT —
// Ghana time), so notices arrive in the morning regardless of when the process
// booted. A per-day guard makes it idempotent: the startup run and the scheduled
// run can't both fire the same day's anniversaries. For multi-instance/serverless
// deploys, drive POST /api/admin/run-remembrance from an external cron instead.
func runRemembranceScheduler(log *slog.Logger, svc *service.Service) {
	const hourUTC = 6
	var lastRunDay string
	runOnce := func() {
		today := time.Now().UTC().Format(time.DateOnly)
		if today == lastRunDay {
			return
		}
		lastRunDay = today
		if n, err := svc.RunRemembrance(context.Background(), ""); err != nil {
			log.Error("remembrance run failed", "err", err)
		} else if n > 0 {
			log.Info("remembrance notices sent", "count", n)
		}
	}
	runOnce() // catch up anything missed while the process was down
	for {
		now := time.Now().UTC()
		next := time.Date(now.Year(), now.Month(), now.Day(), hourUTC, 0, 0, 0, time.UTC)
		if !next.After(now) {
			next = next.Add(24 * time.Hour)
		}
		timer := time.NewTimer(time.Until(next))
		<-timer.C
		runOnce()
	}
}
