import { Link, useLocation } from "react-router-dom";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Wordmark } from "./wordmark";
import { NotificationsBell } from "./notifications-bell";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";
import { Avatar } from "./ui";
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
      className={`relative inline-flex h-11 w-11 items-center justify-center gap-2 rounded-full text-sm transition-colors xl:w-auto xl:px-3 ${active ? "bg-cream/15 text-gold" : "text-cream/85 hover:bg-cream/10 hover:text-cream"}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 10.5v3A1.5 1.5 0 0 0 4.5 15H7l8 4.5v-15L7 9H4.5A1.5 1.5 0 0 0 3 10.5z" />
        <path d="M18.5 8.5a4.5 4.5 0 0 1 0 7" />
        <path d="M7 15v3.2A1.8 1.8 0 0 0 8.8 20h.4A1.8 1.8 0 0 0 11 18.2V16.6" />
      </svg>
      <span className="hidden font-medium xl:inline">Alerts</span>
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
const CITY = ["education", "business", "youth", "community", "diaspora"].map((id) => byId[id]).filter(Boolean);

// Time-sensitive postings get their own group; the section entries below are
// not in SECTIONS, so they carry a minimal NavSection-shaped literal.
const NOTICES: NavSection[] = [
  { id: "news", href: "/news", label: "News", tagline: "Notices and stories from Cape Coast.", tone: "gold", depth: "live" },
  { id: "events", href: "/events", label: "Events", tagline: "The town's calendar, anchored on Fetu Afahye.", tone: "gold", depth: "live" },
  { id: "safety", href: "/safety", label: "Safety", tagline: "Incidents, rescue & recovery.", tone: "maroon", depth: "live" },
  { id: "lostfound", href: "/lost-found", label: "Lost & Found", tagline: "Lost items, found items, missing people.", tone: "teal", depth: "live" },
];

function DrawerGroup({ heading, items, lang, onPick }: Readonly<{ heading: string; items: NavSection[]; lang: ReturnType<typeof useLang>["lang"]; onPick: () => void }>) {
  const { pathname } = useLocation();
  const groupActive = items.some((item) => pathname.startsWith(item.href));
  const [expanded, setExpanded] = useState(() => groupActive || heading === "Top picks");
  return (
    <motion.div variants={drawerItemVariants} className="mb-3 rounded-2xl border border-cream/10 bg-cream/[0.04] p-2">
      <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-2 text-left text-[0.64rem] font-bold uppercase tracking-[0.18em] text-gold/90 hover:bg-cream/[0.06]">
        <span className="inline-flex items-center gap-2">
          {heading}
          <span className="rounded-full bg-cream/10 px-1.5 py-0.5 text-[0.58rem] tracking-normal text-cream/55">{items.length}</span>
        </span>
        <Chevron open={expanded} />
      </button>
      {expanded && (
        <div className="grid gap-0.5 pt-1">
          {items.map((s) => {
            const active = pathname.startsWith(s.href);
            return (
              <Link key={s.id} to={s.href} onClick={onPick} aria-current={active ? "page" : undefined} className={`group flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors ${active ? "bg-cream/10" : "hover:bg-cream/10"}`}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cream/10 text-gold transition-colors group-hover:bg-gold-brand group-hover:text-green-900">
                  <SectionIcon id={s.id} className="h-[18px] w-[18px]" />
                </span>
                <span>
                  <span className="block text-sm font-semibold normal-case tracking-normal text-cream">
                    {sectionLabel(s, lang)}
                    {lang === "en" && s.fanteName && <span className="ml-2 italic text-gold">{s.fanteName}</span>}
                  </span>
                  <span className="block text-xs font-normal normal-case leading-snug tracking-normal text-cream/60">{s.tagline}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
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
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="true" className="rounded-full">
        {trigger(open)}
      </button>
      {open && (
        <div className={`theme-surface absolute ${align === "right" ? "right-0" : "left-0"} z-50 mt-2 ${width} overflow-hidden rounded-2xl border border-sand bg-paper p-1.5 text-ink shadow-[var(--shadow-lift)]`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function SectionMenuItem({ s, lang, onClick }: Readonly<{ s: NavSection; lang: ReturnType<typeof useLang>["lang"]; onClick: () => void }>) {
  const t = TONES[s.tone];
  const { pathname } = useLocation();
  const active = pathname.startsWith(s.href);
  return (
    <Link to={s.href} onClick={onClick} aria-current={active ? "page" : undefined} className={`group relative flex items-start gap-3 overflow-hidden rounded-lg px-3 py-2.5 transition-colors ${active ? "bg-paper" : "hover:bg-paper"}`}>
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
  `relative inline-flex h-11 items-center gap-1 whitespace-nowrap rounded-xl px-3 text-[0.92rem] transition-colors ${
    active ? "font-semibold text-gold" : "text-cream/80 hover:bg-cream/[0.07] hover:text-cream"
  }`;

// "Build a better Oguaa" — the flagship civic entry. Kept visually distinct from
// the neutral pills (a persistent gold accent ring) so it reads as special, and
// deliberately NOT sharing the `nav-pill` layoutId so its active state never
// competes with the other pills for the single sliding gold background.
const betterNavPill = (active: boolean) =>
  `relative inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-[0.92rem] font-semibold transition-colors ${
    active
      ? "bg-gold-brand text-green-900"
      : "text-gold ring-1 ring-inset ring-gold/35 hover:bg-gold/10 hover:ring-gold/70"
  }`;

/** Pill label + the shared-layout gold background that slides between active entries. */
function PillLabel({ active, children }: Readonly<{ active: boolean; children: ReactNode }>) {
  return (
    <>
      {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gold-brand" aria-hidden />}
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
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={navPill(active || open)}><PillLabel active={active || open}>{label} <Chevron open={open} /></PillLabel></span>
      </button>
      {open && (
        <div className="theme-surface absolute left-0 z-50 mt-2 w-72 rounded-xl border border-sand bg-cream p-2 text-ink shadow-[var(--shadow-lift)]">
          {items.map((s) => <SectionMenuItem key={s.id} s={s} lang={lang} onClick={() => setOpen(false)} />)}
        </div>
      )}
    </div>
  );
}

/** Trigger content for the signed-in member dropdown. */
function MemberMenuTrigger({ open, initials, firstName, photoUrl }: Readonly<{ open: boolean; initials: string; firstName: string | undefined; photoUrl?: string }>) {
  return (
    <span className={`inline-flex h-9 items-center gap-2 rounded-full border py-0.5 pl-0.5 pr-2.5 text-sm transition-colors ${open ? "border-gold/45 bg-cream/10" : "border-cream/10 bg-cream/[0.04] hover:border-cream/20 hover:bg-cream/10"}`}>
      <Avatar initials={initials} photoUrl={photoUrl} size={30} className="!bg-gold/20 !text-gold ring-1 ring-cream/15" />
      <span className="max-w-[6.5rem] truncate font-semibold text-cream">{firstName}</span>
      <span className="text-cream/50"><Chevron open={open} /></span>
    </span>
  );
}

/** A compact culture link for the complementary desktop utility rail. */
function UtilityNavLink({ to, active, children }: Readonly<{ to: string; active: boolean; children: ReactNode }>) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={`relative inline-flex h-10 items-center px-3 text-xs font-semibold tracking-[0.02em] transition-colors ${
        active ? "text-gold" : "text-cream/65 hover:text-cream"
      }`}
    >
      {children}
      {active && <span className="absolute inset-x-3 bottom-0 h-px bg-gold" aria-hidden />}
    </Link>
  );
}

const DESKTOP_HEADER_QUERY = "(min-width: 1280px)";

function subscribeDesktopHeader(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const query = window.matchMedia(DESKTOP_HEADER_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getDesktopHeaderSnapshot() {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_HEADER_QUERY).matches;
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();
  const desktopHeader = useSyncExternalStore(subscribeDesktopHeader, getDesktopHeaderSnapshot, () => false);
  const { pathname } = useLocation();
  const { member, signOut } = useAuth();
  const { lang } = useLang();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const groupActive = (items: NavSection[]) => items.some((s) => isActive(s.href));
  const firstName = member?.displayName.split(/\s+/)[0];
  const initials = member ? member.displayName.split(/\s+/).slice(0, 2).map((w) => w[0]).join("") : "";
  const accountLabel = member?.verifiedAs
    ?? (member?.creatorTypes?.length
      ? "Creator account"
      : member?.role === "member"
        ? "Community member"
        : `${member?.role ?? "Member"} account`);
  const musicActive = isActive("/music");
  const festivalsActive = isActive("/festivals");
  const memoriamActive = isActive("/memoriam");
  const discoverActive = groupActive(DISCOVER);
  const betterActive = isActive("/better");
  const cityActive = groupActive(CITY);
  const noticesActive = groupActive(NOTICES);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const focusDrawerClose = window.requestAnimationFrame(() => drawerCloseRef.current?.focus());
    const handleDrawerKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        window.requestAnimationFrame(() => menuButtonRef.current?.focus());
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleDrawerKey);
    return () => {
      window.cancelAnimationFrame(focusDrawerClose);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleDrawerKey);
    };
  }, [open]);

  useEffect(() => {
    const desktopQuery = window.matchMedia(DESKTOP_HEADER_QUERY);
    const closeAtDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    desktopQuery.addEventListener("change", closeAtDesktop);
    return () => desktopQuery.removeEventListener("change", closeAtDesktop);
  }, []);

  function closeDrawerAndReturnFocus() {
    setOpen(false);
    window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  }

  const utilityControls = (
    <div role="group" aria-label="Site utilities" className="flex h-10 items-center gap-0.5 xl:gap-1">
      <LanguageSwitcher className="hidden xl:block" />
      <ThemeToggle className="hidden text-cream/85 hover:bg-cream/10 md:inline-flex" />

      {member ? (
        <>
          <NotificationsBell />
          <div className="hidden md:block">
            <Dropdown
              align="right"
              width="w-[17.5rem]"
              trigger={(o) => MemberMenuTrigger({ open: o, initials, firstName, photoUrl: member.photoUrl })}
            >
              {(close) => (
                <div className="p-1">
                  <div className="flex min-w-0 items-center gap-3 rounded-xl border border-sand bg-cream px-3 py-2.5">
                    <Avatar initials={initials} photoUrl={member.photoUrl} size={36} className="!bg-green !text-on-green ring-1 ring-green/10" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold leading-tight text-ink">{member.displayName}</p>
                      <p className="mt-0.5 truncate text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">{accountLabel}</p>
                    </div>
                  </div>

                  <nav aria-label="Account" className="mt-1 grid gap-0.5">
                    <Link to="/me#profile" onClick={close} className="group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-cream">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green/[0.08] text-green-text transition-colors group-hover:bg-green group-hover:text-on-green">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <circle cx="12" cy="8" r="3.5" /><path d="M5 20c.7-4 3-6 7-6s6.3 2 7 6" />
                        </svg>
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold leading-tight text-ink">Profile &amp; connections</span>
                        <span className="mt-0.5 block text-xs leading-tight text-ink-faint">Your public identity</span>
                      </span>
                    </Link>
                    <Link to="/me#activity" onClick={close} className="group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-cream">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/[0.12] text-gold-text transition-colors group-hover:bg-gold-brand group-hover:text-green-900">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M5 5.5h14v14H5z" /><path d="M8 9h8M8 12h8M8 15h5" />
                        </svg>
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold leading-tight text-ink">Your listings</span>
                        <span className="mt-0.5 block text-xs leading-tight text-ink-faint">Posts and contributions</span>
                      </span>
                    </Link>
                  </nav>

                  <div className="mt-1 border-t border-sand pt-1">
                    <button type="button" onClick={() => { close(); signOut(); }} className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-clay/[0.08]">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-clay/[0.08] text-clay-text">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" />
                        </svg>
                      </span>
                      <span className="text-sm font-semibold text-clay-text">Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </Dropdown>
          </div>
        </>
      ) : (
        <Link to="/signin" className="hidden h-9 items-center rounded-full border border-cream/25 px-3.5 text-sm font-semibold text-cream transition-colors hover:border-gold hover:bg-cream/[0.06] md:inline-flex">
          Sign in
        </Link>
      )}
    </div>
  );

  return (
    <header className={`on-dark on-dark-pin sticky top-0 border-b border-cream/10 bg-[#123f2d] text-cream ${pathname.startsWith("/map") ? "z-[1200]" : "z-40"}`}>
      <div className="hidden border-b border-cream/10 bg-[#0c2c1f] shadow-[inset_0_2px_0_rgba(199,162,74,0.55)] xl:block">
        <div className="mx-auto flex h-10 w-full max-w-7xl items-center justify-between px-4">
          <nav aria-label="Culture highlights" className="flex h-10 items-center">
            <span className="mr-2 text-[0.62rem] font-bold uppercase tracking-[0.2em] text-gold/75">Oguaa life</span>
            <span className="h-3.5 w-px bg-cream/15" aria-hidden />
            <UtilityNavLink to="/music" active={musicActive}>{sectionLabel(byId.music, lang)}</UtilityNavLink>
            <UtilityNavLink to="/festivals" active={festivalsActive}>{sectionLabel(byId.festivals, lang)}</UtilityNavLink>
            <UtilityNavLink to="/memoriam" active={memoriamActive}>{sectionLabel(byId.memoriam, lang)}</UtilityNavLink>
          </nav>
          {desktopHeader && utilityControls}
        </div>
      </div>

      <div className="relative mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-3 sm:h-16 sm:px-4">
        <Link to="/" aria-label="Oguaa — home" onClick={() => setOpen(false)} className="shrink-0">
          <Wordmark />
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-0.5 xl:flex">
          <Link to="/better" aria-label="Build a better Oguaa" aria-current={betterActive ? "page" : undefined} className={betterNavPill(betterActive)}>
            <SectionIcon id="better" className="h-3.5 w-3.5" />
            <span>Better Oguaa</span>
          </Link>
          <NavDropdown label="Discover" active={discoverActive} items={DISCOVER} lang={lang} />
          <NavDropdown label="City" active={cityActive} items={CITY} lang={lang} />
          <NavDropdown label="Notices" active={noticesActive} items={NOTICES} lang={lang} />
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          {!desktopHeader && utilityControls}

          <Link to="/search" aria-label="Search Oguaa" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-cream/85 transition-colors hover:bg-cream/10 hover:text-cream">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
            </svg>
          </Link>
          <AlertsNavLink />

          <Link to="/submit" className="hidden h-11 items-center rounded-full bg-gold-brand px-5 text-sm font-bold text-green-900 shadow-[0_6px_18px_rgba(12,44,31,0.2)] transition-all hover:-translate-y-0.5 hover:bg-gold sm:inline-flex">
            Contribute
          </Link>

          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-cream/10 xl:hidden"
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
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
              className="fixed inset-0 z-40 bg-green-950/80 backdrop-blur-sm xl:hidden"
              onClick={closeDrawerAndReturnFocus}
              aria-hidden
            />
            <motion.div
              id="mobile-navigation"
              ref={drawerRef}
              key="mobile-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 280, damping: 30 }}
              role="dialog"
              aria-modal="true"
              aria-label="Site navigation"
              className="on-dark on-dark-pin fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-green-900 shadow-2xl sm:w-[88vw] sm:max-w-md xl:hidden"
            >
              <div className="bg-dotgrid absolute inset-0 opacity-40" aria-hidden />
              <div className="relative flex h-16 shrink-0 items-center justify-between border-b border-cream/10 px-5">
                <Link to="/" onClick={closeDrawerAndReturnFocus} className="text-cream">
                  <Wordmark />
                </Link>
                <button
                  ref={drawerCloseRef}
                  type="button"
                  onClick={closeDrawerAndReturnFocus}
                  aria-label="Close menu"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full text-cream hover:bg-cream/10"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <motion.nav
                aria-label="Mobile navigation"
                initial={reduceMotion ? "visible" : "hidden"}
                animate="visible"
                exit="hidden"
                variants={{ visible: { transition: { staggerChildren: 0.04, delayChildren: 0.08 } }, hidden: {} }}
                className="relative flex-1 overflow-y-auto px-5 py-5"
              >
                {/* Flagship civic entry — front and centre, above the groups. */}
                <motion.div variants={drawerItemVariants} className="mb-4">
                  <Link
                    to="/better"
                    onClick={closeDrawerAndReturnFocus}
                    className="group flex items-center gap-3 rounded-2xl border border-gold-brand/50 bg-gold-brand/[0.12] p-3.5 transition-colors hover:bg-gold-brand/20"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-brand text-green-900">
                      <SectionIcon id="better" className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-cream">Build a better Oguaa</span>
                      <span className="block text-xs leading-snug text-cream/70">The civic revolution — the town&apos;s code.</span>
                    </span>
                  </Link>
                </motion.div>
                <DrawerGroup
                  heading="Top picks"
                  items={[byId.music, byId.festivals, byId.memoriam].filter(Boolean)}
                  lang={lang}
                  onPick={closeDrawerAndReturnFocus}
                />
                <DrawerGroup heading="Discover" items={DISCOVER} lang={lang} onPick={closeDrawerAndReturnFocus} />
                <DrawerGroup heading="City" items={CITY} lang={lang} onPick={closeDrawerAndReturnFocus} />
                <DrawerGroup heading="Notices" items={NOTICES} lang={lang} onPick={closeDrawerAndReturnFocus} />

                <motion.div variants={drawerItemVariants} className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-cream/10 bg-cream/[0.04] p-3">
                  <div>
                    <p className="mb-1.5 px-1 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-gold/90">Language</p>
                    <LanguageSwitcher placement="up" align="left" />
                  </div>
                  <div className="flex flex-col items-center">
                    <p className="mb-1.5 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-gold/90">Theme</p>
                    <ThemeToggle className="text-cream/85 hover:bg-cream/10" />
                  </div>
                </motion.div>
              </motion.nav>
              <motion.div
                initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ delay: reduceMotion ? 0 : 0.15, duration: reduceMotion ? 0 : 0.25 }}
                className="relative border-t border-cream/10 p-5"
              >
                <div className="grid gap-2">
                  <Link to="/submit" onClick={closeDrawerAndReturnFocus} className="rounded-full bg-gold-brand py-3 text-center text-sm font-semibold text-green-900">
                    Contribute
                  </Link>
                  {member ? (
                    <Link to="/me#profile" onClick={closeDrawerAndReturnFocus} className="rounded-full border border-cream/25 py-3 text-center text-sm font-semibold text-cream">
                      {firstName}
                    </Link>
                  ) : (
                    <Link to="/signin" onClick={closeDrawerAndReturnFocus} className="rounded-full border border-cream/25 py-3 text-center text-sm font-semibold text-cream">
                      Sign in
                    </Link>
                  )}
                  {member && (
                    <button type="button" onClick={() => { closeDrawerAndReturnFocus(); signOut(); }} className="rounded-full border border-cream/25 py-3 text-center text-sm font-semibold text-cream/85">
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
