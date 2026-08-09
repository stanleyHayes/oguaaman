import { Link, useLoaderData } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, Eyebrow } from "@/components/ui";
import { OpportunityCard } from "@/components/cards";
import { EmptyState, EmptyGlyph } from "@/components/empty-state";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { Adinkra } from "@/components/adinkra";

interface Data { investments: Listing[] }

export async function loader(): Promise<Data> {
  const opportunities = await api.opportunities();
  return { investments: opportunities.filter((opportunity) => opportunity.details.kind === "investment") };
}

const PRINCIPLES = [
  { number: "01", title: "Read the issuer", text: "Confirm who opened the call and which organisation is responsible for it." },
  { number: "02", title: "Test the numbers", text: "Ask for the assumptions, repayment terms, ownership structure and downside." },
  { number: "03", title: "Keep your own counsel", text: "Oguaa publishes the opportunity; every investment decision remains yours." },
];

export function Component() {
  const { investments } = useLoaderData() as Data;
  usePageTitle("Investment opportunities");
  return (
    <>
      <PageHero tone="teal" kicker="Capital with local consequence" title="Back work that can move Oguaa forward" symbol="funtunfunefu" image="/uploads/seed/downtown.jpg" lede="Verified calls for local co-investment, SME growth and catalytic capital—presented clearly, with due diligence kept where it belongs: with the investor.">
        <Cta to="/submit?type=opportunity" variant="gold">Publish an investment call</Cta>
      </PageHero>

      <section className="relative overflow-hidden border-b border-sand bg-paper py-16 sm:py-24">
        <Adinkra name="funtunfunefu" size={250} labelled={false} className="pointer-events-none absolute -right-16 top-1/2 -translate-y-1/2 text-teal opacity-[0.045]" />
        <Container className="relative grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
          <Reveal><Eyebrow className="text-teal-text">Local growth capital</Eyebrow><p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-faint">This is a public noticeboard, not financial advice or an investment intermediary.</p></Reveal>
          <Reveal delay={0.08}><p className="max-w-[43rem] text-lg font-medium leading-[1.65] text-ink sm:text-xl">Good capital does more than arrive. It understands the place, names the risk plainly and leaves local businesses stronger than it found them.</p><div className="mt-8 flex items-center gap-3 border-t border-sand pt-6"><strong className="text-3xl font-semibold text-green tabular-nums">{investments.length}</strong><span className="text-sm text-ink-muted">open {investments.length === 1 ? "call" : "calls"} currently listed</span></div></Reveal>
        </Container>
      </section>

      <section className="bg-cream py-16 sm:py-24">
        <Container size="wide">
          <Reveal><Eyebrow className="text-gold-text">Before you commit</Eyebrow><h2 className="mt-4 text-4xl font-semibold sm:text-5xl">Do the work behind the decision</h2></Reveal>
          <Stagger as="ol" className="mt-10 grid gap-px overflow-hidden rounded-[1.5rem] bg-gold-border/25 lg:grid-cols-3">
            {PRINCIPLES.map((principle) => <StaggerItem as="li" key={principle.number} className="bg-paper p-7 sm:p-8"><span className="text-xs font-semibold text-gold-text tabular-nums">{principle.number}</span><h3 className="mt-5 text-2xl font-semibold text-ink">{principle.title}</h3><p className="mt-3 leading-relaxed text-ink-muted">{principle.text}</p></StaggerItem>)}
          </Stagger>
        </Container>
      </section>

      <section className="bg-paper py-16 sm:py-24">
        <Container size="wide">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><Reveal><Eyebrow className="text-teal-text">Current opportunities</Eyebrow><h2 className="mt-4 text-4xl font-semibold sm:text-5xl">Open calls</h2></Reveal><Link to="/business" className="w-fit border-b border-green pb-1 text-sm font-semibold text-green">Explore local businesses →</Link></div>
          {investments.length === 0 ? <div className="mt-10"><EmptyState icon={<EmptyGlyph name="sparkle" />} title="No investment calls are open" description="When a verified organisation opens a local investment window, it will appear here." actions={<Cta to="/submit?type=opportunity" variant="outline">Publish a call</Cta>} /></div> : <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{investments.map((opportunity) => <StaggerItem key={opportunity.id} lift><OpportunityCard opp={opportunity} /></StaggerItem>)}</Stagger>}
        </Container>
      </section>
    </>
  );
}
