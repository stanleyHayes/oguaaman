import { Card, Pill } from "@/components/ui";
import {
  type Listing,
  TYPE_LABEL,
  TYPE_TONE,
  portalHref,
  listingSubtitle,
} from "@/lib/listings";

/**
 * One community listing as a card that opens in the portal app. Used across the
 * "from the community" rows (artists, shops, people, the remembered, what's on).
 * The cover image is optional — most seed content is text-first — and falls back
 * to a tinted monogram band so a row never looks broken.
 */
export function ListingCard({ listing }: Readonly<{ listing: Listing }>) {
  const tone = TYPE_TONE[listing.type] ?? "neutral";
  return (
    <a
      href={portalHref(listing)}
      target="_blank"
      rel="noopener noreferrer"
      className="group block h-full"
    >
      <Card className="flex h-full flex-col overflow-hidden transition-shadow duration-300 hover:shadow-[var(--shadow-lift)]">
        {listing.coverImageUrl ? (
          <img
            src={listing.coverImageUrl}
            alt=""
            loading="lazy"
            className="aspect-[16/9] w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex aspect-[16/9] w-full items-center justify-center border-b border-sand bg-sand/60" aria-hidden>
            <span className="text-4xl font-semibold text-green/30">
              {listing.title.charAt(0)}
            </span>
          </div>
        )}
        <div className="flex flex-1 flex-col p-6">
          <Pill tone={tone} className="self-start">
            {TYPE_LABEL[listing.type] ?? listing.type}
          </Pill>
          <h3 className="mt-4 text-xl font-semibold leading-snug text-ink">
            {listing.title}
          </h3>
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted">{listingSubtitle(listing)}</p>
          <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-green opacity-0 transition-opacity group-hover:opacity-100">
            Open in the app →
          </span>
        </div>
      </Card>
    </a>
  );
}
