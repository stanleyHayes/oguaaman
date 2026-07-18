import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLoaderData, useNavigate, type LoaderFunctionArgs } from "react-router-dom";
import { Adinkra } from "@/components/adinkra";
import { DatePicker } from "@/components/date-picker";
import { Breadcrumbs } from "@/components/hero-chrome";
import { Skeleton, SkeletonText } from "@/components/skeleton";
import { Container, VerifiedBadge } from "@/components/ui";
import { AgentTypeBadge, OutsideChoiceMenu, OutsideDisclaimer, Stars, serviceLabeller } from "@/components/outside";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import type { Agent, AgentReview, AgentService, JobInput } from "@/lib/types";
import { usePageTitle } from "@/lib/use-page-title";

// ── Oguaa Outside · agent detail + request form ───────────────────────────────
// Public profile of one vetted agent (reputation, services, coverage, reviews)
// plus a "Request this agent" form that creates a job and sends the client to
// /outside/jobs to negotiate a quote and fund the escrow.

interface AgentDetailData {
  agent: Agent;
  reviews: AgentReview[];
  services: AgentService[];
}

export async function loader({ params }: LoaderFunctionArgs): Promise<AgentDetailData> {
  const slug = params.slug!;
  const [agent, reviews, services] = await Promise.all([
    api.agent(slug),
    api.agentReviews(slug).catch(() => [] as AgentReview[]),
    api.agentServices().catch(() => [] as AgentService[]),
  ]);
  return { agent, reviews, services };
}

const inputCls =
  "min-h-11 w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";
const BUDGET_PATTERN = /^(?:\d+|\d+\.\d{1,2})$/;
const MAX_BUDGET_CEDIS = 500_000;

export function HydrateFallback() {
  return (
    <div className="bg-paper">
      <div className="bg-green-900 py-14">
        <Container size="wide">
          <Skeleton className="h-4 w-40 bg-cream/15" />
          <Skeleton className="mt-6 h-12 w-80 max-w-full bg-cream/15" />
          <SkeletonText lines={2} className="mt-5 max-w-lg opacity-30" />
        </Container>
      </div>
      <Container size="wide" className="grid gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <SkeletonText lines={8} />
        <Skeleton className="h-[26rem] w-full" />
      </Container>
    </div>
  );
}

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
  const { agent, reviews, services } = useLoaderData() as AgentDetailData;
  usePageTitle(agent.displayName);
  const { member } = useAuth();
  const navigate = useNavigate();
  const labelFor = serviceLabeller(services);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [service, setService] = useState(agent.services[0] ?? "");
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");

  const verified = agent.status === "verified";
  const serviceOptions = agent.services.map((slug) => ({ value: slug, label: labelFor(slug) }));

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    // Not signed in → send to sign-in and come back to this agent.
    if (!member) {
      navigate("/signin", { state: { from: `/outside/agents/${agent.slug}` } });
      return;
    }
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim();
    if (!service) { setError("Choose the service you need."); return; }
    if (title.length < 3) { setError("Give your request a short, clear title."); return; }
    if (description.length < 10) { setError("Describe the errand so the agent can quote accurately."); return; }
    const normalized = budget.trim();
    if (!BUDGET_PATTERN.test(normalized)) { setError("Enter a budget in cedis (up to two decimals)."); return; }
    const cedisNum = Number(normalized);
    if (!Number.isFinite(cedisNum) || cedisNum < 1 || cedisNum > MAX_BUDGET_CEDIS) {
      setError("Enter a budget between GH₵ 1 and GH₵ 500,000.");
      return;
    }
    const input: JobInput = {
      service,
      title,
      description,
      budgetPesewas: Math.round(cedisNum * 100),
      deadline: deadline || undefined,
    };
    setBusy(true);
    try {
      await api.createJob(agent.slug, input);
      // The job now lives on the jobs page, where the agent quotes and the
      // client funds the escrow.
      navigate("/outside/jobs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the request. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Hero — identity, type, reputation. */}
      <header className="on-dark on-dark-pin relative isolate overflow-hidden bg-green-900 text-cream">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(176,125,50,0.2),transparent_32%),linear-gradient(135deg,#0C2C1F_0%,#123F2D_58%,#081C14_100%)]" aria-hidden />
        <div className="bg-dotgrid absolute inset-0 opacity-25" aria-hidden />
        <Adinkra name="nkyinkyim" size={220} labelled={false} className="pointer-events-none absolute -right-8 top-6 hidden text-gold/[0.08] sm:block" />
        <Container size="wide" className="relative py-9 sm:py-12">
          <Breadcrumbs
            onDark
            crumbs={[
              { label: "Home", to: "/" },
              { label: "Oguaa Outside", to: "/outside" },
              { label: agent.displayName },
            ]}
          />
          <div className="mt-7 grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-4xl font-semibold text-cream sm:text-5xl">{agent.displayName}</h1>
                {verified && <VerifiedBadge onDark label="Verified" verifiedAs="Oguaa Outside agent" />}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <AgentTypeBadge type={agent.type} onDark />
                {agent.ratingCount > 0
                  ? <span className="rounded-full border border-cream/20 bg-cream/[0.06] px-2.5 py-1"><Stars value={agent.ratingAvg} count={agent.ratingCount} onDark /></span>
                  : <span className="text-sm text-cream/60">No reviews yet</span>}
                <span className="text-sm text-cream/70">{agent.jobsCompleted} {agent.jobsCompleted === 1 ? "job completed" : "jobs completed"}</span>
              </div>
              {agent.headline && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-cream/85">{agent.headline}</p>}
            </div>
            <dl className="grid grid-cols-3 overflow-hidden rounded-[var(--radius-card)] border border-cream/15 bg-cream/[0.06] backdrop-blur-sm">
              <div className="border-r border-cream/12 px-3 py-4 text-center">
                <dt className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-cream/55">Jobs</dt>
                <dd className="mt-1 text-xl font-semibold text-cream">{agent.jobsCompleted}</dd>
              </div>
              <div className="border-r border-cream/12 px-3 py-4 text-center">
                <dt className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-cream/55">Services</dt>
                <dd className="mt-1 text-xl font-semibold text-cream">{agent.services.length}</dd>
              </div>
              <div className="px-3 py-4 text-center">
                <dt className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-cream/55">Areas</dt>
                <dd className="mt-1 text-xl font-semibold text-cream">{agent.coverageAreas.length}</dd>
              </div>
            </dl>
          </div>
          {verified && (agent.verifiedAt || agent.verifiedByName) && (
            <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/[0.1] px-3.5 py-1.5 text-xs font-semibold text-gold">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
              Verified{agent.verifiedByName ? ` by ${agent.verifiedByName}` : ""}{agent.verifiedAt ? ` · checked ${formatDate(agent.verifiedAt)}` : ""}
            </p>
          )}
        </Container>
      </header>

      <Container size="wide" className="grid gap-9 py-10 sm:py-12 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-10">
        {/* Left column — profile, services, coverage, reviews. */}
        <div className="min-w-0">
          <OutsideDisclaimer />

          {agent.bio && (
            <section className="mt-8" aria-labelledby="agent-about">
              <p className="eyebrow text-green-text">About</p>
              <h2 id="agent-about" className="mt-2 text-2xl font-semibold text-ink">Who you&apos;re engaging</h2>
              <p className="mt-4 max-w-2xl whitespace-pre-line leading-relaxed text-ink-muted">{agent.bio}</p>
            </section>
          )}

          <section className="mt-8 grid overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream sm:grid-cols-2" aria-labelledby="agent-offer">
            <div className="p-5 sm:p-6">
              <h2 id="agent-offer" className="text-sm font-bold uppercase tracking-wide text-ink-faint">Services offered</h2>
              {agent.services.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {agent.services.map((s) => (
                    <li key={s} className="rounded-full border border-green/25 bg-green/[0.06] px-3 py-1 text-sm font-medium text-green-text">{labelFor(s)}</li>
                  ))}
                </ul>
              ) : <p className="mt-3 text-sm text-ink-faint">Not specified.</p>}
            </div>
            <div className="border-t border-sand p-5 sm:border-l sm:border-t-0 sm:p-6">
              <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Coverage areas</h2>
              {agent.coverageAreas.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {agent.coverageAreas.map((a) => (
                    <li key={a} className="rounded-full border border-teal/25 bg-teal/[0.08] px-3 py-1 text-sm font-medium text-teal-text">{a}</li>
                  ))}
                </ul>
              ) : <p className="mt-3 text-sm text-ink-faint">Not specified.</p>}
            </div>
          </section>

          {agent.rates && (
            <section className="mt-6 rounded-[var(--radius-card)] border border-sand bg-cream p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Rates &amp; fees</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-muted">{agent.rates}</p>
            </section>
          )}

          <section className="mt-8" aria-labelledby="agent-reviews">
            <div className="flex items-center justify-between gap-4">
              <h2 id="agent-reviews" className="text-2xl font-semibold text-ink">Reviews</h2>
              {agent.ratingCount > 0 && <Stars value={agent.ratingAvg} count={agent.ratingCount} />}
            </div>
            {reviews.length > 0 ? (
              <ul className="mt-5 space-y-4">
                {reviews.map((r) => (
                  <li key={r.id} className="rounded-[var(--radius-card)] border border-sand bg-cream p-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-ink">{r.clientName ?? "A client"}</span>
                      <Stars value={r.rating} />
                    </div>
                    {r.body && <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">{r.body}</p>}
                    <p className="mt-2 text-xs text-ink-faint">{formatDate(r.createdAt)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-[var(--radius-card)] border border-dashed border-sand bg-paper p-6 text-sm text-ink-faint">
                No reviews yet. Reviews appear here after a client completes a job with this agent.
              </p>
            )}
          </section>
        </div>

        {/* Right column — the request form. */}
        <aside className="self-start lg:sticky lg:top-24">
          <section aria-labelledby="request-heading" className="rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-lift)]">
            <div className="on-dark on-dark-pin rounded-t-[var(--radius-card)] bg-green px-6 py-5 text-cream">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-gold">Start an errand</p>
              <h2 id="request-heading" className="mt-1 text-2xl font-semibold text-cream">Request this agent</h2>
            </div>
            <div className="p-5 sm:p-6">
              {agent.status !== "verified" && (
                <p className="mb-4 rounded-lg border border-clay/25 bg-clay/[0.06] p-3 text-xs leading-relaxed text-clay-text">
                  This agent is not currently verified. Take extra care before engaging.
                </p>
              )}
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <span className="mb-1.5 block text-sm font-medium text-ink">Service you need</span>
                  <OutsideChoiceMenu
                    label="Service you need"
                    value={service}
                    options={serviceOptions.length > 0 ? serviceOptions : [{ value: "", label: "No service listed" }]}
                    onChange={setService}
                  />
                </div>
                <Field label="Title" hint="e.g. “Buy & ship 2 phones from Accra”.">
                  <input name="title" required minLength={3} maxLength={160} className={inputCls} placeholder="What do you need done?" />
                </Field>
                <Field label="Details" hint="Be specific — quantities, links, addresses, timing.">
                  <textarea name="description" required rows={4} minLength={10} maxLength={2000} className={inputCls} placeholder="Describe the errand…" />
                </Field>
                <Field label="Your budget (GH₵)" hint="A guide for the agent — they'll reply with a firm quote.">
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm font-semibold text-green-text" aria-hidden>GH₵</span>
                    <input
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      inputMode="decimal"
                      pattern="[0-9]+([.][0-9]{1,2})?"
                      maxLength={10}
                      autoComplete="off"
                      required
                      className={`${inputCls} pl-14`}
                      placeholder="500"
                    />
                  </div>
                </Field>
                <Field label="Needed by (optional)">
                  <DatePicker name="deadline" value={deadline} onChange={setDeadline} min={new Date().toISOString().slice(0, 10)} className="w-full" placeholder="Pick a deadline" />
                </Field>

                {error && <p role="alert" className="rounded-lg border border-clay/25 bg-clay/[0.06] p-3 text-sm text-clay-text">{error}</p>}

                <button type="submit" disabled={busy || serviceOptions.length === 0} className="min-h-12 w-full rounded-[var(--radius-card)] bg-green px-5 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-60">
                  {busy ? "Sending request…" : serviceOptions.length === 0 ? "No services available" : member ? "Send request" : "Sign in to request"}
                </button>
                <p className="text-center text-xs leading-relaxed text-ink-faint">
                  No money moves yet. You fund the escrow only after the agent quotes, on the requests page.
                </p>
              </form>
            </div>
          </section>

          <div className="mt-4"><OutsideDisclaimer variant="compact" /></div>
          <div className="mt-4 px-1">
            <Link to="/outside" className="text-sm font-semibold text-green-text hover:underline"><span aria-hidden>←</span> All agents</Link>
          </div>
        </aside>
      </Container>
    </>
  );
}
