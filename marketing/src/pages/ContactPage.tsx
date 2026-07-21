import { Link } from "react-router-dom";
import { PageHero } from "@/components/page-hero";
import { LighthouseScene } from "@/components/scenes";
import { CTA, Container, Eyebrow, Section } from "@/components/ui";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { CONTACT_EMAIL, PORTAL_APP_URL } from "@/config";

const CONTACT_LANES = [
  {
    number: "01",
    title: "Correct the public record",
    body: "Flag an error in a history, heritage, school or memorial entry. Include the page link and the source of the correction.",
    label: "Send a correction",
    href: `mailto:${CONTACT_EMAIL}?subject=Oguaa%20content%20correction`,
  },
  {
    number: "02",
    title: "Partner with Oguaa",
    body: "Bring an institution, collection, programme or community initiative onto the platform with the right context and stewardship.",
    label: "Discuss a partnership",
    href: `mailto:${CONTACT_EMAIL}?subject=Oguaa%20partnership`,
  },
  {
    number: "03",
    title: "Get product support",
    body: "For sign-in, submissions and account questions, tell us what you were doing and what happened. Screenshots are welcome.",
    label: "Ask for help",
    href: `mailto:${CONTACT_EMAIL}?subject=Oguaa%20product%20support`,
  },
] as const;

export function Component() {
  return (
    <>
      <PageHero
        scene={LighthouseScene}
        kicker="Contact Oguaa"
        title="Every good town square starts with a conversation."
        lede="Share a correction, propose a partnership, ask for help, or simply tell us what Oguaa should do better."
      >
        <div className="flex flex-wrap gap-3">
          <CTA href={`mailto:${CONTACT_EMAIL}`} variant="gold" external>Email the team <span aria-hidden>↗</span></CTA>
          <Link to="/about" className="inline-flex items-center justify-center rounded-full border border-cream/30 px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:border-gold hover:text-gold">Why Oguaa exists</Link>
        </div>
      </PageHero>

      <section className="bg-paper py-20 sm:py-28">
        <Container size="wide" className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <Reveal className="on-dark on-dark-pin relative isolate min-h-[25rem] overflow-hidden rounded-[var(--radius-card)] bg-green-900 p-7 text-cream sm:p-10">
            <div className="bg-dotgrid absolute inset-0 opacity-25" aria-hidden />
            <div className="absolute -bottom-24 -right-20 h-72 w-72 rounded-full border border-gold/25" aria-hidden />
            <div className="relative flex h-full flex-col">
              <Eyebrow className="text-gold">The direct line</Eyebrow>
              <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-tight text-cream sm:text-5xl">Write to a real person.</h2>
              <p className="mt-5 max-w-lg leading-relaxed text-cream/72">No ticket maze. Send the context once and the message will be routed to the right steward.</p>
              <a href={`mailto:${CONTACT_EMAIL}`} className="mt-auto break-all pt-12 text-2xl font-semibold text-gold underline decoration-gold/35 underline-offset-8 transition-colors hover:text-cream sm:text-3xl">
                {CONTACT_EMAIL}
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.08} className="grid gap-5 rounded-[var(--radius-card)] border border-green/15 bg-cream p-7 shadow-[var(--shadow-card)] sm:p-10">
            <div>
              <Eyebrow className="text-teal-text">Before you write</Eyebrow>
              <h2 className="mt-3 text-3xl font-semibold text-ink">A little context goes a long way.</h2>
            </div>
            <ul className="divide-y divide-sand border-y border-sand text-sm leading-relaxed text-ink-muted">
              <li className="grid grid-cols-[1.5rem_1fr] gap-3 py-4"><span className="font-mono text-gold-text">01</span><span>Include the page or feature your message relates to.</span></li>
              <li className="grid grid-cols-[1.5rem_1fr] gap-3 py-4"><span className="font-mono text-gold-text">02</span><span>For corrections, share a reliable source or the right person to verify with.</span></li>
              <li className="grid grid-cols-[1.5rem_1fr] gap-3 py-4"><span className="font-mono text-gold-text">03</span><span>For technical issues, add the device, browser and a screenshot if possible.</span></li>
            </ul>
            <div className="flex flex-wrap gap-3">
              <CTA href={PORTAL_APP_URL} variant="primary" external>Open the community app</CTA>
              <a href="https://www.stanleyhayford.com/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-full border border-green/30 px-5 py-2.5 text-sm font-semibold text-green-text hover:border-green">Product &amp; engineering ↗</a>
            </div>
          </Reveal>
        </Container>
      </section>

      <Section tone="cream" size="wide">
        <Reveal>
          <Eyebrow className="text-green-text">Choose your route</Eyebrow>
          <h2 className="mt-3 max-w-2xl text-4xl font-semibold text-ink sm:text-5xl">Help us understand what you need.</h2>
        </Reveal>
        <Stagger className="mt-12 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-sand bg-sand lg:grid-cols-3">
          {CONTACT_LANES.map((lane, index) => (
            <StaggerItem key={lane.number} index={index}>
              <article className="flex h-full flex-col bg-paper p-7 sm:p-8">
                <span className="font-mono text-xs font-semibold tracking-[0.18em] text-gold-text">{lane.number}</span>
                <h3 className="mt-10 text-2xl font-semibold text-ink">{lane.title}</h3>
                <p className="mt-4 flex-1 leading-relaxed text-ink-muted">{lane.body}</p>
                <a href={lane.href} className="group mt-8 inline-flex items-center justify-between border-t border-sand pt-5 text-sm font-semibold text-green-text">
                  {lane.label} <span className="transition-transform group-hover:translate-x-1" aria-hidden>→</span>
                </a>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </Section>

      <Section tone="sand" size="wide">
        <Reveal className="grid gap-6 border-l-4 border-clay bg-paper p-7 shadow-[var(--shadow-card)] sm:p-9 md:grid-cols-[auto_1fr] md:gap-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-clay/[0.1] text-xl text-clay-text" aria-hidden>!</span>
          <div>
            <Eyebrow className="text-clay-text">Safety and sensitive records</Eyebrow>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Urgent danger belongs with emergency services first.</h2>
            <p className="mt-3 max-w-3xl leading-relaxed text-ink-muted">Oguaa treats messages about community safety, memorial sensitivity and factual corrections with care, but email is not an emergency channel. If someone is in immediate danger, contact the appropriate local emergency service before writing to us.</p>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
