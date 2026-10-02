import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, EmptyGlyph } from "@/components/empty-state";
import { PaymentNotice } from "@/components/payment-notice";
import { Skeleton } from "@/components/skeleton";
import { api } from "@/lib/api";
import { adImage, formatCount, formatGhs, shortDate } from "@/lib/ads";
import type { AdCampaign } from "@/lib/types";
import type { PaymentConfirm } from "@/lib/use-payment-confirm";
import { AdStatusTag } from "./fields";

// The "My ads" tab on the account page: every campaign the member booked, with
// what needs doing next. The ad payment confirm lives on the page (it must run
// whichever tab is open); this list shows its result.

const PLACEMENT_NAME: Record<string, string> = {
  "portal-home-banner": "Home banner",
  "portal-feed-card": "News and events feed",
  "portal-article-rect": "Beside articles",
  "marketing-card": "oguaaman.com",
  "app-card": "Oguaa app",
};

function thumb(c: AdCampaign): string | undefined {
  if (c.creative.format === "banner") return adImage(c.creative.imageUrlMobile ?? c.creative.imageUrlDesktop, 160, 50);
  if (c.creative.format === "rect") return adImage(c.creative.imageUrl, 150, 125);
  return adImage(c.creative.imageUrl, 160, 84);
}

function Row({ c }: Readonly<{ c: AdCampaign }>) {
  const src = thumb(c);
  const pay = c.status === "approved";
  return (
    <li>
      <Link
        to={`/advertise/${c.id}`}
        className={`group grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 rounded-xl border p-3 transition-[border-color,background-color,transform] duration-200 active:translate-y-px sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-center ${pay ? "border-teal/40 bg-teal/[0.04] hover:border-teal" : "border-sand bg-paper hover:border-green/40"}`}
      >
        <span className="block aspect-[1200/628] overflow-hidden rounded-[3px] bg-sand">
          {src && <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />}
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <AdStatusTag status={c.status} />
            {c.political && <span className="rounded-sm bg-ink px-1.5 py-px text-[0.6rem] font-bold uppercase tracking-[0.12em] text-paper">Political</span>}
          </span>
          <span className="mt-1.5 line-clamp-2 font-semibold leading-snug text-ink group-hover:text-green-text">{c.creative.headline || c.sponsorLine || PLACEMENT_NAME[c.placement]}</span>
          <span className="mt-0.5 block text-xs tabular-nums text-ink-faint">
            {PLACEMENT_NAME[c.placement] ?? c.placement} · {shortDate(c.startDate)} – {shortDate(c.endDate)}
          </span>
        </span>
        <span className="col-span-2 flex items-center justify-between gap-4 border-t border-sand pt-2 text-sm sm:col-span-1 sm:block sm:border-0 sm:pt-0 sm:text-right">
          <span className="block font-semibold tabular-nums text-ink">{formatGhs(c.price.totalPesewas)}</span>
          <span className="block text-xs tabular-nums text-ink-faint">
            {pay ? <span className="font-semibold text-teal-text">Ready to pay →</span> : `${formatCount(c.delivered)} / ${formatCount(c.bookedImpressions)} views`}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function MyAds({ payment }: Readonly<{ payment: PaymentConfirm<AdCampaign> }>) {
  const [ads, setAds] = useState<AdCampaign[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const confirmedId = payment.confirmed?.id;

  useEffect(() => {
    let alive = true;
    api.myAds()
      .then((list) => { if (alive) { setAds(list); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [attempt, confirmedId]);

  const confirmed = payment.confirmed;
  return (
    <div className="space-y-4">
      {confirmed && (
        <div role="status" className="rounded-xl border border-green/25 bg-green/[0.06] px-4 py-3 text-sm text-ink-muted">
          <strong className="font-semibold text-ink">Payment received.</strong> Your ad is booked from {shortDate(confirmed.startDate)} to {shortDate(confirmed.endDate)}.
        </div>
      )}
      <PaymentNotice notice={payment.notice} confirming={payment.confirming} onRecheck={payment.recheck} />

      {failed && (
        <div role="alert" className="rounded-xl border border-clay/30 bg-clay/[0.05] px-4 py-3 text-sm">
          <p className="text-ink">We couldn&rsquo;t load your ads.</p>
          <button type="button" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }} className="mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-teal-text hover:underline">Try again</button>
        </div>
      )}
      {!ads && !failed && (
        <ul aria-hidden className="space-y-3">
          {["a", "b"].map((k) => <li key={k}><Skeleton className="h-24 w-full rounded-xl" /></li>)}
        </ul>
      )}
      {ads && ads.length === 0 && (
        <EmptyState
          icon={<EmptyGlyph name="megaphone" />}
          title="No ads yet"
          description="Put your shop, event or cause in front of Cape Coast. One public price, and you pay only after review."
          actions={<Link to="/advertise" className="inline-flex min-h-11 items-center rounded-full bg-green px-5 text-sm font-semibold text-on-green transition-[background-color,transform] hover:bg-green-900 active:scale-[0.98]">Advertise on Oguaa</Link>}
        />
      )}
      {ads && ads.length > 0 && (
        <>
          <ul className="space-y-3">{ads.map((c) => <Row key={c.id} c={c} />)}</ul>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-sm">
            <Link to="/advertise?book=1" className="inline-flex min-h-11 items-center font-semibold text-green-text hover:underline">+ Book another ad</Link>
            <Link to="/ads/library" className="inline-flex min-h-11 items-center text-ink-muted hover:text-ink hover:underline">Ad library</Link>
          </div>
        </>
      )}
    </div>
  );
}
