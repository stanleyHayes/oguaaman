"""Oguaaman social flyers.

Renders on-brand flyers as PNGs from HTML, using the platform's own design
tokens (deep green / cream / gold, Outfit type, the Kotokuraba crab mark) and
the real Cape Coast photography that ships with the app.

HTML rather than an image model because the text has to be exactly right —
feature names, the domain, the Fante. Image models mangle lettering.
"""
import json, pathlib, sys
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).parent
IMG = HERE / "img"
if not IMG.exists():  # fall back to the photography that ships with the API
    IMG = HERE.parents[1] / "backend/internal/infra/http/seedimg"
OUT = HERE / "png"

# Brand tokens, lifted from frontend/src/index.css.
GREEN_900, GREEN, CREAM = "#0C2C1F", "#123F2D", "#F6F1E7"
GOLD, GOLD_DEEP, CLAY, TEAL, MAROON = "#C7A24A", "#B07D32", "#B0503C", "#0E7C6B", "#7C2D2D"

SIZES = {           # name: (w, h)
    "square":  (1080, 1080),   # Instagram / Facebook feed
    "story":   (1080, 1920),   # Instagram & Facebook stories, TikTok
    "link":    (1200, 630),    # link previews, X/Twitter
}

# The crab of Kotokuraba — the mark the whole identity is built on.
CRAB = """<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4"
 stroke-linecap="round" stroke-linejoin="round" style="width:100%;height:100%">
<g transform="translate(0,-1)">
<path d="M43 32.5C47 31 50 30.5 52 28"/><path d="M52 28C56 27 59.2 23.4 55.6 20.4 54 19.1 52.4 20.2 52.9 22"/>
<path d="M52 28C54.6 28.9 57 27.6 57.2 25.2"/><path d="M43.5 40.5C47.5 41.5 50.6 43.4 52.6 46.4"/>
<path d="M42.5 43C45.6 44.4 48 46.4 49.5 49.4"/><path d="M40.6 45C42.6 47 43.8 49 44.8 51.7"/>
<path d="M21 32.5C17 31 14 30.5 12 28"/><path d="M12 28C8 27 4.8 23.4 8.4 20.4 10 19.1 11.6 20.2 11.1 22"/>
<path d="M12 28C9.4 28.9 7 27.6 6.8 25.2"/><path d="M20.5 40.5C16.5 41.5 13.4 43.4 11.4 46.4"/>
<path d="M21.5 43C18.4 44.4 16 46.4 14.5 49.4"/><path d="M23.4 45C21.4 47 20.2 49 19.2 51.7"/>
<path d="M20 39C20 32 25.5 28.5 32 28.5 38.5 28.5 44 32 44 39 44 44 39 46.5 32 46.5 25 46.5 20 44 20 39Z"/>
<path d="M28 29L28 24"/><path d="M36 29L36 24"/>
<circle cx="28" cy="22.4" r="1.9" fill="currentColor" stroke="none"/>
<circle cx="36" cy="22.4" r="1.9" fill="currentColor" stroke="none"/>
</g></svg>"""

# Adinkra motifs used as large, faint watermarks.
ADINKRA = {
 "sankofa": '<path d="M32 8c-9 0-16 6.5-16 15 0 7 5 11 10 12v9l7-6 7 6v-9c5-1 10-5 10-12 0-8.5-7-15-16-15zm0 8a7 7 0 110 14 7 7 0 010-14z"/>',
 "gye-nyame": '<path d="M20 44c-6-4-8-11-4-17 3-5 10-7 15-4 3 2 5 5 5 9 0 5-4 9-9 9-3 0-6-2-7-5"/><path d="M32 12v40M20 20h24"/>',
 "dwennimmen": '<path d="M18 22c-6 0-10 5-10 10s4 10 10 10 10-5 10-10-4-10-10-10zm28 0c-6 0-10 5-10 10s4 10 10 10 10-5 10-10-4-10-10-10z"/><path d="M28 32h8"/>',
 "funtunfunefu": '<path d="M22 20c-8 0-14 6-14 12s6 12 14 12M42 20c8 0 14 6 14 12s-6 12-14 12"/><path d="M22 20h20M22 44h20M32 26v12"/>',
 "nkyinkyim": '<path d="M10 46V28h11V14h11v18h11v14h11"/>',
 "adinkrahene": '<circle cx="32" cy="32" r="8"/><circle cx="32" cy="32" r="15"/><circle cx="32" cy="32" r="22"/>',
}

# ── The flyers ───────────────────────────────────────────────────────────────
# Each sells one real feature. `eyebrow` is the section, `title` the hook,
# `body` the benefit in plain words, `cta` what to do.
FLYERS = [
 dict(key="music", photo="fetu-crowd.jpg", tone=CLAY, motif="sankofa",
      eyebrow="The Oguaa Sound",
      title="Our artists,\nour sound,\nour stage.",
      body="Every Cape Coast artist in one place — highlife, gospel, brass and drill. Profiles link straight out to Audiomack, Boomplay, Spotify and YouTube. We send listeners to you; we don't host, and we don't take your streams.",
      cta="oguaaman.com · Music"),
 dict(key="festivals", photo="fetu-procession.jpg", tone=GOLD_DEEP, motif="sankofa",
      eyebrow="The living archive",
      title="Fetu Afahye,\nkept year\nby year.",
      body="Every edition of every festival — Fetu Afahye, Edina Bakatue, PANAFEST, Akwambo — recorded and archived. Recaps of the ones behind us, programmes for the ones ahead.",
      cta="oguaaman.com · Festivals"),
 dict(key="people", photo="fetu-queenmother.jpg", tone=GOLD_DEEP, motif="dwennimmen",
      eyebrow="Sons & daughters",
      title="The people\nthis town gave\nthe world.",
      body="Kofi Annan. Efua Sutherland. Ama Ata Aidoo. Casely Hayford. Aggrey. Arthur Wharton. A wall of pride for the icons, the elders and the quietly remarkable — and room for the ones still to come.",
      cta="oguaaman.com · People"),
 dict(key="education", photo="mfantsipim-campus.jpg", tone=MAROON, motif="dwennimmen",
      eyebrow="The Citadel of Education",
      title="Rep the school\nthat made you.",
      body="Mfantsipim. Adisadel. Wesley Girls'. Augusco. Holy Child. UCC. Within a few square miles sit the oldest and most decorated schools in Ghana. Claim your school, find your year group, back the students coming after you.",
      cta="oguaaman.com · Education"),
 dict(key="business", photo="market-women.jpg", tone=TEAL, motif="funtunfunefu",
      eyebrow="The working city",
      title="Put your shop\non the map\nof Oguaa.",
      body="A free listing for every Cape Coast business — market traders, seamstresses, mechanics, guesthouses. Add your products, your prices and your WhatsApp, and let the town and the diaspora find you.",
      cta="oguaaman.com · Business"),
 dict(key="storefront", photo="kenkey-fish.jpg", tone=TEAL, motif="funtunfunefu",
      eyebrow="Your own storefront",
      title="A shopfront\nthat never\ncloses.",
      body="Photos, opening hours, a full product and service catalogue, and reviews from real neighbours. One clean link to share — oguaaman.com/s/your-shop — that works on every phone in town.",
      cta="oguaaman.com · Business"),
 dict(key="lostfound", photo="downtown.jpg", tone=TEAL, motif="nkyinkyim",
      eyebrow="Neighbour to neighbour",
      title="Lost it?\nThe town\nis looking.",
      body="A live board for missing people, misplaced belongings and found items. Notices publish immediately, because the right neighbour may already have the answer.",
      cta="oguaaman.com · Lost & Found"),
 dict(key="safety", photo="fosu-lagoon.jpg", tone=MAROON, motif="nkyinkyim",
      eyebrow="Keeping Oguaa safe",
      title="One place\nfor what's\nhappening.",
      body="Flooding at Fosu. A fire at the market. A road closed at Abura. Report an incident, follow the response, and get alerts from recognised authorities — not rumours from a group chat.",
      cta="oguaaman.com · Safety"),
 dict(key="memoriam", photo="christ-church.jpg", tone=GOLD_DEEP, motif="gye-nyame",
      eyebrow="Yɛnkae · Let us remember",
      title="A permanent\nhome for\ntheir story.",
      body="Not a post that scrolls away. A lasting memorial page with photographs, tributes and a candle anyone can light — family-guided, reviewed for dignity, and here for good.",
      cta="oguaaman.com · In Memoriam"),
 dict(key="diaspora", photo="beach-boats.jpg", tone=GOLD_DEEP, motif="nkyinkyim",
      eyebrow="Abɔkyirfoɔ · The diaspora",
      title="However far,\nstill of\nthis town.",
      body="A register for Oguaa people everywhere. Find your people in your city, follow what's happening at home, and back the projects that need you.",
      cta="oguaaman.com · Diaspora"),
 dict(key="outside", photo="fishing-boats.jpg", tone=GOLD_DEEP, motif="funtunfunefu",
      eyebrow="Oguaa Outside",
      title="Someone you\ncan trust,\nback home.",
      body="Vetted, background-checked agents who handle errands for Cape Coast people abroad — procurement, shipping, inspections, official paperwork — with the money held in escrow until the job is done.",
      cta="oguaaman.com · Outside"),
 dict(key="youth", photo="outdoor-classroom-ghana.jpg", tone=TEAL, motif="funtunfunefu",
      eyebrow="Training the youth",
      title="Doors worth\nopening for\nthe young.",
      body="Scholarships, apprenticeships, internships, training and mentorship — gathered in one board. Information and outbound links only: no private adult-to-minor contact ever runs through Oguaaman.",
      cta="oguaaman.com · Youth"),
 dict(key="events", photo="bakatue.jpg", tone=GOLD_DEEP, motif="adinkrahene",
      eyebrow="Town pulse",
      title="Everything\non in Oguaa,\none calendar.",
      body="Durbars, homecomings, speech days, live shows and community meetings. Post yours free and put it in front of the whole town.",
      cta="oguaaman.com · Events"),
 dict(key="projects", photo="classroom-block-ghana.jpg", tone=GREEN, motif="funtunfunefu",
      eyebrow="Adopt a project",
      title="Fund something\nyou can walk\npast later.",
      body="Costed, concrete civic improvements — a library corner, a lagoon clean-up, an ICT lab. Every cedi receipted, every project accountable to the people it serves.",
      cta="oguaaman.com · Projects"),
 dict(key="heritage", photo="castle-exterior.jpg", tone=GREEN, motif="sankofa",
      eyebrow="The ancient capital",
      title="The castle,\nthe coast,\nthe memory.",
      body="Cape Coast Castle, the Door of No Return, the Fante Confederacy, the Asafo companies. The history of the town that was the capital of the Gold Coast — told by the people who live in it.",
      cta="oguaaman.com · Heritage"),
 dict(key="culture", photo="posuban.jpg", tone=GOLD_DEEP, motif="adinkrahene",
      eyebrow="Asafo & the 77 gods",
      title="The culture\nis still\nbeing lived.",
      body="Seven Asafo companies, their posuban shrines and frankaa flags, the Omanhene and the Traditional Council, the durbar. Not a museum — a town that still does these things.",
      cta="oguaaman.com · Culture"),
 dict(key="visit", photo="kakum-canopy.jpg", tone=TEAL, motif="adinkrahene",
      eyebrow="Visit Cape Coast",
      title="Come and\nsee it for\nyourself.",
      body="The Castle, Kakum's canopy walk, Elmina, Assin Manso and the coast road. Where to go, when to come, what to eat — written by people from here, not a travel desk.",
      cta="oguaaman.com · Visit"),
 dict(key="better", photo="bakaano.jpg", tone=GOLD_DEEP, motif="nkyinkyim",
      eyebrow="Yɛn ara asaase ni",
      title="This is our\nown land.",
      body="A civic code for Oguaa — the habits, from the self to the nation, that build a better town. Make the pledge, and hold the rest of us to it.",
      cta="oguaaman.com · Build a better Oguaa"),
 dict(key="map", photo="elmina-pano.jpg", tone=TEAL, motif="adinkrahene",
      eyebrow="Explore the map",
      title="Every quarter,\nevery landmark,\npinned.",
      body="Bakaano, Amamoma, Abura, Pedu, Kotokuraba. Find the schools, the shrines, the markets and the businesses — quarter by quarter.",
      cta="oguaaman.com · Map"),
 dict(key="rent", photo="castle-courtyard.jpg", tone=GOLD_DEEP, motif="funtunfunefu",
      eyebrow="Rent & Stay",
      title="A room, a house,\na place to\nland.",
      body="Rooms, family houses and guest stays around Cape Coast — listed by the people who own them, for students, workers and visitors coming home.",
      cta="oguaaman.com · Rent & Stay"),
 dict(key="news", photo="fetu-flagbearer.jpg", tone=CLAY, motif="adinkrahene",
      eyebrow="The Oguaa Newsroom",
      title="News from\nhere, written\nby us.",
      body="Festival programmes, scholarships, homecomings and announcements from Cape Coast and its institutions. Free to read, always.",
      cta="oguaaman.com · News"),
 dict(key="brand", photo="castle-courtyard.jpg", tone=GOLD_DEEP, motif="sankofa",
      eyebrow="Oguaaman",
      title="The home\nof Cape Coast.",
      body="Its history, culture, festivals, schools, businesses, people — and the ones we remember. One place for Oguaa, made by us, for us.",
      cta="oguaaman.com"),
]

TPL = """<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:{W}px;height:{H}px;overflow:hidden}
  body{font-family:Outfit,system-ui,sans-serif;background:%(GREEN_900)s;position:relative}
  .photo{position:absolute;inset:0;background-image:url('%(PHOTO)s');
         background-size:cover;background-position:center;filter:saturate(1.05)}
  /* Two scrims: a colour wash that ties every flyer to the brand, and a deep
     bottom gradient so the type always has contrast whatever the photo does. */
  .wash{position:absolute;inset:0;background:%(TONE)s;mix-blend-mode:multiply;opacity:.62}
  .scrim{position:absolute;inset:0;
    background:linear-gradient(to top,%(GREEN_900)s 0%%,%(GREEN_900)sEE {S1}%%,%(GREEN_900)s55 {S2}%%,transparent 100%%)}
  .motif{position:absolute;right:-{MOFF}px;top:-{MOFF}px;width:{MW}px;height:{MW}px;color:%(GOLD)s;opacity:.10}
  .motif svg{width:100%%;height:100%%;fill:none;stroke:currentColor;stroke-width:2.2;
             stroke-linecap:round;stroke-linejoin:round}
  .frame{position:absolute;inset:{PAD}px;border:2px solid %(GOLD)s33;border-radius:{RAD}px;pointer-events:none}
  .content{position:absolute;left:{PAD2}px;right:{PAD2}px;bottom:{PAD2}px;z-index:3}
  .eyebrow{color:%(GOLD)s;font-size:{FE}px;font-weight:700;letter-spacing:.22em;
           text-transform:uppercase;margin-bottom:{GAP1}px}
  .rule{width:{RULEW}px;height:4px;background:%(GOLD)s;border-radius:2px;margin-bottom:{GAP1}px}
  h1{color:%(CREAM)s;font-size:{FT}px;font-weight:800;line-height:.98;letter-spacing:-.025em;
     white-space:pre-line;margin-bottom:{GAP2}px;text-shadow:0 2px 24px rgba(0,0,0,.45)}
  p{color:%(CREAM)sD9;font-size:{FB}px;line-height:1.45;font-weight:400;max-width:{BW}px;
    margin-bottom:{GAP3}px;text-shadow:0 1px 12px rgba(0,0,0,.5)}
  .foot{display:flex;align-items:center;gap:{FG}px;border-top:1px solid %(GOLD)s40;padding-top:{GAP1}px}
  .mark{width:{MK}px;height:{MK}px;color:%(GOLD)s;flex:none}
  .word{color:%(CREAM)s;font-size:{FW}px;font-weight:700;letter-spacing:-.01em}
  .cta{margin-left:auto;color:%(GOLD)s;font-size:{FC}px;font-weight:600;letter-spacing:.04em}
</style></head><body>
  <div class="photo"></div><div class="wash"></div><div class="scrim"></div>
  <div class="motif">%(MOTIF)s</div>
  <div class="frame"></div>
  <div class="content">
    <div class="eyebrow">%(EYEBROW)s</div>
    <div class="rule"></div>
    <h1>%(TITLE)s</h1>
    <p>%(BODY)s</p>
    <div class="foot">
      <div class="mark">%(CRAB)s</div>
      <div class="word">Oguaaman</div>
      <div class="cta">%(CTA)s</div>
    </div>
  </div>
</body></html>"""

# Per-size typography. Flyers are read at very different distances, so these are
# tuned per format rather than scaled from one set.
METRICS = {
 "square": dict(S1=52, S2=88, PAD=28, PAD2=76, FE=23, FT=92,  FB=27, BW=880, RULEW=76,
                GAP1=22, GAP2=30, GAP3=34, MK=54, FW=38, FC=21, MW=520, MOFF=120, RAD=18, FG=16),
 "story":  dict(S1=44, S2=80, PAD=32, PAD2=88, FE=27, FT=118, FB=32, BW=900, RULEW=88,
                GAP1=28, GAP2=38, GAP3=44, MK=64, FW=46, FC=25, MW=640, MOFF=150, RAD=22, FG=18),
 "link":   dict(S1=58, S2=100,PAD=20, PAD2=56, FE=18, FT=62,  FB=21, BW=760, RULEW=58,
                GAP1=14, GAP2=18, GAP3=22, MK=40, FW=28, FC=16, MW=360, MOFF=90,  RAD=14, FG=12),
}


def build(flyer, size_name):
    w, h = SIZES[size_name]
    m = METRICS[size_name]
    html = TPL
    for k, v in m.items():
        html = html.replace("{%s}" % k, str(v))
    html = html.replace("{W}", str(w)).replace("{H}", str(h))
    return html % dict(
        GREEN_900=GREEN_900, CREAM=CREAM, GOLD=GOLD,
        TONE=flyer["tone"], PHOTO=(IMG / flyer["photo"]).as_uri(),
        MOTIF='<svg viewBox="0 0 64 64">%s</svg>' % ADINKRA[flyer["motif"]],
        EYEBROW=flyer["eyebrow"], TITLE=flyer["title"], BODY=flyer["body"],
        CTA=flyer["cta"], CRAB=CRAB,
    )


def main():
    only = sys.argv[1:] or None
    OUT.mkdir(parents=True, exist_ok=True)
    made = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for size_name, (w, h) in SIZES.items():
            page = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
            for f in FLYERS:
                if only and f["key"] not in only:
                    continue
                page.set_content(build(f, size_name), wait_until="networkidle")
                page.wait_for_timeout(320)          # let the webfont settle
                out = OUT / f"{f['key']}-{size_name}.png"
                page.screenshot(path=str(out))
                made.append(out.name)
            page.close()
        b.close()
    print(json.dumps({"count": len(made), "flyers": len(FLYERS), "sizes": list(SIZES)}, indent=1))


if __name__ == "__main__":
    main()
