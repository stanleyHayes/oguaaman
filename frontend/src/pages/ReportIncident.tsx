import { useState, type ReactNode, type SubmitEvent} from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Incident, IncidentCategory, IncidentSeverity } from "@/lib/types";
import { api } from "@/lib/api";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { INCIDENT_CATEGORIES, INCIDENT_SEVERITIES } from "@/lib/incidents";
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
  // A crime or medical report (or one the content screen holds) waits for a
  // curator instead of going live (D3).
  const [held, setHeld] = useState<Incident | null>(null);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const s = (k: string) => { const v = fd.get(k); return typeof v === "string" ? v : ""; };
    try {
      const created = await api.reportIncident({
        title: s("title").trim(),
        category: s("category") as IncidentCategory,
        severity: s("severity") as IncidentSeverity,
        location: s("location").trim(),
        contact: s("contact").trim(),
        description: s("description").trim(),
      });
      if (created.held || created.status === "pending") setHeld(created);
      else navigate(`/safety/${created.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit the incident — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHero tone="maroon" kicker="Safety" title="Report an incident" symbol="dwennimmen" lede="Floods, fires, accidents, hazards — tell your neighbours what is happening. Most reports go live straight away and a curator verifies them afterwards; crime and medical reports are checked by a curator before anyone else sees them." />
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
                Reports about crime or medical emergencies, and reports our safety checks flag, are reviewed by an Oguaa curator before they are
                published, to protect the people involved. You&rsquo;ll get a notification when it is reviewed. Remember: this has not alerted the
                police, fire service or ambulance. In an emergency, call 112.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to={`/safety/${held.slug}`} className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green hover:bg-green-900">View your report</Link>
                <Link to="/safety" className="rounded-full border border-sand px-5 py-2.5 text-sm font-semibold text-ink-muted hover:text-ink">Back to Safety</Link>
              </div>
            </div>
          ) : member ? (
            <form onSubmit={onSubmit} className="space-y-5 rounded-[var(--radius-card)] border border-sand bg-cream p-6 sm:p-8">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Category">
                  <select name="category" required className={inputCls} defaultValue="">
                    <option value="" disabled>Choose…</option>
                    {INCIDENT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </Field>
                <Field label="Severity" hint="Critical and high alert every curator immediately.">
                  <select name="severity" required className={inputCls} defaultValue="">
                    <option value="" disabled>Choose…</option>
                    {INCIDENT_SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Title" hint="Short and clear — e.g. “Flooding around Fosu Lagoon”.">
                <input name="title" required minLength={2} maxLength={160} className={inputCls} placeholder="What is happening?" />
              </Field>
              <Field label="Location" hint="Required and shown publicly. Give a landmark or a street, not a house number.">
                <input name="location" required className={inputCls} placeholder="e.g. Kotokuraba Market, near the main gate" />
              </Field>
              <Field label="What happened (optional)" hint="Shown publicly once the report is live. Don't name people, or include phone numbers or other private details.">
                <textarea name="description" rows={5} className={inputCls} placeholder="Describe the incident, the danger, who is affected…" />
              </Field>
              <Field label="Your phone number (optional)" hint="Seen only by you and Oguaa's safety curators, so they can check the report with you. It is never shown on the public page and is not passed to the emergency services.">
                <input name="contact" type="tel" autoComplete="tel" className={inputCls} placeholder="e.g. 024 000 0000" />
              </Field>
              {error && <p className="rounded-lg bg-maroon-900/[0.06] px-4 py-2.5 text-sm text-maroon-text">{error}</p>}
              <button type="submit" disabled={busy} className="rounded-full bg-green px-6 py-2.5 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-60">
                {busy ? "Submitting…" : "Report the incident"}
              </button>
            </form>
          ) : (
            <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-8 text-center">
              <h2 className="text-2xl font-semibold text-ink">Sign in to report</h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-ink-muted">
                Incidents are attributed to a verified member — that keeps the safety feed trustworthy when it matters most. It takes a moment: sign in with your phone or email and you&apos;re in.
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
                ["Reported", "Most reports go live straight away. Crime and medical reports wait for a curator."],
                ["Verified", "A curator confirms it on the ground."],
                ["Responding", "Responders and neighbours are on it."],
                ["Resolved", "The danger has passed."],
                ["Recovered", "The community is back on its feet."],
              ].map(([k, v], i) => (
                <li key={k} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green text-xs font-bold text-on-green">{i + 1}</span><span><b className="text-ink">{k}.</b> {v}</span></li>
              ))}
            </ol>
          </div>
          <div className="rounded-[var(--radius-card)] border border-dashed border-sand p-5 text-sm text-ink-faint">
            This page alerts the community, not the emergency services. In a life-threatening emergency, call 112 first.
          </div>
        </aside>
      </Container>
    </>
  );
}
