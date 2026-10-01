// Plain-English account-deletion facts shared by /account/delete and /me.

/** What an erasure removes (mirrors backend service.EraseMember). */
export const DELETED_ITEMS = [
  "Your profile: name, photo, bio, email, phone number, birthday, schooling, links and settings",
  "Listings you posted yourself, and the photos and videos you uploaded (except ones still shown on content that stays up)",
  "Private documents such as ID and business verification papers",
  "Follows, blocks, notifications, push devices and notification preferences",
  "Your agent profile and writing-assistant usage",
];

/** What is kept, and why (mirrors backend service.RetainedAfterErasure). */
export const RETAINED_ITEMS = [
  "Payment records (tickets, pledges, subscriptions, promotions, shop orders, escrow jobs) keep their amounts, references and dates because tax and payment-dispute rules require them. Your name, contact details and account id are removed; a record that must stay linked to an account points at a new random id instead.",
  "Reviews, tributes and published news articles you wrote stay under “Former member”, without your name.",
  "Reports you made are kept without your name, so moderation decisions stay accountable.",
  "Business registration details from a verified shop are kept for marketplace and tax records; your Ghana Card number, ID documents and settlement account are deleted.",
  "Listings posted for an institution stay with that institution.",
  "Photos and videos you uploaded that still appear on content that stays up (an institution's page, a published article, another member's page) stay with that content, no longer linked to you.",
  "Affiliate records a seller registered under your email address are not linked to your account, so deleting it doesn't change them. Ask for them through a privacy request at /privacy/request.",
  "Moderation, audit and privacy-request records, so we can show how your request was handled.",
];

/** Things to settle first; the server refuses deletion (409) until they are done. */
export const BEFORE_YOU_DELETE = [
  "Finish or cancel any Oguaa Outside job that holds money in escrow.",
  "Fulfil or cancel paid orders from your shop.",
  "Paid plans and promotions end straight away and are not refunded.",
  "Download a copy of your data first if you want one (Me › Your data).",
];
