import { useEffect } from "react";
import { Outlet, ScrollRestoration, isRouteErrorResponse, useRouteError, useMatches, Link } from "react-router-dom";
import { Nav } from "@/sections/Nav";
import { Footer } from "@/sections/Footer";
import { setMeta, setLink, DEFAULT_OG_IMAGE } from "@/lib/meta";

const DEFAULT_TITLE = "Oguaa — the home of Cape Coast";

interface RouteMeta {
  title?: string;
  description?: string;
}

/** Update <title> and the description/OG/Twitter tags from the active route's handle. */
function useRouteMeta() {
  const matches = useMatches();
  useEffect(() => {
    const handle = [...matches]
      .reverse()
      .map((m) => m.handle as RouteMeta | undefined)
      .find((h) => h?.title);

    const title = handle?.title ?? DEFAULT_TITLE;
    document.title = title;
    setMeta("property", "og:title", title);
    setMeta("name", "twitter:title", title);

    if (handle?.description) {
      setMeta("name", "description", handle.description);
      setMeta("property", "og:description", handle.description);
      setMeta("name", "twitter:description", handle.description);
    }
    // Reset the share image to the site default; per-place pages (/visit/:slug)
    // override it with their own photo, so it must reset on navigation away.
    setMeta("property", "og:image", DEFAULT_OG_IMAGE);
    setMeta("name", "twitter:image", DEFAULT_OG_IMAGE);
    // Canonical + og:url track the current page so each route shares as itself.
    const url = window.location.origin + window.location.pathname;
    setLink("canonical", url);
    setMeta("property", "og:url", url);
  }, [matches]);
}

export function RootLayout() {
  useRouteMeta();
  return (
    <>
      <Nav />
      <main>
        <Outlet />
      </main>
      <Footer />
      <ScrollRestoration />
    </>
  );
}

export function RootError() {
  const err = useRouteError();
  const status = isRouteErrorResponse(err) ? err.status : null;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-green-900 px-6 text-center text-cream">
      <p className="font-mono text-sm uppercase tracking-[0.2em] text-gold/80">{status ?? "Oops"}</p>
      <h1 className="mt-3 font-display text-4xl font-semibold">This page wandered off.</h1>
      <p className="mt-3 max-w-md text-cream/75">
        {status === 404 ? "We couldn't find that corner of Oguaa." : "Something went wrong. The API may be offline."}
      </p>
      <Link to="/" className="mt-7 rounded-full bg-gold-brand px-5 py-2.5 text-sm font-semibold text-green-900">
        Back to Cape Coast
      </Link>
    </div>
  );
}
