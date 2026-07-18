import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Lightbulb, ListChecks, Square, Volume2, X } from "lucide-react";
import { creatorHelpSpeech, type CreatorHelpTopic } from "@/lib/help";

type ReaderState = "idle" | "speaking" | "error";
const SPEECH_READER_EVENT = "oguaa:creator-speech-reader";

function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function preferredVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  return english.find((voice) => voice.lang.toLowerCase() === "en-gh")
    ?? english.find((voice) => voice.name.toLowerCase().includes("ghana"))
    ?? english.find((voice) => voice.lang.toLowerCase() === "en-gb")
    ?? english[0];
}

export function SpeechControls({ text, label, className = "" }: Readonly<{ text: string; label: string; className?: string }>) {
  const supported = speechAvailable();
  const readerId = useId();
  const [readerState, setReaderState] = useState<ReaderState>("idle");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setReaderState("idle");
  }, [supported]);

  useEffect(() => () => {
    if (supported && utteranceRef.current) window.speechSynthesis.cancel();
    utteranceRef.current = null;
  }, [supported]);

  // SpeechSynthesis is document-global. When one guide starts, reset every
  // other reader so buttons cannot remain visibly stuck in a stale state.
  useEffect(() => {
    const onReaderStart = (event: Event) => {
      const detail = (event as CustomEvent<{ readerId: string }>).detail;
      if (detail.readerId === readerId) return;
      utteranceRef.current = null;
      setReaderState("idle");
    };
    window.addEventListener(SPEECH_READER_EVENT, onReaderStart);
    return () => window.removeEventListener(SPEECH_READER_EVENT, onReaderStart);
  }, [readerId]);

  const listen = () => {
    if (!supported) return;
    window.dispatchEvent(new CustomEvent(SPEECH_READER_EVENT, { detail: { readerId } }));
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = preferredVoice(window.speechSynthesis.getVoices());
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? "en-GH";
    utterance.rate = 0.94;
    utterance.pitch = 1;
    utterance.onstart = () => {
      if (utteranceRef.current === utterance) setReaderState("speaking");
    };
    utterance.onend = () => {
      if (utteranceRef.current === utterance) {
        utteranceRef.current = null;
        setReaderState("idle");
      }
    };
    utterance.onerror = (event) => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null;
      setReaderState(event.error === "canceled" || event.error === "interrupted" ? "idle" : "error");
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  if (!supported) {
    return (
      <p role="status" className={`rounded-xl border border-sand bg-paper px-3 py-2 text-xs leading-relaxed text-ink-muted ${className}`}>
        Read-aloud is not available in this browser. The written guide remains available below.
      </p>
    );
  }

  const speaking = readerState === "speaking";
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={speaking ? stop : listen}
        aria-label={speaking ? `Stop reading ${label}` : `Listen to ${label}`}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
          speaking
            ? "border border-clay/35 bg-clay/[0.08] text-clay-text hover:bg-clay/[0.14]"
            : "border border-gold-border/45 bg-gold/[0.12] text-gold-text hover:bg-gold/[0.2]"
        }`}
      >
        {speaking ? <Square size={14} fill="currentColor" aria-hidden /> : <Volume2 size={16} aria-hidden />}
        {speaking ? "Stop" : "Listen"}
      </button>
      <span
        role="status"
        aria-live="polite"
        className={readerState === "idle" ? "sr-only" : "text-xs font-medium text-ink-muted"}
      >
        {readerState === "speaking" && `Reading ${label} aloud.`}
        {readerState === "error" && "The guide could not be read aloud. Please try again or read the text below."}
      </span>
    </div>
  );
}

export function ContextualHelp({ topic, onClose, returnFocusRef }: Readonly<{ topic: CreatorHelpTopic; onClose: () => void; returnFocusRef: RefObject<HTMLButtonElement | null> }>) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocusTarget = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
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
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      window.speechSynthesis?.cancel();
      returnFocusTarget?.focus();
    };
  }, [onClose, returnFocusRef]);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-50 cursor-default bg-green-900/55 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close page help"
      />
      <aside
        ref={panelRef}
        id="creator-context-help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="creator-context-help-title"
        className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-md flex-col overflow-hidden border-l border-sand bg-cream shadow-2xl"
      >
        <div className="relative overflow-hidden border-b border-sand bg-green-900 px-6 pb-6 pt-5 text-on-green">
          <span aria-hidden className="pointer-events-none absolute -right-8 -top-14 font-display text-[9rem] leading-none text-white/[0.04]">?</span>
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-gold">Help for this page</p>
              <h2 id="creator-context-help-title" className="mt-2 text-3xl font-semibold !text-on-green">{topic.title}</h2>
              <p className="mt-1 text-sm text-on-green/65">{topic.kicker}</p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close page help"
              className="grid min-h-11 min-w-11 place-items-center rounded-full border border-white/15 bg-white/[0.07] text-on-green transition-colors hover:bg-white/[0.14]"
            >
              <X size={19} aria-hidden />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <p className="text-[0.96rem] leading-7 text-ink-muted">{topic.overview}</p>

          <SpeechControls text={creatorHelpSpeech(topic)} label={`${topic.title} guide`} className="mt-5" />

          <section className="mt-7" aria-labelledby="context-help-steps">
            <div className="flex items-center gap-2 text-green-text">
              <ListChecks size={17} aria-hidden />
              <h3 id="context-help-steps" className="text-xs font-bold uppercase tracking-[0.14em]">What to do</h3>
            </div>
            <ol className="mt-3 space-y-3">
              {topic.steps.map((step, index) => (
                <li key={step} className="flex gap-3 rounded-xl border border-sand bg-paper px-4 py-3 text-sm leading-6 text-ink-muted">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-green text-xs font-bold text-on-green">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-7 rounded-2xl border border-gold-border/35 bg-gold/[0.09] p-5" aria-labelledby="context-help-tips">
            <div className="flex items-center gap-2 text-gold-text">
              <Lightbulb size={17} aria-hidden />
              <h3 id="context-help-tips" className="text-xs font-bold uppercase tracking-[0.14em]">Useful to know</h3>
            </div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-muted">
              {topic.tips.map((tip) => <li key={tip} className="flex gap-2"><span aria-hidden className="text-gold-text">•</span><span>{tip}</span></li>)}
            </ul>
          </section>
        </div>

        <div className="border-t border-sand bg-paper px-6 py-4">
          <Link
            to="/help"
            onClick={onClose}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-green px-5 text-sm font-semibold text-on-green transition-colors hover:bg-green-900"
          >
            <BookOpen size={16} aria-hidden />
            Browse the full user guide
          </Link>
        </div>
      </aside>
    </>
  );
}
