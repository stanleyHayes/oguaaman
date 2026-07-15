import { useState, type SubmitEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const inputCls =
  "w-full rounded-xl border border-sand bg-cream px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-gold-border focus:bg-paper focus:outline-none focus:ring-2 focus:ring-gold/20";

type MfaStage =
  | { step: "idle" }
  | { step: "enroll"; secret: string; qr: string }
  | { step: "recovery"; codes: string[] }
  | { step: "disable" };

/** Two-factor (authenticator app) enrolment + removal — lives in Me's "Security" panel. */
export function SecuritySettings() {
  const { member, setMember } = useAuth();
  const [stage, setStage] = useState<MfaStage>({ step: "idle" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!member) return null;

  const refresh = async () => setMember(await api.me());

  const beginEnroll = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await api.mfaSetup();
      setStage({ step: "enroll", secret: res.secret, qr: res.qr });
      setCode("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't start setup.");
    } finally { setBusy(false); }
  };

  const confirmEnroll = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await api.mfaConfirm(code.trim());
      setStage({ step: "recovery", codes: res.recoveryCodes });
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That code didn't work.");
    } finally { setBusy(false); }
  };

  const confirmDisable = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api.mfaDisable(code.trim());
      await refresh();
      setStage({ step: "idle" });
      setCode("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That code didn't work.");
    } finally { setBusy(false); }
  };

  if (stage.step === "enroll") {
    return (
      <form onSubmit={confirmEnroll} className="space-y-4">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-muted">
          <li>Scan this QR with your authenticator app (Google Authenticator, 1Password, Aegis…).</li>
          <li>Enter the 6-digit code it shows.</li>
        </ol>
        <div className="flex flex-wrap items-start gap-4">
          <img src={stage.qr} alt="Authenticator QR code" className="h-40 w-40 rounded-xl border border-sand bg-paper p-2" />
          <div className="min-w-[12rem] flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Can't scan? Enter this key</p>
            <p className="mt-1 break-all rounded-lg border border-sand bg-cream px-3 py-2 font-mono text-sm text-ink">{stage.secret}</p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123 456"
              className={`${inputCls} mt-3 text-center tracking-[0.3em]`}
            />
          </div>
        </div>
        {err && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className="rounded-full bg-green px-5 py-2 text-sm font-semibold text-cream hover:bg-green-900 disabled:opacity-60">
            {busy ? "Verifying…" : "Verify & turn on"}
          </button>
          <button type="button" onClick={() => { setStage({ step: "idle" }); setErr(null); }} className="text-sm font-medium text-ink-muted hover:text-ink">Cancel</button>
        </div>
      </form>
    );
  }

  if (stage.step === "recovery") {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-gold-border/40 bg-gold/[0.1] px-3.5 py-3 text-sm text-gold-text">
          <b>Save these recovery codes now.</b> Each works once if you lose your phone. They won't be shown again.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stage.codes.map((c) => (
            <code key={c} className="rounded-lg border border-sand bg-cream px-2 py-1.5 text-center font-mono text-xs text-ink">{c}</code>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(stage.codes.join("\n"))}
            className="rounded-full border border-green/30 px-4 py-2 text-sm font-semibold text-green hover:border-green"
          >
            Copy codes
          </button>
          <button type="button" onClick={() => setStage({ step: "idle" })} className="rounded-full bg-green px-5 py-2 text-sm font-semibold text-cream hover:bg-green-900">
            I've saved them ✓
          </button>
        </div>
      </div>
    );
  }

  if (stage.step === "disable") {
    return (
      <form onSubmit={confirmDisable} className="space-y-3">
        <p className="text-sm text-ink-muted">Enter a current code from your authenticator (or a recovery code) to turn two-factor off.</p>
        <input value={code} onChange={(e) => setCode(e.target.value)} required inputMode="numeric" autoComplete="one-time-code" placeholder="123 456" className={`${inputCls} max-w-[12rem] text-center tracking-[0.3em]`} />
        {err && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className="rounded-full bg-clay px-5 py-2 text-sm font-semibold text-cream hover:bg-clay-text disabled:opacity-60">
            {busy ? "Turning off…" : "Turn off two-factor"}
          </button>
          <button type="button" onClick={() => { setStage({ step: "idle" }); setErr(null); }} className="text-sm font-medium text-ink-muted hover:text-ink">Keep it on</button>
        </div>
      </form>
    );
  }

  // idle
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink-muted">
        {member.mfaEnabled
          ? "Two-factor is on — sign-ins need your authenticator app."
          : "Add a second step to sign-in with any authenticator app."}
      </p>
      {member.mfaEnabled ? (
        <span className="inline-flex items-center gap-3">
          <span className="rounded-full bg-green/[0.1] px-2.5 py-0.5 text-xs font-semibold text-green">On</span>
          <button type="button" onClick={() => { setStage({ step: "disable" }); setCode(""); setErr(null); }} className="text-sm font-medium text-clay-text hover:underline">
            Turn off
          </button>
        </span>
      ) : (
        <button type="button" onClick={beginEnroll} disabled={busy} className="rounded-full bg-green px-5 py-2 text-sm font-semibold text-cream hover:bg-green-900 disabled:opacity-60">
          {busy ? "Starting…" : "Turn on two-factor"}
        </button>
      )}
    </div>
  );
}

/** Act 843 data rights — export everything, or erase the account. */
export function DataRightsSettings() {
  const { signOut } = useAuth();
  const nav = useNavigate();
  const [exportBusy, setExportBusy] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const doExport = async () => {
    setExportBusy(true); setExportErr(null);
    try {
      const blob = await api.exportData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "oguaa-data-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : "Couldn't export your data.");
    } finally { setExportBusy(false); }
  };

  const doDelete = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDeleteBusy(true); setDeleteErr(null);
    try {
      await api.deleteAccount(password);
      signOut();
      nav("/", { replace: true });
    } catch (e) {
      setDeleteErr(e instanceof Error ? e.message : "Couldn't delete your account.");
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">Everything Oguaa holds about you — profile, listings, tickets, pledges — as a JSON file.</p>
        <button type="button" onClick={doExport} disabled={exportBusy} className="rounded-full border border-green/30 px-4 py-2 text-sm font-semibold text-green hover:border-green disabled:opacity-60">
          {exportBusy ? "Preparing…" : "Download my data"}
        </button>
      </div>
      {exportErr && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{exportErr}</p>}

      <div className="border-t border-sand pt-4">
        {!confirming ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">Erase your personal data and close your account. Published community content stays, under “Former member”.</p>
            <button type="button" onClick={() => setConfirming(true)} className="rounded-full border border-clay/40 px-4 py-2 text-sm font-semibold text-clay-text hover:bg-clay/5">
              Delete my account
            </button>
          </div>
        ) : (
          <form onSubmit={doDelete} className="space-y-3 rounded-xl border border-clay/30 bg-clay/[0.04] p-4">
            <p className="text-sm font-semibold text-clay-text">This can't be undone.</p>
            <p className="text-sm text-ink-muted">Your profile, contact details, schooling and settings are wiped and the account is closed. Enter your password to confirm.</p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Your password"
              className={`${inputCls} max-w-xs`}
            />
            {deleteErr && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{deleteErr}</p>}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={deleteBusy} className="rounded-full bg-clay px-5 py-2 text-sm font-semibold text-cream hover:bg-clay-text disabled:opacity-60">
                {deleteBusy ? "Deleting…" : "Yes — delete everything"}
              </button>
              <button type="button" onClick={() => { setConfirming(false); setPassword(""); setDeleteErr(null); }} className="text-sm font-medium text-ink-muted hover:text-ink">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
