import { Link, useLoaderData } from "react-router-dom";
import type { Listing } from "@/lib/types";
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
}

export async function loader(): Promise<Data> {
  const [opps, memories, events] = await Promise.all([api.opportunities(), api.memories(), api.events()]);
  return { opps, memories, events: events.filter((e) => (e.details.startsAt ?? "") >= "2026-06-03").slice(0, 2) };
}

export function Component() {
  const { opps, memories, events } = useLoaderData() as Data;
  return (
    <>
      <PageHero tone="teal" kicker="Get involved · training the youth" title="The community" symbol="funtunfunefu" image="/uploads/seed/fishermen.jpg" lede="The platform leads with local pride, and pride is downstream of participation. Share a memory, follow the calendar, and open doors for the next generation.">
        <Cta to="/community#join" variant="gold">Join the community</Cta>
      </PageHero>

      <Container size="wide" className="py-12">
        <Reveal><SectionHeading kicker="Youth opportunities · information & links only" title="Open doors for the young" lede="Scholarships, internships, apprenticeships, training and jobs. Browse and follow the outbound link to apply — no private adult-to-minor contact runs through the platform." accentClass="bg-teal" /></Reveal>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{opps.map((o, i) => <StaggerItem key={o.id} index={i} lift><OpportunityCard opp={o} /></StaggerItem>)}</div>
      </Container>

      <section className="bg-cream py-12">
        <Container size="wide">
          <div className="flex items-end justify-between gap-4">
            <Reveal><SectionHeading kicker="Heritage, preserved" title="The Memory Wall" accentClass="bg-gold-brand" /></Reveal>
            <Link to="/submit?type=memory" className="shrink-0 text-sm font-semibold text-gold-text hover:underline">Share a memory →</Link>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{memories.map((m, i) => <StaggerItem key={m.id} index={i} lift><MemoryCard memory={m} /></StaggerItem>)}</div>
        </Container>
      </section>

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
