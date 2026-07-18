import type { Listing, Member, Organization, Stats, ModerationRecord, OrgClaim, NewsArticle, NotificationItem, MemberView, InstitutionView, Report, MediaAsset, ProfileSection, Pledge, PledgeTotals, Ticket, Subscription, Promotion, RevenueOverview, Incident, Plan, TeamMember, Directive, DirectiveSeverity, DirectiveKind, Goal, GoalCadence, GoalRing, GoalVerdict, CivicBehaviour, CivicBehaviourInput, Paged, Agent, AgentStatus, AgentJob, DisputeResolution } from "./types";

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
  // Attach the HTTP status (like post/del) so loaders can tell a 403 apart from
  // a genuine outage and degrade gracefully instead of hitting the error boundary.
  if (!res.ok) throw Object.assign(new Error(`GET ${path} failed (${res.status})`), { status: res.status });
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
    get<Paged<Member>>(`/api/members?${pageQuery(args)}`),
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
  mfaConfirm: (code: string) => post<{ recoveryCodes: string[] }>("/api/me/mfa/confirm", { code }),
  mfaDisable: (code: string) => post<{ ok: boolean }>("/api/me/mfa/disable", { code }),
  me: () => get<Member>("/api/auth/me"),

  // Your own account.
  updateProfile: (body: { displayName: string; bio?: string }) => post<Member>("/api/me/profile", body),
  setPhoto: (photoUrl: string) => post<{ photoUrl: string }>("/api/me/photo", { photoUrl }),
};
