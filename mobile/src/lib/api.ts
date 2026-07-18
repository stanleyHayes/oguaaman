import type { Listing, HomeData, Member, MemberView, Tribute, NewsArticle, Connection, Notification, Stats, SchoolStint, SearchHit, InstitutionView, Organization, Incident, Directive, LostFound, FestivalSummary, FestivalView, HistoryView, EventView, Ticket, Subscription, Promotion, SocialLink, MapData, CreatorOverview, CreatorEarnings, Plan, Office, MediaAsset, ProfileSection, TeamView, Invitation, InstitutionKind, InstitutionRequest, CivicData, Goal, Agent, AgentInput, AgentJob, AgentJobInput, AgentReview, AgentService, MyAgentJobs } from "./types";
import { getToken } from "./storage";

// On a simulator/web, localhost reaches the Go API. On a physical device set
// EXPO_PUBLIC_API_URL to your machine's LAN IP, e.g. http://192.168.1.10:8080
// Trailing slashes are stripped so joining "/path" never yields "//path".
export const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");

/**
 * Seed/upload URLs arrive root-relative ("/uploads/..."). Web works because
 * nginx proxies /uploads to the API, but on native a relative URI silently
 * fails — prefix the API origin so covers/crests resolve everywhere.
 */
export function mediaUrl(src?: string): string | undefined {
  if (!src) return undefined;
  if (/^https?:\/\//i.test(src) || src.startsWith("data:")) return src;
  const path = src.startsWith("/") ? src : `/${src}`;
  return `${API_BASE}${path}`;
}

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

export interface PhoneVerificationResult {
  member: Member;
  code?: string;
  expiresAt?: string;
  verified: boolean;
}

/**
 * A page of a list endpoint. Returned ONLY when a `page` is requested; without
 * one the same endpoints keep returning a plain `T[]` (the backend's mandatory
 * backward-compat rule), so the paged methods below are overloaded — call with
 * no args for the full array, or `{ page }` for this envelope.
 */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Optional pagination controls for the list endpoints that support them. */
export interface PageOpts {
  /** 1-based page index. Omit for the full (unpaginated) array. */
  page?: number;
  /** Items per page (server default 24, floor 1, cap 100). */
  pageSize?: number;
}

/**
 * Append ?page/?pageSize to a list path when a page is requested — a no-op when
 * `page` is absent, so the caller still hits the plain-array form. Query is
 * hand-built (no URLSearchParams) to match the rest of this module and stay
 * safe on Hermes. `base` may already carry filters (a leading `?…`).
 */
function pagePath(base: string, opts?: PageOpts): string {
  if (!opts?.page) return base;
  const parts = [`page=${Math.max(1, Math.floor(opts.page))}`];
  if (opts.pageSize != null) parts.push(`pageSize=${Math.max(1, Math.floor(opts.pageSize))}`);
  return `${base}${base.includes("?") ? "&" : "?"}${parts.join("&")}`;
}

// Overloaded list fetchers: bare call -> plain array (existing consumers keep
// working, untouched); `{ page }` -> the Page<T> envelope for infinite scroll.
function listBusinesses(): Promise<Listing[]>;
function listBusinesses(opts: PageOpts): Promise<Page<Listing>>;
function listBusinesses(opts?: PageOpts): Promise<Listing[] | Page<Listing>> {
  return get<Listing[] | Page<Listing>>(pagePath("/api/businesses", opts));
}

function listEvents(): Promise<Listing[]>;
function listEvents(opts: PageOpts): Promise<Page<Listing>>;
function listEvents(opts?: PageOpts): Promise<Listing[] | Page<Listing>> {
  return get<Listing[] | Page<Listing>>(pagePath("/api/events", opts));
}

function listMemories(): Promise<Listing[]>;
function listMemories(opts: PageOpts): Promise<Page<Listing>>;
function listMemories(opts?: PageOpts): Promise<Listing[] | Page<Listing>> {
  return get<Listing[] | Page<Listing>>(pagePath("/api/memories", opts));
}

function listNews(): Promise<NewsArticle[]>;
function listNews(opts: PageOpts): Promise<Page<NewsArticle>>;
function listNews(opts?: PageOpts): Promise<NewsArticle[] | Page<NewsArticle>> {
  return get<NewsArticle[] | Page<NewsArticle>>(pagePath("/api/news", opts));
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
    post<{ authorizationUrl: string; accessCode?: string; reference: string; simulated: boolean; provider?: "paystack" | "stripe" }>(`/api/projects/${slug}/pledge`, body),
  confirmPledge: (reference: string) =>
    get<{ status: string; amountPesewas: number; projectTitle: string; simulated?: boolean }>(`/api/pledges/confirm?reference=${encodeURIComponent(reference)}`),

  // Stripe PaymentSheet support (alternative to Paystack hosted checkout).
  stripeIntent: (body: { reference: string; amountPesewas: number; currency?: string; flow: "pledge" | "ticket" | "subscription" | "promotion"; metadata?: Record<string, string> }) =>
    post<{ clientSecret: string; reference: string; paymentIntentId: string }>("/api/payments/stripe/intent", body),
  confirmStripe: (reference: string) =>
    post<{ status: string; reference: string }>(`/api/payments/stripe/confirm?reference=${encodeURIComponent(reference)}`, {}),

  // Cross-pillar search (spec §12).
  search: (q: string) => get<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`),

  // Notice-and-takedown: any visitor can report a listing (spec §14).
  reportListing: (id: string, body: { reason: string; detail?: string }) =>
    post<{ reported: boolean; id: string }>(`/api/listings/${id}/report`, body),

  // Diaspora register opt-in (spec §4/§5/§15, Phase 2 foundation).
  setDiaspora: (body: { abroad: boolean; city?: string; country?: string }) =>
    post<{ diaspora: { abroad: boolean; city?: string; country?: string } | null }>("/api/me/diaspora", body),
  // The public register — members who opted in as living away from Oguaa.
  diaspora: () => get<Member[]>("/api/diaspora"),

  // Oguaa Outside — public vetted-agent discovery and the authenticated
  // request → quote → escrow → delivery lifecycle. All money is in pesewas.
  agents: (filter?: { service?: string; area?: string }) => {
    const parts: string[] = [];
    if (filter?.service) parts.push(`service=${encodeURIComponent(filter.service)}`);
    if (filter?.area) parts.push(`area=${encodeURIComponent(filter.area)}`);
    return get<Agent[]>(`/api/agents${parts.length ? `?${parts.join("&")}` : ""}`);
  },
  agent: (slug: string) => get<Agent>(`/api/agents/${slug}`),
  agentServices: () => get<AgentService[]>("/api/agent-services"),
  agentReviews: (slug: string) => get<AgentReview[]>(`/api/agents/${slug}/reviews`),
  applyAgent: (body: AgentInput) => post<Agent>("/api/agents/apply", body),
  myAgent: () => get<Agent>("/api/me/agent"),
  updateAgent: (body: AgentInput) => post<Agent>("/api/me/agent", body),
  requestAgentJob: (slug: string, body: AgentJobInput) => post<AgentJob>(`/api/agents/${slug}/jobs`, body),
  myAgentJobs: () => get<MyAgentJobs>("/api/me/jobs"),
  quoteAgentJob: (id: string, body: { amountPesewas: number; note: string }) => post<AgentJob>(`/api/jobs/${id}/quote`, body),
  fundAgentJob: (id: string, email: string) =>
    post<{ authorizationUrl: string; accessCode?: string; reference: string; simulated: boolean }>(`/api/jobs/${id}/accept`, { email }),
  confirmAgentJob: (reference: string) => get<AgentJob>(`/api/jobs/confirm?reference=${encodeURIComponent(reference)}`),
  deliverAgentJob: (id: string) => post<AgentJob>(`/api/jobs/${id}/deliver`),
  completeAgentJob: (id: string) => post<AgentJob>(`/api/jobs/${id}/complete`),
  disputeAgentJob: (id: string, reason: string) => post<AgentJob>(`/api/jobs/${id}/dispute`, { reason }),
  cancelAgentJob: (id: string) => post<AgentJob>(`/api/jobs/${id}/cancel`),
  reviewAgentJob: (id: string, rating: number, body: string) => post<AgentReview>(`/api/jobs/${id}/review`, { rating, body }),

  // Profile photo — uploaded to Cloudinary on the device; we store the URL.
  setPhoto: (photoUrl: string) => post<{ photoUrl: string }>("/api/me/photo", { photoUrl }),
  // Display name + bio setter (returns the updated member).
  setProfile: (body: { displayName: string; bio: string }) => post<Member>("/api/me/profile", body),
  // Off-platform links; URLs are sanitised server-side (javascript:/data: dropped).
  setLinks: (links: SocialLink[]) => post<{ links: SocialLink[] }>("/api/me/links", { links }),
  // Creator kinds (adds/replaces the whole set; "writer" unlocks the newsroom).
  setCreatorTypes: (creatorTypes: string[]) => post<Member>("/api/me/creator-types", { creatorTypes }),

  // Browse categories + detail reads.
  people: () => get<Listing[]>("/api/people"),
  person: (slug: string) => get<Listing>(`/api/people/${slug}`),
  // Paged list endpoints (see the overloaded fetchers above): `api.businesses()`
  // still returns the plain array; `api.businesses({ page, pageSize })` the Page.
  businesses: listBusinesses,
  business: (slug: string) => get<Listing>(`/api/businesses/${slug}`),
  properties: () => get<Listing[]>("/api/properties"),
  property: (slug: string) => get<Listing>(`/api/properties/${slug}`),
  events: listEvents,
  opportunities: () => get<Listing[]>("/api/opportunities"),
  memories: listMemories,
  featured: () => get<Listing[]>("/api/featured"),
  genres: () => get<string[]>("/api/genres"),
  musicLegacy: () => get<Listing[]>("/api/music/legacy"),

  // Institutions — official profiles (spec §8.13): core + gallery + custom sections.
  institutions: () => get<Organization[]>("/api/institutions"),
  institution: (slug: string) => get<InstitutionView>(`/api/institutions/${slug}`),
  claimInstitution: (slug: string, body: { requestedRole: string; note?: string }) =>
    post<{ id: string; status: string }>(`/api/institutions/${slug}/claim`, body),

  // ── Creator Studio (Phase 2 mobile parity) ──
  // These mirror creator/src/lib/api.ts EXACTLY (same paths + bodies) so the
  // studio screens reuse the web creator app's backend contract unchanged.

  // Owner-scoped dashboard aggregation + earnings (Creator Platform plan §4).
  creatorOverview: () => get<CreatorOverview>("/api/creator/overview"),
  creatorEarnings: () => get<CreatorEarnings>("/api/creator/earnings"),

  // Owner listing editor: full-replace title/cover/whitelisted details.
  // Approved listings stay live; non-live ones re-queue for review.
  updateListing: (id: string, body: { title: string; coverImageUrl?: string; details: Record<string, unknown> }) =>
    post<Listing>(`/api/listings/${id}/edit`, body),

  // Institutions the member manages (claim → steward-verify → manage, spec §8.13).
  myInstitutions: () => get<Organization[]>("/api/me/institutions"),
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
  // email/phone + office; invitees accept without steward review. Mirrors
  // creator/src/lib/api.ts exactly (same paths + bodies).
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

  // Subscription plans catalog (Creator plan §5).
  plans: () => get<Plan[]>("/api/plans"),

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

  // News / editorial (spec §8.12) — markdown bodies. Paged: `api.news({ page })`.
  news: listNews,
  newsArticle: (slug: string) => get<NewsArticle>(`/api/news/${slug}`),
  // Author a story (writers → draft in the review queue; verified-authority
  // managers → auto-published). Body is Markdown; title 3–160 chars.
  submitNews: (body: { title: string; summary?: string; body: string; coverColor?: string; coverImageUrl?: string; tags?: string[] }) =>
    post<NewsArticle>("/api/news", body),

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

  // Directives — public safety notices from authority institutions. `activeOnly`
  // keeps only currently-active ones (server-filtered, sorted most-severe first);
  // pass false for the full non-cancelled set (active + computed-expired). `town`
  // is an exact townId match (seeded directives use "oguaa").
  directives: (activeOnly = true, town?: string) => {
    const params: string[] = [];
    if (activeOnly) params.push("active=true");
    if (town) params.push(`town=${encodeURIComponent(town)}`);
    const query = params.length ? `?${params.join("&")}` : "";
    return get<Directive[]>(`/api/directives${query}`);
  },
  directive: (slug: string) => get<Directive>(`/api/directives/${slug}`),

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

  // Build a better Oguaa — the civic hub: the town's code of behaviours (by
  // ring of life) plus the civilizations whose civic habits made them great.
  // Static authored content; public (no auth). The pledge is device-local.
  civic: () => get<CivicData>("/api/civic"),
  goals: () => get<Goal[]>("/api/goals"),

  // The map / Explore feed — every coordinate-bearing entity across the pillars,
  // plus heritage/festival trails and active geo-directives. Public; the client
  // filters layers locally (see app/explore.tsx).
  mapData: () => get<MapData>("/api/map"),

  // Event detail + Paystack tickets (amounts in pesewas).
  eventView: (slug: string) => get<EventView>(`/api/events/${slug}`),
  buyTicket: (slug: string, body: { tier: string; qty: number }) =>
    post<{ authorizationUrl: string; accessCode?: string; reference: string; simulated?: boolean; provider?: "paystack" | "stripe" }>(`/api/events/${slug}/tickets`, body),
  confirmTicket: (reference: string) =>
    get<Ticket>(`/api/tickets/confirm?reference=${encodeURIComponent(reference)}`),
  myTickets: () => get<Ticket[]>("/api/me/tickets"),

  // Business Supporter subscriptions (owner-only; GH₵ 50/month). `plan` selects a
  // catalog plan slug (Creator plan §5); omit for the default Supporter plan.
  subscribe: (slug: string, plan?: string) =>
    post<{ authorizationUrl: string; accessCode?: string; reference: string; simulated?: boolean; provider?: "paystack" | "stripe" }>(`/api/businesses/${slug}/subscribe`, plan ? { plan } : {}),
  confirmSubscription: (reference: string) =>
    get<Subscription>(`/api/subscriptions/confirm?reference=${encodeURIComponent(reference)}`),
  mySubscriptions: () => get<Subscription[]>("/api/me/subscriptions"),

  // Paid featured placement on an owned listing (GH₵ 10/day).
  promoteListing: (id: string, days: number) =>
    post<{ authorizationUrl: string; accessCode?: string; reference: string; simulated?: boolean; provider?: "paystack" | "stripe" }>(`/api/listings/${id}/promote`, { days }),
  confirmPromotion: (reference: string) =>
    get<Promotion>(`/api/promotions/confirm?reference=${encodeURIComponent(reference)}`),

  // View counter (spec §4 / Creator §7.5): daily-deduped, fire-and-forget.
  recordView: (id: string) => post<{ new: boolean }>(`/api/listings/${id}/view`, {}),

  stats: () => get<Stats>("/api/stats"),

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

  // ── Settings: security (spec §14) — mirrors the web creator/admin signatures. ──
  // Authenticated password change — the server re-verifies the current password
  // (bcrypt) and enforces the 8-char floor; the existing session stays valid.
  changePassword: (currentPassword: string, newPassword: string) =>
    post<{ ok: boolean }>("/api/me/password", { currentPassword, newPassword }),
  // Two-factor (TOTP) self-enrolment. The secret and recovery-code hashes never
  // leave the server; enrolment returns the QR (a data-URI PNG, rendered inline)
  // plus the otpauth:// URL (deep-linkable to an authenticator app) and codes.
  mfaSetup: () => post<{ secret: string; otpauthUrl: string; qr: string }>("/api/me/mfa/setup"),
  mfaConfirm: (code: string) => post<{ recoveryCodes: string[] }>("/api/me/mfa/confirm", { code }),
  mfaDisable: (code: string) => post<{ ok: boolean }>("/api/me/mfa/disable", { code }),

  me: () => get<Member>("/api/auth/me"),
};

/**
 * Client-side gate for the newsroom compose flow: a member may post news if they
 * are a "writer" creator, or a verified authority manager (verified, with an org
 * name — not the role badges). The server is the final authority (403 otherwise).
 */
export function canWriteNews(m: Member | null | undefined): boolean {
  if (!m) return false;
  if (m.creatorTypes?.includes("writer")) return true;
  return !!m.verified && !!m.verifiedAs && m.verifiedAs !== "Curator" && m.verifiedAs !== "Steward";
}

/**
 * Client-side gate for the Creator Studio entry points (Me screen Account area +
 * More tab). A member qualifies if they create something (any creator type) or
 * run a verified-authority institution (verified, with an org name — not a role
 * badge like "Curator"/"Steward"). This is a cheap synchronous check for menus;
 * the studio hub itself does the authoritative check via api.myInstitutions(),
 * which also catches managers of non-authority institutions that hold no creator
 * type. The server remains the final authority (403 on the owner-scoped reads).
 */
export function canUseStudio(m: Member | null | undefined): boolean {
  if (!m) return false;
  if ((m.creatorTypes?.length ?? 0) > 0) return true;
  return !!m.verified && !!m.verifiedAs && m.verifiedAs !== "Curator" && m.verifiedAs !== "Steward";
}
