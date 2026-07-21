// Shared pagination UI for the heavy public lists. Two primitives, both
// theme-aware via the site's cream/sand/ink tokens (light + dark):
//   • <Pagination>  — numbered prev/next control, for directories where you
//     jump between discrete pages (e.g. the school roster, business directory).
//   • <LoadMore>     — a single "Load more" button, for feed-like lists that
//     grow downward (news, events, memories, the diaspora register).
//
// Both are presentational and fully controlled: the caller owns the page /
// visible-count state and decides whether items come from a server page
// envelope (api.schools({ page })) or a client-side slice of an already-loaded
// array. Rendering nothing when there is only one page keeps callers simple.

/** Build a compact page list with ellipses: 1 … 4 5 [6] 7 8 … 20. */
function pageWindow(current: number, total: number): (number | "gap")[] {
  const marks = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...marks].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

const CELL = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors";
const IDLE = "border-sand bg-cream text-ink-muted hover:border-green hover:text-green-text";
const ACTIVE = "border-green bg-green text-on-green";
const BLOCKED = "cursor-not-allowed border-sand bg-cream text-ink-faint opacity-50";

export function Pagination({
  page,
  totalPages,
  onPageChange,
  className = "",
}: Readonly<{
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}>) {
  if (totalPages <= 1) return null;
  const atStart = page <= 1;
  const atEnd = page >= totalPages;
  return (
    <nav aria-label="Pagination" className={`mt-10 flex flex-wrap items-center justify-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={() => !atStart && onPageChange(page - 1)}
        disabled={atStart}
        aria-label="Previous page"
        className={`${CELL} ${atStart ? BLOCKED : IDLE}`}
      >
        <span aria-hidden>‹</span><span className="ml-1 hidden sm:inline">Prev</span>
      </button>
      {pageWindow(page, totalPages).map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-ink-faint" aria-hidden>…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            aria-current={p === page ? "page" : undefined}
            aria-label={`Page ${p}`}
            className={`${CELL} ${p === page ? ACTIVE : IDLE}`}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => !atEnd && onPageChange(page + 1)}
        disabled={atEnd}
        aria-label="Next page"
        className={`${CELL} ${atEnd ? BLOCKED : IDLE}`}
      >
        <span className="mr-1 hidden sm:inline">Next</span><span aria-hidden>›</span>
      </button>
    </nav>
  );
}

export function LoadMore({
  hasMore,
  onClick,
  loading = false,
  label = "Load more",
  remaining,
  className = "",
}: Readonly<{
  hasMore: boolean;
  onClick: () => void;
  loading?: boolean;
  label?: string;
  /** When known, appended as a count e.g. "Load more (12)". */
  remaining?: number;
  className?: string;
}>) {
  if (!hasMore) return null;
  const suffix = typeof remaining === "number" && remaining > 0 ? ` (${remaining})` : "";
  return (
    <div className={`mt-10 flex justify-center ${className}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-busy={loading}
        className="inline-flex items-center gap-2 rounded-full border border-sand bg-cream px-7 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-green hover:text-green-text disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <>
            <span aria-hidden className="skeleton h-2.5 w-8 rounded-full" />
            Loading…
          </>
        ) : (
          <>{label}{suffix}</>
        )}
      </button>
    </div>
  );
}
