import type { ReactNode } from "react";
import { CrabMark } from "./wordmark";

/** Named stroke icons (Lucide-style paths) for empty states. */
export type EmptyIconName =
  | "sparkle" | "check" | "pen" | "ticket" | "bell" | "chart" | "building"
  | "shield" | "search" | "heart" | "money" | "image" | "inbox" | "calendar"
  | "users" | "megaphone" | "video" | "layout";

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
  video: (
    <>
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m16 10 6-3v10l-6-3" />
    </>
  ),
  layout: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 9v11" />
    </>
  ),
};

type EmptyTone = "gold" | "green" | "clay";
const EMPTY_TONES: Record<EmptyTone, string> = {
  gold: "border-gold-border/30 bg-gold/[0.12] text-gold-text",
  green: "border-green/25 bg-green/[0.08] text-green",
  clay: "border-clay/30 bg-clay/[0.08] text-clay-text",
};

export function EmptyGlyph({ name, size = 36 }: Readonly<{ name: EmptyIconName; size?: number }>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {EMPTY_ICONS[name]}
    </svg>
  );
}

/**
 * A warm, animated empty state — gently-bobbing icon inside a pulsing ring,
 * a title, a description, and optional action buttons. Use wherever a list or
 * page has nothing to show yet. `compact` renders a slim left-aligned row for
 * nested contexts (inside cards, lists, dropdowns).
 */
export function EmptyState({
  icon,
  title,
  description,
  actions,
  tone,
  compact = false,
  className = "",
}: Readonly<{
  icon?: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
  tone?: EmptyTone;
  compact?: boolean;
  className?: string;
}>) {
  const t: EmptyTone = tone ?? "gold";
  if (compact) {
    return (
      <div className={`flex items-center gap-3.5 px-5 py-6 ${className}`}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${EMPTY_TONES[t]}`}>
          {icon ?? <CrabMark size={20} />}
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
          {actions && <div className="mt-2 flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
      </div>
    );
  }
  return (
    <div className={`flex flex-col items-center px-6 py-16 text-center ${className}`}>
      <div className={`oguaa-pulse-ring relative flex h-20 w-20 items-center justify-center rounded-full border ${EMPTY_TONES[t]}`}>
        <span className="oguaa-float inline-flex">{icon ?? <CrabMark size={36} />}</span>
      </div>
      <h3 className="mt-6 text-2xl font-semibold text-ink">{title}</h3>
      {description && <p className="mt-2 max-w-sm leading-relaxed text-ink-muted">{description}</p>}
      {actions && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
    </div>
  );
}
