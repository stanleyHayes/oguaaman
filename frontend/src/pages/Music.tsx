import { Link, useLoaderData, useSearchParams } from "react-router-dom";
import type { Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta, SectionHeading, SampleNote } from "@/components/ui";
import { Adinkra } from "@/components/adinkra";
import { ArtistCard, PersonCard } from "@/components/cards";
import { LayoutPill, StaggerItem } from "@/components/motion";
import { EmptyState, EmptyGlyph } from "@/components/empty-state";
import { SAMPLE_NOTICE } from "@/lib/content";

interface Data {
  artists: Listing[];
  genres: string[];
  legacy: Listing[];
}

export async function loader(): Promise<Data> {
  const [artists, genres, legacy] = await Promise.all([api.artists(), api.genres(), api.musicLegacy()]);
  return { artists, genres, legacy };
}

export function Component() {
  const { artists, genres, legacy } = useLoaderData() as Data;
  const [params] = useSearchParams();
  const genre = params.get("genre") ?? undefined;
  const shown = genre ? artists.filter((a) => (a.details.genres ?? []).includes(genre)) : artists;

  return (
    <>
      <PageHero
        tone="clay"
        kicker="The flagship · launch deep"
        title="The Oguaa Sound"
        symbol="sankofa"
        image="/uploads/seed/fetu-flagbearer.jpg"
        lede="Local artists are the most starved of a spotlight and the most motivated to share. Give a musician a real profile and they push it to their following — music goes through the door first."
      >
        <div className="flex flex-wrap gap-3">
          <Cta to="/music/the-oguaa-sound" variant="gold">Read “The Oguaa Sound”</Cta>
          <Cta to="/submit?type=artist" variant="outline-dark">Nominate an artist</Cta>
        </div>
      </PageHero>

      <Container size="wide" className="py-12 sm:py-16">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-ink-faint">Browse by genre:</span>
          <GenreChip label="All" to="/music" active={!genre} />
          {genres.map((g) => (
            <GenreChip key={g} label={g} to={`/music?genre=${encodeURIComponent(g)}`} active={genre === g} />
          ))}
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((a, i) => <StaggerItem key={a.id} index={i} lift><ArtistCard artist={a} /></StaggerItem>)}
        </div>
        {shown.length === 0 && (
          <EmptyState
            icon={<EmptyGlyph name="users" />}
            title={`No artists in “${genre}” yet`}
            actions={<Link to="/submit?type=artist" className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream">Nominate one →</Link>}
          />
        )}

        <p className="mt-8 rounded-[var(--radius-card)] border border-dashed border-sand bg-cream p-4 text-center text-sm text-ink-muted">
          <span className="font-medium text-ink">We link out, we don't host.</span> Every artist page carries streaming links to Audiomack, Boomplay, YouTube and Spotify — no audio is hosted here.
        </p>
      </Container>

      <section className="bg-cream py-14">
        <Container size="wide">
          <SectionHeading kicker="Where it comes from" title="The grandfathers of the sound" lede="Before today's artists, the coastal osode rhythm of the fishermen became a national sound. We open at their feet." accentClass="bg-gold-brand" />
          <div className="mt-8 grid gap-5 sm:grid-cols-2">{legacy.map((p, i) => <StaggerItem key={p.id} index={i} lift><PersonCard person={p} /></StaggerItem>)}</div>
          <p className="mt-5 inline-flex items-center gap-2 text-sm text-ink-faint">
            <Adinkra name="sankofa" size={16} labelled={false} className="text-gold-brand" />San kɔfa — go back and fetch it.
          </p>
        </Container>
      </section>

      <Container><SampleNote>{SAMPLE_NOTICE}</SampleNote></Container>
    </>
  );
}

function GenreChip({ label, to, active }: Readonly<{ label: string; to: string; active: boolean }>) {
  return (
    <Link to={to} className={`relative rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${active ? "border-clay text-cream" : "border-sand bg-cream text-ink-muted hover:border-clay"}`}>
      {active && <LayoutPill layoutId="genre-chip" className="absolute inset-0 rounded-full bg-clay" />}
      <span className="relative">{label}</span>
    </Link>
  );
}
