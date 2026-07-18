import { Section, SectionHeading } from "@/components/ui";
import { ListingCard } from "@/components/listing-card";
import { Stagger, StaggerItem } from "@/components/motion";
import { useListings } from "@/lib/listings";
import { PORTAL_APP_URL } from "@/config";

/**
 * "From the community" — a living window into the app, beyond the featured rail.
 * Four compact rows (artists, shops, the celebrated, the remembered) each read
 * live from the backend, so the marketing site shows the town as it actually is
 * right now, not a static brochure. A row with no live items skips itself.
 */

interface Row {
  eyebrow: string;
  title: string;
  endpoint: string;
  href: string;
}

const ROWS: Row[] = [
  { eyebrow: "Carrying the sound", title: "Artists of Oguaa", endpoint: "/api/artists", href: `${PORTAL_APP_URL}/music` },
  { eyebrow: "Where the town trades", title: "Shops, stays & kitchens", endpoint: "/api/businesses", href: `${PORTAL_APP_URL}/business` },
  { eyebrow: "We celebrate", title: "The ones Oguaa is proud of", endpoint: "/api/people", href: `${PORTAL_APP_URL}/people` },
  { eyebrow: "Yɛnkae — we remember", title: "Held in memory", endpoint: "/api/memorials", href: `${PORTAL_APP_URL}/memoriam` },
];

function CommunityRow({ row }: Readonly<{ row: Row }>) {
  const items = useListings(row.endpoint, 3);
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{row.eyebrow}</p>
          <h3 className="mt-1 text-2xl font-semibold text-ink">{row.title}</h3>
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
      <Stagger className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((listing, i) => (
          <StaggerItem key={listing.id} index={i} className="h-full">
            <ListingCard listing={listing} />
          </StaggerItem>
        ))}
      </Stagger>
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
