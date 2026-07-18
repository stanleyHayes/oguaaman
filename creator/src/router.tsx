import { useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { CreatorLayout, CreatorError } from "./components/layout";
import { AppShellSkeleton } from "./components/skeleton";

function buildRouter() {
  return createBrowserRouter([
    {
      element: <CreatorLayout />,
      errorElement: <CreatorError />,
      hydrateFallbackElement: <AppShellSkeleton />,
      children: [
        { index: true, lazy: () => import("./pages/Overview") },
        { path: "work", lazy: () => import("./pages/MyWork") },
        { path: "work/:id/edit", lazy: () => import("./pages/EditListing") },
        { path: "institutions", lazy: () => import("./pages/Institutions") },
        { path: "team", lazy: () => import("./pages/Team") },
        { path: "team/:slug", lazy: () => import("./pages/Team") },
        { path: "write", lazy: () => import("./pages/Write") },
        { path: "grow", lazy: () => import("./pages/Grow") },
        { path: "money", lazy: () => import("./pages/Money") },
        { path: "notifications", lazy: () => import("./pages/Notifications") },
        { path: "account", lazy: () => import("./pages/Account") },
        { path: "settings", lazy: () => import("./pages/Settings") },
        { path: "help", lazy: () => import("./pages/Help") },
      ],
    },
  ]);
}

/**
 * Creates the data router on first post-auth mount. `createBrowserRouter`
 * fires its initial loaders the moment it's constructed, so building it at
 * module scope would call authed endpoints with no token and land on the
 * error boundary before the user even signs in. Mounting under AuthGate
 * guarantees a token is already in localStorage.
 */
export function RouterRoot() {
  const [router] = useState(buildRouter);
  return <RouterProvider router={router} />;
}
