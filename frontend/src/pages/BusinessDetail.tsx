import { useEffect, useRef, useState } from "react";
import { useLoaderData, useNavigate, useRevalidator, useSearchParams, type LoaderFunctionArgs } from "react-router-dom";
import { usePageTitle } from "@/lib/use-page-title";
import type { Listing, Plan, Subscription } from "@/lib/types";
import { api } from "@/lib/api";
import { useRecordView } from "@/lib/use-record-view";
import { useAuth } from "@/lib/auth";
import { Container, SampleNote } from "@/components/ui";
import { DetailHero } from "@/components/detail-hero";
import { LocationMap } from "@/components/location-map";
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
  `GH₵ ${(pesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;

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
  // Confirmation state when the owner returns from Paystack (?sub_ref=…).
  const [confirmed, setConfirmed] = useState<Subscription | null>(null);
  const [confirming, setConfirming] = useState(false);
  const confirmedRef = useRef(false);

  useEffect(() => {
    const ref = params.get("sub_ref");
    if (!ref || confirmedRef.current) return;
    confirmedRef.current = true; // confirm once, even across re-renders
    setConfirming(true);
    api.confirmSubscription(ref)
      .then((s) => {
        setConfirmed(s);
        setParams({}, { replace: true });
        revalidator.revalidate(); // re-run the loader so the badge/expiry updates in place
      })
      .catch(() => setError("We couldn't confirm that payment. If you were charged, it will reconcile shortly."))
      .finally(() => setConfirming(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The entry paid plan from the staff-managed catalog drives this panel.
  const plan = plans.filter((p) => p.interval === "month").sort((x, y) => x.sortOrder - y.sortOrder)[0];
  const price = plan ? (plan.prices.business ?? plan.prices.default ?? 0) : 0;

  async function subscribe() {
    setError(null);
    if (!member) { navigate("/signin", { state: { from: `/business/${b.slug}` } }); return; }
    setBusy(true);
    try {
      const r = await api.subscribe(b.slug, plan?.slug);
      window.location.assign(r.authorizationUrl); // off to Paystack (or straight back, in dev simulation)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the payment.");
      setBusy(false);
    }
  }

  let subscribeLabel = "Subscribe with Paystack";
  if (busy) subscribeLabel = "Starting payment…";
  else if (b.supporter) subscribeLabel = "Renew — add another month";

  return (
    <>
      <DetailHero
        tone="teal"
        backTo="/business"
        backLabel="Business directory"
        coverImageUrl={b.coverImageUrl}
        title={b.title}
        meta={
          <p>
            {d.address && <span>📍 {d.address}</span>}
            {d.address && d.openingHours ? <span className="mx-2 text-cream/40">·</span> : null}
            {d.openingHours && <span>{d.openingHours}</span>}
          </p>
        }
      >
        <span className="rounded-full border border-cream/25 bg-cream/10 px-3 py-1 text-xs font-medium text-cream backdrop-blur-sm">{d.category}</span>
        {b.supporter && <span className="rounded-full bg-gold-brand px-3 py-1 text-xs font-bold text-green-900">★ Supporter</span>}
      </DetailHero>

      <Container size="wide" className="grid gap-10 py-12 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <p className="font-serif text-lg leading-relaxed text-ink first-letter:float-left first-letter:mr-2 first-letter:text-5xl first-letter:font-semibold first-letter:leading-[0.85] first-letter:text-teal-text">{d.description}</p>
          {d.services && d.services.length > 0 && (
            <section className="mt-10">
              <h2 className="text-2xl font-semibold text-ink">Services</h2>
              <div className="mt-4 h-[3px] w-14 rounded-full bg-teal" aria-hidden />
              <ul className="mt-5 divide-y divide-sand overflow-hidden rounded-[var(--radius-card)] border border-sand bg-cream shadow-[var(--shadow-card)]">
                {d.services.map((svc) => (
                  <li key={svc.name} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="text-ink">{svc.name}{svc.note && <span className="ml-2 text-xs text-ink-faint">{svc.note}</span>}</span>
                    {svc.price && <span className="shrink-0 font-medium text-teal-text">{svc.price}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="space-y-6">
          <div className="rounded-[var(--radius-card)] border border-sand bg-cream p-5 shadow-[var(--shadow-card)] lg:sticky lg:top-20">
            <p className="eyebrow text-teal-text">Find them</p>
            <dl className="mt-3 space-y-3 text-sm">
              {d.address && <div><dt className="text-ink-faint">Location</dt><dd className="text-ink">{d.address}</dd></div>}
              {d.openingHours && <div><dt className="text-ink-faint">Hours</dt><dd className="text-ink">{d.openingHours}</dd></div>}
            </dl>
            {d.contact && d.contact.length > 0 && (
              <div className="mt-4 grid gap-2">
                {d.contact.map((c) => (
                  <a key={c.label} href={c.url} className="group flex items-center justify-between rounded-full border border-teal/50 px-4 py-2.5 text-sm font-semibold text-teal-text transition-colors hover:bg-teal hover:text-cream">{c.label} <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>↗</span></a>
                ))}
              </div>
            )}
          </div>

          {isOwner && plan && (
            <div className="rounded-[var(--radius-card)] border border-gold-border/40 bg-gold/[0.06] p-5">
              <p className="eyebrow text-gold-text">Support Oguaa</p>
              <h2 className="mt-1 text-lg font-semibold text-ink">{plan.name} — {cedis(price)}/month</h2>
              <p className="mt-2 text-sm text-ink-muted">
                Your {cedis(price)} a month keeps the platform running — and gives {b.title} {(plan.perks ?? []).length > 0 ? (plan.perks ?? []).map((p) => p.toLowerCase()).join(", ") : "a boost in the business directory"}.
                Renew manually: each payment adds another month.
              </p>
              {b.supporter && d.subscribedUntil && (
                <p className="mt-3 text-sm font-medium text-gold-text">★ Supporter active until {formatDate(d.subscribedUntil)}</p>
              )}
              {confirming && <p className="mt-4 text-sm text-ink-muted">Confirming your payment…</p>}
              {confirmed ? (
                <div className="mt-4 rounded-lg border border-green/30 bg-green/[0.06] p-4">
                  <p className="text-base font-semibold text-green-text">Medaase! 🎉</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    Your support is confirmed — {b.title} is a Supporter until <b>{confirmed.periodEnd ? formatDate(confirmed.periodEnd) : "next month"}</b>.
                    {confirmed.simulated && <span className="mt-1 block text-xs text-gold-text">Simulated — dev mode, no real money moved.</span>}
                  </p>
                </div>
              ) : (
                <div className="mt-4">
                  {error && <p className="mb-2 text-sm text-clay-text">{error}</p>}
                  <button type="button" onClick={subscribe} disabled={busy} className="w-full rounded-full bg-gold-brand py-3 text-sm font-semibold text-green-900 transition-colors hover:bg-gold disabled:opacity-60">
                    {subscribeLabel}
                  </button>
                  <p className="mt-2 text-center text-xs text-ink-faint">Mobile money &amp; cards via Paystack. {cedis(price)} per month.</p>
                </div>
              )}
            </div>
          )}

          {d.address && <LocationMap address={d.address} query={b.title} />}
        </aside>
      </Container>
      <Container><SampleNote>{SAMPLE_NOTICE}</SampleNote></Container>
    </>
  );
}
