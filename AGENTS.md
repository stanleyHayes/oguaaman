# AGENTS.md — working notes for coding agents

## What this is
Oguaa — a community-pride platform for Cape Coast (Oguaa), Ghana. Monorepo:
- `backend/` — Go 1.25 API (stdlib `net/http` ServeMux, slog, MongoDB driver v2). Entry: `cmd/server`, seed: `cmd/seed`.
- `frontend/` — public portal, React 19 + Vite + React Router 7 (lazy routes in `src/router.tsx`), Tailwind v4.
- `admin/` — steward/curator back-office SPA (same stack, own router/layout).
- `mobile/` — Expo app (mirrors ALL portal features: safety/incidents, lost & found, festivals, history, event ticketing, subscriptions, promotion — file-based routes in `src/app/`, theme tokens in `src/theme.ts`, API client `src/lib/api.ts`, `useApi` hook, shared UI in `src/ui.tsx`). Verify with `pnpm exec tsc --noEmit` + `pnpm lint`. **Expo APIs change between SDKs — check docs.expo.dev/versions/v56.0.0/ before using any Expo API.**
- `marketing/` — static brochure site (hardcoded by design; the portal is the data-driven product).
- `oguaa/` — product spec + original HTML mockups (design language source of truth).

## Core architecture: "one engine, many hats"
- ONE polymorphic `listings` MongoDB collection (`internal/domain/listing.go`). New features = new `Listing.Type` + fields in `Details map[string]any` — never a new system. Current types: business, artist, person, memory, event, opportunity, memorial, project, **incident, lostfound**.
- Lifecycle: draft → pending → approved/rejected → unpublished, steward/curator moderated. **Exceptions:** `incident` and `lostfound` auto-publish on submit (time-critical: rescue/missing persons) with an operational status in Details (`incidentStatus` reported→verified→responding→resolved→recovered; `lfStatus` open→reunited/closed) and after-the-fact curator verification.
- Festivals = `event` listings with `details.festival` + `details.edition` (+ `programme`/`recap`); the archive is assembled in `service/festivals.go` from a fixed registry of known festivals.
- History hub (`GET /api/history`) assembles the seeded `timeline` collection + heritage orgs + people + memories (`service/history.go`).

## Conventions to follow
- **Focused repo methods** on `ListingRepository` (e.g. `AddTribute`, `IncrementRaised`, `UpdateIncidentStatus`, `SetLostFoundStatus`, `SetSubscribedUntil`, `SetFeatured`) — no generic details-update. Every new repo method also goes on the fakes in `internal/service/*_test.go`.
- **Money flows** (pledges, tickets, subscriptions, promotions) each have: a domain record + mongo repo + standalone service holding `PaystackClient` (real or `SimulatedPaystack` when no `PAYSTACK_SECRET_KEY`) → pending record → Paystack Initialize → callback URL → idempotent Confirm with server-side Verify. Amounts are integer **pesewas**. Mirror `payments_service.go`/`tickets.go`.
- Platform revenue: `PLATFORM_FEE_PERCENT` (default 5) is taken from pledges (net credited to projects); tickets/subscriptions/promotions are gross. `GET /api/admin/revenue` aggregates all streams (`service/revenue.go`).
- Auth: password sign-in (`POST /api/auth/{register,login}`) → JWT. Roles: member, curator (moderation/triage/check-in), steward (full admin), editor (newsroom). Guard with `requireRole`.
- Handlers live in `internal/infra/http/*_handlers.go`, wired in `router.go` (Go 1.22 `METHOD /path/{param}` patterns). Role-guarded admin routes under `/api/admin/`.
- Frontend pages export `Component` (+ `loader`), registered lazy in `src/router.tsx`; API via `src/lib/api.ts`, types in `src/lib/types.ts`. Sections registered in `src/lib/sections.ts` flow into Home cards/nav/footer automatically.
- Design: "Castle, Canopy, Canoe" palette (cream `#F6F1E7`, forest `#123F2D`, gold `#B07D32`, clay `#B0503C`, teal `#0E7C6B`, maroon `#7C2D2D`); purple reserved for AI features. Low-bandwidth Ghana: lazy images, gradient fallbacks.

## Build / test / run
- `cd backend && go build ./... && go test ./...` — must pass after any backend change (also `gofmt`/`go vet` clean).
- `cd frontend && pnpm build` and `cd admin && pnpm build` — tsc + vite, must pass.
- Full stack: `docker compose up --build` (mongo + seed + api:8080/50051 + web:3000 admin:3001 mobileweb:3002 marketing:3003) or `make dev` (needs local mongod).
- Seed is idempotent drop+insert (`backend/internal/infra/mongo/seed.go` + `seed_listings.go`); add new collections to its drop list. Seed imagery (photos/crests) lives in `internal/infra/http/seedimg/` (go:embed, credits in ATTRIBUTION.md), served at `/uploads/seed/*`; frontends proxy `/uploads/` to the api via nginx.
- **SonarQube** (quality gate "Oguaa way": 0 new issues, <3% new duplication, 100% security hotspots reviewed — the 80% new-coverage condition from the built-in "Sonar way" gate was dropped because mobile has no test infra; coverage is tracked as a metric instead. New-code period = reference branch `main`, so the gate evaluates deltas against `main` only; the pre-existing twin-file duplication across apps — profile-sections, institution editors, shared types — is accepted tech debt). Config in `sonar-project.properties` at repo root. To rescan: run SonarQube (`docker run -d --name oguaa-sonarqube -p 9000:9000 sonarqube:community`), then `docker run --rm --network host -v "$PWD:/usr/src" sonarsource/sonar-scanner-cli -Dsonar.host.url=http://localhost:9000 -Dsonar.token=<token>`. Go coverage: `cd backend && go test ./... -coverprofile=coverage.out` first. Rules enforced: 0 bugs, 0 critical (S1192 duplicated literals → extract constants; S3776 cognitive complexity ≤15 → extract helpers; S1082 click handlers need keyboard support → use real `<button>`s; S6759 → mark component props `Readonly<>`).
- **ESLint** is enforced on all three web apps (`pnpm lint`) — keep it at 0 errors; the house react-hooks rules ban sync setState in effects, ref access outside handlers, and mutation during render.
- Dev sign-in: `nana-essien@oguaa.test` (steward), `ama-mensah@oguaa.test` (member); all nine seeded accounts share the password `Oguaa-2026!` (see `KEYS.md`).
