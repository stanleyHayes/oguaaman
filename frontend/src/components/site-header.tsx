import { Link, useLocation } from "react-router-dom";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Wordmark } from "./wordmark";
import { NotificationsBell } from "./notifications-bell";
import { LanguageSwitcher } from "./language-switcher";
import { SECTIONS, TONES, type NavSection } from "@/lib/sections";
import { useAuth } from "@/lib/auth";
import { useLang, sectionLabel } from "@/lib/i18n";
import { SectionIcon } from "./section-icon";

const byId = Object.fromEntries(SECTIONS.map((s) => [s.id, s])) as Record<string, NavSection>;
const DISCOVER = ["heritage", "culture", "people", "visit"].map((id) => byId[id]).filter(Boolean);
const CITY = ["education", "business", "youth", "community"].map((id) => byId[id]).filter(Boolean);

// Time-sensitive postings get their own group; the section entries below are
// not in SECTIONS, so they carry a minimal NavSection-shaped literal.
const NOTICES: NavSection[] = [
  { id: "news", href: "/news", label: "News", tagline: "Notices and stories from Cape Coast.", tone: "gold", depth: "live" },
  { id: "events", href: "/events", label: "Events", tagline: "The town's calendar, anchored on Fetu Afahye.", tone: "gold", depth: "live" },
  { id: "safety", href: "/safety", label: "Safety", tagline: "Incidents, rescue & recovery.", tone: "maroon", depth: "live" },
  { id: "lostfound", href: "/lost-found", label: "Lost & Found", tagline: "Lost items, found items, missing people.", tone: "teal", depth: "live" },
];

function DrawerGroup({ heading, items, lang, onPick }: Readonly<{ heading: string; items: NavSection[]; lang: ReturnType<typeof useLang>["lang"]; onPick: () => void }>) {
  return (
    <div className="mb-3">
      <p className="px-3 pb-1 text-[0.66rem] font-bold uppercase tracking-[0.18em] text-cream/45">{heading}</p>
      <div className="grid gap-1">
        {items.map((s) => (
          <Link key={s.id} to={s.href} onClick={onPick} className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-cream/5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cream/10 text-gold">
              <SectionIcon id={s.id} className="h-[18px] w-[18px]" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-cream">
                {sectionLabel(s, lang)}
                {lang === "en" && s.fanteName && <span className="ml-2 font-display italic text-gold">{s.fanteName}</span>}
              </span>
              <span className="block text-xs text-cream/60">{s.tagline}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Chevron({ open }: Readonly<{ open: boolean }>) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** Closes on outside click or Escape while open. Shared by all dropdowns. */
function useDismiss(open: boolean, close: () => void, ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open, close, ref]);
}

/** A click-/escape-dismissed dropdown. `align` controls panel side. */
function Dropdown({
  trigger,
  children,
  align = "left",
  width = "w-72",
}: Readonly<{
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: string;
}>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        {trigger(open)}
      </button>
      {open && (
        <div className={`absolute ${align === "right" ? "right-0" : "left-0"} z-50 mt-2 ${width} rounded-xl border border-sand bg-cream p-2 text-ink shadow-[var(--shadow-lift)]`} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function SectionMenuItem({ s, lang, onClick }: Readonly<{ s: NavSection; lang: ReturnType<typeof useLang>["lang"]; onClick: () => void }>) {
  const t = TONES[s.tone];
  return (
    <Link to={s.href} onClick={onClick} role="menuitem" className="group relative flex items-start gap-3 overflow-hidden rounded-lg px-3 py-2.5 transition-colors hover:bg-paper">
      <SectionIcon id={s.id} className={`pointer-events-none absolute -bottom-3 -right-2 h-14 w-14 opacity-[0.06] transition-opacity group-hover:opacity-[0.11] ${t.text}`} />
      <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.soft} ${t.text}`}>
        <SectionIcon id={s.id} className="h-[18px] w-[18px]" />
      </span>
      <span className="relative">
        <span className="block text-sm font-semibold text-ink">
          {sectionLabel(s, lang)}
          {lang === "en" && s.fanteName && <span className="ml-2 font-display italic text-gold-text">{s.fanteName}</span>}
        </span>
        <span className="block text-xs leading-snug text-ink-muted">{s.tagline}</span>
      </span>
    </Link>
  );
}

const navPill = (active: boolean) =>
  `inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
    active ? "bg-gold-brand font-semibold text-green-900" : "text-cream/85 hover:bg-cream/10 hover:text-cream"
  }`;

/** One grouped entry in the desktop pill nav: trigger + menu of sections. */
function NavDropdown({ label, active, items, lang }: Readonly<{ label: string; active: boolean; items: NavSection[]; lang: ReturnType<typeof useLang>["lang"] }>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        <span className={navPill(active || open)}>{label} <Chevron open={open} /></span>
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-2 w-72 rounded-xl border border-sand bg-cream p-2 text-ink shadow-[var(--shadow-lift)]" role="menu">
          {items.map((s) => <SectionMenuItem key={s.id} s={s} lang={lang} onClick={() => setOpen(false)} />)}
        </div>
      )}
    </div>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { member, signOut } = useAuth();
  const { lang } = useLang();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const groupActive = (items: NavSection[]) => items.some((s) => isActive(s.href));
  const firstName = member?.displayName.split(/\s+/)[0];
  const initials = member ? member.displayName.split(/\s+/).slice(0, 2).map((w) => w[0]).join("") : "";

  return (
    <header className="on-dark sticky top-0 z-40 border-b border-cream/10 bg-green text-cream">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/" aria-label="Oguaa — home" onClick={() => setOpen(false)} className="shrink-0">
          <Wordmark />
        </Link>

        {/* desktop nav — one pill track, six top-level entries max */}
        <nav className="hidden items-center gap-0.5 rounded-full border border-cream/15 bg-cream/[0.06] p-1 lg:flex">
          <Link to="/music" className={navPill(isActive("/music"))}>{sectionLabel(byId.music, lang)}</Link>
          <Link to="/festivals" className={navPill(isActive("/festivals"))}>{sectionLabel(byId.festivals, lang)}</Link>
          <NavDropdown label="Discover" active={groupActive(DISCOVER)} items={DISCOVER} lang={lang} />
          <NavDropdown label="City" active={groupActive(CITY)} items={CITY} lang={lang} />
          <NavDropdown label="Notices" active={groupActive(NOTICES)} items={NOTICES} lang={lang} />
          <Link to="/memoriam" className={navPill(isActive("/memoriam"))}>{sectionLabel(byId.memoriam, lang)}</Link>
        </nav>

        {/* right cluster */}
        <div className="flex items-center gap-2">
          <Link to="/search" aria-label="Search Oguaa" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-cream/85 transition-colors hover:bg-cream/10">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
            </svg>
          </Link>
          <LanguageSwitcher className="hidden lg:inline-flex" />

          {/* Contribute — the primary action, always present */}
          <Link to="/submit" className="hidden rounded-full bg-gold-brand px-4 py-1.5 text-sm font-semibold text-green-900 transition-colors hover:bg-gold sm:inline-flex">
            Contribute
          </Link>

          {member ? (
            <>
              <NotificationsBell />
              <div className="hidden sm:block">
                <Dropdown
                  align="right"
                  width="w-56"
                  trigger={(o) => (
                    <span className="inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 text-sm transition-colors hover:bg-cream/10">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold/20 text-xs font-bold text-gold">{initials}</span>
                      <span className="max-w-[7rem] truncate font-semibold text-gold">{firstName}</span>
                      <Chevron open={o} />
                    </span>
                  )}
                >
                  {(close) => (
                    <div role="none">
                      <Link to="/me" onClick={close} role="menuitem" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-paper">My profile &amp; connections</Link>
                      <Link to="/me" onClick={close} role="menuitem" className="block rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-paper">Your listings</Link>
                      <div className="my-1.5 h-px bg-sand" />
                      <button type="button" onClick={() => { close(); signOut(); }} role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-maroon-900 hover:bg-maroon-900/[0.06]">Sign out</button>
                    </div>
                  )}
                </Dropdown>
              </div>
            </>
          ) : (
            <Link to="/signin" className="hidden rounded-full border border-cream/30 px-4 py-1.5 text-sm font-semibold text-cream transition-colors hover:border-gold sm:inline-flex">
              Sign in
            </Link>
          )}

          {/* mobile menu toggle */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-cream/10 lg:hidden"
          >
            <span className="relative block h-4 w-5">
              <span className={`absolute left-0 block h-0.5 w-5 bg-cream transition-all ${open ? "top-2 rotate-45" : "top-0"}`} />
              <span className={`absolute left-0 top-2 block h-0.5 w-5 bg-cream transition-all ${open ? "opacity-0" : "opacity-100"}`} />
              <span className={`absolute left-0 block h-0.5 w-5 bg-cream transition-all ${open ? "top-2 -rotate-45" : "top-4"}`} />
            </span>
          </button>
        </div>
      </div>

      {/* mobile drawer — same groups as the desktop pill nav */}
      {open && (
        <div className="border-t border-cream/10 bg-green-900 lg:hidden">
          <nav className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6">
            <DrawerGroup
              heading="Top picks"
              items={[byId.music, byId.festivals, byId.memoriam].filter(Boolean)}
              lang={lang}
              onPick={() => setOpen(false)}
            />
            <DrawerGroup heading="Discover" items={DISCOVER} lang={lang} onPick={() => setOpen(false)} />
            <DrawerGroup heading="City" items={CITY} lang={lang} onPick={() => setOpen(false)} />
            <DrawerGroup heading="Notices" items={NOTICES} lang={lang} onPick={() => setOpen(false)} />

            <div className="mt-3 px-3"><LanguageSwitcher /></div>

            <div className="mt-3 flex gap-2 px-3">
              <Link to="/submit" onClick={() => setOpen(false)} className="flex-1 rounded-full bg-gold-brand py-2.5 text-center text-sm font-semibold text-green-900">
                Contribute
              </Link>
              {member ? (
                <Link to="/me" onClick={() => setOpen(false)} className="flex-1 rounded-full border border-cream/25 py-2.5 text-center text-sm font-semibold text-cream">
                  {firstName}
                </Link>
              ) : (
                <Link to="/signin" onClick={() => setOpen(false)} className="flex-1 rounded-full border border-cream/25 py-2.5 text-center text-sm font-semibold text-cream">
                  Sign in
                </Link>
              )}
            </div>
            {member && (
              <button type="button" onClick={() => { setOpen(false); signOut(); }} className="mx-3 mt-2 rounded-full border border-cream/25 py-2.5 text-center text-sm font-semibold text-cream/85">
                Sign out
              </button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
