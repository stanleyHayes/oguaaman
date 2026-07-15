import type { CreatorOverview, Listing, Member, MemberView, NotificationItem, Organization, Promotion, Subscription, Ticket } from "./types";

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

export const api = {
  // auth (spec §8.1) — any signed-in member may use the creator app; citizens
  // upgrade to creator types in-app (Account page).
  login: (identifier: string, password: string) =>
    post<{ token: string; member: Member }>("/api/auth/login", { identifier, password }),
  me: () => get<Member>("/api/auth/me"),

  // Owner-scoped dashboard aggregation (Creator Platform plan §4).
  creatorOverview: () => get<CreatorOverview>("/api/creator/overview"),
  setCreatorTypes: (creatorTypes: string[]) => post<Member>("/api/me/creator-types", { creatorTypes }),

  // The member's own listings arrive on the public member view (all statuses).
  member: (slug: string) => get<MemberView>(`/api/members/${slug}`),

  // Owner listing editor: full-replace title/cover/whitelisted details.
  // Approved listings stay live; non-live ones re-queue for review.
  updateListing: (id: string, body: { title: string; coverImageUrl?: string; details: Record<string, unknown> }) =>
    post<Listing>(`/api/listings/${id}/edit`, body),

  // Institutions the member manages (claim → steward-verify → manage, spec §8.13).
  myInstitutions: () => get<Organization[]>("/api/me/institutions"),

  // Paid promotions: self-serve featured placements via Paystack (GH₵10/day).
  promoteListing: (id: string, days: number) =>
    post<{ authorizationUrl: string; reference: string; simulated: boolean }>(`/api/listings/${id}/promote`, { days }),
  confirmPromotion: (reference: string) => get<Promotion>(`/api/promotions/confirm?reference=${encodeURIComponent(reference)}`),

  // Business Supporter subscription (GH₵50/mo, stacking renewals).
  subscribe: (slug: string) =>
    post<{ authorizationUrl: string; reference: string; simulated: boolean }>(`/api/businesses/${slug}/subscribe`, {}),
  confirmSubscription: (reference: string) => get<Subscription>(`/api/subscriptions/confirm?reference=${encodeURIComponent(reference)}`),
  mySubscriptions: () => get<Subscription[]>("/api/me/subscriptions"),

  // Tickets the member has bought (gate codes live on the portal).
  myTickets: () => get<Ticket[]>("/api/me/tickets"),

  notifications: () => get<NotificationItem[]>("/api/notifications"),
  markAllNotificationsRead: () => post<{ status: string }>("/api/notifications/read-all", {}),
  markNotificationRead: (id: string) => post<{ status: string }>(`/api/notifications/${id}/read`, {}),
};
