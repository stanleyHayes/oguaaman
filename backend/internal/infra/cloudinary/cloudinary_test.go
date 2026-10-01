package cloudinary

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// The signing scheme reproduces Cloudinary's documented example.
func TestSignMatchesCloudinaryExample(t *testing.T) {
	c := &Client{apiSecret: "abcd"}
	got := c.sign(map[string]string{
		"timestamp": "1315060510",
		"public_id": "sample_image",
		"eager":     "w_400,h_300,c_pad|w_260,h_200,c_crop",
	})
	if want := "bfd09f95f331f558cbd1320e67aa8d488770583e"; got != want {
		t.Fatalf("signature = %s, want %s", got, want)
	}
}

func TestSignUploadIsScopedToAnOpaqueMemberFolder(t *testing.T) {
	if New("demo", "key", "") != nil {
		t.Fatal("a client without a secret must not be built")
	}
	c := New("demo", "key", "secret")
	c.now = func() time.Time { return time.Unix(1700000000, 0) }
	sig := c.SignUpload("usr-ama-mensah-123", "")
	if sig.ResourceType != "image" || sig.AllowedFormats != imageFormats || sig.Timestamp != 1700000000 {
		t.Fatalf("signature = %+v", sig)
	}
	if strings.Contains(sig.Folder, "ama") || !strings.HasPrefix(sig.Folder, "oguaa/m/") {
		t.Errorf("folder %q must be opaque (member ids embed names)", sig.Folder)
	}
	if sig.Folder != c.SignUpload("usr-ama-mensah-123", "video").Folder {
		t.Error("the member folder must be stable, or erasure cannot find it")
	}
	want := c.sign(map[string]string{"allowed_formats": imageFormats, "folder": sig.Folder, "timestamp": "1700000000"})
	if sig.Signature != want {
		t.Error("signature does not cover exactly allowed_formats, folder and timestamp")
	}
	if v := c.SignUpload("m", "video"); v.AllowedFormats != videoFormats || !strings.HasSuffix(v.UploadURL, "/video/upload") {
		t.Errorf("video signature = %+v", v)
	}
}

func TestDeleteMemberMediaDeletesTheFolderForEveryResourceType(t *testing.T) {
	var mu sync.Mutex
	var seen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, pass, ok := r.BasicAuth()
		if r.Method != http.MethodDelete || !ok || user != "key" || pass != "secret" {
			http.Error(w, "bad request", http.StatusUnauthorized)
			return
		}
		mu.Lock()
		seen = append(seen, r.URL.Path+"?"+r.URL.Query().Get("prefix"))
		mu.Unlock()
		_, _ = w.Write([]byte(`{"deleted":{},"partial":false}`))
	}))
	defer srv.Close()

	c := New("demo", "key", "secret")
	c.apiBase = srv.URL
	// A kept reference to another member's folder does not protect this one.
	other := "https://res.cloudinary.com/demo/image/upload/v1/" + c.MemberFolder("m2") + "/x.jpg"
	if err := c.DeleteMemberMedia(context.Background(), "m1", []string{other}); err != nil {
		t.Fatal(err)
	}
	folder := c.MemberFolder("m1") + "/"
	want := []string{
		"/v1_1/demo/resources/image/upload?" + folder,
		"/v1_1/demo/resources/video/upload?" + folder,
	}
	if strings.Join(seen, "|") != strings.Join(want, "|") {
		t.Errorf("requests = %v, want %v", seen, want)
	}
}

// R16: assets still shown by content that outlives the erasure are kept; the
// rest of the folder is listed (following the cursor) and deleted by id.
func TestDeleteMemberMediaKeepsAssetsRetainedContentShows(t *testing.T) {
	c := New("demo", "key", "secret")
	folder := c.MemberFolder("m1")
	var mu sync.Mutex
	deleted := map[string][]string{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if user, pass, ok := r.BasicAuth(); !ok || user != "key" || pass != "secret" {
			http.Error(w, "unauthorised", http.StatusUnauthorized)
			return
		}
		rt := strings.Split(r.URL.Path, "/")[4] // /v1_1/demo/resources/<type>/upload
		q := r.URL.Query()
		switch {
		case r.Method == http.MethodGet && rt == "image" && q.Get("next_cursor") == "":
			_, _ = w.Write([]byte(`{"resources":[{"public_id":"` + folder + `/crest"},{"public_id":"` + folder + `/selfie"}],"next_cursor":"p2"}`))
		case r.Method == http.MethodGet && rt == "image":
			_, _ = w.Write([]byte(`{"resources":[{"public_id":"` + folder + `/cover"}]}`))
		case r.Method == http.MethodGet:
			_, _ = w.Write([]byte(`{"resources":[{"public_id":"` + folder + `/clip"}]}`))
		case r.Method == http.MethodDelete && q.Get("prefix") == "":
			mu.Lock()
			deleted[rt] = append(deleted[rt], q["public_ids[]"]...)
			mu.Unlock()
			_, _ = w.Write([]byte(`{"deleted":{},"partial":false}`))
		default:
			t.Errorf("unexpected %s %s", r.Method, r.URL)
			http.Error(w, "unexpected", http.StatusBadRequest)
		}
	}))
	defer srv.Close()
	c.apiBase = srv.URL

	keep := []string{
		"https://res.cloudinary.com/demo/image/upload/v17/" + folder + "/crest.png",
		"Our new hall ![](https://res.cloudinary.com/demo/image/upload/c_fill,w_800/v17/" + folder + "/cover.jpg) opened today.",
	}
	if err := c.DeleteMemberMedia(context.Background(), "m1", keep); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(deleted["image"], ","); got != folder+"/selfie" {
		t.Errorf("deleted images = %q, want only the unreferenced selfie", got)
	}
	if got := strings.Join(deleted["video"], ","); got != folder+"/clip" {
		t.Errorf("deleted videos = %q, want the unreferenced clip", got)
	}
}
