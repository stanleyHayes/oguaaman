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
}

export interface Office { id: string; role: string; holderId?: string; holderName?: string; verified: boolean }

export interface Organization {
  id: string;
  slug: string;
  kind: string;
  name: string;
  officialTitle?: string;
  motto?: string;
  crestUrl?: string;
  summary: string;
  classification?: string;
  offices: Office[];
  verified: boolean;
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
