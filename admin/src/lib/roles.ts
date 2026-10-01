// Which staff roles may open each console page. Mirrors the backend's
// requireRole gates on the endpoints each page's loader calls (a steward
// passes every gate). Pages absent from the map are open to all staff.

const CURATOR = "curator";
const MODERATOR = "moderator";
const STEWARD = "steward";

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
  "/newsroom": [CURATOR, "editor"],
  "/compose": [CURATOR, "editor"],
};

/** True when `role` may open the page at `path` (steward: always). */
export function canAccess(role: string | undefined, path: string): boolean {
  if (role === STEWARD) return true;
  const allowed = ROUTE_ROLES[path];
  return !allowed || (role != null && allowed.includes(role));
}

/** True for the steward, who alone can use steward-only tools. */
export function isSteward(role: string | undefined): boolean {
  return role === STEWARD;
}
