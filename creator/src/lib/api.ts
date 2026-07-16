import type { CreatorEarnings, CreatorOverview, InstitutionKind, InstitutionRequest, InstitutionView, Invitation, Listing, MediaAsset, Member, MemberView, NewsArticle, NotificationItem, Office, Organization, Plan, ProfileSection, Promotion, SocialLink, Subscription, TeamView, Ticket } from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "";
const TOKEN_KEY = "oguaa.creator.token";

export function getToken(): string | null {
  return typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
}
export function setToken(t: string | null) {
  if (typeof localStorage === "undefined") return;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}
function headers(json = false): HeadersInit {
  const h: Record<string, string> = {};
  if (json) h["content-type"] = "application/json";
  const t = getToken();
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status})`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error ?? "Request failed"), { status: res.status, data });
  return data as T;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE", headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error ?? "Request failed"), { status: res.status, data });
  return data as T;
}

// LoginResult — password sign-in either completes (token+member) or, for
// MFA-enrolled accounts, returns a 5-minute challenge for the code step.
export interface LoginResult {
  token?: string;
  member?: Member;
  mfaRequired?: boolean;
  challenge?: string;
}

export const api = {
  // auth (spec §8.1) — any signed-in member may use the creator app; citizens
  // upgrade to creator types in-app (Account page).
  login: (identifier: string, password: string) =>
    post<LoginResult>("/api/auth/login", { identifier, password }),
  mfaLogin: (challenge: string, code: string) =>
    post<{ token: string; member: Member }>("/api/auth/mfa", { challenge, code }),
  me: () => get<Member>("/api/auth/me"),

  // Owner-scoped dashboard aggregation (Creator Platform plan §4).
  creatorOverview: () => get<CreatorOverview>("/api/creator/overview"),
  creatorEarnings: () => get<CreatorEarnings>("/api/creator/earnings"),
  setCreatorTypes: (creatorTypes: string[]) => post<Member>("/api/me/creator-types", { creatorTypes }),

  // Profile editing — photo (Cloudinary/first-party upload, we store the URL),
  // display name + bio, and sanitised social links.
  setPhoto: (photoUrl: string) => post<{ photoUrl: string }>("/api/me/photo", { photoUrl }),
  setProfile: (body: { displayName?: string; bio?: string }) => post<Member>("/api/me/profile", body),
  setLinks: (links: SocialLink[]) => post<{ links: SocialLink[] }>("/api/me/links", { links }),

  // Newsroom authoring: writers submit drafts for review, verified-authority
  // managers publish directly. Public listing returns published posts only.
  news: () => get<NewsArticle[]>("/api/news"),
  submitNews: (body: { title: string; summary?: string; body: string; coverColor?: string; coverImageUrl?: string; tags?: string[] }) =>
    post<NewsArticle>("/api/news", body),

  // The member's own listings arrive on the public member view (all statuses).
  member: (slug: string) => get<MemberView>(`/api/members/${slug}`),

  // Owner listing editor: full-replace title/cover/whitelisted details.
  // Approved listings stay live; non-live ones re-queue for review.
  updateListing: (id: string, body: { title: string; coverImageUrl?: string; details: Record<string, unknown> }) =>
    post<Listing>(`/api/listings/${id}/edit`, body),

  // Institutions the member manages (claim → steward-verify → manage, spec §8.13).
  myInstitutions: () => get<Organization[]>("/api/me/institutions"),
  institution: (slug: string) => get<InstitutionView>(`/api/institutions/${slug}`),
  // Manager-editable official page: profile, offices, gallery, custom sections,
  // and official events (full-replace semantics, mirroring the portal editor).
  updateOrgProfile: (slug: string, body: { summary?: string; history?: string; motto?: string; crestUrl?: string; contact?: { label: string; url: string }[]; gesCategory?: string; boardingType?: string; genderPolicy?: string; nhisAccredited?: boolean | null; ghanaPostGPS?: string; momoNumber?: string; latitude?: number | null; longitude?: number | null; quarterTag?: string; asafoTag?: string; verificationArtifacts?: { label: string; url: string }[] }) =>
    post<Organization>(`/api/institutions/${slug}/profile`, body),
  setOrgOffices: (slug: string, offices: Office[]) =>
    post<Organization>(`/api/institutions/${slug}/offices`, { offices }),
  setOrgGallery: (slug: string, gallery: MediaAsset[]) =>
    post<Organization>(`/api/institutions/${slug}/gallery`, { gallery }),
  setOrgSections: (slug: string, sections: ProfileSection[]) =>
    post<Organization>(`/api/institutions/${slug}/sections`, { sections }),
  postOrgEvent: (slug: string, body: { title: string; details?: Record<string, unknown> }) =>
    post<Listing>(`/api/institutions/${slug}/events`, body),

  // Team management (Creator plan §4.1.2): managers invite citizens by
  // email/phone + office; invitees accept without steward review.
  orgTeam: (slug: string) => get<TeamView>(`/api/institutions/${slug}/team`),
  inviteToTeam: (slug: string, body: { identifier: string; role: string; scope?: string }) =>
    post<{ id: string }>(`/api/institutions/${slug}/team/invite`, body),
  setTeamScope: (slug: string, memberId: string, scope: "manager" | "officer") =>
    post<{ status: string }>(`/api/institutions/${slug}/team/${memberId}/scope`, { scope }),
  revokeTeamMember: (slug: string, memberId: string) =>
    del<{ status: string }>(`/api/institutions/${slug}/team/${memberId}`),
  myInvitations: () => get<Invitation[]>("/api/me/invitations"),
  respondToInvite: (claimId: string, accept: boolean) =>
    post<{ accepted: boolean }>(`/api/claims/${claimId}/respond`, { accept }),

  // Request-a-new-institution (Creator plan §4.1.1): kinds from the server
  // catalog; a steward creates + verifies the org on approve.
  institutionKinds: () => get<InstitutionKind[]>("/api/institution-kinds"),
  requestInstitution: (body: { name: string; kind: string; seat: string; role?: string; note?: string }) =>
    post<{ id: string }>("/api/institution-requests", body),
  myInstitutionRequests: () => get<InstitutionRequest[]>("/api/me/institution-requests"),

  // Paid promotions: self-serve featured placements via Paystack (GH₵10/day).
  promoteListing: (id: string, days: number) =>
    post<{ authorizationUrl: string; reference: string; simulated: boolean }>(`/api/listings/${id}/promote`, { days }),
  confirmPromotion: (reference: string) => get<Promotion>(`/api/promotions/confirm?reference=${encodeURIComponent(reference)}`),

  // Business Supporter subscription (GH₵50/mo, stacking renewals).
  plans: () => get<Plan[]>("/api/plans"),
  subscribe: (slug: string, plan?: string) =>
    post<{ authorizationUrl: string; reference: string; simulated: boolean }>(`/api/businesses/${slug}/subscribe`, plan ? { plan } : {}),
  confirmSubscription: (reference: string) => get<Subscription>(`/api/subscriptions/confirm?reference=${encodeURIComponent(reference)}`),
  mySubscriptions: () => get<Subscription[]>("/api/me/subscriptions"),

  // Tickets the member has bought (gate codes live on the portal).
  myTickets: () => get<Ticket[]>("/api/me/tickets"),

  notifications: () => get<NotificationItem[]>("/api/notifications"),
  markAllNotificationsRead: () => post<{ status: string }>("/api/notifications/read-all", {}),
  markNotificationRead: (id: string) => post<{ status: string }>(`/api/notifications/${id}/read`, {}),
};
