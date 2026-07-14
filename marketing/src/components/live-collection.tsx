import type { ReactNode } from "react";
import { Section, SectionHeading, CTA as Cta } from "@/components/ui";
import { ListingCard } from "@/components/listing-card";
import { Stagger, StaggerItem } from "@/components/motion";
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
}: Readonly<{
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
}>) {
  const items = useListings(endpoint, fallback, limit);

  return (
    <Section id={id} tone={tone} size="wide">
      <SectionHeading kicker={kicker} title={title} lede={lede} accentClass={accentClass} />

      <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((listing, i) => (
          <StaggerItem key={listing.id} index={i} className="h-full">
            <ListingCard listing={listing} />
          </StaggerItem>
        ))}
      </Stagger>

      {cta && (
        <div className="mt-12 text-center">
          <Cta href={cta.href} variant="primary" external={cta.external}>
            {cta.label}
          </Cta>
        </div>
      )}
    </Section>
  );
}
