import { Link } from "react-router-dom";
import { PageHero } from "@/components/page-hero";
import { LighthouseScene } from "@/components/scenes";
import { CTA, Section, SectionHeading } from "@/components/ui";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { CONTACT_EMAIL, PORTAL_APP_URL } from "@/config";

const CONTACT_CARDS = [
  {
    title: "General enquiries",
    body: "Questions about Oguaa, partnerships, or support.",
    ctaLabel: CONTACT_EMAIL,
    href: `mailto:${CONTACT_EMAIL}`,
    external: true,
  },
  {
    title: "Use the app",
    body: "Sign in, contribute stories, submit updates, and join the community.",
    ctaLabel: "Open the web app",
    href: PORTAL_APP_URL,
    external: true,
  },
  {
    title: "Content corrections",
    body: "Found a factual error in history, heritage, or memorial records? Tell us so we can correct it.",
    ctaLabel: "Write to stewards",
    href: `mailto:${CONTACT_EMAIL}?subject=Oguaa%20content%20correction`,
    external: true,
  },
  {
    title: "Developer",
    body: "For product and engineering conversations, contact the developer directly.",
    ctaLabel: "stanleyhayford.com",
    href: "https://www.stanleyhayford.com/",
    external: true,
  },
] as const;

export function Component() {
  return (
    <>
      <PageHero
        scene={LighthouseScene}
        kicker="Contact"
        title="Reach the Oguaa team."
        lede="Whether you are sharing feedback, asking a question, correcting public information, or proposing a collaboration, this is where to start."
      >
        <div className="flex flex-wrap gap-3">
          <CTA href={`mailto:${CONTACT_EMAIL}`} variant="gold" external>Email us</CTA>
          <Link to="/about" className="inline-flex items-center justify-center rounded-full border border-cream/30 px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:border-gold hover:text-gold">
            About Oguaa
          </Link>
        </div>
      </PageHero>

      <Section tone="paper">
        <SectionHeading
          kicker="Connect"
          title="Pick the fastest path."
          lede="Use the route that matches your need and we will handle it from there."
        />
        <Stagger className="mt-10 grid gap-5 md:grid-cols-2">
          {CONTACT_CARDS.map((card, index) => (
            <StaggerItem key={card.title} index={index}>
              <article className="og-card og-card-accent-teal h-full p-6">
                <h3 className="font-display text-xl font-semibold text-ink">{card.title}</h3>
                <p className="mt-3 leading-relaxed text-ink-muted">{card.body}</p>
                <a
                  href={card.href}
                  target={card.external ? "_blank" : undefined}
                  rel={card.external ? "noopener noreferrer" : undefined}
                  className="mt-5 inline-flex items-center justify-center rounded-full border border-green/35 px-4 py-1.5 text-sm font-semibold text-green-text transition-colors hover:border-green"
                >
                  {card.ctaLabel}
                </a>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <Section tone="sand" size="prose">
        <Reveal>
          <h2 className="text-3xl font-semibold text-ink sm:text-4xl">Response and stewardship</h2>
          <p className="mt-4 leading-relaxed text-ink-muted">
            Oguaa is a living civic and cultural record. We treat messages about factual corrections,
            memorial sensitivity, and community safety as priority items.
          </p>
          <p className="mt-4 leading-relaxed text-ink-muted">
            If your issue is urgent or affects public safety, include clear details in your message so
            the right steward can act quickly.
          </p>
        </Reveal>
      </Section>
    </>
  );
}
