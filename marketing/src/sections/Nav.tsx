import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { motion } from "motion/react";
import { Wordmark } from "@/components/wordmark";
import { PORTAL_APP_URL } from "@/config";
import { SectionIcon } from "@/components/section-icon";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * The headline call-to-action: a solid regalia-gold pill that stays prominent
 * over both the transparent-hero nav and the solid scrolled bar, in either
 * theme (gold on green-900 ink reads in light and dark). The arrow nudges on
 * hover; the glow lifts it off the bar. "Enter Oguaa" — step into the town.
 */
function EnterApp({ className = "" }: Readonly<{ className?: string }>) {
  return (
    <a
      href={PORTAL_APP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`group relative inline-flex items-center justify-center gap-2 rounded-full bg-gold-brand px-5 py-2.5 text-sm font-bold tracking-tight text-green-900 shadow-[0_8px_22px_-8px_rgba(176,125,50,0.8)] ring-1 ring-inset ring-gold/45 transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold hover:shadow-[0_12px_30px_-8px_rgba(176,125,50,0.95)] ${className}`}
    >
      <span>Enter Oguaa</span>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </a>
  );
}

// Per-item accent tone for the "More" dropdown rows — mirrors the portal's
// tone system (see frontend/src/lib/sections.ts) closely enough that the icon
// tile + corner watermark read the same way across both apps.
type Tone = "green" | "gold" | "maroon" | "teal";
const TONE: Record<Tone, { text: string; soft: string }> = {
  green: { text: "text-green", soft: "bg-green/[0.06]" },
  gold: { text: "text-gold-text", soft: "bg-gold/[0.12]" },
  maroon: { text: "text-maroon-900", soft: "bg-maroon-900/[0.07]" },
  teal: { text: "text-teal-text", soft: "bg-teal/[0.09]" },
};

interface NavItem { to: string; label: string; note: string; icon: string; tone: Tone }

/** Single source of truth for every top-level destination. */
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

const LINKS = NAV_LINKS.slice(0, 5);
const MORE_LINKS = NAV_LINKS.slice(5);

/** One rich row inside the "More" popover: icon tile + title + one-line note,
 *  with a large faint watermark of the same glyph in the bottom-right corner. */
function MoreMenuItem({ item, onClick }: Readonly<{ item: NavItem; onClick: () => void }>) {
  const t = TONE[item.tone];
  return (
    <Link
      to={item.to}
      onClick={onClick}
      className="group relative flex items-start gap-3 overflow-hidden rounded-lg px-3 py-2.5 transition-colors hover:bg-paper"
    >
      <SectionIcon id={item.icon} className={`pointer-events-none absolute -bottom-3 -right-2 h-14 w-14 opacity-[0.06] transition-opacity group-hover:opacity-[0.11] ${t.text}`} />
      <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.soft} ${t.text}`}>
        <SectionIcon id={item.icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="relative">
        <span className="block text-sm font-semibold text-ink">{item.label}</span>
        <span className="block text-xs leading-snug text-ink-muted">{item.note}</span>
      </span>
    </Link>
  );
}

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
        className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-sm font-medium tracking-tight transition-colors ${triggerCls}`}
      >
        More
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="theme-surface absolute right-0 z-50 mt-2 w-72 rounded-xl border border-sand bg-cream p-2 text-ink shadow-[var(--shadow-lift)]">
          {MORE_LINKS.map((l) => (
            <MoreMenuItem key={l.to} item={l} onClick={() => setOpen(false)} />
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
    // On the solid bar the active pill is bg-green with cream text; on-dark-pin
    // keeps that cream light in dark theme (the bar itself follows the theme).
    if (onLight) return `${base} ${active ? "text-cream on-dark-pin" : "text-ink-muted hover:text-green"}`;
    return `${base} ${active ? "font-semibold text-green-900" : "text-cream/85 hover:bg-cream/10 hover:text-cream"}`;
  };
  const trackCls = onLight
    ? "hidden items-center gap-0.5 rounded-full border border-gold-border/20 bg-cream/70 p-1 lg:flex"
    : "hidden items-center gap-0.5 rounded-full border border-cream/15 bg-cream/[0.06] p-1 lg:flex";

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        onLight ? "border-b border-gold-border/15 bg-paper/90 backdrop-blur shadow-[var(--shadow-card)]" : "on-dark-pin border-b border-transparent bg-transparent"
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

        <div className="hidden items-center gap-2 lg:flex">
          <NavLink
            to="/better"
            className={({ isActive }) =>
              `inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold tracking-tight transition-colors ${
                isActive
                  ? "border-gold-brand bg-gold-brand text-green-900"
                  : onLight
                    ? "border-gold-border/40 text-gold-text hover:bg-gold/10"
                    : "border-gold/45 text-gold hover:bg-gold/10 on-dark-pin"
              }`
            }
          >
            <SectionIcon id="better" className="h-4 w-4" />
            Better Oguaa
          </NavLink>
          <ThemeToggle className={onLight ? "border-gold-border/25 text-ink hover:bg-cream" : "border-cream/25 text-cream hover:bg-cream/10"} />
          <EnterApp />
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggle className={onLight ? "border-gold-border/25 text-ink hover:bg-cream" : "border-cream/25 text-cream hover:bg-cream/10"} />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav-panel"
            aria-label={open ? "Close menu" : "Open menu"}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${
              onLight ? "border-gold-border/25 text-ink hover:bg-cream" : "border-cream/25 text-cream hover:bg-cream/10"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" className="h-5 w-5" aria-hidden>
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </nav>

      {/* Scrollable on short viewports: the header is sticky, so without a
          max-height the CTA at the bottom would be unreachable on small phones. */}
      {open && (
        <div id="mobile-nav-panel" className="max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-t border-gold-border/15 bg-paper/95 backdrop-blur lg:hidden">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="mx-auto w-full max-w-6xl px-5 pb-8 pt-6 sm:px-6"
          >
            <Link
              to="/better"
              onClick={() => setOpen(false)}
              className="mb-5 flex items-center gap-4 rounded-2xl border border-gold-border/40 bg-gold/[0.08] px-4 py-3.5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-brand text-green-900">
                <SectionIcon id="better" className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.95rem] font-semibold text-ink">Build a better Oguaa</span>
                <span className="block truncate text-xs text-ink-muted">The town’s code — and a pledge.</span>
              </span>
              <span className="shrink-0 text-gold-text" aria-hidden>→</span>
            </Link>
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
                          isActive ? "bg-green text-cream on-dark-pin" : "bg-green/[0.08] text-green"
                        }`}>
                          <SectionIcon id={link.icon} className="h-5 w-5" />
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
            <EnterApp className="mt-6 w-full" />
            <p className="mt-4 text-center text-xs italic text-ink-faint">Yɛn ara asaase ni — this is our own land.</p>
          </motion.div>
        </div>
      )}
    </header>
  );
}
