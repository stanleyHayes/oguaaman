import { Link, useLoaderData, useSearchParams } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing } from "@/lib/types";
import { api } from "@/lib/api";
import { Container, CTA as Cta, Pill, SampleNote } from "@/components/ui";
import { Adinkra } from "@/components/adinkra";
import { Thumb } from "@/components/cards";
import { LayoutPill, StaggerItem } from "@/components/motion";
import { EmptyGlyph, EmptyState } from "@/components/empty-state";
import { SAMPLE_NOTICE } from "@/lib/content";
import { initials } from "@/lib/format";

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
  usePageTitle("Music");
  const [params] = useSearchParams();
  const genre = params.get("genre") ?? undefined;
  const shown = genre ? artists.filter((artist) => (artist.details.genres ?? []).includes(genre)) : artists;
  const leadArtist = shown.find((artist) => artist.details.spotlight) ?? shown[0];
  const remainingArtists = leadArtist ? shown.filter((artist) => artist.id !== leadArtist.id) : [];

  return (
    <>
      <section className="on-dark on-dark-pin relative overflow-hidden bg-[#0c2c1f] text-cream">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(176,125,50,0.22),transparent_32%),radial-gradient(circle_at_84%_72%,rgba(14,124,107,0.18),transparent_30%)]" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-20 items-end gap-2 opacity-20" aria-hidden>
          {[36, 64, 42, 78, 54, 88, 48, 70, 38, 82, 58, 96, 46, 74, 52, 86, 40, 68, 50, 80, 44, 72, 56, 90].map((height, index) => (
            <span key={`${height}-${index}`} className="min-w-0 flex-1 rounded-t-full bg-gold" style={{ height: `${height}%` }} />
          ))}
        </div>

        <Container size="wide" className="relative grid min-h-[650px] items-center gap-12 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
          <div className="relative z-10 max-w-xl">
            <p className="eyebrow text-gold">Music from the coast</p>
            <h1 className="mt-5 text-5xl font-semibold leading-[0.94] text-cream sm:text-6xl lg:text-7xl">Turn up<br />the Oguaa sound.</h1>
            <p className="mt-7 text-base leading-relaxed text-cream/72 sm:text-lg">
              Highlife roots, gospel lift, brass, drill and salt-air rhythm. Meet the artists carrying Cape Coast into its next verse.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Cta to="/music/the-oguaa-sound" variant="gold">Read the Oguaa Sound</Cta>
              <Cta to="/submit?type=artist" variant="outline-dark">Nominate an artist</Cta>
            </div>
            <dl className="mt-10 grid grid-cols-3 border-y border-cream/15 py-5">
              <SoundStat value={artists.length} label="artists" />
              <SoundStat value={genres.length} label="genres" />
              <SoundStat value={legacy.length} label="legacy voices" />
            </dl>
          </div>

          <div className="relative z-10 min-w-0">
            {leadArtist ? <LeadArtist artist={leadArtist} activeGenre={genre} /> : <EmptyStage />}
          </div>
        </Container>
      </section>

      <section className="sticky top-14 z-30 border-b border-sand bg-cream/95 backdrop-blur-md sm:top-16 xl:top-[6.5rem]">
        <Container size="wide" className="flex items-center gap-3 overflow-x-auto py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">Tune by genre</span>
          <span className="h-5 w-px shrink-0 bg-sand" aria-hidden />
          <GenreChip label="All sounds" to="/music" active={!genre} />
          {genres.map((item) => (
            <GenreChip key={item} label={item} to={`/music?genre=${encodeURIComponent(item)}`} active={genre === item} />
          ))}
        </Container>
      </section>

      <section className="bg-paper py-16 sm:py-20">
        <Container size="wide">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow text-clay-text">On rotation</p>
              <h2 className="mt-3 text-4xl font-semibold text-ink sm:text-5xl">{genre ? `${genre}, from Oguaa` : "More voices from the city"}</h2>
            </div>
            <p className="text-sm text-ink-muted">{shown.length} {shown.length === 1 ? "artist" : "artists"} in this selection</p>
          </div>

          {shown.length === 0 ? (
            <EmptyState
              icon={<EmptyGlyph name="users" />}
              title={`No artists in “${genre}” yet`}
              actions={<Link to="/submit?type=artist" className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green">Nominate one →</Link>}
            />
          ) : remainingArtists.length > 0 ? (
            <div className="mt-9 grid gap-5 lg:grid-cols-2">
              {remainingArtists.map((artist, index) => (
                <StaggerItem key={artist.id} index={index} lift>
                  <ArtistRow artist={artist} />
                </StaggerItem>
              ))}
            </div>
          ) : (
            <div className="mt-9 rounded-[var(--radius-card)] border border-sand bg-cream px-6 py-8 text-sm leading-relaxed text-ink-muted">
              This is the only voice in this selection for now. Know another? <Link to="/submit?type=artist" className="font-semibold text-clay-text">Nominate an artist →</Link>
            </div>
          )}

          <div className="mt-9 flex flex-col gap-4 rounded-[var(--radius-card)] border border-dashed border-sand bg-cream p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div className="flex items-center gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-clay/[0.09] text-clay-text">
                <WaveIcon />
              </span>
              <div>
                <p className="font-semibold text-ink">We link out. We don’t host.</p>
                <p className="mt-0.5 text-sm text-ink-muted">Profiles lead to Audiomack, Boomplay, YouTube and Spotify, keeping listening with the artist.</p>
              </div>
            </div>
            <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-clay-text">Artist-first by design</span>
          </div>
        </Container>
      </section>

      <section className="on-dark on-dark-pin relative overflow-hidden bg-green py-16 text-cream sm:py-20">
        <Adinkra name="sankofa" size={310} labelled={false} className="pointer-events-none absolute -bottom-24 -right-16 text-cream/[0.035]" />
        <Container size="wide" className="relative">
          <div className="grid gap-8 border-b border-cream/15 pb-9 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
            <div>
              <p className="eyebrow text-gold">San kɔfa</p>
              <h2 className="mt-3 text-4xl font-semibold text-cream sm:text-5xl">Before the playlist,<br />there was the pulse.</h2>
            </div>
            <p className="max-w-2xl text-base leading-relaxed text-cream/70">
              The coastal osode rhythm of fishermen travelled into Ghana’s national sound. These are the grandfathers whose work still lives inside today’s music.
            </p>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {legacy.map((person, index) => (
              <StaggerItem key={person.id} index={index} lift>
                <LegacyVoice person={person} />
              </StaggerItem>
            ))}
          </div>

          <div className="mt-8 inline-flex items-center gap-2 text-sm text-cream/55">
            <Adinkra name="sankofa" size={17} labelled={false} className="text-gold" />
            San kɔfa — go back and fetch it.
          </div>
        </Container>
      </section>

      <Container><SampleNote>{SAMPLE_NOTICE}</SampleNote></Container>
    </>
  );
}

function SoundStat({ value, label }: Readonly<{ value: number; label: string }>) {
  return (
    <div className="px-3 first:pl-0 sm:px-5 sm:first:pl-0">
      <dt className="text-2xl font-semibold text-cream sm:text-3xl">{value}</dt>
      <dd className="mt-1 text-[0.68rem] uppercase tracking-[0.15em] text-cream/50">{label}</dd>
    </div>
  );
}

function LeadArtist({ artist, activeGenre }: Readonly<{ artist: Listing; activeGenre?: string }>) {
  const details = artist.details;
  return (
    <Link to={`/music/${artist.slug}`} className="group relative block overflow-hidden rounded-[var(--radius-card)] border border-cream/15 bg-cream/[0.06] p-3 shadow-2xl shadow-black/20">
      <div className="relative overflow-hidden rounded-[var(--radius-card)]">
        <Thumb seed={artist.slug} label={initials(details.actName ?? artist.title)} src={artist.coverImageUrl} rounded="rounded-none" className="aspect-[5/4] min-h-[390px] w-full transition-transform duration-700 group-hover:scale-[1.035]" coverWidth={1000} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#071f16] via-[#071f16]/25 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
          <div className="flex flex-wrap gap-2">
            {details.spotlight && <span className="rounded-full bg-gold-brand px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-green-900">Oguaa spotlight</span>}
            {activeGenre && <span className="rounded-full border border-cream/25 bg-green/50 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cream backdrop-blur-sm">{activeGenre} selection</span>}
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-gold">Now playing from Cape Coast</p>
          <h2 className="mt-2 text-4xl font-semibold text-cream sm:text-5xl">{details.actName ?? artist.title}</h2>
          <div className="mt-3 flex flex-wrap gap-x-2 text-sm text-cream/65">
            {(details.genres ?? []).map((item, index) => <span key={item}>{index > 0 ? `· ${item}` : item}</span>)}
          </div>
          {details.bio && <p className="mt-4 line-clamp-2 max-w-xl text-sm leading-relaxed text-cream/72">{details.bio}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-cream/15 pt-4 text-xs">
            {details.latestRelease && <span className="text-cream/65">Latest: <strong className="text-cream">{details.latestRelease.title}</strong>{details.latestRelease.year ? ` · ${details.latestRelease.year}` : ""}</span>}
            <span className="ml-auto font-semibold text-gold">Open artist profile →</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function EmptyStage() {
  return (
    <div className="flex aspect-[5/4] min-h-[390px] items-center justify-center rounded-[var(--radius-card)] border border-cream/15 bg-cream/[0.05]">
      <Adinkra name="sankofa" size={110} className="text-gold/70" />
    </div>
  );
}

function ArtistRow({ artist }: Readonly<{ artist: Listing }>) {
  const details = artist.details;
  return (
    <Link to={`/music/${artist.slug}`} className="group grid h-full min-h-[245px] overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] sm:grid-cols-[200px_1fr]">
      <Thumb seed={artist.slug} label={initials(details.actName ?? artist.title)} src={artist.coverImageUrl} rounded="rounded-none" className="h-56 w-full transition-transform duration-700 group-hover:scale-[1.04] sm:h-full" coverWidth={520} />
      <div className="flex min-w-0 flex-col p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-clay-text">Cape Coast artist</p>
            <h3 className="mt-1 text-2xl font-semibold text-ink transition-colors group-hover:text-clay-text">{details.actName ?? artist.title}</h3>
          </div>
          {details.spotlight && <Pill tone="gold">Spotlight</Pill>}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(details.genres ?? []).map((item) => <Pill key={item} tone="clay">{item}</Pill>)}
        </div>
        {details.bio && <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-ink-muted">{details.bio}</p>}
        <div className="mt-auto flex items-end justify-between gap-4 pt-5 text-xs">
          {details.latestRelease ? <span className="text-ink-faint">Latest · {details.latestRelease.title}{details.latestRelease.year ? ` (${details.latestRelease.year})` : ""}</span> : <span className="text-ink-faint">Explore their catalogue</span>}
          <span className="shrink-0 font-semibold text-clay-text">Listen out →</span>
        </div>
      </div>
    </Link>
  );
}

function LegacyVoice({ person }: Readonly<{ person: Listing }>) {
  return (
    <Link to={`/people/${person.slug}`} className="group grid min-h-[190px] overflow-hidden rounded-[var(--radius-card)] border border-cream/15 bg-cream/[0.055] sm:grid-cols-[155px_1fr]">
      <Thumb seed={person.slug} label={initials(person.title)} src={person.coverImageUrl} rounded="rounded-none" className="h-48 w-full transition-transform duration-700 group-hover:scale-[1.04] sm:h-full" coverWidth={420} />
      <div className="flex flex-col justify-center p-6">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-gold">{person.details.era ?? "Oguaa music legacy"}{person.details.living ? "" : " · In memory"}</p>
        <h3 className="mt-2 text-2xl font-semibold text-cream">{person.title}</h3>
        {person.details.whyNotable && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-cream/65">{person.details.whyNotable}</p>}
        <span className="mt-4 text-xs font-semibold text-gold">Read their story →</span>
      </div>
    </Link>
  );
}

function GenreChip({ label, to, active }: Readonly<{ label: string; to: string; active: boolean }>) {
  return (
    <Link to={to} className={`relative shrink-0 overflow-hidden rounded-full border px-4 py-2 text-sm font-medium transition-colors ${active ? "border-clay text-cream" : "border-sand bg-paper text-ink-muted hover:border-clay hover:text-clay-text"}`}>
      {active && <LayoutPill layoutId="genre-chip" className="absolute inset-0 rounded-full bg-clay" />}
      <span className="relative">{label}</span>
    </Link>
  );
}

function WaveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 12h3l2.2-5 3.2 10L14 9l2 6 2-3h3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
