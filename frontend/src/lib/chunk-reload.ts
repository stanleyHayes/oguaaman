// Self-heal stale code-split chunks. After a new deploy (or, in dev, a server
// restart), a tab that is still holding the old index.html references hashed
// module chunks whose paths no longer exist. Vite's SPA fallback then answers
// those .js requests with index.html (text/html), and the browser throws
// "Failed to load module script: Expected a JavaScript-or-Wasm module script…"
// — which white-screens the app before React Router's errorElement can catch it.
//
// The fix is the standard one: when a dynamic import / preload fails, reload the
// page once so the browser fetches the current index.html and the fresh chunks.
// A short time-guard prevents a reload loop if the failure is genuine (a truly
// broken build), so the user still eventually sees the error rather than a
// flickering reload.

const GUARD_KEY = "oguaa:chunk-reloaded-at";
const LOOP_WINDOW_MS = 10_000;

const CHUNK_ERROR = /dynamically imported module|module script failed|Failed to (fetch|load) module|Loading chunk|Importing a module script failed|error loading dynamically imported/i;

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(GUARD_KEY) || 0);
    if (Date.now() - last < LOOP_WINDOW_MS) return; // already tried very recently — don't loop
    sessionStorage.setItem(GUARD_KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable (private mode) — still attempt a single reload.
  }
  window.location.reload();
}

/** Register the chunk-load-error listeners. Call once at app entry. */
export function installChunkReload() {
  if (typeof window === "undefined") return;

  // Vite build emits this when a preloaded chunk fails to load.
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadOnce();
  });

  // Runtime dynamic-import failures (dev and prod).
  window.addEventListener("error", (event) => {
    if (CHUNK_ERROR.test(String(event.message || ""))) reloadOnce();
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as { message?: string } | string | undefined;
    const message = typeof reason === "string" ? reason : reason?.message ?? "";
    if (CHUNK_ERROR.test(message)) reloadOnce();
  });
}
