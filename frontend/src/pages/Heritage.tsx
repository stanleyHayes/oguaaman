import { Link, useLoaderData } from "react-router-dom";
import type { HistoryView } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, SectionHeading } from "@/components/ui";
import { Adinkra } from "@/components/adinkra";
import { MemoryCard } from "@/components/cards";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { HERITAGE_BLURB } from "@/lib/content";

export async function loader(): Promise<HistoryView> {
  return api.history();
}

// Excerpt the first sentence (or two) of a heritage site's history for the grid.
function excerpt(text: string, max = 180): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const last = cut.lastIndexOf(" ");
  return cut.slice(0, last > 0 ? last : max).trimEnd() + "…";
}

export function Component() {
  const { timeline, heritage, people, memories } = useLoaderData() as HistoryView;
  return (
    <>
      <PageHero tone="green" kicker="Sankofa · go back and fetch it" title="Our History" symbol="sankofa" lede="The living memory of the people of Oguaa — the old colonial capital, the cradle of the colony's educated class, the global symbol of the diaspora homecoming." />
      <Container size="prose" className="py-12"><p className="font-serif text-lg leading-relaxed text-ink">{HERITAGE_BLURB}</p></Container>

      <section className="bg-cream py-12">
        <Container>
          <Reveal><SectionHeading kicker="Nkyinkyim · the path is twisted" title="A timeline of Oguaa" accentClass="bg-gold-brand" /></Reveal>
          <Stagger as="ol" className="mt-8 space-y-1">
            {timeline.map((e) => (
              <StaggerItem as="li" key={e.id} className="flex gap-5">
                <span className="w-14 shrink-0 text-right text-lg font-semibold text-gold-text">{e.year}</span>
                <span className="relative flex flex-col items-center">
                  <span className="h-3 w-3 rounded-full border-2 border-gold-brand bg-cream" aria-hidden />
                  <span className="w-px flex-1 bg-sand" aria-hidden />
                </span>
                <span className="pb-6 pt-0.5">
                  <span className="block text-base font-semibold text-ink">{e.title}</span>
                  <span className="block text-ink-muted">{e.summary}</span>
                </span>
              </StaggerItem>
            ))}
          </Stagger>
        </Container>
      </section>

      <Container className="py-12">
        <Reveal><SectionHeading kicker="A sense of place" title="The places that hold the story" accentClass="bg-clay" /></Reveal>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {heritage.map((h, i) => (
            <StaggerItem key={h.id} index={i} lift className="h-full">
            <Link to={`/education/${h.slug}`} className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
              <div className="h-1.5" style={{ backgroundColor: h.houseColors?.[0] ?? "#123F2D" }} aria-hidden />
              <div className="flex flex-1 flex-col p-5">
                <h3 className="text-lg font-semibold text-ink group-hover:text-gold-text">{h.name}</h3>
                {h.classification && <p className="text-xs uppercase tracking-wide text-gold-text">{h.classification}</p>}
                <p className="mt-2 text-sm text-ink-muted">{excerpt(h.history || h.summary)}</p>
              </div>
            </Link>
            </StaggerItem>
          ))}
        </div>
      </Container>

      <section className="bg-cream py-12">
        <Container>
          <div className="flex items-end justify-between gap-4">
            <Reveal><SectionHeading kicker="Sons & daughters" title="The people who carry the story" accentClass="bg-green" /></Reveal>
            <Link to="/people" className="shrink-0 text-sm font-semibold text-gold-text hover:underline">All notable people →</Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            {people.map((p) => (
              <Link key={p.id} to={`/people/${p.slug}`} className="rounded-full border border-sand bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-gold-brand hover:text-gold-text">
                {p.title}{p.details.era ? <span className="text-ink-faint"> · {p.details.era}</span> : null}
              </Link>
            ))}
          </div>
        </Container>
      </section>

      <Container className="py-12">
        <div className="flex items-end justify-between gap-4">
          <Reveal><SectionHeading kicker="Heritage, preserved" title="Memories of the town" accentClass="bg-gold-brand" /></Reveal>
          <Link to="/community" className="shrink-0 text-sm font-semibold text-gold-text hover:underline">The Memory Wall →</Link>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{memories.map((m, i) => <StaggerItem key={m.id} index={i} lift><MemoryCard memory={m} /></StaggerItem>)}</div>
        <p className="mt-10 flex items-center justify-center gap-2 text-center font-serif text-lg italic text-ink-muted">
          <Adinkra name="nkyinkyim" size={18} labelled={false} className="text-gold-brand" />We hold both stories: the pride and the wound.
        </p>
      </Container>
    </>
  );
}
