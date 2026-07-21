import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { motion } from "motion/react";
import { Wordmark } from "@/components/wordmark";
import { CONTACT_EMAIL, PORTAL_APP_URL } from "@/config";
import { SectionIcon } from "@/components/section-icon";
import { ThemeToggle } from "@/components/theme-toggle";

function EnterApp({ className = "" }: Readonly<{ className?: string }>) {
  return (
    <a
      href={PORTAL_APP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center justify-center gap-2 rounded-lg bg-green px-5 py-2.5 text-sm font-bold text-cream on-dark-pin shadow-[0_8px_22px_rgba(18,63,45,0.18)] transition-all hover:-translate-y-0.5 hover:bg-green-900 hover:shadow-[0_12px_28px_rgba(18,63,45,0.24)] ${className}`}
    >
      <span>Get started</span>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="transition-transform group-hover:translate-x-0.5">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </a>
  );
}

type Tone = "green" | "gold" | "maroon" | "teal";
const TONE: Record<Tone, { text: string; soft: string }> = {
  green: { text: "text-green", soft: "bg-green/[0.06]" },
  gold: { text: "text-gold-text", soft: "bg-gold/[0.12]" },
  maroon: { text: "text-maroon-900", soft: "bg-maroon-900/[0.07]" },
  teal: { text: "text-teal-text", soft: "bg-teal/[0.09]" },
};

interface NavItem { to: string; label: string; note: string; icon: string; tone: Tone }

const NAV_LINKS: NavItem[] = [
  { to: "/history", label: "History", note: "From a crab market to a place of return.", icon: "history", tone: "green" },
  { to: "/culture", label: "Culture", note: "The companies, the shrines, the flags.", icon: "culture", tone: "gold" },
  { to: "/festivals", label: "Festivals", note: "Fetu Afahye and the great durbar.", icon: "festivals", tone: "gold" },
  { to: "/education", label: "Education", note: "The citadel that taught a country.", icon: "education", tone: "maroon" },
  { to: "/outside", label: "Oguaa Outside", note: "Trusted agents who act for you, elsewhere.", icon: "outside", tone: "teal" },
  { to: "/visit", label: "Visit", note: "Castle, Kakum, the lagoon, the shore.", icon: "visit", tone: "teal" },
  { to: "/leadership", label: "Leadership", note: "The stool and the civic assembly.", icon: "leadership", tone: "green" },
  { to: "/news", label: "News", note: "Notices and stories from the town.", icon: "news", tone: "gold" },
];

const MAIN_LINKS = NAV_LINKS.slice(0, 4);
const EXPLORE_LINKS = NAV_LINKS.slice(4, 6);
const COMMUNITY_LINKS = NAV_LINKS.slice(6);

interface UtilityLink {
  label: string;
  to?: string;
  href?: string;
  external?: boolean;
}

const TOP_LINKS: UtilityLink[] = [
  { label: "About", to: "/about" },
  { label: "Contact", to: "/contact" },
  { label: "Privacy", to: "/privacy" },
  { label: "Terms", to: "/terms" },
  { label: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
];

function MenuTile({ item, onClick }: Readonly<{ item: NavItem; onClick: () => void }>) {
  const tone = TONE[item.tone];
  return (
    <Link to={item.to} onClick={onClick} role="menuitem" className="group relative flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-paper">
      <SectionIcon id={item.icon} className={`pointer-events-none absolute -bottom-3 -right-2 h-14 w-14 opacity-[0.06] transition-opacity group-hover:opacity-[0.12] ${tone.text}`} />
      <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone.soft} ${tone.text}`}>
        <SectionIcon id={item.icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="relative min-w-0">
        <span className="block text-sm font-semibold text-ink">{item.label}</span>
        <span className="block text-xs leading-snug text-ink-muted">{item.note}</span>
      </span>
    </Link>
  );
}

function DesktopDropdown({
  label,
  items,
  dark,
}: Readonly<{ label: string; items: NavItem[]; dark: boolean }>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = `nav-menu-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const closeTimer = useRef<number | null>(null);
  const canHover = typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);

  function openNow() {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  }

  function closeSoon() {
    if (!canHover) return;
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  }

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => {
        if (!canHover) return;
        openNow();
      }}
      onMouseLeave={closeSoon}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        className={`inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
          dark ? "text-cream/90 hover:bg-cream/10 hover:text-cream" : "text-ink-muted hover:bg-green/10 hover:text-green"
        }`}
      >
        {label}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && <span className="absolute left-0 right-0 top-full h-2" aria-hidden />}
      {open && (
        <motion.div
          id={menuId}
          role="menu"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="theme-surface absolute left-0 z-50 mt-2 w-80 rounded-2xl border border-sand bg-cream p-2 text-ink shadow-[var(--shadow-lift)]"
        >
          {items.map((item) => (
            <MenuTile key={item.to} item={item} onClick={() => setOpen(false)} />
          ))}
        </motion.div>
      )}
    </div>
  );
}

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const linkBase = "relative isolate inline-flex items-center rounded-full px-3.5 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-green/[0.07] hover:text-green";

  return (
    <header className={`sticky top-0 z-50 bg-paper transition-shadow duration-300 ${scrolled ? "shadow-[0_12px_35px_rgba(12,44,31,0.12)]" : ""}`}>
      <div className="on-dark on-dark-pin hidden bg-green-900 text-cream lg:block">
        <div className="mx-auto flex h-9 w-full max-w-[76rem] items-center justify-between px-5 sm:px-6">
          <div className="flex items-center gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-cream/70">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />
            <span>Cape Coast, Ghana</span>
            <span className="h-3 w-px bg-cream/20" aria-hidden />
            <span className="normal-case tracking-normal text-cream/55">The community town square</span>
          </div>
          <nav aria-label="Top navigation" className="flex h-full items-center divide-x divide-cream/15 text-[0.7rem] font-semibold">
            {TOP_LINKS.map((link) => (
              link.to ? (
                <NavLink key={link.label} to={link.to} className={({ isActive }) => `flex h-full items-center px-3.5 transition-colors hover:bg-cream/[0.07] hover:text-gold ${isActive ? "text-gold" : "text-cream/68"}`}>
                  {link.label}
                </NavLink>
              ) : (
                <a key={link.label} href={link.href} target={link.external ? "_blank" : undefined} rel={link.external ? "noopener noreferrer" : undefined} className="flex h-full items-center px-3.5 text-cream/68 transition-colors hover:bg-cream/[0.07] hover:text-gold">
                  {link.label}
                </a>
              )
            ))}
          </nav>
        </div>
      </div>
      <nav
        aria-label="Primary"
        className="border-b border-green/10 bg-paper/95 backdrop-blur-xl"
      >
        <div className="mx-auto flex h-[4.75rem] w-full max-w-[76rem] items-center justify-between gap-5 px-4 sm:px-6">
          <Link to="/" onClick={() => setMobileOpen(false)} aria-label="Oguaa - home" className="group flex shrink-0 items-center gap-4">
            <Wordmark tone="text-ink" markTone="text-gold" size="text-2xl" />
            <span className="hidden h-8 w-px bg-sand xl:block" aria-hidden />
            <span className="hidden max-w-28 text-[0.62rem] font-semibold uppercase leading-[1.35] tracking-[0.15em] text-ink-faint xl:block">Cape Coast<br />in one place</span>
          </Link>

          <div className="hidden items-center gap-0.5 lg:flex">
            {MAIN_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} className={({ isActive }) => `${linkBase} ${isActive ? "text-green" : ""}`}>
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 -z-10 rounded-full bg-green/[0.09]"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        aria-hidden
                      />
                    )}
                    {link.label}
                  </>
                )}
              </NavLink>
            ))}
            <DesktopDropdown label="Explore" items={EXPLORE_LINKS} dark={false} />
            <DesktopDropdown label="Community" items={COMMUNITY_LINKS} dark={false} />
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <ThemeToggle className="border-green/15 text-ink hover:bg-green/[0.06]" />
            <EnterApp />
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <ThemeToggle className="border-green/15 text-ink hover:bg-green/[0.06]" />
            <button
              type="button"
              onClick={() => setMobileOpen((value) => !value)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-panel"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-green/15 text-ink transition-colors hover:bg-green/[0.06]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-5 w-5" aria-hidden>
                {mobileOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {mobileOpen && (
        <div id="mobile-nav-panel" className="absolute inset-x-0 top-full max-h-[calc(100vh-4.75rem)] overflow-y-auto border-b border-green/15 bg-paper shadow-[var(--shadow-lift)] lg:hidden">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="px-5 pb-6 pt-5"
          >
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-gold-text">Explore Cape Coast</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {NAV_LINKS.map((link) => (
                <li key={link.to}>
                  <NavLink to={link.to} onClick={() => setMobileOpen(false)}>
                    {({ isActive }) => (
                      <span className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${isActive ? "border-green/35 bg-green/[0.08]" : "border-sand bg-cream hover:border-gold-border"}`}>
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${isActive ? "bg-green text-cream on-dark-pin" : "bg-green/[0.08] text-green"}`}>
                          <SectionIcon id={link.icon} className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink">{link.label}</span>
                          <span className="block truncate text-xs text-ink-muted">{link.note}</span>
                        </span>
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
            <div className="mt-5 rounded-2xl border border-sand bg-cream/60 p-3">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-gold-text">Info</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-semibold">
                {TOP_LINKS.map((link) => (
                  link.to ? (
                    <NavLink key={link.label} to={link.to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `transition-colors ${isActive ? "text-green" : "text-ink-muted hover:text-green"}`}>
                      {link.label}
                    </NavLink>
                  ) : (
                    <a key={link.label} href={link.href} target={link.external ? "_blank" : undefined} rel={link.external ? "noopener noreferrer" : undefined} className="text-ink-muted transition-colors hover:text-green">
                      {link.label}
                    </a>
                  )
                ))}
              </div>
            </div>
            <EnterApp className="mt-5 w-full justify-center" />
          </motion.div>
        </div>
      )}
    </header>
  );
}
