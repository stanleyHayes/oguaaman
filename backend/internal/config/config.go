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

	// Auth (spec §8.1, §9). Passwordless phone/email OTP → JWT sessions.
	JWTSecret    string
	OTPTTLMin    int
	AuthRequired bool // when false (dev default), unauthenticated writes fall back to a demo identity

	// OTP delivery. OTPProvider selects the channel: "log" (dev — prints the code)
	// or "hubtel" (real SMS for Ghana). Hubtel needs client id + secret + an
	// approved sender id.
	OTPProvider        string
	HubtelClientID     string
	HubtelClientSecret string
	HubtelSenderID     string
	HubtelEndpoint     string // optional override; defaults to Hubtel's send endpoint

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
		OTPTTLMin:     envInt("OTP_TTL_MIN", 10),
		AuthRequired:  os.Getenv("AUTH_REQUIRED") == "true",

		OTPProvider:        env("OTP_PROVIDER", "log"),
		HubtelClientID:     os.Getenv("HUBTEL_CLIENT_ID"),
		HubtelClientSecret: os.Getenv("HUBTEL_CLIENT_SECRET"),
		HubtelSenderID:     env("HUBTEL_SENDER_ID", "Oguaa"),
		HubtelEndpoint:     os.Getenv("HUBTEL_SMS_ENDPOINT"),

		UploadDir:     env("UPLOAD_DIR", "./uploads"),
		PublicBaseURL: os.Getenv("PUBLIC_API_URL"),

		PaystackSecretKey:  os.Getenv("PAYSTACK_SECRET_KEY"),
		PortalURL:          env("PUBLIC_PORTAL_URL", "http://localhost:5173"),
		PlatformFeePercent: envInt("PLATFORM_FEE_PERCENT", 5),
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
