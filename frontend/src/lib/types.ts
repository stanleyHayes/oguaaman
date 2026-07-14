// TypeScript mirror of the Go API's JSON shapes (backend/internal/domain).

/** Lifecycle of a payment (pledge / ticket / subscription / promotion). */
export type PaymentStatus = "pending" | "success" | "failed";

export type ListingStatus =
  | "draft" | "pending" | "approved" | "rejected" | "unpublished";

export type ListingType =
  | "business" | "artist" | "person" | "memory" | "event" | "opportunity" | "memorial" | "project" | "incident" | "lostfound";

/** A contribution toward an adopt-a-project campaign (amounts in pesewas). */
export interface Pledge {
  id: string;
  reference: string;
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  memberId?: string;
  amountPesewas: number;
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
  listingId: string;
  listingSlug: string;
  listingTitle: string;
  plan: "business-supporter";
  amountPesewas: number;
  status: PaymentStatus;
  periodEnd?: string; // RFC3339; set on success
  simulated?: boolean;
  createdAt: string;
  confirmedAt?: string;
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
  role: "member" | "curator" | "steward" | "editor";
  joinedAt: string;
  birthday?: string;
  broadcastBirthday?: boolean;
  diaspora?: Diaspora;
}

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
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
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
    contact: string;
    lfStatus: LostFoundStatus;
  };
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
  // artist
  actName?: string;
  genres?: string[];
  bio?: string;
  spotlight?: boolean;
  streamingLinks?: SocialLink[];
  socials?: SocialLink[];
  booking?: string;
  latestRelease?: { title: string; year?: number; url?: string };
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
  venue?: string;
  organiser?: string;
  anchorFestival?: boolean;
  tiers?: TicketTier[];
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
  // business
  category?: string;
  services?: { name: string; price?: string; note?: string }[];
  address?: string;
  openingHours?: string;
  contact?: SocialLink[];
  subscribedUntil?: string; // RFC3339 — Supporter paid-until date (Phase 7)
  // project (adopt-a-project; money in pesewas; organiser is shared with events)
  goalPesewas?: number;
  raisedPesewas?: number;
  backers?: number;
  // memorial
  honorific?: string;
  bornYear?: number;
  diedDate?: string;
  birthday?: string;
  observeBirthday?: boolean;
  remindersEnabled?: boolean;
  epitaph?: string;
  lifeStory?: string;
  gallery?: { url?: string; caption: string }[];
  associations?: string[];
  candles?: number;
  rememberedByCount?: number;
  keeperId?: string;
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
  postedByOrgId?: string;
  coverImageUrl?: string;
  featured?: boolean;
  featuredUntil?: string;
  supporter?: boolean; // live flag on business list/detail responses (Phase 7)
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
}
