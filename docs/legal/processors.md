# Processor and transfer register (internal)

Version 2026-10-02. Every third party that receives personal data from Oguaa, with where the integration lives in the
code. The public summary is the "Service providers and transfers abroad" section of `privacy.md`; the export's
"processing" section is `backend/internal/service/data_processing.go`. Keep all three in step.

Cells marked **to record** or **to confirm** must be filled in by the operator (contract / DPA reference and date, the date the
processor was notified to the Data Protection Commission). Do not guess them.

| Provider | Purpose | Personal data sent | Location | When | Code / config | Contract or DPA | Notified to DPC |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Paystack | Card and MoMo payments; seller subaccounts; ad payments and refunds | Receipt email, amount, reference; seller settlement details | to confirm | Paid flows; ad refunds (`POST /refund`) | `service/payments_service.go`, `service/ads.go`, `ads_scheduler.go`, `PAYSTACK_SECRET_KEY` | to record (O2: written OK for self-serve advertising on the shared account) | to record |
| Stripe | Card payments in the mobile app | Card details (entered in Stripe's SDK), amount, reference | to confirm | Mobile card checkout | `service/stripe.go`, `stripe_service.go`, `STRIPE_SECRET_KEY`, `@stripe/stripe-react-native` | to record | to record |
| Apple | In-app purchases | Transaction records, `appAccountToken` | United States | iOS purchases | `service/appstore.go`, `iap_service.go`, `APPLE_BUNDLE_ID` | Apple Developer Program terms | to record |
| Anthropic | Writing assistant; newsroom brief rewording; researched news reports (Claude with Anthropic web search and web fetch) | Writing assistant: member-selected text, redacted (emails, phones, Ghana Card numbers). Newsroom: public news leads and public web pages only, no member data | United States | Writing assistant: with AI consent. Newsroom: automated desk runs; research only when `longformEnabled` | `service/ai_service.go`, `ai_redact.go`, `service/automated_research.go`, `service/newsdesk_claude.go`, `ANTHROPIC_API_KEY`, `OGUAA_NEWS_*` | to record | to record |
| OpenAI | News illustrations (Images API) | Illustration prompt only (a fixed template plus a short scene description that names no one); no personal data | United States | When `imagesEnabled` and `OPENAI_API_KEY` is set | `infra/openai/images.go`, `service/newsdesk_cover.go`, `OPENAI_*` | to record | to record (no personal data sent) |
| Moonshot AI (Kimi) | Backup writing assistant | Same redacted text | China | **Off in production** unless `AI_ALLOW_KIMI=true` | `service/ai_service.go`, `config.go`, `KIMI_*` | none — must exist before enabling | none — must exist before enabling |
| Resend | Transactional email | Email address, message (codes, notices, receipts) | to confirm | Email sends | `infra/email/resend.go`, `RESEND_API_KEY` | to record | to record |
| Meta (WhatsApp Business Cloud API) | WhatsApp codes and messages | Phone number, message | to confirm | WhatsApp sends | `infra/whatsapp/sender.go`, `WHATSAPP_*` | to record | to record |
| Expo, Google FCM, Apple APNs, Mozilla / browser push services | Push delivery | Push token, alert text (generic safety alerts) | to confirm | Push enabled | `service/push_service.go`, `VAPID_*` | provider terms | to record |
| Cloudinary | Image hosting (signed uploads); server-side uploads of news illustrations and approved ad creatives | Uploaded images; ad creatives; news illustrations | to confirm | When configured | `infra/cloudinary/cloudinary.go`, client upload helpers, `CLOUDINARY_*` | to record | to record |
| MongoDB Atlas | Database | All platform data | **to record** (cluster region) | Always | `MONGODB_URI` | to record | to record |
| Render | API hosting and logs | All data in transit; server logs with IPs | Frankfurt, Germany | Always | `render.yaml` | to record | to record |
| Vercel | Website hosting | Visitor IP, requested pages | to confirm | Web visits | `frontend/vercel.json`, `marketing/vercel.json` | to record | to record |
| OpenStreetMap (tiles, Nominatim) | Maps and place search, fetched by the client | Visitor IP, map area, searched place | to confirm | Map views | `frontend/src/components/location-*.tsx`, `ExploreMap.tsx`, `mobile/src/components/map-view.tsx`, `location-card.tsx` | usage policy | n/a (direct from client) |
| OSRM demo router | Walking directions | Visitor position and destination, IP | to confirm | "Directions" on the explore map | `frontend/src/pages/ExploreMap.tsx`, `VITE_ROUTING_URL` | usage policy | n/a (direct from client) |
| Google Fonts | Web fonts | Visitor IP | to confirm | Web page loads | `*/index.html` | provider terms | n/a (direct from client) |
| unpkg | Leaflet library in the mobile map | Device IP | to confirm | Mobile map views | `mobile/src/components/map-view.tsx` | provider terms | n/a (direct from client) |

Open follow-ups (outside the legal texts): self-host the web fonts and the Leaflet bundle, and point
`VITE_ROUTING_URL` at a contracted router, to remove the last three client-side transfers; record the Atlas region;
consider a CI check that compares outbound hosts in the code with this register.
