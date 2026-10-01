import type { Listing } from "./types";

/**
 * True while a listing's featured placement is in force. Paid placements carry
 * `featuredUntil` and the flag is never cleared when they lapse, so the date
 * decides; editorial featuring has no end date.
 */
export function isFeaturedNow(listing: Pick<Listing, "featured" | "featuredUntil">, now = new Date()): boolean {
  if (!listing.featured) return false;
  if (!listing.featuredUntil) return true;
  const until = Date.parse(listing.featuredUntil);
  return Number.isNaN(until) || until > now.getTime();
}

/** The listing to lead with: the live placement ending last (newest paid), else the first listing. */
export function pickFeatured<T extends Listing>(listings: T[], now = new Date()): T | undefined {
  const live = listings.filter((listing) => isFeaturedNow(listing, now));
  if (live.length === 0) return listings[0];
  return live.reduce((best, listing) => ((listing.featuredUntil ?? "") > (best.featuredUntil ?? "") ? listing : best));
}

/**
 * True while a paid placement (promotion or plan boost) is running (K18). Such
 * listings must carry a "Sponsored" label; editorial featuring never sets it.
 */
export function isPromotedNow(listing: Pick<Listing, "promotedUntil">, now = new Date()): boolean {
  if (!listing.promotedUntil) return false;
  const until = Date.parse(listing.promotedUntil);
  return !Number.isNaN(until) && until > now.getTime();
}
