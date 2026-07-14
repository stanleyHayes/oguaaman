import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LostFoundKind } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { LOST_FOUND_KINDS } from "@/lib/lostfound";

const inputCls = "w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const created = await api.createLostFound({
        title: String(fd.get("title") ?? "").trim(),
        kind: String(fd.get("kind")) as LostFoundKind,
        description: String(fd.get("description") ?? "").trim(),
        lastSeenLocation: String(fd.get("lastSeenLocation") ?? "").trim(),
        lastSeenDate: String(fd.get("lastSeenDate") ?? "").trim(),
        contact: String(fd.get("contact") ?? "").trim(),
      });
      navigate(`/lost-found/${created.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post the notice — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHero tone="teal" kicker="Lost & found" title="Post a notice" symbol="crab" lede="Lost something, found something, or searching for someone? Post it here — it goes live immediately, because time matters. When it's resolved, mark it reunited and let the town share the good news." />
      <Container size="wide" className="grid gap-10 py-12 lg:grid-cols-[1.6fr_1fr]">
        <div>
          {member ? (
            <form onSubmit={onSubmit} className="space-y-5 rounded-[var(--radius-card)] border border-sand bg-cream p-6 sm:p-8">
              <Field label="What kind of notice?">
                <select name="kind" required className={inputCls} defaultValue="">
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
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Last seen where" hint="A landmark, a street, a compound.">
                  <input name="lastSeenLocation" className={inputCls} placeholder="e.g. Kotokuraba Market, main gate" />
                </Field>
                <Field label="Last seen when">
                  <input name="lastSeenDate" type="date" className={inputCls} />
                </Field>
              </div>
              <Field label="Your contact" hint="A phone number people can reach you on — this is how you get it back.">
                <input name="contact" required className={inputCls} placeholder="e.g. 024 000 0000" />
              </Field>
              {error && <p className="rounded-lg bg-maroon-900/[0.06] px-4 py-2.5 text-sm text-maroon-900">{error}</p>}
              <button type="submit" disabled={busy} className="rounded-full bg-green px-6 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-green-900 disabled:opacity-60">
                {busy ? "Posting…" : "Post the notice"}
              </button>
            </form>
          ) : (
            <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-8 text-center">
              <h2 className="font-display text-2xl font-semibold text-ink">Sign in to post</h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-ink-muted">
                Notices are attributed to a verified member — that keeps the board trustworthy when it matters most. It takes a moment: sign in with your phone or email and you&apos;re in.
              </p>
              <div className="mt-6"><CTA to="/signin" variant="gold">Sign in / create account</CTA></div>
            </div>
          )}
        </div>
        <aside className="space-y-6">
          <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5">
            <h2 className="font-display text-lg font-semibold text-ink">How it works</h2>
            <ol className="mt-3 space-y-3 text-sm text-ink-muted">
              {[
                ["Posted", "Your notice goes live immediately — time matters."],
                ["Shared", "Neighbours see it, share it, keep an eye out."],
                ["Reunited", "Back where it belongs — mark it and give thanks."],
              ].map(([k, v], i) => (
                <li key={k} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green text-xs font-bold text-cream">{i + 1}</span><span><b className="text-ink">{k}.</b> {v}</span></li>
              ))}
            </ol>
          </div>
          <div className="rounded-[var(--radius-card)] border border-dashed border-sand p-5 text-sm text-ink-faint">
            Missing-person notices alert every curator immediately. If someone is in danger, call the Ghana Police (193) first — then post here so the whole town can help search.
          </div>
        </aside>
      </Container>
    </>
  );
}
