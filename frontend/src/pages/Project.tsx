import { useEffect, useRef, useState } from "react";
import { Link, useLoaderData, useNavigate, useRevalidator, useSearchParams, type LoaderFunctionArgs } from "react-router-dom";
import type { Listing, Pledge } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Container, Pill } from "@/components/ui";
import { Thumb } from "@/components/cards";
import { ReportButton } from "@/components/report-button";
import { initials } from "@/lib/format";
import { ProgressBar, cedis } from "./Projects";

export async function loader({ params }: LoaderFunctionArgs) {
  return api.project(params.slug!);
}

const QUICK_AMOUNTS = [20, 50, 100, 500]; // GHS

export function Component() {
  const project = useLoaderData() as Listing;
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
    const cedisNum = parseFloat(amount);
    if (!Number.isFinite(cedisNum) || cedisNum < 1) { setError("Enter an amount of at least GH₵ 1."); return; }
    if (!member) { navigate("/signin", { state: { from: `/projects/${project.slug}` } }); return; }
    setBusy(true);
    try {
      const r = await api.pledge(project.slug, { amountPesewas: Math.round(cedisNum * 100) });
      window.location.assign(r.authorizationUrl); // off to Paystack (or straight back, in dev simulation)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the payment.");
      setBusy(false);
    }
  }

  return (
    <>
      <Container size="wide" className="py-10">
        <Link to="/projects" className="text-sm text-teal-text hover:underline">← All projects</Link>
      </Container>
      <Container size="wide" className="grid gap-10 pb-12 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <Pill tone="green">Adopt a project</Pill>
          <h1 className="mt-3 font-display text-4xl font-semibold text-ink sm:text-5xl">{project.title}</h1>
          {d.organiser && <p className="mt-2 text-sm font-medium text-gold-text">{d.organiser}</p>}
          <Thumb seed={project.slug} src={project.coverImageUrl} label={initials(project.title)} className="mt-6 aspect-[16/7] w-full" />
          <p className="mt-6 font-serif text-lg leading-relaxed text-ink">{d.description}</p>
          {project.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">{project.tags.map((t) => <Pill key={t}>#{t}</Pill>)}</div>
          )}
          <div className="mt-8 rounded-[var(--radius-card)] border border-sand bg-cream p-5 text-sm text-ink-muted">
            <p className="font-semibold text-ink">Where the money goes</p>
            <p className="mt-1.5">Funds are held for the named institution and released against receipts, which are published to backers. Oguaa takes nothing.</p>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-6">
            <ProgressBar raised={d.raisedPesewas} goal={d.goalPesewas} />
            <p className="mt-2 text-xs text-ink-faint">{d.backers ?? 0} backers{d.deadline ? ` · closes ${d.deadline}` : ""}</p>

            {confirming && <p className="mt-5 text-sm text-ink-muted">Confirming your payment…</p>}

            {confirmed ? (
              <div className="mt-5 rounded-lg border border-green/30 bg-green/[0.06] p-4">
                <p className="font-display text-lg font-semibold text-green">Medaase! 🎉</p>
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
                    <button key={a} type="button" onClick={() => setAmount(String(a))} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${amount === String(a) ? "border-green bg-green text-cream" : "border-sand bg-paper text-ink-muted hover:border-green/40"}`}>
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
                <button type="button" onClick={startPledge} disabled={busy} className="mt-4 w-full rounded-full bg-green py-3 text-sm font-semibold text-cream transition-colors hover:bg-green-900 disabled:opacity-60">
                  {busy ? "Starting payment…" : member ? "Pledge with Paystack" : "Sign in to pledge"}
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
