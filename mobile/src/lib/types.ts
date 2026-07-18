export interface SocialLink { label: string; url: string }

export interface ListingDetails {
  actName?: string;
  genres?: string[];
  bio?: string;
  spotlight?: boolean;
  streamingLinks?: SocialLink[];
  latestRelease?: { title: string; year?: number };
  honorific?: string;
  bornYear?: number;
  diedDate?: string;
  birthday?: string;
  observeBirthday?: boolean;
  epitaph?: string;
  lifeStory?: string;
  candles?: number;
  rememberedByCount?: number;
  associations?: string[];
  gallery?: { url?: string; caption?: string }[];
  // person
  whyNotable?: string;
  era?: string;
  living?: boolean;
  // memory
  text?: string;
  // event
  description?: string;
  startsAt?: string;
  venue?: string;
  organiser?: string;
  anchorFestival?: boolean;
  edition?: string;
  festival?: string;
  programme?: { day?: string; time?: string; title: string }[];
  // business supporter subscription
  subscribedUntil?: string;
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
  services?: { name: string; price?: string; note?: string }[];
  address?: string;
  openingHours?: string;
  contact?: SocialLink[];
  // project (adopt-a-project; money in pesewas; organiser shared with events)
  goalPesewas?: number;
  raisedPesewas?: number;
  backers?: number;
  [k: string]: unknown;
}

export interface Tribute {
  id: string;
  authorName: string;
  relation?: string;
  message: string;
  createdAt: string;
}

export interface Listing {
  id: string;
  slug: string;
  type: string;
  ownerId?: string;
  title: string;
  status: string;
  tags: string[];
  townId?: string;
  schoolIds?: string[];
  coverImageUrl?: string;
  featured?: boolean;
  featuredUntil?: string;
  supporter?: boolean;
  viewCount?: number;
  details: ListingDetails;
  tributes?: Tribute[];
}

export interface Stats {
  members: number;
  listings: number;
  schools: number;
  artists: number;
  memorials: number;
  institutions?: number;
  memories?: number;
  pending?: number;
}

export interface SchoolStint { schoolId: string; fromYear?: number; toYear?: number }

export interface Diaspora { abroad: boolean; city?: string; country?: string }

export interface Member {
  id: string;
  slug: string;
  displayName: string;
  initials: string;
  bio?: string;
  photoUrl?: string;
  /** Off-platform links (Instagram, website…) shown on the public profile. */
  links?: SocialLink[];
  role: "member" | "curator" | "steward" | "editor";
  /** Creator kinds ("writer" | "business" | "artist" | "organiser" | …); empty = plain citizen. */
  creatorTypes?: string[];
  /** Creator plan preference selected at signup; it is not an active entitlement. */
  creatorPlanIntent?: string;
  phoneVerified: boolean;
  /** True for curators/stewards and approved managers of a verified authority org. */
  verified?: boolean;
  /** When verified: "Curator" | "Steward" | the authority org name. */
  verifiedAs?: string;
  townId?: string;
  asafoId?: string;
  schoolIds?: string[];
  schooling?: SchoolStint[];
  diaspora?: Diaspora;
  birthday?: string;
  broadcastBirthday?: boolean;
  /** Two-factor enrolment state — secret never leaves the server. */
  mfaEnabled?: boolean;
  joinedAt?: string;
}

export interface Place { id: string; slug: string; name: string; kind?: "quarter" | "asafo"; colors?: string[] }

export interface Office { id: string; role: string; holderId?: string; holderName?: string; verified: boolean }

export interface MediaAsset {
  id: string;
  url: string;
  kind?: string;
  alt?: string;
  caption?: string;
  credit?: string;
  moderation?: string;
}

export interface SectionItem {
  id?: string;
  label?: string;
  value?: string;
  detail?: string;
  image?: string;
  url?: string;
}

export type ProfileSectionType =
  | "richtext" | "gallery" | "stats" | "team" | "timeline" | "faq" | "docs"
  | "quote" | "cta" | "logos" | "divider" | "groups"
  | "hero" | "testimonials" | "contact" | "menu" | "schedule" | "map";

export interface SubEntity {
  id: string;
  name: string;
  subtitle?: string;
  crestUrl?: string;
  colors?: string[];
  summary?: string;
  attrs?: SectionItem[];
}

export interface ProfileSection {
  id: string;
  type: ProfileSectionType;
  title?: string;
  anchor?: string;
  tone?: string;
  hidden?: boolean;
  body?: string;
  media?: MediaAsset[];
  items?: SectionItem[];
  groups?: SubEntity[];
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  kind: string;
  officialTitle?: string;
  motto?: string;
  crestUrl?: string;
  summary?: string;
  history?: string;
  founded?: number;
  classification?: string;
  jurisdiction?: string;
  contact?: SocialLink[];
  offices?: Office[];
  gallery?: MediaAsset[];
  sections?: ProfileSection[];
  houseColors?: string[];
  osaName?: string;
  memberCount?: number;
  verified?: boolean;
  verifiedOn?: string;
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

export interface InstitutionView {
  institution: Organization;
  events: Listing[];
  officialEvents: Listing[];
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

export interface MemberView {
  member: Member;
  listings: Listing[];
  places?: Place[];
  schools?: Organization[];
}

/** "People you may know" suggestion (spec §8.6). */
export interface Connection {
  member: Member;
  reasons: string[];
  score: number;
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
  authorId?: string;
  authorName: string;
  /** Present when the author is a verified member (surfaces a badge on bylines). */
  authorVerified?: boolean;
  authorVerifiedAs?: string;
  status: "draft" | "published";
  createdAt: string;
  updatedAt?: string;
  publishedAt?: string;
}

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

/**
 * Directives — advisories, directives and emergency notices issued by authority
 * institutions (emergency-service, security-service, health-service,
 * local-government). Severity mirrors the incident palette so the two safety
 * surfaces read the same. "Active" = status "active" AND now within
 * [effectiveFrom, effectiveUntil] (effectiveUntil empty = open-ended).
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
  action?: string;
  area?: string;
  townId?: string;
  issuedByOrgId: string;
  issuedByOrgSlug: string;
  issuedByName: string;
  effectiveFrom: string;      // RFC3339
  effectiveUntil?: string;    // RFC3339; omitted = open-ended
  status: DirectiveStatus;
  createdAt: string;          // RFC3339
  createdById: string;
}

/** Community safety — rescue & early recovery (auto-published on submit). */
export type IncidentCategory = "flood" | "fire" | "accident" | "medical" | "crime" | "utility" | "other";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "reported" | "verified" | "responding" | "resolved" | "recovered";

export interface IncidentStatusEntry {
  status: IncidentStatus;
  by: string;
  note?: string;
  at: string;
}

export interface Incident {
  id: string;
  slug: string;
  type: "incident";
  ownerId: string;
  title: string;
  status: string;
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
  createdAt: string;
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
  status: string;
  tags: string[];
  townId?: string;
  coverImageUrl?: string;
  details: {
    kind: LostFoundKind;
    description: string;
    lastSeenLocation?: string;
    lastSeenDate?: string; // YYYY-MM-DD
    contact: string;
    lfStatus: LostFoundStatus;
  };
  createdAt: string;
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
  year: string;
  title: string;
  summary: string;
  tags?: string[];
}

/** The assembled history hub (/api/history). */
export interface HistoryView {
  timeline: TimelineEntry[];
  heritage: Organization[];
  people: Listing[];
  memories: Listing[];
}

/** A paid ticket tier on an event, with live sales numbers. */
export interface TicketTierView {
  name: string;
  pricePesewas: number;
  capacity: number;
  sold: number;
  remaining: number | null; // null when unlimited
}

/** The event detail payload: the approved event plus its tiers. */
export interface EventView {
  event: Listing;
  tiers: TicketTierView[];
}

/** Lifecycle of a Paystack payment (tickets, subscriptions, promotions). */
export type PaymentStatus = "pending" | "success" | "failed";

/** An event ticket bought via Paystack (amounts in pesewas). */
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
}

/** A business owner's paid Supporter subscription (amounts in pesewas). */
export interface Subscription {
  id: string;
  reference: string;
  memberId?: string;
  listingId: string;
  listingSlug: string;
  listingTitle: string;
  plan: "business-supporter";
  amountPesewas: number;
  status: PaymentStatus;
  periodEnd?: string; // RFC3339; set on success
  simulated?: boolean;
  createdAt: string;
}

/** A listing owner's paid featured placement (amounts in pesewas). */
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
}

export interface HomeData {
  spotlight: Listing;
  artists: Listing[];
  events?: Listing[];
  memorial: Listing | null;
  stats: Stats;
}

/**
 * The map / Explore payload (GET /api/map, public). The backend returns only
 * entities that carry coordinates — no server-side geocoding — and the client
 * filters layers locally. Slices are always non-null (`[]`, never null).
 * Cape Coast centre ≈ [5.1053, -1.2466].
 */
export type MapPointKind =
  | "business" | "event" | "institution" | "school" | "incident"
  | "lostfound" | "landmark" | "service" | "transport";
export type MapLayer =
  | "business" | "events" | "institutions" | "safety"
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
  /** Web-app route to the detail page; absent when the POI has no detail page. */
  href?: string;
  category?: string;
  /** Present only on incidents (kind "incident"). */
  severity?: IncidentSeverity;
  /** Resolved from the listing's townId when available. */
  quarter?: string;
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
  /** Hex accent for the trail line/badges (e.g. "#B07D32"). */
  color?: string;
  stops: MapTrailStop[];
  /** Polyline as [lat, lng] pairs. */
  path: [number, number][];
}

export interface MapArea {
  id: string;
  title: string;
  kind: "directive";
  severity: DirectiveSeverity;
  lat: number;
  lng: number;
  radiusM: number;
  /** RFC3339 effectiveUntil, when the directive carries one. */
  until?: string;
}

export interface MapData {
  points: MapPoint[];
  trails: MapTrail[];
  areas: MapArea[];
}

// ── Creator Studio (Phase 2 mobile parity) ──
// These mirror creator/src/lib/types.ts exactly so the mobile studio screens
// reuse the same backend shapes the web creator app already consumes. Office,
// MediaAsset, ProfileSection, Organization, Listing, Ticket etc. are declared
// above and shared with the public reads.

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
  goldBadge?: boolean;
  active: boolean;
  sortOrder: number;
}

/** Owner-scoped dashboard KPIs (GET /api/creator/overview; amounts in pesewas). */
export interface CreatorOverview {
  listings: number;
  live: number;
  pending: number;
  activePromotions: number;
  promotionDaysLeft: number;
  activeSubscription: boolean;
  plan?: string;
  ticketsSold: number;
  ticketsGrossPesewas: number;
  pledgesRaisedPesewas: number;
  viewsThisMonth: number;  // unique daily views on all owned listings this month
}

/** A backer's pledge to an adopt-a-project (amounts in pesewas). */
export interface Pledge {
  id: string;
  reference: string;
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  memberId?: string;
  amountPesewas: number;
  feePesewas?: number;
  netPesewas?: number;
  currency: string;
  status: string;
  simulated?: boolean;
  createdAt: string;
  confirmedAt?: string;
}

/** Owner earnings breakdown (GET /api/creator/earnings). */
export interface CreatorEarnings {
  ticketSales: Ticket[];
  pledges: Pledge[];
}

// ── institution teams (Creator plan §4.1.2) ──

/** One row of an institution's team roster. */
export interface TeamMember {
  claimId: string;
  memberId: string;
  memberName: string;
  memberSlug: string;
  photoUrl?: string;
  role: string;             // the office they hold
  scope: "manager" | "officer";
  status: "approved" | "invited";
  invitedByName?: string;
}

/** The roster plus the viewer's own scope (drives manager-only actions). */
export interface TeamView {
  viewerScope: "manager" | "officer";
  team: TeamMember[];
}

/** A team invitation awaiting the signed-in member's answer. */
export interface Invitation {
  id: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  requestedRole: string;
  scope: "manager" | "officer";
  invitedByName?: string;
  createdAt: string;
}

// ── request-a-new-institution (Creator plan §4.1.1) ──

/** One entry of the server-side institution kind catalog. */
export interface InstitutionKind { slug: string; label: string }

/** The member's own request to create a missing institution. */
export interface InstitutionRequest {
  id: string;
  requestedRole: string;
  note?: string;
  status: "pending" | "approved" | "rejected";
  newOrg: { name: string; kind: string; seat: string };
  createdAt: string;
}

// ── Build a better Oguaa — the civic hub (GET /api/civic) ──
// Static, authored content served from the API — no user writes. Mirrors the
// web frontend/backend contract EXACTLY (the JSON key is "behaviors", US
// spelling); the shape must not drift.

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
  /** The reason it matters — surfaced on tap. */
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

/** A collective town goal (GET /api/goals): set for a period, shown to remind
 *  everyone, and judged achieved/missed by an accountability officer. Exactly one
 *  is `featured` (the annual goal set at the grand durbar). `status` is computed
 *  on read (pending_review = window closed, awaiting the officer). */
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
