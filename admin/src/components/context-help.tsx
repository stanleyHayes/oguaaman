import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle2, Lightbulb, X } from "lucide-react";
import { ReadAloudControls } from "@/components/read-aloud";
import { helpTopicToSpeech, type HelpTopic } from "@/lib/help-content";

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function ContextHelp({
  topic,
  onClose,
}: Readonly<{
  topic: HelpTopic;
  onClose: () => void;
}>) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
        .filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close page help"
        className="absolute inset-0 h-full w-full cursor-default bg-green-900/55 backdrop-blur-[2px]"
      />
      <aside
        id="admin-context-help"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="context-help-title"
        aria-describedby="context-help-summary"
        className="absolute inset-y-0 right-0 flex w-full max-w-[31rem] flex-col border-l border-sand bg-paper shadow-[-24px_0_70px_rgba(5,21,14,0.24)]"
      >
        <header className="relative overflow-hidden border-b border-sand bg-green px-5 pb-6 pt-5 text-on-green sm:px-7">
          <span aria-hidden className="absolute -right-7 -top-12 font-display text-[10rem] leading-none text-white/[0.04]">?</span>
          <div className="relative flex items-start justify-between gap-5">
            <div className="flex min-w-0 items-start gap-3.5">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 text-gold">
                <BookOpen size={21} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-gold">{topic.category} · Page guide</p>
                <h2 id="context-help-title" className="mt-1 text-2xl font-semibold text-on-green">{topic.title}</h2>
              </div>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close page help"
              className="grid size-11 shrink-0 place-items-center rounded-full border border-white/15 bg-white/[0.08] text-on-green transition-colors hover:bg-white/15"
            >
              <X size={17} aria-hidden />
            </button>
          </div>
          <p id="context-help-summary" className="relative mt-4 max-w-md text-sm leading-relaxed text-on-green/80">{topic.summary}</p>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
          <section aria-labelledby="context-help-steps">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.17em] text-gold-text">{topic.kicker}</p>
            <h3 id="context-help-steps" className="mt-1 text-lg font-semibold text-ink">A useful way through</h3>
            <ol className="mt-4 space-y-3">
              {topic.steps.map((step, index) => (
                <li key={step} className="flex gap-3 rounded-xl border border-sand bg-cream p-3.5">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-green text-xs font-bold text-on-green">{index + 1}</span>
                  <p className="pt-0.5 text-sm leading-relaxed text-ink-muted">{step}</p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="context-help-tips" className="mt-7 rounded-2xl border border-gold-border/35 bg-gold/[0.08] p-4">
            <div className="flex items-center gap-2 text-gold-text">
              <Lightbulb size={17} aria-hidden />
              <h3 id="context-help-tips" className="text-sm font-bold">Keep in mind</h3>
            </div>
            <ul className="mt-3 space-y-2.5">
              {topic.tips.map((tip) => (
                <li key={tip} className="flex gap-2.5 text-sm leading-relaxed text-ink-muted">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-gold-text" aria-hidden />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="context-help-listen" className="mt-7 border-t border-sand pt-6">
            <h3 id="context-help-listen" className="text-base font-semibold text-ink">Hear this guide</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-faint">Uses the English voice available in your browser, preferring Ghanaian English when installed.</p>
            <ReadAloudControls
              text={helpTopicToSpeech(topic)}
              label={`${topic.title} page guide`}
              resetKey={`admin-context-${topic.id}`}
              compact
              className="mt-3"
            />
          </section>
        </div>

        <footer className="border-t border-sand bg-cream px-5 py-4 sm:px-7">
          <Link
            to="/help"
            onClick={onClose}
            className="flex items-center justify-between gap-4 rounded-xl border border-sand bg-paper px-4 py-3 transition-colors hover:border-gold-border"
          >
            <span>
              <span className="block text-sm font-semibold text-ink">Open the complete user guide</span>
              <span className="mt-0.5 block text-xs text-ink-faint">Browse every back-office topic</span>
            </span>
            <ArrowRight size={17} className="shrink-0 text-gold-text" aria-hidden />
          </Link>
        </footer>
      </aside>
    </div>
  );
}
