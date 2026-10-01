import { useState, type SubmitEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import { api, type PrivacyRequestType } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LEGAL } from "@/lib/legal";
import { formatDate } from "@/lib/format";
import { PageHero } from "@/components/page-hero";
import { Container } from "@/components/ui";

const inputCls =
  "w-full rounded-xl border border-sand bg-paper px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";

const TYPES: { value: PrivacyRequestType; label: string; hint: string }[] = [
  { value: "access", label: "See the data you hold about me", hint: "Signed-in members can also download everything at once from Me › Your data." },
  { value: "correction", label: "Correct something about me", hint: "Tell us what is wrong and what it should say." },
  { value: "deletion", label: "Delete something about me", hint: "A post, a photo or a page about you. To delete your whole account, use the account deletion page." },
  { value: "objection", label: "Object to how my data is used", hint: "For example, to a page about you, or to a kind of message we send." },
  { value: "other", label: "Something else about my data", hint: "Any other question under Ghana's Data Protection Act, 2012 (Act 843)." },
];

function isRequestType(v: string | null): v is PrivacyRequestType {
  return TYPES.some((t) => t.value === v);
}

/** Keep a prefilled target only when it is a link to this site (or a site path). */
function safeTarget(raw: string | null): string {
  if (!raw) return "";
  if (raw.startsWith("/")) return `${window.location.origin}${raw}`;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.origin === window.location.origin ? u.toString() : "";
  } catch {
    return "";
  }
}

function Field({ label, hint, children }: Readonly<{ label: string; hint?: string; children: ReactNode }>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

/**
 * Data-rights request form (K10 / Act 843). Public, sign-in optional. "Is this
 * about you?" links arrive here with ?type=…&target=<page>.
 */
export function Component() {
  usePageTitle("Make a privacy request");
  const { member } = useAuth();
  const [params] = useSearchParams();
  const initialType = params.get("type");
  const [type, setType] = useState<PrivacyRequestType>(isRequestType(initialType) ? initialType : "access");
  const [name, setName] = useState(member?.displayName ?? "");
  const [contact, setContact] = useState("");
  const [targetUrl, setTargetUrl] = useState(() => safeTarget(params.get("target")));
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string; dueAt?: string } | null>(null);
  const selected = TYPES.find((t) => t.value === type) ?? TYPES[0];

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (details.trim().length < 10) { setErr("Please tell us a little more (at least 10 characters)."); return; }
    setBusy(true); setErr(null);
    try {
      setDone(await api.privacyRequest({
        type,
        name: name.trim(),
        contact: contact.trim(),
        details: details.trim(),
        targetUrl: targetUrl.trim() || undefined,
      }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "We couldn't send your request. Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHero
        tone="teal"
        kicker="Your data"
        title="Make a privacy request"
        symbol="dwennimmen"
        lede="Ask to see, correct or delete personal data Oguaa holds about you, or object to how it is used. You don't need an account. We reply within the time Ghana's Data Protection Act allows and tell you the date when you send the request."
      />
      <Container size="wide" className="grid gap-8 py-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          {done ? (
            <div role="status" className="space-y-3 rounded-[var(--radius-card)] border border-green/30 bg-green/[0.06] p-6">
              <h2 className="text-xl font-semibold text-green-text">We&rsquo;ve received your request</h2>
              <p className="text-sm text-ink-muted">
                Your reference is <strong className="font-mono text-ink">{done.reference}</strong>. Keep it in case you need to contact us about this request.
              </p>
              {done.dueAt && <p className="text-sm text-ink-muted">We will respond by <strong className="text-ink">{formatDate(done.dueAt)}</strong>.</p>}
              <p className="text-sm text-ink-muted">We may contact you to confirm it&rsquo;s really you before we share or change anything.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5 rounded-[var(--radius-card)] border border-sand bg-cream p-6 sm:p-8">
              <Field label="What would you like to do? (required)" hint={selected.hint}>
                <select value={type} onChange={(e) => setType(e.target.value as PrivacyRequestType)} className={inputCls}>
                  {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              {type === "deletion" && (
                <p className="rounded-lg border border-sand bg-paper px-3 py-2 text-xs text-ink-muted">
                  Deleting your whole account? Use <Link to={LEGAL.deleteAccount} className="font-semibold text-green-text underline">the account deletion page</Link> — it&rsquo;s immediate.
                </p>
              )}
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Your name (required)" hint="So we know who is asking.">
                  <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} autoComplete="name" className={inputCls} />
                </Field>
                <Field label="Email or phone (required)" hint="Only to reply to you and confirm your identity.">
                  <input value={contact} onChange={(e) => setContact(e.target.value)} required maxLength={200} autoComplete="email" placeholder="you@example.com or +233…" className={inputCls} />
                </Field>
              </div>
              <Field label="Link to the page it's about (optional)" hint="Paste the address of the page, post or profile.">
                <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} type="url" maxLength={500} placeholder="https://…" className={inputCls} />
              </Field>
              <Field label="Your request (required)" hint="What you'd like us to do, and why. Please don't include ID numbers — we'll ask if we need to check who you are.">
                <textarea value={details} onChange={(e) => setDetails(e.target.value)} required minLength={10} maxLength={4000} rows={6} className={inputCls} />
              </Field>
              {err && <p role="alert" className="rounded-lg border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay-text">{err}</p>}
              <button type="submit" disabled={busy} className="rounded-full bg-green px-6 py-2.5 text-sm font-semibold text-on-green hover:bg-green-900 disabled:opacity-60">
                {busy ? "Sending…" : "Send my request"}
              </button>
              <p className="text-xs text-ink-faint">
                We use these details only to handle this request. See the <Link to={LEGAL.privacy} className="underline hover:text-ink">Privacy Policy</Link>.
              </p>
            </form>
          )}
        </div>
        <aside className="space-y-5">
          <section className="rounded-[var(--radius-card)] border border-sand bg-cream p-5 text-sm leading-relaxed text-ink-muted">
            <h2 className="text-lg font-semibold text-ink">Other ways to use your rights</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Download a copy of your data from <Link to="/me" className="font-semibold text-green-text underline">Me</Link> › Your data.</li>
              <li>Correct your profile yourself from <Link to="/me" className="font-semibold text-green-text underline">Me</Link>.</li>
              <li>Choose which messages we send you under Me › Notifications.</li>
              <li><Link to={LEGAL.deleteAccount} className="font-semibold text-green-text underline">Delete your account</Link>.</li>
              <li>Report harmful content with the Report link on the page itself — reports are reviewed within 24 hours.</li>
            </ul>
            <p className="mt-3">If you are unhappy with our answer, you can complain to Ghana&rsquo;s Data Protection Commission.</p>
          </section>
        </aside>
      </Container>
    </>
  );
}
