import { useRef, useState, type ReactNode, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PORTAL } from "@/lib/portal";
import { Mark } from "./layout";
import { OtpInput } from "./otp-input";

/**
 * Locks the creator studio behind a member session. Any signed-in member
 * passes — citizens who haven't picked creator types yet see the upgrade
 * call-to-action on the Account page.
 */
export function AuthGate({ children }: Readonly<{ children: ReactNode }>) {
  const { member, loading } = useAuth();
  if (loading) return <Backdrop><LoadingSplash tag="Creator" /></Backdrop>;
  if (!member) return <SignIn />;
  return <>{children}</>;
}

/** Branded loading splash — crab mark, sliding gold bar, motto. Rendered
 * inside Backdrop, which pins the green field's colours in both themes. */
function LoadingSplash({ tag }: Readonly<{ tag: string }>) {
  return (
    <div className="flex flex-col items-center gap-4">
      <span className="inline-flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-gold to-gold-brand shadow-sm" aria-hidden>
          <Mark size={20} color="#0C2C1F" />
        </span>
        <span className="text-3xl font-semibold tracking-tight text-cream">Oguaa</span>
        <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-gold">{tag}</span>
      </span>
      <div className="mt-1 h-0.5 w-28 overflow-hidden rounded-full bg-gold/15" aria-hidden>
        <div className="oguaa-loadbar h-full w-1/2 rounded-full bg-gold-brand" />
      </div>
      <p className="text-xs uppercase tracking-[0.2em] text-gold/80">Yɛn ara asaase ni</p>
    </div>
  );
}

const TRUST = [
  "For businesses, artists, organisers and institutions",
  "Same password as the community portal",
  "Promote your work and follow what it earns",
];

/** Full-screen branded green field with a faint gold glow + dotted texture. */
function Backdrop({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="auth-dark-pin relative flex min-h-screen items-center justify-center overflow-hidden bg-green-900 p-6">
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
function Shell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="grid overflow-hidden rounded-2xl border border-sand/40 bg-paper shadow-2xl shadow-green-900/40 md:grid-cols-2">
      <aside className="relative overflow-hidden bg-gradient-to-br from-green to-green-900 p-8 text-cream">
        <div className="pointer-events-none absolute -bottom-8 -right-6 text-gold/15" aria-hidden>
          <Mark size={180} />
        </div>
        <div className="relative flex h-full flex-col">
          <div className="flex items-center gap-2">
            <Mark />
            <span className="text-2xl font-semibold leading-none text-cream">Oguaa</span>
            <span className="rounded bg-gold px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-green-900">Creator</span>
          </div>
          <p className="mt-8 text-[0.72rem] font-bold uppercase tracking-[0.22em] text-gold">Creator studio</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight text-cream">Your work, front and centre.</h1>
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
  "auth-theme-cream w-full rounded-xl border border-sand bg-cream px-4 py-3 text-ink placeholder:text-ink-faint transition-colors focus:border-gold-border focus:bg-paper focus:outline-none focus:ring-2 focus:ring-gold/20";

const primaryBtn =
  "w-full rounded-full bg-green py-3 text-sm font-semibold text-cream shadow-sm transition-colors hover:bg-green-900 disabled:opacity-60";

function SignIn() {
  const { signIn, completeMfa } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const codeFormRef = useRef<HTMLFormElement | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await signIn(identifier.trim(), password);
      if (res.mfaRequired && res.challenge) { setChallenge(res.challenge); setCode(""); }
    } catch (e) { setErr(e instanceof Error ? e.message : "Sign in failed."); } finally { setBusy(false); }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setBusy(true); setErr(null);
    try { await completeMfa(challenge, code.trim()); }
    catch (e) { setErr(e instanceof Error ? e.message : "That code didn't work."); } finally { setBusy(false); }
  }

  if (challenge) {
    return (
      <Backdrop>
        <Shell>
          <form ref={codeFormRef} onSubmit={submitCode} className="space-y-5">
            <div>
              <h2 className="text-2xl font-semibold text-ink">Two-factor check</h2>
              <p className="mt-1 text-sm text-ink-muted">Enter the 6-digit code from your authenticator app, or a recovery code.</p>
            </div>
            {recovery ? (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Recovery code</span>
                <input value={code} onChange={(e) => setCode(e.target.value)} required autoFocus autoComplete="one-time-code" placeholder="xxxx-xxxx-xxxx" className={inputCls} />
                <button type="button" onClick={() => { setRecovery(false); setCode(""); }} className="mt-2 text-xs font-medium text-ink-muted underline hover:text-ink">Use authenticator code</button>
              </label>
            ) : (
              <div className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Code</span>
                <OtpInput value={code} onChange={setCode} onComplete={() => codeFormRef.current?.requestSubmit()} autoFocus ariaLabel="Authenticator code" />
                <button type="button" onClick={() => { setRecovery(true); setCode(""); }} className="mt-2 text-xs font-medium text-ink-muted underline hover:text-ink">Use a recovery code instead</button>
              </div>
            )}
            {err && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
            <button type="submit" disabled={busy} className={primaryBtn}>{busy ? "Verifying…" : "Verify & sign in"}</button>
            <p className="text-center text-xs text-ink-faint">
              <button type="button" onClick={() => { setChallenge(null); setErr(null); setPassword(""); setRecovery(false); }} className="font-medium text-ink-muted underline hover:text-ink">← Back to sign in</button>
            </p>
          </form>
        </Shell>
      </Backdrop>
    );
  }

  return (
    <Backdrop>
      <Shell>
        <form onSubmit={submit} className="space-y-5">
          <div>
            <h2 className="text-2xl font-semibold text-ink">Creator sign in</h2>
            <p className="mt-1 text-sm text-ink-muted">Enter your phone or email and your password.</p>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Phone or email</span>
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoComplete="username" placeholder="+233… or you@email" className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Password</span>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" placeholder="Your password" className={`${inputCls} pr-12`} />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint transition-colors hover:text-ink"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {err && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
          <button type="submit" disabled={busy} className={primaryBtn}>{busy ? "Signing in…" : "Sign in"}</button>
          <p className="text-center text-xs text-ink-faint">New here? Join as a creator on the <a href={`${PORTAL}/signin`} className="font-semibold text-gold-text hover:underline">community portal</a>.</p>
        </form>
      </Shell>
    </Backdrop>
  );
}
