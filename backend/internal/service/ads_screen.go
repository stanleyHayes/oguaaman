package service

import (
	"net"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/oguaa/backend/internal/domain"
)

// ── what an ad may say and sell (spec §3.4) ─────────────────────────────────
//
// Categories decide which regulator references an ad needs; some products are
// never advertised. Every creative and sponsor name is screened on submit and
// again on approval: ads must never look like news, name an anonymous
// sponsor, price in foreign currency, or send readers somewhere unsafe.

// Error codes of the ads flow (AdError.Code). The HTTP layer maps each to a
// status (400 unless noted).
const (
	AdErrInvalidPlacement       = "invalid_placement"
	AdErrInvalidDates           = "invalid_dates"
	AdErrInvalidImpressions     = "invalid_impressions"
	AdErrBelowMinimumOrder      = "below_minimum_order"
	AdErrPoliticalOutsideWindow = "political_dates_outside_window"
	AdErrDistrictAssembly       = "district_assembly_not_allowed"
	AdErrInventoryUnavailable   = "inventory_unavailable" // 409
	AdErrAdsDisabled            = "ads_disabled"          // 503
	AdErrPoliticalDisabled      = "political_disabled"    // 503
	AdErrInvalidCreative        = "invalid_creative"
	AdErrInvalidImage           = "invalid_image"
	AdErrInvalidLandingURL      = "invalid_landing_url"
	AdErrAdTextNotAllowed       = "ad_text_not_allowed"
	AdErrContentBlocked         = "content_blocked"
	AdErrForeignCurrency        = "foreign_currency_not_allowed"
	AdErrCategoryBlocked        = "category_blocked"
	AdErrComplianceRequired     = "compliance_required"
	AdErrTermsNotAccepted       = "terms_not_accepted"
	AdErrSponsorKindMismatch    = "sponsor_kind_mismatch"
	AdErrSponsorNotFound        = "sponsor_not_found" // 404
	AdErrInvalidSponsor         = "invalid_sponsor"
	AdErrSponsorNameNotAllowed  = "sponsor_name_not_allowed"
	AdErrCitizenshipRequired    = "citizenship_declaration_required"
	AdErrSponsorLocked          = "sponsor_locked"       // 409
	AdErrSponsorNotVerified     = "sponsor_not_verified" // 409
	AdErrNotApproved            = "not_approved"         // 409
	AdErrApprovalExpired        = "approval_expired"     // 409
	AdErrAlreadyPaid            = "already_paid"         // 409
	AdErrNotCancellable         = "not_cancellable"      // 409
	AdErrChecklistIncomplete    = "checklist_incomplete"
	AdErrAlreadyApprovedByYou   = "already_approved_by_you" // 409
	AdErrInvalidTransition      = "invalid_transition"      // 409
	AdErrInvalidAmount          = "invalid_amount"
	AdErrInvalidReason          = "invalid_reason"
	AdErrNotFound               = "not_found"            // 404
	AdErrForbidden              = "forbidden"            // 403
	AdErrMediaUnavailable       = "media_unavailable"    // 503
	AdErrPaymentStartFailed     = "payment_start_failed" // 502
	AdErrInvalidScope           = "invalid_scope"        // kill switch scope
	AdErrElectionNotFound       = "election_not_found"   // 400
	adFieldCategory             = "category"
	adFieldLandingURL           = "landingUrl"
	adFieldReason               = "reason"
	adFieldFDAExpiry            = "compliance.fdaApprovalExpiresOn"
)

// AdError is a refusal from the ads flow: a machine code, a sentence for the
// person, the offending field, and any extra fields the response carries
// (maxAvailable, latestEndDate, minOrderPesewas).
type AdError struct {
	Code    string
	Message string
	Field   string
	Extra   map[string]any
}

func (e *AdError) Error() string { return e.Code + ": " + e.Message }

func adErr(code, message string) *AdError { return &AdError{Code: code, Message: message} }

func adFieldErr(code, field, message string) *AdError {
	return &AdError{Code: code, Field: field, Message: message}
}

// ── categories ──────────────────────────────────────────────────────────────

// Category slugs (spec §3.4).
const (
	AdCategoryGeneral          = "general"
	AdCategoryEvents           = "events"
	AdCategoryEducation        = "education"
	AdCategoryProperty         = "property"
	AdCategoryJobs             = "jobs"
	AdCategoryTourism          = "tourism"
	AdCategoryRetail           = "retail"
	AdCategoryServices         = "services"
	AdCategoryReligiousEvents  = "religious_events"
	AdCategoryNGO              = "ngo"
	AdCategoryFoodDrink        = "food_drink"
	AdCategoryHealthMedicine   = "health_medicine"
	AdCategoryHerbal           = "herbal"
	AdCategoryCosmetics        = "cosmetics"
	AdCategoryFinancial        = "financial"
	AdCategoryGovernmentPublic = "government_public_service"
	AdCategoryPolitical        = "political"
)

// What a category requires (RateCardCategory.Requires).
const (
	adRequiresFDA        = "fda"
	adRequiresLicence    = "licence"
	adRequiresGovernment = "government_sponsor"
)

// Regulators a licence can come from.
const (
	RegulatorSEC              = "SEC"
	RegulatorBoG              = "BoG"
	RegulatorNIC              = "NIC"
	RegulatorGamingCommission = "GamingCommission"
	RegulatorNLA              = "NLA"
)

// adCategory is one selectable category.
type adCategory struct {
	slug, name string
	requires   []string
}

// adCategories are the categories an advertiser may choose, in display order
// (political is set automatically; hard-blocked ones are never listed).
var adCategories = []adCategory{
	{AdCategoryGeneral, "General", nil},
	{AdCategoryEvents, "Events", nil},
	{AdCategoryEducation, "Education", nil},
	{AdCategoryProperty, "Property", nil},
	{AdCategoryJobs, "Jobs", nil},
	{AdCategoryTourism, "Tourism", nil},
	{AdCategoryRetail, "Retail", nil},
	{AdCategoryServices, "Services", nil},
	{AdCategoryReligiousEvents, "Religious events", nil},
	{AdCategoryNGO, "Charities and NGOs", nil},
	{AdCategoryFoodDrink, "Food and drink", []string{adRequiresFDA}},
	{AdCategoryHealthMedicine, "Health and medicine", []string{adRequiresFDA}},
	{AdCategoryHerbal, "Herbal products", []string{adRequiresFDA}},
	{AdCategoryCosmetics, "Cosmetics", []string{adRequiresFDA}},
	{AdCategoryFinancial, "Financial services", []string{adRequiresLicence}},
	{AdCategoryGovernmentPublic, "Government public service", []string{adRequiresGovernment}},
	{AdCategoryAlcohol, "Alcohol", []string{adRequiresFDA}},
	{AdCategoryGambling, "Gambling and lotteries", []string{adRequiresLicence}},
}

// hardBlockedCategories are never accepted, whatever the settings say.
var hardBlockedCategories = []string{
	"tobacco_vape", "crypto_forex", "adult", "weapons", "spiritual_money", "infant_formula", "male_vitality",
}

// adCategoryBySlug finds a selectable category.
func adCategoryBySlug(slug string) (adCategory, bool) {
	for _, c := range adCategories {
		if c.slug == slug {
			return c, true
		}
	}
	return adCategory{}, false
}

// selectableCategories lists the categories open to advertisers now.
func selectableCategories(set domain.AdSettings) []RateCardCategory {
	out := []RateCardCategory{}
	for _, c := range adCategories {
		if slices.Contains(set.BlockedCategories, c.slug) {
			continue
		}
		req := c.requires
		if req == nil {
			req = []string{}
		}
		out = append(out, RateCardCategory{Slug: c.slug, Name: c.name, Requires: req})
	}
	return out
}

// checkCategory validates the category against the hard blocks and the
// settings, and the sponsor it needs.
func checkCategory(category string, set domain.AdSettings, sponsor *domain.AdSponsor) error {
	if slices.Contains(hardBlockedCategories, category) || slices.Contains(set.BlockedCategories, category) {
		return adFieldErr(AdErrCategoryBlocked, adFieldCategory, "Oguaa doesn't accept ads in this category.")
	}
	if _, ok := adCategoryBySlug(category); !ok {
		return adFieldErr(AdErrInvalidCreative, adFieldCategory, "Choose a category from the list.")
	}
	if category == AdCategoryGovernmentPublic && sponsor != nil && sponsor.EntityType != domain.AdEntityGovernment {
		return adFieldErr(AdErrSponsorKindMismatch, adFieldSponsorID, "Government public-service ads need a government sponsor.")
	}
	return nil
}

// fdaCategories need FDA registration and ad approval.
var fdaCategories = []string{AdCategoryFoodDrink, AdCategoryHealthMedicine, AdCategoryHerbal, AdCategoryCosmetics, AdCategoryAlcohol}

// checkCompliance requires the regulator references a category needs and
// that an FDA approval outlives the campaign (today = YYYY-MM-DD).
func checkCompliance(category string, c domain.AdCompliance, endDate, today string) error {
	for _, f := range []struct{ value, field string }{
		{c.FDARegistrationNo, "compliance.fdaRegistrationNo"}, {c.FDAApprovalRef, "compliance.fdaApprovalRef"},
		{c.FDAApprovalExpiresOn, adFieldFDAExpiry}, {c.Regulator, "compliance.regulator"}, {c.LicenceNumber, "compliance.licenceNumber"},
	} {
		if utf8.RuneCountInString(f.value) > maxComplianceRunes {
			return adFieldErr(AdErrComplianceRequired, f.field, "Keep this under 120 characters.")
		}
	}
	switch {
	case slices.Contains(fdaCategories, category):
		return checkFDA(c, endDate, today)
	case category == AdCategoryFinancial:
		return checkLicence(c, []string{RegulatorSEC, RegulatorBoG, RegulatorNIC})
	case category == AdCategoryGambling:
		return checkLicence(c, []string{RegulatorGamingCommission, RegulatorNLA})
	}
	return nil
}

func checkFDA(c domain.AdCompliance, endDate, today string) error {
	required := []struct{ value, field, what string }{
		{c.FDARegistrationNo, "compliance.fdaRegistrationNo", "the FDA registration number"},
		{c.FDAApprovalRef, "compliance.fdaApprovalRef", "the FDA advertising approval reference"},
		{c.FDAApprovalExpiresOn, adFieldFDAExpiry, "when the FDA approval expires"},
		{c.ApprovalUploadID, "compliance.approvalUploadId", "a copy of the FDA approval letter"},
	}
	for _, r := range required {
		if strings.TrimSpace(r.value) == "" {
			return adFieldErr(AdErrComplianceRequired, r.field, "Add "+r.what+".")
		}
	}
	if _, err := time.Parse(time.DateOnly, c.FDAApprovalExpiresOn); err != nil {
		return adFieldErr(AdErrComplianceRequired, adFieldFDAExpiry, "Give the FDA approval expiry as YYYY-MM-DD.")
	}
	if c.FDAApprovalExpiresOn < endDate || c.FDAApprovalExpiresOn < today {
		return adFieldErr(AdErrComplianceRequired, adFieldFDAExpiry, "The FDA approval must last until the campaign ends.")
	}
	return nil
}

func checkLicence(c domain.AdCompliance, regulators []string) error {
	if !slices.Contains(regulators, c.Regulator) {
		return adFieldErr(AdErrComplianceRequired, "compliance.regulator", "Choose the regulator that licenses you: "+strings.Join(regulators, ", ")+".")
	}
	if strings.TrimSpace(c.LicenceNumber) == "" {
		return adFieldErr(AdErrComplianceRequired, "compliance.licenceNumber", "Add your licence number.")
	}
	return nil
}

// ── text screens ────────────────────────────────────────────────────────────

// Phrases ads may never use: they would make an ad look like news or an
// official announcement.
var adBannedPhrases = []string{"breaking", "news flash", "just in", "alert", "official result", "has withdrawn", "has stepped down"}

// Claims refused per category group.
var (
	adHealthClaims    = []string{"cures", "cure", "treats", "heals"}
	adFinancialClaims = []string{"guaranteed returns", "guaranteed return", "guaranteed profit"}
)

// Sponsor names that hide who is paying.
var adSponsorDenylist = []string{"concerned citizens", "friends of", "well-wishers", "well wishers", "committee of friends", "anonymous"}

// foreignCurrencyRe finds dollar prices: "$", "USD", "US$".
var foreignCurrencyRe = regexp.MustCompile(`(?i)\$|\bUSD\b|\bUS\$`)

// containsPhrase matches a lower-case phrase on word boundaries.
func containsPhrase(text, phrase string) bool {
	padded := " " + strings.Join(screenWords(text), " ") + " "
	return strings.Contains(padded, " "+strings.Join(screenWords(phrase), " ")+" ")
}

func anyPhrase(texts []string, phrases []string) bool {
	for _, t := range texts {
		for _, p := range phrases {
			if containsPhrase(t, p) {
				return true
			}
		}
	}
	return false
}

// screenAdText runs every creative rule over the texts an ad shows. It
// returns the first refusal and, for text that may be fine but needs a
// reviewer's eye, the screen's hold reasons as flags.
func screenAdText(category string, texts []string) (flags []string, err error) {
	verdict := ScreenText(texts...)
	if verdict.Block {
		return nil, adErr(AdErrContentBlocked, "This ad breaks our content rules and can't be accepted.")
	}
	if anyPhrase(texts, adBannedPhrases) {
		return nil, adErr(AdErrAdTextNotAllowed, `Ads can't use words that make them look like news, such as "Breaking", "Just in" or "Alert".`)
	}
	for _, t := range texts {
		if foreignCurrencyRe.MatchString(t) {
			return nil, adErr(AdErrForeignCurrency, "Show prices in Ghana cedis (GH₵) only.")
		}
	}
	if slices.Contains(fdaCategories, category) && anyPhrase(texts, adHealthClaims) {
		return nil, adErr(AdErrAdTextNotAllowed, `Ads for these products can't claim to cure or treat anything.`)
	}
	if category == AdCategoryFinancial && anyPhrase(texts, adFinancialClaims) {
		return nil, adErr(AdErrAdTextNotAllowed, `Financial ads can't promise guaranteed returns.`)
	}
	if verdict.Hold {
		for _, r := range verdict.Reasons {
			flags = append(flags, "screen_"+r)
		}
	}
	return flags, nil
}

// checkSponsorNames refuses names that hide the sponsor, and blocked text.
func checkSponsorNames(names ...string) error {
	if anyPhrase(names, adSponsorDenylist) {
		return adErr(AdErrSponsorNameNotAllowed, `Use the sponsor's real name. Names like "Concerned Citizens" or "Friends of" aren't allowed.`)
	}
	if ScreenTerms(names...).Block {
		return adErr(AdErrContentBlocked, "This sponsor name breaks our content rules.")
	}
	return nil
}

// ── links and images ────────────────────────────────────────────────────────

const maxLandingURLLen = 2048

// checkLandingURL accepts only a plain https link to a public host.
func checkLandingURL(raw string) error {
	bad := adFieldErr(AdErrInvalidLandingURL, adFieldLandingURL, "Link to a public https:// web page.")
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > maxLandingURLLen || strings.ContainsAny(raw, " \t\r\n\\") {
		return bad
	}
	u, err := url.Parse(raw)
	if err != nil || !strings.EqualFold(u.Scheme, "https") || u.Opaque != "" || u.User != nil {
		return bad
	}
	host := strings.ToLower(u.Hostname())
	if host == "" || !strings.Contains(host, ".") || net.ParseIP(host) != nil || strings.HasSuffix(host, ".") || !endsInTLD(host) {
		return bad
	}
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".internal") {
		return bad
	}
	return nil
}

// maxComplianceRunes caps each compliance text field.
const maxComplianceRunes = 120

// endsInTLD reports whether host ends in a top-level domain: letters only,
// or an xn-- IDN label. Browsers read a host whose last label is a number
// (127.1, 0x7f.0.0.1) as an IP address.
func endsInTLD(host string) bool {
	tld := host[strings.LastIndex(host, ".")+1:]
	if strings.HasPrefix(tld, "xn--") {
		return len(tld) > 4
	}
	if utf8.RuneCountInString(tld) < 2 {
		return false
	}
	for _, r := range tld {
		if !unicode.IsLetter(r) {
			return false
		}
	}
	return true
}

// checkCloudinaryImage accepts only an image uploaded through Oguaa's own
// signed Cloudinary upload (or one already copied into oguaa/ads/).
func checkCloudinaryImage(raw, cloudName, field string) error {
	bad := adFieldErr(AdErrInvalidImage, field, "Upload the image with the Oguaa uploader.")
	if cloudName == "" {
		return bad
	}
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme != "https" || u.Host != "res.cloudinary.com" || u.User != nil || u.RawQuery != "" {
		return bad
	}
	if !strings.HasPrefix(u.EscapedPath(), "/"+url.PathEscape(cloudName)+"/image/upload/") || strings.Contains(u.Path, "..") {
		return bad
	}
	return nil
}
