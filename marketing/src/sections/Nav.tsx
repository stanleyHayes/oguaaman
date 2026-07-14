import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Wordmark } from "@/components/wordmark";
import { CTA } from "@/components/ui";
import { PORTAL_APP_URL } from "@/config";

const LINKS = [
  { to: "/history", label: "History" },
  { to: "/culture", label: "Culture" },
  { to: "/festivals", label: "Festivals" },
  { to: "/education", label: "Education" },
  { to: "/visit", label: "Visit" },
  { to: "/leadership", label: "Leadership" },
  { to: "/news", label: "News" },
] as const;

/**
 * Multi-page nav. Transparent over the dark page-hero/landing; settles into a
 * solid bar once the visitor scrolls. Links route to dedicated pages.
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
  const linkCls = (active: boolean) =>
    `text-sm font-medium tracking-tight transition-colors ${
      onLight
        ? active ? "text-green" : "text-ink-muted hover:text-green"
        : active ? "text-gold" : "text-cream/85 hover:text-gold"
    }`;

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

        <ul className="hidden items-center gap-5 lg:flex">
          {LINKS.map((link) => (
            <li key={link.to}>
              <NavLink to={link.to} className={({ isActive }) => linkCls(isActive)}>{link.label}</NavLink>
            </li>
          ))}
        </ul>

        <div className="hidden lg:block">
          <CTA href={PORTAL_APP_URL} external variant={onLight ? "primary" : "outline-dark"}>Open the app</CTA>
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
              {LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} onClick={() => setOpen(false)} className="block rounded-[var(--radius-card)] px-3 py-3 text-base font-medium text-ink transition-colors hover:bg-cream">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <CTA href={PORTAL_APP_URL} external variant="primary" className="mt-4 w-full">Open the app</CTA>
          </div>
        </div>
      )}
    </header>
  );
}
