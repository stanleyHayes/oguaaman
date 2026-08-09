import { useEffect } from "react";
import { Outlet, ScrollRestoration, isRouteErrorResponse, useRouteError, useMatches, Link } from "react-router-dom";
import { Nav } from "@/sections/Nav";
import { Footer } from "@/sections/Footer";
import { PageTransition } from "@/components/page-transition";
import { setMeta, setLink, DEFAULT_OG_IMAGE } from "@/lib/meta";
import { SITE_URL } from "@/config";
import { DEFAULT_TITLE, DEFAULT_DESCRIPTION, mergeKeywords } from "@/seo/site";

/** Absolute share image (social scrapers need an absolute URL, not a path). */
const OG_IMAGE_ABS = `${SITE_URL}${DEFAULT_OG_IMAGE}`;

interface RouteMeta {
  title?: string;
  description?: string;
  keywords?: string[];
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

    // Always write a description: falling through to the previous page's copy
    // on navigation is worse than the sitewide default.
    const description = handle?.description ?? DEFAULT_DESCRIPTION;
    setMeta("name", "description", description);
    setMeta("property", "og:description", description);
    setMeta("name", "twitter:description", description);

    // Route terms first (Cape Coast answers to many names — see seo/site.ts),
    // then the sitewide set, de-duplicated.
    setMeta("name", "keywords", mergeKeywords(handle?.keywords));

    // Reset the share image to the site default; per-place pages (/visit/:slug)
    // override it with their own photo, so it must reset on navigation away.
    setMeta("property", "og:image", OG_IMAGE_ABS);
    setMeta("name", "twitter:image", OG_IMAGE_ABS);
    // Canonical + og:url track the current page. Base is the configured
    // SITE_URL (VITE_SITE_URL) so it stays correct across localhost / Vercel /
    // the live domain; falls back to the actual serving origin.
    const url = `${SITE_URL}${window.location.pathname}`;
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
        <PageTransition>
          <Outlet />
        </PageTransition>
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
    <div className="on-dark on-dark-pin flex min-h-screen flex-col items-center justify-center bg-green-900 px-6 text-center text-cream">
      <p className="font-mono text-sm uppercase tracking-[0.2em] text-gold/80">{status ?? "Oops"}</p>
      <h1 className="mt-3 text-4xl font-semibold">This page wandered off.</h1>
      <p className="mt-3 max-w-md text-cream/75">
        {status === 404 ? "We couldn't find that corner of Oguaa." : "Something went wrong. The API may be offline."}
      </p>
      <Link to="/" className="mt-7 rounded-full bg-gold-brand px-5 py-2.5 text-sm font-semibold text-green-900">
        Back to Cape Coast
      </Link>
    </div>
  );
}
