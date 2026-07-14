import { createBrowserRouter } from "react-router-dom";
import { AdminLayout, AdminError } from "./components/layout";

export const router = createBrowserRouter([
  {
    element: <AdminLayout />,
    errorElement: <AdminError />,
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
      { path: "revenue", lazy: () => import("./pages/Revenue") },
      { path: "reports", lazy: () => import("./pages/Reports") },
      { path: "incidents", lazy: () => import("./pages/Incidents") },
      { path: "newsroom", lazy: () => import("./pages/Newsroom") },
      { path: "newsroom/new", lazy: () => import("./pages/NewsroomEditor") },
      { path: "newsroom/:id", lazy: () => import("./pages/NewsroomEditor") },
      { path: "notifications", lazy: () => import("./pages/Notifications") },
      { path: "profile", lazy: () => import("./pages/Profile") },
      { path: "settings", lazy: () => import("./pages/Settings") },
      { path: "audit", lazy: () => import("./pages/Audit") },
      { path: "compose", lazy: () => import("./pages/Compose") },
    ],
  },
]);
