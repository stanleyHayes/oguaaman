import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { motion } from "motion/react";
import { Wordmark } from "@/components/wordmark";
import { CTA as Cta } from "@/components/ui";
import { PORTAL_APP_URL } from "@/config";

const LINKS = [
  { to: "/history", label: "History" },
  { to: "/culture", label: "Culture" },
  { to: "/festivals", label: "Festivals" },
  { to: "/education", label: "Education" },
  { to: "/visit", label: "Visit" },
] as const;

const MORE_LINKS = [
  { to: "/leadership", label: "Leadership", note: "The Omanhene and the Traditional Council." },
  { to: "/news", label: "News", note: "Notices and stories from Cape Coast." },
] as const;

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

      {open && (
        <div className="border-t border-gold-border/15 bg-paper/95 backdrop-blur lg:hidden">
          <div className="mx-auto w-full max-w-6xl px-5 py-5 sm:px-6">
            <ul className="flex flex-col gap-1">
              {[...LINKS, ...MORE_LINKS].map((link) => (
                <li key={link.to}>
                  <Link to={link.to} onClick={() => setOpen(false)} className="block rounded-[var(--radius-card)] px-3 py-3 text-base font-medium text-ink transition-colors hover:bg-cream">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <Cta href={PORTAL_APP_URL} external variant="primary" className="mt-4 w-full">Open the app</Cta>
          </div>
        </div>
      )}
    </header>
  );
}
