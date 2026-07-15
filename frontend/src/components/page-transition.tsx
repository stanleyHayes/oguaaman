import { AnimatePresence, motion } from "motion/react";
import { useLocation } from "react-router-dom";
import type { ReactNode } from "react";

// PageTransition provides a per-navigation enter animation. We intentionally
// do NOT use mode="wait" or an exit variant here: <Outlet /> is a router
// context consumer that always renders the *current* route. If we kept
// mode="wait" + exit, the exiting (old-key) motion.div would already be
// showing the new page while fading out — causing the new page to "flash in
// then disappear" before entering again. Dropping mode="wait" and exit means
// the old key unmounts instantly and only the enter animation runs, giving a
// clean fade-in-from-below on every page navigation.
export function PageTransition({ children }: Readonly<{ children: ReactNode }>) {
  const location = useLocation();
  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
