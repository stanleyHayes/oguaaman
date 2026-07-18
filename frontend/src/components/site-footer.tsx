import { Link, NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { Wordmark } from "./wordmark";
import { Adinkra } from "./adinkra";

// Proof pills under the footer CTA — participation entry points, not stats,
// so they never go stale.
const PROOF_PILLS = [
  { to: "/education", label: "Rep your school" },
  { to: "/submit?type=memory", label: "Share a memory" },
  { to: "/submit?type=event", label: "Post an event" },
  { to: "/projects", label: "Fund a project" },
];

const EXPLORE: FooterLink[] = [
  { to: "/music", label: "Music", fante: "The Oguaa Sound", icon: "music" },
  { to: "/festivals", label: "Festivals", icon: "sparkles" },
  { to: "/heritage", label: "Heritage", icon: "landmark" },
  { to: "/culture", label: "Culture", icon: "sparkles" },
  { to: "/people", label: "People", icon: "users" },
  { to: "/education", label: "Education", icon: "graduation" },
  { to: "/memoriam", label: "In memoriam", fante: "Yɛnkae", icon: "heart" },
  { to: "/youth", label: "Youth", icon: "sprout" },
  { to: "/map", label: "Explore the map", icon: "map-pin" },
];

const TAKE_PART: FooterLink[] = [
  { to: "/better", label: "Build a better Oguaa", icon: "hand-heart" },
  { to: "/submit", label: "Submit a listing", icon: "square-plus" },
  { to: "/events", label: "Events calendar", icon: "calendar" },
  { to: "/community", label: "Join the community", icon: "user-plus" },
  { to: "/investment", label: "Invest in Oguaa", icon: "store" },
  { to: "/mentorship", label: "Become a mentor", icon: "users" },
  { to: "/diaspora", label: "The diaspora register", icon: "globe" },
  { to: "/projects", label: "Adopt a project", icon: "heart" },
  { to: "/me", label: "Your profile", icon: "user" },
  { to: "/admin", label: "Curator dashboard", icon: "grid" },
];

const TOWN_BOARD: FooterLink[] = [
  { to: "/news", label: "Newsroom", icon: "newspaper" },
  { to: "/alerts", label: "Alerts & directives", icon: "shield-alert" },
  { to: "/safety", label: "Safety & incidents", icon: "shield-alert" },
  { to: "/lost-found", label: "Lost & found", icon: "search" },
  { to: "/business", label: "Business directory", icon: "store" },
  { to: "/rent-stay", label: "Rent & stay", icon: "map-pin" },
  { to: "/visit", label: "Visit Cape Coast", icon: "map-pin" },
];

// Hand-rolled inline icon set — no icon library is installed, so we match the
// house style used by SvcIcon/SocialIcon: 24×24 grid, 1.7 stroke, currentColor
// so every glyph inherits the surrounding text tone in both light + dark stages.
type IconName =
  | "compass" | "hand-heart" | "clipboard"
  | "music" | "sparkles" | "landmark" | "users" | "graduation" | "sprout"
  | "square-plus" | "calendar" | "user-plus" | "globe" | "heart" | "user" | "grid"
  | "newspaper" | "shield-alert" | "search" | "store" | "map-pin";

function FooterIcon({ name, className = "" }: Readonly<{ name: IconName; className?: string }>) {
  const body = {
    compass: <><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88" /></>,
    "hand-heart": <><path d="M11 14h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16" /><path d="m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" /><path d="m2 15 6 6" /><path d="M19.5 8.5c.7-.7 1.5-1.6 1.5-2.7A2.73 2.73 0 0 0 16 4a2.78 2.78 0 0 0-5 1.8c0 1.2.8 2 1.5 2.8L16 12Z" /></>,
    clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1Z" /><path d="M9 11h6" /><path d="M9 15h4" /></>,
    music: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
    sparkles: <><path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-5.6-1.44a.5.5 0 0 1 0-.96l5.6-1.44A2 2 0 0 0 9.94 8.5l1.44-5.6a.5.5 0 0 1 .96 0l1.44 5.6a2 2 0 0 0 1.44 1.44l5.6 1.44a.5.5 0 0 1 0 .96l-5.6 1.44a2 2 0 0 0-1.44 1.44l-1.44 5.6a.5.5 0 0 1-.96 0Z" /><path d="M19 4v3" /><path d="M20.5 5.5h-3" /></>,
    landmark: <><line x1="3" y1="21" x2="21" y2="21" /><line x1="6" y1="18" x2="6" y2="11" /><line x1="10" y1="18" x2="10" y2="11" /><line x1="14" y1="18" x2="14" y2="11" /><line x1="18" y1="18" x2="18" y2="11" /><polygon points="12 3 20 8 4 8" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    graduation: <><path d="M12 4 2 9l10 5 10-5Z" /><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" /><path d="M22 9v5" /></>,
    sprout: <><path d="M7 20h10" /><path d="M10 20c5.5-2.5.8-6.4 3-10" /><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" /><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" /></>,
    "square-plus": <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 12h8" /><path d="M12 8v8" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
    "user-plus": <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14.5 14.5 0 0 0 0 18 14.5 14.5 0 0 0 0-18Z" /></>,
    heart: <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />,
    user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>,
    newspaper: <><path d="M4 22a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1h3" /><path d="M6 20V5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v15a2 2 0 0 1-2 2Z" /><path d="M10 8h7" /><path d="M10 12h7" /><path d="M10 16h4" /></>,
    "shield-alert": <><path d="M12 22s8-4 8-10V6l-8-3-8 3v6c0 6 8 10 8 10Z" /><path d="M12 8v4" /><path d="M12 16h.01" /></>,
    search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
    store: <><path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" /><path d="M3 9l1.6-5h14.8L21 9Z" /><path d="M9 20v-6h6v6" /></>,
    "map-pin": <><path d="M20 10c0 5-8 12-8 12s-8-7-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
  }[name];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {body}
    </svg>
  );
}

type FooterLink = { to: string; label: string; fante?: string; icon: IconName };

function FooterColumn({ title, icon, links }: Readonly<{ title: string; icon: IconName; links: FooterLink[] }>) {
  const { pathname } = useLocation();
  const columnActive = links.some((link) => pathname === link.to || pathname.startsWith(`${link.to}/`));
  return (
    <nav aria-label={title}>
      <h3 className={`text-[0.72rem] font-semibold uppercase tracking-[0.22em] ${columnActive ? "text-gold" : "text-cream/55"}`}>
        <span className="inline-flex items-center gap-1.5">
          <FooterIcon name={icon} className={`h-3.5 w-3.5 ${columnActive ? "text-gold" : "text-gold-brand/80"}`} />
          {title}
        </span>
        <span aria-hidden className={`mt-2 block h-0.5 rounded-full bg-gold-brand transition-[width] ${columnActive ? "w-10" : "w-6"}`} />
      </h3>
      <ul className="mt-4 space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.to}>
            <NavLink
              to={l.to}
              className={({ isActive }) => `group -mx-2 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${isActive ? "bg-cream/[0.08] font-semibold text-gold" : "hover:bg-cream/[0.05] hover:text-gold"}`}
            >
              {({ isActive }) => (
                <>
                  <FooterIcon name={l.icon} className={`h-4 w-4 shrink-0 transition-opacity ${isActive ? "opacity-100" : "opacity-70 group-hover:opacity-100"}`} />
                  <span>
                    {l.label}
                    {l.fante && <span className={`ml-2 ${isActive ? "text-gold/70" : "text-cream/45"}`}>{l.fante}</span>}
                  </span>
                  {isActive && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold-brand" />}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function queryDestinationIsActive(to: string, pathname: string, search: string): boolean {
  const [targetPath, targetQuery = ""] = to.split("?", 2);
  const pathMatches = pathname === targetPath || (!targetQuery && pathname.startsWith(`${targetPath}/`));
  if (!pathMatches) return false;
  const expected = new URLSearchParams(targetQuery);
  const current = new URLSearchParams(search);
  return [...expected.entries()].every(([key, value]) => current.getAll(key).includes(value));
}

function QueryAwareLink({ to, className, children }: Readonly<{
  to: string;
  className: (active: boolean) => string;
  children: ReactNode;
}>) {
  const { pathname, search } = useLocation();
  const active = queryDestinationIsActive(to, pathname, search);
  return (
    <Link to={to} aria-current={active ? "page" : undefined} className={className(active)}>
      {children}
    </Link>
  );
}

function legalLinkClass({ isActive }: Readonly<{ isActive: boolean }>): string {
  return isActive
    ? "font-semibold text-gold underline decoration-gold-brand/60 underline-offset-4"
    : "hover:text-gold";
}

type SocialName = "instagram" | "facebook" | "x";

const SOCIALS: { name: SocialName; label: string; href: string }[] = [
  { name: "instagram", label: "Instagram", href: "https://instagram.com/oguaa" },
  { name: "facebook", label: "Facebook", href: "https://facebook.com/oguaa" },
  { name: "x", label: "X (Twitter)", href: "https://x.com/oguaa" },
];

function SocialIcon({ name }: Readonly<{ name: SocialName }>) {
  const body = {
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.2 6.8h.01" /></>,
    facebook: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />,
    x: <><path d="M4 4h4.6L20 20h-4.6Z" /><path d="M4 20l6.8-7.5" /><path d="M13.2 11.4 20 4" /></>,
  }[name];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      {body}
    </svg>
  );
}

function SocialRow() {
  return (
    <div className="mt-5 flex items-center gap-3">
      {SOCIALS.map((s) => (
        <a
          key={s.name}
          href={s.href}
          aria-label={s.label}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-cream/15 text-cream/70 transition-colors hover:border-gold-brand/50 hover:text-gold"
        >
          <SocialIcon name={s.name} />
        </a>
      ))}
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="on-dark on-dark-pin relative mt-20 overflow-hidden bg-green-900 text-cream/80">
      {/* gold glow */}
      <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-gold-brand/[0.07] blur-3xl" />
      <div className="relative">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          {/* CTA card */}
          <div className="relative mb-14 overflow-hidden rounded-[var(--radius-card)] border border-cream/10 bg-cream/[0.05] p-7 backdrop-blur-sm sm:p-9">
            <Adinkra name="sankofa" size={140} labelled={false} className="pointer-events-none absolute -right-6 -top-8 text-gold/[0.08]" />
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.22em] text-gold">Yɛn ara asaase ni</p>
            <h2 className="mt-3 max-w-xl text-2xl font-semibold text-cream sm:text-3xl">
              This is our own land — and it grows by what each of us adds to it.
            </h2>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <NavLink to="/submit" className={({ isActive }) => `rounded-full bg-gold-brand px-5 py-2 text-sm font-semibold text-green-900 transition-all hover:bg-gold ${isActive ? "ring-2 ring-cream/70 ring-offset-2 ring-offset-green-900" : ""}`}>
                Contribute
              </NavLink>
              {PROOF_PILLS.map((p) => (
                <QueryAwareLink
                  key={p.to}
                  to={p.to}
                  className={(active) => `rounded-full border px-4 py-2 text-sm transition-colors ${active ? "border-gold bg-gold/[0.12] font-semibold text-gold" : "border-cream/20 text-cream/80 hover:border-gold hover:text-gold"}`}
                >
                  {p.label}
                </QueryAwareLink>
              ))}
            </div>
          </div>

          <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
            <div>
              <NavLink
                to="/"
                end
                aria-label="Oguaa home"
                className={({ isActive }) => `inline-flex rounded-lg transition-shadow ${isActive ? "ring-1 ring-gold/60 ring-offset-4 ring-offset-green-900" : ""}`}
              >
                <Wordmark size="text-3xl" />
              </NavLink>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-cream/70">
                The community home of Cape Coast, Ghana — its music, people, heritage,
                schools and memories. An independent community initiative. Made by us, for us.
              </p>
              <p className="mt-4 text-lg italic text-gold">Yɛn ara asaase ni — this is our own land.</p>
              <SocialRow />
            </div>

            <FooterColumn title="Explore" icon="compass" links={EXPLORE} />
            <FooterColumn title="Take part" icon="hand-heart" links={TAKE_PART} />
            <FooterColumn title="Town board" icon="clipboard" links={TOWN_BOARD} />
          </div>

          <nav aria-label="Legal" className="mt-12 flex flex-wrap justify-center gap-x-6 gap-y-2 border-t border-gold-brand/25 pt-6 text-xs text-cream/60 sm:justify-start">
            <NavLink to="/privacy" className={legalLinkClass}>Privacy Policy</NavLink>
            <NavLink to="/terms" className={legalLinkClass}>Terms of Use</NavLink>
            <NavLink to="/acceptable-use" className={legalLinkClass}>Acceptable Use</NavLink>
            <NavLink to="/safeguarding" className={legalLinkClass}>Safeguarding Policy</NavLink>
            <NavLink to="/search" className={legalLinkClass}>Search</NavLink>
          </nav>

          <div className="mt-6 flex flex-col items-center gap-3 text-center text-xs text-cream/50 sm:flex-row sm:justify-between sm:text-left">
            <p>© {new Date().getFullYear()} Oguaa — a community vehicle (to be incorporated). Not a commercial product. For ages 18+.</p>
            <span className="inline-flex items-center gap-2">
              <Adinkra name="sankofa" size={16} labelled={false} className="text-gold/70" />
              Built on pride → cohesion → visibility.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
