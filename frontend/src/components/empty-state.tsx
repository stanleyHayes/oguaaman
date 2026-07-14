import type { ReactNode } from "react";
import { CrabMark } from "./wordmark";

/**
 * A warm, animated empty state — gently-bobbing icon inside a pulsing ring,
 * a title, a description, and optional action buttons. Use wherever a list or
 * page has nothing to show yet.
 */
export function EmptyState({
  icon,
  title,
  description,
  actions,
  className = "",
}: Readonly<{
  icon?: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}>) {
  return (
    <div className={`flex flex-col items-center px-6 py-16 text-center ${className}`}>
      <div className="oguaa-pulse-ring relative flex h-20 w-20 items-center justify-center rounded-full border border-sand bg-cream text-gold-brand">
        <span className="oguaa-float inline-flex">{icon ?? <CrabMark size={36} />}</span>
      </div>
      <h3 className="mt-6 font-display text-2xl font-semibold text-ink">{title}</h3>
      {description && <p className="mt-2 max-w-sm leading-relaxed text-ink-muted">{description}</p>}
      {actions && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
    </div>
  );
}
