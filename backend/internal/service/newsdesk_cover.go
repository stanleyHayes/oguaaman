package service

import (
	"context"
	"errors"
	"net/url"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/oguaa/backend/internal/domain"
)

// ── cover images (spec §2.8) ─────────────────────────────────────────────────
//
// An AI illustration is made only when nothing in the decision order rules it
// out; otherwise the article gets the branded cover, which is rendered on
// request and never stored. The prompt is a fixed template whose only variable
// part is the scene Call 2 described, and a refused or failed image is never
// retried with a changed prompt.

// Why an AI illustration was not made (NewsCoverDraft.SkippedReason).
const (
	CoverSkipPolitical    = "political"
	CoverSkipSensitive    = "sensitive"
	CoverSkipElectionMode = "election_mode"
	CoverSkipDisabled     = "disabled"
	CoverSkipNoKey        = "no_key"
	CoverSkipNoCloudinary = "no_cloudinary"
	CoverSkipCap          = "cap"
	CoverSkipScene        = "scene_rejected"
	CoverSkipModeration   = "moderation_blocked"
	CoverSkipError        = "error"
)

const (
	// imagePromptTemplate is Appendix A3; {scene} is the only variable part.
	imagePromptTemplate = "Editorial illustration for a community news story from Cape Coast, Ghana. Style: flat, hand-printed risograph and gouache illustration with visible paper texture, clearly an illustration and not a photograph; limited palette of deep green #0C2C1F, warm gold #C7A24A, sand #D8CDB4 and cream #F7F3EA. Scene: {scene}. Any people are small, generic and anonymous, seen from behind or at a distance, with no detailed faces. Wide 3:2 composition, single clear focal point, calm uncluttered sky area at the top. Do not include: any text, letters, numbers, signage, captions or watermarks; logos, brand marks, flags, party symbols or party colours; ballot papers, uniforms or insignia of real organisations; recognisable real people or public figures; weapons, blood, injuries, bodies, fire or disaster damage; anything resembling a news photograph, press photo, CCTV still or documentary image."
	scenePlaceholder    = "{scene}"

	maxSceneWords     = 40
	maxAltSceneRunes  = 120
	newsImageFolder   = "oguaa/news/auto"
	newsImageSize     = "1536x1024"
	newsImageFormat   = "webp"
	aiAltPrefix       = "AI illustration: "
	brandedAltPrefix  = "Oguaa Newsroom graphic: "
	aiCreditPrefix    = "AI illustration · "
	providerOpenAI    = "openai"
	providerOpenAIPub = "OpenAI"
)

// sceneDenylist words are never drawn.
// Plurals are listed too, so "flags" or "children" cannot slip through.
var sceneDenyRe = termsRegexp([]string{
	"election", "vote", "ballot", "npp", "ndc", "party", "candidate", "police", "soldier", "gun", "blood",
	"fire", "flood", "accident", "crash", "dead", "body", "child", "flag", "logo",
	"elections", "votes", "voters", "ballots", "parties", "candidates", "soldiers", "guns", "fires", "floods",
	"accidents", "crashes", "bodies", "children", "flags", "logos",
})

// placeWords are the capitalised words a scene may use: the whitelisted
// local place names and the place nouns that belong to them (Cape Coast
// Castle, Kotokuraba Market, Fosu Lagoon, Kakum National Park). None of them
// names a person or an organisation.
var placeWords = map[string]bool{
	"cape": true, "coast": true, "elmina": true, "kotokuraba": true, "central": true, "region": true,
	"ghana": true, "oguaa": true, "castle": true, "fosu": true, "kakum": true, "abura": true, "pedu": true,
	"komenda": true, "anomabo": true, "anomabu": true, "moree": true, "brenu": true, "atlantic": true,
	"ocean": true, "lagoon": true, "beach": true, "market": true, "national": true, "park": true,
}

var (
	snapshotRe   = regexp.MustCompile(`-\d{4}-\d{2}-\d{2}$`)
	capitalRe    = regexp.MustCompile(`\p{Lu}[\p{L}'’-]*`)
	sentenceEnds = ".!?:\n\"“”"
)

// imagePrompt fills the A3 template.
func imagePrompt(scene string) string {
	return strings.Replace(imagePromptTemplate, scenePlaceholder, scene, 1)
}

// sceneFromPrompt recovers the scene from a stored prompt ("" if it is not ours).
func sceneFromPrompt(prompt string) string {
	head, tail, _ := strings.Cut(imagePromptTemplate, scenePlaceholder)
	if !strings.HasPrefix(prompt, head) || !strings.HasSuffix(prompt, tail) || len(prompt) < len(head)+len(tail) {
		return ""
	}
	return prompt[len(head) : len(prompt)-len(tail)]
}

// sceneAcceptable applies the scene validation of rule 5: at most 40 words,
// no denylisted word, and no name, so none can reach the image model.
func sceneAcceptable(scene, body string) bool {
	if scene == "" || len(strings.Fields(scene)) > maxSceneWords {
		return false
	}
	return !sceneDenyRe.MatchString(scene) && !sceneNamesSomeone(scene, body)
}

// sceneNamesSomeone reports whether a scene may name a person or an
// organisation: any capitalised word that is not a place word, unless it only
// starts a sentence and the article never uses it as a name. "Market stalls
// in Cape Coast at dawn" passes; "Ernest Arthur greeting traders", "Arthur
// greeting traders" (when the article names him) and "the UCC campus" do not.
func sceneNamesSomeone(scene, body string) bool {
	names := bodyNames(body)
	for _, idx := range capitalRe.FindAllStringIndex(scene, -1) {
		w := strings.ToLower(trimWord(scene[idx[0]:idx[1]]))
		if placeWords[w] {
			continue
		}
		if !sentenceStart(scene, idx[0]) || names[w] {
			return true
		}
	}
	return false
}

// bodyNames are the words an article uses as names: capitalised in the
// middle of a sentence, never written in lower case, and not a place word.
func bodyNames(body string) map[string]bool {
	lower := map[string]bool{}
	for _, f := range strings.FieldsFunc(body, func(r rune) bool { return !wordRune(r) }) {
		if first, _ := utf8.DecodeRuneInString(f); unicode.IsLower(first) {
			lower[strings.ToLower(f)] = true
		}
	}
	out := map[string]bool{}
	for _, idx := range capitalRe.FindAllStringIndex(body, -1) {
		w := strings.ToLower(trimWord(body[idx[0]:idx[1]]))
		if sentenceStart(body, idx[0]) || placeWords[w] || lower[w] || runeLen(w) < 2 {
			continue
		}
		out[w] = true
	}
	return out
}

// trimWord drops a trailing possessive, apostrophe or hyphen ("Coast's" → "Coast").
func trimWord(w string) string {
	for _, possessive := range []string{"'s", "’s"} {
		w = strings.TrimSuffix(w, possessive)
	}
	return strings.TrimRight(w, "'’-")
}

// sentenceStart reports whether position i begins a sentence, a line or a
// quotation.
func sentenceStart(text string, i int) bool {
	before := strings.TrimRight(text[:i], " \t*#")
	if before == "" {
		return true
	}
	r, _ := utf8.DecodeLastRuneInString(before)
	return strings.ContainsRune(sentenceEnds, r)
}

// coverRequest is everything the decision order needs.
type coverRequest struct {
	JobID, ArticleID, Title, Body, Scene string
	Political, Sensitive                 bool
}

// brandedCover is the branded cover with the reason no illustration was made.
func brandedCover(title, reason, prompt string) domain.NewsCoverDraft {
	return domain.NewsCoverDraft{Kind: domain.CoverKindBranded, Alt: brandedAltPrefix + title, SkippedReason: reason, Prompt: prompt}
}

// coverSkip applies rules 1–5 of the decision order; "" means generate.
func (d *NewsDesk) coverSkip(ctx context.Context, r coverRequest, s domain.NewsDeskSettings) string {
	switch {
	case r.Political:
		return CoverSkipPolitical
	case r.Sensitive:
		return CoverSkipSensitive
	case d.electionMode(ctx):
		return CoverSkipElectionMode
	case !s.ImagesEnabled:
		return CoverSkipDisabled
	case d.images == nil:
		return CoverSkipNoKey
	case d.store == nil:
		return CoverSkipNoCloudinary
	case !sceneAcceptable(r.Scene, r.Body):
		return CoverSkipScene
	}
	return ""
}

// makeCover runs the decision order and, when allowed, generates and stores
// one illustration. It never fails: every problem gives the branded cover.
func (d *NewsDesk) makeCover(ctx context.Context, r coverRequest, s domain.NewsDeskSettings) domain.NewsCoverDraft {
	prompt := ""
	if r.Scene != "" {
		prompt = imagePrompt(r.Scene)
	}
	if reason := d.coverSkip(ctx, r, s); reason != "" {
		return brandedCover(r.Title, reason, prompt)
	}
	day := d.today()
	if !d.reserveImage(ctx, day, s) {
		return brandedCover(r.Title, CoverSkipCap, prompt)
	}
	res, err := d.images.Generate(ctx, domain.ImageRequest{Prompt: prompt, Size: newsImageSize, Quality: d.cfg.ImageQuality, Format: newsImageFormat})
	cost := imageCostMicroUSD(res)
	if err != nil && mayHaveBeenBilled(err) {
		cost = imageCeilingMicroUSD // no usage came back for a call that may still be billed
	}
	d.settle(ctx, day, keyImagesUSD, cost-imageCeilingMicroUSD)
	if cost > 0 && r.JobID != "" {
		if err := d.jobs.AddCost(context.WithoutCancel(ctx), r.JobID, 0, cost); err != nil {
			d.log.Warn("newsdesk: could not record image cost", "job", r.JobID, "err", err)
		}
	}
	if errors.Is(err, domain.ErrImageModerationBlocked) {
		return brandedCover(r.Title, CoverSkipModeration, prompt)
	}
	if err != nil {
		if cost == 0 {
			d.settle(ctx, day, keyImages, -1) // surely not made: it doesn't count
		}
		d.log.Warn("newsdesk: image generation failed", "article", r.ArticleID, "err", err)
		return brandedCover(r.Title, CoverSkipError, prompt)
	}
	return d.storeCover(ctx, r, res, prompt)
}

// mayHaveBeenBilled reports whether a failed provider call may still have
// been billed: it timed out or lost its connection rather than being refused
// with an error status.
func mayHaveBeenBilled(err error) bool {
	var transport *url.Error
	return errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) || errors.As(err, &transport)
}

// storeCover uploads the generated bytes unchanged and labels the cover.
func (d *NewsDesk) storeCover(ctx context.Context, r coverRequest, res domain.ImageResult, prompt string) domain.NewsCoverDraft {
	alt := aiAltPrefix + clipRunes(r.Scene, maxAltSceneRunes)
	model := res.Model
	provider := d.images.Provider()
	secureURL, err := d.store.StoreImage(ctx, domain.StoredImageInput{
		Folder: newsImageFolder, PublicID: r.ArticleID, Data: res.Data, MIME: res.MIME,
		Tags:    []string{"ai-generated", "oguaa-news"},
		Context: map[string]string{"alt": alt, "ai": "1", "provider": provider, "model": model},
	})
	if err != nil || !httpsURL(secureURL) {
		d.log.Warn("newsdesk: cover upload failed", "article", r.ArticleID, "err", err)
		return brandedCover(r.Title, CoverSkipError, prompt)
	}
	return domain.NewsCoverDraft{
		Kind: domain.CoverKindAI, URL: secureURL, Alt: alt, Model: model, Prompt: prompt,
		Credit: aiCreditPrefix + publicProvider(provider) + " " + snapshotRe.ReplaceAllString(model, ""),
	}
}

// publicProvider is the provider name readers see.
func publicProvider(p string) string {
	if p == providerOpenAI {
		return providerOpenAIPub
	}
	if p == "" {
		return p
	}
	r := []rune(p)
	r[0] = unicode.ToUpper(r[0])
	return string(r)
}

// reserveImage reserves one image and its spend ceiling against today's caps.
func (d *NewsDesk) reserveImage(ctx context.Context, day string, s domain.NewsDeskSettings) bool {
	if !d.reserve(ctx, day, keyImages, 1, int64(s.MaxImagesPerDay)) {
		return false
	}
	if !d.reserve(ctx, day, keyImagesUSD, imageCeilingMicroUSD, s.MaxImageMicroUsdPerDay) {
		d.settle(ctx, day, keyImages, -1)
		return false
	}
	return true
}
