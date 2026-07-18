import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router-dom";
import { PageHero } from "@/components/page-hero";
import { Container, CTA as Cta } from "@/components/ui";
import { EmptyGlyph, EmptyState } from "@/components/empty-state";
import { ProfileSkeleton } from "@/components/skeleton";
import { EscrowChip, JobStatusChip, OutsideDisclaimer, ghs } from "@/components/outside";
import { api, getToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { completePayment } from "@/lib/paystack";
import { formatDate, tagLabel } from "@/lib/format";
import type { AgentJob, MyJobs } from "@/lib/types";
import { usePageTitle } from "@/lib/use-page-title";

// ── Oguaa Outside · my requests (jobs) ────────────────────────────────────────
// The member's escrowed errand jobs, split by role. As CLIENT you accept a
// quote and fund the escrow (Paystack), then release or dispute and review. As
// AGENT you quote requested jobs and mark them delivered. Escrow funding follows
// the spec exactly: POST /accept → if `simulated`, confirm immediately (no
// Paystack); else run Paystack Inline, then confirm on success. A ?job_ref= on
// load (the hosted-checkout return path) is confirmed here too.

// Loader reads the token directly so it works before the auth context resolves;
// the component still gates the UI on the resolved member.
export async function loader(): Promise<MyJobs> {
  if (!getToken()) return { asClient: [], asAgent: [] };
  return api.myJobs().catch(() => ({ asClient: [], asAgent: [] }));
}

const inputCls =
  "min-h-11 w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15";
const QUOTE_PATTERN = /^(?:\d+|\d+\.\d{1,2})$/;

/** A labelled money figure used inside job cards. */
function Money({ label, pesewas, strong = false }: Readonly<{ label: string; pesewas?: number; strong?: boolean }>) {
  return (
    <div>
      <dt className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">{label}</dt>
      <dd className={`mt-0.5 ${strong ? "text-base font-bold text-ink" : "text-sm font-semibold text-ink"}`}>{ghs(pesewas)}</dd>
    </div>
  );
}

/** Shell shared by both role cards: header, chips, meta, escrow ledger. */
function JobShell({ job, counterparty, children }: Readonly<{ job: AgentJob; counterparty: ReactNode; children?: ReactNode }>) {
  const funded = job.escrow.heldPesewas > 0 || ["funded", "delivered", "completed", "disputed", "refunded"].includes(job.status);
  return (
    <article className="relative overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
      <span className={`absolute inset-y-0 left-0 w-1 ${job.status === "disputed" ? "bg-maroon-900" : funded ? "bg-teal" : job.status === "quoted" ? "bg-gold-brand" : "bg-green"}`} aria-hidden />
      <div className="border-b border-sand p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="break-words text-lg font-semibold text-ink">{job.title}</h3>
            <p className="mt-1 text-sm text-ink-muted">{counterparty}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <JobStatusChip status={job.status} />
            {funded && <EscrowChip escrow={job.escrow} />}
          </div>
        </div>
        {job.description && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-muted">{job.description}</p>}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-faint">
          <span>Service: <b className="font-semibold text-ink-muted">{tagLabel(job.service)}</b></span>
          {job.deadline && <span>Needed by {formatDate(job.deadline)}</span>}
          <span>Requested {formatDate(job.createdAt)}</span>
        </div>
        {/* Money ledger: budget → quote → escrow split (held / fee / payout). */}
        <dl className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-3 rounded-[var(--radius-card)] border border-sand bg-paper p-3">
          <Money label="Budget" pesewas={job.budgetPesewas} />
          {job.quotePesewas > 0 && <Money label="Quote" pesewas={job.quotePesewas} strong />}
          {funded && <Money label="In escrow" pesewas={job.escrow.heldPesewas} />}
          {funded && <Money label="Agent payout" pesewas={job.escrow.payoutPesewas} />}
        </dl>
        {job.quoteNote && <p className="mt-2 text-xs italic text-ink-muted">Agent note: {job.quoteNote}</p>}
        {job.status === "disputed" && job.disputeReason && (
          <p className="mt-2 rounded-lg border border-maroon-900/20 bg-maroon-900/[0.05] p-2.5 text-xs text-maroon-text">Dispute: {job.disputeReason}</p>
        )}
      </div>
      {children && <div className="p-5">{children}</div>}
    </article>
  );
}

function ActionError({ msg }: Readonly<{ msg: string | null }>) {
  if (!msg) return null;
  return <p role="alert" className="mt-3 rounded-lg border border-clay/25 bg-clay/[0.06] p-2.5 text-sm text-clay-text">{msg}</p>;
}

const btnPrimary = "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-green px-4 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";
const btnGold = "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-gold-brand px-4 text-sm font-bold text-green-900 transition-colors hover:bg-gold disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";
const btnGhost = "inline-flex min-h-11 w-full items-center justify-center rounded-full border border-sand px-4 text-sm font-semibold text-ink-muted transition-colors hover:border-clay hover:text-clay-text disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

// ── Client-side card ──────────────────────────────────────────────────────────
function ClientJobCard({ job, memberEmail, onRefresh }: Readonly<{ job: AgentJob; memberEmail?: string; onRefresh: () => Promise<void> }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<null | "fund" | "dispute" | "review">(null);
  const [email, setEmail] = useState(memberEmail ?? "");
  const [reason, setReason] = useState("");
  const [rating, setRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); await onRefresh(); setMode(null); }
    catch (err) { setError(err instanceof Error ? err.message : "Something went wrong. Try again."); }
    finally { setBusy(false); }
  }

  // Fund the escrow — spec flow: simulated → confirm immediately; else Paystack.
  async function fund(e: FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!/.+@.+\..+/.test(addr)) { setError("Enter a valid email for your payment receipt."); return; }
    setBusy(true); setError(null);
    try {
      const res = await api.acceptJob(job.id, { email: addr });
      if (res.simulated) {
        await api.confirmJob(res.reference);
        await onRefresh();
        setMode(null);
      } else {
        await completePayment(res, {
          onSuccess: async () => { await api.confirmJob(res.reference); await onRefresh(); setMode(null); },
          onCancel: () => setError("Payment cancelled — the escrow was not funded."),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the payment.");
    } finally {
      setBusy(false);
    }
  }

  const counterparty = <>with <Link to={`/outside/agents/${job.agentSlug}`} className="font-semibold text-green-text hover:underline">{job.agentName}</Link></>;

  return (
    <JobShell job={job} counterparty={counterparty}>
      {/* Requested — waiting for the agent's quote. */}
      {job.status === "requested" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">Waiting for {job.agentName} to send a quote.</p>
          <button type="button" className={btnGhost} disabled={busy} onClick={() => run(() => api.cancelJob(job.id))}>Cancel request</button>
        </div>
      )}

      {/* Quoted — accept + fund the escrow. Disclaimer shown before funding. */}
      {job.status === "quoted" && (
        <div>
          <OutsideDisclaimer variant="compact" className="mb-4" />
          {mode === "fund" ? (
            <form onSubmit={fund} className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Email for your payment receipt</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputCls} placeholder="you@example.com" />
              </label>
              <p className="text-xs text-ink-faint">You&apos;ll fund <b className="text-ink">{ghs(job.quotePesewas)}</b> into escrow. It&apos;s released to the agent only when you mark the job complete.</p>
              <ActionError msg={error} />
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={btnGold} disabled={busy}>{busy ? "Starting payment…" : `Fund ${ghs(job.quotePesewas)}`}</button>
                <button type="button" className={btnGhost} disabled={busy} onClick={() => { setMode(null); setError(null); }}>Back</button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-muted">Quote received: <b className="text-ink">{ghs(job.quotePesewas)}</b>. Fund the escrow to start.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnGold} onClick={() => setMode("fund")}>Accept &amp; fund escrow</button>
                <button type="button" className={btnGhost} disabled={busy} onClick={() => run(() => api.cancelJob(job.id))}>Decline</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Funded — escrow held; waiting for delivery. Client may dispute. */}
      {job.status === "funded" && (
        <DisputeOrWait
          message="Escrow funded. Waiting for the agent to deliver."
          mode={mode} setMode={setMode} reason={reason} setReason={setReason}
          busy={busy} error={error} onDispute={() => run(() => api.disputeJob(job.id, { reason: reason.trim() }))}
          setError={setError}
        />
      )}

      {/* Delivered — release the escrow (complete) or dispute. */}
      {job.status === "delivered" && (
        <div>
          {mode === "dispute" ? (
            <DisputeForm reason={reason} setReason={setReason} busy={busy} error={error} onSubmit={() => run(() => api.disputeJob(job.id, { reason: reason.trim() }))} onCancel={() => { setMode(null); setError(null); }} />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-muted">The agent marked this delivered. Happy? Release the escrow.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnPrimary} disabled={busy} onClick={() => run(() => api.completeJob(job.id))}>Release escrow &amp; complete</button>
                <button type="button" className={btnGhost} disabled={busy} onClick={() => setMode("dispute")}>Raise dispute</button>
              </div>
            </div>
          )}
          <ActionError msg={mode !== "dispute" ? error : null} />
        </div>
      )}

      {/* Completed — leave a review once. */}
      {job.status === "completed" && (
        job.reviewed ? (
          <p className="text-sm text-green-text">Completed and reviewed. Medaase.</p>
        ) : mode === "review" ? (
          <form onSubmit={(e) => { e.preventDefault(); void run(() => api.reviewJob(job.id, { rating, body: reviewBody.trim() })); }} className="space-y-3">
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
              <span className="text-sm font-medium text-ink">Your rating</span>
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n === 1 ? "" : "s"}`} onClick={() => setRating(n)} className="grid h-11 w-11 place-items-center rounded-full transition-colors hover:bg-gold/[0.1]">
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill={n <= rating ? "var(--color-gold-brand)" : "transparent"} stroke="var(--color-gold-border)" strokeWidth="1.2" aria-hidden>
                      <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 21.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 2.5z" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
            <textarea aria-label="Review details (optional)" value={reviewBody} onChange={(e) => setReviewBody(e.target.value)} rows={3} maxLength={1200} className={inputCls} placeholder="How did it go? (optional)" />
            <ActionError msg={error} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={btnPrimary} disabled={busy}>{busy ? "Posting…" : "Post review"}</button>
              <button type="button" className={btnGhost} disabled={busy} onClick={() => { setMode(null); setError(null); }}>Later</button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">Job completed. Leave a review to help others.</p>
            <button type="button" className={btnPrimary} onClick={() => setMode("review")}>Write a review</button>
          </div>
        )
      )}

      {job.status === "disputed" && <p className="text-sm text-maroon-text">Under review. Oguaa will follow up on this dispute.</p>}
      {(job.status === "cancelled" || job.status === "refunded") && (
        <p className="text-sm text-ink-muted">{job.status === "refunded" ? "Refunded — the escrow was returned to you." : "This request was cancelled."}</p>
      )}
    </JobShell>
  );
}

/** Reusable dispute form. */
function DisputeForm({ reason, setReason, busy, error, onSubmit, onCancel }: Readonly<{ reason: string; setReason: (v: string) => void; busy: boolean; error: string | null; onSubmit: () => void; onCancel: () => void }>) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (reason.trim().length >= 5) onSubmit(); }} className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">What went wrong?</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} required minLength={5} className={inputCls} placeholder="Explain the problem — the escrow stays frozen while it's reviewed." />
      </label>
      <ActionError msg={error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={btnGhost + " !border-maroon-900/30 !text-maroon-text"} disabled={busy || reason.trim().length < 5}>{busy ? "Submitting…" : "Submit dispute"}</button>
        <button type="button" className={btnGhost} disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/** "Waiting" state that can expand into a dispute form (used while funded). */
function DisputeOrWait({ message, mode, setMode, reason, setReason, busy, error, onDispute, setError }: Readonly<{ message: string; mode: null | "fund" | "dispute" | "review"; setMode: (m: null | "fund" | "dispute" | "review") => void; reason: string; setReason: (v: string) => void; busy: boolean; error: string | null; onDispute: () => void; setError: (v: string | null) => void }>) {
  if (mode === "dispute") {
    return <DisputeForm reason={reason} setReason={setReason} busy={busy} error={error} onSubmit={onDispute} onCancel={() => { setMode(null); setError(null); }} />;
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink-muted">{message}</p>
      <button type="button" className={btnGhost} disabled={busy} onClick={() => setMode("dispute")}>Raise dispute</button>
    </div>
  );
}

// ── Agent-side card ───────────────────────────────────────────────────────────
function AgentJobCard({ job, onRefresh }: Readonly<{ job: AgentJob; onRefresh: () => Promise<void> }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); await onRefresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Something went wrong. Try again."); }
    finally { setBusy(false); }
  }

  async function submitQuote(e: FormEvent) {
    e.preventDefault();
    const normalized = amount.trim();
    if (!QUOTE_PATTERN.test(normalized)) { setError("Enter a quote in cedis (up to two decimals)."); return; }
    const cedisNum = Number(normalized);
    if (!Number.isFinite(cedisNum) || cedisNum < 1) { setError("Enter a quote of at least GH₵ 1."); return; }
    setBusy(true); setError(null);
    try {
      await api.quoteJob(job.id, { amountPesewas: Math.round(cedisNum * 100), note: note.trim() });
      await onRefresh();
      setQuoting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the quote.");
    } finally {
      setBusy(false);
    }
  }

  const counterparty = <>from <b className="font-semibold text-ink">{job.clientName}</b></>;

  return (
    <JobShell job={job} counterparty={counterparty}>
      {job.status === "requested" && (
        quoting ? (
          <form onSubmit={submitQuote} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Your quote (GH₵)</span>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm font-semibold text-green-text" aria-hidden>GH₵</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" required className={`${inputCls} pl-14`} placeholder={String((job.budgetPesewas / 100) || 100)} />
              </div>
            </label>
            <textarea aria-label="Quote note (optional)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={600} className={inputCls} placeholder="Note to the client (optional) — what's included, timing…" />
            <ActionError msg={error} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={btnPrimary} disabled={busy}>{busy ? "Sending…" : "Send quote"}</button>
              <button type="button" className={btnGhost} disabled={busy} onClick={() => { setQuoting(false); setError(null); }}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">New request. Client&apos;s budget: <b className="text-ink">{ghs(job.budgetPesewas)}</b>.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} onClick={() => setQuoting(true)}>Send a quote</button>
              <button type="button" className={btnGhost} disabled={busy} onClick={() => run(() => api.cancelJob(job.id))}>Decline</button>
            </div>
          </div>
        )
      )}
      {job.status === "quoted" && <p className="text-sm text-ink-muted">Quote sent ({ghs(job.quotePesewas)}). Waiting for the client to fund the escrow.</p>}
      {job.status === "funded" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">Escrow funded. Run the errand, then mark it delivered.</p>
          <button type="button" className={btnPrimary} disabled={busy} onClick={() => run(() => api.deliverJob(job.id))}>Mark delivered</button>
        </div>
      )}
      {job.status === "delivered" && <p className="text-sm text-ink-muted">Delivered. Waiting for the client to release the escrow.</p>}
      {job.status === "completed" && <p className="text-sm text-green-text">Completed. Payout: <b>{ghs(job.escrow.payoutPesewas)}</b>{job.escrow.simulated ? " (simulated)" : ""}.</p>}
      {job.status === "disputed" && <p className="text-sm text-maroon-text">Disputed — under review. The escrow is frozen until it&apos;s resolved.</p>}
      {(job.status === "cancelled" || job.status === "refunded") && <p className="text-sm text-ink-muted">{job.status === "refunded" ? "Refunded to the client." : "This request was cancelled."}</p>}
      <ActionError msg={!quoting ? error : null} />
    </JobShell>
  );
}

export function Component() {
  usePageTitle("My requests · Oguaa Outside");
  const initial = useLoaderData() as MyJobs;
  const { member, loading } = useAuth();
  const [jobs, setJobs] = useState<MyJobs>(initial);
  const [tab, setTab] = useState<"client" | "agent">(
    initial.asClient?.length ? "client" : initial.asAgent?.length ? "agent" : "client",
  );
  const [params, setParams] = useSearchParams();
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState<AgentJob | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const confirmedRef = useRef(false);

  const refresh = useMemo(() => async () => {
    try { setJobs(await api.myJobs()); } catch { /* keep the last good view */ }
  }, []);

  // Confirm a hosted-checkout return (?job_ref=) exactly once on load.
  useEffect(() => {
    const ref = params.get("job_ref");
    if (!ref || confirmedRef.current) return;
    confirmedRef.current = true;
    setConfirming(true);
    api.confirmJob(ref)
      .then((job) => { setConfirmed(job); setParams({}, { replace: true }); return refresh(); })
      .catch(() => setConfirmError("We couldn't confirm that payment. If you were charged, it will reconcile shortly."))
      .finally(() => setConfirming(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <Container size="wide" className="py-12"><ProfileSkeleton /></Container>;
  }

  if (!member) {
    return (
      <>
        <PageHero tone="gold" sectionId="outside" kicker="Oguaa Outside" title="My requests" symbol="nkyinkyim" lede="Track your errands, fund escrow, and manage the jobs you run as an agent." />
        <Container size="narrow" className="py-16">
          <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-8 text-center">
            <h2 className="text-2xl font-semibold text-ink">Sign in to see your requests</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-ink-muted">Your escrow-backed errands — as a client and as an agent — live behind your account.</p>
            <div className="mt-6"><Cta to="/signin" variant="gold">Sign in / create account</Cta></div>
          </div>
        </Container>
      </>
    );
  }

  const clientJobs = jobs.asClient ?? [];
  const agentJobs = jobs.asAgent ?? [];
  const showTabs = agentJobs.length > 0;
  const active = showTabs ? tab : "client";
  const activeJobs = active === "client" ? clientJobs : agentJobs;
  const inEscrow = activeJobs
    .filter((job) => ["funded", "delivered", "disputed"].includes(job.status))
    .reduce((sum, job) => sum + (job.escrow.heldPesewas || 0), 0);

  return (
    <>
      <PageHero tone="gold" sectionId="outside" kicker="Oguaa Outside" title="My requests" symbol="nkyinkyim" lede="Your escrow-backed errands. Accept a quote, fund the escrow, and release it when you're satisfied — or raise a dispute.">
        <div className="flex flex-wrap gap-3">
          <Cta to="/outside" variant="gold">Find an agent</Cta>
          <Cta to="/outside/become-an-agent" variant="outline" className="!border-green-text/35 !text-green-text hover:!border-green-text">Agent dashboard</Cta>
        </div>
      </PageHero>

      <Container size="wide" className="py-10 sm:py-12">
        {/* Payment confirmation banners for the ?job_ref= return path. */}
        {confirming && (
          <div className="mb-6 flex items-center gap-3 rounded-[var(--radius-card)] border border-gold-border/30 bg-gold/[0.1] px-4 py-3 text-sm text-gold-text" role="status">
            <span className="h-2 w-2 rounded-full bg-gold-brand motion-safe:animate-pulse" aria-hidden /> Confirming your payment…
          </div>
        )}
        {confirmed && (
          <div className="mb-6 rounded-[var(--radius-card)] border border-green/30 bg-green/[0.06] p-4 text-sm text-green-text" role="status">
            Escrow funded for <b>{confirmed.title}</b> ({ghs(confirmed.escrow.heldPesewas || confirmed.quotePesewas)}).{confirmed.escrow.simulated ? " Simulated — dev mode, no real money moved." : ""}
          </div>
        )}
        {confirmError && <div className="mb-6 rounded-[var(--radius-card)] border border-clay/25 bg-clay/[0.06] p-4 text-sm text-clay-text" role="alert">{confirmError}</div>}

        <OutsideDisclaimer />

        {/* Role tabs — only when the member also has agent-side jobs. */}
        {showTabs && (
          <div className="mt-7 flex w-full rounded-full border border-sand bg-cream p-1 sm:w-fit" role="group" aria-label="Request role">
            {(["client", "agent"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-pressed={active === t}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors sm:flex-none ${active === t ? "bg-green text-on-green" : "text-ink-muted hover:text-ink"}`}
              >
                {t === "client" ? `As client (${clientJobs.length})` : `As agent (${agentJobs.length})`}
              </button>
            ))}
          </div>
        )}

        {activeJobs.length > 0 && (
          <dl className="mt-6 grid grid-cols-3 overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
            <RequestSummary
              label="Open"
              value={activeJobs.filter((job) => !["completed", "cancelled", "refunded"].includes(job.status)).length.toLocaleString("en-GH")}
            />
            <RequestSummary
              label="In escrow"
              value={ghs(inEscrow)}
            />
            <RequestSummary
              label="Completed"
              value={activeJobs.filter((job) => job.status === "completed").length.toLocaleString("en-GH")}
              last
            />
          </dl>
        )}

        <div className="mt-6 sm:mt-8">
          {active === "client" ? (
            clientJobs.length > 0 ? (
              <div className="space-y-5">
                {clientJobs.map((job) => <ClientJobCard key={job.id} job={job} onRefresh={refresh} />)}
              </div>
            ) : (
              <EmptyState
                icon={<EmptyGlyph name="inbox" />}
                title="No requests yet"
                description="Find a vetted agent and send your first errand request."
                actions={<Link to="/outside" className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green">Browse agents →</Link>}
              />
            )
          ) : (
            <div className="space-y-5">
              {agentJobs.map((job) => <AgentJobCard key={job.id} job={job} onRefresh={refresh} />)}
            </div>
          )}
        </div>
      </Container>
    </>
  );
}

function RequestSummary({ label, value, last = false }: Readonly<{ label: string; value: string; last?: boolean }>) {
  return (
    <div className={`min-w-0 px-3 py-4 text-center sm:px-5 ${last ? "" : "border-r border-sand"}`}>
      <dt className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-ink-faint">{label}</dt>
      <dd className="mt-1 truncate text-base font-semibold text-ink sm:text-xl" title={value}>{value}</dd>
    </div>
  );
}
