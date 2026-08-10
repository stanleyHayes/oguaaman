# Oguaaman social flyers

66 ready-to-post images — **22 features × 3 formats** — in `png/`.

| Format | Size | Post to |
|---|---|---|
| `*-square.png` | 1080 × 1080 | Instagram feed, Facebook feed, LinkedIn |
| `*-story.png` | 1080 × 1920 | Instagram & Facebook stories, TikTok, WhatsApp status |
| `*-link.png` | 1200 × 630 | X/Twitter, link previews, blog headers |

Every flyer uses the platform's own design tokens — deep green `#0C2C1F`, cream
`#F6F1E7`, gold `#C7A24A`, Outfit type, the Kotokuraba crab mark — over the real
Cape Coast photography that ships with the app. Nothing is stock, and nothing is
AI-generated imagery.

They are built from HTML rather than an image model on purpose: the copy has to
be exactly right — feature names, the domain, the Fante (`Yɛnkae`, `Abɔkyirfoɔ`,
`Yɛn ara asaase ni`). Image models mangle lettering, especially diacritics.

## The 22

**Culture & heritage** — `festivals` · `culture` · `heritage` · `people` · `memoriam` · `visit`
**The working town** — `business` · `storefront` · `rent` · `map` · `events` · `news`
**Community** — `lostfound` · `safety` · `youth` · `projects` · `better` · `music`
**Reaching out** — `diaspora` · `outside` · `education` · `brand`

`brand` is the general-purpose one — lead with it when introducing the platform
cold; the rest each sell a single feature.

## Suggested posting order

Open with `brand`, then alternate a **pride** post (festivals, people, heritage,
music) with a **utility** post (business, lost & found, safety, events). Pride
earns the follow; utility earns the sign-up.

`business` and `storefront` are the two that recruit traders, which is what the
platform most needs — put paid promotion behind those rather than spreading it.

## Regenerating

```bash
cd marketing/flyers
python generate.py             # all 66
python generate.py music brand # just those keys, all three sizes
```

Needs Playwright (`pip install playwright && playwright install chromium`) and
the seed photography from `backend/internal/infra/http/seedimg/`. Copy the JPGs
into `flyers/img/` first; `generate.py` reads them from there.

Edit the `FLYERS` list in `generate.py` to change copy, swap a photograph, or
add a feature. Typography is tuned per format in `METRICS` rather than scaled
from one set, because the three formats are read at very different distances.

## Before you post

The copy describes features that are **live**, but the site currently has no
businesses, artists or rentals listed — the fabricated seed examples were
removed. `business`, `storefront` and `rent` are therefore recruiting posts, not
showcases: they invite the first traders rather than pointing at existing ones.
Hold `music` back until a few real artists are on the roster, or it will send
people to an empty page.
