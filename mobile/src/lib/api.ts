import type { Listing, HomeData, Member, MemberView, Tribute, NewsArticle, Connection, Notification, Stats, SchoolStint, SearchHit, InstitutionView, Organization, Incident, LostFound, FestivalSummary, FestivalView, HistoryView, EventView, Ticket, Subscription, Promotion } from "./types";
import { getToken } from "./storage";

// On a simulator/web, localhost reaches the Go API. On a physical device set
// EXPO_PUBLIC_API_URL to your machine's LAN IP, e.g. http://192.168.1.10:8080
export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080";

function authHeaders(json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["content-type"] = "application/json";
  const t = getToken();
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status})`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? `POST ${path} failed (${res.status})`;
    throw Object.assign(new Error(msg), { status: res.status, data });
  }
  return data as T;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE", headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? `DELETE ${path} failed (${res.status})`;
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

export const api = {
  home: () => get<HomeData>("/api/home"),
  artists: () => get<Listing[]>("/api/artists"),
  artist: (slug: string) => get<Listing>(`/api/artists/${slug}`),
  memorials: () => get<Listing[]>("/api/memorials"),
  memorial: (slug: string) => get<Listing>(`/api/memorials/${slug}`),
  lightCandle: (slug: string) => post<{ candles: number }>(`/api/memorials/${slug}/candle`),
  addTribute: (slug: string, body: { authorName: string; message: string }) =>
    post<Tribute>(`/api/memorials/${slug}/tributes`, body),

  // Remembrance follow (spec §8.11) — enrols a member in yearly anniversary notices.
  memorialFollowState: (slug: string) => get<{ following: boolean }>(`/api/memorials/${slug}/follow`),
  followMemorial: (slug: string) => post<{ following: boolean; remembering: number }>(`/api/memorials/${slug}/follow`),
  unfollowMemorial: (slug: string) => del<{ following: boolean; remembering: number }>(`/api/memorials/${slug}/follow`),

  submit: (body: { type: string; title: string; tags?: string[]; coverImageUrl?: string; details?: Record<string, unknown> }) =>
    post<Listing>("/api/listings", body),

  // Adopt-a-project + pledges via Paystack (spec §4/§6/§15; amounts in pesewas).
  projects: () => get<Listing[]>("/api/projects"),
  projectDetail: (slug: string) => get<Listing>(`/api/projects/${slug}`),
  pledge: (slug: string, body: { amountPesewas: number; email?: string }) =>
    post<{ authorizationUrl: string; reference: string; simulated: boolean }>(`/api/projects/${slug}/pledge`, body),
  confirmPledge: (reference: string) =>
    get<{ status: string; amountPesewas: number; projectTitle: string; simulated?: boolean }>(`/api/pledges/confirm?reference=${encodeURIComponent(reference)}`),

  // Cross-pillar search (spec §12).
  search: (q: string) => get<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`),

  // Notice-and-takedown: any visitor can report a listing (spec §14).
  reportListing: (id: string, body: { reason: string; detail?: string }) =>
    post<{ reported: boolean; id: string }>(`/api/listings/${id}/report`, body),

  // Diaspora register opt-in (spec §4/§5/§15, Phase 2 foundation).
  setDiaspora: (body: { abroad: boolean; city?: string; country?: string }) =>
    post<{ diaspora: { abroad: boolean; city?: string; country?: string } | null }>("/api/me/diaspora", body),

  // Profile photo — uploaded to Cloudinary on the device; we store the URL.
  setPhoto: (photoUrl: string) => post<{ photoUrl: string }>("/api/me/photo", { photoUrl }),

  // Browse categories + detail reads.
  people: () => get<Listing[]>("/api/people"),
  person: (slug: string) => get<Listing>(`/api/people/${slug}`),
  businesses: () => get<Listing[]>("/api/businesses"),
  business: (slug: string) => get<Listing>(`/api/businesses/${slug}`),
  events: () => get<Listing[]>("/api/events"),
  opportunities: () => get<Listing[]>("/api/opportunities"),
  memories: () => get<Listing[]>("/api/memories"),
  featured: () => get<Listing[]>("/api/featured"),
  genres: () => get<string[]>("/api/genres"),
  musicLegacy: () => get<Listing[]>("/api/music/legacy"),

  // Institutions — official profiles (spec §8.13): core + gallery + custom sections.
  institutions: () => get<Organization[]>("/api/institutions"),
  institution: (slug: string) => get<InstitutionView>(`/api/institutions/${slug}`),
  claimInstitution: (slug: string, body: { requestedRole: string; note?: string }) =>
    post<{ id: string; status: string }>(`/api/institutions/${slug}/claim`, body),

  // Member profiles + member↔member follows.
  member: (slug: string) => get<MemberView>(`/api/members/${slug}`),
  memberFollowState: (slug: string) => get<{ following: boolean }>(`/api/members/${slug}/follow`),
  followMember: (slug: string) => post<{ following: boolean; followers: number }>(`/api/members/${slug}/follow`),
  unfollowMember: (slug: string) => del<{ following: boolean; followers: number }>(`/api/members/${slug}/follow`),

  // Profile connections — "people you may know" (spec §8.6).
  connections: () => get<Connection[]>("/api/me/connections"),
  setSchooling: (body: { schooling: SchoolStint[] }) => post<{ schooling: SchoolStint[] }>("/api/me/schooling", body),
  setAffiliations: (body: { townId: string; asafoId: string }) =>
    post<{ townId: string; asafoId: string }>("/api/me/affiliations", body),
  setBirthday: (body: { birthday: string; broadcast: boolean }) =>
    post<{ birthday: string; broadcastBirthday: boolean }>("/api/me/birthday", body),

  // News / editorial (spec §8.12) — markdown bodies.
  news: () => get<NewsArticle[]>("/api/news"),
  newsArticle: (slug: string) => get<NewsArticle>(`/api/news/${slug}`),

  // Notifications (spec §8.2, §8.11).
  notifications: () => get<Notification[]>("/api/notifications"),
  unreadCount: () => get<{ count: number }>("/api/notifications/unread-count"),
  markAllNotificationsRead: () => post<{ status: string }>("/api/notifications/read-all"),
  markNotificationRead: (id: string) => post<{ status: string }>(`/api/notifications/${id}/read`),

  // Community safety — incidents (auto-published on submit).
  incidents: (f?: { status?: string; category?: string }) => {
    const qs = f ? Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&") : "";
    const query = qs ? `?${qs}` : "";
    return get<Incident[]>(`/api/incidents${query}`);
  },
  incident: (slug: string) => get<Incident>(`/api/incidents/${slug}`),
  reportIncident: (body: { title: string; category: string; severity: string; location: string; contact?: string; description?: string }) =>
    post<Incident>("/api/incidents", body),

  // Lost & found — lost items, found items, missing people.
  lostFoundList: (f?: { kind?: string; status?: string }) => {
    const qs = f ? Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&") : "";
    const query = qs ? `?${qs}` : "";
    return get<LostFound[]>(`/api/lost-found${query}`);
  },
  lostFound: (slug: string) => get<LostFound>(`/api/lost-found/${slug}`),
  postLostFound: (body: { title: string; kind: string; description: string; lastSeenLocation?: string; lastSeenDate?: string; contact: string }) =>
    post<LostFound>("/api/lost-found", body),
  resolveLostFound: (slug: string, status: string) =>
    post<{ status: string }>(`/api/lost-found/${slug}/resolve`, { status }),

  // The festival archive — the coast's festivals, edition by edition.
  festivals: () => get<FestivalSummary[]>("/api/festivals"),
  festival: (slug: string) => get<FestivalView>(`/api/festivals/${slug}`),

  // The history hub — timeline + heritage sites + people + memories.
  history: () => get<HistoryView>("/api/history"),

  // Event detail + Paystack tickets (amounts in pesewas).
  eventView: (slug: string) => get<EventView>(`/api/events/${slug}`),
  buyTicket: (slug: string, body: { tier: string; qty: number }) =>
    post<{ authorizationUrl: string; reference: string; simulated?: boolean }>(`/api/events/${slug}/tickets`, body),
  confirmTicket: (reference: string) =>
    get<Ticket>(`/api/tickets/confirm?reference=${encodeURIComponent(reference)}`),
  myTickets: () => get<Ticket[]>("/api/me/tickets"),

  // Business Supporter subscriptions (owner-only; GH₵ 50/month).
  subscribe: (slug: string) =>
    post<{ authorizationUrl: string; reference: string; simulated?: boolean }>(`/api/businesses/${slug}/subscribe`, {}),
  confirmSubscription: (reference: string) =>
    get<Subscription>(`/api/subscriptions/confirm?reference=${encodeURIComponent(reference)}`),
  mySubscriptions: () => get<Subscription[]>("/api/me/subscriptions"),

  // Paid featured placement on an owned listing (GH₵ 10/day).
  promoteListing: (id: string, days: number) =>
    post<{ authorizationUrl: string; reference: string; simulated?: boolean }>(`/api/listings/${id}/promote`, { days }),
  confirmPromotion: (reference: string) =>
    get<Promotion>(`/api/promotions/confirm?reference=${encodeURIComponent(reference)}`),

  stats: () => get<Stats>("/api/stats"),

  // auth (spec §8.1). dateOfBirth gates 18+ self-registration (spec §14.4).
  login: (identifier: string, password: string) =>
    post<LoginResult>("/api/auth/login", { identifier, password }),
  mfaLogin: (challenge: string, code: string) =>
    post<{ token: string; member: Member }>("/api/auth/mfa", { challenge, code }),
  register: (input: { identifier: string; displayName: string; dateOfBirth: string; password: string }) =>
    post<{ token: string; member: Member }>("/api/auth/register", input),
  me: () => get<Member>("/api/auth/me"),
};
