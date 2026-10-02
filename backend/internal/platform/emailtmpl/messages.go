package emailtmpl

import (
	"fmt"
	"strings"
	"time"
)

// The copy for each kind of email Oguaa sends. Plain words, sentence case, no
// exclamation marks. Services build their message here so the preview command
// shows exactly what members get.

// Subjects of the code emails.
const (
	SubjectVerificationCode = "Your Oguaa verification code"
	SubjectPasswordReset    = "Your Oguaa password reset code"
	SubjectAccountDeletion  = "Your Oguaa account deletion code"
)

const neverShare = "Never share this code with anyone. Oguaa will never ask you for it by phone, WhatsApp or email."

// VerificationCode is the email that confirms a member's contact details.
func VerificationCode(code string, ttl time.Duration) Message {
	return Message{
		Title:      SubjectVerificationCode,
		Preheader:  fmt.Sprintf("Your code is %s. It expires in %s.", code, minutes(ttl)),
		Kicker:     "Verify your account",
		Heading:    "Your verification code",
		Paragraphs: []string{fmt.Sprintf("Enter this code in Oguaa to confirm it's you. It expires in %s.", minutes(ttl))},
		Code:       code,
		Note:       neverShare,
		Footer: Footer{Reason: "You're getting this email because someone asked to verify an Oguaa account with this address. " +
			"If that wasn't you, you can ignore it."},
	}
}

// PasswordResetCode is the email that lets a member choose a new password
// (and claim an invited account).
func PasswordResetCode(code string, ttl time.Duration) Message {
	return Message{
		Title:      SubjectPasswordReset,
		Preheader:  fmt.Sprintf("Use %s to reset your password. It expires in %s.", code, minutes(ttl)),
		Kicker:     "Account security",
		Heading:    "Reset your password",
		Paragraphs: []string{fmt.Sprintf("Enter this code in Oguaa to choose a new password. It expires in %s.", minutes(ttl))},
		Code:       code,
		Note:       "If you didn't ask to reset your password, you can ignore this email. Your password won't change. " + neverShare,
		Footer:     Footer{Reason: "You're getting this email because someone asked to reset the password of the Oguaa account that uses this address."},
	}
}

// AccountDeletionCode is the email that confirms a request to delete an
// account. It uses the warning tone: the deletion can't be undone.
func AccountDeletionCode(code string, ttl time.Duration) Message {
	return Message{
		Title:     SubjectAccountDeletion,
		Preheader: fmt.Sprintf("Your code is %s. It expires in %s.", code, minutes(ttl)),
		Kicker:    "Account deletion",
		Heading:   "Confirm you want to delete your account",
		Paragraphs: []string{
			"Someone asked to delete the Oguaa account that uses this email address. Enter this code in Oguaa to confirm. " +
				"Your account and personal data will be deleted, and this can't be undone.",
			fmt.Sprintf("The code expires in %s.", minutes(ttl)),
		},
		Code:   code,
		Note:   "If you did not ask to delete your account, ignore this email and nothing will change. " + neverShare,
		Tone:   ToneWarning,
		Footer: Footer{Reason: "You're getting this email because someone asked to delete the Oguaa account that uses this address."},
	}
}

// Notification is a notification mirrored to email.
type Notification struct {
	Kicker string // the notification's category, e.g. "Remembrance"
	Title  string
	Body   string
	// Link is where the notification leads: an absolute http(s) URL becomes
	// the "Open in Oguaa" button; an in-app path ("/me") is shown as text
	// (no portal origin to make it absolute); anything else is left out.
	Link string
	// Footer: why the member gets it, where to turn it off, and the signed
	// one-click unsubscribe link.
	Reason, Hint, ManageURL, UnsubscribeURL, UnsubscribeLabel string
}

// OpenInOguaa labels a notification email's button.
const OpenInOguaa = "Open in Oguaa"

// NotificationMessage lays out a notification email.
func NotificationMessage(n Notification) Message {
	m := Message{
		Title:      n.Title,
		Preheader:  firstWords(n.Body),
		Kicker:     n.Kicker,
		Heading:    n.Title,
		Paragraphs: strings.Split(n.Body, "\n"),
		Footer: Footer{
			Kind: FooterNotification, Reason: n.Reason, Hint: n.Hint, ManageURL: n.ManageURL,
			UnsubscribeURL: n.UnsubscribeURL, UnsubscribeLabel: n.UnsubscribeLabel,
		},
	}
	link := strings.TrimSpace(n.Link)
	if _, ok := webURL(link); ok {
		m.Button = &Link{Label: OpenInOguaa, URL: link}
	} else if strings.HasPrefix(link, "/") {
		m.Paragraphs = append(m.Paragraphs, "See details in the Oguaa app: "+link)
	}
	return m
}

// AdUpdate is an email to an advertiser about their own campaign: approved,
// not approved, live, finished or removed. It is transactional (about an
// order they placed), never marketing, so it has no unsubscribe link.
type AdUpdate struct {
	Subject    string
	Heading    string
	Paragraphs []string
	// Button leads to the campaign's page on the portal (to pay, or to see
	// its delivery).
	Button *Link
	// Warning uses the clay tone (the ad was removed).
	Warning bool
}

// AdUpdateMessage lays out an advertiser email.
func AdUpdateMessage(u AdUpdate) Message {
	m := Message{
		Title:      u.Subject,
		Preheader:  firstWords(strings.Join(u.Paragraphs, " ")),
		Kicker:     "Your ad on Oguaa",
		Heading:    u.Heading,
		Paragraphs: u.Paragraphs,
		Button:     u.Button,
		Footer:     Footer{Reason: "You're getting this email because you booked an ad on Oguaa with this address."},
	}
	if u.Warning {
		m.Tone = ToneWarning
	}
	return m
}

func minutes(d time.Duration) string {
	n := int(d.Round(time.Minute).Minutes())
	if n == 1 {
		return "1 minute"
	}
	return fmt.Sprintf("%d minutes", n)
}
