import { Link, useLocation } from "react-router-dom";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Wordmark } from "./wordmark";
import { NotificationsBell } from "./notifications-bell";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";
import { LayoutPill } from "./motion";
import { SECTIONS, TONES, type NavSection } from "@/lib/sections";
import { useAuth } from "@/lib/auth";
import { useLang, sectionLabel } from "@/lib/i18n";
import { SectionIcon } from "./section-icon";
import { api } from "@/lib/api";

/**
 * The Alerts nav entry — a megaphone icon linking to /alerts, badged with the
 * count of active high/critical directives. Polls the public feed every 30s and
 * on window focus, mirroring the AlertBanner's cadence.
 */
function AlertsNavLink() {
  const { pathname } = useLocation();
  const [urgent, setUrgent] = useState(0);
  const active = pathname.startsWith("/alerts");

  useEffect(() => {
    let alive = true;
    const load = () => {
      api.directives(true)
        .then((list) => {
          if (alive) setUrgent(list.filter((d) => d.severity === "high" || d.severity === "critical").length);
        })
        .catch(() => {});
    };
    load();
    const id = window.setInterval(load, 30_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { alive = false; window.clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, []);

  return (
    <Link
      to="/alerts"
      aria-label={urgent > 0 ? `Alerts, ${urgent} urgent` : "Alerts"}
      className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors ${active ? "bg-cream/15 text-gold" : "text-cream/85 hover:bg-cream/10"}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 10.5v3A1.5 1.5 0 0 0 4.5 15H7l8 4.5v-15L7 9H4.5A1.5 1.5 0 0 0 3 10.5z" />
        <path d="M18.5 8.5a4.5 4.5 0 0 1 0 7" />
        <path d="M7 15v3.2A1.8 1.8 0 0 0 8.8 20h.4A1.8 1.8 0 0 0 11 18.2V16.6" />
      </svg>
      {urgent > 0 && (
        <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-maroon-900 px-1 text-[0.6rem] font-bold text-cream ring-1 ring-cream/30">
          {urgent > 9 ? "9+" : urgent}
        </span>
      )}
    </Link>
  );
}

const byId = Object.fromEntries(SECTIONS.map((s) => [s.id, s])) as Record<string, NavSection>;

// The interactive city map — not in SECTIONS, so it carries a minimal
// NavSection-shaped literal, appended to Discover (desktop dropdown + drawer).
const MAP_ENTRY: NavSection = {
  id: "map",
  href: "/map",
  label: "Explore Cape Coast",
  tagline: "The whole town on one map — heritage trails, markets, safety.",
  tone: "teal",
  depth: "live",
};

const DISCOVER = [...["heritage", "culture", "people", "visit"].map((id) => byId[id]).filter(Boolean), MAP_ENTRY];
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
    <motion.div variants={drawerItemVariants} className="mb-3 rounded-2xl border border-cream/10 bg-cream/[0.04] p-2">
      <p className="px-2 pb-1.5 pt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-gold/90">{heading}</p>
      <div className="grid gap-0.5">
        {items.map((s) => (
          <Link key={s.id} to={s.href} onClick={onPick} className="group flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-cream/10">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cream/10 text-gold transition-colors group-hover:bg-gold-brand group-hover:text-green-900">
              <SectionIcon id={s.id} className="h-[18px] w-[18px]" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-cream">
                {sectionLabel(s, lang)}
                {lang === "en" && s.fanteName && <span className="ml-2 italic text-gold">{s.fanteName}</span>}
              </span>
              <span className="block text-xs leading-snug text-cream/60">{s.tagline}</span>
            </span>
          </Link>
        ))}
      </div>
    </motion.div>
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
        <div className={`theme-surface absolute ${align === "right" ? "right-0" : "left-0"} z-50 mt-2 ${width} rounded-xl border border-sand bg-cream p-2 text-ink shadow-[var(--shadow-lift)]`} role="menu">
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
          {lang === "en" && s.fanteName && <span className="ml-2 italic text-gold-text">{s.fanteName}</span>}
        </span>
        <span className="block text-xs leading-snug text-ink-muted">{s.tagline}</span>
      </span>
    </Link>
  );
}

const navPill = (active: boolean) =>
  `relative inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors ${
    active ? "font-semibold text-green-900" : "text-cream/85 hover:bg-cream/10 hover:text-cream"
  }`;

/** Pill label + the shared-layout gold background that slides between active entries. */
function PillLabel({ active, children }: Readonly<{ active: boolean; children: ReactNode }>) {
  return (
    <>
      {active && <LayoutPill layoutId="nav-pill" className="absolute inset-0 rounded-full bg-gold-brand" />}
      <span className="relative inline-flex items-center gap-1">{children}</span>
    </>
  );
}

/** One grouped entry in the desktop pill nav: trigger + menu of sections. */
function NavDropdown({ label, active, items, lang }: Readonly<{ label: string; active: boolean; items: NavSection[]; lang: ReturnType<typeof useLang>["lang"] }>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        <span className={navPill(active || open)}><PillLabel active={active || open}>{label} <Chevron open={open} /></PillLabel></span>
      </button>
      {open && (
        <div className="theme-surface absolute left-0 z-50 mt-2 w-72 rounded-xl border border-sand bg-cream p-2 text-ink shadow-[var(--shadow-lift)]" role="menu">
          {items.map((s) => <SectionMenuItem key={s.id} s={s} lang={lang} onClick={() => setOpen(false)} />)}
        </div>
      )}
    </div>
  );
}

/** Trigger content for the signed-in member dropdown. */
function MemberMenuTrigger({ open, initials, firstName }: Readonly<{ open: boolean; initials: string; firstName: string | undefined }>) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 text-sm transition-colors hover:bg-cream/10">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold/20 text-xs font-bold text-gold">{initials}</span>
      <span className="max-w-[7rem] truncate font-semibold text-gold">{firstName}</span>
      <Chevron open={open} />
    </span>
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
  const musicActive = isActive("/music");
  const festivalsActive = isActive("/festivals");
  const memoriamActive = isActive("/memoriam");
  const discoverActive = groupActive(DISCOVER);
  const cityActive = groupActive(CITY);
  const noticesActive = groupActive(NOTICES);

  return (
    <header className="on-dark on-dark-pin sticky top-0 z-40 border-b border-cream/10 bg-green text-cream">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-3 sm:px-4">
        <Link to="/" aria-label="Oguaa — home" onClick={() => setOpen(false)} className="shrink-0">
          <Wordmark />
        </Link>

        {/* desktop nav — one pill track, six top-level entries max */}
        <nav className="hidden items-center gap-0.5 rounded-full border border-cream/15 bg-cream/[0.06] p-1 lg:flex">
          <Link to="/music" className={navPill(musicActive)}><PillLabel active={musicActive}>{sectionLabel(byId.music, lang)}</PillLabel></Link>
          <Link to="/festivals" className={navPill(festivalsActive)}><PillLabel active={festivalsActive}>{sectionLabel(byId.festivals, lang)}</PillLabel></Link>
          <NavDropdown label="Discover" active={discoverActive} items={DISCOVER} lang={lang} />
          <NavDropdown label="City" active={cityActive} items={CITY} lang={lang} />
          <NavDropdown label="Notices" active={noticesActive} items={NOTICES} lang={lang} />
          <Link to="/memoriam" className={navPill(memoriamActive)}><PillLabel active={memoriamActive}>{sectionLabel(byId.memoriam, lang)}</PillLabel></Link>
        </nav>

        {/* right cluster */}
        <div className="flex items-center gap-2">
          <Link to="/search" aria-label="Search Oguaa" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-cream/85 transition-colors hover:bg-cream/10">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
            </svg>
          </Link>
          <AlertsNavLink />
          <LanguageSwitcher className="hidden lg:inline-flex" />
          <ThemeToggle className="hidden text-cream/85 hover:bg-cream/10 sm:inline-flex" />

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
                  trigger={(o) => MemberMenuTrigger({ open: o, initials, firstName })}
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

      {/* mobile drawer — full-screen slide-in overlay */}
      <AnimatePresence initial={false}>
        {open && (
          <>
            <motion.div
              key="mobile-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-green-950/80 backdrop-blur-sm lg:hidden"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <motion.div
              key="mobile-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 280, damping: 30 }}
              className="on-dark on-dark-pin fixed inset-y-0 right-0 z-50 flex w-[88vw] max-w-sm flex-col bg-green-900 shadow-2xl lg:hidden"
            >
              <div className="bg-dotgrid absolute inset-0 opacity-40" aria-hidden />
              <div className="relative flex h-16 shrink-0 items-center justify-between border-b border-cream/10 px-5">
                <Link to="/" onClick={() => setOpen(false)} className="text-cream">
                  <Wordmark />
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-cream hover:bg-cream/10"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <motion.nav
                initial="hidden"
                animate="visible"
                exit="hidden"
                variants={{ visible: { transition: { staggerChildren: 0.04, delayChildren: 0.08 } }, hidden: {} }}
                className="relative flex-1 overflow-y-auto px-5 py-5"
              >
                <DrawerGroup
                  heading="Top picks"
                  items={[byId.music, byId.festivals, byId.memoriam].filter(Boolean)}
                  lang={lang}
                  onPick={() => setOpen(false)}
                />
                <DrawerGroup heading="Discover" items={DISCOVER} lang={lang} onPick={() => setOpen(false)} />
                <DrawerGroup heading="City" items={CITY} lang={lang} onPick={() => setOpen(false)} />
                <DrawerGroup heading="Notices" items={NOTICES} lang={lang} onPick={() => setOpen(false)} />

                <motion.div variants={drawerItemVariants} className="mt-5 px-1">
                  <LanguageSwitcher />
                </motion.div>
              </motion.nav>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ delay: 0.15, duration: 0.25 }}
                className="relative border-t border-cream/10 p-5"
              >
                <div className="grid gap-2">
                  <Link to="/submit" onClick={() => setOpen(false)} className="rounded-full bg-gold-brand py-3 text-center text-sm font-semibold text-green-900">
                    Contribute
                  </Link>
                  {member ? (
                    <Link to="/me" onClick={() => setOpen(false)} className="rounded-full border border-cream/25 py-3 text-center text-sm font-semibold text-cream">
                      {firstName}
                    </Link>
                  ) : (
                    <Link to="/signin" onClick={() => setOpen(false)} className="rounded-full border border-cream/25 py-3 text-center text-sm font-semibold text-cream">
                      Sign in
                    </Link>
                  )}
                  {member && (
                    <button type="button" onClick={() => { setOpen(false); signOut(); }} className="rounded-full border border-cream/25 py-3 text-center text-sm font-semibold text-cream/85">
                      Sign out
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}

const drawerItemVariants = {
  hidden: { opacity: 0, x: 12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const } },
};
