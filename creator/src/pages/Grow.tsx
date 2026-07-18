import { useState } from "react";
import { Link, useLoaderData, useRevalidator } from "react-router-dom";
import { api } from "@/lib/api";
import { completePayment } from "@/lib/paystack";
import type { CreatorOverview, MemberView, Plan, Subscription } from "@/lib/types";
import { BusyLabel } from "@/components/skeleton";
import { formatDate } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CalendarDays,
  Check,
  Eye,
  Info,
  Megaphone,
  Rocket,
  Sparkles,
  Star,
  Ticket,
  TrendingUp,
  WalletCards,
} from "lucide-react";

interface Data {
  overview: CreatorOverview;
  view: MemberView;
  subscriptions: Subscription[];
  plans: Plan[];
  subscriptionsUnavailable: boolean;
  plansUnavailable: boolean;
}

interface CollectionResult<T> {
  items: T[];
  unavailable: boolean;
}

async function loadCollection<T>(request: Promise<T[]>): Promise<CollectionResult<T>> {
  try {
    return { items: await request, unavailable: false };
  } catch {
    return { items: [], unavailable: true };
  }
}

export async function loader(): Promise<Data> {
  const me = await api.me();
  const [overview, view, subscriptionsResult, plansResult] = await Promise.all([
    api.creatorOverview(),
    api.member(me.slug),
    loadCollection(api.mySubscriptions()),
    loadCollection(api.plans()),
  ]);
  return {
    overview,
    view,
    subscriptions: subscriptionsResult.items,
    plans: plansResult.items,
    subscriptionsUnavailable: subscriptionsResult.unavailable,
    plansUnavailable: plansResult.unavailable,
  };
}

const cedis = (pesewas: number) =>
  `GH₵ ${(pesewas / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })}`;

// The per-business price of a plan (business override, else the default).
const businessPrice = (p: Plan) => p.prices.business ?? p.prices.default ?? 0;

const planLabelFromSlug = (slug: string) =>
  slug
    ? slug.split("-").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
    : "Supporter";

function currentSubscriptions(subscriptions: Subscription[], nowISO: string): Subscription[] {
  const byListing = new Map<string, Subscription>();
  for (const subscription of subscriptions) {
    if (subscription.status !== "success" || (subscription.periodEnd ?? "") <= nowISO) continue;
    const current = byListing.get(subscription.listingId);
    if (!current || (subscription.periodEnd ?? "") > (current.periodEnd ?? "")) {
      byListing.set(subscription.listingId, subscription);
    }
  }
  return [...byListing.values()];
}

// How the featured-promotions flow works, rendered as a vertical stepper.
const PROMO_STEPS = [
  "Pick an approved listing on the My Work page.",
  "Choose 7, 14 or 30 days and pay with MoMo or card via Paystack.",
  "Your listing is featured immediately; extra purchases extend the run.",
];

export function Component() {
  const { overview, view, subscriptions, plans, subscriptionsUnavailable, plansUnavailable } = useLoaderData() as Data;
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState<string | null>(null); // "slug:plan" being subscribed
  const [err, setErr] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Subscription | null>(null);

  // Plans are per-business subscriptions — offer each paid catalog plan on
  // every approved business listing.
  const businesses = view.listings.filter((l) => l.type === "business" && l.status === "approved");
  const nowISO = new Date().toISOString();
  const activeSubs = currentSubscriptions(subscriptions, nowISO);
  const paidPlans = plans.filter((p) => p.active && p.interval === "month" && (p.audience === "any" || p.audience === "business") && businessPrice(p) > 0);
  const planName = (slug: string) => plans.find((p) => p.slug === slug)?.name ?? planLabelFromSlug(slug);
  const currentPlan = subscriptionsUnavailable
    ? "Unavailable"
    : activeSubs.length > 0
      ? planName(activeSubs[0].plan)
      : overview.activeSubscription
        ? planName(overview.plan ?? "")
        : "Starter";
  const promotedListings = view.listings.filter((listing) =>
    listing.status === "approved"
    && listing.featured
    && (!listing.featuredUntil || listing.featuredUntil > nowISO));
  const visiblePromotions = promotedListings.slice(0, 3);
  const hiddenPromotions = Math.max(overview.activePromotions - visiblePromotions.length, 0);

  async function subscribe(slug: string, plan: string) {
    setErr(null);
    setBusy(`${slug}:${plan}`);
    try {
      const r = await api.subscribe(slug, plan);
      if (r.simulated) {
        // Dev mode has no Paystack checkout to return from — settle in place.
        const s = await api.confirmSubscription(r.reference);
        setConfirmed(s);
        revalidator.revalidate();
      } else {
        // Open the in-app Paystack modal; confirm in place on payer success.
        // When the modal can't run, completePayment redirects to the hosted
        // page and the return-URL flow confirms on the way back.
        await completePayment(r, {
          onSuccess: async () => {
            const s = await api.confirmSubscription(r.reference);
            setConfirmed(s);
            revalidator.revalidate();
          },
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start the payment.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-green-900 px-5 pb-5 pt-6 text-[#f6f1e7] shadow-[0_22px_60px_rgba(5,21,14,0.18)] sm:px-7 sm:pb-6 sm:pt-8 lg:px-9">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-90"
          style={{
            background: "radial-gradient(circle at 82% 10%, rgba(199,162,74,.3), transparent 27%), radial-gradient(circle at 68% 75%, rgba(14,124,107,.28), transparent 30%), linear-gradient(125deg, transparent 55%, rgba(255,255,255,.04))",
          }}
          aria-hidden
        />
        <div className="pointer-events-none absolute -right-14 -top-16 -z-10 h-52 w-52 rounded-full border border-white/10" aria-hidden />
        <div className="pointer-events-none absolute right-7 top-9 -z-10 h-24 w-24 rounded-full border border-gold/25" aria-hidden />

        <div className="grid items-end gap-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(17rem,.8fr)]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-[0.64rem] font-bold uppercase tracking-[0.16em] text-gold">
              <Sparkles size={12} aria-hidden /> Growth studio
            </div>
            <h1 className="mt-5 max-w-2xl text-4xl font-semibold leading-[1.02] !text-[#f6f1e7] sm:text-5xl">
              Turn local attention into lasting momentum.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[#d7ded8] sm:text-base">
              Build a short featured campaign for one listing or keep your business visible all month with an always-on Supporter plan.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link to="/work" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-green-900 transition hover:-translate-y-0.5 hover:bg-[#dcc36f]">
                <Rocket size={15} aria-hidden /> Launch a campaign
              </Link>
              <Link to="/work" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-white/[0.06] px-5 py-2.5 text-sm font-semibold text-[#f6f1e7] transition hover:bg-white/[0.12]">
                Review your listings <ArrowRight size={14} aria-hidden />
              </Link>
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-white/12 bg-black/10 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[0.62rem] font-bold uppercase tracking-[0.15em] text-[#b8c4b9]">Campaign pulse</p>
                <p className="mt-2 text-4xl font-extrabold tracking-tight">{overview.activePromotions}</p>
                <p className="mt-1 text-xs text-[#b8c4b9]">featured placements live</p>
              </div>
              <span className="relative flex h-20 w-20 items-center justify-center rounded-full border border-gold/35 bg-gold/10 text-gold">
                <span className="absolute inset-2 rounded-full border border-dashed border-gold/35" aria-hidden />
                <Megaphone size={25} aria-hidden />
              </span>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-xs">
              <span className="text-[#b8c4b9]">Current runway</span>
              <span className="font-bold text-[#f6f1e7]">
                {overview.promotionDaysLeft ? `${overview.promotionDaysLeft} days remaining` : "Ready to launch"}
              </span>
            </div>
          </div>
        </div>

        <dl className="mt-8 grid grid-cols-2 overflow-hidden rounded-[1.35rem] border border-white/10 bg-white/[0.055] sm:grid-cols-4">
          {[
            { label: "Views this month", value: overview.viewsThisMonth.toLocaleString("en-GH"), icon: <Eye size={15} aria-hidden /> },
            { label: "Tickets sold", value: overview.ticketsSold.toLocaleString("en-GH"), icon: <Ticket size={15} aria-hidden /> },
            { label: "Ticket revenue", value: cedis(overview.ticketsGrossPesewas), icon: <BarChart3 size={15} aria-hidden /> },
            { label: "Pledges raised", value: cedis(overview.pledgesRaisedPesewas), icon: <WalletCards size={15} aria-hidden /> },
          ].map((metric) => (
            <div key={metric.label} className="border-white/10 p-4 odd:border-r sm:border-r sm:last:border-r-0">
              <dt className="flex items-center gap-1.5 text-[0.65rem] font-semibold text-[#b8c4b9]">{metric.icon}{metric.label}</dt>
              <dd className="mt-1.5 truncate text-lg font-extrabold tracking-tight text-[#f6f1e7]">{metric.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {confirmed && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-teal/25 bg-teal/[0.1] px-4 py-3.5 text-sm text-teal-text" role="status">
          <BadgeCheck size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p><strong>Payment confirmed.</strong> &ldquo;{confirmed.listingTitle}&rdquo; is now active on the {planName(confirmed.plan)} plan.</p>
        </div>
      )}
      {err && <p className="mt-4 rounded-2xl border border-maroon-900/20 bg-maroon-900/[0.08] px-4 py-3.5 text-sm font-medium text-maroon-text" role="alert">{err}</p>}
      {(subscriptionsUnavailable || plansUnavailable) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-border/35 bg-gold/[0.08] px-4 py-3.5 text-sm text-ink-muted" role="alert">
          <span>
            Some {subscriptionsUnavailable && plansUnavailable ? "subscription and plan" : subscriptionsUnavailable ? "subscription" : "plan"} details are temporarily unavailable. Metrics remain visible, but offers may be incomplete.
          </span>
          <button
            type="button"
            onClick={() => revalidator.revalidate()}
            disabled={revalidator.state === "loading"}
            aria-busy={revalidator.state === "loading" || undefined}
            className="inline-flex min-h-11 items-center rounded-full border border-gold-border/50 px-4 text-xs font-bold text-gold-text transition-colors hover:bg-gold/[0.1] disabled:opacity-60"
          >
            {revalidator.state === "loading" ? <BusyLabel label="Refreshing growth data" width="w-16" /> : "Try again"}
          </button>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-sand bg-sand lg:grid-cols-4">
        {[
          { label: "Current plan", value: currentPlan, note: subscriptionsUnavailable ? "Plan details unavailable" : overview.activeSubscription ? "Paid plan active" : "Free forever" },
          { label: "Live inventory", value: overview.live, note: `${overview.listings} total listings` },
          { label: "Review queue", value: overview.pending, note: overview.pending ? "Awaiting review" : "Everything reviewed" },
          { label: "Growth status", value: overview.activePromotions ? "In market" : "Ready", note: overview.activePromotions ? "Campaigns running" : "No campaign running" },
        ].map((item) => (
          <div key={item.label} className="bg-cream px-4 py-4 sm:px-5">
            <dt className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-ink-faint">{item.label}</dt>
            <dd className="mt-1 text-lg font-extrabold text-ink">{item.value}</dd>
            <p className="mt-0.5 text-xs text-ink-muted">{item.note}</p>
          </div>
        ))}
      </dl>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.15em] text-gold-text">Featured campaigns</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">Plan the push. Watch the runway.</h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-ink-muted">Featured placement costs GH₵ 10 per day in focused 7, 14 or 30-day runs.</p>
        </div>

        <div className="mt-4 grid overflow-hidden rounded-[1.75rem] border border-sand bg-cream lg:grid-cols-[.82fr_1.18fr]">
          <div className="border-b border-sand p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-bold text-ink">Campaign flight plan</p>
              <span className="rounded-full bg-gold/[0.14] px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-gold-text">3 moves</span>
            </div>
            <ol className="mt-6 space-y-0">
              {PROMO_STEPS.map((step, index) => {
                const last = index === PROMO_STEPS.length - 1;
                return (
                  <li key={step} className="grid grid-cols-[2.25rem_1fr] gap-3">
                    <div className="flex flex-col items-center">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green text-xs font-extrabold text-on-green shadow-sm">0{index + 1}</span>
                      {!last && <span className="my-1.5 w-px flex-1 bg-sand" aria-hidden />}
                    </div>
                    <div className={last ? "pb-1" : "pb-6"}>
                      <p className="text-[0.62rem] font-bold uppercase tracking-[0.11em] text-ink-faint">
                        {index === 0 ? "Choose" : index === 1 ? "Set the runway" : "Go live"}
                      </p>
                      <p className="mt-1 text-sm leading-5 text-ink-muted">{step}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <Link to="/work" className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-on-green transition-colors hover:bg-green-900 sm:w-auto">
              <Megaphone size={15} aria-hidden /> Choose a listing
            </Link>
          </div>

          <div className="bg-paper p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-ink">Live campaign runway</p>
                <p className="mt-1 text-xs text-ink-muted">Your promoted work, surfaced across Oguaa.</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-extrabold text-green-text">{overview.activePromotions}</p>
                <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-ink-faint">active</p>
              </div>
            </div>

            {visiblePromotions.length > 0 ? (
              <div className="mt-5 space-y-2.5">
                {visiblePromotions.map((listing, index) => (
                  <div key={listing.id} className="group grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-sand bg-cream p-2.5 transition-colors hover:border-gold-border/50">
                    <div className="relative h-14 overflow-hidden rounded-xl bg-green-900">
                      {listing.coverImageUrl ? (
                        <img src={mediaUrl(listing.coverImageUrl)} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-gradient-to-br from-green to-teal text-sm font-extrabold text-white/80">{String(index + 1).padStart(2, "0")}</div>
                      )}
                      <span className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-gold ring-2 ring-green-900" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink">{listing.title}</p>
                      <p className="mt-1 truncate text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-teal-text">{listing.type} · featured</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[0.62rem] font-bold uppercase tracking-[0.08em] text-ink-faint">Until</p>
                      <p className="mt-1 text-xs font-semibold text-ink">{listing.featuredUntil ? formatDate(listing.featuredUntil) : "Ongoing"}</p>
                    </div>
                  </div>
                ))}
                {hiddenPromotions > 0 && (
                  <p className="pt-2 text-center text-xs font-medium text-ink-muted">+{hiddenPromotions} more active {hiddenPromotions === 1 ? "campaign" : "campaigns"} managed in My Work</p>
                )}
              </div>
            ) : overview.activePromotions > 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-gold-border/40 bg-gold/[0.07] p-5">
                <p className="text-sm font-semibold text-ink">{overview.activePromotions} featured {overview.activePromotions === 1 ? "campaign is" : "campaigns are"} live.</p>
                <p className="mt-1 text-xs leading-5 text-ink-muted">Open My Work to see and extend the listings currently in market.</p>
                <Link to="/work" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-gold-text hover:underline">Manage campaigns <ArrowRight size={12} aria-hidden /></Link>
              </div>
            ) : (
              <div className="mt-5 flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-sand bg-cream px-5 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold/[0.14] text-gold-text"><TrendingUp size={19} aria-hidden /></span>
                <p className="mt-3 text-sm font-bold text-ink">Your runway is clear</p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-ink-muted">Choose an approved listing when you are ready to put it in front of more people.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mt-9 pb-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.15em] text-teal-text">Always-on visibility</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">Keep a business in the conversation.</h2>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-sand bg-cream px-3.5 py-2 text-xs font-semibold text-ink-muted">
            <BadgeCheck size={14} className="text-teal-text" aria-hidden /> {subscriptionsUnavailable ? "Plan status unavailable" : `${activeSubs.length} active ${activeSubs.length === 1 ? "subscription" : "subscriptions"}`}
          </div>
        </div>

        {!subscriptionsUnavailable && activeSubs.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-teal/20 bg-teal/[0.07]">
            <div className="flex items-center gap-2 border-b border-teal/15 px-4 py-3 text-xs font-bold uppercase tracking-[0.11em] text-teal-text">
              <CalendarDays size={14} aria-hidden /> Active plan roster
            </div>
            <ul className="divide-y divide-teal/15">
              {activeSubs.map((subscription) => (
                <li key={subscription.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 text-sm">
                  <span className="min-w-0 font-semibold text-ink">{subscription.listingTitle} <span className="font-normal text-ink-muted">· {planName(subscription.plan)}</span></span>
                  <span className="shrink-0 text-xs font-bold text-teal-text">Active until {formatDate(subscription.periodEnd)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 space-y-4">
          {plansUnavailable && (
            <div className="rounded-[1.75rem] border border-dashed border-gold-border/40 bg-gold/[0.07] px-6 py-8 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gold/[0.14] text-gold-text"><Info size={20} aria-hidden /></span>
              <h2 className="mt-3 text-lg font-semibold text-ink">Plan catalog unavailable</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">The current offers could not be loaded. Use “Try again” above before choosing a plan.</p>
            </div>
          )}
          {!plansUnavailable && paidPlans.length === 0 && (
            <div className="rounded-[1.75rem] border border-dashed border-sand bg-cream px-6 py-10 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sand text-ink-muted"><BadgeCheck size={20} aria-hidden /></span>
              <h2 className="mt-3 text-lg font-semibold text-ink">Plans are between seasons</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">No paid plans are on sale right now. Your free tools remain available while you check back.</p>
            </div>
          )}

          {paidPlans.map((plan) => {
            const price = businessPrice(plan);
            const creatorDelta = plan.prices.creator != null && plan.prices.creator !== plan.prices.default;
            const perks = plan.perks ?? [];
            return (
              <article key={plan.id} className={`relative overflow-hidden rounded-[1.75rem] border bg-cream ${plan.goldBadge ? "border-gold-border/50 shadow-[0_16px_40px_rgba(176,125,50,.09)]" : "border-sand"}`}>
                <div className="grid lg:grid-cols-[.72fr_1fr_1.18fr]">
                  <div className="relative overflow-hidden border-b border-sand bg-green-900 p-5 text-[#f6f1e7] sm:p-6 lg:border-b-0 lg:border-r">
                    <div className="pointer-events-none absolute -bottom-16 -right-12 h-40 w-40 rounded-full border-[22px] border-white/[0.04]" aria-hidden />
                    {plan.goldBadge && (
                      <span className="relative inline-flex items-center gap-1 rounded-full bg-gold px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-[0.1em] text-green-900">
                        <Star size={10} className="fill-current" aria-hidden /> Recommended
                      </span>
                    )}
                    <h2 className="relative mt-5 text-2xl font-semibold !text-[#f6f1e7]">{plan.name}</h2>
                    <div className="relative mt-3 flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold tracking-tight">{cedis(price)}</span>
                      <span className="text-sm text-[#b8c4b9]">/month</span>
                    </div>
                    <p className="relative mt-2 max-w-xs text-xs leading-5 text-[#b8c4b9]">
                      Per business{creatorDelta ? ` · ${cedis(plan.prices.creator!)}/mo for artist and organiser creators` : ""}
                    </p>
                  </div>

                  <div className="border-b border-sand p-5 sm:p-6 lg:border-b-0 lg:border-r">
                    <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-ink-faint">What the plan unlocks</p>
                    {perks.length > 0 ? (
                      <ul className="mt-4 space-y-3">
                        {perks.map((perk) => (
                          <li key={perk} className="flex items-start gap-2.5 text-sm leading-5 text-ink-muted">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/20 text-gold-text">
                              <Check size={12} strokeWidth={3} aria-hidden />
                            </span>
                            {perk}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-ink-muted">Always-on visibility for your approved business.</p>
                    )}
                    <p className="mt-5 text-xs leading-5 text-ink-faint">Renewals stack, so each payment extends the paid-until date by one month.</p>
                  </div>

                  <div className="bg-paper p-5 sm:p-6">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-ink-faint">Choose a business</p>
                      <span className="text-xs font-semibold text-ink-muted">{businesses.length} eligible</span>
                    </div>
                    {businesses.length === 0 ? (
                      <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-gold-border/40 bg-gold/[0.08] px-3.5 py-3 text-sm leading-5 text-ink-muted">
                        <Info size={15} className="mt-0.5 shrink-0 text-gold-text" aria-hidden />
                        <span>You do not have an approved business listing yet. <Link to="/work" className="font-semibold text-gold-text hover:underline">Add one first.</Link></span>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {businesses.map((business) => {
                          const activeSubscription = activeSubs.find((subscription) => subscription.listingId === business.id);
                          const key = `${business.slug}:${plan.slug}`;
                          const action = !activeSubscription ? "Choose" : activeSubscription.plan === plan.slug ? "Renew" : "Switch";
                          return (
                            <div key={key} className="flex items-center justify-between gap-3 rounded-2xl border border-sand bg-cream px-3.5 py-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-ink">{business.title}</p>
                                <p className="mt-0.5 text-[0.65rem] text-ink-faint">
                                  {activeSubscription
                                    ? `${planName(activeSubscription.plan)} active until ${formatDate(activeSubscription.periodEnd)}`
                                    : "Approved business"}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => subscribe(business.slug, plan.slug)}
                                disabled={subscriptionsUnavailable || busy != null}
                                aria-busy={busy === key || undefined}
                                className="min-h-11 shrink-0 rounded-full bg-gold-brand px-3.5 py-2 text-xs font-bold text-green-900 transition hover:opacity-90 disabled:opacity-60"
                              >
                                {busy === key
                                  ? <BusyLabel label="Starting subscription checkout" width="w-20" />
                                  : subscriptionsUnavailable
                                    ? "Retry status above"
                                    : `${action} · ${cedis(price)}`}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
