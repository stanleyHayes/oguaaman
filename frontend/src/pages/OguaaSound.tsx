import { useLoaderData } from "react-router-dom";
import type { Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, SampleNote } from "@/components/ui";
import { SymbolDivider } from "@/components/adinkra";
import { PersonCard } from "@/components/cards";
import { Reveal, StaggerItem } from "@/components/motion";
import { OGUAA_SOUND, SAMPLE_NOTICE } from "@/lib/content";

export async function loader() {
  return api.musicLegacy();
}

export function Component() {
  const legacy = useLoaderData() as Listing[];
  const paragraphs = OGUAA_SOUND.split("\n\n");
  return (
    <>
      <PageHero tone="clay" kicker="Editorial · The local scene" title="The Oguaa Sound" symbol="sankofa" lede="The story of a coastal town that helped invent highlife — and keeps the pipeline flowing." />
      <Container size="prose" className="py-12 sm:py-16">
        <article className="font-serif text-lg leading-relaxed text-ink">
          {paragraphs.map((p, i) => (
            <p key={p} className={i === 0 ? "[&::first-letter]:float-left [&::first-letter]:mr-3 [&::first-letter]:[&::first-letter]:text-6xl [&::first-letter]:leading-[0.8] [&::first-letter]:text-clay-text" : "mt-5"}>{p}</p>
          ))}
        </article>
        <SymbolDivider name="sankofa" className="my-12" />
        <Reveal as="h2" className="text-center text-3xl font-semibold text-ink">The grandfathers</Reveal>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">{legacy.map((p, i) => <StaggerItem key={p.id} index={i} lift><PersonCard person={p} /></StaggerItem>)}</div>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Cta to="/music" variant="primary">Browse the artists →</Cta>
          <Cta to="/submit?type=artist" variant="outline">Nominate an artist</Cta>
        </div>
        <SampleNote>{SAMPLE_NOTICE}</SampleNote>
      </Container>
    </>
  );
}
