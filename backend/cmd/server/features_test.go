package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/oguaa/backend/internal/config"
	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/infra/cloudinary"
	httpx "github.com/oguaa/backend/internal/infra/http"
	"github.com/oguaa/backend/internal/service"
)

// unreachableDB is a database handle whose server never answers, so every
// read fails fast and the services fall back to their defaults.
func unreachableDB(t *testing.T) *mongo.Database {
	t.Helper()
	client, err := mongo.Connect(options.Client().ApplyURI("mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=100&connectTimeoutMS=100"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Disconnect(context.Background()) })
	return client.Database("oguaa_wiring_test")
}

// cancelled is a context that has already ended, so index creation and
// settings reads give up at once.
func cancelled() context.Context {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	return ctx
}

func quietLog() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

// With no keys, everything new is wired but switched off: the desk serves
// settings but researches nothing, covers are branded, and ads can't serve.
func TestNewFeatures_withoutKeysEverythingIsOff(t *testing.T) {
	f := newFeatures(cancelled(), featureInputs{
		db: unreachableDB(t), cfg: config.Config{PortalURL: "https://citizen.oguaaman.test"}, log: quietLog(),
		paystack: service.DisabledPaystack{},
	})
	if f.settings == nil || f.elections == nil || f.desk == nil || f.ads == nil || f.serving == nil || f.library == nil || f.report == nil || f.campaigns == nil ||
		f.retained == nil {
		t.Fatalf("features not all wired: %+v", f)
	}
	if f.desk.Researching() {
		t.Error("the research worker must not run without ANTHROPIC_API_KEY")
	}
	if f.serving.TokenSecretConfigured() {
		t.Error("serving must report no ADS_TOKEN_SECRET")
	}
	view := f.desk.SettingsView(cancelled())
	if view.Keys.Anthropic || view.Keys.OpenAI || view.Keys.Cloudinary {
		t.Errorf("keys = %+v, want all false", view.Keys)
	}
	if view.LongformEnabled || view.ImagesEnabled {
		t.Errorf("defaults must keep long-form and images off: %+v", view.NewsDeskSettings)
	}
	if set := f.ads.Settings(cancelled()); set.AdsEnabled || set.PoliticalEnabled || set.AppDeliveryEnabled {
		t.Errorf("ads must ship off: %+v", set)
	}
	d := f.handlerDeps(httpx.HandlerDeps{PortalURL: "keep"})
	if d.PortalURL != "keep" || d.NewsDesk != f.desk || d.Ads != f.ads || d.AdServing.Serving != f.serving ||
		d.AdServing.Library != f.library || d.AdServing.Report != f.report || d.Foundations.Settings != f.settings || d.Foundations.Elections != f.elections {
		t.Fatalf("handler deps = %+v", d)
	}
}

// With the keys set, the desk researches, AI covers have a generator and a
// store (the shared Cloudinary client), and serving can sign tokens.
func TestNewFeatures_withKeys(t *testing.T) {
	media := cloudinary.New("demo", "key", "secret")
	f := newFeatures(cancelled(), featureInputs{
		db: unreachableDB(t), log: quietLog(), paystack: service.SimulatedPaystack{Log: quietLog()}, media: media,
		cfg: config.Config{
			AnthropicKey: "sk-ant-test", OpenAIKey: "sk-openai-test", OpenAIImageModel: "gpt-image-2.5-flare-2026-09-08",
			AdsTokenSecret: "0123456789abcdef0123456789abcdef", PublicBaseURL: "https://api.oguaaman.test",
		},
		sources: []service.ResearchSource{{Name: "MyJoyOnline", URL: "https://www.myjoyonline.com/feed/"}},
	})
	if !f.desk.Researching() {
		t.Error("the research worker should run with ANTHROPIC_API_KEY set")
	}
	if keys := f.desk.SettingsView(cancelled()).Keys; !keys.Anthropic || !keys.OpenAI || !keys.Cloudinary {
		t.Errorf("keys = %+v, want all true", keys)
	}
	if !f.serving.TokenSecretConfigured() {
		t.Error("serving should see ADS_TOKEN_SECRET")
	}
}

// The news desk's image store uploads through the shared Cloudinary client;
// a client that is not configured reports media as unavailable.
func TestCloudinaryImageStore_withoutCloudinary(t *testing.T) {
	in := domain.StoredImageInput{Folder: "oguaa/news/auto", PublicID: "news-1", Data: []byte("RIFF"), MIME: "image/webp"}
	if _, err := (cloudinaryImageStore{}).StoreImage(context.Background(), in); !errors.Is(err, cloudinary.ErrMediaUnavailable) {
		t.Fatalf("err = %v, want ErrMediaUnavailable", err)
	}
}

// sweeper is a retainedDocumentSweeper that counts its passes; it can fail
// or panic.
type sweeper struct {
	mu     sync.Mutex
	passes int
	fail   error
	panics bool
}

func (s *sweeper) SweepRetainedPolitical(context.Context, time.Time) (int, error) {
	s.mu.Lock()
	s.passes++
	fail, panics := s.fail, s.panics
	s.mu.Unlock()
	if panics {
		panic("sweep exploded")
	}
	return 0, fail
}

func (s *sweeper) count() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.passes
}

// The kept-document sweep runs once at start, then every interval until
// shutdown; a failed or panicking pass never stops it.
func TestRetainedDocumentSweepKeepsRunning(t *testing.T) {
	for name, s := range map[string]*sweeper{
		"ok": {}, "failing": {fail: errors.New("mongo down")}, "panicking": {panics: true},
	} {
		t.Run(name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			done := make(chan struct{})
			go func() {
				runRetainedDocumentSweep(ctx, quietLog(), s, 5*time.Millisecond)
				close(done)
			}()
			for deadline := time.Now().Add(5 * time.Second); s.count() < 3 && time.Now().Before(deadline); {
				time.Sleep(time.Millisecond)
			}
			cancel()
			select {
			case <-done:
			case <-time.After(5 * time.Second):
				t.Fatal("the sweep did not stop with its context")
			}
			if s.count() < 3 {
				t.Fatalf("passes = %d, want the start pass and more", s.count())
			}
		})
	}
}
