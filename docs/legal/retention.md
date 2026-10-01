# Retention schedule (internal)

Version 2026-10-01. What the code keeps and for how long. The public summary is "How long we keep it" in `privacy.md`.
"Enforced" means the code deletes or redacts the data automatically.

| Data | Period | Enforced by |
| --- | --- | --- |
| Phone-verification and password-reset codes | 10 minutes | `service/auth_service.go` (`phoneVerificationTTL`, `passwordResetTTL`) |
| Two-factor sign-in challenge | 5 minutes | `service/auth_session.go` (`mfaChallengeTTL`) |
| Account-deletion codes | 15 minutes | `service/erasure.go` (`deletionCodeTTL`), TTL index in `infra/mongo/deletion_code_repo.go` |
| Sign-in sessions | 30 days, or until password / 2FA change or suspension | `service/auth_session.go` (`sessionTTL`), token versions |
| In-app notifications | 12 months | TTL index, `infra/mongo/notification_repo.go` |
| Writing-assistant usage counters | 90 days | TTL index, `infra/mongo/ai_usage_repo.go` |
| Listing-view records (member id or IP) | 30 days | TTL index, `infra/mongo/listing_repo.go` |
| Buyer contact details, as seen by the seller | Until 30 days after fulfilment | `service/commerce.go` (`sellerContactRetention`) — redacted in the seller's view |
| Account, profile, posts, private ID/KYC documents | Until account deletion | `service/erasure.go` |
| Payment records after erasure | Kept, name/contacts stripped | `service/erasure.go` (`StripPaymentContacts`, `PseudonymiseOrders`, …) |
| App Store purchase records after erasure | 6 years, pseudonymised | `service/iap_service.go` (`appleRecordRetentionYears`) |
| Reports, moderation, audit and privacy-request records | Kept, reporter pseudonymised on erasure | `service/erasure.go` (`PseudonymiseReports`) |
| Privacy requests | Answer due in 40 days (objections 21) | `service/privacy_requests.go` |

Not yet enforced (follow-up for the backend; the notice does not promise shorter periods for these): purge of rejected
or withdrawn submissions and their images, resolved lost & found notices, closed incident contact details, rejected
agent applications and KYC files, pending Stripe intents, and dormant accounts.
