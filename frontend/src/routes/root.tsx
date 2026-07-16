import { useEffect } from "react";
import { Outlet, isRouteErrorResponse, useLocation, useNavigation, useRouteError } from "react-router-dom";
import { motion } from "motion/react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CookieConsent } from "@/components/cookie-consent";
import { PageTransition } from "@/components/page-transition";
import { Wordmark } from "@/components/wordmark";
import { Container, CTA as Cta } from "@/components/ui";

/** Reset scroll to the top on every route change (instant, loader-safe). */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function NavigationProgress() {
  const nav = useNavigation();
  if (nav.state === "idle") return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-gold/15" aria-hidden>
      <motion.div
        className="h-full bg-gold-brand"
        initial={{ x: "-100%" }}
        animate={{ x: "100%" }}
        transition={{ duration: 1.1, ease: "easeInOut", repeat: Infinity }}
      />
    </div>
  );
}

/**
 * Shown during the very first load while the route's lazy chunk and its
 * loader settle. Without it react-router renders nothing at all in that
 * window — a blank white page on cold caches / slow networks.
 */
export function HydrateFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-green-900 text-cream">
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <Wordmark size="text-3xl" />
      </motion.div>
      <div className="h-0.5 w-28 overflow-hidden rounded-full bg-gold/15" aria-hidden>
        <motion.div
          className="h-full w-full bg-gold-brand"
          initial={{ x: "-100%" }}
          animate={{ x: "100%" }}
          transition={{ duration: 1.1, ease: "easeInOut", repeat: Infinity }}
        />
      </div>
      <p className="text-xs uppercase tracking-[0.2em] text-gold/80">Yɛn ara asaase ni</p>
    </div>
  );
}

export function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <ScrollToTop />
      <NavigationProgress />
      <SiteHeader />
      <main className="flex-1">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <SiteFooter />
      <CookieConsent />
    </div>
  );
}

export function RootError() {
  const err = useRouteError();
  // isRouteErrorResponse catches thrown Response objects; the plain Error check
  // covers our api.ts get() which now throws Error({ status }) for consistency.
  const is404 =
    (isRouteErrorResponse(err) && err.status === 404) ||
    ((err as { status?: number })?.status === 404);
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <SiteHeader />
      <main className="flex-1">
        <Container size="narrow" className="py-24 text-center">
          <p className="eyebrow text-gold-text">{is404 ? "404" : "Something went wrong"}</p>
          <h1 className="mt-4 text-5xl font-semibold">
            {is404 ? "This page isn't here yet" : "We hit a snag"}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-ink-muted">
            {is404
              ? "The page you're looking for may not have been filled in yet — the platform grows as the community brings it to life."
              : "Please try again. If it keeps happening, the API may be offline."}
          </p>
          <div className="mt-8">
            <Cta to="/" variant="gold">Back to Oguaa</Cta>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
