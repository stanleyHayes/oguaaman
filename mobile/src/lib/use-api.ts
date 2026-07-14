import { useEffect, useState } from "react";

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** True while a pull-to-refresh re-fetch is in flight (content stays visible). */
  refreshing: boolean;
  /** Re-fetch without dropping to the full-screen loading state. */
  reload: () => void;
}

interface Resolved<T> {
  data: T | null;
  error: string | null;
  loadedKey: string | null;
}

// Tiny data hook: fetch on mount, re-run when `key` changes. `loading` is derived
// (true until the resolved data matches the current key), so the effect never
// setStates synchronously — no cascading re-render on key change. `reload()` does
// a soft re-fetch (keeps current data on screen, toggles `refreshing`) for
// pull-to-refresh.
export function useApi<T>(fn: () => Promise<T>, key: string): State<T> {
  const [state, setState] = useState<Resolved<T>>({ data: null, error: null, loadedKey: null });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let alive = true;
    fn()
      .then((data) => alive && setState({ data, error: null, loadedKey: key }))
      .catch((e: Error) => alive && setState({ data: null, error: e.message, loadedKey: key }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function reload() {
    if (refreshing) return;
    setRefreshing(true);
    fn()
      .then((data) => setState({ data, error: null, loadedKey: key }))
      .catch((e: Error) => setState((s) => ({ ...s, error: e.message, loadedKey: key })))
      .finally(() => setRefreshing(false));
  }

  const loading = state.loadedKey !== key;
  return {
    data: loading ? null : state.data,
    error: loading ? null : state.error,
    loading,
    refreshing,
    reload,
  };
}
