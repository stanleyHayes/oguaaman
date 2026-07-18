import { useSyncExternalStore } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "@/router";
import { AppShellSkeleton } from "@/components/skeleton";

const subscribeToRouter = (onStoreChange: () => void) => router.subscribe(onStoreChange);
const routerIsReady = () => router.state.initialized;

/** Keeps the first lazy route from flashing a blank document during cold boot. */
export function AdminRouter() {
  const initialized = useSyncExternalStore(subscribeToRouter, routerIsReady, routerIsReady);
  if (!initialized) return <AppShellSkeleton pathname={window.location.pathname} />;
  return <RouterProvider router={router} />;
}
