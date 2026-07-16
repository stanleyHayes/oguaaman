import type { Directive, DirectiveKind, DirectiveSeverity } from "./types";

// Shared labels, palette & helpers for the alerts (directive) experience.
// Severity colours mirror the incident SEVERITY_CLASS: critical=maroon,
// high=clay, medium=gold, low=teal — all dark-theme-safe (*-text foregrounds).

export const DIRECTIVE_KIND_LABEL: Record<DirectiveKind, string> = {
  advisory: "Advisory",
  directive: "Directive",
  emergency: "Emergency",
};

export const SEVERITY_LABEL: Record<DirectiveSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Most-severe first — client-side fallback ordering (server already sorts). */
export const SEVERITY_RANK: Record<DirectiveSeverity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

/** Badge classes per severity — mirrors incidents SEVERITY_CLASS (dark-safe). */
export const DIRECTIVE_SEVERITY_CLASS: Record<DirectiveSeverity, string> = {
  critical: "border-maroon-900/40 bg-maroon-900/[0.08] text-maroon-text",
  high: "border-clay/30 bg-clay/[0.08] text-clay-text",
  medium: "border-gold-border/40 bg-gold/[0.12] text-gold-text",
  low: "border-teal/30 bg-teal/[0.09] text-teal-text",
};

/** Richer per-severity styling for the alert banner: tinted surface, ring,
 *  solid accent rail, colored heading text and a matching pill. */
export interface AlertStyle {
  wrap: string;   // banner card background + border
  ring: string;   // inset emphasis ring colour
  rail: string;   // solid accent rail on the leading edge
  accent: string; // colored foreground token (headings, countdown)
  badge: string;  // severity/kind pill
}

export const ALERT_STYLE: Record<DirectiveSeverity, AlertStyle> = {
  critical: {
    wrap: "border-maroon-900/45 bg-maroon-900/[0.12]",
    ring: "ring-maroon-900/50",
    rail: "bg-maroon-900",
    accent: "text-maroon-text",
    badge: "border-maroon-900/40 bg-maroon-900/15 text-maroon-text",
  },
  high: {
    wrap: "border-clay/40 bg-clay/[0.11]",
    ring: "ring-clay/45",
    rail: "bg-clay",
    accent: "text-clay-text",
    badge: "border-clay/30 bg-clay/15 text-clay-text",
  },
  medium: {
    wrap: "border-gold-border/45 bg-gold/[0.14]",
    ring: "ring-gold/40",
    rail: "bg-gold-brand",
    accent: "text-gold-text",
    badge: "border-gold-border/40 bg-gold/[0.14] text-gold-text",
  },
  low: {
    wrap: "border-teal/40 bg-teal/[0.10]",
    ring: "ring-teal/40",
    rail: "bg-teal",
    accent: "text-teal-text",
    badge: "border-teal/30 bg-teal/[0.12] text-teal-text",
  },
};

/**
 * Whether a directive is currently in effect at `nowMs`. The server already
 * filters when active=true, but we re-check client-side so a directive that
 * crosses its effectiveUntil between polls drops out immediately (its 1s
 * countdown never lingers past zero).
 */
export function isLive(d: Directive, nowMs: number): boolean {
  if (d.status !== "active") return false;
  const from = Date.parse(d.effectiveFrom);
  if (!Number.isNaN(from) && nowMs < from) return false;
  if (d.effectiveUntil) {
    const until = Date.parse(d.effectiveUntil);
    if (!Number.isNaN(until) && nowMs > until) return false;
  }
  return true;
}

/** Live countdown to effectiveUntil, e.g. "clears in 1h 12m". */
export function countdown(untilMs: number, nowMs: number): string {
  const diff = untilMs - nowMs;
  if (diff <= 0) return "clearing now";
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `clears in ${h}h ${m}m`;
  if (m > 0) return `clears in ${m}m ${s}s`;
  return `clears in ${s}s`;
}
