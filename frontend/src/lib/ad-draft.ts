// The advertiser wizard's draft: its shape, the steps it walks through, the
// client-side checks per step, the request bodies it produces and a
// per-browser saved copy so a refresh does not lose the work. The server
// re-validates everything (spec §3.4–3.6); these checks only catch the obvious
// before a round trip.
import { apiErrorCode } from "./api";
import { addDays, AD_LIMITS, apiErrorField, CATEGORY_REGULATORS, needsFda, needsLicence, PLACEMENT_FORMAT, todayAccra } from "./ads";
import type { AdDisplay } from "@/components/ad-slot";
import type { AdCampaignInput, AdCategory, AdFormat, AdPlacementSlug, AdPoliticalType, AdQuoteRequest, AdRateCard, AdSponsor, Election } from "./types";

export type StepId = "placement" | "type" | "sponsor" | "category" | "creative" | "schedule" | "submit";

export const STEP_LABEL: Record<StepId, string> = {
  placement: "Placement",
  type: "Ad type",
  sponsor: "Sponsor",
  category: "Category",
  creative: "Creative",
  schedule: "Dates and price",
  submit: "Review and send",
};

export interface AdDraft {
  placement: AdPlacementSlug | "";
  political: boolean;
  politicalType: Exclude<AdPoliticalType, "">;
  electionId: string;
  sponsorId: string;
  category: string;
  fdaRegistrationNo: string;
  fdaApprovalRef: string;
  fdaApprovalExpiresOn: string;
  regulator: string;
  licenceNumber: string;
  approvalUploadId: string;
  imageUrl: string;
  imageUrlDesktop: string;
  imageUrlMobile: string;
  headline: string;
  body: string;
  alt: string;
  landingUrl: string;
  containsSyntheticMedia: boolean;
  startDate: string;
  endDate: string;
  impressions: number;
  email: string;
  acceptTerms: boolean;
  startConsent: boolean;
}

export type DraftErrors = Partial<Record<keyof AdDraft | "form", string>>;

export function emptyDraft(card: AdRateCard | null): AdDraft {
  const lead = card?.minLeadDays ?? 2;
  const start = addDays(todayAccra(), lead);
  return {
    placement: "",
    political: false,
    politicalType: "election",
    electionId: "",
    sponsorId: "",
    category: "",
    fdaRegistrationNo: "",
    fdaApprovalRef: "",
    fdaApprovalExpiresOn: "",
    regulator: "",
    licenceNumber: "",
    approvalUploadId: "",
    imageUrl: "",
    imageUrlDesktop: "",
    imageUrlMobile: "",
    headline: "",
    body: "",
    alt: "",
    landingUrl: "",
    containsSyntheticMedia: false,
    startDate: start,
    endDate: addDays(start, 13),
    impressions: Math.max(card?.minImpressions ?? 3000, 10_000),
    email: "",
    acceptTerms: false,
    startConsent: false,
  };
}

/** The steps for this draft: the type step only when political ads are on; no category step for political ads. */
export function stepsFor(draft: AdDraft, card: AdRateCard): StepId[] {
  const steps: StepId[] = ["placement"];
  if (card.politicalEnabled) steps.push("type");
  steps.push("sponsor");
  if (!draft.political) steps.push("category");
  steps.push("creative", "schedule", "submit");
  return steps;
}

// ── Saved copy (per browser; never required) ─────────────────────────────────

const DRAFT_KEY = "oguaa.ads.draft.v1";

export function loadDraft(card: AdRateCard | null): AdDraft {
  const base = emptyDraft(card);
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<AdDraft>;
    // Consents are never restored: they must be given for this submission.
    return { ...base, ...saved, acceptTerms: false, startConsent: false };
  } catch {
    return base;
  }
}

export function saveDraft(draft: AdDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage blocked: the draft just isn't kept.
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
}

// ── Political window ─────────────────────────────────────────────────────────

/** The last day a political election ad may run: the day before the blackout starts (Accra). */
export function latestPoliticalEnd(election: Election | undefined): string {
  if (!election?.blackoutStart) return "";
  return addDays(election.blackoutStart.slice(0, 10), -1);
}

// ── Checks per step ──────────────────────────────────────────────────────────

const HTTPS_URL = /^https:\/\/[^\s/?#@]+\.[^\s/?#@]+(?:[/?#]\S*)?$/i;
const IP_HOST = /^https:\/\/(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/?#]|$)/i;
const CLOUDINARY = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//i;

export function landingUrlError(url: string): string | null {
  const v = url.trim();
  if (!v) return "Add the page people reach when they tap the ad.";
  if (v.length > AD_LIMITS.landingUrl) return "That address is too long.";
  if (!HTTPS_URL.test(v) || IP_HOST.test(v) || /localhost/i.test(v)) return "Use a full https:// address on a public website, such as https://kotokurabatraders.com.";
  return null;
}

function imageError(url: string, label: string): string | null {
  if (!url) return `Upload the ${label}.`;
  if (!CLOUDINARY.test(url)) return "Ad images must upload to Oguaa's image service, which isn't available right now. Try again later.";
  return null;
}

function creativeErrors(d: AdDraft): DraftErrors {
  const e: DraftErrors = {};
  const format = d.placement ? PLACEMENT_FORMAT[d.placement] : "card";
  if (format === "banner") {
    const desk = imageError(d.imageUrlDesktop, "desktop banner (728 × 90)");
    const mob = imageError(d.imageUrlMobile, "phone banner (320 × 100)");
    if (desk) e.imageUrlDesktop = desk;
    if (mob) e.imageUrlMobile = mob;
  } else {
    const img = imageError(d.imageUrl, "image");
    if (img) e.imageUrl = img;
  }
  if (format === "card") {
    if (!d.headline.trim()) e.headline = "Add a headline.";
    else if (d.headline.length > AD_LIMITS.headline) e.headline = `Keep the headline to ${AD_LIMITS.headline} characters.`;
    if (d.body.length > AD_LIMITS.body) e.body = `Keep the text to ${AD_LIMITS.body} characters.`;
  }
  if (!d.alt.trim()) e.alt = "Describe the image for people who can't see it.";
  else if (d.alt.length > AD_LIMITS.alt) e.alt = `Keep the description to ${AD_LIMITS.alt} characters.`;
  const url = landingUrlError(d.landingUrl);
  if (url) e.landingUrl = url;
  return e;
}

function categoryErrors(d: AdDraft, cat: AdCategory | undefined, sponsor: AdSponsor | undefined): DraftErrors {
  const e: DraftErrors = {};
  if (!d.category) {
    e.category = "Choose what the ad is for.";
    return e;
  }
  if (needsFda(d.category, cat)) {
    if (!d.fdaRegistrationNo.trim()) e.fdaRegistrationNo = "Add the FDA registration number.";
    if (!d.fdaApprovalRef.trim()) e.fdaApprovalRef = "Add the FDA advertisement approval reference.";
    if (!d.fdaApprovalExpiresOn) e.fdaApprovalExpiresOn = "Add the date the approval expires.";
    if (!d.approvalUploadId) e.approvalUploadId = "Upload the FDA approval letter.";
  }
  if (needsLicence(d.category, cat)) {
    const allowed = CATEGORY_REGULATORS[d.category] ?? [];
    if (!d.regulator || (allowed.length > 0 && !allowed.includes(d.regulator))) e.regulator = "Choose the regulator that licenses you.";
    if (!d.licenceNumber.trim()) e.licenceNumber = "Add the licence number.";
  }
  if (d.category === "government_public_service" && sponsor && sponsor.entityType !== "government") {
    e.category = "Public-service ads need a government sponsor. Choose another category or sponsor.";
  }
  return e;
}

function scheduleErrors(d: AdDraft, card: AdRateCard, election: Election | undefined): DraftErrors {
  const e: DraftErrors = {};
  const earliest = addDays(todayAccra(), card.minLeadDays);
  if (!d.startDate) e.startDate = "Choose a start date.";
  else if (d.startDate < earliest) e.startDate = `The earliest start is ${earliest}, to leave time for review.`;
  if (!d.endDate) e.endDate = "Choose an end date.";
  else if (d.startDate && d.endDate < d.startDate) e.endDate = "The end date must be on or after the start date.";
  else if (d.startDate && d.endDate > addDays(d.startDate, card.maxCampaignDays - 1)) e.endDate = `Campaigns run for up to ${card.maxCampaignDays} days.`;
  if (d.political && d.politicalType === "election") {
    const latest = latestPoliticalEnd(election);
    if (latest && d.endDate > latest) e.endDate = `Political ads for this election must end by ${latest}, before the blackout.`;
    if (election?.politicalAdsFrom && d.startDate < election.politicalAdsFrom) e.startDate = `Political ads for this election can start from ${election.politicalAdsFrom}.`;
  }
  const n = d.impressions;
  if (!Number.isFinite(n) || n < card.minImpressions || n > card.maxImpressionsPerOrder || n % card.impressionStep !== 0) {
    e.impressions = `Choose between ${card.minImpressions.toLocaleString("en-GH")} and ${card.maxImpressionsPerOrder.toLocaleString("en-GH")}, in steps of ${card.impressionStep.toLocaleString("en-GH")}.`;
  }
  return e;
}

export interface StepContext {
  card: AdRateCard;
  sponsor?: AdSponsor;
  category?: AdCategory;
  election?: Election;
}

/** Client-side problems with one step of the draft. */
export function stepErrors(step: StepId, d: AdDraft, ctx: StepContext): DraftErrors {
  switch (step) {
    case "placement": {
      const p = ctx.card.placements.find((x) => x.slug === d.placement);
      if (!p) return { placement: "Choose where the ad runs." };
      return p.active ? {} : { placement: "That placement is not available yet. Choose another." };
    }
    case "type":
      if (d.political && d.politicalType === "election" && !d.electionId) return { electionId: "Choose the election this ad is about." };
      return {};
    case "sponsor":
      if (!ctx.sponsor) return { sponsorId: "Choose a sponsor, or add one." };
      if (d.political && ctx.sponsor.kind !== "political") return { sponsorId: "A political ad needs a political sponsor." };
      if (!d.political && ctx.sponsor.kind !== "commercial") return { sponsorId: "Choose a commercial sponsor for this ad." };
      return {};
    case "category":
      return categoryErrors(d, ctx.category, ctx.sponsor);
    case "creative":
      return creativeErrors(d);
    case "schedule":
      return scheduleErrors(d, ctx.card, ctx.election);
    case "submit": {
      const e: DraftErrors = {};
      if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) e.email = "Add an email for the receipt.";
      if (!d.acceptTerms) e.acceptTerms = "Accept the Advertising Policy and Terms of Sale to continue.";
      if (!d.startConsent) e.startConsent = "Confirm when the campaign starts.";
      return e;
    }
  }
}

// ── Request bodies ───────────────────────────────────────────────────────────

/** The quote request for the draft, or null until it has enough to price. */
export function quoteRequest(d: AdDraft): AdQuoteRequest | null {
  if (!d.placement || !d.startDate || !d.endDate || d.endDate < d.startDate || !d.impressions) return null;
  if (d.political && d.politicalType === "election" && !d.electionId) return null;
  return {
    placement: d.placement,
    political: d.political,
    electionId: d.political && d.politicalType === "election" ? d.electionId : "",
    politicalType: d.political ? d.politicalType : "",
    startDate: d.startDate,
    endDate: d.endDate,
    impressions: d.impressions,
  };
}

export function campaignInput(d: AdDraft): AdCampaignInput {
  const format = d.placement ? PLACEMENT_FORMAT[d.placement] : "card";
  const req = quoteRequest(d);
  return {
    sponsorId: d.sponsorId,
    placement: d.placement as AdPlacementSlug,
    political: d.political,
    politicalType: req?.politicalType ?? "",
    electionId: req?.electionId ?? "",
    category: d.political ? "political" : d.category,
    compliance: {
      fdaRegistrationNo: d.fdaRegistrationNo.trim() || undefined,
      fdaApprovalRef: d.fdaApprovalRef.trim() || undefined,
      fdaApprovalExpiresOn: d.fdaApprovalExpiresOn || undefined,
      regulator: (d.regulator || undefined) as AdCampaignInput["compliance"]["regulator"],
      licenceNumber: d.licenceNumber.trim() || undefined,
      approvalUploadId: d.approvalUploadId || undefined,
    },
    creative: {
      imageUrl: format === "banner" ? undefined : d.imageUrl,
      imageUrlDesktop: format === "banner" ? d.imageUrlDesktop : undefined,
      imageUrlMobile: format === "banner" ? d.imageUrlMobile : undefined,
      headline: format === "card" ? d.headline.trim() : undefined,
      body: format === "card" ? d.body.trim() || undefined : undefined,
      alt: d.alt.trim(),
      landingUrl: d.landingUrl.trim(),
      containsSyntheticMedia: d.containsSyntheticMedia,
    },
    startDate: d.startDate,
    endDate: d.endDate,
    impressions: d.impressions,
    acceptTerms: d.acceptTerms,
    startConsent: d.startConsent,
    email: d.email.trim(),
  };
}

// ── Server errors → the step and field to show them on ───────────────────────

const CODE_TARGET: Record<string, [StepId, keyof AdDraft | "form"]> = {
  invalid_placement: ["placement", "placement"],
  political_disabled: ["type", "form"],
  district_assembly_not_allowed: ["type", "electionId"],
  sponsor_not_found: ["sponsor", "sponsorId"],
  sponsor_kind_mismatch: ["sponsor", "sponsorId"],
  category_blocked: ["category", "category"],
  compliance_required: ["category", "form"],
  invalid_image: ["creative", "imageUrl"],
  invalid_landing_url: ["creative", "landingUrl"],
  // Text rules can concern the headline, the supporting text or the image
  // description, and banners and boxes have no headline: the creative step's
  // form-level message shows on every format.
  ad_text_not_allowed: ["creative", "form"],
  content_blocked: ["creative", "form"],
  foreign_currency_not_allowed: ["creative", "form"],
  invalid_creative: ["creative", "form"],
  invalid_dates: ["schedule", "startDate"],
  political_dates_outside_window: ["schedule", "endDate"],
  invalid_impressions: ["schedule", "impressions"],
  below_minimum_order: ["schedule", "impressions"],
  inventory_unavailable: ["schedule", "impressions"],
  terms_not_accepted: ["submit", "acceptTerms"],
};

const FIELD_ALIASES: Record<string, keyof AdDraft> = {
  fdaregistrationno: "fdaRegistrationNo",
  fdaapprovalref: "fdaApprovalRef",
  fdaapprovalexpireson: "fdaApprovalExpiresOn",
  approvaluploadid: "approvalUploadId",
  regulator: "regulator",
  licencenumber: "licenceNumber",
  imageurl: "imageUrl",
  imageurldesktop: "imageUrlDesktop",
  imageurlmobile: "imageUrlMobile",
  headline: "headline",
  body: "body",
  alt: "alt",
  landingurl: "landingUrl",
  startdate: "startDate",
  enddate: "endDate",
  impressions: "impressions",
  email: "email",
  sponsorid: "sponsorId",
  category: "category",
  placement: "placement",
  electionid: "electionId",
};

const FIELD_STEP: Partial<Record<keyof AdDraft, StepId>> = {
  placement: "placement",
  electionId: "type",
  sponsorId: "sponsor",
  category: "category",
  fdaRegistrationNo: "category",
  fdaApprovalRef: "category",
  fdaApprovalExpiresOn: "category",
  approvalUploadId: "category",
  regulator: "category",
  licenceNumber: "category",
  imageUrl: "creative",
  imageUrlDesktop: "creative",
  imageUrlMobile: "creative",
  headline: "creative",
  body: "creative",
  alt: "creative",
  landingUrl: "creative",
  startDate: "schedule",
  endDate: "schedule",
  impressions: "schedule",
  email: "submit",
};

/** The creative fields each format shows (the others have no input to mark). */
const CREATIVE_FIELDS: Record<AdFormat, (keyof AdDraft)[]> = {
  banner: ["imageUrlDesktop", "imageUrlMobile", "alt", "landingUrl"],
  card: ["imageUrl", "headline", "body", "alt", "landingUrl"],
  rect: ["imageUrl", "alt", "landingUrl"],
};

/**
 * Where a failed submit belongs: the step to reopen and the field to mark. A
 * creative field the draft's format doesn't show goes to the creative step's
 * form-level message instead.
 */
export function errorTarget(err: unknown, format: AdFormat = "card"): { step: StepId; field: keyof AdDraft | "form" } {
  const raw = apiErrorField(err);
  if (raw) {
    const leaf = raw.split(".").pop()?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
    const field = FIELD_ALIASES[leaf];
    const step = field ? FIELD_STEP[field] : undefined;
    if (field && step === "creative" && !CREATIVE_FIELDS[format].includes(field)) return { step, field: "form" };
    if (field && step) return { step, field };
  }
  const code = apiErrorCode(err);
  const hit = code ? CODE_TARGET[code] : undefined;
  if (hit) return { step: hit[0], field: hit[1] };
  return { step: "submit", field: "form" };
}

/** The draft as the frame draws it, with the sponsor's real label. */
export function previewAd(draft: AdDraft, sponsor?: AdSponsor): AdDisplay {
  const format = draft.placement ? PLACEMENT_FORMAT[draft.placement] : "card";
  let sponsorLine = draft.political ? "Paid for by the sponsor" : "Sponsored · the sponsor";
  if (sponsor) sponsorLine = draft.political ? `Paid for by ${sponsor.legalName}` : `Sponsored · ${sponsor.displayName}`;
  return {
    format,
    imageUrl: draft.imageUrl || undefined,
    imageUrlDesktop: draft.imageUrlDesktop || undefined,
    imageUrlMobile: draft.imageUrlMobile || undefined,
    headline: draft.headline || (format === "card" ? "Your headline appears here" : undefined),
    body: draft.body || undefined,
    alt: draft.alt || "Ad image",
    chip: draft.political ? "Political ad" : "Ad",
    sponsorLine,
    political: draft.political,
    syntheticMedia: draft.containsSyntheticMedia,
  };
}
