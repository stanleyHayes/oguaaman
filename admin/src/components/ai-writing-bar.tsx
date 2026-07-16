import { useRef, useState } from "react";
import { api } from "@/lib/api";

type Action = "formalize" | "casual" | "clarity" | "grammar" | "expand" | "summarize" | "title" | "email" | "prompt" | "translate";

const REWRITE: { a: Action; label: string }[] = [
  { a: "formalize", label: "Formalize" }, { a: "casual", label: "Make casual" }, { a: "clarity", label: "Improve clarity" },
  { a: "grammar", label: "Fix grammar" }, { a: "expand", label: "Expand" }, { a: "summarize", label: "Summarize" },
];
const GENERATE: { a: Action; label: string }[] = [
  { a: "title", label: "Title / headline" }, { a: "email", label: "Email / message" }, { a: "prompt", label: "Create from prompt" },
];
const LANGS = ["Fante", "Twi", "Ga", "Ewe", "French"];

export function AiWritingBar({ initialTitle = "", initialBody = "" }: Readonly<{ initialTitle?: string; initialBody?: string }>) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
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

  function refreshScope() {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    if (e > s) setSel({ start: s, end: e, active: true, words: body.slice(s, e).trim().split(/\s+/).filter(Boolean).length });
    else setSel({ start: 0, end: 0, active: false, words: 0 });
  }

  async function run(action: Action) {
    if (action === "prompt") return setMode("prompt");
    if (action === "translate") return setMode("lang");
    await go(action);
  }

  async function go(action: Action) {
    setLastAction(action);
    setResult(null); setError(null); setLimit(false); setLoading(true);
    const text = sel.active ? body.slice(sel.start, sel.end) : body;
    try {
      const data = await api.aiStream(
        { action, text, language: action === "translate" ? language : undefined, prompt: action === "prompt" ? promptText : undefined },
        (chunk) => setResult((prev) => `${prev ?? ""}${chunk}`),
      );
      setSimulated(Boolean(data.simulated));
      if (typeof data.remaining === "number") setRemaining(data.remaining);
    } catch (err) {
      if ((err as { status?: number }).status === 429) setLimit(true);
      else setError("Something went wrong. Your text is unchanged.");
    } finally { setLoading(false); }
  }

  const scopeWord = sel.words === 1 ? "word" : "words";
  const scope = sel.active ? `selection · ${sel.words} ${scopeWord}` : "whole field";
  const applyReplace = () => {
    if (result == null) return;
    setBody(sel.active ? body.slice(0, sel.start) + result + body.slice(sel.end) : result);
    setResult(null);
    setConfirmOpen(false);
  };

  return (
    <div>
      <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5">
        <label htmlFor="aiw-title" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-faint">Title</label>
        <input id="aiw-title" value={title} onChange={(e) => setTitle(e.target.value)} className="mb-4 w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-lg font-semibold focus:border-ai focus:outline-none" />
        <label htmlFor="aiw-body" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-faint">Body</label>
        <textarea id="aiw-body" ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} onSelect={refreshScope} onKeyUp={refreshScope} onMouseUp={refreshScope} rows={7}
          className="w-full resize-y rounded-lg border border-sand bg-paper p-3.5 leading-relaxed focus:border-ai focus:outline-none" />
        <div className="mt-3 flex items-center justify-between">
          <span className={`text-sm ${sel.active ? "font-medium text-ai" : "text-ink-faint"}`}>Working on the {scope}</span>
          {remaining != null && <span className="text-xs text-ink-faint">{remaining} AI actions left today</span>}
        </div>
      </div>

      <div className="mt-3 rounded-[var(--radius-card)] border border-ai-line bg-ai-tint p-4">
        <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Rewrite</p>
        <div className="flex flex-wrap gap-2">{REWRITE.map((b) => <Btn key={b.a} onClick={() => run(b.a)}>{b.label}</Btn>)}</div>
        <p className="mb-2 mt-4 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Generate</p>
        <div className="flex flex-wrap gap-2">{GENERATE.map((b) => <Btn key={b.a} onClick={() => run(b.a)}>{b.label}</Btn>)}<Btn onClick={() => run("translate")}>Translate</Btn></div>

        {mode === "prompt" && (
          <div className="mt-3 flex flex-wrap gap-2">
            <input autoFocus value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder="Describe what you want…" className="min-w-[12rem] flex-1 rounded-lg border border-ai-line bg-paper px-3 py-2 text-sm text-ink focus:border-ai focus:outline-none" />
            <button onClick={() => go("prompt")} className="rounded-lg bg-ai px-4 py-2 text-sm font-semibold text-white">Generate</button>
          </div>
        )}
        {mode === "lang" && (
          <div className="mt-3 flex flex-wrap gap-2">
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="min-w-[10rem] flex-1 rounded-lg border border-ai-line bg-paper px-3 py-2 text-sm text-ink focus:border-ai focus:outline-none">{LANGS.map((l) => <option key={l}>{l}</option>)}</select>
            <button onClick={() => go("translate")} className="rounded-lg bg-ai px-4 py-2 text-sm font-semibold text-white">Translate</button>
          </div>
        )}

        {loading && <p className="mt-4 text-sm font-medium text-ai">Writing…</p>}
        {error && <p className="mt-4 rounded-lg border border-clay/30 bg-clay/10 px-3 py-2 text-sm text-clay-text">{error}{lastAction && <button onClick={() => go(lastAction)} className="ml-3 font-semibold underline">Try again</button>}</p>}
        {limit && <p className="mt-4 rounded-lg border border-gold-border/40 bg-gold/[0.1] px-3 py-2 text-center text-sm text-gold-text">Daily AI limit reached. Resets at midnight.</p>}

        {result != null && (
          <div className="mt-4 border-t border-ai-line pt-3">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold">Preview</span><span className="text-xs text-ink-faint">{lastAction}{simulated ? " · simulated" : ""}</span></div>
            <div className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-ai-line bg-paper p-4 text-sm leading-relaxed text-ink">{result}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setConfirmOpen(true)} className="rounded-lg bg-green px-4 py-2 text-sm font-semibold text-on-green">Replace</button>
              <button onClick={() => { setBody(body.trimEnd() + "\n\n" + result); setResult(null); }} className="rounded-lg border border-sand bg-paper px-4 py-2 text-sm font-semibold text-ink">Insert below</button>
              <button onClick={() => { navigator.clipboard?.writeText(result).catch(() => {}); }} className="rounded-lg border border-sand bg-paper px-4 py-2 text-sm font-semibold text-ink">Copy</button>
              <button onClick={() => setResult(null)} className="rounded-lg border border-clay/30 px-4 py-2 text-sm font-semibold text-clay-text">Discard</button>
            </div>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-ink-faint">Calls the model server-side in the Go API — the key never reaches the browser. Every output is a draft.</p>
      {confirmOpen && (
        <dialog open className="fixed inset-0 z-50 flex h-full w-full items-center justify-center border-0 bg-black/45 p-5" aria-modal>
          <div className="w-full max-w-sm rounded-[var(--radius-card)] border border-sand bg-paper p-6 text-center shadow-[var(--shadow-lift)]">
            <h3 className="text-xl font-semibold text-ink">Replace current text?</h3>
            <p className="mt-2 text-sm text-ink-muted">This will overwrite {sel.active ? "your selected text" : "what is in the field"}.</p>
            <div className="mt-5 flex justify-center gap-3">
              <button onClick={() => setConfirmOpen(false)} className="rounded-lg border border-sand px-5 py-2 text-sm font-semibold text-ink">Cancel</button>
              <button onClick={applyReplace} className="rounded-lg bg-maroon-900 px-5 py-2 text-sm font-semibold text-white">Replace</button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}

function Btn({ onClick, children }: Readonly<{ onClick: () => void; children: React.ReactNode }>) {
  return <button type="button" onClick={onClick} className="rounded-lg border border-ai-line bg-cream px-3 py-2 text-sm font-medium text-ink hover:border-ai hover:text-ai">{children}</button>;
}
