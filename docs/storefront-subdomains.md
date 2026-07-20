# Storefront shareable links — per-business subdomains

Each Supporter business picks a **handle** (e.g. `neurodynecorp`). The shareable
link is a single source of truth (`frontend/src/lib/storefront-url.ts`):

| State | `VITE_STOREFRONT_DOMAIN` | Link for handle `neurodynecorp` |
|---|---|---|
| **Now** (on `*.vercel.app`) | *(blank)* | `https://oguaa-citizen.vercel.app/s/neurodynecorp` |
| **Final** (domain owned) | `oguaaman.com` | `https://neurodynecorp.oguaaman.com` |

The owner's builder (`/business/:slug/manage`) shows exactly this link, and it
flips automatically when the env var is set — no code change.

## Flipping to subdomains (once oguaaman.com is owned)

Both sides point at the **same** `/s/:handle` route, so only routing + config
change:

1. **Vercel** — on the citizen (frontend) project, add a **wildcard domain**
   `*.oguaaman.com` (and `oguaaman.com`). Vercel issues the wildcard TLS cert.
2. **DNS** — at the registrar, add a wildcard record:
   `*  CNAME  cname.vercel-dns.com.` (or the value Vercel shows).
3. **Host → path rewrite** — map `<handle>.oguaaman.com/*` to `/s/<handle>`.
   With a Vite SPA the simplest option is a tiny bootstrap in `index.html` /
   `main.tsx` that reads `location.hostname`, and if it's a business subdomain
   (not `www`/`app`/apex), rewrites the in-app route to `/s/<sub>` before the
   router mounts. Example:

   ```ts
   // main.tsx, before createRoot
   const host = location.hostname;
   const apex = "oguaaman.com";
   if (host.endsWith("." + apex)) {
     const sub = host.slice(0, -(apex.length + 1));
     if (!["www", "app", "oguaa-citizen"].includes(sub) && location.pathname === "/") {
       history.replaceState(null, "", `/s/${sub}`);
     }
   }
   ```

   (A Vercel rewrite with a `has: [{ type: "host", value: "(?<sub>...)" }]`
   rule is the alternative, but the SPA already resolves `/s/:handle`, so the
   client rewrite is enough.)
4. **Backend CORS** — add `https://*.oguaaman.com` handling to `ALLOWED_ORIGIN`
   (or the apex + a wildcard match) so storefront pages can call the API.
5. Set `VITE_STOREFRONT_DOMAIN=oguaaman.com` in `frontend/.env.production`
   (and the same value in Vercel project env) and redeploy.

Until then the path form works everywhere and is what owners see/share.
