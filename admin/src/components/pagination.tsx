import { useState, type SetStateAction, type Dispatch } from "react";
import type { Paged } from "@/lib/types";

/**
 * Shared pagination UI for the heavy admin lists. Two flavours:
 *  - <Pagination>  — numbered prev/next control for tables (Listings, Members,
 *    Audit, Institutions, Reports).
 *  - <LoadMore>    — an append button for card feeds (Moderation queue).
 * Both lean entirely on the shared heritage tokens (sand/cream/ink/green), so
 * they render correctly in light and dark themes with no extra work.
 */

/** Windowed page list with ellipses: 1 … 4 5 [6] 7 8 … 20. */
function pageWindow(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  if (start > 2) out.push("…");
  for (let p = start; p <= end; p++) out.push(p);
  if (end < totalPages - 1) out.push("…");
  out.push(totalPages);
  return out;
}

export function Pagination({
  page,
  totalPages,
  onChange,
  total,
  pageSize,
  className = "",
  disabled = false,
}: Readonly<{
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  total?: number;
  pageSize?: number;
  className?: string;
  disabled?: boolean;
}>) {
  if (totalPages <= 1) return null;
  const win = pageWindow(page, totalPages);

  const rangeLabel = (() => {
    if (typeof total !== "number" || typeof pageSize !== "number") return null;
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(total, page * pageSize);
    return `${from}–${to} of ${total}`;
  })();

  const btn =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-sand bg-cream px-3 text-sm font-semibold text-ink-muted transition-colors hover:border-gold-border/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-sand disabled:hover:text-ink-muted";

  return (
    <nav
      aria-label="Pagination"
      className={`mt-5 flex flex-wrap items-center justify-between gap-3 ${className}`}
    >
      {rangeLabel ? <p className="text-xs text-ink-faint">{rangeLabel}</p> : <span />}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={disabled || page <= 1}
          className={btn}
          aria-label="Previous page"
        >
          ‹ Prev
        </button>
        {win.map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-1.5 text-sm text-ink-faint" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              disabled={disabled}
              aria-current={p === page ? "page" : undefined}
              aria-label={`Page ${p}`}
              className={
                p === page
                  ? "inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-green px-3 text-sm font-semibold text-on-green"
                  : btn
              }
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={disabled || page >= totalPages}
          className={btn}
          aria-label="Next page"
        >
          Next ›
        </button>
      </div>
    </nav>
  );
}

export function LoadMore({
  onClick,
  loading = false,
  hasMore,
  loaded,
  total,
  className = "",
}: Readonly<{
  onClick: () => void;
  loading?: boolean;
  hasMore: boolean;
  loaded: number;
  total: number;
  className?: string;
}>) {
  return (
    <div className={`mt-6 flex flex-col items-center gap-2 ${className}`}>
      <p className="text-xs text-ink-faint">
        Showing {loaded} of {total}
      </p>
      {hasMore && (
        <button
          type="button"
          onClick={onClick}
          disabled={loading}
          className="rounded-full border border-sand bg-cream px-6 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:border-gold-border/50 hover:text-ink disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

/**
 * Keeps a local, mutable copy of a loader's paged items so pages can apply
 * optimistic edits (role changes, verify toggles) while still resyncing when
 * react-router hands over a fresh page. Resyncs by comparing the loader object
 * identity during render — the React-endorsed alternative to a useEffect reset.
 */
export function usePagedRows<T>(data: Paged<T>): [T[], Dispatch<SetStateAction<T[]>>] {
  // Tolerate a non-paginated (plain-array) response so a shape mismatch
  // degrades to "show everything" instead of crashing on rows.map.
  const itemsOf = (d: Paged<T>): T[] => (Array.isArray(d) ? (d as T[]) : (d?.items ?? []));
  const [rows, setRows] = useState<T[]>(() => itemsOf(data));
  const [snapshot, setSnapshot] = useState(data);
  if (snapshot !== data) {
    setRows(itemsOf(data));
    setSnapshot(data);
  }
  return [rows, setRows];
}
