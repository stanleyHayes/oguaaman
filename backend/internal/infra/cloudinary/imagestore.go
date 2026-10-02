package cloudinary

import (
	"context"

	"github.com/oguaa/backend/internal/domain"
)

// imageStore adapts the client to domain.ImageStore for the news desk.
type imageStore struct{ c *Client }

// ImageStore returns the client as a domain.ImageStore, or nil when Cloudinary
// is not configured (c is nil), so callers can tell "no storage" apart.
func ImageStore(c *Client) domain.ImageStore {
	if c == nil {
		return nil
	}
	return imageStore{c: c}
}

// StoreImage uploads the bytes unchanged and returns the secure URL.
func (s imageStore) StoreImage(ctx context.Context, in domain.StoredImageInput) (string, error) {
	up, err := s.c.UploadImage(ctx, UploadImageInput{
		Folder: in.Folder, PublicID: in.PublicID, Data: in.Data, MIME: in.MIME, Tags: in.Tags, Context: in.Context,
	})
	if err != nil {
		return "", err
	}
	return up.SecureURL, nil
}
