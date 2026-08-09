import { useMemo, useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, Eyebrow } from "@/components/ui";
import { OpportunityCard } from "@/components/cards";
import { EmptyState, EmptyGlyph } from "@/components/empty-state";
import { LayoutPill, Reveal, Stagger, StaggerItem } from "@/components/motion";

interface Data { mentorship: Listing[] }

const AGE_BANDS = [{ key: "all", label: "Every age" }, { key: "13-17", label: "Ages 13–17" }, { key: "18-24", label: "Ages 18–24" }] as const;

export async function loader(): Promise<Data> {
  const opportunities = await api.opportunities();
  return { mentorship: opportunities.filter((opportunity) => opportunity.details.kind === "mentorship") };
}

export function Component() {
  const { mentorship } = useLoaderData() as Data;
  const [ageBand, setAgeBand] = useState<(typeof AGE_BANDS)[number]["key"]>("all");
  usePageTitle("Mentorship matching");
  const shown = useMemo(() => {
    if (ageBand === "all") return mentorship;
    if (ageBand === "13-17") return mentorship.filter((item) => Number(item.details.minAge ?? 18) <= 17);
    return mentorship.filter((item) => Number(item.details.maxAge ?? 99) >= 18);
  }, [ageBand, mentorship]);

  return (
    <>
      <PageHero tone="teal" kicker="Guidance with guardrails" title="A good mentor opens the next door" symbol="funtunfunefu" image="/uploads/seed/classroom-ghana.jpg" lede="Find structured programmes that connect Oguaa's young people to experience, accountability and a wider view of what is possible.">
        <div className="flex flex-wrap gap-3"><Cta to="/submit?type=opportunity" variant="gold">Publish a programme</Cta><Cta to="/safeguarding" variant="outline-dark">Read safeguarding rules</Cta></div>
      </PageHero>

      <section className="border-b border-sand bg-paper py-16 sm:py-24">
        <Container className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
          <Reveal><Eyebrow className="text-teal-text">Safeguarding first</Eyebrow><p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-faint">Under-18 participation requires guardian consent and a published safeguarding policy. Private adult-to-minor matching does not happen here.</p></Reveal>
          <Reveal delay={0.08}><p className="max-w-[43rem] text-2xl font-medium leading-[1.35] tracking-[-0.015em] text-ink sm:text-3xl">Mentorship works best when the programme is structured, the boundaries are visible and the young person knows exactly who is responsible.</p><Link to="/safeguarding" className="mt-7 inline-flex border-b border-teal pb-1 text-sm font-semibold text-teal-text">How Oguaa protects young people →</Link></Reveal>
        </Container>
      </section>

      <section className="bg-cream py-16 sm:py-24">
        <Container size="wide">
          <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-end"><Reveal><Eyebrow className="text-gold-text">Structured programmes</Eyebrow><h2 className="mt-4 text-4xl font-semibold sm:text-5xl">Find the right programme</h2></Reveal><Reveal delay={0.08} as="p" className="max-w-xl text-lg leading-relaxed text-ink-muted lg:justify-self-end">Browse by participant age. Every listing should explain the format, responsible organisation and safeguarding process before you apply.</Reveal></div>

          <div className="mt-10 flex flex-wrap gap-2 border-b border-sand pb-5" role="group" aria-label="Filter mentorship programmes by age">
            {AGE_BANDS.map((band) => {
              const active = ageBand === band.key;
              return <button key={band.key} type="button" onClick={() => setAgeBand(band.key)} aria-pressed={active} className={`relative rounded-full px-4 py-2 text-sm font-medium transition-colors ${active ? "text-on-green" : "border border-sand bg-paper text-ink-muted hover:border-teal hover:text-teal-text"}`}>{active && <LayoutPill layoutId="mentorship-age" className="absolute inset-0 rounded-full bg-teal" />}<span className="relative">{band.label}</span></button>;
            })}
          </div>

          <p className="mt-5 text-sm text-ink-faint" aria-live="polite">Showing {shown.length} {shown.length === 1 ? "programme" : "programmes"}</p>
          {shown.length === 0 ? <div className="mt-8"><EmptyState icon={<EmptyGlyph name="sparkle" />} title="No programmes in this age band" description="Try another age group or return as new programmes are approved." /></div> : <Stagger className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{shown.map((opportunity) => <StaggerItem key={opportunity.id} lift><OpportunityCard opp={opportunity} /></StaggerItem>)}</Stagger>}
        </Container>
      </section>

      <section className="bg-teal py-14 text-cream"><Container className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center"><Reveal><Eyebrow className="text-cream/70">For programme organisers</Eyebrow><h2 className="mt-3 text-3xl font-semibold text-cream">Make the structure visible before asking for trust</h2><p className="mt-3 max-w-2xl text-cream/75">Publish the responsible organisation, participant ages, contact route, consent process and safeguarding policy.</p></Reveal><Cta to="/submit?type=opportunity" variant="gold">List a programme</Cta></Container></section>
    </>
  );
}
