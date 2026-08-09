import { Link, useLoaderData } from "react-router-dom";
import { useState } from "react";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing, Organization, Place } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, Eyebrow } from "@/components/ui";
import { Adinkra } from "@/components/adinkra";
import { OpportunityCard, MemoryCard, EventCard } from "@/components/cards";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { LoadMore } from "@/components/pagination";

const MEMORY_PAGE = 9;

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
  return { opps, memories, events: events.filter((event) => (event.details.startsAt ?? "") >= "2026-06-03").slice(0, 2), schools, places };
}

const FILTER_CLS = "min-w-0 rounded-lg border border-sand bg-paper px-3 py-2.5 text-sm text-ink transition-colors focus:border-gold-border focus:outline-none focus:ring-2 focus:ring-gold/15";

function MemoryWall({ initial, schools, places }: Readonly<{ initial: Listing[]; schools: Organization[]; places: Place[] }>) {
  const [memories, setMemories] = useState(initial);
  const eras = [...new Set(initial.map((memory) => memory.details?.era).filter((value): value is string => Boolean(value)))].sort();
  const [school, setSchool] = useState("");
  const [town, setTown] = useState("");
  const [era, setEra] = useState("");
  const [loading, setLoading] = useState(false);
  const [filterError, setFilterError] = useState(false);
  const [visibleCount, setVisibleCount] = useState(MEMORY_PAGE);
  const quarters = places.filter((place) => place.kind === "quarter");
  const activeFilters = [school, town, era].filter(Boolean).length;

  async function applyFilter(next: { school: string; town: string; era: string }) {
    setLoading(true);
    setFilterError(false);
    try {
      const result = await api.memories({ school: next.school || undefined, town: next.town || undefined, era: next.era || undefined });
      setMemories(result);
      setVisibleCount(MEMORY_PAGE);
    } catch {
      setFilterError(true);
    } finally {
      setLoading(false);
    }
  }

  function onChange(key: "school" | "town" | "era", value: string) {
    const next = { school, town, era, [key]: value };
    if (key === "school") setSchool(value);
    if (key === "town") setTown(value);
    if (key === "era") setEra(value);
    void applyFilter(next);
  }

  function clearFilters() {
    setSchool("");
    setTown("");
    setEra("");
    void applyFilter({ school: "", town: "", era: "" });
  }

  return (
    <section id="memories" className="scroll-mt-24 bg-cream py-16 sm:py-24">
      <Container size="wide">
        <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
          <Reveal>
            <Eyebrow className="text-gold-text">Heritage, preserved</Eyebrow>
            <h2 className="mt-4 text-4xl font-semibold sm:text-5xl">The Memory Wall</h2>
          </Reveal>
          <Reveal delay={0.08} className="lg:justify-self-end">
            <p className="max-w-xl text-lg leading-relaxed text-ink-muted">School days, festival mornings, old neighbourhoods and people the town should not forget—kept here in the voices of those who were there.</p>
            <Link to="/submit?type=memory" className="mt-5 inline-flex items-center gap-2 border-b border-gold-border pb-1 text-sm font-semibold text-gold-text">Add your memory <span aria-hidden>→</span></Link>
          </Reveal>
        </div>

        <div className="mt-10 rounded-[1.25rem] border border-sand bg-paper p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gold/[0.12] text-gold-text" aria-hidden>⌕</span><div><p className="text-sm font-semibold text-ink">Find a memory</p><p className="text-xs text-ink-faint">Filter by the community it belongs to</p></div></div>
            <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[36rem]">
              <select value={school} onChange={(event) => onChange("school", event.target.value)} className={FILTER_CLS} aria-label="Filter by school"><option value="">Every school</option>{schools.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              {quarters.length > 0 && <select value={town} onChange={(event) => onChange("town", event.target.value)} className={FILTER_CLS} aria-label="Filter by quarter"><option value="">Every quarter</option>{quarters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
              {eras.length > 0 && <select value={era} onChange={(event) => onChange("era", event.target.value)} className={FILTER_CLS} aria-label="Filter by era"><option value="">Every era</option>{eras.map((item) => <option key={item} value={item}>{item}</option>)}</select>}
            </div>
          </div>
          <div className="mt-4 flex min-h-6 items-center justify-between border-t border-sand pt-3 text-xs text-ink-faint" aria-live="polite">
            <span>{loading ? "Searching the archive…" : `${memories.length} ${memories.length === 1 ? "memory" : "memories"}${activeFilters ? ` · ${activeFilters} ${activeFilters === 1 ? "filter" : "filters"} active` : ""}`}</span>
            {activeFilters > 0 && <button type="button" onClick={clearFilters} className="font-semibold text-gold-text transition-colors hover:text-ink">Clear filters ×</button>}
          </div>
          {filterError && <p role="alert" className="mt-3 border-l-2 border-clay pl-3 text-sm text-clay-text">We couldn't update the Memory Wall. Your previous results are still shown.</p>}
        </div>

        {memories.length === 0 ? (
          <div className="mt-10 rounded-[1.5rem] border border-dashed border-gold-border/50 bg-paper px-6 py-14 text-center"><Adinkra name="sankofa" size={36} labelled={false} className="mx-auto text-gold-brand" /><h3 className="mt-5 text-2xl font-semibold text-ink">No memories found here yet</h3><p className="mx-auto mt-3 max-w-md text-ink-muted">Clear the filters to explore the full wall, or be the first to preserve a story from this community.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><button type="button" onClick={clearFilters} className="rounded-full border border-green/30 px-5 py-2.5 text-sm font-semibold text-green">Clear filters</button><Cta to="/submit?type=memory" variant="gold">Share a memory</Cta></div></div>
        ) : (
          <Stagger className="mt-10 columns-1 gap-5 sm:columns-2 lg:columns-3">
            {memories.slice(0, visibleCount).map((memory) => <StaggerItem key={memory.id} className="mb-5 break-inside-avoid"><MemoryCard memory={memory} /></StaggerItem>)}
          </Stagger>
        )}
        <LoadMore hasMore={visibleCount < memories.length} remaining={memories.length - visibleCount} onClick={() => setVisibleCount((count) => count + MEMORY_PAGE)} label="More memories" />
      </Container>
    </section>
  );
}

export function Component() {
  const { opps, memories, events, schools, places } = useLoaderData() as Data;
  usePageTitle("Community");
  return (
    <>
      <PageHero tone="teal" kicker="Many hands · one Oguaa" title="A city is what its people keep building" symbol="funtunfunefu" image="/uploads/seed/fishermen.jpg" lede="Preserve a memory, find an open door, follow what is happening and add your own work to the record.">
        <nav aria-label="Community page" className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-cream/80"><a href="#memories" className="border-b border-gold/50 pb-1 hover:text-gold">Memory Wall</a><a href="#opportunities" className="border-b border-gold/50 pb-1 hover:text-gold">Open doors</a><a href="#join" className="border-b border-gold/50 pb-1 hover:text-gold">Take part</a></nav>
      </PageHero>

      <section className="relative overflow-hidden border-b border-sand bg-paper py-16 sm:py-24">
        <Adinkra name="funtunfunefu" size={250} labelled={false} className="pointer-events-none absolute -right-16 top-1/2 -translate-y-1/2 text-teal opacity-[0.045]" />
        <Container className="relative grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
          <Reveal><Eyebrow className="text-teal-text">Participation is local pride</Eyebrow><p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-faint">The platform belongs to the people who bring their knowledge, opportunities and memories into it.</p></Reveal>
          <Reveal delay={0.08}><p className="max-w-[44rem] text-2xl font-medium leading-[1.35] tracking-[-0.015em] text-ink sm:text-3xl">Community is not a category on Oguaa. It is the engine: one generation holding the door open for the next, while keeping the names and stories behind us in view.</p><div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 border-t border-sand pt-6 text-sm text-ink-muted"><span><strong className="mr-2 text-2xl text-green tabular-nums">{memories.length}</strong> memories held</span><span><strong className="mr-2 text-2xl text-green tabular-nums">{opps.length}</strong> open doors</span><span><strong className="mr-2 text-2xl text-green tabular-nums">{events.length}</strong> upcoming highlights</span></div></Reveal>
        </Container>
      </section>

      <MemoryWall initial={memories} schools={schools} places={places} />

      <section id="opportunities" className="scroll-mt-24 bg-paper py-16 sm:py-24">
        <Container size="wide">
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-end"><Reveal><Eyebrow className="text-teal-text">Youth opportunities</Eyebrow><h2 className="mt-4 text-4xl font-semibold sm:text-5xl">Open doors for the young</h2></Reveal><Reveal delay={0.08} as="p" className="max-w-2xl text-lg leading-relaxed text-ink-muted lg:justify-self-end">Scholarships, apprenticeships, work, training and mentorship—information and official application links only, with no private adult-to-minor contact on the platform.</Reveal></div>
          {opps.length > 0 ? <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{opps.map((opportunity) => <StaggerItem key={opportunity.id} lift><OpportunityCard opp={opportunity} /></StaggerItem>)}</Stagger> : <p className="mt-10 border-l-2 border-teal pl-5 text-ink-muted">There are no open opportunities right now. Check back soon.</p>}
          <div className="mt-10 flex flex-wrap gap-5"><Link to="/investment" className="border-b border-green pb-1 text-sm font-semibold text-green">Investment opportunities →</Link><Link to="/mentorship" className="border-b border-green pb-1 text-sm font-semibold text-green">Mentorship matching →</Link></div>
        </Container>
      </section>

      {events.length > 0 && <section className="bg-gold/[0.10] py-16 sm:py-24"><Container size="wide"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><Reveal><Eyebrow className="text-gold-text">What's on</Eyebrow><h2 className="mt-4 text-4xl font-semibold sm:text-5xl">Gather in Oguaa</h2></Reveal><Link to="/events" className="w-fit border-b border-gold-border pb-1 text-sm font-semibold text-gold-text">Open the full calendar →</Link></div><Stagger className="mt-10 grid gap-5 sm:grid-cols-2">{events.map((event) => <StaggerItem key={event.id} lift><EventCard event={event} /></StaggerItem>)}</Stagger></Container></section>}

      <section id="join" className="on-dark on-dark-pin relative overflow-hidden bg-green-900 py-20 text-cream sm:py-24">
        <div className="bg-dotgrid absolute inset-0 opacity-20" aria-hidden />
        <Adinkra name="funtunfunefu" size={280} labelled={false} className="pointer-events-none absolute -bottom-24 -right-16 text-gold opacity-[0.06]" />
        <Container className="relative grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-center"><Reveal><Adinkra name="funtunfunefu" size={48} className="text-gold" /><Eyebrow className="mt-6 text-gold">Funtunfunefu Denkyemfunefu</Eyebrow><p className="mt-3 text-sm text-cream/60">Two crocodiles, one stomach.<br />Unity in diversity.</p></Reveal><Reveal delay={0.08}><h2 className="max-w-2xl text-4xl font-semibold text-cream sm:text-5xl">Bring your part of Oguaa into the record</h2><p className="mt-5 max-w-xl text-lg leading-relaxed text-cream/75">Create a profile, represent your town and school, preserve a memory or publish something the community should know.</p><div className="mt-8 flex flex-wrap gap-3"><Cta to="/me" variant="gold">Create your profile</Cta><Cta to="/submit" variant="outline-dark">Contribute to Oguaa</Cta></div></Reveal></Container>
      </section>
    </>
  );
}
