# Oguaa Platform — Agent Build Plan

> **Working name:** Oguaa — a community-pride platform for **Cape Coast (Oguaa)**, Central Region, Ghana.
> **This document** is the agent's build plan: it captures the Cape Coast research that grounds the
> visual identity, the design system derived from it, the architecture, and the build order. It is a
> companion to `oguaa/Oguaa-Platform-Specification.md` (the product spec) — read that for *why*; read
> this for *how it's being built*.
>
> **Status:** Phase 1 shipped (all ten build-order items plus extras: safety/incidents, lost & found, festivals archive, history hub, newsroom, ticketing, subscriptions, promotions, the creator app). Phase 2 in progress — diaspora register and adopt-a-project funding delivered; investment opportunities and mentor-to-youth matching (gated on the §14.4 safeguarding policy) remain. **§7 is the living implementation-status and backlog section — this file is the single source of truth.**

---

## 0. Decisions taken (so the build can move)

The spec (§17) leaves several decisions open. To start building, the agent has taken sensible defaults; all are reversible and flagged.

> **Stack note (revised):** the build target was changed during development to
> the team's house stack: **Go + MongoDB backend, a raw React (Vite) SPA frontend,
> latest packages.** The Cape Coast research (§1) and design system (§2) are
> stack-agnostic and carried over unchanged; an earlier Next.js prototype was
> removed. Architecture below reflects the delivered Go/Mongo/React build.

| # | Decision | Chosen default | Why |
|---|---|---|---|
| Stack | Frontend | **React 19 + Vite 8 + React Router 7 + TypeScript + Tailwind v4** (raw React SPA, no meta-framework) | Team preference ("raw react, not Next"); code-split routes keep first-load light for low-bandwidth. |
| Stack | Backend | **Go 1.25 + MongoDB (driver v2)**, stdlib `net/http` routing, `log/slog` | Team preference ("golang + mongodb"); MongoDB's document model is a natural fit for the polymorphic "one engine, many listing types" design. Clean ports/adapters layout (`internal/{domain,service,infra}`). |
| Mobile | "Build the app now" | **Mobile-first responsive SPA** (PWA wrapper is a fast-follow) | Spec defers native apps (§6); the responsive SPA is app-like on phones today. A PWA manifest/offline shell or a native Expo track can follow. |
| §17.1 | Name & brand | **Oguaa** | Authentic, ownable, replicable ("we ourselves"). Visual identity defined in §3 below. |
| §17.2 | "Town" meaning | **Cape Coast / Oguaa as a whole**, with `Place.parentId` ready for quarters (Bakaano, Amanful…) | Keeps the replication vision; taxonomy can deepen without re-architecting. |
| §17.3 | Edit re-approval | **Approved owner edits publish immediately + `owner-edit` audit** (Creator Plan §9.5 — supersedes the earlier all-edits-reviewed default); the minor/major re-approval split remains open (§7.1) | Creator Plan decision, 2026-07. |
| §17.5 | Backend | **MongoDB** (see above) | Document store fits the polymorphic listing engine; one `listings` collection. |
| §17.7 | Memorial name | **Yɛnkae** ("let us remember"), *In Memoriam* subtitle | Confirmed direction in mockup; exact diacritics to confirm with community. |
| §17.9 | AI provider | **Anthropic Claude API**, server-side only, streamed, metered | Spec §8.12 example; keys never in the browser. |
| §17.10 | Registry launch | **Schools first** (rep-your-school depends on them), then traditional authorities & associations | Spec §15 registry staging. |

---

## 1. Cape Coast research brief (grounds the identity)

*The following is the synthesized, fact-checked research brief produced by a 9-agent research workflow (7 domain experts → adversarial fact-check → synthesis). All dates and names below survived verification; six corrections were applied (see §1.6).*

### 1.1 Oguaa in one breath
Cape Coast is the English name; the soul of the place is **Oguaa**, from the Fante *gua* — "market" — for the crab-traders' selling-ground that grew, by the sea in front of the great Castle, into a town. Commerce is the town's birth name, still alive in **Kotokuraba** ("crab-hamlet") market at its heart. From those roots Oguaa became, for a while, the whole Gold Coast: **British capital 1821–1877**, cradle of the colony's lawyers, journalists and constitutionalists, and the country's oldest school town. It is a place of **hard contrasts in soft light** — the whitewashed Castle and its Door of No Return facing the Atlantic, the green hush of Kakum inland, the flag-bright pageantry of the Asafo and Fetu Afahye. **Oguaa remembers, and Oguaa celebrates.**

The platform carries **two emotional registers that must never blur**: **pride** (market origins, the old capital, the "Citadel of Education," Fetu Afahye, the Asafo) and **reverence** (the dungeons, the Door of No Return, the diaspora homecoming, the Yɛnkae memorial).

### 1.2 Heritage & history (verified anchors)
- **Cape Coast Castle** — begun **1653** as the Swedish timber lodge *Carolusborg*; **British from 1664**, rebuilt in stone as their West-African HQ. Above the chapel, light; below, the dungeons and the **Door of No Return**. **UNESCO World Heritage (1979)**. Obama visited **July 2009**. Launch image of Ghana's **Year of Return (2019)**, 400 years after the first enslaved Africans landed in Virginia (1619).
- **Fante Confederacy** — formed at **Mankessim, January 1868**; the **Mankessim Constitution of 1871** (council, judiciary, army, taxes, a promise of roads and schools) was one of Africa's earliest written constitutions; **dissolved by the British in 1874**.
- **Asafo** — Fante militia/ceremonial companies. Cape Coast keeps **seven**: Bentsir, Anaafo, Ntsin, Nkum, Brofomba, Akrampa, Amanful. Identity broadcast via **posuban** shrines and appliqué **frankaa** flags. Flag colours carry meaning (red = sacrifice, white = purity, black = solidarity, blue = Asafo).
- **City of scholars & the press** — Aborigines' Rights Protection Society (ARPS) founded in Cape Coast **1897** (Mensah Sarbah, Casely Hayford).

### 1.3 Culture & festivals
- **Oguaa Fetu Afahye** — ~5-day harvest/cleansing festival climaxing the **first Saturday of September** (**5 Sep 2026**). Gives thanks to the **77 gods of Oguaa** and to the sea. "Fetu" = clearing the dirt; a **ban on drumming/noise** precedes it. Climax: grand **durbar** of chiefs in palanquins under state umbrellas. **Bakatue** at the **Fosu Lagoon** — the Omanhene casts a net three times; the seven companies then race canoes.
- **Authority** — the **Oguaa Traditional Council**, headed by the **Omanhene** (paramount chief, currently **Osabarimba Kwesi Atta II**, installed 1998). Offices: **Ohemaa** (queen mother), **Okyeame** (linguist — "a chief never speaks in public"), **Asafohene/Supi/Safohen**.
- **Table** — **Fante kenkey (dokonu)**: unsalted fermented corn dough steamed in plantain leaves, softer/sourer than Ga kenkey; with fresh fish, shito, pepper.

### 1.4 The Oguaa Sound (music — the wedge)
- 1920s–30s Cape Coast hosted early dance orchestras (the **Cape Coast Light Orchestra**, "Sugar Babies") feeding the birth of **highlife**.
- **Twin grandfathers:** **C.K. Mann** (b. Cape Coast 1936; electrified the coastal *osode* fishermen's rhythm; d. 2018) and **Ebo Taylor** (of **Saltpond**, ~40 km up the coast; Afro-funk pioneer; produced C.K. Mann, Pat Thomas, Jewel Ackah, Papa Yankson; **d. 7 Feb 2026, aged 90**).
- **UCC Department of Music and Dance** (est. 1975) + the schools' brass/jazz bands and chapel choirs keep the pipeline flowing.
- **Streaming reality in Ghana:** **Audiomack** and **Boomplay** carry core local listenership; **YouTube** for video/diaspora; **Spotify** the fast-growing prestige tier. *We link out only — no hosted audio (spec §14.5).*
- *Honesty guard:* Black Sherif (Konongo, Ashanti), Kofi Kinaata (Takoradi, Western), and Azonto (Accra/Ga origin) are **not** Cape Coast — do not claim them.

### 1.5 The Citadel of Education (rep-your-school fuel)
| School | Founded | Type | Motto | Colours |
|---|---|---|---|---|
| **Mfantsipim** | **3 Apr 1876** (oldest in Ghana; 150th in 2026) | Methodist boys | *Dwen Hwe Kan* — "Think and Look Ahead" | Red & black |
| **Adisadel College** | **4 Jan 1910** (St. Nicholas' 1924 → Adisadel ~1936) | Anglican boys | *Vel primus vel cum primis* | Black & white |
| **Wesley Girls'** | **1836** (today's school ~1954) | Methodist girls | "Live Pure, Speak True, Right Wrong, Follow the King" | Green & yellow |
| **St. Augustine's (AUGUSCO)** | **1930** | Catholic boys | *Omnia Vincit Labor* | Green & white |
| **Holy Child** | **1946** ("Angel's Hill") | Catholic girls | *Facta Non Verba* | Yellow & brown |
| **University of Cape Coast** | college **Oct 1962**; full university **1 Oct 1971** | Public university | *Veritas Nobis Lumen* | Blue/white/gold/red |

The **Mfantsipim–Adisadel rivalry** (Methodist vs. Anglican) is Ghana's oldest school rivalry; the **Fun Games** (since 1992) channel it into cooperation. **OSA networks** (MOBA, Santaclausians, Augustinians, HOPSANS, Wey Gey Hey) fund scholarships and run lifelong professional networks — the powerhouse the spec (§8.5) plugs into. Most famous old boy: **Kofi Annan** (Mfantsipim).

### 1.6 Fact-check corrections applied (keep copy correct)
- **UCC** full university status **1 Oct 1971**, *not* 1972.
- **Kakum canopy walkway**: 7 bridges, **~350 m**, up to ~40 m, opened **March 1995**; funders **Conservation International + UNDP** (drop the unverified USAID credit).
- **Wesley Girls'**: founded **1836**; today's school **~1954** (drop the unsupported "1884 secondary section").
- **Adisadel**: **1910** SPG → **St. Nicholas' 1924** → **Adisadel ~1936**.
- **Ebo Taylor**: from **Saltpond** (~40 km away — say "the Saltpond–Cape Coast coast," not "near Cape Coast"); d. **7 Feb 2026, aged 90**.

---

## 2. Visual identity — "Castle, Canopy, and Canoe"

Cape Coast is **hard contrasts in soft equatorial light**: the bone-white lime wash of the Castle, the near-black emerald gloom under the Kakum canopy, the screaming reds/blues/golds of Asafo *frankaa* flags and beached fishing canoes. The system is a **museum-calm cream/ink field carrying small, deliberate flag-flashes of saturated colour** — never large saturated fills. Every token reconciles with the four existing mockups rather than inventing a new scheme.

### 2.1 Colour tokens (fact-checked, WCAG-aware)
| Token | Hex | Role |
|---|---|---|
| `--paper` | `#FBF8F1` | Topmost page background (castle wall at noon) |
| `--cream` | `#F6F1E7` | Canonical card/surface (from mockups) |
| `--sand` | `#ECE4D3` | Third elevation, table stripes, muted fill |
| `--ink` | `#1A2E22` | Body text — 12.8:1 on cream (AAA) |
| `--ink-muted` | `#4A5A50` | Secondary text — 6.5:1 |
| `--ink-faint` | `#6E7A70` | Captions/placeholders (non-load-bearing) |
| `--green-900` | `#0C2C1F` | Footers, hero overlays, deepest sections |
| `--green` | `#123F2D` | **Primary brand** — nav, headers, buttons (white-on 10.5:1) |
| `--green-slate` | `#3B473D` | Borders, dividers, admin chrome |
| `--gold` | `#C7A24A` | **Bright ornament** — rules, glints (4.9:1 on green) |
| `--gold-brand` | `#B07D32` | Large gold UI/borders (3.2:1 — not small text) |
| `--gold-border` | `#B8862F` | Decorative frames |
| `--gold-text` | `#8A5E1F` | **Small gold words/links** on light (5.0:1) |
| `--clay` | `#B0503C` | Warm accent/CTA/festival tag (white-on 5.2:1) |
| `--clay-text` | `#9A4030` | Small clay text/icons (5.9:1) |
| `--maroon-900` | `#7C2D2D` | Danger/destructive, deep Asafo red (white-on 9.25:1) |
| `--teal` | `#0E7C6B` | Links/info/water (4.5:1 on cream) |
| `--teal-text` | `#0B6557` | Small teal text/icons (6.2:1) |
| `--ai` | `#4C40A8` | **AI surfaces only** (7.2:1) |
| `--ai-tint` | `#F6F5FD` | AI surface background |
| `--ai-line` | `#E2DFF4` | AI surface borders |

**Usage rules (non-negotiable):** ① bright gold = ornament, dark gold (`#8A5E1F`) = words; never white type on gold. ② White type only on green-900/green/clay/maroon-900/teal. ③ Saturated accents only in small doses on cream/ink. ④ Purple is fenced to AI surfaces — never heritage content. ⑤ Never encode state in colour alone (text label always). ⑥ Sunlight-first: AAA body, AA large text (mid-range Androids, outdoors at noon).

### 2.2 Per-section accents
`Home` green `#123F2D` · `Music` clay `#B0503C` · `People` gold-text `#8A5E1F` · `Heritage` green `#123F2D` · `Culture` gold-brand `#B07D32` · `Visit` teal `#0E7C6B` · `Education` maroon `#7C2D2D` (each school carries its own house colours) · `Business` teal-text `#0B6557` · **`In Memoriam (Yɛnkae)` muted gold `#B07D32`** (calmest — a candle, not festival) · `Community/Youth` teal `#0E7C6B` · `Admin` green-slate `#3B473D` (the only home of AI purple).

### 2.3 Typography (canonical set — revised 2026-07)
- **Fraunces** (display/hero/section heads/wordmark/pull quotes) — **h1/h2 on every platform.**
- **Outfit** (everything else: UI/body workhorse, forms, chips, metadata, long-form).
- **JetBrains Mono** (AI output/diffs only).
- *Replaced the earlier Cormorant Garamond / Spectral / Figtree set.* Web apps enforce the rule in `src/index.css` base (`--font-serif` is deliberately aliased to Outfit); mobile bundles both via `@expo-google-fonts` with the `D()/DI()`/`S()/SI()` theme helpers and `T`/`TI` text wrappers. Always render Fante diacritics (ɛ, ɔ).

### 2.4 Symbol vocabulary (respectful, attributed)
Borrow the *grammar* of Adinkra/Asafo, never the *property*. Redraw Adinkra as clean uniform-stroke line icons; never reproduce a real company's flag/name/shrine, never invent a company, no Union-Jack/Ghana-flag canton, no sacred regalia in the UI. Every symbol carries a tooltip teaching its name + meaning.

| Symbol | Meaning | Used where |
|---|---|---|
| **Nyame Nwu Na Mawu** | "God will not die, therefore I will not die" — immortality of the soul | **Primary mark of Yɛnkae** |
| **Gye Nyame** | Omnipotence of God | Highest-order moment only — Yɛnkae crest, About masthead |
| **Owuo Atwedeɛ** | "Death's ladder is climbed by all" — consoles the bereaved | Secondary memorial motif (life-dates ↔ eulogy divider) |
| **Sankofa** | "Go back and fetch it" | Heritage headers, Year of Return, Music "Grandfathers" rail |
| **Adinkrahene** | Leadership, the seed of all adinkra | Master brand glyph / loading mark; Traditional Council |
| **Nkyinkyim** | "Life's path is twisted" — resilience | Heritage timeline ribbon; divider rule |
| **Funtunfunefu Denkyemfunefu** | Unity in diversity | Community/civic; shared-listening playlist |
| **Dwennimmen** | Strength + humility | Values/ethos; OSA honour badges |
| **Crab / Kotokuraba** *(local, not adinkra)* | Oguaa's market/crab origin | Brand secondary mark; Heritage "Born of the Market"; Business |

---

## 3. Architecture

### 3.1 The three-pillar model (spec §7)
Everything is **Members** (people / identity), **Institutions** (verified bodies / authority), or **Listings** (all contributed content, one lifecycle). Built once: accounts, verification, the **submit → review → publish** engine, moderation, notifications, scheduled remembrances. Every feature is then a new *listing type*, *profile attribute*, *institution kind*, or *view*. Entities live in Go ([`backend/internal/domain`](backend/internal/domain)) and are mirrored as TypeScript ([`frontend/src/lib/types.ts`](frontend/src/lib/types.ts)).

### 3.2 Listing lifecycle (spec §8.2)
`draft → pending → approved | rejected → (resubmit) ; approved → unpublished → pending`. Moderation checklist: **real · local · correctly categorised · appropriate**; rejection carries a reason; owner notified on approve/reject; every action audited (`ModerationRecord`).

### 3.3 Data layer (Go + MongoDB)
Clean ports/adapters: `internal/domain` defines the entities + **repository interfaces**; `internal/infra/mongo` implements them against MongoDB (one polymorphic `listings` collection + `members`, `organizations`, `places`, `moderation_records`); `internal/service` holds the engine (submit/moderate/candle/tribute), query composition (genres, stats, the moderation queue), and the AI service. `cmd/seed` loads the fact-checked Cape-Coast-real seed data (compose service `seed`, one-shot; **warning:** `api` depends on it with `condition: service_completed_successfully`, so any `docker compose up -d api` re-runs it and the reseed is destructive — drop+insert. Use `docker compose up -d --no-deps api …` when preserving runtime-created local data). The frontend never touches the DB — it calls the JSON API via a small typed client (`frontend/src/lib/api.ts`). Delivered since this was written: password auth + JWT with optional TOTP MFA, first-party + Cloudinary image uploads, and the scheduled yearly-remembrance job. Still deferred: phone/WhatsApp OTP verification (the spec's primary spam gate) and email/WhatsApp notification delivery.

### 3.4 Routes
**API (Go, `/api/*`):** `home · stats · artists[/:slug] · genres · music/legacy · people · memorials[/:slug] · businesses[/:slug] · events · opportunities · memories · schools · institutions[/:slug] · places · members[/:slug]`; writes — `POST listings`, `POST admin/moderate`, `POST memorials/:slug/{candle,tributes}`, `POST ai`.

**React (Vite + React Router, code-split/lazy):**
```
/                         Home — the mirror
/music · /music/:slug · /music/the-oguaa-sound      Music flagship  [LAUNCH DEEP]
/memoriam · /memoriam/:slug                         Yɛnkae — In Memoriam  [FLAGSHIP]
/education · /education/:slug · /education/:slug/manage   Citadel + official institution profiles
/people · /people/:slug · /members/:slug            Sons & daughters + member profiles
/heritage · /culture · /visit                       Showcase sections
/business · /business/:slug                         Directory
/events · /events/:slug · /festivals · /festivals/:slug   Calendar + festival archive (ticketing)
/projects · /projects/:slug                         Adopt-a-project (Paystack pledges)
/community · /youth · /diaspora                     Get involved · opportunities · the register
/safety · /safety/:slug · /safety/report            Incidents, rescue & recovery
/lost-found · /lost-found/:slug · /lost-found/new   Lost items, found items, missing people
/news · /news/:slug                                 The newsroom's public face
/search · /signin · /privacy · /terms · /acceptable-use
/submit                   The shared submit→review→publish entry
/me                       Member profile (rep town / rep school / diaspora opt-in / listings)
/admin · /admin/compose   Portal-side moderation + the AI writing bar
```
Each route loads its data through a React Router **loader** hitting the Go API; routes are lazily imported so each page is a small chunk.

### 3.5 Non-functional (spec §11)
Mobile-first; low-bandwidth (≤~130KB first-load JS target, AVIF/WebP, lazy media, self-hosted fonts); **PWA** (manifest + offline shell) as the native bridge; per-listing **1200×630 OG cards** (WhatsApp is the #1 growth channel); AAA/AA contrast; HTTPS; phone private by default.

---

### 3.6 Admin platform (back-office) — [`admin/`](admin/)
A **dedicated admin application**, separate from the public site, for curators and stewards (spec §8.10, §8.13, §9). Its own Vite + React SPA with utilitarian back-office chrome (green-slate + the AI purple), talking to the same Go API under role-gated `/api/admin/*` endpoints. Surfaces:
- **Overview** — KPIs (members, listings by status, pending queue, institutions) per spec §4.
- **Moderation queue** — approve / reject-with-reason / request-changes / unpublish; every action audited.
- **Listings** — search/filter across all types & statuses; view, unpublish, re-review.
- **Members** — search; assign **curator/steward** roles; **suspend** abusive accounts (spec §8.10 spam controls, §9).
- **Institutions & verification** — review claims and grant the **verified-official badge** through recognised channels (spec §8.13/§14.8).
- **Audit log** — every moderation action (who · what · when · why).
- **Compose** — the AI writing assistant bar across admin text areas (spec §8.12).

Backend additions: `GET /api/admin/{members,listings,institutions,audit}`, `POST /api/admin/members/:id/{role,suspend}`, `POST /api/admin/institutions/:id/verify`, `POST /api/admin/listings/:id/unpublish`. (Auth gating delivered: `/api/admin/*` is role-guarded — curator/steward pass, plus a scoped `moderator` role limited to queue/listings/reports/incidents; staff are force-enrolled into TOTP MFA before the console unlocks. The admin SPA's own gate/nav filtering for the moderator role is still open — see §7.3.)

### 3.7 Mobile platforms (native) — [`mobile/`](mobile/)
The spec defers native apps (§6); this delivers them now. **Expo + React Native (expo-router, TypeScript)** — one codebase for **iOS, Android, and web**, consuming the same Go API. Mobile-first by nature, low-bandwidth aware. Today it **mirrors all portal features** (safety/incidents, lost & found, festivals, history hub, event ticketing, subscriptions, promotions, news, the diaspora register, institution pages + claims, notifications, MFA enrolment) with the Fraunces/Outfit identity bundled via `@expo-google-fonts` and enforced through the `D()/DI()`/`S()/SI()` theme helpers and `T`/`TI` text wrappers. Shares the API contract and types with the web app.

---

## 4. Build order (maps to spec §15)

**Phase 1 — all ten items delivered** (foundation; Home + Music deep; Yɛnkae; institutions; listing engine UI; admin + AI bar; Memory Wall/events/youth; showcase sections; PWA+SEO/low-bandwidth — *except the PWA shell itself, still open*; verify). Extras beyond the order: safety/incidents, lost & found, festivals archive, history hub, newsroom + AI bar, event ticketing, business subscriptions, paid promotions, revenue, the creator app, the diaspora register.

*Phase 2 (spec §15):* diaspora register **(delivered — opt-in member field, `/api/diaspora`, public `/diaspora` page on portal + mobile)**; adopt-a-project funding **(delivered — Paystack pledges, see money-flows convention)**; investment opportunities and mentor-to-youth matching (gated on the §14.4 safeguarding policy) remain.

---

## 5. What this pass delivers vs. defers

**Delivered (working full stack — Go + MongoDB + React + Expo, verified end-to-end):** the full design system; responsive layout + navigation; Home; the Music flagship; the Yɛnkae memorial (candle + tributes + yearly remembrance persist to Mongo); institution official profiles (18-block section library, gallery, offices, claims, official events); the shared submit→review→publish engine with **real mutations**; member profile; the admin moderation queue with audit records; the AI writing bar wired to a server-side Go endpoint (live Claude when `ANTHROPIC_API_KEY` is set, labelled simulation otherwise); all showcase sections; seeded, fact-checked data; Go unit tests + clean production builds; plus the money flows (pledges, tickets, subscriptions, promotions — live Paystack or labelled simulation), safety/incidents, lost & found, the festivals archive, the history hub, the newsroom, notifications, the creator app, and the diaspora register.

**Authentication (delivered).** Password sign-in → **JWT sessions** (`POST /api/auth/{register,login}`), 18+ DOB gate on self-registration, optional **TOTP MFA** with recovery codes (staff force-enrolled before the admin console unlocks), and Act 843 data rights (`GET /api/me/export`, `DELETE /api/me` — erasure anonymises in place and `$unset`s the sparse-unique email/phone). Roles: member, curator, steward, editor, plus a scoped **moderator** (queue/listings/reports/incidents only). `AUTH_REQUIRED=true` enforces sign-in on writes/admin in production; reads stay open.

**Deferred (documented, interfaces ready):** phone/WhatsApp **OTP verification** (the spec's primary spam gate — `PhoneVerified` exists but nothing sets it); email/WhatsApp **notification delivery** (in-app only today); deeper **maps** (per-listing pins, events, mobile); investment opportunities; mentor-to-youth matching (blocked on the unwritten §14.4 safeguarding policy); and the §14 legal pages drafted with counsel. The full status + backlog lives in §7.

---

## 6. Open decisions still to confirm with the community (spec §17)
Memorial name diacritics (**Yɛnkae**); whether "town" should mean quarters; the first curators; Translate target languages and AI per-admin limits; which institution kinds open beyond schools; default remembrance audience and living-member birthdays. None block the foundation.

---

## 7. Implementation status & backlog (single source of truth)

*Full audit of all three spec documents against the codebase, 2026-07-15. Update this section whenever a feature ships — it is the canonical done/left ledger. Statuses: ✅ done · ◐ partial (what remains in italics) · ☐ not started.*

### 7.1 Main spec — `oguaa/Oguaa-Platform-Specification.md`

**Phase 1 (§15) — delivered.** Foundation, listing engine + lifecycle, accounts, moderation/admin, music flagship, business directory, rep school/town, memory wall, Yɛnkae, events/calendar, youth board + talent spotlight, institutions registry (schools first), AI writing bar. Plus beyond-spec extras: safety/incidents, lost & found, festivals archive, history hub, newsroom, event ticketing, subscriptions, promotions, revenue, creator app, MFA.

**Phase 2 (§15) — half delivered.** Diaspora register ✅ (`/diaspora` portal + mobile) · adopt-a-project funding ✅ (Paystack pledges) · investment opportunities ☐ · mentor-to-youth matching ☐ *(blocked on the unwritten §14.4 safeguarding policy)*.

**Partial / open Phase 1 items:**
- ◐ §8.1 **Phone/WhatsApp OTP verification** — *◐ delivered 2026-07-15 (`d97c11c`): start/confirm endpoints (hashed code, 10-min TTL), `phoneVerified` gate on submit, portal + mobile verification UI, dev-mode code display. Still open: real SMS/WhatsApp provider delivery (ties to backlog #10) and the broader verification-badge surface.*
- ✅ §8.2 **Edit re-approval policy** — *minor/major split fully implemented: title change or change to major content keys (bio/description/lifeStory/epitaph/text/whyNotable/eligibility/services) re-queues the listing (`owner-edit-major` audit record); link/hours/contact/image-only edits stay live (`owner-edit-minor`). Tests updated to cover all four cases.*
- ◐ §8.5 **Rivalry signals** — *memberCount comparison bar on School detail page ✅ (top schools by member count, bar chart with this school highlighted); cross-school comparisons computed client-side from the existing `GET /api/schools` payload.*
- ✅ §8.7 **Memory-wall filters** by school/town/era/festival — *`GET /api/memories?school=&town=&tag=&era=`; filter bar on Community page; era options derived from memories.*
- ◐ §8.11 **Memorial keeper controls** — *fixed: submit defaults `remindersEnabled` on / `observeBirthday` off (explicit choices respected), the owner-edit whitelist accepts both flags, omitted flags carry over instead of resetting, and the portal submit form + creator editor expose the toggles. **Family claim/correct/remove** mechanism still missing (only a generic `bereavement` report reason). Funeral/celebration-of-life details (Open Decision #7) absent. Reminders are in-app only — no email/WhatsApp delivery.*
- ◐ §8.12 **AI bar** — *responses not streamed; Replace has no confirmation step; mounted on admin Compose and newsroom editor ✅ (editor shows bar seeded with article title+body); still not on all admin rich-text fields.*
- ◐ §8.13 **Institution announcements** — *no notice type distinct from events; no contested-claim "held and referred" state.*
- ◐ §11 **Non-functional** — PWA manifest + offline shell ✅ *(installable, boots offline once visited; `/api` stays network-only)*; per-listing 1200×630 OG share cards ✅ *(pure-Go renderer + crawler meta shim; scraper UAs mapped in portal nginx — every public page now shares a branded card)*; per-page titles/meta in the SPA itself ✅ *(`usePageTitle` hook + all 30+ pages wired; dynamic titles on detail pages)*; maps ◐ *(keyless OSM embed now on business, event, incident, lost-found and school pages — all have location/venue fields; events map and mobile still missing)*; localisation ◐ *(UI-chrome i18n switcher exists; no field-level/message-catalog scaffolding)*.
- ◐ §14 **Legal/compliance** — *cookie/consent notice ✅ (dismissible banner, `localStorage` persisted); guardian-consent flow for featuring minors ☐; privacy/terms/acceptable-use published but shallow drafts pending counsel.*
- ✅ §8.10 **Queue type filter** — *type filter chips on admin Moderation page (all existing listing types + incident + lostfound); backend `GET /api/admin/queue?type=` already supported.*
- ◐ §4 **KPI instrumentation** — *`PlatformViewsThisMonth` added to backend Stats + admin Overview shows "Views this month" metric tile ✅; approval-time metrics and click-through still absent.*

### 7.2 Institution pages — `oguaa/Institution-Pages-Spec.md`

**Delivered.** The whole fixed-core + composable-blocks model: `MediaAsset`/`ProfileSection` domain (18 block types, tones, hidden/anchor), gallery + lightbox, `requireManager` gate with steward bypass, type/tone allowlists + URL sanitizers, rate limits (60/h manage, 20/h·org events, 10/h claims), web + mobile renderers, portal + admin editors, Cloudinary upload pipeline with responsive helpers, claim → steward-verify → manage, immediate publish for managers, official events (auto-publish for verified orgs), verified schools + heritage seed data.

**Partial / open:**
- ◐ **Per-kind structured catalog (§4)** — blocks cover presentation; signature structured fields absent (office-holder terms/predecessor/successor, GES category/boarding/gender, OSA endowment, NHIS flag, dual-tier citizen/foreigner pricing, giving fields). *Education strongest; health and government weakest.*
- ◐ **Media metadata (§5)** — *alt/caption collected; Credit field added to gallery and section media editors in portal ManageInstitution + creator institution-panels ✅.*
- ◐ **Notices** — *official events double as announcements; no distinct notice type; mobile institution page shows no events/announcements at all.*
- ☐ **§7 Localization pack** — field-level i18n, MoMo as a giving field, GhanaPostGPS + lat/long, quarter/Asafo tag on orgs, kind-specific verification artifacts. *All unbuilt.*
- ☑ **schema.org JSON-LD** per institution ✅ (Organization/EducationalOrganization block embedded via `<script type="application/ld+json">` on the School detail page).
- ☑ **Revoke-verification lever** — *fixed: public directory/schools lists are verified-only, the public institution detail 404s for unverified orgs (steward/manager bypass), revoking demotes the org's approved official events to unpublished (re-verify republishes), the admin queue reads `GET /api/admin/institutions` (unfiltered), and portal badges render only when `verified`. Remaining seed fixture `kotokuraba-traders` is the deliberate unverified case.*
- ☐ **Manager revocation** endpoint/UI (only pending-claim review exists).

### 7.3 Creator platform — `oguaa/Creator-Platform-Plan.md`

**Phase 1 (foundation) — shipped 2026-07-15.** `members.creatorTypes` + register payload, portal join citizen/creator picker, moderator role (backend), `GET /api/creator/overview`, `POST /api/me/creator-types`, the `creator/` app on :3004 (auth gate, Aura sidebar, Overview KPIs, My Work with in-place promote, Grow/Plan, Money, Institutions, Account, Notifications).

**Phase 2 (money & team) — shipped.** Owner listing editor (slice 1, `02fde49`); plans catalog, institution workspace port, team/officer invitations and the request-a-new-institution flow all shipped 2026-07-16. Delivered:
- ☐ **Plans catalog (§5)** — `plans` collection + admin **Monetization → Plans** CRUD + `GET /api/plans`, seeded Starter/Supporter/Featured; nothing price-related hardcoded client-side. **SHIPPED 2026-07-16** — the §5/§9.1-vs-§7.6 contradiction resolved for the collection (§9.1 is the later, explicit decision): `Plan` domain + repo, admin CRUD (curator/steward), subscribe consumes catalog prices (explicit-plan strict, default-plan legacy fallback), Featured bundle auto-applies its 7 promo days on every confirmed payment, creator Grow + portal subscribe panel + admin Subscriptions labels all read the catalog.
- ☐ **Institution workspace port (§4.1.3)** — the five manage panels into the creator app + TEAM sidebar + institution switcher. **SHIPPED 2026-07-16** — `/team` + `/team/:slug` routes, org-switcher chips, the portal manage page ported verbatim (profile, custom sections builder with all 18 types, gallery, offices, official events) into `institution-panels.tsx` restyled to creator conventions; Institutions page now links internally; zero backend changes. E2E 17/17 (save-profile persist, section add/save/persist, verified-event publish → live on portal).
- ☐ **Team/officer invitations (§4.1.2)** — `invited` claim status + `invitedById`, invite/accept/decline/revoke endpoints, manager-vs-officer scopes, team list UI. **SHIPPED 2026-07-16** — claim lifecycle extended (`invited`/`declined`/`revoked` + `scope` + `invitedById`; scope-less approved claims = managers), `POST .../team/invite` (manager-scope only), `GET .../team` roster (viewerScope), `POST .../team/{id}/scope`, `DELETE .../team/{id}` (managers + steward/moderator override, no self-revoke), `GET /api/me/invitations`, `POST /api/claims/{id}/respond` (accept = approved, no steward review, office auto-seated; both sides notified). Creator Team page: roster panel (invite form + promote/demote/remove, manager-only) + "Invitations for you" accept/decline (also shown to members with no orgs yet — it's their entry point). 11 service tests (recClaims/teamMembers fakes); e2e 16/16 full cycle + workspace suite 17/17.
- ☐ **Request-a-new-institution flow + server-side kind catalog** (school, traditional-authority, association, faith, civic, asafo, heritage). **SHIPPED 2026-07-16** — `GET /api/institution-kinds` (7-kind catalog), `POST /api/institution-requests` (validated, one open request per member, duplicate-name guard), `GET /api/me/institution-requests`; the request rides the same steward claims queue as an `OrgClaim` with a `newOrg` payload — one approve click creates + verifies the org (seat → jurisdiction) and auto-approves the requester as first manager (office seated, tailored notification); admin Claims page shows a "new · kind · seat" pill; creator Institutions page has the request form + review-state list. 8 service tests; e2e 13/13 (request → queue → approve → manage → live page) + 3/3 admin queue.

**Phase 3 (visibility) — not started.** View counter (`POST /api/listings/:id/view`, daily-deduped) + analytics; "Trade in Oguaa" home band (category chips + 4 cards, supporters first); creator CTA banner; creator public profiles `/creators/:slug` *(marked "?" in the plan — undecided)*.

**Small gaps:** `/me` "Become a creator" entry point; creator Account type-picker omits `institution`; Drafts view; Payouts ledger; **admin SPA moderator gating** (auth gate rejects moderators; nav not role-filtered; RoleBadge lacks a moderator tone); creatorTypes migration for pre-existing business owners; `dev.sh` verify script; citizen upgrade screen is a soft CTA, not the planned screen.

### 7.4 Prioritized backlog (next-up order)

1. ~~OTP verification + submit gate~~ ✅ core slice (`d97c11c` — codes, gate, UI; **provider delivery remains**, folded into #10).
2. ~~Memorial keeper reminder controls~~ ✅ (§8.11 — submit defaults, edit whitelist + carryover, portal/creator toggles, `RunRemembrance` test coverage).
3. ~~Revoke-verification takes the page offline + conditional badge~~ ✅ (Institution §6 — verified-only directory, gated detail, events demote/restore, conditional badges, admin list endpoint).
4. ~~**Creator Phase 2 remainder**~~ ✅ — plans catalog (`GET /api/plans` + admin CRUD + subscribe consumes it) → institution workspace port (`/team` workspace, five panels, org switcher) → team/officer invitations (claim lifecycle + scopes + roster UI).
5. ~~**Request-a-new-institution flow + server-side kind catalog**~~ ✅ (`/api/institution-kinds` + requests ride the steward queue; approve creates the verified org + seats the requester).
6. ~~**Per-listing OG cards / rich link previews**~~ ✅ — pure-Go 1200×630 renderer (`infra/http/ogcard`, vendored Fraunces/Outfit OFL fonts, cover compositing) at `GET /api/og/image/{path…}.png`; crawler meta shim at `GET /api/og/page/{path…}` (og/twitter tags + meta-refresh; unapproved listings never leak — fall back to the site card); portal nginx maps scraper UAs (facebookexternalhit, Twitterbot, WhatsApp, LinkedIn, Slack, Telegram, Discord, Pinterest, Reddit, Embedly, Applebot) onto the shim, humans get the SPA. Rate-limited 60/min; 1h cache.
7. ~~**PWA manifest + offline shell**~~ ✅ — `manifest.webmanifest` (standalone, brand icons: any+maskable 192/512 + apple-touch 180, generated from the crab SVG); `sw.js` (navigations network-first → cached shell fallback; `/assets`+font CDNs cache-first; `/uploads` SWR; `/api` network-only); prod-only registration in `main.tsx`; nginx serves manifest as `application/manifest+json`.
8. ~~**View counter**~~ ✅ (`POST /api/listings/{id}/view` — daily-deduped by member ID / IP; `listing_views` collection; `viewCount` on listing doc; `viewsThisMonth` KPI in creator overview; `useRecordView` pings wired into all 8 portal + 8 mobile listing detail screens).
9. ~~**Memory-wall filters**~~ ✅ (`GET /api/memories?school=&town=&tag=&era=` — `TownID`/`Tag`/`Era` added to `ListingFilter`; `FilteredMemories` service method; filter bar on Community page with school/quarter/era selects + clear button; era options derived from the memories themselves).
10. ~~**Edit re-approval policy**~~ ✅ (spec §17.3 — the minor/major split of §8.2 above is the chosen option: `owner-edit-major` re-queues title/major-content edits, `owner-edit-minor` keeps link/hours/contact/image edits live; covered by `owner_edit_test.go`).
11. **Email/WhatsApp notification delivery** (spec §8.11/§12).
12. **Maps depth** — per-listing geocoded pins, events map, mobile (spec §12).
13. **Institution localization pack + schema.org** (Institution §4/§7).
14. **AI bar polish** — streaming, replace-confirmation, mount on all admin rich-text fields (spec §8.12).
15. ~~**Admin moderator-role SPA gating + queue type filter**~~ ✅ (auth-gate now admits moderator role; MFA not enforced for moderators; nav filtered to queue/listings/reports/incidents for moderators; `RoleBadge` chip in user menu; `?type=` filter dropdown on Moderation queue page).
16. ~~**Admin first-login guided tour**~~ ✅ — hand-rolled spotlight walkthrough (`tour.tsx`, zero deps): 7 steps (welcome, sidebar sections, review queue, global search, notifications, account menu, workspace), dim panes cut around a gold-ringed target, popover clamped into the viewport, Escape/←/→ keyboard support; auto-opens 900 ms after first dashboard paint, once per member (`localStorage oguaa.admin.tourSeen.<id>`); "Replay tour" row in the user dropdown re-opens it. E2E 12/12.
17. **Cookie notice, legal depth, guardian-consent flow** (spec §14.4/§14.6/§16).
18. **Phase 2 spec remainder** — investment opportunities; mentor-to-youth matching *(both gated on the §14.4 safeguarding policy, itself unwritten)*.
19. **Smaller items** — school rivalry signals ✅; official-announcements type; contested-claim hold; funeral details; mobile institution events ✅ (Events & Announcements section from `officialEvents`); mobile manager editing; creator mobile section (explicitly future); `/me` creator upgrade entry ✅ (Become a creator CTA panel for members with no creatorTypes); media Credit capture ✅ (credit input in gallery + section-media editors); Drafts view ✅ (status-filter tabs on MyWork: All/Draft/Pending/Approved/Rejected); Payouts ledger; migrations + verify script; mobile maps; schema.org JSON-LD per institution ✅ (Organization/EducationalOrganization block on School.tsx); "Trade in Oguaa" home band ✅ (category chips + 4-card grid + link to /business); per-page document titles ✅ (`usePageTitle` hook, 30+ pages); cookie consent banner ✅.
20. **Mobile-web hydration noise** — every dynamic route (`[type]`, `[topic]`, `[slug]`) on the Expo static web export logs React #418 (server HTML ≠ client) on load; screens recover and render fine. Pre-existing (verified against untouched `[slug]` routes), cosmetic but noisy — likely an expo-router static-render + RN-web mismatch; consider client-only rendering for dynamic routes.
