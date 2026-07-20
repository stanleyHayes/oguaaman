// Oguaa service worker — offline shell (spec §11: PWA as the native bridge).
// Strategy: navigations network-first with cached-shell fallback (the SPA
// boots offline once visited); fingerprinted /assets and font CDNs
// cache-first; /uploads images stale-while-revalidate; /api network-only
// (stale data is worse than an honest error).

const VERSION = "oguaa-shell-v2";
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

// ── Safety-alert push ────────────────────────────────────────────────────────
// A push carries a JSON PushPayload {title,body,url,tag,severity,kind,ring}.
// We show a notification (critical = sticky) AND relay it to any open tab so the
// in-app RingingCall can take over the screen with a looping ringtone.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Safety alert", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Oguaa safety alert";
  const options = {
    body: payload.body || "",
    tag: payload.tag || "oguaa-alert",
    data: { url: payload.url || "/alerts" },
    requireInteraction: Boolean(payload.ring),
    renotify: true,
    icon: "/icon-192.png",
    badge: "/icon.svg",
    vibrate: payload.ring ? [500, 300, 500, 300, 500] : [200, 100, 200],
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        for (const client of clients) client.postMessage({ type: "oguaa-alert", payload });
      }),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/alerts";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.postMessage({ type: "oguaa-alert-open", url });
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

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
