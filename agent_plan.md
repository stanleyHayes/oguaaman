# Oguaa Platform — Agent Build Plan

> **Working name:** Oguaa — a community-pride platform for **Cape Coast (Oguaa)**, Central Region, Ghana.
> **This document** is the agent's build plan: it captures the Cape Coast research that grounds the
> visual identity, the design system derived from it, the architecture, and the build order. It is a
> companion to `oguaa/Oguaa-Platform-Specification.md` (the product spec) — read that for *why*; read
> this for *how it's being built*.
>
> **Status:** Phase 1 build in progress. Stack chosen, design system locked, foundation underway.

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
| §17.3 | Edit re-approval | **All edits re-reviewed at launch** (simplest), config flag to relax later | Spec §8.2 simplest launch setting. |
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

### 2.3 Typography (canonical set)
- **Cormorant Garamond** (display/hero/section heads/wordmark/pull quotes) — engraved civic-stone serif.
- **Spectral** (long-form reverent body: memorial eulogies, heritage long-reads; supports ɛ/ɔ).
- **Figtree** (UI/body workhorse: forms, chips, metadata) — warm humanist sans.
- **JetBrains Mono** (AI output/diffs only).
- *Bridge:* **Libre Baskerville + Archivo** retained for Education crests/mottos.
- Always render Fante diacritics (ɛ, ɔ). Self-host via `next/font/google`, `display:swap`, latin + latin-ext.

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
Clean ports/adapters: `internal/domain` defines the entities + **repository interfaces**; `internal/infra/mongo` implements them against MongoDB (one polymorphic `listings` collection + `members`, `organizations`, `places`, `moderation_records`); `internal/service` holds the engine (submit/moderate/candle/tribute), query composition (genres, stats, the moderation queue), and the AI service. `cmd/seed` loads the fact-checked Cape-Coast-real seed data. The frontend never touches the DB — it calls the JSON API via a small typed client (`frontend/src/lib/api.ts`). Deferred: auth + phone/WhatsApp OTP, image storage, scheduled yearly-remembrance jobs.

### 3.4 Routes
**API (Go, `/api/*`):** `home · stats · artists[/:slug] · genres · music/legacy · people · memorials[/:slug] · businesses[/:slug] · events · opportunities · memories · schools · institutions[/:slug] · places · members[/:slug]`; writes — `POST listings`, `POST admin/moderate`, `POST memorials/:slug/{candle,tributes}`, `POST ai`.

**React (Vite + React Router, code-split/lazy):**
```
/                         Home — the mirror
/music · /music/:slug · /music/the-oguaa-sound      Music flagship  [LAUNCH DEEP]
/memoriam · /memoriam/:slug                         Yɛnkae — In Memoriam  [FLAGSHIP]
/education · /education/:slug                        Citadel + official school profiles
/business · /business/:slug · /events · /community  Directory, calendar, get-involved
/people /heritage /culture /visit                   Showcase sections
/submit                   The shared submit→review→publish entry
/me                       Member profile (rep town / rep school)
/admin · /admin/compose   Moderation queue + the AI writing bar
```
Each route loads its data through a React Router **loader** hitting the Go API; routes are lazily imported so each page is a small chunk (≈1–9 KB).

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

Backend additions: `GET /api/admin/{members,listings,institutions,audit}`, `POST /api/admin/members/:id/{role,suspend}`, `POST /api/admin/institutions/:id/verify`, `POST /api/admin/listings/:id/unpublish`. (Real auth gating is the documented next step; until then the API is open in dev and the admin app carries a demo steward identity.)

### 3.7 Mobile platforms (native) — [`mobile/`](mobile/)
The spec defers native apps (§6); this delivers them now. **Expo + React Native (expo-router, TypeScript)** — one codebase for **iOS, Android, and web**, consuming the same Go API. Mobile-first by nature, low-bandwidth aware. Core: a tab shell (Home · Music · Yɛnkae · More), the artist directory + profile (stream-out links), the In Memoriam list + memorial with **light-a-candle** (a real write to the API), and entry points to the other sections. The "Castle, Canopy, and Canoe" identity is reproduced with React Native styles + the Adinkra marks. Shares the API contract and types with the web app; auth/push/OTP ride the same backend once added.

---

## 4. Build order (maps to spec §15)

1. **Foundation** — types, design tokens, data layer, layout/nav/footer. *(in progress)*
2. **Home + Music (deep)** — the mirror; artist directory, profile, The Oguaa Sound, submit.
3. **Yɛnkae / In Memoriam** — index + memorial page (candle, tributes, yearly remembrance) — flagship of reverence.
4. **Institutions** — school official profile + registry (verified badge, offices, official notices).
5. **Listing engine UI** — shared submit flow, member profile, rep town/school.
6. **Admin** — moderation queue + the **AI writing assistant bar** (server-side Claude, streamed, metered).
7. **Memory Wall, Events/Calendar, Youth Opportunities** — further listing types + views.
8. **Stub sections** — People, Heritage, Culture, Visit, Business, Community — structured shells filled as content arrives.
9. **PWA + SEO/OG + low-bandwidth polish.**
10. **Verify** — clean build + dev server + browser smoke test.

*Phase 2 (spec §15):* diaspora register **(delivered — opt-in member field, `/api/diaspora`, public `/diaspora` page on portal + mobile)**; adopt-a-project funding **(delivered — Paystack pledges, see money-flows convention)**; investment opportunities and mentor-to-youth matching (gated on the §14.4 safeguarding policy) remain.

---

## 5. What this pass delivers vs. defers

**Delivered now (working full stack — Go + MongoDB + React, verified end-to-end):** the full design system; responsive layout + navigation; Home; the Music flagship; the Yɛnkae memorial (candle + tributes persist to Mongo); school official profiles; the shared submit→review→publish engine with **real mutations**; member profile; the admin moderation queue with audit records; the AI writing bar wired to a server-side Go endpoint (live Claude when `ANTHROPIC_API_KEY` is set, labelled simulation otherwise); all showcase sections; seeded, fact-checked data; Go unit tests + a clean frontend production build.

**Authentication (delivered).** Passwordless **phone/email OTP → JWT sessions** (spec §8.1, §9): `POST /api/auth/{request-otp,verify-otp}` + `GET /api/auth/me`, find-or-create member on verify, JWT (HS256) bearer tokens. An `OTPSender` interface fronts delivery — the dev impl logs the code (and the API returns it in dev mode); a real SMS/WhatsApp provider (e.g. Hubtel) drops in there. Gating is feature-flagged by `AUTH_REQUIRED`: submit needs a signed-in member (owner is attributed to them), `/api/admin/*` needs curator/steward (stewards pass all), and unauthenticated reads stay open. Wired across all three clients: the **web** (sign-in route, header state, submit gate, real `/me`), the **admin** (whole back-office gated behind a curator/steward sign-in), and **mobile** (sign-in screen + token storage + More-tab state).

**Deferred (documented, interfaces ready):** a live SMS/WhatsApp OTP provider (the `OTPSender` seam) and a live Claude key; scheduled yearly-remembrance jobs; image uploads/storage; a PWA manifest/offline shell; maps; the §14 legal pages drafted with counsel. None require re-architecting — they slot behind the existing interfaces, service methods, and API/route shapes.

---

## 6. Open decisions still to confirm with the community (spec §17)
Memorial name diacritics (**Yɛnkae**); whether "town" should mean quarters; the first curators; Translate target languages and AI per-admin limits; which institution kinds open beyond schools; default remembrance audience and living-member birthdays. None block the foundation.
