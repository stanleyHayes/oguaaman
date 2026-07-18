import { createElement, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Section, SectionHeading, Pill, Card } from "@/components/ui";
import { Stagger, StaggerItem } from "@/components/motion";
import { sceneForSlug } from "@/components/scenes";
import { mediaUrl } from "@/lib/media";
import { useHeritageDirectory, type Organization } from "@/lib/org";

type Category = "highlights" | "all" | "history" | "nature" | "town";
type PlaceCategory = Exclude<Category, "highlights" | "all">;

const FILTERS: ReadonlyArray<{ id: Category; label: string }> = [
  { id: "highlights", label: "Start here" },
  { id: "all", label: "All places" },
  { id: "history", label: "History & memory" },
  { id: "nature", label: "Forest & coast" },
  { id: "town", label: "Town life" },
];

const PRIORITY = [
  "cape-coast-castle",
  "kakum-national-park",
  "bakaano-fishing-shore",
  "kotokuraba-market",
  "fosu-lagoon",
  "fort-william-lighthouse",
  "elmina-castle",
  "assin-manso-slave-river",
] as const;

const HIGHLIGHTS = new Set<string>(PRIORITY.slice(0, 6));

const SCENE_SLUGS = [
  ...PRIORITY,
  "fort-william-anomabu",
  "fort-victoria-cape-coast",
  "victoria-park-cape-coast",
  "hans-cottage-botel",
  "brenu-akyinim-beach",
  "biriwa-beach",
  "chapel-square-cape-coast",
] as const;

const PLACE_SCENES = new Map<string, ReturnType<typeof sceneForSlug>>(
  SCENE_SLUGS.map((slug) => [slug, sceneForSlug(slug)]),
);
const FALLBACK_SCENE = sceneForSlug("");

const TONES = ["gold", "green", "teal", "clay"] as const;

function categoryFor(place: Organization): PlaceCategory {
  const text = `${place.slug} ${place.name} ${place.classification ?? ""}`.toLowerCase();
  if (/market|victoria park|chapel|square/.test(text)) return "town";
  if (/kakum|rainforest|canopy|lagoon|beach|shore|cottage|wetland|national park|fishing/.test(text)) return "nature";
  return "history";
}

function sortPlaces(places: Organization[]): Organization[] {
  const rank = new Map<string, number>(PRIORITY.map((slug, index) => [slug, index]));
  return [...places].sort((a, b) => {
    const aRank = rank.get(a.slug) ?? PRIORITY.length;
    const bRank = rank.get(b.slug) ?? PRIORITY.length;
    return aRank - bRank || a.name.localeCompare(b.name);
  });
}

function gridSpan(index: number, total: number): string {
  if (total === 1) return "lg:col-span-12";
  if (index === 0) return "lg:col-span-7";
  if (index === 1) return "lg:col-span-5";

  const tailCount = total - 2;
  const tailIndex = index - 2;
  if (tailCount === 1) return "lg:col-span-12";
  if (tailCount % 3 === 1 && tailIndex >= tailCount - 4) return "lg:col-span-6";
  if (tailCount % 3 === 2 && tailIndex >= tailCount - 2) return "lg:col-span-6";
  return "lg:col-span-4";
}

function DestinationMedia({ place, featured }: Readonly<{ place: Organization; featured: boolean }>) {
  const scene = PLACE_SCENES.get(place.slug) ?? FALLBACK_SCENE;
  const photo = (place.gallery ?? []).find((asset) => asset.url);

  return (
    <div className={`og-card-media relative w-full overflow-hidden ${featured ? "aspect-[16/9]" : "aspect-[4/3]"}`} aria-hidden="true">
      <div className="absolute inset-0">{createElement(scene, { className: "size-full" })}</div>
      {photo?.url && (
        <img
          src={mediaUrl(photo.url)}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover transition-transform duration-700 motion-safe:group-hover:scale-[1.035] motion-safe:group-focus-visible:scale-[1.035]"
          onError={(event) => { event.currentTarget.style.display = "none"; }}
        />
      )}
      <span className="on-dark-pin absolute right-4 top-4 z-[3] rounded-full border border-cream/25 bg-green-900/70 px-3 py-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-cream backdrop-blur-sm">
        {photo ? "Photo field note" : "Illustrated field note"}
      </span>
    </div>
  );
}

function DirectorySkeleton() {
  return (
    <Section id="field-guide" tone="cream" size="wide" className="scroll-mt-24">
      <div role="status" aria-busy="true">
        <span className="sr-only">Preparing the Cape Coast field guide</span>
        <div aria-hidden>
          <div className="h-3 w-36 animate-pulse rounded-full bg-green/10 motion-reduce:animate-none" />
          <div className="mt-4 h-10 w-full max-w-xl animate-pulse rounded-xl bg-green/10 motion-reduce:animate-none" />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-12">
            {["one", "two", "three", "four", "five"].map((key, index) => (
              <div key={key} className={`overflow-hidden rounded-[var(--radius-card)] border border-green/10 bg-paper ${gridSpan(index, 5)}`}>
                <div className="aspect-[16/10] animate-pulse bg-green/10 motion-reduce:animate-none" />
                <div className="space-y-3 p-6"><div className="h-4 w-2/3 animate-pulse rounded-full bg-green/10 motion-reduce:animate-none" /><div className="h-3 w-full animate-pulse rounded-full bg-green/10 motion-reduce:animate-none" /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function DirectoryUnavailable() {
  return (
    <Section id="field-guide" tone="cream" size="wide" className="scroll-mt-24">
      <div className="rounded-[1.5rem] border border-green/15 bg-paper p-7 shadow-[var(--shadow-card)] sm:p-10">
        <p className="eyebrow text-gold-text">THE LIVE FIELD GUIDE</p>
        <h2 className="mt-3 text-3xl font-semibold text-ink">The places are between tides.</h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted">
          The live directory could not be reached just now. The itinerary and practical guide below are still here, and the destination stories will return when the connection does.
        </p>
        <a href="#plan" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream hover:bg-green-900">
          Continue to the trip planner ↓
        </a>
      </div>
    </Section>
  );
}

/** A photo-led, filterable atlas backed by the live heritage directory. */
export function Sites() {
  const { status, items } = useHeritageDirectory();
  const [category, setCategory] = useState<Category>("highlights");
  const ordered = useMemo(() => sortPlaces(items), [items]);
  const filtered = useMemo(
    () => {
      if (category === "all") return ordered;
      if (category === "highlights") return ordered.filter((place) => HIGHLIGHTS.has(place.slug));
      return ordered.filter((place) => categoryFor(place) === category);
    },
    [category, ordered],
  );
  const counts = useMemo(() => ({
    highlights: ordered.filter((place) => HIGHLIGHTS.has(place.slug)).length,
    all: ordered.length,
    history: ordered.filter((place) => categoryFor(place) === "history").length,
    nature: ordered.filter((place) => categoryFor(place) === "nature").length,
    town: ordered.filter((place) => categoryFor(place) === "town").length,
  }), [ordered]);

  if (status === "loading") return <DirectorySkeleton />;
  if (status === "error" || ordered.length === 0) return <DirectoryUnavailable />;

  return (
    <Section id="field-guide" tone="cream" size="wide" className="scroll-mt-24">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <SectionHeading
          kicker="THE CAPE COAST FIELD GUIDE"
          title="Choose your edge of Oguaa."
          lede="The landmark journeys and the local ones — photographed when the community has supplied a view, illustrated when it has not. Every place opens into its full story."
        />
        <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-ink-faint lg:pb-1 lg:text-right">
          {ordered.length} places · live directory
        </p>
      </div>

      <div className="mt-9 flex flex-wrap gap-2" role="group" aria-label="Filter places by character">
        {FILTERS.map((filter) => {
          const active = category === filter.id;
          const count = counts[filter.id];
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => setCategory(filter.id)}
              disabled={count === 0}
              aria-pressed={active}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-green bg-green text-cream" : "border-green/15 bg-paper text-green hover:border-green/45 hover:bg-green/[0.04]"}`}
            >
              {filter.label}
              <span className={`grid size-6 place-items-center rounded-full font-mono text-[0.6rem] ${active ? "bg-cream/15 text-cream" : "bg-green/[0.08] text-green"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <Stagger className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-12">
        {filtered.map((place, index) => {
          const featured = index < 2;
          const tone = TONES[index % TONES.length];
          return (
            <StaggerItem key={place.slug} index={index} className={`min-w-0 ${gridSpan(index, filtered.length)}`}>
              <Link to={`/visit/${place.slug}`} className="group block h-full rounded-[var(--radius-card)]">
                <Card accent={tone} interactive className="flex h-full flex-col">
                  <DestinationMedia place={place} featured={featured} />
                  <div className="flex flex-1 flex-col p-6 sm:p-7">
                    <div className="flex flex-wrap items-center gap-2">
                      {place.classification && <Pill tone={tone}>{place.classification}</Pill>}
                      {place.verified && <span className="font-mono text-[0.58rem] uppercase tracking-[0.14em] text-teal-text">Community verified</span>}
                    </div>
                    <h3 className={`mt-5 font-semibold text-ink transition-colors group-hover:text-green group-focus-visible:text-green ${featured ? "text-2xl" : "text-xl"}`}>{place.name}</h3>
                    {place.jurisdiction && <p className="mt-2 font-mono text-[0.6rem] uppercase tracking-[0.13em] text-gold-text">{place.jurisdiction}</p>}
                    <p className={`mt-3 text-sm leading-relaxed text-ink-muted ${featured ? "line-clamp-3" : "line-clamp-2"}`}>{place.summary}</p>
                    <span className="og-card-action mt-auto border-t border-green/10 pt-4">
                      <span>Open the field guide</span>
                      <span className="og-card-action-mark" aria-hidden>→</span>
                    </span>
                  </div>
                </Card>
              </Link>
            </StaggerItem>
          );
        })}
      </Stagger>
    </Section>
  );
}
