import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { Container, Eyebrow } from "@/components/ui";
import { Skeleton, SkeletonText } from "@/components/skeleton";
import { PaymentNotice } from "@/components/payment-notice";
import { AdFrame } from "@/components/ad-slot";
import { DeliveryChart } from "@/components/ads/delivery-chart";
import { AdStatusTag } from "@/components/ads/fields";
import { buttonClass } from "@/components/ads/styles";
import { api, apiErrorCode } from "@/lib/api";
import { AD_STATUS, adErrorMessage, formatBps, formatCount, formatGhs, PLACEMENT_FORMAT, REFUND_REASON, REFUND_STATUS, shortDate } from "@/lib/ads";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { paymentErrorMessage } from "@/lib/payments";
import type { AdCampaign, AdCampaignDetail } from "@/lib/types";
import { usePageTitle } from "@/lib/use-page-title";
import { usePaymentConfirm } from "@/lib/use-payment-confirm";

// /advertise/:id — one campaign for its advertiser: status and what happens
// next, the pay step once approved (with the approval countdown), delivery,
// refunds, the timeline, and cancel/stop with an in-page confirmation.

const PLACEMENT_NAME: Record<string, string> = {
  "portal-home-banner": "Portal home banner",
  "portal-feed-card": "Portal feed card",
  "portal-article-rect": "Article sidebar",
  "marketing-card": "Website feed card",
  "app-card": "App card",
};

const CANCELLABLE = new Set(["pending_review", "approved", "scheduled", "active"]);

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function timeLeft(until: string, now: number): string | null {
  const ms = Date.parse(until) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const n = (v: number, unit: string) => `${v} ${unit}${v === 1 ? "" : "s"}`;
  if (h >= 24) return `${n(Math.floor(h / 24), "day")} ${n(h % 24, "hour")}`;
  if (h > 0) return `${n(h, "hour")} ${n(m, "minute")}`;
  return n(m, "minute");
}

function Panel({ title, children, className = "" }: Readonly<{ title: string; children: ReactNode; className?: string }>) {
  return (
    <section className={`rounded-[var(--radius-card)] border border-sand bg-paper p-5 shadow-[var(--shadow-card)] sm:p-6 ${className}`}>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PayPanel({ campaign, onPaid }: Readonly<{ campaign: AdCampaign; onPaid: (c: AdCampaign) => void }>) {
  const now = useNow(30_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const payment = usePaymentConfirm<AdCampaign>(api.confirmAd, { onConfirmed: onPaid });
  const left = campaign.approvalExpiresAt ? timeLeft(campaign.approvalExpiresAt, now) : null;

  async function pay() {
    setBusy(true);
    setError(null);
    payment.clearNotice();
    try {
      const start = await api.adCheckout(campaign.id);
      await payment.complete(start);
    } catch (err) {
      const code = apiErrorCode(err);
      setError(code === "payments_unavailable" ? paymentErrorMessage(err, "") : adErrorMessage(err, "We couldn't start the payment. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="pay-heading" className="relative overflow-hidden rounded-[var(--radius-card)] border border-teal/30 bg-teal/[0.05] p-5 sm:p-7">
      <Eyebrow className="text-teal-text">Approved</Eyebrow>
      <h2 id="pay-heading" className="mt-2 text-2xl font-semibold text-ink">Pay to book your dates</h2>
      <p className="mt-2 max-w-[58ch] text-pretty text-sm leading-relaxed text-ink-muted">
        {left ? <>The approval holds for <strong className="font-semibold tabular-nums text-ink">{left}</strong> more. After that, the dates are released and you would need to submit again.</> : "The approval has run out. Submit the ad again to book new dates."}
      </p>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <p>
          <span className="block text-xs text-ink-faint">Total</span>
          <span className="text-3xl font-semibold tracking-tight tabular-nums text-ink">{formatGhs(campaign.price.totalPesewas)}</span>
        </p>
        <button type="button" onClick={pay} disabled={busy || payment.confirming || !left} className={buttonClass("gold")}>
          {busy || payment.confirming ? "Opening Paystack…" : "Pay with Paystack"}
        </button>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-clay-text">{error}</p>}
      <PaymentNotice notice={payment.notice} confirming={payment.confirming} onRecheck={payment.recheck} className="mt-4" />
      <p className="mt-4 text-xs text-ink-faint">Mobile Money or card. The receipt goes to the email you gave when you sent the ad.</p>
    </section>
  );
}

function CancelPanel({ campaign, onDone }: Readonly<{ campaign: AdCampaign; onDone: (c: AdCampaign) => void }>) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopping = campaign.status === "active";
  const paid = campaign.paymentStatus === "success";
  let consequence = "Nothing has been charged, so there is nothing to refund.";
  if (stopping) consequence = "The ad stops now. You get back the share of views it hasn't delivered yet, to how you paid.";
  else if (paid) consequence = "The campaign hasn't started, so you get a full refund to how you paid.";

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      onDone(await api.cancelAd(campaign.id, reason.trim() || undefined));
      setOpen(false);
    } catch (err) {
      setError(adErrorMessage(err, "We couldn't cancel the campaign. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("danger")}>
        {stopping ? "Stop campaign" : "Cancel campaign"}
      </button>
    );
  }
  return (
    <div role="group" aria-labelledby="cancel-heading" className="rounded-[var(--radius-card)] border border-clay/35 bg-clay/[0.05] p-5">
      <h3 id="cancel-heading" className="font-semibold text-ink">{stopping ? "Stop this campaign?" : "Cancel this campaign?"}</h3>
      <p className="mt-1 max-w-[56ch] text-sm leading-relaxed text-ink-muted">{consequence} This can&rsquo;t be undone.</p>
      <label className="mt-4 block text-sm font-medium text-ink" htmlFor="cancel-reason">Reason (optional)</label>
      <textarea id="cancel-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1.5 w-full resize-none rounded-lg border border-sand bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-clay focus:outline-none focus:ring-2 focus:ring-clay/15" />
      {error && <p role="alert" className="mt-2 text-sm text-clay-text">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={confirm} disabled={busy} className="inline-flex min-h-11 items-center rounded-full bg-maroon-900 px-5 text-sm font-semibold text-on-green transition-[background-color,transform] hover:bg-maroon-900/90 active:scale-[0.98] disabled:opacity-60">
          {busy ? "Working…" : stopping ? "Yes, stop it" : "Yes, cancel it"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("quiet")}>{stopping ? "Keep it running" : "Keep it"}</button>
      </div>
    </div>
  );
}

function Timeline({ campaign }: Readonly<{ campaign: AdCampaign }>) {
  const items = [...(campaign.statusHistory ?? [])].reverse();
  if (items.length === 0) return <p className="text-sm text-ink-muted">Sent on {formatDate(campaign.createdAt)}.</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-sand">
      {items.map((h) => (
        <li key={`${h.at}-${h.to}`} className="relative grid grid-cols-[11px_minmax(0,1fr)] gap-x-3">
          <span aria-hidden className="relative z-10 mt-1.5 h-[11px] w-[11px] rounded-full border-2 border-paper bg-gold-brand" />
          <div>
            <p className="text-sm font-medium text-ink">{AD_STATUS[h.to as keyof typeof AD_STATUS]?.label ?? h.to}</p>
            <p className="text-xs text-ink-faint">
              <time dateTime={h.at} className="tabular-nums">{formatDate(h.at)}</time> · {h.actorName === "advertiser" ? "You" : h.actorName === "system" ? "Oguaa" : h.actorName}
            </p>
            {h.reason && <p className="mt-1 text-sm text-ink-muted">{h.reason}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Skeletons() {
  return (
    <Container size="wide" className="py-12">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-4 h-10 w-full max-w-lg" />
      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Skeleton className="h-64 rounded-[var(--radius-card)]" />
        <div className="space-y-3"><SkeletonText lines={5} /></div>
      </div>
    </Container>
  );
}

export function Component() {
  const { id = "" } = useParams();
  const { member, loading } = useAuth();
  const location = useLocation();
  const submitted = Boolean((location.state as { submitted?: boolean } | null)?.submitted);
  const [campaign, setCampaign] = useState<AdCampaignDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [reload, setReload] = useState(0);
  usePageTitle(campaign?.creative.headline ?? "Your ad");

  useEffect(() => {
    if (!member) return;
    let alive = true;
    api.myAd(id)
      .then((c) => { if (alive) { setCampaign(c); setState("ready"); } })
      .catch((err: unknown) => {
        if (!alive) return;
        setState((err as { status?: number }).status === 404 ? "missing" : "error");
      });
    return () => { alive = false; };
  }, [id, member, reload]);

  if (loading) return <Skeletons />;
  if (!member) return <Navigate to={`/signin?next=${encodeURIComponent(`/advertise/${id}`)}`} replace />;
  if (state === "missing" || state === "error") {
    return (
      <Container className="py-20">
        <div role="alert" className="mx-auto max-w-md rounded-[var(--radius-card)] border border-sand bg-cream p-7 text-center">
          <p className="text-lg font-semibold text-ink">{state === "missing" ? "We couldn't find that ad" : "We couldn't load your ad"}</p>
          <p className="mt-2 text-sm text-ink-muted">{state === "missing" ? "It may belong to another account. Your ads are listed on your account page." : "Check your connection and try again."}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            {state === "error" && <button type="button" onClick={() => { setState("loading"); setReload((n) => n + 1); }} className={buttonClass("primary")}>Try again</button>}
            <Link to="/me/ads" className={buttonClass("quiet")}>My ads</Link>
          </div>
        </div>
      </Container>
    );
  }
  if (!campaign) return <Skeletons />;

  const c = campaign;
  const status = AD_STATUS[c.status];
  const update = (next: AdCampaign) => setCampaign((cur) => ({ ...next, daily: cur?.daily }));
  const deliveredPct = c.bookedImpressions > 0 ? Math.min(100, Math.round((c.delivered / c.bookedImpressions) * 100)) : 0;
  const title = c.creative.headline || PLACEMENT_NAME[c.placement] || "Your ad";
  const showDelivery = ["active", "paused", "completed", "removed", "cancelled"].includes(c.status) && (c.delivered > 0 || (c.daily?.length ?? 0) > 0);
  const preview = {
    format: c.creative.format ?? PLACEMENT_FORMAT[c.placement],
    imageUrl: c.creative.imageUrl,
    imageUrlDesktop: c.creative.imageUrlDesktop,
    imageUrlMobile: c.creative.imageUrlMobile,
    headline: c.creative.headline,
    body: c.creative.body,
    alt: c.creative.alt,
    chip: c.political ? "Political ad" : "Ad",
    sponsorLine: c.sponsorLine || (c.political ? "Paid for by the sponsor" : "Sponsored"),
    political: c.political,
    electionName: c.electionName,
    syntheticMedia: c.creative.containsSyntheticMedia,
  };

  return (
    <div className="pb-20">
      <header className="border-b border-sand bg-cream/60">
        <Container size="wide" className="py-8 sm:py-10">
          <Link to="/me/ads" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-green-text transition-colors hover:text-green">
            <span aria-hidden>←</span> My ads
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <AdStatusTag status={c.status} />
            <span className="text-xs tabular-nums text-ink-faint">{PLACEMENT_NAME[c.placement] ?? c.placement} · {shortDate(c.startDate)} – {shortDate(c.endDate)}</span>
          </div>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.02em] text-ink sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-[62ch] text-pretty leading-relaxed text-ink-muted">{status?.note}</p>
        </Container>
      </header>

      <Container size="wide" className="py-10">
        {submitted && c.status === "pending_review" && (
          <div role="status" className="mb-8 flex gap-3 rounded-[var(--radius-card)] border border-green/25 bg-green/[0.05] px-5 py-4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0 text-green-text" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
            <p className="text-sm leading-relaxed text-ink-muted"><strong className="font-semibold text-ink">Sent for review.</strong> We&rsquo;ll email you when a reviewer has checked it, usually within two working days. Nothing has been charged.</p>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-10">
          <div className="min-w-0 space-y-6">
            {c.status === "approved" && <PayPanel campaign={c} onPaid={update} />}
            {c.status === "rejected" && c.rejectReason && (
              <section className="rounded-[var(--radius-card)] border border-clay/30 bg-clay/[0.05] px-5 py-4">
                <h2 className="text-sm font-semibold text-ink">What the reviewer said</h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{c.rejectReason}</p>
                <Link to="/advertise?book=1" className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-teal-text hover:underline">Make a new ad →</Link>
              </section>
            )}
            {c.status === "removed" && c.removalReason && (
              <section className="rounded-[var(--radius-card)] border border-clay/30 bg-clay/[0.05] px-5 py-4">
                <h2 className="text-sm font-semibold text-ink">Why Oguaa removed it</h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{c.removalReason}</p>
              </section>
            )}

            <Panel title="Your ad, as it runs">
              <AdFrame ad={preview} why="the page it runs on" preview className={preview.format === "rect" ? "max-w-[20rem]" : ""} bannerVariant={preview.format === "banner" ? "desktop" : undefined} />
              <p className="mt-3 break-all text-xs text-ink-faint">Leads to {c.creative.landingUrl}</p>
            </Panel>

            {showDelivery && (
              <Panel title="Delivery">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <p className="text-sm text-ink-muted">
                    <span className="text-2xl font-semibold tabular-nums text-ink">{formatCount(c.delivered)}</span> of <span className="tabular-nums">{formatCount(c.bookedImpressions)}</span> viewable impressions
                  </p>
                  <p className="text-sm tabular-nums text-ink-muted">{formatCount(c.clicks)} clicks</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={deliveredPct} aria-label="Share of booked impressions delivered">
                  <div className="h-full rounded-full bg-green" style={{ width: `${deliveredPct}%` }} />
                </div>
                {c.daily && c.daily.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-ink">Views per day</h3>
                    <div className="mt-2"><DeliveryChart days={c.daily} /></div>
                  </div>
                )}
              </Panel>
            )}

            {(c.refunds?.length ?? 0) > 0 && (
              <Panel title="Refunds">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[22rem] text-left text-sm">
                    <thead className="text-xs text-ink-faint">
                      <tr><th scope="col" className="pb-2 font-medium">Date</th><th scope="col" className="pb-2 font-medium">Reason</th><th scope="col" className="pb-2 font-medium">Status</th><th scope="col" className="pb-2 text-right font-medium">Amount</th></tr>
                    </thead>
                    <tbody>
                      {c.refunds?.map((r) => (
                        <tr key={r.id} className="border-t border-sand">
                          <td className="py-2.5 tabular-nums text-ink-muted">{formatDate(r.createdAt)}</td>
                          <td className="py-2.5 text-ink">{REFUND_REASON[r.reason] ?? r.reason}</td>
                          <td className="py-2.5 text-ink-muted">{REFUND_STATUS[r.status] ?? r.status}</td>
                          <td className="py-2.5 text-right font-medium tabular-nums text-ink">{formatGhs(r.amountPesewas)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}
          </div>

          <div className="space-y-6">
            <Panel title="Price">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-ink-muted">Rate</dt><dd className="tabular-nums text-ink">{formatGhs(c.price.cpmPesewas)} per 1,000</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-ink-muted">Impressions</dt><dd className="tabular-nums text-ink">{formatCount(c.bookedImpressions)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-ink-muted">Net</dt><dd className="tabular-nums text-ink">{formatGhs(c.price.netPesewas)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-ink-muted">Tax{c.price.taxRateBps > 0 ? ` (${formatBps(c.price.taxRateBps)})` : ""}</dt><dd className="tabular-nums text-ink">{formatGhs(c.price.taxPesewas)}</dd></div>
                <div className="flex justify-between gap-4 border-t border-dashed border-sand pt-2"><dt className="font-semibold text-ink">Total</dt><dd className="font-semibold tabular-nums text-ink">{formatGhs(c.price.totalPesewas)}</dd></div>
                {c.refundedPesewas > 0 && <div className="flex justify-between gap-4"><dt className="text-ink-muted">Refunded</dt><dd className="tabular-nums text-green-text">{formatGhs(c.refundedPesewas)}</dd></div>}
              </dl>
              {c.paymentStatus === "success" && c.paidAt && <p className="mt-3 text-xs text-ink-faint">Paid on {formatDate(c.paidAt)}{c.simulated ? " (test payment)" : ""}.</p>}
            </Panel>

            <Panel title="Timeline"><Timeline campaign={c} /></Panel>

            {CANCELLABLE.has(c.status) && <CancelPanel campaign={c} onDone={update} />}
            <p className="text-xs leading-relaxed text-ink-faint">Questions about this ad? Email hello@oguaaman.com and quote <span className="tabular-nums">{c.id}</span>.</p>
          </div>
        </div>
      </Container>
    </div>
  );
}
