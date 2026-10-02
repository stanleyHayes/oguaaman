package cloudinary

import "context"

// adsFolderRoot holds copies of approved ad creatives, one folder per
// campaign, outside the member folders that account erasure deletes.
const adsFolderRoot = "oguaa/ads/"

// CopyAdImage copies an approved ad's creative image into
// oguaa/ads/<campaignID>/<publicID> (Cloudinary fetches sourceURL itself) and
// returns the copy's secure URL. It implements service.AdImageCopier. A nil
// client returns ErrMediaUnavailable.
func (c *Client) CopyAdImage(ctx context.Context, campaignID, publicID, sourceURL string) (string, error) {
	img, err := c.UploadImage(ctx, UploadImageInput{
		Folder:    adsFolderRoot + campaignID,
		PublicID:  publicID,
		SourceURL: sourceURL,
		Tags:      []string{"oguaa-ad"},
		Context:   map[string]string{"campaign": campaignID},
	})
	if err != nil {
		return "", err
	}
	return img.SecureURL, nil
}

// CloudName is the account's cloud name ("" for a nil client): ad creatives
// must be uploaded to it.
func (c *Client) CloudName() string {
	if c == nil {
		return ""
	}
	return c.cloudName
}
