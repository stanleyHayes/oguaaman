package config

import "testing"

// newsAdsKeys are the news desk, image and ads variables (NEWS_ADS_SPEC
// §2.11, §3.13), cleared so a developer's own environment can't leak in.
var newsAdsKeys = []string{
	"OGUAA_NEWS_MODEL", "OGUAA_NEWS_STRUCTURE_MODEL", "OGUAA_NEWS_EFFORT", "OGUAA_NEWS_MAX_SEARCHES",
	"OGUAA_NEWS_MAX_FETCHES", "OGUAA_NEWS_MAX_CONTINUATIONS", "OGUAA_NEWS_ALLOWED_DOMAINS",
	"OPENAI_API_KEY", "OPENAI_IMAGE_MODEL", "OPENAI_IMAGE_QUALITY", "ADS_TOKEN_SECRET",
}

// Everything new ships off: no keys, the spec's defaults everywhere else.
func TestLoad_newsAndAdsDefaults(t *testing.T) {
	for _, k := range newsAdsKeys {
		t.Setenv(k, "")
	}
	c := load()
	if c.NewsModel != "claude-opus-5-5" || c.NewsStructureModel != "claude-opus-5-5" || c.NewsEffort != "medium" {
		t.Errorf("models/effort = %q %q %q", c.NewsModel, c.NewsStructureModel, c.NewsEffort)
	}
	if c.NewsMaxSearches != 5 || c.NewsMaxFetches != 4 || c.NewsMaxContinuations != 3 {
		t.Errorf("limits = %d %d %d", c.NewsMaxSearches, c.NewsMaxFetches, c.NewsMaxContinuations)
	}
	if c.NewsAllowedDomains != "" {
		t.Errorf("allowed domains = %q, want empty (the service default applies)", c.NewsAllowedDomains)
	}
	if c.OpenAIKey != "" || c.OpenAIImageModel != "gpt-image-2.5-flare-2026-09-08" || c.OpenAIImageQuality != "medium" {
		t.Errorf("openai = %q %q %q", c.OpenAIKey, c.OpenAIImageModel, c.OpenAIImageQuality)
	}
	if c.AdsTokenSecret != "" {
		t.Errorf("ads token secret = %q, want empty", c.AdsTokenSecret)
	}
}

// Overrides are read; secrets are trimmed so a pasted newline can't corrupt
// an Authorization header or an HMAC key.
func TestLoad_newsAndAdsOverrides(t *testing.T) {
	t.Setenv("OGUAA_NEWS_MODEL", "claude-sonnet-5-5")
	t.Setenv("OGUAA_NEWS_EFFORT", "high")
	t.Setenv("OGUAA_NEWS_MAX_SEARCHES", "7")
	t.Setenv("OGUAA_NEWS_ALLOWED_DOMAINS", "gna.org.gh,ucc.edu.gh")
	t.Setenv("OPENAI_API_KEY", "  sk-openai \n")
	t.Setenv("ADS_TOKEN_SECRET", "c2VjcmV0LXNlY3JldC1zZWNyZXQtc2VjcmV0LXNlY3JldA==\n")
	c := load()
	if c.NewsModel != "claude-sonnet-5-5" || c.NewsEffort != "high" || c.NewsMaxSearches != 7 || c.NewsAllowedDomains != "gna.org.gh,ucc.edu.gh" {
		t.Errorf("overrides = %+v", c)
	}
	if c.OpenAIKey != "sk-openai" || c.AdsTokenSecret != "c2VjcmV0LXNlY3JldC1zZWNyZXQtc2VjcmV0LXNlY3JldA==" {
		t.Errorf("secrets not trimmed: %q %q", c.OpenAIKey, c.AdsTokenSecret)
	}
}
