# Oguaaman — launch QA manual

How to verify the estate before launch, with the real data to test against.
Every command and fixture here has been run against production.

**Automated first.** `./scripts/smoke.sh` covers 26 of these checks in about a
minute and exits non-zero on failure, so it can gate a deploy. Run it before
working through the manual sections — it will catch the silent breakages
(redirects, canonicals, favicons, empty collections, auth gates) and leave you
only the things a human has to look at.

```bash
./scripts/smoke.sh                                        # production
SITE=http://localhost:5174 CITIZEN=http://localhost:5173 \
  API=http://localhost:8080 ./scripts/smoke.sh            # local
```

Last full run: **26 passed, 0 failed, 1 warning** (the warning is Apple IAP,
which is disabled until `APPLE_BUNDLE_ID` is set — expected pre-submission).

---

## 0 · The estate

| Surface | URL | Notes |
|---|---|---|
| Marketing | https://oguaaman.com | Prerendered, 15 static routes |
| Citizen app | https://citizen.oguaaman.com | SPA, no prerendering |
| Creator | https://creator.oguaaman.com | SPA |
| API | https://api.oguaaman.com | Go |
| Marketing sitemap | https://oguaaman.com/sitemap.xml | 15 URLs |
| Citizen sitemap | https://citizen.oguaaman.com/sitemap.xml | 25 URLs — **static only, no shops** |
| Marketing robots | https://oguaaman.com/robots.txt | |
| Citizen robots | https://citizen.oguaaman.com/robots.txt | Disallows /admin /me /signin /submit |

**Databases** — separate clusters, do not mix them up:

| | Cluster | DB |
|---|---|---|
| Production | `cluster0.pioeoms` | `oguaa` |
| Dev | `cluster0.pyjk1ub` | `oguaaman` |

> `cmd/seed` **drops 28 collections including members**. Never point it at
> production. `cmd/seedlive` is the non-destructive one (content upserts by
> `_id`, members insert-if-absent) and is safe to re-run.

---

## 1 · Test data (live, verified)

Real slugs seeded in production — use these rather than inventing fixtures.

| Kind | Fixtures | Count |
|---|---|---|
| Businesses | `castle-view-guesthouse`, `bakaano-kenkey-junction`, `kotokuraba-fresh-fish` | 7 |
| Festivals | `akwambo`, `edina-bakatue`, `edina-bronya` | 6 |
| People | `kofi-annan`, `ck-mann`, `ebo-taylor` | 24 |
| Events | `fetu-afahye-2024`, `edina-bakatue-2025`, `panafest` | 14 |
| Artists | `esi-sunshine`, `kojo-castle`, `nana-tone` | 6 |
| Schools | 60 | |
| Members | 18 (2 real + 16 seeded) | |

Detail endpoints, verified 200 against production:

```
GET /api/businesses/castle-view-guesthouse
GET /api/festivals/akwambo
GET /api/people/kofi-annan
GET /api/events/panafest
GET /api/artists/kojo-castle          # note: /api/artists/*, not /api/music/*
```

**Accounts**

| Account | Role | Password |
|---|---|---|
| `hayfordstanley@gmail.com` (`hayford-stanley`) | steward | *yours* |
| `dev.stanley.hayford@gmail.com` | member | *yours* |
| Seeded demo members (`*@oguaa.test`) | member/steward | `Oguaa-2026!` |

> **Before launch:** the seeded demo accounts share one publicly-documented
> password. Remove them or rotate it. Also create a **dedicated reviewer
> account** for App Review — do not give Apple an `@oguaa.test` login.

---

## 2 · Web — citizen app

Test at **390px wide** as well as desktop; most of the defects found in this
project were mobile-only.

| # | Check | Expected |
|---|---|---|
| 2.1 | Load each nav destination from the drawer and footer | No 404, no "We hit a snag" |
| 2.2 | **Navigate between pages by clicking links** (not reloading) | Exactly one hero and one body. Two = the `AnimatePresence` double-render has regressed |
| 2.3 | `/music`, `/festivals`, `/people`, `/events`, `/education` | Real content, not empty states |
| 2.4 | Filter to a category with no results | One empty state, never two stacked |
| 2.5 | `/admin` signed out, and as a plain member | "Sign in to reach the back office" / "Curators and stewards only" — **never** the generic error page |
| 2.6 | Curator dashboard link in the footer | Visible **only** to curator/steward |
| 2.7 | Any page at 390px | No horizontal scroll |
| 2.8 | Dark and light theme on every page | Text legible, no invisible-on-invisible |

**Known cosmetic issue:** `/festivals` on the marketing site reports a 35px
horizontal overflow at 390px, from a decorative watermark. Visually clipped by
its parent; logged, not blocking.

## 3 · Web — marketing & SEO

| # | Check | How |
|---|---|---|
| 3.1 | All 15 sitemap URLs 200 with unique titles | `smoke.sh` §4 |
| 3.2 | `www` → apex, canonical matches | `smoke.sh` §2 |
| 3.3 | JSON-LD parses on every page | `smoke.sh` §5 |
| 3.4 | Rich results | [Rich Results Test](https://search.google.com/test/rich-results) on `/` and `/names` |
| 3.5 | Share preview | [Facebook Debugger](https://developers.facebook.com/tools/debug/) — after a deploy, hit **Scrape Again**; the cache is sticky |
| 3.6 | Favicon in search | Only re-crawled on Google's schedule — days, not minutes |
| 3.7 | Submit both sitemaps in Search Console | Marketing and citizen are separate properties |

## 4 · API

| # | Check | Expected |
|---|---|---|
| 4.1 | `GET /api/stats` | Non-zero listings, members, schools |
| 4.2 | Every list endpoint | Non-empty (`smoke.sh` §6) |
| 4.3 | Unauthenticated write endpoints | 401/403, never 200 |
| 4.4 | `GET /api/admin/queue` as a member | 403 |
| 4.5 | CORS from an unknown origin | Refused |

## 5 · Store compliance

### 5.1 Guideline 1.2 — UGC

| # | Check | Expected |
|---|---|---|
| 5.1.1 | Block a member from their profile (web + mobile) | Confirmation first; profile withheld afterwards |
| 5.1.2 | As the blocked member, view the blocker | Also withheld — **blocking is symmetric** |
| 5.1.3 | A blocked member's reviews | Absent from listings you view |
| 5.1.4 | Business star rating after blocking a reviewer | **Unchanged** — the rating belongs to the business, not the viewer |
| 5.1.5 | Settings → Blocked accounts | Lists them; unblock restores both sides |
| 5.1.6 | Follow between two members, then block | Follow removed in both directions |
| 5.1.7 | Report a listing | Reaches the moderation queue |
| 5.1.8 | Contact route | Reachable in-app and on the web |

### 5.2 Guideline 5.1.1(v) — account deletion

| # | Check | Expected |
|---|---|---|
| 5.2.1 | Settings → Delete my account | Two-step, password required, destructive styling |
| 5.2.2 | Wrong password | Refused |
| 5.2.3 | After deletion | Cannot sign in; personal data wiped |
| 5.2.4 | Their approved listings | Still live under "Former member" — **soft delete** |
| 5.2.5 | Their drafts | Unpublished |
| 5.2.6 | Push subscriptions, blocks, IAP records | All cleared |
| 5.2.7 | Export my data | Returns a JSON file via the share sheet |

### 5.3 Guideline 3.1.1 — in-app purchase

| # | Check | Expected |
|---|---|---|
| 5.3.1 | `GET /api/iap/apple/products` | `enabled: true` once `APPLE_BUNDLE_ID` is set |
| 5.3.2 | POST a junk receipt | 400 — never a granted plan (`smoke.sh` §8) |
| 5.3.3 | Sandbox purchase against production | **Refused** unless `APPLE_ALLOW_SANDBOX=true` |
| 5.3.4 | Redeem the same receipt twice | Second returns `alreadyRedeemed: true`, grants nothing extra |
| 5.3.5 | Restore purchases | Re-establishes entitlement without double-granting |
| 5.3.6 | Tickets and physical goods | Still Paystack — correct, and allowed |

Backend suite: `cd backend && go test ./internal/service/ -run "Apple|IAP|Claim|Redeem" -race`

---

## 6 · Mobile

Needs a **development build** — `expo-iap` will not run in Expo Go.

| # | Check | Expected |
|---|---|---|
| 6.1 | Cold start, sign in, sign out | |
| 6.2 | Home-screen name | "Oguaaman" |
| 6.3 | Block, then Settings → Blocked accounts | Present, unblock works |
| 6.4 | Delete account | Works, soft-deletes |
| 6.5 | Permissions | Only the photo picker prompts; no unexplained prompts |
| 6.6 | Offline | Degrades with a message, no white screen |
| 6.7 | Deep links | Open the right screen |

---

## 7 · Launch blockers

Ordered by what actually stops you.

1. **Shops and products are invisible to Google.** See §8 — the biggest gap.
2. **Apple IAP not wired in the app.** Server is done and tested; the purchase
   flow and Stripe removal are not. Blocks iOS submission.
3. **`APPLE_BUNDLE_ID` not set** on the server, so IAP is disabled.
4. **Demo accounts share a documented password** and use `@oguaa.test` emails.
5. **No Google Play receipt verification.** Apple only, so far.
6. **Reporting is per-listing, not per-member** — reviewers often expect both.

---

## 8 · Making shop products indexable

This is what Search Console was suggesting, and it is currently impossible —
not partially working. Three separate things are missing, and they must be
fixed in this order, because each is useless without the one before it.

**8.1 Google cannot discover shops at all.** The citizen sitemap contains
**25 static URLs and zero business, storefront or product URLs**. Business
pages are database-driven, so a build-time sitemap cannot know them. Until
those URLs are in a sitemap or linked from a crawlable page, nothing else here
matters.
→ *Serve a dynamic sitemap from the Go API listing every approved business and
storefront, and reference it from `citizen.oguaaman.com/robots.txt`.*

**8.2 Products have no URL.** They are embedded inside the business document
(`Products []StoreItem`) and are not addressable. A thing with no URL cannot be
a search result.
→ *Add a per-product route (`/business/:slug/p/:productId`) and include those
URLs in the dynamic sitemap.*

**8.3 There is no Product structured data.** Merchant listings need
`Product` + `Offer` (name, image, description, price, currency, availability).
Business pages likewise need `LocalBusiness` with address and opening hours.
→ *Emit both as JSON-LD on those pages.*

**Also worth knowing:** the crawler shim at `/api/og/page/*` assumes nginx maps
bot user-agents onto it. The citizen app runs on Vercel with no such mapping,
so **it is dead code in production** — which is just as well: serving different
HTML to bots by user-agent is cloaking, and Google disallows it. Client-rendered
JSON-LD is fine (Google renders JavaScript); a bot-only shim is not.

**Caveat on timing:** Google renders JavaScript, but SPA pages are queued for a
second rendering pass and index more slowly than server-rendered ones. If shop
visibility is a selling point you intend to advertise, server-rendering those
pages is worth the work.

**No product data exists yet.** All 7 seeded businesses have `products: 0`, so
even once this is built there is nothing to index until real shops list stock.

---

## 9 · Before you announce

- [ ] `./scripts/smoke.sh` green
- [ ] `cd backend && go test ./...` green
- [ ] Every app builds
- [ ] Both sitemaps submitted in Search Console
- [ ] Share previews re-scraped (Facebook, LinkedIn)
- [ ] Demo accounts removed or rotated
- [ ] Reviewer account created and noted in App Review Information
- [ ] `APPLE_BUNDLE_ID` set; `APPLE_ALLOW_SANDBOX=false`
- [ ] Production backup taken (`prod-backup-before-seed.json` is the current one)
- [ ] Uptime monitoring on `api.oguaaman.com/api/stats`
