import { useLoaderData } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, SectionHeading } from "@/components/ui";
import { OpportunityCard } from "@/components/cards";
import { EmptyState, EmptyGlyph } from "@/components/empty-state";
import { StaggerItem } from "@/components/motion";

interface Data {
  investments: Listing[];
}

export async function loader(): Promise<Data> {
  const opps = await api.opportunities();
  return { investments: opps.filter((o) => o.details.kind === "investment") };
}

export function Component() {
  const { investments } = useLoaderData() as Data;
  usePageTitle("Investment opportunities");
  return (
    <>
      <PageHero
        tone="teal"
        kicker="Phase 2 · local growth capital"
        title="Investment opportunities"
        symbol="funtunfunefu"
        lede="Local co-investment windows, SME growth calls and catalytic-capital opportunities for Oguaa. Information and outbound links only — due diligence stays with the issuing body."
      >
        <Cta to="/submit?type=opportunity" variant="gold">Post an investment call</Cta>
      </PageHero>
      <Container size="wide" className="py-12">
        <SectionHeading title="Open calls" accentClass="bg-teal" />
        {investments.length === 0 ? (
          <div className="mt-8">
            <EmptyState icon={<EmptyGlyph name="sparkle" />} title="No investment calls yet" description="When a verified organisation opens a local investment window, it will appear here." />
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {investments.map((o, i) => <StaggerItem key={o.id} index={i} lift><OpportunityCard opp={o} /></StaggerItem>)}
          </div>
        )}
      </Container>
    </>
  );
}
