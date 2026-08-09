import { createBrowserRouter } from "react-router-dom";
import { RootLayout, RootError } from "./routes/root";
import { seoFor } from "./seo/routes";

// Per-route metadata lives on each route's `handle`; RootLayout reads it via
// useMatches() and updates <title> + description/keywords/OG tags on navigation,
// so every page is shareable and findable (the SPA ships one static tag
// otherwise). The copy itself lives in seo/routes.ts — the same file the build
// reads to prerender each route's <head> and to emit sitemap.xml, so titles
// can never drift between the three.
const handle = (path: string) => {
  const seo = seoFor(path);
  if (!seo) throw new Error(`No SEO entry for route "${path}" — add one in seo/routes.ts`);
  return { title: seo.title, description: seo.description, keywords: seo.keywords };
};

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RootError />,
    children: [
      { index: true, handle: handle("/"), lazy: () => import("./pages/Home") },
      { path: "names", handle: handle("/names"), lazy: () => import("./pages/NamesPage") },
      { path: "better", handle: handle("/better"), lazy: () => import("./pages/BetterCapeCoast") },
      { path: "outside", handle: handle("/outside"), lazy: () => import("./pages/OguaaOutside") },
      { path: "history", handle: handle("/history"), lazy: () => import("./pages/HistoryPage") },
      { path: "culture", handle: handle("/culture"), lazy: () => import("./pages/CulturePage") },
      { path: "festivals", handle: handle("/festivals"), lazy: () => import("./pages/FestivalsPage") },
      { path: "education", handle: handle("/education"), lazy: () => import("./pages/EducationPage") },
      { path: "visit", handle: handle("/visit"), lazy: () => import("./pages/VisitPage") },
      { path: "visit/:slug", lazy: () => import("./pages/VisitPlace") },
      { path: "leadership", handle: handle("/leadership"), lazy: () => import("./pages/LeadershipPage") },
      { path: "news", handle: handle("/news"), lazy: () => import("./pages/NewsPage") },
      { path: "news/:slug", lazy: () => import("./pages/NewsArticlePage") },
      { path: "about", handle: handle("/about"), lazy: () => import("./pages/AboutPage") },
      { path: "contact", handle: handle("/contact"), lazy: () => import("./pages/ContactPage") },
      { path: "privacy", handle: handle("/privacy"), lazy: () => import("./pages/PrivacyPage") },
      { path: "terms", handle: handle("/terms"), lazy: () => import("./pages/TermsPage") },
    ],
  },
]);
