package domain

import "context"

// OTP is a one-time verification code (spec §8.1). One active code per identifier
// (phone or email), keyed by identifier; the code is stored hashed.
type OTP struct {
	Identifier  string `bson:"_id"`
	CodeHash    string `bson:"codeHash"`
	DisplayName string `bson:"displayName,omitempty"`
	DateOfBirth string `bson:"dateOfBirth,omitempty"` // YYYY-MM-DD, carried from request to verify for the 18+ gate (spec §14.4)
	ExpiresAt   string `bson:"expiresAt"`
	CreatedAt   string `bson:"createdAt"`
}

// OtpRepository stores one active OTP per identifier (spec §8.1).
type OtpRepository interface {
	Upsert(ctx context.Context, o OTP) error
	Get(ctx context.Context, identifier string) (*OTP, error)
	Delete(ctx context.Context, identifier string) error
}
