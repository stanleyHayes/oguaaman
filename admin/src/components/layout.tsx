import { Link, NavLink, Outlet, isRouteErrorResponse, useRouteError, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { PageTransition } from "@/components/page-transition";
import { useAuth } from "@/lib/auth";
import {
  Gauge, LayoutDashboard, ShieldCheck, Inbox, List, Flag, ShieldAlert, History,
  Users, Landmark, MapPin, BadgeCheck, HandCoins, Ticket, Repeat, Banknote,
  Newspaper, Sparkles, UserRound, Bell, User, Settings, type LucideIcon,
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
function SidebarNav({ pathname, onNavigate }: Readonly<{ pathname: string; onNavigate?: () => void }>) {
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
        {NAV_GROUPS.map((group) => {
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

export function AdminLayout() {
  const { member, signOut } = useAuth();
  const loc = useLocation();
  const [open, setOpen] = useState(false); // mobile drawer
  const [userMenu, setUserMenu] = useState(false);

  // Scroll to top on navigation. (The mobile drawer closes via each link's
  // onClick; the user menu closes via its backdrop and item clicks.)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  const current = ALL_ITEMS.find((n) => isActivePath(loc.pathname, n.to, n.end)) ?? ALL_ITEMS[0];

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
        <SidebarNav pathname={loc.pathname} onNavigate={() => setOpen(false)} />
      </aside>

      {/* Content column, offset by the fixed 240px sidebar on desktop */}
      <div className="flex min-h-screen flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-sand bg-cream/90 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-muted hover:bg-sand lg:hidden" aria-label="Open menu">
            <Icon name="menu" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-ink-faint">Admin</p>
            <h2 className="truncate text-lg font-semibold leading-none text-ink">{current.label}</h2>
          </div>

          <NavLink to="/notifications" className="relative rounded-lg p-2 text-ink-muted hover:bg-sand" aria-label="Notifications" title="Notifications">
            <Icon name="bell" />
          </NavLink>
          <div className="hidden h-6 w-px bg-sand sm:block" />
          {/* User menu lives in the top bar, not the sidebar — as in Aura. */}
          <div className="relative hidden sm:block">
            <button
              onClick={() => setUserMenu((v) => !v)}
              aria-expanded={userMenu}
              aria-haspopup="menu"
              className="flex items-center gap-2 rounded-full border border-sand bg-paper py-1 pl-1 pr-3 text-sm hover:border-gold-border/60"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold/15 text-xs font-bold text-gold-text">
                {member?.displayName.split(" ").map((s) => s[0]).slice(0, 2).join("") ?? "··"}
              </span>
              <span className="max-w-[8rem] truncate font-medium text-ink">{member?.displayName ?? "Account"}</span>
            </button>
            {userMenu && (
              <>
                <button className="fixed inset-0 z-10 cursor-default" onClick={() => setUserMenu(false)} aria-hidden tabIndex={-1} />
                <div role="menu" className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-sand bg-paper p-1.5 shadow-lg">
                  <Link to="/profile" role="menuitem" onClick={() => setUserMenu(false)} className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-cream">Profile</Link>
                  <button role="menuitem" onClick={signOut} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-clay-text hover:bg-cream">Sign out</button>
                </div>
              </>
            )}
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
