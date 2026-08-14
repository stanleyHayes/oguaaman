// Package config loads runtime configuration from the environment.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds all runtime configuration for the Oguaa backend.
type Config struct {
	Port          string
	GRPCPort      string // gRPC listen port (oguaa.v1.OguaaService); 50051 by convention
	MongoURI      string
	MongoDB       string
	AllowedOrigin string // CORS origin for the React frontend
	AnthropicKey  string // optional; absent => AI writing bar runs in simulated mode
	AIModel       string
	AIDailyBudget int // global daily cap across the whole instance
	AIPerMember   int // per-member (per-admin) daily cap

	// Kimi (Moonshot AI) — optional OpenAI-compatible backup used when the
	// Anthropic call is absent or errors. Absent => no fallback (simulation).
	KimiAPIKey  string
	KimiModel   string
	KimiBaseURL string

	// Auth (spec §8.1, §9). Password-based sign-in → JWT sessions.
	JWTSecret         string
	AuthRequired      bool   // when false (dev default), unauthenticated writes fall back to a demo identity
	MFAEncKey         string // optional; when set, TOTP secrets are AES-GCM encrypted at rest
	AppleBundleID     string // iOS bundle id an IAP receipt must name
	AppleAllowSandbox bool   // accept StoreKit sandbox receipts (never in production)

	// Image uploads (first-party). Files are written to UploadDir and served at
	// /uploads/*. PublicBaseURL is prefixed onto returned URLs; empty = derive the
	// absolute URL from the incoming request.
	UploadDir     string
	PublicBaseURL string

	// Payments (adopt-a-project, spec §4/§6/§15). Without a secret key the pledge
	// flow runs a clearly-labelled simulation. PortalURL builds the Paystack
	// callback (where the payer returns after paying).
	PaystackSecretKey  string
	StripeSecretKey    string // optional; enables Stripe PaymentSheet mobile checkouts
	PortalURL          string
	CreatorURL         string // creator-app origin for creator-subscription callbacks; defaults to PortalURL
	PlatformFeePercent int    // kept by the platform on each confirmed pledge; net goes to the project

	// Email delivery via Resend (transactional — OTP codes, moderation outcomes,
	// notification digests). Without a key, email delivery is silently skipped
	// (in-app notifications still work).
	ResendAPIKey string
	EmailFrom    string // e.g. "Oguaa <noreply@oguaa.gh>"

	// WhatsApp OTP delivery. Uses WhatsApp Business Cloud API (Meta) or a
	// provider that speaks the same HTTP interface (e.g. 360dialog, Twilio).
	// Without a token the OTP code is returned in the API response (dev/sim mode).
	WhatsAppToken   string // Bearer token for the WhatsApp Business API
	WhatsAppPhoneID string // WhatsApp Business Account phone number ID

	// Web Push (VAPID) for browser safety alerts. Generate a key pair once
	// (e.g. `npx web-push generate-vapid-keys`). Without them, browsers can't
	// subscribe and the ring stays in-app/foreground only; Expo (mobile) push
	// needs no key. Subject is a mailto:/https: contact the push services require.
	VAPIDPublic  string
	VAPIDPrivate string
	VAPIDSubject string

	// Trusted RSS/Atom feeds for the automated research desk. News entries are
	// name|url. Alert entries are name|url|orgId|orgSlug|orgName and must point
	// to an official authority feed. Separate entries with semicolons.
	AutoNewsFeeds               string
	AutoAlertFeeds              string
	AutoResearchIntervalMinutes int
}

// Load reads configuration from a local .env (if present) and the environment,
// applying sensible defaults for local development.
func Load() Config {
	cfg := load()
	if err := cfg.Validate(); err != nil {
		fmt.Fprintln(os.Stderr, "config error:", err)
		os.Exit(1)
	}
	return cfg
}

// Validate enforces production safety rules. It returns an error when settings
// that are unsafe for production are left at dev defaults.
func (c Config) Validate() error {
	if os.Getenv("GO_ENV") != "production" {
		return nil
	}
	if c.JWTSecret == "" || c.JWTSecret == "oguaa-dev-secret-change-me" {
		return fmt.Errorf("JWT_SECRET must be set to a strong secret in production")
	}
	if c.AllowedOrigin == "*" {
		return fmt.Errorf("ALLOWED_ORIGIN cannot be wildcard in production")
	}
	if c.PublicBaseURL == "" {
		return fmt.Errorf("PUBLIC_API_URL must be set in production so upload URLs are not derived from the Host header")
	}
	return nil
}

func load() Config {
	_ = godotenv.Load() // .env is optional; ignore if missing

	return Config{
		Port:          env("PORT", "8080"),
		GRPCPort:      env("GRPC_PORT", "50051"),
		MongoURI:      env("MONGODB_URI", "mongodb://localhost:27017"),
		MongoDB:       env("MONGODB_DB", "oguaa"),
		AllowedOrigin: env("ALLOWED_ORIGIN", "http://localhost:5173"),
		AnthropicKey:  os.Getenv("ANTHROPIC_API_KEY"),
		AIModel:       env("OGUAA_AI_MODEL", "claude-haiku-4-5-20251001"),
		AIDailyBudget: envInt("OGUAA_AI_DAILY_BUDGET", 60),
		AIPerMember:   envInt("OGUAA_AI_PER_MEMBER", 20),
		KimiAPIKey:    os.Getenv("KIMI_API_KEY"),
		KimiModel:     env("KIMI_MODEL", "k3"),
		KimiBaseURL:   env("KIMI_BASE_URL", "https://api.moonshot.ai/v1"),
		JWTSecret:     env("JWT_SECRET", "oguaa-dev-secret-change-me"),
		AuthRequired:  os.Getenv("AUTH_REQUIRED") == "true",
		MFAEncKey:     os.Getenv("MFA_ENC_KEY"),
		// Apple IAP. Sandbox receipts are signed by the same Apple chain as
		// production ones, so accepting them on a live server would let any
		// sandbox tester mint free subscriptions — hence opt-in, off by default.
		AppleBundleID:     os.Getenv("APPLE_BUNDLE_ID"),
		AppleAllowSandbox: os.Getenv("APPLE_ALLOW_SANDBOX") == "true",

		UploadDir:     env("UPLOAD_DIR", "./uploads"),
		PublicBaseURL: os.Getenv("PUBLIC_API_URL"),

		PaystackSecretKey:  os.Getenv("PAYSTACK_SECRET_KEY"),
		StripeSecretKey:    os.Getenv("STRIPE_SECRET_KEY"),
		PortalURL:          env("PUBLIC_PORTAL_URL", "http://localhost:5173"),
		CreatorURL:         env("PUBLIC_CREATOR_URL", env("PUBLIC_PORTAL_URL", "http://localhost:5173")),
		PlatformFeePercent: envInt("PLATFORM_FEE_PERCENT", 5),

		ResendAPIKey: os.Getenv("RESEND_API_KEY"),
		EmailFrom:    env("EMAIL_FROM", "Oguaa <noreply@oguaa.gh>"),

		WhatsAppToken:   os.Getenv("WHATSAPP_TOKEN"),
		WhatsAppPhoneID: os.Getenv("WHATSAPP_PHONE_ID"),

		VAPIDPublic:                 os.Getenv("VAPID_PUBLIC_KEY"),
		VAPIDPrivate:                os.Getenv("VAPID_PRIVATE_KEY"),
		VAPIDSubject:                env("VAPID_SUBJECT", "mailto:hello@oguaa.gh"),
		AutoNewsFeeds:               os.Getenv("AUTO_NEWS_FEEDS"),
		AutoAlertFeeds:              os.Getenv("AUTO_ALERT_FEEDS"),
		AutoResearchIntervalMinutes: envInt("AUTO_RESEARCH_INTERVAL_MINUTES", 30),
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

// RedactedMongoURI returns the connection string with its credentials removed,
// safe to log.
//
// The raw URI must never reach a log line. Render retains stdout, so a single
// connect failure would publish the database username and password into a log
// stream that outlives the incident — and connect failures are exactly when
// somebody pastes the log into a chat to ask for help.
func RedactedMongoURI(uri string) string {
	scheme := strings.Index(uri, "://")
	if scheme < 0 {
		return "(malformed uri)"
	}
	rest := uri[scheme+3:]
	at := strings.LastIndex(rest, "@")
	if at < 0 {
		return uri // no credentials embedded
	}
	return uri[:scheme+3] + "<redacted>@" + rest[at+1:]
}
