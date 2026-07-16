// Thin client for the Go API. In dev, calls go to relative /api (Vite proxies to
// :8080). In production set VITE_API_URL to the API origin.
import type {
  Listing, Organization, Office, Place, Member, Stats, HomeData, InstitutionView, MemberView, Tribute, Notification, NewsArticle, Connection, SchoolStint, SearchHit, Diaspora, MediaAsset, ProfileSection, Pledge, Ticket, EventView, Incident, IncidentCategory, IncidentSeverity, LostFound, LostFoundKind, LostFoundStatus, FestivalSummary, FestivalView, HistoryView, Subscription, Promotion, Plan,
} from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "";
const TOKEN_KEY = "oguaa.token";

export function getToken(): string | null {
  return typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
}
export function setToken(token: string | null) {
  if (typeof localStorage === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
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
  if (!res.ok) {
    // Throw a plain Error (with .status) so catch handlers can read .message
    // consistently. React Router loaders that want to trigger an error boundary
    // can check err.status and re-throw a Response if needed.
    throw Object.assign(new Error(`Request failed: ${path}`), { status: res.status });
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { message?: string; error?: string }).message
      ?? (data as { error?: string }).error
      ?? "Request failed";
    throw Object.assign(new Error(msg), { status: res.status, data });
  }
  return data as T;
}

async function del<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: headers(body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { message?: string; error?: string }).message
      ?? (data as { error?: string }).error
      ?? "Request failed";
    throw Object.assign(new Error(msg), { status: res.status, data });
  }
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

export interface PhoneVerificationResult {
  member: Member;
  code?: string;
  expiresAt?: string;
  verified: boolean;
}

export const api = {
  home: () => get<HomeData>("/api/home"),
  stats: () => get<Stats>("/api/stats"),

  artists: () => get<Listing[]>("/api/artists"),
  artist: (slug: string) => get<Listing>(`/api/artists/${slug}`),
  genres: () => get<string[]>("/api/genres"),
  musicLegacy: () => get<Listing[]>("/api/music/legacy"),

  people: () => get<Listing[]>("/api/people"),
  person: (slug: string) => get<Listing>(`/api/people/${slug}`),

  // Adopt-a-project + pledges via Paystack (spec §4/§6/§15; amounts in pesewas).
  projects: () => get<Listing[]>("/api/projects"),
  project: (slug: string) => get<Listing>(`/api/projects/${slug}`),
  pledge: (slug: string, body: { amountPesewas: number; email?: string }) =>
    post<{ authorizationUrl: string; reference: string; simulated: boolean }>(`/api/projects/${slug}/pledge`, body),
  confirmPledge: (reference: string) => get<Pledge>(`/api/pledges/confirm?reference=${encodeURIComponent(reference)}`),
  myPledges: () => get<Pledge[]>("/api/me/pledges"),

  // Cross-pillar search (spec §12) and the diaspora register (Phase 2 foundation).
  search: (q: string) => get<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`),
  diaspora: () => get<Member[]>("/api/diaspora"),
  setDiaspora: (body: { abroad: boolean; city?: string; country?: string }) =>
    post<{ diaspora: Diaspora | null }>("/api/me/diaspora", body),

  // Notice-and-takedown: any visitor can report a listing (spec §14.3/§14.4/§14.7).
  reportListing: (id: string, body: { reason: string; detail?: string }) =>
    post<{ reported: boolean; id: string }>(`/api/listings/${id}/report`, body),

  // First-party image upload — returns the stored asset's URL.
  uploadImage: async (file: File): Promise<{ url: string }> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${BASE}/api/uploads`, { method: "POST", headers: headers(), body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error ?? "Upload failed"), { status: res.status });
    return data as { url: string };
  },

  memorials: () => get<Listing[]>("/api/memorials"),
  memorial: (slug: string) => get<Listing>(`/api/memorials/${slug}`),
  lightCandle: (slug: string) => post<{ candles: number }>(`/api/memorials/${slug}/candle`, {}),
  addTribute: (slug: string, body: { authorName: string; message: string }) =>
    post<Tribute>(`/api/memorials/${slug}/tributes`, body),

  // Remembrance follow (spec §8.11) — enrols a member in yearly anniversary notices.
  followState: (slug: string) => get<{ following: boolean }>(`/api/memorials/${slug}/follow`),
  follow: (slug: string) => post<{ following: boolean; remembering: number }>(`/api/memorials/${slug}/follow`, {}),
  unfollow: (slug: string) => del<{ following: boolean; remembering: number }>(`/api/memorials/${slug}/follow`),
  claimKeeperRole: (slug: string, detail: string) =>
    post<{ id: string }>(`/api/memorials/${slug}/keeper-claim`, { detail }),

  // Notifications (spec §8.2 moderation outcomes, §8.11 remembrance).
  notifications: () => get<Notification[]>("/api/notifications"),
  unreadCount: () => get<{ count: number }>("/api/notifications/unread-count"),
  markNotificationRead: (id: string) => post<{ status: string }>(`/api/notifications/${id}/read`, {}),
  markAllNotificationsRead: () => post<{ status: string }>("/api/notifications/read-all", {}),

  // Paid, time-bound featured placements across all types (spec §8.14).
  featured: () => get<Listing[]>("/api/featured"),

  businesses: () => get<Listing[]>("/api/businesses"),
  business: (slug: string) => get<Listing>(`/api/businesses/${slug}`),

  // Business subscriptions (Phase 7): plans come from the staff-managed catalog.
  plans: () => get<Plan[]>("/api/plans"),
  subscribe: (slug: string, plan?: string) =>
    post<{ authorizationUrl: string; reference: string; simulated: boolean }>(`/api/businesses/${slug}/subscribe`, plan ? { plan } : {}),
  confirmSubscription: (reference: string) => get<Subscription>(`/api/subscriptions/confirm?reference=${encodeURIComponent(reference)}`),
  mySubscriptions: () => get<Subscription[]>("/api/me/subscriptions"),

  // Paid promotions (Phase 8): self-serve featured placements via Paystack.
  promoteListing: (id: string, days: number) =>
    post<{ authorizationUrl: string; reference: string; simulated: boolean }>(`/api/listings/${id}/promote`, { days }),
  confirmPromotion: (reference: string) => get<Promotion>(`/api/promotions/confirm?reference=${encodeURIComponent(reference)}`),

  // View counter (spec §4 / Creator §7.5): daily-deduped, fire-and-forget.
  recordView: (id: string) => post<{ new: boolean }>(`/api/listings/${id}/view`, {}),

  // Community safety — rescue & early recovery. Auto-published on submit;
  // curators verify and transition the lifecycle afterwards.
  incidents: (f?: { status?: string; category?: string; town?: string }) => {
    const q = new URLSearchParams();
    if (f?.status) q.set("status", f.status);
    if (f?.category) q.set("category", f.category);
    if (f?.town) q.set("town", f.town);
    const qs = q.toString();
    const suffix = qs ? `?${qs}` : "";
    return get<Incident[]>(`/api/incidents${suffix}`);
  },
  incident: (slug: string) => get<Incident>(`/api/incidents/${slug}`),
  reportIncident: (body: { title: string; category: IncidentCategory; severity: IncidentSeverity; location: string; contact?: string; description?: string }) =>
    post<Incident>("/api/incidents", body),
  transitionIncident: (id: string, status: string, note?: string) =>
    post<{ status: string }>(`/api/admin/incidents/${id}/status`, { status, note }),

  // Lost & found — lost items, found items, missing people. Auto-published on
  // submit; the owner or a curator resolves the notice (reunited / closed).
  lostFoundList: (f?: { kind?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (f?.kind) q.set("kind", f.kind);
    if (f?.status) q.set("status", f.status);
    const qs = q.toString();
    const suffix = qs ? `?${qs}` : "";
    return get<LostFound[]>(`/api/lost-found${suffix}`);
  },
  lostFound: (slug: string) => get<LostFound>(`/api/lost-found/${slug}`),
  createLostFound: (body: { title: string; kind: LostFoundKind; description: string; lastSeenLocation?: string; lastSeenDate?: string; contact: string }) =>
    post<LostFound>("/api/lost-found", body),
  resolveLostFound: (slug: string, status: LostFoundStatus) =>
    post<{ status: string }>(`/api/lost-found/${slug}/resolve`, { status }),

  events: () => get<Listing[]>("/api/events"),
  // Event detail + ticketing (Phase 6; amounts in pesewas).
  eventView: (slug: string) => get<EventView>(`/api/events/${slug}`),
  buyTicket: (slug: string, body: { tier: string; qty: number }) =>
    post<{ authorizationUrl: string; reference: string; simulated: boolean }>(`/api/events/${slug}/tickets`, body),
  confirmTicket: (reference: string) => get<Ticket>(`/api/tickets/confirm?reference=${encodeURIComponent(reference)}`),
  myTickets: () => get<Ticket[]>("/api/me/tickets"),
  // The festival archive — the coast's festivals, edition by edition.
  festivals: () => get<FestivalSummary[]>("/api/festivals"),
  festival: (slug: string) => get<FestivalView>(`/api/festivals/${slug}`),
  // The history hub — the town's timeline plus the living record (heritage sites, people, memories).
  history: () => get<HistoryView>("/api/history"),
  opportunities: () => get<Listing[]>("/api/opportunities"),
  memories: (filter?: { school?: string; town?: string; tag?: string; era?: string }) => {
    const params = new URLSearchParams();
    if (filter?.school) params.set("school", filter.school);
    if (filter?.town) params.set("town", filter.town);
    if (filter?.tag) params.set("tag", filter.tag);
    if (filter?.era) params.set("era", filter.era);
    const qs = params.toString();
    return get<Listing[]>(`/api/memories${qs ? `?${qs}` : ""}`);
  },

  // News / editorial (spec §8.12) — markdown bodies, rendered client-side.
  news: () => get<NewsArticle[]>("/api/news"),
  newsArticle: (slug: string) => get<NewsArticle>(`/api/news/${slug}`),

  places: () => get<Place[]>("/api/places"),
  schools: () => get<Organization[]>("/api/schools"),
  institutions: () => get<Organization[]>("/api/institutions"),
  institution: (slug: string) => get<InstitutionView>(`/api/institutions/${slug}`),

  members: () => get<Member[]>("/api/members"),
  member: (slug: string) => get<MemberView>(`/api/members/${slug}`),

  // Member↔member follows + birthday opt-in (spec §8.11).
  memberFollowState: (slug: string) => get<{ following: boolean }>(`/api/members/${slug}/follow`),
  followMember: (slug: string) => post<{ following: boolean; followers: number }>(`/api/members/${slug}/follow`, {}),
  unfollowMember: (slug: string) => del<{ following: boolean; followers: number }>(`/api/members/${slug}/follow`),
  setBirthday: (body: { birthday: string; broadcast: boolean }) =>
    post<{ birthday: string; broadcastBirthday: boolean }>("/api/me/birthday", body),
  // Profile photo — uploaded to Cloudinary in the browser; we store only the URL.
  setPhoto: (photoUrl: string) => post<{ photoUrl: string }>("/api/me/photo", { photoUrl }),
  setAffiliations: (body: { townId: string; asafoId: string }) =>
    post<{ townId: string; asafoId: string }>("/api/me/affiliations", body),

  // Profile connections — "people you may know" (spec §8.6).
  connections: () => get<Connection[]>("/api/me/connections"),
  setSchooling: (body: { schooling: SchoolStint[] }) =>
    post<{ schooling: SchoolStint[] }>("/api/me/schooling", body),

  // Institution management (spec §8.13): claim → steward-verify → manage.
  myInstitutions: () => get<Organization[]>("/api/me/institutions"),
  claimInstitution: (slug: string, body: { requestedRole: string; note?: string }) =>
    post<{ id: string; status: string }>(`/api/institutions/${slug}/claim`, body),
  updateOrgProfile: (slug: string, body: { summary?: string; history?: string; motto?: string; crestUrl?: string; contact?: { label: string; url: string }[]; gesCategory?: string; boardingType?: string; genderPolicy?: string; nhisAccredited?: boolean | null; ghanaPostGPS?: string; momoNumber?: string }) =>
    post<Organization>(`/api/institutions/${slug}/profile`, body),
  setOrgOffices: (slug: string, offices: Office[]) =>
    post<Organization>(`/api/institutions/${slug}/offices`, { offices }),
  // Manager-editable photo gallery + custom showcase sections (full-replace,
  // mirroring setOrgOffices). See oguaa/Institution-Pages-Spec.md.
  setOrgGallery: (slug: string, gallery: MediaAsset[]) =>
    post<Organization>(`/api/institutions/${slug}/gallery`, { gallery }),
  setOrgSections: (slug: string, sections: ProfileSection[]) =>
    post<Organization>(`/api/institutions/${slug}/sections`, { sections }),
  postOrgEvent: (slug: string, body: { title: string; details?: Record<string, unknown> }) =>
    post<Listing>(`/api/institutions/${slug}/events`, body),

  // auth (spec §8.1). dateOfBirth gates 18+ self-registration (spec §14.4).
  login: (identifier: string, password: string) =>
    post<LoginResult>("/api/auth/login", { identifier, password }),
  mfaLogin: (challenge: string, code: string) =>
    post<{ token: string; member: Member }>("/api/auth/mfa", { challenge, code }),
  register: (input: { identifier: string; displayName: string; dateOfBirth: string; password: string; creatorTypes?: string[] }) =>
    post<{ token: string; member: Member }>("/api/auth/register", input),
  startPhoneVerification: () => post<PhoneVerificationResult>("/api/me/phone/verify/start", {}),
  confirmPhoneVerification: (code: string) =>
    post<PhoneVerificationResult>("/api/me/phone/verify/confirm", { code }),
  // MFA enrolment + account data rights (Act 843, spec §14).
  mfaSetup: () => post<{ secret: string; otpauthUrl: string; qr: string }>("/api/me/mfa/setup", {}),
  mfaConfirm: (code: string) => post<{ recoveryCodes: string[] }>("/api/me/mfa/confirm", { code }),
  mfaDisable: (code: string) => post<{ ok: boolean }>("/api/me/mfa/disable", { code }),
  exportData: async (): Promise<Blob> => {
    const res = await fetch(`${BASE}/api/me/export`, { headers: headers() });
    if (!res.ok) throw Object.assign(new Error("Couldn't export your data — try again."), { status: res.status });
    return res.blob();
  },
  deleteAccount: (password: string) => del<{ ok: boolean }>("/api/me", { password }),
  me: () => get<Member>("/api/auth/me"),

  queue: () => get<Listing[]>("/api/admin/queue"),
  moderate: (body: { listingId: string; action: string; reason?: string }) =>
    post<{ status: string }>("/api/admin/moderate", body),

  submit: (body: { type: string; title: string; tags?: string[]; townId?: string; coverImageUrl?: string; details?: Record<string, unknown> }) =>
    post<Listing>("/api/listings", body),

  // Newsroom (curator/editor) — used by the AI-assisted Compose page (spec §8.12).
  createNews: (body: { title: string; summary?: string; body: string; coverColor?: string; coverImageUrl?: string; tags?: string[] }) =>
    post<NewsArticle>("/api/admin/news", body),
  publishNews: (id: string) => post<{ published: boolean }>(`/api/admin/news/${id}/publish`, { publish: true }),

  ai: (body: { action: string; text?: string; language?: string; prompt?: string }) =>
    post<{ result: string; remaining: number; simulated?: boolean }>("/api/ai", body),
};
