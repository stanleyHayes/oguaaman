// Package openai holds the OpenAI Images API client the news desk uses for
// cover illustrations (spec §2.8). It implements domain.ImageGenerator.
package openai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

const (
	defaultBaseURL   = "https://api.openai.com/v1"
	generateTimeout  = 150 * time.Second
	maxImageResponse = 25 << 20
	defaultSize      = "1536x1024"
	defaultFormat    = "webp"
	webpCompression  = 82
	codeModeration   = "moderation_blocked"
	providerOpenAI   = "openai"
)

// Images calls POST /v1/images/generations.
type Images struct {
	key, model, quality, baseURL string
	http                         *http.Client
}

// NewImages returns a generator, or nil when no API key is set (a nil
// generator means the desk always uses the branded cover).
func NewImages(apiKey, model, quality string) *Images {
	if strings.TrimSpace(apiKey) == "" {
		return nil
	}
	return &Images{key: apiKey, model: model, quality: quality, baseURL: defaultBaseURL, http: &http.Client{}}
}

// WithBaseURL points the client at another API base (tests).
func (c *Images) WithBaseURL(base string) *Images {
	c.baseURL = strings.TrimRight(base, "/")
	return c
}

// Generator returns c as a domain.ImageGenerator, or nil when c is nil, so a
// missing key never becomes a non-nil interface holding a nil pointer.
func Generator(c *Images) domain.ImageGenerator {
	if c == nil {
		return nil
	}
	return c
}

// Provider names the image provider.
func (c *Images) Provider() string { return providerOpenAI }

type generateRequest struct {
	Model             string `json:"model"`
	Prompt            string `json:"prompt"`
	Size              string `json:"size"`
	Quality           string `json:"quality,omitempty"`
	OutputFormat      string `json:"output_format"`
	OutputCompression int    `json:"output_compression"`
	Background        string `json:"background"`
	Moderation        string `json:"moderation"`
	N                 int    `json:"n"`
}

type generateResponse struct {
	Data []struct {
		B64JSON string `json:"b64_json"`
	} `json:"data"`
	Usage struct {
		InputTokens  int64 `json:"input_tokens"`
		OutputTokens int64 `json:"output_tokens"`
	} `json:"usage"`
	Error *apiError `json:"error"`
}

type apiError struct {
	Message string `json:"message"`
	Type    string `json:"type"`
	Code    string `json:"code"`
}

// Generate draws one image. A moderation refusal is domain.ErrImageModerationBlocked.
func (c *Images) Generate(ctx context.Context, r domain.ImageRequest) (domain.ImageResult, error) {
	if c == nil {
		return domain.ImageResult{}, errors.New("openai: images not configured")
	}
	ctx, cancel := context.WithTimeout(ctx, generateTimeout)
	defer cancel()
	body, err := json.Marshal(c.request(r))
	if err != nil {
		return domain.ImageResult{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/images/generations", bytes.NewReader(body))
	if err != nil {
		return domain.ImageResult{}, err
	}
	req.Header.Set("Authorization", "Bearer "+c.key)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return domain.ImageResult{}, fmt.Errorf("openai: images request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	return c.decode(resp, r)
}

func (c *Images) request(r domain.ImageRequest) generateRequest {
	size, format, quality := r.Size, r.Format, r.Quality
	if size == "" {
		size = defaultSize
	}
	if format == "" {
		format = defaultFormat
	}
	if quality == "" {
		quality = c.quality
	}
	return generateRequest{
		Model: c.model, Prompt: r.Prompt, Size: size, Quality: quality, OutputFormat: format,
		OutputCompression: webpCompression, Background: "opaque", Moderation: "auto", N: 1,
	}
}

func (c *Images) decode(resp *http.Response, r domain.ImageRequest) (domain.ImageResult, error) {
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxImageResponse))
	if err != nil {
		return domain.ImageResult{}, err
	}
	var out generateResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return domain.ImageResult{}, fmt.Errorf("openai: images returned %d with an unreadable body", resp.StatusCode)
	}
	if out.Error != nil && (out.Error.Code == codeModeration || out.Error.Type == codeModeration) {
		return domain.ImageResult{}, domain.ErrImageModerationBlocked
	}
	if resp.StatusCode != http.StatusOK {
		msg := ""
		if out.Error != nil {
			msg = out.Error.Code + ": " + out.Error.Message
		}
		return domain.ImageResult{}, fmt.Errorf("openai: images returned %d %s", resp.StatusCode, msg)
	}
	if len(out.Data) == 0 || out.Data[0].B64JSON == "" {
		return domain.ImageResult{}, errors.New("openai: images returned no image")
	}
	data, err := base64.StdEncoding.DecodeString(out.Data[0].B64JSON)
	if err != nil {
		return domain.ImageResult{}, fmt.Errorf("openai: undecodable image: %w", err)
	}
	format := r.Format
	if format == "" {
		format = defaultFormat
	}
	return domain.ImageResult{
		Data: data, MIME: "image/" + format, Model: c.model,
		InputTokens: out.Usage.InputTokens, OutputTokens: out.Usage.OutputTokens,
	}, nil
}
