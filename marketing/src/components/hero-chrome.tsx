import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { SectionIcon } from "./section-icon";
import type { Crumb } from "@/lib/breadcrumbs";

// Shared banner chrome for the marketing PageHero: a route-derived breadcrumb
// trail, a mount-animated section icon, and a large faint corner watermark.
// Mirrors the portal frontend's hero-chrome; route derivation lives in
// lib/breadcrumbs.ts so this file stays components-only (React Fast Refresh).
// The marketing page banner is always a dark green band, so `onDark` defaults on.

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 opacity-50">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** Home / Section / Page trail. Adapts colours to a dark or cream banner. */
export function Breadcrumbs({ crumbs, onDark = true, className = "" }: Readonly<{ crumbs: Crumb[]; onDark?: boolean; className?: string }>) {
  const base = onDark ? "text-cream/70" : "text-ink-faint";
  const linkHover = onDark ? "hover:text-gold" : "hover:text-gold-text";
  const current = onDark ? "text-cream" : "text-ink-muted";
  return (
    <nav aria-label="Breadcrumb" className={`text-xs sm:text-[0.8rem] ${className}`}>
      <ol className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 ${base}`}>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-x-1.5">
              {i > 0 && <Chevron />}
              {c.to && !last ? (
                <Link to={c.to} className={`transition-colors ${linkHover}`}>{c.label}</Link>
              ) : (
                <span className={last ? `font-medium ${current}` : undefined} aria-current={last ? "page" : undefined}>
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Section icon in a rounded gold-tinted tile: scales in on mount, then floats
 *  gently. Both animations honour prefers-reduced-motion. */
export function HeroIcon({ sectionId, onDark = true, className = "" }: Readonly<{ sectionId: string; onDark?: boolean; className?: string }>) {
  const reduce = useReducedMotion();
  const tile = onDark
    ? "border-gold/40 bg-gold/15 text-gold"
    : "border-gold-border/40 bg-gold/[0.12] text-gold-text";
  return (
    <motion.span
      className={`inline-flex items-center justify-center rounded-2xl border p-3 shadow-sm ${tile} ${className}`}
      initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ duration: 0.55, ease: EASE_OUT }}
    >
      <motion.span
        className="inline-flex"
        animate={reduce ? undefined : { y: [0, -5, 0] }}
        transition={reduce ? undefined : { duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <SectionIcon id={sectionId} className="h-6 w-6 sm:h-7 sm:w-7" />
      </motion.span>
    </motion.span>
  );
}

/** Large, faint section glyph anchored to the banner's bottom-right corner.
 *  Requires an `overflow-hidden` positioned ancestor so it never overflows. */
export function HeroWatermark({ sectionId, onDark = true }: Readonly<{ sectionId: string; onDark?: boolean }>) {
  const color = onDark ? "text-gold" : "text-gold-text";
  const opacity = onDark ? "opacity-[0.09]" : "opacity-[0.06]";
  return (
    <div aria-hidden className={`pointer-events-none absolute -bottom-8 -right-6 ${color} ${opacity}`}>
      <SectionIcon id={sectionId} className="h-56 w-56 sm:h-72 sm:w-72" />
    </div>
  );
}
