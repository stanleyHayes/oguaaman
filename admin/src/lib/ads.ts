import type { AdApproveChecklist, AdCampaign, AdFormat, AdPlacementSlug, AdRefundStatus, AdSponsorStatus, AdStatus } from "./types";

/** The five fixed placements (spec §3.1). Frontends hard-code the slots, so
 *  the admin mirrors the list rather than reading it from the API. */
export interface PlacementMeta {
  slug: AdPlacementSlug;
  name: string;
  format: AdFormat;
  surface: "portal" | "marketing" | "app";
  where: string;
  sizes: string;
}

export const PLACEMENTS: readonly PlacementMeta[] = [
  { slug: "portal-home-banner", name: "Portal home banner", format: "banner", surface: "portal", where: "Portal home, below the hero", sizes: "728×90 and 320×100" },
  { slug: "portal-feed-card", name: "Portal feed card", format: "card", surface: "portal", where: "News and events lists, after the 4th item", sizes: "1200×628" },
  { slug: "portal-article-rect", name: "Article rectangle", format: "rect", surface: "portal", where: "Beside or below a news article, never inside it", sizes: "300×250" },
  { slug: "marketing-card", name: "Marketing site card", format: "card", surface: "marketing", where: "Marketing home and news list", sizes: "1200×628" },
  { slug: "app-card", name: "App card", format: "card", surface: "app", where: "App home, news list and article", sizes: "1200×628" },
];

const BY_SLUG = new Map(PLACEMENTS.map((p) => [p.slug, p]));

export function placementName(slug: string): string {
  return BY_SLUG.get(slug as AdPlacementSlug)?.name ?? slug;
}

export function placementMeta(slug: string): PlacementMeta | undefined {
  return BY_SLUG.get(slug as AdPlacementSlug);
}

/** Queue tabs, in the order a reviewer works through them. */
export const AD_STATUS_ORDER: readonly AdStatus[] = [
  "pending_review", "approved", "scheduled", "active", "paused", "completed", "rejected", "expired", "cancelled", "removed",
];

export const AD_STATUS_LABEL: Record<AdStatus, string> = {
  pending_review: "Awaiting review",
  approved: "Approved, unpaid",
  scheduled: "Scheduled",
  active: "Running",
  paused: "Paused",
  completed: "Completed",
  rejected: "Rejected",
  expired: "Expired",
  cancelled: "Cancelled",
  removed: "Removed",
};

export type Tone = "green" | "gold" | "clay" | "teal" | "neutral" | "maroon";

export const AD_STATUS_TONE: Record<AdStatus, Tone> = {
  pending_review: "gold",
  approved: "teal",
  scheduled: "teal",
  active: "green",
  paused: "clay",
  completed: "neutral",
  rejected: "maroon",
  expired: "neutral",
  cancelled: "neutral",
  removed: "maroon",
};

export const TONE_CLASS: Record<Tone, string> = {
  green: "bg-green/[0.1] text-green-text",
  gold: "bg-gold/[0.18] text-gold-text",
  clay: "bg-clay/[0.12] text-clay-text",
  teal: "bg-teal/[0.12] text-teal-text",
  neutral: "bg-sand text-ink-muted",
  maroon: "bg-maroon-900/[0.1] text-maroon-text",
};

export const TONE_DOT: Record<Tone, string> = {
  green: "bg-green-text",
  gold: "bg-gold-brand",
  clay: "bg-clay",
  teal: "bg-teal",
  neutral: "bg-ink-faint",
  maroon: "bg-maroon-text",
};

export const SPONSOR_STATUS_TONE: Record<AdSponsorStatus, Tone> = {
  pending: "gold",
  verified: "green",
  rejected: "maroon",
  suspended: "clay",
};

export const REFUND_STATUS_TONE: Record<AdRefundStatus, Tone> = {
  requesting: "gold",
  pending: "gold",
  processed: "green",
  failed: "maroon",
  manual_check: "clay",
};

export const REFUND_REASON_LABEL: Record<string, string> = {
  under_delivery: "Under-delivery",
  cancelled_before_start: "Cancelled before start",
  stopped_by_advertiser: "Stopped by advertiser",
  removed: "Removed by staff",
  election_blackout: "Election blackout",
  paid_after_close: "Paid after close",
  duplicate_charge: "Duplicate charge",
  manual: "Manual",
};

export const CATEGORY_LABEL: Record<string, string> = {
  general: "General",
  events: "Events",
  education: "Education",
  property: "Property",
  jobs: "Jobs",
  tourism: "Tourism",
  retail: "Retail",
  services: "Services",
  religious_events: "Religious events",
  ngo: "NGO",
  food_drink: "Food and drink",
  health_medicine: "Health and medicine",
  herbal: "Herbal products",
  cosmetics: "Cosmetics",
  financial: "Financial services",
  government_public_service: "Government public service",
  political: "Political",
  alcohol: "Alcohol",
  gambling: "Gambling",
};

/** Categories a steward may switch on or off (spec §3.4); the rest are fixed in code. */
export const ADMIN_BLOCKABLE: readonly { slug: string; label: string; rule: string }[] = [
  { slug: "alcohol", label: "Alcohol", rule: "If allowed, needs FDA registration, approval and expiry." },
  { slug: "gambling", label: "Gambling", rule: "If allowed, needs a Gaming Commission or NLA licence." },
];

/** The queue flags the server sends (ads_admin.go campaignFlags), in plain words. */
export const AD_FLAG_LABEL: Record<string, string> = {
  political: "Political",
  sponsor_not_verified: "Sponsor not verified",
  synthetic_media: "AI-generated media",
  fda_approval_expired: "FDA approval expired",
  refund_needs_attention: "Refund needs attention",
};

/** The text screen's reasons (content_screen.go), as they read after "Flagged text:". */
const SCREEN_REASON_LABEL: Record<string, string> = {
  threat: "threats",
  hate: "hate",
  child_safety: "child safety",
  sexual: "sexual content",
  profanity: "profanity",
  private_info: "private information",
};

const SCREEN_PREFIX = "screen_";

export function flagLabel(flag: string): string {
  if (flag.startsWith(SCREEN_PREFIX)) {
    const reason = flag.slice(SCREEN_PREFIX.length);
    return `Flagged text: ${SCREEN_REASON_LABEL[reason] ?? reason.replaceAll("_", " ")}`;
  }
  return AD_FLAG_LABEL[flag] ?? flag.replaceAll("_", " ");
}

export const APPROVE_CHECKLIST: readonly { key: keyof AdApproveChecklist; label: string; hint?: string }[] = [
  { key: "sponsorIdentified", label: "The sponsor is identified and matches the verified record" },
  { key: "notDisguisedAsNews", label: "It does not look like news or an Oguaa notice" },
  { key: "noFalseOrUnsubstantiatedClaims", label: "No false or unsupported claims" },
  { key: "noHateOrSectionalAppeal", label: "No hate, ethnic or sectional appeal" },
  { key: "noVoterSuppressionOrResultClaims", label: "No voter suppression or result claims", hint: "Tick for commercial ads too." },
  { key: "categoryLicenceChecked", label: "Category licence or FDA approval checked", hint: "Check the public register where one exists." },
  { key: "landingPageMatches", label: "The landing page matches the ad and is safe" },
  { key: "ghsPricingOnly", label: "Prices, if any, are in cedis only" },
  { key: "aiMediaDisclosed", label: "AI-generated or altered media is disclosed" },
  { key: "noPartySymbolsIfDistrictAssembly", label: "No party symbols on District Assembly ads", hint: "Tick when not a District Assembly ad." },
];

export function emptyApproveChecklist(): AdApproveChecklist {
  return {
    sponsorIdentified: false, notDisguisedAsNews: false, noFalseOrUnsubstantiatedClaims: false,
    noHateOrSectionalAppeal: false, noVoterSuppressionOrResultClaims: false, categoryLicenceChecked: false,
    landingPageMatches: false, ghsPricingOnly: false, aiMediaDisclosed: false, noPartySymbolsIfDistrictAssembly: false,
  };
}

/** True when a refund on the campaign needs staff attention. */
export function refundNeedsAttention(c: AdCampaign): boolean {
  return (c.refunds ?? []).some((r) => r.status === "failed" || r.status === "manual_check");
}

/** The chip a reader sees on the ad: "Ad" or "Political ad". */
export function adChip(c: Pick<AdCampaign, "political">): string {
  return c.political ? "Political ad" : "Ad";
}

/** Delivered share of booked impressions, 0..1. */
export function deliveredShare(c: Pick<AdCampaign, "delivered" | "bookedImpressions">): number {
  return c.bookedImpressions > 0 ? Math.min(1, c.delivered / c.bookedImpressions) : 0;
}

/** What is left to refund on a paid campaign, in pesewas. */
export function refundable(c: AdCampaign): number {
  if (c.paymentStatus !== "success" || c.simulated) return 0;
  const pendingRefunds = (c.refunds ?? [])
    .filter((r) => r.status !== "failed" && r.status !== "processed")
    .reduce((sum, r) => sum + r.amountPesewas, 0);
  return Math.max(0, c.price.totalPesewas - c.refundedPesewas - pendingRefunds);
}
