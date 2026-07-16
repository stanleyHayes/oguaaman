import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

/**
 * First-login guided tour ("show me around") for the back office.
 * Hand-rolled spotlight: four dim panes around the target's bounding box, a
 * gold ring on the target, and a popover card clamped into the viewport.
 * Steps whose selector can't be resolved fall back to a centred card, so a
 * role-filtered sidebar never breaks the walkthrough.
 */

export interface TourStep {
  /** CSS selector to spotlight; omit for a centred card. */
  selector?: string;
  title: string;
  body: string;
  /** Preferred popover side relative to the target. */
  side?: "right" | "bottom" | "top" | "left";
}

const PAD = 8;
const CARD_W = 340;

export function Tour({ steps, onDone }: Readonly<{ steps: TourStep[]; onDone: () => void }>) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  useLayoutEffect(() => {
    let raf = 0;
    if (!step.selector) {
      raf = requestAnimationFrame(() => setRect(null));
      return () => cancelAnimationFrame(raf);
    }
    const el = document.querySelector(step.selector);
    if (!el) {
      raf = requestAnimationFrame(() => setRect(null));
      return () => cancelAnimationFrame(raf);
    }
    el.scrollIntoView({ block: "nearest" });
    const update = () => setRect(el.getBoundingClientRect());
    raf = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
    };
  }, [i, step.selector]);

  const done = useCallback(() => onDone(), [onDone]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") done();
      if (e.key === "ArrowRight" && !last) setI((v) => Math.min(v + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setI((v) => Math.max(v - 1, 0));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [done, last, steps.length]);

  // Popover position: preferred side, flipped/clamped into the viewport.
  const pop: { top: number; left: number } = (() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!rect) return { top: Math.max(80, vh / 2 - 120), left: vw / 2 - CARD_W / 2 };
    const r = { t: rect.top - PAD, l: rect.left - PAD, b: rect.bottom + PAD, r: rect.right + PAD };
    let top = r.b + 14;
    let left = Math.min(Math.max(16, r.l), vw - CARD_W - 16);
    if (step.side === "right") {
      top = Math.min(Math.max(16, r.t), vh - 240);
      left = r.r + 14;
      if (left + CARD_W > vw - 8) left = Math.min(Math.max(16, r.l), vw - CARD_W - 16);
    } else if (step.side === "top" || top + 220 > vh) {
      top = Math.max(16, r.t - 220);
      // Keep the card over the spotlight, not drifting onto the sidebar.
      if (step.side === "top") left = Math.min(r.l + 8, vw - CARD_W - 16);
    }
    return { top, left };
  })();

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Guided tour">
      {/* Dim panes (or a full dim for centred steps) */}
      {rect ? (
        <>
          <div className="absolute inset-x-0 top-0 bg-ink/55" style={{ height: Math.max(0, rect.top - PAD) }} />
          <div className="absolute inset-x-0 bottom-0 bg-ink/55" style={{ top: rect.bottom + PAD }} />
          <div className="absolute bg-ink/55" style={{ top: rect.top - PAD, height: rect.height + PAD * 2, left: 0, width: Math.max(0, rect.left - PAD) }} />
          <div className="absolute bg-ink/55" style={{ top: rect.top - PAD, height: rect.height + PAD * 2, right: 0, left: rect.right + PAD }} />
          <div
            className="absolute rounded-xl border-2 border-gold-brand shadow-[0_0_0_4px_rgba(199,162,74,0.25)]"
            style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-ink/55" />
      )}

      {/* Popover card */}
      <div className="absolute rounded-2xl border border-sand bg-paper p-5 shadow-xl" style={{ top: pop.top, left: pop.left, width: CARD_W }}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-gold-text">
            Tour · {i + 1} of {steps.length}
          </p>
          <button onClick={done} className="rounded-md p-1 text-ink-faint transition-colors hover:bg-cream hover:text-ink" aria-label="End tour">
            <X size={14} />
          </button>
        </div>
        <h3 className="mt-1.5 text-lg font-semibold text-ink">{step.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <button onClick={done} className="text-xs font-medium text-ink-faint transition-colors hover:text-ink">Skip tour</button>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <button onClick={() => setI(i - 1)} className="inline-flex items-center gap-1 rounded-full border border-sand px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-ink-faint hover:text-ink">
                <ArrowLeft size={12} /> Back
              </button>
            )}
            <button
              onClick={() => (last ? done() : setI(i + 1))}
              className="inline-flex items-center gap-1 rounded-full bg-green px-4 py-1.5 text-xs font-semibold text-cream transition-colors hover:bg-green-900"
            >
              {last ? "Done" : "Next"} {last ? null : <ArrowRight size={12} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
