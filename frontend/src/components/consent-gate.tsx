import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LEGAL } from "@/lib/legal";

/** Legal pages stay readable while the gate is up, so members can read what they agree to. */
const READABLE_PATHS = new Set<string>([LEGAL.terms, LEGAL.privacy, LEGAL.acceptableUse, LEGAL.deleteAccount, LEGAL.privacyRequest]);

/**
 * Blocking consent dialog (K2 / D8). Existing and invited members who have not
 * agreed to the current Terms of Use and Privacy Notice are asked once, when
 * /api/auth/me says `consentRequired`. Accounts whose age was never checked
 * also confirm they are 18 or older.
 */
export function ConsentGate() {
  const { member, setMember, signOut } = useAuth();
  const { pathname } = useLocation();
  const [agree, setAgree] = useState(false);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const open = Boolean(member?.consentRequired) && !READABLE_PATHS.has(pathname);

  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!member || !open) return null;
  const needsAdult = member.adultVerified === false;

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!agree) { setErr("Please agree to the Terms of Use and Privacy Policy to continue."); return; }
    if (needsAdult && !adult) { setErr("Please confirm you are 18 or older to continue."); return; }
    setBusy(true); setErr(null);
    try {
      setMember(await api.recordConsent(needsAdult ? adult : false));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "We couldn't save that. Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-ink/60 px-4 py-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-gate-title"
        tabIndex={-1}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-[var(--radius-card)] border border-sand bg-paper p-6 text-ink shadow-[var(--shadow-lift)] focus:outline-none"
      >
        <form onSubmit={submit} className="space-y-4">
          <div>
            <h2 id="consent-gate-title" className="text-xl font-semibold">Before you carry on</h2>
            <p className="mt-2 text-sm text-ink-muted">
              We&rsquo;ve updated how Oguaa works. Please read and agree to our Terms of Use and Privacy Policy to keep using your account.
              Oguaa has zero tolerance for objectionable content and abusive users.
            </p>
          </div>
          <label className="flex items-start gap-2.5 rounded-xl border border-sand bg-cream px-3.5 py-3">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-green" />
            <span className="text-sm leading-relaxed text-ink-muted">
              I agree to the{" "}
              <a href={LEGAL.terms} target="_blank" rel="noopener" className="font-semibold text-green-text underline">Terms of Use</a> and the{" "}
              <a href={LEGAL.privacy} target="_blank" rel="noopener" className="font-semibold text-green-text underline">Privacy Policy</a>.
            </span>
          </label>
          {needsAdult && (
            <label className="flex items-start gap-2.5 rounded-xl border border-sand bg-cream px-3.5 py-3">
              <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 h-4 w-4 accent-green" />
              <span className="text-sm leading-relaxed text-ink-muted">I confirm I am 18 or older.</span>
            </label>
          )}
          {err && <p className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className="rounded-full bg-green px-5 py-2 text-sm font-semibold text-on-green hover:bg-green-900 disabled:opacity-60">
              {busy ? "Saving…" : "Agree and continue"}
            </button>
            <button type="button" onClick={signOut} className="text-sm font-medium text-ink-muted hover:text-ink">
              Sign out
            </button>
          </div>
          <p className="text-xs text-ink-faint">
            Don&rsquo;t want to agree? You can{" "}
            <a href={LEGAL.deleteAccount} className="underline hover:text-ink">delete your account</a> instead.
          </p>
        </form>
      </div>
    </div>
  );
}
