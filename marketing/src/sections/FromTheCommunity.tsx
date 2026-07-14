import { Section, SectionHeading } from "@/components/ui";
import { ListingCard } from "@/components/listing-card";
import { useListings, type Listing } from "@/lib/listings";
import {
  ARTISTS_FALLBACK,
  BUSINESSES_FALLBACK,
  PEOPLE_FALLBACK,
  MEMORIALS_FALLBACK,
} from "@/lib/fallbacks";
import { PORTAL_APP_URL } from "@/config";

/**
 * "From the community" — a living window into the app, beyond the featured rail.
 * Four compact rows (artists, shops, the celebrated, the remembered) each read
 * live from the backend with a seeded fallback, so the marketing site shows the
 * town as it actually is right now, not a static brochure.
 */

interface Row {
  eyebrow: string;
  title: string;
  endpoint: string;
  fallback: Listing[];
  href: string;
}

const ROWS: Row[] = [
  { eyebrow: "Carrying the sound", title: "Artists of Oguaa", endpoint: "/api/artists", fallback: ARTISTS_FALLBACK, href: `${PORTAL_APP_URL}/music` },
  { eyebrow: "Where the town trades", title: "Shops, stays & kitchens", endpoint: "/api/businesses", fallback: BUSINESSES_FALLBACK, href: `${PORTAL_APP_URL}/business` },
  { eyebrow: "We celebrate", title: "The ones Oguaa is proud of", endpoint: "/api/people", fallback: PEOPLE_FALLBACK, href: `${PORTAL_APP_URL}/people` },
  { eyebrow: "Yɛnkae — we remember", title: "Held in memory", endpoint: "/api/memorials", fallback: MEMORIALS_FALLBACK, href: `${PORTAL_APP_URL}/memoriam` },
];

function CommunityRow({ row }: Readonly<{ row: Row }>) {
  const items = useListings(row.endpoint, row.fallback, 3);
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{row.eyebrow}</p>
          <h3 className="mt-1 font-display text-2xl font-semibold text-ink">{row.title}</h3>
        </div>
        <a
          href={row.href}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-sm font-semibold text-green transition-colors hover:text-green-900"
        >
          See all →
        </a>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>
    </div>
  );
}

export function FromTheCommunity() {
  return (
    <Section id="community-live" tone="paper" size="wide">
      <SectionHeading
        kicker="FROM THE COMMUNITY"
        title="The town, living."
        lede="Not a brochure — a window. The artists carrying the sound, the shops and kitchens to know, the people Oguaa celebrates, and the ones it holds in memory. Curated by the community, straight from the app."
      />
      <div className="mt-12 space-y-14">
        {ROWS.map((row) => (
          <CommunityRow key={row.endpoint} row={row} />
        ))}
      </div>
    </Section>
  );
}
