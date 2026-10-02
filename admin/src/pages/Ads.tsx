import { Link, useLoaderData, useNavigation, useSearchParams, type LoaderFunctionArgs } from "react-router-dom";
import { useState } from "react";
import { api, type AdQueueArgs } from "@/lib/api";
import type { AdCampaign, AdListPage, AdPlacementSlug, AdStatus } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { isCuratorOrAbove } from "@/lib/roles";
import { PageHeader, Card, Empty, Select } from "@/components/ui";
import { FlagChip, Notice, ReasonAction, ToneChip } from "@/components/admin-kit";
import { AdThumb } from "@/components/ad-creative";
import { Pagination } from "@/components/pagination";
import { TableRowsSkeleton } from "@/components/skeleton";
import { AD_STATUS_LABEL, AD_STATUS_ORDER, AD_STATUS_TONE, PLACEMENTS, deliveredShare, flagLabel, placementName, refundNeedsAttention } from "@/lib/ads";
import { cedis, count, formatDate } from "@/lib/format";
import { describeError } from "@/lib/errors";
import { btnDanger, btnDangerOutline, segmentCls, tableHeadCls } from "@/lib/ui-classes";

const DEFAULT_STATUS: AdStatus = "pending_review";
const ALL = "all";

interface QueueState { status: string; political: AdQueueArgs["political"]; placement: AdPlacementSlug | ""; page: number }
interface Data { page: AdListPage; args: QueueState }

export async function loader({ request }: LoaderFunctionArgs): Promise<Data> {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? DEFAULT_STATUS;
  const political = (url.searchParams.get("political") ?? "") as AdQueueArgs["political"];
  const placement = (url.searchParams.get("placement") ?? "") as AdPlacementSlug | "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const result = await api.adsQueue({ status: status === ALL ? "" : (status as AdStatus), political, placement, page });
  return { page: result, args: { status, political, placement, page } };
}

function approvalsNote(ad: AdCampaign): string | null {
  if (ad.status !== "pending_review" || !ad.political) return null;
  const n = ad.approvals?.length ?? 0;
  return n === 1 ? "Approval 1 of 2" : null;
}

/** Flags shown as their own chip in the row, so the generic list skips them. */
const OWN_CHIP_FLAGS = new Set(["political", "refund_needs_attention"]);

function Row({ ad }: Readonly<{ ad: AdCampaign }>) {
  const share = deliveredShare(ad);
  const note = approvalsNote(ad);
  const flags = ad.flags ?? [];
  const refundAttention = refundNeedsAttention(ad) || flags.includes("refund_needs_attention");
  return (
    <tr className="group align-top transition-colors hover:bg-paper">
      <td className="px-4 py-3">
        <Link to={`/ads/${ad.id}`} className="flex items-start gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60">
          <AdThumb ad={ad} />
          <span className="min-w-0">
            <span className="block max-w-[15rem] truncate font-semibold text-ink underline-offset-4 group-hover:underline">{ad.sponsorLine || ad.sponsor?.displayName || "Sponsor pending"}</span>
            <span className="mt-0.5 block max-w-[15rem] truncate text-xs text-ink-muted">{ad.creative.headline || ad.creative.alt}</span>
          </span>
        </Link>
      </td>
      <td className="px-4 py-3 text-ink-muted">{placementName(ad.placement)}</td>
      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-muted">{formatDate(ad.startDate)}<span className="block text-xs text-ink-faint">to {formatDate(ad.endDate)}</span></td>
      <td className="px-4 py-3">
        <p className="whitespace-nowrap text-right tabular-nums text-ink">{count(ad.delivered)} <span className="text-ink-faint">/ {count(ad.bookedImpressions)}</span></p>
        <div className="ml-auto mt-1.5 h-1 w-24 overflow-hidden rounded-full bg-sand" aria-hidden>
          <div className="h-full w-full origin-left rounded-full bg-gold-brand" style={{ transform: `scaleX(${share})` }} />
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-ink">{cedis(ad.price.totalPesewas)}</td>
      <td className="px-4 py-3"><ToneChip tone={AD_STATUS_TONE[ad.status]}>{AD_STATUS_LABEL[ad.status]}</ToneChip></td>
      <td className="px-4 py-3">
        <div className="flex max-w-[11rem] flex-wrap gap-1">
          {ad.political && <FlagChip tone="clay">Political</FlagChip>}
          {note && <FlagChip tone="gold">{note}</FlagChip>}
          {refundAttention && <FlagChip tone="maroon">Refund needs attention</FlagChip>}
          {ad.simulated && <FlagChip tone="neutral">Test payment</FlagChip>}
          {flags.filter((f) => !OWN_CHIP_FLAGS.has(f)).map((f) => <FlagChip key={f} tone="gold">{flagLabel(f)}</FlagChip>)}
          {(ad.reportsCount ?? 0) > 0 && <FlagChip tone="clay">{ad.reportsCount} report{ad.reportsCount === 1 ? "" : "s"}</FlagChip>}
        </div>
      </td>
    </tr>
  );
}

/** Curator-only emergency stop: pauses every running or scheduled political ad. */
function KillSwitch() {
  const [result, setResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  return (
    <section aria-labelledby="kill-title" className="mt-8 rounded-[var(--radius-card)] border border-maroon-text/25 bg-maroon-900/[0.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[60ch]">
          <h2 id="kill-title" className="text-base font-semibold text-ink">Pause every political ad</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted [text-wrap:pretty]">
            For an emergency such as an unexpected blackout or a legal notice. Running and scheduled political campaigns move to Paused; dates are not extended. To stop one sponsor, suspend them from <Link to="/ad-sponsors" className="font-medium text-green-text underline underline-offset-4">Ad sponsors</Link>.
          </p>
        </div>
        <div className="w-full sm:w-80">
          <ReasonAction
            label="Pause political ads"
            confirmLabel="Pause them now"
            placeholder="Why, for the record (e.g. EC directive of 2 Oct)"
            buttonClass={btnDangerOutline}
            confirmClass={btnDanger}
            busyLabel="Pausing political ads"
            onConfirm={async (reason) => {
              try {
                const res = await api.killAds({ scope: "political", reason });
                setResult({ tone: "ok", text: `${count(res.paused)} political campaign${res.paused === 1 ? "" : "s"} paused.` });
              } catch (e) {
                throw new Error(describeError(e, {}, "We couldn't pause the political ads. Try again."), { cause: e });
              }
            }}
          />
        </div>
      </div>
      {result && <div className="mt-3"><Notice tone={result.tone} onDismiss={() => setResult(null)}>{result.text}</Notice></div>}
    </section>
  );
}

export function Component() {
  const { page, args } = useLoaderData() as Data;
  const { member } = useAuth();
  const [, setParams] = useSearchParams();
  const navigation = useNavigation();
  const loading = navigation.state === "loading" && navigation.location?.pathname === "/ads";
  const totalPages = Math.max(1, Math.ceil(page.total / Math.max(1, page.perPage)));

  const go = (next: Partial<typeof args>) => {
    const merged = { ...args, page: 1, ...next };
    const p = new URLSearchParams();
    if (merged.status !== DEFAULT_STATUS) p.set("status", merged.status);
    if (merged.political) p.set("political", merged.political);
    if (merged.placement) p.set("placement", merged.placement);
    if ((merged.page ?? 1) > 1) p.set("page", String(merged.page));
    setParams(p);
  };

  const waiting = page.counts.pending_review ?? 0;

  return (
    <>
      <PageHeader
        tone="gold"
        kicker="Monetization"
        title="Ads"
        lede="Every ad is reviewed before the advertiser pays. Approve only what is clearly an ad, from a verified sponsor, pointing where it says."
      >
        {waiting > 0 && <span className="rounded-full bg-gold/[0.16] px-3 py-1 text-sm font-semibold tabular-nums text-gold-text">{count(waiting)} awaiting review</span>}
      </PageHeader>

      <nav aria-label="Filter by status" className="mb-3">
        <div className="flex flex-wrap gap-1 rounded-[1.4rem] border border-sand bg-paper p-1 sm:inline-flex">
          {AD_STATUS_ORDER.map((s) => (
            <button key={s} type="button" aria-pressed={args.status === s} onClick={() => go({ status: s })} className={segmentCls(args.status === s)}>
              {AD_STATUS_LABEL[s]}
              <span className={`tabular-nums ${args.status === s ? "text-on-green/70" : "text-ink-faint"}`}>{count(page.counts[s] ?? 0)}</span>
            </button>
          ))}
          <button type="button" aria-pressed={args.status === ALL} onClick={() => go({ status: ALL })} className={segmentCls(args.status === ALL)}>All</button>
        </div>
      </nav>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select aria-label="Political or commercial" value={args.political ?? ""} onValueChange={(v) => go({ political: v as AdQueueArgs["political"] })} className="w-48">
          <option value="">Commercial and political</option>
          <option value="1">Political only</option>
          <option value="0">Commercial only</option>
        </Select>
        <Select aria-label="Placement" value={args.placement ?? ""} onValueChange={(v) => go({ placement: v as AdPlacementSlug | "" })} className="w-56">
          <option value="">All placements</option>
          {PLACEMENTS.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </Select>
      </div>

      {page.items.length === 0 && !loading ? (
        <Empty icon={args.status === DEFAULT_STATUS ? "check" : "megaphone"} title={args.status === DEFAULT_STATUS ? "No ads waiting for review" : "No ads match these filters"}>
          {args.status === DEFAULT_STATUS
            ? "New submissions appear here. Advertisers can only pay after an ad is approved."
            : "Try another status or clear the filters."}
        </Empty>
      ) : (
        <Card className="overflow-x-auto shadow-[var(--shadow-card)]">
          <table className="w-full min-w-[58rem] text-sm">
            <caption className="sr-only">Ad campaigns</caption>
            <thead>
              <tr className={tableHeadCls}>
                <th scope="col" className="px-4 py-3">Creative and sponsor</th>
                <th scope="col" className="px-4 py-3">Placement</th>
                <th scope="col" className="px-4 py-3">Dates</th>
                <th scope="col" className="px-4 py-3 text-right">Impressions</th>
                <th scope="col" className="px-4 py-3 text-right">Total</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Flags</th>
              </tr>
            </thead>
            {loading ? <TableRowsSkeleton rows={6} columns={7} label="Loading ads" /> : (
              <tbody className="divide-y divide-sand">
                {page.items.map((ad) => <Row key={ad.id} ad={ad} />)}
              </tbody>
            )}
          </table>
        </Card>
      )}

      <Pagination page={page.page} totalPages={totalPages} onChange={(p) => go({ page: p })} total={page.total} pageSize={page.perPage} disabled={loading} />

      {isCuratorOrAbove(member?.role) && <KillSwitch />}
    </>
  );
}
