import { useState } from "react";
import { useLoaderData, useNavigation, useSearchParams, type LoaderFunctionArgs } from "react-router-dom";
import { api } from "@/lib/api";
import type { AdReport, AdReportRow, AdReportTotals } from "@/lib/types";
import { PageHeader, Card, Empty } from "@/components/ui";
import { FieldError } from "@/components/admin-kit";
import { TableRowsSkeleton } from "@/components/skeleton";
import { placementName } from "@/lib/ads";
import { cedis, count, formatDate, percent, todayAccra } from "@/lib/format";
import { btnPrimary, inputCls, labelCls, tableHeadCls } from "@/lib/ui-classes";

interface Data { report: AdReport; from: string; to: string }

function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export async function loader({ request }: LoaderFunctionArgs): Promise<Data> {
  const url = new URL(request.url);
  const today = todayAccra();
  const from = url.searchParams.get("from") ?? monthStart(today);
  const to = url.searchParams.get("to") ?? today;
  const report = await api.adReport(from, to);
  return { report, from, to };
}

type Metrics = Omit<AdReportRow, "slug">;

function Cells({ m }: Readonly<{ m: Metrics }>) {
  const td = "whitespace-nowrap px-4 py-3 text-right tabular-nums";
  return (
    <>
      <td className={td}>{count(m.opportunities)}</td>
      <td className={td}>{count(m.billableImpressions)}</td>
      <td className={`${td} text-ink-faint`}>{count(m.unbilledImpressions)}</td>
      <td className={td}>{count(m.clicks)}</td>
      <td className={td}>{percent(m.ctr, 2)}</td>
      <td className={td}>{percent(m.fillRate)}</td>
      <td className={`${td} font-semibold`}>{cedis(m.recognizedNetPesewas)}</td>
      <td className={td}>{cedis(m.rpmPesewas)}</td>
    </>
  );
}

function MoneyStrip({ totals }: Readonly<{ totals: AdReportTotals }>) {
  const items: [string, string, string][] = [
    ["Cash collected", cedis(totals.cashCollectedPesewas), "Payments confirmed in the range, tax included"],
    ["Refunded", cedis(totals.refundedPesewas), "Processed refunds"],
    ["Tax collected", cedis(totals.taxCollectedPesewas), "Held for VAT, NHIL and GETFund"],
    ["Booked, not yet delivered", count(totals.bookedRemaining), "Impressions still owed"],
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-sand bg-sand shadow-[var(--shadow-card)] lg:grid-cols-4">
      {items.map(([label, value, note]) => (
        <div key={label} className="bg-cream p-4">
          <dt className="text-xs font-medium text-ink-muted">{label}</dt>
          <dd className="mt-1 text-xl font-semibold tracking-[-0.01em] tabular-nums text-ink">{value}</dd>
          <p className="mt-0.5 text-xs text-ink-faint">{note}</p>
        </div>
      ))}
    </dl>
  );
}

export function Component() {
  const { report, from, to } = useLoaderData() as Data;
  const [, setParams] = useSearchParams();
  const navigation = useNavigation();
  const loading = navigation.state === "loading" && navigation.location?.pathname === "/ad-report";
  const [range, setRange] = useState({ from, to });
  const [error, setError] = useState("");
  const rows = report.placements ?? [];
  const t = report.totals;
  const hasData = rows.some((r) => r.opportunities > 0 || r.billableImpressions > 0) || (t?.cashCollectedPesewas ?? 0) > 0;

  function apply() {
    if (!range.from || !range.to) { setError("Choose both dates."); return; }
    if (range.from > range.to) { setError("The start date must be on or before the end date."); return; }
    setError("");
    setParams({ from: range.from, to: range.to });
  }

  return (
    <>
      <PageHeader tone="gold" kicker="Monetization" title="Ad report" lede="Delivery and income for each placement. RPM is income per 1,000 opportunities, a report figure only; advertisers buy on the CPM rate card." />

      <form
        className="mb-6 flex flex-wrap items-end gap-3"
        onSubmit={(e) => { e.preventDefault(); apply(); }}
        aria-label="Date range"
      >
        <div>
          <label htmlFor="rep-from" className={labelCls}>From</label>
          <input id="rep-from" type="date" value={range.from} max={range.to || undefined} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className={`${inputCls} tabular-nums`} />
        </div>
        <div>
          <label htmlFor="rep-to" className={labelCls}>To</label>
          <input id="rep-to" type="date" value={range.to} min={range.from || undefined} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className={`${inputCls} tabular-nums`} />
        </div>
        <button type="submit" className={btnPrimary}>Show report</button>
        <p className="w-full text-xs text-ink-faint sm:w-auto sm:self-center">Showing {formatDate(from)} to {formatDate(to)}, Accra days</p>
        <FieldError>{error}</FieldError>
      </form>

      {!hasData && !loading ? (
        <Empty icon="chart" title="No ad activity in this range">Opportunities are counted whenever a page with an ad slot loads, so this fills in once ads are switched on.</Empty>
      ) : (
        <div className="space-y-6">
          {t && <MoneyStrip totals={t} />}

          <Card className="overflow-x-auto shadow-[var(--shadow-card)]">
            <table className="w-full min-w-[60rem] text-sm">
              <caption className="sr-only">Ad delivery and income by placement</caption>
              <thead>
                <tr className={tableHeadCls}>
                  <th scope="col" className="px-4 py-3">Placement</th>
                  <th scope="col" className="px-4 py-3 text-right">Opportunities</th>
                  <th scope="col" className="px-4 py-3 text-right">Billable</th>
                  <th scope="col" className="px-4 py-3 text-right">Unbilled</th>
                  <th scope="col" className="px-4 py-3 text-right">Clicks</th>
                  <th scope="col" className="px-4 py-3 text-right">CTR</th>
                  <th scope="col" className="px-4 py-3 text-right">Fill rate</th>
                  <th scope="col" className="px-4 py-3 text-right">Recognised net</th>
                  <th scope="col" className="px-4 py-3 text-right">RPM</th>
                </tr>
              </thead>
              {loading ? <TableRowsSkeleton rows={5} columns={9} label="Loading the report" /> : (
                <>
                  <tbody className="divide-y divide-sand text-ink">
                    {rows.map((r) => (
                      <tr key={r.slug} className="transition-colors hover:bg-paper">
                        <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-semibold">{placementName(r.slug)}</th>
                        <Cells m={r} />
                      </tr>
                    ))}
                  </tbody>
                  {t && (
                    <tfoot className="border-t-2 border-sand bg-paper font-semibold text-ink">
                      <tr>
                        <th scope="row" className="px-4 py-3 text-left">Total</th>
                        <Cells m={t} />
                      </tr>
                    </tfoot>
                  )}
                </>
              )}
            </table>
          </Card>

          {t && (
            <section aria-labelledby="political-title" className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-clay/25 bg-clay/[0.05] p-5">
              <div className="max-w-[60ch]">
                <h2 id="political-title" className="text-base font-semibold text-ink">Political advertising</h2>
                <p className="mt-0.5 text-sm text-ink-muted [text-wrap:pretty]">Recognised net income from political campaigns, kept apart for transparency. It is included in the totals above.</p>
              </div>
              <p className="text-2xl font-semibold tracking-[-0.01em] tabular-nums text-ink">{cedis(t.politicalNetPesewas)}</p>
            </section>
          )}
        </div>
      )}
    </>
  );
}
