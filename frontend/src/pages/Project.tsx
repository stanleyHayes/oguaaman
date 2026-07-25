import { useEffect, useRef, useState } from "react";
import { Link, useLoaderData, useNavigate, useRevalidator, useSearchParams, type LoaderFunctionArgs } from "react-router-dom";
import { Adinkra } from "@/components/adinkra";
import { Thumb } from "@/components/cards";
import { Breadcrumbs, HeroIcon, HeroWatermark } from "@/components/hero-chrome";
import { ReportButton } from "@/components/report-button";
import { Skeleton, SkeletonText } from "@/components/skeleton";
import { Container, Pill } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, initials, tagLabel } from "@/lib/format";
import { completePayment } from "@/lib/paystack";
import type { Listing, Pledge } from "@/lib/types";
import { usePageTitle } from "@/lib/use-page-title";
import { useRecordView } from "@/lib/use-record-view";
import { ProgressBar, cedis } from "./Projects";

export async function loader({ params }: LoaderFunctionArgs) {
  return api.project(params.slug!);
}

const QUICK_AMOUNTS = [20, 50, 100, 500];
const MAX_PLEDGE_CEDIS = 100_000;
const PLEDGE_AMOUNT_PATTERN = /^(?:\d+|\d+\.\d{1,2})$/;

export function HydrateFallback() {
  return (
    <div className="bg-paper">
      <div className="bg-green-900 py-14 sm:py-18">
        <Container size="wide" className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div>
            <Skeleton className="h-4 w-36 bg-cream/15" />
            <Skeleton className="mt-8 h-14 w-full max-w-3xl bg-cream/15" />
            <Skeleton className="mt-3 h-14 w-3/5 max-w-xl bg-cream/15" />
            <SkeletonText lines={3} className="mt-7 max-w-xl opacity-30" />
          </div>
          <Skeleton className="aspect-[4/3] w-full bg-cream/15" />
        </Container>
      </div>
      <Container size="wide" className="grid gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <SkeletonText lines={9} />
        <Skeleton className="h-[34rem] w-full" />
      </Container>
    </div>
  );
}

export function Component() {
  const project = useLoaderData() as Listing;
  usePageTitle(project.title);
  useRecordView(project.id);
  const { member } = useAuth();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [params, setParams] = useSearchParams();
  const details = project.details;

  const [amount, setAmount] = useState("50");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Pledge | null>(null);
  const [confirming, setConfirming] = useState(false);
  const confirmedRef = useRef(false);

  useEffect(() => {
    const ref = params.get("pledge_ref");
    if (!ref || confirmedRef.current) return;
    confirmedRef.current = true;
    setConfirming(true);
    api.confirmPledge(ref)
      .then((pledge) => {
        setConfirmed(pledge);
        setParams({}, { replace: true });
        revalidator.revalidate();
      })
      .catch(() => setError("We couldn't confirm that payment. If you were charged, it will reconcile shortly."))
      .finally(() => setConfirming(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startPledge() {
    setError(null);
    const normalizedAmount = amount.trim();
    if (!PLEDGE_AMOUNT_PATTERN.test(normalizedAmount)) {
      setError("Enter a valid cedi amount with no more than two decimal places.");
      return;
    }
    const cedisNum = Number(normalizedAmount);
    if (!Number.isFinite(cedisNum) || cedisNum < 1 || cedisNum > MAX_PLEDGE_CEDIS) {
      setError("Enter an amount between GH₵ 1 and GH₵ 100,000.");
      return;
    }
    if (!member) {
      navigate("/signin", { state: { from: `/projects/${project.slug}` } });
      return;
    }
    setBusy(true);
    try {
      const response = await api.pledge(project.slug, { amountPesewas: Math.round(cedisNum * 100) });
      await completePayment(response, {
        onSuccess: async () => {
          setConfirming(true);
          try {
            setConfirmed(await api.confirmPledge(response.reference));
            revalidator.revalidate();
          } catch {
            setError("We couldn't confirm that payment. If you were charged, it will reconcile shortly.");
          } finally {
            setConfirming(false);
          }
        },
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start the payment.");
    } finally {
      setBusy(false);
    }
  }

  let pledgeLabel = "Sign in to pledge";
  if (confirming) pledgeLabel = "Confirming payment…";
  else if (busy) pledgeLabel = "Starting payment…";
  else if (member) pledgeLabel = "Pledge with Paystack";

  return (
    <>
      <ProjectHero project={project} />

      <Container size="wide" className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-12">
        <div className="min-w-0">
          <section aria-labelledby="project-story">
            <p className="eyebrow text-green-text">Why it matters</p>
            <h2 id="project-story" className="mt-3 max-w-3xl text-4xl font-semibold text-ink sm:text-5xl">{details.campaign ? "What your support makes possible." : "What this project will change."}</h2>
            {details.description ? (
              <p className="mt-7 max-w-3xl text-lg leading-8 text-ink-muted sm:text-xl sm:leading-9">{details.description}</p>
            ) : (
              <p className="mt-7 text-ink-muted">The organising institution is preparing the full project brief.</p>
            )}

            {project.tags.length > 0 && (
              <div className="mt-7 flex flex-wrap gap-2">
                {project.tags.map((tag) => <Pill key={tag} tone="green">#{tagLabel(tag)}</Pill>)}
              </div>
            )}
          </section>

          <section className="mt-12 border-y border-sand" aria-labelledby="funding-trail">
            <div className="grid divide-y divide-sand sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <FundingStep number="01" title="Pledge" copy="Choose any amount from GH₵ 1 and complete payment through Paystack." />
              <FundingStep number="02" title="Verify" copy="Oguaa confirms the payment server-side before moving the public total." />
              <FundingStep number="03" title="Account" copy="The confirmed pledge updates the public campaign total." />
            </div>
          </section>

          <section className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]" aria-labelledby="campaign-record">
            <div>
              <p className="eyebrow text-gold-text">Public record</p>
              <h2 id="campaign-record" className="mt-3 text-3xl font-semibold text-ink">A campaign built for accountability.</h2>
              <p className="mt-4 max-w-2xl leading-relaxed text-ink-muted">
                The named institution owns the work. Oguaa verifies each pledge and keeps the public campaign total current as support arrives.
              </p>
            </div>
            <dl className="divide-y divide-sand border-y border-sand text-sm">
              {details.organiser && <RecordRow label="Organiser" value={details.organiser} />}
              <RecordRow label="Backers" value={String(details.backers ?? 0)} />
              {details.deadline && <RecordRow label="Funding closes" value={formatDate(details.deadline)} />}
              {project.publishedAt && <RecordRow label="Published" value={formatDate(project.publishedAt)} />}
              {project.townId && <RecordRow label="Community" value={tagLabel(project.townId)} />}
            </dl>
          </section>

          <section className="on-dark on-dark-pin relative mt-12 overflow-hidden rounded-[var(--radius-card)] bg-green-900 p-6 text-cream sm:p-8">
            <Adinkra name="funtunfunefu" size={120} labelled={false} className="pointer-events-none absolute -bottom-8 -right-5 text-cream/[0.04]" />
            <div className="relative max-w-2xl">
              <p className="eyebrow text-gold">Where the money goes</p>
              <h2 className="mt-3 text-2xl font-semibold text-cream">Into the named project, against a visible record.</h2>
              <p className="mt-3 text-sm leading-relaxed text-cream/70">Each pledge is verified server-side. The configured platform fee supports Oguaa, and the net amount is credited to the named project.</p>
            </div>
          </section>
        </div>

        <aside className="self-start lg:sticky lg:top-24">
          <PledgePanel
            project={project}
            amount={amount}
            busy={busy}
            error={error}
            confirming={confirming}
            confirmed={confirmed}
            signedIn={Boolean(member)}
            pledgeLabel={pledgeLabel}
            onAmountChange={setAmount}
            onSubmit={startPledge}
          />

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 px-1">
            <Link to={details.campaign ? "/campaigns" : "/projects"} className="text-sm font-semibold text-green-text hover:underline">
              <span aria-hidden>←</span> {details.campaign ? "All campaigns" : "All projects"}
            </Link>
            <ReportButton listingId={project.id} />
          </div>
        </aside>
      </Container>
    </>
  );
}

function ProjectHero({ project }: Readonly<{ project: Listing }>) {
  const details = project.details;
  const isCreatorCampaign = Boolean(details.campaign);
  const backTo = isCreatorCampaign ? "/campaigns" : "/projects";
  const backLabel = isCreatorCampaign ? "Fundraising campaigns" : "Community projects";

  return (
    <header className="on-dark on-dark-pin relative isolate overflow-hidden bg-green-900 text-cream">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(199,162,74,0.2),transparent_34%),linear-gradient(135deg,#0C2C1F_0%,#123F2D_58%,#071A12_100%)]" aria-hidden />
      <div className="bg-dotgrid absolute inset-0 opacity-25" aria-hidden />
      <HeroWatermark sectionId="community" onDark />

      <Container size="wide" className="relative py-10 sm:py-14 lg:py-16">
        <Breadcrumbs crumbs={[{ label: "Home", to: "/" }, { label: backLabel, to: backTo }, { label: project.title }]} onDark />

        <div className="mt-8 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_27rem] lg:gap-16">
          <div className="min-w-0">
            <HeroIcon sectionId="community" onDark />
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-gold/45 bg-gold/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.15em] text-gold">
                {isCreatorCampaign ? "Creator campaign" : "Community project"}
              </span>
              {project.featured && <span className="rounded-full border border-cream/20 bg-cream/10 px-3 py-1 text-xs font-semibold text-cream/80">Community focus</span>}
            </div>
            <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-[0.95] text-cream sm:text-6xl lg:text-7xl">{project.title}</h1>
            <p className="mt-5 text-base font-medium text-gold sm:text-lg">{details.organiser ? `Led by ${details.organiser}` : "A public Oguaa funding record"}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#support-project" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gold-brand px-6 text-base font-bold text-green-900 transition-colors hover:bg-gold">
                Support this {isCreatorCampaign ? "campaign" : "project"} <span aria-hidden>→</span>
              </a>
              <a href="#project-story" className="inline-flex min-h-12 items-center justify-center rounded-full border border-cream/25 bg-cream/[0.07] px-5 text-sm font-semibold text-cream transition-colors hover:border-gold hover:text-gold">See the plan</a>
            </div>
          </div>

          <figure className="relative mx-auto w-full max-w-md lg:mx-0">
            <div className="absolute -inset-3 rotate-2 rounded-[1.75rem] border border-gold/30 bg-gold/[0.08]" aria-hidden />
            <div className="relative overflow-hidden rounded-[1.5rem] border border-cream/20 bg-green-900 p-2 shadow-2xl shadow-black/25">
              <Thumb seed={project.slug} label={initials(project.title)} src={project.coverImageUrl} rounded="rounded-[1.1rem]" className="aspect-[4/3] min-h-[280px] w-full" coverWidth={900} />
            </div>
            <figcaption className="absolute bottom-5 left-5 rounded-full border border-cream/20 bg-green-900/80 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.15em] text-cream backdrop-blur-sm">Verified public campaign</figcaption>
          </figure>
        </div>

        <div className="mt-10 overflow-hidden rounded-[var(--radius-card)] border border-cream/15 bg-cream/[0.07] backdrop-blur-sm">
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Funding progress</p>
              <div className="mt-3"><ProgressBar raised={details.raisedPesewas} goal={details.goalPesewas} onDark /></div>
            </div>
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-cream/10 bg-cream/10">
              <HeroFact label="Backers" value={String(details.backers ?? 0)} />
              <HeroFact label="Target" value={details.goalPesewas ? cedis(details.goalPesewas) : "Finalising"} />
              <HeroFact label="Closes" value={details.deadline ? formatDate(details.deadline) : "Open"} />
            </dl>
          </div>
        </div>
      </Container>
    </header>
  );
}

function HeroFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="bg-green-900/55 px-3 py-4 text-center">
      <dt className="text-[0.58rem] font-semibold uppercase tracking-[0.13em] text-cream/50">{label}</dt>
      <dd className="mt-1 text-xs font-semibold text-cream sm:text-sm">{value}</dd>
    </div>
  );
}

function FundingStep({ number, title, copy }: Readonly<{ number: string; title: string; copy: string }>) {
  return (
    <div className="py-6 first:pt-0 last:pb-0 sm:px-6 sm:py-7 sm:first:pl-0 sm:first:pt-7 sm:last:pr-0 sm:last:pb-7">
      <span className="text-xs font-bold text-gold-text">{number}</span>
      <h3 className="mt-2 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{copy}</p>
    </div>
  );
}

function RecordRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="py-3.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="mt-1 leading-relaxed text-ink">{value}</dd>
    </div>
  );
}

interface PledgePanelProps {
  readonly project: Listing;
  readonly amount: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly confirming: boolean;
  readonly confirmed: Pledge | null;
  readonly signedIn: boolean;
  readonly pledgeLabel: string;
  readonly onAmountChange: (amount: string) => void;
  readonly onSubmit: () => Promise<void>;
}

function PledgePanel({ project, amount, busy, error, confirming, confirmed, signedIn, pledgeLabel, onAmountChange, onSubmit }: PledgePanelProps) {
  const details = project.details;
  return (
    <section id="support-project" aria-labelledby="pledge-heading" className="scroll-mt-24 overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-lift)]">
      <div className="on-dark on-dark-pin bg-green px-6 py-5 text-cream">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-gold">Make it happen</p>
        <h2 id="pledge-heading" className="mt-1 text-2xl font-semibold text-cream">Support this {details.campaign ? "campaign" : "project"}</h2>
      </div>

      <div className="p-5 sm:p-6">
        <ProgressBar raised={details.raisedPesewas} goal={details.goalPesewas} />
        <p className="mt-3 text-xs text-ink-faint">{details.backers ?? 0} backers{details.deadline ? ` · closes ${formatDate(details.deadline)}` : ""}</p>

        {confirming && (
          <div className="mt-5 flex items-center gap-3 rounded-lg bg-gold/[0.1] px-4 py-3 text-sm text-gold-text" role="status">
            <span className="h-2 w-2 animate-pulse rounded-full bg-gold-brand" aria-hidden />
            Confirming your payment…
          </div>
        )}

        {confirmed ? (
          <div className="mt-5 rounded-[var(--radius-card)] border border-green/30 bg-green/[0.06] p-5 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-green text-xl text-on-green" aria-hidden>✓</span>
            <p className="mt-3 text-lg font-semibold text-green-text">Medaase. Your pledge is confirmed.</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Your pledge of <b>{cedis(confirmed.amountPesewas)}</b> to {confirmed.projectTitle} is confirmed.
              {confirmed.simulated && <span className="mt-1 block text-xs text-gold-text">Simulated — dev mode, no real money moved.</span>}
            </p>
          </div>
        ) : (
          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmit();
            }}
          >
            <fieldset>
              <legend className="text-sm font-semibold text-ink">Choose an amount</legend>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {QUICK_AMOUNTS.map((quickAmount) => (
                  <button
                    key={quickAmount}
                    type="button"
                    onClick={() => onAmountChange(String(quickAmount))}
                    aria-pressed={amount === String(quickAmount)}
                    className={`rounded-full border px-2 py-2 text-xs font-semibold transition-colors ${amount === String(quickAmount) ? "border-green bg-green text-on-green" : "border-sand bg-paper text-ink-muted hover:border-green/40"}`}
                  >
                    GH₵ {quickAmount}
                  </button>
                ))}
              </div>
            </fieldset>

            <label htmlFor="pledge-amount" className="mt-5 block text-xs font-semibold uppercase tracking-wide text-ink-faint">Or enter another amount (GH₵)</label>
            <div className="relative mt-2">
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-semibold text-green-text" aria-hidden>GH₵</span>
              <input
                id="pledge-amount"
                value={amount}
                onChange={(event) => onAmountChange(event.target.value)}
                inputMode="decimal"
                pattern="[0-9]+([.][0-9]{1,2})?"
                maxLength={9}
                autoComplete="off"
                aria-describedby={error ? "pledge-error" : "pledge-help"}
                className="w-full rounded-[var(--radius-card)] border border-sand bg-paper py-3 pl-14 pr-4 text-lg font-semibold text-ink focus:border-green focus:outline-none focus:ring-2 focus:ring-green/15"
                placeholder="50"
              />
            </div>
            {error && <p id="pledge-error" role="alert" className="mt-2 rounded-lg border border-clay/25 bg-clay/[0.06] p-3 text-sm text-clay-text">{error}</p>}

            <button type="submit" disabled={busy || confirming} className="mt-4 min-h-12 w-full rounded-[var(--radius-card)] bg-green px-5 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-60">
              {pledgeLabel}
            </button>
            <p id="pledge-help" className="mt-3 text-center text-xs leading-relaxed text-ink-faint">
              {signedIn ? "Mobile money and cards via Paystack. A receipt arrives by email." : "Sign in first, then pay securely with mobile money or card."}
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
