# Creator Monetization — Artist Donations & Fundraising Campaigns

**Date:** 2026-07-24
**Status:** Approved design; ready for implementation plan
**Branch:** `feat/creator-monetization`

## Summary

Add two paid, subscription-gated monetization features for creators on the Oguaa
platform, both reusing existing engines:

1. **Artist donations ("tip jar")** — fans donate to an artist on the artist's
   public profile. Available only while the artist's owner holds an active paid
   creator subscription. The platform's cut is the take-rate configured on that
   subscription's plan.
2. **Fundraising campaigns** — a paid creator starts a goal-based campaign that
   anyone can donate to. Campaigns are `project` listings created through a
   stepwise wizard. A member's **first** campaign is audited in the moderation
   queue; once approved, subsequent campaigns auto-publish. The platform's cut is
   the take-rate on the campaign owner's plan.

Both features are paid-only: without an active paid creator subscription, neither
the donate panel nor campaign creation is available.

## Decisions (settled with the user)

- **Subscription scope:** member-level (a creator-account subscription), not
  per-listing. One paid plan unlocks donations on the artist's profile **and**
  campaign creation, and its take-rate applies to both.
- **Data model:** reuse the existing `project` + `pledge` engine. Campaigns are
  `project` listings; donations are a generalized pledge with `Kind = "donation"`.
- **Approval:** first campaign per member is reviewed (moderation queue); after
  one is approved, a per-member vetting flag lets subsequent campaigns
  auto-publish. Donations need only an active paid plan — no separate review.
- **Payouts:** ledger-only. Record gross/fee/net and a running "net owed"; actual
  disbursement is out-of-band. No Paystack subaccounts/splits/transfers this
  iteration. Consistent with pledges, tickets, and agent-job escrow.
- **Take-rate:** configured per-plan on the admin dashboard (`TakeRatePercent`).
  Seeded with editable starting values only; nothing hardcoded client-side.
- **Scope:** web-first (portal + creator + admin) this iteration; mobile (Expo)
  parity is a fast-follow phase.
- **Pledge generalization:** light touch — add a `Kind` field and treat the
  denormalized target fields as any listing; no `Pledge → Contribution` rename.

## Current-state grounding (what we build on)

- **Money-flow pattern** (`payments_service.go`, `subscriptions.go`, `tickets.go`,
  `promotions.go`, `agent_jobs_service.go`): domain record → Mongo repo → standalone
  service holding a `PaystackClient` (real `paystackHTTP` or `SimulatedPaystack`
  when no `PAYSTACK_SECRET_KEY`) → pending record → `Initialize` → callback URL →
  **idempotent `Confirm` with server-side `Verify`**. Amounts are integer pesewas.
- **Plans catalog** (`domain/plan.go`, `service/plans.go`, `plan_repo.go`): staff-
  managed `plans` collection; `Audience` ∈ {business, creator, any}; per-audience
  `Prices`; `PriceFor(audience)`; perks; `IncludedPromoDays`; `GoldBadge`; `Active`.
  Public `GET /api/plans`; admin CRUD under `/api/admin/plans`. **No take-rate today.**
- **Subscriptions** (`domain/subscription.go`, `service/subscriptions.go`): today
  **business-listing-only**. `StartSubscription` requires `TypeBusiness`, prices at
  `PriceFor("business")`, and sets `details.subscribedUntil` on the *listing*.
  `Subscription` already carries `MemberID`. `SupporterActive(listing, now)` reads
  the listing's paid-until.
- **Pledges → projects** (`domain/pledge.go`, `service/payments_service.go`):
  `project` listings funded by pledges. On confirm, a **flat** `PlatformFeePercent`
  split — `fee = amount * feePercent / 100`, `net = amount - fee` — is recorded on
  the pledge (`SetFeeNet`) and the net is credited to the project via
  `IncrementRaised` (`details.raisedPesewas`, `details.backers`).
- **Members & creators** (`domain/member.go`): members declare `CreatorTypes`
  (artist, organiser, business, …). `CreatorPlanIntent` is onboarding preference
  only — **never** paid access; paid access is exclusively a confirmed subscription.
- **Artist listing** (`service/listings.go`): whitelisted owner-editable
  `details` keys are `actName, genres, bio, link, streamingLinks, socials, booking`.
- **Lifecycle:** listings are moderated draft → pending → approved. The only
  auto-publish exceptions today are `incident` / `lostfound`.
- **Revenue** (`service/revenue.go`): aggregates pledge fees + gross of tickets,
  subscriptions, promotions into `GET /api/admin/revenue`.
- **Creator dashboard** (`service/creator.go`, `creator/` app): per-owner KPIs and
  earnings; `ActiveSubscription` is computed from `subs.ByMember`.

## Architecture

### 1. Plan take-rate (admin-configured)

- `domain.Plan`: add `TakeRatePercent int` (bson/json `takeRatePercent`). The
  platform's cut on donations and campaign pledges for members on this plan.
- `service.PlanInput` + `validatePlan`: accept and validate `TakeRatePercent`
  (range 0–90; 0 allowed). Admin Plans editor UI (admin app) gains the field.
- Seed (`seed_plans.go`): set editable starting values on the paid creator plans
  (e.g. Supporter 15, Featured 10 — starting values only, fully admin-editable).
- Fallback: legacy civic `project` pledges whose owner has no active plan continue
  to use the flat `PlatformFeePercent` env value.

### 2. Member-level creator subscription

- `domain.Member`: add `CreatorSubscribedUntil string` (RFC3339) and `CreatorPlan
  string` (plan slug). `MemberRepository`: add `SetCreatorSubscription(ctx, id,
  planSlug, until string) error`.
- Helper `service.CreatorSubscriptionActive(m domain.Member, now time.Time) bool`
  (parses `CreatorSubscribedUntil`).
- `domain.Subscription`: make `ListingID` optional and add `Scope string`
  ("business" | "creator"). Existing rows/flow default to "business".
- `SubscriptionsService`:
  - `StartCreatorSubscription(ctx, memberID, email, planSlug) (authURL, accessCode,
    reference string, err error)` — resolves the plan at `PriceFor("creator")`,
    records a member-scoped pending `Subscription` (empty `ListingID`,
    `Scope:"creator"`), callback into the creator app, `Initialize`.
  - `fulfillSubscription` branches on `Scope`: creator scope extends the member's
    `CreatorSubscribedUntil` (stacking onto the current period, same as business)
    and stamps `CreatorPlan`; business scope keeps today's listing behavior.
  - `resolvePlan` variant/param picks the audience price ("creator" vs "business").
- Endpoints: `POST /api/me/subscribe` (auth; body `{planSlug, email}`). Confirm
  reuses the by-reference confirm; add `GET /api/subscriptions/confirm` if a
  scope-agnostic confirm route is cleaner than the existing business callback.

### 3. Artist donations (tip jar)

- `domain.Pledge`: add `Kind string` (bson/json `kind`) — `"campaign"` (default;
  = today's project pledges) or `"donation"`. For donations the denormalized
  target fields (`ProjectID/ProjectSlug/ProjectTitle`) hold the **artist listing**.
- `ListingRepository`: add `IncrementDonations(ctx, listingID string, deltaNet
  int64) error` → increments `details.donationsNetPesewas` and `details.donorCount`.
- `PaymentsService`:
  - `StartDonation(ctx, artistSlug, memberID, email string, amountPesewas int64,
    message string, anonymous bool)` — loads the approved artist listing, **gates
    on the owner having an active creator subscription** (403 / feature-unavailable
    otherwise), records a pending pledge with `Kind:"donation"`, `Initialize`,
    callback to the artist page.
  - `fulfillPledge` fee split becomes plan-aware: look up the **target listing's
    owner** and their active `CreatorPlan`; `fee = amount * plan.TakeRatePercent /
    100`. If the owner has no active plan (legacy civic project), fall back to the
    flat `PlatformFeePercent`. For donations, credit net via `IncrementDonations`;
    for campaigns/projects, credit via `IncrementRaised` (unchanged path).
- Endpoints: `POST /api/artists/{slug}/donate`, `GET /api/donations/confirm`.
- Notifications: notify the artist owner on a confirmed donation (mirror
  `notifyProjectOwner`).

### 4. Fundraising campaigns

- A campaign is a `project` listing with `details.campaign = true` (distinguishes
  user campaigns from seeded civic adopt-a-project). Fields: goal (`goalPesewas`),
  deadline, story, cover, category — reusing project rendering + the pledge path.
- `domain.Member`: add `CampaignerVetted bool`. `MemberRepository`: add
  `SetCampaignerVetted(ctx, id string, vetted bool) error`.
- Create flow — `POST /api/campaigns` (auth):
  - Gate: creator subscription must be active.
  - If `member.CampaignerVetted == false` → insert `status = pending` (enters the
    existing moderation queue).
  - If `true` → insert `status = approved` (auto-publish), stamped as reviewed by
    the system.
- Approval hook: when a curator/steward approves a campaign (`project` listing with
  `details.campaign == true`) whose owner is not yet vetted, set
  `member.CampaignerVetted = true`. Implemented in the moderation approve path.
- Pledges to campaigns reuse the existing project-pledge flow; fee = owner's plan
  take-rate (Section 3 fee logic).
- Stepwise wizard (creator app, new): (1) Basics — title, category, cover;
  (2) Story — description/sections; (3) Goal & deadline — `goalPesewas`, end date;
  (4) Payout & terms — acknowledge ledger-payout + agreement; (5) Review & submit.

### 5. Admin, revenue & ledger

- Admin Plans editor: add the take-rate field (Section 1).
- Moderation queue: campaigns surface as pending `project` listings (existing UI);
  approving a first campaign sets the owner's vetting flag.
- Revenue dashboard (`service/revenue.go`, `GET /api/admin/revenue`): add a
  **donations** stream (gross/fee/net over `Kind == "donation"` successful
  pledges); keep campaign pledge fees legible vs civic project fees.
- Creator dashboard (`service/creator.go`): surface donation earnings and campaign
  raised totals alongside the existing ticket/pledge KPIs.

### 6. Frontend surfaces

- **Portal (`frontend/`):** "Support this artist" donate panel on `Artist.tsx`,
  shown only when the owner is subscribed; campaign browse/detail reuse the
  existing `Project`/`Projects` pages.
- **Creator app (`creator/`):** wire the real "subscribe to a creator plan" buy on
  `Grow.tsx`; the campaign wizard; donation & campaign earnings in `Money.tsx`.
- **Admin app (`admin/`):** plan take-rate editor; revenue donations stream.

## Data model changes (summary)

| Entity | Change |
|---|---|
| `Plan` | `+ TakeRatePercent int` |
| `Member` | `+ CreatorSubscribedUntil string`, `+ CreatorPlan string`, `+ CampaignerVetted bool` |
| `Subscription` | `ListingID` optional; `+ Scope string` ("business"\|"creator") |
| `Pledge` | `+ Kind string` ("campaign"\|"donation") |
| `Listing.details` | `+ donationsNetPesewas`, `+ donorCount` (artist); `+ campaign` bool, `goalPesewas`, deadline (campaign) |

New repo methods (each also added to the fakes in `internal/service/*_test.go`):
`PlanRepository` unchanged; `MemberRepository.SetCreatorSubscription`,
`MemberRepository.SetCampaignerVetted`; `ListingRepository.IncrementDonations`;
`SubscriptionRepository` gains member-scope reads if needed for the ledger.

Mongo is schemaless; new fields default to zero/empty with no migration. Seed
drop-list additions only if a new collection is introduced (none planned — all
reuse `plans`, `subscriptions`, `pledges`, `listings`, `members`).

## Error handling

- Donations/campaign creation without an active paid subscription →
  `ForbiddenError` ("this is a paid feature — subscribe to a creator plan").
- Donation to an artist whose owner's subscription has lapsed → same forbidden
  response (checked at `StartDonation`, before any Paystack call).
- Amount bounds reuse `minPledgePesewas`/`maxPledgePesewas`.
- All confirms are idempotent (already-success → no-op), matching the house pattern.
- Plan deletion never rewrites the ledger; sold subscriptions keep their
  denormalized plan slug + amount, and confirmed pledges keep their recorded fee.

## Testing

Backend (`go build ./... && go test ./...`, `go vet`, `gofmt` clean):

- Fee split uses the owner's plan take-rate for both a donation and a campaign
  pledge; falls back to flat `PlatformFeePercent` for a legacy civic project.
- Gating: `StartDonation` and `POST /api/campaigns` are rejected when the owner has
  no active creator subscription.
- First campaign inserts `pending`; after `CampaignerVetted`, a subsequent campaign
  inserts `approved`. Approving a first campaign sets the flag.
- Member-level subscription confirm extends `CreatorSubscribedUntil` and stamps
  `CreatorPlan`; stacking onto an existing period works.
- Idempotent confirm for donation, campaign pledge, and creator subscription.
- All new fakes implement the new repo methods.

Web (`pnpm build` + `pnpm lint` in `frontend/`, `creator/`, `admin/`): green,
0 ESLint errors, SonarQube "Oguaa way" gate respected (extract constants for
duplicated literals, cognitive complexity ≤15, real `<button>`s, `Readonly<>` props).

## Build order

1. Backend foundation — plan take-rate + member-level creator subscription.
2. Backend — artist donations flow (fee logic becomes plan-aware).
3. Backend — campaigns + first-time-approval lifecycle.
4. Portal — donate panel + campaign browse/detail.
5. Creator app — subscribe buy + campaign wizard + earnings.
6. Admin — plan take-rate editor + revenue donations stream.

## Out of scope (this iteration)

- Mobile (Expo) parity — fast-follow phase.
- Automated Paystack subaccount/split/transfer disbursement.
- Recurring/auto-renewing subscriptions (renewal stays manual, stacking a period).
- Refunds/chargeback handling beyond the existing failed-payment path.

## Addendum — added during implementation

### Feature C — Business products & services (subscription-capped)

Added at the user's request alongside A/B. Businesses publish a **products** and
**services** catalog on their storefront; how many they may publish is capped
per subscription plan, configured from the admin dashboard.

- `domain.StoreItem` (id, name, description, pricePesewas, unit, imageUrl,
  available) + `Listing.Products` / `Listing.Services`.
- `Plan.MaxProducts` / `Plan.MaxServices` (admin-configured caps).
- The business's active plan slug is stamped on the listing
  (`details.plan`) at subscription confirm (`SetSubscribedUntil(id, plan,
  until)`), so the cap resolves from the plan; no active paid plan falls back to
  the free "starter" plan's caps.
- `SetStorefront` extended to persist products/services; `SetListingStorefront`
  cleans/validates them and enforces the cap. Rendered on the public business
  page (`Storefront` component); edited in the portal's `ManageStorefront`.
- Admin Plans editor gained the take-rate + product/service cap fields.

### Implementation notes (reality vs. plan)

- Portal artist route is `/music/:slug` (not `/artists/`); donation callback and
  the owner notification link use `/music/`.
- Seeded creator-audience plans: `creator-supporter` (15% take-rate) and
  `creator-pro` (10%), plus product/service caps on the business plans — all
  admin-editable starting values.
- Creator subscription callback returns to the creator app's `/grow`
  (`PUBLIC_CREATOR_URL`, defaulting to the portal URL).
- All four surfaces build clean (`go build/vet/test/gofmt`; `pnpm build` in
  frontend/admin/creator). `pnpm lint` is currently broken repo-wide by a
  toolchain mismatch (TypeScript 7.0.2 vs. typescript-eslint 8.65, which errors
  before evaluating any file) — unrelated to this change; `tsc` in the build is
  the effective gate.
