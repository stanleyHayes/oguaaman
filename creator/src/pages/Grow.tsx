import { useState } from "react";
import { Link, useLoaderData, useRevalidator } from "react-router-dom";
import { api } from "@/lib/api";
import type { CreatorOverview, MemberView, Subscription } from "@/lib/types";
import { Card } from "@/components/ui";
import { MetricCard } from "@/components/metric-card";
import { Stagger, StaggerItem } from "@/components/motion";
import { formatDate } from "@/lib/format";
import { BadgeCheck, Megaphone, Star } from "lucide-react";

interface Data {
  overview: CreatorOverview;
  view: MemberView;
  subscriptions: Subscription[];
}

export async function loader(): Promise<Data> {
  const me = await api.me();
  const [overview, view, subscriptions] = await Promise.all([
    api.creatorOverview(),
    api.member(me.slug),
    api.mySubscriptions().catch(() => [] as Subscription[]),
  ]);
  return { overview, view, subscriptions };
}

export function Component() {
  const { overview, view, subscriptions } = useLoaderData() as Data;
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState<string | null>(null); // listing slug being subscribed
  const [err, setErr] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Subscription | null>(null);

  // Supporter is a per-business plan — offer it on each approved business listing.
  const businesses = view.listings.filter((l) => l.type === "business" && l.status === "approved");
  const activeSubs = subscriptions.filter((s) => s.status === "success" && (s.periodEnd ?? "") > new Date().toISOString());

  async function subscribe(slug: string) {
    setErr(null);
    setBusy(slug);
    try {
      const r = await api.subscribe(slug);
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
      {err && <p className="mb-4 rounded-lg bg-maroon-900/[0.08] px-4 py-3 text-sm font-medium text-maroon-900">{err}</p>}

      <Stagger className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
        <StaggerItem index={0}>
          <MetricCard label="Your plan" value={overview.activeSubscription ? "Supporter" : "Starter"} icon={<BadgeCheck size={18} />} tone="ink" sub={overview.activeSubscription ? "★ badge + priority placement" : "Free forever"} />
        </StaggerItem>
        <StaggerItem index={1}>
          <MetricCard label="Active promotions" value={overview.activePromotions} icon={<Megaphone size={18} />} tone="green" sub={overview.promotionDaysLeft ? `${overview.promotionDaysLeft} days remaining` : "None running"} />
        </StaggerItem>
        <StaggerItem index={2}>
          <MetricCard label="Live listings" value={overview.live} icon={<Star size={18} />} tone="gold" sub={overview.pending ? `${overview.pending} in review` : "All reviewed"} to="/work" />
        </StaggerItem>
      </Stagger>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-lg font-semibold text-ink">Supporter plan</h2>
          <p className="mt-1 text-sm text-ink-muted">
            GH₵ 50 per month per business. A gold ★ badge, priority placement in the directory, and room for more listings.
            Renewals stack — each payment extends your paid-until date by a month.
          </p>
          {activeSubs.length > 0 && (
            <ul className="mt-4 space-y-2">
              {activeSubs.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-xl bg-teal/[0.08] px-3.5 py-2.5 text-sm">
                  <span className="font-medium text-ink">{s.listingTitle}</span>
                  <span className="text-xs font-semibold text-teal-text">★ until {formatDate(s.periodEnd)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 space-y-2">
            {businesses.length === 0 ? (
              <p className="text-sm text-ink-faint">You don't have an approved business listing yet. <Link to="/work" className="font-semibold text-gold-text hover:underline">Add one first.</Link></p>
            ) : (
              businesses.map((b) => {
                const active = activeSubs.some((s) => s.listingId === b.id);
                return (
                  <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-sand px-3.5 py-2.5">
                    <span className="min-w-0 truncate text-sm font-medium text-ink">{b.title}</span>
                    {active ? (
                      <span className="shrink-0 text-xs font-semibold text-teal-text">Active ✓</span>
                    ) : (
                      <button type="button" onClick={() => subscribe(b.slug)} disabled={busy != null}
                        className="shrink-0 rounded-full bg-gold-brand px-3.5 py-1.5 text-xs font-semibold text-green-900 transition-opacity hover:opacity-90 disabled:opacity-60">
                        {busy === b.slug ? "Starting…" : "Subscribe · GH₵ 50"}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold text-ink">Featured promotions</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Put any approved listing in the featured row across the portal's front pages. GH₵ 10 per day, in 7, 14 or 30-day bundles.
          </p>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-muted">
            <li className="flex gap-2.5"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/20 text-xs text-gold-text">1</span>Pick an approved listing on the My Work page.</li>
            <li className="flex gap-2.5"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/20 text-xs text-gold-text">2</span>Choose 7, 14 or 30 days and pay with MoMo or card via Paystack.</li>
            <li className="flex gap-2.5"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold/20 text-xs text-gold-text">3</span>Your listing is featured immediately; extra purchases extend the run.</li>
          </ul>
          <Link to="/work" className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-gold-brand px-4 py-2 text-sm font-semibold text-gold-text transition-colors hover:bg-gold-brand hover:text-green-900">
            <Megaphone size={14} aria-hidden /> Promote a listing
          </Link>
        </Card>
      </div>
    </>
  );
}
