// Package emailtmpl renders every Oguaa email from one branded layout.
//
// A Message describes an email structurally (preheader, heading, paragraphs,
// an optional one-time code, an optional button, footer kind) and Render turns
// it into an HTML part and a plain-text part. The HTML is email-client safe:
// layout tables, inline styles, a bulletproof button with an Outlook VML
// fallback, a fluid 600px column and a dark-mode media query. Everything that
// comes from a caller is escaped by html/template, so titles and bodies may
// carry member-written text.
//
// Senders that only take an HTML string (email.Sender, service.EmailSender)
// carry the text part along with Email.Pack; the Resend client calls Prepare,
// which unpacks a rendered email or — for HTML that did not come from this
// package — wraps it in the same branded layout with a transactional footer.
package emailtmpl

import (
	"fmt"
	"html/template"
	"net/url"
	"strings"
)

// Tone sets the email's accent: Default (gold) or Warning (clay), the latter
// for messages about something irreversible, such as deleting an account.
type Tone int

const (
	ToneDefault Tone = iota
	ToneWarning
)

// FooterKind says why the email was sent.
type FooterKind int

const (
	// FooterTransactional is for messages the member asked for (codes,
	// receipts): it explains why they got it and offers no unsubscribe.
	FooterTransactional FooterKind = iota
	// FooterNotification is for notification emails: it adds a "Manage
	// notifications" link and an unsubscribe link.
	FooterNotification
)

// Link is a labelled absolute http(s) URL.
type Link struct {
	Label string
	URL   string
}

// Footer is the small print under the card. Privacy/Terms links and the
// operator line are always added.
type Footer struct {
	Kind FooterKind
	// Reason says why the recipient got this email. Empty → a default for Kind.
	Reason string
	// Hint is an extra sentence after Reason, e.g. where to turn emails off.
	Hint string
	// ManageURL is the notification-settings page (notification footer only).
	ManageURL string
	// UnsubscribeURL is the signed one-click unsubscribe link (notification
	// footer only); UnsubscribeLabel names it (default "Unsubscribe").
	UnsubscribeURL   string
	UnsubscribeLabel string
}

// Message is one email, described structurally.
type Message struct {
	// Title is the document <title>; defaults to Heading.
	Title string
	// Preheader is the inbox preview line (hidden in the body).
	Preheader string
	// Kicker is a small label above the heading.
	Kicker  string
	Heading string
	// Paragraphs are the body copy, shown before the code and the button.
	Paragraphs []string
	// Code is a one-time code, shown large and letter-spaced.
	Code string
	// Button is the primary call to action; its URL is also shown as a small
	// "Or open this link" fallback. Left out when its URL is not absolute
	// http(s).
	Button *Link
	// Links are secondary links shown under the button.
	Links []Link
	// Note is small print at the end of the card.
	Note   string
	Tone   Tone
	Footer Footer
}

// Email is a rendered email: the HTML part and the plain-text part.
type Email struct {
	HTML string
	Text string
}

// Render produces the branded HTML and plain-text parts of m.
func Render(m Message) (Email, error) {
	return render(newView(m))
}

func render(v *view) (Email, error) {
	var b strings.Builder
	if err := layout.Execute(&b, v); err != nil {
		return Email{}, fmt.Errorf("emailtmpl: render: %w", err)
	}
	return Email{HTML: b.String(), Text: renderText(v)}, nil
}

// view is what the layout template sees: a cleaned-up Message plus the
// tone-dependent colours and the pre-built Outlook markup.
type view struct {
	Title      string
	Preheader  string
	Kicker     string
	Heading    string
	Paragraphs []string
	Code       string
	Button     *buttonView
	Links      []Link
	Note       string
	Warning    bool
	Footer     footerView

	// Body/BodyText carry a wrapped fragment (the safety net) instead of
	// Paragraphs; Body has already been parsed and re-serialised.
	Body     template.HTML
	BodyText string

	Accent      template.CSS // the thin rule under the header
	KickerColor template.CSS
}

type buttonView struct {
	Label    string
	URL      string
	MsoStart template.HTML // VML roundrect for Outlook, then the !mso opener
	MsoEnd   template.HTML
}

type footerView struct {
	Notification     bool
	Reason           string
	Hint             string
	ManageURL        string
	UnsubscribeURL   string
	UnsubscribeLabel string
}

func newView(m Message) *view {
	v := &view{
		Title:      clean(m.Title),
		Preheader:  clean(m.Preheader),
		Kicker:     clean(m.Kicker),
		Heading:    clean(m.Heading),
		Paragraphs: cleanAll(m.Paragraphs),
		Code:       clean(m.Code),
		Note:       clean(m.Note),
		Warning:    m.Tone == ToneWarning,
		Footer:     newFooterView(m.Footer),
	}
	if v.Title == "" {
		v.Title = v.Heading
	}
	if v.Title == "" {
		v.Title = brandName
	}
	if m.Button != nil {
		v.Button = newButtonView(*m.Button)
	}
	for _, l := range m.Links {
		if u, ok := webURL(l.URL); ok {
			v.Links = append(v.Links, Link{Label: labelOr(l.Label, u), URL: u})
		}
	}
	v.Accent, v.KickerColor = gold, goldText
	if v.Warning {
		v.Accent, v.KickerColor = clay, clay
	}
	return v
}

func newFooterView(f Footer) footerView {
	fv := footerView{
		Notification: f.Kind == FooterNotification,
		Reason:       clean(f.Reason),
		Hint:         clean(f.Hint),
	}
	if fv.Reason == "" {
		fv.Reason = defaultTransactionalReason
		if fv.Notification {
			fv.Reason = defaultNotificationReason
		}
	}
	if !fv.Notification {
		return fv
	}
	if u, ok := webURL(f.ManageURL); ok {
		fv.ManageURL = u
	}
	if u, ok := webURL(f.UnsubscribeURL); ok {
		fv.UnsubscribeURL = u
		fv.UnsubscribeLabel = labelOr(f.UnsubscribeLabel, "Unsubscribe")
	}
	return fv
}

func newButtonView(b Link) *buttonView {
	u, ok := webURL(b.URL)
	if !ok {
		return nil
	}
	label := labelOr(b.Label, "Open in Oguaa")
	return &buttonView{Label: label, URL: u, MsoStart: msoButton(label, u), MsoEnd: msoButtonEnd}
}

// webURL reports whether raw is an absolute http(s) URL with a host, and
// returns it trimmed. Anything else (relative paths, javascript:, mailto:) is
// refused so a button or link never points somewhere unexpected.
func webURL(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return "", false
	}
	if s := strings.ToLower(u.Scheme); s != "https" && s != "http" {
		return "", false
	}
	return raw, true
}

func labelOr(label, fallback string) string {
	if l := clean(label); l != "" {
		return l
	}
	return fallback
}

// clean trims s and folds runs of whitespace (including newlines) to one
// space; email copy never relies on line breaks inside a paragraph.
func clean(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

func cleanAll(ss []string) []string {
	out := make([]string, 0, len(ss))
	for _, s := range ss {
		if c := clean(s); c != "" {
			out = append(out, c)
		}
	}
	return out
}
