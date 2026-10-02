package openai

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

func TestGenerateSendsTheSpecBodyAndDecodes(t *testing.T) {
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/images/generations" || r.Header.Get("Authorization") != "Bearer k" {
			t.Errorf("unexpected request %s %q", r.URL.Path, r.Header.Get("Authorization"))
		}
		_ = json.NewDecoder(r.Body).Decode(&got)
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"` + base64.StdEncoding.EncodeToString([]byte("RIFFwebp")) + `"}],"usage":{"input_tokens":120,"output_tokens":1600}}`))
	}))
	defer srv.Close()
	img := NewImages("k", "gpt-image-2.5-flare-2026-09-08", "medium").WithBaseURL(srv.URL)
	res, err := img.Generate(context.Background(), domain.ImageRequest{Prompt: "a calm shoreline"})
	if err != nil {
		t.Fatal(err)
	}
	if string(res.Data) != "RIFFwebp" || res.MIME != "image/webp" || res.InputTokens != 120 || res.OutputTokens != 1600 {
		t.Fatalf("result = %+v", res)
	}
	want := map[string]any{"model": "gpt-image-2.5-flare-2026-09-08", "prompt": "a calm shoreline", "size": "1536x1024", "quality": "medium",
		"output_format": "webp", "output_compression": float64(82), "background": "opaque", "moderation": "auto", "n": float64(1)}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %v, want %v", k, got[k], v)
		}
	}
}

func TestGenerateMapsModeration(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"message":"blocked","type":"image_generation_user_error","code":"moderation_blocked"}}`))
	}))
	defer srv.Close()
	_, err := NewImages("k", "m", "low").WithBaseURL(srv.URL).Generate(context.Background(), domain.ImageRequest{Prompt: "x"})
	if !errors.Is(err, domain.ErrImageModerationBlocked) {
		t.Fatalf("err = %v", err)
	}
}

func TestNoKeyMeansNoGenerator(t *testing.T) {
	if NewImages(" ", "m", "low") != nil || Generator(nil) != nil {
		t.Fatal("an empty key must give a nil generator")
	}
}
