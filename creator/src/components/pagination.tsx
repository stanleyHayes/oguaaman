import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Client-side pager for lists that arrive fully-loaded (the member's own
 * listings, notifications, an institution's team roster — all embedded in a
 * single response rather than served by a `?page` endpoint). Tracks the
 * current page, clamps it when the list shrinks (e.g. a status filter narrows
 * the set, or a row is removed), and resets to page 1 whenever `resetKey`
 * changes. For endpoints that expose the server pagination envelope, use
 * `fetchPage` from lib/api with this same <Pagination> control.
 */
export function usePagedList<T>(items: readonly T[], pageSize = 10, resetKey?: unknown) {
  const [page, setPage] = useState(1);
  const [prevKey, setPrevKey] = useState(resetKey);
  // Officially-sanctioned "adjust state during render" pattern: resets the
  // page synchronously (no flash of a stale page) when the reset key changes.
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setPage(1);
  }

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return {
    page: current,
    setPage,
    totalPages,
    total,
    pageSize,
    pageItems,
    rangeStart: total === 0 ? 0 : start + 1,
    rangeEnd: Math.min(start + pageSize, total),
  };
}

/** Page numbers to render, collapsing long runs to a single ellipsis. */
function pageWindow(current: number, total: number): Array<number | "gap"> {
  const shown = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...shown].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

const NUM_BTN =
  "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors";
const STEP_BTN =
  "inline-flex h-9 items-center gap-1 rounded-lg border border-sand bg-cream px-3 text-sm font-medium text-ink-muted transition-colors hover:border-green/40 hover:text-green-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-sand disabled:hover:text-ink-muted";

/**
 * Numbered prev/next pager. Renders nothing for a single page. Colours come
 * from the shared token classes (ink / sand / green / on-green), so it is
 * light- and dark-theme-safe out of the box.
 */
export function Pagination({
  page,
  totalPages,
  onPage,
  total,
  rangeStart,
  rangeEnd,
  unit = "items",
  className = "",
}: Readonly<{
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
  total?: number;
  rangeStart?: number;
  rangeEnd?: number;
  unit?: string;
  className?: string;
}>) {
  if (totalPages <= 1) return null;
  const showCaption =
    total !== undefined && rangeStart !== undefined && rangeEnd !== undefined && total > 0;

  return (
    <nav aria-label="Pagination" className={`mt-5 flex flex-col items-center gap-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className={STEP_BTN}
          aria-label="Previous page"
        >
          <ChevronLeft size={15} aria-hidden /> Prev
        </button>

        {pageWindow(page, totalPages).map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="px-1.5 text-sm text-ink-faint" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              aria-current={p === page ? "page" : undefined}
              aria-label={`Page ${p}`}
              className={`${NUM_BTN} ${
                p === page
                  ? "border-green bg-green text-on-green"
                  : "border-sand bg-cream text-ink-muted hover:border-green/40 hover:text-green-text"
              }`}
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className={STEP_BTN}
          aria-label="Next page"
        >
          Next <ChevronRight size={15} aria-hidden />
        </button>
      </div>

      {showCaption && (
        <p className="text-xs text-ink-faint">
          Showing {rangeStart}–{rangeEnd} of {total} {unit}
        </p>
      )}
    </nav>
  );
}
