import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { motion } from "motion/react";
import { Wordmark } from "@/components/wordmark";
import { CTA as Cta } from "@/components/ui";
import { PORTAL_APP_URL } from "@/config";

// One stroke-icon per section — mirrors the portal's section-icon set so the
// menu and the app read as one product. Inherit currentColor.
const ICONS: Record<string, ReactNode> = {
  history: <><path d="M4 9h16M5 9v8M9 9v8M15 9v8M19 9v8M3 21h18M3 17h18" /><path d="M12 3 20 7H4Z" /></>,
  culture: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  festivals: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /><path d="M8 14l2.5 2.5L16 11" /></>,
  education: <><path d="M12 4 2 9l10 5 10-5-10-5Z" /><path d="M6 11v5c0 1 3 3 6 3s6-2 6-3v-5" /></>,
  visit: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
  leadership: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 6.5a3 3 0 0 1 0 5.8" /><path d="M17 14.5a5.5 5.5 0 0 1 3.5 4.5" /></>,
  news: <><path d="M4 5h12v14H5a1 1 0 0 1-1-1Z" /><path d="M16 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1" /><path d="M7 8h6M7 11h6M7 14h4" /></>,
};

function MenuIcon({ id, className = "" }: Readonly<{ id: string; className?: string }>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {ICONS[id] ?? ICONS.history}
    </svg>
  );
}

interface NavItem { to: string; label: string; note: string; icon: string }

/** Single source of truth for every top-level destination. */
const NAV_LINKS: NavItem[] = [
  { to: "/history", label: "History", note: "From a crab market to a place of return.", icon: "history" },
  { to: "/culture", label: "Culture", note: "The companies, the shrines, the flags.", icon: "culture" },
  { to: "/festivals", label: "Festivals", note: "Fetu Afahye and the great durbar.", icon: "festivals" },
  { to: "/education", label: "Education", note: "The citadel that taught a country.", icon: "education" },
  { to: "/visit", label: "Visit", note: "Castle, Kakum, the lagoon, the shore.", icon: "visit" },
  { to: "/leadership", label: "Leadership", note: "The stool and the civic assembly.", icon: "leadership" },
  { to: "/news", label: "News", note: "Notices and stories from the town.", icon: "news" },
];

const LINKS = NAV_LINKS.slice(0, 5);
const MORE_LINKS = NAV_LINKS.slice(5);

function MoreMenu({ onLight }: Readonly<{ onLight: boolean }>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const triggerCls = onLight
    ? "text-ink-muted hover:text-green"
    : "text-cream/85 hover:bg-cream/10 hover:text-cream";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-sm font-medium tracking-tight transition-colors ${triggerCls}`}
      >
        More
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-sand bg-cream p-2 text-ink shadow-[var(--shadow-lift)]">
          {MORE_LINKS.map((l) => (
            <Link key={l.to} to={l.to} role="menuitem" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-paper">
              <span className="block text-sm font-semibold text-ink">{l.label}</span>
              <span className="block text-xs leading-snug text-ink-muted">{l.note}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Multi-page nav. Transparent over the dark page-hero/landing; settles into a
 * solid bar once the visitor scrolls. Six top-level entries: five sections and
 * a "More" menu for the rest — the track itself is one pill.
 */
export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onLight = scrolled || open;
  const linkCls = (active: boolean) => {
    const base = "relative isolate inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-medium tracking-tight transition-colors";
    if (onLight) return `${base} ${active ? "text-cream" : "text-ink-muted hover:text-green"}`;
    return `${base} ${active ? "font-semibold text-green-900" : "text-cream/85 hover:bg-cream/10 hover:text-cream"}`;
  };
  const trackCls = onLight
    ? "hidden items-center gap-0.5 rounded-full border border-gold-border/20 bg-cream/70 p-1 lg:flex"
    : "hidden items-center gap-0.5 rounded-full border border-cream/15 bg-cream/[0.06] p-1 lg:flex";

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        onLight ? "border-b border-gold-border/15 bg-paper/90 backdrop-blur shadow-[var(--shadow-card)]" : "border-b border-transparent bg-transparent"
      }`}
    >
      <nav aria-label="Primary" className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-6">
        <Link to="/" aria-label="Oguaa — home" onClick={() => setOpen(false)}>
          <Wordmark tone={onLight ? "text-ink" : "text-cream"} markTone="text-gold" size="text-2xl" />
        </Link>

        <div className={trackCls}>
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className={({ isActive }) => linkCls(isActive)}>
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-active-pill"
                      className={`absolute inset-0 -z-10 rounded-full ${onLight ? "bg-green" : "bg-gold-brand"}`}
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      aria-hidden
                    />
                  )}
                  {link.label}
                </>
              )}
            </NavLink>
          ))}
          <MoreMenu onLight={onLight} />
        </div>

        <div className="hidden lg:block">
          <Cta href={PORTAL_APP_URL} external variant={onLight ? "primary" : "outline-dark"}>Open the app</Cta>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors lg:hidden ${
            onLight ? "border-gold-border/25 text-ink hover:bg-cream" : "border-cream/25 text-cream hover:bg-cream/10"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" className="h-5 w-5" aria-hidden>
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </nav>

      {/* Scrollable on short viewports: the header is sticky, so without a
          max-height the CTA at the bottom would be unreachable on small phones. */}
      {open && (
        <div className="max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-t border-gold-border/15 bg-paper/95 backdrop-blur lg:hidden">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="mx-auto w-full max-w-6xl px-5 pb-8 pt-6 sm:px-6"
          >
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-gold-text">Explore Cape Coast</p>
            <motion.ul
              className="mt-4 flex flex-col gap-2"
              variants={{ show: { transition: { staggerChildren: 0.045 } } }}
              initial="hidden"
              animate="show"
            >
              {NAV_LINKS.map((link) => (
                <motion.li key={link.to} variants={{ hidden: { opacity: 0, x: -12 }, show: { opacity: 1, x: 0 } }}>
                  <NavLink to={link.to} onClick={() => setOpen(false)}>
                    {({ isActive }) => (
                      <span className={`group flex items-center gap-4 rounded-2xl border px-4 py-3.5 transition-colors ${
                        isActive
                          ? "border-green/40 bg-green/[0.07]"
                          : "border-sand/70 bg-cream hover:border-gold-border"
                      }`}>
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          isActive ? "bg-green text-cream" : "bg-green/[0.08] text-green"
                        }`}>
                          <MenuIcon id={link.icon} className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.95rem] font-semibold text-ink">{link.label}</span>
                          <span className="block truncate text-xs text-ink-muted">{link.note}</span>
                        </span>
                        <span className={`shrink-0 transition-transform group-hover:translate-x-0.5 ${isActive ? "text-green" : "text-ink-faint group-hover:text-green"}`} aria-hidden>→</span>
                      </span>
                    )}
                  </NavLink>
                </motion.li>
              ))}
            </motion.ul>
            <Cta href={PORTAL_APP_URL} external variant="primary" className="mt-6 w-full">Open the app</Cta>
            <p className="mt-4 text-center text-xs italic text-ink-faint">Yɛn ara asaase ni — this is our own land.</p>
          </motion.div>
        </div>
      )}
    </header>
  );
}
