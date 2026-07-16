export type ListingStatus = "draft" | "pending" | "approved" | "rejected" | "unpublished";
export type ListingType = "business" | "artist" | "person" | "memory" | "event" | "opportunity" | "memorial" | "project" | "incident" | "lostfound";

export interface SocialLink { label: string; url: string }

export interface ListingDetails {
  actName?: string; genres?: string[]; bio?: string; booking?: string;
  streamingLinks?: SocialLink[]; socials?: SocialLink[];
  text?: string; description?: string; startsAt?: string; venue?: string; organiser?: string;
  category?: string; address?: string; openingHours?: string;
  services?: { name: string; price?: string; note?: string }[];
  [k: string]: unknown;
}

export interface Listing {
  id: string;
  slug: string;
  type: ListingType;
  ownerId: string;
  title: string;
  status: ListingStatus;
  tags: string[];
  featured?: boolean;
  featuredUntil?: string;
  coverImageUrl?: string;
  details: ListingDetails;
  createdAt: string;
  submittedAt?: string;
  publishedAt?: string;
  rejectionReason?: string;
}

export interface Member {
  id: string;
  slug: string;
  displayName: string;
  initials: string;
  bio?: string;
  photoUrl?: string;
  townId?: string;
  asafoId?: string;
  role: "member" | "curator" | "steward" | "editor" | "moderator";
  /** What they create (business/artist/organiser…); empty = plain citizen. */
  creatorTypes?: string[];
  suspended: boolean;
  phoneVerified: boolean;
  schoolIds: string[];
  links?: SocialLink[];
  birthday?: string;
  broadcastBirthday?: boolean;
  joinedAt: string;
  /** Two-factor enrolment state — secret never leaves the server. */
  mfaEnabled?: boolean;
}

export interface Office { id: string; role: string; holderId?: string; holderName?: string; verified: boolean }

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
  contact?: SocialLink[];
  offices?: Office[];
  gallery?: MediaAsset[];
  sections?: ProfileSection[];
  verified: boolean;
}

/** Public institution page payload (GET /api/institutions/:slug). */
export interface InstitutionView {
  institution: Organization;
  events: Listing[];
  officialEvents: Listing[];
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

export interface MemberView { member: Member; listings: Listing[] }

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

// Shared Paystack-style payment lifecycle used by tickets, subscriptions and promotions.
export type PaymentStatus = "pending" | "success" | "failed";

// An event ticket bought via Paystack (amounts in pesewas).
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
  code?: string;
  checkedInAt?: string;
  simulated?: boolean;
  createdAt: string;
  confirmedAt?: string;
}

// A business owner's paid Supporter subscription (amounts in pesewas).
export interface Subscription {
  id: string;
  reference: string;
  memberId?: string;
  listingId: string;
  listingSlug: string;
  listingTitle: string;
  plan: string;
  amountPesewas: number;
  status: PaymentStatus;
  periodEnd?: string;
  simulated?: boolean;
  createdAt: string;
  confirmedAt?: string;
}

// A subscription plan from the staff-managed catalog (Creator plan §5).
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

// A listing owner's paid featured placement (amounts in pesewas).
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

// Owner-scoped dashboard KPIs (GET /api/creator/overview; amounts in pesewas).
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
}
