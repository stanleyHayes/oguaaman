import type { Listing, Member, Organization, Stats, ModerationRecord, OrgClaim, NewsArticle, NotificationItem, MemberView, InstitutionView, Report, MediaAsset, ProfileSection, Pledge, PledgeTotals, Ticket, Subscription, Promotion, RevenueOverview, Incident, Plan, TeamMember } from "./types";

export interface NewsPayload { title: string; summary: string; body: string; coverColor: string; coverImageUrl: string; tags: string[] }
export interface PlanPayload {
  name: string; slug?: string; audience: "any" | "business" | "creator";
  prices: Record<string, number>; interval: "free" | "month"; perks: string[];
  maxListings?: number; includedPromoDays?: number; goldBadge?: boolean;
  active: boolean; sortOrder: number;
}

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

// LoginResult — password sign-in either completes (token+member) or, for
// MFA-enrolled accounts, returns a 5-minute challenge for the code step.
export interface LoginResult {
  token?: string;
  member?: Member;
  mfaRequired?: boolean;
  challenge?: string;
}

export const api = {
  stats: () => get<Stats>("/api/stats"),
  queue: (type?: string) => get<Listing[]>(`/api/admin/queue${type ? `?type=${encodeURIComponent(type)}` : ""}`),
  listings: () => get<Listing[]>("/api/admin/listings"),
  audit: () => get<ModerationRecord[]>("/api/admin/audit"),
  members: () => get<Member[]>("/api/members"),
  // Steward view: the unfiltered directory (verification queue). The public
  // /api/institutions hides unverified/revoked institutions on purpose.
  institutions: (kind?: string) => {
    const q = kind ? `?kind=${encodeURIComponent(kind)}` : "";
    return get<Organization[]>(`/api/admin/institutions${q}`);
  },

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

  // Subscription plans catalog (Creator plan §5): staff CRUD.
  plans: () => get<Plan[]>("/api/admin/plans"),
  planCreate: (body: PlanPayload) => post<Plan>("/api/admin/plans", body),
  planUpdate: (id: string, body: PlanPayload) => post<Plan>(`/api/admin/plans/${id}`, body),
  planDelete: (id: string) => del<{ status: string }>(`/api/admin/plans/${id}`),

  reports: () => get<Report[]>("/api/admin/reports"),
  resolveReport: (id: string, status: "actioned" | "dismissed", resolution?: string) =>
    post<{ status: string }>(`/api/admin/reports/${id}/resolve`, { status, resolution }),
  grantKeeperRole: (listingId: string, keeperMemberId: string, reportId?: string) =>
    post<{ status: string }>(`/api/admin/memorials/${listingId}/grant-keeper`, { keeperMemberId, reportId }),

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
  updateOrgProfile: (slug: string, body: { summary?: string; history?: string; motto?: string; crestUrl?: string; contact?: { label: string; url: string }[]; gesCategory?: string; boardingType?: string; genderPolicy?: string; nhisAccredited?: boolean | null; ghanaPostGPS?: string; momoNumber?: string; latitude?: number | null; longitude?: number | null; quarterTag?: string; asafoTag?: string; verificationArtifacts?: { label: string; url: string }[] }) =>
    post<Organization>(`/api/institutions/${slug}/profile`, body),
  institutionTeam: (slug: string) => get<TeamMember[]>(`/api/institutions/${slug}/team`),
  revokeTeamMember: (slug: string, memberId: string) =>
    del<{ status: string }>(`/api/institutions/${slug}/team/${memberId}`),
  setOrgGallery: (slug: string, gallery: MediaAsset[]) =>
    post<Organization>(`/api/institutions/${slug}/gallery`, { gallery }),
  setOrgSections: (slug: string, sections: ProfileSection[]) =>
    post<Organization>(`/api/institutions/${slug}/sections`, { sections }),

  // Steward-only: fan out yearly remembrance notices (spec §8.11). Optional
  // "MM-DD" date overrides today (for back-fills / testing).
  runRemembrance: (date?: string) => {
    const q = date ? `?date=${encodeURIComponent(date)}` : "";
    return post<{ created: number }>(`/api/admin/run-remembrance${q}`);
  },

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
  aiStream: async (
    body: { action: string; text?: string; language?: string; prompt?: string },
    onChunk: (chunk: string) => void,
  ) => {
    const res = await fetch(`${BASE}/api/ai/stream`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw Object.assign(new Error(`POST /api/ai/stream failed (${res.status})`), { status: res.status });
    if (!res.body) {
      const once = await post<{ result: string; remaining: number; simulated?: boolean }>("/api/ai", body);
      onChunk(once.result);
      return { remaining: once.remaining, simulated: once.simulated };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let remaining = 0;
    let simulated = false;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const frames = buf.split("\n\n");
      buf = frames.pop() ?? "";
      for (const frame of frames) {
        const lines = frame.split("\n");
        const event = lines.find((l) => l.startsWith("event:"))?.slice(6).trim();
        const data = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
        if (event === "chunk") onChunk(data.replaceAll("\\n", "\n"));
        if (event === "done") {
          const meta = JSON.parse(data) as { remaining?: number; simulated?: boolean };
          remaining = typeof meta.remaining === "number" ? meta.remaining : remaining;
          simulated = Boolean(meta.simulated);
        }
      }
    }
    return { remaining, simulated };
  },

  login: (identifier: string, password: string) =>
    post<LoginResult>("/api/auth/login", { identifier, password }),
  mfaLogin: (challenge: string, code: string) =>
    post<{ token: string; member: Member }>("/api/auth/mfa", { challenge, code }),
  // MFA enrolment (TOTP) — required for staff roles (spec §14).
  mfaSetup: () => post<{ secret: string; otpauthUrl: string; qr: string }>("/api/me/mfa/setup"),
  mfaConfirm: (code: string) => post<{ recoveryCodes: string[] }>("/api/me/mfa/confirm", { code }),
  mfaDisable: (code: string) => post<{ ok: boolean }>("/api/me/mfa/disable", { code }),
  me: () => get<Member>("/api/auth/me"),

  // Your own account.
  updateProfile: (body: { displayName: string; bio?: string }) => post<Member>("/api/me/profile", body),
  setPhoto: (photoUrl: string) => post<{ photoUrl: string }>("/api/me/photo", { photoUrl }),
};
