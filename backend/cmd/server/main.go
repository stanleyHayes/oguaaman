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
	cfg := config.Load()

	ctx := context.Background()
	client, db := connectMongo(ctx, log, cfg)
	defer func() {
		_ = client.Disconnect(context.Background())
	}()

	memberRepo := mongox.NewMemberRepo(db)
	wa := wax.New(cfg.WhatsAppToken, cfg.WhatsAppPhoneID, log)
	email := emailx.New(cfg.ResendAPIKey, cfg.EmailFrom, log)
	svc := service.New(service.Deps{
		Listings:   mongox.NewListingRepo(db),
		Members:    memberRepo,
		Orgs:       mongox.NewOrgRepo(db),
		Places:     mongox.NewPlaceRepo(db),
		Mod:        mongox.NewModerationRepo(db),
		Notifs:     mongox.NewNotificationRepo(db),
		Follows:    mongox.NewFollowRepo(db),
		Claims:     mongox.NewOrgClaimRepo(db),
		News:       mongox.NewNewsRepo(db),
		Reports:    mongox.NewReportRepo(db),
		Timeline:   mongox.NewTimelineRepo(db),
		Plans:      mongox.NewPlanRepo(db),
		Directives: mongox.NewDirectiveRepo(db),
		Email:      email,
		WhatsApp:   wa,
		Log:        log,
	})
	ai := service.NewAIService(cfg.AnthropicKey, cfg.AIModel, cfg.AIDailyBudget, cfg.AIPerMember, mongox.NewAIUsageRepo(db))
	auth := newAuthService(memberRepo, cfg, email, wa)
	ensureUploadDir(log, cfg)
	payments, tickets, subs, promotions, revenue := moneyServices(db, cfg, log)
	creator := service.NewCreatorService(mongox.NewListingRepo(db), mongox.NewPledgeRepo(db), mongox.NewTicketRepo(db), mongox.NewSubscriptionRepo(db), mongox.NewPromotionRepo(db))

	handler := httpx.NewHandler(httpx.HandlerDeps{
		Svc: svc, AI: ai, Auth: auth, Payments: payments, Tickets: tickets, Subs: subs, Promotions: promotions, Revenue: revenue, Creator: creator,
		PaystackSecret: cfg.PaystackSecretKey, AuthRequired: cfg.AuthRequired, UploadDir: cfg.UploadDir, UploadBase: cfg.PublicBaseURL, Log: log,
	})
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

func connectMongo(ctx context.Context, log *slog.Logger, cfg config.Config) (*mongo.Client, *mongo.Database) {
	client, db, err := mongox.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		log.Error("mongo connect failed", "err", err, "uri", cfg.MongoURI)
		os.Exit(1)
	}
	log.Info("connected to mongodb", "db", cfg.MongoDB)
	return client, db
}

func newAuthService(members domain.MemberRepository, cfg config.Config, email service.EmailSender, wa wax.Sender) *service.AuthService {
	auth := service.NewAuthService(members, cfg.JWTSecret)
	// OTPSender delivers phone-verification codes; the notifiers deliver
	// password-reset codes over email/WhatsApp (mirrors notifyOutOfBand).
	return auth.WithOTPSender(wa).WithNotifiers(email, wa)
}

func ensureUploadDir(log *slog.Logger, cfg config.Config) {
	if err := os.MkdirAll(cfg.UploadDir, 0o755); err != nil {
		log.Error("could not create upload dir", "err", err, "dir", cfg.UploadDir)
		os.Exit(1)
	}
}

// moneyServices wires the payment-backed services: live Paystack when a secret
// key is set, else a labelled simulation.
func moneyServices(db *mongo.Database, cfg config.Config, log *slog.Logger) (*service.PaymentsService, *service.TicketsService, *service.SubscriptionsService, *service.PromotionsService, *service.RevenueService) {
	var paystack service.PaystackClient = service.SimulatedPaystack{Log: log}
	if cfg.PaystackSecretKey != "" {
		paystack = service.NewPaystackClient(cfg.PaystackSecretKey)
		log.Info("payments via live Paystack")
	} else {
		log.Info("payments SIMULATED — set PAYSTACK_SECRET_KEY for live charges")
	}
	payments := service.NewPaymentsService(mongox.NewListingRepo(db), mongox.NewPledgeRepo(db), mongox.NewNotificationRepo(db), paystack, cfg.PortalURL, cfg.PlatformFeePercent)
	tickets := service.NewTicketsService(mongox.NewListingRepo(db), mongox.NewTicketRepo(db), mongox.NewNotificationRepo(db), paystack, cfg.PortalURL)
	subs := service.NewSubscriptionsService(mongox.NewListingRepo(db), mongox.NewSubscriptionRepo(db), mongox.NewPlanRepo(db), paystack, cfg.PortalURL)
	promotions := service.NewPromotionsService(mongox.NewListingRepo(db), mongox.NewPromotionRepo(db), paystack, cfg.PortalURL)
	revenue := service.NewRevenueService(mongox.NewPledgeRepo(db), mongox.NewTicketRepo(db), mongox.NewSubscriptionRepo(db), mongox.NewPromotionRepo(db))
	return payments, tickets, subs, promotions, revenue
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
