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
	// AIAllowKimi opts a PRODUCTION deployment into the Kimi (Moonshot AI,
	// China) fallback (D4). Off by default: sending members' text to another
	// processor abroad needs a contract and a privacy-notice update first.
	AIAllowKimi bool

	// Production is GO_ENV=production: the production safety rules apply
	// (Validate), the seeded demo identities are refused, and staff roles need
	// two-factor.
	Production bool

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

	// Cloudinary signed uploads (contract K9). All three must be set for
	// POST /api/uploads/cloudinary-signature to work; otherwise it answers 503
	// and clients fall back to POST /api/uploads.
	CloudinaryCloudName string
	CloudinaryAPIKey    string
	CloudinaryAPISecret string

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
	// Without a token WhatsApp is off: outside production an undelivered code
	// is returned in the API response; production never returns one.
	WhatsAppToken   string // Bearer token for the WhatsApp Business API
	WhatsAppPhoneID string // WhatsApp Business Account phone number ID
	// WhatsAppOTPTemplate names an approved authentication template. Meta only
	// delivers business-initiated messages outside the 24-hour window through
	// templates, so codes use it when set (free-form text otherwise).
	WhatsAppOTPTemplate  string
	WhatsAppTemplateLang string // the template's language code (default "en")

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

// authRequired reports whether real sign-in is enforced. Production always
// enforces it, whatever AUTH_REQUIRED says: with it off, requireRole opens the
// back office and unauthenticated writes fall back to a demo identity. Forcing
// it (rather than refusing to start) keeps a mis-set flag from taking the API
// down while never running production open.
func authRequired() bool {
	return os.Getenv("AUTH_REQUIRED") == "true" || os.Getenv("GO_ENV") == "production"
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

// Paystack key modes, from the secret key's prefix.
const (
	PaystackModeNone    = ""        // no key: simulated in dev, disabled in production
	PaystackModeLive    = "live"    // sk_live_: real money
	PaystackModeTest    = "test"    // sk_test_: Paystack test mode, no real money
	PaystackModeUnknown = "unknown" // some other value
)

// PaystackMode reports whether PAYSTACK_SECRET_KEY is a live or a test key.
func (c Config) PaystackMode() string {
	switch {
	case c.PaystackSecretKey == "":
		return PaystackModeNone
	case strings.HasPrefix(c.PaystackSecretKey, "sk_live_"):
		return PaystackModeLive
	case strings.HasPrefix(c.PaystackSecretKey, "sk_test_"):
		return PaystackModeTest
	default:
		return PaystackModeUnknown
	}
}

// ProductionWarnings lists the optional settings a production deploy is
// missing and what that switches off. They never stop the server (D4: that
// would take production down); main logs each one at ERROR. Nothing is
// simulated in their place.
func (c Config) ProductionWarnings() []string {
	if !c.Production {
		return nil
	}
	var out []string
	switch c.PaystackMode() {
	case PaystackModeNone:
		out = append(out, "PAYSTACK_SECRET_KEY is not set: paid flows answer 503 payments_unavailable (production never simulates payments)")
	case PaystackModeTest:
		out = append(out, "PAYSTACK_SECRET_KEY is a TEST key (sk_test_): Paystack test cards will issue real tickets, plans, promotions and orders — set the live sk_live_ key")
	case PaystackModeUnknown:
		out = append(out, "PAYSTACK_SECRET_KEY does not start with sk_live_ or sk_test_: check the value pasted in the environment")
	}
	if c.ResendAPIKey == "" {
		out = append(out, "RESEND_API_KEY is not set: no email is sent, so email verification and password-reset codes cannot be delivered")
	}
	if c.WhatsAppToken == "" || c.WhatsAppPhoneID == "" {
		out = append(out, "WHATSAPP_TOKEN / WHATSAPP_PHONE_ID are not set: codes cannot be sent to phone numbers")
	} else if c.WhatsAppOTPTemplate == "" {
		out = append(out, "WHATSAPP_OTP_TEMPLATE is not set: WhatsApp codes go out as free-form text, which Meta delivers only inside the 24-hour window")
	}
	return out
}

func load() Config {
	_ = godotenv.Load() // .env is optional; ignore if missing

	return Config{
		Production:    os.Getenv("GO_ENV") == "production",
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
		AIAllowKimi:   os.Getenv("AI_ALLOW_KIMI") == "true",
		JWTSecret:     env("JWT_SECRET", "oguaa-dev-secret-change-me"),
		AuthRequired:  authRequired(),
		MFAEncKey:     os.Getenv("MFA_ENC_KEY"),
		// Apple IAP. Sandbox receipts are signed by the same Apple chain as
		// production ones, so accepting them on a live server would let any
		// sandbox tester mint free subscriptions — hence opt-in, off by default.
		AppleBundleID:     os.Getenv("APPLE_BUNDLE_ID"),
		AppleAllowSandbox: os.Getenv("APPLE_ALLOW_SANDBOX") == "true",

		UploadDir:     env("UPLOAD_DIR", "./uploads"),
		PublicBaseURL: os.Getenv("PUBLIC_API_URL"),

		CloudinaryCloudName: os.Getenv("CLOUDINARY_CLOUD_NAME"),
		CloudinaryAPIKey:    os.Getenv("CLOUDINARY_API_KEY"),
		CloudinaryAPISecret: os.Getenv("CLOUDINARY_API_SECRET"),

		// Trimmed: a pasted trailing newline would make Go refuse the
		// Authorization header and break every webhook signature (P22).
		PaystackSecretKey:  strings.TrimSpace(os.Getenv("PAYSTACK_SECRET_KEY")),
		StripeSecretKey:    os.Getenv("STRIPE_SECRET_KEY"),
		PortalURL:          env("PUBLIC_PORTAL_URL", "http://localhost:5173"),
		CreatorURL:         env("PUBLIC_CREATOR_URL", env("PUBLIC_PORTAL_URL", "http://localhost:5173")),
		PlatformFeePercent: envInt("PLATFORM_FEE_PERCENT", 5),

		ResendAPIKey: os.Getenv("RESEND_API_KEY"),
		EmailFrom:    env("EMAIL_FROM", "Oguaa <noreply@oguaa.gh>"),

		WhatsAppToken:   os.Getenv("WHATSAPP_TOKEN"),
		WhatsAppPhoneID: os.Getenv("WHATSAPP_PHONE_ID"),

		WhatsAppOTPTemplate:  os.Getenv("WHATSAPP_OTP_TEMPLATE"),
		WhatsAppTemplateLang: env("WHATSAPP_TEMPLATE_LANG", "en"),

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
