import { Link, NavLink, Outlet, isRouteErrorResponse, useRouteError, useLocation, useNavigate, useNavigation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { PageTransition } from "@/components/page-transition";
import { useAuth } from "@/lib/auth";
import {
  Gauge, LayoutDashboard, ShieldCheck, Inbox, List, Flag, ShieldAlert, History,
  Users, Landmark, MapPin, BadgeCheck, HandCoins, Ticket, Repeat, Banknote,
  Newspaper, Sparkles, UserRound, Bell, User, Settings, Search, ChevronDown,
  LogOut, BellRing, Map, PanelLeftClose, PanelLeft, Siren, Megaphone, Target, HeartHandshake, type LucideIcon,
} from "lucide-react";
import { Tour, type TourStep } from "@/components/tour";
import { ThemeToggle } from "@/components/theme-toggle";
import { PageSkeleton } from "@/components/skeleton";

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean; badge?: number; roles?: string[] }
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
    title: "Alerts",
    icon: Siren,
    items: [
      { to: "/directives", label: "Directives", icon: Megaphone, roles: ["curator", "steward"] },
      { to: "/goals", label: "Town goals", icon: Target, roles: ["curator", "steward", "accountability"] },
      { to: "/civic", label: "Civic pledges", icon: HeartHandshake, roles: ["curator", "steward"] },
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
  // Items may declare a `roles` allowlist (e.g. directives authoring is
  // curator/steward, matching the backend's requireRole gate).
  const byRole = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || (role != null && i.roles.includes(role))) }))
    .filter((g) => g.items.length > 0);
  if (role !== "moderator") return byRole;
  // Moderators are further limited to the triage-focused routes.
  return byRole
    .map((g) => ({ ...g, items: g.items.filter((i) => MODERATOR_PATHS.has(i.to)) }))
    .filter((g) => g.items.length > 0);
}

/** Role badge chip shown next to the username in the top-bar user menu. */
export function RoleBadge({ role }: Readonly<{ role: string }>) {
  const map: Record<string, string> = {
    steward: "bg-green text-on-green",
    curator: "bg-teal/20 text-teal-text",
    moderator: "bg-gold/20 text-gold-text",
    editor: "bg-clay/15 text-clay-text",
    accountability: "bg-ai/15 text-ai",
  };
  const cls = map[role] ?? "bg-sand text-ink-muted";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>{role}</span>;
}

export function Mark({ size = 26, color = "#C7A24A" }: Readonly<{ size?: number; color?: string }>) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <g transform="translate(0,-1)">
        <path d="M43 32.5C47 31 50 30.5 52 28" />
        <path d="M52 28C56 27 59.2 23.4 55.6 20.4 54 19.1 52.4 20.2 52.9 22" />
        <path d="M52 28C54.6 28.9 57 27.6 57.2 25.2" />
        <path d="M43.5 40.5C47.5 41.5 50.6 43.4 52.6 46.4" />
        <path d="M42.5 43C45.6 44.4 48 46.4 49.5 49.4" />
        <path d="M40.6 45C42.6 47 43.8 49 44.8 51.7" />
        <path d="M21 32.5C17 31 14 30.5 12 28" />
        <path d="M12 28C8 27 4.8 23.4 8.4 20.4 10 19.1 11.6 20.2 11.1 22" />
        <path d="M12 28C9.4 28.9 7 27.6 6.8 25.2" />
        <path d="M20.5 40.5C16.5 41.5 13.4 43.4 11.4 46.4" />
        <path d="M21.5 43C18.4 44.4 16 46.4 14.5 49.4" />
        <path d="M23.4 45C21.4 47 20.2 49 19.2 51.7" />
        <path d="M20 39C20 32 25.5 28.5 32 28.5 38.5 28.5 44 32 44 39 44 44 39 46.5 32 46.5 25 46.5 20 44 20 39Z" />
        <path d="M28 29L28 24" />
        <path d="M36 29L36 24" />
        <circle cx="28" cy="22.4" r="2" fill={color} stroke="none" />
        <circle cx="36" cy="22.4" r="2" fill={color} stroke="none" />
      </g>
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
function Connector({ last, active, collapsed }: Readonly<{ last: boolean; active: boolean; collapsed?: boolean }>) {
  return (
    <svg
      viewBox="0 0 24 40"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={`absolute left-[18px] top-0 h-full w-5 transition-colors ${active ? "text-aura-gold" : "text-navy-muted"} ${collapsed ? "lg:hidden" : ""}`}
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
const COLLAPSE_KEY = "oguaa.admin.nav.collapsed";

function isActivePath(pathname: string, to: string, end?: boolean): boolean {
  return end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
}

/**
 * Dark navy command-center sidebar with gold accents, curved tree connectors,
 * and collapsible groups — a pixel-faithful port of the Aura app-sidebar
 * (auraedu/packages/ui/src/components/app-sidebar.tsx). Groups persist their
 * open state; the group holding the active route is always open.
 */
function SidebarNav({ pathname, role, onNavigate, collapsed = false, onToggleCollapsed }: Readonly<{ pathname: string; role?: string; onNavigate?: () => void; collapsed?: boolean; onToggleCollapsed?: () => void }>) {
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

      <div className={`relative z-10 flex items-center justify-between gap-2 px-4 pb-3 pt-4 ${collapsed ? "lg:flex-col lg:gap-3 lg:px-0" : ""}`}>
        <Link
          to="/"
          onClick={onNavigate}
          title={collapsed ? "Oguaa Admin" : undefined}
          className="flex items-center gap-2.5 text-[0.9375rem] font-extrabold tracking-tight text-aura-cream"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-gradient-to-br from-aura-gold to-aura-gold-soft shadow-sm" aria-hidden>
            <Mark size={16} color="#001b50" />
          </span>
          <span className={collapsed ? "lg:hidden" : ""}>Oguaa</span>
          <span className={`font-mono text-[9px] uppercase tracking-[0.18em] text-aura-gold-muted ${collapsed ? "lg:hidden" : ""}`}>Admin</span>
        </Link>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden shrink-0 rounded-md p-1.5 text-aura-cream/60 transition-colors hover:bg-navy-soft hover:text-aura-cream lg:inline-flex"
        >
          {collapsed ? <PanelLeft size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
        </button>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden">
      <nav className="pb-4">
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
                title={collapsed ? group.title : undefined}
                className={`flex w-full items-center justify-between px-[18px] py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-aura-gold-muted transition-colors hover:text-aura-gold-soft ${collapsed ? "lg:justify-center lg:px-0" : ""}`}
              >
                <span className="flex items-center gap-2">
                  <group.icon size={12} className="shrink-0" aria-hidden />
                  <span className={collapsed ? "lg:hidden" : ""}>{group.title}</span>
                </span>
                <svg viewBox="0 0 24 24" className={`size-3 transition-transform ${isOpen ? "" : "-rotate-90"} ${collapsed ? "lg:hidden" : ""}`} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
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
                        title={collapsed ? item.label : undefined}
                        className={`relative flex h-[38px] items-center gap-2 pl-10 pr-3.5 text-[13.5px] transition-colors ${
                          collapsed ? "lg:justify-center lg:gap-0 lg:px-0" : ""
                        } ${active ? "font-semibold text-aura-gold" : "text-aura-cream/70 hover:text-aura-cream"}`}
                      >
                        <Connector last={i === group.items.length - 1} active={active} collapsed={collapsed} />
                        {active && <span aria-hidden className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r bg-aura-gold" />}
                        <item.icon size={15} className="shrink-0" aria-hidden />
                        <span className={`truncate ${collapsed ? "lg:hidden" : ""}`}>{item.label}</span>
                        {item.badge ? (
                          <span className={`ml-auto rounded-full bg-crit px-1.5 font-mono text-[10px] text-white ${collapsed ? "lg:hidden" : ""}`}>{item.badge}</span>
                        ) : active ? (
                          <Tick className={`ml-auto w-3.5 text-aura-gold ${collapsed ? "lg:hidden" : ""}`} />
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
      </div>
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
  accountability: "Accountability officer",
  member: "Member",
};

/** Rich user-menu rows (icon + title + subtitle), RentOS-style. */
const USER_MENU: { to: string; icon: LucideIcon; title: string; sub: string }[] = [
  { to: "/profile", icon: User, title: "My Profile", sub: "View your account details" },
  { to: "/settings", icon: ShieldCheck, title: "Security & 2FA", sub: "Password and two-factor authentication" },
  { to: "/notifications", icon: BellRing, title: "Notifications", sub: "Your back-office alerts" },
];

/** First-login walkthrough — "show me around". Selectors fall back to a
 * centred card when a target isn't on screen (role-filtered nav, mobile). */
const ADMIN_TOUR: TourStep[] = [
  {
    title: "Welcome to the back office",
    body: "This is where Oguaa is looked after — the queue, the people, the money, and the presses. Sixty seconds and you'll know your way around.",
  },
  {
    selector: 'aside[aria-label="Primary"]',
    side: "right",
    title: "Your sections",
    body: "Everything lives in these groups: Moderation for the queue, Community for people and schools, Monetization for plans and payments, Publishing for the newsroom.",
  },
  {
    selector: 'aside a[href="/moderation"]',
    side: "right",
    title: "The review queue",
    body: "Every submission lands here first. Approve, reject, or ask for changes — nothing goes public without passing this desk.",
  },
  {
    selector: '[data-tour="search"]',
    side: "bottom",
    title: "Search listings",
    body: "Jump straight to any listing in the directory. Press / from anywhere to focus the search.",
  },
  {
    selector: '[data-tour="bell"]',
    side: "bottom",
    title: "Notifications",
    body: "Member reports, incident updates, and back-office alerts land here.",
  },
  {
    selector: '[data-tour="user-menu"]',
    side: "bottom",
    title: "Your account",
    body: "Profile, two-factor settings, and a replay of this tour live in this menu.",
  },
  {
    selector: "main",
    side: "top",
    title: "The workspace",
    body: "Pages open here. The overview keeps a pulse on the town — queue depth, members, views, and growth.",
  },
];

export function AdminLayout() {
  const { member, signOut } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  }); // desktop rail (lg+)
  const [userMenu, setUserMenu] = useState(false);
  const [term, setTerm] = useState("");
  const [tour, setTour] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // First login on a desktop viewport → auto-start the walkthrough.
  useEffect(() => {
    if (!member) return;
    const key = `oguaa.admin.tourSeen.${member.id}`;
    if (localStorage.getItem(key) || window.innerWidth < 1024) return;
    const t = setTimeout(() => setTour(true), 900);
    return () => clearTimeout(t);
  }, [member]);

  const closeTour = () => {
    setTour(false);
    if (member) localStorage.setItem(`oguaa.admin.tourSeen.${member.id}`, "1");
  };

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

  // Lock body scroll while the mobile drawer is open so the page behind stays put.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

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

  // Desktop-only: collapse the 240px sidebar to a 64px icon rail (persisted).
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch { /* ignore */ }
      return next;
    });
  };

  const current = ALL_ITEMS.find((n) => isActivePath(loc.pathname, n.to, n.end)) ?? ALL_ITEMS[0];
  const firstName = member?.displayName.split(" ")[0] ?? "";

  return (
    <div className="min-h-screen bg-paper">
      {/* Mobile backdrop */}
      {open && <div className="fixed inset-0 z-30 bg-black/45 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        aria-label="Primary"
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col overflow-hidden border-r border-navy-soft bg-navy text-aura-cream transition-[transform,width] duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:w-16" : "lg:w-60"}`}
      >
        <SidebarNav pathname={loc.pathname} role={member?.role} onNavigate={() => setOpen(false)} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </aside>

      {/* Content column, offset by the fixed sidebar on desktop (240px → 64px when collapsed) */}
      <div className={`flex min-h-screen flex-col transition-[padding] duration-200 ${collapsed ? "lg:pl-16" : "lg:pl-60"}`}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-sand bg-cream/90 px-4 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-muted hover:bg-sand lg:hidden" aria-label="Open menu">
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
            data-tour="search"
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
            <NavLink to="/notifications" data-tour="bell" className="relative rounded-lg p-2 text-ink-muted hover:bg-sand" aria-label="Notifications" title="Notifications">
              <Icon name="bell" />
            </NavLink>
            <ThemeToggle className="text-ink-muted hover:bg-sand" />
            <div className="hidden h-6 w-px bg-sand sm:block" />
            {/* User menu lives in the top bar, not the sidebar — as in Aura. */}
            <div className="relative" ref={menuRef}>
              <button type="button"
                data-tour="user-menu"
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
                    <button type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserMenu(false);
                        setTour(true);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-cream"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sand/70 text-ink-muted">
                        <Map size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">Replay tour</span>
                        <span className="block truncate text-[11px] text-ink-faint">Play the dashboard walkthrough again</span>
                      </span>
                    </button>
                  </div>
                  <div className="border-t border-sand p-2">
                    <button type="button"
                      role="menuitem"
                      onClick={signOut}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-maroon-900/[0.05]"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-maroon-900/[0.08] text-maroon-text">
                        <LogOut size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-maroon-text">Sign out</span>
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
            {navigation.state !== "idle" && navigation.location ? (
              <PageSkeleton pathname={navigation.location.pathname} />
            ) : (
              <PageTransition>
                <Outlet />
              </PageTransition>
            )}
          </div>
        </main>
      </div>

      {tour && <Tour steps={ADMIN_TOUR} onDone={closeTour} />}
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
        <a href="/" className="mt-6 inline-block rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green">Reload</a>
      </div>
    </div>
  );
}
