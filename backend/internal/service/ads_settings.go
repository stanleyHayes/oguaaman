package service

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
)

// ── ads settings: the public rate card and the kill switches (spec §3.2) ────
//
// One settings document (platform_settings/ads) holds every price and switch.
// Prices apply to every advertiser in a category: there are no per-advertiser
// prices, coupons or discounts anywhere in the code (equal rates, NMC). A
// price change applies to new quotes at once; quotes and campaigns already
// priced keep their locked snapshot. Everything ships switched off.

// Category slugs a steward may block or unblock (spec §3.4).
const (
	AdCategoryAlcohol  = "alcohol"
	AdCategoryGambling = "gambling"
)

// adminBlockableCategories are the only categories BlockedCategories may name.
var adminBlockableCategories = []string{AdCategoryAlcohol, AdCategoryGambling}

// Ranges a steward may set (spec §3.2).
const (
	minCPMPesewas            = 100
	maxCPMPesewas            = 100_000
	maxFallbackDailyViews    = 1_000_000
	maxTaxRateBps            = 5000
	maxTaxLabelRunes         = 60
	maxMinOrderPesewas       = 10_000_000 // GH₵100,000
	maxImpressionStep        = 100_000
	maxImpressionsCeiling    = 10_000_000
	minCampaignDaysSetting   = 1
	maxCampaignDaysSetting   = 180
	maxLeadDaysSetting       = 14
	minApprovalValidHours    = 24
	maxApprovalValidHours    = 336
	minSellThroughPercent    = 10
	maxSellThroughPercent    = 100
	defaultAdTaxLabel        = "VAT, NHIL and GETFund"
	defaultAdMinOrder        = 15_000
	defaultAdMinImpressions  = 3_000
	defaultAdImpressionStep  = 1_000
	defaultAdMaxImpressions  = 500_000
	defaultAdMaxCampaignDays = 60
	defaultAdMinLeadDays     = 2
	defaultAdApprovalHours   = 72
	defaultAdSellThrough     = 50

	fieldPlacements = "placements"
)

// DefaultAdSettings is the code default: every switch off, the launch rate
// card (owner confirms, O10).
func DefaultAdSettings() domain.AdSettings {
	return domain.AdSettings{
		TaxLabel:               defaultAdTaxLabel,
		MinOrderPesewas:        defaultAdMinOrder,
		MinImpressions:         defaultAdMinImpressions,
		ImpressionStep:         defaultAdImpressionStep,
		MaxImpressionsPerOrder: defaultAdMaxImpressions,
		MaxCampaignDays:        defaultAdMaxCampaignDays,
		MinLeadDays:            defaultAdMinLeadDays,
		ApprovalValidHours:     defaultAdApprovalHours,
		SellThroughPercent:     defaultAdSellThrough,
		BlockedCategories:      []string{AdCategoryAlcohol, AdCategoryGambling},
		Placements: []domain.AdPlacementPrice{
			{Slug: domain.AdPlacementPortalHomeBanner, Active: true, CpmPesewas: 6000, PoliticalCpmPesewas: 9000, FallbackDailyViews: 500},
			{Slug: domain.AdPlacementPortalFeedCard, Active: true, CpmPesewas: 5000, PoliticalCpmPesewas: 7500, FallbackDailyViews: 400},
			{Slug: domain.AdPlacementPortalArticleRect, Active: true, CpmPesewas: 4000, PoliticalCpmPesewas: 6000, FallbackDailyViews: 400},
			{Slug: domain.AdPlacementMarketingCard, Active: true, CpmPesewas: 4000, PoliticalCpmPesewas: 6000, FallbackDailyViews: 300},
			{Slug: domain.AdPlacementAppCard, Active: false, CpmPesewas: 4000, PoliticalCpmPesewas: 6000, FallbackDailyViews: 300},
		},
	}
}

// LoadAdSettings reads the ads settings through the 30-second settings cache.
// It never fails: a missing document or an unreadable database gives the
// last good value or the code defaults (everything off).
func LoadAdSettings(ctx context.Context, s *SettingsService) domain.AdSettings {
	v, _ := LoadSettings(ctx, s, domain.SettingsKeyAds, DefaultAdSettings)
	return normaliseAdSettings(v)
}

// normaliseAdSettings makes sure every fixed placement has a row (a document
// saved before a placement existed gets the default row, inactive).
func normaliseAdSettings(v domain.AdSettings) domain.AdSettings {
	defaults := DefaultAdSettings()
	rows := make([]domain.AdPlacementPrice, 0, len(domain.AdPlacements))
	for _, p := range domain.AdPlacements {
		row, ok := v.Price(p.Slug)
		if !ok {
			row, _ = defaults.Price(p.Slug)
			row.Active = false
		}
		rows = append(rows, row)
	}
	v.Placements = rows
	return v
}

// validateAdSettings checks every field against the ranges of spec §3.2.
func validateAdSettings(v *domain.AdSettings) error {
	v.TaxLabel = strings.TrimSpace(v.TaxLabel)
	checks := []struct {
		ok      bool
		field   string
		message string
	}{
		{v.TaxRateBps >= 0 && v.TaxRateBps <= maxTaxRateBps, "taxRateBps", "Set the tax rate between 0% and 50%."},
		{runeLen(v.TaxLabel) >= 1 && runeLen(v.TaxLabel) <= maxTaxLabelRunes, "taxLabel", "Name the tax shown on quotes (up to 60 characters)."},
		{v.MinOrderPesewas >= 0 && v.MinOrderPesewas <= maxMinOrderPesewas, "minOrderPesewas", "Set a minimum order between GH₵0 and GH₵100,000."},
		{v.ImpressionStep >= 1 && v.ImpressionStep <= maxImpressionStep, "impressionStep", "Set an impression step between 1 and 100,000."},
		{v.ImpressionStep >= 1 && v.MinImpressions >= v.ImpressionStep && v.MinImpressions%v.ImpressionStep == 0, "minImpressions", "The minimum must be a positive multiple of the impression step."},
		{v.MaxImpressionsPerOrder >= v.MinImpressions && v.MaxImpressionsPerOrder <= maxImpressionsCeiling, "maxImpressionsPerOrder", "The maximum must be at least the minimum and at most 10,000,000."},
		{v.MaxCampaignDays >= minCampaignDaysSetting && v.MaxCampaignDays <= maxCampaignDaysSetting, "maxCampaignDays", "Allow campaigns of 1 to 180 days."},
		{v.MinLeadDays >= 0 && v.MinLeadDays <= maxLeadDaysSetting, "minLeadDays", "Set a review lead time of 0 to 14 days."},
		{v.ApprovalValidHours >= minApprovalValidHours && v.ApprovalValidHours <= maxApprovalValidHours, "approvalValidHours", "Keep approvals valid for 24 to 336 hours."},
		{v.SellThroughPercent >= minSellThroughPercent && v.SellThroughPercent <= maxSellThroughPercent, "sellThroughPercent", "Sell 10% to 100% of forecast opportunities."},
	}
	for _, c := range checks {
		if !c.ok {
			return invalidField(CodeInvalidSetting, c.field, c.message)
		}
	}
	blocked, err := cleanBlockedCategories(v.BlockedCategories)
	if err != nil {
		return err
	}
	v.BlockedCategories = blocked
	return validatePlacementPrices(v.Placements)
}

// cleanBlockedCategories de-duplicates and checks the blocked list.
func cleanBlockedCategories(in []string) ([]string, error) {
	out := []string{}
	for _, c := range in {
		c = strings.TrimSpace(c)
		if !slices.Contains(adminBlockableCategories, c) {
			return nil, invalidField(CodeInvalidSetting, "blockedCategories", "Only alcohol and gambling can be blocked or unblocked here.")
		}
		if !slices.Contains(out, c) {
			out = append(out, c)
		}
	}
	slices.Sort(out)
	return out, nil
}

// validatePlacementPrices requires exactly one row per fixed placement.
func validatePlacementPrices(rows []domain.AdPlacementPrice) error {
	if len(rows) != len(domain.AdPlacements) {
		return invalidField(CodeInvalidSetting, fieldPlacements, "List every placement exactly once.")
	}
	seen := map[string]bool{}
	for i, p := range rows {
		field := fmt.Sprintf("placements[%d]", i)
		if _, ok := domain.AdPlacementBySlug(p.Slug); !ok || seen[p.Slug] {
			return invalidField(CodeInvalidSetting, field+".slug", "List every placement exactly once.")
		}
		seen[p.Slug] = true
		if p.CpmPesewas < minCPMPesewas || p.CpmPesewas > maxCPMPesewas {
			return invalidField(CodeInvalidSetting, field+".cpmPesewas", "Set the CPM between GH₵1 and GH₵1,000.")
		}
		if p.PoliticalCpmPesewas < p.CpmPesewas || p.PoliticalCpmPesewas > maxCPMPesewas {
			return invalidField(CodeInvalidSetting, field+".politicalCpmPesewas", "The political CPM must be at least the commercial CPM and at most GH₵1,000.")
		}
		if p.FallbackDailyViews < 0 || p.FallbackDailyViews > maxFallbackDailyViews {
			return invalidField(CodeInvalidSetting, field+".fallbackDailyViews", "Set fallback daily views between 0 and 1,000,000.")
		}
	}
	return nil
}

// adPricesChanged reports whether anything on the public price list moved:
// a CPM, the tax rate or the minimum order.
func adPricesChanged(prev, next domain.AdSettings) bool {
	if prev.TaxRateBps != next.TaxRateBps || prev.MinOrderPesewas != next.MinOrderPesewas {
		return true
	}
	for _, p := range next.Placements {
		old, ok := prev.Price(p.Slug)
		if !ok || old.CpmPesewas != p.CpmPesewas || old.PoliticalCpmPesewas != p.PoliticalCpmPesewas {
			return true
		}
	}
	return false
}

// AdSettingsInput is the PUT /api/admin/settings/ads body: the full settings
// with the version the editor read, plus why.
type AdSettingsInput struct {
	domain.AdSettings
	Reason string `json:"reason"`
}

// SaveAdSettings validates and stores the ads settings (steward). A stale
// version is domain.ErrSettingsConflict; a bad field is *InvalidFieldError.
func (s *AdsService) SaveAdSettings(ctx context.Context, in AdSettingsInput, by AuditActor) (domain.AdSettings, error) {
	next := in.AdSettings
	if err := validateAdSettings(&next); err != nil {
		return domain.AdSettings{}, err
	}
	prev := LoadAdSettings(ctx, s.settings)
	next.Placements = normaliseAdSettings(next).Placements
	next.EffectiveFrom = prev.EffectiveFrom
	if next.EffectiveFrom == "" || adPricesChanged(prev, next) {
		next.EffectiveFrom = s.now().UTC().Format(time.RFC3339)
	}
	err := s.settings.Save(ctx, SettingsChange{
		Key: domain.SettingsKeyAds, Doc: &next, ExpectedVersion: in.Version,
		ActorID: by.ID, ActorName: by.Name, Reason: in.Reason,
	})
	if err != nil {
		return domain.AdSettings{}, err
	}
	return next, nil
}

// AdForecast is one placement's daily opportunity forecast.
type AdForecast struct {
	Slug               string `json:"slug"`
	DailyOpportunities int64  `json:"dailyOpportunities"`
	Source             string `json:"source"` // observed | fallback
}

// AdSettingsView is the GET /api/admin/settings/ads payload.
type AdSettingsView struct {
	domain.AdSettings
	Forecast              []AdForecast `json:"forecast"`
	TokenSecretConfigured bool         `json:"tokenSecretConfigured"`
}

// AdminSettings returns the settings with the observed forecast beside them.
func (s *AdsService) AdminSettings(ctx context.Context) AdSettingsView {
	set := s.Settings(ctx)
	today := s.today()
	out := AdSettingsView{AdSettings: set, Forecast: []AdForecast{}, TokenSecretConfigured: s.tokenSecretConfigured}
	for _, p := range set.Placements {
		daily, observed := s.forecast(ctx, p, today)
		src := forecastFallback
		if observed {
			src = forecastObserved
		}
		out.Forecast = append(out.Forecast, AdForecast{Slug: p.Slug, DailyOpportunities: daily, Source: src})
	}
	return out
}

// Settings is the current ads settings (cached, never failing).
func (s *AdsService) Settings(ctx context.Context) domain.AdSettings {
	return LoadAdSettings(ctx, s.settings)
}

// ── the public rate card (GET /api/ads/rate-card) ───────────────────────────

// AdOperator is the seller block every advertiser sees (Act 772 s.47).
type AdOperator struct {
	Name         string `json:"name"`
	Registration string `json:"registration"`
	Address      string `json:"address"`
	Phone        string `json:"phone"`
	Email        string `json:"email"`
}

// adOperator is Dev Track, which operates Oguaa and sells its ad space.
var adOperator = AdOperator{
	Name: "Dev Track", Registration: "BN843072020", Address: "GE-161-2814",
	Phone: "+233 55 518 0048", Email: "hello@oguaaman.com",
}

// RateCardPlacement is one placement on the rate card.
type RateCardPlacement struct {
	domain.AdPlacement
	CpmPesewas          int64 `json:"cpmPesewas"`
	PoliticalCpmPesewas int64 `json:"politicalCpmPesewas"`
	Active              bool  `json:"active"`
}

// RateCardCategory is a category an advertiser can choose.
type RateCardCategory struct {
	Slug     string   `json:"slug"`
	Name     string   `json:"name"`
	Requires []string `json:"requires"`
}

// RateCard is the public price list.
type RateCard struct {
	AdsEnabled             bool                `json:"adsEnabled"`
	PoliticalEnabled       bool                `json:"politicalEnabled"`
	Currency               string              `json:"currency"`
	TaxRateBps             int                 `json:"taxRateBps"`
	TaxLabel               string              `json:"taxLabel"`
	MinOrderPesewas        int64               `json:"minOrderPesewas"`
	MinImpressions         int64               `json:"minImpressions"`
	ImpressionStep         int64               `json:"impressionStep"`
	MaxImpressionsPerOrder int64               `json:"maxImpressionsPerOrder"`
	MaxCampaignDays        int                 `json:"maxCampaignDays"`
	MinLeadDays            int                 `json:"minLeadDays"`
	EffectiveFrom          string              `json:"effectiveFrom"`
	Version                int                 `json:"version"`
	Placements             []RateCardPlacement `json:"placements"`
	BlockedCategories      []string            `json:"blockedCategories"`
	Categories             []RateCardCategory  `json:"categories"`
	Operator               AdOperator          `json:"operator"`
}

// RateCard builds the public price list. Inactive placements are listed so
// the UI can say "not available"; the app card counts as inactive while app
// delivery is off (D6).
func (s *AdsService) RateCard(ctx context.Context) RateCard {
	set := s.Settings(ctx)
	out := RateCard{
		AdsEnabled: set.AdsEnabled, PoliticalEnabled: set.PoliticalEnabled, Currency: paymentCurrency,
		TaxRateBps: set.TaxRateBps, TaxLabel: set.TaxLabel, MinOrderPesewas: set.MinOrderPesewas,
		MinImpressions: set.MinImpressions, ImpressionStep: set.ImpressionStep, MaxImpressionsPerOrder: set.MaxImpressionsPerOrder,
		MaxCampaignDays: set.MaxCampaignDays, MinLeadDays: set.MinLeadDays, EffectiveFrom: set.EffectiveFrom, Version: set.Version,
		Placements: []RateCardPlacement{}, Operator: adOperator,
	}
	for _, p := range domain.AdPlacements {
		price, _ := set.Price(p.Slug)
		active := price.Active && (p.Slug != domain.AdPlacementAppCard || set.AppDeliveryEnabled)
		out.Placements = append(out.Placements, RateCardPlacement{AdPlacement: p, CpmPesewas: price.CpmPesewas, PoliticalCpmPesewas: price.PoliticalCpmPesewas, Active: active})
	}
	out.BlockedCategories = append(slices.Clone(set.BlockedCategories), hardBlockedCategories...)
	out.Categories = selectableCategories(set)
	return out
}
