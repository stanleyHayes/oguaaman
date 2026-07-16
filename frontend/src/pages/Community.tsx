import { Link, useLoaderData } from "react-router-dom";
import { useState } from "react";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing, Organization, Place } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, SectionHeading, SampleNote } from "@/components/ui";
import { Adinkra } from "@/components/adinkra";
import { OpportunityCard, MemoryCard, EventCard } from "@/components/cards";
import { Reveal, StaggerItem } from "@/components/motion";
import { SAMPLE_NOTICE } from "@/lib/content";

interface Data {
  opps: Listing[];
  memories: Listing[];
  events: Listing[];
  schools: Organization[];
  places: Place[];
}

export async function loader(): Promise<Data> {
  const [opps, memories, events, schools, places] = await Promise.all([
    api.opportunities(), api.memories(), api.events(), api.schools(), api.places(),
  ]);
  return { opps, memories, events: events.filter((e) => (e.details.startsAt ?? "") >= "2026-06-03").slice(0, 2), schools, places };
}

// ── Memory Wall with filterable tags/school/town ────────────────────────────

const FILTER_CLS = "rounded-xl border border-sand bg-paper px-3 py-1.5 text-sm text-ink focus:border-gold-border focus:outline-none focus:ring-1 focus:ring-gold/20";

function MemoryWall({ initial, schools, places }: Readonly<{ initial: Listing[]; schools: Organization[]; places: Place[] }>) {
  const [memories, setMemories] = useState(initial);
  // Era options come from the memories themselves (free-form: "1980s", "Fetu
  // Afahye era"…) — a hardcoded list would silently filter everything out.
  const eras = [...new Set(initial.map((m) => m.details?.era).filter((e): e is string => !!e))].sort();
  const [school, setSchool] = useState("");
  const [town, setTown] = useState("");
  const [era, setEra] = useState("");
  const [loading, setLoading] = useState(false);

  async function applyFilter(next: { school: string; town: string; era: string }) {
    setLoading(true);
    try {
      const result = await api.memories({ school: next.school || undefined, town: next.town || undefined, era: next.era || undefined });
      setMemories(result);
    } catch { /* keep existing */ } finally { setLoading(false); }
  }

  function onChange(key: "school" | "town" | "era", val: string) {
    const next = { school, town, era, [key]: val };
    if (key === "school") setSchool(val);
    if (key === "town") setTown(val);
    if (key === "era") setEra(val);
    applyFilter(next);
  }

  const quarters = places.filter((p) => p.kind === "quarter");

  return (
    <section className="bg-cream py-12">
      <Container size="wide">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Reveal><SectionHeading kicker="Heritage, preserved" title="The Memory Wall" accentClass="bg-gold-brand" /></Reveal>
          <Link to="/submit?type=memory" className="shrink-0 text-sm font-semibold text-gold-text hover:underline">Share a memory →</Link>
        </div>

        {/* Filter bar */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <select value={school} onChange={(e) => onChange("school", e.target.value)} className={FILTER_CLS} aria-label="Filter by school">
            <option value="">All schools</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {quarters.length > 0 && (
            <select value={town} onChange={(e) => onChange("town", e.target.value)} className={FILTER_CLS} aria-label="Filter by quarter">
              <option value="">All quarters</option>
              {quarters.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
          )}
          {eras.length > 0 && (
            <select value={era} onChange={(e) => onChange("era", e.target.value)} className={FILTER_CLS} aria-label="Filter by era">
              <option value="">All eras</option>
              {eras.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          )}
          {(school || town || era) && (
            <button
              type="button"
              onClick={() => { setSchool(""); setTown(""); setEra(""); applyFilter({ school: "", town: "", era: "" }); }}
              className="rounded-full border border-sand px-3 py-1.5 text-sm text-ink-muted hover:border-ink-faint hover:text-ink"
            >
              Clear ×
            </button>
          )}
          {loading && <span className="text-xs text-ink-faint">Loading…</span>}
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {memories.length === 0
            ? <p className="col-span-full py-8 text-center text-ink-muted">No memories match this filter.</p>
            : memories.map((m, i) => <StaggerItem key={m.id} index={i} lift><MemoryCard memory={m} /></StaggerItem>)}
        </div>
      </Container>
    </section>
  );
}

export function Component() {
  const { opps, memories, events, schools, places } = useLoaderData() as Data;
  usePageTitle("Community");
  return (
    <>
      <PageHero tone="teal" kicker="Get involved · training the youth" title="The community" symbol="funtunfunefu" image="/uploads/seed/fishermen.jpg" lede="The platform leads with local pride, and pride is downstream of participation. Share a memory, follow the calendar, and open doors for the next generation.">
        <Cta to="/community#join" variant="gold">Join the community</Cta>
      </PageHero>

      <Container size="wide" className="py-12">
        <Reveal><SectionHeading kicker="Youth opportunities · information & links only" title="Open doors for the young" lede="Scholarships, internships, apprenticeships, training and jobs. Browse and follow the outbound link to apply — no private adult-to-minor contact runs through the platform." accentClass="bg-teal" /></Reveal>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{opps.map((o, i) => <StaggerItem key={o.id} index={i} lift><OpportunityCard opp={o} /></StaggerItem>)}</div>
      </Container>

      <MemoryWall initial={memories} schools={schools} places={places} />

      <Container size="wide" className="py-12">
        <div className="flex items-end justify-between gap-4">
          <Reveal><SectionHeading kicker="What's on" title="Upcoming events" accentClass="bg-teal" /></Reveal>
          <Link to="/events" className="shrink-0 text-sm font-semibold text-teal-text hover:underline">Full calendar →</Link>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">{events.map((e, i) => <StaggerItem key={e.id} index={i} lift><EventCard event={e} /></StaggerItem>)}</div>
      </Container>

      <section id="join" className="on-dark bg-green py-16 text-cream">
        <Container size="narrow" className="text-center">
          <Adinkra name="funtunfunefu" size={36} className="mx-auto text-gold" />
          <h2 className="mt-5 text-3xl font-semibold sm:text-4xl">Two crocodiles, one stomach</h2>
          <p className="mx-auto mt-4 max-w-xl text-cream/80">Funtunfunefu Denkyemfunefu — unity in diversity. Create a profile, rep your town and school, and help build the thing the people of Oguaa genuinely own.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Cta to="/me" variant="gold">Create your profile</Cta>
            <Cta to="/submit" variant="outline-dark">Submit a listing</Cta>
          </div>
        </Container>
      </section>

      <Container><SampleNote>{SAMPLE_NOTICE}</SampleNote></Container>
    </>
  );
}
