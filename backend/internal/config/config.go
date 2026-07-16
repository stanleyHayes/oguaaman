// Package config loads runtime configuration from the environment.
package config

import (
	"os"
	"strconv"

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

	// Auth (spec §8.1, §9). Password-based sign-in → JWT sessions.
	JWTSecret    string
	AuthRequired bool // when false (dev default), unauthenticated writes fall back to a demo identity

	// Image uploads (first-party). Files are written to UploadDir and served at
	// /uploads/*. PublicBaseURL is prefixed onto returned URLs; empty = derive the
	// absolute URL from the incoming request.
	UploadDir     string
	PublicBaseURL string

	// Payments (adopt-a-project, spec §4/§6/§15). Without a secret key the pledge
	// flow runs a clearly-labelled simulation. PortalURL builds the Paystack
	// callback (where the payer returns after paying).
	PaystackSecretKey  string
	PortalURL          string
	PlatformFeePercent int // kept by the platform on each confirmed pledge; net goes to the project

	// Email delivery via Resend (transactional — OTP codes, moderation outcomes,
	// notification digests). Without a key, email delivery is silently skipped
	// (in-app notifications still work).
	ResendAPIKey  string
	EmailFrom     string // e.g. "Oguaa <noreply@oguaa.gh>"

	// WhatsApp OTP delivery. Uses WhatsApp Business Cloud API (Meta) or a
	// provider that speaks the same HTTP interface (e.g. 360dialog, Twilio).
	// Without a token the OTP code is returned in the API response (dev/sim mode).
	WhatsAppToken   string // Bearer token for the WhatsApp Business API
	WhatsAppPhoneID string // WhatsApp Business Account phone number ID
}

// Load reads configuration from a local .env (if present) and the environment,
// applying sensible defaults for local development.
func Load() Config {
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
		JWTSecret:     env("JWT_SECRET", "oguaa-dev-secret-change-me"),
		AuthRequired:  os.Getenv("AUTH_REQUIRED") == "true",

		UploadDir:     env("UPLOAD_DIR", "./uploads"),
		PublicBaseURL: os.Getenv("PUBLIC_API_URL"),

		PaystackSecretKey:  os.Getenv("PAYSTACK_SECRET_KEY"),
		PortalURL:          env("PUBLIC_PORTAL_URL", "http://localhost:5173"),
		PlatformFeePercent: envInt("PLATFORM_FEE_PERCENT", 5),

		ResendAPIKey: os.Getenv("RESEND_API_KEY"),
		EmailFrom:    env("EMAIL_FROM", "Oguaa <noreply@oguaa.gh>"),

		WhatsAppToken:   os.Getenv("WHATSAPP_TOKEN"),
		WhatsAppPhoneID: os.Getenv("WHATSAPP_PHONE_ID"),
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
