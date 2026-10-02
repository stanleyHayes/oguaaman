package emailtmpl

import (
	"html"
	"strings"
	"testing"
	"time"
)

const (
	testURL      = "https://citizen.oguaaman.com/memoriam/nana-esi"
	testUnsub    = "https://api.oguaaman.com/api/notifications/unsubscribe?token=abc.def"
	testManage   = "https://citizen.oguaaman.com/me"
	hostileTitle = `<script>alert("x")</script> Nana & "Esi"`
)

func mustRender(t *testing.T, m Message) Email {
	t.Helper()
	e, err := Render(m)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	return e
}

func assertContains(t *testing.T, what, s string, wants ...string) {
	t.Helper()
	for _, w := range wants {
		if !strings.Contains(s, w) {
			t.Errorf("%s is missing %q", what, w)
		}
	}
}

func assertLacks(t *testing.T, what, s string, bads ...string) {
	t.Helper()
	for _, b := range bads {
		if strings.Contains(s, b) {
			t.Errorf("%s must not contain %q", what, b)
		}
	}
}

// The document is email-client safe: doctype, language, charset, viewport,
// colour-scheme metas, presentation tables, the 600px fluid column, the dark
// mode query, and no scripts, flexbox or grid.
func TestRender_emailSafeDocument(t *testing.T) {
	e := mustRender(t, Message{Heading: "Hello", Paragraphs: []string{"Body"}, Preheader: "Preview line", Note: "Small print"})
	assertContains(t, "html", e.HTML,
		"<!doctype html>", `<html lang="en"`, `<meta charset="utf-8">`,
		`<meta name="viewport" content="width=device-width, initial-scale=1">`,
		`<meta name="color-scheme" content="light dark">`,
		`<meta name="supported-color-schemes" content="light dark">`,
		LayoutMarker, `role="presentation"`, `max-width:600px`, `width="600"`,
		"@media (prefers-color-scheme:dark)", "@media only screen and (max-width:620px)",
		"<!--[if mso]>", "Preview line", "display:none",
		// The wordmark is text, so it shows with images off; the icon beside
		// it is decorative (alt="") so a blocked image collapses instead of
		// printing "Oguaa" twice.
		`alt=""`, IconURL, ">Oguaa</td>",
		`<p class="t-small note"`, ".note{border-top-color:#24503E !important}",
	)
	if !strings.HasPrefix(IconURL, "https://api.oguaaman.com/uploads/brand/") {
		t.Errorf("IconURL %q must be served by the API (the web origins challenge image proxies)", IconURL)
	}
	assertLacks(t, "html", e.HTML, "<script", "display:flex", "display:grid", `rel="stylesheet" href="/`)
	if !IsBranded(e.HTML) {
		t.Error("rendered email is not recognised as branded")
	}
}

// Member text is escaped everywhere it appears; nothing hostile survives as
// markup.
func TestRender_escapesHostileText(t *testing.T) {
	e := mustRender(t, Message{
		Title: hostileTitle, Preheader: hostileTitle, Kicker: hostileTitle, Heading: hostileTitle,
		Paragraphs: []string{`<img src=x onerror=alert(1)> </td></table>`},
		Note:       "<b>note</b>",
		Button:     &Link{Label: "<i>Go</i>", URL: testURL},
		Links:      []Link{{Label: "<u>more</u>", URL: testURL}},
	})
	assertLacks(t, "html", e.HTML, "<script>", "<img src=x", "</td></table>", "<b>note", "<i>Go", "<u>more")
	assertContains(t, "html", e.HTML, "&lt;script&gt;", "&lt;img src=x onerror=alert(1)&gt;", "&lt;i&gt;Go&lt;/i&gt;")
	// The text part is plain text: it carries the words as written.
	assertContains(t, "text", e.Text, hostileTitle)
}

// The button is a bulletproof table button with an Outlook VML fallback, at
// least 44px tall, and its URL is repeated as a fallback link.
func TestRender_buttonAndFallbackLink(t *testing.T) {
	e := mustRender(t, Message{Heading: "H", Button: &Link{Label: "Open in Oguaa", URL: testURL}})
	assertContains(t, "html", e.HTML,
		`bgcolor="#123F2D"`, `class="btn" href="`+testURL+`"`, "padding:14px 28px", "line-height:20px",
		"border-radius:10px", "<v:roundrect", `href="`+testURL+`" style="height:48px`, "<!--[if !mso]><!-->", "<!--<![endif]-->",
		"Or open this link:", ">"+testURL+"</a>",
	)
	assertContains(t, "text", e.Text, "Open in Oguaa: "+testURL)
}

// Buttons and links only ever point at absolute http(s) URLs.
func TestRender_refusesUnsafeOrRelativeURLs(t *testing.T) {
	for _, u := range []string{"javascript:alert(1)", "/memoriam/x", "mailto:a@b.c", "data:text/html,hi", ""} {
		e := mustRender(t, Message{Heading: "H", Button: &Link{Label: "Go", URL: u}, Links: []Link{{Label: "More", URL: u}}})
		assertLacks(t, "html for "+u, e.HTML, `class="btn"`, "Or open this link", ">More</a>")
		if u != "" {
			assertLacks(t, "html for "+u, e.HTML, `href="`+u)
		}
	}
}

func TestRender_secondaryLinksAndCode(t *testing.T) {
	e := mustRender(t, Message{
		Heading: "H", Code: "482913",
		Links: []Link{{Label: "Your pledges", URL: "https://citizen.oguaaman.com/me/pledges"}},
	})
	assertContains(t, "html", e.HTML, `class="code"`, ">482913</td>", "letter-spacing:8px", "#ECE4D3",
		`href="https://citizen.oguaaman.com/me/pledges"`, ">Your pledges</a>")
	assertContains(t, "text", e.Text, "\n\n482913\n\n", "Your pledges: https://citizen.oguaaman.com/me/pledges")
}

// Both footers carry the operator line and the Privacy and Terms links; only
// the notification footer has Manage notifications and Unsubscribe.
func TestRender_footerVariants(t *testing.T) {
	tx := mustRender(t, Message{Heading: "H", Footer: Footer{Reason: "Because you asked."}})
	nf := mustRender(t, Message{Heading: "H", Footer: Footer{
		Kind: FooterNotification, Reason: "Because you follow this.", Hint: "Turn these off in Settings › Notifications.",
		ManageURL: testManage, UnsubscribeURL: testUnsub, UnsubscribeLabel: "Unsubscribe from remembrances",
	}})
	for name, e := range map[string]Email{"transactional": tx, "notification": nf} {
		assertContains(t, name+" html", e.HTML, operatorHTML, `href="`+privacyURL+`"`, `href="`+termsURL+`"`)
		assertContains(t, name+" text", e.Text, OperatorLine, "Privacy: "+privacyURL, "Terms: "+termsURL)
	}
	assertContains(t, "transactional html", tx.HTML, "Because you asked.")
	assertLacks(t, "transactional html", tx.HTML, "Manage notifications", "Unsubscribe")
	assertContains(t, "notification html", nf.HTML, "Because you follow this. Turn these off in Settings › Notifications.",
		`href="`+testManage+`"`, ">Manage notifications</a>",
		`href="https://api.oguaaman.com/api/notifications/unsubscribe?token=abc.def"`, ">Unsubscribe from remembrances</a>")
	assertContains(t, "notification text", nf.Text, "Manage notifications: "+testManage, "Unsubscribe from remembrances: "+testUnsub)

	// A notification footer without signed links still says why, and links nothing it can't.
	bare := mustRender(t, Message{Heading: "H", Footer: Footer{Kind: FooterNotification}})
	assertContains(t, "bare notification html", bare.HTML, html.EscapeString(defaultNotificationReason))
	assertLacks(t, "bare notification html", bare.HTML, "Manage notifications", "Unsubscribe")
}

func TestRender_warningTone(t *testing.T) {
	def := mustRender(t, Message{Kicker: "K", Heading: "H"})
	warn := mustRender(t, Message{Kicker: "K", Heading: "H", Tone: ToneWarning})
	assertContains(t, "default html", def.HTML, `bgcolor="#B07D32"`, "color:#8A5E1F")
	assertContains(t, "warning html", warn.HTML, `bgcolor="#B0503C"`, "color:#B0503C", `class="t-warn"`)
	assertLacks(t, "warning html", warn.HTML, `bgcolor="#B07D32"`)
}

func TestCatalog_codeEmails(t *testing.T) {
	cases := []struct {
		name  string
		msg   Message
		wants []string
	}{
		{"verification", VerificationCode("482913", 10*time.Minute), []string{"Your verification code", "10 minutes", "Never share"}},
		{"reset", PasswordResetCode("730154", 10*time.Minute), []string{"Reset your password", "10 minutes", "ignore this email"}},
		{"deletion", AccountDeletionCode("915372", 15*time.Minute), []string{"delete your account", "15 minutes", "ignore this email and nothing will change"}},
	}
	for _, c := range cases {
		e := mustRender(t, c.msg)
		assertContains(t, c.name+" html", e.HTML, append([]string{c.msg.Code}, c.wants...)...)
		assertContains(t, c.name+" text", e.Text, append([]string{c.msg.Code}, c.wants...)...)
		assertLacks(t, c.name+" copy", e.Text, "!")
	}
	if AccountDeletionCode("1", time.Minute).Tone != ToneWarning {
		t.Error("the account-deletion email must use the warning tone")
	}
}

func TestCatalog_notification(t *testing.T) {
	withLink := mustRender(t, NotificationMessage(Notification{Title: "Today we remember Nana Esi", Body: "Da yie.", Link: testURL}))
	assertContains(t, "html", withLink.HTML, ">Today we remember Nana Esi</h1>", ">Open in Oguaa</a>", "Da yie.")

	noLink := mustRender(t, NotificationMessage(Notification{Title: "T", Body: "B"}))
	assertLacks(t, "no-link html", noLink.HTML, `class="btn"`, "Or open this link")

	inApp := mustRender(t, NotificationMessage(Notification{Title: "T", Body: "B", Link: "/memoriam/x"}))
	assertContains(t, "in-app html", inApp.HTML, "See details in the Oguaa app: /memoriam/x")

	script := mustRender(t, NotificationMessage(Notification{Title: "T", Body: "B", Link: "javascript:alert(1)"}))
	assertLacks(t, "script-link html", script.HTML, "javascript:")
}

func TestPackAndPrepare_roundTrip(t *testing.T) {
	e := mustRender(t, Message{Heading: "Hello", Paragraphs: []string{"Body -- with --> arrows"}})
	got := Prepare(e.Pack(), "Subject")
	if got.HTML != e.HTML || got.Text != e.Text {
		t.Fatalf("Prepare(Pack()) changed the email:\nhtml equal=%v\ntext=%q\nwant=%q", got.HTML == e.HTML, got.Text, e.Text)
	}
	assertLacks(t, "sent html", got.HTML, textMarker)

	// A rendered email that lost its text comment gets a derived text part.
	derived := Prepare(e.HTML, "Subject")
	assertContains(t, "derived text", derived.Text, "Hello", "Body -- with --> arrows", OperatorLine)
}

// The safety net: HTML that did not come from Render is wrapped in the
// branded layout with a transactional footer and gets a text part.
func TestPrepare_wrapsBareHTML(t *testing.T) {
	got := Prepare(`<p>Your pledge of <strong>GHS 50</strong> is in. <a href="https://citizen.oguaaman.com/me">See it</a></p><script>alert(1)</script>`, "Pledge received")
	if !IsBranded(got.HTML) {
		t.Fatal("wrapped email is not branded")
	}
	assertContains(t, "html", got.HTML, "<title>Pledge received</title>", "<strong>GHS 50</strong>",
		`<a href="https://citizen.oguaaman.com/me" class="t-link" style="color:#0B6557;text-decoration:underline;">See it</a>`,
		// No heading of its own, so the subject becomes the card's heading.
		`<h1 class="h1 t-head"`, ">Pledge received</h1>",
		html.EscapeString(defaultTransactionalReason), operatorHTML)
	assertLacks(t, "html", got.HTML, "<script>alert", "Unsubscribe")
	assertContains(t, "text", got.Text, "Pledge received\n\nYour pledge of GHS 50 is in. See it (https://citizen.oguaaman.com/me)", OperatorLine)
	assertLacks(t, "text", got.Text, "<p>", "alert(1)")
}

func TestPrepare_wrapsDocumentsAndPlainText(t *testing.T) {
	doc := Prepare(`<!doctype html><html><head><title>Old</title><style>p{color:red}</style></head><body><p onclick="x()">Hi <a href="javascript:x()">there</a></p></body></html>`, "Digest")
	assertContains(t, "doc html", doc.HTML, "Hi ", ">there</a>")
	assertLacks(t, "doc html", doc.HTML, "<title>Old", "color:red", "onclick", "javascript:")
	assertLacks(t, "doc text", doc.Text, "javascript:", "x()")
	if strings.Count(doc.HTML, "<html") != 1 || strings.Count(doc.HTML, "<body") != 1 {
		t.Error("a wrapped document must not nest html/body elements")
	}

	plain := Prepare("Your export is ready.\n\nIt stays available for 7 days.", "Export ready")
	assertContains(t, "plain html", plain.HTML, ">Your export is ready.</p>", ">It stays available for 7 days.</p>")
	assertContains(t, "plain html", plain.HTML, ">Export ready</h1>")
	assertContains(t, "plain text", plain.Text, "Export ready\n\nYour export is ready.\n\nIt stays available for 7 days.")
}

// Wrapped fragments stay legible in dark mode: every text element carries a
// class the dark-mode query recolours, even when it brings its own inline
// colour, and a fragment with its own heading gets no second one.
func TestPrepare_fragmentDarkMode(t *testing.T) {
	got := Prepare(`<h2>This week in Oguaa</h2><p style="color:#4A5A50">Two new businesses.</p><ul><li>Kofi's Chop Bar</li><li>Ama's Kente</li></ul><h3>Also</h3><table><tr><td>Cell</td></tr></table>`, "Weekly digest")
	assertContains(t, "html", got.HTML,
		`<h2 class="t-head" style=`, `<p style="color:#4A5A50" class="t-body">`, `<li class="t-body">`,
		`<h3 class="t-head" style=`, `<td class="t-body">`,
		".t-head{color:#F6F1E7 !important}", ".t-body,.fragment{color:#D6DDD7 !important}",
		".fragment h1,.fragment h2,.fragment h3,.fragment h4{color:#F6F1E7 !important}",
		".fragment p,.fragment li,.fragment td,",
	)
	assertLacks(t, "html", got.HTML, ">Weekly digest</h1>")
	assertContains(t, "text", got.Text, "This week in Oguaa\n\nTwo new businesses.\n\n- Kofi's Chop Bar\n- Ama's Kente\n\nAlso")
}

func TestPlainText(t *testing.T) {
	got := PlainText(`<div style="display:none">preheader</div><h1>Title</h1><p>One <a href="https://x.test/a">link</a> and <a href="https://x.test/b">https://x.test/b</a>.</p><ul><li>A</li><li>B</li></ul>`)
	want := "Title\n\nOne link (https://x.test/a) and https://x.test/b.\n\n- A\n- B"
	if got != want {
		t.Errorf("PlainText = %q, want %q", got, want)
	}
	// Items wrapped in paragraphs keep their bullets; separate lists stay
	// separate paragraphs; empty items vanish.
	got = PlainText(`<ul><li><p>A</p></li><li></li><li>B</li></ul><p>Between</p><ol><li>C</li></ol>`)
	want = "- A\n- B\n\nBetween\n\n- C"
	if got != want {
		t.Errorf("PlainText(lists) = %q, want %q", got, want)
	}
}

// Golden-ish structure check: the order of the card is kicker, heading,
// paragraphs, code, button, fallback link, links, note, then the footer.
func TestRender_cardOrder(t *testing.T) {
	e := mustRender(t, Message{
		Kicker: "KICK", Heading: "HEAD", Paragraphs: []string{"PARA"}, Code: "CODE1",
		Button: &Link{Label: "BTN", URL: testURL}, Links: []Link{{Label: "LINK2", URL: testURL}}, Note: "NOTE",
		Footer: Footer{Reason: "WHY"},
	})
	order := []string{">KICK<", ">HEAD<", ">PARA<", ">CODE1<", ">BTN<", "Or open this link", ">LINK2<", ">NOTE<", ">WHY<", operatorHTML}
	body := e.HTML[strings.Index(e.HTML, "<body"):]
	last := -1
	for _, s := range order {
		i := strings.Index(body, s)
		if i <= last {
			t.Fatalf("%q is out of order (at %d, previous at %d)", s, i, last)
		}
		last = i
	}
	wantText := "OGUAA\n\nKICK\n\nHEAD\n\nPARA\n\nCODE1\n\nBTN: " + testURL + "\n\nLINK2: " + testURL + "\n\nNOTE\n\n--\n\nWHY\nPrivacy: " + privacyURL + "\nTerms: " + termsURL + "\n" + OperatorLine
	if e.Text != wantText {
		t.Errorf("text part =\n%s\nwant\n%s", e.Text, wantText)
	}
}

// An unbroken run (a pasted URL, a long underscore-joined name) must be
// allowed to break, or the 600px column stretches past a phone's width.
func TestRender_longUnbrokenTextWraps(t *testing.T) {
	long := strings.Repeat("Kwesi_Arhin_", 8)
	e := mustRender(t, Message{
		Kicker: long, Heading: long, Paragraphs: []string{"See https://citizen.oguaaman.com/fundraisers/" + long},
		Note: long, Footer: Footer{Reason: long},
	})
	for _, open := range []string{`<p class="t-kicker"`, `<h1 class="h1 t-head"`, `<p class="t-body"`, `<p class="t-small note"`} {
		i := strings.Index(e.HTML, open)
		if i < 0 {
			t.Fatalf("missing %s", open)
		}
		tag := e.HTML[i : i+strings.Index(e.HTML[i:], ">")]
		if !strings.Contains(tag, "overflow-wrap:anywhere") || !strings.Contains(tag, "word-break:break-word") {
			t.Errorf("%s has no wrap rule: %s", open, tag)
		}
	}
	assertContains(t, "style block", e.HTML, ".h1,.t-body,.t-small,.t-kicker,.t-warn,.fragment,.fragment *{overflow-wrap:anywhere;word-break:break-word}")
	// The footer reason line wraps too.
	i := strings.Index(e.HTML, ">"+long+"</p>\n<p class=\"t-small\"")
	if i < 0 || !strings.Contains(e.HTML[strings.LastIndex(e.HTML[:i], "<p"):i], "overflow-wrap:anywhere") {
		t.Error("the footer reason line has no wrap rule")
	}

	// Wrapped fragments: the container and the restyled elements wrap.
	got := Prepare(`<h2>`+long+`</h2><p>`+long+`</p>`, "Subject")
	assertContains(t, "wrapped html", got.HTML,
		`<div class="fragment t-body" style="font-family:`+fontStack+`;font-size:16px;line-height:26px;`+wrapCSS,
		`<h2 class="t-head" style="margin:0 0 12px;font-family:`+html.EscapeString(fontStack)+`;font-size:20px;line-height:28px;font-weight:700;`+wrapCSS,
		`<p class="t-body" style="margin:0 0 16px;font-family:`+html.EscapeString(fontStack)+`;font-size:16px;line-height:26px;`+wrapCSS)
}

// The operator line keeps its registration reference and phone number whole,
// links the phone and address in brand colours (so Gmail and Apple Mail do
// not auto-link them in their own blue), and stays plain in the text part.
func TestRender_operatorLine(t *testing.T) {
	e := mustRender(t, Message{Heading: "H"})
	assertContains(t, "html", e.HTML,
		"Oguaa is operated by Dev Track (BN843072020), ",
		`<span style="white-space:nowrap;">GE-161-2814</span>`,
		`<a class="f-link" href="tel:+233555180048" style="color:#123F2D;text-decoration:underline;white-space:nowrap;">+233&nbsp;55&nbsp;518&nbsp;0048</a>`,
		`<a class="f-link" href="mailto:hello@oguaaman.com" style="color:#123F2D;text-decoration:underline;">hello@oguaaman.com</a>`,
		"a[x-apple-data-detectors]{color:inherit !important;")
	assertLacks(t, "html", e.HTML, "%FOREST%", "%OPERATOR%", "%WRAP%")
	assertContains(t, "text", e.Text, "\n"+OperatorLine)
}
