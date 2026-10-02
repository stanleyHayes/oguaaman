// Command emailpreview writes every kind of Oguaa email to a directory as an
// .html file (what mail clients render) plus a .txt file (the plain-text
// part), with an index.html linking them, so they can be opened in a browser
// and screenshotted. It renders through the same code the API sends with:
// the emailtmpl catalog, Service.NotificationEmail and the Resend client's
// safety net (emailtmpl.Prepare).
//
// The header icon lives on the API (/uploads/brand/), so by default the
// previews point it at a local copy written next to them; pass -live-icon to
// keep the production URL.
//
//	go run ./cmd/emailpreview -out /tmp/email-previews
package main

import (
	"flag"
	"fmt"
	"html"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/oguaa/backend/internal/domain"
	"github.com/oguaa/backend/internal/infra/http/brandimg"
	"github.com/oguaa/backend/internal/platform/emailtmpl"
	"github.com/oguaa/backend/internal/service"
)

const (
	portalURL = "https://citizen.oguaaman.com"
	apiURL    = "https://api.oguaaman.com"
	memberID  = "m-preview"
	iconFile  = "email-icon-96.png"
	sampleTTL = 10 * time.Minute
)

type preview struct {
	name, subject, about string
	packed               string // what a service hands to the sender
}

func main() {
	out := flag.String("out", "email-previews", "directory to write the previews to")
	liveIcon := flag.Bool("live-icon", false, "keep the production icon URL instead of a local copy")
	flag.Parse()
	if err := os.MkdirAll(*out, 0o750); err != nil {
		log.Fatal(err)
	}
	icon := emailtmpl.IconURL
	if !*liveIcon {
		png, err := brandimg.FS.ReadFile(iconFile)
		if err != nil {
			log.Fatal(err)
		}
		if err := write(*out, iconFile, string(png)); err != nil {
			log.Fatal(err)
		}
		icon = iconFile
	}
	previews, err := build()
	if err != nil {
		log.Fatal(err)
	}
	for _, p := range previews {
		e := emailtmpl.Prepare(p.packed, p.subject) // exactly what the Resend client sends
		if err := write(*out, p.name+".html", strings.ReplaceAll(e.HTML, emailtmpl.IconURL, icon)); err != nil {
			log.Fatal(err)
		}
		if err := write(*out, p.name+".txt", e.Text); err != nil {
			log.Fatal(err)
		}
	}
	if err := write(*out, "index.html", index(previews)); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("wrote %d email previews to %s\n", len(previews), *out)
}

func build() ([]preview, error) {
	var ps []preview
	for _, c := range []struct {
		name, about string
		msg         emailtmpl.Message
	}{
		{"01-verification-code", "Verification code", emailtmpl.VerificationCode("482913", sampleTTL)},
		{"02-password-reset", "Password reset code", emailtmpl.PasswordResetCode("730154", sampleTTL)},
		{"03-account-deletion", "Account deletion code (warning tone)", emailtmpl.AccountDeletionCode("915372", 15*time.Minute)},
	} {
		e, err := emailtmpl.Render(c.msg)
		if err != nil {
			return nil, err
		}
		ps = append(ps, preview{c.name, c.msg.Title, c.about, e.Pack()})
	}

	svc := service.New(service.Deps{})
	svc.ConfigureOutbound(portalURL, apiURL, "preview-secret")
	note := func(name, about, kind, title, body, link string) {
		ps = append(ps, preview{name, title, about, svc.NotificationEmail(memberID, kind, title, body, link)})
	}
	note("04-notification", "Notification with a link (remembrance)", "remembrance",
		"Today we remember Nana Esi Mensah",
		"It is four years since Nana Esi passed. Light a candle or leave a tribute on her memorial page.",
		"/memoriam/nana-esi-mensah")
	note("05-notification-no-link", "Notification without a link (account)", "approved",
		"Your listing is live",
		"Kofi's Chop Bar is now on Oguaa. People searching for food in Cape Coast can find it.", "")
	note("06-notification-long-title", "Very long title and body (community)", "tribute",
		"Akosua Boatemaa Ansah-Quaicoe, Abena Nyarko Essien-Mensah and 14 others left tributes on the memorial of Opanyin Kwamena Ekow Fynn-Aidoo",
		strings.Repeat("Ayekoo to everyone who came to the Fetu Afahye durbar at Victoria Park this year. ", 6),
		"https://citizen.oguaaman.com/memoriam/opanyin-kwamena-ekow-fynn-aidoo?tab=tributes&sort=newest")
	note("07-notification-hostile", "Hostile HTML in the title and body", "review",
		`<script>alert("title")</script><b>Bold</b> & "quoted" title`,
		`Body with <img src=x onerror=alert(1)> and <a href="javascript:alert(2)">a link</a> & </td></tr></table> end.`,
		"javascript:alert(3)")
	note("08-notification-product", "Product news (opt-in, News from Oguaa)", "product-news",
		"New: festival tickets in the app",
		"You can now buy Fetu Afahye tickets in Oguaa and show them at the gate from your phone.",
		"/festivals/fetu-afahye")

	ps = append(ps,
		preview{"09-safety-net-bare-html", "A receipt for your pledge", "Bare HTML from another team, wrapped by the safety net",
			`<p>Thank you for your pledge of <strong>GHS 50.00</strong> to the Cape Coast Castle restoration fund.</p>` +
				`<p>Your reference is OGUAA-7F3K. <a href="https://citizen.oguaaman.com/me/pledges">See your pledges</a>.</p>`},
		preview{"10-safety-net-plain-text", "Your Oguaa export is ready", "Plain text through the safety net",
			"Your data export is ready.\n\nYou can download it from your profile for the next 7 days."},
		preview{"11-safety-net-full-document", "Weekly digest", "A whole HTML document (head, script, inline handler) through the safety net",
			`<!doctype html><html><head><title>x</title><style>p{color:red}</style><script>alert(1)</script></head>` +
				`<body><h2>This week in Oguaa</h2><p onclick="alert(1)">Three new businesses joined.</p><ul><li>Kofi's Chop Bar</li><li>Ama's Kente</li></ul></body></html>`},
	)
	note("12-notification-long-unbroken", "Unbroken 50+ character token in the title and a long bare URL in the body", "tribute",
		"Kwesi_Arhin_Ekow_Fynn_Aidoo_Cape_Coast_Memorial_Fund",
		"Read the update at https://citizen.oguaaman.com/fundraisers/kwesi-arhin-ekow-fynn-aidoo-memorial-fund-cape-coast-2026?ref=notification_email_tribute_digest before Friday.",
		"/fundraisers/kwesi-arhin-ekow-fynn-aidoo-memorial-fund-cape-coast-2026")
	ad := func(name, about string, c domain.AdCampaign) {
		subject, body, _ := service.AdEmail(&c, portalURL)
		ps = append(ps, preview{name, subject, about, body})
	}
	ad("14-ad-approved", "Advertiser: ad approved, with the Pay button", domain.AdCampaign{
		ID: "ad-preview", Status: domain.AdStatusApproved, StartDate: "2026-10-12", EndDate: "2026-10-25",
		ApprovalExpiresAt: "2026-10-05T09:00:00Z", Price: domain.AdPriceSnapshot{TotalPesewas: 15_000},
		Creative: domain.AdCreative{Headline: "Market days at Kotokuraba"},
	})
	ad("15-ad-removed", "Advertiser: ad removed (warning tone) with the refund line", domain.AdCampaign{
		ID: "ad-preview", Status: domain.AdStatusRemoved, RemovalReason: "The landing page advertised a product we don't accept.",
		BookedImpressions: 10_000, Delivered: 4_200, PaymentStatus: domain.AdPaymentSuccess, RefundOwed: domain.AdRefundRemoved,
		Price: domain.AdPriceSnapshot{TotalPesewas: 50_000}, Creative: domain.AdCreative{Headline: "Fetu Afahye weekend deals"},
	})
	ps = append(ps, preview{"13-safety-net-long-unbroken", "Kwesi_Arhin_Ekow_Fynn_Aidoo_Cape_Coast_Memorial_Fund", "Bare HTML with an unbroken heading and a long bare URL, wrapped by the safety net",
		`<h2>Kwesi_Arhin_Ekow_Fynn_Aidoo_Cape_Coast_Memorial_Fund_Receipt</h2>` +
			`<p>Your receipt: https://citizen.oguaaman.com/me/pledges/receipts/OGUAA-7F3K-2026-10-02-kwesi-arhin-ekow-fynn-aidoo-memorial</p>`})
	return ps, nil
}

func write(dir, name, content string) error {
	return os.WriteFile(filepath.Join(dir, name), []byte(content), 0o600)
}

func index(ps []preview) string {
	var b strings.Builder
	b.WriteString(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Oguaa email previews</title>` +
		`<style>body{font-family:system-ui,sans-serif;margin:2rem;background:#F6F1E7;color:#1A2E22}a{color:#0B6557}li{margin:.4rem 0}</style>` +
		`</head><body><h1>Oguaa email previews</h1><ul>`)
	for _, p := range ps {
		fmt.Fprintf(&b, `<li><a href="%s.html">%s</a> (<a href="%s.txt">text</a>): %s</li>`,
			p.name, html.EscapeString(p.name), p.name, html.EscapeString(p.about))
	}
	b.WriteString(`</ul></body></html>`)
	return b.String()
}
