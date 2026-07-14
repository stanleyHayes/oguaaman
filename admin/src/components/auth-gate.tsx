import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Mark } from "./layout";

/** Locks the whole back-office behind a curator/steward session (spec §9). */
export function AuthGate({ children }: Readonly<{ children: React.ReactNode }>) {
  const { member, loading } = useAuth();
  if (loading) return <Backdrop><p className="text-sm text-cream/70">Loading…</p></Backdrop>;
  if (!member) return <SignIn />;
  if (member.role !== "curator" && member.role !== "steward") return <NotAuthorized name={member.displayName} />;
  return <>{children}</>;
}

const TRUST = [
  "Curators and stewards only",
  "One-time code — no passwords to leak",
  "Every back-office action is audited",
];

/** Full-screen branded green field with a faint gold glow + dotted texture. */
function Backdrop({ children }: Readonly<{ children: React.ReactNode }>) {
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
      <div className="relative w-full max-w-4xl">{children}</div>
    </div>
  );
}

/** Split shell: green brand rail beside a paper form panel. */
function Shell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="grid overflow-hidden rounded-2xl border border-sand/40 bg-paper shadow-2xl shadow-green-900/40 md:grid-cols-2">
      <aside className="relative overflow-hidden bg-gradient-to-br from-green to-green-900 p-8 text-cream">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)", backgroundSize: "20px 20px", color: "#C7A24A" }}
          aria-hidden
        />
        <div className="pointer-events-none absolute -bottom-8 -right-6 text-gold/15" aria-hidden>
          <Mark size={180} />
        </div>
        <div className="relative flex h-full flex-col">
          <div className="flex items-center gap-2">
            <Mark />
            <span className="text-2xl font-semibold leading-none text-cream">Oguaa</span>
            <span className="rounded bg-gold px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-green-900">Admin</span>
          </div>
          <p className="mt-8 text-[0.72rem] font-bold uppercase tracking-[0.22em] text-gold">Back office</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight">Steward the town board.</h1>
          <ul className="mt-7 space-y-3">
            {TRUST.map((t) => (
              <li key={t} className="flex items-start gap-3 text-sm text-cream/85">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/20 text-xs text-gold">✓</span>
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-auto pt-8 text-sm italic text-gold/90">Yɛn ara asaase ni — this is our own land.</p>
        </div>
      </aside>
      <div className="p-8">{children}</div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-sand bg-cream px-4 py-3 text-ink placeholder:text-ink-faint transition-colors focus:border-gold-border focus:bg-paper focus:outline-none focus:ring-2 focus:ring-gold/20";

const primaryBtn =
  "w-full rounded-full bg-green py-3 text-sm font-semibold text-cream shadow-sm transition-colors hover:bg-green-900 disabled:opacity-60";

function SignIn() {
  const { requestOtp, verify } = useAuth();
  const [step, setStep] = useState<"id" | "code">("id");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(e: React.SubmitEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const dc = await requestOtp(identifier.trim());
      setDevCode(dc);
      if (dc) { setCode(dc); }
      setStep("code");
    } catch { setErr("Could not send a code."); } finally { setBusy(false); }
  }
  async function confirm(e: React.SubmitEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await verify(identifier.trim(), code.trim()); }
    catch { setErr("That code is invalid or has expired."); } finally { setBusy(false); }
  }

  return (
    <Backdrop>
      <Shell>
        {/* Step indicator */}
        <div className="mb-7 flex items-center gap-3" aria-hidden>
          <span className="h-1.5 flex-1 rounded-full bg-gold-brand" />
          <span className={`h-1.5 flex-1 rounded-full ${step === "code" ? "bg-gold-brand" : "bg-sand"}`} />
        </div>

        {step === "id" ? (
          <form onSubmit={send} className="space-y-5">
            <div>
              <h2 className="text-2xl font-semibold text-ink">Curator sign in</h2>
              <p className="mt-1 text-sm text-ink-muted">Step 1 of 2 — where should we send your code?</p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Phone or email</span>
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required placeholder="+233… or you@email" className={inputCls} />
            </label>
            {err && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
            <button disabled={busy} className={primaryBtn}>{busy ? "Sending…" : "Send my code →"}</button>
            <p className="text-center text-xs text-ink-faint">Seeded steward: <code className="font-mono">nana-essien@oguaa.test</code></p>
          </form>
        ) : (
          <form onSubmit={confirm} className="space-y-5">
            <div>
              <h2 className="text-2xl font-semibold text-ink">Check your messages</h2>
              <p className="mt-1 text-sm text-ink-muted">Step 2 of 2 — enter the 6-digit code we sent to <b className="text-ink">{identifier}</b>.</p>
            </div>
            {devCode && <p className="rounded-lg border border-gold-border/40 bg-gold/[0.1] px-3 py-2 text-sm text-gold-text">Dev code: <b className="font-mono">{devCode}</b></p>}
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Verification code</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} required inputMode="numeric" placeholder="000000" className={`${inputCls} text-center font-mono text-lg tracking-[0.35em]`} />
            </label>
            {err && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
            <button disabled={busy} className={primaryBtn}>{busy ? "Verifying…" : "Sign in"}</button>
            <button type="button" onClick={() => setStep("id")} className="w-full text-center text-sm text-ink-muted transition-colors hover:text-ink">← Use a different number</button>
          </form>
        )}
      </Shell>
    </Backdrop>
  );
}

function NotAuthorized({ name }: Readonly<{ name: string }>) {
  const { signOut } = useAuth();
  return (
    <Backdrop>
      <Shell>
        <div className="flex h-full flex-col justify-center text-center">
          <h2 className="text-3xl font-semibold text-ink">Not authorised</h2>
          <p className="mt-3 text-sm text-ink-muted">Hi {name} — this back-office is for curators and stewards. Ask a steward to grant you a role.</p>
          <button onClick={signOut} className="mx-auto mt-6 rounded-full border border-gold-border/60 px-5 py-2 text-sm font-semibold text-gold-text transition-colors hover:bg-gold/10">Sign out</button>
        </div>
      </Shell>
    </Backdrop>
  );
}
