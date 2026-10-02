package cloudinary

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func uploadClientFor(t *testing.T, h http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	c := New("demo", "key", "secret")
	c.apiBase = srv.URL
	c.now = func() time.Time { return time.Unix(1790000000, 0) }
	return c
}

// captureUpload answers an upload with reply after copying its form fields
// into form.
func captureUpload(form map[string]string, reply string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1_1/demo/image/upload" {
			http.Error(w, `{"error":{"message":"wrong endpoint"}}`, http.StatusNotFound)
			return
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			http.Error(w, `{"error":{"message":"not multipart"}}`, http.StatusBadRequest)
			return
		}
		for k, v := range r.MultipartForm.Value {
			form[k] = v[0]
		}
		_, _ = w.Write([]byte(reply))
	}
}

func TestUploadImageSignsEveryParameterAndSendsBytesAsADataURI(t *testing.T) {
	form := map[string]string{}
	c := uploadClientFor(t, captureUpload(form, `{"secure_url":"https://res.cloudinary.com/demo/image/upload/v17/oguaa/news/auto/news-1.webp","public_id":"oguaa/news/auto/news-1","version":17,"width":1536,"height":1024,"bytes":81234}`))
	img, err := c.UploadImage(context.Background(), UploadImageInput{
		Folder: "oguaa/news/auto", PublicID: "news-1", Data: []byte("RIFFwebp"), MIME: "image/webp",
		Tags: []string{"ai-generated", "oguaa-news"}, Context: map[string]string{"alt": "Fishing canoes | at dawn", "ai": "1", "provider": "openai"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if img.SecureURL == "" || img.PublicID != "oguaa/news/auto/news-1" || img.Version != 17 || img.Width != 1536 || img.Height != 1024 || img.Bytes != 81234 {
		t.Fatalf("uploaded = %+v", img)
	}
	if form["file"] != "data:image/webp;base64,UklGRndlYnA=" || form["api_key"] != "key" || form["overwrite"] != "true" || form["invalidate"] != "true" {
		t.Fatalf("form = %v", form)
	}
	if form["context"] != `ai=1|alt=Fishing canoes \| at dawn|provider=openai` || form["tags"] != "ai-generated,oguaa-news" {
		t.Fatalf("context/tags = %q %q", form["context"], form["tags"])
	}
	signed := map[string]string{}
	for _, k := range []string{"folder", "public_id", "overwrite", "invalidate", "timestamp", "tags", "context"} {
		signed[k] = form[k]
	}
	if form["signature"] != c.sign(signed) || form["timestamp"] != "1790000000" {
		t.Fatal("the signature must cover every upload parameter except file and api_key")
	}
}

func TestUploadImageFromSourceURL(t *testing.T) {
	var file string
	c := uploadClientFor(t, func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseMultipartForm(1 << 20)
		file = r.FormValue("file")
		_, _ = w.Write([]byte(`{"secure_url":"https://res.cloudinary.com/demo/x.jpg","public_id":"oguaa/ads/ad_1/creative-1"}`))
	})
	if _, err := c.UploadImage(context.Background(), UploadImageInput{Folder: "oguaa/ads/ad_1", PublicID: "creative-1", SourceURL: "https://res.cloudinary.com/demo/image/upload/m.jpg"}); err != nil {
		t.Fatal(err)
	}
	if file != "https://res.cloudinary.com/demo/image/upload/m.jpg" {
		t.Fatalf("file = %q", file)
	}
}

func TestUploadImageRefusals(t *testing.T) {
	var nilClient *Client
	if _, err := nilClient.UploadImage(context.Background(), UploadImageInput{}); !errors.Is(err, ErrMediaUnavailable) {
		t.Fatalf("nil client err = %v", err)
	}
	calls := 0
	c := uploadClientFor(t, func(w http.ResponseWriter, _ *http.Request) { calls++ })
	ok := UploadImageInput{Folder: "oguaa/news/auto", PublicID: "news-1", Data: []byte("x"), MIME: "image/png"}
	cases := map[string]func(*UploadImageInput){
		"member folder":     func(in *UploadImageInput) { in.Folder = "oguaa/m/abc" },
		"member root":       func(in *UploadImageInput) { in.Folder = "oguaa/m" },
		"outside oguaa":     func(in *UploadImageInput) { in.Folder = "other/app" },
		"traversal":         func(in *UploadImageInput) { in.Folder = "oguaa/../m" },
		"bad public id":     func(in *UploadImageInput) { in.PublicID = "a/b" },
		"no public id":      func(in *UploadImageInput) { in.PublicID = "" },
		"both sources":      func(in *UploadImageInput) { in.SourceURL = "https://x.test/a.png" },
		"no source":         func(in *UploadImageInput) { in.Data = nil },
		"gif":               func(in *UploadImageInput) { in.MIME = "image/gif" },
		"too big":           func(in *UploadImageInput) { in.Data = make([]byte, MaxImageBytes+1) },
		"http source":       func(in *UploadImageInput) { in.Data, in.SourceURL = nil, "http://x.test/a.png" },
		"tag with comma":    func(in *UploadImageInput) { in.Tags = []string{"a,b"} },
		"context key space": func(in *UploadImageInput) { in.Context = map[string]string{"bad key": "v"} },
	}
	for name, edit := range cases {
		in := ok
		edit(&in)
		if _, err := c.UploadImage(context.Background(), in); err == nil {
			t.Errorf("%s: upload should be refused", name)
		}
	}
	if calls != 0 {
		t.Fatalf("refused uploads must not reach Cloudinary (%d calls)", calls)
	}
}

func TestUploadImageReportsCloudinaryErrors(t *testing.T) {
	c := uploadClientFor(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"message":"Invalid Signature"}}`))
	})
	_, err := c.UploadImage(context.Background(), UploadImageInput{Folder: "oguaa/news/auto", PublicID: "n", Data: []byte("x"), MIME: "image/jpeg"})
	if err == nil || !strings.Contains(err.Error(), "Invalid Signature") {
		t.Fatalf("err = %v", err)
	}
}
