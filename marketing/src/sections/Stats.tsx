import type { AdinkraName } from "@/components/adinkra";
import { useEffect, useState } from "react";
import { Section, SectionHeading } from "@/components/ui";
import { Adinkra } from "@/components/adinkra";
import { Stagger, StaggerItem } from "@/components/motion";

/**
 * Stats — a dark "community numbers" band (tone="green").
 *
 * The figures are seeded with the current real seed values so the band always
 * renders something true, then quietly upgraded from the live backend.
 *
 * React rule we follow deliberately: the effect NEVER calls setState in its
 * body. State is initialised once via useState; the only updates happen inside
 * the fetch's .then callback, and a `cancelled` flag in the cleanup prevents a
 * state update after unmount or a stale re-run. On any failure we keep the
 * fallback silently — a marketing page should never show an error here.
 */

interface CommunityStats {
  members: number;
  listings: number;
  schools: number;
  institutions: number;
  artists: number;
  memorials: number;
  /** Present in the API payload but intentionally not displayed here. */
  memories?: number;
  pending?: number;
}

/** Current seed values — what the community actually holds today. */
const FALLBACK: CommunityStats = {
  members: 8,
  listings: 26,
  schools: 7,
  institutions: 9,
  artists: 6,
  memorials: 2,
};

interface Figure {
  key: keyof CommunityStats;
  label: string;
  symbol: AdinkraName;
}

const FIGURES: Figure[] = [
  { key: "members", label: "Members", symbol: "funtunfunefu" },
  { key: "listings", label: "Listings", symbol: "crab" },
  { key: "institutions", label: "Verified institutions", symbol: "dwennimmen" },
  { key: "schools", label: "Great schools", symbol: "adinkrahene" },
  { key: "artists", label: "Artists & musicians", symbol: "gye-nyame" },
  { key: "memorials", label: "Remembered", symbol: "nyame-nwu-na-mawu" },
];

function isCommunityStats(value: unknown): value is CommunityStats {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.members === "number" &&
    typeof v.listings === "number" &&
    typeof v.schools === "number" &&
    typeof v.institutions === "number" &&
    typeof v.artists === "number" &&
    typeof v.memorials === "number"
  );
}

export function Stats() {
  const [stats, setStats] = useState<CommunityStats>(FALLBACK);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/stats", { headers: { Accept: "application/json" } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad response"))))
      .then((data: unknown) => {
        // Only ever mutate state inside the async resolution, and only when
        // the payload is well-formed and this effect run is still current.
        if (!cancelled && isCommunityStats(data)) {
          setStats(data);
        }
      })
      .catch(() => {
        // Keep the seeded fallback silently. No error UI on a brochure band.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Section id="community" tone="green">
      <SectionHeading
        onDark
        center
        kicker="THE COMMUNITY, IN NUMBERS"
        title="One Oguaa, gathering in one place."
        lede="From the first members to the institutions that raised us, this is what the community home of Cape Coast holds today — at home and across the diaspora."
      />

      <Stagger as="dl" className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 sm:gap-y-12 md:mt-16 md:grid-cols-3 lg:grid-cols-6">
        {FIGURES.map((figure, i) => (
          <StaggerItem key={figure.key} index={i}>
            <StatFigure figure={figure} value={stats[figure.key] ?? 0} />
          </StaggerItem>
        ))}
      </Stagger>

      <p className="mt-12 text-center font-serif text-sm italic text-cream/70 sm:mt-14 sm:text-base">
        These numbers update as the community grows — every name added, every shop
        listed, every memory kept.
      </p>
    </Section>
  );
}

function StatFigure({
  figure,
  value,
}: Readonly<{
  figure: Figure;
  value: number;
}>) {
  return (
    <>
      <dt className="flex flex-col items-center text-center font-mono text-[0.65rem] uppercase tracking-[0.16em] text-cream/70 sm:text-xs sm:tracking-[0.18em]">
        <Adinkra
          name={figure.symbol}
          size={22}
          labelled={false}
          strokeWidth={1.4}
          className="text-gold/70"
        />
        <span className="mt-3">{figure.label}</span>
      </dt>
      <dd className="mt-3 text-4xl font-semibold leading-none tabular-nums text-gradient-gold sm:text-5xl">
        {formatCount(value)}
      </dd>
    </>
  );
}

/** Compact, friendly formatting: 1,200 stays as-is; 12,000 becomes 12k. */
function formatCount(n: number): string {
  if (n >= 10000) {
    const k = n / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return n.toLocaleString("en-US");
}
