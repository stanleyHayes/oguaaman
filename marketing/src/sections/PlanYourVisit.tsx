import { Section, SectionHeading, Card, Pill } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { Link } from "react-router-dom";

/**
 * "Plan your visit" — the practical block appended to the Visit page. This is
 * the part that actually helps a foreigner come: what each site costs and when
 * it opens, how far it is, how the road from Accra works, and when to time the
 * trip. Hours/fees change, so they are dated and qualified — never stated as
 * fixed truth. The Castle and Assin Manso are held soberly.
 */

type Tone = "neutral" | "green" | "gold" | "clay" | "teal";

interface Fact {
  label: string;
  value: string;
}
interface SiteCard {
  slug: string;
  pill: string;
  tone: Tone;
  title: string;
  facts: Fact[];
  note?: string;
}

const SITES: SiteCard[] = [
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
  title: string;
  body: string;
}

const WHEN: WhenCard[] = [
  { pill: "If you can, this", tone: "gold", meta: "First Saturday of September (2026: 5 Sep)", title: "Fetu Afahye", body: "The chiefs carried high in palanquins, the seven Asafo companies, the whole town in the streets." },
  { pill: "Homecoming", tone: "clay", meta: "1 August, annually", title: "Emancipation Day", body: "The diaspora walks back through the Door of Return at the Castle and Assin Manso. Held soberly." },
  { pill: "Note", tone: "teal", meta: "Next edition 2027 (biennial)", title: "PANAFEST", body: "No PANAFEST in 2026 — only the annual Emancipation observance. The festival returns in 2027." },
];

export function PlanYourVisit() {
  return (
    <>
      {/* Practical fact cards */}
      <Section tone="cream" size="wide" className="pt-10 sm:pt-14">
        <SectionHeading
          kicker="PLAN YOUR VISIT"
          title="What you need to know."
          lede="The practical part. Hours and fees change — confirm on arrival, and carry cash in cedis."
        />
        <Stagger className="mt-12 grid gap-5 sm:grid-cols-2">
          {SITES.map((s, i) => (
            <StaggerItem key={s.title} index={i} className="h-full">
              <Card className="flex h-full flex-col p-6 sm:p-7">
                <Pill tone={s.tone} className="self-start">{s.pill}</Pill>
                <h3 className="mt-4 text-2xl font-semibold text-ink">{s.title}</h3>
                <dl className="mt-4 space-y-2.5">
                  {s.facts.map((f) => (
                    <div key={f.label} className="grid grid-cols-[6.5rem_1fr] gap-3">
                      <dt className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-gold-text">{f.label}</dt>
                      <dd className="text-sm leading-relaxed text-ink-muted">{f.value}</dd>
                    </div>
                  ))}
                </dl>
                {s.note && <p className="mt-4 font-serif text-sm italic text-ink-muted">{s.note}</p>}
                <Link to={`/visit/${s.slug}`} className="mt-auto inline-flex items-center gap-1 border-t border-sand pt-3 text-sm font-semibold text-green transition-colors hover:text-green-900">
                  Full guide & history →
                </Link>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      {/* Getting here & around */}
      <Section tone="paper" size="wide">
        <SectionHeading
          kicker="THE ROAD IN"
          title="Two and a half hours from Accra."
          lede="An easy drive along the coast, and an easy place to get around once you arrive."
        />
        <Stagger className="mt-12 grid gap-5 sm:grid-cols-2">
          {ROAD.map((c, i) => (
            <StaggerItem key={c.title} index={i}>
              <Card className="h-full p-6 sm:p-7">
                <h3 className="text-xl font-semibold text-ink">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{c.body}</p>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      {/* When to come */}
      <Section tone="sand" size="wide">
        <SectionHeading
          kicker="THE CALENDAR"
          title="Come in September, if you can."
          lede="The town is worth a visit any week of the year — but one Saturday turns it into something you will never forget."
        />
        <Stagger className="mt-12 grid gap-5 sm:grid-cols-3">
          {WHEN.map((w, i) => (
            <StaggerItem key={w.title} index={i} className="h-full">
              <Card className="flex h-full flex-col p-6 sm:p-7">
                <Pill tone={w.tone} className="self-start">{w.pill}</Pill>
                <h3 className="mt-4 text-xl font-semibold text-ink">{w.title}</h3>
                <p className="mt-1 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-gold-text">{w.meta}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{w.body}</p>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
        <div className="mt-10 text-center">
          <Link
            to="/festivals"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-green-900"
          >
            See the full festival calendar →
          </Link>
        </div>
      </Section>
    </>
  );
}
