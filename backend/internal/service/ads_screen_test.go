package service

import (
	"context"
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// Spec §3.4: landing URLs are plain https links to public hosts.
func TestCheckLandingURL(t *testing.T) {
	ok := []string{"https://kotokuraba.test/market", "https://shop.example.com.gh/a?b=c#d", "HTTPS://Example.com"}
	bad := []string{
		"", "//evil.example.com", "http://example.com", "javascript:alert(1)", "data:text/html,hi",
		"https://127.0.0.1/", "https://[::1]/", "https://localhost/", "https://user:pw@example.com/",
		"https://example", "https://exa mple.com", "ftp://example.com", "https:///path", "https://printer.local/",
		"https://example.com/" + string(make([]byte, 2100)),
	}
	for _, u := range ok {
		if err := checkLandingURL(u); err != nil {
			t.Errorf("%q refused: %v", u, err)
		}
	}
	for _, u := range bad {
		if adCode(checkLandingURL(u)) != AdErrInvalidLandingURL {
			t.Errorf("%q accepted", u)
		}
	}
}

func TestCheckCloudinaryImage(t *testing.T) {
	if err := checkCloudinaryImage(adImg, "demo", adFieldImageURL); err != nil {
		t.Fatal(err)
	}
	for _, u := range []string{
		"https://res.cloudinary.com/other/image/upload/v1/a.jpg", "https://evil.test/demo/image/upload/a.jpg",
		"http://res.cloudinary.com/demo/image/upload/a.jpg", "https://res.cloudinary.com/demo/video/upload/a.mp4",
		"https://res.cloudinary.com/demo/image/upload/../../x.jpg", "https://u@res.cloudinary.com/demo/image/upload/a.jpg",
	} {
		if adCode(checkCloudinaryImage(u, "demo", adFieldImageURL)) != AdErrInvalidImage {
			t.Errorf("%q accepted", u)
		}
	}
	if adCode(checkCloudinaryImage(adImg, "", adFieldImageURL)) != AdErrInvalidImage {
		t.Error("without a configured cloud no image is accepted")
	}
}

// Submission screens: banned words, foreign currency, blocked categories,
// health and financial claims, sponsor names, creatives and consents.
func TestSubmitScreens(t *testing.T) {
	f := newAdFix(t)
	cases := map[string]struct {
		mutate func(*AdSubmitInput)
		code   string
	}{
		"breaking news":                         {func(in *AdSubmitInput) { in.Creative.Headline = "BREAKING: market prices fall" }, AdErrAdTextNotAllowed},
		"just in":                               {func(in *AdSubmitInput) { in.Creative.Body = "Just in at Kotokuraba" }, AdErrAdTextNotAllowed},
		"has withdrawn":                         {func(in *AdSubmitInput) { in.Creative.Body = "The candidate has withdrawn" }, AdErrAdTextNotAllowed},
		"dollar price":                          {func(in *AdSubmitInput) { in.Creative.Body = "Only $5 a bag" }, AdErrForeignCurrency},
		"usd price":                             {func(in *AdSubmitInput) { in.Creative.Body = "From 20 USD" }, AdErrForeignCurrency},
		"threat":                                {func(in *AdSubmitInput) { in.Creative.Body = "I will kill you" }, AdErrContentBlocked},
		"hard blocked":                          {func(in *AdSubmitInput) { in.Category = "crypto_forex" }, AdErrCategoryBlocked},
		"alcohol blocked":                       {func(in *AdSubmitInput) { in.Category = AdCategoryAlcohol }, AdErrCategoryBlocked},
		"unknown category":                      {func(in *AdSubmitInput) { in.Category = "spaceships" }, AdErrInvalidCreative},
		"fda missing":                           {func(in *AdSubmitInput) { in.Category = AdCategoryHerbal }, AdErrComplianceRequired},
		"no licence":                            {func(in *AdSubmitInput) { in.Category = AdCategoryFinancial }, AdErrComplianceRequired},
		"no headline":                           {func(in *AdSubmitInput) { in.Creative.Headline = "" }, AdErrInvalidCreative},
		"long alt":                              {func(in *AdSubmitInput) { in.Creative.Alt = string(make([]rune, 126)) }, AdErrInvalidCreative},
		"foreign image":                         {func(in *AdSubmitInput) { in.Creative.ImageURL = "https://evil.test/ad.jpg" }, AdErrInvalidImage},
		"no image":                              {func(in *AdSubmitInput) { in.Creative.ImageURL = "" }, AdErrInvalidCreative},
		"bad landing":                           {func(in *AdSubmitInput) { in.Creative.LandingURL = "//evil.test" }, AdErrInvalidLandingURL},
		"no consent":                            {func(in *AdSubmitInput) { in.StartConsent = false }, AdErrTermsNotAccepted},
		"not my sponsor":                        {func(in *AdSubmitInput) { in.SponsorID = "asp-nobody" }, AdErrSponsorNotFound},
		"political sponsor":                     {func(in *AdSubmitInput) { in.Political, in.PoliticalType = true, domain.AdPoliticalIssue }, AdErrSponsorKindMismatch},
		"government needs a government sponsor": {func(in *AdSubmitInput) { in.Category = AdCategoryGovernmentPublic }, AdErrSponsorKindMismatch},
	}
	for name, c := range cases {
		in := submitInput()
		c.mutate(&in)
		if _, err := f.svc.Submit(context.Background(), adMember, "payer@example.test", in); adCode(err) != c.code {
			t.Errorf("%s: err = %v, want %s", name, err, c.code)
		}
	}
	if n := len(f.ads.Rows); n != 0 {
		t.Fatalf("%d refused submissions were stored", n)
	}
}

func TestSubmitRegulatedCategories(t *testing.T) {
	f := newAdFix(t)
	fda := func(in *AdSubmitInput) {
		in.Category = AdCategoryHerbal
		in.Compliance = AdComplianceInput{FDARegistrationNo: "FDA/HD/1", FDAApprovalRef: "FDA/AD/2", FDAApprovalExpiresOn: "2027-01-01", ApprovalUploadID: "private:pu-1"}
	}
	c := f.submit(fda)
	if c.Category != AdCategoryHerbal || c.Compliance.ApprovalUploadID != "pu-1" {
		t.Fatalf("herbal ad = %+v", c.Compliance)
	}
	in := submitInput()
	fda(&in)
	in.Compliance.FDAApprovalExpiresOn = "2026-10-10" // before the campaign ends
	if _, err := f.svc.Submit(context.Background(), adMember, "", in); adCode(err) != AdErrComplianceRequired {
		t.Fatalf("expiring approval: %v", err)
	}
	fda(&in)
	in.Creative.Body = "Cures malaria in three days"
	if _, err := f.svc.Submit(context.Background(), adMember, "", in); adCode(err) != AdErrAdTextNotAllowed {
		t.Fatalf("cure claim: %v", err)
	}
	fin := submitInput()
	fin.Category = AdCategoryFinancial
	fin.Compliance = AdComplianceInput{Regulator: RegulatorGamingCommission, LicenceNumber: "L1"}
	if _, err := f.svc.Submit(context.Background(), adMember, "", fin); adCode(err) != AdErrComplianceRequired {
		t.Fatalf("wrong regulator: %v", err)
	}
	fin.Compliance.Regulator = RegulatorSEC
	fin.Creative.Body = "Guaranteed returns every month"
	if _, err := f.svc.Submit(context.Background(), adMember, "", fin); adCode(err) != AdErrAdTextNotAllowed {
		t.Fatalf("guaranteed returns: %v", err)
	}
	fin.Creative.Body = "Licensed savings with Cape Coast Rural Bank"
	if _, err := f.svc.Submit(context.Background(), adMember, "", fin); err != nil {
		t.Fatalf("licensed financial ad: %v", err)
	}
	// Unblocked gambling needs a Gaming Commission or NLA licence.
	g := newAdFix(t, func(s *domain.AdSettings) { s.BlockedCategories = []string{AdCategoryAlcohol} })
	gam := submitInput()
	gam.Category = AdCategoryGambling
	if _, err := g.svc.Submit(context.Background(), adMember, "", gam); adCode(err) != AdErrComplianceRequired {
		t.Fatalf("gambling without licence: %v", err)
	}
	gam.Compliance = AdComplianceInput{Regulator: RegulatorNLA, LicenceNumber: "NLA-9"}
	if _, err := g.svc.Submit(context.Background(), adMember, "", gam); err != nil {
		t.Fatalf("licensed gambling: %v", err)
	}
}

func TestSubmitRecordsAPendingCampaign(t *testing.T) {
	f := newAdFix(t)
	c := f.submit(func(in *AdSubmitInput) {
		in.Creative.ImageURLDesktop = adImg // not used by a card
	})
	stored := f.ads.Peek(c.ID)
	if stored.Status != domain.AdStatusPendingReview || stored.PaymentStatus != domain.AdPaymentNone || stored.MemberID != adMember ||
		stored.Email != "payer@example.test" || stored.StartConsentAt == "" || stored.Creative.Format != domain.AdFormatCard ||
		stored.Creative.ImageURLDesktop != "" || stored.SponsorLine != "Sponsored · Kotokuraba Traders" || len(stored.StatusHistory) != 1 {
		t.Fatalf("stored = %+v", stored)
	}
	if stored.QuoteExpiresAt != adNow.Add(adQuoteValidFor).Format("2006-01-02T15:04:05Z07:00") {
		t.Fatalf("quote expiry = %q", stored.QuoteExpiresAt)
	}
	// A screen hold (a phone number in the copy) is a reviewer flag, not a refusal.
	held := f.submit(func(in *AdSubmitInput) { in.Creative.Body = "Call 0555 180 048 to order" })
	admin, err := f.svc.AdminCampaign(context.Background(), held.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(admin.Flags) == 0 || admin.Flags[0] != "screen_"+ScreenPrivateInfo || admin.MemberID != adMember || admin.Sponsor == nil || admin.Sponsor.Phone == "" {
		t.Fatalf("admin view = %+v", admin)
	}
}

func TestSubmitBanner(t *testing.T) {
	f := newAdFix(t)
	in := submitInput()
	in.Placement = domain.AdPlacementPortalHomeBanner
	if _, err := f.svc.Submit(context.Background(), adMember, "", in); adCode(err) != AdErrInvalidCreative {
		t.Fatalf("banner without both images: %v", err)
	}
	in.Creative.ImageURLDesktop, in.Creative.ImageURLMobile = adImg, adImg
	c, err := f.svc.Submit(context.Background(), adMember, "", in)
	if err != nil {
		t.Fatal(err)
	}
	if c.Creative.Format != domain.AdFormatBanner || c.Creative.ImageURL != "" || c.Creative.Headline != "" {
		t.Fatalf("banner creative = %+v", c.Creative)
	}
}
