import { useRef, type ReactNode } from "react";
import {
  motion,
  useScroll,
  useTransform,
  type Variants,
} from "motion/react";

/**
 * Motion primitives for the admin console — small, composable wrappers around
 * motion/react. Everything animates transform/opacity only, fires once when
 * scrolled into view, and bows to prefers-reduced-motion via the MotionConfig
 * at the app root.
 */

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const VIEWPORT = { once: true, margin: "-80px" } as const;

const CONTAINER: Variants = { hidden: {}, show: {} };

/** Per-item fade-up; delay comes from the item's `index`, capped at 8 steps. */
const ITEM: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: Math.min(i, 8) * 0.07, ease: EASE },
  }),
};

/** Fade + rise into view, once. */
export function Reveal({
  children,
  className,
  delay = 0,
}: Readonly<{
  children: ReactNode;
  className?: string;
  delay?: number;
}>) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

type StaggerTag = "div" | "ul" | "ol" | "dl" | "tbody";

const STAGGER_TAGS = {
  div: motion.div,
  ul: motion.ul,
  ol: motion.ol,
  dl: motion.dl,
  tbody: motion.tbody,
} as const;

/** Container that ripples its StaggerItem children in on scroll, once. */
export function Stagger({
  children,
  className,
  as = "div",
}: Readonly<{
  children: ReactNode;
  className?: string;
  as?: StaggerTag;
}>) {
  const Tag = STAGGER_TAGS[as];
  return (
    <Tag
      className={className}
      variants={CONTAINER}
      initial="hidden"
      whileInView="show"
      viewport={VIEWPORT}
    >
      {children}
    </Tag>
  );
}

type ItemTag = "div" | "li" | "article" | "tr";

const ITEM_TAGS = {
  div: motion.div,
  li: motion.li,
  article: motion.article,
  tr: motion.tr,
} as const;

/** One child of a Stagger container. `index` sets the (capped) ripple delay. */
export function StaggerItem({
  children,
  className,
  as = "div",
  index = 0,
}: Readonly<{
  children: ReactNode;
  className?: string;
  as?: ItemTag;
  index?: number;
}>) {
  const Tag = ITEM_TAGS[as];
  return (
    <Tag className={className} variants={ITEM} custom={index}>
      {children}
    </Tag>
  );
}

/** Drifts its content on the Y axis as the element crosses the viewport. */
export function Parallax({
  children,
  className,
  distance = 40,
}: Readonly<{
  children: ReactNode;
  className?: string;
  distance?: number;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  return (
    <motion.div ref={ref} className={className} style={{ y }}>
      {children}
    </motion.div>
  );
}

/** Wipes its content in with an expanding circular clip-path, once. */
export function CircularReveal({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  return (
    <motion.div
      className={className}
      initial={{ clipPath: "circle(0% at 50% 45%)" }}
      whileInView={{ clipPath: "circle(100% at 50% 45%)" }}
      viewport={VIEWPORT}
      transition={{ duration: 0.9, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Tilts in from a shallow rotateX and settles flat, with perspective. */
export function Reveal3D({
  children,
  className,
  delay = 0,
}: Readonly<{
  children: ReactNode;
  className?: string;
  delay?: number;
}>) {
  return (
    <div className={className} style={{ perspective: 1200 }}>
      <motion.div
        className="h-full"
        initial={{ opacity: 0, rotateX: -16, y: 36 }}
        whileInView={{ opacity: 1, rotateX: 0, y: 0 }}
        viewport={VIEWPORT}
        transition={{ duration: 0.8, delay, ease: EASE }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {children}
      </motion.div>
    </div>
  );
}
