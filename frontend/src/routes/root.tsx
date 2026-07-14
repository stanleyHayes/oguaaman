import { useEffect } from "react";
import { Outlet, isRouteErrorResponse, useLocation, useRouteError } from "react-router-dom";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PageTransition } from "@/components/page-transition";
import { Container, CTA as Cta } from "@/components/ui";

/** Reset scroll to the top on every route change (instant, loader-safe). */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <ScrollToTop />
      <SiteHeader />
      <main className="flex-1">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <SiteFooter />
    </div>
  );
}

export function RootError() {
  const err = useRouteError();
  const is404 = isRouteErrorResponse(err) && err.status === 404;
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
