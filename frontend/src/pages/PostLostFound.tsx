import { useState, type ReactNode, type SubmitEvent} from "react";
import { Link, useNavigate } from "react-router-dom";
import type { LostFound, LostFoundKind } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { LOST_FOUND_KINDS } from "@/lib/lostfound";
import { DatePicker } from "@/components/date-picker";
import { ImageUpload } from "@/components/image-upload";
import { EmergencyCallout } from "@/components/emergency-callout";

const inputCls = "w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";

function Field({ label, children, hint }: Readonly<{ label: string; children: ReactNode; hint?: string }>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

export function Component() {
  const { member } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [kind, setKind] = useState<LostFoundKind | "">("");
  const [minor, setMinor] = useState(false);
  // Missing-person notices, and posts from members without a verified phone,
  // wait for a curator (G087).
  const [held, setHeld] = useState<LostFound | null>(null);
  const missing = kind === "missing_person";
  // Local YYYY-MM-DD upper bound for the picker — a "last seen" date can't be in the future.
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const s = (k: string) => { const v = fd.get(k); return typeof v === "string" ? v : ""; };
    try {
      const cover = coverImageUrl.trim();
      const created = await api.createLostFound({
        title: s("title").trim(),
        kind: s("kind") as LostFoundKind,
        description: s("description").trim(),
        lastSeenLocation: s("lastSeenLocation").trim(),
        lastSeenDate: s("lastSeenDate").trim(),
        contact: s("contact").trim(),
        ...(missing ? {
          subjectIsMinor: minor,
          guardianAttestation: minor ? fd.get("guardianAttestation") === "on" : undefined,
          guardianRelation: minor ? s("guardianRelation").trim() : undefined,
          policeReference: s("policeReference").trim() || undefined,
        } : {}),
        // coverImageUrl is a standard Listing field the backend accepts, but
        // api.createLostFound's signature doesn't declare it — assert through
        // so the optional photo rides along in the JSON body.
        coverImageUrl: cover || undefined,
      } as Parameters<typeof api.createLostFound>[0]);
      if (created.held || created.status === "pending") setHeld(created);
      else navigate(`/lost-found/${created.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post the notice — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHero tone="teal" kicker="Lost & found" title="Post a notice" symbol="crab" lede="Lost something, found something, or searching for someone? Post it here. Most notices go live straight away; missing-person notices are checked by a curator first. When it's resolved, mark it reunited and let the town share the good news." />
      <Container size="wide" className="pt-8">
        <EmergencyCallout />
      </Container>
      <Container size="wide" className="grid gap-10 py-10 lg:grid-cols-[1.6fr_1fr]">
        <div>
          {held ? (
            <div role="status" className="rounded-[var(--radius-card)] border border-gold-border/50 bg-gold/[0.08] p-8">
              <p className="eyebrow text-gold-text">Sent to curators for review</p>
              <h2 className="mt-2 text-2xl font-semibold text-ink">Thank you — a curator will check this first</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                Missing-person notices, and notices from accounts without a verified phone number, are reviewed by an Oguaa curator before they
                are published. You&rsquo;ll get a notification when it is reviewed. If someone is in danger, call 112 now.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to={`/lost-found/${held.slug}`} className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green hover:bg-green-900">View your notice</Link>
                <Link to="/lost-found" className="rounded-full border border-sand px-5 py-2.5 text-sm font-semibold text-ink-muted hover:text-ink">Back to Lost &amp; Found</Link>
              </div>
            </div>
          ) : member ? (
            <form onSubmit={onSubmit} className="space-y-5 rounded-[var(--radius-card)] border border-sand bg-cream p-6 sm:p-8">
              <Field label="What kind of notice?">
                <select name="kind" required className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as LostFoundKind)}>
                  <option value="" disabled>Choose…</option>
                  {LOST_FOUND_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </Field>
              <Field label="Title" hint="Short and clear — e.g. “Lost: black Samsung phone at Victoria Park”.">
                <input name="title" required minLength={2} maxLength={160} className={inputCls} placeholder="What are you looking for?" />
              </Field>
              <Field label="Description" hint="Who or what, and how to recognise them — a uniform, a collar, a keyring.">
                <textarea name="description" required rows={5} className={inputCls} placeholder="Describe the item or person…" />
              </Field>
              {missing && (
                <fieldset className="space-y-3 rounded-xl border border-maroon-900/25 bg-maroon-900/[0.04] p-4">
                  <legend className="px-1 text-sm font-semibold text-ink">About the missing person</legend>
                  <label className="flex items-start gap-2.5 text-sm text-ink-muted">
                    <input type="checkbox" checked={minor} onChange={(e) => setMinor(e.target.checked)} className="mt-0.5 h-4 w-4 accent-green" />
                    They are under 18
                  </label>
                  {minor && (
                    <>
                      <label className="flex items-start gap-2.5 text-sm text-ink-muted">
                        <input type="checkbox" name="guardianAttestation" required className="mt-0.5 h-4 w-4 accent-green" />
                        I am this child&rsquo;s parent, guardian or close relative, or a teacher or official acting with the family&rsquo;s knowledge. (Required)
                      </label>
                      <Field label="Your relation to the child (required)" hint="For example: mother, uncle, class teacher.">
                        <input name="guardianRelation" required maxLength={60} className={inputCls} />
                      </Field>
                    </>
                  )}
                  <Field label="Police reference (optional)" hint="If you have reported this to the police, the reference helps curators verify the notice.">
                    <input name="policeReference" maxLength={80} className={inputCls} />
                  </Field>
                </fieldset>
              )}
              <ImageUpload value={coverImageUrl} onChange={setCoverImageUrl} label="Add a photo (optional)" hint="Optional and shown publicly. Don't upload a child's photo without a parent or guardian's consent. JPG, PNG or WebP, up to 8 MB." />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Last seen where" hint="A landmark, a street, a compound.">
                  <input name="lastSeenLocation" className={inputCls} placeholder="e.g. Kotokuraba Market, main gate" />
                </Field>
                <Field label="Last seen when">
                  <DatePicker name="lastSeenDate" max={todayIso} className="w-full" />
                </Field>
              </div>
              <Field label="Your contact (required, kept private)" hint="Seen only by you and Oguaa's safety curators — never shown publicly. People with information message you through Oguaa.">
                <input name="contact" required className={inputCls} placeholder="e.g. 024 000 0000" />
              </Field>
              {error && <p className="rounded-lg bg-maroon-900/[0.06] px-4 py-2.5 text-sm text-maroon-text">{error}</p>}
              <button type="submit" disabled={busy} className="rounded-full bg-green px-6 py-2.5 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-60">
                {busy ? "Posting…" : "Post the notice"}
              </button>
            </form>
          ) : (
            <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-8 text-center">
              <h2 className="text-2xl font-semibold text-ink">Sign in to post</h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-ink-muted">
                Notices are attributed to a verified member — that keeps the board trustworthy when it matters most. It takes a moment: sign in with your phone or email and you&apos;re in.
              </p>
              <div className="mt-6"><Cta to="/signin" variant="gold">Sign in / create account</Cta></div>
            </div>
          )}
        </div>
        <aside className="space-y-6">
          <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5">
            <h2 className="text-lg font-semibold text-ink">How it works</h2>
            <ol className="mt-3 space-y-3 text-sm text-ink-muted">
              {[
                ["Posted", "Most notices go live straight away. Missing-person notices wait for a curator."],
                ["Shared", "Neighbours see it, share it, keep an eye out."],
                ["Reunited", "Back where it belongs — mark it and give thanks."],
              ].map(([k, v], i) => (
                <li key={k} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green text-xs font-bold text-on-green">{i + 1}</span><span><b className="text-ink">{k}.</b> {v}</span></li>
              ))}
            </ol>
          </div>
          <div className="rounded-[var(--radius-card)] border border-dashed border-sand p-5 text-sm text-ink-faint">
            Missing-person notices alert every curator immediately. If someone is in danger, call 112 first — then post here so the whole town can help search.
          </div>
        </aside>
      </Container>
    </>
  );
}
