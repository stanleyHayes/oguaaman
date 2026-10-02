package domain

import (
	"context"
	"errors"
)

// ── image generation and storage (spec §2.8) ─────────────────────────────────
//
// Cover illustrations come from an image model behind ImageGenerator so the
// provider (OpenAI today) can be swapped without touching the news desk, and
// are stored through ImageStore (Cloudinary).

// ImageRequest is one image to generate.
type ImageRequest struct {
	Prompt  string
	Size    string // e.g. "1536x1024"
	Quality string // provider quality, e.g. "medium"
	Format  string // "webp" | "png" | "jpeg"
}

// ImageResult is one generated image and its token usage (for cost).
type ImageResult struct {
	Data                      []byte
	MIME                      string
	Model                     string
	InputTokens, OutputTokens int64
}

// ErrImageModerationBlocked is returned when the provider's safety system
// refused the prompt. The desk never retries with a changed prompt.
var ErrImageModerationBlocked = errors.New("image_moderation_blocked")

// ImageGenerator draws an image from a prompt.
type ImageGenerator interface {
	Generate(ctx context.Context, r ImageRequest) (ImageResult, error)
	Provider() string // "openai"
}

// StoredImageInput is one server-side image upload to durable storage.
type StoredImageInput struct {
	Folder   string // never under a member folder
	PublicID string
	Data     []byte
	MIME     string
	Tags     []string
	Context  map[string]string
}

// ImageStore keeps generated images and returns their public https URL.
type ImageStore interface {
	StoreImage(ctx context.Context, in StoredImageInput) (secureURL string, err error)
}
