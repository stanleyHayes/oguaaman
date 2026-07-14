import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Mark } from "./layout";

/** Locks the whole back-office behind a curator/steward session (spec §9). */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { member, loading } = useAuth();
  if (loading) return <Backdrop><p className="text-sm text-cream/70">Loading…</p></Backdrop>;
  if (!member) return <SignIn />;
  if (member.role !== "curator" && member.role !== "steward") return <NotAuthorized name={member.displayName} />;
  return <>{children}</>;
}

/** Full-screen branded green field with a faint gold glow + dotted texture. */
function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-green-900 p-6">
      {/* Low-opacity dotted texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          color: "#C7A24A",
        }}
        aria-hidden
      />
      {/* Blurred gold glows */}
      <div className="pointer-events-none absolute -top-24 -left-20 h-72 w-72 rounded-full bg-gold/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-28 -right-16 h-80 w-80 rounded-full bg-gold/10 blur-3xl" aria-hidden />
      {/* Soft central radial highlight */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(60% 50% at 50% 35%, rgba(199,162,74,0.10), transparent 70%)" }}
        aria-hidden
      />
      <div className="relative w-full max-w-sm">{children}</div>
    </div>
  );
}

/** Brand lockup: crab mark + Oguaa wordmark + gold ADMIN badge (mirrors the sidebar). */
function Brand() {
  return (
    <div className="flex items-center gap-2">
      <Mark />
      <span className="font-display text-2xl font-semibold leading-none text-ink">Oguaa</span>
      <span className="rounded bg-gold px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-green-900">Admin</span>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-gold-border focus:outline-none";

const primaryBtn =
  "w-full rounded-lg bg-green py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-green-900 disabled:opacity-60";

function SignIn() {
  const { requestOtp, verify } = useAuth();
  const [step, setStep] = useState<"id" | "code">("id");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const dc = await requestOtp(identifier.trim()); setDevCode(dc); if (dc) setCode(dc); setStep("code"); }
    catch { setErr("Could not send a code."); } finally { setBusy(false); }
  }
  async function confirm(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await verify(identifier.trim(), code.trim()); }
    catch { setErr("That code is invalid or has expired."); } finally { setBusy(false); }
  }

  return (
    <Backdrop>
      <div className="rounded-2xl border border-sand/60 bg-paper p-7 shadow-2xl shadow-green-900/40">
        <div className="mb-5">
          <Brand />
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink">Curator sign in</h1>
        <p className="mt-1 mb-5 text-sm text-ink-muted">Back-office access for curators and stewards.</p>

        {step === "id" ? (
          <form onSubmit={send} className="space-y-3">
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required placeholder="Phone or email" className={inputCls} />
            {err && <p className="text-sm text-clay-text">{err}</p>}
            <button disabled={busy} className={primaryBtn}>{busy ? "Sending…" : "Send code"}</button>
            <p className="text-center text-xs text-ink-faint">Seeded steward: <code className="font-mono">nana-essien@oguaa.test</code></p>
          </form>
        ) : (
          <form onSubmit={confirm} className="space-y-3">
            {devCode && <p className="rounded-lg border border-gold-border/40 bg-gold/[0.1] px-3 py-2 text-sm text-gold-text">Dev code: <b className="font-mono">{devCode}</b></p>}
            <input value={code} onChange={(e) => setCode(e.target.value)} required inputMode="numeric" placeholder="000000" className={`${inputCls} text-center font-mono tracking-[0.3em]`} />
            {err && <p className="text-sm text-clay-text">{err}</p>}
            <button disabled={busy} className={primaryBtn}>{busy ? "Verifying…" : "Sign in"}</button>
            <button type="button" onClick={() => setStep("id")} className="w-full text-center text-sm text-ink-muted transition-colors hover:text-ink">← Back</button>
          </form>
        )}
      </div>
    </Backdrop>
  );
}

function NotAuthorized({ name }: { name: string }) {
  const { signOut } = useAuth();
  return (
    <Backdrop>
      <div className="rounded-2xl border border-sand/60 bg-paper p-7 text-center shadow-2xl shadow-green-900/40">
        <div className="mb-5 flex justify-center">
          <Brand />
        </div>
        <h1 className="font-display text-3xl font-semibold text-ink">Not authorised</h1>
        <p className="mt-3 text-sm text-ink-muted">Hi {name} — this back-office is for curators and stewards. Ask a steward to grant you a role.</p>
        <button onClick={signOut} className="mt-6 rounded-full border border-gold-border/60 px-5 py-2 text-sm font-semibold text-gold-text transition-colors hover:bg-gold/10">Sign out</button>
      </div>
    </Backdrop>
  );
}
