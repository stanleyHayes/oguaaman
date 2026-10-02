package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// ── cover decision order (spec §2.8, test 12) ────────────────────────────────

const calmScene = "Market stalls under new roofing in Cape Coast in the morning, with baskets of fish and small distant figures"

func coverReq() coverRequest {
	return coverRequest{JobID: "nrj-1", ArticleID: "news-1", Title: "Kotokuraba reopens", Body: strings.Join(reportParas, "\n\n"), Scene: calmScene}
}

// Every skip reason is reachable, in order, and each gives the branded cover.
func TestCoverDecisionOrder(t *testing.T) {
	cases := []struct {
		name   string
		setup  func(f *deskFixture, r *coverRequest, s *domain.NewsDeskSettings)
		reason string
	}{
		{"political", func(_ *deskFixture, r *coverRequest, _ *domain.NewsDeskSettings) {
			r.Political, r.Sensitive = true, true
		}, CoverSkipPolitical},
		{"sensitive", func(_ *deskFixture, r *coverRequest, _ *domain.NewsDeskSettings) { r.Sensitive = true }, CoverSkipSensitive},
		{"election mode", func(f *deskFixture, _ *coverRequest, _ *domain.NewsDeskSettings) {
			f.saveSettings(t, func(s *domain.NewsDeskSettings) { s.ElectionModeManual = true })
		}, CoverSkipElectionMode},
		{"disabled", func(_ *deskFixture, _ *coverRequest, s *domain.NewsDeskSettings) { s.ImagesEnabled = false }, CoverSkipDisabled},
		{"no key", func(f *deskFixture, _ *coverRequest, _ *domain.NewsDeskSettings) { f.desk.images = nil }, CoverSkipNoKey},
		{"no cloudinary", func(f *deskFixture, _ *coverRequest, _ *domain.NewsDeskSettings) { f.desk.store = nil }, CoverSkipNoCloudinary},
		{"scene", func(_ *deskFixture, r *coverRequest, _ *domain.NewsDeskSettings) { r.Scene = "A flag above the market" }, CoverSkipScene},
		{"cap", func(_ *deskFixture, _ *coverRequest, s *domain.NewsDeskSettings) { s.MaxImagesPerDay = 0 }, CoverSkipCap},
		{"usd cap", func(_ *deskFixture, _ *coverRequest, s *domain.NewsDeskSettings) { s.MaxImageMicroUsdPerDay = 100_000 }, CoverSkipCap},
		{"moderation", func(f *deskFixture, _ *coverRequest, _ *domain.NewsDeskSettings) {
			f.images.err = domain.ErrImageModerationBlocked
		}, CoverSkipModeration},
		{"error", func(f *deskFixture, _ *coverRequest, _ *domain.NewsDeskSettings) { f.images.err = errors.New("boom") }, CoverSkipError},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := newDeskFixture(t, nil)
			r := coverReq()
			s := f.desk.Settings(context.Background())
			c.setup(f, &r, &s)
			got := f.desk.makeCover(context.Background(), r, s)
			if got.Kind != domain.CoverKindBranded || got.SkippedReason != c.reason || got.URL != "" || got.Alt != "Oguaa Newsroom graphic: Kotokuraba reopens" {
				t.Fatalf("cover = %+v, want branded/%s", got, c.reason)
			}
			if c.reason != CoverSkipModeration && c.reason != CoverSkipError && f.images.calls() != 0 {
				t.Fatalf("an image call was made for %s", c.reason)
			}
			if f.images.calls() > 1 {
				t.Fatal("a failed image must never be retried")
			}
		})
	}
}

// An image call that timed out may still be billed: it keeps its reserved
// ceiling (and its place in the day's count); a refused one is given back.
func TestCoverChargesATimedOutImage(t *testing.T) {
	f := newDeskFixture(t, nil)
	f.images.err = fmt.Errorf("openai: images request failed: %w", context.DeadlineExceeded)
	got := f.desk.makeCover(context.Background(), coverReq(), f.desk.Settings(context.Background()))
	if got.SkippedReason != CoverSkipError || f.usage.today(keyImagesUSD) != imageCeilingMicroUSD || f.usage.today(keyImages) != 1 {
		t.Fatalf("timed out: cover %+v, spend %d, images %d", got, f.usage.today(keyImagesUSD), f.usage.today(keyImages))
	}

	f = newDeskFixture(t, nil)
	f.images.err = errors.New("openai: images returned 400 invalid_request_error: bad size")
	f.desk.makeCover(context.Background(), coverReq(), f.desk.Settings(context.Background()))
	if f.usage.today(keyImagesUSD) != 0 || f.usage.today(keyImages) != 0 {
		t.Fatalf("refused: spend %d, images %d", f.usage.today(keyImagesUSD), f.usage.today(keyImages))
	}
}

// The template embeds the scene verbatim and nothing else varies.
func TestImagePromptTemplate(t *testing.T) {
	f := newDeskFixture(t, nil)
	got := f.desk.makeCover(context.Background(), coverReq(), f.desk.Settings(context.Background()))
	if got.Kind != domain.CoverKindAI || f.images.calls() != 1 {
		t.Fatalf("cover = %+v", got)
	}
	prompt := f.images.prompts[0]
	if prompt != strings.Replace(imagePromptTemplate, "{scene}", calmScene, 1) || !strings.Contains(prompt, "Scene: "+calmScene+".") {
		t.Fatalf("prompt = %s", prompt)
	}
	if sceneFromPrompt(prompt) != calmScene || sceneFromPrompt("something else") != "" {
		t.Fatal("the scene must round-trip through the stored prompt")
	}
	if got.Alt != "AI illustration: "+calmScene || got.Prompt != prompt {
		t.Fatalf("labels = %+v", got)
	}
}

// A scene must name no one, so no name reaches the image model: a
// capitalised word mid-sentence must be a place word, and one that starts a
// sentence must not be a name the article uses (even once).
func TestSceneNamesNoOne(t *testing.T) {
	body := "Traders returned to Kotokuraba Market on Monday. The Metropolitan Chief Executive, Ernest Arthur, thanked them. " +
		"Stalls reopened across the market, and the assembly said the Fosu Lagoon clean-up continues."
	cases := map[string]bool{
		"Ernest Arthur greeting traders beside new market stalls in Cape Coast":   false, // named once in the body
		"Arthur greeting traders beside new market stalls":                        false,
		"A smiling Mr Arthur at the market":                                       false,
		"Traders at the UCC campus at dusk":                                       false, // an organisation
		"Metropolitan offices at dusk":                                            false, // the article's name for the assembly
		"Stalls at Kotokuraba Market in the morning light":                        true,
		"Fishing canoes on the beach below Cape Coast Castle at dawn":             true,
		"Morning mist over the Fosu Lagoon and Cape Coast's rooftops":             true,
		"Market stalls at dawn. Traders arrange baskets of fish on wooden tables": true,
	}
	for scene, want := range cases {
		if got := sceneAcceptable(scene, body); got != want {
			t.Errorf("sceneAcceptable(%q) = %v, want %v", scene, got, want)
		}
	}
	f := newDeskFixture(t, nil)
	r := coverReq()
	r.Body, r.Scene = body, "Ernest Arthur greeting traders beside new market stalls in Cape Coast"
	if got := f.desk.makeCover(context.Background(), r, f.desk.Settings(context.Background())); got.SkippedReason != CoverSkipScene || f.images.calls() != 0 {
		t.Fatalf("a named scene was drawn: %+v (image calls %d)", got, f.images.calls())
	}
}

func TestSceneValidation(t *testing.T) {
	body := "Officials said Mr Asante Boateng visited. The team led by Asante met traders, and later Asante left. Cape Coast is busy; in Cape Coast traders smiled."
	cases := map[string]bool{
		calmScene: true,
		"Fishing canoes on the beach below Cape Coast Castle at dawn": true,
		strings.Repeat("calm ", 41):                                   false, // over 40 words
		"Voters queue at a ballot box":                                false, // denylist
		"Asante standing in the market at noon":                       false, // a name used twice in the body
		"A police officer by the road":                                false,
		"Children play by the lagoon":                                 false, // plurals of denylist words count too
		"A childminder's garden in bloom":                             true,  // whole words only
	}
	for scene, want := range cases {
		if got := sceneAcceptable(scene, body); got != want {
			t.Errorf("sceneAcceptable(%q) = %v, want %v", scene, got, want)
		}
	}
}
