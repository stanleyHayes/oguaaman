// Skeleton placeholders — the house pattern for loading states: show the shape
// of what's coming instead of a spinner. The shimmer lives in index.css
// (.skeleton) and switches off under prefers-reduced-motion.

// Stable keys for static placeholder rows (array indexes make poor React keys).
const LINE_KEYS = ["l1", "l2", "l3", "l4", "l5", "l6"];
const CARD_KEYS = ["c1", "c2", "c3", "c4", "c5", "c6"];

export function Skeleton({ className = "" }: Readonly<{ className?: string }>) {
  return <div aria-hidden className={`skeleton rounded-md ${className}`} />;
}

export function SkeletonText({ lines = 3, className = "" }: Readonly<{ lines?: number; className?: string }>) {
  return (
    <div aria-hidden className={`space-y-2 ${className}`}>
      {LINE_KEYS.slice(0, lines).map((k, i) => (
        <div
          key={k}
          className="skeleton h-3.5 rounded-md"
          style={{ width: i === lines - 1 ? "60%" : "100%" }}
        />
      ))}
    </div>
  );
}

// Profile-page skeleton: mirrors the Me.tsx header + two-column card layout so
// the page doesn't jump when the real content lands.
export function ProfileSkeleton() {
  return (
    <output aria-label="Loading your profile" className="block space-y-8">
      <span className="sr-only">Loading your profile…</span>
      <div className="flex items-center gap-5">
        <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3.5 w-32" />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CARD_KEYS.map((k) => (
          <div key={k} className="rounded-[var(--radius-card)] border border-sand bg-cream p-5">
            <Skeleton className="h-4 w-24" />
            <SkeletonText lines={3} className="mt-4" />
          </div>
        ))}
      </div>
    </output>
  );
}
