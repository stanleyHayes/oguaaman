import { useId, useRef, useState } from "react";
import { api } from "@/lib/api";

/**
 * Admin AI writing assistant bar (spec §8.12). Works on the SELECTION or the
 * WHOLE field; previews before applying; the model is called server-side via the
 * Go API (/api/ai) — the key never reaches the browser.
 */

type Action =
  | "formalize" | "casual" | "clarity" | "grammar" | "expand"
  | "summarize" | "title" | "email" | "prompt" | "translate";

const REWRITE: { a: Action; ic: string; label: string }[] = [
  { a: "formalize", ic: "◆", label: "Formalize" },
  { a: "casual", ic: "☺", label: "Make casual" },
  { a: "clarity", ic: "✦", label: "Improve clarity" },
  { a: "grammar", ic: "✓", label: "Fix grammar" },
  { a: "expand", ic: "⤢", label: "Expand" },
  { a: "summarize", ic: "≣", label: "Summarize" },
];
const GENERATE: { a: Action; ic: string; label: string }[] = [
  { a: "title", ic: "H", label: "Title / headline" },
  { a: "email", ic: "✉", label: "Email / message" },
  { a: "prompt", ic: "✎", label: "Create from prompt" },
];
const LABELS: Record<Action, string> = {
  formalize: "Formalize", casual: "Make casual", clarity: "Improve clarity", grammar: "Fix grammar",
  expand: "Expand", summarize: "Summarize", title: "Title / headline", email: "Email / message",
  prompt: "Created from prompt", translate: "Translate",
};
const LANGS = ["Fante", "Twi", "Ga", "Ewe", "French"];

export function AiWritingBar({
  label = "Body",
  initialTitle = "",
  initialBody = "",
  showTitle = true,
  rows = 7,
  value,
  onChange,
}: Readonly<{
  label?: string;
  initialTitle?: string;
  initialBody?: string;
  /** Hide the built-in Title input — useful when embedding next to a form's own title field. */
  showTitle?: boolean;
  rows?: number;
  /** Controlled body value. When provided the bar mirrors the parent's field. */
  value?: string;
  /** Called whenever the body changes (typing or applying an AI result). */
  onChange?: (next: string) => void;
}>) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState(initialTitle);
  const controlled = value !== undefined;
  const [internalBody, setInternalBody] = useState(initialBody);
  const body = controlled ? value : internalBody;
  function setBody(next: string) {
    if (!controlled) setInternalBody(next);
    onChange?.(next);
  }
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState({ start: 0, end: 0, active: false, words: 0 });
  const [mode, setMode] = useState<"actions" | "prompt" | "lang">("actions");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<Action | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [language, setLanguage] = useState("Twi");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const titleId = useId();
  const bodyId = useId();

  function flashToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 1600);
  }
  function refreshScope() {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    if (e > s) {
      const words = body.slice(s, e).trim().split(/\s+/).filter(Boolean).length;
      setSel({ start: s, end: e, active: true, words });
    } else setSel({ start: 0, end: 0, active: false, words: 0 });
  }
  function resetViews() { setResult(null); setError(null); setLimit(false); setMode("actions"); }
  function openPanel() { setOpen(true); refreshScope(); resetViews(); }

  async function run(action: Action) {
    if (action === "prompt") return setMode("prompt");
    if (action === "translate") return setMode("lang");
    await doFetch(action);
  }

  async function doFetch(action: Action) {
    setLastAction(action);
    setResult(null); setError(null); setLimit(false); setLoading(true);
    const text = sel.active ? body.slice(sel.start, sel.end) : body;
    try {
      const data = await api.ai({
        action, text,
        language: action === "translate" ? language : undefined,
        prompt: action === "prompt" ? promptText : undefined,
      });
      setResult(data.result);
      setSimulated(Boolean(data.simulated));
      if (typeof data.remaining === "number") setRemaining(data.remaining);
    } catch (err) {
      if ((err as { status?: number }).status === 429) setLimit(true);
      else setError("Something went wrong generating that. Your text is unchanged.");
    } finally {
      setLoading(false);
    }
  }

  function applyReplace() {
    if (result == null) return;
    setBody(sel.active ? body.slice(0, sel.start) + result + body.slice(sel.end) : result);
    setConfirmOpen(false); setOpen(false); flashToast("Text replaced");
  }
  function applyInsert() {
    if (result == null) return;
    setBody(body.trimEnd() + "\n\n" + result);
    setOpen(false); flashToast("Inserted below");
  }
  function copyResult() {
    if (result == null) return;
    navigator.clipboard?.writeText(result).catch(() => {});
    flashToast("Copied");
  }

  const wordLabel = sel.words === 1 ? "word" : "words";
  const scopeLabel = sel.active ? `selection · ${sel.words} ${wordLabel}` : "whole field";

  return (
    <div className="relative">
      <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)]">
        {showTitle && (<>
          <label htmlFor={titleId} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-faint">Title</label>
          <input id={titleId} value={title} onChange={(e) => setTitle(e.target.value)} className="mb-5 w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-lg font-semibold text-ink focus:border-green focus:outline-none" />
        </>)}
        <label htmlFor={bodyId} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</label>
        <textarea
          id={bodyId}
          ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)}
          onSelect={refreshScope} onKeyUp={refreshScope} onMouseUp={refreshScope} rows={rows}
          className="w-full resize-y rounded-lg border border-sand bg-paper p-3.5 leading-relaxed text-ink focus:border-green focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className={`flex items-center gap-2 text-sm ${sel.active ? "font-medium text-ai" : "text-ink-faint"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${sel.active ? "bg-ai" : "bg-ink-faint"}`} aria-hidden />
            Working on the {scopeLabel}
          </span>
          <button type="button" onClick={openPanel} className="inline-flex items-center gap-2 rounded-lg bg-ai px-4 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-px">
            <Sparkle /> Ask AI
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 overflow-hidden rounded-[var(--radius-card)] border border-ai-line bg-ai-tint">
          <div className="flex items-center justify-between border-b border-ai-line px-4 py-3">
            <span className="flex items-center gap-2 font-semibold text-ai">
              <Sparkle /> AI assistant
              <span className="rounded-md bg-ai px-2 py-0.5 font-mono text-[0.65rem] font-medium text-white">{scopeLabel}</span>
            </span>
            <div className="flex items-center gap-3">
              {remaining != null && <span className="text-xs text-ink-faint">{remaining} left today</span>}
              <button type="button" onClick={() => setOpen(false)} className="text-xl leading-none text-ink-faint hover:text-ink" aria-label="Close">×</button>
            </div>
          </div>

          {mode === "actions" && !loading && !result && !limit && (
            <div className="p-4">
              <Group label="Rewrite">{REWRITE.map((b) => <ActBtn key={b.a} onClick={() => run(b.a)} ic={b.ic} label={b.label} />)}</Group>
              <Group label="Generate">{GENERATE.map((b) => <ActBtn key={b.a} onClick={() => run(b.a)} ic={b.ic} label={b.label} />)}</Group>
              <Group label="Translate"><ActBtn onClick={() => run("translate")} ic="⇄" label="Translate" /></Group>
            </div>
          )}

          {mode === "prompt" && (
            <div className="flex flex-wrap gap-2 px-4 pb-4 pt-4">
              <input autoFocus value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder="Describe what you want, e.g. 'a short invite to the prize-giving day'…" className="min-w-[12rem] flex-1 rounded-lg border border-ai-line bg-white px-3 py-2.5 text-sm focus:border-ai focus:outline-none" />
              <button onClick={() => doFetch("prompt")} className="rounded-lg bg-ai px-4 py-2.5 text-sm font-semibold text-white">Generate</button>
            </div>
          )}

          {mode === "lang" && (
            <div className="flex flex-wrap gap-2 px-4 pb-4 pt-4">
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="min-w-[10rem] flex-1 rounded-lg border border-ai-line bg-white px-3 py-2.5 text-sm focus:border-ai focus:outline-none">
                {LANGS.map((l) => <option key={l}>{l}</option>)}
              </select>
              <button onClick={() => doFetch("translate")} className="rounded-lg bg-ai px-4 py-2.5 text-sm font-semibold text-white">Translate</button>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-3 px-4 py-8 font-medium text-ai">
              <span className="animate-spin rounded-full border-2 border-ai-line border-t-ai" style={{ width: 18, height: 18 }} /> Writing…
            </div>
          )}

          {error && (
            <div className="mx-4 mb-4 flex items-center justify-between gap-3 rounded-lg border border-[#F0D2C9] bg-[#FCEEEA] px-4 py-3 text-sm text-clay-text">
              <span>{error}</span>
              {lastAction && <button onClick={() => doFetch(lastAction)} className="rounded-md border border-clay px-3 py-1 font-semibold">Try again</button>}
            </div>
          )}

          {limit && <div className="mx-4 mb-4 rounded-lg border border-[#F0E0BB] bg-[#FFF7E8] p-4 text-center text-sm text-gold-text">You've reached today's AI limit. It resets at midnight.</div>}

          {result != null && (
            <div className="border-t border-ai-line">
              <div className="flex items-center justify-between px-4 pt-3">
                <span className="text-sm font-semibold text-ink">Preview</span>
                <span className="text-xs text-ink-faint">
                  {sel.active ? "from your selection" : "from the whole field"}{lastAction ? ` · ${LABELS[lastAction]}` : ""}{simulated ? " · simulated" : ""}
                </span>
              </div>
              <div className="mx-4 my-2.5 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-ai-line bg-white p-4 text-sm leading-relaxed text-ink">{result}</div>
              <div className="flex flex-wrap gap-2 px-4 pb-4">
                <button onClick={() => setConfirmOpen(true)} className="rounded-lg bg-green px-4 py-2 text-sm font-semibold text-cream hover:bg-green-900">Replace</button>
                <button onClick={applyInsert} className="rounded-lg border border-sand bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-ink">Insert below</button>
                <button onClick={copyResult} className="rounded-lg border border-sand bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-ink">Copy</button>
                <button onClick={resetViews} className="rounded-lg border border-[#EAD7D1] px-4 py-2 text-sm font-semibold text-clay-text hover:bg-[#FCEEEA]">Discard</button>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-center text-xs text-ink-faint">The bar calls the model server-side — keys never reach the browser. Every output is a draft; you always decide what is kept.</p>

      {confirmOpen && (
        <dialog open className="fixed inset-0 z-50 flex h-full w-full items-center justify-center border-0 bg-ink/40 p-5" aria-modal>
          <div className="w-full max-w-sm rounded-[var(--radius-card)] bg-white p-6 text-center shadow-[var(--shadow-lift)]">
            <h3 className="font-display text-xl font-semibold text-ink">Replace current text?</h3>
            <p className="mt-2 text-sm text-ink-muted">This will overwrite {sel.active ? "your selected text" : "what's in the field"}. This can't be undone.</p>
            <div className="mt-5 flex justify-center gap-3">
              <button onClick={() => setConfirmOpen(false)} className="rounded-lg border border-sand px-5 py-2 text-sm font-semibold text-ink">Cancel</button>
              <button onClick={applyReplace} className="rounded-lg bg-maroon-900 px-5 py-2 text-sm font-semibold text-white">Replace</button>
            </div>
          </div>
        </dialog>
      )}

      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-cream shadow-lg">{toast}</div>}
    </div>
  );
}

function Sparkle() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6z" />
      <path d="M19 14l.8 2.6L22 17l-2.2.4L19 20l-.8-2.6L16 17l2.2-.4z" />
    </svg>
  );
}
function Group({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-ink-faint">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
function ActBtn({ onClick, ic, label }: Readonly<{ onClick: () => void; ic: string; label: string }>) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-lg border border-ai-line bg-white px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-ai hover:text-ai">
      <span aria-hidden>{ic}</span>{label}
    </button>
  );
}
