import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

/**
 * KPI metric card — a faithful port of RentOS's `DashboardMetricCard`
 * (client/src/components/dashboard/DashboardPrimitives.tsx), re-tinted to the
 * admin "Castle, Canopy, Canoe" palette. Anatomy: 3px accent left border over
 * a diagonal accent tint, rounded-xl icon chip, oversized watermark of the same
 * icon bottom-right, bold value with a small muted label beneath, and an
 * arrow that brightens on hover. Hover lift/tilt lives in `.metric-card` (index.css).
 */

export type MetricTone = "green" | "teal" | "gold" | "clay" | "maroon" | "ink";

const TONE_ACCENT: Record<MetricTone, string> = {
  green: "#123f2d",
  teal: "#0e7c6b",
  gold: "#b07d32",
  clay: "#b0503c",
  maroon: "#7c2d2d",
  ink: "#3b473d",
};

interface MetricCardProps {
  label: string;
  value: string | number;
  /** Lucide icon element, e.g. `<Users size={18} />`. */
  icon: ReactNode;
  tone?: MetricTone;
  /** Optional extra line under the label, drawn in the accent color. */
  sub?: string;
  /** When set, the whole card links there. */
  to?: string;
}

export function MetricCard({ label, value, icon, tone = "green", sub, to }: Readonly<MetricCardProps>) {
  const accent = TONE_ACCENT[tone];
  const watermark = isValidElement(icon)
    ? cloneElement(icon as ReactElement<{ size?: number; strokeWidth?: number }>, { size: 72, strokeWidth: 1.15 })
    : null;

  const card = (
    <div
      className="metric-card group relative h-full overflow-hidden rounded-2xl border border-sand p-4"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: accent,
        background: `linear-gradient(135deg, ${accent}12, var(--color-cream) 58%)`,
      }}
    >
      {watermark && (
        <span aria-hidden className="pointer-events-none absolute -bottom-3 -right-3 select-none opacity-[0.07]" style={{ color: accent }}>
          {watermark}
        </span>
      )}
      <div className="relative">
        <div className="mb-3 flex items-start justify-between">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105"
            style={{ backgroundColor: `${accent}18`, color: accent }}
          >
            {icon}
          </div>
          <ArrowUpRight size={14} className="shrink-0 text-ink-faint/40 transition-colors group-hover:text-ink" />
        </div>
        <p className="truncate text-xl font-extrabold text-ink">{value}</p>
        <p className="mt-0.5 truncate text-[11px] text-ink-faint">{label}</p>
        {sub && <p className="mt-1 truncate text-[10px] font-semibold" style={{ color: accent }}>{sub}</p>}
      </div>
    </div>
  );

  // `block h-full` is load-bearing: an inline <a> wrapping block content
  // fragments its box and the card chrome collapses into a thin strip.
  if (!to) return card;
  return <Link to={to} className="block h-full">{card}</Link>;
}
