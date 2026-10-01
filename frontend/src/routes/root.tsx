import { useEffect, useRef, useState } from "react";
import { Outlet, isRouteErrorResponse, useLocation, useNavigation, useNavigationType, useRouteError } from "react-router-dom";
import { CITIZEN_URL } from "@/lib/app-urls";
import { motion } from "motion/react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AlertBanner } from "@/components/alert-banner";
import { AlertListener } from "@/components/alert-listener";
import { CookieConsent } from "@/components/cookie-consent";
import { ConsentGate } from "@/components/consent-gate";
import { PageTransition } from "@/components/page-transition";
import { Wordmark } from "@/components/wordmark";
import { Container, CTA as Cta } from "@/components/ui";
import { SPLASH_LINES, randomSplashIndex } from "@/lib/splash-lines";
import { SplashQuote } from "@/components/splash-quote";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

/** How many animation frames to wait for a #hash target to render. */
const HASH_SEEK_FRAMES = 30;

/**
 * Reset scroll to the top when the page changes (instant, loader-safe), except
 * on back/forward, where the browser restores the previous position. A URL
 * with a #hash scrolls to that element instead (e.g. /better#goals).
 */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    const pathChanged = lastPath.current !== pathname;
    lastPath.current = pathname;
    if (hash) {
      const id = decodeURIComponent(hash.slice(1));
      let frame = 0;
      let tries = 0;
      // The target can render a few frames late (lazy sections, reveals).
      const seek = () => {
        const target = document.getElementById(id);
        if (target) target.scrollIntoView();
        else if (tries++ < HASH_SEEK_FRAMES) frame = window.requestAnimationFrame(seek);
      };
      seek();
      return () => window.cancelAnimationFrame(frame);
    }
    if (pathChanged && navigationType !== "POP") window.scrollTo(0, 0);
  }, [pathname, hash, navigationType]);
  return null;
}

/**
 * Keep <link rel="canonical"> and og:url on the current route. index.html is
 * the same shell for every path, so a static canonical would point every page
 * at the homepage.
 */
function CanonicalUrl() {
  const { pathname } = useLocation();
  useEffect(() => {
    const url = `${CITIZEN_URL}${pathname}`;
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = url;
    let og = document.head.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    if (!og) {
      og = document.createElement("meta");
      og.setAttribute("property", "og:url");
      document.head.appendChild(og);
    }
    og.content = url;
  }, [pathname]);
  return null;
}

function NavigationProgress() {
  const nav = useNavigation();
  if (nav.state === "idle") return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[1300] h-0.5 overflow-hidden bg-gold/15" aria-hidden>
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
  // A different proverb/fact each load, gently rotating while you wait.
  const [i, setI] = useState(randomSplashIndex);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % SPLASH_LINES.length), 4600);
    return () => clearInterval(t);
  }, []);
  const line = SPLASH_LINES[i];

  return (
    <div className="on-dark-pin flex min-h-screen flex-col items-center justify-center gap-4 bg-green-900 px-6 text-cream">
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
      <SplashQuote key={i} line={line} />
    </div>
  );
}

export function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-paper pb-20 text-ink lg:pb-0">
      <ScrollToTop />
      <CanonicalUrl />
      <NavigationProgress />
      <SiteHeader />
      <AlertBanner />
      <AlertListener />
      <main className="flex-1">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <SiteFooter />
      <MobileBottomNav />
      <CookieConsent />
      <ConsentGate />
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
