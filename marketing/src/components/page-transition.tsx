import { AnimatePresence, motion } from "motion/react";
import { useLocation, useOutlet } from "react-router-dom";

/**
 * Cross-fades between routes.
 *
 * The outlet element is captured per render with `useOutlet()` rather than
 * passed in as a live `<Outlet />`: AnimatePresence keeps rendering the old
 * keyed child while it exits, and a live `<Outlet />` inside it would read the
 * NEW route — mounting the incoming page twice (once in the exiting wrapper,
 * again when it enters), doubling every fetch and dropping early input.
 */
export function PageTransition() {
  const location = useLocation();
  const outlet = useOutlet();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}
