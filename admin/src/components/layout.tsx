import { Link, NavLink, Outlet, isRouteErrorResponse, useRouteError, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { PageTransition } from "@/components/page-transition";
import { useAuth } from "@/lib/auth";
import {
  Gauge, LayoutDashboard, ShieldCheck, Inbox, List, Flag, ShieldAlert, History,
  Users, Landmark, MapPin, BadgeCheck, HandCoins, Ticket, Repeat, Banknote,
  Newspaper, Sparkles, UserRound, Bell, User, Settings, Search, ChevronDown,
  LogOut, BellRing, type LucideIcon,
} from "lucide-react";

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean; badge?: number }
interface NavGroup { title: string; icon: LucideIcon; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  { title: "Dashboard", icon: Gauge, items: [{ to: "/", label: "Overview", icon: LayoutDashboard, end: true }] },
  {
    title: "Moderation",
    icon: ShieldCheck,
    items: [
      { to: "/moderation", label: "Queue", icon: Inbox },
      { to: "/listings", label: "Listings", icon: List },
      { to: "/reports", label: "Reports", icon: Flag },
      { to: "/incidents", label: "Incidents", icon: ShieldAlert },
      { to: "/audit", label: "Audit log", icon: History },
    ],
  },
  {
    title: "Community",
    icon: Users,
    items: [
      { to: "/members", label: "Members", icon: Users },
      { to: "/institutions", label: "Institutions", icon: Landmark },
      { to: "/places", label: "Places", icon: MapPin },
      { to: "/claims", label: "Claims", icon: BadgeCheck },
      { to: "/projects", label: "Projects", icon: HandCoins },
      { to: "/tickets", label: "Tickets", icon: Ticket },
    ],
  },
  {
    title: "Monetization",
    icon: Banknote,
    items: [
      { to: "/plans", label: "Plans", icon: BadgeCheck },
      { to: "/subscriptions", label: "Subscriptions", icon: Repeat },
      { to: "/revenue", label: "Revenue", icon: Banknote },
    ],
  },
  {
    title: "Publishing",
    icon: Newspaper,
    items: [
      { to: "/newsroom", label: "Newsroom", icon: Newspaper },
      { to: "/compose", label: "Compose · AI", icon: Sparkles },
    ],
  },
  {
    title: "Account",
    icon: UserRound,
    items: [
      { to: "/notifications", label: "Notifications", icon: Bell },
      { to: "/profile", label: "Profile", icon: User },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

// Moderators can only access triage-focused routes.
const MODERATOR_PATHS = new Set(["/moderation", "/listings", "/reports", "/incidents"]);

function visibleGroups(role: string | undefined): NavGroup[] {
  if (role !== "moderator") return NAV_GROUPS;
  return NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => MODERATOR_PATHS.has(i.to)) }))
    .filter((g) => g.items.length > 0);
}

/** Role badge chip shown next to the username in the top-bar user menu. */
export function RoleBadge({ role }: Readonly<{ role: string }>) {
  const map: Record<string, string> = {
    steward: "bg-green text-cream",
    curator: "bg-teal/20 text-teal-text",
    moderator: "bg-gold/20 text-gold-text",
    editor: "bg-clay/15 text-clay-text",
  };
  const cls = map[role] ?? "bg-sand text-ink-muted";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>{role}</span>;
}

export function Mark({ size = 26, color = "#C7A24A" }: Readonly<{ size?: number; color?: string }>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4.6 13.4c0-3 3.3-4.6 7.4-4.6s7.4 1.6 7.4 4.6c0 2.4-3.3 3.9-7.4 3.9s-7.4-1.5-7.4-3.9Z" />
      <path d="M9.6 9V6.4M14.4 9V6.4" />
      <circle cx="9.6" cy="5.7" r="0.7" fill={color} stroke="none" />
      <circle cx="14.4" cy="5.7" r="0.7" fill={color} stroke="none" />
      <path d="M5.2 12.3 2.3 9.6M2.3 9.6l1.9-.2M2.3 9.6l.1 1.9" />
      <path d="M18.8 12.3 21.7 9.6M21.7 9.6l-1.9-.2M21.7 9.6l.1 1.9" />
      <path d="M6.2 15.4 3.2 17M7.4 16.8 5.2 19.6M16.6 16.8 18.8 19.6M17.8 15.4 20.8 17" />
    </svg>
  );
}

function Icon({ name, className = "" }: Readonly<{ name: "menu" | "bell"; className?: string }>) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {name === "menu"
        ? <path d="M4 7h16M4 12h16M4 17h16" />
        : <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>}
    </svg>
  );
}

/** Gold check at the right edge of the active nav row (Aura app-sidebar). */
function Tick({ className }: Readonly<{ className?: string }>) {
  return (
    <svg viewBox="0 0 16 12" className={className} aria-hidden="true">
      <path d="M1 6.5 5.2 10.5 15 1" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Curved file-tree connector from the group trunk into each item (Aura app-sidebar). */
function Connector({ last, active }: Readonly<{ last: boolean; active: boolean }>) {
  return (
    <svg
      viewBox="0 0 24 40"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={`absolute left-[18px] top-0 h-full w-5 transition-colors ${active ? "text-aura-gold" : "text-navy-muted"}`}
    >
      <path
        d={last ? "M7 0 V17 Q7 23 13 23 H24" : "M7 0 V40 M7 23 Q7 23 13 23 H24"}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

const GROUPS_KEY = "oguaa.admin.nav.groups";

function isActivePath(pathname: string, to: string, end?: boolean): boolean {
  return end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
}

/**
 * Dark navy command-center sidebar with gold accents, curved tree connectors,
 * and collapsible groups — a pixel-faithful port of the Aura app-sidebar
 * (auraedu/packages/ui/src/components/app-sidebar.tsx). Groups persist their
 * open state; the group holding the active route is always open.
 */
function SidebarNav({ pathname, role, onNavigate }: Readonly<{ pathname: string; role?: string; onNavigate?: () => void }>) {
  const groups = visibleGroups(role);
  const [openState, setOpenState] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "{}") as Record<string, boolean>;
    } catch {
      return {};
    }
  });

  const toggle = (title: string) => {
    setOpenState((cur) => {
      const next = { ...cur, [title]: !(cur[title] ?? true) };
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <>
      {/* subtle watermark */}
      <span aria-hidden className="pointer-events-none absolute -right-10 top-20 select-none font-display text-[9rem] font-extrabold leading-none tracking-tighter text-white/[0.03]">
        O
      </span>

      <div className="relative z-10 px-4 pb-3 pt-4">
        <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5 text-[0.9375rem] font-extrabold tracking-tight text-aura-cream">
          <span className="grid size-7 place-items-center rounded-md bg-gradient-to-br from-aura-gold to-aura-gold-soft shadow-sm" aria-hidden>
            <Mark size={16} color="#001b50" />
          </span>
          Oguaa
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-aura-gold-muted">Admin</span>
        </Link>
      </div>

      <nav className="relative z-10 pb-4">
        {groups.map((group) => {
          const hasActive = group.items.some((i) => isActivePath(pathname, i.to, i.end));
          const isOpen = hasActive || (openState[group.title] ?? true);
          const panelId = `nav-${group.title.replace(/\s+/g, "-").toLowerCase()}`;
          return (
            <div key={group.title} className="py-1">
              <button
                type="button"
                onClick={() => toggle(group.title)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="flex w-full items-center justify-between px-[18px] py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-aura-gold-muted transition-colors hover:text-aura-gold-soft"
              >
                <span className="flex items-center gap-2">
                  <group.icon size={12} className="shrink-0" aria-hidden />
                  {group.title}
                </span>
                <svg viewBox="0 0 24 24" className={`size-3 transition-transform ${isOpen ? "" : "-rotate-90"}`} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <div
                id={panelId}
                className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
              >
                <div className="min-h-0 overflow-hidden">
                  {group.items.map((item, i) => {
                    const active = isActivePath(pathname, item.to, item.end);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={`relative flex h-[38px] items-center gap-2 pl-10 pr-3.5 text-[13.5px] transition-colors ${
                          active ? "font-semibold text-aura-gold" : "text-aura-cream/70 hover:text-aura-cream"
                        }`}
                      >
                        <Connector last={i === group.items.length - 1} active={active} />
                        {active && <span aria-hidden className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r bg-aura-gold" />}
                        <item.icon size={15} className="shrink-0" aria-hidden />
                        <span className="truncate">{item.label}</span>
                        {item.badge ? (
                          <span className="ml-auto rounded-full bg-crit px-1.5 font-mono text-[10px] text-white">{item.badge}</span>
                        ) : active ? (
                          <Tick className="ml-auto w-3.5 text-aura-gold" />
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>
    </>
  );
}

function daypart(): string {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

/** Staff roles mapped to the back-office titles shown in the user menu. */
const ROLE_LABEL: Record<string, string> = {
  steward: "Super Admin",
  curator: "Curator",
  moderator: "Moderator",
  editor: "Editor",
  member: "Member",
};

/** Rich user-menu rows (icon + title + subtitle), RentOS-style. */
const USER_MENU: { to: string; icon: LucideIcon; title: string; sub: string }[] = [
  { to: "/profile", icon: User, title: "My Profile", sub: "View your account details" },
  { to: "/settings", icon: ShieldCheck, title: "Security & 2FA", sub: "Password and two-factor authentication" },
  { to: "/notifications", icon: BellRing, title: "Notifications", sub: "Your back-office alerts" },
];

export function AdminLayout() {
  const { member, signOut } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false); // mobile drawer
  const [userMenu, setUserMenu] = useState(false);
  const [term, setTerm] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses the header search (Gmail/GitHub convention).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Scroll to top on navigation. (The mobile drawer closes via each link's onClick.)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  // User menu dismisses on click-outside or Escape (Aura user-menu pattern).
  useEffect(() => {
    if (!userMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setUserMenu(false); };
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setUserMenu(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [userMenu]);

  const current = ALL_ITEMS.find((n) => isActivePath(loc.pathname, n.to, n.end)) ?? ALL_ITEMS[0];
  const firstName = member?.displayName.split(" ")[0] ?? "";

  return (
    <div className="min-h-screen bg-paper">
      {/* Mobile backdrop */}
      {open && <div className="fixed inset-0 z-30 bg-black/45 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        aria-label="Primary"
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col overflow-y-auto border-r border-navy-soft bg-navy text-aura-cream transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarNav pathname={loc.pathname} role={member?.role} onNavigate={() => setOpen(false)} />
      </aside>

      {/* Content column, offset by the fixed 240px sidebar on desktop */}
      <div className="flex min-h-screen flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-sand bg-cream/90 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-muted hover:bg-sand lg:hidden" aria-label="Open menu">
            <Icon name="menu" />
          </button>

          {/* Greeting — time-of-day hello + live section context */}
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sand bg-paper text-ink-muted sm:flex">
              <current.icon size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold leading-tight text-ink">
                Good {daypart()}{firstName ? `, ${firstName}` : ""}
              </h2>
              <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" aria-hidden />
                {loc.pathname === "/" ? "Live workspace overview" : current.label}
              </p>
            </div>
          </div>

          {/* Centre search — jumps to the listings directory filtered */}
          <form
            className="relative mx-auto hidden w-full max-w-md md:block"
            onSubmit={(e) => {
              e.preventDefault();
              const q = term.trim();
              navigate(q ? `/listings?q=${encodeURIComponent(q)}` : "/listings");
            }}
          >
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              ref={searchRef}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search listings…"
              aria-label="Search listings"
              className="w-full rounded-full border border-sand bg-paper py-2 pl-10 pr-11 text-sm text-ink placeholder:text-ink-faint focus:border-gold-border focus:outline-none focus:ring-2 focus:ring-gold/20"
            />
            <kbd className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md border border-sand bg-cream px-1.5 py-0.5 text-[10px] font-semibold text-ink-faint">/</kbd>
          </form>

          <div className="ml-auto flex items-center gap-1.5">
            <NavLink to="/notifications" className="relative rounded-lg p-2 text-ink-muted hover:bg-sand" aria-label="Notifications" title="Notifications">
              <Icon name="bell" />
            </NavLink>
            <div className="hidden h-6 w-px bg-sand sm:block" />
            {/* User menu lives in the top bar, not the sidebar — as in Aura. */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setUserMenu((v) => !v)}
                aria-expanded={userMenu}
                aria-haspopup="menu"
                className="flex items-center gap-2.5 rounded-full border border-sand bg-paper py-1.5 pl-1.5 pr-2.5 text-sm transition-colors hover:border-gold-border/60"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/15 text-xs font-bold text-gold-text">
                  {member?.displayName.split(" ").map((s) => s[0]).slice(0, 2).join("") ?? "··"}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block max-w-[10rem] truncate text-sm font-semibold leading-tight text-ink">{member?.displayName ?? "Account"}</span>
                  <span className="block text-[11px] leading-tight text-ink-faint">{ROLE_LABEL[member?.role ?? ""] ?? "Member"}</span>
                </span>
                <ChevronDown size={14} className={`text-ink-faint transition-transform ${userMenu ? "rotate-180" : ""}`} />
              </button>
              {userMenu && (
                <div role="menu" className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-2xl border border-sand bg-paper shadow-lg">
                  {/* Identity header */}
                  <div className="border-b border-sand px-5 py-4">
                    <p className="truncate text-base font-semibold text-ink">{member?.displayName}</p>
                    {member?.email && <p className="truncate text-xs text-ink-muted">{member.email}</p>}
                    <p className="mt-0.5 text-xs text-ink-faint">{ROLE_LABEL[member?.role ?? ""] ?? "Member"}</p>
                  </div>
                  <div className="p-2">
                    {USER_MENU.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        role="menuitem"
                        onClick={() => setUserMenu(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-cream"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sand/70 text-ink-muted">
                          <item.icon size={16} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                          <span className="block truncate text-[11px] text-ink-faint">{item.sub}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                  <div className="border-t border-sand p-2">
                    <button
                      role="menuitem"
                      onClick={signOut}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-maroon-900/[0.05]"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-maroon-900/[0.08] text-maroon-900">
                        <LogOut size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-maroon-900">Sign out</span>
                        <span className="block text-[11px] text-ink-faint">End your session on this device</span>
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-7 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <PageTransition>
              <Outlet />
            </PageTransition>
          </div>
        </main>
      </div>
    </div>
  );
}

export function AdminError() {
  const err = useRouteError();
  const msg = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : "The API may be offline.";
  return (
    <div className="flex min-h-screen items-center justify-center p-8 text-center">
      <div>
        <h1 className="text-4xl font-semibold">Something went wrong</h1>
        <p className="mt-3 text-ink-muted">{msg}</p>
        <p className="mt-2 text-sm text-ink-faint">Is the Go API running on :8080?</p>
        <a href="/" className="mt-6 inline-block rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream">Reload</a>
      </div>
    </div>
  );
}
