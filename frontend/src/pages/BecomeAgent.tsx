import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLoaderData, useNavigate } from "react-router-dom";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta } from "@/components/ui";
import { ProfileSkeleton } from "@/components/skeleton";
import { ImageUpload } from "@/components/image-upload";
import { OutsideChoiceMenu, OutsideDisclaimer, ghs, serviceLabeller } from "@/components/outside";
import { api, getToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import type { Agent, AgentInput, AgentService, AgentStatus, AgentType } from "@/lib/types";
import { usePageTitle } from "@/lib/use-page-title";

// ── Oguaa Outside · become an agent (apply / edit) ────────────────────────────
// Members apply to join the vetted-agent directory; if they already have a
// profile the page shows its vetting status and an edit form instead. The
// government-ID upload reuses the app's ImageUpload (POST /api/uploads), whose
// returned URL rides along as idDocUrl.

interface BecomeAgentData {
  agent: Agent | null;
  services: AgentService[];
}

export async function loader(): Promise<BecomeAgentData> {
  const services = await api.agentServices().catch(() => [] as AgentService[]);
  if (!getToken()) return { agent: null, services };
  // 404 (no profile yet) or unauth → treat as "no profile"; the form applies.
  const agent = await api.myAgent().catch(() => null);
  return { agent, services };
}

const inputCls =
  "min-h-11 w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";
const PAYOUT_METHODS = ["MTN Mobile Money", "Telecel Cash", "AirtelTigo Money", "Bank transfer"];
const PAYOUT_OPTIONS = PAYOUT_METHODS.map((method) => ({
  value: method,
  label: method,
  description: method === "Bank transfer" ? "Release to your bank account" : "Release to your mobile wallet",
}));

function Field({ label, children, hint, required }: Readonly<{ label: string; children: ReactNode; hint?: string; required?: boolean }>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">
        {label}{required && <><span className="ml-0.5 text-clay-text" aria-hidden>*</span><span className="sr-only"> (required)</span></>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

const STATUS_META: Record<AgentStatus, { label: string; cls: string; note: string }> = {
  pending: { label: "Pending review", cls: "border-gold-border/40 bg-gold/[0.12] text-gold-text", note: "Your application is with the Oguaa team. We check identity, guarantor and bond before you go live." },
  verified: { label: "Verified", cls: "border-green/40 bg-green/[0.1] text-green-text", note: "You're live in the directory. Clients can find you and send requests." },
  suspended: { label: "Suspended", cls: "border-clay/30 bg-clay/[0.08] text-clay-text", note: "Your profile is temporarily hidden. Contact the Oguaa team to resolve it." },
  rejected: { label: "Not approved", cls: "border-maroon-900/30 bg-maroon-900/[0.07] text-maroon-text", note: "This application wasn't approved. You can update your details and resubmit." },
};

export function Component() {
  usePageTitle("Become an agent · Oguaa Outside");
  const { agent: loaded, services } = useLoaderData() as BecomeAgentData;
  const { member, loading } = useAuth();
  const navigate = useNavigate();
  const labelFor = serviceLabeller(services);

  const [agent, setAgent] = useState<Agent | null>(loaded);
  const [type, setType] = useState<AgentType>(loaded?.type ?? "individual");
  const [picked, setPicked] = useState<Set<string>>(new Set(loaded?.services ?? []));
  const [idDocUrl, setIdDocUrl] = useState(loaded?.idDocUrl ?? "");
  const [payoutMethod, setPayoutMethod] = useState(loaded?.payoutMethod ?? PAYOUT_METHODS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const editing = Boolean(agent);

  function toggleService(slug: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    const fd = new FormData(e.currentTarget);
    const s = (k: string) => String(fd.get(k) ?? "").trim();

    const coverageAreas = [...new Set(s("coverageAreas").split(",").map((a) => a.trim()).filter(Boolean))];
    const servicesList = [...picked];

    // Validation — clear, field-level messages.
    if (!s("displayName")) { setError("Add the name clients will see."); return; }
    if (servicesList.length === 0) { setError("Choose at least one service you offer."); return; }
    if (coverageAreas.length === 0) { setError("List at least one area you cover (comma-separated)."); return; }
    if (!idDocUrl) { setError("Upload a government-issued ID for verification."); return; }
    if (!s("guarantorName") || !s("guarantorPhone")) { setError("A guarantor's name and phone are required."); return; }
    if (!s("payoutDetail")) { setError("Add your payout details (MoMo number or bank account)."); return; }

    const input: AgentInput = {
      type,
      displayName: s("displayName"),
      headline: s("headline"),
      bio: s("bio"),
      services: servicesList,
      coverageAreas,
      rates: s("rates"),
      idDocUrl,
      guarantor: {
        name: s("guarantorName"),
        phone: s("guarantorPhone"),
        relation: s("guarantorRelation"),
        note: s("guarantorNote"),
      },
      payoutMethod,
      payoutDetail: s("payoutDetail"),
    };

    setBusy(true);
    try {
      const result = editing ? await api.updateAgent(input) : await api.applyAgent(input);
      // updateAgent may return the agent or a bare ack; fall back to a re-fetch.
      const fresh = (result && (result as Agent).id) ? (result as Agent) : await api.myAgent().catch(() => agent);
      setAgent(fresh ?? null);
      setSaved(editing ? "Profile updated." : "Application submitted — we'll review it and get back to you.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // ── Gates ────────────────────────────────────────────────────────────────
  if (loading) {
    return <Container size="wide" className="py-12"><ProfileSkeleton /></Container>;
  }
  if (!member) {
    return (
      <>
        <PageHero tone="gold" sectionId="outside" kicker="Oguaa Outside" title="Become an agent" symbol="nkyinkyim" lede="Run errands and business for Cape Coast people abroad — vetted, reviewed, and backed by managed escrow." />
        <Container size="narrow" className="py-16">
          <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-8 text-center">
            <h2 className="text-2xl font-semibold text-ink">Sign in to apply</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-ink-muted">Agents are verified members. Sign in with your phone or email to put yourself forward.</p>
            <div className="mt-6"><Cta to="/signin" variant="gold">Sign in / create account</Cta></div>
          </div>
        </Container>
      </>
    );
  }

  const statusMeta = agent ? STATUS_META[agent.status] : null;

  return (
    <>
      <PageHero
        tone="gold"
        sectionId="outside"
        kicker="Oguaa Outside"
        title={editing ? "Your agent profile" : "Become an agent"}
        symbol="nkyinkyim"
        lede={editing
          ? "Manage your listing, keep your services current, and track your vetting status."
          : "Join the directory of vetted agents who handle procurement, shipping, inspection and errands for Cape Coast people elsewhere."}
      >
        <Cta to="/outside" variant="outline" className="!border-green-text/35 !text-green-text hover:!border-green-text">Back to directory</Cta>
      </PageHero>

      <Container size="wide" className="grid gap-9 py-10 sm:py-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
        <div className="min-w-0">
          {/* Existing profile → status banner. */}
          {agent && statusMeta && (
            <div className="mb-8 rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${statusMeta.cls}`}>{statusMeta.label}</span>
                  {agent.status === "verified" && agent.verifiedAt && (
                    <span className="text-xs text-ink-faint">Verified {formatDate(agent.verifiedAt)}{agent.verifiedByName ? ` by ${agent.verifiedByName}` : ""}</span>
                  )}
                </div>
                {agent.status === "verified" && (
                  <Link to={`/outside/agents/${agent.slug}`} className="text-sm font-semibold text-green-text hover:underline">View public profile →</Link>
                )}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">{statusMeta.note}</p>
              {agent.status === "rejected" && agent.rejectionReason && (
                <p className="mt-2 rounded-lg border border-maroon-900/20 bg-maroon-900/[0.05] p-2.5 text-sm text-maroon-text">Reason: {agent.rejectionReason}</p>
              )}
              <dl className="mt-4 grid grid-cols-3 overflow-hidden rounded-xl border border-sand bg-paper">
                <div className="border-r border-sand px-3 py-3">
                  <dt className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Bond</dt>
                  <dd className="mt-1 truncate text-sm font-semibold text-ink" title={`${ghs(agent.bond.amountPesewas)} · ${agent.bond.status || "pending"}`}>{ghs(agent.bond.amountPesewas)}</dd>
                </div>
                <div className="border-r border-sand px-3 py-3">
                  <dt className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Reputation</dt>
                  <dd className="mt-1 truncate text-sm font-semibold text-ink">{agent.ratingAvg.toFixed(1)}★ <span className="font-normal text-ink-faint">({agent.ratingCount})</span></dd>
                </div>
                <div className="px-3 py-3">
                  <dt className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Jobs done</dt>
                  <dd className="mt-1 text-sm font-semibold text-ink">{agent.jobsCompleted}</dd>
                </div>
              </dl>
            </div>
          )}

          {saved && (
            <div className="mb-6 rounded-[var(--radius-card)] border border-green/30 bg-green/[0.06] p-4 text-sm text-green-text" role="status">
              {saved}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-6">
            {/* Identity */}
            <fieldset className="space-y-4 rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)] sm:p-6">
              <legend className="px-1 text-sm font-bold uppercase tracking-wide text-ink-faint"><span className="mr-2 text-gold-text">01</span>Who you are</legend>
              <div>
                <span className="mb-1.5 block text-sm font-medium text-ink">Agent type <span className="text-clay-text" aria-hidden>*</span><span className="sr-only"> (required)</span></span>
                <div className="flex flex-wrap gap-2">
                  {(["individual", "office"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setType(t)} aria-pressed={type === t} className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold capitalize transition-colors ${type === t ? "border-green bg-green text-on-green" : "border-sand bg-paper text-ink-muted hover:border-green/40"}`}>
                      {t === "individual" ? "Individual" : "Registered office"}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Display name" required hint="The name clients see in the directory.">
                <input name="displayName" required defaultValue={agent?.displayName ?? member.displayName} maxLength={120} className={inputCls} />
              </Field>
              <Field label="Headline" hint="One line — what you do best. e.g. “Accra procurement & courier, 6 years”.">
                <input name="headline" defaultValue={agent?.headline ?? ""} maxLength={160} className={inputCls} placeholder="Short summary of your service" />
              </Field>
              <Field label="About you" hint="Experience, how you work, guarantees you offer.">
                <textarea name="bio" defaultValue={agent?.bio ?? ""} rows={4} className={inputCls} placeholder="Tell clients why they can trust you…" />
              </Field>
            </fieldset>

            {/* Services & coverage */}
            <fieldset className="space-y-4 rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)] sm:p-6">
              <legend className="px-1 text-sm font-bold uppercase tracking-wide text-ink-faint"><span className="mr-2 text-gold-text">02</span>What you offer</legend>
              <div>
                <span className="mb-1.5 block text-sm font-medium text-ink">Services <span className="text-clay-text" aria-hidden>*</span><span className="sr-only"> (required)</span></span>
                {services.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {services.map((svc) => {
                      const on = picked.has(svc.slug);
                      return (
                        <button key={svc.slug} type="button" onClick={() => toggleService(svc.slug)} aria-pressed={on} className={`min-h-11 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${on ? "border-green bg-green text-on-green" : "border-sand bg-paper text-ink-muted hover:border-green/40"}`}>
                          {svc.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-lg border border-gold-border/30 bg-gold/[0.08] p-3 text-sm text-gold-text" role="status">
                    {picked.size > 0
                      ? "The service catalogue is temporarily unavailable. Your existing choices will be preserved if you save."
                      : "The service catalogue is unavailable right now. Please reload or try again before submitting."}
                  </p>
                )}
                {picked.size > 0 && <p className="mt-2 text-xs text-ink-faint">Selected: {[...picked].map(labelFor).join(", ")}</p>}
              </div>
              <Field label="Coverage areas" required hint="Where you operate — comma-separated. e.g. Accra, Kumasi, Guangzhou, China.">
                <input name="coverageAreas" required defaultValue={agent?.coverageAreas.join(", ") ?? ""} className={inputCls} placeholder="Accra, Tema, China…" />
              </Field>
              <Field label="Rates & fees" hint="How you charge — a flat fee, a percentage, or per errand.">
                <textarea name="rates" defaultValue={agent?.rates ?? ""} rows={2} className={inputCls} placeholder="e.g. 10% of order value, minimum GH₵ 50" />
              </Field>
            </fieldset>

            {/* Verification */}
            <fieldset className="space-y-4 rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)] sm:p-6">
              <legend className="px-1 text-sm font-bold uppercase tracking-wide text-ink-faint"><span className="mr-2 text-gold-text">03</span>Verification</legend>
              <ImageUpload
                value={idDocUrl}
                onChange={setIdDocUrl}
                label="Government-issued ID *"
                hint="Ghana Card, passport or driver's licence. Held privately for vetting — never shown publicly."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Guarantor name" required>
                  <input name="guarantorName" required defaultValue={agent?.guarantor?.name ?? ""} className={inputCls} placeholder="Someone who vouches for you" />
                </Field>
                <Field label="Guarantor phone" required>
                  <input name="guarantorPhone" type="tel" autoComplete="tel" required defaultValue={agent?.guarantor?.phone ?? ""} className={inputCls} placeholder="e.g. 024 000 0000" />
                </Field>
                <Field label="Relationship" hint="How they know you.">
                  <input name="guarantorRelation" defaultValue={agent?.guarantor?.relation ?? ""} className={inputCls} placeholder="e.g. Employer, elder, colleague" />
                </Field>
                <Field label="Guarantor note" hint="Optional context for the vetting team.">
                  <input name="guarantorNote" defaultValue={agent?.guarantor?.note ?? ""} className={inputCls} placeholder="Anything else we should know" />
                </Field>
              </div>
            </fieldset>

            {/* Payout */}
            <fieldset className="space-y-4 rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)] sm:p-6">
              <legend className="px-1 text-sm font-bold uppercase tracking-wide text-ink-faint"><span className="mr-2 text-gold-text">04</span>Getting paid</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="mb-1.5 block text-sm font-medium text-ink">Payout method <span className="text-clay-text" aria-hidden>*</span><span className="sr-only"> (required)</span></span>
                  <OutsideChoiceMenu label="Payout method" value={payoutMethod} options={PAYOUT_OPTIONS} onChange={setPayoutMethod} />
                </div>
                <Field label="Payout details" required hint="MoMo number or bank account — where escrow releases land.">
                  <input name="payoutDetail" required defaultValue={agent?.payoutDetail ?? ""} className={inputCls} placeholder="e.g. 024 000 0000" />
                </Field>
              </div>
            </fieldset>

            {error && <p role="alert" className="rounded-lg border border-clay/25 bg-clay/[0.06] p-3 text-sm text-clay-text">{error}</p>}

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={busy || (services.length === 0 && picked.size === 0)} className="min-h-12 rounded-full bg-green px-6 py-3 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-60">
                {busy ? "Saving…" : editing ? "Save changes" : "Submit application"}
              </button>
              {editing && <button type="button" onClick={() => navigate("/outside/jobs")} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-green-text hover:bg-green/[0.06] hover:underline">Go to my jobs →</button>}
            </div>
          </form>
        </div>

        {/* Sidebar — vetting + bond explainer + disclaimer. */}
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <div className="on-dark on-dark-pin rounded-[var(--radius-card)] border border-green bg-green-900 p-5 shadow-[var(--shadow-lift)]">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-gold">Trust, step by step</p>
            <h2 className="mt-2 text-xl font-semibold text-cream">How vetting works</h2>
            <ol className="mt-4 space-y-3 text-sm text-cream/72">
              {[
                ["Apply", "Submit your details, ID and a guarantor."],
                ["Vetting", "Oguaa checks identity and the guarantor."],
                ["Bond", "Post a refundable good-faith bond."],
                ["Go live", "Verified agents appear in the directory."],
              ].map(([k, v], i) => (
                <li key={k} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold-brand text-xs font-bold text-green-900">{i + 1}</span>
                  <span><b className="text-cream">{k}.</b> {v}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-[var(--radius-card)] border border-gold-border/30 bg-gold/[0.08] p-5">
            <h3 className="text-sm font-bold text-gold-text">The refundable bond</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Agents post a good-faith bond that Oguaa holds. It's fully refundable when you leave in good standing, and it's what lets clients trust the directory. It can be drawn on to settle a proven dispute.
            </p>
          </div>
          <OutsideDisclaimer variant="compact" />
        </aside>
      </Container>
    </>
  );
}
