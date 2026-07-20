// Thin client for the Go API. In dev, calls go to relative /api (Vite proxies to
// :8080). In production set VITE_API_URL to the API origin.
import type {
  Listing, Organization, Office, Place, Member, Stats, HomeData, InstitutionView, MemberView, Tribute, Notification, NewsArticle, Connection, SchoolStint, SearchHit, Diaspora, MediaAsset, ProfileSection, Pledge, Ticket, EventView, Incident, IncidentCategory, IncidentSeverity, LostFound, LostFoundKind, LostFoundStatus, FestivalSummary, FestivalView, HistoryView, Subscription, Promotion, Plan, Directive, MapData, CivicData, Goal, Page, PageParams,
  Agent, AgentInput, AgentJob, AgentReview, AgentService, JobInput, MyJobs,
} from "./types";

export type { Page, PageParams } from "./types";

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

// ── Optional pagination (spec: non-breaking envelope) ───────────────────────
// The heavy list endpoints accept optional ?page/?pageSize. When a page arg is
// passed we thread it into the query and the server replies with a Page<T>
// envelope; with no page arg the query is omitted and the server returns the
// plain T[] exactly as before. Each list method below is overloaded to reflect
// that: no arg → T[], { page } → Page<T>. Existing filters are preserved and
// applied server-side BEFORE the page slice, so `total` reflects the filtered set.
function pagePath(base: string, params: URLSearchParams, p?: PageParams): string {
  if (p && Number.isFinite(p.page)) {
    params.set("page", String(p.page));
    if (p.pageSize != null) params.set("pageSize", String(p.pageSize));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

function businesses(): Promise<Listing[]>;
function businesses(p: PageParams): Promise<Page<Listing>>;
function businesses(p?: PageParams): Promise<Listing[] | Page<Listing>> {
  return get<Listing[] | Page<Listing>>(pagePath("/api/businesses", new URLSearchParams(), p));
}

function properties(): Promise<Listing[]>;
function properties(p: PageParams): Promise<Page<Listing>>;
function properties(p?: PageParams): Promise<Listing[] | Page<Listing>> {
  return get<Listing[] | Page<Listing>>(pagePath("/api/properties", new URLSearchParams(), p));
}

function news(): Promise<NewsArticle[]>;
function news(p: PageParams): Promise<Page<NewsArticle>>;
function news(p?: PageParams): Promise<NewsArticle[] | Page<NewsArticle>> {
  return get<NewsArticle[] | Page<NewsArticle>>(pagePath("/api/news", new URLSearchParams(), p));
}

function events(): Promise<Listing[]>;
function events(p: PageParams): Promise<Page<Listing>>;
function events(p?: PageParams): Promise<Listing[] | Page<Listing>> {
  return get<Listing[] | Page<Listing>>(pagePath("/api/events", new URLSearchParams(), p));
}

function schools(): Promise<Organization[]>;
function schools(p: PageParams): Promise<Page<Organization>>;
function schools(p?: PageParams): Promise<Organization[] | Page<Organization>> {
  return get<Organization[] | Page<Organization>>(pagePath("/api/schools", new URLSearchParams(), p));
}

function diaspora(): Promise<Member[]>;
function diaspora(p: PageParams): Promise<Page<Member>>;
function diaspora(p?: PageParams): Promise<Member[] | Page<Member>> {
  return get<Member[] | Page<Member>>(pagePath("/api/diaspora", new URLSearchParams(), p));
}

function members(): Promise<Member[]>;
function members(p: PageParams): Promise<Page<Member>>;
function members(p?: PageParams): Promise<Member[] | Page<Member>> {
  return get<Member[] | Page<Member>>(pagePath("/api/members", new URLSearchParams(), p));
}

type MemoryFilter = { school?: string; town?: string; tag?: string; era?: string };
function memories(filter?: MemoryFilter): Promise<Listing[]>;
function memories(filter: MemoryFilter & PageParams): Promise<Page<Listing>>;
function memories(filter: MemoryFilter & Partial<PageParams> = {}): Promise<Listing[] | Page<Listing>> {
  const params = new URLSearchParams();
  if (filter.school) params.set("school", filter.school);
  if (filter.town) params.set("town", filter.town);
  if (filter.tag) params.set("tag", filter.tag);
  if (filter.era) params.set("era", filter.era);
  const p = filter.page != null ? { page: filter.page, pageSize: filter.pageSize } : undefined;
  return get<Listing[] | Page<Listing>>(pagePath("/api/memories", params, p));
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

  // Building a Better Cape Coast (spec: the civic page, /better) — authored
  // civic behaviours grouped by ring + the civilizations whose habits made them
  // great. Static content; no user writes.
  civic: () => get<CivicData>("/api/civic"),

  // Town goals — collective civic commitments across cadences (annual/durbar →
  // daily), judged achieved/missed by an accountability officer.
  goals: () => get<Goal[]>("/api/goals"),

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
    post<{ authorizationUrl: string; accessCode?: string; reference: string; simulated: boolean }>(`/api/projects/${slug}/pledge`, body),
  confirmPledge: (reference: string) => get<Pledge>(`/api/pledges/confirm?reference=${encodeURIComponent(reference)}`),
  myPledges: () => get<Pledge[]>("/api/me/pledges"),

  // Cross-pillar search (spec §12) and the diaspora register (Phase 2 foundation).
  search: (q: string) => get<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`),
  diaspora,
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

  businesses,
  business: (slug: string) => get<Listing>(`/api/businesses/${slug}`),
  storefront: (handle: string) => get<Listing>(`/api/storefront/${handle}`),

  properties,
  property: (slug: string) => get<Listing>(`/api/properties/${slug}`),

  // Business subscriptions (Phase 7): plans come from the staff-managed catalog.
  plans: () => get<Plan[]>("/api/plans"),
  subscribe: (slug: string, plan?: string) =>
    post<{ authorizationUrl: string; accessCode?: string; reference: string; simulated: boolean }>(`/api/businesses/${slug}/subscribe`, plan ? { plan } : {}),
  confirmSubscription: (reference: string) => get<Subscription>(`/api/subscriptions/confirm?reference=${encodeURIComponent(reference)}`),
  mySubscriptions: () => get<Subscription[]>("/api/me/subscriptions"),

  // Paid promotions (Phase 8): self-serve featured placements via Paystack.
  promoteListing: (id: string, days: number) =>
    post<{ authorizationUrl: string; accessCode?: string; reference: string; simulated: boolean }>(`/api/listings/${id}/promote`, { days }),
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

  // Community directives & advisories — authority-issued alerts (public reads).
  // activeOnly keeps only currently-in-effect notices (server-sorted most-severe
  // first, then newest); pass activeOnly=false for the archive (active + expired).
  directives: (activeOnly = true, town?: string) => {
    const q = new URLSearchParams();
    if (activeOnly) q.set("active", "true");
    if (town) q.set("town", town);
    const qs = q.toString();
    return get<Directive[]>(`/api/directives${qs ? `?${qs}` : ""}`);
  },
  directive: (slug: string) => get<Directive>(`/api/directives/${slug}`),

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

  events,
  // Event detail + ticketing (Phase 6; amounts in pesewas).
  eventView: (slug: string) => get<EventView>(`/api/events/${slug}`),
  buyTicket: (slug: string, body: { tier: string; qty: number }) =>
    post<{ authorizationUrl: string; accessCode?: string; reference: string; simulated: boolean }>(`/api/events/${slug}/tickets`, body),
  confirmTicket: (reference: string) => get<Ticket>(`/api/tickets/confirm?reference=${encodeURIComponent(reference)}`),
  myTickets: () => get<Ticket[]>("/api/me/tickets"),
  // The festival archive — the coast's festivals, edition by edition.
  festivals: () => get<FestivalSummary[]>("/api/festivals"),
  festival: (slug: string) => get<FestivalView>(`/api/festivals/${slug}`),
  // The history hub — the town's timeline plus the living record (heritage sites, people, memories).
  history: () => get<HistoryView>("/api/history"),
  opportunities: () => get<Listing[]>("/api/opportunities"),
  memories,

  // News / editorial (spec §8.12) — markdown bodies, rendered client-side.
  news,
  newsArticle: (slug: string) => get<NewsArticle>(`/api/news/${slug}`),

  // Explore map — one public payload of every geo-tagged entity (points,
  // heritage/festival trails, active directive areas). Clients filter locally.
  mapData: () => get<MapData>("/api/map"),

  places: () => get<Place[]>("/api/places"),
  schools,
  institutions: () => get<Organization[]>("/api/institutions"),
  institution: (slug: string) => get<InstitutionView>(`/api/institutions/${slug}`),

  members,
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
  updateOrgProfile: (slug: string, body: { summary?: string; history?: string; motto?: string; crestUrl?: string; contact?: { label: string; url: string }[]; gesCategory?: string; boardingType?: string; genderPolicy?: string; nhisAccredited?: boolean | null; ghanaPostGPS?: string; momoNumber?: string; latitude?: number | null; longitude?: number | null; quarterTag?: string; asafoTag?: string; verificationArtifacts?: { label: string; url: string }[] }) =>
    post<Organization>(`/api/institutions/${slug}/profile`, body),
  setOrgOffices: (slug: string, offices: Office[]) =>
    post<Organization>(`/api/institutions/${slug}/offices`, { offices }),
  // Manager-editable photo gallery + custom showcase sections (full-replace,
  // mirroring setOrgOffices). See oguaa/Institution-Pages-Spec.md.
  setOrgGallery: (slug: string, gallery: MediaAsset[]) =>
    post<Organization>(`/api/institutions/${slug}/gallery`, { gallery }),
  setOrgSections: (slug: string, sections: ProfileSection[]) =>
    post<Organization>(`/api/institutions/${slug}/sections`, { sections }),
  // Safety-alert push registration.
  pushKey: () => get<{ publicKey: string }>("/api/push/key"),
  pushSubscribe: (body: { platform: string; endpoint?: string; p256dh?: string; auth?: string; expoToken?: string }) =>
    post<{ ok: boolean }>("/api/push/subscribe", body),
  pushUnsubscribe: (body: { id: string }) => post<{ ok: boolean }>("/api/push/unsubscribe", body),
  // Business storefront (Supporter feature): sections + photo/video gallery +
  // a clean shareable handle, saved atomically.
  setStorefront: (id: string, body: { handle?: string; sections?: ProfileSection[]; photos?: MediaAsset[]; videos?: MediaAsset[] }) =>
    post<Listing>(`/api/listings/${id}/storefront`, body),
  postOrgEvent: (slug: string, body: { title: string; details?: Record<string, unknown> }) =>
    post<Listing>(`/api/institutions/${slug}/events`, body),

  // auth (spec §8.1). dateOfBirth gates 18+ self-registration (spec §14.4).
  login: (identifier: string, password: string) =>
    post<LoginResult>("/api/auth/login", { identifier, password }),
  mfaLogin: (challenge: string, code: string) =>
    post<{ token: string; member: Member }>("/api/auth/mfa", { challenge, code }),
  register: (input: { identifier: string; displayName: string; dateOfBirth: string; password: string; creatorTypes?: string[]; creatorPlanIntent?: string }) =>
    post<{ token: string; member: Member }>("/api/auth/register", input),
  startPhoneVerification: () => post<PhoneVerificationResult>("/api/me/phone/verify/start", {}),
  confirmPhoneVerification: (code: string) =>
    post<PhoneVerificationResult>("/api/me/phone/verify/confirm", { code }),
  // MFA enrolment + account data rights (Act 843, spec §14).
  // Authenticated password change — the server re-verifies the current password.
  changePassword: (currentPassword: string, newPassword: string) =>
    post<{ ok: boolean }>("/api/me/password", { currentPassword, newPassword }),
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

  // ── Oguaa Outside — vetted agents, escrowed errand jobs, reviews ──────────
  // Public directory reads plus the member flows behind the "engage at your own
  // risk" marketplace. Money is in pesewas throughout. Funding an escrow reuses
  // the Paystack access-code flow: POST /accept returns a PaymentStart, and the
  // jobs page confirms via GET /jobs/confirm (see completePayment + ?job_ref).
  agents: (filter?: { service?: string; area?: string }) => {
    const q = new URLSearchParams();
    if (filter?.service) q.set("service", filter.service);
    if (filter?.area) q.set("area", filter.area);
    const qs = q.toString();
    return get<Agent[]>(`/api/agents${qs ? `?${qs}` : ""}`);
  },
  agent: (slug: string) => get<Agent>(`/api/agents/${slug}`),
  agentReviews: (slug: string) => get<AgentReview[]>(`/api/agents/${slug}/reviews`),
  agentServices: () => get<AgentService[]>("/api/agent-services"),
  // Member: apply to become an agent, read/update your own agent profile.
  applyAgent: (input: AgentInput) => post<Agent>("/api/agents/apply", input),
  myAgent: () => get<Agent>("/api/me/agent"), // 404 when the member has no profile
  updateAgent: (input: AgentInput) => post<Agent>("/api/me/agent", input),
  // Jobs: client requests → agent quotes → client funds escrow → agent delivers
  // → client completes (release) or disputes; client reviews on completion.
  createJob: (slug: string, input: JobInput) => post<AgentJob>(`/api/agents/${slug}/jobs`, input),
  myJobs: () => get<MyJobs>("/api/me/jobs"),
  job: (id: string) => get<AgentJob>(`/api/jobs/${id}`),
  quoteJob: (id: string, body: { amountPesewas: number; note: string }) =>
    post<AgentJob>(`/api/jobs/${id}/quote`, body),
  // Client funds the escrow — mirrors the pledge/ticket Start* payment shape.
  acceptJob: (id: string, body: { email: string }) =>
    post<{ authorizationUrl: string; accessCode?: string; reference: string; simulated: boolean }>(`/api/jobs/${id}/accept`, body),
  confirmJob: (reference: string) => get<AgentJob>(`/api/jobs/confirm?reference=${encodeURIComponent(reference)}`),
  deliverJob: (id: string) => post<AgentJob>(`/api/jobs/${id}/deliver`, {}),
  completeJob: (id: string) => post<AgentJob>(`/api/jobs/${id}/complete`, {}),
  disputeJob: (id: string, body: { reason: string }) => post<AgentJob>(`/api/jobs/${id}/dispute`, body),
  cancelJob: (id: string) => post<AgentJob>(`/api/jobs/${id}/cancel`, {}),
  reviewJob: (id: string, body: { rating: number; body: string }) =>
    post<AgentReview>(`/api/jobs/${id}/review`, body),

  queue: () => get<Listing[]>("/api/admin/queue"),
  moderate: (body: { listingId: string; action: string; reason?: string }) =>
    post<{ status: string }>("/api/admin/moderate", body),

  submit: (body: { type: string; title: string; tags?: string[]; townId?: string; coverImageUrl?: string; details?: Record<string, unknown> }) =>
    post<Listing>("/api/listings", body),

  // submitListing is submit + an optional exact pin ("claim your spot on the
  // map"). The backend stores latitude/longitude on the listing and the town
  // map (GET /api/map) surfaces located business/event pins once approved.
  submitListing: (body: { type: string; title: string; tags?: string[]; townId?: string; coverImageUrl?: string; latitude?: number; longitude?: number; details?: Record<string, unknown> }) =>
    post<Listing>("/api/listings", body),

  // Newsroom (curator/editor) — used by the AI-assisted Compose page (spec §8.12).
  createNews: (body: { title: string; summary?: string; body: string; coverColor?: string; coverImageUrl?: string; tags?: string[] }) =>
    post<NewsArticle>("/api/admin/news", body),
  publishNews: (id: string) => post<{ published: boolean }>(`/api/admin/news/${id}/publish`, { publish: true }),

  ai: (body: { action: string; text?: string; language?: string; prompt?: string }) =>
    post<{ result: string; remaining: number; simulated?: boolean }>("/api/ai", body),
  aiStream: async (
    body: { action: string; text?: string; language?: string; prompt?: string },
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
  ) => {
    const res = await fetch(`${BASE}/api/ai/stream`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify(body),
      signal,
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
};
