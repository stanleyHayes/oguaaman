import { useState, type SubmitEvent } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Adinkra } from "@/components/adinkra";
import { Wordmark } from "@/components/wordmark";
import { DatePicker } from "@/components/date-picker";

const inputCls =
  "w-full rounded-xl border border-sand bg-cream px-4 py-3 text-ink placeholder:text-ink-faint transition-colors focus:border-gold-border focus:bg-paper focus:outline-none focus:ring-2 focus:ring-gold/20";

const TRUST_COMMON = [
  "One account across web & mobile",
  "Free to use, built for the people of Oguaa",
];

const TRUST_JOIN = [
  ...TRUST_COMMON,
  "Your date of birth stays private — it's an age check only",
];

type Mode = "signin" | "join";

function BrandPanel({ mode }: Readonly<{ mode: Mode }>) {
  const isJoin = mode === "join";
  const trust = isJoin ? TRUST_JOIN : TRUST_COMMON;
  return (
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
        <p className="mt-10 text-[0.72rem] font-bold uppercase tracking-[0.22em] text-gold">{isJoin ? "Join Oguaa" : "Member sign in"}</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight text-cream">Welcome home to Oguaa.</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-cream/75">
          {isJoin
            ? "Create your account with a phone or email and a password — one account for the whole of Oguaa, on web and mobile."
            : "Sign in with your phone or email and your password — one account across web & mobile, built for Oguaa."}
        </p>
        <ul className="mt-8 space-y-3">
          {trust.map((t) => (
            <li key={t} className="flex items-start gap-3 text-sm text-cream/85">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/20 text-xs text-gold">✓</span>
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-auto pt-10 text-base italic text-gold/90">
          Yɛn ara asaase ni — this is our own land.
        </p>
      </div>
    </aside>
  );
}

function ModeTabs({ mode, onChange }: Readonly<{ mode: Mode; onChange: (m: Mode) => void }>) {
  return (
    <div className="mb-6 flex rounded-full bg-sand p-1">
      <button
        type="button"
        onClick={() => onChange("signin")}
        className={`flex-1 rounded-full py-1.5 text-sm font-medium transition-colors ${mode === "signin" ? "bg-paper text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
      >
        Sign in
      </button>
      <button
        type="button"
        onClick={() => onChange("join")}
        className={`flex-1 rounded-full py-1.5 text-sm font-medium transition-colors ${mode === "join" ? "bg-paper text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
      >
        Join
      </button>
    </div>
  );
}

const submitBtnCls =
  "w-full rounded-full bg-green py-3 text-sm font-semibold text-cream shadow-sm transition-colors hover:bg-green-900 disabled:opacity-60";

function SignInForm({
  identifier,
  setIdentifier,
  password,
  setPassword,
  busy,
  err,
  onSubmit,
  onSwitchMode,
}: Readonly<{
  identifier: string;
  setIdentifier: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  busy: boolean;
  err: string | null;
  onSubmit: (e: SubmitEvent<HTMLFormElement>) => void;
  onSwitchMode: (m: Mode) => void;
}>) {
  // The backend's specific 401 when the account exists but was never given a
  // password — it must be claimed through Join.
  const claimable = err != null && /no password yet/i.test(err);
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Sign in</h2>
        <p className="mt-1 text-sm text-ink-muted">Enter your phone or email and your password.</p>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Phone or email</span>
        <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoComplete="username" placeholder="+233… or you@email" className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Password</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" placeholder="Your password" className={inputCls} />
      </label>
      {err && (
        <div className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">
          <p>{err}</p>
          {claimable && (
            <button type="button" onClick={() => onSwitchMode("join")} className="mt-1 font-medium underline hover:text-clay">
              Join to claim it →
            </button>
          )}
        </div>
      )}
      <button type="submit" disabled={busy} className={submitBtnCls}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-xs text-ink-faint">
        New here?{" "}
        <button type="button" onClick={() => onSwitchMode("join")} className="font-medium text-ink-muted underline hover:text-ink">
          Join instead
        </button>
      </p>
    </form>
  );
}

function JoinForm({
  identifier,
  setIdentifier,
  name,
  setName,
  dob,
  setDob,
  password,
  setPassword,
  busy,
  err,
  onSubmit,
  onSwitchMode,
}: Readonly<{
  identifier: string;
  setIdentifier: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  dob: string;
  setDob: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  busy: boolean;
  err: string | null;
  onSubmit: (e: SubmitEvent<HTMLFormElement>) => void;
  onSwitchMode: (m: Mode) => void;
}>) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Join Oguaa</h2>
        <p className="mt-1 text-sm text-ink-muted">Create your account — one password for web & mobile.</p>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" placeholder="Display name" className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Phone or email</span>
        <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required placeholder="+233… or you@email" className={inputCls} />
      </label>
      <div className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Date of birth</span>
        <DatePicker value={dob} onChange={setDob} max="2010-01-01" placeholder="dd/mm/yyyy" className="w-full" />
        <span className="mt-1.5 block text-xs text-ink-faint">Oguaa is for ages 18 and over.</span>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Password</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="Choose a password" className={inputCls} />
        <span className="mt-1.5 block text-xs text-ink-faint">At least 8 characters</span>
      </label>
      {err && (
        <div className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">
          <p>{err}</p>
          {/already exists/i.test(err) && (
            <button type="button" onClick={() => onSwitchMode("signin")} className="mt-1 font-medium underline hover:text-clay">
              Sign in instead →
            </button>
          )}
        </div>
      )}
      <button type="submit" disabled={busy} className={submitBtnCls}>
        {busy ? "Creating…" : "Create my account →"}
      </button>
      <p className="text-center text-xs text-ink-faint">Try a seeded account: <code className="font-mono">akua-pratt@oguaa.test</code> (curator)</p>
    </form>
  );
}

export function Component() {
  const { member, signIn, join } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [params, setParams] = useSearchParams();
  const from = (loc.state as { from?: string } | null)?.from ?? "/me";

  const mode = params.get("mode") === "join" ? "join" : "signin";
  const setMode = (m: Mode) => {
    const next = new URLSearchParams(params);
    if (m === "join") next.set("mode", "join");
    else next.delete("mode");
    setParams(next, { replace: true });
  };

  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (member) return <Navigate to={from} replace />;

  const switchMode = (m: Mode) => {
    setMode(m);
    setErr(null);
    setPassword("");
  };

  const submitSignIn = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await signIn(identifier.trim(), password);
      nav(from, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign in failed.");
    } finally { setBusy(false); }
  };

  const submitJoin = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    if (!dob) {
      setErr("Please choose your date of birth.");
      setBusy(false);
      return;
    }
    if (password.length < 8) {
      setErr("Your password must be at least 8 characters.");
      setBusy(false);
      return;
    }
    try {
      await join({ identifier: identifier.trim(), displayName: name.trim(), dateOfBirth: dob, password });
      nav(from, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create your account.");
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <div className="grid overflow-hidden rounded-[var(--radius-card)] border border-sand bg-paper shadow-[var(--shadow-card)] lg:grid-cols-2">
        <BrandPanel mode={mode} />
        <div className="p-8 lg:p-10">
          <ModeTabs mode={mode} onChange={switchMode} />
          {mode === "signin" ? (
            <SignInForm
              identifier={identifier}
              setIdentifier={setIdentifier}
              password={password}
              setPassword={setPassword}
              busy={busy}
              err={err}
              onSubmit={submitSignIn}
              onSwitchMode={switchMode}
            />
          ) : (
            <JoinForm
              identifier={identifier}
              setIdentifier={setIdentifier}
              name={name}
              setName={setName}
              dob={dob}
              setDob={setDob}
              password={password}
              setPassword={setPassword}
              busy={busy}
              err={err}
              onSubmit={submitJoin}
              onSwitchMode={switchMode}
            />
          )}
        </div>
      </div>
    </div>
  );
}
