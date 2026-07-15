# Oguaa Creator Platform — Plan

*Drafted 2026-07-15 · for review before implementation.*

## 1. The idea in one paragraph

Today only **citizens** (members) can join Oguaa; everything a business or
artist gets is a listing that staff curate. The Creator Platform adds a second
account kind — **Creator of Cape Coast** — with its own dashboard app
(`creator/`, port **:3004**). A creator signs up, picks what they are
(**business owner · artist · event organiser**), chooses a **subscription
plan**, and from their dashboard can **add listings, promote them, and track
how they perform** — without staff in the loop. Staff keep the existing admin
app (one admin app, multiple roles) for curation and safety.

## 2. What already exists (we build on these, not from zero)

| Piece | Where | Status |
|---|---|---|
| Supporter subscription, GH₵50/mo per business, Paystack | `BusinessDetail.tsx` owner panel, `api.subscribe` | ✅ live |
| Self-serve promotion, GH₵10/day (7/14/30-day bundles), Paystack | `/me` "Your listings → Promote", `api.promoteListing` | ✅ live |
| Paid "In the spotlight" placements on the home page | `Home.tsx` (`api.featured`) | ✅ live |
| Featured businesses section on home (3 cards, below the fold) | `Home.tsx` | ✅ live (weak) |
| Listing submission by members (artist, business, event, opportunity…) | `/submit` | ✅ live (staff-moderated) |
| Ticket sales + project pledge fees (the other two revenue streams) | admin Revenue page | ✅ live |
| Aura navy/gold sidebar + icons (admin) and RentOS KPI metric cards | `admin/` | ✅ reference implementations |

## 3. Account model

- **Join page gains one question:** *"Join as a citizen" / "Join as a creator"*.
  Creator path additionally asks: **creator type** (Business owner / Artist /
  Event organiser) — multi-select allowed — then the usual name, phone/email,
  DOB, password.
- `members` collection gains `creatorTypes: string[]` (empty = citizen).
  Types: **business, artist, organiser, institution**. "Institution" means the
  member represents a school / chieftaincy (traditional authority) /
  association / faith / civic body — see §4.1.
- **Any citizen can upgrade later** from `/me` → "Become a creator" (sets
  `creatorTypes`, no new account). Creators keep every citizen feature
  (memories, memorials, tickets, follows).
- Role vs creator type is orthogonal: `role` (member/curator/steward/editor)
  stays staff-only; `creatorTypes` is self-serve.

## 4. The creator app (`creator/`, :3004)

New Vite + React + Tailwind app in the monorepo, same stack and tokens as
`admin/`, nginx-served with `/api/` + `/uploads/` proxying. JWT auth against
the same backend; citizens without `creatorTypes` land on an upgrade screen.

**Sidebar — the Aura design with icons, exactly as just shipped in admin:**

- OVERVIEW → Dashboard (KPI strip, see below)
- MY WORK → My listings · Add a listing · Drafts
- GROW → Promote · Subscription · (later: analytics)
- MONEY → Ticket sales · Pledges · Payouts (read-only ledgers)
- ACCOUNT → Public profile · Settings

**Overview page** uses the RentOS `MetricCard` port: active listings, views
this month, active promotions, plan status — icon chips, accent left borders,
watermarks, staggered entrance.

### 4.1 Institution creators & team management (officers)

Institutions already have the machinery: a citizen **claims** an institution
(role + note), a steward approves, and every approved claim makes that member
a **manager** (`OrgClaim` + `IsManager` is the single auth choke point;
multiple approved claims per org already work). Managers today edit profile,
offices roster, gallery, sections and post events (`ManageInstitution.tsx`).

The creator platform turns this into a first-class creator type:

1. **Sign up / upgrade as "institution"** → either **claim an existing
   institution** (current flow, steward/moderator approves) or **request a new
   one** (name, kind, seat, note → steward creates + verifies, claim
   auto-approved for the requester). Institution kinds come from a real
   server-side catalog (today `kind` is free text): school,
   traditional-authority, association, faith, civic, asafo, heritage.
2. **Team management (officers)** — new. A manager invites **any citizen** by
   phone/email + assigns their office (e.g. "PTA Chair", "Content editor"):
   - `POST /api/institutions/{slug}/team/invite` (manager-only) pre-creates an
     `OrgClaim` with `status: "invited"`, `invitedById`, `requestedRole`;
     the invitee gets a notification.
   - Invitee accepts from their creator app / notifications → claim becomes
     `approved` **without steward review** (a verified manager vouched for
     them); they can also decline. Stewards/moderators keep a revoke power
     over any membership.
   - Two scopes: **manager** (everything incl. team + delete) and **officer**
     (content only: profile, gallery, sections, events). The original
     claimant is always a manager; invitees default to officer, promotable by
     any manager.
   - `GET /api/institutions/{slug}/team` lists managers + officers with
     status; `DELETE .../team/{memberId}` revokes.
3. **Creator app institution workspace**: the sidebar gains a **TEAM** item
   under MY WORK, and the existing five manage panels (profile, sections,
   gallery, offices, events) are ported in — one workspace per managed
   institution (switcher in the sidebar when a member manages several).
4. Mobile: institution manage + team land in the app's creator section in the
   mobile phase (decision §9.4).

## 5. Subscription plans — DECIDED: configurable from admin

Plan names, prices and perks live in a **`plans` collection** and are managed
from a new **Monetization → Plans** page in the admin dashboard (staff CRUD,
seeded with the defaults below). The creator app reads them from
`GET /api/plans` — nothing price-related is hardcoded client-side.

| Seed plan | Price | Gets |
|---|---|---|
| **Starter** (free) | GH₵0 | 1 live listing, standard directory placement |
| **Supporter** | GH₵50/mo (business) · GH₵30/mo (artist/organiser) | Gold ★ badge, priority sorting, up to 3 listings, more photos |
| **Featured bundle** | GH₵120/mo | Supporter perks + 7 promotion days auto-applied each month |

Pay-per-use **promotions (GH₵10/day)** stay available to everyone, plan or no
plan. Existing four revenue streams are untouched; plans just bundle them.

## 6. Front page — make trade visible ("promote them too")

1. **Move "In the spotlight" directly under the hero** (it is already paid
   placement; it should not sit mid-page).
2. **"Trade in Oguaa" band** right after it: category chips
   (Eat · Stay · Shop · Services · Crafts → `/business?cat=…`) + 4 business
   cards instead of 3, supporters first.
3. **Creator CTA banner** near the footer: *"Own a business or a craft in Cape
   Coast? List it free — or go Supporter for the gold badge."* → `/signin?mode=join&as=creator`.

## 7. Backend work

1. `members.creatorTypes` (+ migrate: any member who owns a business listing
   gets `["business"]`).
2. `POST /api/creator/join` — register with creatorTypes (reuses password auth).
3. `GET /api/creator/overview` — per-creator KPI aggregate (listings, views,
   promotions, plan, their ticket/pledge totals).
4. Owner-scoped listing edit: `PATCH /api/listings/:id` (owner or staff).
5. Listing view counter (`POST /api/listings/:id/view`, daily-deduped by
   member/IP hash) — powers the dashboard "views" KPI.
6. Plans as constants in code (no new collection): ids, prices, perks.
7. nginx conf + `docker-compose.yml` service `creator:3004` + verify script.

## 8. Phasing

- **Phase 1 (foundation):** creatorTypes + join flow + creator app shell
  (auth, Aura sidebar + icons, Overview with live counts, upgrade screen).
  **SHIPPED 2026-07-15** — backend (creatorTypes on members + register,
  moderator role with scoped permissions, `GET /api/creator/overview`,
  `POST /api/me/creator-types`), portal join citizen/creator picker, and the
  `creator/` app on :3004 (Overview KPIs, My Work with in-place simulated
  promote, Grow/Plan subscribe, Money, Institutions, Account creator-type
  editor, Notifications). Note: `createBrowserRouter` must be built post-auth
  (it fires initial loaders on construction — see `creator/src/router.tsx`).
- **Phase 2 (money & team):** plans catalog + Paystack subscribe/manage +
  owner listing editor + Promote page (port the `/me` panel) + institution
  workspace port + **team/officer invitations**.
- **Phase 3 (visibility):** view counter + analytics + front-page trade band +
  creator CTA + creator public profiles (`/creators/:slug`)?

## 9. Decisions (2026-07-15)

1. ~~Plan names/prices~~ → **all configurable from the admin dashboard** (§5).
2. Creator types at launch: **business owner, artist, event organiser,
   institution** (school, chieftaincy, etc. — institutions reuse the existing
   claim/manage machinery and gain officer invitations, §4.1).
3. Paid plans skip moderation? → **No — always moderated.** A new
   **`moderator` role** (an admin-side role with scoped permissions: queue,
   listings, reports, incidents — no members/revenue/settings/publishing)
   handles review; admin nav + backend routes filter by role permissions.
4. Mobile → **both citizen and creator features** (creator section in the
   mobile app lands in a later phase; web app first).
