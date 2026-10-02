package service

import (
	"html"

	"github.com/oguaa/backend/internal/platform/emailtmpl"
)

// brandedEmail renders msg into the HTML string an EmailSender takes (packed
// with its plain-text part, see emailtmpl.Email.Pack). Should rendering ever
// fail, the fallback text goes out escaped instead, and the Resend client's
// safety net still wraps it in the branded layout.
func brandedEmail(msg emailtmpl.Message, fallback string) string {
	e, err := emailtmpl.Render(msg)
	if err != nil {
		return "<p>" + html.EscapeString(fallback) + "</p>"
	}
	return e.Pack()
}
