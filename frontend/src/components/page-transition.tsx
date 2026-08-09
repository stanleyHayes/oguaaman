import { motion } from "motion/react";
import { useLocation } from "react-router-dom";
import type { ReactNode } from "react";

// PageTransition provides a per-navigation enter animation: a fade-in-from-below
// on every route change.
//
// It deliberately does NOT use AnimatePresence. AnimatePresence keeps an
// exiting child mounted until its removal is acknowledged, and <Outlet /> is a
// router context consumer that always renders the *current* route — so the
// outgoing key rendered a second, full copy of the page we were navigating to.
// Whenever that removal lost the race with the incoming key's enter animation,
// both stayed mounted and the page appeared twice: two heroes, two bodies.
//
// A bare keyed motion.div is all this ever needed. Changing the key makes React
// unmount the old subtree and mount a new one, which runs `initial` → `animate`;
// with nothing tracking exits, two copies cannot coexist. Re-adding
// AnimatePresence here reintroduces the duplicate — use a route-level exit
// animation only if <Outlet /> is snapshotted per location first.
export function PageTransition({ children }: Readonly<{ children: ReactNode }>) {
  const location = useLocation();
  return (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
