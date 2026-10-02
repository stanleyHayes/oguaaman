// Which staff roles may open each console page. Mirrors the backend's
// requireRole gates on the endpoints each page's loader calls (a steward
// passes every gate). Pages absent from the map are open to all staff.

const CURATOR = "curator";
const MODERATOR = "moderator";
const STEWARD = "steward";
const EDITOR = "editor";

const TRIAGE = [CURATOR, MODERATOR];
const CURATOR_ONLY = [CURATOR];
const STEWARD_ONLY = [STEWARD];

export const ROUTE_ROLES: Readonly<Record<string, readonly string[]>> = {
  "/moderation": TRIAGE,
  "/listings": TRIAGE,
  "/reports": TRIAGE,
  "/incidents": TRIAGE,
  "/audit": CURATOR_ONLY,
  "/directives": CURATOR_ONLY,
  "/goals": [CURATOR, "accountability"],
  "/civic": CURATOR_ONLY,
  "/outside-agents": ["vetting"],
  "/outside-disputes": ["vetting"],
  "/members": TRIAGE,
  "/institutions": STEWARD_ONLY,
  "/places": STEWARD_ONLY,
  "/claims": STEWARD_ONLY,
  "/privacy-requests": STEWARD_ONLY,
  "/projects": CURATOR_ONLY,
  "/tickets": CURATOR_ONLY,
  "/plans": CURATOR_ONLY,
  "/subscriptions": CURATOR_ONLY,
  "/revenue": CURATOR_ONLY,
  "/commerce": CURATOR_ONLY,
  "/newsroom": [CURATOR, EDITOR],
  "/newsroom/research": [CURATOR, EDITOR],
  // Read-only unless steward (the page checks isSteward).
  "/newsroom/desk": [CURATOR, EDITOR],
  "/compose": [CURATOR, EDITOR],
  "/ads": TRIAGE,
  "/ad-sponsors": TRIAGE,
  "/ad-pricing": CURATOR_ONLY,
  "/ad-report": CURATOR_ONLY,
  "/elections": CURATOR_ONLY,
};

/** The ROUTE_ROLES entry for a concrete path: "/ads/abc" uses "/ads". */
function routeKey(path: string): string {
  if (ROUTE_ROLES[path]) return path;
  const parent = Object.keys(ROUTE_ROLES)
    .filter((key) => path.startsWith(`${key}/`))
    .sort((a, b) => b.length - a.length)[0];
  return parent ?? path;
}

/** True when `role` may open the page at `path` (steward: always). */
export function canAccess(role: string | undefined, path: string): boolean {
  if (role === STEWARD) return true;
  const allowed = ROUTE_ROLES[routeKey(path)];
  return !allowed || (role != null && allowed.includes(role));
}

/** True for curators (and the steward): approvals that need curator rank. */
export function isCuratorOrAbove(role: string | undefined): boolean {
  return role === STEWARD || role === CURATOR;
}

/** True for the steward, who alone can use steward-only tools. */
export function isSteward(role: string | undefined): boolean {
  return role === STEWARD;
}
