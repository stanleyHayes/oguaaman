// Package cloudinary signs direct-to-Cloudinary uploads and deletes a member's
// media when they erase their account (contract K9). It is only built when the
// Cloudinary API secret is configured; clients then stop using the unsigned
// preset, which anyone who unpacked the app could have used to upload.
package cloudinary

import (
	"context"
	"crypto/hmac"
	"crypto/sha1" //nolint:gosec // Cloudinary's upload signature scheme is SHA-1 by specification.
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"
)

const (
	defaultAPIBase = "https://api.cloudinary.com"
	// imageFormats / videoFormats are the formats a signed upload may carry.
	imageFormats = "jpg,png,webp"
	videoFormats = "mp4,mov,webm"
	// MaxImageBytes / MaxVideoBytes are advisory limits clients enforce before
	// uploading (Cloudinary's own account limits still apply).
	MaxImageBytes = 8 << 20
	MaxVideoBytes = 50 << 20
	// maxDeletePasses bounds the delete-by-prefix loop (each pass removes up to
	// 1000 assets).
	maxDeletePasses = 10
	// listPageSize / maxListPages bound the listing of a member's folder.
	listPageSize = "500"
	maxListPages = 20
	// maxDeleteIDs is how many public ids one Admin API delete accepts.
	maxDeleteIDs = 100
)

// Client signs uploads and deletes media for one Cloudinary account.
type Client struct {
	cloudName, apiKey, apiSecret string
	apiBase                      string
	http                         *http.Client
	now                          func() time.Time
}

// New returns a client, or nil when any credential is missing.
func New(cloudName, apiKey, apiSecret string) *Client {
	if strings.TrimSpace(cloudName) == "" || strings.TrimSpace(apiKey) == "" || strings.TrimSpace(apiSecret) == "" {
		return nil
	}
	return &Client{
		cloudName: cloudName, apiKey: apiKey, apiSecret: apiSecret, apiBase: defaultAPIBase,
		http: &http.Client{Timeout: 20 * time.Second}, now: time.Now,
	}
}

// Signature is everything a client needs for one signed upload. Post the
// file to UploadURL with api_key, timestamp, signature, folder and
// allowed_formats exactly as given.
type Signature struct {
	CloudName      string `json:"cloudName"`
	APIKey         string `json:"apiKey"`
	Timestamp      int64  `json:"timestamp"`
	Signature      string `json:"signature"`
	Folder         string `json:"folder"`
	AllowedFormats string `json:"allowedFormats"`
	MaxFileSize    int64  `json:"maxFileSize"`
	ResourceType   string `json:"resourceType"`
	UploadURL      string `json:"uploadUrl"`
}

// SignUpload signs an upload into the member's own folder. resourceType is
// "image" (default) or "video".
func (c *Client) SignUpload(memberID, resourceType string) Signature {
	formats, limit := imageFormats, int64(MaxImageBytes)
	if resourceType == "video" {
		formats, limit = videoFormats, int64(MaxVideoBytes)
	} else {
		resourceType = "image"
	}
	ts := c.now().Unix()
	folder := c.MemberFolder(memberID)
	params := map[string]string{
		"allowed_formats": formats,
		"folder":          folder,
		"timestamp":       strconv.FormatInt(ts, 10),
	}
	return Signature{
		CloudName: c.cloudName, APIKey: c.apiKey, Timestamp: ts, Signature: c.sign(params),
		Folder: folder, AllowedFormats: formats, MaxFileSize: limit, ResourceType: resourceType,
		UploadURL: fmt.Sprintf("%s/v1_1/%s/%s/upload", c.apiBase, url.PathEscape(c.cloudName), resourceType),
	}
}

// sign implements Cloudinary's scheme: parameters sorted by name, joined as
// k=v with '&', the API secret appended, SHA-1, hex.
func (c *Client) sign(params map[string]string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+"="+params[k])
	}
	sum := sha1.Sum([]byte(strings.Join(parts, "&") + c.apiSecret)) //nolint:gosec // required by Cloudinary
	return hex.EncodeToString(sum[:])
}

// MemberFolder is the member's upload folder. It is derived with an HMAC so
// it identifies the member to us (for erasure) without revealing who they are
// in public asset URLs.
func (c *Client) MemberFolder(memberID string) string {
	mac := hmac.New(sha256.New, []byte(c.apiSecret))
	mac.Write([]byte("oguaa-media:" + memberID))
	return "oguaa/m/" + hex.EncodeToString(mac.Sum(nil))[:24]
}

// DeleteMemberMedia deletes every image and video in the member's folder,
// except the assets a string in keep points at: content that outlives the
// member's erasure (an institution's page, a published article) still shows
// them. With nothing to keep it deletes by prefix (Admin API); otherwise it
// lists the folder and deletes the other assets by public id.
func (c *Client) DeleteMemberMedia(ctx context.Context, memberID string, keep []string) error {
	prefix := c.MemberFolder(memberID) + "/"
	var kept []string
	for _, ref := range keep {
		if strings.Contains(ref, prefix) {
			kept = append(kept, ref)
		}
	}
	for _, rt := range []string{"image", "video"} {
		var err error
		if len(kept) == 0 {
			err = c.deleteByPrefix(ctx, rt, prefix)
		} else {
			err = c.deleteUnkept(ctx, rt, prefix, kept)
		}
		if err != nil {
			return err
		}
	}
	return nil
}

func (c *Client) deleteByPrefix(ctx context.Context, resourceType, prefix string) error {
	return c.deleteUntilDone(ctx, c.resourcesURL(resourceType, url.Values{"prefix": {prefix}}),
		fmt.Sprintf("%s deletion under %s", resourceType, prefix))
}

// deleteUnkept deletes the assets under prefix that no kept string names. A
// public id is part of every delivery URL of its asset.
func (c *Client) deleteUnkept(ctx context.Context, resourceType, prefix string, kept []string) error {
	ids, err := c.listByPrefix(ctx, resourceType, prefix)
	if err != nil {
		return err
	}
	doomed := slices.DeleteFunc(ids, func(id string) bool {
		return slices.ContainsFunc(kept, func(ref string) bool { return strings.Contains(ref, id) })
	})
	for batch := range slices.Chunk(doomed, maxDeleteIDs) {
		endpoint := c.resourcesURL(resourceType, url.Values{"public_ids[]": batch})
		if err := c.deleteUntilDone(ctx, endpoint, fmt.Sprintf("%s deletion of %d assets", resourceType, len(batch))); err != nil {
			return err
		}
	}
	return nil
}

// listByPrefix returns the public id of every asset of resourceType under
// prefix, following the listing's cursor.
func (c *Client) listByPrefix(ctx context.Context, resourceType, prefix string) ([]string, error) {
	var ids []string
	cursor := ""
	for range maxListPages {
		q := url.Values{"prefix": {prefix}, "max_results": {listPageSize}}
		if cursor != "" {
			q.Set("next_cursor", cursor)
		}
		var page struct {
			Resources []struct {
				PublicID string `json:"public_id"`
			} `json:"resources"`
			NextCursor string `json:"next_cursor"`
		}
		if err := c.admin(ctx, http.MethodGet, c.resourcesURL(resourceType, q), &page); err != nil {
			return nil, err
		}
		for _, r := range page.Resources {
			ids = append(ids, r.PublicID)
		}
		if page.NextCursor == "" {
			return ids, nil
		}
		cursor = page.NextCursor
	}
	return nil, fmt.Errorf("cloudinary: %s listing under %s still incomplete after %d pages", resourceType, prefix, maxListPages)
}

// resourcesURL is the Admin API endpoint for uploaded assets of one type.
func (c *Client) resourcesURL(resourceType string, q url.Values) string {
	return fmt.Sprintf("%s/v1_1/%s/resources/%s/upload?%s", c.apiBase, url.PathEscape(c.cloudName), resourceType, q.Encode())
}

// deleteUntilDone repeats a delete while Cloudinary reports it partial.
func (c *Client) deleteUntilDone(ctx context.Context, endpoint, what string) error {
	for range maxDeletePasses {
		var out struct {
			Partial bool `json:"partial"`
		}
		if err := c.admin(ctx, http.MethodDelete, endpoint, &out); err != nil || !out.Partial {
			return err
		}
	}
	return fmt.Errorf("cloudinary: %s still partial after %d passes", what, maxDeletePasses)
}

// admin makes one authenticated Admin API call and decodes its JSON reply.
func (c *Client) admin(ctx context.Context, method, endpoint string, out any) error {
	req, err := http.NewRequestWithContext(ctx, method, endpoint, nil)
	if err != nil {
		return err
	}
	req.SetBasicAuth(c.apiKey, c.apiSecret)
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("cloudinary: %s returned %s", strings.ToLower(method), resp.Status)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
