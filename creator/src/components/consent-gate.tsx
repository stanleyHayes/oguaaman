import { useState, type SubmitEvent } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PRIVACY_URL, TERMS_URL } from "@/lib/portal";
import type { Member } from "@/lib/types";
import { BusyLabel } from "./skeleton";

const linkCls = "font-semibold text-green-text underline hover:no-underline";

/**
 * Blocking Terms/Privacy (re-)consent step, shown when the server flags the
 * signed-in member with `consentRequired` (invited accounts, accounts that
 * joined before consent was recorded, or an older Terms version). Nothing in
 * the studio is reachable until the member agrees or signs out.
 */
export function ConsentGate({ member }: Readonly<{ member: Member }>) {
  const { setMember, signOut } = useAuth();
  const needsAdult = member.adultVerified !== true;
  const [agree, setAgree] = useState(false);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!agree) { setErr("Please agree to the Terms of Use and Privacy Policy to continue."); return; }
    if (needsAdult && !adult) { setErr("Please confirm you are 18 or older to continue."); return; }
    setBusy(true); setErr(null);
    try {
      setMember(await api.acceptConsent(needsAdult ? adult : false));
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "We couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        className="w-full max-w-lg space-y-5 rounded-2xl border border-sand bg-cream p-7 shadow-xl"
      >
        <div>
          <h1 id="consent-title" className="text-2xl font-semibold text-ink">Before you continue</h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Hi {member.displayName}. Please read and agree to Oguaa's{" "}
            <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>Terms of Use</a> and{" "}
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>Privacy Policy</a> to keep using the creator studio.
          </p>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Oguaa has zero tolerance for objectionable content and abusive users. You can report or block anyone, and reports are acted on within 24 hours.
          </p>
        </div>
        <label className="flex items-start gap-2.5 text-sm text-ink">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-green" />
          <span>I agree to the Terms of Use and Privacy Policy.</span>
        </label>
        {needsAdult && (
          <label className="flex items-start gap-2.5 text-sm text-ink">
            <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 accent-green" />
            <span>I confirm I am 18 or older.</span>
          </label>
        )}
        {err && <p role="alert" className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} aria-busy={busy || undefined} className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green shadow-sm transition-colors hover:bg-green-900 disabled:opacity-60">
            {busy ? <BusyLabel label="Saving your agreement" width="w-20" /> : "Agree and continue"}
          </button>
          <button type="button" onClick={signOut} className="text-sm font-medium text-ink-muted hover:text-ink">Sign out</button>
        </div>
      </form>
    </div>
  );
}
