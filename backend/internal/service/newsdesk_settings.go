package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/oguaa/backend/internal/domain"
)

// ── newsroom settings (spec §2.10) ───────────────────────────────────────────

// Bounds of the numeric news-desk settings.
const (
	maxReportsPerDayCap          = 20
	maxResearchMicroUsdPerDayCap = 50_000_000
	maxImagesPerDayCap           = 50
	maxImageMicroUsdPerDayCap    = 10_000_000
	minSourcesFloor              = 2
	minSourcesCeil               = 5
	maxQuoteWordsFloor           = 10
	// maxQuoteWordsCeil is the "up to 25 words" the editorial standards
	// promise readers; the setting can only tighten it.
	maxQuoteWordsCeil = 25
	maxExtraKeywords  = 100
	minKeywordRunes   = 2
	maxKeywordRunes   = 40
)

// DefaultNewsDeskSettings are the code defaults (everything new is off).
func DefaultNewsDeskSettings() domain.NewsDeskSettings {
	return domain.NewsDeskSettings{
		DeskEnabled:               true,
		BriefAutoPublish:          true,
		MaxReportsPerDay:          4,
		MaxResearchMicroUsdPerDay: 8_000_000,
		MaxImagesPerDay:           10,
		MaxImageMicroUsdPerDay:    1_500_000,
		MinSources:                2,
		MaxQuoteWords:             25,
		ExtraBlockedKeywords:      []string{},
	}
}

// NewsDeskSettingsInput is the PUT body: the full settings plus a reason.
type NewsDeskSettingsInput struct {
	domain.NewsDeskSettings
	Reason string `json:"reason"`
}

// NewsDeskKeys says which provider keys this server has.
type NewsDeskKeys struct {
	Anthropic  bool `json:"anthropic"`
	OpenAI     bool `json:"openai"`
	Cloudinary bool `json:"cloudinary"`
}

// NewsDeskSettingsView is the admin GET shape.
type NewsDeskSettingsView struct {
	domain.NewsDeskSettings
	ElectionModeActive bool         `json:"electionModeActive"`
	Keys               NewsDeskKeys `json:"keys"`
}

// Settings returns the current news-desk settings (cached; never fails).
func (d *NewsDesk) Settings(ctx context.Context) domain.NewsDeskSettings {
	if d == nil {
		return DefaultNewsDeskSettings()
	}
	s, _ := LoadSettings(ctx, d.settings, domain.SettingsKeyNewsDesk, DefaultNewsDeskSettings)
	return s
}

// SettingsView returns the settings with the election-mode and key indicators.
func (d *NewsDesk) SettingsView(ctx context.Context) NewsDeskSettingsView {
	if d == nil {
		return NewsDeskSettingsView{NewsDeskSettings: DefaultNewsDeskSettings()}
	}
	return NewsDeskSettingsView{
		NewsDeskSettings:   d.Settings(ctx),
		ElectionModeActive: d.electionMode(ctx),
		Keys:               NewsDeskKeys{Anthropic: d.claude != nil, OpenAI: d.images != nil, Cloudinary: d.store != nil},
	}
}

// SaveSettings validates and stores a new settings document (steward only;
// the HTTP layer checks the role).
func (d *NewsDesk) SaveSettings(ctx context.Context, in NewsDeskSettingsInput, by AuditActor) (NewsDeskSettingsView, error) {
	s := in.NewsDeskSettings
	if err := validateNewsDeskSettings(&s); err != nil {
		return NewsDeskSettingsView{}, err
	}
	err := d.settings.Save(ctx, SettingsChange{
		Key: domain.SettingsKeyNewsDesk, Doc: &s, ExpectedVersion: in.Version,
		ActorID: by.ID, ActorName: by.Name, Reason: in.Reason,
	})
	if err != nil {
		return NewsDeskSettingsView{}, err
	}
	return d.SettingsView(ctx), nil
}

// validateNewsDeskSettings checks every bound and normalises the keyword list.
func validateNewsDeskSettings(s *domain.NewsDeskSettings) error {
	checks := []struct {
		field     string
		v, lo, hi int64
	}{
		{"maxReportsPerDay", int64(s.MaxReportsPerDay), 0, maxReportsPerDayCap},
		{"maxResearchMicroUsdPerDay", s.MaxResearchMicroUsdPerDay, 0, maxResearchMicroUsdPerDayCap},
		{"maxImagesPerDay", int64(s.MaxImagesPerDay), 0, maxImagesPerDayCap},
		{"maxImageMicroUsdPerDay", s.MaxImageMicroUsdPerDay, 0, maxImageMicroUsdPerDayCap},
		{"minSources", int64(s.MinSources), minSourcesFloor, minSourcesCeil},
		{"maxQuoteWords", int64(s.MaxQuoteWords), maxQuoteWordsFloor, maxQuoteWordsCeil},
	}
	for _, c := range checks {
		if c.v < c.lo || c.v > c.hi {
			return invalidField(CodeInvalidSetting, c.field, fmt.Sprintf("Use a value from %d to %d.", c.lo, c.hi))
		}
	}
	kw, err := cleanKeywords(s.ExtraBlockedKeywords)
	if err != nil {
		return err
	}
	s.ExtraBlockedKeywords = kw
	return nil
}

// cleanKeywords lower-cases, trims and de-duplicates the extra blocked keywords.
func cleanKeywords(in []string) ([]string, error) {
	const field = "extraBlockedKeywords"
	if len(in) > maxExtraKeywords {
		return nil, invalidField(CodeInvalidSetting, field, fmt.Sprintf("Add at most %d keywords.", maxExtraKeywords))
	}
	out := []string{}
	seen := map[string]bool{}
	for _, k := range in {
		k = strings.ToLower(strings.Join(strings.Fields(k), " "))
		if n := runeLen(k); n < minKeywordRunes || n > maxKeywordRunes {
			return nil, invalidField(CodeInvalidSetting, field, fmt.Sprintf("Each keyword must be %d to %d characters.", minKeywordRunes, maxKeywordRunes))
		}
		if !seen[k] {
			seen[k] = true
			out = append(out, k)
		}
	}
	return out, nil
}
