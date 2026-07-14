import { Section, SectionHeading, CTA as Cta } from "@/components/ui";
import { ListingCard } from "@/components/listing-card";
import { Stagger, StaggerItem } from "@/components/motion";
import { useListings } from "@/lib/listings";
import { FEATURED_FALLBACK } from "@/lib/fallbacks";
import { PORTAL_APP_URL } from "@/config";

/**
 * "Right now in Oguaa" — a living window into the town. It surfaces the
 * community's FEATURED entries (events, businesses, artists, the remembered)
 * straight from the live app, so the marketing site is never a static brochure.
 * Seeded with real featured items so it always renders, then upgraded live via
 * the shared useListings hook.
 */
export function HappeningNow() {
  const items = useListings("/api/featured", FEATURED_FALLBACK);

  return (
    <Section id="happening" tone="cream" size="wide">
      <SectionHeading
        kicker="RIGHT NOW IN OGUAA"
        title="What the town is celebrating."
        lede="A living window into Cape Coast — the festivals and homecomings coming up, the businesses to know, the artists carrying the sound, and the ones we remember. Curated by the community, straight from the app."
      />

      <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((listing, i) => (
          <StaggerItem key={listing.id} index={i} className="h-full">
            <ListingCard listing={listing} />
          </StaggerItem>
        ))}
      </Stagger>

      <div className="mt-12 text-center">
        <Cta href={PORTAL_APP_URL} variant="primary" external>
          See everything in the app
        </Cta>
      </div>
    </Section>
  );
}
