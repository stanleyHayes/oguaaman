import { useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Mark } from "@/components/layout";
import { OtpInput } from "@/components/otp-input";

const inputCls =
  "w-full rounded-xl border border-sand auth-theme-cream bg-cream px-4 py-3 text-ink placeholder:text-ink-faint transition-colors focus:border-gold-border focus:bg-paper focus:outline-none focus:ring-2 focus:ring-gold/20";

const primaryBtn =
  "rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green shadow-sm transition-colors hover:bg-green-900 disabled:opacity-60";

/** Trigger a client-side download of plain text (e.g. MFA recovery codes). */
function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type Stage =
  | { step: "qr"; secret: string; qr: string }
  | { step: "recovery"; codes: string[] };

/**
 * Authenticator-app enrolment: start → scan QR → verify first code → save
 * recovery codes. Used by the forced staff gate and the Settings page.
 */
export function MfaEnroll({ onDone, doneLabel = "Done" }: Readonly<{ onDone?: () => void; doneLabel?: string }>) {
  const { setMember } = useAuth();
  const [stage, setStage] = useState<Stage | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const begin = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await api.mfaSetup();
      setStage({ step: "qr", secret: res.secret, qr: res.qr });
      setCode("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't start setup.");
    } finally { setBusy(false); }
  };

  const confirm = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await api.mfaConfirm(code.trim());
      setStage({ step: "recovery", codes: res.recoveryCodes });
      // NB: don't refresh the member yet — the caller may unmount on
      // mfaEnabled=true, and the recovery codes must stay on screen.
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That code didn't work.");
    } finally { setBusy(false); }
  };

  const finish = async () => {
    setMember(await api.me());
    onDone?.();
  };

  if (stage?.step === "recovery") {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-gold-border/40 bg-gold/[0.1] px-3.5 py-3 text-sm text-gold-text">
          <b>Save these recovery codes now.</b> Each works once if you lose your phone — they won't be shown again.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {stage.codes.map((c) => (
            <code key={c} className="rounded-lg border border-sand auth-theme-cream bg-cream px-2 py-1.5 text-center font-mono text-xs text-ink">{c}</code>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => navigator.clipboard?.writeText(stage.codes.join("\n"))} className="rounded-full border border-green-text/30 px-4 py-2 text-sm font-semibold text-green-text hover:border-green-text">
            Copy codes
          </button>
          <button type="button" onClick={() => downloadText("oguaa-recovery-codes.txt", stage.codes.join("\n"))} className="rounded-full border border-green-text/30 px-4 py-2 text-sm font-semibold text-green-text hover:border-green-text">
            Download .txt
          </button>
          <button type="button" onClick={finish} className={primaryBtn}>{doneLabel} ✓</button>
        </div>
      </div>
    );
  }

  if (stage?.step === "qr") {
    return (
      <form ref={formRef} onSubmit={confirm} className="space-y-4">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-muted">
          <li>Scan this QR with your authenticator app (Google Authenticator, 1Password, Aegis…).</li>
          <li>Enter the 6-digit code it shows.</li>
        </ol>
        <div className="flex flex-wrap items-start gap-4">
          {/* Deliberately hardcoded white tile: authenticator cameras need a light, high-contrast
              backing to scan the QR — bg-paper would go dark in dark mode and break scanning. */}
          <div className="relative h-36 w-36 shrink-0">
            <img src={stage.qr} alt="Authenticator QR code" className="h-36 w-36 rounded-xl border border-sand bg-white p-2" />
            {/* Oguaa mark branded into the QR centre. Kept small (~19% of the code's
                width) so the QR's error correction still scans cleanly. */}
            <span className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-black/5">
              <Mark size={22} />
            </span>
          </div>
          <div className="min-w-[11rem] flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Can't scan? Enter this key</p>
            <p className="mt-1 break-all rounded-lg border border-sand auth-theme-cream bg-cream px-3 py-2 font-mono text-xs text-ink">{stage.secret}</p>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink">Enter the 6-digit code</p>
          <OtpInput value={code} onChange={setCode} onComplete={() => formRef.current?.requestSubmit()} ariaLabel="Authenticator code" />
        </div>
        {err && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className={primaryBtn}>{busy ? "Verifying…" : "Verify & turn on"}</button>
          <button type="button" onClick={() => { setStage(null); setErr(null); }} className="text-sm font-medium text-ink-muted hover:text-ink">Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <div>
      {err && <p className="mb-3 rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
      <button type="button" onClick={begin} disabled={busy} className={primaryBtn}>
        {busy ? "Starting…" : "Set up two-factor"}
      </button>
    </div>
  );
}

/** Disable flow with a current code — for the Settings page. */
export function MfaDisable({ onDone }: Readonly<{ onDone?: () => void }>) {
  const { setMember } = useAuth();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const confirm = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api.mfaDisable(code.trim());
      setMember(await api.me());
      setOpen(false);
      onDone?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That code didn't work.");
    } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => { setOpen(true); setCode(""); setErr(null); setRecovery(false); }} className="text-sm font-medium text-clay-text hover:underline">
        Turn off
      </button>
    );
  }
  return (
    <form onSubmit={confirm} className="space-y-3">
      <p className="text-sm text-ink-muted">Enter a current authenticator or recovery code to turn two-factor off.</p>
      {recovery ? (
        <div>
          <input value={code} onChange={(e) => setCode(e.target.value)} required autoFocus autoComplete="one-time-code" placeholder="xxxx-xxxx-xxxx" className={`${inputCls} max-w-[12rem]`} />
          <button type="button" onClick={() => { setRecovery(false); setCode(""); }} className="mt-2 block text-xs font-medium text-ink-muted underline hover:text-ink">Use authenticator code</button>
        </div>
      ) : (
        <div>
          <OtpInput value={code} onChange={setCode} ariaLabel="Authenticator code" />
          <button type="button" onClick={() => { setRecovery(true); setCode(""); }} className="mt-2 block text-xs font-medium text-ink-muted underline hover:text-ink">Use a recovery code instead</button>
        </div>
      )}
      {err && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className="rounded-full bg-clay px-5 py-2 text-sm font-semibold text-on-green hover:bg-clay-text disabled:opacity-60">
          {busy ? "Turning off…" : "Turn off two-factor"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm font-medium text-ink-muted hover:text-ink">Keep it on</button>
      </div>
    </form>
  );
}

/** Status + manage row for the Settings security card. */
export function MfaManage() {
  const { member } = useAuth();
  if (!member) return null;
  if (member.mfaEnabled) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">Two-factor is on — sign-ins need your authenticator app.</p>
        <span className="inline-flex items-center gap-3">
          <span className="rounded-full bg-green/[0.1] px-2.5 py-0.5 text-xs font-semibold text-green-text">On</span>
          <MfaDisable />
        </span>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">Protect the console with a second sign-in step — any authenticator app works.</p>
      <MfaEnroll />
    </div>
  );
}
