import { useCallback, useSyncExternalStore } from "react";
import { RouterProvider } from "react-router-dom";
import { routerFor } from "@/router";
import { useAuth } from "@/lib/auth";
import { AppShellSkeleton } from "@/components/skeleton";

/** Mounts the router for the signed-in session (F002: never before sign-in,
 *  never shared across users). Keeps the first lazy route from flashing a
 *  blank document during cold boot. */
export function AdminRouter() {
  const { member, session } = useAuth();
  const router = routerFor(`${member?.id ?? "anon"}:${session}`);
  const subscribe = useCallback((onStoreChange: () => void) => router.subscribe(onStoreChange), [router]);
  const isReady = useCallback(() => router.state.initialized, [router]);
  const initialized = useSyncExternalStore(subscribe, isReady, isReady);
  if (!initialized) return <AppShellSkeleton pathname={window.location.pathname} />;
  return <RouterProvider router={router} />;
}
