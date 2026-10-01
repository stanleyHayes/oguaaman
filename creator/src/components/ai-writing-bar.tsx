import { useRef, useState } from "react";
import { api, errorCode } from "@/lib/api";
import { AI_DISCLOSURE } from "@/lib/ai";
import { useAuth } from "@/lib/auth";

const ACTIONS = [
  { value: "formalize", label: "Formalize", mark: "◆" }, { value: "casual", label: "Make casual", mark: "☺" },
  { value: "clarity", label: "Improve clarity", mark: "✦" }, { value: "grammar", label: "Fix grammar", mark: "✓" },
  { value: "expand", label: "Expand", mark: "⤢" }, { value: "summarize", label: "Summarize", mark: "≣" },
] as const;

const errorCls = "rounded-lg border border-clay/25 bg-clay/[0.08] p-3 text-sm text-clay-text";

/**
 * First-use disclosure and explicit agreement before any text is sent to the
 * AI provider (contract K15). The agreement is stored on the account and can
 * be withdrawn in Settings → Privacy & data.
 */
function AiConsentPanel({ onAgreed }: Readonly<{ onAgreed: () => void }>) {
  const { setMember } = useAuth();
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (!agree) return;
    setBusy(true); setError("");
    try {
      await api.setAiConsent(true);
      setMember(await api.me());
      onAgreed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your choice. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 p-4">
      <p className="text-sm leading-relaxed text-ink">{AI_DISCLOSURE}</p>
      <label className="flex items-start gap-2.5 text-sm text-ink">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-green" />
        <span>I agree to send the text I choose to the writing assistant.</span>
      </label>
      {error && <p role="alert" className={errorCls}>{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={confirm} disabled={!agree || busy} className="min-h-10 rounded-lg bg-ai px-4 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Saving…" : "Turn on the assistant"}
        </button>
        <span className="text-xs text-ink-faint">You can turn it off any time in Settings.</span>
      </div>
    </div>
  );
}

export function AiWritingBar({ label, rows, value, onChange }: Readonly<{ label: string; rows: number; value: string; onChange: (value: string) => void }>) {
  const { member } = useAuth();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  // Set when the server says consent is missing (e.g. withdrawn in another app).
  const [consentLost, setConsentLost] = useState(false);
  const needsConsent = consentLost || member?.aiConsent !== true;

  function rememberSelection() {
    const field = textarea.current;
    if (!field || field.selectionEnd <= field.selectionStart) { setSelection(null); return; }
    setSelection({ start: field.selectionStart, end: field.selectionEnd });
  }

  async function run(action: string) {
    const source = selection ? value.slice(selection.start, selection.end) : value;
    if (!source.trim()) { setError("Write a few words first, then ask AI to help shape them."); return; }
    setBusy(true); setError(""); setResult("");
    try { const response = await api.ai({ action, text: source }); setResult(response.result); }
    catch (requestError) {
      if (errorCode(requestError) === "ai_consent_required") setConsentLost(true);
      else setError(requestError instanceof Error ? requestError.message : "Could not generate a suggestion.");
    }
    finally { setBusy(false); }
  }

  function apply() {
    if (!result) return;
    onChange(selection ? value.slice(0, selection.start) + result + value.slice(selection.end) : result);
    setOpen(false); setResult(""); setSelection(null);
  }

  return (
    <div className="relative">
      <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)] sm:p-6">
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</label>
        <textarea ref={textarea} value={value} onChange={(event) => onChange(event.target.value)} onSelect={rememberSelection} onKeyUp={rememberSelection} onMouseUp={rememberSelection} rows={rows} className="w-full resize-y rounded-lg border border-sand bg-paper p-3.5 leading-relaxed text-ink focus:border-green focus:outline-none" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className={`flex items-center gap-2 text-sm ${selection ? "font-medium text-ai" : "text-ink-faint"}`}><span className={`h-1.5 w-1.5 rounded-full ${selection ? "bg-ai" : "bg-ink-faint"}`} />Working on the {selection ? "selection" : "whole field"}</span>
          <button type="button" onClick={() => { rememberSelection(); setOpen((current) => !current); setError(""); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-ai px-4 text-sm font-semibold text-white"><span aria-hidden>✦</span>Ask AI</button>
        </div>
      </div>
      {open && (
        <div className="mt-3 overflow-hidden rounded-[var(--radius-card)] border border-ai-line bg-ai-tint">
          <div className="flex items-center justify-between border-b border-ai-line px-4 py-3">
            <span className="font-semibold text-ai">✦ AI assistant</span>
            <button type="button" onClick={() => setOpen(false)} className="text-xl text-ink-faint" aria-label="Close">×</button>
          </div>
          {needsConsent ? (
            <AiConsentPanel onAgreed={() => setConsentLost(false)} />
          ) : (
            <>
              <div className="flex flex-wrap gap-2 p-4">
                {ACTIONS.map((action) => (
                  <button type="button" key={action.value} disabled={busy} onClick={() => run(action.value)} className="min-h-10 rounded-lg border border-ai-line bg-paper px-3 text-sm font-medium text-ink hover:border-ai hover:text-ai disabled:opacity-50"><span className="mr-1.5 text-ai">{action.mark}</span>{action.label}</button>
                ))}
              </div>
              <p className="px-4 pb-3 text-xs text-ink-faint">Your text is sent to Anthropic (Claude) to write a suggestion. Leave out private details.</p>
              {busy && <p className="px-4 pb-4 text-sm font-medium text-ai">Writing a suggestion…</p>}
              {error && <p role="alert" className={`mx-4 mb-4 ${errorCls}`}>{error}</p>}
              {result && (
                <div className="border-t border-ai-line p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">AI-suggested text</p>
                  <div className="my-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-ai-line bg-paper p-4 text-sm leading-relaxed text-ink">{result}</div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={apply} className="min-h-10 rounded-lg bg-ai px-4 text-sm font-semibold text-white">Replace {selection ? "selection" : "field"}</button>
                    <button type="button" onClick={() => setResult("")} className="min-h-10 rounded-lg border border-ai-line px-4 text-sm font-semibold text-ai">Try another</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
