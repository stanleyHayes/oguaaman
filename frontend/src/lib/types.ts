// TypeScript mirror of the Go API's JSON shapes (backend/internal/domain).

/** Lifecycle of a payment (pledge / ticket / subscription / promotion). */
export type PaymentStatus = "pending" | "success" | "failed";

export type ListingStatus =
  | "draft" | "pending" | "approved" | "rejected" | "unpublished";

export type ListingType =
  | "business" | "artist" | "person" | "memory" | "event" | "opportunity" | "memorial" | "project" | "incident" | "lostfound" | "property";

export type PropertyOfferType = "long-term" | "short-stay";
export type PropertyType = "room" | "apartment" | "house" | "guesthouse" | "hostel";
export type PropertyPricePeriod = "night" | "month";
export type PropertyAvailability = "available" | "reserved" | "let";

/** The compact property contract shared by Rent & Stay cards and detail pages. */
export interface PropertyDetails {
  offerType: PropertyOfferType;
  propertyType: PropertyType;
  area?: string;
  address: string;
  description: string;
  pricePesewas: number;
  pricePeriod: PropertyPricePeriod;
  depositPesewas?: number;
  bedrooms?: number;
  bathrooms?: number;
  furnished?: boolean;
  amenities?: string[];
  availability: PropertyAvailability;
  availableFrom?: string;
  contact?: SocialLink[];
  bookingUrl?: string;
  gallery?: { url?: string; caption?: string; label?: string }[];
}

/** A contribution toward an adopt-a-project campaign (amounts in pesewas). */
export interface Pledge {
  id: string;
  reference: string;
  kind?: "campaign" | "donation";
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  message?: string;
  anonymous?: boolean;
  memberId?: string;
  amountPesewas: number;
  feePesewas?: number;
  netPesewas?: number;
  currency: string;
  status: PaymentStatus;
  simulated?: boolean;
  createdAt: string;
  confirmedAt?: string;
}

/** A paid ticket tier on an event (details.tiers; capacity 0 = unlimited). */
export interface TicketTier {
  name: string;
  pricePesewas: number;
  capacity: number;
}

export type EventAdmission = "free" | "paid";
export type EventFormat = "festival" | "concert" | "workshop" | "conference" | "community" | "sports" | "ceremony" | "exhibition" | "nightlife" | "fundraiser" | "other";

/** A tier with live sales numbers, as served by the event view. */
export interface TicketTierView extends TicketTier {
  sold: number;
  remaining: number | null; // null when unlimited
}

/** The event detail payload: the approved event plus its tiers. */
export interface EventView {
  event: Listing;
  tiers: TicketTierView[];
}

/** An event ticket bought via Paystack (Phase 6; amounts in pesewas). */
export interface Ticket {
  id: string;
  reference: string;
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  memberId?: string;
  tier: string;
  qty: number;
  amountPesewas: number;
  status: PaymentStatus;
  code?: string;        // issued on confirmation; shown at the gate
  checkedInAt?: string; // set once, at the gate
  simulated?: boolean;
  createdAt: string;
  confirmedAt?: string;
}

/** A business owner's paid Supporter subscription (Phase 7; amounts in pesewas). */
export interface Subscription {
  id: string;
  reference: string;
  memberId?: string;
  /** "business" (a Supporter plan on a listing) or "creator" (member-level; no listing fields). */
  scope?: "business" | "creator";
  listingId: string;
  listingSlug: string;
  listingTitle: string;
  plan: string; // catalog plan slug (legacy rows: "business-supporter")
  amountPesewas: number;
  status: PaymentStatus;
  periodEnd?: string; // RFC3339; set on success
  simulated?: boolean;
  createdAt: string;
  confirmedAt?: string;
}

/** A subscription plan from the staff-managed catalog (Creator plan §5). */
export interface Plan {
  id: string;
  slug: string;
  name: string;
  audience: "any" | "business" | "creator";
  prices: Record<string, number>; // pesewas by audience key; "default" always present
  interval: "free" | "month";
  perks: string[];
  maxListings?: number;
  includedPromoDays?: number;
  takeRatePercent?: number; // platform cut on donations/campaigns (Creator Monetization)
  maxProducts?: number;     // storefront product cap
  maxServices?: number;     // storefront service cap
  goldBadge?: boolean;
  active: boolean;
  sortOrder: number;
}

/** A listing owner's paid featured placement (Phase 8; amounts in pesewas). */
export interface Promotion {
  id: string;
  reference: string;
  listingId: string;
  listingSlug: string;
  listingTitle: string;
  memberId?: string;
  days: number;
  amountPesewas: number;
  status: PaymentStatus;
  simulated?: boolean;
  createdAt: string;
  confirmedAt?: string;
}

export interface SocialLink {
  label: string;
  url: string;
}

export interface Diaspora {
  abroad: boolean;
  city?: string;
  country?: string;
}

export interface Member {
  id: string;
  slug: string;
  displayName: string;
  initials: string;
  photoUrl?: string;
  bio?: string;
  townId?: string;
  asafoId?: string;
  schoolIds: string[];
  schooling?: SchoolStint[];
  links?: SocialLink[];
  phoneVerified: boolean;
  role: "member" | "curator" | "steward" | "editor" | "moderator";
  /** Creator kinds ("business" | "artist" | "organiser" | "institution" | "writer"); empty = plain citizen. */
  creatorTypes?: string[];
  /** Signup plan preference; paid plans remain inactive until checkout succeeds. */
  creatorPlanIntent?: string;
  joinedAt: string;
  birthday?: string;
  broadcastBirthday?: boolean;
  diaspora?: Diaspora;
  /** Two-factor (authenticator app) enrolment state — secret never leaves the server. */
  mfaEnabled?: boolean;
  /**
   * Trust signal: true for curators/stewards and approved managers of a Verified
   * authority org (emergency / security / health / local-government). See
   * GET /api/members/{slug} and the auth payloads.
   */
  verified?: boolean;
  /** What the member is verified as — "Curator" | "Steward" | "<authority org name>" (present when verified). */
  verifiedAs?: string;
  // ── Self-view only (GET /api/auth/me and the sign-in payloads) ──────────
  /** True when the member has not agreed to the current Terms/Privacy versions. */
  consentRequired?: boolean;
  /** True once the member has confirmed (or proved at sign-up) they are 18+. */
  adultVerified?: boolean;
  /** True once the member has agreed to the writing assistant's data use. */
  aiConsent?: boolean;
  /** True in production when a staff account must turn on two-factor first. */
  staffMfaRequired?: boolean;
  consent?: MemberConsent;
}

/** The Terms/Privacy versions a member agreed to, and when. */
export interface MemberConsent {
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: string;
  platform: string;
}

/** Server-side notification preferences (GET/PUT /api/me/notification-preferences). */
export interface NotificationPreferences {
  categories: { safety: boolean; community: boolean; remembrances: boolean; product: boolean };
  channels: { push: boolean; email: boolean; whatsapp: boolean };
}

/** What an account erasure removed and what is kept (DELETE /api/me and the code flow). */
export interface AccountDeletionResult {
  ok?: boolean;
  deleted: boolean;
  retained: string[];
}

/** The fee split shown before a pledge (GET /api/projects/{slug}/pledge-quote). */
export interface PledgeQuote {
  amountPesewas: number;
  feePercent: number;
  feePesewas: number;
  netPesewas: number;
  projectTitle: string;
  beneficiary?: string;
  fundingClosed: boolean;
  refundPolicy: string;
}

/** A shop's verified seller identity (public-safe KYC fields). */
export interface SellerIdentity {
  legalName: string;
  /** GhanaPost GPS code of the registered business address. */
  location?: string;
  contactEmail?: string;
  contactPhone?: string;
  registrationNumber?: string;
  verifiedAt?: string;
}

/** What can be reported through POST /api/reports. */
export type ReportTargetType = "listing" | "member" | "review" | "tribute" | "product" | "news" | "agent" | "agent_review" | "ai_output" | "ad";

export interface SchoolStint {
  schoolId: string;
  fromYear?: number;
  toYear?: number;
}

/** A "people you may know" suggestion (spec §8.6). */
export interface Connection {
  member: Member;
  reasons: string[];
  score: number;
}

export interface Office {
  id: string;
  role: string;
  holderId?: string;
  holderName?: string;
  verified: boolean;
}

/** An image (or other media) with metadata, used in institution galleries. */
export interface MediaAsset {
  id: string;
  url: string;
  kind?: string;          // photo | logo | cover | document | video
  alt?: string;           // accessibility + load fallback
  caption?: string;
  credit?: string;
  moderation?: string;    // approved | pending | rejected
}

// Review — a member's rating + note on a business.
export interface Review {
  id: string;
  listingId: string;
  listingSlug: string;
  memberId?: string;
  authorName: string;
  rating: number; // 1–5
  body?: string;
  createdAt: string;
}

// StoreItem — a product or service on a business storefront (Supporter feature).
// Prices are integer pesewas; count is capped by the plan's max (admin-set).
export interface StoreItem {
  id?: string;
  name: string;
  description?: string;
  pricePesewas?: number;
  unit?: string;          // services: "per hour", "from", …
  imageUrl?: string;
  available: boolean;
}

export interface CommerceOrderLine { productId: string; name: string; quantity: number; unitPesewas: number; subtotalPesewas: number }
export interface CommerceOrder {
  id: string; reference: string; listingId: string; listingSlug: string; businessName: string;
  buyerId?: string; buyerName: string; buyerEmail: string; buyerPhone: string;
  fulfilment: "pickup" | "delivery"; deliveryAddress?: string; note?: string;
  lines: CommerceOrderLine[]; couponCode?: string; subtotalPesewas: number;
  discountPesewas: number; amountPesewas: number; platformFeePesewas: number;
  businessNetPesewas: number; status: "pending" | "paid" | "processing" | "ready" | "fulfilled" | "cancelled" | "refunded";
  simulated?: boolean; createdAt: string; paidAt?: string; updatedAt: string;
}

/** A settlement destination type Paystack pays sellers to in Ghana. */
export type PaymentBankType = "bank" | "mobile_money";

/** One bank or Mobile Money network from GET /api/payments/banks. */
export interface PaymentBank {
  code: string;
  name: string;
  type: PaymentBankType;
}

export interface BusinessVerification {
  id: string; listingId: string; listingSlug: string; ownerId: string; legalName: string;
  registrationNumber: string; taxIdentificationNo?: string; ghanaCardNumber: string;
  businessPhone: string; ghanaPostGPS: string; documents: string[];
  /** Public seller contact shown on product pages (K19). */
  businessEmail?: string;
  settlementBankCode: string; settlementAccountNo: string; settlementName: string;
  paystackSubaccount?: string; status: "draft" | "pending" | "verified" | "rejected" | "revoked";
  reviewNote?: string; submittedAt?: string; reviewedAt?: string; createdAt: string; updatedAt: string;
}

export interface BusinessCoupon {
  id?: string; listingId?: string; ownerType?: "business" | "platform"; fundingSource?: "business" | "platform"; title?: string; code: string; description?: string;
  discountType: "percent" | "fixed"; discountValue: number; minimumPesewas?: number;
  maximumDiscountPesewas?: number; redemptionLimit?: number; redemptions?: number;
  startsAt?: string; endsAt?: string; active: boolean; createdAt?: string; updatedAt?: string;
}
export interface AffiliateProgramme { id?: string; listingId?: string; ownerType?: "business"|"platform"; name: string; description?: string; commissionBps: number; fundingSource?: "business"|"platform"; cookieWindowDays?: number; holdDays: number; minimumPayoutPesewas?: number; payoutMode?: "mobile_money"|"bank"|"manual"; active: boolean }
export interface Affiliate { id?: string; programmeId: string; listingId?: string; code: string; name: string; email: string; payoutPhone?: string; promotionChannels?: string[]; audienceSummary?: string; status?: "pending"|"approved"|"paused"|"rejected"; active: boolean }
export interface AffiliateConversion { id: string; orderReference: string; affiliateCode: string; grossPesewas: number; commissionPesewas: number; status: "reserved"|"converted"|"payable"|"paid"|"void"; holdUntil?: string }

/** One row in a list-style section (stat, team member, timeline, FAQ, doc). */
export interface SectionItem {
  id?: string;
  label?: string;   // stat label · team role · timeline date · faq question · doc title
  value?: string;   // stat value · team name · timeline heading · faq answer
  detail?: string;  // team bio · timeline body · doc note
  image?: string;   // team photo · timeline image (URL)
  url?: string;     // doc/file link · external link
}

export type ProfileSectionType =
  | "richtext" | "gallery" | "stats" | "team" | "timeline" | "faq" | "docs"
  | "quote" | "cta" | "logos" | "divider" | "groups"
  | "hero" | "testimonials" | "contact" | "menu" | "schedule" | "map";

/** A child body shown as a card in a "groups" section (house, department, Asafo company, year group, lineage). */
export interface SubEntity {
  id: string;
  name: string;
  subtitle?: string;
  crestUrl?: string;
  colors?: string[];
  summary?: string;
  attrs?: SectionItem[];  // Label/Value facts
}

/** An author-composed block on an institution's official page. */
export interface ProfileSection {
  id: string;
  type: ProfileSectionType;
  title?: string;
  anchor?: string;
  tone?: string;          // green | clay | gold | maroon | teal
  hidden?: boolean;       // zero value (absent) = visible
  body?: string;          // richtext: Markdown
  media?: MediaAsset[];   // gallery
  items?: SectionItem[];  // stats | team | timeline | faq | docs
  groups?: SubEntity[];   // groups (sub-entity cards)
}

export interface Organization {
  id: string;
  slug: string;
  kind: string;
  name: string;
  officialTitle?: string;
  motto?: string;
  crestUrl?: string;
  summary: string;
  history?: string;
  founded?: number;
  classification?: string;
  jurisdiction?: string;
  contact?: SocialLink[];
  offices?: Office[];
  gallery?: MediaAsset[];
  sections?: ProfileSection[];
  relatedOrgIds?: string[];
  verified: boolean;
  verifiedOn?: string;
  houseColors?: string[];
  osaName?: string;
  memberCount?: number;
  // Per-kind structured catalog fields (§4 perkind-catalog)
  gesCategory?: string;
  boardingType?: string;
  genderPolicy?: string;
  nhisAccredited?: boolean;
  ghanaPostGPS?: string;
  momoNumber?: string;
  latitude?: number;
  longitude?: number;
  quarterTag?: string;
  asafoTag?: string;
  verificationArtifacts?: SocialLink[];
}

export interface Place {
  id: string;
  slug: string;
  name: string;
  kind?: "quarter" | "asafo";
  parentId?: string;
  blurb?: string;
  colors?: string[];
}

export interface NewsArticle {
  id: string;
  slug: string;
  title: string;
  summary?: string;
  body: string;
  coverColor?: string;
  coverImageUrl?: string;
  tags?: string[];
  authorId: string;
  authorName: string;
  /** Author trust signal, surfaced next to the byline when present (see Member.verified). */
  authorVerified?: boolean;
  /** What the author is verified as — "Curator" | "Steward" | "<authority org name>". */
  authorVerifiedAs?: string;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  automated?: boolean;
  automationLabel?: string;
  sourceName?: string;
  sourceUrl?: string;
  /** Byline of the original story on automated articles. */
  sourceAuthor?: string;
  sourcePublishedAt?: string;
  /** "" (written by a person) | brief (automated summary) | report (AI-assisted, editor-reviewed). */
  tier?: "brief" | "report";
  /** Report sources, numbered 1..n to match the [n] markers in the body. */
  sources?: NewsSource[];
  topics?: string[];
  political?: boolean;
  /** How the cover was made. "ai" covers carry the AI-illustration labels. */
  coverImageKind?: "ai" | "branded" | "upload";
  coverImageAlt?: string;
  coverImageCredit?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  /** Dated corrections, oldest first. Never silent edits. */
  corrections?: NewsCorrection[];
}

/** One source behind an AI-assisted report. `original` marks the feed lead. */
export interface NewsSource {
  name: string;
  title?: string;
  url: string;
  author?: string;
  publishedAt?: string;
  accessedAt?: string;
  original?: boolean;
}

export interface NewsCorrection {
  at: string;
  note: string;
}

export interface Notification {
  id: string;
  memberId: string;
  kind: "approved" | "rejected" | "changes" | "remembrance" | "birthday" | "welcome" | "report";
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

/** A unified search result across the three pillars (spec §12). */
export interface SearchHit {
  kind: "listing" | "member" | "institution";
  type?: string;
  slug: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
}

export interface Tribute {
  id: string;
  authorName: string;
  /** The author's member slug (tributes need sign-in), for Block and profile links. */
  memberSlug?: string;
  relation?: string;
  message: string;
  createdAt: string;
}

/** Community safety — rescue & early recovery (auto-published on submit). */
export type IncidentCategory = "flood" | "fire" | "accident" | "medical" | "crime" | "utility" | "other";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "reported" | "verified" | "responding" | "resolved" | "recovered";

export interface IncidentStatusEntry {
  status: IncidentStatus;
  /** Internal member id; only sent to the reporter and safety staff. Never display it. */
  by?: string;
  note?: string;
  at: string;
}

export interface Incident {
  id: string;
  slug: string;
  type: "incident";
  ownerId: string;
  title: string;
  status: ListingStatus;
  tags: string[];
  townId?: string;
  details: {
    category: IncidentCategory;
    severity: IncidentSeverity;
    location: string;
    contact?: string;
    description?: string;
    incidentStatus: IncidentStatus;
    statusHistory?: IncidentStatusEntry[];
  };
  /** Crime and medical reports (and screened posts) wait for a curator. */
  held?: boolean;
  createdAt: string;
  submittedAt?: string;
  publishedAt?: string;
}

/** Lost & found — lost items, found items, missing people (auto-published on submit). */
export type LostFoundKind = "lost_item" | "found_item" | "missing_person";
export type LostFoundStatus = "open" | "reunited" | "closed";

export interface LostFound {
  id: string;
  slug: string;
  type: "lostfound";
  ownerId: string;
  title: string;
  status: ListingStatus;
  tags: string[];
  townId?: string;
  coverImageUrl?: string;
  details: {
    kind: LostFoundKind;
    description: string;
    lastSeenLocation?: string;
    lastSeenDate?: string; // YYYY-MM-DD
    /** Only sent to the poster and safety staff; others use the contact relay. */
    contact?: string;
    lfStatus: LostFoundStatus;
    subjectIsMinor?: boolean;
  };
  /** Held for curator review before it is published. */
  held?: boolean;
  createdAt: string;
  submittedAt?: string;
  publishedAt?: string;
}

/**
 * A "fat" optional details shape: the union of every listing type's
 * type-specific fields. Lets components read details.X type-safely without
 * casts, matching the Go `details` document.
 */
export interface ListingDetails {
  /** Credit and licence for the cover photo, e.g. "Photo: <author>, CC BY-SA 4.0, via Wikimedia Commons". */
  imageCredit?: string;
  // artist
  actName?: string;
  genres?: string[];
  bio?: string;
  spotlight?: boolean;
  streamingLinks?: SocialLink[];
  socials?: SocialLink[];
  booking?: string;
  latestRelease?: { title: string; year?: number; url?: string };
  releases?: ArtistRelease[];
  // person
  whyNotable?: string;
  era?: string;
  living?: boolean;
  officeIds?: string[];
  // memory
  text?: string;
  // event
  description?: string;
  startsAt?: string;
  endsAt?: string;
  venue?: string;
  organiser?: string;
  eventFormat?: EventFormat;
  audience?: string[];
  admission?: EventAdmission;
  startTime?: string;
  endTime?: string;
  highlights?: string[];
  featuredGuests?: string[];
  ageGuidance?: string;
  accessibility?: string;
  dressCode?: string;
  contactInfo?: string;
  refundPolicy?: string;
  tiers?: TicketTier[];
  anchorFestival?: boolean;
  // festival archive — events tagged with a festival slug + edition year
  festival?: string;
  edition?: string;
  recap?: string;
  programme?: { day: string; title: string; time?: string }[];
  // opportunity
  kind?: string;
  eligibility?: string;
  deadline?: string;
  applyUrl?: string;
  provider?: string;
  safeguardingPolicyUrl?: string;
  minAge?: number;
  maxAge?: number;
  guardianConsentRequired?: boolean;
  // business
  category?: string;
  categories?: string[];
  services?: { name: string; price?: string; note?: string }[];
  address?: string;
  openingHours?: string;
  contact?: SocialLink[];
  subscribedUntil?: string; // RFC3339 — Supporter paid-until date (Phase 7)
  // property — long-term rentals and short stays
  offerType?: PropertyOfferType;
  propertyType?: PropertyType;
  area?: string;
  pricePesewas?: number;
  pricePeriod?: PropertyPricePeriod;
  depositPesewas?: number;
  bedrooms?: number;
  bathrooms?: number;
  furnished?: boolean;
  amenities?: string[];
  availability?: PropertyAvailability;
  availableFrom?: string;
  bookingUrl?: string;
  // project (adopt-a-project; money in pesewas; organiser is shared with events)
  goalPesewas?: number;
  raisedPesewas?: number;
  backers?: number;
  // fundraising campaign (member-created project; Creator Monetization)
  campaign?: boolean;
  // artist donations ("tip jar" running totals; Creator Monetization)
  donationsNetPesewas?: number;
  donorCount?: number;
  // active subscription plan slug (business storefront caps resolution)
  plan?: string;
  // business reviews aggregate
  ratingAvg?: number;
  ratingCount?: number;
  // memorial
  honorific?: string;
  bornYear?: number;
  diedDate?: string;
  birthday?: string;
  observeBirthday?: boolean;
  remindersEnabled?: boolean;
  epitaph?: string;
  lifeStory?: string;
  gallery?: { url?: string; caption?: string; label?: string }[];
  associations?: string[];
  candles?: number;
  rememberedByCount?: number;
  keeperId?: string;
}

export interface ArtistTrack {
  title: string;
}

export interface ArtistRelease {
  id?: string;
  title: string;
  kind?: "album" | "ep" | "single" | "mixtape" | "live" | "compilation";
  year?: number;
  coverImageUrl?: string;
  description?: string;
  tracks?: ArtistTrack[];
  url?: string;
}

export interface ArtistBooking {
  id: string;
  artistId: string;
  artistSlug: string;
  artistName: string;
  requesterId: string;
  requesterName: string;
  requesterEmail?: string;
  requesterPhone?: string;
  eventType: string;
  eventDate: string;
  location: string;
  audienceSize?: number;
  budgetPesewas?: number;
  message?: string;
  status: "new" | "reviewing" | "accepted" | "declined";
  artistNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Listing {
  id: string;
  slug: string;
  type: ListingType;
  ownerId: string;
  title: string;
  status: ListingStatus;
  tags: string[];
  townId?: string;
  schoolIds?: string[];
  latitude?: number;
  longitude?: number;
  postedByOrgId?: string;
  coverImageUrl?: string;
  featured?: boolean;
  featuredUntil?: string;
  supporter?: boolean; // live flag on business list/detail responses (Phase 7)
  viewCount?: number;  // daily-deduped lifetime page views (spec §4 / Creator §7.5)
  // Business storefront (Supporter feature): owner-composed profile + media
  // gallery + shareable clean handle (/s/<handle>).
  sections?: ProfileSection[];
  photos?: MediaAsset[];
  videos?: MediaAsset[];
  // Storefront catalog (Supporter feature): capped per subscription plan.
  /** Illustrative seed content: never indexed, never given structured data. */
  demo?: boolean;
  products?: StoreItem[];
  services?: StoreItem[];
  handle?: string;
  // Artist detail only: whether the artist is accepting donations (owner holds
  // an active creator subscription).
  donationsEnabled?: boolean;
  /** Paid placement (promotion or plan boost) ends at this time; show "Sponsored" until then. */
  promotedUntil?: string;
  /** Held for curator review (safety posts, urgent reports). */
  held?: boolean;
  details: ListingDetails;
  tributes?: Tribute[];
  createdAt: string;
  submittedAt?: string;
  publishedAt?: string;
}

export interface Stats {
  members: number;
  listings: number;
  schools: number;
  institutions: number;
  artists: number;
  memorials: number;
  memories: number;
  pending: number;
}

export interface HomeData {
  spotlight: Listing;
  artists: Listing[];
  events: Listing[];
  memorial: Listing | null;
  stats: Stats;
}

export interface InstitutionView {
  institution: Organization;
  events: Listing[];
  officialEvents: Listing[];
}

/** One festival in the archive index (/api/festivals). */
export interface FestivalSummary {
  slug: string;
  name: string;
  tagline: string;
  editions: number;
  nextEdition?: Listing;
}

/** One year of a festival, with its events and (for past years) a recap. */
export interface FestivalEdition {
  year: string;
  recap: string;
  events: Listing[];
}

/** The archive page for one festival (/api/festivals/{slug}). */
export interface FestivalView {
  slug: string;
  name: string;
  tagline: string;
  history: string;
  editions: FestivalEdition[];
}

/** One dated landmark in the history of the people of Oguaa (the history hub). */
export interface TimelineEntry {
  id: string;
  year: string;   // "1482" — a string, so circa/era dates stay possible
  title: string;
  summary: string;
  tags?: string[];
  createdAt: string;
}

/** The assembled history hub (/api/history). */
export interface HistoryView {
  timeline: TimelineEntry[];
  heritage: Organization[];
  people: Listing[];
  memories: Listing[];
}

export interface MemberView {
  member: Member;
  listings: Listing[];
  places: Place[];
  schools: Organization[];
  /** Set when a block exists in either direction — the profile is withheld. */
  blocked?: boolean;
  /** The viewer blocked this member (only then can the viewer unblock). */
  blockedByMe?: boolean;
  /** This member blocked the viewer. */
  blockedMe?: boolean;
}

/** A member you have blocked, for the unblock list (App Store Guideline 1.2). */
export interface BlockedMember {
  memberId: string;
  slug: string;
  displayName: string;
  photoUrl?: string;
  createdAt: string;
  reason?: string;
}

/**
 * Community directives & advisories — authority-issued alerts (emergency,
 * security, health, local-government). Mirrors backend/internal/domain.Directive.
 * "Active" = status==="active" AND now>=effectiveFrom AND (no effectiveUntil OR now<=effectiveUntil).
 */
export type DirectiveSeverity = "low" | "medium" | "high" | "critical";
export type DirectiveKind = "advisory" | "directive" | "emergency";
export type DirectiveStatus = "active" | "cancelled" | "expired";

export interface Directive {
  id: string;
  slug: string;
  title: string;
  body: string;
  severity: DirectiveSeverity;
  kind: DirectiveKind;
  action?: string;         // omitted when empty
  area?: string;           // omitted when empty
  townId?: string;         // omitted when empty
  issuedByOrgId: string;
  issuedByOrgSlug: string;
  issuedByName: string;
  effectiveFrom: string;   // RFC3339
  effectiveUntil?: string; // RFC3339 — omitted = open-ended
  status: DirectiveStatus;
  createdAt: string;       // RFC3339
  createdById: string;
  automated?: boolean;
  automationLabel?: string;
  sourceName?: string;
  sourceUrl?: string;
}

/**
 * ── Explore map (GET /api/map) ───────────────────────────────────────────
 * One public payload that aggregates every geo-tagged entity across the
 * platform; the client filters layers locally. Only entities WITH
 * coordinates are returned (the API never geocodes). Slices are always
 * non-null ([] not null). Mirrors backend service/mapdata.go.
 */
export type MapPointKind =
  | "business" | "property" | "event" | "institution" | "school" | "incident"
  | "lostfound" | "landmark" | "service" | "transport";

export type MapLayer =
  | "business" | "property" | "events" | "institutions" | "safety"
  | "lostfound" | "landmarks" | "services" | "transport";

export interface MapPoint {
  id: string;
  kind: MapPointKind;
  layer: MapLayer;
  title: string;
  subtitle?: string;
  lat: number;
  lng: number;
  slug?: string;
  href?: string;                 // existing frontend route (e.g. /business/{slug}); absent on non-org POIs
  category?: string;
  severity?: IncidentSeverity;   // present only on incidents
  quarter?: string;              // resolved from the listing's townId
}

export interface MapTrailStop {
  n: number;
  title: string;
  lat: number;
  lng: number;
  story?: string;
}

export interface MapTrail {
  id: string;
  kind: "heritage" | "festival";
  title: string;
  description?: string;
  color?: string;                // hex, e.g. "#B07D32"
  stops: MapTrailStop[];
  path: [number, number][];      // [[lat,lng], …] connecting polyline
}

export interface MapArea {
  id: string;
  title: string;
  kind: "directive";
  severity: DirectiveSeverity;
  lat: number;
  lng: number;
  radiusM: number;
  until?: string;                // RFC3339 effectiveUntil
}

export interface MapData {
  points: MapPoint[];
  trails: MapTrail[];
  areas: MapArea[];
}

/**
 * Optional pagination envelope returned by the heavy list endpoints when a
 * `?page` query param is present. When `?page` is ABSENT the same endpoints
 * return a plain `T[]` (backward-compatible), so the api-client methods below
 * are overloaded: no page arg → `T[]`, `{ page }` arg → `Page<T>`.
 */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Query params for the optional pagination envelope. */
export interface PageParams {
  page: number;
  pageSize?: number;
}

// ── Building a Better Cape Coast (the civic page, /better) ──────────────────
// A small catalogue of civic behaviours grouped by the ring of life they touch,
// plus the historical civilizations whose civic habits made them great. Static,
// authored content served from GET /api/civic — no user writes.

/** The ring of civic life a behaviour touches. "town" is Cape-Coast civic life
 *  itself — public cleanliness, the markets, the shore, elders, queueing. */
export type CivicRing = "self" | "home" | "school" | "work" | "town" | "nation";

/** One civic behaviour — a thing to keep doing ("do") or to stop ("stop"). */
export interface CivicBehaviour {
  slug: string;
  ring: CivicRing;
  type: "do" | "stop";
  title: string;
  description: string;
  /** The reason it matters — surfaced on tap/hover. */
  why: string;
}

/** A civilization whose civic habits carry a lesson for a better town. */
export interface CivicLesson {
  slug: string;
  name: string;
  era: string;
  principle: string;
  lesson: string;
}

/** Payload of GET /api/civic. Note the JSON key is "behaviors" (US spelling). */
export interface CivicData {
  behaviors: CivicBehaviour[];
  civilizations: CivicLesson[];
}

export type GoalCadence = "daily" | "weekly" | "monthly" | "quarterly" | "semiannual" | "annual";
export type GoalStatus = "active" | "pending_review" | "achieved" | "missed";

/** A collective town goal (GET /api/goals) — set for a period, shown to remind
 *  everyone, and judged achieved/missed by an accountability officer. Exactly one
 *  goal is `featured` (the annual goal set at the grand durbar). `status` is
 *  computed on read: pending_review means the window closed and the officer has
 *  not yet ruled. */
export interface Goal {
  id: string;
  slug: string;
  title: string;
  description: string;
  target?: string;
  cadence: GoalCadence;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  status: GoalStatus;
  reviewNote?: string;
  reviewedById?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  setAtDurbar: boolean;
  ring?: CivicRing;
  featured: boolean;
  createdById: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
}

// ── Oguaa Outside — vetted agents & managed-escrow errands ──────────────────
// A directory of vetted individuals/offices who run business & errands for Cape
// Coast people located elsewhere (procurement from China/Accra, shipping,
// inspection-before-you-buy, travel companion, official/document errands …) for
// a fee, with MANAGED ESCROW and an "engage at your own risk" disclaimer. Money
// is always in PESEWAS (÷100 = GHS). Mirrors the Go API's agent/job/review JSON.

/** Whether an agent is a lone individual or a registered office/business. */
export type AgentType = "individual" | "office";

/** Vetting lifecycle of an agent profile. */
export type AgentStatus = "pending" | "verified" | "suspended" | "rejected";

/** A guarantor who vouches for an agent during vetting. */
export interface AgentGuarantor {
  name: string;
  phone: string;
  relation?: string;
  note?: string;
}

/** The refundable good-faith bond an agent posts (amount in pesewas). */
export interface AgentBond {
  amountPesewas: number;
  status: string;
}

/** A vetted Oguaa Outside agent (individual or office). */
export interface Agent {
  id: string;
  slug: string;
  memberId: string;
  type: AgentType;
  displayName: string;
  headline?: string;
  bio?: string;
  services: string[];        // AgentService slugs the agent offers
  coverageAreas: string[];   // free-text areas the agent covers (Accra, China …)
  rates?: string;            // free-text fee guidance
  status: AgentStatus;
  idDocUrl?: string;
  guarantor?: AgentGuarantor;
  bond: AgentBond;
  verifiedByName?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  ratingAvg: number;
  ratingCount: number;
  jobsCompleted: number;
  payoutMethod?: string;
  payoutDetail?: string;
  createdAt: string;
  updatedAt?: string;
}

/** The application / edit payload (POST /api/agents/apply, POST /api/me/agent). */
export interface AgentInput {
  type: AgentType;
  displayName: string;
  headline: string;
  bio: string;
  services: string[];
  coverageAreas: string[];
  rates: string;
  idDocUrl: string;
  guarantor: AgentGuarantor;
  payoutMethod: string;
  payoutDetail: string;
}

/** Lifecycle of an escrowed errand job. */
export type AgentJobStatus =
  | "requested" | "quoted" | "funded" | "delivered"
  | "completed" | "disputed" | "cancelled" | "refunded";

/** The managed-escrow ledger attached to a job (amounts in pesewas). */
export interface AgentEscrow {
  heldPesewas: number;
  platformFeePesewas: number;
  payoutPesewas: number;
  status: string;
  simulated: boolean;
}

/** One errand job between a client and an agent, funded through escrow. */
export interface AgentJob {
  id: string;
  reference: string;
  agentId: string;
  agentSlug: string;
  agentName: string;
  agentMemberId: string;
  clientMemberId: string;
  clientName: string;
  service: string;
  title: string;
  description: string;
  deadline?: string;
  budgetPesewas: number;
  quotePesewas: number;
  quoteNote?: string;
  status: AgentJobStatus;
  escrow: AgentEscrow;
  disputeReason?: string;
  reviewed: boolean;
  createdAt: string;
  updatedAt?: string;
}

/** A client's review of an agent, left after a job completes. */
export interface AgentReview {
  id: string;
  jobId: string;
  agentId: string;
  agentSlug: string;
  clientMemberId: string;
  clientName?: string;
  rating: number;
  body?: string;
  createdAt: string;
}

/** A service an agent can offer (GET /api/agent-services). */
export interface AgentService {
  slug: string;
  label: string;
}

/** A client's errand request (POST /api/agents/{slug}/jobs). Money in pesewas. */
export interface JobInput {
  service: string;
  title: string;
  description: string;
  budgetPesewas: number;
  deadline?: string;
}

/** The split view returned by GET /api/me/jobs. */
export interface MyJobs {
  asClient: AgentJob[];
  asAgent: AgentJob[];
}

// ── Elections (spec §1.2; public GET /api/elections) ─────────────────────────

export interface Election {
  id: string;
  name: string;
  kind: "general" | "parliamentary_by" | "party_primary" | "district_assembly" | "referendum";
  scope: "national" | "region" | "constituency";
  areas?: string[];
  pollDate: string;
  politicalAdsFrom: string;
  blackoutStart: string;
  blackoutEnd: string;
  newsModeFrom: string;
  newsModeTo: string;
  resultsDeclaredAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Paid advertising (spec §3, API §4.3–4.5) ─────────────────────────────────
// Money is integer pesewas throughout; dates are YYYY-MM-DD in Africa/Accra.

export type AdPlacementSlug = "portal-home-banner" | "portal-feed-card" | "portal-article-rect" | "marketing-card" | "app-card";
export type AdFormat = "banner" | "card" | "rect";
export type AdSurface = "portal" | "marketing" | "app";

export interface AdRateCardPlacement {
  slug: AdPlacementSlug;
  name: string;
  format: AdFormat;
  surface: AdSurface;
  description: string;
  sizes: string[];
  cpmPesewas: number;
  politicalCpmPesewas: number;
  active: boolean;
}

export interface AdCategory {
  slug: string;
  name: string;
  /** Compliance the category needs, e.g. ["fda"] or ["licence"]. */
  requires?: string[];
}

export interface AdOperator {
  name: string;
  registration: string;
  address: string;
  phone: string;
  email: string;
}

export interface AdRateCard {
  adsEnabled: boolean;
  politicalEnabled: boolean;
  currency: "GHS";
  taxRateBps: number;
  taxLabel: string;
  minOrderPesewas: number;
  minImpressions: number;
  impressionStep: number;
  maxImpressionsPerOrder: number;
  maxCampaignDays: number;
  minLeadDays: number;
  effectiveFrom: string;
  version: number;
  placements: AdRateCardPlacement[];
  blockedCategories: string[];
  categories: AdCategory[];
  operator: AdOperator;
}

export type AdPoliticalType = "" | "election" | "issue";

export interface AdQuoteRequest {
  placement: AdPlacementSlug;
  political: boolean;
  electionId: string;
  politicalType: AdPoliticalType;
  startDate: string;
  endDate: string;
  impressions: number;
}

export interface AdPriceSnapshot {
  settingsVersion: number;
  cpmPesewas: number;
  netPesewas: number;
  taxRateBps: number;
  taxPesewas: number;
  totalPesewas: number;
}

export interface AdQuote {
  placement: AdPlacementSlug;
  impressions: number;
  days: number;
  price: AdPriceSnapshot;
  available: number;
  latestEndDate: string;
  expiresAt: string;
}

export type AdSponsorKind = "commercial" | "political";
export type AdSponsorEntityType = "individual" | "business" | "ngo" | "government" | "party" | "candidate" | "campaign_committee";
export type AdSponsorStatus = "pending" | "verified" | "rejected" | "suspended";
export type AdSponsorOffice = "" | "presidential" | "parliamentary" | "district_assembly" | "party_internal" | "issue";

/** The member's own sponsor record (GET /api/me/ad-sponsors includes contact details). */
export interface AdSponsor {
  id: string;
  kind: AdSponsorKind;
  entityType: AdSponsorEntityType;
  displayName: string;
  legalName: string;
  registrationNumber?: string;
  idNumberLast4?: string;
  tin?: string;
  address: string;
  phone?: string;
  email?: string;
  contactPerson?: string;
  partyName?: string;
  candidateName?: string;
  office?: AdSponsorOffice;
  constituency?: string;
  citizenshipDeclaredAt?: string;
  /** A Ghana Card copy is stored for this sponsor (the id itself is never sent back). */
  hasIdDocument?: boolean;
  /** An Electoral Commission authorisation is stored for this sponsor. */
  hasEcAuthorisation?: boolean;
  status: AdSponsorStatus;
  reviewNote?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdSponsorInput {
  kind: AdSponsorKind;
  entityType: AdSponsorEntityType;
  displayName: string;
  legalName: string;
  registrationNumber: string;
  idNumberLast4: string;
  idDocumentUploadId: string;
  tin: string;
  address: string;
  phone: string;
  email: string;
  contactPerson: string;
  partyName: string;
  candidateName: string;
  office: AdSponsorOffice;
  constituency: string;
  ecAuthorisationUploadId: string;
  citizenshipDeclaration: boolean;
}

export interface AdCreative {
  format: AdFormat;
  imageUrl?: string;
  imageUrlDesktop?: string;
  imageUrlMobile?: string;
  headline?: string;
  body?: string;
  alt: string;
  landingUrl: string;
  containsSyntheticMedia: boolean;
}

export interface AdCompliance {
  fdaRegistrationNo?: string;
  fdaApprovalRef?: string;
  fdaApprovalExpiresOn?: string;
  regulator?: "" | "SEC" | "BoG" | "NIC" | "GamingCommission" | "NLA";
  licenceNumber?: string;
}

export type AdStatus =
  | "pending_review" | "approved" | "scheduled" | "active" | "completed"
  | "rejected" | "expired" | "cancelled" | "removed" | "paused";

export interface AdStatusChange {
  from: string;
  to: string;
  at: string;
  actorName: string;
  reason?: string;
}

export interface AdApproval {
  staffName: string;
  at: string;
}

export interface AdRefund {
  id: string;
  amountPesewas: number;
  reason: string;
  status: "requesting" | "pending" | "processed" | "failed" | "manual_check";
  createdAt: string;
  updatedAt: string;
}

/** A campaign in the advertiser shape (spec §4.5). */
export interface AdCampaign {
  id: string;
  sponsorId: string;
  sponsorLine: string;
  political: boolean;
  politicalType?: AdPoliticalType;
  electionId?: string;
  electionName?: string;
  category: string;
  compliance: AdCompliance;
  placement: AdPlacementSlug;
  creative: AdCreative;
  startDate: string;
  endDate: string;
  bookedImpressions: number;
  price: AdPriceSnapshot;
  status: AdStatus;
  statusHistory: AdStatusChange[];
  approvals?: AdApproval[];
  approvalExpiresAt?: string;
  rejectReason?: string;
  removalReason?: string;
  startConsentAt?: string;
  reference?: string;
  paymentStatus: "none" | "pending" | "success" | "failed";
  paidAt?: string;
  simulated?: boolean;
  failureReason?: string;
  delivered: number;
  clicks: number;
  firstImpressionAt?: string;
  lastImpressionAt?: string;
  refunds?: AdRefund[];
  refundedPesewas: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdDailyDelivery {
  day: string;
  views: number;
  clicks: number;
}

/** GET /api/me/ads/{id}: the campaign plus its daily delivery. */
export type AdCampaignDetail = AdCampaign & { daily?: AdDailyDelivery[] };

/** POST /api/me/ads body. */
export interface AdCampaignInput {
  sponsorId: string;
  placement: AdPlacementSlug;
  political: boolean;
  politicalType: AdPoliticalType;
  electionId: string;
  category: string;
  compliance: AdCompliance & { approvalUploadId?: string };
  creative: Omit<AdCreative, "format">;
  startDate: string;
  endDate: string;
  impressions: number;
  acceptTerms: boolean;
  startConsent: boolean;
  email: string;
}

/** One ad in a slate (GET /api/ads/slate). */
export interface AdSlateAd {
  id: string;
  format: AdFormat;
  imageUrl?: string;
  imageUrlDesktop?: string;
  imageUrlMobile?: string;
  headline?: string;
  body?: string;
  alt: string;
  /** "Ad" | "Political ad", verbatim. */
  chip: string;
  /** "Sponsored · X" | "Paid for by X", verbatim. */
  sponsorLine: string;
  political: boolean;
  electionName?: string;
  syntheticMedia: boolean;
  clickUrl: string;
  token: string;
  exp: number;
  weight: number;
}

export interface AdSlate {
  placement: AdPlacementSlug;
  /** Placement description for the "Why am I seeing this ad?" panel. */
  why: string;
  ads: AdSlateAd[];
}

/** One public ad-library entry (GET /api/ads/library). */
export interface AdLibraryItem {
  id: string;
  format: AdFormat;
  imageUrl?: string;
  imageUrlDesktop?: string;
  imageUrlMobile?: string;
  headline?: string;
  body?: string;
  /** The creative's image description, as the sponsor wrote it. */
  alt?: string;
  chip: string;
  sponsorLine: string;
  political: boolean;
  /** Political entries only; empty for commercial ads (privacy). */
  legalName: string;
  partyName?: string;
  candidateName?: string;
  constituency?: string;
  electionName?: string;
  placement: AdPlacementSlug;
  startDate: string;
  endDate: string;
  delivered: number;
  amountPaidPesewas: number;
  refundedPesewas: number;
  status: AdStatus;
  removalReason?: string;
  syntheticMedia: boolean;
}

export interface AdLibraryPage {
  items: AdLibraryItem[];
  total: number;
  page: number;
  perPage: number;
}
