import { useLoaderData } from "react-router-dom";
import type { Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA, SampleNote } from "@/components/ui";
import { PersonCard } from "@/components/cards";
import { SAMPLE_NOTICE } from "@/lib/content";

export async function loader() {
  return api.people();
}

export function Component() {
  const people = useLoaderData() as Listing[];
  const living = people.filter((p) => p.details.living);
  const remembered = people.filter((p) => !p.details.living);
  return (
    <>
      <PageHero tone="gold" kicker="The sons & daughters wall" title="People of Oguaa" symbol="dwennimmen" lede="The icons, the personalities, the quietly remarkable — historical and living. A wall of pride for the people this town has given the world.">
        <CTA to="/submit?type=person" variant="primary">Nominate someone</CTA>
      </PageHero>
      <Container size="wide" className="space-y-12 py-12">
        {living.length > 0 && (
          <section>
            <h2 className="font-display text-2xl font-semibold text-ink">Living icons</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{living.map((p) => <PersonCard key={p.id} person={p} />)}</div>
          </section>
        )}
        {remembered.length > 0 && (
          <section>
            <h2 className="font-display text-2xl font-semibold text-ink">In legacy</h2>
            <p className="mt-1 text-sm text-ink-muted">Those who have passed but whose names the town still carries.</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{remembered.map((p) => <PersonCard key={p.id} person={p} />)}</div>
          </section>
        )}
        <SampleNote>{SAMPLE_NOTICE}</SampleNote>
      </Container>
    </>
  );
}
