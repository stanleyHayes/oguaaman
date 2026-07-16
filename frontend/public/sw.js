// Oguaa service worker — offline shell (spec §11: PWA as the native bridge).
// Strategy: navigations network-first with cached-shell fallback (the SPA
// boots offline once visited); fingerprinted /assets and font CDNs
// cache-first; /uploads images stale-while-revalidate; /api network-only
// (stale data is worse than an honest error).

const VERSION = "oguaa-shell-v1";
const SHELL_CACHE = `${VERSION}:shell`;
const RUNTIME_CACHE = `${VERSION}:runtime`;
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("oguaa-shell-") && !k.startsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const cacheFirst = async (request) => {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, res.clone());
  }
  return res;
};

const staleWhileRevalidate = async (request) => {
  const hit = await caches.match(request);
  const fresh = fetch(request)
    .then((res) => {
      if (res.ok) {
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, res.clone()));
      }
      return res;
    })
    .catch(() => hit);
  return hit || fresh;
};

const networkFirstShell = async (request) => {
  try {
    return await fetch(request);
  } catch {
    const shell = await caches.match("/", { ignoreSearch: true });
    return shell || Response.error();
  }
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Never cache API traffic or share-card renders.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstShell(request));
    return;
  }
  if (
    url.pathname.startsWith("/assets/") ||
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.startsWith("/uploads/")) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
