import { useMemo, useState } from "react";
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
  mentorship: Listing[];
}

const AGE_BANDS = [
  { key: "all", label: "All ages" },
  { key: "13-17", label: "13-17" },
  { key: "18-24", label: "18-24" },
] as const;

export async function loader(): Promise<Data> {
  const opps = await api.opportunities();
  return { mentorship: opps.filter((o) => o.details.kind === "mentorship") };
}

export function Component() {
  const { mentorship } = useLoaderData() as Data;
  const [ageBand, setAgeBand] = useState<(typeof AGE_BANDS)[number]["key"]>("all");
  usePageTitle("Mentorship matching");
  const shown = useMemo(() => {
    if (ageBand === "all") return mentorship;
    if (ageBand === "13-17") {
      return mentorship.filter((m) => Number(m.details.minAge ?? 18) <= 17);
    }
    return mentorship.filter((m) => Number(m.details.maxAge ?? 99) >= 18);
  }, [ageBand, mentorship]);

  return (
    <>
      <PageHero
        tone="teal"
        kicker="Phase 2 · safeguarding-first"
        title="Mentorship matching"
        symbol="funtunfunefu"
        lede="Find structured mentorship programmes for the youth of Oguaa. Listings must publish a safeguarding policy, and any under-18 participation must require guardian consent."
      >
        <div className="flex flex-wrap gap-3">
          <Cta to="/submit?type=opportunity" variant="gold">Post mentorship programme</Cta>
          <Cta to="/acceptable-use" variant="outline-dark">Read safeguarding rules</Cta>
        </div>
      </PageHero>
      <Container size="wide" className="py-12">
        <SectionHeading title="Available programmes" accentClass="bg-teal" />
        <div className="mt-6 flex flex-wrap gap-2">
          {AGE_BANDS.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setAgeBand(a.key)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${ageBand === a.key ? "border-teal bg-teal text-cream" : "border-sand bg-cream text-ink-muted hover:border-teal hover:text-teal-text"}`}
            >
              {a.label}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <div className="mt-8">
            <EmptyState icon={<EmptyGlyph name="sparkle" />} title="No mentorship programmes in this band" description="Try another age band or check back as new programmes are approved." />
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((o, i) => <StaggerItem key={o.id} index={i} lift><OpportunityCard opp={o} /></StaggerItem>)}
          </div>
        )}
      </Container>
    </>
  );
}
