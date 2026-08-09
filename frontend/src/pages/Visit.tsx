import { Link } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, Eyebrow } from "@/components/ui";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { cldCover } from "@/lib/cloudinary";
import { VISIT_BLURB } from "@/lib/content";
import { VISIT_STOPS, type VisitStop } from "@/lib/visit-data";

function StopCard({ stop, index }: Readonly<{ stop: VisitStop; index: number }>) {
  const featured = index === 0;
  return (
    <Link to={`/visit/${stop.slug}`} className={`group relative isolate block overflow-hidden bg-green-900 ${featured ? "min-h-[32rem] rounded-[1.75rem] lg:row-span-2" : "min-h-72 rounded-[1.25rem]"}`}>
      <img src={cldCover(stop.image, featured ? 900 : 600)} alt={stop.alt} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
      <div className="absolute inset-0 bg-gradient-to-t from-green-900 via-green-900/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-6 text-cream sm:p-8">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-gold">{stop.category}</p>
        <h2 className={`mt-3 font-semibold leading-tight text-cream ${featured ? "text-4xl" : "text-2xl"}`}>{stop.name}</h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-cream/75">{stop.summary}</p>
        <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold transition-[gap] group-hover:gap-3">Plan this stop <span aria-hidden>→</span></span>
      </div>
    </Link>
  );
}

export function Component() {
  usePageTitle("Visit Oguaa");
  return (
    <>
      <PageHero tone="teal" kicker="The coast is calling" title="Come to Oguaa. Stay awhile." symbol="crab" image="/uploads/seed/town-view.jpg" lede="A thoughtful guide to the Castle, the canopy, the working coast and the food that Cape Coast eats every day.">
        <div className="flex flex-wrap gap-3"><Cta to="#essentials" variant="gold">Explore the essentials</Cta><Cta to="/map" variant="outline-dark">Open the city map</Cta></div>
      </PageHero>

      <section className="border-b border-sand bg-paper py-16 sm:py-24">
        <Container className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
          <Reveal><Eyebrow className="text-teal-text">Travel with context</Eyebrow><p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-faint">Oguaa is a living city, not a collection of attractions. Move slowly, ask before photographing people and leave space for what the history asks of you.</p></Reveal>
          <Reveal delay={0.08}><p className="max-w-[44rem] text-2xl font-medium leading-[1.35] tracking-[-0.015em] text-ink sm:text-3xl">{VISIT_BLURB}</p></Reveal>
        </Container>
      </section>

      <section id="essentials" className="scroll-mt-24 bg-cream py-16 sm:py-24">
        <Container size="wide">
          <Reveal className="max-w-2xl"><Eyebrow className="text-gold-text">Four ways into the city</Eyebrow><h2 className="mt-4 text-4xl font-semibold sm:text-5xl">Start with the essentials</h2><p className="mt-5 text-lg leading-relaxed text-ink-muted">Each guide includes timing, local context and practical notes for planning the stop well.</p></Reveal>
          <Stagger className="mt-12 grid gap-5 lg:grid-cols-[1.18fr_0.82fr]">
            {VISIT_STOPS.map((stop, index) => <StaggerItem key={stop.slug}><StopCard stop={stop} index={index} /></StaggerItem>)}
          </Stagger>
        </Container>
      </section>

      <section className="bg-teal py-14 text-cream">
        <Container className="grid gap-7 sm:grid-cols-[1fr_auto] sm:items-center">
          <Reveal><Eyebrow className="text-cream/70">Time the journey</Eyebrow><h2 className="mt-3 text-3xl font-semibold text-cream">September belongs to Fetu Afahye</h2><p className="mt-3 max-w-2xl text-cream/75">The city shifts into festival rhythm: processions, regalia, Asafo companies and the grand durbar.</p></Reveal>
          <Link to="/culture" className="w-fit border-b border-gold pb-1 font-semibold text-gold">Understand the festival →</Link>
        </Container>
      </section>
    </>
  );
}
