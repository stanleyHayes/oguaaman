import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ListingStatus } from "@/lib/types";

export function BackLink({ to, children }: Readonly<{ to: string; children: ReactNode }>) {
  return (
    <Link to={to} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-gold-text">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
      {children}
    </Link>
  );
}

/** A labelled key/value row for detail pages. */
export function KeyVal({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  if (children === undefined || children === null || children === "") return null;
  return (
    <div className="flex flex-col gap-0.5 border-b border-sand py-2.5 last:border-0 sm:flex-row sm:gap-4">
      <dt className="w-44 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

export function Card({ children, className = "" }: Readonly<{ children: ReactNode; className?: string }>) {
  return <div className={`rounded-[var(--radius-card)] border border-sand bg-cream ${className}`}>{children}</div>;
}

const STATUS_STYLE: Record<ListingStatus, string> = {
  approved: "bg-green/[0.1] text-green",
  pending: "bg-gold/[0.18] text-gold-text",
  rejected: "bg-maroon-900/[0.1] text-maroon-900",
  draft: "bg-sand text-ink-muted",
  unpublished: "bg-sand text-ink-muted",
};
export function StatusBadge({ status }: Readonly<{ status: ListingStatus }>) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[status]}`}>{status}</span>;
}

export function RoleBadge({ role }: Readonly<{ role: string }>) {
  const m: Record<string, string> = {
    steward: "bg-maroon-900/[0.1] text-maroon-900",
    curator: "bg-ai/[0.1] text-ai",
    editor: "bg-teal/[0.12] text-teal-text",
    member: "bg-sand text-ink-muted",
  };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${m[role] ?? m.member}`}>{role}</span>;
}

export function Pill({ children, tone = "neutral" }: Readonly<{ children: ReactNode; tone?: "neutral" | "green" | "gold" | "clay" }>) {
  const m: Record<string, string> = {
    neutral: "border-sand bg-paper text-ink-muted",
    green: "border-green/30 bg-green/[0.06] text-green",
    gold: "border-gold-border/40 bg-gold/[0.12] text-gold-text",
    clay: "border-clay/30 bg-clay/[0.08] text-clay-text",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${m[tone]}`}>{children}</span>;
}

export function PageHeader({ kicker, title, children }: Readonly<{ kicker: string; title: string; children?: ReactNode }>) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow text-ai">{kicker}</p>
        <h1 className="mt-1 text-3xl font-semibold">{title}</h1>
      </div>
      {children}
    </div>
  );
}

/** Icon names for the shared Empty state — inline stroke SVGs (Lucide-style paths). */
export type EmptyIconName =
  | "sparkle" | "check" | "pen" | "ticket" | "bell" | "chart" | "building"
  | "shield" | "search" | "heart" | "money" | "image" | "inbox" | "calendar"
  | "users" | "megaphone";

const EMPTY_ICONS: Record<EmptyIconName, ReactNode> = {
  sparkle: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />,
  check: <path d="M20 6 9 17l-5-5" />,
  pen: (
    <>
      <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
      <path d="M16 8 2 22" />
      <path d="M17.5 15H9" />
    </>
  ),
  ticket: (
    <>
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2" />
      <path d="M13 11v2" />
      <path d="M13 17v2" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </>
  ),
  building: (
    <>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </>
  ),
  shield: <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  heart: <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />,
  money: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  megaphone: (
    <>
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </>
  ),
};

type EmptyTone = "gold" | "green" | "ai";
const EMPTY_TONES: Record<EmptyTone, string> = {
  gold: "border-gold-border/30 bg-gold/[0.12] text-gold-text",
  green: "border-green/25 bg-green/[0.08] text-green",
  ai: "border-ai/25 bg-ai-tint text-ai",
};

export function EmptyGlyph({ name, size = 26 }: Readonly<{ name: EmptyIconName; size?: number }>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {EMPTY_ICONS[name]}
    </svg>
  );
}

/**
 * Shared empty state — a gently floating icon inside a pulsing ring, a title,
 * a description, and optional action buttons. `compact` renders a slim
 * left-aligned row for nested contexts (inside cards, lists, editors).
 */
export function Empty({ title = "Nothing here yet", icon = "sparkle", tone, compact = false, children, actions }: Readonly<{ title?: string; icon?: EmptyIconName; tone?: EmptyTone; compact?: boolean; children?: ReactNode; actions?: ReactNode }>) {
  const t: EmptyTone = tone ?? (icon === "check" ? "green" : "gold");
  if (compact) {
    return (
      <div className="flex items-center gap-3.5 px-5 py-6">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${EMPTY_TONES[t]}`}>
          <EmptyGlyph name={icon} size={18} />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          {children && <p className="mt-0.5 text-sm text-ink-muted">{children}</p>}
        </div>
      </div>
    );
  }
  return (
    <Card className="flex flex-col items-center px-6 py-14 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-empty-ring rounded-full border-2 border-gold-border/50" aria-hidden />
        <span className={`relative flex h-16 w-16 animate-empty-float items-center justify-center rounded-full border ${EMPTY_TONES[t]}`}>
          <EmptyGlyph name={icon} />
        </span>
      </div>
      <h3 className="mt-5 text-xl font-semibold text-ink">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">{children}</p>}
      {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
    </Card>
  );
}
