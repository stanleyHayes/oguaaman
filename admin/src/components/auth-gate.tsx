import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Mark } from "./layout";
import { MfaEnroll } from "./mfa";
import { OtpInput } from "./otp-input";
import { AuthSkeleton, BusyLabel } from "./skeleton";

/** Returns true when this role may access the back-office at all.
 *  Editors are staff because the newsroom lives in the back-office (spec §8.12);
 *  accountability officers sign in to record town-goal verdicts.
 */
export function isStaffRole(role: string): boolean {
  return role === "curator" || role === "steward" || role === "moderator" || role === "editor" || role === "accountability";
}

/** Locks the whole back-office behind a curator/steward/moderator session (spec §9). */
export function AuthGate({ children }: Readonly<{ children: ReactNode }>) {
  const { member, loading } = useAuth();
  if (loading) return <AuthSkeleton />;
  if (!member) return <SignIn />;
  if (!isStaffRole(member.role)) return <NotAuthorized name={member.displayName} />;
  // Moderators don't get MFA enforcement (read: triage-only access is lower risk);
  // curators and stewards must enrol before the console unlocks (spec §14).
  if (member.role !== "moderator" && !member.mfaEnabled) return <ForcedMfa name={member.displayName} />;
  return <>{children}</>;
}

const TRUST = [
  "Curators, stewards, and moderators only",
  "Two-factor sign-in on curator and steward accounts",
  "Every back-office action is audited",
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
            <span className="rounded bg-gold px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-green-900">Admin</span>
          </div>
          <p className="mt-8 text-[0.72rem] font-bold uppercase tracking-[0.22em] text-gold">Back office</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight text-cream">Steward the town board.</h1>
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
  // "reset" swaps the card to the forgot-password flow; banner confirms a
  // completed reset back on the sign-in form.
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [banner, setBanner] = useState<string | null>(null);
  const codeFormRef = useRef<HTMLFormElement | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await signIn(identifier.trim(), password);
      if (res.mfaRequired && res.challenge) { setChallenge(res.challenge); setCode(""); }
    } catch (e) { setErr(e instanceof Error ? e.message : "Sign in failed."); } finally { setBusy(false); }
  }

  async function submitCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!challenge) return;
    setBusy(true); setErr(null);
    try { await completeMfa(challenge, code.trim()); }
    catch (e) { setErr(e instanceof Error ? e.message : "That code didn't work."); } finally { setBusy(false); }
  }

  if (mode === "reset") {
    return (
      <ResetPassword
        initialIdentifier={identifier}
        onBack={() => { setMode("signin"); setErr(null); }}
        onDone={(msg) => { setMode("signin"); setErr(null); setPassword(""); setBanner(msg); }}
      />
    );
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
            <button type="submit" disabled={busy} className={primaryBtn}>{busy ? <BusyLabel label="Verifying your code" className="justify-center" /> : "Verify & sign in"}</button>
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
            <h2 className="text-2xl font-semibold text-ink">Curator sign in</h2>
            <p className="mt-1 text-sm text-ink-muted">Enter your phone or email and your password.</p>
          </div>
          {banner && <p className="rounded-lg border border-green/30 bg-green/5 px-3 py-2 text-sm text-green-900">{banner}</p>}
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
            <div className="mt-2 text-right">
              <button type="button" onClick={() => { setMode("reset"); setErr(null); setBanner(null); }} className="text-xs font-medium text-ink-muted underline hover:text-ink">Forgot password?</button>
            </div>
          </label>
          {err && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
          <button type="submit" disabled={busy} className={primaryBtn}>{busy ? <BusyLabel label="Signing in" className="justify-center" /> : "Sign in"}</button>
        </form>
      </Shell>
    </Backdrop>
  );
}

/** Forgot-password flow: request a code (step 1), then set a new password
 * (step 2). Mirrors the phone-verification pattern — a 6-box code + a new
 * password — and never reveals whether an account exists. */
function ResetPassword({ initialIdentifier, onBack, onDone }: Readonly<{ initialIdentifier: string; onBack: () => void; onDone: (msg: string) => void }>) {
  const [step, setStep] = useState<1 | 2>(1);
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sendCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await api.startPasswordReset(identifier.trim());
      setDevCode(res.devCode ?? null);
      setCode("");
      setStep(2);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't send a reset code."); } finally { setBusy(false); }
  }

  async function resetPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api.confirmPasswordReset(identifier.trim(), code.trim(), newPassword);
      onDone("Password reset — sign in with your new password.");
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't reset your password."); } finally { setBusy(false); }
  }

  const backBtn = (
    <p className="text-center text-xs text-ink-faint">
      <button type="button" onClick={onBack} className="font-medium text-ink-muted underline hover:text-ink">← Back to sign in</button>
    </p>
  );

  if (step === 1) {
    return (
      <Backdrop>
        <Shell>
          <form onSubmit={sendCode} className="space-y-5">
            <div>
              <h2 className="text-2xl font-semibold text-ink">Reset your password</h2>
              <p className="mt-1 text-sm text-ink-muted">Enter the phone or email on your account and we'll send a reset code.</p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Phone or email</span>
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus autoComplete="username" placeholder="+233… or you@email" className={inputCls} />
            </label>
            {err && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
            <button type="submit" disabled={busy} className={primaryBtn}>{busy ? <BusyLabel label="Sending reset code" className="justify-center" /> : "Send reset code"}</button>
            {backBtn}
          </form>
        </Shell>
      </Backdrop>
    );
  }

  return (
    <Backdrop>
      <Shell>
        <form onSubmit={resetPassword} className="space-y-5">
          <div>
            <h2 className="text-2xl font-semibold text-ink">Enter your reset code</h2>
            <p className="mt-1 text-sm text-ink-muted">If that account exists, we've sent a reset code. Enter it below and choose a new password.</p>
          </div>
          {devCode && <p className="rounded-lg border border-gold-border/40 bg-gold/10 px-3 py-2 text-xs text-gold-text">Dev code: <code className="font-mono font-semibold">{devCode}</code></p>}
          <div className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Reset code</span>
            <OtpInput value={code} onChange={setCode} autoFocus ariaLabel="Password reset code" />
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">New password</span>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" className={`${inputCls} pr-12`} />
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
          <button type="submit" disabled={busy} className={primaryBtn}>{busy ? <BusyLabel label="Resetting password" className="justify-center" /> : "Reset password"}</button>
          <p className="text-center text-xs text-ink-faint">
            <button type="button" onClick={() => { setStep(1); setErr(null); }} className="font-medium text-ink-muted underline hover:text-ink">Use a different account</button>
          </p>
          {backBtn}
        </form>
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
          <p className="mt-3 text-sm text-ink-muted">Hi {name} — this back-office is for curators, stewards, and moderators. Ask a steward to grant you a role.</p>
          <button type="button" onClick={signOut} className="mx-auto mt-6 rounded-full border border-gold-border/60 px-5 py-2 text-sm font-semibold text-gold-text transition-colors hover:bg-gold/10">Sign out</button>
        </div>
      </Shell>
    </Backdrop>
  );
}

/** Mandatory two-factor enrolment for staff before the console unlocks (spec §14). */
function ForcedMfa({ name }: Readonly<{ name: string }>) {
  const { signOut } = useAuth();
  // When enrolment finishes, MfaEnroll refreshes the member — mfaEnabled flips
  // true and this gate lets them straight into the console.
  return (
    <Backdrop>
      <Shell>
        <div className="flex h-full flex-col justify-center">
          <h2 className="text-2xl font-semibold text-ink">Secure your account, {name.split(" ")[0]}</h2>
          <p className="mt-2 text-sm text-ink-muted">
            The back-office requires two-factor sign-in. It takes a minute: scan the QR with any
            authenticator app, enter the code it shows, and keep the recovery codes somewhere safe.
          </p>
          <div className="mt-6">
            <MfaEnroll doneLabel="I've saved my codes" />
          </div>
          <button type="button" onClick={signOut} className="mt-6 self-start text-sm font-medium text-ink-muted underline hover:text-ink">Sign out instead</button>
        </div>
      </Shell>
    </Backdrop>
  );
}
