import { createBrowserRouter } from "react-router-dom";
import { AdminLayout, AdminError, PageError } from "./components/layout";

type AdminBrowserRouter = ReturnType<typeof createBrowserRouter>;

/** Builds a fresh router. It is created only after sign-in (and once per
 *  session), because creating it starts the first navigation and runs its
 *  loaders — before sign-in they would 403 and the error (or the previous
 *  user's data) would be cached into the next session. */
function createAdminRouter(): AdminBrowserRouter {
  return createBrowserRouter([
  {
    element: <AdminLayout />,
    errorElement: <AdminError />,
    children: [
     {
      // Page-level boundary: a failing loader (a 403 for a role, an outage)
      // renders inside the shell, so the sidebar stays usable.
      errorElement: <PageError />,
      children: [
      { index: true, lazy: () => import("./pages/Overview") },
      { path: "moderation", lazy: () => import("./pages/Moderation") },
      { path: "listings", lazy: () => import("./pages/Listings") },
      { path: "listings/:id", lazy: () => import("./pages/ListingDetail") },
      { path: "members", lazy: () => import("./pages/Members") },
      { path: "members/:slug", lazy: () => import("./pages/MemberDetail") },
      { path: "institutions", lazy: () => import("./pages/Institutions") },
      { path: "institutions/:slug", lazy: () => import("./pages/InstitutionDetail") },
      { path: "places", lazy: () => import("./pages/Places") },
      { path: "claims", lazy: () => import("./pages/Claims") },
      { path: "projects", lazy: () => import("./pages/Projects") },
      { path: "tickets", lazy: () => import("./pages/Tickets") },
      { path: "subscriptions", lazy: () => import("./pages/Subscriptions") },
      { path: "plans", lazy: () => import("./pages/Plans") },
      { path: "revenue", lazy: () => import("./pages/Revenue") },
      { path: "commerce", lazy: () => import("./pages/Commerce") },
      { path: "reports", lazy: () => import("./pages/Reports") },
      { path: "incidents", lazy: () => import("./pages/Incidents") },
      { path: "directives", lazy: () => import("./pages/Directives") },
      { path: "goals", lazy: () => import("./pages/Goals") },
      { path: "civic", lazy: () => import("./pages/CivicPledges") },
      { path: "outside-agents", lazy: () => import("./pages/OutsideAgents") },
      { path: "outside-disputes", lazy: () => import("./pages/OutsideDisputes") },
      { path: "newsroom", lazy: () => import("./pages/Newsroom") },
      { path: "newsroom/new", lazy: () => import("./pages/NewsroomEditor") },
      { path: "newsroom/research", lazy: () => import("./pages/NewsroomResearch") },
      { path: "newsroom/desk", lazy: () => import("./pages/NewsDesk") },
      { path: "newsroom/:id", lazy: () => import("./pages/NewsroomEditor") },
      { path: "ads", lazy: () => import("./pages/Ads") },
      { path: "ads/:id", lazy: () => import("./pages/AdDetail") },
      { path: "ad-sponsors", lazy: () => import("./pages/AdSponsors") },
      { path: "ad-pricing", lazy: () => import("./pages/AdPricing") },
      { path: "ad-report", lazy: () => import("./pages/AdReport") },
      { path: "elections", lazy: () => import("./pages/Elections") },
      { path: "notifications", lazy: () => import("./pages/Notifications") },
      { path: "profile", lazy: () => import("./pages/Profile") },
      { path: "settings", lazy: () => import("./pages/Settings") },
      { path: "audit", lazy: () => import("./pages/Audit") },
      { path: "compose", lazy: () => import("./pages/Compose") },
      { path: "privacy-requests", lazy: () => import("./pages/PrivacyRequests") },
      { path: "help", lazy: () => import("./pages/Help") },
      ],
     },
    ],
  },
  ]);
}

let current: { key: string; router: AdminBrowserRouter } | null = null;

/** The router for one signed-in session (key = member + session counter).
 *  A new session disposes the previous router and its cached loader data. */
export function routerFor(key: string): AdminBrowserRouter {
  if (current?.key === key) return current.router;
  current?.router.dispose();
  current = { key, router: createAdminRouter() };
  return current.router;
}
