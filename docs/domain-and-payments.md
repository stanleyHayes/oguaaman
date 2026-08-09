# Decisions: canonical domain, and payment rails

Two settled decisions that the code now assumes. Both were open questions; this
records what was chosen and why, so the next person does not relitigate them.

---

## 1. The canonical host is the apex: `oguaaman.com`

`www.oguaaman.com` redirects to `oguaaman.com`. Not the other way round.

### Why

**Creator subdomains make `www` actively confusing.** Creators get their own
hosts — `neurodyne.oguaaman.com` and so on. `www` is itself just a subdomain, so
once tenants live at that level, `www.oguaaman.com` reads as *one more tenant*
rather than the root of the platform. The apex is unambiguously "Oguaaman";
every subdomain is unambiguously "a thing hosted on Oguaaman". That distinction
is worth more than the historical reasons for `www`.

**The codebase already says apex, everywhere.** Canonicals, `sitemap.xml`,
`robots.txt`, Open Graph `og:url`, and the Schema.org `@id`s that tie the
`WebSite`/`Organization`/`City` graph together (including the Cape Coast alias
set) are all built from `https://oguaaman.com`. Choosing `www` would mean
rewriting all of it and re-establishing the entity graph against a new identity,
for no gain.

**It is what was bought, and it is shorter to say and print.**

### The classic counter-argument, and why it does not apply

The usual case for `www` is cookie scoping: a cookie set on the apex with a
`Domain` attribute is sent to *every* subdomain, so with tenant subdomains a
session cookie could leak to creator-controlled hosts.

That risk is real but is not what decides this, because **Oguaa does not set a
`Domain` on its cookies** — there is no `Domain:` in the cookie code, so session
cookies are host-only and are never sent to a sibling subdomain. Keep it that
way. If cross-subdomain single sign-on is ever wanted, do it with a token
exchange, not a `.oguaaman.com` cookie: that cookie would be transmitted to
every creator storefront, and any content injection on one of those hosts would
become a session-theft vector.

### What has to change

Nothing in code. One setting in the hosting dashboard:

> Vercel → the `marketing` project → **Settings → Domains** → set
> `oguaaman.com` as the **Primary Domain**.

Vercel then issues the `www → apex` redirect itself. Today it is inverted: the
apex `308`s to `www`, which means every canonical points at a URL that redirects,
and Google has indexed both `http://www.oguaaman.com` and
`https://www.oguaaman.com` as separate entries.

**Do not add a `www → apex` redirect to `vercel.json` while the dashboard still
has `www` as primary.** The platform-level redirect runs first, so the two would
form a redirect loop. Change the dashboard setting; that is the whole fix.

After the switch, re-submit `https://oguaaman.com/sitemap.xml` in Google Search
Console so the duplicates collapse onto the apex.

---

## 2. Payments: Paystack and Apple In-App Purchase. No Stripe.

- **Paystack** — the primary rail. Ghana-first, handles mobile money, which is
  how most of the audience actually pays.
- **Apple In-App Purchase** — required, not optional, for anything sold *inside
  the iOS app* that unlocks digital content or features: creator subscriptions,
  promotions, and paid digital access. App Store Review Guideline 3.1.1 does not
  allow those to be sold through an external rail, and does not allow the app to
  link out to buy them either.
- **Stripe — not used.** Removed from consideration deliberately.

### The condition attached to that

Paystack settles to Ghanaian accounts and its card coverage for cardholders
*outside* Africa is materially weaker than Stripe's. Oguaa's diaspora audience is
a stated priority — the whole "Oguaa Outside" and diaspora-register surface
assumes people paying from abroad.

So: **if diaspora payment failure rates turn out to be high, Stripe becomes
necessary as a second card rail**, not as a replacement. That is a data
question, not a taste question. Instrument Paystack failures by cardholder
country before deciding; do not add a second processor on a hunch.

### What still sells through Paystack on iOS

Guideline 3.1.1 carves out physical goods and services consumed outside the app,
and 3.1.3(e) allows *approved* nonprofits to collect donations without IAP.
Tickets to real-world events, agent errands, and physical goods from storefronts
are all outside-the-app value and stay on Paystack. The line to hold is: digital
unlocks inside the app go through IAP; everything that happens in the physical
world does not.
