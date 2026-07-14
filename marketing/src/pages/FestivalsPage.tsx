import type { ReactNode } from "react";
import { PageHero } from "@/components/page-hero";
import { DurbarScene } from "@/components/scenes";
import { Section, SectionHeading, Card, Pill, CTA as Cta } from "@/components/ui";
import { SymbolDivider } from "@/components/adinkra";
import { LiveCollection } from "@/components/live-collection";
import { ARTISTS_FALLBACK, BUSINESSES_FALLBACK } from "@/lib/fallbacks";
import { PORTAL_APP_URL } from "@/config";

type Tone = "neutral" | "green" | "gold" | "clay" | "teal";

interface Item {
  pill: string;
  tone: Tone;
  meta?: string;
  title: string;
  body: ReactNode;
}

/** A card carrying a festival, a rite or a dish — pill, optional meta, title, body. */
function ItemCard({ item, dark = false }: Readonly<{ item: Item; dark?: boolean }>) {
  return (
    <Card className="flex h-full flex-col p-6 sm:p-7">
      <Pill tone={dark ? "on-dark" : item.tone} className="self-start">
        {item.pill}
      </Pill>
      <h3 className={`mt-4 font-display text-xl font-semibold ${dark ? "text-cream" : "text-ink"}`}>{item.title}</h3>
      {item.meta && (
        <p className="mt-1 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-gold-text">{item.meta}</p>
      )}
      <p className={`mt-2 text-sm leading-relaxed ${dark ? "text-cream/75" : "text-ink-muted"}`}>{item.body}</p>
    </Card>
  );
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

export function Component() {
  return (
    <>
      <PageHero
        scene={DurbarScene}
        kicker="Festivals & the calendar"
        title="When Oguaa stops to remember."
        lede="A town that goes silent for a week, then erupts — seven Asafo companies, palanquins, musketry and the durbar at Victoria Park. And a coast that keeps the diaspora's homecoming, soberly, every year."
      />

      {/* Fetu Afahye — the anchor */}
      <Section tone="paper" size="wide">
        <SectionHeading
          kicker="THE GREAT FESTIVAL"
          title="Fetu Afahye — clearing the dirt."
          lede="On the first Saturday of September, Cape Coast gives thanks to the seventy-seven gods of the Oguaa Traditional Area. The name comes from efin tu — “clearing away the filth” — for a sickness that walked the town in the seventeenth century and stopped when the people called on the gods. In 2026, that Saturday is the 5th of September."
        />
        <p className="mt-8 max-w-3xl font-serif text-lg leading-relaxed text-ink">
          For a week before the durbar, the town goes quiet. No drumming after dark. No fishing in the Fosu
          Lagoon. The Omanhen is shut away to seek wisdom from the ancestors, then comes out to pour the
          libation that opens the festival. The silence breaks — and the seven Asafo companies pour into the
          streets with their flags, their drums and their musketry, while the chiefs come up to Victoria Park
          in palanquins under turning umbrellas, each one with his okyeame walking ahead, staff in hand.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FETU.map((i) => <ItemCard key={i.title} item={i} />)}
        </div>
      </Section>

      {/* The regalia & the rite */}
      <Section tone="cream" size="wide">
        <SectionHeading
          kicker="HOW A CHIEF SPEAKS"
          title="Palanquin, staff and drum."
          lede="Nothing at a durbar is accidental. Every object carries a word."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {RITE.map((i) => <ItemCard key={i.title} item={i} />)}
        </div>
      </Section>

      {/* The wider calendar */}
      <Section tone="paper" size="wide">
        <SectionHeading
          kicker="ALONG THIS COAST"
          title="Oguaa is not the only fire."
          lede="One short stretch of the Central Region coast keeps more festivals than most countries. Within an afternoon's drive of the Castle, the calendar turns all year."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {CALENDAR.map((i) => <ItemCard key={i.title} item={i} />)}
        </div>
      </Section>

      {/* The Oguaa Sound — dark band */}
      <Section tone="deep" size="wide" className="relative overflow-hidden">
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-contours opacity-[0.06]" />
        <div className="relative">
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
      </Section>

      <LiveCollection
        kicker="CARRYING THE SOUND"
        title="The artists of Oguaa today."
        lede="The voices keeping the coast's sound alive — gospel highlife and palm-wine, hiplife and drill, brass and Asafo fusion. Straight from the app."
        endpoint="/api/artists"
        fallback={ARTISTS_FALLBACK}
        cta={{ href: `${PORTAL_APP_URL}/music`, label: "Browse every artist", external: true }}
      />

      {/* The coastal table */}
      <Section tone="sand" size="wide">
        <SectionHeading
          kicker="COME HUNGRY"
          title="What the sea sets down."
          lede="The taste of the coast: fermented corn, palm oil, and fish that was in the Atlantic this morning."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {TABLE.map((i) => <ItemCard key={i.title} item={i} />)}
        </div>
        <SymbolDivider name="crab" className="mt-14" />
        <p className="mx-auto mt-5 max-w-xl text-center font-serif text-base italic text-ink-muted">
          Told by the fire. Da yie.
        </p>
      </Section>

      <LiveCollection
        tone="cream"
        kicker="WHERE THE TOWN EATS & STAYS"
        title="Tables, kitchens and a bed by the Castle."
        lede="Family kitchens, market fishmongers and a guesthouse within a walk of the Door of No Return — listed by the community."
        endpoint="/api/businesses"
        fallback={BUSINESSES_FALLBACK}
        cta={{ href: `${PORTAL_APP_URL}/business`, label: "See every shop & stay", external: true }}
      />
    </>
  );
}
