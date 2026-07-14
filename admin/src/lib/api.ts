import type { Listing, Member, Organization, Stats, ModerationRecord, OrgClaim, NewsArticle, NotificationItem, MemberView, InstitutionView, Report, MediaAsset, ProfileSection, Pledge, PledgeTotals, Ticket, Subscription, Promotion, RevenueOverview, Incident } from "./types";

export interface NewsPayload { title: string; summary: string; body: string; coverColor: string; coverImageUrl: string; tags: string[] }

const BASE = import.meta.env.VITE_API_URL ?? "";
const TOKEN_KEY = "oguaa.admin.token";

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

export const api = {
  stats: () => get<Stats>("/api/stats"),
  queue: () => get<Listing[]>("/api/admin/queue"),
  listings: () => get<Listing[]>("/api/admin/listings"),
  audit: () => get<ModerationRecord[]>("/api/admin/audit"),
  members: () => get<Member[]>("/api/members"),
  institutions: (kind?: string) => get<Organization[]>(`/api/institutions${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`),

  // Detail views reuse the public read endpoints (rich, ready-made views).
  member: (slug: string) => get<MemberView>(`/api/members/${slug}`),
  institution: (slug: string) => get<InstitutionView>(`/api/institutions/${slug}`),
  // No single-listing admin endpoint; the detail loader finds it in queue+listings.

  moderate: (body: { listingId: string; action: string; reason?: string }) =>
    post<{ status: string }>("/api/admin/moderate", body),
  unpublish: (id: string) => post<{ status: string }>(`/api/admin/listings/${id}/unpublish`),
  feature: (id: string, featured: boolean, days = 0) => post<{ featured: boolean; featuredUntil: string }>(`/api/admin/listings/${id}/feature`, { featured, days }),
  setRole: (id: string, role: string) => post<{ status: string }>(`/api/admin/members/${id}/role`, { role }),
  invite: (body: { identifier: string; displayName: string; role: string }) => post<Member>("/api/admin/members/invite", body),
  notifications: () => get<NotificationItem[]>("/api/notifications"),
  markAllNotificationsRead: () => post<{ status: string }>("/api/notifications/read-all", {}),
  markNotificationRead: (id: string) => post<{ status: string }>(`/api/notifications/${id}/read`, {}),

  // Notice-and-takedown triage (spec §14.3/§14.4/§14.7).
  // Adopt-a-project oversight (amounts in pesewas).
  projects: () => get<Listing[]>("/api/projects"),
  pledges: () => get<Pledge[]>("/api/admin/pledges"),
  pledgeTotals: () => get<PledgeTotals>("/api/admin/pledges/totals"),

  // Event ticketing (Phase 6): per-event sales ledger + gate check-in.
  eventTickets: (slug: string) => get<Ticket[]>(`/api/admin/events/${slug}/tickets`),
  checkIn: (code: string) => post<Ticket>(`/api/admin/tickets/${encodeURIComponent(code)}/checkin`),

  // Business subscriptions (Phase 7): the Supporter ledger.
  subscriptions: () => get<Subscription[]>("/api/admin/subscriptions"),

  // Paid promotions + platform income overview (Phase 8).
  promotions: () => get<Promotion[]>("/api/admin/promotions"),
  revenue: () => get<RevenueOverview>("/api/admin/revenue"),

  reports: () => get<Report[]>("/api/admin/reports"),
  resolveReport: (id: string, status: "actioned" | "dismissed", resolution?: string) =>
    post<{ status: string }>(`/api/admin/reports/${id}/resolve`, { status, resolution }),

  // Community safety triage (auto-published; curators transition the lifecycle).
  incidents: () => get<Incident[]>("/api/incidents"),
  transitionIncident: (id: string, status: string, note?: string) =>
    post<{ status: string }>(`/api/admin/incidents/${id}/status`, { status, note }),
  suspend: (id: string, suspended: boolean) => post<{ suspended: boolean }>(`/api/admin/members/${id}/suspend`, { suspended }),
  verify: (id: string, verified: boolean) => post<{ verified: boolean }>(`/api/admin/institutions/${id}/verify`, { verified }),

  // Create a new institution/place (steward only). Returns the new org (with its
  // minted slug) so the caller can jump to its configure editor.
  createInstitution: (body: { name: string; kind?: string; classification?: string; summary?: string }) =>
    post<Organization>("/api/admin/institutions", body),

  // Configure an institution's official page (summary/history, gallery, sections).
  // Stewards may edit any org — including heritage/visitor sites — via these
  // manager endpoints (full-replace for gallery/sections). See Institution-Pages-Spec.
  updateOrgProfile: (slug: string, body: { summary?: string; history?: string; motto?: string; crestUrl?: string; contact?: { label: string; url: string }[] }) =>
    post<Organization>(`/api/institutions/${slug}/profile`, body),
  setOrgGallery: (slug: string, gallery: MediaAsset[]) =>
    post<Organization>(`/api/institutions/${slug}/gallery`, { gallery }),
  setOrgSections: (slug: string, sections: ProfileSection[]) =>
    post<Organization>(`/api/institutions/${slug}/sections`, { sections }),

  // Steward-only: fan out yearly remembrance notices (spec §8.11). Optional
  // "MM-DD" date overrides today (for back-fills / testing).
  runRemembrance: (date?: string) =>
    post<{ created: number }>(`/api/admin/run-remembrance${date ? `?date=${encodeURIComponent(date)}` : ""}`),

  // Steward-only: institution-management claims (spec §8.13).
  claims: () => get<OrgClaim[]>("/api/admin/claims"),
  reviewClaim: (id: string, approve: boolean) =>
    post<{ approved: boolean }>(`/api/admin/claims/${id}/review`, { approve }),

  // Newsroom / editorial (spec §8.12).
  news: () => get<NewsArticle[]>("/api/admin/news"),
  newsGet: (id: string) => get<NewsArticle>(`/api/admin/news/${id}`),
  newsCreate: (body: NewsPayload) => post<NewsArticle>("/api/admin/news", body),
  newsUpdate: (id: string, body: NewsPayload) => post<NewsArticle>(`/api/admin/news/${id}`, body),
  newsPublish: (id: string, publish: boolean) => post<{ published: boolean }>(`/api/admin/news/${id}/publish`, { publish }),
  newsDelete: (id: string) => del<{ status: string }>(`/api/admin/news/${id}`),

  ai: (body: { action: string; text?: string; language?: string; prompt?: string }) =>
    post<{ result: string; remaining: number; simulated?: boolean }>("/api/ai", body),

  requestOtp: (identifier: string) =>
    post<{ sent: boolean; devCode?: string }>("/api/auth/request-otp", { identifier }),
  verifyOtp: (identifier: string, code: string) =>
    post<{ token: string; member: Member }>("/api/auth/verify-otp", { identifier, code }),
  me: () => get<Member>("/api/auth/me"),

  // Your own account.
  updateProfile: (body: { displayName: string; bio?: string }) => post<Member>("/api/me/profile", body),
  setPhoto: (photoUrl: string) => post<{ photoUrl: string }>("/api/me/photo", { photoUrl }),
};
