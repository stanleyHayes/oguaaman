import { motion } from "motion/react";
import type { SplashLine } from "@/lib/splash-lines";

// An eye-catching splash line: a colour-coded category badge + icon, the text
// revealed word-by-word (blur → sharp), a big decorative glyph, and a drawing
// underline. Re-key on rotation (`<SplashQuote key={i} …/>`) so it replays.

type Glyph = "quote" | "sparkle" | "leaf";

function category(kind: string): { text: string; chip: string; glyph: Glyph } {
  if (kind === "Did you know") return { text: "text-clay-text", chip: "border-clay-text/30 bg-clay-text/10", glyph: "sparkle" };
  if (kind === "The town’s code") return { text: "text-green-text", chip: "border-green-text/30 bg-green-text/10", glyph: "leaf" };
  return { text: "text-gold", chip: "border-gold/30 bg-gold/10", glyph: "quote" };
}

function CatIcon({ glyph, className = "h-3 w-3" }: Readonly<{ glyph: Glyph; className?: string }>) {
  if (glyph === "sparkle") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
        <path d="M12 1.8l1.9 6.5 6.5 1.9-6.5 1.9L12 18.6l-1.9-6.5L3.6 10.2l6.5-1.9z" />
      </svg>
    );
  }
  if (glyph === "leaf") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 20s-1-8 6-12 9-4 9-4 1 8-6 12-9 4-9 4z" />
        <path d="M5 20 18 7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M6.5 6.5h5v6a4 4 0 0 1-4 4v-2.2a1.8 1.8 0 0 0 1.8-1.8H6.5zM14 6.5h5v6a4 4 0 0 1-4 4v-2.2a1.8 1.8 0 0 0 1.8-1.8H14z" />
    </svg>
  );
}

const EASE = [0.22, 1, 0.36, 1] as const;

export function SplashQuote({ line }: Readonly<{ line: SplashLine }>) {
  const cat = category(line.kind);
  const words = line.text.split(" ");

  return (
    <div className="relative mt-2 flex max-w-md flex-col items-center px-4 text-center" aria-live="polite">
      {/* decorative glyph behind the text */}
      <motion.div
        aria-hidden
        className={`pointer-events-none absolute -top-8 ${cat.text}`}
        initial={{ opacity: 0, scale: 0.5, rotate: -12 }}
        animate={{ opacity: 0.12, scale: 1, rotate: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
      >
        <CatIcon glyph={cat.glyph} className="h-16 w-16" />
      </motion.div>

      {/* category badge */}
      <motion.span
        initial={{ opacity: 0, y: 8, scale: 0.85 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
        className={`relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.58rem] font-bold uppercase tracking-[0.22em] ${cat.chip} ${cat.text}`}
      >
        <CatIcon glyph={cat.glyph} className="h-3 w-3" />
        {line.kind}
      </motion.span>

      {/* the line, word by word */}
      <p className="relative mt-3 text-[0.95rem] font-medium leading-relaxed text-cream/90 sm:text-base">
        {words.map((word, idx) => (
          <motion.span
            key={idx}
            className="inline-block"
            initial={{ opacity: 0, y: 10, filter: "blur(5px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ delay: 0.16 + idx * 0.045, duration: 0.44, ease: EASE }}
          >
            {word}
            {idx < words.length - 1 ? " " : ""}
          </motion.span>
        ))}
      </p>

      {/* drawing underline */}
      <motion.span
        aria-hidden
        className={`mt-4 block h-px w-16 origin-center bg-current ${cat.text}`}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 0.55 }}
        transition={{ delay: 0.2, duration: 0.7, ease: EASE }}
      />
    </div>
  );
}
