import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router-dom";
import type { Listing, Organization } from "@/lib/types";
import { api } from "@/lib/api";
import { Container, Pill, SampleNote } from "@/components/ui";
import { Thumb } from "@/components/cards";
import { cldCover } from "@/lib/cloudinary";
import { ReportButton } from "@/components/report-button";
import { initials } from "@/lib/format";
import { SAMPLE_NOTICE } from "@/lib/content";

interface Data {
  artist: Listing;
  school: Organization | null;
}

export async function loader({ params }: LoaderFunctionArgs): Promise<Data> {
  const artist = await api.artist(params.slug!);
  let school: Organization | null = null;
  const sid = artist.schoolIds?.[0];
  if (sid) {
    school = await api.institution(sid).then((v) => v.institution).catch(() => null);
  }
  return { artist, school };
}

type Svc = "spotify" | "youtube" | "audiomack" | "boomplay" | "default";
const STREAM: Record<string, { chip: string; icon: Svc }> = {
  Spotify: { chip: "bg-green/15 text-green", icon: "spotify" },
  Audiomack: { chip: "bg-clay/15 text-clay-text", icon: "audiomack" },
  Boomplay: { chip: "bg-teal/15 text-teal-text", icon: "boomplay" },
  YouTube: { chip: "bg-maroon-900/15 text-maroon-900", icon: "youtube" },
};

function Headphones({ className = "" }: Readonly<{ className?: string }>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="13.5" width="4.5" height="6.5" rx="1.6" /><rect x="16.5" y="13.5" width="4.5" height="6.5" rx="1.6" />
    </svg>
  );
}
function SvcIcon({ name, className = "" }: Readonly<{ name: Svc; className?: string }>) {
  const body = {
    spotify: <><circle cx="12" cy="12" r="9" /><path d="M7.5 10c3-1 6-.7 8.5 1" /><path d="M8 13c2.2-.7 4.6-.5 6.6.8" /><path d="M8.6 15.6c1.6-.5 3.3-.3 4.8.6" /></>,
    youtube: <><rect x="3" y="6" width="18" height="12" rx="3.5" /><path d="M11 9.5l4.2 2.5-4.2 2.5Z" fill="currentColor" stroke="none" /></>,
    audiomack: <path d="M5 10.5v3M8.5 7.5v9M12 9.5v5M15.5 6v12M19 10.5v3" />,
    boomplay: <><circle cx="12" cy="12" r="9" /><path d="M10 8.5l5 3.5-5 3.5Z" fill="currentColor" stroke="none" /></>,
    default: <><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></>,
  }[name];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {body}
    </svg>
  );
}

export function Component() {
  const { artist, school } = useLoaderData() as Data;
  const d = artist.details;

  return (
    <>
      <section className="on-dark relative overflow-hidden text-cream">
        {/* Cover art washes the hero; a clay gradient + scrim keep it legible */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(140deg,#B0503C 0%,#7C2D2D 45%,#0C2C1F 100%)" }} aria-hidden />
        {artist.coverImageUrl && (
          <img src={cldCover(artist.coverImageUrl, 1400)} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-25" onError={(e) => { e.currentTarget.style.display = "none"; }} />
        )}
        <div className="bg-dotgrid absolute inset-0 opacity-40" aria-hidden />
        <Container size="wide" className="relative py-12 sm:py-16">
          <Link to="/music" className="text-sm text-cream/70 hover:text-gold">← All artists</Link>
          <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end">
            <Thumb seed={artist.slug} label={initials(d.actName ?? artist.title)} src={artist.coverImageUrl} className="h-36 w-36 shrink-0 border-2 border-gold/50 shadow-xl sm:h-44 sm:w-44" coverWidth={400} />
            <div className="min-w-0">
              {d.spotlight && <span className="rounded-full bg-gold-brand px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-green-900">★ This week's spotlight</span>}
              <h1 className="mt-2 text-4xl font-semibold leading-[1.05] sm:text-6xl">{d.actName ?? artist.title}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                {(d.genres ?? []).map((g) => <span key={g} className="rounded-full border border-cream/25 bg-cream/10 px-3 py-1 text-xs text-cream/90 backdrop-blur-sm">{g}</span>)}
              </div>
              {(d.streamingLinks ?? []).length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {(d.streamingLinks ?? []).map((l) => (
                    <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-cream/15 px-3.5 py-1.5 text-xs font-semibold text-cream backdrop-blur-sm transition-colors hover:bg-gold-brand hover:text-green-900">
                      Listen on {l.label} <span aria-hidden>↗</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Container>
      </section>

      <Container size="wide" className="grid gap-10 py-12 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <h2 className="eyebrow mb-3 text-clay-text">About</h2>
          <p className="font-serif text-lg leading-relaxed text-ink first-letter:float-left first-letter:mr-2 first-letter:text-5xl first-letter:font-semibold first-letter:leading-[0.85] first-letter:text-clay-text">{d.bio}</p>
          {d.latestRelease && (
            <div className="relative mt-8 overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)]">
              <span className="absolute inset-y-0 left-0 w-1 bg-gold-brand" aria-hidden />
              <p className="eyebrow text-gold-text">Latest release</p>
              <p className="mt-2 text-2xl text-ink">
                {d.latestRelease.title}
                {d.latestRelease.year ? <span className="ml-2 text-base text-ink-faint">{d.latestRelease.year}</span> : null}
              </p>
            </div>
          )}
          {artist.tags.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-2">{artist.tags.map((t) => <Pill key={t} tone="clay">#{t}</Pill>)}</div>
          )}
        </div>

        <aside className="space-y-6">
          <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream p-5">
            <Headphones className="pointer-events-none absolute -right-3 -top-3 h-20 w-20 text-clay-text opacity-[0.06]" />
            <div className="relative flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-clay/[0.12] text-clay-text"><Headphones className="h-[18px] w-[18px]" /></span>
              <div>
                <p className="eyebrow text-clay-text">Listen</p>
                <p className="text-xs text-ink-faint">We link out — no audio is hosted here.</p>
              </div>
            </div>
            <div className="relative mt-4 grid gap-2.5">
              {(d.streamingLinks ?? []).map((l) => {
                const meta = STREAM[l.label] ?? { chip: "bg-sand text-ink-muted", icon: "default" as const };
                return (
                  <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 rounded-xl border border-sand bg-paper px-3.5 py-2.5 transition-colors hover:border-clay/40 hover:bg-clay/[0.04]">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.chip}`}><SvcIcon name={meta.icon} className="h-[18px] w-[18px]" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{l.label}</span>
                      <span className="block text-xs text-ink-faint">Open in {l.label}</span>
                    </span>
                    <span className="text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-clay-text" aria-hidden>↗</span>
                  </a>
                );
              })}
              {(!d.streamingLinks || d.streamingLinks.length === 0) && (
                <p className="text-sm italic text-ink-faint">No streaming links yet — check back soon.</p>
              )}
            </div>
          </div>
          {school && (
            <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5 text-sm text-ink-muted">
              Reps <Link to={`/education/${school.slug}`} className="font-medium text-maroon-900 hover:underline">{school.name}</Link>
            </div>
          )}
        </aside>
      </Container>

      <Container className="flex items-center justify-between gap-4">
        <SampleNote>{SAMPLE_NOTICE}</SampleNote>
        <ReportButton listingId={artist.id} />
      </Container>
    </>
  );
}
