import { NavLink, Outlet, isRouteErrorResponse, useRouteError, useLocation } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { useAuth } from "@/lib/auth";

interface NavItem { to: string; label: string; icon: IconName; end?: boolean }
interface NavGroup { title: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  { title: "Dashboard", items: [{ to: "/", label: "Overview", icon: "grid", end: true }] },
  {
    title: "Moderation",
    items: [
      { to: "/moderation", label: "Queue", icon: "inbox" },
      { to: "/listings", label: "Listings", icon: "list" },
      { to: "/reports", label: "Reports", icon: "flag" },
      { to: "/incidents", label: "Incidents", icon: "shield" },
      { to: "/audit", label: "Audit log", icon: "history" },
    ],
  },
  {
    title: "Community",
    items: [
      { to: "/members", label: "Members", icon: "users" },
      { to: "/institutions", label: "Institutions", icon: "landmark" },
      { to: "/places", label: "Places", icon: "pin" },
      { to: "/claims", label: "Claims", icon: "shield" },
      { to: "/projects", label: "Projects", icon: "coins" },
      { to: "/tickets", label: "Tickets", icon: "ticket" },
      { to: "/subscriptions", label: "Subscriptions", icon: "coins" },
      { to: "/revenue", label: "Revenue", icon: "coins" },
    ],
  },
  {
    title: "Publishing",
    items: [
      { to: "/newsroom", label: "Newsroom", icon: "news" },
      { to: "/compose", label: "Compose · AI", icon: "sparkles" },
    ],
  },
  {
    title: "Account",
    items: [
      { to: "/notifications", label: "Notifications", icon: "bell" },
      { to: "/profile", label: "Profile", icon: "user" },
      { to: "/settings", label: "Settings", icon: "gear" },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export function Mark({ size = 26 }: Readonly<{ size?: number }>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#C7A24A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4.6 13.4c0-3 3.3-4.6 7.4-4.6s7.4 1.6 7.4 4.6c0 2.4-3.3 3.9-7.4 3.9s-7.4-1.5-7.4-3.9Z" />
      <path d="M9.6 9V6.4M14.4 9V6.4" />
      <circle cx="9.6" cy="5.7" r="0.7" fill="#C7A24A" stroke="none" />
      <circle cx="14.4" cy="5.7" r="0.7" fill="#C7A24A" stroke="none" />
      <path d="M5.2 12.3 2.3 9.6M2.3 9.6l1.9-.2M2.3 9.6l.1 1.9" />
      <path d="M18.8 12.3 21.7 9.6M21.7 9.6l-1.9-.2M21.7 9.6l-.1 1.9" />
      <path d="M6.2 15.4 3.2 17M7.4 16.8 5.2 19.6M16.6 16.8 18.8 19.6M17.8 15.4 20.8 17" />
    </svg>
  );
}

type IconName =
  | "grid" | "inbox" | "list" | "history" | "users" | "landmark"
  | "shield" | "news" | "sparkles" | "bell" | "user" | "gear" | "menu" | "chevrons" | "flag" | "pin" | "coins" | "ticket";

function Icon({ name, className = "" }: Readonly<{ name: IconName; className?: string }>) {
  const p: Record<IconName, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    inbox: <><path d="M3 13h4l1.5 3h7L17 13h4" /><path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6Z" /></>,
    list: <><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 4v4h4" /><path d="M12 8v4l3 2" /></>,
    users: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 6.5a3 3 0 0 1 0 5.8" /><path d="M17 14.5a5.5 5.5 0 0 1 3.5 4.5" /></>,
    landmark: <><path d="M4 9h16M5 9v8M9 9v8M15 9v8M19 9v8M3 21h18M3 17h18" /><path d="M12 3 20 7H4Z" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Z" /><path d="m9 11.5 2 2 4-4" /></>,
    news: <><path d="M4 5h12v14H5a1 1 0 0 1-1-1Z" /><path d="M16 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1" /><path d="M7 8h6M7 11h6M7 14h4" /></>,
    sparkles: <><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z" /><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8Z" /></>,
    bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
    user: <><circle cx="12" cy="8" r="3.6" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
    gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" /></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    chevrons: <path d="m13 6-6 6 6 6M19 6l-6 6 6 6" />,
    flag: <><path d="M4 21V4h12l-1.6 4L16 12H4" /><path d="M4 4v17" /></>,
    pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
    coins: <><circle cx="9" cy="9" r="6" /><path d="M15.2 5.1a6 6 0 1 1-7.7 8.4" /><path d="M7 9h4M9 7v4" /></>,
    ticket: <><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4Z" /><path d="M14 7v2M14 11v2M14 15v2" /></>,
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {p[name]}
    </svg>
  );
}

const COLLAPSE_KEY = "oguaa.admin.sidebar.collapsed";

export function AdminLayout() {
  const { member, signOut } = useAuth();
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(() => (typeof localStorage !== "undefined" ? localStorage.getItem(COLLAPSE_KEY) === "1" : false));
  const [open, setOpen] = useState(false); // mobile drawer

  useEffect(() => { if (typeof localStorage !== "undefined") localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0"); }, [collapsed]);
  // Scroll to top on navigation. (The mobile drawer closes via each link's onClick.)
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  const current = ALL_ITEMS.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to) && n.to !== "/")) ?? ALL_ITEMS[0];

  return (
    <div className="min-h-screen bg-paper">
      {/* Mobile backdrop */}
      {open && <div className="fixed inset-0 z-30 bg-green-900/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex flex-col bg-green-900 text-cream transition-[width,transform] duration-200",
          collapsed ? "lg:w-[68px]" : "lg:w-60",
          "w-60 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className={`flex h-16 shrink-0 items-center gap-2 border-b border-cream/10 ${collapsed ? "lg:justify-center lg:px-0" : ""} px-5`}>
          <Mark />
          <span className={`text-xl font-semibold leading-none text-cream ${collapsed ? "lg:hidden" : ""}`}>Oguaa</span>
          <span className={`rounded bg-gold px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-green-900 ${collapsed ? "lg:hidden" : ""}`}>Admin</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((g) => (
            <div key={g.title} className="mb-4 last:mb-0">
              <p className={`px-3 pb-1.5 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-cream/40 ${collapsed ? "lg:hidden" : ""}`}>{g.title}</p>
              <div className="space-y-0.5">
                {g.items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    onClick={() => setOpen(false)}
                    title={collapsed ? n.label : undefined}
                    className={({ isActive }) =>
                      [
                        "group relative isolate flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition-colors",
                        collapsed ? "lg:justify-center lg:px-0 px-3" : "px-3",
                        isActive ? "text-gold" : "text-cream/75 hover:bg-cream/10 hover:text-cream",
                      ].join(" ")
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span
                            layoutId="admin-nav-active"
                            className="absolute inset-0 -z-10 rounded-lg bg-cream/[0.08]"
                            transition={{ type: "spring", stiffness: 400, damping: 32 }}
                            aria-hidden
                          />
                        )}
                        {/* gold active indicator bar */}
                        <span className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-gold transition-opacity ${isActive ? "opacity-100" : "opacity-0"}`} aria-hidden />
                        <Icon name={n.icon} className={isActive ? "text-gold" : ""} />
                        <span className={collapsed ? "lg:hidden" : ""}>{n.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className={`shrink-0 border-t border-cream/10 px-4 py-3 ${collapsed ? "lg:px-2" : ""}`}>
          {member && (
            <div className={`flex items-center gap-2.5 ${collapsed ? "lg:justify-center" : ""}`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/20 text-xs font-bold text-gold">
                {member.displayName.split(" ").map((s) => s[0]).slice(0, 2).join("")}
              </span>
              <div className={`min-w-0 flex-1 ${collapsed ? "lg:hidden" : ""}`}>
                <p className="truncate text-xs font-medium text-cream">{member.displayName}</p>
                <p className="text-[0.65rem] capitalize text-cream/55">{member.role}</p>
              </div>
              <button onClick={signOut} title="Sign out" className={`shrink-0 rounded-md p-1.5 text-cream/60 hover:bg-cream/10 hover:text-gold ${collapsed ? "lg:hidden" : ""}`} aria-label="Sign out">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 17l5-5-5-5M15 12H3" /></svg>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Content column, offset by the sidebar width on desktop */}
      <div className={`flex min-h-screen flex-col transition-[padding] duration-200 ${collapsed ? "lg:pl-[68px]" : "lg:pl-60"}`}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-sand bg-cream/90 px-4 backdrop-blur sm:px-6">
          {/* Mobile: open drawer. Desktop: collapse rail. */}
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-muted hover:bg-sand lg:hidden" aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <button onClick={() => setCollapsed((c) => !c)} className="hidden rounded-lg p-2 text-ink-muted hover:bg-sand lg:inline-flex" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-pressed={collapsed}>
            <Icon name="chevrons" className={collapsed ? "rotate-180" : ""} />
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-ink-faint">Admin</p>
            <h2 className="truncate text-lg font-semibold leading-none text-ink">{current.label}</h2>
          </div>

          <NavLink to="/notifications" className="relative rounded-lg p-2 text-ink-muted hover:bg-sand" aria-label="Notifications" title="Notifications">
            <Icon name="bell" />
          </NavLink>
          <div className="hidden h-6 w-px bg-sand sm:block" />
          <NavLink to="/profile" className="hidden items-center gap-2 rounded-full border border-sand bg-paper py-1 pl-1 pr-3 text-sm hover:border-gold-border/60 sm:inline-flex">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold/15 text-xs font-bold text-gold-text">
              {member?.displayName.split(" ").map((s) => s[0]).slice(0, 2).join("") ?? "··"}
            </span>
            <span className="max-w-[8rem] truncate font-medium text-ink">{member?.displayName ?? "Account"}</span>
          </NavLink>
        </header>

        <main className="flex-1 px-4 py-7 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
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
