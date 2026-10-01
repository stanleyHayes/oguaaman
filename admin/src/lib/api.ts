import type { Listing, Member, Organization, Stats, ModerationRecord, OrgClaim, NewsArticle, NotificationItem, MemberView, InstitutionView, Report, MediaAsset, ProfileSection, Pledge, PledgeTotals, Ticket, Subscription, Promotion, RevenueOverview, Incident, Plan, Directive, DirectiveSeverity, DirectiveKind, Goal, GoalCadence, GoalRing, GoalVerdict, CivicBehaviour, CivicBehaviourInput, Paged, Agent, AgentStatus, AgentJob, DisputeResolution, BusinessVerification, CommerceOrder, CommercePromotion, AffiliateProgramme, Affiliate, AffiliateConversion, TeamView, ReportAction, PrivacyRequest, PrivacyRequestStatus, CloudinarySignature } from "./types";

/** Optional server-side pagination for the heavy list endpoints. Passing this
 *  switches the response to the { items, total, page, pageSize, totalPages }
 *  envelope; omitting it keeps the plain-array response (backward compatible). */
export interface PageArgs { page?: number; pageSize?: number }

/** Builds the ?page/?pageSize query (plus any endpoint filters), always
 *  including page so the server returns the paginated envelope. */
function pageQuery(args?: PageArgs, extra?: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  if (extra) for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  const page = args?.page && args.page > 0 ? Math.floor(args.page) : 1;
  p.set("page", String(page));
  if (args?.pageSize && args.pageSize > 0) p.set("pageSize", String(Math.floor(args.pageSize)));
  return p.toString();
}

/** Compose body for an authority directive (staff/admin path adds an issuer). */
export interface DirectivePayload {
  title: string;
  body: string;
  severity: DirectiveSeverity;
  kind: DirectiveKind;
  action?: string;
  area?: string;
  effectiveFrom?: string; // RFC3339; defaults to now server-side when omitted
  effectiveUntil?: string; // RFC3339; omitted = open-ended
  issuedByOrgId?: string; // admin path: choose the issuing authority
  issuedByOrgSlug?: string; // admin path: alternative to issuedByOrgId
}

/** Compose/edit body for a town goal (curator path). `target` is a free-text
 *  metric, `ring` "" means unscoped, and the period bounds are RFC3339. */
export interface GoalInput {
  title: string;
  description: string;
  target: string;
  cadence: GoalCadence;
  periodLabel: string;
  periodStart: string; // RFC3339
  periodEnd: string; // RFC3339
  setAtDurbar: boolean;
  ring: GoalRing;
  featured: boolean;
}

export interface NewsPayload { title: string; summary: string; body: string; coverColor: string; coverImageUrl: string; tags: string[] }
export interface PlanPayload {
  name: string; slug?: string; audience: "any" | "business" | "creator";
  prices: Record<string, number>; interval: "free" | "month"; perks: string[];
  maxListings?: number; includedPromoDays?: number;
  takeRatePercent?: number; maxProducts?: number; maxServices?: number;
  goldBadge?: boolean;
  active: boolean; sortOrder: number;
}

// "" is meaningful here: same-origin /api behind the nginx proxy. On Vercel
// there is no such proxy, so VITE_API_URL must be set in the project env —
// the .env.production file is gitignored and never reaches the Vercel build.
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

/** Machine-readable `error` codes the admin reacts to (API_CHANGES §14). */
export const ERR_MFA_REQUIRED = "mfa_required";
export const ERR_AI_CONSENT_REQUIRED = "ai_consent_required";

/** Window events the API layer raises for session-wide conditions. */
export const EVT_MFA_REQUIRED = "oguaa:mfa-required";
export const EVT_SESSION_EXPIRED = "oguaa:session-expired";

/** An API failure: HTTP status, the server's `error` code/message and body. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly data: unknown;
  constructor(message: string, status: number, code?: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

/** True when a thrown error is the staff two-factor gate (403 mfa_required). */
export function isMfaRequired(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403 && err.code === ERR_MFA_REQUIRED;
}

/** True when a thrown error is a plain role refusal (403 that isn't the 2FA gate). */
export function isForbidden(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403 && err.code !== ERR_MFA_REQUIRED;
}

function emit(name: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(name));
}

/** Turns a non-2xx response into an ApiError, raising the session-wide events:
 *  403 mfa_required routes the staffer to enrolment (K4); a 401 on a request
 *  that carried a token means the session was revoked (password/2FA change,
 *  suspension), so the console signs out. */
async function failure(res: Response, fallback: string, sentToken: boolean): Promise<ApiError> {
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  const code = typeof data.error === "string" ? data.error : undefined;
  const message = data.message ?? code ?? fallback;
  if (res.status === 403 && code === ERR_MFA_REQUIRED) emit(EVT_MFA_REQUIRED);
  if (res.status === 401 && sentToken) emit(EVT_SESSION_EXPIRED);
  return new ApiError(message, res.status, code, data);
}

async function request(path: string, init: RequestInit, fallback: string): Promise<Response> {
  const sentToken = getToken() != null;
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw await failure(res, fallback, sentToken);
  return res;
}

async function get<T>(path: string): Promise<T> {
  // The status rides on the ApiError so loaders can tell a 403 apart from a
  // genuine outage and degrade gracefully instead of hitting the error boundary.
  const res = await request(path, { headers: headers() }, `GET ${path} failed`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const res = await request(path, { method: "POST", headers: headers(true), body: JSON.stringify(body) }, "Request failed");
  return (await res.json().catch(() => ({}))) as T;
}

async function del<T>(path: string): Promise<T> {
  const res = await request(path, { method: "DELETE", headers: headers() }, "Request failed");
  return (await res.json().catch(() => ({}))) as T;
}

/** Fetches a file with the staff Authorization header and returns an object
 *  URL for it (K8: private documents are never public URLs). The caller must
 *  URL.revokeObjectURL it when done. */
async function getBlobUrl(path: string): Promise<{ url: string; type: string }> {
  const res = await request(path, { headers: headers(), cache: "no-store" }, "Couldn't open that document");
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), type: blob.type };
}

// LoginResult — password sign-in either completes (token+member) or, for
// MFA-enrolled accounts, returns a 5-minute challenge for the code step.
export interface LoginResult {
  token?: string;
  member?: Member;
  mfaRequired?: boolean;
  challenge?: string;
}

/** Strips the "data:" field name and at most one following space (SSE), so
 *  real spaces at chunk boundaries survive. */
function sseData(line: string): string {
  const v = line.slice(5);
  return v.startsWith(" ") ? v.slice(1) : v;
}

/** Reads the writing assistant's SSE stream: `chunk` events carry text with
 *  newlines escaped as "\\n"; `done` carries {remaining, simulated}. */
async function readAiEvents(stream: ReadableStream<Uint8Array>, onChunk: (chunk: string) => void) {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let remaining = 0;
  let simulated = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      const lines = frame.split("\n");
      const event = lines.find((l) => l.startsWith("event:"))?.slice(6).trim();
      const data = lines.filter((l) => l.startsWith("data:")).map(sseData).join("\n");
      if (event === "chunk") onChunk(data.replaceAll("\\n", "\n"));
      if (event === "done") {
        const meta = JSON.parse(data) as { remaining?: number; simulated?: boolean };
        remaining = typeof meta.remaining === "number" ? meta.remaining : remaining;
        simulated = Boolean(meta.simulated);
      }
    }
  }
  return { remaining, simulated };
}

export const api = {
	businessVerifications: () => get<BusinessVerification[]>("/api/admin/business-verifications"),
	reviewBusinessVerification: (listingId: string, status: "verified" | "rejected" | "revoked", note: string) => post<BusinessVerification>(`/api/admin/business-verifications/${listingId}/review`, { status, note }),
	commerceOrders: () => get<CommerceOrder[]>("/api/admin/orders"),
	commercePromotions: () => get<CommercePromotion[]>("/api/admin/commerce-promotions"),
	saveCommercePromotion: (body:CommercePromotion) => post<CommercePromotion>("/api/admin/commerce-promotions",body),
	affiliateProgrammes: () => get<AffiliateProgramme[]>("/api/admin/affiliate-programmes"),
	saveAffiliateProgramme: (body:AffiliateProgramme) => post<AffiliateProgramme>("/api/admin/affiliate-programmes",body),
	affiliates: (programmeId:string) => get<Affiliate[]>(`/api/admin/affiliates?programmeId=${encodeURIComponent(programmeId)}`),
	saveAffiliate: (body:Affiliate) => post<Affiliate>("/api/admin/affiliates",body),
	affiliateConversions: () => get<AffiliateConversion[]>("/api/admin/affiliate-conversions"),
	setAffiliateConversionStatus: (id:string,status:string) => post<void>(`/api/admin/affiliate-conversions/${id}/status`,{status}),
  stats: () => get<Stats>("/api/stats"),
  queue: (type?: string) => get<Listing[]>(`/api/admin/queue${type ? `?type=${encodeURIComponent(type)}` : ""}`),
  listings: () => get<Listing[]>("/api/admin/listings"),
  audit: () => get<ModerationRecord[]>("/api/admin/audit"),
  // Staff view of the directory: full stored records (suspension, 2FA, plans).
  // The public /api/members carries only the public projection (K5).
  members: () => get<Member[]>("/api/admin/members"),
  // Steward view: the unfiltered directory (verification queue). The public
  // /api/institutions hides unverified/revoked institutions on purpose.
  institutions: (kind?: string) => {
    const q = kind ? `?kind=${encodeURIComponent(kind)}` : "";
    return get<Organization[]>(`/api/admin/institutions${q}`);
  },

  // Paginated variants — same endpoints/filters as above, but return the
  // { items, total, page, pageSize, totalPages } envelope. Used by the heavy
  // admin lists; the plain-array methods stay for lookups and full-set views.
  queuePaged: (args?: PageArgs & { type?: string }) =>
    get<Paged<Listing>>(`/api/admin/queue?${pageQuery(args, { type: args?.type })}`),
  listingsPaged: (args?: PageArgs) =>
    get<Paged<Listing>>(`/api/admin/listings?${pageQuery(args)}`),
  auditPaged: (args?: PageArgs) =>
    get<Paged<ModerationRecord>>(`/api/admin/audit?${pageQuery(args)}`),
  membersPaged: (args?: PageArgs) =>
    get<Paged<Member>>(`/api/admin/members?${pageQuery(args)}`),
  reportsPaged: (args?: PageArgs) =>
    get<Paged<Report>>(`/api/admin/reports?${pageQuery(args)}`),
  institutionsPaged: (args?: PageArgs & { kind?: string }) =>
    get<Paged<Organization>>(`/api/admin/institutions?${pageQuery(args, { kind: args?.kind })}`),
  // Public institution directory (verified only) — a curator-safe fallback for
  // the steward-only admin directory (e.g. choosing a directive's issuer).
  publicInstitutions: (kind?: string) => {
    const q = kind ? `?kind=${encodeURIComponent(kind)}` : "";
    return get<Organization[]>(`/api/institutions${q}`);
  },

  // Staff member detail: the full record and every listing, ignoring blocks
  // between the staffer and the member (a member can't hide by blocking staff).
  member: (slug: string) => get<MemberView>(`/api/admin/members/${encodeURIComponent(slug)}`),
  // Institution detail reuses the public read endpoint (rich, ready-made view).
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
  checkIn: (eventSlug: string, code: string) =>
    post<Ticket>(`/api/admin/events/${encodeURIComponent(eventSlug)}/tickets/${encodeURIComponent(code)}/checkin`),

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
  // action "remove" takes the content down; "remove_and_suspend" also suspends
  // its author. Both force status "actioned" and need a resolution note.
  resolveReport: (id: string, body: { status: "actioned" | "dismissed"; resolution: string; action?: ReportAction }) =>
    post<{ status: string }>(`/api/admin/reports/${id}/resolve`, body),
  grantKeeperRole: (listingId: string, keeperMemberId: string, reportId?: string) =>
    post<{ status: string }>(`/api/admin/memorials/${listingId}/grant-keeper`, { keeperMemberId, reportId }),

  // Authority directives / advisories (townwide official notices).
  // Public feed — active=true keeps only currently-active; town filters by townId.
  directives: (activeOnly?: boolean, town?: string) => {
    const p = new URLSearchParams();
    if (activeOnly) p.set("active", "true");
    if (town) p.set("town", town);
    const q = p.toString();
    return get<Directive[]>(`/api/directives${q ? `?${q}` : ""}`);
  },
  // Staff console: all statuses (incl. cancelled), sorted most-severe then newest.
  adminDirectives: () => get<Directive[]>("/api/admin/directives"),
  createDirective: (body: DirectivePayload) => post<Directive>("/api/admin/directives", body),
  cancelDirective: (id: string) => post<Directive>(`/api/admin/directives/${id}/cancel`),

  // Town goals — civic accountability. Curators author (create/edit/delete); the
  // separate "accountability" role records the verdict; stewards may do both.
  // The public feed powers the town-facing scoreboard.
  goals: () => get<Goal[]>("/api/goals"),
  adminGoals: () => get<Goal[]>("/api/admin/goals"),
  createGoal: (body: GoalInput) => post<Goal>("/api/admin/goals", body),
  // POST (not PATCH) — the deployed CORS policy allows GET/POST/DELETE only.
  updateGoal: (id: string, body: GoalInput) => post<Goal>(`/api/admin/goals/${id}`, body),
  deleteGoal: (id: string) => del<{ status: string }>(`/api/admin/goals/${id}`),
  // Accountability role only — a 403 surfaces when the caller lacks it.
  reviewGoal: (id: string, body: { status: GoalVerdict; note: string }) =>
    post<Goal>(`/api/admin/goals/${id}/review`, body),

  // Civic pledges — the DO/STOP behaviours curators publish on the /better page.
  // Curators author (create/edit/delete); the public /better page reads them.
  // POST (not PATCH) for updates — the deployed CORS policy allows GET/POST/DELETE
  // only — and the slug is immutable (minted from the title on create).
  civicBehaviours: () => get<CivicBehaviour[]>("/api/admin/civic/behaviours"),
  createCivicBehaviour: (body: CivicBehaviourInput) => post<CivicBehaviour>("/api/admin/civic/behaviours", body),
  updateCivicBehaviour: (slug: string, body: CivicBehaviourInput) => post<CivicBehaviour>(`/api/admin/civic/behaviours/${slug}`, body),
  deleteCivicBehaviour: (slug: string) => del<{ status: string }>(`/api/admin/civic/behaviours/${slug}`),

  // Oguaa Outside — vetted local agents + their escrow-backed jobs. Gated to the
  // vetting officer / steward; a 403 (carrying { status }) surfaces when the
  // caller lacks the role, matching reviewGoal's pattern. Omit `status` for all
  // records; pass "pending" for the review queue.
  adminAgents: (status?: AgentStatus) =>
    get<Agent[]>(`/api/admin/agents${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  verifyAgent: (id: string) => post<Agent>(`/api/admin/agents/${id}/verify`),
  rejectAgent: (id: string, reason: string) => post<Agent>(`/api/admin/agents/${id}/reject`, { reason }),
  suspendAgent: (id: string) => post<Agent>(`/api/admin/agents/${id}/suspend`),
  // Disputed jobs awaiting a release/refund ruling.
  adminDisputes: () => get<AgentJob[]>("/api/admin/disputes"),
  resolveDispute: (id: string, body: DisputeResolution) => post<AgentJob>(`/api/admin/jobs/${id}/resolve`, body),

  // Community safety triage: live incidents plus held reports waiting for a
  // curator (held first). Verifying a held report publishes it and alerts the town.
  incidents: () => get<Incident[]>("/api/admin/incidents"),
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
  institutionTeam: (slug: string) => get<TeamView>(`/api/institutions/${slug}/team`),
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
    signal?: AbortSignal,
  ) => {
    const res = await request("/api/ai/stream", { method: "POST", headers: headers(true), body: JSON.stringify(body), signal }, "The writing assistant couldn't respond");
    // The server answers plain JSON when it can't stream (no flusher in the
    // chain) — a browser response always has a body, so branch on the type.
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/event-stream") || !res.body) {
      const once = (await res.json()) as { result: string; remaining: number; simulated?: boolean };
      onChunk(once.result);
      return { remaining: once.remaining, simulated: Boolean(once.simulated) };
    }
    return readAiEvents(res.body, onChunk);
  },

  login: (identifier: string, password: string) =>
    post<LoginResult>("/api/auth/login", { identifier, password }),
  mfaLogin: (challenge: string, code: string) =>
    post<{ token: string; member: Member }>("/api/auth/mfa", { challenge, code }),
  // Forgot-password flow. The start call always resolves 200 {ok} so account
  // existence never leaks; devCode is only present when AUTH_REQUIRED=false.
  startPasswordReset: (identifier: string) =>
    post<{ ok: boolean; devCode?: string }>("/api/auth/password/reset/start", { identifier }),
  confirmPasswordReset: (identifier: string, code: string, newPassword: string) =>
    post<{ ok: boolean }>("/api/auth/password/reset/confirm", { identifier, code, newPassword }),
  // MFA enrolment (TOTP) — required for staff roles (spec §14).
  mfaSetup: () => post<{ secret: string; otpauthUrl: string; qr: string }>("/api/me/mfa/setup"),
  // Enrolment revokes every earlier session, this one included: store `token`.
  mfaConfirm: (code: string) => post<{ recoveryCodes: string[]; token?: string }>("/api/me/mfa/confirm", { code }),
  me: () => get<Member>("/api/auth/me"),

  // Your own account.
  updateProfile: (body: { displayName: string; bio?: string }) => post<Member>("/api/me/profile", body),
  setPhoto: (photoUrl: string) => post<{ photoUrl: string }>("/api/me/photo", { photoUrl }),
  // Writing-assistant consent (K15): stored server-side, withdrawable.
  setAiConsent: (consent: boolean) => post<{ aiConsent: boolean }>("/api/me/ai-consent", { consent }),

  // Private documents (K8): ID and KYC files are fetched with the staff token
  // into a blob URL, never linked publicly. Accepts "private:<id>" or "<id>".
  privateDocument: (ref: string) =>
    getBlobUrl(`/api/admin/private-uploads/${encodeURIComponent(ref.replace(/^private:/, ""))}`),

  // Data-rights requests (K10, steward): the queue and status transitions.
  privacyRequests: () => get<PrivacyRequest[]>("/api/admin/privacy-requests"),
  updatePrivacyRequest: (id: string, status: PrivacyRequestStatus, note: string) =>
    post<PrivacyRequest>(`/api/admin/privacy-requests/${encodeURIComponent(id)}`, { status, note }),

  // Signed Cloudinary upload parameters (K9); 503 signed_uploads_unavailable
  // means fall back to POST /api/uploads.
  cloudinarySignature: () => post<CloudinarySignature>("/api/uploads/cloudinary-signature", { resourceType: "image" }),
};
