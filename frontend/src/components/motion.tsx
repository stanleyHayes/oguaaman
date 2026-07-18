import { useRef, type CSSProperties, type ReactNode, type Ref } from "react";
import { motion, useInView, useReducedMotion, useScroll, useSpring, useTransform, useMotionValue, type Variants } from "motion/react";

// One eased curve for every entrance on the site — a single motion language.
const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

// All primitives honour prefers-reduced-motion via the <MotionConfig
// reducedMotion="user"> wrapper in main.tsx; Parallax additionally checks
// useReducedMotion because scroll-linked transforms bypass MotionConfig.

type MotionTag = "div" | "section" | "article" | "header" | "footer" | "li" | "ul" | "ol" | "p" | "h1" | "h2" | "h3";

const TAGS = {
  div: motion.div,
  section: motion.section,
  article: motion.article,
  header: motion.header,
  footer: motion.footer,
  li: motion.li,
  ul: motion.ul,
  ol: motion.ol,
  p: motion.p,
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
} as const;

const ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
};

/** Fade + rise into view, once. The default entrance for headings and blocks. */
export function Reveal({
  as = "div",
  delay = 0,
  className,
  children,
}: Readonly<{
  as?: MotionTag;
  delay?: number;
  className?: string;
  children: ReactNode;
}>) {
  const M = TAGS[as];
  return (
    <M
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.5, delay, ease: EASE_OUT }}
    >
      {children}
    </M>
  );
}

/** Container that cascades its StaggerItem children in as it scrolls into view. */
export function Stagger({
  as = "div",
  delay = 0,
  className,
  children,
}: Readonly<{
  as?: MotionTag;
  delay?: number;
  className?: string;
  children: ReactNode;
}>) {
  const M = TAGS[as];
  return (
    <M
      className={className}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: delay } } }}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
    >
      {children}
    </M>
  );
}

/**
 * One child of a Stagger container. Pass `index` to use it standalone inside a
 * plain grid instead — each item then reveals as it scrolls into view with a
 * delay capped at the first screenful, so long lists stay cheap. `lift` adds a
 * subtle hover rise for cards that don't already lift themselves via CSS.
 */
export function StaggerItem({
  as = "div",
  index,
  lift = false,
  className,
  children,
}: Readonly<{
  as?: MotionTag;
  index?: number;
  lift?: boolean;
  className?: string;
  children: ReactNode;
}>) {
  const M = TAGS[as];
  const hover = lift ? { y: -4 } : undefined;
  if (index !== undefined) {
    const delay = Math.min(index, 8) * 0.05;
    return (
      <M
        className={className}
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        whileHover={hover}
        viewport={{ once: true, margin: "0px 0px -8% 0px" }}
        transition={{ duration: 0.45, delay, ease: EASE_OUT }}
      >
        {children}
      </M>
    );
  }
  return (
    <M className={className} variants={ITEM_VARIANTS} whileHover={hover}>
      {children}
    </M>
  );
}

/** Scroll-linked vertical drift for background layers. Pure transform. */
export function Parallax({
  strength = 40,
  className,
  style,
  children,
}: Readonly<{
  strength?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [strength, -strength]);
  return (
    <motion.div ref={ref} className={className} style={{ ...style, y: reduce ? 0 : y }}>
      {children}
    </motion.div>
  );
}

/** Circular clip-path wipe for cover images and portraits. */
export function CircularReveal({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  return (
    <motion.div
      className={className}
      initial={{ clipPath: "circle(0% at 50% 50%)" }}
      whileInView={{ clipPath: "circle(75% at 50% 50%)" }}
      viewport={{ once: true, margin: "0px 0px -15% 0px" }}
      transition={{ duration: 0.7, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

/** Perspective wrapper: the child tilts up out of a rotateX as it scrolls in. */
export function Reveal3D({ className, children }: Readonly<{ className?: string; children: ReactNode }>) {
  return (
    <div className={className} style={{ perspective: 1200 }}>
      <motion.div
        initial={{ opacity: 0, rotateX: 12, y: 24 }}
        whileInView={{ opacity: 1, rotateX: 0, y: 0 }}
        viewport={{ once: true, margin: "0px 0px -10% 0px" }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Shared-layout background that slides between active pills and filter chips. */
export function LayoutPill({ layoutId, className }: Readonly<{ layoutId: string; className: string }>) {
  return (
    <motion.span
      layoutId={layoutId}
      aria-hidden
      className={className}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
    />
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
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT } },
};

/**
 * Splits a headline into words and reveals them with a staggered fade-up.
 * The split is visual only; `aria-label` preserves the full sentence for
 * screen readers.
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
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
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
 * Strength is kept subtle (default 12 px) and respects prefers-reduced-motion.
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
