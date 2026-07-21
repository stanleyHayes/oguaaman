import { useCallback, useEffect, useRef, useState } from "react";
import type { Page } from "./api";

/** Resolves one page envelope for a 1-based page index and a page size. */
export type PageFetcher<T> = (page: number, pageSize: number) => Promise<Page<T>>;

export interface PaginatedList<T> {
  items: T[];
  /** Full filtered count reported by the server (drives headers/counts). */
  total: number;
  /** Initial load — no items on screen yet, so show a full-screen skeleton. */
  loading: boolean;
  /** A next-page fetch is in flight — show an inline footer skeleton. */
  loadingMore: boolean;
  /** A pull-to-refresh re-fetch is in flight — content stays visible. */
  refreshing: boolean;
  error: string | null;
  /** More pages remain after what's already loaded. */
  hasMore: boolean;
  /** Fetch + append the next page. Safe to call repeatedly (self-guarding). */
  loadMore: () => void;
  /** Reset to page 1, keeping current content visible until it resolves. */
  refresh: () => void;
}

interface Resolved<T> {
  loadedKey: string | null;
  items: T[];
  total: number;
  totalPages: number;
  page: number;
  error: string | null;
}

/**
 * Infinite-scroll list state over a paginated endpoint. Mirrors `useApi`'s
 * derived-`loading` model — `loading` stays true until the resolved data matches
 * the current `key`, so a key change drops back to the full-screen skeleton — and
 * adds `loadMore`/`refresh` for FlatList `onEndReached` + pull-to-refresh.
 *
 * `fetchPage` may be a fresh closure each render; only `key` drives re-fetching,
 * so pass a stable string that captures every active filter (e.g.
 * `memories:${tag}`). An in-flight request whose key has since changed is
 * dropped, so rapid category switches never append stale rows.
 */
export function usePaginatedList<T>(fetchPage: PageFetcher<T>, key: string, pageSize = 24): PaginatedList<T> {
  // Latest-closure refs: keep re-fetch keyed on `key` alone while always calling
  // the fetcher/comparing against the key from the current render.
  const fetchRef = useRef(fetchPage);
  const keyRef = useRef(key);
  useEffect(() => { fetchRef.current = fetchPage; }, [fetchPage]);
  useEffect(() => { keyRef.current = key; }, [key]);
  // Serialises loadMore/refresh so overlapping onEndReached fires can't double-append.
  const busyRef = useRef<symbol | null>(null);

  const [resolved, setResolved] = useState<Resolved<T>>({
    loadedKey: null, items: [], total: 0, totalPages: 0, page: 0, error: null,
  });
  // Associate transient flags with the key that started them. Changing filters
  // makes stale flags disappear by derivation, without synchronous effect resets.
  const [loadingMoreKey, setLoadingMoreKey] = useState<string | null>(null);
  const [refreshingKey, setRefreshingKey] = useState<string | null>(null);
  const loadingMore = loadingMoreKey === key;
  const refreshing = refreshingKey === key;

  // Initial load + reload on key change. The `alive` flag drops a stale response.
  useEffect(() => {
    let alive = true;
    busyRef.current = null;
    fetchRef.current(1, pageSize)
      .then((res) => {
        if (alive) setResolved({ loadedKey: key, items: res.items, total: res.total, totalPages: res.totalPages, page: res.page, error: null });
      })
      .catch((e: Error) => {
        if (alive) setResolved({ loadedKey: key, items: [], total: 0, totalPages: 0, page: 0, error: e.message });
      });
    return () => { alive = false; };
  }, [key, pageSize]);

  const loading = resolved.loadedKey !== key;
  const hasMore = !loading && resolved.page > 0 && resolved.page < resolved.totalPages;

  const loadMore = useCallback(() => {
    if (loading || refreshing || !hasMore || busyRef.current) return;
    const forKey = key;
    const next = resolved.page + 1;
    const request = Symbol(forKey);
    busyRef.current = request;
    setLoadingMoreKey(forKey);
    fetchRef.current(next, pageSize)
      .then((res) => {
        if (keyRef.current !== forKey) return;
        setResolved((s) => ({
          loadedKey: forKey,
          items: [...s.items, ...res.items],
          total: res.total,
          totalPages: res.totalPages,
          page: res.page,
          error: null,
        }));
      })
      .catch((e: Error) => {
        if (keyRef.current === forKey) setResolved((s) => ({ ...s, error: e.message }));
      })
      .finally(() => {
        if (busyRef.current === request) busyRef.current = null;
        if (keyRef.current === forKey) setLoadingMoreKey(null);
      });
  }, [loading, refreshing, hasMore, resolved.page, key, pageSize]);

  const refresh = useCallback(() => {
    if (busyRef.current) return;
    const forKey = key;
    const request = Symbol(forKey);
    busyRef.current = request;
    setRefreshingKey(forKey);
    fetchRef.current(1, pageSize)
      .then((res) => {
        if (keyRef.current === forKey) setResolved({ loadedKey: forKey, items: res.items, total: res.total, totalPages: res.totalPages, page: res.page, error: null });
      })
      .catch((e: Error) => {
        if (keyRef.current === forKey) setResolved((s) => ({ ...s, error: e.message }));
      })
      .finally(() => {
        if (busyRef.current === request) busyRef.current = null;
        if (keyRef.current === forKey) setRefreshingKey(null);
      });
  }, [key, pageSize]);

  return {
    items: loading ? [] : resolved.items,
    total: loading ? 0 : resolved.total,
    loading,
    loadingMore,
    refreshing,
    error: loading ? null : resolved.error,
    hasMore,
    loadMore,
    refresh,
  };
}

/**
 * Adapts a non-paginated endpoint (one that always returns the full array) into
 * a `PageFetcher`, so an infinite-scroll list can render it uniformly — it comes
 * back as a single complete page (`totalPages: 1`, so `hasMore` is false).
 */
export function wholeListAsPage<T>(fetchAll: () => Promise<T[]>): PageFetcher<T> {
  return async () => {
    const items = await fetchAll();
    return { items, total: items.length, page: 1, pageSize: items.length || 1, totalPages: 1 };
  };
}
