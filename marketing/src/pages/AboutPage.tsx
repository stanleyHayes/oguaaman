import { Link } from "react-router-dom";
import { PageHero } from "@/components/page-hero";
import { CastleScene } from "@/components/scenes";
import { CTA, Container, Eyebrow, Section } from "@/components/ui";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { PORTAL_APP_URL } from "@/config";

const PRINCIPLES = [
  {
    number: "01",
    title: "Memory should stay alive",
    body: "Heritage, festivals, schools, memorials and everyday stories belong in one living record — not scattered across forgotten pages.",
    accent: "border-gold-border/45 text-gold-text",
  },
  {
    number: "02",
    title: "A town platform should be useful",
    body: "Oguaa connects identity to action through local businesses, opportunities, civic goals, announcements and community participation.",
    accent: "border-teal/35 text-teal-text",
  },
  {
    number: "03",
    title: "Distance should not mean disconnection",
    body: "People in Cape Coast, elsewhere in Ghana and across the world should all have a meaningful way to remain part of town life.",
    accent: "border-clay/35 text-clay-text",
  },
] as const;

const STEPS = [
  ["The town contributes", "Residents and the wider Oguaa family add businesses, people, memories, events and opportunities."],
  ["Stewards review", "Curators check public submissions for care, accuracy and community value."],
  ["Everyone benefits", "The approved record becomes searchable, useful and available to people at home and away."],
] as const;

export function Component() {
  return (
    <>
      <PageHero
        scene={CastleScene}
        kicker="About Oguaa"
        title="A town can remember itself — and move forward."
        lede="Oguaa is Cape Coast's digital town square: part living archive, part local guide, and part engine for community action."
      >
        <div className="flex flex-wrap gap-3">
          <CTA href={PORTAL_APP_URL} variant="gold" external>Enter the town square <span aria-hidden>↗</span></CTA>
          <Link to="/contact" className="inline-flex items-center justify-center rounded-full border border-cream/30 px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:border-gold hover:text-gold">
            Work with us
          </Link>
        </div>
      </PageHero>

      <section className="relative overflow-hidden bg-paper py-20 sm:py-28">
        <div className="absolute right-0 top-0 h-72 w-72 translate-x-1/3 -translate-y-1/3 rounded-full border border-gold/20" aria-hidden />
        <Container size="wide" className="relative grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <Reveal>
            <Eyebrow className="text-gold-text">Why Oguaa exists</Eyebrow>
            <p className="mt-6 max-w-sm text-sm font-semibold uppercase leading-relaxed tracking-[0.12em] text-ink-faint">
              Castle. Canopy. Canoe. A platform shaped by the place it serves.
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="max-w-3xl text-4xl font-semibold leading-tight text-ink sm:text-5xl">
              Cape Coast deserves a digital home that feels as layered as the town itself.
            </h2>
            <div className="mt-8 grid gap-6 border-l-2 border-gold pl-6 text-lg leading-relaxed text-ink-muted sm:grid-cols-2 sm:pl-8">
              <p>Its history is global. Its daily life is local. Oguaa holds both without turning the town into a museum.</p>
              <p>The result is a public place to discover, contribute, connect and take part — wherever you are.</p>
            </div>
          </Reveal>
        </Container>
      </section>

      <Section tone="cream" size="wide">
        <div className="grid items-end gap-6 md:grid-cols-[1fr_auto]">
          <Reveal>
            <Eyebrow className="text-green-text">Our design principles</Eyebrow>
            <h2 className="mt-3 max-w-2xl text-4xl font-semibold text-ink sm:text-5xl">Built around how a community actually lives.</h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="max-w-sm text-sm leading-relaxed text-ink-muted">Not another directory. Not an archive behind glass. One civic platform with many ways in.</p>
          </Reveal>
        </div>

        <Stagger className="mt-12 grid gap-4 lg:grid-cols-3">
          {PRINCIPLES.map((principle, index) => (
            <StaggerItem key={principle.number} index={index}>
              <article className={`h-full border-t-2 bg-paper p-6 shadow-[var(--shadow-card)] sm:p-8 ${principle.accent}`}>
                <span className="font-mono text-xs font-semibold tracking-[0.18em]">{principle.number}</span>
                <h3 className="mt-12 text-2xl font-semibold text-ink">{principle.title}</h3>
                <p className="mt-4 leading-relaxed text-ink-muted">{principle.body}</p>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <Section tone="deep" size="wide" className="relative overflow-hidden">
        <div className="bg-dotgrid absolute inset-0 opacity-20" aria-hidden />
        <div className="relative grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
          <Reveal>
            <Eyebrow className="text-gold">How it works</Eyebrow>
            <h2 className="mt-3 text-4xl font-semibold text-cream sm:text-5xl">One record, cared for together.</h2>
            <p className="mt-5 max-w-md leading-relaxed text-cream/72">Community knowledge is strongest when contribution is easy and stewardship is visible.</p>
          </Reveal>
          <Stagger as="ol" className="divide-y divide-cream/15 border-y border-cream/15">
            {STEPS.map(([title, body], index) => (
              <StaggerItem as="li" key={title} index={index} className="grid gap-3 py-6 sm:grid-cols-[3rem_1fr] sm:gap-5">
                <span className="font-mono text-xs font-semibold text-gold">0{index + 1}</span>
                <div>
                  <h3 className="text-xl font-semibold text-cream">{title}</h3>
                  <p className="mt-2 max-w-xl leading-relaxed text-cream/70">{body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </Section>

      <Section tone="sand" size="wide">
        <Reveal className="grid gap-8 rounded-[var(--radius-card)] border border-green/15 bg-paper p-7 shadow-[var(--shadow-card)] sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <Eyebrow className="text-clay-text">The people behind the platform</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">Built with care for Cape Coast.</h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-ink-muted">
              Product direction and engineering are led by{" "}
              <a href="https://www.stanleyhayford.com/" target="_blank" rel="noopener noreferrer" className="font-semibold text-green-text underline decoration-green/30 underline-offset-4 hover:decoration-green">
                Stanley Asoku Hayford
              </a>. We welcome collaborators, institutions and people carrying verified pieces of the town's story.
            </p>
          </div>
          <Link to="/contact" className="inline-flex w-fit items-center justify-center rounded-full bg-green px-6 py-3 text-sm font-semibold text-cream on-dark-pin transition-colors hover:bg-green-900">
            Start a conversation <span className="ml-2" aria-hidden>→</span>
          </Link>
        </Reveal>
      </Section>
    </>
  );
}
