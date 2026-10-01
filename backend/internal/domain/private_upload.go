package domain

import "context"

// PrivateRefPrefix marks a field value that points at a private upload
// ("private:<id>") rather than a public URL. Government ID and KYC documents
// must be stored this way (decision D6, contract K8).
const PrivateRefPrefix = "private:"

// Private upload purposes (free-form tags; unknown values are stored as
// "document").
const (
	PrivatePurposeAgentID     = "agent_id"
	PrivatePurposeBusinessKYC = "business_kyc"
	PrivatePurposeDocument    = "document"
)

// PrivateUpload is an identity or vetting document held encrypted in MongoDB
// (durable across Render redeploys, never on the public /uploads disk). Only
// its owner and vetting staff can read it back, and never through a URL.
type PrivateUpload struct {
	ID          string `json:"id" bson:"_id"`
	OwnerID     string `json:"-" bson:"ownerId"`
	Purpose     string `json:"purpose" bson:"purpose"`
	ContentType string `json:"contentType" bson:"contentType"`
	Size        int    `json:"size" bson:"size"`
	// KeyID names the key the ciphertext was sealed with, so keys can rotate.
	KeyID string `json:"-" bson:"keyId"`
	// Ciphertext is nonce‖AES-GCM(ciphertext+tag). Never serialised.
	Ciphertext []byte `json:"-" bson:"ciphertext,omitempty"`
	CreatedAt  string `json:"createdAt" bson:"createdAt"`
}

// Ref is the opaque reference clients store in document fields.
func (u PrivateUpload) Ref() string { return PrivateRefPrefix + u.ID }

// PrivateUploadRepository persists encrypted private uploads.
type PrivateUploadRepository interface {
	Insert(ctx context.Context, u PrivateUpload) error
	// ByID returns the upload including its ciphertext (or NotFound).
	ByID(ctx context.Context, id string) (*PrivateUpload, error)
	// ByOwner lists the owner's uploads WITHOUT ciphertext (metadata only).
	ByOwner(ctx context.Context, ownerID string) ([]PrivateUpload, error)
	// OwnerUsage reports how many documents the member has stored and their
	// total plaintext size in bytes, for the per-member quota.
	OwnerUsage(ctx context.Context, ownerID string) (count int, bytes int64, err error)
	// DeleteByOwner removes every upload the member owns.
	DeleteByOwner(ctx context.Context, ownerID string) error
}
