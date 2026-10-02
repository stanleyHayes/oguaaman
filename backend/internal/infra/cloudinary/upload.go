package cloudinary

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"
)

// ── server-side image upload (spec §1.3) ─────────────────────────────────────
//
// The news desk uploads the cover images it generates, and the ads flow copies
// approved creatives into its own folder so a member's media erasure can never
// break an ad record. Uploads are signed with the account secret and never go
// under oguaa/m/ (members' own folders, which erasure deletes).

// ErrMediaUnavailable is returned by UploadImage on a nil client: Cloudinary
// is not configured.
var ErrMediaUnavailable = errors.New("media storage is not configured")

const (
	uploadTimeout     = 60 * time.Second
	maxUploadReply    = 1 << 20
	maxPublicIDLen    = 120
	serverFolderRoot  = "oguaa/"
	memberFolderRoot  = "oguaa/m/"
	memberFolderExact = "oguaa/m"
)

// uploadMIMEs are the image types UploadImage sends as raw bytes.
var uploadMIMEs = []string{"image/webp", "image/png", "image/jpeg"}

var (
	folderRe   = regexp.MustCompile(`^[a-z0-9][a-z0-9_\-]*(/[a-zA-Z0-9][a-zA-Z0-9_\-]*)*$`)
	publicIDRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_\-]*$`)
	tagRe      = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_\-]*$`)
	ctxKeyRe   = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]*$`)
)

// UploadImageInput is one server-side image upload.
type UploadImageInput struct {
	Folder    string            // "oguaa/news/auto" | "oguaa/ads/<campaignId>"  (never under oguaa/m/)
	PublicID  string            // article id / "creative-<n>"
	Data      []byte            // raw bytes, sent as data:<MIME>;base64,…   (exactly one of Data/SourceURL)
	MIME      string            // "image/webp" | "image/png" | "image/jpeg"
	SourceURL string            // https URL Cloudinary fetches itself (used to copy ad creatives)
	Tags      []string          // e.g. ["ai-generated","oguaa-news"]
	Context   map[string]string // alt, ai=1, provider, model
}

// UploadedImage is what Cloudinary stored.
type UploadedImage struct {
	SecureURL, PublicID string
	Version             int64
	Width, Height       int
	Bytes               int64
}

// UploadImage stores one image with a signed upload (overwrite and CDN
// invalidation on, so re-running a job replaces its image in place).
func (c *Client) UploadImage(ctx context.Context, in UploadImageInput) (UploadedImage, error) {
	if c == nil {
		return UploadedImage{}, ErrMediaUnavailable
	}
	file, err := checkUpload(in)
	if err != nil {
		return UploadedImage{}, err
	}
	params := map[string]string{
		"folder":     in.Folder,
		"public_id":  in.PublicID,
		"overwrite":  "true",
		"invalidate": "true",
		"timestamp":  strconv.FormatInt(c.now().Unix(), 10),
	}
	if len(in.Tags) > 0 {
		params["tags"] = strings.Join(in.Tags, ",")
	}
	if len(in.Context) > 0 {
		params["context"] = contextParam(in.Context)
	}
	body, contentType, err := uploadForm(params, c.apiKey, c.sign(params), file)
	if err != nil {
		return UploadedImage{}, err
	}
	endpoint := fmt.Sprintf("%s/v1_1/%s/image/upload", c.apiBase, url.PathEscape(c.cloudName))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, body)
	if err != nil {
		return UploadedImage{}, err
	}
	req.Header.Set("Content-Type", contentType)
	resp, err := c.uploadClient().Do(req)
	if err != nil {
		return UploadedImage{}, fmt.Errorf("cloudinary: upload failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	return readUpload(resp)
}

func (c *Client) uploadClient() *http.Client {
	if c.upload != nil {
		return c.upload
	}
	return &http.Client{Timeout: uploadTimeout}
}

// checkUpload validates the input and returns the `file` form value.
func checkUpload(in UploadImageInput) (string, error) {
	if err := checkUploadTarget(in.Folder, in.PublicID); err != nil {
		return "", err
	}
	if err := checkUploadMeta(in.Tags, in.Context); err != nil {
		return "", err
	}
	switch {
	case len(in.Data) > 0 && in.SourceURL != "":
		return "", errors.New("cloudinary: give either Data or SourceURL, not both")
	case len(in.Data) > 0:
		if !slices.Contains(uploadMIMEs, in.MIME) {
			return "", fmt.Errorf("cloudinary: unsupported image type %q", in.MIME)
		}
		if len(in.Data) > MaxImageBytes {
			return "", fmt.Errorf("cloudinary: image is %d bytes, over the %d limit", len(in.Data), MaxImageBytes)
		}
		return "data:" + in.MIME + ";base64," + base64.StdEncoding.EncodeToString(in.Data), nil
	case in.SourceURL != "":
		u, err := url.Parse(in.SourceURL)
		if err != nil || u.Scheme != "https" || u.Host == "" {
			return "", errors.New("cloudinary: SourceURL must be an https URL")
		}
		return in.SourceURL, nil
	}
	return "", errors.New("cloudinary: nothing to upload")
}

// checkUploadMeta refuses tags and context keys Cloudinary would misparse.
func checkUploadMeta(tags []string, meta map[string]string) error {
	for _, t := range tags {
		if !tagRe.MatchString(t) {
			return fmt.Errorf("cloudinary: invalid tag %q", t)
		}
	}
	for k := range meta {
		if !ctxKeyRe.MatchString(k) {
			return fmt.Errorf("cloudinary: invalid context key %q", k)
		}
	}
	return nil
}

// checkUploadTarget keeps server uploads under oguaa/ and out of the member
// folders erasure deletes.
func checkUploadTarget(folder, publicID string) error {
	if !strings.HasPrefix(folder, serverFolderRoot) || !folderRe.MatchString(folder) || strings.Contains(folder, "..") {
		return fmt.Errorf("cloudinary: invalid upload folder %q", folder)
	}
	if folder == memberFolderExact || strings.HasPrefix(folder, memberFolderRoot) {
		return fmt.Errorf("cloudinary: server uploads may not go under %s", memberFolderRoot)
	}
	if len(publicID) > maxPublicIDLen || !publicIDRe.MatchString(publicID) {
		return fmt.Errorf("cloudinary: invalid public id %q", publicID)
	}
	return nil
}

// contextParam encodes context metadata as Cloudinary expects:
// key=value pairs joined by "|", with "=" and "|" in values escaped.
func contextParam(ctx map[string]string) string {
	keys := make([]string, 0, len(ctx))
	for k := range ctx {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	esc := strings.NewReplacer(`=`, `\=`, `|`, `\|`)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+"="+esc.Replace(ctx[k]))
	}
	return strings.Join(parts, "|")
}

// uploadForm builds the multipart body: the signed parameters, api_key,
// signature and the file.
func uploadForm(params map[string]string, apiKey, signature, file string) (*bytes.Buffer, string, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	fields := make([][2]string, 0, len(keys)+3)
	for _, k := range keys {
		fields = append(fields, [2]string{k, params[k]})
	}
	fields = append(fields, [2]string{"api_key", apiKey}, [2]string{"signature", signature}, [2]string{"file", file})
	for _, f := range fields {
		if err := mw.WriteField(f[0], f[1]); err != nil {
			return nil, "", err
		}
	}
	if err := mw.Close(); err != nil {
		return nil, "", err
	}
	return &buf, mw.FormDataContentType(), nil
}

// readUpload decodes Cloudinary's reply to an upload.
func readUpload(resp *http.Response) (UploadedImage, error) {
	var out struct {
		SecureURL string `json:"secure_url"`
		PublicID  string `json:"public_id"`
		Version   int64  `json:"version"`
		Width     int    `json:"width"`
		Height    int    `json:"height"`
		Bytes     int64  `json:"bytes"`
		Error     struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	decodeErr := json.NewDecoder(io.LimitReader(resp.Body, maxUploadReply)).Decode(&out)
	if resp.StatusCode/100 != 2 {
		return UploadedImage{}, fmt.Errorf("cloudinary: upload returned %s: %s", resp.Status, out.Error.Message)
	}
	if decodeErr != nil {
		return UploadedImage{}, fmt.Errorf("cloudinary: unreadable upload reply: %w", decodeErr)
	}
	if out.SecureURL == "" {
		return UploadedImage{}, errors.New("cloudinary: upload reply carried no secure_url")
	}
	return UploadedImage{SecureURL: out.SecureURL, PublicID: out.PublicID, Version: out.Version, Width: out.Width, Height: out.Height, Bytes: out.Bytes}, nil
}
