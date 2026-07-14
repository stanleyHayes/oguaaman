import type { ReactNode } from "react";
import { Section, SectionHeading, CTA } from "@/components/ui";
import { ListingCard } from "@/components/listing-card";
import { useListings, type Listing } from "@/lib/listings";

/**
 * A titled row of live community content from one app endpoint (e.g.
 * "/api/artists"), seeded with real fallback items so it always renders, then
 * upgraded from the backend. The reusable engine behind the "from the
 * community" sections — shops, artists, the celebrated and the remembered.
 */
export function LiveCollection({
  id,
  tone = "paper",
  kicker,
  title,
  lede,
  endpoint,
  fallback,
  limit = 6,
  cta,
  accentClass,
}: {
  id?: string;
  tone?: "paper" | "cream" | "sand";
  kicker: string;
  title: ReactNode;
  lede?: ReactNode;
  endpoint: string;
  fallback: Listing[];
  limit?: number;
  cta?: { href: string; label: string; external?: boolean };
  accentClass?: string;
}) {
  const items = useListings(endpoint, fallback, limit);

  return (
    <Section id={id} tone={tone} size="wide">
      <SectionHeading kicker={kicker} title={title} lede={lede} accentClass={accentClass} />

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>

      {cta && (
        <div className="mt-12 text-center">
          <CTA href={cta.href} variant="primary" external={cta.external}>
            {cta.label}
          </CTA>
        </div>
      )}
    </Section>
  );
}
