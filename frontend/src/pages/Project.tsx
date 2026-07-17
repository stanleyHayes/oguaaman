import { useEffect, useRef, useState } from "react";
import { useLoaderData, useNavigate, useRevalidator, useSearchParams, type LoaderFunctionArgs } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing, Pledge } from "@/lib/types";
import { api } from "@/lib/api";
import { completePayment } from "@/lib/paystack";
import { useRecordView } from "@/lib/use-record-view";
import { useAuth } from "@/lib/auth";
import { Container, Pill } from "@/components/ui";
import { DetailHero } from "@/components/detail-hero";
import { ReportButton } from "@/components/report-button";
import { ProgressBar, cedis } from "./Projects";

export async function loader({ params }: LoaderFunctionArgs) {
  return api.project(params.slug!);
}

const QUICK_AMOUNTS = [20, 50, 100, 500]; // GHS

export function Component() {
  const project = useLoaderData() as Listing;
  usePageTitle(project.title);
  useRecordView(project.id);
  const { member } = useAuth();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [params, setParams] = useSearchParams();
  const d = project.details;

  const [amount, setAmount] = useState("50");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Confirmation state when the payer returns from Paystack (?pledge_ref=…).
  const [confirmed, setConfirmed] = useState<Pledge | null>(null);
  const [confirming, setConfirming] = useState(false);
  const confirmedRef = useRef(false);

  useEffect(() => {
    const ref = params.get("pledge_ref");
    if (!ref || confirmedRef.current) return;
    confirmedRef.current = true; // confirm once, even across re-renders
    setConfirming(true);
    api.confirmPledge(ref)
      .then((p) => {
        setConfirmed(p);
        setParams({}, { replace: true });
        revalidator.revalidate(); // re-run the loader so the raised total updates in place
      })
      .catch(() => setError("We couldn't confirm that payment. If you were charged, it will reconcile shortly."))
      .finally(() => setConfirming(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startPledge() {
    setError(null);
    const cedisNum = Number.parseFloat(amount);
    if (!Number.isFinite(cedisNum) || cedisNum < 1) { setError("Enter an amount of at least GH₵ 1."); return; }
    if (!member) { navigate("/signin", { state: { from: `/projects/${project.slug}` } }); return; }
    setBusy(true);
    try {
      const r = await api.pledge(project.slug, { amountPesewas: Math.round(cedisNum * 100) });
      // In-app Paystack modal; on success we confirm + update in place (no
      // navigation). Simulated/blocked → completePayment redirects instead.
      await completePayment(r, {
        onSuccess: async () => {
          setConfirming(true);
          try {
            setConfirmed(await api.confirmPledge(r.reference));
            revalidator.revalidate(); // refresh the raised total in place
          } catch {
            setError("We couldn't confirm that payment. If you were charged, it will reconcile shortly.");
          } finally {
            setConfirming(false);
          }
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the payment.");
    } finally {
      setBusy(false);
    }
  }

  const goalReached = d.goalPesewas ? Math.min(100, Math.round(((d.raisedPesewas ?? 0) / d.goalPesewas) * 100)) : 0;

  let pledgeLabel = "Sign in to pledge";
  if (busy) pledgeLabel = "Starting payment…";
  else if (member) pledgeLabel = "Pledge with Paystack";

  return (
    <>
      <DetailHero
        tone="green"
        backTo="/projects"
        backLabel="All projects"
        coverImageUrl={project.coverImageUrl}
        title={project.title}
        meta={
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {d.organiser && <span>{d.organiser}</span>}
            <span className="font-semibold text-gold">
              {cedis(d.raisedPesewas ?? 0)} raised{d.goalPesewas ? ` of ${cedis(d.goalPesewas)}` : ""}
              {d.goalPesewas ? ` · ${goalReached}%` : ""}
            </span>
            <span className="text-cream/70">{d.backers ?? 0} backers{d.deadline ? ` · closes ${d.deadline}` : ""}</span>
          </div>
        }
      >
        <span className="rounded-full border border-cream/25 bg-cream/10 px-3 py-1 text-xs font-medium text-cream backdrop-blur-sm">Adopt a project</span>
      </DetailHero>

      <Container size="wide" className="grid gap-10 py-12 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <p className="font-serif text-lg leading-relaxed text-ink first-letter:float-left first-letter:mr-2 first-letter:text-5xl first-letter:font-semibold first-letter:leading-[0.85] first-letter:text-green-text">{d.description}</p>
          {project.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">{project.tags.map((t) => <Pill key={t}>#{t}</Pill>)}</div>
          )}
          <div className="relative mt-8 overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream p-5 text-sm text-ink-muted shadow-[var(--shadow-card)]">
            <span className="absolute inset-y-0 left-0 w-1 bg-gold-brand" aria-hidden />
            <p className="font-semibold text-ink">Where the money goes</p>
            <p className="mt-1.5">Funds are held for the named institution and released against receipts, which are published to backers. Oguaa takes nothing.</p>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-6 shadow-[var(--shadow-card)] lg:sticky lg:top-20">
            <p className="eyebrow text-gold-text">Fund this project</p>
            <div className="mt-3"><ProgressBar raised={d.raisedPesewas} goal={d.goalPesewas} /></div>
            <p className="mt-2 text-xs text-ink-faint">{d.backers ?? 0} backers{d.deadline ? ` · closes ${d.deadline}` : ""}</p>

            {confirming && <p className="mt-5 text-sm text-ink-muted">Confirming your payment…</p>}

            {confirmed ? (
              <div className="mt-5 rounded-lg border border-green/30 bg-green/[0.06] p-4">
                <p className="text-lg font-semibold text-green-text">Medaase! 🎉</p>
                <p className="mt-1 text-sm text-ink-muted">
                  Your pledge of <b>{cedis(confirmed.amountPesewas)}</b> to {confirmed.projectTitle} is confirmed.
                  {confirmed.simulated && <span className="mt-1 block text-xs text-gold-text">Simulated — dev mode, no real money moved.</span>}
                </p>
              </div>
            ) : (
              <div className="mt-5">
                <p className="text-sm font-medium text-ink">Pledge an amount (GH₵)</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {QUICK_AMOUNTS.map((a) => (
                    <button key={a} type="button" onClick={() => setAmount(String(a))} aria-pressed={amount === String(a)} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${amount === String(a) ? "border-green bg-green text-on-green" : "border-sand bg-paper text-ink-muted hover:border-green/40"}`}>
                      {a}
                    </button>
                  ))}
                </div>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  className="mt-3 w-full rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-ink focus:border-green focus:outline-none"
                  placeholder="Amount in GH₵"
                />
                {error && <p className="mt-2 text-sm text-clay-text">{error}</p>}
                <button type="button" onClick={startPledge} disabled={busy} className="mt-4 w-full rounded-full bg-green py-3 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:opacity-60">
                  {pledgeLabel}
                </button>
                <p className="mt-2 text-center text-xs text-ink-faint">Mobile money &amp; cards via Paystack. You&rsquo;ll get a receipt by email.</p>
              </div>
            )}
          </div>

          <div className="flex justify-end"><ReportButton listingId={project.id} /></div>
        </aside>
      </Container>
    </>
  );
}
