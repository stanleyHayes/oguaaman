import { Link } from "react-router-dom";
import { PageHero } from "@/components/page-hero";
import { CastleScene } from "@/components/scenes";
import { CTA, Section, SectionHeading } from "@/components/ui";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { PORTAL_APP_URL } from "@/config";

const PILLARS = [
  {
    title: "A living memory of Cape Coast",
    body: "From heritage and festivals to memorials and schools, Oguaa keeps one searchable, curated archive of who we are.",
  },
  {
    title: "A practical town platform",
    body: "Beyond storytelling, Oguaa supports civic goals, town announcements, opportunities, and everyday community action.",
  },
  {
    title: "Built for home and diaspora",
    body: "Whether you are in Cape Coast, elsewhere in Ghana, or abroad, Oguaa keeps your connection to town alive and useful.",
  },
  {
    title: "Stewarded with care",
    body: "Submissions are reviewed by curators so the record remains respectful, factual, and worthy of the people it represents.",
  },
] as const;

export function Component() {
  return (
    <>
      <PageHero
        scene={CastleScene}
        kicker="About Oguaa"
        title="The community home of Cape Coast."
        lede="Oguaa is building a digital town square for Cape Coast: a place to preserve memory, celebrate identity, and move community life forward."
      >
        <div className="flex flex-wrap gap-3">
          <CTA href={PORTAL_APP_URL} variant="gold" external>Open the app</CTA>
          <Link to="/contact" className="inline-flex items-center justify-center rounded-full border border-cream/30 px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:border-gold hover:text-gold">
            Contact us
          </Link>
        </div>
      </PageHero>

      <Section tone="paper">
        <SectionHeading
          kicker="What we are building"
          title="One engine, many stories, one town."
          lede="Oguaa brings people, culture, education, heritage, remembrance, and civic participation into one coherent platform designed around Cape Coast's identity."
        />
        <Stagger className="mt-10 grid gap-5 md:grid-cols-2">
          {PILLARS.map((pillar, index) => (
            <StaggerItem key={pillar.title} index={index}>
              <article className="og-card og-card-accent-gold h-full p-6">
                <h3 className="font-display text-xl font-semibold text-ink">{pillar.title}</h3>
                <p className="mt-3 leading-relaxed text-ink-muted">{pillar.body}</p>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <Section tone="sand" size="prose">
        <Reveal>
          <h2 className="text-3xl font-semibold text-ink sm:text-4xl">The team behind it</h2>
          <p className="mt-4 leading-relaxed text-ink-muted">
            Oguaa is designed and engineered by people who care deeply about Cape Coast and its future.
            The product direction and technical build are led by{" "}
            <a
              href="https://www.stanleyhayford.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-green-text underline decoration-green/30 underline-offset-4 hover:decoration-green"
            >
              Stanley Asoku Hayford
            </a>
            , a software engineer focused on scalable systems and modern web products.
          </p>
          <p className="mt-4 leading-relaxed text-ink-muted">
            Want to collaborate, support an initiative, or contribute a verified piece of local history?
            We would love to hear from you.
          </p>
          <div className="mt-7">
            <Link
              to="/contact"
              className="inline-flex items-center justify-center rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream on-dark-pin transition-colors hover:bg-green-900"
            >
              Get in touch
            </Link>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
