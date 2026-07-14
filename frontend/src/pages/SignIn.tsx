import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { PageHero } from "@/components/page-hero";
import { Container } from "@/components/ui";

const inputCls = "w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";

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
    <>
      <PageHero tone="green" kicker="Member sign in" title="Join Oguaa" symbol="adinkrahene" lede="Sign in with your phone or email. A one-time code verifies you — the spam gate that fits how Ghana already works. New here? You'll create your profile in the same step." />
      <Container size="narrow" className="py-12">
        <div className="mx-auto max-w-md rounded-[var(--radius-card)] border border-sand bg-cream p-6">
          {step === "id" ? (
            <form onSubmit={send} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Phone or email</span>
                <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required placeholder="+233… or you@email" className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Your name <span className="text-ink-faint">(new members)</span></span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Date of birth <span className="text-ink-faint">(new members)</span></span>
                <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} max="2010-01-01" className={inputCls} />
                <span className="mt-1.5 block text-xs text-ink-faint">Oguaa is for ages 18 and over. We keep your date of birth private — it&rsquo;s only used to confirm you&rsquo;re old enough to join.</span>
              </label>
              {err && <p className="text-sm text-clay-text">{err}</p>}
              <button type="submit" disabled={busy} className="w-full rounded-full bg-green py-3 text-sm font-semibold text-cream hover:bg-green-900 disabled:opacity-60">
                {busy ? "Sending…" : "Send my code"}
              </button>
              <p className="text-center text-xs text-ink-faint">Try a seeded account: <code className="font-mono">akua-pratt@oguaa.test</code> (curator)</p>
            </form>
          ) : (
            <form onSubmit={confirm} className="space-y-4">
              <p className="text-sm text-ink-muted">We sent a 6-digit code to <b className="text-ink">{identifier}</b>.</p>
              {devCode && (
                <p className="rounded-lg border border-gold-border/40 bg-gold/[0.1] px-3 py-2 text-sm text-gold-text">
                  Dev mode — no SMS provider configured. Your code is <b className="font-mono">{devCode}</b>.
                </p>
              )}
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Verification code</span>
                <input value={code} onChange={(e) => setCode(e.target.value)} required inputMode="numeric" placeholder="000000" className={`${inputCls} font-mono tracking-[0.3em]`} />
              </label>
              {err && <p className="text-sm text-clay-text">{err}</p>}
              <button type="submit" disabled={busy} className="w-full rounded-full bg-green py-3 text-sm font-semibold text-cream hover:bg-green-900 disabled:opacity-60">
                {busy ? "Verifying…" : "Verify & sign in"}
              </button>
              <button type="button" onClick={() => setStep("id")} className="w-full text-center text-sm text-ink-muted hover:text-ink">← Use a different number</button>
            </form>
          )}
        </div>
      </Container>
    </>
  );
}
