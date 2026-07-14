# Oguaa — keys & secrets you need to provide

This is the single checklist of every credential and config value Oguaa uses, where
each one goes, and where to get it. **Local development needs none of these** — sensible
defaults run the whole stack against a local MongoDB. The keys below are for **going live**.

> How config is loaded: the Go API reads environment variables (a `backend/.env` file is
> picked up automatically in dev — copy `backend/.env.example`). The web/admin/marketing
> apps read `VITE_*` build-time vars; the mobile app reads `EXPO_PUBLIC_*`.

---

## 1. What I actually need from you (the short list)

To take Oguaa from "runs locally" to "real users can sign in and use it," provide:

| # | Key | Why it's needed | Where to get it |
|---|-----|-----------------|-----------------|
| 1 | **`MONGODB_URI`** | The production database connection string | [MongoDB Atlas](https://www.mongodb.com/atlas) free tier, or a self-hosted MongoDB |
| 2 | **`JWT_SECRET`** | Signs members' sign-in sessions; must be long & random | Generate one: `openssl rand -base64 48` |
| 3 | **`ANTHROPIC_API_KEY`** *(optional but recommended)* | Switches the AI writing bar from simulation to live Claude | [console.anthropic.com](https://console.anthropic.com) → API keys |
| 4 | **`VITE_CLOUDINARY_CLOUD_NAME`** + **`VITE_CLOUDINARY_UPLOAD_PRESET`** | Enables image **upload** (profile photos, covers, crests) + on-the-fly transforms. Without them, image fields fall back to pasting a URL | [Cloudinary](https://cloudinary.com) → dashboard (cloud name) + Settings → Upload → an **unsigned** upload preset |

Everything else has a working default. Item 4 is what turns the "Your photo" URL box
into a drag-and-drop uploader.

---

## 2. Backend (Go API) — full reference

Copy `backend/.env.example` → `backend/.env` and fill in. Required-for-production keys are marked **★**.

| Variable | Default | Required for prod | What it is / where to get it |
|----------|---------|:---:|------------------------------|
| `MONGODB_URI` | `mongodb://localhost:27017` | ★ | DB connection string (Atlas SRV string or your host). |
| `MONGODB_DB` | `oguaa` | | Database name. |
| `PORT` | `8080` | | HTTP API port. |
| `GRPC_PORT` | `50051` | | gRPC port. |
| `ALLOWED_ORIGIN` | `http://localhost:5173` | ★ | CORS origin = your **portal**'s public URL (e.g. `https://oguaa.gh`). Use the exact origin, or `*` only behind a trusted proxy. |
| `JWT_SECRET` | `oguaa-dev-secret-change-me` | ★ | Secret that signs session tokens. **Must change for prod.** `openssl rand -base64 48`. |
| `AUTH_REQUIRED` | `false` | ★ (`true`) | Set **`true`** in production. Enforces real sign-in: closes the open dev back-office and stops any unauthenticated/mis-attributed writes. |
| `PAYSTACK_SECRET_KEY` | _(unset)_ | ★ for payments | Enables **live** adopt-a-project pledges (mobile money + cards, GHS). Without it the pledge flow runs a clearly-labelled simulation. [dashboard.paystack.com](https://dashboard.paystack.com) → Settings → API Keys. Use the test key first. Also set your webhook URL there to `https://<api>/api/payments/paystack/webhook`. |
| `PUBLIC_PORTAL_URL` | `http://localhost:5173` | ★ for payments | The portal origin Paystack sends payers back to after paying. |
| `UPLOAD_DIR` | `./uploads` | | Where first-party uploaded images are written (served at `/uploads/*`). Use a persistent disk/volume in prod. |
| `PUBLIC_API_URL` | _(derived)_ | recommended | Public origin prefixed onto returned image URLs. Empty = derive from the request (fine for dev); set to your API origin in prod. |
| `ANTHROPIC_API_KEY` | — | optional | Enables live AI writing bar. Without it, the bar runs a labelled simulation. |
| `OGUAA_AI_MODEL` | `claude-haiku-4-5-20251001` | | Claude model id for the writing bar. |
| `OGUAA_AI_DAILY_BUDGET` | `60` | | Global AI calls/day cap (metered durably in Mongo). |
| `OGUAA_AI_PER_MEMBER` | `20` | | Per-admin AI calls/day cap. |

### Production example (`backend/.env`)
```bash
MONGODB_URI=mongodb+srv://USER:PASS@cluster0.xxxx.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=oguaa
ALLOWED_ORIGIN=https://app.oguaa.gh
JWT_SECRET=<paste output of: openssl rand -base64 48>
AUTH_REQUIRED=true
ANTHROPIC_API_KEY=sk-ant-...
```

---

## 3. The web apps (portal, admin, marketing)

These are static Vite builds. The only setting is which API to call.

| Variable | Where | Default | Notes |
|----------|-------|---------|-------|
| `VITE_API_URL` | `frontend/`, `admin/`, `marketing/` | _(empty)_ | Empty in dev (Vite proxies `/api` → `:8080`). In prod set to the API origin, e.g. `https://api.oguaa.gh`. |
| `VITE_PORTAL_URL` | `marketing/` | `http://localhost:3000` | Where the marketing site's "Open the app" CTAs point (the portal URL). |
| `VITE_CLOUDINARY_CLOUD_NAME` | `frontend/`, `admin/` | _(unset)_ | Your Cloudinary cloud name. **Until set, image fields show a "paste a URL" box instead of an uploader.** |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | `frontend/`, `admin/` | _(unset)_ | An **unsigned** upload preset (Cloudinary → Settings → Upload). Both vars together turn on drag-and-drop upload; delivery is auto-transformed (`f_auto,q_auto`, smart crops) by `lib/cloudinary.ts`. |

Set these as build-time env (e.g. `VITE_API_URL=https://api.oguaa.gh pnpm build`) or in a
`.env` file in each app folder. To enable image uploads locally, create `frontend/.env`
(and `admin/.env`) from `.env.example` with your two `VITE_CLOUDINARY_*` values, then
restart the dev server.

---

## 4. Mobile (Expo)

| Variable | Default | Notes |
|----------|---------|-------|
| `EXPO_PUBLIC_API_URL` | `http://localhost:8080` | The API origin. On a physical device this **must** be reachable from the phone — your machine's LAN IP in dev (e.g. `http://192.168.1.10:8080`), or the public API URL in prod. |
| `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` | _(unset)_ | Same Cloudinary cloud name as the web. Enables the in-app photo picker (profile photo, listing covers); without it those fields accept a pasted URL. |
| `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | _(unset)_ | The same **unsigned** upload preset used by the web. |

---

## 5. Seeded demo accounts

`go run ./cmd/seed` (or the `seed` compose service) loads nine demo members. Sign-in is
by email + password — password sign-in replaced the earlier one-time-code flow — and
every seeded account shares the same demo password: **`Oguaa-2026!`**

| Email | Role |
|-------|------|
| `ama-mensah@oguaa.test` | member |
| `kojo-arthur@oguaa.test` | member |
| `efua-sam@oguaa.test` | member |
| `nana-essien@oguaa.test` | steward |
| `samuel-aidoo@oguaa.test` | curator |
| `akua-pratt@oguaa.test` | curator |
| `yaw-ofori@oguaa.test` | member |
| `esi-quayson@oguaa.test` | member |
| `efia-quagraine@oguaa.test` | editor |

Demo data only — never reuse this password for a real account. Pre-existing accounts
without a password (e.g. invited members created before password sign-in) are claimed
through the Join/Register flow: registering with their identifier sets their first
password.

---

## 6. Not needed yet (future features — for awareness)

You don't need these now; they unlock backlog items when we build them:

| When we build… | You'll need | Likely provider |
|----------------|-------------|-----------------|
| Mobile push notifications | push credentials | Expo Push (FCM for Android, APNs for iOS) |
| Password-reset / account emails | email API key | Resend / Postmark |

---

## 7. Security notes

- **Never commit real secrets.** `backend/.env` and `*.local` env files are gitignored; keep keys there or in your host's secret manager.
- **Rotate `JWT_SECRET` carefully** — changing it signs out all existing sessions.
- The `ANTHROPIC_API_KEY` is used **server-side only** and never reaches the browser (by design).
- Turn `AUTH_REQUIRED=true` before any public launch — it is the switch that makes the admin back-office and all writes require a verified member.
