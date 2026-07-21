import type { AdinkraName } from "@/components/adinkra";
import { useEffect, useState } from "react";
import { Section, SectionHeading } from "@/components/ui";
import { Adinkra } from "@/components/adinkra";
import { Stagger, StaggerItem } from "@/components/motion";
import { apiUrl } from "@/lib/api";

/**
 * Stats — a dark "community numbers" band (tone="green").
 *
 * Figures come entirely from the live backend (/api/stats). Until the real
 * numbers arrive (or if the API is unavailable) the band is hidden — never
 * placeholder/stale counts.
 *
 * React rule we follow deliberately: the effect NEVER calls setState in its
 * body. The only update happens inside the fetch's .then callback, and a
 * `cancelled` flag in the cleanup prevents a state update after unmount.
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
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch(apiUrl("/api/stats"), { headers: { Accept: "application/json" }, signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad response"))))
      .then((data: unknown) => {
        if (isCommunityStats(data)) {
          setStats(data);
          setLoadFailed(false);
          return;
        }
        setLoadFailed(true);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("Failed to load community stats", error);
        setLoadFailed(true);
      });

    return () => {
      controller.abort();
    };
  }, []);

  if (!stats && !loadFailed) return null;
  if (!stats && loadFailed) {
    return (
      <Section id="community" tone="green">
        <SectionHeading
          onDark
          center
          kicker="THE COMMUNITY, IN NUMBERS"
          title="Community stats are temporarily unavailable."
          lede="Please check back shortly while we reconnect live numbers from Oguaa."
        />
      </Section>
    );
  }

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
