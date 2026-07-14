import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Adinkra } from "@/components/adinkra";
import { Wordmark } from "@/components/wordmark";

const inputCls =
  "w-full rounded-xl border border-sand bg-cream px-4 py-3 text-ink placeholder:text-ink-faint transition-colors focus:border-gold-border focus:bg-paper focus:outline-none focus:ring-2 focus:ring-gold/20";

const TRUST = [
  "No passwords — a one-time code by SMS or email",
  "Free to join, and built for the people of Oguaa",
  "Your date of birth stays private — it's an age check only",
];

export function Component() {
  const { member, requestOtp, verify } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from ?? "/me";

  const [step, setStep] = useState<"id" | "code">("id");
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (member) return <Navigate to={from} replace />;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const dc = await requestOtp(identifier.trim(), name.trim() || undefined, dob || undefined);
      setDevCode(dc);
      if (dc) setCode(dc);
      setStep("code");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send a code.");
    } finally { setBusy(false); }
  }
  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await verify(identifier.trim(), code.trim());
      nav(from, { replace: true });
    } catch {
      setErr("That code is invalid or has expired.");
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <div className="grid overflow-hidden rounded-[var(--radius-card)] border border-sand bg-paper shadow-[var(--shadow-card)] lg:grid-cols-2">
        {/* Brand panel */}
        <aside className="relative overflow-hidden bg-gradient-to-br from-green to-green-900 p-8 text-cream lg:p-10">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)", backgroundSize: "20px 20px", color: "#C7A24A" }}
            aria-hidden
          />
          <Adinkra
            name="adinkrahene"
            size={260}
            labelled={false}
            strokeWidth={0.6}
            className="pointer-events-none absolute -bottom-14 -right-10 text-gold/15"
          />
          <div className="relative flex h-full flex-col">
            <Wordmark />
            <p className="mt-10 text-[0.72rem] font-bold uppercase tracking-[0.22em] text-gold">Member sign in</p>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-tight">Welcome home to Oguaa.</h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-cream/75">
              Sign in with your phone or email. A one-time code verifies you — the spam gate that fits
              how Ghana already works. New here? You&rsquo;ll create your profile in the same step.
            </p>
            <ul className="mt-8 space-y-3">
              {TRUST.map((t) => (
                <li key={t} className="flex items-start gap-3 text-sm text-cream/85">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/20 text-xs text-gold">✓</span>
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-auto pt-10 font-display text-base italic text-gold/90">
              Yɛn ara asaase ni — this is our own land.
            </p>
          </div>
        </aside>

        {/* Form panel */}
        <div className="p-8 lg:p-10">
          {/* Step indicator */}
          <div className="mb-7 flex items-center gap-3" aria-hidden>
            <span className="h-1.5 flex-1 rounded-full bg-gold-brand" />
            <span className={`h-1.5 flex-1 rounded-full ${step === "code" ? "bg-gold-brand" : "bg-sand"}`} />
          </div>

          {step === "id" ? (
            <form onSubmit={send} className="space-y-5">
              <div>
                <h2 className="font-display text-2xl font-semibold text-ink">Join Oguaa</h2>
                <p className="mt-1 text-sm text-ink-muted">Step 1 of 2 — tell us where to send your code.</p>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Phone or email</span>
                <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required placeholder="+233… or you@email" className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Your name <span className="font-normal text-ink-faint">(new members)</span></span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Date of birth <span className="font-normal text-ink-faint">(new members)</span></span>
                <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} max="2010-01-01" className={inputCls} />
                <span className="mt-1.5 block text-xs text-ink-faint">Oguaa is for ages 18 and over.</span>
              </label>
              {err && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
              <button type="submit" disabled={busy} className="w-full rounded-full bg-green py-3 text-sm font-semibold text-cream shadow-sm transition-colors hover:bg-green-900 disabled:opacity-60">
                {busy ? "Sending…" : "Send my code →"}
              </button>
              <p className="text-center text-xs text-ink-faint">Try a seeded account: <code className="font-mono">akua-pratt@oguaa.test</code> (curator)</p>
            </form>
          ) : (
            <form onSubmit={confirm} className="space-y-5">
              <div>
                <h2 className="font-display text-2xl font-semibold text-ink">Check your messages</h2>
                <p className="mt-1 text-sm text-ink-muted">Step 2 of 2 — we sent a 6-digit code to <b className="text-ink">{identifier}</b>.</p>
              </div>
              {devCode && (
                <p className="rounded-lg border border-gold-border/40 bg-gold/[0.1] px-3 py-2 text-sm text-gold-text">
                  Dev mode — no SMS provider configured. Your code is <b className="font-mono">{devCode}</b>.
                </p>
              )}
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Verification code</span>
                <input value={code} onChange={(e) => setCode(e.target.value)} required inputMode="numeric" placeholder="000000" className={`${inputCls} text-center font-mono text-lg tracking-[0.35em]`} />
              </label>
              {err && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
              <button type="submit" disabled={busy} className="w-full rounded-full bg-green py-3 text-sm font-semibold text-cream shadow-sm transition-colors hover:bg-green-900 disabled:opacity-60">
                {busy ? "Verifying…" : "Verify & sign in"}
              </button>
              <button type="button" onClick={() => setStep("id")} className="w-full text-center text-sm text-ink-muted transition-colors hover:text-ink">← Use a different number</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
