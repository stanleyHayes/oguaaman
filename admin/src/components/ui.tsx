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

export function StatCard({ label, value, tone = "text-green" }: Readonly<{ label: string; value: number | string; tone?: string }>) {
  return (
    <Card className="px-4 py-5 text-center">
      <div className={`font-display text-3xl font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-ink-faint">{label}</div>
    </Card>
  );
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
        <h1 className="mt-1 font-display text-3xl font-semibold">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function Empty({ title = "Nothing here yet", children, actions }: Readonly<{ title?: string; children?: ReactNode; actions?: ReactNode }>) {
  return (
    <Card className="flex flex-col items-center px-6 py-14 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-sand bg-paper">
        <span className="absolute inline-flex h-16 w-16 animate-ping rounded-full border border-gold-border/40 opacity-60" aria-hidden />
        <span className="text-2xl" aria-hidden>🦀</span>
      </div>
      <h3 className="mt-5 font-display text-xl font-semibold text-ink">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-sm text-ink-muted">{children}</p>}
      {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
    </Card>
  );
}
