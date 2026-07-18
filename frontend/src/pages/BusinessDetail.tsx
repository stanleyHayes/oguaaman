import { useEffect, useRef, useState } from "react";
import { Link, useLoaderData, useNavigate, useRevalidator, useSearchParams, type LoaderFunctionArgs } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing, Plan, Subscription } from "@/lib/types";
import { api } from "@/lib/api";
import { completePayment } from "@/lib/paystack";
import { useRecordView } from "@/lib/use-record-view";
import { useAuth } from "@/lib/auth";
import { Container, Pill, SampleNote } from "@/components/ui";
import { LocationMap } from "@/components/location-map";
import { ReportButton } from "@/components/report-button";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { cldCover } from "@/lib/cloudinary";
import { SAMPLE_NOTICE } from "@/lib/content";
import { formatDate } from "@/lib/format";

export async function loader({ params }: LoaderFunctionArgs) {
  const [business, plans] = await Promise.all([
    api.business(params.slug!),
    api.plans().catch(() => [] as Plan[]),
  ]);
  return { business, plans };
}

const cedis = (pesewas: number) =>
  "GH₵ " + (pesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 });

export function Component() {
  const { business: b, plans } = useLoaderData() as { business: Listing; plans: Plan[] };
  usePageTitle(b.title);
  useRecordView(b.id);
  const { member } = useAuth();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [params, setParams] = useSearchParams();
  const d = b.details;
  const isOwner = member?.id === b.ownerId;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Subscription | null>(null);
  const [confirming, setConfirming] = useState(false);
  const confirmedRef = useRef(false);

  useEffect(() => {
    const ref = params.get("sub_ref");
    if (!ref || confirmedRef.current) return;
    confirmedRef.current = true;
    setConfirming(true);
    api.confirmSubscription(ref)
      .then((subscription) => {
        setConfirmed(subscription);
        setParams({}, { replace: true });
        revalidator.revalidate();
      })
      .catch(() => setError("We couldn't confirm that payment. If you were charged, it will reconcile shortly."))
      .finally(() => setConfirming(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plan = plans.filter((candidate) => candidate.interval === "month").sort((x, y) => x.sortOrder - y.sortOrder)[0];
  const price = plan ? (plan.prices.business ?? plan.prices.default ?? 0) : 0;

  async function subscribe() {
    setError(null);
    if (!member) {
      navigate("/signin", { state: { from: "/business/" + b.slug } });
      return;
    }
    setBusy(true);
    try {
      const response = await api.subscribe(b.slug, plan?.slug);
      await completePayment(response, {
        onSuccess: async () => {
          setConfirming(true);
          try {
            setConfirmed(await api.confirmSubscription(response.reference));
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

  let subscribeLabel = "Subscribe with Paystack";
  if (busy) subscribeLabel = "Starting payment…";
  else if (b.supporter) subscribeLabel = "Renew — add another month";

  return (
    <article>
      <section className="on-dark on-dark-pin relative isolate overflow-hidden bg-teal text-cream">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(199,162,74,0.25),transparent_31%),linear-gradient(130deg,#083F37_0%,#0B6557_54%,#123F2D_100%)]" aria-hidden />
        <div className="bg-dotgrid absolute inset-0 opacity-35" aria-hidden />
        <div className="absolute -bottom-28 -left-16 h-72 w-72 rounded-full border border-cream/10" aria-hidden />
        <Container size="wide" className="relative py-10 sm:py-14 lg:py-16">
          <Reveal>
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-2 text-sm text-cream/65">
                <li><Link to="/" className="transition-colors hover:text-gold">Home</Link></li>
                <li aria-hidden>/</li>
                <li><Link to="/business" className="transition-colors hover:text-gold">Business directory</Link></li>
                <li aria-hidden>/</li>
                <li className="max-w-48 truncate text-cream/90" aria-current="page">{b.title}</li>
              </ol>
            </nav>
          </Reveal>

          <div className="mt-7 grid items-stretch gap-8 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-12">
            <div className="flex flex-col justify-center">
              <Reveal delay={0.05} className="flex flex-wrap items-center gap-2">
                {d.category && (
                  <span className="rounded-full border border-cream/20 bg-cream/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cream backdrop-blur-sm">{d.category}</span>
                )}
                {b.supporter && <span className="rounded-full bg-gold-brand px-3 py-1 text-xs font-bold text-green-900">★ Oguaa Supporter</span>}
                {b.featured && <span className="rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">Featured locally</span>}
              </Reveal>
              <Reveal as="h1" delay={0.1} className="mt-4 max-w-3xl text-5xl font-semibold leading-[0.98] text-cream sm:text-6xl">
                {b.title}
              </Reveal>
              {d.description && <Reveal delay={0.16} className="mt-6 max-w-2xl text-lg leading-relaxed text-cream/82">{d.description}</Reveal>}
              <Reveal delay={0.2} className="mt-7 flex flex-wrap gap-3 text-sm">
                {d.address && (
                  <a href="#location" className="inline-flex items-center gap-2 rounded-full border border-cream/20 bg-cream/10 px-4 py-2 text-cream transition-colors hover:border-gold hover:text-gold">
                    <span aria-hidden>⌖</span> {d.address}
                  </a>
                )}
                {d.openingHours && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-cream/20 bg-cream/10 px-4 py-2 text-cream/85">
                    <span aria-hidden>◷</span> {d.openingHours}
                  </span>
                )}
              </Reveal>
            </div>

            <Reveal delay={0.12} className="relative min-h-64 overflow-hidden rounded-[1.5rem] border border-cream/15 bg-green-900/40 shadow-2xl">
              {b.coverImageUrl ? (
                <img
                  src={cldCover(b.coverImageUrl, 900)}
                  alt={b.title}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={(event) => { event.currentTarget.style.display = "none"; }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-teal to-green-900">
                  <span className="text-8xl font-semibold text-cream/20" aria-hidden>{b.title.charAt(0)}</span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-green-900/80 via-transparent to-transparent" aria-hidden />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">Made in Cape Coast</p>
                <p className="mt-1 text-sm text-cream/80">A community-listed local business</p>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {(d.contact?.length ?? 0) > 0 && (
        <div className="border-b border-sand bg-cream">
          <Container size="wide" className="flex flex-wrap items-center gap-2 py-3">
            <span className="mr-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">Contact</span>
            {d.contact?.map((contact) => (
              <a key={contact.label} href={contact.url} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-2 rounded-full border border-sand bg-paper px-4 py-2 text-sm font-semibold text-teal-text transition-colors hover:border-teal/50 hover:bg-teal/[0.06]">
                {contact.label} <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>↗</span>
              </a>
            ))}
          </Container>
        </div>
      )}

      <Container size="wide" className="grid gap-10 py-12 lg:grid-cols-[minmax(0,1.5fr)_22rem] lg:gap-14 lg:py-16">
        <div className="min-w-0 space-y-12">
          <Reveal as="section">
            <p className="eyebrow text-teal-text">What they offer</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink sm:text-4xl">Services &amp; prices</h2>
            <div className="mt-4 h-1 w-16 rounded-full bg-teal" aria-hidden />
            {d.services && d.services.length > 0 ? (
              <Stagger as="ul" className="mt-7 grid gap-3 sm:grid-cols-2">
                {d.services.map((service, index) => (
                  <StaggerItem as="li" key={service.name} className="group relative overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)]">
                    <span className="absolute inset-y-0 left-0 w-1 bg-teal/70 transition-colors group-hover:bg-gold-brand" aria-hidden />
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <span className="text-[0.68rem] font-semibold tabular-nums text-ink-faint">{String(index + 1).padStart(2, "0")}</span>
                        <h3 className="mt-2 text-lg font-semibold text-ink">{service.name}</h3>
                        {service.note && <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{service.note}</p>}
                      </div>
                      {service.price && <span className="shrink-0 rounded-full bg-gold/[0.12] px-3 py-1 text-sm font-semibold text-gold-text">{service.price}</span>}
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            ) : (
              <div className="mt-7 rounded-[var(--radius-card)] border border-dashed border-sand bg-cream p-6 text-ink-muted">Contact the business for its current services and prices.</div>
            )}
          </Reveal>

          {b.tags.length > 0 && (
            <Reveal as="section">
              <h2 className="text-2xl font-semibold text-ink">Known for</h2>
              <div className="mt-4 flex flex-wrap gap-2">{b.tags.map((tag) => <Pill key={tag} tone="teal">#{tag}</Pill>)}</div>
            </Reveal>
          )}

          {d.address && (
            <Reveal as="section" className="scroll-mt-24" >
              <div id="location" className="scroll-mt-24">
                <p className="eyebrow text-teal-text">Visit in person</p>
                <h2 className="mt-3 text-3xl font-semibold text-ink">Find {b.title}</h2>
                <p className="mt-3 max-w-2xl text-ink-muted">{d.address}{d.openingHours ? " · " + d.openingHours : ""}</p>
                <LocationMap className="mt-6" address={d.address} query={b.title} latitude={b.latitude} longitude={b.longitude} />
              </div>
            </Reveal>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
            <div className="bg-green px-5 py-4 text-on-green">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">Plan your visit</p>
              <h2 className="mt-1 text-2xl font-semibold text-on-green">At a glance</h2>
            </div>
            <dl className="divide-y divide-sand p-5 text-sm">
              {d.category && <div className="flex justify-between gap-4 py-3 first:pt-0"><dt className="text-ink-faint">Category</dt><dd className="text-right font-medium text-ink">{d.category}</dd></div>}
              {d.address && <div className="flex justify-between gap-4 py-3"><dt className="text-ink-faint">Location</dt><dd className="max-w-48 text-right text-ink">{d.address}</dd></div>}
              {d.openingHours && <div className="flex justify-between gap-4 py-3 last:pb-0"><dt className="text-ink-faint">Hours</dt><dd className="max-w-48 text-right text-ink">{d.openingHours}</dd></div>}
            </dl>
            {(d.contact?.length ?? 0) > 0 && (
              <div className="grid gap-2 border-t border-sand p-5">
                {d.contact?.map((contact) => (
                  <a key={contact.label} href={contact.url} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between rounded-full border border-teal/35 px-4 py-2.5 text-sm font-semibold text-teal-text transition-colors hover:bg-teal hover:text-cream">
                    {contact.label} <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>↗</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {isOwner && plan && (
            <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-gold-border/40 bg-gold/[0.07] p-5">
              <span className="absolute -right-6 -top-8 text-8xl text-gold opacity-10" aria-hidden>★</span>
              <div className="relative">
                <p className="eyebrow text-gold-text">Support Oguaa</p>
                <h2 className="mt-2 text-xl font-semibold text-ink">{plan.name}</h2>
                <p className="mt-1 text-2xl font-semibold text-gold-text">{cedis(price)}<span className="text-sm font-normal text-ink-faint"> / month</span></p>
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  Keep the platform running and give {b.title} {(plan.perks ?? []).length > 0 ? (plan.perks ?? []).map((perk) => perk.toLowerCase()).join(", ") : "a boost in the business directory"}. Each payment adds another month.
                </p>
                {b.supporter && d.subscribedUntil && <p className="mt-3 rounded-lg bg-gold/[0.1] p-3 text-sm font-medium text-gold-text">★ Active until {formatDate(d.subscribedUntil)}</p>}
                {confirming && <p className="mt-4 text-sm text-ink-muted">Confirming your payment…</p>}
                {confirmed ? (
                  <div className="mt-4 rounded-lg border border-green/30 bg-green/[0.06] p-4">
                    <p className="text-base font-semibold text-green-text">Medaase! Your support is confirmed.</p>
                    <p className="mt-1 text-sm text-ink-muted">
                      {b.title} is a Supporter until <b>{confirmed.periodEnd ? formatDate(confirmed.periodEnd) : "next month"}</b>.
                      {confirmed.simulated && <span className="mt-1 block text-xs text-gold-text">Simulated — dev mode, no real money moved.</span>}
                    </p>
                  </div>
                ) : (
                  <div className="mt-4">
                    {error && <p className="mb-2 text-sm text-clay-text">{error}</p>}
                    <button type="button" onClick={subscribe} disabled={busy} className="w-full rounded-full bg-gold-brand py-3 text-sm font-semibold text-green-900 transition-colors hover:bg-gold disabled:opacity-60">
                      {subscribeLabel}
                    </button>
                    <p className="mt-2 text-center text-xs text-ink-faint">Mobile money &amp; cards via Paystack.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end"><ReportButton listingId={b.id} /></div>
        </aside>
      </Container>

      <Container><SampleNote>{SAMPLE_NOTICE}</SampleNote></Container>
    </article>
  );
}
