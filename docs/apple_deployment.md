# App Store & Play Store deployment

Everything needed to get the Oguaaman mobile app through review, what is already
done, and what only you can do. Kept here so it does not live in a chat log.

**App identity**

| | |
|---|---|
| Display name | Oguaaman |
| iOS bundle id | `gh.oguaa.app` |
| Android package | `gh.oguaa.app` |
| Expo slug | `oguaa` — internal EAS identifier, **do not rename**, it links the project |
| Version | 1.0.0 |

---

## 1. Status against the guidelines that block submission

### Guideline 1.2 — user-generated content ✅ complete

An app hosting UGC needs four things. All four are in place:

| Requirement | Where |
|---|---|
| Filter objectionable content | Moderation queue — `POST /api/admin/moderate`, curator dashboard |
| Report mechanism | `POST /api/listings/{id}/report`, reachable from listing screens in the app |
| **Block abusive users** | `POST/DELETE /api/members/{slug}/block`, control on every member profile |
| Published contact | Contact page on oguaaman.com, linked in-app |

Blocking is **symmetric**: a block hides each member from the other. Hiding only
the blocker's view would leave the person who asked for protection fully visible
to the member they blocked. It also drops any follow in either direction.
The unblock list is in **Settings → Blocked accounts**, which is where a reviewer
will look for it.

> Possible gap worth closing: reporting is per-*listing*. There is no "report
> this member" action. Listing-level reporting satisfies the guideline, but
> member-level reporting is what reviewers often expect alongside blocking.

### Guideline 5.1.1(v) — account deletion ✅ complete

In-app deletion at `DELETE /api/me`, exposed in **Settings → Your data → Delete
my account** (two-step, password-confirmed, native destructive alert).

It is a **soft delete by anonymisation**, not a hard delete: personal data is
wiped and the account suspended, while approved community content (memorials
especially) stays live under a "Former member" owner. Erasure also clears push
subscriptions, blocks and Apple redemption records.

### Guideline 3.1.1 — in-app purchase ⚠️ server done, app not wired

Digital plans sold inside the iOS app **must** go through IAP. The server half
is complete and tested; the app still needs the purchase flow, and Stripe is
still in the bundle.

- ✅ StoreKit 2 receipt verification, replay protection, entitlement granting
- ❌ `expo-iap` purchase flow in the app
- ❌ Stripe removal (still a dependency and an `app.json` plugin)

**What stays on Paystack, legitimately.** 3.1.1 carves out physical goods and
services consumed outside the app, and 3.1.3(e) allows approved nonprofits to
collect donations without IAP. So: event tickets, agent errands and physical
storefront goods stay on Paystack. The line to hold is *digital unlocks inside
the app go through IAP; anything that happens in the physical world does not.*

### Encryption & privacy ✅ complete

`usesNonExemptEncryption: false`, privacy manifests declaring 4 accessed API
types and 5 collected data types.

---

## 2. What only you can do

### 2.1 Create the four IAP products in App Store Connect

The product ids are the contract between App Store Connect and the server. They
live in `backend/internal/domain/iap.go` and **must match exactly**:

| Plan slug | App Store product id | Type |
|---|---|---|
| `creator-supporter` | `gh.oguaa.app.creator.supporter.monthly` | Auto-renewable subscription |
| `creator-pro` | `gh.oguaa.app.creator.pro.monthly` | Auto-renewable subscription |
| `supporter` | `gh.oguaa.app.business.supporter.monthly` | Auto-renewable subscription |
| `featured` | `gh.oguaa.app.business.featured.monthly` | Auto-renewable subscription |

Put all four in one **subscription group** so members can upgrade and downgrade
between them rather than holding two at once. If you change an id here, change
it in `iap.go` too — a receipt naming an unknown product grants nothing, by
design.

### 2.2 Set the server environment

On Render (both are already in `render.yaml`):

```
APPLE_BUNDLE_ID=gh.oguaa.app
APPLE_ALLOW_SANDBOX=false
```

IAP stays **disabled** until `APPLE_BUNDLE_ID` is set — a verifier that accepts
any bundle is worse than no verifier.

`APPLE_ALLOW_SANDBOX` must stay **false** in production. Sandbox receipts carry
the same Apple signature as real ones, so accepting them on a live server would
let anyone with a sandbox tester account mint free subscriptions. Set it to
`true` only on a staging deploy you use for TestFlight testing.

### 2.3 Build a development build

`expo-iap` needs native code. **It will not run in Expo Go.** Per
`mobile/AGENTS.md`, check the versioned docs before changing mobile code —
Expo SDK 56 ships no first-party IAP package; Expo points to `expo-iap`
(OpenIAP / StoreKit 2) or RevenueCat.

```bash
cd mobile
npx expo install expo-iap
eas build --profile development --platform ios
```

### 2.4 Store listing paperwork

- **App Privacy nutrition labels** (App Store Connect) — must agree with the
  privacy manifest already in `app.json`
- **Data safety form** (Play Console) — same information, different form
- **Age rating** — the app carries UGC and a 18+ footer note; rate honestly
- **Demo account for review** — reviewers need working credentials. Seeded demo
  accounts use `@oguaa.test` emails with the shared password; make a real one
  instead, and note it in App Review Information
- **Support URL & privacy policy URL** — https://oguaaman.com/contact and
  https://oguaaman.com/privacy

---

## 3. How receipt verification works

Worth understanding before changing it, because the failure modes are silent.

Verification is **local**, not via the App Store Server API, so there is no
issuer id, key id or signing key to provision, rotate and leak.

A StoreKit 2 receipt is a JWS whose header carries an `x5c` certificate chain.
The server:

1. pins `alg` to **ES256** — accepting the token's own choice is exactly how
   `alg:"none"` forgeries work;
2. verifies the chain terminates at **Apple Root CA G3**, from the copy embedded
   at `backend/internal/service/applecerts/AppleRootCA-G3.pem` — **never** the
   root the token itself supplies, which would be circular;
3. verifies the signature (JWS-raw `R||S`, not ASN.1) with the leaf key;
4. only then reads the payload, and checks the bundle id, environment and
   revocation.

Then three independent things must hold before anything is granted:

1. the receipt is genuinely Apple's, for **this** bundle id;
2. the product is one we actually sell (a closed map — an unknown product grants
   nothing, even with a valid signature);
3. **this transaction has not been redeemed before.**

(3) is the one with teeth. A signed receipt stays valid forever, so without it a
single real purchase, replayed, extends a subscription indefinitely. The
transaction id is the document `_id` and the claim is an `InsertOne`, so a
duplicate key *is* the answer — a read-then-write would let two concurrent
restores both pass. The claim is taken **before** the grant: claimed-but-ungranted
is a support ticket; granted-but-unclaimed is a replayable entitlement.

### Endpoints

| | |
|---|---|
| `GET /api/iap/apple/products` | plan ↔ product id map, so the app never hard-codes ids |
| `POST /api/iap/apple/redeem` | `{purchaseToken, reference?}` → verifies and grants |

`redeem` answers **200 with `alreadyRedeemed: true`** rather than an error when a
transaction has been seen before. Restore-purchases replays every past
transaction, and "already applied" is the correct outcome for the user, not a
failure.

### Tests

`backend/internal/service/appstore_test.go` builds a complete, correctly-signed
JWS **from an attacker's own certificate authority** — the exact shape a forgery
takes — and asserts it is refused. Also covered: `alg:none`, tampered payloads,
another app's bundle id, revoked receipts, malformed input, replay, and 16
concurrent claims granting exactly once (under `-race`).

Run them:

```bash
cd backend && go test ./internal/service/ -run "Apple|IAP|Claim|Redeem" -race
```

---

## 4. Remaining work in the app

1. **Wire `expo-iap`.** `mobile/src/lib/payments.ts` already funnels every flow
   through one `presentCheckout`, so the IAP rail slots in there: on iOS, for
   `subscription` and `promotion` flows, run the StoreKit purchase and POST the
   resulting `purchaseToken` to `/api/iap/apple/redeem`. Everything else keeps
   using Paystack.
2. **Remove Stripe** — `@stripe/stripe-react-native` from `package.json`, the
   plugin entry in `app.json`, `stripe-provider.tsx`, and the Stripe branch in
   `payments.ts`. Roughly 12 files reference it.
3. **Restore purchases.** Apple requires a way to restore non-consumable and
   subscription purchases. Add it to Settings next to Blocked accounts.

---

## 5. Play Store

Google Play Billing has the same "digital goods must use our billing" rule
(Payments policy). The same split applies: plans through Play Billing, tickets
and physical goods through Paystack. `expo-iap` covers both stores behind one
API, so wiring the iOS flow gets Android largely for free — but the products
must be created separately in the Play Console, and the server currently
verifies **Apple receipts only**. Google verification is a separate piece of
work and is not written yet.
