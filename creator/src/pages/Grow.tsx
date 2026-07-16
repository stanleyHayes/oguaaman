import { useState } from "react";
import { Link, useLoaderData, useRevalidator } from "react-router-dom";
import { api } from "@/lib/api";
import type { CreatorOverview, MemberView, Plan, Subscription } from "@/lib/types";
import { Card } from "@/components/ui";
import { MetricCard } from "@/components/metric-card";
import { Stagger, StaggerItem } from "@/components/motion";
import { formatDate } from "@/lib/format";
import { BadgeCheck, Check, Info, Megaphone, Star } from "lucide-react";

interface Data {
  overview: CreatorOverview;
  view: MemberView;
  subscriptions: Subscription[];
  plans: Plan[];
}

export async function loader(): Promise<Data> {
  const me = await api.me();
  const [overview, view, subscriptions, plans] = await Promise.all([
    api.creatorOverview(),
    api.member(me.slug),
    api.mySubscriptions().catch(() => [] as Subscription[]),
    api.plans().catch(() => [] as Plan[]),
  ]);
  return { overview, view, subscriptions, plans };
}

const cedis = (pesewas: number) =>
  `GH₵ ${(pesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;

// The per-business price of a plan (business override, else the default).
const businessPrice = (p: Plan) => p.prices.business ?? p.prices.default ?? 0;

// How the featured-promotions flow works, rendered as a vertical stepper.
const PROMO_STEPS = [
  "Pick an approved listing on the My Work page.",
  "Choose 7, 14 or 30 days and pay with MoMo or card via Paystack.",
  "Your listing is featured immediately; extra purchases extend the run.",
];

export function Component() {
  const { overview, view, subscriptions, plans } = useLoaderData() as Data;
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState<string | null>(null); // "slug:plan" being subscribed
  const [err, setErr] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Subscription | null>(null);

  // Plans are per-business subscriptions — offer each paid catalog plan on
  // every approved business listing.
  const businesses = view.listings.filter((l) => l.type === "business" && l.status === "approved");
  const activeSubs = subscriptions.filter((s) => s.status === "success" && (s.periodEnd ?? "") > new Date().toISOString());
  const paidPlans = plans.filter((p) => p.interval === "month" && businessPrice(p) > 0);
  const planName = (slug: string) => plans.find((p) => p.slug === slug)?.name ?? "Supporter";
  const currentPlan = activeSubs.length > 0 ? planName(activeSubs[0].plan) : "Starter";

  async function subscribe(slug: string, plan: string) {
    setErr(null);
    setBusy(`${slug}:${plan}`);
    try {
      const r = await api.subscribe(slug, plan);
      if (r.simulated) {
        // Dev mode has no Paystack checkout to return from — settle in place.
        const s = await api.confirmSubscription(r.reference);
        setConfirmed(s);
        setBusy(null);
        revalidator.revalidate();
      } else {
        window.location.assign(r.authorizationUrl); // off to Paystack
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start the payment.");
      setBusy(null);
    }
  }

  return (
    <>
      <div className="mb-6">
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-gold-text">Grow</p>
        <h1 className="mt-1 text-3xl font-semibold text-ink">Promote &amp; plan</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Two levers: feature individual listings for a daily rate, or put your business on the Supporter plan for a standing boost.
        </p>
      </div>

      {confirmed && (
        <p className="mb-4 rounded-lg bg-teal/[0.12] px-4 py-3 text-sm font-medium text-teal-text">
          Payment confirmed — &ldquo;{confirmed.listingTitle}&rdquo; is now a Supporter business. ✓
        </p>
      )}
      {err && <p className="mb-4 rounded-lg bg-maroon-900/[0.08] px-4 py-3 text-sm font-medium text-maroon-text">{err}</p>}

      <Stagger className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
        <StaggerItem index={0}>
          <MetricCard label="Your plan" value={currentPlan} icon={<BadgeCheck size={18} />} tone="ink" sub={overview.activeSubscription ? "Paid plan active" : "Free forever"} />
        </StaggerItem>
        <StaggerItem index={1}>
          <MetricCard label="Active promotions" value={overview.activePromotions} icon={<Megaphone size={18} />} tone="green" sub={overview.promotionDaysLeft ? `${overview.promotionDaysLeft} days remaining` : "None running"} />
        </StaggerItem>
        <StaggerItem index={2}>
          <MetricCard label="Live listings" value={overview.live} icon={<Star size={18} />} tone="gold" sub={overview.pending ? `${overview.pending} in review` : "All reviewed"} to="/work" />
        </StaggerItem>
      </Stagger>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {paidPlans.length === 0 && (
            <Card className="p-5">
              <h2 className="text-lg font-semibold text-ink">Plans</h2>
              <p className="mt-1 text-sm text-ink-muted">No paid plans are on sale right now — check back soon.</p>
            </Card>
          )}
          {paidPlans.map((plan) => {
            const price = businessPrice(plan);
            const creatorDelta = plan.prices.creator != null && plan.prices.creator !== plan.prices.default;
            const perks = plan.perks ?? [];
            return (
              <Card key={plan.id} className={`relative overflow-hidden ${plan.goldBadge ? "ring-1 ring-gold-border/50" : ""}`}>
                {plan.goldBadge && (
                  <span className="absolute right-4 top-4 z-10 inline-flex items-center gap-1 rounded-full bg-gold/[0.16] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gold-text">
                    <Star size={10} className="fill-current" aria-hidden /> Recommended
                  </span>
                )}
                <div className="border-b border-sand p-5">
                  <h2 className="text-lg font-semibold text-ink">{plan.name}</h2>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-3xl font-semibold tracking-tight text-ink">{cedis(price)}</span>
                    <span className="text-sm font-medium text-ink-faint">/month</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-faint">
                    per business{creatorDelta ? ` · ${cedis(plan.prices.creator!)}/mo for artist & organiser creators` : ""}
                  </p>
                </div>
                <div className="p-5">
                  {perks.length > 0 && (
                    <ul className="space-y-2.5">
                      {perks.map((perk) => (
                        <li key={perk} className="flex items-start gap-2.5 text-sm text-ink-muted">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gold/20 text-gold-text">
                            <Check size={11} strokeWidth={3} aria-hidden />
                          </span>
                          {perk}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-4 text-xs text-ink-faint">
                    Renewals stack — each payment extends your paid-until date by a month.
                  </p>

                  {activeSubs.length > 0 && (
                    <ul className="mt-4 space-y-2">
                      {activeSubs.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl bg-teal/[0.08] px-3.5 py-2.5 text-sm">
                          <span className="min-w-0 truncate font-medium text-ink">{s.listingTitle} · {planName(s.plan)}</span>
                          <span className="shrink-0 text-xs font-semibold text-teal-text">★ until {formatDate(s.periodEnd)}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-5 space-y-2 border-t border-sand pt-4">
                    {businesses.length === 0 ? (
                      <div className="flex items-start gap-2.5 rounded-xl border border-gold-border/40 bg-gold/[0.08] px-3.5 py-3 text-sm text-ink-muted">
                        <Info size={15} className="mt-0.5 shrink-0 text-gold-text" aria-hidden />
                        <span>You don't have an approved business listing yet. <Link to="/work" className="font-semibold text-gold-text hover:underline">Add one first.</Link></span>
                      </div>
                    ) : (
                      <>
                        <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Add to a business</p>
                        {businesses.map((b) => {
                          const active = activeSubs.some((s) => s.listingId === b.id);
                          const key = `${b.slug}:${plan.slug}`;
                          return (
                            <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-sand px-3.5 py-2.5">
                              <span className="min-w-0 truncate text-sm font-medium text-ink">{b.title}</span>
                              {active ? (
                                <span className="shrink-0 text-xs font-semibold text-teal-text">Active ✓</span>
                              ) : (
                                <button type="button" onClick={() => subscribe(b.slug, plan.slug)} disabled={busy != null}
                                  className="shrink-0 rounded-full bg-gold-brand px-3.5 py-1.5 text-xs font-semibold text-green-900 transition-opacity hover:opacity-90 disabled:opacity-60">
                                  {busy === key ? "Starting…" : `Subscribe · ${cedis(price)}`}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-sand px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold-text">
                <Megaphone size={16} aria-hidden />
              </span>
              <h2 className="text-lg font-semibold text-ink">Featured promotions</h2>
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              Put any approved listing in the featured row across the portal's front pages. GH₵ 10 per day, in 7, 14 or 30-day bundles.
            </p>
          </div>
          <div className="p-5">
            <ol>
              {PROMO_STEPS.map((step, i) => {
                const last = i === PROMO_STEPS.length - 1;
                return (
                  <li key={step} className="flex gap-3.5">
                    <div className="flex flex-col items-center">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold-border/40 bg-gold/[0.15] text-xs font-bold text-gold-text">{i + 1}</span>
                      {!last && <span aria-hidden className="mt-1 w-px flex-1 bg-sand" />}
                    </div>
                    <p className={`pt-1 text-sm text-ink-muted ${last ? "" : "pb-5"}`}>{step}</p>
                  </li>
                );
              })}
            </ol>
            <Link to="/work" className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-gold-brand px-4 py-2 text-sm font-semibold text-gold-text transition-colors hover:bg-gold-brand hover:text-green-900">
              <Megaphone size={14} aria-hidden /> Promote a listing
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}
