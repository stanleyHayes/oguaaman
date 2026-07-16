export type ListingStatus = "draft" | "pending" | "approved" | "rejected" | "unpublished";
export type ListingType = "business" | "artist" | "person" | "memory" | "event" | "opportunity" | "memorial" | "project" | "incident" | "lostfound";

export interface SocialLink { label: string; url: string }

export interface ListingDetails {
  actName?: string; genres?: string[]; bio?: string; booking?: string;
  streamingLinks?: SocialLink[]; socials?: SocialLink[];
  whyNotable?: string; era?: string; living?: boolean;
  text?: string; description?: string; startsAt?: string; venue?: string; organiser?: string;
  kind?: string; eligibility?: string; provider?: string; deadline?: string; applyUrl?: string;
  category?: string; address?: string; openingHours?: string;
  services?: { name: string; price?: string; note?: string }[];
  honorific?: string; epitaph?: string; lifeStory?: string; candles?: number;
  bornYear?: number; diedDate?: string; birthday?: string; observeBirthday?: boolean;
  associations?: string[]; rememberedByCount?: number;
  gallery?: { url?: string; caption: string }[];
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
  viewCount?: number;
  details: ListingDetails;
  createdAt: string;
  submittedAt?: string;
  publishedAt?: string;
  rejectionReason?: string;
}

export interface SchoolStint { schoolId: string; fromYear?: number; toYear?: number }

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
  suspended: boolean;
  phoneVerified: boolean;
  schoolIds: string[];
  schooling?: SchoolStint[];
  links?: SocialLink[];
  birthday?: string;
  broadcastBirthday?: boolean;
  joinedAt: string;
  /** Two-factor enrolment state — required for staff roles (spec §14). */
  mfaEnabled?: boolean;
  /** Own contact identifiers — only present on self-auth payloads. */
  email?: string;
  phone?: string;
}

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
  kind: string;
  name: string;
  officialTitle?: string;
  motto?: string;
  crestUrl?: string;
  summary: string;
  history?: string;
  classification?: string;
  jurisdiction?: string;
  founded?: number;
  contact?: SocialLink[];
  offices: Office[];
  gallery?: MediaAsset[];
  sections?: ProfileSection[];
  relatedOrgIds?: string[];
  verified: boolean;
  verifiedOn?: string;
  houseColors?: string[];
  osaName?: string;
  memberCount?: number;
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

export interface Place { id: string; slug: string; name: string; kind?: "quarter" | "asafo"; blurb?: string; colors?: string[] }

/** Rich views from the public API, reused for admin detail pages. */
export interface MemberView { member: Member; listings: Listing[]; places: Place[]; schools: Organization[] }
export interface InstitutionView { institution: Organization; events: Listing[]; officialEvents: Listing[] }

export interface TeamMember {
  claimId: string;
  memberId: string;
  memberName: string;
  memberSlug: string;
  photoUrl?: string;
  role: string;
  scope: "manager" | "officer";
  status: "approved" | "invited";
  invitedByName?: string;
}

export interface Stats {
  members: number; listings: number; schools: number; institutions: number;
  artists: number; memorials: number; memories: number; pending: number;
  viewsThisMonth: number;
  avgApprovalHrs: number;
}

export interface ModerationRecord {
  id: string;
  listingId: string;
  moderatorId: string;
  action: string;
  reason?: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: string;
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

// Shared Paystack-style payment lifecycle used by pledges, tickets, subscriptions and promotions.
export type PaymentStatus = "pending" | "success" | "failed";

// A pledge toward an adopt-a-project campaign (amounts in pesewas).
export interface Pledge {
  id: string;
  reference: string;
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  memberId?: string;
  amountPesewas: number;
  feePesewas?: number; // platform fee kept on confirmation
  netPesewas?: number; // credited to the project
  currency: string;
  status: PaymentStatus;
  simulated?: boolean;
  createdAt: string;
  confirmedAt?: string;
}

// Platform-fee split across successful pledges (GET /api/admin/pledges/totals).
export interface PledgeTotals {
  grossPesewas: number;
  feePesewas: number;
  netPesewas: number;
}

// A paid ticket tier on an event (details.tiers; capacity 0 = unlimited).
export interface TicketTier {
  name: string;
  pricePesewas: number;
  capacity: number;
}

// An event ticket bought via Paystack (Phase 6; amounts in pesewas).
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

// A business owner's paid Supporter subscription (Phase 7; amounts in pesewas).
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
  createdAt: string;
  updatedAt: string;
}

// A listing owner's paid featured placement (Phase 8; amounts in pesewas).
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

// Platform income overview across all four money streams (GET /api/admin/revenue).
export interface RevenueOverview {
  pledges: { grossPesewas: number; feePesewas: number; netPesewas: number };
  tickets: { grossPesewas: number; count: number };
  subscriptions: { grossPesewas: number; count: number; active: number };
  promotions: { grossPesewas: number; count: number };
  totalPesewas: number;
}

// A member-filed report against a listing, for steward triage (spec §14.3/§14.4/§14.7).
export interface Report {
  id: string;
  listingId: string;
  listingSlug: string;
  listingType: string;
  listingTitle: string;
  reason: string;
  detail?: string;
  reporterId?: string;
  reporterName?: string;
  status: "open" | "actioned" | "dismissed";
  createdAt: string;
  reviewedById?: string;
  reviewedAt?: string;
  resolution?: string;
  keeperClaim?: boolean;
}

// A pending institution-management claim, enriched for steward review (spec §8.13).
export interface OrgClaim {
  id: string;
  orgId: string;
  memberId: string;
  requestedRole: string;
  note?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  orgName: string;
  orgSlug: string;
  memberName: string;
  /** Set = a request to CREATE this institution (approve creates + verifies it). */
  newOrg?: { name: string; kind: string; seat: string };
}
