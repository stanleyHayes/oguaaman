import { useLoaderData } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, SectionHeading, SampleNote } from "@/components/ui";
import { SymbolDivider } from "@/components/adinkra";
import { PersonCard } from "@/components/cards";
import { Reveal, StaggerItem } from "@/components/motion";
import { SAMPLE_NOTICE } from "@/lib/content";

export async function loader() {
  return api.people();
}

export function Component() {
  const people = useLoaderData() as Listing[];
  usePageTitle("People of Oguaa");
  const living = people.filter((p) => p.details.living);
  const remembered = people.filter((p) => !p.details.living);
  return (
    <>
      <PageHero tone="gold" kicker="The sons & daughters wall" title="People of Oguaa" symbol="dwennimmen" image="/uploads/seed/fetu-queenmother.jpg" lede="The icons, the personalities, the quietly remarkable — historical and living. A wall of pride for the people this town has given the world.">
        <Cta to="/submit?type=person" variant="gold">Nominate someone</Cta>
      </PageHero>

      {living.length > 0 && (
        <Container size="wide" className="py-14">
          <Reveal>
            <SectionHeading
              kicker={`${living.length} on the wall`}
              title="Living icons"
              lede="The people carrying Oguaa's name into the world today — artists, educators, traders, leaders."
              accentClass="bg-gold-brand"
            />
          </Reveal>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{living.map((p, i) => <StaggerItem key={p.id} index={i} lift><PersonCard person={p} /></StaggerItem>)}</div>
        </Container>
      )}

      {remembered.length > 0 && (
        <section className="bg-cream py-14">
          <Container size="wide">
            <SymbolDivider name="sankofa" />
            <div className="mt-8">
              <Reveal>
                <SectionHeading
                  kicker={`${remembered.length} remembered`}
                  title="In legacy"
                  lede="Those who have passed but whose names the town still carries. San kɔfa — go back and fetch it."
                  accentClass="bg-gold-brand"
                />
              </Reveal>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{remembered.map((p, i) => <StaggerItem key={p.id} index={i} lift><PersonCard person={p} /></StaggerItem>)}</div>
          </Container>
        </section>
      )}

      <Container><SampleNote>{SAMPLE_NOTICE}</SampleNote></Container>
    </>
  );
}
