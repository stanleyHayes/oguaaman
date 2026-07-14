# Oguaa — Official Institution Pages

> **Status:** v1 shipped (gallery + 7 section blocks, full stack). This document is the
> canonical reference for institution profiles as **official, self-served home pages** —
> the data model, the section/block library, the exhaustive per-kind content catalog,
> and the media + governance rules. Companion to `Oguaa-Platform-Specification.md` (§8.13)
> and `../agent_plan.md` (§3, build order step 4).

---

## 1. The idea

An institution profile is no longer a flat "infobox" — it is the body's **official home page**.
The founder's two requirements:

1. **Add images** to the profile.
2. **Create custom sections** to showcase things — "our library", "classrooms", "achievements", "history".

The architecture, drawn from how Google Business Profile, LinkedIn Pages, Wikipedia, and every
headless CMS solve this, is **hybrid**:

> **A fixed, verified structured core (the infobox) + an open, reorderable library of
> media-rich section blocks the manager composes + one shared photo gallery the blocks draw from.**

Plus a recursive principle the domain already hints at via `Office`: **sub-entities reuse the
same engine** (a school's houses, a university's departments, an alumni body's year groups,
the seven Asafo companies, a chief's succession line) — each a repeatable record that can carry
its own mini-profile. v1 ships the engine + the 7 highest-value block types; sub-entity nesting
and the longer block catalog are the documented roadmap (§5, §9).

---

## 2. Data model

### 2.1 Go domain (`backend/internal/domain`)

New shared value types in `domain.go`:

```go
type MediaAsset struct {            // an image (or other media) + metadata
    ID, URL    string               // URL = Cloudinary secure_url (see §6)
    Kind       string               // photo | logo | cover | document | video
    Alt        string               // accessibility + low-bandwidth fallback
    Caption    string
    Credit     string
    Moderation string               // approved | pending | rejected (default approved)
}

type SectionItem struct {           // one row in a list-style block; fields are a superset
    ID, Label, Value, Detail, Image, URL string
}

type ProfileSection struct {        // one author-composed block
    ID, Type, Title, Anchor, Tone string
    Hidden  bool                    // zero value = visible (safe default for seed/import)
    Body    string                  // richtext: Markdown
    Media   []MediaAsset            // gallery
    Items   []SectionItem           // stats | team | timeline | faq | docs
}
```

> **Why `Hidden`, not `Visible`:** a plain `Visible bool` zero-values to `false`, so any
> section authored outside the editor (seed, import, future Go) would silently hide itself.
> `Hidden` (omitempty) makes the safe state the default. The renderer skips `s.hidden` sections
> **and** sections with no content (no orphan headings).

Two fields added to `Organization` (`organization.go`):

```go
Gallery  []MediaAsset      `json:"gallery,omitempty"  bson:"gallery,omitempty"`
Sections []ProfileSection  `json:"sections,omitempty" bson:"sections,omitempty"`
```

`SectionItem` is a **superset row** — each block kind uses the subset it needs:

| Block | Label | Value | Detail | Image | URL |
|---|---|---|---|---|---|
| stats | label | value | — | — | — |
| team | role / class | name | bio | photo | — |
| timeline | date | heading | description | — | — |
| faq | question | answer | — | — | — |
| docs | title | — | note (e.g. "PDF") | — | file link |

### 2.2 Persistence & API (the `SetOffices` precedent, deliberately)

`Gallery` and `Sections` are **list fields with dedicated full-replace setters** — *not* part of
`OrgProfilePatch`. This is intentional: folding them into the profile patch would make every
plain profile save (which has no gallery field) **clobber** the gallery/sections to empty. The
roster (`SetOffices`) already establishes this split; gallery/sections follow it exactly.

- **Repo** (`OrganizationRepository`): `SetGallery(id, []MediaAsset)`, `SetSections(id, []ProfileSection)` — `$set` the single bson field, nil-guarding the slice to `[]` (round-trip safety).
- **Service** (`org_management.go`): `SetOrgGallery`, `SetOrgSections` — each starts with `requireManager` (the approved-claim gate), validates **type + tone against allowlists** (`ValidSectionType`/`ValidTone`), **sanitizes link URL schemes** (`safeURL` drops `javascript:`/`data:`/etc. — defense-in-depth for the docs/contact `<a href>` sinks), mints IDs for new items (`med-…`, `sec-…`, `itm-…`), drops URL-less media and fully-empty rows, then re-reads via `ByID`.
- **HTTP** (`institution_manage_handlers.go`): `SetInstitutionGallery`, `SetInstitutionSections` (and the other manager mutations) — `requireAuth` → **rate-limit** (`orgmanage` 60/h, `orgevent` 20/h·org, `orgclaim` 10/h) → decode → service → `handleErr` (Forbidden/NotFound) / `400` (validation).
- **Client XSS guard** (`profile-sections.tsx`): the hand-rolled docs `<a href>` runs `safeHref` (React does not sanitize `href`); the richtext path is already safe (react-markdown strips `javascript:` + raw HTML by default).
- **Routes**: `POST /api/institutions/{slug}/gallery`, `POST /api/institutions/{slug}/sections`.
- The public read `GET /api/institutions/{slug}` serializes the new fields automatically (json tags).
- Request body cap raised to **256 KB** (`maxBody`) for roomy section payloads.

> **gRPC/GraphQL note:** Organization is a *read-only projection* on those transports and the
> mappers are hand-maintained allowlists. v1 surfaces gallery/sections over **REST only** (which
> all three clients use). If a gRPC/GraphQL consumer ever needs them, extend
> `grpcapi/mapping.go` + `graphql/types.go` (and regen the proto) — not required today.

### 2.3 TypeScript mirror

`frontend/src/lib/types.ts` and `admin/src/lib/types.ts` mirror `MediaAsset`, `SectionItem`,
`ProfileSectionType`, `ProfileSection`, and the two new `Organization` fields. API client gains
`setOrgGallery(slug, gallery)` and `setOrgSections(slug, sections)` (full-replace, returning the
fresh `Organization`).

---

## 3. The section/block library

A page is an **ordered array of typed blocks**; managers add, reorder (↑/↓), hide (`visible`), and
delete them, picking from a **closed, approved list** — flexible for them, consistent & responsive
for us. Accents resolve through the shared `TONES` map (`green | clay | gold | maroon | teal`) so
blocks stay native to the "Castle, Canopy, and Canoe" system. Purple (AI) is never used here.

**Shipped in v1** (`frontend/src/components/profile-sections.tsx`):

| Block | Renders | Founder ask |
|---|---|---|
| **richtext** | Title + Markdown body (GFM tables, lists, links) | history, mission, "about", fees tables |
| **gallery** | Title + image album with caption scrim + lightbox | **"our library", "classrooms"** |
| **stats** | Title + number/label cards | "founded 1876 · 1,200 students" |
| **team** | Title + people grid (photo/initials, name, role, bio) | leadership, faculty, notable alumni |
| **timeline** | Title + dated milestone rail | history milestones, achievements |
| **faq** | Title + accordion (native `<details>`) | admissions, visitor FAQ |
| **docs** | Title + download list (file links) | prospectus, bylaws, forms |
| **quote** | Pull-quote + attribution (the title) | ethos, alumni voices |
| **cta** | Heading + text + buttons (brand-green, web-safe) | apply, donate, visit |
| **logos** | Partner/sponsor/funder logo wall | partners, OSA chapters, funders |
| **groups** | **Sub-entity cards** — crest/initials, subtitle, colour dots, summary, key/value facts | **houses, departments, alumni year-groups, the seven Asafo companies, chief lineage** |
| **hero** | Banner — optional bg image (overlay) + heading + subtext + buttons | page opener, "150 years", admissions call |
| **testimonials** | Quote cards — quote + author + role + photo | alumni, parents, partners |
| **contact** | Address + label/value rows (hours, phone, email) with safe `tel:`/`mailto:` links | visit & contact, opening hours |
| **menu** | Item list with right-aligned prices + descriptions | restaurant menus, school fees, ticket tiers, service price lists |
| **schedule** | Timetable — when / time / note rows | prayer times, fixtures, service times, clinic days, programming, bell schedule |
| **map** | Address + an auto-generated "Get directions" link (no heavy embed) | find-us / location |
| **divider** | Decorative Adinkra `SymbolDivider` (no content) | visual separation |

Plus the **shared photo gallery** (`Organization.Gallery`) — the low-friction "add images"
surface, rendered as a "Gallery" section on the public page.

**Roadmap blocks** (catalog complete; not yet built): hero, map, hours/contact card,
testimonials, two-column. A new block = a new `Type` value + a renderer + an editor case —
**no schema change**.

---

## 4. Exhaustive per-kind content catalog

Every kind shares the **universal core** (name, alt/local name, logo/crest, cover, tagline/motto,
description, kind, founded, address + **quarter/Asafo**, geo, hours, phone/WhatsApp, email,
website + socials, languages EN/Fante/Twi/Ga/Ewe, leadership, verified badge) → maps to
schema.org `Organization`/`LocalBusiness` for SEO + AI discovery. Below is what's **distinctive**
per kind — the signature sections and structured data a generic template would miss. (Synthesised
from a 5-track research sweep; primary sources at the end.)

### 🎓 Education (basic, SHS, TVET, college of ed, university)
Core extras: type (public/mission/private), religious affiliation, gender, boarding/day, **GES
category (A–D)**, mentoring university (colleges of ed), house colours, accreditation (GTEC/CTVET),
school code, exam system (WASSCE/BECE). Signature sections: **facilities** (library, labs, ICT,
classrooms, **dormitories/houses**, dining, chapel, sick bay; TVET workshops per trade) ·
academics (programmes, **faculties→departments** as sub-profiles, WASSCE/NSMQ results) · admissions
(requirements, fees, **prospectus PDF**, scholarships, cut-off points) · history timeline ·
achievements & **notable alumni** · student life (clubs, sports, **anthem audio**, prefects) ·
**houses** (colour, crest, housemaster) · staff directory. **Alumni (OSA) module** — association
identity + **year groups** (each a sub-entity: execs, projects, dues) + **endowment fund**
(goal/raised/donate) + scholarships + reunions.

### 🏛️ Government / civic offices (MMDA, assemblies, ministries, directorates, courts, utilities)
Core extras: org type, jurisdiction + area + population, enabling law (e.g. CCMA L.I. 1927),
mandate/mission/vision, parent org, budget, lead office-holder (Mayor/MCE) + portrait, MCD,
presiding member, FOI desk. Sections: mandate & functions · **org structure / departments /
sub-metros** · leadership & office-holders · **services + how to access** (citizen's-charter:
name, eligibility, requirements, steps, fees, desk, redress) · public notices · **documents &
forms** (bylaws, composite budgets, gazettes, press releases) · projects & investment · partnerships
/ sister cities · history. **Office-holder modeling:** the office is a *persistent record*
separate from the person — `term start/end, predecessor, successor, status`; show current **and**
past holders.

### 👑 Traditional authorities / chieftaincy (Oguaa Traditional Council, Asafo)
Core extras: traditional area, type (council/paramountcy/stool/Asafo/House of Chiefs), Omanhene +
Ohemaa + Okyeame + portraits, palace + map, parent (Regional/National House of Chiefs), festivals.
Signature sections: about the stool · **traditional administration structure** (Omanhen → divisional
chiefs → Tufuhen → Akyeame → Asafo heads → Ebusuapanyin) · **the seven clans (Ebusua)** · leadership
with **lineage/succession** · **the seven Asafo companies** (a repeatable record: name, **company
colours**, Supi & Safohen, **Posuban shrine** image, **frankaa flags**, roles) · **regalia &
symbols** (black stool, linguist staff, palanquin, state umbrellas) · **festivals** — Fetu Afahye
as a *multi-ceremony schedule* (Ekutu Da, Bakatue, vigil, Grand Durbar), not one event · palace /
museum · history. **Lineage** uses royalty semantics (reign/enstoolment, predecessor/successor,
clan, status) → feeds the **Yɛnkae remembrance** ("followers-of-creator").

### ⛪ Religious bodies (churches, mosques, shrines)
Core extras: faith tradition, denomination, **hierarchy** (Society→Circuit→Diocese→Conference;
Parish→Archdiocese; under Chief Imam), congregation size, patron. Structured: **service/worship
times** (Christian multi-service incl. Fante; Muslim **five daily prayers + Jumu'ah + Taraweeh**);
**giving** (tithes, harvest, building fund, **Zakat**, via **MoMo/bank**); sacraments/rites.
Sections: plan your visit · beliefs · clergy/leadership · **ministries & fellowships** · **sermons**
(audio/video archive) · livestream · branches/daughter assemblies · cell groups · schools/clinics
run · prayer requests. Mosque: prayer-times widget, madrasah, Ramadan timetable. Shrine: deity
focus, festival calendar, taboos/etiquette, custodian.

### 🏥 Health (teaching/govt hospitals, clinics, CHPS, pharmacies)
Core extras: facility type, ownership (GHS/teaching/CHAG/private), bed capacity, referral level,
accreditation (HEFRA/MDC/NHIA), accepting-new-patients, 24/7 emergency. Structured: **departments /
specialties + clinic-day grid** · **find-a-doctor directory** (specialty, qualifications, languages,
conditions, ward) · OPD & visiting hours · emergency info · **insurance — NHIS accepted is the
flagship field** + MoMo · appointment + required docs. Sections: hero + emergency strip ·
departments · find a doctor · services · patient & visitor info · NHIS & billing · maternity/child
health · facilities & wards gallery · health tips/outreach · careers · research & teaching (UCC) ·
accreditations · feedback/complaints.

### 🤝 NGOs / CBOs / foundations / associations / clubs / cooperatives
Core extras: org type, **legal status + registration** (RGD + Dept. of Social Welfare cert — the
verification artifact), cause/focus, service area, size. Structured: mission/vision · **programs/
projects** (status, location, beneficiaries) · **impact metrics** · team & **board** · partners/
funders · financials/annual reports · **donation methods** (MoMo + bank + presets + monthly) ·
volunteer roles. Sections: hero + Donate CTA · mission/story · programs · **impact/results** ·
stories/testimonials · team & board · partners wall · get involved · donate · events/campaigns ·
annual reports · registration certs. **Club/sport:** colours/crest, league, **squad/roster**,
**fixtures & results**, league table, **honours/trophies**, stadium, membership/fan club, sponsors.
**Cooperative/association:** membership type & count, executives, bylaws, services (susu/savings &
loans, group purchasing), dues, sector, umbrella affiliation.

### 🛍️ Business (shops, restaurants, hotels, banks, markets, professional services)
Core extras: price range, **payment methods (MoMo first-class)**, currency (GHS), business
registration/TIN, certifications (FDA/GTA/bar/ICAG), service options, attributes (women-owned,
Wi-Fi, generator/backup power), branches. Structured per sub-type: restaurant → **menu** (sections→
items→price GHS, dietary incl. halal, reservations); hotel → **room types + rates, check-in/out,
amenities, booking**; bank → services + branch/ATM locator + BoG licence; **market (Kotokuraba)** →
commodity zones + **vendor directory** + market days; professional → practice areas + credentials +
booking. Sections: products/services catalog · menu/price list · gallery · team · branches · offers ·
reviews · booking/order CTA · certifications · FAQ · story.

### 🏛️ Cultural / heritage (Cape Coast Castle, Kakum, museums, libraries, galleries, theatres)
Core extras: site type, **UNESCO status** (Castle: Forts & Castles, 1979, criteria), managed-by
(GMMB/CNC), **dual-tier ticket pricing (citizen vs foreigner, student, child)**, tour languages,
tour-booking page. Structured: **collections/exhibits** (era, provenance, material, significance) ·
exhibitions (permanent/temporary) · **ticket tiers** · tour types · UNESCO metadata · park-specific
(Kakum canopy walkway, trails, species). Sections: overview/significance · history · Outstanding
Universal Value · collections · highlights · guided tours · plan your visit · accessibility ·
facilities · education programs · conservation · events (PANAFEST, Emancipation Day) · gallery +
**360° tours / audio guides** · donate/support.

### 📻 Media & sports (radio/TV/press; clubs/teams)
**Media:** frequency (FM/AM), call sign, coverage, owner, languages. Sections: **programming
schedule grid** · shows catalog · **presenters/DJs/journalists** · livestream · podcasts/archive ·
advertise/rate card · awards · editorial/transparency policies. **Sports:** sport, league,
nickname, colours, crest, **home stadium**. Sections: **squad/roster by position** · technical team ·
**fixtures & results** · **league table** · **honours/trophies** · history · stadium · teams (men/
women/youth) · club TV · shop · tickets · **membership/fan club** · sponsors · supporters.

---

## 5. Media model

- **Upload:** Cloudinary, client-side unsigned preset, via the shared `<ImageUpload>` component
  (web/admin) and `<ImageField>` (mobile). The Go API only stores the returned URL. (The
  first-party `POST /api/uploads` path exists but is a dead alternative — do not reintroduce it on
  the clients.)
- **Per-asset metadata:** `alt` (accessibility + the fallback users see on slow/failed loads),
  `caption`, `credit`, `kind`, `moderation`. Editors collect alt + caption per image.
- **Low-bandwidth (Ghana, mobile-first):** all gallery images are lazy `<img loading="lazy">`
  with `object-cover` and an `onError` fallback to a deterministic brand gradient + caption
  (graceful degradation — matches the memorial-gallery precedent). **Responsive delivery is wired:**
  rendered images run through the shared `@/lib/cloudinary` helpers (`cldCover` for gallery tiles,
  `cld` width-cap for the lightbox, `cldLogo` for partner logos, `cldAvatar` in `Avatar`) which
  inject `f_auto,q_auto` + a right-sized width into Cloudinary URLs (no-op for pasted/non-Cloudinary
  URLs) — so a 4 MB phone photo never ships full-res into a thumbnail slot.
- **Lightbox:** dependency-free (`<dialog>`-free) overlay with Escape-to-close and scroll-lock,
  honoring the ≤130 KB first-load budget (no DnD or modal library added).
- **Consent/licensing:** `Credit` captured; alt encouraged. Consent-for-people-photos and
  pre-publish image moderation are documented future work (§9).

---

## 6. Governance

Built on the existing **claim → steward-verify → manage** flow (spec §8.13):

- A member requests to manage an institution (`OrgClaim`); a steward approves; `IsManager`
  (an approved claim) then gates all edits via `requireManager`.
- **Gallery and section edits are immediate for managers** — consistent with how crest/summary/
  history/offices already behave (claimed managers are vetted, so their edits publish directly).
  Each `MediaAsset` carries a `Moderation` field (default `approved`) for a future pre-publish pass.
- **Steward oversight:** admin `InstitutionDetail` shows a read-only "Official page" card (gallery
  count + section list with type/visibility). The governance lever today is **verify/revoke**
  (revoking verification takes the official page offline). Public reporting + a dedicated
  section/media moderation queue are documented future work.
- **Authorization is enforced server-side** (`requireAuth` + `requireManager`), never by client
  gating alone.

---

## 7. Localization (cross-cutting)

- **i18n** at field/block level — name/alt-name, motto, descriptions, anthem, tour language →
  EN base + Fante/Twi/Ga/Ewe.
- **Mobile Money** (MTN/Telecel/AirtelTigo) as a first-class payment/giving/donation field.
- **GhanaPostGPS** digital address alongside lat/long; **quarter/Asafo** tag on every profile.
- **Dual-tier pricing** (citizen vs foreigner) for heritage; **NHIS accepted** as the flagship
  health field.
- **Verification artifact differs by kind:** mission/circuit letter (religious), HEFRA/MDC licence
  (health), RGD + Social Welfare cert (NGO), GES/GTEC (education).

---

## 8. What shipped vs deferred

**Shipped (full stack, builds green; verified in-browser at mobile width):**
- `MediaAsset` / `SectionItem` / `ProfileSection` domain types; `Organization.Gallery` + `.Sections`.
- Dedicated `SetGallery`/`SetSections` repo + service (manager-gated, validated, id-minting, URL-scheme
  sanitised) + HTTP endpoints + routes + rate limiting; 256 KB body cap.
- Public `SectionRenderer` (**18 block types**: richtext · gallery · stats · team · timeline · faq ·
  docs · quote · cta · logos · groups · hero · testimonials · contact · **menu** · **schedule** · **map** ·
  divider) + `Gallery` (a11y lightbox) wired into `School.tsx`; all rendered on web + native mobile.
- **Sub-entities** (`SubEntity` + the `groups` block): houses / departments / alumni year-groups /
  the seven Asafo companies / chief lineage as cards (crest, colour dots, subtitle, summary, facts) —
  the recursive idea realized inside the section engine (no new endpoints). Verified in-browser.
- Manager editor: `SectionBuilderForm` (add/reorder/hide/delete, per-type item editors incl. the nested
  `GroupsEditor`/`AttrsEditor`, tone/visible) + `GalleryForm`; Cloudinary uploads via `<ImageUpload>`.
  Ported into the admin `institution-editor.tsx` too (stewards edit any org).
- **Responsive delivery** via `@/lib/cloudinary` (`cldCover`/`cld`/`cldLogo`/`cldAvatar`); platform-wide
  mobile-width audit (admin + frontend + marketing) — fixed `min-w-0` grid traps, `EventCard`
  truncation, and base-less grids; all routes clean at 360px.
- Admin: type mirror + read-only "Official page" oversight card.
- **Mobile (native, Expo):** full `app/institutions/[slug].tsx` rendering core + gallery + all 18
  section types (RN primitives + `theme`/`ui`); `institution()` API + type mirror; search wired to the
  route. The mobile `Markdown` component renders GFM pipe tables (validated separator; optional outer
  pipes). Verified end-to-end on Expo web with real data.
- Seed: Mfantsipim enriched with a gallery + the full block set incl. houses, hero, testimonials,
  contact, fees (menu), bell schedule, and find-us (map) — reseed to see it.

**Deferred (intentional — design supports adding later, no re-architecting):**
- *Deep* sub-entity recursion: each `SubEntity` getting its **own route + gallery + nested sections**
  (today they render as rich cards in the `groups` block, which covers the 90% case).
- A **`columns`** layout block — deliberately skipped: side-by-side layout doesn't fit the flat,
  reorderable block model without nesting; low value vs. complexity.
- A **pre-publish moderation queue** for section/media edits. Skipped *by design*: managers are
  steward-vetted via the claim→approve flow (a trusted tier, like crest/summary edits today), so
  immediate publish is consistent with the trust model. `MediaAsset.Moderation` exists if ever wanted.
- gRPC/GraphQL exposure of gallery/sections; mobile manager-*editing* of sections (read ships).

---

## 9. Primary research sources

schema.org (`Organization`, `EducationalOrganization`, `GovernmentOrganization`, `Church`,
`Hospital`, `Museum`, `SportsTeam`, `NewsMediaOrganization`, `LocalBusiness`/`Restaurant`/
`LodgingBusiness`); Google Business Profile & LinkedIn Page fields; Wikipedia infoboxes (school,
university, organization, officeholder, royalty); Ghanaian sources — CCMA, UCC, CTVET/GTEC, GES
SHS register, MOBA, Cape Coast Castle/GMMB, UNESCO Forts & Castles, Manhyia Palace, Asafo/Posuban
scholarship, CCTH, Ghana NGO registration (RGD + Social Welfare); headless-CMS modular-content
patterns (Sanity, Strapi dynamic zones, Contentful, Gutenberg) for the block model; image
optimization & moderation best practices for the media model.
