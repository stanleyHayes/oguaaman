import { useState } from "react";
import { useLoaderData } from "react-router-dom";
import type { Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, SectionHeading, SampleNote } from "@/components/ui";
import { OpportunityCard, PersonCard } from "@/components/cards";
import { LayoutPill, Reveal, StaggerItem } from "@/components/motion";
import { EmptyState, EmptyGlyph } from "@/components/empty-state";
import { SAMPLE_NOTICE } from "@/lib/content";

// The opportunity kinds we filter the board by (spec §8.8), derived from tags.
const KINDS = ["scholarship", "internship", "apprenticeship", "training", "job"] as const;
type Kind = (typeof KINDS)[number];
type KindFilter = Kind | "all";

const KIND_LABEL: Record<Kind, string> = {
  scholarship: "Scholarships",
  internship: "Internships",
  apprenticeship: "Apprenticeships",
  training: "Training",
  job: "Jobs",
};

const YOUNG_TALENT_TAG = "young-talent";

interface Data {
  opps: Listing[];
  talents: Listing[];
}

export async function loader(): Promise<Data> {
  const [opps, people] = await Promise.all([api.opportunities(), api.people()]);
  return { opps, talents: people.filter((p) => p.tags.includes(YOUNG_TALENT_TAG)) };
}

export function Component() {
  const { opps, talents } = useLoaderData() as Data;
  return (
    <>
      <PageHero
        tone="teal"
        kicker="Training the youth"
        title="Youth & opportunity"
        symbol="funtunfunefu"
        lede="Scholarships, internships, apprenticeships, training and jobs for the young of Cape Coast — plus a spotlight on the talents coming up. Everything here is information and outbound links only: applications happen off-platform, and no private adult-to-minor contact ever runs through Oguaa."
      >
        <Cta to="/submit?type=opportunity" variant="primary">Post an opportunity</Cta>
      </PageHero>
      <Spotlight talents={talents} />
      <Board opps={opps} />
      <Container><SampleNote>{SAMPLE_NOTICE}</SampleNote></Container>
    </>
  );
}

function Spotlight({ talents }: Readonly<{ talents: Listing[] }>) {
  if (talents.length === 0) return null;
  return (
    <Container size="wide" className="py-12">
      <Reveal>
        <SectionHeading
          kicker="The next generation"
          title="Young-talent spotlight"
          lede="Bright young Oguaa minds and talents, celebrated publicly. Their profiles carry no contact details, by design."
          accentClass="bg-teal"
        />
      </Reveal>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {talents.map((p, i) => <StaggerItem key={p.id} index={i} lift><PersonCard person={p} /></StaggerItem>)}
      </div>
    </Container>
  );
}

function Board({ opps }: Readonly<{ opps: Listing[] }>) {
  const [filter, setFilter] = useState<KindFilter>("all");
  const shown = filter === "all" ? opps : opps.filter((o) => o.tags.includes(filter));
  return (
    <section className="bg-cream py-12">
      <Container size="wide">
        <Reveal>
          <SectionHeading
            kicker="Information & links only"
            title="Opportunities board"
            lede="Browse, then follow the outbound link to apply directly with the organisation. Oguaa does not handle applications, payments or interviews."
            accentClass="bg-teal"
          />
        </Reveal>
        <FilterBar opps={opps} filter={filter} onChange={setFilter} />
        {shown.length === 0 ? (
          <EmptyState icon={<EmptyGlyph name="sparkle" />} title="Nothing open right now" description="Nothing in this category at the moment — check back soon." />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((o, i) => <StaggerItem key={o.id} index={i} lift><OpportunityCard opp={o} /></StaggerItem>)}
          </div>
        )}
      </Container>
    </section>
  );
}

function FilterBar({ opps, filter, onChange }: Readonly<{ opps: Listing[]; filter: KindFilter; onChange: (f: KindFilter) => void }>) {
  const countFor = (k: Kind) => opps.filter((o) => o.tags.includes(k)).length;
  return (
    <div className="mb-8 mt-8 flex flex-wrap gap-2">
      <Chip label={`All (${opps.length})`} active={filter === "all"} onSelect={() => onChange("all")} />
      {KINDS.map((k) => (
        <Chip key={k} label={`${KIND_LABEL[k]} (${countFor(k)})`} active={filter === k} onSelect={() => onChange(k)} />
      ))}
    </div>
  );
}

function Chip({ label, active, onSelect }: Readonly<{ label: string; active: boolean; onSelect: () => void }>) {
  const cls = active
    ? "border-teal text-cream"
    : "border-sand bg-cream text-ink-muted hover:border-teal/40";
  return (
    <button
      onClick={onSelect}
      className={`relative rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${cls}`}
    >
      {active && <LayoutPill layoutId="youth-kind" className="absolute inset-0 rounded-full bg-teal" />}
      <span className="relative">{label}</span>
    </button>
  );
}
