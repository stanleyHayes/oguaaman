import { useRef, type ReactNode, type Ref } from "react";
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useMotionValue,
  type Variants,
} from "motion/react";

/**
 * Motion primitives for the marketing site — small, composable wrappers around
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

const WORD_CONTAINER: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const WORD_ITEM: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/**
 * Splits a headline into words and reveals them with a staggered fade-up.
 * Use for the main hero H1 — the split is visual only; `aria-label` preserves
 * the full sentence for screen readers.
 */
export function WordReveal({
  text,
  className,
  accentWords,
  accentClassName,
  as: Tag = "h1",
}: Readonly<{
  text: string;
  className?: string;
  accentWords?: string[];
  accentClassName?: string;
  as?: "h1" | "h2" | "h3" | "p";
}>) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, VIEWPORT);
  const words = text.split(" ");
  const isAccent = (word: string) =>
    accentWords?.some(
      (aw) => word.replace(/[.,!?;:]+$/, "").toLowerCase() === aw.toLowerCase()
    );
  // Always reveal when reduced motion is preferred; otherwise reveal on scroll.
  const animate = reduce || inView ? "show" : "hidden";

  return (
    <Tag
      ref={ref as Ref<HTMLHeadingElement>}
      className={className}
      aria-label={text}
    >
      <motion.span
        className="inline-block"
        variants={WORD_CONTAINER}
        initial="hidden"
        animate={animate}
      >
        {words.map((word, i) => (
          <motion.span
            key={`${word}-${i}`}
            variants={WORD_ITEM}
            className="mr-[0.25em] inline-block"
          >
            {isAccent(word) ? (
              <span className={accentClassName}>{word}</span>
            ) : (
              word
            )}
          </motion.span>
        ))}
      </motion.span>
    </Tag>
  );
}

/**
 * Magnetically pulls its child toward the cursor while the pointer is inside.
 * Strength is kept subtle (default 12 px) so the effect feels premium, not
 * gimmicky. Respects prefers-reduced-motion.
 */
export function Magnetic({
  children,
  className,
  strength = 12,
}: Readonly<{
  children: ReactNode;
  className?: string;
  strength?: number;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 350, damping: 25 });
  const springY = useSpring(y, { stiffness: 350, damping: 25 });

  const handleMove = (e: React.MouseEvent) => {
    if (!ref.current || reduce) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    x.set(((e.clientX - cx) / rect.width) * strength);
    y.set(((e.clientY - cy) / rect.height) * strength);
  };

  const handleLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <div
      ref={ref}
      className={className}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onBlur={handleLeave}
    >
      <motion.div style={{ x: springX, y: springY }}>{children}</motion.div>
    </div>
  );
}
