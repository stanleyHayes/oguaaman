import { useRef, useState } from "react";

/**
 * Client-side pagination for the heavy public directories (business, property,
 * people, music…). The page loads the full, already-filtered array so filters
 * stay instant, and this hook slices it into numbered pages for display —
 * pairing with <Pagination>. It follows the adjust-state-during-render pattern:
 * when `resetKey` changes (e.g. the active trade/genre filter), the view snaps
 * back to page 1 without an effect.
 *
 * Attach the returned `listRef` to the list container so paging scrolls the user
 * back to its top.
 */
export function useClientPagination<T>(items: T[], perPage: number, resetKey?: unknown) {
  const [page, setPage] = useState(1);
  const [prevKey, setPrevKey] = useState(resetKey);
  const listRef = useRef<HTMLDivElement>(null);
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setPage(1);
  }
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(page, totalPages);
  const pageItems = items.slice((current - 1) * perPage, current * perPage);
  function goToPage(next: number) {
    setPage(next);
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return { pageItems, page: current, totalPages, goToPage, listRef };
}
