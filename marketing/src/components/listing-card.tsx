import { Card, Pill } from "@/components/ui";
import {
  type Listing,
  TYPE_LABEL,
  TYPE_TONE,
  portalHref,
  listingSubtitle,
} from "@/lib/listings";
import { mediaUrl } from "@/lib/media";

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
      aria-label={`${listing.title} — open in the Oguaa app (opens in a new tab)`}
      className="group block h-full rounded-[var(--radius-card)]"
    >
      <Card accent={tone} interactive className="flex h-full flex-col">
        <div className="og-card-media aspect-[4/3] w-full border-b border-green/10">
          {listing.coverImageUrl ? (
            <img
              src={mediaUrl(listing.coverImageUrl)}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-700 motion-safe:group-hover:scale-[1.035] motion-safe:group-focus-visible:scale-[1.035]"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="bg-contours relative flex h-full w-full items-center justify-center overflow-hidden bg-sand/70" aria-hidden>
              <span className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold/15 blur-2xl" />
              <span className="grid h-20 w-20 place-items-center rounded-full border border-green/15 bg-cream/70 text-3xl font-semibold text-green/55 shadow-sm backdrop-blur-sm">
                {listing.title.charAt(0)}
              </span>
            </div>
          )}
          <span className="on-dark-pin absolute bottom-4 left-5 z-[3] rounded-full border border-cream/15 bg-green-900/70 px-2.5 py-1 font-mono text-[0.56rem] font-semibold uppercase tracking-[0.18em] text-cream/90 backdrop-blur-sm">
            Live from Oguaa
          </span>
        </div>
        <div className="flex flex-1 flex-col px-6 pb-5">
          <Pill tone={tone} className="relative z-[5] -mt-3 self-start shadow-sm">
            {TYPE_LABEL[listing.type] ?? listing.type}
          </Pill>
          <h3 className="mt-5 text-xl font-semibold leading-snug text-ink transition-colors group-hover:text-green group-focus-visible:text-green">
            {listing.title}
          </h3>
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted">{listingSubtitle(listing)}</p>
          <span className="og-card-action mt-auto border-t border-green/10 pt-4">
            <span>Open in the app</span>
            <span className="og-card-action-mark" aria-hidden>↗</span>
          </span>
        </div>
      </Card>
    </a>
  );
}
