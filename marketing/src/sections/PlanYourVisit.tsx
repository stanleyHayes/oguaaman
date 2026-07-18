import { useState } from "react";
import { Link } from "react-router-dom";
import { Section, SectionHeading, Pill } from "@/components/ui";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { mediaUrl } from "@/lib/media";

/**
 * The practical travel desk for /visit. Fees and hours are intentionally
 * qualified because they change; remembrance sites are never sold as spectacle.
 */

type Tone = "neutral" | "green" | "gold" | "clay" | "teal";

interface Fact {
  label: string;
  value: string;
}
interface SiteGuide {
  slug: string;
  pill: string;
  tone: Tone;
  title: string;
  facts: Fact[];
  note?: string;
}

const SITES: SiteGuide[] = [
  {
    slug: "cape-coast-castle",
    pill: "The reason you came",
    tone: "gold",
    title: "Cape Coast Castle",
    facts: [
      { label: "Open", value: "Daily, 9:00–16:30" },
      { label: "Tour", value: "~45 min — dungeons, condemned cell, the Door of No Return. Allow 2–3 hours." },
      { label: "Fees", value: "Ghanaian adult GHS 5 · foreign adult GHS 40 · foreign student GHS 30 (reviewed 2023 — confirm on arrival). Cash or mobile money." },
    ],
    note: "The guides do not soften it. Held soberly.",
  },
  {
    slug: "kakum-national-park",
    pill: "40 metres up",
    tone: "green",
    title: "Kakum National Park",
    facts: [
      { label: "Distance", value: "~33 km / 35–45 min north, near Abrafo" },
      { label: "Canopy walk", value: "7 rope bridges, ~40 m above the forest, ~350 m long. Opened 1995." },
      { label: "Go early", value: "First walks around 8:00; gates from ~6:00, closing mid-afternoon." },
      { label: "Fees", value: "Foreigners ≈ GHS 35 gate + ~GHS 100 canopy walk; Ghanaians much less (estimate — confirm at the gate)." },
    ],
  },
  {
    slug: "elmina-castle",
    pill: "Built 1482",
    tone: "gold",
    title: "Elmina Castle (St. George's)",
    facts: [
      { label: "Distance", value: "~12–13 km / 15–20 min west" },
      { label: "Open", value: "Daily, 9:00–16:30" },
      { label: "Why", value: "The oldest surviving European building in sub-Saharan Africa, by most accounts." },
    ],
    note: "A second castle in one day is heavy. Many visitors split the two.",
  },
  {
    slug: "assin-manso-slave-river",
    pill: "The last bath",
    tone: "clay",
    title: "Assin Manso Slave River",
    facts: [
      { label: "Distance", value: "~40 km north, on the Kumasi road" },
      { label: "Donkor Nsuo", value: "Where the captured took their last bath on home soil before the march to the coast." },
      { label: "The garden", value: "The Reverential Garden, and the wall where the diaspora writes its names." },
    ],
    note: "Walked barefoot, in silence. Held soberly.",
  },
];

interface TextCard {
  title: string;
  body: string;
}

const ROAD: TextCard[] = [
  { title: "From Accra", body: "About 140–152 km on the N1 coast road — roughly 2.5 to 3 hours, longer in weekend traffic through Kasoa and Mankessim. (Ignore the sub-90-minute figures online; that is open-road maths.)" },
  { title: "One full day", body: "Cape Coast Castle in the morning and Kakum in the afternoon pair comfortably. Stop at Hans Cottage Botel, ~15 km out on the Kakum road, for lunch over the crocodile lake." },
  { title: "In town", body: "Climb Dawson's Hill to Fort William's lighthouse for all of Oguaa below — roofs, lagoon, boats coming in. Then lose an hour in Kotokuraba, the crab market, where the town actually lives." },
  { title: "The beaches", body: "Brenu Akyinim and Anomabo for calm water and quiet sand. Anomabo keeps its own fort, raised in 1753, a short way up the coast." },
];

interface WhenCard {
  pill: string;
  tone: Tone;
  meta: string;
  dateTime: string;
  title: string;
  body: string;
}

const WHEN: WhenCard[] = [
  { pill: "If you can, this", tone: "gold", meta: "First Saturday of September (2026: 5 Sep)", dateTime: "2026-09-05", title: "Fetu Afahye", body: "The chiefs carried high in palanquins, the seven Asafo companies, the whole town in the streets." },
  { pill: "Homecoming", tone: "clay", meta: "1 August, annually", dateTime: "2026-08-01", title: "Emancipation Day", body: "The diaspora walks back through the Door of Return at the Castle and Assin Manso. Held soberly." },
  { pill: "Note", tone: "teal", meta: "Next edition 2027 (biennial)", dateTime: "2027", title: "PANAFEST", body: "No PANAFEST in 2026 — only the annual Emancipation observance. The festival returns in 2027." },
];

type StayId = "day" | "weekend" | "slow";

interface Stay {
  id: StayId;
  tab: string;
  meta: string;
  title: string;
  intro: string;
  stops: ReadonlyArray<{ marker: string; title: string; body: string }>;
}

const STAYS: ReadonlyArray<Stay> = [
  {
    id: "day",
    tab: "One day",
    meta: "The essential crossing",
    title: "Castle first. Canopy after lunch.",
    intro: "A full day is possible if you arrive rested, begin when the Castle opens and keep the road north unhurried.",
    stops: [
      { marker: "09:00", title: "Cape Coast Castle", body: "Take the guided tour and leave space afterwards. This is not a quick photo stop." },
      { marker: "12:15", title: "Road north", body: "Lunch near Hans Cottage, then continue toward Abrafo." },
      { marker: "14:00", title: "Kakum canopy", body: "Walk above the forest before the park's mid-afternoon close." },
    ],
  },
  {
    id: "weekend",
    tab: "Two days",
    meta: "Our recommended stay",
    title: "Give the town a day of its own.",
    intro: "The better rhythm: history and town life on day one, then forest, lagoon and lighthouse on day two.",
    stops: [
      { marker: "Day 01", title: "Castle → market → shore", body: "Begin at the Castle, walk into Kotokuraba, then meet the fishing fleet at Bakaano." },
      { marker: "Day 02", title: "Kakum at first light", body: "Beat the heat on the canopy walk and return through the lagoon side of town." },
      { marker: "Sunset", title: "Fort William view", body: "Finish above Dawson's Hill with Oguaa, the Castle and the Atlantic below." },
    ],
  },
  {
    id: "slow",
    tab: "Three days",
    meta: "For the wider coast",
    title: "Let remembrance have its own time.",
    intro: "Add Elmina or Assin Manso without squeezing two emotionally heavy sites into the same afternoon.",
    stops: [
      { marker: "Day 01", title: "Cape Coast in full", body: "Castle, market, lagoon and the working shore." },
      { marker: "Day 02", title: "Forest and the hills", body: "Kakum early, Hans Cottage, then Fort William at the end of the day." },
      { marker: "Day 03", title: "Elmina or Assin Manso", body: "Choose one remembrance journey and take it slowly." },
    ],
  },
];

function StayPlanner() {
  const [activeId, setActiveId] = useState<StayId>("weekend");
  const active = STAYS.find((stay) => stay.id === activeId) ?? STAYS[1];

  return (
    <div className="mt-12 grid min-w-0 gap-8 lg:grid-cols-12 lg:items-stretch">
      <div className="min-w-0 lg:col-span-7">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a suggested trip length">
          {STAYS.map((stay) => {
            const selected = stay.id === active.id;
            return (
              <button
                key={stay.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setActiveId(stay.id)}
                className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${selected ? "border-gold bg-gold text-green-900" : "border-cream/20 bg-cream/[0.05] text-cream hover:border-gold/60 hover:bg-cream/10"}`}
              >
                {stay.tab}
              </button>
            );
          })}
        </div>

        <div id="visit-itinerary" aria-live="polite" className="mt-6 rounded-[1.5rem] border border-cream/15 bg-cream/[0.06] p-6 sm:p-8">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-gold">{active.meta}</p>
          <h3 className="mt-3 text-2xl font-semibold text-cream sm:text-3xl">{active.title}</h3>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-cream/70">{active.intro}</p>
          <ol className="relative mt-8 space-y-0 before:absolute before:bottom-3 before:left-[0.42rem] before:top-3 before:w-px before:bg-gold/30">
            {active.stops.map((stop) => (
              <li key={`${active.id}-${stop.marker}`} className="relative grid grid-cols-[1rem_5.5rem_1fr] gap-3 pb-7 last:pb-0 sm:grid-cols-[1rem_6.5rem_1fr] sm:gap-5">
                <span className="relative z-[1] mt-1 size-3.5 rounded-full border-2 border-gold bg-green-900" aria-hidden />
                <span className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-gold">{stop.marker}</span>
                <span>
                  <span className="block font-semibold text-cream">{stop.title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-cream/65">{stop.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <figure className="group relative min-h-[24rem] overflow-hidden rounded-[1.5rem] bg-green lg:col-span-5">
        <div className="absolute inset-0 bg-contours opacity-30" aria-hidden />
        <img
          src={mediaUrl("/uploads/seed/town-view.jpg")}
          alt="A broad view across Cape Coast toward the Atlantic"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover transition-transform duration-700 motion-safe:group-hover:scale-[1.025]"
          onError={(event) => { event.currentTarget.style.display = "none"; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-green-900 via-green-900/10 to-transparent" aria-hidden />
        <figcaption className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.17em] text-gold">One town, many elevations</p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-cream/80">The old town is walkable. The forest and the wider coast are a short taxi or drive away.</p>
        </figcaption>
      </figure>
    </div>
  );
}

function EssentialGuides() {
  return (
    <Section tone="paper" size="wide">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-4">
          <SectionHeading
            kicker="THE ESSENTIAL DESK"
            title="Hours, distance and a little honesty."
            lede="The numbers most visitors look for, with the caveats they deserve. Fees and hours move; confirm them when you arrive."
          />
        </div>

        <div className="overflow-hidden rounded-[1.5rem] border border-green/15 bg-cream/65 lg:col-span-8">
          {SITES.map((site, index) => (
            <article key={site.slug} className={`grid gap-6 p-6 sm:p-8 ${index < SITES.length - 1 ? "border-b border-green/15" : ""} md:grid-cols-[12rem_1fr]`}>
              <div>
                <Pill tone={site.tone}>{site.pill}</Pill>
                <h3 className="mt-4 text-xl font-semibold text-ink">{site.title}</h3>
                <Link to={`/visit/${site.slug}`} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-green hover:text-green-900">
                  Full guide <span className="ml-1" aria-hidden>→</span>
                </Link>
              </div>
              <div>
                <dl className="space-y-4">
                  {site.facts.map((fact) => (
                    <div key={fact.label} className="grid gap-1 sm:grid-cols-[7rem_1fr] sm:gap-4">
                      <dt className="font-mono text-[0.62rem] uppercase tracking-[0.13em] text-gold-text">{fact.label}</dt>
                      <dd className="text-sm leading-relaxed text-ink-muted">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
                {site.note && <p className="mt-5 border-l-2 border-clay/50 pl-4 text-sm italic leading-relaxed text-ink-muted">{site.note}</p>}
              </div>
            </article>
          ))}
        </div>
      </div>
    </Section>
  );
}

function ArrivalGuide() {
  return (
    <Section id="arrival" tone="cream" size="wide" className="scroll-mt-24">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <SectionHeading
            kicker="THE ROAD IN"
            title="Accra fades. The Atlantic stays beside you."
            lede="The N1 brings you west through Kasoa and Mankessim. Once in Oguaa, slow the pace — the best parts of town reveal themselves on foot."
          />

          <Reveal className="on-dark-pin mt-9 overflow-hidden rounded-[1.5rem] border border-green/15 bg-green-900 p-6 text-cream shadow-[var(--shadow-card)] sm:p-8">
            <div className="flex items-center justify-between gap-4 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-gold">
              <span>Accra</span><span>Cape Coast</span>
            </div>
            <div className="relative my-6 h-px bg-cream/20">
              <span className="absolute -top-1 left-0 size-2.5 rounded-full bg-gold" />
              <span className="absolute -top-1 right-0 size-2.5 rounded-full bg-gold" />
              <span className="absolute left-[58%] top-1/2 -translate-y-1/2 rounded-full border border-cream/15 bg-green-900 px-3 py-1 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-cream/70">N1 coast road</span>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div><strong className="block text-3xl font-semibold text-cream">140–152</strong><span className="text-xs text-cream/55">kilometres</span></div>
              <div><strong className="block text-3xl font-semibold text-cream">2½–3</strong><span className="text-xs text-cream/55">hours, traffic willing</span></div>
            </div>
          </Reveal>
        </div>

        <ol className="border-t border-green/20 lg:col-span-7">
          {ROAD.map((note, index) => (
            <li key={note.title} className="grid gap-4 border-b border-green/20 py-7 sm:grid-cols-[3rem_10rem_1fr] sm:gap-6">
              <span className="font-mono text-2xl text-green/25" aria-hidden>{String(index + 1).padStart(2, "0")}</span>
              <h3 className="font-semibold text-ink">{note.title}</h3>
              <p className="text-sm leading-relaxed text-ink-muted">{note.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

function VisitCalendar() {
  return (
    <Section id="calendar" tone="sand" size="wide" className="scroll-mt-24">
      <div className="grid min-w-0 gap-10 lg:grid-cols-12 lg:gap-14">
        <figure className="on-dark-pin group relative min-h-[24rem] overflow-hidden rounded-[1.5rem] bg-green-900 lg:col-span-5">
          <div className="absolute inset-0 bg-contours opacity-30" aria-hidden />
          <img
            src={mediaUrl("/uploads/seed/fetu-procession.jpg")}
            alt="Fetu Afahye procession moving through Cape Coast"
            loading="lazy"
            decoding="async"
            className="absolute inset-0 size-full object-cover transition-transform duration-700 motion-safe:group-hover:scale-[1.025]"
            onError={(event) => { event.currentTarget.style.display = "none"; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-green-900 via-transparent to-transparent" aria-hidden />
          <figcaption className="absolute inset-x-0 bottom-0 p-6 text-sm text-cream/75 sm:p-8">
            <span className="block font-mono text-[0.62rem] uppercase tracking-[0.17em] text-gold">The whole town outside</span>
            <span className="mt-2 block">Fetu Afahye's grand procession, Cape Coast.</span>
          </figcaption>
        </figure>

        <div className="min-w-0 lg:col-span-7">
          <SectionHeading
            kicker="THE CALENDAR"
            title="Come in September, if you can."
            lede="Oguaa is worth a visit any week of the year — but festival season changes the sound, colour and pace of every street."
          />
          <Stagger as="ol" className="mt-9 divide-y divide-green/15 border-y border-green/15">
            {WHEN.map((event, index) => (
              <StaggerItem as="li" key={event.title} index={index} className="grid gap-4 py-6 sm:grid-cols-[8.5rem_1fr] sm:gap-6">
                <div>
                  <Pill tone={event.tone}>{event.pill}</Pill>
                  <time dateTime={event.dateTime} className="mt-3 block font-mono text-[0.6rem] uppercase tracking-[0.13em] text-gold-text">{event.meta}</time>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-ink">{event.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{event.body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
          <Link to="/festivals" className="mt-8 inline-flex min-h-11 items-center rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-green-900">
            Open the festival almanac <span className="ml-2" aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </Section>
  );
}

export function PlanYourVisit() {
  return (
    <>
      <Section id="plan" tone="deep" size="wide" className="relative scroll-mt-24 overflow-hidden">
        <span className="pointer-events-none absolute inset-0 bg-contours opacity-[0.13]" aria-hidden />
        <div className="relative">
          <SectionHeading
            onDark
            kicker="BUILD YOUR STAY"
            title="One coast. Three good rhythms."
            lede="Choose the amount of time you have. We will help the days breathe — especially the places of remembrance."
          />
          <StayPlanner />
        </div>
      </Section>
      <EssentialGuides />
      <ArrivalGuide />
      <VisitCalendar />
    </>
  );
}
