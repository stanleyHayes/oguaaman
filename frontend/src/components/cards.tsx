import { useState } from "react";
import { Link } from "react-router-dom";
import type { Listing, NewsArticle } from "@/lib/types";
import { TONES, type NavSection } from "@/lib/sections";
import { Card, Pill } from "./ui";
import { Adinkra } from "./adinkra";
import { SectionIcon } from "./section-icon";
import { dayMonth, formatDate, lifeDates, tagLabel, initials } from "@/lib/format";
import { cldCover } from "@/lib/cloudinary";

// ── Gradient placeholder (no hosted images) ──────────────────────────────────
const GRADIENTS: [string, string][] = [
  ["#1B5A3F", "#0C2C1F"],
  ["#C7A24A", "#8A5E1F"],
  ["#B0503C", "#7C2D2D"],
  ["#0E7C6B", "#0B6557"],
  ["#D9C8A6", "#B07D32"],
  ["#3B473D", "#123F2D"],
];
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = Math.trunc(h * 31 + (s.codePointAt(i) ?? 0));
  return Math.abs(h);
}
export function Thumb({
  seed,
  label,
  src,
  className = "",
  rounded = "rounded-[var(--radius-card)]",
  coverWidth = 600,
}: Readonly<{
  seed: string;
  label?: string;
  /** A contributor-supplied cover image. Falls back to the gradient if it fails to load. */
  src?: string;
  className?: string;
  rounded?: string;
  /** Target CSS width for Cloudinary delivery sizing; small slots can pass less. */
  coverWidth?: number;
}>) {
  const [a, b] = GRADIENTS[hash(seed) % GRADIENTS.length];
  const [failed, setFailed] = useState(false);
  // The gradient is always the backdrop, so it shows while the image loads or if it 404s.
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${rounded} ${className}`}
      style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
      aria-hidden={!src}
    >
      <span className="bg-dotgrid absolute inset-0 opacity-50" />
      {src && !failed ? (
        <img src={cldCover(src, coverWidth)} alt={label ?? ""} loading="lazy" className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        label && <span className="relative text-3xl font-semibold text-cream/90">{label}</span>
      )}
    </div>
  );
}

export function ArtistCard({ artist }: Readonly<{ artist: Listing }>) {
  const d = artist.details;
  return (
    <Card as="article" className="group h-full overflow-hidden">
      <Link to={`/music/${artist.slug}`} className="block">
        <Thumb seed={artist.slug} label={initials(d.actName ?? artist.title)} src={artist.coverImageUrl} rounded="rounded-none" className="aspect-[4/3] w-full" />
        <div className="p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xl font-semibold text-ink group-hover:text-clay-text">{d.actName ?? artist.title}</h3>
            {d.spotlight && (
              <span className="rounded-full bg-clay px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-cream">Spotlight</span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(d.genres ?? []).map((g) => <Pill key={g} tone="clay">{g}</Pill>)}
          </div>
          <p className="mt-3 line-clamp-2 text-sm text-ink-muted">{d.bio}</p>
        </div>
      </Link>
    </Card>
  );
}

export function EventCard({ event }: Readonly<{ event: Listing }>) {
  const { day, mon } = dayMonth(event.details.startsAt ?? event.createdAt);
  return (
    <Link to={`/events/${event.slug}`} className="block">
      <Card as="article" className="flex items-center gap-4 p-4 transition-shadow hover:shadow-[var(--shadow-lift)]">
      {event.coverImageUrl ? (
        // Cover photo with a date ribbon, so the card shows the image without a redundant date box.
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg">
          <Thumb seed={event.slug} src={event.coverImageUrl} rounded="rounded-none" className="h-full w-full" coverWidth={128} />
          <span className="absolute inset-x-0 bottom-0 bg-green/85 py-0.5 text-center text-[0.58rem] font-bold uppercase tracking-wide text-cream">{day} {mon}</span>
        </div>
      ) : (
        <div className="flex w-14 shrink-0 flex-col items-center rounded-lg border border-sand bg-paper py-2">
          <span className="text-xl leading-none text-green">{day}</span>
          <span className="mt-1 text-[0.6rem] font-bold uppercase tracking-wide text-gold-text">{mon}</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="flex min-w-0 items-center gap-2 font-medium text-ink">
          <span className="min-w-0 flex-1 truncate">{event.title}</span>
          {event.details.anchorFestival && <Adinkra name="sankofa" size={15} className="shrink-0 text-gold-text" />}
        </h3>
        <p className="truncate text-sm text-ink-faint">
          {event.details.venue}
          {event.details.organiser ? ` · ${event.details.organiser}` : ""}
        </p>
      </div>
      </Card>
    </Link>
  );
}

export function SectionCard({ section }: Readonly<{ section: NavSection }>) {
  const t = TONES[section.tone];
  return (
    <Link
      to={section.href}
      className="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"
    >
      <SectionIcon id={section.id} className={`pointer-events-none absolute -right-5 -top-5 h-28 w-28 opacity-[0.06] transition-opacity group-hover:opacity-[0.1] ${t.text}`} />
      <div className="relative flex items-center justify-between">
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${t.soft} ${t.text}`}>
          <SectionIcon id={section.id} className="h-6 w-6" />
        </span>
        {section.depth === "stub" && (
          <span className="rounded-full border border-sand bg-paper px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-ink-faint">Coming soon</span>
        )}
      </div>
      <h3 className="relative mt-3 text-2xl font-semibold text-ink">{section.label}</h3>
      {section.fanteName && <p className={`relative text-sm italic ${t.text}`}>{section.fanteName}</p>}
      <p className="relative mt-2 text-sm text-ink-muted">{section.tagline}</p>
      {/* Action docks to the bottom so cards in a row share one height. */}
      <span className={`relative mt-auto pt-4 text-sm font-semibold ${t.text}`}>Explore →</span>
    </Link>
  );
}

export function MemorialCard({ memorial }: Readonly<{ memorial: Listing }>) {
  const d = memorial.details;
  // Portraits first; otherwise the first life-photo from the gallery — a real
  // image beats the parchment initials disc (seeded memorials carry galleries).
  const cover = memorial.coverImageUrl ?? (Array.isArray(d.gallery) ? (d.gallery[0] as { url?: string } | undefined)?.url : undefined);
  return (
    <Link
      to={`/memoriam/${memorial.slug}`}
      className="group flex h-full flex-col items-center rounded-[var(--radius-card)] border border-sand bg-cream p-6 text-center shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]"
    >
      {cover ? (
        <Thumb seed={memorial.slug} label={initials(memorial.title)} src={cover} rounded="rounded-full" className="h-20 w-20 border border-gold-border/40" />
      ) : (
        <span
          className="flex h-20 w-20 items-center justify-center rounded-full border border-gold-border/40 text-2xl text-green"
          style={{ background: "radial-gradient(circle at 50% 38%, #F0E4CC, #E2D2AE)" }}
          aria-hidden
        >
          {initials(memorial.title)}
        </span>
      )}
      <h3 className="mt-4 text-2xl font-semibold text-ink group-hover:text-gold-text">
        {d.honorific ? `${d.honorific} ` : ""}{memorial.title}
      </h3>
      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-gold-text">{lifeDates(d.bornYear, d.diedDate)}</p>
      {d.epitaph && <p className="mt-3 font-serif text-sm italic text-ink-muted">“{d.epitaph}”</p>}
      <p className="mt-auto pt-4 inline-flex items-center gap-1.5 text-xs text-ink-faint">
        <Adinkra name="nyame-nwu-na-mawu" size={14} labelled={false} className="text-gold-brand" />
        {d.candles ?? 0} candles · {d.rememberedByCount ?? 0} remembering
      </p>
    </Link>
  );
}

export function BusinessCard({ business }: Readonly<{ business: Listing }>) {
  const d = business.details;
  return (
    <Card as="article" className="h-full overflow-hidden">
      <Link to={`/business/${business.slug}`} className="group flex h-full flex-col">
        {business.coverImageUrl && <Thumb seed={business.slug} src={business.coverImageUrl} rounded="rounded-none" className="aspect-[16/9] w-full" />}
        <div className="flex flex-1 flex-col p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="teal">{d.category}</Pill>
            {business.supporter && <Pill tone="gold">★ Supporter</Pill>}
          </div>
          <h3 className="mt-3 text-xl font-semibold text-ink group-hover:text-teal-text">{business.title}</h3>
          <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{d.description}</p>
          {d.address && <p className="mt-auto pt-3 text-xs text-ink-faint">📍 {d.address}</p>}
        </div>
      </Link>
    </Card>
  );
}

const OPP_LABEL: Record<string, string> = {
  scholarship: "Scholarship", internship: "Internship", apprenticeship: "Apprenticeship", training: "Training", job: "Job", investment: "Investment", mentorship: "Mentorship",
};
export function OpportunityCard({ opp }: Readonly<{ opp: Listing }>) {
  const d = opp.details;
  return (
    <Card as="article" className="flex h-full flex-col p-5">
      {opp.coverImageUrl && <Thumb seed={opp.slug} src={opp.coverImageUrl} rounded="rounded-lg" className="mb-4 aspect-[16/9] w-full" />}
      <div className="flex items-center justify-between gap-2">
        <Pill tone="teal">{OPP_LABEL[d.kind ?? ""] ?? d.kind}</Pill>
        {d.deadline && <span className="text-xs text-clay-text">Apply by {formatDate(d.deadline)}</span>}
      </div>
      <h3 className="mt-3 text-xl font-semibold text-ink">{opp.title}</h3>
      <p className="mt-2 text-sm text-ink-muted">{d.description}</p>
      <p className="mt-3 text-xs text-ink-faint"><span className="font-medium text-ink-muted">Eligibility:</span> {d.eligibility}</p>
      {d.guardianConsentRequired === true && (
        <p className="mt-2 text-xs text-maroon-900">Guardian consent required for under-18 participants.</p>
      )}
      <div className="mt-auto pt-4">
        <span className="text-xs text-ink-faint">{d.provider}</span>
        {d.applyUrl && (
          <a href={d.applyUrl} target="_blank" rel="noopener noreferrer" className="ml-3 text-sm font-semibold text-teal-text hover:underline">
            How to apply →
          </a>
        )}
      </div>
    </Card>
  );
}

export function PersonCard({ person }: Readonly<{ person: Listing }>) {
  const d = person.details;
  return (
    <Card as="article" className="group h-full overflow-hidden">
      <Link to={`/people/${person.slug}`} className="flex h-full gap-4 p-5">
        <Thumb seed={person.slug} label={initials(person.title)} src={person.coverImageUrl} className="h-16 w-16 shrink-0" coverWidth={140} />
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-ink group-hover:text-gold-text">{person.title}</h3>
          <p className="text-xs uppercase tracking-wide text-gold-text">{d.era}{d.living ? "" : " · in memory"}</p>
          <p className="mt-2 line-clamp-3 text-sm text-ink-muted">{d.whyNotable}</p>
        </div>
      </Link>
    </Card>
  );
}

export function NewsCard({ article, lead = false }: Readonly<{ article: NewsArticle; lead?: boolean }>) {
  return (
    <Link
      to={`/news/${article.slug}`}
      className={`group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)] ${lead ? "sm:col-span-2 lg:col-span-1" : ""}`}
    >
      {article.coverImageUrl ? (
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: lead ? "16 / 9" : "16 / 10" }}>
          <img src={article.coverImageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          <span className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: article.coverColor ?? "#123F2D" }} aria-hidden />
        </div>
      ) : (
        <div className="w-full" style={{ height: lead ? 12 : 10, backgroundColor: article.coverColor ?? "#123F2D" }} />
      )}
      <div className="flex flex-1 flex-col p-6">
        {lead && <p className="text-[0.66rem] font-bold uppercase tracking-wider text-gold-text">Latest</p>}
        <h3 className={`font-semibold text-ink group-hover:text-green ${lead ? "mt-1 text-2xl" : "text-xl"}`}>{article.title}</h3>
        {article.summary && <p className="mt-2 line-clamp-3 text-sm text-ink-muted">{article.summary}</p>}
        <p className="mt-auto pt-4 text-xs text-ink-faint">{article.authorName} · {formatDate(article.publishedAt ?? article.createdAt)}</p>
      </div>
    </Link>
  );
}

export function MemoryCard({ memory }: Readonly<{ memory: Listing }>) {
  return (
    <Card as="article" className="flex h-full flex-col p-5">
      {memory.coverImageUrl && <Thumb seed={memory.title} src={memory.coverImageUrl} rounded="rounded-lg" className="mb-3 aspect-[4/3] w-full" />}
      <h3 className="text-lg font-semibold text-ink">{memory.title}</h3>
      <p className="mt-2 font-serif text-sm leading-relaxed text-ink">{memory.details.text}</p>
      <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
        {memory.tags.slice(0, 4).map((t) => <Pill key={t}>{tagLabel(t)}</Pill>)}
      </div>
    </Card>
  );
}

// ── Featured: a cross-type paid placement card for the front page ─────────────
const FEATURED_LABEL: Record<string, string> = {
  artist: "Artist", business: "Business", event: "Event", memorial: "In memoriam",
  person: "Person", memory: "Memory", opportunity: "Opportunity",
};
function featuredHref(l: Listing): string {
  switch (l.type) {
    case "artist": return `/music/${l.slug}`;
    case "business": return `/business/${l.slug}`;
    case "memorial": return `/memoriam/${l.slug}`;
    case "event": return `/events/${l.slug}`;
    case "person": return `/people/${l.slug}`;
    case "project": return `/projects/${l.slug}`;
    default: return "/community";
  }
}
function featuredSubtitle(l: Listing): string {
  const d = l.details;
  switch (l.type) {
    case "artist": return (d.genres ?? []).join(" · ") || "Oguaa artist";
    case "business": return d.category || d.address || "Cape Coast";
    case "memorial": return d.epitaph || lifeDates(d.bornYear, d.diedDate) || "Remembered";
    case "event": return [d.startsAt ? formatDate(d.startsAt) : "", d.venue].filter(Boolean).join(" · ") || "Cape Coast";
    case "person": return d.whyNotable || d.era || "A son or daughter of Oguaa";
    case "project": return d.organiser || "Adopt a project";
    default: return d.description || d.text || "Cape Coast";
  }
}
// Bold per-type colours so the showcase reads vibrant, not uniform.
const FEATURED_GRADIENTS: Record<string, string> = {
  business: "linear-gradient(135deg, #0E7C6B 0%, #0B6557 60%, #083f37 100%)",
  artist: "linear-gradient(135deg, #B0503C 0%, #7C2D2D 100%)",
  event: "linear-gradient(135deg, #C7A24A 0%, #B07D32 55%, #8A5E1F 100%)",
  memorial: "linear-gradient(135deg, #3B473D 0%, #123F2D 100%)",
  person: "linear-gradient(135deg, #1B5A3F 0%, #0C2C1F 100%)",
};
const FEATURED_FALLBACK = [
  "linear-gradient(135deg, #0E7C6B 0%, #083f37 100%)",
  "linear-gradient(135deg, #B0503C 0%, #7C2D2D 100%)",
  "linear-gradient(135deg, #C7A24A 0%, #8A5E1F 100%)",
  "linear-gradient(135deg, #1B5A3F 0%, #0C2C1F 100%)",
];

/**
 * A large, vivid feature tile for a paid placement (any listing type): full-bleed
 * colour (or cover image) with white text over a legibility scrim. `hero` makes it
 * the oversized lead card. Drives the homepage's "Featured" showcase.
 */
export function FeaturedCard({ listing, hero = false, index = 0 }: Readonly<{ listing: Listing; hero?: boolean; index?: number }>) {
  const title = listing.details.actName ?? listing.title;
  const grad = FEATURED_GRADIENTS[listing.type] ?? FEATURED_FALLBACK[index % FEATURED_FALLBACK.length];
  return (
    <Link
      to={featuredHref(listing)}
      className={`group relative flex h-full flex-col justify-end overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)] ${hero ? "min-h-[22rem] lg:min-h-[27rem]" : "min-h-[13rem]"}`}
    >
      <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-105" style={{ background: grad }} aria-hidden />
      {listing.coverImageUrl && (
        <img src={cldCover(listing.coverImageUrl, hero ? 1000 : 600)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-70 transition-transform duration-500 group-hover:scale-105" />
      )}
      <span className="bg-dotgrid absolute inset-0 opacity-25" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 top-1/4 bg-gradient-to-t from-black/75 via-black/35 to-transparent" aria-hidden />
      <div className={`relative ${hero ? "p-7 sm:p-9" : "p-5"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-gold-brand px-2.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-green-900 shadow-[var(--shadow-card)]">★ Featured</span>
          <span className="rounded-full bg-cream/20 px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-cream backdrop-blur-sm">{FEATURED_LABEL[listing.type] ?? listing.type}</span>
        </div>
        <h3 className={`mt-3 font-semibold leading-[1.05] text-cream ${hero ? "text-4xl sm:text-5xl" : "text-2xl"}`}>{title}</h3>
        <p className={`mt-2 text-cream/85 ${hero ? "max-w-lg text-base line-clamp-3" : "line-clamp-2 text-sm"}`}>{featuredSubtitle(listing)}</p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-cream">
          {listing.type === "business" ? "Visit business" : "View"} <span className="transition-transform group-hover:translate-x-1">→</span>
        </span>
      </div>
    </Link>
  );
}
