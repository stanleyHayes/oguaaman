import { useState, type SubmitEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import { api, type ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LEGAL } from "@/lib/legal";
import { PageHero } from "@/components/page-hero";
import { Container } from "@/components/ui";
import { OtpInput } from "@/components/otp-input";
import { DeletionBlockers, DeletionDone, FactList } from "@/components/account-deletion";
import { BEFORE_YOU_DELETE, DELETED_ITEMS, RETAINED_ITEMS } from "@/lib/account-deletion";

const inputCls =
  "w-full rounded-xl border border-sand bg-paper px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";

/**
 * Public account-deletion page (Google Play's web deletion URL; K6). Explains
 * what is deleted and kept, how app users delete in-app, and lets anyone who
 * cannot sign in delete by confirming a code sent to the account's email or
 * phone.
 */
export function Component() {
  usePageTitle("Delete your Oguaa account");
  const { member, signOut } = useAuth();
  // /me hands over the server's retained list after an in-app deletion.
  const handedOver = (useLocation().state as { retained?: string[] } | null)?.retained;
  const [identifier, setIdentifier] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [retained, setRetained] = useState<string[] | null>(handedOver ?? null);

  const start = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api.startAccountDeletion(identifier.trim());
      setCodeSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "We couldn't send a code right now. Try again later.");
    } finally { setBusy(false); }
  };

  const confirm = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true); setErr(null); setBlockers([]);
    try {
      const res = await api.confirmAccountDeletion(identifier.trim(), code.trim());
      if (member) signOut();
      setRetained(res.retained ?? []);
    } catch (e) {
      const apiErr = e as ApiError;
      if (apiErr.status === 409 && apiErr.data?.blockers?.length) setBlockers(apiErr.data.blockers);
      else setErr(apiErr.message || "That code didn't work or has expired.");
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHero
        tone="maroon"
        kicker="Your data"
        title="Delete your Oguaa account"
        symbol="dwennimmen"
        lede="This page is for the Oguaa website and the Oguaa app for Android and iPhone. Deleting your account erases your personal data. Some records are kept, without your name or contact details, where the law or the platform needs them."
      />
      <Container size="wide" className="grid gap-8 py-10 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          {retained ? (
            <DeletionDone retained={retained} />
          ) : (
            <>
              <section className="rounded-[var(--radius-card)] border border-sand bg-cream p-6">
                <h2 className="text-xl font-semibold text-ink">How to delete your account</h2>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink-muted">
                  <li>
                    <strong className="text-ink">In the app:</strong> open More › Security &amp; settings › Your data › Delete my account, and
                    confirm with your password.
                  </li>
                  <li>
                    <strong className="text-ink">On the website:</strong>{" "}
                    {member ? (
                      <>go to <Link to="/me" className="font-semibold text-green-text underline">Me</Link> › Your data › Delete my account.</>
                    ) : (
                      <>sign in, then go to Me › Your data › Delete my account.</>
                    )}
                  </li>
                  <li>
                    <strong className="text-ink">Can&rsquo;t sign in, or never set a password?</strong> Use the form below. We send a 6-digit code to
                    the email address or phone number on the account, and the account is deleted once you enter it.
                  </li>
                </ol>
              </section>

              <section className="rounded-[var(--radius-card)] border border-clay/30 bg-cream p-6">
                <h2 className="text-xl font-semibold text-ink">Delete with a code</h2>
                <p className="mt-1 text-sm text-ink-muted">This can&rsquo;t be undone.</p>
                <form onSubmit={codeSent ? confirm : start} className="mt-4 space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-ink">Email or phone on the account (required)</span>
                    <input
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      required
                      disabled={codeSent}
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="you@example.com or +233…"
                      className={inputCls}
                    />
                    <span className="mt-1 block text-xs text-ink-faint">Used only to find the account and send the code.</span>
                  </label>
                  {codeSent && (
                    <div>
                      <p className="mb-2 text-sm text-ink-muted">
                        If an account uses that email or phone, we&rsquo;ve sent it a 6-digit code. It lasts 15 minutes.
                      </p>
                      <OtpInput value={code} onChange={setCode} ariaLabel="Deletion code" autoFocus />
                    </div>
                  )}
                  {blockers.length > 0 && <DeletionBlockers blockers={blockers} />}
                  {err && <p role="alert" className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="submit" disabled={busy} className="rounded-full bg-clay px-5 py-2 text-sm font-semibold text-cream hover:bg-clay-text disabled:opacity-60">
                      {busy && "Please wait…"}
                      {!busy && (codeSent ? "Delete my account" : "Send me a code")}
                    </button>
                    {codeSent && (
                      <button type="button" onClick={() => { setCodeSent(false); setCode(""); setErr(null); setBlockers([]); }} className="text-sm font-medium text-ink-muted hover:text-ink">
                        Use a different email or phone
                      </button>
                    )}
                  </div>
                </form>
              </section>
            </>
          )}
        </div>

        <aside className="space-y-5">
          <FactList title="What we delete" items={DELETED_ITEMS} />
          <FactList title="What we keep, and why" items={RETAINED_ITEMS} />
          <FactList title="Before you delete" items={BEFORE_YOU_DELETE} tone="warn" />
          <p className="text-sm text-ink-faint">
            Want only some of your data deleted, or corrected?{" "}
            <Link to={LEGAL.privacyRequest} className="font-semibold text-green-text underline">Make a privacy request</Link>. See the{" "}
            <Link to={LEGAL.privacy} className="font-semibold text-green-text underline">Privacy Policy</Link> for how long we keep each kind of record.
          </p>
        </aside>
      </Container>
    </>
  );
}
