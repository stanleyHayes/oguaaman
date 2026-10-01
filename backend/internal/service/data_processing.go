package service

// ── how Oguaa processes personal data (the "processing" export section) ─────
//
// The Act 843 right of access covers not only the data but what is done with
// it: purposes, who receives it, where it comes from, and any automated
// decision-making. Keep this in step with the privacy policy and the code; it
// names only processors the code actually calls.

// ProcessingPurpose is one reason personal data is used, and which data.
type ProcessingPurpose struct {
	Purpose string `json:"purpose"`
	Data    string `json:"data"`
}

// ProcessingRecipient is a service provider that receives personal data.
type ProcessingRecipient struct {
	Name     string `json:"name"`
	Role     string `json:"role"`
	Location string `json:"location,omitempty"`
	When     string `json:"when"`
}

// ProcessingNotice is the processing section of a data export.
type ProcessingNotice struct {
	Controller         string                `json:"controller"`
	Purposes           []ProcessingPurpose   `json:"purposes"`
	Recipients         []ProcessingRecipient `json:"recipients"`
	Sources            []string              `json:"sources"`
	AutomatedDecisions string                `json:"automatedDecisions"`
	Retention          []string              `json:"retention"`
	YourRights         string                `json:"yourRights"`
}

const whenUsed = "Only when you use this feature."

// affiliateRecordsNotice explains why seller-registered affiliate records are
// neither exported nor erased with the account: they are keyed by an email
// address the member has never proved they own, so only a privacy request
// (where staff check identity) can reach them.
const affiliateRecordsNotice = "Affiliate records a seller registered under an email address are not linked to your Oguaa account, so they are not in this export and are not changed when you delete your account. To see, correct or delete them, send a request at citizen.oguaaman.com/privacy/request and we will check that the address is yours."

// ProcessingNoticeForExport returns the processing section.
func ProcessingNoticeForExport() ProcessingNotice {
	return ProcessingNotice{
		Controller: "Dev Track (business registration number BN843072020), Ghana Post GPS address GE-161-2814, operator of Oguaa (oguaaman.com) — hello@oguaaman.com, +233 55 518 0048.",
		Purposes: []ProcessingPurpose{
			{"Running your account and signing you in", "Email or phone number, password (stored only as a salted hash), two-factor settings"},
			{"Showing your public profile and contributions", "Display name, photo, bio, quarter, Asafo, schools, links, and the listings, reviews and tributes you publish"},
			{"Keeping the community safe (moderation, reports, blocks, rate limits)", "Your submissions, reports, blocks, and technical request data such as IP address"},
			{"Taking payments and keeping payment records", "Payer email, amounts, references and status for tickets, pledges, subscriptions, promotions, orders and escrow jobs"},
			{"Sending you notices you need or asked for", "In-app notifications, push device registrations, email address and phone number"},
			{"Oguaa Outside agent vetting and seller verification", "ID documents, guarantor and payout details, business registration and settlement details"},
			{"The writing assistant", "Only the text you choose to send to it, and a daily usage count"},
		},
		Recipients: []ProcessingRecipient{
			{"Paystack", "Card and mobile-money payments", "", "When you pay or are paid through Oguaa."},
			{"Stripe", "Card payments in the mobile app", "", whenUsed},
			{"Apple", "In-app purchases on iPhone", "", whenUsed},
			{"Anthropic (Claude)", "Writing assistant", "United States", whenUsed},
			{"Moonshot AI (Kimi)", "Backup writing assistant", "China", "Only if the main assistant is unavailable and the backup is switched on."},
			{"Resend", "Email delivery", "", "When we email you."},
			{"Meta (WhatsApp Business)", "WhatsApp message delivery", "", "When we message your phone number."},
			{"Expo and your browser's push service", "Push notification delivery", "", "When you turn on notifications."},
			{"Cloudinary", "Image hosting", "", "When you upload an image and image hosting is switched on."},
			{"MongoDB Atlas", "Database hosting", "", "Always — it stores the platform's data."},
			{"Render", "API hosting", "Frankfurt, Germany", "Always — it runs the platform's servers."},
			{"Vercel", "Website hosting", "", "When you use the Oguaa websites."},
		},
		Sources: []string{
			"You — your profile, contributions, payments and settings.",
			"Other members — listings, tributes, reviews or reports that mention you.",
			"Payment providers — whether a payment succeeded, and its reference.",
			"Oguaa staff — moderation and vetting decisions about your contributions or applications.",
		},
		AutomatedDecisions: "Automated checks (rate limits and spam or content filters) can refuse a request or hold a submission for review; a person reviews anything held. We do not make decisions that have legal or similarly significant effects on you by automated means alone.",
		Retention: []string{
			"Your account and profile: until you delete your account.",
			"When you delete your account, the records listed as retained are kept without your name or contact details; everything else is deleted.",
			affiliateRecordsNotice,
		},
		YourRights: "You can correct your profile at any time, delete your account from your settings or at citizen.oguaaman.com/account/delete, and ask us to access, correct or delete your data, or object to its use, at citizen.oguaaman.com/privacy/request.",
	}
}
