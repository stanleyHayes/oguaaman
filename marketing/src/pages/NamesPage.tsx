import { Link } from "react-router-dom";
import { PageHero } from "@/components/page-hero";
import { MarketScene } from "@/components/scenes";
import { CTA, Container, Eyebrow, Section } from "@/components/ui";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { StructuredData } from "@/components/structured-data";
import { faqGraph } from "@/seo/site";
import { PORTAL_APP_URL } from "@/config";

/**
 * "The names of Cape Coast" — the page that answers the alias searches.
 *
 * People look for this town under a dozen names, and a name is the most common
 * way someone arrives here: "what does Oguaa mean", "why is Cape Coast called
 * Obama City", "ancient capital of Ghana". Structured data can declare the
 * aliases (see seo/site.ts) but only real prose can answer the question, so
 * each name below gets its origin, its meaning and an honest note on who
 * actually uses it — including where the record is thin.
 */

const NAMES = [
  {
    name: "Oguaa",
    gloss: "the market",
    era: "Fante · the town's own name",
    body: "The oldest and truest name. From the Fante gua — market — for the crab-traders' selling-ground that grew, by the sea in front of the great Castle, into a town. Commerce is Cape Coast's birth name. Fante speakers have never stopped using it: on the radio, at the durbar, in the mouths of the Asafo companies and in the title of the town's paramount chief, the Oguaamanhene.",
    accent: "border-gold-border/45 text-gold-text",
  },
  {
    name: "Oguaaman",
    gloss: "the Oguaa state",
    era: "Fante · the traditional polity",
    body: "Oguaa plus ɔman — state, nation, people. Where Oguaa is the town, Oguaaman is the whole traditional state: its stools, its quarters, its Asafo companies and everyone who belongs to them, at home or abroad. It is the name that stretches to include the diaspora, which is why this platform carries it.",
    accent: "border-green/35 text-green-text",
  },
  {
    name: "Kotokuraba",
    gloss: "crab village, or the village of the crab",
    era: "Fante · the market at the heart",
    body: "The name of the great central market, and by extension the beating heart of the town — read either as \"crab hamlet\" or, in the telling most often heard locally, the village of the crab. The crab remains Cape Coast's own emblem: you will find it on the town's seal, and on this site's mark.",
    accent: "border-clay/35 text-clay-text",
  },
  {
    name: "Cabo Corso",
    gloss: "short cape",
    era: "Portuguese · 1471",
    body: "What the Portuguese navigators called this stretch of shore when they sailed past in the fifteenth century. English tongues wore Cabo Corso down into \"Cape Coast\" — so the town's international name is a four-hundred-year-old mispronunciation of a Portuguese description of the coastline.",
    accent: "border-teal/35 text-teal-text",
  },
  {
    name: "Cape Coast",
    gloss: "the name on the map",
    era: "English · the official name",
    body: "The administrative name today: capital of the Central Region, seat of the Cape Coast Metropolitan Assembly, the name on every road sign, passport and school certificate. Most people in the town use Cape Coast and Oguaa interchangeably, choosing by language rather than by meaning.",
    accent: "border-green/35 text-green-text",
  },
  {
    name: "The Ancient Capital",
    gloss: "capital of the Gold Coast, 1821–1877",
    era: "Colonial · the seat of government",
    body: "For fifty-six years Cape Coast was the capital of the British Gold Coast, and the country's centre of law, journalism and constitutional argument, until the seat of government moved to Accra in 1877. The town has been called the ancient capital ever since — it is the reason Cape Coast holds so much of Ghana's early public life in its streets.",
    accent: "border-gold-border/45 text-gold-text",
  },
  {
    name: "The Citadel of Education",
    gloss: "the school town",
    era: "Modern · earned, and defended",
    body: "Ghana's oldest school town: Mfantsipim, Adisadel, Wesley Girls', St. Augustine's, Holy Child and the University of Cape Coast all sit within a few kilometres of one another. Generations of Ghanaian public life were taught here, and the town wears the title with some competitive pride.",
    accent: "border-maroon-900/35 text-maroon-900",
  },
  {
    name: "Obama City",
    gloss: "a popular, informal nickname",
    era: "Contemporary · post-2009",
    body: "An affectionate nickname that circulates locally and online rather than an official title. It is generally traced to the Obama family's 2009 visit to Cape Coast Castle — a moment that put the town on the world's front pages and drew the diaspora's attention to the Door of No Return. You will hear it on social media, on trotro slogans and from young Cape Coasters; you will not find it on a road sign.",
    accent: "border-teal/35 text-teal-text",
  },
] as const;

/** Also feeds FAQPage structured data — keep questions in real search phrasing. */
const FAQS = [
  {
    q: "What does Oguaa mean?",
    a: "Oguaa is the Fante name for Cape Coast, from gua, meaning market. It refers to the crab-traders' selling-ground on the shore that grew into the town. Fante speakers use Oguaa and Cape Coast interchangeably today.",
  },
  {
    q: "What is the difference between Oguaa and Oguaaman?",
    a: "Oguaa is the town. Oguaaman is the Oguaa state — the wider traditional polity of stools, quarters and Asafo companies, and all the people who belong to it, including those living outside Cape Coast.",
  },
  {
    q: "Why is Cape Coast called Obama City?",
    a: "Obama City is a popular informal nickname rather than an official name. It is generally traced to the Obama family's 2009 visit to Cape Coast Castle, which brought worldwide attention to the town and its Door of No Return. It is used locally and online, but appears on no official signage.",
  },
  {
    q: "Why is Cape Coast called the ancient capital of Ghana?",
    a: "Cape Coast was the capital of the British Gold Coast from 1821 until 1877, when the seat of government moved to Accra. Those fifty-six years as the colony's centre of government, law and journalism are why the town is still called the ancient capital.",
  },
  {
    q: "Where does the name Cape Coast come from?",
    a: "From the Portuguese Cabo Corso, meaning short cape, used by navigators who passed the shore in 1471. English speakers gradually reshaped Cabo Corso into Cape Coast.",
  },
  {
    q: "What is Kotokuraba?",
    a: "Kotokuraba is the central market of Cape Coast and the commercial heart of the town. The name is read as crab village, and the crab remains the town's emblem.",
  },
  {
    q: "Why is Cape Coast called the Citadel of Education?",
    a: "Because Ghana's oldest and most established schools — among them Mfantsipim, Adisadel, Wesley Girls', St. Augustine's and Holy Child — and the University of Cape Coast are concentrated in and around the town.",
  },
] as const;

export function Component() {
  return (
    <>
      <StructuredData data={faqGraph(FAQS)} />

      <PageHero
        scene={MarketScene}
        kicker="The names of Cape Coast"
        title="Oguaa. Oguaaman. Obama City. One town, many names."
        lede="Cape Coast answers to a Fante market name, a Portuguese description of the coastline, a colonial title and a nickname born in 2009. Here is where each one came from."
      >
        <div className="flex flex-wrap gap-3">
          <CTA href={PORTAL_APP_URL} variant="gold" external>
            Enter the town square <span aria-hidden>↗</span>
          </CTA>
          <Link
            to="/history"
            className="inline-flex items-center justify-center rounded-full border border-cream/30 px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:border-gold hover:text-gold"
          >
            Read the full history
          </Link>
        </div>
      </PageHero>

      <section className="relative overflow-hidden bg-paper py-20 sm:py-28">
        <Container size="wide" className="relative grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <Reveal>
            <Eyebrow className="text-gold-text">Why a town needs many names</Eyebrow>
            <p className="mt-6 max-w-sm text-sm font-semibold uppercase leading-relaxed tracking-[0.12em] text-ink-faint">
              Each name records who was doing the naming.
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="max-w-3xl text-4xl font-semibold leading-tight text-ink sm:text-5xl">
              A name is a piece of history that survived in everyday speech.
            </h2>
            <div className="mt-8 grid gap-6 border-l-2 border-gold pl-6 text-lg leading-relaxed text-ink-muted sm:grid-cols-2 sm:pl-8">
              <p>
                The traders named it for the market. The Portuguese named it for the shape of the shore. The British named
                it for their capital. The internet named it for a visit.
              </p>
              <p>
                All of them are still in use — so all of them belong in the record, along with an honest note on which are
                official and which are affectionate.
              </p>
            </div>
          </Reveal>
        </Container>
      </section>

      <Section tone="cream" size="wide">
        <div className="grid items-end gap-6 md:grid-cols-[1fr_auto]">
          <Reveal>
            <Eyebrow className="text-green-text">Eight names</Eyebrow>
            <h2 className="mt-3 max-w-2xl text-4xl font-semibold text-ink sm:text-5xl">
              What each name means, and who uses it.
            </h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="max-w-sm text-sm leading-relaxed text-ink-muted">
              Ordered roughly by age — from the market that started it to the nickname the world gave it.
            </p>
          </Reveal>
        </div>

        <Stagger className="mt-12 grid gap-4 lg:grid-cols-2">
          {NAMES.map((entry, index) => (
            <StaggerItem key={entry.name} index={index}>
              <article className={`h-full border-t-2 bg-paper p-6 shadow-[var(--shadow-card)] sm:p-8 ${entry.accent}`}>
                <span className="font-mono text-xs font-semibold tracking-[0.18em]">{entry.era}</span>
                <h3 className="mt-6 text-2xl font-semibold text-ink">{entry.name}</h3>
                <p className="mt-1 text-sm italic text-ink-faint">{entry.gloss}</p>
                <p className="mt-4 leading-relaxed text-ink-muted">{entry.body}</p>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <Section tone="deep" size="wide" className="relative overflow-hidden">
        <div className="bg-dotgrid absolute inset-0 opacity-20" aria-hidden />
        <div className="relative grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
          <Reveal>
            <Eyebrow className="text-gold">Common questions</Eyebrow>
            <h2 className="mt-3 text-4xl font-semibold text-cream sm:text-5xl">Asked and answered.</h2>
            <p className="mt-5 max-w-md leading-relaxed text-cream/72">
              If a detail here is wrong or incomplete, tell us — this record belongs to the town.
            </p>
            <Link
              to="/contact"
              className="mt-7 inline-flex w-fit items-center justify-center rounded-full border border-cream/30 px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:border-gold hover:text-gold"
            >
              Send a correction <span className="ml-2" aria-hidden>→</span>
            </Link>
          </Reveal>
          <Stagger as="dl" className="divide-y divide-cream/15 border-y border-cream/15">
            {FAQS.map((faq, index) => (
              <StaggerItem as="div" key={faq.q} index={index} className="py-6">
                <dt className="text-xl font-semibold text-cream">{faq.q}</dt>
                <dd className="mt-2 max-w-2xl leading-relaxed text-cream/70">{faq.a}</dd>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </Section>

      <Section tone="sand" size="wide">
        <Reveal className="grid gap-8 rounded-[var(--radius-card)] border border-green/15 bg-paper p-7 shadow-[var(--shadow-card)] sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <Eyebrow className="text-clay-text">Keep going</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">
              The names are the doorway. The town is behind them.
            </h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-ink-muted">
              Read how a Fante market became a colonial capital on the{" "}
              <Link to="/history" className="font-semibold text-green-text underline decoration-green/30 underline-offset-4 hover:decoration-green">
                history page
              </Link>
              , meet the seven Asafo companies in{" "}
              <Link to="/culture" className="font-semibold text-green-text underline decoration-green/30 underline-offset-4 hover:decoration-green">
                culture
              </Link>
              , or plan a trip to the Castle and Kakum on{" "}
              <Link to="/visit" className="font-semibold text-green-text underline decoration-green/30 underline-offset-4 hover:decoration-green">
                visit
              </Link>
              .
            </p>
          </div>
          <CTA href={PORTAL_APP_URL} variant="gold" external>
            Open the app <span aria-hidden>↗</span>
          </CTA>
        </Reveal>
      </Section>
    </>
  );
}
