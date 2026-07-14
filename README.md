# Oguaa — the home of Cape Coast

A community-pride platform for **Cape Coast (Oguaa)**, Central Region, Ghana.
Its music, people, heritage, schools and memories — made by us, for us.

> Product spec: [`oguaa/Oguaa-Platform-Specification.md`](oguaa/Oguaa-Platform-Specification.md) ·
> Build plan + Cape Coast research + design system: [`agent_plan.md`](agent_plan.md)

## Stack

| Layer | Tech |
|---|---|
| **Backend** | Go 1.25 · `net/http` (stdlib routing) · `log/slog` · MongoDB driver v2 |
| **Database** | MongoDB (one polymorphic `listings` collection — the "one engine, many types" model) |
| **Public web** | React 19 · Vite 8 · React Router 7 · TypeScript · Tailwind v4 |
| **Admin platform** | React 19 · Vite 8 (separate back-office SPA) |
| **Mobile** | Expo SDK 56 · React Native · expo-router (iOS · Android · web) |
| **AI** | Anthropic Claude, called server-side from Go (key never reaches the browser) |

```
oguaaman/
├── backend/     Go API (cmd/{server,seed}; internal/{domain,service,infra/{http,mongo},platform,config})
├── frontend/    Public site — Vite + React SPA (src/{pages,components,lib})
├── admin/       Admin back-office — Vite + React SPA (moderation, members, institutions, audit, AI compose)
├── mobile/      Native apps — Expo + React Native (src/app: tabs + artist/memorial screens)
├── oguaa/       the spec + the original HTML mockups
└── agent_plan.md
```

## Prerequisites

- Go ≥ 1.22, Node ≥ 20 + pnpm, and a running **MongoDB** (`mongodb://localhost:27017`).

## Run it

```bash
# 1. Backend — seed MongoDB, then start the API on :8080
cd backend
cp .env.example .env            # optional; defaults work for local
go run ./cmd/seed               # loads the fact-checked Cape Coast seed data
go run ./cmd/server             # API on http://localhost:8080

# 2. Public web — dev server on :5173 (proxies /api → :8080)
cd ../frontend && pnpm install && pnpm dev

# 3. Admin platform — back-office on :5174 (proxies /api → :8080)
cd ../admin && pnpm install && pnpm dev

# 4. Mobile (iOS / Android / web) — Expo
cd ../mobile && pnpm install && pnpm start
# On a physical device, set EXPO_PUBLIC_API_URL to your machine's LAN IP.
```

Tests & builds:

```bash
cd backend  && go test ./...    # engine/service unit tests
cd frontend && pnpm build       # tsc typecheck + production build
cd admin    && pnpm build       # tsc typecheck + production build
cd mobile   && pnpm exec tsc --noEmit   # typecheck (expo export -p web to bundle)
```

## The AI writing assistant (admin)

The `/admin/compose` writing bar calls Claude **server-side** via `POST /api/ai`.
Without `ANTHROPIC_API_KEY` it runs in a clearly-labelled simulation so the UI is
fully demoable; set the key (and optionally `OGUAA_AI_MODEL`) in `backend/.env`
to switch to live output. Calls are metered against a daily budget.

## API (selected)

`GET /api/home · /api/stats · /api/artists[/:slug] · /api/genres · /api/people[/:slug] ·
/api/memorials[/:slug] · /api/businesses[/:slug] · /api/events · /api/events/:slug ·
/api/festivals[/:slug] · /api/history · /api/opportunities · /api/memories ·
/api/incidents[/:slug] · /api/lost-found[/:slug] · /api/schools · /api/institutions[/:slug] ·
/api/places · /api/members[/:slug] · /api/search?q= · /api/diaspora`
· writes: `POST /api/listings`, `POST /api/listings/:id/report`, `POST /api/listings/:id/promote`,
`POST /api/admin/moderate`, `POST /api/memorials/:slug/{candle,tributes}`,
`POST /api/incidents`, `POST /api/lost-found`, `POST /api/events/:slug/tickets`,
`POST /api/businesses/:slug/subscribe`, `POST /api/me/diaspora`, `POST /api/ai` ·
admin: `GET /api/admin/reports`, `POST /api/admin/reports/:id/resolve`,
`POST /api/admin/incidents/:id/status`, `POST /api/admin/tickets/:code/checkin`,
`GET /api/admin/revenue` (pledge fees + tickets + subscriptions + promotions).

## Status

Phase 1 is built and verified end-to-end (Go + MongoDB + React), plus password
sign-in → JWT auth, a Newsroom CMS, member follows/connections, and the yearly-remembrance
scheduler. Recently added across all clients: **cross-listing search** (`/api/search`),
a **notice-and-takedown report path** (steward-triaged, §14.3/§14.7), an **18+ age gate**
at sign-up (§14.4), the **diaspora register** opt-in (Phase-2 foundation), portal **legal
pages**, a working **Compose → Newsroom** flow, **persistent mobile login** (expo-secure-store),
and **notification deep-linking**.

**Vision build-out (web + admin):** community-safety **incident reporting** with a
reported→verified→responding→resolved→recovered triage workflow (`/safety`); **Lost &
Found** for items *and missing people* (`/lost-found`); the **festival archive** with
yearly editions of Fetu Afahye, Bakatue, PANAFEST, Emancipation Day and more
(`/festivals`); a data-driven **history hub** (`/heritage` via `GET /api/history`);
**event ticketing** with Paystack checkout and gate check-in codes (`/events/:slug`);
**business Supporter subscriptions** (GH₵50/month, badge + directory priority);
self-serve **paid promotion** (GH₵10/day featured placement); and a **5% platform fee
on crowdfunding** — all four income streams unified on the admin **Revenue** dashboard
(`GET /api/admin/revenue`). **The Expo mobile app mirrors every one of these features**
(safety, lost & found, festivals, data-driven heritage, event detail + ticketing,
supporter subscriptions, promotion, my tickets) with full typecheck + lint coverage.
Quality: SonarQube gate green (0 bugs, 0 critical issues), `pnpm lint` clean across all
three web apps, `go test ./...` green, mobile `tsc --noEmit` + `expo lint` clean.

Deferred, with interfaces ready: password-reset/account email delivery,
a live Claude key, push notifications, a PWA shell, and mobile (Expo) mirrors of the new
sections. See `agent_plan.md`.
