import { useEffect, useRef, useState, type ReactNode, type RefObject, type SubmitEvent } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "@/lib/auth";
import { Adinkra } from "@/components/adinkra";
import { Wordmark } from "@/components/wordmark";
import { DatePicker } from "@/components/date-picker";
import { OtpInput } from "@/components/otp-input";

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
    <aside className="on-dark on-dark-pin relative overflow-hidden bg-gradient-to-br from-green to-green-900 p-8 text-cream lg:p-10">
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
  "w-full rounded-full bg-green py-3 text-sm font-semibold text-on-green shadow-sm transition-colors hover:bg-green-900 disabled:opacity-60";

const backBtnCls =
  "rounded-full border border-sand bg-cream px-6 py-3 text-sm font-semibold text-ink-muted transition-colors hover:border-green/40 hover:text-ink";

function PasswordInput({
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
}: Readonly<{
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder: string;
  minLength?: number;
}>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={`${inputCls} pr-12`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint transition-colors hover:text-ink"
      >
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 3l18 18" />
            <path d="M10.6 5.1A11 11 0 0 1 12 5c6 0 9.5 7 9.5 7a17.9 17.9 0 0 1-2.8 3.8" />
            <path d="M6.1 6.1A17.5 17.5 0 0 0 2.5 12S6 19 12 19a10.6 10.6 0 0 0 4-.8" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

function adultCutoffIso() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Creator kinds offered on the Join form (Creator Platform plan §3).
const CREATOR_KINDS = [
  { id: "business", label: "Business owner" },
  { id: "artist", label: "Artist" },
  { id: "organiser", label: "Event organiser" },
  { id: "writer", label: "Writer" },
  { id: "institution", label: "Institution" },
] as const;

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
        <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" placeholder="Your password" />
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

function MfaForm({ code, setCode, busy, err, onSubmit, onCancel }: Readonly<{
  code: string;
  setCode: (v: string) => void;
  busy: boolean;
  err: string | null;
  onSubmit: (e: SubmitEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}>) {
  // The verify step accepts either a 6-digit authenticator code (the OtpInput)
  // or a longer alphanumeric recovery code — a single free-text field the user
  // can switch to. Both bind to the same `code` state so submit logic is unchanged.
  const [recovery, setRecovery] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Two-factor check</h2>
        <p className="mt-1 text-sm text-ink-muted">Enter the 6-digit code from your authenticator app, or one of your recovery codes.</p>
      </div>
      {recovery ? (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Recovery code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoFocus
            autoComplete="one-time-code"
            placeholder="xxxx-xxxx-xxxx"
            className={inputCls}
          />
          <button type="button" onClick={() => { setRecovery(false); setCode(""); }} className="mt-2 text-xs font-medium text-ink-muted underline hover:text-ink">
            Use authenticator code
          </button>
        </label>
      ) : (
        <div className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Code</span>
          <OtpInput
            value={code}
            onChange={setCode}
            onComplete={() => formRef.current?.requestSubmit()}
            autoFocus
            ariaLabel="Authenticator code"
          />
          <button type="button" onClick={() => { setRecovery(true); setCode(""); }} className="mt-2 text-xs font-medium text-ink-muted underline hover:text-ink">
            Use a recovery code instead
          </button>
        </div>
      )}
      {err && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
      <button type="submit" disabled={busy} className={submitBtnCls}>
        {busy ? "Verifying…" : "Verify & sign in"}
      </button>
      <p className="text-center text-xs text-ink-faint">
        <button type="button" onClick={onCancel} className="font-medium text-ink-muted underline hover:text-ink">
          ← Back to sign in
        </button>
      </p>
    </form>
  );
}

type JoinStep = 1 | 2 | 3;

const JOIN_STEP_TITLES = ["Who you are", "How we reach you", "Secure your account"] as const;

// Wraps one wizard step's fields; when the step is reached through Next/Back it
// moves focus to the step's first control so keyboard & screen-reader users
// land inside the new step.
function JoinStepPanel({ focusOnMount, children }: Readonly<{ focusOnMount: RefObject<boolean>; children: ReactNode }>) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!focusOnMount.current) return;
    ref.current?.querySelector<HTMLElement>('input, button, select, [tabindex]:not([tabindex="-1"])')?.focus();
  }, [focusOnMount]);
  return (
    <div ref={ref} className="space-y-5">
      {children}
    </div>
  );
}

function JoinForm({
  step,
  identifier,
  setIdentifier,
  name,
  setName,
  dob,
  setDob,
  asCreator,
  setAsCreator,
  creatorTypes,
  onToggleCreatorType,
  password,
  setPassword,
  consent,
  setConsent,
  busy,
  err,
  onNext,
  onBack,
  onSubmit,
  onSwitchMode,
}: Readonly<{
  step: JoinStep;
  identifier: string;
  setIdentifier: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  dob: string;
  setDob: (v: string) => void;
  asCreator: boolean;
  setAsCreator: (v: boolean) => void;
  creatorTypes: string[];
  onToggleCreatorType: (id: string) => void;
  password: string;
  setPassword: (v: string) => void;
  consent: boolean;
  setConsent: (v: boolean) => void;
  busy: boolean;
  err: string | null;
  onNext: () => void;
  onBack: () => void;
  onSubmit: (e: SubmitEvent<HTMLFormElement>) => void;
  onSwitchMode: (m: Mode) => void;
}>) {
  const choiceCls = (on: boolean) =>
    `rounded-xl border px-3 py-2.5 text-left transition-colors ${on ? "border-green bg-green/[0.06]" : "border-sand bg-cream hover:border-green/40"}`;
  // False on the form's first commit so we never steal focus on page load;
  // true afterwards, so every step mounted via Next/Back takes focus.
  const visited = useRef(false);
  useEffect(() => {
    visited.current = true;
  }, []);
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Join Oguaa</h2>
        <p className="mt-1 text-sm text-ink-muted">Create your account — one password for web & mobile.</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-ink-muted">
            Step {step} of 3 · {JOIN_STEP_TITLES[step - 1]}
          </p>
          <div className="flex gap-1.5" aria-hidden>
            {JOIN_STEP_TITLES.map((t, i) => (
              <span key={t} className={`h-1.5 w-6 rounded-full transition-colors ${i < step ? "bg-green" : "bg-sand"}`} />
            ))}
          </div>
        </div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <JoinStepPanel focusOnMount={visited}>
            {step === 1 ? (
              <>
                <div className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">I'm joining as</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setAsCreator(false)} className={choiceCls(!asCreator)} aria-pressed={!asCreator}>
                      <span className="block text-sm font-semibold text-ink">A citizen</span>
                      <span className="mt-0.5 block text-xs text-ink-faint">Memories, memorials, school ties</span>
                    </button>
                    <button type="button" onClick={() => setAsCreator(true)} className={choiceCls(asCreator)} aria-pressed={asCreator}>
                      <span className="block text-sm font-semibold text-ink">A creator</span>
                      <span className="mt-0.5 block text-xs text-ink-faint">Listings, promotions, a dashboard</span>
                    </button>
                  </div>
                </div>
                {asCreator && (
                  <div className="block">
                    <span className="mb-1.5 block text-sm font-medium text-ink">
                      What do you create? <span className="font-normal text-ink-faint">pick all that apply</span>
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {CREATOR_KINDS.map((k) => {
                        const on = creatorTypes.includes(k.id);
                        return (
                          <button key={k.id} type="button" onClick={() => onToggleCreatorType(k.id)} aria-pressed={on}
                            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${on ? "border-green bg-green text-on-green" : "border-sand bg-cream text-ink-muted hover:border-green/40"}`}>
                            {k.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 text-xs text-ink-faint">Creators get a dashboard to add listings, promote them and manage a plan.</p>
                  </div>
                )}
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Your name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" placeholder="Display name" className={inputCls} />
                </label>
              </>
            ) : step === 2 ? (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Phone or email</span>
                  <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required placeholder="+233… or you@email" className={inputCls} />
                </label>
                <div className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Date of birth</span>
                  <DatePicker value={dob} onChange={setDob} max={adultCutoffIso()} placeholder="dd/mm/yyyy" className="w-full" />
                  <span className="mt-1.5 block text-xs text-ink-faint">Oguaa is for ages 18 and over.</span>
                </div>
              </>
            ) : (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Password</span>
                  <PasswordInput value={password} onChange={setPassword} minLength={8} autoComplete="new-password" placeholder="Choose a password" />
                  <span className="mt-1.5 block text-xs text-ink-faint">At least 8 characters</span>
                </label>
                <label className="flex items-start gap-2.5 rounded-xl border border-sand bg-cream px-3.5 py-3">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-green" />
                  <span className="text-xs leading-relaxed text-ink-muted">
                    I agree to the <a href="/terms" className="font-semibold text-green-text underline">Terms of Use</a> and the{" "}
                    <a href="/privacy" className="font-semibold text-green-text underline">Privacy Policy</a>, and I consent to Oguaa storing the details above so my account can work.
                  </span>
                </label>
              </>
            )}
          </JoinStepPanel>
        </motion.div>
      </AnimatePresence>
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
      <div className="flex gap-3">
        {step > 1 && (
          <button type="button" onClick={onBack} className={backBtnCls}>
            ← Back
          </button>
        )}
        {step < 3 ? (
          <button type="button" onClick={onNext} className={`${submitBtnCls} flex-1`}>
            Next →
          </button>
        ) : (
          <button type="submit" disabled={busy} className={`${submitBtnCls} flex-1`}>
            {busy ? "Creating…" : "Create my account →"}
          </button>
        )}
      </div>
    </form>
  );
}

export function Component() {
  const { member, signIn, completeMfa, join } = useAuth();
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
  const [asCreator, setAsCreator] = useState(params.get("as") === "creator");
  const [creatorTypes, setCreatorTypes] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [joinStep, setJoinStep] = useState<JoinStep>(1);
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (member) return <Navigate to={from} replace />;

  const switchMode = (m: Mode) => {
    setMode(m);
    setErr(null);
    setPassword("");
    setMfaChallenge(null);
    setJoinStep(1);
  };

  const submitSignIn = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await signIn(identifier.trim(), password);
      if (res.mfaRequired && res.challenge) {
        setMfaChallenge(res.challenge);
        setMfaCode("");
      } else {
        nav(from, { replace: true });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign in failed.");
    } finally { setBusy(false); }
  };

  const submitMfa = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!mfaChallenge) return;
    setBusy(true); setErr(null);
    try {
      await completeMfa(mfaChallenge, mfaCode.trim());
      nav(from, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That code didn't work.");
    } finally { setBusy(false); }
  };

  // Validates the current wizard step; only a clean step advances.
  const joinNext = () => {
    if (joinStep === 1) {
      if (asCreator && creatorTypes.length === 0) {
        setErr("Pick at least one creator type — business, artist, organiser, writer or institution.");
        return;
      }
      if (!name.trim()) {
        setErr("Please enter your name.");
        return;
      }
    } else if (joinStep === 2) {
      if (!identifier.trim()) {
        setErr("Please enter your phone or email.");
        return;
      }
      if (!dob) {
        setErr("Please choose your date of birth.");
        return;
      }
    }
    setErr(null);
    setJoinStep((s) => (s === 1 ? 2 : 3));
  };

  const joinBack = () => {
    setErr(null);
    setJoinStep((s) => (s === 3 ? 2 : 1));
  };

  const submitJoin = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Enter inside a step-1/2 field submits the form — treat it as Next.
    if (joinStep < 3) {
      joinNext();
      return;
    }
    setBusy(true); setErr(null);
    if (password.length < 8) {
      setErr("Your password must be at least 8 characters.");
      setBusy(false);
      return;
    }
    if (!consent) {
      setErr("Please agree to the Terms of Use and Privacy Policy to join.");
      setBusy(false);
      return;
    }
    try {
      await join({ identifier: identifier.trim(), displayName: name.trim(), dateOfBirth: dob, password, creatorTypes: asCreator ? creatorTypes : [] });
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
          {mfaChallenge ? (
            <MfaForm
              code={mfaCode}
              setCode={setMfaCode}
              busy={busy}
              err={err}
              onSubmit={submitMfa}
              onCancel={() => { setMfaChallenge(null); setErr(null); setPassword(""); }}
            />
          ) : mode === "signin" ? (
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
              step={joinStep}
              identifier={identifier}
              setIdentifier={setIdentifier}
              name={name}
              setName={setName}
              dob={dob}
              setDob={setDob}
              asCreator={asCreator}
              setAsCreator={setAsCreator}
              creatorTypes={creatorTypes}
              onToggleCreatorType={(id) => setCreatorTypes((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id]))}
              password={password}
              setPassword={setPassword}
              consent={consent}
              setConsent={setConsent}
              busy={busy}
              err={err}
              onNext={joinNext}
              onBack={joinBack}
              onSubmit={submitJoin}
              onSwitchMode={switchMode}
            />
          )}
        </div>
      </div>
    </div>
  );
}
