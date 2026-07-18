import type { ReactNode } from "react";
import { PageHero } from "@/components/page-hero";
import { DurbarScene } from "@/components/scenes";
import { Section, SectionHeading, Pill, CTA as Cta } from "@/components/ui";
import { SymbolDivider } from "@/components/adinkra";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import {
  listingSubtitle,
  portalHref,
  useListings,
  type Listing,
} from "@/lib/listings";
import { mediaUrl } from "@/lib/media";
import { PORTAL_APP_URL } from "@/config";

type Tone = "neutral" | "green" | "gold" | "clay" | "teal";

interface Item {
  pill: string;
  tone: Tone;
  meta?: string;
  title: string;
  body: ReactNode;
}

const FETU: Item[] = [
  {
    pill: "When",
    tone: "gold",
    meta: "First Saturday of September",
    title: "2026: Saturday, 5 September",
    body: "The festival week of rites runs the days before, building to the Saturday durbar. Come early — the streets fill fast.",
  },
  {
    pill: "The week of silence",
    tone: "teal",
    title: "A town held quiet",
    body: "A ban on drumming, noise-making and pounding fufu after dark — and on fishing the Fosu Lagoon — keeps the town still for the ancestral spirits before the durbar.",
  },
  {
    pill: "The durbar",
    tone: "clay",
    title: "State at Victoria Park",
    body: "The Saturday procession ends at Victoria Park, where the Omanhen, Osabarimba Kwesi Atta II, and the sub-chiefs sit in state — palanquins, turning umbrellas, swords and horns.",
  },
];

const RITE: Item[] = [
  {
    pill: "The okyeame",
    tone: "gold",
    title: "How a chief speaks",
    body: "A chief never speaks directly in public. His okyeame — linguist — carries the okyeame poma, a staff topped with a proverb cast in gold, and pours the libation. He speaks the words a chief may not say himself.",
  },
  {
    pill: "The palanquin",
    tone: "clay",
    title: "Borne shoulder-high",
    body: "Chiefs ride high in decorated palanquins, a fly-whisk in one hand and a ceremonial sword in the other, rocked through the crowd beneath a state umbrella that spins as they go.",
  },
  {
    pill: "The fontomfrom",
    tone: "teal",
    title: "The drums that announce",
    body: "The royal drum ensemble — the fontomfrom, with the atumpan talking drums — is played by the okyerema. The drums do not accompany the chief. They announce him.",
  },
];

const CALENDAR: Item[] = [
  {
    pill: "Edina Bakatue",
    tone: "teal",
    meta: "First Tuesday of July (2026: 7 July) · Elmina",
    title: "The opening of the lagoon",
    body: "Cape Coast's nearest neighbour drains the Benya Lagoon and opens the fishing season with a regatta and offerings of mashed yam to the lagoon god Nana Benya. Its own rite, a short drive west.",
  },
  {
    pill: "Emancipation Day",
    tone: "gold",
    meta: "1 August, annually · Castle & Assin Manso",
    title: "The Door of Return",
    body: "Every 1 August the diaspora walks back through the Castle's door. Ghana — the first African nation to mark the day, since 1998 — renamed its seaward face the Door of Return. Held soberly, never as a spectacle.",
  },
  {
    pill: "PANAFEST",
    tone: "neutral",
    meta: "Biennial · next edition 2027 · Cape Coast & Elmina",
    title: "Pan-African remembrance",
    body: "The Pan-African gathering of theatre, music and remembrance, conceived by Cape Coast's own Efua Sutherland. Recent editions ran in 2023 and 2025; there is no PANAFEST in 2026 — the next falls in 2027.",
  },
  {
    pill: "Edina Bronya",
    tone: "teal",
    meta: "January · Elmina",
    title: "The coast's own Christmas",
    body: "Elmina keeps a local “Christmas” each January — a Dutch-era inheritance turned wholly Fante, with family feasts and a quieter, homebound joy.",
  },
];

const TABLE: Item[] = [
  { pill: "Staple", tone: "gold", title: "Fante kenkey (dokonu)", body: "Fermented corn dough wrapped in plantain leaf and steamed — darker, firmer and more sour than the Ga kind. Broken open with your hands." },
  { pill: "The stew", tone: "clay", title: "Fante-fante", body: "The fisherman's stew: fresh fish, often tilapia or mackerel, simmered — never fried — in tomato and red palm oil." },
  { pill: "Sharp & deep", tone: "teal", title: "Koobi", body: "Salted, sun-dried tilapia. A little goes a long way, lending its depth to a pot of stew or a plate of kontomire." },
  { pill: "Fresh in", tone: "green", title: "The Bakaano catch", body: "Bakaano is Cape Coast's landing beach. The fish on your plate was in the Atlantic this morning, drawn up the sand at dawn." },
];

const CHAPTERS = [
  { href: "#fetu", number: "01", label: "Fetu Afahye" },
  { href: "#rite", number: "02", label: "Rite & regalia" },
  { href: "#almanac", number: "03", label: "Coastal calendar" },
  { href: "#sound", number: "04", label: "The Oguaa sound" },
  { href: "#table", number: "05", label: "The coastal table" },
] as const;

const ACCENT: Record<Tone, string> = {
  neutral: "bg-green-slate",
  green: "bg-green",
  gold: "bg-gold-brand",
  clay: "bg-clay",
  teal: "bg-teal",
};

const CALENDAR_ORDER = [3, 0, 1, 2] as const;
const CALENDAR_DATES = ["2026-01", "2026-07-07", "2026-08-01", "2027"] as const;

function DirectoryThumbnail({ listing, dark = false }: Readonly<{ listing: Listing; dark?: boolean }>) {
  return (
    <span
      className={`relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border ${
        dark ? "border-cream/15 bg-cream/10 text-gold" : "border-green/10 bg-green/10 text-green"
      }`}
      aria-hidden
    >
      <span className="font-sans text-lg font-semibold">{listing.title.charAt(0)}</span>
      {listing.coverImageUrl && (
        <img
          src={mediaUrl(listing.coverImageUrl)}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
    </span>
  );
}

function ArtistDirectory({ artists }: Readonly<{ artists: Listing[] }>) {
  return (
    <aside className="rounded-[1.5rem] border border-cream/15 bg-cream/[0.06] p-5 sm:p-7" aria-labelledby="artists-title">
      <div className="flex items-end justify-between gap-4 border-b border-cream/15 pb-5">
        <div>
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-gold">Carrying the sound</p>
          <h3 id="artists-title" className="mt-2 text-2xl font-semibold text-cream">The artists of Oguaa today.</h3>
        </div>
        <span className="shrink-0 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-cream/45">Live directory</span>
      </div>
      <p className="mt-5 text-sm leading-relaxed text-cream/70">
        The voices keeping the coast's sound alive — gospel highlife and palm-wine, hiplife and drill, brass and Asafo fusion. Straight from the app.
      </p>
      {artists.length > 0 && (
      <ul className="mt-6 divide-y divide-cream/10">
        {artists.map((artist) => (
          <li key={artist.id}>
            <a
              href={portalHref(artist)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${artist.title} in the Oguaa app (opens in a new tab)`}
              className="group flex items-center gap-4 py-4"
            >
              <DirectoryThumbnail listing={artist} dark />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-cream transition-colors group-hover:text-gold">{artist.title}</span>
                <span className="mt-0.5 block truncate text-xs text-cream/55">{listingSubtitle(artist)}</span>
              </span>
              <span className="text-gold transition-transform group-hover:translate-x-1" aria-hidden>→</span>
            </a>
          </li>
        ))}
      </ul>
      )}
      <Cta href={`${PORTAL_APP_URL}/music`} variant="gold" external className="mt-6 w-full sm:w-auto">
        Browse every artist
      </Cta>
    </aside>
  );
}

function BusinessDirectory({ businesses }: Readonly<{ businesses: Listing[] }>) {
  return (
    <aside className="rounded-[1.5rem] border border-green/15 bg-paper/70 p-5 shadow-[var(--shadow-card)] sm:p-7" aria-labelledby="businesses-title">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-clay-text">Where the town eats & stays</p>
      <h3 id="businesses-title" className="mt-2 text-2xl font-semibold text-ink">Tables, kitchens and a bed by the Castle.</h3>
      <p className="mt-4 text-sm leading-relaxed text-ink-muted">
        Family kitchens, market fishmongers and a guesthouse within a walk of the Door of No Return — listed by the community.
      </p>
      {businesses.length > 0 && (
      <ul className="mt-6 space-y-3">
        {businesses.map((business) => (
          <li key={business.id}>
            <a
              href={portalHref(business)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${business.title} in the Oguaa app (opens in a new tab)`}
              className="group flex items-center gap-4 rounded-xl border border-green/10 bg-cream/80 p-3 transition-colors hover:border-green/30 hover:bg-cream"
            >
              <DirectoryThumbnail listing={business} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink group-hover:text-green">{business.title}</span>
                <span className="mt-0.5 block truncate text-xs text-ink-muted">{listingSubtitle(business)}</span>
              </span>
              <span className="text-green transition-transform group-hover:translate-x-1" aria-hidden>→</span>
            </a>
          </li>
        ))}
      </ul>
      )}
      <Cta href={`${PORTAL_APP_URL}/business`} variant="primary" external className="mt-6 w-full sm:w-auto">
        See every shop & stay
      </Cta>
    </aside>
  );
}

export function Component() {
  const artists = useListings("/api/artists", 6);
  const businesses = useListings("/api/businesses", 6);

  return (
    <>
      <PageHero
        scene={DurbarScene}
        kicker="Festivals & the calendar"
        title="When Oguaa stops to remember."
        lede="A town that goes silent for a week, then erupts — seven Asafo companies, palanquins, musketry and the durbar at Victoria Park. And a coast that keeps the diaspora's homecoming, soberly, every year."
      >
        <div className="inline-flex overflow-hidden rounded-full border border-cream/20 bg-green-900/60 shadow-lg backdrop-blur-sm">
          <span className="bg-gold-brand px-4 py-2.5 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.17em] text-green-900">
            Fetu Afahye 2026
          </span>
          <time dateTime="2026-09-05" className="px-5 py-2.5 font-semibold text-cream">
            5 Sep 2026
          </time>
        </div>
      </PageHero>

      <nav aria-label="Festival almanac chapters" className="border-b border-green/10 bg-paper">
        <div className="mx-auto max-w-6xl overflow-x-auto px-5 sm:px-6">
          <ol className="flex min-w-max items-center">
            {CHAPTERS.map((chapter) => (
              <li key={chapter.href} className="border-l border-green/10 last:border-r">
                <a
                  href={chapter.href}
                  className="group flex items-center gap-3 px-5 py-4 text-sm font-semibold text-ink-muted transition-colors hover:bg-cream hover:text-green sm:px-6"
                >
                  <span className="font-mono text-[0.6rem] tracking-[0.15em] text-gold-text">{chapter.number}</span>
                  <span>{chapter.label}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </nav>

      <Section id="fetu" tone="paper" size="wide" className="overflow-hidden">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <SectionHeading
              kicker="THE GREAT FESTIVAL"
              title="Fetu Afahye — clearing the dirt."
              lede="On the first Saturday of September, Cape Coast gives thanks to the seventy-seven gods of the Oguaa Traditional Area. The name comes from efin tu — “clearing away the filth” — for a sickness that walked the town in the seventeenth century and stopped when the people called on the gods. In 2026, that Saturday is the 5th of September."
            />
            <Reveal delay={0.08}>
              <p className="mt-8 max-w-3xl font-serif text-lg leading-relaxed text-ink">
                For a week before the durbar, the town goes quiet. No drumming after dark. No fishing in the Fosu
                Lagoon. The Omanhen is shut away to seek wisdom from the ancestors, then comes out to pour the
                libation that opens the festival. The silence breaks — and the seven Asafo companies pour into the
                streets with their flags, their drums and their musketry, while the chiefs come up to Victoria Park
                in palanquins under turning umbrellas, each one with his okyeame walking ahead, staff in hand.
              </p>
            </Reveal>
          </div>

          <Reveal className="lg:col-span-5" delay={0.14}>
            <div className="relative h-full min-h-80 overflow-hidden rounded-[1.75rem] bg-green-900 p-7 text-cream shadow-[var(--shadow-lift)] sm:p-9">
              <span className="absolute -right-8 -top-14 font-sans text-[12rem] font-semibold leading-none text-cream/[0.04]" aria-hidden>77</span>
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-gold">Festival field note · No. 01</p>
              <p className="mt-10 text-sm uppercase tracking-[0.16em] text-cream/55">Cape Coast, Ghana</p>
              <time dateTime="2026-09-05" className="mt-3 block font-sans text-5xl font-semibold leading-none text-cream sm:text-6xl">
                5 Sep
              </time>
              <p className="mt-3 font-mono text-sm tracking-[0.22em] text-gold">2026</p>
              <div className="mt-10 grid grid-cols-2 gap-4 border-t border-cream/15 pt-6">
                <div>
                  <p className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-cream/45">Day</p>
                  <p className="mt-2 font-semibold">Saturday</p>
                </div>
                <div>
                  <p className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-cream/45">Assembly</p>
                  <p className="mt-2 font-semibold">Victoria Park</p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        <Stagger as="ol" className="relative mt-16 grid gap-0 border-y border-green/15 md:grid-cols-3">
          {FETU.map((item, index) => (
            <StaggerItem
              as="li"
              key={item.title}
              index={index}
              className="relative border-b border-green/15 px-1 py-8 last:border-b-0 md:border-b-0 md:border-r md:px-8 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
            >
              <div className="flex items-center gap-3">
                <span className={`flex size-8 items-center justify-center rounded-full font-mono text-[0.62rem] font-semibold text-cream ${ACCENT[item.tone]}`}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Pill tone={item.tone}>{item.pill}</Pill>
              </div>
              <h3 className="mt-5 text-xl font-semibold text-ink">{item.title}</h3>
              {item.meta && (
                <time dateTime="2026-09-05" className="mt-2 block font-mono text-[0.62rem] uppercase tracking-[0.14em] text-gold-text">
                  {item.meta}
                </time>
              )}
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">{item.body}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <Section id="rite" tone="cream" size="wide">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <SectionHeading
              kicker="HOW A CHIEF SPEAKS"
              title="Palanquin, staff and drum."
              lede="Nothing at a durbar is accidental. Every object carries a word."
            />
          </div>
          <dl className="border-t border-green/20 lg:col-span-8">
            {RITE.map((item, index) => (
              <div key={item.title} className="grid gap-4 border-b border-green/20 py-7 sm:grid-cols-[3rem_10rem_1fr] sm:gap-6">
                <span className="font-mono text-2xl text-green/25" aria-hidden>{String(index + 1).padStart(2, "0")}</span>
                <dt>
                  <Pill tone={item.tone}>{item.pill}</Pill>
                  <span className="mt-3 block font-semibold text-ink">{item.title}</span>
                </dt>
                <dd className="text-sm leading-relaxed text-ink-muted sm:pt-0.5">{item.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <Section id="almanac" tone="paper" size="wide">
        <SectionHeading
          kicker="ALONG THIS COAST"
          title="Oguaa is not the only fire."
          lede="One short stretch of the Central Region coast keeps more festivals than most countries. Within an afternoon's drive of the Castle, the calendar turns all year."
        />
        <Stagger as="ol" className="relative mt-14 before:absolute before:bottom-0 before:left-[1.15rem] before:top-0 before:w-px before:bg-green/15 sm:before:left-[8.45rem]">
          {CALENDAR_ORDER.map((calendarIndex, rowIndex) => {
            const item = CALENDAR[calendarIndex];
            return (
              <StaggerItem as="li" key={item.title} index={rowIndex} className="relative grid gap-4 pb-10 last:pb-0 sm:grid-cols-[7rem_3rem_1fr] sm:gap-5">
                <time
                  dateTime={CALENDAR_DATES[rowIndex]}
                  className="pl-12 font-mono text-[0.64rem] font-semibold uppercase tracking-[0.15em] text-gold-text sm:pl-0 sm:pt-1 sm:text-right"
                >
                  {item.meta?.split(" · ")[0]}
                </time>
                <span className={`absolute left-[0.8rem] top-0.5 size-3 rounded-full ring-8 ring-paper sm:static sm:mx-auto sm:mt-1.5 ${ACCENT[item.tone]}`} aria-hidden />
                <article className="ml-12 rounded-[1.25rem] border border-green/10 bg-cream/70 p-6 shadow-[var(--shadow-card)] sm:ml-0 sm:p-7">
                  <div className="flex flex-wrap items-center gap-3">
                    <Pill tone={item.tone}>{item.pill}</Pill>
                    <p className="font-mono text-[0.6rem] uppercase tracking-[0.13em] text-ink-faint">{item.meta}</p>
                  </div>
                  <h3 className="mt-4 text-2xl font-semibold text-ink">{item.title}</h3>
                  <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted">{item.body}</p>
                </article>
              </StaggerItem>
            );
          })}
        </Stagger>
      </Section>

      <Section id="sound" tone="deep" size="wide" className="relative overflow-hidden">
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-contours opacity-[0.12]" />
        <div className="relative grid gap-12 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            <SectionHeading
              onDark
              kicker="HIGHLIFE LEARNED TO SWIM HERE"
              title="The rhythm the fishermen sang, given horns."
            />
            <p className="mt-8 max-w-3xl font-serif text-lg leading-relaxed text-cream/85">
              C.K. Mann was born in Cape Coast in 1936. He took osode — the rhythm Fante fishermen sing pulling
              nets — and gave it guitars and organ; they called him Osodehene, the king of osode. His breakout,
              “Edina Benya,” came in 1969. Up the road in Saltpond, Ebo Taylor bent highlife into Afro-funk,
              carried his Black Star Highlife Band to London in 1962, brushed shoulders with Fela Kuti, and kept
              recording into his nineties. He died at home in Saltpond on 7 February 2026, aged ninety. The coast
              that made him does not forget a voice.
            </p>
            <div className="mt-8">
              <Cta href={`${PORTAL_APP_URL}/music`} variant="gold" external>
                Hear the living sound →
              </Cta>
            </div>
          </div>
          <div className="lg:col-span-5">
            <ArtistDirectory artists={artists} />
          </div>
        </div>
      </Section>

      <Section id="table" tone="sand" size="wide">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            <SectionHeading
              kicker="COME HUNGRY"
              title="What the sea sets down."
              lede="The taste of the coast: fermented corn, palm oil, and fish that was in the Atlantic this morning."
            />
            <div className="mt-10 overflow-hidden rounded-[1.5rem] border border-green/15 bg-cream/65">
              <div className="hidden grid-cols-[7rem_1fr] border-b border-green/15 px-6 py-3 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-ink-faint sm:grid">
                <span>Course</span>
                <span>The coastal menu</span>
              </div>
              <dl className="divide-y divide-green/15">
                {TABLE.map((item) => (
                  <div key={item.title} className="grid gap-3 p-6 sm:grid-cols-[7rem_1fr]">
                    <dt><Pill tone={item.tone}>{item.pill}</Pill></dt>
                    <dd>
                      <h3 className="text-lg font-semibold text-ink">{item.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.body}</p>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <div className="lg:col-span-5 lg:pt-4">
            <BusinessDirectory businesses={businesses} />
          </div>
        </div>
        <SymbolDivider name="crab" className="mt-14" />
        <p className="mx-auto mt-5 max-w-xl text-center font-serif text-base italic text-ink-muted">
          Told by the fire. Da yie.
        </p>
      </Section>
    </>
  );
}
