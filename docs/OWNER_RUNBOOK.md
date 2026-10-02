# Owner runbook: switching things on

Everything risky in Oguaa ships **switched off**. This page lists what you (the operator, Dev Track) need to do before each
part is turned on, and where to turn it on. Tick items off as you go.

- Render: dashboard → `oguaa-api` → Environment. Secrets are entered **only** there — never in `render.yaml` or anywhere in
  git (this repository is public).
- Admin console: `admin.oguaaman.com`. Settings pages save with a required reason and keep an audit history.
- Commands run from `backend/` against the production database (set `MONGODB_URI` / `MONGODB_DB` to production). Every one
  is a dry run unless you add `--apply`.

---

## 1. Live payments (Paystack)

The API is ready for live keys. One key is needed, and it also verifies Paystack's webhook signatures. The Paystack account is
shared with other apps, so Oguaa sends its own callback URL on every payment, prefixes its references `oguaa-`, ignores other
apps' webhook events, and re-checks its own pending payments every 10 minutes.

- [ ] Render: set `PAYSTACK_SECRET_KEY` = your `sk_live_…` key. Leave `STRIPE_SECRET_KEY` and `APPLE_BUNDLE_ID` blank.
      Redeploy; the log should say `payments via Paystack mode=live` with no ERROR lines.
- [ ] Paystack dashboard (Live) → Settings → Preferences → Payment channels: turn on **Card** and **Mobile Money**.
- [ ] Paystack webhook: point the Live webhook at `https://api.oguaaman.com/api/payments/paystack/webhook` **only if no
      other app uses it**. Without it, Oguaa still confirms payments within about 10 minutes.
- [ ] Ask Paystack to confirm that subaccounts can settle to Mobile Money wallets before promising that to sellers.
- [ ] One-off commands:
  - [ ] `go run ./cmd/purgefabricated` — confirms no `@oguaa.test` demo accounts remain (`--apply` removes them).
  - [ ] `go run ./cmd/migratedob` — replaces stored dates of birth with an 18+ flag.
  - [ ] `go run ./cmd/purgesimulated` — removes fake test payments so they don't count as revenue.
  - [ ] `go run ./cmd/livesubaccounts` — with `PAYSTACK_SECRET_KEY=sk_live_…` in your shell: gives each verified seller
        a live payout account. Shop checkout fails for a seller until this is done.
- [ ] Staff (stewards, curators, editors) turn on two-factor sign-in — staff tools refuse them in production until they do.
      Existing members will be asked once to accept the Terms and Privacy Notice.
- [ ] Make one real GH₵1 payment by card and one by Mobile Money on citizen.oguaaman.com and creator.oguaaman.com, with the
      browser console open to catch anything the security headers block.
- [ ] Mobile changes reach users only after a new EAS build and store submission.

---

## 2. Researched AI news and illustrations

What it does: each automated story still publishes as the short linked brief. A background writer then researches the story
with Claude and web search and drafts an original 300–700 word report with numbered sources and a cover. An editor approves
it in the Newsroom, which upgrades the brief in place. AI-written reports **always** wait for an editor (Anthropic's usage
policy requires human review of AI-written journalism) — there is deliberately no auto-publish switch for them. Political and
sensitive stories (courts, crime allegations, minors, elections) never get an AI write-up or an AI image.

Before switching on **long-form news** (Admin → Newsroom → Desk settings → `longformEnabled`):
- [ ] Name at least one editor, plus a backup — ideally someone with journalism experience — who will review drafts in
      Admin → Newsroom → Research queue.
- [ ] Anthropic Console: confirm **web search** and **web fetch** are enabled for the organisation, and check any org-level
      domain allowlist (the desk's own list is `OGUAA_NEWS_ALLOWED_DOMAINS`).
- [ ] Optional: review the daily caps (defaults: 4 reports and about $8 of research a day).

Before switching on **AI images** (`imagesEnabled`):
- [ ] Create an OpenAI API key (OpenAI may ask you to verify the organisation for image models) and set `OPENAI_API_KEY`
      on Render. Without it, stories get Oguaa's branded cover instead.
- [ ] Make one test image and check the cost, then adjust the caps if needed (defaults: 10 images and $1.50 a day).

---

## 3. Commercial ads

What it does: advertisers use "Advertise on Oguaa" on the portal: choose a placement, upload the ad, get a live quote. Oguaa
reviews the ad first; once approved the advertiser pays through Paystack and the ad runs. Pricing is per 1,000 viewable
impressions, set per placement, the same for everyone. Undelivered impressions are refunded automatically.

Before switching on (Admin → Ad pricing → `adsEnabled`):
- [ ] Get **written confirmation from Paystack** that selling display ads (including election-campaign ads, if you plan to)
      is fine on your shared account, that the refund API is enabled, and how refunds are funded from the balance.
- [ ] Set `ADS_TOKEN_SECRET` on Render. Generate it with `openssl rand -base64 48`. Without it, no ads are served.
- [ ] Confirm or change the default prices in Admin → Ad pricing (per 1,000 viewable impressions):

      | Placement | Standard | Political |
      |---|---|---|
      | Portal home banner | GH₵60 | GH₵90 |
      | Portal feed card | GH₵50 | GH₵75 |
      | Portal article box | GH₵40 | GH₵60 |
      | Marketing site card | GH₵40 | GH₵60 |
      | Mobile app card | GH₵40 | GH₵60 (off until section 5) |

      Minimum order GH₵150 and 3,000 impressions. If you know your real monthly page views, enter them so inventory
      forecasts are right.
- [ ] Ask your accountant (or GRA) whether Dev Track must charge VAT and issue E-VAT invoices. Set the tax rate in Ad pricing
      only once confirmed (it starts at 0%).
- [ ] Decide whether to allow alcohol and gambling ads (blocked by default — the audience may include under-18s).

---

## 4. Political (election) ads

What it does: every political ad shows "Paid for by {verified legal name}"; sponsors are verified, including a citizenship
declaration (the Political Parties Act bars non-citizens from funding parties); one rate applies to every party; political
ads need two reviewers (or one steward) and pause automatically during the blackout before polls; ads never target by
political opinion; a public ad library keeps every political ad for 7 years.

Before switching on (Admin → Ad pricing → `politicalEnabled`):
- [ ] Have a **Ghanaian media lawyer** review the Advertising Policy, the blackout default, the label wording and the
      Editorial standards page. Ask them for the National Media Commission's political-advertising guidelines text (it
      couldn't be retrieved online during research).
- [ ] Enter upcoming elections in Admin → Election calendar (2027 District Level Elections, the 2028 general election, and any
      Cape Coast by-elections) as soon as the Electoral Commission announces dates. The default blackout runs from 00:00 the
      day before the poll to 00:00 two days after.
- [ ] In the Paystack dashboard, decide whether to turn off international cards for these payments.
- [ ] Remember: District Assembly elections are non-partisan, so their candidates can't advertise without **written
      Electoral Commission authorisation** (the `allowDistrictAssembly` setting stays off until you have it).

---

## 5. Ads inside the mobile app

Off by default (Admin → Ad pricing → `appDeliveryEnabled`). Apple may treat ads bought on the web for display in the app as
in-app "boosts", which must be paid through Apple's in-app purchase. The app already contains the ad slot and shows nothing
while this is off.

- [ ] Decide whether to accept that App Store risk.
- [ ] Before the app release that shows ads: Play Console → **Contains ads = Yes**, and Data safety → App interactions
      collected for advertising (not shared, not linked). App Store Connect privacy label: Advertising Data and Product
      Interaction, not linked to identity, not used for tracking.

---

## 6. Other open decisions and registrations

- [ ] Data Protection Commission: registration number (add it to the Privacy Notice when you have it), and update the
      registration to cover ad measurement and sponsor data if required.
- [ ] Consider registering with the National Media Commission as an online news portal.
- [ ] Rights-reserved news feeds are skipped; researching them needs a lawyer's view.
- [ ] Child-abuse image scanning (e.g. PhotoDNA or Thorn Safer) needs a vendor contract; reporting and immediate hiding work
      today.
- [ ] Pledges and agent escrow settle into Oguaa's Paystack balance, which may need advice under the Payment Systems and
      Services Act.
- [ ] Database backups: the free Atlas tier has none; consider a paid tier with Cloud Backup.
- [ ] Later: Apple / Google in-app billing (to sell plans in the apps), encrypting Ghana Card and settlement-number fields, a
      licensed map-tile provider, and a way for rejected agents to resubmit.

---

## Recommended order

1. Live payments (section 1).
2. Long-form news, then AI images (section 2).
3. Commercial ads (section 3).
4. Political ads (section 4) — only after the lawyer's review and with elections in the calendar.
5. Ads in the mobile app (section 5) — only if you accept the App Store risk.
